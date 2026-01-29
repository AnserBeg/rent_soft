const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const refreshBtn = document.getElementById("refresh");
const downloadPdfBtn = document.getElementById("download-pdf");
const newRoBtn = document.getElementById("new-ro");
const ordersTable = document.getElementById("rental-orders-table");
const filterRequested = document.getElementById("filter-requested");
const filterReservation = document.getElementById("filter-reservation");
const filterOrdered = document.getElementById("filter-ordered");
const filterReceived = document.getElementById("filter-received");
const filterClosed = document.getElementById("filter-closed");
const searchInput = document.getElementById("search");
const openLegacyImportBtn = document.getElementById("open-legacy-import");
const legacyImportModal = document.getElementById("legacy-import-modal");
const closeLegacyImportBtn = document.getElementById("close-legacy-import");
const importFutureReportInput = document.getElementById("import-future-report");
const importSalesReportInput = document.getElementById("import-sales-report");
const importTransactionsInput = document.getElementById("import-transactions");
const importInstancesInput = document.getElementById("import-instances");
const runImportBtn = document.getElementById("run-import");
const backfillLegacyRatesBtn = document.getElementById("backfill-legacy-rates");
const importResult = document.getElementById("import-result");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let ordersCache = [];
let searchTerm = "";

const LIST_STATE_KEY = "rentsoft.rental-orders.listState";
const ALLOWED_SORT_FIELDS = new Set(["doc", "status", "customer", "po", "sales", "start_at", "end_at", "total", "created_at"]);

function loadListState() {
  const raw = localStorage.getItem(LIST_STATE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
    if (typeof saved.sortField === "string" && ALLOWED_SORT_FIELDS.has(saved.sortField)) sortField = saved.sortField;
    if (saved.sortDir === "asc" || saved.sortDir === "desc") sortDir = saved.sortDir;
    if (typeof saved.filters === "object" && saved.filters) {
      if (filterRequested) filterRequested.checked = !!saved.filters.requested;
      if (filterReservation) filterReservation.checked = !!saved.filters.reservation;
      if (filterOrdered) filterOrdered.checked = !!saved.filters.ordered;
      if (filterReceived) filterReceived.checked = !!saved.filters.received;
      if (filterClosed) filterClosed.checked = !!saved.filters.closed;
    }
  } catch { }
}

function persistListState() {
  localStorage.setItem(
    LIST_STATE_KEY,
    JSON.stringify({
      searchTerm: String(searchTerm || ""),
      sortField,
      sortDir,
      filters: {
        requested: !!filterRequested?.checked,
        reservation: !!filterReservation?.checked,
        ordered: !!filterOrdered?.checked,
        received: !!filterReceived?.checked,
        closed: !!filterClosed?.checked,
      }
    })
  );
}


