// Writes price-history.json: every price change, new model and retired model
// since the site started tracking, rebuilt from the git history of prices.json.
// Git is the record, so there is no state to keep in sync: each commit that
// changed prices.json is one snapshot, and the working copy (a fresh run of
// update-prices.mjs not committed yet) is the newest one, dated today.
// Needs the full history (actions/checkout with fetch-depth: 0).
// Usage: node scripts/price-history.mjs
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 1 << 28 }).toString();

const FIELDS = ["input", "cachedInput", "output"];
const prices = (m) => Object.fromEntries(FIELDS.map((f) => [f, m.standard[f] ?? null]));
const snapshots = git("log", "--reverse", "--format=%H %cs", "--", "prices.json")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => line.split(" "))
  .map(([hash, date]) => ({ date, data: JSON.parse(git("show", `${hash}:prices.json`)) }));

const working = JSON.parse(await readFile(new URL("prices.json", root), "utf8"));
const committed = snapshots.at(-1)?.data;
if (!committed || JSON.stringify(committed.models) !== JSON.stringify(working.models)) {
  snapshots.push({ date: new Date().toISOString().slice(0, 10), data: working });
}

// The first snapshot is where tracking starts: its models are not "new".
const events = [];
for (let i = 1; i < snapshots.length; i++) {
  const { date } = snapshots[i];
  const before = new Map(snapshots[i - 1].data.models.map((m) => [m.name, m]));
  const after = new Map(snapshots[i].data.models.map((m) => [m.name, m]));
  for (const [name, m] of after) {
    const old = before.get(name);
    if (!old) events.push({ date, model: name, provider: m.provider, type: "new", before: null, after: prices(m) });
    else if (FIELDS.some((f) => (old.standard[f] ?? null) !== (m.standard[f] ?? null)))
      events.push({ date, model: name, provider: m.provider, type: "change", before: prices(old), after: prices(m) });
  }
  for (const [name, old] of before) {
    if (!after.has(name)) events.push({ date, model: name, provider: old.provider, type: "retired", before: prices(old), after: null });
  }
}

events.sort((a, b) => b.date.localeCompare(a.date) || a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model, "en", { numeric: true }));
const out = {
  since: snapshots[0]?.date ?? null,
  note: "Changes to the LiteLLM price list as apicost.app saw them, per 1M tokens in USD (standard rates). The date is the day the change reached the list, which can be a few days after the provider announced it.",
  events,
};
await writeFile(new URL("price-history.json", root), JSON.stringify(out, null, 1) + "\n");
console.log(`price-history.json: ${events.length} events since ${out.since}`);
