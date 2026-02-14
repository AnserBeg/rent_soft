const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const editingSoId = params.get("id");
const selectedCustomerIdParam = params.get("selectedCustomerId");

const soMeta = document.getElementById("so-meta");
const formTitle = document.getElementById("form-title");
const deleteSoBtn = document.getElementById("delete-so");
const soForm = document.getElementById("sales-order-form");
const customerSelect = document.getElementById("customer-select");
const customerSearchInput = document.getElementById("customer-search-input");
const customerSuggestions = document.getElementById("customer-suggestions");
const customerPoInput = document.getElementById("customer-po");
const salesSelect = document.getElementById("sales-select");
const customerDetailsEl = document.getElementById("customer-details");
const equipmentSelect = document.getElementById("equipment-select");
const equipmentSearchInput = document.getElementById("equipment-search-input");
const equipmentSuggestions = document.getElementById("equipment-suggestions");
const equipmentSelectedList = document.getElementById("equipment-selected");
const statusInput = document.getElementById("status-input");
const soImagesRow = document.getElementById("sales-order-images");
const clearSoImagesBtn = document.getElementById("remove-sales-images");
const closeSoBtn = document.getElementById("close-so");
const openSoBtn = document.getElementById("open-so");
const documentList = document.getElementById("sales-documents-list");
const salesModal = document.getElementById("sales-modal");
const closeSalesModalBtn = document.getElementById("close-sales-modal");
const salesForm = document.getElementById("sales-form");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let equipmentCache = [];
let customersCache = [];
let salesCache = [];
let pendingFiles = [];
let pendingDocuments = [];
let selectedCustomerId = Number.isFinite(Number(selectedCustomerIdParam)) ? Number(selectedCustomerIdParam) : null;

function updateModeLabels() {
  if (editingSoId) {
    formTitle.textContent = "Sales order";
    deleteSoBtn.style.display = "inline-flex";
  } else {
    formTitle.textContent = "Sales order";
    deleteSoBtn.style.display = "none";
  }
  syncStatusActions();
}

function syncStatusActions() {
  if (!closeSoBtn || !openSoBtn) return;
  if (!editingSoId) {
    closeSoBtn.style.display = "none";
    openSoBtn.style.display = "none";
    return;
  }
  const isClosed = String(statusInput?.value || "open").toLowerCase() === "closed";
  closeSoBtn.style.display = isClosed ? "none" : "inline-flex";
  openSoBtn.style.display = isClosed ? "inline-flex" : "none";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function submitSalesOrderForm() {
  if (!soForm) return;
  if (typeof soForm.requestSubmit === "function") {
    soForm.requestSubmit();
    return;
  }
  soForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function safeParseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const raw = value.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function syncFileInputFiles(inputEl, files) {
  if (!inputEl) return;
  const dt = new DataTransfer();
  (files || []).forEach((f) => dt.items.add(f));
  inputEl.files = dt.files;
}

function getSoImageUrls() {
  return safeParseJsonArray(soForm?.imageUrls?.value).filter(Boolean).map(String);
}

function setSoImageUrls(urls) {
  if (!soForm?.imageUrls) return;
  const normalized = (urls || []).filter(Boolean).map(String);
  soForm.imageUrls.value = JSON.stringify(normalized);
  if (soForm.imageUrl) soForm.imageUrl.value = normalized[0] || "";
}

function getDeleteImageUrls() {
  return safeParseJsonArray(soForm?.dataset?.deleteImageUrls).filter(Boolean).map(String);
}

function addDeleteImageUrl(url) {
  if (!url || !soForm) return;
  const existing = new Set(getDeleteImageUrls());
  existing.add(String(url));
  soForm.dataset.deleteImageUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteImageUrls() {
  if (!soForm) return;
  delete soForm.dataset.deleteImageUrls;
}

function renderSoImages() {
  if (!soImagesRow) return;
  soImagesRow.replaceChildren();

  const existingUrls = getSoImageUrls();
  existingUrls.forEach((url) => {
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "url";
    tile.dataset.url = url;
    tile.innerHTML = `
      <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <button type="button" class="ghost small danger" data-action="remove-existing" data-url="${url}">Remove</button>
    `;
    soImagesRow.appendChild(tile);
  });

  pendingFiles.forEach((file, idx) => {
    const objectUrl = URL.createObjectURL(file);
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "pending";
    tile.dataset.index = String(idx);
    tile.innerHTML = `
      <img class="thumb" src="${objectUrl}" alt="" loading="lazy" />
      <button type="button" class="ghost small danger" data-action="remove-pending" data-index="${idx}">Remove</button>
    `;
    soImagesRow.appendChild(tile);
    tile.querySelector("img")?.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(objectUrl);
      },
      { once: true }
    );
  });

  const hasAny = existingUrls.length > 0 || pendingFiles.length > 0;
  if (clearSoImagesBtn) clearSoImagesBtn.style.display = hasAny ? "inline-flex" : "none";
}

function webpFileName(name) {
  const base = String(name || "image").replace(/\.[^/.]+$/, "");
  return `${base || "image"}.webp`;
}

async function decodeImageForCanvas(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch (_) {
      // fall through
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unable to read image."));
    };
    img.src = url;
  });
}

