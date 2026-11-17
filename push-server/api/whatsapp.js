// Sends a WhatsApp template message through WATI to a list of people.
// The database function admin_whatsapp() calls it (organiser panel → Notify → WhatsApp reminder).
// It lives in the same small Vercel project as notify.js ("buildathon-notify").
//
// Settings on the Vercel project (Environment Variables, Production):
//   NOTIFY_SECRET    already there (shared with notify.js; the same value is in bd_settings)
//   WATI_TOKEN       WATI → API Docs → Access Token (with or without the word "Bearer")
//   WATI_API_HOST    optional. WATI → API Docs → API Endpoint, host only. Default https://live-mt-server.wati.io
//   WATI_TEMPLATE    optional. The approved template names in WATI, separated by commas. Default: the names the database sends.
//
// Each person gets one of the templates, picked at random. The database says which variables the template has
// (bd_settings "whatsapp_params", e.g. "name,message,link"). {{message}} is filled here with one of MESSAGES below,
// picked at random for each person, so nobody gets the same line every day.
const crypto = require("crypto");

// One line each: WhatsApp doesn't allow line breaks inside a variable. {team} and {left} are filled in.
const MESSAGES = [   // a plain status update (WhatsApp "utility"): alone in the team, add a teammate, or no prize and no certificate
  "Your team {team} has only 1 member. A team needs at least 2 members to take part. Teams lock in {left}, and a team of 1 is not eligible for prizes or the certificate.",
  "You are the only member of {team}. Add at least 1 teammate before teams lock, or your team will be disqualified and will not be eligible for prizes or certificates.",
  "Teams lock in {left}. {team} still has 1 member, and teams of 1 are disqualified. To stay eligible for prizes and the certificate, add a teammate using your team link.",
  "Reminder: {team} needs at least 1 more member to take part in the Buildathon. Without a second member, the team is disqualified and gets no prize or certificate.",
  "Action needed: {team} has 1 of the minimum 2 members. Share your team link with a teammate before teams lock, so your team stays eligible for prizes and certificates.",
  "Your registration is not complete: {team} has only you. Teams with fewer than 2 members cannot take part, win prizes or receive certificates. Teams lock in {left}.",
  "{team} is not eligible yet because it has only 1 member. Once 1 more person joins using your team link, your team can take part and compete for prizes.",
  "Status of {team}: 1 member, minimum 2 needed. If no one joins before teams lock in {left}, the team is disqualified and is not eligible for prizes or certificates."
];
const leftText = (at) => {
  const h = Math.floor((Number(at) - Date.now()) / 36e5);
  return !(h >= 1) ? "a few hours" : h >= 48 ? Math.floor(h / 24) + " days" : h === 1 ? "1 hour" : h + " hours";
};
const PARAMS_OK = ["name", "team", "link", "message"];

const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const text = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("POST only");
  if (!same(req.headers["x-notify-secret"], process.env.NOTIFY_SECRET)) return res.status(403).send("forbidden");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const seen = new Set();
  const people = (Array.isArray(body.recipients) ? body.recipients : []).slice(0, 5000)
    .map((r) => ({ phone: String((r && r.phone) || "").replace(/\D/g, ""), name: text(r && r.name, 40), team: text(r && r.team, 60), link: text(r && r.link, 200) }))
    .filter((r) => /^[0-9]{10,15}$/.test(r.phone) && !seen.has(r.phone) && seen.add(r.phone));
  const answer = (ok, accepted, failed, error) => res.status(200).json({ whatsapp: true, ok, accepted, failed, error: error || "" });
  if (!people.length) return answer(true, 0, 0);
  const params = String(body.params || "name,team,link").split(",").map((p) => p.trim()).filter((p) => PARAMS_OK.includes(p));
  const fillWith = { left: leftText(body.deadline), teams: Number(body.teams) >= 20 ? String(body.teams) : "Many" };
  people.forEach((p) => {
    const line = MESSAGES[crypto.randomInt(MESSAGES.length)];
    p.message = text(line.replace(/\{(\w+)\}/g, (_, k) => (k === "team" ? p.team || "your team" : fillWith[k] || "")), 600);
  });
  const value = (p, n) => (n === "name" ? p.name || "there" : n === "team" ? p.team || "your team" : n === "link" ? p.link : p.message);

  const token = String(process.env.WATI_TOKEN || "").trim().replace(/^Bearer\s+/i, "");
  const templates = String(process.env.WATI_TEMPLATE || body.template || "").split(",").map((t) => text(t, 100)).filter(Boolean).slice(0, 10);
  if (!token) return answer(false, 0, people.length, "WATI_TOKEN is not set on the Vercel project.");
  if (!templates.length) return answer(false, 0, people.length, "No WATI template name.");
  const host = String(process.env.WATI_API_HOST || "https://live-mt-server.wati.io").trim().replace(/\/+$/, "");

  // one WATI call per template: each person lands in one of them at random
  const groups = new Map(templates.map((t) => [t, []]));
  people.forEach((p) => groups.get(templates[crypto.randomInt(templates.length)]).push(p));
  const errors = [];
  // one call: how many numbers WATI took, or null when it refused the whole call (template not approved yet, bad token…)
  const send = async (template, list) => {
    try {
      const r = await fetch(host + "/api/ext/v3/messageTemplates/send", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: template,
          broadcast_name: (text(body.broadcast, 60) || "buildathon") + "-" + template,
          recipients: list.map((p) => ({
            phone_number: p.phone, local_message_id: p.phone,
            custom_params: params.map((n) => ({ name: n, value: value(p, n) }))
          }))
        }),
        signal: AbortSignal.timeout(20000)
      });
      const raw = await r.text();
      let j = null;
      try { j = JSON.parse(raw); } catch (_) {}
      if (!r.ok || !j || j.success === false) {
        const why = (j && (j.error || j.message)) || raw.slice(0, 200) || "no answer";
        console.error("wati failed", template, r.status, why);
        errors.push(`${template}: WATI answered ${r.status}: ${text(why, 160)}`);
        return null;
      }
      // WATI can answer 200 and still refuse some numbers: a number counts only when it comes back with no errors
      const good = new Set((Array.isArray(j.recipients) ? j.recipients : [])
        .filter((x) => !(Array.isArray(x.errors) && x.errors.length)).map((x) => String(x.local_message_id || x.phone_number || "").replace(/\D/g, "")));
      return list.filter((p) => good.has(p.phone)).length;
    } catch (e) {
      console.error("wati failed", template, String(e && e.message));
      errors.push(`${template}: couldn't reach WATI: ${text(e && e.message, 120)}`);
      return null;
    }
  };
  let accepted = 0, failed = 0, working = "";
  const left = [];   // people whose template was refused as a whole
  await Promise.all([...groups].filter(([, list]) => list.length).map(async ([template, list]) => {
    const n = await send(template, list);
    if (n === null) left.push(...list);
    else { accepted += n; failed += list.length - n; working = working || template; }
  }));
  // a template that is not approved yet must not cost anyone their reminder: they get one that works
  if (left.length) {
    const n = working ? await send(working, left) : null;
    accepted += n || 0; failed += left.length - (n || 0);
  }
  return answer(accepted > 0 || !errors.length, accepted, failed, errors.join(" | ").slice(0, 400));
};
