import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./src/images.json', import.meta.url), 'utf8'));

const parseAttrs = (str) => {
  const attrs = {};
  for (const m of str.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? true;
  return attrs;
};

/** Expande <gs-img name="" alt="" sizes="" [eager]> em <picture> AVIF/WebP responsivo. */
const picturePlugin = (siteUrl) => ({
  name: 'gs-picture',
  transformIndexHtml: {
    order: 'pre',
    handler(html) {
      return html.replaceAll('%VITE_SITE_URL%', siteUrl).replace(/<gs-img\s+([^>]*?)\/?>/g, (_, raw) => {
        const a = parseAttrs(raw);
        const img = manifest[a.name];
        if (!img) throw new Error(`gs-img: imagem desconhecida "${a.name}"`);
        // Galeria: calcula `sizes` a partir dos vãos da grade (12 col. no desktop, 6 no mobile)
        if (a.cols) {
          const gw = 1496; // largura útil máxima da grade (1640 - 2 * 72)
          a.sizes = `(min-width:720px) min(${((a.cols / 12) * 90).toFixed(1)}vw, ${Math.round((a.cols / 12) * gw)}px), ${((a.mcols / 6) * 90).toFixed(1)}vw`;
        }
        const set = (ext) => img.widths.map((w) => `/img/${a.name}-${w}.${ext} ${w}w`).join(', ');
        const largest = img.widths[img.widths.length - 1];
        const eager = a.eager !== undefined;
        const pos = a.pos ? ` style="object-position:${a.pos}"` : '';
        return (
          `<picture>` +
          `<source type="image/avif" srcset="${set('avif')}" sizes="${a.sizes || '100vw'}">` +
          `<source type="image/webp" srcset="${set('webp')}" sizes="${a.sizes || '100vw'}">` +
          `<img src="/img/${a.name}-${largest}.webp" width="${img.w}" height="${img.h}" alt="${a.alt || ''}"` +
          `${eager ? ' fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"'}${pos}>` +
          `</picture>`
        );
      });
    },
  },
});

/** Gera robots.txt e sitemap.xml a partir de VITE_SITE_URL. */
const seoFilesPlugin = (siteUrl) => ({
  name: 'gs-seo-files',
  generateBundle() {
    const today = new Date().toISOString().slice(0, 10);
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
    });
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source:
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        `  <url>\n    <loc>${siteUrl}/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n` +
        `    <image:image><image:loc>${siteUrl}/og.jpg</image:loc><image:title>Giovana Silva — Designer de Interiores em Sorocaba</image:title></image:image>\n` +
        `  </url>\n</urlset>\n`,
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const siteUrl = (env.VITE_SITE_URL || 'https://www.seu-dominio.com.br').replace(/\/$/, '');
  if (!env.VITE_SITE_URL) {
    console.warn('\n[aviso] VITE_SITE_URL não definido: usando domínio provisório para canonical/OG/sitemap.\n');
  }
  return {
    plugins: [picturePlugin(siteUrl), seoFilesPlugin(siteUrl)],
    build: { target: 'es2020', assetsInlineLimit: 0 },
  };
});
