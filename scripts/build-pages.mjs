// Builds the static pricing pages from prices.json: one page per model at
// /pricing/<model>/, one per provider at /pricing/<provider>/, an index at
// /pricing/, and sitemap.xml. Search engines land on these for queries like
// "gpt-4o pricing"; the calculator itself stays on the home page.
// Run after scripts/update-prices.mjs. Usage: node scripts/build-pages.mjs
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

const SITE = "https://apicost.app";
const root = new URL("../", import.meta.url);
const data = JSON.parse(await readFile(new URL("prices.json", root), "utf8"));
const { providers, updated } = data;

// The brand people search for, next to the company name.
const BRANDS = {
  openai: "ChatGPT / GPT",
  anthropic: "Claude",
  gemini: "Gemini",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  xai: "Grok",
};
const PROVIDER_COLORS = {
  openai: "#10a37f",
  anthropic: "#d97757",
  gemini: "#4285f4",
  mistral: "#fa520f",
  deepseek: "#4d6bfe",
  xai: "#8b8f98",
};
// Typical requests, as input and output tokens.
const SCENARIOS = [
  { label: "Short chat message", input: 300, output: 200 },
  { label: "Typical request", input: 1000, output: 500 },
  { label: "Long document summary", input: 20000, output: 1000 },
  { label: "Coding agent step", input: 50000, output: 2000 },
];

// Aliases like gpt-5-latest point at another model, so they get no page of their own.
const models = data.models.filter((m) => !m.name.endsWith("-latest"));

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rate = (n) => (n == null ? "–" : "$" + Number(n.toPrecision(4)));
const usd = (n) =>
  n == null ? "–" : "$" + (n >= 0.1 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(n.toPrecision(3)));
const tokens = (n) => (n >= 1e6 ? `${Number((n / 1e6).toPrecision(3))}M` : n >= 1000 ? `${Number((n / 1000).toPrecision(3))}K` : String(n));
const cost = (p, input, output) => (p.input == null || p.output == null ? null : (p.input * input + p.output * output) / 1e6);
const typical = (m) => cost(m.standard, 1000, 500);
// Ratio, not difference, so $0.001 vs $0.002 counts as far apart as $1 vs $2. Free models sit at a tiny floor.
const priceDistance = (a, b) => Math.abs(Math.log((a + 1e-7) / (b + 1e-7)));
const longDate = new Date(updated + "T00:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
const modelUrl = (m) => `/pricing/${m.name}/`;
const providerUrl = (key) => `/pricing/${key}/`;
const providerTitle = (key) => (BRANDS[key] === providers[key] ? providers[key] : `${providers[key]} ${BRANDS[key]}`);

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
h2 { font-size: 1.35rem; letter-spacing: -.01em; margin: 40px 0 12px; }
.lead { color: var(--muted); font-size: 1.05rem; max-width: 720px; margin: 0; }
.badge { display: inline-flex; gap: 6px; font-size: .8rem; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 3px 10px; font-weight: 600; margin-top: 14px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow); }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: .92rem; }
th, td { padding: 10px 14px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--border); }
th:first-child, td:first-child { text-align: left; }
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
@media (max-width: 560px) { .nav .hide-sm { display: none; } }
`;

function page({ path, title, description, crumbs, body, jsonLd = [] }) {
  const url = SITE + path;
  const breadcrumb = {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + href })),
  };
  const ld = { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", name: title, url, dateModified: updated }, breadcrumb, ...jsonLd] };
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(description)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="apicost.app" />
    <meta property="og:title" content="${escape(title)}" />
    <meta property="og:description" content="${escape(description)}" />
    <meta property="og:image" content="${SITE}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💸</text></svg>" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
    <style>${CSS}</style>
  </head>
  <body>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/">💸 apicost.app</a>
        <nav class="nav" aria-label="Main">
          <a href="/#calculator">Calculator</a>
          <a href="/pricing/">Pricing by model</a>
          <a href="/#faq" class="hide-sm">FAQ</a>
        </nav>
      </div>
    </header>
    <main class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb">${crumbs
        .map(([name, href], i) => (i === crumbs.length - 1 ? escape(name) : `<a href="${href}">${escape(name)}</a>`))
        .join(" › ")}</nav>
${body}
    </main>
    <footer>
      <div class="wrap">
        <p>Prices per 1 million tokens in US dollars, from the open <a href="https://github.com/BerriAI/litellm">LiteLLM</a> price list. Updated ${longDate}.</p>
        <p>Check the provider's own pricing page before relying on a number. Providers bill by their own token counts.</p>
        <p>© ${updated.slice(0, 4)} apicost.app · <a href="https://github.com/zimonh/model-costs">Open source on GitHub</a></p>
      </div>
    </footer>
  </body>
</html>
`;
}

