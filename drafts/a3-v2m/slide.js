/* ==========================================================================
   Boo Machine — slide to join   (v2m: the completion flow)

   The light is v2l's, untouched in what it draws (the furnace port: a steep
   fall-off multiplied by a drifting, warped haze; a bloom on a slow
   envelope; the core with its amber ring; the shimmer band; the dust). What
   changed is how the control COMPLETES. The client on v2l: "There's a white
   flash when I reach the end. Maybe when I've reached the end, it starts
   flaming a bit quicker, and when I release, it goes somewhere. Also just
   clicking it should slide it through, then with a delay open the page."

   So the drag block, byte-identical from v2e-b through v2l, changes for the
   first time (the pointer capture and the draggable=false / dragstart guards
   that stop the <a>'s native drag are kept):

     no flash    the CSS flare (.hell-flare, the full-track white sweep) and
                 the canvas white-out (`burst`) are GONE. Completion is an
                 intensification, never a flash.
     armed       held past the threshold (72 % of the travel) or at the end:
                 armK eases 0 -> 1 over ~300 ms, and with it the fill's clocks
                 (haze drift, bloom envelope, core pulse and flicker) run up
                 to 2x, the core's intensity rises ~25 %, the field gains
                 ~12 %, the bloom's floor rises, the knob's rim brightens
                 (--ka), the room light goes 1.7 -> 1.9. Dragged back below
                 the threshold while held, it disarms (eases back, ~300 ms).
     go          released while armed: the knob eases to the very end (the
                 CSS spring, if it is not there yet), the fill HOLDS the
                 armed intensity (no fade; a deep-red floor rises under the
                 whole track over ~0.5 s so it all catches), the label is
                 gone, and after 650 ms the page navigates to the TestFlight
                 URL (knob.href, same tab). Enter / Space while armed (or at
                 the end) does the same; arriving at the end by ArrowRight
                 arms.
     click       a plain click / tap on the knob (< 6 px of movement) or on
                 the track: the knob runs from where it is to the end over
                 ~700 ms (ease-in-out, shorter from further along), the fill
                 following it in real time, arming as it crosses the
                 threshold, then the same hold and the same delay — ~1.35 s
                 from the click to the navigation. A press on the knob
                 interrupts it and becomes a normal drag from there. The <a>
                 never navigates on its own click.
     unchanged   hover; a release below the threshold (the spring back, the
                 ~600 ms cooling); the keyboard steps; the `hell` token;
                 reduced motion (a click jumps to the end, one static frame,
                 the same delay).

   QA hooks: ?slide=0.4|hover|armed|done, ?nonav=1 (the href becomes #gone,
   so a completed run sets location.hash instead of leaving the page),
   window.booSlide.set(p) / .done() / .arm(on) / .click() / .go() / .sweep(on,
   pxPerSec) / .timescale(k) / .release() / .reset() / .bloom(peak) / .flame
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

  var dragging = false, startX = 0, downX = 0, x = 0, max = 0, moved = 0;
  var frozen = false;                 /* ?slide=… : ignore pointer + hover   */
  var progress = 0;

  /* v2m: the completion flow */
  var THRESH = 0.72;                  /* the arming threshold (v2e-b's)      */
  var GO_DELAY = 650;                 /* ms from "go" to the navigation      */
  var AUTO_MS = 700;                  /* the click's auto-slide, full length */
  var armed = false;                  /* held past the threshold / at the end */
  var going = false;                  /* released while armed: delay running */
  var auto = false, autoRaf = 0;      /* the click's auto-slide is running   */
  var goTimer = 0;

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
    wrap.classList.toggle("is-open", p > 0.004);
    setRoomLight();
    if (reduce.matches) drawStatic(); else ignite();
  }
  /* --rl-d, the room's light: 1 -> 1.7 with the travel (v2i), and on to 1.9
     as the control arms (armK, eased in the frame loop). Published only
     when it moves by more than 0.5 % */
  var rlLast = -1;
  function setRoomLight() {
    var base = 1 + 0.7 * progress;
    var v = base + (1.9 - base) * armK;
    if (Math.abs(v - rlLast) < 0.005) return;
    rlLast = v;
    root.style.setProperty("--rl-d", v.toFixed(3));
  }
  function unpublish() {                      /* hand it back to the CSS     */
    wrap.style.removeProperty("--rev");
    wrap.style.removeProperty("--revp");
    root.style.removeProperty("--rl-d"); rlLast = -1;
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
    /* the light cools for ~600 ms before anything (a hover, the focus) may
       light the cap's pool again */
    if (amp > 0.05) coolUntil = simT + 0.65;   /* on the light's own clock */
    unpublish();
  }

  /* ---------- armed ------------------------------------------------------ */
  /* held past the threshold (or at the end): the fill's clocks run ~2x, the
     core rises ~25 %, the knob's rim brightens, the room light goes to 1.9 —
     all of it eased over ~300 ms by armK in the frame loop. Dragged back
     below the threshold while held, it eases back the same way. */
  function setArmed(on) {
    on = !!on;
    if (on === armed) return;
    armed = on;
    track.classList.toggle("is-armed", on);
    if (reduce.matches) { armL = on ? 1 : 0; armK = armL; setRoomLight(); setKnobArm(armK); drawStatic(); }
    else ignite();
  }

  /* ---------- go: a release while armed ---------------------------------- */
  /* the knob eases to the very end, the fill holds the armed intensity (a
     deep-red floor rising under the whole track), the label is gone, and
     after GO_DELAY the page navigates to knob.href — the TestFlight URL. */
  function go() {
    if (going) return;
    going = true;
    stopAuto();
    setArmed(true);
    track.classList.add("done");
    knob.classList.remove("dragging"); wrap.classList.remove("is-drag");
    measure(); x = max; place(max);             /* the CSS spring takes it the rest of the way */
    coolUntil = 0;
    if (reduce.matches) { goL = 1; goK = 1; drawStatic(); } else ignite();
    if (frozen) return;                          /* ?slide=done: parked, no navigation */
    /* (tscale is 1 unless QA slowed the clock: then the delay stretches with it) */
    goTimer = global.setTimeout(function () { goTimer = 0; global.location.href = knob.href; }, GO_DELAY / tscale);
  }

  /* ---------- the click: auto-slide -------------------------------------- */
  /* a plain click / tap on the knob or on the track: the knob runs from
     where it is to the end (ease-in-out, ~700 ms for the full travel), the
     fill following it in real time, arming as it crosses the threshold, then
     the same hold and delay. A press on the knob interrupts it: a normal
     drag from there. Under reduced motion: a jump to the end, the same delay. */
  function autoSlide() {
    if (going || auto || frozen) return;
    measure();
    if (reduce.matches) { x = max; place(max); setArmed(true); go(); return; }
    auto = true;
    knob.classList.add("dragging"); wrap.classList.add("is-drag");   /* no CSS easing: this loop drives it */
    kxDirty = true; ignite();
    var x0 = x, t0 = 0, dur = Math.max(250, AUTO_MS * (1 - x0 / max));
    (function step(ts) {
      autoRaf = global.requestAnimationFrame(step);
      if (!t0) { t0 = ts; return; }
      var u = Math.min(1, (ts - t0) * tscale / dur);   /* tscale: QA slow-motion, 1 otherwise */
      var e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      x = x0 + (max - x0) * e; place(x);
      setArmed(x > max * THRESH);
      if (u >= 1) { stopAuto(); go(); }
    })(0);
  }
  function stopAuto() {
    if (autoRaf) { global.cancelAnimationFrame(autoRaf); autoRaf = 0; }
    auto = false;
  }

  /* ---------- the drag ---------------------------------------------------- */
  function release() {
    knob.classList.remove("dragging");
    wrap.classList.remove("is-drag");
    if (armed && x > max * THRESH) { go(); }
    else { setArmed(false); rest(); }         /* below the threshold: the spring back, the light cools */
  }

  /* an <a> is natively draggable: without this, starting a mouse drag hands
     the gesture to HTML drag-and-drop, which fires pointercancel and kills
     the slide */
  knob.addEventListener("dragstart", function (e) { e.preventDefault(); });
  knob.addEventListener("pointerdown", function (e) {
    if (frozen || going) return;
    if (e.button && e.button !== 0) return;
    if (auto) stopAuto();                       /* a press interrupts the auto-slide: a drag from here */
    dragging = true; moved = 0; measure();
    downX = e.clientX; startX = e.clientX - x;  /* from wherever the knob is  */
    knob.classList.add("dragging");
    wrap.classList.add("is-drag");
    knob.setPointerCapture(e.pointerId);
    kxDirty = true; ignite();
  });
  knob.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    moved = Math.max(moved, Math.abs(e.clientX - downX));
    x = Math.max(0, Math.min(max, e.clientX - startX)); place(x);
    setArmed(x > max * THRESH);
    if (moved > 4) e.preventDefault();
  });
  knob.addEventListener("pointerup", function (e) {
    if (!dragging) return; dragging = false;
    if (moved > 6) { e.preventDefault(); release(); }
    else {
      /* a tap: the knob stays where it is and the auto-slide runs from there */
      wrap.classList.remove("is-drag"); knob.classList.remove("dragging");
      e.preventDefault(); autoSlide();
    }
  });
  knob.addEventListener("pointercancel", function () {
    if (dragging) { dragging = false; setArmed(false); x = 0; release(); }
  });
  /* the <a> never navigates on its own click: navigation happens only at the
     end of the flow (go, after the delay). A click that did not come through
     the pointer handlers (knob.click(), an assistive tech's activation) runs
     the auto-slide. */
  knob.addEventListener("click", function (e) {
    e.preventDefault();
    if (moved > 6) { moved = 0; return; }       /* the click a drag leaves behind */
    if (frozen || going || auto) return;
    autoSlide();
  });
  track.addEventListener("click", function (e) {
    if (knob.contains(e.target)) return;
    e.preventDefault();
    if (frozen || going || auto || dragging) return;
    autoSlide();
  });
  knob.addEventListener("keydown", function (e) {
    if (frozen || going) return;
    var atEnd;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (auto) stopAuto();
      measure();
      x = e.key === "ArrowRight" ? Math.min(max, x + max / 4) : Math.max(0, x - max / 4);
      place(x);
      setArmed(x >= max - 0.5);                 /* arriving at the end arms  */
      e.preventDefault();
    }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      atEnd = x >= max - 0.5;
      if (armed || atEnd) go(); else autoSlide();
    }
  });
  knob.addEventListener("blur", function () {
    hasFocus = false;
    if (!frozen && !going && !auto) { setArmed(false); rest(); }
  });
  knob.addEventListener("focus", function () { hasFocus = true; kxDirty = true; ignite(); });


  /* ======================================================================
     THE FILL — the engine (v2j's, minus the fill switch)
     ====================================================================== */
  var cv = track.querySelector(".hell-flame");
  var ctx = cv ? cv.getContext("2d") : null;

  var hovering = false, hasFocus = false, qaAwake = false, qaDrag = false;
  var amp = 0;
  var raf = 0, last = 0, lastKx = null, vel = 0;
  /* v2m: armK 0..1 — the armed state, eased over ~300 ms (armL is the linear
     ramp it is smoothed from); goK 0..1 — the go hold, eased over ~500 ms;
     fxT — the light's own clock, which runs up to 2x while armed */
  var armL = 0, armK = 0, goL = 0, goK = 0, fxT = 0, knobArm = -1;

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
  /* --ka: the armed rim on the knob (slide.css), 0..1; published like --kg */
  function setKnobArm(v) {
    v = clamp01(v);
    if (Math.abs(v - knobArm) < 0.015 && !(v === 0 && knobArm !== 0)) return;
    knobArm = v;
    wrap.style.setProperty("--ka", v.toFixed(3));
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
    return dragging || hovering || hasFocus || qaAwake || auto || going || armed ||
      armK > 0 || progress > 0.004;
  }
  function target() {
    if (going || armed || auto || dragging || qaDrag || (frozen && progress > 0.004)) return 1;
    if (simT < coolUntil) return 0;           /* just released: cooling      */
    if (hovering || hasFocus) return Math.min(1, 0.85 + progress * 1.2);
    return awake() ? 0.5 : 0;
  }

  /* --- the knob's left edge, in canvas px (v2h's cache, unchanged) ------ */
  var kxCache = null, kxDirty = true, knobMoving = false;
  function knobX() {
    if (kxCache && (dragging || qaDrag || auto) && knob.classList.contains("dragging")) {
      kxCache.x = kxCache.base + x; kxDirty = false;
      return kxCache;
    }
    if (kxCache && !kxDirty && !knobMoving) return kxCache;
    var k = knob.getBoundingClientRect(), r = cv.getBoundingClientRect();
    /* base: the knob's untransformed left in canvas px (the canvas is the
       track's padding box, the knob's offsetParent) — v2l measured it from
       the rect minus the inline transform, which was 9 px off under the
       hover creep */
    kxCache = { x: k.left - r.left, y: k.top - r.top + k.height / 2, w: k.width, h: k.height, base: knob.offsetLeft };
    kxDirty = false;
    return kxCache;
  }
  knob.addEventListener("transitionrun", function (e) { if (e.propertyName === "transform") knobMoving = true; });
  function knobSettled(e) { if (e.propertyName === "transform") { knobMoving = false; kxDirty = true; } }
  knob.addEventListener("transitionend", knobSettled);
  knob.addEventListener("transitioncancel", knobSettled);

  /* --- the frame ----------------------------------------------------------- */
  var S = { k: null, kxT: 0, kyT: 0, KR: 0, reach: 0, inten: 0, done: false, p: 0, t: 0,
            cooling: false, shift: 0, speed: 0, dt: 0, breath: 1, arm: 0, go: 0 };
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

    /* strikes in ~80 ms on a drag (~150 ms on hover), dies in ~600 ms */
    var tg = target();
    amp += (tg - amp) * Math.min(1, dt * (tg > amp ? (dragging || qaDrag || auto ? 24 : 14) : 5));
    if (amp < 0.02) amp = target() > 0 ? amp : 0;

    /* v2m: armed eases in and out over ~300 ms; the go hold over ~500 ms;
       the light's own clock runs up to 2x with the arming */
    armL = clamp01(armL + (armed ? 1 : -1) * dt / 0.3);
    armK = sstep(0, 1, armL);
    goL = clamp01(goL + (going ? 1 : -1) * dt / 0.5);
    goK = sstep(0, 1, goL);
    var fdt = dt * (1 + armK);
    fxT += fdt;
    setRoomLight();
    setKnobArm(armK * Math.min(1, amp));

    /* release below the threshold: the fill dies from the far end while
       amp dies — the two together are the ~600 ms to black */
    if (simT < coolUntil && !dragging && !qaDrag && !auto && !going) { cooling = true; coolShift += 520 * dt; }
    else { cooling = false; coolShift = 0; }

    var breath = (hovering || hasFocus) && !dragging && !qaDrag && !auto && p < 0.05
      ? 0.86 + 0.14 * Math.sin(ts / 420) : 1;
    var inten = amp * breath;
    simT += dt;

    S.k = k; S.kxT = kx - TX; S.kyT = k.y - TY; S.KR = k.h / 2; S.reach = S.kxT + S.KR;
    S.inten = inten; S.done = track.classList.contains("done");
    S.p = p; S.t = fxT; S.cooling = cooling; S.shift = coolShift; S.speed = Math.abs(vel); S.dt = fdt; S.breath = breath;
    S.arm = armK; S.go = goK;

    R.step(S);
    draw();

    var cost = performance.now() - t0;
    fireMs += (cost - fireMs) * 0.1; if (cost > fireMax) fireMax = cost;

    if (!awake() && amp < 0.02 && !R.busy()) stop();
  }

  function draw() {
    ctx.clearRect(0, 0, CW, CH);
    if (S.inten < 0.015) { setKnobGlow(0); return; }
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
    if (!armed) { armL = 0; armK = 0; setKnobArm(0); }
    if (!going) { goL = 0; goK = 0; }
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
    S.inten = done ? 1.0 : 0.9 + 0.1 * progress; S.done = done; S.p = progress;
    S.t = 4.0; S.cooling = false; S.shift = 0; S.speed = 0; S.dt = 0; S.breath = 1;
    S.arm = armed ? 1 : 0; S.go = going ? 1 : 0;
    R.staticFrame(S);
    ctx.save(); clipTrack(ctx);
    R.draw(ctx, S);
    eraseKnob(k);
    ctx.restore();
    R.reset();
    NT.set(keepT); OX = keepOX; OY = keepOY; rnd = Math.random;
    setKnobGlow(clamp01((kxT - INSET - 2) / 9));
    setKnobArm(armed ? 1 : 0);
  }

  /* ======================================================================
     THE LIGHT — the furnace port
     The slot is a cavity flooded with light from a source hidden behind the
     knob. No rays, no floor streak (v2l): what fills the cavity is the HAZE
     alone — a turbulent noise that MULTIPLIES a steep fall-off — plus the
     core, the shimmer band and a few motes. Five passes, all inside the
     clip, all left of the knob's centre:
       1  the FIELD (ImageData at 2 px cells): heat by distance with a steep
          inverse-square fall-off (heatL: pink-white inside ~10 px, saturated
          red by ~40, deep red by ~120, near-black by ~220, a faint warm
          haze past that), MULTIPLIED by the haze — three octaves of drifting
          value noise under a slow domain warp plus a fast fine octave, its
          contrast highest near the core (billows) and softer further back —
          and by the BLOOM: one more octave whose contrast follows a slow
          random envelope, so the hot zone now and then throws brighter
          turbulent patches; the cavity's walls a little darker than its
          middle; the source term added at the knob;
       2  the BRUSHED METAL: a tinted noise made once at device resolution,
          added over the lit region;
       3  the HEAT SHIMMER: the 18 px in front of the knob's edge are copied
          out and put back row by row, each row stretched by a small
          sinusoidal x-offset (0 at the band's left edge, ±1.26 px at the
          knob) that runs up the band;
       4  the DUST: ≤ 18 sharp motes with parallax, lit where the haze is
          bright;
       5  the CORE: a radial gradient off the knob's semicircle, #FFF0EA at
          the rim with a thin amber ring (#FFB347) just outside it, breathing
          ±9 % over ~1.2 s with a rare 0.15 s micro-flicker.
     Every clock (`clk`) is drawn from `rnd` once per page load (seeded under
     reduced motion): no two layers share a period or a phase.
     ====================================================================== */
  var LIGHT = (function () {
    var CELL = 2, FW = 0, FH = 0, CX = 0, CY = 0, img = null, fCv = null, fCtx = null;
    var HZ = null, BZ = null, nT = -1, hzCols = 0, NOISE_DT = 1 / 30, vp = null, sp = null;
    var metal = null, mW = 0, mH = 0;
    var band = null, bCtx = null, BW = 18;
    var dust = [], dustAcc = 0;
    var clk = null, pulse = 1, bloom = 0;
    var PAL = makePal([
      [0.00, 0, 0, 0], [0.10, 30, 0, 0], [0.24, 112, 0, 0], [0.42, 200, 0, 0],
      [0.58, 249, 0, 0], [0.72, 255, 38, 0], [0.84, 255, 112, 72], [0.95, 255, 186, 152],
      [1.05, 255, 228, 218], [1.30, 255, 240, 234]
    ]);
    /* the fall-off: a tight inverse-square term (softening radius 20 px)
       over a wider one (78 px). 1 at the knob, .92 at 10 px, .52 at 40,
       .17 at 120, .069 at 220, .038 at 300 — with the palette: pink-white
       (the core on top), saturated red, deep red, near-black, a faint warm
       floor the haze billows through */
    var HT = new Float32Array(513);
    for (var d0 = 0; d0 <= 512; d0++) {
      var q1 = d0 / 20, q2 = d0 / 78;
      HT[d0] = 0.58 / Math.pow(1 + q1 * q1, 0.7) + 0.42 / (1 + q2 * q2);
    }
    function heatL(d) { if (d < 0) d = 0; if (d > 511) return HT[512]; var i = d | 0; return HT[i] + (HT[i + 1] - HT[i]) * (d - i); }
    var colH = new Float32Array(1024), colC = new Float32Array(1024), colK = new Float32Array(1024), colB = new Float32Array(1024), colF = new Float32Array(1024);

    /* the clocks: one set per page load, nothing shared between layers.
       Haze drift is v2k's × 1.8 */
    function makeClocks(t) {
      clk = {
        hzSx1: 9.7 + rnd() * 2.2, hzSy1: 1.4 + rnd() * 0.9,      /* octave 1: ~11 px/s left, ~1.9 px/s up */
        hzSx2: 2.9 + rnd() * 1.4, hzSy2: 0.55 + rnd() * 0.55,    /* octave 2: ~3.6 px/s left, ~.8 px/s up */
        hzSx3: 1.3 + rnd() * 0.9, hzSy3: 0.3 + rnd() * 0.3,      /* octave 3: ~1.7 px/s */
        hzSx4: 14 + rnd() * 6, hzSy4: 2 + rnd() * 2,             /* the fast fine octave: ~17 px/s left */
        wpS: 0.9 + rnd() * 0.6, wpO: rnd() * 40, wpA: 22 + rnd() * 10,   /* the domain warp: ~1.2 px/s, 22–32 px */
        blS: 12 + rnd() * 5, blSy: 1.5 + rnd() * 1.5, blO: rnd() * 40,   /* the bloom octave: ~14 px/s left */
        bloomNext: t + 1.5 + rnd() * 3, bloomT0: -1, bloomUp: 0.7, bloomHold: 0.4, bloomDown: 1.2, bloomPk: 0.8,
        pulseP: 1.1 + rnd() * 0.25, pulsePh: rnd() * 6.283,      /* the core: ~1.2 s */
        flickNext: t + 1 + rnd() * 3, flickUntil: -1, flickPh: 0, flickHz: 18 + rnd() * 8,
        shimK: 0.5 + rnd() * 0.3, shimW: 7 + rnd() * 5, shimPh: rnd() * 6.283    /* the heat shimmer: rad/px, rad/s */
      };
    }

    function resize() {
      FW = Math.round((TW - 2 * INSET) / CELL); CX = (TW - 2 * INSET) / FW;
      FH = Math.round((TH - 2 * INSET) / CX);   CY = (TH - 2 * INSET) / FH;
      HZ = new Float32Array(FW * FH); BZ = new Float32Array(FW * FH); vp = new Float32Array(FH); sp = new Float32Array(FH);
      for (var y = 0; y < FH; y++) {
        var yf = (y + 0.5) / FH;
        vp[y] = 0.74 + 0.26 * Math.sin(yf * Math.PI);            /* the walls darker than the middle */
        sp[y] = 0.25 + 0.75 * Math.pow(Math.sin(yf * Math.PI), 0.8);   /* the source: a glow from the knob's round end, not a column */
      }
      if (!fCv) { fCv = doc.createElement("canvas"); fCtx = fCv.getContext("2d"); }
      fCv.width = FW; fCv.height = FH; img = fCtx.createImageData(FW, FH);
      if (!band) { band = doc.createElement("canvas"); bCtx = band.getContext("2d"); }
      band.width = Math.ceil((BW + 2) * DPR); band.height = Math.ceil((TH - 2 * INSET) * DPR);
      nT = -1; hzCols = 0;
      makeMetal();
      if (!clk) makeClocks(0);
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
    function reset() { dust.length = 0; dustAcc = 0; nT = -1; hzCols = 0; }
    function busy() { return dust.length > 0; }

    /* the haze at a point (track coords), 0..1: three octaves of value
       noise drifting LEFT and slowly UP under a slow DOMAIN WARP (the
       sample point is pushed around by another, slower noise, 22–32 px, so
       the billows fold instead of sliding as a picture), plus a fast fine
       octave (~17 px/s) for the small flicker. Rounder cells than v2k's
       (y scale 1.6× the x scale, not 3.75×): billows, not streaks. Stretched
       ×1.7 about the mean so it has contrast; clamped */
    function hazeAt(xT, yT, t) {
      var wx = (vn(xT * 0.016 + OX + clk.wpO + t * 0.016 * clk.wpS, yT * 0.026 + OY + 5 + t * 0.006) - 0.5) * clk.wpA;
      var wy = (vn(xT * 0.016 + OX + clk.wpO + 17 + t * 0.011 * clk.wpS, yT * 0.026 + OY + 29 - t * 0.008) - 0.5) * clk.wpA * 0.7;
      var x = xT + wx, y = yT + wy;
      var v = vn(x * 0.018 + OX + t * 0.018 * clk.hzSx1, y * 0.030 + OY + t * 0.030 * clk.hzSy1) * 0.46 +
              vn(x * 0.045 + OX + 31 + t * 0.045 * clk.hzSx2, y * 0.072 + OY + 7 + t * 0.072 * clk.hzSy2) * 0.29 +
              vn(x * 0.10 + OX + 53 + t * 0.10 * clk.hzSx3, y * 0.15 + OY + 19 + t * 0.15 * clk.hzSy3) * 0.15 +
              vn(xT * 0.16 + OX + 41 + t * 0.16 * clk.hzSx4, yT * 0.21 + OY + 37 + t * 0.21 * clk.hzSy4) * 0.10;
      v = (v - 0.5) * 1.7 + 0.5;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }
    /* the bloom octave: one mid-scale noise drifting faster than the haze,
       lightly warped by the same field's first term */
    function bloomAt(xT, yT, t) {
      var v = vn(xT * 0.05 + OX + clk.blO + t * 0.05 * clk.blS, yT * 0.08 + OY + 61 + t * 0.08 * clk.blSy) * 0.7 +
              vn(xT * 0.11 + OX + clk.blO + 23 + t * 0.11 * clk.blS * 1.3, yT * 0.17 + OY + 83) * 0.3;
      v = (v - 0.5) * 2.2 + 0.5;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    }
    /* the haze field, in TRACK coordinates so it stays put while the knob
       moves through it; refreshed at 30 Hz, and only the columns that are
       lit (`cols`), plus whatever the knob has newly uncovered since */
    function stepHaze(t, c0, c1) {
      for (var y = 0; y < FH; y++) {
        var yc = INSET + (y + 0.5) * CY, i = y * FW + c0;
        for (var x = c0; x < c1; x++, i++) {
          var xc = INSET + (x + 0.5) * CX;
          HZ[i] = hazeAt(xc, yc, t);
          BZ[i] = bloomAt(xc, yc, t);
        }
      }
    }

    function stepClocks(S) {
      var t = S.t, dt = S.dt;
      /* the bloom envelope: rests at .15; every 3–8 s rises (0.5–1 s) to a
         peak of .6–1, holds a beat, falls (1–2 s) — a slow random envelope
         on the bloom octave's contrast */
      if (dt > 0 && t > clk.bloomNext) {
        clk.bloomT0 = t; clk.bloomUp = 0.5 + rnd() * 0.5; clk.bloomHold = 0.2 + rnd() * 0.5; clk.bloomDown = 1 + rnd();
        clk.bloomPk = 0.6 + rnd() * 0.4; clk.bloomNext = t + 3 + rnd() * 5;
      }
      var e = 0;
      if (clk.bloomT0 >= 0) {
        var u = t - clk.bloomT0;
        if (u < clk.bloomUp) e = sstep(0, 1, u / clk.bloomUp);
        else if (u < clk.bloomUp + clk.bloomHold) e = 1;
        else if (u < clk.bloomUp + clk.bloomHold + clk.bloomDown) e = 1 - sstep(0, 1, (u - clk.bloomUp - clk.bloomHold) / clk.bloomDown);
        else { e = 0; clk.bloomT0 = -1; }
        e *= clk.bloomPk;
      }
      bloom = 0.15 + 0.85 * e + 0.35 * S.arm * (1 - e);         /* armed: the furnace port stays open */
      /* the source: ±9 % over ~1.2 s, plus a rare 0.15 s micro-flicker */
      pulse = 1 + 0.09 * Math.sin(6.2832 * t / clk.pulseP + clk.pulsePh);
      if (dt > 0 && t > clk.flickNext) { clk.flickUntil = t + 0.15; clk.flickNext = t + 1.5 + rnd() * 4.5; clk.flickPh = rnd() * 6.283; }
      if (t < clk.flickUntil) pulse *= 1 + 0.08 * Math.sin(t * 6.2832 * clk.flickHz + clk.flickPh) * Math.sin(3.1416 * (clk.flickUntil - t) / 0.15);
    }
    /* the haze's brightness at a mote (track coords) — what gates the dust */
    function hazeCell(xT, yT) {
      var x = ((xT - INSET) / CX) | 0, y = ((yT - INSET) / CY) | 0;
      if (x < 0) x = 0; if (x >= FW) x = FW - 1; if (y < 0) y = 0; if (y >= FH) y = FH - 1;
      return HZ[y * FW + x];
    }

    function step(S) {
      var need = Math.min(FW, Math.ceil((S.reach - INSET) / CX) + 2);
      if (nT < 0 || S.t - nT >= NOISE_DT) { nT = S.t; stepHaze(S.t, 0, need); hzCols = need; }
      else if (need > hzCols) { stepHaze(nT, hzCols, need); hzCols = need; }
      stepClocks(S);
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
       no integration (dt 0), the bloom at rest */
    function staticFrame(S) {
      makeClocks(S.t); makeMetal(); stepHaze(S.t, 0, FW); hzCols = FW; nT = S.t; dust.length = 0;
      clk.bloomT0 = -1; stepClocks(S);
    }

    function paint(S) {
      var W = FW, H = FH, x, y, i = 0, d = img.data, cols = 0;
      var inten = S.inten, bl = bloom, arm = S.arm, go = S.go;
      var coreK = 0.62 * (1 + 2 * (pulse - 1)) * (1 + 0.25 * arm);   /* the source term follows the pulse (±18 %); +25 % armed */
      var gain = 1 + 0.22 * arm;                                    /* the field brighter armed */
      var kk = 1 + 0.25 * arm;                                      /* and its billows more contrasty */
      var floor = 0.42 * go;                                        /* going: a deep-red floor rises under the whole track */
      for (x = 0; x < W; x++) {
        var xc = INSET + (x + 0.5) * CX;
        if (xc < S.reach + CX) cols = x + 1;
        var dd = S.kxT - xc + S.shift;
        var h = heatL(dd);
        if (h < floor) h = floor;
        colH[x] = h * inten * gain;
        var d1 = dd < 0 ? 0 : dd;
        /* the source: the last ~10 px before the knob go pink-white. ADDED,
           not multiplied, so the haze cannot turn the core red */
        colC[x] = dd < 40 ? coreK * Math.exp(-d1 / 7.5) * inten : 0;
        /* the haze's contrast: high near the core (billows), softer back;
           and shrinking to nothing right at the source */
        colK[x] = (0.34 + 0.34 * Math.exp(-d1 / 70)) * (1 - 0.6 * Math.exp(-d1 / 8)) * kk;
        /* the bloom's reach: the hot zone only */
        colB[x] = 0.8 * bl * Math.exp(-d1 / 55) * (1 - 0.6 * Math.exp(-d1 / 8));
        /* the warm floor at the far end: a faint haze the billows show in */
        var cw = 1 - h; if (cw < 0) cw = 0;
        colF[x] = 0.055 * cw * cw * inten;
      }
      for (y = 0; y < H; y++) {
        var v0 = vp[y], c0 = sp[y] * v0;
        i = y * W;
        for (x = 0; x < W; x++, i++) {
          var o = i * 4;
          if (x >= cols) { d[o + 3] = 0; continue; }
          var hz = HZ[i], bz = BZ[i];
          /* the fall-off MULTIPLIED by the haze (and the bloom), the walls
             darker, the source added on top, the far floor's warm haze */
          var m = 1 + colK[x] * (2 * hz - 1) + colB[x] * (2 * bz - 1);
          if (m < 0.05) m = 0.05;
          var v = colH[x] * m * v0 + colC[x] * c0 + colF[x] * hz;
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
      var inten = Math.min(1, S.inten);
      var fade = S.shift ? Math.max(0, 1 - S.shift / 120) : 1;
      /* 1 the field */
      c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; c.imageSmoothingEnabled = true;
      c.drawImage(fCv, 0, 0, cols, FH, x0, y0, lit, ih);
      /* 2 the brushed metal, added: fine red streaks where the light is weak */
      c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.10 * inten;
      c.drawImage(metal, 0, 0, Math.round(iw * DPR), mH, x0, y0, iw, ih);
      /* 3 the heat shimmer at the knob's edge: the band in front of it is
         copied out and put back one css-px row at a time, each row
         stretched so its right end sits ±A px off — a sinusoid up the band.
         The offset is 0 at the band's left edge (snapped to a device px, so
         the copy is exact there and there is no seam); the copy is 2 px
         wider than what is cleared, so a row pulled left still covers it.
         A is v2k's × 1.4 */
      var bx = Math.round((TX + S.kxT - BW) * DPR) / DPR, by = y0, bw = BW, bh = ih;
      if (bx > x0 && inten > 0.05) {
        var A = 1.26 * inten * fade * (1 + 0.5 * S.arm);        /* armed: the shimmer wider */
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
      /* 4 the dust: sharp, sparse, lit where the haze is bright */
      c.globalCompositeOperation = "lighter";
      for (i = 0; i < dust.length; i++) {
        var q = dust[i], tt = q.life / q.ttl;
        var hd = Math.pow(heatL(S.kxT - q.x), 0.7) * inten * q.br;
        var hb = 0.06 + 0.94 * sstep(0.42, 0.88, hazeCell(q.x, q.y));
        var al2 = Math.sin(tt * 3.1416) * hd * hb * (0.6 + 0.4 * Math.sin(q.life * q.w + q.ph));
        if (al2 <= 0.02) continue;
        c.globalAlpha = Math.min(1, al2);
        c.fillStyle = "rgb(255,214,196)";
        c.fillRect(TX + q.x - q.r, TY + q.y - q.r, q.r * 2, q.r * 2);
      }
      /* 5 the core: #FFF0EA at the knob's rim, a thin amber ring (#FFB347)
         just outside it, then salmon into the red; its radius and its alpha
         breathe with the pulse (±9 %) */
      var kcx = TX + S.kxT + S.KR, kcy = TY + S.kyT, KR = S.KR, RO = (KR + 31) * pulse * (1 + 0.2 * S.arm);
      var cg = c.createRadialGradient(kcx, kcy, Math.max(0, KR - 2), kcx, kcy, RO);
      var ci = inten * (S.cooling ? Math.max(0, 1 - S.shift / 60) : 1) * pulse * (1 + 0.25 * S.arm);   /* armed: +25 % */
      cg.addColorStop(0,    "rgba(255,240,234," + Math.min(1, 0.97 * ci).toFixed(3) + ")");
      cg.addColorStop(0.13, "rgba(255,228,214," + Math.min(1, 0.84 * ci).toFixed(3) + ")");
      cg.addColorStop(0.22, "rgba(255,196,150," + Math.min(1, 0.58 * ci).toFixed(3) + ")");
      cg.addColorStop(0.28, "rgba(255,179,71,"  + Math.min(1, 0.40 * ci).toFixed(3) + ")");   /* the amber ring, ~2 px */
      cg.addColorStop(0.36, "rgba(255,100,50,"  + Math.min(1, 0.34 * ci).toFixed(3) + ")");
      cg.addColorStop(0.60, "rgba(255,50,20,"   + Math.min(1, 0.16 * ci).toFixed(3) + ")");
      cg.addColorStop(1,    "rgba(255,38,0,0)");
      c.globalAlpha = 1; c.fillStyle = cg;
      c.beginPath(); c.arc(kcx, kcy, RO, 0, 6.2832); c.fill();
      c.globalCompositeOperation = "source-over";
      return lit;
    }
    /* QA: throw a bloom now (the next scheduled one is pushed back) */
    function bloomNow(pk) {
      if (!clk) return 0;
      clk.bloomT0 = fxT; clk.bloomUp = 0.5; clk.bloomHold = 0.6; clk.bloomDown = 1.4;
      clk.bloomPk = pk > 0 ? Math.min(1, pk) : 1; clk.bloomNext = fxT + 4 + rnd() * 4;
      return clk.bloomPk;
    }
    return { name: "light", resize: resize, reset: reset, step: step, draw: draw, busy: busy, heat: heatL, staticFrame: staticFrame,
             bloom: bloomNow,
             stats: function () {
               return { dust: dust.length, bloom: +bloom.toFixed(3), pulse: +pulse.toFixed(3), t: +fxT.toFixed(2), cells: FW + "x" + FH, hzCols: hzCols };
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
    if (p >= 1) { wrap.classList.add("is-done"); go(); return; }   /* frozen: no navigation */
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
    arm: function (on) { setArmed(on !== false); },      /* QA: arm / disarm now */
    click: function () { autoSlide(); },                  /* QA: what a click does */
    go: function () { go(); },                            /* QA: what a release while armed does */
    sweep: sweep,
    bloom: function (pk) { return R.bloom(pk); },       /* QA: throw a bloom now */
    timescale: function (k) { tscale = k > 0 ? k : 1; },  /* QA: slows the light, the auto-slide and the go delay alike */
    release: function () {
      frozen = false; qaAwake = false; qaDrag = false;
      knob.classList.remove("dragging"); wrap.classList.remove("is-drag"); rest();
    },
    reset: function () {
      frozen = false; qaAwake = false; qaDrag = false;
      if (sweepRaf) { global.cancelAnimationFrame(sweepRaf); sweepRaf = 0; }
      stopAuto();
      if (goTimer) { global.clearTimeout(goTimer); goTimer = 0; }
      going = false; setArmed(false);
      knob.classList.remove("dragging");
      wrap.classList.remove("is-drag", "is-done");
      track.classList.remove("done"); rest();
    },
    get progress() { return progress; },
    get max() { return max; },
    get armed() { return armed; },
    get going() { return going; },
    get auto() { return auto; },
    get flame() {
      var o = { amp: +amp.toFixed(3), vel: Math.round(vel), heat: +meanHeat.toFixed(3), cols: Math.round(litCols),
                shift: Math.round(coolShift), cooling: cooling, raf: !!raf, kg: knobGlow < 0 ? 0 : +knobGlow.toFixed(3),
                ka: knobArm < 0 ? 0 : +knobArm.toFixed(3), arm: +armK.toFixed(3), go: +goK.toFixed(3),
                armed: armed, going: going, auto: auto, sim: +simT.toFixed(2), kx: +S.kxT.toFixed(1), reach: +S.reach.toFixed(1),
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
      /* ?nonav=1: the href becomes #gone, so a completed run sets
         location.hash instead of leaving the page (QA) */
      if (q2.get("nonav") === "1") knob.setAttribute("href", "#gone");
      if (q2.has("slide")) {
        var v = q2.get("slide");
        if (v === "done" || v === "1") forceTo(1);
        else if (v === "armed") { forceTo(0.85); setArmed(true); }
        else if (v === "hover") { wrap.classList.add("is-hover-demo"); qaAwake = true; hovering = true; ignite(); }
        else { var n = parseFloat(v); if (n === n) forceTo(n); }
      }
    } catch (e) {}
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  global.addEventListener("load", function () { sizeFlame(); if (reduce.matches) drawStatic(); });
})(window);
