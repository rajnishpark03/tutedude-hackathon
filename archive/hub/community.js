/* TuteDude Community Hub v2
   Shared data lives in the artifact database on claude.ai (everyone with the link sees the same
   sessions, rooms, groups and leaderboard). As plain static files it falls back to localStorage.
   Swap `localStore()` for a Firebase/Supabase adapter with the same methods to go multi-user on your own domain. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const code6 = () => Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OI]/g, "X");
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const MIN = 3, MAX = 5, MSG_CAP = 150;
  const IST = "Asia/Kolkata";
  const SPEAKUP = "https://upskill.tutedude.com/course/lecture-growthhacking/community?channel=shared--speak-up";
  const suLink = (name) => `<a class="su-mini" href="${SPEAKUP}" target="_blank" rel="noopener" title="Find ${esc(name)} on SpeakUp">SpeakUp ↗</a>`;

  /* ---------------- storage adapters ---------------- */
  function localStore() {
    const subs = {};
    const read = (c) => { try { return JSON.parse(localStorage.getItem("tdh2:" + c) || "{}"); } catch (_) { return {}; } };
    const write = (c, m) => { try { localStorage.setItem("tdh2:" + c, JSON.stringify(m)); } catch (_) {} (subs[c] || []).forEach((f) => f()); };
    window.addEventListener("storage", (e) => { if (e.key && e.key.startsWith("tdh2:")) (subs[e.key.slice(5)] || []).forEach((f) => f()); });
    const sub = (c, f) => { (subs[c] = subs[c] || []).push(f); f(); return () => { subs[c] = subs[c].filter((x) => x !== f); }; };
    const col = (c) => ({
      async list() { return Object.values(read(c)); },
      async get(id) { return read(c)[id] || null; },
      async set(id, d) { const m = read(c); m[id] = { ...d, id }; write(c, m); },
      async update(id, p) { const m = read(c); if (!m[id]) throw new Error("missing"); m[id] = { ...m[id], ...p }; write(c, m); },
      async delete(id) { const m = read(c); delete m[id]; write(c, m); },
      watch(cb) { return sub(c, () => cb(Object.values(read(c)))); },
      watchDoc(id, cb) { return sub(c, () => cb(read(c)[id] || null)); }
    });
    return { mode: "local", col, uid: null, room: null };
  }
  function dbStore(db, uid, room) {
    const docOf = (d) => ({ id: d.id, ...d.data() });
    const col = (c) => ({
      async list() { return (await db.collection(c).get()).docs.map(docOf); },
      async get(id) { const s = await db.collection(c).doc(id).get(); return s.exists ? docOf(s) : null; },
      async set(id, d) { await db.collection(c).doc(id).set({ ...d, id }); },
      async update(id, p) { await db.collection(c).doc(id).update(p); },
      async delete(id) { await db.collection(c).doc(id).delete(); },
      watch(cb) { return db.collection(c).onSnapshot((s) => cb(s.docs.map(docOf)), (e) => console.warn("db", c, e)); },
      watchDoc(id, cb) { return db.collection(c).doc(id).onSnapshot((s) => cb(s.exists ? docOf(s) : null), (e) => console.warn("db", c, id, e)); }
    });
    return { mode: "live", col, uid, room };
  }
  async function makeStore() {
    const cl = window.claude;
    if (cl && typeof cl.use === "function") {
      try {
        const db = await cl.use("db");
        if (db) {
          const [user, room] = await Promise.all([cl.use("user"), cl.use("room")]);
          return dbStore(db, user ? await user.id() : null, room);
        }
      } catch (e) { console.warn("db unavailable", e); }
    }
    return localStore();
  }

  /* ---------------- constants ---------------- */
  const SLOTS = [
    { key: "standup", h: 9, m: 0, dur: 15, title: "Morning Standup", type: "Co-working", blurb: "2 minutes each: what you did, what you'll do, what's blocking you." },
    { key: "doubt", h: 18, m: 0, dur: 45, title: "Doubt Hour", type: "Doubt session", blurb: "Bring a bug, a design or a campaign. Hosts and peers unblock you live." },
    { key: "build", h: 21, m: 0, dur: 60, title: "Build Hour", type: "Co-working", blurb: "Cameras optional, music on. Everyone builds. Share one screenshot at the end." }
  ];
  const TYPE_ICON = { "Co-working": "🛠", "Doubt session": "❓", "Ideation": "💡", "Design review": "🎨", "Demo": "🎬", "Chai break": "☕", "Standup": "⚡" };
  const ROOMS = [
    { id: "general", name: "#general", desc: "Everyone. Daily challenge answers go here." },
    { id: "find-a-team", name: "#find-a-team", desc: "Say what you do and what you need." },
    { id: "dev", name: "#dev", desc: "Engineering talk, stack choices, bugs." },
    { id: "design", name: "#design", desc: "Wireframes, feedback, Figma links." },
    { id: "marketing", name: "#marketing", desc: "Scripts, positioning, promo videos." }
  ];
  const PROMPTS = [
    "What's one thing you built this week that you're proud of? Screenshot or it didn't happen.",
    "Describe your hackathon idea in exactly 7 words.",
    "Worst bug you ever shipped. What did it teach you?",
    "Which app's onboarding is perfect? Why?",
    "Show the ugliest first version of something you later made beautiful.",
    "What would you build if you had 24 hours and no fear?",
    "One tool you can't work without. Sell it to us in one line.",
    "Pitch your team to a stranger: who are you, what do you need?",
    "What's the one skill from your course you want to use in the hackathon?",
    "Your 3 AM snack during a sprint. Defend it.",
    "Rate your current project's landing page out of 10 and say what's missing.",
    "What's a feature everyone builds that nobody uses?",
    "Name a product whose promo video actually made you want it.",
    "If judging was only on the video, what would you change about your plan?"
  ];
  const ICE = [
    "What's the worst app you've ever used, and why did you keep using it?",
    "Pitch our project to a 10-year-old in one sentence.",
    "One feature we should NOT build, no matter how tempting?",
    "If the judges remember one thing about our demo, what should it be?",
    "What's a tiny detail that makes a product feel premium?",
    "Chai or coffee? Defend your answer.",
    "What's the first thing you'd cut if we run out of time?",
    "Which track is secretly the hardest: dev, design or marketing?"
  ];
  const PLAN = [
    ["H+0", "Pick the problem statement", "Choose the one your team can finish, not the flashiest."],
    ["H+2", "Scope and split roles", "One-line product definition. Who builds, who designs, who tells the story."],
    ["H+6", "Wireframes and tech skeleton", "Design has screens, engineering has a repo that runs."],
    ["H+12", "Core feature works end to end", "Ugly is fine. Working is mandatory."],
    ["H+18", "Web polish pass", "Responsive, branded, no broken links. Marketing starts the video script."],
    ["H+21", "Record the promo video", "Show the real product. Keep it short."],
    ["H+23", "Submit everything", "Repo, hosted link, video. Timestamped before the deadline."]
  ];

  /* ---------------- helpers ---------------- */
  const ME_KEY = "tdh2:me";
  const loadMe = () => { try { return JSON.parse(localStorage.getItem(ME_KEY) || "null"); } catch (_) { return null; } };
  const saveMe = (m) => { try { localStorage.setItem(ME_KEY, JSON.stringify(m)); } catch (_) {} };
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); };
  const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avClass = (role) => role === "Design" ? "av-des" : role === "Marketing" ? "av-mk" : "av-dev";
  const fmtWhen = (iso) => new Date(iso).toLocaleString("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  const fmtClock = (iso) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true });
  // IST calendar date "YYYY-MM-DD" for a timestamp
  const istDay = (t) => new Date((t || Date.now()) + 5.5 * 36e5).toISOString().slice(0, 10);
  // timestamp of an IST wall-clock time on an IST day
  const istAt = (day, h, m) => Date.parse(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`);
  const addDays = (day, n) => istDay(istAt(day, 12, 0) + n * 864e5);
  const dayOfYear = () => Math.floor((Date.now() + 5.5 * 36e5) / 864e5);

  /* ---------------- state ---------------- */
  let store, me, uid, profile = null;
  let teams = [], myTeam = null, sessions = [], board = [], roomDoc = null, profiles = [];
  let unsub = {}; let curRoom = "general"; let filter = "all"; let onlineN = 0;

  async function boot() {
    store = await makeStore();
    uid = store.uid;
    me = loadMe();
    if (!uid) { if (!me || !me.localUid) me = { ...(me || {}), localUid: "l_" + rid() }; uid = me.localUid; }
    if (me && me.name) enter(); else { $("#nameGate").hidden = false; }
  }

  $("#nameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!$("#meEligible").checked) return toast("Tick the eligibility box first.");
    me = { ...(me || {}), name: $("#meName").value.trim(), course: $("#meCourse").value.trim(), role: $("#meRole").value };
    saveMe(me);
    const p = (await store.col("profiles").get(uid)) || { points: 0, streak: 0 };
    await store.col("profiles").set(uid, { ...p, uid, name: me.name, course: me.course, role: me.role, updatedAt: Date.now() });
    enter();
  });
  $("#editName").addEventListener("click", () => {
    $("#app").hidden = true; $("#nameGate").hidden = false;
    $("#meName").value = me.name || ""; $("#meCourse").value = me.course || ""; $("#meRole").value = me.role || "Engineering";
  });

  function enter() {
    $("#nameGate").hidden = true; $("#app").hidden = false;
    $("#editName").textContent = me.name;
    $("#promptText").textContent = PROMPTS[dayOfYear() % PROMPTS.length];
    if (!unsub.teams) unsub.teams = store.col("teams").watch((l) => { teams = l; render(); });
    if (!unsub.sessions) unsub.sessions = store.col("sessions").watch((l) => { sessions = l; render(); });
    if (!unsub.board) unsub.board = store.col("board").watch((l) => { board = l; paintBoard(); paintStats(); });
    if (!unsub.profile) unsub.profile = store.col("profiles").watchDoc(uid, (p) => { profile = p; paintMe(); });
    touchStreak();
    openRoom(curRoom);
    presence();
    loadBoard();
    const h = location.hash.replace("#", "");
    if (["home", "sessions", "rooms", "group", "board"].includes(h)) goTab(h);
  }

  /* ---------------- presence (who's online) ---------------- */
  function presence() {
    const room = store.room; if (!room) return;
    try {
      room.presence({ name: me.name, role: me.role, at: "home" });
      room.onPeers((ch) => {
        const ids = new Set(); ch.peers.forEach((p) => { if (p.kind === "viewer") ids.add(p.by || p.peer); });
        onlineN = Math.max(1, ids.size);
        $("#onlineCount").textContent = onlineN; $("#onlinePill").hidden = false; paintStats();
      }, () => {});
    } catch (_) {}
  }

  /* ---------------- points & streak ---------------- */
  async function award(n, reason, opts) {
    const p = (await store.col("profiles").get(uid)) || { uid, name: me.name, course: me.course, role: me.role, points: 0, streak: 0 };
    const today = istDay();
    if (opts && opts.once) { const done = p.done || {}; if (done[opts.once]) return; p.done = { ...done, [opts.once]: today }; }
    if (opts && opts.daily) { const d = p.daily || {}; const k = opts.daily + ":" + today; if ((d[k] || 0) >= opts.cap) return; p.daily = { [k]: (d[k] || 0) + 1 }; }
    p.points = (p.points || 0) + n;
    await store.col("profiles").set(uid, { ...p, name: me.name, course: me.course, role: me.role, updatedAt: Date.now() });
    if (n >= 5) toast(`+${n} points · ${reason}`);
  }
  async function touchStreak() {
    const p = (await store.col("profiles").get(uid)) || { uid, name: me.name, course: me.course, role: me.role, points: 0, streak: 0 };
    const today = istDay(), yday = addDays(today, -1);
    if (p.lastDay === today) return;
    p.streak = p.lastDay === yday ? (p.streak || 0) + 1 : 1; p.lastDay = today;
    await store.col("profiles").set(uid, { ...p, name: me.name, course: me.course, role: me.role, updatedAt: Date.now() });
  }
  function paintMe() {
    $("#ptsPill").hidden = false;
    $("#ptsCount").textContent = (profile && profile.points) || 0;
    $("#streakCount").textContent = (profile && profile.streak) || 0;
  }

  /* ---------------- tabs ---------------- */
  function goTab(name) {
    $$(".hub-tabs .tab-btn").forEach((x) => x.classList.toggle("is-on", x.dataset.tab === name));
    $$("#app > .tab-panel").forEach((p) => { p.hidden = p.id !== "tab-" + name; });
    if (name === "rooms") scrollChat();
    if (name === "board") loadBoard();
    if (store.room) store.room.presence({ at: name }).catch(() => {});
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $$(".hub-tabs .tab-btn").forEach((b) => b.addEventListener("click", () => goTab(b.dataset.tab)));
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-goto-tab]"); if (t) goTab(t.dataset.gotoTab);
    const r = e.target.closest("[data-goto-room]"); if (r) { openRoom(r.dataset.gotoRoom === "team" ? (myTeam ? "team_" + myTeam.id : "find-a-team") : r.dataset.gotoRoom); goTab("rooms"); }
  });

  /* ---------------- sessions model ---------------- */
  function slotSessions() {
    // virtual daily slots for today + tomorrow; replaced by a real doc when someone hosts or RSVPs
    const out = []; const today = istDay();
    [today, addDays(today, 1)].forEach((day) => SLOTS.forEach((s) => {
      const id = `slot_${s.key}_${day}`;
      if (sessions.some((x) => x.id === id)) return;
      out.push({ id, slot: true, slotKey: s.key, title: s.title, type: s.type, track: "Everyone", when: new Date(istAt(day, s.h, s.m)).toISOString(), dur: s.dur, agenda: s.blurb, going: [], kind: "public", host: null });
    }));
    return out;
  }
  function allSessions() {
    const real = sessions.filter((s) => s.kind !== "team" || (myTeam && s.teamId === myTeam.id));
    return [...real, ...slotSessions()].sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  }
  function state(s) {
    const start = Date.parse(s.when), end = start + (s.dur || 30) * 6e4, now = Date.now();
    if (now >= start && now <= end) return { k: "live", chip: "LIVE NOW" };
    if (now > end) return { k: "done", chip: "ended" };
    const d = start - now, h = Math.floor(d / 36e5), m = Math.floor(d / 6e4) % 60;
    return { k: "soon", chip: h > 48 ? `in ${Math.floor(h / 24)}d ${h % 24}h` : h ? `in ${h}h ${m}m` : `in ${m}m` };
  }
  async function ensureReal(s) {
    if (!s.slot) return s;
    const cfg = SLOTS.find((x) => x.key === s.slotKey);
    const doc = { kind: "public", slotKey: s.slotKey, title: s.title, type: s.type, track: "Everyone", when: s.when, dur: s.dur, agenda: cfg.blurb, link: "", host: null, hostName: "", going: [], createdAt: Date.now() };
    const existing = await store.col("sessions").get(s.id);
    if (existing) return existing;
    await store.col("sessions").set(s.id, doc);
    return { ...doc, id: s.id };
  }
  async function rsvp(s) {
    const real = await ensureReal(s);
    const going = real.going || [];
    const on = going.includes(uid);
    await store.col("sessions").update(real.id, { going: on ? going.filter((x) => x !== uid) : [...going, uid] });
    if (!on) await award(2, "RSVP", { once: "rsvp:" + real.id });
    if (!on) await post("general", { sys: true, text: `${me.name} is in for "${real.title}" (${fmtClock(real.when)}) ✋` });
  }
  async function host(s) {
    const real = await ensureReal(s);
    if (real.host && real.host !== uid) return toast(`${real.hostName} is already hosting.`);
    const link = window.prompt ? null : null; // prompt() is unavailable in the artifact viewer
    await store.col("sessions").update(real.id, { host: uid, hostName: me.name, going: Array.from(new Set([...(real.going || []), uid])) });
    await award(20, "hosting " + real.title, { once: "host:" + real.id });
    await post("general", { sys: true, text: `🎤 ${me.name} is hosting "${real.title}" at ${fmtClock(real.when)}. Add the meeting link from the Sessions tab.` });
    toast("You're the host. Add a meeting link on the card.");
  }
  async function joinCall(s) {
    if (state(s).k === "live") await award(10, "joined " + s.title, { once: "join:" + s.id });
  }
  async function setLink(s) {
    const input = $(`[data-link-for="${s.id}"]`); if (!input) return;
    const link = input.value.trim(); if (!/^https?:\/\//.test(link)) return toast("Paste a full https:// link.");
    const real = await ensureReal(s);
    await store.col("sessions").update(real.id, { link });
    toast("Meeting link saved.");
  }

  $("#sessForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const when = $("#sWhen").value; if (!when) return;
    const aud = $("#sAud").value;
    if (aud === "team" && !myTeam) return toast("Join or create a group first for a group-only session.");
    const id = "s_" + rid();
    const s = { kind: aud === "team" ? "team" : "public", teamId: aud === "team" ? myTeam.id : null, title: $("#sTitle").value.trim(), type: $('input[name="stype"]:checked').value, track: $("#sTrack").value,
      when: new Date(when).toISOString(), dur: Number($("#sDur").value), link: $("#sLink").value.trim(), agenda: $("#sAgenda").value.trim(), host: uid, hostName: me.name, going: [uid], createdAt: Date.now() };
    await store.col("sessions").set(id, s);
    if (s.kind === "public") { await award(20, "hosting", { once: "host:" + id }); await post("general", { sys: true, text: `🎤 ${me.name} is hosting "${s.title}" on ${fmtWhen(s.when)}. Tap Sessions to join.` }); }
    else await post("team_" + myTeam.id, { sys: true, text: `${me.name} scheduled "${s.title}" for ${fmtWhen(s.when)}` });
    $("#sessForm").reset();
    toast("Session published.");
  });

  function sessCard(s, compact) {
    const st = state(s), going = s.going || [], mine = going.includes(uid), isHost = s.host === uid;
    const cls = ["sess", st.k === "live" ? "live" : st.k === "done" ? "done" : "", s.slot ? "slot" : "", s.kind === "team" ? "team" : ""].join(" ");
    const hostTxt = s.host ? `hosted by ${esc(s.hostName)} ${s.host !== uid ? suLink(s.hostName) : ""}` : s.slot || !s.host ? '<span class="badge badge-warn">no host yet</span>' : "";
    const btns = [];
    if (st.k !== "done") btns.push(`<button class="btn btn-sm ${mine ? "btn-ghost" : ""}" type="button" data-act="rsvp" data-id="${esc(s.id)}">${mine ? "Going ✓" : "I'm in"}</button>`);
    if (!s.host && st.k !== "done") btns.push(`<button class="btn btn-sm btn-gold" type="button" data-act="host" data-id="${esc(s.id)}">I'll host this</button>`);
    if (s.link && st.k !== "done") btns.push(`<a class="btn btn-sm ${st.k === "live" ? "" : "btn-ghost"}" href="${esc(s.link)}" target="_blank" rel="noopener" data-act="join" data-id="${esc(s.id)}">${st.k === "live" ? "Join now" : "Call link"}</a>`);
    if (!compact) btns.push(`<button class="btn btn-ghost btn-sm" type="button" data-act="discuss" data-id="${esc(s.id)}">Discuss</button>`);
    if (isHost && !compact && st.k !== "done") btns.push(`<button class="btn btn-ghost btn-sm" type="button" data-act="del" data-id="${esc(s.id)}" aria-label="Cancel session">🗑</button>`);
    const linkRow = isHost && !s.link && !compact ? `<div class="row"><input class="link-in" data-link-for="${esc(s.id)}" type="url" placeholder="Paste Meet / Zoom / Discord link" style="flex:1;min-width:200px;min-height:36px;padding:0 12px;border:2px solid var(--ink);border-radius:999px;font:inherit"><button class="btn btn-sm" type="button" data-act="setlink" data-id="${esc(s.id)}">Save</button></div>` : "";
    return `<article class="${cls}">
      <div class="sess-top"><span class="sess-type">${TYPE_ICON[s.type] || "•"} ${esc(s.type)}${s.track && s.track !== "Everyone" ? ` · ${esc(s.track)}` : ""}${s.kind === "team" ? " · group" : ""}</span><span class="countdown-chip">${st.chip}</span></div>
      <h3>${esc(s.title)}</h3>
      <p class="when">${esc(fmtWhen(s.when))} · ${s.dur} min · ${hostTxt} · <span class="going">${going.length} going</span></p>
      ${!compact && s.agenda ? `<p class="agenda">${esc(s.agenda)}</p>` : ""}
      <div class="row">${btns.join("")}</div>${linkRow}</article>`;
  }
  function paintSessions() {
    const all = allSessions(); const today = istDay();
    const live = all.filter((s) => state(s).k === "live");
    $("#sessPill").textContent = live.length ? `${live.length} live` : all.filter((s) => istDay(Date.parse(s.when)) === today && state(s).k !== "done").length;
    let list = all;
    if (filter === "live") list = live;
    if (filter === "today") list = all.filter((s) => istDay(Date.parse(s.when)) === today);
    if (filter === "mine") list = all.filter((s) => (s.going || []).includes(uid) || s.host === uid);
    if (filter === "past") list = all.filter((s) => state(s).k === "done").reverse();
    if (filter === "all") list = all.filter((s) => state(s).k !== "done" || istDay(Date.parse(s.when)) === today);
    let html = "", lastDay = "";
    list.forEach((s) => {
      const d = istDay(Date.parse(s.when));
      if (d !== lastDay) { lastDay = d; html += `<p class="sess-day">${d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : new Date(Date.parse(s.when)).toLocaleDateString("en-IN", { timeZone: IST, weekday: "long", day: "numeric", month: "short" })}</p>`; }
      html += sessCard(s, false);
    });
    $("#sessList").innerHTML = html || '<p class="empty">Nothing here yet. Host something!</p>';
    // home: today's sessions
    const todays = all.filter((s) => istDay(Date.parse(s.when)) === today);
    $("#todayList").innerHTML = todays.map((s) => sessCard(s, true)).join("") || '<p class="empty">No sessions today.</p>';
    // team sessions
    if (myTeam) { const ts = all.filter((s) => s.kind === "team" && s.teamId === myTeam.id && state(s).k !== "done"); $("#teamSessList").innerHTML = ts.map((s) => sessCard(s, true)).join("") || '<p class="empty">No group sessions yet.</p>'; }
    paintNow(all, live);
  }
  function paintNow(all, live) {
    const card = $("#nowCard");
    if (live.length) {
      const s = live[0];
      card.className = "hub-card now-card is-live";
      card.innerHTML = `<p class="kicker">● Live now${live.length > 1 ? ` · ${live.length} sessions` : ""}</p><h2>${esc(s.title)}</h2>
        <p class="meta">${TYPE_ICON[s.type] || ""} ${esc(s.type)} · ${s.host ? "hosted by " + esc(s.hostName) : "no host yet"} · ${(s.going || []).length} going · ends ${fmtClock(Date.parse(s.when) + s.dur * 6e4)}</p>
        <div class="row">${s.link ? `<a class="btn" href="${esc(s.link)}" target="_blank" rel="noopener" data-act="join" data-id="${esc(s.id)}">Join now</a>` : `<button class="btn btn-gold" type="button" data-act="host" data-id="${esc(s.id)}">I'll host this</button>`}<button class="btn btn-ghost" type="button" data-act="discuss" data-id="${esc(s.id)}">Open the room</button></div>`;
      return;
    }
    const next = all.find((s) => state(s).k === "soon");
    card.className = "hub-card now-card";
    if (!next) { card.innerHTML = `<p class="kicker">Next up</p><h2>Nothing scheduled. Host something.</h2>`; return; }
    const st = state(next), going = next.going || [];
    card.innerHTML = `<p class="kicker">Next up · ${istDay(Date.parse(next.when)) === istDay() ? "today" : "tomorrow"} ${fmtClock(next.when)} IST</p><h2>${esc(next.title)}</h2>
      <p class="meta">${TYPE_ICON[next.type] || ""} ${esc(next.type)} · ${next.host ? "hosted by " + esc(next.hostName) : "needs a host"} · ${going.length} going</p>
      <p class="big-time">${st.chip.replace("in ", "starts in ")}</p>
      <div class="row"><button class="btn btn-gold" type="button" data-act="rsvp" data-id="${esc(next.id)}">${going.includes(uid) ? "Going ✓" : "I'm in"}</button>${!next.host ? `<button class="btn btn-ghost" type="button" data-act="host" data-id="${esc(next.id)}" style="color:#fff">I'll host this</button>` : ""}</div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const s = allSessions().find((x) => x.id === b.dataset.id) || sessions.find((x) => x.id === b.dataset.id); if (!s) return;
    const act = b.dataset.act;
    if (act === "rsvp") rsvp(s);
    if (act === "host") host(s);
    if (act === "join") joinCall(s);
    if (act === "setlink") setLink(s);
    if (act === "discuss") { await ensureReal(s); openRoom("sess_" + s.id, s); goTab("rooms"); }
    if (act === "del" && s.host === uid) { await store.col("sessions").delete(s.id); toast("Session cancelled."); }
  });
  $$(".sess-filter .chip-btn").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.filter; $$(".sess-filter .chip-btn").forEach((x) => x.classList.toggle("is-on", x === b)); paintSessions(); }));
  setInterval(() => { if (!$("#app").hidden) paintSessions(); }, 30000);

  /* ---------------- rooms ---------------- */
  const roomMeta = (id) => {
    const fixed = ROOMS.find((r) => r.id === id); if (fixed) return fixed;
    if (id.startsWith("team_")) return { id, name: "#" + (myTeam ? myTeam.name.toLowerCase().replace(/\s+/g, "-") : "group"), desc: "Private to your group." };
    if (id.startsWith("sess_")) { const s = sessions.find((x) => "sess_" + x.id === id); return { id, name: "🎤 " + (s ? s.title : "session"), desc: "Session room. Questions, links, notes." }; }
    return { id, name: "#" + id, desc: "" };
  };
  function openRoom(id) {
    curRoom = id;
    if (unsub.room) unsub.room();
    unsub.room = store.col("rooms").watchDoc(id, (d) => { roomDoc = d; paintChat(); });
    const m = roomMeta(id);
    $("#roomName").textContent = m.name; $("#roomDesc").textContent = m.desc; $("#msgInput").placeholder = `Message ${m.name}…`;
    paintRoomList();
  }
  function paintRoomList() {
    const today = istDay();
    const sessRooms = sessions.filter((s) => istDay(Date.parse(s.when)) === today && ((s.going || []).includes(uid) || s.host === uid));
    const item = (id, name, sub) => `<li><button type="button" class="${id === curRoom ? "is-on" : ""}" data-room="${esc(id)}"><span>${esc(name)}</span>${sub ? `<small>${esc(sub)}</small>` : ""}</button></li>`;
    let html = `<li class="sect">Community</li>` + ROOMS.map((r) => item(r.id, r.name)).join("");
    if (myTeam) html += `<li class="sect">Your group</li>` + item("team_" + myTeam.id, roomMeta("team_" + myTeam.id).name, `${myTeam.members.length} members`);
    if (sessRooms.length) html += `<li class="sect">Today's sessions</li>` + sessRooms.map((s) => item("sess_" + s.id, "🎤 " + s.title, fmtClock(s.when))).join("");
    $("#roomList").innerHTML = html;
  }
  $("#roomList").addEventListener("click", (e) => { const b = e.target.closest("[data-room]"); if (b) openRoom(b.dataset.room); });
  async function post(roomId, m) {
    const cur = (await store.col("rooms").get(roomId)) || { messages: [] };
    const messages = [...(cur.messages || []), { id: rid(), ts: Date.now(), ...m }].slice(-MSG_CAP);
    await store.col("rooms").set(roomId, { messages });
  }
  function paintChat() {
    const msgs = (roomDoc && roomDoc.messages) || [];
    const pins = msgs.filter((m) => m.pin);
    $("#pins").hidden = !pins.length;
    $("#pins").innerHTML = `<b>📌 Pinned</b>` + pins.slice(-5).map((m) => `<div>${esc(m.text.replace(/^!\s*/, ""))} <small>· ${esc(m.name)}</small></div>`).join("");
    $("#msgs").innerHTML = msgs.length ? msgs.map((m) => {
      if (m.sys) return `<div class="m"><i class="av" style="background:var(--gold);color:var(--ink)">★</i><div class="bubble"><div class="txt sys">${esc(m.text)}</div></div></div>`;
      const mine = m.uid === uid, fire = m.fire || [];
      return `<div class="m ${mine ? "me" : ""}"><i class="av ${avClass(m.role)}">${esc(initials(m.name))}</i><div class="bubble">
        <div class="meta"><b>${esc(mine ? "You" : m.name)}</b><span>${fmtTime(m.ts)}</span>${m.pin ? '<span class="pin">pinned</span>' : ""}${mine ? "" : suLink(m.name)}</div>
        <div class="txt">${esc(m.text)}</div>
        <button type="button" class="react ${fire.includes(uid) ? "on" : ""}" data-fire="${esc(m.id)}">🔥 ${fire.length || ""}</button></div></div>`;
    }).join("") : `<p class="empty">Quiet in here. Say hi 👋</p>`;
    scrollChat();
  }
  const scrollChat = () => { const b = $("#msgs"); if (b) b.scrollTop = b.scrollHeight; };
  $("#msgForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("#msgInput").value.trim(); if (!text) return;
    $("#msgInput").value = "";
    await post(curRoom, { uid, name: me.name, role: me.role, text, pin: text.startsWith("!"), fire: [] });
    if (curRoom === "general") await award(5, "today's challenge", { once: "prompt:" + istDay() });
    await award(1, "message", { daily: "msg", cap: 20 });
  });
  $("#msgs").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fire]"); if (!b || !roomDoc) return;
    const messages = (roomDoc.messages || []).map((m) => m.id !== b.dataset.fire ? m : { ...m, fire: (m.fire || []).includes(uid) ? m.fire.filter((x) => x !== uid) : [...(m.fire || []), uid] });
    await store.col("rooms").set(curRoom, { messages });
  });
  $("#icebreaker").addEventListener("click", () => post(curRoom, { sys: true, text: `🎲 Icebreaker from ${me.name}: ${ICE[Math.floor(Math.random() * ICE.length)]}` }));

  /* ---------------- groups ---------------- */
  function render() {
    myTeam = teams.find((t) => (t.members || []).some((m) => m.uid === uid)) || null;
    $("#groupPill").textContent = myTeam ? `${myTeam.members.length}/${MAX}` : "none";
    if (myTeam) { $("#viewLobby").hidden = true; $("#viewTeam").hidden = false; paintTeam(); }
    else { $("#viewTeam").hidden = true; $("#viewLobby").hidden = false; paintLobby(); }
    paintGroupMini(); paintSessions(); paintRoomList(); paintStats();
  }
  function paintLobby() {
    const open = teams.filter((t) => (t.members || []).length < MAX).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    buildIntro();
    $("#teamsList").innerHTML = open.length ? open.map((t) => { const n = t.members.length; return `<div class="bcard"><span class="mono">${n}/${MAX} · ${n >= MIN ? "ready" : "recruiting"}</span><b>${esc(t.name)}</b><p>${esc(t.tag || "No pitch yet.")}</p>
      <div class="row">${(t.needs || []).map((x) => `<span class="badge badge-warn">needs ${esc(x)}</span>`).join("") || '<span class="badge">open to anyone</span>'}</div>
      <div class="row"><button class="btn btn-sm" type="button" data-join="${esc(t.code)}">Join</button></div></div>`; }).join("") : '<p class="empty">No groups yet. Start the first one.</p>';
    paintBoard();
  }
  function paintBoard() {
    const posts = [...board].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const mine = posts.find((p) => p.uid === uid);
    $("#postMe").textContent = mine ? "Remove my post" : "Post me";
    $("#boardList").innerHTML = posts.length ? posts.slice(0, 12).map((p) => `<div class="bcard"><span class="mono">${esc(p.role)}</span><b>${esc(p.name)}${p.uid === uid ? " (you)" : ""}</b><p>${esc(p.course)}</p><div class="row">${p.uid !== uid && p.course && me.course && p.course.trim().toLowerCase() !== me.course.trim().toLowerCase() ? '<span class="badge badge-cross">different course</span>' : ""}${p.uid !== uid ? suLink(p.name) : ""}</div></div>`).join("") : '<p class="empty">Nobody posted yet.</p>';
  }
  function buildIntro() {
    const ta = $("#hubIntro"); if (!ta || !me) return;
    const need = ($("#hubNeed").value || "teammates from any course").trim();
    const code = myTeam ? ` Our group "${myTeam.name}" has ${myTeam.members.length}/${MAX} members, invite code ${myTeam.code}.` : "";
    ta.value = `Hi everyone 👋 I'm ${me.name} from the ${me.course} course. Forming a team for the TuteDude Internal Hackathon (24 hours, 4 Nov) and looking for ${need}.${code} Reply here or DM me, any course welcome!`;
  }
  const hubNeed = $("#hubNeed"); if (hubNeed) hubNeed.addEventListener("input", buildIntro);
  const copyHub = $("#copyHubIntro"); if (copyHub) copyHub.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#hubIntro").value); toast("Copied. Now paste it in SpeakUp."); }
    catch (_) { $("#hubIntro").focus(); $("#hubIntro").select(); toast("Select the text and copy it."); }
  });
  $("#postMe").addEventListener("click", async () => {
    if (board.find((p) => p.uid === uid)) { await store.col("board").delete(uid); return toast("Removed from the board."); }
    await store.col("board").set(uid, { uid, name: me.name, course: me.course, role: me.role, createdAt: Date.now() });
    await post("find-a-team", { sys: true, text: `${me.name} (${me.role}, ${me.course}) is looking for a team 🙋` });
    toast("Posted. Captains can find you now.");
  });
  $("#teamsList").addEventListener("click", (e) => { const b = e.target.closest("[data-join]"); if (b) joinByCode(b.dataset.join); });
  $("#createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#teamName").value.trim(); if (!name) return;
    const id = "t_" + rid(); let code = code6(); while (teams.some((t) => t.code === code)) code = code6();
    await store.col("teams").set(id, { name, tag: $("#teamTag").value.trim(), code, captain: uid, createdAt: Date.now(), needs: $$('input[name="needs"]:checked').map((i) => i.value),
      members: [{ uid, name: me.name, course: me.course, role: me.role, joinedAt: Date.now() }], plan: {} });
    await store.col("board").delete(uid).catch(() => {});
    await post("team_" + id, { sys: true, text: `${me.name} created the group. Invite code ${code} 🎉` });
    await post("find-a-team", { sys: true, text: `New group "${name}" is recruiting. Code: ${code}` });
    $("#createForm").reset(); toast(`Group created. Code: ${code}`);
  });
  $("#joinForm").addEventListener("submit", (e) => { e.preventDefault(); joinByCode($("#joinCode").value); });
  async function joinByCode(raw) {
    const code = String(raw || "").trim().toUpperCase(); const err = $("#joinError"); err.hidden = true;
    const fail = (m) => { err.textContent = m; err.hidden = false; };
    const t = teams.find((x) => x.code === code);
    if (!t) return fail("No group has that code.");
    if (t.members.length >= MAX) return fail("That group already has 5 members.");
    if (t.members.some((m) => m.uid === uid)) return fail("You're already in this group.");
    await store.col("teams").update(t.id, { members: [...t.members, { uid, name: me.name, course: me.course, role: me.role, joinedAt: Date.now() }] });
    await store.col("board").delete(uid).catch(() => {});
    await post("team_" + t.id, { sys: true, text: `${me.name} joined 👋` });
    toast(`Welcome to ${t.name}!`);
  }
  function paintTeam() {
    const t = myTeam, n = t.members.length;
    $("#tName").textContent = t.name; $("#tTag").textContent = t.tag || ""; $("#tCode").textContent = t.code;
    $("#readyFill").style.width = Math.round((n / MAX) * 100) + "%";
    $("#readyText").textContent = n >= MIN ? `${n} of ${MAX} · ready to register ✓` : `${n} of ${MAX} · need ${MIN - n} more to register`;
    const missing = ["Engineering", "Design", "Marketing"].filter((r) => !t.members.some((m) => m.role === r || m.role === "A bit of everything"));
    $("#needsText").textContent = missing.length ? `Roles not covered yet: ${missing.join(", ")}.` : "All three roles covered.";
    $("#rosterList").innerHTML = t.members.map((m) => `<li><i class="av ${avClass(m.role)}">${esc(initials(m.name))}</i><div><b>${esc(m.name)}${m.uid === uid ? " (you)" : ""}</b><small>${esc(m.course)}</small></div><span class="badge ${m.uid === t.captain ? "badge-warn" : ""}">${m.uid === t.captain ? "captain · " : ""}${esc(m.role)}</span>${m.uid !== uid ? `<span style="grid-column:2 / -1">${suLink(m.name)}</span>` : ""}</li>`).join("");
    const done = t.plan || {};
    $("#planCount").textContent = `${Object.values(done).filter(Boolean).length}/${PLAN.length}`;
    $("#planList").innerHTML = PLAN.map((p, i) => `<li class="${done[i] ? "done" : ""}"><input type="checkbox" id="plan${i}" data-plan="${i}" ${done[i] ? "checked" : ""} aria-label="${esc(p[1])}"><span class="hr">${p[0]}</span><label for="plan${i}"><b>${esc(p[1])}</b><small>${esc(p[2])}</small></label></li>`).join("");
  }
  function paintGroupMini() {
    const el = $("#groupMini");
    if (!myTeam) { el.innerHTML = `<p class="kicker">Your group</p><h3 class="h3">No group yet</h3><p class="note">Groups of 3 to 5. Create one or join with a code.</p><div class="row"><button class="btn btn-sm" type="button" data-goto-tab="group">Make my group</button><button class="btn btn-ghost btn-sm" type="button" data-goto-room="find-a-team">#find-a-team</button></div>`; return; }
    const t = myTeam;
    el.innerHTML = `<div class="group-mini"><p class="kicker">Your group</p><h3 class="h3">${esc(t.name)}</h3><div class="avs">${t.members.map((m) => `<i class="av ${avClass(m.role)}" title="${esc(m.name)}">${esc(initials(m.name))}</i>`).join("")}</div>
      <p class="note">${t.members.length}/${MAX} members · code <span class="mono">${esc(t.code)}</span></p><div class="row"><button class="btn btn-sm" type="button" data-goto-room="team">Group room</button><button class="btn btn-ghost btn-sm" type="button" data-goto-tab="group">Manage</button></div></div>`;
  }
  $("#copyCode").addEventListener("click", async () => { try { await navigator.clipboard.writeText(myTeam.code); toast("Code copied: " + myTeam.code); } catch (_) { toast("Code: " + myTeam.code); } });
  $("#leaveTeam").addEventListener("click", async () => {
    const t = myTeam; if (!t) return; const b = $("#leaveTeam");
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to confirm"; setTimeout(() => { b.dataset.confirm = ""; b.textContent = "Leave group"; }, 3000); return; }
    const members = t.members.filter((m) => m.uid !== uid);
    if (!members.length) await store.col("teams").delete(t.id); else await store.col("teams").update(t.id, { members, captain: t.captain === uid ? members[0].uid : t.captain });
    toast("You left the group.");
  });
  $("#planList").addEventListener("change", async (e) => {
    const i = e.target.dataset.plan; if (i == null || !myTeam) return;
    await store.col("teams").update(myTeam.id, { plan: { ...(myTeam.plan || {}), [i]: e.target.checked } });
    if (e.target.checked) await post("team_" + myTeam.id, { sys: true, text: `✅ ${me.name} ticked "${PLAN[i][1]}"` });
  });

  /* ---------------- leaderboard & stats ---------------- */
  async function loadBoard() {
    profiles = await store.col("profiles").list();
    const top = [...profiles].sort((a, b) => (b.points || 0) - (a.points || 0));
    const row = (p, i) => `<li class="${p.uid === uid ? "me" : ""}"><span class="rank">${i + 1}</span><i class="av ${avClass(p.role)}">${esc(initials(p.name))}</i><div><b>${esc(p.name)}${p.uid === uid ? " (you)" : ""}</b><small>${esc(p.course || "")} ${p.uid !== uid ? suLink(p.name) : ""}</small></div><span class="pts">${p.points || 0} pts · 🔥${p.streak || 0}</span></li>`;
    $("#lbList").innerHTML = top.slice(0, 25).map(row).join("") || '<p class="empty">No points yet. Be first.</p>';
    $("#miniBoard").innerHTML = top.slice(0, 5).map((p, i) => `<li><span class="rank">${i + 1}</span><span>${esc(p.name)}</span><span class="pts">${p.points || 0}</span></li>`).join("") || '<p class="empty">Nobody on the board yet.</p>';
    const byUid = Object.fromEntries(profiles.map((p) => [p.uid, p.points || 0]));
    const tt = teams.map((t) => ({ name: t.name, pts: t.members.reduce((a, m) => a + (byUid[m.uid] || 0), 0), n: t.members.length })).sort((a, b) => b.pts - a.pts);
    $("#lbTeams").innerHTML = tt.slice(0, 10).map((t, i) => `<li><span class="rank">${i + 1}</span><div><b>${esc(t.name)}</b><small>${t.n} members</small></div><span class="pts">${t.pts} pts</span></li>`).join("") || '<p class="empty">No groups yet.</p>';
  }
  $("#refreshBoard").addEventListener("click", loadBoard);
  function paintStats() {
    const today = istDay();
    const todays = allSessions().filter((s) => istDay(Date.parse(s.when)) === today).length;
    const goingToday = new Set(); sessions.forEach((s) => { if (istDay(Date.parse(s.when)) === today) (s.going || []).forEach((u) => goingToday.add(u)); });
    $("#stats").innerHTML = [[onlineN || 1, "online now"], [todays, "sessions today"], [goingToday.size, "going today"], [teams.length, "groups formed"]].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");
  }

  /* home links: on claude.ai the main page is a separate artifact */
  const HOME = document.body.dataset.home;
  if (HOME) $$("[data-home-link]").forEach((a) => { a.href = HOME + (a.dataset.homeLink === "register" ? "#register" : ""); });

  boot();
})();
