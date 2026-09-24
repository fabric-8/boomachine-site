/* Boo Machine: first-party, cookieless page statistics (a.php, stats.php, legal.html#privacy).
   No cookies, no storage, nothing sent under Do Not Track / Global Privacy Control
   or off boomachine.app. Events: pageview engaged scroll_25..100 story_chapter_1..3
   disc_change intro_complete beta_click press_kit_download mailto_click. */
(function (w, d) {
  "use strict";
  var n = navigator, L = location;
  if (n.doNotTrack === "1" || w.doNotTrack === "1" || n.globalPrivacyControl) return;
  if (!/^((www\.)?boomachine\.app|localhost|127\.0\.0\.1)$/.test(L.hostname)) return;
  var q = new URLSearchParams(L.search), once = {}, left = 80, discs = 30, ref = "";
  var id = Math.random().toString(36).slice(2, 12), root = d.documentElement;
  try { var r = new URL(d.referrer); if (r.hostname !== L.hostname) ref = r.hostname; } catch (e) {}

  function send(ev, one, src) {
    if (one) { if (once[ev]) return; once[ev] = 1; }
    if (left-- < 1) return;
    var x = w.innerWidth, o = {
      e: ev, p: L.pathname.replace(/index\.html$/, ""), id: id,
      v: x < 768 ? "phone" : x < 1024 ? "tablet" : "desktop",
      l: (n.language || "").slice(0, 2).toLowerCase()
    };
    if (ref) o.r = ref;
    if (src) o.s = src;
    ["source", "medium", "campaign"].forEach(function (k) {
      var v = q.get("utm_" + k); if (v) o["u" + k[0]] = v.slice(0, 64);
    });
    var b = JSON.stringify(o);
    try { if (n.sendBeacon && n.sendBeacon("/a.php", b)) return; } catch (e) {}
    try { fetch("/a.php", { method: "POST", body: b, keepalive: true, credentials: "omit" }); } catch (e) {}
  }
  function on(t, ev, f, opt) { t.addEventListener(ev, f, opt || { passive: true, capture: true }); }
  send("pageview", 1);

  /* engaged: 10 s with the tab visible (added up across hide / show) */
  var seen = 0, since = 0, et = 0;
  function vis() {
    if (once.engaged) return;
    if (d.visibilityState === "visible") { since = Date.now(); et = setTimeout(function () { send("engaged", 1); }, 1e4 - seen); }
    else if (since) { seen += Date.now() - since; since = 0; clearTimeout(et); }
  }
  on(d, "visibilitychange", vis); vis();

  /* scroll depth: page height cached by a ResizeObserver, so the scroll
     handler reads no layout; once per mark */
  var H = 0, marks = [25, 50, 75, 100], tick = 0;
  function mh() { H = root.scrollHeight; }
  if (w.ResizeObserver) new ResizeObserver(mh).observe(d.body);
  function sc() {
    if (tick) return; tick = 1;
    requestAnimationFrame(function () {
      tick = 0; if (!H) mh();
      var pc = (w.scrollY + w.innerHeight) / H * 100;
      while (marks.length && pc >= marks[0] - (marks[0] > 99 ? 1 : 0)) send("scroll_" + marks.shift(), 1);
      if (!marks.length) w.removeEventListener("scroll", sc, true);
    });
  }
  on(w, "scroll", sc);

  /* story chapters: the chapter's top past 60 % of the viewport */
  var ch = d.querySelectorAll("#chapters .chapter");
  if (ch.length && w.IntersectionObserver) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) {
        if (!x.isIntersecting) return;
        io.unobserve(x.target); send("story_chapter_" + ((+x.target.getAttribute("data-i") || 0) + 1), 1);
      });
    }, { rootMargin: "0px 0px -40% 0px" });
    [].forEach.call(ch, function (c) { io.observe(c); });
  }

  /* intro_complete: html.intro-done (intro.js) */
  function intro() { if (root.classList.contains("intro-done")) { send("intro_complete", 1); if (mo) mo.disconnect(); return 1; } }
  var mo = !intro() && d.getElementById("stage") && new MutationObserver(intro);
  if (mo) mo.observe(root, { attributes: true, attributeFilter: ["class"] });

  /* the slider completes by drag, click or key and then navigates itself:
     slide.js puts .done on #unlock just before it sets location.href */
  var un = d.getElementById("unlock"), slid = 0;
  if (un) new MutationObserver(function () {
    if (!un.classList.contains("done")) slid = 0;
    else if (!slid) { slid = 1; send("beta_click", 0, "slide"); }
  }).observe(un, { attributes: true, attributeFilter: ["class"] });

  on(d, "click", function (e) {
    var t = e.target, a = t.closest && t.closest("a[href]"), h = a ? a.href : "";
    if (/^mailto:/i.test(h)) send("mailto_click");
    else if (/press-kit\.zip/.test(h)) send("press_kit_download");
    else if (/^https:\/\/(testflight|apps)\.apple\.com\//.test(h) && a.id !== "knob") send("beta_click", 0, a.id === "barCta" ? "bar" : "link");
    if (t.closest && t.closest("#stage") && discs-- > 0) send("disc_change");
  });
  on(d, "keydown", function (e) {
    if (e.target.id === "stage" && !e.repeat && (e.key === "Enter" || e.key === " ") && discs-- > 0) send("disc_change");
  });
})(window, document);
