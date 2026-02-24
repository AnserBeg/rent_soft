const updatesTable = document.getElementById("updates-table");
const updatesMeta = document.getElementById("updates-meta");
const detailCard = document.getElementById("detail-card");
const detailBody = document.getElementById("detail-body");
const detailMeta = document.getElementById("detail-meta");
const detailHint = document.getElementById("detail-hint");
const applyUpdateBtn = document.getElementById("apply-update");
const rejectUpdateBtn = document.getElementById("reject-update");
const backToOrderBtn = document.getElementById("back-to-order");
const backToCustomerBtn = document.getElementById("back-to-customer");

const viewParams = new URLSearchParams(window.location.search);
const statusParam = String(viewParams.get("status") || "").trim().toLowerCase();
const rentalOrderIdParam = String(viewParams.get("rentalOrderId") || viewParams.get("orderId") || "").trim();
const customerIdParam = String(viewParams.get("customerId") || viewParams.get("customer") || "").trim();
const STATUS_ALLOWED = new Set(["pending", "accepted", "rejected"]);
const STATUS_ALL_TOKENS = new Set(["all", "any", "*"]);
const SERVICE_AGREEMENT_CATEGORY = "Service Agreement";
const hasStatusParam = viewParams.has("status");
let statusFilter = "pending";
if (hasStatusParam) {
  if (!statusParam || STATUS_ALL_TOKENS.has(statusParam)) {
    statusFilter = null;
  } else if (STATUS_ALLOWED.has(statusParam)) {
    statusFilter = statusParam;
  }
}

const companyIdParam = viewParams.get("companyId");
const initialCompanyId = companyIdParam || window.RentSoft?.getCompanyId?.();
let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let requestsCache = [];
let activeRequest = null;
let canReviewCustomer = false;
let canReviewOrder = false;
let selectionState = null;

const DEFAULT_CONTACT_CATEGORIES = [
  { key: "contacts", label: "Contacts" },
  { key: "accountingContacts", label: "Accounting contacts" },
];
let contactCategoryConfig = DEFAULT_CONTACT_CATEGORIES;
let contactCategoriesPromise = null;

function resetSelectionState() {
  selectionState = {
    customerFields: new Set(),
    orderFields: new Set(),
    lineItemKeys: new Set(),
    lineItemMeta: new Map(),
    customerAvailable: new Set(),
    orderAvailable: new Set(),
    lineItemAvailable: new Set(),
  };
}

function setFieldSelection(section, key, checked) {
  if (!section || !key || !selectionState) return;
  if (section === "customer") {
    if (checked) selectionState.customerFields.add(key);
    else selectionState.customerFields.delete(key);
    return;
  }
  if (section === "order") {
    if (checked) selectionState.orderFields.add(key);
    else selectionState.orderFields.delete(key);
    return;
  }
  if (section === "lineItem") {
    if (checked) selectionState.lineItemKeys.add(key);
    else selectionState.lineItemKeys.delete(key);
  }
}

function registerFieldAvailability(section, key) {
  if (!section || !key || !selectionState) return;
  if (section === "customer") selectionState.customerAvailable.add(key);
  else if (section === "order") selectionState.orderAvailable.add(key);
  else if (section === "lineItem") selectionState.lineItemAvailable.add(key);
}

