// Renders the site from prices.json:
//   index.html          the pre-rendered price and example tables, dates
//   pricing/            one page per model and provider, plus an index
//   privacy/            the privacy page, which lists the analytics events
//   404.html, sitemap.xml, llms.txt, llms-full.txt, prices.csv
// Search engines and AI assistants land on the static pages; the calculator
// itself lives on the home page. Run after scripts/update-prices.mjs.
// Usage: node scripts/build-site.mjs
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import {
  SITE, PROVIDERS, TYPICAL, providerTitle, hasPage, modelPath, providerPath,
  cost, typicalCost, escape, rate, usd, tokens, list, displayName, findAliases, withoutDates,
} from "./site.mjs";

const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("prices.json", root), "utf8"));
const { updated } = data;
// Every model with a page, and `models`: the ones whose page is canonical. The
// others share their prices with a primary model (see findAliases) and only
// link to it, so lists, the sitemap and llms.txt show each price once.
const allModels = data.models.filter(hasPage);
const aliasOf = findAliases(allModels);
const models = allModels.filter((m) => !aliasOf.has(m.name));
const aliasesOf = (m) => allModels.filter((o) => aliasOf.get(o.name) === m);
const providerKeys = Object.keys(PROVIDERS).filter((key) => models.some((m) => m.provider === key));
const byTypicalCost = (a, b) => (typicalCost(a) ?? Infinity) - (typicalCost(b) ?? Infinity);
const longDate = new Date(updated + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const shortDate = new Date(updated + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

// Typical requests for the per-model cost table, as input and output tokens.
const SCENARIOS = [
  { label: "Short chat message", input: 300, output: 200 },
  { label: "Typical request", ...TYPICAL },
  { label: "Long document summary", input: 20000, output: 1000 },
  { label: "Coding agent step", input: 50000, output: 2000 },
];

// The OpenAI models people ask about: every variant of the three newest GPT
// versions, plus gpt-4o and gpt-4o-mini, which people still search for by name.
const gptVersion = (name) => Number(name.match(/^gpt-(\d+(?:\.\d+)?)(-|$)/)?.[1]);
const openai = models.filter((m) => m.provider === "openai");
const newestGpt = [...new Set(openai.map((m) => gptVersion(m.name)).filter((v) => v >= 5))].sort((a, b) => b - a).slice(0, 3);
const popularGpt = [
  ...openai.filter((m) => newestGpt.includes(gptVersion(m.name))).sort((a, b) => gptVersion(b.name) - gptVersion(a.name)),
  ...openai.filter((m) => m.name === "gpt-4o" || m.name === "gpt-4o-mini"),
];

// Ratio, not difference, so $0.001 vs $0.002 counts as far apart as $1 vs $2. Free models sit at a tiny floor.
const priceDistance = (a, b) => Math.abs(Math.log((a + 1e-7) / (b + 1e-7)));

const dot = (key) => `<span class="dot" style="--p:${PROVIDERS[key].color}"></span>`;

// ---------- Layout ----------

const CSS = `
:root { --bg: #f6f7f9; --surface: #fff; --surface-2: #f1f3f6; --border: #e2e5ea; --text: #14171c; --muted: #5d6573; --accent: #0b7a52; --accent-strong: #08643f; --accent-soft: #e3f4ec; --focus: #2f6fed; --shadow: 0 1px 2px rgba(20,23,28,.04), 0 8px 24px rgba(20,23,28,.06); color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1115; --surface: #171a20; --surface-2: #1f232b; --border: #2b3039; --text: #eceff3; --muted: #9aa3b2; --accent: #3fd39a; --accent-strong: #6be3b4; --accent-soft: #143428; --focus: #7aa7ff; --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25); color-scheme: dark; } }
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
a { color: var(--accent); } a:hover { color: var(--accent-strong); }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px; }
.num { font-variant-numeric: tabular-nums; }
.muted { color: var(--muted); }
.site-header { border-bottom: 1px solid var(--border); background: var(--surface); }
.site-header .wrap { display: flex; align-items: center; justify-content: space-between; height: 56px; gap: 16px; }
.brand { font-weight: 700; color: var(--text); text-decoration: none; }
.nav { display: flex; gap: 18px; font-size: .92rem; } .nav a { color: var(--muted); text-decoration: none; } .nav a:hover { color: var(--text); }
.crumbs { font-size: .85rem; color: var(--muted); padding-top: 20px; } .crumbs a { color: var(--muted); }
h1, h2 { overflow-wrap: anywhere; }
h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); line-height: 1.15; letter-spacing: -.02em; margin: 14px 0 10px; }
main > h1:first-child { margin-top: 36px; }
h2 { font-size: 1.35rem; letter-spacing: -.01em; margin: 40px 0 12px; }
.lead { color: var(--muted); font-size: 1.05rem; max-width: 720px; margin: 0; }
.badge { display: inline-flex; gap: 6px; font-size: .8rem; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 3px 10px; font-weight: 600; margin-top: 14px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { padding: 10px 14px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--border); }
th:first-child, td:first-child, .left { text-align: left; }
tbody tr:last-child td { border-bottom: 0; }
th { font-size: .78rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 24px; }
.stat { padding: 16px 18px; } .stat .k { font-size: .8rem; color: var(--muted); } .stat .v { font-size: 1.5rem; font-weight: 700; }
.cta { display: inline-block; margin-top: 20px; background: var(--accent); color: #fff; font-weight: 600; text-decoration: none; padding: 10px 18px; border-radius: 10px; }
.cta:hover { background: var(--accent-strong); color: #fff; }
@media (prefers-color-scheme: dark) { .cta, .cta:hover { color: #0f1115; } }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; background: var(--p); }
.links { columns: 3 220px; padding: 0; list-style: none; margin: 0; } .links li { padding: 3px 0; break-inside: avoid; }
.providers { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.providers a { display: block; padding: 16px 18px; text-decoration: none; color: var(--text); } .providers a:hover { border-color: var(--accent); }
.providers .muted { font-size: .88rem; }
p.note { font-size: .85rem; color: var(--muted); max-width: 760px; }
footer { margin-top: 56px; padding: 28px 0 40px; border-top: 1px solid var(--border); font-size: .82rem; color: var(--muted); } footer p { margin: 0 0 8px; }
h3 { font-size: 1.05rem; margin: 24px 0 4px; } h3 + p { margin: 0; color: var(--muted); max-width: 760px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.counter { padding: 18px; margin-top: 24px; }
.counter textarea { width: 100%; min-height: 180px; resize: vertical; font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.counter textarea:focus { border-color: var(--focus); outline: none; }
.counts { display: flex; flex-wrap: wrap; gap: 8px 28px; margin-top: 14px; } .counts .v { font-size: 1.6rem; font-weight: 700; margin-right: 6px; } .counts .k { color: var(--muted); }
@media (max-width: 560px) { .nav .hide-sm { display: none; } }
`;

// Who publishes the site, referenced from every page's structured data.
const PUBLISHER = {
  "@type": "Organization",
  "@id": `${SITE}/#organization`,
  name: "apicost.app",
  url: `${SITE}/`,
  logo: `${SITE}/favicon.svg`,
  sameAs: ["https://github.com/zimonh/model-costs"],
};
const WEBSITE = { "@type": "WebSite", "@id": `${SITE}/#website`, name: "apicost.app", url: `${SITE}/`, inLanguage: "en", publisher: { "@id": PUBLISHER["@id"] } };

// `crumbs` is a list of [name, path]; the last one is this page. `canonical` is
// another page's path when this one duplicates it (an alias model).
function layout({ path, title, description, crumbs = [], body, script = "", jsonLd = [], index = true, canonical = path }) {
  const url = SITE + path;
  const page = { "@type": "WebPage", "@id": url, name: title, description, url, inLanguage: "en", isPartOf: { "@id": WEBSITE["@id"] }, publisher: { "@id": PUBLISHER["@id"] }, dateModified: updated };
  const graph = [page, WEBSITE, PUBLISHER, ...jsonLd];
  if (crumbs.length) {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + href })),
    });
  }
  const breadcrumbs = crumbs
    .map(([name, href], i) => (i === crumbs.length - 1 ? escape(name) : `<a href="${href}">${escape(name)}</a>`))
    .join(" › ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    ${index ? `<link rel="canonical" href="${SITE + canonical}" />` : `<meta name="robots" content="noindex" />`}
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE + canonical}" />
    <meta property="og:site_name" content="apicost.app" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="apicost.app: LLM API prices per 1M tokens for OpenAI, Anthropic, Google, Mistral, DeepSeek and xAI" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(title)}" />
    <meta name="twitter:description" content="${escape(description)}" />
    <link rel="icon" href="/favicon.ico" sizes="32x32" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>
    <style>${CSS}</style>
    <script src="/analytics.js" defer></script>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">💸 apicost.app</a>
        <nav class="nav" aria-label="Main">
          <a href="/#calculator">Calculator</a>
          <a href="/pricing/">Pricing by model</a>
          <a href="/token-counter/" class="hide-sm">Token counter</a>
        </nav>
      </div>
    </header>
    <main class="wrap">
      ${breadcrumbs ? `<nav class="crumbs" aria-label="Breadcrumb">${breadcrumbs}</nav>` : ""}
