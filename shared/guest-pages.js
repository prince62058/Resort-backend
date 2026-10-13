export const guestPageIds = ['privacy-policy', 'terms-and-conditions', 'cancellation-refund-policy', 'cookie-policy', 'guest-information'];

export function guestPath(content, id) {
  const page = content.pages.find(p => p.id === id && p.status === 'published');
  return page ? '/' + page.slug : null;
}

// Deliberately supports text, headings and lists only; never interprets HTML.
export function documentBlocks(body, settings = {}) {
  const values = { resortName: settings.fullName, email: settings.email, phone: settings.phoneInternational, address: settings.address };
  const text = String(body || '').replace(/\{\{(resortName|email|phone|address)\}\}/g, (match, key) => values[key] || match);
  const blocks = [];
  let heading = 0;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const value = line.trim();
    if (!value) { blocks.push({ type: 'break' }); continue; }
    const match = /^(#{2,3})\s+(.+)$/.exec(value);
    if (match) blocks.push({ type: match[1].length === 2 ? 'h2' : 'h3', text: match[2], id: 'section-' + ++heading });
    else if (/^-\s+/.test(value)) {
      const previous = blocks.at(-1);
      if (previous?.type === 'ul') previous.items.push(value.replace(/^-\s+/, ''));
      else blocks.push({ type: 'ul', items: [value.replace(/^-\s+/, '')] });
    } else if (blocks.at(-1)?.type === 'p') blocks.at(-1).text += ' ' + value;
    else blocks.push({ type: 'p', text: value });
  }
  return blocks.filter(b => b.type !== 'break');
}
