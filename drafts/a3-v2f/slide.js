/* ==========================================================================
   Boo Machine — slide to unlock   (v2f)

   The pointer / capture / drag logic is v2e-b's, moved out of index.html's
   inline block unchanged in behaviour. What is new is everything it now
   DRIVES, published as two custom properties on .unlock-wrap and read by
   slide.css:

       --rev   <length>  the knob's right edge = how far the hatch is open
       --revp  <number>  the same as 0..1

   plus:
     * --rl-d on <html>, a multiplier the room light's opacity picks up, so
       opening the door brightens the whole room (title.css);
     * the ember canvas, a short rAF that only runs while the hatch is open;
     * a 300 ms full-track flare on completion, then the navigation that used
       to happen immediately.

   QA hook:  ?slide=0.4   park the knob at 40 % and freeze it there
             ?slide=done  the completed state, WITHOUT navigating
   window.booSlide.set(p) / .done() / .progress does the same at runtime.
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
    /* the hatch is open from the track's left edge to the knob's right edge */
    var rev = v + knob.offsetWidth + 5;
    wrap.style.setProperty("--rev", rev.toFixed(1) + "px");
    wrap.style.setProperty("--revp", p.toFixed(4));
    /* the room light opens with it */
    root.style.setProperty("--rl-d", (1 + 1.15 * p).toFixed(3));
    wrap.classList.toggle("is-open", p > 0.004);
    if (p > 0.004) startEmbers(); else stopEmbers();
  }
  function unpublish() {                      /* hand it back to the CSS     */
    wrap.style.removeProperty("--rev");
    wrap.style.removeProperty("--revp");
    root.style.removeProperty("--rl-d");
    progress = 0;
    wrap.classList.remove("is-open");
    /* the glow collapses over the .4s transition in slide.css; the embers
       burn out with it rather than vanishing on the frame of release */
    emberFade = performance.now() + 420;
  }

  function place(v) {
    knob.style.transform = "translateX(" + v + "px)";
    if (label) label.style.opacity = String(Math.max(0, 1 - v / (max * 0.55)));
    publish(v);
  }
  function rest() {
    x = 0;
    knob.style.transform = "";
    if (label) label.style.opacity = "";
    unpublish();
  }

  /* ---------- completion ------------------------------------------------ */
  function finish(navigate) {
    track.classList.add("done");
    measure(); x = max; place(max);
    track.classList.remove("is-flare"); void track.offsetWidth;
    track.classList.add("is-flare");
    root.style.setProperty("--rl-d", "2.3");
    if (navigate === false) return;
    /* the flare is 300 ms; leave a beat of it on screen, then go */
    global.setTimeout(function () { global.location.href = knob.href; }, 260);
  }

  /* ---------- the drag (v2e-b's, unchanged) ----------------------------- */
  function release() {
    knob.classList.remove("dragging");
    wrap.classList.remove("is-drag");
    if (x > max * 0.72) { finish(true); }
    else { rest(); }
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
    if (!frozen && !track.classList.contains("done")) rest();
  });

  /* ---------- embers ----------------------------------------------------
     Small, few, fast: they come off the coal bed inside whatever part of the
     hatch is open and rise out of it into the air above the track. One rAF,
     started only while the hatch is open and stopped ~0.4 s after it closes.  */
  var cv = wrap.querySelector(".hell-embers");
  var ctx = cv ? cv.getContext("2d") : null;
  var sparks = [], eraf = 0, elast = 0, emberFade = 0, cw = 0, ch = 0, cyTrack = 0;
  var NSPARK = 14;

  function sizeEmbers() {
    if (!cv) return;
    var r = cv.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    cw = r.width; ch = r.height;
    if (!(cw > 0 && ch > 0)) return;
    cv.width = Math.round(cw * DPR); cv.height = Math.round(ch * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cyTrack = (track.getBoundingClientRect().top - r.top);   /* track top in canvas px */
  }
  function seedSpark(p) {
    var rev = parseFloat(getComputedStyle(wrap).getPropertyValue("--rev")) || 0;
    var x0 = 18;                                   /* canvas x of track left */
    p.x = x0 + Math.random() * Math.max(8, rev - 6);
    p.y = cyTrack + track.offsetHeight * (0.45 + Math.random() * 0.45);
    p.vx = (Math.random() - 0.42) * 26;
    p.vy = -(58 + Math.random() * 105);            /* fast */
    p.life = 0;
    p.ttl = 0.5 + Math.random() * 0.75;
    p.s = 0.55 + Math.random() * 1.0;
    p.hot = Math.random() < 0.35;
    return p;
  }
  function emberFrame(ts) {
    eraf = global.requestAnimationFrame(emberFrame);
    if (!ctx) return;
    if (!elast) elast = ts;
    var dt = Math.min(64, ts - elast) / 1000; elast = ts;
    var rev = parseFloat(getComputedStyle(wrap).getPropertyValue("--rev")) || 0;
    var open = rev > 4;
    var p95 = parseFloat(getComputedStyle(wrap).getPropertyValue("--revp")) || 0;
    ctx.clearRect(0, 0, cw, ch);
    if (!open && !sparks.length) {
      if (performance.now() > emberFade) { stopEmbers(); }
      return;
    }
    var want = open ? Math.round(2 + NSPARK * Math.min(1, 0.25 + p95)) : 0;
    while (sparks.length < want) sparks.push(seedSpark({}));
    ctx.globalCompositeOperation = "lighter";
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life += dt;
      if (s.life > s.ttl) {
        if (open && sparks.length <= want) { seedSpark(s); }
        else { sparks.splice(i, 1); }
        continue;
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy *= (1 - 0.7 * dt);
      var k = 1 - s.life / s.ttl;
      var a = Math.min(1, k * 1.25) * (0.55 + 0.45 * Math.sin(s.life * 34));
      var r = s.s * (0.55 + 0.45 * k);
      ctx.globalAlpha = Math.max(0, a) * (0.3 + 0.7 * p95);
      /* an ember is a SPARK: a hard little core and a small halo, not bokeh */
      ctx.fillStyle = s.hot ? "rgba(255,216,150,1)" : "rgba(255,104,12,1)";
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha *= 0.20;
      ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  /* the `hell` token gates the furnace (slide.css) and, here, its only rAF */
  function hellOn() {
    var hero = doc.querySelector(".hero");
    return !hero || (" " + (hero.getAttribute("data-fx") || "") + " ").indexOf(" hell ") >= 0;
  }
  function startEmbers() {
    if (!ctx || reduce.matches || !hellOn()) return;
    if (!cw) sizeEmbers();
    if (!eraf) { elast = 0; eraf = global.requestAnimationFrame(emberFrame); }
  }
  function stopEmbers() {
    if (eraf) { global.cancelAnimationFrame(eraf); eraf = 0; }
    sparks.length = 0;
    if (ctx && cw) ctx.clearRect(0, 0, cw, ch);
  }
  global.addEventListener("resize", function () { sizeEmbers(); }, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) stopEmbers(); else if (progress > 0.004) startEmbers();
  });

  /* the turbulence is SMIL, which no media query can reach */
  function applyReduce() {
    var svg = doc.getElementById("hell-defs");
    if (!svg) return;
    if (reduce.matches) { if (svg.pauseAnimations) svg.pauseAnimations(); stopEmbers(); }
    else if (svg.unpauseAnimations) svg.unpauseAnimations();
  }
  reduce.addEventListener("change", applyReduce);

  /* ---------- QA hook ---------------------------------------------------- */
  function forceTo(p) {
    frozen = true;
    measure();
    wrap.classList.add("is-drag");          /* no easing, park it exactly    */
    if (p >= 1) { wrap.classList.add("is-done"); finish(false); return; }
    x = max * Math.max(0, Math.min(1, p));
    place(x);
  }
  global.booSlide = {
    set: forceTo,
    done: function () { forceTo(1); },
    reset: function () { frozen = false; wrap.classList.remove("is-drag", "is-done"); track.classList.remove("done", "is-flare"); rest(); },
    get progress() { return progress; },
    get max() { return max; }
  };

  function boot() {
    sizeEmbers(); applyReduce();
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.has("slide")) {
        var v = q.get("slide");
        if (v === "flare") { forceTo(1); track.classList.add("is-flare-hold"); }
        else if (v === "done" || v === "1") forceTo(1);
        else if (v === "hover") { wrap.classList.add("is-hover-demo"); }
        else { var n = parseFloat(v); if (n === n) forceTo(n); }
      }
    } catch (e) {}
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  global.addEventListener("load", function () { sizeEmbers(); });
})(window);
