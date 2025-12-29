function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search || "");
  const value = params.get(name);
  return value ? String(value) : null;
}

function normalizeCompanyId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

document.addEventListener("DOMContentLoaded", () => {
  const form = $("customer-login-form");
  const meta = $("customer-login-meta");
  const submit = $("customer-login-submit");
  const signupLink = $("signup-link");

  const returnTo = getQueryParam("returnTo");
  const companyId = normalizeCompanyId(getQueryParam("companyId"));
  if (signupLink) {
    const qs = new URLSearchParams();
    if (returnTo) qs.set("returnTo", returnTo);
    if (companyId) qs.set("companyId", String(companyId));
    signupLink.href = `customer-signup.html${qs.toString() ? `?${qs.toString()}` : ""}`;
    signupLink.style.display = "";
  }
  setMeta(meta, "");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMeta(meta, "");
    if (submit) submit.disabled = true;
    try {
      const payload = getFormData(form);
      const body = { email: payload.email, password: payload.password, companyId: companyId || undefined };

      const res = await fetch("/api/customers/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed.");
      window.CustomerAccount?.setSession?.({ token: data.token, customer: data.customer });
      window.location.href = returnTo || "index.html";
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : String(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
