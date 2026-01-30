const companyMeta = document.getElementById("company-meta");
const equipmentForm = document.getElementById("equipment-form");
const typeSelect = document.getElementById("type-select");
const locationSelect = document.getElementById("location-select");
const currentLocationSelect = document.getElementById("current-location-select");
const openCurrentLocationPickerBtn = document.getElementById("open-current-location-picker");
const clearCurrentLocationBtn = document.getElementById("clear-current-location");
const locationCount = document.getElementById("location-count");
const equipmentTable = document.getElementById("equipment-table");
const refreshBtn = document.getElementById("refresh");
const locationModal = document.getElementById("location-modal");
const locationModalForm = document.getElementById("location-modal-form");
const closeModalBtn = document.getElementById("close-modal");
const equipmentModal = document.getElementById("equipment-modal");
const openEquipmentBtn = document.getElementById("open-equipment-modal");
const closeEquipmentBtn = document.getElementById("close-equipment-modal");
const deleteEquipmentBtn = document.getElementById("delete-equipment");
const saveEquipmentBtn = document.getElementById("save-equipment");
const searchInput = document.getElementById("search");
const equipmentImagesRow = document.getElementById("equipment-images");
const clearEquipmentImagesBtn = document.getElementById("remove-equipment-image");
const equipmentViewTableBtn = document.getElementById("equipment-view-table");
const equipmentViewCardsBtn = document.getElementById("equipment-view-cards");
const equipmentCards = document.getElementById("equipment-cards");
const equipmentFormTitle = document.getElementById("equipment-form-title");
const equipmentFormStatus = document.getElementById("equipment-form-status");
const equipmentImageModal = document.getElementById("equipment-image-modal");
const openEquipmentImageModalBtn = document.getElementById("open-equipment-image-modal");
const closeEquipmentImageModalBtn = document.getElementById("close-equipment-image-modal");

const isEquipmentFormPage = document.body?.classList.contains("equipment-form-page");

const equipmentAiTools = document.getElementById("equipment-ai-tools");
const equipmentAiPreset = document.getElementById("equipment-ai-preset");
const equipmentAiPrompt = document.getElementById("equipment-ai-prompt");
const equipmentAiApplyBtn = document.getElementById("equipment-ai-apply");
const equipmentAiStatus = document.getElementById("equipment-ai-status");

const currentLocationPickerModal = document.getElementById("current-location-picker-modal");
const closeCurrentLocationPickerBtn = document.getElementById("close-current-location-picker");
const saveCurrentLocationPickerBtn = document.getElementById("save-current-location-picker");
const currentLocationPickerSearch = document.getElementById("current-location-picker-search");
const currentLocationPickerName = document.getElementById("current-location-picker-name");
const currentLocationPickerMapEl = document.getElementById("current-location-picker-map");
const currentLocationPickerMeta = document.getElementById("current-location-picker-meta");
const currentLocationPickerSuggestions = document.getElementById("current-location-picker-suggestions");
const currentLocationPickerMapStyle = document.getElementById("current-location-picker-map-style");

const equipmentLocationHistoryDetails = document.getElementById("equipment-location-history");
const equipmentLocationHistoryList = document.getElementById("equipment-location-history-list");
const equipmentLocationHistoryMeta = document.getElementById("equipment-location-history-meta");
const equipmentExtrasDrawer = document.getElementById("equipment-extras-drawer");
const equipmentExtrasDrawerOverlay = document.getElementById("equipment-extras-drawer-overlay");
const closeEquipmentExtrasDrawerBtn = document.getElementById("close-equipment-extras-drawer");
const equipmentExtrasSubtitle = document.getElementById("equipment-extras-subtitle");
const equipmentExtrasTabButtons = Array.from(equipmentExtrasDrawer?.querySelectorAll?.("[data-tab]") || []);
const equipmentExtrasPanels = Array.from(equipmentExtrasDrawer?.querySelectorAll?.("[data-panel]") || []);
const openEquipmentLocationHistoryBtn = document.getElementById("open-equipment-location-history");
const openEquipmentWorkOrdersBtn = document.getElementById("open-equipment-work-orders");
const equipmentWorkOrdersTable = document.getElementById("equipment-work-orders-table");
const equipmentWorkOrdersMeta = document.getElementById("equipment-work-orders-meta");
const equipmentBundleLabel = document.getElementById("equipment-bundle-label");
const openBundleModalBtn = document.getElementById("open-bundle-modal");
const bundleModal = document.getElementById("bundle-modal");
const closeBundleModalBtn = document.getElementById("close-bundle-modal");
const bundleForm = document.getElementById("bundle-form");
const bundleNameInput = document.getElementById("bundle-name");
const bundlePrimarySelect = document.getElementById("bundle-primary");
const bundleItemsList = document.getElementById("bundle-items-list");
const bundleDailyRateInput = document.getElementById("bundle-daily-rate");
const bundleWeeklyRateInput = document.getElementById("bundle-weekly-rate");
const bundleMonthlyRateInput = document.getElementById("bundle-monthly-rate");
const deleteBundleBtn = document.getElementById("delete-bundle");

const pageParams = new URLSearchParams(window.location.search);
const filterTypeId = pageParams.get("typeId");
const filterTypeName = pageParams.get("type");
const filterLocationId = pageParams.get("locationId");
const initialEquipmentId = pageParams.get("equipmentId");

let equipmentCache = [];
let editingEquipmentId = null;
let sortField = "created_at";
let sortDir = "desc";
let searchTerm = "";
const VIEW_KEY = "rentsoft.equipment.view";
const LIST_STATE_KEY = "rentsoft.equipment.listState";
const ALLOWED_SORT_FIELDS = new Set([
  "created_at",
  "type",
  "model_name",
  "serial_number",
  "condition",
  "location",
  "availability_status",
  "purchase_price",
  "rental_order_number",
  "rental_customer_name",
]);
let currentView = localStorage.getItem(VIEW_KEY) || "table";
let pendingOpenEquipmentId = initialEquipmentId ? String(initialEquipmentId) : null;

let activeCompanyId = null;
let pendingEquipmentFiles = [];
let selectedEquipmentImage = null;
let equipmentAiBusy = false;
let fallbackEquipmentImageUrls = [];
let equipmentHistoryLoadedForId = null;
let equipmentWorkOrdersLoadedForId = null;
let equipmentExtrasActiveTab = "location-history";
let bundlesCache = [];
let editingBundleId = null;
let bundleSeedEquipmentId = null;

let currentLocationPicker = {
  mode: "leaflet",
  mapStyle: "street",
  google: {
    map: null,
    marker: null,
    autocomplete: null,
    autocompleteService: null,
    placesService: null,
    debounceTimer: null,
  },
  leaflet: {
    map: null,
    marker: null,
    layers: null,
    debounceTimer: null,
    searchBound: false,
  },
  selected: null, // { lat, lng, provider, query }
};

const EQUIPMENT_AI_PRESETS = {
  "clean-white":
    "Isolate the main subject (the equipment) and place it on a clean, pure white background. Remove distractions, improve lighting, reduce glare, and keep logos/text accurate. Make it look sharp and professional for an inventory listing.",
  "thumbnail-26-27":
    "The image has been placed on a canvas with a 26:27 aspect ratio. Isolate the main subject completely and place it on a clean, pure white background. Remove all original background elements and distractions. Ensure the subject is well-lit, sharp, and professional.",
  enhance:
    "Enhance this equipment photo for an inventory listing: correct white balance, improve lighting and contrast, reduce noise, sharpen details, and keep the colors realistic. Do not change the product design or branding.",
  "remove-bg":
    "Remove the background from the main subject and replace it with a transparent background. Keep the subject edges clean and preserve fine details.",
};

const conditionClasses = {
  "New": "new",
  "Normal Wear & Tear": "normal",
  "Damaged but Usable": "damage",
  "Needs Repair": "repair",
  "Unusable": "unusable",
  "Lost": "lost",
};

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function loadEquipmentListState() {
  const saved = safeJsonParse(localStorage.getItem(LIST_STATE_KEY), null);
  if (!saved || typeof saved !== "object") return;
  if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
  if (typeof saved.sortField === "string" && ALLOWED_SORT_FIELDS.has(saved.sortField)) sortField = saved.sortField;
  if (saved.sortDir === "asc" || saved.sortDir === "desc") sortDir = saved.sortDir;
}

function persistEquipmentListState() {
  localStorage.setItem(
    LIST_STATE_KEY,
    JSON.stringify({
      searchTerm: String(searchTerm || ""),
      sortField,
      sortDir,
    })
  );
}

loadEquipmentListState();
if (searchInput) {
  if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
  searchInput.value = searchTerm;
}

function clearEquipmentHeaderStatus() {
  if (!equipmentFormStatus) return;
  equipmentFormStatus.textContent = "";
  equipmentFormStatus.style.display = "none";
}

