// Checks the built site before it is published: every internal link and
// sitemap URL points at a file, structured data parses, and the search basics
// hold: one canonical per page, sitemap = exactly the self-canonical pages,
// unique titles and descriptions of a sane length, one <h1>, FAQ structured
// data that matches visible text, and llms.txt links that resolve. Also: every
// page loads analytics.js, no structured data names a person, the Dataset
// carries its license, and each provider page has its FAQ, breadcrumbs and date.
// Exits non-zero with a list of problems.
// Usage: node scripts/check-site.mjs
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { SITE, PROVIDERS, providerPath, providerAliasPath } from "./site.mjs";

const DATA_LICENSE = "https://creativecommons.org/licenses/by/4.0/";
// Every node in a JSON-LD tree, nested ones included.
const nodes = (value) => (Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" ? [value, ...Object.values(value).flatMap(nodes)] : []);
const types = new Map(); // page -> JSON-LD nodes

const root = fileURLToPath(new URL("../", import.meta.url));
const problems = [];

async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith(".html")) yield path;
  }
}

// "/pricing/gpt-4o/?x#y" -> <root>/pricing/gpt-4o/index.html
const fileFor = (urlPath) => {
  const path = decodeURIComponent(urlPath.replace(/[?#].*$/, ""));
  return join(root, path.endsWith("/") ? path + "index.html" : path);
};

const titles = new Map();
const descriptions = new Map();
const selfCanonical = new Set();
const canonicalTargets = new Map();
const text = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c)).replace(/\s+/g, " ");
let pages = 0;
for await (const file of htmlFiles(root)) {
  const name = "/" + relative(root, file);
  const html = await readFile(file, "utf8");
  pages++;

  // Links built in the page's own JavaScript (href="/pricing/${...}") are checked by their generated copies.
  for (const [, href] of html.matchAll(/\bhref="(\/[^"$]*)"/g)) {
    if (!existsSync(fileFor(href))) problems.push(`${name}: broken link ${href}`);
  }

  if (!html.includes('<script src="/analytics.js" defer></script>')) problems.push(`${name}: does not load /analytics.js`);

  const visible = text(html);
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let ld;
    try {
      ld = JSON.parse(json);
    } catch (e) {
      problems.push(`${name}: invalid JSON-LD (${e.message})`);
      continue;
    }
    const all = nodes(ld);
    types.set(name, [...(types.get(name) ?? []), ...all]);
    // The site is published as the apicost.app Organization, never under a person's name.
    for (const node of all) {
      if (node["@type"] === "Person" || node.author || node.founder) problems.push(`${name}: structured data names a person`);
    }
    // Google ignores (or penalises) FAQ markup for questions the page doesn't show.
    for (const node of [ld, ...(ld["@graph"] ?? [])].filter((n) => n["@type"] === "FAQPage")) {
      for (const q of node.mainEntity) {
        if (!visible.includes(q.name)) problems.push(`${name}: FAQ question not on the page: ${q.name}`);
        if (!visible.includes(q.acceptedAnswer.text.slice(0, 60))) problems.push(`${name}: FAQ answer not on the page: ${q.name}`);
      }
    }
  }

  if (/<meta name="robots" content="noindex/.test(html)) continue;
  const h1s = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1s !== 1) problems.push(`${name}: ${h1s} <h1> elements`);
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!canonical?.startsWith(SITE + "/")) problems.push(`${name}: no canonical URL`);
  const self = SITE + name.replace(/index\.html$/, "");
  if (canonical === self) selfCanonical.add(self);
  else canonicalTargets.set(self, canonical);
  const ogUrl = html.match(/<meta property="og:url" content="([^"]*)"/)?.[1];
  if (ogUrl !== canonical) problems.push(`${name}: og:url ${ogUrl} differs from canonical ${canonical}`);

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) problems.push(`${name}: no <title>`);
  else if (titles.has(title)) problems.push(`${name}: same title as ${titles.get(title)}`);
  else titles.set(title, name);
  const description = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1];
  if (!description) problems.push(`${name}: no meta description`);
  else if (description.length < 50 || description.length > 180) problems.push(`${name}: meta description is ${description.length} characters (want 50–180)`);
  else if (canonical === self && descriptions.has(description)) problems.push(`${name}: same description as ${descriptions.get(description)}`);
  else if (canonical === self) descriptions.set(description, name);
}

const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url);
for (const url of urls) {
  if (!url.startsWith(SITE + "/") || !existsSync(fileFor(url.slice(SITE.length)))) problems.push(`sitemap.xml: ${url} has no page`);
  else if (!selfCanonical.has(url)) problems.push(`sitemap.xml: ${url} is not its own canonical`);
}
for (const url of selfCanonical) if (!urls.includes(url)) problems.push(`sitemap.xml: missing ${url}`);
for (const [url, target] of canonicalTargets) if (!selfCanonical.has(target)) problems.push(`${url}: canonical ${target} is not a canonical page`);
for (const [, mod] of sitemap.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mod)) problems.push(`sitemap.xml: bad lastmod ${mod}`);
}
if ((sitemap.match(/<lastmod>/g) ?? []).length !== urls.length) problems.push("sitemap.xml: not every URL has a lastmod");

// The price data is CC BY 4.0: the Dataset says so, and so do the files people copy it from.
const dataset = (types.get("/pricing/index.html") ?? []).find((n) => n["@type"] === "Dataset");
if (!dataset) problems.push("/pricing/: no Dataset structured data");
else if (dataset.license !== DATA_LICENSE) problems.push(`/pricing/: Dataset license is ${dataset.license}, want ${DATA_LICENSE}`);
if (!existsSync(join(root, "LICENSE"))) problems.push("LICENSE: missing");

// Provider pages answer "<brand> API pricing": FAQ, breadcrumbs and a date in their structured data.
const prices = JSON.parse(await readFile(join(root, "prices.json"), "utf8"));
for (const key of Object.keys(PROVIDERS).filter((k) => prices.models.some((m) => m.provider === k))) {
  const page = providerPath(key) + "index.html";
  const ld = types.get(page) ?? [];
  for (const type of ["FAQPage", "BreadcrumbList"]) if (!ld.some((n) => n["@type"] === type)) problems.push(`${page}: no ${type}`);
  if (!ld.some((n) => n["@type"] === "WebPage" && n.dateModified)) problems.push(`${page}: no dateModified`);
  const alias = providerAliasPath(key);
  if (alias && !canonicalTargets.has(SITE + alias)) problems.push(`${alias}: should be an alias of ${providerPath(key)}`);
}

// llms.txt and llms-full.txt are read by AI assistants: their links must work too.
for (const file of ["llms.txt", "llms-full.txt"]) {
  const body = await readFile(join(root, file), "utf8").catch(() => null);
  if (body == null) {
    problems.push(`${file}: missing`);
    continue;
  }
  if (!body.includes(DATA_LICENSE)) problems.push(`${file}: no license line`);
  for (const [, url] of body.matchAll(/\]\((https:\/\/apicost\.app\/[^)]*)\)/g)) {
    if (!existsSync(fileFor(url.slice(SITE.length)))) problems.push(`${file}: broken link ${url}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in the built site`);
  process.exit(1);
}
console.log(`check: ${pages} pages, ${urls.length} sitemap URLs, all links resolve`);