async function convertImageToWebpFile(file, quality = 0.88) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;
  if (String(file.type || "").toLowerCase() === "image/webp") return file;
  let decoded;
  try {
    decoded = await decodeImageForCanvas(file);
  } catch (_) {
    return file;
  }
  const width = decoded?.width || decoded?.naturalWidth || 0;
  const height = decoded?.height || decoded?.naturalHeight || 0;
  if (!width || !height) return file;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.toBlob) return file;
  ctx.drawImage(decoded, 0, 0, width, height);
  if (typeof decoded?.close === "function") decoded.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  if (!blob || blob.type !== "image/webp") return file;
  return new File([blob], webpFileName(file.name), {
    type: "image/webp",
    lastModified: file.lastModified || Date.now(),
  });
}

async function uploadImage({ companyId, file }) {
  const prepared = await convertImageToWebpFile(file);
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", prepared);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image");
  if (!data.url) throw new Error("Upload did not return an image url");
  return data.url;
}

async function deleteUploadedImage({ companyId, url }) {
  if (!url) return;
  const res = await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete image");
}

function normalizeDocument(doc) {
  if (!doc) return null;
  if (typeof doc === "string") return { url: doc };
  if (typeof doc !== "object") return null;
  const url = String(doc.url || "").trim();
  if (!url) return null;
  const sizeRaw = doc.sizeBytes ?? doc.size_bytes;
  const sizeNum = Number(sizeRaw);
  return {
    url,
    fileName: doc.fileName || doc.file_name || "",
    mime: doc.mime || doc.mimetype || "",
    sizeBytes: Number.isFinite(sizeNum) ? sizeNum : null,
  };
}

function getSoDocuments() {
  const docs = safeParseJsonArray(soForm?.documents?.value);
  return docs.map(normalizeDocument).filter(Boolean);
}

function setSoDocuments(docs) {
  if (!soForm?.documents) return;
  const normalized = (docs || []).map(normalizeDocument).filter(Boolean);
  soForm.documents.value = JSON.stringify(normalized);
}

function getDeleteDocumentUrls() {
  return safeParseJsonArray(soForm?.dataset?.deleteDocumentUrls).filter(Boolean).map(String);
}

function addDeleteDocumentUrl(url) {
  if (!url || !soForm) return;
  const existing = new Set(getDeleteDocumentUrls());
  existing.add(String(url));
  soForm.dataset.deleteDocumentUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteDocumentUrls() {
  if (!soForm) return;
  delete soForm.dataset.deleteDocumentUrls;
}

function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  return `${Math.round(size / 1024)} KB`;
}

