function setVh() {
  let vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty("--vh", `${vh}px`);
}
setVh();
window.addEventListener("resize", setVh);

function optimizeImage(url) {
  if (!url) return "";
  if (url.includes("res.cloudinary.com")) {
    return url.replace("/upload/", "/upload/f_auto,q_auto,w_800/");
  }
  return url;
}

// ============ DATABASE FUNCTIONS ============

function formatDate(dateStr) {
  if (!dateStr || dateStr === "N/A") return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

// Global variables
let selectedFile = null;
let currentMemoryId = null;
let btnClicked = false;
let shadow = document.getElementById("shadow");
let popUpWindow = document.getElementById("popUpWindow");
let popupOfInp = document.getElementById("popUpWindowInsertionOfMemory");
let addMemoryBtn = document.getElementById("memoryAdd");
let backbtnInpWindow = document.querySelectorAll(".backGo");
let hideHeaderNow = document.getElementById("hideHeader");

function addMemoryToDOM(memory) {
  const wrapper = document.getElementById("timelineWrapper");
  const newSection = document.createElement("div");
  newSection.className = "sectionOfMemory";
  newSection.setAttribute("data-memory-id", memory.id);

  newSection.innerHTML = `
          <div class="leftDiv">
            <figure class="floatMemory">
              <img 
                class="imageTimeline" 
                src="${optimizeImage(memory.imageUrl)}" 
                alt="${memory.title}" 
                loading="lazy" 
                decoding="async"
              />
              <figcaption class="imageTitle">${memory.title}</figcaption>
            </figure>
          </div>
          <div class="rightDiv"></div>
        `;

  wrapper.appendChild(newSection);
}

async function loadMemoriesFromDatabase() {
  try {
    const memories = await getAllMemories();
    memories.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateA - dateB;
    });
    memories.forEach((memory) => {
      addMemoryToDOM(memory);
    });
    setTimeout(drawLines, 100);
  } catch (error) {
    console.error("Error loading memories:", error);
  }
}

// Handle file selection
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".imageInputFile").forEach((inp) => {
    inp.addEventListener("change", function (e) {
      selectedFile = e.target.files[0];
      if (selectedFile) {
        const reader = new FileReader();
        reader.onload = function (ev) {
          document.getElementById("imagePreview").src = ev.target.result;
          document.getElementById("imagePreviewHolder").style.display = "flex";
          document.getElementById("uploadLabelLeft").style.display = "none";
        };
        reader.readAsDataURL(selectedFile);
      }
    });
  });

  document
    .getElementById("removeImageBtn")
    .addEventListener("click", function () {
      selectedFile = null;
      document.getElementById("imagePreview").src = "";
      document.getElementById("imagePreviewHolder").style.display = "none";
      document.getElementById("uploadLabelLeft").style.display = "flex";
      document
        .querySelectorAll(".imageInputFile")
        .forEach((inp) => (inp.value = ""));
    });
});

// Handle submit memory button
document
  .getElementById("submitMemoryBtn")
  .addEventListener("click", async function () {
    const title = document.getElementById("titleInput").value;
    const city = document.getElementById("cityInput").value;
    const place = document.getElementById("placeInput").value;
    const country = document.getElementById("countryInput").value;
    const date = document.getElementById("dateInput").value;
    const description = document.getElementById("textOfDescription").value;

    if (!title || !date) {
      alert("Please fill in at least the title and date!");
      return;
    }

    try {
      this.textContent = "Uploading...";
      this.disabled = true;

      const memoryData = {
        title: title,
        city: city,
        place: place,
        country: country,
        description: description,
        date: date,
        image: selectedFile,
      };

      const memoryId = await addMemory(memoryData);
      console.log("✅ Memory saved with ID:", memoryId);

      const allSections = document.querySelectorAll(".sectionOfMemory");
      allSections.forEach((s) => s.remove());

      const memories = await getAllMemories();
      memories.sort((a, b) => {
        const dateA = a.date ? new Date(a.date) : new Date(0);
        const dateB = b.date ? new Date(b.date) : new Date(0);
        return dateA - dateB;
      });
      memories.forEach((memory) => addMemoryToDOM(memory));

      document.getElementById("titleInput").value = "";
      document.getElementById("cityInput").value = "";
      document.getElementById("placeInput").value = "";
      document.getElementById("countryInput").value = "";
      document.getElementById("dateInput").value = "";
      document.getElementById("textOfDescription").value = "";
      selectedFile = null;

      document.querySelectorAll(".imageInputFile").forEach((inp) => {
        inp.value = "";
      });
      document.getElementById("imagePreview").src = "";
      document.getElementById("imagePreviewHolder").style.display = "none";
      document.getElementById("uploadLabelLeft").style.display = "flex";

      popupOfInp.style.display = "none";
      shadow.style.display = "none";
      document.body.style.overflow = "";
      hideHeaderNow.classList.remove("hideHeader");

      setTimeout(drawLines, 50);
      this.textContent = "ADD OUR MEMORY";
      this.disabled = false;
      alert("Memory added! 🎉");
    } catch (error) {
      console.error("❌ Error:", error);
      alert("Error: " + error.message);
      this.textContent = "ADD OUR MEMORY";
      this.disabled = false;
    }
  });

