import {createReadStream} from 'node:fs';
import {readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {imageType} from '../server/media-paths.js';

export const assetRoot = process.env.MEDIA_SOURCE_DIR ? path.resolve(process.env.MEDIA_SOURCE_DIR) : fileURLToPath(new URL('../../site/public/assets/', import.meta.url));

export async function listImages(directory = assetRoot) {
  const result = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listImages(filename));
    else if (entry.isFile() && imageType(entry.name)) result.push(filename);
  }
  return result.sort();
}

export async function describeImage(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  const relative = path.relative(assetRoot, filename).split(path.sep).join('/');
  const folder = path.posix.dirname(relative);
  return {path: relative, folder: folder === '.' ? '' : folder, name: path.basename(filename), contentType: imageType(filename), bytes: (await stat(filename)).size, sha256: hash.digest('hex')};
}