function getWorkOrderNumberForEquipment(companyId, equipmentId) {
  const cid = Number(companyId);
  const eid = Number(equipmentId);
  if (!Number.isFinite(cid) || !Number.isFinite(eid)) return null;
  const raw = localStorage.getItem(workOrdersStorageKey(cid));
  const data = safeJsonParse(raw, []);
  if (!Array.isArray(data)) return null;
  const matches = data.filter((order) => Number(order?.unitId) === eid);
  if (!matches.length) return null;
  const open = matches.filter((order) => order?.orderStatus !== "closed");
  const list = open.length ? open : matches;
  list.sort((a, b) => {
    const aTime = Date.parse(a?.updatedAt || a?.closedAt || a?.date || a?.createdAt || "");
    const bTime = Date.parse(b?.updatedAt || b?.closedAt || b?.date || b?.createdAt || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return String(a?.number || "").localeCompare(String(b?.number || ""));
  });
  const order = list[0];
  return order?.number ? String(order.number) : null;
}

function getRentalOrderLabel(item) {
  let roLabel = item?.rental_order_number ? String(item.rental_order_number).trim() : "";
  if (!roLabel && item?.rental_order_id) {
    roLabel = `RO #${item.rental_order_id}`;
  }
  return roLabel;
}

function getEquipmentStatusInfo(item, options = {}) {
  const isReturnInspection = options.isReturnInspection === true;
  const isOutOfService = options.isOutOfService === true;
  const raw =
    item?.availability_status ??
    item?.availabilityStatus ??
    item?.availability ??
    item?.status ??
    item?.state ??
    item?.rental_status;
  const normalized = String(raw || "").toLowerCase();
  const isOverdue = item?.is_overdue === true || normalized.includes("overdue");
  const isReserved = normalized.includes("reserved") || normalized.includes("request");
  const isRented = normalized.includes("rent") || normalized.includes("out");

  let key = "available";
  let label = "Available";

  if (isReturnInspection) {
    key = "return-inspection";
    label = "Return inspection";
  } else if (isOutOfService) {
    key = "out-of-service";
    label = "Out of service";
  } else if (isOverdue) {
    key = "overdue";
    label = "Overdue";
  } else if (isReserved) {
    key = "reserved";
    label = "Reserved";
  } else if (isRented) {
    key = "rented";
    label = "Rented out";
  }

  const roLabel = key === "reserved" ? getRentalOrderLabel(item) : "";
  const labelWithRo = roLabel ? `${label} (${roLabel})` : label;
  return { key, label, labelWithRo, roLabel };
}

function setEquipmentHeaderStatus(item) {
  if (!equipmentFormStatus) return;
  const status = String(item?.availability_status || "").toLowerCase();
  const showStatus = status === "rented out" || status === "overdue" || item?.is_overdue === true;
  if (!item || !showStatus) {
    clearEquipmentHeaderStatus();
    return;
  }

  let roLabel = getRentalOrderLabel(item);
  if (!roLabel) {
    clearEquipmentHeaderStatus();
    return;
  }
  const customerName = item?.rental_customer_name ? String(item.rental_customer_name).trim() : "";
  const workOrderNumber = getWorkOrderNumberForEquipment(activeCompanyId, item.id);
  const parts = [roLabel];
  if (customerName) parts.push(customerName);
  if (workOrderNumber) parts.push(`WO ${workOrderNumber}`);
  equipmentFormStatus.textContent = parts.join(" | ");
  equipmentFormStatus.style.display = "inline";
}


function setPendingSelectValue(selectEl, value) {
  if (!selectEl) return;
  const normalized = value === null || value === undefined || value === "" ? "" : String(value);
  if (!normalized) return;
  const hasOption = Array.from(selectEl.options || []).some((opt) => opt.value === normalized);
  if (hasOption) {
    selectEl.value = normalized;
    return;
  }
  selectEl.dataset.pendingValue = normalized;
}

function applyPendingSelectValue(selectEl) {
  if (!selectEl) return;
  const pending = selectEl.dataset.pendingValue;
  if (!pending) return;
  selectEl.value = pending;
  delete selectEl.dataset.pendingValue;
}

function getOutOfServiceMap(companyId) {
  if (!companyId) return new Map();
  const raw = localStorage.getItem(`rentSoft.workOrders.${companyId}`);
  const orders = safeJsonParse(raw, []);
  const map = new Map();
  if (!Array.isArray(orders)) return map;
  orders.forEach((order) => {
    if (!order?.unitId) return;
    if (order.serviceStatus === "out_of_service" && order.orderStatus !== "closed") {
      map.set(String(order.unitId), order);
    }
  });
  return map;
}

function getReturnInspectionMap(companyId) {
  if (!companyId) return new Map();
  const raw = localStorage.getItem(`rentSoft.workOrders.${companyId}`);
  const orders = safeJsonParse(raw, []);
  const map = new Map();
  if (!Array.isArray(orders)) return map;
  orders.forEach((order) => {
    if (!order?.unitId) return;
    if (order.returnInspection === true && order.orderStatus !== "closed") {
      map.set(String(order.unitId), order);
    }
  });
  return map;
}

function setCompany(id, detail) {
  activeCompanyId = id ? Number(id) : null;
  if (activeCompanyId) window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = detail || "";
  if (activeCompanyId) {
    loadLocations();
    loadEquipment();
    loadTypes();
    loadBundles();
  } else {
    locationSelect.innerHTML = `<option value="">Select a location</option><option value="__new__">+ Add new location...</option>`;
    if (currentLocationSelect) {
      currentLocationSelect.innerHTML = `<option value="">Same as base location</option><option value="__new__">+ Add new location...</option>`;
    }
    typeSelect.innerHTML = `<option value="">Select a type</option><option value="__new_type__">+ Add new type...</option>`;
    if (locationCount) locationCount.textContent = "0 locations";
    renderEquipment([]);
  }
}

function setView(nextView) {
  currentView = nextView === "cards" ? "cards" : "table";
  localStorage.setItem(VIEW_KEY, currentView);

  if (equipmentTable) equipmentTable.hidden = currentView !== "table";
  if (equipmentCards) equipmentCards.hidden = currentView !== "cards";

  equipmentViewTableBtn?.classList.toggle("active", currentView === "table");
  equipmentViewCardsBtn?.classList.toggle("active", currentView === "cards");

  renderEquipment(applyFilters());
}

function goToEquipmentForm(equipmentId) {
  const qs = equipmentId ? `?equipmentId=${encodeURIComponent(equipmentId)}` : "";
  window.location.href = `equipment-form.html${qs}`;
}

function formatMoney(v) {
  return v === null || v === undefined || v === "" ? "--" : `$${Number(v).toFixed(2)}`;
}

function renderEquipment(rows) {
  if (currentView === "cards") {
    renderEquipmentCards(rows);
    return;
  }
  renderEquipmentTable(rows);
}

function renderEquipmentTable(rows) {
  if (!equipmentTable) return;
  const outOfServiceMap = getOutOfServiceMap(activeCompanyId);
  const returnInspectionMap = getReturnInspectionMap(activeCompanyId);
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  equipmentTable.innerHTML = `
    <div class="table-row table-header">
      <span>Photo</span>
      <span class="sort ${sortField === "type" ? "active" : ""}" data-sort="type">Type ${indicator("type")}</span>
      <span class="sort ${sortField === "model_name" ? "active" : ""}" data-sort="model_name">Model ${indicator("model_name")}</span>
      <span class="sort ${sortField === "rental_order_number" ? "active" : ""}" data-sort="rental_order_number">RO ${indicator("rental_order_number")}</span>
      <span class="sort ${sortField === "rental_customer_name" ? "active" : ""}" data-sort="rental_customer_name">Customer ${indicator("rental_customer_name")}</span>
      <span class="sort ${sortField === "availability_status" ? "active" : ""}" data-sort="availability_status">Status ${indicator("availability_status")}</span>
      <span class="sort ${sortField === "location" ? "active" : ""}" data-sort="location">Base ${indicator("location")}</span>
    </div>`;

  rows.forEach((row) => {
    const badge = conditionClasses[row.condition] || "normal";
    const baseLocation = row.location || "--";
    const div = document.createElement("div");
    const isReturnInspection = returnInspectionMap.has(String(row.id));
    const isOutOfService = isReturnInspection || outOfServiceMap.has(String(row.id));
    div.className = `table-row${isOutOfService ? " is-out-of-service" : ""}`;
    div.dataset.id = row.id;
    const thumb = row.image_url
      ? `<img class="thumb" src="${row.image_url}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="thumb placeholder">--</span>`;

    const availabilityStatus = String(
      row.availability_status || row.availabilityStatus || row.status || row.state || row.rental_status || ""
    ).toLowerCase();
    const isReservedOrRequested = availabilityStatus.includes("reserved") || availabilityStatus.includes("request");
    const isRentedOrOverdue =
      availabilityStatus.includes("rent") || availabilityStatus.includes("out") || availabilityStatus.includes("overdue") || row.is_overdue === true;
    const roVal = isRentedOrOverdue || isReservedOrRequested ? getRentalOrderLabel(row) || "--" : "--";
    const custVal = isRentedOrOverdue || isReservedOrRequested ? (row.rental_customer_name || "--") : "--";
    const statusInfo = getEquipmentStatusInfo(row, { isReturnInspection, isOutOfService });
    const statusTag = `<span class="status-tag ${statusInfo.key}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(
      statusInfo.labelWithRo
    )}</span>`;

    div.innerHTML = `
      <span class="thumb-cell">${thumb}</span>
      <span>${row.type}</span>
      <span>
        ${row.model_name}
        ${isReturnInspection ? `<span class="badge return-inspection" style="margin-left:6px;">Return inspection</span>` : ""}
        ${!isReturnInspection && isOutOfService ? `<span class="badge out-of-service" style="margin-left:6px;">Out of service</span>` : ""}
      </span>
      <span>${roVal}</span>
      <span>${custVal}</span>
      <span>${statusTag}</span>
      <span>${baseLocation}</span>
    `;
    equipmentTable.appendChild(div);
  });
}

function renderEquipmentCards(rows) {
  if (!equipmentCards) return;
  equipmentCards.replaceChildren();
  const outOfServiceMap = getOutOfServiceMap(activeCompanyId);
  const returnInspectionMap = getReturnInspectionMap(activeCompanyId);

  rows.forEach((row) => {
    const card = document.createElement("div");
    const isReturnInspection = returnInspectionMap.has(String(row.id));
    const isOutOfService = isReturnInspection || outOfServiceMap.has(String(row.id));
    card.className = `equipment-card${isOutOfService ? " is-out-of-service" : ""}`;
    card.dataset.id = row.id;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "equipment-card-thumb";
    if (row.image_url) {
      const img = document.createElement("img");
      img.src = row.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      thumbWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "thumb placeholder";
      placeholder.textContent = "--";
      thumbWrap.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "equipment-card-body";

    const titleRow = document.createElement("div");
    titleRow.className = "equipment-card-title-row";

    const title = document.createElement("div");
    title.className = "equipment-card-title";
    title.textContent = row.model_name || row.serial_number || "--";

    const availability = getEquipmentStatusInfo(row, { isReturnInspection, isOutOfService });
    const status = document.createElement("span");
    if (isReturnInspection) {
      status.className = "status-tag return-inspection";
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.setAttribute("aria-hidden", "true");
      status.append(dot, document.createTextNode("Return inspection"));
    } else if (isOutOfService) {
      status.className = "status-tag out-of-service";
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.setAttribute("aria-hidden", "true");
      status.append(dot, document.createTextNode("Out of service"));
    } else {
      status.className = `status-tag ${availability.key}`;
      const dot = document.createElement("span");
      dot.className = "status-dot";
      dot.setAttribute("aria-hidden", "true");
      status.append(dot, document.createTextNode(availability.labelWithRo));
    }

    titleRow.appendChild(title);
    if (isReturnInspection) {
      const serviceBadge = document.createElement("span");
      serviceBadge.className = "badge return-inspection";
      serviceBadge.textContent = "Return inspection";
      titleRow.appendChild(serviceBadge);
    } else if (isOutOfService) {
      const serviceBadge = document.createElement("span");
      serviceBadge.className = "badge out-of-service";
      serviceBadge.textContent = "Out of service";
      titleRow.appendChild(serviceBadge);
    }
    titleRow.appendChild(status);

    const meta = document.createElement("div");
    meta.className = "equipment-card-meta";
    meta.textContent = row.type || "--";

    const details = document.createElement("div");
    details.className = "equipment-card-details";
    details.innerHTML = `
      <div><span class="equipment-card-k">Base</span><span class="equipment-card-v">${row.location || "--"}</span></div>
    `;

    body.appendChild(titleRow);
    body.appendChild(meta);
    body.appendChild(details);

    card.appendChild(thumbWrap);
    card.appendChild(body);
    equipmentCards.appendChild(card);
  });
}

async function loadLocations() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/locations?companyId=${activeCompanyId}&scope=all`);
    if (!res.ok) throw new Error("Unable to fetch locations");
    const data = await res.json();

    const locations = (data.locations || []).slice();
    const baseLocations = locations.filter((l) => l?.is_base_location === true);
    locationSelect.innerHTML = `<option value="">Select a location</option>`;
    baseLocations.forEach((loc) => {
      const option = document.createElement("option");
      option.value = loc.id;
      option.textContent = loc.name;
      locationSelect.appendChild(option);
    });
    const addOption = document.createElement("option");
    addOption.value = "__new__";
    addOption.textContent = "+ Add new location...";
    locationSelect.appendChild(addOption);

    if (currentLocationSelect) {
      currentLocationSelect.innerHTML = `<option value="">Same as base location</option>`;
      locations.forEach((loc) => {
        const option = document.createElement("option");
        option.value = loc.id;
        option.textContent = loc.name;
        currentLocationSelect.appendChild(option);
      });
      const addCurrent = document.createElement("option");
      addCurrent.value = "__new__";
      addCurrent.textContent = "+ Add new location...";
      currentLocationSelect.appendChild(addCurrent);
      applyPendingSelectValue(currentLocationSelect);
    }

    applyPendingSelectValue(locationSelect);

    if (locationCount) locationCount.textContent = `${baseLocations.length} locations`;
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
    typeSelect.innerHTML = `<option value="">Select a type</option>`;
    (data.types || []).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name + (t.category ? ` · ${t.category}` : "");
      typeSelect.appendChild(opt);
    });
    const addType = document.createElement("option");
    addType.value = "__new_type__";
    addType.textContent = "+ Add new type...";
    typeSelect.appendChild(addType);
    applyPendingSelectValue(typeSelect);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadEquipment() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch equipment");
    const data = await res.json();
    equipmentCache = data.equipment || [];
    renderEquipment(applyFilters());

    if (pendingOpenEquipmentId) {
      const item = equipmentCache.find((eq) => String(eq.id) === String(pendingOpenEquipmentId));
      pendingOpenEquipmentId = null;
      if (item) startEditEquipment(item);
    }
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadBundles() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment-bundles?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch bundles");
    const data = await res.json();
    bundlesCache = data.bundles || [];
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

function applyFilters() {
  let rows = [...equipmentCache];
  if (filterLocationId) {
    rows = rows.filter((r) => String(r.location_id || "") === String(filterLocationId));
  }
  if (filterTypeId) {
    rows = rows.filter((r) => String(r.type_id || "") === String(filterTypeId));
  } else if (filterTypeName) {
    rows = rows.filter((r) => String(r.type || "") === String(filterTypeName));
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [
        r.type,
        r.model_name,
        r.serial_number,
        r.condition,
        r.manufacturer,
        r.location,
        r.current_location,
        r.availability_status,
        r.availabilityStatus,
        r.status,
        r.state,
        r.rental_status,
        r.bundle_name,
        r.notes,
        r.rental_order_number,
        r.rental_customer_name,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }
  rows.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const get = (row) => {
      switch (sortField) {
        case "purchase_price":
          return row.purchase_price === null ? -Infinity : Number(row.purchase_price);
        case "availability_status": {
          const raw =
            row.availability_status ??
            row.availabilityStatus ??
            row.availability ??
            row.status ??
            row.state ??
            row.rental_status;
          return String(raw || "").toLowerCase();
        }
        default:
          return (row[sortField] || "").toString().toLowerCase();
      }
    };
    const av = get(a);
    const bv = get(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return rows;
}

function getFormData(form) {
  return Object.fromEntries(new FormData(form).entries());
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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getPublicConfig() {
  const res = await fetch("/api/public-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load config");
  return data || {};
}

function normalizeCompanyId() {
  const cid = activeCompanyId || window.RentSoft?.getCompanyId?.();
  return cid ? Number(cid) : null;
}

async function createLocationFromPicker({ name, latitude, longitude, provider, query }) {
  const companyId = normalizeCompanyId();
  if (!companyId) throw new Error("Select a company first.");
  const res = await fetch("/api/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      name,
      streetAddress: null,
      city: null,
      region: null,
      country: null,
      latitude,
      longitude,
      geocodeProvider: provider || "manual",
      geocodeQuery: query || null,
      isBaseLocation: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save location");
  return data;
}

function ensureUniqueLocationName(baseName) {
  const raw = String(baseName || "").trim() || "Pinned location";
  const existing = new Set();
  const addOptions = (sel) => {
    for (const opt of Array.from(sel?.options || [])) {
      const label = String(opt?.textContent || "").trim();
      if (label) existing.add(label);
    }
  };
  addOptions(locationSelect);
  addOptions(currentLocationSelect);
  if (!existing.has(raw)) return raw;
  for (let i = 2; i <= 50; i += 1) {
    const next = `${raw} (${i})`;
    if (!existing.has(next)) return next;
  }
  return `${raw} (${Date.now()})`;
}

function formatHistoryTimestamp(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function renderEquipmentLocationHistory(rows) {
  if (!equipmentLocationHistoryList) return;
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    equipmentLocationHistoryList.innerHTML = "";
    if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = "No location history yet.";
    return;
  }

  if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = `${items.length} entries`;
  equipmentLocationHistoryList.innerHTML = `
    <div class="table-row table-header">
      <span>When</span>
      <span>From</span>
      <span>To</span>
    </div>
  `;

  for (const row of items) {
    const fromLabel = row?.from_label || (row?.from_location_id ? `#${row.from_location_id}` : "Same as base");
    const toLabel = row?.to_label || (row?.to_location_id ? `#${row.to_location_id}` : "Same as base");
    const div = document.createElement("div");
    div.className = "table-row";
    div.innerHTML = `
      <span class="hint">${escapeHtml(formatHistoryTimestamp(row?.changed_at))}</span>
      <span>${escapeHtml(fromLabel)}</span>
      <span>${escapeHtml(toLabel)}</span>
    `;
    equipmentLocationHistoryList.appendChild(div);
  }
}

