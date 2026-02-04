const companyMeta = document.getElementById("company-meta");
const workOrdersTable = document.getElementById("work-orders-table");
const newWorkOrderBtn = document.getElementById("new-work-order");
const searchInput = document.getElementById("search");
const statusToggle = document.getElementById("status-toggle");
const statusButtons = statusToggle ? Array.from(statusToggle.querySelectorAll("button[data-status]")) : [];

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let workOrdersCache = [];
let searchTerm = "";
let statusFilter = "open";

const LIST_STATE_KEY = "rentsoft.work-orders.listState";
const STATUS_OPTIONS = ["open", "completed", "closed"];

function loadListState() {
  const raw = localStorage.getItem(LIST_STATE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
    if (typeof saved.statusFilter === "string" && STATUS_OPTIONS.includes(saved.statusFilter)) {
      statusFilter = saved.statusFilter;
      return;
    }
    if (typeof saved.showClosed === "boolean") {
      statusFilter = saved.showClosed ? "closed" : "open";
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


function keyForWorkOrders(companyId) {
  return `rentSoft.workOrders.${companyId}`;
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadWorkOrdersFromStorage() {
  if (!activeCompanyId) return [];
  const raw = localStorage.getItem(keyForWorkOrders(activeCompanyId));
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

function saveWorkOrdersToStorage(orders) {
  if (!activeCompanyId) return;
  localStorage.setItem(keyForWorkOrders(activeCompanyId), JSON.stringify(orders || []));
}

function normalizeUnitIds(order) {
  if (!order) return [];
  if (Array.isArray(order.unitIds)) {
    return order.unitIds.map((id) => String(id)).filter(Boolean);
  }
  if (order.unitId) return [String(order.unitId)];
  return [];
}

function normalizeUnitLabels(order) {
  if (!order) return [];
  if (Array.isArray(order.unitLabels)) {
    return order.unitLabels.map((label) => String(label)).filter(Boolean);
  }
  if (order.unitLabel) return [String(order.unitLabel)];
  return [];
}

function dedupeStringList(values) {
  return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean)));
}

function formatUnitSummary(order) {
  const labels = dedupeStringList(normalizeUnitLabels(order));
  if (!labels.length) return order?.unitLabel || "--";
  if (labels.length === 1) return labels[0];
  const preview = labels.slice(0, 2).join(", ");
  const remaining = labels.length - 2;
  return remaining > 0 ? `${preview} +${remaining} more` : preview;
}

async function syncWorkOrderPause(order) {
  if (!activeCompanyId) return;
  const unitIds = dedupeStringList(normalizeUnitIds(order));
  if (!unitIds.length) return;
  const now = new Date().toISOString();
  const payload = {
    companyId: activeCompanyId,
    workOrderNumber: order.number,
    serviceStatus: order.serviceStatus || "in_service",
    orderStatus: order.orderStatus || "open",
  };
  if (order.serviceStatus === "out_of_service") {
    payload.startAt = order.createdAt || order.updatedAt || now;
    if (order.orderStatus === "closed") {
      payload.endAt = order.closedAt || order.updatedAt || now;
    }
  } else {
    payload.endAt = order.closedAt || order.updatedAt || now;
  }
  const errors = [];
  await Promise.all(
    unitIds.map(async (unitId) => {
      const res = await fetch(`/api/equipment/${encodeURIComponent(unitId)}/work-order-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) errors.push(data.error || "Unable to update rental pause period.");
    })
  );
  if (errors.length) throw new Error(errors[0]);
}

function renderWorkOrders(rows) {
  if (!workOrdersTable) return;
  workOrdersTable.innerHTML = `
    <div class="table-row table-header">
      <span>Work order</span>
      <span>Date</span>
      <span>Units</span>
      <span>Service</span>
      <span>Updated</span>
    </div>`;

  rows.forEach((order) => {
    const updatedAt = order?.updatedAt ? new Date(order.updatedAt) : null;
    const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
      ? updatedAt.toLocaleDateString()
      : "--";

    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = order.id;
    const serviceLabel = order?.serviceStatus === "out_of_service" ? "Out of service" : "In service";
    const inspectionBadge = order?.returnInspection ? `<div style="margin-top:4px;"><span class="badge return-inspection">Return inspection</span></div>` : "";
    div.innerHTML = `
      <span>${order.number || "--"}</span>
      <span>${order.date || "--"}</span>
      <span>${formatUnitSummary(order)}</span>
      <span>${serviceLabel}${inspectionBadge}</span>
      <span>${updatedLabel}</span>
    `;
    workOrdersTable.appendChild(div);
  });
}

function normalizeOrderStatus(order) {
  return order?.orderStatus || "open";
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
  let rows = [...workOrdersCache];

  if (statusFilter) {
    rows = rows.filter((order) => normalizeOrderStatus(order) === statusFilter);
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((order) => {
      const unitLabels = normalizeUnitLabels(order).join(" ");
      return [
        order.number,
        order.date,
        unitLabels,
        order.orderStatus,
        order.serviceStatus,
        order.workSummary,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }

  rows.sort((a, b) => {
    const aTime = Date.parse(a.updatedAt || a.date || "");
    const bTime = Date.parse(b.updatedAt || b.date || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return String(a.number || "").localeCompare(String(b.number || ""));
  });

  return rows;
}

function loadWorkOrders() {
  workOrdersCache = loadWorkOrdersFromStorage();
  renderWorkOrders(applyFilters());
}

function closeWorkOrder(id) {
  const orders = loadWorkOrdersFromStorage();
  const target = orders.find((order) => String(order.id) === String(id));
  if (!target) return;
  target.orderStatus = "closed";
  target.updatedAt = new Date().toISOString();
  if (!target.closedAt) target.closedAt = target.updatedAt;
  saveWorkOrdersToStorage(orders);
  workOrdersCache = orders;
  renderWorkOrders(applyFilters());
  syncWorkOrderPause(target).catch((err) => {
    if (companyMeta) companyMeta.textContent = err.message || "Unable to update rental pause period.";
  });
}


newWorkOrderBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "work-order-form.html";
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderWorkOrders(applyFilters());
  persistListState();
});

statusToggle?.addEventListener("click", (e) => {
  const button = e.target.closest?.("button[data-status]");
  const nextStatus = button?.dataset?.status;
  if (!nextStatus) return;
  setStatusFilter(nextStatus);
  renderWorkOrders(applyFilters());
  persistListState();
});

workOrdersTable?.addEventListener("click", (e) => {
  const action = e.target.closest?.("button[data-action]")?.getAttribute?.("data-action");
  if (action === "close") {
    const row = e.target.closest(".table-row");
    const id = row?.dataset?.id;
    if (id) closeWorkOrder(id);
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id) return;
  window.location.href = `work-order-form.html?id=${encodeURIComponent(id)}`;
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = "";

  loadListState();
  if (statusButtons.length) {
    setStatusFilter(statusFilter);
  }
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadWorkOrders();
} else {
  companyMeta.textContent = "Log in to view work orders.";
}
