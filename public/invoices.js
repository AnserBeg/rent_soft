const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const qboStatus = document.getElementById("qbo-status");
const qboHint = document.getElementById("qbo-hint");
const qboConnectBtn = document.getElementById("qbo-connect");
const qboDisconnectBtn = document.getElementById("qbo-disconnect");
const qboSyncBtn = document.getElementById("qbo-sync");
const refreshBtn = document.getElementById("refresh");
const assignedFilter = document.getElementById("assigned-filter");
const searchInput = document.getElementById("search");
const invoicesTable = document.getElementById("invoices-table");
const invoicesHint = document.getElementById("invoices-hint");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let lastLoaded = [];

function setCompanyMeta(message) {
  if (!companyMeta) return;
  companyMeta.textContent = String(message || "");
}

function setQboHint(message) {
  if (!qboHint) return;
  qboHint.textContent = String(message || "");
}

function fmtMoney(v) {
  if (v === null || v === undefined || v === "") return "--";
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function fmtDate(value) {
  if (!value) return "--";
  const raw = String(value).trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toISOString().slice(0, 10);
}

function docStatus(doc) {
  if (doc.is_deleted) return "deleted";
  if (doc.is_voided) return "voided";
  return doc.status || "draft";
}

function renderTable(rows) {
  if (!invoicesTable) return;
  invoicesTable.innerHTML = "";

  const header = document.createElement("div");
  header.className = "table-row table-header";
  header.innerHTML = `
    <span>Type</span>
    <span>Doc #</span>
    <span>RO</span>
    <span>Status</span>
    <span>Date</span>
    <span>Total</span>
    <span>Balance</span>
  `;
  invoicesTable.appendChild(header);

  if (!rows.length) {
    if (invoicesHint) invoicesHint.textContent = "No invoices found for this company.";
    return;
  }
  if (invoicesHint) invoicesHint.textContent = "";

  rows.forEach((doc) => {
    const row = document.createElement("div");
    row.className = "table-row";
    const typeLabel = doc.qbo_entity_type === "CreditMemo" ? "Credit memo" : "Invoice";
    const roLabel = doc.ro_number || (doc.rental_order_id ? `RO #${doc.rental_order_id}` : "Unassigned");
    const roLink =
      doc.rental_order_id
        ? `<a class="ghost small" href="rental-order-form.html?id=${encodeURIComponent(String(doc.rental_order_id))}">${roLabel}</a>`
        : `<span class="hint">${roLabel}</span>`;
    row.innerHTML = `
      <span>${typeLabel}</span>
      <span>${doc.doc_number || doc.qbo_entity_id || "--"}</span>
      <span>${roLink}</span>
      <span>${docStatus(doc)}</span>
      <span>${fmtDate(doc.txn_date)}</span>
      <span>${fmtMoney(doc.total_amount)}</span>
      <span>${fmtMoney(doc.balance)}</span>
    `;
    invoicesTable.appendChild(row);
  });
}

async function loadQboStatus() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/qbo/status?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load QBO status");
  if (qboStatus) {
    qboStatus.textContent = data.connected
      ? `Connected to QBO (realm ${data.realmId || "unknown"}).`
      : "Not connected to QuickBooks Online.";
  }
  if (qboDisconnectBtn) qboDisconnectBtn.disabled = !data.connected;
  return data;
}

async function loadInvoices() {
  if (!activeCompanyId) return;
  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    limit: "200",
  });
  if (assignedFilter?.value) qs.set("assigned", assignedFilter.value);
  const search = String(searchInput?.value || "").trim();
  if (search) qs.set("search", search);

  if (invoicesHint) invoicesHint.textContent = "Loading invoices...";
  const res = await fetch(`/api/qbo/documents?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load invoices");
  lastLoaded = Array.isArray(data.documents) ? data.documents : [];
  renderTable(lastLoaded);
}

async function syncQbo() {
  if (!activeCompanyId) return;
  setQboHint("Syncing QBO...");
  try {
    const res = await fetch("/api/qbo/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, mode: "query" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to sync QBO");
    await loadInvoices();
    setQboHint("QBO sync complete.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to sync QBO.");
  }
}

qboConnectBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const redirect = "/invoices.html?qbo=connected";
  window.location.href = `/api/qbo/authorize?companyId=${encodeURIComponent(String(activeCompanyId))}&redirect=${encodeURIComponent(redirect)}`;
});

qboDisconnectBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setQboHint("Disconnecting...");
  qboDisconnectBtn.disabled = true;
  try {
    const res = await fetch("/api/qbo/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to disconnect QBO");
    }
    await loadQboStatus();
    setQboHint("QBO disconnected.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to disconnect QBO.");
    qboDisconnectBtn.disabled = false;
  }
});

qboSyncBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  syncQbo().catch(() => null);
});

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadInvoices().catch((err) => {
    if (invoicesHint) invoicesHint.textContent = err?.message ? String(err.message) : "Unable to refresh invoices.";
  });
});

assignedFilter?.addEventListener("change", () => {
  loadInvoices().catch(() => null);
});

let searchTimer = null;
searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    loadInvoices().catch(() => null);
  }, 250);
});

if (activeCompanyId) {
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setCompanyMeta(companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`);
  if (new URLSearchParams(window.location.search).get("qbo") === "connected") {
    setQboHint("QuickBooks connected.");
  }
  loadQboStatus().catch((err) => setQboHint(err.message));
  loadInvoices().catch((err) => {
    if (invoicesHint) invoicesHint.textContent = err?.message ? String(err.message) : "Unable to load invoices.";
  });
} else {
  setCompanyMeta("Log in to view invoices.");
}