async function loadEquipmentLocationHistory(equipmentId) {
  const cid = normalizeCompanyId();
  const eid = Number(equipmentId);
  if (!cid || !Number.isFinite(eid)) return;
  if (!equipmentLocationHistoryList) return;

  equipmentLocationHistoryList.innerHTML = "";
  if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = "Loading...";
  const res = await fetch(
    `/api/equipment/${encodeURIComponent(eid)}/location-history?companyId=${encodeURIComponent(cid)}&limit=100`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load location history");
  renderEquipmentLocationHistory(data.rows || []);
  equipmentHistoryLoadedForId = String(eid);
}

function workOrdersStorageKey(companyId) {
  return `rentSoft.workOrders.${companyId}`;
}

function renderEquipmentWorkOrders(rows) {
  if (!equipmentWorkOrdersTable) return;
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) {
    equipmentWorkOrdersTable.innerHTML = `
      <div class="table-row table-header">
        <span>Work order</span>
        <span>Status</span>
        <span>Service</span>
        <span>Summary</span>
        <span>Updated</span>
      </div>
      <div class="table-row">
        <span class="hint" style="grid-column: 1 / -1;">No work orders yet.</span>
      </div>`;
    if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "No work orders yet.";
    return;
  }

  equipmentWorkOrdersTable.innerHTML = `
    <div class="table-row table-header">
      <span>Work order</span>
      <span>Status</span>
      <span>Service</span>
      <span>Summary</span>
      <span>Updated</span>
    </div>`;

  items.forEach((order) => {
    const statusLabel = order?.orderStatus === "closed" ? "Closed" : "Open";
    const serviceLabel = order?.serviceStatus === "out_of_service" ? "Out of service" : "In service";
    const inspectionBadge = order?.returnInspection ? ` <span class="badge return-inspection">Return inspection</span>` : "";
    const updatedLabel = formatHistoryTimestamp(order?.updatedAt || order?.closedAt || order?.date || order?.createdAt);
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = order.id;
    div.innerHTML = `
      <span>${escapeHtml(order.number || "--")}</span>
      <span>${escapeHtml(statusLabel)}</span>
      <span>${escapeHtml(serviceLabel)}${inspectionBadge}</span>
      <span>${escapeHtml(order.workSummary || "--")}</span>
      <span class="hint">${escapeHtml(updatedLabel)}</span>
    `;
    equipmentWorkOrdersTable.appendChild(div);
  });

  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = `${items.length} work order${items.length === 1 ? "" : "s"}`;
}

