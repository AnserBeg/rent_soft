function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
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

async function ensureCustomerSession({ name, email, password } = {}) {
  if (!window.CustomerAccount?.setSession) return false;
  const cleanEmail = String(email || "").trim();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return false;

  try {
    const loginRes = await fetch("/api/customers/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: cleanEmail, password: cleanPassword }),
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (loginRes.ok && loginData?.token) {
      window.CustomerAccount?.setSession?.({ token: loginData.token, customer: loginData.customer });
      return true;
    }
  } catch {
    // ignore and try signup
  }

  try {
    const signupRes = await fetch("/api/customers/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(name || "Customer").trim() || "Customer",
        email: cleanEmail,
        password: cleanPassword,
      }),
    });
    const signupData = await signupRes.json().catch(() => ({}));
    if (signupRes.ok && signupData?.token) {
      window.CustomerAccount?.setSession?.({ token: signupData.token, customer: signupData.customer });
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signup-form");
  const meta = document.getElementById("signup-meta");
  const submit = document.getElementById("signup-submit");

  if (!form) return;

  const prefillOwnerName = getQueryParam("prefillOwnerName");
  const prefillOwnerEmail = getQueryParam("prefillOwnerEmail");
  const prefillContactEmail = getQueryParam("prefillContactEmail");
  if (prefillContactEmail && form.contactEmail) form.contactEmail.value = prefillContactEmail;
  if (prefillOwnerName && form.ownerName) form.ownerName.value = prefillOwnerName;
  if (prefillOwnerEmail && form.ownerEmail) form.ownerEmail.value = prefillOwnerEmail;
  if ((prefillOwnerName || prefillOwnerEmail || prefillContactEmail) && meta) {
    meta.textContent = "Prefilled from your customer account. Choose a company name and password.";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (meta) meta.textContent = "";
    if (submit) submit.disabled = true;

    const payload = getFormData(form);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign up failed.");

      const loginRes = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: payload.ownerEmail, password: payload.password }),
      });
      const session = await loginRes.json().catch(() => ({}));
      if (!loginRes.ok) throw new Error(session.error || "Account created, but login failed.");

      window.RentSoft?.setSession?.(session);
      ensureCustomerSession({ name: payload.ownerName, email: payload.ownerEmail, password: payload.password }).catch(() => {});
      window.location.href = "work-bench.html";
    } catch (err) {
      if (meta) meta.textContent = err?.message ? String(err.message) : String(err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
