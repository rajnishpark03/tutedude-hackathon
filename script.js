/* TuteDude Buildathon: page bits (countdowns, dates, menu, FAQ). The Team Board lives in board.js. */
(function () {
  "use strict";
  const C = window.BUILDATHON || {};
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------- safety ---------- */
  // Don't work inside someone else's frame (clickjacking). TuteDude's own sites may embed the page.
  if (window.top !== window.self) {
    let ok = false;
    const okOrigin = (o) => /^https:\/\/([a-z0-9-]+\.)*tutedude\.com$/.test(o);
    try {
      const a = location.ancestorOrigins;
      if (a && a.length) ok = Array.from(a).every(okOrigin);
      else if (!a && document.referrer) ok = window.parent === window.top && okOrigin(new URL(document.referrer).origin);  // Firefox
    } catch (_) {}
    if (!ok) { document.documentElement.style.display = "none"; return; }
  }
  // web fonts load in the background (no inline handler, so the page's security policy can block inline scripts)
  $$("link[data-fonts]").forEach((l) => { l.media = "all"; });
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- text from config ---------- */
  if (C.prize) $$("[data-prize]").forEach((el) => { el.textContent = C.prize; });
  if (Array.isArray(C.prizes)) $$("[data-prize-n]").forEach((el) => { const v = C.prizes[+el.dataset.prizeN]; if (v) el.textContent = v; });
  if (Array.isArray(C.prizes)) {
    // "₹30,000": the three prizes added up
    const total = C.prizes.reduce((n, p) => n + (parseInt(String(p).replace(/[^0-9]/g, ""), 10) || 0), 0);
    if (total) $$("[data-prize-total]").forEach((el) => { el.textContent = "₹" + total.toLocaleString("en-IN"); });
  }
  if (C.speakUp) $$("[data-speakup]").forEach((el) => { el.href = C.speakUp; });
  const TB = C.teamBuilding || {};
  const tbLink = TB.link || (C.session && C.session.link) || C.speakUp;
  if (tbLink) $$("[data-tb-link]").forEach((el) => { el.href = tbLink; });
  if (TB.when) $$("[data-tb-when]").forEach((el) => { el.textContent = TB.when.charAt(0).toLowerCase() + TB.when.slice(1); });
  const reveal = Date.parse(C.buildDay);
  if (!isNaN(reveal)) {
    const d = new Date(reveal);
    const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, timeZone: "Asia/Kolkata" }).replace(/\s?(am|pm)$/i, (m) => " " + m.trim().toUpperCase());
    $$("[data-build-day]").forEach((el) => { el.textContent = `${day}, ${time}`; });
  }

  /* ---------- countdowns: teams lock → problem statement → live ---------- */
  const lock = Date.parse(C.teamDeadline);
  const units = { d: $('[data-u="d"]'), h: $('[data-u="h"]'), m: $('[data-u="m"]'), s: $('[data-u="s"]') };
  const fmt = (ms) => {
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    return (d ? d + "d " : "") + `${pad(h)}:${pad(m)}:${pad(s)}`;
  };
  // calendar-style flip: the new number drops in from the top, the old one falls away below
  const motionOk = !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function setUnit(el, val) {
    if (el.dataset.v === val) return;
    const first = el.dataset.v == null;
    el.dataset.v = val;
    if (first || !motionOk || document.hidden) { el.innerHTML = `<i class="fl">${val}</i>`; return; }
    el.querySelectorAll(".fl.out").forEach((x) => x.remove());
    const old = el.querySelector(".fl");
    if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 600); }
    const nu = document.createElement("i");
    nu.className = "fl in";
    nu.textContent = val;
    el.appendChild(nu);
  }
  function tick() {
    const now = Date.now();
    const sc = $("#sCountdown"), sl = $("#sLabel");
    let target, label;
    if (now < lock) { target = lock; label = "Teams lock in"; }
    else if (!isNaN(reveal) && now < reveal) { target = reveal; label = "Problem statement in"; }
    else {
      $("#cdLabel").textContent = "The Buildathon is live!";
      $("#uLabel").textContent = "The Buildathon is live!";
      $("#uCountdown").textContent = "";
      $("#countdown").hidden = true;
      document.body.classList.remove("urgent", "very-urgent");
      return;
    }
    const diff = Math.max(0, target - now);
    const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, m = Math.floor(diff / 6e4) % 60, s = Math.floor(diff / 1e3) % 60;
    $("#cdLabel").textContent = label;
    $("#uLabel").textContent = label;
    const ur = $(".u-reveal");
    if (ur) ur.hidden = target !== lock;   // once teams lock, the strip already counts down to the problem statement
    if (units.d) { setUnit(units.d, pad(d)); setUnit(units.h, pad(h)); setUnit(units.m, pad(m)); setUnit(units.s, pad(s)); }
    const short = fmt(diff);
    $("#uCountdown").textContent = short;
    if (sc) { sc.textContent = short; sl.textContent = label; }
    // the last 2 days before teams lock turn orange, the last 6 hours red
    document.body.classList.toggle("urgent", target === lock && diff < 2 * 864e5);
    document.body.classList.toggle("very-urgent", target === lock && diff < 6 * 36e5);
  }
  if (!isNaN(lock)) { tick(); setInterval(tick, 1000); }

  /* ---------- mobile menu ---------- */
  const toggle = $("#navToggle"), nav = $("#nav");
  if (toggle && nav) {
    const set = (open) => {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };
    toggle.addEventListener("click", () => set(!nav.classList.contains("open")));
    nav.addEventListener("click", (e) => { if (e.target.closest("a, button")) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) { set(false); toggle.focus(); } });
    document.addEventListener("click", (e) => { if (nav.classList.contains("open") && !e.target.closest("#nav, #navToggle")) set(false); });
  }

  /* ---------- FAQ: one open at a time ---------- */
  const faqs = $$(".faq-list details");
  faqs.forEach((d) => d.addEventListener("toggle", () => {
    if (d.open) faqs.forEach((o) => { if (o !== d) o.open = false; });
  }));
})();
