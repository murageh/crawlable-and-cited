// node --test skills/crawlable-and-cited/scripts/audit-core.test.mjs
// auditSite() against the same planted-defect site the CLI self-test uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { auditSite } from './audit-core.mjs';

const SHELL = (head, body = '<div id="root"></div>') =>
  `<!doctype html><html><head>${head}</head><body>${body}<script src="/app.js"></script></body></html>`;

function site(port) {
  const origin = `http://127.0.0.1:${port}`;
  const pages = {
    '/': SHELL(
      `<title>Example Plumbing: Emergency Plumbers, Boiler Repair and Drain Unblocking Today</title>
       <link rel="canonical" href="${origin}/">
       <meta property="og:site_name" content="Example Plumbing: Emergency Plumbers">
       <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Example Plumbing (Leeds)","alternateName":"Example Plumbing (Leeds) (Leeds)","url":"${origin}/"}</script>`,
    ),
    '/blog/post': SHELL(
      `<title>Post</title><link rel="canonical" href="${origin}/blog/post"><meta property="og:site_name" content="Example Plumbing">`,
      `<main><h1>Post</h1><h1>The guide</h1><p>${'word '.repeat(300)}</p><a href="/">a</a><a href="/blog">b</a><a href="/faq">c</a></main>`,
    ),
    '/faq': SHELL(`<title>Example Plumbing</title><meta name="robots" content="noindex, nofollow">`),
    '/s/shop': SHELL(
      `<title>Shop</title><link rel="canonical" href="http://shop.example.test/">`,
      `<main><h1>Shop</h1><p>${'word '.repeat(200)}</p><a href="/">a</a><a href="/s">b</a><a href="/faq">c</a></main>`,
    ),
    '/login': SHELL(`<title>Login</title><meta name="robots" content="noindex">`),
  };
  const sitemap = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${['/', '/blog/post', '/faq', '/s/shop', '/gone'].map((p) => `<url><loc>${origin}${p}</loc></url>`).join('')}
    <url><loc>http://shop.example.test/</loc></url></urlset>`;
  return createServer((req, res) => {
    const path = req.url.split('?')[0];
    const host = req.headers.host ?? '';
    if (path === '/robots.txt') return res.end(`User-agent: *\nAllow: /\nDisallow: /login\nSitemap: ${origin}/sitemap.xml\n`);
    if (path === '/sitemap.xml') { res.setHeader('content-type', 'application/xml'); return res.end(sitemap); }
    if (host.startsWith('localhost') && path === '/') {
      return res.end(SHELL(`<title>Shop</title><link rel="canonical" href="http://localhost:${port}/">`));
    }
    if (pages[path]) { res.setHeader('content-type', 'text/html'); return res.end(pages[path]); }
    res.statusCode = 404; res.end('not found');
  });
}

async function listen() {
  const probe = site(0);
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address();
  probe.close();
  const real = site(port);
  await new Promise((r) => real.listen(port, '127.0.0.1', r));
  return { real, port };
}

test('auditSite returns every planted defect as a finding', async () => {
  const { real, port } = await listen();
  let report;
  try {
    report = await auditSite(`http://127.0.0.1:${port}`, { delayMs: 0, hosts: [`http://localhost:${port}`] });
  } finally { real.close(); }
  const out = report.findings.map((f) => `${f.level}  [${f.check}] ${f.detail}`).join('\n');
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
  assert.equal(report.truncated, false);
  assert.equal(report.sitemapCount, 6);
  assert.ok(report.rows.some((r) => r.url.endsWith('/blog/post') && r.h1 === 2));
});

test('deadlineMs stops a hanging audit and reports it as truncated, not failed', async () => {
  const hang = () => new Promise(() => {});
  const started = Date.now();
  const report = await auditSite('https://example.test', { fetch: hang, deadlineMs: 200, delayMs: 0 });
  assert.ok(Date.now() - started < 3000, 'returned promptly');
  assert.equal(report.truncated, true);
  assert.ok(report.findings.some((f) => f.level === 'INCONCLUSIVE'));
  assert.equal(report.findings.filter((f) => f.level === 'FAIL').length, 0);
});

test('injected fetch is used', async () => {
  const seen = [];
  const fake = async (url) => { seen.push(String(url)); return new Response('nope', { status: 404 }); };
  await auditSite('https://example.test', { fetch: fake, delayMs: 0 });
  assert.ok(seen.includes('https://example.test/robots.txt'));
});

test('deadline aborts the signal passed to the injected fetch', async () => {
  const signals = [];
  const hang = (url, init) => { signals.push(init?.signal); return new Promise(() => {}); };
  await auditSite('https://example.test', { fetch: hang, deadlineMs: 150, delayMs: 0 });
  assert.ok(signals.length > 0 && signals.every((s) => s instanceof AbortSignal));
  assert.ok(signals.every((s) => s.aborted), 'in-flight request was cancelled');
});

