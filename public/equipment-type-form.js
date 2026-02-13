const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const initialTypeId = params.get("id");
const returnTo = params.get("returnTo");

const companyMeta = document.getElementById("company-meta");
const backToList = document.getElementById("back-to-list");

const modeLabel = document.getElementById("mode-label");
const formTitle = document.getElementById("form-title");
const deleteTypeBtn = document.getElementById("delete-type");
const typeForm = document.getElementById("type-form");
const categorySelect = document.getElementById("category-select");
const qboItemSelect = document.getElementById("qbo-item-select");
const qboItemHint = document.getElementById("qbo-item-hint");
const qboItemRefreshBtn = document.getElementById("qbo-item-refresh");

const typeImagesRow = document.getElementById("type-images");
const clearTypeImagesBtn = document.getElementById("remove-type-image");

const typeAiTools = document.getElementById("type-ai-tools");
const typeAiPreset = document.getElementById("type-ai-preset");
const typeAiPrompt = document.getElementById("type-ai-prompt");
const typeAiApplyBtn = document.getElementById("type-ai-apply");
const typeAiStatus = document.getElementById("type-ai-status");
const typeImageModal = document.getElementById("type-image-modal");
const openTypeImageModalBtn = document.getElementById("open-type-image-modal");
const closeTypeImageModalBtn = document.getElementById("close-type-image-modal");

const typeDocumentsInput = document.getElementById("type-documents-input");
const typeDocumentsList = document.getElementById("type-documents-list");

const categoryModal = document.getElementById("category-modal");
const closeCategoryModalBtn = document.getElementById("close-category-modal");
const categoryModalForm = document.getElementById("category-modal-form");

const stockChartCard = document.getElementById("type-stock-chart-card");
const stockDaysSelect = document.getElementById("type-stock-days");
const stockChartCanvas = document.getElementById("type-stock-chart");
const stockImageWrap = document.getElementById("type-stock-image-wrap");
const stockImageEl = document.getElementById("type-stock-image");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let editingTypeId = initialTypeId ? Number(initialTypeId) : null;
let typesCache = [];
let stockChart = null;
let pendingTypeFiles = [];
let pendingTypeDocuments = [];
let selectedTypeImage = null;
let typeAiBusy = false;
let qboConnected = false;
let qboItemsCache = [];

const TYPE_AI_PRESETS = {
  "clean-white":
    "Isolate the main subject (the equipment) and place it on a clean, pure white background. Remove distractions, improve lighting, reduce glare, and keep logos/text accurate. Make it look sharp and professional for an inventory listing.",
  "thumbnail-26-27":
    "The image has been placed on a canvas with a 26:27 aspect ratio. Isolate the main subject completely and place it on a clean, pure white background. Remove all original background elements and distractions. Ensure the subject is well-lit, sharp, and professional.",
  enhance:
    "Enhance this equipment photo for an inventory listing: correct white balance, improve lighting and contrast, reduce noise, sharpen details, and keep the colors realistic. Do not change the product design or branding.",
  "remove-bg":
    "Remove the background from the main subject and replace it with a transparent background. Keep the subject edges clean and preserve fine details.",
};

function updateModeLabels() {
  if (editingTypeId) {
    modeLabel.textContent = `Edit type #${editingTypeId}`;
    formTitle.textContent = "Edit equipment type";
    deleteTypeBtn.style.display = "inline-flex";
  } else {
    modeLabel.textContent = "New type";
    formTitle.textContent = "Equipment type";
    deleteTypeBtn.style.display = "none";
  }
  if (stockChartCard) stockChartCard.style.display = editingTypeId ? "block" : "none";
  if (!editingTypeId && stockImageWrap) stockImageWrap.hidden = true;
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

function setQboItemHint(message) {
  if (!qboItemHint) return;
  qboItemHint.textContent = message ? String(message) : "";
}

function renderQboItems() {
  if (!qboItemSelect) return;
  const selected = String(typeForm?.qboItemId?.value || qboItemSelect.value || "").trim();
  const sorted = (qboItemsCache || [])
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  qboItemSelect.innerHTML = `<option value=\"\">Select a QBO item</option>`;
  sorted.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.id || "");
    const label = item.name || `Item ${item.id || ""}`;
    opt.textContent = item.active === false ? `${label} (inactive)` : label;
    qboItemSelect.appendChild(opt);
  });

  if (selected) {
    const exists = sorted.some((item) => String(item.id || "") === selected);
    if (!exists) {
      const opt = document.createElement("option");
      opt.value = selected;
      opt.textContent = "Current item (not found)";
      opt.selected = true;
      qboItemSelect.appendChild(opt);
    } else {
      qboItemSelect.value = selected;
    }
  }
}

