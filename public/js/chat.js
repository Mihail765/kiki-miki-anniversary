// ─── WHO AM I? ───────────────────────────────────────────────────
const WHO = localStorage.getItem("mk_user") || "mikica";
const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };
const AVATARS = { mikica: "💙", kikica: "💗" };
const CHAT_ID = "mikica_kikica_chat";

// ─── FIREBASE REFS ───────────────────────────────────────────────
const storage = firebase.storage();
const messagesRef = db.collection("chats").doc(CHAT_ID).collection("messages");
const typingRef = db.collection("chats").doc(CHAT_ID).collection("typing");
const readRef = db.collection("chats").doc(CHAT_ID).collection("readStatus");

// ─── ELEMENTS ────────────────────────────────────────────────────
const msgContainer = document.getElementById("messages-container");
const emptyState = document.getElementById("empty-state");
const msgInput = document.getElementById("msg-input");
const sendBtn = document.getElementById("send-btn");
const fileInput = document.getElementById("file-input");
const imgPreviewBar = document.getElementById("img-preview-bar");
const previewScroll = document.getElementById("preview-scroll");
const previewCountLabel = document.getElementById("preview-count-label");
const clearAllBtn = document.getElementById("clear-all-btn");
const addMoreBtn = document.getElementById("add-more-btn");
const emojiToggleBtn = document.getElementById("emoji-toggle-btn");
const emojiTray = document.getElementById("emoji-tray");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightbox-img");
const lightboxClose = document.getElementById("lightbox-close");
const lightboxCounter = document.getElementById("lightbox-counter");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");
const typingIndicator = document.getElementById("typing-indicator");
const uploadProgress = document.getElementById("upload-progress");
const uploadProgressBar = document.getElementById("upload-progress-bar");
const loader = document.getElementById("loader");
const notifBanner = document.getElementById("notif-banner");
const notifAllowBtn = document.getElementById("notif-allow-btn");
const notifDismissBtn = document.getElementById("notif-dismiss-btn");
const scrollToBottomBtn = document.getElementById("scroll-to-bottom");
const replyBar = document.getElementById("reply-bar");

// Camera
const cameraBtn = document.getElementById("camera-btn");
const cameraModal = document.getElementById("camera-modal");
const cameraFeed = document.getElementById("camera-feed");
const cameraLiveWrap = document.getElementById("camera-live-wrap");
const cameraPreviewWrap = document.getElementById("camera-preview-wrap");
const cameraPreviewImg = document.getElementById("camera-preview-img");
const snapBtn = document.getElementById("snap-btn");
const snapCanvas = document.getElementById("snap-canvas");
const closeCameraBtn = document.getElementById("close-camera-btn");
const flipCameraBtn = document.getElementById("flip-camera-btn");
const retakeBtn = document.getElementById("retake-btn");
const usePhotoBtn = document.getElementById("use-photo-btn");

// ─── STATE ───────────────────────────────────────────────────────
let selectedFiles = [];
let typingTimeout = null;
let isTyping = false;
let firstLoad = true;
let partnerReadTime = null;
let lbImages = [];
let lbIndex = 0;
let cameraStream = null;
let facingMode = "environment";
let capturedBlob = null;
let unreadInserted = false;
let lastReadTimestamp = null;

// ─── BOTTOM-LOCK ─────────────────────────────────────────────────
let isAtBottom = true;
let unreadWhileScrolled = 0;

// ─── RENDERING STATE ─────────────────────────────────────────────
let lastDate = null;
let lastSender = null;

// Message id → DOM row (for reply jump-to, tick updates)
const msgRowMap = new Map();

// ─── REPLY STATE ─────────────────────────────────────────────────
let replyingTo = null; // { id, sender, text, imageUrl }

// ─── REACTION STATE ───────────────────────────────────────────────
const DEFAULT_QUICK_REACTIONS = ["❤️", "😂", "😘", "🥺", "😍", "👍"];
const DEFAULT_DOUBLE_TAP_EMOJI = "❤️";

// In-memory capsule — loaded from Firestore once on init, updated on save
let _capsuleEmojis = [...DEFAULT_QUICK_REACTIONS];
let _doubleTapEmoji = DEFAULT_DOUBLE_TAP_EMOJI;

// Firestore ref for this user's private capsule (lives under users/{WHO}/capsule/settings)
const capsuleRef = db.collection("users").doc(WHO).collection("capsule").doc("settings");

async function loadCapsuleFromFirestore() {
  try {
    const snap = await capsuleRef.get();
    if (snap.exists) {
      const data = snap.data();
      if (Array.isArray(data.emojis) && data.emojis.length > 0) {
        _capsuleEmojis = data.emojis;
      }
      if (data.doubleTapEmoji) {
        _doubleTapEmoji = data.doubleTapEmoji;
      }
    }
  } catch (e) {
    console.warn("Could not load capsule from Firestore, using defaults:", e);
    // Fallback: try localStorage
    try {
      const saved = localStorage.getItem("mk_quick_reactions");
      if (saved) _capsuleEmojis = JSON.parse(saved);
    } catch (_) {}
  }
}

async function saveCapsuleToFirestore(emojis, doubleTapEmoji) {
  _capsuleEmojis = emojis;
  _doubleTapEmoji = doubleTapEmoji;
  // Also write to localStorage as instant offline cache
  try { localStorage.setItem("mk_quick_reactions", JSON.stringify(emojis)); } catch (_) {}
  try {
    await capsuleRef.set({
      emojis,
      doubleTapEmoji,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("Could not save capsule to Firestore:", e);
  }
}

function getQuickReactions() { return _capsuleEmojis; }
function getDoubleTapEmoji() { return _doubleTapEmoji; }

// Legacy shim — still used by picker to save individual slots
function saveQuickReactions(arr) {
  saveCapsuleToFirestore(arr, _doubleTapEmoji);
}

const ALL_REACTION_EMOJIS = [
  "❤️","😂","😘","🥺","😍","👍","💕","💖","💗","🥰","💋","🌹","✨",
  "😊","💌","🎀","🌸","💞","💓","💝","🙈","🫶","😭","🤣","😅","😆",
  "🔥","💯","🎉","✅","👏","🙏","💀","😤","🥳","😇","🤩","😜","😎",
  "💫","⭐","🌙","🎶","🤍","💭","🫠","🩷","💙","💚","💛","🧡","🤎","🖤",
];

let activeReactionBar = null;
let reactionBarMsgId = null;
let longPressTimer = null;

// ─── SCROLL RESTORATION ──────────────────────────────────────────
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

function fixChatViewport() {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    document.body.style.overflow = "";
    msgContainer.scrollTop = msgContainer.scrollHeight;
  });
}

