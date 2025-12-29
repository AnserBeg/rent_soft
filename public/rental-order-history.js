const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");
const fromParam = params.get("from");

const pageMeta = document.getElementById("page-meta");
const tableEl = document.getElementById("rental-order-history-table");
const searchInput = document.getElementById("search");
const backToOrder = document.getElementById("back-to-order");

const auditModal = document.getElementById("audit-modal");
const closeAuditModalBtn = document.getElementById("close-audit-modal");
const auditJsonEl = document.getElementById("audit-json");
const auditModalMeta = document.getElementById("audit-modal-meta");

let rowsCache = [];
let searchTerm = "";

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDateTime(v) {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function actorLabel(r) {
  const name = r.actor_name ? String(r.actor_name) : "Unknown";
  const email = r.actor_email ? String(r.actor_email) : "";
  return email ? `${name} <${email}>` : name;
}

function render(rows) {
  tableEl.innerHTML = `
    <div class="table-row table-header">
      <span>When</span>
      <span>Who</span>
      <span>Action</span>
      <span>Summary</span>
      <span></span>
    </div>`;

  rows.forEach((r) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = r.id;
    div.innerHTML = `
      <span>${escapeHtml(fmtDateTime(r.created_at))}</span>
      <span>${escapeHtml(actorLabel(r))}</span>
      <span>${escapeHtml(r.action || "--")}</span>
      <span>${escapeHtml(r.summary || "--")}</span>
      <span style="justify-self:end;">
        <button class="ghost small" type="button" data-view>View</button>
      </span>
    `;
    tableEl.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...rowsCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.actor_name, r.actor_email, r.action, r.summary, JSON.stringify(r.changes || {})]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  return rows;
}

function openAuditModal({ meta, json }) {
  if (auditModalMeta) auditModalMeta.textContent = meta || "";
  if (auditJsonEl) auditJsonEl.textContent = json || "";
  auditModal?.classList.add("show");
}

function closeAuditModal() {
  auditModal?.classList.remove("show");
}

async function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (pageMeta) pageMeta.textContent = "Log in to view history.";
    return;
  }
  if (!orderId) {
    if (pageMeta) pageMeta.textContent = "Missing order id.";
    return;
  }

  const from = fromParam ? `&from=${encodeURIComponent(fromParam)}` : "";
  if (backToOrder) backToOrder.href = `rental-order-form.html?id=${encodeURIComponent(orderId)}&companyId=${encodeURIComponent(companyId)}${from}`;

  const res = await fetch(`/api/rental-orders/${encodeURIComponent(orderId)}/history?companyId=${encodeURIComponent(companyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load history");

  rowsCache = Array.isArray(data.rows) ? data.rows : [];
  if (pageMeta) pageMeta.textContent = `${rowsCache.length} entries`;
  render(applyFilters());

  searchInput?.addEventListener("input", () => {
    searchTerm = String(searchInput.value || "");
    render(applyFilters());
  });

  tableEl?.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-view]");
    if (!btn) return;
    const row = e.target.closest(".table-row");
    const id = row?.dataset?.id;
    const r = rowsCache.find((x) => String(x.id) === String(id));
    if (!r) return;
    openAuditModal({
      meta: `${fmtDateTime(r.created_at)} · ${actorLabel(r)} · ${r.action || ""}`,
      json: JSON.stringify(r.changes || {}, null, 2),
    });
  });
}

closeAuditModalBtn?.addEventListener("click", closeAuditModal);
auditModal?.addEventListener("click", (e) => {
  if (e.target === auditModal) closeAuditModal();
});

init().catch((err) => {
  if (pageMeta) pageMeta.textContent = err.message || String(err);
});
