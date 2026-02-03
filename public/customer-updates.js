const updatesTable = document.getElementById("updates-table");
const updatesMeta = document.getElementById("updates-meta");
const detailCard = document.getElementById("detail-card");
const detailBody = document.getElementById("detail-body");
const detailMeta = document.getElementById("detail-meta");
const detailHint = document.getElementById("detail-hint");
const acceptBtn = document.getElementById("accept-update");
const rejectBtn = document.getElementById("reject-update");

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

  const pushField = (label, current, proposed, { html = false } = {}) => {
    const div = document.createElement("div");
    div.className = "two-col";
    const currentValue = html
      ? (formatRichText(current) || "--")
      : (String(current ?? "").trim() ? escapeHtml(current) : "--");
    const proposedValue = html
      ? (formatRichText(proposed) || "--")
      : (String(proposed ?? "").trim() ? escapeHtml(proposed) : "--");
    div.innerHTML = `
      <div>
        <div class="hint">${label} (current)</div>
        <div>${currentValue}</div>
      </div>
      <div>
        <div class="hint">${label} (proposed)</div>
        <div>${proposedValue}</div>
      </div>
    `;
    detailBody.appendChild(div);
  };

  if (Object.keys(customer).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">Customer</div>`;
    detailBody.appendChild(section);
    pushField("Company", currentCustomer?.company_name, customer.companyName);
    pushField("Contact", currentCustomer?.contact_name, customer.contactName);
    pushField("Email", currentCustomer?.email, customer.email);
    pushField("Phone", currentCustomer?.phone, customer.phone);
    pushField("Address", currentCustomer?.street_address, customer.streetAddress);
  }

  if (Object.keys(order).length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Order</div>`;
    detailBody.appendChild(section);
    pushField("Customer PO", currentOrder?.order?.customer_po, order.customerPo);
    pushField("Fulfillment", currentOrder?.order?.fulfillment_method, order.fulfillmentMethod);
    pushField("Site address", currentOrder?.order?.site_address, order.siteAddress);
    pushField("General notes", currentOrder?.order?.general_notes, order.generalNotes, { html: true });
  }

  const generalNotesImages = Array.isArray(order.generalNotesImages) ? order.generalNotesImages : [];
  if (generalNotesImages.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">General notes photos</div>`;
    detailBody.appendChild(section);
    const grid = document.createElement("div");
    grid.className = "general-notes-images";
    generalNotesImages.forEach((img) => {
      const url = img?.url;
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      const image = document.createElement("img");
      image.src = url;
      image.alt = img?.fileName || img?.name || "General notes photo";
      image.loading = "lazy";
      link.appendChild(image);
      grid.appendChild(link);
    });
    detailBody.appendChild(grid);
  }

  if (lineItems.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Line items</div>`;
    detailBody.appendChild(section);
    const list = document.createElement("div");
    list.className = "stack";
    lineItems.forEach((li, idx) => {
      const row = document.createElement("div");
      row.className = "info";
      row.textContent = `${idx + 1}. Type ${li.typeName || li.typeId || "--"} | ${li.startAt || "--"} -> ${li.endAt || "--"}`;
      list.appendChild(row);
    });
    detailBody.appendChild(list);
  }

  if (documents.length) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Documents</div>`;
    detailBody.appendChild(section);
    documents.forEach((doc) => {
      const row = document.createElement("div");
      const link = document.createElement("a");
      link.href = doc.url || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = `${doc.category || "Document"}: ${doc.fileName || doc.file_name || "File"}`;
      row.appendChild(link);
      detailBody.appendChild(row);
    });
  }

  if (signature?.typedName) {
    const section = document.createElement("div");
    section.innerHTML = `<div style="font-weight:700; margin:10px 0 6px;">Signature</div>`;
    detailBody.appendChild(section);
    const row = document.createElement("div");
    row.textContent = `Signed by ${signature.typedName}`;
    detailBody.appendChild(row);
    if (signature.imageUrl) {
      const img = document.createElement("img");
      img.src = signature.imageUrl;
      img.alt = "Signature";
      img.style.maxWidth = "260px";
      img.style.border = "1px solid var(--border)";
      img.style.borderRadius = "12px";
      img.style.marginTop = "8px";
      detailBody.appendChild(img);
    }
  }
}

async function loadRequests() {
  try {
    if (!activeCompanyId) {
      updatesMeta.textContent = "Select a company first.";
      return;
    }
    const data = await fetchJson(
      `/api/customer-change-requests?companyId=${encodeURIComponent(activeCompanyId)}&status=pending`
    );
    requestsCache = Array.isArray(data.requests) ? data.requests : [];
    updatesMeta.textContent = `${requestsCache.length} pending update(s).`;
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
    detailCard.style.display = "block";
  } catch (err) {
    detailHint.textContent = err?.message ? String(err.message) : "Unable to load update.";
  }
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
