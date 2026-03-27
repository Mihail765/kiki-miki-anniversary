// sw-notif.js — Service Worker for chat notifications
// Place in the ROOT of your website (same folder as chat.html / index.html)

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));

// ── Receive a NOTIFY message posted from the page ─────────────────
// The page calls: swRegistration.active.postMessage({ type: "NOTIFY", ... })
// This works even when the tab is backgrounded / screen locked.
self.addEventListener("message", (e) => {
  if (!e.data || e.data.type !== "NOTIFY") return;
  const { title, body, icon, tag, url } = e.data;
  e.waitUntil(
    self.registration.showNotification(title || "💌 New message", {
      body:     body  || "",
      icon:     icon  || "/favicon.ico",
      badge:    "/favicon.ico",
      tag:      tag   || "chat-msg",
      renotify: true,
      data:     { url: url || "/" },
    })
  );
});

// ── Notification tap → focus or open the chat tab ─────────────────
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const c of list) {
          if (c.url.includes(target) && "focus" in c) return c.focus();
        }
        return clients.openWindow(target);
      })
  );
});