/* ==========================================================================
   Boo Machine — the launch list   (v13: prelaunch mode)

   The page is a "coming soon" page until launch day (index.html, BOO_MODE).
   In that mode the hero's slide control is the REVERSED email slider (Fab:
   "inverse the slider: the knob is all the way on the right, like a little
   send icon. You input the email, and when you enter it and click the icon,
   it slides from the right to the left with the burn — like the email went
   to hell"). The markup is a plain <form> in the track (index.html: the
   field, the result line, the honeypot, the knob as its submit button); the
   light is slide.js's own, mirrored (slide.js / slide.css "reversed"). This
   file is the flow:

     submit      Enter in the field, the phone keyboard's Send, or the knob.
     invalid     HTML5 validity + a plain regex. No fire: the track shudders
                 once, the line "The machine rejects this address." is
                 written into the slot, the caret stays in the field. Typing
                 (or 3.5 s) brings the address back.
     the send    the typed address is copied into the ghost (one span per
                 letter) and the knob glides right -> left over ~1 s,
                 dragging the fire across the slot (slide.js burn()); each
                 letter the knob is reaching ignites and floats up and away;
                 past the threshold the control arms (the clocks at 2x, the
                 room light up to 1.9). The POST runs at the same time; the
                 fire HOLDS, armed, at the far end until the answer is in.
     the answer  ok (pending | already): a beat more of the held fire, then
                 it is drawn back into the knob and dies (settle()); the
                 knob stays at the far end, its glyph turns to a check, and
                 the slot reads "Sent to hell. Check your inbox." / "You're
                 already on the list." — the form is done.
                 error: the knob glides home, the fire retreating with it
                 (back()), the letters come back as it passes them, and the
                 slot reads the error; the address is kept, the caret back
                 in the field: rate -> "Too many souls at once. Try again in
                 a minute."; invalid -> the reject line; server / network /
                 timeout -> "The machine choked. Try again."
     reduced     no glide, no fire, no burning letters: the answer is
     motion      written straight into the slot.

   The backend (subscribe.php, built separately) — the contract:
     POST subscribe.php  Content-Type: application/json
       {email, consent:true, hp:<the honeypot's value>, src:"hero"|"bar"|"support"}
     -> 200 {ok:true, status:"pending"|"already"}
     -> 400 {ok:false, error:"invalid"} · 429 {..."rate"} · 500 {..."server"}
   src is "bar" when the visitor came to the field from the floating bar's
   "Get notified", otherwise "hero".

   The floating bar (story.css .bar) keeps ONE button in this mode, "Get
   notified": the page glides back up (Lenis where it runs, the native
   smooth scroll otherwise) and the caret lands in the hero's field — the
   focus is taken inside the tap itself, so a phone raises its keyboard.
   Why not a second, inline form in the bar: the island is 52 px tall and,
   on a phone, 366 px wide, of which the brand takes ~150 — the field would
   be ~140 px, less than half an ordinary address; and the send IS the hero
   control (the knob, the fire, the room light), which a form in the bar
   could only imitate. One form, one flow, one thing to test.

   Analytics (analytics.js window.booTrack): notify_submit {s: src}, sent
   once per successful answer (pending or already).

   QA: ?notify=mock           no request: "pending" after 600 ms
       ?notify=mock-already   "already"         ?notify=mock-error  server error
       ?notify=mock-rate      the rate limit    ?notify=mock-invalid  the server's "invalid"
       ?notify=mock-slow      "pending" after 2.5 s (the held fire)
       window.booNotify.submit(email) / .reset() / .state
       ?slowmo=0.2 / booSlide.timescale(k) slow the glides (a mid-burn frame)
   ========================================================================== */