function renderSoDocuments() {
  if (!documentList) return;
  documentList.replaceChildren();

  const existingDocs = getSoDocuments();
  existingDocs.forEach((doc) => {
    const row = document.createElement("div");
    row.className = "attachment-row";

    const link = document.createElement("a");
    link.href = String(doc.url || "");
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = doc.fileName || doc.url.split("/").pop() || "Document";
    row.appendChild(link);

    const hint = document.createElement("span");
    hint.className = "hint";
    const mimeText = doc.mime ? ` - ${doc.mime}` : "";
    const sizeText = formatFileSize(doc.sizeBytes);
    hint.textContent = `${mimeText}${sizeText ? ` - ${sizeText}` : ""}`.trim();
    row.appendChild(hint);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost small danger";
    removeBtn.dataset.action = "remove-existing-document";
    removeBtn.dataset.url = String(doc.url || "");
    removeBtn.textContent = "Remove";
    row.appendChild(removeBtn);

    documentList.appendChild(row);
  });

  pendingDocuments.forEach((file, idx) => {
    const row = document.createElement("div");
    row.className = "attachment-row";

    const name = document.createElement("span");
    name.textContent = file?.name || "Pending document";
    row.appendChild(name);

    const hint = document.createElement("span");
    hint.className = "hint";
    const sizeText = formatFileSize(file?.size);
    hint.textContent = `Pending upload${sizeText ? ` - ${sizeText}` : ""}`;
    row.appendChild(hint);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "ghost small danger";
    removeBtn.dataset.action = "remove-pending-document";
    removeBtn.dataset.index = String(idx);
    removeBtn.textContent = "Remove";
    row.appendChild(removeBtn);

    documentList.appendChild(row);
  });

  if (!existingDocs.length && !pendingDocuments.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No documents added yet.";
    documentList.appendChild(empty);
  }
}