// ============ DRAW LINES ============

function drawLines() {
  const svg = document.getElementById("connectionSVG");
  const memories = document.querySelectorAll(".floatMemory");
  const wrapper = document.getElementById("timelineWrapper");
  const isNarrow = window.innerWidth <= 1100;

  svg.innerHTML = "";
  svg.setAttribute("height", wrapper.scrollHeight);
  svg.setAttribute("width", wrapper.scrollWidth);

  const wrapperRect = wrapper.getBoundingClientRect();

  const position = Array.from(memories).map((memory) => {
    const rect = memory.getBoundingClientRect();
    const wrapperTop = wrapperRect.top + window.scrollY;
    const wrapperLeft = wrapperRect.left + window.scrollX;
    return {
      top: rect.top + window.scrollY - wrapperTop,
      bottom: rect.bottom + window.scrollY - wrapperTop,
      centerX: rect.left + rect.width / 2 + window.scrollX - wrapperLeft,
      centerY: rect.top + rect.height / 2 + window.scrollY - wrapperTop,
      leftX: rect.left + window.scrollX - wrapperLeft,
      rightX: rect.right + window.scrollX - wrapperLeft,
    };
  });

  function makeLine(x1, y1, x2, y2) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    line.setAttribute("stroke", "white");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  }

  if (position.length > 0) {
    const first = position[0];
    makeLine(first.centerX, -wrapper.offsetTop, first.centerX, first.centerY);
  }

  for (let i = 0; i < position.length - 1; i++) {
    const curr = position[i];
    const next = position[i + 1];

    if (isNarrow) {
      makeLine(curr.centerX, curr.centerY, next.centerX, next.centerY);
    } else {
      const exitRight = i % 2 === 0;
      const exitX = exitRight ? curr.rightX : curr.leftX;

      makeLine(curr.centerX, curr.centerY, exitX, curr.centerY);
      makeLine(exitX, curr.centerY, next.centerX, curr.centerY);
      makeLine(next.centerX, curr.centerY, next.centerX, next.centerY);
    }
  }

  if (position.length > 0) {
    const last = position[position.length - 1];
    const bottomY = wrapper.scrollHeight;

    if (isNarrow) {
      makeLine(last.centerX, last.centerY, last.centerX, bottomY);
    } else {
      const exitRight = (position.length - 1) % 2 === 0;
      const exitX = exitRight ? last.rightX : last.leftX;
      const alignX =
        position.length >= 2
          ? position[position.length - 2].centerX
          : last.centerX;

      makeLine(last.centerX, last.centerY, exitX, last.centerY);
      makeLine(exitX, last.centerY, alignX, last.centerY);
      makeLine(alignX, last.centerY, alignX, bottomY);
    }
  }
}

// ============ EVENT LISTENERS ============

addMemoryBtn.addEventListener("click", function () {
  popupOfInp.style.display = "block";
  shadow.style.display = "block";
  document.body.style.overflow = "hidden";
  hideHeaderNow.classList.add("hideHeader");
});

backbtnInpWindow.forEach((backClick) => {
  backClick.addEventListener("click", function () {
    popupOfInp.style.display = "none";
    shadow.style.display = "none";
    document.body.style.overflow = "visible";
    hideHeaderNow.classList.remove("hideHeader");
  });
});

document.getElementById("backBnt").addEventListener("click", function () {
  if (isEditing) {
    saveEdits().then(() => {
      shadow.style.display = "none";
      popUpWindow.style.display = "none";
      document.body.style.overflow = "visible";
      btnClicked = false;
      hideHeaderNow.classList.remove("hideHeader");
    });
    return;
  }
  shadow.style.display = "none";
  popUpWindow.style.display = "none";
  document.body.style.overflow = "visible";
  btnClicked = false;
  hideHeaderNow.classList.remove("hideHeader");
});

