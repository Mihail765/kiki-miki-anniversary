// ─── WHO AM I? ───────────────────────────────────────────────────
const WHO = localStorage.getItem("mk_user") || "mikica";
// mk_user already set in localStorage at login
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

// Camera elements
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
let lastDate = null;
let lastSender = null;
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

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function fixChatViewport() {
  window.scrollTo(0, 0);

  const messages = document.getElementById("messages-container");
  if (messages) {
    messages.scrollTop = messages.scrollHeight;
  }
}

window.addEventListener("load", fixChatViewport);
window.addEventListener("pageshow", fixChatViewport); // important for PWA reopen
window.addEventListener("focus", fixChatViewport);

// ─── NOTIFICATIONS ───────────────────────────────────────────────
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const isInStandaloneMode =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
let swRegistration = null;

async function initNotifications() {
  if ("serviceWorker" in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js",
      );
    } catch (e) {
      console.warn("SW registration failed:", e);
    }
  }

  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    // Already granted — silently register FCM token in case it's missing
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
    perm = await new Promise((resolve) =>
      Notification.requestPermission(resolve),
    );
  }
  notifBanner.classList.remove("visible");
  if (perm === "granted") {
    showMiniNotif(
      "🔔 Notifications enabled! You'll know when a message arrives 💌",
    );
    await registerFCMToken(); // ← saves token to Firestore for Cloud Function
    setTimeout(
      () =>
        sendBrowserNotif("System", "Notifications are working! 💌", null, true),
      800,
    );
  } else {
    showMiniNotif("⚠️ Permission denied — check your browser settings");
  }
});

notifDismissBtn.addEventListener("click", () => {
  notifBanner.classList.remove("visible");
});

async function sendBrowserNotif(senderName, text, imageUrl, force = false) {
  if (Notification.permission !== "granted") return;
  if (!force && !document.hidden) return;

  const title = `${senderName} 💌`;
  const body = text || (imageUrl ? "📷 Sent a photo" : "New message");

  if (swRegistration && swRegistration.active) {
    try {
      swRegistration.active.postMessage({
        type: "NOTIFY",
        title,
        body,
        icon: "favicon.ico",
        tag: "chat-message",
        url: window.location.href,
      });
      return;
    } catch (e) {
      console.warn("SW postMessage failed, falling back:", e);
    }
  }

  try {
    const notif = new Notification(title, {
      body,
      icon: "favicon.ico",
      badge: "favicon.ico",
      tag: "chat-message",
      renotify: true,
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    setTimeout(() => notif.close(), 6000);
  } catch (e) {
    console.warn("Notification failed:", e);
  }
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
const EMOJIS = [
  "❤️",
  "💕",
  "💖",
  "💗",
  "😍",
  "🥰",
  "😘",
  "💋",
  "🌹",
  "✨",
  "😊",
  "🥺",
  "💌",
  "🎀",
  "🌸",
  "💞",
  "💓",
  "💝",
  "😂",
  "🙈",
  "🫶",
  "💑",
  "🥂",
  "🌙",
  "⭐",
  "🎶",
  "🤍",
  "💭",
  "🫠",
  "🩷",
];
EMOJIS.forEach((e) => {
  const btn = document.createElement("button");
  btn.className = "emoji-btn";
  btn.textContent = e;
  btn.addEventListener("click", () => {
    insertAtCursor(msgInput, e);
    msgInput.focus();
  });
  emojiTray.appendChild(btn);
});
emojiToggleBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  emojiTray.classList.toggle("open");
});
document.addEventListener("click", () => emojiTray.classList.remove("open"));

function insertAtCursor(el, text) {
  const s = el.selectionStart,
    e = el.selectionEnd;
  el.value = el.value.slice(0, s) + text + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + text.length;
}

// ─── AUTO-RESIZE TEXTAREA ────────────────────────────────────────
msgInput.addEventListener("input", () => {
  msgInput.style.height = "auto";
  msgInput.style.height = Math.min(msgInput.scrollHeight, 80) + "px";
  handleTyping();
});

// ─── MULTI-FILE SELECT ───────────────────────────────────────────
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
    previewScroll.insertBefore(item, addMoreBtn);
  });

  previewCountLabel.textContent = `${selectedFiles.length} image${selectedFiles.length !== 1 ? "s" : ""} selected`;

  if (selectedFiles.length > 0) {
    imgPreviewBar.classList.add("visible");
  } else {
    imgPreviewBar.classList.remove("visible");
  }
}

clearAllBtn.addEventListener("click", () => {
  selectedFiles = [];
  renderPreviewBar();
});

