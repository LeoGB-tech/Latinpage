// Import des illustrations depuis Wikimedia Commons (lancé automatiquement par GitHub Actions).
//
//   node tools/fetch-images.mjs              importe les illustrations manquantes
//   node tools/fetch-images.mjs --force      réimporte tout
//   node tools/fetch-images.mjs --only newton.webp --force
//   node tools/fetch-images.mjs --allow-cc   accepte aussi les photos sous licence Creative Commons
//
// Critères (cahier des charges, § 4) : domaine public avéré (ou CC0), œuvre d’époque représentant
// bien l’auteur (voir tools/images.json), définition suffisante, recadrage vertical 9:16,
// export WebP 2x (1080 × 1920) et 1x (540 × 960) + JPEG de secours, lisibilité WCAG AA vérifiée.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UA = "CitationsLatines/1.0 (https://github.com/LeoGB-tech ; PWA de citations latines)";
const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const ALLOW_CC = argv.includes("--allow-cc");
const ONLY = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;

const W = 1080, H = 1920;
const BEIGE = [230, 225, 218];
const OVERLAY_TOP = 0.4, OVERLAY_BOTTOM = 0.9; // linear-gradient(to top, rgba(230,225,218,.9), rgba(230,225,218,.4))
const MIN_CROP_HEIGHT = 1200;
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const GLOBAL_EXCLUDE = /replica|réplique|copy of|cast of|plaster|gips|abguss|stamp|banknote|postage|\.svg$|\.pdf$|\.djvu$|\.gif$|drawing by|cartoon|caricature|wikidata|logo/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const exists = (p) => fs.access(p).then(() => true, () => false);

async function request(url, { json = true, tries = 5 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (res.ok) return json ? res.json() : Buffer.from(await res.arrayBuffer());
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * attempt;
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status} pour ${url}`);
  }
}

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const IIPROP = "url|size|mime|extmetadata";

function toInfo(page) {
  if (!page || page.missing !== undefined || !page.imageinfo || !page.imageinfo[0]) return null;
  const ii = page.imageinfo[0];
  const m = ii.extmetadata || {};
  const license = strip(m.LicenseShortName?.value) || strip(m.License?.value);
  return {
    file: page.title.replace(/^File:/, ""),
    url: ii.descriptionurl,
    original: ii.url,
    bytes: ii.size,
    width: ii.width,
    height: ii.height,
    mime: ii.mime,
    title: strip(m.ObjectName?.value) || page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
    artist: strip(m.Artist?.value),
    license,
    public_domain: /public domain|domaine public|^pd\b|pd-|cc0|cc-zero/i.test(license) || /^pd|cc0/i.test(strip(m.License?.value)),
    index: page.index ?? 0
  };
}

async function filesInfo(files) {
  if (!files.length) return [];
  const url = `${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=${IIPROP}&titles=${encodeURIComponent(files.map((f) => "File:" + f).join("|"))}`;
  const data = await request(url);
  const pages = Object.values(data.query?.pages || {});
  return files.map((f) => toInfo(pages.find((p) => p.title === "File:" + f || p.title.replace(/_/g, " ") === "File:" + f.replace(/_/g, " ")))).filter(Boolean);
}

async function searchInfo(query) {
  const url = `${COMMONS}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(query + " filetype:bitmap")}&prop=imageinfo&iiprop=${IIPROP}`;
  const data = await request(url);
  return Object.values(data.query?.pages || {}).map(toInfo).filter(Boolean).sort((a, b) => a.index - b.index);
}

async function wikiLead(title) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&redirects=1&titles=${encodeURIComponent(title)}`;
  const data = await request(url);
  const page = Object.values(data.query?.pages || {})[0];
  return page?.pageimage || null;
}

function verdict(info, entry) {
  const name = `${info.file} ${info.title}`;
  if (!/^image\/(jpeg|png|tiff|webp)$/.test(info.mime || "")) return `format ${info.mime}`;
  if (GLOBAL_EXCLUDE.test(name)) return "copie, reproduction moderne ou format exclu";
  if (entry.must && !new RegExp(entry.must, "i").test(name)) return "ne correspond pas à l’auteur";
  if (entry.exclude && new RegExp(entry.exclude, "i").test(name)) return "œuvre écartée (moderne ou hors sujet)";
  const cropHeight = Math.min(info.height, Math.round(info.width * 16 / 9));
  if (cropHeight < MIN_CROP_HEIGHT) return `définition insuffisante (${info.width}×${info.height})`;
  if (!info.public_domain && !ALLOW_CC) return `pas dans le domaine public (${info.license || "licence inconnue"})`;
  return null;
}