window.addEventListener("load", fixChatViewport);
window.addEventListener("pageshow", () => {
  fixChatViewport();
  setTimeout(fixChatViewport, 100);
});

// ─── BOTTOM-LOCK SCROLL TRACKING ─────────────────────────────────
const BOTTOM_THRESHOLD = 120;

function checkScrollPosition() {
  const distFromBottom =
    msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight;
  isAtBottom = distFromBottom < BOTTOM_THRESHOLD;

  if (isAtBottom) {
    unreadWhileScrolled = 0;
    scrollToBottomBtn.classList.remove("visible");
    scrollToBottomBtn.textContent = "↓";
    const badge = scrollToBottomBtn.querySelector(".unread-badge");
    if (badge) badge.remove();
  } else {
    scrollToBottomBtn.classList.add("visible");
    if (unreadWhileScrolled > 0) {
      // Show "N new ↓" label inside the button
      scrollToBottomBtn.textContent = "";
      const countStr = unreadWhileScrolled > 99 ? "99+" : String(unreadWhileScrolled);
      let badge = scrollToBottomBtn.querySelector(".unread-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "unread-badge";
        scrollToBottomBtn.appendChild(badge);
      }
      badge.textContent = countStr + " new";
    }
  }
}

msgContainer.addEventListener("scroll", checkScrollPosition, { passive: true });

scrollToBottomBtn.addEventListener("click", () => {
  scrollToBottom(true);
  unreadWhileScrolled = 0;
  scrollToBottomBtn.classList.remove("visible");
});

function scrollToBottom(smooth = true) {
  if (smooth) {
    msgContainer.scrollTo({ top: msgContainer.scrollHeight, behavior: "smooth" });
  } else {
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const isInStandaloneMode =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
let swRegistration = null;

async function initNotifications() {
  if ("serviceWorker" in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    } catch (e) {
      console.warn("SW registration failed:", e);
    }
  }
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    await registerFCMToken();
    return;
  }
  if (Notification.permission === "denied") return;
  if (isIOS && !isInStandaloneMode) {
    notifBanner.querySelector("span").textContent =
      '📲 To get message notifications on iPhone, tap Share → "Add to Home Screen", then open from there!';
    notifAllowBtn.style.display = "none";
    setTimeout(() => notifBanner.classList.add("visible"), 1800);
    return;
  }
  setTimeout(() => notifBanner.classList.add("visible"), 1500);
}

notifAllowBtn.addEventListener("click", async () => {
  let perm;
  try {
    perm = await Notification.requestPermission();
  } catch (e) {
    perm = await new Promise((resolve) => Notification.requestPermission(resolve));
  }
  notifBanner.classList.remove("visible");
  if (perm === "granted") {
    showMiniNotif("🔔 Notifications enabled! You'll know when a message arrives 💌");
    await registerFCMToken();
    setTimeout(() => sendBrowserNotif("System", "Notifications are working! 💌", null, true), 800);
  } else {
    showMiniNotif("⚠️ Permission denied — check your browser settings");
  }
});

notifDismissBtn.addEventListener("click", () => notifBanner.classList.remove("visible"));

async function sendBrowserNotif(senderName, text, imageUrl, force = false) {
  if (Notification.permission !== "granted") return;
  if (!force && !document.hidden) return;
  const title = `${senderName} 💌`;
  const body = text || (imageUrl ? "📷 Sent a photo" : "New message");
  if (swRegistration && swRegistration.active) {
    try {
      swRegistration.active.postMessage({ type: "NOTIFY", title, body, icon: "favicon.ico", tag: "chat-message", url: window.location.href });
      return;
    } catch (e) {}
  }
  try {
    const notif = new Notification(title, { body, icon: "favicon.ico", badge: "favicon.ico", tag: "chat-message", renotify: true });
    notif.onclick = () => { window.focus(); notif.close(); };
    setTimeout(() => notif.close(), 6000);
  } catch (e) {}
}

function showMiniNotif(text) {
  const el = document.createElement("div");
  el.style.cssText = `
    position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
    background:var(--rose);color:white;
    padding:8px 18px;border-radius:20px;font-size:0.82rem;
    box-shadow:0 4px 16px rgba(204,51,102,0.3);
    z-index:9997;animation:fadeIn 0.3s ease;
    font-family:'Quicksand',sans-serif;font-weight:600;
    white-space:nowrap;
  `;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ─── READ STATUS ─────────────────────────────────────────────────
function updateMyReadTime() {
  readRef.doc(WHO).set({
    lastRead: firebase.firestore.FieldValue.serverTimestamp(),
    user: WHO,
  });
}

const partner = WHO === "mikica" ? "kikica" : "mikica";
readRef.doc(partner).onSnapshot((snap) => {
  if (snap.exists) {
    const data = snap.data();
    partnerReadTime = data.lastRead ? data.lastRead.toDate() : null;
    updateAllTicks();
  }
});

function updateAllTicks() {
  if (!partnerReadTime) return;
  document.querySelectorAll(".msg-row.sent[data-ts]").forEach((row) => {
    const ts = new Date(parseInt(row.dataset.ts));
    const tickEl = row.querySelector(".tick");
    if (!tickEl) return;
    if (partnerReadTime >= ts) {
      tickEl.textContent = "✓✓";
      tickEl.className = "tick read";
      tickEl.title = "Read";
    } else {
      tickEl.textContent = "✓✓";
      tickEl.className = "tick delivered";
      tickEl.title = "Delivered";
    }
  });
}

// ─── EMOJIS ──────────────────────────────────────────────────────
const EMOJIS = ["❤️","💕","💖","💗","😍","🥰","😘","💋","🌹","✨","😊","🥺","💌","🎀","🌸","💞","💓","💝","😂","🙈","🫶","💑","🥂","🌙","⭐","🎶","🤍","💭","🫠","🩷"];

const emojiFragment = document.createDocumentFragment();
EMOJIS.forEach((e) => {
  const btn = document.createElement("button");
  btn.className = "emoji-btn";
  btn.textContent = e;
  btn.addEventListener("click", () => {
    insertAtCursor(msgInput, e);
    msgInput.focus();
  });
  emojiFragment.appendChild(btn);
});
emojiTray.appendChild(emojiFragment);

emojiToggleBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  emojiTray.classList.toggle("open");
});
document.addEventListener("click", () => emojiTray.classList.remove("open"));

