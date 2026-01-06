const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const initialCustomerId = params.get("id");
const returnTo = params.get("returnTo");
const returnSelect = params.get("returnSelect");
const returnOrderId = params.get("returnOrderId");

const companyMeta = document.getElementById("company-meta");
const modeLabel = document.getElementById("mode-label");
const formTitle = document.getElementById("form-title");
const deleteCustomerBtn = document.getElementById("delete-customer");
const customerForm = document.getElementById("customer-form");
const customerKindSelect = document.getElementById("customer-kind");
const parentCustomerRow = document.getElementById("parent-customer-row");
const parentCustomerSelect = document.getElementById("parent-customer-select");
const companyNameInput = customerForm?.querySelector('input[name="companyName"]');
const salesSelect = document.getElementById("sales-select");
const pricingTypeSelect = document.getElementById("pricing-type-select");
const pricingDaily = document.getElementById("pricing-daily");
const pricingWeekly = document.getElementById("pricing-weekly");
const pricingMonthly = document.getElementById("pricing-monthly");
const savePricingBtn = document.getElementById("save-pricing");
const pricingTable = document.getElementById("pricing-table");
const pricingSearchInput = document.getElementById("pricing-search");
const paymentTermsSelect = document.getElementById("payment-terms");
const contactsList = document.getElementById("contacts-list");
const addContactRowBtn = document.getElementById("add-contact-row");
const accountingContactsList = document.getElementById("accounting-contacts-list");
const addAccountingContactRowBtn = document.getElementById("add-accounting-contact-row");
const salesModal = document.getElementById("sales-modal");
const closeSalesModalBtn = document.getElementById("close-sales-modal");
const salesForm = document.getElementById("sales-form");
const canChargeDepositInput = customerForm?.querySelector('input[name="canChargeDeposit"]');

const openCustomerDocumentsBtn = document.getElementById("open-customer-documents");
const openCustomerVerificationBtn = document.getElementById("open-customer-verification");
const extrasDocsBadge = document.getElementById("extras-docs-badge");
const extrasCardBadge = document.getElementById("extras-card-badge");
const extrasDrawerOverlay = document.getElementById("extras-drawer-overlay");
const extrasDrawer = document.getElementById("extras-drawer");
const closeExtrasDrawerBtn = document.getElementById("close-extras-drawer");
const extrasDrawerSubtitle = document.getElementById("extras-drawer-subtitle");
const extrasTabButtons = Array.from(document.querySelectorAll(".drawer-tab"));
const extrasPanels = Array.from(document.querySelectorAll(".drawer-panel"));
const customerDocumentFile = document.getElementById("customer-document-file");
const uploadCustomerDocumentBtn = document.getElementById("upload-customer-document");
const customerDocumentHint = document.getElementById("customer-document-hint");
const customerDocumentsList = document.getElementById("customer-documents-list");
const customerStorefrontDocumentsList = document.getElementById("customer-storefront-documents-list");
const customerVerificationPanel = document.getElementById("customer-verification-panel");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let editingCustomerId = initialCustomerId ? Number(initialCustomerId) : null;
let customersCache = [];
let salesCache = [];
let typesCache = [];
let currentPricing = [];
let pricingSortField = "type_name";
let pricingSortDir = "asc";
let pricingSearchTerm = "";
let companyDefaultTermsDays = 30;

let customerExtras = { documents: [], storefront: null };
let extrasDrawerOpen = false;
let extrasActiveTab = "documents";

function normalizeTermsValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n === 30 || n === 60) return n;
  return null;
}

function updateModeLabels() {
  if (editingCustomerId) {
    modeLabel.textContent = `Edit customer #${editingCustomerId}`;
    formTitle.textContent = "Edit customer";
    deleteCustomerBtn.style.display = "inline-flex";
  } else {
    modeLabel.textContent = "New customer";
    formTitle.textContent = "Customer details";
    deleteCustomerBtn.style.display = "none";
  }
}

function normalizeContactValue(value) {
  const clean = String(value ?? "").trim();
  return clean;
}

function normalizeInvoiceFlag(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return false;
  return ["true", "1", "yes", "y", "on"].includes(raw);
}

function parseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

function findCustomerById(value) {
  const id = Number(value);
  if (!Number.isFinite(id)) return null;
  return customersCache.find((c) => Number(c.id) === id) || null;
}

