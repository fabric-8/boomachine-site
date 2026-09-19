/* ==========================================================================
   Boo Machine — slide to join   (v2j: the fill of the slot, three ways)

   The pointer / capture / drag logic, the keyboard support and the TestFlight
   URL are v2e-b's, carried through v2f–v2i unchanged (the block below the
   header, down to the `focus` listener, is byte-identical to v2i). What
   changed is what the drag DRIVES.

   v2i filled the uncovered track with magma. The client:

     "maybe not magma but more like an intensely lit red-ish hot light with
      great attention to detail. And maybe 2 more variants to your liking.
      I want a cool effect, ok to stay a bit abstract, with nice details and
      that matches the scene."

   So the uncovered region — from the left cap to the knob's left edge — is
   now drawn by ONE OF THREE RENDERERS, chosen with `?fill=light|A|B`
   (default `light`) or `booSlide.fill("A")` at run time:

     light  the slot is a cavity flooded with red-hot LIGHT from a source
            hidden behind the knob — the inside of a kiln seen through a slot.
            A pink-white core hugging the knob's round end, an inverse-square
            fall-off to saturated red and deep red, thin light shafts fanning
            left through drifting haze, sharp dust catching the light near the
            knob, a brushed-metal highlight streak along the floor, the
            scorched track surface barely lit at the cool end;
     A      "signal bars": a bank of 3 px phosphor segments at a 4 px pitch
            inside a glass tube — pink-white behind the knob, red, dim cherry;
            a slow per-segment flicker, a few dead segments, a bloom, a
            scanline raster, the glass highlight along the top;
     B      "veins": glowing red veins grow out of the knob's edge and are
            left across the dark track as it travels — a few mains with short
            branches, thin bright lines in a soft red halo, brightest at the
            young end by the knob, dimming to dark red as they age, a heartbeat
            pulse running down them; on release they burn out from the far end.

   All three SHARE everything else:
     * the canvas is the track's own box and every frame is drawn inside
       ctx.clip() of the inner rounded rect inset 2 px — nothing reaches the
       rails; the knob's own rounded body is erased from the fill and the seam
       beside it fades to nothing at the knob's centre line;
     * heat / brightness is a function of DISTANCE FROM THE KNOB'S LEFT EDGE,
       hottest right behind it;
     * the amplitude (rest / hover / drag / release / done / flare) and the
       release cooling window are v2i's, on the fill's own clock;
     * `--rl-d` room-light coupling 1 -> 1.7 with the travel;
     * `--kg` on .unlock-wrap: the fill's brightness at the knob, 0..1, which
       slide.css turns into a red rim light on the knob's left edge;
     * reduced motion: ONE seeded static frame per fill, no rAF;
     * the `hell` data-fx token switches the whole thing off.

   QA hooks (unchanged names): ?slide=0.4|hover|done|flare,
   window.booSlide.set(p) / .done() / .sweep(on, pxPerSec) / .timescale(k) /
   .release() / .reset() / .fill(name) / .flame (stats)
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  var track = doc.getElementById("unlock");
  var knob = doc.getElementById("knob");
  var wrap = track && track.closest(".unlock-wrap");
  if (!track || !knob || !wrap) return;

  var root = doc.documentElement;
  var label = track.querySelector(".unlock-label");
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var DPR = Math.min(global.devicePixelRatio || 1, 3);

  var dragging = false, startX = 0, x = 0, max = 0, moved = 0;
  var frozen = false;                 /* ?slide=… : ignore pointer + hover   */
  var progress = 0;

  function measure() { max = track.clientWidth - knob.offsetWidth - 10; }
  measure();
  global.addEventListener("resize", function () { measure(); publish(x); });

  /* ---------- what the drag drives -------------------------------------- */
  function publish(v) {
    var p = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
    progress = p;
    var rev = v + knob.offsetWidth + 5;
    wrap.style.setProperty("--rev", rev.toFixed(1) + "px");
    wrap.style.setProperty("--revp", p.toFixed(4));
    /* v2i: the room warms with the magma — ~1.6 at 85 %, 1.7 at the end */
    root.style.setProperty("--rl-d", (1 + 0.7 * p).toFixed(3));
    wrap.classList.toggle("is-open", p > 0.004);
    if (reduce.matches) drawStatic(); else ignite();
  }
  function unpublish() {                      /* hand it back to the CSS     */
    wrap.style.removeProperty("--rev");
    wrap.style.removeProperty("--revp");
    root.style.removeProperty("--rl-d");
    progress = 0;
    wrap.classList.remove("is-open");
    if (reduce.matches) drawStatic();
  }

  function place(v) {
    knob.style.transform = "translateX(" + v + "px)"; kxDirty = true;
    if (label) label.style.opacity = String(Math.max(0, 1 - v / (max * 0.55)));
    publish(v);
  }
  function rest() {
    x = 0;
    knob.style.transform = ""; kxDirty = true;
    if (label) label.style.opacity = "";
    /* the magma cools for ~600 ms before anything (a hover, the focus) may
       light the cap's pool again */
    if (amp > 0.05) coolUntil = simT + 0.65;   /* on the magma's own clock */
    unpublish();
  }

  /* ---------- completion ------------------------------------------------ */
  function finish(navigate) {
    track.classList.add("done");
    measure(); x = max; place(max);
    track.classList.remove("is-flare"); void track.offsetWidth;
    track.classList.add("is-flare");
    root.style.setProperty("--rl-d", "1.7");
    burstUntil = now() + 300;                 /* the melt goes white with it */
    coolUntil = 0;
    if (reduce.matches) drawStatic(); else ignite();
    if (navigate === false) return;
    /* the flare is 300 ms; leave a beat of it on screen, then go */
    global.setTimeout(function () { global.location.href = knob.href; }, 260);
  }

  /* ---------- the drag (v2e-b's, unchanged) ----------------------------- */
  function release() {
    knob.classList.remove("dragging");
    wrap.classList.remove("is-drag");
    if (x > max * 0.72) { finish(true); }
    else { rest(); }                          /* the melt cools: ~600 ms     */
  }

  /* an <a> is natively draggable: without this, starting a mouse drag hands
     the gesture to HTML drag-and-drop, which fires pointercancel and kills
     the slide */
  knob.addEventListener("dragstart", function (e) { e.preventDefault(); });
  knob.addEventListener("pointerdown", function (e) {
    if (frozen) return;
    if (e.button && e.button !== 0) return;
    dragging = true; moved = 0; startX = e.clientX; measure();
    knob.classList.add("dragging");
    wrap.classList.add("is-drag");
    knob.setPointerCapture(e.pointerId);
    kxDirty = true; ignite();
  });
  knob.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var d = e.clientX - startX; moved = Math.max(moved, Math.abs(d));
    x = Math.max(0, Math.min(max, d)); place(x);
    if (moved > 4) e.preventDefault();
  });
  knob.addEventListener("pointerup", function (e) {
    if (!dragging) return; dragging = false;
    if (moved > 6) { e.preventDefault(); release(); }
    else { wrap.classList.remove("is-drag"); knob.classList.remove("dragging"); rest(); }
  });
  knob.addEventListener("pointercancel", function () {
    if (dragging) { dragging = false; x = 0; release(); }
  });
  knob.addEventListener("click", function (e) {
    if (moved > 6) { e.preventDefault(); return; }
    if (frozen) { e.preventDefault(); return; }
    /* a plain click still counts as "open it": flare, then follow the href */
    e.preventDefault(); finish(true);
  });
  knob.addEventListener("keydown", function (e) {
    if (frozen) return;
    if (e.key === "ArrowRight") {
      measure(); x = Math.min(max, x + max / 4); place(x);
      if (x >= max) finish(true);
      e.preventDefault();
    }
    if (e.key === "ArrowLeft") { x = Math.max(0, x - max / 4); place(x); e.preventDefault(); }
  });
  knob.addEventListener("blur", function () {
    hasFocus = false;
    if (!frozen && !track.classList.contains("done")) rest();
  });
  knob.addEventListener("focus", function () { hasFocus = true; kxDirty = true; ignite(); });


  /* ======================================================================
     THE FILL — the shared engine
     ====================================================================== */
  var cv = track.querySelector(".hell-flame");
  var ctx = cv ? cv.getContext("2d") : null;

  var hovering = false, hasFocus = false, qaAwake = false, qaDrag = false;
  var amp = 0, burstUntil = 0;
  var raf = 0, last = 0, lastKx = null, vel = 0;

  /* canvas geometry, in css px of the canvas's own box, which is the
     track's own box: nothing is drawn outside it */
  var CW = 0, CH = 0, TX = 0, TY = 0, TW = 0, TH = 0, INSET = 2;
  var simT = 0, tscale = 1;
  var meanHeat = 0, litCols = 0, fireMs = 0, fireMax = 0;
  var coolShift = 0, cooling = false, coolUntil = 0;   /* release: the fill dies from the far end */
  var knobGlow = -1;                                     /* --kg, last published */

  var R = null, FILLS = {}, fillName = "light";

  function now() { return performance.now(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sstep(a, b, v) { v = (v - a) / (b - a); v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }

  /* --- value noise, 64 x 64, bilinear, wrapping; the table and the phase
         are random per page load, so no two loads look alike --------------- */
  var NT = new Float32Array(64 * 64);
  var rnd = Math.random;                    /* swapped for a seeded one in drawStatic */
  (function () { for (var i = 0; i < NT.length; i++) NT[i] = Math.random(); })();
  var OX = Math.random() * 64, OY = Math.random() * 64;
  function vn(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    xi &= 63; yi &= 63;
    var xj = (xi + 1) & 63, yj = (yi + 1) & 63;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var r0 = yi << 6, r1 = yj << 6;
    var a = NT[r0 + xi], b = NT[r0 + xj], c = NT[r1 + xi], d = NT[r1 + xj];
    var t = a + (b - a) * fx, u = c + (d - c) * fx;
    return t + (u - t) * fy;
  }
  function seededRnd(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --- palettes: 256 entries over v 0..1.3, plus the same as css strings --- */
  function makePal(stops) {
    var out = new Uint8ClampedArray(256 * 3), css = new Array(256);
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * 1.3, j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      var a = stops[j], b = stops[j + 1];
      var k = (t - a[0]) / (b[0] - a[0] || 1); if (k > 1) k = 1;
      out[i * 3] = a[1] + (b[1] - a[1]) * k;
      out[i * 3 + 1] = a[2] + (b[2] - a[2]) * k;
      out[i * 3 + 2] = a[3] + (b[3] - a[3]) * k;
      css[i] = "rgb(" + out[i * 3] + "," + out[i * 3 + 1] + "," + out[i * 3 + 2] + ")";
    }
    return { rgb: out, css: css };
  }
  function pidx(v) { return ((v < 0 ? 0 : v > 1.3 ? 1.3 : v) / 1.3 * 255) | 0; }
  /* a distance -> heat table over 0..512 css px from a few points */
  function makeCurve(pts) {
    var out = new Float32Array(513), j = 0;
    for (var d = 0; d <= 512; d++) {
      while (j < pts.length - 2 && d > pts[j + 1][0]) j++;
      var a = pts[j], b = pts[j + 1];
      out[d] = a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
    }
    return function (d) { if (d < 0) d = 0; if (d > 511) return out[512]; var i = d | 0; return out[i] + (out[i + 1] - out[i]) * (d - i); };
  }

  function roundRect(c, x0, y0, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    if (c.roundRect) { c.beginPath(); c.roundRect(x0, y0, w, h, r); return; }
    c.beginPath();
    c.moveTo(x0 + r, y0); c.lineTo(x0 + w - r, y0);
    c.arcTo(x0 + w, y0, x0 + w, y0 + r, r); c.lineTo(x0 + w, y0 + h - r);
    c.arcTo(x0 + w, y0 + h, x0 + w - r, y0 + h, r); c.lineTo(x0 + r, y0 + h);
    c.arcTo(x0, y0 + h, x0, y0 + h - r, r); c.lineTo(x0, y0 + r);
    c.arcTo(x0, y0, x0 + r, y0, r); c.closePath();
  }
  /* the clip: the track's inner rounded rect, inset 2 px. Every frame's
     drawing happens inside it. Nothing can reach the rails. */
  function clipTrack(c) {
    roundRect(c, TX + INSET, TY + INSET, TW - 2 * INSET, TH - 2 * INSET, (TH - 2 * INSET) / 2);
    c.clip();
  }
  /* the knob: its rounded body (+1 px) is erased from the fill, and the seam
     beside it — what lies right of its left edge, above and below it — fades
     linearly to nothing at its centre line, so the seam has no hard end.
     Shared by the three fills: they simply draw up to the knob's centre. */
  function eraseKnob(k) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    roundRect(ctx, k.x - 1, k.y - k.h / 2 - 1, k.w + 2, k.h + 2, k.h / 2 + 1); ctx.fill();
    var KR = k.h / 2;
    var g = ctx.createLinearGradient(k.x, 0, k.x + KR, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g; ctx.fillRect(k.x, TY, KR + 0.5, TH);
    ctx.fillStyle = "#000"; ctx.fillRect(k.x + KR, TY, TW, TH);
    ctx.globalCompositeOperation = "source-over";
  }
  /* --kg: the fill's light on the knob's own edge (slide.css: a red rim on
     its left side). Published only when it moves by more than 1.5 %. */
  function setKnobGlow(v) {
    v = clamp01(v);
    if (Math.abs(v - knobGlow) < 0.015 && !(v === 0 && knobGlow !== 0)) return;
    knobGlow = v;
    wrap.style.setProperty("--kg", v.toFixed(3));
  }

  function sizeFlame() {
    if (!cv) return;
    var r = cv.getBoundingClientRect(), t = track.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    CW = r.width; CH = r.height;
    TX = t.left - r.left; TY = t.top - r.top; TW = t.width; TH = t.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (R) R.resize();
    kxDirty = true;
  }

  function hellOn() {
    var hero = doc.querySelector(".hero");
    return !hero || (" " + (hero.getAttribute("data-fx") || "") + " ").indexOf(" hell ") >= 0;
  }
  function awake() {
    return dragging || hovering || hasFocus || qaAwake ||
      progress > 0.004 || now() < burstUntil;
  }
  function target() {
    if (now() < burstUntil) return 1.3;
    if (dragging || qaDrag || (frozen && progress > 0.004)) return 1;
    if (simT < coolUntil) return 0;           /* just released: cooling      */
    if (hovering || hasFocus) return Math.min(1, 0.85 + progress * 1.2);
    return awake() ? 0.5 : 0;
  }

  /* --- the knob's left edge, in canvas px (v2h's cache, unchanged) ------ */
  var kxCache = null, kxDirty = true, knobMoving = false;
  function knobX() {
    if (kxCache && (dragging || qaDrag) && knob.classList.contains("dragging")) {
      kxCache.x = kxCache.base + x; kxDirty = false;
      return kxCache;
    }
    if (kxCache && !kxDirty && !knobMoving) return kxCache;
    var k = knob.getBoundingClientRect(), r = cv.getBoundingClientRect();
    var inl = knob.style.transform ? parseFloat(knob.style.transform.slice(11)) || 0 : 0;
    kxCache = { x: k.left - r.left, y: k.top - r.top + k.height / 2, w: k.width, h: k.height, base: k.left - r.left - inl };
    kxDirty = false;
    return kxCache;
  }
  knob.addEventListener("transitionrun", function (e) { if (e.propertyName === "transform") knobMoving = true; });
  function knobSettled(e) { if (e.propertyName === "transform") { knobMoving = false; kxDirty = true; } }
  knob.addEventListener("transitionend", knobSettled);
  knob.addEventListener("transitioncancel", knobSettled);

  /* --- the frame ----------------------------------------------------------- */
  var S = { k: null, kxT: 0, kyT: 0, KR: 0, reach: 0, inten: 0, burst: false, done: false, p: 0, t: 0,
            cooling: false, shift: 0, speed: 0, dt: 0, breath: 1 };
  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (!ctx) return;
    if (!CW) sizeFlame();
    if (!last) last = ts;
    var dt = Math.min(0.064, (ts - last) / 1000) * tscale; last = ts;
    if (dt <= 0) return;

    var t0 = performance.now();
    var k = knobX();
    var kx = k.x;                                   /* the knob's LEFT edge  */
    if (lastKx === null) lastKx = kx;
    var inst = (kx - lastKx) / dt;
    vel += (inst - vel) * Math.min(1, dt * 14);
    lastKx = kx;
    var p = progress;
    var burst = now() < burstUntil;

    /* strikes in ~80 ms on a drag (~150 ms on hover), dies in ~600 ms */
    var tg = target();
    amp += (tg - amp) * Math.min(1, dt * (tg > amp ? (dragging || qaDrag ? 24 : 14) : 5));
    if (amp < 0.02) amp = target() > 0 ? amp : 0;

    /* release below the threshold: the fill dies from the far end while
       amp dies — the two together are the ~600 ms to black */
    if (simT < coolUntil && !dragging && !qaDrag && !burst) { cooling = true; coolShift += 520 * dt; }
    else { cooling = false; coolShift = 0; }

    var breath = (hovering || hasFocus) && !dragging && !qaDrag && p < 0.05
      ? 0.86 + 0.14 * Math.sin(ts / 420) : 1;
    var inten = amp * breath;
    if (burst) inten = 1.3;
    simT += dt;

    S.k = k; S.kxT = kx - TX; S.kyT = k.y - TY; S.KR = k.h / 2; S.reach = S.kxT + S.KR;
    S.inten = inten; S.burst = burst; S.done = track.classList.contains("done");
    S.p = p; S.t = simT; S.cooling = cooling; S.shift = coolShift; S.speed = Math.abs(vel); S.dt = dt; S.breath = breath;

    R.step(S);
    draw();

    var cost = performance.now() - t0;
    fireMs += (cost - fireMs) * 0.1; if (cost > fireMax) fireMax = cost;

    if (!awake() && amp < 0.02 && !R.busy()) stop();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (S.inten < 0.015 && !S.burst) { setKnobGlow(0); return; }
    ctx.save();
    clipTrack(ctx);
    var lit = R.draw(ctx, S);                     /* how many css px are lit */
    eraseKnob(S.k);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
    litCols = lit;
    meanHeat = R.heat(0) * Math.min(1, S.inten);
    /* the knob's rim: the fill's brightness right behind the knob, gated by
       how much of the slot is open (a closed knob has nothing to reflect) */
    setKnobGlow(Math.min(1, S.inten) * clamp01((S.kxT - INSET - 2) / 9) * (S.cooling ? 0.5 : 1));
  }

  function ignite() {
    if (!ctx || reduce.matches || !hellOn()) return;
    if (!CW) sizeFlame();
    if (dragging && amp < 0.5) amp = 0.5;
    if (!raf) { last = 0; lastKx = null; raf = global.requestAnimationFrame(frame); }
  }
  function stop() {
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    if (R) R.reset();
    amp = 0; vel = 0; lastKx = null;
    meanHeat = 0; litCols = 0; coolShift = 0; cooling = false;
    if (ctx && CW) ctx.clearRect(0, 0, CW, CH);
    setKnobGlow(0);
  }

  /* --- reduced motion: ONE seeded frame of the fill in the uncovered region,
         redrawn only when the knob's position is published; no rAF ------- */
  function drawStatic() {
    if (!ctx || !hellOn()) return;
    if (!CW) sizeFlame();
    if (!CW) return;
    var k = knobX();
    var kxT = k.x - TX;
    ctx.clearRect(0, 0, CW, CH);
    var done = track.classList.contains("done");
    if (kxT < INSET + 6 && !done) { setKnobGlow(0); return; }
    var keepT = NT.slice(), keepOX = OX, keepOY = OY;
    rnd = seededRnd(0x9E3779B9);
    for (var i = 0; i < NT.length; i++) NT[i] = rnd();
    OX = 12.5; OY = 31.25;
    S.k = k; S.kxT = kxT; S.kyT = k.y - TY; S.KR = k.h / 2; S.reach = kxT + S.KR;
    S.inten = done ? 1.0 : 0.9 + 0.1 * progress; S.burst = false; S.done = done; S.p = progress;
    S.t = 4.0; S.cooling = false; S.shift = 0; S.speed = 0; S.dt = 0; S.breath = 1;
    R.staticFrame(S);
    ctx.save(); clipTrack(ctx);
    R.draw(ctx, S);
    eraseKnob(k);
    ctx.restore();
    R.reset();
    NT.set(keepT); OX = keepOX; OY = keepOY; rnd = Math.random;
    setKnobGlow(clamp01((kxT - INSET - 2) / 9));
  }

  /* --- choosing a fill ------------------------------------------------------ */
  function setFill(name) {
    if (!FILLS[name]) name = "light";
    var was = raf;
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    if (R) R.reset();
    fillName = name; R = FILLS[name];
    wrap.setAttribute("data-fill", name);
    if (CW) R.resize();
    if (ctx && CW) ctx.clearRect(0, 0, CW, CH);
    if (reduce.matches) drawStatic();
    else if (was || awake()) { last = 0; lastKx = null; raf = global.requestAnimationFrame(frame); }
    return name;
  }

  /* ======================================================================
     FILL `light` — the intensely lit red-hot light
     The slot is a cavity flooded with light from a source hidden behind the
     knob. Five layers, all inside the clip, all left of the knob's centre:
       1  the FIELD (ImageData at 2 px cells, 24 Hz): heat by distance with an
          inverse-square fall-off (heatL), scattered by a drifting three-octave
          haze, the cavity's walls a little darker than its middle, and the
          floor streak — the source reflected in the brushed floor;
       2  the BRUSHED METAL: a tinted noise made once at device resolution,
          added over the lit region — invisible in the saturated core, fine
          red streaks where the light is weak (the scorched track itself);
       3  the SHAFTS: eleven thin rays from a point behind the knob's round end,
          each a slim triangle with a 5-stop gradient that reads the haze
          along its length, the angles wandering by a few degrees;
       4  the DUST: ≤ 14 sharp motes within ~90 px of the knob, drifting;
       5  the CORE: a radial gradient off the knob's semicircle, pink-white
          with a whisper of amber, out to ~30 px.
     ====================================================================== */
  FILLS.light = (function () {
    var CELL = 2, FW = 0, FH = 0, CX = 0, CY = 0, img = null, fCv = null, fCtx = null;
    var HZ = null, nT = -1, NOISE_DT = 1 / 24, vp = null, st = null;
    var metal = null, mW = 0, mH = 0;
    var rays = [], dust = [], dustAcc = 0;
    var PAL = makePal([
      [0.00, 0, 0, 0], [0.10, 30, 0, 0], [0.24, 112, 0, 0], [0.42, 200, 0, 0],
      [0.58, 249, 0, 0], [0.72, 255, 38, 0], [0.84, 255, 112, 72], [0.95, 255, 186, 152],
      [1.05, 255, 228, 218], [1.30, 255, 247, 245]
    ]);
    /* inverse-square-ish: 1 at the knob, ~.68 at 24 px, ~.48 at 60, ~.27 at
       120, ~.16 at 200, ~.10 at 300 (a faint tail so the far end is deep red,
       not black) */
    var HT = new Float32Array(513);
    for (var d0 = 0; d0 <= 512; d0++) HT[d0] = 0.93 / Math.pow(1 + (d0 / 34) * (d0 / 34), 0.55) + 0.07 * Math.exp(-d0 / 240);
    function heatL(d) { if (d < 0) d = 0; if (d > 511) return HT[512]; var i = d | 0; return HT[i] + (HT[i + 1] - HT[i]) * (d - i); }
    var colH = new Float32Array(1024);

    function resize() {
      FW = Math.round((TW - 2 * INSET) / CELL); CX = (TW - 2 * INSET) / FW;
      FH = Math.round((TH - 2 * INSET) / CX);   CY = (TH - 2 * INSET) / FH;
      HZ = new Float32Array(FW * FH); vp = new Float32Array(FH); st = new Float32Array(FH);
      for (var y = 0; y < FH; y++) {
        var yf = (y + 0.5) / FH;
        vp[y] = 0.72 + 0.28 * Math.sin(yf * Math.PI);            /* the walls darker than the middle */
        var dy = (yf - 0.72) * FH / 2.2; st[y] = Math.exp(-dy * dy);   /* the floor streak */
      }
      if (!fCv) { fCv = doc.createElement("canvas"); fCtx = fCv.getContext("2d"); }
      fCv.width = FW; fCv.height = FH; img = fCtx.createImageData(FW, FH);
      nT = -1;
      makeMetal();
      if (!rays.length) makeRays();
    }
    /* the brushed metal: horizontal streaks (a 1-D noise per device row with
       its own offset) plus a fine grain, tinted red, made once */
    function makeMetal() {
      mW = Math.round((TW - 2 * INSET) * DPR); mH = Math.round((TH - 2 * INSET) * DPR);
      if (!metal) metal = doc.createElement("canvas");
      metal.width = mW; metal.height = mH;
      var mc = metal.getContext("2d"), id = mc.createImageData(mW, mH), d = id.data, i = 0;
      var r = rnd;
      for (var y = 0; y < mH; y++) {
        var off = r() * 64, sc = 0.06 + r() * 0.05, base = 0.7 + 0.3 * r();
        for (var x = 0; x < mW; x++, i += 4) {
          var v = vn(x * sc + off, y * 0.9 + 3.7) * 0.7 + vn(x * 0.31 + off + 20, y * 0.31) * 0.3;
          v = (v - 0.5) * 2; if (v < 0) v = 0;
          v = v * v * base;
          var g = r() * 0.35;                                  /* grain */
          d[i] = 255; d[i + 1] = 40 + 60 * v; d[i + 2] = 20 + 30 * v; d[i + 3] = (v * 0.55 + g * 0.35) * 255;
        }
      }
      mc.putImageData(id, 0, 0);
    }
    function makeRays() {
      rays.length = 0;
      var n = 11;
      for (var i = 0; i < n; i++) {
        var a = -0.26 + 0.52 * (i + 0.5) / n + (rnd() - 0.5) * 0.05;   /* ±15° */
        rays.push({ a: a, len: 190 + rnd() * 150, w: 0.4 + rnd() * 0.4, amp: 0.6 + rnd() * 0.4,
                    p1: rnd() * 6.283, p2: rnd() * 6.283, p3: rnd() * 40 });
      }
    }
    function reset() { dust.length = 0; dustAcc = 0; nT = -1; }
    function busy() { return dust.length > 0; }

    /* the haze field, in TRACK coordinates so it stays put while the knob
       moves through it */
    function stepHaze(t) {
      var i = 0;
      for (var y = 0; y < FH; y++) {
        var yc = INSET + (y + 0.5) * CY;
        for (var x = 0; x < FW; x++, i++) {
          var xc = INSET + (x + 0.5) * CX;
          HZ[i] = hazeAt(xc, yc, t);
        }
      }
    }
    /* the haze: three octaves, stretched along the slot (smoke drifting down
       it), each drifting at its own speed; the same function feeds the
       field and the shafts. Stretched x1.6 about the mean so it has contrast */
    function hazeAt(xT, yT, t) {
      var v = vn(xT * 0.012 + OX + t * 0.045, yT * 0.045 + OY + t * 0.02) * 0.50 +
              vn(xT * 0.034 + OX + 31 - t * 0.08, yT * 0.075 + OY + 7 + t * 0.03) * 0.32 +
              vn(xT * 0.09 + OX + 53 - t * 0.14, yT * 0.14 + OY + 19) * 0.18;
      v = (v - 0.5) * 1.6 + 0.5;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }

    function step(S) {
      if (nT < 0 || S.t - nT >= NOISE_DT) { nT = S.t; stepHaze(S.t); }
      var dt = S.dt, i, q;
      /* the dust: sharp motes in the light near the knob */
      if (S.inten > 0.2 && S.kxT > INSET + 10 && !S.cooling) {
        dustAcc += (4 + 5 * Math.min(1, S.p * 2)) * dt;
        var n = dustAcc | 0; dustAcc -= n;
        for (i = 0; i < n && dust.length < 14; i++) {
          dust.push({ x: S.kxT - 4 - rnd() * Math.min(90, S.kxT - INSET - 6), y: INSET + 3 + rnd() * (TH - 2 * INSET - 6),
                      vx: (rnd() - 0.5) * 5, vy: (rnd() - 0.5) * 3, life: 0, ttl: 1.4 + rnd() * 2.4,
                      r: 0.45 + rnd() * 0.5, ph: rnd() * 6.283, w: 3 + rnd() * 5 });
        }
      }
      for (i = dust.length - 1; i >= 0; i--) {
        q = dust[i]; q.life += dt;
        if (q.life >= q.ttl || q.x > S.kxT + 1 || q.x < INSET + 2 || q.y < INSET + 2 || q.y > TH - INSET - 2) { dust.splice(i, 1); continue; }
        q.x += (q.vx + Math.sin(q.life * 1.7 + q.ph) * 1.5) * dt;
        q.y += (q.vy + Math.cos(q.life * 1.3 + q.ph) * 1.2) * dt;
      }
    }
    function staticFrame(S) { makeRays(); makeMetal(); nT = -1; stepHaze(S.t); nT = S.t; dust.length = 0; }

    function paint(S) {
      var W = FW, H = FH, x, y, i = 0, d = img.data, cols = 0;
      var inten = S.inten, done = S.done, burst = S.burst;
      for (x = 0; x < W; x++) {
        var xc = INSET + (x + 0.5) * CX;
        if (xc < S.reach + CX) cols = x + 1;
        var dd = S.kxT - xc + S.shift;
        var h = heatL(dd);
        if (done && h < 0.5) h = 0.5;
        /* the core: the last ~10 px before the knob go pink-white */
        if (dd < 40) h *= 1 + 0.38 * Math.exp(-(dd < 0 ? 0 : dd) / 9);
        colH[x] = h * inten;
      }
      for (y = 0; y < H; y++) {
        var v0 = vp[y], s0 = st[y];
        i = y * W;
        for (x = 0; x < W; x++, i++) {
          var o = i * 4;
          if (x >= cols) { d[o + 3] = 0; continue; }
          var h = colH[x], hz = HZ[i];
          /* the light through the haze: brighter where the haze is denser
             (that is what makes a shaft visible), the walls darker */
          var v = h * v0 * (0.42 + 0.72 * hz);
          /* the floor streak: the source's reflection in the brushed metal —
             a band along the floor in the red zone; capped so it does not
             pull the core down to the floor */
          var sk = Math.pow(h, 1.6); if (sk > 0.5) sk = 0.5;
          v += sk * s0 * 0.36 * (0.7 + 0.3 * hz);
          if (burst) v = 1.3;
          var pi = pidx(v) * 3;
          d[o] = PAL.rgb[pi]; d[o + 1] = PAL.rgb[pi + 1]; d[o + 2] = PAL.rgb[pi + 2]; d[o + 3] = 255;
        }
      }
      fCtx.putImageData(img, 0, 0);
      return cols;
    }

    function draw(c, S) {
      var cols = paint(S);
      if (!cols) return 0;
      var lit = cols * CX;
      var x0 = TX + INSET, y0 = TY + INSET, iw = Math.min(lit, S.reach - INSET), ih = TH - 2 * INSET;
      /* 1 the field */
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.imageSmoothingEnabled = true;
      c.drawImage(fCv, 0, 0, cols, FH, x0, y0, lit, ih);
      /* 2 the brushed metal, added: fine red streaks where the light is weak */
      if (!S.burst) {
        c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.42 * Math.min(1, S.inten);
        c.drawImage(metal, 0, 0, Math.round(iw * DPR), mH, x0, y0, iw, ih);
      }
      /* 3 the shafts: from a point behind the knob's round end, fanning left */
      var sx = TX + S.kxT + S.KR * 0.55, sy = TY + S.kyT, t = S.t;
      var inten = Math.min(1, S.inten);
      c.globalCompositeOperation = "lighter";
      for (var i = 0; i < rays.length; i++) {
        var r = rays[i];
        var a = r.a + 0.055 * Math.sin(t * 0.21 + r.p1) + 0.022 * Math.sin(t * 0.63 + r.p2);
        var b = r.amp * inten * (0.45 + 0.55 * vn(t * 0.16 + r.p3, 3.5 + i * 2.1));
        if (S.burst) b = 1;
        var L = r.len, ca = Math.cos(a), sa = Math.sin(a);
        var ex = sx - L * ca, ey = sy - L * sa;                /* the far end (left) */
        var g = c.createLinearGradient(sx, sy, ex, ey);
        for (var s = 0; s <= 4; s++) {
          var f = s / 4, px = sx - L * f * ca, py = sy - L * f * sa;
          var hz = S.burst ? 1 : 0.3 + 0.7 * hazeAt(px - TX, py - TY, t);
          var al = b * (1 - f) * (1 - f) * hz * (S.shift ? Math.max(0, 1 - S.shift / 120) : 1);
          var col = f < 0.35 ? "255,190,170" : f < 0.7 ? "255,90,50" : "255,30,0";
          g.addColorStop(f, "rgba(" + col + "," + (al * 0.95).toFixed(3) + ")");
        }
        var wx = -sa * (r.w + L * 0.0065), wy = ca * (r.w + L * 0.0065);    /* half-width at the far end */
        c.fillStyle = g; c.beginPath();
        c.moveTo(sx, sy); c.lineTo(ex + wx, ey + wy); c.lineTo(ex - wx, ey - wy); c.closePath(); c.fill();
      }
      /* 4 the dust: sharp, sparse, lit by where it is */
      for (i = 0; i < dust.length; i++) {
        var q = dust[i], tt = q.life / q.ttl;
        var hd = Math.pow(heatL(S.kxT - q.x), 0.7) * inten;
        var al2 = Math.sin(tt * 3.1416) * hd * (0.55 + 0.45 * Math.sin(q.life * q.w + q.ph));
        if (al2 <= 0.02) continue;
        c.globalAlpha = Math.min(1, al2);
        c.fillStyle = "rgb(255,214,196)";
        c.fillRect(TX + q.x - q.r, TY + q.y - q.r, q.r * 2, q.r * 2);
      }
      /* 5 the core: pink-white with a whisper of amber, hugging the knob's edge */
      var kcx = TX + S.kxT + S.KR, kcy = TY + S.kyT, KR = S.KR;
      var cg = c.createRadialGradient(kcx, kcy, Math.max(0, KR - 2), kcx, kcy, KR + 34);
      var ci = Math.min(1, S.inten) * (S.cooling ? Math.max(0, 1 - S.shift / 60) : 1);
      cg.addColorStop(0, "rgba(255,232,206," + (0.95 * ci).toFixed(3) + ")");
      cg.addColorStop(0.16, "rgba(255,196,170," + (0.75 * ci).toFixed(3) + ")");
      cg.addColorStop(0.42, "rgba(255,90,60," + (0.40 * ci).toFixed(3) + ")");
      cg.addColorStop(1, "rgba(255,38,0,0)");
      c.globalAlpha = 1; c.fillStyle = cg;
      c.beginPath(); c.arc(kcx, kcy, KR + 34, 0, 6.2832); c.fill();
      c.globalCompositeOperation = "source-over";
      return lit;
    }
    return { name: "light", resize: resize, reset: reset, step: step, draw: draw, busy: busy, heat: heatL, staticFrame: staticFrame,
             stats: function () { return { dust: dust.length, cells: FW + "x" + FH }; } };
  })();

  /* ======================================================================
     FILL `A` — signal bars / phosphor tube
     The slot is a glass tube with a bank of 3 px phosphor segments at a 4 px
     pitch (1 px gaps), lit up behind the knob: pink-white at the knob, red,
     dim cherry further left (heatA by distance). Per segment: a slow random
     flicker (a noise in segment × time), a rare stutter, a fixed set of dead
     and weak segments per page load. Under the bars a bloom (the segment
     colours as a 1-px strip stretched over the slot, twice, at two widths),
     over them the tube's shading (darker at the top and bottom walls), a
     scanline raster every 3 px, and the glass highlight along the top edge
     with a fainter one along the bottom. Everything is fillRect on whole
     css px, so it is crisp at 2x.
     ====================================================================== */
  FILLS.A = (function () {
    var PITCH = 4, BAR = 3, MARGIN = 5;
    var N = 0, segV = null, segK = null, segX0 = 0, dead = null;
    var strip = null, sCtx = null, sImg = null, strip2 = null, s2Ctx = null, s2Img = null;
    var scan = null, scanPat = null;
    var PAL = makePal([
      [0.00, 0, 0, 0], [0.12, 58, 0, 0], [0.30, 154, 0, 0], [0.55, 249, 0, 0],
      [0.70, 255, 38, 0], [0.85, 255, 122, 96], [1.00, 255, 200, 188], [1.30, 255, 240, 236]
    ]);
    /* pink-white for the last ~25 px (the knob's own drop shadow sits over the
       canvas, so the segments right behind it need to burn through it), red
       by ~60, dim cherry past ~200 */
    var heatA = makeCurve([[0, 1.22], [12, 1.12], [30, 0.96], [60, 0.72], [100, 0.52], [160, 0.36], [240, 0.24], [340, 0.16], [512, 0.12]]);

    function resize() {
      N = Math.floor((TW - 2 * INSET - 2) / PITCH);
      segX0 = INSET + 1 + ((TW - 2 * INSET - 2) - N * PITCH) / 2;   /* centred in the slot */
      segV = new Float32Array(N); segK = new Float32Array(N); dead = new Float32Array(N);
      var r = rnd;
      for (var i = 0; i < N; i++) { var u = r(); dead[i] = u < 0.035 ? 0 : u < 0.09 ? 0.42 : 1; segK[i] = r() * 64; }
      if (!strip) {
        strip = doc.createElement("canvas"); sCtx = strip.getContext("2d");
        strip2 = doc.createElement("canvas"); s2Ctx = strip2.getContext("2d");
        scan = doc.createElement("canvas");
      }
      strip.width = N; strip.height = 1; sImg = sCtx.createImageData(N, 1);
      strip2.width = Math.ceil(N / 3); strip2.height = 1; s2Img = s2Ctx.createImageData(strip2.width, 1);
      /* the scanline raster: 1 css px dark in 3, as a pattern at device px */
      var sp = Math.round(3 * DPR), sd = Math.round(DPR);
      scan.width = 4; scan.height = sp;
      var sc = scan.getContext("2d"); sc.clearRect(0, 0, 4, sp);
      sc.fillStyle = "rgba(0,0,0,.20)"; sc.fillRect(0, sp - sd, 4, sd);
      scanPat = ctx.createPattern(scan, "repeat");
    }
    function reset() {}
    function busy() { return false; }
    function step(S) {
      var t = S.t, inten = S.inten, n = 0;
      for (var i = 0; i < N; i++) {
        var xc = segX0 + i * PITCH + BAR / 2;
        if (xc > S.reach + PITCH) { segV[i] = 0; continue; }
        n = i + 1;
        var h = heatA(S.kxT - xc + S.shift);
        if (S.done && h < 0.74) h = 0.74;
        if (S.p < 0.05 && !S.done) h *= 0.78;          /* a hover is a red pool, not a white one */
        /* the flicker: a slow noise per segment, and a rare sharp stutter */
        var f = 0.80 + 0.20 * vn(segK[i] + t * 1.1, i * 0.37 + OY);
        var s = vn(segK[i] + 50 + t * 2.3, i * 0.9 + OX); if (s > 0.87) f *= 0.35;
        var v = h * inten * f * dead[i];
        if (S.burst) v = 1.3 * (dead[i] ? 1 : 0.6);
        segV[i] = v;
      }
      segV.n = n;
    }
    function staticFrame(S) { resize(); step(S); }

    function draw(c, S) {
      var n = segV.n || 0;
      if (!n) return 0;
      var x0 = TX + INSET, y0 = TY + INSET, ih = TH - 2 * INSET;
      var by = y0 + MARGIN, bh = ih - 2 * MARGIN;
      var lit = segX0 + n * PITCH - INSET, i, v, pi;
      /* the bloom: the segment colours as a strip, stretched with smoothing */
      var d = sImg.data, d2 = s2Img.data, w2 = strip2.width;
      for (i = 0; i < w2 * 4; i++) d2[i] = 0;
      for (i = 0; i < N; i++) {
        v = segV[i]; pi = pidx(v * 0.9) * 3;
        var o = i * 4, a = v > 0 ? Math.min(255, 60 + v * 170) : 0;
        d[o] = PAL.rgb[pi]; d[o + 1] = PAL.rgb[pi + 1]; d[o + 2] = PAL.rgb[pi + 2]; d[o + 3] = a;
        var o2 = ((i / 3) | 0) * 4;
        d2[o2] = Math.max(d2[o2], d[o]); d2[o2 + 1] = Math.max(d2[o2 + 1], d[o + 1]); d2[o2 + 2] = Math.max(d2[o2 + 2], d[o + 2]); d2[o2 + 3] = Math.max(d2[o2 + 3], a);
      }
      sCtx.putImageData(sImg, 0, 0); s2Ctx.putImageData(s2Img, 0, 0);
      c.imageSmoothingEnabled = true;
      c.globalCompositeOperation = "lighter";
      c.globalAlpha = 0.42; c.drawImage(strip2, 0, 0, Math.ceil(n / 3), 1, x0 + segX0 - INSET, y0, Math.ceil(n / 3) * 3 * PITCH, ih);
      c.globalAlpha = 0.55; c.drawImage(strip, 0, 0, n, 1, x0 + segX0 - INSET, y0, n * PITCH, ih);
      /* the segments: whole css px, crisp */
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      for (i = 0; i < n; i++) {
        v = segV[i];
        if (v <= 0.005) continue;
        c.fillStyle = PAL.css[pidx(v)];
        c.fillRect(TX + segX0 + i * PITCH, by, BAR, bh);
      }
      /* the tube's shading: the phosphor is brightest at the tube's centre */
      var region = Math.min(lit, S.reach - INSET);
      c.globalCompositeOperation = "destination-out";
      var g = c.createLinearGradient(0, y0, 0, y0 + ih);
      g.addColorStop(0, "rgba(0,0,0,.50)"); g.addColorStop(0.2, "rgba(0,0,0,.10)");
      g.addColorStop(0.5, "rgba(0,0,0,0)"); g.addColorStop(0.8, "rgba(0,0,0,.12)"); g.addColorStop(1, "rgba(0,0,0,.55)");
      c.fillStyle = g; c.fillRect(x0, y0, region + PITCH, ih);
      /* the scanline raster */
      c.save(); c.translate(0, y0); c.fillStyle = scanPat; c.fillRect(x0, 0, region + PITCH, ih); c.restore();
      /* the glass: a highlight along the top edge, a fainter one along the
         bottom, coloured by the segments under them */
      c.globalCompositeOperation = "lighter";
      var inten = Math.min(1, S.inten);
      var hg = c.createLinearGradient(x0, 0, x0 + region, 0);
      for (i = 0; i <= 6; i++) {
        var f = i / 6, si = Math.min(N - 1, Math.floor(f * n)), vv = segV[si] || 0;
        var pj = pidx(Math.min(1.3, vv * 1.1)) * 3;
        hg.addColorStop(f, "rgba(" + PAL.rgb[pj] + "," + PAL.rgb[pj + 1] + "," + PAL.rgb[pj + 2] + "," + (0.9 * Math.min(1, vv)).toFixed(3) + ")");
      }
      c.globalAlpha = 1; c.fillStyle = hg;
      c.fillRect(x0, y0 + 1.5, region, 1.2);
      c.globalAlpha = 0.28; c.fillRect(x0, y0 + 2.7, region, 2.5);
      c.globalAlpha = 0.35; c.fillRect(x0, y0 + ih - 2.7, region, 1);
      c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      return lit;
    }
    return { name: "A", resize: resize, reset: reset, step: step, draw: draw, busy: busy, heat: heatA, staticFrame: staticFrame,
             stats: function () { return { segments: N, lit: segV ? (segV.n || 0) : 0 }; } };
  })();

  /* ======================================================================
     FILL `B` — veins / cursed circuitry
     Three MAIN veins enter the knob along its round end and are laid down
     across the track as it travels: every 14–24 px of travel fixes a new node
     at the knob's edge (with a little wander in y), so each main is a trail
     the knob left behind, oldest at the cap, youngest at the knob. When a node
     is fixed a SUB-BRANCH may sprout from it (short, 10–34 px, angled up or
     down, growing at ~70 px/s over a few steps, sometimes forking once); while
     the knob is parked a new twig sprouts near it every second or two and old
     twigs fade, so it keeps living without thickening into a web. Brightness
     per segment: heatB by distance from the knob × an age fade (young = pink-
     white, old = dark red) + a HEARTBEAT: two packets 190 ms apart every
     ~1.3 s, running from the knob down the veins at 260 px/s. Drawn as a red
     halo (7 px), a mid line (2.5 px) and a crisp core (~1 px), the core
     batched into 12 brightness buckets. On release a burn front runs in from
     the far end (a pink-white ember at the cut) while the knob's spring back
     trims the young end: the network burns out from both ends.
     ====================================================================== */
  FILLS.B = (function () {
    var mains = [], subs = [], pulses = [], nextBeat = 0.6, twigTimer = 1.2, nSeg = 0;
    var PAL = makePal([
      [0.00, 0, 0, 0], [0.14, 70, 0, 0], [0.32, 160, 0, 0], [0.55, 249, 0, 0],
      [0.70, 255, 38, 0], [0.84, 255, 120, 90], [1.00, 255, 206, 190], [1.30, 255, 242, 238]
    ]);
    var heatB = makeCurve([[0, 1.1], [8, 1.0], [30, 0.82], [80, 0.62], [160, 0.42], [280, 0.30], [512, 0.24]]);
    var NB = 12, buckets = [];
    for (var b = 0; b < NB; b++) buckets.push([]);

    function resize() { if (!mains.length) seed(); }
    function seed() {
      mains.length = 0; subs.length = 0; pulses.length = 0;
      var fr = [0.30, 0.55, 0.78];
      for (var i = 0; i < 3; i++) mains.push({ by: INSET + (fr[i] + (rnd() - 0.5) * 0.10) * (TH - 2 * INSET), nodes: [], step: 14 + rnd() * 10, lastSpawn: -99 });
    }
    function reset() { mains.length = 0; subs.length = 0; pulses.length = 0; nSeg = 0; }
    function busy() { return false; }
    function anchor(m, S) {
      var ay = S.kyT + (m.by - S.kyT) * 0.72;
      var dy = ay - S.kyT, r2 = S.KR * S.KR - dy * dy;
      var ax = S.kxT + S.KR - (r2 > 0 ? Math.sqrt(r2) : 0);
      return { x: ax, y: ay };
    }
    function spawnSub(node, main, t, born) {
      if (subs.length >= 18) return;
      var up = rnd() < 0.5, th = Math.PI + (up ? -1 : 1) * (0.35 + rnd() * 0.5);   /* leftward, up or down, never steeper than ~50° */
      subs.push({ nodes: [{ x: node.x, y: node.y, t0: t }], th: th, len: 8 + rnd() * 20, grown: 0,
                  adv: 0, next: 5 + rnd() * 4, alive: true, forked: false, main: main, born: t,
                  ttl: born ? 5 + rnd() * 5 : 1e9, rootX: node.x });
    }
    function growSubs(dt, t) {
      for (var i = subs.length - 1; i >= 0; i--) {
        var s = subs[i];
        if (!s.alive) continue;
        s.adv += 70 * dt;
        while (s.adv >= s.next && s.alive) {
          s.adv -= s.next;
          var tip = s.nodes[s.nodes.length - 1];
          s.th += (rnd() - 0.5) * 0.5;
          var nx = tip.x + Math.cos(s.th) * s.next, ny = tip.y + Math.sin(s.th) * s.next;
          if (ny < INSET + 3 || ny > TH - INSET - 3 || nx < INSET + 3) { s.alive = false; break; }
          s.nodes.push({ x: nx, y: ny, t0: t });
          s.grown += s.next; s.next = 5 + rnd() * 4;
          if (s.grown >= s.len) s.alive = false;
          if (!s.forked && s.nodes.length === 3 && rnd() < 0.25 && subs.length < 18) {
            s.forked = true;
            var tw = { nodes: [{ x: nx, y: ny, t0: t }], th: s.th + (rnd() < 0.5 ? -0.7 : 0.7), len: 6 + rnd() * 8, grown: 0,
                       adv: 0, next: 4 + rnd() * 3, alive: true, forked: true, main: s.main, born: t, ttl: s.ttl, rootX: s.rootX };
            subs.push(tw);
          }
        }
      }
    }
    function step(S) {
      if (!mains.length) seed();
      var t = S.t, dt = S.dt, i, m, a, last;
      for (i = 0; i < mains.length; i++) {
        m = mains[i]; a = anchor(m, S);
        /* the knob moved back: what is under it is gone */
        while (m.nodes.length && m.nodes[m.nodes.length - 1].x > a.x - 3) m.nodes.pop();
        /* the trail: a node every `step` px of travel, laid at the knob's edge.
           A jump (a keyboard step, ?slide=) lays them all at once, aged by
           how far from the knob they are */
        var guard = 0;
        while (guard++ < 60) {
          last = m.nodes.length ? m.nodes[m.nodes.length - 1] : null;
          if (!last) { if (a.x - INSET > 8) m.nodes.push({ x: INSET + 3, y: m.by + (rnd() - 0.5) * 4, t0: t }); else break; continue; }
          if (a.x - last.x <= m.step) break;
          var nx = last.x + m.step, ny = last.y + (rnd() - 0.5) * 5 + (m.by - last.y) * 0.4;
          if (ny < INSET + 4) ny = INSET + 4; if (ny > TH - INSET - 4) ny = TH - INSET - 4;
          var node = { x: nx, y: ny, t0: t - Math.max(0, (a.x - nx - m.step) / 320) };
          m.nodes.push(node);
          m.step = 14 + rnd() * 10;
          if (nx - m.lastSpawn > 26 && rnd() < 0.30) { spawnSub(node, i, node.t0, false); m.lastSpawn = nx; }
        }
      }
      /* subs whose root the knob has covered, or that are past their time */
      for (i = subs.length - 1; i >= 0; i--) {
        var s = subs[i];
        if (s.rootX > S.kxT - 2 || t - s.born > s.ttl + 1.0) subs.splice(i, 1);
      }
      growSubs(dt, t);
      /* parked: a new twig near the knob now and then */
      if (S.speed < 6 && S.inten > 0.5 && !S.cooling && S.kxT - INSET > 30) {
        twigTimer -= dt;
        if (twigTimer <= 0) {
          twigTimer = 1.1 + rnd() * 1.1;
          m = mains[(rnd() * mains.length) | 0];
          var cand = m.nodes.filter(function (n) { return S.kxT - n.x < 80 && S.kxT - n.x > 6; });
          if (cand.length) spawnSub(cand[(rnd() * cand.length) | 0], 0, t, true);
        }
      }
      /* the heartbeat */
      nextBeat -= dt;
      if (nextBeat <= 0 && S.inten > 0.3) { nextBeat = 1.15 + rnd() * 0.45; pulses.push(t, t + 0.19); }
      for (i = pulses.length - 1; i >= 0; i--) if ((t - pulses[i]) * 260 > S.kxT + 40) pulses.splice(i, 1);
      /* release: the burn front eats the network from the far end */
      if (S.cooling && S.shift > 0) {
        var xF = INSET + S.shift * 1.15;
        for (i = 0; i < mains.length; i++) { m = mains[i]; while (m.nodes.length && m.nodes[0].x < xF) m.nodes.shift(); }
        for (i = subs.length - 1; i >= 0; i--) if (subs[i].rootX < xF) subs.splice(i, 1);
      }
    }
    function staticFrame(S) {
      reset(); seed(); S.dt = 0; step(S);
      for (var i = 0; i < 40; i++) growSubs(0.05, S.t);
      pulses.length = 0;
    }
    function bright(x, t, S) {
      var d = S.kxT - x, h = heatB(d + S.shift);
      if (S.done && h < 0.7) h = 0.7;
      var age = t - 0;
      var v = h;
      for (var i = 0; i < pulses.length; i++) {
        var pos = (t - pulses[i]) * 260, e = (d - pos) / 13;
        if (e > -3 && e < 3) v += 0.55 * Math.exp(-e * e) * h;
      }
      return v;
    }
    function draw(c, S) {
      var t = S.t, inten = Math.min(1, S.inten), i, j, m, n, a, b, v, k;
      var breath = 0.86 + 0.14 * Math.sin(t * 1.3);            /* the halo breathes slowly */
      for (k = 0; k < NB; k++) buckets[k].length = 0;
      nSeg = 0;
      function seg(a, b, w, ageT, fade) {
        var age = t - ageT, ageF = 1 - 0.45 * sstep(0.2, 4.0, age);
        v = bright(b.x, t, S) * ageF * inten * fade;
        if (S.burst) v = 1.3;
        v *= 0.93 + 0.07 * vn(b.x * 0.2 + OX, t * 3 + b.y * 0.1);
        if (v < 0.03) return;
        k = Math.min(NB - 1, (v / 1.3 * NB) | 0);
        buckets[k].push(a.x, a.y, b.x, b.y, w);
        nSeg++;
      }
      for (i = 0; i < mains.length; i++) {
        m = mains[i]; n = m.nodes;
        for (j = 1; j < n.length; j++) seg(n[j - 1], n[j], 1, n[j].t0, 1);
        if (n.length) { a = anchor(m, S); seg(n[n.length - 1], a, 1, t, 1); }
      }
      for (i = 0; i < subs.length; i++) {
        var s = subs[i], f = Math.min(1, Math.max(0, s.ttl + 1 - (t - s.born)));
        n = s.nodes;
        for (j = 1; j < n.length; j++) seg(n[j - 1], n[j], 0.8, n[j].t0, 0.85 * f);
      }
      if (!nSeg) return 0;
      c.lineCap = "round"; c.lineJoin = "round";
      /* the halo and the mid line, batched hot / cool */
      var pass = [[6.5, "rgba(249,0,0,", 0.11, 0.22], [2.0, "rgba(255,60,30,", 0.18, 0.34]];
      c.globalCompositeOperation = "lighter";
      for (var p = 0; p < 2; p++) {
        for (var hot = 0; hot < 2; hot++) {
          c.beginPath();
          var any = false;
          for (k = hot ? 6 : 0; k < (hot ? NB : 6); k++) {
            var q = buckets[k];
            for (j = 0; j < q.length; j += 5) { c.moveTo(TX + q[j], TY + q[j + 1]); c.lineTo(TX + q[j + 2], TY + q[j + 3]); any = true; }
          }
          if (!any) continue;
          c.lineWidth = pass[p][0]; c.strokeStyle = pass[p][1] + (pass[p][hot ? 3 : 2] * inten * breath).toFixed(3) + ")"; c.stroke();
        }
      }
      /* the core: crisp, per brightness bucket */
      c.globalCompositeOperation = "source-over";
      for (k = 0; k < NB; k++) {
        var q2 = buckets[k];
        if (!q2.length) continue;
        c.beginPath();
        for (j = 0; j < q2.length; j += 5) { c.moveTo(TX + q2[j], TY + q2[j + 1]); c.lineTo(TX + q2[j + 2], TY + q2[j + 3]); }
        c.lineWidth = 0.8 + 0.45 * k / (NB - 1);
        c.strokeStyle = PAL.css[pidx((k + 0.5) / NB * 1.3)]; c.stroke();
      }
      /* the growing tips: a bright point */
      c.globalCompositeOperation = "lighter";
      for (i = 0; i < subs.length; i++) {
        var s2 = subs[i];
        if (!s2.alive) continue;
        var tip = s2.nodes[s2.nodes.length - 1];
        c.globalAlpha = 0.9 * inten; c.fillStyle = "rgb(255,220,206)";
        c.beginPath(); c.arc(TX + tip.x, TY + tip.y, 1.1, 0, 6.2832); c.fill();
      }
      /* where the veins enter the knob: a small red glow (what the knob's
         mask leaves of it is the light in the seam) */
      for (i = 0; i < mains.length; i++) {
        if (!mains[i].nodes.length) continue;
        a = anchor(mains[i], S);
        var g = c.createRadialGradient(TX + a.x, TY + a.y, 0, TX + a.x, TY + a.y, 11);
        g.addColorStop(0, "rgba(255,150,120," + (0.7 * inten).toFixed(3) + ")");
        g.addColorStop(0.35, "rgba(255,40,10," + (0.35 * inten).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,38,0,0)");
        c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(TX + a.x, TY + a.y, 11, 0, 6.2832); c.fill();
      }
      /* the burn front on release: an ember at the cut end of each main */
      if (S.cooling) {
        for (i = 0; i < mains.length; i++) {
          n = mains[i].nodes; if (!n.length) continue;
          var g2 = c.createRadialGradient(TX + n[0].x, TY + n[0].y, 0, TX + n[0].x, TY + n[0].y, 6);
          g2.addColorStop(0, "rgba(255,236,220,.95)"); g2.addColorStop(0.3, "rgba(255,120,60,.6)"); g2.addColorStop(1, "rgba(255,38,0,0)");
          c.globalAlpha = 1; c.fillStyle = g2; c.beginPath(); c.arc(TX + n[0].x, TY + n[0].y, 6, 0, 6.2832); c.fill();
        }
      }
      c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
      return S.kxT - INSET;
    }
    return { name: "B", resize: resize, reset: reset, step: step, draw: draw, busy: busy, heat: heatB, staticFrame: staticFrame,
             stats: function () { var nn = 0; mains.forEach(function (m) { nn += m.nodes.length; }); return { mains: mains.length, mainNodes: nn, subs: subs.length, segs: nSeg, pulses: pulses.length }; } };
  })();

  /* ======================================================================
     wiring, QA hooks, boot
     ====================================================================== */
  wrap.addEventListener("pointerenter", function () { hovering = true; kxDirty = true; ignite(); });
  wrap.addEventListener("pointerleave", function () { hovering = false; kxDirty = true; });
  global.addEventListener("resize", function () { sizeFlame(); if (reduce.matches) drawStatic(); }, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) stop(); else if (awake()) ignite();
  });
  reduce.addEventListener("change", function () { if (reduce.matches) { stop(); drawStatic(); } });

  function forceTo(p) {
    frozen = true; qaAwake = true;
    measure();
    wrap.classList.add("is-drag");          /* no easing, park it exactly    */
    if (p >= 1) { wrap.classList.add("is-done"); finish(false); return; }
    x = max * Math.max(0, Math.min(1, p));
    place(x);
    if (!reduce.matches) ignite();
  }
  var sweepRaf = 0;
  function sweep(on, speed) {
    if (sweepRaf) { global.cancelAnimationFrame(sweepRaf); sweepRaf = 0; }
    if (on === false) {
      frozen = false; qaAwake = false; qaDrag = false;
      knob.classList.remove("dragging"); wrap.classList.remove("is-drag"); rest(); return;
    }
    frozen = true; qaAwake = true; qaDrag = true; measure();
    knob.classList.add("dragging");
    wrap.classList.add("is-drag");
    var v = (speed || 1000), dir = 1, pos = 0, t0 = 0;
    (function step(ts) {
      sweepRaf = global.requestAnimationFrame(step);
      if (!t0) { t0 = ts; return; }
      var dt = Math.min(0.05, (ts - t0) / 1000); t0 = ts;
      pos += dir * v * dt;
      if (pos > max) { pos = max; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      x = pos; place(pos);
    })(0);
  }
  global.booSlide = {
    set: forceTo,
    done: function () { forceTo(1); },
    sweep: sweep,
    fill: function (name) { return name === undefined ? fillName : setFill(String(name)); },
    fills: function () { return Object.keys(FILLS); },
    timescale: function (k) { tscale = k > 0 ? k : 1; },
    release: function () {
      frozen = false; qaAwake = false; qaDrag = false;
      knob.classList.remove("dragging"); wrap.classList.remove("is-drag"); rest();
    },
    reset: function () {
      frozen = false; qaAwake = false; qaDrag = false;
      if (sweepRaf) { global.cancelAnimationFrame(sweepRaf); sweepRaf = 0; }
      knob.classList.remove("dragging");
      wrap.classList.remove("is-drag", "is-done");
      track.classList.remove("done", "is-flare", "is-flare-hold"); rest();
    },
    get progress() { return progress; },
    get max() { return max; },
    get flame() {
      var o = { fill: fillName, amp: +amp.toFixed(3), vel: Math.round(vel), heat: +meanHeat.toFixed(3), cols: Math.round(litCols),
                shift: Math.round(coolShift), cooling: cooling, raf: !!raf, kg: knobGlow < 0 ? 0 : +knobGlow.toFixed(3),
                ms: +fireMs.toFixed(2), msMax: +fireMax.toFixed(2) };
      var s = R ? R.stats() : {};
      for (var k in s) o[k] = s[k];
      return o;
    }
  };

  function boot() {
    var name = "light";
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.has("fill")) name = q.get("fill");
    } catch (e) {}
    setFill(name);
    sizeFlame();
    try {
      var q2 = new URLSearchParams(global.location.search);
      if (q2.has("slide")) {
        var v = q2.get("slide");
        if (v === "flare") { forceTo(1); track.classList.add("is-flare-hold"); }
        else if (v === "done" || v === "1") forceTo(1);
        else if (v === "hover") { wrap.classList.add("is-hover-demo"); qaAwake = true; hovering = true; ignite(); }
        else { var n = parseFloat(v); if (n === n) forceTo(n); }
      }
    } catch (e) {}
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  global.addEventListener("load", function () { sizeFlame(); if (reduce.matches) drawStatic(); });
})(window);
