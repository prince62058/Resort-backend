export const journalPostIds = ['a-slow-weekend', 'cottage-or-villa', 'a-table-and-time'];

export function readingMinutes(body) {
  return Math.max(1, Math.ceil(String(body || '').trim().split(/\s+/).filter(Boolean).length / 200));
}

export function journalDate(value) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function journalPosts(content) {
  return [...content.posts].filter(p => p.status === 'published').sort((a, b) => a.order - b.order || b.date.localeCompare(a.date));
}
