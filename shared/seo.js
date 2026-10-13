import { resolveRoute, itemPath } from './content.js';
import { documentBlocks } from './guest-pages.js';
export function seoFor(content, pathname, origin) {
  const route = resolveRoute(content, pathname);
  const item = route?.item,
    settings = content.settings;
  const base = (settings.siteUrl || origin).replace(/\/$/, '');
  const seo = item?.seo || settings.defaultSeo;
  const canonical = base + (route?.path || pathname);
  const image = base + '/assets/' + (seo.image || settings.defaultSeo.image).split('/').map(encodeURIComponent).join('/');
  const description = seo.description || item?.summary || item?.description || settings.defaultSeo.description;
  const schema = {
    '@context': 'https://schema.org',
    '@type': route?.type === 'posts' ? 'BlogPosting' : item?.template === 'contact' ? 'ContactPage' : 'WebPage',
    name: seo.title || item?.name || settings.fullName,
    description,
    url: canonical,
    image
  };
  if (route?.type === 'posts') Object.assign(schema, {
    headline: item.name,
    datePublished: item.date,
    articleSection: item.category || 'From the nest',
    author: {
      '@type': 'Organization',
      name: settings.fullName
    }
  });
  const hotel = {
    '@context': 'https://schema.org',
    '@type': 'Hotel',
    name: settings.fullName,
    url: base + '/',
    image: base + '/assets/' + settings.logo,
    telephone: settings.phoneInternational,
    email: settings.email,
    address: settings.address
  };
  return {
    title: seo.title || item?.name || settings.fullName,
    description,
    canonical,
    image,
    noindex: !route || seo.noindex,
    schemas: route?.path === '/' ? [hotel, schema] : [schema],
    route
  };
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function seoHead(seo) {
  const e = escapeHtml;
  return `<title>${e(seo.title)}</title><meta name="description" content="${e(seo.description)}"><meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow'}"><link rel="canonical" href="${e(seo.canonical)}"><meta property="og:type" content="${seo.route?.type === 'posts' ? 'article' : 'website'}"><meta property="og:title" content="${e(seo.title)}"><meta property="og:description" content="${e(seo.description)}"><meta property="og:url" content="${e(seo.canonical)}"><meta property="og:image" content="${e(seo.image)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json" id="site-schema">${safeJson(seo.schemas)}</script>`;
}
export function initialMarkup(content, route) {
  const e = escapeHtml;
  if (!route) return '<main><h1>Page not found</h1><a href="/">Return to Nature Nest</a></main>';
  const item = route.item;
  const nav = content.pages.filter(p => p.nav).map(p => `<a href="${e(itemPath(content, 'pages', p))}">${e(p.name)}</a>`).join(' · ');
  let body = item.body || item.description || item.text || item.summary || item.seo.description;
  let links = '';
  const template = item.template;
  const collection = {
    rooms: 'rooms',
    services: 'experiences',
    galleries: 'galleries',
    blog: 'posts'
  }[template];
  if (collection) links = content[collection].map(p => `<article><h2><a href="${e(itemPath(content, collection, p))}">${e(p.name)}</a></h2><p>${e(p.summary || p.text || p.description || '')}</p></article>`).join('');
  if (template === 'home') {
    body = content.heroSlides[0].description;
    links = content.rooms.filter(r => r.featured).map(r => `<p><a href="${e(itemPath(content, 'rooms', r))}">${e(r.name)}</a></p>`).join('');
  }
  const formatted = ['legal', 'support'].includes(template) || route.type === 'posts';
  const markup = formatted ? documentBlocks(body, content.settings).map(b => b.type === 'ul' ? '<ul>' + b.items.map(t => '<li>' + e(t) + '</li>').join('') + '</ul>' : `<${b.type}${b.id ? ' id="' + b.id + '"' : ''}>${e(b.text)}</${b.type}>`).join('') : body.split('\n\n').map(p => '<p>' + e(p) + '</p>').join('');
  if (template === 'support') links += content.faqs.map(f => `<section><h2>${e(f.question)}</h2><p>${e(f.answer)}</p></section>`).join('');
  if (template === 'contact' || formatted) links += `<address>${e(content.settings.address)}<br><a href="tel:+${e(content.settings.phoneDigits)}">${e(content.settings.phoneInternational)}</a><br><a href="mailto:${e(content.settings.email)}">${e(content.settings.email)}</a></address>`;
  const guestLinks = content.pages.filter(p => p.footerGroup === 'help').map(p => `<a href="${e(itemPath(content, 'pages', p))}">${e(p.footerLabel || p.name)}</a>`).join(' · ');
  return `<div class="initial-content"><nav>${nav}</nav><main><h1>${e(item.name)}</h1>${markup}${links}</main><footer>${guestLinks}</footer></div>`;
}