function priceTable(list, { provider = true } = {}) {
  const rows = list
    .map(
      (m) => `<tr><td><a href="${modelUrl(m)}"><strong>${escape(m.name)}</strong></a></td>${
        provider ? `<td style="text-align:left"><span class="dot" style="--p:${PROVIDER_COLORS[m.provider]}"></span>${escape(providers[m.provider])}</td>` : ""
      }<td>${rate(m.standard.input)}</td><td>${rate(m.standard.cachedInput)}</td><td>${rate(m.standard.output)}</td><td>${usd(typical(m))}</td></tr>`
    )
    .join("\n");
  return `<div class="card table-wrap"><table class="num">
  <thead><tr><th scope="col">Model</th>${provider ? '<th scope="col" style="text-align:left">Provider</th>' : ""}<th scope="col">Input / 1M</th><th scope="col">Cached input / 1M</th><th scope="col">Output / 1M</th><th scope="col">Typical request</th></tr></thead>
  <tbody>
${rows}
  </tbody>
</table></div>`;
}

const pages = new Map(); // path -> html

// ---------- Model pages ----------

for (const m of models) {
  const s = m.standard;
  const b = m.batch;
  const company = providers[m.provider];
  const hasBatch = b.input != null && b.output != null;
  const typicalCost = typical(m);

  const features = [
    m.maxInputTokens && `a ${tokens(m.maxInputTokens)}-token context window`,
    m.maxOutputTokens && `up to ${tokens(m.maxOutputTokens)} output tokens`,
    m.vision && "image input",
    m.tools && "tool calling",
    m.reasoning && "reasoning",
  ].filter(Boolean);

  const intro =
    `${company} charges ${rate(s.input)} per million input tokens and ${rate(s.output)} per million output tokens for ${m.name}` +
    (s.cachedInput != null ? `, and ${rate(s.cachedInput)} per million cached input tokens` : "") +
    `. A typical request of 1,000 input and 500 output tokens costs ${usd(typicalCost)}` +
    (hasBatch ? `, or ${usd(cost(b, 1000, 500))} through the batch API.` : ".");

  const rateRows = [
    ["Input", s.input, b.input],
    ["Cached input", s.cachedInput, b.cachedInput],
    ["Output", s.output, b.output],
  ]
    .map(([label, std, bat]) => `<tr><td>${label}</td><td>${rate(std)}</td>${hasBatch ? `<td>${rate(bat)}</td>` : ""}</tr>`)
    .join("\n");

  const scenarioRows = SCENARIOS.filter((sc) => !m.maxInputTokens || sc.input <= m.maxInputTokens)
    .map((sc) => {
      const one = cost(s, sc.input, sc.output);
      return `<tr><td>${sc.label} <span class="muted">(${tokens(sc.input)} in, ${tokens(sc.output)} out)</span></td><td>${usd(one)}</td><td>${usd(one * 1000)}</td><td>${usd(one * 1e6)}</td></tr>`;
    })
    .join("\n");

  // The models closest in price, from any provider, give a fair comparison.
  const similar = models
    .filter((o) => o !== m && typical(o) != null)
    .sort((x, y) => priceDistance(typical(x), typicalCost) - priceDistance(typical(y), typicalCost))
    .slice(0, 8)
    .sort((x, y) => typical(x) - typical(y));
  const siblings = models.filter((o) => o.provider === m.provider && o !== m);

  const title = `${m.name} API Pricing – Cost per 1M Tokens & Calculator`;
  const description = `${m.name} API pricing: ${rate(s.input)} per 1M input tokens, ${rate(s.output)} per 1M output tokens${
    hasBatch ? `, ${rate(b.input)} / ${rate(b.output)} with batch` : ""
  }. See what a request costs and compare ${m.name} with similar models. Updated ${longDate}.`;

  const faq = [
    [`How much does the ${m.name} API cost?`, intro],
    ...(hasBatch
      ? [[`Is there a cheaper way to use ${m.name}?`, `Yes. The ${company} batch API runs requests within 24 hours for ${rate(b.input)} per million input tokens and ${rate(b.output)} per million output tokens. Prompt caching lowers the price of repeated input${s.cachedInput != null ? ` to ${rate(s.cachedInput)} per million tokens` : ""}.`]]
      : s.cachedInput != null
        ? [[`Is there a cheaper way to use ${m.name}?`, `Prompt caching lowers the price of input that repeats across requests to ${rate(s.cachedInput)} per million tokens.`]]
        : []),
  ];

  pages.set(
    modelUrl(m),
    page({
      path: modelUrl(m),
      title,
      description,
      crumbs: [["Home", "/"], ["Pricing", "/pricing/"], [company, providerUrl(m.provider)], [m.name, modelUrl(m)]],
      jsonLd: [
        {
          "@type": "FAQPage",
          mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        },
      ],
      body: `
      <h1>${escape(m.name)} API pricing</h1>
      <p class="lead">${escape(intro)}</p>
      <div class="badge">Prices updated ${longDate}</div>

      <div class="stats">
        <div class="card stat"><div class="k">Input / 1M tokens</div><div class="v num">${rate(s.input)}</div></div>
        <div class="card stat"><div class="k">Output / 1M tokens</div><div class="v num">${rate(s.output)}</div></div>
        <div class="card stat"><div class="k">Cached input / 1M tokens</div><div class="v num">${rate(s.cachedInput)}</div></div>
        <div class="card stat"><div class="k">Typical request</div><div class="v num">${usd(typicalCost)}</div></div>
      </div>
      <a class="cta" href="/?model=${encodeURIComponent(m.name)}#calculator">Calculate the cost of your prompt →</a>

      <h2>${escape(m.name)} price per million tokens</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Token type</th><th scope="col">Standard</th>${hasBatch ? '<th scope="col">Batch API</th>' : ""}</tr></thead>
        <tbody>
${rateRows}
        </tbody>
      </table></div>
      ${features.length ? `<p class="note">${escape(m.name)} supports ${features.join(", ").replace(/, ([^,]*)$/, " and $1")}.</p>` : ""}

      <h2>What ${escape(m.name)} costs per request</h2>
      <div class="card table-wrap"><table class="num">
        <thead><tr><th scope="col">Request</th><th scope="col">1 request</th><th scope="col">1,000 requests</th><th scope="col">1M requests</th></tr></thead>
        <tbody>
${scenarioRows}
        </tbody>
      </table></div>
      <p class="note">At standard rates. A token is about 4 characters of English text, so 1,000 tokens is roughly 750 words.${
        m.provider === "openai" ? "" : ` ${escape(company)} counts tokens with its own tokenizer, so the same text can be a different number of tokens.`
      }</p>

      <h2>Models with a similar price</h2>
${priceTable(similar)}

      <h2>Other ${escape(company)} models</h2>
      <ul class="links">${siblings.map((o) => `<li><a href="${modelUrl(o)}">${escape(o.name)}</a> <span class="muted num">${rate(o.standard.input)} / ${rate(o.standard.output)}</span></li>`).join("")}</ul>
      ${m.source ? `<p class="note">Source: <a href="${escape(m.source)}" rel="nofollow">${escape(company)} pricing</a>.</p>` : ""}
`,
    })
  );
}