${body}
    </main>
    <footer>
      <div class="wrap">
        <p>Prices per 1 million tokens in US dollars, from the open <a href="https://github.com/BerriAI/litellm">LiteLLM</a> price list. Updated ${longDate}.</p>
        <p>Check the provider's own pricing page before relying on a number. Providers bill by their own token counts.</p>
        <p>© ${updated.slice(0, 4)} apicost.app · <a href="https://github.com/zimonh/model-costs">Open source on GitHub</a> · <a href="${TOPICS.privacy}">Privacy</a><span class="cookie-settings" hidden> · <a href="#cookie-settings">Cookie settings</a></span></p>
      </div>
    </footer>${script ? `\n    <script>${script}    </script>` : ""}
  </body>
</html>
`;
}

const faqLd = (faq) => ({
  "@type": "FAQPage",
  mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
});

function priceTable(rows, { provider = true } = {}) {
  const body = rows
    .map(
      (m) =>
        `<tr><td><a href="${modelPath(m)}"><strong>${escape(displayName(m.name))}</strong></a></td>` +
        (provider ? `<td class="left">${dot(m.provider)}${escape(PROVIDERS[m.provider].name)}</td>` : "") +
        `<td>${rate(m.standard.input)}</td><td>${rate(m.standard.cachedInput)}</td><td>${rate(m.standard.output)}</td><td>${usd(typicalCost(m))}</td></tr>`
    )
    .join("\n");
  return `<div class="card table-wrap"><table class="num">
  <thead><tr><th scope="col">Model</th>${provider ? '<th scope="col" class="left">Provider</th>' : ""}<th scope="col">Input / 1M</th><th scope="col">Cached input / 1M</th><th scope="col">Output / 1M</th><th scope="col">Typical request</th></tr></thead>
  <tbody>
${body}
  </tbody>
