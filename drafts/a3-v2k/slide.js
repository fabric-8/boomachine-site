/* ==========================================================================
   Boo Machine — slide to join   (v2k: the light, alive)

   The pointer / capture / drag logic, the keyboard support and the TestFlight
   URL are v2e-b's, carried through v2f–v2j unchanged (the block below the
   header, down to the `focus` listener, is byte-identical to v2i). What
   changed is what the drag DRIVES.

   v2j offered three fills for the uncovered track; the client picked `light`
   ("an intensely lit red-ish hot light") and said the revealed stuff was
   "just a tad too static". So v2k is v2j's `light`, the only fill now (A, B
   and the `?fill=` switch are gone), with LIFE in every layer — and none of
   it turning into fire:

     rays     8–14 shafts of unequal width and brightness rotating slowly
              about the source, each at its own angular speed (±0.02–0.06
              rad/s, bouncing off the fan's edges, a few reversing on their
              own timer), each breathing on its own 2–5 s cycle, and now and
              then (every 4–9 s) one of them FLARES for a third of a second;
     haze     the occluding smoke drifts left and slowly up (two octaves at
              ~6 and ~2 px/s) with its density wobbling, so the rays swim
              through it; the cool far-left end gets its own faint slow haze
              so it is never a frozen gradient;
     source   the core pulses ±6 % over ~1.2 s with an occasional 0.15 s
              micro-flicker (a hot filament), and a heat-shimmer band at the
              knob's edge refracts what passes through it (a small sinusoidal
              x-offset field, tapered to nothing 18 px out);
     dust     sparse sharp motes with PARALLAX (the near ones larger, brighter,
              faster), drifting left and up through the light, lit only
              where a shaft is (their alpha follows the ray field at their
              position) and fading with distance from the source;
     floor    the source's reflection in the brushed floor shimmers — fine
              per-frame noise along it at low amplitude.

   No two layers share a clock: every period, speed and phase is drawn at
   random per page load, so nothing beats against anything else.

   Unchanged from v2j: the canvas IS the track's box and every frame is drawn
   inside ctx.clip() of the inner rounded rect inset 2 px; the knob's own body
   is erased from the fill and the seam beside it fades to nothing at the
   knob's centre line; heat is a function of distance from the knob's left
   edge; the amplitude states (rest / hover / drag / release / done / flare)
   and the release cooling window; `--rl-d` 1 -> 1.7 with the travel; `--kg`
   (the fill's brightness at the knob) lighting the knob's left edge; ONE
   seeded static frame under reduced motion, no rAF; the `hell` data-fx token
   switches the whole thing off.

   QA hooks: ?slide=0.4|hover|done|flare,
   window.booSlide.set(p) / .done() / .sweep(on, pxPerSec) / .timescale(k) /
   .release() / .reset() / .rayFlare(i) / .flame (stats)
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
     THE FILL — the engine (v2j's, minus the fill switch)
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

  var R = null;                                          /* the one renderer: LIGHT, below */

  function now() { return performance.now(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sstep(a, b, v) { v = (v - a) / (b - a); v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }

  /* --- value noise, 64 x 64, bilinear, wrapping; the table and the phase
         are random per page load, so no two loads look alike. `rnd` is the
         renderer's only source of randomness (swapped for a seeded one in
         drawStatic), so the reduced-motion frame is the same every load --- */
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
     The renderer simply draws up to the knob's centre. */
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

  /* --- reduced motion: ONE seeded frame of the light in the uncovered
         region, redrawn only when the knob's position is published; no rAF.
         Every clock the renderer keeps is re-seeded too (staticFrame), so the
         frame is the same on every load and never moves --------------------- */
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


  /* ======================================================================
     THE LIGHT — the intensely lit red-hot light, alive
     The slot is a cavity flooded with light from a source hidden behind the
     knob. Seven passes, all inside the clip, all left of the knob's centre:
       1  the FIELD (ImageData at 2 px cells): heat by distance with an
          inverse-square fall-off (heatL), scattered by the HAZE (two octaves
          drifting left and slowly up, density wobbling, refreshed at 24 Hz),
          a faint slow COOL HAZE that only shows where the light is weak, the
          cavity's walls a little darker than its middle, and the FLOOR
          STREAK — the source reflected in the brushed floor, shimmering on
          a per-frame noise;
       2  the BRUSHED METAL: a tinted noise made once at device resolution,
          added over the lit region;
       3  the RAYS: 8–14 shafts from a point behind the knob's round end,
          unequal in width and brightness, each rotating at its own angular
          speed and bouncing off the fan's edges (a few reverse on a timer),
          each breathing on its own 2–5 s cycle, one flaring every 4–9 s;
          each a slim triangle with a 5-stop gradient reading the haze along
          its length;
       4  the HEAT SHIMMER: the 18 px in front of the knob's edge are copied
          out and put back row by row, each row stretched by a small
          sinusoidal x-offset (0 at the band's left edge, ±0.9 px at the
          knob) that runs up the band — the rays wobble where they emerge;
       5  the DUST: ≤ 18 sharp motes with parallax, lit by the ray field;
       6  the CORE: a radial gradient off the knob's semicircle, pink-white
          with a whisper of amber, pulsing ±6 % over ~1.2 s with a rare
          0.15 s micro-flicker.
     Every clock (`clk`) is drawn from `rnd` once per page load (seeded under
     reduced motion): no two layers share a period or a phase.
     ====================================================================== */
  var LIGHT = (function () {
    var CELL = 2, FW = 0, FH = 0, CX = 0, CY = 0, img = null, fCv = null, fCtx = null;
    var HZ = null, CZ = null, nT = -1, NOISE_DT = 1 / 24, vp = null, st = null, sp = null;
    var metal = null, mW = 0, mH = 0;
    var band = null, bCtx = null, BW = 18;
    var rays = [], dust = [], dustAcc = 0;
    var clk = null, pulse = 1, srcX = 0, srcY = 0;
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
    var colH = new Float32Array(1024), colC = new Float32Array(1024), colN = new Float32Array(1024), shim = new Float32Array(1024);

    /* the clocks: one set per page load, nothing shared between layers */
    function makeClocks(t) {
      clk = {
        hzSx1: 5.4 + rnd() * 1.2, hzSy1: 0.8 + rnd() * 0.5,      /* haze octave 1: ~6 px/s left, ~1 px/s up */
        hzSx2: 1.6 + rnd() * 0.8, hzSy2: 0.3 + rnd() * 0.3,      /* haze octave 2: ~2 px/s left, ~.45 px/s up */
        hzSx3: 0.7 + rnd() * 0.5,                                 /* the fine detail, ~1 px/s */
        hzPa: 6.5 + rnd() * 4, hzPb: 10 + rnd() * 6, hzO: rnd() * 40,   /* density wobble periods (s) and offset */
        coolS: 1.1 + rnd() * 0.7, coolO: rnd() * 40,             /* the cool haze: ~1.5 px/s */
        pulseP: 1.1 + rnd() * 0.25, pulsePh: rnd() * 6.283,      /* the core: ~1.2 s */
        flickNext: t + 1 + rnd() * 3, flickUntil: -1, flickPh: 0, flickHz: 18 + rnd() * 8,
        shimK: 0.5 + rnd() * 0.3, shimW: 7 + rnd() * 5, shimPh: rnd() * 6.283,   /* the heat shimmer: rad/px, rad/s */
        flareNext: t + 4 + rnd() * 5, flareRay: -1, flareT0: -1,
        strkO: rnd() * 40, strkS: 36 + rnd() * 12                 /* the floor streak's per-frame noise */
      };
    }

    function resize() {
      FW = Math.round((TW - 2 * INSET) / CELL); CX = (TW - 2 * INSET) / FW;
      FH = Math.round((TH - 2 * INSET) / CX);   CY = (TH - 2 * INSET) / FH;
      HZ = new Float32Array(FW * FH); CZ = new Float32Array(FW * FH); vp = new Float32Array(FH); st = new Float32Array(FH); sp = new Float32Array(FH);
      for (var y = 0; y < FH; y++) {
        var yf = (y + 0.5) / FH;
        vp[y] = 0.72 + 0.28 * Math.sin(yf * Math.PI);            /* the walls darker than the middle */
        sp[y] = 0.25 + 0.75 * Math.pow(Math.sin(yf * Math.PI), 0.8);   /* the source: a glow from the knob's round end, not a column */
        var dy = (yf - 0.72) * FH / 2.2; st[y] = Math.exp(-dy * dy);   /* the floor streak */
      }
      if (!fCv) { fCv = doc.createElement("canvas"); fCtx = fCv.getContext("2d"); }
      fCv.width = FW; fCv.height = FH; img = fCtx.createImageData(FW, FH);
      if (!band) { band = doc.createElement("canvas"); bCtx = band.getContext("2d"); }
      band.width = Math.ceil((BW + 2) * DPR); band.height = Math.ceil((TH - 2 * INSET) * DPR);
      nT = -1;
      makeMetal();
      if (!clk) makeClocks(0);
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
    /* the rays: 8–14, unequal, each with its own angular speed, breath and
       reversal timer. `a` is the current angle (integrated), `b` the current
       brightness without the amplitude (so the dust can read the field) */
    function makeRays() {
      rays.length = 0;
      var n = 8 + Math.floor(rnd() * 7);
      for (var i = 0; i < n; i++) {
        var a = -0.25 + 0.5 * (i + 0.5) / n + (rnd() - 0.5) * 0.06;    /* ±14°, jittered */
        rays.push({ a: a, w: (0.02 + rnd() * 0.04) * (rnd() < 0.5 ? -1 : 1),
                    rev: rnd() < 0.4 ? 5 + rnd() * 9 : -1,             /* reverses on its own timer, or never */
                    len: 180 + rnd() * 160, wd: 0.3 + rnd() * 0.9, grow: 0.004 + rnd() * 0.006,
                    amp: 0.35 + rnd() * 0.65, bp: 2 + rnd() * 3, bph: rnd() * 6.283, bd: 0.25 + rnd() * 0.25,
                    b: 0, fl: 0 });
      }
    }
    function reset() { dust.length = 0; dustAcc = 0; nT = -1; }
    function busy() { return dust.length > 0; }

    /* the haze field, in TRACK coordinates so it stays put while the knob
       moves through it; refreshed at 24 Hz */
    function stepHaze(t) {
      var i = 0;
      for (var y = 0; y < FH; y++) {
        var yc = INSET + (y + 0.5) * CY;
        for (var x = 0; x < FW; x++, i++) {
          var xc = INSET + (x + 0.5) * CX;
          HZ[i] = hazeAt(xc, yc, t);
          CZ[i] = vn(xc * 0.02 + OX + clk.coolO + t * 0.02 * clk.coolS, yc * 0.06 + OY + 47 + t * 0.008);
        }
      }
    }
    /* the haze: two octaves drifting LEFT (~6 and ~2 px/s) and slowly UP, a
       fine third for detail, and a slow density wobble in x and t so patches
       thicken and thin. The same function feeds the field and the rays.
       Stretched x1.6 about the mean so it has contrast */
    function hazeAt(xT, yT, t) {
      var v = vn(xT * 0.012 + OX + t * 0.012 * clk.hzSx1, yT * 0.045 + OY + t * 0.045 * clk.hzSy1) * 0.52 +
              vn(xT * 0.034 + OX + 31 + t * 0.034 * clk.hzSx2, yT * 0.075 + OY + 7 + t * 0.075 * clk.hzSy2) * 0.31 +
              vn(xT * 0.09 + OX + 53 + t * 0.09 * clk.hzSx3, yT * 0.14 + OY + 19) * 0.17;
      var w = 0.74 + 0.52 * vn(xT * 0.006 + OX + clk.hzO + t / clk.hzPa, OY + 23 + t / clk.hzPb);
      v = (v - 0.5) * 1.6 * w + 0.5;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }
    /* the rays' field at a point (track coords), 0..1, without the
       amplitude: what a mote there would catch. Each ray is sampled 1.6 px
       wider than it is drawn (its glow), with a smooth profile, and a bright
       ray near the source saturates to 1 */
    function rayField(xT, yT) {
      var dx = srcX - xT, dy = srcY - yT, L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1) return 1;
      var th = Math.atan2(dy, dx), s = 0;
      for (var i = 0; i < rays.length; i++) {
        var r = rays[i]; if (L >= r.len) continue;
        var hw = (r.wd + L * r.grow + 1.6) / L, d = th - r.a; if (d < 0) d = -d;
        if (d >= hw) continue;
        var f = 1 - L / r.len, k = 1 - d / hw;
        s += 2.4 * r.b * f * k * k * (3 - 2 * k);
      }
      return s > 1 ? 1 : s;
    }

    function stepRays(S) {
      var t = S.t, dt = S.dt, i, r;
      /* the flare: one ray, every 4–9 s, for ~.36 s */
      if (dt > 0 && t > clk.flareNext) { clk.flareRay = Math.floor(rnd() * rays.length); clk.flareT0 = t; clk.flareNext = t + 4 + rnd() * 5; }
      for (i = 0; i < rays.length; i++) {
        r = rays[i];
        r.a += r.w * dt;
        if (r.a > 0.27) { r.a = 0.27; r.w = -Math.abs(r.w); }
        if (r.a < -0.27) { r.a = -0.27; r.w = Math.abs(r.w); }
        if (r.rev > 0) { r.rev -= dt; if (r.rev <= 0) { r.w = -r.w; r.rev = 5 + rnd() * 9; } }
        var br = 1 - r.bd * (0.5 + 0.5 * Math.sin(6.2832 * t / r.bp + r.bph));
        r.fl = 0;
        if (i === clk.flareRay) {
          var u = (t - clk.flareT0) / 0.36;
          if (u >= 0 && u < 1) r.fl = Math.pow(Math.sin(3.1416 * Math.pow(u, 0.6)), 1.2); else clk.flareRay = -1;
        }
        r.b = r.amp * br * (1 + 1.7 * r.fl);
      }
      /* the source: ±6 % over ~1.2 s, plus a rare 0.15 s micro-flicker */
      pulse = 1 + 0.06 * Math.sin(6.2832 * t / clk.pulseP + clk.pulsePh);
      if (dt > 0 && t > clk.flickNext) { clk.flickUntil = t + 0.15; clk.flickNext = t + 1.5 + rnd() * 4.5; clk.flickPh = rnd() * 6.283; }
      if (t < clk.flickUntil) pulse *= 1 + 0.08 * Math.sin(t * 6.2832 * clk.flickHz + clk.flickPh) * Math.sin(3.1416 * (clk.flickUntil - t) / 0.15);
    }

    function step(S) {
      if (nT < 0 || S.t - nT >= NOISE_DT) { nT = S.t; stepHaze(S.t); }
      srcX = S.kxT + S.KR * 0.55; srcY = S.kyT;
      stepRays(S);
      var dt = S.dt, i, q;
      /* the dust: sharp motes in the light, with depth (z: 1 = nearest) */
      if (S.inten > 0.2 && S.kxT > INSET + 10 && !S.cooling) {
        dustAcc += (3.5 + 4 * Math.min(1, S.p * 2)) * dt;
        var n = dustAcc | 0; dustAcc -= n;
        for (i = 0; i < n && dust.length < 18; i++) {
          var z = rnd();
          dust.push({ x: S.kxT - 4 - rnd() * Math.min(150, S.kxT - INSET - 6), y: INSET + 3 + rnd() * (TH - 2 * INSET - 6),
                      z: z, vx: -(3 + 9 * z) + (rnd() - 0.5) * 2, vy: -(0.8 + 2.2 * z) + (rnd() - 0.5) * 1.5,
                      life: 0, ttl: 2 + rnd() * 3, r: 0.35 + 0.55 * z, br: 0.55 + 0.45 * z,
                      ph: rnd() * 6.283, w: 3 + rnd() * 5 });
        }
      }
      for (i = dust.length - 1; i >= 0; i--) {
        q = dust[i]; q.life += dt;
        if (q.life >= q.ttl || q.x > S.kxT + 1 || q.x < INSET + 2 || q.y < INSET + 2 || q.y > TH - INSET - 2) { dust.splice(i, 1); continue; }
        q.x += (q.vx + Math.sin(q.life * 1.3 + q.ph) * 1.2 * (0.5 + q.z)) * dt;
        q.y += (q.vy + Math.cos(q.life * 1.1 + q.ph) * 0.9) * dt;
      }
    }
    /* reduced motion: everything re-drawn from the seeded `rnd`, at t = 4,
       no integration (dt 0) */
    function staticFrame(S) {
      makeClocks(S.t); makeRays(); makeMetal(); nT = -1; stepHaze(S.t); nT = S.t; dust.length = 0;
      srcX = S.kxT + S.KR * 0.55; srcY = S.kyT; stepRays(S);
    }

    function paint(S) {
      var W = FW, H = FH, x, y, i = 0, d = img.data, cols = 0, t = S.t;
      var inten = S.inten, done = S.done, burst = S.burst;
      var coreK = 0.6 * (1 + 2 * (pulse - 1));                   /* the source term follows the pulse (±12 %) */
      for (x = 0; x < W; x++) {
        var xc = INSET + (x + 0.5) * CX;
        if (xc < S.reach + CX) cols = x + 1;
        var dd = S.kxT - xc + S.shift;
        var h = heatL(dd);
        if (done && h < 0.5) h = 0.5;
        colH[x] = h * inten;
        /* the source: the last ~10 px before the knob go pink-white. ADDED,
           not multiplied (v2j multiplied, so a thin patch of haze turned the
           core red and a dense one made a 20 px white block); and the haze's
           say over the light shrinks near the source (colN), where the light
           is too intense for smoke to matter */
        var d1 = dd < 0 ? 0 : dd;
        colC[x] = dd < 40 ? coreK * Math.exp(-d1 / 9) * inten : 0;
        colN[x] = 1 - 0.7 * Math.exp(-d1 / 14);
        /* the floor streak's shimmer: a fresh fine noise along it every frame, ±18 % */
        shim[x] = 0.82 + 0.36 * vn(x * 0.7 + clk.strkO + t * clk.strkS, 9.5 + t * 7.3);
      }
      for (y = 0; y < H; y++) {
        var v0 = vp[y], s0 = st[y], c0 = sp[y] * v0;
        i = y * W;
        for (x = 0; x < W; x++, i++) {
          var o = i * 4;
          if (x >= cols) { d[o + 3] = 0; continue; }
          var h = colH[x], hz = HZ[i];
          /* the light through the haze: brighter where the haze is denser
             (that is what makes a shaft visible), the walls darker; the
             source added on top */
          var v = h * (1 + (0.72 * hz - 0.58) * colN[x]) * v0 + colC[x] * c0;
          /* the cool haze: a faint slow smoke that only shows where the
             light is weak, so the far end is never a frozen gradient */
          var cw = 1 - h; if (cw < 0) cw = 0;
          v += 0.085 * CZ[i] * cw * cw * inten;
          /* the floor streak: the source's reflection in the brushed metal —
             a band along the floor in the red zone; capped so it does not
             pull the core down to the floor; shimmering */
          var sk = Math.pow(h, 1.6); if (sk > 0.5) sk = 0.5;
          v += sk * s0 * 0.36 * (0.7 + 0.3 * hz) * shim[x];
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
      var t = S.t, i;
      /* 1 the field */
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.imageSmoothingEnabled = true;
      c.drawImage(fCv, 0, 0, cols, FH, x0, y0, lit, ih);
      /* 2 the brushed metal, added: fine red streaks where the light is weak */
      if (!S.burst) {
        c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.42 * Math.min(1, S.inten);
        c.drawImage(metal, 0, 0, Math.round(iw * DPR), mH, x0, y0, iw, ih);
      }
      /* 3 the rays: from a point behind the knob's round end, fanning left */
      var sx = TX + srcX, sy = TY + srcY;
      var inten = Math.min(1, S.inten);
      var fade = S.shift ? Math.max(0, 1 - S.shift / 120) : 1;
      c.globalCompositeOperation = "lighter"; c.globalAlpha = 1;
      for (i = 0; i < rays.length; i++) {
        var r = rays[i];
        var b = S.burst ? 1 : r.b * inten * fade;
        if (b <= 0.01) continue;
        var L = r.len, ca = Math.cos(r.a), sa = Math.sin(r.a);
        var ex = sx - L * ca, ey = sy - L * sa;                /* the far end (left) */
        var g = c.createLinearGradient(sx, sy, ex, ey);
        for (var s = 0; s <= 4; s++) {
          var f = s / 4, px = sx - L * f * ca, py = sy - L * f * sa;
          var hz = S.burst ? 1 : 0.3 + 0.7 * hazeAt(px - TX, py - TY, t);
          var al = b * (1 - f) * (1 - f) * hz;
          if (al > 1) al = 1;
          var col = f < 0.35 ? "255,190,170" : f < 0.7 ? "255,90,50" : "255,30,0";
          g.addColorStop(f, "rgba(" + col + "," + (al * 0.95).toFixed(3) + ")");
        }
        var hwid = (r.wd + L * r.grow) * (1 + 0.5 * r.fl);        /* half-width at the far end */
        var wx = -sa * hwid, wy = ca * hwid;
        c.fillStyle = g; c.beginPath();
        c.moveTo(sx, sy); c.lineTo(ex + wx, ey + wy); c.lineTo(ex - wx, ey - wy); c.closePath(); c.fill();
      }
      /* 4 the heat shimmer at the knob's edge: the band in front of it is
         copied out and put back one css-px row at a time, each row
         stretched so its right end sits ±A px off — a sinusoid up the band.
         The offset is 0 at the band's left edge (snapped to a device px, so
         the copy is exact there and there is no seam); the copy is 2 px
         wider than what is cleared, so a row pulled left still covers it. */
      var bx = Math.round((TX + S.kxT - BW) * DPR) / DPR, by = y0, bw = BW, bh = ih;
      if (bx > x0 && !S.burst && inten > 0.05) {
        var A = 0.9 * inten * fade;
        c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
        var sxD = Math.round(bx * DPR), syD = Math.round(by * DPR), bwD = Math.round((bw + 2) * DPR), bhD = Math.round(bh * DPR), rD = Math.round(DPR);
        bCtx.clearRect(0, 0, band.width, band.height);
        bCtx.drawImage(cv, sxD, syD, bwD, bhD, 0, 0, bwD, bhD);
        c.clearRect(bx, by, bw, bh);
        for (i = 0; i < bh; i++) {
          var dx = A * Math.sin(i * clk.shimK + t * clk.shimW + clk.shimPh);
          c.drawImage(band, 0, i * rD, bwD, rD, bx, by + i, bw + 2 + dx, 1);
        }
      }
      /* 5 the dust: sharp, sparse, lit by the ray field where it is */
      c.globalCompositeOperation = "lighter";
      for (i = 0; i < dust.length; i++) {
        var q = dust[i], tt = q.life / q.ttl;
        var hd = Math.pow(heatL(S.kxT - q.x), 0.7) * inten * q.br;
        var rf = 0.04 + 0.96 * rayField(q.x, q.y);
        var al2 = Math.sin(tt * 3.1416) * hd * rf * (0.6 + 0.4 * Math.sin(q.life * q.w + q.ph));
        if (al2 <= 0.02) continue;
        c.globalAlpha = Math.min(1, al2);
        c.fillStyle = "rgb(255,214,196)";
        c.fillRect(TX + q.x - q.r, TY + q.y - q.r, q.r * 2, q.r * 2);
      }
      /* 6 the core: pink-white with a whisper of amber, hugging the knob's
         edge; its radius and its alpha breathe with the pulse */
      var kcx = TX + S.kxT + S.KR, kcy = TY + S.kyT, KR = S.KR, RO = (KR + 31) * pulse;
      var cg = c.createRadialGradient(kcx, kcy, Math.max(0, KR - 2), kcx, kcy, RO);
      var ci = Math.min(1, S.inten) * (S.cooling ? Math.max(0, 1 - S.shift / 60) : 1) * pulse;
      cg.addColorStop(0, "rgba(255,232,206," + Math.min(1, 0.95 * ci).toFixed(3) + ")");
      cg.addColorStop(0.15, "rgba(255,196,170," + Math.min(1, 0.76 * ci).toFixed(3) + ")");
      cg.addColorStop(0.40, "rgba(255,90,60," + Math.min(1, 0.40 * ci).toFixed(3) + ")");
      cg.addColorStop(1, "rgba(255,38,0,0)");
      c.globalAlpha = 1; c.fillStyle = cg;
      c.beginPath(); c.arc(kcx, kcy, RO, 0, 6.2832); c.fill();
      c.globalCompositeOperation = "source-over";
      return lit;
    }
    /* QA: flare a ray now (the next scheduled one is pushed back) */
    function flareNow(i) {
      if (!rays.length) return -1;
      i = (i === undefined || i < 0 || i >= rays.length) ? Math.floor(rnd() * rays.length) : i | 0;
      clk.flareRay = i; clk.flareT0 = simT; clk.flareNext = simT + 4 + rnd() * 5;
      return i;
    }
    return { name: "light", resize: resize, reset: reset, step: step, draw: draw, busy: busy, heat: heatL, staticFrame: staticFrame,
             flare: flareNow,
             stats: function () {
               var fl = -1, mx = 0; for (var i = 0; i < rays.length; i++) if (rays[i].fl > mx) { mx = rays[i].fl; fl = i; }
               return { dust: dust.length, rays: rays.length, flare: fl, pulse: +pulse.toFixed(3), t: +simT.toFixed(2), cells: FW + "x" + FH };
             } };
  })();
  R = LIGHT;

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
    rayFlare: function (i) { return R.flare(i); },     /* QA: flare one ray now */
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
      var o = { amp: +amp.toFixed(3), vel: Math.round(vel), heat: +meanHeat.toFixed(3), cols: Math.round(litCols),
                shift: Math.round(coolShift), cooling: cooling, raf: !!raf, kg: knobGlow < 0 ? 0 : +knobGlow.toFixed(3),
                ms: +fireMs.toFixed(2), msMax: +fireMax.toFixed(2) };
      var s = R ? R.stats() : {};
      for (var k in s) o[k] = s[k];
      return o;
    }
  };

  function boot() {
    sizeFlame();
    if (reduce.matches) drawStatic();
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
