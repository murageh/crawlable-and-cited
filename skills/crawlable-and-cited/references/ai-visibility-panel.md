# AI visibility panel

A fixed set of prompts, rerun monthly in the same assistants, so you measure change rather than anecdotes. Bing's 2026 guidelines say generative engine optimisation (GEO) makes content *eligible* to be cited; it guarantees nothing. So track citations as a rate over time.

## Build the panel once

Write 20 prompts in four groups of five. Take them from real query exports and customer messages in the market's language, never from what you hope people ask. The pattern is shown below with placeholders. Replace each `<…>` with the project profile's services, places and terms.

1. **Discovery (category + place):** "best `<service>` in `<area>`", "where to get `<service>` in `<city>`"
2. **Price:** "how much is `<service>` in `<country>`", "`<service>` price list `<city>`"
3. **Service detail:** "`<service variant>` near `<area>`", "`<service>` open on Sunday in `<city>`"
4. **Brand and business:** "`<brand>` reviews", "is `<brand>` legit", "`<category>` booking app in `<country>`"

Keep the wording fixed. Changing a prompt starts a new series.

## Run it

Run it in ChatGPT (search on), Microsoft Copilot, Perplexity, Gemini and Google (AI Overview). Use a logged-out or fresh session, with the location and language set to the profile's market. On each run, record:

| date | assistant | prompt | brand mentioned (y/n) | our URL cited (y/n, which URL) | competitors cited | notes |

## Read it

- **Cited rate** = prompts where one of our URLs is cited ÷ prompts run, per assistant.
- **Mentioned-not-cited** often means the entity is known (Business Profile, socials) but no page states the fact plainly enough to quote.
- **Competitor cited for a price prompt** means that page states the price directly. Match the fact, not the wording.
- Cross-check with Cloudflare AI Crawl Control. An assistant can only cite pages its crawler can fetch and read.