</table></div>`;
}

// ---------- Pages ----------

// How b's typical request compares with a's: "2.5× the price of GPT-5", "4× cheaper than GPT-5".
function priceRatio(a, b) {
  const r = typicalCost(b) / typicalCost(a);
  const name = displayName(a.name);
  if (r > 0.9 && r < 1.1) return `about the same price as ${name}`;
  const x = (n) => `${Number(n.toPrecision(2))}×`;
  return r > 1 ? `${x(r)} the price of ${name}` : `${x(1 / r)} cheaper than ${name}`;
}

// Providers people compare across, in the order their models are compared.
const RIVALS = ["openai", "anthropic", "gemini", "deepseek", "xai", "mistral"];

// The share of priced models whose typical request costs more than this one's.
const pricedModels = models.filter((m) => typicalCost(m) > 0);
const cheaperThan = (m) => pricedModels.filter((o) => typicalCost(o) > typicalCost(m)).length / pricedModels.length;

function faqSection(faq) {
  return `
      <h2>${faq.length > 1 ? "Questions" : "Question"} and answers</h2>
      ${faq.map(([q, a]) => `<h3>${escape(q)}</h3>\n      <p>${escape(a)}</p>`).join("\n      ")}`;
}

function modelPage(m) {
  const primary = aliasOf.get(m.name);
  const s = m.standard;
  const b = m.batch;
  const company = PROVIDERS[m.provider].name;
  const name = displayName(m.name);
  const hasBatch = b.input != null && b.output != null;
  const typical = typicalCost(m);

  const features = [
    m.maxInputTokens && `a ${tokens(m.maxInputTokens)}-token context window`,
    m.maxOutputTokens && `up to ${tokens(m.maxOutputTokens)} output tokens`,
    m.vision && "image input",
    m.tools && "tool calling",
    m.reasoning && "reasoning",
  ].filter(Boolean);

  const intro =
    `${company} charges ${rate(s.input)} per million input tokens and ${rate(s.output)} per million output tokens for ${name} (${m.name})` +
    (s.cachedInput != null ? `, and ${rate(s.cachedInput)} per million cached input tokens` : "") +
    `. A typical request of 1,000 input and 500 output tokens costs ${usd(typical)}` +
    (hasBatch ? `, or ${usd(cost(b, TYPICAL.input, TYPICAL.output))} through the batch API.` : ".");

  const cheaper = hasBatch
    ? `Yes. The ${company} batch API runs requests within 24 hours for ${rate(b.input)} per million input tokens and ${rate(b.output)} per million output tokens.` +
      (s.cachedInput != null ? ` Prompt caching lowers the price of repeated input to ${rate(s.cachedInput)} per million tokens.` : "")
    : s.cachedInput != null
      ? `Prompt caching lowers the price of input that repeats across requests to ${rate(s.cachedInput)} per million tokens.`
      : null;

  // The closest-priced model from each other big provider: the comparisons people search for.
  const rivals =
    typical > 0
      ? RIVALS.filter((key) => key !== m.provider)
          .map((key) => pricedModels.filter((o) => o.provider === key).sort((x, y) => priceDistance(typicalCost(x), typical) - priceDistance(typicalCost(y), typical))[0])
          .filter(Boolean)
          .slice(0, 3)
      : [];
  // "costs $3 input and $15 output per million tokens, so a typical request is $0.0105: 1.6× the price of GPT-5."
  const comparison = (o) =>
    `costs ${rate(o.standard.input)} input and ${rate(o.standard.output)} output per million tokens, ` +
    `so a typical request is ${usd(typicalCost(o))}: ${priceRatio(m, o)}.`;
  const verdict = (o) => {
    const r = typicalCost(o) / typical;
    return r >= 1.1 ? "Yes. " : r <= 0.9 ? "No. " : "They cost about the same. ";
  };
  const compare = (o) => `${displayName(o.name)} from ${PROVIDERS[o.provider].name} ${comparison(o)}`;
  const position =
    typical > 0
      ? `For a typical request, ${name} is cheaper than ${Math.round(cheaperThan(m) * 100)}% of the other models on apicost.app.`
      : null;

  const context = m.maxInputTokens
    ? `${name} accepts up to ${m.maxInputTokens.toLocaleString("en-US")} input tokens, roughly ${Math.round((m.maxInputTokens * 0.75) / 1000).toLocaleString("en-US")},000 words of English` +
      (m.maxOutputTokens ? `, and writes up to ${m.maxOutputTokens.toLocaleString("en-US")} output tokens per response.` : ".") +
      ` Filling the whole context window once costs ${usd(cost(s, m.maxInputTokens, 0))} in input tokens.`
    : null;

  const faq = [
    [`How much does the ${name} API cost?`, intro],
    ...(cheaper ? [[`Is there a cheaper way to use ${name}?`, cheaper]] : []),
    ...(context ? [[`What is the context window of ${name}?`, context]] : []),
    ...(rivals[0] ? [[`Is ${name} cheaper than ${displayName(rivals[0].name)}?`, verdict(rivals[0]) + compare(rivals[0])]] : []),
  ];

  const rateRows = [
    ["Input", s.input, b.input],
    ["Cached input", s.cachedInput, b.cachedInput],
    ["Output", s.output, b.output],
  ]
    .map(([label, standard, batch]) => `<tr><td>${label}</td><td>${rate(standard)}</td>${hasBatch ? `<td>${rate(batch)}</td>` : ""}</tr>`)
    .join("\n");

  const scenarioRows = SCENARIOS.filter((sc) => !m.maxInputTokens || sc.input <= m.maxInputTokens)
    .map((sc) => {
      const one = cost(s, sc.input, sc.output);
      return `<tr><td>${sc.label} <span class="muted">(${tokens(sc.input)} in, ${tokens(sc.output)} out)</span></td><td>${usd(one)}</td><td>${usd(one * 1000)}</td><td>${usd(one * 1e6)}</td></tr>`;
    })
    .join("\n");

  // The models closest in price, from any provider, make a fair comparison.
  const similar = models
    .filter((o) => o !== m && o !== primary && typicalCost(o) != null)
    .sort((x, y) => priceDistance(typicalCost(x), typical) - priceDistance(typicalCost(y), typical))
    .slice(0, 8)
    .sort(byTypicalCost);
  const siblings = models.filter((o) => o.provider === m.provider && o !== m);
  const aliases = aliasesOf(m);
  const aliasNote = primary
    ? `<p class="note">${escape(m.name)} has the same prices as <a href="${modelPath(primary)}">${escape(displayName(primary.name))}</a> (${escape(primary.name)}), so that page is the main one for both.</p>`
    : aliases.length
      ? `<p class="note">The same prices apply to the model ids ${list(aliases.map((a) => `<code>${escape(a.name)}</code>`))}.</p>`
      : "";

  return layout({
    path: modelPath(m),
    canonical: primary ? modelPath(primary) : modelPath(m),
    // Alias spellings can share a display name (mistral-medium-3.5 / 3-5), so their titles carry the id.
    title: `${primary ? m.name : name} API Pricing – ${rate(s.input)} Input, ${rate(s.output)} Output per 1M Tokens`,
    description:
      `${name} API costs ${rate(s.input)} per 1M input tokens and ${rate(s.output)} per 1M output tokens` +
      (hasBatch ? ` (${rate(b.input)} / ${rate(b.output)} with batch)` : s.cachedInput != null ? ` (${rate(s.cachedInput)} cached input)` : "") +
      `. A typical request costs ${usd(typical)}. Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"], [company, providerPath(m.provider)], [name, modelPath(m)]],
    jsonLd: [faqLd(faq)],
    body: `
      <h1>${escape(name)} API pricing</h1>
      <p class="lead">${escape(intro)}</p>
      <div class="badge">Prices updated ${longDate}</div>

      <div class="stats">
        <div class="card stat"><div class="k">Input / 1M tokens</div><div class="v num">${rate(s.input)}</div></div>
        <div class="card stat"><div class="k">Output / 1M tokens</div><div class="v num">${rate(s.output)}</div></div>
        <div class="card stat"><div class="k">Cached input / 1M tokens</div><div class="v num">${rate(s.cachedInput)}</div></div>
        <div class="card stat"><div class="k">Typical request</div><div class="v num">${usd(typical)}</div></div>
      </div>
      <a class="cta" href="/?model=${encodeURIComponent(m.name)}#calculator">Calculate the cost of your prompt →</a>
      ${aliasNote}

      <h2>${escape(name)} price per million tokens</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Token type</th><th scope="col">Standard</th>${hasBatch ? '<th scope="col">Batch API</th>' : ""}</tr></thead>
        <tbody>
${rateRows}
        </tbody>
      </table></div>
      <p class="note">API model id: <code>${escape(m.name)}</code>.${features.length ? ` ${escape(name)} supports ${list(features)}.` : ""}</p>

      <h2>What ${escape(name)} costs per request</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Request</th><th scope="col">1 request</th><th scope="col">1,000 requests</th><th scope="col">1M requests</th></tr></thead>
        <tbody>
${scenarioRows}
        </tbody>
      </table></div>
      <p class="note">At standard rates. A token is about 4 characters of English text, so 1,000 tokens is roughly 750 words.${
        m.provider === "openai" ? "" : ` ${escape(company)} counts tokens with its own tokenizer, so the same text can be a different number of tokens.`
      }</p>
${
  rivals.length
    ? `
      <h2>How ${escape(name)} compares</h2>
      <ul>
        ${position ? `<li>${escape(position)}</li>` : ""}
        ${rivals.map((o) => `<li><a href="${modelPath(o)}">${escape(displayName(o.name))}</a> from ${escape(PROVIDERS[o.provider].name)} ${escape(comparison(o))}</li>`).join("\n        ")}
      </ul>`
    : ""
}

      <h2>Models with a similar price</h2>
${priceTable(similar)}

      <h2>Other ${escape(company)} models</h2>
      <ul class="links">${siblings.map((o) => `<li><a href="${modelPath(o)}">${escape(displayName(o.name))}</a> <span class="muted num">${rate(o.standard.input)} / ${rate(o.standard.output)}</span></li>`).join("")}</ul>
      <p class="note">All ${escape(company)} prices side by side: <a href="${providerPath(m.provider)}">${escape(providerTitle(m.provider))} API pricing</a>. Ways to pay less: <a href="${TOPICS.batch}">batch API</a>, <a href="${TOPICS.caching}">prompt caching</a>, <a href="${TOPICS.cheapest}">the cheapest models</a>.</p>
${faqSection(faq)}
      ${m.source ? `<p class="note">Source: <a href="${escape(m.source)}" rel="nofollow">${escape(company)} pricing</a>, via the LiteLLM price list.</p>` : ""}
`,
  });
}

