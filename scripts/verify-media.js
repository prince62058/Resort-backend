import {createHash} from 'node:crypto';
import {closeMediaStore, getMediaStore} from '../server/database.js';
import {describeImage, listImages} from './media-library.js';

try {
  const {assets, bucket, files} = await getMediaStore();
  const catalog = new Map((await assets.find().toArray()).map(asset => [asset.path, asset]));
  const storedFiles = new Map((await files.find({}, {projection: {length: 1}}).toArray()).map(file => [String(file._id), file]));
  const samples = new Map();
  let verified = 0;
  for (const filename of await listImages()) {
    const expected = await describeImage(filename);
    const actual = catalog.get(expected.path);
    if (!actual || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes ||
        actual.folder !== expected.folder || storedFiles.get(String(actual.fileId))?.length !== expected.bytes) {
      throw new Error(`Image mismatch: ${expected.path}`);
    }
    if (!samples.has(actual.folder)) samples.set(actual.folder, actual);
    verified++;
  }
  // Read an image back from each folder and verify the actual stored bytes.
  for (const asset of samples.values()) {
    const hash = createHash('sha256');
    for await (const chunk of bucket.openDownloadStream(asset.fileId)) hash.update(chunk);
    if (hash.digest('hex') !== asset.sha256) throw new Error(`Download mismatch: ${asset.path}`);
  }
  console.log(JSON.stringify({verified, folders: samples.size, downloadChecks: samples.size, status: 'passed'}));
} catch (error) {
  console.error(error.message.startsWith('Image mismatch:') || error.message.startsWith('Download mismatch:') ? error.message : `Media verification failed (${error.name}). Check the server configuration.`);
  process.exitCode = 1;
} finally {await closeMediaStore();}
