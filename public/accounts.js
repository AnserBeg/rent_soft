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

function renderHintRow(tbody, text) {
  if (!tbody) return;
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 4;
  cell.className = "hint";
  cell.textContent = text || "";
  row.appendChild(cell);
  tbody.replaceChildren(row);
}

function renderUsers(tbody, users) {
  if (!tbody) return;
  const frag = document.createDocumentFragment();
  users.forEach((u) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.textContent = u?.name ? String(u.name) : "";
    row.appendChild(nameCell);

    const emailCell = document.createElement("td");
    emailCell.textContent = u?.email ? String(u.email) : "";
    row.appendChild(emailCell);

    const roleCell = document.createElement("td");
    roleCell.textContent = u?.role ? String(u.role) : "";
    row.appendChild(roleCell);

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDate(u?.created_at);
    row.appendChild(createdCell);

    frag.appendChild(row);
  });
  tbody.replaceChildren(frag);
}

document.addEventListener("DOMContentLoaded", () => {
  const companyMeta = $("company-meta");
  const form = $("user-form");
  const meta = $("user-meta");
  const tbody = $("users-body");

  const activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setMeta(companyMeta, activeCompanyId ? (companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`) : "Log in to manage accounts.");

  async function loadUsers() {
    if (!activeCompanyId || !tbody) return;
    renderHintRow(tbody, "Loading...");
    const res = await fetch(`/api/users?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load users.");
    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) {
      renderHintRow(tbody, "No users yet.");
      return;
    }
    renderUsers(tbody, users);
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


  if (activeCompanyId) loadUsers().catch((err) => setMeta(meta, err.message));
});