function fmtMoney(v) {
  if (v === null || v === undefined) return "--";
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function fmtDateTime(v) {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleDateString();
}

function docNumberFor(row) {
  const roNumber = row.ro_number || row.roNumber || null;
  const quoteNumber = row.quote_number || row.quoteNumber || null;
  return roNumber && quoteNumber ? `${roNumber} / ${quoteNumber}` : roNumber || quoteNumber || `#${row.id}`;
}

function poOrLegacyFor(row) {
  const legacy = row.external_contract_number || row.externalContractNumber || null;
  return row.customer_po || row.customerPo || legacy || "--";
}

function statusLabel(status, isOverdue) {
  const s = String(status || "").toLowerCase();
  let label = s || "--";
  switch (s) {
    case "quote":
      label = "Quote";
      break;
    case "quote_rejected":
      label = "Rejected";
      break;
    case "requested":
      label = "Requested";
      break;
    case "request_rejected":
      label = "Request rejected";
      break;
    case "reservation":
      label = "Reservation";
      break;
    case "ordered":
      label = "Ordered";
      break;
    case "received":
      label = "Received";
      break;
    case "closed":
      label = "Closed";
      break;
    default:
      label = s || "--";
      break;
  }
  if (isOverdue) return `${label} (Overdue)`;
  return label;
}

function selectedStatuses() {
  const statuses = [];
  if (filterRequested?.checked) statuses.push("requested");
  if (filterReservation?.checked) statuses.push("reservation");
  if (filterOrdered?.checked) statuses.push("ordered");
  if (filterReceived?.checked) statuses.push("received");
  if (filterClosed?.checked) statuses.push("closed");
  return statuses;
}

function applyFilters() {
  let rows = [...ordersCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [
        docNumberFor(r),
        r.status,
        r.customer_name,
        poOrLegacyFor(r),
        r.salesperson_name,
        r.start_at,
        r.end_at,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const dateKey = (v) => {
    const t = Date.parse(v || "");
    return Number.isFinite(t) ? t : -Infinity;
  };
  const numKey = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -Infinity;
  };
  const sortKey = (row) => {
    switch (sortField) {
      case "doc":
        return norm(docNumberFor(row));
      case "po":
        return norm(poOrLegacyFor(row));
      case "customer":
        return norm(row.customer_name);
      case "sales":
        return norm(row.salesperson_name);
      case "status":
        return norm(row.status);
      case "start_at":
      case "end_at":
        return dateKey(row[sortField]);
      case "total":
        return numKey(row.total);
      case "created_at":
      default:
        return dateKey(row.created_at);
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

function renderOrders(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  ordersTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "doc" ? "active" : ""}" data-sort="doc">Doc # ${indicator("doc")}</span>
      <span class="sort ${sortField === "status" ? "active" : ""}" data-sort="status">Status ${indicator("status")}</span>
      <span class="sort ${sortField === "customer" ? "active" : ""}" data-sort="customer">Customer ${indicator("customer")}</span>
      <span class="sort ${sortField === "po" ? "active" : ""}" data-sort="po">PO / Legacy # ${indicator("po")}</span>
      <span class="sort ${sortField === "sales" ? "active" : ""}" data-sort="sales">Sales ${indicator("sales")}</span>
      <span class="sort ${sortField === "start_at" ? "active" : ""}" data-sort="start_at">Start ${indicator("start_at")}</span>
      <span class="sort ${sortField === "end_at" ? "active" : ""}" data-sort="end_at">End ${indicator("end_at")}</span>
      <span class="sort ${sortField === "total" ? "active" : ""}" data-sort="total">Total ${indicator("total")}</span>
      <span>History</span>
    </div>`;

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    const docNumber = docNumberFor(row);
    const poOrLegacy = poOrLegacyFor(row);
    const total = row.total ?? row.order_total ?? null;
    div.innerHTML = `
      <span>${docNumber}</span>
      <span>${statusLabel(row.status, row.is_overdue)}</span>
      <span>${row.customer_name || "--"}</span>
      <span>${poOrLegacy}</span>
      <span>${row.salesperson_name || "--"}</span>
      <span>${fmtDateTime(row.start_at)}</span>
      <span>${fmtDateTime(row.end_at)}</span>
      <span>${fmtMoney(total)}</span>
      <span style="justify-self:end;">
        <button class="ghost small" type="button" data-history>History</button>
      </span>
    `;
    ordersTable.appendChild(div);
  });
}

async function loadOrders() {
  if (!activeCompanyId) return;
  try {
    const statuses = selectedStatuses();
    if (!statuses.length) {
      ordersCache = [];
      renderOrders([]);
      return;
    }
    const statusesParam = statuses.length ? `&statuses=${encodeURIComponent(statuses.join(","))}` : "";
    const res = await fetch(`/api/rental-orders?companyId=${activeCompanyId}${statusesParam}`);
    if (!res.ok) throw new Error("Unable to fetch rental orders");
    const data = await res.json();
    ordersCache = data.orders || [];
    renderOrders(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

refreshBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadOrders();
});

downloadPdfBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Select a company first.";
    return;
  }
  const statuses = selectedStatuses();
  const statusesParam = statuses.length ? `&statuses=${encodeURIComponent(statuses.join(","))}` : "";
  window.open(`/api/rental-orders/pdf?companyId=${activeCompanyId}${statusesParam}&includeQuotes=1`, "_blank");
});

newRoBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "rental-order-form.html?status=reservation";
});

ordersTable.addEventListener("click", (e) => {
  const historyBtn = e.target.closest?.("[data-history]");
  if (historyBtn) {
    e.preventDefault();
    const row = historyBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (!id || !activeCompanyId) return;
    window.location.href = `rental-order-history.html?id=${encodeURIComponent(id)}`;
    return;
  }

  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = sort === "doc" || sort === "customer" || sort === "po" || sort === "sales" || sort === "status" ? "asc" : "desc";
    }
    renderOrders(applyFilters());
    persistListState();
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `rental-order-form.html?id=${id}`;
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;

  loadListState();
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadOrders();
} else {
  companyMeta.textContent = "Log in to view rental orders.";
}

[filterRequested, filterReservation, filterOrdered, filterReceived, filterClosed].filter(Boolean).forEach((el) => {
  el.addEventListener("change", () => {
    loadOrders();
    persistListState();
  });
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderOrders(applyFilters());
  persistListState();
});

function openLegacyImport() {
  if (!legacyImportModal) return;
  legacyImportModal.classList.add("show");
  if (importResult) importResult.textContent = "";
}

function closeLegacyImport() {
  if (!legacyImportModal) return;
  legacyImportModal.classList.remove("show");
}

openLegacyImportBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openLegacyImport();
});

closeLegacyImportBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeLegacyImport();
});

legacyImportModal?.addEventListener("click", (e) => {
  if (e.target === legacyImportModal) closeLegacyImport();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLegacyImport();
});

runImportBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    if (importResult) importResult.textContent = "Select a company first.";
    return;
  }
  const futureFile = importFutureReportInput?.files?.[0] || null;
  const salesFile = importSalesReportInput?.files?.[0] || null;
  const txFile = importTransactionsInput?.files?.[0] || null;
  const instFile = importInstancesInput?.files?.[0] || null;
  if (!txFile || !instFile) {
    if (importResult) {
      importResult.textContent = "Choose the Transaction List and Transaction List with Item ID. Future report is optional for return times.";
    }
    return;
  }

  if (importResult) {
    importResult.textContent = futureFile
      ? "Importing rental orders with future return times."
      : "Importing rental orders.";
  }
  runImportBtn.disabled = true;
  try {
    const body = new FormData();
    body.append("companyId", String(activeCompanyId));
    if (futureFile) body.append("futureReport", futureFile);
    if (txFile) body.append("transactions", txFile);
    if (instFile) body.append("instances", instFile);
    if (salesFile) body.append("salesReport", salesFile);
    const res = await fetch("/api/rental-orders/import-legacy", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Import failed");

    const created = data.ordersCreated ?? 0;
    const skipped = data.ordersSkipped ?? 0;
    const customers = data.customersCreated ?? 0;
    const equipment = data.equipmentCreated ?? 0;
    const placeholders = data.placeholderSerialsCreated ?? 0;
    const inferredEnds = data.endDatesInferred ?? 0;
    const errors = Array.isArray(data.errors) ? data.errors.length : 0;
    if (importResult) {
      const errorTail = errors
        ? `\nFirst errors:\n${(data.errors || [])
          .slice(0, 5)
          .map((x) => `- ${x.contractNumber || "?"}: ${x.error || "Error"}`)
          .join("\n")}`
        : "";
      importResult.textContent = `Import complete: orders created ${created}, skipped ${skipped}, customers ${customers}, equipment ${equipment}, placeholders ${placeholders}, inferred ends ${inferredEnds}${errors ? `, errors ${errors}` : ""}.${errorTail}`;
    }
    await loadOrders();
  } catch (err) {
    if (importResult) importResult.textContent = err.message || "Import failed";
  } finally {
    runImportBtn.disabled = false;
    if (importFutureReportInput) importFutureReportInput.value = "";
    if (importSalesReportInput) importSalesReportInput.value = "";
    if (importTransactionsInput) importTransactionsInput.value = "";
    if (importInstancesInput) importInstancesInput.value = "";
  }
});

backfillLegacyRatesBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    if (importResult) importResult.textContent = "Select a company first.";
    return;
  }
  if (importResult) importResult.textContent = "Backfilling legacy rates…";
  backfillLegacyRatesBtn.disabled = true;
  try {
    const res = await fetch("/api/rental-orders/backfill-legacy-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Backfill failed");
    const updated = data.lineItemsUpdated ?? 0;
    const skipped = data.lineItemsSkipped ?? 0;
    const orders = data.ordersTouched ?? 0;
    const warns = Array.isArray(data.warnings) ? data.warnings.length : 0;
    const errs = Array.isArray(data.errors) ? data.errors.length : 0;
    if (importResult) {
      importResult.textContent = `Backfill complete: line items updated ${updated}, skipped ${skipped}, orders touched ${orders}${warns ? `, warnings ${warns}` : ""}${errs ? `, errors ${errs}` : ""}.`;
    }
    await loadOrders();
  } catch (err) {
    if (importResult) importResult.textContent = err.message || "Backfill failed";
  } finally {
    backfillLegacyRatesBtn.disabled = false;
  }
});

