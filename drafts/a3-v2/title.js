/* ==========================================================================
   Boo Machine — masthead title + room light behaviour (drop-in for V2)
   - splits the h1 into per-letter spans (kept out of the a11y tree)
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

  /* the whole nameplate dips, 80–260 ms, sometimes twice in a row */
  function flickerTitle(){
    pulse(title, "is-flick", 80, 260);
    if(Math.random() < 0.38){
      timers.push(setTimeout(function(){ pulse(title, "is-flick", 60, 170); }, rand(150, 420)));
    }
  }
  /* rarer: one letter browns out on its own */
  function dimLetter(){
    if(!letters.length) return;
    var el = letters[Math.floor(Math.random() * letters.length)];
    pulse(el, "is-dim", 120, 420);
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
  }
  function stop(){
    timers.forEach(clearTimeout); timers = [];
    title.classList.remove("is-flick");
    root.classList.remove("rl-flare");
    letters.forEach(function(el){ el.classList.remove("is-dim"); });
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
    if(v){ title.classList.add("is-flick"); root.classList.add("rl-flare"); if(letters[4]) letters[4].classList.add("is-dim"); }
    else { title.classList.remove("is-flick"); root.classList.remove("rl-flare"); letters.forEach(function(el){ el.classList.remove("is-dim"); }); }
  }

  window.booTitle = {
    flicker: flickerTitle, dim: dimLetter, flare: flareRoom,
    hold: holdOn, stop: stop, start: start
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
