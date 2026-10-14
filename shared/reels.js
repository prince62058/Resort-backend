// Only canonical Instagram Reel URLs are used as iframe sources. Never accept
// pasted embed HTML or arbitrary iframe hosts from the content editor.
export function instagramReelUrl(value) {
  try {
    const url = new URL(value.trim());
    const match = url.pathname.match(/^\/reel\/([A-Za-z0-9_-]{5,100})\/?$/);
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname) || url.port || url.username || url.password || !match) return '';
    return `https://www.instagram.com/reel/${match[1]}/`;
  } catch { return ''; }
}

export function directVideoUrl(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password && /\.(mp4|webm)$/i.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}

export const emptyReels = { enabled: false, label: 'Little moments at the nest', items: [] };
