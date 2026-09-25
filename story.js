/* ==========================================================================
   Boo Machine — the motion of the page   (v7: target-driven morph)

   1. THE HERO SCRUB (v4/v5/v6, kept). One timeline scrubbed over ~1.2
      viewports: the unit / spill / light planes rise 18svh and grow to
      1.04, the title rises 6svh, the slide zone rises 28svh and scrolls
      away as it is, the bulb (--rl-k) leans up then hands over.
      v9: stronger, depth-ordered parallax (PAR: sign +2 %, hand +36 % with
      scale 1.10 and 2 deg, zone +42 %), and the planes + zone (and, on a
      phone, the chapters' fade under the phone) run as CSS scroll-driven
      animations where supported, i.e. with the scroll on the compositor.
   2. THE STORY — A STATE MACHINE, NOT A SCRUB. v6 scrubbed the morph over
      40svh of scroll, so a reader parked mid-window sat on a half-morphed
      hand ("weird in-between states"). v7: the scroll only ever picks a
      TARGET hand, 0/1/2 — chapter k's copy block crossing THR (60 % of the
      viewport on desktop, 78 % on a phone) going down makes it k, and
      crossing THR + 8 % going up makes it k − 1 (hysteresis, so the edge
      cannot chatter). One float H (0..2) follows the target with
      gsap.to(state, {H: target, duration .9, ease power2.inOut,
      overwrite: true}) — always from the CURRENT H, so a reversal mid-
      morph tweens back from where it is and a jump across two thresholds
      tweens straight to the far hand. Every tick applyH(H): the WebGL
      displacement at frac(H) (the DOM crossfade without WebGL), the
      display crossfade (frac .2–.8) and the red flare (peaked at .5) are
      all functions of H. At an integer H the canvas is released and one
      DOM hand layer shows. Nothing is scrubbed; no scroll position can
      hold H fractional longer than the tween.
   3. THE DISPLAY MAPPING (v3, kept): .screen (906 x 1970) onto the shared
      quad with one matrix3d from the 4-point homography.
   4. THE VIDEOS. Only the clip of the current state plays. Clip k is in the
      DOM when it is the target, or the smoothed H is fading it; clip k is
      loaded (preload none -> auto) when chapter k's copy comes within 1.3
      viewports, so it has landed before its crossfade. Paused off screen
      (IO) and on visibilitychange.
   5. REFRESH POLICY (v5, kept). ScrollTrigger auto-refreshes on resize
      only (ignoreMobileResize); the page refreshes ONCE when the fonts and
      the phone's images have landed, never during a scroll. On a refresh
      the target is re-derived from the triggers' progress.
   6. THE ISLAND: on past 80 px of scroll, off at the top (a passive scroll
      listener, in every motion mode).
   7. REDUCED MOTION: no ScrollTrigger at all — no scrub, no morph, no
      reveal; the first hand and the posters.

   QA hooks — window.booStory:
     .set(i)            scroll so chapter i (0..2) sits at the top
     .to('hero', p)     scroll so the hero trigger is at progress p
     .to('thr', k, dy)  scroll so threshold k (1|2) is crossed by dy px
                        (dy > 0: past it going down; the band is 8 % tall)
     .setTarget(i)      tween to hand i now (the next scroll may override;
                        .lock = true keeps the scroll from doing so)
     .target  .h  .tweening  .thr (the two band triggers)  .state
     ?H=1.5             hold H at a value (no tween, no target): QA stills
     .hero  .tls (the hero timeline)  .refreshes  .quads()  .hands()
     .videos  .layers  .morph  'gl' | 'dom' | 'none'  .bar(on)  .figFoot()
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
  /* the thresholds: chapter k's copy block's top crossing THR of the viewport
     going down makes hand k the target; crossing THR + HYS going up makes it
     k - 1 (on a phone the copy is read UNDER the sticky phone, so it has to
     arrive lower: THR_M).
     v10: EARLIER (Fab: "the hands start to morph a bit too late — as soon
     as the text comes in"). v9 waited for the copy to reach 60 % (78 % on a
     phone), i.e. until it was half-way up the screen and already read. Now
     the morph fires as the copy enters, together with its reveal (88 %):
     84 % on a desktop, 80 % on a phone: at 90 % the next copy was still
     behind the island, so the hand changed while the reader was on the
     previous chapter (seen in iOS Safari). */
  var THR_D = 84, THR_M = 80, HYS = 8;
  var DUR = 0.9, EASE = "power2.inOut";
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
  /* v7: the flare on the PHONE is gone — it screened red light over the top
     bezel at mid-morph, i.e. the phone itself changed during a transition
     (the client's note); the room flare (.fig-flare, behind the phone) stays */
  var flare = null;
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
    /* v8 perf: the same url as the mask itself, not only through the var():
       a var() url is re-resolved on every style recalc of .display and the
       layer is repainted each time (trace: once per frame whenever anything
       on <html> changed). The inline longhands win over the .has-mask rule,
       which keeps the size / repeat. */
    display.style.webkitMaskImage = display.style.maskImage = 'url("' + phoneEl.getAttribute("data-mask") + '")';
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
     H in (k - .8, k + .8); it is shown while it is the TARGET or the
     smoothed H is inside that range, so a clip that is still fading can
     never be removed. loadClip(k) is called ahead of time (a pre-trigger
     1.3 viewports before the chapter) so it has landed before it is seen. */
  function loadClip(k) {
    var v = clips[k]; if (!v) return;
    if (v.preload === "none") { v.preload = "auto"; try { v.load(); } catch (e) {} }
  }
  function showClips(target, smooth) {
    for (var k = 0; k < 3; k++) {
      var v = clips[k]; if (!v) continue;
      var on = k === target || (smooth > k - 0.85 && smooth < k + 0.85);
      if (on === shown[k]) continue;
      shown[k] = on;
      if (on) { v.style.display = ""; loadClip(k); }
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
  var lastOp = [-1, -1, -1], cvShown = false, lastT = -1, boundPair = -1;
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
  /* the display crossfade and the flare as functions of the window's t:
     the clips cross over t .2 -> .8 (linear, as v6's tween), the flare
     rises power2.out to t .5 and falls power2.in to 1 */
  var lastClipOp = [-1, -1, -1], lastFlare = -1;
  function clipOp(k, v) {
    if (!clips[k] || lastClipOp[k] === v) return;
    lastClipOp[k] = v;
    clips[k].style.opacity = String(v);
  }
  function flareOp(v) {
    if (lastFlare === v) return;
    lastFlare = v;
    if (flare) flare.style.opacity = String(v);
    if (figFlare) figFlare.style.opacity = String(v);
  }
  function applyFx(w) {
    var k;
    if (w.i === w.j) {
      for (k = 0; k < 3; k++) clipOp(k, k === w.i ? 1 : 0);
      flareOp(0);
      return;
    }
    var x = Math.max(0, Math.min(1, (w.t - 0.2) / 0.6));
    for (k = 0; k < 3; k++) clipOp(k, k === w.i ? +(1 - x).toFixed(4) : k === w.j ? +x.toFixed(4) : 0);
    var u = w.t < 0.5 ? w.t / 0.5 : (w.t - 0.5) / 0.5;
    flareOp(+(w.t < 0.5 ? 1 - (1 - u) * (1 - u) : 1 - u * u).toFixed(4));
  }
  /* the hands at H: exactly one defined picture */
  var hSmooth = 0;
  function applyHands(h) {
    hSmooth = h;
    var w = where(h), k;
    setDiscrete(w.t < 0.5 ? w.i : w.j);
    applyFx(w);
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
      if (!cvShown) { g.size(); morphCv.style.display = "block"; cvShown = true; boundPair = -1; lastT = -1; }
      /* v7: one tween can cross both windows (0 -> 2): rebind the pair
         whenever the window changes, not only when the canvas comes on */
      if (boundPair !== w.i) { g.pair(w.i, w.j); boundPair = w.i; lastT = -1; }
      if (w.t !== lastT) { g.draw(w.t); lastT = w.t; }
    } else {
      morphMode = "dom";
      if (cvShown) { morphCv.style.display = "none"; cvShown = false; }
      for (k = 0; k < 3; k++) if (layers[k]) layerOp(k, k === w.i ? 1 - w.t : k === w.j ? w.t : 0);
    }
  }

  /* ---------- the WebGL morph --------------------------------------------- */
  /* v8 perf: the warm-up is STAGED. It was one task — context, shader
     compile + link, noise, program set-up — 150-190 ms on a desktop CPU and
     ~720 ms at 4x throttle (measured, LoAF "story.js:warm"), which landed as
     a visible freeze of the swaying hero ~0.5 s after the entrance. glStage()
     now does one step per call: (1) the context, (2) compile + link WITHOUT
     reading the status back (with KHR_parallel_shader_compile the driver
     compiles off the thread), (3) the status, buffers, uniforms, noise.
     warm() takes one step per idle slot; glInit() — what a morph that starts
     before the warm-up is done calls — still finishes every step at once, so
     the morph behaves exactly as before. */
  var GL = null, glS = null;
  function glInit() {
    while (!glStage(true)) {}
    return GL;
  }
  function glStage(sync) {
    if (GL !== null) return true;
    if (!glS) {
      if (!morphCv || reduce.matches || qs.get("morph") === "dom") { GL = false; return true; }
      var gl0;
      try { gl0 = morphCv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" }); } catch (e) { gl0 = null; }
      if (!gl0) { GL = false; return true; }
      glS = { gl: gl0, step: 1, par: gl0.getExtension("KHR_parallel_shader_compile") };
      return false;
    }
    var gl = glS.gl;
    if (glS.step === 1) {
      var mk = function (type, src) { var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return o; };
      glS.vs = mk(gl.VERTEX_SHADER,
        "attribute vec2 a;varying vec2 v;void main(){v=vec2(a.x*.5+.5,.5-a.y*.5);gl_Position=vec4(a,0.,1.);}");
      glS.fs = mk(gl.FRAGMENT_SHADER,
      "precision mediump float;varying vec2 v;uniform sampler2D uA,uB,uN;uniform vec4 oA,oB;uniform float t,amp,ns;uniform vec2 nsh;" +
      "vec4 smp(sampler2D s,vec4 o,vec2 p){vec2 uv=(p-o.xy)/o.zw;vec2 i=step(vec2(0.),uv)*step(uv,vec2(1.));return texture2D(s,uv)*i.x*i.y;}" +
      "void main(){vec2 n=texture2D(uN,v*ns+nsh).rg*2.-1.;vec2 n2=texture2D(uN,v*ns*2.7+nsh.yx).gb*2.-1.;" +
      "float k=sin(t*3.14159);vec2 d=(n*.78+n2*.22)*amp*k;" +
      "vec4 a=smp(uA,oA,v+d*t);vec4 b=smp(uB,oB,v-d*(1.-t));" +
      "float m=smoothstep(0.,1.,t);gl_FragColor=mix(a,b,m);}");
      glS.pr = gl.createProgram(); gl.attachShader(glS.pr, glS.vs); gl.attachShader(glS.pr, glS.fs); gl.linkProgram(glS.pr);
      glS.step = 2;
      return false;
    }
    /* step 2: still compiling on the driver's thread -> come back next slot */
    if (!sync && glS.par && !gl.getProgramParameter(glS.pr, glS.par.COMPLETION_STATUS_KHR)) return false;
    var pr = glS.pr, vs = glS.vs, fs = glS.fs;
    glS = null;
    GL = false;
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS) ||
        !gl.getProgramParameter(pr, gl.LINK_STATUS)) return true;
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
          /* v8 perf: from the file's bytes, not from the <img>. Chromium
             decodes createImageBitmap(<img>) SYNCHRONOUSLY on the main thread
             (measured 42 ms per 1856 x 2320 photograph on a desktop CPU, three
             of them in one warm-up task); from a Blob it decodes on a worker
             (0.1 ms on the main thread). The fetch is served from the cache
             the <img> filled; over file:// it fails and the old path runs. */
          var opts = { premultiplyAlpha: "premultiply", colorSpaceConversion: "none" };
          var src = el.currentSrc || el.src;
          pending[i] = (global.fetch && global.Blob ? global.fetch(src).then(function (r) { if (!r.ok) throw r.status; return r.blob(); })
                .then(function (bl) { return global.createImageBitmap(bl, opts); })
                .catch(function () { return global.createImageBitmap(el, opts); })
              : global.createImageBitmap(el, opts))
            .then(function (bm) { handTex[i] = tex(0, bm, gl.CLAMP_TO_EDGE, true); bm.close(); pending[i] = null; if (hold !== null) tick(); })
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
    return true;
  }
  /* the textures are made ahead of the first morph: after load (idle) and
     again when the stage comes near, one per image as it lands */
  var warmQ = false;
  function warm() {
    /* v8 perf: one warm-up step per idle slot (see glStage) */
    if (GL === null && !glStage(false)) {
      if (!warmQ) {
        warmQ = true;
        var next = function () { warmQ = false; warm(); };
        if (global.requestIdleCallback) global.requestIdleCallback(next, { timeout: 1000 }); else global.setTimeout(next, 50);
      }
      return;
    }
    var g = GL; if (!g) return;
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
  var heroST = null, htl = null, thr = [null, null], pres = [], reveals = [], fades = [], refreshes = 0;

  /* ---------- 2. the state machine ---------------------------------------- */
  var state = { H: 0 }, target = 0, tween = null, lock = false;
  var hold = qs.has("H") ? Math.max(0, Math.min(2, parseFloat(qs.get("H")) || 0)) : null;
  function tick() { applyHands(state.H); showClips(target, state.H); }
  /* the target changed: tween H there from wherever it is now. overwrite:
     true kills the running tween, so a reversal mid-morph turns back from
     the current H (never a jump) and a jump across two thresholds goes
     straight to the far hand */
  /* v10: ON A TOUCH SCREEN THE MORPH WAITS FOR THE FINGER. Everything the
     morph draws (the WebGL displacement, the crossfades, the flare) is main-
     thread work every frame for 0.9 s, and in iOS WebKit every main-thread
     commit during a scroll re-places the sticky phone with a stale scroll
     offset — the phone and hand jittered (Fab, iOS Safari and Chrome). So
     while the page is moving under a finger the new target is only noted,
     and the morph plays once the scroll has been still for 180 ms. */
  var touchOnly = global.matchMedia("(hover: none) and (pointer: coarse)");
  var moving = false, movingT = 0, pending = false;
  global.addEventListener("scroll", function () {
    if (!touchOnly.matches) return;
    moving = true; clearTimeout(movingT);
    movingT = setTimeout(function () { moving = false; if (pending) playTarget(); }, 180);
  }, { passive: true });
  function playTarget() {
    pending = false;
    tween = gsap.to(state, { H: target, duration: DUR, ease: EASE, overwrite: true, onUpdate: tick, onComplete: function () { tween = null; tick(); } });
    tick();
  }
  function setTarget(i) {
    i = Math.max(0, Math.min(2, i | 0));
    if (i === target) return;
    target = i;
    loadClip(i);
    if (hold !== null) return;
    if (reduce.matches) { state.H = i; tick(); return; }
    if (moving && touchOnly.matches) { pending = true; return; }
    playTarget();
  }
  /* the target from the two band triggers: past a band's end (its copy's
     top above THR) -> at least that hand; above its start (the top below
     THR + HYS) -> at most the hand before; inside the band the target
     keeps what it was (the hysteresis) */
  function evalTarget() {
    if (lock) return;
    var t = target, k, p;
    for (k = 0; k < 2; k++) {
      if (!thr[k]) continue;
      p = thr[k].progress;
      if (p >= 1) t = Math.max(t, k + 1);
      else if (p <= 0) t = Math.min(t, k);
    }
    setTarget(t);
  }
  function onRefresh() { refreshes++; evalTarget(); tick(); }

  function vh(f) { return function () { return -(global.innerHeight * f); }; }

  /* v9: MORE PARALLAX (Fab: "a bit more parallax for the hand"). v4-v8 moved
     every layer at almost the page's speed (title +6 %, hand +18 %, zone
     +28 % of a viewport over the 120 % scrub: 1.05x / 1.15x / 1.23x), so
     nothing read as depth. v9 spreads the layers by their depth in the
     room: the sign on the wall (behind the hands) almost at the page's
     speed (+2 %), the hand and its disc — the subject, nearer — rising
     +36 % (1.3x) while it grows to 1.10 and turns 2 deg, as if it swings
     past the camera, the slide control in front at +42 %. The three
     planes (unit / spill / light) share ONE transform: the reflection and
     the spill are registered to the photograph and must never come apart.
     The hand LEADS rather than lags: tried at 1440 / 768 / 375 (scratch
     proto shots), a lagging hand leaves its dissolving sleeve hanging
     over the story's first chapter (the hero paints above the story).
     Fractions of the viewport over the whole scrub; y > 0 = up. */
  var PAR = { py: 0.36, ps: 1.10, pr: 2, ty: 0.02, zy: 0.42 };
  /* v9: the planes and the zone ride a CSS SCROLL-DRIVEN animation
     (animation-timeline: scroll(root), story.css) wherever it exists:
     Chromium runs it on the compositor, Safari 26.4+ too. A scrubbed
     GSAP transform is written by the main thread AFTER the compositor has
     already scrolled the page, so during an iOS momentum scroll a layer
     that moves at 1.3x the page lands a frame late, by a different amount
     each frame (the "shaking" hand; doubled parallax would double it).
     The range is ScrollTrigger's own start / end in px (written on each
     refresh), so both paths cover the same scroll. Elsewhere (Safari < 26,
     Firefox) the GSAP scrub runs as before, with a short smoothing on
     touch screens so a late frame eases instead of stepping. The title
     (+2 %, sub-pixel per frame) and the bulb's --rl-k stay in GSAP: the
     title's own flicker animations would be replaced by a CSS one.
     ?sda=0 forces the GSAP path, ?sda=1 the CSS one. */
  var SDA = qs.has("sda") ? qs.get("sda") !== "0" :
    !!(global.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()") && CSS.supports("animation-range: 0px 1px"));
  var coarse = global.matchMedia("(pointer: coarse)");
  /* the scroll range of a CSS scroll-driven animation, in px from the top,
     as custom properties on the element itself (never on <html>: a root
     property restyles the page) */
  function setRange(el, st) {
    if (!el || !st) return;
    el.style.setProperty("--v9-r0", Math.round(st.start) + "px");
    el.style.setProperty("--v9-r1", Math.round(Math.max(st.end, st.start + 1)) + "px");
  }
  function buildScroll() {
    if (!ST || heroST) return;
    /* the hero: the planes rise and grow, the title and the zone rise; the
       zone keeps its opacity (v6). v9: PAR (above), CSS-driven when SDA */
    var planes = hero.querySelectorAll(".plane.p-unit, .plane.p-spill, .plane.p-light");
    htl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: { trigger: hero, start: "top top", end: "+=120%", scrub: SDA || !coarse.matches ? true : 0.25, invalidateOnRefresh: true,
                       onRefresh: function (self) { if (SDA) setRange(hero, self); } }
    });
    if (SDA) {
      hero.style.setProperty("--v9-py", (-PAR.py * 100) + "svh");
      hero.style.setProperty("--v9-ps", String(PAR.ps));
      hero.style.setProperty("--v9-pr", PAR.pr + "deg");
      hero.style.setProperty("--v9-zy", (-PAR.zy * 100) + "svh");
      hero.classList.add("v9-par");
    } else {
      htl.to(planes, { y: vh(PAR.py), scale: PAR.ps, rotation: PAR.pr, transformOrigin: "50% 40%", duration: 1 }, 0)
        .to(zone, { y: vh(PAR.zy), duration: 1 }, 0);
    }
    htl.to(hero.querySelector(".title"), { y: vh(PAR.ty), duration: 1 }, 0)
      .to(hero, { "--rl-k": 1.25, duration: 0.4 }, 0)
      .to(hero, { "--rl-k": 0.55, duration: 0.6 }, 0.4);
    heroST = htl.scrollTrigger;
    if (SDA) setRange(hero, heroST);

    /* the two threshold bands: chapter k+1's copy block, its top from
       THR + HYS to THR of the viewport (8 % tall). The trigger is the COPY
       (never transformed; centred in its chapter on desktop, at the top of
       it on a phone), not the section. */
    var T = mobile.matches ? THR_M : THR_D;
    [0, 1].forEach(function (k) {
      thr[k] = ST.create({
        trigger: copies[k + 1] || chapters[k + 1], start: "top " + (T + HYS) + "%", end: "top " + T + "%",
        invalidateOnRefresh: true,
        onUpdate: evalTarget, onToggle: evalTarget,
        onRefresh: k === 0 ? onRefresh : evalTarget
      });
      /* the pre-trigger: 1.3 viewports before the chapter, load its clip
         and make the GL textures */
      pres[k] = ST.create({
        trigger: copies[k + 1] || chapters[k + 1], start: "top 130%",
        onEnter: function () { loadClip(k + 1); warm(); }, onEnterBack: warm
      });
    });

    /* the copy: a light reveal the first time it enters (24 px up, fade) */
    /* v10: a CSS TRANSITION started by a class (story.css .copy-in.rv), not
       a GSAP tween: the tween wrote opacity and transform on the main thread
       for 0.7 s, mid-scroll, which made the sticky phone jitter in iOS
       WebKit; a transition runs on the compositor */
    reveals = copies.map(function (c, k) {
      if (!c || !copyIns[k]) return null;
      var el = copyIns[k];
      el.classList.add("rv");
      function show(self) { if (self.progress > 0 || self.isActive) el.classList.add("is-in"); }
      return ST.create({ trigger: c, start: "top 88%", onToggle: show, onRefresh: show });
    });
    /* on a phone the copy passes UNDER the sticky phone: it fades out as its
       top reaches the phone's foot (scrubbed, reversible) */
    if (mobile.matches) {
      /* the fade is on the CHAPTER, the reveal on the copy inside it: two
         elements, so the two opacities never write over each other */
      fades = copies.map(function (c, k) {
        if (!c) return null;
        var from = function () { return "top " + Math.round(figFoot() + 12) + "px"; };
        var to = function () { return "top " + Math.round(figFoot() - 36) + "px"; };
        /* v10: a CLASS and a CSS transition (story.css .chapter.fd), not a
           scrub or a scroll-timeline animation: both change the chapter's
           opacity every frame of the scroll, and WebKit runs a scroll-driven
           animation on the main thread, so every frame was a commit that
           re-placed the sticky phone with a stale offset (the jitter). Now
           the copy fades once, over .35 s, as its top reaches the phone's
           foot, and comes back the same way. */
        chapters[k].classList.add("fd");
        function under(self) { chapters[k].classList.toggle("is-under", self.progress > 0); }
        return ST.create({ trigger: c, start: from, end: "bottom top", invalidateOnRefresh: true,
                           onToggle: under, onRefresh: under, onUpdate: function (self) { if ((self.progress > 0) !== chapters[k].classList.contains("is-under")) under(self); } });
      });
    }
    if (hold !== null) { state.H = hold; target = Math.round(hold); loadClip(target); }
    tick();
  }
  /* the sticky phone's foot in viewport px (its top + its height) */
  function figFoot() {
    var cs = getComputedStyle(fig);
    return (parseFloat(cs.top) || 0) + fig.offsetHeight;
  }
  function killScroll() {
    if (tween) { tween.kill(); tween = null; }
    [heroST].concat(thr, pres, reveals, fades).forEach(function (t) { if (t) t.kill(true); });
    if (htl) htl.kill();
    heroST = null; htl = null; thr = [null, null]; pres = []; reveals = []; fades = [];
    state.H = 0; target = 0;
    gsap.set(hero.querySelectorAll(".plane, .title, .unlock-zone"), { clearProps: "transform,opacity" });
    gsap.set(copyIns.concat(chapters).filter(Boolean), { clearProps: "transform,opacity" });
    copyIns.forEach(function (el) { if (el) el.classList.remove("rv", "is-in"); });
    pending = false;
    hero.style.removeProperty("--rl-k");
    /* v9: the CSS scroll-driven parallax / fades come off with their ranges */
    hero.classList.remove("v9-par");
    [hero].concat(chapters).forEach(function (el) {
      if (!el) return;
      el.classList.remove("v9-fade", "fd", "is-under");
      ["--v9-r0", "--v9-r1", "--v9-py", "--v9-ps", "--v9-pr", "--v9-zy"].forEach(function (p) { el.style.removeProperty(p); });
    });
    if (morphCv) morphCv.style.display = "none";
    cvShown = false; hSmooth = 0;
    layers.forEach(function (l, k) { if (l) { l.style.opacity = ""; lastOp[k] = -1; } });
    clips.forEach(function (v, k) { if (v) { v.style.display = ""; v.style.opacity = ""; shown[k] = true; lastClipOp[k] = -1; } });
    if (figFlare) figFlare.style.opacity = ""; lastFlare = -1;
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
    if (!reduce.matches) whenIntroDone(function () { if (global.requestIdleCallback) global.requestIdleCallback(warm, { timeout: 2500 }); else global.setTimeout(warm, 600); });
  });
  /* a3-v8: the GL warm-up is one long task (190-300 ms on a desktop CPU,
     ~700 ms at 4x throttle) and its idle timeout used to land it in the
     middle of the entrance (intro.js), freezing the knob's glide home. It
     waits for the entrance to finish (the event, or 6 s at most); a scroll
     to the story still warms early through the pre-trigger above. */
  function whenIntroDone(fn) {
    if (!doc.documentElement.classList.contains("intro")) { fn(); return; }
    var t = global.setTimeout(go, 6000);
    function go() { global.clearTimeout(t); doc.removeEventListener("boointro:done", go); fn(); }
    doc.addEventListener("boointro:done", go);
  }

  global.booStory = {
    set: function (i) {
      var c = chapters[Math.max(0, Math.min(2, i | 0))]; if (!c) return null;
      var y = c.getBoundingClientRect().top + global.scrollY; global.scrollTo(0, y); return y;
    },
    get state() { return cur; },
    get h() { return hSmooth; },
    get target() { return target; },
    get tweening() { return !!tween && tween.isActive(); },
    get tween() { return tween; },
    get lock() { return lock; }, set lock(v) { lock = !!v; },
    get hero() { return heroST; }, get thr() { return thr; }, get tls() { return htl; },
    get refreshes() { return refreshes; },
    setTarget: function (i) { setTarget(i); return target; },
    /* to('hero', p): the hero trigger at progress p. to('thr', k, dy): the
       page scrolled so threshold k (1|2) — the band's END, the copy's top at
       THR — is dy px past (dy > 0: crossed going down) */
    to: function (what, p, dy) {
      var y;
      if (what === "hero") { if (!heroST) return null; y = heroST.start + (heroST.end - heroST.start) * Math.max(0, Math.min(1, +p || 0)); }
      else { var st = thr[(p | 0) - 1]; if (!st) return null; y = st.end + (+dy || 0); }
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
               flare: figFlare ? +getComputedStyle(figFlare).opacity : null,
               where: where(hSmooth) };
    },
    figFoot: figFoot,
    sda: SDA, par: PAR,   /* v9: the parallax path ('css' scroll timeline or GSAP) and its numbers */
    videos: videos, layers: layers,
    get morph() { return morphMode; },
    gl: function () { return !!glInit(); },
    bar: setBar
  };
})(window);
