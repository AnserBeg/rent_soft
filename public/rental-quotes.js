const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const refreshBtn = document.getElementById("refresh");
const downloadPdfBtn = document.getElementById("download-pdf");
const newQuoteBtn = document.getElementById("new-quote");
const quotesTable = document.getElementById("rental-quotes-table");
const searchInput = document.getElementById("search");

const filterActive = document.getElementById("filter-active");
const filterRejected = document.getElementById("filter-rejected");
const filterConverted = document.getElementById("filter-converted");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let quotesCache = [];
let sortField = "created_at";
let sortDir = "desc";
let searchTerm = "";

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
  return d.toLocaleString();
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "quote":
      return "Quote";
    case "quote_rejected":
      return "Rejected";
    case "reservation":
      return "Reserved";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "closed":
      return "Closed";
    default:
      return s || "--";
  }
}

function normalizeStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  switch (raw) {
    case "draft":
      return "quote";
    case "quote":
      return "quote";
    case "quote_rejected":
    case "rejected":
      return "quote_rejected";
    case "reservation":
      return "reservation";
    case "ordered":
      return "ordered";
    case "recieved":
      return "received";
    case "received":
      return "received";
    case "closed":
      return "closed";
    default:
      return "quote";
  }
}

function canReserve(row) {
  return normalizeStatus(row.status) === "quote";
}

function canReject(row) {
  return normalizeStatus(row.status) === "quote";
}

function canUndo(row) {
  const s = normalizeStatus(row.status);
  return s === "quote_rejected" || s === "reservation";
}