function getParentCandidates() {
  return customersCache.filter((c) => !c.parent_customer_id && Number(c.id) !== Number(editingCustomerId));
}

function renderParentOptions() {
  if (!parentCustomerSelect) return;
  const current = parentCustomerSelect.value;
  const options = getParentCandidates();
  parentCustomerSelect.innerHTML = `<option value="">Select parent customer</option>`;
  options.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.company_name || `Customer #${c.id}`;
    parentCustomerSelect.appendChild(opt);
  });
  if (current) parentCustomerSelect.value = current;
}

function setBranchMode(isBranch) {
  if (parentCustomerRow) parentCustomerRow.style.display = isBranch ? "block" : "none";
  if (parentCustomerSelect) {
    parentCustomerSelect.disabled = !isBranch;
    if (!isBranch) parentCustomerSelect.value = "";
  }
  if (companyNameInput) companyNameInput.disabled = isBranch;
  if (canChargeDepositInput) canChargeDepositInput.disabled = isBranch;
  if (paymentTermsSelect) paymentTermsSelect.disabled = isBranch;
}

function applyParentDefaults(parentId) {
  const parent = findCustomerById(parentId);
  if (!parent) return;
  if (companyNameInput) companyNameInput.value = parent.company_name || "";
  if (canChargeDepositInput) {
    canChargeDepositInput.checked = !!(parent.effective_can_charge_deposit ?? parent.can_charge_deposit);
  }
  if (paymentTermsSelect) {
    const terms = normalizeTermsValue(parent.effective_payment_terms_days ?? parent.payment_terms_days);
    paymentTermsSelect.value = terms ? String(terms) : "";
  }
}

async function ensureCustomersCache() {
  if (!activeCompanyId) return;
  if (customersCache.length) return;
  const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch customers");
  const data = await res.json();
  customersCache = data.customers || [];
  renderParentOptions();
}

function updateContactRemoveButtons(list) {
  if (!list) return;
  const rows = list.querySelectorAll(".contact-row");
  const canRemove = rows.length > 1;
  rows.forEach((row) => {
    const btn = row.querySelector(".contact-remove");
    if (btn) btn.style.display = canRemove ? "inline-flex" : "none";
  });
}

function addContactRow(
  list,
  { name = "", email = "", phone = "", invoiceEmail = false } = {},
  { focus = false, includeInvoice = false } = {}
) {
  if (!list) return;
  const row = document.createElement("div");
  row.className = "contact-row";
  const invoiceMarkup = includeInvoice
    ? `
      <div class="inline invoice-toggle">
        <input type="checkbox" data-contact-field="invoiceEmail" />
        <span class="hint">Email invoices</span>
      </div>
    `
    : "";
  row.innerHTML = `
    <label>Contact name <input data-contact-field="name" /></label>
    <label>Email <input data-contact-field="email" type="email" /></label>
    <label>Phone number <input data-contact-field="phone" /></label>
    ${invoiceMarkup}
    <button type="button" class="ghost small contact-remove" aria-label="Remove contact">Remove</button>
  `;
  const nameInput = row.querySelector('[data-contact-field="name"]');
  const emailInput = row.querySelector('[data-contact-field="email"]');
  const phoneInput = row.querySelector('[data-contact-field="phone"]');
  const invoiceInput = row.querySelector('[data-contact-field="invoiceEmail"]');
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = email;
  if (phoneInput) phoneInput.value = phone;
  if (invoiceInput) invoiceInput.checked = !!invoiceEmail;
  list.appendChild(row);
  updateContactRemoveButtons(list);
  if (focus && nameInput) nameInput.focus();
}

function setContactRows(list, rows, { includeInvoice = false } = {}) {
  if (!list) return;
  list.innerHTML = "";
  const normalized = Array.isArray(rows) && rows.length ? rows : [{ name: "", email: "", phone: "" }];
  normalized.forEach((row) => {
    addContactRow(
      list,
      {
        name: normalizeContactValue(row?.name || row?.contactName || row?.contact_name),
        email: normalizeContactValue(row?.email),
        phone: normalizeContactValue(row?.phone),
        invoiceEmail: normalizeInvoiceFlag(
          row?.invoiceEmail ?? row?.invoice_email ?? row?.emailInvoices ?? row?.sendInvoices ?? row?.send_invoices
        ),
      },
      { focus: false, includeInvoice }
    );
  });
}

