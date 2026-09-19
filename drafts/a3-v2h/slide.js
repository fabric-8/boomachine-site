/* ==========================================================================
   Boo Machine — slide to join   (v2h: the uncovered track is a furnace window)

   The pointer / capture / drag logic, the keyboard support and the TestFlight
   URL are v2e-b's, carried through v2f and v2g unchanged. What changed is
   what the drag DRIVES.

   v2g trailed a flame off the knob: a ribbon through the knob's history, wisps
   and a warm floor. The client's note: "I want the area BEHIND the slider to
   be filled with fire, so not just a small flame behind the knob, but behind
   that an actual burning inferno sits and fills it."

   So this draft SIMULATES a fire in the space the knob has uncovered — from
   the left cap of the track to the knob's left edge, the whole height of the
   track and ~10 px past its top edge:

     * a 2-D FIRE FIELD, Doom-style: a heat buffer of FW x FH cells over the
       track (cells ~3.25 x 3 css px), whose bottom row is the heat source (a
       bed of embers along the floor) and where every step each cell takes the
       heat of the cell below it, shifted sideways by a noise field and cooled
       by a noise-modulated amount. Low noise = a tongue that climbs the whole
       height; high noise = a gap between tongues. Both noise fields SCROLL
       upward, so the tongues rise, and there is a per-cell random on top;
     * the field is coloured through a palette (black -> deep red -> red ->
       orange -> yellow -> white) into an ImageData, and drawn bilinear at
       device pixel ratio only over the uncovered rect, with a 6 px soft edge
       under the knob. A second, finer (2x) buffer of random hot specks is
       drawn nearest-neighbour on top: the high-frequency flicker;
     * the heat SOURCE is what the drag moves: its right end follows the knob's
       measured left edge, its intensity grows with the travel. New columns
       the knob uncovers are seeded from the burning column beside them, so a
       fast drag does not leave a lag of low fire behind the knob;
     * on release below the threshold the source's right end eases back to
       the left cap over ~600 ms and its intensity dies; the field then burns
       out from the floor up on its own. Nothing fades an alpha;
     * v2g's tongue wisps and the teardrop at the knob's edge are kept, on top
       of the field, so the knob still reads as dragging the fire; v2g's ribbon
       and heat floor are gone (the field IS the body and the floor);
     * embers (sparks) come off the top of the field and leave the track; a
       bloom outside the rails grows with the travel. Both are drawn AFTER the
       track-shaped mask.

   Still published for the CSS, and still registered properties, because the
   spring back on release is a transition and not a script loop:

       --rev   <length>  the knob's right edge = how far it has travelled
       --revp  <number>  the same as 0..1
       --rl-d  on <html>, the room light's multiplier: 1 -> 1.95 (v2g: 1.6)

   QA hook:  ?slide=0.4   park the knob at 40 % and freeze it there
             ?slide=hover / done / flare   (see the README)
   window.booSlide.set(p) / .done() / .reset() / .sweep(on[,speed]) / .progress
   window.booSlide.flame  -> {parts, sparks, amp, vel, heat, cols, src, raf}
   window.booSlide.timescale(k) / .release()   (QA: slow-motion, a real release)
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
    /* v2h: the room opens with the fire — ~1.8 at 85 %, 1.95 at the end */
    root.style.setProperty("--rl-d", (1 + 0.95 * p).toFixed(3));
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
    unpublish();
  }

  /* ---------- completion ------------------------------------------------ */
  function finish(navigate) {
    track.classList.add("done");
    measure(); x = max; place(max);
    track.classList.remove("is-flare"); void track.offsetWidth;
    track.classList.add("is-flare");
    root.style.setProperty("--rl-d", "2");
    burstUntil = now() + 300;                 /* the field goes white with it */
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
    else { rest(); }                          /* the fire collapses: ~600 ms */
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
     THE FIRE
     ====================================================================== */
  var cv = track.querySelector(".hell-flame");
  var ctx = cv ? cv.getContext("2d") : null;
  var mask = null, mctx = null;

  var hovering = false, hasFocus = false, qaAwake = false, qaDrag = false;
  var amp = 0, burstUntil = 0;
  var raf = 0, last = 0, lastKx = null, vel = 0, spawnAcc = 0, sparkAcc = 0;

  /* canvas geometry, in CSS px of the canvas's own box */
  var CW = 0, CH = 0, TX = 0, TY = 0, TW = 0, TH = 0, FEATHER = 12;

  /* --- the field ----------------------------------------------------------
     FW columns across the track, FH rows over the track's height plus OVER
     px above its top edge (the tongues lick past the rail). The cell is
     ~3.25 x 3 css px at 1440 — small enough for visible tongues and edge
     structure at 2x, big enough that the loop is a fraction of a ms. */
  var FW = 0, FH = 0, OVER = 22, OVROWS = 0, CELL_X = 0, CELL_Y = 0, CELL = 1.6;
  var F = null, G = null, lit = null, env = null;   /* heat, its double, lit columns, source envelope */
  var FF = 0, FFH = 0, fimg = null, fCv = null, fCtx = null;   /* the 2x paint buffer */
  var RT = new Float32Array(8192);                             /* a random table for the flicker */
  (function () { for (var i = 0; i < RT.length; i++) RT[i] = Math.random(); })();
  var srcEnd = 0, srcI = 0;                /* the heat source: right end px, intensity */
  var simAcc = 0, SIM = 1 / 60, simT = 0, tscale = 1;   /* tscale: QA slow-motion */
  var meanHeat = 0, litCols = 0, fireMs = 0, fireMax = 0;   /* QA: the fire's own cost */
  var msStep = 0, msPaint = 0, msDraw = 0;                   /* QA: and its parts     */
  var PROF = [0, 0, 0, 0, 0, 0];

  var parts = [], sparks = [];
  var MAXP = 90, MAXS = 14;

  function now() { return performance.now(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* --- value noise, 64 x 64, bilinear, wrapping ---------------------------
     Two samples per cell per step: one shapes the cooling (the tongues), one
     the sideways drift. Both scroll UP with time so the tongues rise. */
  var NT = new Float32Array(64 * 64);
  var rnd = Math.random;                    /* swapped for a seeded one in drawStatic */
  (function () { for (var i = 0; i < NT.length; i++) NT[i] = Math.random(); })();
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

  /* --- the palette: black -> deep red -> red -> orange -> yellow -> white,
         256 entries over heat 0..1.3 (the burst goes past 1 and clamps white) */
  var PAL = (function () {
    var stops = [
      [0.00, 0, 0, 0], [0.06, 44, 4, 1], [0.15, 118, 10, 2], [0.28, 176, 20, 2],
      [0.42, 224, 54, 4], [0.56, 250, 108, 10], [0.70, 255, 160, 24],
      [0.84, 255, 208, 70], [0.95, 255, 240, 150], [1.10, 255, 252, 226],
      [1.30, 255, 255, 250]
    ];
    var out = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var t = i / 255 * 1.3, j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      var a = stops[j], b = stops[j + 1];
      var k = (t - a[0]) / (b[0] - a[0] || 1);
      out[i * 3] = a[1] + (b[1] - a[1]) * k;
      out[i * 3 + 1] = a[2] + (b[2] - a[2]) * k;
      out[i * 3 + 2] = a[3] + (b[3] - a[3]) * k;
    }
    return out;
  })();
  function pal(v) { return ((v < 0 ? 0 : v > 1.3 ? 1.3 : v) / 1.3 * 255) | 0; }

  /* the wisps' own ramp (v2g's), as 48 pre-built rgb strings */
  var RAMP = (function () {
    var stops = [
      [0.00, 255, 252, 244], [0.08, 255, 238, 176], [0.20, 255, 186, 62],
      [0.38, 255, 112, 14], [0.58, 222, 44, 4], [0.78, 108, 14, 6],
      [1.00, 34, 20, 18]
    ];
    var out = [], n = 48;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      var a = stops[j], b = stops[j + 1];
      var k = (t - a[0]) / (b[0] - a[0] || 1);
      out.push("rgb(" + Math.round(a[1] + (b[1] - a[1]) * k) + "," +
        Math.round(a[2] + (b[2] - a[2]) * k) + "," +
        Math.round(a[3] + (b[3] - a[3]) * k) + ")");
    }
    return out;
  })();
  function col(t) { return RAMP[t < 0 ? 0 : t > 1 ? 47 : (t * 47) | 0]; }
  var COOL = 0.34;
  function heatT(p) {
    var span = p.ttl < COOL ? p.ttl : COOL;
    var t = p.life / span;
    return t > 1 ? 1 : t;
  }
  /* a wisp: a tongue lying along its own velocity (v2g) */
  function wisp(c, p, r) {
    var vx = p.vx, vy = p.vy;
    var v = Math.sqrt(vx * vx + vy * vy) || 1;
    var dx = vx / v, dy = vy / v;
    var L = r * p.el * (1 + Math.min(1.1, v / 320));
    var hx = p.x + dx * L * 0.34, hy = p.y + dy * L * 0.34;
    var tx = p.x - dx * L * 0.66, ty = p.y - dy * L * 0.66;
    var nx = -dy * r, ny = dx * r;
    var ax = p.x + dx * L * 0.10, ay = p.y + dy * L * 0.10;
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(ax + nx * 1.35, ay + ny * 1.35, hx, hy);
    c.quadraticCurveTo(ax - nx * 1.35, ay - ny * 1.35, tx, ty);
    c.fill();
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

  /* --- the mask: the track's own rounded rect, feathered above and below,
         inset 16 px at the caps (v2g). Built once per size change. */
  function buildMask() {
    if (!mask) { mask = doc.createElement("canvas"); mctx = mask.getContext("2d"); }
    mask.width = Math.round(CW * DPR); mask.height = Math.round(CH * DPR);
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mctx.clearRect(0, 0, CW, CH);
    /* 24 px of feather ABOVE the rail (the tongues climb ~18 px past it and
       must taper, not stop), 12 below */
    var Fa = OVER + 8, Fb = FEATHER, IN = 16, Hh = TH + Fa + Fb;
    var g = mctx.createLinearGradient(0, TY - Fa, 0, TY + TH + Fb);
    /* the mask is 1 through the rail's top edge (from 8 px above it down):
       a ramp that started AT the edge left a hairline dip there against the
       opaque rows below (seen at ?slide=done). Above that the field's own
       threshold tapers the tongues; the mask only feathers their tips. */
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop((Fa - 8) / Hh, "rgba(255,255,255,1)");
    g.addColorStop((Fa + TH) / Hh, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    mctx.fillStyle = g;
    roundRect(mctx, TX + IN, TY - Fa, TW - 2 * IN, Hh, Hh / 2);
    mctx.fill();
    mctx.fillStyle = "#fff";
    roundRect(mctx, TX, TY, TW, TH, TH / 2);
    mctx.fill();
  }

  function sizeField() {
    /* square cells of ~1.6 css px (3.2 device px at 2x): fine enough that a
       tongue's edge is a line and not a blob, coarse enough that the loop is
       ~12k cells. Every parameter below is in css px, not cells, so the look
       does not change with the cell size. */
    FW = Math.round(TW / CELL);
    CELL_X = TW / FW;
    FH = Math.round((TH + OVER) / CELL_X);
    CELL_Y = (TH + OVER) / FH;
    OVROWS = Math.round(OVER / CELL_Y);
    F = new Float32Array(FW * FH); G = new Float32Array(FW * FH);
    lit = new Uint8Array(FW); env = new Float32Array(FW);
    if (!fCv) { fCv = doc.createElement("canvas"); fCtx = fCv.getContext("2d"); }
    FF = FW * 2; FFH = FH * 2;
    fCv.width = FF; fCv.height = FFH;
    fimg = fCtx.createImageData(FF, FFH);
  }

  function sizeFlame() {
    if (!cv) return;
    var r = cv.getBoundingClientRect(), t = track.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    CW = r.width; CH = r.height;
    TX = t.left - r.left; TY = t.top - r.top; TW = t.width; TH = t.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildMask();
    sizeField();
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
    /* hover: a small fire, breathing. Focused and opened by the keyboard,
       it grows with the travel like a drag does */
    if (hovering || hasFocus) return Math.min(1, 0.68 + progress * 1.2);
    return awake() ? 0.5 : 0;
  }

  /* --- the knob's left edge, in canvas px ---------------------------------
     MEASURED only while something the script does not drive is moving it —
     a CSS transition (the spring back, the keyboard ease, the hover creep) —
     or right after a change; during a drag it is known exactly (.dragging
     takes the transition off), and at rest it is cached. Reading the rect
     every frame forced a synchronous layout of the whole page each frame,
     because the tilt rig has just dirtied the styles: 1.6 ms of the fire's
     2.3 ms, measured, on a page whose whole budget is 20. */
  var kxCache = null, kxDirty = true, knobMoving = false;
  function knobX() {
    if (kxCache && (dragging || qaDrag) && knob.classList.contains("dragging")) {
      /* a drag: the knob is exactly where place() put it */
      kxCache.x = kxCache.base + x; kxDirty = false;
      return kxCache;
    }
    if (kxCache && !kxDirty && !knobMoving) return kxCache;
    var k = knob.getBoundingClientRect(), r = cv.getBoundingClientRect();
    var inl = knob.style.transform ? parseFloat(knob.style.transform.slice(11)) || 0 : 0;
    kxCache = { x: k.left - r.left, y: k.top - r.top + k.height / 2, w: k.width, base: k.left - r.left - inl };
    kxDirty = false;
    return kxCache;
  }
  knob.addEventListener("transitionrun", function (e) { if (e.propertyName === "transform") knobMoving = true; });
  function knobSettled(e) { if (e.propertyName === "transform") { knobMoving = false; kxDirty = true; } }
  knob.addEventListener("transitionend", knobSettled);
  knob.addEventListener("transitioncancel", knobSettled);

  /* --- one step of the fire ----------------------------------------------
     t is the simulation clock in seconds; end/inten the source's right end
     (css px from the track's left edge) and its intensity; p the progress. */
  function stepField(t, end, inten, p, burst) {
    var W = FW, H = FH, x, y, i;
    /* 1. the source row: a bed of embers along the floor, flickering, ending
          softly ~1.5 cells before `end`. New columns are seeded from the
          burning column to their left, the whole height, so the inferno is
          THERE the moment the knob uncovers it instead of climbing up from
          the floor over 24 steps (a fast drag would otherwise leave a lag of
          low fire behind the knob). */
    var bed = (H - 1) * W, ref = -1;
    for (x = 0; x < W; x++) if (lit[x]) ref = x;   /* the rightmost column already burning */
    for (x = 0; x < W; x++) {
      var xc = (x + 0.5) * CELL_X;
      var e = clamp01((end - xc) / 5 + 0.5);
      var n = vn(xc * 0.114 + 7, t * 3.3);
      var v = inten * e * (0.80 + 0.30 * n);
      F[bed + x] = v; env[x] = e;
      var on = v > 0.06 ? 1 : 0;
      if (on && !lit[x]) {
        /* a column the knob has just uncovered is seeded ALIGHT: the hotter
           of (a) a copy of the last column that was burning before this step
           — not the just-seeded neighbour, whose jitter compounded down a
           fast sweep into a cold fire (0.88^9 per frame at 900 px/s) — and
           (b) a burning profile from the bed, for a column lit from cold (the
           first of a drag, the hover fire, a fast reversal at the cap). An
           empty column takes ~0.35 s to climb otherwise; measured mid-height
           heat 0.02 at the first frame of a 600 px/s drag. */
        var jit = 0.84 + 0.16 * rnd(), useRef = ref >= 0 && x > ref;
        for (y = 0; y < H - 1; y++) {
          var hf0 = ((H - 1 - y) * CELL_Y) / TH;
          /* the profile's variation is a NOISE over x and y, not a random
             per cell: independent columns seeded side by side were a comb of
             vertical bars behind a fast knob (seen at 700 px/s) */
          var sv = v * (1 - 0.7 * hf0) * (0.55 + 0.7 * vn(xc * 0.12 + 3, y * CELL_Y * 0.05 + t * 2));
          if (useRef) { var rv = F[y * W + ref] * jit; if (rv > sv) sv = rv; }
          F[y * W + x] = sv > 0 ? sv : 0;
        }
      }
      lit[x] = on;
    }
    /* 2. propagate upward: each cell takes the cell below it, drifted by a
          scrolling noise, cooled by a scrolling noise (the tongues) times a
          per-cell random (the flicker). */
    for (i = 0; i < W * H; i++) G[i] = F[i];
    /* cooling per ROW = cooling per css px x the row's height; the tongue
       noise and the drift noise are sampled in css px too */
    /* the fire climbs TWO rows (3.2 px) a step — 190 px/s at 60 steps/s —
       so a column is fully alight in ~0.35 s and the tongues move like fire
       rather than like lava */
    var RISE = 2;
    var dMean = (0.0215 - 0.0080 * p) * CELL_Y * RISE * (burst ? 0.45 : 1);
    var sy = t * 3.8, sy2 = t * 4.4;
    var floorY = (H - 1) * CELL_Y, trackH = TH;
    for (y = 0; y < H - 1; y++) {
      var row = y * W, below = row + W * (y < H - RISE ? RISE : 1);
      var yc = y * CELL_Y;
      /* the tongue noise is ELONGATED vertically (45 px features against
         11 px across): a column's cooling is then consistent up its height
         and a tongue is a tongue, instead of 4 independent samples averaging
         into a flat lid at the top (seen) */
      var ny = yc * 0.022 + sy, ny2 = yc * 0.043 + sy2 + 11;
      /* a floor under the turbulence: the heat can never fall below this
         inside the track, so there is no dark hole in the body of the fire —
         only the tongues' own edges against the dark at the very top */
      var hf = (floorY - yc) / trackH;
      var base = hf < 1 ? inten * 0.46 * Math.pow(1 - hf, 1.8) : 0;
      for (x = 0; x < W; x++) {
        var nx = x * CELL_X * 0.09;
        var n1 = vn(nx, ny), n2 = vn(nx * 2.3 + 13, ny * 2.1 + 5);
        var tn = n1 * 0.68 + n2 * 0.32;
        /* CONTINUOUS drift: the cell takes a bilinear sample of the row below
           up to 1.3 cells to either side. Integer drift stair-stepped every
           tongue into 45-degree blocks (seen at 1.6 px cells). */
        var s = vn(x * CELL_X * 0.037 + 31, ny2);
        var xf = x - (s - 0.5) * 2.6;
        var xi = xf | 0; if (xf < 0) { xi = 0; xf = 0; } else if (xi >= W - 1) { xi = W - 2; xf = W - 1; }
        var fr = xf - xi;
        var hb = G[below + xi] * (1 - fr) + G[below + xi + 1] * fr;
        var h = hb - dMean * (0.20 + 1.65 * tn * Math.sqrt(tn)) * (0.75 + 0.5 * rnd());
        var b = base * env[x];
        F[row + x] = h > b ? h : b;
      }
    }
    /* what is burning, for the sparks, the bloom and the QA hook */
    var sum = 0, cnt = 0;
    for (x = 0; x < W; x++) if (lit[x]) cnt++;
    litCols = cnt;
    if (cnt) {
      var mid = ((H >> 1) * W);
      for (x = 0; x < cnt; x++) sum += F[mid + x];
      meanHeat = sum / cnt;
    } else meanHeat = 0;
  }
  function fieldAlive() {
    var n = FW * FH, i;
    for (i = 0; i < n; i += 3) if (F[i] > 0.02) return true;
    return false;
  }

  /* --- paint the field into the two ImageDatas ---------------------------
     colA is the soft 6 px edge under the knob's left edge (kx). Rows above
     the track's top edge only show real tongues (alpha from heat); rows in
     the track are opaque from a little above black, so no dark track shows
     through except where the field really is out — the very top. */
  var colA = new Float32Array(1024), colB = new Float32Array(1024);
  /* The field is painted at TWICE its resolution into one buffer — a 4-tap
     bilinear of the cells (9/16, 3/16, 3/16, 1/16) — with the flicker specks
     added in the same pass, so the canvas gets ONE drawImage for the fire
     instead of a field pass and a `lighter` flicker pass over the same area.
     (Measured: the canvas raster, not the JS, is what the fire costs — every
     full-area pass counts.) Rows above the rail only show real tongues, with
     a threshold that climbs to 1.22 at the top row, so nothing is a lid. */
  function paintField(kx, flick) {
    var W = FW, H = FH, W2 = FF, H2 = FFH, x, y, fx, fy, o, v, a, pi, r, d = fimg.data;
    var edge = kx + 6, cols = 0, cols2;
    var hx = CELL_X / 2;
    for (fx = 0; fx < W2; fx++) {
      var xc = TX + (fx + 0.5) * hx;
      colA[fx] = clamp01((edge - xc) / 6);           /* in the track: 6 px under the knob */
      colB[fx] = clamp01((kx + 2 - xc) / 16) * clamp01((xc - TX - 6) / 36);  /* above: tapered at the knob and the cap */
      if (colA[fx] > 0) cols = (fx >> 1) + 1;
    }
    cols2 = Math.min(W2, cols * 2);
    var OV2 = OVROWS * 2, roff = (simT * 977) | 0;
    for (fy = 0; fy < H2; fy++) {
      y = fy >> 1;
      var yb = (fy & 1) ? (y < H - 1 ? y + 1 : y) : (y > 0 ? y - 1 : y);   /* the other row of the 2x2 */
      var above = fy < OV2;
      var fr = above ? (OV2 - fy) / OV2 : 0;
      var th = 0.02 + 1.20 * Math.pow(fr, 1.25), tw = 0.10 + 0.16 * fr;
      var ca = above ? colB : colA;
      var rowA = y * W, rowB = yb * W, orow = fy * W2;
      for (fx = 0; fx < cols2; fx++) {
        x = fx >> 1;
        var xb = (fx & 1) ? (x < W - 1 ? x + 1 : x) : (x > 0 ? x - 1 : x);
        v = F[rowA + x] * 0.5625 + F[rowA + xb] * 0.1875 + F[rowB + x] * 0.1875 + F[rowB + xb] * 0.0625;
        o = (orow + fx) * 4;
        if (v <= th) { d[o + 3] = 0; continue; }
        a = clamp01((v - th) / tw) * ca[fx];
        pi = pal(v) * 3;
        var cr = PAL[pi], cg = PAL[pi + 1], cb = PAL[pi + 2];
        if (flick && v > 0.18) {
          /* the flicker: a hot speck where the table says so, brighter the
             hotter the cell; the table is walked with a per-frame offset */
          r = RT[(orow + fx + roff) & 8191];
          if (r < v * 0.115) {
            var sw = 0.3 * (0.3 + 0.7 * (1 - r / (v * 0.115)));
            var si = pal(v + 0.28) * 3;
            cr += PAL[si] * sw; cg += PAL[si + 1] * sw; cb += PAL[si + 2] * sw;
          }
        }
        d[o] = cr; d[o + 1] = cg; d[o + 2] = cb;
        d[o + 3] = (a * 255) | 0;
      }
      for (; fx < W2; fx++) d[(orow + fx) * 4 + 3] = 0;
    }
    fCtx.putImageData(fimg, 0, 0);
    return cols;
  }
  function drawField(cols) {
    if (!cols) return;
    var dw = cols * CELL_X, dh = FH * CELL_Y, dy = TY - OVER;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fCv, 0, 0, cols * 2, FFH, TX, dy, dw, dh);
  }

  function spawn(px, py, speed, a, age) {
    var p = parts.length < MAXP ? {} : null;
    if (!p) return;
    p.x = px + (Math.random() - 0.5) * 2.5;
    p.y = py + (Math.random() + Math.random() - 1) * TH * 0.17;
    p.vx = -(6 + Math.random() * 18) - speed * 0.34;
    p.vy = -(12 + Math.random() * 40);
    p.ttl = 0.34 + Math.random() * 0.40 + Math.min(0.34, speed / 2200);
    p.life = age || 0;
    p.r = 0.7 + Math.random() * 1.75;
    p.el = 3.0 + Math.random() * 3.0;
    p.ph = Math.random() * 6.283;
    p.w = 4 + Math.random() * 8;
    p.a = 0.55 + Math.random() * 0.45;
    p.a *= (0.45 + 0.55 * a);
    parts.push(p);
  }
  function spark(px, py, speed) {
    if (sparks.length >= MAXS) return;
    sparks.push({
      x: px, y: py,
      vx: (Math.random() - 0.45) * 30 - speed * 0.06,
      vy: -(70 + Math.random() * 130),
      life: 0, ttl: 0.45 + Math.random() * 0.8,
      r: 0.5 + Math.random() * 0.8,
      hot: Math.random() < 0.4
    });
  }

  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (!ctx) return;
    if (!CW) sizeFlame();
    if (!last) last = ts;
    var dt = Math.min(0.064, (ts - last) / 1000) * tscale; last = ts;
    if (dt <= 0) return;

    var t0 = performance.now(); PROF[0] += (t0 - ts) * 0 ; var pm = t0;
    var k = knobX(); PROF[1] += performance.now() - pm; pm = performance.now();
    var kx = k.x;                                   /* the knob's LEFT edge  */
    if (lastKx === null) lastKx = kx;
    var dx = kx - lastKx;
    var inst = dx / dt;
    vel += (inst - vel) * Math.min(1, dt * 14);     /* smoothed px/s         */
    var speed = Math.abs(vel);
    var p = progress;
    var burst = now() < burstUntil;

    /* strikes in ~80 ms on a drag (~150 ms on hover), dies in ~600 ms */
    var tg = target();
    amp += (tg - amp) * Math.min(1, dt * (tg > amp ? (dragging || qaDrag ? 24 : 14) : 5));
    if (amp < 0.02) amp = target() > 0 ? amp : 0;

    /* ---- the heat source: where it ends, how hot it is -------------------
       Awake, its right end is the knob's left edge (+4 px, under the knob).
       Hovering, it is the first ~40 px of the track. Released, it EASES back
       to the left cap — the fire collapses inward — while amp dies; the field
       then burns out from the floor on its own. */
    var lead = kx - TX + 4;
    var srcT = (dragging || qaDrag || frozen || p > 0.004) ? lead
             : (hovering || hasFocus) ? Math.max(lead, 40) : 0;
    if (srcT >= srcEnd) srcEnd = srcT;              /* opening: instant      */
    else srcEnd += (srcT - srcEnd) * Math.min(1, dt * 7);   /* collapsing   */
    if (srcEnd > lead + 0.01 && !(hovering || hasFocus)) srcEnd = lead;
    var breath = (hovering || hasFocus) && !dragging && !qaDrag && p < 0.05
      ? 0.82 + 0.18 * Math.sin(ts / 380) : 1;
    srcI = amp * (0.86 + 0.24 * p) * breath;
    if (burst) srcI = 1.3;

    /* ---- simulate at a fixed 60 steps/s ---------------------------------- */
    simAcc += dt;
    var steps = 0, ts0 = performance.now();
    while (simAcc >= SIM && steps < 3) {
      simAcc -= SIM; steps++; simT += SIM;
      stepField(simT, srcEnd, srcI, p, burst);
    }
    if (simAcc > SIM * 3) simAcc = 0;
    msStep += (performance.now() - ts0 - msStep) * 0.1; PROF[2] += performance.now() - pm; pm = performance.now();

    /* ---- the wisps at the knob's edge, spread along the segment the knob
            just covered (v2g) ---- */
    if (amp > 0.02 && srcI > 0.1) {
      var rate = 50 + Math.min(1, speed / 1300) * 90;
      spawnAcc += rate * amp * dt;
      var n = spawnAcc | 0; spawnAcc -= n;
      var dist = Math.abs(dx);
      n = Math.max(n, Math.min(8, Math.round(dist / 12)));
      for (var i = 0; i < n; i++) {
        var f = (i + 0.5) / n;
        spawn(lastKx + dx * f, k.y, speed, amp, dt * (1 - f));
      }
    }
    lastKx = kx;

    /* ---- the sparks come off the TOP of the field --------------------- */
    if (litCols > 2 && amp > 0.05) {
      sparkAcc += (2.5 + 9 * p + Math.min(6, speed / 150)) * Math.min(1, amp) * dt;
      var ns = sparkAcc | 0; sparkAcc -= ns;
      for (var j = 0; j < ns; j++) {
        var cx0 = (Math.random() * litCols) | 0;
        var top = 0, yy;
        for (yy = 0; yy < FH; yy++) if (F[yy * FW + cx0] > 0.28) { top = yy; break; }
        if (yy === FH) continue;
        spark(TX + (cx0 + 0.5) * CELL_X, TY - OVER + top * CELL_Y + 2, speed);
      }
    }

    /* ---- integrate ------------------------------------------------------ */
    var i2, p2;
    for (i2 = parts.length - 1; i2 >= 0; i2--) {
      p2 = parts[i2];
      p2.life += dt;
      /* a wisp the knob has overtaken (the spring back is ~1700 px/s, faster
         than any wisp) would be drawn on the dark track to the RIGHT of the
         knob, across the label (seen on release): the fire stays left of it */
      if (p2.life >= p2.ttl || p2.x > kx + 4) { parts.splice(i2, 1); continue; }
      p2.x += (p2.vx + Math.sin(p2.life * p2.w + p2.ph) * 9) * dt;
      p2.y += p2.vy * dt;
      p2.vx *= (1 - 1.9 * dt);
      p2.vy -= 18 * dt;
    }
    for (i2 = sparks.length - 1; i2 >= 0; i2--) {
      p2 = sparks[i2];
      p2.life += dt;
      if (p2.life >= p2.ttl) { sparks.splice(i2, 1); continue; }
      p2.x += p2.vx * dt; p2.y += p2.vy * dt; p2.vy *= (1 - 0.85 * dt);
    }

    PROF[3] += performance.now() - pm; pm = performance.now();
    draw(k, speed, ts, p);
    PROF[4] += performance.now() - pm; PROF[5]++;
    var cost = performance.now() - t0;
    fireMs += (cost - fireMs) * 0.1; if (cost > fireMax) fireMax = cost;

    if (!awake() && amp < 0.02 && !parts.length && !sparks.length && !fieldAlive()) stop();
  }

  function draw(k, speed, ts, p) {
    ctx.clearRect(0, 0, CW, CH);

    /* --- 1. the inferno: the field, then its flicker ---------------------- */
    var tp0 = performance.now();
    var cols = paintField(k.x, true);
    msPaint += (performance.now() - tp0 - msPaint) * 0.1; tp0 = performance.now();
    drawField(cols);
    msDraw += (performance.now() - tp0 - msDraw) * 0.1;

    /* --- 2. the wisps: cool tail normal, hot core additive (v2g) ---------- */
    ctx.globalCompositeOperation = "source-over";
    var q, t, r, i;
    for (i = 0; i < parts.length; i++) {
      q = parts[i]; t = q.life / q.ttl;
      if (heatT(q) < 0.45) continue;
      r = q.r * (1 - 0.34 * t);
      ctx.globalAlpha = q.a * Math.pow(1 - t, 1.3) * 0.72;
      ctx.fillStyle = col(heatT(q));
      wisp(ctx, q, r);
    }
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < parts.length; i++) {
      q = parts[i]; t = q.life / q.ttl;
      if (heatT(q) >= 0.45) continue;
      r = q.r * (1 - 0.34 * t);
      ctx.globalAlpha = q.a * Math.min(1, (1 - t) * 1.6);
      ctx.fillStyle = col(heatT(q));
      wisp(ctx, q, r);
    }

    /* --- 3. the tongue at the knob's edge: the knob is dragging the fire -- */
    if (amp > 0.02 && srcI > 0.1) {
      /* the tongue lies flat with RIGHTWARD speed only: on the spring back
         (~1700 px/s leftward) a tongue laid 100 px to the left was a white
         slab squashed into the cap (seen) — that flame would trail behind the
         knob, under it, so it is short here */
      var sp = Math.min(1, Math.max(0, vel) / 1250);
      var L = (18 + 96 * sp) * (0.55 + 0.45 * amp);
      var hh = TH * 0.18 * (0.6 + 0.4 * amp) * (1 + 0.35 * sp);
      var lift = (1 - sp) * TH * 0.26;
      var wob = Math.sin(ts / 92) * 1.9 + Math.sin(ts / 41) * 0.9;
      var tipX = k.x - L, tipY = k.y - lift + wob;
      var g2 = ctx.createLinearGradient(tipX, 0, k.x, 0);
      g2.addColorStop(0, "rgba(255,52,0,0)");
      g2.addColorStop(0.30, "rgba(255,88,6,.44)");
      g2.addColorStop(0.68, "rgba(255,160,42,.70)");
      g2.addColorStop(0.92, "rgba(255,214,140,.82)");
      g2.addColorStop(1, "rgba(255,246,224,.88)");
      ctx.globalAlpha = Math.min(1, amp) * 0.9;
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(k.x, k.y - hh * 0.72);
      ctx.quadraticCurveTo(k.x - L * 0.55, k.y - hh * 1.32 - lift * 0.62 + wob, tipX, tipY);
      ctx.quadraticCurveTo(k.x - L * 0.55, k.y + hh * 1.12 - lift * 0.42 + wob, k.x, k.y + hh * 0.72);
      ctx.closePath(); ctx.fill();
      var L2 = L * 0.44, h2 = hh * 0.44;
      var g3 = ctx.createLinearGradient(k.x - L2, 0, k.x, 0);
      g3.addColorStop(0, "rgba(255,190,90,0)");
      g3.addColorStop(0.62, "rgba(255,232,170,.52)");
      g3.addColorStop(1, "rgba(255,252,240,.92)");
      ctx.globalAlpha = Math.min(1, amp);
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.moveTo(k.x, k.y - h2);
      ctx.quadraticCurveTo(k.x - L2 * 0.5, k.y - h2 - lift * 0.4 + wob * 0.6, k.x - L2, k.y - lift * 0.5 + wob * 0.6);
      ctx.quadraticCurveTo(k.x - L2 * 0.5, k.y + h2 - lift * 0.3 + wob * 0.6, k.x, k.y + h2);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* --- 4. clip the FIRE to the track, feathered — over the burning span
           plus the tongue's reach only, not the whole canvas ---------------- */
    var mw = Math.min(CW, k.x + 40);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, mw * DPR, CH * DPR, 0, 0, mw, CH);   /* nothing is drawn right of it */

    /* --- 5. the bloom outside the rails, AFTER the mask: grows with the
           travel, sits over the burning span only ------------------------- */
    var bw = Math.max(0, k.x + 6 - TX);
    var ba = 0.46 * Math.min(1, amp) * Math.pow(p, 1.4) * Math.min(1, meanHeat * 2.2);
    if (now() < burstUntil) ba = 0.6;
    if (ba > 0.01 && bw > 20) bloom(TX + bw / 2, bw / 2 + 30, ba);

    /* --- 6. the embers, after the mask: they leave the track -------------- */
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < sparks.length; i++) {
      q = sparks[i]; t = q.life / q.ttl;
      var a = Math.min(1, (1 - t) * 1.4) * (0.6 + 0.4 * Math.sin(q.life * 36));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = q.hot ? "rgb(255,216,150)" : "rgb(255,104,12)";
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha *= 0.2;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 2.4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  function bloom(cx, rx, a) {
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    /* no hard peak at the rail: the glow is a body of light, not a rim */
    g.addColorStop(0, "rgba(255,110,30," + (a * 0.8).toFixed(3) + ")");
    g.addColorStop(0.25, "rgba(255,96,24," + (a * 0.62).toFixed(3) + ")");
    g.addColorStop(0.6, "rgba(255,64,12," + (a * 0.26).toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,40,0,0)");
    ctx.fillStyle = g;
    /* the two halves end exactly ON the rails: ending 2 px short left a
       transparent hairline between the bloom and the fire's top through
       which the rail's dark edge read as a line drawn over the fire, and
       overlapping the fire washed its top rows out (both seen) */
    ctx.save(); ctx.translate(cx, TY); ctx.scale(rx, 54);
    ctx.fillRect(-1, -1, 2, 1); ctx.restore();
    ctx.save(); ctx.translate(cx, TY + TH); ctx.scale(rx, 34);
    ctx.fillRect(-1, 0, 2, 1); ctx.restore();
  }

  function ignite() {
    if (!ctx || reduce.matches || !hellOn()) return;
    if (!CW) sizeFlame();
    /* a drag from cold strikes the fire at once: the first frame of a fast
       drag was a bare floor otherwise (measured: mid-height heat 0.02) */
    if (dragging && amp < 0.5) amp = 0.5;
    if (!raf) { last = 0; lastKx = null; simAcc = 0; raf = global.requestAnimationFrame(frame); }
  }
  function stop() {
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    parts.length = 0; sparks.length = 0;
    if (F) { F.fill(0); G.fill(0); lit.fill(0); env.fill(0); }
    amp = 0; vel = 0; lastKx = null; spawnAcc = 0; sparkAcc = 0;
    srcEnd = 0; srcI = 0; meanHeat = 0; litCols = 0;
    if (ctx && CW) ctx.clearRect(0, 0, CW, CH);
  }

  /* --- reduced motion: ONE pre-rendered field in the uncovered region -----
     Seeded, so the frame is the same every time it is drawn; no wisps, no
     sparks, no bloom, no rAF. Redrawn only when the knob's position is
     published (drag, keyboard, ?slide=). */
  function drawStatic() {
    if (!ctx || !hellOn()) return;
    if (!CW) sizeFlame();
    if (!CW) return;
    var k = knobX();
    var lead = k.x - TX + 4;
    ctx.clearRect(0, 0, CW, CH);
    if (lead < 6 && !track.classList.contains("done")) return;
    var seed = 0x9E3779B9;                       /* mulberry32, seeded */
    rnd = function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
    F.fill(0); G.fill(0); lit.fill(0); env.fill(0);
    var pp = progress, done = track.classList.contains("done");
    for (var s = 0; s < 110; s++) stepField(s / 60, lead, done ? 1.15 : 0.86 + 0.24 * pp, pp, false);
    rnd = Math.random;
    var cols = paintField(k.x, true);
    drawField(cols);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, CW, CH);
    ctx.globalCompositeOperation = "source-over";
  }

  wrap.addEventListener("pointerenter", function () { hovering = true; kxDirty = true; ignite(); });
  wrap.addEventListener("pointerleave", function () { hovering = false; kxDirty = true; });
  global.addEventListener("resize", function () { sizeFlame(); if (reduce.matches) drawStatic(); }, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) stop(); else if (awake()) ignite();
  });
  reduce.addEventListener("change", function () { if (reduce.matches) { stop(); drawStatic(); } });

  /* ---------- QA hooks --------------------------------------------------- */
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
    /* QA: slow the fire's clock (the CSS spring is slowed by the harness
       through document.getAnimations()), so a 600 ms collapse can be shot */
    timescale: function (k) { tscale = k > 0 ? k : 1; },
    /* a real release from wherever the knob is parked: the collapse, for QA */
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
      return { parts: parts.length, sparks: sparks.length, amp: +amp.toFixed(3),
               vel: Math.round(vel), heat: +meanHeat.toFixed(3), cols: litCols,
               src: Math.round(srcEnd), raf: !!raf,
               ms: +fireMs.toFixed(2), msMax: +fireMax.toFixed(2), cells: FW + "x" + FH,
               msStep: +msStep.toFixed(2), msPaint: +msPaint.toFixed(2), msDraw: +msDraw.toFixed(2),
               prof: PROF.slice(1, 5).map(function (v) { return +(v / (PROF[5] || 1)).toFixed(3); }) };
    }
  };

  function boot() {
    sizeFlame();
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.has("slide")) {
        var v = q.get("slide");
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