function providerPage(key) {
  const rows = models.filter((m) => m.provider === key).sort(byTypicalCost);
  const priced = rows.filter((m) => typicalCost(m) > 0);
  const cheapest = priced[0] ?? rows[0];
  const priciest = rows[rows.length - 1];
  const { name, brand } = PROVIDERS[key];
  const title = providerTitle(key);
  const quote = (m) => `${displayName(m.name)} at ${rate(m.standard.input)} input and ${rate(m.standard.output)} output`;
  const intro =
    `${name} API prices for all ${rows.length} ${brand} models, per million tokens. ` +
    `The cheapest is ${quote(cheapest)}; the most expensive is ${quote(priciest)}.`;
  const batched = rows.filter((m) => m.batch.input != null && m.batch.output != null);
  const cached = rows.filter((m) => m.standard.cachedInput != null);
  const faq = [
    [`How much does the ${title} API cost?`, `${name} charges per million tokens, with separate prices for input and output. ${intro.split(". ").slice(1).join(". ")} A typical request of 1,000 input and 500 output tokens costs between ${usd(typicalCost(cheapest))} and ${usd(typicalCost(priciest))}.`],
    [`What is the cheapest ${brand} model?`, `${displayName(cheapest.name)} (${cheapest.name}), at ${rate(cheapest.standard.input)} per million input tokens and ${rate(cheapest.standard.output)} per million output tokens.`],
    [
      `Does ${name} offer batch or cached pricing?`,
      (batched.length ? `${batched.length === rows.length ? `All ${rows.length}` : `${batched.length} of the ${rows.length}`} models have a batch API price, processed within 24 hours at a lower rate. ` : `${name} lists no batch API prices. `) +
        (cached.length ? `${cached.length} models charge less for cached input that repeats across requests.` : "No cached-input prices are listed."),
    ],
  ];

  return layout({
    path: providerPath(key),
    title: `${title} API Pricing – All ${rows.length} Models per 1M Tokens`,
    description:
      `${title} API prices for all ${rows.length} models per 1M tokens, from ${displayName(cheapest.name)} (${rate(cheapest.standard.input)} / ${rate(cheapest.standard.output)}) ` +
      `to ${displayName(priciest.name)} (${rate(priciest.standard.input)} / ${rate(priciest.standard.output)}). Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"], [name, providerPath(key)]],
    jsonLd: [faqLd(faq)],
    body: `
      <h1>${escape(title)} API pricing</h1>
      <p class="lead">${escape(intro)}</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>${escape(name)} model prices</h2>
${priceTable(rows, { provider: false })}
      <p class="note">Sorted by the cost of a typical request of 1,000 input and 500 output tokens. Open a model for batch prices, context window and example costs.</p>
      <a class="cta" href="/#calculator">Calculate the cost of your own prompt →</a>
${faqSection(faq)}
      <h2>Other providers</h2>
      <div class="providers">${providerCards(false, key)}</div>
`,
  });
}

const providerCards = (withCount, except) =>
  providerKeys
    .filter((key) => key !== except)
    .map((key) => {
      const count = withCount ? `<div class="muted">${models.filter((m) => m.provider === key).length} models</div>` : "";
      return `<a class="card" href="${providerPath(key)}">${dot(key)}<strong>${escape(providerTitle(key))}</strong>${count}</a>`;
    })
    .join("");

function indexPage() {
  const companies = list(providerKeys.map((k) => PROVIDERS[k].name));
  const dataset = {
    "@type": "Dataset",
    name: "LLM API prices per 1M tokens",
    description: `Input, cached input and output prices per million tokens, standard and batch, with context window sizes, for ${models.length} models from ${companies}. Updated daily from the LiteLLM price list.`,
    url: SITE + "/pricing/",
    creator: { "@id": PUBLISHER["@id"] },
    dateModified: updated,
    isBasedOn: "https://github.com/BerriAI/litellm",
    keywords: ["LLM API pricing", "token prices", "OpenAI API pricing", "Claude API pricing", "Gemini API pricing"],
    distribution: [
      { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${SITE}/prices.json` },
      { "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/prices.csv` },
      { "@type": "DataDownload", encodingFormat: "text/markdown", contentUrl: `${SITE}/llms-full.txt` },
    ],
  };
  return layout({
    path: "/pricing/",
    title: "LLM API Pricing – Compare Every Model per 1M Tokens",
    description: `API prices per million tokens for ${models.length} models from ${companies}, sorted by what a typical request costs. Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"]],
    jsonLd: [dataset],
    body: `
      <h1>LLM API pricing by model</h1>
      <p class="lead">Prices per million tokens for ${models.length} models from ${escape(companies)}, updated daily.</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>By provider</h2>
      <div class="providers">${providerCards(true)}</div>
      <h2>Guides</h2>
${guideLinks}
      <h2>All models</h2>
${priceTable([...models].sort(byTypicalCost))}
      <p class="note">Download the whole list as <a href="/prices.csv">CSV</a>, <a href="/prices.json">JSON</a> or <a href="/llms-full.txt">Markdown</a>, built from the open LiteLLM price list.</p>
      <a class="cta" href="/#calculator">Calculate the cost of your own prompt →</a>
`,
  });
}

function notFoundPage() {
  return layout({
    path: "/404.html",
    title: "Page not found – apicost.app",
    description: "This page does not exist. Find a model's API pricing or calculate the cost of a prompt.",
    index: false,
    body: `
      <h1>Page not found</h1>
      <p class="lead">This page doesn't exist, or the model was removed from the price list.</p>
      <a class="cta" href="/#calculator">Open the calculator →</a>
      <h2>API pricing by provider</h2>
      <div class="providers">${providerCards(false)}</div>
      <h2>Guides</h2>
${guideLinks}
`,
  });
}

// ---------- Topic pages ----------

// Pages for searches that cut across models. They sit next to the model pages,
// so a model with one of these names would overwrite it.
const TOPICS = {
  cheapest: "/pricing/cheapest/",
  batch: "/pricing/batch-api/",
  caching: "/pricing/prompt-caching/",
  tokenCounter: "/token-counter/",
  privacy: "/privacy/",
};
for (const m of models) {
  if (Object.values(TOPICS).includes(modelPath(m))) throw new Error(`Model ${m.name} collides with a topic page`);
}

const percent = (fraction) => `${Math.round(fraction * 100)}%`;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function cheapestPage() {
  // A $0 price is a gap in the price list more often than a free model.
  const priced = models.filter((m) => typicalCost(m) > 0).sort(byTypicalCost);
  const top = priced[0];
  const capabilities = [
    ["Reasoning", (m) => m.reasoning],
    ["Image input", (m) => m.vision],
    ["Tool calling", (m) => m.tools],
    ["1M+ token context", (m) => m.maxInputTokens >= 1e6],
  ]
    .map(([label, has]) => [label, priced.find(has)])
    .filter(([, m]) => m);
  const capabilityRows = capabilities
    .map(([label, m]) => `<tr><td>${label}</td><td class="left"><a href="${modelPath(m)}"><strong>${escape(m.name)}</strong></a></td><td class="left">${dot(m.provider)}${escape(PROVIDERS[m.provider].name)}</td><td>${rate(m.standard.input)}</td><td>${rate(m.standard.output)}</td><td>${usd(typicalCost(m))}</td></tr>`)
    .join("\n");
  const answer =
    `The cheapest LLM API right now is ${top.name} from ${PROVIDERS[top.provider].name}: ${rate(top.standard.input)} per million input tokens and ${rate(top.standard.output)} per million output tokens, ` +
    `so a typical request of 1,000 input and 500 output tokens costs ${usd(typicalCost(top))}.`;

  return layout({
    path: TOPICS.cheapest,
    title: "Cheapest LLM API – The Lowest-Cost GPT, Claude & Gemini Models",
    description: `The cheapest LLM API is ${displayName(top.name)}: ${rate(top.standard.input)} input, ${rate(top.standard.output)} output per 1M tokens. The cheapest model per provider and feature. Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"], ["Cheapest LLM APIs", TOPICS.cheapest]],
    jsonLd: [faqLd([["What is the cheapest LLM API?", answer]])],
    body: `
      <h1>The cheapest LLM APIs</h1>
      <p class="lead">${escape(answer)} Below are the ${Math.min(20, priced.length)} cheapest of ${priced.length} models, and the cheapest from each provider.</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>Cheapest models overall</h2>
${priceTable(priced.slice(0, 20))}
      <h2>Cheapest model from each provider</h2>
${priceTable(providerKeys.map((key) => priced.find((m) => m.provider === key)).filter(Boolean))}
      <h2>Cheapest model with a given feature</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Feature</th><th scope="col" class="left">Model</th><th scope="col" class="left">Provider</th><th scope="col">Input / 1M</th><th scope="col">Output / 1M</th><th scope="col">Typical request</th></tr></thead>
        <tbody>
${capabilityRows}
        </tbody>
      </table></div>
      <p class="note">Ranked by the cost of a typical request of 1,000 input and 500 output tokens at standard rates. Models listed at $0 are left out. The batch API and prompt caching make most models cheaper still, see <a href="${TOPICS.batch}">batch API pricing</a> and <a href="${TOPICS.caching}">prompt caching pricing</a>.</p>
      <a class="cta" href="/#calculator">Calculate the cost of your own prompt →</a>
${faqSection([["What is the cheapest LLM API?", answer]])}
`,
  });
}

