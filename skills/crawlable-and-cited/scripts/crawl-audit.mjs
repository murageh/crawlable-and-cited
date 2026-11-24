#!/usr/bin/env node
/**
 * crawl-audit.mjs: what a crawler that does NOT run JavaScript gets from your site.
 * Zero dependencies, Node 18+.
 *
 *   node crawl-audit.mjs https://example.co.ke
 *   node crawl-audit.mjs https://example.co.ke --paths /,/blog,/faq --hosts shop1.example.co.ke,shopdomain.com
 *   node crawl-audit.mjs https://example.co.ke --max 60 --json report.json
 *
 * Reads robots.txt and sitemap.xml, fetches each page (sitemap URLs, or --paths) once,
 * and checks the raw HTML: status, <title> length, one <h1>, visible words, links,
 * canonical, robots meta, og:site_name and the WebSite JSON-LD name. Then cross-checks:
 * sitemap URLs that are noindex / redirect / non-canonical, robots.txt Disallow on pages
 * that rely on noindex, one site name across pages, and (with --hosts) subdomains or
 * custom domains that serve their own sitemap or a self-canonical.
 *
 * It fetches with an ordinary browser User-Agent on purpose: CDNs (Cloudflare) challenge
 * requests that merely CLAIM to be Googlebot/bingbot from a non-crawler IP, so a spoofed
 * crawler UA tests your CDN, not your page. Servers that vary HTML by User-Agent are not
 * covered; confirm with Bing URL Inspection "Live URL" and Google URL Inspection "Test live URL".
 *
 * Exit code 1 when any FAIL is found, so it can gate a deploy.
 */

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node crawl-audit.mjs <origin> [--paths /,/blog] [--hosts a.example.com,b.com] [--max 80] [--delay 1200] [--title-max 65] [--json out.json]');
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 && args[i + 1] ? args[i + 1] : dflt;
};
const origin = new URL(args[0]).origin;
const MAX = Number(opt('max', 80));
const TITLE_MAX = Number(opt('title-max', 65));
const DELAY = Number(opt('delay', 1200));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en;q=0.9' };

const findings = [];
const add = (level, check, detail) => findings.push({ level, check, detail });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, redirect = 'manual') {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect });
      const body = await res.text();
      // Rate limiting / CDN challenge of THIS script: back off and retry, then report the code.
      if ([429, 502, 503].includes(res.status) && attempt < 2) { await sleep(5000 * 2 ** attempt); continue; }
      return { status: res.status, location: res.headers.get('location'), body, type: res.headers.get('content-type') || '' };
    } catch (e) {
      if (attempt === 2) return { status: 0, error: String(e), body: '' };
      await sleep(1500);
    }
  }
  return { status: 0, body: '' };
}

