// Service worker: offline shell + web push (plan A only; plan B has no push endpoint).
const SHELL = ["./", "index.html", "app.css", "app.js", "chart.js", "manifest.json"];
self.addEventListener("install", e => e.waitUntil(caches.open("desk-v1").then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.pathname.includes("/d/")) return;               // data: always network
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
self.addEventListener("push", e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.title || "Grok Bot · now", {body: d.body, icon: "icons/icon-192.png", data: {url: d.url}}));
});
self.addEventListener("notificationclick", e => { e.notification.close(); if (e.notification.data && e.notification.data.url) e.waitUntil(clients.openWindow(e.notification.data.url)); });