function batchPage() {
  const batchCost = (m) => cost(m.batch, TYPICAL.input, TYPICAL.output);
  const batched = models
    .filter((m) => batchCost(m) != null && typicalCost(m) > 0)
    .map((m) => ({ m, saving: 1 - batchCost(m) / typicalCost(m) }))
    .sort((a, b) => batchCost(a.m) - batchCost(b.m));
  const companies = list(providerKeys.filter((key) => batched.some(({ m }) => m.provider === key)).map((key) => PROVIDERS[key].name));
  const intro =
    `${batched.length} models from ${companies} offer a batch API: you submit requests in bulk, they are processed within 24 hours, ` +
    `and you pay less, typically ${percent(median(batched.map((b) => b.saving)))} less than the standard price.`;
  const rows = batched
    .map(
      ({ m, saving }) =>
        `<tr><td><a href="${modelPath(m)}"><strong>${escape(m.name)}</strong></a></td><td class="left">${dot(m.provider)}${escape(PROVIDERS[m.provider].name)}</td>` +
        `<td>${rate(m.standard.input)} / ${rate(m.standard.output)}</td><td>${rate(m.batch.input)} / ${rate(m.batch.output)}</td><td>${percent(saving)}</td><td>${usd(batchCost(m) * 1000)}</td></tr>`
    )
    .join("\n");

  const faq = [
    ["What is a batch API?", "A batch API lets you send many requests at once as a file. The provider processes them within 24 hours, when it has spare capacity, and charges less per token than for real-time requests."],
    ["How much cheaper is the batch API?", intro],
  ];
  return layout({
    path: TOPICS.batch,
    title: "Batch API Pricing – OpenAI, Claude & Gemini Batch Discounts Compared",
    description: `Batch API prices per 1M tokens for ${batched.length} models from ${companies}: typically ${percent(median(batched.map((b) => b.saving)))} cheaper, results within 24 hours. Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"], ["Batch API pricing", TOPICS.batch]],
    jsonLd: [faqLd(faq)],
    body: `
      <h1>Batch API pricing compared</h1>
      <p class="lead">${escape(intro)} Use it for work that doesn't need an instant answer: evaluations, classification, embeddings of a backlog, nightly reports.</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>Batch prices per million tokens</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Model</th><th scope="col" class="left">Provider</th><th scope="col">Standard in / out</th><th scope="col">Batch in / out</th><th scope="col">Saving</th><th scope="col">1,000 batch requests</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table></div>
      <p class="note">Sorted by batch price. Saving and cost are for requests of 1,000 input and 500 output tokens.</p>
      <a class="cta" href="/?pricing=batch#calculator">Calculate a batch job →</a>
${faqSection(faq)}
`,
  });
}

function cachingPage() {
  const cached = models
    .filter((m) => m.standard.cachedInput != null && m.standard.input > 0)
    .map((m) => ({ m, discount: 1 - m.standard.cachedInput / m.standard.input }))
    .sort((a, b) => b.discount - a.discount || a.m.standard.cachedInput - b.m.standard.cachedInput);
  const intro =
    `${cached.length} models charge less for input they have seen before. When the start of your prompt repeats across requests, ` +
    `such as a long system prompt or a document you ask several questions about, those tokens cost typically ${percent(median(cached.map((c) => c.discount)))} less.`;
  const rows = cached
    .map(
      ({ m, discount }) =>
        `<tr><td><a href="${modelPath(m)}"><strong>${escape(m.name)}</strong></a></td><td class="left">${dot(m.provider)}${escape(PROVIDERS[m.provider].name)}</td>` +
        `<td>${rate(m.standard.input)}</td><td>${rate(m.standard.cachedInput)}</td><td>${percent(discount)}</td></tr>`
    )
    .join("\n");

  const faq = [
    ["What is prompt caching?", "When many requests start with the same text, the provider can keep that part of the prompt processed and reuse it. You pay a lower cached-input price for those tokens."],
    ["How much does prompt caching save?", intro],
  ];
  return layout({
    path: TOPICS.caching,
    title: "Prompt Caching Pricing – Cached Input Prices for GPT, Claude & Gemini",
    description: `Cached input prices per 1M tokens for ${cached.length} GPT, Claude, Gemini and other models: repeated prompt tokens cost typically ${percent(median(cached.map((c) => c.discount)))} less. Updated ${shortDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"], ["Prompt caching pricing", TOPICS.caching]],
    jsonLd: [faqLd(faq)],
    body: `
      <h1>Prompt caching pricing compared</h1>
      <p class="lead">${escape(intro)}</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>Cached input prices per million tokens</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Model</th><th scope="col" class="left">Provider</th><th scope="col">Input / 1M</th><th scope="col">Cached input / 1M</th><th scope="col">Discount</th></tr></thead>
        <tbody>
${rows}
        </tbody>
      </table></div>
      <p class="note">Some providers also charge for writing to the cache or for how long it is kept; check the provider's pricing page for those. To cache, put the part that repeats (instructions, examples, documents) at the start of the prompt.</p>
      <a class="cta" href="/?cached=1#calculator">Calculate with cached input →</a>
${faqSection(faq)}
`,
  });
}

function tokenCounterPage() {
  const prices = popularGpt.map((m) => ({ name: m.name, input: m.standard.input, output: m.standard.output }));
  const costRows = (n) =>
    prices.map((m) => `<tr><td><a href="/pricing/${m.name}/"><strong>${escape(m.name)}</strong></a></td><td>${usd((n * m.input) / 1e6)}</td><td>${usd((n * m.output) / 1e6)}</td></tr>`).join("\n");
  const faq = [
    ["What is a token?", "Language models read and write text in tokens: common words are one token, rarer words are split into pieces. In English a token is about 4 characters, or three quarters of a word. API prices are per token."],
    ["How many tokens is 1,000 words?", "About 1,300 tokens for English text with OpenAI's tokenizer. Code, numbers and other languages use more tokens per word."],
    ["Does this count tokens like ChatGPT does?", "Yes. It uses o200k_base, the tokenizer of GPT-4o and newer OpenAI models, so the count is exact for them. Claude, Gemini and other models use their own tokenizers, so for those it is a close estimate."],
    ["Is my text uploaded?", "No. The tokenizer runs in your browser; the text never leaves your device."],
  ];

  return layout({
    path: TOPICS.tokenCounter,
    title: "ChatGPT Token Counter – Count OpenAI GPT Tokens Online, Free",
    description: "Free ChatGPT token counter. Paste text to count its tokens with OpenAI's own tokenizer (o200k, GPT-4o and newer) and see what it costs on the API. Runs in your browser.",
    crumbs: [["Home", "/"], ["Token counter", TOPICS.tokenCounter]],
    jsonLd: [
      { "@type": "WebApplication", name: "ChatGPT Token Counter", url: SITE + TOPICS.tokenCounter, applicationCategory: "DeveloperApplication", operatingSystem: "Any", isAccessibleForFree: true, offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } },
      faqLd(faq),
    ],
    body: `
      <h1>ChatGPT token counter</h1>
      <p class="lead">Paste any text to count its tokens with OpenAI's own tokenizer, and see what it would cost to send or receive through the API. Nothing is uploaded.</p>
      <div class="card counter">
        <label for="text" class="visually-hidden">Text to count</label>
        <textarea id="text" rows="8" placeholder="Paste or type your text here…"></textarea>
        <div class="counts num" aria-live="polite">
          <div><span class="v" id="tokens">0</span><span class="k">tokens</span></div>
          <div><span class="v" id="words">0</span><span class="k">words</span></div>
          <div><span class="v" id="chars">0</span><span class="k">characters</span></div>
        </div>
      </div>

      <h2 id="cost-label">What 1,000 tokens cost</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Model</th><th scope="col">As input</th><th scope="col">As output</th></tr></thead>
        <tbody id="costs">
${costRows(1000)}
        </tbody>
      </table></div>
      <p class="note">At standard rates. To price a full request with a response, batch or cached input, or another provider, use the <a href="/#calculator">cost calculator</a>.</p>

      <h2>About tokens</h2>
      ${faq.map(([q, a]) => `<h3>${escape(q)}</h3>\n      <p>${escape(a)}</p>`).join("\n      ")}
`,
    script: `
      const PRICES = ${JSON.stringify(prices)};
      const usd = ${usd.toString()};
      const $ = (id) => document.getElementById(id);
      let requested = false;
      // The tokenizer is 2 MB, so it only loads once someone starts typing.
      function loadTokenizer() {
        if (requested) return;
        requested = true;
        const script = document.createElement("script");
        script.src = "/tokenizer.min.js";
        script.onload = render;
        document.head.appendChild(script);
      }
      function render() {
        const text = $("text").value;
        if (text) loadTokenizer();
        const exact = Boolean(window.tokenizer);
        const tokens = !text ? 0 : exact ? tokenizer.count(text) : Math.ceil(text.length / 4);
        $("tokens").textContent = (text && !exact ? "≈ " : "") + tokens.toLocaleString("en-US");
        $("words").textContent = (text.trim() ? text.trim().split(/\\s+/).length : 0).toLocaleString("en-US");
        $("chars").textContent = text.length.toLocaleString("en-US");
        const n = text ? tokens : 1000;
        $("cost-label").textContent = text ? "What this text costs" : "What 1,000 tokens cost";
        $("costs").innerHTML = PRICES.map(
          (m) => \`<tr><td><a href="/pricing/\${m.name}/"><strong>\${m.name}</strong></a></td><td>\${usd((n * m.input) / 1e6)}</td><td>\${usd((n * m.output) / 1e6)}</td></tr>\`
        ).join("");
      }
      // One token_count per settled edit (see /analytics.js): the token range, never the text.
      let countTimer, lastCount = "";
      $("text").addEventListener("input", () => {
        render();
        clearTimeout(countTimer);
        countTimer = setTimeout(() => {
          const text = $("text").value;
          if (!text) return;
          const n = window.tokenizer ? tokenizer.count(text) : Math.ceil(text.length / 4);
          const tokens = n < 1e3 ? "0-1k" : n < 1e4 ? "1k-10k" : n < 1e5 ? "10k-100k" : n < 1e6 ? "100k-1m" : "1m+";
          if (tokens === lastCount) return;
          lastCount = tokens;
          window.track?.("token_count", { tokens });
        }, 1500);
      });
      $("text").addEventListener("focus", loadTokenizer, { once: true });
`,
  });
}