async function downloadUrl(info) {
  if (info.bytes && info.bytes <= MAX_ORIGINAL_BYTES && info.mime !== "image/tiff") return info.original;
  const url = `${COMMONS}?action=query&format=json&prop=imageinfo&iiprop=url&iiurlwidth=2560&titles=${encodeURIComponent("File:" + info.file)}`;
  const data = await request(url);
  const ii = Object.values(data.query.pages)[0].imageinfo[0];
  return ii.thumburl || ii.url;
}

/* ---------- Lisibilité (WCAG AA) ---------- */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const grayFromLum = (L) => { const c = L <= 0.0031308 ? L * 12.92 : 1.055 * L ** (1 / 2.4) - 0.055; return c * 255; };

// Zones de texte de la carte (fractions de la hauteur / largeur) et exigences de contraste
const ZONES = [
  { name: "en-tête", y: [0.0, 0.09], x: [0.2, 0.8], ink: 26, alpha: 0.7, min: 4.5 },
  { name: "citation", y: [0.12, 0.8], x: [0.06, 0.94], ink: 42, alpha: 1, min: 4.5 },
  { name: "métadonnées", y: [0.8, 0.93], x: [0.4, 0.96], ink: 26, alpha: 0.85, min: 4.5 },
  { name: "progression", y: [0.93, 1.0], x: [0.7, 0.97], ink: 26, alpha: 0.7, min: 4.5 }
];

function zoneContrast(data, w, h, lift) {
  const results = [];
  for (const z of ZONES) {
    const lums = [];
    for (let y = Math.floor(z.y[0] * h); y < Math.ceil(z.y[1] * h); y++) {
      const a = OVERLAY_TOP + (OVERLAY_BOTTOM - OVERLAY_TOP) * (y / (h - 1));
      for (let x = Math.floor(z.x[0] * w); x < Math.ceil(z.x[1] * w); x++) {
        const i = (y * w + x) * 3;
        const px = [0, 1, 2].map((k) => a * BEIGE[k] + (1 - a) * (data[i + k] * (1 - lift) + 255 * lift));
        lums.push(lum(px[0], px[1], px[2]));
      }
    }
    lums.sort((p, q) => p - q);
    const bg = lums[Math.floor(lums.length * 0.02)];
    const g = grayFromLum(bg);
    const ink = z.alpha * z.ink + (1 - z.alpha) * g;
    const r = ratio(bg, lum(ink, ink, ink));
    results.push({ name: z.name, ratio: r, ok: r >= z.min });
  }
  return results;
}

async function processImage(buffer, image) {
  const base = sharp(buffer, { limitInputPixels: false, failOn: "none" })
    .rotate()
    .resize(W, H, { fit: "cover", position: sharp.strategy.attention })
    .removeAlpha()
    .toColourspace("srgb");
  const full = await base.clone().raw().toBuffer({ resolveWithObject: true });

  const small = await sharp(full.data, { raw: full.info }).resize(270, 480).raw().toBuffer({ resolveWithObject: true });
  let lift = 0, checks = zoneContrast(small.data, small.info.width, small.info.height, 0);
  while (checks.some((c) => !c.ok) && lift < 0.9) {
    lift = Math.round((lift + 0.02) * 100) / 100;
    checks = zoneContrast(small.data, small.info.width, small.info.height, lift);
  }

  const adjusted = () => sharp(full.data, { raw: full.info }).linear(1 - lift, 255 * lift);
  const stem = image.replace(/\.webp$/i, "");
  await adjusted().webp({ quality: 76, effort: 5 }).toFile(path.join(ROOT, "img", `${stem}.webp`));
  await adjusted().resize(540, 960).webp({ quality: 74, effort: 5 }).toFile(path.join(ROOT, "img", `${stem}-540.webp`));
  await adjusted().jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(ROOT, "img", `${stem}.jpg`));
  return { lift, checks };
}

/* ---------- Programme ---------- */
const map = JSON.parse(await fs.readFile(path.join(ROOT, "tools/images.json"), "utf8"));
const quotes = JSON.parse(await fs.readFile(path.join(ROOT, "data/citations.json"), "utf8"));
const creditsPath = path.join(ROOT, "data/credits.json");
const credits = new Map(JSON.parse(await fs.readFile(creditsPath, "utf8").catch(() => "[]")).map((c) => [c.image, c]));
const images = [...new Set(quotes.map((q) => q.image))];
const report = [];

await fs.mkdir(path.join(ROOT, "img"), { recursive: true });

