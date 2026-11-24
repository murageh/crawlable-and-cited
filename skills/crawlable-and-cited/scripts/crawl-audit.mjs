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

import { auditSite } from './audit-core.mjs';

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.error('Usage: node crawl-audit.mjs <origin> [--paths /,/blog] [--hosts a.example.com,b.com] [--max 80] [--delay 1200] [--title-max 65] [--json out.json]');
  process.exit(2);
}
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 && args[i + 1] ? args[i + 1] : dflt;
};
const list = (name) => (opt(name, '') || '').split(',').filter(Boolean);

const { origin, rows, findings, sitemapCount } = await auditSite(new URL(args[0]).origin, {
  max: Number(opt('max', 80)),
  titleMax: Number(opt('title-max', 65)),
  delayMs: Number(opt('delay', 1200)),
  paths: opt('paths', null) ? list('paths') : undefined,
  hosts: list('hosts'),
});

// ---- report
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(`\nCrawl audit of ${origin}: ${rows.length} page(s), ${sitemapCount} sitemap URL(s)\n`);
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