function privacyPage() {
  return layout({
    path: TOPICS.privacy,
    title: "Privacy – apicost.app",
    description: "What apicost.app collects: nothing until you allow Google Analytics, and never the text you paste.",
    crumbs: [["Home", "/"], ["Privacy", TOPICS.privacy]],
    body: `
      <h1>Privacy</h1>
      <p class="lead">The calculator and token counter run in your browser. The text you paste never leaves your device.</p>
      <h2>Analytics, only if you allow it</h2>
      <p>If you press <strong>Allow</strong> in the cookie banner, the site loads Google Analytics, which sets a cookie and counts page views and a few actions: which model and provider you pick, the rounded size of a calculation (such as "1k-10k" input tokens), batch or cached pricing, token counts in the same ranges, copying a link, and clicks to other sites such as a provider's pricing page. It never receives your text, and we run no ads. If you press <strong>No thanks</strong>, or don't choose, Google Analytics isn't loaded at all.</p>
      <p>You can change your choice at any time under <a href="#cookie-settings">Cookie settings</a> at the bottom of every page. Choosing No thanks stops the counting and removes the analytics cookies.</p>
      <h2>Everything else</h2>
      <p>The site has no accounts, no forms and no ads. The server keeps standard access logs to keep the site running.</p>
`,
  });
}