// ---------- Provider pages ----------

const providerKeys = Object.keys(providers).filter((key) => models.some((m) => m.provider === key));

for (const key of providerKeys) {
  const list = models.filter((m) => m.provider === key).sort((a, b) => (typical(a) ?? Infinity) - (typical(b) ?? Infinity));
  const cheapest = list[0];
  const priciest = list[list.length - 1];
  const name = providers[key];
  const title = `${providerTitle(key)} API Pricing – All Models per 1M Tokens`;
  const intro = `${name} API prices for all ${list.length} ${BRANDS[key]} models, per million tokens. The cheapest is ${cheapest.name} at ${rate(
    cheapest.standard.input
  )} input and ${rate(cheapest.standard.output)} output; the most expensive is ${priciest.name} at ${rate(priciest.standard.input)} input and ${rate(
    priciest.standard.output
  )} output.`;

  pages.set(
    providerUrl(key),
    page({
      path: providerUrl(key),
      title,
      description: `${intro} Updated ${longDate}.`,
      crumbs: [["Home", "/"], ["Pricing", "/pricing/"], [name, providerUrl(key)]],
      body: `
      <h1>${escape(providerTitle(key))} API pricing</h1>
      <p class="lead">${escape(intro)}</p>
      <div class="badge">Prices updated ${longDate}</div>
      <h2>${escape(name)} model prices</h2>
${priceTable(list, { provider: false })}
      <p class="note">Sorted by the cost of a typical request of 1,000 input and 500 output tokens. Open a model for batch prices, context window and example costs.</p>
      <a class="cta" href="/#calculator">Calculate the cost of your own prompt →</a>
`,
    })
  );
}

