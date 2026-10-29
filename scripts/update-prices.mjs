// Builds prices.json from LiteLLM's maintained price list, which links each
// provider's own pricing page. scripts/build-site.mjs renders the site from it.
// Run by .github/workflows/update-prices.yml.
// Usage: node scripts/update-prices.mjs [source.json]
import { readFile, writeFile } from "node:fs/promises";
import { PROVIDERS } from "./site.mjs";

const SOURCE =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// Snapshot ids like gpt-4o-2024-08-06 or claude-3-5-sonnet-20241022.
const DATED = /-(\d{4}-\d{2}-\d{2}|\d{8}|\d{4})$/;
const SKIP = /(^ft:|realtime|audio|tts|transcribe|search|image|embed|moderation|computer-use|-exp|preview-\d|learnlm|gemma|live|lyria|robotics|voxtral|vibe|cyber|customtools|zai-|glm|-gv2|daybreak|rosalind|beta)/;

// Per-token USD -> per-1M-token USD, rounded to avoid float noise.
const perMillion = (v) => (typeof v === "number" ? Math.round(v * 1e6 * 1e6) / 1e6 : null);

// A higher price for prompts over a token threshold, such as LiteLLM's
// input_cost_per_token_above_200k_tokens: { above: 200000, input, cachedInput, output }.
function longContext(m) {
  const tier = Object.keys(m)
    .map((key) => key.match(/^input_cost_per_token_above_(\d+)k_tokens$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b)[0];
  if (!tier) return null;
  return {
    above: tier * 1000,
    input: perMillion(m[`input_cost_per_token_above_${tier}k_tokens`]),
    cachedInput: perMillion(m[`cache_read_input_token_cost_above_${tier}k_tokens`]),
    output: perMillion(m[`output_cost_per_token_above_${tier}k_tokens`]),
  };
}

const raw = process.argv[2]
  ? await readFile(process.argv[2], "utf8")
  : await (await fetch(SOURCE)).text();
const source = JSON.parse(raw);
const today = new Date().toISOString().slice(0, 10);

const byName = new Map();
for (const [key, m] of Object.entries(source)) {
  if (!m || typeof m !== "object" || m.mode !== "chat") continue;
  if (!(m.litellm_provider in PROVIDERS)) continue;
  if (typeof m.input_cost_per_token !== "number" || typeof m.output_cost_per_token !== "number") continue;
  if (m.deprecation_date && m.deprecation_date < today) continue;

  const name = key.replace(/^[a-z_]+\//, "");
  if (SKIP.test(name)) continue;

  byName.set(name, {
    name,
    provider: m.litellm_provider,
    source: m.source ?? null,
    standard: {
      input: perMillion(m.input_cost_per_token),
      cachedInput: perMillion(m.cache_read_input_token_cost),
      output: perMillion(m.output_cost_per_token),
    },
    batch: {
      input: perMillion(m.input_cost_per_token_batches),
      cachedInput: perMillion(m.cache_read_input_token_cost_batches),
      output: perMillion(m.output_cost_per_token_batches),
    },
    // Used by the pages, not by the calculator.
    // Writing to the prompt cache (Anthropic charges for it; 1h is the longer-lived cache).
    cacheWrite: perMillion(m.cache_creation_input_token_cost),
    cacheWrite1h: perMillion(m.cache_creation_input_token_cost_above_1hr),
    longContext: longContext(m),
    maxInputTokens: m.max_input_tokens ?? null,
    maxOutputTokens: m.max_output_tokens ?? null,
    vision: m.supports_vision === true,
    tools: m.supports_function_calling === true,
    reasoning: m.supports_reasoning === true,
  });
}

// Drop dated snapshots when the undated alias is listed too.
for (const name of [...byName.keys()]) {
  const alias = name.replace(DATED, "");
  if (alias !== name && byName.has(alias)) byName.delete(name);
}

const providerOrder = Object.keys(PROVIDERS);
const models = [...byName.values()].sort(
  (a, b) =>
    providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider) ||
    a.name.localeCompare(b.name, "en", { numeric: true })
);

// A broken or renamed upstream file would otherwise publish an empty site.
if (models.length < 40) throw new Error(`Only ${models.length} models in the LiteLLM list, refusing to publish`);

// prices.json keeps the plain { id: name } map the calculator reads.
const providers = Object.fromEntries(Object.entries(PROVIDERS).map(([key, p]) => [key, p.name]));
const out = {
  updated: today,
  source: SOURCE,
  license: "https://creativecommons.org/licenses/by/4.0/",
  attribution: "apicost.app (https://apicost.app/pricing/), from the LiteLLM price list (MIT License)",
  providers,
  models,
};
await writeFile(new URL("../prices.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`prices.json: ${models.length} models`);