// ─── TYPING INDICATOR ────────────────────────────────────────────
function handleTyping() {
  if (!isTyping) {
    isTyping = true;
    typingRef.doc(WHO).set({
      typing: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
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

// ─── SEND MESSAGE ────────────────────────────────────────────────
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
  selectedFiles = [];
  renderPreviewBar();

  try {
    let imageUrls = [];
    if (filesToSend.length > 0) {
      imageUrls = await uploadImagesWithProgress(filesToSend);
    }

    await messagesRef.add({
      sender: WHO,
      text: text || null,
      imageUrls: imageUrls.length > 0 ? imageUrls : null,
      imageUrl: imageUrls.length === 1 ? imageUrls[0] : null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      readBy: [WHO],
    });

    updateMyReadTime();
  } catch (err) {
    console.error("Send error:", err);
    alert("Couldn't send message: " + err.message);
  } finally {
    sendBtn.disabled = false;
    msgInput.focus();
  }
}

// ─── UPLOAD IMAGES ───────────────────────────────────────────────
async function uploadImagesWithProgress(files) {
  uploadProgress.style.display = "block";
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const progressBase = (i / files.length) * 100;
    const progressChunk = (1 / files.length) * 100;
    uploadProgressBar.style.width = progressBase + "%";
    try {
      const url = await uploadSingleImage(file, progressBase, progressChunk);
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
      { method: "POST", body: formData },
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
          const pct =
            progressBase +
            (snap.bytesTransferred / snap.totalBytes) * progressChunk;
          uploadProgressBar.style.width = pct + "%";
        },
        reject,
        async () => {
          resolve(await task.snapshot.ref.getDownloadURL());
        },
      );
    });
  }
}

async function compressImage(file, maxW = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth,
        h = img.naturalHeight;
      if (w > maxW) {
        h = Math.round((h * maxW) / w);
        w = maxW;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob || file),
        file.type || "image/jpeg",
        quality,
      );
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve(file);
    img.src = url;
  });
}

