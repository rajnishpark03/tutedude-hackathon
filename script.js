/* TuteDude Internal Hackathon — page script */
(function () {
  "use strict";

  /* ------------------------------------------------------------
     CONFIG — edit these when the exact times are confirmed.
     LAUNCH_DAY: start of launch day (IST). The hero counts down to this.
     SPRINT_END: set this once the ceremony end time is known, e.g.
                 "2026-11-05T12:00:00+05:30". The countdown then switches
                 to "Submissions close in".
     ------------------------------------------------------------ */
  const LAUNCH_DAY = "2026-11-04T00:00:00+05:30";
  const SPRINT_END = ""; // leave empty until announced

  /* Community video. `file` is a local copy served with the site (plays inline);
     `drive` is the Google Drive link used as a fallback / open-in-new-tab. */
  const VIDEO = {
    file: "assets/Tutedude_SpeakUp_1080p.mp4",
    drive: "https://drive.google.com/file/d/10je3Wv90Svgqn9wSQQ4VAE7AxXZ46vdL/view",
    caption: "Watch: how the TuteDude community and sessions work."
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, "0");

  /* ---------- countdown ---------- */
  const countdowns = $$("[data-countdown]");
  const labels = $$(".sticky-lbl").concat($$(".support .mono:first-child"));

  function setLabel(text) {
    labels.forEach((el) => { el.textContent = text; });
  }

  function tick() {
    const now = Date.now();
    const launch = Date.parse(LAUNCH_DAY);
    const end = SPRINT_END ? Date.parse(SPRINT_END) : NaN;
    let target, label;

    if (!isNaN(end) && now < end && now >= launch) {
      target = end; label = "Submissions close in";
    } else if (now < launch) {
      target = launch; label = "Launch day in";
    } else if (!isNaN(end) && now >= end) {
      setLabel("Submissions are closed.");
      countdowns.forEach((el) => { el.textContent = "see you at the results"; });
      return;
    } else {
      setLabel("It's launch day.");
      countdowns.forEach((el) => { el.textContent = "problem statements drop at the ceremony"; });
      return;
    }

    const diff = Math.max(0, target - now);
    const d = Math.floor(diff / 864e5);
    const h = Math.floor(diff / 36e5) % 24;
    const m = Math.floor(diff / 6e4) % 60;
    const s = Math.floor(diff / 1e3) % 60;
    setLabel(label);
    countdowns.forEach((el) => { el.textContent = `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`; });
  }
  tick();
  setInterval(tick, 1000);


  /* ---------- community video ---------- */
  const vCard = $("#videoCard"), vFrame = $("#videoFrame");
  if (vCard && vFrame && (VIDEO.file || VIDEO.drive)) {
    vCard.hidden = false;
    $("#videoCaption").textContent = VIDEO.caption || "";
    const driveId = (VIDEO.drive.match(/\/d\/([^/]+)/) || [])[1];
    const showLink = () => {
      vFrame.innerHTML = `<a class="video-link" href="${VIDEO.drive}" target="_blank" rel="noopener"><span><i>▶</i> Watch the community video</span></a>`;
    };
    if (VIDEO.file) {
      const v = document.createElement("video");
      v.controls = true; v.playsInline = true; v.preload = "metadata"; v.src = VIDEO.file;
      v.addEventListener("error", () => {
        if (driveId && !document.body.dataset.noIframe) vFrame.innerHTML = `<iframe src="https://drive.google.com/file/d/${driveId}/preview" allow="autoplay; fullscreen" allowfullscreen title="TuteDude community video"></iframe>`;
        else showLink();
      });
      vFrame.appendChild(v);
    } else if (driveId && !document.body.dataset.noIframe) {
      vFrame.innerHTML = `<iframe src="https://drive.google.com/file/d/${driveId}/preview" allow="autoplay; fullscreen" allowfullscreen title="TuteDude community video"></iframe>`;
    } else showLink();
  }

  /* ---------- hero journey tabs ---------- */
  const journey = $("#journey");
  if (journey) {
    const tabs = $$("[role=tab]", journey), order = tabs.map((t) => t.dataset.phase);
    const FOOT = { team: "Phase 1 of 4 · make your team, then register", design: "Phase 2 of 4 · design the thing", code: "Phase 3 of 4 · build the thing", promo: "Phase 4 of 4 · sell the thing, submit" };
    let idx = 0, timer = null;
    function show(phase) {
      idx = Math.max(0, order.indexOf(phase));
      tabs.forEach((t) => { const on = t.dataset.phase === phase; t.classList.toggle("tab-on", on); t.setAttribute("aria-selected", String(on)); });
      $$(".phase", journey).forEach((p) => { p.hidden = p.id !== "ph-" + phase; });
      $$(".jbar i", journey).forEach((i, k) => i.classList.toggle("on", k <= idx));
      $("#journeyFoot").textContent = FOOT[phase];
    }
    tabs.forEach((t) => t.addEventListener("click", () => { clearInterval(timer); timer = null; show(t.dataset.phase); }));
    journey.addEventListener("keydown", (e) => {
      if (!e.target.matches("[role=tab]")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); clearInterval(timer); const n = (idx + (e.key === "ArrowRight" ? 1 : -1) + order.length) % order.length; show(order[n]); tabs[n].focus(); }
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = () => { show(order[(idx + 1) % order.length]); schedule(); };
    function schedule() { clearTimeout(timer); timer = setTimeout(next, order[idx] === "team" ? 19200 : 5000); }
    if (!reduce) schedule();
    tabs.forEach((t) => t.addEventListener("click", () => { clearTimeout(timer); timer = null; }));
    journey.addEventListener("mouseenter", () => { clearTimeout(timer); timer = null; });
    show("team");

    /* animated SpeakUp scene: a group forms, agrees a time to discuss, registers, then loops */
    const msgs = $("#sceneMsgs"), avs = $("#teamAvs"), count = $("#teamCount"), chip = $("#teamChip"), cta = $("#sceneCta"), steps = $$("#miniSteps li");
    if (msgs) {
      const P = { R: ["Riya", "av-des"], A: ["Arjun", "av-dev"], S: ["Sana", "av-mk"] };
      const SCRIPT = [
        { t: 0,     step: 0, reset: true },
        { t: 700,   typing: "R" },
        { t: 1700,  msg: "R", text: "Hi! I'm Riya, UI/UX course. Making a hackathon team, need 1 dev + 1 marketer 🙋‍♀️", step: 1, join: "R" },
        { t: 3300,  typing: "A" },
        { t: 4200,  msg: "A", text: "Dev here (Full Stack). I'm in!", join: "A", step: 2 },
        { t: 5500,  typing: "S" },
        { t: 6300,  msg: "S", text: "Marketing student. Count me in! 📣", join: "S" },
        { t: 7400,  sys: "Team: 3 of 3 · different courses ✓" },
        { t: 8300,  typing: "R" },
        { t: 9100,  msg: "R", text: "Team Night Owls 🦉 Let's discuss the idea tonight. I'll create a TuteDude session.", step: 3 },
        { t: 10400, session: { title: "Idea discussion · Night Owls", when: "Tonight 9:00 PM · TuteDude session", btn: "Join" } },
        { t: 11600, msg: "A", text: "Joining at 9 👍" },
        { t: 12200, msg: "S", text: "Me too ✅" },
        { t: 13300, live: ["R", "A", "S"] },
        { t: 14400, sys: "Idea locked 💡 → time to register" },
        { t: 15200, cta: "Register the team", step: 4 },
        { t: 16900, cta: "Registered ✅ Night Owls", done: true },
        { t: 18900, loop: true }
      ];
      let timers = [], typingEl = null, sessEl = null;
      const av = (k) => `<i class="av ${P[k][1]}">${P[k][0][0]}</i>`;
      const add = (html, cls) => { const d = document.createElement("div"); d.className = "sm " + (cls || ""); d.innerHTML = html; msgs.appendChild(d); while (msgs.children.length > 5) msgs.firstChild.remove(); return d; };
      function run(step) {
        if (step.reset) { msgs.innerHTML = ""; avs.innerHTML = ""; count.textContent = "0/3"; chip.classList.remove("full"); cta.hidden = true; cta.classList.remove("done"); sessEl = null; }
        if (step.step != null) steps.forEach((li, i) => { li.classList.toggle("on", i === step.step); li.classList.toggle("done", i < step.step); });
        if (step.typing) { if (typingEl) typingEl.remove(); typingEl = add(`${av(step.typing)}<span class="bub typing"><i></i><i></i><i></i></span>`, step.typing === "R" ? "me" : ""); }
        if (step.msg) { if (typingEl) { typingEl.remove(); typingEl = null; } add(`${av(step.msg)}<span class="bub"><b>${P[step.msg][0]}</b>${step.text}</span>`, step.msg === "R" ? "me" : ""); }
        if (step.join) { avs.insertAdjacentHTML("beforeend", av(step.join)); const n = avs.children.length; count.textContent = `${n}/3`; if (n === 3) chip.classList.add("full"); }
        if (step.sys) add(`<span class="bub">${step.sys}</span>`, "sys");
        if (step.session) { if (typingEl) { typingEl.remove(); typingEl = null; } sessEl = add(`<div class="scard"><b>📅 ${step.session.title}</b><span class="sbtn">${step.session.btn}</span><small>${step.session.when}</small></div>`, "sess"); }
        if (step.live && sessEl && sessEl.isConnected) { const card = sessEl.querySelector(".scard"); card.classList.add("live"); card.querySelector(".sbtn").textContent = "● Live"; card.querySelector("small").innerHTML = `${step.live.length} joined <span class="javs">${step.live.map(av).join("")}</span>`; }
        if (step.cta) { cta.hidden = false; cta.textContent = step.cta; cta.classList.toggle("done", !!step.done); }
        if (step.loop) play();
      }
      function play() { timers.forEach(clearTimeout); timers = SCRIPT.map((st) => setTimeout(() => run(st), st.t)); }
      if (reduce) { SCRIPT.filter((st) => !st.typing && !st.loop).forEach(run); }
      else play();
    }
  }

  /* ---------- SpeakUp intro generator ---------- */
  const introText = $("#introText");
  if (introText) {
    const build = () => {
      const n = ($("#introName").value || "[your name]").trim(), c = ($("#introCourse").value || "[your course]").trim(), need = ($("#introNeed").value || "teammates from any course").trim();
      introText.value = `Hi everyone 👋 I'm ${n} from the ${c} course. Forming a team for the TuteDude Internal Hackathon (24 hours, 4 Nov) and looking for ${need}. Reply here or DM me and let's build something together!`;
    };
    ["introName", "introCourse", "introNeed"].forEach((id) => $("#" + id).addEventListener("input", build));
    build();
    $("#copyIntro").addEventListener("click", async () => {
      const btn = $("#copyIntro");
      try { await navigator.clipboard.writeText(introText.value); btn.textContent = "Copied ✓"; }
      catch (_) { introText.focus(); introText.select(); btn.textContent = "Select and copy"; }
      setTimeout(() => { btn.textContent = "Copy message"; }, 2000);
    });
  }



  /* ---------- registration pop-up ---------- */
  const dlg = $("#regDialog");
  function openReg() {
    if (!dlg) return;
    if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); }
    else dlg.setAttribute("open", "");
    document.documentElement.classList.add("modal-open");
    const first = dlg.querySelector("input:not([type=checkbox])"); if (first && !dlg.querySelector("#regSuccess:not([hidden])")) first.focus();
  }
  function closeReg() {
    if (!dlg) return;
    if (dlg.open && typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
    document.documentElement.classList.remove("modal-open");
    if (location.hash === "#register") history.replaceState(null, "", location.pathname + location.search);
  }
  if (dlg) {
    $$("[data-open-reg]").forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); openReg(); }));
    $("#closeReg").addEventListener("click", closeReg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeReg(); });   // backdrop click
    dlg.addEventListener("close", () => document.documentElement.classList.remove("modal-open"));
    if (location.hash === "#register") setTimeout(openReg, 300);                   // deep link from the hub
    window.addEventListener("hashchange", () => { if (location.hash === "#register") openReg(); });
  }

  /* ---------- mobile nav ---------- */
  const navToggle = $("#navToggle");
  const nav = $("#nav");
  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        nav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- sticky CTA: show after the hero scrolls away ---------- */
  const sticky = $("#stickyCta");
  const hero = $(".hero");
  const regSection = $("#register");
  if (sticky && hero && "IntersectionObserver" in window) {
    let heroVisible = true, regVisible = false;
    const update = () => sticky.classList.toggle("show", !heroVisible && !regVisible);
    new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.target === hero) heroVisible = en.isIntersecting;
        if (en.target === regSection) regVisible = en.isIntersecting;
      });
      update();
    }, { threshold: 0.05 }).observe(hero);
    if (regSection) {
      new IntersectionObserver((entries) => {
        entries.forEach((en) => { regVisible = en.isIntersecting; });
        update();
      }, { threshold: 0.15 }).observe(regSection);
    }
  }

  /* ---------- FAQ: only one open at a time ---------- */
  const faqs = $$(".faq-list details");
  faqs.forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) faqs.forEach((o) => { if (o !== d) o.open = false; });
    });
  });

  /* ---------- registration form ---------- */
  const form = $("#regForm");
  if (!form) return;

  const MIN_OTHERS = 2; // team of 3 = lead + 2
  const MAX_OTHERS = 4; // team of 5 = lead + 4
  const memberList = $("#memberList");
  const memberCount = $("#memberCount");
  const addBtn = $("#addMember");
  let memberSeq = 0;

  function renderCount() {
    const n = memberList.children.length;
    memberCount.textContent = `${n} added · need ${MIN_OTHERS}–${MAX_OTHERS}`;
    addBtn.disabled = n >= MAX_OTHERS;
    addBtn.textContent = n >= MAX_OTHERS ? "Team is full (5 members)" : "+ Add a member";
    $$(".member-remove", memberList).forEach((b) => { b.disabled = n <= MIN_OTHERS; });
  }

  function addMember(focus) {
    if (memberList.children.length >= MAX_OTHERS) return;
    const id = ++memberSeq;
    const row = document.createElement("div");
    row.className = "member-row";
    row.innerHTML = `
      <div class="field">
        <label for="mName${id}">Member name</label>
        <input id="mName${id}" name="memberName" type="text" required placeholder="Full name">
      </div>
      <div class="field">
        <label for="mEmail${id}">Email</label>
        <input id="mEmail${id}" name="memberEmail" type="email" required placeholder="name@example.com">
      </div>
      <div class="field">
        <label for="mCourse${id}">TuteDude course</label>
        <input id="mCourse${id}" name="memberCourse" type="text" required placeholder="e.g. Full Stack Development">
      </div>
      <button type="button" class="member-remove" aria-label="Remove this member">×</button>`;
    row.querySelector(".member-remove").addEventListener("click", () => {
      row.remove();
      renderCount();
    });
    memberList.appendChild(row);
    renderCount();
    if (focus) row.querySelector("input").focus();
  }

  addMember(false);
  addMember(false);
  addBtn.addEventListener("click", () => addMember(true));

  const errorBox = $("#formError");
  const success = $("#regSuccess");
  const successText = $("#successText");

  function showError(msg, field) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
  }

  form.addEventListener("input", (e) => {
    if (e.target.matches("input")) e.target.removeAttribute("aria-invalid");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    $$("input[aria-invalid]", form).forEach((i) => i.removeAttribute("aria-invalid"));

    const req = $$("input[required]", form);
    for (const input of req) {
      if (input.type === "checkbox") {
        if (!input.checked) return showError("Please confirm the eligibility checkbox before submitting.", input);
        continue;
      }
      if (!input.value.trim()) {
        const lbl = form.querySelector(`label[for="${input.id}"]`);
        return showError(`Please fill in "${(lbl ? lbl.textContent : "this field").replace("*", "").trim()}".`, input);
      }
      if (input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
        return showError("That email address doesn't look right. Check it and try again.", input);
      }
    }

    const others = memberList.children.length;
    if (others < MIN_OTHERS || others > MAX_OTHERS) {
      return showError(`Teams must have 3 to 5 members in total. Add ${MIN_OTHERS}–${MAX_OTHERS} members besides the lead.`);
    }

    const emails = $$('input[type="email"]', form).map((i) => i.value.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) {
      return showError("Two members share the same email. Every member needs their own TuteDude email.");
    }

    const data = new FormData(form);
    const payload = {
      teamName: data.get("teamName").trim(),
      lead: { name: data.get("leadName").trim(), email: data.get("leadEmail").trim(), phone: data.get("leadPhone").trim(), course: data.get("leadCourse").trim() },
      members: data.getAll("memberName").map((n, i) => ({ name: n.trim(), email: data.getAll("memberEmail")[i].trim(), course: data.getAll("memberCourse")[i].trim() })),
      roles: data.getAll("roles"),
      submittedAt: new Date().toISOString()
    };

    /* ------------------------------------------------------------
       HOOK UP YOUR BACKEND HERE.
       Replace the block below with a fetch() to your API, a Google
       Apps Script endpoint, Formspree, etc. `payload` is ready to send.
       ------------------------------------------------------------ */
    try { localStorage.setItem("tutedude-hackathon-registration", JSON.stringify(payload)); } catch (_) {}

    const total = 1 + payload.members.length;
    successText.textContent = `Team "${payload.teamName}" (${total} members) is registered with ${payload.lead.name} as lead. We'll reach you at ${payload.lead.email}.`;
    form.hidden = true;
    success.hidden = false;
    success.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  $("#regAgain").addEventListener("click", () => {
    form.reset();
    memberList.innerHTML = "";
    addMember(false); addMember(false);
    success.hidden = true;
    form.hidden = false;
    $("#teamName").focus();
  });
})();
