import { test } from 'node:test';
import assert from 'node:assert/strict';
import seed from '../../shared/seed.json' with { type: 'json' };
import { instagramReelUrl, directVideoUrl } from '../../shared/reels.js';
import { parseContent } from '../../server/cms/schema.js';
import { publicContent } from '../../shared/content.js';
import { withReels } from '../../server/cms/migrations.js';

test('reels canonicalize tracking links and reject arbitrary embeds and hosts', () => {
  assert.equal(instagramReelUrl(' https://instagram.com/reel/Deb2fCYtVQK/?srtk=tracking#test '), seed.reels.items[0].url);
  for (const url of ['http://instagram.com/reel/Deb2fCYtVQK/', 'https://instagram.com.evil.test/reel/Deb2fCYtVQK/', 'https://evil@instagram.com/reel/Deb2fCYtVQK/', 'https://instagram.com:4000/reel/Deb2fCYtVQK/', 'https://instagram.com/profile/', 'javascript:alert(1)', '<iframe src="test">']) {
    assert.equal(instagramReelUrl(url), '');
    const content = structuredClone(seed); content.reels.items[0].url = url;
    assert.throws(() => parseContent(content), e => e.status === 400);
  }
  const content = structuredClone(seed); content.reels.items[0].url += '?tracking=1';
  assert.equal(parseContent(content).reels.items[0].url, seed.reels.items[0].url);
});

test('direct videos require HTTPS media files and disabled reels never reach public content', () => {
  assert.equal(directVideoUrl('https://media.example.test/video.mp4?signature=abc'), 'https://media.example.test/video.mp4?signature=abc');
  for (const url of ['http://media.test/a.mp4', 'https://user:secret@media.test/a.mp4', seed.reels.items[0].url, 'javascript:a.mp4']) assert.equal(directVideoUrl(url), '');
  const content = structuredClone(seed); content.reels.items[0].enabled = false;
  assert.equal(publicContent(content).reels.items.length, 1);
  content.reels.items[1].videoUrl = 'https://media.test/a.html';
  assert.throws(() => parseContent(content), e => e.status === 400);
  content.reels.items[1].videoUrl = ''; content.reels.items[1].id = content.reels.items[0].id;
  assert.throws(() => parseContent(content), e => e.status === 400);
});

test('reels upgrade preserves all owner edits and old snapshots remain restorable', () => {
  const old = structuredClone(seed); delete old.reels; old.rooms[0].summary = 'Pending draft';
  assert.equal(parseContent(old).reels.enabled, false);
  const migrated = withReels(old);
  assert.deepEqual(migrated.reels, seed.reels);
  assert.equal(migrated.rooms[0].summary, 'Pending draft');
  migrated.reels.enabled = false; migrated.reels.items = [];
  assert.deepEqual(withReels(migrated), migrated);
});