function updateAcceptButtons() {
  if (applyUpdateBtn) {
    const requiresCustomerSelection = canReviewCustomer && (selectionState?.customerAvailable?.size || 0) > 0;
    const requiresOrderSelection =
      canReviewOrder &&
      ((selectionState?.orderAvailable?.size || 0) > 0 || (selectionState?.lineItemAvailable?.size || 0) > 0);
    const requiresSelection = requiresCustomerSelection || requiresOrderSelection;
    const hasSelection =
      (selectionState?.customerFields?.size || 0) > 0 ||
      (selectionState?.orderFields?.size || 0) > 0 ||
      (selectionState?.lineItemKeys?.size || 0) > 0;
    applyUpdateBtn.disabled = !(canReviewCustomer || canReviewOrder) || (requiresSelection && !hasSelection);
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { credentials: "include", ...options });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    const hint = text && text.length < 200 ? ` ${text}` : "";
    throw new Error(`API response was not JSON.${hint}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function fmtDate(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeReviewStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return status === "pending" || status === "accepted" || status === "rejected" ? status : null;
}

function setBackToOrderTarget(orderId) {
  if (!backToOrderBtn) return;
  const id = String(orderId || "").trim();
  if (!id) {
    backToOrderBtn.style.display = "none";
    backToOrderBtn.dataset.orderId = "";
    return;
  }
  backToOrderBtn.dataset.orderId = id;
  backToOrderBtn.style.display = "inline-flex";
}

function setBackToCustomerTarget(customerId) {
  if (!backToCustomerBtn) return;
  const id = String(customerId || "").trim();
  if (!id) {
    backToCustomerBtn.style.display = "none";
    backToCustomerBtn.dataset.customerId = "";
    return;
  }
  backToCustomerBtn.dataset.customerId = id;
  backToCustomerBtn.style.display = "inline-flex";
}

function closeDetailCard() {
  activeRequest = null;
  if (detailBody) detailBody.innerHTML = "";
  if (detailMeta) detailMeta.textContent = "";
  if (detailHint) detailHint.textContent = "";
  if (applyUpdateBtn) applyUpdateBtn.disabled = true;
  if (rejectUpdateBtn) rejectUpdateBtn.disabled = true;
  if (detailCard) detailCard.style.display = "none";
  setBackToOrderTarget("");
  setBackToCustomerTarget("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const GENERAL_NOTES_ALLOWED_TAGS = new Set([
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "strike",
  "p",
  "br",
  "div",
  "span",
  "h1",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "font",
]);

const GENERAL_NOTES_ALLOWED_ATTRS = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "title"]),
  span: new Set(["style"]),
  div: new Set(["style"]),
  p: new Set(["style"]),
  h1: new Set(["style"]),
  h2: new Set(["style"]),
  h3: new Set(["style"]),
  li: new Set(["style"]),
  font: new Set(["size", "face", "color"]),
};

const GENERAL_NOTES_ALLOWED_STYLES = new Set([
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
  "color",
]);

const GENERAL_NOTES_ALLOWED_FONTS = new Set([
  "Inter",
  "Georgia",
  "Times New Roman",
  "Arial",
  "Verdana",
  "Courier New",
]);

function isSafeUrl(url, { allowDataImage = false } = {}) {
  if (!url) return false;
  const value = String(url || "").trim();
  if (!value) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) return false;
  if (lower.startsWith("data:")) {
    return allowDataImage && lower.startsWith("data:image/");
  }
  if (lower.startsWith("/uploads/")) return true;
  if (lower.startsWith("http://") || lower.startsWith("https://")) return true;
  return false;
}

function sanitizeRichText(html) {
  const raw = String(html || "");
  if (!raw.trim()) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const sanitizeStyle = (style) => {
    if (!style) return "";
    const parts = String(style)
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean);
    const cleaned = [];
    parts.forEach((entry) => {
      const idx = entry.indexOf(":");
      if (idx === -1) return;
      const prop = entry.slice(0, idx).trim().toLowerCase();
      let value = entry.slice(idx + 1).trim();
      if (!GENERAL_NOTES_ALLOWED_STYLES.has(prop)) return;
      if (!value || /url\s*\(/i.test(value) || /expression\s*\(/i.test(value)) return;
      if (prop === "font-family") {
        const family = value.replace(/['"]/g, "").split(",")[0].trim();
        if (!GENERAL_NOTES_ALLOWED_FONTS.has(family)) return;
        value = family;
      }
      if (prop === "font-size" && !/^\d+(px|pt|em|rem|%)?$/.test(value)) return;
      if (prop === "font-weight" && !/^(bold|normal|[1-9]00)$/.test(value)) return;
      if (prop === "text-align" && !/^(left|right|center|justify)$/.test(value)) return;
      if (prop === "text-decoration" && !/^(underline|line-through|none)$/.test(value)) return;
      if (prop === "color" && !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) && !/^rgb(a)?\(/i.test(value)) return;
      cleaned.push(`${prop}: ${value}`);
    });
    return cleaned.join("; ");
  };

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }
    const tag = node.tagName.toLowerCase();
    if (!GENERAL_NOTES_ALLOWED_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      while (node.firstChild) fragment.appendChild(node.firstChild);
      node.replaceWith(fragment);
      return;
    }
    const allowed = GENERAL_NOTES_ALLOWED_ATTRS[tag] || new Set();
    Array.from(node.attributes || []).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) {
        node.removeAttribute(attr.name);
        return;
      }
      if (!allowed.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === "href") {
        if (!isSafeUrl(value)) {
          node.removeAttribute(attr.name);
          return;
        }
        node.setAttribute("rel", "noopener noreferrer");
        node.setAttribute("target", "_blank");
      }
      if (name === "src") {
        if (!isSafeUrl(value, { allowDataImage: true })) {
          node.remove();
          return;
        }
      }
      if (name === "style") {
        const nextStyle = sanitizeStyle(value);
        if (nextStyle) node.setAttribute("style", nextStyle);
        else node.removeAttribute("style");
      }
      if (tag === "font" && name === "size") {
        const size = String(value || "").trim();
        if (!/^[1-7]$/.test(size)) node.removeAttribute("size");
      }
      if (tag === "font" && name === "face") {
        const face = String(value || "").replace(/['"]/g, "").trim();
        if (!GENERAL_NOTES_ALLOWED_FONTS.has(face)) node.removeAttribute("face");
      }
    });
    Array.from(node.childNodes).forEach((child) => sanitizeNode(child));
  };

  Array.from(root.childNodes).forEach((child) => sanitizeNode(child));
  return root.innerHTML.trim();
}

function formatRichText(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const looksLikeHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
  const html = looksLikeHtml ? raw : escapeHtml(raw).replaceAll("\n", "<br />");
  return sanitizeRichText(html);
}

function normalizeCompareValue(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

function isValueEqual(current, proposed) {
  return normalizeCompareValue(current) === normalizeCompareValue(proposed);
}

function createAcceptToggle({ section, key, checked = true, disabled = false, meta = null, extraKeys = [] } = {}) {
  if (!section || !key) return null;
  const isChecked = disabled ? false : checked;
  if (!disabled) {
    registerFieldAvailability(section, key);
    if (section === "lineItem" && meta && selectionState) {
      selectionState.lineItemMeta.set(key, meta);
    }
    setFieldSelection(section, key, isChecked);
    extraKeys.forEach((extra) => setFieldSelection(section, extra, isChecked));
  }

  const label = document.createElement("label");
  label.className = "review-field-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = isChecked;
  input.disabled = disabled;
  const text = document.createElement("span");
  text.textContent = "Accept";
  label.appendChild(input);
  label.appendChild(text);
  input.addEventListener("change", () => {
    setFieldSelection(section, key, input.checked);
    extraKeys.forEach((extra) => setFieldSelection(section, extra, input.checked));
    updateAcceptButtons();
  });
  return label;
}

function normalizeArrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeListValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function displayValue(value) {
  if (value === 0) return "0";
  const text = String(value ?? "").trim();
  return text ? text : "--";
}

function formatListHtml(value) {
  const list = normalizeListValue(value);
  if (!list.length) return "";
  return list.map((entry) => escapeHtml(String(entry ?? "").trim())).filter(Boolean).join("<br />");
}

function formatContactHtml(value) {
  const list = normalizeArrayValue(value);
  const rows = list
    .map((contact) => {
      const name = String(contact?.name || contact?.contactName || contact?.contact_name || "").trim();
      const title = String(contact?.title || contact?.contactTitle || contact?.contact_title || "").trim();
      const email = String(contact?.email || "").trim();
      const phone = String(contact?.phone || "").trim();
      if (!name && !title && !email && !phone) return null;
      const nameLine = title ? `${name || "--"} - ${title}` : name || "--";
      return `${escapeHtml(nameLine)} | ${escapeHtml(email || "--")} | ${escapeHtml(phone || "--")}`;
    })
    .filter(Boolean);
  return rows.length ? rows.join("<br />") : "";
}

function contactCategoryKeyFromLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part, idx) =>
      idx === 0 ? part : part.slice(0, 1).toUpperCase() + part.slice(1)
    )
    .join("");
}

function normalizeContactCategories(value) {
  const raw = Array.isArray(value) ? value : [];
  const normalized = [];
  const usedKeys = new Set();

  const pushEntry = (key, label) => {
    const cleanLabel = String(label || "").trim();
    if (!cleanLabel) return;
    let cleanKey = String(key || "").trim();
    if (!cleanKey) cleanKey = contactCategoryKeyFromLabel(cleanLabel);
    if (!cleanKey || usedKeys.has(cleanKey)) return;
    usedKeys.add(cleanKey);
    normalized.push({ key: cleanKey, label: cleanLabel });
  };

  raw.forEach((entry) => {
    if (!entry) return;
    if (typeof entry === "string") {
      pushEntry("", entry);
      return;
    }
    if (typeof entry !== "object") return;
    pushEntry(entry.key || entry.id || "", entry.label || entry.name || entry.title || "");
  });

  const byKey = new Map(normalized.map((entry) => [entry.key, entry]));
  const baseContacts = byKey.get("contacts")?.label || DEFAULT_CONTACT_CATEGORIES[0].label;
  const baseAccounting =
    byKey.get("accountingContacts")?.label || DEFAULT_CONTACT_CATEGORIES[1].label;
  const extras = normalized.filter(
    (entry) => entry.key !== "contacts" && entry.key !== "accountingContacts"
  );
  return [
    { key: "contacts", label: baseContacts },
    { key: "accountingContacts", label: baseAccounting },
    ...extras,
  ];
}

function normalizeContactGroups(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const groups = {};
  Object.entries(raw).forEach(([key, list]) => {
    groups[key] = normalizeArrayValue(list);
  });
  return groups;
}

function normalizeCoverageSlots(value) {
  if (!value) return [];
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.slots)) {
    raw = raw.slots;
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((slot) => {
      const startDay = String(slot?.startDay || slot?.start_day || "").trim();
      const endDay = String(slot?.endDay || slot?.end_day || "").trim();
      const startTime = String(slot?.startTime || slot?.start_time || "").trim();
      const endTime = String(slot?.endTime || slot?.end_time || "").trim();
      if (!startDay && !endDay && !startTime && !endTime) return null;
      return { startDay, endDay, startTime, endTime };
    })
    .filter(Boolean);
}

function formatCoverageDay(value) {
  const key = String(value || "").trim().toLowerCase().slice(0, 3);
  const labels = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  if (labels[key]) return labels[key];
  return escapeHtml(displayValue(value));
}

function formatCoverageHoursHtml(value, timeZone = null) {
  const slots = normalizeCoverageSlots(value);
  if (!slots.length) return "";
  const summary = slots
    .map((slot) => {
      const startDay = formatCoverageDay(slot.startDay);
      const endDay = formatCoverageDay(slot.endDay || slot.startDay);
      const startTime = escapeHtml(displayValue(slot.startTime));
      const endTime = escapeHtml(displayValue(slot.endTime));
      return `${startDay} ${startTime} -> ${endDay} ${endTime}`;
    })
    .join("<br />");
  const tzLabel = String(timeZone || "").trim();
  return tzLabel ? `${summary}<br /><span class="hint">(${escapeHtml(tzLabel)})</span>` : summary;
}

function formatLineItemHtml(item) {
  if (!item) return "";
  const fields = [
    ["Line item ID", item.lineItemId || item.id],
    ["Type", item.typeName || item.typeId || item.type_name],
    ["Bundle", item.bundleName || item.bundleId || item.bundle_name],
    ["Start", item.startAt || item.start_at],
    ["End", item.endAt || item.end_at],
  ];
  return fields.map(([label, value]) => `${escapeHtml(label)}: ${escapeHtml(displayValue(value))}`).join("<br />");
}

function formatBoolean(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "--";
}

function formatArraySummary(value) {
  const list = normalizeArrayValue(value);
  if (!list.length) return "--";
  if (list.every((item) => typeof item !== "object" || item === null)) {
    return list.map((entry) => escapeHtml(displayValue(entry))).join(", ");
  }
  return `${list.length} item(s)`;
}

function formatInventoryDetails(value) {
  const list = normalizeArrayValue(value);
  if (!list.length) return "--";
  return list
    .map((item) => {
      const serial = escapeHtml(String(item?.serial_number || item?.serialNumber || "").trim() || "--");
      const model = escapeHtml(String(item?.model_name || item?.modelName || "").trim());
      const location = escapeHtml(String(item?.location || "").trim());
      const pieces = [serial, model].filter(Boolean).join(" - ");
      return location ? `${pieces} (${location})` : pieces;
    })
    .join("<br />");
}

function formatBundleItems(value) {
  const list = normalizeArrayValue(value);
  if (!list.length) return "--";
  return list
    .map((item) => {
      const serial = escapeHtml(String(item?.serialNumber || item?.serial_number || "").trim() || "--");
      const model = escapeHtml(String(item?.modelName || item?.model_name || "").trim());
      const type = escapeHtml(String(item?.typeName || item?.type_name || "").trim());
      const pieces = [serial, model].filter(Boolean).join(" - ");
      return type ? `${pieces} (${type})` : pieces;
    })
    .join("<br />");
}

function formatLineItemDetailsHtml(item) {
  if (!item) return "";
  const fields = [
    ["Line item ID", item.lineItemId || item.id, false],
    ["Type", item.typeName || item.typeId || item.type_name, false],
    ["Bundle", item.bundleName || item.bundleId || item.bundle_name, false],
    ["Start", item.startAt || item.start_at, false],
    ["End", item.endAt || item.end_at, false],
    ["Fulfilled", item.fulfilledAt || item.fulfilled_at, false],
    ["Returned", item.returnedAt || item.returned_at, false],
    ["Rate basis", item.rateBasis || item.rate_basis, false],
    ["Rate amount", item.rateAmount ?? item.rate_amount, false],
    ["Billable units", item.billableUnits ?? item.billable_units, false],
    ["Line amount", item.lineAmount ?? item.line_amount, false],
    ["Unit description", item.unitDescription || item.unit_description, false],
    ["Before notes", item.beforeNotes || item.before_notes, false],
    ["After notes", item.afterNotes || item.after_notes, false],
    ["Pause periods", formatArraySummary(item.pausePeriods || item.pause_periods), false],
    ["AI damage report generated", item.aiDamageReportGeneratedAt || item.ai_report_generated_at, false],
    ["AI damage report", item.aiDamageReport || item.ai_report_markdown, false],
    ["Inventory", formatInventoryDetails(item.inventoryDetails || item.inventory_details), true],
    ["Bundle items", formatBundleItems(item.bundleItems || item.bundle_items), true],
  ];
  return fields
    .map(([label, value, html]) => {
      const safeLabel = escapeHtml(label);
      const safeValue = html ? (value || "--") : escapeHtml(displayValue(value));
      return `${safeLabel}: ${safeValue}`;
    })
    .join("<br />");
}

function normalizeImageList(value, { category } = {}) {
  const rows = normalizeArrayValue(value);
  return rows
    .filter((item) => {
      if (!item?.url) return false;
      if (!category) return true;
      return String(item?.category || "") === category;
    })
    .map((item) => ({
      url: item.url,
      fileName: item.file_name || item.fileName || item.name || "Photo",
    }));
}

function renderTable() {
  updatesTable.innerHTML = `
    <div class="table-row table-header">
      <span>Submitted</span>
      <span>Scope</span>
      <span>Customer</span>
      <span>Order</span>
      <span>Status</span>
      <span></span>
    </div>
  `;
  if (!requestsCache.length) {
    updatesTable.innerHTML += `<div class="hint">No pending updates.</div>`;
    return;
  }
  requestsCache.forEach((req) => {
    const docNumber = req.ro_number || req.quote_number || (req.rental_order_id ? `#${req.rental_order_id}` : "--");
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>${fmtDate(req.submitted_at)}</span>
      <span>${req.scope || "--"}</span>
      <span>${req.customer_name || "--"}</span>
      <span>${docNumber}</span>
      <span>${req.status || "--"}</span>
      <span><button class="ghost small" data-id="${req.id}">Review</button></span>
    `;
    updatesTable.appendChild(row);
  });
}

function renderDetail(request, currentCustomer, currentOrder) {
  detailBody.innerHTML = "";
  resetSelectionState();
  const payload = request?.payload || {};
  const customer = payload.customer || {};
  const order = payload.order || {};
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const hasCustomerKey = (key) => Object.prototype.hasOwnProperty.call(customer, key);
  const hasOrderKey = (key) => Object.prototype.hasOwnProperty.call(order, key);
  const documents = Array.isArray(request.documents) ? request.documents : [];
  const signature = request.signature || {};
  const normalizedStatus = normalizeStatus(request?.status);
  const hasCustomerSection = Object.keys(customer).length > 0 || documents.length > 0;
  const hasOrderSection =
    Object.keys(order).length > 0 || lineItems.length > 0 || (signature && Object.keys(signature).length > 0);
  const customerReviewStatus = normalizeReviewStatus(request?.customer_review_status) || "pending";
  const orderReviewStatus = normalizeReviewStatus(request?.order_review_status) || "pending";
  canReviewCustomer =
    normalizedStatus === "pending" && hasCustomerSection && customerReviewStatus === "pending";
  canReviewOrder = normalizedStatus === "pending" && hasOrderSection && orderReviewStatus === "pending";

  if (applyUpdateBtn) {
    applyUpdateBtn.disabled = !(canReviewCustomer || canReviewOrder);
    applyUpdateBtn.style.display = canReviewCustomer || canReviewOrder ? "inline-flex" : "none";
  }
  if (rejectUpdateBtn) {
    rejectUpdateBtn.disabled = !(canReviewCustomer || canReviewOrder);
    rejectUpdateBtn.style.display = canReviewCustomer || canReviewOrder ? "inline-flex" : "none";
  }
  const currentLineItems = normalizeArrayValue(currentOrder?.lineItems);
  const currentAttachments = normalizeArrayValue(currentOrder?.attachments);
  const currentDocuments = currentAttachments.filter((doc) => String(doc?.category || "") !== "general_notes");
  const currentGeneralNotesImages = normalizeImageList(currentAttachments, { category: "general_notes" });
  const proposedGeneralNotesImages = normalizeImageList(order.generalNotesImages);

  const createTwoColBlock = (label, { toggle } = {}) => {
    const row = document.createElement("div");
    row.className = "two-col";
    const currentCol = document.createElement("div");
    const currentLabel = document.createElement("div");
    currentLabel.className = toggle ? "hint review-field-label" : "hint";
    const currentLabelText = document.createElement("span");
    currentLabelText.textContent = `${label} (current)`;
    currentLabel.appendChild(currentLabelText);
    if (toggle) currentLabel.appendChild(toggle);
    const currentBody = document.createElement("div");
    currentCol.appendChild(currentLabel);
    currentCol.appendChild(currentBody);
    const proposedCol = document.createElement("div");
    const proposedLabel = document.createElement("div");
    proposedLabel.className = "hint";
    proposedLabel.textContent = `${label} (proposed)`;
    const proposedBody = document.createElement("div");
    proposedCol.appendChild(proposedLabel);
    proposedCol.appendChild(proposedBody);
    row.appendChild(currentCol);
    row.appendChild(proposedCol);
    detailBody.appendChild(row);
    return { currentBody, proposedBody };
  };

  const setTwoColContent = (target, value, { html = false } = {}) => {
    if (!target) return;
    if (html) {
      target.innerHTML = formatRichText(value) || "--";
      return;
    }
    target.textContent = displayValue(value);
  };

  const appendElementOrDash = (target, element) => {
    if (!target) return;
    if (element) {
      target.appendChild(element);
      return;
    }
    target.textContent = "--";
  };

  const buildDocumentList = (docs) => {
    const list = normalizeArrayValue(docs).filter((doc) => String(doc?.category || "") !== "general_notes");
    if (!list.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "stack";
    list.forEach((doc) => {
      const row = document.createElement("div");
      row.className = "document-row";
      const label = `${doc?.category || "Document"}: ${doc?.fileName || doc?.file_name || "File"}`;
      const isServiceAgreement =
        String(doc?.category || "")
          .trim()
          .toLowerCase() === SERVICE_AGREEMENT_CATEGORY.toLowerCase();
      if (isServiceAgreement) row.classList.add("document-row--service-agreement");
      const url = String(doc?.url || "").trim();
      if (url && isSafeUrl(url)) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = label;
        row.appendChild(link);
      } else {
        row.textContent = label;
      }
      wrap.appendChild(row);
    });
    return wrap;
  };

  const buildImageGrid = (images) => {
    const list = normalizeArrayValue(images);
    if (!list.length) return null;
    const grid = document.createElement("div");
    grid.className = "general-notes-images";
    list.forEach((img) => {
      const url = String(img?.url || "").trim();
      if (!url || !isSafeUrl(url, { allowDataImage: true })) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      const image = document.createElement("img");
      image.src = url;
      image.alt = img?.fileName || img?.name || "Photo";
      image.loading = "lazy";
      link.appendChild(image);
      grid.appendChild(link);
    });
    if (!grid.children.length) return null;
    return grid;
  };

  const buildSignatureBlock = (sig) => {
    const typedName = String(sig?.typedName || sig?.typed_name || "").trim();
    const imageUrl = String(sig?.imageUrl || sig?.image_url || "").trim();
    if (!typedName && !imageUrl) return null;
    const wrap = document.createElement("div");
    if (typedName) {
      const row = document.createElement("div");
      row.textContent = `Signed by ${typedName}`;
      wrap.appendChild(row);
    }
    if (imageUrl && isSafeUrl(imageUrl, { allowDataImage: true })) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Signature";
      img.style.maxWidth = "260px";
      img.style.border = "1px solid var(--border)";
      img.style.borderRadius = "12px";
      img.style.marginTop = "8px";
      wrap.appendChild(img);
    }
    return wrap;
  };

  const buildLineItemPairs = (currentItems, proposedItems) => {
    const pairs = [];
    const used = new Set();
    const currentById = new Map();
    currentItems.forEach((li) => {
      if (li?.id) currentById.set(String(li.id), li);
    });
    proposedItems.forEach((li) => {
      let current = null;
      if (li?.lineItemId) {
        current = currentById.get(String(li.lineItemId)) || null;
      }
      if (!current) {
        const proposedType = li?.typeId ?? li?.type_id ?? null;
        const proposedStart = li?.startAt ?? li?.start_at ?? null;
        const proposedEnd = li?.endAt ?? li?.end_at ?? null;
        current = currentItems.find((candidate) => {
          if (candidate?.id && used.has(String(candidate.id))) return false;
          if (proposedType && Number(candidate?.typeId ?? candidate?.type_id) !== Number(proposedType)) return false;
          if (proposedStart && String(candidate?.startAt ?? candidate?.start_at) !== String(proposedStart)) return false;
          if (proposedEnd && String(candidate?.endAt ?? candidate?.end_at) !== String(proposedEnd)) return false;
          return !!candidate;
        }) || null;
      }
      if (current?.id) used.add(String(current.id));
      pairs.push({ current, proposed: li });
    });
    currentItems.forEach((li) => {
      if (li?.id && used.has(String(li.id))) return;
      pairs.push({ current: li, proposed: null });
    });
    return pairs;
  };

  const normalizeLineItemCompare = (item) => {
    if (!item) return null;
    return {
      lineItemId: item.lineItemId || item.id || null,
      typeId: item.typeId || item.type_id || null,
      bundleId: item.bundleId || item.bundle_id || null,
      startAt: item.startAt || item.start_at || null,
      endAt: item.endAt || item.end_at || null,
    };
  };

  const lineItemHasChange = (current, proposed) => {
    if (!current && !proposed) return false;
    if (!proposed) return false;
    if (!current) return true;
    return !isValueEqual(normalizeLineItemCompare(current), normalizeLineItemCompare(proposed));
  };

  const lineItemKey = (item, index) => {
    const id = item?.lineItemId || item?.id;
    return id ? `id:${id}` : `idx:${index}`;
  };

  const pushField = (
    label,
    current,
    proposed,
    {
      html = false,
      section = null,
      key = null,
      compareCurrent = null,
      compareProposed = null,
      hasProposed = null,
      extraKeys = null,
      disabled = null,
    } = {}
  ) => {
    const currentCompare = compareCurrent !== null ? compareCurrent : current;
    const proposedCompare = compareProposed !== null ? compareProposed : proposed;
    const proposedPresent = hasProposed !== null ? hasProposed : proposed !== undefined;
    const hasChange = proposedPresent && !isValueEqual(currentCompare, proposedCompare);
    const toggleDisabled =
      disabled !== null
        ? disabled
        : section === "customer"
          ? !canReviewCustomer
          : section
            ? !canReviewOrder
            : false;
    const toggle =
      hasChange && section && key
        ? createAcceptToggle({
            section,
            key,
            extraKeys: Array.isArray(extraKeys) ? extraKeys : [],
            disabled: toggleDisabled,
          })
        : null;
    const { currentBody, proposedBody } = createTwoColBlock(label, { toggle });
    setTwoColContent(currentBody, current, { html });
    setTwoColContent(proposedBody, proposed, { html });
  };

  const currentSignature = currentOrder?.signature || currentOrder?.order?.signature || null;

  if (Object.keys(customer).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">Customer</div>`;
    detailBody.appendChild(section);
    const labelMap = new Map(contactCategoryConfig.map((entry) => [entry.key, entry.label]));
    const contactsLabel = labelMap.get("contacts") || "Contacts";
    const accountingLabel = labelMap.get("accountingContacts") || "Accounting contacts";
    pushField("Company", currentCustomer?.company_name, customer.companyName, {
      section: "customer",
      key: "companyName",
      hasProposed: hasCustomerKey("companyName"),
    });
    pushField("Contact", currentCustomer?.contact_name, customer.contactName, {
      section: "customer",
      key: "contactName",
      hasProposed: hasCustomerKey("contactName"),
    });
    pushField("Email", currentCustomer?.email, customer.email, {
      section: "customer",
      key: "email",
      hasProposed: hasCustomerKey("email"),
    });
    pushField("Phone", currentCustomer?.phone, customer.phone, {
      section: "customer",
      key: "phone",
      hasProposed: hasCustomerKey("phone"),
    });
    pushField("Address", currentCustomer?.street_address, customer.streetAddress, {
      section: "customer",
      key: "streetAddress",
      hasProposed: hasCustomerKey("streetAddress"),
    });
    pushField("City", currentCustomer?.city, customer.city, {
      section: "customer",
      key: "city",
      hasProposed: hasCustomerKey("city"),
    });
    pushField("Region", currentCustomer?.region, customer.region, {
      section: "customer",
      key: "region",
      hasProposed: hasCustomerKey("region"),
    });
    pushField("Postal code", currentCustomer?.postal_code, customer.postalCode, {
      section: "customer",
      key: "postalCode",
      hasProposed: hasCustomerKey("postalCode"),
    });
    pushField("Country", currentCustomer?.country, customer.country, {
      section: "customer",
      key: "country",
      hasProposed: hasCustomerKey("country"),
    });
    pushField(
      contactsLabel,
      formatContactHtml(currentCustomer?.contacts),
      formatContactHtml(customer.contacts),
      {
        html: true,
        section: "customer",
        key: "contacts",
        compareCurrent: currentCustomer?.contacts,
        compareProposed: customer.contacts,
        hasProposed: hasCustomerKey("contacts"),
      }
    );
    pushField(
      accountingLabel,
      formatContactHtml(currentCustomer?.accounting_contacts),
      formatContactHtml(customer.accountingContacts),
      {
        html: true,
        section: "customer",
        key: "accountingContacts",
        compareCurrent: currentCustomer?.accounting_contacts,
        compareProposed: customer.accountingContacts,
        hasProposed: hasCustomerKey("accountingContacts"),
      }
    );

    const currentGroups = normalizeContactGroups(currentCustomer?.contact_groups);
    const proposedGroups = normalizeContactGroups(customer.contactGroups);
    contactCategoryConfig
      .filter((entry) => entry.key !== "contacts" && entry.key !== "accountingContacts")
      .forEach((entry, idx) => {
        pushField(
          entry.label,
          formatContactHtml(currentGroups[entry.key]),
          formatContactHtml(proposedGroups[entry.key]),
          {
            html: true,
            section: idx === 0 ? "customer" : null,
            key: idx === 0 ? "contactGroups" : null,
            compareCurrent: currentGroups,
            compareProposed: proposedGroups,
            hasProposed: hasCustomerKey("contactGroups"),
          }
        );
      });
  }

  if (Object.keys(order).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Order</div>`;
    detailBody.appendChild(section);
    pushField("Customer PO", currentOrder?.order?.customer_po, order.customerPo, {
      section: "order",
      key: "customerPo",
      hasProposed: hasOrderKey("customerPo"),
    });
    pushField("Fulfillment", currentOrder?.order?.fulfillment_method, order.fulfillmentMethod, {
      section: "order",
      key: "fulfillmentMethod",
      hasProposed: hasOrderKey("fulfillmentMethod"),
    });
    pushField("Dropoff address", currentOrder?.order?.dropoff_address, order.dropoffAddress, {
      html: true,
      section: "order",
      key: "dropoffAddress",
      hasProposed: hasOrderKey("dropoffAddress"),
    });
    pushField("Site name", currentOrder?.order?.site_name, order.siteName, {
      section: "order",
      key: "siteName",
      hasProposed: hasOrderKey("siteName"),
    });
    pushField("Site address", currentOrder?.order?.site_address, order.siteAddress, {
      section: "order",
      key: "siteAddress",
      hasProposed: hasOrderKey("siteAddress"),
    });
    pushField("Site access information / pin", currentOrder?.order?.site_access_info, order.siteAccessInfo, {
      section: "order",
      key: "siteAccessInfo",
      hasProposed: hasOrderKey("siteAccessInfo"),
    });
    pushField("Site address latitude", currentOrder?.order?.site_address_lat, order.siteAddressLat, {
      section: "order",
      key: "siteAddressLat",
      hasProposed: hasOrderKey("siteAddressLat"),
    });
    pushField("Site address longitude", currentOrder?.order?.site_address_lng, order.siteAddressLng, {
      section: "order",
      key: "siteAddressLng",
      hasProposed: hasOrderKey("siteAddressLng"),
    });
    pushField("Site address search query", currentOrder?.order?.site_address_query, order.siteAddressQuery, {
      section: "order",
      key: "siteAddressQuery",
      hasProposed: hasOrderKey("siteAddressQuery"),
    });
    pushField("Logistics instructions", currentOrder?.order?.logistics_instructions, order.logisticsInstructions, {
      html: true,
      section: "order",
      key: "logisticsInstructions",
      hasProposed: hasOrderKey("logisticsInstructions"),
    });
    pushField("Special instructions", currentOrder?.order?.special_instructions, order.specialInstructions, {
      html: true,
      section: "order",
      key: "specialInstructions",
      hasProposed: hasOrderKey("specialInstructions"),
    });
    pushField("Critical Assets and Locations", currentOrder?.order?.critical_areas, order.criticalAreas, {
      html: true,
      section: "order",
      key: "criticalAreas",
      hasProposed: hasOrderKey("criticalAreas"),
    });
    pushField("Monitoring personnel", currentOrder?.order?.monitoring_personnel, order.monitoringPersonnel, {
      section: "order",
      key: "monitoringPersonnel",
      hasProposed: hasOrderKey("monitoringPersonnel"),
    });
    pushField(
      "Notification circumstances",
      formatListHtml(currentOrder?.order?.notification_circumstances),
      formatListHtml(order.notificationCircumstances),
      {
        html: true,
        section: "order",
        key: "notificationCircumstances",
        compareCurrent: currentOrder?.order?.notification_circumstances,
        compareProposed: order.notificationCircumstances,
        hasProposed: hasOrderKey("notificationCircumstances"),
      }
    );
    pushField(
      "Coverage hours",
      formatCoverageHoursHtml(
        currentOrder?.order?.coverage_hours,
        currentOrder?.order?.coverage_timezone || currentOrder?.order?.coverageTimeZone || null
      ),
      formatCoverageHoursHtml(order.coverageHours, order.coverageTimeZone || null),
      {
        html: true,
        section: "order",
        key: "coverageHours",
        compareCurrent: {
          hours: currentOrder?.order?.coverage_hours || [],
          timeZone: currentOrder?.order?.coverage_timezone || currentOrder?.order?.coverageTimeZone || null,
        },
        compareProposed: {
          hours: order.coverageHours || [],
          timeZone: order.coverageTimeZone || null,
        },
        hasProposed: hasOrderKey("coverageHours") || hasOrderKey("coverageTimeZone"),
        extraKeys: hasOrderKey("coverageTimeZone") ? ["coverageTimeZone"] : [],
      }
    );
    pushField(
      "Coverage stat holidays required",
      formatBoolean(currentOrder?.order?.coverage_stat_holidays_required),
      formatBoolean(order.coverageStatHolidaysRequired),
      { section: "order", key: "coverageStatHolidaysRequired", hasProposed: hasOrderKey("coverageStatHolidaysRequired") }
    );
    pushField(
      "Emergency contacts",
      formatContactHtml(currentOrder?.order?.emergency_contacts),
      formatContactHtml(order.emergencyContacts),
      {
        html: true,
        section: "order",
        key: "emergencyContacts",
        compareCurrent: currentOrder?.order?.emergency_contacts,
        compareProposed: order.emergencyContacts,
        hasProposed: hasOrderKey("emergencyContacts"),
      }
    );
    pushField(
      "Additional emergency contact instructions",
      currentOrder?.order?.emergency_contact_instructions,
      order.emergencyContactInstructions,
      {
        html: true,
        section: "order",
        key: "emergencyContactInstructions",
        hasProposed: hasOrderKey("emergencyContactInstructions"),
      }
    );
    pushField("Site contacts", formatContactHtml(currentOrder?.order?.site_contacts), formatContactHtml(order.siteContacts), {
      html: true,
      section: "order",
      key: "siteContacts",
      compareCurrent: currentOrder?.order?.site_contacts,
      compareProposed: order.siteContacts,
      hasProposed: hasOrderKey("siteContacts"),
    });
    pushField("General notes", currentOrder?.order?.general_notes, order.generalNotes, {
      html: true,
      section: "order",
      key: "generalNotes",
      hasProposed: hasOrderKey("generalNotes"),
    });
  }

  if (currentLineItems.length || lineItems.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Line items</div>`;
    detailBody.appendChild(section);
    const pairs = buildLineItemPairs(currentLineItems, lineItems);
    pairs.forEach((pair, index) => {
      const label = `Line item ${index + 1}`;
      const hasChange = lineItemHasChange(pair.current, pair.proposed);
      const key = lineItemKey(pair.proposed || pair.current, index);
        const toggle = hasChange
          ? createAcceptToggle({
              section: "lineItem",
              key,
              disabled: !canReviewOrder,
              meta: {
                id: pair.proposed?.lineItemId || pair.proposed?.id || pair.current?.lineItemId || pair.current?.id || null,
                index,
              },
            })
          : null;
      const { currentBody, proposedBody } = createTwoColBlock(label, { toggle });
      setTwoColContent(currentBody, formatLineItemDetailsHtml(pair.current), { html: true });
      setTwoColContent(proposedBody, formatLineItemDetailsHtml(pair.proposed), { html: true });
    });
  }

  if (currentGeneralNotesImages.length || proposedGeneralNotesImages.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">General notes photos</div>`;
    detailBody.appendChild(section);
    const currentPhotos = currentGeneralNotesImages.map((img) => img.url);
    const proposedPhotos = proposedGeneralNotesImages.map((img) => img.url);
    const hasPhotoChange = hasOrderKey("generalNotesImages") && !isValueEqual(currentPhotos, proposedPhotos);
    const toggle = hasPhotoChange
      ? createAcceptToggle({ section: "order", key: "generalNotesImages", disabled: !canReviewOrder })
      : null;
    const { currentBody, proposedBody } = createTwoColBlock("General notes photos", { toggle });
    appendElementOrDash(currentBody, buildImageGrid(currentGeneralNotesImages));
    appendElementOrDash(proposedBody, buildImageGrid(proposedGeneralNotesImages));
  }

  if (currentDocuments.length || documents.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Documents</div>`;
    detailBody.appendChild(section);
    const { currentBody, proposedBody } = createTwoColBlock("Documents");
    appendElementOrDash(currentBody, buildDocumentList(currentDocuments));
    appendElementOrDash(proposedBody, buildDocumentList(documents));
  }

  if (currentSignature || signature?.typedName || signature?.imageUrl || signature?.image_url) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Signature</div>`;
    detailBody.appendChild(section);
    const { currentBody, proposedBody } = createTwoColBlock("Signature");
    appendElementOrDash(currentBody, buildSignatureBlock(currentSignature));
    appendElementOrDash(proposedBody, buildSignatureBlock(signature));
  }

  updateAcceptButtons();
}