document
  .getElementById("timelineWrapper")
  .addEventListener("click", async function (e) {
    const memory = e.target.closest(".floatMemory");

    if (memory && !btnClicked) {
      const section = memory.closest(".sectionOfMemory");
      const memoryId = section ? section.getAttribute("data-memory-id") : null;

      if (memoryId) {
        try {
          const doc = await db.collection("memories").doc(memoryId).get();
          if (doc.exists) {
            const data = doc.data();
            currentMemoryId = memoryId;

            document.querySelectorAll(".titleOfPopUpClass").forEach((pop) => {
              pop.textContent = data.title;
            });
            document.getElementById("popupCity").textContent =
              data.city || "N/A";
            document.getElementById("popupPlace").textContent =
              data.place || "N/A";
            document.getElementById("popupCountry").textContent =
              data.country || "N/A";
            document.getElementById("popupDate").textContent = formatDate(
              data.date,
            );
            document.getElementById("popupDescription").textContent =
              data.description || "No description";
            document.querySelector(".slika").src = optimizeImage(data.imageUrl);

            document.body.style.overflow = "hidden";
            shadow.style.display = "block";
            popUpWindow.style.display = "flex";
            hideHeaderNow.classList.add("hideHeader");
            btnClicked = true;
          }
        } catch (error) {
          console.error("Error loading memory:", error);
        }
      } else {
        let imageTimeline = memory
          .querySelector(".imageTimeline")
          .getAttribute("src");
        document.querySelector(".slika").setAttribute("src", imageTimeline);
        document.body.style.overflow = "hidden";
        shadow.style.display = "block";
        popUpWindow.style.display = "flex";
        btnClicked = true;
      }
    }
  });

document.getElementById("dateInput").addEventListener("click", function () {
  this.showPicker();
});

// ============ PAGE LOAD ============

let loader = document.getElementById("loader");
if (document.readyState === "loading") {
  document.body.style.overflow = "hidden";
}
window.addEventListener("load", async () => {
  await loadMemoriesFromDatabase();
  drawLines();
  loader.style.display = "none";
  document.body.style.overflow = "";
});

let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(drawLines, 30);
});

window.addEventListener("scroll", () => {
  drawLines();
});

let toggelMenu = document.getElementById("colectionOfDrop");
let header = document.querySelector(".navbar");
let menuChange = document.getElementById("menuChange");
let shadow2 = document.getElementById("shadow2");

document.getElementById("menu").addEventListener("click", function () {
  const isOpen = header.classList.toggle("menu-open");

  if (isOpen) {
    menuChange.setAttribute("src", "sliki/icons/close.png");
    setTimeout(() => {
      toggelMenu.style.display = "block";
    }, 150);
    openShadow();
  } else {
    menuChange.setAttribute("src", "sliki/icons/burgerBig.png");
    toggelMenu.style.display = "none";
    closeShadow();
  }

  menuChange.classList.add("rotateMenuNow");
  menuChange.addEventListener("animationend", () => {
    menuChange.classList.remove("rotateMenuNow");
  });
});

function openShadow() {
  shadow2.style.display = "block";
  document.body.style.overflow = "hidden";
}
function closeShadow() {
  shadow2.style.display = "none";
  document.body.style.overflow = "";
}

document.addEventListener(
  "load",
  function (e) {
    if (e.target.classList.contains("imageTimeline")) {
      e.target.classList.add("loaded");
    }
  },
  true,
);

document.querySelectorAll(".logOut").forEach((btn) => {
  btn.addEventListener("click", () => {
    auth.signOut().then(() => window.location.replace("index.html"));
  });
});

// ============ EDIT BUTTON FUNCTIONALITY ============

let isEditing = false;
let editedFields = {};
let originalMemoryData = {};

document.getElementById("editBnt").addEventListener("click", async function () {
  if (!isEditing) {
    await enterEditMode();
  } else {
    await saveEdits();
  }
});

async function enterEditMode() {
  if (!currentMemoryId) return;

  try {
    const doc = await db.collection("memories").doc(currentMemoryId).get();
    if (!doc.exists) return;
    originalMemoryData = doc.data();
  } catch (err) {
    console.error("Could not load memory for editing:", err);
    return;
  }

  isEditing = true;
  editedFields = {};

  document.getElementById("editBnt").textContent = "Save";
  document.getElementById("editBnt").style.backgroundColor = "#28a745";

  makeFieldEditable("popupCity", "text");
  makeFieldEditable("popupCountry", "text");
  makeFieldEditable("popupPlace", "text");
  makeFieldEditable("popupDate", "date");
  makeFieldEditable("popupDescription", "textarea");

  document.querySelectorAll(".titleOfPopUpClass").forEach((el) => {
    if (el.offsetParent === null) return;
    el.classList.add("editableField");
    el.addEventListener("click", onTitleClick, { once: true });
  });
}

// ── FIX: delegate to attachFieldListener so { once: true } is always used ──
function makeFieldEditable(id, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("editableField");
  attachFieldListener(el, id, type);
}

// ── FIX: single, reusable function that always attaches with { once: true } ──
function attachFieldListener(el, id, type) {
  el.addEventListener(
    "click",
    function onFieldClick(e) {
      e.stopPropagation();
      const current = document.getElementById(id);
      if (!current || current.dataset.editing === "true") return;
      current.dataset.editing = "true";
      convertToInput(current, id, type);
    },
    { once: true },
  );
}