// ─── RENDER MESSAGE ──────────────────────────────────────────────
function renderMessage(msg, id, animate = true) {
  if (emptyState.parentNode) emptyState.remove();

  const isSent = msg.sender === WHO;
  const ts = msg.timestamp ? msg.timestamp.toDate() : new Date();
  const tsMs = ts.getTime();

  const dateStr = ts.toLocaleDateString("mk-MK", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  if (dateStr !== lastDate) {
    lastDate = dateStr;
    const sep = document.createElement("div");
    sep.className = "date-separator";
    sep.textContent = dateStr;
    msgContainer.appendChild(sep);
    lastSender = null;
  }

  const consecutive = lastSender === msg.sender;
  lastSender = msg.sender;

  const row = document.createElement("div");
  row.className = `msg-row ${isSent ? "sent" : "recv"}${consecutive ? " consecutive" : ""}`;
  row.dataset.id = id;
  if (isSent) row.dataset.ts = tsMs;
  if (!animate) row.style.animation = "none";

  const avatar = document.createElement("div");
  avatar.className = "bubble-avatar";
  avatar.textContent = consecutive ? "" : AVATARS[msg.sender] || "👤";
  if (consecutive) avatar.style.visibility = "hidden";

  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const images = msg.imageUrls
    ? msg.imageUrls
    : msg.imageUrl
      ? [msg.imageUrl]
      : [];

  if (images.length > 0) {
    const gridWrap = document.createElement("div");
    gridWrap.className = "img-grid-wrap";

    const MAX_SHOWN = 6;
    const showCount = Math.min(images.length, MAX_SHOWN);
    const countClass =
      images.length === 1
        ? "count-1"
        : images.length === 2
          ? "count-2"
          : images.length === 3
            ? "count-3"
            : images.length === 4
              ? "count-4"
              : "count-many";

    const grid = document.createElement("div");
    grid.className = `img-grid ${countClass}`;

    for (let i = 0; i < showCount; i++) {
      const gridImg = document.createElement("img");
      gridImg.className = "grid-img";
      gridImg.src = images[i];
      gridImg.alt = `Image ${i + 1}`;
      gridImg.loading = "lazy";

      if (i === MAX_SHOWN - 1 && images.length > MAX_SHOWN) {
        const cellWrap = document.createElement("div");
        cellWrap.style.position = "relative";
        cellWrap.appendChild(gridImg);
        const overlay = document.createElement("div");
        overlay.className = "more-overlay";
        overlay.textContent = `+${images.length - MAX_SHOWN + 1}`;
        overlay.addEventListener("click", () =>
          openLightbox(images, MAX_SHOWN - 1),
        );
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

  const timeRow = document.createElement("span");
  timeRow.className = "msg-time";
  const timeText = document.createTextNode(
    ts.toLocaleTimeString("mk-MK", {
      hour: "2-digit",
      minute: "2-digit",
    }) + " ",
  );
  timeRow.appendChild(timeText);

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
  msgContainer.appendChild(row);

  if (isSent && partnerReadTime) updateAllTicks();
}

function scrollToBottom(smooth = true) {
  msgContainer.scrollTo({
    top: msgContainer.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

// ─── REAL-TIME LISTENER ──────────────────────────────────────────
messagesRef.orderBy("timestamp", "asc").onSnapshot((snap) => {
  snap.docChanges().forEach((change) => {
    if (change.type === "added") {
      const msg = change.doc.data();
      const isNew = !firstLoad;
      renderMessage(msg, change.doc.id, isNew);
      if (isNew || msgContainer.scrollHeight - msgContainer.scrollTop < 600) {
        setTimeout(scrollToBottom, 50);
      }
      if (isNew && msg.sender !== WHO) {
        sendBrowserNotif(
          SENDER_DISPLAY[msg.sender] || msg.sender,
          msg.text,
          msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl,
        );
        if (!document.hidden) updateMyReadTime();
      }
    }
  });

  if (firstLoad) {
    firstLoad = false;
    setTimeout(() => scrollToBottom(false), 80);
    loader.style.display = "none";
    updateMyReadTime();
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

lbPrev.addEventListener("click", () => {
  if (lbIndex > 0) {
    lbIndex--;
    showLightboxImage();
  }
});
lbNext.addEventListener("click", () => {
  if (lbIndex < lbImages.length - 1) {
    lbIndex++;
    showLightboxImage();
  }
});

let lbTouchStartX = null;
lightboxImg.addEventListener(
  "touchstart",
  (e) => {
    lbTouchStartX = e.touches[0].clientX;
  },
  { passive: true },
);
lightboxImg.addEventListener(
  "touchend",
  (e) => {
    if (lbTouchStartX === null) return;
    const dx = e.changedTouches[0].clientX - lbTouchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && lbIndex < lbImages.length - 1) {
        lbIndex++;
        showLightboxImage();
      } else if (dx > 0 && lbIndex > 0) {
        lbIndex--;
        showLightboxImage();
      }
    }
    lbTouchStartX = null;
  },
  { passive: true },
);

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
  lbImages = [];
  lbIndex = 0;
}

// ─── CAMERA ──────────────────────────────────────────────────────
cameraBtn.addEventListener("click", openCamera);

async function startCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    cameraFeed.srcObject = cameraStream;
    if (facingMode === "user") {
      cameraFeed.classList.add("mirrored");
    } else {
      cameraFeed.classList.remove("mirrored");
    }
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
  if (facingMode === "user") {
    ctx.translate(snapCanvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0);
  snapCanvas.toBlob(
    (blob) => {
      capturedBlob = blob;
      cameraPreviewImg.src = URL.createObjectURL(blob);
      cameraLiveWrap.style.display = "none";
      cameraPreviewWrap.classList.add("visible");
    },
    "image/jpeg",
    0.9,
  );
});

retakeBtn.addEventListener("click", () => {
  capturedBlob = null;
  cameraPreviewWrap.classList.remove("visible");
  cameraLiveWrap.style.display = "flex";
});

usePhotoBtn.addEventListener("click", () => {
  if (!capturedBlob) return;
  const file = new File([capturedBlob], `photo_${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
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
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  cameraModal.classList.remove("open");
  document.body.style.overflow = "";
  if (history.state && history.state.cameraOpen) {
    history.back();
  }
}
async function registerFCMToken() {
  try {
    const messaging = firebase.messaging();
    const token = await messaging.getToken({
      vapidKey:
        "BO_WZsr9NOpYF9IprbZRUZvZD-wTGpctb3J9qDEXlskx0h8QzXpvzl58P_gr4L-psIZe5sm_wuOOgWk0vOMGKcE",
      serviceWorkerRegistration: swRegistration,
    });
    if (token) {
      const docRef = db.collection("fcmTokens").doc(WHO);
      const doc = await docRef.get();
      const existingTokens =
        doc.exists && doc.data().tokens ? doc.data().tokens : [];
      if (!existingTokens.includes(token)) {
        await docRef.set({
          tokens: [...existingTokens, token],
          user: WHO,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        console.log(
          "FCM token added for",
          WHO,
          "— total devices:",
          existingTokens.length + 1,
        );
      } else {
        console.log("FCM token already registered for", WHO);
      }
    }
  } catch (err) {
    console.warn("FCM token registration failed:", err);
  }
}

// ─── INIT ────────────────────────────────────────────────────────
initNotifications();
if (typeof checkAuthentication === "function")
  setTimeout(() => {
    loader.style.display = "none";
  }, 4000);
