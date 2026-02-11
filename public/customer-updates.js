const updatesTable = document.getElementById("updates-table");
const updatesMeta = document.getElementById("updates-meta");
const detailCard = document.getElementById("detail-card");
const detailBody = document.getElementById("detail-body");
const detailMeta = document.getElementById("detail-meta");
const detailHint = document.getElementById("detail-hint");
const acceptBtn = document.getElementById("accept-update");
const rejectBtn = document.getElementById("reject-update");
const backToOrderBtn = document.getElementById("back-to-order");

const viewParams = new URLSearchParams(window.location.search);
const statusParam = String(viewParams.get("status") || "").trim().toLowerCase();
const rentalOrderIdParam = String(viewParams.get("rentalOrderId") || viewParams.get("orderId") || "").trim();
const STATUS_ALLOWED = new Set(["pending", "accepted", "rejected"]);
const STATUS_ALL_TOKENS = new Set(["all", "any", "*"]);
const hasStatusParam = viewParams.has("status");
let statusFilter = "pending";
if (hasStatusParam) {
  if (!statusParam || STATUS_ALL_TOKENS.has(statusParam)) {
    statusFilter = null;
  } else if (STATUS_ALLOWED.has(statusParam)) {
    statusFilter = statusParam;
  }
}

const initialCompanyId = window.RentSoft?.getCompanyId?.();
let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let requestsCache = [];
let activeRequest = null;

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