async function loadQboStatus() {
  if (!activeCompanyId || !qboItemSelect) return;
  try {
    const res = await fetch(`/api/qbo/status?companyId=${encodeURIComponent(String(activeCompanyId))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load QBO status");
    qboConnected = !!data.connected;
    qboItemSelect.disabled = !qboConnected;
    if (qboItemRefreshBtn) qboItemRefreshBtn.disabled = !qboConnected;
    setQboItemHint(
      qboConnected
        ? "Select the matching QuickBooks item by name."
        : "Connect QuickBooks Online to load items."
    );
  } catch (err) {
    qboConnected = false;
    if (qboItemRefreshBtn) qboItemRefreshBtn.disabled = true;
    qboItemSelect.disabled = true;
    setQboItemHint(err?.message ? String(err.message) : "Unable to load QBO status.");
  }
}

async function loadQboItems() {
  if (!activeCompanyId || !qboItemSelect) return;
  if (!qboConnected) {
    setQboItemHint("Connect QuickBooks Online to load items.");
    renderQboItems();
    return;
  }
  setQboItemHint("Loading QBO items...");
  try {
    const res = await fetch(`/api/qbo/items?companyId=${encodeURIComponent(String(activeCompanyId))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load QBO items");
    qboItemsCache = Array.isArray(data.items) ? data.items : [];
    setQboItemHint(`Loaded ${qboItemsCache.length} QBO items.`);
    renderQboItems();
  } catch (err) {
    setQboItemHint(err?.message ? String(err.message) : "Unable to load QBO items.");
  }
}

function getTypeImageUrls() {
  return safeParseJsonArray(typeForm?.imageUrls?.value).filter(Boolean).map(String);
}

function setTypeImageUrls(urls) {
  if (!typeForm?.imageUrls) return;
  const normalized = (urls || []).filter(Boolean).map(String);
  typeForm.imageUrls.value = JSON.stringify(normalized);
  if (typeForm.imageUrl) typeForm.imageUrl.value = normalized[0] || "";
}

function getDeleteTypeImageUrls() {
  return safeParseJsonArray(typeForm?.dataset?.deleteImageUrls).filter(Boolean).map(String);
}

function addDeleteTypeImageUrl(url) {
  if (!url || !typeForm) return;
  const existing = new Set(getDeleteTypeImageUrls());
  existing.add(String(url));
  typeForm.dataset.deleteImageUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteTypeImageUrls() {
  if (!typeForm) return;
  delete typeForm.dataset.deleteImageUrls;
}

function normalizeTypeDocument(doc) {
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

function getTypeDocuments() {
  const docs = safeParseJsonArray(typeForm?.documents?.value);
  return docs.map(normalizeTypeDocument).filter(Boolean);
}

function setTypeDocuments(docs) {
  if (!typeForm?.documents) return;
  const normalized = (docs || []).map(normalizeTypeDocument).filter(Boolean);
  typeForm.documents.value = JSON.stringify(normalized);
}

function getDeleteTypeDocumentUrls() {
  return safeParseJsonArray(typeForm?.dataset?.deleteDocumentUrls).filter(Boolean).map(String);
}

function addDeleteTypeDocumentUrl(url) {
  if (!url || !typeForm) return;
  const existing = new Set(getDeleteTypeDocumentUrls());
  existing.add(String(url));
  typeForm.dataset.deleteDocumentUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteTypeDocumentUrls() {
  if (!typeForm) return;
  delete typeForm.dataset.deleteDocumentUrls;
}

function formatFileSize(sizeBytes) {
  const size = Number(sizeBytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  if (size < 1024) return `${size} B`;
  return `${Math.round(size / 1024)} KB`;
}

function renderTypeDocuments() {
  if (!typeDocumentsList) return;
  typeDocumentsList.replaceChildren();

  const existingDocs = getTypeDocuments();
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

    typeDocumentsList.appendChild(row);
  });

  pendingTypeDocuments.forEach((file, idx) => {
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

    typeDocumentsList.appendChild(row);
  });

  if (!existingDocs.length && !pendingTypeDocuments.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No documents added yet.";
    typeDocumentsList.appendChild(empty);
  }
}

function updateStockImage() {
  if (!stockImageWrap || !stockImageEl) return;
  const url = getTypeImageUrls()[0] || null;
  if (!url) {
    stockImageWrap.hidden = true;
    stockImageEl.removeAttribute("src");
    return;
  }
  stockImageEl.src = url;
  stockImageWrap.hidden = false;
}

function renderTypeImages() {
  if (!typeImagesRow) return;
  typeImagesRow.replaceChildren();

  const existingUrls = getTypeImageUrls();
  existingUrls.forEach((url) => {
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "url";
    tile.dataset.url = url;
    if (selectedTypeImage?.kind === "url" && selectedTypeImage.url === url) tile.classList.add("selected");
    tile.innerHTML = `
      <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <button type="button" class="ghost small danger" data-action="remove-existing" data-url="${url}">Remove</button>
    `;
    typeImagesRow.appendChild(tile);
  });

  pendingTypeFiles.forEach((file, idx) => {
    const objectUrl = URL.createObjectURL(file);
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "pending";
    tile.dataset.index = String(idx);
    if (selectedTypeImage?.kind === "pending" && Number(selectedTypeImage.index) === idx) tile.classList.add("selected");
    tile.innerHTML = `
      <img class="thumb" src="${objectUrl}" alt="" loading="lazy" />
      <button type="button" class="ghost small danger" data-action="remove-pending" data-index="${idx}">Remove</button>
    `;
    typeImagesRow.appendChild(tile);
    tile.querySelector("img")?.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(objectUrl);
      },
      { once: true }
    );
  });

  const hasAny = existingUrls.length > 0 || pendingTypeFiles.length > 0;
  if (clearTypeImagesBtn) clearTypeImagesBtn.style.display = hasAny ? "inline-flex" : "none";
  updateStockImage();
  ensureSelectedTypeImage();
  syncTypeAiTools();
}

function ensureSelectedTypeImage() {
  const existingUrls = getTypeImageUrls();

  if (selectedTypeImage?.kind === "url") {
    if (existingUrls.includes(selectedTypeImage.url)) return;
  }

  if (selectedTypeImage?.kind === "pending") {
    const idx = Number(selectedTypeImage.index);
    if (Number.isFinite(idx) && idx >= 0 && idx < pendingTypeFiles.length) return;
  }

  if (existingUrls[0]) {
    selectedTypeImage = { kind: "url", url: existingUrls[0] };
    return;
  }

  if (pendingTypeFiles[0]) {
    selectedTypeImage = { kind: "pending", index: 0 };
    return;
  }

  selectedTypeImage = null;
}

function setTypeAiStatus(message) {
  if (!typeAiStatus) return;
  typeAiStatus.textContent = message ? String(message) : "";
}

function getTypeAiPrompt() {
  const preset = typeAiPreset ? String(typeAiPreset.value || "") : "clean-white";
  const prompt = typeAiPrompt ? String(typeAiPrompt.value || "").trim() : "";
  if (prompt) return prompt;
  if (preset !== "custom" && TYPE_AI_PRESETS[preset]) return TYPE_AI_PRESETS[preset];
  return "";
}

function syncTypeAiTools() {
  if (!typeAiTools) return;

  const hasSelection = !!selectedTypeImage;
  const canUse = hasSelection && !!activeCompanyId;
  typeAiTools.hidden = !canUse;

  if (typeAiApplyBtn) typeAiApplyBtn.disabled = !canUse || typeAiBusy;
  if (canUse && typeAiStatus && !String(typeAiStatus.textContent || "").trim() && !typeAiBusy) {
    typeAiStatus.textContent = "Tip: click a thumbnail to select it, then apply a preset or custom prompt.";
  }

  if (typeAiPreset && typeAiPrompt) {
    const preset = String(typeAiPreset.value || "");
    if (preset !== "custom" && TYPE_AI_PRESETS[preset] && !String(typeAiPrompt.value || "").trim()) {
      typeAiPrompt.value = TYPE_AI_PRESETS[preset];
    }
  }
}

function openTypeImageModal() {
  if (!typeImageModal) return;
  typeImageModal.classList.add("show");
  renderTypeImages();
  setTypeAiStatus("");
  syncTypeAiTools();
}

function closeTypeImageModal() {
  if (!typeImageModal) return;
  typeImageModal.classList.remove("show");
}

async function aiEditImageFromFile({ companyId, file, prompt }) {
  const prepared = await convertImageToWebpFile(file);
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("prompt", String(prompt));
  body.append("image", prepared);
  const res = await fetch("/api/ai/image-edit", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to process image with AI");
  if (!data.url) throw new Error("AI did not return an image url");
  return data.url;
}

async function aiEditImageFromUrl({ companyId, url, prompt }) {
  const res = await fetch("/api/ai/image-edit-from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url, prompt }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to process image with AI");
  if (!data.url) throw new Error("AI did not return an image url");
  return data.url;
}

async function applyAiToSelectedTypeImage() {
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  if (!selectedTypeImage) return;

  const prompt = getTypeAiPrompt();
  if (!prompt) {
    setTypeAiStatus("Add a prompt first.");
    return;
  }

  if (typeAiBusy) return;
  typeAiBusy = true;
  setTypeAiStatus("Processing…");
  syncTypeAiTools();

  try {
    if (selectedTypeImage.kind === "pending") {
      const idx = Number(selectedTypeImage.index);
      const file = pendingTypeFiles[idx];
      if (!file) throw new Error("Selected file no longer exists.");

      const url = await aiEditImageFromFile({ companyId: activeCompanyId, file, prompt });
      pendingTypeFiles = pendingTypeFiles.filter((_, i) => i !== idx);
      syncFileInputFiles(typeForm.imageFiles, pendingTypeFiles);

      const nextUrls = getTypeImageUrls().concat([url]);
      setTypeImageUrls(nextUrls);
      selectedTypeImage = { kind: "url", url };
      renderTypeImages();
      setTypeAiStatus("AI image added.");
      return;
    }

    if (selectedTypeImage.kind === "url") {
      const oldUrl = selectedTypeImage.url;
      const newUrl = await aiEditImageFromUrl({ companyId: activeCompanyId, url: oldUrl, prompt });
      const nextUrls = getTypeImageUrls().map((u) => (u === oldUrl ? newUrl : u));
      setTypeImageUrls(nextUrls);
      addDeleteTypeImageUrl(oldUrl);
      selectedTypeImage = { kind: "url", url: newUrl };
      renderTypeImages();
      setTypeAiStatus("AI image created.");
      return;
    }
  } catch (err) {
    setTypeAiStatus(err.message || "AI processing failed.");
  } finally {
    typeAiBusy = false;
    syncTypeAiTools();
  }
}

function openCategoryModal() {
  categoryModal.classList.add("show");
}

function closeCategoryModal() {
  categoryModal.classList.remove("show");
  categoryModalForm.reset();
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

async function loadCategories() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment-categories?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch categories");
    const data = await res.json();
    categorySelect.innerHTML = `<option value="">Select a category</option>`;
    (data.categories || []).forEach((cat) => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
    const addOpt = document.createElement("option");
    addOpt.value = "__new_category__";
    addOpt.textContent = "+ Add new category...";
    categorySelect.appendChild(addOpt);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadTypes() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment-types?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch types");
    const data = await res.json();
    typesCache = data.types || [];
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadType() {
  if (!activeCompanyId || !editingTypeId) return;
  await loadTypes();
  const item = typesCache.find((t) => Number(t.id) === Number(editingTypeId));
  if (!item) {
    companyMeta.textContent = "Type not found for this company.";
    return;
  }
  typeForm.name.value = item.name || "";
  pendingTypeFiles = [];
  syncFileInputFiles(typeForm.imageFiles, []);
  clearDeleteTypeImageUrls();
  setTypeImageUrls(Array.isArray(item.image_urls) ? item.image_urls : (item.image_url ? [item.image_url] : []));
  renderTypeImages();
  pendingTypeDocuments = [];
  syncFileInputFiles(typeForm.documentFiles, []);
  clearDeleteTypeDocumentUrls();
  setTypeDocuments(item.documents || []);
  renderTypeDocuments();
  typeForm.description.value = item.description || "";
  typeForm.terms.value = item.terms || "";
  categorySelect.value = item.category_id || "";
  typeForm.dailyRate.value = item.daily_rate || "";
  typeForm.weeklyRate.value = item.weekly_rate || "";
  typeForm.monthlyRate.value = item.monthly_rate || "";
  if (typeForm.qboItemId) typeForm.qboItemId.value = item.qbo_item_id || "";
  renderQboItems();
  await loadStockSeries().catch(() => null);
}

function colorForIndex(i) {
  const palette = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#06b6d4", "#7c3aed", "#64748b"];
  return palette[i % palette.length];
}

async function loadStockSeries() {
  if (!activeCompanyId || !editingTypeId || !stockChartCanvas) return;
  if (typeof Chart === "undefined") return;

  const days = stockDaysSelect ? Number(stockDaysSelect.value) || 30 : 30;
  const from = new Date();
  from.setHours(0, 0, 0, 0);

  const res = await fetch(
    `/api/equipment-types/${editingTypeId}/availability-series?companyId=${activeCompanyId}&from=${encodeURIComponent(from.toISOString())}&days=${days}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load stock chart");

  const labels = Array.isArray(data.dates) ? data.dates.map((d) => String(d).slice(5)) : [];
  const series = Array.isArray(data.series) ? data.series : [];
  const datasets = series.map((s, idx) => ({
    label: `${s.locationName} (${s.total})`,
    data: Array.isArray(s.values) ? s.values : [],
    borderColor: colorForIndex(idx),
    backgroundColor: "transparent",
    tension: 0.25,
    borderWidth: 2,
    pointRadius: 0,
  }));

  if (stockChart) stockChart.destroy();
  stockChart = new Chart(stockChartCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt) => {
        // Make the whole chart a click target (line points have pointRadius=0).
        // If the user clicks anywhere on the plot area, jump to Equipment filtered by this type.
        window.location.href = `equipment.html?typeId=${encodeURIComponent(String(editingTypeId))}`;
      },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true, pointStyle: "line" } },
        tooltip: { mode: "index", intersect: false },
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Available" } },
        x: { ticks: { maxRotation: 0 }, grid: { display: false }, title: { display: true, text: "Date" } },
      },
    },
  });
}

function setCompany(id) {
  activeCompanyId = id ? Number(id) : null;
  if (activeCompanyId) {
    window.RentSoft?.setCompanyId?.(activeCompanyId);
  }
  companyMeta.textContent = activeCompanyId ? `Using company #${activeCompanyId}` : "";
  if (backToList) {
    backToList.href = returnTo || "types.html";
  }
  loadCategories();
  if (editingTypeId) loadType();
  if (qboItemSelect) {
    loadQboStatus()
      .then(() => loadQboItems())
      .catch(() => null);
  }
}

categorySelect.addEventListener("change", (e) => {
  if (e.target.value === "__new_category__") {
    e.target.value = "";
    openCategoryModal();
  }
});

qboItemRefreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadQboStatus()
    .then(() => loadQboItems())
    .catch(() => null);
});

openTypeImageModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openTypeImageModal();
});

closeTypeImageModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeTypeImageModal();
});

