// بيستقبل إشعارات الموبايل حتى لو الموقع مقفول، وبيفتح المشكلة لما تدوس على الإشعار.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "سجل مشاكل الفريق", {
      body: d.body || "",
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      tag: d.tag,
      renotify: Boolean(d.tag),
      dir: "rtl",
      lang: "ar",
      data: { url: d.url || "" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || "";
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.startsWith(self.registration.scope)) {
          await w.focus();
          w.postMessage({ type: "open", hash });
          return;
        }
      }
      await self.clients.openWindow(self.registration.scope + hash);
    })()
  );
});
