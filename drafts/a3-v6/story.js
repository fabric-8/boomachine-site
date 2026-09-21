/* ==========================================================================
   Boo Machine — the motion of the page   (v6: scrolling story)

   1. THE HERO SCRUB (v4/v5, kept — minus the fade). One timeline scrubbed
      over ~1.2 viewports: the unit / spill / light planes rise 18svh and
      grow to 1.04, the title rises 6svh, the slide zone rises 28svh and
      SCROLLS AWAY AS IT IS (v6: no opacity, no visibility — the client:
      "the slider should not fade out"), the bulb (--rl-k) leans up then
      hands over.
   2. THE STORY — CHAPTERS DRIVE THE PHONE. No pin. The three chapters
      scroll like any content; the phone is CSS-sticky beside them. Two
      ScrollTriggers (scrub 0.4), one per chapter 2 and 3: the chapter's
      ENTRY — its copy block's top from 85 % to 45 % of the viewport (100 %
      to 70 % on a phone, where the copy reads under the sticky phone) — is
      the morph's progress t from the previous creature to this one. The hand state is
      H = t1 + t2 (0..2, monotonic in the scroll) and applyHands(H) is a
      pure function of it: outside a window exactly one layer, inside the
      WebGL displacement at t (the DOM crossfade without WebGL) — one
      picture per scroll position, reversed by scrolling up, nothing
      time-based. The display crossfade (the middle 60 % of the window) and
      the red flare (peaked mid-window) are tweens on the same window
      timeline. Each chapter's copy has its own light reveal (24 px up,
      fade, once, when it enters); on a phone it also fades out as it
      passes under the phone.
   3. THE DISPLAY MAPPING (v3, kept): .screen (906 x 1970) onto the shared
      quad with one matrix3d from the 4-point homography.
   4. THE VIDEOS. Only the clip of the current state plays; a clip is
      display:none unless it is (about to be) visible: shown while the RAW
      window progress OR the smoothed H is near it (so a clip that is still
      fading can never be removed); clips 2 and 3 are preload=none until
      then. Paused off screen (IO) and on visibilitychange.
   5. REFRESH POLICY (v5, kept). ScrollTrigger auto-refreshes on resize
      only (ignoreMobileResize); the page refreshes ONCE when the fonts and
      the phone's images have landed, never during a scroll.
   6. THE ISLAND: on past 80 px of scroll, off at the top (a passive scroll
      listener, in every motion mode).
   7. REDUCED MOTION: no ScrollTrigger at all — no scrub, no morph, no
      reveal; the first hand and the posters.

   QA hooks — window.booStory:
     .set(i)          scroll so chapter i (0..2) sits at the top
     .to('hero', p)   scroll so the hero trigger is at progress p
     .to('win', k, t) scroll so morph window k (0|1) is at progress t
     .state           the current (discrete) state   .h   the smoothed H
     .raw             the raw H (from the triggers)   .wins  the two triggers
     .hero            the hero's ScrollTrigger        .tls   the window timelines
     .quads()         the mapped display corners in page px
     .videos          the three <video>s   .morph  'gl' | 'dom' | 'none'
     .hands()         per layer: opacity + display of the morph canvas
     .refreshes       how many ScrollTrigger refreshes ran   .bar(on)
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var storyIn = doc.getElementById("storyIn");
  var phoneEl = doc.getElementById("phone");
  var fig = doc.getElementById("phoneFig");
  if (!storyIn || !phoneEl || !fig || !global.gsap) return;
  var gsap = global.gsap;
  var ST = global.ScrollTrigger;
  var qs = {};
  try { qs = new URLSearchParams(global.location.search); } catch (e) {}
  if (ST) {
    gsap.registerPlugin(ST);
    /* no refresh on `load` (the page does its own, once, when fonts + images are in) */
    ST.config({ ignoreMobileResize: true, autoRefreshEvents: "visibilitychange,DOMContentLoaded,resize" });
  }

  var HANDS = ["vampire", "wolf", "witch"];
  var CLIPS = ["tap", "loop", "disc"];
  /* the morph windows: hand k -> k+1 while chapter k+1 enters — its top from
     WIN_D[0] to WIN_D[1] of the viewport (WIN_M on a phone, where the copy
     is read UNDER the sticky phone and has to arrive lower) */
  var WIN_D = ["85%", "45%"], WIN_M = ["100%", "70%"];
  var chapters = [].slice.call(doc.querySelectorAll("#chapters .chapter"));
  /* .copy is what the triggers MEASURE (never transformed); .copy-in inside
     it is what the reveal moves — a translated trigger would shift every
     start by its offset (seen: 24 px) */
  var copies = chapters.map(function (c) { return c.querySelector(".copy"); });
  var copyIns = chapters.map(function (c) { return c.querySelector(".copy-in"); });
  var layers = HANDS.map(function (h) { return phoneEl.querySelector('.hand-layer[data-hand="' + h + '"]'); });
  var clips = CLIPS.map(function (c) { return phoneEl.querySelector('video[data-clip="' + c + '"]'); });
  var videos = clips.filter(Boolean);
  var handsBox = phoneEl.querySelector(".hands");
  var morphCv = phoneEl.querySelector(".morph");
  var flare = phoneEl.querySelector(".flare");
  var figFlare = fig.querySelector(".fig-flare");
  var screen = phoneEl.querySelector(".screen");
  var img = phoneEl.querySelector(".plate");

  /* ---------- 3. the homography (v3) ----------------------------------- */
  function solve(A, b) {
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
  function homography(from, to) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = from[i][0], y = from[i][1], u = to[i][0], v = to[i][1];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    var h = solve(A, b);
    return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
  }
  function matrix3d(h) {
    var m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
    return "matrix3d(" + m.map(function (v) { return +v.toFixed(6); }).join(",") + ")";
  }
  function parseQuad(str) {
    var pts = String(str || "").trim().split(/\s+/).map(function (p) { var a = p.split(",").map(Number); return [a[0], a[1]]; });
    if (pts.length !== 4 || pts.some(function (p) { return !(p[0] === p[0]) || !(p[1] === p[1]); })) return null;
    return pts;
  }
  var quad = parseQuad(phoneEl.getAttribute("data-quad"));
  var frameW = +(img && img.getAttribute("width")) || 1400, frameH = +(img && img.getAttribute("height")) || 1750;
  phoneEl.style.setProperty("--frame-ar", frameW + "/" + frameH);
  var mapped = { m: null, pts: null, w: 0 };

  function mapScreen() {
    if (!quad || !screen) return;
    var w = phoneEl.clientWidth;
    if (!(w > 0) || w === mapped.w) return;
    var k = w / frameW;
    var W = screen.offsetWidth || 906, H = screen.offsetHeight || 1970;
    var to = quad.map(function (q) { return [q[0] * k, q[1] * k]; });
    var h = homography([[0, 0], [W, 0], [W, H], [0, H]], to);
    if (!h) return;
    mapped.m = matrix3d(h); mapped.pts = to; mapped.w = w;
    screen.style.transform = mapped.m;
  }
  /* each hand layer: its own quad -> the shared quad, as a rectangle fit
     (with phones2/phones3 the quads are identical and this is the identity) */
  var fits = layers.map(function (el) {
    var q = el && parseQuad(el.getAttribute("data-quad"));
    if (!q || !quad) return { l: 0, t: 0, w: 1, h: 1 };
    var ow = +el.getAttribute("width") || frameW, oh = +el.getAttribute("height") || frameH;
    var sw = (quad[1][0] + quad[2][0] - quad[0][0] - quad[3][0]) / 2, sh = (quad[2][1] + quad[3][1] - quad[0][1] - quad[1][1]) / 2;
    var qw = (q[1][0] + q[2][0] - q[0][0] - q[3][0]) / 2, qh = (q[2][1] + q[3][1] - q[0][1] - q[1][1]) / 2;
    var sx = sw / qw, sy = sh / qh;
    var scx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4, scy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
    var qcx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, qcy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    var l = (scx - qcx * sx) / frameW, t = (scy - qcy * sy) / frameH;
    return { l: l, t: t, w: ow * sx / frameW, h: oh * sy / frameH };
  });
  layers.forEach(function (el, i) {
    if (!el) return;
    var f = fits[i];
    el.style.left = (f.l * 100).toFixed(3) + "%"; el.style.top = (f.t * 100).toFixed(3) + "%";
    el.style.width = (f.w * 100).toFixed(3) + "%"; el.style.height = (f.h * 100).toFixed(3) + "%";
  });
  var display = phoneEl.querySelector(".display");
  if (global.location.protocol !== "file:" && display && phoneEl.getAttribute("data-mask")) {
    display.style.setProperty("--screen-mask", 'url("' + phoneEl.getAttribute("data-mask") + '")');
    display.classList.add("has-mask");
  }

  /* ---------- 4. the videos ---------------------------------------------- */
  var onScreen = false, cur = 0, morphMode = "none";
  var shown = [true, true, true], playing = -1;   /* as the markup has them; showClips() trims */
  function play(v) {
    if (!v || reduce.matches || !onScreen) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function pause(v) { if (v && !v.paused) v.pause(); }
  function pauseAll() { videos.forEach(pause); playing = -1; }
  function syncPlay() {
    var want = (onScreen && !reduce.matches && shown[cur]) ? cur : -1;
    if (want === playing) return;
    clips.forEach(function (v, k) { if (k !== want) pause(v); });
    playing = want;
    if (want >= 0) play(clips[want]);
  }
  /* which clips have to be in the DOM: clip k is visible (opacity > 0) for
     H in (k - .8, k + .8) — it stays shown while the RAW H is within a
     margin of that (the smoothed H lags the raw by up to the scrub's 0.4 s)
     OR the smoothed H is inside it, so a clip that is still fading can
     never be removed; clip k+1 is switched on ~a third of a window before
     its crossfade starts, so it has landed before it is seen */
  var MARGIN = 0.35;
  function near(k, h, m) { return h >= k - 0.8 - m && h <= k + 0.8 + m; }
  function showClips(raw, smooth) {
    for (var k = 0; k < 3; k++) {
      var v = clips[k]; if (!v) continue;
      var on = near(k, raw, MARGIN) || near(k, smooth, 0.05);
      if (on === shown[k]) continue;
      shown[k] = on;
      if (on) { v.style.display = ""; if (v.preload === "none") { v.preload = "auto"; try { v.load(); } catch (e) {} } }
      else { pause(v); if (playing === k) playing = -1; v.style.display = "none"; }
    }
    syncPlay();
  }
  if ("IntersectionObserver" in global) {
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      onScreen = e.intersectionRatio >= 0.3;
      if (onScreen) syncPlay(); else pauseAll();
    }, { threshold: [0, 0.3, 1] }).observe(phoneEl);
  } else onScreen = true;
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) pauseAll(); else syncPlay(); });

  /* ---------- 2. the state as a function of H --------------------------- */
  /* where(H): {i: from, j: to, t: 0..1 inside the window (0 outside)} */
  function where(h) {
    if (!(h > 0)) return { i: 0, j: 0, t: 0 };
    if (h >= 2) return { i: 2, j: 2, t: 0 };
    var i = Math.floor(h), t = h - i;
    if (t <= 0) return { i: i, j: i, t: 0 };
    return { i: i, j: i + 1, t: t };
  }
  var lastOp = [-1, -1, -1], cvShown = false, lastT = -1;
  function layerOp(k, v) {
    if (lastOp[k] === v) return;
    lastOp[k] = v;
    layers[k].style.opacity = v === 1 ? "" : String(v);   /* "" -> the CSS (.is-on = 1) */
  }
  function setDiscrete(i) {
    if (i === cur) return;
    cur = i;
    chapters.forEach(function (c, j) { c.classList.toggle("is-current", j === i); });
    layers.forEach(function (l, j) { if (!l) return; l.classList.toggle("is-on", j === i); if (j === i) l.removeAttribute("aria-hidden"); else l.setAttribute("aria-hidden", "true"); });
    clips.forEach(function (v, j) { if (!v) return; v.classList.toggle("is-on", j === i); if (j === i) v.removeAttribute("aria-hidden"); else v.setAttribute("aria-hidden", "true"); });
    syncPlay();
  }
  /* the hands at H: exactly one defined picture */
  var hSmooth = 0;
  function applyHands(h) {
    hSmooth = h;
    var w = where(h), k;
    setDiscrete(w.t < 0.5 ? w.i : w.j);
    if (w.i === w.j) {
      for (k = 0; k < 3; k++) if (layers[k]) layerOp(k, k === w.i ? 1 : 0);
      if (cvShown) { morphCv.style.display = "none"; cvShown = false; }
      lastT = -1;
      return;
    }
    var g = glInit();
    if (g && g.ready(w.i) && g.ready(w.j)) {
      morphMode = "gl";
      for (k = 0; k < 3; k++) if (layers[k]) layerOp(k, 0);
      if (!cvShown) { g.size(); g.pair(w.i, w.j); morphCv.style.display = "block"; cvShown = true; lastT = -1; }
      if (w.t !== lastT) { g.draw(w.t); lastT = w.t; }
    } else {
      morphMode = "dom";
      if (cvShown) { morphCv.style.display = "none"; cvShown = false; }
      for (k = 0; k < 3; k++) if (layers[k]) layerOp(k, k === w.i ? 1 - w.t : k === w.j ? w.t : 0);
    }
  }

  /* ---------- the WebGL morph --------------------------------------------- */
  var GL = null;
  function glInit() {
    if (GL !== null) return GL;
    GL = false;
    if (!morphCv || reduce.matches || qs.get("morph") === "dom") return GL;
    var gl;
    try { gl = morphCv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" }); } catch (e) { gl = null; }
    if (!gl) return GL;
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
      return s;
    }
    var vs = sh(gl.VERTEX_SHADER,
      "attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}");
    var fs = sh(gl.FRAGMENT_SHADER,
      "precision mediump float;varying vec2 v;uniform sampler2D uA,uB,uN;uniform vec4 oA,oB;uniform float t,amp,ns;uniform vec2 nsh;" +
      "vec4 smp(sampler2D s,vec4 o,vec2 p){vec2 uv=(p-o.xy)/o.zw;vec2 i=step(vec2(0.),uv)*step(uv,vec2(1.));return texture2D(s,uv)*i.x*i.y;}" +
      "void main(){vec2 n=texture2D(uN,v*ns+nsh).rg*2.-1.;vec2 n2=texture2D(uN,v*ns*2.7+nsh.yx).gb*2.-1.;" +
      "float k=sin(t*3.14159);vec2 d=(n*.78+n2*.22)*amp*k;" +
      "vec4 a=smp(uA,oA,v+d*t);vec4 b=smp(uB,oB,v-d*(1.-t));" +
      "float m=smoothstep(0.,1.,t);gl_FragColor=mix(a,b,m);}");
    if (!vs || !fs) return GL;
    var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return GL;
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {};
    ["uA", "uB", "uN", "oA", "oB", "t", "amp", "ns", "nsh"].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uN, 2);
    gl.uniform1f(U.amp, 0.05); gl.uniform1f(U.ns, 1.6); gl.uniform2f(U.nsh, 0.37, 0.61);
    /* the noise: 16 x 16 random RGBA, smoothed up to 128 x 128, tiled */
    var nc = doc.createElement("canvas"), sm = doc.createElement("canvas");
    sm.width = sm.height = 16; nc.width = nc.height = 128;
    var sx = sm.getContext("2d"), id = sx.createImageData(16, 16);
    for (var i = 0; i < id.data.length; i++) id.data[i] = (i & 3) === 3 ? 255 : (Math.random() * 256) | 0;
    sx.putImageData(id, 0, 0);
    var nx = nc.getContext("2d"); nx.imageSmoothingEnabled = true; nx.imageSmoothingQuality = "high";
    nx.drawImage(sm, 0, 0, 128, 128);
    function tex(unit, src, wrap, premultiplied) {
      var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !premultiplied);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    }
    var noiseTex = tex(2, nc, gl.REPEAT);
    var handTex = [null, null, null], pending = [null, null, null];
    GL = {
      gl: gl, U: U,
      ready: function (i) { return !!handTex[i]; },
      /* the photograph -> a texture, decoded off the main thread
         (createImageBitmap; the upload itself ~3 ms) */
      prepare: function (i) {
        var el = layers[i];
        if (handTex[i] || pending[i] || !el || !el.complete || !el.naturalWidth) return;
        if (global.createImageBitmap) {
          pending[i] = global.createImageBitmap(el, { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" })
            .then(function (bm) { handTex[i] = tex(0, bm, gl.CLAMP_TO_EDGE, true); bm.close(); pending[i] = null; })
            .catch(function () { pending[i] = null; try { handTex[i] = tex(0, el, gl.CLAMP_TO_EDGE, false); } catch (e) {} });
        } else {
          try { handTex[i] = tex(0, el, gl.CLAMP_TO_EDGE, false); } catch (e) {}
        }
      },
      pair: function (i, j) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, handTex[i]);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, handTex[j]);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        var fa = fits[i], fb = fits[j];
        gl.uniform4f(U.oA, fa.l, fa.t, fa.w, fa.h); gl.uniform4f(U.oB, fb.l, fb.t, fb.w, fb.h);
      },
      /* the canvas is the phone box at DPR <= 2, resized only when the box changes */
      size: function () {
        var dpr = Math.min(global.devicePixelRatio || 1, 2);
        var w = Math.round(handsBox.clientWidth * dpr), h = Math.round(handsBox.clientHeight * dpr);
        if (morphCv.width !== w || morphCv.height !== h) { morphCv.width = w; morphCv.height = h; }
        gl.viewport(0, 0, w, h);
      },
      draw: function (t) {
        gl.uniform1f(U.t, t);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
    return GL;
  }
  /* the textures are made ahead of the first morph: after load (idle) and
     again when the stage comes near, one per image as it lands */
  function warm() {
    var g = glInit(); if (!g) return;
    layers.forEach(function (el, i) {
      if (!el) return;
      if (el.complete && el.naturalWidth) g.prepare(i);
      else el.addEventListener("load", function () { g.prepare(i); }, { once: true });
    });
  }

  /* ---------- 1 + 2. the scroll ------------------------------------------ */
  var bar = doc.getElementById("bar");
  function setBar(on) {
    if (!bar) return;
    on = !!on;
    if (bar.classList.contains("is-on") === on) return;
    bar.classList.toggle("is-on", on);
    bar.setAttribute("aria-hidden", on ? "false" : "true");
  }
  /* v6: the island is on past 80 px of scroll, in every motion mode */
  var BAR_AT = 80;
  function barFromScroll() { setBar((global.scrollY || global.pageYOffset || 0) > BAR_AT); }
  global.addEventListener("scroll", barFromScroll, { passive: true });

  var hero = doc.querySelector(".hero");
  var zone = doc.querySelector(".hero .unlock-zone");
  var mobile = global.matchMedia("(max-width: 860px)");
  var heroST = null, wins = [null, null], tls = [null, null], reveals = [], fades = [], refreshes = 0;
  var prox = [{ t: 0 }, { t: 0 }];

  function vh(f) { return function () { return -(global.innerHeight * f); }; }
  function rawH() { return (wins[0] ? wins[0].progress : 0) + (wins[1] ? wins[1].progress : 0); }
  function update() { showClips(rawH(), hSmooth); }
  function onRefresh() { refreshes++; applyHands(prox[0].t + prox[1].t); update(); }

  function buildScroll() {
    if (!ST || heroST) return;
    /* the hero: the planes rise and grow, the title and the zone rise; the
       zone keeps its opacity (v6) */
    var htl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: hero, start: "top top", end: "+=120%", scrub: true, invalidateOnRefresh: true }
    });
    htl.to(hero.querySelectorAll(".plane.p-unit, .plane.p-spill, .plane.p-light"), { y: vh(0.18), scale: 1.04, transformOrigin: "50% 40%", duration: 1 }, 0)
      .to(hero.querySelector(".title"), { y: vh(0.06), duration: 1 }, 0)
      .to(zone, { y: vh(0.28), duration: 1 }, 0)
      .to(hero, { "--rl-k": 1.25, duration: 0.4 }, 0)
      .to(hero, { "--rl-k": 0.55, duration: 0.6 }, 0.4);
    heroST = htl.scrollTrigger;

    /* the two morph windows: chapter k+1's entry drives hand k -> k+1 */
    var win = mobile.matches ? WIN_M : WIN_D;
    [0, 1].forEach(function (k) {
      var tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          /* the trigger is the chapter's COPY block (centred in the chapter on
             desktop): the morph runs while the heading rises from the lower
             edge to its resting place, not while the section's empty top
             half does */
          trigger: copies[k + 1] || chapters[k + 1], start: "top " + win[0], end: "top " + win[1],
          scrub: 0.4, invalidateOnRefresh: true,
          onUpdate: update, onRefresh: k === 0 ? onRefresh : update,
          onEnter: warm, onEnterBack: warm
        }
      });
      /* the clock: the hands read the SMOOTHED progress of the window */
      tl.to(prox[k], { t: 1, duration: 1, onUpdate: function () { applyHands(prox[0].t + prox[1].t); update(); } }, 0);
      /* every tween is an explicit fromTo (a `to` records its start from the
         DOM when the playhead first reaches it — a jump straight to the end
         would record the wrong one) */
      /* the display: a 60 % crossfade centred on the morph */
      tl.fromTo(clips[k], { opacity: 1 }, { opacity: 0, duration: 0.6, immediateRender: false }, 0.2);
      tl.fromTo(clips[k + 1], { opacity: 0 }, { opacity: 1, duration: 0.6, immediateRender: false }, 0.2);
      /* the flare: peaked mid-window, on the room and on the phone */
      [figFlare, flare].forEach(function (el) {
        if (!el) return;
        tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out", immediateRender: false }, 0);
        tl.fromTo(el, { opacity: 1 }, { opacity: 0, duration: 0.5, ease: "power2.in", immediateRender: false }, 0.5);
      });
      tls[k] = tl; wins[k] = tl.scrollTrigger;
    });

    /* the copy: a light reveal the first time it enters (24 px up, fade) */
    reveals = copies.map(function (c, k) {
      if (!c || !copyIns[k]) return null;
      return gsap.fromTo(copyIns[k], { opacity: 0, y: 24 }, {
        opacity: 1, y: 0, duration: 0.7, ease: "power2.out", immediateRender: true,
        scrollTrigger: { trigger: c, start: "top 88%", once: true }
      }).scrollTrigger;
    });
    /* on a phone the copy passes UNDER the sticky phone: it fades out as its
       top reaches the phone's foot (scrubbed, reversible) */
    if (mobile.matches) {
      /* the fade is on the CHAPTER, the reveal on the copy inside it: two
         elements, so the two opacities never write over each other */
      fades = copies.map(function (c, k) {
        if (!c) return null;
        var t = gsap.fromTo(chapters[k], { opacity: 1 }, {
          opacity: 0, ease: "none", immediateRender: false,
          scrollTrigger: {
            trigger: c, scrub: 0.2, invalidateOnRefresh: true,
            start: function () { return "top " + Math.round(figFoot() + 28) + "px"; },
            end: function () { return "top " + Math.round(figFoot() - 36) + "px"; }
          }
        });
        return t.scrollTrigger;
      });
    }
    applyHands(0);
    update();
  }
  /* the sticky phone's foot in viewport px (its top + its height) */
  function figFoot() {
    var cs = getComputedStyle(fig);
    return (parseFloat(cs.top) || 0) + fig.offsetHeight;
  }
  function killScroll() {
    [heroST].concat(wins, reveals, fades).forEach(function (t) { if (t) t.kill(true); });
    tls.forEach(function (t) { if (t) t.kill(); });
    heroST = null; wins = [null, null]; tls = [null, null]; reveals = []; fades = [];
    prox = [{ t: 0 }, { t: 0 }];
    gsap.set(hero.querySelectorAll(".plane, .title, .unlock-zone"), { clearProps: "transform,opacity" });
    gsap.set(copyIns.concat(chapters, videos, [figFlare, flare]).filter(Boolean), { clearProps: "transform,opacity" });
    hero.style.removeProperty("--rl-k");
    if (morphCv) morphCv.style.display = "none";
    cvShown = false; hSmooth = 0;
    layers.forEach(function (l, k) { if (l) { l.style.opacity = ""; lastOp[k] = -1; } });
    clips.forEach(function (v, k) { if (v) { v.style.display = ""; shown[k] = true; } });
  }
  function applyReduce() {
    if (reduce.matches) {
      killScroll(); pauseAll();
      videos.forEach(function (v) { v.removeAttribute("autoplay"); });
    } else {
      buildScroll();
    }
    barFromScroll();
  }

  /* ---------- wiring -------------------------------------------------------- */
  var rz = 0;
  global.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(mapScreen, 60); }, { passive: true });
  if (img) { if (img.complete) mapScreen(); else img.addEventListener("load", mapScreen, { once: true }); }
  mapScreen();
  applyReduce();
  reduce.addEventListener("change", applyReduce);
  /* the phone breakpoint flips the windows and the under-phone fade: rebuild */
  mobile.addEventListener("change", function () { if (!reduce.matches) { killScroll(); buildScroll(); refreshWhenStill(); } });

  /* ONE refresh, when the fonts and the phone's images are in (the hero's
     photographs carry their own size; a late one cannot move anything) */
  var ready = [doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve()];
  layers.concat([img]).forEach(function (el) {
    if (!el) return;
    ready.push(el.complete ? Promise.resolve() : new Promise(function (res) { el.addEventListener("load", res, { once: true }); el.addEventListener("error", res, { once: true }); }));
  });
  ready.push(new Promise(function (res) { if (doc.readyState === "complete") res(); else global.addEventListener("load", res, { once: true }); }));
  /* ...and never while the page is being scrolled: a refresh mid-scroll
     re-measures, which is a visible jump. It waits for a quiet 250 ms. */
  function refreshWhenStill() {
    if (!ST || reduce.matches) return;
    if (ST.isScrolling()) { global.setTimeout(refreshWhenStill, 250); return; }
    ST.refresh();
  }
  Promise.all(ready).then(function () {
    mapScreen();
    refreshWhenStill();
    if (!reduce.matches) { if (global.requestIdleCallback) global.requestIdleCallback(warm, { timeout: 2500 }); else global.setTimeout(warm, 600); }
  });

  global.booStory = {
    set: function (i) {
      var c = chapters[Math.max(0, Math.min(2, i | 0))]; if (!c) return null;
      var y = c.getBoundingClientRect().top + global.scrollY; global.scrollTo(0, y); return y;
    },
    get state() { return cur; },
    get h() { return hSmooth; },
    get raw() { return rawH(); },
    get hero() { return heroST; }, get wins() { return wins; }, get tls() { return tls; },
    get refreshes() { return refreshes; },
    to: function (what, p, t) {
      var st = what === "hero" ? heroST : wins[p | 0];
      var q = what === "hero" ? p : t;
      if (!st) return null;
      var y = st.start + (st.end - st.start) * Math.max(0, Math.min(1, +q || 0));
      global.scrollTo(0, y); return y;
    },
    quads: function () {
      var r = phoneEl.getBoundingClientRect();
      return { quad: quad, k: phoneEl.clientWidth / frameW, matrix: mapped.m,
               page: mapped.pts ? mapped.pts.map(function (q) { return [+(q[0] + r.left).toFixed(1), +(q[1] + r.top).toFixed(1)]; }) : null,
               fits: fits };
    },
    hands: function () {
      return { layers: layers.map(function (l) { return l ? +getComputedStyle(l).opacity : null; }),
               canvas: morphCv ? getComputedStyle(morphCv).display : null,
               clips: clips.map(function (v) { return v ? getComputedStyle(v).display + "/" + (+getComputedStyle(v).opacity).toFixed(2) + (v.paused ? "" : "/playing") : null; }),
               where: where(hSmooth) };
    },
    figFoot: figFoot,
    videos: videos, layers: layers,
    get morph() { return morphMode; },
    gl: function () { return !!glInit(); },
    bar: setBar
  };
})(window);
