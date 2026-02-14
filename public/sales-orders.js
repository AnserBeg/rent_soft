const companyMeta = document.getElementById("company-meta");
const newSalesOrderBtn = document.getElementById("new-sales-order");
const searchInput = document.getElementById("search");
const salesOrdersTable = document.getElementById("sales-orders-table");
const statusToggle = document.getElementById("status-toggle");
const statusButtons = statusToggle ? Array.from(statusToggle.querySelectorAll("button[data-status]")) : [];

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let salesOrdersCache = [];
let searchTerm = "";
let statusFilter = "open";

const LIST_STATE_KEY = "rentsoft.sales-orders.listState";
const STATUS_OPTIONS = ["open", "closed"];

function loadListState() {
  const raw = localStorage.getItem(LIST_STATE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
    if (typeof saved.statusFilter === "string" && STATUS_OPTIONS.includes(saved.statusFilter)) {
      statusFilter = saved.statusFilter;
    }
  } catch { }
}

function persistListState() {
  localStorage.setItem(
    LIST_STATE_KEY,
    JSON.stringify({
      searchTerm: String(searchTerm || ""),
      statusFilter,
    })
  );
}

function fmtMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `$${num.toFixed(2)}`;
}

function formatUnitLabel(row) {
  const base = row.model_name || row.type_name || row.equipment_type || "Unit";
  const serial = row.serial_number ? String(row.serial_number) : "";
  return serial ? `${base} (${serial})` : base;
}

function renderSalesOrders(rows) {
  if (!salesOrdersTable) return;
  salesOrdersTable.innerHTML = `
    <div class="table-row table-header">
      <span>Sales order</span>
      <span>Unit</span>
      <span>Status</span>
      <span>Price</span>
      <span>Location</span>
      <span>Updated</span>
    </div>`;

  rows.forEach((order) => {
    const updatedAt = order?.updated_at || order?.updatedAt;
    const updatedDate = updatedAt ? new Date(updatedAt) : null;
    const updatedLabel = updatedDate && !Number.isNaN(updatedDate.getTime())
      ? updatedDate.toLocaleDateString()
      : "--";
    const soNumber = order.so_number || order.soNumber || `#${order.id}`;
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = order.id;
    div.innerHTML = `
      <span>${soNumber}</span>
      <span>${formatUnitLabel(order)}</span>
      <span>${order.status || "open"}</span>
      <span>${fmtMoney(order.sale_price)}</span>
      <span>${order.location_name || "--"}</span>
      <span>${updatedLabel}</span>
    `;
    salesOrdersTable.appendChild(div);
  });
}

function normalizeStatus(order) {
  return String(order?.status || "open").toLowerCase();
}

function setStatusFilter(nextStatus) {
  if (!STATUS_OPTIONS.includes(nextStatus)) return;
  statusFilter = nextStatus;
  statusButtons.forEach((button) => {
    const isActive = button.dataset.status === statusFilter;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function applyFilters() {
  let rows = [...salesOrdersCache];

  if (statusFilter) {
    rows = rows.filter((order) => normalizeStatus(order) === statusFilter);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((order) => {
      return [
        order.id,
        order.so_number,
        order.soNumber,
        order.model_name,
        order.serial_number,
        order.type_name,
        order.equipment_type,
        order.status,
        order.description,
        order.location_name,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }

  rows.sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.updatedAt || a.created_at || a.createdAt || "");
    const bTime = Date.parse(b.updated_at || b.updatedAt || b.created_at || b.createdAt || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return String(a.so_number || a.soNumber || "").localeCompare(String(b.so_number || b.soNumber || ""));
  });

  return rows;
}

async function loadSalesOrders() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/sales-orders?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch sales orders");
    const data = await res.json();
    salesOrdersCache = data.salesOrders || [];
    renderSalesOrders(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

newSalesOrderBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "sales-order-form.html";
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderSalesOrders(applyFilters());
  persistListState();
});

statusToggle?.addEventListener("click", (e) => {
  const button = e.target.closest?.("button[data-status]");
  const nextStatus = button?.dataset?.status;
  if (!nextStatus) return;
  setStatusFilter(nextStatus);
  renderSalesOrders(applyFilters());
  persistListState();
});

salesOrdersTable?.addEventListener("click", (e) => {
  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `sales-order-form.html?id=${id}`;
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;

  loadListState();
  if (statusButtons.length) {
    setStatusFilter(statusFilter);
  }
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadSalesOrders();
} else {
  companyMeta.textContent = "Log in to view sales orders.";
}