function collectContacts(list, { includeInvoice = false } = {}) {
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll(".contact-row"));
  return rows
    .map((row) => {
      const name = normalizeContactValue(row.querySelector('[data-contact-field="name"]')?.value);
      const email = normalizeContactValue(row.querySelector('[data-contact-field="email"]')?.value);
      const phone = normalizeContactValue(row.querySelector('[data-contact-field="phone"]')?.value);
      const invoiceEmail = includeInvoice ? row.querySelector('[data-contact-field="invoiceEmail"]')?.checked === true : false;
      if (!name && !email && !phone && !invoiceEmail) return null;
      if (includeInvoice) return { name, email, phone, invoiceEmail };
      return { name, email, phone };
    })
    .filter(Boolean);
}

function applyPricingFilters() {
  let rows = [...(currentPricing || [])];
  if (pricingSearchTerm) {
    const term = pricingSearchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.type_name, r.daily_rate, r.weekly_rate, r.monthly_rate]
        .filter((v) => v !== null && v !== undefined && v !== "")
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }

  const dir = pricingSortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -Infinity;
  };
  const sortKey = (row) => {
    switch (pricingSortField) {
      case "daily_rate":
      case "weekly_rate":
      case "monthly_rate":
        return num(row[pricingSortField]);
      default:
        return norm(row[pricingSortField]);
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

function setExtrasTab(tab) {
  const next = ["documents", "verification"].includes(String(tab)) ? String(tab) : "documents";
  extrasActiveTab = next;
  extrasTabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === next);
  });
  extrasPanels.forEach((panel) => {
    panel.style.display = panel.getAttribute("data-panel") === next ? "block" : "none";
  });
}

function syncExtrasDisabledState() {
  const canUse = !!(activeCompanyId && editingCustomerId);
  if (customerDocumentHint) {
    customerDocumentHint.textContent = canUse ? "" : "Save the customer first to enable uploads.";
  }
  if (uploadCustomerDocumentBtn) uploadCustomerDocumentBtn.disabled = !canUse;
  if (extrasDrawerSubtitle) {
    extrasDrawerSubtitle.textContent = editingCustomerId ? `Customer #${editingCustomerId}` : "New customer (save first)";
  }
}

function openExtrasDrawer(tab) {
  if (!extrasDrawer || !extrasDrawerOverlay) return;
  extrasDrawerOpen = true;
  extrasDrawerOverlay.style.display = "block";
  extrasDrawer.classList.add("open");
  extrasDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  syncExtrasDisabledState();
  setExtrasTab(tab || extrasActiveTab);
}