async function uploadFile({ companyId, file }) {
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("file", file);
  const res = await fetch("/api/uploads/file", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload file");
  if (!data.url) throw new Error("Upload did not return a url");
  return data;
}

async function deleteUploadedFile({ companyId, url }) {
  if (!url) return;
  const res = await fetch("/api/uploads/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete file");
}

function buildEquipmentLabel(item) {
  if (!item) return "Unit";
  const name = item.model_name || item.modelName || item.type || item.type_name || "Unit";
  const serial = item.serial_number || item.serialNumber || "";
  return serial ? `${name} (${serial})` : name;
}

function equipmentModelName(item) {
  return String(item?.model_name || item?.modelName || item?.type || item?.type_name || "").trim();
}

function equipmentSerial(item) {
  return String(item?.serial_number || item?.serialNumber || item?.serial || item?.id || "").trim();
}

function sortEquipmentByModel(items) {
  return [...(items || [])].sort((a, b) => {
    const am = equipmentModelName(a).toLowerCase();
    const bm = equipmentModelName(b).toLowerCase();
    if (am < bm) return -1;
    if (am > bm) return 1;
    const as = equipmentSerial(a).toLowerCase();
    const bs = equipmentSerial(b).toLowerCase();
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });
}

function equipmentSearchKey(item) {
  return `${buildEquipmentLabel(item)} ${equipmentModelName(item)} ${equipmentSerial(item)}`.toLowerCase();
}

function getSelectedEquipmentId() {
  if (!equipmentSelect) return "";
  return equipmentSelect.value ? String(equipmentSelect.value) : "";
}

function labelForEquipmentId(equipmentId) {
  const match = equipmentCache.find((item) => String(item.id) === String(equipmentId));
  return buildEquipmentLabel(match) || `Unit ${equipmentId}`;
}

function syncEquipmentSearchInput({ preserveIfActive = false } = {}) {
  if (!equipmentSearchInput) return;
  if (preserveIfActive && document.activeElement === equipmentSearchInput) return;
  const selectedId = getSelectedEquipmentId();
  equipmentSearchInput.value = selectedId ? labelForEquipmentId(selectedId) : "";
}

function renderSelectedEquipment() {
  if (!equipmentSelectedList) return;
  equipmentSelectedList.replaceChildren();
  const selectedId = getSelectedEquipmentId();
  if (!selectedId) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No asset selected.";
    equipmentSelectedList.appendChild(empty);
    return;
  }
  const pill = document.createElement("span");
  pill.className = "selection-pill";
  pill.dataset.equipmentId = String(selectedId);
  const label = labelForEquipmentId(selectedId);
  pill.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <button type="button" data-remove-equipment="${escapeHtml(String(selectedId))}" aria-label="Remove asset">x</button>
    `;
  equipmentSelectedList.appendChild(pill);
}

function hideEquipmentSuggestions() {
  if (!equipmentSuggestions || !equipmentSearchInput) return;
  equipmentSuggestions.hidden = true;
  equipmentSuggestions.replaceChildren();
  equipmentSearchInput.setAttribute("aria-expanded", "false");
}

function renderEquipmentSuggestions({ term = "", showAll = false } = {}) {
  if (!equipmentSuggestions || !equipmentSearchInput) return;
  const query = String(term || "").trim().toLowerCase();
  if (!query && !showAll) {
    hideEquipmentSuggestions();
    return;
  }

  const available = sortEquipmentByModel(equipmentCache);
  const filtered = query
    ? available.filter((item) => equipmentSearchKey(item).includes(query))
    : available;

  equipmentSuggestions.replaceChildren();
  const selectedId = getSelectedEquipmentId();

  if (!available.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No assets found.";
    equipmentSuggestions.appendChild(empty);
  } else if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No matching assets.";
    equipmentSuggestions.appendChild(empty);
  } else {
    filtered.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.equipmentId = String(item.id);
      const label = buildEquipmentLabel(item);
      const isSelected = selectedId && String(item.id) === String(selectedId);
      if (isSelected) btn.disabled = true;
      btn.innerHTML = `
        <div class="rs-autocomplete-primary">${escapeHtml(label)}</div>
        <div class="rs-autocomplete-secondary">${isSelected ? "Selected" : "Click to select"}</div>
      `;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectEquipmentFromSuggestion(item.id);
      });
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        selectEquipmentFromSuggestion(item.id);
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        selectEquipmentFromSuggestion(item.id);
      });
      equipmentSuggestions.appendChild(btn);
    });
  }

  equipmentSuggestions.hidden = false;
  equipmentSearchInput.setAttribute("aria-expanded", "true");
}

function setSelectedEquipmentId(equipmentId) {
  if (!equipmentSelect) return;
  equipmentSelect.value = equipmentId ? String(equipmentId) : "";
  equipmentSelect.dispatchEvent(new Event("change", { bubbles: true }));
}

function selectEquipmentFromSuggestion(equipmentId) {
  if (!equipmentId) return;
  setSelectedEquipmentId(equipmentId);
  hideEquipmentSuggestions();
  syncEquipmentSearchInput();
  renderSelectedEquipment();
}

function customerLabelFor(customer) {
  return customer?.company_name || customer?.companyName || customer?.name || "";
}

function customerSecondaryFor(customer) {
  const parts = [
    customer?.contact_name || customer?.contactName || "",
    customer?.email || "",
    customer?.phone || "",
  ].filter(Boolean);
  return parts.join(" - ");
}

function findCustomerById(id) {
  return customersCache.find((c) => String(c.id) === String(id)) || null;
}

function syncCustomerSearchInput({ preserveIfActive = false } = {}) {
  if (!customerSearchInput) return;
  if (preserveIfActive && document.activeElement === customerSearchInput) return;
  const customer = selectedCustomerId ? findCustomerById(selectedCustomerId) : null;
  customerSearchInput.value = customer ? customerLabelFor(customer) : "";
}

function hideCustomerSuggestions() {
  if (!customerSuggestions) return;
  customerSuggestions.hidden = true;
  customerSuggestions.replaceChildren();
  customerSearchInput?.setAttribute("aria-expanded", "false");
}

function renderCustomerSuggestions({ term = "", showAll = false } = {}) {
  if (!customerSuggestions) return;
  const query = String(term || "").trim().toLowerCase();
  if (!query && !showAll) {
    hideCustomerSuggestions();
    return;
  }

  const matches = query
    ? customersCache.filter((c) => {
      const haystack = [
        customerLabelFor(c),
        c.contact_name,
        c.contactName,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    : customersCache;

  customerSuggestions.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No matching customers.";
    customerSuggestions.appendChild(empty);
  } else {
    matches.forEach((customer) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.customerId = String(customer.id);
      const secondary = customerSecondaryFor(customer);
      btn.innerHTML = `
        <div class="rs-autocomplete-primary">${escapeHtml(customerLabelFor(customer))}</div>
        ${secondary ? `<div class="rs-autocomplete-secondary">${escapeHtml(secondary)}</div>` : ""}
      `;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectCustomerFromSuggestion(String(customer.id));
      });
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        selectCustomerFromSuggestion(String(customer.id));
      });
      customerSuggestions.appendChild(btn);
    });
  }

  const addNewBtn = document.createElement("button");
  addNewBtn.type = "button";
  addNewBtn.dataset.customerId = "__new__";
  addNewBtn.innerHTML = `
    <div class="rs-autocomplete-primary">+ Add new customer...</div>
  `;
  addNewBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    selectCustomerFromSuggestion("__new__");
  });
  addNewBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    selectCustomerFromSuggestion("__new__");
  });
  customerSuggestions.appendChild(addNewBtn);

  customerSuggestions.hidden = false;
  customerSearchInput?.setAttribute("aria-expanded", "true");
}

function selectCustomerFromSuggestion(customerId) {
  if (!customerSelect) return;
  customerSelect.value = customerId ? String(customerId) : "";
  customerSelect.dispatchEvent(new Event("change", { bubbles: true }));
  hideCustomerSuggestions();
  syncCustomerSearchInput();
}

function renderCustomerDetails() {
  const customerId = selectedCustomerId ? Number(selectedCustomerId) : null;
  const customer = customersCache.find((c) => Number(c.id) === Number(customerId));
  if (!customerDetailsEl) return;

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
      <div class="detail-value">${escapeHtml(value || "")}</div>
    </div>`;

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
  `;

  const inlineBtn = customerDetailsEl.querySelector("#edit-customer-inline");
  inlineBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!activeCompanyId || !selectedCustomerId) return;
    const url = new URL("customers-form.html", window.location.origin);
    url.searchParams.set("id", String(selectedCustomerId));
    url.searchParams.set("returnTo", "sales-order-form.html");
    url.searchParams.set("returnSelect", "customer");
    if (editingSoId) url.searchParams.set("returnOrderId", String(editingSoId));
    window.location.href = url.pathname + url.search;
  });
}

async function loadEquipment() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch equipment");
  const data = await res.json();
  equipmentCache = sortEquipmentByModel(Array.isArray(data.equipment) ? data.equipment : []);
  equipmentSelect.innerHTML = `<option value="">Select asset</option>`;
  equipmentCache.forEach((unit) => {
    const opt = document.createElement("option");
    opt.value = unit.id;
    opt.textContent = buildEquipmentLabel(unit);
    equipmentSelect.appendChild(opt);
  });
  syncEquipmentSearchInput();
  renderSelectedEquipment();
}

async function loadCustomers() {
  if (!activeCompanyId || !customerSelect) return;
  const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch customers");
  const data = await res.json();
  customersCache = data.customers || [];
  customerSelect.innerHTML = `<option value="">Select customer</option>`;
  customersCache.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.company_name || c.companyName || c.name || "";
    customerSelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = "__new__";
  addOpt.textContent = "+ Add new customer...";
  customerSelect.appendChild(addOpt);

  if (Number.isFinite(Number(selectedCustomerIdParam))) {
    selectedCustomerId = Number(selectedCustomerIdParam);
  }
  if (selectedCustomerId) {
    customerSelect.value = String(selectedCustomerId);
  }
  syncCustomerSearchInput();
  renderCustomerDetails();
}

async function loadSalesPeople() {
  if (!activeCompanyId || !salesSelect) return;
  const res = await fetch(`/api/sales-people?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch sales people");
  const data = await res.json();
  salesCache = data.sales || [];
  salesSelect.innerHTML = `<option value="">Select salesperson</option>`;
  salesCache.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name;
    salesSelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = "__new_sales__";
  addOpt.textContent = "+ Add salesperson...";
  salesSelect.appendChild(addOpt);
}

