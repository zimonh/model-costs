// Tells IndexNow (Bing, Yandex, Seznam, Naver) which pages changed, so they
// recrawl them within hours instead of weeks. Bing's index also feeds ChatGPT
// search and Copilot. Takes changed repo files and maps them to URLs; removed
// pages are reported too, so they drop out of the index.
// Usage: node scripts/indexnow.mjs index.html pricing/gpt-4o/index.html ...
// Other files are ignored, so passing every changed file is fine.
import { readdir } from "node:fs/promises";
import { SITE } from "./site.mjs";

// IndexNow checks that we own the site by fetching <key>.txt from its root.
const keyFile = (await readdir(new URL("../", import.meta.url))).find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("No IndexNow key file (<32 hex chars>.txt) in the site root");
const key = keyFile.slice(0, -4);

const urls = [
  ...new Set(
    process.argv
      .slice(2)
      .filter((file) => /(^|\/)index\.html$/.test(file))
      .map((file) => SITE + "/" + file.replace(/index\.html$/, ""))
  ),
];
if (!urls.length) {
  console.log("indexnow: no page changes to submit");
  process.exit(0);
}

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/${keyFile}`, urlList: urls }),
});
// 200 and 202 both mean accepted; anything else is worth a look but not worth failing the job.
console.log(`indexnow: submitted ${urls.length} URL(s), HTTP ${response.status}`);
if (!response.ok) console.log(`::warning::IndexNow answered HTTP ${response.status}: ${await response.text()}`);
