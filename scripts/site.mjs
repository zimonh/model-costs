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
