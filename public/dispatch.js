const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const summaryMeta = document.getElementById("dispatch-summary");
const dispatchTable = document.getElementById("dispatch-table");
const refreshBtn = document.getElementById("refresh");
const searchInput = document.getElementById("search");
const filterOverdue = document.getElementById("filter-overdue");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let equipmentById = new Map();
let activeUnits = [];
let searchTerm = "";

function fmtDate(value, withTime = false) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function docNumberFor(row) {
  const ro = row?.ro_number || row?.roNumber || null;
  const quote = row?.quote_number || row?.quoteNumber || null;
  const ext = row?.external_contract_number || row?.externalContractNumber || null;
  return ro || quote || ext || (row?.order_id ? `#${row.order_id}` : "--");
}

function equipmentType(eq) {
  const rawType = eq?.type_name || eq?.type || "";
  const type = String(rawType).trim();
  return type || "Equipment";
}

function equipmentModel(eq) {
  return eq?.model_name ? String(eq.model_name).trim() : "";
}

function equipmentModelDisplay(eq) {
  const model = equipmentModel(eq);
  return model || "--";
}

function equipmentSortKey(eq) {
  return `${equipmentType(eq)} ${equipmentModel(eq)}`.trim();
}

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function matchesSearch(row, term) {
  const eq = row.equipment || {};
  const a = row.assignment || {};
  const values = [
    equipmentType(eq),
    equipmentModel(eq),
    eq.serial_number,
    a.customer_name,
    docNumberFor(a),
    a.pickup_location_name,
  ].filter(Boolean);

  const loweredTerm = term.toLowerCase();
  const normalizedTerm = normalizeSearchValue(term);

  return values.some((value) => {
    const raw = String(value).toLowerCase();
    if (raw.includes(loweredTerm)) return true;
    if (!normalizedTerm) return false;
    return normalizeSearchValue(raw).includes(normalizedTerm);
  });
}

function equipmentLabel(eq) {
  if (!eq) return "--";
  const serial = eq.serial_number ? String(eq.serial_number).trim() : "";
  const model = eq.model_name ? String(eq.model_name).trim() : "";
  const type = eq.type_name || eq.type || "Equipment";
  if (serial && model) return `${type} Aú ${serial} Aú ${model}`;
  if (serial) return `${type} Aú ${serial}`;
  if (model) return `${type} Aú ${model}`;
  return `${type} #${eq.id}`;
}

function isOutOnOrder(startAt, endAt) {
  const now = Date.now();
  const startMs = Date.parse(startAt || "");
  const endMs = Date.parse(endAt || "");
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  return startMs <= now;
}

function isOverdue(endAt) {
  const endMs = Date.parse(endAt || "");
  if (!Number.isFinite(endMs)) return false;
  return Date.now() > endMs;
}

function activeFilters() {
  return {
    overdueOnly: filterOverdue?.checked ?? false,
  };
}

function applyFilters(rows) {
  const { overdueOnly } = activeFilters();
  let filtered = [...rows];
  if (overdueOnly) {
    filtered = filtered.filter((r) => isOverdue(r.assignment?.end_at));
  }
  if (searchTerm) {
    filtered = filtered.filter((r) => matchesSearch(r, searchTerm));
  }
  return filtered;
}

function renderTable(rows) {
  dispatchTable.innerHTML = `
    <div class="table-row table-header">
      <span>Equipment type</span>
      <span>Model</span>
      <span>Customer</span>
    </div>`;

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "table-row";
    empty.innerHTML = `<span class="hint" style="grid-column:1 / -1;">No active units match this view.</span>`;
    dispatchTable.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.assignment.equipment_id;
    div.dataset.orderId = row.assignment.order_id;
    const type = equipmentType(row.equipment);
    const model = equipmentModelDisplay(row.equipment);
    div.innerHTML = `
      <span>${type}</span>
      <span>${model}</span>
      <span>${row.assignment.customer_name || "--"}</span>
    `;
    dispatchTable.appendChild(div);
  });
}

async function loadActiveUnits() {
  if (!activeCompanyId) {
    if (companyMeta) companyMeta.textContent = "No active company session.";
    return;
  }
  if (companyMeta) companyMeta.textContent = "Loading your company...";
  if (summaryMeta) summaryMeta.textContent = "Loading active units...";

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch(
      `/api/rental-orders/timeline?companyId=${activeCompanyId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&statuses=ordered`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Unable to load timeline data.");

    equipmentById = new Map((data.equipment || []).map((e) => [String(e.id), e]));
    const assignments = Array.isArray(data.assignments) ? data.assignments : [];

    const seen = new Set();
    activeUnits = assignments
      .filter((a) => isOutOnOrder(a.start_at, a.end_at))
      .map((a) => {
        const eq = equipmentById.get(String(a.equipment_id));
        return eq ? { equipment: eq, assignment: a } : null;
      })
      .filter(Boolean)
      .filter((row) => {
        const key = String(row.assignment.equipment_id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => equipmentSortKey(a.equipment).localeCompare(equipmentSortKey(b.equipment)));

    if (companyMeta) {
      const session = window.RentSoft?.getSession?.();
      const companyName =
        session?.company?.name ||
        session?.company?.company_name ||
        session?.user?.companyName ||
        session?.user?.company_name ||
        null;
      companyMeta.textContent = companyName ? `${companyName} (ID ${activeCompanyId})` : `Company #${activeCompanyId}`;
    }
    if (summaryMeta) summaryMeta.textContent = `${activeUnits.length} units currently out on ordered rentals.`;
    renderTable(applyFilters(activeUnits));
  } catch (err) {
    if (companyMeta) companyMeta.textContent = err?.message || "Unable to load company data.";
    if (summaryMeta) summaryMeta.textContent = "Unable to load active units.";
    activeUnits = [];
    renderTable([]);
  }
}

dispatchTable?.addEventListener("click", (e) => {
  const rowEl = e.target.closest?.(".table-row[data-id]");
  if (!rowEl) return;
  const unitId = rowEl.dataset.id;
  const row = activeUnits.find((r) => String(r.assignment?.equipment_id) === String(unitId));
  if (!row) return;
  try {
    const payload = {
      companyId: activeCompanyId || null,
      equipmentId: row.assignment?.equipment_id || null,
      orderId: row.assignment?.order_id || null,
    };
    localStorage.setItem("rentSoft.dispatch.lastSelection", JSON.stringify(payload));
  } catch {}
  const nextParams = new URLSearchParams();
  if (activeCompanyId) nextParams.set("companyId", String(activeCompanyId));
  if (row.assignment?.equipment_id) nextParams.set("equipmentId", String(row.assignment.equipment_id));
  if (row.assignment?.order_id) nextParams.set("orderId", String(row.assignment.order_id));
  const query = nextParams.toString();
  window.location.href = query ? `dispatch-detail.html?${query}` : "dispatch-detail.html";
});

refreshBtn?.addEventListener("click", () => loadActiveUnits());

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "").trim();
  renderTable(applyFilters(activeUnits));
});

filterOverdue?.addEventListener("change", () => renderTable(applyFilters(activeUnits)));

document.addEventListener("DOMContentLoaded", () => {
  loadActiveUnits();
});