for (const image of images) {
  const entry = map[image];
  if (!entry) { console.warn(`⚠  ${image} : aucune entrée dans tools/images.json`); report.push({ image, author: "?", missing: "aucune entrée dans tools/images.json" }); continue; }
  if (ONLY && ONLY !== image) { if (credits.has(image)) report.push(credits.get(image)); continue; }
  if (!FORCE && credits.has(image) && (await exists(path.join(ROOT, "img", image)))) {
    console.log(`✓  ${image} déjà présent`);
    report.push(credits.get(image));
    continue;
  }

  const tried = [];
  let chosen = null;
  try {
    const seen = new Set();
    const consider = async (infos, origin) => {
      for (const info of infos) {
        if (chosen || seen.has(info.file)) continue;
        seen.add(info.file);
        const why = verdict(info, entry);
        tried.push({ file: info.file, origin, why: why || "retenue" });
        if (!why) chosen = info;
      }
    };
    if (entry.commons?.length) await consider(await filesInfo(entry.commons), "fichier désigné");
    for (const q of entry.search || []) { if (chosen) break; await sleep(300); await consider(await searchInfo(q), `recherche « ${q} »`); }
    if (!chosen && entry.wiki) {
      const lead = await wikiLead(entry.wiki);
      if (lead) await consider(await filesInfo([lead]), "image principale Wikipédia");
    }
    if (!chosen) {
      console.error(`✗  ${image} (${entry.author}) : aucune image conforme`);
      report.push({ image, author: entry.author, missing: "aucune image conforme aux critères", tried });
      continue;
    }

    const buffer = await request(await downloadUrl(chosen), { json: false });
    const { lift, checks } = await processImage(buffer, image);
    const credit = {
      image,
      author: entry.author,
      title: chosen.title,
      artist: chosen.artist,
      license: chosen.license,
      public_domain: chosen.public_domain,
      url: chosen.url,
      source_file: chosen.file,
      brightness_lift: lift
    };
    credits.set(image, credit);
    report.push({ ...credit, tried, checks });
    const lowRes = Math.min(chosen.height, Math.round(chosen.width * 16 / 9)) < H ? `, définition ${chosen.width}×${chosen.height}` : "";
    console.log(`✓  ${image} ← ${chosen.file} (${chosen.license}${lowRes}${lift ? `, éclaircie ${Math.round(lift * 100)} %` : ""})`);
    await sleep(500);
  } catch (err) {
    console.error(`✗  ${image} : ${err.message}`);
    report.push({ image, author: entry.author, missing: err.message, tried });
  }
}

const ordered = images.filter((i) => credits.has(i)).map((i) => credits.get(i));
await fs.writeFile(creditsPath, JSON.stringify(ordered, null, 2) + "\n");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const card = (r) => r.missing
  ? `<figure class="missing"><div class="ph">Image manquante</div><figcaption><b>${esc(r.author)}</b><br>${esc(r.missing)}<br><code>${esc(r.image)}</code>${(r.tried || []).slice(0, 8).map((t) => `<br><small>${esc(t.file)} : ${esc(t.why)}</small>`).join("")}</figcaption></figure>`
  : `<figure class="${r.public_domain ? "" : "warn"}"><img src="../img/${esc(r.image.replace(/\.webp$/i, ".jpg"))}" alt=""><figcaption><b>${esc(r.author)}</b><br>${esc(r.title)}<br>${esc(r.artist)}<br><em>${esc(r.license)}</em>${r.brightness_lift ? `<br>Éclaircie : ${Math.round(r.brightness_lift * 100)} %` : ""}<br><a href="${esc(r.url)}" target="_blank" rel="noopener">Page Commons</a><br><code>${esc(r.image)}</code></figcaption></figure>`;
await fs.writeFile(path.join(ROOT, "tools/rapport-images.html"), `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport des illustrations</title>
<style>body{margin:24px;font:15px Georgia,serif;background:#524650;color:#1A1A1A}h1{color:#E6E1DA;font-weight:normal}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
figure{margin:0;background:#E6E1DA;border-radius:12px;overflow:hidden}figure.warn{outline:4px solid #B03A2E}figure.missing{outline:4px dashed #B03A2E}
img,.ph{display:block;width:100%;aspect-ratio:9/16;object-fit:cover}.ph{display:grid;place-items:center;background:#CFC8BE}
figcaption{padding:10px 12px;font-size:13px;line-height:1.4;overflow-wrap:anywhere}small{color:#555}</style>
<h1>Illustrations : ${ordered.length} / ${images.length}. Cadre rouge : licence non libre. Pointillés : image manquante.</h1>
<div class="grid">${report.map(card).join("\n")}</div></html>`);

console.log(`\n${ordered.length}/${images.length} illustrations conformes. Rapport : tools/rapport-images.html`);
