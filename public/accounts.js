function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function formatDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

document.addEventListener("DOMContentLoaded", () => {
  const companyMeta = $("company-meta");
  const form = $("user-form");
  const meta = $("user-meta");
  const refresh = $("refresh-users");
  const tbody = $("users-body");

  const activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setMeta(companyMeta, activeCompanyId ? (companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`) : "Log in to manage accounts.");

  async function loadUsers() {
    if (!activeCompanyId || !tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="hint">Loading…</td></tr>`;
    const res = await fetch(`/api/users?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load users.");
    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="hint">No users yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = users
      .map(
        (u) => `
        <tr>
          <td>${String(u.name || "")}</td>
          <td>${String(u.email || "")}</td>
          <td>${String(u.role || "")}</td>
          <td>${formatDate(u.created_at)}</td>
        </tr>
      `
      )
      .join("");
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeCompanyId) return;
    setMeta(meta, "");
    try {
      const payload = getFormData(form);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, companyId: activeCompanyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to create user.");
      form.reset();
      setMeta(meta, "User created.");
      await loadUsers();
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : String(err));
    }
  });

  refresh?.addEventListener("click", () => loadUsers().catch((err) => setMeta(meta, err.message)));

  if (activeCompanyId) loadUsers().catch((err) => setMeta(meta, err.message));
});

