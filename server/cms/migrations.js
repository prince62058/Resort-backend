import seed from '../../shared/seed.json' with { type: 'json' };
import { guestPageIds } from '../../shared/guest-pages.js';
import { journalPostIds } from '../../shared/journal.js';

export const guestMigration = 'guest-information-2026-10-14-v2';

// Add missing pages independently to draft and published snapshots. Existing
// text, unpublished edits and changed URLs must survive an application upgrade.
export function withGuestPages(content) {
  const next = structuredClone(content);
  for (const id of guestPageIds) {
    if (next.pages.some(p => p.id === id)) continue;
    const page = structuredClone(seed.pages.find(p => p.id === id));
    const base = page.slug;
    let suffix = 1;
    while (next.pages.some(p => p.slug === page.slug)) page.slug = base + '-' + ++suffix;
    next.pages.push(page);
  }
  for (const [key, value] of Object.entries(seed.copy)) {
    if (key.startsWith('guest.') && !(key in next.copy)) next.copy[key] = value;
  }
  return next;
}

export async function migrateGuestPages(database) {
  const collection = database.collection('cms_content');
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await collection.findOne({ _id: 'site' });
    if (!current || current.migrations?.includes(guestMigration)) return;
    const result = await collection.updateOne({ _id: 'site', version: current.version, migrations: { $ne: guestMigration } }, {
      $set: { draft: withGuestPages(current.draft), published: withGuestPages(current.published), updatedAt: new Date() },
      $inc: { version: 1 }, $addToSet: { migrations: guestMigration }
    });
    if (result.modifiedCount) {
      await database.collection('cms_revisions').insertOne({ version: current.version + 1, content: current.draft, published: true, at: new Date(), by: 'system:guest-information' });
      return;
    }
  }
  throw new Error('Content changed during the guest information upgrade. Please retry.');
}

export const journalMigration = 'journal-design-2026-10-14';
export function withJournal(content) {
  const next = structuredClone(content);
  const blog = next.pages.find(p => p.template === 'blog');
  const defaults = seed.pages.find(p => p.template === 'blog');
  if (blog) {
    blog.nav = true;
    blog.name = 'Blog';
    if (!blog.footerLabel || blog.footerLabel === 'The journal') blog.footerLabel = defaults.footerLabel;
    for (const key of ['heading', 'accent', 'subtitle']) if (!blog[key]) blog[key] = defaults[key];
  }
  for (const post of next.posts) {
    post.category ??= post.id === 'first-story' ? 'Slow travel' : 'From the nest';
    post.featured ??= post.id === 'first-story';
  }
  for (const id of journalPostIds) {
    if (next.posts.some(p => p.id === id)) continue;
    const post = structuredClone(seed.posts.find(p => p.id === id));
    const base = post.slug;
    let suffix = 1;
    while (next.posts.some(p => p.slug === post.slug)) post.slug = base + '-' + ++suffix;
    next.posts.push(post);
  }
  for (const [key, value] of Object.entries(seed.copy)) if (key.startsWith('journal.') && !(key in next.copy)) next.copy[key] = value;
  return next;
}

export async function migrateJournal(database) {
  const collection = database.collection('cms_content');
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await collection.findOne({ _id: 'site' });
    if (!current || current.migrations?.includes(journalMigration)) return;
    const result = await collection.updateOne({ _id: 'site', version: current.version, migrations: { $ne: journalMigration } }, {
      $set: { draft: withJournal(current.draft), published: withJournal(current.published), updatedAt: new Date() },
      $inc: { version: 1 }, $addToSet: { migrations: journalMigration }
    });
    if (result.modifiedCount) {
      await database.collection('cms_revisions').insertOne({ version: current.version + 1, content: current.draft, published: true, at: new Date(), by: 'system:journal-design' });
      return;
    }
  }
  throw new Error('Content changed during the journal upgrade. Please retry.');
}

export const reelsMigration = 'corner-reels-2026-10-14';
export function withReels(content) {
  const next = structuredClone(content);
  next.reels ??= structuredClone(seed.reels);
  return next;
}

export async function migrateReels(database) {
  const collection = database.collection('cms_content');
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await collection.findOne({ _id: 'site' });
    if (!current || current.migrations?.includes(reelsMigration)) return;
    const result = await collection.updateOne({ _id: 'site', version: current.version, migrations: { $ne: reelsMigration } }, {
      $set: { draft: withReels(current.draft), published: withReels(current.published), updatedAt: new Date() },
      $inc: { version: 1 }, $addToSet: { migrations: reelsMigration }
    });
    if (result.modifiedCount) {
      await database.collection('cms_revisions').insertOne({ version: current.version + 1, content: current.draft, published: true, at: new Date(), by: 'system:corner-reels' });
      return;
    }
  }
  throw new Error('Content changed during the reel upgrade. Please retry.');
}

export const winterArticleMigration = 'winter-couples-article-to-journal-2026-11-05';
const winterPageId = '11fadcb6-41ef-4ae8-9336-5180a8c7fef2';
const winterPagePath = '/why-winter-is-the-perfect-season-for-newlywed-couples-to-enjoy-a-romantic-resort-stay-near-indore';
const winterBlogPath = '/blog/why-winter-is-the-perfect-season-for-newlywed-couples-to-enjoy-a-romantic-resort-stay-near-indore';

function pageToWinterPost(page) {
  const body = String(page.body || '').replace(/^#\s+.+\n+/, '').trim();
  return {
    id: 'winter-couples-escape',
    slug: page.slug,
    name: page.name,
    order: 0,
    status: page.status === 'published' ? 'published' : 'draft',
    seo: page.seo,
    category: 'Romantic escapes',
    featured: false,
    summary: String(page.subtitle || page.seo?.description || '').replace(/\s+/g, ' ').trim(),
    body,
    images: page.images?.length ? page.images : ['enhanced/story/story-arrival-v1.webp'],
    date: '2026-11-05'
  };
}

export function withWinterJournalPost(content) {
  const next = structuredClone(content);
  const page = next.pages.find(p => p.id === winterPageId || p.slug === winterPagePath.slice(1));
  if (!page) return next;
  if (!next.posts.some(p => p.id === 'winter-couples-escape' || p.slug === page.slug)) {
    next.posts.unshift(pageToWinterPost(page));
  }
  next.pages = next.pages.filter(p => p.id !== page.id);
  return next;
}

export async function migrateWinterArticle(database) {
  const collection = database.collection('cms_content');
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await collection.findOne({ _id: 'site' });
    if (!current || current.migrations?.includes(winterArticleMigration)) return;
    const draft = withWinterJournalPost(current.draft);
    const published = withWinterJournalPost(current.published);
    const redirects = { ...(current.redirects || {}), [winterPagePath]: winterBlogPath };
    delete redirects[winterBlogPath];
    const result = await collection.updateOne({ _id: 'site', version: current.version, migrations: { $ne: winterArticleMigration } }, {
      $set: { draft, published, redirects, updatedAt: new Date() },
      $inc: { version: 1 },
      $addToSet: { migrations: winterArticleMigration }
    });
    if (result.modifiedCount) {
      await database.collection('cms_revisions').insertOne({ version: current.version + 1, content: draft, published: true, at: new Date(), by: 'system:winter-journal' });
      return;
    }
  }
  throw new Error('Content changed during the winter article upgrade. Please retry.');
}
