/* ==========================================================================
   Boo Machine — slide to join   (v2g: the knob trails a flame)

   The pointer / capture / drag logic, the keyboard support and the TestFlight
   URL are v2e-b's, carried through v2f unchanged. What changed is what the
   drag DRIVES.

   v2f opened a furnace behind the knob and painted it with CSS gradients under
   an feTurbulence. This draft draws a FLAME instead: a particle system on one
   canvas, anchored to the knob's left edge, left behind in the knob's wake
   like the flame of a lighter pulled sideways.

     * the flame is anchored to the MEASURED knob position, read off the
       element every frame, so it follows the CSS spring on release and the CSS
       ease on a keyboard step without knowing that either exists;
     * the knob's VELOCITY (measured the same way) drives the spawn rate, the
       streaming, the trail's length and the core line: still = a small idling
       lick at the knob's edge, fast = a long stream;
     * particles are spawned along the segment the knob travelled SINCE THE
       LAST FRAME, not all at the knob's current position, or a fast drag would
       lay the trail down in visible clumps one frame apart;
     * they cool white-hot -> yellow -> orange -> deep red -> smoke and shrink;
       the hot half is drawn with `lighter`, the cool tail with `source-over`;
     * the floor of the track keeps a warm glow where the flame has been and
       cools over ~1.5 s (`heat`, a 64-bucket strip stretched over the track);
     * a few embers come off the tip of the trail and leave the track, which is
       why the canvas is taller than the rail: the flame proper is masked with
       the track's own rounded rect feathered 10 px, the embers are drawn AFTER
       that mask and can go where they like.

   Still published for the CSS, and still registered properties, because the
   spring back on release is a transition and not a script loop:

       --rev   <length>  the knob's right edge = how far it has travelled
       --revp  <number>  the same as 0..1
       --rl-d  on <html>, the room light's multiplier: 1 -> 1.6 (v2f: 1 -> 2.15)

   QA hook:  ?slide=0.4   park the knob at 40 % and freeze it there
             ?slide=hover / done / flare   (see the README)
   window.booSlide.set(p) / .done() / .reset() / .sweep(on[,speed]) / .progress
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
    var rev = v + knob.offsetWidth + 5;
    wrap.style.setProperty("--rev", rev.toFixed(1) + "px");
    wrap.style.setProperty("--revp", p.toFixed(4));
    /* v2g: the room opens more GENTLY than v2f's 1 -> 2.15 */
    root.style.setProperty("--rl-d", (1 + 0.6 * p).toFixed(3));
    wrap.classList.toggle("is-open", p > 0.004);
    ignite();
  }
  function unpublish() {                      /* hand it back to the CSS     */
    wrap.style.removeProperty("--rev");
    wrap.style.removeProperty("--revp");
    root.style.removeProperty("--rl-d");
    progress = 0;
    wrap.classList.remove("is-open");
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
    root.style.setProperty("--rl-d", "2");
    burstUntil = now() + 260;                 /* the flame goes up with it   */
    ignite();
    if (navigate === false) return;
    /* the flare is 300 ms; leave a beat of it on screen, then go */
    global.setTimeout(function () { global.location.href = knob.href; }, 260);
  }

  /* ---------- the drag (v2e-b's, unchanged) ----------------------------- */
  function release() {
    knob.classList.remove("dragging");
    wrap.classList.remove("is-drag");
    if (x > max * 0.72) { finish(true); }
    else { rest(); }                          /* the flame gutters out: ~500 ms */
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
    ignite();
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
    hasFocus = false;
    if (!frozen && !track.classList.contains("done")) rest();
  });
  knob.addEventListener("focus", function () { hasFocus = true; ignite(); });

  /* ======================================================================
     THE FLAME
     ====================================================================== */
  var cv = track.querySelector(".hell-flame");
  var ctx = cv ? cv.getContext("2d") : null;
  var mask = null, mctx = null;

  var hovering = false, hasFocus = false, qaAwake = false, qaDrag = false;
  var amp = 0, burstUntil = 0;
  var raf = 0, last = 0, lastKx = null, vel = 0, spawnAcc = 0, dirSign = 0;

  /* canvas geometry, in CSS px of the canvas's own box */
  var CW = 0, CH = 0, TX = 0, TY = 0, TW = 0, TH = 0, FEATHER = 10;

  var parts = [], sparks = [], hist = [];
  var TAIL = 0.55;                 /* s of knob history the ribbon spans    */
  var MAXP = 150, MAXS = 12;
  var NB = 64, NR = 8, heat = new Float32Array(NB), heat2 = new Float32Array(NB);
  /* the vertical profile of the floor glow, top of the band to the bottom:
     the light pools at the floor of the track and dies before the rail */
  var PROF = [0, 0.07, 0.18, 0.34, 0.56, 0.82, 1, 0.66];

  function now() { return performance.now(); }

  /* the two shapes that stop the ribbon looking like a pennant: a travelling
     wave down its spine, and a slow lobing of its width (one per layer, so the
     layers do not breathe together) */
  function wobAt(x, ts, ag) {
    return (Math.sin(x * 0.045 + ts * 0.007) * 3.4 + Math.sin(x * 0.10 - ts * 0.011) * 1.7) * ag;
  }
  function lobeAt(x, ts, L0) {
    return 0.70 + 0.44 * Math.sin(x * 0.09 + ts * 0.0085 + L0 * 1.7);
  }
  /* the history is one sample per FRAME — 15 px apart at 900 px/s — so a
     polyline through it is visibly faceted (seen: a zigzag pennant). The edges
     are drawn as quadratics through the samples' midpoints instead; `rev`
     walks the array backwards, which is how the two edges meet head to tail. */
  function smooth(pts, rev) {
    var n = pts.length, i, ax, ay, bx, by;
    if (n < 4) return;
    if (rev) {
      ctx.lineTo(pts[n - 2], pts[n - 1]);
      for (i = n - 2; i >= 2; i -= 2) {
        ax = pts[i - 2]; ay = pts[i - 1];
        bx = (pts[i] + ax) / 2; by = (pts[i + 1] + ay) / 2;
        ctx.quadraticCurveTo(pts[i], pts[i + 1], bx, by);
      }
      ctx.lineTo(pts[0], pts[1]);
    } else {
      ctx.moveTo(pts[0], pts[1]);
      for (i = 2; i <= n - 4; i += 2) {
        bx = (pts[i] + pts[i + 2]) / 2; by = (pts[i + 1] + pts[i + 3]) / 2;
        ctx.quadraticCurveTo(pts[i], pts[i + 1], bx, by);
      }
      ctx.lineTo(pts[n - 2], pts[n - 1]);
    }
  }

  /* --- the temperature ramp, as 48 pre-built rgb strings ------------------
     white-hot -> yellow -> orange -> deep red -> smoke-dark. Pre-built because
     a string concat per particle per frame is the one allocation in here that
     would actually show up. */
  var RAMP = (function () {
    /* v2g-b: the white-hot core is the first FIFTH of a wisp's life, not the
       first third — past 20 % it is orange, then deep red, then smoke. */
    var stops = [
      [0.00, 255, 252, 244], [0.08, 255, 238, 176], [0.20, 255, 186, 62],
      [0.38, 255, 112, 14], [0.58, 222, 44, 4], [0.78, 108, 14, 6],
      [1.00, 34, 20, 18]
    ];
    var out = [], n = 48;
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), j = 0;
      while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
      var a = stops[j], b = stops[j + 1];
      var k = (t - a[0]) / (b[0] - a[0] || 1);
      out.push("rgb(" + Math.round(a[1] + (b[1] - a[1]) * k) + "," +
        Math.round(a[2] + (b[2] - a[2]) * k) + "," +
        Math.round(a[3] + (b[3] - a[3]) * k) + ")");
    }
    return out;
  })();
  function col(t) { return RAMP[t < 0 ? 0 : t > 1 ? 47 : (t * 47) | 0]; }
  /* The COLOUR runs on a clock of its own — at most COOL seconds — while the
     alpha runs on the particle's life. A wisp that lives a second would
     otherwise still be white-hot 200 px behind the knob, because 20 % of a
     long life is a long way at 900 px/s (seen: a white middle to the trail). */
  var COOL = 0.34;
  function heatT(p) {
    var span = p.ttl < COOL ? p.ttl : COOL;
    var t = p.life / span;
    return t > 1 ? 1 : t;
  }
  /* A WISP, not a dot and not an ellipse: a tongue of flame lying along its
     own velocity — a rounded head at the leading end, a tapered tail behind
     it, drawn as two quadratics. Stretched 3-6x its own width (p.el), and a
     little more again when it is moving fast. Round particles are what made
     the trail read as yellow bubbles. */
  function wisp(c, p, r) {
    var vx = p.vx, vy = p.vy;
    var v = Math.sqrt(vx * vx + vy * vy) || 1;
    var dx = vx / v, dy = vy / v;
    var L = r * p.el * (1 + Math.min(1.1, v / 320));
    var hx = p.x + dx * L * 0.34, hy = p.y + dy * L * 0.34;   /* head */
    var tx = p.x - dx * L * 0.66, ty = p.y - dy * L * 0.66;   /* tail */
    var nx = -dy * r, ny = dx * r;                            /* half width */
    var ax = p.x + dx * L * 0.10, ay = p.y + dy * L * 0.10;   /* widest point */
    c.beginPath();
    c.moveTo(tx, ty);
    c.quadraticCurveTo(ax + nx * 1.35, ay + ny * 1.35, hx, hy);
    c.quadraticCurveTo(ax - nx * 1.35, ay - ny * 1.35, tx, ty);
    c.fill();
  }

  function roundRect(c, x0, y0, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    if (c.roundRect) { c.beginPath(); c.roundRect(x0, y0, w, h, r); return; }
    c.beginPath();
    c.moveTo(x0 + r, y0); c.lineTo(x0 + w - r, y0);
    c.arcTo(x0 + w, y0, x0 + w, y0 + r, r); c.lineTo(x0 + w, y0 + h - r);
    c.arcTo(x0 + w, y0 + h, x0 + w - r, y0 + h, r); c.lineTo(x0 + r, y0 + h);
    c.arcTo(x0, y0 + h, x0, y0 + h - r, r); c.lineTo(x0, y0 + r);
    c.arcTo(x0, y0, x0 + r, y0, r); c.closePath();
  }

  /* --- the mask: the track's own rounded rect, feathered 10 px above and
         below, so the flame may lick over the rail but can never square off
         against it. Built once per size change, applied with destination-in. */
  function buildMask() {
    if (!mask) { mask = doc.createElement("canvas"); mctx = mask.getContext("2d"); }
    mask.width = Math.round(CW * DPR); mask.height = Math.round(CH * DPR);
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mctx.clearRect(0, 0, CW, CH);
    var F = FEATHER;
    /* the feather is INSET horizontally: the flame may lick over the rail in
       the middle of the track, but at the two caps the mask is the track's own
       shape, or a lick pooling in the left cap bulges out of the corner and
       reads as a masking bug rather than as fire (seen on hover). */
    var IN = 16;
    var g = mctx.createLinearGradient(0, TY - F, 0, TY + TH + F);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(F / (TH + 2 * F), "rgba(255,255,255,1)");
    g.addColorStop((F + TH) / (TH + 2 * F), "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    mctx.fillStyle = g;
    roundRect(mctx, TX + IN, TY - F, TW - 2 * IN, TH + 2 * F, (TH + 2 * F) / 2);
    mctx.fill();
    mctx.fillStyle = "#fff";
    roundRect(mctx, TX, TY, TW, TH, TH / 2);
    mctx.fill();
  }

  function sizeFlame() {
    if (!cv) return;
    var r = cv.getBoundingClientRect(), t = track.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return;
    CW = r.width; CH = r.height;
    TX = t.left - r.left; TY = t.top - r.top; TW = t.width; TH = t.height;
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildMask();
  }

  function hellOn() {
    var hero = doc.querySelector(".hero");
    return !hero || (" " + (hero.getAttribute("data-fx") || "") + " ").indexOf(" hell ") >= 0;
  }
  function awake() {
    return dragging || hovering || hasFocus || qaAwake ||
      progress > 0.004 || now() < burstUntil;
  }
  function target() {
    if (now() < burstUntil) return 1.3;
    if (dragging || qaDrag) return 1;
    if (hovering || hasFocus) return 0.68;   /* hover: the idle lick brightens */
    return awake() ? 0.5 : 0;
  }

  /* --- the knob's left edge, measured, in canvas px ---------------------- */
  function knobX() {
    var k = knob.getBoundingClientRect(), r = cv.getBoundingClientRect();
    return { x: k.left - r.left, y: k.top - r.top + k.height / 2, w: k.width };
  }

  function spawn(px, py, speed, a, age) {
    var p = parts.length < MAXP ? {} : null;
    if (!p) return;
    p.x = px + (Math.random() - 0.5) * 2.5;
    /* a lick is narrow at its root: the spread is a third of the rail, and
       biased to the middle (two uniforms summed), so the flame has a body
       instead of a column of evenly scattered specks */
    p.y = py + (Math.random() + Math.random() - 1) * TH * 0.17;
    /* Standing still it is a lighter: buoyancy wins and the lick points UP.
       Dragged, the knob's speed dominates vx and lays the same flame flat —
       which is the whole trick, and why the trail length needs no special
       case for "fast". */
    p.vx = -(6 + Math.random() * 18) - speed * 0.34;
    p.vy = -(12 + Math.random() * 40);
    p.ttl = 0.34 + Math.random() * 0.40 + Math.min(0.34, speed / 2200);
    p.life = age || 0;
    p.r = 0.7 + Math.random() * 1.75;
    /* how many times its own width it is drawn, along its velocity */
    p.el = 3.0 + Math.random() * 3.0;
    p.ph = Math.random() * 6.283;
    p.w = 4 + Math.random() * 8;
    p.a = 0.55 + Math.random() * 0.45;
    p.a *= (0.45 + 0.55 * a);
    parts.push(p);
  }
  function spark(px, py, speed) {
    if (sparks.length >= MAXS) return;
    sparks.push({
      x: px, y: py,
      vx: (Math.random() - 0.45) * 30 - speed * 0.06,
      vy: -(70 + Math.random() * 130),
      life: 0, ttl: 0.45 + Math.random() * 0.8,
      r: 0.5 + Math.random() * 0.8,
      hot: Math.random() < 0.4
    });
  }

  function frame(ts) {
    raf = global.requestAnimationFrame(frame);
    if (!ctx) return;
    if (!CW) sizeFlame();
    if (!last) last = ts;
    var dt = Math.min(0.064, (ts - last) / 1000); last = ts;
    if (dt <= 0) return;

    var k = knobX();
    var kx = k.x;                                   /* the knob's LEFT edge  */
    if (lastKx === null) lastKx = kx;
    var dx = kx - lastKx;
    var inst = dx / dt;
    vel += (inst - vel) * Math.min(1, dt * 14);     /* smoothed px/s         */
    var speed = Math.abs(vel);

    amp += (target() - amp) * Math.min(1, dt * 6);  /* ~500 ms to gutter out */
    if (amp < 0.02) amp = target() > 0 ? amp : 0;

    /* ---- spawn, spread along the segment the knob just covered ---------- */
    if (amp > 0.02) {
      var rate = 120 + Math.min(1, speed / 1300) * 150;
      /* an ACCUMULATOR, not a round(): at idle the rate is well under one
         particle per frame, and rounding that to zero every frame is a flame
         that never lights (measured: 0 particles at --revp .4). */
      spawnAcc += rate * amp * dt;
      var n = spawnAcc | 0; spawnAcc -= n;
      var dist = Math.abs(dx);
      n = Math.max(n, Math.min(10, Math.round(dist / 9)));   /* no clumps */
      for (var i = 0; i < n; i++) {
        var f = (i + 0.5) / n;
        /* born where the knob was f of the way through this frame, and that
           much older than a particle born now */
        spawn(lastKx + dx * f, k.y, speed, amp, dt * (1 - f));
      }
      if (Math.random() < amp * (0.09 + Math.min(0.30, speed / 5200)) && parts.length) {
        var q = parts[(Math.random() * parts.length) | 0];
        if (q.x < kx - 8) spark(q.x, q.y, speed);
      }
    }
    lastKx = kx;

    /* the wake itself: where the knob has been, for the ribbon in draw().
       If the knob REVERSES, the history is cut back to the turn. The ribbon is
       filled with one gradient along x, and a folded history makes that
       gradient span a few px — canvas clamps past a gradient's endpoints, so
       the whole far half of the trail came out in the white end colour: a
       bright wire at the COLD end, the opposite of the ramp (seen on a sweep,
       which reverses at both rails). The wisps already in the air are left
       alone; they are the part of the old trail that should survive a turn. */
    if (Math.abs(dx) > 1) {
      var sgn = dx > 0 ? 1 : -1;
      if (dirSign && sgn !== dirSign) hist.length = 0;
      dirSign = sgn;
    }
    hist.push({ x: kx, y: k.y, t: ts });
    while (hist.length > 2 && ts - hist[0].t > TAIL * 1000) hist.shift();
    if (hist.length > 90) hist.shift();

    /* ---- integrate ------------------------------------------------------ */
    var i2, p2;
    for (i2 = parts.length - 1; i2 >= 0; i2--) {
      p2 = parts[i2];
      p2.life += dt;
      if (p2.life >= p2.ttl) { parts.splice(i2, 1); continue; }
      p2.x += (p2.vx + Math.sin(p2.life * p2.w + p2.ph) * 9) * dt;
      p2.y += p2.vy * dt;
      p2.vx *= (1 - 1.9 * dt);                      /* the stream slows      */
      p2.vy -= 18 * dt;                             /* and rises as it burns */
    }
    for (i2 = sparks.length - 1; i2 >= 0; i2--) {
      p2 = sparks[i2];
      p2.life += dt;
      if (p2.life >= p2.ttl) { sparks.splice(i2, 1); continue; }
      p2.x += p2.vx * dt; p2.y += p2.vy * dt; p2.vy *= (1 - 0.85 * dt);
    }

    /* ---- the floor keeps the heat, and loses it over ~1.5 s -------------
       It also SPREADS: a 3-tap diffusion every frame, which is both what hot
       metal does and what stops a standing flame burning one 6 px bucket into
       a hard vertical bar (seen at ?slide=0.4 before this was added). */
    var decay = Math.exp(-dt / 0.42);
    for (i2 = 0; i2 < NB; i2++) heat2[i2] = heat[i2];
    for (i2 = 0; i2 < NB; i2++) {
      var lft = heat2[i2 > 0 ? i2 - 1 : 0], rgt = heat2[i2 < NB - 1 ? i2 + 1 : NB - 1];
      heat[i2] = (heat2[i2] * 0.84 + (lft + rgt) * 0.08) * decay;
    }
    for (i2 = 0; i2 < parts.length; i2++) {
      p2 = parts[i2];
      var t2 = heatT(p2);
      if (t2 > 0.55) continue;
      var b = ((p2.x - TX) / TW * NB) | 0;
      if (b >= 0 && b < NB) heat[b] = Math.min(1, heat[b] + dt * 2.0 * (1 - t2) * p2.a);
    }

    draw(k, speed, ts);

    if (!awake() && amp < 0.02 && !parts.length && !sparks.length) stop();
  }

  var heatCv = null, heatCtx = null, heatImg = null;
  function draw(k, speed, ts) {
    ctx.clearRect(0, 0, CW, CH);

    /* --- 1. the warm floor the flame has left behind --------------------- */
    /* one NB x NR bitmap — the heat along the track times the vertical
       profile — stretched over the lower half of the rail. Bilinear in both
       directions, so it is a pool of warm light with no edge anywhere. */
    if (!heatCv) {
      heatCv = doc.createElement("canvas"); heatCv.width = NB; heatCv.height = NR;
      heatCtx = heatCv.getContext("2d"); heatImg = heatCtx.createImageData(NB, NR);
    }
    var any = 0, d = heatImg.data, i, r0;
    for (i = 0; i < NB; i++) if (heat[i] > 0.004) { any = 1; break; }
    if (any) {
      for (r0 = 0; r0 < NR; r0++) {
        for (i = 0; i < NB; i++) {
          var h = heat[i] * PROF[r0], o = (r0 * NB + i) * 4;
          d[o] = 255; d[o + 1] = 96 + (1 - Math.min(1, heat[i])) * 26; d[o + 2] = 22;
          d[o + 3] = Math.min(255, h * 210) | 0;
        }
      }
      heatCtx.putImageData(heatImg, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 0.55;
      ctx.drawImage(heatCv, TX, TY + TH * 0.18, TW, TH * 0.82);
      ctx.globalAlpha = 1;
    }

    /* --- 1b. the ribbon: the flame left in the knob's wake -----------------
       The particles are the licks and the sparks; the BODY of the trail is a
       polygon through the knob's own history (where it has been over the last
       0.55 s), risen and wobbled with age. One path, one fill — it is what
       makes the trail read as fire instead of as confetti, which is exactly
       what 243 particles on their own looked like.

       It is filled FOUR times, wide-and-dim to thin-and-white: additive layers
       are how you get a soft cross-section out of hard-edged polygons without
       a blur filter (a single fill leaves a visible pencil line — seen). The
       gradient runs along the trail, so the colour ramp IS the cooling: white
       at the knob, deep red at the tail, transparent past it. */
    var H = hist.length;
    if (H > 3 && amp > 0.02) {
      var newest = hist[H - 1], oldest = hist[0];
      if (Math.abs(newest.x - oldest.x) > 18) {
        var hw = TH * 0.26 * (0.55 + 0.45 * amp);
        /* widthK, alpha, tail, mid, hot, offset (in hw), offset phase
           rows 0-3 are the body, wide-and-dim to thin-and-white;
           rows 4-6 are FILAMENTS — thin brighter veins running inside it, each
           swimming on its own sine, which is what a flame has and a smooth
           gradient does not. */
        var LAY = [[1.00, 0.26, "150,18,0", "226,54,0", "255,110,16", 0.00, 0.0],
                   [0.66, 0.28, "180,24,0", "244,74,2", "255,150,44", 0.00, 0.0],
                   [0.38, 0.32, "210,34,0", "255,110,14", "255,196,104", 0.00, 0.0],
                   [0.16, 0.36, "236,58,2", "255,168,54", "255,250,236", 0.00, 0.0],
                   [0.13, 0.30, "196,30,0", "255,120,20", "255,226,158", 0.40, 0.0],
                   [0.10, 0.26, "186,26,0", "255,104,12", "255,214,132", -0.34, 2.3],
                   [0.07, 0.22, "210,40,0", "255,150,36", "255,244,214", 0.14, 4.1]];
        ctx.globalCompositeOperation = "lighter";
        var up = [], dn = [], j, sm, ag, ry, ww, of;
        for (var L0 = 0; L0 < LAY.length; L0++) {
          up.length = 0; dn.length = 0;
          for (j = H - 1; j >= 0; j--) {
            sm = hist[j]; ag = Math.min(1, (ts - sm.t) / (TAIL * 1000));
            ry = sm.y - ag * ag * 15 + wobAt(sm.x, ts, ag);
            of = LAY[L0][5] === 0 ? 0
               : hw * LAY[L0][5] * Math.sin(sm.x * 0.07 + ts * 0.006 + LAY[L0][6]) * (1 - 0.4 * ag);
            /* 0.62, not 0.8: a harder taper collapses all seven layers onto
               the same hairline at the tail, and seven additive fills on one
               line saturate to WHITE — a bright wire at the cold end of the
               trail, which is the opposite of the colour ramp (seen). */
            ww = hw * LAY[L0][0] * Math.pow(1 - ag, 0.62) * lobeAt(sm.x, ts, L0);
            up.push(sm.x, ry + of - ww); dn.push(sm.x, ry + of + ww);
          }
          ctx.beginPath();
          smooth(up, false);                 /* new -> old along the top   */
          smooth(dn, true);                  /* old -> new along the floor */
          ctx.closePath();
          var gr = ctx.createLinearGradient(oldest.x, 0, newest.x, 0);
          /* the ramp IS the cooling: the hot colour only exists in the last
             sixth of the trail, next to the knob. */
          gr.addColorStop(0.00, "rgba(" + LAY[L0][2] + ",0)");
          gr.addColorStop(0.36, "rgba(" + LAY[L0][2] + ",.14)");
          gr.addColorStop(0.66, "rgba(" + LAY[L0][3] + ",.42)");
          gr.addColorStop(0.90, "rgba(" + LAY[L0][4] + ",.74)");
          gr.addColorStop(1.00, "rgba(" + LAY[L0][4] + ",.92)");
          ctx.fillStyle = gr;
          ctx.globalAlpha = Math.min(1, amp) * LAY[L0][1];
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    /* --- 2. the cool tail, normal blending ------------------------------- */
    ctx.globalCompositeOperation = "source-over";
    var p, t, r;
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; t = p.life / p.ttl;
      if (heatT(p) < 0.45) continue;
      r = p.r * (1 - 0.34 * t);
      /* translucent smoke at the end, not a dark dot */
      ctx.globalAlpha = p.a * Math.pow(1 - t, 1.3) * 0.72;
      ctx.fillStyle = col(heatT(p));
      wisp(ctx, p, r);
    }

    /* --- 3. the hot core, additive --------------------------------------- */
    ctx.globalCompositeOperation = "lighter";
    for (i = 0; i < parts.length; i++) {
      p = parts[i]; t = p.life / p.ttl;
      if (heatT(p) >= 0.45) continue;
      r = p.r * (1 - 0.34 * t);
      ctx.globalAlpha = p.a * Math.min(1, (1 - t) * 1.6);
      ctx.fillStyle = col(heatT(p));
      wisp(ctx, p, r);
    }

    /* --- 4. the tongue: the body of the flame at the knob's edge ----------
       Wisps alone are licks coming off something; the something is this. Two
       quadratics from the knob's edge to a tip, bulging past halfway so the
       silhouette is a TEARDROP rather than a pennant, with a white-hot core
       inside it and — while the knob is slow — a cold blue-white hint right at
       the root, which is what the base of a lighter flame looks like.
       Standing still the tip lifts and the tongue is short; with speed the tip
       drops level and runs back, the same flame laid flat by its slipstream. */
    if (amp > 0.02) {
      var sp = Math.min(1, speed / 1250);
      var L = (18 + 96 * sp) * (0.55 + 0.45 * amp);
      var hh = TH * 0.18 * (0.6 + 0.4 * amp) * (1 + 0.35 * sp);
      var lift = (1 - sp) * TH * 0.26;
      var wob = Math.sin(ts / 92) * 1.9 + Math.sin(ts / 41) * 0.9;
      var tipX = k.x - L, tipY = k.y - lift + wob;
      var g2 = ctx.createLinearGradient(tipX, 0, k.x, 0);
      g2.addColorStop(0, "rgba(255,52,0,0)");
      g2.addColorStop(0.30, "rgba(255,88,6,.44)");
      g2.addColorStop(0.68, "rgba(255,160,42,.70)");
      g2.addColorStop(0.92, "rgba(255,214,140,.82)");
      g2.addColorStop(1, "rgba(255,246,224,.88)");
      ctx.globalAlpha = Math.min(1, amp) * 0.9;
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(k.x, k.y - hh * 0.72);
      /* the bulge sits at 0.55 of the way to the tip: a teardrop, not a wedge */
      ctx.quadraticCurveTo(k.x - L * 0.55, k.y - hh * 1.32 - lift * 0.62 + wob, tipX, tipY);
      ctx.quadraticCurveTo(k.x - L * 0.55, k.y + hh * 1.12 - lift * 0.42 + wob, k.x, k.y + hh * 0.72);
      ctx.closePath(); ctx.fill();

      /* the white-hot core inside it: short, thin, crisp */
      var L2 = L * 0.44, h2 = hh * 0.44;
      var g3 = ctx.createLinearGradient(k.x - L2, 0, k.x, 0);
      g3.addColorStop(0, "rgba(255,190,90,0)");
      g3.addColorStop(0.62, "rgba(255,232,170,.52)");
      g3.addColorStop(1, "rgba(255,252,240,.92)");
      ctx.globalAlpha = Math.min(1, amp);
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.moveTo(k.x, k.y - h2);
      ctx.quadraticCurveTo(k.x - L2 * 0.5, k.y - h2 - lift * 0.4 + wob * 0.6, k.x - L2, k.y - lift * 0.5 + wob * 0.6);
      ctx.quadraticCurveTo(k.x - L2 * 0.5, k.y + h2 - lift * 0.3 + wob * 0.6, k.x, k.y + h2);
      ctx.closePath(); ctx.fill();

      /* the cold root. Only while the knob is slow — a flame being dragged
         does not keep its base — and only a hint: a lighter's blue is a few
         px tall and it never leaves the metal. */
      var blue = (1 - sp) * Math.min(1, amp);
      if (blue > 0.05) {
        var bw = Math.max(7, L * 0.22), bh = hh * 0.82;
        var g4 = ctx.createLinearGradient(k.x - bw, 0, k.x, 0);
        g4.addColorStop(0, "rgba(120,180,255,0)");
        g4.addColorStop(0.55, "rgba(150,200,255,.30)");
        g4.addColorStop(1, "rgba(206,232,255,.62)");
        ctx.globalAlpha = blue * 0.72;
        ctx.fillStyle = g4;
        ctx.beginPath();
        ctx.moveTo(k.x, k.y - bh * 0.5);
        ctx.quadraticCurveTo(k.x - bw * 0.6, k.y - bh * 0.62 + wob * 0.3, k.x - bw, k.y + wob * 0.3);
        ctx.quadraticCurveTo(k.x - bw * 0.6, k.y + bh * 0.62 + wob * 0.3, k.x, k.y + bh * 0.5);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* --- 5. clip the FLAME to the track, feathered ------------------------ */
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, CW, CH);
    ctx.globalCompositeOperation = "lighter";

    /* --- 6. the embers, AFTER the mask: they leave the track -------------- */
    for (i = 0; i < sparks.length; i++) {
      p = sparks[i]; t = p.life / p.ttl;
      var a = Math.min(1, (1 - t) * 1.4) * (0.6 + 0.4 * Math.sin(p.life * 36));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.hot ? "rgb(255,216,150)" : "rgb(255,104,12)";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
      ctx.globalAlpha *= 0.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.4, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function ignite() {
    if (!ctx || reduce.matches || !hellOn()) return;
    if (!CW) sizeFlame();
    if (!raf) { last = 0; lastKx = null; raf = global.requestAnimationFrame(frame); }
  }
  function stop() {
    if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    parts.length = 0; sparks.length = 0; hist.length = 0; dirSign = 0;
    for (var i = 0; i < NB; i++) heat[i] = 0;
    amp = 0; vel = 0; lastKx = null; spawnAcc = 0;
    if (ctx && CW) ctx.clearRect(0, 0, CW, CH);
  }

  wrap.addEventListener("pointerenter", function () { hovering = true; ignite(); });
  wrap.addEventListener("pointerleave", function () { hovering = false; });
  global.addEventListener("resize", function () { sizeFlame(); }, { passive: true });
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) stop(); else if (awake()) ignite();
  });
  reduce.addEventListener("change", function () { if (reduce.matches) stop(); });

  /* ---------- QA hooks --------------------------------------------------- */
  function forceTo(p) {
    frozen = true; qaAwake = true;
    measure();
    wrap.classList.add("is-drag");          /* no easing, park it exactly    */
    if (p >= 1) { wrap.classList.add("is-done"); finish(false); return; }
    x = max * Math.max(0, Math.min(1, p));
    place(x);
    ignite();
  }
  /* a knob that really moves, for a frame sequence over a fast drag: the
     velocity, the spawn positions and the trail are computed exactly as they
     are for a pointer, the input is just a clock instead of a finger. */
  var sweepRaf = 0;
  function sweep(on, speed) {
    if (sweepRaf) { global.cancelAnimationFrame(sweepRaf); sweepRaf = 0; }
    if (on === false) {
      frozen = false; qaAwake = false; qaDrag = false;
      knob.classList.remove("dragging"); wrap.classList.remove("is-drag"); rest(); return;
    }
    frozen = true; qaAwake = true; qaDrag = true; measure();
    /* .dragging is what takes the .42 s transform transition OFF the knob —
       without it the knob EASES toward each position and the measured velocity
       is a fifth of the sweep's (measured: -101 px/s for a 900 px/s sweep). */
    knob.classList.add("dragging");
    wrap.classList.add("is-drag");
    var v = (speed || 1000), dir = 1, pos = 0, t0 = 0;
    (function step(ts) {
      sweepRaf = global.requestAnimationFrame(step);
      if (!t0) { t0 = ts; return; }
      var dt = Math.min(0.05, (ts - t0) / 1000); t0 = ts;
      pos += dir * v * dt;
      if (pos > max) { pos = max; dir = -1; }
      if (pos < 0) { pos = 0; dir = 1; }
      x = pos; place(pos);
    })(0);
  }
  global.booSlide = {
    set: forceTo,
    done: function () { forceTo(1); },
    sweep: sweep,
    reset: function () {
      frozen = false; qaAwake = false; qaDrag = false;
      if (sweepRaf) { global.cancelAnimationFrame(sweepRaf); sweepRaf = 0; }
      knob.classList.remove("dragging");
      wrap.classList.remove("is-drag", "is-done");
      track.classList.remove("done", "is-flare", "is-flare-hold"); rest();
    },
    get progress() { return progress; },
    get max() { return max; },
    get flame() { return { parts: parts.length, sparks: sparks.length, amp: +amp.toFixed(3), vel: Math.round(vel) }; }
  };

  function boot() {
    sizeFlame();
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.has("slide")) {
        var v = q.get("slide");
        if (v === "flare") { forceTo(1); track.classList.add("is-flare-hold"); }
        else if (v === "done" || v === "1") forceTo(1);
        else if (v === "hover") { wrap.classList.add("is-hover-demo"); qaAwake = true; hovering = true; ignite(); }
        else { var n = parseFloat(v); if (n === n) forceTo(n); }
      }
    } catch (e) {}
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  global.addEventListener("load", function () { sizeFlame(); });
})(window);