function closeExtrasDrawer() {
  if (!extrasDrawer || !extrasDrawerOverlay) return;
  extrasDrawerOpen = false;
  extrasDrawerOverlay.style.display = "none";
  extrasDrawer.classList.remove("open");
  extrasDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

async function uploadFile({ file }) {
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("file", file);
  const res = await fetch("/api/uploads/file", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload file");
  if (!data.url) throw new Error("Upload did not return a url");
  return data;
}

async function deleteUploadedFile(url) {
  if (!url) return;
  const res = await fetch("/api/uploads/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete file");
}

function storefrontDocsToRows(storefront) {
  const docs = storefront?.documents && typeof storefront.documents === "object" ? storefront.documents : {};
  const rows = [];
  Object.entries(docs).forEach(([key, value]) => {
    if (!value || typeof value !== "object") return;
    const url = String(value.url || "").trim();
    if (!url) return;
    rows.push({
      key,
      url,
      fileName: value.fileName || value.file_name || key,
      mime: value.mime || "",
      sizeBytes: value.sizeBytes || value.size_bytes || null,
    });
  });
  return rows;
}

function renderCustomerDocuments() {
  if (customerDocumentsList) customerDocumentsList.innerHTML = "";
  if (customerStorefrontDocumentsList) customerStorefrontDocumentsList.innerHTML = "";

  const internal = Array.isArray(customerExtras?.documents) ? customerExtras.documents : [];
  internal.forEach((d) => {
    const div = document.createElement("div");
    div.className = "attachment-row";
    div.dataset.documentId = d.id;
    div.innerHTML = `
      <a href="${d.url}" target="_blank" rel="noopener">${d.file_name}</a>
      <span class="hint">${d.mime || ""}${d.size_bytes ? ` • ${Math.round(d.size_bytes / 1024)} KB` : ""}</span>
      <button class="ghost small danger" data-remove-document="${d.id}" data-url="${d.url}">Remove</button>
    `;
    customerDocumentsList?.appendChild(div);
  });

  if (!internal.length && customerDocumentsList) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = editingCustomerId ? "No documents uploaded yet." : "Save the customer to add documents.";
    customerDocumentsList.appendChild(empty);
  }

  const storefrontRows = storefrontDocsToRows(customerExtras?.storefront);
  storefrontRows.forEach((d) => {
    const div = document.createElement("div");
    div.className = "attachment-row";
    div.innerHTML = `
      <a href="${d.url}" target="_blank" rel="noopener">${d.fileName || d.key}</a>
      <span class="hint">${d.key}${d.mime ? ` • ${d.mime}` : ""}${d.sizeBytes ? ` • ${Math.round(Number(d.sizeBytes) / 1024)} KB` : ""}</span>
      <span></span>
    `;
    customerStorefrontDocumentsList?.appendChild(div);
  });

  if (!storefrontRows.length && customerStorefrontDocumentsList) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "None on file from storefront signup.";
    customerStorefrontDocumentsList.appendChild(empty);
  }

  const docsCount = internal.length + storefrontRows.length;
  if (extrasDocsBadge) {
    extrasDocsBadge.textContent = String(docsCount);
    extrasDocsBadge.style.display = docsCount > 0 ? "inline-flex" : "none";
  }
}

