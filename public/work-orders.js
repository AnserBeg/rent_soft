const companyMeta = document.getElementById("company-meta");
const workOrdersTable = document.getElementById("work-orders-table");
const refreshBtn = document.getElementById("refresh");
const newWorkOrderBtn = document.getElementById("new-work-order");
const searchInput = document.getElementById("search");
const showClosedInput = document.getElementById("show-closed");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let workOrdersCache = [];
let searchTerm = "";
let showClosed = false;

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

async function syncWorkOrderPause(order) {
  if (!activeCompanyId || !order?.unitId) return;
  if (order.serviceStatus !== "out_of_service") return;
  const payload = {
    companyId: activeCompanyId,
    workOrderNumber: order.number,
    startAt: order.createdAt || order.updatedAt || new Date().toISOString(),
    endAt: order.closedAt || order.updatedAt || new Date().toISOString(),
  };
  const res = await fetch(`/api/equipment/${encodeURIComponent(order.unitId)}/work-order-pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to update rental pause period.");
}

function renderWorkOrders(rows) {
  if (!workOrdersTable) return;
  workOrdersTable.innerHTML = `
    <div class="table-row table-header">
      <span>Work order</span>
      <span>Date</span>
      <span>Unit</span>
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
      <span>${order.unitLabel || "--"}</span>
      <span>${serviceLabel}${inspectionBadge}</span>
      <span>${updatedLabel}</span>
    `;
    workOrdersTable.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...workOrdersCache];

  if (!showClosed) {
    rows = rows.filter((order) => order?.orderStatus !== "closed");
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((order) => {
      return [
        order.number,
        order.date,
        order.unitLabel,
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

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadWorkOrders();
});

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

showClosedInput?.addEventListener("change", (e) => {
  showClosed = !!e.target.checked;
  renderWorkOrders(applyFilters());
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = "";
  if (showClosedInput) {
    showClosed = !!showClosedInput.checked;
  }
  loadWorkOrders();
} else {
  companyMeta.textContent = "Log in to view work orders.";
}
