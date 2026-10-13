import express from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp from 'sharp';
import { createAuth } from './auth.js';
import { parseContent } from './schema.js';
import { slugify } from '../../shared/content.js';
export function createCmsRouter(cms, getStore, authOptions, invalidateMedia = async () => {}) {
  const router = express.Router();
  const auth = createAuth(cms, authOptions);
  router.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow'
    });
    next();
  });
  router.use(express.json({
    limit: '2mb'
  }));
  router.get('/status', async (req, res) => {
    const db = await cms.db();
    res.json({
      setupRequired: !(await db.collection('cms_users').findOne({
        _id: 'owner'
      }, {
        projection: {
          _id: 1
        }
      }))
    });
  });
  router.post('/login', auth.sameOrigin, auth.limit, auth.login);
  router.post('/setup', auth.sameOrigin, auth.limit, auth.setup);
  router.use(auth.session);
  router.use((req, res, next) => ['GET', 'HEAD'].includes(req.method) ? next() : auth.sameOrigin(req, res, next));
  router.get('/session', (req, res) => res.json({
    user: req.admin,
    csrf: req.session.csrf
  }));
  router.post('/logout', auth.logout);
  router.post('/password', auth.limit, auth.changePassword);
  router.get('/content', async (req, res) => {
    const d = await cms.document();
    res.json({
      content: d.draft,
      version: d.version,
      publishedAt: d.publishedAt,
      updatedAt: d.updatedAt
    });
  });
  router.put('/content', async (req, res) => {
    if (!Number.isInteger(req.body.version) || typeof req.body.publish !== 'boolean') return res.status(400).json({
      error: 'Invalid save request.'
    });
    const content = parseContent(req.body.content);
    const d = await cms.save(content, req.body.version, req.body.publish, req.admin);
    res.json({
      content: d.draft,
      version: d.version,
      publishedAt: d.publishedAt,
      updatedAt: d.updatedAt
    });
  });
  router.get('/revisions', async (req, res) => {
    const db = await cms.db();
    res.json({
      items: await db.collection('cms_revisions').find({}, {
        projection: {
          content: 0
        }
      }).sort({
        at: -1
      }).limit(20).toArray()
    });
  });
  router.get('/revisions/:version', async (req, res) => {
    const db = await cms.db();
    const revision = await db.collection('cms_revisions').findOne({
      version: Number(req.params.version)
    });
    if (!revision) return res.status(404).json({
      error: 'Revision not found.'
    });
    res.json({
      content: revision.content
    });
  });
  router.get('/enquiries', async (req, res) => {
    const db = await cms.db();
    const page = Math.min(10000, Math.max(1, Number(req.query.page) || 1));
    const query = ['new', 'in-progress', 'closed'].includes(req.query.status) ? {
      status: req.query.status
    } : {};
    const [items, total] = await Promise.all([db.collection('cms_enquiries').find(query).sort({
      createdAt: -1
    }).skip((page - 1) * 30).limit(30).toArray(), db.collection('cms_enquiries').countDocuments(query)]);
    res.json({
      items,
      total,
      page
    });
  });
  router.patch('/enquiries/:id', async (req, res) => {
    if (!['new', 'in-progress', 'closed'].includes(req.body.status) || typeof req.body.notes !== 'string' || req.body.notes.length > 5000) return res.status(400).json({
      error: 'Choose a valid status and a note under 5,000 characters.'
    });
    const db = await cms.db();
    const result = await db.collection('cms_enquiries').updateOne({
      _id: req.params.id
    }, {
      $set: {
        status: req.body.status,
        notes: req.body.notes
      }
    });
    res.status(result.matchedCount ? 200 : 404).json({
      ok: Boolean(result.matchedCount)
    });
  });
  router.post('/media', express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    limit: '12mb'
  }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({
      error: 'Upload a JPG, PNG, WebP or AVIF image under 12 MB.'
    });
    const folder = String(req.query.folder || 'general');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder) || folder.length > 70) return res.status(400).json({
      error: 'Use a short folder name with letters, numbers and hyphens.'
    });
    let bytes;
    try {
      bytes = await sharp(req.body, {
        limitInputPixels: 40000000,
        animated: false
      }).rotate().resize({
        width: 2560,
        height: 2560,
        fit: 'inside',
        withoutEnlargement: true
      }).webp({
        quality: 88
      }).toBuffer();
    } catch {
      return res.status(400).json({
        error: 'This image could not be read. Use a valid JPG, PNG, WebP or AVIF.'
      });
    }
    const name = (slugify(String(req.query.name || 'image').replace(/\.[^.]+$/, '')) || 'image') + '-' + randomUUID().slice(0, 8) + '.webp';
    const path = 'uploads/' + folder + '/' + name,
      sha256 = createHash('sha256').update(bytes).digest('hex');
    const {
      bucket,
      assets
    } = await getStore();
    const stream = bucket.openUploadStream(path, {
      metadata: {
        folder: 'uploads/' + folder,
        sha256,
        contentType: 'image/webp'
      }
    });
    await pipeline(Readable.from([bytes]), stream);
    const item = {
      path,
      folder: 'uploads/' + folder,
      name,
      bytes: bytes.length,
      contentType: 'image/webp',
      sha256,
      fileId: stream.id,
      alt: '',
      createdAt: new Date()
    };
    try {
      await assets.insertOne(item);
    } catch (e) {
      await bucket.delete(stream.id);
      throw e;
    }
    res.status(201).json({
      path,
      url: '/assets/' + path
    });
  });
  router.delete('/media', async (req, res) => {
    const path = req.body?.path;
    if (typeof path !== 'string' || !path.startsWith('uploads/')) return res.status(400).json({
      error: 'Original resort assets are retained. Only new uploads can be removed.'
    });
    const doc = await cms.document();
    if (JSON.stringify([doc.draft, doc.published]).includes(JSON.stringify(path))) return res.status(409).json({
      error: 'This image is used in saved content. Replace it and publish before removing it.'
    });
    const {
      assets,
      bucket
    } = await getStore();
    const asset = await assets.findOne({
      path
    });
    if (!asset) return res.status(404).json({
      error: 'Image not found.'
    });
    await bucket.delete(asset.fileId);
    await assets.deleteOne({
      path
    });
    await invalidateMedia(path);
    res.json({
      ok: true
    });
  });
  return router;
}
export function createEnquiryRouter(cms) {
  const router = express.Router();
  router.use(express.json({
    limit: '20kb'
  }));
  router.post('/', async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(200).json({
      ok: true
    });
    const type = ['contact', 'reservation', 'newsletter'].includes(b.type) ? b.type : null;
    const str = (v, n) => typeof v === 'string' && v.length <= n;
    if (!type || !str(b.email || '', 254) || !str(b.name || '', 120) || !str(b.phone || '', 50) || !str(b.message || '', 5000)) return res.status(400).json({
      error: 'Please check the form fields.'
    });
    if (type !== 'reservation' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email || '')) return res.status(400).json({
      error: 'Enter a valid email address.'
    });
    if (type !== 'newsletter' && !(b.name || '').trim()) return res.status(400).json({
      error: 'Please enter your name.'
    });
    if (type === 'contact' && !(b.message || '').trim()) return res.status(400).json({
      error: 'Please include your message.'
    });
    if (type === 'reservation' && (!/^\d{4}-\d{2}-\d{2}$/.test(b.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(b.checkOut) || b.checkIn < new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Kolkata'
    }) || b.checkOut <= b.checkIn || !Number.isInteger(b.guests) || b.guests < 1 || b.guests > 100 || !str(b.room, 180) || !(b.phone || b.email))) return res.status(400).json({
      error: 'Check your dates, guest count and contact details.'
    });
    const db = await cms.db(),
      bucket = Math.floor(Date.now() / 3600000),
      key = createHash('sha256').update(req.ip || 'unknown').digest('hex');
    const limit = await db.collection('cms_limits').findOneAndUpdate({
      _id: 'enquiry:' + bucket + ':' + key
    }, {
      $inc: {
        count: 1
      },
      $set: {
        expiresAt: new Date(Date.now() + 7200000)
      }
    }, {
      upsert: true,
      returnDocument: 'after'
    });
    if (limit.count > 15) return res.status(429).json({
      error: 'Too many enquiries. Please contact the resort by phone.'
    });
    const entry = {
      _id: randomUUID(),
      type,
      name: b.name || '',
      email: b.email || '',
      phone: b.phone || '',
      message: b.message || '',
      status: 'new',
      notes: '',
      createdAt: new Date()
    };
    if (type === 'reservation') Object.assign(entry, {
      room: b.room,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guests: b.guests
    });
    if (type === 'newsletter') entry.consent = 'Requested resort news and updates through the newsletter form';
    await db.collection('cms_enquiries').insertOne(entry);
    res.status(201).json({
      ok: true,
      id: entry._id
    });
  });
  return router;
}