function renderCustomerVerification() {
  if (!customerVerificationPanel) return;
  const sf = customerExtras?.storefront || null;
  const cardOk = !!sf?.hasCardOnFile;
  const last4 = sf?.ccLast4 ? String(sf.ccLast4) : null;
  const email = sf?.email ? String(sf.email) : null;

  if (extrasCardBadge) {
    extrasCardBadge.textContent = cardOk ? "Card" : "";
    extrasCardBadge.style.display = cardOk ? "inline-flex" : "none";
  }

  const rows = [];
  rows.push(`<div class="detail-item"><div class="detail-label">Credit card</div><div class="detail-value">${cardOk ? `On file${last4 ? ` (•••• ${last4})` : ""}` : "Not on file"}</div></div>`);
  rows.push(`<div class="detail-item"><div class="detail-label">Storefront account</div><div class="detail-value">${sf ? (email || `Customer #${sf.storefrontCustomerId}`) : "Not linked"}</div></div>`);
  customerVerificationPanel.innerHTML = rows.join("");
}

async function loadCustomerExtras() {
  if (!activeCompanyId || !editingCustomerId) {
    customerExtras = { documents: [], storefront: null };
    renderCustomerDocuments();
    renderCustomerVerification();
    syncExtrasDisabledState();
    return;
  }
  const res = await fetch(`/api/customers/${editingCustomerId}/extras?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load customer extras");
  customerExtras = {
    documents: Array.isArray(data.documents) ? data.documents : [],
    storefront: data.storefront || null,
  };
  renderCustomerDocuments();
  renderCustomerVerification();
  syncExtrasDisabledState();
}

function renderPricing() {
  const indicator = (field) => {
    if (pricingSortField !== field) return "";
    return pricingSortDir === "asc" ? "^" : "v";
  };

  pricingTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${pricingSortField === "type_name" ? "active" : ""}" data-sort="type_name">Type ${indicator("type_name")}</span>
      <span class="sort ${pricingSortField === "daily_rate" ? "active" : ""}" data-sort="daily_rate">Daily ${indicator("daily_rate")}</span>
      <span class="sort ${pricingSortField === "weekly_rate" ? "active" : ""}" data-sort="weekly_rate">Weekly ${indicator("weekly_rate")}</span>
      <span class="sort ${pricingSortField === "monthly_rate" ? "active" : ""}" data-sort="monthly_rate">Monthly ${indicator("monthly_rate")}</span>
      <span></span>
    </div>`;
  const fmt = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toFixed(2)}`);

  applyPricingFilters().forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.typeId = row.type_id;
    const actionCell = row.is_inherited
      ? `<span class="hint">Inherited</span>`
      : `<button class="ghost small" data-remove="${row.type_id}">Remove</button>`;
    div.innerHTML = `
      <span>${row.type_name || "--"}</span>
      <span>${fmt(row.daily_rate)}</span>
      <span>${fmt(row.weekly_rate)}</span>
      <span>${fmt(row.monthly_rate)}</span>
      ${actionCell}
    `;
    pricingTable.appendChild(div);
  });
}

async function loadSales() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/sales-people?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch sales people");
    const data = await res.json();
    salesCache = data.sales || [];
    salesSelect.innerHTML = `<option value="">Select sales person</option>`;
    salesCache.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      salesSelect.appendChild(opt);
    });
    const addOpt = document.createElement("option");
    addOpt.value = "__new_sales__";
    addOpt.textContent = "+ Add sales person...";
    salesSelect.appendChild(addOpt);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadCompanySettings() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const terms = normalizeTermsValue(data.settings?.default_payment_terms_days) || 30;
    companyDefaultTermsDays = terms;
    if (paymentTermsSelect) {
      paymentTermsSelect.options[0].textContent = terms === 60 ? "Use company default (Net 60)" : "Use company default (Net 30)";
    }
  } catch {
    // ignore
  }
}

async function loadTypes() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment-types?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch types");
    const data = await res.json();
    typesCache = data.types || [];
    pricingTypeSelect.innerHTML = `<option value="">Select type</option>`;
    typesCache.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      pricingTypeSelect.appendChild(opt);
    });
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadPricing(customerId) {
  if (!activeCompanyId || !customerId) return;
  try {
    const res = await fetch(`/api/customers/${customerId}/pricing?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch pricing");
    const data = await res.json();
    currentPricing = data.pricing || [];
    renderPricing();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadCustomer() {
  if (!activeCompanyId || !editingCustomerId) return;
  try {
    await ensureCustomersCache();
    const customer = customersCache.find((c) => Number(c.id) === Number(editingCustomerId));
    if (!customer) {
      companyMeta.textContent = "Customer not found for this company.";
      return;
    }
    customerForm.companyName.value = customer.company_name || "";
    const contactRows = parseContacts(customer.contacts);
    if (!contactRows.length && (customer.contact_name || customer.email || customer.phone)) {
      contactRows.push({
        name: customer.contact_name || "",
        email: customer.email || "",
        phone: customer.phone || "",
      });
    }
    setContactRows(contactsList, contactRows);
    setContactRows(accountingContactsList, parseContacts(customer.accounting_contacts), { includeInvoice: true });
    customerForm.streetAddress.value = customer.street_address || "";
    customerForm.city.value = customer.city || "";
    customerForm.region.value = customer.region || "";
    customerForm.country.value = customer.country || "";
    customerForm.postalCode.value = customer.postal_code || "";
    customerForm.notes.value = customer.notes || "";
    if (canChargeDepositInput) canChargeDepositInput.checked = !!customer.can_charge_deposit;
    if (paymentTermsSelect) {
      const terms = normalizeTermsValue(customer.payment_terms_days);
      paymentTermsSelect.value = terms ? String(terms) : "";
    }
    customerForm.followUpDate.value = customer.follow_up_date ? customer.follow_up_date.split("T")[0] : "";
    salesSelect.value = customer.sales_person_id || "";
    const isBranch = !!customer.parent_customer_id;
    if (customerKindSelect) customerKindSelect.value = isBranch ? "branch" : "standalone";
    if (parentCustomerSelect) parentCustomerSelect.value = isBranch ? String(customer.parent_customer_id) : "";
    setBranchMode(isBranch);
    if (isBranch) applyParentDefaults(customer.parent_customer_id);
    await loadPricing(editingCustomerId);
    await loadCustomerExtras();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

customerKindSelect?.addEventListener("change", () => {
  const isBranch = customerKindSelect.value === "branch";
  setBranchMode(isBranch);
  if (!isBranch) return;
  renderParentOptions();
  if (parentCustomerSelect && !parentCustomerSelect.value) {
    const first = getParentCandidates()[0];
    if (first) parentCustomerSelect.value = String(first.id);
  }
  if (parentCustomerSelect) applyParentDefaults(parentCustomerSelect.value);
});

parentCustomerSelect?.addEventListener("change", () => {
  if (customerKindSelect?.value !== "branch") return;
  applyParentDefaults(parentCustomerSelect.value);
});

customerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  const payload = Object.fromEntries(new FormData(customerForm).entries());
  const contacts = collectContacts(contactsList);
  const accountingContacts = collectContacts(accountingContactsList, { includeInvoice: true });
  const primaryContact = contacts[0] || {};
  payload.contacts = contacts;
  payload.accountingContacts = accountingContacts;
  payload.contactName = primaryContact.name || null;
  payload.email = primaryContact.email || null;
  payload.phone = primaryContact.phone || null;
  payload.companyId = activeCompanyId;
  payload.canChargeDeposit = !!canChargeDepositInput?.checked;
  const rawTerms = payload.paymentTermsDays;
  payload.paymentTermsDays = rawTerms === undefined || rawTerms === "" ? null : Number(rawTerms);
  const isBranch = customerKindSelect?.value === "branch";
  if (isBranch) {
    const parentId = parentCustomerSelect?.value ? Number(parentCustomerSelect.value) : null;
    if (!parentId) {
      companyMeta.textContent = "Select a parent customer for this branch.";
      return;
    }
    payload.parentCustomerId = parentId;
    if (companyNameInput) payload.companyName = companyNameInput.value;
  } else {
    payload.parentCustomerId = null;
  }
  if (payload.salesPersonId === "__new_sales__") {
    openSalesModal();
    return;
  }
  if (payload.salesPersonId === "") payload.salesPersonId = null;
  const isEdit = !!editingCustomerId;
  try {
    const res = await fetch(isEdit ? `/api/customers/${editingCustomerId}` : "/api/customers", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to save customer");
    }
    const saved = await res.json();
    companyMeta.textContent = isEdit ? "Customer updated." : "Customer added.";
    if (!isEdit && saved?.id && returnTo && returnSelect === "customer") {
      const url = new URL(returnTo, window.location.origin);
      url.searchParams.set("selectedCustomerId", String(saved.id));
      if (returnOrderId) url.searchParams.set("id", String(returnOrderId));
      window.location.href = url.pathname + url.search;
      return;
    }
    if (!isEdit && saved?.id) {
      editingCustomerId = saved.id;
      updateModeLabels();
      const url = new URL(window.location.href);
      url.searchParams.set("id", saved.id);
      window.history.replaceState({}, "", url.toString());
      await loadPricing(editingCustomerId);
      await loadCustomerExtras();
    }
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

deleteCustomerBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingCustomerId || !activeCompanyId) return;
  try {
    const res = await fetch(`/api/customers/${editingCustomerId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to delete customer");
    }
    companyMeta.textContent = "Customer deleted. Returning to list.";
    setTimeout(() => {
      window.location.href = `customers.html`;
    }, 600);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

savePricingBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingCustomerId || !activeCompanyId) {
    companyMeta.textContent = "Save the customer first.";
    return;
  }
  const typeId = pricingTypeSelect.value;
  if (!typeId) {
    companyMeta.textContent = "Select a type for pricing.";
    return;
  }
  const body = {
    companyId: activeCompanyId,
    typeId: Number(typeId),
    dailyRate: pricingDaily.value === "" ? null : Number(pricingDaily.value),
    weeklyRate: pricingWeekly.value === "" ? null : Number(pricingWeekly.value),
    monthlyRate: pricingMonthly.value === "" ? null : Number(pricingMonthly.value),
  };
  try {
    const res = await fetch(`/api/customers/${editingCustomerId}/pricing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to save pricing");
    }
    companyMeta.textContent = "Special pricing saved.";
    pricingDaily.value = "";
    pricingWeekly.value = "";
    pricingMonthly.value = "";
    await loadPricing(editingCustomerId);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

pricingTable.addEventListener("click", async (e) => {
  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (pricingSortField === sort) pricingSortDir = pricingSortDir === "asc" ? "desc" : "asc";
    else {
      pricingSortField = sort;
      pricingSortDir = sort === "type_name" ? "asc" : "desc";
    }
    renderPricing();
    return;
  }

  const removeId = e.target.getAttribute("data-remove");
  if (!removeId || !editingCustomerId || !activeCompanyId) return;
  try {
    const res = await fetch(`/api/customers/${editingCustomerId}/pricing/${removeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to delete pricing");
    }
    companyMeta.textContent = "Special pricing removed.";
    await loadPricing(editingCustomerId);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

pricingSearchInput?.addEventListener("input", (e) => {
  pricingSearchTerm = String(e.target.value || "");
  renderPricing();
});

salesSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new_sales__") {
    e.target.value = "";
    openSalesModal();
  }
});

addContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(contactsList, {}, { focus: true });
});

contactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".contact-remove");
  if (!btn) return;
  e.preventDefault();
  const row = btn.closest(".contact-row");
  if (row) row.remove();
  updateContactRemoveButtons(contactsList);
});

addAccountingContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(accountingContactsList, {}, { focus: true });
});

accountingContactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".contact-remove");
  if (!btn) return;
  e.preventDefault();
  const row = btn.closest(".contact-row");
  if (row) row.remove();
  updateContactRemoveButtons(accountingContactsList);
});

function openSalesModal() {
  salesModal.classList.add("show");
}

function closeSalesModal() {
  salesModal.classList.remove("show");
  salesForm.reset();
}

closeSalesModalBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeSalesModal();
});

salesModal.addEventListener("click", (e) => {
  if (e.target === salesModal) closeSalesModal();
});

salesForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  const payload = Object.fromEntries(new FormData(salesForm).entries());
  payload.companyId = activeCompanyId;
  try {
    const res = await fetch("/api/sales-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to add sales person");
    }
    const saved = await res.json();
    companyMeta.textContent = "Sales person added.";
    closeSalesModal();
    await loadSales();
    if (saved?.id) salesSelect.value = saved.id;
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

openCustomerDocumentsBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openExtrasDrawer("documents");
});

openCustomerVerificationBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openExtrasDrawer("verification");
});

closeExtrasDrawerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeExtrasDrawer();
});

extrasDrawerOverlay?.addEventListener("click", () => closeExtrasDrawer());
extrasTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => setExtrasTab(btn.getAttribute("data-tab")));
});

uploadCustomerDocumentBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingCustomerId || !activeCompanyId) {
    if (customerDocumentHint) customerDocumentHint.textContent = "Save the customer first to enable uploads.";
    return;
  }
  const file = customerDocumentFile?.files?.[0];
  if (!file) {
    if (customerDocumentHint) customerDocumentHint.textContent = "Choose a file to upload.";
    return;
  }
  try {
    const uploaded = await uploadFile({ file });
    const res = await fetch(`/api/customers/${editingCustomerId}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        fileName: uploaded.fileName,
        mime: uploaded.mime,
        sizeBytes: uploaded.sizeBytes,
        url: uploaded.url,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save document");
    if (customerDocumentFile) customerDocumentFile.value = "";
    if (customerDocumentHint) customerDocumentHint.textContent = "";
    await loadCustomerExtras();
  } catch (err) {
    if (customerDocumentHint) customerDocumentHint.textContent = err.message;
  }
});

customerDocumentsList?.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-remove-document");
  const url = e.target.getAttribute("data-url");
  if (!id || !editingCustomerId || !activeCompanyId) return;
  e.preventDefault();
  try {
    await deleteUploadedFile(url).catch(() => {});
    await fetch(`/api/customers/${editingCustomerId}/documents/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    await loadCustomerExtras();
  } catch (err) {
    if (customerDocumentHint) customerDocumentHint.textContent = err.message;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (extrasDrawerOpen) closeExtrasDrawer();
});

// Init
updateModeLabels();
if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  companyMeta.textContent = companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`;
  loadCompanySettings();
  loadSales();
  loadTypes();
  setContactRows(contactsList, []);
  setContactRows(accountingContactsList, [], { includeInvoice: true });
  setBranchMode(false);
  ensureCustomersCache().catch((err) => {
    companyMeta.textContent = err.message;
  });
  if (editingCustomerId) {
    loadCustomer();
  } else {
    loadCustomerExtras().catch(() => {});
  }
} else {
  companyMeta.textContent = "Log in to continue.";
}
