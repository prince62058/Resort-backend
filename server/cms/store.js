import seed from '../../shared/seed.json' with { type: 'json' };
import { publicContent, routesFor } from '../../shared/content.js';
import { migrateGuestPages, migrateJournal } from './migrations.js';
export function createContentStore(getStore, configured) {
  let cached,
    expires = 0,
    initialization;
  async function db() {
    return (await getStore()).db;
  }
  async function initialize() {
    if (!initialization) initialization = (async () => {
      const database = await db();
      await Promise.all([database.collection('cms_sessions').createIndex({
        expiresAt: 1
      }, {
        expireAfterSeconds: 0
      }), database.collection('cms_limits').createIndex({
        expiresAt: 1
      }, {
        expireAfterSeconds: 0
      }), database.collection('cms_enquiries').createIndex({
        createdAt: -1
      })]);
      await database.collection('cms_content').updateOne({
        _id: 'site'
      }, {
        $setOnInsert: {
          version: 1,
          draft: seed,
          published: seed,
          redirects: {},
          updatedAt: new Date(),
          publishedAt: new Date()
        }
      }, {
        upsert: true
      });
      await migrateGuestPages(database);
      await migrateJournal(database);
    })().catch(error => {
      initialization = undefined;
      throw error;
    });
    return initialization;
  }
  async function document() {
    await initialize();
    return (await db()).collection('cms_content').findOne({
      _id: 'site'
    });
  }
  async function published() {
    if (!configured()) return {
      content: publicContent(seed),
      redirects: {},
      version: 0
    };
    if (cached && Date.now() < expires) return cached;
    try {
      const doc = await document();
      cached = {
        content: publicContent(doc.published),
        redirects: doc.redirects || {},
        version: doc.version
      };
      expires = Date.now() + 10000;
      return cached;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }
  async function save(content, version, publish, user) {
    const database = await db(),
      col = database.collection('cms_content');
    const current = await document();
    const now = new Date();
    const update = {
      draft: content,
      updatedAt: now,
      updatedBy: user.email
    };
    if (publish) {
      update.published = content;
      update.publishedAt = now;
      const redirects = {
        ...current.redirects
      };
      const next = routesFor(publicContent(content));
      for (const previous of routesFor(publicContent(current.published))) {
        const match = next.find(r => r.type === previous.type && r.item.id === previous.item.id);
        if (match && match.path !== previous.path) {
          for (const [from, to] of Object.entries(redirects)) if (to === previous.path) redirects[from] = match.path;
          redirects[previous.path] = match.path;
        }
      }
      for (const route of next) delete redirects[route.path];
      for (const from of Object.keys(redirects)) if (!next.some(r => r.path === redirects[from])) delete redirects[from];
      update.redirects = redirects;
    }
    const result = await col.findOneAndUpdate({
      _id: 'site',
      version
    }, {
      $set: update,
      $inc: {
        version: 1
      }
    }, {
      returnDocument: 'after'
    });
    if (!result) {
      const error = new Error('Someone else saved changes. Reload the editor before saving again.');
      error.status = 409;
      throw error;
    }
    await database.collection('cms_revisions').insertOne({
      version: result.version,
      content: current.draft,
      published: publish,
      at: now,
      by: user.email
    });
    cached = undefined;
    expires = 0;
    return result;
  }
  return {
    db,
    initialize,
    document,
    published,
    save
  };
}
