/* TuteDude Buildathon: service worker. Shows phone/laptop notifications even when the site is closed. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: "push", data: d }));
    // Always show it: iPhones cancel the subscription when a push shows no notification.
    // The tag makes repeated pushes replace each other instead of piling up.
    await self.registration.showNotification(d.title || "TuteDude Buildathon", {
      body: d.body || "",
      tag: d.tag || undefined,
      renotify: !!d.tag,
      icon: "icon-192.png",
      badge: "icon-192.png",
      data: { url: d.url || "#board" }
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let target = new URL((e.notification.data && e.notification.data.url) || "#board", self.registration.scope).href;
  if (!target.startsWith(self.registration.scope)) target = self.registration.scope + "#board";   // never open another site
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ type: "open", url: target }); return; }
    await self.clients.openWindow(target);
  })());
});
