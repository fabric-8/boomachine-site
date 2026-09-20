/* ==========================================================================
   Boo Machine — masthead title + room light behaviour (drop-in for V2)
   - splits the h1 into per-letter spans (kept out of the a11y tree). In v2e-b
     those spans paint NOTHING — the sign is a photograph — but they still lay
     out, and the dead-letter patch is positioned from their boxes.
   - rare-event schedulers for the strong flickers, never on a fixed beat
   - ?flicker=1 demo cadence / ?flicker=hold for screenshots and QA
   Self-contained IIFE; does not touch the disc, the slide control or the rig.
   ========================================================================== */
(function(){
  "use strict";

  var root = document.documentElement;
  var title = document.querySelector(".title");
  var on = title && title.querySelector(".on");
  if(!title || !on) return;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- 1. split into letters, keep the h1 readable ---------------------- */
  var text = (on.textContent || "").trim();
  title.setAttribute("aria-label", text);
  on.setAttribute("aria-hidden", "true");

  var frag = document.createDocumentFragment();
  for(var i = 0; i < text.length; i++){
    var c = text.charAt(i);
    var s = document.createElement("span");
    if(c === " "){ s.className = "sp"; s.textContent = " "; }
    else { s.className = "ch"; s.setAttribute("data-c", c); s.textContent = c; }
    frag.appendChild(s);
  }
  on.textContent = "";
  on.appendChild(frag);
  var letters = [].slice.call(on.querySelectorAll(".ch"));

  /* ---- 1b. the dead-letter patch (v2e-b) -------------------------------
     A single letter of a PHOTOGRAPH cannot be styled, so one soft dark-cherry
     lozenge is moved onto whichever letter is failing and multiplied over the
     image. It is positioned in px off that letter's own (invisible) span, so
     it tracks the font-size clamp and the line box exactly, and it is blurred
     with no straight edge in it, so it never reads as a rectangle. */
  var dead = document.createElement("span");
  dead.className = "dead";
  dead.setAttribute("aria-hidden", "true");
  title.appendChild(dead);

  function placeDead(el){
    var t = title.getBoundingClientRect(), b = el.getBoundingClientRect();
    var padX = b.width * 0.55, padY = b.height * 0.18;
    dead.style.left   = (b.left - t.left - padX) + "px";
    dead.style.top    = (b.top  - t.top  - padY) + "px";
    dead.style.width  = (b.width  + padX * 2) + "px";
    dead.style.height = (b.height + padY * 2) + "px";
  }
  function clearDead(){
    dead.classList.remove("is-on"); dead.classList.remove("is-buzz");
  }

  /* ---- 2. rare-event scheduler ----------------------------------------- */
  var timers = [];
  function rand(a, b){ return a + Math.random() * (b - a); }
  function every(minMs, maxMs, fire){
    function tick(){
      fire();
      timers.push(setTimeout(tick, rand(minMs, maxMs)));
    }
    timers.push(setTimeout(tick, rand(minMs, maxMs)));
  }
  function pulse(el, cls, minMs, maxMs){
    el.classList.add(cls);
    timers.push(setTimeout(function(){ el.classList.remove(cls); }, rand(minMs, maxMs)));
  }

  /* the whole nameplate dips, 80–260 ms, sometimes twice in a row.
     v2d: the same dip is mirrored on <html> as .t-flick, because the sign is
     now a light source for the rest of the scene — fx.css uses it to pull the
     amber spill off the hand and the reflection off the disc for that instant.
     One class, set and cleared together with .is-flick, so they cannot drift. */
  function flickPulse(minMs, maxMs){
    title.classList.add("is-flick"); root.classList.add("t-flick");
    timers.push(setTimeout(function(){
      title.classList.remove("is-flick"); root.classList.remove("t-flick");
    }, rand(minMs, maxMs)));
  }
  function flickerTitle(){
    flickPulse(80, 260);
    if(Math.random() < 0.38){
      timers.push(setTimeout(function(){ flickPulse(60, 170); }, rand(150, 420)));
    }
  }
  /* v2d: every 20–40 s ONE letter buzzes — 300 ms of 30 Hz square jitter
     (fx.css @keyframes chBuzz, 9 x 33.34 ms). A bad contact in one tube, not
     the whole sign browning out, so it reads as hardware. Gated on data-fx. */
  function fxOn(name){
    var hero = document.querySelector(".hero");
    return !hero || (" " + (hero.getAttribute("data-fx")||"") + " ").indexOf(" "+name+" ") >= 0;
  }
  function buzzLetter(){
    if(!letters.length || !fxOn("buzz")) return;
    var el = letters[Math.floor(Math.random() * letters.length)];
    clearDead(); placeDead(el);
    void dead.offsetWidth;                    /* restart the animation */
    dead.classList.add("is-buzz");
    timers.push(setTimeout(clearDead, 340));
  }
  /* rarer: one letter browns out on its own */
  function dimLetter(){
    if(!letters.length) return;
    var el = letters[Math.floor(Math.random() * letters.length)];
    clearDead(); placeDead(el);
    dead.classList.add("is-on");
    timers.push(setTimeout(clearDead, rand(120, 420)));
  }
  /* the red bulb stutters; the amber leans warmer while it does */
  function flareRoom(){
    pulse(root, "rl-flare", 90, 280);
  }

  function start(){
    if(reduce.matches) return;
    every(6000, 14000, flickerTitle);   /* strong title flicker */
    every(15000, 34000, dimLetter);     /* single dead letter, rarer */
    every(9000, 21000, flareRoom);      /* failing red bulb */
    every(20000, 40000, buzzLetter);    /* v2d: one letter buzzes, 300 ms */
  }
  function stop(){
    timers.forEach(clearTimeout); timers = [];
    title.classList.remove("is-flick");
    root.classList.remove("rl-flare"); root.classList.remove("t-flick");
    clearDead();
  }

  /* ---- 3. QA hooks ------------------------------------------------------
     ?flicker=1     fire the strong flicker at once, then keep a visible
                    on/off cadence so screenshots a few hundred ms apart
                    land on both the flicker state and the rest state.
     ?flicker=hold  freeze in the flicker state (side-by-side comparisons).
     Also: window.booTitle.flicker() / .flare() / .dim() / .hold(bool).   */
  var qs = new URLSearchParams(window.location.search);
  var mode = qs.get("flicker");

  function holdOn(v){
    if(v){ title.classList.add("is-flick"); root.classList.add("t-flick"); root.classList.add("rl-flare");
           if(letters[4]){ placeDead(letters[4]); dead.classList.add("is-on"); } }
    else { title.classList.remove("is-flick"); root.classList.remove("t-flick"); root.classList.remove("rl-flare"); clearDead(); }
  }

  window.booTitle = {
    flicker: flickerTitle, dim: dimLetter, flare: flareRoom, buzz: buzzLetter,
    letters: letters,
    hold: holdOn, stop: stop, start: start, dead: dead
  };

  if(mode === "hold"){
    holdOn(true);
  } else if(mode === "1"){
    /* immediate, then 240 ms flickered / 460 ms rest, forever */
    var out = true;
    holdOn(true);
    (function loop(){
      setTimeout(function(){ out = !out; holdOn(out); loop(); }, out ? 240 : 460);
    })();
  } else {
    /* let the power-up finish before the tube starts misbehaving */
    setTimeout(start, 1400);
  }

  reduce.addEventListener("change", function(){
    stop();
    if(!reduce.matches && mode !== "hold" && mode !== "1") start();
  });
})();
