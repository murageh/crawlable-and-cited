// node --test scripts/crawl-audit.test.mjs
// Serves a small site with the defects that cost real rankings, and checks crawl-audit finds each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SHELL = (head, body = '<div id="root"></div>') =>
  `<!doctype html><html><head>${head}</head><body>${body}<script src="/app.js"></script></body></html>`;

function site(port) {
  const origin = `http://127.0.0.1:${port}`;
  const pages = {
    // empty app shell; title too long; og:site_name ≠ WebSite name; doubled alternateName
    '/': SHELL(
      `<title>Example Plumbing: Emergency Plumbers, Boiler Repair and Drain Unblocking Today</title>
       <link rel="canonical" href="${origin}/">
       <meta property="og:site_name" content="Example Plumbing: Emergency Plumbers">
       <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example Plumbing (Leeds)","alternateName":"Example Plumbing (Leeds) (Leeds)","url":"${origin}/"}</script>`,
    ),
    // two h1 (page title + markdown "# heading"); og:site_name differs from home
    '/blog/post': SHELL(
      `<title>Post</title><link rel="canonical" href="${origin}/blog/post"><meta property="og:site_name" content="Example Plumbing">`,
      `<main><h1>Post</h1><h1>The guide</h1><p>${'word '.repeat(300)}</p><a href="/">a</a><a href="/blog">b</a><a href="/faq">c</a></main>`,
    ),
    // in the sitemap but noindex (route fell through to a noindex fallback)
    '/faq': SHELL(`<title>Example Plumbing</title><meta name="robots" content="noindex, nofollow">`),
    // in the sitemap but canonical points elsewhere (canonical computed from another host)
    '/s/shop': SHELL(
      `<title>Shop</title><link rel="canonical" href="http://shop.example.test/">`,
      `<main><h1>Shop</h1><p>${'word '.repeat(200)}</p><a href="/">a</a><a href="/s">b</a><a href="/faq">c</a></main>`,
    ),
    // blocked by robots.txt AND relies on noindex
    '/login': SHELL(`<title>Login</title><meta name="robots" content="noindex">`),
  };
  const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${['/', '/blog/post', '/faq', '/s/shop', '/gone'].map((p) => `<url><loc>${origin}${p}</loc></url>`).join('')}
    <url><loc>http://shop.example.test/</loc></url></urlset>`;
  return createServer((req, res) => {
    const path = req.url.split('?')[0];
    const host = req.headers.host ?? '';
    if (path === '/robots.txt') return res.end(`User-agent: *\nAllow: /\nDisallow: /login\nSitemap: ${origin}/sitemap.xml\n`);
    // every host, including "other" hosts, serves the main sitemap (the subdomain mistake)
    if (path === '/sitemap.xml') { res.setHeader('content-type', 'application/xml'); return res.end(sitemap); }
    if (host.startsWith('localhost') && path === '/') {
      return res.end(SHELL(`<title>Shop</title><link rel="canonical" href="http://localhost:${port}/">`));
    }
    if (pages[path]) { res.setHeader('content-type', 'text/html'); return res.end(pages[path]); }
    res.statusCode = 404; res.end('not found');
  });
}

test('finds each planted defect and exits 1', async () => {
  const server = site(0);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  server.close(); // rebind with the port known to the page builder
  const real = site(port);
  await new Promise((r) => real.listen(port, '127.0.0.1', r));
  const script = fileURLToPath(new URL('./crawl-audit.mjs', import.meta.url));
  const { code, out } = await new Promise((resolve) =>
    execFile(process.execPath, [script, `http://127.0.0.1:${port}`, '--delay', '0', '--hosts', `http://localhost:${port}`], (err, stdout) =>
      resolve({ code: err ? err.code : 0, out: stdout }),
    ),
  );
  real.close();
  const expect = [
    /FAIL\s+\[sitemap\] 1 URL\(s\) on another host/,
    /FAIL\s+\[h1\] \/ has 0 <h1>/,
    /FAIL\s+\[thin HTML\] \/: 0 visible words/,
    /WARN\s+\[title\] \/ title is \d+ chars/,
    /FAIL\s+\[h1\] \/blog\/post has 2 <h1>/,
    /FAIL\s+\[sitemap vs noindex\] \/faq is in the sitemap but says noindex/,
    /FAIL\s+\[canonical\] \/s\/shop canonical points elsewhere/,
    /FAIL\s+\[status\] \/gone → 404 but it is in the sitemap/,
    /FAIL\s+\[site name\] WebSite name "Example Plumbing \(Leeds\)" ≠ og:site_name/,
    /FAIL\s+\[site name\] doubled alternateName/,
    /FAIL\s+\[site name\] og:site_name differs across pages/,
    /WARN\s+\[robots vs noindex\] \/login says noindex but robots.txt blocks crawling/,
    /FAIL\s+\[other host\] http:\/\/localhost:\d+\/sitemap.xml serves a sitemap/,
    /FAIL\s+\[other host\] http:\/\/localhost:\d+\/ canonical .* is not on/,
  ];
  for (const re of expect) assert.match(out, re, `missing: ${re}\n\n${out}`);
  assert.equal(code, 1);
});