typeImageModal?.addEventListener("click", (e) => {
  if (e.target === typeImageModal) closeTypeImageModal();
});

typeForm.imageFiles?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingTypeFiles = pendingTypeFiles.concat(next);
  syncFileInputFiles(typeForm.imageFiles, pendingTypeFiles);
  renderTypeImages();
});

typeDocumentsInput?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingTypeDocuments = pendingTypeDocuments.concat(next);
  syncFileInputFiles(typeForm.documentFiles, pendingTypeDocuments);
  renderTypeDocuments();
});

typeImagesRow?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;

  if (!action) {
    const tile = e.target.closest?.(".thumb-tile");
    if (!tile) return;
    const kind = tile.dataset.kind;
    if (kind === "url" && tile.dataset.url) {
      selectedTypeImage = { kind: "url", url: String(tile.dataset.url) };
      renderTypeImages();
    } else if (kind === "pending") {
      const idx = Number(tile.dataset.index);
      if (!Number.isFinite(idx) || idx < 0) return;
      selectedTypeImage = { kind: "pending", index: idx };
      renderTypeImages();
    }
    return;
  }

  if (action === "remove-existing") {
    const url = btn.dataset.url;
    if (!url) return;
    const nextUrls = getTypeImageUrls().filter((u) => u !== url);
    setTypeImageUrls(nextUrls);
    addDeleteTypeImageUrl(url);
    if (selectedTypeImage?.kind === "url" && selectedTypeImage.url === url) selectedTypeImage = null;
    renderTypeImages();
    return;
  }

  if (action === "remove-pending") {
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0) return;
    pendingTypeFiles = pendingTypeFiles.filter((_, i) => i !== idx);
    syncFileInputFiles(typeForm.imageFiles, pendingTypeFiles);
    if (selectedTypeImage?.kind === "pending" && Number(selectedTypeImage.index) === idx) selectedTypeImage = null;
    renderTypeImages();
  }
});

typeDocumentsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;
  if (!action) return;

  if (action === "remove-existing-document") {
    const url = btn.dataset.url;
    if (!url) return;
    const nextDocs = getTypeDocuments().filter((doc) => doc.url !== url);
    setTypeDocuments(nextDocs);
    addDeleteTypeDocumentUrl(url);
    renderTypeDocuments();
    return;
  }

  if (action === "remove-pending-document") {
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0) return;
    pendingTypeDocuments = pendingTypeDocuments.filter((_, i) => i !== idx);
    syncFileInputFiles(typeForm.documentFiles, pendingTypeDocuments);
    renderTypeDocuments();
  }
});

clearTypeImagesBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const existingUrls = getTypeImageUrls();
  existingUrls.forEach((u) => addDeleteTypeImageUrl(u));
  pendingTypeFiles = [];
  syncFileInputFiles(typeForm.imageFiles, []);
  setTypeImageUrls([]);
  selectedTypeImage = null;
  renderTypeImages();
});

typeAiPreset?.addEventListener("change", () => {
  if (!typeAiPrompt) return;
  const preset = String(typeAiPreset.value || "");
  if (preset !== "custom" && TYPE_AI_PRESETS[preset]) typeAiPrompt.value = TYPE_AI_PRESETS[preset];
  syncTypeAiTools();
});

typeAiApplyBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  applyAiToSelectedTypeImage();
});

typeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }

  const isEdit = !!editingTypeId;
  const payload = Object.fromEntries(new FormData(typeForm).entries());
  payload.companyId = activeCompanyId;
  delete payload.imageFiles;
  delete payload.documentFiles;

  if (payload.imageUrl === "") payload.imageUrl = null;
  if (typeForm?.qboItemId) {
    const qboValue = String(typeForm.qboItemId.value || "").trim();
    payload.qboItemId = qboValue || null;
  }

  ["dailyRate", "weeklyRate", "monthlyRate"].forEach((key) => {
    if (payload[key] === "") payload[key] = null;
    else payload[key] = Number(payload[key]);
  });

  if (payload.categoryId === "__new_category__") {
    openCategoryModal();
    return;
  }
  if (payload.categoryId === "") payload.categoryId = null;

  try {
    const existingUrls = getTypeImageUrls();
    const deleteAfterSave = new Set(getDeleteTypeImageUrls());
    const existingDocs = getTypeDocuments();
    const deleteDocsAfterSave = new Set(getDeleteTypeDocumentUrls());

    const uploadedUrls = [];
    for (const file of pendingTypeFiles) {
      if (!file?.size) continue;
      const url = await uploadImage({ companyId: activeCompanyId, file });
      uploadedUrls.push(url);
    }

    const finalUrls = [...existingUrls, ...uploadedUrls];
    payload.imageUrls = finalUrls;
    payload.imageUrl = finalUrls[0] || null;

    const uploadedDocs = [];
    for (const file of pendingTypeDocuments) {
      if (!file?.size) continue;
      const uploaded = await uploadFile({ companyId: activeCompanyId, file });
      uploadedDocs.push(uploaded);
    }

    const finalDocs = existingDocs.concat(uploadedDocs).map(normalizeTypeDocument).filter(Boolean);
    payload.documents = finalDocs;

    const res = await fetch(isEdit ? `/api/equipment-types/${editingTypeId}` : "/api/equipment-types", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      for (const url of uploadedUrls) await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
      for (const doc of uploadedDocs) {
        await deleteUploadedFile({ companyId: activeCompanyId, url: doc?.url }).catch(() => null);
      }
      throw new Error(data.error || "Unable to save type");
    }
    const saved = await res.json().catch(() => null);
    companyMeta.textContent = isEdit ? "Type updated." : "Type added.";

    for (const url of deleteAfterSave) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    for (const url of deleteDocsAfterSave) {
      await deleteUploadedFile({ companyId: activeCompanyId, url }).catch(() => null);
    }
    pendingTypeFiles = [];
    syncFileInputFiles(typeForm.imageFiles, []);
    clearDeleteTypeImageUrls();
    setTypeImageUrls(finalUrls);
    renderTypeImages();
    pendingTypeDocuments = [];
    syncFileInputFiles(typeForm.documentFiles, []);
    clearDeleteTypeDocumentUrls();
    setTypeDocuments(finalDocs);
    renderTypeDocuments();

    if (!isEdit && saved?.id) {
      editingTypeId = saved.id;
      updateModeLabels();
      const url = new URL(window.location.href);
      url.searchParams.set("id", saved.id);
      if (returnTo) url.searchParams.set("returnTo", returnTo);
      window.history.replaceState({}, "", url.toString());
    }
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

deleteTypeBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingTypeId || !activeCompanyId) return;
  try {
    const existingUrls = getTypeImageUrls();
    const existingDocs = getTypeDocuments();
    const res = await fetch(`/api/equipment-types/${editingTypeId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to delete type");
    }
    for (const url of existingUrls) await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    for (const doc of existingDocs) {
      await deleteUploadedFile({ companyId: activeCompanyId, url: doc?.url }).catch(() => null);
    }
    companyMeta.textContent = "Type deleted.";
    setTimeout(() => {
      window.location.href = returnTo || "types.html";
    }, 400);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

categoryModalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  const payload = Object.fromEntries(new FormData(categoryModalForm).entries());
  payload.companyId = activeCompanyId;
  try {
    const res = await fetch("/api/equipment-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to add category");
    }
    closeCategoryModal();
    companyMeta.textContent = "Category added.";
    await loadCategories();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

closeCategoryModalBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeCategoryModal();
});

categoryModal.addEventListener("click", (e) => {
  if (e.target === categoryModal) closeCategoryModal();
});

// Init
updateModeLabels();
setTypeDocuments([]);
renderTypeDocuments();
if (activeCompanyId) {
  setCompany(activeCompanyId);
} else {
  companyMeta.textContent = "Log in to continue.";
}

stockDaysSelect?.addEventListener("change", () => {
  loadStockSeries().catch(() => null);
});

syncTypeAiTools();
