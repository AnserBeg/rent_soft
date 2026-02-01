const params = new URLSearchParams(window.location.search);
const documentId = params.get("id");
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const invoiceEmpty = document.getElementById("invoice-empty");
const invoiceDetail = document.getElementById("invoice-detail");
const invoiceType = document.getElementById("invoice-type");
const invoiceTitle = document.getElementById("invoice-title");
const invoiceSubtitle = document.getElementById("invoice-subtitle");
const invoiceSummary = document.getElementById("invoice-summary");
const invoiceOverview = document.getElementById("invoice-overview");
const invoiceAddresses = document.getElementById("invoice-addresses");
const invoiceLinesTable = document.getElementById("invoice-lines-table");
const invoiceLinesHint = document.getElementById("invoice-lines-hint");
const invoiceTotals = document.getElementById("invoice-totals");
const invoiceNotes = document.getElementById("invoice-notes");
const invoiceMeta = document.getElementById("invoice-meta");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;

function setCompanyMeta(message) {
  if (!companyMeta) return;
  companyMeta.textContent = String(message || "");
}

function setEmpty(message) {
  if (invoiceEmpty) {
    invoiceEmpty.textContent = String(message || "");
    invoiceEmpty.hidden = false;
  }
  if (invoiceDetail) invoiceDetail.hidden = true;
}

function showDetail() {
  if (invoiceEmpty) invoiceEmpty.hidden = true;
  if (invoiceDetail) invoiceDetail.hidden = false;
}