function loadEquipmentWorkOrders(equipmentId) {
  const cid = normalizeCompanyId();
  const eid = Number(equipmentId);
  if (!cid || !Number.isFinite(eid)) return;
  if (!equipmentWorkOrdersTable) return;

  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "Loading...";
  const raw = localStorage.getItem(workOrdersStorageKey(cid));
  const data = safeJsonParse(raw, []);
  const rows = Array.isArray(data)
    ? data.filter((order) => Number(order?.unitId) === eid)
    : [];

  rows.sort((a, b) => {
    const aTime = Date.parse(a?.updatedAt || a?.closedAt || a?.date || "");
    const bTime = Date.parse(b?.updatedAt || b?.closedAt || b?.date || "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return String(a?.number || "").localeCompare(String(b?.number || ""));
  });

  renderEquipmentWorkOrders(rows);
  equipmentWorkOrdersLoadedForId = String(eid);
}

function setEquipmentExtrasTab(tab) {
  const next = ["location-history", "work-orders"].includes(String(tab)) ? String(tab) : "location-history";
  equipmentExtrasActiveTab = next;
  equipmentExtrasTabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === next);
  });
  equipmentExtrasPanels.forEach((panel) => {
    panel.style.display = panel.getAttribute("data-panel") === next ? "block" : "none";
  });
  if (next === "location-history") {
    if (!editingEquipmentId || !activeCompanyId) {
      if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = "Save the unit first.";
      if (equipmentLocationHistoryList) equipmentLocationHistoryList.innerHTML = "";
      return;
    }
    if (!equipmentHistoryLoadedForId || equipmentHistoryLoadedForId !== String(editingEquipmentId)) {
      loadEquipmentLocationHistory(editingEquipmentId).catch((err) => {
        if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = err?.message || String(err);
      });
    }
    return;
  }

  if (!editingEquipmentId || !activeCompanyId) {
    if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "Save the unit first.";
    renderEquipmentWorkOrders([]);
    return;
  }
  if (!equipmentWorkOrdersLoadedForId || equipmentWorkOrdersLoadedForId !== String(editingEquipmentId)) {
    loadEquipmentWorkOrders(editingEquipmentId);
  }
}

function openEquipmentExtrasDrawer(tab) {
  if (!equipmentExtrasDrawer || !equipmentExtrasDrawerOverlay) return;
  equipmentExtrasDrawerOverlay.style.display = "block";
  equipmentExtrasDrawer.classList.add("open");
  equipmentExtrasDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  setEquipmentExtrasTab(tab || equipmentExtrasActiveTab);
}

function closeEquipmentExtrasDrawer() {
  if (!equipmentExtrasDrawer || !equipmentExtrasDrawerOverlay) return;
  equipmentExtrasDrawerOverlay.style.display = "none";
  equipmentExtrasDrawer.classList.remove("open");
  equipmentExtrasDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

function resetEquipmentExtrasPanels() {
  if (equipmentLocationHistoryList) equipmentLocationHistoryList.innerHTML = "";
  if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = "";
  equipmentHistoryLoadedForId = null;
  if (equipmentWorkOrdersTable) equipmentWorkOrdersTable.innerHTML = "";
  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "";
  equipmentWorkOrdersLoadedForId = null;
  if (equipmentExtrasSubtitle) equipmentExtrasSubtitle.textContent = "";
}

function openCurrentLocationPickerModal() {
  if (!currentLocationPickerModal) return;
  currentLocationPickerModal.classList.add("show");
}

function closeCurrentLocationPickerModal() {
  if (!currentLocationPickerModal) return;
  currentLocationPickerModal.classList.remove("show");
  if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "";
  if (currentLocationPickerSearch) currentLocationPickerSearch.value = "";
  if (currentLocationPickerName) currentLocationPickerName.value = "";
  if (currentLocationPickerSuggestions) currentLocationPickerSuggestions.hidden = true;
  if (currentLocationPickerSuggestions) currentLocationPickerSuggestions.replaceChildren();
  currentLocationPicker.selected = null;
}

function setPickerSelected(lat, lng, { provider, query } = {}) {
  currentLocationPicker.selected = {
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  if (currentLocationPickerMeta) {
    currentLocationPickerMeta.textContent = `Selected: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
}

function getUserGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not available."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

function parsePredictionText(prediction) {
  const main = prediction?.structured_formatting?.main_text || prediction?.description || "";
  const secondary = prediction?.structured_formatting?.secondary_text || "";
  return { main: String(main || ""), secondary: String(secondary || "") };
}

function renderPickerSuggestions(predictions, onPick) {
  if (!currentLocationPickerSuggestions) return;
  currentLocationPickerSuggestions.replaceChildren();
  const rows = Array.isArray(predictions) ? predictions : [];
  if (!rows.length) {
    currentLocationPickerSuggestions.hidden = true;
    return;
  }
  rows.slice(0, 8).forEach((p) => {
    const { main, secondary } = parsePredictionText(p);
    const btn = document.createElement("button");
    btn.type = "button";
    let picked = false;
    const pick = () => {
      if (picked) return;
      picked = true;
      onPick(p);
    };
    btn.innerHTML = `
      <div class="rs-autocomplete-primary">${escapeHtml(main)}</div>
      ${secondary ? `<div class="rs-autocomplete-secondary">${escapeHtml(secondary)}</div>` : ""}
    `;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pick();
    });
    btn.addEventListener("touchstart", (e) => {
      e.preventDefault();
      pick();
    });
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      pick();
    });
    currentLocationPickerSuggestions.appendChild(btn);
  });
  currentLocationPickerSuggestions.hidden = false;
}

function hidePickerSuggestions() {
  if (!currentLocationPickerSuggestions) return;
  currentLocationPickerSuggestions.hidden = true;
  currentLocationPickerSuggestions.replaceChildren();
}

const MAP_TILE_SOURCES = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri",
    },
  },
};

function normalizeMapStyle(value) {
  return value === "satellite" ? "satellite" : "street";
}

function applyLeafletPickerStyle(style) {
  const map = currentLocationPicker.leaflet.map;
  if (!map || !window.L) return;
  const normalized = normalizeMapStyle(style ?? currentLocationPicker.mapStyle);
  currentLocationPicker.mapStyle = normalized;
  if (!currentLocationPicker.leaflet.layers) currentLocationPicker.leaflet.layers = {};
  const layers = currentLocationPicker.leaflet.layers;
  if (!layers[normalized]) {
    const cfg = MAP_TILE_SOURCES[normalized];
    layers[normalized] = window.L.tileLayer(cfg.url, cfg.options);
  }
  Object.values(layers).forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  layers[normalized].addTo(map);
}

function applyGooglePickerStyle(style) {
  const map = currentLocationPicker.google.map;
  if (!map) return;
  const normalized = normalizeMapStyle(style ?? currentLocationPicker.mapStyle);
  currentLocationPicker.mapStyle = normalized;
  map.setMapTypeId(normalized === "satellite" ? "satellite" : "roadmap");
}

function setCurrentLocationPickerMapStyle(style) {
  const normalized = normalizeMapStyle(style ?? currentLocationPicker.mapStyle);
  currentLocationPicker.mapStyle = normalized;
  if (currentLocationPickerMapStyle && currentLocationPickerMapStyle.value !== normalized) {
    currentLocationPickerMapStyle.value = normalized;
  }
  if (currentLocationPicker.mode === "google") {
    applyGooglePickerStyle(normalized);
  } else {
    applyLeafletPickerStyle(normalized);
  }
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (window.google?.maps?.Map) return Promise.resolve(true);
  if (window.__rentsoftGoogleMapsLoading) return window.__rentsoftGoogleMapsLoading;

  window.__rentsoftGoogleMapsLoading = new Promise((resolve, reject) => {
    const id = "rentsoft-google-maps";
    const existing = document.getElementById(id);
    if (existing) return resolve(true);
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    s.onload = () => resolve(true);
    s.onerror = () => reject(new Error("Failed to load Google Maps script (network/CSP)."));
    document.head.appendChild(s);
  });
  return window.__rentsoftGoogleMapsLoading;
}

function resetPickerMapContainer() {
  if (!currentLocationPickerMapEl) return;
  try {
    currentLocationPicker.leaflet.map?.remove?.();
  } catch { }
  currentLocationPicker.leaflet.map = null;
  currentLocationPicker.leaflet.marker = null;
  currentLocationPicker.leaflet.layers = null;

  currentLocationPicker.google.map = null;
  currentLocationPicker.google.marker = null;
  currentLocationPicker.google.autocomplete = null;

  // Leaflet leaves internal bookkeeping on the element; clear it so re-init works.
  try {
    delete currentLocationPickerMapEl._leaflet_id;
  } catch { }

  currentLocationPickerMapEl.replaceChildren();
}

function initLeafletPicker(center) {
  if (!currentLocationPickerMapEl || !window.L) throw new Error("Map library not available.");
  if (!currentLocationPicker.leaflet.map) {
    const map = window.L.map(currentLocationPickerMapEl, { scrollWheelZoom: true });
    map.on("click", (e) => {
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!currentLocationPicker.leaflet.marker) {
        currentLocationPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        currentLocationPicker.leaflet.marker.on("dragend", () => {
          const ll = currentLocationPicker.leaflet.marker?.getLatLng?.();
          if (!ll) return;
          setPickerSelected(ll.lat, ll.lng, { provider: "manual_pin" });
        });
      } else {
        currentLocationPicker.leaflet.marker.setLatLng([lat, lng]);
      }
      setPickerSelected(lat, lng, { provider: "manual_pin" });
    });
    currentLocationPicker.leaflet.map = map;
  }
  applyLeafletPickerStyle(currentLocationPicker.mapStyle);
  const map = currentLocationPicker.leaflet.map;
  map.setView([center.lat, center.lng], 16);
  setTimeout(() => map.invalidateSize?.(), 50);

  if (!currentLocationPicker.leaflet.searchBound && currentLocationPickerSearch) {
    currentLocationPicker.leaflet.searchBound = true;
    currentLocationPickerSearch.addEventListener("input", () => {
      const q = String(currentLocationPickerSearch.value || "").trim();
      if (!q || q.length < 3) {
        hidePickerSuggestions();
        return;
      }
      if (currentLocationPicker.leaflet.debounceTimer) clearTimeout(currentLocationPicker.leaflet.debounceTimer);
      currentLocationPicker.leaflet.debounceTimer = setTimeout(async () => {
        const seq = (currentLocationPicker.leaflet.searchSeq || 0) + 1;
        currentLocationPicker.leaflet.searchSeq = seq;
        try {
          currentLocationPicker.leaflet.searchAbort?.abort?.();
        } catch { }
        currentLocationPicker.leaflet.searchAbort = new AbortController();
        try {
          const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}&limit=6`, {
            signal: currentLocationPicker.leaflet.searchAbort.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Unable to search");
          if (seq !== currentLocationPicker.leaflet.searchSeq) return;
          if (String(currentLocationPickerSearch.value || "").trim() !== q) return;
          const results = Array.isArray(data.results) ? data.results : [];
          renderPickerSuggestions(
            results.map((r) => ({
              description: r.label,
              place_id: null,
              __rs_lat: r.latitude,
              __rs_lng: r.longitude,
            })),
            async (p) => {
              hidePickerSuggestions();
              const lat = Number(p?.__rs_lat);
              const lng = Number(p?.__rs_lng);
              const label = String(p?.description || "").trim();
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
              if (currentLocationPickerName && !String(currentLocationPickerName.value || "").trim()) {
                currentLocationPickerName.value = ensureUniqueLocationName(label || "Pinned location");
              }
              if (!currentLocationPicker.leaflet.marker) {
                currentLocationPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
                currentLocationPicker.leaflet.marker.on("dragend", () => {
                  const ll = currentLocationPicker.leaflet.marker?.getLatLng?.();
                  if (!ll) return;
                  setPickerSelected(ll.lat, ll.lng, { provider: "manual_pin" });
                });
              } else {
                currentLocationPicker.leaflet.marker.setLatLng([lat, lng]);
              }
              map.setView([lat, lng], 17);
              setPickerSelected(lat, lng, { provider: "nominatim", query: label });
            }
          );
        } catch (err) {
          if (err?.name === "AbortError") return;
          hidePickerSuggestions();
          if (currentLocationPickerMeta) {
            const msg = err?.message || String(err);
            currentLocationPickerMeta.textContent = `${msg}. You can still click the map to drop a pin.`;
          }
        }
      }, 450);
    });

    currentLocationPickerSearch.addEventListener("blur", () => setTimeout(() => hidePickerSuggestions(), 150));
  }
}

