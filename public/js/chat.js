// ─── WHO AM I? ───────────────────────────────────────────────────
// CRITICAL: Do NOT read mk_user at module load time.
// safetyCode.js always clears it on page load and only sets it after
// the Firebase ID token is fetched. We wait for 'mk_user_ready' so
// WHO is always correct, never a stale value from a previous session.
const SENDER_DISPLAY = { mikica: "Микица", kikica: "Кикица" };
const AVATARS = { mikica: "💙", kikica: "💗" };
const CHAT_ID = "mikica_kikica_chat";

window.addEventListener(
  "mk_user_ready",
  function (e) {
    initChat(e.detail.who);
  },
  { once: true },
);

function initChat(WHO) {
  console.log("✅ Chat initialised as:", WHO);

  const _partnerName = WHO === "mikica" ? "Кикица 💗" : "Микица 💙";
  const _hdrEl = document.getElementById("header-name");
  if (_hdrEl) _hdrEl.textContent = _partnerName;

  // ─── FIREBASE REFS ───────────────────────────────────────────────
  const storage = firebase.storage();
  const messagesRef = db
    .collection("chats")
    .doc(CHAT_ID)
    .collection("messages");
  const typingRef = db.collection("chats").doc(CHAT_ID).collection("typing");
  const readRef = db.collection("chats").doc(CHAT_ID).collection("readStatus");

  // ─── BLURRED IMAGES STATE ─────────────────────────────────────────
  const blurRef = db
    .collection("chats")
    .doc(CHAT_ID)
    .collection("blurredImages")
    .doc("state");
  let _blurredImages = new Set();

  function refreshBlurredImagesInDOM() {
    document.querySelectorAll(".grid-img[data-img-url]").forEach((img) => {
      img.classList.toggle(
        "img-blurred",
        _blurredImages.has(img.dataset.imgUrl),
      );
    });
  }

  blurRef.onSnapshot((snap) => {
    _blurredImages = new Set(snap.exists ? snap.data().urls || [] : []);
    refreshBlurredImagesInDOM();
  });

  function isImageBlurred(url) {
    return _blurredImages.has(url);
  }

  function isMobileUI() {
    return (
      window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768
    );
  }

  function isTouchOnlyUI() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const hasFinePointer = window.matchMedia("(any-pointer: fine)").matches;
    return coarse && !hasFinePointer && window.innerWidth <= 1024;
  }

  async function setImagesBlurred(urls, shouldBlur) {
    urls.forEach((url) => {
      if (shouldBlur) _blurredImages.add(url);
      else _blurredImages.delete(url);
    });
    refreshBlurredImagesInDOM();

    try {
      await blurRef.set({ urls: [..._blurredImages] });
    } catch (e) {
      console.warn("Could not save blur state:", e);
      throw e;
    }
  }

  async function toggleImageBlur(url) {
    await setImagesBlurred([url], !isImageBlurred(url));
  }

  function openSeparateBlurPicker(urls) {
    document
      .querySelectorAll(".separate-blur-overlay")
      .forEach((el) => el.remove());
    closeAllDropdowns();
    lockScroll();

    const selected = new Set(urls.filter((url) => isImageBlurred(url)));
    const overlay = document.createElement("div");
    overlay.className = "separate-blur-overlay";

    const dialog = document.createElement("div");
    dialog.className = "separate-blur-dialog";

    const header = document.createElement("div");
    header.className = "separate-blur-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = "Blur separately";
    const subtitle = document.createElement("p");
    subtitle.textContent = "Select the images that should stay blurred.";
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "separate-blur-close";
    closeBtn.textContent = "✕";
    closeBtn.title = "Close";

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "separate-blur-grid";

    const updateCard = (card, url) => {
      const active = selected.has(url);
      card.classList.toggle("selected", active);
      card.setAttribute("aria-pressed", String(active));
      const badge = card.querySelector(".separate-blur-badge");
      if (badge) badge.textContent = active ? "Blurred" : "Visible";
    };

    urls.forEach((url, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "separate-blur-card";
      card.setAttribute("aria-label", `Toggle blur for image ${index + 1}`);

      const img = document.createElement("img");
      img.src = url;
      img.alt = `Image ${index + 1}`;
      img.loading = "lazy";

      const number = document.createElement("span");
      number.className = "separate-blur-number";
      number.textContent = String(index + 1);

      const badge = document.createElement("span");
      badge.className = "separate-blur-badge";

      card.appendChild(img);
      card.appendChild(number);
      card.appendChild(badge);
      updateCard(card, url);

      card.addEventListener("click", () => {
        if (selected.has(url)) selected.delete(url);
        else selected.add(url);
        updateCard(card, url);
      });

      grid.appendChild(card);
    });

    dialog.appendChild(grid);

    const footer = document.createElement("div");
    footer.className = "separate-blur-footer";

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "separate-blur-secondary";
    clearBtn.textContent = "Show all";
    clearBtn.addEventListener("click", () => {
      selected.clear();
      grid.querySelectorAll(".separate-blur-card").forEach((card, index) => {
        updateCard(card, urls[index]);
      });
    });

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "separate-blur-apply";
    applyBtn.textContent = "Apply";

    const closePicker = () => {
      overlay.remove();
      unlockScroll();
    };

    closeBtn.addEventListener("click", closePicker);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePicker();
    });

    applyBtn.addEventListener("click", async () => {
      applyBtn.disabled = true;
      try {
        const shouldBlur = urls.filter((url) => selected.has(url));
        const shouldShow = urls.filter((url) => !selected.has(url));
        if (shouldBlur.length) await setImagesBlurred(shouldBlur, true);
        if (shouldShow.length) await setImagesBlurred(shouldShow, false);
        closePicker();
      } catch (_) {
        applyBtn.disabled = false;
        showMiniNotif("Could not save blur setting");
      }
    });

    footer.appendChild(clearBtn);
    footer.appendChild(applyBtn);
    dialog.appendChild(footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }

  // ─── ELEMENTS ────────────────────────────────────────────────────
  const msgContainer = document.getElementById("messages-container");

  // ─── SCROLL LOCK (prevents chat scrolling while any menu is open) ───────────
  let _scrollLocked = false;
  function lockScroll() {
    if (_scrollLocked) return;
    _scrollLocked = true;
    msgContainer.style.overflow = "hidden";
    document.body.style.userSelect = "none";
  }
  function unlockScroll() {
    if (!_scrollLocked) return;
    _scrollLocked = false;
    msgContainer.style.overflow = "";
    document.body.style.userSelect = "";
  }
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
  const typingIndicator = document.getElementById("typing-bubble");
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
  const MAX_SELECTED_IMAGES = 30;
  const DRAFT_DB_NAME = "mk-private-chat-drafts";
  const DRAFT_DB_VERSION = 1;
  const DRAFT_STORE = "drafts";
  const DRAFT_KEY = `${CHAT_ID}:${WHO}:unsent-images`;

  let selectedFiles = [];
  let previewObjectUrls = [];
  let draftWriteQueue = Promise.resolve();
  let isSending = false;
  let typingTimeout = null;
  let isTyping = false;
  let firstLoad = true;
  let partnerReadTime = null;
  let lbImages = [];
  let lbIndex = 0;
  let cameraStream = null;
  let facingMode = "environment";
  let capturedBlob = null;
  let pendingCameraFile = null;
  let cameraPreviewObjectUrl = null;
  let cameraTimerSeconds = 0;
  let cameraCountdownToken = 0;
  let cameraIsCountingDown = false;
  let cameraStage = null;
  let cameraFocusIndicator = null;
  let cameraCountdownEl = null;
  let cameraTimerBtn = null;
  let cameraTimerMenu = null;
  let cameraExposureWrap = null;
  let cameraExposureSlider = null;
  let cameraExposureValue = null;
  let cameraFocusUnsupportedNotified = false;
  let cameraFocusResetTimer = null;
  let unreadInserted = false;
  let lastReadTimestamp = null;

  // ─── UNSENT IMAGE DRAFTS (IndexedDB) ─────────────────────────────
  function openDraftDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available"));
        return;
      }

      const request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DRAFT_STORE)) {
          database.createObjectStore(DRAFT_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function writeSelectedFilesDraft() {
    const database = await openDraftDB();
    try {
      await new Promise((resolve, reject) => {
        const tx = database.transaction(DRAFT_STORE, "readwrite");
        const store = tx.objectStore(DRAFT_STORE);
        if (selectedFiles.length === 0 && !pendingCameraFile) {
          store.delete(DRAFT_KEY);
        } else {
          store.put({
            id: DRAFT_KEY,
            files: selectedFiles,
            pendingCameraFile,
            updatedAt: Date.now(),
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Draft save aborted"));
      });
    } finally {
      database.close();
    }
  }

  function queueSelectedFilesDraftSave() {
    draftWriteQueue = draftWriteQueue
      .catch(() => {})
      .then(writeSelectedFilesDraft)
      .catch((error) =>
        console.warn("Could not persist unsent images:", error),
      );
    return draftWriteQueue;
  }

  async function restoreSelectedFilesDraft() {
    try {
      const database = await openDraftDB();
      const record = await new Promise((resolve, reject) => {
        const tx = database.transaction(DRAFT_STORE, "readonly");
        const request = tx.objectStore(DRAFT_STORE).get(DRAFT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      database.close();

      const hasStoredFiles =
        record && Array.isArray(record.files) && record.files.length > 0;
      const hasPendingCameraFile =
        record && record.pendingCameraFile instanceof Blob;
      if (!hasStoredFiles && !hasPendingCameraFile) return;

      const restoredFiles = Array.isArray(record.files)
        ? [...record.files]
        : [];
      if (record.pendingCameraFile instanceof Blob) {
        restoredFiles.push(record.pendingCameraFile);
      }

      selectedFiles = restoredFiles
        .filter((file) => file instanceof Blob)
        .slice(0, MAX_SELECTED_IMAGES)
        .map((file, index) =>
          file instanceof File
            ? file
            : new File([file], `restored_photo_${index + 1}.jpg`, {
                type: file.type || "image/jpeg",
                lastModified: record.updatedAt || Date.now(),
              }),
        );
      pendingCameraFile = null;

      renderPreviewBar();
      queueSelectedFilesDraftSave();
      showMiniNotif(
        `📷 Restored ${selectedFiles.length} unsent photo${selectedFiles.length === 1 ? "" : "s"}`,
      );
    } catch (error) {
      console.warn("Could not restore unsent images:", error);
    }
  }

  // ─── BOTTOM-LOCK ─────────────────────────────────────────────────
  let isAtBottom = true;
  let unreadWhileScrolled = 0;

  // ─── RENDERING STATE ─────────────────────────────────────────────
  let lastDate = null;
  let lastSender = null;

  const msgRowMap = new Map();

  // ─── GLOBAL IMAGE LIST FOR CROSS-MESSAGE LIGHTBOX NAVIGATION ─────────────
  // Every time a message with images is rendered, we push its URLs here.
  // openLightbox() uses this flat list so users can swipe across ALL images.
  const _allChatImages = []; // { url, msgId }
  function registerImagesForLightbox(urls, msgId) {
    urls.forEach((url) => {
      if (!_allChatImages.find((e) => e.url === url)) {
        _allChatImages.push({ url, msgId });
      }
    });
  }
  function globalLightboxIndex(url) {
    return _allChatImages.findIndex((e) => e.url === url);
  }

  // ─── REPLY STATE ─────────────────────────────────────────────────
  let replyingTo = null;

  // ─── REACTION STATE ───────────────────────────────────────────────
  const DEFAULT_QUICK_REACTIONS = ["❤️", "😂", "😘", "🥺", "😍", "👍"];
  const DEFAULT_DOUBLE_TAP_EMOJI = "❤️";

  let _capsuleEmojis = [...DEFAULT_QUICK_REACTIONS];
  let _doubleTapEmoji = DEFAULT_DOUBLE_TAP_EMOJI;

  const capsuleRef = db
    .collection("users")
    .doc(WHO)
    .collection("capsule")
    .doc("settings");

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
      try {
        const saved = localStorage.getItem(`mk_quick_reactions_${WHO}`);
        if (saved) _capsuleEmojis = JSON.parse(saved);
      } catch (_) {}
    }
  }

  async function saveCapsuleToFirestore(emojis, doubleTapEmoji) {
    _capsuleEmojis = emojis;
    _doubleTapEmoji = doubleTapEmoji;
    try {
      localStorage.setItem(`mk_quick_reactions_${WHO}`, JSON.stringify(emojis));
    } catch (_) {}
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

  function getQuickReactions() {
    return _capsuleEmojis;
  }
  function getDoubleTapEmoji() {
    return _doubleTapEmoji;
  }

  function saveQuickReactions(arr) {
    saveCapsuleToFirestore(arr, _doubleTapEmoji);
  }

  const ALL_REACTION_EMOJIS = [
    "❤️",
    "😂",
    "😘",
    "🥺",
    "😍",
    "👍",
    "💕",
    "💖",
    "💗",
    "🥰",
    "💋",
    "🌹",
    "✨",
    "😊",
    "💌",
    "🎀",
    "🌸",
    "💞",
    "💓",
    "💝",
    "🙈",
    "🫶",
    "😭",
    "🤣",
    "😅",
    "😆",
    "🔥",
    "💯",
    "🎉",
    "✅",
    "👏",
    "🙏",
    "💀",
    "😤",
    "🥳",
    "😇",
    "🤩",
    "😜",
    "😎",
    "💫",
    "⭐",
    "🌙",
    "🎶",
    "🤍",
    "💭",
    "🫠",
    "🩷",
    "💙",
    "💚",
    "💛",
    "🧡",
    "🤎",
    "🖤",
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
      msgContainer.scrollHeight -
      msgContainer.scrollTop -
      msgContainer.clientHeight;
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
        scrollToBottomBtn.textContent = "";
        const countStr =
          unreadWhileScrolled > 99 ? "99+" : String(unreadWhileScrolled);
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

  msgContainer.addEventListener("scroll", checkScrollPosition, {
    passive: true,
  });

  scrollToBottomBtn.addEventListener("click", () => {
    scrollToBottom(true);
    unreadWhileScrolled = 0;
    scrollToBottomBtn.classList.remove("visible");
  });

  function scrollToBottom(smooth = true) {
    if (smooth) {
      msgContainer.scrollTo({
        top: msgContainer.scrollHeight,
        behavior: "smooth",
      });
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
        swRegistration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
        );
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
      perm = await new Promise((resolve) =>
        Notification.requestPermission(resolve),
      );
    }
    notifBanner.classList.remove("visible");
    if (perm === "granted") {
      showMiniNotif(
        "🔔 Notifications enabled! You'll know when a message arrives 💌",
      );
      await registerFCMToken();
      setTimeout(
        () =>
          sendBrowserNotif(
            "System",
            "Notifications are working! 💌",
            null,
            true,
          ),
        800,
      );
    } else {
      showMiniNotif("⚠️ Permission denied — check your browser settings");
    }
  });

  notifDismissBtn.addEventListener("click", () =>
    notifBanner.classList.remove("visible"),
  );

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
      } catch (e) {}
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
    "🙂‍↕️",
    "🥂",
    "🌙",
    "⭐",
    "🎶",
    "🤍",
    "💭",
    "🫠",
    "🩷",
  ];

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
    const s = el.selectionStart,
      e = el.selectionEnd;
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

  addMoreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showAddImageMenu(addMoreBtn);
  });

  function showAddImageMenu(anchor) {
    document.querySelectorAll(".add-img-menu").forEach((m) => m.remove());

    const menu = document.createElement("div");
    menu.className = "add-img-menu";
    menu.innerHTML = `
      <button class="add-img-menu-btn" id="aim-camera">📷 Camera</button>
      <button class="add-img-menu-btn" id="aim-media">🖼️ Media</button>
    `;
    document.body.appendChild(menu);

    requestAnimationFrame(() => {
      const rect = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth;
      const mh = menu.offsetHeight;
      let left = rect.left + rect.width / 2 - mw / 2;
      let top = rect.top - mh - 8;
      left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
      top = Math.max(8, top);
      menu.style.left = left + "px";
      menu.style.top = top + "px";
      menu.classList.add("visible");
    });

    menu.querySelector("#aim-camera").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      openCamera();
    });

    menu.querySelector("#aim-media").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      fileInput.click();
    });

    setTimeout(() => {
      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", closeMenu, true);
        }
      };
      document.addEventListener("click", closeMenu, true);
    }, 50);
  }

  function addFilesToSelection(files) {
    if (isSending) {
      showMiniNotif("Please wait until the current photos finish sending");
      return;
    }

    const validImages = files.filter(
      (file) => file && file.type.startsWith("image/"),
    );
    const freeSlots = MAX_SELECTED_IMAGES - selectedFiles.length;
    const accepted = validImages.slice(0, Math.max(0, freeSlots));
    selectedFiles = [...selectedFiles, ...accepted];

    if (accepted.length < validImages.length) {
      showMiniNotif(`Maximum ${MAX_SELECTED_IMAGES} photos per message`);
    }

    renderPreviewBar();
    queueSelectedFilesDraftSave();
  }

  function revokePreviewObjectUrls() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
  }

  function renderPreviewBar() {
    revokePreviewObjectUrls();
    previewScroll
      .querySelectorAll(".preview-item")
      .forEach((el) => el.remove());

    const frag = document.createDocumentFragment();
    selectedFiles.forEach((file, idx) => {
      const item = document.createElement("div");
      item.className = "preview-item";
      const img = document.createElement("img");
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);
      img.src = objectUrl;
      img.alt = `Selected image ${idx + 1}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "preview-remove";
      removeBtn.textContent = "✕";
      removeBtn.addEventListener("click", () => {
        if (isSending) return;
        selectedFiles.splice(idx, 1);
        renderPreviewBar();
        queueSelectedFilesDraftSave();
      });

      item.appendChild(img);
      item.appendChild(removeBtn);
      frag.appendChild(item);
    });

    previewScroll.insertBefore(frag, addMoreBtn);
    previewCountLabel.textContent = `${selectedFiles.length} image${selectedFiles.length !== 1 ? "s" : ""} selected`;
    imgPreviewBar.classList.toggle("visible", selectedFiles.length > 0);
  }

  clearAllBtn.addEventListener("click", () => {
    if (isSending) return;
    selectedFiles = [];
    renderPreviewBar();
    queueSelectedFilesDraftSave();
  });

  // ─── TYPING INDICATOR ─────────────────────────────────────────────
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
      typingIndicator.innerHTML = `
      <div class="typing-bubble-row">
        <div class="typing-bubble-avatar">${AVATARS[partner] || "💗"}</div>
        <div class="typing-bubble-pill">
          <span class="typing-dots"><span></span><span></span><span></span></span>
        </div>
      </div>`;
      typingIndicator.classList.add("visible");
    } else {
      typingIndicator.classList.remove("visible");
      typingIndicator.innerHTML = "";
    }
  });

  // ─── REPLY SYSTEM ─────────────────────────────────────────────────
  function startReply(msg, id) {
    replyingTo = {
      id,
      sender: msg.sender,
      text: msg.text || null,
      imageUrl: msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl || null,
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
    textEl.textContent =
      msg.text || (msg.imageUrls || msg.imageUrl ? "📷 Photo" : "");

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
    if (isSending || (!text && selectedFiles.length === 0)) return;

    isSending = true;
    sendBtn.disabled = true;
    fileInput.disabled = true;
    cameraBtn.disabled = true;
    addMoreBtn.disabled = true;

    const filesToSend = [...selectedFiles];
    const textToSend = text;
    const currentReply = replyingTo;

    isTyping = false;
    typingRef.doc(WHO).set({ typing: false });

    try {
      const imageUrls =
        filesToSend.length > 0
          ? await uploadImagesWithProgress(filesToSend)
          : [];

      const msgData = {
        sender: WHO,
        text: textToSend || null,
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

      selectedFiles = [];
      renderPreviewBar();
      await queueSelectedFilesDraftSave();

      if (msgInput.value.trim() === textToSend) {
        msgInput.value = "";
        msgInput.style.height = "";
      }
      cancelReply();
      updateMyReadTime();
    } catch (err) {
      console.error("Send error:", err);
      renderPreviewBar();
      await queueSelectedFilesDraftSave();
      alert(
        "Couldn't send the message. Your selected photos are still saved on this device.\n\n" +
          err.message,
      );
    } finally {
      isSending = false;
      sendBtn.disabled = false;
      fileInput.disabled = false;
      cameraBtn.disabled = false;
      addMoreBtn.disabled = false;
      msgInput.focus();
    }
  }

  // ─── UPLOAD IMAGES ────────────────────────────────────────────────
  async function uploadImagesWithProgress(files) {
    uploadProgress.style.display = "block";
    uploadProgressBar.style.width = "0%";
    const urls = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const progressBase = (i / files.length) * 100;
        const progressChunk = (1 / files.length) * 100;
        uploadProgressBar.style.width = progressBase + "%";
        const url = await uploadSingleImage(
          files[i],
          progressBase,
          progressChunk,
        );
        urls.push(url);
      }
      uploadProgressBar.style.width = "100%";
      return urls;
    } finally {
      setTimeout(() => {
        uploadProgress.style.display = "none";
        uploadProgressBar.style.width = "0%";
      }, 400);
    }
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
          async () => resolve(await task.snapshot.ref.getDownloadURL()),
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

  // ─── RENDER MESSAGE ───────────────────────────────────────────────
  let _pendingFirstBatch = [];
  let _firstBatchTimer = null;

  // ─── IntersectionObserver for lazy image loading ──────────────────
  const _imgObserver = new IntersectionObserver(
    (entries) => {
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
    },
    { rootMargin: "200px" },
  );

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

    msgContainer
      .querySelectorAll("img[data-lazy-src]")
      .forEach((img) => _imgObserver.observe(img));

    _pendingFirstBatch = [];
    _firstBatchTimer = null;

    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        msgContainer.scrollTop = msgContainer.scrollHeight;
        loader.style.display = "none";
        updateMyReadTime();
        updateAllTicks();
        checkScrollPosition();
      }),
    );
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

    msgContainer
      .querySelectorAll("img[data-lazy-src]")
      .forEach((img) => _imgObserver.observe(img));

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

    const swipeIcon = document.createElement("span");
    swipeIcon.className = "swipe-reply-icon";
    swipeIcon.textContent = "↩";
    row.appendChild(swipeIcon);

    const avatar = document.createElement("div");
    avatar.className = "bubble-avatar";
    if (isSent) {
      avatar.style.display = "none";
    } else {
      avatar.textContent = AVATARS[msg.sender] || "👤";
    }

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    // Reply preview
    if (msg.replyTo) {
      const replyDiv = document.createElement("div");
      replyDiv.className = "reply-preview";

      const replySndr = document.createElement("div");
      replySndr.className = "reply-preview-sender";
      replySndr.textContent =
        SENDER_DISPLAY[msg.replyTo.sender] || msg.replyTo.sender;

      const replyTxt = document.createElement("div");
      replyTxt.className = "reply-preview-text";
      replyTxt.textContent =
        msg.replyTo.text || (msg.replyTo.imageUrl ? "📷 Photo" : "");

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
    const images = msg.imageUrls
      ? msg.imageUrls
      : msg.imageUrl
        ? [msg.imageUrl]
        : [];

    if (images.length > 0) {
      registerImagesForLightbox(images, id);
      const gridWrap = document.createElement("div");
      gridWrap.className = "img-grid-wrap";

      // Render every image. This avoids photos being hidden behind a +N tile
      // and lets every individual photo have its own blur action.
      const MAX_SHOWN = images.length;
      const showCount = images.length;
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
        gridImg.alt = `Image ${i + 1}`;
        gridImg.loading = "lazy";
        gridImg.decoding = "async";

        gridImg.addEventListener(
          "load",
          () => gridImg.classList.add("loaded"),
          {
            once: true,
          },
        );
        gridImg.dataset.lazySrc = images[i];
        gridImg.dataset.imgUrl = images[i];

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
          const imgUrl = images[i];

          if (isImageBlurred(imgUrl)) gridImg.classList.add("img-blurred");

          // ── IMAGE TOUCH INTERACTIONS ────────────────────────────────
          // A long-press is handled only by attachReactions() on the bubble,
          // exactly like the older version. This prevents the image actions menu
          // and reaction capsule from competing with each other.
          let imgTapTimer = null;
          let imgLastTap = 0;
          let imgTouchStartX = 0;
          let imgTouchStartY = 0;
          let imgMoved = false;

          gridImg.addEventListener("contextmenu", (e) => {
            // Suppress the browser's native image menu on touch devices.
            if (isTouchOnlyUI()) e.preventDefault();
          });

          gridImg.addEventListener(
            "touchstart",
            (e) => {
              if (!isTouchOnlyUI()) return;
              imgTouchStartX = e.touches[0].clientX;
              imgTouchStartY = e.touches[0].clientY;
              imgMoved = false;
              // attachReactions() receives this same event through bubbling and
              // starts the one reaction long-press timer for the whole message.
            },
            { passive: true },
          );

          gridImg.addEventListener(
            "touchmove",
            (e) => {
              if (!isTouchOnlyUI()) return;
              const dy = Math.abs(e.touches[0].clientY - imgTouchStartY);
              const dx = Math.abs(e.touches[0].clientX - imgTouchStartX);
              if (dy > 10 || dx > 10) {
                imgMoved = true;
                clearTimeout(imgTapTimer);
                imgTapTimer = null;
              }
            },
            { passive: true },
          );

          gridImg.addEventListener(
            "touchcancel",
            () => {
              clearTimeout(imgTapTimer);
              imgTapTimer = null;
              imgMoved = false;
            },
            { passive: true },
          );

          gridImg.addEventListener(
            "touchend",
            (e) => {
              if (!isTouchOnlyUI()) return;

              // Do not interfere with row-level swipe-to-reply.
              if (imgMoved) return;

              // A reaction long-press just fired. Do not also open the lightbox.
              if (row.__reactionHoldFired) {
                e.preventDefault();
                return;
              }

              e.preventDefault();
              const now = Date.now();
              const gap = now - imgLastTap;
              imgLastTap = now;

              if (gap < 350 && gap > 30) {
                clearTimeout(imgTapTimer);
                imgTapTimer = null;
                if (id) {
                  saveReaction(id, getDoubleTapEmoji());
                  showHeartBurst(gridImg, getDoubleTapEmoji());
                }
              } else {
                clearTimeout(imgTapTimer);
                imgTapTimer = setTimeout(() => {
                  imgTapTimer = null;
                  if (!row.__reactionHoldFired) openLightbox(images, idx);
                }, 270);
              }
            },
            { passive: false },
          );

          // Desktop uses click-to-open. All other actions stay in the 3-dot menu.
          gridImg.addEventListener("click", (e) => {
            if (isTouchOnlyUI()) return;
            e.stopPropagation();
            openLightbox(images, idx);
          });

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
    timeRow.appendChild(
      document.createTextNode(
        ts.toLocaleTimeString("mk-MK", { hour: "2-digit", minute: "2-digit" }) +
          " ",
      ),
    );

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

    attachSwipeReply(row, msg, id || "");

    if (id) {
      attachReactions(row, msg, id);
      if (msg.reactions && Object.keys(msg.reactions).length > 0) {
        renderReactions(wrap, msg.reactions, id);
      }
      watchReactions(id, wrap);
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
      await ref.update({
        [`reactions.${WHO}`]: firebase.firestore.FieldValue.delete(),
      });
    } else {
      await ref.update({ [`reactions.${WHO}`]: emoji });
    }
  }

  function renderReactions(wrap, reactions, msgId) {
    const existing = wrap.querySelector(".reaction-row");
    if (existing) existing.remove();

    if (!reactions || Object.keys(reactions).length === 0) {
      wrap.classList.remove("has-reactions");
      return;
    }

    const counts = {};
    for (const [user, emoji] of Object.entries(reactions)) {
      if (!counts[emoji]) counts[emoji] = { emoji, users: [] };
      counts[emoji].users.push(user);
    }

    const row = document.createElement("div");
    row.className = "reaction-row";

    for (const { emoji, users } of Object.values(counts)) {
      const pill = document.createElement("button");
      pill.className = "reaction-pill" + (users.includes(WHO) ? " mine" : "");
      const emojiSpan = document.createElement("span");
      emojiSpan.className = "reaction-emoji";
      emojiSpan.textContent = emoji;
      pill.appendChild(emojiSpan);
      if (users.length > 1) {
        const countSpan = document.createElement("span");
        countSpan.className = "reaction-count";
        countSpan.textContent = users.length;
        pill.appendChild(countSpan);
      }
      pill.title = users.map((u) => SENDER_DISPLAY[u] || u).join(", ");
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        saveReaction(msgId, emoji);
      });
      row.appendChild(pill);
    }

    const bubble = wrap.querySelector(".bubble");
    const msgTime = wrap.querySelector(".msg-time");
    if (bubble && msgTime) {
      wrap.insertBefore(row, msgTime);
    } else if (bubble) {
      wrap.appendChild(row);
    } else {
      wrap.appendChild(row);
    }
    wrap.classList.add("has-reactions");
  }

  function closeReactionBar() {
    if (activeReactionBar) {
      activeReactionBar.classList.remove("visible");
      const el = activeReactionBar;
      setTimeout(() => el.remove(), 200);
      activeReactionBar = null;
      reactionBarMsgId = null;
      unlockScroll();
    }
  }

  function openReactionBar(msgId, row, msg) {
    closeReactionBar();
    lockScroll();

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

    // Append to body as fixed so it is never clipped by overflow:hidden parents
    bar.style.position = "fixed";
    bar.style.visibility = "hidden"; // measure before showing
    document.body.appendChild(bar);

    activeReactionBar = bar;
    reactionBarMsgId = msgId;

    // Position after a frame so we can measure bar dimensions
    requestAnimationFrame(() => {
      const wrap = row.querySelector(".bubble-wrap");
      const wrapRect = wrap.getBoundingClientRect();
      const barW = bar.offsetWidth || 260;
      const barH = bar.offsetHeight || 52;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Vertical: prefer above the bubble-wrap, fall back to below
      let top;
      const spaceAbove = wrapRect.top - margin;
      const spaceBelow = vh - wrapRect.bottom - margin;
      if (spaceAbove >= barH || spaceAbove >= spaceBelow) {
        top = wrapRect.top - barH - margin;
      } else {
        top = wrapRect.bottom + margin;
      }

      // Horizontal: anchor to bubble edge, clamp inside viewport
      let left = isSent
        ? wrapRect.right - barW // right-align to sent bubble
        : wrapRect.left; // left-align to received bubble
      left = Math.max(margin, Math.min(left, vw - barW - margin));
      top = Math.max(margin, Math.min(top, vh - barH - margin));

      bar.style.top = top + "px";
      bar.style.left = left + "px";
      bar.style.visibility = "";

      bar.classList.add("visible");
    });
  }

  function openReactionPicker(msgId, row) {
    lockScroll();
    const overlay = document.createElement("div");
    overlay.className = "reaction-picker-overlay";

    const sheet = document.createElement("div");
    sheet.className = "reaction-picker-sheet";

    const title = document.createElement("div");
    title.className = "reaction-picker-title";
    title.textContent = "React with…";
    sheet.appendChild(title);

    let editMode = null;

    const capsuleLabel = document.createElement("div");
    capsuleLabel.className = "reaction-picker-section-label";
    capsuleLabel.textContent = "Your capsule — tap a slot to edit it";
    sheet.appendChild(capsuleLabel);

    const quickRow = document.createElement("div");
    quickRow.className = "reaction-picker-quick-row";
    const currentQuick = getQuickReactions();
    const workingQuick = [...currentQuick];

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
          editMode = editMode === `slot-${idx}` ? null : `slot-${idx}`;
          renderQuickSlots();
          updateModeHint();
        });
        quickRow.appendChild(slot);
      });
    }
    renderQuickSlots();
    sheet.appendChild(quickRow);

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

    const modeHint = document.createElement("div");
    modeHint.className = "reaction-picker-subtitle";
    function updateModeHint() {
      if (editMode === null) {
        modeHint.textContent =
          "Tap an emoji below to react — or tap a capsule slot above to edit it";
      } else if (editMode === "default") {
        modeHint.textContent =
          "Now tap any emoji below to set your double-tap default ↓";
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
          saveReaction(msgId, emoji);
          overlay.remove();
          unlockScroll();
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

    const closeBtn = document.createElement("button");
    closeBtn.className = "reaction-picker-close";
    closeBtn.textContent = "Save & Close";
    closeBtn.addEventListener("click", () => {
      saveCapsuleToFirestore(workingQuick, workingDefault);
      overlay.remove();
      unlockScroll();
    });
    sheet.appendChild(closeBtn);

    overlay.appendChild(sheet);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        saveCapsuleToFirestore(workingQuick, workingDefault);
        overlay.remove();
        unlockScroll();
      }
    });
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
  }

  document.addEventListener("click", (e) => {
    if (activeReactionBar && !activeReactionBar.contains(e.target)) {
      closeReactionBar();
    }
  });

  // Global dropdown close is handled by the mousedown listener registered above attachHoverActions

  // ─── ATTACH REACTIONS TO A ROW ────────────────────────────────────
  // On mobile: long-press on bubble (including over images) opens reaction bar.
  // Images handle their own double-tap/single-tap via touch handlers above.
  // We listen at the bubble level but skip if the exact target is a grid-img
  // (the image touchend already called e.preventDefault() so no click fires,
  // but touchstart/touchmove still bubble up for swipe detection).
  function attachReactions(row, msg, msgId) {
    const bubble = row.querySelector(".bubble");

    let _lp = null;
    let _lpFired = false;
    let _lastTap = 0;
    let _moved = false;
    let _startX = 0;
    let _startY = 0;

    bubble.addEventListener(
      "touchstart",
      (e) => {
        // Old behavior restored: holding anywhere in the message, including
        // directly on an image, opens the reaction capsule.
        _moved = false;
        _lpFired = false;
        row.__reactionHoldFired = false;
        _startX = e.touches[0].clientX;
        _startY = e.touches[0].clientY;
        const sinceLastTap = Date.now() - _lastTap;
        if (sinceLastTap < 350) return;

        _lp = setTimeout(() => {
          _lp = null;
          if (_moved) return;
          _lpFired = true;
          row.__reactionHoldFired = true;
          openReactionBar(msgId, row, msg);
        }, 650);
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - _startX);
        const dy = Math.abs(t.clientY - _startY);
        if (dx > 10 || dy > 10) {
          _moved = true;
          clearTimeout(_lp);
          _lp = null;
        }
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchcancel",
      () => {
        clearTimeout(_lp);
        _lp = null;
        _lpFired = false;
      },
      { passive: true },
    );

    bubble.addEventListener(
      "touchend",
      (e) => {
        clearTimeout(_lp);
        _lp = null;

        if (_moved) return;
        if (_lpFired) {
          _lpFired = false;
          // Keep the flag through the target's touchend and clear it after
          // the current event finishes, preventing a delayed lightbox open.
          setTimeout(() => {
            row.__reactionHoldFired = false;
          }, 350);
          return;
        }

        row.__reactionHoldFired = false;

        // Only handle double-tap-to-react on non-image parts of the bubble
        // (images handle their own double-tap)
        if (e.target.classList.contains("grid-img")) return;

        const now = Date.now();
        const gap = now - _lastTap;
        _lastTap = now;

        if (gap < 350 && gap > 30) {
          e.preventDefault();
          e.stopPropagation();
          saveReaction(msgId, getDoubleTapEmoji());
          showHeartBurst(bubble, getDoubleTapEmoji());
        }
      },
      { passive: false },
    );

    // Desktop mouse long-press (only on non-image elements)
    let _mlp = null;
    bubble.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("grid-img")) return; // images handle their own mousedown
      _mlp = setTimeout(() => {
        _mlp = null;
        openReactionBar(msgId, row, msg);
      }, 520);
    });
    bubble.addEventListener("mouseup", () => {
      clearTimeout(_mlp);
      _mlp = null;
    });
    bubble.addEventListener("mouseleave", () => {
      clearTimeout(_mlp);
      _mlp = null;
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
  const _reactionRegistry = new Map();
  const _lastKnownReactions = new Map();

  function watchReactions(msgId, wrap) {
    _reactionRegistry.set(msgId, wrap);
  }

  messagesRef.onSnapshot({ includeMetadataChanges: false }, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === "removed") {
        _reactionRegistry.delete(change.doc.id);
        _lastKnownReactions.delete(change.doc.id);
        return;
      }
      const msgId = change.doc.id;
      const reactions = change.doc.data().reactions || {};
      const reactionsJSON = JSON.stringify(reactions);
      if (_lastKnownReactions.get(msgId) === reactionsJSON) return;
      _lastKnownReactions.set(msgId, reactionsJSON);
      const wrap = _reactionRegistry.get(msgId);
      if (wrap) renderReactions(wrap, reactions, msgId);
    });
  });

  // ─── DESKTOP HOVER ACTIONS (3-dot menu) ──────────────────────────
  // Dropdown is appended to document.body with position:fixed so it always
  // renders above every message and is never clipped by overflow:hidden parents.
  // This also fixes the blur button being unclickable.

  let _activeDropdown = null; // { dropdownEl, triggerEl, actionsWrap }

  function closeAllDropdowns() {
    if (_activeDropdown) {
      _activeDropdown.dropdownEl.remove();
      _activeDropdown.triggerEl.classList.remove("open");
      _activeDropdown.actionsWrap.classList.remove("pinned");
      _activeDropdown = null;
      unlockScroll();
    }
  }

  // Close dropdown when clicking anywhere outside it.
  // Use mousedown (not click) so it fires before the trigger's click handler,
  // allowing re-click on the trigger to properly toggle closed.
  document.addEventListener("mousedown", (e) => {
    if (!_activeDropdown) return;
    if (
      _activeDropdown.dropdownEl.contains(e.target) ||
      _activeDropdown.triggerEl.contains(e.target)
    )
      return;
    closeAllDropdowns();
  });

  function attachHoverActions(row, msg, msgId) {
    const isSent = row.classList.contains("sent");

    const imgUrls = msg.imageUrls
      ? msg.imageUrls
      : msg.imageUrl
        ? [msg.imageUrl]
        : [];

    // ── Trigger button ──
    const trigger = document.createElement("button");
    trigger.className = "msg-actions-trigger";
    trigger.title = "Message actions";
    trigger.textContent = "•••";

    // ── Wrapper — attached to bubble-wrap with position:absolute ──
    // This makes it always appear directly beside the bubble regardless of row width.
    const actionsWrap = document.createElement("div");
    actionsWrap.className =
      "msg-hover-actions " + (isSent ? "actions-sent" : "actions-recv");
    actionsWrap.appendChild(trigger);

    function buildAndOpenDropdown() {
      // If already open for this trigger, close and bail
      if (_activeDropdown && _activeDropdown.triggerEl === trigger) {
        closeAllDropdowns();
        return;
      }
      // Close any other open dropdown
      closeAllDropdowns();

      const dropdown = document.createElement("div");
      dropdown.className = "msg-actions-dropdown-fixed";

      // ── React ──
      const reactItem = document.createElement("button");
      reactItem.className = "msg-action-item";
      const reactIcon = document.createElement("span");
      reactIcon.className = "action-icon";
      reactIcon.textContent = "😊";
      reactItem.appendChild(reactIcon);
      reactItem.appendChild(document.createTextNode(" React"));
      reactItem.addEventListener("mousedown", (e) => e.stopPropagation());
      reactItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        openReactionBar(msgId, row, msg);
      });

      // ── Reply ──
      const divider1 = document.createElement("hr");
      divider1.className = "msg-action-divider";

      const replyItem = document.createElement("button");
      replyItem.className = "msg-action-item";
      const replyIcon = document.createElement("span");
      replyIcon.className = "action-icon";
      replyIcon.textContent = "↩";
      replyItem.appendChild(replyIcon);
      replyItem.appendChild(document.createTextNode(" Reply"));
      replyItem.addEventListener("mousedown", (e) => e.stopPropagation());
      replyItem.addEventListener("click", (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        startReply(msg, msgId);
      });

      // On phones/tablets, long-press is the reaction gesture, so the
      // small-device menu intentionally has no separate React item.
      if (!isMobileUI()) {
        dropdown.appendChild(reactItem);
        dropdown.appendChild(divider1);
      }
      dropdown.appendChild(replyItem);

      if (imgUrls.length > 0) {
        // ── Save ──
        const divider2 = document.createElement("hr");
        divider2.className = "msg-action-divider";

        const saveItem = document.createElement("button");
        saveItem.className = "msg-action-item";
        const saveIcon = document.createElement("span");
        saveIcon.className = "action-icon";
        saveIcon.textContent = "💾";
        saveItem.appendChild(saveIcon);
        saveItem.appendChild(
          document.createTextNode(
            " " + (imgUrls.length > 1 ? "Save Images" : "Save Image"),
          ),
        );
        saveItem.addEventListener("mousedown", (e) => e.stopPropagation());
        saveItem.addEventListener("click", (e) => {
          e.stopPropagation();
          closeAllDropdowns();
          imgUrls.forEach((url) => saveImageToDevice(url));
        });

        dropdown.appendChild(divider2);
        dropdown.appendChild(saveItem);

        // Small-device individual selection. Holding the image is reserved
        // for reactions; image visibility actions live in this menu.
        if (isMobileUI() && imgUrls.length > 1) {
          const blurItem = document.createElement("button");
          blurItem.className = "msg-action-item";
          const blurIcon = document.createElement("span");
          blurIcon.className = "action-icon";
          blurIcon.textContent = "🖼️";
          blurItem.appendChild(blurIcon);
          blurItem.appendChild(document.createTextNode(" Blur"));
          blurItem.addEventListener("mousedown", (e) => e.stopPropagation());
          blurItem.addEventListener("click", (e) => {
            e.stopPropagation();
            closeAllDropdowns();
            openSeparateBlurPicker(imgUrls);
          });
          dropdown.appendChild(blurItem);
        }

        const divider3 = document.createElement("hr");
        divider3.className = "msg-action-divider";

        const blurAllItem = document.createElement("button");
        blurAllItem.className = "msg-action-item";
        const blurAllIcon = document.createElement("span");
        blurAllIcon.className = "action-icon";
        const allBlurred = imgUrls.every((url) => isImageBlurred(url));
        blurAllIcon.textContent = allBlurred ? "👁️" : "🫣";
        blurAllItem.appendChild(blurAllIcon);
        blurAllItem.appendChild(
          document.createTextNode(
            allBlurred ? " Unblur All Images" : " Blur All Images",
          ),
        );
        blurAllItem.addEventListener("mousedown", (e) => e.stopPropagation());
        blurAllItem.addEventListener("click", async (e) => {
          e.stopPropagation();
          closeAllDropdowns();
          try {
            await setImagesBlurred(imgUrls, !allBlurred);
          } catch (_) {
            showMiniNotif("Could not save blur setting");
          }
        });

        dropdown.appendChild(divider3);
        dropdown.appendChild(blurAllItem);

        // On larger devices restore the original separate-selection workflow.
        // Mobile keeps its simpler Blur All entry; individual Blur remains on long-press.
        if (!isMobileUI() && imgUrls.length > 1) {
          const blurSeparateItem = document.createElement("button");
          blurSeparateItem.className = "msg-action-item";
          const blurSeparateIcon = document.createElement("span");
          blurSeparateIcon.className = "action-icon";
          blurSeparateIcon.textContent = "🖼️";
          blurSeparateItem.appendChild(blurSeparateIcon);
          blurSeparateItem.appendChild(
            document.createTextNode(" Blur Separately"),
          );
          blurSeparateItem.addEventListener("mousedown", (e) =>
            e.stopPropagation(),
          );
          blurSeparateItem.addEventListener("click", (e) => {
            e.stopPropagation();
            openSeparateBlurPicker(imgUrls);
          });
          dropdown.appendChild(blurSeparateItem);
        }
      }

      // Append to body so it's never clipped by any parent overflow
      document.body.appendChild(dropdown);

      // Measure and position after render
      requestAnimationFrame(() => {
        const triggerRect = trigger.getBoundingClientRect();
        const ddW = dropdown.offsetWidth || 170;
        const ddH = dropdown.offsetHeight || (imgUrls.length > 0 ? 190 : 115);
        const margin = 8;
        const gap = 6; // gap between trigger bottom and dropdown top
        const vp = { w: window.innerWidth, h: window.innerHeight };

        // Vertically: open just below the trigger; flip above if not enough room below
        let top = triggerRect.bottom + gap;
        if (top + ddH > vp.h - margin) {
          top = triggerRect.top - ddH - gap;
        }

        // Horizontally: right-align to trigger for sent, left-align for recv
        let left;
        if (isSent) {
          left = triggerRect.right - ddW; // right edge of dropdown = right edge of trigger
        } else {
          left = triggerRect.left; // left edge of dropdown = left edge of trigger
        }

        // Clamp to viewport
        left = Math.max(margin, Math.min(left, vp.w - ddW - margin));
        top = Math.max(margin, Math.min(top, vp.h - ddH - margin));

        dropdown.style.top = top + "px";
        dropdown.style.left = left + "px";
        dropdown.style.width = "170px";

        lockScroll();
        dropdown.classList.add("open");
      });

      trigger.classList.add("open");
      actionsWrap.classList.add("pinned");
      _activeDropdown = {
        dropdownEl: dropdown,
        triggerEl: trigger,
        actionsWrap,
      };
    }

    // stopPropagation on mousedown prevents the document mousedown handler
    // from closing the dropdown before the click handler opens it
    trigger.addEventListener("mousedown", (e) => e.stopPropagation());
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      buildAndOpenDropdown();
    });

    // Attach actionsWrap to the bubble-wrap so position:absolute is relative to it
    const bubbleWrap = row.querySelector(".bubble-wrap");
    if (bubbleWrap) {
      bubbleWrap.appendChild(actionsWrap);
    } else {
      row.appendChild(actionsWrap); // fallback
    }
  }

  // ─── SWIPE-TO-REPLY ───────────────────────────────────────────────
  // FIX: Works on both text messages and image messages.
  // Image touchevents no longer stopPropagation, so swipe is detected at row level.
  const SWIPE_THRESHOLD = 55;

  function attachSwipeReply(row, msg, id) {
    let startX = 0,
      startY = 0,
      dx = 0;
    let swiping = false;
    let triggered = false;

    row.addEventListener(
      "touchstart",
      (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        dx = 0;
        swiping = false;
        triggered = false;
      },
      { passive: true },
    );

    row.addEventListener(
      "touchmove",
      (e) => {
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
        if (!validDir) {
          dx = 0;
          return;
        }

        const absDx = Math.abs(dx);
        const limited = Math.min(absDx, SWIPE_THRESHOLD * 1.2);
        const translateX = isSent ? -limited : limited;

        row.style.transform = `translateX(${translateX}px)`;

        if (absDx > SWIPE_THRESHOLD * 0.6) {
          row.classList.add("swipe-reveal");
        } else {
          row.classList.remove("swipe-reveal");
        }
      },
      { passive: true },
    );

    row.addEventListener(
      "touchend",
      () => {
        if (!swiping) return;
        row.classList.remove("swiping");
        row.classList.remove("swipe-reveal");
        row.style.transform = "";

        if (Math.abs(dx) > SWIPE_THRESHOLD && !triggered) {
          triggered = true;
          if (navigator.vibrate) navigator.vibrate(20);
          startReply(msg, id);
        }
      },
      { passive: true },
    );
  }

  // ─── JUMP TO QUOTED MESSAGE ───────────────────────────────────────
  function jumpToMessage(id) {
    const row = msgRowMap.get(id);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("highlight-flash");
    setTimeout(() => row.classList.remove("highlight-flash"), 1300);
  }

  // ─── PAGINATION ──────────────────────────────────────────────────
  const PAGE_SIZE = 40;
  let _oldestDoc = null;
  let _allLoaded = false;
  let _loadingMore = false;
  let _topSpinner = null;

  function showTopSpinner() {
    if (_topSpinner) return;
    _topSpinner = document.createElement("div");
    _topSpinner.id = "load-more-spinner";
    _topSpinner.innerHTML = `<span class="load-spinner-dot"></span><span class="load-spinner-dot"></span><span class="load-spinner-dot"></span>`;
    msgContainer.prepend(_topSpinner);
  }

  function hideTopSpinner() {
    if (_topSpinner) {
      _topSpinner.remove();
      _topSpinner = null;
    }
  }

  async function loadMoreMessages() {
    if (_loadingMore || _allLoaded || !_oldestDoc) return;
    _loadingMore = true;
    showTopSpinner();

    const scrollTopBefore = msgContainer.scrollTop;
    const scrollHeightBefore = msgContainer.scrollHeight;

    try {
      const snap = await messagesRef
        .orderBy("timestamp", "asc")
        .endBefore(_oldestDoc)
        .limitToLast(PAGE_SIZE)
        .get();

      hideTopSpinner();

      if (snap.empty) {
        _allLoaded = true;
        _loadingMore = false;
        return;
      }

      const savedLastDate = lastDate;
      const savedLastSender = lastSender;
      lastDate = null;
      lastSender = null;

      const frag = document.createDocumentFragment();
      snap.docs.forEach((doc) => {
        const els = buildMessageElements(doc.data(), doc.id, false);
        els.forEach((el) => frag.appendChild(el));
      });

      const firstReal = (() => {
        for (const child of msgContainer.children) {
          if (child.id !== "load-more-spinner") return child;
        }
        return null;
      })();
      if (firstReal) msgContainer.insertBefore(frag, firstReal);
      else msgContainer.appendChild(frag);

      msgContainer
        .querySelectorAll("img[data-lazy-src]")
        .forEach((img) => _imgObserver.observe(img));

      snap.docs.forEach((doc) => {
        const row = msgContainer.querySelector(`.msg-row[data-id="${doc.id}"]`);
        if (row) msgRowMap.set(doc.id, row);
      });

      lastDate = savedLastDate;
      lastSender = savedLastSender;
      _oldestDoc = snap.docs[0];
      if (snap.docs.length < PAGE_SIZE) _allLoaded = true;

      const heightAdded = msgContainer.scrollHeight - scrollHeightBefore;
      msgContainer.scrollTop = scrollTopBefore + heightAdded;
    } catch (e) {
      console.error("Load more failed:", e);
      hideTopSpinner();
    }
    _loadingMore = false;
  }

  msgContainer.addEventListener(
    "scroll",
    () => {
      if (msgContainer.scrollTop < 200 && !_loadingMore && !_allLoaded) {
        loadMoreMessages();
      }
    },
    { passive: true },
  );

  // ─── REAL-TIME LISTENER ───────────────────────────────────────────
  messagesRef
    .orderBy("timestamp", "asc")
    .limitToLast(PAGE_SIZE)
    .get()
    .then((snap) => {
      if (!snap.empty) {
        _oldestDoc = snap.docs[0];
        lastDate = null;
        lastSender = null;
        _pendingFirstBatch = snap.docs.map((doc) => ({
          msg: doc.data(),
          id: doc.id,
        }));
        clearTimeout(_firstBatchTimer);
        _firstBatchTimer = setTimeout(flushFirstBatch, 60);
        if (snap.docs.length < PAGE_SIZE) _allLoaded = true;
      } else {
        loader.style.display = "none";
        firstLoad = false;
      }

      const liveQuery = snap.empty
        ? messagesRef.orderBy("timestamp", "asc")
        : messagesRef
            .orderBy("timestamp", "asc")
            .startAfter(snap.docs[snap.docs.length - 1]);

      liveQuery.onSnapshot((liveSnap) => {
        liveSnap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const msg = change.doc.data();
            const isNew = !firstLoad;
            renderMessage(msg, change.doc.id, isNew);
            if (isNew && msg.sender !== WHO) {
              sendBrowserNotif(
                SENDER_DISPLAY[msg.sender] || msg.sender,
                msg.text,
                msg.imageUrls ? msg.imageUrls[0] : msg.imageUrl,
              );
              if (!document.hidden) updateMyReadTime();
            }
          }
          // Reaction updates arrive as "modified" on the live query
          if (change.type === "modified") {
            const msgId = change.doc.id;
            const reactions = change.doc.data().reactions || {};
            const reactionsJSON = JSON.stringify(reactions);
            if (_lastKnownReactions.get(msgId) === reactionsJSON) return;
            _lastKnownReactions.set(msgId, reactionsJSON);
            const wrap = _reactionRegistry.get(msgId);
            if (wrap) renderReactions(wrap, reactions, msgId);
          }
        });
        if (firstLoad) {
          firstLoad = false;
          if (_pendingFirstBatch.length === 0) loader.style.display = "none";
        }
      });
    })
    .catch((err) => {
      console.error("Initial load failed:", err);
      loader.style.display = "none";
      firstLoad = false;
    });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateMyReadTime();
  });
  window.addEventListener("focus", updateMyReadTime);

  // ─── LIGHTBOX ────────────────────────────────────────────────────
  // FIX: prev/next arrows always visible when applicable.
  // FIX: no double-open glitch — touch uses preventDefault so no synthetic click fires.
  // FIX: click zones on image itself for navigation.

  function openLightbox(images, startIdx = 0) {
    // Always browse ALL chat images, not just this message's images.
    const clickedUrl = images[startIdx];
    const globalIdx = globalLightboxIndex(clickedUrl);
    lbImages = _allChatImages.map((e) => e.url);
    lbIndex = globalIdx >= 0 ? globalIdx : 0;

    closeReactionBar();
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    showLightboxImage();
    history.pushState({ lightboxOpen: true }, "");
  }

  function showLightboxImage() {
    lightboxImg.classList.remove("lb-fade");
    void lightboxImg.offsetWidth;
    lightboxImg.classList.add("lb-fade");
    lightboxImg.src = lbImages[lbIndex];

    const navEl = document.getElementById("lightbox-nav");
    if (lbImages.length > 1) {
      lightboxCounter.textContent = `${lbIndex + 1} / ${lbImages.length}`;
      navEl.style.display = "flex";
    } else {
      navEl.style.display = "none";
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

  // Clicking left half of image = previous, right half = next, single image = close
  lightboxImg.addEventListener("click", (e) => {
    e.stopPropagation();
    if (lbImages.length <= 1) {
      closeLightbox();
      return;
    }
    const rect = lightboxImg.getBoundingClientRect();
    const clickedLeft = e.clientX < rect.left + rect.width / 2;
    if (clickedLeft && lbIndex > 0) {
      lbIndex--;
      showLightboxImage();
    } else if (!clickedLeft && lbIndex < lbImages.length - 1) {
      lbIndex++;
      showLightboxImage();
    }
  });

  // Touch swipe on lightbox
  let lbTouchStartX = null;
  let lbTouchStartY = null;
  lightbox.addEventListener(
    "touchstart",
    (e) => {
      if (e.target === lightboxClose) return;
      lbTouchStartX = e.touches[0].clientX;
      lbTouchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  lightbox.addEventListener(
    "touchend",
    (e) => {
      if (lbTouchStartX === null) return;
      const dx = e.changedTouches[0].clientX - lbTouchStartX;
      const dy = Math.abs(e.changedTouches[0].clientY - lbTouchStartY);
      // Only treat as swipe if horizontal movement dominates
      if (Math.abs(dx) > 50 && Math.abs(dx) > dy) {
        if (dx < 0 && lbIndex < lbImages.length - 1) {
          lbIndex++;
          showLightboxImage();
        } else if (dx > 0 && lbIndex > 0) {
          lbIndex--;
          showLightboxImage();
        }
      }
      lbTouchStartX = null;
      lbTouchStartY = null;
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
    if (history.state && history.state.lightboxOpen) history.back();
  }

  // ─── IMAGE ACTION MENU (long-press on image) ──────────────────────
  async function saveImageToDevice(url, showNotice = true) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const ext = blob.type.includes("webp")
        ? "webp"
        : blob.type.includes("png")
          ? "png"
          : "jpg";
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `photo_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(objUrl);
        a.remove();
      }, 1000);
      if (showNotice) showMiniNotif("💾 Image saved!");
    } catch (err) {
      window.open(url, "_blank", "noopener");
      if (showNotice)
        showMiniNotif("📂 Opened in new tab — long-press to save");
    }
  }

  let _lastImageActionOpenAt = 0;
  let _lastImageActionUrl = "";

  function openImageActionMenu(
    imgUrl,
    imgEl,
    anchorEl,
    isSentMsg,
    allImageUrls = [imgUrl],
    msgId = null,
    msgRow = null,
    msgData = null,
  ) {
    // This app menu is deliberately mobile/touch-only. Desktop uses 3 dots.
    if (!isTouchOnlyUI()) return;

    // Android may create a synthetic contextmenu after our hold timer.
    // Ignore that second event so the menu does not flash twice.
    const now = Date.now();
    if (_lastImageActionUrl === imgUrl && now - _lastImageActionOpenAt < 900) {
      return;
    }
    _lastImageActionUrl = imgUrl;
    _lastImageActionOpenAt = now;

    const messageUrls = [
      ...new Set(
        (Array.isArray(allImageUrls) ? allImageUrls : [imgUrl]).filter(Boolean),
      ),
    ];

    document.querySelectorAll(".img-action-popover").forEach((p) => p.remove());
    closeReactionBar();
    unlockScroll();
    lockScroll();

    const popover = document.createElement("div");
    popover.className = "img-action-popover";

    const closePopover = () => {
      popover.remove();
      unlockScroll();
    };

    const isBlurred = isImageBlurred(imgUrl);
    const allBlurred =
      messageUrls.length > 0 && messageUrls.every((url) => isImageBlurred(url));

    const items = [];

    items.push({
      icon: "💾",
      label: "Save Image",
      fn: async () => {
        closePopover();
        await saveImageToDevice(imgUrl);
      },
    });

    if (messageUrls.length > 1) {
      items.push({
        icon: "📥",
        label: "Save All",
        fn: async () => {
          closePopover();
          let saved = 0;
          for (const url of messageUrls) {
            try {
              await saveImageToDevice(url, false);
              saved += 1;
              await new Promise((resolve) => setTimeout(resolve, 140));
            } catch (_) {}
          }
          showMiniNotif(
            saved === messageUrls.length
              ? `💾 Saved all ${saved} images`
              : `💾 Saved ${saved} of ${messageUrls.length} images`,
          );
        },
      });
    }

    items.push({
      icon: isBlurred ? "👁️" : "🫣",
      label: isBlurred ? "Unblur" : "Blur",
      fn: async () => {
        try {
          await toggleImageBlur(imgUrl, imgEl);
        } catch (_) {
          showMiniNotif("Could not save blur setting");
        } finally {
          closePopover();
        }
      },
    });

    if (messageUrls.length > 1) {
      items.push({
        icon: allBlurred ? "👁️" : "🫣",
        label: allBlurred ? "Unblur All" : "Blur All",
        fn: async () => {
          try {
            await setImagesBlurred(messageUrls, !allBlurred);
          } catch (_) {
            showMiniNotif("Could not save blur setting");
          } finally {
            closePopover();
          }
        },
      });
    }

    items.forEach(({ icon, label, fn }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "img-action-popover-btn";

      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;

      btn.appendChild(iconSpan);
      btn.appendChild(labelSpan);
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
      popover.appendChild(btn);
    });

    document.body.appendChild(popover);

    requestAnimationFrame(() => {
      const rect = anchorEl.getBoundingClientRect();
      const pw = popover.offsetWidth || 170;
      const ph = popover.offsetHeight || 210;
      const margin = 10;
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let top = rect.top + rect.height / 2 - ph / 2;
      let left;

      if (isSentMsg) {
        left = rect.right + margin;
        if (left + pw > vw - pad) left = rect.left - pw - margin;
      } else {
        left = rect.left - pw - margin;
        if (left < pad) left = rect.right + margin;
      }

      left = Math.max(pad, Math.min(left, vw - pw - pad));
      top = Math.max(pad, Math.min(top, vh - ph - pad));

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      popover.classList.add("visible");
    });

    const closeOnOutside = (event) => {
      if (!popover.contains(event.target)) {
        closePopover();
        document.removeEventListener("pointerdown", closeOnOutside, true);
      }
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", closeOnOutside, true);
    }, 80);
  }

  // ─── CAMERA ──────────────────────────────────────────────────────
  cameraBtn.addEventListener("click", openCamera);

  function ensureCameraEnhancementUI() {
    if (cameraStage) return;

    cameraStage = document.createElement("div");
    cameraStage.id = "camera-stage";
    cameraFeed.parentNode.insertBefore(cameraStage, cameraFeed);
    cameraStage.appendChild(cameraFeed);

    cameraFocusIndicator = document.createElement("div");
    cameraFocusIndicator.id = "camera-focus-indicator";
    cameraStage.appendChild(cameraFocusIndicator);

    cameraCountdownEl = document.createElement("div");
    cameraCountdownEl.id = "camera-countdown";
    cameraStage.appendChild(cameraCountdownEl);

    const optionsRow = document.createElement("div");
    optionsRow.id = "camera-options-row";

    const timerWrap = document.createElement("div");
    timerWrap.id = "camera-timer-wrap";

    cameraTimerBtn = document.createElement("button");
    cameraTimerBtn.type = "button";
    cameraTimerBtn.id = "camera-timer-btn";
    cameraTimerBtn.className = "cam-option-btn";
    cameraTimerBtn.textContent = "⏱ Off";

    cameraTimerMenu = document.createElement("div");
    cameraTimerMenu.id = "camera-timer-menu";
    cameraTimerMenu.innerHTML = `
      <button type="button" class="camera-timer-choice active" data-seconds="0">Off</button>
      <button type="button" class="camera-timer-choice" data-seconds="5">5s</button>
      <button type="button" class="camera-timer-choice" data-seconds="10">10s</button>
      <button type="button" class="camera-timer-choice" data-seconds="15">15s</button>
      <div class="camera-custom-timer">
        <input id="camera-custom-seconds" type="number" min="1" max="60" inputmode="numeric" placeholder="Custom" />
        <button id="camera-custom-set" type="button">Set</button>
      </div>
    `;

    timerWrap.appendChild(cameraTimerBtn);
    timerWrap.appendChild(cameraTimerMenu);

    cameraExposureWrap = document.createElement("label");
    cameraExposureWrap.id = "camera-exposure-wrap";
    cameraExposureWrap.innerHTML = `
      <span>☀️</span>
      <input id="camera-exposure-slider" type="range" />
      <span id="camera-exposure-value">0</span>
    `;
    cameraExposureSlider = cameraExposureWrap.querySelector(
      "#camera-exposure-slider",
    );
    cameraExposureValue = cameraExposureWrap.querySelector(
      "#camera-exposure-value",
    );

    optionsRow.appendChild(timerWrap);
    optionsRow.appendChild(cameraExposureWrap);
    cameraLiveWrap.insertBefore(
      optionsRow,
      document.getElementById("camera-controls"),
    );

    cameraTimerBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      cameraTimerMenu.classList.toggle("visible");
    });

    cameraTimerMenu
      .querySelectorAll(".camera-timer-choice")
      .forEach((button) => {
        button.addEventListener("click", () => {
          setCameraTimer(Number(button.dataset.seconds));
          cameraTimerMenu.classList.remove("visible");
        });
      });

    cameraTimerMenu
      .querySelector("#camera-custom-set")
      .addEventListener("click", () => {
        const input = cameraTimerMenu.querySelector("#camera-custom-seconds");
        const requestedSeconds = Number(input.value);
        if (!Number.isFinite(requestedSeconds) || requestedSeconds < 1) return;
        const seconds = Math.round(Math.min(60, requestedSeconds));
        input.value = String(seconds);
        setCameraTimer(seconds);
        cameraTimerMenu.classList.remove("visible");
      });

    cameraStage.addEventListener("pointerup", focusCameraAtPointer);
    cameraExposureSlider.addEventListener("input", applyExposureCompensation);

    document.addEventListener("click", (event) => {
      if (cameraTimerMenu && !timerWrap.contains(event.target)) {
        cameraTimerMenu.classList.remove("visible");
      }
    });
  }

  function setCameraTimer(seconds) {
    cameraTimerSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    cameraTimerBtn.textContent =
      cameraTimerSeconds > 0 ? `⏱ ${cameraTimerSeconds}s` : "⏱ Off";
    cameraTimerMenu
      .querySelectorAll(".camera-timer-choice")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          Number(button.dataset.seconds) === cameraTimerSeconds,
        );
      });
  }

  function waitForVideoMetadata() {
    if (cameraFeed.readyState >= 1 && cameraFeed.videoWidth > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      cameraFeed.addEventListener("loadedmetadata", resolve, { once: true });
    });
  }

  async function applyAutomaticCameraControls(track) {
    if (!track || typeof track.getCapabilities !== "function") return;
    const capabilities = track.getCapabilities();
    const advanced = {};

    if (capabilities.focusMode?.includes("continuous")) {
      advanced.focusMode = "continuous";
    }
    if (capabilities.exposureMode?.includes("continuous")) {
      advanced.exposureMode = "continuous";
    }
    if (capabilities.whiteBalanceMode?.includes("continuous")) {
      advanced.whiteBalanceMode = "continuous";
    }

    if (Object.keys(advanced).length > 0) {
      try {
        await track.applyConstraints({ advanced: [advanced] });
      } catch (error) {
        console.warn("Automatic camera controls were not accepted:", error);
      }
    }

    const exposure = capabilities.exposureCompensation;
    if (
      exposure &&
      Number.isFinite(exposure.min) &&
      Number.isFinite(exposure.max) &&
      exposure.max > exposure.min
    ) {
      const settings = track.getSettings ? track.getSettings() : {};
      const value = Number.isFinite(settings.exposureCompensation)
        ? settings.exposureCompensation
        : Math.min(exposure.max, Math.max(exposure.min, 0));
      cameraExposureSlider.min = String(exposure.min);
      cameraExposureSlider.max = String(exposure.max);
      cameraExposureSlider.step = String(exposure.step || 0.1);
      cameraExposureSlider.value = String(value);
      cameraExposureValue.textContent = Number(value).toFixed(1);
      cameraExposureWrap.classList.add("supported");
    } else {
      cameraExposureWrap.classList.remove("supported");
    }
  }

  async function startCameraStream() {
    cancelCameraCountdown();
    cameraFocusUnsupportedNotified = false;
    clearTimeout(cameraFocusResetTimer);
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      cameraFeed.srcObject = cameraStream;
      cameraFeed.classList.toggle("mirrored", facingMode === "user");
      await cameraFeed.play();
      await waitForVideoMetadata();
      await applyAutomaticCameraControls(cameraStream.getVideoTracks()[0]);
    } catch (err) {
      alert("Camera not available: " + err.message);
      closeCamera();
    }
  }

  function getVideoFocusPoint(event) {
    const rect = cameraFeed.getBoundingClientRect();
    const localX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const localY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

    const sourceW = cameraFeed.videoWidth || rect.width;
    const sourceH = cameraFeed.videoHeight || rect.height;
    const sourceAspect = sourceW / sourceH;
    const boxAspect = rect.width / rect.height;

    let x;
    let y;

    // Correct the tap for object-fit: cover cropping.
    if (sourceAspect > boxAspect) {
      const renderedW = rect.height * sourceAspect;
      const croppedX = (renderedW - rect.width) / 2;
      x = (localX + croppedX) / renderedW;
      y = localY / rect.height;
    } else {
      const renderedH = rect.width / sourceAspect;
      const croppedY = (renderedH - rect.height) / 2;
      x = localX / rect.width;
      y = (localY + croppedY) / renderedH;
    }

    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    if (facingMode === "user") x = 1 - x;

    return {
      x,
      y,
      displayX: Math.max(0, Math.min(100, (localX / rect.width) * 100)),
      displayY: Math.max(0, Math.min(100, (localY / rect.height) * 100)),
    };
  }

  async function tryCameraConstraint(track, constraint) {
    try {
      await track.applyConstraints({ advanced: [constraint] });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function focusCameraAtPointer(event) {
    if (!cameraStream || cameraIsCountingDown || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const track = cameraStream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") return;

    const point = getVideoFocusPoint(event);
    cameraFocusIndicator.style.left = `${point.displayX}%`;
    cameraFocusIndicator.style.top = `${point.displayY}%`;
    cameraFocusIndicator.classList.remove(
      "show",
      "focus-success",
      "focus-limited",
    );
    void cameraFocusIndicator.offsetWidth;
    cameraFocusIndicator.classList.add("show");

    if (typeof track.getCapabilities !== "function") {
      cameraFocusIndicator.classList.add("focus-limited");
      return;
    }

    const capabilities = track.getCapabilities();
    const supported = navigator.mediaDevices.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints()
      : {};
    const focusModes = Array.isArray(capabilities.focusMode)
      ? capabilities.focusMode
      : [];

    let pointAccepted = false;
    let focusTriggered = false;

    // Apply one setting at a time. Combining optional camera constraints in
    // one object makes several Android devices reject the entire request.
    if (supported.pointsOfInterest || "pointsOfInterest" in capabilities) {
      pointAccepted = await tryCameraConstraint(track, {
        pointsOfInterest: [{ x: point.x, y: point.y }],
      });
    }

    if (focusModes.includes("single-shot")) {
      focusTriggered = await tryCameraConstraint(track, {
        focusMode: "single-shot",
      });
    } else if (focusModes.includes("continuous")) {
      // Re-applying continuous focus asks the camera to run autofocus again.
      focusTriggered = await tryCameraConstraint(track, {
        focusMode: "continuous",
      });
    }

    const accepted = pointAccepted || focusTriggered;
    cameraFocusIndicator.classList.add(
      accepted ? "focus-success" : "focus-limited",
    );

    clearTimeout(cameraFocusResetTimer);
    if (focusTriggered && focusModes.includes("continuous")) {
      // Do not switch back too quickly: many phones need over a second to lock.
      cameraFocusResetTimer = setTimeout(async () => {
        const latestTrack = cameraStream?.getVideoTracks()[0];
        if (!latestTrack || latestTrack.readyState !== "live") return;
        await tryCameraConstraint(latestTrack, { focusMode: "continuous" });
      }, 2500);
    }

    if (!accepted && !cameraFocusUnsupportedNotified) {
      cameraFocusUnsupportedNotified = true;
      showMiniNotif("This camera only allows automatic focus in the browser");
    }
  }

  async function applyExposureCompensation() {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    const value = Number(cameraExposureSlider.value);
    cameraExposureValue.textContent = value.toFixed(1);
    try {
      await track.applyConstraints({
        advanced: [{ exposureCompensation: value }],
      });
    } catch (error) {
      console.warn("Exposure adjustment is not supported:", error);
    }
  }

  function cancelCameraCountdown() {
    cameraCountdownToken += 1;
    cameraIsCountingDown = false;
    snapBtn.disabled = false;
    snapBtn.classList.remove("counting");
    if (cameraCountdownEl) {
      cameraCountdownEl.textContent = "";
      cameraCountdownEl.classList.remove("visible");
    }
  }

  async function beginCameraCapture() {
    if (cameraIsCountingDown) {
      cancelCameraCountdown();
      return;
    }

    if (cameraTimerSeconds <= 0) {
      captureCurrentFrame();
      return;
    }

    cameraIsCountingDown = true;
    snapBtn.disabled = true;
    snapBtn.classList.add("counting");
    const token = ++cameraCountdownToken;

    for (let remaining = cameraTimerSeconds; remaining > 0; remaining--) {
      if (token !== cameraCountdownToken) return;
      cameraCountdownEl.textContent = String(remaining);
      cameraCountdownEl.classList.add("visible");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (token !== cameraCountdownToken) return;
    cameraCountdownEl.textContent = "";
    cameraCountdownEl.classList.remove("visible");
    cameraIsCountingDown = false;
    snapBtn.disabled = false;
    snapBtn.classList.remove("counting");
    captureCurrentFrame();
  }

  function captureCurrentFrame() {
    const video = cameraFeed;
    if (!video.videoWidth || !video.videoHeight) return;

    snapCanvas.width = video.videoWidth;
    snapCanvas.height = video.videoHeight;
    const ctx = snapCanvas.getContext("2d");
    ctx.save();
    if (facingMode === "user") {
      ctx.translate(snapCanvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    ctx.restore();

    snapCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        capturedBlob = blob;
        pendingCameraFile = new File([blob], `photo_${Date.now()}.jpg`, {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
        queueSelectedFilesDraftSave();
        if (cameraPreviewObjectUrl) {
          URL.revokeObjectURL(cameraPreviewObjectUrl);
        }
        cameraPreviewObjectUrl = URL.createObjectURL(blob);
        cameraPreviewImg.src = cameraPreviewObjectUrl;
        cameraLiveWrap.style.display = "none";
        cameraPreviewWrap.classList.add("visible");
      },
      "image/jpeg",
      0.92,
    );
  }

  snapBtn.addEventListener("click", beginCameraCapture);

  flipCameraBtn.addEventListener("click", async () => {
    cancelCameraCountdown();
    facingMode = facingMode === "environment" ? "user" : "environment";
    await startCameraStream();
  });

  retakeBtn.addEventListener("click", () => {
    capturedBlob = null;
    pendingCameraFile = null;
    queueSelectedFilesDraftSave();
    if (cameraPreviewObjectUrl) {
      URL.revokeObjectURL(cameraPreviewObjectUrl);
      cameraPreviewObjectUrl = null;
    }
    cameraPreviewImg.removeAttribute("src");
    cameraPreviewWrap.classList.remove("visible");
    cameraLiveWrap.style.display = "flex";
  });

  usePhotoBtn.addEventListener("click", () => {
    if (!capturedBlob) return;
    const file =
      pendingCameraFile ||
      new File([capturedBlob], `photo_${Date.now()}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    pendingCameraFile = null;
    addFilesToSelection([file]);
    closeCamera(true, false);
  });

  closeCameraBtn.addEventListener("click", () => closeCamera());

  function pushCameraHistoryState() {
    history.pushState({ cameraOpen: true }, "");
  }

  window.addEventListener("popstate", (e) => {
    if (lightbox.classList.contains("open")) {
      lightbox.classList.remove("open");
      document.body.style.overflow = "";
      lbImages = [];
      lbIndex = 0;
      return;
    }
    if (cameraModal.classList.contains("open")) {
      e.preventDefault();
      closeCamera(false, true);
    }
  });

  async function openCamera() {
    ensureCameraEnhancementUI();
    cameraModal.classList.add("open");
    cameraLiveWrap.style.display = "flex";
    cameraPreviewWrap.classList.remove("visible");
    capturedBlob = null;
    pushCameraHistoryState();
    await startCameraStream();
  }

  function closeCamera(useHistoryBack = true, discardPending = true) {
    cancelCameraCountdown();
    clearTimeout(cameraFocusResetTimer);
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    if (cameraPreviewObjectUrl) {
      URL.revokeObjectURL(cameraPreviewObjectUrl);
      cameraPreviewObjectUrl = null;
    }
    capturedBlob = null;
    if (discardPending) {
      pendingCameraFile = null;
      queueSelectedFilesDraftSave();
    }
    cameraPreviewImg.removeAttribute("src");
    cameraModal.classList.remove("open");
    document.body.style.overflow = "";
    if (useHistoryBack && history.state && history.state.cameraOpen) {
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
        }
      }
    } catch (err) {
      console.warn("FCM token registration failed:", err);
    }
  }

  // ─── INIT ────────────────────────────────────────────────────────
  loadCapsuleFromFirestore();
  initNotifications();
  restoreSelectedFilesDraft();
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  if (typeof checkAuthentication === "function") {
    setTimeout(() => {
      loader.style.display = "none";
    }, 4000);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      queueSelectedFilesDraftSave();
    }
  });

  window.addEventListener("pagehide", () => {
    queueSelectedFilesDraftSave();
  });
} // end initChat