async function loadSalesOrder() {
  if (!editingSoId) return;
  const res = await fetch(`/api/sales-orders/${editingSoId}?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to load sales order");
  const data = await res.json();
  const order = data.salesOrder;
  if (!order) throw new Error("Sales order not found.");

  const preferredCustomerId = Number.isFinite(Number(selectedCustomerIdParam))
    ? Number(selectedCustomerIdParam)
    : (order.customer_id || order.customerId);
  if (Number.isFinite(Number(preferredCustomerId))) {
    selectedCustomerId = Number(preferredCustomerId);
    if (customerSelect) customerSelect.value = String(selectedCustomerId);
  } else {
    selectedCustomerId = null;
    if (customerSelect) customerSelect.value = "";
  }
  if (customerPoInput) customerPoInput.value = order.customer_po || order.customerPo || "";
  if (salesSelect) {
    const sp = order.salesperson_id || order.salespersonId;
    salesSelect.value = sp ? String(sp) : "";
  }
  syncCustomerSearchInput();
  renderCustomerDetails();

  equipmentSelect.value = order.equipment_id || "";
  syncEquipmentSearchInput();
  renderSelectedEquipment();
  if (statusInput) statusInput.value = order.status || "open";
  soForm.salePrice.value = order.sale_price === null || order.sale_price === undefined ? "" : order.sale_price;
  soForm.description.value = order.description || "";

  setSoImageUrls(Array.isArray(order.image_urls) ? order.image_urls : (order.image_url ? [order.image_url] : []));
  pendingFiles = [];
  syncFileInputFiles(soForm.imageFiles, []);
  clearDeleteImageUrls();
  renderSoImages();

  pendingDocuments = [];
  syncFileInputFiles(soForm.documentFiles, []);
  clearDeleteDocumentUrls();
  setSoDocuments(order.documents || []);
  renderSoDocuments();

  if (soMeta) {
    const label = order.so_number || order.soNumber || `SO #${order.id}`;
    const unitLabel = buildEquipmentLabel(order);
    soMeta.textContent = `${label} - ${unitLabel}`;
  }
  syncStatusActions();
}