function closeDetailCard() {
  activeRequest = null;
  if (detailBody) detailBody.innerHTML = "";
  if (detailMeta) detailMeta.textContent = "";
  if (detailHint) detailHint.textContent = "";
  if (acceptBtn) acceptBtn.disabled = true;
  if (rejectBtn) rejectBtn.disabled = true;
  if (detailCard) detailCard.style.display = "none";
  setBackToOrderTarget("");
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
  const payload = request?.payload || {};
  const customer = payload.customer || {};
  const order = payload.order || {};
  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const documents = Array.isArray(request.documents) ? request.documents : [];
  const signature = request.signature || {};
  const normalizedStatus = normalizeStatus(request?.status);
  const canReview = normalizedStatus === "pending";
  if (acceptBtn) acceptBtn.disabled = !canReview;
  if (rejectBtn) rejectBtn.disabled = !canReview;
  const currentLineItems = normalizeArrayValue(currentOrder?.lineItems);
  const currentAttachments = normalizeArrayValue(currentOrder?.attachments);
  const currentDocuments = currentAttachments.filter((doc) => String(doc?.category || "") !== "general_notes");
  const currentGeneralNotesImages = normalizeImageList(currentAttachments, { category: "general_notes" });
  const proposedGeneralNotesImages = normalizeImageList(order.generalNotesImages);

  const createTwoColBlock = (label) => {
    const row = document.createElement("div");
    row.className = "two-col";
    const currentCol = document.createElement("div");
    const currentLabel = document.createElement("div");
    currentLabel.className = "hint";
    currentLabel.textContent = `${label} (current)`;
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
      const label = `${doc?.category || "Document"}: ${doc?.fileName || doc?.file_name || "File"}`;
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

  const pushField = (label, current, proposed, { html = false } = {}) => {
    const { currentBody, proposedBody } = createTwoColBlock(label);
    setTwoColContent(currentBody, current, { html });
    setTwoColContent(proposedBody, proposed, { html });
  };

  const lineItemPairs = buildLineItemPairs(currentLineItems, lineItems);
  const currentSignature = currentOrder?.signature || currentOrder?.order?.signature || null;

  if (Object.keys(customer).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">Customer</div>`;
    detailBody.appendChild(section);
    pushField("Company", currentCustomer?.company_name, customer.companyName);
    pushField("Contact", currentCustomer?.contact_name, customer.contactName);
    pushField("Email", currentCustomer?.email, customer.email);
    pushField("Phone", currentCustomer?.phone, customer.phone);
    pushField("Address", currentCustomer?.street_address, customer.streetAddress);
    pushField("City", currentCustomer?.city, customer.city);
    pushField("Region", currentCustomer?.region, customer.region);
    pushField("Postal code", currentCustomer?.postal_code, customer.postalCode);
    pushField("Country", currentCustomer?.country, customer.country);
    pushField("Contacts", formatContactHtml(currentCustomer?.contacts), formatContactHtml(customer.contacts), { html: true });
    pushField(
      "Accounting contacts",
      formatContactHtml(currentCustomer?.accounting_contacts),
      formatContactHtml(customer.accountingContacts),
      { html: true }
    );
  }

  if (Object.keys(order).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Order</div>`;
    detailBody.appendChild(section);
    pushField("Customer PO", currentOrder?.order?.customer_po, order.customerPo);
    pushField("Fulfillment", currentOrder?.order?.fulfillment_method, order.fulfillmentMethod);
    pushField("Dropoff address", currentOrder?.order?.dropoff_address, order.dropoffAddress, { html: true });
    pushField("Site address", currentOrder?.order?.site_address, order.siteAddress);
    pushField("Site access information / pin", currentOrder?.order?.site_access_info, order.siteAccessInfo);
    pushField("Logistics instructions", currentOrder?.order?.logistics_instructions, order.logisticsInstructions, { html: true });
    pushField("Special instructions", currentOrder?.order?.special_instructions, order.specialInstructions, { html: true });
    pushField("Critical areas", currentOrder?.order?.critical_areas, order.criticalAreas, { html: true });
    pushField(
      "Notification circumstances",
      formatListHtml(currentOrder?.order?.notification_circumstances),
      formatListHtml(order.notificationCircumstances),
      { html: true }
    );
    pushField(
      "Coverage hours",
      formatCoverageHoursHtml(
        currentOrder?.order?.coverage_hours,
        currentOrder?.order?.coverage_timezone || currentOrder?.order?.coverageTimeZone || null
      ),
      formatCoverageHoursHtml(order.coverageHours, order.coverageTimeZone || null),
      { html: true }
    );
    pushField(
      "Emergency contacts",
      formatContactHtml(currentOrder?.order?.emergency_contacts),
      formatContactHtml(order.emergencyContacts),
      { html: true }
    );
    pushField("Site contacts", formatContactHtml(currentOrder?.order?.site_contacts), formatContactHtml(order.siteContacts), {
      html: true,
    });
    pushField("General notes", currentOrder?.order?.general_notes, order.generalNotes, { html: true });
  }

  if (currentGeneralNotesImages.length || proposedGeneralNotesImages.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">General notes photos</div>`;
    detailBody.appendChild(section);
    const { currentBody, proposedBody } = createTwoColBlock("General notes photos");
    appendElementOrDash(currentBody, buildImageGrid(currentGeneralNotesImages));
    appendElementOrDash(proposedBody, buildImageGrid(proposedGeneralNotesImages));
  }

  if (lineItemPairs.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Line items</div>`;
    detailBody.appendChild(section);
    lineItemPairs.forEach((pair, idx) => {
      const { currentBody, proposedBody } = createTwoColBlock(`Line item ${idx + 1}`);
      setTwoColContent(currentBody, formatLineItemHtml(pair.current), { html: true });
      setTwoColContent(proposedBody, formatLineItemHtml(pair.proposed), { html: true });
    });
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
}

async function loadRequests() {
  try {
    if (!rentalOrderIdParam) {
      updatesMeta.textContent = "Open a rental order to review customer updates.";
      if (updatesTable) updatesTable.innerHTML = `<div class="hint">No rental order selected.</div>`;
      setBackToOrderTarget("");
      return;
    }
    if (!activeCompanyId) {
      updatesMeta.textContent = "Select a company first.";
      return;
    }
    const query = new URLSearchParams();
    query.set("companyId", String(activeCompanyId));
    if (rentalOrderIdParam) query.set("rentalOrderId", rentalOrderIdParam);
    if (statusFilter) query.set("status", statusFilter);
    const data = await fetchJson(`/api/customer-change-requests?${query.toString()}`);
    const raw = Array.isArray(data.requests) ? data.requests : [];
    requestsCache = raw.filter((req) => STATUS_ALLOWED.has(normalizeStatus(req.status)));
    if (statusFilter) {
      requestsCache = requestsCache.filter((req) => normalizeStatus(req.status) === statusFilter);
    }
    const statusLabel = statusFilter ? statusFilter : "all statuses";
    const orderLabel = rentalOrderIdParam ? `Order #${rentalOrderIdParam}` : "All orders";
    updatesMeta.textContent = `${requestsCache.length} update(s). ${orderLabel} · ${statusLabel}`;
    setBackToOrderTarget(rentalOrderIdParam);
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

updatesTable?.addEventListener("click", async (evt) => {
  const btn = evt.target.closest("button[data-id]");
  if (!btn) return;
  const id = btn.dataset.id;
  try {
    detailHint.textContent = "";
    const data = await fetchJson(
      `/api/customer-change-requests/${encodeURIComponent(id)}?companyId=${encodeURIComponent(activeCompanyId)}`
    );
    activeRequest = data.request;
    detailMeta.textContent = `Update #${activeRequest.id} - ${fmtDate(activeRequest.submitted_at)}`;
    renderDetail(activeRequest, data.currentCustomer, data.currentOrder);
    setBackToOrderTarget(activeRequest?.rental_order_id || rentalOrderIdParam);
    detailCard.style.display = "block";
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

acceptBtn?.addEventListener("click", async () => {
  if (!activeRequest) return;
  try {
    detailHint.textContent = "";
    await fetchJson(`/api/customer-change-requests/${encodeURIComponent(activeRequest.id)}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    detailHint.textContent = "Accepted.";
    await loadRequests();
    closeDetailCard();
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to accept update.";
  }
});

rejectBtn?.addEventListener("click", async () => {
  if (!activeRequest) return;
  try {
    detailHint.textContent = "";
    const note = window.prompt("Rejection note (optional):", "");
    await fetchJson(`/api/customer-change-requests/${encodeURIComponent(activeRequest.id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, reviewNotes: note || null }),
    });
    detailHint.textContent = "Rejected.";
    await loadRequests();
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to reject update.";
  }
});

loadRequests();
startAutoRefresh();
