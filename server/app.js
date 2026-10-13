import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pipeline} from 'node:stream/promises';
import {databaseConfigured, getMediaStore} from './database.js';
import {imageType, mediaUrl, validMediaPath} from './media-paths.js';
import {createMediaCache} from './media-cache.js';
import {createContentStore} from './cms/store.js';
import {createCmsRouter, createEnquiryRouter} from './cms/router.js';
import {installSeo} from './cms/seo.js';

const project = fileURLToPath(new URL('../', import.meta.url));

export function createApp({getStore = getMediaStore, configured = databaseConfigured, root = project, cms: suppliedCms, authOptions} = {}) {
  const app = express();
  const cache = createMediaCache(path.join(root, 'public/assets'));
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN'});next();});
  if(process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  const cms = suppliedCms || createContentStore(getStore, configured);
  app.get('/api/content', async (req,res) => {res.set('Cache-Control','no-cache').json(await cms.published());});
  app.use('/api/admin', createCmsRouter(cms,getStore,authOptions,filename=>cache.invalidate(filename)));
  app.use('/api/enquiries', createEnquiryRouter(cms));


  app.get('/api/health', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!configured()) return res.status(503).json({ready: false, media: 'unconfigured'});
    try {
      const store = await getStore();
      await store.db.command({ping: 1});
      res.json({ready: true, media: 'mongodb'});
    } catch {
      res.status(503).json({ready: false, media: 'unavailable'});
    }
  });

  app.get('/api/media/folders', async (req, res, next) => {
    try {
      const {assets} = await getStore();
      const folders = await assets.aggregate([
        {$group: {_id: '$folder', images: {$sum: 1}, bytes: {$sum: '$bytes'}}},
        {$sort: {_id: 1}},
        {$project: {_id: 0, folder: '$_id', images: 1, bytes: 1}},
      ]).toArray();
      res.set('Cache-Control', 'public, max-age=60').json({folders});
    } catch (error) {next(error);}
  });

  app.get('/api/media', async (req, res, next) => {
    const {folder, page = '1', limit = '100'} = req.query;
    if ((folder !== undefined && folder !== '' && !validMediaPath(folder)) ||
        typeof page !== 'string' || !/^\d+$/.test(page) ||
        typeof limit !== 'string' || !/^\d+$/.test(limit) ||
        Number(page) < 1 || Number(page) > 10000 || Number(limit) < 1 || Number(limit) > 200) {
      return res.status(400).json({error: 'Use a valid folder, page and limit (1–200).'});
    }
    try {
      const {assets} = await getStore();
      const query = folder === undefined ? {} : {folder};
      const [total, items] = await Promise.all([
        assets.countDocuments(query),
        assets.find(query, {projection: {_id: 0, path: 1, folder: 1, name: 1, bytes: 1, contentType: 1, sha256: 1}})
          .sort({path: 1}).skip((Number(page) - 1) * Number(limit)).limit(Number(limit)).toArray(),
      ]);
      res.set('Cache-Control', 'public, max-age=60').json({total, page: Number(page), limit: Number(limit), items: items.map(item => ({...item, url: mediaUrl(item.path)}))});
    } catch (error) {next(error);}
  });

  // Keep the same URLs for React images, CSS backgrounds, logos and generated icons.
  app.get(/^\/(?:assets|api\/media\/file)\/(.+)$/, async (req, res, next) => {
    const filename = req.params[0];
    if (!validMediaPath(filename)) return res.status(400).json({error: 'Invalid image path.'});
    const type = imageType(filename);
    if (!type) return next();
    if (!configured()) return next();
    try {
      const {assets, bucket} = await getStore();
      const asset = await cache.metadata(filename, assets);
      if (!asset) return next();
      const etag = `"${asset.sha256}"`;
      res.set({'Content-Type': type, 'ETag': etag, 'Cache-Control': 'public, max-age=3600', 'X-Media-Source': 'mongodb'});
      if (req.fresh) return res.status(304).end();
      res.set('Content-Length', String(asset.bytes));
      if (req.method === 'HEAD') return res.end();
      const localCopy = await cache.localCopy(asset);
      if (localCopy) {
        res.set('X-Media-Cache', 'verified-local');
        return res.end(localCopy);
      }
      res.set('X-Media-Cache', 'gridfs');
      await pipeline(bucket.openDownloadStream(asset.fileId), res);
    } catch (error) {
      // Keep local resort images usable during a database outage.
      if (!res.headersSent && !res.destroyed) {
        res.removeHeader('ETag');
        res.removeHeader('Content-Length');
        res.removeHeader('X-Media-Source');
        res.removeHeader('X-Media-Cache');
        next();
      } else if (!res.destroyed) {res.destroy();}
    }
  });

  app.use('/assets', (req, res, next) => {res.set('X-Media-Source', 'local'); next();},
    express.static(path.join(root, 'public/assets'), {dotfiles: 'deny', index: false, maxAge: '1h'}));
  app.use('/api', (req, res) => res.status(404).json({error: 'Not found.'}));
  installSeo(app, cms);
  app.get('/', (req, res) => res.json({service: 'Nature Nest API', health: '/api/health'}));
  app.use((req, res) => res.status(404).json({error: 'Not found.'}));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    // Do not return database errors, URIs or credentials to a public client.
    const status=error.status || (error instanceof URIError ? 400 : 503);
    res.set('Cache-Control','no-store').status(status).json({error:error instanceof URIError?'Invalid path.':status<500?error.message:'Service temporarily unavailable. Please try again.'});
  });
  return app;
}
