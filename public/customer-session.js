(() => {
  const TOKEN_KEY = "rentSoft.customerAccountToken";
  const CUSTOMER_KEY = "rentSoft.customerAccount";

  function safeJsonParse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getCustomer() {
    const raw = localStorage.getItem(CUSTOMER_KEY);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  }

  function setSession({ token, customer } = {}) {
    if (!token) throw new Error("Missing token.");
    localStorage.setItem(TOKEN_KEY, String(token));
    if (customer) localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CUSTOMER_KEY);
  }

  window.CustomerAccount = {
    getToken,
    getCustomer,
    setSession,
    clearSession,
  };
})();

