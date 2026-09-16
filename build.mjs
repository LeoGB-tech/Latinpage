// Prépare le dossier dist/ publié sur GitHub Pages :
// copie du site, minification CSS/JS, version du cache du service worker.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const version = process.env.CACHE_VERSION || String(Date.now());

await fs.rm(DIST, { recursive: true, force: true });
await fs.mkdir(DIST, { recursive: true });
for (const item of ["index.html", "manifest.json", "sw.js", "css", "js", "fonts", "img", "data", "icons"]) {
  await fs.cp(path.join(ROOT, item), path.join(DIST, item), { recursive: true });
}
await fs.mkdir(path.join(DIST, "tools"), { recursive: true });
await fs.cp(path.join(ROOT, "tools/rapport-images.html"), path.join(DIST, "tools/rapport-images.html")).catch(() => {});

const minify = async (file, loader) => {
  const p = path.join(DIST, file);
  const { code } = await transform(await fs.readFile(p, "utf8"), { loader, minify: true, target: loader === "js" ? "es2019" : undefined });
  await fs.writeFile(p, code);
};
await minify("css/style.css", "css");
await minify("js/app.js", "js");

const swPath = path.join(DIST, "sw.js");
const sw = (await fs.readFile(swPath, "utf8")).replace(/const CACHE = "cache-v\d+";/, `const CACHE = "cache-v${version}";`);
await fs.writeFile(swPath, (await transform(sw, { loader: "js", minify: true })).code);

console.log(`dist/ prêt (cache-v${version})`);
