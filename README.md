# apicost.app

A free LLM API cost calculator and price list: paste a prompt, pick a model, see what it costs. It covers OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek and xAI, with prices updated daily from the [LiteLLM](https://github.com/BerriAI/litellm) price list.

Live at **https://apicost.app**.

## How it works

The site is static files, with no build tool and no dependencies beyond Node 22.

| Path | What it is | Written by |
|---|---|---|
| `index.html` | The calculator. Hand-written, except the blocks between `<!-- prices:start -->` / `<!-- examples:start -->` markers. | you + `build-site.mjs` |
| `prices.json` | Every model's price per 1M tokens, read by the calculator. | `update-prices.mjs` |
| `pricing/` | One page per model and provider, plus an index. Models listed under several ids at the same price (snapshots, `-reasoning` variants) get one canonical page; the other ids' pages point at it. | `build-site.mjs` |
| `404.html`, `sitemap.xml`, `llms.txt` | Not-found page, sitemap (canonical pages only, `lastmod` = the day that page last changed), and a site map for AI assistants. | `build-site.mjs` |
| `llms-full.txt`, `prices.csv` | Every price as one Markdown table and as CSV, for AI assistants and anyone who wants the data. | `build-site.mjs` |
| `robots.txt`, `favicon.*`, `apple-touch-icon.png` | Crawler rules (AI search crawlers explicitly allowed) and icons. | you |
| `tokenizer.min.js` | OpenAI's o200k tokenizer, loaded once someone types. | |
| `9c17….txt` | The IndexNow key, proving to search engines that we own the site. | |

The scripts in `scripts/`:

- `update-prices.mjs` downloads the LiteLLM list and writes `prices.json`. It refuses to write if the list looks broken.
- `build-site.mjs` renders everything else from `prices.json`.
- `check-site.mjs` fails when a link, sitemap URL or structured data block is broken, when the sitemap and the canonical pages disagree, when two pages share a title or description, or when FAQ structured data isn't visible on the page.
- `indexnow.mjs` tells Bing and other IndexNow search engines which pages changed.
- `site.mjs` holds what they share: the provider list and the price formatting.

```sh
node scripts/update-prices.mjs && node scripts/build-site.mjs && node scripts/check-site.mjs
python3 -m http.server   # then open http://localhost:8000
```

## Publishing

1. Every day, `.github/workflows/update-prices.yml` runs the three scripts above and commits when a price changed.
2. The zimonh.nl server has a checkout of this repo and runs `git pull` every hour, at :07. nginx serves it at apicost.app.
3. The next run first checks that apicost.app serves the same `prices.json` as `main`. If it doesn't, the job fails and GitHub emails the owner, so a stuck server gets noticed. Once the check passes, it submits the pages that changed to IndexNow.

Every push to `main` also runs `.github/workflows/check.yml`. It rebuilds the site, checks it, and fails when the committed pages differ from what the templates produce.

To change the calculator or the page templates, edit `index.html` or `scripts/build-site.mjs`, run the scripts, and push. The site updates within the hour.
