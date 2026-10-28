// Checks the built site before it is published: every internal link and
// sitemap URL points at a file, structured data parses, and no two pages
// share a title. Exits non-zero with a list of problems.
// Usage: node scripts/check-site.mjs
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { SITE } from "./site.mjs";

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
let pages = 0;
for await (const file of htmlFiles(root)) {
  const name = "/" + relative(root, file);
  const html = await readFile(file, "utf8");
  pages++;

  // Links built in the page's own JavaScript (href="/pricing/${...}") are checked by their generated copies.
  for (const [, href] of html.matchAll(/\bhref="(\/[^"$]*)"/g)) {
    if (!existsSync(fileFor(href))) problems.push(`${name}: broken link ${href}`);
  }

  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(json);
    } catch (e) {
      problems.push(`${name}: invalid JSON-LD (${e.message})`);
    }
  }

  if (/<meta name="robots" content="noindex"/.test(html)) continue;
  if (!/<link rel="canonical" href="https:\/\/apicost\.app\//.test(html)) problems.push(`${name}: no canonical URL`);
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  if (!title) problems.push(`${name}: no <title>`);
  else if (titles.has(title)) problems.push(`${name}: same title as ${titles.get(title)}`);
  else titles.set(title, name);
}

const sitemap = await readFile(join(root, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(([, url]) => url);
for (const url of urls) {
  if (!url.startsWith(SITE + "/") || !existsSync(fileFor(url.slice(SITE.length)))) problems.push(`sitemap.xml: ${url} has no page`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s) in the built site`);
  process.exit(1);
}
console.log(`check: ${pages} pages, ${urls.length} sitemap URLs, all links resolve`);
