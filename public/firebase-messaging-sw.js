importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js",
);

firebase.initializeApp({
  apiKey: "AIzaSyBAFE26kDmBhZaF9nFP1h8RtKVzXq-7E8s",
  authDomain: "kikimikianniversary.firebaseapp.com",
  projectId: "kikimikianniversary",
  storageBucket: "kikimikianniversary.firebasestorage.app",
  messagingSenderId: "841345372926",
  appId: "1:841345372926:web:3a41d189f65a7dc14b8baf",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "💌 New message";
  const body = payload.notification?.body || "You have a new message";
  return self.registration.showNotification(title, {
    body,
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "chat-message",
    renotify: true,
    data: { url: "/chat.html" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat.html";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes("chat.html") && "focus" in client)
            return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
      }),
  );
});
