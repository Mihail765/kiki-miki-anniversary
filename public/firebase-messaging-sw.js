// firebase-messaging-sw.js
// Required by FCM — must be at the root of your site, named exactly this.

importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js",
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

// Handle background messages (app is closed or in background)
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Background message received:",
    payload,
  );

  const notificationTitle = payload.notification?.title || "💌 New message";
  const notificationOptions = {
    body: payload.notification?.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: "chat-message",
    renotify: true,
    data: { url: payload.fcmOptions?.link || "/chat.html" },
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// When user taps the notification, open/focus the chat
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/chat.html";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(targetUrl) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      }),
  );
});
