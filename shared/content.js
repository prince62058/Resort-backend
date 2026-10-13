export const collections = ['pages', 'rooms', 'experiences', 'galleries', 'posts'];
export function publicContent(content) {
  const result = structuredClone(content);
  for (const key of collections) result[key] = result[key].filter(item => item.status === 'published').sort((a, b) => a.order - b.order);
  return result;
}
export function pagePath(content, template) {
  const page = content.pages.find(p => p.template === template);
  return page ? '/' + page.slug : '/' + ({
    contact: 'contact-us',
    home: ''
  }[template] ?? template);
}
export function itemPath(content, type, item) {
  return (type === 'pages' ? '' : pagePath(content, {
    experiences: 'services',
    posts: 'blog'
  }[type] || type)) + '/' + item.slug;
}
export function routesFor(content) {
  return collections.flatMap(type => content[type].map(item => ({
    type,
    item,
    path: itemPath(content, type, item)
  })));
}
export function resolveRoute(content, pathname) {
  const clean = decodeURI(pathname).replace(/\/$/, '') || '/';
  return routesFor(content).find(route => route.path === clean);
}
export function linkTo(content, target) {
  if (!target?.startsWith('/')) return target;
  const [path, hash] = target.split('#');
  const parts = path.split('/').filter(Boolean);
  const template = {
    rooms: 'rooms',
    services: 'services',
    galleries: 'galleries',
    about: 'about',
    'contact-us': 'contact',
    blog: 'blog'
  }[parts[0]];
  if (!template) return target;
  const type = {
    services: 'experiences',
    blog: 'posts'
  }[template] || template;
  const item = parts[1] && content[type]?.find(x => x.id === parts[1] || x.slug === parts[1]);
  return (item ? itemPath(content, type, item) : pagePath(content, template) + (parts[1] ? '/' + parts[1] : '')) + (hash ? '#' + hash : '');
}
export function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
