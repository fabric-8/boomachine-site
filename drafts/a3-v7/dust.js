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

     window.booDust.running()   .count()   .redraw()   .density(x, y)
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
  var PADX = 40, PADY = 70, TX = 130, TY = 110;   /* the box growth and the gaussian tails, css px */
  var heads = [].slice.call(chapters.querySelectorAll(".phos"));
  var boxes = [];          /* the headings' boxes in canvas px, this frame */
  var W = 0, H = 0, motes = [], raf = 0, last = 0, dirty = true, seen = false, sprites = null;

  function has() { return !hero || (hero.getAttribute("data-fx") || "").indexOf("motes") >= 0; }

  /* ---------- geometry ---------------------------------------------------- */
  function size() {
    var r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
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
  function seed(p, first) {
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
    if (motes.length !== COUNT) { motes = []; for (var i = 0; i < COUNT; i++) motes.push(seed({}, true)); }
  }
  function step(dt, ts) {
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      if (p.dead) { if (Math.random() < 0.2) seed(p, true); continue; }
      p.x += (p.vx + Math.sin(ts / 1000 * p.w + p.ph) * 3) * dt;
      p.y += p.vy * dt;
      var d = density(p.x, p.y);
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
      var a = p.a * density(p.x, p.y) * (0.72 + 0.28 * Math.sin(ts / 1000 * p.w * 3 + p.ph)) * tw;
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
    boxes: function () { if (dirty) measure(); return boxes; },
    visible: function () { var n = 0; for (var i = 0; i < motes.length; i++) if (!motes[i].dead && density(motes[i].x, motes[i].y) > 0.03) n++; return n; }
  };
})(window);
