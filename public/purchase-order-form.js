const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const editingPoId = params.get("id");

const poMeta = document.getElementById("po-meta");
const modeLabel = document.getElementById("mode-label");
const formTitle = document.getElementById("form-title");
const deletePoBtn = document.getElementById("delete-po");
const poForm = document.getElementById("purchase-order-form");
const vendorSelect = document.getElementById("vendor-select");
const typeSelect = document.getElementById("type-select");
const statusInput = document.getElementById("status-input");
const locationSelect = document.getElementById("location-select");
const currentLocationSelect = document.getElementById("current-location-select");
const poImagesRow = document.getElementById("po-images");
const clearPoImagesBtn = document.getElementById("remove-po-images");
const closePoBtn = document.getElementById("close-po");
const openPoBtn = document.getElementById("open-po");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let vendorsCache = [];
let typesCache = [];
let locationsCache = [];
let pendingFiles = [];
const closeRequiredFields = [
  "modelName",
  "serialNumber",
  "condition",
  "manufacturer",
  "locationId",
  "purchasePrice",
];

function updateModeLabels() {
  if (editingPoId) {
    if (modeLabel) modeLabel.textContent = `Edit PO #${editingPoId}`;
    formTitle.textContent = "Purchase order";
    deletePoBtn.style.display = "inline-flex";
  } else {
    if (modeLabel) modeLabel.textContent = "New purchase order";
    formTitle.textContent = "Purchase order";
    deletePoBtn.style.display = "none";
  }
  syncStatusActions();
}

function syncCloseRequirements() {
  const closing = String(statusInput?.value || "open").toLowerCase() === "closed";
  closeRequiredFields.forEach((name) => {
    const field = poForm?.elements?.[name];
    if (field && "required" in field) field.required = closing;
  });
}

function syncStatusActions() {
  if (!closePoBtn || !openPoBtn) return;
  if (!editingPoId) {
    closePoBtn.style.display = "none";
    openPoBtn.style.display = "none";
    return;
  }
  const isClosed = String(statusInput?.value || "open").toLowerCase() === "closed";
  closePoBtn.style.display = isClosed ? "none" : "inline-flex";
  openPoBtn.style.display = isClosed ? "inline-flex" : "none";
}

