/* ==========================================================================
   Boo Machine — the phosphor headings' behaviour   (v4)
   Splits every h2.phos into letters (words kept unbreakable, the text moved
   to aria-label), then fires the rare strong dip (80–260 ms, sometimes twice)
   and the single dead letter on prime-ish random intervals, never on a beat.
   Reduced motion: split only, nothing fires. A heading with .is-img (the
   rendered sign, v5) is left whole: its flicker is the sign's opacity.
   QA: window.booHeads.hold(i, true|false), .flicker(i), .dim(i), .stop().
   ========================================================================== */
(function () {
  "use strict";
  var heads = [].slice.call(document.querySelectorAll("h2.phos"));
  if (!heads.length) return;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var timers = [];

  heads.forEach(function (h, i) {
    h.setAttribute("data-i", String(i));
    if (h.classList.contains("is-img")) return;      /* v5: the rendered sign — the text stays whole */
    var text = (h.textContent || "").trim();
    h.setAttribute("aria-label", text);
    var frag = document.createDocumentFragment();
    var words = text.split(" ");
    words.forEach(function (w, wi) {
      var ws = document.createElement("span"); ws.className = "w"; ws.setAttribute("aria-hidden", "true");
      for (var c = 0; c < w.length; c++) {
        var s = document.createElement("span");
        s.className = "ch"; s.setAttribute("data-c", w.charAt(c)); s.textContent = w.charAt(c);
        ws.appendChild(s);
      }
      frag.appendChild(ws);
      if (wi < words.length - 1) { var sp = document.createElement("span"); sp.className = "sp"; sp.textContent = " "; sp.setAttribute("aria-hidden", "true"); frag.appendChild(sp); }
    });
    h.textContent = ""; h.appendChild(frag);
  });

  /* v5: the rendered sign. data-fit = "l,t,w,h" in % of the line's INK box
     (fit.json's *_pct_of_ink), data-ink = "w,h" of that ink at data-font px
     (a check). The ink box is measured here with canvas measureText in the
     h2's own font and size; the baseline with a zero-size inline probe. */
  var cv = document.createElement("canvas"), cx = cv.getContext("2d");
  function place(h) {
    var img = h.querySelector(".headimg"), txt = h.querySelector(".txt"), bl = h.querySelector(".bl");
    if (!img || !txt || !bl) return null;
    var fit = (h.getAttribute("data-fit") || "").split(",").map(Number);
    if (fit.length !== 4 || fit.some(isNaN)) return null;
    var cs = getComputedStyle(h), F = parseFloat(cs.fontSize);
    cx.font = cs.fontWeight + " " + F + "px " + cs.fontFamily;
    var m = cx.measureText(txt.textContent);
    var inkW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!(inkW > 0) || !(inkH > 0)) return null;
    var hr = h.getBoundingClientRect(), tr = txt.getBoundingClientRect(), br = bl.getBoundingClientRect();
    var inkL = tr.left - hr.left - m.actualBoundingBoxLeft, inkT = br.bottom - hr.top - m.actualBoundingBoxAscent;
    var box = { l: inkL + fit[0] / 100 * inkW, t: inkT + fit[1] / 100 * inkH, w: fit[2] / 100 * inkW, h: fit[3] / 100 * inkH };
    img.style.left = box.l.toFixed(2) + "px"; img.style.top = box.t.toFixed(2) + "px";
    img.style.width = box.w.toFixed(2) + "px"; img.style.height = box.h.toFixed(2) + "px";
    var ink = (h.getAttribute("data-ink") || "").split(",").map(Number), fpx = +h.getAttribute("data-font") || 244;
    return { F: F, ink: [inkW, inkH], inkAt: [inkL, inkT], expected: ink.length === 2 ? [ink[0] * F / fpx, ink[1] * F / fpx] : null, img: box };
  }
  var imgHeads = heads.filter(function (h) { return h.classList.contains("is-img"); });
  function placeAll() { return imgHeads.map(place); }
  if (imgHeads.length) {
    placeAll();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeAll);
    var rz = 0;
    window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(placeAll, 80); }, { passive: true });
    window.addEventListener("load", placeAll);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function later(ms, f) { var t = setTimeout(f, ms); timers.push(t); return t; }
  function every(minMs, maxMs, fire) { (function tick() { later(rand(minMs, maxMs), function () { fire(); tick(); }); })(); }
  function pick() { return heads[Math.floor(Math.random() * heads.length)]; }

  function flick(h) {
    h = h || pick();
    function pulse(min, max) { h.classList.add("is-flick"); later(rand(min, max), function () { h.classList.remove("is-flick"); }); }
    pulse(80, 260);
    if (Math.random() < 0.38) later(rand(150, 420), function () { pulse(60, 170); });
  }
  function dim(h) {
    h = h || pick();
    var ls = h.querySelectorAll(".ch"); if (!ls.length) return;
    var el = ls[Math.floor(Math.random() * ls.length)];
    el.classList.add("is-dim"); later(rand(120, 420), function () { el.classList.remove("is-dim"); });
  }
  function start() {
    if (reduce.matches) return;
    every(7000, 16000, function () { flick(); });
    every(14000, 32000, function () { dim(); });
  }
  function stop() {
    timers.forEach(clearTimeout); timers = [];
    heads.forEach(function (h) { h.classList.remove("is-flick"); [].forEach.call(h.querySelectorAll(".is-dim"), function (e) { e.classList.remove("is-dim"); }); });
  }
  function hold(i, on) {
    var h = heads[i | 0]; if (!h) return;
    h.classList.toggle("is-flick", !!on);
    var l = h.querySelectorAll(".ch")[2]; if (l) l.classList.toggle("is-dim", !!on);
  }
  window.booHeads = { heads: heads, flicker: function (i) { flick(heads[i | 0]); }, dim: function (i) { dim(heads[i | 0]); }, hold: hold, stop: stop, start: start, place: placeAll };
  later(1600, start);
  reduce.addEventListener("change", function () { stop(); if (!reduce.matches) start(); });
})();
