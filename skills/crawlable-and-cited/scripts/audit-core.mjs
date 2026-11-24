/**
 * audit-core.mjs: the checks behind crawl-audit.mjs, importable. Zero dependencies, Node 18+.
 *
 *   import { auditSite } from '@crispice/citeready';
 *   const report = await auditSite('https://example.com', { deadlineMs: 20000 });
 *
 * Pass `fetch` (signature (url, init) => Promise<Response>) to route requests through your
 * own client, e.g. an SSRF-guarded one. If it throws, the error's message is shown in an
 * INCONCLUSIVE finding ("could not fetch: ..."); errors named 'GuardError' or with
 * `noRetry: true` are not retried. When `deadlineMs` elapses, no new fetches start,
 * in-flight ones are aborted through the signal, `truncated` is true and INCONCLUSIVE findings say so.
 */

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

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

class DeadlineError extends Error {}

// Statuses that mean the site blocked, challenged or failed the audit request: not proof of a defect.
const BLOCKED = [0, 403, 429, 502, 503];
const blockedWhy = (status) =>
  `the site blocked or challenged the audit (${status || 'network error'}); this is not proof crawlers are refused. Rerun later or with a longer delay between requests, then check it in the search engines' own URL inspection tools`;
// Why a response could not be judged: the thrown error's own message, or the blocked reason.
const whyNot = (r) => (r.error ? `could not fetch: ${r.error}` : blockedWhy(r.status));

export async function auditSite(originInput, opts = {}) {
  const state = {};
  try { return await runAudit(originInput, opts, state); } finally { clearTimeout(state.timer); }
}

