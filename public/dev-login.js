(() => {
  const form = document.getElementById("dev-login-form");
  const passwordInput = document.getElementById("dev-password");
  const status = document.getElementById("dev-login-status");
  const submitBtn = document.getElementById("dev-login-btn");

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message || "";
    status.style.color = isError ? "#b42318" : "";
  }

  async function checkExisting() {
    if (!window.RentSoftDev) return;
    const token = window.RentSoftDev.getDevToken();
    if (!token) return;
    try {
      const res = await window.RentSoftDev.devFetch("/api/dev/me");
      if (res.ok) {
        window.RentSoftDev.redirectToReturnTarget();
      }
    } catch {
      // ignore
    }
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = String(passwordInput?.value || "");
    if (!password) {
      setStatus("Password is required.", true);
      return;
    }

    setStatus("Signing in...");
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed.");

      window.RentSoftDev.setDevToken(data.token);
      setStatus("Signed in.");
      window.RentSoftDev.redirectToReturnTarget();
    } catch (err) {
      const message = err?.message ? String(err.message) : "Login failed.";
      setStatus(message, true);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  checkExisting();
})();
