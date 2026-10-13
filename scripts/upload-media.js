import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {closeMediaStore, getMediaStore} from '../server/database.js';
import {describeImage, listImages} from './media-library.js';

try {
  const images = await listImages();
  const {assets, bucket, files} = await getMediaStore();
  await assets.createIndex({path: 1}, {unique: true});
  await assets.createIndex({folder: 1, path: 1});
  let uploaded = 0, skipped = 0, completed = 0;
  console.log(`Syncing ${images.length} images with their original folder paths.`);
  // Small batches keep the upload resumable without overwhelming Atlas.
  for (let offset = 0; offset < images.length; offset += 4) {
    await Promise.all(images.slice(offset, offset + 4).map(async filename => {
      const metadata = await describeImage(filename);
      const existing = await assets.findOne({path: metadata.path});
      if (existing?.sha256 === metadata.sha256 && await files.findOne({_id: existing.fileId})) {
        skipped++;
      } else {
        const upload = bucket.openUploadStream(metadata.path, {metadata: {...metadata, source: 'nature-nest-website'}});
        try {
          await pipeline(createReadStream(filename), upload);
          await assets.updateOne({path: metadata.path}, {$set: {...metadata, fileId: upload.id, updatedAt: new Date()}, $setOnInsert: {createdAt: new Date()}}, {upsert: true});
          uploaded++;
          // Older versions stay intact; the catalog points to the latest complete upload.
        } catch (error) {
          await bucket.delete(upload.id).catch(() => {});
          throw error;
        }
      }
      completed++;
    }));
    if (completed % 40 === 0 || completed === images.length) console.log(`${completed}/${images.length} processed (${uploaded} uploaded, ${skipped} unchanged).`);
  }
  console.log(JSON.stringify({total: images.length, uploaded, skipped, folders: (await assets.distinct('folder')).length}));
} catch (error) {
  console.error(`Media sync failed (${error.name}). Check Atlas access and server environment settings, then rerun; completed files will be skipped.`);
  process.exitCode = 1;
} finally {await closeMediaStore();}
