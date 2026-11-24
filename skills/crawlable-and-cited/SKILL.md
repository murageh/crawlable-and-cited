---
name: crawlable-and-cited
description: Use when a business website, shop page, landing page or blog is about to go live or has just launched; when Bing Webmaster or Search Console report "H1 missing", thin content, "Discovered but not crawled", duplicate or noindex problems; when Google shows the URL instead of the site name; when a JavaScript single-page app needs to rank; or when the business is not cited by ChatGPT, Copilot, Perplexity or Gemini.
---

# Crawlable and cited

## Overview

Audit what crawlers **receive** and what the **data** shows, never what your browser renders or what a dashboard summarises. Every finding cites its evidence (a command output, an export, a log line, a screenshot) and says what would prove it fixed.

## 0. Adapt to this project first

Look for a project profile: `.claude/skills/crawlable-and-cited-<project>/SKILL.md`, or `docs/seo/project-profile.md`.

- **If it exists:** read it and use its hosts, commands, log searches, prompts and baselines for every gate below.
- **If it does not exist:** fill in `templates/project-profile.md` with the owner, using `references/adapting.md`. It records the stack, every hostname, market, language and currency, customer channels, CDN and hosting, analytics and the conversion. Save it as the project's adaptation before gate 1.

Each gate below names what to look up in the profile. Skip a check only when the profile shows it cannot apply (for example, no subdomains), and say so in the report.

## Gates, in order

Each gate can make the later ones meaningless, so do not skip ahead.

1. **Evidence.** Collect the raw material before judging anything. See `references/evidence.md`, using the profile's tools.
2. **Crawlability.** Run `node scripts/crawl-audit.mjs https://<domain> --hosts <every other host in the profile>` (Git Bash: prefix `MSYS_NO_PATHCONV=1`). Every indexable page needs one `<h1>`, real text and links in the raw HTML. Then confirm with Bing URL Inspection "Live URL" and Google "Test live URL", and search the server's and firewall's own logs for blocked crawler user agents.
3. **Indexing signals agree.** The sitemap lists only 200, indexable, self-canonical URLs on its own host. robots.txt never blocks a page that relies on `noindex`. Every host has a canonical pointing at one origin, and only that origin serves a sitemap. Status codes are honest:
   - Unknown pages return a real 404 (no "not found" page served with 200).
   - http→https and www↔apex are single 301s.
   - Platform hostnames (`*.vercel.app`, `*.onrender.com`, `*.netlify.app`) and preview deployments redirect or send `noindex`.
   - Every URL of an old site 301s to its new equivalent.
4. **One identity.** On the home page, the WebSite JSON-LD `name`, `og:site_name` (on every page), the title brand and the page text use one name, which matches the business listing (Google Business Profile, and the market's own directories). Add `alternateName` (shorter spelling, then the domain) and `sameAs` (listing, socials). Use the same address, phone and email everywhere.
5. **Pages that answer.** One `<h1>`, a title of 65 characters or less, and facts stated plainly near the top: what, where, price in the local currency, how to buy or book.
   - If a page is rendered both on the server and in the browser, the two must say the same thing: build both from one source and add a parity test.
   - Content builds fail on unparseable files; they must never skip them.
   - Location and service pages carry facts that are actually local, not swapped town names (those are doorway pages).
   - Structured data matches what is visible: Organization and WebSite on home; the right LocalBusiness subtype on business pages, with address, hours, services and prices; BlogPosting, FAQPage and BreadcrumbList where they apply. Validate with validator.schema.org.
6. **Fast on a phone.** Run PageSpeed Insights on mobile for the main page types. Target LCP < 2.5 s, INP < 200 ms, CLS < 0.1. Check the JavaScript bundle size in the build output: a multi-MB main chunk means code-split it, and keep server-only modules out of the browser. Size images, and serve them as WebP or AVIF. Test at the network speed of the profile's market.
7. **Intent and journey.** Get intent from query exports and the customers' own words in the profile's channels (calls, chat, messaging apps, enquiry forms, on-site search). The first screen of the pages people actually land on (often articles or service pages, not the home page) confirms that intent and leads to the conversion.
8. **Measurement is real.** Prove tracking reached production: the code is on the deployed branch, and a test visit with `?utm_source=test` creates a conversion record that carries it. Use counts from the system of record (database, CRM, shop) over analytics totals.
9. **Submit and baseline.** Use IndexNow (key file plus changed URLs only), submit the sitemaps, request indexing of the home page, and record the AI prompt panel baseline in the profile's language and location (`references/ai-visibility-panel.md`).

Fix patterns with code: `references/fix-patterns.md`.

## Traps (each one cost a real site its rankings)

| Looks right | Actually |
|---|---|
| `curl -A Googlebot` returns a page | CDNs challenge user agents that only *claim* to be a crawler: you tested the CDN, not the page. Use a normal user agent for raw HTML, and the engines' live URL tests for the crawler view. |
| Bing live test says "can be indexed" | Bing's SEO checks still read the pre-JavaScript HTML ("H1 missing" with a rendered h1). |
| Disallow `/login`, `/booking/*` and noindex them | A blocked page's `noindex` is never read; linked URLs get indexed bare. Allow crawling and keep `noindex`. Disallow only areas nobody links to. |
| Give each subdomain its own sitemap | A sitemap may only list its own host. If subdomains canonicalise to the main site, they should serve no sitemap (404). |
| Server injects correct JSON-LD and canonical | Client meta libraries (react-helmet and similar) replace it after load. Check the client's canonical never comes from `window.location`, and that both sides build JSON-LD from one module. |
| Build succeeded | Content plugins can skip invalid frontmatter with only a warning. Count the pages, or add a test that parses each file. |
| Analytics shows N users | New properties, ad blockers, consent banners and stacked PRs merged into the wrong base all undercount. Check the system of record. |
| Low CTR means bad titles | Under roughly 100 impressions a week, fix crawling and indexing first. |
| Our firewall blocks scrapers | Crawlers that render pages call your public API without browser headers. Check that your own middleware does not refuse them. |

## Compliance (Google Search Essentials, Bing Webmaster Guidelines)

- Server-rendered content is the page's own content, never bot-only text (that is cloaking).
- Structured data matches visible content. Only use `aggregateRating` from real reviews.
- No keyword stuffing, no doorway pages, and no text written to trigger AI citations or prompt-inject assistants (Bing's 2026 guidelines name both).
- `noindex` and robots.txt are not access control. Keep private data behind authentication.

## Report

Write one table, most severe first: **finding | evidence | why it matters | fix | proof it is fixed | owner**. Then list what you could not verify, what to collect next, and any updates the project profile needs. Write for the business owner: plain words, in their language, with steps they can click through.