function initGooglePicker(center) {
  if (!currentLocationPickerMapEl || !window.google?.maps) throw new Error("Google Maps not available.");
  if (!currentLocationPicker.google.map) {
    const mapStyle = normalizeMapStyle(currentLocationPicker.mapStyle);
    const map = new window.google.maps.Map(currentLocationPickerMapEl, {
      center,
      zoom: 16,
      mapTypeId: mapStyle === "satellite" ? "satellite" : "roadmap",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    map.addListener("click", (e) => {
      const lat = e?.latLng?.lat?.();
      const lng = e?.latLng?.lng?.();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!currentLocationPicker.google.marker) {
        currentLocationPicker.google.marker = new window.google.maps.Marker({ position: { lat, lng }, map, draggable: true });
        currentLocationPicker.google.marker.addListener("dragend", (evt) => {
          const dLat = evt?.latLng?.lat?.();
          const dLng = evt?.latLng?.lng?.();
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
          setPickerSelected(dLat, dLng, { provider: "manual_pin" });
        });
      } else {
        currentLocationPicker.google.marker.setPosition({ lat, lng });
      }
      setPickerSelected(lat, lng, { provider: "manual_pin" });
    });

    if (!window.google.maps.places?.AutocompleteService || !window.google.maps.places?.PlacesService) {
      if (currentLocationPickerMeta) {
        currentLocationPickerMeta.textContent =
          "Google Places library not available. Enable Places API on your key and load with `libraries=places`.";
      }
    } else {
      currentLocationPicker.google.autocompleteService = new window.google.maps.places.AutocompleteService();
      currentLocationPicker.google.placesService = new window.google.maps.places.PlacesService(map);

      const fetchPlaceDetails = (placeId, label) =>
        new Promise((resolve, reject) => {
          currentLocationPicker.google.placesService.getDetails(
            { placeId, fields: ["geometry", "formatted_address", "name"] },
            (place, status) => {
              if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                return reject(new Error(`Places details failed: ${status || "Unknown"}`));
              }
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              resolve({ lat, lng, label: place.formatted_address || place.name || label || "Pinned location" });
            }
          );
        });

      const requestPredictions = (input) =>
        new Promise((resolve, reject) => {
          currentLocationPicker.google.autocompleteService.getPlacePredictions(
            { input: String(input || ""), locationBias: map.getBounds?.() || undefined },
            (predictions, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
              if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
                return reject(new Error(`Places predictions failed: ${status || "Unknown"}`));
              }
              resolve(predictions || []);
            }
          );
        });

      currentLocationPickerSearch?.addEventListener("input", () => {
        const q = String(currentLocationPickerSearch.value || "").trim();
        if (!q) {
          hidePickerSuggestions();
          return;
        }
        if (currentLocationPicker.google.debounceTimer) clearTimeout(currentLocationPicker.google.debounceTimer);
        currentLocationPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            renderPickerSuggestions(preds, async (p) => {
              hidePickerSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const details = await fetchPlaceDetails(placeId, label);
                if (currentLocationPickerName && !String(currentLocationPickerName.value || "").trim()) {
                  currentLocationPickerName.value = ensureUniqueLocationName(details.label);
                }
                if (!currentLocationPicker.google.marker) {
                  currentLocationPicker.google.marker = new window.google.maps.Marker({
                    position: { lat: details.lat, lng: details.lng },
                    map,
                    draggable: true,
                  });
                  currentLocationPicker.google.marker.addListener("dragend", (evt) => {
                    const dLat = evt?.latLng?.lat?.();
                    const dLng = evt?.latLng?.lng?.();
                    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
                    setPickerSelected(dLat, dLng, { provider: "manual_pin" });
                  });
                } else {
                  currentLocationPicker.google.marker.setPosition({ lat: details.lat, lng: details.lng });
                }
                map.setCenter({ lat: details.lat, lng: details.lng });
                map.setZoom(17);
                setPickerSelected(details.lat, details.lng, { provider: "google_places", query: details.label });
              } catch (err) {
                if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = err?.message || String(err);
              }
            });
          } catch (err) {
            hidePickerSuggestions();
            if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = err?.message || String(err);
          }
        }, 250);
      });

      currentLocationPickerSearch?.addEventListener("blur", () => {
        // Allow click selection before hiding.
        setTimeout(() => hidePickerSuggestions(), 150);
      });
    }

    currentLocationPicker.google.map = map;
  }

  applyGooglePickerStyle(currentLocationPicker.mapStyle);
  currentLocationPicker.google.map.setCenter(center);
  currentLocationPicker.google.map.setZoom(16);
}

async function openCurrentLocationPicker() {
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  openCurrentLocationPickerModal();
  if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Loading map...";
  hidePickerSuggestions();

  let center = { lat: 20, lng: 0 };
  try {
    center = await getUserGeolocation();
  } catch {
    // ignore
  }

  const config = await getPublicConfig().catch(() => ({}));
  const key = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";

  if (key) {
    try {
      if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Loading Google Maps...";
      await loadGoogleMaps(key);
      resetPickerMapContainer();
      currentLocationPicker.mode = "google";
      initGooglePicker(center);
      if (currentLocationPickerMeta) {
        const places = window.google?.maps?.places;
        const hasSvc = !!places?.AutocompleteService;
        const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
        currentLocationPickerMeta.textContent = msg;
      }
      return;
    } catch (err) {
      if (currentLocationPickerMeta) {
        currentLocationPickerMeta.textContent =
          `Google Maps failed to load: ${err?.message || String(err)}. ` +
          "Falling back to pin-drop. Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
      }
    }
  }

  resetPickerMapContainer();
  currentLocationPicker.mode = "leaflet";
  initLeafletPicker(center);
  if (currentLocationPickerMeta) {
    currentLocationPickerMeta.textContent =
      key
        ? "Search (OpenStreetMap) or click the map to drop a pin (Google failed to load)."
        : "Search (OpenStreetMap) or click the map to drop a pin.";
  }
}

function syncFileInputFiles(inputEl, files) {
  if (!inputEl) return;
  const dt = new DataTransfer();
  (files || []).forEach((f) => dt.items.add(f));
  inputEl.files = dt.files;
}

function getEquipmentImageUrls() {
  return safeParseJsonArray(equipmentForm?.imageUrls?.value).filter(Boolean).map(String);
}

function setEquipmentImageUrls(urls) {
  if (!equipmentForm?.imageUrls) return;
  equipmentForm.imageUrls.value = JSON.stringify((urls || []).filter(Boolean).map(String));
  if (equipmentForm.imageUrl) equipmentForm.imageUrl.value = (urls && urls[0]) ? String(urls[0]) : "";
}

function getDeleteImageUrls() {
  return safeParseJsonArray(equipmentForm?.dataset?.deleteImageUrls).filter(Boolean).map(String);
}

function addDeleteImageUrl(url) {
  if (!url || !equipmentForm) return;
  const existing = new Set(getDeleteImageUrls());
  existing.add(String(url));
  equipmentForm.dataset.deleteImageUrls = JSON.stringify(Array.from(existing));
}

function clearDeleteImageUrls() {
  if (!equipmentForm) return;
  delete equipmentForm.dataset.deleteImageUrls;
}

function renderEquipmentImages() {
  if (!equipmentImagesRow) return;
  equipmentImagesRow.replaceChildren();

  const existingUrls = getEquipmentImageUrls();
  existingUrls.forEach((url) => {
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "url";
    tile.dataset.url = url;
    if (selectedEquipmentImage?.kind === "url" && selectedEquipmentImage.url === url) tile.classList.add("selected");
    tile.innerHTML = `
      <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <button type="button" class="ghost small danger" data-action="remove-existing" data-url="${url}">Remove</button>
    `;
    equipmentImagesRow.appendChild(tile);
  });

  pendingEquipmentFiles.forEach((file, idx) => {
    const objectUrl = URL.createObjectURL(file);
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "pending";
    tile.dataset.index = String(idx);
    if (selectedEquipmentImage?.kind === "pending" && Number(selectedEquipmentImage.index) === idx) tile.classList.add("selected");
    tile.innerHTML = `
      <img class="thumb" src="${objectUrl}" alt="" loading="lazy" />
      <button type="button" class="ghost small danger" data-action="remove-pending" data-index="${idx}">Remove</button>
    `;
    equipmentImagesRow.appendChild(tile);
    tile.querySelector("img")?.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(objectUrl);
      },
      { once: true }
    );
  });

  const showFallback =
    existingUrls.length === 0 &&
    pendingEquipmentFiles.length === 0 &&
    Array.isArray(fallbackEquipmentImageUrls) &&
    fallbackEquipmentImageUrls.length > 0;
  if (showFallback) {
    fallbackEquipmentImageUrls.forEach((url) => {
      const tile = document.createElement("div");
      tile.className = "thumb-tile";
      tile.dataset.kind = "fallback";
      tile.dataset.url = url;
      if (selectedEquipmentImage?.kind === "fallback" && selectedEquipmentImage.url === url) tile.classList.add("selected");
      tile.innerHTML = `
        <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
        <div class="hint">Type image (inherited)</div>
      `;
      equipmentImagesRow.appendChild(tile);
    });
  }

  const hasAny = existingUrls.length > 0 || pendingEquipmentFiles.length > 0;
  if (clearEquipmentImagesBtn) clearEquipmentImagesBtn.style.display = hasAny ? "inline-flex" : "none";
  ensureSelectedEquipmentImage();
  syncEquipmentAiTools();
}

