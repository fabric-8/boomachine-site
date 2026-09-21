/* ==========================================================================
   Boo Machine — the motion of the page   (v4: GSAP + ScrollTrigger)

   1. THE HERO SCRUB. One timeline scrubbed over ~1.2 viewports from the
      top of the page: the unit / spill / light planes (the wrappers of the
      tilt rig — the rig's own rotate is never touched) rise 18svh and grow
      to 1.04, the title rises 6svh, the slide zone rises 28svh and fades
      out by 60 %, the red bulb (--rl-k) leans up to 1.25 by 40 % and hands
      over (0.55) by the end. The floating bar comes on at 62 %.
   2. THE STAGE. .stage-wrap is pinned for 3 x 100svh. Three states, one per
      third: the copy block (out .35 s / in .6 s), the capture on the
      display (300 ms crossfade, the incoming plays, the outgoing pauses
      after), the hand (0.8 s: the incoming layer fades up from scale 1.02
      and a 6 px blur, the outgoing fades away; with WebGL the two
      photographs are drawn on a canvas with a noise-driven UV offset that
      peaks mid-way, so it warps from one to the other instead of
      dissolving; a red flare on the room and on the phone either way).
      Before the pin the stage fades up as it approaches.
   3. THE DISPLAY MAPPING (v3, kept). .screen (604 x 1312, origin 0 0) is
      mapped onto the SHARED display quad (data-quad, image px) with one
      matrix3d from the 4-point homography. Each hand layer's own quad is
      fitted onto the shared one by left/top/width/height (a rectangle fit;
      with phones2/ the quads are identical and this is the identity).
   4. THE VIDEOS. Muted, looping; only the active one is ever playing, and
      only while the phone is on screen (IntersectionObserver). Reduced
      motion: nothing plays, the posters show.
   5. REDUCED MOTION: no ScrollTrigger at all — no scrub, no pin, no morph.
      story.css stacks the three copy blocks; the bar keeps the v3 rule
      (the slide zone has scrolled off the top).

   QA hooks — window.booStory:
     .set(i)          jump to state i (0..2) with the transitions
     .state           the current state
     .to(what, p)     scroll so the hero ('hero') or the stage ('stage')
                      scrub is at progress p (0..1)
     .hero / .pin     the ScrollTrigger instances
     .quads()         the mapped display corners in page px
     .videos          the three <video>s   .morph  'gl' | 'dom' | 'none'
     .bar(on)
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var stage = doc.getElementById("storyStage");
  var phoneEl = doc.getElementById("phone");
  if (!stage || !phoneEl || !global.gsap) return;
  var gsap = global.gsap;
  var ST = global.ScrollTrigger;
  if (ST) { gsap.registerPlugin(ST); ST.config({ ignoreMobileResize: true }); }

  var HANDS = ["vampire", "wolf", "witch"];
  var CLIPS = ["tap", "loop", "disc"];
  var copies = [].slice.call(doc.querySelectorAll("#copies .copy"));
  var layers = HANDS.map(function (h) { return phoneEl.querySelector('.hand-layer[data-hand="' + h + '"]'); });
  var clips = CLIPS.map(function (c) { return phoneEl.querySelector('video[data-clip="' + c + '"]'); });
  var videos = clips.filter(Boolean);
  var handsBox = phoneEl.querySelector(".hands");
  var morphCv = phoneEl.querySelector(".morph");
  var flare = phoneEl.querySelector(".flare");
  var stageFlare = stage.querySelector(".stage-flare");
  var screen = phoneEl.querySelector(".screen");
  var img = phoneEl.querySelector(".plate");
  var qs = {};
  try { qs = new URLSearchParams(global.location.search); } catch (e) {}

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
  var mapped = { m: null, pts: null };

  function mapScreen() {
    if (!quad || !screen) return;
    var w = phoneEl.clientWidth;
    if (!(w > 0)) return;
    var k = w / frameW;
    var W = screen.offsetWidth || 604, H = screen.offsetHeight || 1312;
    var to = quad.map(function (q) { return [q[0] * k, q[1] * k]; });
    var h = homography([[0, 0], [W, 0], [W, H], [0, H]], to);
    if (!h) return;
    mapped.m = matrix3d(h); mapped.pts = to;
    screen.style.transform = mapped.m;
  }
  /* each hand layer: its own quad -> the shared quad, as a rectangle fit
     (left/top/width/height in % of the frame, so the layer's transform is
     free for the morph) */
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
  /* the display mask (alpha = the display) only where a mask image can load */
  var display = phoneEl.querySelector(".display");
  if (global.location.protocol !== "file:" && display && phoneEl.getAttribute("data-mask")) {
    display.style.setProperty("--screen-mask", 'url("' + phoneEl.getAttribute("data-mask") + '")');
    display.classList.add("has-mask");
  }

  /* ---------- 4. the videos ---------------------------------------------- */
  var onScreen = false;
  function play(v) {
    if (!v || reduce.matches || !onScreen) return;
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }
  function pause(v) { if (v && !v.paused) v.pause(); }
  function pauseAll() { videos.forEach(pause); }
  if ("IntersectionObserver" in global) {
    new IntersectionObserver(function (es) {
      var e = es[es.length - 1];
      onScreen = e.intersectionRatio >= 0.3;
      if (onScreen) play(clips[cur]); else pauseAll();
    }, { threshold: [0, 0.3, 1] }).observe(phoneEl);
  } else onScreen = true;
  doc.addEventListener("visibilitychange", function () { if (doc.hidden) pauseAll(); });

  /* ---------- 2. the states ---------------------------------------------- */
  var cur = 0, morphMode = "none";

  function setCopy(i, prev) {
    var dir = i > prev ? 1 : -1;
    copies.forEach(function (c, j) {
      if (j === i) {
        c.classList.add("is-on"); c.removeAttribute("aria-hidden");
        if (reduce.matches) { gsap.set(c, { opacity: 1, y: 0 }); return; }
        gsap.fromTo(c, { opacity: 0, y: 26 * dir }, { opacity: 1, y: 0, duration: 0.6, delay: 0.12, ease: "power3.out", overwrite: true });
      } else if (j === prev) {
        c.setAttribute("aria-hidden", "true");
        if (reduce.matches) { c.classList.remove("is-on"); gsap.set(c, { opacity: 0 }); return; }
        gsap.to(c, { opacity: 0, y: -18 * dir, duration: 0.35, ease: "power2.in", overwrite: true,
          onComplete: function () { c.classList.remove("is-on"); } });
      }
    });
  }
  function setClip(i, prev) {
    var inc = clips[i], out = clips[prev];
    if (!inc) return;
    inc.classList.add("is-on"); inc.removeAttribute("aria-hidden");
    if (out && out !== inc) out.setAttribute("aria-hidden", "true");
    play(inc);
    if (reduce.matches) {
      gsap.set(inc, { opacity: 1 });
      if (out && out !== inc) { gsap.set(out, { opacity: 0 }); out.classList.remove("is-on"); pause(out); }
      return;
    }
    gsap.to(inc, { opacity: 1, duration: 0.3, ease: "none", overwrite: true });
    if (out && out !== inc) gsap.to(out, { opacity: 0, duration: 0.3, ease: "none", overwrite: true,
      onComplete: function () { out.classList.remove("is-on"); pause(out); } });
  }
  function flareRoom() {
    if (reduce.matches) return;
    [stageFlare, flare].forEach(function (el) {
      if (!el) return;
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.22, ease: "power2.out", yoyo: true, repeat: 1, repeatDelay: 0.14, overwrite: true });
    });
  }
  function morphDom(i, prev) {
    var inc = layers[i], out = layers[prev];
    if (!inc) return;
    inc.classList.add("is-on"); inc.removeAttribute("aria-hidden");
    if (out && out !== inc) out.setAttribute("aria-hidden", "true");
    if (reduce.matches) {
      gsap.set(inc, { opacity: 1, scale: 1, filter: "none" });
      if (out && out !== inc) { gsap.set(out, { opacity: 0 }); out.classList.remove("is-on"); }
      return;
    }
    gsap.fromTo(inc, { opacity: 0, scale: 1.02, filter: "blur(6px)" },
      { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.8, ease: "power2.out", overwrite: true,
        onComplete: function () { inc.style.filter = ""; } });
    if (out && out !== inc) gsap.to(out, { opacity: 0, duration: 0.8, ease: "power2.inOut", overwrite: true,
      onComplete: function () { out.classList.remove("is-on"); } });
  }

  /* ---------- the WebGL morph --------------------------------------------- */
  var GL = null;
  function glInit() {
    if (GL !== null) return GL;
    GL = false;
    if (!morphCv || reduce.matches || qs.get("morph") === "dom") return GL;
    var gl;
    try { gl = morphCv.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
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
      /* the photograph -> a texture. Decoded off the main thread through
         createImageBitmap (the upload itself is ~3 ms; a texImage2D straight
         from the <img> is ~30 ms of decode on the main thread, measured), so
         it can happen while the page scrolls. */
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
      bind: function (i, unit) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, handTex[i]); },
      size: function () {
        var dpr = Math.min(global.devicePixelRatio || 1, 2);
        var w = Math.round(handsBox.clientWidth * dpr), h = Math.round(handsBox.clientHeight * dpr);
        if (morphCv.width !== w || morphCv.height !== h) { morphCv.width = w; morphCv.height = h; }
        gl.viewport(0, 0, w, h);
      },
      draw: function (t) {
        gl.uniform1f(U.t, t);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      noise: noiseTex
    };
    return GL;
  }
  function morphGl(i, prev) {
    var g = glInit();
    if (!g || i === prev || !g.ready(prev) || !g.ready(i)) return false;
    var inc = layers[i], out = layers[prev];
    var gl = g.gl, U = g.U;
    g.size();
    g.bind(prev, 0); g.bind(i, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, g.noise);
    var fa = fits[prev], fb = fits[i];
    gl.uniform4f(U.oA, fa.l, fa.t, fa.w, fa.h); gl.uniform4f(U.oB, fb.l, fb.t, fb.w, fb.h);
    gl.uniform1f(U.amp, 0.05); gl.uniform1f(U.ns, 1.6); gl.uniform2f(U.nsh, Math.random(), Math.random());
    /* the DOM layers step aside; the canvas carries both photographs */
    gsap.killTweensOf([inc, out, morphCv]);
    gsap.set([inc, out], { opacity: 0, scale: 1, filter: "none" });
    inc.classList.add("is-on"); inc.removeAttribute("aria-hidden");
    out.classList.remove("is-on"); out.setAttribute("aria-hidden", "true");
    morphCv.style.display = "block";
    var o = { t: 0 };
    g.draw(0);
    gsap.fromTo(morphCv, { scale: 1.02 }, { scale: 1, duration: 0.8, ease: "power2.out", overwrite: true });
    gsap.to(o, { t: 1, duration: 0.8, ease: "power2.inOut",
      onUpdate: function () { g.draw(o.t); },
      onComplete: function () {
        gsap.set(inc, { opacity: 1 });
        morphCv.style.display = "none";
      } });
    return true;
  }
  function morph(i, prev) {
    if (i === prev) return;
    if (!reduce.matches && morphGl(i, prev)) { morphMode = "gl"; return; }
    morphMode = reduce.matches ? "none" : "dom";
    morphDom(i, prev);
  }
  /* the textures are made ahead of the first morph: after the page has
     loaded (idle) and again when the stage comes into view, one per image
     as it lands. A morph that fires before its two textures exist falls
     back to the DOM crossfade for that one change. */
  function warm() {
    var g = glInit(); if (!g) return;
    layers.forEach(function (el, i) {
      if (!el) return;
      if (el.complete && el.naturalWidth) g.prepare(i);
      else el.addEventListener("load", function () { g.prepare(i); }, { once: true });
    });
  }

  function setState(i) {
    i = Math.max(0, Math.min(2, i | 0));
    if (i === cur) return;
    var prev = cur; cur = i;
    setCopy(i, prev);
    setClip(i, prev);
    morph(i, prev);
    flareRoom();
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
  var hero = doc.querySelector(".hero");
  var zone = doc.querySelector(".hero .unlock-zone");
  var heroST = null, pinST = null, enterST = null;

  function vh(f) { return function () { return -(global.innerHeight * f); }; }

  function buildScroll() {
    if (!ST || heroST) return;
    /* the hero */
    function heroUpdate(self) {
      setBar(self.progress >= 0.62);
      if (zone) zone.classList.toggle("is-gone", self.progress >= 0.6);
    }
    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: hero, start: "top top", end: "+=120%", scrub: true, invalidateOnRefresh: true,
        onUpdate: heroUpdate, onRefresh: heroUpdate
      }
    });
    tl.to(hero.querySelectorAll(".plane.p-unit, .plane.p-spill, .plane.p-light"), { y: vh(0.18), scale: 1.04, transformOrigin: "50% 40%", duration: 1 }, 0)
      .to(hero.querySelector(".title"), { y: vh(0.06), duration: 1 }, 0)
      .to(zone, { y: vh(0.28), duration: 1 }, 0)
      .to(zone, { opacity: 0, duration: 0.6, ease: "power1.out" }, 0)
      .to(hero, { "--rl-k": 1.25, duration: 0.4 }, 0)
      .to(hero, { "--rl-k": 0.55, duration: 0.6 }, 0.4);
    heroST = tl.scrollTrigger;

    /* the stage: fades up as it approaches, then pins for three viewports */
    var fig = doc.getElementById("phoneFig"), cps = doc.getElementById("copies");
    enterST = gsap.fromTo([fig, cps], { y: 70, opacity: 0 }, {
      y: 0, opacity: 1, ease: "none",
      scrollTrigger: { trigger: stage, start: "top bottom", end: "top 30%", scrub: true, invalidateOnRefresh: true }
    }).scrollTrigger;
    function pinUpdate(self) { setState(Math.min(2, Math.floor(self.progress * 3 + 1e-6))); }
    pinST = ST.create({
      trigger: stage, start: "top top", end: "+=300%", pin: true, anticipatePin: 1,
      pinType: qs.get("pin") === "transform" ? "transform" : undefined,
      invalidateOnRefresh: true,
      onUpdate: pinUpdate, onRefresh: pinUpdate,
      onEnter: warm
    });
  }
  function killScroll() {
    [heroST, pinST, enterST].forEach(function (t) { if (t) t.kill(true); });
    heroST = pinST = enterST = null;
    gsap.set(hero.querySelectorAll(".plane, .title, .unlock-zone"), { clearProps: "transform,opacity" });
    gsap.set([doc.getElementById("phoneFig"), doc.getElementById("copies")], { clearProps: "transform,opacity" });
    hero.style.removeProperty("--rl-k");
    if (zone) zone.classList.remove("is-gone");
  }
  /* reduced motion: the v3 bar rule (the slide zone has left the top) */
  var barIO = null;
  function barByIO(on) {
    if (on && !barIO && zone && "IntersectionObserver" in global) {
      barIO = new IntersectionObserver(function (es) {
        var e = es[es.length - 1];
        setBar(!e.isIntersecting && e.boundingClientRect.bottom <= 0);
      }, { threshold: 0 });
      barIO.observe(zone);
    } else if (!on && barIO) { barIO.disconnect(); barIO = null; }
  }
  function applyReduce() {
    if (reduce.matches) {
      killScroll(); pauseAll();
      videos.forEach(function (v) { v.removeAttribute("autoplay"); });
      copies.forEach(function (c) { c.classList.add("is-on"); c.removeAttribute("aria-hidden"); gsap.set(c, { clearProps: "all" }); });
      barByIO(true);
    } else {
      barByIO(false);
      copies.forEach(function (c, j) { if (j !== cur) { c.classList.remove("is-on"); c.setAttribute("aria-hidden", "true"); } });
      buildScroll();
      if (ST) ST.refresh();
    }
  }

  /* ---------- wiring -------------------------------------------------------- */
  var rz = 0;
  global.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(mapScreen, 60); }, { passive: true });
  if (img) { if (img.complete) mapScreen(); else img.addEventListener("load", mapScreen, { once: true }); }
  mapScreen();
  global.addEventListener("load", function () {
    mapScreen(); if (ST && !reduce.matches) ST.refresh();
    if (!reduce.matches) { if (global.requestIdleCallback) global.requestIdleCallback(warm, { timeout: 2500 }); else global.setTimeout(warm, 600); }
  });
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(mapScreen);
  applyReduce();
  reduce.addEventListener("change", applyReduce);

  global.booStory = {
    set: setState,
    get state() { return cur; },
    get hero() { return heroST; }, get pin() { return pinST; },
    to: function (what, p) {
      var t = what === "hero" ? heroST : pinST;
      if (!t) return null;
      var y = t.start + (t.end - t.start) * Math.max(0, Math.min(1, +p || 0));
      global.scrollTo(0, y); return y;
    },
    quads: function () {
      var r = phoneEl.getBoundingClientRect();
      return { quad: quad, k: phoneEl.clientWidth / frameW, matrix: mapped.m,
               page: mapped.pts ? mapped.pts.map(function (q) { return [+(q[0] + r.left).toFixed(1), +(q[1] + r.top).toFixed(1)]; }) : null,
               fits: fits };
    },
    videos: videos, layers: layers,
    get morph() { return morphMode; },
    gl: function () { return !!glInit(); },
    bar: setBar
  };
})(window);
