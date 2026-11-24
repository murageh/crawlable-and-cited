---
name: crawlable-and-cited-<project>
description: Use when auditing <project>'s pages for search and AI visibility, before launch or after a release that touches pages, routing, content or tracking.
---

# <Project>: crawlable-and-cited profile

Applies the `crawlable-and-cited` skill to <project>. Read that skill first; this file supplies the project's facts.

_Last updated: <YYYY-MM-DD> by <name>_

## Hosts

| Role | Host | Expected behaviour |
|---|---|---|
| Canonical origin | https://<domain> | Serves the pages, sitemap, robots.txt and IndexNow key |
| www / http | | 301 → canonical |
| Platform hostname | <e.g. project.vercel.app> | 301 → canonical, or noindex |
| Subdomains / tenants | | Canonical → main-domain URL; no sitemap |
| Custom domains | | Canonical → main-domain URL; no sitemap |

Crawl command:

```
node <path>/crawl-audit.mjs https://<domain> --hosts <comma-separated hosts above>
```

## Stack and render path

- Framework and render path:
- How `<head>` is set (server, client):
- Body before JavaScript (yes/no, how):
- Shared source for headings, titles and identity (file):
- Parity tests (files):

## Hosting, CDN, firewall

- Hosting, and where logs live:
- Log search for blocked crawlers (exact query):
- CDN or firewall bot and AI-crawler settings (where):
- App middleware that checks user agents or headers (file):

## Market

- Country and cities:
- Currency format on pages:
- Languages and customer terms:
- Directories (with links):

## Identity

- Site name (exact listing name):
- Alternate names:
- Listing link / kgmid:
- sameAs:
- Published phone and email:

## Customer channels and conversion

- Where customers say what they want:
- Conversion and its system of record:
- utm capture (where stored, and how it was verified):

## Consoles and analytics

- Search Console (property type, verification):
- Bing Webmaster (verification, sitemaps):
- Analytics (property, start date, known gaps):
- IndexNow (key location, how changed URLs are submitted):

## Content

- Source (CMS, markdown, database):
- What happens to an invalid file:
- Guard test:

## AI visibility panel

| # | Group | Prompt |
|---|---|---|
| 1 | Discovery | |

Baseline (date, assistant, cited rate):

## Baselines

| Date | Indexed URLs (Bing / Google) | Impressions / clicks (period) | Conversions (period) |
|---|---|---|---|

## Decisions and history

- <YYYY-MM-DD>: <decision and why>
