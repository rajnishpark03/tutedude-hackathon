// Sends a phone/laptop notification (Web Push) for every new row in public.notifications.
// It runs as its own small Vercel project ("buildathon-notify"), separate from the site.
// The database trigger bd_send_push() calls it with the notification and that person's devices.
//
// Settings on the Vercel project (Environment Variables, Production):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   from vapid-keys.local.json (the public one is also in config.js)
//   NOTIFY_SECRET                         from vapid-keys.local.json; the same value is in bd_settings
//   VAPID_SUBJECT                         optional: mailto:<email> or an https address
const crypto = require("crypto");
const webpush = require("web-push");

const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("POST only");
  if (!same(req.headers["x-notify-secret"], process.env.NOTIFY_SECRET)) return res.status(403).send("forbidden");

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const record = body.record, subs = Array.isArray(body.subs) ? body.subs.slice(0, 20) : [];
  if (!record || !subs.length) return res.status(200).json({ sent: 0, gone: [], failed: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://buildathon.tutedude.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify({ title: record.title, body: record.body, tag: record.tag, url: record.url });

  let sent = 0, failed = 0;
  const gone = [];   // devices that unsubscribed: the database removes them
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, timeout: 6000 });
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint);
      else { failed++; console.error("push failed", code, e && e.body ? String(e.body).slice(0, 200) : String(e && e.message)); }
    }
  }));
  return res.status(200).json({ sent, gone, failed });
};