function ensureSelectedEquipmentImage() {
  const existingUrls = getEquipmentImageUrls();

  if (selectedEquipmentImage?.kind === "url") {
    if (existingUrls.includes(selectedEquipmentImage.url)) return;
  }

  if (selectedEquipmentImage?.kind === "pending") {
    const idx = Number(selectedEquipmentImage.index);
    if (Number.isFinite(idx) && idx >= 0 && idx < pendingEquipmentFiles.length) return;
  }

  if (selectedEquipmentImage?.kind === "fallback") {
    const list = Array.isArray(fallbackEquipmentImageUrls) ? fallbackEquipmentImageUrls : [];
    if (list.includes(selectedEquipmentImage.url)) return;
  }

  if (existingUrls[0]) {
    selectedEquipmentImage = { kind: "url", url: existingUrls[0] };
    return;
  }

  if (pendingEquipmentFiles[0]) {
    selectedEquipmentImage = { kind: "pending", index: 0 };
    return;
  }

  if (fallbackEquipmentImageUrls?.[0]) {
    selectedEquipmentImage = { kind: "fallback", url: String(fallbackEquipmentImageUrls[0]) };
    return;
  }

  selectedEquipmentImage = null;
}

function setEquipmentAiStatus(message) {
  if (!equipmentAiStatus) return;
  equipmentAiStatus.textContent = message ? String(message) : "";
}

function getEquipmentAiPrompt() {
  const preset = equipmentAiPreset ? String(equipmentAiPreset.value || "") : "clean-white";
  const prompt = equipmentAiPrompt ? String(equipmentAiPrompt.value || "").trim() : "";
  if (prompt) return prompt;
  if (preset !== "custom" && EQUIPMENT_AI_PRESETS[preset]) return EQUIPMENT_AI_PRESETS[preset];
  return "";
}

function syncEquipmentAiTools() {
  if (!equipmentAiTools) return;
  const hasSelection = !!selectedEquipmentImage;
  const canUse = hasSelection && !!activeCompanyId;
  equipmentAiTools.hidden = !canUse;
  if (equipmentAiApplyBtn) equipmentAiApplyBtn.disabled = !canUse || equipmentAiBusy;
  if (canUse && equipmentAiStatus && !String(equipmentAiStatus.textContent || "").trim() && !equipmentAiBusy) {
    equipmentAiStatus.textContent = "Tip: click a thumbnail to select it, then apply a preset or custom prompt.";
  }

  if (equipmentAiPreset && equipmentAiPrompt) {
    const preset = String(equipmentAiPreset.value || "");
    if (preset !== "custom" && EQUIPMENT_AI_PRESETS[preset] && !String(equipmentAiPrompt.value || "").trim()) {
      equipmentAiPrompt.value = EQUIPMENT_AI_PRESETS[preset];
    }
  }
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

async function applyAiToSelectedEquipmentImage() {
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  if (!selectedEquipmentImage) return;

  const prompt = getEquipmentAiPrompt();
  if (!prompt) {
    setEquipmentAiStatus("Add a prompt first.");
    return;
  }

  if (equipmentAiBusy) return;
  equipmentAiBusy = true;
  setEquipmentAiStatus("Processing…");
  syncEquipmentAiTools();

  try {
    if (selectedEquipmentImage.kind === "pending") {
      const idx = Number(selectedEquipmentImage.index);
      const file = pendingEquipmentFiles[idx];
      if (!file) throw new Error("Selected file no longer exists.");

      const url = await aiEditImageFromFile({ companyId: activeCompanyId, file, prompt });
      pendingEquipmentFiles = pendingEquipmentFiles.filter((_, i) => i !== idx);
      syncFileInputFiles(equipmentForm.imageFiles, pendingEquipmentFiles);

      const nextUrls = getEquipmentImageUrls().concat([url]);
      setEquipmentImageUrls(nextUrls);
      selectedEquipmentImage = { kind: "url", url };
      renderEquipmentImages();
      setEquipmentAiStatus("AI image added.");
      return;
    }

    if (selectedEquipmentImage.kind === "url") {
      const oldUrl = selectedEquipmentImage.url;
      const newUrl = await aiEditImageFromUrl({ companyId: activeCompanyId, url: oldUrl, prompt });
      const nextUrls = getEquipmentImageUrls().map((u) => (u === oldUrl ? newUrl : u));
      setEquipmentImageUrls(nextUrls);
      addDeleteImageUrl(oldUrl);
      selectedEquipmentImage = { kind: "url", url: newUrl };
      renderEquipmentImages();
      setEquipmentAiStatus("AI image created.");
      return;
    }

    if (selectedEquipmentImage.kind === "fallback") {
      const sourceUrl = selectedEquipmentImage.url;
      const newUrl = await aiEditImageFromUrl({ companyId: activeCompanyId, url: sourceUrl, prompt });
      const nextUrls = getEquipmentImageUrls().concat([newUrl]);
      setEquipmentImageUrls(nextUrls);
      selectedEquipmentImage = { kind: "url", url: newUrl };
      renderEquipmentImages();
      setEquipmentAiStatus("AI image created.");
      return;
    }
  } catch (err) {
    setEquipmentAiStatus(err.message || "AI processing failed.");
  } finally {
    equipmentAiBusy = false;
    syncEquipmentAiTools();
  }
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

equipmentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  const payload = getFormData(equipmentForm);
  delete payload.imageFiles;
  payload.id = editingEquipmentId;
  if (payload.typeId === "__new_type__") {
    const returnTo = isEquipmentFormPage
      ? editingEquipmentId
        ? `equipment-form.html?equipmentId=${encodeURIComponent(editingEquipmentId)}`
        : "equipment-form.html"
      : "equipment.html";
    window.location.href = `equipment-type-form.html?returnTo=${encodeURIComponent(returnTo)}`;
    return;
  }
  if (!payload.typeId) {
    companyMeta.textContent = "Choose an equipment type.";
    return;
  }
  payload.typeId = Number(payload.typeId);
  payload.typeName = typeSelect.options[typeSelect.selectedIndex]?.text || null;
  payload.companyId = activeCompanyId;
  if (payload.imageUrl === "") payload.imageUrl = null;
  if (payload.locationId === "") payload.locationId = null;
  if (payload.currentLocationId === "") payload.currentLocationId = null;
  if (payload.purchasePrice === "") payload.purchasePrice = null;
  payload.purchasePrice = payload.purchasePrice ? Number(payload.purchasePrice) : null;
  if (payload.notes === "") payload.notes = null;

  const existingUrls = getEquipmentImageUrls();
  const deleteAfterSave = new Set(getDeleteImageUrls());

  try {
    const uploadedUrls = [];
    for (const file of pendingEquipmentFiles) {
      if (!file?.size) continue;
      const url = await uploadImage({ companyId: activeCompanyId, file });
      uploadedUrls.push(url);
    }
    const finalUrls = [...existingUrls, ...uploadedUrls];
    payload.imageUrls = finalUrls;
    payload.imageUrl = finalUrls[0] || null;
    const res = await fetch(editingEquipmentId ? `/api/equipment/${editingEquipmentId}` : "/api/equipment", {
      method: editingEquipmentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      for (const url of uploadedUrls) await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
      throw new Error(data.error || "Unable to save equipment");
    }
    equipmentForm.reset();
    pendingEquipmentFiles = [];
    syncFileInputFiles(equipmentForm.imageFiles, []);
    setEquipmentImageUrls([]);
    clearDeleteImageUrls();
    renderEquipmentImages();
    if (!isEquipmentFormPage) closeEquipmentModal();
    for (const url of deleteAfterSave) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    if (isEquipmentFormPage) {
      window.location.href = "equipment.html";
      return;
    }
    loadEquipment();
    loadLocations();
    editingEquipmentId = null;
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadLocations();
  loadEquipment();
});

locationSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new__") {
    e.target.value = "";
    openModal();
  }
});

currentLocationSelect?.addEventListener("change", (e) => {
  if (e.target.value === "__new__") {
    e.target.value = "";
    openCurrentLocationPicker().catch((err) => {
      companyMeta.textContent = err?.message || String(err);
    });
  }
});

openCurrentLocationPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openCurrentLocationPicker().catch((err) => {
    companyMeta.textContent = err?.message || String(err);
  });
});

clearCurrentLocationBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (currentLocationSelect) currentLocationSelect.value = "";
});

typeSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new_type__") {
    e.target.value = "";
    if (!activeCompanyId) {
      companyMeta.textContent = "Log in to continue.";
      return;
    }
    const returnTo = isEquipmentFormPage
      ? editingEquipmentId
        ? `equipment-form.html?equipmentId=${encodeURIComponent(editingEquipmentId)}`
        : "equipment-form.html"
      : "equipment.html";
    window.location.href = `equipment-type-form.html?returnTo=${encodeURIComponent(returnTo)}`;
  }
});

openEquipmentBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  goToEquipmentForm();
});

function openEquipmentModal() {
  if (equipmentModal?.classList.contains("modal")) equipmentModal.classList.add("show");
  setEquipmentAiStatus("");
  syncEquipmentAiTools();
  setBundleControls(null);
}

