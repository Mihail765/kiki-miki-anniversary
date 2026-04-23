// ─── public/js/safetyCode.js ─────────────────────────────────────────────────

(function () {
  // Wait for body to exist before touching it
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

  auth.onAuthStateChanged(function (user) {
    if (user) {
      document.body.style.display = "block";

      // Sync who to localStorage for UI use
      user.getIdTokenResult().then(function (idTokenResult) {
        if (idTokenResult.claims.who) {
          localStorage.setItem("mk_user", idTokenResult.claims.who);
        }
      });
    } else {
      window.location.replace("index.html");
    }
  });
})();