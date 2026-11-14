#!/usr/bin/env bash
# The daily price refresh, run by hand for now (the GitHub workflows are off).
# Same steps as .github/workflows/update-prices.yml: fetch the LiteLLM list,
# rebuild the price history and the site, check it. Prints what changed and
# what the run cost (time, CPU, memory, download), so we can tell when it is
# safe to automate again.
#   bash scripts/refresh.sh          # dry run: build and show the changes, commit nothing
#   bash scripts/refresh.sh --ship   # also commit and push main when prices changed
set -euo pipefail
cd "$(dirname "$0")/.."

ship=false
[ "${1:-}" = "--ship" ] && ship=true

if [ -n "$(git status --porcelain)" ]; then
	echo "refresh: the checkout has uncommitted changes; commit or stash them first" >&2
	exit 1
fi
git pull -q --ff-only
git submodule update -q --init packages/common   # the footer's shared links and wording (zimonh/common)

src=$(mktemp -t litellm-prices)
trap 'rm -f "$src" .refresh-time.txt' EXIT
bytes=$(curl -fsS -o "$src" -w '%{size_download}' https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json)
start=$(date +%s)
/usr/bin/time -l bash -c 'node scripts/update-prices.mjs "$0" && node scripts/price-history.mjs && node scripts/build-site.mjs && node scripts/check-site.mjs' "$src" 2> .refresh-time.txt \
	|| { cat .refresh-time.txt >&2; rm -f .refresh-time.txt; exit 1; }
secs=$(( $(date +%s) - start ))
rss=$(awk '/maximum resident set size/ {print int($1 / 1048576)}' .refresh-time.txt)
cpu=$(awk '/ real .* user .* sys/ {print $3 + $5}' .refresh-time.txt)
rm -f .refresh-time.txt
echo "cost: ${secs}s wall, ${cpu}s CPU, ${rss} MB peak memory, $((bytes / 1024)) KB downloaded"

if git diff --quiet -I '"updated"' -- prices.json; then
	echo "no price changes"
	git checkout -q -- .
	exit 0
fi
node -e 'const h = require("./price-history.json"); const day = new Date().toISOString().slice(0, 10);
  const today = h.events.filter((e) => e.date === day);
  console.log(today.length ? today.map((e) => `  ${e.type}: ${e.model}`).join("\n") : "  (prices.json changed, no new history events)");'

if ! $ship; then
	echo "dry run: rerun with --ship to commit and push"
	git checkout -q -- .
	git clean -qfd pricing token-counter privacy
	exit 0
fi
git add prices.json price-history.json prices.csv index.html 404.html sitemap.xml llms.txt llms-full.txt pricing token-counter privacy
git commit -q -m "Update prices from LiteLLM"
git push -q origin HEAD:main
echo "pushed $(git rev-parse --short HEAD); live after the server's pull at :07. Then: node scripts/indexnow.mjs <changed files>"