function closeEquipmentModal() {
  if (equipmentModal?.classList.contains("modal")) equipmentModal.classList.remove("show");
  equipmentForm.reset();
  typeSelect.value = "";
  deleteEquipmentBtn.style.display = "none";
  editingEquipmentId = null;
  pendingEquipmentFiles = [];
  syncFileInputFiles(equipmentForm.imageFiles, []);
  setEquipmentImageUrls([]);
  clearDeleteImageUrls();
  selectedEquipmentImage = null;
  fallbackEquipmentImageUrls = [];
  setEquipmentAiStatus("");
  renderEquipmentImages();
  if (equipmentLocationHistoryDetails) {
    equipmentLocationHistoryDetails.hidden = true;
    equipmentLocationHistoryDetails.open = false;
  }
  resetEquipmentExtrasPanels();
  setBundleControls(null);
  clearEquipmentHeaderStatus();
}

function setBundleControls(item) {
  if (!equipmentBundleLabel) return;
  if (!item || !item.id) {
    equipmentBundleLabel.textContent = "Save this asset before bundling.";
    if (openBundleModalBtn) openBundleModalBtn.disabled = true;
    return;
  }
  const label = item.bundle_name ? `Bundle: ${item.bundle_name}` : "Not in a bundle";
  equipmentBundleLabel.textContent = label;
  if (openBundleModalBtn) openBundleModalBtn.disabled = false;
}

function getSelectedBundleItemIds() {
  if (!bundleItemsList) return [];
  return Array.from(bundleItemsList.querySelectorAll('input[type="checkbox"]'))
    .filter((input) => input.checked)
    .map((input) => Number(input.value))
    .filter((v) => Number.isFinite(v));
}

function syncBundlePrimaryOptions(selectedIds, currentPrimaryId = null) {
  if (!bundlePrimarySelect) return;
  bundlePrimarySelect.innerHTML = "";
  if (!selectedIds.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select equipment";
    bundlePrimarySelect.appendChild(opt);
    return;
  }
  selectedIds.forEach((id) => {
    const eq = equipmentCache.find((e) => String(e.id) === String(id));
    if (!eq) return;
    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = `${eq.serial_number || eq.model_name || "Equipment"}${eq.model_name ? ` - ${eq.model_name}` : ""}`;
    bundlePrimarySelect.appendChild(opt);
  });
  const preferred = selectedIds.includes(Number(currentPrimaryId)) ? String(currentPrimaryId) : String(selectedIds[0]);
  bundlePrimarySelect.value = preferred;
}

function renderBundleItemsSelector(selectedIds, currentBundleId) {
  if (!bundleItemsList) return;
  bundleItemsList.replaceChildren();
  const sorted = [...equipmentCache].sort((a, b) => String(a.serial_number || "").localeCompare(String(b.serial_number || "")));
  sorted.forEach((eq) => {
    const inOtherBundle =
      eq.bundle_id && String(eq.bundle_id) !== String(currentBundleId || "");
    const row = document.createElement("label");
    row.className = "check-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = String(eq.id);
    input.checked = selectedIds.includes(Number(eq.id));
    input.disabled = inOtherBundle;
    const labelText = `${eq.serial_number || eq.model_name || "Equipment"}${eq.model_name ? ` - ${eq.model_name}` : ""}`;
    const detail = inOtherBundle && eq.bundle_name ? ` (in ${eq.bundle_name})` : "";
    row.appendChild(input);
    row.appendChild(document.createTextNode(labelText + detail));
    bundleItemsList.appendChild(row);
  });
}

async function loadBundleDetail(bundleId) {
  const res = await fetch(`/api/equipment-bundles/${bundleId}?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load bundle.");
  return data;
}

async function openBundleModal({ seedEquipmentId = null } = {}) {
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  if (!bundleModal || !bundleForm) return;
  bundleSeedEquipmentId = seedEquipmentId;
  const seed = seedEquipmentId
    ? equipmentCache.find((eq) => String(eq.id) === String(seedEquipmentId))
    : null;
  let bundle = null;
  editingBundleId = null;
  if (seed?.bundle_id) {
    bundle = await loadBundleDetail(seed.bundle_id);
    editingBundleId = Number(bundle.id);
  }

  const selectedIds = bundle?.items?.length
    ? bundle.items.map((item) => Number(item.id)).filter((v) => Number.isFinite(v))
    : seedEquipmentId
      ? [Number(seedEquipmentId)]
      : [];
  const nameValue = bundle?.name || "";
  if (bundleNameInput) bundleNameInput.value = nameValue;
  if (bundleDailyRateInput) bundleDailyRateInput.value = bundle?.dailyRate ?? "";
  if (bundleWeeklyRateInput) bundleWeeklyRateInput.value = bundle?.weeklyRate ?? "";
  if (bundleMonthlyRateInput) bundleMonthlyRateInput.value = bundle?.monthlyRate ?? "";
  renderBundleItemsSelector(selectedIds, editingBundleId);
  syncBundlePrimaryOptions(selectedIds, bundle?.primaryEquipmentId || seedEquipmentId || null);
  if (deleteBundleBtn) deleteBundleBtn.style.display = editingBundleId ? "inline-flex" : "none";

  bundleModal.classList.add("show");
}

function closeBundleModal() {
  bundleModal?.classList.remove("show");
  if (bundleForm) bundleForm.reset();
  if (bundleItemsList) bundleItemsList.replaceChildren();
  editingBundleId = null;
  bundleSeedEquipmentId = null;
}

function openEquipmentImageModal() {
  if (!equipmentImageModal) return;
  equipmentImageModal.classList.add("show");
  setEquipmentAiStatus("");
  syncEquipmentAiTools();
}

function closeEquipmentImageModal() {
  if (!equipmentImageModal) return;
  equipmentImageModal.classList.remove("show");
}

closeEquipmentBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (isEquipmentFormPage) {
    window.location.href = "equipment.html";
    return;
  }
  closeEquipmentModal();
});

if (equipmentModal?.classList.contains("modal")) {
  equipmentModal.addEventListener("click", (e) => {
    if (e.target === equipmentModal) closeEquipmentModal();
  });
}

openEquipmentImageModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openEquipmentImageModal();
});

closeEquipmentImageModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeEquipmentImageModal();
});

equipmentImageModal?.addEventListener("click", (e) => {
  if (e.target === equipmentImageModal) closeEquipmentImageModal();
});

openBundleModalBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingEquipmentId) return;
  try {
    await openBundleModal({ seedEquipmentId: editingEquipmentId });
  } catch (err) {
    companyMeta.textContent = err?.message || String(err);
  }
});

closeBundleModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeBundleModal();
});

bundleModal?.addEventListener("click", (e) => {
  if (e.target === bundleModal) closeBundleModal();
});

bundleItemsList?.addEventListener("change", () => {
  const selectedIds = getSelectedBundleItemIds();
  const currentPrimary = bundlePrimarySelect?.value ? Number(bundlePrimarySelect.value) : null;
  syncBundlePrimaryOptions(selectedIds, currentPrimary);
});

bundleForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const selectedIds = getSelectedBundleItemIds();
  if (!selectedIds.length) {
    companyMeta.textContent = "Select at least one asset for the bundle.";
    return;
  }
  const payload = {
    companyId: activeCompanyId,
    name: bundleNameInput?.value || "",
    primaryEquipmentId: bundlePrimarySelect?.value ? Number(bundlePrimarySelect.value) : selectedIds[0],
    equipmentIds: selectedIds,
    dailyRate: bundleDailyRateInput?.value || null,
    weeklyRate: bundleWeeklyRateInput?.value || null,
    monthlyRate: bundleMonthlyRateInput?.value || null,
  };
  try {
    const res = await fetch(editingBundleId ? `/api/equipment-bundles/${editingBundleId}` : "/api/equipment-bundles", {
      method: editingBundleId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save bundle.");
    await loadBundles();
    await loadEquipment();
    if (editingEquipmentId) {
      const item = equipmentCache.find((eq) => String(eq.id) === String(editingEquipmentId));
      if (item) setBundleControls(item);
    }
    closeBundleModal();
  } catch (err) {
    companyMeta.textContent = err?.message || String(err);
  }
});

deleteBundleBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingBundleId || !activeCompanyId) return;
  try {
    const res = await fetch(`/api/equipment-bundles/${editingBundleId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to delete bundle.");
    }
    await loadBundles();
    await loadEquipment();
    if (editingEquipmentId) {
      const item = equipmentCache.find((eq) => String(eq.id) === String(editingEquipmentId));
      if (item) setBundleControls(item);
    }
    closeBundleModal();
  } catch (err) {
    companyMeta.textContent = err?.message || String(err);
  }
});

openEquipmentLocationHistoryBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openEquipmentExtrasDrawer("location-history");
});

openEquipmentWorkOrdersBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openEquipmentExtrasDrawer("work-orders");
});

closeEquipmentExtrasDrawerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeEquipmentExtrasDrawer();
});

equipmentExtrasDrawerOverlay?.addEventListener("click", () => {
  closeEquipmentExtrasDrawer();
});

equipmentExtrasTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setEquipmentExtrasTab(btn.getAttribute("data-tab"));
  });
});

equipmentLocationHistoryDetails?.addEventListener("toggle", () => {
  if (!equipmentLocationHistoryDetails.open) return;
  if (!editingEquipmentId) return;
  if (equipmentHistoryLoadedForId && equipmentHistoryLoadedForId === String(editingEquipmentId)) return;
  loadEquipmentLocationHistory(editingEquipmentId).catch((err) => {
    if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = err?.message || String(err);
  });
});

equipmentWorkOrdersTable?.addEventListener("click", (e) => {
  const row = e.target.closest?.(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id) return;
  window.location.href = `work-order-form.html?id=${encodeURIComponent(id)}`;
});

closeCurrentLocationPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeCurrentLocationPickerModal();
});

currentLocationPickerModal?.addEventListener("click", (e) => {
  if (e.target === currentLocationPickerModal) closeCurrentLocationPickerModal();
});

if (currentLocationPickerMapStyle) {
  setCurrentLocationPickerMapStyle(currentLocationPickerMapStyle.value);
  currentLocationPickerMapStyle.addEventListener("change", () => {
    setCurrentLocationPickerMapStyle(currentLocationPickerMapStyle.value);
  });
}