function fmtMoney(value) {
  if (value === null || value === undefined || value === "") return "--";
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function fmtNumber(value) {
  if (value === null || value === undefined || value === "") return "--";
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function fmtDate(value) {
  if (!value) return "--";
  const raw = String(value).trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

function docStatus(doc) {
  if (doc?.is_deleted) return "deleted";
  if (doc?.is_voided) return "voided";
  return doc?.status || "draft";
}

function parseRaw(raw) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw;
  return {};
}

function createDetailItem(label, value) {
  const item = document.createElement("div");
  item.className = "detail-item";
  const labelEl = document.createElement("div");
  labelEl.className = "detail-label";
  labelEl.textContent = label;
  const valueEl = document.createElement("div");
  valueEl.className = "detail-value";
  if (value instanceof Node) {
    valueEl.appendChild(value);
  } else {
    valueEl.textContent = value === null || value === undefined || value === "" ? "--" : String(value);
  }
  item.append(labelEl, valueEl);
  return item;
}

function buildAddressLines(addr) {
  if (!addr || typeof addr !== "object") return [];
  const lines = [];
  for (let i = 1; i <= 5; i += 1) {
    const line = addr[`Line${i}`];
    if (line) lines.push(String(line));
  }
  const cityParts = [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean);
  if (cityParts.length) lines.push(cityParts.join(", "));
  if (addr.Country) lines.push(String(addr.Country));
  return lines.filter(Boolean);
}

function renderAddressCard(title, addr) {
  const card = document.createElement("div");
  card.className = "invoice-address-card";
  const heading = document.createElement("div");
  heading.className = "invoice-address-title";
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "invoice-address-body";
  const lines = buildAddressLines(addr);
  if (!lines.length) {
    body.textContent = "--";
  } else {
    lines.forEach((line) => {
      const row = document.createElement("div");
      row.textContent = line;
      body.appendChild(row);
    });
  }
  card.append(heading, body);
  return card;
}

function renderSummary(doc, raw) {
  if (!invoiceSummary) return;
  invoiceSummary.innerHTML = "";
  const total = raw?.TotalAmt ?? doc?.total_amount;
  const balance = raw?.Balance ?? doc?.balance;
  const status = docStatus(doc);
  const totalRow = document.createElement("div");
  totalRow.className = "invoice-summary-row";
  const totalLabel = document.createElement("span");
  totalLabel.textContent = "Total";
  const totalValue = document.createElement("strong");
  totalValue.textContent = fmtMoney(total);
  totalRow.append(totalLabel, totalValue);

  const balanceRow = document.createElement("div");
  balanceRow.className = "invoice-summary-row";
  const balanceLabel = document.createElement("span");
  balanceLabel.textContent = "Balance";
  const balanceValue = document.createElement("strong");
  balanceValue.textContent = fmtMoney(balance);
  balanceRow.append(balanceLabel, balanceValue);

  const statusRow = document.createElement("div");
  statusRow.className = "invoice-summary-status";
  const statusPill = document.createElement("span");
  statusPill.className = "pill";
  statusPill.textContent = status;
  statusRow.appendChild(statusPill);

  invoiceSummary.append(totalRow, balanceRow, statusRow);
}

function renderOverview(doc, raw) {
  if (!invoiceOverview) return;
  invoiceOverview.innerHTML = "";
  const customerName = raw?.CustomerRef?.name || "";
  const customerId = raw?.CustomerRef?.value || doc?.customer_ref || "";
  const customerLabel =
    customerName && customerId && String(customerName) !== String(customerId)
      ? `${customerName} (ID ${customerId})`
      : customerName || customerId;
  const docNumber = raw?.DocNumber || doc?.doc_number || doc?.qbo_entity_id;
  const statusPill = document.createElement("span");
  statusPill.className = "pill";
  statusPill.textContent = docStatus(doc);
  const roLabel = doc?.ro_number || (doc?.rental_order_id ? `RO #${doc.rental_order_id}` : "");
  let roValue = "--";
  if (roLabel && doc?.rental_order_id) {
    const roLink = document.createElement("a");
    roLink.className = "ghost small";
    roLink.href = `rental-order-form.html?id=${encodeURIComponent(String(doc.rental_order_id))}`;
    roLink.textContent = roLabel;
    roValue = roLink;
  } else if (roLabel) {
    roValue = roLabel;
  }

  const items = [
    createDetailItem("Customer", customerLabel || "--"),
    createDetailItem("Doc #", docNumber || "--"),
    createDetailItem("Status", statusPill),
    createDetailItem("Txn Date", fmtDate(raw?.TxnDate || doc?.txn_date)),
    createDetailItem("Due Date", fmtDate(raw?.DueDate || doc?.due_date)),
    createDetailItem("Terms", raw?.SalesTermRef?.name || raw?.SalesTermRef?.value || "--"),
    createDetailItem("Currency", raw?.CurrencyRef?.value || doc?.currency_code || "--"),
    createDetailItem("PO Number", raw?.PONumber || "--"),
    createDetailItem("Email", raw?.BillEmail?.Address || raw?.BillEmail || "--"),
    createDetailItem("Billing Period", doc?.billing_period || "--"),
    createDetailItem("Rental Order", roValue),
  ];

  items.forEach((item) => invoiceOverview.appendChild(item));
}

function renderAddresses(raw) {
  if (!invoiceAddresses) return;
  invoiceAddresses.innerHTML = "";
  invoiceAddresses.append(
    renderAddressCard("Bill to", raw?.BillAddr),
    renderAddressCard("Ship to", raw?.ShipAddr)
  );
}

function getTaxTotal(raw) {
  const total = raw?.TxnTaxDetail?.TotalTax;
  if (total !== null && total !== undefined && total !== "") return Number(total);
  const lines = raw?.TxnTaxDetail?.TaxLine;
  if (!Array.isArray(lines) || !lines.length) return null;
  const sum = lines.reduce((acc, line) => {
    const amt = Number(line?.Amount || 0);
    if (!Number.isFinite(amt)) return acc;
    return acc + amt;
  }, 0);
  return Number.isFinite(sum) ? sum : null;
}

function getSubtotal(raw) {
  const lines = Array.isArray(raw?.Line) ? raw.Line : [];
  const subtotalLine = lines.find((line) => line?.DetailType === "SubTotalLineDetail" && line?.Amount !== undefined);
  if (subtotalLine?.Amount !== undefined) return Number(subtotalLine.Amount);
  if (raw?.SubTotal !== undefined) return Number(raw.SubTotal);
  if (raw?.Subtotal !== undefined) return Number(raw.Subtotal);
  return null;
}

function renderLineItems(raw) {
  if (!invoiceLinesTable) return;
  invoiceLinesTable.innerHTML = "";
  const header = document.createElement("div");
  header.className = "table-row table-header";
  ["Item", "Description", "Qty", "Rate", "Tax", "Amount"].forEach((title) => {
    const span = document.createElement("span");
    span.textContent = title;
    header.appendChild(span);
  });
  invoiceLinesTable.appendChild(header);

  const lines = Array.isArray(raw?.Line) ? raw.Line : [];
  if (!lines.length) {
    if (invoiceLinesHint) invoiceLinesHint.textContent = "No line items found for this document.";
    return;
  }
  if (invoiceLinesHint) invoiceLinesHint.textContent = "";

  const flattenLines = (items, depth = 0, output = []) => {
    items.forEach((line) => {
      if (!line) return;
      const detailType = String(line?.DetailType || "");
      output.push({ line, depth });
      if (detailType === "GroupLineDetail") {
        const children = line?.GroupLineDetail?.Line;
        if (Array.isArray(children) && children.length) {
          flattenLines(children, depth + 1, output);
        }
      }
    });
    return output;
  };

  flattenLines(lines).forEach(({ line, depth }) => {
    const detailType = String(line?.DetailType || "");
    const row = document.createElement("div");
    row.className = "table-row";
    if (detailType === "SubTotalLineDetail") row.classList.add("invoice-line-subtotal");
    if (detailType === "DiscountLineDetail") row.classList.add("invoice-line-discount");
    if (detailType === "GroupLineDetail") row.classList.add("invoice-line-group");

    let item = detailType || "Line";
    let description = line?.Description || "";
    let qty = "--";
    let rate = "--";
    let tax = "--";
    let amount = fmtMoney(line?.Amount);

    if (detailType === "SalesItemLineDetail") {
      const detail = line?.SalesItemLineDetail || {};
      item = detail?.ItemRef?.name || detail?.ItemRef?.value || "Item";
      qty = fmtNumber(detail?.Qty);
      rate = fmtMoney(detail?.UnitPrice);
      tax = detail?.TaxCodeRef?.value || "--";
    } else if (detailType === "GroupLineDetail") {
      const detail = line?.GroupLineDetail || {};
      item = detail?.GroupItemRef?.name || detail?.GroupItemRef?.value || "Group";
      if (!description) description = "Grouped items";
    } else if (detailType === "DiscountLineDetail") {
      const detail = line?.DiscountLineDetail || {};
      item = "Discount";
      if (detail?.PercentBased && detail?.DiscountPercent !== undefined) {
        description = `Discount ${fmtNumber(detail.DiscountPercent)}%`;
      } else if (!description) {
        description = "Discount";
      }
    } else if (detailType === "SubTotalLineDetail") {
      item = "Subtotal";
    } else if (detailType === "DescriptionOnly") {
      item = "Note";
    } else if (detailType === "TaxLineDetail") {
      item = "Tax";
    }

    const values = [item, description || "--", qty, rate, tax, amount];
    values.forEach((value, index) => {
      const span = document.createElement("span");
      span.textContent = value;
      if (index === 0 && depth > 0) {
        span.style.paddingLeft = `${depth * 14}px`;
      }
      row.appendChild(span);
    });

    invoiceLinesTable.appendChild(row);
  });
}

function renderTotals(raw, doc) {
  if (!invoiceTotals) return;
  invoiceTotals.innerHTML = "";
  const total = raw?.TotalAmt ?? doc?.total_amount;
  const balance = raw?.Balance ?? doc?.balance;
  const taxTotal = getTaxTotal(raw);
  let subtotal = getSubtotal(raw);

  if (subtotal === null && total !== null && total !== undefined && taxTotal !== null) {
    const computed = Number(total) - Number(taxTotal);
    subtotal = Number.isFinite(computed) ? computed : null;
  }

  const rows = [];
  if (subtotal !== null && subtotal !== undefined) rows.push({ label: "Subtotal", value: subtotal });
  if (taxTotal !== null && taxTotal !== undefined) rows.push({ label: "Tax", value: taxTotal });
  if (total !== null && total !== undefined) rows.push({ label: "Total", value: total, emphasis: true });
  if (balance !== null && balance !== undefined) rows.push({ label: "Balance", value: balance });

  if (!rows.length) {
    invoiceTotals.hidden = true;
    return;
  }
  invoiceTotals.hidden = false;

  const list = document.createElement("div");
  list.className = "invoice-totals-list";
  rows.forEach((row) => {
    const line = document.createElement("div");
    line.className = "invoice-totals-row";
    if (row.emphasis) line.classList.add("is-total");
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = fmtMoney(row.value);
    line.append(label, value);
    list.appendChild(line);
  });
  invoiceTotals.appendChild(list);
}

function renderNotes(raw) {
  if (!invoiceNotes) return;
  invoiceNotes.innerHTML = "";
  const notes = [];
  const customerMemo = raw?.CustomerMemo?.value;
  const privateNote = raw?.PrivateNote;
  if (customerMemo) notes.push({ label: "Customer memo", value: customerMemo });
  if (privateNote) notes.push({ label: "Private note", value: privateNote });
  if (!notes.length) {
    invoiceNotes.hidden = true;
    return;
  }
  invoiceNotes.hidden = false;
  notes.forEach((note) => {
    const block = document.createElement("div");
    block.className = "invoice-notes-block";
    const title = document.createElement("div");
    title.className = "invoice-notes-title";
    title.textContent = note.label;
    const body = document.createElement("div");
    body.className = "invoice-notes-body";
    body.textContent = note.value;
    block.append(title, body);
    invoiceNotes.appendChild(block);
  });
}

function renderMeta(doc, raw) {
  if (!invoiceMeta) return;
  invoiceMeta.innerHTML = "";
  const items = [
    createDetailItem("QBO Entity ID", raw?.Id || doc?.qbo_entity_id || "--"),
    createDetailItem("Sync Token", raw?.SyncToken || "--"),
    createDetailItem("Source", doc?.source || "--"),
    createDetailItem("Last Updated", fmtDateTime(doc?.last_updated_at)),
    createDetailItem("Last Synced", fmtDateTime(doc?.last_synced_at)),
    createDetailItem("Created", fmtDateTime(doc?.created_at)),
  ];
  items.forEach((item) => invoiceMeta.appendChild(item));
}

function renderDocument(doc) {
  const raw = parseRaw(doc?.raw);
  if (invoiceType) {
    const typeLabel = doc?.qbo_entity_type === "CreditMemo" ? "QuickBooks Credit Memo" : "QuickBooks Invoice";
    invoiceType.textContent = typeLabel;
  }
  if (invoiceTitle) {
    const title = doc?.qbo_entity_type === "CreditMemo" ? "Credit memo" : "Invoice";
    invoiceTitle.textContent = title;
  }
  if (invoiceSubtitle) {
    const docNumber = raw?.DocNumber || doc?.doc_number || doc?.qbo_entity_id || "";
    invoiceSubtitle.textContent = docNumber ? `Doc #${docNumber}` : "Document detail";
  }
  renderSummary(doc, raw);
  renderOverview(doc, raw);
  renderAddresses(raw);
  renderLineItems(raw);
  renderTotals(raw, doc);
  renderNotes(raw);
  renderMeta(doc, raw);
  showDetail();
}

async function loadDocument() {
  if (!activeCompanyId) {
    setEmpty("Log in to view invoices.");
    return;
  }
  if (!documentId) {
    setEmpty("Missing invoice id.");
    return;
  }
  setEmpty("Loading invoice details...");
  const res = await fetch(
    `/api/qbo/documents/${encodeURIComponent(String(documentId))}?companyId=${encodeURIComponent(String(activeCompanyId))}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setEmpty(data.error || "Unable to load invoice detail.");
    return;
  }
  if (!data.document) {
    setEmpty("Invoice not found.");
    return;
  }
  renderDocument(data.document);
}


if (activeCompanyId) {
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setCompanyMeta(companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`);
  loadDocument().catch((err) => setEmpty(err?.message || "Unable to load invoice detail."));
} else {
  setCompanyMeta("Log in to view invoices.");
  setEmpty("Log in to view invoices.");
}
