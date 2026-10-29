// Shared by the build scripts: the providers the site covers and how prices
// are formatted. index.html has its own copy of the formatting, because it
// runs in the browser without a build step.

export const SITE = "https://apicost.app";

// Keyed by LiteLLM's provider id. `brand` is what people search for.
export const PROVIDERS = {
  openai: { name: "OpenAI", brand: "ChatGPT", color: "#10a37f" },
  anthropic: { name: "Anthropic", brand: "Claude", color: "#d97757" },
  gemini: { name: "Google Gemini", brand: "Gemini", color: "#4285f4" },
  mistral: { name: "Mistral", brand: "Mistral", color: "#fa520f" },
  deepseek: { name: "DeepSeek", brand: "DeepSeek", color: "#4d6bfe" },
  xai: { name: "xAI", brand: "Grok", color: "#8b8f98" },
};

// "Anthropic Claude", but just "Google Gemini" where the name already says it.
export const providerTitle = (key) => {
  const { name, brand } = PROVIDERS[key];
  return name.includes(brand) ? name : `${name} ${brand}`;
};

// Aliases like gpt-5-latest point at another model, so they get no page of their own.
export const hasPage = (model) => !model.name.endsWith("-latest");
export const modelPath = (model) => `/pricing/${model.name}/`;
export const providerPath = (key) => `/pricing/${key}/`;

// The request the site quotes everywhere: 1,000 input and 500 output tokens.
export const TYPICAL = { input: 1000, output: 500 };

// Cost in USD of one request, or null when the model has no price for this mode.
export const cost = (prices, input, output) =>
  prices.input == null || prices.output == null ? null : (prices.input * input + prices.output * output) / 1e6;
export const typicalCost = (model) => cost(model.standard, TYPICAL.input, TYPICAL.output);

export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A price per 1M tokens: $2.5, $0.075.
export const rate = (n) => (n == null ? "–" : "$" + Number(n.toPrecision(4)));

// An amount of money: $14.00, $0.0035.
export const usd = (n) =>
  n == null
    ? "–"
    : "$" + (n >= 0.1 ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(n.toPrecision(3)));

// A token count: 128K, 1M.
export const tokens = (n) => (n >= 1e6 ? `${Number((n / 1e6).toPrecision(3))}M` : n >= 1000 ? `${Number((n / 1000).toPrecision(3))}K` : String(n));

// "a, b and c"
export const list = (items) => items.join(", ").replace(/, ([^,]*)$/, " and $1");

// The name people search for: gpt-5.4-mini -> GPT-5.4 mini, claude-sonnet-4-6 -> Claude Sonnet 4.6,
// gemini-2.5-flash-lite -> Gemini 2.5 Flash Lite, ministral-3-14b-2512 -> Ministral 3 14B 2512.
const WORDS = { deepseek: "DeepSeek", gpt: "GPT", fim: "FIM" };
export function displayName(name) {
  if (/^o\d/.test(name)) return name;
  if (name.startsWith("gpt-")) {
    const [, version, ...rest] = name.split("-");
    return [`GPT-${version}`, ...rest.map((w) => (/^(mini|nano)$/.test(w) ? w : displayWord(w)))].join(" ");
  }
  // Runs of single digits are a version: claude-opus-4-5 -> 4.5, mistral-medium-3-5 -> 3.5.
  return name
    .replace(/(?<=-|^)\d(?:-\d)+(?=-|$)/g, (v) => v.replaceAll("-", "."))
    .split("-")
    .map(displayWord)
    .join(" ");
}
const displayWord = (w) =>
  WORDS[w] ?? (/^\d+b$/.test(w) ? w.toUpperCase() : /^[vr]\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1));

// "Oct 28, 2026" style dates in visible text vary, so pages are compared without them.
export const withoutDates = (s) =>
  s
    .replace(/\d{4}-\d{2}-\d{2}/g, "")
    .replace(/(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/g, "")
    .replace(/© \d{4}/g, "");

// Some models are listed under several ids with the same prices: dated snapshots
// (grok-code-fast-1-0825), dotted and dashed spellings (mistral-medium-3.5 / 3-5)
// and variants (grok-4.20-reasoning). Their pages would be near-copies, so each
// group gets one canonical page and the others point at it.
// Returns Map(alias name -> primary model).
const SNAPSHOT = /-(\d{4}|\d{8})(?=-|$)/g;
const isSnapshot = (name) => /-(\d{4}|\d{8})(-|$)/.test(name);
const baseName = (name) => name.replace(SNAPSHOT, "").replace(/-0$/, "");
const normalName = (name) => baseName(name).replaceAll(".", "-");
const priceKey = (m) => JSON.stringify([m.provider, m.standard, m.batch, m.maxInputTokens]);
export function findAliases(models) {
  const aliases = new Map();
  const groups = Map.groupBy(models, priceKey);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Prefer a plain, short id as the page: mistral-large-3 over mistral-large-2512.
    const ranked = [...group].sort(
      (a, b) =>
        Number(isSnapshot(a.name)) - Number(isSnapshot(b.name)) ||
        normalName(a.name).length - normalName(b.name).length ||
        a.name.length - b.name.length
    );
    const primaries = [];
    for (const m of ranked) {
      // Same id once spelled alike, or the id plus a suffix after a dash (not a dot: gpt-5.1 is not gpt-5).
      const primary = primaries.find(
        (p) => normalName(m.name) === normalName(p.name) || baseName(m.name).startsWith(baseName(p.name) + "-")
      );
      if (primary) aliases.set(m.name, primary);
      else primaries.push(m);
    }
  }
  return aliases;
}
