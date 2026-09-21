/* ==========================================================================
   Boo Machine — the page below the hero   (v3)

   1. THE DISPLAY MAPPING. Each .phone holds a photograph of a creature hand
      with a dark iPhone, and `data-quad` — the display's four corners
      TL,TR,BR,BL in IMAGE px (phones/phone-<hand>.json, written into the
      page by work/swap-assets.sh). The video sits in a .screen wrapper of
      the video's own pixel size (604 x 1312 css px) with transform-origin
      0 0; the wrapper is mapped onto the quad with one CSS matrix3d: the
      4-point homography from (0,0)-(W,H) to the quad scaled by the image's
      rendered width / natural width. Recomputed on resize and when the
      image lands.
   2. THE REVEAL. IntersectionObserver adds .is-in to a scene when ~20 % of
      it is in view (the hand slides in from its side, the copy fades up,
      story.css). A rAF-throttled scroll listener writes --sy (a slight
      parallax, ±40 px) on each hand while it is on screen.
   3. THE VIDEOS. Muted, looping; played when >= 50 % visible, paused
      otherwise. Under reduced motion they never play (the poster shows),
      the hand does not slide and there is no parallax.
   4. THE BAR. Once the hero's slider has scrolled off the top, .bar gets
      .is-on (slides down); it hides when the slider is back.

   QA hooks: window.booStory.quads() (the mapped corners in page px, per
   scene), .remap(), .videos (the elements), .bar(on).
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var scenes = [].slice.call(doc.querySelectorAll(".scene"));
  if (!scenes.length) return;

  /* ---------- 1. the homography -------------------------------------------
     Solve H (3x3, h33 = 1) with (x,y) -> (u,v) for the four corners: eight
     equations, eight unknowns, Gaussian elimination with partial pivoting.
     Then CSS matrix3d, column-major, the 3x3 embedded in the 4x4 with z
     untouched:  [h11 h21 0 h31 / h12 h22 0 h32 / 0 0 1 0 / h13 h23 0 h33] */
  function solve(A, b) {                 /* A: n x n (array of rows), b: n */
    var n = b.length, i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > Math.abs(A[piv][i])) piv = j;
      if (piv !== i) { var t = A[i]; A[i] = A[piv]; A[piv] = t; t = b[i]; b[i] = b[piv]; b[piv] = t; }
      var d = A[i][i]; if (!d) return null;
      for (j = i + 1; j < n; j++) {
        var f = A[j][i] / d;
        if (!f) continue;
        for (k = i; k < n; k++) A[j][k] -= f * A[i][k];
        b[j] -= f * b[i];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (k = i + 1; k < n; k++) s -= A[i][k] * x[k];
      x[i] = s / A[i][i];
    }
    return x;
  }
  /* from: 4 [x,y] (the wrapper's corners), to: 4 [u,v] (the quad) */
  function homography(from, to) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = from[i][0], y = from[i][1], u = to[i][0], v = to[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];   /* row-major 3x3 */
  }
  function matrix3d(h) {
    /* h: [h11 h12 h13 / h21 h22 h23 / h31 h32 h33]; CSS wants columns */
    var m = [h[0], h[3], 0, h[6],
             h[1], h[4], 0, h[7],
             0,    0,    1, 0,
             h[2], h[5], 0, h[8]];
    return "matrix3d(" + m.map(function (v) { return +v.toFixed(6); }).join(",") + ")";
  }
  function parseQuad(str) {
    /* "x,y x,y x,y x,y" (TL TR BR BL), image px */
    var pts = String(str || "").trim().split(/\s+/).map(function (p) {
      var a = p.split(",").map(Number); return [a[0], a[1]];
    });
    if (pts.length !== 4 || pts.some(function (p) { return !(p[0] === p[0]) || !(p[1] === p[1]); })) return null;
    return pts;
  }

  var phones = scenes.map(function (sc) {
    var ph = sc.querySelector(".phone"), img = ph && ph.querySelector(".phone-img"), scr = ph && ph.querySelector(".screen");
    return ph && img && scr ? { scene: sc, phone: ph, img: img, screen: scr, quad: parseQuad(ph.getAttribute("data-quad")), m: null, pts: null } : null;
  }).filter(Boolean);

  function mapOne(p) {
    if (!p.quad) return;
    var nat = +p.img.getAttribute("width") || p.img.naturalWidth;
    var w = p.phone.clientWidth;
    if (!(nat > 0) || !(w > 0)) return;
    var k = w / nat;
    var W = p.screen.offsetWidth || 604, H = p.screen.offsetHeight || 1312;
    var to = p.quad.map(function (q) { return [q[0] * k, q[1] * k]; });
    var h = homography([[0, 0], [W, 0], [W, H], [0, H]], to);
    if (!h) return;
    p.m = matrix3d(h); p.pts = to;
    p.screen.style.transform = p.m;
  }
  function remap() { phones.forEach(mapOne); }

  /* the screen mask (alpha = the display) only where a mask image can load */
  if (global.location.protocol !== "file:") {
    phones.forEach(function (p) {
      var d = p.phone.querySelector(".display");
      if (d && d.getAttribute("data-mask")) {
        d.style.setProperty("--screen-mask", "url(\"" + d.getAttribute("data-mask") + "\")");
        d.classList.add("has-mask");
      }
    });
  }

  /* ---------- 2. the reveal + the parallax ----------------------------- */
  var io = "IntersectionObserver" in global;
  if (io) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); revealIO.unobserve(e.target); }
      });
    }, { threshold: 0.2 });
    scenes.forEach(function (s) { revealIO.observe(s); });
  } else scenes.forEach(function (s) { s.classList.add("is-in"); });

  var hands = scenes.map(function (s) { return s.querySelector(".hand-par"); });
  var parRaf = 0;
  function parallax() {
    parRaf = 0;
    var vh = global.innerHeight || 1;
    for (var i = 0; i < scenes.length; i++) {
      if (!hands[i]) continue;
      var r = scenes[i].getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;              /* off screen: leave it */
      var d = ((r.top + r.height / 2) - vh / 2) / vh;        /* -1..1 through the viewport */
      if (d < -1) d = -1; else if (d > 1) d = 1;
      hands[i].style.setProperty("--sy", (d * 40).toFixed(1) + "px");
    }
  }
  function onScroll() { if (!parRaf) parRaf = global.requestAnimationFrame(parallax); }

  /* ---------- 3. the videos ---------------------------------------------- */
  var videos = [].slice.call(doc.querySelectorAll(".scene video"));
  function play(v) {
    if (reduce.matches) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function pause(v) { if (!v.paused) v.pause(); }
  if (io) {
    var vidIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.intersectionRatio >= 0.5) play(e.target); else pause(e.target);
      });
    }, { threshold: [0, 0.5, 1] });
    videos.forEach(function (v) { vidIO.observe(v); });
  }
  function applyReduce() {
    if (reduce.matches) {
      videos.forEach(function (v) { v.removeAttribute("autoplay"); pause(v); });
      hands.forEach(function (h) { if (h) h.style.removeProperty("--sy"); });
      global.removeEventListener("scroll", onScroll);
    } else {
      global.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  }
  applyReduce();
  reduce.addEventListener("change", applyReduce);
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) videos.forEach(pause); });

  /* ---------- 4. the bar --------------------------------------------------- */
  var bar = doc.getElementById("bar");
  var slider = doc.querySelector(".hero .unlock-zone") || doc.querySelector(".hero");
  function setBar(on) {
    if (!bar) return;
    bar.classList.toggle("is-on", !!on);
    bar.setAttribute("aria-hidden", on ? "false" : "true");
  }
  if (bar && slider && io) {
    var barIO = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      /* gone above the top edge: on; anything else (in view, or the page
         scrolled back): off */
      setBar(!e.isIntersecting && e.boundingClientRect.bottom <= 0);
    }, { threshold: 0 });
    barIO.observe(slider);
  }

  /* ---------- wiring -------------------------------------------------------- */
  var rz = 0;
  global.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { remap(); onScroll(); }, 60); }, { passive: true });
  phones.forEach(function (p) {
    if (p.img.complete) mapOne(p); else p.img.addEventListener("load", function () { mapOne(p); }, { once: true });
  });
  remap();
  global.addEventListener("load", remap);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(remap);

  global.booStory = {
    remap: remap,
    quads: function () {
      return phones.map(function (p) {
        var r = p.phone.getBoundingClientRect();
        return { clip: p.scene.getAttribute("data-clip"), quad: p.quad, k: p.phone.clientWidth / (+p.img.getAttribute("width") || 1),
                 page: p.pts ? p.pts.map(function (q) { return [+(q[0] + r.left).toFixed(1), +(q[1] + r.top).toFixed(1)]; }) : null,
                 matrix: p.m };
      });
    },
    videos: videos,
    bar: setBar
  };
})(window);
