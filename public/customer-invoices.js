function $(id) {
  return document.getElementById(id);
}

function setText(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function fmtDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "--";
  return d.toISOString().slice(0, 10);
}

function formatStatus(value) {
  const raw = String(value || "").trim();
  if (!raw) return "--";
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search || "");
  const value = params.get(name);
  return value ? String(value) : null;
}

function normalizeCompanyId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isOverdue(invoice) {
  const balance = safeNum(invoice?.balance, 0);
  if (balance <= 0) return false;
  const dueRaw = invoice?.dueDate;
  if (!dueRaw) return false;
  const due = new Date(dueRaw);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

document.addEventListener("DOMContentLoaded", () => {
  const backLink = $("customer-invoices-back");
  const companySelect = $("customer-invoices-company");
  const refreshBtn = $("customer-invoices-refresh");
  const summarySub = $("customer-invoices-summary-sub");
  const summaryMeta = $("customer-invoices-summary-meta");
  const totalEl = $("customer-invoices-total");
  const overdueEl = $("customer-invoices-overdue");
  const overdueKpi = $("customer-invoices-overdue-kpi");
  const searchInput = $("customer-invoices-search");
  const overdueOnlyToggle = $("customer-invoices-overdue-only");
  const table = $("customer-invoices-table");
  const tableMeta = $("customer-invoices-meta");

  const returnTo = getQueryParam("returnTo");
  if (backLink && returnTo) backLink.href = returnTo;

  const token = window.CustomerAccount?.getToken?.() || "";
  if (!token) {
    const loginParams = new URLSearchParams();
    if (returnTo) loginParams.set("returnTo", returnTo);
    const loginUrl = `customer-login.html${loginParams.toString() ? `?${loginParams.toString()}` : ""}`;
    setText(summarySub, "Please log in to view invoices.");
    setText(summaryMeta, "");
    setText(totalEl, "--");
    setText(overdueEl, "--");
    if (table) {
      table.innerHTML = `<div class="table-row"><span class="hint" style="grid-column: 1 / -1;">Please <a class="ghost" href="${escapeHtml(
        loginUrl
      )}">log in</a> to view invoices.</span></div>`;
    }
    if (companySelect) companySelect.disabled = true;
    if (refreshBtn) refreshBtn.disabled = true;
    if (searchInput) searchInput.disabled = true;
    if (overdueOnlyToggle) overdueOnlyToggle.disabled = true;
    return;
  }

  let companies = [];
  let invoicesCache = [];
  let activeCompanyId = null;
  let searchTerm = "";
  let showOverdueOnly = false;

  function readLastCompanyId() {
    const raw = localStorage.getItem("rentSoft.customerLastCompanyId");
    const cid = Number(raw);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    return cid;
  }

  function storeLastCompanyId(companyId) {
    if (!companyId) return;
    localStorage.setItem("rentSoft.customerLastCompanyId", String(companyId));
  }

  function setSummaryEmpty(message) {
    setText(totalEl, "--");
    setText(overdueEl, "--");
    setText(summarySub, message || "Select a rental company.");
    setText(summaryMeta, "");
    if (overdueKpi) overdueKpi.classList.remove("danger");
  }

  function updateSummary(invoices, companyId) {
    const totalBalance = invoices.reduce((sum, inv) => sum + safeNum(inv.balance, 0), 0);
    const overdueBalance = invoices.reduce((sum, inv) => (isOverdue(inv) ? sum + safeNum(inv.balance, 0) : sum), 0);
    const overdueCount = invoices.reduce((count, inv) => (isOverdue(inv) ? count + 1 : count), 0);

    setText(totalEl, money(totalBalance));
    setText(overdueEl, money(overdueBalance));
    if (overdueKpi) overdueKpi.classList.toggle("danger", overdueBalance > 0);

    const company = companies.find((c) => Number(c.id) === Number(companyId));
    if (companyId) {
      setText(summarySub, company?.name ? `${company.name} (Company #${companyId})` : `Company #${companyId}`);
    } else {
      setText(summarySub, "Select a rental company.");
    }

    const countLabel = invoices.length ? `${invoices.length} invoice${invoices.length === 1 ? "" : "s"} loaded.` : "No invoices yet.";
    const overdueLabel = overdueCount ? ` ${overdueCount} overdue.` : "";
    setText(summaryMeta, `${countLabel}${overdueLabel}`.trim());
  }

  function applyInvoiceFilters() {
    let rows = Array.isArray(invoicesCache) ? [...invoicesCache] : [];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter((inv) =>
        [inv.invoiceNumber, inv.rentalOrderNumber, inv.rentalOrderId, inv.status, inv.arStatus]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(term))
      );
    }
    if (showOverdueOnly) rows = rows.filter((inv) => isOverdue(inv));
    rows.sort((a, b) => {
      const aDate = Date.parse(a.invoiceDate || a.issueDate || "") || 0;
      const bDate = Date.parse(b.invoiceDate || b.issueDate || "") || 0;
      if (aDate !== bDate) return bDate - aDate;
      return Number(b.id || 0) - Number(a.id || 0);
    });
    return rows;
  }

  function renderInvoices(rows) {
    if (!table) return;
    table.innerHTML = `
      <div class="table-row table-header">
        <span>Invoice #</span>
        <span>Rental order</span>
        <span>Invoice date</span>
        <span>Due</span>
        <span>Total</span>
        <span>Paid</span>
        <span>Balance</span>
        <span>Status</span>
        <span></span>
      </div>
    `;

    if (!rows.length) {
      table.innerHTML += `<div class="table-row"><span class="hint" style="grid-column: 1 / -1;">No invoices found.</span></div>`;
      return;
    }

    rows.forEach((inv) => {
      const row = document.createElement("div");
      row.className = "table-row";
      const invoiceLabel = inv.invoiceNumber || (inv.id ? `#${inv.id}` : "--");
      const rentalLabel = inv.rentalOrderNumber || (inv.rentalOrderId ? `#${inv.rentalOrderId}` : "--");
      row.innerHTML = `
        <span>${escapeHtml(invoiceLabel)}</span>
        <span>${escapeHtml(rentalLabel)}</span>
        <span>${escapeHtml(fmtDate(inv.invoiceDate || inv.issueDate))}</span>
        <span>${escapeHtml(fmtDate(inv.dueDate))}</span>
        <span>${escapeHtml(money(inv.total))}</span>
        <span>${escapeHtml(money(inv.paid))}</span>
        <span>${escapeHtml(money(inv.balance))}</span>
        <span>${escapeHtml(formatStatus(inv.arStatus || inv.status))}</span>
        <span>
          <button class="ghost small" type="button" data-invoice-pdf="${escapeHtml(String(inv.id || ""))}" data-invoice-ref="${escapeHtml(
        String(invoiceLabel)
      )}">PDF</button>
        </span>
      `;
      table.appendChild(row);
    });
  }

  async function downloadInvoicePdf({ invoiceId, ref }) {
    const id = Number(invoiceId);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid invoice id.");
    if (!activeCompanyId) throw new Error("Missing company.");

    const url = `/api/customers/invoices/${encodeURIComponent(String(id))}/pdf?companyId=${encodeURIComponent(String(activeCompanyId))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || "Unable to download PDF.");
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${String(ref || `invoice-${id}`).replace(/[^\w\-().\s]/g, "").trim() || `invoice-${id}`}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 250);
  }

  async function loadInvoices() {
    if (!activeCompanyId) {
      setSummaryEmpty("Select a rental company.");
      invoicesCache = [];
      renderInvoices([]);
      setText(tableMeta, companies.length ? "Select a rental company to view invoices." : "No rental companies found.");
      return;
    }

    setText(tableMeta, "Loading...");
    renderInvoices([]);
    const res = await fetch(`/api/customers/invoices?companyId=${encodeURIComponent(String(activeCompanyId))}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load invoices.");
    invoicesCache = Array.isArray(data.invoices) ? data.invoices : [];
    updateSummary(invoicesCache, activeCompanyId);
    renderInvoices(applyInvoiceFilters());
    setText(tableMeta, invoicesCache.length ? "" : "No invoices for this company.");
  }

  async function loadCompanies() {
    if (!companySelect) return;
    companySelect.disabled = true;
    companySelect.innerHTML = `<option value="">Loading...</option>`;
    setSummaryEmpty("Loading companies...");
    setText(tableMeta, "");
    try {
      const res = await fetch("/api/customers/companies", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load companies.");
      companies = Array.isArray(data.companies) ? data.companies : [];

      if (!companies.length) {
        companySelect.innerHTML = `<option value="">No companies found</option>`;
        setSummaryEmpty("No rental companies found.");
        setText(tableMeta, "No rental companies found.");
        return;
      }

      companySelect.innerHTML =
        `<option value="">Select company</option>` +
        companies.map((c) => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || `Company #${c.id}`)}</option>`).join("");

      const queryCompanyId = normalizeCompanyId(getQueryParam("companyId"));
      const storedCompanyId = readLastCompanyId();
      const nextId =
        (queryCompanyId && companies.some((c) => Number(c.id) === queryCompanyId) ? queryCompanyId : null) ||
        (storedCompanyId && companies.some((c) => Number(c.id) === storedCompanyId) ? storedCompanyId : null) ||
        (companies.length === 1 ? Number(companies[0].id) : null);

      if (nextId) {
        companySelect.value = String(nextId);
        activeCompanyId = nextId;
        storeLastCompanyId(nextId);
        await loadInvoices();
      } else {
        activeCompanyId = null;
        setSummaryEmpty("Select a rental company.");
        renderInvoices([]);
        setText(tableMeta, "Select a rental company to view invoices.");
      }
    } catch (err) {
      setSummaryEmpty("Unable to load companies.");
      setText(tableMeta, err?.message ? String(err.message) : String(err));
    } finally {
      companySelect.disabled = !companies.length;
    }
  }

  companySelect?.addEventListener("change", () => {
    const nextId = normalizeCompanyId(companySelect.value);
    activeCompanyId = nextId;
    if (nextId) storeLastCompanyId(nextId);
    loadInvoices().catch((err) => setText(tableMeta, err?.message ? String(err.message) : String(err)));
  });

  refreshBtn?.addEventListener("click", () => {
    loadInvoices().catch((err) => setText(tableMeta, err?.message ? String(err.message) : String(err)));
  });

  searchInput?.addEventListener("input", () => {
    searchTerm = String(searchInput.value || "").trim();
    renderInvoices(applyInvoiceFilters());
    setText(tableMeta, "");
  });

  overdueOnlyToggle?.addEventListener("change", () => {
    showOverdueOnly = overdueOnlyToggle.checked;
    renderInvoices(applyInvoiceFilters());
    setText(tableMeta, showOverdueOnly ? "Showing overdue invoices only." : "");
  });

  table?.addEventListener("click", async (e) => {
    const btn = e?.target?.closest?.("[data-invoice-pdf]");
    if (!btn) return;
    try {
      const invoiceId = btn.getAttribute("data-invoice-pdf");
      const ref = btn.getAttribute("data-invoice-ref");
      await downloadInvoicePdf({ invoiceId, ref });
    } catch (err) {
      setText(tableMeta, err?.message ? String(err.message) : "Unable to download PDF.");
    }
  });

  loadCompanies().catch((err) => setText(tableMeta, err?.message ? String(err.message) : String(err)));
});