function insertAtCursor(el, text) {
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
}

// ─── AUTO-RESIZE TEXTAREA ─────────────────────────────────────────
msgInput.addEventListener("input", () => {
  msgInput.style.height = "auto";
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + "px";
  handleTyping();
});

// ─── MULTI-FILE SELECT ────────────────────────────────────────────
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  addFilesToSelection(files);
  fileInput.value = "";
});

addMoreBtn.addEventListener("click", () => fileInput.click());

function addFilesToSelection(files) {
  selectedFiles = [...selectedFiles, ...files].slice(0, 10);
  renderPreviewBar();
}

function renderPreviewBar() {
  previewScroll.querySelectorAll(".preview-item").forEach((el) => el.remove());
  const frag = document.createDocumentFragment();
  selectedFiles.forEach((file, idx) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    const removeBtn = document.createElement("button");
    removeBtn.className = "preview-remove";
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      selectedFiles.splice(idx, 1);
      renderPreviewBar();
    });
    item.appendChild(img);
    item.appendChild(removeBtn);
    frag.appendChild(item);
  });
  previewScroll.insertBefore(frag, addMoreBtn);
  previewCountLabel.textContent = `${selectedFiles.length} image${selectedFiles.length !== 1 ? "s" : ""} selected`;
  imgPreviewBar.classList.toggle("visible", selectedFiles.length > 0);
}

clearAllBtn.addEventListener("click", () => { selectedFiles = []; renderPreviewBar(); });

// ─── TYPING INDICATOR ─────────────────────────────────────────────
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    typingRef.doc(WHO).set({ typing: true, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    typingRef.doc(WHO).set({ typing: false });
  }, 2000);
}

typingRef.doc(partner).onSnapshot((snap) => {
  if (snap.exists && snap.data().typing) {
    typingIndicator.textContent = SENDER_DISPLAY[partner] + " is typing…";
    typingIndicator.style.display = "inline";
  } else {
    typingIndicator.style.display = "none";
  }
});

// ─── REPLY SYSTEM ─────────────────────────────────────────────────
function startReply(msg, id) {
  replyingTo = {
    id,
    sender: msg.sender,
    text: msg.text || null,
    imageUrl: msg.imageUrls ? msg.imageUrls[0] : (msg.imageUrl || null),
  };

  replyBar.innerHTML = "";
  const indicator = document.createElement("div");
  indicator.className = "reply-bar-indicator";

  const content = document.createElement("div");
  content.className = "reply-bar-content";

  const senderEl = document.createElement("div");
  senderEl.className = "reply-bar-sender";
  senderEl.textContent = "↩ " + (SENDER_DISPLAY[msg.sender] || msg.sender);

  const textEl = document.createElement("div");
  textEl.className = "reply-bar-text";
  textEl.textContent = msg.text || (msg.imageUrls || msg.imageUrl ? "📷 Photo" : "");

  content.appendChild(senderEl);
  content.appendChild(textEl);

  const closeBtn = document.createElement("button");
  closeBtn.className = "reply-bar-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", cancelReply);

  replyBar.appendChild(indicator);
  replyBar.appendChild(content);
  replyBar.appendChild(closeBtn);
  replyBar.classList.add("visible");
  scrollToBottomBtn.classList.add("reply-open");

  msgInput.focus();
}

function cancelReply() {
  replyingTo = null;
  replyBar.classList.remove("visible");
  scrollToBottomBtn.classList.remove("reply-open");
}

// ─── SEND MESSAGE ─────────────────────────────────────────────────
sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