const attr = (html, re) => (html.match(re) || [])[1];
const decode = (s) => (s ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function analyse(html) {
  const head = (html.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
  const body = (html.match(/<body[\s\S]*<\/body>/i) || [''])[0].replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ');
  const text = decode(body.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const metaContent = (name) =>
    attr(head, new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) ??
    attr(head, new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i'));
  const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try { const j = JSON.parse(m[1]); return Array.isArray(j) ? j : j['@graph'] ?? [j]; } catch { return [{ '@type': '(invalid JSON-LD)' }]; }
  });
  const website = ld.find((n) => n['@type'] === 'WebSite');
  return {
    title: decode(attr(head, /<title[^>]*>([^<]*)<\/title>/i) ?? ''),
    h1: (body.match(/<h1[\s>]/gi) || []).length,
    words: text ? text.split(' ').length : 0,
    links: (body.match(/<a\s[^>]*href=/gi) || []).length,
    canonical: attr(head, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ?? attr(head, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i),
    robots: (metaContent('robots') ?? '').toLowerCase(),
    siteName: decode(metaContent('og:site_name') ?? ''),
    websiteName: website ? decode(String(website.name ?? '')) : '',
    websiteAlt: website ? [].concat(website.alternateName ?? []).map(String) : [],
    ldTypes: [...new Set(ld.map((n) => n['@type']).flat())],
  };
}

const norm = (u) => { try { const x = new URL(u, origin); x.hash = ''; return x.href.replace(/\/$/, '') || x.href; } catch { return u; } };

// ---- robots.txt
const robots = await get(`${origin}/robots.txt`);
const disallow = robots.status === 200
  ? [...robots.body.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1])
  : [];
if (robots.status !== 200) add('FAIL', 'robots.txt', `${origin}/robots.txt returned ${robots.status}`);
if (/^\s*Disallow:\s*\/\s*$/im.test(robots.body)) add('FAIL', 'robots.txt', 'Disallow: / blocks the whole site');
const sitemapRefs = [...robots.body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
if (robots.status === 200 && !sitemapRefs.length) add('WARN', 'robots.txt', 'no Sitemap: line');

// ---- sitemap
const sitemapUrl = sitemapRefs[0] ?? `${origin}/sitemap.xml`;
const sm = await get(sitemapUrl, 'follow');
let sitemapLocs = [];
if (sm.status !== 200) add('FAIL', 'sitemap', `${sitemapUrl} returned ${sm.status}`);
else {
  sitemapLocs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const childMaps = /<sitemapindex/i.test(sm.body);
  if (childMaps) {
    const kids = sitemapLocs; sitemapLocs = [];
    for (const k of kids.slice(0, 20)) {
      const r = await get(k, 'follow');
      sitemapLocs.push(...[...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
    }
  }
  const foreign = sitemapLocs.filter((u) => { try { return new URL(u).origin !== origin; } catch { return true; } });
  if (foreign.length) add('FAIL', 'sitemap', `${foreign.length} URL(s) on another host (a sitemap may only list its own host): ${foreign.slice(0, 3).join(', ')}`);
}

// ---- pages
const paths = opt('paths', null);
// Git Bash rewrites a leading "/" into a Windows path; "blog" and "/blog" both work, "." is home.
const toUrl = (p) => new URL(p === '.' ? '/' : p.startsWith('/') ? p : `/${p}`, origin).href;
const targets = paths ? paths.split(',').map(toUrl) : sitemapLocs.length ? sitemapLocs : [`${origin}/`];
if (!targets.some((u) => norm(u) === norm(`${origin}/`))) targets.unshift(`${origin}/`);
const rows = [];
for (const url of [...new Set(targets)].slice(0, MAX)) {
  const r = await get(url);
  const a = r.status === 200 ? analyse(r.body) : null;
  rows.push({ url, status: r.status, location: r.location, ...(a ?? {}) });
  await sleep(DELAY);
}

const inSitemap = new Set(sitemapLocs.map(norm));
for (const r of rows) {
  const p = new URL(r.url).pathname;
  const listed = inSitemap.has(norm(r.url));
  if ([0, 429, 502, 503].includes(r.status)) {
    // The CDN rate-limited or challenged this script; that is not proof crawlers are refused.
    add('INCONCLUSIVE', 'status', `${p} → ${r.status || 'network error'} (rerun slower with --delay 3000, then check Bing/Google live URL tests)`);
    continue;
  }
  if (r.status !== 200) {
    add(listed ? 'FAIL' : 'WARN', 'status', `${p} → ${r.status}${r.location ? ` (redirects to ${r.location})` : ''}${listed ? ' but it is in the sitemap' : ''}`);
    continue;
  }
  const noindex = r.robots.includes('noindex');
  if (noindex && listed) add('FAIL', 'sitemap vs noindex', `${p} is in the sitemap but says noindex`);
  if (noindex) continue;
  if (r.h1 !== 1) add('FAIL', 'h1', `${p} has ${r.h1} <h1> in the HTML crawlers get`);
  if (r.words < 120) add(r.words < 30 ? 'FAIL' : 'WARN', 'thin HTML', `${p}: ${r.words} visible words before JavaScript (empty app shell?)`);
  if (r.links < 3) add('WARN', 'links', `${p}: ${r.links} links in the HTML: crawlers cannot discover pages from it`);
  if (!r.title) add('FAIL', 'title', `${p} has no <title>`);
  else if (r.title.length > TITLE_MAX) add('WARN', 'title', `${p} title is ${r.title.length} chars (>${TITLE_MAX}): "${r.title}"`);
  if (!r.canonical) add('WARN', 'canonical', `${p} has no canonical`);
  else if (norm(r.canonical) !== norm(r.url)) add(listed ? 'FAIL' : 'WARN', 'canonical', `${p} canonical points elsewhere: ${r.canonical}${listed ? ' (sitemap should list the canonical URL)' : ''}`);
  if (disallow.some((d) => d !== '/' && p.startsWith(d))) add('WARN', 'robots vs page', `${p} is indexable but robots.txt disallows it`);
}

// ---- one site name
const home = rows.find((r) => norm(r.url) === norm(`${origin}/`));
const names = new Set(rows.filter((r) => r.status === 200 && r.siteName).map((r) => r.siteName));
if (home?.status === 200) {
  if (!home.websiteName) add('FAIL', 'site name', 'home page has no WebSite JSON-LD with a name (Google uses it to choose the site name in results)');
  if (!home.siteName) add('WARN', 'site name', 'home page has no og:site_name');
  if (home.websiteName && home.siteName && home.websiteName !== home.siteName) add('FAIL', 'site name', `WebSite name "${home.websiteName}" ≠ og:site_name "${home.siteName}"`);
  if (home.websiteAlt.some((a) => /\(([^)]+)\)\s*\(\1\)/.test(a))) add('FAIL', 'site name', `doubled alternateName: ${home.websiteAlt.join(' | ')}`);
}
if (names.size > 1) add('FAIL', 'site name', `og:site_name differs across pages: ${[...names].slice(0, 5).join(' | ')}`);

// ---- noindex pages that robots.txt blocks (noindex never read)
for (const d of disallow.filter((x) => x !== '/').slice(0, 15)) {
  const r = await get(new URL(d, origin).href);
  if (r.status === 200 && analyse(r.body).robots.includes('noindex')) {
    add('WARN', 'robots vs noindex', `${d} says noindex but robots.txt blocks crawling, so the noindex is never read; if the URL is linked anywhere public it can be indexed as a bare URL (allow crawling and keep noindex)`);
  }
  await sleep(300);
}

// ---- other hosts (subdomains, custom domains)
for (const h of (opt('hosts', '') || '').split(',').filter(Boolean)) {
  const o = h.startsWith('http://') || h.startsWith('https://') ? new URL(h).origin : `https://${h}`;
  const s = await get(`${o}/sitemap.xml`, 'follow');
  if (s.status === 200 && /<urlset|<sitemapindex/i.test(s.body)) add('FAIL', 'other host', `${o}/sitemap.xml serves a sitemap; serve 404 so only ${origin} has one`);
  const pg = await get(`${o}/`, 'follow');
  if (pg.status === 200) {
    const a = analyse(pg.body);
    if (!a.canonical) add('WARN', 'other host', `${o}/ has no canonical`);
    else if (new URL(a.canonical, o).origin !== origin) add('FAIL', 'other host', `${o}/ canonical ${a.canonical} is not on ${origin}: it competes with the main site`);
  }
}

// ---- report
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(`\nCrawl audit of ${origin}: ${rows.length} page(s), ${sitemapLocs.length} sitemap URL(s)\n`);
console.log(`${pad('path', 46)} ${pad('st', 4)} ${pad('h1', 3)} ${pad('words', 6)} ${pad('links', 5)} ${pad('title', 5)} robots`);
for (const r of rows) {
  const p = new URL(r.url).pathname;
  console.log(`${pad(p, 46)} ${pad(r.status, 4)} ${pad(r.h1 ?? '', 3)} ${pad(r.words ?? '', 6)} ${pad(r.links ?? '', 5)} ${pad(r.title?.length ?? '', 5)} ${r.robots ?? ''}`);
}
console.log('');
for (const level of ['FAIL', 'WARN', 'INCONCLUSIVE']) for (const f of findings.filter((x) => x.level === level)) console.log(`${level}  [${f.check}] ${f.detail}`);
const count = (l) => findings.filter((f) => f.level === l).length;
const fails = count('FAIL');
console.log(`\n${fails} FAIL, ${count('WARN')} WARN, ${count('INCONCLUSIVE')} INCONCLUSIVE. Confirm with Bing URL Inspection (Live URL) and Google URL Inspection (Test live URL).`);
const out = opt('json', null);
if (out) { const { writeFileSync } = await import('node:fs'); writeFileSync(out, JSON.stringify({ origin, rows, findings }, null, 2)); }
process.exit(fails ? 1 : 0);
