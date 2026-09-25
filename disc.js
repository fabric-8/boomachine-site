/* =========================================================================
   disc.js (v2c) — the whole API for the disc reflection.

     Disc.setPointer(x, y, immediate)   x,y in -1..1  (stage-relative)
     Disc.mount(el)                     adopt another .disc-light (optional)

   setArt() is gone: since v2c the printed label is part of the photographic
   unit image, so the page's own window.booUnit owns which art is showing and
   this file only ever drives the light.

   Deliberately NOT here: no document/window listeners, no idle animation, no
   layout reads. The host page owns the pointer and calls setPointer(). All
   this file ever does is write two custom properties on the elements, and it
   stops writing entirely under prefers-reduced-motion so the static angle
   baked into disc.css survives.
   ========================================================================= */
(function (global) {
  "use strict";

  var mq = global.matchMedia ? global.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var els = [];

  var tx = 0, ty = 0;   /* target   */
  var cx = 0, cy = 0;   /* current  */
  var raf = 0;

  function reduced() { return !!(mq && mq.matches); }

  /* v12 perf: only the lights that can be SEEN are written. The page keeps
     one .disc-light per hand, each in an .lbox that is at opacity 0 unless
     it carries .is-on, and the host writes the pointer every frame (the
     idle sway never stops while the hero is on screen). --px / --py are
     registered, inherited properties, so each write restyles the light and
     its four layers (the iris fans' atan2 and conic gradients, the
     specular's translate): 15 elements a frame, two thirds of them
     invisible. A light whose box is not .is-on is skipped once it has been
     off for longer than the crossfade (1.05 s, index.html .lbox) — so the
     hand fading out keeps following the pointer to the end of its fade —
     and it gets the current value on the first frame it is .is-on again,
     before its own fade-in can show anything. A light outside an .lbox
     (Disc.mount on another element) is always written. */
  var offSince = [], FADE_MS = 1200;
  function visible(i, now) {
    var box = els[i].parentNode;
    if (!box || !box.classList || !box.classList.contains("lbox") || box.classList.contains("is-on")) { offSince[i] = 0; return true; }
    if (!offSince[i]) offSince[i] = now;
    return now - offSince[i] < FADE_MS;
  }
  function write() {
    var now = global.performance ? global.performance.now() : Date.now();
    var px = cx.toFixed(4), py = cy.toFixed(4);
    for (var i = 0; i < els.length; i++) {
      if (!visible(i, now)) continue;
      els[i].style.setProperty("--px", px);
      els[i].style.setProperty("--py", py);
    }
  }

  function clear() {
    for (var i = 0; i < els.length; i++) {
      els[i].style.removeProperty("--px");
      els[i].style.removeProperty("--py");
    }
  }

  /* One short-lived rAF that eases toward the target and then stops. If the
     host already smooths its pointer (the V2 masthead does), call with
     immediate = true and this never runs at all. */
  function tick() {
    var dx = tx - cx, dy = ty - cy;
    cx += dx * 0.16;
    cy += dy * 0.16;
    if (Math.abs(dx) < 0.0015 && Math.abs(dy) < 0.0015) {
      cx = tx; cy = ty; write(); raf = 0; return;
    }
    write();
    raf = global.requestAnimationFrame(tick);
  }

  function clamp(v) {
    v = +v;
    if (!(v === v)) return 0;           /* NaN */
    return v < -1 ? -1 : v > 1 ? 1 : v;
  }

  var Disc = {
    mount: function (el) {
      if (!el) return Disc;
      var list = el.nodeType ? [el] : [].slice.call(el);
      for (var i = 0; i < list.length; i++) {
        if (els.indexOf(list[i]) < 0) els.push(list[i]);
      }
      if (reduced()) clear(); else write();
      return Disc;
    },

    setPointer: function (x, y, immediate) {
      if (reduced()) { clear(); return Disc; }
      tx = clamp(x); ty = clamp(y);
      if (immediate) {
        cx = tx; cy = ty;
        if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
        write();
      } else if (!raf) {
        raf = global.requestAnimationFrame(tick);
      }
      return Disc;
    }
  };

  /* auto-mount every .disc-light already in the document */
  function boot() { Disc.mount(document.querySelectorAll(".disc-light")); }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  /* if the user flips reduced-motion mid-session, hand control back to CSS */
  if (mq && mq.addEventListener) {
    mq.addEventListener("change", function () { if (reduced()) clear(); else write(); });
  }

  global.Disc = Disc;
})(window);