for (const status of [403, 429, 503]) {
  test(`a site answering ${status} to the audit is INCONCLUSIVE, never FAIL, and fails fast with retries: 0`, async () => {
    const blocked = async () => new Response('challenge', { status });
    const started = Date.now();
    const report = await auditSite('https://example.test', { fetch: blocked, delayMs: 0, retries: 0 });
    assert.ok(Date.now() - started < 2000, 'no backoff sleeping');
    assert.equal(report.findings.filter((f) => f.level === 'FAIL').length, 0, JSON.stringify(report.findings));
    const inc = report.findings.filter((f) => f.level === 'INCONCLUSIVE');
    assert.ok(inc.some((f) => f.check === 'robots.txt' && /blocked or challenged/.test(f.detail) && f.detail.includes(String(status))));
    assert.ok(inc.some((f) => f.check === 'sitemap'));
    assert.ok(inc.some((f) => f.check === 'status'));
    assert.ok(inc.every((f) => !/--delay/.test(f.detail)), 'no CLI wording');
  });
}

// A fake site served from a map of url -> [status, body].
const fakeSite = (map) => async (url) => {
  const hit = map[String(url)];
  if (!hit) return new Response('not found', { status: 404 });
  return new Response(hit[1], { status: hit[0] });
};
const HOME = '<!doctype html><html><head><title>Home</title></head><body><h1>Home</h1></body></html>';

for (const status of [403, 429, 503]) {
  test(`a sitemap-index child answering ${status} is INCONCLUSIVE with the blocked reason, not silently empty`, async () => {
    const o = 'https://example.test';
    const fetch = fakeSite({
      [`${o}/robots.txt`]: [200, `User-agent: *\nAllow: /\nSitemap: ${o}/sitemap.xml\n`],
      [`${o}/sitemap.xml`]: [200, `<sitemapindex><sitemap><loc>${o}/pages.xml</loc></sitemap></sitemapindex>`],
      [`${o}/pages.xml`]: [status, 'challenge'],
      [`${o}/`]: [200, HOME],
    });
    const report = await auditSite(o, { fetch, delayMs: 0, retries: 0 });
    const f = report.findings.find((x) => x.check === 'sitemap' && x.detail.includes(`${o}/pages.xml`));
    assert.ok(f, JSON.stringify(report.findings));
    assert.equal(f.level, 'INCONCLUSIVE');
    assert.match(f.detail, /blocked or challenged/);
    assert.ok(f.detail.includes(String(status)));
  });
}

test('"Disallow: /" in a blocked robots.txt body (a challenge page) is not a FAIL', async () => {
  const o = 'https://example.test';
  const fetch = fakeSite({
    [`${o}/robots.txt`]: [403, 'Access denied\nDisallow: /\n'],
    [`${o}/sitemap.xml`]: [200, `<urlset><url><loc>${o}/</loc></url></urlset>`],
    [`${o}/`]: [200, HOME],
  });
  const report = await auditSite(o, { fetch, delayMs: 0, retries: 0 });
  assert.ok(!report.findings.some((f) => /Disallow: \/ blocks the whole site/.test(f.detail)), JSON.stringify(report.findings));
});

test('a thrown fetch error is INCONCLUSIVE with its own message, not "blocked or challenged"', async () => {
  const fetch = async () => { throw new Error('body over 2 MB'); };
  const report = await auditSite('https://example.test', { fetch, delayMs: 0, retries: 0 });
  const inc = report.findings.filter((f) => f.level === 'INCONCLUSIVE');
  assert.ok(inc.length > 0);
  assert.ok(inc.some((f) => f.check === 'robots.txt' && f.detail.includes('could not fetch: body over 2 MB')), JSON.stringify(inc));
  assert.ok(inc.every((f) => !/network error/.test(f.detail)), JSON.stringify(inc));
  assert.equal(report.findings.filter((f) => f.level === 'FAIL').length, 0);
});

for (const [label, make] of [
  ['name GuardError', () => Object.assign(new Error('that address is private'), { name: 'GuardError' })],
  ['noRetry: true', () => Object.assign(new Error('too many redirects'), { noRetry: true })],
]) {
  test(`a thrown error with ${label} is not retried`, async () => {
    let calls = 0;
    const fetch = async () => { calls++; throw make(); };
    const started = Date.now();
    const report = await auditSite('https://example.test', { fetch, delayMs: 0, retries: 2, paths: ['/'] });
    assert.ok(Date.now() - started < 1000, 'no retry sleeps');
    // robots.txt, sitemap.xml, / : one call each
    assert.equal(calls, 3);
    assert.ok(report.findings.some((f) => f.level === 'INCONCLUSIVE' && f.detail.includes(`could not fetch: ${make().message}`)));
  });
}
