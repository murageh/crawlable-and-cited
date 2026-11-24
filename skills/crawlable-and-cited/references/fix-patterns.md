# Fix patterns

Each pattern fixes one audit finding. The examples use TypeScript, a Fastify-style server and a React single-page app; the ideas port to other stacks.

## 1. Readable HTML for crawlers that do not run JavaScript

Fill the app's root element on the server with the page's own content. `createRoot().render()` replaces it on mount (use `hydrateRoot` only if the markup is React's own server render).

```ts
// Server: after injecting <head> meta, put the page content inside #root.
export function injectBody(html: string, body: string): string {
  if (!body) return html;
  // Match the dev and minified spellings: <div id="root"></div> and <div id=root></div>
  return html.replace(/<div id=(?:"root"|root)><\/div>/i, () => `<div id="root">${body}</div>`);
}
// Per route: nav links, ONE <h1>, the real text (full article, services with prices,
// FAQ questions and answers), footer with the published email and phone. Escape every
// value from the database. noindex pages get no body.
```

## 2. One source for things both sides render

Put the site identity, page headings and title rule in a shared package that the server and the client both import:

```ts
export const SITE_NAME = 'Example Plumbing (Leeds)';     // = the business listing's exact name
export const SITE_ALTERNATE_NAMES = ['Example Plumbing', 'example.com'];
export const CANONICAL_ORIGIN = 'https://example.com';
export const PAGE_HEADINGS = { home: 'Emergency plumbers in Leeds', faq: 'Frequently Asked Questions' } as const;

const BRAND_SUFFIX = /\s*[|\-–—:]\s*Example Plumbing(?:\s*\(Leeds\))?\s*$/i;
export function searchTitle(title: string, max = 65): string {
  const base = title.replace(BRAND_SUFFIX, '').trim();
  if (!base) return SITE_NAME;
  if (base.toLowerCase().startsWith('example plumbing')) return base;          // already leads with the brand
  const branded = `${base} | ${SITE_NAME}`;
  return branded.length <= max ? branded : base;                    // drop the brand, never overflow
}
// buildSiteOrganization() / buildSiteWebSite() return the ONE Organization and WebSite node.
// og:site_name is always SITE_NAME, on every page, including shop pages on the main domain.
```

Then add a **parity test** on each side. The server test renders each body and expects its h1 to equal `PAGE_HEADINGS.x`; the client test renders each page and expects the same. A copy change on one side then fails the build.

## 3. Canonical never comes from the request host in the browser

```tsx
// Wrong: on a subdomain or custom domain, this declares that host canonical once JS runs.
<link rel="canonical" href={window.location.href} />
// Right:
<link rel="canonical" href={`${CANONICAL_ORIGIN}/s/${shop.slug}`} />
```

## 4. Sitemap only on the canonical host, only indexable URLs

```ts
export function servesSitemap(host: string, rootDomain: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return h === rootDomain || h === 'localhost' || h === '127.0.0.1';   // other hosts: 404
}
// Leave out noindex pages (booking steps, drafts) and redirects; give every indexable
// route a real route type instead of a noindex fallback.
```

## 5. robots.txt: do not block pages that rely on noindex

```
# Sign-in pages are NOT disallowed: they carry noindex, which crawlers must fetch to read.
Disallow: /admin/
Sitemap: https://example.com/sitemap.xml
```

## 6. Your own bot guard lets search and AI crawlers render

Rendering crawlers call your public API without browser headers (such as Accept-Language). Exempt known search and AI crawlers from header checks on public data only. Keep blocking SEO-tool crawlers and header-less "browsers".

```ts
const SEARCH_AND_AI_CRAWLER = /Googlebot|bingbot|OAI-SearchBot|ChatGPT-User|GPTBot|ClaudeBot|Claude-User|PerplexityBot|Perplexity-User|Applebot|DuckDuckBot|DuckAssistBot/i;
if (isPublicCatalog && !SEARCH_AND_AI_CRAWLER.test(ua)) { /* browser-header checks */ }
```

## 7. One h1: demote headings inside content

```ts
export const demoteArticleHeadings = (html: string) => html.replace(/<(\/?)h1(?=[\s>])/gi, '<$1h2');
```

## 8. Content builds fail loudly

```ts
// One test per file, using the production parser: a missing quote fails CI instead of
// silently removing a ranking post from the site and the sitemap.
for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  it(`${file} parses`, async () => expect((await parseMarkdownFile(join(dir, file))).title).toBeTruthy());
}
```

## 9. IndexNow: tell engines what changed

- Serve the key at `/<key>.txt` as `text/plain` (register it before any static-file wildcard).
- After each deploy, submit only URLs changed in the last few days, plus the listing pages that show them: `POST https://api.indexnow.org/indexnow {host, key, keyLocation, urlList}`, at most 10,000 URLs per request.
- Once, at setup, submit the whole sitemap. `200` or `202` means accepted.

## 10. Measurement that cannot silently break

- Save utm tags on the record that matters (booking, sign-up), and test that a `?utm_source=test` visit stores them.
- When pull requests are stacked, confirm each one's commits are on the deployed branch: `git merge-base --is-ancestor <sha> origin/main`.
