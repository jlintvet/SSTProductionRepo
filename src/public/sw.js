// public/sw.js — minimal service worker for Web Push notifications.
// Registered from src/lib/pushNotifications.js. Scope is the whole origin
// ("/") since it's served from the site root.
//
// Only handles push delivery + notification click. Does not do any
// offline caching / asset precaching — that's a separate concern this
// app doesn't currently need.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "RipLoc", body: "New activity near you.", url: "/app" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    // Non-JSON push payload — fall back to defaults above.
  }

  const title = payload.title || "RipLoc";
  const options = {
    body: payload.body || "",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: payload.url || "/app" },
    tag: payload.tag || "riploc-live-pin",
  };

  // Tell any open tab(s) to refresh community pins right away, instead of
  // waiting on the page's own 45s poll -- this is what makes the map feel
  // "near real time" when the app is already open and a push lands.
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
        clientsArr.forEach((client) => client.postMessage({ type: "riploc-refresh-community" }));
      }),
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/app";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