async function loadContactCategories() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/company-settings?companyId=${encodeURIComponent(String(activeCompanyId))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load contact categories.");
    contactCategoryConfig = normalizeContactCategories(data.settings?.customer_contact_categories || []);
  } catch {
    contactCategoryConfig = DEFAULT_CONTACT_CATEGORIES;
  }
}

async function loadRequests() {
  try {
    if (!rentalOrderIdParam && !customerIdParam) {
      updatesMeta.textContent = "Select a customer or rental order to review customer updates.";
      if (updatesTable) updatesTable.innerHTML = `<div class="hint">No customer or rental order selected.</div>`;
      setBackToOrderTarget("");
      setBackToCustomerTarget("");
      return;
    }
    if (!activeCompanyId) {
      updatesMeta.textContent = "Select a company first.";
      return;
    }
    const query = new URLSearchParams();
    query.set("companyId", String(activeCompanyId));
    if (rentalOrderIdParam) query.set("rentalOrderId", rentalOrderIdParam);
    if (customerIdParam) query.set("customerId", customerIdParam);
    if (statusFilter) query.set("status", statusFilter);
    const data = await fetchJson(`/api/customer-change-requests?${query.toString()}`);
    const raw = Array.isArray(data.requests) ? data.requests : [];
    let scoped = raw;
    const normalizedCustomerId = Number(customerIdParam);
    if (Number.isFinite(normalizedCustomerId) && normalizedCustomerId > 0) {
      scoped = scoped.filter((req) => Number(req.customer_id) === normalizedCustomerId);
    }
    const normalizedRentalOrderId = Number(rentalOrderIdParam);
    if (Number.isFinite(normalizedRentalOrderId) && normalizedRentalOrderId > 0) {
      scoped = scoped.filter((req) => Number(req.rental_order_id) === normalizedRentalOrderId);
    }
    requestsCache = scoped.filter((req) => STATUS_ALLOWED.has(normalizeStatus(req.status)));
    if (statusFilter) {
      requestsCache = requestsCache.filter((req) => normalizeStatus(req.status) === statusFilter);
    }
    const statusLabel = statusFilter ? statusFilter : "all statuses";
    const customerName =
      customerIdParam && scoped.length
        ? scoped.find((req) => String(req.customer_id || "") === customerIdParam)?.customer_name || null
        : null;
    const customerLabel = customerIdParam
      ? customerName
        ? `${customerName} (Customer #${customerIdParam})`
        : `Customer #${customerIdParam}`
      : null;
    const orderLabel = rentalOrderIdParam ? `Order #${rentalOrderIdParam}` : null;
    const scopeLabel = [customerLabel, orderLabel].filter(Boolean).join(" · ") || "All updates";
    updatesMeta.textContent = `${requestsCache.length} update(s). ${scopeLabel} · ${statusLabel}`;
    setBackToOrderTarget(rentalOrderIdParam);
    setBackToCustomerTarget(customerIdParam);
    renderTable();
  } catch (err) {
    updatesMeta.textContent = err?.message ? String(err.message) : "Unable to load updates.";
  }
}