function onTitleClick(e) {
  const el = e.currentTarget;
  if (el.dataset.editing === "true") return;
  convertTitleToInput(el);
}

function convertToInput(el, id, type) {
  const currentValue = el.textContent;
  el.dataset.editing = "true";

  let input;
  if (type === "textarea") {
    input = document.createElement("textarea");
    input.className = "editInlineInput editInlineTextarea";
    input.value = currentValue === "No description" ? "" : currentValue;
  } else {
    input = document.createElement("input");
    input.type = type;
    input.className = "editInlineInput";
    if (type === "date" && currentValue && currentValue !== "N/A") {
      const parts = currentValue.trim().split(".");
      if (parts.length === 3) {
        input.value = `${parts[2]}-${parts[1]}-${parts[0]}`;
      } else {
        const d = new Date(currentValue);
        input.value = !isNaN(d) ? d.toISOString().split("T")[0] : "";
      }
    } else {
      input.value = currentValue === "N/A" ? "" : currentValue;
    }
  }

  input.id = id;
  input.dataset.fieldId = id;
  input.dataset.fieldType = type;

  input.addEventListener("blur", function () {
    editedFields[id] = input.value.trim();
    restoreDisplaySingle(input, id, type);
  });

  el.replaceWith(input);
  input.focus();
}

function convertTitleToInput(el) {
  const currentValue = el.textContent;
  el.dataset.editing = "true";

  const input = document.createElement("input");
  input.type = "text";
  input.value = currentValue;
  input.className = "editInlineInput titleEditInput";
  input.dataset.originalId = el.id || "";
  input.dataset.originalClass = el.className;

  input.addEventListener("blur", function () {
    editedFields["title"] = input.value.trim();

    const h1 = document.createElement("h1");
    h1.className = input.dataset.originalClass;
    if (input.dataset.originalId) h1.id = input.dataset.originalId;
    h1.textContent = input.value.trim() || currentValue;
    h1.classList.add("editableField");
    h1.addEventListener("click", onTitleClick, { once: true });
    input.replaceWith(h1);
  });

  el.replaceWith(input);
  input.focus();
}

// ── FIX: use attachFieldListener instead of manually re-adding a listener ──
function restoreDisplaySingle(input, id, type) {
  const isDescription = id === "popupDescription";
  const isDate = id === "popupDate";
  const value = isDate
    ? formatDate(input.value.trim()) || "N/A"
    : input.value.trim() || (isDescription ? "No description" : "N/A");

  const span = document.createElement("span");
  span.id = id;
  span.className =
    "memoryText" + (isDescription ? " descriptionTextMemory" : "");
  span.textContent = value;
  span.classList.add("editableField");
  span.dataset.editing = "false";

  input.replaceWith(span);
  // Re-attach with { once: true } — exactly one listener, no stacking
  attachFieldListener(span, id, type);
}

// ── FIX: map element IDs → Firestore field names before saving ──
async function saveEdits() {
  if (!currentMemoryId) return;

  const activeEl = document.activeElement;
  if (activeEl && activeEl.classList.contains("editInlineInput")) {
    activeEl.blur();
    await new Promise((r) => setTimeout(r, 50));
  }

  try {
    document.getElementById("editBnt").textContent = "Saving…";
    document.getElementById("editBnt").disabled = true;

    // Map popup element IDs → actual Firestore field names
    const fieldMap = {
      popupCity: "city",
      popupCountry: "country",
      popupPlace: "place",
      popupDate: "date",
      popupDescription: "description",
      title: "title",
    };

    const mappedEdits = {};
    for (const [key, val] of Object.entries(editedFields)) {
      const firestoreKey = fieldMap[key] || key;
      mappedEdits[firestoreKey] = val;
    }

    const updatedData = {
      ...originalMemoryData,
      ...mappedEdits,
    };

    await db.collection("memories").doc(currentMemoryId).set(updatedData);

    if (mappedEdits.title) {
      const card = document.querySelector(
        `[data-memory-id="${currentMemoryId}"] .imageTitle`,
      );
      if (card) card.textContent = mappedEdits.title;
    }

    exitEditMode();
    console.log("✅ Memory updated for ID:", currentMemoryId, updatedData);
  } catch (err) {
    console.error("❌ Error updating memory:", err);
    alert("Could not save changes: " + err.message);
    document.getElementById("editBnt").textContent = "Save";
    document.getElementById("editBnt").disabled = false;
  }
}

function exitEditMode() {
  isEditing = false;
  editedFields = {};
  originalMemoryData = {};

  document.querySelectorAll(".editableField").forEach((el) => {
    el.classList.remove("editableField");
  });

  document.getElementById("editBnt").textContent = "Edit";
  document.getElementById("editBnt").style.backgroundColor = "";
  document.getElementById("editBnt").disabled = false;
}
