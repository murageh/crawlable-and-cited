# Adapting the audit to a project

The audit is generic. The project profile makes it specific: which hosts to check, which logs to search, which words customers use, which prompts to track. Build the profile once with the owner, save it in the project, and keep it current after every audit.

## Where it lives

- **Claude Code:** `.claude/skills/crawlable-and-cited-<project>/SKILL.md`, with a description like "Use when auditing <project>'s pages, before launch or after a release". The body is the filled-in `templates/project-profile.md` plus anything the project learned.
- **Anywhere else:** `docs/seo/project-profile.md` in the project repository.

## Filling it in

Ask the owner for anything you cannot read from the code, the DNS or the dashboards. Never guess a hostname, a business name or a market.

| Section | How to find it |
|---|---|
| Canonical origin and every other host | DNS records, hosting dashboard domains, platform hostnames (`*.vercel.app` and similar), subdomain or tenant routing in the code, custom domains in the database |
| Stack and render path | `package.json` / framework config; how `<head>` is set on the server and in the browser; whether the page body exists before JavaScript runs |
| Hosting, CDN, firewall | Where logs live, what the bot and AI-crawler settings are, which middleware blocks requests (search for user-agent checks) |
| Market | Country, cities, currency, languages and slang customers use, and the local business directories (Google Business Profile everywhere; Bing Places; Apple Business Connect; plus market ones such as Yelp in the US or Yell in the UK) |
| Customer channels | Where customers say what they want: calls, WhatsApp or other messaging apps, chat, forms, reviews, on-site search |
| Conversion | What counts (booking, call, order, sign-up), where it is recorded, and whether it stores utm tags |
| Analytics and consoles | Search Console and Bing Webmaster verification method, the analytics property and its start date |
| Identity | Exact business-listing name and link (resolve share links to the `kgmid`), alternate spellings, social profiles, the one phone and email to publish |
| Content source | CMS, markdown, database. Does an invalid file fail the build or get skipped? |
| AI panel | 20 prompts in the market's language and location (see `ai-visibility-panel.md`), and the latest baseline |
| Baselines | Indexed URL counts, impressions and clicks, conversion counts by month, each with its date |

## Stack notes

| Stack | Check first | Usually not applicable |
|---|---|---|
| Single-page app (Vite, CRA) with a server that injects meta | The body before JavaScript; client meta overriding server meta; canonical from `window.location`; parity tests | — |
| Next.js / Nuxt / SvelteKit (server-rendered) | Any `'use client'` page holding the main content; canonical from request headers; `notFound()` for unknown slugs; preview deployments set to noindex | Body injection, parity tests |
| WordPress | Theme `<h1>` count; plugin-generated sitemaps listing tag and author archives; `noindex` on search pages; staging sites indexed | Body injection |
| Shopify, Webflow, Wix, Squarespace | Platform subdomain and duplicate collection/product URLs; theme `<h1>`; image weight; app or script bloat | Server code fixes: use platform settings and theme edits |
| Static site (Astro, Hugo, Eleventy) | Build skipping bad frontmatter; sitemap freshness; trailing-slash canonicals | Render path checks |

## Market notes

- **Currency and units** appear on the page as customers write them (for example "KES 1,500", "£80 call-out", "$120").
- **Language:** prompts, headings and the facts near the top use the customers' wording, including local terms. Record those terms in the profile.
- **Network:** test speed at the market's typical mobile connection, not office broadband.
- **Directories:** keep the name, address and phone identical across all of them, and list them under `sameAs`.

## After each audit

Update the profile's baselines and any hosts, prompts or decisions that changed, with the date. The next audit compares against them.
