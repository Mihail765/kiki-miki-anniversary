document.addEventListener("DOMContentLoaded", () => {
  const loggedIn = sessionStorage.getItem("loggedIn");
  const mkUser = localStorage.getItem("mk_user");

  if (loggedIn === "true") {
    // Normal case — sessionStorage is intact
    document.body.style.display = "block";
    return;
  }

  if (mkUser) {
    // Mobile fallback — sessionStorage was wiped but localStorage survived
    sessionStorage.setItem("loggedIn", "true");
    sessionStorage.setItem("user", mkUser);
    document.body.style.display = "block";
    return;
  }

  // Not logged in at all
  window.location.replace("index.html");
});