async function runAudit(originInput, opts, state) {
  const origin = new URL(originInput).origin;
  const MAX = opts.max ?? 80;
  const TITLE_MAX = opts.titleMax ?? 65;
  const DELAY = opts.delayMs ?? 1200;
  const RETRIES = opts.retries ?? 2;
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const HEADERS = { 'user-agent': opts.userAgent ?? DEFAULT_UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en;q=0.9' };

  const findings = [];
  const add = (level, check, detail) => findings.push({ level, check, detail });

  // Deadline: every await that can take time is raced against one timer.
  const controller = new AbortController();
  let expired = false;
  const deadline = opts.deadlineMs != null
    ? new Promise((_, rej) => { state.timer = setTimeout(() => { expired = true; controller.abort(); rej(new DeadlineError()); }, opts.deadlineMs); })
    : null;
  deadline?.catch(() => {}); // no unhandled rejection when nothing is racing at that moment
  const race = (p) => {
    if (expired) { Promise.resolve(p).catch(() => {}); throw new DeadlineError(); }
    return deadline ? Promise.race([p, deadline]) : p;
  };
  const sleep = (ms) => race(new Promise((r) => setTimeout(r, ms)));

  async function get(url, redirect = 'manual') {
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const res = await race(fetchFn(url, { headers: HEADERS, redirect, signal: controller.signal }));
        const body = await race(res.text());
        // Rate limiting / CDN challenge of THIS script: back off and retry, then report the code.
        if ([429, 502, 503].includes(res.status) && attempt < RETRIES) { await sleep(5000 * 2 ** attempt); continue; }
        return { status: res.status, location: res.headers.get('location'), body, type: res.headers.get('content-type') || '' };
      } catch (e) {
        if (e instanceof DeadlineError) throw e;
        const noRetry = e?.name === 'GuardError' || e?.noRetry === true;
        if (noRetry || attempt === RETRIES) return { status: 0, error: e?.message || String(e), body: '' };
        await sleep(1500);
      }
    }
    return { status: 0, body: '' };
  }

  const norm = (u) => { try { const x = new URL(u, origin); x.hash = ''; return x.href.replace(/\/$/, '') || x.href; } catch { return u; } };

  const rows = [];
  let sitemapLocs = [];
  let disallow = [];
  let truncated = false;

  try {
    // ---- robots.txt
    const robots = await get(`${origin}/robots.txt`);
    // Only a 200 body is robots.txt; a blocked response may be a challenge page.
    const robotsTxt = robots.status === 200 ? robots.body : '';
    disallow = [...robotsTxt.matchAll(/^\s*Disallow:\s*(\S+)/gim)].map((m) => m[1]);
    if (BLOCKED.includes(robots.status)) add('INCONCLUSIVE', 'robots.txt', `${origin}/robots.txt: ${whyNot(robots)}`);
    else if (robots.status !== 200) add('FAIL', 'robots.txt', `${origin}/robots.txt returned ${robots.status}`);
    if (/^\s*Disallow:\s*\/\s*$/im.test(robotsTxt)) add('FAIL', 'robots.txt', 'Disallow: / blocks the whole site');
    const sitemapRefs = [...robotsTxt.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    if (robots.status === 200 && !sitemapRefs.length) add('WARN', 'robots.txt', 'no Sitemap: line');

    // ---- sitemap
    const sitemapUrl = sitemapRefs[0] ?? `${origin}/sitemap.xml`;
    const sm = await get(sitemapUrl, 'follow');
    if (BLOCKED.includes(sm.status)) add('INCONCLUSIVE', 'sitemap', `${sitemapUrl}: ${whyNot(sm)}`);
    else if (sm.status !== 200) add('FAIL', 'sitemap', `${sitemapUrl} returned ${sm.status}`);
    else {
      sitemapLocs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
      if (/<sitemapindex/i.test(sm.body)) {
        const kids = sitemapLocs; sitemapLocs = [];
        for (const k of kids.slice(0, 20)) {
          const r = await get(k, 'follow');
          if (BLOCKED.includes(r.status)) { add('INCONCLUSIVE', 'sitemap', `${k}: ${whyNot(r)}`); continue; }
          if (r.status !== 200) { add('FAIL', 'sitemap', `${k} returned ${r.status}`); continue; }
          sitemapLocs.push(...[...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]));
        }
      }
      const foreign = sitemapLocs.filter((u) => { try { return new URL(u).origin !== origin; } catch { return true; } });
      if (foreign.length) add('FAIL', 'sitemap', `${foreign.length} URL(s) on another host (a sitemap may only list its own host): ${foreign.slice(0, 3).join(', ')}`);
    }

    // ---- pages
    // "blog" and "/blog" both work, "." is home.
    const toUrl = (p) => new URL(p === '.' ? '/' : p.startsWith('/') ? p : `/${p}`, origin).href;
    const paths = opts.paths?.length ? opts.paths : null;
    const targets = paths ? paths.map(toUrl) : sitemapLocs.length ? [...sitemapLocs] : [`${origin}/`];
    if (!targets.some((u) => norm(u) === norm(`${origin}/`))) targets.unshift(`${origin}/`);
    for (const url of [...new Set(targets)].slice(0, MAX)) {
      const r = await get(url);
      const a = r.status === 200 ? analyse(r.body) : null;
      rows.push({ url, status: r.status, location: r.location, ...(r.error ? { error: r.error } : {}), ...(a ?? {}) });
      await sleep(DELAY);
    }
  } catch (e) {
    if (!(e instanceof DeadlineError)) throw e;
    truncated = true;
  }

  // ---- per-page checks (on whatever was fetched)
  const inSitemap = new Set(sitemapLocs.map(norm));
  for (const r of rows) {
    const p = new URL(r.url).pathname;
    const listed = inSitemap.has(norm(r.url));
    if (BLOCKED.includes(r.status)) {
      // The CDN rate-limited or challenged this script; that is not proof crawlers are refused.
      add('INCONCLUSIVE', 'status', `${p}: ${whyNot(r)}`);
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

  if (!truncated) {
    try {
      // ---- noindex pages that robots.txt blocks (noindex never read)
      for (const d of disallow.filter((x) => x !== '/').slice(0, 15)) {
        const r = await get(new URL(d, origin).href);
        if (r.status === 200 && analyse(r.body).robots.includes('noindex')) {
          add('WARN', 'robots vs noindex', `${d} says noindex but robots.txt blocks crawling, so the noindex is never read; if the URL is linked anywhere public it can be indexed as a bare URL (allow crawling and keep noindex)`);
        }
        await sleep(300);
      }

      // ---- other hosts (subdomains, custom domains)
      for (const h of (opts.hosts ?? []).filter(Boolean)) {
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
    } catch (e) {
      if (!(e instanceof DeadlineError)) throw e;
      truncated = true;
    }
  }

  if (truncated) {
    add('INCONCLUSIVE', 'time limit', `The audit ran out of time (${opts.deadlineMs} ms) and stopped early. Pages it did not reach were not checked, so they are not failures; rerun with a longer limit or audit fewer pages.`);
    if (!rows.length) add('INCONCLUSIVE', 'time limit', 'No page was fetched before the time limit, so there are no page results.');
  }
  return { origin, rows, findings, sitemapCount: sitemapLocs.length, truncated };
}