// ---------- Index ----------

pages.set(
  "/pricing/",
  page({
    path: "/pricing/",
    title: "LLM API Pricing – Compare Every Model per 1M Tokens",
    description: `API prices per million tokens for ${models.length} models from OpenAI, Anthropic, Google Gemini, Mistral, DeepSeek and xAI. Updated ${longDate}.`,
    crumbs: [["Home", "/"], ["Pricing", "/pricing/"]],
    body: `
      <h1>LLM API pricing by model</h1>
      <p class="lead">Prices per million tokens for ${models.length} models from ${providerKeys.map((k) => providers[k]).join(", ").replace(/, ([^,]*)$/, " and $1")}, updated daily.</p>
      <h2>By provider</h2>
      <div class="providers">${providerKeys
        .map((key) => {
          const n = models.filter((m) => m.provider === key).length;
          return `<a class="card" href="${providerUrl(key)}"><span class="dot" style="--p:${PROVIDER_COLORS[key]}"></span><strong>${escape(providerTitle(key))}</strong><div class="muted">${n} models</div></a>`;
        })
        .join("")}</div>
      <h2>All models</h2>
${priceTable([...models].sort((a, b) => (typical(a) ?? Infinity) - (typical(b) ?? Infinity)))}
      <a class="cta" href="/#calculator">Calculate the cost of your own prompt →</a>
`,
  })
);

// ---------- Write ----------

// Start from scratch so models that left the price list lose their page.
await rm(new URL("pricing/", root), { recursive: true, force: true });
for (const [path, html] of pages) {
  const dir = new URL("." + path, root);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL("index.html", dir), html);
}

const urls = ["/", ...pages.keys()];
await writeFile(
  new URL("sitemap.xml", root),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${updated}</lastmod>\n  </url>`).join("\n")}
</urlset>
`
);
console.log(`pricing pages: ${pages.size}`);
