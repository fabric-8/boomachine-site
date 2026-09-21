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
      v2e-b: the sign is a photograph, so what the disc reflects is THAT IMAGE,
      not a re-render of the text. .title .signimg is drawn into an offscreen
      canvas at its own on-screen box, faded with distance from the mirror
      line, then flipped about the disc centre, squashed toward it (a
      reflection in a surface tilted away from the viewer is compressed) and
      blurred 3.5 px (v2i; 6 in v2h). Redrawn only on resize / image load —
      never per frame. The slide with --px/--py is a CSS transform, exactly
      like .d-spec.

   2. DUST MOTES  (.fx-motes, one canvas over the hero)
      v2g: ~100 soft particles (75 on a phone) drifting up and sideways, each
      with a slow depth twinkle of its own, their opacity multiplied by
      the same elliptical falloff as the red halo (measured off .rl-halo), so
      they only exist where the light is. 30 fps, one rAF, paused when the tab
      is hidden, drawn once and left alone under reduced motion.
   ========================================================================= */
(function (global) {
  "use strict";

  var doc = document;
  var hero = doc.querySelector(".hero");
  if (!hero) return;

  var ALL = ["refl", "grain", "motes", "spill", "plate", "topglow", "buzz", "hell"];
  /* `hell` (v2f) is owned by slide.css/slide.js; it is listed here so ?fx= and
     window.booFx can switch it with the rest. */
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
    var sg = doc.querySelector(".title .signimg");
    var sr = sg && sg.getBoundingClientRect();

    G = {
      Tr: Tr, cx: cx, cy: cy,
      sign: sr ? { x: sr.left, y: sr.top, w: sr.width, h: sr.height } : null,
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
  /* v2i: the client wants the sign's reflection more visible — roughly
     twice v2h's. Less squash (it covers more of the face), a blur down from
     6 px to 3.5 so the letter shapes read, a lighter fade through the
     source, and the canvas at full opacity (fx.css --refl-op .62 -> 1).
     Measured: max added luminance inside the face +.. /255 (README). */
  var KY = 0.46;   /* vertical squash toward the disc centre (v2h .38) */
  var KX = 0.96;   /* and a little narrowing with it         (v2h .94) */
  var BLUR = 3.5;  /* css px, in the reflected image         (v2h 6)   */
  var canvases = [].slice.call(doc.querySelectorAll(".d-refl"));
  var src = doc.createElement("canvas");

  var signEl = doc.querySelector(".title .signimg");

  function drawRefl() {
    if (!G || !canvases.length) return;
    var Tr = G.Tr, box = G.sign;
    if (!(Tr > 0) || !box || !(box.w > 0)) return;
    if (!signEl || !signEl.complete || !signEl.naturalWidth) return;

    /* --- the sign, once, at its on-screen size --- */
    var W = Math.ceil(box.w), H = Math.ceil(box.h);
    src.width = Math.round(W * DPR); src.height = Math.round(H * DPR);
    var s = src.getContext("2d");
    s.setTransform(DPR, 0, 0, DPR, 0, 0);
    s.clearRect(0, 0, W, H);
    s.drawImage(signEl, 0, 0, W, H);

    /* a reflection dies with distance from the mirror line: the sign's BOTTOM
       is the near edge, so fade upward through the source */
    s.globalCompositeOperation = "destination-in";
    var f = s.createLinearGradient(0, 0, 0, H);
    f.addColorStop(0, "rgba(0,0,0,.22)");
    f.addColorStop(0.55, "rgba(0,0,0,.66)");
    f.addColorStop(1, "rgba(0,0,0,1)");
    s.fillStyle = f; s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = "source-over";

    /* --- flip it about the disc centre, squash, blur, into the disc box ---
       v2f: ONE canvas per hand, not one copied three times. Each hand carries
       its own --dy (index.html), so its disc centre is at G.cy - dy*Tr while
       the sign stayed put: the mirror line is a different distance away for
       each of them and the reflection has to be drawn that many times. */
    var side = Math.round(2 * Tr * DPR);
    var X0 = box.x, Y0 = box.y;                         /* source box, screen */
    var dw = W * KX, dh = H * KY;
    var dx = Tr + (X0 - G.cx) * KX;
    var last = null;

    for (var i = 0; i < canvases.length; i++) {
      var el = canvases[i];
      var host = el.closest ? el.closest(".lbox") : null;
      var hdy = host ? parseFloat(getComputedStyle(host).getPropertyValue("--dy")) : 0;
      if (!(hdy === hdy)) hdy = 0;                      /* NaN */
      var cyh = G.cy - hdy * Tr;                        /* this hand's disc centre */
      var dy = Tr + (cyh - (Y0 + H)) * KY;              /* mirrored top edge   */

      el.width = side; el.height = side;
      var k = el.getContext("2d");
      k.setTransform(DPR, 0, 0, DPR, 0, 0);
      k.clearRect(0, 0, 2 * Tr, 2 * Tr);
      k.save();
      k.filter = "blur(" + BLUR + "px)";
      k.translate(dx, dy + dh);
      k.scale(1, -1);
      k.drawImage(src, 0, 0, dw, dh);
      k.restore();
      last = { dx: dx, dy: dy, dw: dw, dh: dh, Tr: Tr, dyUnits: hdy };
    }
    G.refl = last;
  }

  /* ---------- 2. dust motes --------------------------------------------- */
  var mc = doc.querySelector(".fx-motes");
  var mctx = mc ? mc.getContext("2d") : null;
  var motes = [], halo = null, mw = 0, mh = 0, sprites = null, mraf = 0, mlast = 0;
  /* v2g: half again as much dust as v2f. 68 -> 100 (52 -> 75 on a phone), and
     every mote now carries a SLOW twinkle of its own on top of the fast one —
     a depth wobble, 0.04-0.15 Hz, 14-48 % deep — so the field reads as motes at
     different distances swimming through the light rather than one sheet of
     specks all breathing together. The draw is still one drawImage per mote
     from a 24 px sprite with `lighter`, at 30 fps. */
  /* v3: ~150 motes on desktop, ~100 on a phone (v2g: 100 / 75) */
  var COUNT = 150, STEP = 1000 / 30;

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
    /* v2f: 1-3 px -> 0.7-4.1 px, skewed small (u^1.7), so most of the new dust
       is finer than the old and a few motes are visibly bigger and closer. */
    p.s = 0.7 + Math.pow(Math.random(), 1.7) * 3.4;
    p.a = 0.30 + Math.random() * 0.58;
    p.vx = (Math.random() - 0.5) * 11;           /* px/s sideways     */
    p.vy = -(4 + Math.random() * 13);            /* px/s upward       */
    p.w = 0.15 + Math.random() * 0.5;            /* wander rate       */
    p.ph = Math.random() * 6.283;
    p.k = Math.random() < 0.34 ? 1 : 0;          /* deep red vs hot pink-red dust */
    /* v2g: the depth twinkle. tk = how deep it goes, tr = how slow (rad/s),
       tp = its own phase, so no two motes wobble together. */
    p.tk = 0.14 + Math.random() * 0.34;
    p.tr = 0.26 + Math.random() * 0.62;
    p.tp = Math.random() * 6.283;
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
    var n = mw < 520 ? 100 : COUNT;
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
      /* two wobbles: the fast shimmer v2d had, and v2g's slow depth twinkle */
      var tw = 1 - p.tk * (0.5 + 0.5 * Math.sin(ts / 1000 * p.tr + p.tp));
      var a = p.a * alphaAt(p.x, p.y) * (0.72 + 0.28 * Math.sin(ts / 1000 * p.w * 3 + p.ph)) * tw;
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

  /* v3: the page continues below the hero. Off screen, the dust does no
     work at all (heroSeen, from one IntersectionObserver on the hero). */
  var heroSeen = true;
  function startMotes() {
    if (!mc) return;
    if (reduce.matches) { mlast = 0; paintMotes(0); return; }   /* one still frame */
    if (!heroSeen) return;
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
  if ("IntersectionObserver" in global) {
    new IntersectionObserver(function (es) {
      heroSeen = es[es.length - 1].isIntersecting;
      if (heroSeen) { if (has("motes")) startMotes(); } else stopMotes();
    }, { threshold: 0 }).observe(hero);
  }
  reduce.addEventListener("change", function () { stopMotes(); redraw(); kick(); });

  global.booFx = {
    list: list, has: has, on: on, off: off,
    toggle: function (n) { return has(n) ? off(n) : on(n); },
    set: function (s) { return write(parse(s)); },
    only: function (s) { return write(parse(s)); },
    all: function () { return write(ALL.slice()); },
    none: function () { return write([]); },
    redraw: redraw,
    geom: function () { return G; },
    running: function () { return !!mraf; }   /* QA: the motes loop is off while the hero is off screen */
  };

  redraw(); kick();
  /* the webfont decides the title's BOX and the photograph is sized off it, so
     both have to have landed before the reflection is right */
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { redraw(); });
  if (signEl) {
    if (signEl.complete && signEl.naturalWidth) redraw();
    else signEl.addEventListener("load", function () { redraw(); }, { once: true });
  }
  global.addEventListener("load", function () { redraw(); });
})(window);
