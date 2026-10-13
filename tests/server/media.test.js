import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {createApp} from '../../server/app.js';
import {validMediaPath, mediaUrl} from '../../server/media-paths.js';

let root;
const servers = [];
const databaseImage = Buffer.from('database image bytes');
const localImage = Buffer.from('original local image bytes');
const hash = createHash('sha256').update(databaseImage).digest('hex');
const sample = {path: 'logos/resort.png', fileId: 'file-id', bytes: databaseImage.length, sha256: hash};
const store = {
  db: {command: async () => ({ok:1})},
  assets: {findOne: async ({path: filename}) => filename === sample.path ? sample : null},
  bucket: {openDownloadStream: () => Readable.from([databaseImage])},
};
async function serve(overrides = {}) {
  const server = createApp({root, configured: () => true, getStore: async () => store, ...overrides}).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise(resolve => server.once('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
before(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'nature-nest-media-'));
  await mkdir(path.join(root, 'public/assets/logos'), {recursive: true});
  await mkdir(path.join(root, 'dist/assets'), {recursive: true});
  await writeFile(path.join(root, 'public/assets/logos/resort.png'), localImage);
  await writeFile(path.join(root, 'dist/assets/app.js'), 'console.log("app")');
  await writeFile(path.join(root, 'dist/index.html'), '<html>Nature Nest app</html>');
  await writeFile(path.join(root, '.env'), 'PRIVATE_DATABASE_VALUE');
});
after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
  await rm(root, {recursive: true, force: true});
});

test('serves GridFS bytes at existing image URLs, supports HEAD and cache revalidation', async () => {
  const base = await serve();
  const response = await fetch(base + '/assets/logos/resort.png');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-media-source'), 'mongodb');
  assert.equal(response.headers.get('x-media-cache'), 'gridfs');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), databaseImage);
  const head = await fetch(base + '/assets/logos/resort.png', {method: 'HEAD'});
  assert.equal(head.headers.get('content-length'), String(databaseImage.length));
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const cached = await fetch(base + '/assets/logos/resort.png', {headers: {'If-None-Match': `"${hash}"`, 'Cache-Control': 'max-age=0'}});
  assert.equal(cached.status, 304);
  assert.equal((await cached.arrayBuffer()).byteLength, 0);
  const alias = await fetch(base + '/api/media/file/logos/resort.png');
  assert.deepEqual(Buffer.from(await alias.arrayBuffer()), databaseImage);
});

test('uses a bundled image cache only when its bytes match the MongoDB checksum', async () => {
  const localHash = createHash('sha256').update(localImage).digest('hex');
  let catalogReads = 0;
  const base = await serve({getStore: async () => ({
    ...store,
    assets: {findOne: async () => {catalogReads++; return {...sample, bytes: localImage.length, sha256: localHash};}},
    bucket: {openDownloadStream: () => {throw new Error('Matching cache should avoid cloud downloads.');}},
  })});
  for (let index = 0; index < 2; index++) {
    const response = await fetch(base + '/assets/logos/resort.png');
    assert.equal(response.headers.get('x-media-source'), 'mongodb');
    assert.equal(response.headers.get('x-media-cache'), 'verified-local');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), localImage);
  }
  assert.equal(catalogReads, 1);
});

test('database outages preserve local photos without leaking connection errors', async () => {
  const base = await serve({getStore: async () => {throw new Error('PRIVATE_DATABASE_VALUE');}});
  const image = await fetch(base + '/assets/logos/resort.png');
  assert.equal(image.headers.get('x-media-source'), 'local');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), localImage);
  const health = await fetch(base + '/api/health');
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), {ready:false, media:'unavailable'});
  const catalog = await fetch(base + '/api/media');
  assert.equal(catalog.status, 503);
  assert.doesNotMatch(await catalog.text(), /PRIVATE_DATABASE_VALUE/);
});

test('standalone API does not serve frontend routes or private files', async () => {
  const base = await serve({configured: () => false});
  assert.equal((await fetch(base + '/rooms/private-villa-1')).status, 404);
  assert.equal((await (await fetch(base + '/')).json()).service, 'Nature Nest API');
  assert.equal((await fetch(base + '/assets/app.js')).status, 404);
  assert.equal((await fetch(base + '/assets/missing.png')).status, 404);
  assert.equal((await fetch(base + '/api/missing')).status, 404);
  assert.doesNotMatch(await (await fetch(base + '/.env')).text(), /PRIVATE_DATABASE_VALUE/);
  assert.deepEqual(await (await fetch(base + '/api/health')).json(), {ready:false, media:'unconfigured'});
});

test('rejects traversal, malformed paths and invalid catalog parameters', async () => {
  const base = await serve();
  for (const value of ['../.env', 'photos/../.env', '/image.png', 'photos\\image.png', 'a//b.png', 'a\0.png']) assert.equal(validMediaPath(value), false);
  assert.equal(mediaUrl('gallery/room 1.jpg'), '/assets/gallery/room%201.jpg');
  for (const url of ['/assets/%2e%2e%2f.env', '/assets/hello%5cworld.png', '/assets/%E0%A4%A', '/api/media?folder=a&folder=b', '/api/media?limit=1000', '/api/media?page=-1']) {
    assert.equal((await fetch(base + url)).status, 400, url);
  }
});