soForm.imageFiles?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingFiles = pendingFiles.concat(next);
  syncFileInputFiles(soForm.imageFiles, pendingFiles);
  renderSoImages();
});

soImagesRow?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;
  if (!action) return;
  if (action === "remove-existing") {
    const url = btn.dataset.url;
    const next = getSoImageUrls().filter((u) => u !== url);
    setSoImageUrls(next);
    addDeleteImageUrl(url);
    renderSoImages();
  }
  if (action === "remove-pending") {
    const idx = Number(btn.dataset.index);
    if (Number.isFinite(idx)) {
      pendingFiles = pendingFiles.filter((_, i) => i !== idx);
      syncFileInputFiles(soForm.imageFiles, pendingFiles);
      renderSoImages();
    }
  }
});

clearSoImagesBtn?.addEventListener("click", () => {
  const existing = getSoImageUrls();
  existing.forEach((url) => addDeleteImageUrl(url));
  setSoImageUrls([]);
  pendingFiles = [];
  syncFileInputFiles(soForm.imageFiles, []);
  renderSoImages();
});

soForm.documentFiles?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingDocuments = pendingDocuments.concat(next);
  syncFileInputFiles(soForm.documentFiles, pendingDocuments);
  renderSoDocuments();
});

documentList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;
  if (!action) return;
  if (action === "remove-existing-document") {
    const url = btn.dataset.url;
    const nextDocs = getSoDocuments().filter((doc) => doc.url !== url);
    setSoDocuments(nextDocs);
    addDeleteDocumentUrl(url);
    renderSoDocuments();
  }
  if (action === "remove-pending-document") {
    const idx = Number(btn.dataset.index);
    if (Number.isFinite(idx)) {
      pendingDocuments = pendingDocuments.filter((_, i) => i !== idx);
      syncFileInputFiles(soForm.documentFiles, pendingDocuments);
      renderSoDocuments();
    }
  }
});

soForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;

  const payload = getFormData(soForm);
  delete payload.imageFiles;
  delete payload.documentFiles;
  if (!payload.equipmentId) return;

  payload.companyId = activeCompanyId;
  payload.equipmentId = Number(payload.equipmentId);
  payload.customerId = payload.customerId ? Number(payload.customerId) : null;
  if (!Number.isFinite(payload.customerId)) payload.customerId = null;
  payload.salespersonId = payload.salespersonId ? Number(payload.salespersonId) : null;
  if (!Number.isFinite(payload.salespersonId)) payload.salespersonId = null;
  payload.customerPo = payload.customerPo ? String(payload.customerPo) : null;
  payload.salePrice = payload.salePrice ? Number(payload.salePrice) : null;
  if (!payload.description) payload.description = null;

  const existingUrls = getSoImageUrls();
  const deleteAfterSave = new Set(getDeleteImageUrls());
  const existingDocs = getSoDocuments();
  const deleteDocsAfterSave = new Set(getDeleteDocumentUrls());

  try {
    const uploadedUrls = [];
    for (const file of pendingFiles) {
      if (!file?.size) continue;
      const url = await uploadImage({ companyId: activeCompanyId, file });
      uploadedUrls.push(url);
    }
    const finalUrls = [...existingUrls, ...uploadedUrls];
    payload.imageUrls = finalUrls;
    payload.imageUrl = finalUrls[0] || null;

    const uploadedDocs = [];
    for (const file of pendingDocuments) {
      if (!file?.size) continue;
      const doc = await uploadFile({ companyId: activeCompanyId, file });
      uploadedDocs.push(doc);
    }
    const finalDocs = [...existingDocs, ...uploadedDocs];
    payload.documents = finalDocs;

    const res = await fetch(editingSoId ? `/api/sales-orders/${editingSoId}` : "/api/sales-orders", {
      method: editingSoId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      for (const url of uploadedUrls) {
        await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
      }
      for (const doc of uploadedDocs) {
        await deleteUploadedFile({ companyId: activeCompanyId, url: doc?.url }).catch(() => null);
      }
      return;
    }

    for (const url of deleteAfterSave) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    for (const url of deleteDocsAfterSave) {
      await deleteUploadedFile({ companyId: activeCompanyId, url }).catch(() => null);
    }

    window.location.href = "sales-orders.html";
  } catch (err) {
    console.error(err);
  }
});

customerSelect?.addEventListener("change", (e) => {
  if (e.target.value === "__new__") {
    e.target.value = "";
    if (!activeCompanyId) return;
    const url = new URL("customers-form.html", window.location.origin);
    url.searchParams.set("returnTo", "sales-order-form.html");
    url.searchParams.set("returnSelect", "customer");
    if (editingSoId) url.searchParams.set("returnOrderId", String(editingSoId));
    window.location.href = url.pathname + url.search;
    return;
  }
  selectedCustomerId = e.target.value ? Number(e.target.value) : null;
  syncCustomerSearchInput();
  renderCustomerDetails();
});

customerSearchInput?.addEventListener("focus", () => {
  renderCustomerSuggestions({ term: customerSearchInput.value, showAll: true });
});

customerSearchInput?.addEventListener("input", () => {
  renderCustomerSuggestions({ term: customerSearchInput.value, showAll: true });
});

customerSearchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideCustomerSuggestions();
    syncCustomerSearchInput();
    return;
  }
  if (e.key === "ArrowDown") {
    const first = customerSuggestions?.querySelector?.("button[data-customer-id]");
    if (first) {
      e.preventDefault();
      first.focus();
    }
    return;
  }
  if (e.key === "Enter") {
    const term = String(customerSearchInput.value || "").trim();
    if (!term) {
      e.preventDefault();
      if (selectedCustomerId) selectCustomerFromSuggestion("");
      else hideCustomerSuggestions();
      return;
    }
    const first = customerSuggestions?.querySelector?.("button[data-customer-id]");
    if (first) {
      e.preventDefault();
      selectCustomerFromSuggestion(first.dataset.customerId);
      return;
    }
    const exact = customersCache.find(
      (c) => customerLabelFor(c).toLowerCase() === term.toLowerCase()
    );
    if (exact) {
      e.preventDefault();
      selectCustomerFromSuggestion(String(exact.id));
    }
  }
});

customerSearchInput?.addEventListener("blur", () => {
  setTimeout(() => {
    if (customerSuggestions?.contains(document.activeElement)) return;
    hideCustomerSuggestions();
    syncCustomerSearchInput();
  }, 80);
});

customerSuggestions?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-customer-id]");
  if (!btn) return;
  e.preventDefault();
  selectCustomerFromSuggestion(btn.dataset.customerId);
});

equipmentSelect?.addEventListener("change", () => {
  syncEquipmentSearchInput();
  renderSelectedEquipment();
});

equipmentSearchInput?.addEventListener("focus", () => {
  renderEquipmentSuggestions({ term: equipmentSearchInput.value, showAll: true });
});

equipmentSearchInput?.addEventListener("input", () => {
  renderEquipmentSuggestions({ term: equipmentSearchInput.value, showAll: true });
});

equipmentSearchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideEquipmentSuggestions();
    syncEquipmentSearchInput();
    return;
  }
  if (e.key === "ArrowDown") {
    renderEquipmentSuggestions({ term: equipmentSearchInput.value, showAll: true });
    const first = equipmentSuggestions?.querySelector?.("button[data-equipment-id]");
    if (first) {
      e.preventDefault();
      first.focus();
    }
    return;
  }
  if (e.key === "Enter") {
    const first = equipmentSuggestions?.querySelector?.("button[data-equipment-id]");
    if (first) {
      e.preventDefault();
      first.click();
      return;
    }
    const term = String(equipmentSearchInput.value || "").trim();
    if (!term) {
      e.preventDefault();
      hideEquipmentSuggestions();
      syncEquipmentSearchInput();
      return;
    }
    const available = sortEquipmentByModel(equipmentCache);
    const exact = available.find(
      (item) => buildEquipmentLabel(item).toLowerCase() === term.toLowerCase()
    );
    if (exact) {
      e.preventDefault();
      selectEquipmentFromSuggestion(exact.id);
    }
  }
});

equipmentSearchInput?.addEventListener("blur", () => {
  setTimeout(() => {
    if (equipmentSuggestions?.contains(document.activeElement)) return;
    hideEquipmentSuggestions();
    syncEquipmentSearchInput();
  }, 80);
});

equipmentSuggestions?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-equipment-id]");
  if (!btn) return;
  e.preventDefault();
  selectEquipmentFromSuggestion(btn.dataset.equipmentId);
});

equipmentSelectedList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-remove-equipment]");
  if (!btn) return;
  e.preventDefault();
  setSelectedEquipmentId("");
  renderSelectedEquipment();
  syncEquipmentSearchInput();
});

document.addEventListener("click", (e) => {
  if (!customerSuggestions || !customerSearchInput) return;
  const target = e.target;
  if (customerSearchInput.contains(target) || customerSuggestions.contains(target)) return;
  hideCustomerSuggestions();
  syncCustomerSearchInput();
});

document.addEventListener("click", (e) => {
  if (!equipmentSuggestions || !equipmentSearchInput) return;
  const target = e.target;
  if (
    equipmentSearchInput.contains(target)
    || equipmentSuggestions.contains(target)
    || equipmentSelectedList?.contains(target)
  ) {
    return;
  }
  hideEquipmentSuggestions();
  syncEquipmentSearchInput();
});

function openSalesModal() {
  salesModal?.classList.add("show");
}

function closeSalesModal() {
  salesModal?.classList.remove("show");
  salesForm?.reset();
}

salesSelect?.addEventListener("change", (e) => {
  if (e.target.value === "__new_sales__") {
    e.target.value = "";
    openSalesModal();
    return;
  }
});

closeSalesModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSalesModal();
});

salesModal?.addEventListener("click", (e) => {
  if (e.target === salesModal) closeSalesModal();
});

salesForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const payload = Object.fromEntries(new FormData(salesForm).entries());
  payload.companyId = activeCompanyId;
  try {
    const res = await fetch("/api/sales-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to add salesperson");
    closeSalesModal();
    await loadSalesPeople();
    if (data?.id && salesSelect) {
      salesSelect.value = String(data.id);
    }
  } catch (err) {
    console.error(err);
  }
});

closeSoBtn?.addEventListener("click", () => {
  if (!statusInput) return;
  statusInput.value = "closed";
  syncStatusActions();
  submitSalesOrderForm();
});

openSoBtn?.addEventListener("click", () => {
  if (!statusInput) return;
  statusInput.value = "open";
  syncStatusActions();
  submitSalesOrderForm();
});

deleteSoBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId || !editingSoId) return;
  if (!window.confirm("Delete this sales order?")) return;
  const res = await fetch(`/api/sales-orders/${editingSoId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  if (!res.ok) return;
  window.location.href = "sales-orders.html";
});

async function init() {
  if (!activeCompanyId) {
    updateModeLabels();
    return;
  }
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  updateModeLabels();
  await loadCustomers();
  await loadSalesPeople();
  await loadEquipment();
  await loadSalesOrder();
  renderSoImages();
  renderSoDocuments();
  syncStatusActions();
}

init();