async function setOrderStatus(orderId, nextStatus) {
  if (!activeCompanyId) throw new Error("Select a company first.");
  const res = await fetch(`/api/rental-orders/${encodeURIComponent(orderId)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, status: nextStatus }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to update status");
  return data.order;
}

function passesFilters(row) {
  const s = String(row.status || "").toLowerCase();
  const isActive = s === "quote";
  const isRejected = s === "quote_rejected";
  const isConverted = !isActive && !isRejected;
  if (isActive && filterActive?.checked) return true;
  if (isRejected && filterRejected?.checked) return true;
  if (isConverted && filterConverted?.checked) return true;
  return false;
}

function quoteNumberFor(row) {
  const quoteNumber = row.quote_number || row.quoteNumber || null;
  return quoteNumber || `#${row.id}`;
}

function applyFilters() {
  let rows = (quotesCache || []).filter(passesFilters);
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [
        quoteNumberFor(r),
        r.status,
        r.customer_name,
        r.salesperson_name,
        r.start_at,
        r.end_at,
        r.ro_number,
        r.quote_number,
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
      case "quote":
        return norm(quoteNumberFor(row));
      case "status":
        return norm(row.status);
      case "customer":
        return norm(row.customer_name);
      case "sales":
        return norm(row.salesperson_name);
      case "start_at":
      case "end_at":
        return dateKey(row[sortField]);
      case "equipment_count":
        return numKey(row.equipment_count);
      case "fee_total":
        return numKey(row.fee_total);
      case "ro_number":
        return norm(row.ro_number);
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

function renderQuotes(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  quotesTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "quote" ? "active" : ""}" data-sort="quote">Quote # ${indicator("quote")}</span>
      <span class="sort ${sortField === "status" ? "active" : ""}" data-sort="status">Status ${indicator("status")}</span>
      <span class="sort ${sortField === "customer" ? "active" : ""}" data-sort="customer">Customer ${indicator("customer")}</span>
      <span class="sort ${sortField === "sales" ? "active" : ""}" data-sort="sales">Sales ${indicator("sales")}</span>
      <span class="sort ${sortField === "start_at" ? "active" : ""}" data-sort="start_at">Start ${indicator("start_at")}</span>
      <span class="sort ${sortField === "end_at" ? "active" : ""}" data-sort="end_at">End ${indicator("end_at")}</span>
      <span class="sort ${sortField === "equipment_count" ? "active" : ""}" data-sort="equipment_count">Equipment ${indicator("equipment_count")}</span>
      <span class="sort ${sortField === "fee_total" ? "active" : ""}" data-sort="fee_total">Fees ${indicator("fee_total")}</span>
      <span class="sort ${sortField === "ro_number" ? "active" : ""}" data-sort="ro_number">RO # ${indicator("ro_number")}</span>
      <span>Actions</span>
      <span>History</span>
    </div>`;

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    const quoteNumber = row.quote_number || row.quoteNumber || null;
    const roNumber = row.ro_number || row.roNumber || null;
    div.innerHTML = `
      <span>${quoteNumber || `#${row.id}`}</span>
      <span>${statusLabel(row.status)}</span>
      <span>${row.customer_name || "--"}</span>
      <span>${row.salesperson_name || "--"}</span>
      <span>${fmtDateTime(row.start_at)}</span>
      <span>${fmtDateTime(row.end_at)}</span>
      <span>${row.equipment_count || 0}</span>
      <span>${fmtMoney(row.fee_total)}</span>
      <span>${roNumber || "--"}</span>
      <span style="justify-self:end;">
        <div class="inline-actions" style="justify-content:flex-end; gap:8px;">
          ${canReserve(row) ? `<button class="primary small" type="button" data-reserve>Reserve</button>` : ""}
          ${canReject(row) ? `<button class="ghost danger small" type="button" data-reject>Reject</button>` : ""}
          ${canUndo(row) ? `<button class="ghost small" type="button" data-undo>Undo</button>` : ""}
        </div>
      </span>
      <span style="justify-self:end;">
        <button class="ghost small" type="button" data-history>History</button>
      </span>
    `;
    quotesTable.appendChild(div);
  });
}

async function loadQuotes() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/rental-quotes?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch quotes");
    const data = await res.json();
    quotesCache = data.orders || [];
    renderQuotes(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

refreshBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadQuotes();
});

downloadPdfBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Select a company first.";
    return;
  }
  window.open(`/api/rental-orders/pdf?companyId=${activeCompanyId}&statuses=quote,quote_rejected&includeQuotes=1`, "_blank");
});

newQuoteBtn.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "rental-order-form.html?status=quote&from=quotes&blank=1";
});

quotesTable.addEventListener("click", (e) => {
  const reserveBtn = e.target.closest?.("[data-reserve]");
  if (reserveBtn) {
    e.preventDefault();
    e.stopPropagation();
    const row = reserveBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (!id) return;
    reserveBtn.disabled = true;
    setOrderStatus(id, "reservation")
      .then((order) => {
        const idx = quotesCache.findIndex((q) => String(q.id) === String(id));
        if (idx >= 0) {
          quotesCache[idx] = {
            ...quotesCache[idx],
            status: order.status,
            quote_number: order.quoteNumber,
            quoteNumber: order.quoteNumber,
            ro_number: order.roNumber,
            roNumber: order.roNumber,
          };
        }
        renderQuotes(applyFilters());
      })
      .catch((err) => {
        companyMeta.textContent = err.message || "Unable to reserve quote.";
      })
      .finally(() => {
        reserveBtn.disabled = false;
      });
    return;
  }

  const rejectBtn = e.target.closest?.("[data-reject]");
  if (rejectBtn) {
    e.preventDefault();
    e.stopPropagation();
    const row = rejectBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (!id) return;
    rejectBtn.disabled = true;
    setOrderStatus(id, "quote_rejected")
      .then((order) => {
        const idx = quotesCache.findIndex((q) => String(q.id) === String(id));
        if (idx >= 0) {
          quotesCache[idx] = {
            ...quotesCache[idx],
            status: order.status,
            quote_number: order.quoteNumber,
            quoteNumber: order.quoteNumber,
            ro_number: order.roNumber,
            roNumber: order.roNumber,
          };
        }
        renderQuotes(applyFilters());
      })
      .catch((err) => {
        companyMeta.textContent = err.message || "Unable to reject quote.";
      })
      .finally(() => {
        rejectBtn.disabled = false;
      });
    return;
  }

  const undoBtn = e.target.closest?.("[data-undo]");
  if (undoBtn) {
    e.preventDefault();
    e.stopPropagation();
    const row = undoBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (!id) return;
    undoBtn.disabled = true;
    setOrderStatus(id, "quote")
      .then((order) => {
        const idx = quotesCache.findIndex((q) => String(q.id) === String(id));
        if (idx >= 0) {
          quotesCache[idx] = {
            ...quotesCache[idx],
            status: order.status,
            quote_number: order.quoteNumber,
            quoteNumber: order.quoteNumber,
            ro_number: order.roNumber,
            roNumber: order.roNumber,
          };
        }
        renderQuotes(applyFilters());
      })
      .catch((err) => {
        companyMeta.textContent = err.message || "Unable to undo.";
      })
      .finally(() => {
        undoBtn.disabled = false;
      });
    return;
  }

  const historyBtn = e.target.closest?.("[data-history]");
  if (historyBtn) {
    e.preventDefault();
    const row = historyBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (!id || !activeCompanyId) return;
    window.location.href = `rental-order-history.html?id=${encodeURIComponent(id)}&from=quotes`;
    return;
  }

  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = sort === "quote" || sort === "customer" || sort === "sales" || sort === "status" || sort === "ro_number" ? "asc" : "desc";
    }
    renderQuotes(applyFilters());
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `rental-order-form.html?id=${id}&from=quotes`;
});

[filterActive, filterRejected, filterConverted].filter(Boolean).forEach((el) => {
  el.addEventListener("change", () => renderQuotes(applyFilters()));
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderQuotes(applyFilters());
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;
  loadQuotes();
} else {
  companyMeta.textContent = "Log in to view quotes.";
}
