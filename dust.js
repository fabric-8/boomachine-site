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

   v11 perf — THE LIGHT AS PICTURES, THE DUST AT 1.5x ON A PHONE, NO rAF
   UNDER A FINGER. paintHaze() paints the haze's own gradients (the stops,
   the eased vertical fade and the geometry the CSS uses, from HAZE / RAYS)
   once, at half the css resolution, into three <img>s — the shaft, the
   rays, the pool; one combined picture on a touch screen, where the light
   holds still — and story.css shows those instead of the CSS gradients
   (.story-haze.is-img). The compositor scales them up: WebKit keeps an
   <img> on its own layer as the image itself, so the light that was a
   viewport-tall 3x bitmap on an iPhone (16 MB; 3 x ~31 MB of layers on a
   desktop) is a 275 x 422 picture, and nothing rasters seven conic
   gradients through a mask any more. Repainted only when the box changes
   size. The mote canvas stays at DPR 2 on a desktop and goes to 1.5 on a
   touch screen (the sprites are soft 24 px gradients drawn 2-10 px wide;
   1.5x has 44 % fewer pixels to clear and composite per frame). While a
   finger scrolls the loop does not even ask for frames (v10 held the
   pixels but kept a rAF running); the quiet timer restarts it.

   v12 — THE PHONE LAYOUT (<= 860 px, story.css) has no haze: the phone-in-
   hand clips' black would cut rectangles out of it. There the pictures are
   not painted and there are no beam motes; the heading dust stays.

     window.booDust.running()   .count()   .redraw()   .density(x, y)   .haze(x, y)
     .hazeImg()   the pictures' state: mode, size, painted ms
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
  /* v11 perf: 1.5x on a touch screen (header) */
  var touchDev = global.matchMedia("(hover: none) and (pointer: coarse)");
  var DPR = Math.min(global.devicePixelRatio || 1, touchDev.matches ? 1.5 : 2);
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
  /* v10: MORE RAYS (Fab: "I like the light-ray effect in the sections —
     maybe a few more rays"). Narrow shafts fanned around the main one from
     the same source, as if the bulb's light fell through a slatted shutter:
     o = the ray's angle off `dir`, h its half-width (deg), a its peak
     against the main shaft's. They are one extra layer (.hz-rays, a stack
     of conic gradients written here) that sways slowly about the source
     (story.css), and the beam motes are lit by them too (hazeAt). */
  var RAYS_D = [{ o: -25, h: 2.2, a: .34 }, { o: -15, h: 1.3, a: .62 }, { o: -8, h: .9, a: .78 },
                { o: 5, h: 1.2, a: .66 }, { o: 12, h: 2.0, a: .46 }, { o: 20, h: 1.0, a: .40 }, { o: 29, h: 1.8, a: .26 }];
  var RAYS_M = [{ o: -20, h: 2.0, a: .36 }, { o: -11, h: 1.2, a: .66 }, { o: 7, h: 1.4, a: .6 }, { o: 16, h: 1.1, a: .44 }, { o: 25, h: 2.0, a: .28 }];
  var phoneMq = global.matchMedia("(max-width: 860px)");
  var HZ = HAZE_D, RAYS = RAYS_D;
  var hazeEl = doc.createElement("div");
  hazeEl.className = "story-haze"; hazeEl.setAttribute("aria-hidden", "true");
  var raysEl = doc.createElement("span");
  raysEl.className = "hz-rays";
  hazeEl.appendChild(raysEl);
  chapters.insertBefore(hazeEl, cv);
  /* the soft profile of one shaft, the same gaussian hazeAt uses:
     exp(-1.1 a^2) at a = 0, .5, 1, 1.5, 2, 2.5 half-widths */
  var PROF = [[0, 1], [.5, .76], [1, .33], [1.5, .084], [2, .012], [2.5, 0]];
  function conic(from, h, alpha) {
    var c = "rgba(var(--hz-c),", st = [], i;
    for (i = PROF.length - 1; i > 0; i--) st.push(c + (alpha * PROF[i][1]).toFixed(4) + ") " + ((2.5 - PROF[i][0]) * h).toFixed(2) + "deg");
    for (i = 0; i < PROF.length; i++) st.push(c + (alpha * PROF[i][1]).toFixed(4) + ") " + ((2.5 + PROF[i][0]) * h).toFixed(2) + "deg");
    return "conic-gradient(from " + from.toFixed(2) + "deg at var(--hz-ax) var(--hz-ay), " + st.join(", ") + ")";
  }
  function hazeVars() {
    HZ = phoneMq.matches ? HAZE_M : HAZE_D;
    RAYS = phoneMq.matches ? RAYS_M : RAYS_D;
    raysEl.style.backgroundImage = RAYS.map(function (r) { return conic(HZ.dir + r.o - 2.5 * r.h, r.h, HZ.a * r.a); }).join(", ");
    var s = hazeEl.style;
    s.setProperty("--hz-l", (HZ.l * 100).toFixed(1) + "%"); s.setProperty("--hz-r", ((1 - HZ.r) * 100).toFixed(1) + "%");
    s.setProperty("--hz-ax", (HZ.ax * 100).toFixed(1) + "%"); s.setProperty("--hz-ay", (HZ.ay * 100).toFixed(1) + "%");
    s.setProperty("--hz-from", (HZ.dir - HZ.half * 2.5) + "deg"); s.setProperty("--hz-h", HZ.half + "deg"); s.setProperty("--hz-a", String(HZ.a));
    s.setProperty("--hz-fy0", (HZ.fy0 * 100).toFixed(1) + "%"); s.setProperty("--hz-fy1", (HZ.fy1 * 100).toFixed(1) + "%");
    s.setProperty("--hz-px", (HZ.px * 100).toFixed(1) + "%"); s.setProperty("--hz-py", (HZ.py * 100).toFixed(1) + "%");
    s.setProperty("--hz-rx", (HZ.rx * 100).toFixed(1) + "%"); s.setProperty("--hz-ry", (HZ.ry * 100).toFixed(1) + "%");
  }
  hazeVars();

  /* ---------- v11 perf: the haze as pictures ------------------------------ */
  /* the same gradients story.css paints, drawn with the canvas API: a CSS
     conic gradient starts at 12 o'clock and a canvas one at 3, both run
     clockwise; the CSS ellipse is a circle under a y-scale; the mask is a
     destination-in fill of the same eased stops (with the CSS fix-up: a
     stop may not sit before the one above it). All stops share one RGB,
     so premultiplied (CSS) and straight (canvas) interpolation agree. */
  var canConic = !!(global.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype.createConicGradient);
  var HZ_S = 0.5;                                         /* picture px per css px */
  var hzImgs = {}, hzKey = "", hzStat = { mode: canConic ? "pending" : "css", w: 0, h: 0, ms: 0 };
  var FADE = [[0, 0], [5, .10], [11, .50], [17, .90], [22, 1]];      /* after fy0 */
  var FADE1 = [[-34, 1], [-26, .90], [-17, .50], [-8, .10], [0, 0]]; /* before fy1 */
  var CONIC = [[0, 0], [.5, .012], [1, .084], [1.5, .33], [2, .76], [2.5, 1], [3, .76], [3.5, .33], [4, .084], [4.5, .012], [5, 0]];
  function hzImg(cls) {
    if (hzImgs[cls]) return hzImgs[cls];
    var im = doc.createElement("img");
    im.className = "hz-img " + cls; im.alt = ""; im.decoding = "async";
    im.setAttribute("aria-hidden", "true");
    hazeEl.appendChild(im);
    return (hzImgs[cls] = im);
  }
  function conicFill(x, bw, bh, from, h, alpha, rgb) {
    var g = x.createConicGradient((from - 90) * Math.PI / 180, HZ.ax * bw, HZ.ay * bh);
    for (var i = 0; i < CONIC.length; i++) g.addColorStop(Math.min(1, CONIC[i][0] * h / 360), "rgba(" + rgb + "," + (alpha * CONIC[i][1]).toFixed(5) + ")");
    x.fillStyle = g; x.fillRect(0, 0, bw, bh);
  }
  function fadeMask(x, bw, bh) {
    var g = x.createLinearGradient(0, 0, 0, bh), at = -1e9, i, p;
    var st = FADE.map(function (f) { return [HZ.fy0 * 100 + f[0], f[1]]; }).concat(FADE1.map(function (f) { return [HZ.fy1 * 100 + f[0], f[1]]; }));
    for (i = 0; i < st.length; i++) {
      p = Math.max(at, st[i][0]); at = p;                /* the CSS fix-up */
      g.addColorStop(Math.max(0, Math.min(1, p / 100)), "rgba(0,0,0," + st[i][1] + ")");
    }
    x.globalCompositeOperation = "destination-in";
    x.fillStyle = g; x.fillRect(0, 0, bw, bh);
    x.globalCompositeOperation = "source-over";
  }
  function poolFill(x, bw, bh, pa) {
    var rx = HZ.rx * bw, ry = HZ.ry * bh;
    x.save();
    x.translate(HZ.px * bw, HZ.py * bh); x.scale(1, ry / rx);
    var g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    [[0, 1], [.30, .62], [.55, .30], [.78, .09], [1, 0]].forEach(function (s) { g.addColorStop(s[0], "rgba(128,20,10," + (pa * s[1]).toFixed(5) + ")"); });
    x.fillStyle = g; x.fillRect(-rx, -rx, 2 * rx, 2 * rx);
    x.restore();
  }
  function paintHaze() {
    if (!canConic || !(W > 0) || !(H > 0) || phoneMq.matches) return;   /* v12: no haze in the phone layout */
    var one = touchDev.matches || reduce.matches;          /* the light holds still: one picture */
    var bw = (HZ.r - HZ.l) * W, bh = H;
    var cw = Math.max(2, Math.round(bw * HZ_S)), ch = Math.max(2, Math.round(bh * HZ_S));
    var key = [one, cw, ch, HZ === HAZE_M].join();
    if (key === hzKey) return;
    hzKey = key;
    var t0 = global.performance ? performance.now() : 0;
    var cs = getComputedStyle(hazeEl);
    var rgb = (cs.getPropertyValue("--hz-c") || "196,44,24").trim(), pa = parseFloat(cs.getPropertyValue("--hz-pa")) || .17;
    function layer(draw) {
      var c = doc.createElement("canvas"); c.width = cw; c.height = ch;
      var x = c.getContext("2d"); x.scale(cw / bw, ch / bh);
      draw(x); return c;
    }
    function shaft(x) { conicFill(x, bw, bh, HZ.dir - HZ.half * 2.5, HZ.half, HZ.a, rgb); }
    function rays(x) { RAYS.forEach(function (r) { conicFill(x, bw, bh, HZ.dir + r.o - 2.5 * r.h, r.h, HZ.a * r.a, rgb); }); }
    var want = one
      ? { "hz-all": layer(function (x) { shaft(x); rays(x); fadeMask(x, bw, bh); poolFill(x, bw, bh, pa); }) }
      : { "hz-shaft-i": layer(function (x) { shaft(x); fadeMask(x, bw, bh); }),
          "hz-rays-i": layer(function (x) { rays(x); fadeMask(x, bw, bh); }),
          "hz-pool-i": layer(function (x) { poolFill(x, bw, bh, pa); }) };
    hzStat = { mode: one ? "one" : "three", w: cw, h: ch, ms: +((global.performance ? performance.now() : 0) - t0).toFixed(1) };
    var names = Object.keys(want), left = names.length, my = key;
    /* the pictures swap in together, once all of them have loaded */
    names.forEach(function (n) {
      want[n].toBlob(function (b) {
        if (my !== hzKey || !b) return;
        var im = hzImg(n), url = global.URL.createObjectURL(b), old = im.getAttribute("data-url");
        im.onload = function () {
          if (old) global.URL.revokeObjectURL(old);
          /* decoded before it is shown: no frame without the light */
          var done = function () {
            if (--left || my !== hzKey) return;
            Object.keys(hzImgs).forEach(function (k) { hzImgs[k].classList.toggle("is-set", names.indexOf(k) >= 0); });
            hazeEl.classList.add("is-img");
          };
          if (im.decode) im.decode().then(done, done); else done();
        };
        im.setAttribute("data-url", url); im.src = url;
      }, "image/png");
    });
  }
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
    paintHaze();                                           /* v11 perf: only when the box changed */
    var area = W * H;
    nHead = Math.round(Math.max(MIN_H, Math.min(MAX_H, area / AREA_H)));
    /* v12: the phone layout has no haze (story.css), so no motes lit by it */
    nBeam = phoneMq.matches ? 0 : Math.round(Math.max(MIN_B, Math.min(MAX_B, area / AREA_B)));
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
    /* v10: the rays, added (their alphas are fractions of the shaft's) */
    for (var i = 0; i < RAYS.length; i++) { var ar = (th - HZ.dir - RAYS[i].o) / RAYS[i].h; if (ar > -3 && ar < 3) shaft += RAYS[i].a * Math.exp(-ar * ar * 1.1); }
    if (shaft > 1) shaft = 1;
    /* v10: the vertical fade is eased (story.css), a smoothstep here */
    var f0 = Math.max(0, Math.min(1, (v - HZ.fy0) / 0.22)), f1 = Math.max(0, Math.min(1, (HZ.fy1 - v) / 0.34));
    var f = f0 * f0 * (3 - 2 * f0) * f1 * f1 * (3 - 2 * f1);
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
    /* v11 perf: under a scrolling finger the loop stops asking for frames
       (v10 kept a rAF running and returned); scrollQuiet() restarts it */
    if (quiet) { raf = 0; return; }
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
  /* v10: QUIET WHILE A FINGER SCROLLS (Fab: "micro vertical jitters on the
     hands with the phone" on an iPhone). In iOS WebKit the sticky phone is
     placed by the scrolling thread, but every main-thread layer commit places
     it again with the main thread's (older) scroll offset. This canvas
     repainting at 30 fps committed every other frame during a scroll, so the
     phone swung ~2 pt back and forth frame by frame (measured off Fab's
     recording: -3 / -9 device px, alternating). On a touch screen, while the
     page is scrolling and for 250 ms after, the canvas holds its pixels and
     html.is-scrolling pauses the headings' main-thread flicker
     (heading.css); nothing else in the story commits per frame. */
  var coarse = global.matchMedia("(hover: none) and (pointer: coarse)");
  var root = doc.documentElement, quietT = 0, quiet = false;
  function scrollQuiet() {
    if (!coarse.matches) return;
    if (!quiet) { quiet = true; root.classList.add("is-scrolling"); }
    clearTimeout(quietT);
    quietT = setTimeout(function () { quiet = false; root.classList.remove("is-scrolling"); if (!reduce.matches) start(); }, 250);
  }
  global.addEventListener("scroll", function () { dirty = true; scrollQuiet(); }, { passive: true });
  var rz = 0;
  global.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { size(); fill(); start(); }, 90); }, { passive: true });
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) stop(); else start(); });
  if ("IntersectionObserver" in global) {
    new IntersectionObserver(function (es) {
      seen = es[es.length - 1].isIntersecting;
      hazeEl.classList.toggle("is-offstage", !seen);   /* v10: the light's sway pauses too */
      if (seen) start(); else stop();
    }, { threshold: 0, rootMargin: "-2px 0px -2px 0px" }).observe(chapters);   /* the story starts AT the fold: edge contact is not "on screen" */
  } else seen = true;
  reduce.addEventListener("change", function () { stop(); paintHaze(); start(); });   /* v11: one picture <-> three */
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
    hazeImg: function () { return { stat: hzStat, on: hazeEl.classList.contains("is-img"), imgs: Object.keys(hzImgs).map(function (k) { var i = hzImgs[k]; return k + ":" + i.naturalWidth + "x" + i.naturalHeight + (i.classList.contains("is-set") ? "" : " (off)"); }) }; },
    visible: function () { var n = 0; for (var i = 0; i < motes.length; i++) if (!motes[i].dead && lightOf(motes[i]) > 0.03) n++; return n; }
  };
})(window);
