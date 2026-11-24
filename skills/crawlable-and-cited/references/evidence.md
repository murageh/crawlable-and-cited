# Evidence: what to collect, and where

Collect the raw material first. Dashboards summarise, and the summary hides the cause.

| Evidence | Where | What it settles |
|---|---|---|
| Raw HTML per page type | `node scripts/crawl-audit.mjs https://<domain> --json out.json` | Whether crawlers that do not run JavaScript get an h1, text and links |
| Rendered HTML as Bing sees it | Bing Webmaster → URL Inspection → **Live URL** → View tested page (HTML tab) | Whether Bing's renderer gets the content after JavaScript |
| Rendered HTML as Google sees it | Search Console → URL Inspection → **Test live URL** → View tested page | Same, for Google; also the canonical Google chose |
| Index coverage | Bing → Site Explorer (indexed URL count); Search Console → Pages | How much of the sitemap is actually indexed |
| Query-level demand | Search Console → Performance → Export (Queries, Pages, Countries, Devices); Bing → Search Performance → **Keywords** and **Pages** tabs → Download | The words people search, and which pages they land on. The Overview export only has daily totals. |
| Sitemap status | Bing → Sitemaps; Search Console → Sitemaps | Which sitemaps the engines hold (remove ones served on subdomains) |
| Crawler traffic | Cloudflare → AI Crawl Control → Overview (per crawler, allowed vs unsuccessful) | Whether AI crawlers visit at all, and what they get |
| Crawler blocks by your app | Server logs: search the bot-guard or WAF reason (e.g. `bot_blocked`) and filter by crawler user agent | Whether your own middleware refuses crawlers, often on the API calls pages make while rendering |
| CDN bot settings | Cloudflare → Security → Settings → Bot traffic; AI Crawl Control policies | Whether search, training or agent crawlers are blocked |
| Customer language | Call notes, messaging-app and chat transcripts, enquiry forms, on-site search terms, sign-up answers (counts and phrases only, no personal data) | Intent in the customers' own words, including local language and slang, recorded in the project profile |
| Funnel | Database counts by month and stage (visit → start → paid → completed), with utm columns | The baseline the change must beat. Analytics can undercount badly. |
| Business entity | Google Business Profile share link → resolve it to the knowledge graph id (`kgmid=/g/...`); Bing Places | The name to use as the site name, and the `sameAs` target |

## Reading the results

- **"Discovered but not crawled" (Bing)** means low crawl priority, not a ban. Raise it with crawlable HTML, IndexNow and links from other sites.
- **Search Console "Duplicate without user-selected canonical"** is the early sign of subdomains or custom domains competing with the main URL.
- **Pages getting impressions on a subdomain URL** (for example `shop.example.com/`) means a client-side canonical is overriding the server's canonical.
- **Spoofed user agents get challenged (429/403/"Just a moment").** That is the CDN, not your page. Mark the result inconclusive and use the engines' own live tests.
