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
let selectedTypeImage = null;
let typeAiBusy = false;

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
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("prompt", String(prompt));
  body.append("image", file);
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

async function uploadImage({ companyId, file }) {
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", file);
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
  typeForm.description.value = item.description || "";
  typeForm.terms.value = item.terms || "";
  categorySelect.value = item.category_id || "";
  typeForm.dailyRate.value = item.daily_rate || "";
  typeForm.weeklyRate.value = item.weekly_rate || "";
  typeForm.monthlyRate.value = item.monthly_rate || "";
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
}

categorySelect.addEventListener("change", (e) => {
  if (e.target.value === "__new_category__") {
    e.target.value = "";
    openCategoryModal();
  }
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

  if (payload.imageUrl === "") payload.imageUrl = null;

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

    const uploadedUrls = [];
    for (const file of pendingTypeFiles) {
      if (!file?.size) continue;
      const url = await uploadImage({ companyId: activeCompanyId, file });
      uploadedUrls.push(url);
    }

    const finalUrls = [...existingUrls, ...uploadedUrls];
    payload.imageUrls = finalUrls;
    payload.imageUrl = finalUrls[0] || null;

    const res = await fetch(isEdit ? `/api/equipment-types/${editingTypeId}` : "/api/equipment-types", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      for (const url of uploadedUrls) await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
      throw new Error(data.error || "Unable to save type");
    }
    const saved = await res.json().catch(() => null);
    companyMeta.textContent = isEdit ? "Type updated." : "Type added.";

    for (const url of deleteAfterSave) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    pendingTypeFiles = [];
    syncFileInputFiles(typeForm.imageFiles, []);
    clearDeleteTypeImageUrls();
    setTypeImageUrls(finalUrls);
    renderTypeImages();

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
if (activeCompanyId) {
  setCompany(activeCompanyId);
} else {
  companyMeta.textContent = "Log in to continue.";
}

stockDaysSelect?.addEventListener("change", () => {
  loadStockSeries().catch(() => null);
});

syncTypeAiTools();
