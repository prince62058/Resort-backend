import { z } from 'zod';
import { routesFor } from '../../shared/content.js';
import { validMediaPath, imageType } from '../media-paths.js';
const text = z.string().max(2000);
const image = z.string().max(350).refine(v => validMediaPath(v) && Boolean(imageType(v)), 'Choose a valid image from the media library.');
const images = z.array(image).min(1).max(100);
const url = z.string().max(2000).refine(v => {
  if (v === '') return true;
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}, 'Use an http(s) URL.');
const seo = z.object({
  title: z.string().max(120),
  description: z.string().max(350),
  keywords: z.array(z.string().max(80)).max(20),
  image,
  noindex: z.boolean()
});
const base = {
  id: z.string().regex(/^[a-zA-Z0-9-]{1,100}$/),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: z.string().trim().min(1).max(180),
  order: z.number().int().min(0).max(10000),
  status: z.enum(['draft', 'published']),
  seo
};
const page = z.object({
  ...base,
  slug: z.string().regex(/^(?:[a-z0-9]+(?:-[a-z0-9]+)*)?$/).max(100),
  footerLabel: text,
  heading: text,
  accent: text,
  subtitle: text,
  template: z.enum(['home', 'rooms', 'services', 'galleries', 'about', 'contact', 'blog', 'custom', 'legal', 'support']),
  footerGroup: z.enum(['main', 'help', 'hidden']).default('main'),
  updated: z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/).default(''),
  nav: z.boolean(),
  body: z.string().max(50000),
  images
});
export const contentSchema = z.object({
  settings: z.object({
    name: text,
    fullName: text,
    tagline: text,
    phone: text,
    phoneInternational: text,
    phoneDigits: z.string().regex(/^\d{8,16}$/),
    email: z.email(),
    address: text,
    location: text,
    maps: url,
    siteUrl: url.refine(v => {
      if (!v) return true;
      try {
        const u = new URL(v);
        return u.pathname === '/' && !u.search && !u.hash;
      } catch {
        return false;
      }
    }, 'Use the domain only, without a page path, query or fragment.'),
    logo: image,
    favicon: image,
    icons: z.object({
      leaf: image,
      pool: image,
      dining: image
    }),
    instagram: url,
    facebook: url,
    linkedin: url,
    defaultSeo: seo,
    privacy: z.string().max(20000),
    terms: z.string().max(20000)
  }),
  pages: z.array(page).min(7).max(100),
  rooms: z.array(z.object({
    ...base,
    price: z.number().min(0).max(10000000),
    description: z.string().max(20000),
    summary: text,
    type: z.enum(['Cottages', 'Private villas']),
    images,
    homeImages: images,
    amenities: z.array(z.string().max(150)).max(30),
    featured: z.boolean()
  })).max(200),
  experiences: z.array(z.object({
    ...base,
    tag: text,
    text: z.string().max(10000),
    images
  })).max(100),
  galleries: z.array(z.object({
    ...base,
    description: text,
    images
  })).max(100),
  posts: z.array(z.object({
    ...base,
    category: z.string().trim().max(80).default('From the nest'),
    featured: z.boolean().default(false),
    summary: text,
    body: z.string().max(100000),
    images,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  })).max(200),
  heroSlides: z.array(z.object({
    image,
    alt: text,
    eyebrow: text,
    title: text,
    accent: text,
    description: text,
    caption: text
  })).min(1).max(10),
  storyChapters: z.array(z.object({
    name: text,
    title: text,
    image,
    detail: text
  })).min(1).max(10),
  roomsHero: z.array(z.object({
    image,
    title: text,
    note: text,
    href: z.string().regex(/^\/(?!\/)[a-z0-9\/#-]*$/)
  })).min(1).max(10),
  homePhotos: z.record(z.string().regex(/^\w+$/), z.union([images, z.record(z.string(), images)])),
  photos: z.record(z.string().regex(/^\w+$/), z.union([images, z.record(z.string(), images)])),
  comforts: z.array(z.object({
    kind: z.enum(['stay', 'leaf', 'pool', 'dining']),
    title: text,
    text,
    to: z.string().regex(/^\/(?!\/)[a-z0-9\/#-]*$/)
  })).max(12),
  faqs: z.array(z.object({
    question: text,
    answer: z.string().max(5000)
  })).max(50),
  copy: z.record(z.string().regex(/^[a-zA-Z0-9._-]+$/), z.string().max(10000))
}).superRefine((c, ctx) => {
  const paths = new Set(),
    ids = new Set();
  for (const route of routesFor(c)) {
    if (paths.has(route.path)) ctx.addIssue({
      code: 'custom',
      message: 'Duplicate URL: ' + route.path,
      path: [route.type]
    });
    paths.add(route.path);
    const id = route.type + ':' + route.item.id;
    if (ids.has(id)) ctx.addIssue({
      code: 'custom',
      message: 'Duplicate content ID.',
      path: [route.type]
    });
    ids.add(id);
    if (/^\/(admin|api|assets|favicon|robots|sitemap)(\/|\.|$)/.test(route.path)) ctx.addIssue({
      code: 'custom',
      message: 'This slug is reserved for the application.',
      path: [route.type]
    });
  }
  for (const template of ['home', 'rooms', 'services', 'galleries', 'about', 'contact', 'blog']) {
    const pages = c.pages.filter(p => p.template === template);
    if (pages.length !== 1 || pages[0].status !== 'published' || template === 'home' && pages[0].slug !== '') ctx.addIssue({
      code: 'custom',
      message: 'Keep one published ' + template + ' page. Home uses an empty slug.',
      path: ['pages']
    });
  }
  if (c.pages.some(p => p.template !== 'home' && !p.slug)) ctx.addIssue({
    code: 'custom',
    message: 'Only the homepage can have an empty slug.',
    path: ['pages']
  });
});
export function parseContent(value) {
  const result = contentSchema.safeParse(value);
  if (!result.success) {
    const e = new Error(result.error.issues.slice(0, 6).map(i => i.path.join('.') + ': ' + i.message).join('\n'));
    e.status = 400;
    throw e;
  }
  return result.data;
}
