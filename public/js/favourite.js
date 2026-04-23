// ── IMAGE PATHS ──────────────────────────────────────────────
const IMG_PLAY = "sliki/icons/playBtn.png";
const IMG_PAUSE = "sliki/icons/stopBtn.png";
const IMG_PREV = "sliki/icons/skipPrevious.png";
const IMG_NEXT = "sliki/icons/skipNext.png";

// ── GLOBAL STATE ─────────────────────────────────────────────
const audio = document.getElementById("globalAudio");
let searchResults = [];
let currentIdx = -1;
let ticker;
let savedIds = new Set();
let cardCurrentId = null;

// ── AUTH ──────────────────────────────────────────────────────
if (typeof checkAuthentication === "function") checkAuthentication();

// ── ARTWORK HELPER ────────────────────────────────────────────
function getArtwork(url) {
  if (!url) return "";
  return url
    .replace("100x100bb", "600x600bb")
    .replace("60x60bb", "600x600bb")
    .replace("100x100", "600x600")
    .replace("60x60", "600x600")
    .replace("http://", "https://");
}

// ── SEARCH ────────────────────────────────────────────────────
document.getElementById("searchBtn").addEventListener("click", doSearch);
document.getElementById("searchFld").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

async function doSearch() {
  const q = document.getElementById("searchFld").value.trim();
  if (!q) return;
  setResultsHTML(
    '<div class="spinner"></div><div class="state-msg" style="padding:8px;">Searching…</div>',
  );
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=15`,
    );
    const data = await res.json();
    searchResults = data.results.filter((s) => s.previewUrl);
    if (!searchResults.length) {
      setResultsHTML('<div class="state-msg">No results found.</div>');
      return;
    }
    renderResults();
  } catch (e) {
    setResultsHTML(
      '<div class="state-msg" style="color:#f87171;">Search failed — check your connection.</div>',
    );
  }
}

function renderResults() {
  const list = document.getElementById("resultsList");
  list.innerHTML = "";
  searchResults.forEach((song, i) => {
    const row = document.createElement("div");
    row.className = "result-row" + (i === currentIdx ? " playing" : "");
    row.id = "rrow-" + i;

    const isSaved = savedIds.has(song.trackId);

    // Artwork
    const art = document.createElement("img");
    art.src = getArtwork(song.artworkUrl100 || song.artworkUrl60);
    art.crossOrigin = "anonymous";
    art.referrerPolicy = "no-referrer";

    // Info
    const info = document.createElement("div");
    info.className = "result-info";
    info.innerHTML = `<div class="result-name">${esc(song.trackName)}</div>
                              <div class="result-artist">${esc(song.artistName)}</div>`;

    // Play button with image
    const playBtn = document.createElement("button");
    playBtn.className = "result-play-btn hvrBtn";
    playBtn.title = "Preview";
    const playImg = document.createElement("img");
    playImg.src = IMG_PLAY;
    playImg.alt = "play";
    playImg.className = "btn-icon";
    playImg.id = "rpi-" + i;
    playBtn.appendChild(playImg);
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      playSong(i);
    });

    // Add button
    const addBtn = document.createElement("button");
    const centerIconOFAdd = document.createElement("span");
    centerIconOFAdd.className = "centerIconOFAdd";
    addBtn.className = "add-to-fav-btn" + (isSaved ? " saved" : "");
    addBtn.id = "addbtn-" + i;
    if (isSaved) {
      centerIconOFAdd.textContent = "✓";
    } else {
      const img = document.createElement("img");
      img.src = "sliki/icons/plus.png"; // <-- your image path
      img.className = "plus-icon-now hvrBtn";
      img.alt = "add";
      centerIconOFAdd.appendChild(img);
    }
    addBtn.appendChild(centerIconOFAdd);
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSong(i, addBtn);
    });

    row.append(art, info, playBtn, addBtn);
    row.addEventListener("click", () => playSong(i));
    list.appendChild(row);
  });
}

// ── PLAY FROM SEARCH RESULTS ──────────────────────────────────
function playSong(i) {
  const song = searchResults[i];
  if (!song?.previewUrl) return;

  const wasPlaying = currentIdx === i && !audio.paused;

  // Reset all result-row play images back to play icon
  document
    .querySelectorAll("[id^='rpi-']")
    .forEach((img) => (img.src = IMG_PLAY));
  document
    .querySelectorAll(".result-row")
    .forEach((r) => r.classList.remove("playing"));

  if (wasPlaying) {
    audio.pause();
    setMiniPlayImg(IMG_PLAY);
    return;
  }

  // Stop any card that was playing
  if (cardCurrentId) {
    const cf = document.getElementById("cpf-" + cardCurrentId);
    const cb = document.getElementById("cimg-" + cardCurrentId);
    if (cf) cf.style.width = "0%";
    if (cb) cb.src = IMG_PLAY;
    cardCurrentId = null;
  }

  currentIdx = i;
  audio.src = song.previewUrl;
  audio.play();

  // Mark this row as playing
  const row = document.getElementById("rrow-" + i);
  if (row) row.classList.add("playing");
  const rpi = document.getElementById("rpi-" + i);
  if (rpi) rpi.src = IMG_PAUSE;

  // Update mini player
  document.getElementById("miniArt").src = getArtwork(
    song.artworkUrl100 || song.artworkUrl60,
  );
  document.getElementById("miniTitle").textContent = song.trackName;
  document.getElementById("miniArtist").textContent = song.artistName;
  document.getElementById("miniPlayer").classList.add("visible");
  setMiniPlayImg(IMG_PAUSE);

  startTicker();
}

// ── MINI PLAYER CONTROLS ──────────────────────────────────────
function toggleMini() {
  if (audio.paused) {
    audio.play();
  } else {
    audio.pause();
  }
}

function cardSkip(dir) {
  const next = currentIdx + dir;
  if (next >= 0 && next < searchResults.length) playSong(next);
}

function miniSeek(e) {
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  audio.currentTime = pct * audio.duration;
}

function setMiniPlayImg(src) {
  document.getElementById("miniPlayImg").src = src;
}

function startTicker() {
  clearInterval(ticker);
  ticker = setInterval(() => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    document.getElementById("miniFill").style.width = pct.toFixed(1) + "%";
    document.getElementById("miniCurrent").textContent = fmt(audio.currentTime);
    document.getElementById("miniDuration").textContent = fmt(audio.duration);

    if (cardCurrentId) {
      const fill = document.getElementById("cpf-" + cardCurrentId);
      if (fill) fill.style.width = pct.toFixed(1) + "%";
    }
  }, 300);
}

// ── AUDIO EVENTS ──────────────────────────────────────────────
audio.addEventListener("ended", () => {
  setMiniPlayImg(IMG_PLAY);
  // Reset result row icon
  if (currentIdx >= 0) {
    const rpi = document.getElementById("rpi-" + currentIdx);
    if (rpi) rpi.src = IMG_PLAY;
    document
      .querySelectorAll(".result-row")
      .forEach((r) => r.classList.remove("playing"));
  }
  // Reset card
  if (cardCurrentId) {
    const cb = document.getElementById("cimg-" + cardCurrentId);
    const cf = document.getElementById("cpf-" + cardCurrentId);
    if (cb) cb.src = IMG_PLAY;
    if (cf) cf.style.width = "0%";
    cardCurrentId = null;
  }
  clearInterval(ticker);
});

audio.addEventListener("pause", () => {
  setMiniPlayImg(IMG_PLAY);
  if (cardCurrentId) {
    const cb = document.getElementById("cimg-" + cardCurrentId);
    if (cb) cb.src = IMG_PLAY;
  }
  if (currentIdx >= 0) {
    const rpi = document.getElementById("rpi-" + currentIdx);
    if (rpi) rpi.src = IMG_PLAY;
  }
});

audio.addEventListener("play", () => {
  setMiniPlayImg(IMG_PAUSE);
  if (cardCurrentId) {
    const cb = document.getElementById("cimg-" + cardCurrentId);
    if (cb) cb.src = IMG_PAUSE;
  }
  if (currentIdx >= 0) {
    const rpi = document.getElementById("rpi-" + currentIdx);
    if (rpi) rpi.src = IMG_PAUSE;
  }
});

document
  .getElementById("secondary01")
  .addEventListener("click", () => cardSkip(-1));
document.getElementById("miniPlayBtn").addEventListener("click", toggleMini);
document
  .getElementById("secondary02")
  .addEventListener("click", () => cardSkip(1));
document.getElementById("miniTrack").addEventListener("click", miniSeek);

// ── SAVE SONG ─────────────────────────────────────────────────
async function saveSong(i, btn) {
  const song = searchResults[i];
  if (savedIds.has(song.trackId)) return;

  btn.textContent = "…";
  btn.disabled = true;

  try {
    const songData = {
      name: song.trackName,
      artist: song.artistName,
      artwork: getArtwork(song.artworkUrl100 || song.artworkUrl60),
      previewUrl: song.previewUrl,
      trackId: song.trackId,
    };

    if (typeof addFavouriteSong === "function") {
      const id = await addFavouriteSong(songData);
      songData.id = id;
    }

    savedIds.add(song.trackId);
    btn.textContent = "✓";
    btn.classList.add("saved");
    btn.disabled = false;

    addSongCard(songData);
  } catch (err) {
    console.error(err);
    btn.textContent = "+";
    btn.disabled = false;
  }
}

// ── RENDER SONG CARD ──────────────────────────────────────────
function addSongCard(song) {
  const grid = document.getElementById("songsGrid");
  const div = document.createElement("div");
  div.className = "exampleDiv";
  div.setAttribute("data-track-id", song.trackId || "");

  const artwork = getArtwork(song.artwork || "");
  const tid = song.trackId || song.id || Date.now();
  const preview = song.previewUrl;

  const inner = document.createElement("div");
  inner.className = "song-card-inner";

  // Art
  const artImg = document.createElement("img");
  artImg.className = "song-card-art";
  artImg.src = artwork;
  artImg.crossOrigin = "anonymous";
  artImg.referrerPolicy = "no-referrer";
  artImg.alt = "";

  // Name & artist
  const nameEl = document.createElement("div");
  nameEl.className = "song-card-name";
  nameEl.textContent = song.name;

  const artistEl = document.createElement("div");
  artistEl.className = "song-card-artist";
  artistEl.textContent = song.artist;

  // Progress bar
  const progress = document.createElement("div");
  progress.className = "card-progress";
  const fill = document.createElement("div");
  fill.className = "card-progress-fill";
  fill.id = "cpf-" + tid;
  progress.appendChild(fill);

  // Play button with image (toggles play/pause)
  const controls = document.createElement("div");
  controls.className = "song-card-controls";

  const cardBtn = document.createElement("button");
  cardBtn.className = "card-btn";
  cardBtn.id = "cbtn-" + tid;

  const cardImg = document.createElement("img");
  cardImg.src = IMG_PLAY;
  cardImg.alt = "play";
  cardImg.className = "btn-icon";
  cardImg.id = "cimg-" + tid;

  cardBtn.appendChild(cardImg);
  cardBtn.addEventListener("click", () =>
    toggleCard(tid, preview, song.name, song.artist, artwork),
  );
  controls.appendChild(cardBtn);

  // Badge
  const badge = document.createElement("div");
  badge.className = "preview-badge";
  badge.textContent = "30s preview";

  inner.append(artImg, nameEl, artistEl, progress, controls, badge);
  div.appendChild(inner);
  grid.appendChild(div);
}

// ── CARD PLAYER TOGGLE ────────────────────────────────────────
function toggleCard(trackId, previewUrl, name, artist, artwork) {
  // Same card — toggle play/pause
  if (cardCurrentId === trackId) {
    if (audio.paused) audio.play();
    else audio.pause();
    return;
  }

  // Stop old card
  if (cardCurrentId) {
    const oldImg = document.getElementById("cimg-" + cardCurrentId);
    const oldFill = document.getElementById("cpf-" + cardCurrentId);
    if (oldImg) oldImg.src = IMG_PLAY;
    if (oldFill) oldFill.style.width = "0%";
  }

  // Clear any search-result playing state
  currentIdx = -1;
  document
    .querySelectorAll(".result-row")
    .forEach((r) => r.classList.remove("playing"));
  document
    .querySelectorAll("[id^='rpi-']")
    .forEach((img) => (img.src = IMG_PLAY));

  cardCurrentId = trackId;
  audio.src = previewUrl;
  audio.play();

  // Update mini player
  document.getElementById("miniArt").src = getArtwork(artwork);
  document.getElementById("miniTitle").textContent = name;
  document.getElementById("miniArtist").textContent = artist;
  document.getElementById("miniPlayer").classList.add("visible");

  startTicker();
}

// ── LOAD FROM FIREBASE ────────────────────────────────────────
window.addEventListener("load", async () => {
  if (typeof getAllFavourites !== "function") return;
  try {
    const favs = await getAllFavourites();
    favs.forEach((f) => {
      if (f.previewUrl) {
        savedIds.add(f.trackId);
        addSongCard(f);
      }
    });
  } catch (e) {
    console.error(e);
  }
});

// ── POPUP ─────────────────────────────────────────────────────
const shadow = document.getElementById("shadow");
const shadow2 = document.getElementById("shadow2");
const popUpWindow = document.getElementById("popUpWindow");

document.getElementById("addBtn").addEventListener("click", () => {
  shadow.style.display = "block";
  popUpWindow.style.display = "flex";
  document.body.style.overflow = "hidden";
  document.getElementById("searchFld").focus();
});

document.getElementById("backBnt").addEventListener("click", closePopup);
shadow.addEventListener("click", closePopup);

function closePopup() {
  shadow.style.display = "none";
  popUpWindow.style.display = "none";
  document.body.style.overflow = "";
}

// ── UTILS ─────────────────────────────────────────────────────
function fmt(s) {
  s = Math.floor(s || 0);
  const m = Math.floor(s / 60),
    sec = s % 60;
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setResultsHTML(html) {
  document.getElementById("resultsList").innerHTML = html;
}

let nav = document.querySelector(".navbar");
let menuChange = document.getElementById("menuChange");

document.getElementById("menu").addEventListener("click", function () {
  const isOpen = nav.classList.toggle("menu-open");

  if (isOpen) {
    menuChange.src = "sliki/icons/close.png";
    openShadow();
  } else {
    menuChange.src = "sliki/icons/burgerBig.png";
    closeShadow();
  }

  menuChange.classList.add("rotateMenuNow");
  menuChange.addEventListener(
    "animationend",
    () => {
      menuChange.classList.remove("rotateMenuNow");
    },
    { once: true },
  );
});

function openShadow() {
  shadow2.style.display = "block";
  document.body.style.overflow = "hidden";
}
function closeShadow() {
  shadow2.style.display = "none";
  document.body.style.overflow = "";
}

// log out

document.querySelectorAll(".logOut").forEach((btn) => {
  btn.addEventListener("click", () => {
    let loggedIn = sessionStorage.getItem("loggedIn");
    sessionStorage.removeItem("loggedIn");
    window.location.replace("/index.html");
  });
});
