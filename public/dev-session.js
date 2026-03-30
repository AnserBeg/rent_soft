(() => {
  const DEV_TOKEN_KEY = "rentSoft.devToken";

  function getDevToken() {
    return localStorage.getItem(DEV_TOKEN_KEY) || "";
  }

  function setDevToken(token) {
    const clean = String(token || "").trim();
    if (!clean) return;
    localStorage.setItem(DEV_TOKEN_KEY, clean);
  }

  function clearDevToken() {
    localStorage.removeItem(DEV_TOKEN_KEY);
  }

  async function devFetch(input, init = {}) {
    const token = getDevToken();
    const headers = new Headers(init.headers || {});
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
  }

  function getReturnTo() {
    const params = new URLSearchParams(window.location.search || "");
    const value = String(params.get("returnTo") || "").trim();
    return value || "dev-dashboard.html";
  }

  async function requireDevAuth({ redirectTo = "dev-login.html" } = {}) {
    const token = getDevToken();
    if (!token) {
      if (redirectTo) {
        if (redirectTo.includes("returnTo=")) {
          window.location.href = redirectTo;
        } else {
          const returnTo = encodeURIComponent(window.location.pathname.split("/").pop() || "dev-dashboard.html");
          window.location.href = `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}returnTo=${returnTo}`;
        }
      }
      return false;
    }
    try {
      const res = await devFetch("/api/dev/me");
      if (res.ok) return true;
      if (res.status === 401) {
        clearDevToken();
        if (redirectTo) {
          if (redirectTo.includes("returnTo=")) {
            window.location.href = redirectTo;
          } else {
            const returnTo = encodeURIComponent(window.location.pathname.split("/").pop() || "dev-dashboard.html");
            window.location.href = `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}returnTo=${returnTo}`;
          }
        }
        return false;
      }
      return false;
    } catch {
      return false;
    }
  }

  function redirectToReturnTarget(defaultTarget = "dev-dashboard.html") {
    const params = new URLSearchParams(window.location.search || "");
    const target = String(params.get("returnTo") || "").trim();
    window.location.href = target || defaultTarget;
  }

  window.RentSoftDev = {
    getDevToken,
    setDevToken,
    clearDevToken,
    devFetch,
    requireDevAuth,
    getReturnTo,
    redirectToReturnTarget,
  };
})();
