/* ==========================================================================
   Boo Machine — slide to join   (v2i: the uncovered track is MAGMA)

   The pointer / capture / drag logic, the keyboard support and the TestFlight
   URL are v2e-b's, carried through v2f–v2h unchanged. What changed is what
   the drag DRIVES.

   v2h filled the uncovered track with a Doom-style fire: tongues climbing,
   licking over the rail, a bloom outside it. The client's note on that:

     "more like hot burning moving magma that is being drawn behind it; right
      behind the slider it is hotter, glowing more than further behind;
      contained within the track, not coming out of it; not so uniform, the
      repetition should not be visible."

   So the space the knob has uncovered — from the left cap to the knob's left
   edge — is now a VISCOUS LAVA SURFACE seen inside the slot:

     * HEAT IS A FUNCTION OF DISTANCE FROM THE KNOB'S LEFT EDGE. White-yellow
       within ~12 px, orange over the next ~60, red, dark cherry, and black
       crust with only glowing cracks by ~250 px (heatAt(), a lookup in css
       px). A gentle vertical gradient makes the floor of the slot hotter
       than its top (pooling);
     * THE SURFACE IS A NOISE FIELD, not a simulation: three octaves of value
       noise at two different scales, sampled with a time offset and a
       per-cell DOMAIN WARP, with a random phase per page load — so no two
       loads look alike and nothing tiles. A RIDGED term of it is the crust:
       the ridge lines are the narrow bright cracks between plates, the cell
       interiors are pools of molten material where the heat allows, dark
       crust where it does not. The whole thing scrolls LEFT at ~15 px/s —
       the plates drift away from the knob and cool — the cracks pulse, and
       a soft specular sheen sits on the molten pools;
     * the noise fields are refreshed at 24 Hz (the flow is slow), the
       colouring — which depends on where the knob is THIS frame — at 60;
       cells are ~1.5 css px, painted through a palette
       black → #2A0400 → #8A1400 → #FF4A00 → #FFB000 → #FFF4D8 → white into
       one ImageData and drawn bilinear over the uncovered rect;
     * BUBBLES surface and burst near the knob, small LAVA BLOBS detach and
       drift left, a slow HEAT SHIMMER rises off the hot end and a few EMBERS
       with it — all inside the track;
     * EVERYTHING IS CLIPPED to the track's inner rounded rect, inset 2 px.
       Nothing is drawn above or below the rails; the only light outside is
       a couple of px of CSS border glow (slide.css). v2h's bloom is gone;
     * release below the threshold: the crust profile advances from the knob
       outward (the hot end cools first) while the amplitude dies — ~600 ms
       to black; completion: the whole track goes molten and flares
       white-yellow, then navigation.

   Still published for the CSS, and still registered properties, because the
   spring back on release is a transition and not a script loop:

       --rev   <length>  the knob's right edge = how far it has travelled
       --revp  <number>  the same as 0..1
       --rl-d  on <html>, the room light's multiplier: 1 -> 1.7 (v2h: 1.95)

   QA hook:  ?slide=0.4   park the knob at 40 % and freeze it there
             ?slide=hover / done / flare   (see the README)
   window.booSlide.set(p) / .done() / .reset() / .sweep(on[,speed]) / .progress
   window.booSlide.flame  -> {parts, sparks, blobs, amp, vel, heat, cols, raf, ms...}
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
     THE MAGMA
     ====================================================================== */
  var cv = track.querySelector(".hell-flame");
  var ctx = cv ? cv.getContext("2d") : null;

  var hovering = false, hasFocus = false, qaAwake = false, qaDrag = false;
  var amp = 0, burstUntil = 0;
  var raf = 0, last = 0, lastKx = null, vel = 0;
  var shimAcc = 0, embAcc = 0, bubAcc = 0, blobAcc = 0;

  /* canvas geometry, in css px of the canvas's own box — which is now the
     track's own box: nothing is drawn outside it any more */
  var CW = 0, CH = 0, TX = 0, TY = 0, TW = 0, TH = 0, INSET = 2;

  /* --- the field ---------------------------------------------------------
     FW x FH cells of ~1.5 css px over the track's INNER rect (inset 2 px).
     Four noise layers per cell, refreshed at 24 Hz; one paint per frame. */
  var CELL = 1.5, FW = 0, FH = 0, CELL_X = 0, CELL_Y = 0;
  var NR = null, NM = null, NS = null, NPh = null;   /* ridge, molten mod, sheen, pulse phase */
  var fimg = null, fCv = null, fCtx = null;
  var simT = 0, tscale = 1, noiseT = -1, NOISE_DT = 1 / 24;   /* the flow moves 0.6 px a step */
  var meanHeat = 0, litCols = 0, fireMs = 0, fireMax = 0;
  var msNoise = 0, msPaint = 0, msDraw = 0;
  var PROF = [0, 0, 0, 0, 0, 0];
  var coolShift = 0, cooling = false, coolUntil = 0;   /* release: the crust advances from the knob */

  var parts = [], sparks = [], bubbles = [], blobs = [];
  var MAXP = 22, MAXS = 5, MAXB = 6, MAXL = 10;

  function now() { return performance.now(); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sstep(a, b, v) { v = (v - a) / (b - a); v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }

  /* --- value noise, 64 x 64, bilinear, wrapping. The table is random per
         page load and every sample carries a random phase (OX/OY), so no
         two loads show the same plates. At the scales used below one wrap
         is 1.5–4k css px of track: nothing repeats in the slot. */
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

  /* --- the palette: black -> #2A0400 -> #8A1400 -> #FF4A00 -> #FFB000 ->
         #FFF4D8 -> white, 256 entries over heat 0..1.3 (the completion
         burst goes past 1 and clamps white) */
  var PAL = (function () {
    var stops = [
      [0.00, 0, 0, 0], [0.16, 42, 4, 0], [0.38, 138, 20, 0], [0.62, 255, 74, 0],
      [0.84, 255, 176, 0], [1.00, 255, 244, 216], [1.30, 255, 255, 250]
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

  /* --- heat by distance from the knob's left edge, in css px -------------
         white-yellow within ~12 px, orange over the next ~60, red, dark
         cherry, black crust by ~250. A 512-entry table over 0..512 px. */
  var HEAT = (function () {
    var pts = [[0, 1.06], [12, 0.96], [40, 0.80], [72, 0.66], [130, 0.45], [190, 0.27], [250, 0.14], [320, 0.10], [512, 0.09]];
    var out = new Float32Array(513), j = 0;
    for (var d = 0; d <= 512; d++) {
      while (j < pts.length - 2 && d > pts[j + 1][0]) j++;
      var a = pts[j], b = pts[j + 1];
      out[d] = a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]);
    }
    return out;
  })();
  function heatAt(d) { if (d < 0) d = 0; if (d > 511) return HEAT[512]; var i = d | 0; return HEAT[i] + (HEAT[i + 1] - HEAT[i]) * (d - i); }

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
     drawing happens inside it — the field, the bubbles, the shimmer, the
     embers. Nothing can reach the rails. */
  function clipTrack(c) {
    roundRect(c, TX + INSET, TY + INSET, TW - 2 * INSET, TH - 2 * INSET, (TH - 2 * INSET) / 2);
    c.clip();
  }

  function sizeField() {
    FW = Math.round((TW - 2 * INSET) / CELL);
    CELL_X = (TW - 2 * INSET) / FW;
    FH = Math.round((TH - 2 * INSET) / CELL_X);
    CELL_Y = (TH - 2 * INSET) / FH;
    var n = FW * FH;
    NR = new Float32Array(n); NM = new Float32Array(n); NS = new Float32Array(n); NPh = new Float32Array(n);
    if (!fCv) { fCv = doc.createElement("canvas"); fCtx = fCv.getContext("2d"); }
    fCv.width = FW; fCv.height = FH;
    fimg = fCtx.createImageData(FW, FH);
    noiseT = -1;
  }

  function sizeFlame() {
    if (!cv) return;
    var r = cv.getBoundingClientRect(), t = track.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    CW = r.width; CH = r.height;
    TX = t.left - r.left; TY = t.top - r.top; TW = t.width; TH = t.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
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
    if (simT < coolUntil) return 0;           /* just released: cooling      */
    /* hover: a small molten pool at the cap, breathing. Focused and opened
       by the keyboard, it grows with the travel like a drag does */
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

  /* --- the noise fields, refreshed at 24 Hz --------------------------------
     t is the flow clock in seconds. Coordinates are in css px of the track;
     the field scrolls LEFT at FLOW px/s (a feature at noise coordinate u sits
     at x = u - FLOW*t), and every sample is domain-warped by a slower, larger
     noise so the plates are lobed and nothing lines up on a grid.
       NR   ridged noise, 2 octaves at ~1/28 px: the crust. Ridge lines
            (NR -> 1) are the cracks; cell interiors (NR -> 0) the pools.
       NM   a 3-octave fbm at ~1/54 px: which cells are molten, and the
            body variation of the molten material.
       NS   fine noise at ~1/9 px: grain on the melt, the sheen.
       NPh  a phase per region for the crack pulse. */
  var FLOW = 15;
  function stepNoise(t) {
    var W = FW, H = FH, x, y, i = 0;
    var sx = FLOW * t;
    for (y = 0; y < H; y++) {
      var yc = (y + 0.5) * CELL_Y;
      for (x = 0; x < W; x++, i++) {
        var xc = (x + 0.5) * CELL_X + sx;
        /* the warp: ±9 px, evolving slowly in time */
        var wx = (vn(xc * 0.021 + OX + 17, yc * 0.021 + OY + t * 0.045) - 0.5) * 18;
        var wy = (vn(xc * 0.021 + OX + 41, yc * 0.021 + OY + 9 - t * 0.03) - 0.5) * 14;
        var px = xc + wx, py = yc + wy;
        /* the crust: ridged, two octaves. Squashed a little in y so the
           plates are wider than tall, like a flow seen from the side */
        var r1 = vn(px * 0.036 + OX, py * 0.048 + OY);
        var r2 = vn(px * 0.081 + OX + 23, py * 0.100 + OY + 5);
        /* value noise crowds around .5, so the mix is STRETCHED x2 about it
           before the ridge is taken: the ridge lines (the cracks) come out
           narrow and the cell interiors (the pools) large */
        var nn = (r1 * 0.72 + r2 * 0.28 - 0.5) * 2.0 + 0.5;
        var rr = 1 - Math.abs(2 * nn - 1); if (rr < 0) rr = 0;
        NR[i] = rr;
        /* molten modulation: three octaves, two scales */
        var m1 = vn(px * 0.0185 + OX + 61, py * 0.024 + OY + 3 + t * 0.02);
        var m2 = vn(px * 0.052 + OX + 7, py * 0.062 + OY + 29);
        var m3 = vn(px * 0.13 + OX + 45, py * 0.13 + OY + 51);
        NM[i] = m1 * 0.55 + m2 * 0.30 + m3 * 0.15;
        NS[i] = vn(xc * 0.11 + OX + 77 + t * 0.4, yc * 0.11 + OY + 13);
        NPh[i] = vn(px * 0.03 + OX + 99, py * 0.03 + OY + 31);
      }
    }
  }

  /* --- paint the field into the ImageData ---------------------------------
     kxT: the knob's left edge in TRACK px; d = kxT - xc is the distance the
     heat is a function of. shift: the release cooling (the crust profile
     advances from the knob). inten: the amplitude 0..1.3. t: the clock.
     Returns the number of columns painted. */
  function paintField(kxT, kyT, KR, shift, inten, t, burst, done) {
    var W = FW, H = FH, x, y, i = 0, d = fimg.data;
    var cols = 0;
    /* per-column heat (the table); the columns the field reaches into
       (under the knob's rounded end, up to its centre line) */
    var reach = kxT - INSET + KR;
    for (x = 0; x < W; x++) {
      var xc = INSET + (x + 0.5) * CELL_X;
      if (xc < reach) cols = x + 1;
      var dist = kxT - xc + shift;
      colH[x] = heatAt(dist) * inten;
      /* done: the whole track stays molten after the flare */
      if (done && colH[x] < 0.74 * inten) colH[x] = 0.74 * inten;
    }
    /* the knob's end is a SEMICIRCLE (radius KR, centre kxT + KR, kyT): the
       field is cut along it with a 2 px soft edge, not along a vertical line
       — a straight cut showed as a hard bar beside the knob's rounded
       corners (seen at 10 %). What is right of the knob's edge and outside
       the semicircle (the seam above and below the knob, the corners beside
       its end) fades out linearly toward the knob's centre line, so the seam
       has no hard end either. */
    var kcx = kxT + KR - INSET, kcy = kyT - INSET, kr2 = KR - 2, iKR = 1 / KR;
    var pulse = t * 1.9;
    var sinB = Math.sin(pulse), cosB = Math.cos(pulse);
    for (y = 0; y < H; y++) {
      var yf = (y + 0.5) / H;
      /* pooling: the floor of the slot is hotter than its top */
      var pool = 0.86 + 0.26 * yf;
      /* the sheen sits on the upper half of a pool: light from above */
      var sheenY = 1 - Math.abs(yf - 0.32) * 2.2; if (sheenY < 0) sheenY = 0;
      i = y * W;
      var dyk = (y + 0.5) * CELL_Y - kcy, dyk2 = dyk * dyk;
      for (x = 0; x < W; x++, i++) {
        var o = i * 4;
        if (x >= cols) { d[o + 3] = 0; continue; }
        var alpha = 255;
        var dxk = (x + 0.5) * CELL_X - kcx;
        if (dxk > -KR) {                              /* near the knob: the semicircle cut */
          var dk = Math.sqrt(dxk * dxk + dyk2) - kr2;
          if (dk < 0) { d[o + 3] = 0; continue; }
          var fa = -dxk * iKR; if (dk < 2) fa *= dk * 0.5;
          alpha = (fa * 255) | 0;
        }
        var hd = colH[x] * pool;                     /* the heat this cell would have, molten */
        var rr = NR[i], nm = NM[i];
        /* molten where the ridge noise is low (cell interiors), gated by the
           heat: near the knob everything is molten; far away only a pool or
           two survives inside a plate, and then none */
        var molt = sstep(0.78, 0.30, rr) * sstep(0.30, 0.62, nm + (hd - 0.45) * 1.4);
        if (hd > 0.66) molt += (hd - 0.66) * 2.6;    /* the hot end: all melt */
        if (molt < 0) molt = 0; else if (molt > 1) molt = 1;
        if (burst) molt = 1;
        /* the crack: the ridge line, narrow, pulsing per region */
        var ph = NPh[i] * 6.2832;
        var pu = 0.78 + 0.22 * (sinB * Math.cos(ph) + cosB * Math.sin(ph));   /* sin(pulse + ph) */
        var crack = sstep(0.83, 0.975, rr) * pu;
        /* the crust glows a little near its cracks: the plate reads as a slab
           with a lit edge, darkest in the middle */
        var near = sstep(0.50, 0.90, rr) * 0.30;
        /* the crust between the pools: a skin barely darker than the melt
           right behind the knob, dark cherry in the red zone, black by the
           cap — so the plates FORM as the flow cools instead of switching on */
        var hc = 0.01 + hd * (0.12 + 0.55 * sstep(0.35, 1.0, hd));
        /* the melt: the heat, varied by the fbm and a fine grain */
        var hm = hd * (0.80 + 0.32 * nm) + NS[i] * 0.06 * hd;
        /* the crack's own glow: orange in the red zone, a dim red line where
           the crust is cold */
        var ck = 0.18 + hd * 0.9; if (ck > 0.80) ck = 0.80;
        var v = hc + (hm - hc) * molt + (crack + near * (1 - crack)) * (1 - molt) * ck;
        /* the sheen on the molten pools */
        v += molt * sheenY * sstep(0.58, 0.9, NS[i]) * 0.16 * (0.5 + hd);
        if (burst) v = 1.3;
        var pi = pal(v) * 3;
        d[o] = PAL[pi]; d[o + 1] = PAL[pi + 1]; d[o + 2] = PAL[pi + 2];
        d[o + 3] = alpha;
      }
    }
    fCtx.putImageData(fimg, 0, 0);
    /* what is glowing, for the QA hook */
    var mid = (H >> 1) * W, sum = 0;
    for (x = 0; x < cols; x++) sum += colH[x];
    meanHeat = cols ? sum / cols : 0; litCols = cols;
    return cols;
  }
  var colH = new Float32Array(1024);
  function drawField(cols) {
    if (!cols) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fCv, 0, 0, cols, FH, TX + INSET, TY + INSET, cols * CELL_X, FH * CELL_Y);
  }

  /* --- the particles: all inside the track ------------------------------- */
  function spawnShimmer(kx, ky) {                 /* slow rising heat, off the hot end */
    if (parts.length >= MAXP) return;
    parts.push({
      x: kx - 3 - Math.random() * 26, y: TY + TH - INSET - 4 - Math.random() * (TH * 0.45),
      vx: -(3 + Math.random() * 7), vy: -(9 + Math.random() * 12),
      life: 0, ttl: 0.9 + Math.random() * 0.9, r: 3 + Math.random() * 5,
      a: 0.05 + Math.random() * 0.06, ph: Math.random() * 6.283, w: 2 + Math.random() * 3
    });
  }
  function spawnEmber(kx) {                        /* a few embers off the melt */
    if (sparks.length >= MAXS) return;
    sparks.push({
      x: kx - 2 - Math.random() * 30, y: TY + TH * (0.5 + Math.random() * 0.4),
      vx: -(2 + Math.random() * 6), vy: -(16 + Math.random() * 22),
      life: 0, ttl: 0.6 + Math.random() * 0.7, r: 0.5 + Math.random() * 0.6,
      hot: Math.random() < 0.5
    });
  }
  function spawnBubble(kx) {                       /* surfaces and bursts near the knob */
    if (bubbles.length >= MAXB) return;
    bubbles.push({
      x: kx - 4 - Math.random() * 38, y: TY + INSET + 6 + Math.random() * (TH - 2 * INSET - 12),
      life: 0, ttl: 0.55 + Math.random() * 0.5, r: 1.2 + Math.random() * 1.5
    });
  }
  function spawnBlob(kx) {                         /* a lump that detaches and drifts left */
    if (blobs.length >= MAXL) return;
    blobs.push({
      x: kx - 10 - Math.random() * 40, y: TY + INSET + 8 + Math.random() * (TH - 2 * INSET - 16),
      vx: -(FLOW * 0.9 + Math.random() * 10), vy: (Math.random() - 0.5) * 2,
      life: 0, ttl: 2.5 + Math.random() * 2.5, r: 2.4 + Math.random() * 2.6, ph: Math.random() * 6.283
    });
  }

  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (!ctx) return;
    if (!CW) sizeFlame();
    if (!last) last = ts;
    var dt = Math.min(0.064, (ts - last) / 1000) * tscale; last = ts;
    if (dt <= 0) return;

    var t0 = performance.now(), pm = t0;
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

    /* release below the threshold: the crust advances from the knob outward
       (the heat profile is read `coolShift` px further from the knob) while
       amp dies — the two together are the ~600 ms to black */
    if (simT < coolUntil && !dragging && !qaDrag && !burst) { cooling = true; coolShift += 520 * dt; }
    else { cooling = false; coolShift = 0; }

    var breath = (hovering || hasFocus) && !dragging && !qaDrag && p < 0.05
      ? 0.86 + 0.14 * Math.sin(ts / 420) : 1;
    var inten = amp * breath;
    if (burst) inten = 1.3;

    simT += dt;
    /* ---- the noise fields at 24 Hz ---------------------------------------- */
    var ts0 = performance.now();
    if (noiseT < 0 || simT - noiseT >= NOISE_DT) { noiseT = simT; stepNoise(simT); }
    msNoise += (performance.now() - ts0 - msNoise) * 0.1; PROF[2] += performance.now() - pm; pm = performance.now();

    /* ---- the particles ------------------------------------------------- */
    var kxT = kx - TX;
    if (inten > 0.15 && kxT > INSET + 8 && !cooling) {
      shimAcc += (7 + 8 * Math.min(1, p * 2)) * dt;
      var n = shimAcc | 0; shimAcc -= n;
      for (var i = 0; i < n; i++) spawnShimmer(kx, k.y);
      embAcc += (1.2 + 2.5 * p + Math.min(2, speed / 400)) * dt;
      n = embAcc | 0; embAcc -= n;
      for (i = 0; i < n; i++) spawnEmber(kx);
      bubAcc += (1.8 + 2.4 * p) * dt;
      n = bubAcc | 0; bubAcc -= n;
      for (i = 0; i < n; i++) spawnBubble(kx);
      if (kxT > 70) {
        blobAcc += (0.45 + 0.6 * p) * dt;
        n = blobAcc | 0; blobAcc -= n;
        for (i = 0; i < n; i++) spawnBlob(kx);
      }
    }
    lastKx = kx;

    var i2, q;
    for (i2 = parts.length - 1; i2 >= 0; i2--) {
      q = parts[i2]; q.life += dt;
      if (q.life >= q.ttl || q.x > kx + 2 || q.y < TY + INSET + 2) { parts.splice(i2, 1); continue; }
      q.x += (q.vx + Math.sin(q.life * q.w + q.ph) * 4) * dt;
      q.y += q.vy * dt;
    }
    for (i2 = sparks.length - 1; i2 >= 0; i2--) {
      q = sparks[i2]; q.life += dt;
      if (q.life >= q.ttl || q.x > kx + 2 || q.y < TY + INSET + 1) { sparks.splice(i2, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy *= (1 - 0.6 * dt);
    }
    for (i2 = bubbles.length - 1; i2 >= 0; i2--) {
      q = bubbles[i2]; q.life += dt;
      if (q.life >= q.ttl || q.x > kx + 2) { bubbles.splice(i2, 1); continue; }
      q.x -= FLOW * 0.6 * dt;
    }
    for (i2 = blobs.length - 1; i2 >= 0; i2--) {
      q = blobs[i2]; q.life += dt;
      if (q.life >= q.ttl || q.x > kx + 2 || q.x < TX + INSET) { blobs.splice(i2, 1); continue; }
      q.x += q.vx * dt; q.y += (q.vy + Math.sin(q.life * 1.3 + q.ph) * 1.5) * dt;
    }

    PROF[3] += performance.now() - pm; pm = performance.now();
    draw(k, inten, burst, p, simT);
    PROF[4] += performance.now() - pm; PROF[5]++;
    var cost = performance.now() - t0;
    fireMs += (cost - fireMs) * 0.1; if (cost > fireMax) fireMax = cost;

    if (!awake() && amp < 0.02 && !parts.length && !sparks.length && !bubbles.length && !blobs.length) stop();
  }

  function draw(k, inten, burst, p, t) {
    ctx.clearRect(0, 0, CW, CH);
    if (inten < 0.015 && !burst) return;
    ctx.save();
    clipTrack(ctx);

    /* --- 1. the magma surface --------------------------------------------- */
    var tp0 = performance.now();
    var cols = paintField(k.x - TX, k.y - TY, k.h / 2, coolShift, inten, t, burst, track.classList.contains("done"));
    msPaint += (performance.now() - tp0 - msPaint) * 0.1; tp0 = performance.now();
    drawField(cols);
    msDraw += (performance.now() - tp0 - msDraw) * 0.1;

    var i, q, tt, a, hd;
    /* --- 2. the lava blobs: lumps riding the flow, cooling as they go ----- */
    ctx.globalCompositeOperation = "source-over";
    for (i = 0; i < blobs.length; i++) {
      q = blobs[i]; tt = q.life / q.ttl;
      /* a lump of melt riding over the crust: brighter than what it sits on
         (the melt's heat + a little), cooling as it goes, soft-edged */
      hd = heatAt(k.x - q.x + coolShift) * inten * (1.0 - 0.3 * tt);
      var pi = pal(hd * 1.05 + 0.10) * 3, pj = pal(hd * 0.9) * 3;
      var g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r * 1.3);
      g.addColorStop(0, "rgba(" + PAL[pi] + "," + PAL[pi + 1] + "," + PAL[pi + 2] + ",.95)");
      g.addColorStop(0.55, "rgba(" + PAL[pj] + "," + PAL[pj + 1] + "," + PAL[pj + 2] + ",.85)");
      g.addColorStop(1, "rgba(" + PAL[pj] + "," + PAL[pj + 1] + "," + PAL[pj + 2] + ",0)");
      ctx.globalAlpha = Math.min(1, (1 - tt) * 3) * Math.min(1, tt * 6);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 1.3, 0, 6.2832); ctx.fill();
    }

    /* --- 3. bubbles: a dome swelling, then a bright burst ------------------ */
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < bubbles.length; i++) {
      q = bubbles[i]; tt = q.life / q.ttl;
      hd = heatAt(k.x - q.x) * inten;
      if (tt < 0.78) {                       /* swelling: a darker rim, a brighter crown */
        var r = q.r * (0.3 + 0.7 * tt / 0.78);
        ctx.globalAlpha = 0.28 * Math.min(1, hd * 1.2) * (0.4 + 0.6 * tt);
        ctx.fillStyle = "rgb(255,214,140)";
        ctx.beginPath(); ctx.arc(q.x - r * 0.25, q.y - r * 0.3, r * 0.55, 0, 6.2832); ctx.fill();
      } else {                               /* the burst: a ring of light, 120 ms */
        var bt = (tt - 0.78) / 0.22;
        ctx.globalAlpha = (1 - bt) * 0.5 * Math.min(1, hd * 1.2);
        ctx.strokeStyle = "rgb(255,236,190)";
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 + 0.9 * bt), 0, 6.2832); ctx.stroke();
        ctx.globalAlpha *= 0.6;
        ctx.fillStyle = "rgb(255,246,220)";
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 0.5 * (1 - bt), 0, 6.2832); ctx.fill();
      }
    }

    /* --- 4. the heat shimmer: faint, slow, rising off the hot end --------- */
    for (i = 0; i < parts.length; i++) {
      q = parts[i]; tt = q.life / q.ttl;
      a = q.a * Math.sin(tt * 3.1416) * Math.min(1, inten);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgb(255,200,150)";
      ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r * 0.7, q.r * (1.2 + tt), 0, 0, 6.2832); ctx.fill();
    }

    /* --- 5. a few embers ---------------------------------------------------- */
    for (i = 0; i < sparks.length; i++) {
      q = sparks[i]; tt = q.life / q.ttl;
      a = Math.min(1, (1 - tt) * 1.6) * (0.7 + 0.3 * Math.sin(q.life * 30)) * Math.min(1, inten);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = q.hot ? "rgb(255,224,170)" : "rgb(255,120,20)";
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha *= 0.25;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r * 2.2, 0, 6.2832); ctx.fill();
    }

    /* --- 6. the hot lip under the knob's edge: the melt is brightest where
             the knob has just left it ------------------------------------- */
    if (!cooling && cols > 2) {
      var g2 = ctx.createLinearGradient(k.x - 16, 0, k.x + 4, 0);
      g2.addColorStop(0, "rgba(255,200,120,0)");
      g2.addColorStop(1, "rgba(255,236,200," + (0.30 * Math.min(1, inten)).toFixed(3) + ")");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g2;
      ctx.fillRect(k.x - 16, TY, 20, TH);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  function ignite() {
    if (!ctx || reduce.matches || !hellOn()) return;
    if (!CW) sizeFlame();
    /* a drag from cold lights the melt at once */
    if (dragging && amp < 0.5) amp = 0.5;
    if (!raf) { last = 0; lastKx = null; raf = global.requestAnimationFrame(frame); }
  }
  function stop() {
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    parts.length = 0; sparks.length = 0; bubbles.length = 0; blobs.length = 0;
    amp = 0; vel = 0; lastKx = null; shimAcc = 0; embAcc = 0; bubAcc = 0; blobAcc = 0;
    meanHeat = 0; litCols = 0; coolShift = 0; cooling = false;
    if (ctx && CW) ctx.clearRect(0, 0, CW, CH);
  }

  /* --- reduced motion: ONE magma frame in the uncovered region ------------
     Seeded, so the frame is the same every time it is drawn; no particles,
     no rAF. Redrawn only when the knob's position is published. */
  function drawStatic() {
    if (!ctx || !hellOn()) return;
    if (!CW) sizeFlame();
    if (!CW) return;
    var k = knobX();
    var kxT = k.x - TX;
    ctx.clearRect(0, 0, CW, CH);
    if (kxT < INSET + 6 && !track.classList.contains("done")) return;
    var seed = 0x9E3779B9, keepT = NT.slice(), keepOX = OX, keepOY = OY;
    rnd = function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
    for (var i = 0; i < NT.length; i++) NT[i] = rnd();
    OX = 12.5; OY = 31.25;
    stepNoise(4.0);
    var done = track.classList.contains("done");
    ctx.save(); clipTrack(ctx);
    var cols = paintField(kxT, k.y - TY, k.h / 2, 0, done ? 1.0 : 0.9 + 0.1 * progress, 4.0, false, done);
    drawField(cols);
    ctx.restore();
    NT.set(keepT); OX = keepOX; OY = keepOY; rnd = Math.random; noiseT = -1;
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
      return { parts: parts.length, sparks: sparks.length, bubbles: bubbles.length, blobs: blobs.length,
               amp: +amp.toFixed(3), vel: Math.round(vel), heat: +meanHeat.toFixed(3), cols: litCols,
               shift: Math.round(coolShift), cooling: cooling, raf: !!raf,
               ms: +fireMs.toFixed(2), msMax: +fireMax.toFixed(2), cells: FW + "x" + FH,
               msNoise: +msNoise.toFixed(2), msPaint: +msPaint.toFixed(2), msDraw: +msDraw.toFixed(2),
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
