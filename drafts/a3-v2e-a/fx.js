/* =========================================================================
   fx.js (v2d) — the two atmosphere effects that need a canvas, plus the
   data-fx switchboard. Loaded after disc.js/title.js; touches nothing they own.

     window.booFx.list()        -> ["refl","grain",...]
     window.booFx.on(name) / .off(name) / .toggle(name)
     window.booFx.set("grain motes")   .only("refl")   .all()   .none()
     window.booFx.redraw()      re-measure and repaint (after a font swap etc.)
     window.booFx.geom()        the measured numbers, for QA
     ?fx=none | all | refl,grain | -grain,-motes       (same, from the URL)

   1. THE TITLE'S REFLECTION  (.d-refl, one canvas per .lbox)
      The title is rendered once into an offscreen canvas with the same font
      and size, flipped vertically about the disc centre, squashed toward it
      (a reflection in a surface tilted away from the viewer is compressed),
      blurred 6 px, tinted red and faded with distance from the mirror line.
      It is redrawn only on resize / font load — never per frame. The slide
      with --px/--py is a CSS transform, exactly like .d-spec.

   2. DUST MOTES  (.fx-motes, one canvas over the hero)
      ~34 soft particles drifting up and sideways, their opacity multiplied by
      the same elliptical falloff as the red halo (measured off .rl-halo), so
      they only exist where the light is. 30 fps, one rAF, paused when the tab
      is hidden, drawn once and left alone under reduced motion.
   ========================================================================= */
