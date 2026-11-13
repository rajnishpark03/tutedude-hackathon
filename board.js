/* ============================================================
   TuteDude Buildathon: Team Board
   Register → placed in a team automatically (first come, first served, one person per skill)
   → agree to TuteDude Sessions (unlocks teammates' WhatsApp) → team complete → problem statement.

   Two backends with the same interface:
   - demo (config.supabase = null): sample teams, data stays in this browser, and sample
          people keep registering so you can watch teams fill up.
   - live (config.supabase set): Supabase. Every rule is checked in the database
          functions in supabase.sql; this file only calls them.
   ============================================================ */
(function () {
  "use strict";
  const C = window.BUILDATHON || {};
  const DOMAINS = C.domains || [];
  const DOM = Object.fromEntries(DOMAINS.map((d) => [d.key, d]));
  const MAX = C.maxTeamSize || 4, MIN = C.minTeamSize || 2;
  // known straight from config, so the page can react before the backend has loaded
  const LIVE = !!(C.supabase && C.supabase.url);
  const LOGIN = LIVE ? (C.login === "anonymous" ? "anonymous" : "google") : "demo";
  const DEADLINE = Date.parse(C.teamDeadline);
  const locked = () => !isNaN(DEADLINE) && Date.now() > DEADLINE;
  // the problem statement appears on team pages at REVEAL
  const REVEAL = Date.parse(C.buildDay);
  const revealed = () => !isNaN(REVEAL) && Date.now() >= REVEAL;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const first = (n) => clean(n).split(" ")[0] || "there";
  const label = (k) => (DOM[k] ? DOM[k].label : "Other skill");
  const icon = (k) => (DOM[k] ? DOM[k].icon : "✨");
  // "a designer", "a video editor", "someone with another skill" (for sentences)
  const aSkill = (k) => (k === "other" ? "someone with another skill" : DOM[k] ? "a " + DOM[k].short.toLowerCase() : "someone");
  const initials = (n) => clean(n).split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(u || "") ? u : "#");
  const avHtml = (p, cls) => (p.avatar && /^https:\/\//.test(p.avatar)
    ? `<img class="av ${cls || ""}" src="${esc(p.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<i class="av av-${esc(p.domain)} ${cls || ""}" aria-hidden="true">${esc(initials(p.name))}</i>`);
  const plink = (id, name) => `<button class="plink" type="button" data-act="profile" data-person="${esc(id)}">${esc(name)}</button>`;
  const dchip = (k) => `<span class="dchip d-${esc(k)}">${icon(k)} ${esc(label(k))}</span>`;
  const missing = (team) => { const have = new Set(team.members.map((m) => m.domain)); return DOMAINS.map((d) => d.key).filter((k) => !have.has(k)); };
  // same rules as bd_phone / bd_phone_ok / bd_session_link_ok / bd_team_name_ok in supabase.sql
  const normPhone = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^0+/, ""); return d.length === 10 ? "91" + d : d; };
  const phoneOk = (ph) => /^[0-9]{11,13}$/.test(ph) && (!/^91/.test(ph) || /^91[6-9][0-9]{9}$/.test(ph));
  const teamNameOk = (nm) => !/(tutedude|official|admin|organi[sz]er|moderator|support)/i.test(nm) &&
    !/(fuck|shit|bitch|chutiya|chutia|madarchod|bhenchod|behenchod|bsdk|randi|gandu|lund|lauda|loda|harami)/i.test(nm);
  const REMOVE_AFTER = 6 * 3600e3; // a teammate can be removed only after 6 hours in the team
  const waLink = (phone, text) => { const d = normPhone(phone); return d ? "https://wa.me/" + d + (text ? "?text=" + encodeURIComponent(text) : "") : ""; };
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  const fail = (msg) => { throw new Error(msg); };
  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
  const fmtTime = (ms) => {
    const d = new Date(ms), now = new Date();
    const t = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " + t;
  };
  const store = (kind) => ({
    get(k) { try { return window[kind].getItem(k); } catch (_) { return null; } },
    set(k, v) { try { window[kind].setItem(k, v); } catch (_) {} },
    del(k) { try { window[kind].removeItem(k); } catch (_) {} }
  });
  const ls = store("localStorage"), ss = store("sessionStorage");

  /* ============================================================
     DEMO BACKEND: same rules as supabase.sql, kept in this browser
     ============================================================ */
  function demoBackend() {
    const KEY = "tdb-demo-v6", ME = KEY + ":me";
    let db = null;
    try { db = JSON.parse(ls.get(KEY)); } catch (_) {}
    if (!db || !db.teamSeq) db = seed();
    const save = () => ls.set(KEY, JSON.stringify(db));
    save();

    const listeners = new Set(), noteListeners = new Set();
    let queued = false;
    function changed() {
      save();
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; listeners.forEach((f) => f()); bots(); }, 0);
    }
    const myId = () => ls.get(ME);
    const teamOf = (pid) => (db.members[pid] ? db.members[pid].teamId : null);
    const membersOf = (tid) => Object.keys(db.members).filter((p) => db.members[p].teamId === tid).sort((a, b) => db.members[a].joinedAt - db.members[b].joinedAt);
    const leaderTeam = (uid) => Object.values(db.teams).find((t) => t.leaderId === uid);
    const open = () => { if (locked()) fail("Teams are locked now."); };
    const say = (tid, body) => db.messages.push({ id: ++db.msgSeq, teamId: tid, personId: null, kind: "system", body, at: Date.now() });
    const notify = (pid, title, body, tag) => {
      if (pid !== myId()) return; // only the demo user has a "phone"
      const n = { title, body: body.slice(0, 140), tag };
      setTimeout(() => noteListeners.forEach((f) => f(n)), 0);
    };
    const notifyTeam = (tid, except, title, body, tag) => membersOf(tid).forEach((p) => { if (p !== except) notify(p, title, body, tag); });
    let clock = 0;
    const now = () => Math.max(Date.now(), ++clock); // strictly increasing, keeps "first come" order exact
    function complete(tid) {
      const t = db.teams[tid];
      if (!t || t.complete) return;
      t.complete = true;
      say(tid, "Team is complete! 🎉 Next step: the leader creates a TuteDude session.");
      notifyTeam(tid, null, "Your team is complete! 🎉", "Next step: join your TuteDude session.", "team-" + tid);
    }
    function hasSpot(t, d) {
      const ms = membersOf(t.id);
      return !t.complete && ms.length < MAX && !ms.some((m) => db.people[m].domain === d);
    }
    // join one chosen team if it still has a spot for this skill (same as bd_join in supabase.sql)
    function joinTeam(pid, tid) {
      const p = db.people[pid], t = db.teams[tid];
      if (!t || !hasSpot(t, p.domain)) return null;
      db.members[pid] = { teamId: t.id, joinedAt: now() };
      say(t.id, `${p.name} (${label(p.domain)}) joined the team 👋`);
      notifyTeam(t.id, pid, `${t.name}: new teammate`, `${p.name} (${label(p.domain)}) joined your team. Say hi on WhatsApp!`, "team-" + t.id);
      if (membersOf(t.id).length >= MAX) complete(t.id);
      return t.id;
    }
    function openTeams(d) {
      if (locked()) return [];
      return Object.values(db.teams).filter((t) => hasSpot(t, d)).sort((a, b) => a.createdAt - b.createdAt).slice(0, 30).map((t) => ({ id: t.id, name: t.name }));
    }
    // automatic placement (same as bd_assign in supabase.sql)
    function assign(pid, exclude) {
      const p = db.people[pid];
      const t = Object.values(db.teams)
        .filter((x) => !x.complete && x.id !== exclude && membersOf(x.id).length < MAX && !membersOf(x.id).some((m) => db.people[m].domain === p.domain))
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!t) {
        let name;
        do { name = "Team " + ++db.teamSeq; } while (Object.values(db.teams).some((x) => x.name.toLowerCase() === name.toLowerCase()));
        const id = "t_" + rid();
        db.teams[id] = { id, name, leaderId: pid, complete: false, createdAt: now() };
        db.members[pid] = { teamId: id, joinedAt: now() };
        say(id, `${p.name} started this team. New people are added automatically as they register. Leader: give the team a name!`);
        return id;
      }
      db.members[pid] = { teamId: t.id, joinedAt: now() };
      say(t.id, `${p.name} (${label(p.domain)}) joined the team 👋`);
      notifyTeam(t.id, pid, `${t.name}: new teammate`, `${p.name} (${label(p.domain)}) joined your team. Say hi!`, "team-" + t.id);
      if (membersOf(t.id).length >= MAX) complete(t.id);
      return t.id;
    }
    function leaveTeam(pid) {
      const tid = teamOf(pid);
      if (!tid) return null;
      delete db.members[pid];
      const t = db.teams[tid];
      if (t.leaderId === pid) {
        const rest = membersOf(tid);
        if (!rest.length) { delete db.teams[tid]; db.messages = db.messages.filter((m) => m.teamId !== tid); return tid; }
        t.leaderId = rest[0];
      }
      t.complete = false;
      return tid;
    }

    const ops = {
      saveProfile(uid, p) {
        open();
        const old = db.people[uid], inTeam = !!teamOf(uid);
        const phone = normPhone(p.phone), email = String(p.email || "").trim().toLowerCase(), name = clean(p.name);
        if (name.length < 2 || name.length > 40) fail("Please write your name.");
        if (!DOM[p.domain]) fail("Pick what you do.");
        if (!phoneOk(phone)) fail("Please write your WhatsApp number (10 digits).");
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) fail("Please write a valid email address.");
        if ((p.skill || "").length > 80) fail("Keep the line about you under 80 characters.");
        if (p.link && (!/^https?:\/\/\S+$/i.test(p.link) || p.link.length > 200)) fail("Paste the full link, starting with https://");
        if (!old && !p.consent) fail("Please confirm you're a TuteDude student.");
        const others = Object.values(db.people).filter((x) => x.id !== uid);
        if (others.some((x) => x.phone && x.phone.slice(-10) === phone.slice(-10))) fail("This WhatsApp number is already registered. Open the site on the phone or browser you registered with, or message the organisers on the TuteDude Community.");
        if (others.some((x) => (x.email || "").toLowerCase() === email)) fail("This email is already registered. Open the site on the phone or browser you registered with, or message the organisers on the TuteDude Community.");
        if (inTeam && old && old.domain !== p.domain) fail("You can't change your skill after you are placed in a team.");
        db.people[uid] = { id: uid, name, domain: p.domain, skill: p.skill || "", link: p.link || "", phone, email, avatar: "", createdAt: old ? old.createdAt : now(), sessionOkAt: old ? old.sessionOkAt : null };
        if (inTeam) return { team: db.teams[teamOf(uid)].name, gotChoice: null };
        let tid = null, got = null;
        if (p.team) { tid = joinTeam(uid, p.team); got = !!tid; }
        if (!tid) tid = assign(uid, null);
        return { team: db.teams[tid].name, gotChoice: got };
      },
      // "I'll discuss our product on a TuteDude session" (agree_session in supabase.sql)
      agreeSession(uid) {
        const p = db.people[uid];
        if (!p) fail("Register first.");
        if (p.sessionOkAt) return;
        p.sessionOkAt = now();
        const tid = teamOf(uid);
        if (tid) say(tid, `${p.name} agreed to discuss the product on a TuteDude session.`);
      },
      rename(uid, name) {
        open();
        const t = leaderTeam(uid);
        if (!t) fail("Only the team leader can rename the team.");
        if (name.length < 2 || name.length > 40) fail("Give your team a name (2 to 40 letters).");
        if (!teamNameOk(name)) fail("Please pick a different team name.");
        if (Object.values(db.teams).some((x) => x.id !== t.id && x.name.toLowerCase() === name.toLowerCase())) fail("That team name is taken. Try another one.");
        t.name = name;
        say(t.id, `The team is now called ${name}.`);
      },
      completeTeam(uid) {
        open();
        const t = leaderTeam(uid);
        if (!t) fail("Only the team leader can do this.");
        if (membersOf(t.id).length < MIN) fail(`You need at least ${MIN} people in the team.`);
        complete(t.id);
      },
      remove(uid, pid) {
        open();
        const t = leaderTeam(uid);
        if (!t) fail("Only the team leader can remove people.");
        if (pid === uid) fail("You can't remove yourself from your team.");
        if (teamOf(pid) !== t.id) return;
        if ((t.removals || 0) >= 2) fail("Your team has already used its 2 removals. Message the organisers on the TuteDude Community if you need help.");
        if (Date.now() - db.members[pid].joinedAt < REMOVE_AFTER) fail("Give new teammates 6 hours to reply on WhatsApp before removing them.");
        t.removals = (t.removals || 0) + 1;
        leaveTeam(pid);
        say(t.id, `${db.people[pid].name} was moved to another team. The next person with that skill joins here.`);
        const nt = assign(pid, t.id);
        notify(pid, "Team update", `You were moved to ${db.teams[nt].name}. Say hi to your new team on WhatsApp!`, "team-" + nt);
      },
      // same WhatsApp number + email moves the registration to this device (reclaim_profile in supabase.sql)
      reclaim(uid, phone, email) {
        if (db.people[uid]) fail("You are already registered on this device.");
        const ph = normPhone(phone), em = String(email || "").trim().toLowerCase();
        const old = Object.values(db.people).find((x) => x.phone && x.phone.slice(-10) === ph.slice(-10) && (x.email || "").toLowerCase() === em && em);
        if (!old) fail("No registration found with that WhatsApp number and email. Check both, or register as new.");
        db.people[uid] = Object.assign({}, old, { id: uid });
        if (db.members[old.id]) { db.members[uid] = db.members[old.id]; delete db.members[old.id]; }
        Object.values(db.teams).forEach((t) => { if (t.leaderId === old.id) t.leaderId = uid; });
        delete db.people[old.id];
        const tid = teamOf(uid);
        return { team: tid ? db.teams[tid].name : null };
      },
      ensureTeam(uid) {
        open();
        if (!db.people[uid]) fail("Register first.");
        return db.teams[teamOf(uid) || assign(uid, null)].name;
      }
    };

    const pub =(p) => ({ id: p.id, name: p.name, domain: p.domain, skill: p.skill, link: p.link, avatar: p.avatar || "" });
    function board() {
      const all = Object.values(db.teams);
      const forming = all.filter((t) => !t.complete).sort((a, b) => a.createdAt - b.createdAt);
      const done = all.filter((t) => t.complete).sort((a, b) => b.createdAt - a.createdAt);
      const count = {};
      if (!locked()) forming.forEach((t) => {
        const ms = membersOf(t.id);
        if (ms.length >= MAX) return;
        const have = new Set(ms.map((p) => db.people[p].domain));
        DOMAINS.forEach((d) => { if (!have.has(d.key)) count[d.key] = (count[d.key] || 0) + 1; });
      });
      const needs = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
      const dayAgo = Date.now() - 864e5;
      return {
        stats: { people: Object.keys(db.people).length, today: Object.values(db.people).filter((p) => p.createdAt > dayAgo).length, needs }
      };
    }
    function meState(uid) {
      const p = uid && db.people[uid];
      if (!p) return { me: null, team: null };
      const tid = teamOf(uid), t = tid && db.teams[tid];
      const ms = t ? membersOf(t.id) : [], agreed = !!p.sessionOkAt;
      return {
        me: { id: uid, name: p.name, domain: p.domain, skill: p.skill, link: p.link, avatar: "", phone: p.phone, email: p.email || "", sessionOk: agreed },
        team: t ? {
          id: t.id, name: t.name, leaderId: t.leaderId, complete: !!t.complete, whatsappLocked: !agreed,
          problem: agreed && ms.length >= MIN && revealed() ? { text: "Demo problem statement: build a study planner for TuteDude learners (the product, its website and a 60-second promo video).", link: "" } : null,
          removalsLeft: Math.max(0, 2 - (t.removals || 0)),
          // same as get_me: teammates' numbers only after I agreed to the TuteDude session
          members: ms.map((m) => Object.assign(pub(db.people[m]), { phone: m === uid || agreed ? db.people[m].phone || "" : "", joinedAt: db.members[m].joinedAt }))
        } : null
      };
    }
    /* bots: after you register, a new sample person registers every few seconds (so you can
       watch teams fill up) */
    let arrivalTimer = 0;
    function bots() {
      const uid = myId();
      if (!uid || !db.people[uid]) return;
      // next sample registration
      if (!arrivalTimer && db.arrivals.length && !locked()) {
        arrivalTimer = setTimeout(() => {
          arrivalTimer = 0;
          const [id, name, domain, skill] = db.arrivals.shift();
          db.people[id] = { id, name, domain, skill, link: "", phone: "90000" + String(10000 + Math.floor(Math.random() * 89999)), email: id + "@example.com", avatar: "", createdAt: now() };
          assign(id, null);
          changed();
        }, 5000);
      }
      save();
    }
    const copy = (x) => JSON.parse(JSON.stringify(x));
    const run = async (fn) => { const r = fn(); changed(); return r; };
    setTimeout(bots, 0);
    return {
      mode: "demo",
      login: "demo",
      onAuth(cb) { const u = myId(); cb(u ? { id: u, email: "", name: "" } : null); },
      async ensureUser() { let u = myId(); if (!u) { u = "me_" + rid(); ls.set(ME, u); } return { id: u, email: "", name: "" }; },
      async signIn() {},
      async signOut() {},
      async board() { return copy(board()); },
      async me() { return copy(meState(myId())); },
      async openTeams(d) { return copy(openTeams(d)); },
      saveProfile: (p) => run(() => ops.saveProfile(myId(), p)),
      reclaim: (phone, email) => run(() => ops.reclaim(myId(), phone, email)),
      ensureTeam: () => run(() => ops.ensureTeam(myId())),
      rename: (name) => run(() => ops.rename(myId(), name)),
      agreeSession: () => run(() => ops.agreeSession(myId())),
      completeTeam: () => run(() => ops.completeTeam(myId())),
      remove: (pid) => run(() => ops.remove(myId(), pid)),
      async savePush() {},
      live(_me, onNote) {
        noteListeners.add(onNote);
        return () => { noteListeners.delete(onNote); };
      },
      liveOk: () => true,
      onChange(f) { listeners.add(f); },
      reset() { ls.del(KEY); ls.del(ME); location.reload(); }
    };
  }

  function seed() {
    const t0 = Date.now() - 6 * 3600e3, min = 6e4;
    const P = {
      bot_1: ["Aditya Rao", "design", "Branding, UI kits", "https://dribbble.com/"],
      bot_2: ["Manav Joshi", "dev", "Full stack MERN", "https://github.com/"],
      bot_3: ["Tanvi Kulkarni", "marketing", "Performance marketing", ""],
      bot_4: ["Farhan Ali", "video", "YouTube editing, thumbnails", "https://www.youtube.com/"],
      bot_5: ["Arjun Mehta", "dev", "React + Node, 2 side projects live", "https://github.com/"],
      bot_6: ["Riya Sharma", "design", "Figma, redesigned 3 apps", "https://www.behance.net/"],
      bot_7: ["Neha Gupta", "dev", "Python, Django, APIs", "https://github.com/"],
      bot_8: ["Rohit Verma", "dev", "Flutter apps", ""]
    };
    const db = { people: {}, teams: {}, members: {}, messages: [], msgSeq: 0, teamSeq: 4, greeted: {}, replies: {}, arrivals: [] };
    Object.entries(P).forEach(([id, [name, domain, skill, link]], i) => {
      db.people[id] = { id, name, domain, skill, link, phone: "90000" + String(10001 + i), avatar: "", createdAt: t0 + i * 20 * min };
    });
    [
      ["t_1", "Launchpad", ["bot_1", "bot_2", "bot_3", "bot_4"], true],
      ["t_2", "Night Owls", ["bot_5", "bot_6"], false],
      ["t_3", "Team 3", ["bot_7"], false],
      ["t_4", "Team 4", ["bot_8"], false]
    ].forEach(([id, name, uids, done], i) => {
      const at = t0 + i * 30 * min;
      db.teams[id] = { id, name, leaderId: uids[0], complete: done, createdAt: at };
      uids.forEach((u, j) => { db.members[u] = { teamId: id, joinedAt: at + j * min }; });
      db.messages.push({ id: ++db.msgSeq, teamId: id, personId: null, kind: "system", body: db.people[uids[0]].name + " started this team.", at });
    });
    // sample people who register after you, one every few seconds
    db.arrivals = [
      ["bot_10", "Karan Patel", "video", "Premiere Pro, reels"],
      ["bot_11", "Ananya Iyer", "design", "UX research, wireframes"],
      ["bot_12", "Sana Khan", "marketing", "Instagram growth, ad copy"],
      ["bot_13", "Ishita Das", "video", "After Effects, motion graphics"],
      ["bot_14", "Kabir Malhotra", "design", "Product design, prototyping"],
      ["bot_15", "Priya Nair", "marketing", "Copywriting, SEO"],
      ["bot_16", "Vikram Singh", "other", "Data analysis, Power BI"],
      ["bot_17", "Zoya Shaikh", "video", "CapCut, short-form video"],
      ["bot_18", "Dev Bansal", "design", "Illustration, Canva"],
      ["bot_19", "Meera Pillai", "marketing", "Content strategy, LinkedIn"],
      ["bot_20", "Sneha Reddy", "dev", "Java, Spring Boot"],
      ["bot_21", "Yash Agarwal", "dev", "Next.js, Supabase"]
    ];
    return db;
  }

  /* ============================================================
     LIVE BACKEND: Supabase (functions defined in supabase.sql)
     ============================================================ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    });
  }
  async function supabaseBackend(cfg, login) {
    // vendor/supabase.js ships with the site (loaded in index.html); the CDN is only a fallback
    if (!(window.supabase && window.supabase.createClient)) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js");
    const sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } });
    // network blips, timeouts and lock waits under heavy load are retried once, then explained in plain words
    const transient = (m) => /timeout|timed out|deadlock|could not serialize|fetch|network|load failed|503|502|504/i.test(m || "");
    const rpc = async (fn, args, tries = 2) => {
      let res;
      try { res = await sb.rpc(fn, args || {}); }
      catch (e) { res = { error: { message: (e && e.message) || "network error" } }; }
      if (!res.error) return res.data;
      const msg = res.error.message || "";
      if (transient(msg) && tries > 1) { await new Promise((r) => setTimeout(r, 1200)); return rpc(fn, args, tries - 1); }
      if (transient(msg)) fail("The site is busy or your connection dropped. Please try again in a moment.");
      fail(msg || "Something went wrong. Try again.");
    };
    const friendlyAuth = (m) => (/rate limit|too many/i.test(m || "")
      ? "Too many sign-ups from your network right now. Please try again in a minute (or switch between Wi-Fi and mobile data)."
      : m || "Couldn't start. Please try again.");
    const toUser = (u) => (u ? { id: u.id, email: u.email || "", name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "" } : null);
    return {
      mode: "live",
      login,
      onAuth(cb) {
        let last;
        sb.auth.onAuthStateChange((_event, session) => {
          const u = toUser(session && session.user);
          const id = u ? u.id : null;
          if (id === last) return;
          last = id;
          if (u && /[?&]code=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
          setTimeout(() => cb(u), 0); // don't call Supabase inside this callback
        });
      },
      async ensureUser() {
        const { data } = await sb.auth.getSession();
        if (data && data.session) return toUser(data.session.user);
        if (login !== "anonymous") fail("Please sign in first.");
        let r;
        try { r = await sb.auth.signInAnonymously(); } catch (e) { fail("Your connection dropped. Please try again."); }
        if (r.error) fail(friendlyAuth(r.error.message));
        return toUser(r.data.user);
      },
      async signIn() {
        const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
        if (error) fail(error.message);
      },
      async signOut() { await sb.auth.signOut(); },
      board: () => rpc("get_board"),
      me: () => rpc("get_me"),
      openTeams: (d) => rpc("open_teams", { p_domain: d }),
      saveProfile: (p) => rpc("save_profile", { p_name: p.name, p_domain: p.domain, p_phone: p.phone, p_email: p.email, p_skill: p.skill, p_link: p.link, p_team: p.team || null, p_consent: !!p.consent }),
      reclaim: (phone, email) => rpc("reclaim_profile", { p_phone: phone, p_email: email }),
      ensureTeam: () => rpc("ensure_team"),
      rename: (name) => rpc("rename_team", { p_name: name }),
      agreeSession: () => rpc("agree_session"),
      completeTeam: () => rpc("complete_team"),
      remove: (pid) => rpc("remove_member", { p_person: pid }),
      savePush: (endpoint, p256dh, auth) => rpc("save_push", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }),
      // private Broadcast channel "user:<id>" for my notifications
      live(me, onNote) {
        const chans = [];
        let stopped = false;
        (async () => {
          const { data } = await sb.auth.getSession();
          if (stopped || !data || !data.session) return;
          sb.realtime.setAuth(data.session.access_token);
          const sub = (topic, event, cb) => {
            liveStatus[topic] = "connecting";
            const ch = sb.channel(topic, { config: { private: true } })
              .on("broadcast", { event }, (m) => cb(m.payload || {}))
              .subscribe((status) => { liveStatus[topic] = status; });
            chans.push([topic, ch]);
          };
          if (me) sub("user:" + me, "note", onNote);
        })().catch((e) => console.warn("live", e));
        return () => { stopped = true; chans.forEach(([topic, c]) => { delete liveStatus[topic]; sb.removeChannel(c); }); };
      },
      liveOk: (topic) => liveStatus[topic] === "SUBSCRIBED"
    };
  }
  const liveStatus = {};

  /* ============================================================
     APP STATE + REFRESH
     ============================================================ */
  const S = { be: null, user: null, me: null, team: null, stats: null, loaded: false, loadErr: false };
  const REG_FLAG = "tdb-register-after-login";
  const amLeader = () => !!(S.team && S.me && S.team.leaderId === S.me.id);
  // buttons work right away; anything that needs the backend waits here until it has loaded
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });
  async function whenReady() {
    if (S.be) return;
    const slow = setTimeout(() => toast("Connecting… one moment."), 1500);
    try {
      await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error("Couldn't connect. Check your internet and refresh the page.")), 20000))]);
    } finally { clearTimeout(slow); }
  }

  let busy = null, again = null;
  async function refresh(opts) {
    opts = Object.assign({ board: true }, opts);
    if (busy) { again = { board: !!((again && again.board) || opts.board) }; return busy; }
    busy = (async () => {
      try {
        const [b, m] = await Promise.all([opts.board ? S.be.board() : null, S.user ? S.be.me() : null]);
        if (b) { S.stats = b.stats; S.loaded = true; }
        S.loadErr = false;
        applyMe(m);
      } catch (e) {
        console.warn(e);
        S.loadErr = true;
      }
      render();
    })();
    await busy;
    busy = null;
    if (again) { const o = again; again = null; return refresh(o); }
  }

  function applyMe(m) {
    S.me = (m && m.me) || null;
    S.team = (m && m.team) || null;
    syncLive();
    // the TuteDude Sessions brief + consent comes first (WhatsApp unlocks after it): once when they join,
    // once more when the team completes. Never on top of a form someone is filling in.
    if (S.me && S.team && !S.me.sessionOk) {
      autoSession("tdb-session:" + S.team.id);
      if (S.team.complete) autoSession("tdb-session-done:" + S.team.id);
    }
    // registered but without a team (e.g. an organiser removed theirs): place them again
    if (S.me && !S.team && !locked() && !ensuring) {
      ensuring = true;
      S.be.ensureTeam().then(() => refresh()).catch((e) => console.warn(e)).finally(() => { ensuring = false; });
    }
  }
  let ensuring = false;
  function autoSession(key) {
    if (ls.get(key)) return;
    setTimeout(() => {
      if (ls.get(key) || $("dialog[open]")) return; // try again after the next refresh
      ls.set(key, "1");
      openSession();
    }, 500);
  }

  async function onUser(u) {
    S.user = u;
    if (!u) Object.assign(S, { me: null, team: null });
    await refresh();
    if (u && ss.get(REG_FLAG)) {
      ss.del(REG_FLAG);
      if (S.me) toast(`Welcome back, ${first(S.me.name)}!`);
      else openRegister();
    }
    if (S.me && LIVE && pushState() === "on") subscribePush().catch((e) => console.warn("push", e));
  }

  /* live updates: my notifications */
  let liveOff = null, liveKey = "";
  function syncLive() {
    const key = S.me ? S.me.id : "";
    if (key === liveKey) return;
    liveKey = key;
    if (liveOff) { liveOff(); liveOff = null; }
    if (S.me) liveOff = S.be.live(S.me.id, onNote);
  }

  function onNote(n) {
    refresh();
    if (document.visibilityState === "visible") toast(n.body ? `${n.title} · ${n.body}` : n.title);
    else if (!LIVE) localNotify(n); // live mode: the service worker shows it
  }

  /* ============================================================
     NOTIFICATIONS (phone + laptop)
     ============================================================ */
  const PUSH_KEY = "tdb-push";
  let swReg = null;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  function pushState() {
    if (isIOS() && !isStandalone()) return "ios-install";
    if (!("serviceWorker" in navigator) || !("Notification" in window) || !/^https?:$/.test(location.protocol)) return "unsupported";
    if (LIVE && (!("PushManager" in window) || !C.vapidPublicKey)) return "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (Notification.permission === "granted" && ls.get(PUSH_KEY) === "on") return "on";
    return "off";
  }
  function b64ToBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  async function subscribePush() {
    const reg = swReg || (await navigator.serviceWorker.ready);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(C.vapidPublicKey) });
    const j = sub.toJSON();
    await S.be.savePush(j.endpoint, j.keys.p256dh, j.keys.auth);
  }
  async function enablePush() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { render(); fail("Notifications are blocked. Allow them for this site in your browser settings."); }
    if (LIVE) await subscribePush();
    ls.set(PUSH_KEY, "on");
  }
  async function localNotify(n) {
    if (pushState() !== "on") return;
    try {
      const reg = swReg || (await navigator.serviceWorker.getRegistration());
      if (reg) reg.showNotification(n.title, { body: n.body || "", tag: n.tag || undefined, renotify: !!n.tag, icon: "icon-192.png", data: { url: "#board" } });
    } catch (e) { console.warn(e); }
  }
  function notifyBarHtml() {
    if (!S.me || ss.get("tdb-notify-later")) return "";
    const st = pushState();
    if (st === "off") return `<div class="notify-bar"><span>🔔 <b>Turn on notifications</b> so you know when someone joins your team and when the problem statement is out.</span>
      <span class="row-btns"><button class="btn btn-sm" type="button" data-act="push-on">Turn on</button><button class="link" type="button" data-act="push-later">Not now</button></span></div>`;
    if (st === "ios-install") return `<div class="notify-bar"><span>🔔 <b>Notifications on iPhone:</b> tap <b>Share</b> → <b>Add to Home Screen</b>, then open Buildathon from your home screen and turn them on.</span>
      <span class="row-btns"><button class="link" type="button" data-act="push-later">Got it</button></span></div>`;
    if (st === "denied") return `<div class="notify-bar notify-off"><span>🔕 Notifications are blocked. To get them, allow notifications for this site in your browser settings.</span>
      <span class="row-btns"><button class="link" type="button" data-act="push-later">OK</button></span></div>`;
    return "";
  }

  /* ============================================================
     RENDER
     ============================================================ */
  const cache = {};
  function put(id, html) {
    if (cache[id] === html) return;
    cache[id] = html;
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }
  let raf = 0;
  function render() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }
  function draw() {
    $("#lockBar").hidden = !locked();
    $$("[data-reg-label]").forEach((b) => { b.textContent = S.me ? "My team" : locked() ? "Registration closed" : "Register"; });
    $$(".hero [data-act=register]").forEach((b) => { b.textContent = S.me ? "Go to my team" : locked() ? "Registration closed" : "Register now, get your team"; });
    $("#boardTitle").textContent = S.me ? "Your team" : "Teams are filling up";
    const st = S.stats;
    put("stats", st ? `<b>${st.people}</b> registered${st.today ? ` · <b class="hot">+${st.today}</b> in the last 24 h` : ""}` : "");
    const needs = needsHtml();
    put("needsBar", S.me ? "" : needs);
    put("notifyBar", notifyBarHtml());
    put("mePanel", meHtml());
    renderTicker();
    updateSticky();
  }

  // sticky bottom bar, shown once the hero has scrolled away (hidden next to the team panel and while a
  // pop-up is open): "Register now" for visitors, "Unlock your teammates' WhatsApp" until they agree
  const seen = { hero: true, panel: false };
  function stickyMode() {
    if (!S.me) return locked() ? "" : "register";
    return S.team && !S.me.sessionOk ? "session" : "";
  }
  function updateSticky() {
    const bar = $("#stickyCta");
    if (!bar) return;
    const mode = stickyMode();
    if ((bar.dataset.mode || "") !== mode) {
      bar.dataset.mode = mode;
      const btn = $(".sticky-btn", bar);
      btn.dataset.act = mode === "session" ? "goto-session" : "register";
      btn.textContent = mode === "session" ? "Unlock your teammates' WhatsApp" : "Register now, get your team";
    }
    const show = !!mode && !seen.hero && !seen.panel && !$("dialog[open]");
    bar.classList.toggle("show", show);
    bar.setAttribute("aria-hidden", String(!show));
    $(".sticky-btn", bar).tabIndex = show ? 0 : -1;
    document.body.classList.toggle("has-sticky", show);
  }

  // live ticker under the hero: team numbers + what to do (no names)
  // It stays invisible (its height is reserved) until the numbers arrive, then fades in: no jump on refresh.
  let tickerFallback = false;
  function renderTicker() {
    const st = S.stats;
    if (!st && !tickerFallback) return;
    const items = [`🚀 TuteDude Buildathon · Win <b>${esc(C.prize || "₹20,000")}</b>`];
    if (st) {
      items.push(`👥 <b>${st.people}</b> registered`);
      if (st.today) items.push(`🔥 <b>+${st.today}</b> joined in the last 24 hours`);
      if (!locked()) needList().slice(0, 3).forEach((k) => items.push(`${icon(k)} Teams need <b>${esc(aSkill(k))}</b>`));
    }
    if (!locked()) items.push("📲 Register → pick your team → connect on WhatsApp", `⏰ Teams lock ${esc(lockText())}`);
    else items.push("🔒 Teams are locked");
    items.push("🎥 Teams meet and build on TuteDude Sessions", `💡 Problem statement: ${esc(revealText())}`);
    const one = `<span class="tk">${items.map((x) => `<em>${x}</em>`).join("<i>✦</i>")}<i>✦</i></span>`;
    put("marqTrack", one + one); // two copies, so the loop is seamless
    $("#marqTrack").classList.add("ready");
  }
  function lockText() {
    const d = new Date(DEADLINE);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) + ", " +
      d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).replace(/\s?(am|pm)$/i, (x) => " " + x.trim().toUpperCase());
  }

  const slotsHtml = (n) => `<span class="slots">${Array.from({ length: MAX }, (_, i) => `<i${i < n ? ` class="on"` : ""}></i>`).join("")} ${n}/${MAX}</span>`;
  const WA_ICON = `<svg viewBox="0 0 32 32" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M16.04 3C9.4 3 4 8.38 4 15c0 2.11.56 4.17 1.62 5.98L4 29l8.24-1.58A12.06 12.06 0 0 0 16.04 27C22.66 27 28 21.62 28 15S22.66 3 16.04 3zm0 21.8c-1.86 0-3.68-.5-5.27-1.45l-.38-.22-4.89.94.97-4.75-.25-.4A9.74 9.74 0 0 1 6.2 15c0-5.4 4.42-9.8 9.84-9.8 5.42 0 9.76 4.4 9.76 9.8 0 5.4-4.34 9.8-9.76 9.8zm5.38-7.33c-.29-.15-1.74-.86-2.01-.95-.27-.1-.47-.15-.67.15-.2.29-.77.95-.94 1.15-.17.2-.35.22-.64.07-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.2-.29.29-.49.1-.2.05-.37-.02-.51-.07-.15-.67-1.6-.91-2.2-.24-.57-.49-.5-.67-.5h-.57c-.2 0-.51.07-.78.37-.27.29-1.02 1-1.02 2.44s1.05 2.83 1.2 3.03c.15.2 2.06 3.15 4.99 4.42.7.3 1.24.48 1.67.61.7.22 1.34.19 1.84.12.56-.08 1.74-.71 1.98-1.4.25-.69.25-1.28.17-1.4-.07-.12-.27-.2-.56-.34z"/></svg>`;
  const waButton = (m) => `<a class="wa-btn" href="${esc(waLink(m.phone, `Hi ${first(m.name)}! I'm ${first(S.me.name)} from ${S.team.name} (TuteDude Buildathon) 👋`))}" target="_blank" rel="noopener" aria-label="Message ${esc(m.name)} on WhatsApp">${WA_ICON}<span>WhatsApp</span></a>`;
  const fullNumber = (phone) => "+" + normPhone(phone);

  // skills that forming teams are waiting for, most needed first (names only: team counts stay private)
  const needList = () => (S.stats && Array.isArray(S.stats.needs) ? S.stats.needs.filter((k) => DOM[k]) : []);
  // "🔥 Needed right now: 🎨 UI/UX Designer · 📣 Marketing …"
  function needsHtml() {
    const list = locked() ? [] : needList().slice(0, 3);
    if (!list.length) return "";
    return `<span class="needs-lbl">🔥 Needed right now:</span> ` + list.map((k) => `<span class="need">${icon(k)} <b>${esc(label(k))}</b></span>`).join("");
  }
  function timeLeft(target) {
    const ms = Math.max(0, (target || DEADLINE) - Date.now());
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    if (d) return `${d} day${d > 1 ? "s" : ""} ${h} hour${h === 1 ? "" : "s"}`;
    if (h) return `${h} hour${h > 1 ? "s" : ""} ${m} min`;
    return `${m} min`;
  }
  // "Sat, 21 Nov, 7 PM" (IST)
  function istText(t, fallback) {
    if (isNaN(t)) return fallback;
    const d = new Date(t);
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) + ", " +
      d.toLocaleTimeString("en-IN", { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined, timeZone: "Asia/Kolkata" }).replace(/\s?(am|pm)$/i, (x) => " " + x.trim().toUpperCase());
  }
  const revealText = () => istText(REVEAL, "Buildathon day");
  function shareUrl() {
    const url = location.origin + location.pathname;
    const text = `I just registered for the TuteDude Buildathon 🚀 Win ${C.prize || "₹20,000"}. Register in 30 seconds and get a team instantly. Teams lock on 20 Nov: ${url}`;
    return "https://wa.me/?text=" + encodeURIComponent(text);
  }

  // TuteDude Sessions brief + consent. Teammates' WhatsApp numbers unlock only after I agree
  // (get_me hides them until then). Steps follow the how-to video.
  const AGREE_TEXT = "Yes, I'll create or join my team's TuteDude session and do our product discussion there.";
  const stepsHtml = (t) => `<ol class="gate-steps">
      <li>Open TuteDude: any lecture → <b>Community</b> → <b>Sessions</b>.</li>
      <li>Create a room and pick <b>Doubt or study</b>.</li>
      <li>In “What you're working on”, write <b>${esc(t.name)} · Buildathon</b>.</li>
      <li>Set the audience to <b>Everyone</b> (your teammates are from other courses), then tap <b>Create room</b>.</li>
      <li>Teammates find the room in Sessions by your team name. Do your product discussion there.</li>
    </ol>`;
  function sessionHtml(t) {
    const V = C.session || {};
    if (!S.me.sessionOk) {
      return `<div class="gate" id="sessionGate">
        <div class="gate-head"><span class="gate-lock" aria-hidden="true">🔒</span><div>
          <h4>Your team works on TuteDude Sessions</h4>
          <p>A TuteDude session is a live room where your team meets, discusses the product and builds. Agree to use it, and your teammates' WhatsApp numbers unlock.</p>
        </div></div>
        ${stepsHtml(t)}
        ${videoWatched() ? `<div class="consent-wrap">
          <p class="watch-note">✓ Video watched. Tick the box and agree.</p>
          <label class="consent-row"><input type="checkbox" id="gateConsent"> <span>${esc(AGREE_TEXT)}</span></label>
          <button class="btn btn-sm" type="button" data-act="agree-session">I agree, unlock WhatsApp</button>
        </div>` : `<div class="consent-wrap locked" id="gateWatch">
          <p><b>🎬 Step 1: watch the 1-minute video till the end.</b> Then agree here, and your teammates' WhatsApp numbers unlock.</p>
          <button class="btn btn-sm" type="button" data-act="session">▶ Watch the video</button>
        </div>`}
      </div>`;
    }
    return `<div class="session-card" id="sessionGate">
      <div><h4>🎥 Meet your team on TuteDude Sessions</h4>
        <p>You agreed to do your product discussion on a TuteDude session. Create a room for <b>${esc(t.name)}</b> or join the one a teammate made, and be there when the problem statement drops on <b>${esc(revealText())}</b>.</p></div>
      <span class="row-btns"><a class="btn btn-sm" href="${esc(safeUrl(V.link || C.speakUp))}" target="_blank" rel="noopener">Open TuteDude ↗</a>
        <button class="btn btn-sm btn-ghost" type="button" data-act="session">▶ How to create a room</button></span>
    </div>`;
  }

  // the problem statement: from REVEAL, teams of MIN+ people, members who agreed (get_me sends it only then)
  function problemHtml(t) {
    if (!revealed() || t.members.length < MIN || !S.me.sessionOk) return "";
    const P = t.problem || {};
    return `<div class="problem-card"><p class="kicker">📢 Problem statement</p>
      ${P.text ? `<div class="problem-text">${linkify(P.text).replace(/\n/g, "<br>")}</div>` : `<p>It's being published right now. This page updates on its own, or refresh in a minute.</p>`}
      ${P.link ? `<span class="row-btns"><a class="btn btn-sm" href="${esc(safeUrl(P.link))}" target="_blank" rel="noopener">Open the full problem statement ↗</a></span>` : ""}</div>`;
  }

  function meHtml() {
    if (!S.me) {
      if (locked()) return "";
      if (S.loadErr && !S.be) return `<p class="empty">Couldn't connect. Check your internet and refresh the page.</p>`;
      const half = !!S.user && LIVE;
      return `<div class="me me-empty">
        <div><h3>${half ? "One more step" : "Register in 30 seconds"}</h3>
        <p>Your name, WhatsApp, email and what you do. Pick a team that needs your skill and you're in. ⏳ Teams lock in ${esc(timeLeft())}.</p></div>
        <button class="btn" type="button" data-act="register">${half ? "Finish registration" : "Register now"}</button>
      </div>`;
    }
    const canSignOut = LOGIN === "google";
    const top = `<div class="me-top">
      <div class="me-who">${avHtml(S.me)}<div><b>${plink(S.me.id, S.me.name)}</b> ${dchip(S.me.domain)}</div></div>
      <div class="me-links"><button class="link" type="button" data-act="edit-profile">Edit profile</button>${canSignOut ? `<button class="link" type="button" data-act="sign-out">Sign out</button>` : ""}</div>
    </div>`;
    return `<div class="me">${top}${S.team ? myTeamHtml() : `<p class="me-hint">Finding you a team…</p>`}</div>`;
  }

  // "What to do now": the whole journey in one list, with the current step highlighted
  function nextStepsHtml(t, lead) {
    const n = t.members.length, done = t.complete || locked(), agreed = !!S.me.sessionOk;
    const steps = [
      { ok: true, text: `You're in <b>${esc(t.name)}</b>${lead ? " as the leader" : ""}` },
      { ok: agreed, text: "Watch the 1-minute TuteDude Sessions video and agree to do your product discussion there. This unlocks WhatsApp" },
      { ok: agreed && n > 1, text: n > 1 ? `Say hi to your teammates on WhatsApp${lead ? " and make a group: tap “Copy all numbers”" : ""}` : "Wait for teammates: new people join as they register. Share the Buildathon link to fill faster." },
      { ok: done && n >= MIN, text: lead ? `Complete your team: it completes at ${MAX}, or tap “Our team is complete” from ${MIN} people` : `Team gets complete (${n}/${MAX}): at ${MAX} people, or when your leader marks it` },
      { ok: revealed(), text: `Meet on your team's TuteDude session on <b>${esc(revealText())}</b>. The problem statement appears here` }
    ];
    const current = steps.findIndex((s) => !s.ok);
    return `<div class="next-steps"><h4>What to do now</h4><ol>${steps.map((s, i) =>
      `<li class="${s.ok ? "done" : i === current ? "now" : ""}">${s.text}</li>`).join("")}</ol></div>`;
  }

  function myTeamHtml() {
    const t = S.team, me = S.me.id, lead = amLeader(), lockedNow = locked(), n = t.members.length, done = t.complete;
    const waiting = missing(t), unlocked = !!S.me.sessionOk;
    const status = (done ? `<span class="ok">✓ Team complete</span>` : n < MIN ? `<span class="warn-chip">Waiting for teammates</span>` : `<span class="ok">✓ Ready</span>`)
      + (unlocked ? "" : ` <span class="warn-chip">🔒 WhatsApp locked</span>`);
    let h = `<div class="team-box">
      <div class="team-title"><p class="kicker">Your team</p>
        <h3>${esc(t.name)}${lead && !lockedNow ? ` <button class="link small" type="button" data-act="rename">Rename</button>` : ""}</h3>
        <p class="team-meta">${slotsHtml(n)} ${status}</p></div>`;

    h += problemHtml(t);
    if (lockedNow && n < MIN) {
      h += `<div class="session-card"><div><h4>You're on your own in ${esc(t.name)}</h4><p>Teams are locked and nobody else joined your team. Message the organisers on the TuteDude Community so they can match you with a team before the Buildathon starts.</p></div>
        <span class="row-btns"><a class="btn btn-sm" href="${esc(safeUrl(C.speakUp))}" target="_blank" rel="noopener">Message on TuteDude Community</a></span></div>`;
    } else h += sessionHtml(t);
    h += nextStepsHtml(t, lead);

    const waLocked = `<span class="wa-locked" title="Unlocks when you agree to discuss your product on a TuteDude session">🔒 WhatsApp</span>`;
    h += `<ul class="mlist">${t.members.map((m) => `<li>${avHtml(m)}<span class="m-name"><b>${plink(m.id, m.name + (m.id === me ? " (you)" : ""))}</b>${m.id === t.leaderId ? ` <span class="lead">Leader</span>` : ""}<small>${esc(label(m.domain))}</small></span>
          ${m.id === me ? "" : unlocked && m.phone ? waButton(m) : unlocked ? "" : waLocked}
          ${lead && m.id !== me && !lockedNow && (t.removalsLeft == null || t.removalsLeft > 0) && Date.now() - (m.joinedAt || 0) >= REMOVE_AFTER
            ? `<button class="x" type="button" data-act="remove" data-person="${esc(m.id)}" aria-label="Move ${esc(m.name)} to another team">Remove</button>` : ""}</li>`).join("")}${done ? "" : Array.from({ length: Math.max(0, MAX - n) }, () => `<li class="m-empty"><i class="av av-empty" aria-hidden="true">+</i><span>Open spot</span></li>`).join("")}</ul>`;

    h += n <= 1 ? `<p class="me-hint">You're the first one here. New teammates join as they register and show up right here.</p>`
      : unlocked ? `<p class="me-hint wa-hint">${WA_ICON} <span>Talk to your team on WhatsApp.${lead ? ` Make a WhatsApp group and add everyone: <button class="link" type="button" data-act="copy-numbers">Copy all numbers</button>` : ""}</span></p>`
      : `<p class="me-hint wa-hint wa-hint-locked"><span aria-hidden="true">🔒</span> <span>Your teammates' WhatsApp numbers unlock when you agree to do your product discussion on a TuteDude session. <button class="link" type="button" data-act="goto-session">Agree now</button></span></p>`;

    if (!done && !lockedNow) {
      h += `<div class="urgent-note">⏳ <b>${esc(timeLeft())}</b> left until teams lock. Your team still needs ${waiting.map((k) => `<b>${esc(aSkill(k))}</b>`).join(" or ")}.</div>`;
      h += `<p class="me-hint">${pushState() === "on" ? "We'll notify you when someone joins." : "Turn on notifications to know when someone joins."}
        <a class="btn btn-sm btn-wa" href="${esc(shareUrl())}" target="_blank" rel="noopener">${WA_ICON} Share the Buildathon</a></p>`;
      if (lead && n >= MIN) h += `<div class="lead-actions"><button class="btn btn-sm" type="button" data-act="complete">✓ Our team is complete</button><small class="muted">Nobody new joins after this. A team of ${MAX} completes on its own.</small></div>`;
    }
    return h + `</div>`;
  }

  /* ============================================================
     DIALOGS
     ============================================================ */
  const regDlg = $("#regDlg"), nameDlg = $("#nameDlg"), profDlg = $("#profDlg"), sessionDlg = $("#sessionDlg"), reclaimDlg = $("#reclaimDlg");
  function openDlg(d) { if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); } document.documentElement.classList.add("modal-open"); updateSticky(); }
  function closeDlg(d) { if (d.open) { if (d.close) d.close(); else d.removeAttribute("open"); } if (!$("dialog[open]")) document.documentElement.classList.remove("modal-open"); updateSticky(); }
  [regDlg, nameDlg, profDlg, sessionDlg, reclaimDlg].forEach((d) => {
    d.addEventListener("click", (e) => { if (e.target === d || e.target.closest("[data-close]")) closeDlg(d); });
    d.addEventListener("close", () => { if (!$("dialog[open]")) document.documentElement.classList.remove("modal-open"); updateSticky(); });
  });
  sessionDlg.addEventListener("close", () => { const v = $("#sessionVideo video"); if (v) v.pause(); });
  function showErr(id, msg) { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; }

  /* ---------- register / edit profile ---------- */
  function openRegister(edit) {
    if (locked() && !S.me) { toast("Teams are locked. Registration is closed.", true); return; }
    if (S.me && !edit) { $("#board").scrollIntoView({ behavior: "smooth" }); return; }
    const needGoogle = LOGIN === "google" && !S.user;
    $("#googleStep").hidden = !needGoogle;
    $("#regForm").hidden = needGoogle;
    $("#anonNote").hidden = !(LOGIN === "anonymous" && !S.me);
    showErr("#googleErr", ""); showErr("#regErr", "");
    $("#regKicker").textContent = S.me ? "Your profile" : "Register · 30 seconds";
    $("#regTitle").textContent = S.me ? "Edit profile" : "Join the Buildathon";
    $("#regSubmit").textContent = S.me ? "Save" : "Register and join the team";
    $("#rTeamField").hidden = true;
    $("#reclaimLink").hidden = !!S.me;
    if (!needGoogle) {
      if (S.me) {
        $("#rName").value = S.me.name;
        $("#rPhone").value = S.me.phone || "";
        $("#rEmail").value = S.me.email || "";
        $("#rSkill").value = S.me.skill || "";
        $("#rLink").value = S.me.link || "";
        $("#rConsent").checked = true;
      } else {
        if (S.user && S.user.name && !$("#rName").value) $("#rName").value = S.user.name;
        if (S.user && S.user.email && !$("#rEmail").value) $("#rEmail").value = S.user.email;
        const picked = ($$("input[name=domain]:checked", regDlg)[0] || {}).value;
        if (picked) loadTeamChoices(picked);
      }
      $$("input[name=domain]", regDlg).forEach((i) => { if (S.me) i.checked = i.value === S.me.domain; i.disabled = !!S.team; });
      $("#regLockNote").hidden = !S.team;
    }
    openDlg(regDlg);
    if (!needGoogle && !S.me) setTimeout(() => $("#rName").focus(), 50);
  }

  // registration: teams that still have a spot for the chosen skill (names only)
  let pickSeq = 0;
  async function loadTeamChoices(d) {
    const field = $("#rTeamField"), box = $("#rTeams"), note = $("#rTeamsNote");
    if (S.me || !d) { field.hidden = true; return; }
    field.hidden = false;
    note.textContent = "";
    box.innerHTML = `<p class="muted small">Finding teams that need ${esc(aSkill(d))}…</p>`;
    const seq = ++pickSeq;
    try {
      await whenReady();
      const list = await S.be.openTeams(d);
      if (seq !== pickSeq) return;
      if (!list.length) {
        box.innerHTML = `<p class="pick-none">No team needs ${esc(aSkill(d))} right now. <b>You'll start a new team</b> and be its leader. The next people to register join you.</p>`;
        return;
      }
      box.innerHTML = list.map((t, i) => `<label class="pick"><input type="radio" name="team" value="${esc(t.id)}" data-name="${esc(t.name)}"${i === 0 ? " checked" : ""}><span>${esc(t.name)}</span></label>`).join("");
      note.textContent = list.length === 1 ? `This team needs ${aSkill(d)}.` : `These ${list.length} teams need ${aSkill(d)}. Pick one.`;
    } catch (e) {
      console.warn(e);
      if (seq === pickSeq) box.innerHTML = `<p class="muted small">Couldn't load the teams. You'll be placed in a team that needs you.</p>`;
    }
  }

  async function submitProfile(e) {
    e.preventDefault();
    showErr("#regErr", "");
    const name = clean($("#rName").value);
    const picked = ($$("input[name=domain]:checked", regDlg)[0] || {}).value;
    const phone = $("#rPhone").value.replace(/[^\d+]/g, "");
    const digits = phone.replace(/\D/g, "");
    const email = clean($("#rEmail").value).toLowerCase();
    const skill = clean($("#rSkill").value);
    let link = clean($("#rLink").value);
    if (link && !/^https?:\/\//i.test(link) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(link)) link = "https://" + link;
    const teamInput = $$("input[name=team]:checked", regDlg)[0];
    if (name.length < 2) return showErr("#regErr", "Please write your name.");
    if (digits.length < 10 || digits.length > 13) return showErr("#regErr", "Please write your WhatsApp number (10 digits).");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr("#regErr", "Please write a valid email address.");
    if (!picked) return showErr("#regErr", "Pick what you do.");
    if (link && (!/^https?:\/\/\S+$/i.test(link) || link.length > 200)) return showErr("#regErr", "That link doesn't look right. Paste the full link (max 200 characters), or leave it empty.");
    if (!$("#rConsent").checked) return showErr("#regErr", "Please confirm you're a TuteDude student.");
    const btn = $("#regSubmit");
    btn.disabled = true;
    try {
      const isNew = !S.me;
      await whenReady();
      if (!S.user) S.user = await S.be.ensureUser(); // demo + "anonymous" login; Google users are signed in already
      const res = await S.be.saveProfile({ name, domain: S.team ? S.me.domain : picked, phone, email, skill, link, team: isNew && teamInput ? teamInput.value : null, consent: true }) || {};
      closeDlg(regDlg);
      await refresh();
      if (isNew && S.team) {
        const alone = S.team.members.length === 1;
        if (res.gotChoice === false) toast(`${teamInput.dataset.name} filled up a moment ago, so you're in ${S.team.name}. Say hi on WhatsApp!`);
        else toast(alone ? `You're registered! You started ${S.team.name}. Give it a name.` : `You're in ${S.team.name}! 🎉 Say hi to your team on WhatsApp.`);
        $("#board").scrollIntoView({ behavior: "smooth" });
      } else toast(isNew ? "You're registered!" : "Profile saved.");
    } catch (err) {
      console.warn(err);
      showErr("#regErr", (err && err.message) || "Couldn't save. Check your connection and try again.");
    }
    btn.disabled = false;
  }

  /* ---------- get back to your team on a new phone / home-screen app / cleared browser ---------- */
  function openReclaim() {
    closeDlg(regDlg);
    showErr("#reclaimErr", "");
    $("#cPhone").value = $("#rPhone").value || "";
    $("#cEmail").value = $("#rEmail").value || "";
    openDlg(reclaimDlg);
    setTimeout(() => $("#cPhone").focus(), 50);
  }
  async function submitReclaim(e) {
    e.preventDefault();
    showErr("#reclaimErr", "");
    const phone = $("#cPhone").value, email = clean($("#cEmail").value).toLowerCase();
    if (!phoneOk(normPhone(phone))) return showErr("#reclaimErr", "Please write your WhatsApp number (10 digits).");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showErr("#reclaimErr", "Please write a valid email address.");
    const btn = $("#reclaimSubmit");
    btn.disabled = true;
    try {
      await whenReady();
      if (!S.user) S.user = await S.be.ensureUser();
      const res = await S.be.reclaim(phone, email) || {};
      closeDlg(reclaimDlg);
      await refresh();
      toast(res.team ? `Welcome back! You're in ${res.team}.` : "Welcome back!");
      $("#board").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      showErr("#reclaimErr", (err && err.message) || "Couldn't find your registration. Try again.");
    }
    btn.disabled = false;
  }

  /* ---------- rename team ---------- */
  function openRename() {
    if (!amLeader()) return;
    $("#nName").value = /^Team \d+$/.test(S.team.name) ? "" : S.team.name;
    showErr("#nameErr", "");
    openDlg(nameDlg);
    setTimeout(() => $("#nName").focus(), 50);
  }
  async function submitRename(e) {
    e.preventDefault();
    const name = clean($("#nName").value);
    if (name.length < 2) return showErr("#nameErr", "Give your team a name (2 to 40 letters).");
    const btn = $("button[type=submit]", nameDlg);
    btn.disabled = true;
    try {
      await whenReady();
      await S.be.rename(name);
      closeDlg(nameDlg);
      toast(`Your team is now ${name}.`);
      await refresh();
    } catch (err) {
      showErr("#nameErr", (err && err.message) || "Couldn't rename. Try again.");
    }
    btn.disabled = false;
  }

  /* ---------- profile (yourself and your teammates only) ---------- */
  function findPerson(id) {
    if (S.me && S.me.id === id) return Object.assign({}, S.me, { status: S.team ? `In ${S.team.name}` : "", self: true });
    if (S.team) { const m = S.team.members.find((x) => x.id === id); if (m) return Object.assign({}, m, { status: "In your team" }); }
    return null;
  }
  function openProfile(id) {
    const p = findPerson(id);
    if (!p) return;
    $("#profBody").innerHTML = `<div class="prof">
      ${avHtml(p, "av-xl")}
      <h2 class="h3" id="profName">${esc(p.name)}</h2>
      <p>${dchip(p.domain)}</p>
      ${p.status ? `<p class="prof-status">${esc(p.status)}</p>` : ""}
      ${p.skill ? `<p class="prof-skill">“${esc(p.skill)}”</p>` : ""}
      <div class="row-btns">
        ${!p.self && p.phone ? waButton(p) : ""}
        ${p.link ? `<a class="btn btn-sm btn-ghost" href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener nofollow">View their work ↗</a>` : ""}
      </div>
      ${p.self ? `<button class="link" type="button" data-act="edit-profile">Edit my profile</button>` : ""}
    </div>`;
    openDlg(profDlg);
  }

  /* ---------- session pop-up: TuteDude Sessions video (must be watched in full) + consent ---------- */
  // Everyone watches the whole video before they can agree: no skipping ahead, and the consent box
  // unlocks only when it has played to the end. (If the video can't play and the Drive backup shows,
  // the consent unlocks after a minute.)
  const VIDEO_KEY = "tdb-video-watched";
  const videoWatched = () => ls.get(VIDEO_KEY) === "1" || !!(S.me && S.me.sessionOk);
  const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
  function watchNote(t, dur) {
    const el = $("#watchNote");
    if (!el) return;
    el.textContent = videoWatched() ? "✓ Video watched. Tick the box and agree."
      : dur ? `▶ Watch the full video to continue (${mmss(t || 0)} of ${mmss(dur)})` : "▶ Watch the full video to continue";
  }
  function markWatched() {
    if (ls.get(VIDEO_KEY) === "1") return;
    ls.set(VIDEO_KEY, "1");
    const box = $("#dlgConsent"), btn = $("#sessionActions [data-act=agree-session]");
    if (box) box.disabled = false;
    if (btn) btn.disabled = false;
    const w = $("#sessionActions .consent-wrap");
    if (w) w.classList.remove("locked");
    watchNote();
    render();
  }
  function openSession() {
    const frame = $("#sessionVideo"), V = C.session || {};
    const t = S.team, agreed = !!(S.me && S.me.sessionOk), team = t ? t.name : "your team", watched = videoWatched();
    const open = (cls, txt) => `<a class="btn btn-full ${cls}" href="${esc(safeUrl(V.link || C.speakUp))}" target="_blank" rel="noopener">${txt}</a>`;
    if (agreed) {
      $("#sessionTitle").textContent = "Meet your team on TuteDude Sessions";
      $("#sessionText").innerHTML = `Create a room for <b>${esc(team)}</b> (Community → Sessions) or join the one a teammate made, and do your product discussion there. The problem statement drops on <b>${esc(revealText())}</b>.`;
      $("#sessionActions").innerHTML = open("", "Open TuteDude →");
    } else {
      $("#sessionTitle").textContent = "Before WhatsApp: TuteDude Sessions";
      $("#sessionText").innerHTML = `Your team meets, discusses the product and builds in a <b>TuteDude session</b>, a live room on TuteDude. Watch this 1-minute video till the end, then agree below, and your teammates' WhatsApp numbers unlock.`;
      $("#sessionActions").innerHTML = `
        <div class="consent-wrap${watched ? "" : " locked"}">
          <p class="watch-note" id="watchNote"></p>
          <label class="consent-row"><input type="checkbox" id="dlgConsent"${watched ? "" : " disabled"}> <span>${esc(AGREE_TEXT)}</span></label>
          <button class="btn btn-full" type="button" data-act="agree-session"${watched ? "" : " disabled"}>I agree, unlock WhatsApp</button>
        </div>
        ${open("btn-ghost", "Open TuteDude ↗")}`;
      watchNote();
    }
    let v = $("video", frame);
    if (!frame.dataset.ready) {
      frame.dataset.ready = "1";
      const driveId = ((V.videoBackup || "").match(/\/d\/([^/]+)/) || [])[1];
      const backup = () => {
        frame.innerHTML = driveId
          ? `<iframe src="https://drive.google.com/file/d/${esc(driveId)}/preview" allow="autoplay; fullscreen" allowfullscreen title="How TuteDude sessions work"></iframe>`
          : `<a class="video-link" href="${esc(safeUrl(V.videoBackup))}" target="_blank" rel="noopener"><span>▶ Watch the video</span></a>`;
        setTimeout(markWatched, 60000); // can't follow progress inside the backup player
      };
      if (V.video) {
        v = document.createElement("video");
        v.controls = true; v.playsInline = true; v.preload = "auto"; v.src = V.video;
        v.setAttribute("controlsList", "nodownload noplaybackrate");
        v.disablePictureInPicture = true;
        let maxT = 0; // furthest point watched without skipping
        v.addEventListener("timeupdate", () => {
          if (!v.seeking && v.currentTime > maxT && v.currentTime - maxT < 8) maxT = v.currentTime;
          if (v.duration && maxT >= v.duration - 1) markWatched();
          else watchNote(maxT, v.duration);
        });
        v.addEventListener("seeking", () => { if (!videoWatched() && v.currentTime > maxT + 1) v.currentTime = maxT; }); // no skipping ahead
        v.addEventListener("ended", () => { if (maxT >= (v.duration || 0) - 2) markWatched(); });
        v.addEventListener("error", backup);
        frame.appendChild(v);
      } else backup();
    }
    $$("dialog[open]").forEach((d) => { if (d !== sessionDlg) closeDlg(d); });
    openDlg(sessionDlg);
    // start playing right away (with sound if the browser allows, else muted: the video has captions)
    if (v && !agreed && !watched && v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
  }

  /* ---------- toast ---------- */
  let toastTimer = 0;
  function toast(msg, bad) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("bad", !!bad);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 250); }, 4500);
  }

  /* ============================================================
     ACTIONS + EVENTS
     ============================================================ */
  async function act(btn, fn, okMsg) {
    if (btn) btn.disabled = true;
    try {
      await whenReady();
      const r = await fn();
      const msg = typeof okMsg === "function" ? okMsg(r) : okMsg;
      if (msg) toast(msg);
    } catch (e) {
      console.warn(e);
      toast((e && e.message) || "Something went wrong. Try again.", true);
    }
    if (btn && btn.isConnected) btn.disabled = false;
    await refresh();
  }

  function bindUI() {
    if ("IntersectionObserver" in window) {
      // ignore the strip hidden under the sticky header: something only counts as "on screen" below it
      const below = `-${Math.round(($(".header") || { offsetHeight: 100 }).offsetHeight)}px 0px 0px 0px`;
      new IntersectionObserver((en) => { en.forEach((e) => { seen.hero = e.isIntersecting; }); updateSticky(); }, { threshold: 0, rootMargin: below })
        .observe($(".hero"));
      new IntersectionObserver((en) => { en.forEach((e) => { seen.panel = e.isIntersecting; }); updateSticky(); }, { threshold: 0.2, rootMargin: below })
        .observe($("#mePanel"));
    }
    $("#rDomains").innerHTML = DOMAINS.map((d) => `<label class="chip"><input type="radio" name="domain" value="${d.key}"> ${d.icon} ${esc(d.label)}</label>`).join("");
    $("#rDomains").addEventListener("change", (e) => { if (e.target.name === "domain") loadTeamChoices(e.target.value); });
    $("#regForm").addEventListener("submit", submitProfile);
    $("#nameForm").addEventListener("submit", submitRename);
    $("#reclaimForm").addEventListener("submit", submitReclaim);
    $("#reclaimForm").addEventListener("input", () => showErr("#reclaimErr", ""));
    $("#regForm").addEventListener("input", () => showErr("#regErr", ""));
    $("#nameForm").addEventListener("input", () => showErr("#nameErr", ""));
    $("#googleBtn").addEventListener("click", async () => {
      showErr("#googleErr", "");
      ss.set(REG_FLAG, "1");
      try { await whenReady(); await S.be.signIn(); } // leaves the page; we come back signed in
      catch (e) { console.warn(e); ss.del(REG_FLAG); showErr("#googleErr", "Google sign-in didn't start. Try again."); }
    });

    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const a = b.dataset.act, person = b.dataset.person, be = S.be;
      if (b.closest("#profDlg") && a !== "profile") closeDlg(profDlg);
      switch (a) {
        case "register": return openRegister();
        case "edit-profile": return openRegister(true);
        case "reclaim-open": return openReclaim();
        case "profile": return openProfile(person);
        case "rename": return openRename();
        case "sign-out": return act(b, () => be.signOut());
        case "reset-demo": return be && be.reset && be.reset();
        case "session": return openSession();
        case "goto-session": {
          $$("dialog[open]").forEach((d) => closeDlg(d));
          const g = $("#sessionGate") || $("#mePanel");
          if (g) g.scrollIntoView({ behavior: "smooth", block: "start" });
          setTimeout(() => { const i = $("#gateConsent") || $("#gateWatch .btn"); if (i) i.focus({ preventScroll: true }); }, 600);
          return;
        }
        case "copy-numbers": {
          const lines = S.team.members.filter((m) => m.id !== S.me.id && m.phone).map((m) => `${m.name}: ${fullNumber(m.phone)}`).join("\n");
          if (!lines) return;
          const done = () => toast("Numbers copied. Create a WhatsApp group and add them.");
          if (navigator.clipboard) navigator.clipboard.writeText(lines).then(done, () => prompt("Copy these numbers:", lines));
          else prompt("Copy these numbers:", lines);
          return;
        }
        case "agree-session": {
          if (!videoWatched()) { toast("Watch the full video first.", true); openSession(); return; }
          const wrap = b.closest(".consent-wrap"), box = wrap && wrap.querySelector("input[type=checkbox]");
          if (box && !box.checked) { toast("Tick the box to agree first.", true); box.focus(); return; }
          return act(b, async () => { await be.agreeSession(); closeDlg(sessionDlg); }, "Thanks! Your teammates' WhatsApp numbers are unlocked 🎉");
        }
        case "push-on": return act(b, enablePush, "Notifications are on 🔔");
        case "push-later": ss.set("tdb-notify-later", "1"); render(); return;
        case "complete":
          if (confirm("Mark your team as complete? Nobody new can join after this.")) act(b, () => be.completeTeam());
          return;
        case "remove": {
          const m = S.team && S.team.members.find((x) => x.id === person);
          if (m && confirm(`Move ${m.name} out of your team? They'll be placed in another team, and the next person with their skill who registers joins yours.`)) act(b, () => be.remove(person), `${first(m.name)} was moved to another team.`);
          return;
        }
      }
    });
  }

  /* ============================================================
     START
     ============================================================ */
  async function init() {
    bindUI();
    if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register("sw.js").then((r) => { swReg = r; }).catch((e) => console.warn("sw", e));
      navigator.serviceWorker.addEventListener("message", (e) => {
        const d = e.data || {};
        if (d.type === "push") refresh();
        if (d.type === "open") $("#board").scrollIntoView({ behavior: "smooth" });
      });
    }
    try {
      S.be = LIVE ? await supabaseBackend(C.supabase, LOGIN) : demoBackend();
    } catch (e) {
      // never fall back to the demo on the live site: people would "register" into a fake board
      console.error(e);
      S.loadErr = true;
      tickerFallback = true;
      render();
      toast("Couldn't connect. Check your internet and refresh the page.", true);
      return;
    }
    readyResolve();
    if (S.be.mode === "demo") {
      $("#demoBar").hidden = false;
      S.be.onChange(debounce(() => refresh(), 60));
    } else {
      // Live updates come over Broadcast. This timer is the backup (e.g. when the free plan's
      // live-connection limit is reached): it checks more often only while live updates are down.
      const visible = () => document.visibilityState === "visible";
      let tick = 0;
      setInterval(() => {
        if (!visible()) return;
        tick++;
        const live = S.me && S.be.liveOk("user:" + S.me.id);
        if (!live || tick % 4 === 0) refresh({ board: tick % 8 === 0 }); // me: 15 s without live, 60 s with; numbers: every 2 min
      }, 15000);
      document.addEventListener("visibilitychange", () => { if (visible()) refresh(); });
    }
    // show the public numbers straight away; my own team loads as soon as sign-in is known
    refresh();
    setTimeout(() => { tickerFallback = true; renderTicker(); }, 2500); // slow network: show the ticker without numbers
    S.be.onAuth(onUser);
    // redraw when the teams lock, and fetch the problem statement when it drops
    [[DEADLINE, render], [REVEAL, () => refresh()]].forEach(([at, fn]) => {
      if (!isNaN(at) && at > Date.now() && at - Date.now() < 2147483000) setTimeout(fn, at - Date.now() + 1000);
    });
  }
  init();
})();
