/* ==========================================================================
   Boo Machine — the entrance   (a3-v8)

   First load only. The room is dark; the sign powers on LETTER BY LETTER,
   left to right, each tube with its own short stutter, overlapping into one
   ignition sweep while the red bulb comes up with it; then the hand rises
   into the light; then the slide control arrives COMPLETED — knob parked at
   the far end, the slot full of fire — and the gesture plays backwards: the
   knob glides home, the fire retreats with it, the label is uncovered behind
   it; the note under it comes last. About 2.9 s end to end.

   How the parts are built (all compositor-friendly: opacity + transform):

     the sign    a PHOTOGRAPH, so a letter cannot be styled. The base image
                 is held in its "off" state (a dim dark-cherry sign), and ten
                 per-letter WINDOWS are laid over it — boxes cut to one letter
                 column each, holding the same image, abutting edge to edge.
                 The windows are in % of the image (measured once off
                 assets/title-sign.webp, below), so they fit every viewport
                 without a single measurement. Each window runs a stepped
                 opacity keyframe (the stutter). Together they tile the whole
                 image, so when all are lit the base is switched to its normal
                 state and the windows are removed in the same frame: no jump.
     the room    --rl-i, a factor multiplied into the bulb's halo and wash
                 (title.css), ramps .08 -> 1 with the ignition.
     the hand    the three planes fade in (opacity on .plane) while each
                 .rig rises and grows into place with the INDIVIDUAL
                 `translate` / `scale` properties — the rig's own `transform`
                 is the pointer tilt, and story.js owns the planes' transform,
                 so neither is touched.
     the slider  .unlock-wrap fades and rises 16 px (story.js owns the zone's
                 transform, not the wrap's); slide.js's booSlide.rewind()
                 parks the knob at the end and glides it home (frozen: no
                 drag, click or key can complete it meanwhile).
     the note    fades in last.

   Timeline (ms from the start, at normal speed) — T below is the one source:
   the CSS reads the delays as custom properties set here.

   The gate is the tiny inline script in <head>: it adds html.intro before the
   first paint unless the visitor prefers reduced motion, came back by
   back/forward, landed on an anchor, or asked for ?intro=0 (or passed a
   screenshot QA hook — ?hold ?px ?py ?flicker ?slide — without ?intro=1).
   It also arms a safety timer that drops html.intro after 2.6 s if this file
   never starts, so a failed script can never leave the page dark.

   QA:  ?intro=0     off        ?intro=1     force on (even with QA hooks)
        ?intro=slow  4x slower  window.booIntro.finish() / .state
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document, root = doc.documentElement;
  if (!root.classList.contains("intro")) return;          /* the gate said no */
  /* this file runs: the gate's safety timer is ours now (WAIT_MAX, below) */
  if (global.__introSafe) { global.clearTimeout(global.__introSafe); global.__introSafe = 0; }

  var K = root.classList.contains("intro-slow") ? 4 : 1;   /* ?intro=slow      */
  var T = {
    room:    120,   /* the bulb starts to come up                          */
    letters: 200,   /* the first tube strikes                              */
    stagger: 84,    /* ...and each next one this much later (± a little)    */
    lit:     1330,  /* every window is lit: base -> normal under them       */
    stage:   1080,  /* the hand starts to rise                              */
    track:   1640,  /* the slider fades in, knob parked at the far end      */
    knob:    1800,  /* ...and the knob starts home                          */
    knobDur: 860,
    note:    2380,
    end:     2980   /* everything is in its resting state; hand-back        */
  };
  var WAIT_MAX = 900;  /* how long we wait for the sign image + webfont     */

  var title = doc.querySelector(".title");
  var sign = title && title.querySelector(".signimg");
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");
  var qs = null;
  try { qs = new URLSearchParams(global.location.search); } catch (e) {}
  var qaHold = !!(qs && qs.get("hold") === "1");

  var timers = [], overlay = null, state = "wait", started = false;
  function later(ms, fn) { timers.push(global.setTimeout(fn, ms * K)); }

  /* ---- 1. the letter windows ---------------------------------------------
     Cut points between the letters, in % of the sign image's width, taken
     from the photograph's own alpha x brightness column profile
     (assets/title-sign.webp, 1927 px: the glass of B o o | M a c h i n e
     runs 179-344, 346-489, 501-635, 707-958, 959-1085, 1099-1226,
     1231-1375, 1383-1446, 1461-1581, 1600-1754), each cut in the dark gap
     between two letters; the first and last windows run to the image's
     edges, so together they tile all of it, edge to edge.
     No overlap and no feathered edges, deliberately: the photograph is
     translucent in its glow and backplate, and two copies of it stacked (a
     feathered seam, or a window over the lit base) come out visibly brighter
     than one — measured, a jump at the hand-off. Abutting windows add up to
     exactly the image, and the hard edge sits in a dark gap for the ~80 ms
     before the next letter strikes. */
  var CUTS = [0, 17.90, 25.69, 34.77, 49.71, 56.67, 63.78, 71.51, 75.45, 83.03, 100];
  /* the stutter per letter: a = quick, b = double-strike, c = the bad tube
     (the "c" — the letter the photograph's repair relit — takes longest) */
  var KIND = ["a", "b", "a", "b", "a", "c", "b", "a", "b", "a"];
  var JITTER = [0, 10, -8, 34, -6, 12, -10, 8, -4, 6];   /* ms; the gap is a pause */

  /* v10: SOFT SEAMS (Fab: "the lights are cut off so hard, vertically, per
     letter"). A lit letter's glow reaches well past its gap, and the hard
     window edge sliced that glow into a vertical line until the next letter
     struck. Each window now reaches FEATHER % past both of its cuts and fades
     out across that reach with a linear mask; the neighbour fades in across
     the same span, so the two masks add up to exactly 1 everywhere. The
     windows are added, not stacked: .ig is an isolated group and every window
     is `mix-blend-mode: plus-lighter` inside it (intro.css), so two lit
     neighbours sum to the image itself, pixel for pixel — the hand-off to the
     base stays invisible, which is what the hard edges were there for. */
  var FEATHER = 3.2;   /* % of the image's width, each side of a cut (~60 px at 1927) */

  function buildOverlay() {
    var src = sign.currentSrc || sign.src;
    var box = doc.createElement("span");
    box.className = "ig";
    box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < CUTS.length - 1; i++) {
      var fl = i > 0 ? FEATHER : 0, fr = i < CUTS.length - 2 ? FEATHER : 0;
      var l = CUTS[i] - fl, w = CUTS[i + 1] + fr - l;
      var win = doc.createElement("span");
      win.className = "ig-l ig-" + KIND[i];
      win.style.left = l.toFixed(3) + "%";
      win.style.width = w.toFixed(3) + "%";
      /* 0 -> 1 across [cut - F, cut + F] on each inner side */
      var a = (2 * fl / w * 100).toFixed(3), b = (100 - 2 * fr / w * 100).toFixed(3);
      var m = "linear-gradient(to right, transparent 0%, #000 " + a + "%, #000 " + b + "%, transparent 100%)";
      win.style.webkitMaskImage = m; win.style.maskImage = m;
      win.style.animationDelay = Math.round((T.letters + i * T.stagger + JITTER[i]) * K) + "ms";
      var im = doc.createElement("img");
      im.alt = ""; im.decoding = "sync"; im.src = src;
      /* the whole image, shifted so this window shows its own column */
      im.style.width = (100 / w * 100).toFixed(3) + "%";
      im.style.left = (-l / w * 100).toFixed(3) + "%";
      win.appendChild(im);
      box.appendChild(win);
    }
    /* right after the base image: same z-index, painted above it, under the
       dead-letter patch (z 4) and the scanlines (z 5) */
    sign.parentNode.insertBefore(box, sign.nextSibling);
    return box;
  }

  /* ---- 2. run --------------------------------------------------------- */
  function ms(v) { return Math.round(v * K) + "ms"; }
  function start() {
    if (started) return;
    started = true;
    if (state === "done") return;
    /* loaded somewhere down the page (a restored scroll): nothing to stage */
    if ((global.scrollY || global.pageYOffset || 0) > global.innerHeight * 0.5 || reduce.matches) { finish(); return; }

    try { overlay = buildOverlay(); } catch (e) { overlay = null; }
    /* the 7 s hand cycle waits for the entrance; it restarts from the end */
    if (global.booUnit && !qaHold) global.booUnit.hold(true);

    var st = root.style;
    st.setProperty("--ik", String(K));
    st.setProperty("--i-room", ms(T.room));
    st.setProperty("--i-stage", ms(T.stage));
    st.setProperty("--i-track", ms(T.track));
    st.setProperty("--i-note", ms(T.note));
    state = "run";
    /* two frames before the clock starts: the first paint of the planes
       (held at opacity .002, intro.css — their raster is the expensive part)
       and of the letter windows lands here, in the dark, not in the middle of
       the sequence */
    global.requestAnimationFrame(function () { global.requestAnimationFrame(function () {
      if (state === "done") return;
      root.classList.add("intro-run");
      schedule();
    }); });
  }
  function schedule() {
    /* every window is lit: in ONE task (so one frame) the base goes to its
       normal state and the windows go — the tiles add up to the base, so
       nothing moves */
    later(T.lit, function () {
      root.classList.add("intro-lit"); state = "lit";
      if (overlay) { overlay.remove(); overlay = null; }
    });
    later(T.track, function () {
      if (global.booSlide && global.booSlide.rewind) {
        global.booSlide.rewind({ hold: (T.knob - T.track) * K, dur: T.knobDur * K });
      }
    });
    later(T.end, finish);
  }

  /* ---- 3. hand back ----------------------------------------------------
     Everything the intro set comes off; html.intro-done stays, only so the
     sign's old one-shot `power` flicker and the note's `fadein` (which the
     intro replaced) do not replay when html.intro goes. */
  function finish() {
    if (state === "done") return;
    state = "done";
    timers.forEach(global.clearTimeout); timers = [];
    if (global.__introSafe) { global.clearTimeout(global.__introSafe); global.__introSafe = 0; }
    if (overlay) { overlay.remove(); overlay = null; }
    if (global.booSlide && global.booSlide.rewinding) global.booSlide.rewind(false);
    root.classList.add("intro-done");
    root.classList.remove("intro", "intro-run", "intro-lit", "intro-slow");
    ["--ik", "--i-room", "--i-stage", "--i-track", "--i-note"].forEach(function (p) { root.style.removeProperty(p); });
    if (global.booUnit && !qaHold) global.booUnit.hold(false);
    /* story.js holds its GL warm-up (one long task) until now */
    try { doc.dispatchEvent(new Event("boointro:done")); } catch (e) {}
  }

  /* ---- 4. wait for the sign and its box -----------------------------------
     The photograph is what lights up, and the webfont sizes the h1 the sign is
     fitted to: both must have landed or the letters would strike in the wrong
     place (or on nothing). Never more than WAIT_MAX, though. */
  function ready() {
    var waits = [];
    if (!(sign.complete && sign.naturalWidth)) {
      waits.push(new Promise(function (res) {
        sign.addEventListener("load", res, { once: true });
        sign.addEventListener("error", res, { once: true });
      }));
    } else if (sign.decode) {
      waits.push(sign.decode().catch(function () {}));
    }
    if (doc.fonts && doc.fonts.ready) waits.push(doc.fonts.ready);
    return Promise.all(waits);
  }
  if (!sign || !title || typeof Promise === "undefined") { finish(); return; }
  global.setTimeout(start, WAIT_MAX);
  ready().then(function () { global.requestAnimationFrame(start); }, start);

  /* a page restored from the back/forward cache is not a first load */
  global.addEventListener("pageshow", function (e) { if (e.persisted) finish(); });
  reduce.addEventListener("change", function () { if (reduce.matches) finish(); });

  global.booIntro = {
    finish: finish,
    get state() { return state; },
    timeline: T,
    get slow() { return K; }
  };
})(window);
