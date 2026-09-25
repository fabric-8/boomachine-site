/* v11: the corruption at the page foot — builds the growth into the
   #corruption slot and runs it. Styles and the timeline: growth.css.

   - Two sets of painted art: wide screens get 21:9 pieces; phones and small
     tablets (<= 900 px) square ones, composed to climb up beside the footer
     text. Only the set in use is put in the page (and so downloaded); it is
     swapped if the width crosses 900.
   - Grows once per visit to the bottom: .is-on is set when the stage is
     mostly in view; it is only taken off (instantly, while out of sight)
     after the reader has been away from the bottom for LEAVE_MS, so small
     scrolls up and down never replay it.
   - Each eye blinks on its own clock (a lid Web Animation, transform only),
     sometimes twice, sometimes slowly. The clocks stop while the stage is out
     of view or the tab is hidden.
   - prefers-reduced-motion: the grown state, eyes open, no blinking.
   - Measures three lengths into CSS: the section's side padding (so the stage
     spans the viewport) and the distance from the slot to the page bottom
     (so the growth runs under the footer to the last pixel). */
(function () {
  "use strict";
  var slot = document.getElementById("corruption");
  if (!slot || !("IntersectionObserver" in window) || !window.matchMedia) return;
  var section = slot.closest("section") || slot.parentElement;
  var foot = document.querySelector(".foot");
  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var phoneMQ = matchMedia("(max-width: 900px)");
  var LEAVE_MS = 9000;

  /* the ball in each socket sprite (% of the sprite; measured on
     assets/corr-eye-N.webp, see site-work/site-drafts/corruption/build.py) */
  var SPRITES = {
    1: { bx: 50, by: 49.2, br: 31 },
    2: { bx: 55, by: 48.5, br: 32 },
    3: { bx: 51, by: 49.5, br: 28.5 }
  };
  /* Per piece: file stem, the lump layer's rectangle in % of the piece
     (x, y, w, h) and where the veins feed it (% of the lump layer), from
     build.py's geometry.json. Eyes: side, centre x / y in % of the piece,
     size in % of the piece width, socket sprite, pop order. */
  var SETS = {
    wide: {
      l: { src: "corr-l", lump: [58.5, 8, 28.5, 49], o: [5.26, 89.8] },
      r: { src: "corr-r", lump: [13, 24, 24.5, 46], o: [95.92, 73.91] },
      eyes: [
        { side: "l", x: 65.3, y: 35.5, s: 7.0, k: 1, t: 0 },
        { side: "r", x: 27.2, y: 40.6, s: 5.2, k: 3, t: 1 },
        { side: "l", x: 70.8, y: 47.4, s: 4.4, k: 3, t: 2 },
        { side: "r", x: 33.9, y: 45.2, s: 4.6, k: 2, t: 3 },
        { side: "l", x: 11.2, y: 30.2, s: 5.6, k: 2, t: 4 },
        { side: "r", x: 90.0, y: 47.5, s: 7.0, k: 1, t: 5 },
        { side: "r", x: 79.4, y: 69.0, s: 5.4, k: 3, t: 6 }
      ]
    },
    phone: {
      l: { src: "corr-pl", lump: [58, 20, 32, 22], o: [6.25, 81.82] },
      r: { src: "corr-pr", lump: [6, 26, 34, 28], o: [97.06, 67.86] },
      eyes: [
        { side: "l", x: 66.4, y: 30.2, s: 8.6, k: 1, t: 0 },
        { side: "r", x: 25.6, y: 36.0, s: 7.4, k: 3, t: 1 },
        { side: "l", x: 42.0, y: 57.5, s: 7.0, k: 2, t: 2 }
      ]
    }
  };

  var grown = false, inView = false, leaveTimer = 0, blinking = false;
  var lids = [], setName = "";

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function img(src, cls, parent) {
    var i = el("img", cls, parent);
    i.alt = ""; i.decoding = "async"; i.draggable = false; i.src = src;
    return i;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---- build ---------------------------------------------------------- */
  var stage = el("div", "cx-stage", slot);
  function build() {
    var name = phoneMQ.matches ? "phone" : "wide";
    if (name === setName) return;
    setName = name;
    var set = SETS[name], sides = {};
    stopBlinking();
    lids = [];
    stage.textContent = "";
    slot.classList.toggle("cx-phone", name === "phone");
    ["l", "r"].forEach(function (s) {
      var p = set[s];
      var side = el("div", "cx-side cx-" + s, stage);
      img("assets/" + p.src + ".webp", "cx-body", side);
      var lump = img("assets/" + p.src + "-lump.webp", "cx-lump", side);
      lump.style.cssText = "left:" + p.lump[0] + "%;top:" + p.lump[1] + "%;width:" + p.lump[2] +
        "%;--ox:" + p.o[0] + "%;--oy:" + p.o[1] + "%";
      sides[s] = side;
    });
    set.eyes.forEach(function (e) {
      var sp = SPRITES[e.k];
      var eye = el("span", "cx-eye", sides[e.side]);
      eye.style.cssText =
        "--x:" + e.x + ";--y:" + e.y + ";--s:" + e.s +
        ";--d:" + (2.05 + e.t * 0.26 + Math.random() * 0.12).toFixed(2) + "s" +
        ";--rot:" + Math.round(rand(-25, 25)) + "deg" +
        ";--bx:" + sp.bx + "%;--by:" + sp.by + "%;--br:" + sp.br + "%";
      var pop = el("span", "cx-pop", eye);
      img("assets/corr-eye-" + e.k + ".webp", "", pop);
      var ball = el("span", "cx-ball", pop);
      lids.push({ lid: el("span", "cx-lid", ball), eye: eye, timer: 0 });
    });
    if (grown && inView && !document.hidden) startBlinking(false);
  }

  /* ---- measure ---------------------------------------------------------- */
  var measuring = 0;
  function measure() {
    measuring = 0;
    var s = slot.getBoundingClientRect(), p = section.getBoundingClientRect();
    var bottom = foot ? foot.getBoundingClientRect().bottom : p.bottom;
    slot.style.setProperty("--cx-il", Math.round(s.left - p.left) + "px");
    slot.style.setProperty("--cx-ir", Math.round(p.right - s.right) + "px");
    slot.style.setProperty("--cx-drop", Math.round(bottom - s.top) + "px");
  }
  function remeasure() { if (!measuring) measuring = requestAnimationFrame(measure); }

  /* ---- blink ------------------------------------------------------------ */
  var CLOSED = "translateY(0)", OPEN = "translateY(-112%)";
  function blink(l) {
    var r = Math.random(), frames, dur;
    if (r < 0.14) {            // slow, heavy
      frames = [{ transform: OPEN }, { transform: CLOSED, offset: 0.35 }, { transform: CLOSED, offset: 0.62 }, { transform: OPEN }];
      dur = rand(700, 1100);
    } else if (r < 0.32) {     // twice
      frames = [{ transform: OPEN }, { transform: CLOSED, offset: 0.2 }, { transform: OPEN, offset: 0.45 }, { transform: CLOSED, offset: 0.65 }, { transform: OPEN }];
      dur = rand(420, 560);
    } else {                   // plain
      frames = [{ transform: OPEN }, { transform: CLOSED, offset: 0.45 }, { transform: CLOSED, offset: 0.55 }, { transform: OPEN }];
      dur = rand(150, 240);
    }
    l.lid.animate(frames, { duration: dur, easing: "ease-in-out" });
    schedule(l);
  }
  function schedule(l, wait) {
    clearTimeout(l.timer);
    if (!blinking) return;
    l.timer = setTimeout(function () { blink(l); }, wait || rand(1600, 7200));
  }
  function startBlinking(afterPop) {
    if (blinking || still) return;
    blinking = true;
    lids.forEach(function (l) {
      var d = parseFloat(l.eye.style.getPropertyValue("--d")) || 2;
      schedule(l, (afterPop ? (d + 0.8) * 1000 : 0) + rand(900, 4200));
    });
  }
  function stopBlinking() {
    blinking = false;
    lids.forEach(function (l) { clearTimeout(l.timer); });
  }

  build();
  measure();
  addEventListener("resize", function () { build(); remeasure(); }, { passive: true });
  addEventListener("load", remeasure);
  if ("ResizeObserver" in window) {
    var ro = new ResizeObserver(remeasure);
    ro.observe(section);
    if (foot) ro.observe(foot);
  }
  if (still) { slot.classList.add("is-still"); return; }

  /* ---- grow / reset --------------------------------------------------- */
  function grow() {
    clearTimeout(leaveTimer);
    if (grown) { startBlinking(false); return; }
    grown = true;
    slot.classList.add("is-on");
    startBlinking(true);
  }
  function reset() {
    grown = false;
    stopBlinking();
    slot.classList.remove("is-on");
  }
  var io = new IntersectionObserver(function (entries) {
    var e = entries[entries.length - 1];
    inView = e.isIntersecting;
    if (e.isIntersecting && e.intersectionRatio >= 0.35) {
      if (!document.hidden) grow();
    } else if (!e.isIntersecting) {
      stopBlinking();
      clearTimeout(leaveTimer);
      if (grown) leaveTimer = setTimeout(reset, LEAVE_MS);
    }
  }, { threshold: [0, 0.35, 0.6] });
  io.observe(stage);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopBlinking();
    else if (inView && grown) startBlinking(false);
  });
})();
