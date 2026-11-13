/* ============================================================
   TuteDude Buildathon: organiser panel (admin.html)
   Sign in with email + password. Every admin_* function in supabase.sql checks that the signed-in
   account is on the organiser list (bd_admins), so nothing here is trusted on its own.
   ============================================================ */
(function () {
  "use strict";
  const C = window.BUILDATHON || {};
  const DOM = Object.fromEntries((C.domains || []).map((d) => [d.key, d]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const label = (k) => (DOM[k] ? DOM[k].label : "Other skill");
  const icon = (k) => (DOM[k] ? DOM[k].icon : "✨");
  const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(u || "") ? u : "#");
  const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>');
  const fmt = (t) => new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const num = (n) => Number(n || 0).toLocaleString("en-IN");
  const waNum = (p) => String(p || "").replace(/\D/g, "");

  let sb = null;
  const S = { tab: "overview", filter: "all", search: "", offset: 0, teams: [], total: 0, notifyTeam: null, moving: null };

  /* ---------- helpers ---------- */
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
  function showErr(id, msg) { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; }
  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args || {});
    if (error) throw new Error(/JWT|expired/i.test(error.message) ? "Your sign-in expired. Sign in again." : error.message);
    return data;
  }
  async function busy(btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { console.warn(e); toast(e.message || "Something went wrong.", true); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }
  function view(which) {
    ["#admLoading", "#admLogin", "#admDenied", "#admApp"].forEach((s) => { $(s).hidden = s !== which; });
  }

  /* ---------- sign in ---------- */
  async function start() {
    if (!(C.supabase && C.supabase.url) || !(window.supabase && window.supabase.createClient)) {
      $("#admLoading").textContent = "The organiser panel needs the live Supabase settings in config.js.";
      return;
    }
    // own storage key: signing in here never touches a student registration in the same browser
    sb = window.supabase.createClient(C.supabase.url, C.supabase.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "tdb-organiser-auth" }
    });
    const { data } = await sb.auth.getSession();
    if (data && data.session) await enter(); else view("#admLogin");
  }
  async function enter() {
    let who;
    try { who = await rpc("admin_whoami"); }
    catch (e) { await sb.auth.signOut(); view("#admLogin"); showErr("#loginErr", e.message); return; }
    if (!who.admin) { $("#deniedEmail").textContent = who.email || "this account"; view("#admDenied"); return; }
    $("#admEmail").textContent = who.email;
    $("#admWho").hidden = false;
    view("#admApp");
    showTab(S.tab);
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("#loginErr", "");
    const email = $("#lEmail").value.trim(), password = $("#lPass").value;
    if (!email || !password) { showErr("#loginErr", "Enter your email and password."); return; }
    await busy($("#loginBtn"), async () => {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        showErr("#loginErr", /invalid login/i.test(error.message) ? "Wrong email or password."
          : /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute and try again." : error.message);
        return;
      }
      $("#lPass").value = "";
      await enter();
    });
  });
  async function signOut() {
    await sb.auth.signOut();
    $("#admWho").hidden = true;
    view("#admLogin");
  }
  $("#admOut").addEventListener("click", signOut);

  /* ---------- change password (so it never has to be shared) ---------- */
  const pwDlg = $("#pwDlg");
  pwDlg.addEventListener("click", (e) => { if (e.target === pwDlg || e.target.closest("[data-close]")) pwDlg.close(); });
  $("#pwForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("#pwErr", "");
    const a = $("#pw1").value, b = $("#pw2").value;
    if (a.length < 10) { showErr("#pwErr", "Use at least 10 characters."); return; }
    if (a !== b) { showErr("#pwErr", "The two passwords don't match."); return; }
    const btn = $("#pwForm button[type=submit]");
    btn.disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    btn.disabled = false;
    if (error) { showErr("#pwErr", /different from the old/i.test(error.message) ? "That's your current password. Pick a new one." : error.message); return; }
    $("#pw1").value = ""; $("#pw2").value = "";
    pwDlg.close();
    toast("Password changed. Use the new one next time you sign in.");
  });

  /* ---------- tabs ---------- */
  function showTab(tab) {
    S.tab = tab;
    $$(".adm-tabs .tab").forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
    $$(".adm-pane").forEach((p) => { p.hidden = p.id !== "pane-" + tab; });
    ({ overview: loadOverview, teams: () => loadTeams(true), problem: loadProblem, notify: countAudience, activity: loadActivity }[tab] || (() => {}))();
  }

  /* ---------- overview ---------- */
  function bars(title, rows) {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="adm-card adm-bars"><h3>${esc(title)}</h3>${rows.length ? rows.map(([k, n]) =>
      `<div class="bar"><span>${k}</span><i style="width:${Math.round((n / max) * 100)}%"></i><b>${num(n)}</b></div>`).join("") : `<p class="muted">Nothing yet.</p>`}</div>`;
  }
  async function loadOverview() {
    const o = await busy(null, () => rpc("admin_overview"));
    if (!o) return;
    const pct = o.people ? Math.round((o.agreed / o.people) * 100) : 0;
    const stat = (n, t, warn) => `<div class="adm-stat${warn ? " warn" : ""}"><b>${num(n)}</b><span>${t}</span></div>`;
    const skills = Object.keys(DOM).map((k) => [`${icon(k)} ${esc(label(k))}`, (o.bySkill || {})[k] || 0]);
    const needs = Object.keys(DOM).map((k) => [`${icon(k)} ${esc(label(k))}`, (o.needs || {})[k] || 0]);
    const sizes = Object.entries(o.bySize || {}).sort((a, b) => a[0] - b[0]).map(([s, n]) => [`${s} ${s === "1" ? "person" : "people"}`, n]);
    const daily = (o.daily || []).map((d) => [new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }), d.n]);
    $("#ovBody").innerHTML = `
      <div class="adm-stats">
        ${stat(o.people, "registered")}${stat(o.today, "in the last 24 h")}${stat(o.teams, "teams")}
        ${stat(o.complete, "complete teams")}${stat(o.forming, "teams forming")}${stat(o.solo, "people alone in a team", o.solo > 0)}
        ${stat(o.agreed, `agreed to TuteDude Sessions (${pct}%)`)}${stat(o.people - o.agreed, "haven't agreed yet", o.people - o.agreed > 0)}
        ${o.unplaced ? stat(o.unplaced, "registered without a team", true) : ""}
      </div>
      <div class="adm-status">
        <span class="${o.locked ? "warn-chip" : "ok"}">${o.locked ? "🔒 Teams are locked" : "Teams lock " + esc(fmt(o.deadline))}</span>
        <span class="${o.problemSet ? "ok" : "warn-chip"}">${o.problemSet ? "✓ Problem statement saved" : "Problem statement not saved yet"} · shows ${esc(fmt(o.reveal))}</span>
      </div>
      <div class="adm-grid2">
        ${bars("People by skill", skills)}
        ${bars("Teams still needing each skill", needs)}
        ${bars("Teams by size", sizes)}
        ${bars("Registrations per day (14 days)", daily)}
      </div>`;
  }

  /* ---------- teams ---------- */
  function teamHtml(t) {
    const members = t.members || [];
    return `<article class="adm-team" data-team="${esc(t.id)}">
      <div class="adm-team-head"><h3>${esc(t.name)}</h3>
        <span class="meta"><span class="${t.complete ? "ok" : "warn-chip"}">${t.complete ? "✓ Complete" : "Forming"}</span> <b>${t.size}/4</b>
          <span class="muted">· started ${esc(fmt(t.createdAt))}</span>
          <button class="link small" type="button" data-act="rename" data-team="${esc(t.id)}" data-name="${esc(t.name)}">Rename</button>
          <button class="link small" type="button" data-act="notify-team" data-team="${esc(t.id)}" data-name="${esc(t.name)}">Notify team</button></span></div>
      ${members.map((m) => `<div class="adm-mem">
        <div class="who"><b>${esc(m.name)}</b>${m.leader ? ` <span class="lead">Leader</span>` : ""}<small>${icon(m.domain)} ${esc(label(m.domain))}${m.skill ? " · " + esc(m.skill) : ""}</small></div>
        <div class="contact"><a href="https://wa.me/${esc(waNum(m.phone))}" target="_blank" rel="noopener">📱 +${esc(waNum(m.phone))}</a>
          <a href="mailto:${esc(m.email)}">✉️ ${esc(m.email)}</a>
          <span class="${m.agreed ? "yes" : "no"}">${m.agreed ? "✓ Agreed to TuteDude Sessions" : "✗ Not agreed yet"}</span>${m.link ? ` <a href="${esc(safeUrl(m.link))}" target="_blank" rel="noopener nofollow">work ↗</a>` : ""}</div>
        <div class="acts"><button type="button" data-act="move" data-person="${esc(m.id)}" data-name="${esc(m.name)}">Move</button>
          <button type="button" class="danger" data-act="remove" data-person="${esc(m.id)}" data-name="${esc(m.name)}">Remove</button></div>
      </div>`).join("")}
    </article>`;
  }
  async function loadTeams(reset) {
    if (reset) { S.offset = 0; S.teams = []; }
    const r = await busy(null, () => rpc("admin_teams", { p_filter: S.filter, p_search: S.search, p_offset: S.offset }));
    if (!r) return;
    S.total = r.total;
    S.teams = S.teams.concat(r.teams || []);
    S.offset = S.teams.length;
    $("#teamCount").textContent = `${num(r.total)} ${r.total === 1 ? "team" : "teams"}${S.search ? ` matching “${S.search}”` : ""}`;
    $("#teamList").innerHTML = S.teams.length ? S.teams.map(teamHtml).join("") : `<p class="empty">No teams here.</p>`;
    $("#teamMore").hidden = S.teams.length >= S.total;
  }
  let searchTimer = 0;
  $("#teamSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { S.search = $("#teamSearch").value.trim(); loadTeams(true); }, 350);
  });
  $("#teamFilters").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filter]");
    if (!b) return;
    S.filter = b.dataset.filter;
    $$("#teamFilters .chip").forEach((c) => c.classList.toggle("on", c === b));
    loadTeams(true);
  });

  /* move dialog */
  const moveDlg = $("#moveDlg");
  moveDlg.addEventListener("click", (e) => { if (e.target === moveDlg || e.target.closest("[data-close]")) moveDlg.close(); });
  async function loadMoveOptions() {
    const list = await busy(null, () => rpc("admin_team_options", { p_person: S.moving.id, p_search: $("#moveSearch").value.trim() }));
    if (!list) return;
    $("#moveList").innerHTML = list.length ? list.map((t) => `<li><button type="button" data-act="move-to" data-team="${esc(t.id)}" data-name="${esc(t.name)}"><span>${esc(t.name)}</span><span>${t.size}/4</span></button></li>`).join("")
      : `<li class="muted">No team has room for their skill${$("#moveSearch").value ? " with that name" : ""}.</li>`;
  }
  let moveTimer = 0;
  $("#moveSearch").addEventListener("input", () => { clearTimeout(moveTimer); moveTimer = setTimeout(loadMoveOptions, 300); });
  async function doMove(btn, teamId, teamName) {
    const p = S.moving;
    if (!confirm(`Move ${p.name} to ${teamName || "the best-fit team"}? They and both teams get a notification.`)) return;
    await busy(btn, async () => {
      const name = await rpc("admin_move", { p_person: p.id, p_team: teamId });
      moveDlg.close();
      toast(`${p.name} moved to ${name}.`);
      loadTeams(true);
    });
  }

  /* CSV */
  async function exportCsv(btn) {
    await busy(btn, async () => {
      const rows = await rpc("admin_export");
      const cols = ["team", "teamSize", "complete", "leader", "name", "skill", "whatsapp", "email", "bio", "link", "agreedToSession", "registeredAt"];
      const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = `buildathon-teams-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast(`Exported ${num(rows.length)} people.`);
    });
  }

  /* ---------- problem statement ---------- */
  function previewProblem() {
    const tx = $("#pText").value.trim(), lk = $("#pLink").value.trim();
    $("#probPreview").innerHTML = `<div class="problem-card"><p class="kicker">📢 Problem statement</p>
      ${tx ? `<div class="problem-text">${linkify(tx).replace(/\n/g, "<br>")}</div>` : `<p class="muted">Nothing written yet.</p>`}
      ${lk ? `<span class="row-btns"><a class="btn btn-sm" href="${esc(safeUrl(lk))}" target="_blank" rel="noopener">Open the full problem statement ↗</a></span>` : ""}</div>`;
  }
  async function loadProblem() {
    const p = await busy(null, () => rpc("admin_get_problem"));
    if (!p) return;
    $("#pText").value = p.text || "";
    $("#pLink").value = p.link || "";
    $("#probWhen").innerHTML = p.live ? `<b>It's live:</b> students in teams of 2+ who agreed to TuteDude Sessions see it now.`
      : `Students see it on their team page from <b>${esc(fmt(p.reveal))}</b> (teams of 2+, people who agreed to TuteDude Sessions). It's never on the public page.`;
    previewProblem();
  }
  $("#pText").addEventListener("input", previewProblem);
  $("#pLink").addEventListener("input", previewProblem);
  $("#probForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("#probErr", "");
    const btn = $("#probForm button[type=submit]");
    btn.disabled = true;
    try { await rpc("admin_set_problem", { p_text: $("#pText").value, p_link: $("#pLink").value }); toast("Problem statement saved."); }
    catch (err) { showErr("#probErr", err.message); }
    btn.disabled = false;
  });

  /* ---------- notify ---------- */
  async function countAudience() {
    const aud = $("#nAudience").value;
    $("#nCount").textContent = "Counting…";
    try {
      const n = await rpc("admin_notify", { p_audience: aud, p_title: "", p_body: "", p_team: aud === "team" ? S.notifyTeam && S.notifyTeam.id : null, p_dry_run: true });
      $("#nCount").textContent = `${num(n)} ${n === 1 ? "person" : "people"} will get it.`;
      return n;
    } catch (e) { $("#nCount").textContent = e.message; return 0; }
  }
  $("#nAudience").addEventListener("change", countAudience);
  $("#notifyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showErr("#notifyErr", "");
    const aud = $("#nAudience").value, title = $("#nTitle").value.trim(), body = $("#nBody").value.trim();
    if (title.length < 2) { showErr("#notifyErr", "Write a title."); return; }
    const n = await countAudience();
    if (!n) { showErr("#notifyErr", "Nobody is in that group."); return; }
    if (!confirm(`Send “${title}” to ${num(n)} ${n === 1 ? "person" : "people"}?`)) return;
    const btn = $("#notifyForm button[type=submit]");
    btn.disabled = true;
    try {
      const sent = await rpc("admin_notify", { p_audience: aud, p_title: title, p_body: body, p_team: aud === "team" ? S.notifyTeam.id : null, p_dry_run: false });
      toast(`Sent to ${num(sent)} ${sent === 1 ? "person" : "people"}.`);
      $("#nTitle").value = ""; $("#nBody").value = "";
    } catch (err) { showErr("#notifyErr", err.message); }
    btn.disabled = false;
  });

  /* ---------- activity ---------- */
  async function loadActivity() {
    const list = await busy(null, () => rpc("admin_activity", { p_limit: 150 }));
    if (!list) return;
    $("#actList").innerHTML = list.length ? list.map((a) => `<li><time>${esc(fmt(a.at))}</time><span class="tm">${esc(a.team)}</span><span>${esc(a.text)}</span></li>`).join("")
      : `<li class="muted">Nothing yet.</li>`;
  }

  /* ---------- clicks ---------- */
  document.addEventListener("click", (e) => {
    const tab = e.target.closest(".adm-tabs [data-tab]");
    if (tab) { showTab(tab.dataset.tab); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const d = b.dataset;
    switch (d.act) {
      case "sign-out": return signOut();
      case "change-pw": showErr("#pwErr", ""); pwDlg.showModal(); $("#pw1").focus(); return;
      case "reload": return showTab(S.tab);
      case "more": return loadTeams(false);
      case "export": return exportCsv(b);
      case "place-solos":
        if (confirm("Put everyone who is alone in a team into teams that need their skill (fullest teams first)? Everyone moved gets a notification.")) {
          busy(b, async () => { const n = await rpc("admin_place_solos"); toast(n ? `${num(n)} ${n === 1 ? "person" : "people"} placed into teams.` : "Nobody could be placed: no team has room for their skill."); loadTeams(true); });
        }
        return;
      case "rename": {
        const nm = prompt("New team name:", d.name);
        if (nm && nm.trim() !== d.name) busy(b, async () => { await rpc("admin_rename_team", { p_team: d.team, p_name: nm }); toast("Team renamed."); loadTeams(true); });
        return;
      }
      case "notify-team":
        S.notifyTeam = { id: d.team, name: d.name };
        $("#nTeamOpt").hidden = false;
        $("#nTeamOpt").textContent = `One team: ${d.name}`;
        $("#nAudience").value = "team";
        showTab("notify");
        return;
      case "move":
        S.moving = { id: d.person, name: d.name };
        $("#moveTitle").textContent = `Move ${d.name}`;
        $("#moveSearch").value = "";
        $("#moveList").innerHTML = `<li class="muted">Loading…</li>`;
        moveDlg.showModal();
        loadMoveOptions();
        return;
      case "move-to": return doMove(b, d.team, d.name);
      case "move-auto": return doMove(b, null, "");
      case "remove":
        if (confirm(`Delete ${d.name}'s registration completely? Use this for fake or outsider registrations. It can't be undone.`)) {
          busy(b, async () => { const nm = await rpc("admin_remove_person", { p_person: d.person }); toast(`${nm} was removed.`); loadTeams(true); });
        }
        return;
    }
  });

  start().catch((e) => { console.error(e); $("#admLoading").textContent = "Couldn't load. Check your internet and refresh."; });
})();
