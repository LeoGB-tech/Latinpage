(() => {
  "use strict";

  /* ---------- Réglages ---------- */
  const DURATION = 280;                               // ms (cahier des charges : 250–300 ms)
  const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
  const SWIPE_RIGHT_IS_NEXT = true;                   // § 2.1 : swipe droit → citation suivante
  const CARD_MEDIA = "(min-width: 600px) and (min-height: 560px)";

  const $ = (s) => document.querySelector(s);
  const card = $("#card"), track = $("#track");
  const saveBtn = $("#saveBtn"), aboutBtn = $("#aboutBtn"), about = $("#about"), aboutClose = $("#aboutClose");
  const barFill = $("#barFill"), count = $("#count"), toast = $("#toast"), live = $("#live"), creditsList = $("#credits");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let quotes = [], credits = [];
  let index = 0, current = null, running = [];
  const total = () => quotes.length;
  const endIndex = () => quotes.length + 1;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stem = (file) => file.replace(/\.webp$/i, "");

  /* ---------- Construction des écrans ---------- */
  function picture(file, alt) {
    const s = esc(stem(file));
    return `<picture class="bg">
      <source type="image/webp" srcset="img/${s}-540.webp 540w, img/${s}.webp 1080w" sizes="${CARD_MEDIA} 440px, 100vw">
      <img src="img/${s}.jpg" alt="${esc(alt)}" decoding="async" draggable="false">
    </picture><div class="overlay"></div>`;
  }

  function build(i) {
    const s = document.createElement("article");
    s.className = "slide";

    if (i === 0) {
      const cover = quotes.find((q) => q.author === "Jules César") || quotes[0];
      s.classList.add("home");
      s.setAttribute("aria-label", "Accueil");
      s.innerHTML = `${picture(cover.image, "Portrait de Jules César")}
        <div class="body">
          <h1 class="title">Citations Latines</h1>
          <p class="lede">${total()} citations, de ${esc(quotes[0].author)} à ${esc(quotes[total() - 1].author)}.</p>
        </div>
        <p class="hint">Touchez la droite de l’écran pour commencer</p>
        <div class="meta"><p class="author">Jules César</p><p class="work">100 – 44 av. J.-C.</p></div>`;
    } else if (i === endIndex()) {
      s.classList.add("end");
      s.setAttribute("aria-label", "Fin");
      s.innerHTML = `<div class="body">
          <p class="end-text">Vous avez vu toutes les citations.</p>
          <button class="restart" type="button">Revenir au début ?</button>
        </div>`;
      s.querySelector(".restart").addEventListener("click", (e) => { e.stopPropagation(); go(0, 1); });
    } else {
      const q = quotes[i - 1];
      s.setAttribute("aria-label", `Citation ${i} sur ${total()}`);
      s.innerHTML = `${picture(q.image, "Portrait de " + q.author)}
        <div class="body">
          <p class="la${q.latin.length > 60 ? " long" : ""}" lang="la">${esc(q.latin)}</p>
          <p class="fr">${esc(q.french)}</p>
        </div>
        <div class="meta"><p class="author">${esc(q.author)}</p><p class="work">${esc(q.work)} – <span class="date">${esc(q.date)}</span></p></div>`;
    }

    const img = s.querySelector(".bg img");
    if (img) img.addEventListener("error", () => { s.querySelector(".bg")?.remove(); }, { once: true });
    return s;
  }

  function preload(i) {
    if (i < 1 || i > total()) return;
    const wide = card.clientWidth * (window.devicePixelRatio || 1) > 540;
    const im = new Image();
    im.src = `img/${stem(quotes[i - 1].image)}${wide ? "" : "-540"}.webp`;
  }

  function updateUI() {
    const isQuote = index > 0 && index <= total();
    card.classList.toggle("is-home", index === 0);
    card.classList.toggle("is-end", index === endIndex());
    barFill.style.transform = `scaleX(${Math.min(index, total()) / total()})`;
    count.textContent = isQuote ? `${index} / ${total()}` : index === endIndex() ? `${total()} / ${total()}` : "";
    saveBtn.hidden = !isQuote;
    if (isQuote) {
      const q = quotes[index - 1];
      live.textContent = `Citation ${index} sur ${total()}. ${q.latin} ${q.french} ${q.author}, ${q.work}, ${q.date}.`;
    } else {
      live.textContent = index === 0 ? "Accueil" : "Vous avez vu toutes les citations.";
    }
    preload(index + 1);
    preload(index - 1);
  }

  /* ---------- Transitions ---------- */
  function haptic() {
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* non pris en charge */ }
  }

  function stopRunning() {
    running.forEach((a) => a.finish());
    running = [];
  }

  // enterFrom : +1 le nouvel écran arrive par la droite, -1 par la gauche
  function go(target, enterFrom, fromDx = 0) {
    if (!current || target < 0 || target > endIndex()) return;
    stopRunning();

    const old = current;
    const next = build(target);
    track.appendChild(next);

    const width = card.clientWidth || 400;
    const shift = Math.round(width * 0.22);
    const startOpacity = parseFloat(old.style.opacity || "1");
    // Inertie légère : un geste déjà engagé raccourcit la fin de l’animation
    const duration = reduceMotion ? 1 : Math.round(DURATION * (1 - Math.min(Math.abs(fromDx) / width, 1) * 0.3));
    const options = { duration, easing: EASING, fill: "forwards" };

    old.style.transform = "";
    old.style.opacity = "";
    const outAnim = old.animate([
      { transform: `translateX(${fromDx}px)`, opacity: startOpacity },
      { transform: `translateX(${-enterFrom * shift + fromDx * 0.2}px)`, opacity: 0 }
    ], options);
    const inAnim = next.animate([
      { transform: `translateX(${enterFrom * shift}px)`, opacity: 0 },
      { transform: "translateX(0)", opacity: 1 }
    ], options);
    outAnim.onfinish = () => old.remove();
    inAnim.onfinish = () => inAnim.cancel();
    running = [outAnim, inAnim];

    current = next;
    index = target;
    updateUI();
    haptic();
  }

  function goNext(enterFrom = 1, fromDx = 0) {
    go(index === endIndex() ? 0 : index + 1, enterFrom, fromDx);
  }
  function goPrev(enterFrom = -1, fromDx = 0) {
    if (index === 0) return snapBack();
    go(index - 1, enterFrom, fromDx);
  }

  function snapBack() {
    if (!current) return;
    const from = current.style.transform || "translateX(0)";
    const opacity = parseFloat(current.style.opacity || "1");
    current.style.transform = "";
    current.style.opacity = "";
    current.animate([{ transform: from, opacity }, { transform: "translateX(0)", opacity: 1 }],
      { duration: reduceMotion ? 1 : DURATION, easing: EASING });
  }

  /* ---------- Tap : moitié gauche / moitié droite ---------- */
  let suppressClick = false;
  const onZone = (action) => (e) => {
    if (e.detail > 0) e.currentTarget.blur();              // pas d’anneau de focus après un tap
    if (!suppressClick) action();
  };
  $("#next").addEventListener("click", onZone(() => goNext()));
  $("#prev").addEventListener("click", onZone(() => goPrev()));

  /* ---------- Swipe horizontal ---------- */
  let down = false, dragging = false, startX = 0, startY = 0, startT = 0, dx = 0;

  card.addEventListener("pointerdown", (e) => {
    if (about.classList.contains("open") || e.target.closest(".icon-btn, .restart")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    down = true; dragging = false; dx = 0;
    startX = e.clientX; startY = e.clientY; startT = performance.now();
  });

  card.addEventListener("pointermove", (e) => {
    if (!down || !current) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      stopRunning();
      try { card.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
    }
    const wantsNext = SWIPE_RIGHT_IS_NEXT ? dx > 0 : dx < 0;
    const x = index === 0 && !wantsNext ? dx * 0.25 : dx;   // résistance sur l’accueil
    current.style.transform = `translateX(${x}px)`;
    current.style.opacity = String(1 - Math.min(Math.abs(x) / card.clientWidth, 1) * 0.4);
  });

  function endDrag() {
    if (!down) return;
    down = false;
    if (!dragging) return;
    dragging = false;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 350);

    const width = card.clientWidth;
    const velocity = Math.abs(dx) / Math.max(1, performance.now() - startT);
    if (Math.abs(dx) < width * 0.2 && velocity < 0.45) return snapBack();

    const wantsNext = SWIPE_RIGHT_IS_NEXT ? dx > 0 : dx < 0;
    const enterFrom = dx > 0 ? -1 : 1;                       // le nouvel écran suit le doigt
    const visual = parseFloat((current.style.transform.match(/-?[\d.]+/) || ["0"])[0]);
    if (wantsNext) goNext(enterFrom, visual);
    else if (index === 0) snapBack();
    else goPrev(enterFrom, visual);
  }
  card.addEventListener("pointerup", endDrag);
  card.addEventListener("pointercancel", () => { if (dragging) snapBack(); down = false; dragging = false; });

  /* ---------- Clavier ---------- */
  document.addEventListener("keydown", (e) => {
    if (about.classList.contains("open")) {
      if (e.key === "Escape") closeAbout();
      return;
    }
    if (e.key === "ArrowRight") { e.preventDefault(); goNext(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); goPrev(); }
  });

  /* ---------- Toast ---------- */
  let toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1600);
  }

  /* ---------- Enregistrer la citation en image (1080 × 1920) ---------- */
  const loadImage = (src) => new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });

  function wrap(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  async function renderQuote(q) {
    const W = 1080, H = 1920, S = W / 390;                  // reprend la carte mobile de référence (390 px)
    await Promise.all([
      document.fonts.load('700 80px "Cormorant Garamond"'),
      document.fonts.load('400 40px "EB Garamond"'),
      document.fonts.load('italic 400 40px "EB Garamond"'),
      document.fonts.load('700 40px "EB Garamond"')
    ]).catch(() => {});
    await document.fonts.ready;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Fond beige + illustration + overlay
    ctx.fillStyle = "#E6E1DA";
    ctx.fillRect(0, 0, W, H);
    let img = null;
    try { img = await loadImage(`img/${stem(q.image)}.webp`); }
    catch (e) { try { img = await loadImage(`img/${stem(q.image)}.jpg`); } catch (err) { img = null; } }
    if (img) {
      const r = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    const overlay = ctx.createLinearGradient(0, H, 0, 0);
    overlay.addColorStop(0, "rgba(230,225,218,0.9)");
    overlay.addColorStop(1, "rgba(230,225,218,0.4)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, W, H);

    // En-tête « Citations Latines »
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(26,26,26,0.7)";
    ctx.font = `400 ${13 * S}px "EB Garamond", Georgia, serif`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${(13 * S * 0.07).toFixed(1)}px`;
    ctx.fillText("Citations Latines", W / 2, 32 * S);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    // Latin (gras) et français (italique), centrés verticalement dans la zone principale
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const padX = 28 * S, maxW = W - padX * 2;
    const long = q.latin.length > 60;
    const laSize = (long ? 28 : 31.2) * S, laLH = laSize * (long ? 1.25 : 1.28);
    const frSize = 20.67 * S, frLH = frSize * 1.4, gap = frSize * 0.85;
    ctx.font = `700 ${laSize}px "Cormorant Garamond", Georgia, serif`;
    const laLines = wrap(ctx, q.latin, maxW);
    ctx.font = `italic 400 ${frSize}px "EB Garamond", Georgia, serif`;
    const frLines = wrap(ctx, q.french, maxW);

    const top = 64 * S, bottom = H - 150 * S;
    const blockH = laLines.length * laLH + gap + frLines.length * frLH;
    let y = top + (bottom - top - blockH) / 2;

    ctx.fillStyle = "#1A1A1A";
    ctx.font = `700 ${laSize}px "Cormorant Garamond", Georgia, serif`;
    for (const line of laLines) { ctx.fillText(line, padX, y + laLH * 0.5 + laSize * 0.34); y += laLH; }
    y += gap;
    ctx.fillStyle = "#2A2A2A";
    ctx.font = `italic 400 ${frSize}px "EB Garamond", Georgia, serif`;
    for (const line of frLines) { ctx.fillText(line, padX, y + frLH * 0.5 + frSize * 0.34); y += frLH; }

    // Auteur, œuvre et date en bas à droite
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(26,26,26,0.85)";
    const right = W - 20 * S;
    const workSize = 14 * S, workLH = workSize * 1.3;
    ctx.font = `400 ${workSize}px "EB Garamond", Georgia, serif`;
    const workLines = wrap(ctx, `${q.work} – ${q.date.replace(/ /g, "\u00A0")}`, W * 0.66);
    let by = H - 50 * S - workLH * 0.3;
    for (let k = workLines.length - 1; k >= 0; k--) { ctx.fillText(workLines[k], right, by); by -= workLH; }
    ctx.font = `700 ${17 * S}px "EB Garamond", Georgia, serif`;
    ctx.fillText(q.author, right, by - 3 * S);

    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast("Image enregistrée");
  }

  let saving = false;
  saveBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (saving || index < 1 || index > total()) return;
    saving = true;
    const q = quotes[index - 1];
    try {
      const blob = await renderQuote(q);
      const name = `citation-latine-${String(q.id).padStart(2, "0")}.png`;
      const file = new File([blob], name, { type: "image/png" });
      const mobile = !matchMedia("(pointer: fine)").matches;
      if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "Citations Latines" });
        } catch (err) {
          if (err && err.name !== "AbortError") download(blob, name);
        }
      } else {
        download(blob, name);
      }
    } catch (err) {
      showToast("Impossible de créer l’image");
    } finally {
      saving = false;
    }
  });

  /* ---------- À propos ---------- */
  function renderCredits() {
    if (!credits.length) {
      creditsList.innerHTML = "<li>Les crédits de chaque œuvre apparaîtront ici après l’import des illustrations.</li>";
      return;
    }
    creditsList.innerHTML = credits.map((c) => `<li><b>${esc(c.author)}</b><br>
      ${esc(c.title)}${c.artist ? ` — ${esc(c.artist)}` : ""}<br>
      ${esc(c.license)}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener">Wikimedia Commons</a>` : ""}</li>`).join("");
  }

  let lastFocus = null;
  function openAbout() {
    renderCredits();
    lastFocus = document.activeElement;
    about.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => about.classList.add("open")));
    aboutBtn.setAttribute("aria-expanded", "true");
    setTimeout(() => aboutClose.focus({ preventScroll: true }), 50);
  }
  function closeAbout() {
    about.classList.remove("open");
    aboutBtn.setAttribute("aria-expanded", "false");
    setTimeout(() => { about.hidden = true; about.scrollTop = 0; }, 320);
    (lastFocus || aboutBtn).focus({ preventScroll: true });
  }
  aboutBtn.addEventListener("click", (e) => { e.stopPropagation(); openAbout(); });
  aboutClose.addEventListener("click", closeAbout);

  /* ---------- Démarrage ---------- */
  async function init() {
    const [q, c] = await Promise.all([
      fetch("data/citations.json").then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch("data/credits.json").then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ]);
    quotes = q;
    credits = Array.isArray(c) ? c : [];
    current = build(0);
    track.appendChild(current);
    updateUI();
  }

  init().catch(() => {
    track.innerHTML = '<article class="slide end"><div class="body"><p class="end-text">Les citations n’ont pas pu être chargées.</p></div></article>';
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
