/* ==========================================================================
   Boo Machine — smooth wheel scrolling   (v10, Fab: "a bit of smooth
   scroll would be nice too")

   Lenis (vendor/lenis.min.js) eases the WHEEL and trackpad into the real
   window scroll, so everything that reads the scroll keeps working as it
   is: ScrollTrigger (told on every Lenis frame), the CSS scroll-driven
   parallax (story.css, animation-timeline: scroll(root)), the sticky phone,
   the island. It runs from GSAP's ticker, so the eased scroll and the
   triggers step in the same frame.

   Only where it helps: a fine pointer (mouse / trackpad) and no reduced
   motion. Touch keeps the platform's own momentum untouched (Lenis leaves
   touch alone by default, and it is not even started on a coarse-only
   device), and so does keyboard scrolling. In-page anchors (#hero,
   #support) glide. ?smooth=0 turns it off.
   QA: window.booSmooth.lenis, .stop(), .start()
   ========================================================================== */
(function (global) {
  "use strict";
  var qs = null;
  try { qs = new URLSearchParams(global.location.search); } catch (e) {}
  if (qs && qs.get("smooth") === "0") return;
  if (!global.Lenis || !global.gsap) return;
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var fine = global.matchMedia("(any-pointer: fine)");
  if (reduce.matches || !fine.matches) return;

  var lenis = new global.Lenis({
    lerp: 0.11,               /* ~ a 150 ms glide: soft, never floaty */
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,
    anchors: { offset: 0 },
    autoRaf: false
  });
  var ST = global.ScrollTrigger;
  if (ST) lenis.on("scroll", ST.update);
  var tick = function (t) { lenis.raf(t * 1000); };
  global.gsap.ticker.add(tick);

  reduce.addEventListener("change", function () {
    if (reduce.matches) { global.gsap.ticker.remove(tick); lenis.destroy(); }
  });

  global.booSmooth = {
    lenis: lenis,
    stop: function () { lenis.stop(); },
    start: function () { lenis.start(); }
  };
})(window);
