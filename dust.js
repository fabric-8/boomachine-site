/* =========================================================================
   dust.js (v7) — dust in the story: the second mote canvas.

   The client: "add more particles/dust ... around the headers in the phone
   scroll section". One canvas, `.story-motes`, first child of #chapters:
   CSS-sticky, one viewport tall, so it sits in the chapters column (over the
   copy on a phone) for the whole story and holds its pixels while the
   chapters scroll through it. ~90 motes drift slowly in the red light,
   concentrated around each heading sign: the DENSITY at a point is a soft
   falloff from the nearest heading's box (its h2, widened by 40 px, taller
   by 70 px, then a gaussian tail of ~130 x 110 px); a mote's alpha is its
   own alpha x the density where it is, and motes respawn by sampling that
   density around the headings that are on screen. The headings' rects (and
   the canvas's own) are re-read on scroll — a flag, read at most once per
   30 fps frame, three getBoundingClientRects — so the cloud follows the
   headings as they move and thins out where a heading has left.

   The look is the hero's: booFx.sprites() (the same 24 px red sprites,
   `lighter`, 30 fps, one rAF). Paused while the story is off screen (IO on
   #chapters) and when the tab is hidden; one still frame under reduced
   motion. ?fx=-motes (the hero's switchboard token) turns it off too.

   v9 — THE LIGHT THE TEXT PASSES THROUGH (Fab: "a bit more light
   atmospheric dust particulate light behind the area where the text
   scrolls through"). Two additions to the same system, nothing new that
   runs on its own:
     .story-haze   a sticky, viewport-tall box made here, BEFORE the canvas
                   in #chapters (story.css): a static haze of red light — a
                   soft shaft falling from the bulb's side of the room
                   (above the phone) plus a low pool where the copy is read.
                   Pure CSS gradients, painted once, BEHIND the copy (the
                   chapters are positioned after it); nothing animates it.
                   Its geometry comes from HAZE below and is written into
                   the box's custom properties, so the gradient and the
                   motes' light below are one function.
     beam motes    a second population on the same canvas, lit by the haze:
                   seeded by rejection-sampling hazeAt(x, y), alpha x the
                   light where they drift, slower and finer than the
                   heading dust. Both populations scale with the canvas
                   area (a phone keeps ~the 90 motes it had, a desktop
                   column gets ~150); same sprites, same 30 fps rAF, same
                   pauses (off screen, hidden tab), one still frame under
                   reduced motion. The canvas stays at DPR <= 2.
   The copy keeps its contrast: the haze peaks at ~#2A0704 behind the text
   (paper #EEE8DF on it: > 13 : 1).

     window.booDust.running()   .count()   .redraw()   .density(x, y)   .haze(x, y)
   ========================================================================= */
