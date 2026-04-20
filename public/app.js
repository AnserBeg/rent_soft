const companyMeta = document.getElementById("company-meta");
const equipmentForm = document.getElementById("equipment-form");
const typeSelect = document.getElementById("type-select");
const locationSelect = document.getElementById("location-select");
const currentLocationModeSelect = document.getElementById("current-location-mode-select");
const currentLocationIdInput = document.getElementById("current-location-id");
const currentLocationDisplay = document.getElementById("current-location-display");
const openCurrentLocationPickerBtn = document.getElementById("open-current-location-picker");
const clearCurrentLocationBtn = document.getElementById("clear-current-location");
const equipmentDirectionsWrap = document.getElementById("equipment-directions-wrap");
const equipmentDirectionsInput = document.getElementById("equipment-directions");
const locationCount = document.getElementById("location-count");
const equipmentTable = document.getElementById("equipment-table");
const locationModal = document.getElementById("location-modal");
const locationModalForm = document.getElementById("location-modal-form");
const closeModalBtn = document.getElementById("close-modal");
const equipmentModal = document.getElementById("equipment-modal");
const openEquipmentBtn = document.getElementById("open-equipment-modal");
const closeEquipmentBtn = document.getElementById("close-equipment-modal");
const deleteEquipmentBtn = document.getElementById("delete-equipment");
const saveEquipmentBtn = document.getElementById("save-equipment");
const searchInput = document.getElementById("search");
const openEquipmentColumnsBtn = document.getElementById("open-equipment-columns");
const equipmentColumnsModal = document.getElementById("equipment-columns-modal");
const closeEquipmentColumnsBtn = document.getElementById("close-equipment-columns");
const equipmentColumnsMeta = document.getElementById("equipment-columns-meta");
const equipmentColumnsSearch = document.getElementById("equipment-columns-search");
const equipmentColumnsList = document.getElementById("equipment-columns-list");
const equipmentColumnsShowAllBtn = document.getElementById("equipment-columns-show-all");
const equipmentColumnsHideAllBtn = document.getElementById("equipment-columns-hide-all");
const equipmentColumnsResetBtn = document.getElementById("equipment-columns-reset");
const equipmentColumnsResetWidthsBtn = document.getElementById("equipment-columns-reset-widths");
const equipmentColumnsDoneBtn = document.getElementById("equipment-columns-done");
const equipmentImagesRow = document.getElementById("equipment-images");
const clearEquipmentImagesBtn = document.getElementById("remove-equipment-image");
const equipmentViewTableBtn = document.getElementById("equipment-view-table");
const equipmentViewCardsBtn = document.getElementById("equipment-view-cards");
const equipmentCards = document.getElementById("equipment-cards");
const equipmentFormTitle = document.getElementById("equipment-form-title");
const equipmentFormStatus = document.getElementById("equipment-form-status");
const openEquipmentRentalOrderBtn = document.getElementById("open-equipment-rental-order");
const equipmentImageModal = document.getElementById("equipment-image-modal");
const openEquipmentImageModalBtn = document.getElementById("open-equipment-image-modal");
const closeEquipmentImageModalBtn = document.getElementById("close-equipment-image-modal");
const equipmentImagePreviewWrap = document.getElementById("equipment-image-preview-wrap");
const equipmentImagePreviewImg = document.getElementById("equipment-image-preview-img");
const equipmentImagePreviewHint = document.getElementById("equipment-image-preview-hint");
const equipmentImagePreviewPrevBtn = document.getElementById("equipment-image-preview-prev");
const equipmentImagePreviewNextBtn = document.getElementById("equipment-image-preview-next");
const equipmentImageViewer = document.getElementById("equipment-image-viewer");
const equipmentImageViewerImg = document.getElementById("equipment-image-viewer-img");
const equipmentImageViewerHint = document.getElementById("equipment-image-viewer-hint");
const equipmentImagePrevBtn = document.getElementById("equipment-image-prev");
const equipmentImageNextBtn = document.getElementById("equipment-image-next");
const equipmentImageSetCardBtn = document.getElementById("equipment-image-set-card");
const equipmentImageClearCardBtn = document.getElementById("equipment-image-clear-card");

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
const openEquipmentTrackingBtn = document.getElementById("open-equipment-tracking");
const equipmentWorkOrdersTable = document.getElementById("equipment-work-orders-table");
const equipmentWorkOrdersMeta = document.getElementById("equipment-work-orders-meta");
const equipmentTrackingStatusPill = document.getElementById("equipment-tracking-status");
const equipmentTrackingNeedsSummary = document.getElementById("equipment-tracking-needs-summary");
const equipmentTrackingNeedsList = document.getElementById("equipment-tracking-needs");
const equipmentTrackingFieldsWrap = document.getElementById("equipment-tracking-fields");
const equipmentTrackingEventsTable = document.getElementById("equipment-tracking-events-table");
const equipmentMeterMeta = document.getElementById("equipment-meter-meta");
const equipmentMeterReadingInput = document.getElementById("equipment-meter-reading");
const equipmentMeterReadAtInput = document.getElementById("equipment-meter-read-at");
const equipmentMeterNoteInput = document.getElementById("equipment-meter-note");
const equipmentMeterAddBtn = document.getElementById("equipment-meter-add");
const equipmentMeterReadingsTable = document.getElementById("equipment-meter-readings-table");
const equipmentMeterHistoryActions = document.getElementById("equipment-meter-history-actions");
const equipmentTrackingHistoryCard = document.getElementById("equipment-tracking-history-card");
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
let equipmentTypesCache = [];
let workOrdersCache = [];
let editingEquipmentId = null;
let sortField = "created_at";
let sortDir = "desc";
let searchTerm = "";
const VIEW_KEY = "rentsoft.equipment.view";
const LIST_STATE_KEY = "rentsoft.equipment.listState";
const EQUIPMENT_COLUMNS_KEY_PREFIX = "rentsoft.equipment.tableColumns.v1";
const EQUIPMENT_COLUMN_WIDTHS_KEY_PREFIX = "rentsoft.equipment.tableColumnWidths.v1";
const EQUIPMENT_COLUMN_WIDTH_MIN_PX = 90;
const EQUIPMENT_COLUMN_WIDTH_MAX_PX = 900;
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
  "current_location",
]);
const EQUIPMENT_TABLE_BASE_COLUMNS = [
  { key: "type", label: "Type", grid: "1.6fr", sortKey: "type" },
  { key: "model_name", label: "Model", grid: "1.2fr", sortKey: "model_name" },
  { key: "rental_order_number", label: "RO", grid: "1fr", sortKey: "rental_order_number" },
  { key: "rental_customer_name", label: "Customer", grid: "1.2fr", sortKey: "rental_customer_name" },
  { key: "availability_status", label: "Status", grid: "1.1fr", sortKey: "availability_status" },
  { key: "location", label: "Base", grid: "1fr", sortKey: "location" },
  { key: "current_location", label: "Current", grid: "1fr", sortKey: "current_location" },
];
const EQUIPMENT_TABLE_REQUIRED_COLUMN_KEYS = new Set(["type"]);
let currentView = localStorage.getItem(VIEW_KEY) || "table";
let pendingOpenEquipmentId = initialEquipmentId ? String(initialEquipmentId) : null;

let activeCompanyId = null;
let pendingEquipmentFiles = [];
let selectedEquipmentImage = null;
let equipmentAiBusy = false;
let equipmentImagePreviewObjectUrl = null;
let equipmentImageViewerObjectUrl = null;

// Keep per-unit expand/collapse state in-memory (resets on full page reload).
const expandedTrackingFieldHistoryKeys = new Set(); // key: `${equipmentId}:${fieldId}`
const expandedMeterHistoryKeys = new Set(); // key: `${equipmentId}`
let fallbackEquipmentImageUrls = [];
let equipmentHistoryLoadedForId = null;
let equipmentWorkOrdersLoadedForId = null;
let equipmentTrackingLoadedForId = null;
let equipmentExtrasActiveTab = "location-history";
let bundlesCache = [];
let editingBundleId = null;
let bundleSeedEquipmentId = null;
let locationsCache = [];
let trackingTableColumnsCache = [];
let lastEquipmentTrackingPayload = null;
let companyAssetsTableColumnsDefault = null; // null => no default (show all)
let companyAssetsTableColumnsLoadedForId = null;
let companyAssetDirectionsLoadedForId = null;
let companyAssetDirectionsEnabled = false;
let lastEquipmentTableColumnsToRender = [];
let lastEquipmentTableCompanyId = null;
let equipmentColumnResizeSession = null;
let equipmentColumnResizeRaf = 0;

let currentLocationPicker = {
  mode: "google",
  mapStyle: "street",
  google: {
    map: null,
    marker: null,
    autocomplete: null,
    autocompleteService: null,
    placesService: null,
    sessionToken: null,
    debounceTimer: null,
    searchSeq: 0,
    pickSeq: 0,
  },
  leaflet: {
    map: null,
    marker: null,
    layers: null,
    debounceTimer: null,
    searchBound: false,
  },
  selected: null, // { lat, lng, provider, query }
  existingLocationId: null,
  existingLocationName: null,
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

function preventMidTokenWrap(value) {
  const s = String(value ?? "");
  // Replace hyphens inside alphanumeric tokens with a non-breaking hyphen so wrap only occurs between words/tokens.
  // Example: "RO-26-0007" and "2026-04-30" won't split across lines, but "Order 108 - Site" can still wrap.
  return s.replace(/([A-Za-z0-9])-([A-Za-z0-9])/g, `$1\u2011$2`);
}

function toFiniteCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function normalizeEquipmentTableColumnKeys(value) {
  if (value === null) return null;
  let raw = value;
  if (typeof raw === "string") raw = safeJsonParse(raw, null);
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    const key = String(entry || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function getActiveUserId() {
  const session = window.RentSoft?.getSession?.();
  const uid = Number(session?.user?.id);
  return Number.isFinite(uid) && uid > 0 ? uid : null;
}

function equipmentTableColumnsStorageKey(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const uid = getActiveUserId();
  return `${EQUIPMENT_COLUMNS_KEY_PREFIX}:${cid}:${uid || "anon"}`;
}

function loadUserEquipmentTableColumns(companyId) {
  const key = equipmentTableColumnsStorageKey(companyId);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeEquipmentTableColumnKeys(raw);
}

function persistUserEquipmentTableColumns(companyId, keys) {
  const key = equipmentTableColumnsStorageKey(companyId);
  if (!key) return;
  const normalized = normalizeEquipmentTableColumnKeys(keys);
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(normalized));
}

function clearUserEquipmentTableColumns(companyId) {
  const key = equipmentTableColumnsStorageKey(companyId);
  if (!key) return;
  localStorage.removeItem(key);
}

function normalizeEquipmentTableColumnWidths(value, allowedKeys) {
  let raw = value;
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string") raw = safeJsonParse(raw, null);
  if (!raw || typeof raw !== "object") return null;
  const allowed = Array.isArray(allowedKeys) ? new Set(allowedKeys.map((k) => String(k || "").trim()).filter(Boolean)) : null;
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    let key = String(k || "").trim();
    if (!key) continue;
    if (allowed && !allowed.has(key)) {
      const mapped = mapLegacyTrackingColumnKey(key);
      if (mapped && allowed.has(mapped)) {
        key = mapped;
      } else {
        continue;
      }
    }
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const clamped = Math.max(EQUIPMENT_COLUMN_WIDTH_MIN_PX, Math.min(EQUIPMENT_COLUMN_WIDTH_MAX_PX, Math.round(n)));
    out[key] = clamped;
  }
  return Object.keys(out).length ? out : null;
}

function equipmentTableColumnWidthsStorageKey(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  const uid = getActiveUserId();
  return `${EQUIPMENT_COLUMN_WIDTHS_KEY_PREFIX}:${cid}:${uid || "anon"}`;
}

function loadUserEquipmentTableColumnWidths(companyId, allowedKeys) {
  const key = equipmentTableColumnWidthsStorageKey(companyId);
  if (!key) return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return normalizeEquipmentTableColumnWidths(raw, allowedKeys);
}

function persistUserEquipmentTableColumnWidths(companyId, widths, allowedKeys) {
  const key = equipmentTableColumnWidthsStorageKey(companyId);
  if (!key) return;
  const normalized = normalizeEquipmentTableColumnWidths(widths, allowedKeys);
  if (!normalized) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(normalized));
}

function clearUserEquipmentTableColumnWidths(companyId) {
  const key = equipmentTableColumnWidthsStorageKey(companyId);
  if (!key) return;
  localStorage.removeItem(key);
}