(function (global) {
  "use strict";

  var doc = document;
  if (global.BOO_MODE !== "prelaunch") return;

  var form = doc.getElementById("notify");
  var input = doc.getElementById("notifyEmail");
  var knob = doc.getElementById("knobSend");
  var msg = doc.getElementById("notifyMsg");
  var cta = doc.getElementById("barCta");
  if (!form || !input || !knob || !msg) return;

  var track = form.closest(".unlock");
  var wrap = form.closest(".unlock-wrap");
  var ghost = form.querySelector(".notify-ghost");
  var hp = form.querySelector('input[name="website"]');
  var reduce = global.matchMedia("(prefers-reduced-motion: reduce)");

  var ENDPOINT = "subscribe.php";
  var TIMEOUT_MS = 12000;
  var BURN_MS = 1050;         /* the knob's glide across the slot           */
  var LEAD = 56;              /* how far ahead of the knob a letter ignites (px):
                                 ~150 ms at speed, so the flash is seen before
                                 the knob covers it */
  var BACK_MS = 620;          /* ...and home again after a refusal           */
  var HOLD_MS = 320;          /* the held fire after the answer, before it dies */
  var MSG_MS = 3500;          /* a refusal's line, before the address comes back */
  /* local@domain.tld — deliberately loose: the server has the last word */
  var RE = /^[^\s@"<>,;:]+@[^\s@"<>,;:]+\.[^\s@"<>,;:.]{2,}$/;

  var TEXT = {
    pending: "Sent to hell. Check your inbox.",
    already: "You’re already on the list.",
    empty:   "The machine needs an address.",
    invalid: "The machine rejects this address.",
    rate:    "Too many souls at once. Try again in a minute.",
    server:  "The machine choked. Try again."
  };

  var qs = null;
  try { qs = new URLSearchParams(global.location.search); } catch (e) {}
  var MOCK = qs && qs.get("notify");
  if (MOCK && MOCK.indexOf("mock") !== 0) MOCK = null;
  /* ?slowmo=0.2: the glides (and the light) at 1/5 speed, for a mid-burn frame */
  var SLOW = qs ? parseFloat(qs.get("slowmo")) : NaN;
  if (SLOW > 0 && global.booSlide) global.booSlide.timescale(SLOW);

  var state = "idle";         /* idle | sending | sent                       */
  var src = "hero";
  var msgTimer = 0;

  function slide() { return global.booSlide && global.booSlide.reversed ? global.booSlide : null; }
  function track_(ev, s) { try { if (global.booTrack) global.booTrack(ev, s); } catch (e) {} }

  /* ---------- the line in the slot ---------------------------------------- */
  function say(text, kind) {
    global.clearTimeout(msgTimer); msgTimer = 0;
    msg.textContent = text;
    form.classList.add("has-msg");
    form.classList.toggle("is-err", kind === "err");
    if (kind === "err") {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", "notifyMsg notifyNote");
      /* the address comes back after a while, or at the first keystroke */
      msgTimer = global.setTimeout(unsay, MSG_MS);
    }
  }
  function unsay() {
    global.clearTimeout(msgTimer); msgTimer = 0;
    if (state === "sent") return;
    form.classList.remove("has-msg", "is-err");
    input.removeAttribute("aria-invalid");
    input.setAttribute("aria-describedby", "notifyNote");
    /* the text stays in the live region's node until the next message, but
       an empty node is not re-read: clear it once it is faded out */
    global.setTimeout(function () { if (!form.classList.contains("has-msg")) msg.textContent = ""; }, 400);
  }
  function shudder() {
    if (reduce.matches || !track) return;
    track.classList.remove("is-reject");
    void track.offsetWidth;                      /* restart the one-shot animation */
    track.classList.add("is-reject");
  }
  if (track) track.addEventListener("animationend", function (e) {
    if (e.animationName === "rejectShake") track.classList.remove("is-reject");
  });

  /* ---------- the letters -------------------------------------------------- */
  var letters = [];           /* {el, cx}: the ghost's spans and their centres (track px) */
  function buildGhost(text) {
    ghost.textContent = "";
    ghost.classList.remove("is-tail");
    letters = [];
    for (var i = 0; i < text.length; i++) {
      var s = doc.createElement("span");
      s.className = "gl";
      s.textContent = text.charAt(i);
      ghost.appendChild(s);
    }
    form.classList.add("is-burning");
    /* a long address shows its tail, as the field did */
    if (ghost.scrollWidth > ghost.clientWidth + 1) ghost.classList.add("is-tail");
    var spans = ghost.children;
    for (var j = 0; j < spans.length; j++) {
      letters.push({ el: spans[j], cx: spans[j].offsetLeft + spans[j].offsetWidth / 2, lit: false });
    }
  }
  /* the knob's leading (left) edge in the track's padding box, from the
     travel alone (no layout read per frame): it rests 5 px off the right cap */
  var TW = 0, KW = 0;
  function measure() { TW = track.clientWidth; KW = knob.offsetWidth; }
  function burnTo(x) {
    var edge = TW - 5 - KW - x;
    for (var i = 0; i < letters.length; i++) {
      var L = letters[i], on = L.cx > edge - LEAD;  /* the heat runs ahead of the knob */
      if (on !== L.lit) { L.lit = on; L.el.classList.toggle("is-lit", on); L.el.classList.toggle("is-back", !on); }
    }
  }
  function clearGhost() {
    form.classList.remove("is-burning");
    ghost.textContent = ""; letters = [];
  }

  /* ---------- the request -------------------------------------------------- */
  function normal(status, j) {
    if (j && j.ok === true) return { ok: true, status: j.status === "already" ? "already" : "pending" };
    var e = j && j.error;
    if (e !== "invalid" && e !== "rate" && e !== "server") e = status === 429 ? "rate" : status === 400 ? "invalid" : "server";
    return { ok: false, error: e };
  }
  function request(email, from) {
    var body = { email: email, consent: true, hp: hp ? hp.value : "", src: from };
    if (MOCK) {
      var r = MOCK === "mock-already" ? { ok: true, status: "already" }
        : MOCK === "mock-error" ? { ok: false, error: "server" }
        : MOCK === "mock-rate" ? { ok: false, error: "rate" }
        : MOCK === "mock-invalid" ? { ok: false, error: "invalid" }
        : { ok: true, status: "pending" };
      return new Promise(function (res) { global.setTimeout(function () { res(r); }, MOCK === "mock-slow" ? 2500 : 600); });
    }
    var ctl = global.AbortController ? new AbortController() : null;
    var to = ctl ? global.setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : 0;
    return global.fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (j) { return normal(res.status, j); });
    }).catch(function () {
      return { ok: false, error: "server" };
    }).then(function (r) { global.clearTimeout(to); return r; });
  }

  /* ---------- the flow ----------------------------------------------------- */
  function busy(on) {
    if (on) form.setAttribute("aria-busy", "true"); else form.removeAttribute("aria-busy");
    input.readOnly = !!on;
    knob.setAttribute("aria-disabled", on ? "true" : "false");
  }
  function reject(kind) {
    say(kind === "empty" ? TEXT.empty : TEXT.invalid, "err");
    shudder();
    input.focus({ preventScroll: true });
  }
  function send(email) {
    state = "sending"; busy(true);
    unsay();
    var S = slide(), burned = false, answer = null, from = src;
    var animate = !!S && !reduce.matches;
    function both() { if (burned && answer) done(answer, animate, from); }
    if (animate) {
      measure();
      buildGhost(email);
      S.burn({ dur: BURN_MS, onStep: burnTo, done: function () { burned = true; both(); } });
    } else burned = true;
    request(email, from).then(function (r) { answer = r; both(); });
  }
  function done(r, animate, from) {
    var S = slide();
    if (r.ok) {
      state = "sent";
      track_("notify_submit", from);
      var land = function () {
        clearGhost();
        input.value = "";
        busy(false);
        form.classList.add("is-sent");
        if (animate) form.classList.add("is-far");   /* the knob stays at the far end */
        if (wrap) wrap.classList.add("is-sent");
        say(r.status === "already" ? TEXT.already : TEXT.pending, "ok");
        /* the form is finished: nothing left to fill in or press */
        input.disabled = true; knob.disabled = true;
        knob.setAttribute("aria-label", "Sent");
      };
      if (animate) {
        global.setTimeout(function () { S.settle(); global.setTimeout(land, 180); }, HOLD_MS);
      } else land();
      return;
    }
    var text = r.error === "rate" ? TEXT.rate : r.error === "invalid" ? TEXT.invalid : TEXT.server;
    var home = function () {
      clearGhost();
      busy(false);
      state = "idle";
      say(text, "err");
      if (r.error === "invalid") shudder();
      input.focus({ preventScroll: true });
    };
    if (animate) {
      global.setTimeout(function () {
        S.back({ dur: BACK_MS, onStep: burnTo, done: home });
      }, 120);
    } else home();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state !== "idle") return;
    var email = (input.value || "").trim();
    input.value = email;
    if (!email) { reject("empty"); return; }
    if (!input.checkValidity() || !RE.test(email)) { reject("invalid"); return; }
    send(email);
    src = "hero";             /* the next one starts from the hero again */
  });
  /* the knob is aria-disabled (not disabled) while a send runs, so the focus
     it has stays on it; a press then does nothing */
  knob.addEventListener("click", function (e) {
    if (state !== "idle") e.preventDefault();
  });
  input.addEventListener("input", function () {
    if (form.classList.contains("is-err")) unsay();
  });
  /* the light breathes at the cap while the field has the caret (the knob's
     own focus does the same in slide.js) */
  input.addEventListener("focus", function () { var S = slide(); if (S && state === "idle") S.wake(true); });
  input.addEventListener("blur", function () { var S = slide(); if (S) S.wake(false); });

  /* ---------- the floating bar: "Get notified" ------------------------------ */
  if (cta) cta.addEventListener("click", function (e) {
    e.preventDefault();
    src = "bar";
    /* inside the tap: a phone raises its keyboard only for a focus taken in
       a user gesture. preventScroll, because the glide below does the moving */
    if (state === "idle") { try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); } }
    var L = global.booSmooth && global.booSmooth.lenis;
    if (L && !reduce.matches) L.scrollTo(0, { duration: 1.1 });
    else global.scrollTo({ top: 0, behavior: reduce.matches ? "auto" : "smooth" });
  });

  global.booNotify = {
    get state() { return state; },
    get src() { return src; },
    submit: function (email) { input.value = email || ""; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); },
    reset: function () {
      state = "idle"; busy(false); clearGhost();
      input.disabled = false; knob.disabled = false; knob.setAttribute("aria-label", "Send: tell me when Boo Machine launches");
      form.classList.remove("is-sent", "is-far"); if (wrap) wrap.classList.remove("is-sent");
      unsay();
      var S = slide(); if (S) S.reset();
    }
  };
})(window);
