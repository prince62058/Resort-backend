import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
export async function verifyPassword(password, stored) {
  const [salt, key] = stored.split(':');
  const computed = (await scrypt(password, salt, 64)).toString('hex');
  return equal(computed, key);
}
export function createAuth(cms, {
  setupToken = () => process.env.ADMIN_SETUP_TOKEN,
  production = () => process.env.NODE_ENV === 'production'
} = {}) {
  const cookieName = () => production() ? '__Host-nest_admin' : 'nest_admin';
  const cookieOptions = () => ({
    httpOnly: true,
    secure: production(),
    sameSite: 'strict',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  });
  async function limit(req, res, next) {
    try {
      const db = await cms.db();
      const bucket = Math.floor(Date.now() / 900000);
      const keys = [hash(req.ip || 'unknown'), hash(String(req.body?.email || '').trim().toLowerCase())];
      for (const key of keys) {
        const counter = await db.collection('cms_limits').findOneAndUpdate({
          _id: 'auth:' + bucket + ':' + key
        }, {
          $inc: {
            count: 1
          },
          $set: {
            expiresAt: new Date(Date.now() + 1800000)
          }
        }, {
          upsert: true,
          returnDocument: 'after'
        });
        if (counter.count > 20) return res.status(429).json({
          error: 'Too many attempts. Please try again in 15 minutes.'
        });
      }
      next();
    } catch (e) {
      next(e);
    }
  }
  function sameOrigin(req, res, next) {
    if (req.get('X-CMS-Request') !== '1') return res.status(403).json({
      error: 'Invalid admin request.'
    });
    try {
      const origin = req.get('origin');
      if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({
        error: 'Cross-site request rejected.'
      });
    } catch {
      return res.status(403).end();
    }
    next();
  }
  async function session(req, res, next) {
    const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(p => p.trim().split('=')));
    const token = cookies[cookieName()];
    if (!token || !/^\w{64}$/.test(token)) return res.status(401).json({
      error: 'Sign in to continue.'
    });
    try {
      const db = await cms.db();
      const saved = await db.collection('cms_sessions').findOne({
        _id: hash(token),
        expiresAt: {
          $gt: new Date()
        }
      });
      if (!saved) return res.status(401).json({
        error: 'Your session has expired. Please sign in again.'
      });
      req.admin = {
        email: saved.email
      };
      req.session = saved;
      if (!['GET', 'HEAD'].includes(req.method) && !equal(req.get('X-CSRF-Token'), saved.csrf)) return res.status(403).json({
        error: 'Refresh the panel and try again.'
      });
      next();
    } catch (e) {
      next(e);
    }
  }
  async function issue(res, email) {
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(32).toString('hex');
    const db = await cms.db();
    await db.collection('cms_sessions').insertOne({
      _id: hash(token),
      email,
      csrf,
      expiresAt: new Date(Date.now() + 8 * 3600000)
    });
    res.cookie(cookieName(), token, cookieOptions());
    res.json({
      user: {
        email
      },
      csrf
    });
  }
  function credentials(body) {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body?.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      const e = new Error('Use a valid email and a password of 12–128 characters.');
      e.status = 400;
      throw e;
    }
    return {
      email,
      password
    };
  }
  async function login(req, res) {
    const {
      email,
      password
    } = credentials(req.body);
    const db = await cms.db();
    const user = await db.collection('cms_users').findOne({
      _id: 'owner',
      email
    });
    const valid = await verifyPassword(password, user?.passwordHash || '00000000000000000000000000000000:' + '0'.repeat(128));
    if (!user || !valid) return res.status(401).json({
      error: 'Email or password is incorrect.'
    });
    await issue(res, email);
  }
  async function setup(req, res) {
    const expected = setupToken();
    if (!expected || expected.length < 32 || !equal(req.body?.setupToken, expected)) return res.status(403).json({
      error: 'A valid private setup token is required.'
    });
    const {
        email,
        password
      } = credentials(req.body),
      db = await cms.db();
    try {
      await db.collection('cms_users').insertOne({
        _id: 'owner',
        email,
        passwordHash: await passwordHash(password),
        createdAt: new Date()
      });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({
        error: 'The owner account already exists. Please sign in.'
      });
      throw e;
    }
    await cms.initialize();
    await issue(res, email);
  }
  async function changePassword(req, res) {
    const {
      password
    } = credentials({
      email: req.admin.email,
      password: req.body.password
    });
    const db = await cms.db(),
      users = db.collection('cms_users'),
      user = await users.findOne({
        _id: 'owner'
      });
    if (typeof req.body.currentPassword !== 'string' || req.body.currentPassword.length > 128 || !(await verifyPassword(req.body.currentPassword, user.passwordHash))) return res.status(400).json({
      error: 'Current password is incorrect.'
    });
    await users.updateOne({
      _id: 'owner'
    }, {
      $set: {
        passwordHash: await passwordHash(password)
      }
    });
    await db.collection('cms_sessions').deleteMany({
      email: req.admin.email
    });
    await issue(res, req.admin.email);
  }
  async function logout(req, res) {
    await (await cms.db()).collection('cms_sessions').deleteOne({
      _id: req.session._id
    });
    res.clearCookie(cookieName(), cookieOptions());
    res.json({
      ok: true
    });
  }
  return {
    limit,
    sameOrigin,
    session,
    login,
    setup,
    changePassword,
    logout
  };
}
