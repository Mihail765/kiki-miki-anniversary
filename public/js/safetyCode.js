// ─── public/js/safetyCode.js ─────────────────────────────────────────────────

(function () {
  // Hide body immediately so no flash of wrong content
  function hideBody() {
    if (document.body) {
      document.body.style.display = "none";
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.style.display = "none";
      });
    }
  }

  hideBody();

  // CRITICAL: Always clear mk_user on page load so stale identity never leaks
  // between sessions or users sharing a device/browser.
  localStorage.removeItem("mk_user");

  auth.onAuthStateChanged(function (user) {
    if (user) {
      // Force-refresh the token so we always get the latest custom claims,
      // not a cached version that might belong to a previous session.
      user
        .getIdTokenResult(true)
        .then(function (idTokenResult) {
          const who = idTokenResult.claims.who;

          if (who) {
            localStorage.setItem("mk_user", who);
          } else {
            // Authenticated but no 'who' claim set — treat as unauthorized
            console.warn("⚠️ No 'who' claim on token. Redirecting to login.");
            localStorage.removeItem("mk_user");
            window.location.replace("index.html");
            return;
          }

          // Show the page only AFTER identity is confirmed
          document.body.style.display = "block";

          // Signal to any listeners (e.g. chat.js) that auth + identity are ready
          window.dispatchEvent(
            new CustomEvent("mk_user_ready", { detail: { who } }),
          );
        })
        .catch(function (err) {
          console.error("Token fetch failed:", err);
          localStorage.removeItem("mk_user");
          window.location.replace("index.html");
        });
    } else {
      localStorage.removeItem("mk_user");
      window.location.replace("index.html");
    }
  });
})();