function normalizeTrackingColumnKey(id) {
  const raw = String(id ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return `tracking:${Math.round(n)}`; // legacy (field id)
  const key = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return key ? `tracking:${key}` : null; // preferred (field_key)
}

function mapLegacyTrackingColumnKey(key) {
  const raw = String(key ?? "").trim();
  const match = raw.match(/^tracking:(\d+)$/);
  if (!match) return null;
  const id = Number(match[1]);
  if (!Number.isFinite(id) || id <= 0) return null;
  const cols = Array.isArray(trackingTableColumnsCache) ? trackingTableColumnsCache : [];
  const col = cols.find((c) => Number(c?.id) === id) || null;
  const fieldKey = String(col?.fieldKey || "").trim();
  if (!fieldKey) return null;
  return normalizeTrackingColumnKey(fieldKey);
}

function getEquipmentTableAvailableColumns() {
  const trackingColumns = Array.isArray(trackingTableColumnsCache) ? trackingTableColumnsCache : [];
  const dedupedTrackingColumns = [];
  const seenTrackingColumnKeys = new Set();
  trackingColumns.forEach((col) => {
    const fieldKey = String(col?.fieldKey || "").trim();
    if (!fieldKey) return;
    const key = normalizeTrackingColumnKey(fieldKey);
    if (!key || seenTrackingColumnKeys.has(key)) return;
    seenTrackingColumnKeys.add(key);
    const label = col?.tableColumnLabel || col?.label || fieldKey;
    dedupedTrackingColumns.push({ key, label: String(label || "").trim() || fieldKey, grid: "minmax(160px, 1fr)" });
  });
  return [...EQUIPMENT_TABLE_BASE_COLUMNS, ...dedupedTrackingColumns];
}

function ensureRequiredEquipmentTableColumns(keys) {
  const list = Array.isArray(keys) ? keys.slice() : [];
  for (const required of EQUIPMENT_TABLE_REQUIRED_COLUMN_KEYS) {
    if (!list.includes(required)) list.unshift(required);
  }
  const out = [];
  const seen = new Set();
  for (const k of list) {
    const key = String(k || "").trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function getEffectiveEquipmentTableVisibleKeys(companyId, availableColumns) {
  const availableKeys = new Set((availableColumns || []).map((c) => c.key));
  const userKeys = loadUserEquipmentTableColumns(companyId);
  const companyKeys = normalizeEquipmentTableColumnKeys(companyAssetsTableColumnsDefault);

  const candidate = userKeys !== null ? userKeys : companyKeys !== null ? companyKeys : null;
  const translatedCandidate = candidate
    ? candidate
        .map((k) => {
          const raw = String(k || "").trim();
          if (!raw) return "";
          if (availableKeys.has(raw)) return raw;
          const mapped = mapLegacyTrackingColumnKey(raw);
          return mapped && availableKeys.has(mapped) ? mapped : raw;
        })
        .filter(Boolean)
    : null;

  const effective = translatedCandidate
    ? translatedCandidate.filter((k) => availableKeys.has(k))
    : (availableColumns || []).map((c) => c.key);
  return ensureRequiredEquipmentTableColumns(effective);
}

function isEquipmentTableSortFieldVisible(visibleKeys) {
  if (!Array.isArray(visibleKeys) || !visibleKeys.length) return true;
  if (!sortField) return true;
  if (!ALLOWED_SORT_FIELDS.has(sortField)) return true;
  if (!EQUIPMENT_TABLE_BASE_COLUMNS.some((c) => c.sortKey === sortField)) return true;
  return visibleKeys.includes(sortField);
}

function ensureEquipmentTableSortFieldVisible(visibleKeys) {
  if (isEquipmentTableSortFieldVisible(visibleKeys)) return;
  sortField = "type";
  persistEquipmentListState();
}

function clearEquipmentHeaderStatus() {
  if (equipmentFormStatus) {
    equipmentFormStatus.textContent = "";
    equipmentFormStatus.style.display = "none";
  }
  if (openEquipmentRentalOrderBtn) {
    openEquipmentRentalOrderBtn.style.display = "none";
    openEquipmentRentalOrderBtn.disabled = true;
    delete openEquipmentRentalOrderBtn.dataset.orderId;
  }
}

function getWorkOrderNumberForEquipment(companyId, equipmentId) {
  const eid = Number(equipmentId);
  if (!Number.isFinite(eid)) return null;
  const matches = (Array.isArray(workOrdersCache) ? workOrdersCache : []).filter((order) => {
    const unitIds = Array.isArray(order?.unitIds)
      ? order.unitIds.map((id) => String(id))
      : order?.unitId
        ? [String(order.unitId)]
        : [];
    return unitIds.includes(String(eid));
  });
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

function setEquipmentHeaderRentalOrderLink(item) {
  if (!openEquipmentRentalOrderBtn) return;
  const orderId = item?.rental_order_id ? String(item.rental_order_id).trim() : "";
  if (!orderId) {
    openEquipmentRentalOrderBtn.style.display = "none";
    openEquipmentRentalOrderBtn.disabled = true;
    delete openEquipmentRentalOrderBtn.dataset.orderId;
    return;
  }

  const roLabel = getRentalOrderLabel(item);
  openEquipmentRentalOrderBtn.textContent = roLabel ? `Open ${roLabel}` : "Open rental order";
  openEquipmentRentalOrderBtn.dataset.orderId = orderId;
  openEquipmentRentalOrderBtn.disabled = false;
  openEquipmentRentalOrderBtn.style.display = "inline-flex";
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
  return { key, label, roLabel };
}

function setEquipmentHeaderStatus(item) {
  setEquipmentHeaderRentalOrderLink(item);
  if (!equipmentFormStatus) return;
  const status = String(item?.availability_status || "").toLowerCase();
  const showStatus =
    status === "rented out" ||
    status === "overdue" ||
    status === "reserved" ||
    status.includes("request") ||
    item?.is_overdue === true;
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

openEquipmentRentalOrderBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const orderId = String(openEquipmentRentalOrderBtn.dataset.orderId || "").trim();
  if (!orderId) return;
  window.location.href = `rental-order-form.html?id=${encodeURIComponent(orderId)}&from=assets`;
});


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

function isSelectElement(el) {
  return !!el && el.tagName === "SELECT";
}

function getLocationDetailById(locationId) {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return null;
  return (locationsCache || []).find((row) => Number(row?.id) === id) || null;
}

function formatLocationDetailAddress(loc) {
  if (!loc) return "";
  const street = loc.street_address ?? loc.streetAddress;
  const city = loc.city;
  const region = loc.region ?? loc.state ?? loc.province;
  const country = loc.country;
  const parts = [street, city, region, country].filter((part) => part && String(part).trim());
  if (parts.length) return parts.map((part) => String(part).trim()).join(", ");
  const query = loc.query ?? loc.map_query ?? loc.mapQuery ?? loc.geocode_query ?? loc.geocodeQuery;
  if (query) return String(query).trim();
  return String(loc.name || "").trim();
}

function updateCurrentLocationDisplay({ currentLocationId, baseLocationId } = {}) {
  const currentId =
    currentLocationId !== undefined && currentLocationId !== null
      ? String(currentLocationId || "")
      : currentLocationIdInput?.value || "";
  const baseId =
    baseLocationId !== undefined && baseLocationId !== null ? String(baseLocationId || "") : locationSelect?.value || "";
  let text = "Same as base location";
  let loc = null;
  if (currentId) {
    loc = getLocationDetailById(currentId);
    const storedLabel = String(currentLocationIdInput?.dataset?.label || "").trim();
    text = formatLocationDetailAddress(loc) || storedLabel || "Current location";
  } else if (baseId) {
    text = "Same as base location";
  }

  if (currentLocationDisplay) {
    currentLocationDisplay.textContent = text;
    currentLocationDisplay.classList.toggle("is-empty", !currentId);
  }

  if (currentLocationModeSelect) {
    const currentOpt = currentLocationModeSelect.querySelector?.('option[value="__current__"]');
    if (currentOpt) {
      if (currentId) {
        currentOpt.hidden = false;
        currentOpt.textContent = text;
        if (currentLocationModeSelect.value !== "__new__") currentLocationModeSelect.value = "__current__";
      } else {
        currentOpt.hidden = true;
        if (currentLocationModeSelect.value === "__current__") currentLocationModeSelect.value = "";
      }
    }
  }
}

function setCurrentLocationValue(value, label) {
  if (!currentLocationIdInput) return;
  const normalized = value === null || value === undefined ? "" : String(value);
  currentLocationIdInput.value = normalized;
  if (normalized) {
    const nextLabel = label === null || label === undefined ? "" : String(label).trim();
    if (nextLabel) currentLocationIdInput.dataset.label = nextLabel;
  } else {
    delete currentLocationIdInput.dataset.label;
  }
  if (currentLocationModeSelect) currentLocationModeSelect.value = normalized ? "__current__" : "";
  updateCurrentLocationDisplay();
}

function getOutOfServiceMap() {
  const orders = Array.isArray(workOrdersCache) ? workOrdersCache : [];
  const map = new Map();
  orders.forEach((order) => {
    if (!order?.unitId) return;
    if (order.serviceStatus === "out_of_service" && order.orderStatus !== "closed") {
      map.set(String(order.unitId), order);
    }
  });
  return map;
}

function getReturnInspectionMap() {
  const orders = Array.isArray(workOrdersCache) ? workOrdersCache : [];
  const map = new Map();
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
  workOrdersCache = [];
  companyMeta.textContent = detail || "";
  if (activeCompanyId) {
    loadCompanyAssetsTableColumnsDefault(activeCompanyId).then(() => {
      try {
        renderEquipment(applyFilters());
      } catch {
        // ignore
      }
    });
    loadLocations();
    loadEquipment();
    loadWorkOrdersCache();
    loadTypes();
    loadBundles();
  } else {
    workOrdersCache = [];
    locationSelect.innerHTML = `<option value="">Select a location</option><option value="__new__">+ Add new location...</option>`;
    if (currentLocationModeSelect) currentLocationModeSelect.value = "";
    if (currentLocationIdInput) {
      currentLocationIdInput.value = "";
      updateCurrentLocationDisplay();
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

function formatLocationAddress(parts) {
  return parts
    .map((part) => (part === null || part === undefined ? "" : String(part).trim()))
    .filter(Boolean)
    .join(", ");
}

function getCurrentLocationLabel(row, baseFallback) {
  const placeholderName = String(row.current_location || "").trim();
  const isOrderSiteName = /^order\\s+\\d+\\s*-\\s*site$/i.test(placeholderName);
  const address = formatLocationAddress([
    row.current_location_street_address,
    row.current_location_city,
    row.current_location_region,
    row.current_location_country,
  ]);
  const query = String(row.current_location_query || "").trim();
  const rentalAddress = String(row.rental_site_address || row.rental_site_address_query || "").trim();
  if (address) return address;
  if (query) return query;
  if (rentalAddress) return rentalAddress;
  if (isOrderSiteName) return baseFallback || "--";
  return placeholderName || baseFallback || "--";
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
  const outOfServiceMap = getOutOfServiceMap();
  const returnInspectionMap = getReturnInspectionMap();
  const normalizeTrackingFieldKey = (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const cid = normalizeCompanyId();
  const availableColumns = getEquipmentTableAvailableColumns();
  const visibleKeys = cid ? getEffectiveEquipmentTableVisibleKeys(cid, availableColumns) : ensureRequiredEquipmentTableColumns([]);
  ensureEquipmentTableSortFieldVisible(visibleKeys);
  const visibleColumns = availableColumns.filter((col) => visibleKeys.includes(col.key));
  const columnsToRender = visibleColumns.length ? visibleColumns : availableColumns;
  const allowedWidthKeys = availableColumns.map((c) => c.key);
  const widthOverrides = cid ? loadUserEquipmentTableColumnWidths(cid, allowedWidthKeys) : null;
  lastEquipmentTableColumnsToRender = columnsToRender;
  lastEquipmentTableCompanyId = cid || null;

  const fieldIdByTypeAndKey = new Map();
  const trackingColumns = Array.isArray(trackingTableColumnsCache) ? trackingTableColumnsCache : [];
  trackingColumns.forEach((col) => {
    const typeId = Number(col?.equipmentTypeId ?? col?.equipment_type_id);
    const fieldId = Number(col?.id);
    const fieldKey = normalizeTrackingFieldKey(col?.fieldKey ?? col?.field_key);
    if (!Number.isFinite(typeId) || typeId <= 0) return;
    if (!Number.isFinite(fieldId) || fieldId <= 0) return;
    if (!fieldKey) return;
    const mapKey = `${typeId}|${fieldKey}`;
    if (!fieldIdByTypeAndKey.has(mapKey)) fieldIdByTypeAndKey.set(mapKey, fieldId);
  });

  equipmentTable.style.setProperty(
    "--equipment-table-grid",
    columnsToRender.map((c) => (widthOverrides && widthOverrides[c.key] ? `${widthOverrides[c.key]}px` : c.grid)).join(" ")
  );
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };

  const renderHeaderCell = (col) => {
    const label = String(col?.label || "").trim() || col.key;
    const key = String(col?.key || "").trim() || "";
    const keyAttr = escapeHtml(key);
    if (col.sortKey && ALLOWED_SORT_FIELDS.has(col.sortKey)) {
      return `<span class="equipment-th" data-col-key="${keyAttr}"><span class="equipment-th-label"><span class="sort ${sortField === col.sortKey ? "active" : ""}" data-sort="${escapeHtml(col.sortKey)}">${escapeHtml(
        label
      )} ${indicator(col.sortKey)}</span></span><span class="col-resizer" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize column" data-col-key="${keyAttr}"></span></span>`;
    }
    return `<span class="equipment-th" data-col-key="${keyAttr}"><span class="equipment-th-label"><span title="${escapeHtml(
      label
    )}">${escapeHtml(label)}</span></span><span class="col-resizer" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize column" data-col-key="${keyAttr}"></span></span>`;
  };

  const headerCols = columnsToRender.map(renderHeaderCell).join("");
  equipmentTable.innerHTML = `<div class="table-row table-header">${headerCols}</div>`;

  rows.forEach((row) => {
    const baseLocation = row.location || "--";
    const currentLocation = getCurrentLocationLabel(row, baseLocation);
    const div = document.createElement("div");
    const isReturnInspection = returnInspectionMap.has(String(row.id));
    const isOutOfService = isReturnInspection || outOfServiceMap.has(String(row.id));
    div.className = `table-row${isOutOfService ? " is-out-of-service" : ""}`;
    div.dataset.id = row.id;

    const availabilityStatus = String(
      row.availability_status || row.availabilityStatus || row.status || row.state || row.rental_status || ""
    ).toLowerCase();
    const isReservedOrRequested = availabilityStatus.includes("reserved") || availabilityStatus.includes("request");
    const isRentedOrOverdue =
      availabilityStatus.includes("rent") || availabilityStatus.includes("out") || availabilityStatus.includes("overdue") || row.is_overdue === true;
    const showRentalInfo = isRentedOrOverdue || isReservedOrRequested;
    const roLabel = showRentalInfo ? preventMidTokenWrap(getRentalOrderLabel(row) || "") : "";
    const roId = showRentalInfo ? Number(row.rental_order_id) : null;
    const customerName = showRentalInfo ? preventMidTokenWrap(row.rental_customer_name || "") : "";
    const customerId = showRentalInfo ? Number(row.rental_customer_id) : null;
    const roCell =
      roLabel && Number.isFinite(roId) && roId > 0
        ? `<a class="ghost small table-link" href="rental-order-form.html?id=${encodeURIComponent(String(roId))}" title="Open rental order">${roLabel}</a>`
        : roLabel
          ? roLabel
          : `<span class="hint">--</span>`;
    const customerCell =
      customerName && Number.isFinite(customerId) && customerId > 0
        ? `<a class="ghost small table-link" href="customers-form.html?id=${encodeURIComponent(String(customerId))}" title="Open customer">${customerName}</a>`
        : customerName
          ? customerName
          : `<span class="hint">--</span>`;
    const statusInfo = getEquipmentStatusInfo(row, { isReturnInspection, isOutOfService });
    const statusTag = `<span class="status-tag ${statusInfo.key}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(
      statusInfo.label
    )}</span>`;

    const trackingValuesById = row.tracking_table_values && typeof row.tracking_table_values === "object" ? row.tracking_table_values : {};
    const trackingValuesByKey =
      row.tracking_table_values_by_key && typeof row.tracking_table_values_by_key === "object"
        ? row.tracking_table_values_by_key
        : {};
    const trackingStatusesById =
      row.tracking_table_status_by_field_id && typeof row.tracking_table_status_by_field_id === "object"
        ? row.tracking_table_status_by_field_id
        : {};
    const trackingStatusesByKey =
      row.tracking_table_status_by_field_key && typeof row.tracking_table_status_by_field_key === "object"
        ? row.tracking_table_status_by_field_key
        : {};

    const modelBadges = [
      isReturnInspection ? `<span class="badge return-inspection" style="margin-left:6px;">Return inspection</span>` : "",
      !isReturnInspection && isOutOfService ? `<span class="badge out-of-service" style="margin-left:6px;">Out of service</span>` : "",
    ].join("");

    const baseCells = {
      type: `<span>${escapeHtml(preventMidTokenWrap(row.type || "--"))}</span>`,
      model_name: `<span>${escapeHtml(preventMidTokenWrap(row.model_name || "--"))}${modelBadges}</span>`,
      rental_order_number: `<span>${roCell}</span>`,
      rental_customer_name: `<span>${customerCell}</span>`,
      availability_status: `<span class="status-cell">${statusTag}</span>`,
      location: `<span>${escapeHtml(preventMidTokenWrap(baseLocation))}</span>`,
      current_location: `<span>${escapeHtml(preventMidTokenWrap(currentLocation))}</span>`,
    };

    const cellForKey = (key) => {
      if (baseCells[key]) return baseCells[key];
      if (key.startsWith("tracking:")) {
        const colId = String(key.split(":")[1] || "").trim();
        const normalizedKey = normalizeTrackingFieldKey(colId);
        const typeId = Number(row?.type_id);
        const fieldId =
          Number.isFinite(typeId) && typeId > 0 && normalizedKey
            ? fieldIdByTypeAndKey.get(`${typeId}|${normalizedKey}`) || null
            : null;
        let v =
          trackingValuesByKey[colId] !== undefined
            ? trackingValuesByKey[colId]
            : fieldId
              ? trackingValuesById[String(fieldId)]
              : trackingValuesById[colId];

        if ((v === null || v === undefined || v === "") && normalizedKey === "hours_operated") {
          const meter = row?.meter_hours ?? row?.meterHours ?? null;
          const n = meter === null || meter === undefined ? null : Number(meter);
          if (Number.isFinite(n)) v = String(n);
        }
        const label = v === null || v === undefined || v === "" ? "--" : preventMidTokenWrap(String(v));
        const statusKey = String(
          trackingStatusesByKey[colId] ||
            (fieldId ? trackingStatusesById[String(fieldId)] : trackingStatusesById[colId]) ||
            ""
        ).trim();
        const statusClass =
          statusKey === "ok"
            ? "tracking-ok"
            : statusKey === "dueSoon"
              ? "tracking-due-soon"
              : statusKey === "overdue" || statusKey === "missing"
                ? "tracking-overdue"
                : "";
        return `<span class="tracking-cell ${statusClass}">${escapeHtml(label)}</span>`;
      }
      return `<span class="hint">--</span>`;
    };

    div.innerHTML = columnsToRender.map((c) => cellForKey(c.key)).join("");
    equipmentTable.appendChild(div);
  });
}

function applyEquipmentTableGridWithWidths(widthOverrides) {
  if (!equipmentTable) return;
  const cols = Array.isArray(lastEquipmentTableColumnsToRender) ? lastEquipmentTableColumnsToRender : [];
  if (!cols.length) return;
  equipmentTable.style.setProperty(
    "--equipment-table-grid",
    cols.map((c) => (widthOverrides && widthOverrides[c.key] ? `${widthOverrides[c.key]}px` : c.grid)).join(" ")
  );
}

function renderEquipmentCards(rows) {
  if (!equipmentCards) return;
  equipmentCards.replaceChildren();
  const outOfServiceMap = getOutOfServiceMap();
  const returnInspectionMap = getReturnInspectionMap();

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
      status.append(dot, document.createTextNode(availability.label));
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
    locationsCache = locations;
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

    if (currentLocationModeSelect && !currentLocationModeSelect.value) {
      currentLocationModeSelect.value = "";
    }

    applyPendingSelectValue(locationSelect);
    updateCurrentLocationDisplay();

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
    equipmentTypesCache = Array.isArray(data.types) ? data.types : [];
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
    syncEquipmentTypeFallbackImages();
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
    trackingTableColumnsCache = Array.isArray(data.trackingTableColumns) ? data.trackingTableColumns : [];
    renderEquipment(applyFilters());

    if (pendingOpenEquipmentId) {
      const eid = pendingOpenEquipmentId;
      pendingOpenEquipmentId = null;
      await loadEquipmentById(eid);
    }
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadEquipmentById(id) {
  if (!activeCompanyId || !id) return;
  try {
    const res = await fetch(`/api/equipment/${id}?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch equipment details");
    const item = await res.json();
    startEditEquipment(item);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadWorkOrdersCache() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/work-orders?companyId=${encodeURIComponent(activeCompanyId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load work orders.");
    workOrdersCache = Array.isArray(data.workOrders) ? data.workOrders : [];
    if (equipmentCache.length) {
      renderEquipment(applyFilters());
    }
  } catch (err) {
    companyMeta.textContent = err.message || "Unable to load work orders.";
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
        r.current_location_street_address,
        r.current_location_city,
        r.current_location_region,
        r.current_location_country,
        r.availability_status,
        r.availabilityStatus,
        r.status,
        r.state,
        r.rental_status,
        r.bundle_name,
        r.notes,
        r.tracking_status,
        r.tracking_needs_summary,
        r.rental_order_number,
        r.rental_customer_name,
        r.rental_site_address,
        r.rental_site_address_query,
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
        case "tracking_status": {
          const key = String(row.tracking_status_key || "").trim();
          const rank = {
            overdue: 0,
            dueSoon: 1,
            missing: 2,
            ok: 3,
            none: 4,
          };
          return rank[key] ?? 9;
        }
        case "tracking_needs_summary":
          return String(row.tracking_needs_summary || "").toLowerCase();
        case "current_location": {
          const baseFallback = row.location || "";
          return getCurrentLocationLabel(row, baseFallback).toLowerCase();
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

async function loadCompanyAssetsTableColumnsDefault(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) {
    companyAssetsTableColumnsDefault = null;
    companyAssetsTableColumnsLoadedForId = null;
    companyAssetDirectionsLoadedForId = null;
    companyAssetDirectionsEnabled = false;
    return null;
  }
  if (companyAssetsTableColumnsLoadedForId === cid) return companyAssetsTableColumnsDefault;
  companyAssetsTableColumnsLoadedForId = cid;
  companyAssetDirectionsLoadedForId = cid;
  try {
    const res = await fetch(`/api/company-settings?companyId=${encodeURIComponent(String(cid))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load company settings");
    const raw = data?.settings?.assets_table_columns ?? data?.settings?.assetsTableColumns ?? null;
    companyAssetsTableColumnsDefault = normalizeEquipmentTableColumnKeys(raw);
    companyAssetDirectionsEnabled = data?.settings?.asset_directions_enabled === true;
    applyEquipmentDirectionsFeatureUi();
    return companyAssetsTableColumnsDefault;
  } catch {
    companyAssetsTableColumnsDefault = null;
    companyAssetDirectionsEnabled = false;
    applyEquipmentDirectionsFeatureUi();
    return null;
  }
}

function applyEquipmentDirectionsFeatureUi() {
  const enabled = companyAssetDirectionsEnabled === true;
  if (equipmentDirectionsWrap) equipmentDirectionsWrap.style.display = enabled ? "" : "none";
  if (!enabled && equipmentDirectionsInput) equipmentDirectionsInput.value = "";
}

function promptAssetDirections({ suggested = "" } = {}) {
  const defaultValue = String(suggested || "");
  const response = window.prompt("Directions for this asset's current location (optional):", defaultValue);
  const finalValue = response === null ? defaultValue : String(response);
  const trimmed = finalValue.trim();
  return trimmed || null;
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

async function setEquipmentCurrentLocation({ equipmentId, locationId, directions } = {}) {
  const companyId = normalizeCompanyId();
  const eqId = Number(equipmentId);
  const locId = Number(locationId);
  if (!companyId) throw new Error("Select a company first.");
  if (!Number.isFinite(eqId) || !Number.isFinite(locId)) throw new Error("Invalid equipment or location.");
  const res = await fetch("/api/equipment/current-location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      equipmentIds: [eqId],
      currentLocationId: locId,
      ...(directions !== undefined ? { directions } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to update current location.");
  return data;
}

function syncEquipmentCurrentLocationCache({ equipmentId, locationId, label, lat, lng }) {
  const eq = (equipmentCache || []).find((row) => String(row.id) === String(equipmentId));
  if (!eq) return;
  const locId = Number(locationId);
  if (!Number.isFinite(locId)) return;
  eq.current_location_id = locId;
  if (label) eq.current_location = label;
  if (Number.isFinite(lat)) eq.current_location_latitude = lat;
  if (Number.isFinite(lng)) eq.current_location_longitude = lng;
}

function syncEquipmentDirectionsCache({ equipmentId, directions }) {
  const eq = (equipmentCache || []).find((row) => String(row.id) === String(equipmentId));
  if (!eq) return;
  eq.directions = directions || null;
}

async function persistCurrentLocationForEditingEquipment({ locationId, label, lat, lng }) {
  if (!editingEquipmentId) return;
  const equipmentId = Number(editingEquipmentId);
  if (!Number.isFinite(equipmentId)) return;
  const directions =
    companyAssetDirectionsEnabled === true ? promptAssetDirections({ suggested: equipmentDirectionsInput?.value || "" }) : undefined;
  await setEquipmentCurrentLocation({ equipmentId, locationId, directions });
  syncEquipmentCurrentLocationCache({ equipmentId, locationId, label, lat, lng });
  if (companyAssetDirectionsEnabled === true) {
    syncEquipmentDirectionsCache({ equipmentId, directions });
    if (equipmentDirectionsInput) equipmentDirectionsInput.value = directions || "";
  }
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
  (locationsCache || []).forEach((loc) => {
    const label = String(loc?.name || "").trim();
    if (label) existing.add(label);
  });
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
    const orderId = order?.id ?? order?.workOrderId ?? order?.work_order_id ?? null;
    const number =
      order?.number ??
      order?.workOrderNumber ??
      order?.work_order_number ??
      order?.workorder_number ??
      "";
    const orderStatusRaw = order?.orderStatus ?? order?.order_status ?? order?.status ?? "";
    const orderStatus = String(orderStatusRaw || "").toLowerCase();
    const serviceStatusRaw = order?.serviceStatus ?? order?.service_status ?? order?.service ?? "";
    const serviceStatus = String(serviceStatusRaw || "").toLowerCase();
    const returnInspection = order?.returnInspection ?? order?.return_inspection ?? false;
    const workSummary = order?.workSummary ?? order?.work_summary ?? order?.summary ?? "";
    const updatedAt =
      order?.updatedAt ??
      order?.updated_at ??
      order?.closedAt ??
      order?.closed_at ??
      order?.completedAt ??
      order?.completed_at ??
      order?.workDate ??
      order?.work_date ??
      order?.date ??
      order?.createdAt ??
      order?.created_at ??
      null;
    const statusLabel = orderStatus === "closed" ? "Closed" : orderStatus === "completed" ? "Completed" : "Open";
    const serviceLabel = serviceStatus === "out_of_service" ? "Out of service" : "In service";
    const inspectionBadge = returnInspection ? ` <span class="badge return-inspection">Return inspection</span>` : "";
    const updatedLabel = formatHistoryTimestamp(updatedAt);
    const div = document.createElement("div");
    div.className = "table-row";
    if (orderId !== null && orderId !== undefined && orderId !== "") div.dataset.id = orderId;
    div.innerHTML = `
      <span>${escapeHtml(number || "--")}</span>
      <span>${escapeHtml(statusLabel)}</span>
      <span>${escapeHtml(serviceLabel)}${inspectionBadge}</span>
      <span>${escapeHtml(workSummary || "--")}</span>
      <span class="hint">${escapeHtml(updatedLabel)}</span>
    `;
    equipmentWorkOrdersTable.appendChild(div);
  });

  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = `${items.length} work order${items.length === 1 ? "" : "s"}`;
}

async function loadEquipmentWorkOrders(equipmentId) {
  const cid = normalizeCompanyId();
  const eid = Number(equipmentId);
  if (!cid || !Number.isFinite(eid)) return;
  if (!equipmentWorkOrdersTable) return;

  if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "Loading...";
  const res = await fetch(
    `/api/work-orders?companyId=${encodeURIComponent(cid)}&unitId=${encodeURIComponent(eid)}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = data.error || "Unable to load work orders.";
    renderEquipmentWorkOrders([]);
    return;
  }
  const rows = Array.isArray(data.workOrders) ? data.workOrders : [];
  rows.sort((a, b) => {
    const aTime = Date.parse(
      a?.updatedAt || a?.updated_at || a?.closedAt || a?.closed_at || a?.workDate || a?.work_date || a?.date || ""
    );
    const bTime = Date.parse(
      b?.updatedAt || b?.updated_at || b?.closedAt || b?.closed_at || b?.workDate || b?.work_date || b?.date || ""
    );
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    const aNumber = a?.number ?? a?.workOrderNumber ?? a?.work_order_number ?? "";
    const bNumber = b?.number ?? b?.workOrderNumber ?? b?.work_order_number ?? "";
    return String(aNumber || "").localeCompare(String(bNumber || ""));
  });

  renderEquipmentWorkOrders(rows);
  equipmentWorkOrdersLoadedForId = String(eid);
}

function setEquipmentTrackingMessage(message, { isError = false } = {}) {
  if (!equipmentTrackingNeedsSummary) return;
  equipmentTrackingNeedsSummary.textContent = message ? String(message) : "";
  equipmentTrackingNeedsSummary.style.color = isError ? "var(--danger)" : "";
}

function getHistoryTimeMs(obj, keys) {
  const list = Array.isArray(keys) ? keys : [];
  for (const k of list) {
    const raw = obj?.[k];
    if (!raw) continue;
    const ms = Date.parse(String(raw));
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function renderEquipmentMeterReadings(readings) {
  if (!equipmentMeterReadingsTable) return;
  const rows = Array.isArray(readings) ? readings.slice() : [];
  const equipmentIdKey = String(equipmentTrackingLoadedForId || editingEquipmentId || "");
  const isExpanded = equipmentIdKey ? expandedMeterHistoryKeys.has(equipmentIdKey) : false;
  if (equipmentMeterHistoryActions) equipmentMeterHistoryActions.replaceChildren();
  if (!rows.length) {
    equipmentMeterReadingsTable.innerHTML = "";
    return;
  }
  rows.sort((a, b) => {
    const aTime = getHistoryTimeMs(a, ["readAt", "read_at", "createdAt", "created_at"]);
    const bTime = getHistoryTimeMs(b, ["readAt", "read_at", "createdAt", "created_at"]);
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return 0;
  });
  equipmentMeterReadingsTable.innerHTML = `
    <div class="table-row table-header">
      <span>When</span>
      <span>Reading</span>
      <span>Note</span>
    </div>
  `;
  rows.forEach((r, idx) => {
    const div = document.createElement("div");
    div.className = "table-row";
    const when = r?.readAt || r?.read_at || r?.createdAt || r?.created_at || "";
    const reading = r?.reading ?? "";
    const note = r?.note || "";
    if (equipmentIdKey && idx >= 2) div.dataset.historyExtra = "1";
    if (!isExpanded && equipmentIdKey && idx >= 2) {
      div.hidden = true;
    }
    div.innerHTML = `
      <span>${escapeHtml(formatHistoryTimestamp(when))}</span>
      <span>${escapeHtml(String(reading ?? "--"))}</span>
      <span>${escapeHtml(String(note || "--"))}</span>
    `;
    equipmentMeterReadingsTable.appendChild(div);
  });

  if (equipmentMeterHistoryActions && equipmentIdKey && rows.length > 2) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ghost small";
    btn.dataset.action = "meter-toggle-history";
    btn.dataset.equipmentId = equipmentIdKey;
    btn.textContent = isExpanded ? "Show less" : `Show all (${rows.length})`;
    equipmentMeterHistoryActions.appendChild(btn);
  }
}

function renderEquipmentTrackingEvents(events, fieldsById) {
  if (!equipmentTrackingEventsTable) return;
  const rows = Array.isArray(events) ? events : [];
  if (!rows.length) {
    equipmentTrackingEventsTable.innerHTML = "";
    return;
  }
  equipmentTrackingEventsTable.innerHTML = `
    <div class="table-row table-header">
      <span>When</span>
      <span>Field</span>
      <span>Value</span>
      <span>Note</span>
    </div>
  `;
  rows.forEach((ev) => {
    const div = document.createElement("div");
    div.className = "table-row";
    const when = ev?.occurredAt || ev?.occurred_at || ev?.createdAt || ev?.created_at || "";
    const fid = String(ev?.fieldId ?? ev?.field_id ?? "");
    const fieldLabel = fieldsById?.get?.(fid) || `Field ${fid || "--"}`;
    div.innerHTML = `
      <span>${escapeHtml(formatHistoryTimestamp(when))}</span>
      <span>${escapeHtml(fieldLabel)}</span>
      <span>${escapeHtml(String(ev?.value ?? "--"))}</span>
      <span>${escapeHtml(String(ev?.note || "--"))}</span>
    `;
    equipmentTrackingEventsTable.appendChild(div);
  });
}


function renderEquipmentTrackingFields(tracking) {
  if (!equipmentTrackingFieldsWrap) return;
  equipmentTrackingFieldsWrap.replaceChildren();

  const fields = Array.isArray(tracking?.fields) ? tracking.fields : [];
  const allEvents = Array.isArray(tracking?.events) ? tracking.events.slice() : [];
  allEvents.sort((a, b) => {
    const aTime = getHistoryTimeMs(a, ["occurredAt", "occurred_at", "createdAt", "created_at"]);
    const bTime = getHistoryTimeMs(b, ["occurredAt", "occurred_at", "createdAt", "created_at"]);
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return bTime - aTime;
    if (Number.isFinite(aTime)) return -1;
    if (Number.isFinite(bTime)) return 1;
    return 0;
  });
  const eventsByFieldId = new Map();
  allEvents.forEach((ev) => {
    const fid = String(ev?.fieldId ?? ev?.field_id ?? "");
    if (!fid) return;
    if (!eventsByFieldId.has(fid)) eventsByFieldId.set(fid, []);
    eventsByFieldId.get(fid).push(ev);
  });

  const filteredFields = fields.filter((field) => {
    const fieldKey = String(field?.fieldKey ?? field?.field_key ?? field?.key ?? "").trim().toLowerCase();
    return fieldKey !== "hours_operated";
  });
  if (!filteredFields.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No tracking fields configured for this equipment type yet.";
    equipmentTrackingFieldsWrap.appendChild(empty);
    return;
  }

  const valuesByFieldId = tracking?.valuesByFieldId && typeof tracking.valuesByFieldId === "object" ? tracking.valuesByFieldId : {};
  const dueValuesByFieldId =
    tracking?.dueValuesByFieldId && typeof tracking.dueValuesByFieldId === "object" ? tracking.dueValuesByFieldId : {};
  const statusByFieldId = new Map(
    (tracking?.summary?.statuses || []).map((s) => [String(s?.fieldId ?? ""), s]).filter(([k]) => k)
  );
  const equipmentIdKey = String(equipmentTrackingLoadedForId || editingEquipmentId || "");

  filteredFields.forEach((field) => {
    const fid = String(field?.id ?? "");
    const row = document.createElement("div");
    row.className = "tracking-field-row";
    row.dataset.fieldId = fid;

    const labelWrap = document.createElement("div");
    const label = document.createElement("div");
    label.style.fontWeight = "800";
    label.textContent = field.label || field.fieldKey || `Field ${fid}`;
    const meta = document.createElement("p");
    meta.className = "hint";
    const status = statusByFieldId.get(fid);
    const statusKey = status?.statusKey;
    const statusLabel =
      statusKey === "overdue"
        ? "Overdue"
        : statusKey === "dueSoon"
          ? "Due soon"
          : statusKey === "missing"
            ? "Missing"
            : "OK";
    const due = status?.dueAtLabel ? ` · Next: ${status.dueAtLabel}` : "";
    meta.textContent = `${field.dataType || "text"}${field.unit ? ` · ${field.unit}` : ""} · ${statusLabel}${due}`;
    labelWrap.appendChild(label);
    labelWrap.appendChild(meta);

    const inputWrap = document.createElement("div");
    inputWrap.className = "tracking-field-inputs";
    let inputEl = null;
    const currentValue = valuesByFieldId[fid];
    const type = String(field.dataType || "").trim();
    const ruleType = field?.rule?.enabled === true ? String(field?.rule?.ruleType || "none") : "none";

    if (type === "date") {
      inputEl = document.createElement("input");
      inputEl.type = "date";
      inputEl.value = currentValue ? String(currentValue).slice(0, 10) : "";
    } else if (type === "datetime") {
      inputEl = document.createElement("input");
      inputEl.type = "datetime-local";
      inputEl.value = currentValue ? toDatetimeLocalValue(currentValue) : "";
    } else if (type === "number") {
      inputEl = document.createElement("input");
      inputEl.type = "number";
      inputEl.min = "0";
      inputEl.step = "0.1";
      inputEl.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);
    } else if (type === "boolean") {
      inputEl = document.createElement("input");
      inputEl.type = "checkbox";
      inputEl.checked = currentValue === true;
    } else if (type === "select") {
      inputEl = document.createElement("select");
      const emptyOpt = document.createElement("option");
      emptyOpt.value = "";
      emptyOpt.textContent = "Select...";
      inputEl.appendChild(emptyOpt);
      const opts = Array.isArray(field.options) ? field.options : [];
      opts.forEach((opt) => {
        const o = document.createElement("option");
        o.value = String(opt?.value ?? opt ?? "");
        o.textContent = String(opt?.label ?? opt?.value ?? opt ?? "");
        inputEl.appendChild(o);
      });
      inputEl.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);
    } else {
      inputEl = document.createElement("input");
      inputEl.type = "text";
      inputEl.value = currentValue === null || currentValue === undefined ? "" : String(currentValue);
    }

    inputEl.classList.add("tracking-field-input");
    inputEl.dataset.fieldId = fid;
    inputWrap.appendChild(inputEl);

    if (ruleType === "manual_due_date_separate" && (type === "date" || type === "datetime")) {
      const dueGroup = document.createElement("div");
      dueGroup.className = "tracking-field-due-group";
      const dueLabel = document.createElement("span");
      dueLabel.className = "hint tracking-field-due-label";
      dueLabel.textContent = "Due date";

      const dueInput = document.createElement("input");
      const currentDue = dueValuesByFieldId[fid];
      if (type === "date") {
        dueInput.type = "date";
        dueInput.value = currentDue ? String(currentDue).slice(0, 10) : "";
      } else {
        dueInput.type = "datetime-local";
        dueInput.value = currentDue ? toDatetimeLocalValue(currentDue) : "";
      }
      dueInput.classList.add("tracking-field-due-input");
      dueInput.dataset.fieldId = fid;
      dueInput.setAttribute("aria-label", "Due date");
      dueGroup.appendChild(dueLabel);
      dueGroup.appendChild(dueInput);
      inputWrap.appendChild(dueGroup);
    }

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "tracking-field-actions";

    const logBtn = document.createElement("button");
    logBtn.type = "button";
    logBtn.className = "ghost small";
    logBtn.dataset.action = "tracking-log-event";
    logBtn.dataset.fieldId = fid;
    logBtn.textContent = "Log";
    actionsWrap.appendChild(logBtn);

    const woBtn = document.createElement("button");
    woBtn.type = "button";
    woBtn.className = "ghost small";
    woBtn.dataset.action = "tracking-create-wo";
    woBtn.dataset.fieldId = fid;
    woBtn.textContent = "Create WO";
    actionsWrap.appendChild(woBtn);

    row.appendChild(labelWrap);
    row.appendChild(inputWrap);
    row.appendChild(actionsWrap);

    // Per-field history (most recent first), collapsed to 2 rows by default.
    const fieldEvents = eventsByFieldId.get(fid) || [];
    const historyWrap = document.createElement("div");
    historyWrap.className = "tracking-field-history";
    historyWrap.dataset.fieldId = fid;

    const head = document.createElement("div");
    head.className = "tracking-field-history-head";
    const title = document.createElement("p");
    title.className = "hint";
    title.style.margin = "0";
    title.textContent = "History";
    head.appendChild(title);

    const historyTable = document.createElement("div");
    historyTable.className = "table tracking-field-history-table";
    historyTable.dataset.fieldId = fid;

    if (!fieldEvents.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.margin = "6px 0 0";
      empty.textContent = "No history yet.";
      historyWrap.appendChild(head);
      historyWrap.appendChild(empty);
    } else {
      const key = equipmentIdKey ? `${equipmentIdKey}:${fid}` : "";
      const isExpanded = key ? expandedTrackingFieldHistoryKeys.has(key) : false;

      historyTable.innerHTML = `
        <div class="table-row table-header">
          <span>When</span>
          <span>Value</span>
          <span>Note</span>
        </div>
      `;
      fieldEvents.forEach((ev, idx) => {
        const div = document.createElement("div");
        div.className = "table-row";
        if (idx >= 2) div.dataset.historyExtra = "1";
        if (!isExpanded && idx >= 2) div.hidden = true;
        const when = ev?.occurredAt || ev?.occurred_at || ev?.createdAt || ev?.created_at || "";
        div.innerHTML = `
          <span>${escapeHtml(formatHistoryTimestamp(when))}</span>
          <span>${escapeHtml(String(ev?.value ?? "--"))}</span>
          <span>${escapeHtml(String(ev?.note || "--"))}</span>
        `;
        historyTable.appendChild(div);
      });

      if (fieldEvents.length > 2 && key) {
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "ghost small";
        toggleBtn.dataset.action = "tracking-toggle-history";
        toggleBtn.dataset.fieldId = fid;
        toggleBtn.dataset.equipmentId = equipmentIdKey;
        toggleBtn.textContent = isExpanded ? "Show less" : `Show all (${fieldEvents.length})`;
        head.appendChild(toggleBtn);
      }

      historyWrap.appendChild(head);
      historyWrap.appendChild(historyTable);
    }

    row.appendChild(historyWrap);
    equipmentTrackingFieldsWrap.appendChild(row);
  });
}


function renderEquipmentTrackingNeeds(tracking) {
  if (!equipmentTrackingNeedsList) return;
  equipmentTrackingNeedsList.replaceChildren();

  const statuses = Array.isArray(tracking?.summary?.statuses) ? tracking.summary.statuses : [];
  const needs = statuses.filter((s) => s?.statusKey === "overdue" || s?.statusKey === "dueSoon" || s?.statusKey === "missing");
  if (!needs.length) {
    const ok = document.createElement("p");
    ok.className = "hint";
    ok.textContent = "Nothing due right now.";
    equipmentTrackingNeedsList.appendChild(ok);
    return;
  }

  needs.forEach((s) => {
    const row = document.createElement("div");
    row.className = "tracking-field-row";
    row.dataset.fieldId = String(s.fieldId || "");

    const labelWrap = document.createElement("div");
    const title = document.createElement("div");
    title.style.fontWeight = "800";
    title.textContent = s.label || "Tracking item";
    const meta = document.createElement("p");
    meta.className = "hint";
    const statusText = s.statusKey === "overdue" ? "Overdue" : s.statusKey === "dueSoon" ? "Due soon" : "Missing data";
    meta.textContent = s.dueAtLabel ? `${statusText} · Next: ${s.dueAtLabel}` : statusText;
    labelWrap.appendChild(title);
    labelWrap.appendChild(meta);

    const spacer = document.createElement("div");

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "tracking-field-actions";

    const woBtn = document.createElement("button");
    woBtn.type = "button";
    woBtn.className = "primary small";
    woBtn.dataset.action = "tracking-create-wo";
    woBtn.dataset.fieldId = String(s.fieldId || "");
    woBtn.textContent = "Create work order";
    actionsWrap.appendChild(woBtn);

    row.appendChild(labelWrap);
    row.appendChild(spacer);
    row.appendChild(actionsWrap);
    equipmentTrackingNeedsList.appendChild(row);
  });
}

function setEquipmentTrackingStatus(tracking) {
  if (!equipmentTrackingStatusPill) return;
  const key = String(tracking?.summary?.overallStatusKey || "none");
  const label = String(tracking?.summary?.overallStatusLabel || "--");
  equipmentTrackingStatusPill.textContent = label;
  equipmentTrackingStatusPill.classList.remove("tracking-overdue", "tracking-due-soon", "tracking-missing", "tracking-ok");
  equipmentTrackingStatusPill.classList.add("tracking-pill");
  if (key === "overdue") equipmentTrackingStatusPill.classList.add("tracking-overdue");
  else if (key === "dueSoon") equipmentTrackingStatusPill.classList.add("tracking-due-soon");
  else if (key === "missing") equipmentTrackingStatusPill.classList.add("tracking-missing");
  else if (key === "ok") equipmentTrackingStatusPill.classList.add("tracking-ok");
}

async function loadEquipmentTracking(equipmentId) {
  const cid = normalizeCompanyId();
  const eid = Number(equipmentId);
  if (!cid || !Number.isFinite(eid)) return;

  setEquipmentTrackingMessage("Loading...");
  const res = await fetch(
    `/api/equipment/${encodeURIComponent(String(eid))}/tracking?companyId=${encodeURIComponent(String(cid))}&eventsLimit=50&readingsLimit=50`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || "Unable to load tracking.";
    setEquipmentTrackingMessage(msg, { isError: true });
    return;
  }

  const tracking = data.tracking || null;
  lastEquipmentTrackingPayload = tracking;
  equipmentTrackingLoadedForId = String(eid);

  setEquipmentTrackingStatus(tracking);
  const needsSummary = Array.isArray(tracking?.summary?.needs) ? tracking.summary.needs.join("; ") : "";
  setEquipmentTrackingMessage(needsSummary);

  if (equipmentMeterMeta) {
    const meter = tracking?.latestMeterHours;
    equipmentMeterMeta.textContent = Number.isFinite(Number(meter))
      ? `Latest reading: ${Number(meter)} hours.`
      : "No readings yet. Add a reading to track hours of operation.";
  }

  renderEquipmentTrackingNeeds(tracking);
  renderEquipmentTrackingFields(tracking);
  // Field history is now rendered inline per field; keep the legacy "History" card hidden.
  if (equipmentTrackingHistoryCard) equipmentTrackingHistoryCard.style.display = "none";
  renderEquipmentMeterReadings(tracking?.meterReadings || []);
}

function getTrackingFieldFromCache(fieldId) {
  const fid = String(fieldId || "");
  const fields = Array.isArray(lastEquipmentTrackingPayload?.fields) ? lastEquipmentTrackingPayload.fields : [];
  return fields.find((f) => String(f?.id || "") === fid) || null;
}

function getTrackingInputValue(inputEl, dataType) {
  const type = String(dataType || "").trim();
  if (!inputEl) return null;
  if (type === "boolean") return inputEl.checked === true;
  if (type === "number") {
    const raw = String(inputEl.value || "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (type === "date") {
    const raw = String(inputEl.value || "").trim();
    return raw || null;
  }
  if (type === "datetime") {
    const raw = String(inputEl.value || "").trim();
    return raw ? new Date(raw).toISOString() : null;
  }
  const raw = String(inputEl.value ?? "").trim();
  return raw ? raw : null;
}

function openWorkOrderFromTracking({ equipmentId, fieldId }) {
  const cid = normalizeCompanyId();
  const eid = Number(equipmentId);
  const fid = String(fieldId || "");
  if (!cid || !Number.isFinite(eid) || !fid) return;
  const field = getTrackingFieldFromCache(fid);
  const fieldLabel = field?.label || field?.fieldKey || `Field ${fid}`;

  const statuses = Array.isArray(lastEquipmentTrackingPayload?.summary?.statuses)
    ? lastEquipmentTrackingPayload.summary.statuses
    : [];
  const status = statuses.find((s) => String(s?.fieldId || "") === String(fid)) || null;
  const statusText =
    status?.statusKey === "overdue"
      ? "Overdue"
      : status?.statusKey === "dueSoon"
        ? "Due soon"
        : status?.statusKey === "missing"
          ? "Missing data"
          : "Tracking";
  const dueText = status?.dueAtLabel ? ` (next: ${status.dueAtLabel})` : "";
  const summary = `Tracking: ${fieldLabel} - ${statusText}${dueText}`;

  const sourceMeta = {
    equipmentId: eid,
    trackingFieldId: Number(field?.id),
    trackingFieldLabel: fieldLabel,
    trackingDataType: field?.dataType || null,
  };

  const qs = new URLSearchParams();
  qs.set("companyId", String(cid));
  qs.set("unitId", String(eid));
  qs.set("summary", summary);
  qs.set("source", "asset_tracking");
  qs.set("sourceMeta", JSON.stringify(sourceMeta));
  window.location.href = `work-order-form.html?${qs.toString()}`;
}

function setEquipmentExtrasTab(tab) {
  const next = ["location-history", "work-orders", "tracking"].includes(String(tab)) ? String(tab) : "location-history";
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

  if (next === "work-orders") {
    if (!editingEquipmentId || !activeCompanyId) {
      if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = "Save the unit first.";
      renderEquipmentWorkOrders([]);
      return;
    }
    if (!equipmentWorkOrdersLoadedForId || equipmentWorkOrdersLoadedForId !== String(editingEquipmentId)) {
      loadEquipmentWorkOrders(editingEquipmentId).catch((err) => {
        if (equipmentWorkOrdersMeta) equipmentWorkOrdersMeta.textContent = err?.message || "Unable to load work orders.";
      });
    }
    return;
  }

  if (!editingEquipmentId || !activeCompanyId) {
    setEquipmentTrackingMessage("Save the unit first.");
    return;
  }
  if (!equipmentTrackingLoadedForId || equipmentTrackingLoadedForId !== String(editingEquipmentId)) {
    loadEquipmentTracking(editingEquipmentId).catch((err) => {
      setEquipmentTrackingMessage(err?.message || "Unable to load tracking.", { isError: true });
    });
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
  equipmentTrackingLoadedForId = null;
  lastEquipmentTrackingPayload = null;
  if (equipmentTrackingNeedsSummary) equipmentTrackingNeedsSummary.textContent = "";
  if (equipmentTrackingNeedsList) equipmentTrackingNeedsList.innerHTML = "";
  if (equipmentTrackingEventsTable) equipmentTrackingEventsTable.innerHTML = "";
  if (equipmentMeterReadingsTable) equipmentMeterReadingsTable.innerHTML = "";
  if (equipmentMeterMeta) equipmentMeterMeta.textContent = "";
  setEquipmentTrackingMessage("");
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
  if (currentLocationPickerSuggestions) currentLocationPickerSuggestions.hidden = true;
  if (currentLocationPickerSuggestions) currentLocationPickerSuggestions.replaceChildren();
  if (currentLocationPicker.google.debounceTimer) {
    clearTimeout(currentLocationPicker.google.debounceTimer);
    currentLocationPicker.google.debounceTimer = null;
  }
  clearGooglePlacesSessionToken();
  currentLocationPicker.google.searchSeq = (currentLocationPicker.google.searchSeq || 0) + 1;
  currentLocationPicker.google.pickSeq = (currentLocationPicker.google.pickSeq || 0) + 1;
  if (currentLocationPicker.leaflet.debounceTimer) {
    clearTimeout(currentLocationPicker.leaflet.debounceTimer);
    currentLocationPicker.leaflet.debounceTimer = null;
  }
  try {
    currentLocationPicker.leaflet.searchAbort?.abort?.();
  } catch { }
  currentLocationPicker.selected = null;
  currentLocationPicker.existingLocationId = null;
  currentLocationPicker.existingLocationName = null;
}

function setPickerSelected(lat, lng, { provider, query, existingLocationId, existingLocationName } = {}) {
  currentLocationPicker.selected = {
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  currentLocationPicker.existingLocationId = existingLocationId ?? null;
  currentLocationPicker.existingLocationName = existingLocationName ?? null;
  if (currentLocationPickerSearch && query) {
    const next = String(query || "").trim();
    if (next) currentLocationPickerSearch.value = next;
  }
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

function getPreferredMapProvider() {
  return window.RentSoft?.getMapProvider?.() === "leaflet" ? "leaflet" : "google";
}

function getGooglePlacesSessionToken() {
  const Token = window.google?.maps?.places?.AutocompleteSessionToken;
  if (!Token) return null;
  if (!currentLocationPicker.google.sessionToken) {
    currentLocationPicker.google.sessionToken = new Token();
  }
  return currentLocationPicker.google.sessionToken;
}

function clearGooglePlacesSessionToken() {
  currentLocationPicker.google.sessionToken = null;
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

function isGoogleMapsReady() {
  return typeof window.google?.maps?.Map === "function";
}

function waitForGoogleMapsReady({ timeoutMs = 4000, intervalMs = 50 } = {}) {
  if (isGoogleMapsReady()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (isGoogleMapsReady()) return resolve(true);
      if (Date.now() - start >= timeoutMs) return reject(new Error("Google Maps not ready."));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

function loadGoogleMaps(apiKey) {
  if (!apiKey) return Promise.resolve(false);
  if (isGoogleMapsReady()) return Promise.resolve(true);
  if (window.__rentsoftGoogleMapsLoading) return window.__rentsoftGoogleMapsLoading;

  window.__rentsoftGoogleMapsLoading = new Promise((resolve, reject) => {
    const id = "rentsoft-google-maps";
    const existing = document.getElementById(id);
    if (existing) {
      waitForGoogleMapsReady().then(() => resolve(true)).catch(reject);
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.defer = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async`;
    s.onload = () => {
      waitForGoogleMapsReady().then(() => resolve(true)).catch(reject);
    };
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
            {
              placeId,
              fields: ["geometry", "formatted_address", "name"],
              sessionToken: currentLocationPicker.google.sessionToken || undefined,
            },
            (place, status) => {
              if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                return reject(new Error(`Places details failed: ${status || "Unknown"}`));
              }
              const lat = place.geometry.location.lat();
              const lng = place.geometry.location.lng();
              clearGooglePlacesSessionToken();
              resolve({ lat, lng, label: place.formatted_address || place.name || label || "Pinned location" });
            }
          );
        });

      const requestPredictions = (input) =>
        new Promise((resolve, reject) => {
          currentLocationPicker.google.autocompleteService.getPlacePredictions(
            {
              input: String(input || ""),
              locationBias: map.getBounds?.() || undefined,
              sessionToken: getGooglePlacesSessionToken() || undefined,
            },
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
          clearGooglePlacesSessionToken();
          return;
        }
        if (currentLocationPicker.google.debounceTimer) clearTimeout(currentLocationPicker.google.debounceTimer);
        const seq = (currentLocationPicker.google.searchSeq || 0) + 1;
        currentLocationPicker.google.searchSeq = seq;
        currentLocationPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            if (seq !== currentLocationPicker.google.searchSeq) return;
            if (String(currentLocationPickerSearch.value || "").trim() !== q) return;
            renderPickerSuggestions(preds, async (p) => {
              hidePickerSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const pickSeq = (currentLocationPicker.google.pickSeq || 0) + 1;
                currentLocationPicker.google.pickSeq = pickSeq;
                const details = await fetchPlaceDetails(placeId, label);
                if (pickSeq !== currentLocationPicker.google.pickSeq) return;
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
            clearGooglePlacesSessionToken();
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

function setPickerMarker(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (currentLocationPicker.mode === "google") {
    const map = currentLocationPicker.google.map;
    if (!map || !window.google?.maps) return;
    if (!currentLocationPicker.google.marker) {
      currentLocationPicker.google.marker = new window.google.maps.Marker({
        position: { lat, lng },
        map,
        draggable: true,
      });
      currentLocationPicker.google.marker.addListener("dragend", (evt) => {
        const nextLat = evt?.latLng?.lat?.();
        const nextLng = evt?.latLng?.lng?.();
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return;
        setPickerSelected(nextLat, nextLng, { provider: "manual_pin" });
      });
    } else {
      currentLocationPicker.google.marker.setPosition({ lat, lng });
    }
    return;
  }
  const map = currentLocationPicker.leaflet.map;
  if (!map || !window.L) return;
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
}

function findLocationById(locationId) {
  const id = Number(locationId);
  if (!Number.isFinite(id)) return null;
  const loc = (locationsCache || []).find((row) => Number(row?.id) === id);
  if (!loc) return null;
  const lat = toFiniteCoordinate(loc.latitude);
  const lng = toFiniteCoordinate(loc.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { id, name: loc.name || "", lat, lng };
}

function getPickerPrefillSearchText(prefill) {
  if (!prefill) return "";

  const fromStoredLabel =
    prefill.source === "current" ? String(currentLocationIdInput?.dataset?.label || "").trim() : "";
  if (fromStoredLabel && fromStoredLabel.toLowerCase() !== "current location") return fromStoredLabel;

  const detail = prefill.id ? getLocationDetailById(prefill.id) : null;
  const fromDetail = formatLocationDetailAddress(detail) || String(detail?.name || "").trim();
  if (fromDetail) return fromDetail;

  return String(prefill.name || "").trim();
}

function getPickerPrefillLocation() {
  const selectedCurrent = findLocationById(currentLocationIdInput?.value);
  if (selectedCurrent) return { ...selectedCurrent, source: "current" };

  const eq = editingEquipmentId
    ? (equipmentCache || []).find((row) => String(row.id) === String(editingEquipmentId))
    : null;
  if (eq) {
    const cLat = toFiniteCoordinate(eq.current_location_latitude);
    const cLng = toFiniteCoordinate(eq.current_location_longitude);
    if (Number.isFinite(cLat) && Number.isFinite(cLng)) {
      const id = Number(eq.current_location_id);
      return {
        id: Number.isFinite(id) ? id : null,
        name: eq.current_location || "",
        lat: cLat,
        lng: cLng,
        source: "current",
      };
    }
  }

  const selectedBase = findLocationById(locationSelect?.value);
  if (selectedBase) return { ...selectedBase, source: "base" };

  if (eq) {
    const bLat = toFiniteCoordinate(eq.location_latitude);
    const bLng = toFiniteCoordinate(eq.location_longitude);
    if (Number.isFinite(bLat) && Number.isFinite(bLng)) {
      const id = Number(eq.location_id);
      return {
        id: Number.isFinite(id) ? id : null,
        name: eq.location || "",
        lat: bLat,
        lng: bLng,
        source: "base",
      };
    }
  }

  return null;
}

async function openCurrentLocationPicker() {
  if (!activeCompanyId) {
    companyMeta.textContent = "Select or create a company first.";
    return;
  }
  openCurrentLocationPickerModal();
  if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Loading map...";
  hidePickerSuggestions();

  const prefill = getPickerPrefillLocation();
  if (currentLocationPickerSearch) {
    currentLocationPickerSearch.value = getPickerPrefillSearchText(prefill);
  }
  let center = { lat: 20, lng: 0 };
  if (prefill) center = { lat: prefill.lat, lng: prefill.lng };
  else {
    try {
      center = await getUserGeolocation();
    } catch {
      // ignore
    }
  }

  const provider = getPreferredMapProvider();
  if (provider === "leaflet") {
    resetPickerMapContainer();
    currentLocationPicker.mode = "leaflet";
    if (!window.L) {
      if (currentLocationPickerMeta) {
        currentLocationPickerMeta.textContent = "Leaflet is not available. Refresh or switch back to Google Maps.";
      }
      return;
    }
    initLeafletPicker(center);
    if (currentLocationPickerMeta) {
      currentLocationPickerMeta.textContent = "Search (OpenStreetMap) or click to drop a pin.";
    }
    if (prefill) {
      const keepExisting = prefill.source === "current" && Number.isFinite(prefill.id);
      setPickerSelected(prefill.lat, prefill.lng, {
        provider: "existing_location",
        existingLocationId: keepExisting ? prefill.id : null,
        existingLocationName: keepExisting ? prefill.name : null,
      });
      setPickerMarker(prefill.lat, prefill.lng);
    }
    return;
  }

  const config = await getPublicConfig().catch(() => ({}));
  const key = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";
  const hasGoogle = isGoogleMapsReady();
  if (!key && !hasGoogle) {
    resetPickerMapContainer();
    if (currentLocationPickerMeta) {
      currentLocationPickerMeta.textContent =
        "Google Maps API key is required. Set GOOGLE_MAPS_API_KEY and reload to use the map picker.";
    }
    return;
  }

  try {
    if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Loading Google Maps...";
    if (!hasGoogle) await loadGoogleMaps(key);
    resetPickerMapContainer();
    currentLocationPicker.mode = "google";
    initGooglePicker(center);
    if (currentLocationPickerMeta) {
      const places = window.google?.maps?.places;
      const hasSvc = !!places?.AutocompleteService;
      const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
      currentLocationPickerMeta.textContent = msg;
    }
    if (prefill) {
      const keepExisting = prefill.source === "current" && Number.isFinite(prefill.id);
      setPickerSelected(prefill.lat, prefill.lng, {
        provider: "existing_location",
        existingLocationId: keepExisting ? prefill.id : null,
        existingLocationName: keepExisting ? prefill.name : null,
      });
      setPickerMarker(prefill.lat, prefill.lng);
    }
  } catch (err) {
    resetPickerMapContainer();
    if (currentLocationPickerMeta) {
      currentLocationPickerMeta.textContent =
        `Google Maps failed to load: ${err?.message || String(err)}. ` +
        "Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
    }
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

function normalizeUrlArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") return safeParseJsonArray(value).filter(Boolean).map(String);
  return [];
}

function getEquipmentCardImageUrl() {
  if (!equipmentForm?.cardImageUrl) return "";
  return String(equipmentForm.cardImageUrl.value || "").trim();
}

function setEquipmentCardImageUrl(url) {
  if (!equipmentForm?.cardImageUrl) return;
  equipmentForm.cardImageUrl.value = url ? String(url) : "";
  if (equipmentForm?.dataset) delete equipmentForm.dataset.cardPendingIndex;
}

function getEquipmentPendingCardIndex() {
  const raw = equipmentForm?.dataset?.cardPendingIndex;
  const idx = Number(raw);
  if (!Number.isFinite(idx) || idx < 0) return null;
  return idx;
}

function setEquipmentPendingCardIndex(idx) {
  if (!equipmentForm) return;
  if (!equipmentForm.dataset) return;
  if (idx === null || idx === undefined || idx === "") {
    delete equipmentForm.dataset.cardPendingIndex;
    return;
  }
  const n = Number(idx);
  if (!Number.isFinite(n) || n < 0) return;
  equipmentForm.dataset.cardPendingIndex = String(n);
  if (equipmentForm.cardImageUrl) equipmentForm.cardImageUrl.value = "";
}

function getEquipmentTypeImageUrls(type) {
  const urls = Array.isArray(type?.image_urls) ? type.image_urls : [];
  const normalized = urls.filter(Boolean).map(String);
  if (normalized.length) return normalized;
  if (type?.image_url) return [String(type.image_url)];
  return [];
}

function syncEquipmentTypeFallbackImages() {
  if (!typeSelect) return;
  const typeId = String(typeSelect.value || "");
  if (!typeId || typeId === "__new_type__") {
    fallbackEquipmentImageUrls = [];
    renderEquipmentImages();
    return;
  }
  const type = equipmentTypesCache.find((t) => String(t?.id) === typeId);
  fallbackEquipmentImageUrls = getEquipmentTypeImageUrls(type);
  renderEquipmentImages();
}

function clearEquipmentImagePreviewObjectUrl() {
  if (!equipmentImagePreviewObjectUrl) return;
  try {
    URL.revokeObjectURL(equipmentImagePreviewObjectUrl);
  } catch {
    // ignore
  }
  equipmentImagePreviewObjectUrl = null;
}

function clearEquipmentImageViewerObjectUrl() {
  if (!equipmentImageViewerObjectUrl) return;
  try {
    URL.revokeObjectURL(equipmentImageViewerObjectUrl);
  } catch {
    // ignore
  }
  equipmentImageViewerObjectUrl = null;
}

function getEquipmentImageGalleryItems() {
  const items = [];
  const existingUrls = getEquipmentImageUrls();
  existingUrls.forEach((url) => items.push({ kind: "url", url }));
  pendingEquipmentFiles.forEach((_, idx) => items.push({ kind: "pending", index: idx }));

  const showFallback =
    existingUrls.length === 0 &&
    pendingEquipmentFiles.length === 0 &&
    Array.isArray(fallbackEquipmentImageUrls) &&
    fallbackEquipmentImageUrls.length > 0;
  if (showFallback) {
    fallbackEquipmentImageUrls.forEach((url) => items.push({ kind: "fallback", url: String(url) }));
  }

  return items;
}

function findSelectedGalleryIndex(items) {
  if (!selectedEquipmentImage) return -1;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (selectedEquipmentImage.kind !== item.kind) continue;
    if (item.kind === "pending" && Number(selectedEquipmentImage.index) === Number(item.index)) return i;
    if ((item.kind === "url" || item.kind === "fallback") && selectedEquipmentImage.url === item.url) return i;
  }
  return -1;
}

function selectEquipmentGalleryRelative(delta) {
  const items = getEquipmentImageGalleryItems();
  if (!items.length) return;
  const idx = findSelectedGalleryIndex(items);
  const next = idx === -1 ? 0 : (idx + delta + items.length) % items.length;
  selectedEquipmentImage = items[next];
  renderEquipmentImages();
}

function renderEquipmentImagePreview() {
  if (!equipmentImagePreviewWrap || !equipmentImagePreviewImg) return;

  const existingUrls = getEquipmentImageUrls();
  const hasPending = pendingEquipmentFiles && pendingEquipmentFiles.length > 0;
  const items = getEquipmentImageGalleryItems();
  const idx = findSelectedGalleryIndex(items);
  const total = items.length;

  if (equipmentImagePreviewPrevBtn) {
    const show = total > 1;
    equipmentImagePreviewPrevBtn.hidden = !show;
    equipmentImagePreviewPrevBtn.disabled = !show;
  }
  if (equipmentImagePreviewNextBtn) {
    const show = total > 1;
    equipmentImagePreviewNextBtn.hidden = !show;
    equipmentImagePreviewNextBtn.disabled = !show;
  }

  let src = "";
  let hint = "";

  if (selectedEquipmentImage?.kind === "pending") {
    const idx = Number(selectedEquipmentImage.index);
    const file = pendingEquipmentFiles[idx];
    if (file) {
      clearEquipmentImagePreviewObjectUrl();
      equipmentImagePreviewObjectUrl = URL.createObjectURL(file);
      src = equipmentImagePreviewObjectUrl;
      equipmentImagePreviewImg.addEventListener(
        "load",
        () => {
          clearEquipmentImagePreviewObjectUrl();
        },
        { once: true }
      );
    }
  } else if (selectedEquipmentImage?.kind === "url" && selectedEquipmentImage.url) {
    clearEquipmentImagePreviewObjectUrl();
    src = String(selectedEquipmentImage.url);
  } else if (selectedEquipmentImage?.kind === "fallback" && selectedEquipmentImage.url) {
    clearEquipmentImagePreviewObjectUrl();
    src = String(selectedEquipmentImage.url);
    hint = "Type image (inherited)";
  } else if (hasPending) {
    clearEquipmentImagePreviewObjectUrl();
    equipmentImagePreviewObjectUrl = URL.createObjectURL(pendingEquipmentFiles[0]);
    src = equipmentImagePreviewObjectUrl;
    equipmentImagePreviewImg.addEventListener(
      "load",
      () => {
        clearEquipmentImagePreviewObjectUrl();
      },
      { once: true }
    );
  } else if (existingUrls[0]) {
    clearEquipmentImagePreviewObjectUrl();
    src = String(existingUrls[0]);
  } else if (fallbackEquipmentImageUrls?.[0]) {
    clearEquipmentImagePreviewObjectUrl();
    src = String(fallbackEquipmentImageUrls[0]);
    hint = "Type image (inherited)";
  } else {
    clearEquipmentImagePreviewObjectUrl();
    equipmentImagePreviewWrap.hidden = true;
    if (equipmentImagePreviewHint) equipmentImagePreviewHint.textContent = "";
    equipmentImagePreviewImg.removeAttribute("src");
    return;
  }

  equipmentImagePreviewImg.src = src;
  equipmentImagePreviewWrap.hidden = false;
  if (equipmentImagePreviewHint) {
    const position = idx >= 0 ? idx + 1 : total ? 1 : 0;
    const counter = total > 1 ? `Image ${position}/${total}` : "";
    const label = hint ? hint : "";
    equipmentImagePreviewHint.textContent = [counter, label].filter(Boolean).join(" · ");
  }
}

equipmentImagePreviewWrap?.addEventListener("click", (e) => {
  if (e.target?.closest?.("a, button, input, textarea, select")) return;
  selectEquipmentGalleryRelative(1);
});

equipmentImagePreviewPrevBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  selectEquipmentGalleryRelative(-1);
});

equipmentImagePreviewNextBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  selectEquipmentGalleryRelative(1);
});

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
  const cardUrl = getEquipmentCardImageUrl();
  const pendingCardIndex = getEquipmentPendingCardIndex();
  existingUrls.forEach((url) => {
    const tile = document.createElement("div");
    tile.className = "thumb-tile";
    tile.dataset.kind = "url";
    tile.dataset.url = url;
    if (selectedEquipmentImage?.kind === "url" && selectedEquipmentImage.url === url) tile.classList.add("selected");
    const isCard = !!cardUrl && cardUrl === url;
    if (isCard) tile.classList.add("is-card");
    tile.innerHTML = `
      <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      ${isCard ? `<div class="thumb-badge">Card</div>` : ``}
      <div class="thumb-actions">
        <button type="button" class="ghost small" data-action="set-card" data-url="${url}">Card</button>
        <button type="button" class="ghost small danger" data-action="remove-existing" data-url="${url}">Remove</button>
      </div>
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
    const isCard = pendingCardIndex !== null && pendingCardIndex === idx;
    if (isCard) tile.classList.add("is-card");
    tile.innerHTML = `
      <img class="thumb" src="${objectUrl}" alt="" loading="lazy" />
      ${isCard ? `<div class="thumb-badge">Card</div>` : ``}
      <div class="thumb-actions">
        <button type="button" class="ghost small" data-action="set-card-pending" data-index="${idx}">Card</button>
        <button type="button" class="ghost small danger" data-action="remove-pending" data-index="${idx}">Remove</button>
      </div>
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
      const isCard = !!cardUrl && cardUrl === url;
      if (isCard) tile.classList.add("is-card");
      tile.innerHTML = `
        <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
        <div class="hint">Type image (inherited)</div>
        ${isCard ? `<div class="thumb-badge">Card</div>` : ``}
        <div class="thumb-actions">
          <button type="button" class="ghost small" data-action="set-card" data-url="${url}">Card</button>
        </div>
      `;
      equipmentImagesRow.appendChild(tile);
    });
  }

  const hasAny = existingUrls.length > 0 || pendingEquipmentFiles.length > 0;
  if (clearEquipmentImagesBtn) clearEquipmentImagesBtn.style.display = hasAny ? "inline-flex" : "none";
  ensureSelectedEquipmentImage();
  syncEquipmentAiTools();
  renderEquipmentImagePreview();
  renderEquipmentImageViewer();
}

function renderEquipmentImageViewer() {
  if (!equipmentImageViewer || !equipmentImageViewerImg) return;

  const items = getEquipmentImageGalleryItems();
  if (!items.length || !selectedEquipmentImage) {
    equipmentImageViewer.hidden = true;
    if (equipmentImageViewerHint) equipmentImageViewerHint.textContent = "";
    equipmentImageViewerImg.removeAttribute("src");
    clearEquipmentImageViewerObjectUrl();
    return;
  }

  const idx = findSelectedGalleryIndex(items);
  const total = items.length;
  const position = idx >= 0 ? idx + 1 : 1;

  let src = "";
  let label = "";
  if (selectedEquipmentImage.kind === "pending") {
    const file = pendingEquipmentFiles[Number(selectedEquipmentImage.index)];
    if (file) {
      clearEquipmentImageViewerObjectUrl();
      equipmentImageViewerObjectUrl = URL.createObjectURL(file);
      src = equipmentImageViewerObjectUrl;
      label = "New upload (not saved yet)";
      equipmentImageViewerImg.addEventListener(
        "load",
        () => {
          clearEquipmentImageViewerObjectUrl();
        },
        { once: true }
      );
    }
  } else if (selectedEquipmentImage.kind === "url") {
    clearEquipmentImageViewerObjectUrl();
    src = String(selectedEquipmentImage.url);
    label = "Asset image";
  } else if (selectedEquipmentImage.kind === "fallback") {
    clearEquipmentImageViewerObjectUrl();
    src = String(selectedEquipmentImage.url);
    label = "Type image (inherited)";
  }

  if (!src) {
    equipmentImageViewer.hidden = true;
    return;
  }

  equipmentImageViewerImg.src = src;
  equipmentImageViewer.hidden = false;

  const cardUrl = getEquipmentCardImageUrl();
  const pendingCardIndex = getEquipmentPendingCardIndex();
  const cardSuffix = (() => {
    if (cardUrl) {
      return cardUrl === selectedEquipmentImage.url ? " · Card image" : "";
    }
    if (pendingCardIndex !== null) {
      if (selectedEquipmentImage.kind === "pending" && Number(selectedEquipmentImage.index) === pendingCardIndex) {
        return " · Card image";
      }
      return " · Card: new upload";
    }
    return " · Card: type image";
  })();
  if (equipmentImageViewerHint) equipmentImageViewerHint.textContent = `${label} · ${position}/${total}${cardSuffix}`;

  if (equipmentImageSetCardBtn) {
    const canSet =
      selectedEquipmentImage.kind === "url" || selectedEquipmentImage.kind === "fallback" || selectedEquipmentImage.kind === "pending";
    equipmentImageSetCardBtn.disabled = !canSet;
  }
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
      if (getEquipmentCardImageUrl() === String(oldUrl)) setEquipmentCardImageUrl(newUrl);
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
  if (payload.condition === "") payload.condition = null;
  if (payload.notes === "") payload.notes = null;
  if (payload.cardImageUrl === "") payload.cardImageUrl = null;
  if (companyAssetDirectionsEnabled === true) {
    const existing = editingEquipmentId
      ? (equipmentCache || []).find((row) => String(row.id) === String(editingEquipmentId)) || null
      : null;
    const beforeEffectiveLocationId = existing
      ? (existing.current_location_id || existing.currentLocationId || existing.location_id || existing.locationId || null)
      : null;
    const afterEffectiveLocationId = payload.currentLocationId || payload.locationId || null;

    const locationChanged = existing && String(beforeEffectiveLocationId || "") !== String(afterEffectiveLocationId || "");
    if (locationChanged) {
      const nextDirections = promptAssetDirections({ suggested: payload.directions || existing?.directions || "" });
      payload.directions = nextDirections;
      if (equipmentDirectionsInput) equipmentDirectionsInput.value = nextDirections || "";
    } else if (payload.directions === "") {
      payload.directions = null;
    }
    payload.directions = payload.directions === null || payload.directions === undefined ? null : String(payload.directions).trim() || null;
  } else {
    delete payload.directions;
  }

  const existingUrls = getEquipmentImageUrls();
  const deleteAfterSave = new Set(getDeleteImageUrls());
  const pendingCardIndex = getEquipmentPendingCardIndex();

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
    if (pendingCardIndex !== null && uploadedUrls[pendingCardIndex]) {
      payload.cardImageUrl = uploadedUrls[pendingCardIndex];
    }
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
    setEquipmentCardImageUrl("");
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


locationSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new__") {
    e.target.value = "";
    openModal();
  }
  updateCurrentLocationDisplay();
});

currentLocationModeSelect?.addEventListener("change", (e) => {
  const value = String(e.target.value || "");
  if (value === "__new__") {
    if (currentLocationModeSelect) {
      const hasCurrent = !!String(currentLocationIdInput?.value || "");
      currentLocationModeSelect.value = hasCurrent ? "__current__" : "";
      updateCurrentLocationDisplay();
    }
    openCurrentLocationPicker().catch((err) => {
      companyMeta.textContent = err?.message || String(err);
    });
    return;
  }
  if (value === "") {
    setCurrentLocationValue("");
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
  setCurrentLocationValue("");
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
    return;
  }
  syncEquipmentTypeFallbackImages();
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

openEquipmentTrackingBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openEquipmentExtrasDrawer("tracking");
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

equipmentTrackingNeedsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const fid = btn.dataset.fieldId;
  if (action !== "tracking-create-wo" || !fid) return;
  if (!editingEquipmentId) return;
  openWorkOrderFromTracking({ equipmentId: editingEquipmentId, fieldId: fid });
});

equipmentTrackingFieldsWrap?.addEventListener("click", async (e) => {
  const btn = e.target.closest?.("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const fid = String(btn.dataset.fieldId || "");
  if (!action || !fid) return;
  if (!editingEquipmentId) return;

  if (action === "tracking-toggle-history") {
    const equipmentIdKey = String(btn.dataset.equipmentId || editingEquipmentId || "");
    if (!equipmentIdKey) return;
    const key = `${equipmentIdKey}:${fid}`;
    const isExpanded = expandedTrackingFieldHistoryKeys.has(key);
    if (isExpanded) expandedTrackingFieldHistoryKeys.delete(key);
    else expandedTrackingFieldHistoryKeys.add(key);

    const row = btn.closest?.(".tracking-field-row");
    const extras = row ? Array.from(row.querySelectorAll?.('.table-row[data-history-extra="1"]') || []) : [];
    extras.forEach((el) => {
      el.hidden = isExpanded; // collapsing hides extras; expanding shows them
    });
    btn.textContent = isExpanded ? `Show all (${extras.length + 2})` : "Show less";
    return;
  }

  if (!activeCompanyId) return;

  if (action === "tracking-create-wo") {
    openWorkOrderFromTracking({ equipmentId: editingEquipmentId, fieldId: fid });
    return;
  }

  if (action !== "tracking-log-event") return;

  const field = getTrackingFieldFromCache(fid);
  const inputEl = equipmentTrackingFieldsWrap.querySelector?.(
    `.tracking-field-input[data-field-id="${CSS.escape(fid)}"]`
  );
  const value = getTrackingInputValue(inputEl, field?.dataType);
  const ruleType = field?.rule?.enabled === true ? String(field?.rule?.ruleType || "none") : "none";
  const isSeparateManualDue = ruleType === "manual_due_date_separate";

  let due = null;
  if (isSeparateManualDue) {
    const dueInputEl = equipmentTrackingFieldsWrap.querySelector?.(
      `.tracking-field-due-input[data-field-id="${CSS.escape(fid)}"]`
    );
    due = getTrackingInputValue(dueInputEl, field?.dataType);
    if (due === null) {
      setEquipmentTrackingMessage("Enter a due date before logging.", { isError: true });
      return;
    }
  } else if (value === null) {
    setEquipmentTrackingMessage("Enter a value before logging.", { isError: true });
    return;
  }

  const note = window.prompt("Note (optional):", "") || "";

  try {
    setEquipmentTrackingMessage("Saving tracking update...");
    const res = await fetch(`/api/equipment/${encodeURIComponent(String(editingEquipmentId))}/tracking/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, fieldId: Number(fid), value, due, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save tracking update.");
    setEquipmentTrackingMessage("Tracking update saved.");
    await loadEquipmentTracking(editingEquipmentId);
    await loadEquipment();
  } catch (err) {
    setEquipmentTrackingMessage(err?.message || String(err), { isError: true });
  }
});

equipmentMeterHistoryActions?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action !== "meter-toggle-history") return;
  const equipmentIdKey = String(btn.dataset.equipmentId || equipmentTrackingLoadedForId || editingEquipmentId || "");
  if (!equipmentIdKey) return;
  const isExpanded = expandedMeterHistoryKeys.has(equipmentIdKey);
  if (isExpanded) expandedMeterHistoryKeys.delete(equipmentIdKey);
  else expandedMeterHistoryKeys.add(equipmentIdKey);

  const extras = equipmentMeterReadingsTable
    ? Array.from(equipmentMeterReadingsTable.querySelectorAll?.('.table-row[data-history-extra="1"]') || [])
    : [];
  extras.forEach((el) => {
    el.hidden = isExpanded;
  });
  btn.textContent = isExpanded ? `Show all (${extras.length + 2})` : "Show less";
});

equipmentMeterAddBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId || !editingEquipmentId) return;
  const reading = equipmentMeterReadingInput?.value;
  const readAtRaw = equipmentMeterReadAtInput?.value;
  const note = equipmentMeterNoteInput?.value;
  const readAt = readAtRaw ? new Date(readAtRaw).toISOString() : null;

  try {
    setEquipmentTrackingMessage("Saving meter reading...");
    const res = await fetch(`/api/equipment/${encodeURIComponent(String(editingEquipmentId))}/meter-readings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, reading, readAt, note, meterType: "hours" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save meter reading.");
    if (equipmentMeterReadingInput) equipmentMeterReadingInput.value = "";
    if (equipmentMeterReadAtInput) equipmentMeterReadAtInput.value = "";
    if (equipmentMeterNoteInput) equipmentMeterNoteInput.value = "";
    setEquipmentTrackingMessage("Meter reading saved.");
    await loadEquipmentTracking(editingEquipmentId);
    await loadEquipment();
  } catch (err) {
    setEquipmentTrackingMessage(err?.message || String(err), { isError: true });
  }
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
  if (e.target.closest("a")) return;
  if (e.target.closest(".col-resizer")) return;
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

equipmentTable?.addEventListener("pointerdown", (e) => {
  const handle = e.target?.closest?.(".col-resizer");
  if (!handle) return;
  const key = String(handle.dataset.colKey || "").trim();
  if (!key) return;
  const cid = lastEquipmentTableCompanyId || normalizeCompanyId();
  if (!cid) return;

  const headerCell = handle.closest?.(".equipment-th");
  if (!headerCell) return;
  const startWidth = headerCell.getBoundingClientRect().width;
  const startX = e.clientX;
  const availableKeys = getEquipmentTableAvailableColumns().map((c) => c.key);
  const widths = loadUserEquipmentTableColumnWidths(cid, availableKeys) || {};

  equipmentColumnResizeSession = {
    cid,
    key,
    startX,
    startWidth,
    widths,
    availableKeys,
    pointerId: e.pointerId,
    nextWidth: Math.round(startWidth),
  };

  e.preventDefault();
  e.stopPropagation();
  document.body.classList.add("is-col-resizing");
  try {
    handle.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }

  const onMove = (ev) => {
    if (!equipmentColumnResizeSession) return;
    if (ev.pointerId !== equipmentColumnResizeSession.pointerId) return;
    const delta = ev.clientX - equipmentColumnResizeSession.startX;
    const next = Math.max(
      EQUIPMENT_COLUMN_WIDTH_MIN_PX,
      Math.min(EQUIPMENT_COLUMN_WIDTH_MAX_PX, Math.round(equipmentColumnResizeSession.startWidth + delta))
    );
    equipmentColumnResizeSession.nextWidth = next;
    equipmentColumnResizeSession.widths[equipmentColumnResizeSession.key] = next;
    if (equipmentColumnResizeRaf) return;
    equipmentColumnResizeRaf = window.requestAnimationFrame(() => {
      equipmentColumnResizeRaf = 0;
      applyEquipmentTableGridWithWidths(equipmentColumnResizeSession?.widths || null);
    });
  };

  const endSession = (ev) => {
    if (!equipmentColumnResizeSession) return;
    if (ev.pointerId !== equipmentColumnResizeSession.pointerId) return;
    const session = equipmentColumnResizeSession;
    equipmentColumnResizeSession = null;
    document.body.classList.remove("is-col-resizing");
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", endSession);
    window.removeEventListener("pointercancel", endSession);
    persistUserEquipmentTableColumnWidths(session.cid, session.widths, session.availableKeys);
    applyEquipmentTableGridWithWidths(session.widths);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", endSession);
  window.addEventListener("pointercancel", endSession);
});

equipmentTable?.addEventListener("keydown", (e) => {
  const handle = e.target?.closest?.(".col-resizer");
  if (!handle) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const key = String(handle.dataset.colKey || "").trim();
  if (!key) return;
  const cid = lastEquipmentTableCompanyId || normalizeCompanyId();
  if (!cid) return;
  const availableKeys = getEquipmentTableAvailableColumns().map((c) => c.key);
  const widths = loadUserEquipmentTableColumnWidths(cid, availableKeys) || {};
  const headerCell = handle.closest?.(".equipment-th");
  const fallbackWidth = headerCell ? Math.round(headerCell.getBoundingClientRect().width) : 160;
  const current = Number.isFinite(Number(widths[key])) ? Number(widths[key]) : fallbackWidth;
  const step = e.shiftKey ? 40 : 10;
  const delta = e.key === "ArrowLeft" ? -step : step;
  const next = Math.max(EQUIPMENT_COLUMN_WIDTH_MIN_PX, Math.min(EQUIPMENT_COLUMN_WIDTH_MAX_PX, Math.round(current + delta)));
  widths[key] = next;
  persistUserEquipmentTableColumnWidths(cid, widths, availableKeys);
  applyEquipmentTableGridWithWidths(widths);
  e.preventDefault();
  e.stopPropagation();
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
  if (currentLocationIdInput) {
    const baseFallback = String(item.location || "").trim() || "Same as base location";
    const label = getCurrentLocationLabel(item, baseFallback);
    setCurrentLocationValue(item.current_location_id || "", label);
  }
  equipmentForm.purchasePrice.value = item.purchase_price || "";

  pendingEquipmentFiles = [];
  syncFileInputFiles(equipmentForm.imageFiles, []);
  clearDeleteImageUrls();
  const typeUrls = normalizeUrlArray(item.type_image_urls);
  fallbackEquipmentImageUrls = typeUrls;
  if (!fallbackEquipmentImageUrls.length && item.type_image_url) fallbackEquipmentImageUrls = [String(item.type_image_url)];
  const ownedUrls = normalizeUrlArray(item.equipment_image_urls);
  if (!ownedUrls.length && item.equipment_image_url) {
    const fallbackTypeUrl =
      (typeUrls[0] ? String(typeUrls[0]) : null) ||
      (item.type_image_url ? String(item.type_image_url) : null);
    if (!fallbackTypeUrl || String(item.equipment_image_url) !== fallbackTypeUrl) {
      ownedUrls.push(String(item.equipment_image_url));
    }
  }
  setEquipmentCardImageUrl(item.card_image_url || item.cardImageUrl || "");
  setEquipmentImageUrls(ownedUrls);
  renderEquipmentImages();

  equipmentForm.notes.value = item.notes || "";
  if (equipmentDirectionsInput) equipmentDirectionsInput.value = item.directions || "";

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

  if (action === "set-card") {
    const url = String(btn.dataset.url || "").trim();
    if (!url) return;
    setEquipmentCardImageUrl(url);
    renderEquipmentImages();
    return;
  }

  if (action === "set-card-pending") {
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0) return;
    setEquipmentPendingCardIndex(idx);
    renderEquipmentImages();
    return;
  }

  if (action === "remove-existing") {
    const url = btn.dataset.url;
    if (!url) return;
    const nextUrls = getEquipmentImageUrls().filter((u) => u !== url);
    setEquipmentImageUrls(nextUrls);
    addDeleteImageUrl(url);
    if (getEquipmentCardImageUrl() === String(url)) setEquipmentCardImageUrl("");
    if (selectedEquipmentImage?.kind === "url" && selectedEquipmentImage.url === url) selectedEquipmentImage = null;
    renderEquipmentImages();
    return;
  }

  if (action === "remove-pending") {
    const idx = Number(btn.dataset.index);
    if (!Number.isFinite(idx) || idx < 0) return;
    pendingEquipmentFiles = pendingEquipmentFiles.filter((_, i) => i !== idx);
    syncFileInputFiles(equipmentForm.imageFiles, pendingEquipmentFiles);
    const pendingCardIndex = getEquipmentPendingCardIndex();
    if (pendingCardIndex !== null) {
      if (pendingCardIndex === idx) setEquipmentPendingCardIndex(null);
      else if (pendingCardIndex > idx) setEquipmentPendingCardIndex(pendingCardIndex - 1);
    }
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
  setEquipmentCardImageUrl("");
  selectedEquipmentImage = null;
  renderEquipmentImages();
});

equipmentImagePrevBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  selectEquipmentGalleryRelative(-1);
});

equipmentImageNextBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  selectEquipmentGalleryRelative(1);
});

equipmentImageSetCardBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!selectedEquipmentImage) return;
  if (selectedEquipmentImage.kind === "pending") {
    setEquipmentPendingCardIndex(Number(selectedEquipmentImage.index));
  } else if (selectedEquipmentImage.kind === "url" || selectedEquipmentImage.kind === "fallback") {
    setEquipmentCardImageUrl(selectedEquipmentImage.url);
  } else {
    return;
  }
  renderEquipmentImages();
});

equipmentImageClearCardBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  setEquipmentCardImageUrl("");
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
    const typeUrls = normalizeUrlArray(item?.type_image_urls);
    const ownedUrls = normalizeUrlArray(item?.equipment_image_urls);
    if (!ownedUrls.length && item?.equipment_image_url) {
      const fallbackTypeUrl =
        (typeUrls[0] ? String(typeUrls[0]) : null) ||
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

function openEquipmentColumnsModal() {
  if (!equipmentColumnsModal) return;
  equipmentColumnsModal.classList.add("show");
  try {
    equipmentColumnsSearch?.focus?.();
  } catch {
    // ignore
  }
}

function closeEquipmentColumnsModal() {
  if (!equipmentColumnsModal) return;
  equipmentColumnsModal.classList.remove("show");
  if (equipmentColumnsSearch) equipmentColumnsSearch.value = "";
  if (equipmentColumnsList) equipmentColumnsList.scrollTop = 0;
}

function renderEquipmentColumnsPicker() {
  if (!equipmentColumnsList) return;
  const cid = normalizeCompanyId();
  const available = getEquipmentTableAvailableColumns();
  const visibleKeys = cid ? getEffectiveEquipmentTableVisibleKeys(cid, available) : ensureRequiredEquipmentTableColumns([]);
  const userKeys = cid ? loadUserEquipmentTableColumns(cid) : null;
  const hasCompanyDefault = normalizeEquipmentTableColumnKeys(companyAssetsTableColumnsDefault) !== null;
  const modeLabel = userKeys !== null ? "Your columns (this browser)" : hasCompanyDefault ? "Company default" : "All columns";
  if (equipmentColumnsMeta) {
    equipmentColumnsMeta.textContent =
      cid
        ? `${modeLabel}. Tip: drag table column dividers to resize widths. Admins can set company defaults in Settings.`
        : "Select a company to customize columns.";
  }

  equipmentColumnsList.replaceChildren();

  const header = document.createElement("div");
  header.className = "hint";
  header.style.gridColumn = "1 / -1";
  header.style.fontWeight = "700";
  header.textContent = "Columns";
  equipmentColumnsList.appendChild(header);

  const byKey = new Map(available.map((col) => [col.key, col]));
  const orderedKeys = available.map((col) => col.key);

  orderedKeys.forEach((key) => {
    const col = byKey.get(key);
    if (!col) return;
    const row = document.createElement("label");
    row.className = "check-row";
    row.dataset.key = key;
    row.dataset.label = String(col.label || key).toLowerCase();

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = visibleKeys.includes(key);
    input.disabled = EQUIPMENT_TABLE_REQUIRED_COLUMN_KEYS.has(key);
    input.dataset.key = key;

    const text = document.createElement("span");
    text.textContent = col.label || key;

    row.appendChild(input);
    row.appendChild(text);
    equipmentColumnsList.appendChild(row);
  });
}

function applyEquipmentColumnsFilter(term) {
  if (!equipmentColumnsList) return;
  const needle = String(term || "").trim().toLowerCase();
  const rows = Array.from(equipmentColumnsList.querySelectorAll?.("label.check-row") || []);
  rows.forEach((row) => {
    const label = String(row.dataset.label || "");
    row.style.display = !needle || label.includes(needle) ? "" : "none";
  });
}

function readEquipmentColumnsFromPicker() {
  if (!equipmentColumnsList) return null;
  const inputs = Array.from(equipmentColumnsList.querySelectorAll?.("input[type='checkbox'][data-key]") || []);
  const selected = inputs.filter((i) => i.checked).map((i) => String(i.dataset.key || "")).filter(Boolean);
  return ensureRequiredEquipmentTableColumns(selected);
}

function applyUserEquipmentColumns(keys) {
  const cid = normalizeCompanyId();
  if (!cid) return;
  const available = getEquipmentTableAvailableColumns();
  const availableKeySet = new Set(available.map((c) => c.key));
  const filtered = ensureRequiredEquipmentTableColumns((keys || []).filter((k) => availableKeySet.has(k)));
  persistUserEquipmentTableColumns(cid, filtered);
  ensureEquipmentTableSortFieldVisible(filtered);
  renderEquipment(applyFilters());
}

openEquipmentColumnsBtn?.addEventListener("click", () => {
  renderEquipmentColumnsPicker();
  applyEquipmentColumnsFilter(equipmentColumnsSearch?.value || "");
  openEquipmentColumnsModal();
});

closeEquipmentColumnsBtn?.addEventListener("click", closeEquipmentColumnsModal);
equipmentColumnsDoneBtn?.addEventListener("click", closeEquipmentColumnsModal);

equipmentColumnsModal?.addEventListener("click", (e) => {
  if (e.target === equipmentColumnsModal) closeEquipmentColumnsModal();
});

equipmentColumnsSearch?.addEventListener("input", (e) => {
  applyEquipmentColumnsFilter(e.target.value);
});

equipmentColumnsList?.addEventListener("change", (e) => {
  const input = e.target?.closest?.("input[type='checkbox'][data-key]");
  if (!input) return;
  const next = readEquipmentColumnsFromPicker();
  if (!next) return;
  applyUserEquipmentColumns(next);
  renderEquipmentColumnsPicker();
  applyEquipmentColumnsFilter(equipmentColumnsSearch?.value || "");
});

equipmentColumnsShowAllBtn?.addEventListener("click", () => {
  const cid = normalizeCompanyId();
  if (!cid) return;
  const available = getEquipmentTableAvailableColumns().map((c) => c.key);
  applyUserEquipmentColumns(available);
  renderEquipmentColumnsPicker();
  applyEquipmentColumnsFilter(equipmentColumnsSearch?.value || "");
});

equipmentColumnsHideAllBtn?.addEventListener("click", () => {
  applyUserEquipmentColumns(["type"]);
  renderEquipmentColumnsPicker();
  applyEquipmentColumnsFilter(equipmentColumnsSearch?.value || "");
});

equipmentColumnsResetBtn?.addEventListener("click", () => {
  const cid = normalizeCompanyId();
  if (!cid) return;
  clearUserEquipmentTableColumns(cid);
  const available = getEquipmentTableAvailableColumns();
  const effective = getEffectiveEquipmentTableVisibleKeys(cid, available);
  ensureEquipmentTableSortFieldVisible(effective);
  renderEquipment(applyFilters());
  renderEquipmentColumnsPicker();
  applyEquipmentColumnsFilter(equipmentColumnsSearch?.value || "");
});

equipmentColumnsResetWidthsBtn?.addEventListener("click", () => {
  const cid = normalizeCompanyId();
  if (!cid) return;
  clearUserEquipmentTableColumnWidths(cid);
  renderEquipment(applyFilters());
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (equipmentColumnsModal?.classList.contains("show")) closeEquipmentColumnsModal();
});

if (isEquipmentFormPage) {
  renderEquipmentImages();
  clearEquipmentHeaderStatus();
  applyEquipmentDirectionsFeatureUi();
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
  const existingId = currentLocationPicker.existingLocationId;
  try {
    saveCurrentLocationPickerBtn.disabled = true;

    if (existingId && currentLocationIdInput) {
      const detail = getLocationDetailById(existingId);
      const label =
        currentLocationPicker.existingLocationName ||
        formatLocationDetailAddress(detail) ||
        "selected location";
      const lat = toFiniteCoordinate(detail?.latitude);
      const lng = toFiniteCoordinate(detail?.longitude);
      if (editingEquipmentId) {
        await persistCurrentLocationForEditingEquipment({ locationId: existingId, label, lat, lng });
      }
      setCurrentLocationValue(existingId, label);
      closeCurrentLocationPickerModal();
      companyMeta.textContent = `Current location set to "${label}".`;
      return;
    }

    const sel = currentLocationPicker.selected;
    if (!sel || !Number.isFinite(sel.lat) || !Number.isFinite(sel.lng)) {
      if (currentLocationPickerMeta) currentLocationPickerMeta.textContent = "Pick a point on the map first.";
      return;
    }

    const baseName = sel.query ? String(sel.query) : "Pinned location";
    const name = ensureUniqueLocationName(baseName);
    const saved = await createLocationFromPicker({
      name,
      latitude: sel.lat,
      longitude: sel.lng,
      provider: sel.provider,
      query: sel.query,
    });
    await loadLocations();
    if (saved?.id && editingEquipmentId) {
      await persistCurrentLocationForEditingEquipment({
        locationId: saved.id,
        label: saved.name || name,
        lat: sel.lat,
        lng: sel.lng,
      });
    }
    if (currentLocationIdInput && saved?.id) setCurrentLocationValue(saved.id, saved.name || name);
    closeCurrentLocationPickerModal();
    companyMeta.textContent = `Current location set to "${saved.name || name}".`;
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