(function (global) {
  "use strict";

  var doc = document;
  var hero = doc.querySelector(".hero");
  if (!hero) return;

  var ALL = ["refl", "grain", "motes", "spill", "plate", "topglow", "buzz"];
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var DPR = Math.min(global.devicePixelRatio || 1, 3);

  /* ---------- the switchboard ------------------------------------------- */
  function list() {
    return (hero.getAttribute("data-fx") || "").split(/\s+/).filter(Boolean);
  }
  function write(arr) {
    hero.setAttribute("data-fx", arr.join(" "));
    kick();
    return list();
  }
  function has(n) { return list().indexOf(n) >= 0; }
  function on(n) { var a = list(); if (a.indexOf(n) < 0) a.push(n); return write(a); }
  function off(n) { return write(list().filter(function (x) { return x !== n; })); }

  function parse(str) {
    var t = String(str).trim().toLowerCase();
    if (!t || t === "none" || t === "off") return [];
    if (t === "all") return ALL.slice();
    var parts = t.split(/[\s,+]+/).filter(Boolean);
    var minus = parts.every(function (p) { return p.charAt(0) === "-"; });
    if (minus) {                       /* ?fx=-grain -> everything but grain */
      var drop = parts.map(function (p) { return p.slice(1); });
      return ALL.filter(function (x) { return drop.indexOf(x) < 0; });
    }
    return parts.filter(function (p) { return ALL.indexOf(p) >= 0; });
  }

  try {
    var q = new URLSearchParams(global.location.search);
    if (q.has("fx")) hero.setAttribute("data-fx", parse(q.get("fx")).join(" "));
  } catch (e) {}

  /* ---------- shared measurements --------------------------------------- */
  var G = null;
  function measure() {
    var plane = doc.querySelector(".p-unit");
    var rig = plane && plane.querySelector(".rig");
    var dl = doc.querySelector(".p-light .disc-light");
    var on_ = doc.querySelector(".title .on");
    if (!plane || !rig || !dl || !on_) return null;

    var pr = plane.getBoundingClientRect();                  /* untransformed */
    var Tr = parseFloat(getComputedStyle(dl).width) / 2;     /* layout, not bbox */
    var cx = pr.left + pr.width / 2;
    var cy = pr.top + parseFloat(getComputedStyle(rig).top);
    var t = on_.getBoundingClientRect();
    var cs = getComputedStyle(doc.querySelector(".title"));

    G = {
      Tr: Tr, cx: cx, cy: cy,
      title: { x: t.left, y: t.top, w: t.width, h: t.height, b: t.bottom },
      font: parseFloat(cs.fontSize),
      family: cs.fontFamily,
      hero: hero.getBoundingClientRect()
    };
    return G;
  }

  /* the spill's gradient is placed off the title's own box, in px relative to
     the photographed disc centre; the CSS does the rest inside the unit frame */
  function publishSpill() {
    if (!G) return;
    var r = doc.documentElement.style;
    r.setProperty("--sp-x", (G.title.x + G.title.w / 2 - G.cx).toFixed(2) + "px");
    r.setProperty("--sp-w", G.title.w.toFixed(2) + "px");
    r.setProperty("--sp-y0", (G.title.b - G.cy).toFixed(2) + "px");
  }

  /* ---------- 1. the reflection ----------------------------------------- */
  var KY = 0.38;   /* vertical squash toward the disc centre */
  var KX = 0.94;   /* and a little narrowing with it         */
  var BLUR = 6;    /* css px, in the reflected image         */
  var canvases = [].slice.call(doc.querySelectorAll(".d-refl"));
  var src = doc.createElement("canvas");
  var refl = doc.createElement("canvas");

  function drawRefl() {
    if (!G || !canvases.length) return;
    var Tr = G.Tr, t = G.title;
    if (!(Tr > 0) || !(t.w > 0)) return;

    /* --- the title, once, at its own size --- */
    var pad = Math.round(G.font * 0.36);
    var W = Math.ceil(t.w + pad * 2), H = Math.ceil(t.h + pad * 2);
    src.width = Math.round(W * DPR); src.height = Math.round(H * DPR);
    var s = src.getContext("2d");
    s.setTransform(DPR, 0, 0, DPR, 0, 0);
    s.clearRect(0, 0, W, H);
    s.font = "400 " + G.font + "px " + G.family;
    try { s.letterSpacing = (G.font * 0.006).toFixed(2) + "px"; } catch (e) {}
    s.textAlign = "left"; s.textBaseline = "alphabetic";

    var text = (doc.querySelector(".title").getAttribute("aria-label") || "Boo Machine");
    var m = s.measureText(text);
    var A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
    /* where the DOM puts the baseline inside an inline-block of this
       line-height: half-leading + ascent */
    var base = pad + (t.h - (A + D)) / 2 + A;
    /* v2e: the sign is red, so its reflection is red. Same shape as the sign
       itself — pink-white at the top of the glyph, saturated at the foot. */
    var g = s.createLinearGradient(0, pad, 0, pad + t.h);
    g.addColorStop(0, "#FFB0A2");           /* top of the sign  */
    g.addColorStop(0.62, "#FF4A30");
    g.addColorStop(1, "#C81A10");           /* bottom, nearer the mirror */
    s.fillStyle = g;
    s.fillText(text, pad + (t.w - m.width) / 2, base);

    /* a reflection dies with distance from the mirror line: the title's BOTTOM
       is the near edge, so fade upward through the source */
    s.globalCompositeOperation = "destination-in";
    var f = s.createLinearGradient(0, 0, 0, H);
    f.addColorStop(0, "rgba(0,0,0,.16)");
    f.addColorStop(0.55, "rgba(0,0,0,.62)");
    f.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = f; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = "source-over";

    /* --- flip it about the disc centre, squash, blur, into the disc box --- */
    var side = Math.round(2 * Tr * DPR);
    refl.width = side; refl.height = side;
    var c = refl.getContext("2d");
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, 2 * Tr, 2 * Tr);

    var X0 = t.x - pad, Y0 = t.y - pad;                 /* source box, screen */
    var dw = W * KX, dh = H * KY;
    var dx = Tr + (X0 - G.cx) * KX;
    var dy = Tr + (G.cy - (Y0 + H)) * KY;               /* mirrored top edge   */
    c.save();
    c.filter = "blur(" + BLUR + "px)";
    c.translate(dx, dy + dh);
    c.scale(1, -1);
    c.drawImage(src, 0, 0, dw, dh);
    c.restore();

    for (var i = 0; i < canvases.length; i++) {
      var el = canvases[i];
      el.width = side; el.height = side;
      var k = el.getContext("2d");
      k.clearRect(0, 0, side, side);
      k.drawImage(refl, 0, 0);
    }
    G.refl = { dx: dx, dy: dy, dw: dw, dh: dh, Tr: Tr };
  }

  /* ---------- 2. dust motes --------------------------------------------- */
  var mc = doc.querySelector(".fx-motes");
  var mctx = mc ? mc.getContext("2d") : null;
  var motes = [], halo = null, mw = 0, mh = 0, sprites = null, mraf = 0, mlast = 0;
  var COUNT = 34, STEP = 1000 / 30;

  function sprite(r, gb) {
    var n = 24, cv = doc.createElement("canvas");
    cv.width = cv.height = n;
    var x = cv.getContext("2d");
    var gr = x.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    gr.addColorStop(0, "rgba(" + r + "," + gb + ",1)");
    gr.addColorStop(0.32, "rgba(" + r + "," + gb + ",.55)");
    gr.addColorStop(0.7, "rgba(" + r + "," + gb + ",.12)");
    gr.addColorStop(1, "rgba(" + r + "," + gb + ",0)");
    x.fillStyle = gr; x.fillRect(0, 0, n, n);
    return cv;
  }

  function haloBox() {
    var el = doc.querySelector(".rl-halo");
    if (!el || !G) return null;
    var r = el.getBoundingClientRect(), h = G.hero;
    return {
      x: r.left + r.width / 2 - h.left,
      y: r.top + r.height / 2 - h.top,
      /* .rl-halo's own core gradient is 42% x 42%; stretched down a little so
         the motes reach the hand as well as the sign */
      rx: r.width * 0.42 * 1.10,
      ry: r.height * 0.42 * 1.45
    };
  }

  function seed(p, first) {
    var a = Math.random() * Math.PI * 2, u = Math.sqrt(Math.random());
    p.x = halo.x + Math.cos(a) * u * halo.rx * 1.12;
    p.y = first ? halo.y + Math.sin(a) * u * halo.ry * 1.12
                : halo.y + halo.ry * (0.86 + Math.random() * 0.3);
    p.s = 1 + Math.random() * 2;                 /* 1-3 px core at 1x */
    p.a = 0.30 + Math.random() * 0.58;
    p.vx = (Math.random() - 0.5) * 11;           /* px/s sideways     */
    p.vy = -(4 + Math.random() * 13);            /* px/s upward       */
    p.w = 0.15 + Math.random() * 0.5;            /* wander rate       */
    p.ph = Math.random() * 6.283;
    p.k = Math.random() < 0.34 ? 1 : 0;          /* deep red vs hot pink-red dust */
    return p;
  }

  function sizeMotes() {
    if (!mc || !G) return;
    mw = G.hero.width; mh = G.hero.height;
    mc.width = Math.round(mw * DPR); mc.height = Math.round(mh * DPR);
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    halo = haloBox();
    if (!halo) return;
    if (!sprites) sprites = [sprite(255, "58,44"), sprite(255, "128,104")];   /* v2e: dust in RED light */
    var n = mw < 520 ? 26 : COUNT;
    if (motes.length !== n) {
      motes = [];
      for (var i = 0; i < n; i++) motes.push(seed({}, true));
    }
  }

  function alphaAt(x, y) {
    var dx = (x - halo.x) / halo.rx, dy = (y - halo.y) / halo.ry;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 1) return 0;
    var v = 1 - d;
    return v * (0.42 + 0.58 * v);         /* soft, same shape as the halo */
  }

  function paintMotes(ts) {
    if (!mctx || !halo) return;
    mctx.clearRect(0, 0, mw, mh);
    mctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      var a = p.a * alphaAt(p.x, p.y) * (0.72 + 0.28 * Math.sin(ts / 1000 * p.w * 3 + p.ph));
      if (a > 0.004) {
        var d = p.s * 2.7;
        mctx.globalAlpha = a;
        mctx.drawImage(sprites[p.k], p.x - d / 2, p.y - d / 2, d, d);
      }
    }
    mctx.globalAlpha = 1;
    mctx.globalCompositeOperation = "source-over";
  }

  function stepMotes(dt, ts) {
    for (var i = 0; i < motes.length; i++) {
      var p = motes[i];
      p.x += (p.vx + Math.sin(ts / 1000 * p.w + p.ph) * 4) * dt;
      p.y += p.vy * dt;
      if (p.y < halo.y - halo.ry * 1.2 || p.x < -30 || p.x > mw + 30) seed(p, false);
    }
  }

  function mframe(ts) {
    mraf = global.requestAnimationFrame(mframe);
    if (!mlast) mlast = ts;
    var dt = ts - mlast;
    if (dt < STEP - 2) return;               /* ~30 fps, not 60 */
    mlast = ts;
    if (!has("motes")) { return; }           /* switched off: do no work */
    stepMotes(Math.min(dt, 80) / 1000, ts);
    paintMotes(ts);
  }

  function startMotes() {
    if (!mc) return;
    if (reduce.matches) { mlast = 0; paintMotes(0); return; }   /* one still frame */
    if (!mraf) { mlast = 0; mraf = global.requestAnimationFrame(mframe); }
  }
  function stopMotes() {
    if (mraf) { global.cancelAnimationFrame(mraf); mraf = 0; }
  }

  /* ---------- wiring ----------------------------------------------------- */
  function kick() {                       /* after a switch flip */
    if (has("motes")) startMotes(); else { stopMotes(); if (mctx) mctx.clearRect(0, 0, mw, mh); }
  }

  var pending = 0;
  function redraw() {
    measure(); publishSpill(); drawRefl(); sizeMotes();
    if (reduce.matches) paintMotes(0);
  }
  function relayout() {
    clearTimeout(pending);
    pending = setTimeout(function () { redraw(); kick(); }, 90);
  }

  global.addEventListener("resize", relayout, { passive: true });
  global.addEventListener("orientationchange", relayout, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) stopMotes(); else { mlast = 0; startMotes(); }
  });
  reduce.addEventListener("change", function () { stopMotes(); redraw(); kick(); });

  global.booFx = {
    list: list, has: has, on: on, off: off,
    toggle: function (n) { return has(n) ? off(n) : on(n); },
    set: function (s) { return write(parse(s)); },
    only: function (s) { return write(parse(s)); },
    all: function () { return write(ALL.slice()); },
    none: function () { return write([]); },
    redraw: redraw,
    geom: function () { return G; }
  };

  redraw(); kick();
  /* the webfont decides the title's box: redraw when it actually lands */
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { redraw(); });
  global.addEventListener("load", function () { redraw(); });
})(window);