function submitPurchaseOrderForm() {
  if (!poForm) return;
  if (typeof poForm.requestSubmit === "function") {
    poForm.requestSubmit();
    return;
  }
  poForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function getFormData(form) {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function toDateInputValue(value) {
  if (!value) return "";
  if (value instanceof Date && Number.isFinite(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  if (!raw) return "";
  const tIndex = raw.indexOf("T");
  if (tIndex > 0) return raw.slice(0, tIndex);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toISOString().slice(0, 10);
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

function getPoImageUrls() {
  return safeParseJsonArray(poForm?.imageUrls?.value).filter(Boolean).map(String);
}

function setPoImageUrls(urls) {
  if (!poForm?.imageUrls) return;
  const normalized = (urls || []).filter(Boolean).map(String);
  poForm.imageUrls.value = JSON.stringify(normalized);
  if (poForm.imageUrl) poForm.imageUrl.value = normalized[0] || "";
}

function getDeleteImageUrls() {
  return safeParseJsonArray(poForm?.dataset?.deleteImageUrls).filter(Boolean).map(String);
}

function addDeleteImageUrl(url) {
  if (!url || !poForm) return;
  const existing = new Set(getDeleteImageUrls());
  existing.add(String(url));
  poForm.dataset.deleteImageUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteImageUrls() {
  if (!poForm) return;
  delete poForm.dataset.deleteImageUrls;
}

function renderPoImages() {
  if (!poImagesRow) return;
  poImagesRow.replaceChildren();

  const existingUrls = getPoImageUrls();
  existingUrls.forEach((url) => {
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "url";
    tile.dataset.url = url;
    tile.innerHTML = `
      <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <button type="button" class="ghost small danger" data-action="remove-existing" data-url="${url}">Remove</button>
    `;
    poImagesRow.appendChild(tile);
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
    poImagesRow.appendChild(tile);
    tile.querySelector("img")?.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(objectUrl);
      },
      { once: true }
    );
  });

  const hasAny = existingUrls.length > 0 || pendingFiles.length > 0;
  if (clearPoImagesBtn) clearPoImagesBtn.style.display = hasAny ? "inline-flex" : "none";
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

async function loadVendors() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/vendors?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch vendors");
  const data = await res.json();
  vendorsCache = data.vendors || [];
  vendorSelect.innerHTML = `<option value="">Select vendor</option>`;
  vendorsCache.forEach((vendor) => {
    const opt = document.createElement("option");
    opt.value = vendor.id;
    opt.textContent = vendor.company_name;
    vendorSelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = "__new_vendor__";
  addOpt.textContent = "+ Add new vendor...";
  vendorSelect.appendChild(addOpt);
  if (!editingPoId) vendorSelect.value = "";
}

async function loadTypes() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/equipment-types?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch types");
  const data = await res.json();
  typesCache = data.types || [];
  typeSelect.innerHTML = `<option value="">Select type</option>`;
  typesCache.forEach((type) => {
    const opt = document.createElement("option");
    opt.value = type.id;
    opt.textContent = type.name;
    typeSelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = "__new_type__";
  addOpt.textContent = "+ Add new type...";
  typeSelect.appendChild(addOpt);
}

async function loadLocations() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/locations?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch locations");
  const data = await res.json();
  locationsCache = data.locations || [];
  locationSelect.innerHTML = `<option value="">Select a location</option>`;
  currentLocationSelect.innerHTML = `<option value="">Same as base location</option>`;
  locationsCache.forEach((loc) => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    locationSelect.appendChild(opt);
    const opt2 = document.createElement("option");
    opt2.value = loc.id;
    opt2.textContent = loc.name;
    currentLocationSelect.appendChild(opt2);
  });
}

async function loadPurchaseOrder() {
  if (!editingPoId) return;
  const res = await fetch(`/api/purchase-orders/${editingPoId}?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to load purchase order");
  const data = await res.json();
  const po = data.purchaseOrder;
  if (!po) throw new Error("Purchase order not found.");

  vendorSelect.value = po.vendor_id || "";
  typeSelect.value = po.type_id || "";
  poForm.expectedPossessionDate.value = toDateInputValue(po.expected_possession_date);
  if (statusInput) statusInput.value = po.status || "open";
  poForm.modelName.value = po.model_name || "";
  poForm.serialNumber.value = po.serial_number || "";
  poForm.condition.value = po.condition || "New";
  poForm.manufacturer.value = po.manufacturer || "";
  poForm.locationId.value = po.location_id || "";
  poForm.currentLocationId.value = po.current_location_id || "";
  poForm.purchasePrice.value = po.purchase_price || "";
  poForm.notes.value = po.notes || "";
  setPoImageUrls(Array.isArray(po.image_urls) ? po.image_urls : (po.image_url ? [po.image_url] : []));
  pendingFiles = [];
  syncFileInputFiles(poForm.imageFiles, []);
  clearDeleteImageUrls();
  renderPoImages();

  if (poMeta) {
    const label = po.po_number || po.poNumber || `PO #${po.id}`;
    const parts = [label];
    if (po.equipment_id) parts.push(`Asset #${po.equipment_id}`);
    poMeta.textContent = parts.join(" • ");
  }
  syncCloseRequirements();
  syncStatusActions();
}

function handleVendorAddSelected() {
  if (!vendorSelect || vendorSelect.value !== "__new_vendor__") return;
  vendorSelect.value = "";
  const returnTo = editingPoId ? `purchase-order-form.html?id=${editingPoId}` : "purchase-order-form.html";
  window.location.href = `vendors-form.html?returnTo=${encodeURIComponent(returnTo)}`;
}

vendorSelect?.addEventListener("change", handleVendorAddSelected);
vendorSelect?.addEventListener("input", handleVendorAddSelected);
vendorSelect?.addEventListener("click", handleVendorAddSelected);
vendorSelect?.addEventListener("blur", handleVendorAddSelected);

typeSelect?.addEventListener("change", (e) => {
  if (e.target.value === "__new_type__") {
    e.target.value = "";
    const returnTo = editingPoId ? `purchase-order-form.html?id=${editingPoId}` : "purchase-order-form.html";
    window.location.href = `equipment-type-form.html?returnTo=${encodeURIComponent(returnTo)}`;
  }
});

poForm.imageFiles?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingFiles = pendingFiles.concat(next);
  syncFileInputFiles(poForm.imageFiles, pendingFiles);
  renderPoImages();
});

poImagesRow?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;
  if (!action) return;
  if (action === "remove-existing") {
    const url = btn.dataset.url;
    const next = getPoImageUrls().filter((u) => u !== url);
    setPoImageUrls(next);
    addDeleteImageUrl(url);
    renderPoImages();
  }
  if (action === "remove-pending") {
    const idx = Number(btn.dataset.index);
    if (Number.isFinite(idx)) {
      pendingFiles = pendingFiles.filter((_, i) => i !== idx);
      syncFileInputFiles(poForm.imageFiles, pendingFiles);
      renderPoImages();
    }
  }
});

clearPoImagesBtn?.addEventListener("click", () => {
  const existing = getPoImageUrls();
  existing.forEach((url) => addDeleteImageUrl(url));
  setPoImageUrls([]);
  pendingFiles = [];
  syncFileInputFiles(poForm.imageFiles, []);
  renderPoImages();
});

poForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;

  const payload = getFormData(poForm);
  if (payload.vendorId === "__new_vendor__") {
    vendorSelect.value = "";
    return;
  }
  if (payload.typeId === "__new_type__") {
    typeSelect.value = "";
    return;
  }
  if (!payload.vendorId || !payload.typeId || !payload.expectedPossessionDate) {
    return;
  }

  const closing = String(payload.status || "open").toLowerCase() === "closed";
  if (closing) {
    const required = [
      { key: "modelName", label: "Model name" },
      { key: "serialNumber", label: "Serial number" },
      { key: "condition", label: "Condition" },
      { key: "manufacturer", label: "Manufacturer" },
      { key: "locationId", label: "Base location" },
      { key: "purchasePrice", label: "Purchase price" },
    ];
    const missing = required.filter((item) => !payload[item.key]);
    if (missing.length) {
      return;
    }
  }

  payload.companyId = activeCompanyId;
  payload.vendorId = Number(payload.vendorId);
  payload.typeId = Number(payload.typeId);
  if (payload.locationId === "") payload.locationId = null;
  if (payload.currentLocationId === "") payload.currentLocationId = null;
  if (closing && !payload.currentLocationId && payload.locationId) {
    payload.currentLocationId = payload.locationId;
  }
  payload.purchasePrice = payload.purchasePrice ? Number(payload.purchasePrice) : null;
  if (!payload.manufacturer) payload.manufacturer = null;
  if (!payload.notes) payload.notes = null;

  const existingUrls = getPoImageUrls();
  const deleteAfterSave = new Set(getDeleteImageUrls());

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

    const res = await fetch(editingPoId ? `/api/purchase-orders/${editingPoId}` : "/api/purchase-orders", {
      method: editingPoId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      for (const url of uploadedUrls) {
        await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
      }
      return;
    }

    for (const url of deleteAfterSave) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    window.location.href = "purchase-orders.html";
  } catch (err) {
    console.error(err);
  }
});

closePoBtn?.addEventListener("click", () => {
  if (!statusInput) return;
  statusInput.value = "closed";
  syncCloseRequirements();
  syncStatusActions();
  submitPurchaseOrderForm();
});

openPoBtn?.addEventListener("click", () => {
  if (!statusInput) return;
  statusInput.value = "open";
  syncCloseRequirements();
  syncStatusActions();
  submitPurchaseOrderForm();
});

deletePoBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId || !editingPoId) return;
  if (!window.confirm("Delete this purchase order?")) return;
  const res = await fetch(`/api/purchase-orders/${editingPoId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  });
  if (!res.ok) return;
  window.location.href = "purchase-orders.html";
});

async function init() {
  if (!activeCompanyId) {
    updateModeLabels();
    return;
  }
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  updateModeLabels();
  await Promise.all([loadVendors(), loadTypes(), loadLocations()]);
  await loadPurchaseOrder();
  syncCloseRequirements();
  syncStatusActions();
}

init();
