const companyMeta = document.getElementById("company-meta");
const refreshBtn = document.getElementById("refresh");
const newPoBtn = document.getElementById("new-po");
const searchInput = document.getElementById("search");
const purchaseOrdersTable = document.getElementById("purchase-orders-table");
const filterOpen = document.getElementById("filter-open");
const filterClosed = document.getElementById("filter-closed");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let purchaseOrdersCache = [];
let sortField = "id";
let sortDir = "desc";
let searchTerm = "";

function fmtMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "--";
  return `$${num.toFixed(2)}`;
}

function renderPurchaseOrders(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  purchaseOrdersTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "id" ? "active" : ""}" data-sort="id">PO ${indicator("id")}</span>
      <span class="sort ${sortField === "vendor_name" ? "active" : ""}" data-sort="vendor_name">Vendor ${indicator("vendor_name")}</span>
      <span class="sort ${sortField === "type_name" ? "active" : ""}" data-sort="type_name">Type ${indicator("type_name")}</span>
      <span class="sort ${sortField === "expected_possession_date" ? "active" : ""}" data-sort="expected_possession_date">Expected ${indicator("expected_possession_date")}</span>
      <span class="sort ${sortField === "status" ? "active" : ""}" data-sort="status">Status ${indicator("status")}</span>
      <span class="sort ${sortField === "model_name" ? "active" : ""}" data-sort="model_name">Model ${indicator("model_name")}</span>
      <span class="sort ${sortField === "serial_number" ? "active" : ""}" data-sort="serial_number">Serial ${indicator("serial_number")}</span>
      <span class="sort ${sortField === "location_name" ? "active" : ""}" data-sort="location_name">Location ${indicator("location_name")}</span>
      <span class="sort ${sortField === "purchase_price" ? "active" : ""}" data-sort="purchase_price">Price ${indicator("purchase_price")}</span>
    </div>`;

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    const poNumber = row.po_number || row.poNumber || null;
    div.innerHTML = `
      <span>${poNumber || `#${row.id}`}</span>
      <span>${row.vendor_name || "--"}</span>
      <span>${row.type_name || "--"}</span>
      <span>${row.expected_possession_date || "--"}</span>
      <span>${row.status || "--"}</span>
      <span>${row.model_name || "--"}</span>
      <span>${row.serial_number || "--"}</span>
      <span>${row.location_name || "--"}</span>
      <span>${fmtMoney(row.purchase_price)}</span>
    `;
    purchaseOrdersTable.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...purchaseOrdersCache];

  const allowOpen = filterOpen?.checked !== false;
  const allowClosed = filterClosed?.checked !== false;
  rows = rows.filter((row) => {
    const status = String(row.status || "open").toLowerCase();
    if (status === "closed") return allowClosed;
    return allowOpen;
  });

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => {
      return [
        r.id,
        r.po_number,
        r.poNumber,
        r.vendor_name,
        r.type_name,
        r.model_name,
        r.serial_number,
        r.location_name,
        r.status,
        r.expected_possession_date,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const sortKey = (row) => {
    switch (sortField) {
      case "id":
        return Number(row.id || 0);
      case "expected_possession_date": {
        const t = Date.parse(row.expected_possession_date || "");
        return Number.isFinite(t) ? t : 0;
      }
      case "purchase_price":
        return Number(row.purchase_price || 0);
      default:
        return norm(row[sortField]);
    }
  };
  rows.sort((a, b) => {
    const av = sortKey(a);
    const bv = sortKey(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return rows;
}

async function loadPurchaseOrders() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/purchase-orders?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch purchase orders");
    const data = await res.json();
    purchaseOrdersCache = data.purchaseOrders || [];
    renderPurchaseOrders(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadPurchaseOrders();
});

newPoBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "purchase-order-form.html";
});

purchaseOrdersTable?.addEventListener("click", (e) => {
  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = "asc";
    }
    renderPurchaseOrders(applyFilters());
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `purchase-order-form.html?id=${id}`;
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderPurchaseOrders(applyFilters());
});

filterOpen?.addEventListener("change", () => renderPurchaseOrders(applyFilters()));
filterClosed?.addEventListener("change", () => renderPurchaseOrders(applyFilters()));

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;
  loadPurchaseOrders();
} else {
  companyMeta.textContent = "Log in to view purchase orders.";
}
