# CiteReady

**Crawlable by search engines. Cited by AI.**

CiteReady is an agent skill that audits a business website before it goes live, so search engines can crawl it and AI assistants can cite it. Its skill ID is `crawlable-and-cited`, the name agents match on.

It checks what crawlers actually **receive** (the HTML before JavaScript runs, status codes, canonicals, sitemaps, robots.txt, site-name signals) and what the **data** shows (Search Console and Bing exports, server logs, the system of record). Every finding comes with its evidence, the fix, and the proof that it is fixed.

It was built from a real launch audit. Each check is here because skipping it cost real rankings.

## What it covers

0. **Adapt to the project.** It builds a project profile with the owner (hosts, stack, market, currency, language, customer channels, conversion), so every later check is specific to that site.
1. **Evidence.** It gathers exports, live URL tests, logs and customer language before judging anything.
2. **Crawlability.** Each page has one `<h1>`, real text and links before JavaScript runs, and no firewall or middleware refuses search or AI crawlers.
3. **Indexing signals agree.** Sitemap, robots.txt, `noindex`, canonicals, honest 404s and 301s, platform and preview hostnames, and subdomains or custom domains all point the same way.
4. **One identity.** One site name across the WebSite structured data, `og:site_name`, titles and the business listing; `sameAs`; the same address, phone and email everywhere.
5. **Pages that answer.** Facts near the top, titles of 65 characters or less, server and browser output in parity, content builds that fail loudly, no doorway pages, and structured data that matches what is visible.
6. **Fast on a phone.** Core Web Vitals and bundle size, at the market's network speed.
7. **Intent and journey.** Intent comes from queries and the customers' own words, and leads to the conversion.
8. **Measurement is real.** Tracking is proven to reach production and to store utm tags on the conversion record.
9. **Submit and baseline.** IndexNow, sitemaps, and an AI prompt panel (ChatGPT, Copilot, Perplexity, Gemini) rerun monthly.

It also lists the **traps**: checks that look right but aren't, such as `curl -A Googlebot`, disallowing `noindex` pages, and per-subdomain sitemaps. And it covers **compliance** with Google Search Essentials and the Bing Webmaster Guidelines (no cloaking, no doorway pages, structured data that matches visible content, no AI-citation bait).

## Install

| Where | How |
|---|---|
| Claude Code (all projects) | `git clone https://github.com/murageh/crawlable-and-cited && cp -r crawlable-and-cited/skills/crawlable-and-cited ~/.claude/skills/` |
| Claude Code (one project) | Copy `skills/crawlable-and-cited` to `<project>/.claude/skills/` |
| Claude.ai | Zip `skills/crawlable-and-cited` and upload it under Settings → Capabilities → Skills |
| Other agents that read `SKILL.md` | Copy the folder to `~/.agents/skills/` (or the agent's skills folder) |

Then ask: *"Audit https://example.com before we launch."*

On the first run, the agent fills in `templates/project-profile.md` with you and saves it in your project as `.claude/skills/crawlable-and-cited-<project>/SKILL.md`. Later audits reuse it and update its baselines.

## The crawl script on its own

It has no dependencies and needs Node 18 or later.

```bash
node skills/crawlable-and-cited/scripts/crawl-audit.mjs https://example.com --hosts shop.example.com,example.vercel.app
node --test skills/crawlable-and-cited/scripts/crawl-audit.test.mjs   # self-test against a site with planted defects
```

It exits with code 1 when it finds any FAIL, so it can gate a deploy. On Git Bash for Windows, prefix `MSYS_NO_PATHCONV=1` when passing `--paths /`.

## Layout

```
skills/crawlable-and-cited/
  SKILL.md                       gates, traps, compliance, report format
  references/adapting.md         building the project profile; stack and market notes
  references/evidence.md         what to collect and where
  references/fix-patterns.md     code patterns for each finding
  references/ai-visibility-panel.md
  templates/project-profile.md   the per-project adaptation
  scripts/crawl-audit.mjs        raw-HTML crawl checks
  scripts/crawl-audit.test.mjs   self-test
```

## Licence

MIT
