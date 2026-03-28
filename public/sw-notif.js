// sw-notif.js — Service Worker for chat notifications
// Place in the ROOT of your website (same folder as chat.html / index.html)

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

// ─── FIREBASE CONFIG ─────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            "AIzaSyBAFEz6kDmBhZaF9nFP1h8RtkVzXq-7E8s",
  authDomain:        "kikimikianniversary.firebaseapp.com",
  projectId:         "kikimikianniversary",
  storageBucket:     "kikimikianniversary.firebasestorage.app",
  messagingSenderId: "841345372926",
  appId:             "1:841345372926:web:3a41d189f65a7dc14b8baf"
});

const messaging = firebase.messaging();

// ── INSTALL & ACTIVATE ───────────────────────────────────────────
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// ── LAYER 2: Tab backgrounded, Chrome still open ─────────────────
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'NOTIFY') return;
  const { title, body, icon, tag, url } = event.data;
  event.waitUntil(
    self.registration.showNotification(title || '💌 New message', {
      body:     body  || '',
      icon:     icon  || '/favicon.ico',
      badge:    '/favicon.ico',
      tag:      tag   || 'chat-message',
      renotify: true,
      data:     { url: url || '/chat.html' },
    })
  );
});

// ── LAYER 3: Chrome fully closed / phone locked ──────────────────
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || '💌 New message';
  const body  = payload.notification?.body  || 'You have a new message';
  return self.registration.showNotification(title, {
    body,
    icon:     '/favicon.ico',
    badge:    '/favicon.ico',
    tag:      'chat-message',
    renotify: true,
    data:     { url: '/chat.html' }
  });
});

// ── NOTIFICATION CLICK ───────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/chat.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('chat.html') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});