equipmentTable?.addEventListener("click", (e) => {
  const sortEl = e.target.closest(".sort");
  if (sortEl) {
    const field = sortEl.dataset.sort;
    if (!field) return;
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = "asc";
    }
    persistEquipmentListState();
    renderEquipment(applyFilters());
    return;
  }
  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id) return;
  const item = equipmentCache.find((eq) => String(eq.id) === String(id));
  if (!item) return;
  startEditEquipment(item);
});

equipmentCards?.addEventListener("click", (e) => {
  const card = e.target.closest?.(".equipment-card");
  const id = card?.dataset?.id;
  if (!id) return;
  const item = equipmentCache.find((eq) => String(eq.id) === String(id));
  if (!item) return;
  startEditEquipment(item);
});

function startEditEquipment(item) {
  if (!item) return;
  if (!isEquipmentFormPage) {
    goToEquipmentForm(item.id);
    return;
  }
  editingEquipmentId = item.id;
  openEquipmentModal();
  deleteEquipmentBtn.style.display = "inline-flex";
  setPendingSelectValue(typeSelect, item.type_id);
  typeSelect.value = item.type_id || "";
  if (!typeSelect.value && item.type) {
    const opt = document.createElement("option");
    opt.value = item.type_id || "";
    opt.textContent = item.type;
    typeSelect.prepend(opt);
    typeSelect.value = item.type_id || "";
  }
  equipmentForm.modelName.value = item.model_name || "";
  equipmentForm.serialNumber.value = item.serial_number || "";
  equipmentForm.condition.value = item.condition || "";
  equipmentForm.manufacturer.value = item.manufacturer || "";
  setPendingSelectValue(locationSelect, item.location_id);
  locationSelect.value = item.location_id || "";
  if (currentLocationSelect) {
    setPendingSelectValue(currentLocationSelect, item.current_location_id);
    currentLocationSelect.value = item.current_location_id || "";
  }
  equipmentForm.purchasePrice.value = item.purchase_price || "";

  pendingEquipmentFiles = [];
  syncFileInputFiles(equipmentForm.imageFiles, []);
  clearDeleteImageUrls();
  fallbackEquipmentImageUrls = Array.isArray(item.type_image_urls) ? item.type_image_urls.filter(Boolean).map(String) : [];
  if (!fallbackEquipmentImageUrls.length && item.type_image_url) fallbackEquipmentImageUrls = [String(item.type_image_url)];
  const ownedUrls = Array.isArray(item.equipment_image_urls) ? item.equipment_image_urls.filter(Boolean).map(String) : [];
  if (!ownedUrls.length && item.equipment_image_url) {
    const fallbackTypeUrl =
      (Array.isArray(item.type_image_urls) && item.type_image_urls[0] ? String(item.type_image_urls[0]) : null) ||
      (item.type_image_url ? String(item.type_image_url) : null);
    if (!fallbackTypeUrl || String(item.equipment_image_url) !== fallbackTypeUrl) {
      ownedUrls.push(String(item.equipment_image_url));
    }
  }
  setEquipmentImageUrls(ownedUrls);
  renderEquipmentImages();

  equipmentForm.notes.value = item.notes || "";

  if (equipmentLocationHistoryDetails) {
    equipmentLocationHistoryDetails.hidden = false;
    equipmentLocationHistoryDetails.open = false;
  }
  if (equipmentLocationHistoryList) equipmentLocationHistoryList.innerHTML = "";
  if (equipmentLocationHistoryMeta) equipmentLocationHistoryMeta.textContent = "Open to view current location changes.";
  equipmentHistoryLoadedForId = null;
  if (equipmentWorkOrdersTable) equipmentWorkOrdersTable.innerHTML = "";
  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "Open to view work orders.";
  equipmentWorkOrdersLoadedForId = null;

  if (equipmentExtrasSubtitle) {
    const label = item.serial_number || item.model_name || "";
    equipmentExtrasSubtitle.textContent = label ? `Unit: ${label}` : "";
  }

  setBundleControls(item);
  if (equipmentFormTitle) equipmentFormTitle.textContent = "Edit equipment";
  setEquipmentHeaderStatus(item);
}

equipmentForm.imageFiles?.addEventListener("change", (e) => {
  const next = Array.from(e.target.files || []);
  if (!next.length) return;
  pendingEquipmentFiles = pendingEquipmentFiles.concat(next);
  syncFileInputFiles(equipmentForm.imageFiles, pendingEquipmentFiles);
  renderEquipmentImages();
});

equipmentImagesRow?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-action]");
  const action = btn?.dataset?.action;

  if (!action) {
    const tile = e.target.closest?.(".thumb-tile");
    if (!tile) return;
    const kind = tile.dataset.kind;
    if (kind === "url" && tile.dataset.url) {
      selectedEquipmentImage = { kind: "url", url: String(tile.dataset.url) };
      renderEquipmentImages();
    } else if (kind === "pending") {
      const idx = Number(tile.dataset.index);
      if (!Number.isFinite(idx) || idx < 0) return;
      selectedEquipmentImage = { kind: "pending", index: idx };
      renderEquipmentImages();
    } else if (kind === "fallback" && tile.dataset.url) {
      selectedEquipmentImage = { kind: "fallback", url: String(tile.dataset.url) };
      renderEquipmentImages();
    }
    return;
  }

  if (action === "remove-existing") {
    const url = btn.dataset.url;
    if (!url) return;
    const nextUrls = getEquipmentImageUrls().filter((u) => u !== url);
    setEquipmentImageUrls(nextUrls);
    addDeleteImageUrl(url);
    if (selectedEquipmentImage?.kind === "url" && selectedEquipmentImage.url === url) selectedEquipmentImage = null;
    renderEquipmentImages();
    return;
  }

  if (action === "remove-pending") {
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0) return;
    pendingEquipmentFiles = pendingEquipmentFiles.filter((_, i) => i !== idx);
    syncFileInputFiles(equipmentForm.imageFiles, pendingEquipmentFiles);
    if (selectedEquipmentImage?.kind === "pending" && Number(selectedEquipmentImage.index) === idx) selectedEquipmentImage = null;
    renderEquipmentImages();
  }
});

clearEquipmentImagesBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const existingUrls = getEquipmentImageUrls();
  existingUrls.forEach((u) => addDeleteImageUrl(u));
  pendingEquipmentFiles = [];
  syncFileInputFiles(equipmentForm.imageFiles, []);
  setEquipmentImageUrls([]);
  selectedEquipmentImage = null;
  renderEquipmentImages();
});

equipmentAiPreset?.addEventListener("change", () => {
  if (!equipmentAiPrompt) return;
  const preset = String(equipmentAiPreset.value || "");
  if (preset !== "custom" && EQUIPMENT_AI_PRESETS[preset]) equipmentAiPrompt.value = EQUIPMENT_AI_PRESETS[preset];
  syncEquipmentAiTools();
});

equipmentAiApplyBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  applyAiToSelectedEquipmentImage();
});

deleteEquipmentBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingEquipmentId || !activeCompanyId) return;
  try {
    const item = equipmentCache.find((eq) => String(eq.id) === String(editingEquipmentId));
    const ownedUrls = Array.isArray(item?.equipment_image_urls) ? item.equipment_image_urls.filter(Boolean).map(String) : [];
    if (!ownedUrls.length && item?.equipment_image_url) {
      const fallbackTypeUrl =
        (Array.isArray(item?.type_image_urls) && item.type_image_urls[0] ? String(item.type_image_urls[0]) : null) ||
        (item?.type_image_url ? String(item.type_image_url) : null);
      if (!fallbackTypeUrl || String(item.equipment_image_url) !== fallbackTypeUrl) {
        ownedUrls.push(String(item.equipment_image_url));
      }
    }
    const res = await fetch(`/api/equipment/${editingEquipmentId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to delete equipment");
    }
    for (const url of ownedUrls) {
      await deleteUploadedImage({ companyId: activeCompanyId, url }).catch(() => null);
    }
    companyMeta.textContent = "Equipment deleted.";
    if (isEquipmentFormPage) {
      window.location.href = "equipment.html";
      return;
    }
    closeEquipmentModal();
    loadEquipment();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  persistEquipmentListState();
  renderEquipment(applyFilters());
});

equipmentViewTableBtn?.addEventListener("click", () => setView("table"));
equipmentViewCardsBtn?.addEventListener("click", () => setView("cards"));
setView(currentView);

if (isEquipmentFormPage) {
  renderEquipmentImages();
  clearEquipmentHeaderStatus();
}

function openModal() {
  locationModal.classList.add("show");
}

function closeModal() {
  locationModal.classList.remove("show");
  locationModalForm.reset();
}

closeModalBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeModal();
});

locationModal.addEventListener("click", (e) => {
  if (e.target === locationModal) closeModal();
});

locationModalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  const payload = { ...getFormData(locationModalForm), companyId: activeCompanyId };
  try {
    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Unable to add location");
    }
    const saved = await res.json();
    companyMeta.textContent = `Location "${saved.name}" added.`;
    closeModal();
    await loadLocations();
    if (saved?.id) {
      locationSelect.value = saved.id;
    }
  } catch (err) {
    companyMeta.textContent = err.message;
  }
});

saveCurrentLocationPickerBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  const sel = currentLocationPicker.selected;
  if (!sel || !Number.isFinite(sel.lat) || !Number.isFinite(sel.lng)) {
    if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Pick a point on the map first.";
    return;
  }

  saveCurrentLocationPickerBtn.disabled = true;
  try {
    const baseName =
      String(currentLocationPickerName?.value || "").trim() ||
      (sel.query ? String(sel.query) : "Pinned location");
    const name = ensureUniqueLocationName(baseName);
    const saved = await createLocationFromPicker({
      name,
      latitude: sel.lat,
      longitude: sel.lng,
      provider: sel.provider,
      query: sel.query,
    });
    await loadLocations();
    if (currentLocationSelect && saved?.id) currentLocationSelect.value = String(saved.id);
    closeCurrentLocationPickerModal();
    companyMeta.textContent = `Current location set to "${saved.name}".`;
  } catch (err) {
    if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = err?.message || String(err);
  } finally {
    saveCurrentLocationPickerBtn.disabled = false;
  }
});

// Initialize empty state
const storedCompanyId = window.RentSoft?.getCompanyId?.();
if (storedCompanyId) setCompany(storedCompanyId);
else setCompany(null, "Log in to view your equipment.");
