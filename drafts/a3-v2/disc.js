/* =========================================================================
   disc.js — the whole API for the disc component.

     Disc.setPointer(x, y, immediate)   x,y in -1..1  (stage-relative)
     Disc.setArt(i)                     0 | 1 | 2, 1s crossfade
     Disc.art                           current index
     Disc.mount(el)                     adopt another .disc (optional)

   Deliberately NOT here: no document/window listeners, no idle animation, no
   layout reads. The host page owns the pointer and calls setPointer(). All
   this file ever does is write two custom properties on the element, and it
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
  var art = 0;
  var artSet = false;   /* has setArt() been called, or is the markup boss? */

  function reduced() { return !!(mq && mq.matches); }

  function write() {
    for (var i = 0; i < els.length; i++) {
      els[i].style.setProperty("--px", cx.toFixed(4));
      els[i].style.setProperty("--py", cy.toFixed(4));
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
    get art() { return art; },

    mount: function (el) {
      if (!el) return Disc;
      var list = el.nodeType ? [el] : [].slice.call(el);
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (els.indexOf(d) < 0) els.push(d);
        /* setArt() may legitimately be called before the elements exist (the
           script tag sits above them, or the host boots from a query string),
           so a pending choice wins; otherwise the markup's data-art wins. */
        if (artSet) {
          d.setAttribute("data-art", String(art));
        } else if (d.hasAttribute("data-art")) {
          art = (+d.getAttribute("data-art") || 0);
        } else {
          d.setAttribute("data-art", String(art));
        }
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
    },

    setArt: function (i) {
      i = ((+i || 0) % 3 + 3) % 3;
      art = i; artSet = true;
      for (var k = 0; k < els.length; k++) els[k].setAttribute("data-art", String(i));
      return Disc;
    },

    nextArt: function () { return Disc.setArt(art + 1); }
  };

  /* auto-mount every .disc already in the document */
  function boot() { Disc.mount(document.querySelectorAll(".disc")); }
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
