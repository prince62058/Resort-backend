import {routesFor} from '../../shared/content.js';
import {escapeHtml} from '../../shared/seo.js';
export function installSeo(app, cms) {
  app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
  app.get('/sitemap.xml', async (req, res) => {
    const {content} = await cms.published();
    const base = content.settings.siteUrl.replace(/\/$/, '');
    if (!base) return res.status(503).json({error: 'Set the public website URL in the admin studio.'});
    res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + routesFor(content).filter(r => !r.item.seo.noindex).map(r => '<url><loc>' + escapeHtml(base + r.path) + '</loc></url>').join('') + '</urlset>');
  });
}