async function sendMessage() {
  const text = msgInput.value.trim();
  if (!text && selectedFiles.length === 0) return;

  sendBtn.disabled = true;
  msgInput.value = "";
  msgInput.style.height = "";
  isTyping = false;
  typingRef.doc(WHO).set({ typing: false });

  const filesToSend = [...selectedFiles];
  const currentReply = replyingTo;
  selectedFiles = [];
  renderPreviewBar();
  cancelReply();

  try {
    let imageUrls = [];
    if (filesToSend.length > 0) {
      imageUrls = await uploadImagesWithProgress(filesToSend);
    }

    const msgData = {
      sender: WHO,
      text: text || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      imageUrl: imageUrls.length === 1 ? imageUrls[0] : null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      readBy: [WHO],
    };

    if (currentReply) {
      msgData.replyTo = {
        id: currentReply.id,
        sender: currentReply.sender,
        text: currentReply.text || null,
        imageUrl: currentReply.imageUrl || null,
      };
    }

    await messagesRef.add(msgData);
    updateMyReadTime();
  } catch (err) {
    console.error("Send error:", err);
    alert("Couldn't send message: " + err.message);
  } finally {
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

// ─── UPLOAD IMAGES ────────────────────────────────────────────────
async function uploadImagesWithProgress(files) {
  uploadProgress.style.display = "block";
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const progressBase = (i / files.length) * 100;
    const progressChunk = (1 / files.length) * 100;
    uploadProgressBar.style.width = progressBase + "%";
    try {
      const url = await uploadSingleImage(files[i], progressBase, progressChunk);
      urls.push(url);
    } catch (e) {
      console.error("Upload failed for one image:", e);
    }
  }
  uploadProgressBar.style.width = "100%";
  setTimeout(() => {
    uploadProgress.style.display = "none";
    uploadProgressBar.style.width = "0%";
  }, 400);
  return urls;
}

async function uploadSingleImage(file, progressBase, progressChunk) {
  try {
    const compressed = await compressImage(file);
    const formData = new FormData();
    formData.append("file", compressed);
    formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
    formData.append("folder", "chat");
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`,
      { method: "POST", body: formData }
    );
    if (!res.ok) throw new Error("Cloudinary upload failed");
    const data = await res.json();
    uploadProgressBar.style.width = progressBase + progressChunk + "%";
    return data.secure_url;
  } catch (err) {
    const ref = storage.ref(`chat/${Date.now()}_${file.name}`);
    const task = ref.put(file);
    return new Promise((resolve, reject) => {
      task.on(
        "state_changed",
        (snap) => {
          const pct = progressBase + (snap.bytesTransferred / snap.totalBytes) * progressChunk;
          uploadProgressBar.style.width = pct + "%";
        },
        reject,
        async () => resolve(await task.snapshot.ref.getDownloadURL())
      );
    });
  }
}

async function compressImage(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob || file), file.type || "image/jpeg", quality);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ─── RENDER MESSAGE ───────────────────────────────────────────────
let _pendingFirstBatch = [];
let _firstBatchTimer = null;

// ─── IntersectionObserver for lazy image loading ──────────────────
const _imgObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      const img = entry.target;
      if (img.dataset.lazySrc) {
        img.src = img.dataset.lazySrc;
        delete img.dataset.lazySrc;
        _imgObserver.unobserve(img);
      }
    }
  });
}, { rootMargin: "200px" });

function flushFirstBatch() {
  if (!_pendingFirstBatch.length) return;

  if (emptyState.parentNode) emptyState.remove();

  lastDate = null;
  lastSender = null;

  const frag = document.createDocumentFragment();
  _pendingFirstBatch.forEach(({ msg, id }) => {
    const els = buildMessageElements(msg, id, false);
    els.forEach((el) => frag.appendChild(el));
    msgRowMap.set(id, frag.lastElementChild);
  });
  msgContainer.appendChild(frag);

  // Register lazy images with observer after DOM insertion
  msgContainer.querySelectorAll("img[data-lazy-src]").forEach((img) => _imgObserver.observe(img));

  _pendingFirstBatch = [];
  _firstBatchTimer = null;

  // Use double-rAF so layout is fully calculated before scrolling
  requestAnimationFrame(() => requestAnimationFrame(() => {
    msgContainer.scrollTop = msgContainer.scrollHeight;
    loader.style.display = "none";
    updateMyReadTime();
    updateAllTicks();
    checkScrollPosition();
  }));
}

function renderMessage(msg, id, animate = true) {
  if (!animate) {
    _pendingFirstBatch.push({ msg, id });
    clearTimeout(_firstBatchTimer);
    _firstBatchTimer = setTimeout(flushFirstBatch, 60);
    return;
  }

  if (emptyState.parentNode) emptyState.remove();

  const els = buildMessageElements(msg, id, true);
  const frag = document.createDocumentFragment();
  els.forEach((el) => frag.appendChild(el));
  msgContainer.appendChild(frag);

  // Observe any new lazy images
  msgContainer.querySelectorAll("img[data-lazy-src]").forEach((img) => _imgObserver.observe(img));

  const row = msgContainer.lastElementChild;
  if (id) msgRowMap.set(id, row);

  if (isAtBottom) {
    requestAnimationFrame(() => scrollToBottom(true));
  } else {
    if (msg.sender !== WHO) {
      unreadWhileScrolled++;
      checkScrollPosition();
    }
  }
}

function buildMessageElements(msg, id, animate) {
  const elements = [];
  const isSent = msg.sender === WHO;
  const ts = msg.timestamp ? msg.timestamp.toDate() : new Date();
  const tsMs = ts.getTime();

  const dateStr = ts.toLocaleDateString("mk-MK", { weekday: "long", month: "long", day: "numeric" });
  if (dateStr !== lastDate) {
    lastDate = dateStr;
    const sep = document.createElement("div");
    sep.className = "date-separator";
    sep.textContent = dateStr;
    elements.push(sep);
    lastSender = null;
  }

  const consecutive = lastSender === msg.sender;
  lastSender = msg.sender;

  const row = document.createElement("div");
  row.className = `msg-row ${isSent ? "sent" : "recv"}${consecutive ? " consecutive" : ""}`;
  if (animate) row.classList.add("animate-in");
  row.dataset.id = id || "";
  if (isSent) row.dataset.ts = tsMs;

  // Swipe-to-reply icon placeholder
  const swipeIcon = document.createElement("span");
  swipeIcon.className = "swipe-reply-icon";
  swipeIcon.textContent = "↩";
  row.appendChild(swipeIcon);

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  if (consecutive) {
    avatar.style.visibility = "hidden";
  } else {
    avatar.textContent = AVATARS[msg.sender] || "👤";
  }

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  // Reply preview (quoted message)
  if (msg.replyTo) {
    const replyDiv = document.createElement("div");
    replyDiv.className = "reply-preview";

    const replySndr = document.createElement("div");
    replySndr.className = "reply-preview-sender";
    replySndr.textContent = SENDER_DISPLAY[msg.replyTo.sender] || msg.replyTo.sender;

    const replyTxt = document.createElement("div");
    replyTxt.className = "reply-preview-text";
    replyTxt.textContent = msg.replyTo.text || (msg.replyTo.imageUrl ? "📷 Photo" : "");

    if (msg.replyTo.imageUrl) {
      const replyImg = document.createElement("img");
      replyImg.className = "reply-preview-img";
      replyImg.src = msg.replyTo.imageUrl;
      replyImg.loading = "lazy";
      replyDiv.appendChild(replyImg);
    }

    replyDiv.appendChild(replySndr);
    replyDiv.appendChild(replyTxt);

    replyDiv.addEventListener("click", () => jumpToMessage(msg.replyTo.id));
    bubble.appendChild(replyDiv);
  }

  // Images
  const images = msg.imageUrls ? msg.imageUrls : msg.imageUrl ? [msg.imageUrl] : [];
  if (images.length > 0) {
    const gridWrap = document.createElement("div");
    gridWrap.className = "img-grid-wrap";

    const MAX_SHOWN = 6;
    const showCount = Math.min(images.length, MAX_SHOWN);
    const countClass =
      images.length === 1 ? "count-1"
      : images.length === 2 ? "count-2"
      : images.length === 3 ? "count-3"
      : images.length === 4 ? "count-4"
      : "count-many";

    const grid = document.createElement("div");
    grid.className = `img-grid ${countClass}`;

    for (let i = 0; i < showCount; i++) {
      const gridImg = document.createElement("img");
      gridImg.className = "grid-img";
      gridImg.alt = `Image ${i + 1}`;
      gridImg.loading = "lazy";
      gridImg.decoding = "async";

      gridImg.addEventListener("load", () => gridImg.classList.add("loaded"), { once: true });
      gridImg.src = images[i];

      if (i === MAX_SHOWN - 1 && images.length > MAX_SHOWN) {
        const cellWrap = document.createElement("div");
        cellWrap.style.position = "relative";
        cellWrap.appendChild(gridImg);
        const overlay = document.createElement("div");
        overlay.className = "more-overlay";
        overlay.textContent = `+${images.length - MAX_SHOWN + 1}`;
        overlay.addEventListener("click", () => openLightbox(images, MAX_SHOWN - 1));
        cellWrap.appendChild(overlay);
        grid.appendChild(cellWrap);
      } else {
        const idx = i;
        gridImg.addEventListener("click", () => openLightbox(images, idx));
        grid.appendChild(gridImg);
      }
    }

    gridWrap.appendChild(grid);
    bubble.appendChild(gridWrap);
  }

  if (msg.text) {
    const p = document.createElement("p");
    p.className = "bubble-text";
    p.textContent = msg.text;
    bubble.appendChild(p);
  }

  wrap.appendChild(bubble);

  // Time + ticks
  const timeRow = document.createElement("span");
  timeRow.className = "msg-time";
  timeRow.appendChild(document.createTextNode(
    ts.toLocaleTimeString("mk-MK", { hour: "2-digit", minute: "2-digit" }) + " "
  ));

  if (isSent) {
    const tickSpan = document.createElement("span");
    tickSpan.className = "read-status";
    const tick = document.createElement("span");
    tick.className = "tick delivered";
    tick.textContent = "✓✓";
    tick.title = "Delivered";
    tickSpan.appendChild(tick);
    timeRow.appendChild(tickSpan);
  }

  wrap.appendChild(timeRow);
  row.appendChild(avatar);
  row.appendChild(wrap);

  // Attach swipe-to-reply gesture
  attachSwipeReply(row, msg, id || "");

  // Attach reactions (long-press bar + double-tap heart)
  if (id) {
    attachReactions(row, msg, id);
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      renderReactions(wrap, msg.reactions, id);
    }
    watchReactions(id, wrap);
    // Desktop 3-dot hover menu
    attachHoverActions(row, msg, id);
  }

  elements.push(row);
  return elements;
}

// ─── REACTIONS ────────────────────────────────────────────────────

async function saveReaction(msgId, emoji) {
  const ref = messagesRef.doc(msgId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const reactions = snap.data().reactions || {};
  if (reactions[WHO] === emoji) {
    await ref.update({ [`reactions.${WHO}`]: firebase.firestore.FieldValue.delete() });
  } else {
    await ref.update({ [`reactions.${WHO}`]: emoji });
  }
}

function renderReactions(wrap, reactions, msgId) {
  const existing = wrap.querySelector(".reaction-row");
  if (existing) existing.remove();

  if (!reactions || Object.keys(reactions).length === 0) return;

  const counts = {};
  for (const [user, emoji] of Object.entries(reactions)) {
    counts[emoji] = (counts[emoji] || { emoji, users: [] });
    counts[emoji].users.push(user);
  }

  const row = document.createElement("div");
  row.className = "reaction-row";

  for (const { emoji, users } of Object.values(counts)) {
    const pill = document.createElement("button");
    pill.className = "reaction-pill" + (users.includes(WHO) ? " mine" : "");
    pill.innerHTML = `<span class="reaction-emoji">${emoji}</span>${users.length > 1 ? `<span class="reaction-count">${users.length}</span>` : ""}`;
    pill.title = users.map((u) => SENDER_DISPLAY[u] || u).join(", ");
    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      saveReaction(msgId, emoji);
    });
    row.appendChild(pill);
  }

  wrap.appendChild(row);
}

function closeReactionBar() {
  if (activeReactionBar) {
    activeReactionBar.classList.remove("visible");
    const el = activeReactionBar;
    setTimeout(() => el.remove(), 200);
    activeReactionBar = null;
    reactionBarMsgId = null;
  }
}

function openReactionBar(msgId, row, msg) {
  closeReactionBar();

  if (navigator.vibrate) navigator.vibrate([10, 30, 10]);

  const bar = document.createElement("div");
  bar.className = "reaction-bar";
  const isSent = row.classList.contains("sent");
  bar.classList.add(isSent ? "reaction-bar-sent" : "reaction-bar-recv");

  const quickReactions = getQuickReactions();
  quickReactions.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.className = "reaction-bar-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveReaction(msgId, emoji);
      btn.classList.add("pop");
      setTimeout(closeReactionBar, 160);
    });
    bar.appendChild(btn);
  });

  const plusBtn = document.createElement("button");
  plusBtn.className = "reaction-bar-btn reaction-bar-plus";
  plusBtn.textContent = "＋";
  plusBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeReactionBar();
    openReactionPicker(msgId, row);
  });
  bar.appendChild(plusBtn);

  const wrap = row.querySelector(".bubble-wrap");
  wrap.appendChild(bar);

  activeReactionBar = bar;
  reactionBarMsgId = msgId;

  requestAnimationFrame(() => bar.classList.add("visible"));
}

function openReactionPicker(msgId, row) {
  const overlay = document.createElement("div");
  overlay.className = "reaction-picker-overlay";

  const sheet = document.createElement("div");
  sheet.className = "reaction-picker-sheet";

  const title = document.createElement("div");
  title.className = "reaction-picker-title";
  title.textContent = "React with…";
  sheet.appendChild(title);

  // ── Mode: "react" (tap emoji → react to message) or "edit" (tap slot → pick replacement) ──
  // Default mode is react. Tapping a capsule slot switches to edit mode for that slot.
  let editMode = null; // null = react mode, "slot-N" = editing slot N, "default" = editing default emoji

  // ── Capsule section ──
  const capsuleLabel = document.createElement("div");
  capsuleLabel.className = "reaction-picker-section-label";
  capsuleLabel.textContent = "Your capsule — tap a slot to edit it";
  sheet.appendChild(capsuleLabel);

  const quickRow = document.createElement("div");
  quickRow.className = "reaction-picker-quick-row";
  const currentQuick = getQuickReactions();
  const workingQuick = [...currentQuick]; // local copy for editing, only saved on Done

  function renderQuickSlots() {
    quickRow.innerHTML = "";
    workingQuick.forEach((emoji, idx) => {
      const slot = document.createElement("button");
      slot.className = "reaction-picker-quick-slot";
      slot.textContent = emoji;
      slot.title = "Tap to select this slot for editing";
      slot.dataset.slotIdx = idx;
      if (editMode === `slot-${idx}`) slot.classList.add("active-slot");
      slot.addEventListener("click", () => {
        if (editMode === `slot-${idx}`) {
          // deselect
          editMode = null;
        } else {
          editMode = `slot-${idx}`;
        }
        renderQuickSlots();
        updateModeHint();
      });
      quickRow.appendChild(slot);
    });
  }
  renderQuickSlots();
  sheet.appendChild(quickRow);

  // ── Default double-tap emoji ──
  const defaultLabel = document.createElement("div");
  defaultLabel.className = "reaction-picker-section-label";
  defaultLabel.textContent = "Double-tap emoji (shown on double-tap)";
  sheet.appendChild(defaultLabel);

  const defaultRow = document.createElement("div");
  defaultRow.className = "reaction-picker-default-row";

  let workingDefault = getDoubleTapEmoji();

  const defaultSlot = document.createElement("button");
  defaultSlot.className = "reaction-picker-default-slot";
  defaultSlot.title = "Tap to change your double-tap emoji";

  function renderDefaultSlot() {
    defaultSlot.innerHTML = "";
    const emojiSpan = document.createElement("span");
    emojiSpan.textContent = workingDefault;
    const labelSpan = document.createElement("span");
    labelSpan.className = "default-slot-label";
    labelSpan.textContent = "double-tap";
    defaultSlot.appendChild(emojiSpan);
    defaultSlot.appendChild(labelSpan);
    if (editMode === "default") defaultSlot.classList.add("active-slot");
    else defaultSlot.classList.remove("active-slot");
  }
  renderDefaultSlot();

  defaultSlot.addEventListener("click", () => {
    editMode = editMode === "default" ? null : "default";
    renderDefaultSlot();
    renderQuickSlots();
    updateModeHint();
  });
  defaultRow.appendChild(defaultSlot);
  sheet.appendChild(defaultRow);

  // ── Mode hint ──
  const modeHint = document.createElement("div");
  modeHint.className = "reaction-picker-subtitle";
  function updateModeHint() {
    if (editMode === null) {
      modeHint.textContent = "Tap an emoji below to react — or tap a capsule slot above to edit it";
    } else if (editMode === "default") {
      modeHint.textContent = "Now tap any emoji below to set your double-tap default ↓";
    } else {
      const idx = parseInt(editMode.split("-")[1]);
      modeHint.textContent = `Editing capsule slot ${idx + 1} — tap an emoji below to replace it ↓`;
    }
  }
  updateModeHint();
  sheet.appendChild(modeHint);

  const allLabel = document.createElement("div");
  allLabel.className = "reaction-picker-section-label";
  allLabel.textContent = "All emojis";
  sheet.appendChild(allLabel);

  const grid = document.createElement("div");
  grid.className = "reaction-picker-grid";

  ALL_REACTION_EMOJIS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.className = "reaction-picker-emoji";
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      if (editMode === null) {
        // React mode — react to message and close
        saveReaction(msgId, emoji);
        overlay.remove();
      } else if (editMode === "default") {
        workingDefault = emoji;
        renderDefaultSlot();
        editMode = null;
        updateModeHint();
        showMiniNotif(`Double-tap emoji set to ${emoji} 💌`);
      } else {
        const idx = parseInt(editMode.split("-")[1]);
        workingQuick[idx] = emoji;
        editMode = null;
        renderQuickSlots();
        updateModeHint();
        showMiniNotif(`Capsule slot ${idx + 1} updated to ${emoji}`);
      }
    });
    grid.appendChild(btn);
  });
  sheet.appendChild(grid);

  // ── Done — save capsule changes to Firestore ──
  const closeBtn = document.createElement("button");
  closeBtn.className = "reaction-picker-close";
  closeBtn.textContent = "Save & Close";
  closeBtn.addEventListener("click", () => {
    saveCapsuleToFirestore(workingQuick, workingDefault);
    overlay.remove();
  });
  sheet.appendChild(closeBtn);

  overlay.appendChild(sheet);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      // Save on dismiss too
      saveCapsuleToFirestore(workingQuick, workingDefault);
      overlay.remove();
    }
  });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

// Close reaction bar on outside tap
document.addEventListener("click", (e) => {
  if (activeReactionBar && !activeReactionBar.contains(e.target)) {
    closeReactionBar();
  }
});

// ─── ATTACH REACTIONS TO A ROW ────────────────────────────────────
function attachReactions(row, msg, msgId) {
  const bubble = row.querySelector(".bubble");

  // Long-press (touch)
  bubble.addEventListener("touchstart", (e) => {
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      openReactionBar(msgId, row, msg);
    }, 480);
  }, { passive: true });

  bubble.addEventListener("touchmove", () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }, { passive: true });

  bubble.addEventListener("touchend", () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }, { passive: true });

  bubble.addEventListener("touchcancel", () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }, { passive: true });

  // Long-press (mouse/desktop)
  bubble.addEventListener("mousedown", () => {
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      openReactionBar(msgId, row, msg);
    }, 500);
  });
  bubble.addEventListener("mouseup", () => { clearTimeout(longPressTimer); longPressTimer = null; });
  bubble.addEventListener("mouseleave", () => { clearTimeout(longPressTimer); longPressTimer = null; });

  // Double-tap — reacts with user's saved default emoji, toggles off if tapped again
  let lastTap = 0;
  let doubleTapBlocked = false;
  bubble.addEventListener("touchend", (e) => {
    if (longPressTimer) { doubleTapBlocked = true; return; }
    if (doubleTapBlocked) { doubleTapBlocked = false; return; }
    const now = Date.now();
    if (now - lastTap < 300) {
      e.preventDefault();
      const emoji = getDoubleTapEmoji();
      saveReaction(msgId, emoji);
      showHeartBurst(bubble, emoji);
    }
    lastTap = now;
  });
}

function showHeartBurst(bubble, emoji) {
  const rect = bubble.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const heart = document.createElement("span");
  heart.className = "heart-burst";
  heart.textContent = emoji || "❤️";
  heart.style.left = cx + "px";
  heart.style.top = cy + "px";
  document.body.appendChild(heart);
  setTimeout(() => heart.remove(), 750);
}

// ─── REAL-TIME REACTION UPDATES ───────────────────────────────────
function watchReactions(msgId, wrap) {
  messagesRef.doc(msgId).onSnapshot((snap) => {
    if (!snap.exists) return;
    const reactions = snap.data().reactions || {};
    renderReactions(wrap, reactions, msgId);
  });
}

// ─── DESKTOP HOVER ACTIONS (3-dot menu) ──────────────────────────
function attachHoverActions(row, msg, msgId) {
  const isSent = row.classList.contains("sent");

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "msg-hover-actions " + (isSent ? "actions-sent" : "actions-recv");

  // Three-dot trigger button
  const trigger = document.createElement("button");
  trigger.className = "msg-actions-trigger";
  trigger.title = "Message actions";
  trigger.textContent = "•••";

  // Dropdown menu
  const dropdown = document.createElement("div");
  dropdown.className = "msg-actions-dropdown";

  // React item
  const reactItem = document.createElement("button");
  reactItem.className = "msg-action-item";
  const reactIcon = document.createElement("span");
  reactIcon.className = "action-icon";
  reactIcon.textContent = "😊";
  reactItem.appendChild(reactIcon);
  reactItem.appendChild(document.createTextNode(" React"));
  reactItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeDropdown();
    openReactionBar(msgId, row, msg);
  });

  // Divider
  const divider = document.createElement("hr");
  divider.className = "msg-action-divider";

  // Reply item
  const replyItem = document.createElement("button");
  replyItem.className = "msg-action-item";
  const replyIcon = document.createElement("span");
  replyIcon.className = "action-icon";
  replyIcon.textContent = "↩";
  replyItem.appendChild(replyIcon);
  replyItem.appendChild(document.createTextNode(" Reply"));
  replyItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeDropdown();
    startReply(msg, msgId);
  });

  dropdown.appendChild(reactItem);
  dropdown.appendChild(divider);
  dropdown.appendChild(replyItem);

  function openDropdown() {
    // Close any other open dropdowns first
    document.querySelectorAll(".msg-actions-dropdown.open").forEach((d) => {
      d.classList.remove("open");
    });
    document.querySelectorAll(".msg-actions-trigger.open").forEach((t) => {
      t.classList.remove("open");
    });
    trigger.classList.add("open");
    dropdown.classList.add("open");
  }

  function closeDropdown() {
    trigger.classList.remove("open");
    dropdown.classList.remove("open");
  }

  function toggleDropdown(e) {
    e.stopPropagation();
    if (dropdown.classList.contains("open")) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  trigger.addEventListener("click", toggleDropdown);

  // Close on outside click — stored as named fn so we keep one global handler pattern
  document.addEventListener("click", () => closeDropdown());

  actionsWrap.appendChild(trigger);
  actionsWrap.appendChild(dropdown);

  // Attach to the bubble-wrap (not the row) so positioning is relative to the bubble area
  const wrap = row.querySelector(".bubble-wrap");
  wrap.appendChild(actionsWrap);
}

// ─── SWIPE-TO-REPLY ───────────────────────────────────────────────
const SWIPE_THRESHOLD = 55;

function attachSwipeReply(row, msg, id) {
  let startX = 0, startY = 0, dx = 0;
  let swiping = false;
  let triggered = false;

  row.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dx = 0;
    swiping = false;
    triggered = false;
  }, { passive: true });

  row.addEventListener("touchmove", (e) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    dx = x - startX;
    const dy = Math.abs(y - startY);

    if (!swiping && Math.abs(dx) > 8 && dy < Math.abs(dx)) {
      swiping = true;
      row.classList.add("swiping");
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!swiping) return;

    const isSent = row.classList.contains("sent");
    const validDir = isSent ? dx < 0 : dx > 0;
    if (!validDir) { dx = 0; return; }

    const absDx = Math.abs(dx);
    const limited = Math.min(absDx, SWIPE_THRESHOLD * 1.2);
    const translateX = isSent ? -limited : limited;

    row.style.transform = `translateX(${translateX}px)`;

    if (absDx > SWIPE_THRESHOLD * 0.6) {
      row.classList.add("swipe-reveal");
    } else {
      row.classList.remove("swipe-reveal");
    }
  }, { passive: true });

  row.addEventListener("touchend", () => {
    if (!swiping) return;
    row.classList.remove("swiping");
    row.classList.remove("swipe-reveal");
    row.style.transform = "";

    if (Math.abs(dx) > SWIPE_THRESHOLD && !triggered) {
      triggered = true;
      if (navigator.vibrate) navigator.vibrate(20);
      startReply(msg, id);
    }
  }, { passive: true });
}

// ─── JUMP TO QUOTED MESSAGE ───────────────────────────────────────
function jumpToMessage(id) {
  const row = msgRowMap.get(id);
  if (!row) return;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.classList.add("highlight-flash");
  setTimeout(() => row.classList.remove("highlight-flash"), 1300);
}

// ─── REAL-TIME LISTENER ───────────────────────────────────────────
messagesRef.orderBy("timestamp", "asc").onSnapshot((snap) => {
  snap.docChanges().forEach((change) => {
    if (change.type === "added") {
      const msg = change.doc.data();
      const isNew = !firstLoad;
      renderMessage(msg, change.doc.id, isNew);

      if (isNew && msg.sender !== WHO) {
        sendBrowserNotif(
          SENDER_DISPLAY[msg.sender] || msg.sender,
          msg.text,
          msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl
        );
        if (!document.hidden) updateMyReadTime();
      }
    }
  });

  if (firstLoad) {
    firstLoad = false;
    if (_pendingFirstBatch.length === 0) {
      loader.style.display = "none";
    }
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateMyReadTime();
});
window.addEventListener("focus", updateMyReadTime);

// ─── LIGHTBOX ────────────────────────────────────────────────────
function openLightbox(images, startIdx = 0) {
  lbImages = images;
  lbIndex = startIdx;
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
  showLightboxImage();
}

function showLightboxImage() {
  lightboxImg.src = lbImages[lbIndex];
  if (lbImages.length > 1) {
    lightboxCounter.textContent = `${lbIndex + 1} / ${lbImages.length}`;
    document.getElementById("lightbox-nav").style.display = "flex";
  } else {
    document.getElementById("lightbox-nav").style.display = "none";
  }
  lbPrev.disabled = lbIndex === 0;
  lbNext.disabled = lbIndex === lbImages.length - 1;
}

lbPrev.addEventListener("click", () => { if (lbIndex > 0) { lbIndex--; showLightboxImage(); } });
lbNext.addEventListener("click", () => { if (lbIndex < lbImages.length - 1) { lbIndex++; showLightboxImage(); } });

let lbTouchStartX = null;
lightboxImg.addEventListener("touchstart", (e) => { lbTouchStartX = e.touches[0].clientX; }, { passive: true });
lightboxImg.addEventListener("touchend", (e) => {
  if (lbTouchStartX === null) return;
  const dx = e.changedTouches[0].clientX - lbTouchStartX;
  if (Math.abs(dx) > 50) {
    if (dx < 0 && lbIndex < lbImages.length - 1) { lbIndex++; showLightboxImage(); }
    else if (dx > 0 && lbIndex > 0) { lbIndex--; showLightboxImage(); }
  }
  lbTouchStartX = null;
}, { passive: true });

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
  lbImages = [];
  lbIndex = 0;
}

// ─── CAMERA ──────────────────────────────────────────────────────
cameraBtn.addEventListener("click", openCamera);

async function startCameraStream() {
  if (cameraStream) cameraStream.getTracks().forEach((t) => t.stop());
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    cameraFeed.srcObject = cameraStream;
    cameraFeed.classList.toggle("mirrored", facingMode === "user");
  } catch (err) {
    alert("Camera not available: " + err.message);
    closeCamera();
  }
}

flipCameraBtn.addEventListener("click", async () => {
  facingMode = facingMode === "environment" ? "user" : "environment";
  await startCameraStream();
});

snapBtn.addEventListener("click", () => {
  const video = cameraFeed;
  snapCanvas.width = video.videoWidth;
  snapCanvas.height = video.videoHeight;
  const ctx = snapCanvas.getContext("2d");
  if (facingMode === "user") { ctx.translate(snapCanvas.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0);
  snapCanvas.toBlob((blob) => {
    capturedBlob = blob;
    cameraPreviewImg.src = URL.createObjectURL(blob);
    cameraLiveWrap.style.display = "none";
    cameraPreviewWrap.classList.add("visible");
  }, "image/jpeg", 0.9);
});

retakeBtn.addEventListener("click", () => {
  capturedBlob = null;
  cameraPreviewWrap.classList.remove("visible");
  cameraLiveWrap.style.display = "flex";
});

usePhotoBtn.addEventListener("click", () => {
  if (!capturedBlob) return;
  const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, { type: "image/jpeg" });
  addFilesToSelection([file]);
  closeCamera();
});

closeCameraBtn.addEventListener("click", closeCamera);

function pushCameraHistoryState() {
  history.pushState({ cameraOpen: true }, "");
}

window.addEventListener("popstate", (e) => {
  if (cameraModal.classList.contains("open")) {
    e.preventDefault();
    closeCamera();
  }
});

async function openCamera() {
  cameraModal.classList.add("open");
  cameraLiveWrap.style.display = "flex";
  cameraPreviewWrap.classList.remove("visible");
  capturedBlob = null;
  pushCameraHistoryState();
  await startCameraStream();
}

function closeCamera() {
  if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); cameraStream = null; }
  cameraModal.classList.remove("open");
  document.body.style.overflow = "";
  if (history.state && history.state.cameraOpen) history.back();
}

async function registerFCMToken() {
  try {
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey: "BO_WZsr9NOpYF9IprbZRUZvZD-wTGpctb3J9qDEXlskx0h8QzXpvzl58P_gr4L-psIZe5sm_wuOOgWk0vOMGKcE",
      serviceWorkerRegistration: swRegistration,
    });
    if (token) {
      const docRef = db.collection("fcmTokens").doc(WHO);
      const doc = await docRef.get();
      const existingTokens = doc.exists && doc.data().tokens ? doc.data().tokens : [];
      if (!existingTokens.includes(token)) {
        await docRef.set({
          tokens: [...existingTokens, token],
          user: WHO,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  } catch (err) {
    console.warn("FCM token registration failed:", err);
  }
}

// ─── INIT ────────────────────────────────────────────────────────
// Load the user's private reaction capsule from Firestore (cross-device sync)
loadCapsuleFromFirestore();
initNotifications();
if (typeof checkAuthentication === "function") {
  setTimeout(() => { loader.style.display = "none"; }, 4000);
}