const REFRESH_INTERVAL_MS = 30000;
let refreshTimer = null;
function startAutoRefresh() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    if (document.hidden) return;
    loadRequests();
  }, REFRESH_INTERVAL_MS);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadRequests();
});

async function loadRequestDetail(id) {
  detailHint.textContent = "";
  if (!contactCategoriesPromise) {
    contactCategoriesPromise = loadContactCategories();
  }
  await contactCategoriesPromise;
  const data = await fetchJson(
    `/api/customer-change-requests/${encodeURIComponent(id)}?companyId=${encodeURIComponent(activeCompanyId)}`
  );
  activeRequest = data.request;
  detailMeta.textContent = `Update #${activeRequest.id} - ${fmtDate(activeRequest.submitted_at)}`;
  renderDetail(activeRequest, data.currentCustomer, data.currentOrder);
  setBackToOrderTarget(activeRequest?.rental_order_id || rentalOrderIdParam);
  setBackToCustomerTarget(activeRequest?.customer_id || customerIdParam);
  detailCard.style.display = "block";
}

async function refreshActiveRequest() {
  if (!activeRequest?.id) return;
  await loadRequestDetail(activeRequest.id);
}

updatesTable?.addEventListener("click", async (evt) => {
  const btn = evt.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    await loadRequestDetail(id);
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to load update.";
  }
});

backToOrderBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const orderId = String(backToOrderBtn?.dataset?.orderId || "").trim();
  if (!orderId) return;
  const qs = new URLSearchParams();
  qs.set("id", orderId);
  if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
  window.location.href = `rental-order-form.html?${qs.toString()}`;
});

backToCustomerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const customerId = String(backToCustomerBtn?.dataset?.customerId || "").trim();
  if (!customerId) return;
  const qs = new URLSearchParams();
  qs.set("id", customerId);
  if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
  window.location.href = `customers-form.html?${qs.toString()}`;
});

applyUpdateBtn?.addEventListener("click", async () => {
  if (!activeRequest) return;
  try {
    detailHint.textContent = "";
    const acceptedCustomerFields = canReviewCustomer ? Array.from(selectionState?.customerFields || []) : [];
    const acceptedOrderFields = canReviewOrder ? Array.from(selectionState?.orderFields || []) : [];
    const acceptedLineItemIds = [];
    const acceptedLineItemIndexes = [];
    if (canReviewOrder) {
      (selectionState?.lineItemKeys || new Set()).forEach((key) => {
        const meta = selectionState?.lineItemMeta?.get(key) || null;
        if (meta?.id) {
          acceptedLineItemIds.push(meta.id);
          return;
        }
        if (Number.isFinite(meta?.index)) acceptedLineItemIndexes.push(meta.index);
      });
    }
    const requiresCustomerSelection =
      canReviewCustomer && (selectionState?.customerAvailable?.size || 0) > 0;
    const requiresOrderSelection =
      canReviewOrder &&
      ((selectionState?.orderAvailable?.size || 0) > 0 || (selectionState?.lineItemAvailable?.size || 0) > 0);
    const requiresSelection = requiresCustomerSelection || requiresOrderSelection;
    const hasSelection =
      acceptedCustomerFields.length > 0 || acceptedOrderFields.length > 0 || acceptedLineItemIds.length > 0 || acceptedLineItemIndexes.length > 0;
    if (requiresSelection && !hasSelection) {
      detailHint.textContent = "Select at least one field or line item to accept.";
      return;
    }
    const payload = { companyId: activeCompanyId };
    const endpoint =
      canReviewCustomer && canReviewOrder
        ? "accept"
        : canReviewCustomer
          ? "accept-customer"
          : "accept-order";
    if (requiresSelection) {
      if (requiresCustomerSelection) payload.acceptedCustomerFields = acceptedCustomerFields;
      if (requiresOrderSelection) {
        payload.acceptedOrderFields = acceptedOrderFields;
        payload.acceptedLineItemIds = acceptedLineItemIds;
        payload.acceptedLineItemIndexes = acceptedLineItemIndexes;
      }
    }
    const result = await fetchJson(
      `/api/customer-change-requests/${encodeURIComponent(activeRequest.id)}/${endpoint}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    detailHint.textContent = "Updates applied.";
    await loadRequests();
    if (endpoint === "accept" || (result?.status && result.status !== "pending")) {
      closeDetailCard();
    } else {
      await refreshActiveRequest();
    }
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to apply updates.";
  }
});

rejectUpdateBtn?.addEventListener("click", async () => {
  if (!activeRequest) return;
  try {
    detailHint.textContent = "";
    const note = window.prompt("Rejection note (optional):", "");
    await fetchJson(
      `/api/customer-change-requests/${encodeURIComponent(activeRequest.id)}/reject`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: activeCompanyId, reviewNotes: note || null }),
      }
    );
    detailHint.textContent = "Updates rejected.";
    await loadRequests();
    closeDetailCard();
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to reject updates.";
  }
});

contactCategoriesPromise = loadContactCategories();
loadRequests();
startAutoRefresh();