(function (global) {
  "use strict";
  var doc = document;
  var cv = doc.querySelector(".story-motes");
  var chapters = doc.getElementById("chapters");
  var hero = doc.querySelector(".hero");
  if (!cv || !chapters) return;
  var ctx = cv.getContext("2d");
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var DPR = Math.min(global.devicePixelRatio || 1, 2);
  var COUNT = 90, STEP = 1000 / 30;
  /* v9: the counts scale with the canvas area (css px^2 per mote) */
  var AREA_H = 6000, AREA_B = 4000, MIN_H = 40, MAX_H = 90, MIN_B = 30, MAX_B = 130;
  var nHead = COUNT, nBeam = 0;
  /* v9: the haze's geometry, as fractions of the canvas box. The shaft is a
     cone from (ax, ay) — above the box, on the phone's side — centred on
     `dir` degrees (clockwise from up: 180 = straight down), `half` degrees
     to its soft edge; it fades in below the box's top and out towards its
     foot (fy0..fy1). The pool is an ellipse (px, py, rx, ry) where the copy
     is read: the column's middle on a desktop, under the phone's foot on a
     phone. `k` is the pool's light against the shaft's, `a` the shaft's
     peak alpha in the CSS. The painted box
     reaches past the column (l .. r, fractions of its width) so the light
     has no edge at the column's side; ax / px / rx are fractions of THAT
     box, the canvas maps into it. */
  var HAZE_D = { l: -0.45, r: 1.25, ax: 0.80, ay: -0.14, dir: 218, half: 9, fy0: 0.04, fy1: 1.00, px: 0.47, py: 0.52, rx: 0.40, ry: 0.40, k: 0.8, a: 0.19 };
  var HAZE_M = { l: -0.25, r: 1.25, ax: 0.70, ay: 0.34, dir: 206, half: 11, fy0: 0.48, fy1: 1.00, px: 0.46, py: 0.80, rx: 0.52, ry: 0.26, k: 0.8, a: 0.24 };
  var phoneMq = global.matchMedia("(max-width: 860px)");
  var HZ = HAZE_D;
  var hazeEl = doc.createElement("div");
  hazeEl.className = "story-haze"; hazeEl.setAttribute("aria-hidden", "true");
  chapters.insertBefore(hazeEl, cv);
  function hazeVars() {
    HZ = phoneMq.matches ? HAZE_M : HAZE_D;
    var s = hazeEl.style;
    s.setProperty("--hz-l", (HZ.l * 100).toFixed(1) + "%"); s.setProperty("--hz-r", ((1 - HZ.r) * 100).toFixed(1) + "%");
    s.setProperty("--hz-ax", (HZ.ax * 100).toFixed(1) + "%"); s.setProperty("--hz-ay", (HZ.ay * 100).toFixed(1) + "%");
    s.setProperty("--hz-from", (HZ.dir - HZ.half * 2) + "deg"); s.setProperty("--hz-h", HZ.half + "deg"); s.setProperty("--hz-a", String(HZ.a));
    s.setProperty("--hz-fy0", (HZ.fy0 * 100).toFixed(1) + "%"); s.setProperty("--hz-fy1", (HZ.fy1 * 100).toFixed(1) + "%");
    s.setProperty("--hz-px", (HZ.px * 100).toFixed(1) + "%"); s.setProperty("--hz-py", (HZ.py * 100).toFixed(1) + "%");
    s.setProperty("--hz-rx", (HZ.rx * 100).toFixed(1) + "%"); s.setProperty("--hz-ry", (HZ.ry * 100).toFixed(1) + "%");
  }
  hazeVars();
  var PADX = 40, PADY = 70, TX = 130, TY = 110;   /* the box growth and the gaussian tails, css px */
  var heads = [].slice.call(chapters.querySelectorAll(".phos"));
  var boxes = [];          /* the headings' boxes in canvas px, this frame */
  var W = 0, H = 0, motes = [], raf = 0, last = 0, dirty = true, seen = false, sprites = null;

  function has() { return !hero || (hero.getAttribute("data-fx") || "").indexOf("motes") >= 0; }

  /* ---------- geometry ---------------------------------------------------- */
  function size() {
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    hazeVars();
    /* v9: the populations scale with the area */
    var area = W * H;
    nHead = Math.round(Math.max(MIN_H, Math.min(MAX_H, area / AREA_H)));
    nBeam = Math.round(Math.max(MIN_B, Math.min(MAX_B, area / AREA_B)));
    var w = Math.round(W * DPR), h = Math.round(H * DPR);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dirty = true;
  }
  function measure() {
    var c = cv.getBoundingClientRect();
    boxes = heads.map(function (h) {
      var r = h.getBoundingClientRect();
      return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height,
               cx: r.left - c.left + r.width / 2, cy: r.top - c.top + r.height / 2 };
    });
    dirty = false;
  }
  /* the density at (x, y): the max over the headings of a soft box falloff */
  function density(x, y) {
    var best = 0;
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var dx = Math.max(0, Math.abs(x - b.cx) - b.w / 2 - PADX) / TX;
      var dy = Math.max(0, Math.abs(y - b.cy) - b.h / 2 - PADY) / TY;
      var d = Math.exp(-(dx * dx + dy * dy) * 1.8);
      if (d > best) best = d;
    }
    return best;
  }
  /* v9: the haze's light at (x, y), canvas px, 0..1 — the same shape the
     CSS gradient paints (story.css .story-haze): the shaft's angular
     falloff x its vertical fade, or the pool, whichever is brighter */
  function hazeAt(x, y) {
    if (!(W > 0) || !(H > 0)) return 0;
    var bw = (HZ.r - HZ.l) * W;                          /* the painted box's width */
    var u = (x / W - HZ.l) / (HZ.r - HZ.l), v = y / H;
    var dx = (u - HZ.ax) * bw, dy = (v - HZ.ay) * H;
    var th = Math.atan2(dx, -dy) * 57.29578; if (th < 0) th += 360;
    var a = (th - HZ.dir) / HZ.half;
    var shaft = Math.exp(-a * a * 1.1);
    var f = v < HZ.fy0 ? 0 : v > HZ.fy1 ? 0 : Math.min(1, (v - HZ.fy0) / 0.18) * Math.min(1, (HZ.fy1 - v) / 0.3);
    shaft *= f;
    var px = (u - HZ.px) / HZ.rx, py = (v - HZ.py) / HZ.ry;
    var d = Math.sqrt(px * px + py * py);
    var pool = d >= 1 ? 0 : (1 - d) * (1 - d) * HZ.k;
    return shaft > pool ? shaft : pool;
  }
  /* a heading is a spawn site while any of its dust region is on the canvas */
  function sites() {
    var s = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var top = b.y - PADY - TY, bot = b.y + b.h + PADY + TY;
      if (bot < 0 || top > H) continue;
      s.push(b);
    }
    return s;
  }

  /* ---------- the motes ----------------------------------------------------- */
  /* v9: a beam mote — anywhere in the light, sampled by it */
  function seedBeam(p, first) {
    var x, y, n = 0;
    do { x = Math.random() * W; y = Math.random() * H; n++; } while (Math.random() > hazeAt(x, y) && n < 10);
    p.beam = 1; p.dead = 0;
    p.x = x; p.y = first ? y : Math.min(y + 16, H + 8);
    p.s = 0.8 + Math.pow(Math.random(), 2.0) * 2.8;       /* 0.8-3.6 px, skewed fine */
    p.a = 0.36 + Math.random() * 0.6;
    p.vx = (Math.random() - 0.5) * 4;                     /* drifting in still air, slower */
    p.vy = -(0.6 + Math.random() * 2.8);
    p.w = 0.1 + Math.random() * 0.35; p.ph = Math.random() * 6.283;
    p.k = Math.random() < 0.45 ? 1 : 0;                   /* more of the hot sprite: lit */
    p.tk = 0.2 + Math.random() * 0.4; p.tr = 0.3 + Math.random() * 0.8; p.tp = Math.random() * 6.283;
    p.dim = 0;
    return p;
  }
  /* v9: the light a mote catches: heading dust by the headings' density,
     beam dust by the haze */
  function lightOf(p) { return p.beam ? hazeAt(p.x, p.y) : density(p.x, p.y); }
  function seed(p, first) {
    if (p.beam) return seedBeam(p, first);
    var s = sites();
    if (!s.length) { p.x = -99; p.y = -99; p.dead = 1; return p; }
    var b = s[(Math.random() * s.length) | 0];
    /* rejection-sample the density around the box (a few tries at most) */
    var x, y, n = 0;
    do {
      x = b.cx + (Math.random() * 2 - 1) * (b.w / 2 + PADX + TX);
      y = b.cy + (Math.random() * 2 - 1) * (b.h / 2 + PADY + TY);
      n++;
    } while (Math.random() > density(x, y) && n < 8);
    p.x = x; p.y = first ? y : Math.min(y + 20, H + 10);
    p.dead = 0;
    p.s = 0.7 + Math.pow(Math.random(), 1.7) * 3.0;      /* 0.7-3.7 px, skewed small */
    p.a = 0.28 + Math.random() * 0.55;
    p.vx = (Math.random() - 0.5) * 7;                     /* px/s sideways */
    p.vy = -(1.5 + Math.random() * 4.5);                  /* px/s upward, slow */
    p.w = 0.15 + Math.random() * 0.5; p.ph = Math.random() * 6.283;
    p.k = Math.random() < 0.34 ? 1 : 0;
    p.tk = 0.14 + Math.random() * 0.34; p.tr = 0.26 + Math.random() * 0.62; p.tp = Math.random() * 6.283;
    p.dim = 0;                                            /* seconds spent invisible */
    return p;
  }
  function fill() {
    if (!sprites && global.booFx && global.booFx.sprites) sprites = global.booFx.sprites();
    /* v9: nHead heading motes + nBeam beam motes (size() sets both) */
    if (motes.length !== nHead + nBeam) {
      motes = [];
      for (var i = 0; i < nHead; i++) motes.push(seed({}, true));
      for (var j = 0; j < nBeam; j++) motes.push(seedBeam({}, true));
    }
  }
  function step(dt, ts) {
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      if (p.dead) { if (Math.random() < 0.2) seed(p, true); continue; }
      p.x += (p.vx + Math.sin(ts / 1000 * p.w + p.ph) * 3) * dt;
      p.y += p.vy * dt;
      var d = lightOf(p);
      if (d < 0.03) { p.dim += dt; if (p.dim > 0.8) seed(p, false); }
      else p.dim = 0;
      if (p.y < -20 || p.x < -20 || p.x > W + 20) seed(p, false);
    }
  }
  function paint(ts) {
    if (!sprites) return;
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      if (p.dead) continue;
      var tw = 1 - p.tk * (0.5 + 0.5 * Math.sin(ts / 1000 * p.tr + p.tp));
      var a = p.a * lightOf(p) * (0.72 + 0.28 * Math.sin(ts / 1000 * p.w * 3 + p.ph)) * tw;
      if (a > 0.004) {
        var d = p.s * 2.7;
        ctx.globalAlpha = a;
        ctx.drawImage(sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (!last) last = ts;
    var dt = ts - last;
    if (dt < STEP - 2) return;
    last = ts;
    if (!has()) return;
    if (dirty) measure();
    step(Math.min(dt, 80) / 1000, ts);
    paint(ts);
  }
  function start() {
    if (!has()) { stop(); ctx.clearRect(0, 0, W, H); return; }
    fill();
    if (reduce.matches) { measure(); last = 0; paint(0); return; }   /* one still frame */
    if (!seen) return;
    if (!raf) { last = 0; raf = global.requestAnimationFrame(frame); }
  }
  function stop() { if (raf) { global.cancelAnimationFrame(raf); raf = 0; } }

  /* ---------- wiring ------------------------------------------------------- */
  global.addEventListener("scroll", function () { dirty = true; }, { passive: true });
  var rz = 0;
  global.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { size(); fill(); start(); }, 90); }, { passive: true });
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) stop(); else start(); });
  if ("IntersectionObserver" in global) {
    new IntersectionObserver(function (es) {
      seen = es[es.length - 1].isIntersecting;
      if (seen) start(); else stop();
    }, { threshold: 0, rootMargin: "-2px 0px -2px 0px" }).observe(chapters);   /* the story starts AT the fold: edge contact is not "on screen" */
  } else seen = true;
  reduce.addEventListener("change", function () { stop(); start(); });
  /* the hero's switchboard (booFx.on/off('motes')) flips data-fx; follow it */
  if (hero && "MutationObserver" in global) new MutationObserver(function () { start(); }).observe(hero, { attributes: true, attributeFilter: ["data-fx"] });

  size(); fill(); start();
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { size(); dirty = true; if (reduce.matches) start(); });
  global.addEventListener("load", function () { size(); dirty = true; if (reduce.matches) start(); });

  global.booDust = {
    running: function () { return !!raf; },
    count: function () { return motes.length; },
    redraw: function () { size(); measure(); fill(); if (reduce.matches) paint(0); },
    density: density,
    haze: hazeAt,
    counts: function () { return { head: nHead, beam: nBeam }; },
    boxes: function () { if (dirty) measure(); return boxes; },
    visible: function () { var n = 0; for (var i = 0; i < motes.length; i++) if (!motes[i].dead && lightOf(motes[i]) > 0.03) n++; return n; }
  };
})(window);
