import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// The catalog remains authoritative. Bundled copies are only used if their
// exact bytes match the checksum uploaded to GridFS, so deployments stay fast.
export function createMediaCache(root, {maxBytes = 32 * 1024 * 1024, ttl = 60000} = {}) {
  const catalog = new Map();
  const buffers = new Map();
  const pendingFiles = new Map();
  const pendingMetadata = new Map();
  let bytes = 0;
  return {
    async invalidate(filename) {await pendingMetadata.get(filename);catalog.delete(filename);},
    async metadata(filename, assets) {
      const existing = catalog.get(filename);
      if (existing && existing.expires > Date.now()) return existing.value;
      if (!pendingMetadata.has(filename)) {
        pendingMetadata.set(filename, assets.findOne({path: filename}).then(value => {
          if (catalog.size >= 1000) catalog.delete(catalog.keys().next().value);
          catalog.set(filename, {value, expires: Date.now() + ttl});
          return value;
        }).finally(() => pendingMetadata.delete(filename)));
      }
      return pendingMetadata.get(filename);
    },
    async localCopy(asset) {
      if (asset.bytes > Math.min(maxBytes, 8 * 1024 * 1024)) return null;
      const key = asset.sha256;
      if (buffers.has(key)) {
        const buffer = buffers.get(key);
        buffers.delete(key);
        buffers.set(key, buffer);
        return buffer;
      }
      if (!pendingFiles.has(key)) {
        pendingFiles.set(key, (async () => {
          const buffer = await readFile(path.join(root, asset.path));
          if (buffer.length !== asset.bytes || createHash('sha256').update(buffer).digest('hex') !== asset.sha256) return null;
          while (bytes + buffer.length > maxBytes && buffers.size) {
            const oldest = buffers.keys().next().value;
            bytes -= buffers.get(oldest).length;
            buffers.delete(oldest);
          }
          buffers.set(key, buffer);
          bytes += buffer.length;
          return buffer;
        })().catch(() => null).finally(() => pendingFiles.delete(key)));
      }
      return pendingFiles.get(key);
    },
  };
}
