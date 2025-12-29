function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

let billingTimeZone = "UTC";

function formatDateInTimeZone(value, timeZone) {
  if (!value || !timeZone) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(d).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    if (!parts.year || !parts.month || !parts.day) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
}

function fmtDate(value) {
  if (!value) return "--";
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const tzDate = formatDateInTimeZone(value, billingTimeZone);
  if (tzDate) return tzDate;
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

function byId(a, b) {
  return Number(a?.id || 0) - Number(b?.id || 0);
}

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(v) {
  return v === null || v === undefined ? "" : String(v);
}

function escapeHtml(value) {
  return asText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderPayments(paymentsBody, payments) {
  if (!paymentsBody) return;
  const rows = Array.isArray(payments) ? payments : [];
  if (!rows.length) {
    paymentsBody.innerHTML = `<tr><td colspan="4" class="hint">No payments.</td></tr>`;
    return;
  }
  paymentsBody.innerHTML = rows
    .map(
      (p) => `
    <tr>
      <td>${fmtDate(p.paidAt)}</td>
      <td>${money(p.amount)}</td>
      <td>${String(p.method || "--")}</td>
      <td>${String(p.reference || "--")}</td>
    </tr>
  `
    )
    .join("");
}

document.addEventListener("DOMContentLoaded", () => {
  const companyMeta = $("company-meta");
  const summaryMeta = $("summary-meta");
  const refreshBtn = $("refresh");
  const generateBtn = $("generate");
  const generateMeta = $("generate-meta");
  const orderSelect = $("order-select");
  const modeSelect = $("mode-select");
  const customerFilter = $("customer-filter");
  const orderFilter = $("order-filter");
  const customerDetailsEl = $("customer-details");
  const invoiceSearch = $("invoice-search");
  const invoicesTable = $("invoices-table");
  const invoicesMeta = $("invoices-meta");

  const activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setMeta(companyMeta, activeCompanyId ? (companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`) : "Log in to manage accounts receivable.");

  let customersCache = [];
  let invoicesCache = [];
  const urlParams = new URLSearchParams(window.location.search);
  const initialOrderFilterId = urlParams.get("orderId") ? Number(urlParams.get("orderId")) : null;
  let invoiceSearchTerm = "";
  let invoiceSortField = "invoiceDate";
  let invoiceSortDir = "desc";
  let invoiceShowOverdueOnly = false;

  async function loadCompanySettings() {
    billingTimeZone = "UTC";
    if (!activeCompanyId) return;
    const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.settings?.billing_timezone) {
      billingTimeZone = String(data.settings.billing_timezone);
    }
  }

  async function loadSummary() {
    if (!activeCompanyId) return;
    const res = await fetch(`/api/ar/summary?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load summary.");
    const summary = Array.isArray(data.summary) ? data.summary : [];
    const totalBalance = summary.reduce((sum, row) => sum + safeNum(row.balance, 0), 0);
    const totalCredit = summary.reduce((sum, row) => sum + safeNum(row.credit, 0), 0);
    const creditText = totalCredit > 0 ? ` • Customer credit: ${money(totalCredit)}` : "";
    setMeta(summaryMeta, summary.length ? `Total outstanding: ${money(totalBalance)}${creditText}` : "No invoices yet.");
  }

  async function loadCustomers() {
    if (!activeCompanyId || !customerFilter) return;
    const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load customers.");
    const customers = Array.isArray(data.customers) ? data.customers : [];
    customersCache = customers;
    customers.sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));
    customerFilter.innerHTML = `<option value="">All customers</option>` + customers
      .map((c) => `<option value="${c.id}">${String(c.company_name || `Customer #${c.id}`)}</option>`)
      .join("");
  }

  async function loadOrders() {
    if (!activeCompanyId || !orderSelect) return;
    const res = await fetch(`/api/rental-orders?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load rental orders.");
    const orders = Array.isArray(data.orders) ? data.orders : [];
    orders.sort((a, b) => (Date.parse(b.created_at || b.createdAt || "") || 0) - (Date.parse(a.created_at || a.createdAt || "") || 0));
    orderSelect.innerHTML = orders.length
      ? orders.map((o) => {
          const doc = o.ro_number || o.roNumber || o.quote_number || o.quoteNumber || `#${o.id}`;
          const customer = o.customer_name || o.customerName || "--";
          const range = `${fmtDate(o.start_at || o.startAt)} → ${fmtDate(o.end_at || o.endAt)}`;
          return `<option value="${o.id}">${String(doc)} • ${String(customer)} • ${range}</option>`;
        }).join("")
      : `<option value="">No rental orders</option>`;

    if (orderFilter) {
      orderFilter.innerHTML = `<option value="">All rental orders</option>` + orders
        .map((o) => {
          const doc = o.ro_number || o.roNumber || o.quote_number || o.quoteNumber || `#${o.id}`;
          const customer = o.customer_name || o.customerName || "--";
          return `<option value="${o.id}">${String(doc)} • ${String(customer)}</option>`;
        })
        .join("");

      if (initialOrderFilterId && orders.some((o) => Number(o.id) === initialOrderFilterId)) {
        orderFilter.value = String(initialOrderFilterId);
      }
    }
  }

  function renderInvoices(rows) {
    if (!invoicesTable) return;
    if (!rows.length) {
      invoicesTable.innerHTML = `<div class="table-row table-header">
        <span>Invoice #</span><span>Rental order</span><span>Order status</span><span>Customer</span><span>Invoice date</span><span>Due</span><span>Total</span><span>Paid</span><span>Balance</span><span>AR status</span><span>Sent</span>
      </div>
      <div class="table-row"><span class="hint" style="grid-column: 1 / -1;">No invoices found.</span></div>`;
      return;
    }

    const indicator = (field) => {
      if (invoiceSortField !== field) return "";
      return invoiceSortDir === "asc" ? "^" : "v";
    };

    invoicesTable.innerHTML = `
      <div class="table-row table-header">
        <span class="sort ${invoiceSortField === "invoiceNumber" ? "active" : ""}" data-sort="invoiceNumber">Invoice # ${indicator("invoiceNumber")}</span>
        <span class="sort ${invoiceSortField === "rentalOrderNumber" ? "active" : ""}" data-sort="rentalOrderNumber">Rental order ${indicator("rentalOrderNumber")}</span>
        <span class="sort ${invoiceSortField === "status" ? "active" : ""}" data-sort="status">Order status ${indicator("status")}</span>
        <span class="sort ${invoiceSortField === "customerName" ? "active" : ""}" data-sort="customerName">Customer ${indicator("customerName")}</span>
        <span class="sort ${invoiceSortField === "invoiceDate" ? "active" : ""}" data-sort="invoiceDate">Invoice date ${indicator("invoiceDate")}</span>
        <span class="sort ${invoiceSortField === "dueDate" ? "active" : ""}" data-sort="dueDate">Due ${indicator("dueDate")}</span>
        <span class="sort ${invoiceSortField === "total" ? "active" : ""}" data-sort="total">Total ${indicator("total")}</span>
        <span class="sort ${invoiceSortField === "paid" ? "active" : ""}" data-sort="paid">Paid ${indicator("paid")}</span>
        <span class="sort ${invoiceSortField === "balance" ? "active" : ""}" data-sort="balance">Balance ${indicator("balance")}</span>
        <span class="sort ${invoiceSortField === "arStatus" ? "active" : ""}" data-sort="arStatus">AR status ${indicator("arStatus")}</span>
        <span>Sent</span>
      </div>
    `;

    rows.forEach((inv) => {
      const div = document.createElement("div");
      div.className = "table-row";
      div.dataset.id = String(inv.id);
      div.innerHTML = `
        <span>${escapeHtml(inv.invoiceNumber || `#${inv.id}`)}</span>
        <span>${escapeHtml(inv.rentalOrderNumber || (inv.rentalOrderId ? `#${inv.rentalOrderId}` : "--"))}</span>
        <span>${escapeHtml(formatStatus(inv.rentalOrderStatus))}</span>
        <span>${escapeHtml(inv.customerName || "--")}</span>
        <span>${escapeHtml(fmtDate(inv.invoiceDate || inv.issueDate))}</span>
        <span>${escapeHtml(fmtDate(inv.dueDate))}</span>
        <span>${escapeHtml(money(inv.total))}</span>
        <span>${escapeHtml(money(inv.paid))}</span>
        <span>${escapeHtml(money(inv.balance))}</span>
        <span>${escapeHtml(formatStatus(inv.arStatus || inv.status))}</span>
        <span class="status-cell">${inv.emailSent ? '<span class="status-check ok">&#10003;</span>' : '<span class="status-check muted">--</span>'}</span>
      `;
      invoicesTable.appendChild(div);
    });
  }

  function applyInvoiceFilters() {
    let rows = Array.isArray(invoicesCache) ? [...invoicesCache] : [];
    if (invoiceSearchTerm) {
      const term = invoiceSearchTerm.toLowerCase();
      rows = rows.filter((inv) =>
        [
          inv.invoiceNumber,
          inv.rentalOrderNumber,
          inv.rentalOrderId,
          inv.customerName,
          inv.invoiceDate,
          inv.issueDate,
          inv.dueDate,
          inv.total,
          inv.paid,
          inv.balance,
          inv.arStatus,
          inv.rentalOrderStatus,
        ]
          .filter((v) => v !== null && v !== undefined)
          .some((v) => String(v).toLowerCase().includes(term))
      );
    }

    if (invoiceShowOverdueOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      rows = rows.filter((inv) => {
        const bal = safeNum(inv.balance, 0);
        if (bal <= 0) return false;
        const due = inv.dueDate ? new Date(inv.dueDate) : null;
        if (!due || Number.isNaN(due.getTime())) return false;
        due.setHours(0, 0, 0, 0);
        return due < today;
      });
    }

    const dir = invoiceSortDir === "asc" ? 1 : -1;
    const norm = (v) => String(v || "").toLowerCase();
    const dateKey = (v) => {
      const t = Date.parse(v || "");
      return Number.isFinite(t) ? t : -Infinity;
    };
    const numKey = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : -Infinity;
    };
    const sortKey = (inv) => {
      switch (invoiceSortField) {
        case "invoiceNumber":
          return norm(inv.invoiceNumber);
        case "rentalOrderNumber":
          return norm(inv.rentalOrderNumber || (inv.rentalOrderId ? `#${inv.rentalOrderId}` : ""));
        case "customerName":
          return norm(inv.customerName);
        case "dueDate":
          return dateKey(inv.dueDate);
        case "total":
          return numKey(inv.total);
        case "paid":
          return numKey(inv.paid);
        case "balance":
          return numKey(inv.balance);
        case "arStatus":
          return norm(inv.arStatus);
        case "status":
          return norm(inv.rentalOrderStatus);
        case "invoiceDate":
        default:
          return dateKey(inv.invoiceDate || inv.issueDate);
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

  function renderCustomerDetailsPanel(customerId, summary) {
    if (!customerDetailsEl) return;
    const customer = customersCache.find((c) => Number(c.id) === Number(customerId));
    if (!activeCompanyId || !customer) {
      customerDetailsEl.style.display = "none";
      customerDetailsEl.innerHTML = "";
      return;
    }

    customerDetailsEl.style.display = "block";
    const addressParts = [
      customer.street_address,
      customer.city,
      customer.region,
      customer.country,
      customer.postal_code,
    ].filter(Boolean);
    const address = addressParts.join(", ");

    const item = (label, value) => `
      <div class="detail-item">
        <div class="detail-label">${escapeHtml(label)}</div>
        <div class="detail-value">${escapeHtml(value || "--")}</div>
      </div>`;

    const totalReceivables = summary?.totalReceivables ?? null;
    const overdue = summary?.overdue ?? null;
    const overdueCount = summary?.overdueCount ?? 0;
    const credit = summary?.credit ?? null;
    const aging = summary?.aging || null;
    const totalNum = totalReceivables === null ? null : safeNum(totalReceivables, 0);
    const overdueNum = overdue === null ? null : safeNum(overdue, 0);
    const creditNum = credit === null ? null : safeNum(credit, 0);
    const ratio = totalNum !== null && overdueNum !== null ? Math.max(0, Math.min(1, overdueNum / Math.max(totalNum, 0.01))) : 0;
    const pct = Math.round(ratio * 100);
    const severePct = pct >= 40;
    const severe60 = (aging?.buckets?.["61_90"]?.amount || 0) > 0 || (aging?.buckets?.["90_plus"]?.amount || 0) > 0;
    const statusTone = overdueNum > 0 ? (severe60 || severePct ? "danger" : "warn") : (totalNum > 0 ? "info" : "ok");
    const statusText =
      overdueNum > 0
        ? `Attention needed — ${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue`
        : totalNum > 0
          ? "Outstanding but not overdue"
          : creditNum > 0
            ? "Customer has credit"
            : "Paid on time";

    const segs = [];
    if (aging?.buckets && totalNum !== null) {
      const pushSeg = (key, label, cssClass, amount, count) => {
        const a = safeNum(amount, 0);
        const w = totalNum > 0 ? Math.max(0, (a / totalNum) * 100) : 0;
        segs.push({
          key,
          label,
          cssClass,
          amount: a,
          count: safeNum(count, 0),
          width: w,
        });
      };
      pushSeg("current", "Current (not overdue)", "current", aging.buckets.current?.amount, aging.buckets.current?.count);
      pushSeg("0_30", "0–30 days overdue", "d0", aging.buckets["0_30"]?.amount, aging.buckets["0_30"]?.count);
      pushSeg("31_60", "31–60 days overdue", "d1", aging.buckets["31_60"]?.amount, aging.buckets["31_60"]?.count);
      pushSeg("61_90", "61–90 days overdue", "d2", aging.buckets["61_90"]?.amount, aging.buckets["61_90"]?.count);
      pushSeg("90_plus", "90+ days overdue", "d3", aging.buckets["90_plus"]?.amount, aging.buckets["90_plus"]?.count);
    }

    customerDetailsEl.innerHTML = `
      <button class="icon-button" id="edit-customer-inline" aria-label="Edit customer" title="Edit customer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
      <div class="details-grid">
        ${item("Company", customer.company_name)}
        ${item("Contact", customer.contact_name)}
        ${item("Email", customer.email)}
        ${item("Phone", customer.phone)}
        ${item("Address", address)}
      </div>
      <div style="height: 6px;"></div>
      <div class="ar-summary">
        <div class="ar-summary-head">
          <div class="ar-summary-title">Accounts Receivable</div>
          <div class="ar-summary-sub">${escapeHtml(pct)}% overdue</div>
        </div>
        <div class="ar-summary-kpis">
          <div class="ar-kpi">
            <div class="ar-kpi-label">Total AR</div>
            <div class="ar-kpi-value">${totalReceivables === null ? "--" : escapeHtml(money(totalReceivables))}</div>
          </div>
          <div class="ar-kpi ${statusTone === "danger" ? "danger" : statusTone === "warn" ? "warn" : ""}">
            <div class="ar-kpi-label">Overdue</div>
            <div class="ar-kpi-value">${overdue === null ? "--" : escapeHtml(money(overdue))}</div>
          </div>
          <div class="ar-kpi">
            <div class="ar-kpi-label">Customer credit</div>
            <div class="ar-kpi-value">${credit === null ? "--" : escapeHtml(money(credit))}</div>
          </div>
        </div>
        <div class="ar-aging" title="Aging breakdown (hover segments for details)">
          ${
            segs.length
              ? segs
                  .filter((s) => s.width > 0.01)
                  .map(
                    (s) =>
                      `<div class="ar-aging-seg ${s.cssClass}" style="width:${s.width.toFixed(2)}%" title="${escapeHtml(s.label)} — ${escapeHtml(money(s.amount))} (${escapeHtml(String(s.count))} invoice${s.count === 1 ? "" : "s"})"></div>`
                  )
                  .join("")
              : ""
          }
        </div>
        <div class="ar-status ${statusTone}">
          <span class="ar-status-dot"></span>
          <span>Status: ${escapeHtml(statusText)}</span>
        </div>
        <div class="ar-actions">
          ${
            overdueNum > 0
              ? `<button class="ghost small" id="view-overdue" type="button">View overdue invoices</button>`
              : ""
          }
        </div>
      </div>
    `;

    const inlineBtn = customerDetailsEl.querySelector("#edit-customer-inline");
    inlineBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (!activeCompanyId || !customerId) return;
      const url = new URL("customers-form.html", window.location.origin);
      url.searchParams.set("id", String(customerId));
      url.searchParams.set("returnTo", "accounts-receivable.html");
      window.location.href = url.pathname + url.search;
    });

    const viewOverdueBtn = customerDetailsEl.querySelector("#view-overdue");
    viewOverdueBtn?.addEventListener("click", () => {
      invoiceShowOverdueOnly = true;
      renderInvoices(applyInvoiceFilters());
      invoicesTable?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      setMeta(invoicesMeta, "Showing overdue invoices only.");
    });
  }

  async function loadCustomerReceivables(customerId) {
    if (!activeCompanyId || !customerId) return null;
    const qs = new URLSearchParams({ companyId: String(activeCompanyId), customerId: String(customerId) });
    const res = await fetch(`/api/invoices?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load customer invoices.");
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const totalReceivables = invoices.reduce((sum, inv) => sum + safeNum(inv.balance, 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = invoices.reduce((sum, inv) => {
      const bal = safeNum(inv.balance, 0);
      if (bal <= 0) return sum;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!due || Number.isNaN(due.getTime())) return sum;
      due.setHours(0, 0, 0, 0);
      return due < today ? sum + bal : sum;
    }, 0);
    const overdueCount = invoices.reduce((count, inv) => {
      const bal = safeNum(inv.balance, 0);
      if (bal <= 0) return count;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!due || Number.isNaN(due.getTime())) return count;
      due.setHours(0, 0, 0, 0);
      return due < today ? count + 1 : count;
    }, 0);

    const buckets = {
      current: { amount: 0, count: 0 },
      "0_30": { amount: 0, count: 0 },
      "31_60": { amount: 0, count: 0 },
      "61_90": { amount: 0, count: 0 },
      "90_plus": { amount: 0, count: 0 },
    };

    invoices.forEach((inv) => {
      const bal = safeNum(inv.balance, 0);
      if (bal <= 0) return;
      const due = inv.dueDate ? new Date(inv.dueDate) : null;
      if (!due || Number.isNaN(due.getTime())) {
        buckets.current.amount += bal;
        buckets.current.count += 1;
        return;
      }
      due.setHours(0, 0, 0, 0);
      const daysLate = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
      if (daysLate <= 0) {
        buckets.current.amount += bal;
        buckets.current.count += 1;
      } else if (daysLate <= 30) {
        buckets["0_30"].amount += bal;
        buckets["0_30"].count += 1;
      } else if (daysLate <= 60) {
        buckets["31_60"].amount += bal;
        buckets["31_60"].count += 1;
      } else if (daysLate <= 90) {
        buckets["61_90"].amount += bal;
        buckets["61_90"].count += 1;
      } else {
        buckets["90_plus"].amount += bal;
        buckets["90_plus"].count += 1;
      }
    });

    let credit = null;
    try {
      const creditRes = await fetch(`/api/customers/${customerId}/credit?companyId=${activeCompanyId}`);
      const creditData = await creditRes.json().catch(() => ({}));
      if (creditRes.ok) credit = safeNum(creditData.credit, 0);
    } catch (_) {
      credit = null;
    }

    return { totalReceivables, overdue, overdueCount, credit, aging: { buckets } };
  }

  async function loadInvoices() {
    if (!activeCompanyId) return;
    setMeta(invoicesMeta, "");
    if (invoicesTable) invoicesTable.innerHTML = `<div class="table-row"><span class="hint" style="grid-column: 1 / -1;">Loading…</span></div>`;

    const customerId = customerFilter?.value ? String(customerFilter.value) : "";
    const rentalOrderId = orderFilter?.value ? String(orderFilter.value) : "";
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    if (customerId) qs.set("customerId", customerId);
    if (rentalOrderId) qs.set("rentalOrderId", rentalOrderId);
    const res = await fetch(`/api/invoices?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load invoices.");
    invoicesCache = Array.isArray(data.invoices) ? data.invoices : [];
    renderInvoices(applyInvoiceFilters());
  }

  invoicesTable?.addEventListener("click", (e) => {
    const sort = e.target?.closest?.("[data-sort]");
    if (sort) {
      const field = sort.getAttribute("data-sort");
      if (!field) return;
      if (invoiceSortField === field) {
        invoiceSortDir = invoiceSortDir === "asc" ? "desc" : "asc";
      } else {
        invoiceSortField = field;
        invoiceSortDir = field === "customerName" || field === "invoiceNumber" ? "asc" : "desc";
      }
      renderInvoices(applyInvoiceFilters());
      return;
    }

    const row = e.target?.closest?.(".table-row");
    if (!row || row.classList.contains("table-header")) return;
    const id = row.dataset.id;
    if (!id) return;
    const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `invoice.html?id=${encodeURIComponent(id)}&returnTo=${returnTo}`;
  });

  generateBtn?.addEventListener("click", async () => {
    if (!activeCompanyId) return;
    setMeta(generateMeta, "");
    try {
      const orderId = orderSelect?.value ? Number(orderSelect.value) : null;
      if (!orderId) throw new Error("Select a rental order.");
      const mode = modeSelect?.value || "auto";
      const res = await fetch(`/api/rental-orders/${orderId}/invoices/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to generate invoices.");
      const created = Array.isArray(data.created) ? data.created : [];
      setMeta(generateMeta, created.length ? `Created ${created.length} invoice(s).` : "No new invoices created.");
      await loadInvoices();
      await loadSummary();
    } catch (err) {
      setMeta(generateMeta, err?.message ? String(err.message) : String(err));
    }
  });

  customerFilter?.addEventListener("change", () => loadInvoices().catch((err) => setMeta(invoicesMeta, err.message)));
  orderFilter?.addEventListener("change", () => loadInvoices().catch((err) => setMeta(invoicesMeta, err.message)));
  invoiceSearch?.addEventListener("input", () => {
    invoiceSearchTerm = String(invoiceSearch.value || "").trim();
    invoiceShowOverdueOnly = false;
    renderInvoices(applyInvoiceFilters());
  });

  async function refreshCustomerPanel() {
    const customerId = customerFilter?.value ? Number(customerFilter.value) : null;
    if (!customerId) {
      renderCustomerDetailsPanel(null, null);
      return;
    }
    try {
      const summary = await loadCustomerReceivables(customerId);
      renderCustomerDetailsPanel(customerId, summary);
    } catch (err) {
      renderCustomerDetailsPanel(customerId, null);
      setMeta(invoicesMeta, err?.message ? String(err.message) : String(err));
    }
  }

  customerFilter?.addEventListener("change", () => refreshCustomerPanel());
  customerFilter?.addEventListener("change", () => {
    invoiceShowOverdueOnly = false;
    setMeta(invoicesMeta, "");
  });
  orderFilter?.addEventListener("change", () => {
    invoiceShowOverdueOnly = false;
    setMeta(invoicesMeta, "");
  });

  refreshBtn?.addEventListener("click", () => {
    loadCompanySettings()
      .then(() => Promise.all([loadSummary(), loadInvoices(), loadOrders()]))
      .then(() => setMeta(invoicesMeta, ""))
      .catch((err) => setMeta(invoicesMeta, err?.message || String(err)));
  });

  if (activeCompanyId) {
    loadCompanySettings()
      .then(() => Promise.all([loadCustomers(), loadOrders(), loadInvoices(), loadSummary()]))
      .then(() => refreshCustomerPanel())
      .catch((err) => {
        setMeta(invoicesMeta, err?.message || String(err));
      });
  }

});
