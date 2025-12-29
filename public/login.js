function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const meta = document.getElementById("login-meta");
  const submit = document.getElementById("login-submit");
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo");

  if (!form) return;

  // Restore an existing server session cookie into localStorage (e.g. after a storage clear).
  (async () => {
    try {
      const existing = window.RentSoft?.getSession?.();
      if (existing) return;
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      if (!data?.user?.id || !data?.company?.id) return;
      window.RentSoft?.setSession?.(data);
      window.location.href = returnTo || "work-bench.html";
    } catch {
      // ignore
    }
  })();

  const existing = window.RentSoft?.getSession?.();
  const existingCompanyId = window.RentSoft?.getCompanyId?.();
  if (existing && existingCompanyId && meta) {
    const companyName = existing?.company?.name ? String(existing.company.name) : null;
    meta.textContent = `Already signed in${companyName ? ` • ${companyName}` : ""}.`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (meta) meta.textContent = "";
    if (submit) submit.disabled = true;

    const payload = getFormData(form);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed.");

      window.RentSoft?.setSession?.(data);
      if (returnTo) {
        window.location.href = returnTo;
      } else {
        window.location.href = "work-bench.html";
      }
    } catch (err) {
      if (meta) meta.textContent = err.message || String(err);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