const guideLinks = `
      <div class="providers">
        <a class="card" href="${TOPICS.cheapest}"><strong>Cheapest LLM APIs</strong><div class="muted">Lowest-cost models overall and per provider</div></a>
        <a class="card" href="${TOPICS.batch}"><strong>Batch API pricing</strong><div class="muted">Batch discounts for every model</div></a>
        <a class="card" href="${TOPICS.caching}"><strong>Prompt caching pricing</strong><div class="muted">Cached input prices and discounts</div></a>
        <a class="card" href="${TOPICS.tokenCounter}"><strong>Token counter</strong><div class="muted">Count tokens with OpenAI's tokenizer</div></a>
      </div>`;

// ---------- Home page ----------

// The home page is hand-written; only the blocks between markers are generated,
// so search engines and visitors without JavaScript still see the prices.
function renderHome(html) {
  const detailLink = (m) => (hasPage(m) ? ` <a class="detail" href="${modelPath(m)}" aria-label="${escape(m.name)} pricing details">details</a>` : "");
  const priceRows = data.models
    .map(
      (m) =>
        `<tr data-name="${escape(m.name)}"><td><strong>${escape(m.name)}</strong>${detailLink(m)}</td>` +
        `<td><span class="provider-cell">${dot(m.provider)}${escape(PROVIDERS[m.provider].name)}</span></td>` +
        `<td>${rate(m.standard.input)}</td><td>${rate(m.standard.cachedInput)}</td><td>${rate(m.standard.output)}</td><td class="cost">${usd(typicalCost(m))}</td></tr>`
    )
    .join("\n");

  const exampleRows = popularGpt
    .map((m) => {
      const one = typicalCost(m);
      return `<tr><td><a href="${modelPath(m)}"><strong>${escape(m.name)}</strong></a></td><td>${rate(m.standard.input)}</td><td>${rate(m.standard.output)}</td><td>${usd(one)}</td><td>${usd(one * 1000)}</td></tr>`;
    })
    .join("\n");

  // The answer to the question the home page ranks for, with today's numbers.
  const openai = models.filter((m) => m.provider === "openai" && typicalCost(m) > 0).sort(byTypicalCost);
  const quoted = [...new Set([popularGpt[0], ...["gpt-5", "gpt-5-mini", "gpt-4o"].map((n) => openai.find((m) => m.name === n))])].filter(Boolean);
  const gpt5 = quoted.find((m) => m.name === "gpt-5") ?? quoted[0];
  const chatgptCost =
    `The ChatGPT (OpenAI) API is billed per token, with separate prices for input and output. ` +
    quoted.map((m) => `${displayName(m.name)} costs ${rate(m.standard.input)} per million input tokens and ${rate(m.standard.output)} per million output tokens`).join("; ") +
    `. The cheapest OpenAI model is ${displayName(openai[0].name)} at ${rate(openai[0].standard.input)} / ${rate(openai[0].standard.output)}, ` +
    `the most expensive ${displayName(openai.at(-1).name)} at ${rate(openai.at(-1).standard.input)} / ${rate(openai.at(-1).standard.output)}. ` +
    `A typical request of 1,000 input and 500 output tokens costs ${usd(typicalCost(gpt5))} on ${displayName(gpt5.name)}. Prices as of ${longDate}.`;

  // A few named links per provider, highest version first, so the model pages are linked by name.
  // The version is the first number in the name that isn't a 4-digit snapshot date.
  const version = (m) => Number(displayName(m.name).match(/(?<![\d.])(?!\d{4}\b)\d+(?:\.\d+)?(?![\dB])/)?.[0] ?? 0);
  const modelLinks = providerKeys
    .map((key) => {
      const newest = models
        .filter((m) => m.provider === key)
        .sort((a, b) => version(b) - version(a) || a.name.length - b.name.length)
        .slice(0, 6);
      return (
        `        <p><a href="${providerPath(key)}"><strong>${escape(providerTitle(key))}</strong></a>: ` +
        newest.map((m) => `<a href="${modelPath(m)}">${escape(displayName(m.name))} pricing</a>`).join(" · ") +
        `</p>`
      );
    })
    .join("\n");

  const description =
    `Paste a prompt and see what it costs on the ChatGPT API. Free token counter and prices for ${data.models.length} GPT, Claude, Gemini and Grok models. Updated ${shortDate}.`;

  const block = (name, content) => (s) => {
    const marker = new RegExp(`<!-- ${name}:start -->[\\s\\S]*<!-- ${name}:end -->`);
    if (!marker.test(s)) throw new Error(`index.html lost its <!-- ${name}:start/end --> markers`);
    return s.replace(marker, `<!-- ${name}:start -->\n${content}\n<!-- ${name}:end -->`);
  };
  return [
    block("prices", priceRows),
    block("examples", exampleRows),
    block("models", modelLinks),
    (s) => s.replace(/<!-- chatgpt-cost:start -->[\s\S]*?<!-- chatgpt-cost:end -->/, `<!-- chatgpt-cost:start -->${escape(chatgptCost)}<!-- chatgpt-cost:end -->`),
    (s) => s.replace(/("name": "How much does the ChatGPT API cost\?",\s*"acceptedAnswer": \{ "@type": "Answer", "text": )"[^"]*"/, (_, head) => head + JSON.stringify(chatgptCost)),
    (s) => s.replace(/(name="description"\s+content=")[^"]*"/, (_, head) => head + escape(description) + '"'),
    (s) => s.replace(/(<span id="updated-badge">)[^<]*/, `$1${data.models.length} models · prices updated ${longDate}`),
    (s) => s.replace(/(<p id="footer-updated">)[\s\S]*?(<\/p>)/, `$1Prices from the <a href="https://github.com/BerriAI/litellm">LiteLLM</a> price list, last changed ${longDate}. Refreshed daily.$2`),
    (s) => s.replace(/"dateModified": "[^"]*"/, `"dateModified": "${updated}"`),
    (s) => s.replace(/© \d{4} apicost\.app/, `© ${updated.slice(0, 4)} apicost.app`),
  ].reduce((s, step) => step(s), html);
}

// ---------- llms.txt, llms-full.txt, prices.csv ----------

// For AI assistants and answer engines, see https://llmstxt.org: llms.txt maps
// the site, llms-full.txt holds every price as a Markdown table they can quote.
const SUMMARY =
  `Free LLM API cost calculator and price list. Prices per 1 million tokens in US dollars for ${data.models.length} OpenAI GPT, Anthropic Claude, Google Gemini, Mistral, DeepSeek and xAI Grok models, ` +
  `standard and batch, updated daily from the open LiteLLM price list. Last price change: ${updated}.`;

function llmsTxt() {
  const section = (key) =>
    `## ${providerTitle(key)} API pricing\n\n` +
    `- [All ${PROVIDERS[key].name} models](${SITE}${providerPath(key)}): every ${PROVIDERS[key].brand} model's price side by side\n` +
    models
      .filter((m) => m.provider === key)
      .map((m) => `- [${displayName(m.name)} (${m.name})](${SITE}${modelPath(m)}): ${rate(m.standard.input)} input, ${rate(m.standard.output)} output per 1M tokens`)
      .join("\n");
  return `# apicost.app

> ${SUMMARY}

When quoting a price, cite the model's page (https://apicost.app/pricing/<model-id>/) and the date above. Providers bill by their own token counts; their own pricing page is the final word.

## Tools and data

- [Calculator](${SITE}/): count tokens and calculate the cost of a prompt, with batch and cached-input pricing
- [All model prices](${SITE}/pricing/): every model sorted by the cost of a typical request
- [Full price table](${SITE}/llms-full.txt): every model's prices and context window as one Markdown table
- [prices.csv](${SITE}/prices.csv): the same table as CSV
- [prices.json](${SITE}/prices.json): all prices as JSON, per 1M tokens, standard and batch
- [Token counter](${SITE}${TOPICS.tokenCounter}): count tokens with OpenAI's o200k tokenizer, in the browser

## Guides

- [Cheapest LLM APIs](${SITE}${TOPICS.cheapest}): the lowest-cost models overall, per provider and per feature
- [Batch API pricing](${SITE}${TOPICS.batch}): batch prices and savings for every model that offers a batch API
- [Prompt caching pricing](${SITE}${TOPICS.caching}): cached input prices and discounts

${providerKeys.map(section).join("\n\n")}

## Optional

- [Privacy](${SITE}${TOPICS.privacy}): no tracking until a visitor allows analytics; pasted text never leaves the browser
- [Source code](https://github.com/zimonh/model-costs): how the site and its price list are built
`;
}

// Every model with a price, aliases included, as rows for llms-full.txt and prices.csv.
const COLUMNS = [
  ["model", (m) => m.name],
  ["name", (m) => displayName(m.name)],
  ["provider", (m) => PROVIDERS[m.provider].name],
  ["input_per_1m_usd", (m) => m.standard.input],
  ["cached_input_per_1m_usd", (m) => m.standard.cachedInput],
  ["output_per_1m_usd", (m) => m.standard.output],
  ["batch_input_per_1m_usd", (m) => m.batch.input],
  ["batch_output_per_1m_usd", (m) => m.batch.output],
  ["context_window_tokens", (m) => m.maxInputTokens],
  ["max_output_tokens", (m) => m.maxOutputTokens],
  ["url", (m) => (hasPage(m) ? SITE + modelPath(aliasOf.get(m.name) ?? m) : "")],
];

function pricesCsv() {
  const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
  return [COLUMNS.map(([k]) => k).join(","), ...data.models.map((m) => COLUMNS.map(([, get]) => cell(get(m))).join(","))].join("\n") + "\n";
}

function llmsFullTxt() {
  const money = (n) => (n == null ? "–" : rate(n));
  const table = (key) =>
    `## ${providerTitle(key)}\n\n` +
    `| Model | Model id | Input / 1M | Cached input / 1M | Output / 1M | Batch input / output | Context window | Typical request |\n|---|---|---|---|---|---|---|---|\n` +
    data.models
      .filter((m) => m.provider === key)
      .map((m) => {
        const batch = m.batch.input != null ? `${money(m.batch.input)} / ${money(m.batch.output)}` : "–";
        return `| ${hasPage(m) ? `[${displayName(m.name)}](${SITE}${modelPath(aliasOf.get(m.name) ?? m)})` : displayName(m.name)} | ${m.name} | ${money(m.standard.input)} | ${money(m.standard.cachedInput)} | ${money(m.standard.output)} | ${batch} | ${m.maxInputTokens ? tokens(m.maxInputTokens) : "–"} | ${usd(typicalCost(m))} |`;
      })
      .join("\n");
  return `# apicost.app: LLM API prices per 1M tokens

> ${SUMMARY}

Prices are in US dollars per 1 million tokens. "Typical request" is 1,000 input and 500 output tokens at standard rates. Cost of a request = input tokens × input price / 1,000,000 + output tokens × output price / 1,000,000. Batch prices apply to requests processed within 24 hours. Source: ${SITE}/pricing/ (also as ${SITE}/prices.csv and ${SITE}/prices.json). Prices as of ${longDate}.

${providerKeys.map(table).join("\n\n")}
`;
}

// ---------- Write ----------

const pages = new Map([
  ["/pricing/", indexPage()],
  [TOPICS.cheapest, cheapestPage()],
  [TOPICS.batch, batchPage()],
  [TOPICS.caching, cachingPage()],
  [TOPICS.tokenCounter, tokenCounterPage()],
  [TOPICS.privacy, privacyPage()],
  ...providerKeys.map((key) => [providerPath(key), providerPage(key)]),
  ...allModels.map((m) => [modelPath(m), modelPage(m)]),
]);

// The sitemap's lastmod is the day a page last changed, not the day prices did:
// a date that moves on every page every day teaches Google to ignore it. A page
// keeps its previous lastmod when only its dates changed.
const file = (path) => new URL("." + path + (path.endsWith("/") ? "index.html" : ""), root);
const read = (url) => readFile(url, "utf8").catch(() => null);
const previous = new Map(
  [...((await read(new URL("sitemap.xml", root))) ?? "").matchAll(/<loc>([^<]*)<\/loc>\s*<lastmod>([^<]*)<\/lastmod>/g)].map(([, loc, mod]) => [loc.slice(SITE.length), mod])
);
const today = new Date().toISOString().slice(0, 10);
const home = new URL("index.html", root);
const homeHtml = renderHome(await readFile(home, "utf8"));
const lastmod = new Map();
for (const [path, html] of [["/", homeHtml], ...pages]) {
  const old = await read(file(path));
  lastmod.set(path, old && previous.has(path) && withoutDates(old) === withoutDates(html) ? previous.get(path) : today);
}

// Start from scratch so models that left the price list lose their page.
await rm(new URL("pricing/", root), { recursive: true, force: true });
await rm(new URL("token-counter/", root), { recursive: true, force: true });
await rm(new URL("privacy/", root), { recursive: true, force: true });
for (const [path, html] of pages) {
  await mkdir(new URL("." + path, root), { recursive: true });
  await writeFile(file(path), html);
}

await writeFile(home, homeHtml);
await writeFile(new URL("404.html", root), notFoundPage());
await writeFile(new URL("llms.txt", root), llmsTxt());
await writeFile(new URL("llms-full.txt", root), llmsFullTxt());
await writeFile(new URL("prices.csv", root), pricesCsv());
// Only canonical pages: alias models point at their primary page.
const listed = ["/", ...pages.keys()].filter((path) => !allModels.some((m) => aliasOf.has(m.name) && modelPath(m) === path));
await writeFile(
  new URL("sitemap.xml", root),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${listed.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${lastmod.get(u)}</lastmod>\n  </url>`).join("\n")}
</urlset>
`
);
console.log(`site: home, ${pages.size} pages (${aliasOf.size} aliases), 404, sitemap (${listed.length} URLs), llms.txt, llms-full.txt, prices.csv`);
