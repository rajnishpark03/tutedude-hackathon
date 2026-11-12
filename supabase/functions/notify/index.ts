// Supabase Edge Function "notify": sends a phone/laptop notification (Web Push)
// for every new row in public.notifications. supabase.sql calls it from a trigger.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  from vapid-keys.local.json
//   VAPID_SUBJECT                        mailto:<an email you own>
//   NOTIFY_SECRET                        any long random text; the same value goes in bd_settings
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Turn OFF "Verify JWT" for this function: the database calls it with NOTIFY_SECRET instead.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:buildathon@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.headers.get("x-notify-secret") !== Deno.env.get("NOTIFY_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const { record } = await req.json().catch(() => ({ record: null }));
  if (!record?.person_id) return new Response("nothing to send");

  const { data: subs, error } = await sb
    .from("push_subs")
    .select("endpoint, p256dh, auth")
    .eq("person_id", record.person_id);
  if (error) return new Response(error.message, { status: 500 });

  const payload = JSON.stringify({ title: record.title, body: record.body, tag: record.tag, url: record.url });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); // device unsubscribed
      else console.error("push failed", code, e);
    }
  }));
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
