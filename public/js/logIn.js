// Already signed in → skip straight to app
auth.onAuthStateChanged(function (user) {
  if (user) {
    window.location.replace("landingPage.html");
  }
});

const fnVerify = firebase
  .app()
  .functions("europe-west1")
  .httpsCallable("verifySecretDate");

// ── Number-only inputs ────────────────────────────────────────
function numberedInput() {
  this.value = this.value.replace(/[^0-9]/g, "").slice(0, this.maxLength);
}
document.getElementById("day").addEventListener("input", numberedInput);
document.getElementById("month").addEventListener("input", numberedInput);
document.getElementById("year").addEventListener("input", numberedInput);

document.getElementById("time").addEventListener("input", function () {
  let v = this.value.replace(/[^0-9]/g, "");
  if (v.length > 2) v = v.slice(0, 2) + ":" + v.slice(2, 4);
  this.value = v.slice(0, 5);
});

// ── Auto-advance focus ────────────────────────────────────────
document.getElementById("day").addEventListener("input", function () {
  if (this.value.length === 2) document.getElementById("month").focus();
});
document.getElementById("month").addEventListener("input", function () {
  if (this.value.length === 1 && this.value !== "0") {
    document.getElementById("year").focus();
  } else if (this.value.length === 2) {
    document.getElementById("year").focus();
  }
});
document.getElementById("year").addEventListener("input", function () {
  if (this.value.length === 4) document.getElementById("time").focus();
});

// ── Step 1: verify date ───────────────────────────────────────
document.getElementById("logInBtn").addEventListener("click", Najava);
document.addEventListener("keydown", function (e) {
  if (e.key === "Enter") Najava();
});

async function Najava() {
  const btn = document.getElementById("logInBtn");
  btn.disabled = true;
  // btn.textContent = "Checking…";

  const day = document.getElementById("day").value;
  const month = document.getElementById("month").value;
  const year = document.getElementById("year").value;
  const time = document.getElementById("time").value;

  try {
    // Step 1 — just check the date (no who yet)
    const result = await fnVerify({ day, month, year, time });

    if (result.data.valid) {
      document.getElementById("logInLowerPart").style.display = "none";
      document.querySelector("#logInUpperPart h3").textContent =
        "Almost there… just one more step 💕";
      document.querySelector("#logInUpperPart h1").textContent = "Who are you?";
      document.getElementById("step-who").classList.add("visible");
      document.getElementById("logInWIndow").classList.add("step2");
      btn.disabled = false;
      btn.textContent = "Enter";
    } else {
      alert("You have entered the wrong date!!");
      btn.disabled = false;
      btn.textContent = "Enter";
    }
  } catch (err) {
    console.error("Function error:", err);
    alert("You have entered the wrong date!!");
    btn.disabled = false;
    btn.textContent = "Enter";
  }
}

// ── Step 2: pick who → get real token → sign in ──────────────
async function loginAs(who) {
  try {
    const day = document.getElementById("day").value;
    const month = document.getElementById("month").value;
    const year = document.getElementById("year").value;
    const time = document.getElementById("time").value;

    // Get custom token with verified:true and who claim
    const result = await fnVerify({ day, month, year, time, who });
    const customToken = result.data.token;

    // Sign in — Firebase Auth takes over, no sessionStorage needed
    await auth.signInWithCustomToken(customToken);

    // Store who for UI use only (not for security)
    localStorage.setItem("mk_user", who);

    window.location.replace("landingPage.html");
  } catch (err) {
    console.error("Login error:", err);
    alert("Something went wrong. Please try again.");
  }
}
