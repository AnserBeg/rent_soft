const form = document.getElementById("customer-link-form");
const linkBanner = document.getElementById("link-banner");
const linkHint = document.getElementById("link-hint");
const pageTitle = document.getElementById("page-title");
const pageSubtitle = document.getElementById("page-subtitle");
const customerSection = document.getElementById("customer-section");
const customerPoField = document.getElementById("customer-po-field");
const orderSection = document.getElementById("order-section");
const lineItemsSection = document.getElementById("line-items-section");
const rentalInfoSection = document.getElementById("rental-info-section");
const lineItemsEl = document.getElementById("line-items");
const addLineItemBtn = document.getElementById("add-line-item");
const documentsSection = document.getElementById("documents-section");
const documentUploads = document.getElementById("document-uploads");
const termsSection = document.getElementById("terms-section");
const termsText = document.getElementById("terms-text");
const serviceAgreementSection = document.getElementById("service-agreement-section");
const serviceAgreementStatus = document.getElementById("service-agreement-status");
const serviceAgreementName = document.getElementById("service-agreement-name");
const serviceAgreementDownload = document.getElementById("service-agreement-download");
const serviceAgreementSignedDownload = document.getElementById("service-agreement-signed-download");
const serviceAgreementSignedCheck = document.getElementById("service-agreement-signed-check");
const serviceAgreementTopCheck = document.getElementById("service-agreement-top-check");
const serviceAgreementAck = document.getElementById("service-agreement-ack");
const serviceAgreementAckRow = document.getElementById("service-agreement-ack-row");
const signatureSection = document.getElementById("signature-section");
const signatureTitle = document.getElementById("signature-title");
const signatureName = document.getElementById("signature-name");
const signatureCanvas = document.getElementById("signature-canvas");
const clearSignatureBtn = document.getElementById("clear-signature");
const proofActions = document.getElementById("proof-actions");
const downloadProof = document.getElementById("download-proof");
const submitBtn = document.getElementById("submit-link");
const linkUsedCard = document.getElementById("link-used-card");
const linkExpiredCard = document.getElementById("link-expired-card");
const linkUsedProofActions = document.getElementById("link-used-proof-actions");
const linkUsedProof = document.getElementById("link-used-proof");

const companyNameInput = document.getElementById("company-name");
const contactCategoriesContainer = document.getElementById("customer-contact-categories");
const streetInput = document.getElementById("street-address");
const cityInput = document.getElementById("city");
const regionInput = document.getElementById("region");
const postalInput = document.getElementById("postal-code");
const countryInput = document.getElementById("country");

const customerPoInput = document.getElementById("customer-po");
const fulfillmentSelect = document.getElementById("fulfillment-method");
const dropoffInput = document.getElementById("dropoff-address");
const logisticsInstructionsInput = document.getElementById("logistics-instructions");
const siteNameInput = document.getElementById("site-name");
const siteAddressInput = document.getElementById("site-address");
const siteAccessInfoInput = document.getElementById("site-access-info");
const criticalAreasInput = document.getElementById("critical-areas");
const monitoringPersonnelInput = document.getElementById("monitoring-personnel");
const generalNotesInput = document.getElementById("general-notes");
const generalNotesEditor = document.getElementById("general-notes-editor");
const generalNotesToolbar = document.getElementById("general-notes-toolbar");
const generalNotesImagesInput = document.getElementById("general-notes-images");
const generalNotesImagesStatus = document.getElementById("general-notes-images-status");
const generalNotesPreviews = document.getElementById("general-notes-previews");
const emergencyContactsList = document.getElementById("emergency-contacts-list");
const emergencyContactInstructionsInput = document.getElementById("emergency-contact-instructions");
const addEmergencyContactRowBtn = document.getElementById("add-emergency-contact-row");
const siteContactsList = document.getElementById("site-contacts-list");
const addSiteContactRowBtn = document.getElementById("add-site-contact-row");
const notificationCircumstancesContainer = document.getElementById("notification-circumstances-container");
const notificationOtherCheckbox = document.getElementById("notification-circumstance-other-cb");
const notificationOtherInput = document.getElementById("notification-circumstance-other-input");
const coverageDayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const coverageDayLabels = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];
const coverageTimeZoneLabelCache = new Map();

function normalizeCoverageTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "";
  }
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function supportedTimeZones() {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      const zones = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length) return zones;
    } catch {
      // fall through
    }
  }
  return FALLBACK_TIME_ZONES;
}

function timeZoneLabel(zone) {
  if (coverageTimeZoneLabelCache.has(zone)) return coverageTimeZoneLabelCache.get(zone);
  let label = zone;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" });
    const parts = fmt.formatToParts(new Date());
    const tzName = parts.find((part) => part.type === "timeZoneName")?.value;
    if (tzName) label = `${zone} (${tzName})`;
  } catch {
    // ignore
  }
  coverageTimeZoneLabelCache.set(zone, label);
  return label;
}

function ensureCoverageTimeZoneOptions() {
  if (!coverageTimeZoneSelect) return;
  if (coverageTimeZoneSelect.dataset.ready === "true") return;
  const zones = Array.from(new Set(supportedTimeZones().map((z) => String(z).trim()).filter(Boolean)));
  if (!zones.includes("UTC")) zones.unshift("UTC");
  coverageTimeZoneSelect.innerHTML = "";
  zones.forEach((zone) => {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = timeZoneLabel(zone);
    coverageTimeZoneSelect.appendChild(option);
  });
  coverageTimeZoneSelect.dataset.ready = "true";
}

function resolveDefaultCoverageTimeZone() {
  const local = normalizeCoverageTimeZone(browserTimeZone());
  return local || "UTC";
}

function setCoverageTimeZoneInput(value) {
  if (!coverageTimeZoneSelect) return;
  ensureCoverageTimeZoneOptions();
  const normalized = normalizeCoverageTimeZone(value) || resolveDefaultCoverageTimeZone();
  if (
    normalized &&
    !Array.from(coverageTimeZoneSelect.options).some((opt) => String(opt.value) === normalized)
  ) {
    const option = document.createElement("option");
    option.value = normalized;
    option.textContent = timeZoneLabel(normalized);
    coverageTimeZoneSelect.appendChild(option);
  }
  coverageTimeZoneSelect.value = normalized;
}

function getCoverageTimeZoneInputValue() {
  if (!coverageTimeZoneSelect) return resolveDefaultCoverageTimeZone();
  const raw = String(coverageTimeZoneSelect.value || "").trim();
  return normalizeCoverageTimeZone(raw) || resolveDefaultCoverageTimeZone();
}
const coverageSlotsContainer = document.getElementById("coverage-slots");
const addCoverageSlotBtn = document.getElementById("add-coverage-slot");
const coverageTimeZoneSelect = document.getElementById("coverage-timezone");
const coverageStatHolidaysCheckbox = document.getElementById("coverage-stat-holidays");
const rentalInfoFieldContainers = {
  siteName: document.querySelector('[data-rental-info-field="siteName"]'),
  siteAddress: document.querySelector('[data-rental-info-field="siteAddress"]'),
  siteAccessInfo: document.querySelector('[data-rental-info-field="siteAccessInfo"]'),
  criticalAreas: document.querySelector('[data-rental-info-field="criticalAreas"]'),
  monitoringPersonnel: document.querySelector('[data-rental-info-field="monitoringPersonnel"]'),
  generalNotes: document.querySelector('[data-rental-info-field="generalNotes"]'),
  emergencyContacts: document.querySelector('[data-rental-info-field="emergencyContacts"]'),
  emergencyContactInstructions: document.querySelector('[data-rental-info-field="emergencyContactInstructions"]'),
  siteContacts: document.querySelector('[data-rental-info-field="siteContacts"]'),
  notificationCircumstances: document.querySelector('[data-rental-info-field="notificationCircumstances"]'),
  coverageHours: document.querySelector('[data-rental-info-field="coverageHours"]'),
};
const openSideAddressPickerBtn = document.getElementById("open-side-address-picker");
const sideAddressPickerModal = document.getElementById("side-address-picker-modal");
const closeSideAddressPickerBtn = document.getElementById("close-side-address-picker");
const saveSideAddressPickerBtn = document.getElementById("save-side-address-picker");
const sideAddressPickerSearch = document.getElementById("side-address-picker-search");
const sideAddressPickerInput = document.getElementById("side-address-picker-input");
const sideAddressPickerMapEl = document.getElementById("side-address-picker-map");
const sideAddressPickerMeta = document.getElementById("side-address-picker-meta");
const sideAddressPickerSuggestions = document.getElementById("side-address-picker-suggestions");
const sideAddressPickerMapStyle = document.getElementById("side-address-picker-map-style");
const sideAddressUnitSelect = document.getElementById("side-address-unit-select");
const saveSideAddressUnitPinBtn = document.getElementById("save-side-address-unit-pin");
const clearSideAddressUnitBtn = document.getElementById("clear-side-address-unit");
const sideAddressUnitMeta = document.getElementById("side-address-unit-meta");

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

let linkData = null;
let types = [];
let lineItems = [];
let docCategoryMap = {};
let signatureActive = false;
let serviceAgreementRequired = false;
let signatureRequired = false;
let rentalInfoFields = null;
let generalNotesImages = [];
let generalNotesUploadsInFlight = 0;
let generalNotesLastRange = null;
let generalNotesInsertMode = null;
let pickupAddress = "";
let lastDropoffAddress = "";
let originalDropoffAddress = "";
let submissionComplete = false;
let orderUnits = [];
let siteAddressLat = null;
let siteAddressLng = null;
let siteAddressQuery = "";
let siteAddressInputLock = false;

const DEFAULT_CONTACT_CATEGORIES = [
  { key: "contacts", label: "Contacts" },
  { key: "accountingContacts", label: "Accounting contacts" },
];
let contactCategoryConfig = DEFAULT_CONTACT_CATEGORIES;
const contactCategoryLists = new Map();

let sideAddressPicker = {
  selected: null,
  mapStyle: "street",
  mode: "google",
  geocodeSeq: 0,
  google: {
    map: null,
    marker: null,
    autocompleteService: null,
    placesService: null,
    debounceTimer: null,
    searchSeq: 0,
    pickSeq: 0,
  },
  leaflet: {
    map: null,
    marker: null,
    layers: null,
    debounceTimer: null,
    searchAbort: null,
    searchSeq: 0,
    searchBound: false,
  },
  unitSelected: null,
  unitMarkerData: new Map(),
  unitMarkers: new Map(),
  unitLabels: new Map(),
};

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  siteName: { enabled: true, required: false },
  siteAccessInfo: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  monitoringPersonnel: { enabled: true, required: false },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  emergencyContactInstructions: { enabled: true, required: false },
  siteContacts: { enabled: true, required: true },
  coverageHours: { enabled: true, required: true },
};
const TIME_STEP_MINUTES = 15;

function toLocalInputValue(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function fromLocalInputValue(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `$${num.toFixed(2)}`;
}

function formatRateBasis(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "Rate";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function formatPickupAddress(order) {
  if (!order) return "";
  const parts = [
    order.pickupLocationName,
    order.pickupStreetAddress,
    order.pickupCity,
    order.pickupRegion,
    order.pickupCountry,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toFiniteCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeMapStyle(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "satellite" ? "satellite" : "street";
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

function renderContactCategories(categories) {
  if (!contactCategoriesContainer) return;
  contactCategoriesContainer.innerHTML = "";
  contactCategoryLists.clear();
  contactCategoryConfig = normalizeContactCategories(categories);

  contactCategoryConfig.forEach((category) => {
    const block = document.createElement("div");
    block.className = "contact-block";
    block.dataset.contactCategoryKey = category.key;

    const header = document.createElement("div");
    header.className = "contact-header";

    const title = document.createElement("strong");
    title.textContent = category.label;

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "ghost small";
    addBtn.textContent = "+ Add contact";
    addBtn.dataset.addContactCategory = category.key;

    header.appendChild(title);
    header.appendChild(addBtn);

    const list = document.createElement("div");
    list.className = "contacts-list stack";
    list.dataset.contactListKey = category.key;

    block.appendChild(header);
    block.appendChild(list);
    contactCategoriesContainer.appendChild(block);
    contactCategoryLists.set(category.key, list);
  });
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
    groups[key] = Array.isArray(list) ? list : [];
  });
  return groups;
}

function buildCustomerContactGroups(customer) {
  const groups = normalizeContactGroups(customer?.contactGroups || customer?.contact_groups);
  const contactRows = Array.isArray(customer?.contacts) ? customer.contacts : [];
  if (!contactRows.length && (customer?.contactName || customer?.email || customer?.phone)) {
    contactRows.push({
      name: customer?.contactName || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
    });
  }
  groups.contacts = contactRows;
  groups.accountingContacts = Array.isArray(customer?.accountingContacts)
    ? customer.accountingContacts
    : Array.isArray(customer?.accounting_contacts)
      ? customer.accounting_contacts
      : [];
  return groups;
}

function setContactCategoryRows(groups) {
  contactCategoryConfig.forEach((category) => {
    const list = contactCategoryLists.get(category.key);
    const rows = Array.isArray(groups?.[category.key]) ? groups[category.key] : [];
    setContactRows(list, rows);
  });
}

function collectContactCategoryPayload() {
  let contacts = [];
  let accountingContacts = [];
  const contactGroups = {};
  contactCategoryConfig.forEach((category) => {
    const list = contactCategoryLists.get(category.key);
    const rows = collectContacts(list);
    if (category.key === "contacts") contacts = rows;
    else if (category.key === "accountingContacts") accountingContacts = rows;
    else contactGroups[category.key] = rows;
  });
  return { contacts, accountingContacts, contactGroups };
}

function parsePredictionText(prediction) {
  const main = prediction?.structured_formatting?.main_text || prediction?.description || "";
  const secondary = prediction?.structured_formatting?.secondary_text || "";
  return { main: String(main || ""), secondary: String(secondary || "") };
}

function renderSideAddressSuggestions(predictions, onPick) {
  if (!sideAddressPickerSuggestions) return;
  sideAddressPickerSuggestions.replaceChildren();
  if (!Array.isArray(predictions) || !predictions.length) {
    sideAddressPickerSuggestions.hidden = true;
    return;
  }
  predictions.forEach((prediction) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rs-autocomplete-item";
    const text = parsePredictionText(prediction);
    btn.innerHTML = `
      <span>${escapeHtml(text.main)}</span>
      ${text.secondary ? `<span class="hint">${escapeHtml(text.secondary)}</span>` : ""}
    `;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onPick?.(prediction);
    });
    sideAddressPickerSuggestions.appendChild(btn);
  });
  sideAddressPickerSuggestions.hidden = false;
}

function hideSideAddressSuggestions() {
  if (!sideAddressPickerSuggestions) return;
  sideAddressPickerSuggestions.hidden = true;
  sideAddressPickerSuggestions.replaceChildren();
}

function applyGoogleSideAddressStyle(style) {
  const map = sideAddressPicker.google.map;
  if (!map) return;
  const normalized = normalizeMapStyle(style ?? sideAddressPicker.mapStyle);
  sideAddressPicker.mapStyle = normalized;
  map.setMapTypeId(normalized === "satellite" ? "satellite" : "roadmap");
}

function setSideAddressPickerMapStyle(style) {
  const normalized = normalizeMapStyle(style ?? sideAddressPicker.mapStyle);
  sideAddressPicker.mapStyle = normalized;
  if (sideAddressPickerMapStyle && sideAddressPickerMapStyle.value !== normalized) {
    sideAddressPickerMapStyle.value = normalized;
  }
  applyGoogleSideAddressStyle(normalized);
}

async function getPublicConfig() {
  const res = await fetch("/api/public-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load config");
  return data || {};
}

function openSideAddressPickerModal() {
  sideAddressPickerModal?.classList.add("show");
}

function clearSideAddressUnitSelection() {
  sideAddressPicker.unitSelected = null;
  if (sideAddressUnitSelect) sideAddressUnitSelect.value = "";
  updateSideAddressUnitMeta();
  updateSideAddressUnitPinActions();
}

function closeSideAddressPickerModal() {
  sideAddressPickerModal?.classList.remove("show");
  if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "";
  if (sideAddressPickerSearch) sideAddressPickerSearch.value = "";
  if (sideAddressPickerInput) sideAddressPickerInput.value = "";
  hideSideAddressSuggestions();
  if (sideAddressPicker.google.debounceTimer) {
    clearTimeout(sideAddressPicker.google.debounceTimer);
    sideAddressPicker.google.debounceTimer = null;
  }
  sideAddressPicker.google.searchSeq = (sideAddressPicker.google.searchSeq || 0) + 1;
  sideAddressPicker.google.pickSeq = (sideAddressPicker.google.pickSeq || 0) + 1;
  sideAddressPicker.geocodeSeq = (sideAddressPicker.geocodeSeq || 0) + 1;
  sideAddressPicker.selected = null;
  clearSideAddressUnitSelection();
}

function setSiteAddressInputValue(value) {
  if (!siteAddressInput) return;
  siteAddressInputLock = true;
  siteAddressInput.value = value;
  siteAddressInputLock = false;
}

function setSideAddressSelected(lat, lng, { provider, query } = {}) {
  sideAddressPicker.selected = {
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  if (sideAddressPickerMeta) {
    sideAddressPickerMeta.textContent = `Selected: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  if (sideAddressPickerInput && query) {
    sideAddressPickerInput.value = String(query);
  }
}

function getSelectedSideAddressUnitId() {
  if (!sideAddressUnitSelect) return null;
  const raw = String(sideAddressUnitSelect.value || "").trim();
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function unitOptionLabel(unit) {
  if (!unit) return "";
  const model = String(unit.modelName || unit.model_name || "").trim();
  const serial = String(unit.serialNumber || unit.serial_number || "").trim();
  if (model && serial) return `${model} (${serial})`;
  return model || serial || `Unit #${unit.id}`;
}

function buildSideAddressUnitOptions() {
  const options = [];
  (orderUnits || []).forEach((unit) => {
    const id = Number(unit?.id);
    if (!Number.isFinite(id)) return;
    const label = unit.label || unitOptionLabel(unit) || `Unit #${id}`;
    options.push({ id, label, unit });
  });
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

function updateSideAddressUnitPinActions() {
  if (!saveSideAddressUnitPinBtn) return;
  const unitId = getSelectedSideAddressUnitId();
  const hasSelection =
    unitId &&
    sideAddressPicker.unitSelected &&
    String(sideAddressPicker.unitSelected.unitId) === String(unitId) &&
    Number.isFinite(sideAddressPicker.unitSelected.lat) &&
    Number.isFinite(sideAddressPicker.unitSelected.lng);
  saveSideAddressUnitPinBtn.disabled = !hasSelection;
}

function updateSideAddressUnitMeta(message = "") {
  if (!sideAddressUnitMeta) return;
  if (message) {
    sideAddressUnitMeta.textContent = message;
    return;
  }
  const unitId = getSelectedSideAddressUnitId();
  if (!unitId) {
    sideAddressUnitMeta.textContent = "Select a unit, then click the map to drop a pin for its current location.";
    return;
  }
  const label = sideAddressPicker.unitLabels?.get?.(String(unitId)) || `Unit #${unitId}`;
  sideAddressUnitMeta.textContent = `Selected: ${label}. Click the map to drop a pin.`;
}

function syncSideAddressUnitSelect({ preserveSelection = true } = {}) {
  if (!sideAddressUnitSelect) return;
  const prev = preserveSelection ? sideAddressUnitSelect.value : "";
  sideAddressUnitSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select unit...";
  sideAddressUnitSelect.appendChild(placeholder);

  const options = buildSideAddressUnitOptions();
  const allowedIds = new Set(options.map((opt) => String(opt.id)));
  const nextMarkerData = new Map();
  sideAddressPicker.unitMarkerData.forEach((value, key) => {
    if (allowedIds.has(String(key))) nextMarkerData.set(String(key), value);
  });
  sideAddressPicker.unitMarkerData = nextMarkerData;
  sideAddressPicker.unitLabels = new Map();
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = String(opt.id);
    option.textContent = opt.label;
    sideAddressUnitSelect.appendChild(option);
    sideAddressPicker.unitLabels.set(String(opt.id), opt.label);
  });

  sideAddressUnitSelect.disabled = options.length === 0;
  if (options.length === 0) {
    if (sideAddressUnitMeta) sideAddressUnitMeta.textContent = "No units assigned yet.";
    updateSideAddressUnitPinActions();
    return;
  }
  sideAddressUnitSelect.value = options.some((opt) => String(opt.id) === String(prev)) ? prev : "";
  updateSideAddressUnitMeta();
  updateSideAddressUnitPinActions();
}

function ensureSideAddressUnitMarkerMap() {
  if (!sideAddressPicker.unitMarkers) sideAddressPicker.unitMarkers = new Map();
  return sideAddressPicker.unitMarkers;
}

function setSideAddressUnitMarkerGoogle(unitId, lat, lng, label) {
  const map = sideAddressPicker.google.map;
  if (!map || !window.google?.maps) return;
  const markers = ensureSideAddressUnitMarkerMap();
  let marker = markers.get(String(unitId));
  if (!marker) {
    marker = new window.google.maps.Marker({
      position: { lat, lng },
      map,
      title: label || "",
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#0ea5e9",
        fillOpacity: 1,
        strokeColor: "#0f172a",
        strokeWeight: 1,
      },
    });
    markers.set(String(unitId), marker);
  } else {
    marker.setPosition({ lat, lng });
    if (label) marker.setTitle(label);
  }
}

function setSideAddressUnitMarker(unitId, lat, lng, label) {
  setSideAddressUnitMarkerGoogle(unitId, lat, lng, label);
}

function hydrateSideAddressUnitMarkerData() {
  const options = buildSideAddressUnitOptions();
  if (!options.length) return;
  options.forEach((opt) => {
    if (sideAddressPicker.unitMarkerData.has(String(opt.id))) return;
    const lat = toFiniteCoordinate(opt.unit?.currentLocationLat ?? opt.unit?.current_location_latitude);
    const lng = toFiniteCoordinate(opt.unit?.currentLocationLng ?? opt.unit?.current_location_longitude);
    if (lat === null || lng === null) return;
    sideAddressPicker.unitMarkerData.set(String(opt.id), { lat, lng, label: opt.label });
  });
}

function renderSideAddressUnitMarkersFromData() {
  const data = sideAddressPicker.unitMarkerData;
  if (!data || !data.size) return;
  data.forEach((entry, unitId) => {
    if (!Number.isFinite(entry?.lat) || !Number.isFinite(entry?.lng)) return;
    setSideAddressUnitMarker(unitId, entry.lat, entry.lng, entry.label || "");
  });
}

function setSideAddressUnitPinSelected(unitId, lat, lng, { provider, query } = {}) {
  sideAddressPicker.unitSelected = {
    unitId: Number(unitId),
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  const label = sideAddressPicker.unitLabels?.get?.(String(unitId)) || `Unit #${unitId}`;
  setSideAddressUnitMarker(unitId, Number(lat), Number(lng), label);
  updateSideAddressUnitMeta(`Pending pin for ${label}: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}.`);
  updateSideAddressUnitPinActions();
}

function handleSideAddressMapClick(lat, lng, { provider } = {}) {
  const unitId = getSelectedSideAddressUnitId();
  if (unitId) {
    setSideAddressUnitPinSelected(unitId, lat, lng, { provider: provider || "manual_pin" });
    return true;
  }
  setSideAddressSelected(lat, lng, { provider: provider || "manual_pin" });
  return false;
}

async function saveCustomerLinkUnitPin({ unitId, latitude, longitude, provider, query, label }) {
  if (!token) throw new Error("Missing link token.");
  const res = await fetch(`/api/public/customer-links/${encodeURIComponent(token)}/unit-pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      equipmentId: Number(unitId),
      latitude,
      longitude,
      provider: provider || "manual",
      query: query || null,
      label: label || null,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save unit pin.");
  return data;
}

async function saveSideAddressUnitPinForSelectedUnit() {
  const unitId = getSelectedSideAddressUnitId();
  if (!unitId) {
    updateSideAddressUnitMeta("Select a unit before saving a pin.");
    return;
  }
  const sel = sideAddressPicker.unitSelected;
  if (!sel || String(sel.unitId) !== String(unitId)) {
    updateSideAddressUnitMeta("Click the map to drop a pin for the selected unit.");
    return;
  }
  if (!Number.isFinite(sel.lat) || !Number.isFinite(sel.lng)) {
    updateSideAddressUnitMeta("Pick a point on the map first.");
    return;
  }
  if (saveSideAddressUnitPinBtn) saveSideAddressUnitPinBtn.disabled = true;
  try {
    const label = sideAddressPicker.unitLabels?.get?.(String(unitId)) || `Unit #${unitId}`;
    await saveCustomerLinkUnitPin({
      unitId,
      latitude: sel.lat,
      longitude: sel.lng,
      provider: sel.provider,
      query: sel.query,
      label,
    });
    sideAddressPicker.unitMarkerData.set(String(unitId), {
      lat: sel.lat,
      lng: sel.lng,
      label,
    });
    sideAddressPicker.unitSelected = null;
    updateSideAddressUnitMeta(`Saved pin for ${label}.`);
  } catch (err) {
    updateSideAddressUnitMeta(err?.message || String(err));
  } finally {
    updateSideAddressUnitPinActions();
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

function resetSideAddressPickerMapContainer() {
  if (!sideAddressPickerMapEl) return;
  sideAddressPicker.google.map = null;
  sideAddressPicker.google.marker = null;
  sideAddressPicker.google.autocompleteService = null;
  sideAddressPicker.google.placesService = null;
  sideAddressPicker.unitMarkers = new Map();
  sideAddressPickerMapEl.replaceChildren();
}

function applySideAddressPickerExistingSelection() {
  const lat = toFiniteCoordinate(siteAddressLat);
  const lng = toFiniteCoordinate(siteAddressLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!sideAddressPicker.google.map || !window.google?.maps) return false;
  if (!sideAddressPicker.google.marker) {
    sideAddressPicker.google.marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: sideAddressPicker.google.map,
      draggable: true,
    });
    sideAddressPicker.google.marker.addListener("dragend", (evt) => {
      const dLat = evt?.latLng?.lat?.();
      const dLng = evt?.latLng?.lng?.();
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
      setSideAddressSelected(dLat, dLng, { provider: "manual_pin" });
    });
  } else {
    sideAddressPicker.google.marker.setPosition({ lat, lng });
  }
  sideAddressPicker.google.map.setCenter({ lat, lng });
  sideAddressPicker.google.map.setZoom(17);
  setSideAddressSelected(lat, lng, { provider: "draft", query: siteAddressQuery || null });
  return true;
}

function initGoogleSideAddressPicker(center) {
  if (!sideAddressPickerMapEl || !window.google?.maps) throw new Error("Google Maps not available.");
  if (!sideAddressPicker.google.map) {
    const mapStyle = normalizeMapStyle(sideAddressPicker.mapStyle);
    const map = new window.google.maps.Map(sideAddressPickerMapEl, {
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
      const usedForUnit = handleSideAddressMapClick(lat, lng, { provider: "manual_pin" });
      if (usedForUnit) return;
      if (!sideAddressPicker.google.marker) {
        sideAddressPicker.google.marker = new window.google.maps.Marker({ position: { lat, lng }, map, draggable: true });
        sideAddressPicker.google.marker.addListener("dragend", (evt) => {
          const dLat = evt?.latLng?.lat?.();
          const dLng = evt?.latLng?.lng?.();
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
          setSideAddressSelected(dLat, dLng, { provider: "manual_pin" });
        });
      } else {
        sideAddressPicker.google.marker.setPosition({ lat, lng });
      }
      setSideAddressSelected(lat, lng, { provider: "manual_pin" });
    });

    if (!window.google.maps.places?.AutocompleteService || !window.google.maps.places?.PlacesService) {
      if (sideAddressPickerMeta) {
        sideAddressPickerMeta.textContent = "Click the map to drop a pin (Places library missing).";
      }
    } else {
      sideAddressPicker.google.autocompleteService = new window.google.maps.places.AutocompleteService();
      sideAddressPicker.google.placesService = new window.google.maps.places.PlacesService(map);
      const requestPredictions = (input) =>
        new Promise((resolve, reject) => {
          sideAddressPicker.google.autocompleteService.getPlacePredictions(
            { input: String(input || ""), locationBias: map.getBounds?.() || undefined },
            (preds, status) => {
              if (status === window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return resolve([]);
              if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
                return reject(new Error(`Places error: ${status}`));
              }
              resolve(preds || []);
            }
          );
        });
      const fetchPlaceDetails = (placeId, label) =>
        new Promise((resolve, reject) => {
          sideAddressPicker.google.placesService.getDetails(
            { placeId, fields: ["geometry", "formatted_address", "name"] },
            (place, status) => {
              if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) {
                return reject(new Error(`Places error: ${status}`));
              }
              const details = {
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                label: place.formatted_address || label || place.name || "Pinned location",
              };
              resolve(details);
            }
          );
        });

      sideAddressPickerSearch?.addEventListener("input", () => {
        const q = String(sideAddressPickerSearch.value || "").trim();
        if (!q) {
          hideSideAddressSuggestions();
          return;
        }
        if (sideAddressPicker.google.debounceTimer) clearTimeout(sideAddressPicker.google.debounceTimer);
        const seq = (sideAddressPicker.google.searchSeq || 0) + 1;
        sideAddressPicker.google.searchSeq = seq;
        sideAddressPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            if (seq !== sideAddressPicker.google.searchSeq) return;
            if (String(sideAddressPickerSearch.value || "").trim() !== q) return;
            renderSideAddressSuggestions(preds, async (p) => {
              hideSideAddressSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const pickSeq = (sideAddressPicker.google.pickSeq || 0) + 1;
                sideAddressPicker.google.pickSeq = pickSeq;
                const details = await fetchPlaceDetails(placeId, label);
                if (pickSeq !== sideAddressPicker.google.pickSeq) return;
                if (sideAddressPickerInput) sideAddressPickerInput.value = details.label;
                if (sideAddressPickerSearch) sideAddressPickerSearch.value = details.label;
                if (!sideAddressPicker.google.marker) {
                  sideAddressPicker.google.marker = new window.google.maps.Marker({
                    position: { lat: details.lat, lng: details.lng },
                    map,
                    draggable: true,
                  });
                  sideAddressPicker.google.marker.addListener("dragend", (evt) => {
                    const dLat = evt?.latLng?.lat?.();
                    const dLng = evt?.latLng?.lng?.();
                    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
                    setSideAddressSelected(dLat, dLng, { provider: "manual_pin" });
                  });
                } else {
                  sideAddressPicker.google.marker.setPosition({ lat: details.lat, lng: details.lng });
                }
                map.setCenter({ lat: details.lat, lng: details.lng });
                map.setZoom(17);
                setSideAddressSelected(details.lat, details.lng, { provider: "google_places", query: details.label });
              } catch (err) {
                if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = err?.message || String(err);
              }
            });
          } catch (err) {
            hideSideAddressSuggestions();
            if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = err?.message || String(err);
          }
        }, 250);
      });

      sideAddressPickerSearch?.addEventListener("blur", () => {
        setTimeout(() => hideSideAddressSuggestions(), 150);
      });
    }

    sideAddressPicker.google.map = map;
  }

  applyGoogleSideAddressStyle(sideAddressPicker.mapStyle);
  sideAddressPicker.google.map.setCenter(center);
  sideAddressPicker.google.map.setZoom(16);
}

async function openSideAddressPicker() {
  if (!sideAddressPickerModal) return;
  openSideAddressPickerModal();
  if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "Loading map...";
  hideSideAddressSuggestions();
  syncSideAddressUnitSelect();
  if (sideAddressPickerInput && !String(sideAddressPickerInput.value || "").trim()) {
    const existing = String(siteAddressInput?.value || "").trim();
    if (existing) sideAddressPickerInput.value = existing;
  }

  let center = { lat: 20, lng: 0 };
  try {
    center = await getUserGeolocation();
  } catch {
    // ignore
  }

  const config = await getPublicConfig().catch(() => ({}));
  const key = config?.googleMapsApiKey ? String(config.googleMapsApiKey) : "";
  const hasGoogle = isGoogleMapsReady();
  if (!key && !hasGoogle) {
    resetSideAddressPickerMapContainer();
    if (sideAddressPickerMeta) {
      sideAddressPickerMeta.textContent =
        "Google Maps API key is required. Set GOOGLE_MAPS_API_KEY and reload to use the map picker.";
    }
    return;
  }

  try {
    if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "Loading Google Maps...";
    if (!hasGoogle) await loadGoogleMaps(key);
    resetSideAddressPickerMapContainer();
    sideAddressPicker.mode = "google";
    initGoogleSideAddressPicker(center);
    if (sideAddressPickerMeta) {
      const places = window.google?.maps?.places;
      const hasSvc = !!places?.AutocompleteService;
      const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
      sideAddressPickerMeta.textContent = msg;
    }
    hydrateSideAddressUnitMarkerData();
    renderSideAddressUnitMarkersFromData();
    updateSideAddressUnitPinActions();
    applySideAddressPickerExistingSelection();
  } catch (err) {
    resetSideAddressPickerMapContainer();
    if (sideAddressPickerMeta) {
      sideAddressPickerMeta.textContent =
        `Google Maps failed to load: ${err?.message || String(err)}. ` +
        "Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
    }
  }
}

function saveSideAddressFromPicker() {
  const manual = String(sideAddressPickerInput?.value || "").trim();
  const fallbackQuery = sideAddressPicker.selected?.query ? String(sideAddressPicker.selected.query) : "";
  const fallbackCoords = sideAddressPicker.selected
    ? `${Number(sideAddressPicker.selected.lat).toFixed(6)}, ${Number(sideAddressPicker.selected.lng).toFixed(6)}`
    : "";
  const nextValue = manual || fallbackQuery || fallbackCoords;
  if (!nextValue) {
    if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "Enter a site address or pick a point on the map.";
    return;
  }
  if (sideAddressPicker.selected) {
    const lat = Number(sideAddressPicker.selected.lat);
    const lng = Number(sideAddressPicker.selected.lng);
    siteAddressLat = Number.isFinite(lat) ? lat : null;
    siteAddressLng = Number.isFinite(lng) ? lng : null;
    siteAddressQuery = sideAddressPicker.selected.query ? String(sideAddressPicker.selected.query) : nextValue;
  } else {
    siteAddressLat = null;
    siteAddressLng = null;
    siteAddressQuery = "";
  }
  setSiteAddressInputValue(nextValue);
  closeSideAddressPickerModal();
}

function resolveMinuteStep(input, stepMinutes = null) {
  if (Number.isFinite(stepMinutes)) return stepMinutes;
  const rawStep = Number(input?.getAttribute?.("step") || input?.step);
  if (Number.isFinite(rawStep) && rawStep > 0) return rawStep / 60;
  const dataStep = Number(input?.dataset?.minuteStep);
  if (Number.isFinite(dataStep) && dataStep > 0) return dataStep;
  return TIME_STEP_MINUTES;
}

function buildMinuteOptions(stepMinutes) {
  const step = Math.max(1, Math.round(stepMinutes));
  const options = [];
  for (let m = 0; m < 60; m += step) {
    options.push(m);
  }
  if (!options.includes(0)) options.unshift(0);
  return options;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function snapTimeValueWithDayDelta(value, stepMinutes = TIME_STEP_MINUTES) {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const stepSeconds = Math.max(1, Math.round(stepMinutes * 60));
  const roundedSeconds = Math.round(totalSeconds / stepSeconds) * stepSeconds;
  const daySeconds = 24 * 3600;
  const dayDelta = Math.floor(roundedSeconds / daySeconds);
  const normalizedSeconds = ((roundedSeconds % daySeconds) + daySeconds) % daySeconds;
  const snappedHours = Math.floor(normalizedSeconds / 3600);
  const snappedMinutes = Math.floor((normalizedSeconds % 3600) / 60);
  return { value: `${pad2(snappedHours)}:${pad2(snappedMinutes)}`, dayDelta };
}

function snapTimeValue(value, stepMinutes = TIME_STEP_MINUTES) {
  const snapped = snapTimeValueWithDayDelta(value, stepMinutes);
  return snapped ? snapped.value : value;
}

function snapDatetimeLocalValue(value, stepMinutes = TIME_STEP_MINUTES) {
  if (!value) return value;
  const parts = String(value).split("T");
  if (parts.length !== 2) return value;
  const [datePart, timePart] = parts;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!dateMatch) return value;
  const snappedTime = snapTimeValueWithDayDelta(timePart, stepMinutes);
  if (!snappedTime) return value;
  let nextDate = datePart;
  if (snappedTime.dayDelta) {
    const baseDate = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]));
    if (!Number.isNaN(baseDate.getTime())) {
      baseDate.setDate(baseDate.getDate() + snappedTime.dayDelta);
      nextDate = `${baseDate.getFullYear()}-${pad2(baseDate.getMonth() + 1)}-${pad2(baseDate.getDate())}`;
    }
  }
  return `${nextDate}T${snappedTime.value}`;
}

function snapInputToMinuteStep(input, stepMinutes = null) {
  if (!input || !input.value) return;
  const rawType = (input.getAttribute?.("type") || input.type || "").toLowerCase();
  const step = resolveMinuteStep(input, stepMinutes);
  let nextValue = input.value;
  if (rawType === "time") {
    nextValue = snapTimeValue(input.value, step);
  } else if (rawType === "datetime-local") {
    nextValue = snapDatetimeLocalValue(input.value, step);
  }
  if (nextValue && nextValue !== input.value) {
    input.value = nextValue;
  }
}

function applyMinuteStep(input, stepMinutes = null) {
  if (!input) return;
  const rawType = (input.getAttribute?.("type") || input.type || "").toLowerCase();
  if (rawType === "time" || rawType === "datetime-local") {
    const step = resolveMinuteStep(input, stepMinutes);
    input.step = String(Math.max(1, Math.round(step * 60)));
  }
}

const timePickerInstances = new WeakMap();
const timePickerOverlays = new WeakMap();
let activeTimePicker = null;

function parseTimeParts(value) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return { hours, minutes };
}

function parseDateParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function to12HourParts(hour24) {
  const safeHour = Number.isFinite(hour24) ? hour24 : 0;
  const meridiem = safeHour >= 12 ? "PM" : "AM";
  let hour = safeHour % 12;
  if (hour === 0) hour = 12;
  return { hour: pad2(hour), meridiem };
}

function to24HourValue(hour12, meridiem) {
  let hour = Number(hour12);
  if (!Number.isFinite(hour)) return 0;
  const mer = String(meridiem || "AM").toUpperCase();
  if (mer === "PM" && hour !== 12) hour += 12;
  if (mer === "AM" && hour === 12) hour = 0;
  return hour;
}

function getRoundedTimeParts(stepMinutes = TIME_STEP_MINUTES) {
  const step = Math.max(1, Math.round(stepMinutes));
  const now = new Date();
  const minutes = now.getMinutes();
  const rounded = Math.round(minutes / step) * step;
  const hourCarry = rounded >= 60 ? 1 : 0;
  const hour = (now.getHours() + hourCarry) % 24;
  const minute = rounded >= 60 ? 0 : rounded;
  return { hours: hour, minutes: minute };
}

function ensurePickerState(instance) {
  syncTimePickerStep(instance);
  const stepMinutes = instance.stepMinutes || TIME_STEP_MINUTES;
  const raw = String(instance.input.value || "");
  if (instance.type === "time") {
    const parsed = parseTimeParts(raw);
    if (parsed) {
      const snapped = snapTimeValueWithDayDelta(`${pad2(parsed.hours)}:${pad2(parsed.minutes)}`, stepMinutes);
      if (snapped) {
        const snappedParts = parseTimeParts(snapped.value);
        instance.selectedHour = snappedParts ? snappedParts.hours : parsed.hours;
        instance.selectedMinute = snappedParts ? snappedParts.minutes : parsed.minutes;
      } else {
        instance.selectedHour = parsed.hours;
        instance.selectedMinute = parsed.minutes;
      }
    } else {
      const fallback = getRoundedTimeParts(stepMinutes);
      instance.selectedHour = fallback.hours;
      instance.selectedMinute = fallback.minutes;
    }
    return;
  }

  const [datePart, timePart] = raw.split("T");
  const parsedDate = parseDateParts(datePart);
  const parsedTime = parseTimeParts(timePart);
  const fallbackTime = getRoundedTimeParts(stepMinutes);
  let baseDate = parsedDate ? new Date(parsedDate.year, parsedDate.month - 1, parsedDate.day) : new Date();

  if (parsedTime) {
    const snapped = snapTimeValueWithDayDelta(`${pad2(parsedTime.hours)}:${pad2(parsedTime.minutes)}`, stepMinutes);
    if (snapped) {
      const snappedParts = parseTimeParts(snapped.value);
      if (snappedParts) {
        instance.selectedHour = snappedParts.hours;
        instance.selectedMinute = snappedParts.minutes;
      }
      if (snapped.dayDelta) {
        baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + snapped.dayDelta);
      }
    } else {
      instance.selectedHour = parsedTime.hours;
      instance.selectedMinute = parsedTime.minutes;
    }
  } else {
    instance.selectedHour = fallbackTime.hours;
    instance.selectedMinute = fallbackTime.minutes;
  }

  instance.selectedDate = baseDate;
  instance.viewDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function updateInputFromPicker(instance) {
  const input = instance.input;
  if (instance.type === "time") {
    const value = `${pad2(instance.selectedHour)}:${pad2(instance.selectedMinute)}`;
    if (input.value !== value) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return;
  }

  if (!instance.selectedDate) return;
  const dateValue = toISODate(instance.selectedDate);
  const timeValue = `${pad2(instance.selectedHour)}:${pad2(instance.selectedMinute)}`;
  const nextValue = `${dateValue}T${timeValue}`;
  if (input.value !== nextValue) {
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function buildColumnOption(label, isSelected, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rs-time-option";
  if (isSelected) btn.classList.add("is-selected");
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return btn;
}

function syncTimePickerStep(instance) {
  const step = resolveMinuteStep(instance.input, instance.stepMinutes);
  if (instance.stepMinutes !== step || !Array.isArray(instance.minuteOptions)) {
    instance.stepMinutes = step;
    instance.minuteOptions = buildMinuteOptions(step);
  }
}

function renderTimeColumns(instance) {
  const { hourCol, minuteCol, meridiemCol, hourFormat, selectedHour, selectedMinute } = instance;
  if (!hourCol || !minuteCol) return;
  hourCol.innerHTML = "";
  minuteCol.innerHTML = "";
  if (meridiemCol) meridiemCol.innerHTML = "";

  syncTimePickerStep(instance);
  const minuteLabels = (instance.minuteOptions || []).map((m) => pad2(m));
  let hourLabels = [];
  let selectedHourLabel = "";

  if (hourFormat === "12") {
    hourLabels = Array.from({ length: 12 }, (_, i) => pad2(i + 1));
    const parts12 = to12HourParts(selectedHour);
    selectedHourLabel = parts12.hour;
    instance.selectedMeridiem = parts12.meridiem;
  } else {
    hourLabels = Array.from({ length: 24 }, (_, i) => pad2(i));
    selectedHourLabel = pad2(selectedHour);
  }

  hourLabels.forEach((label) => {
    hourCol.appendChild(
      buildColumnOption(label, label === selectedHourLabel, () => {
        if (hourFormat === "12") {
          instance.selectedHour = to24HourValue(label, instance.selectedMeridiem);
        } else {
          instance.selectedHour = Number(label);
        }
        updateInputFromPicker(instance);
        renderTimeColumns(instance);
      })
    );
  });

  minuteLabels.forEach((label) => {
    minuteCol.appendChild(
      buildColumnOption(label, label === pad2(selectedMinute), () => {
        instance.selectedMinute = Number(label);
        updateInputFromPicker(instance);
        renderTimeColumns(instance);
      })
    );
  });

  if (meridiemCol) {
    ["AM", "PM"].forEach((label) => {
      meridiemCol.appendChild(
        buildColumnOption(label, label === instance.selectedMeridiem, () => {
          instance.selectedMeridiem = label;
          instance.selectedHour = to24HourValue(to12HourParts(selectedHour).hour, label);
          updateInputFromPicker(instance);
          renderTimeColumns(instance);
        })
      );
    });
  }
}

function buildDateCell(instance, date, isOutside) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "rs-date-cell";
  if (isOutside) btn.classList.add("is-outside");
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    btn.classList.add("is-today");
  }
  if (
    instance.selectedDate &&
    date.getFullYear() === instance.selectedDate.getFullYear() &&
    date.getMonth() === instance.selectedDate.getMonth() &&
    date.getDate() === instance.selectedDate.getDate()
  ) {
    btn.classList.add("is-selected");
  }
  btn.textContent = String(date.getDate());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    instance.selectedDate = date;
    instance.viewDate = new Date(date.getFullYear(), date.getMonth(), 1);
    updateInputFromPicker(instance);
    renderDatePanel(instance);
  });
  return btn;
}

function renderDatePanel(instance) {
  if (!instance.dateGrid || !instance.monthLabel) return;
  const view = instance.viewDate || new Date();
  const year = view.getFullYear();
  const month = view.getMonth();
  instance.monthLabel.textContent = view.toLocaleString(undefined, { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  instance.dateGrid.innerHTML = "";
  ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach((label) => {
    const head = document.createElement("div");
    head.className = "rs-date-head";
    head.textContent = label;
    instance.dateGrid.appendChild(head);
  });

  const totalCells = 42;
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    let date;
    let isOutside = false;
    if (dayNumber < 1) {
      date = new Date(year, month - 1, daysInPrevMonth + dayNumber);
      isOutside = true;
    } else if (dayNumber > daysInMonth) {
      date = new Date(year, month + 1, dayNumber - daysInMonth);
      isOutside = true;
    } else {
      date = new Date(year, month, dayNumber);
    }
    instance.dateGrid.appendChild(buildDateCell(instance, date, isOutside));
  }
}

function createTimePickerInstance(input) {
  const type = (input.getAttribute?.("type") || input.type || "").toLowerCase();
  const hourFormat = type === "datetime-local" ? "12" : "24";
  const popover = document.createElement("div");
  popover.className = "rs-time-popover";
  if (type === "time") {
    popover.classList.add("is-time-only");
  } else {
    popover.classList.add("has-date");
  }

  const panel = document.createElement("div");
  panel.className = "rs-time-panel";
  popover.appendChild(panel);

  let dateGrid = null;
  let monthLabel = null;

  if (type === "datetime-local") {
    const datePanel = document.createElement("div");
    datePanel.className = "rs-date-panel";

    const header = document.createElement("div");
    header.className = "rs-date-header";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "rs-date-nav";
    prevBtn.textContent = "<";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "rs-date-nav";
    nextBtn.textContent = ">";
    monthLabel = document.createElement("div");
    monthLabel.className = "rs-date-label";
    header.appendChild(prevBtn);
    header.appendChild(monthLabel);
    header.appendChild(nextBtn);

    dateGrid = document.createElement("div");
    dateGrid.className = "rs-date-grid";

    const footer = document.createElement("div");
    footer.className = "rs-date-footer";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "ghost small";
    clearBtn.textContent = "Clear";
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "ghost small";
    todayBtn.textContent = "Today";
    footer.appendChild(clearBtn);
    footer.appendChild(todayBtn);

    datePanel.appendChild(header);
    datePanel.appendChild(dateGrid);
    datePanel.appendChild(footer);
    panel.appendChild(datePanel);

    prevBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const view = instance.viewDate || new Date();
      instance.viewDate = new Date(view.getFullYear(), view.getMonth() - 1, 1);
      renderDatePanel(instance);
    });
    nextBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const view = instance.viewDate || new Date();
      instance.viewDate = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      renderDatePanel(instance);
    });
    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      closeActiveTimePicker();
    });
    todayBtn.addEventListener("click", (e) => {
      e.preventDefault();
      instance.selectedDate = new Date();
      instance.viewDate = new Date(instance.selectedDate.getFullYear(), instance.selectedDate.getMonth(), 1);
      updateInputFromPicker(instance);
      renderDatePanel(instance);
    });
  }

  const timePanel = document.createElement("div");
  timePanel.className = "rs-time-columns";
  if (hourFormat === "12") timePanel.classList.add("is-12h");

  const hourCol = document.createElement("div");
  hourCol.className = "rs-time-col";
  const minuteCol = document.createElement("div");
  minuteCol.className = "rs-time-col";
  let meridiemCol = null;
  timePanel.appendChild(hourCol);
  timePanel.appendChild(minuteCol);
  if (hourFormat === "12") {
    meridiemCol = document.createElement("div");
    meridiemCol.className = "rs-time-col";
    timePanel.appendChild(meridiemCol);
  }
  panel.appendChild(timePanel);

  const stepMinutes = resolveMinuteStep(input);
  const instance = {
    input,
    type,
    hourFormat,
    stepMinutes,
    minuteOptions: buildMinuteOptions(stepMinutes),
    popover,
    panel,
    dateGrid,
    monthLabel,
    hourCol,
    minuteCol,
    meridiemCol,
    selectedDate: null,
    selectedHour: 0,
    selectedMinute: 0,
    selectedMeridiem: "AM",
    viewDate: null,
  };

  timePickerInstances.set(input, instance);
  ensurePickerState(instance);
  renderDatePanel(instance);
  renderTimeColumns(instance);
  return instance;
}

function positionTimePicker(instance) {
  const rect = instance.input.getBoundingClientRect();
  const popover = instance.popover;
  const viewportW = window.innerWidth;
  const padding = 8;
  const maxAllowed = Math.max(0, viewportW - padding * 2);
  const fullMinWidth = 408;
  let useCompact =
    instance.type === "datetime-local" && maxAllowed > 0 && maxAllowed < fullMinWidth;
  if (instance.type === "datetime-local") {
    popover.classList.toggle("is-compact", useCompact);
  }
  const minWidth = instance.type === "time" ? 200 : useCompact ? 280 : 420;
  const maxWidth = instance.type === "time" ? 240 : useCompact ? 360 : 460;
  let targetWidth = Math.min(Math.max(rect.width, minWidth), maxWidth, maxAllowed || maxWidth);
  popover.style.width = `${targetWidth}px`;

  if (instance.type === "datetime-local" && !useCompact && instance.panel) {
    const panelWidth = instance.panel.scrollWidth + padding * 2;
    if (panelWidth > targetWidth + 2) {
      const expanded = Math.min(Math.max(panelWidth, minWidth), maxWidth, maxAllowed || maxWidth);
      if (expanded > targetWidth + 1) {
        targetWidth = expanded;
        popover.style.width = `${targetWidth}px`;
      }
      if (panelWidth > targetWidth + 2 && maxAllowed < panelWidth) {
        useCompact = true;
        popover.classList.add("is-compact");
        const compactMin = 280;
        const compactMax = 360;
        targetWidth = Math.min(Math.max(rect.width, compactMin), compactMax, maxAllowed || compactMax);
        popover.style.width = `${targetWidth}px`;
      }
    }
  }

  const width = popover.offsetWidth || targetWidth;
  const height = popover.offsetHeight || 320;
  const viewportH = window.innerHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  const maxLeft = viewportW - width - padding;
  if (left > maxLeft) left = maxLeft;
  if (left < padding) left = padding;
  if (top + height > viewportH - padding) {
    const altTop = rect.top - height - 6;
    if (altTop >= padding) {
      top = altTop;
    } else {
      top = Math.max(padding, viewportH - height - padding);
    }
  }
  if (top < padding) top = padding;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function closeActiveTimePicker() {
  if (!activeTimePicker) return;
  activeTimePicker.popover.remove();
  activeTimePicker = null;
  document.removeEventListener("mousedown", handleOutsideTimePicker);
  document.removeEventListener("keydown", handleTimePickerEscape);
  window.removeEventListener("scroll", handleTimePickerScroll, true);
  window.removeEventListener("resize", handleTimePickerResize);
}

function handleOutsideTimePicker(e) {
  if (!activeTimePicker) return;
  if (activeTimePicker.popover.contains(e.target)) return;
  if (e.target === activeTimePicker.input) return;
  closeActiveTimePicker();
}

function handleTimePickerEscape(e) {
  if (e.key === "Escape") closeActiveTimePicker();
}

function handleTimePickerScroll() {
  if (!activeTimePicker) return;
  positionTimePicker(activeTimePicker);
}

function handleTimePickerResize() {
  if (!activeTimePicker) return;
  positionTimePicker(activeTimePicker);
}

function openTimePicker(input) {
  if (!input || input.disabled) return;
  if (activeTimePicker?.input === input) return;
  closeActiveTimePicker();
  const instance = timePickerInstances.get(input) || createTimePickerInstance(input);
  ensurePickerState(instance);
  renderDatePanel(instance);
  renderTimeColumns(instance);
  document.body.appendChild(instance.popover);
  positionTimePicker(instance);
  activeTimePicker = instance;
  document.addEventListener("mousedown", handleOutsideTimePicker);
  document.addEventListener("keydown", handleTimePickerEscape);
  window.addEventListener("scroll", handleTimePickerScroll, true);
  window.addEventListener("resize", handleTimePickerResize);
}

function refreshTimePickerForInput(input) {
  if (!activeTimePicker || activeTimePicker.input !== input) return;
  ensurePickerState(activeTimePicker);
  renderDatePanel(activeTimePicker);
  renderTimeColumns(activeTimePicker);
  positionTimePicker(activeTimePicker);
}

function syncTimeOverlayState(input) {
  const overlay = timePickerOverlays.get(input);
  if (!overlay) return;
  overlay.disabled = Boolean(input.disabled);
}

function bindTimePickerInput(input) {
  if (!input) return;
  const type = (input.getAttribute?.("type") || input.type || "").toLowerCase();
  if (type !== "time" && type !== "datetime-local") return;
  if (!timePickerOverlays.has(input)) {
    const wrapper = document.createElement("span");
    wrapper.className = "rs-time-wrap";
    const parent = input.parentNode;
    if (parent) {
      parent.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      const overlay = document.createElement("button");
      overlay.type = "button";
      overlay.className = "rs-time-overlay";
      overlay.setAttribute("aria-label", input.getAttribute("aria-label") || "Select time");
      overlay.addEventListener("click", (e) => {
        e.preventDefault();
        openTimePicker(input);
      });
      overlay.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openTimePicker(input);
        }
      });
      wrapper.appendChild(overlay);
      input.classList.add("rs-time-input");
      input.setAttribute("aria-hidden", "true");
      input.tabIndex = -1;
      input.readOnly = true;
      input.style.pointerEvents = "none";
      timePickerOverlays.set(input, overlay);
    }
  }
  syncTimeOverlayState(input);
  input.addEventListener("focus", (e) => {
    e.preventDefault();
    if (document.activeElement === input) input.blur();
    openTimePicker(input);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openTimePicker(input);
    }
  });
  input.addEventListener("input", () => refreshTimePickerForInput(input));
}

function initTimePickers(inputs) {
  (inputs || []).forEach((input) => bindTimePickerInput(input));
}

function initTimePickersForInputs(inputs) {
  const list = Array.from(inputs || []).filter(Boolean);
  list.forEach((input) => applyMinuteStep(input));
  initTimePickers(list);
}

function stripHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const normalized = raw.replace(/<br\s*\/?>/gi, "\n");
  const el = document.createElement("div");
  el.innerHTML = normalized;
  return String(el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
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

function sanitizeStyle(style) {
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
}

function sanitizeRichText(html) {
  const raw = String(html || "");
  if (!raw.trim()) return "";
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }

    const tag = node.tagName.toLowerCase();
    if (!GENERAL_NOTES_ALLOWED_TAGS.has(tag)) {
      const text = doc.createTextNode(node.textContent || "");
      node.replaceWith(text);
      return;
    }

    const allowed = GENERAL_NOTES_ALLOWED_ATTRS[tag] || new Set();
    Array.from(node.attributes || []).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (!allowed.has(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (tag === "a" && name === "href") {
        if (!isSafeUrl(value)) {
          node.removeAttribute("href");
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

function setGeneralNotesHtml(value) {
  const raw = String(value || "");
  const looksLikeHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
  const html = looksLikeHtml ? raw : escapeHtml(raw).replaceAll("\n", "<br />");
  const cleaned = sanitizeRichText(html);
  if (generalNotesEditor) generalNotesEditor.innerHTML = cleaned;
  if (generalNotesInput) generalNotesInput.value = cleaned;
}

function getGeneralNotesHtml() {
  const raw = generalNotesEditor ? generalNotesEditor.innerHTML : String(generalNotesInput?.value || "");
  const looksLikeHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
  const html = looksLikeHtml ? raw : escapeHtml(raw).replaceAll("\n", "<br />");
  const cleaned = sanitizeRichText(html);
  if (generalNotesInput) generalNotesInput.value = cleaned;
  return cleaned;
}

function convertDataUrlToWebp(dataUrl, quality = 0.88) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      if (!width || !height) return resolve(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      const webp = canvas.toDataURL("image/webp", quality);
      if (!/^data:image\/webp/i.test(webp)) return resolve(dataUrl);
      resolve(webp);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function convertInlineImagesToWebpHtml(html, quality = 0.88) {
  const raw = String(html || "");
  if (!/data:image\/(png|jpe?g)/i.test(raw)) return raw;
  const doc = new DOMParser().parseFromString(`<div>${raw}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return raw;
  const imgs = Array.from(root.querySelectorAll("img"));
  let changed = false;
  for (const img of imgs) {
    const src = String(img.getAttribute("src") || "");
    if (!/^data:image\/(png|jpe?g)/i.test(src)) continue;
    const webp = await convertDataUrlToWebp(src, quality);
    if (webp && webp !== src) {
      img.setAttribute("src", webp);
      changed = true;
    }
  }
  return changed ? root.innerHTML : raw;
}

function storeGeneralNotesSelection() {
  if (!generalNotesEditor) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!generalNotesEditor.contains(range.commonAncestorContainer)) return;
  generalNotesLastRange = range.cloneRange();
}

function restoreGeneralNotesSelection() {
  if (!generalNotesLastRange || !generalNotesEditor) return;
  const sel = window.getSelection();
  if (!sel) return;
  if (!generalNotesEditor.contains(generalNotesLastRange.commonAncestorContainer)) return;
  sel.removeAllRanges();
  sel.addRange(generalNotesLastRange);
}

function execGeneralNotesCommand(command, value) {
  if (!generalNotesEditor) return;
  generalNotesEditor.focus();
  restoreGeneralNotesSelection();
  document.execCommand(command, false, value);
  storeGeneralNotesSelection();
  if (generalNotesInput) generalNotesInput.value = generalNotesEditor.innerHTML;
}

function insertGeneralNotesImage(url, name) {
  if (!generalNotesEditor || !url) return;
  generalNotesEditor.focus();
  restoreGeneralNotesSelection();
  document.execCommand("insertImage", false, url);
  if (name) {
    const imgs = Array.from(generalNotesEditor.querySelectorAll("img"));
    const matching = imgs.filter((img) => String(img.getAttribute("src") || "") === String(url));
    const last = (matching.length ? matching : imgs)[(matching.length ? matching : imgs).length - 1];
    if (last) last.alt = String(name || "General notes image");
  }
  storeGeneralNotesSelection();
  if (generalNotesInput) generalNotesInput.value = generalNotesEditor.innerHTML;
}

function makeImageId(prefix = "img") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
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
  if (!companyId) throw new Error("Company id is required.");
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }
  const prepared = await convertImageToWebpFile(file);
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", prepared);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image.");
  if (!data.url) throw new Error("Upload did not return an image url.");
  return data.url;
}

async function deleteImage({ companyId, url }) {
  if (!companyId || !url) return;
  await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url }),
  });
}

function normalizeRentalInfoFields(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const normalized = {};
  Object.entries(DEFAULT_RENTAL_INFO_FIELDS).forEach(([key, defaults]) => {
    const entry = raw[key];
    const enabled =
      typeof entry === "boolean"
        ? entry
        : entry && typeof entry === "object" && entry.enabled !== undefined
          ? entry.enabled === true
          : defaults.enabled === true;
    const required =
      entry && typeof entry === "object" && entry.required !== undefined
        ? entry.required === true
        : defaults.required === true;
    normalized[key] = { enabled, required };
  });
  return normalized;
}

function applyRentalInfoConfig(config) {
  rentalInfoFields = normalizeRentalInfoFields(config);
  Object.entries(rentalInfoFieldContainers).forEach(([key, el]) => {
    if (!el) return;
    const enabled = rentalInfoFields?.[key]?.enabled !== false;
    el.style.display = enabled ? "" : "none";
  });
  if (rentalInfoFields?.generalNotes?.enabled === false) {
    clearGeneralNotesImages({ deleteUploads: true });
  }
}

function normalizeTimeValue(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function coerceCoverageDay(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "";
  const dayMap = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };
  return dayMap[key] || "";
}

function coverageDayIndex(day) {
  return coverageDayKeys.indexOf(day);
}

function addCoverageDayOffset(day, offset) {
  const idx = coverageDayIndex(day);
  if (idx === -1) return day;
  const nextIdx = (idx + offset + coverageDayKeys.length) % coverageDayKeys.length;
  return coverageDayKeys[nextIdx];
}

function coverageSlotKey(slot) {
  return `${slot.startDay || ""}-${slot.startTime || ""}-${slot.endDay || ""}-${slot.endTime || ""}`;
}

function normalizeCoverageSlot(entry) {
  if (!entry || typeof entry !== "object") return null;
  const startDay = coerceCoverageDay(entry.startDay ?? entry.start_day ?? entry.day ?? entry.startDayKey);
  const endDayRaw = coerceCoverageDay(entry.endDay ?? entry.end_day ?? entry.endDayKey ?? entry.day_end);
  const startTime = normalizeTimeValue(entry.startTime ?? entry.start_time ?? entry.start);
  const endTime = normalizeTimeValue(entry.endTime ?? entry.end_time ?? entry.end);
  if (!startDay && !endDayRaw && !startTime && !endTime) return null;
  if (!startDay || !startTime || !endTime) return null;
  let endDay = endDayRaw || startDay;
  const explicitOffset = entry.endDayOffset ?? entry.end_day_offset;
  if (!endDayRaw) {
    if (explicitOffset === 1 || explicitOffset === "1" || explicitOffset === true || entry.spansMidnight === true) {
      endDay = addCoverageDayOffset(startDay, 1);
    } else {
      const startMinutes = timeToMinutes(startTime);
      const endMinutes = timeToMinutes(endTime);
      if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
        endDay = addCoverageDayOffset(startDay, 1);
      }
    }
  }
  if (!endDay) endDay = startDay;
  return { startDay, startTime, endDay, endTime };
}

function sortCoverageSlots(slots) {
  return (slots || [])
    .slice()
    .sort((a, b) => {
      const dayDiff = coverageDayIndex(a.startDay) - coverageDayIndex(b.startDay);
      if (dayDiff) return dayDiff;
      const aStart = timeToMinutes(a.startTime) ?? 0;
      const bStart = timeToMinutes(b.startTime) ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = timeToMinutes(a.endTime) ?? 0;
      const bEnd = timeToMinutes(b.endTime) ?? 0;
      return aEnd - bEnd;
    });
}

function normalizeCoverageHours(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.slots)) {
    raw = raw.slots;
  }

  const slots = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      const normalized = normalizeCoverageSlot(entry);
      if (normalized) slots.push(normalized);
    });
    return sortCoverageSlots(slots);
  }

  if (raw && typeof raw === "object") {
    coverageDayKeys.forEach((day) => {
      const entry = raw[day] || {};
      const startTime = normalizeTimeValue(entry.start);
      const endTime = normalizeTimeValue(entry.end);
      if (!startTime && !endTime) return;
      if (!startTime || !endTime) return;
      let endDay = day;
      const explicit = entry.endDayOffset ?? entry.end_day_offset;
      if (explicit === 1 || explicit === "1" || explicit === true || entry.spansMidnight === true) {
        endDay = addCoverageDayOffset(day, 1);
      } else {
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
          endDay = addCoverageDayOffset(day, 1);
        }
      }
      slots.push({ startDay: day, startTime, endDay, endTime });
    });
  }

  return sortCoverageSlots(slots);
}

const coverageDayOptionsHtml = coverageDayKeys
  .map((day) => `<option value="${day}">${coverageDayLabels[day] || day}</option>`)
  .join("");
const coverageCopyDaysHtml = coverageDayKeys
  .map(
    (day) =>
      `<label><input type="checkbox" value="${day}" data-coverage-copy-day="${day}" />${coverageDayLabels[day] || day}</label>`
  )
  .join("");

function buildCoverageSlotRow(slot = {}) {
  const row = document.createElement("div");
  row.className = "coverage-slot";
  row.dataset.coverageSlot = "true";
  row.innerHTML = `
    <div class="coverage-slot-main">
      <label class="coverage-field">
        <span class="hint">Start</span>
        <div class="coverage-stack">
          <select data-coverage-field="start-day">${coverageDayOptionsHtml}</select>
          <input type="time" step="300" data-coverage-field="start-time" aria-label="Coverage start time" />
        </div>
      </label>
      <label class="coverage-field">
        <span class="hint">End</span>
        <div class="coverage-stack">
          <select data-coverage-field="end-day">${coverageDayOptionsHtml}</select>
          <input type="time" step="300" data-coverage-field="end-time" aria-label="Coverage end time" />
        </div>
      </label>
    </div>
    <div class="coverage-slot-actions">
      <button type="button" class="ghost small" data-coverage-action="duplicate">Duplicate</button>
      <button type="button" class="ghost small" data-coverage-action="copy">Copy to days</button>
      <button type="button" class="ghost small danger" data-coverage-action="remove">Remove</button>
    </div>
    <div class="coverage-slot-copy" data-coverage-copy hidden>
      <span class="hint">Copy this slot to start on:</span>
      <div class="coverage-day-options">${coverageCopyDaysHtml}</div>
      <div class="inline-actions">
        <button type="button" class="ghost small" data-coverage-action="apply-copy">Apply</button>
        <button type="button" class="ghost small" data-coverage-action="cancel-copy">Cancel</button>
      </div>
    </div>
  `;

  const normalized = normalizeCoverageSlot(slot) || {};
  const startDaySelect = row.querySelector('[data-coverage-field="start-day"]');
  const endDaySelect = row.querySelector('[data-coverage-field="end-day"]');
  const startTimeInput = row.querySelector('[data-coverage-field="start-time"]');
  const endTimeInput = row.querySelector('[data-coverage-field="end-time"]');

  const fallbackDay = coverageDayKeys[0];
  const startDay = normalized.startDay || coerceCoverageDay(slot.startDay ?? slot.start_day) || fallbackDay;
  const endDay =
    normalized.endDay || coerceCoverageDay(slot.endDay ?? slot.end_day) || (startDay ? startDay : fallbackDay);

  if (startDaySelect) startDaySelect.value = startDay;
  if (endDaySelect) endDaySelect.value = endDay;
  if (startTimeInput && normalized.startTime) startTimeInput.value = normalized.startTime;
  if (endTimeInput && normalized.endTime) endTimeInput.value = normalized.endTime;

  return row;
}

function addCoverageSlotRow(slot = {}, { afterRow = null } = {}) {
  if (!coverageSlotsContainer) return null;
  const row = buildCoverageSlotRow(slot);
  if (afterRow && afterRow.parentNode === coverageSlotsContainer) {
    afterRow.insertAdjacentElement("afterend", row);
  } else {
    coverageSlotsContainer.appendChild(row);
  }
  initTimePickersForInputs(row.querySelectorAll('input[type="time"]'));
  return row;
}

function renderCoverageSlots(slots) {
  if (!coverageSlotsContainer) return;
  closeActiveTimePicker();
  coverageSlotsContainer.innerHTML = "";
  const normalized = normalizeCoverageHours(slots);
  if (!normalized.length) {
    addCoverageSlotRow({});
    return;
  }
  normalized.forEach((slot) => addCoverageSlotRow(slot));
}

function readCoverageSlotFromRow(row) {
  if (!row) return null;
  const startDay = row.querySelector('[data-coverage-field="start-day"]')?.value || "";
  const endDay = row.querySelector('[data-coverage-field="end-day"]')?.value || "";
  const startTime = row.querySelector('[data-coverage-field="start-time"]')?.value || "";
  const endTime = row.querySelector('[data-coverage-field="end-time"]')?.value || "";
  return { startDay, startTime, endDay, endTime };
}

function collectCoverageHoursFromInputs() {
  if (!coverageSlotsContainer) return [];
  const slots = [];
  coverageSlotsContainer.querySelectorAll("[data-coverage-slot]").forEach((row) => {
    const slot = readCoverageSlotFromRow(row);
    if (!slot) return;
    if (!slot.startDay && !slot.startTime && !slot.endDay && !slot.endTime) return;
    slots.push(slot);
  });
  return normalizeCoverageHours(slots);
}

function setCoverageInputs(value) {
  renderCoverageSlots(value || []);
}

function collectNotificationCircumstances() {
  if (!notificationCircumstancesContainer) return [];
  const checkboxes = notificationCircumstancesContainer.querySelectorAll('input[type="checkbox"]:checked');
  const values = [];
  checkboxes.forEach((cb) => {
    if (cb.value === "Other") {
      const otherVal = (notificationOtherInput?.value || "").trim();
      values.push(otherVal ? `Other: ${otherVal}` : "Other");
    } else {
      values.push(cb.value);
    }
  });
  return values;
}

function applyNotificationCircumstances(values) {
  if (!notificationCircumstancesContainer) return;
  const list = Array.isArray(values) ? values : [];
  const checkboxes = notificationCircumstancesContainer.querySelectorAll('input[type="checkbox"]');
  const byValue = new Map();
  checkboxes.forEach((cb) => {
    cb.checked = false;
    byValue.set(String(cb.value || "").toLowerCase(), cb);
  });

  let otherSelected = false;
  let otherText = "";
  list.forEach((entry) => {
    const text = String(entry || "").trim();
    if (!text) return;
    const otherMatch = text.match(/^other\s*:\s*(.+)$/i);
    if (otherMatch) {
      otherSelected = true;
      if (!otherText) otherText = otherMatch[1].trim();
      return;
    }
    if (text.toLowerCase() === "other") {
      otherSelected = true;
      return;
    }
    const cb = byValue.get(text.toLowerCase());
    if (cb) cb.checked = true;
  });

  if (notificationOtherCheckbox) notificationOtherCheckbox.checked = otherSelected;
  if (notificationOtherInput) {
    notificationOtherInput.value = otherText;
    notificationOtherInput.style.display = otherSelected ? "" : "none";
  }
}

function toggleNotificationOther() {
  if (!notificationOtherInput || !notificationOtherCheckbox) return;
  const show = notificationOtherCheckbox.checked;
  notificationOtherInput.style.display = show ? "" : "none";
  if (!show) notificationOtherInput.value = "";
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

function addContactRow(list, { name = "", title = "", email = "", phone = "" } = {}, { focus = false } = {}) {
  if (!list) return;
  const row = document.createElement("div");
  row.className = "contact-row";
  row.innerHTML = `
    <label>Contact name <input data-contact-field="name" /></label>
    <label>Title <input data-contact-field="title" /></label>
    <label>Email <input data-contact-field="email" type="email" /></label>
    <label>Phone number <input data-contact-field="phone" /></label>
    <button type="button" class="ghost small contact-remove" aria-label="Remove contact">Remove</button>
  `;
  const nameInput = row.querySelector('[data-contact-field="name"]');
  const titleInput = row.querySelector('[data-contact-field="title"]');
  const emailInput = row.querySelector('[data-contact-field="email"]');
  const phoneInput = row.querySelector('[data-contact-field="phone"]');
  if (nameInput) nameInput.value = name;
  if (titleInput) titleInput.value = title;
  if (emailInput) emailInput.value = email;
  if (phoneInput) phoneInput.value = phone;
  list.appendChild(row);
  updateContactRemoveButtons(list);
  if (focus && nameInput) nameInput.focus();
}

function setContactRows(list, rows) {
  if (!list) return;
  list.innerHTML = "";
  const normalized = Array.isArray(rows) && rows.length ? rows : [{ name: "", title: "", email: "", phone: "" }];
  normalized.forEach((row) => {
    addContactRow(
      list,
      {
        name: row?.name || row?.contactName || row?.contact_name || "",
        title: row?.title || row?.contactTitle || row?.contact_title || "",
        email: row?.email || "",
        phone: row?.phone || "",
      },
      { focus: false }
    );
  });
  updateContactRemoveButtons(list);
}

function collectContacts(list) {
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll(".contact-row"));
  return rows
    .map((row) => {
      const name = String(row.querySelector('[data-contact-field="name"]')?.value || "").trim();
      const title = String(row.querySelector('[data-contact-field="title"]')?.value || "").trim();
      const email = String(row.querySelector('[data-contact-field="email"]')?.value || "").trim();
      const phone = String(row.querySelector('[data-contact-field="phone"]')?.value || "").trim();
      if (!name && !email && !phone) return null;
      return { name, title, email, phone };
    })
    .filter(Boolean);
}

function setGeneralNotesImagesStatus(message) {
  if (!generalNotesImagesStatus) return;
  generalNotesImagesStatus.textContent = String(message || "");
}

function renderGeneralNotesPreviews() {
  if (!generalNotesPreviews) return;
  generalNotesPreviews.replaceChildren();
  generalNotesPreviews.hidden = generalNotesImages.length === 0;
  generalNotesImages.forEach((img) => {
    const tile = document.createElement("div");
    tile.className = "guard-notes-preview";
    tile.innerHTML = `
      <img src="${escapeHtml(img.url || "")}" alt="${escapeHtml(img.fileName || "General notes photo")}" loading="lazy" />
      <button class="ghost tiny" type="button" data-remove-general-notes="${escapeHtml(String(img.id || ""))}">Remove</button>
    `;
    generalNotesPreviews.appendChild(tile);
  });
}

async function clearGeneralNotesImages({ deleteUploads = false } = {}) {
  if (deleteUploads && generalNotesImages.length) {
    const companyId = linkData?.company?.id;
    if (companyId) {
      const urls = generalNotesImages.map((img) => img.url).filter(Boolean);
      await Promise.allSettled(urls.map((url) => deleteImage({ companyId, url })));
    }
  }
  generalNotesImages = [];
  generalNotesUploadsInFlight = 0;
  renderGeneralNotesPreviews();
  setGeneralNotesImagesStatus("");
}

function ensureLineItem() {
  if (!lineItems.length) {
    lineItems.push({
      lineItemId: null,
      typeId: null,
      bundleId: null,
      unitDescription: "",
      startLocal: "",
      endLocal: "",
      rateBasis: null,
      rateAmount: null,
      billableUnits: null,
      lineAmount: null,
    });
  }
}

function normalizeTypeName(name) {
  return String(name || "").trim().toLowerCase();
}

function isRerentType(type) {
  return normalizeTypeName(type?.name) === "rerent";
}

function getRerentTypeId() {
  const rerentType = types.find((t) => isRerentType(t));
  return rerentType ? String(rerentType.id) : null;
}

function isRerentLineItem(li) {
  if (!li) return false;
  const rerentId = getRerentTypeId();
  if (rerentId && String(li.typeId || "") === rerentId) return true;
  return !!String(li.unitDescription || "").trim();
}

function buildTypeOptions(selectedId) {
  const opts = ['<option value="">Select equipment</option>'];
  types.filter((t) => !isRerentType(t)).forEach((t) => {
    const sel = String(selectedId || "") === String(t.id) ? "selected" : "";
    opts.push(`<option value="${t.id}" ${sel}>${t.name}</option>`);
  });
  return opts.join("");
}

function renderLineItems() {
  closeActiveTimePicker();
  lineItemsEl.innerHTML = "";
  lineItems.forEach((li, idx) => {
    const div = document.createElement("div");
    div.className = "line-item-card";
    div.dataset.index = String(idx);
    const typeDisabled = li.bundleId ? "disabled" : "";
    const isRerent = isRerentLineItem(li);
    const unitDescription = escapeHtml(String(li.unitDescription || ""));
    const typeFieldHtml = isRerent
      ? `
          <label>Unit
            <input value="${unitDescription}" readonly placeholder="Product description" />
          </label>
        `
      : `
          <label>Equipment type
            <select data-field="typeId" ${typeDisabled}>${buildTypeOptions(li.typeId)}</select>
          </label>
        `;
    const pricingFields = [];
    if (li.billableUnits !== null && li.billableUnits !== undefined) {
      pricingFields.push(`
        <label>Units
          <input value="${li.billableUnits}" readonly />
        </label>
      `);
    }
    if (li.rateAmount !== null && li.rateAmount !== undefined) {
      const basisLabel = li.rateBasis ? `${formatRateBasis(li.rateBasis)} rate` : "Rate";
      pricingFields.push(`
        <label>${basisLabel}
          <input value="${formatMoney(li.rateAmount)}" readonly />
        </label>
      `);
    }
    if (li.lineAmount !== null && li.lineAmount !== undefined) {
      pricingFields.push(`
        <label>Line amount
          <input value="${formatMoney(li.lineAmount)}" readonly />
        </label>
      `);
    }
    const pricingRowClass =
      pricingFields.length === 1 ? "stack" : pricingFields.length === 2 ? "two-col" : "three-col";
    const pricingHtml = pricingFields.length
      ? `<div class="${pricingRowClass}">${pricingFields.join("")}</div>`
      : "";
    div.innerHTML = `
      <div class="line-item-header">
        <strong>Line item ${idx + 1}</strong>
        <button type="button" class="ghost danger small" data-action="remove">Remove</button>
      </div>
      <div class="stack">
        <div class="line-item-fields">
          ${typeFieldHtml}
          <label>Booked start
            <input type="datetime-local" step="900" data-field="startLocal" value="${li.startLocal || ""}" />
          </label>
          <label>Booked end
            <input type="datetime-local" step="900" data-field="endLocal" value="${li.endLocal || ""}" />
          </label>
        </div>
        ${pricingHtml}
      </div>
    `;
    lineItemsEl.appendChild(div);
  });
  initTimePickersForInputs(lineItemsEl.querySelectorAll('input[type="datetime-local"]'));
}

function renderDocuments(categories) {
  documentUploads.innerHTML = "";
  docCategoryMap = {};
  categories.forEach((cat) => {
    const slug = slugify(cat);
    docCategoryMap[slug] = cat;
    const label = document.createElement("label");
    label.textContent = `${cat} (upload)`;
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.id = `doc-${slug}`;
    input.name = `doc_${slug}`;
    label.appendChild(input);
    documentUploads.appendChild(label);
  });
  documentsSection.style.display = categories.length ? "block" : "none";
}

function setFormDisabled(disabled) {
  form.querySelectorAll("input, select, textarea, button").forEach((el) => {
    if (el.id === "download-proof") return;
    el.disabled = disabled;
  });
  if (generalNotesEditor) generalNotesEditor.contentEditable = disabled ? "false" : "true";
}

function showUsedLinkMessage({ proofAvailable = false, proofUrl = "" } = {}) {
  linkBanner.textContent = "This link has already been used.";
  setFormDisabled(true);
  if (proofActions) proofActions.style.display = "none";
  if (form) form.style.display = "none";
  if (linkUsedCard) linkUsedCard.style.display = "block";
  if (linkUsedProofActions && linkUsedProof) {
    if (proofAvailable) {
      linkUsedProof.href = proofUrl || "#";
      linkUsedProofActions.style.display = "flex";
    } else {
      linkUsedProofActions.style.display = "none";
    }
  }
}

function showExpiredLinkMessage() {
  linkBanner.textContent = "This link has expired.";
  setFormDisabled(true);
  if (proofActions) proofActions.style.display = "none";
  if (form) form.style.display = "none";
  if (linkExpiredCard) linkExpiredCard.style.display = "block";
}

async function loadLink() {
  if (!token) {
    linkBanner.textContent = "Missing link token.";
    setFormDisabled(true);
    return;
  }
  try {
    const res = await fetch(`/api/public/customer-links/${encodeURIComponent(token)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errorMessage = data.error || "Unable to load link.";
      if (String(errorMessage).toLowerCase().includes("expired")) {
        showExpiredLinkMessage();
        return;
      }
      throw new Error(errorMessage);
    }
    linkData = data;
    if (data.link?.singleUse && data.link?.usedAt) {
      showUsedLinkMessage({
        proofAvailable: !!data.proofAvailable,
        proofUrl: `/api/public/customer-links/${encodeURIComponent(token)}/proof`,
      });
      return;
    }
    linkBanner.textContent = "Fill in the required details and submit for review.";
    pageTitle.textContent = data.company?.name ? `Update for ${data.company.name}` : "Customer update";
    pageSubtitle.textContent = data.link?.scope === "new_quote" ? "Submit your quote details." : "Submit your customer updates.";

    const customer = data.customer || {};
    companyNameInput.value = customer.companyName || "";
    renderContactCategories(data.contactCategories || []);
    const groups = buildCustomerContactGroups(customer);
    setContactCategoryRows(groups);
    streetInput.value = customer.streetAddress || "";
    cityInput.value = customer.city || "";
    regionInput.value = customer.region || "";
    postalInput.value = customer.postalCode || "";
    countryInput.value = customer.country || "";

    const order = data.order || null;
    const showOrder = !!order || data.link?.scope === "new_quote" || data.link?.scope === "order_update";
    if (customerPoField) customerPoField.style.display = showOrder ? "grid" : "none";
    if (orderSection) orderSection.style.display = showOrder ? "block" : "none";
    if (lineItemsSection) lineItemsSection.style.display = showOrder ? "block" : "none";
    if (rentalInfoSection) rentalInfoSection.style.display = showOrder ? "block" : "none";
    if (showOrder) {
      customerPoInput.value = order?.customerPo || "";
      const fulfillmentMethod = order?.fulfillmentMethod === "dropoff" ? "dropoff" : "pickup";
      fulfillmentSelect.value = fulfillmentMethod;
      pickupAddress = formatPickupAddress(order);
      originalDropoffAddress = order?.dropoffAddress || "";
      lastDropoffAddress = originalDropoffAddress;
      if (dropoffInput) {
        if (fulfillmentMethod === "pickup") {
          dropoffInput.value = pickupAddress || "";
          dropoffInput.readOnly = true;
        } else {
          dropoffInput.value = originalDropoffAddress;
          dropoffInput.readOnly = false;
        }
      }
      if (logisticsInstructionsInput) logisticsInstructionsInput.value = order?.logisticsInstructions || "";
      if (siteNameInput) siteNameInput.value = order?.siteName || "";
      setSiteAddressInputValue(order?.siteAddress || "");
      siteAddressLat = toFiniteCoordinate(order?.siteAddressLat);
      siteAddressLng = toFiniteCoordinate(order?.siteAddressLng);
      siteAddressQuery = order?.siteAddressQuery ? String(order.siteAddressQuery) : "";
      if (siteAccessInfoInput) siteAccessInfoInput.value = order?.siteAccessInfo || "";
      if (criticalAreasInput) criticalAreasInput.value = order?.criticalAreas || "";
      if (monitoringPersonnelInput) monitoringPersonnelInput.value = order?.monitoringPersonnel || "";
      setGeneralNotesHtml(order?.generalNotes || "");
      setContactRows(emergencyContactsList, order?.emergencyContacts || []);
      if (emergencyContactInstructionsInput) {
        emergencyContactInstructionsInput.value =
          order?.emergencyContactInstructions || order?.emergency_contact_instructions || "";
      }
      setContactRows(siteContactsList, order?.siteContacts || []);
      applyNotificationCircumstances(order?.notificationCircumstances || []);
      setCoverageInputs(normalizeCoverageHours(order?.coverageHours || []));
      setCoverageTimeZoneInput(order?.coverageTimeZone || order?.coverage_timezone || null);
      if (coverageStatHolidaysCheckbox) {
        const statRequired =
          order?.coverageStatHolidaysRequired ??
          order?.coverage_stat_holidays_required ??
          false;
        coverageStatHolidaysCheckbox.checked = statRequired === true;
      }
      applyRentalInfoConfig(data.rentalInfoFields || null);
    }

    types = Array.isArray(data.types) ? data.types : [];
    lineItems = Array.isArray(data.lineItems)
      ? data.lineItems.map((li) => ({
          lineItemId: li.lineItemId || null,
          typeId: li.typeId || null,
          bundleId: li.bundleId || null,
          unitDescription: li.unitDescription || "",
          startLocal: toLocalInputValue(li.startAt),
          endLocal: toLocalInputValue(li.endAt),
          rateBasis: li.rateBasis || null,
          rateAmount: li.rateAmount ?? null,
          billableUnits: li.billableUnits ?? null,
          lineAmount: li.lineAmount ?? null,
        }))
      : [];
    orderUnits = Array.isArray(data.orderUnits) ? data.orderUnits : [];
    if (showOrder) {
      ensureLineItem();
      renderLineItems();
      syncSideAddressUnitSelect({ preserveSelection: false });
    }

    const categories = Array.isArray(data.link?.documentCategories) ? data.link.documentCategories : [];
    renderDocuments(categories);

    if (data.link?.termsText) {
      termsSection.style.display = "block";
      termsText.textContent = data.link.termsText;
    }

    serviceAgreementRequired = false;
    signatureRequired = false;
    const agreement = data.link?.serviceAgreement || null;
    if (agreement?.url && serviceAgreementSection) {
      if (serviceAgreementTopCheck) serviceAgreementTopCheck.style.display = "none";
      if (serviceAgreementSignedCheck) serviceAgreementSignedCheck.style.display = "none";
      serviceAgreementSection.style.display = "block";
      if (serviceAgreementDownload) serviceAgreementDownload.href = agreement.url;
      if (serviceAgreementName) {
        serviceAgreementName.textContent = agreement.fileName
          ? `Agreement: ${agreement.fileName}`
          : "Review the service agreement below.";
      }
      const signedDoc = agreement.signedDoc || null;
      if (signedDoc?.url) {
        if (serviceAgreementSignedDownload) serviceAgreementSignedDownload.style.display = "none";
        if (serviceAgreementSignedCheck) serviceAgreementSignedCheck.style.display = "inline-flex";
        if (serviceAgreementTopCheck) serviceAgreementTopCheck.style.display = "inline-flex";
        if (serviceAgreementStatus) {
          const signedAt = signedDoc.signedAt ? new Date(signedDoc.signedAt).toLocaleString() : "";
          serviceAgreementStatus.textContent = signedAt ? `Signed on ${signedAt}.` : "Signed agreement on file.";
        }
        if (serviceAgreementAck) serviceAgreementAck.checked = true;
        if (serviceAgreementAckRow) serviceAgreementAckRow.style.display = "none";
      } else {
        serviceAgreementRequired = true;
        if (serviceAgreementSignedDownload) serviceAgreementSignedDownload.style.display = "none";
        if (serviceAgreementSignedCheck) serviceAgreementSignedCheck.style.display = "none";
        if (serviceAgreementTopCheck) serviceAgreementTopCheck.style.display = "none";
        if (serviceAgreementStatus) {
          serviceAgreementStatus.textContent = "Please review and acknowledge the service agreement below.";
        }
        if (serviceAgreementAck) {
          serviceAgreementAck.checked = false;
          serviceAgreementAck.disabled = false;
        }
        if (serviceAgreementAckRow) serviceAgreementAckRow.style.display = "flex";
      }
    }

    signatureRequired = !!data.link?.requireEsignature || serviceAgreementRequired;
    if (signatureSection) signatureSection.style.display = signatureRequired ? "block" : "none";
    if (signatureTitle) {
      signatureTitle.textContent = serviceAgreementRequired ? "Service agreement signature" : "E-signature";
    }

  } catch (err) {
    linkBanner.textContent = err?.message ? String(err.message) : "Unable to load link.";
    setFormDisabled(true);
  }
}

function setupSignatureCanvas() {
  if (!signatureCanvas) return;
  const ctx = signatureCanvas.getContext("2d");
  ctx.strokeStyle = "#1f2937";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  let drawing = false;
  const getPoint = (evt) => {
    const rect = signatureCanvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const start = (evt) => {
    drawing = true;
    signatureActive = true;
    const pt = getPoint(evt);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const move = (evt) => {
    if (!drawing) return;
    const pt = getPoint(evt);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const end = () => {
    drawing = false;
  };

  signatureCanvas.addEventListener("mousedown", start);
  signatureCanvas.addEventListener("mousemove", move);
  signatureCanvas.addEventListener("mouseup", end);
  signatureCanvas.addEventListener("mouseleave", end);
  signatureCanvas.addEventListener("touchstart", start);
  signatureCanvas.addEventListener("touchmove", move);
  signatureCanvas.addEventListener("touchend", end);

  clearSignatureBtn?.addEventListener("click", () => {
    ctx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
    signatureActive = false;
  });
}

addLineItemBtn?.addEventListener("click", () => {
  lineItems.push({
    lineItemId: null,
    typeId: null,
    bundleId: null,
    unitDescription: "",
    startLocal: "",
    endLocal: "",
    rateBasis: null,
    rateAmount: null,
    billableUnits: null,
    lineAmount: null,
  });
  renderLineItems();
});

lineItemsEl?.addEventListener("change", (evt) => {
  const card = evt.target.closest(".line-item-card");
  if (!card) return;
  const index = Number(card.dataset.index);
  if (!Number.isFinite(index)) return;
  const field = evt.target.dataset.field;
  if (!field) return;
  const li = lineItems[index];
  if (!li) return;
  if (field === "typeId") {
    li.typeId = evt.target.value ? Number(evt.target.value) : null;
    li.bundleId = null;
    li.rateBasis = null;
    li.rateAmount = null;
    li.billableUnits = null;
    li.lineAmount = null;
    renderLineItems();
    return;
  } else if (field === "startLocal") {
    li.startLocal = evt.target.value || "";
  } else if (field === "endLocal") {
    li.endLocal = evt.target.value || "";
  }
});

lineItemsEl?.addEventListener("click", (evt) => {
  const btn = evt.target.closest("button[data-action='remove']");
  if (!btn) return;
  const card = evt.target.closest(".line-item-card");
  if (!card) return;
  const index = Number(card.dataset.index);
  lineItems.splice(index, 1);
  ensureLineItem();
  renderLineItems();
});

contactCategoriesContainer?.addEventListener("click", (e) => {
  const addBtn = e.target.closest?.("[data-add-contact-category]");
  if (addBtn) {
    e.preventDefault();
    const key = addBtn.getAttribute("data-add-contact-category");
    const list = contactCategoryLists.get(String(key || ""));
    if (list) addContactRow(list, {}, { focus: true });
    return;
  }

  const removeBtn = e.target.closest(".contact-remove");
  if (!removeBtn) return;
  const row = removeBtn.closest(".contact-row");
  const list = row?.parentElement || null;
  if (row) row.remove();
  updateContactRemoveButtons(list);
});

addEmergencyContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(emergencyContactsList, {}, { focus: true });
});

emergencyContactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest(".contact-remove");
  if (!btn) return;
  const row = btn.closest(".contact-row");
  if (!row) return;
  row.remove();
  updateContactRemoveButtons(emergencyContactsList);
});

addSiteContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(siteContactsList, {}, { focus: true });
});

siteContactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest(".contact-remove");
  if (!btn) return;
  const row = btn.closest(".contact-row");
  if (!row) return;
  row.remove();
  updateContactRemoveButtons(siteContactsList);
});

fulfillmentSelect?.addEventListener("change", () => {
  if (!dropoffInput) return;
  const method = fulfillmentSelect.value === "dropoff" ? "dropoff" : "pickup";
  if (method === "pickup") {
    lastDropoffAddress = String(dropoffInput.value || "").trim();
    dropoffInput.value = pickupAddress || "";
    dropoffInput.readOnly = true;
  } else {
    dropoffInput.readOnly = false;
    dropoffInput.value = lastDropoffAddress || originalDropoffAddress || "";
  }
});

siteAddressInput?.addEventListener("input", () => {
  if (siteAddressInputLock) return;
  siteAddressLat = null;
  siteAddressLng = null;
  siteAddressQuery = "";
});

notificationOtherCheckbox?.addEventListener("change", () => {
  toggleNotificationOther();
});

if (generalNotesEditor) {
  generalNotesEditor.addEventListener("input", () => {
    storeGeneralNotesSelection();
    if (generalNotesInput) generalNotesInput.value = generalNotesEditor.innerHTML;
  });
  generalNotesEditor.addEventListener("keyup", storeGeneralNotesSelection);
  generalNotesEditor.addEventListener("mouseup", storeGeneralNotesSelection);
  generalNotesEditor.addEventListener("blur", () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (generalNotesToolbar && active && generalNotesToolbar.contains(active)) return;
      setGeneralNotesHtml(generalNotesEditor.innerHTML);
    });
  });
}

if (generalNotesToolbar) {
  generalNotesToolbar.addEventListener("mousedown", (e) => {
    storeGeneralNotesSelection();
    const btn = e.target.closest?.("[data-rich-cmd],[data-rich-action]");
    if (btn) e.preventDefault();
  });
  generalNotesToolbar.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-rich-cmd],[data-rich-action]");
    if (!btn) return;
    e.preventDefault();
    const command = btn.getAttribute("data-rich-cmd");
    if (command) {
      execGeneralNotesCommand(command);
      return;
    }
    const action = btn.getAttribute("data-rich-action");
    if (action === "link") {
      const url = window.prompt("Enter link URL");
      if (url) execGeneralNotesCommand("createLink", url);
      return;
    }
    if (action === "clear") {
      execGeneralNotesCommand("removeFormat");
      return;
    }
    if (action === "image") {
      generalNotesInsertMode = "inline";
      storeGeneralNotesSelection();
      generalNotesImagesInput?.click();
    }
  });

  generalNotesToolbar.addEventListener("change", (e) => {
    const target = e.target;
    if (!target || !target.matches) return;
    if (target.matches('[data-rich="font"]')) {
      const value = target.value;
      if (value) execGeneralNotesCommand("fontName", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="size"]')) {
      const value = target.value;
      if (value) execGeneralNotesCommand("fontSize", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="block"]')) {
      const value = target.value;
      if (value) {
        const block = value.startsWith("<") ? value : `<${value}>`;
        execGeneralNotesCommand("formatBlock", block);
      }
      target.value = "";
    }
  });
}

generalNotesImagesInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target?.files || []);
  const insertInline = generalNotesInsertMode === "inline";
  generalNotesInsertMode = null;
  if (!files.length) return;
  const companyId = linkData?.company?.id;
  if (!companyId) {
    setGeneralNotesImagesStatus("Company information is missing.");
    if (generalNotesImagesInput) generalNotesImagesInput.value = "";
    return;
  }
  generalNotesUploadsInFlight += files.length;
  setGeneralNotesImagesStatus(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);

  const results = await Promise.allSettled(
    files.map(async (file) => {
      const prepared = await convertImageToWebpFile(file);
      const url = await uploadImage({ companyId, file: prepared });
      return {
        id: makeImageId("general"),
        url,
        fileName: prepared.name || "Photo",
        mime: prepared.type || "",
        sizeBytes: Number.isFinite(prepared.size) ? prepared.size : null,
      };
    })
  );

  const uploaded = [];
  const failures = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") uploaded.push(result.value);
    else failures.push(result.reason);
  });

  generalNotesUploadsInFlight = Math.max(0, generalNotesUploadsInFlight - files.length);
  if (uploaded.length) {
    generalNotesImages = generalNotesImages.concat(uploaded);
    renderGeneralNotesPreviews();
    if (insertInline) {
      uploaded.forEach((img) => {
        insertGeneralNotesImage(img.url, img.fileName || "General notes image");
      });
    }
  }
  if (failures.length) {
    setGeneralNotesImagesStatus(failures[0]?.message || "Some uploads failed.");
  } else {
    setGeneralNotesImagesStatus(uploaded.length ? "Images added." : "No images uploaded.");
  }
  if (generalNotesImagesInput) generalNotesImagesInput.value = "";
});

generalNotesPreviews?.addEventListener("click", async (e) => {
  const btn = e.target?.closest?.("[data-remove-general-notes]");
  if (!btn) return;
  const id = btn.getAttribute("data-remove-general-notes");
  if (!id) return;
  const companyId = linkData?.company?.id;
  const target = generalNotesImages.find((img) => String(img.id) === String(id));
  generalNotesImages = generalNotesImages.filter((img) => String(img.id) !== String(id));
  renderGeneralNotesPreviews();
  if (companyId && target?.url) {
    await deleteImage({ companyId, url: target.url }).catch(() => {});
  }
  setGeneralNotesImagesStatus("Image removed.");
});

if (coverageSlotsContainer) {
  coverageSlotsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-coverage-action]");
    if (!btn) return;
    const row = btn.closest?.("[data-coverage-slot]");
    if (!row) return;
    const action = btn.dataset.coverageAction;
    if (action === "remove") {
      row.remove();
      if (!coverageSlotsContainer.querySelector("[data-coverage-slot]")) {
        addCoverageSlotRow({});
      }
      return;
    }
    if (action === "duplicate") {
      const slot = readCoverageSlotFromRow(row);
      if (!slot) return;
      addCoverageSlotRow(slot, { afterRow: row });
      return;
    }
    if (action === "copy") {
      const panel = row.querySelector("[data-coverage-copy]");
      if (panel) panel.hidden = !panel.hidden;
      return;
    }
    if (action === "cancel-copy") {
      const panel = row.querySelector("[data-coverage-copy]");
      if (panel) {
        panel.hidden = true;
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.checked = false;
        });
      }
      return;
    }
    if (action === "apply-copy") {
      const slot = normalizeCoverageSlot(readCoverageSlotFromRow(row));
      if (!slot) return;
      const panel = row.querySelector("[data-coverage-copy]");
      const selected = Array.from(panel?.querySelectorAll('input[type="checkbox"]:checked') || []).map((cb) => cb.value);
      if (!selected.length) return;
      const offset = (coverageDayIndex(slot.endDay) - coverageDayIndex(slot.startDay) + coverageDayKeys.length) % coverageDayKeys.length;
      const existingKeys = new Set(collectCoverageHoursFromInputs().map((s) => coverageSlotKey(s)));
      selected.forEach((day) => {
        const startDay = coerceCoverageDay(day);
        if (!startDay) return;
        const endDay = addCoverageDayOffset(startDay, offset);
        const nextSlot = { startDay, startTime: slot.startTime, endDay, endTime: slot.endTime };
        const key = coverageSlotKey(nextSlot);
        if (existingKeys.has(key)) return;
        existingKeys.add(key);
        addCoverageSlotRow(nextSlot);
      });
      if (panel) {
        panel.hidden = true;
        panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.checked = false;
        });
      }
    }
  });
}

addCoverageSlotBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addCoverageSlotRow({});
});

openSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openSideAddressPicker();
});

closeSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSideAddressPickerModal();
});

saveSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveSideAddressFromPicker();
});

sideAddressPickerModal?.addEventListener("click", (e) => {
  if (e.target === sideAddressPickerModal) closeSideAddressPickerModal();
});

if (sideAddressPickerMapStyle) {
  setSideAddressPickerMapStyle(sideAddressPickerMapStyle.value);
  sideAddressPickerMapStyle.addEventListener("change", () => {
    setSideAddressPickerMapStyle(sideAddressPickerMapStyle.value);
  });
}

sideAddressUnitSelect?.addEventListener("change", () => {
  updateSideAddressUnitMeta();
  updateSideAddressUnitPinActions();
  const unitId = getSelectedSideAddressUnitId();
  if (!unitId) return;
  const entry = sideAddressPicker.unitMarkerData.get(String(unitId));
  if (!entry || !Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) return;
  if (sideAddressPicker.google.map) {
    sideAddressPicker.google.map.setCenter({ lat: entry.lat, lng: entry.lng });
    sideAddressPicker.google.map.setZoom(17);
  }
});

saveSideAddressUnitPinBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveSideAddressUnitPinForSelectedUnit();
});

clearSideAddressUnitBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  clearSideAddressUnitSelection();
});

form?.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  if (!linkData || !token) return;
  linkHint.textContent = "";
  submitBtn.disabled = true;
  submissionComplete = false;

  try {
    if (generalNotesUploadsInFlight > 0) {
      throw new Error("Wait for image uploads to finish.");
    }
    if (lineItemsSection.style.display !== "none") {
      const invalid = lineItems.some((li) => !li.typeId || !li.startLocal || !li.endLocal);
      if (invalid) {
        throw new Error("Please complete all line item fields.");
      }
    }
    const fulfillmentMethod = fulfillmentSelect.value === "dropoff" ? "dropoff" : "pickup";
    const dropoffAddress =
      fulfillmentMethod === "dropoff"
        ? dropoffInput.value.trim()
        : String(lastDropoffAddress || originalDropoffAddress || "").trim();
    const { contacts, accountingContacts, contactGroups } = collectContactCategoryPayload();
    const primaryContact = contacts[0] || {};
    const originalNotes = getGeneralNotesHtml().trim();
    const convertedNotes = await convertInlineImagesToWebpHtml(originalNotes);
    if (convertedNotes !== originalNotes) setGeneralNotesHtml(convertedNotes);
    const payload = {
      customer: {
        companyName: companyNameInput.value.trim(),
        contactName: String(primaryContact.name || "").trim(),
        email: String(primaryContact.email || "").trim(),
        phone: String(primaryContact.phone || "").trim(),
        contacts,
        accountingContacts,
        contactGroups,
        streetAddress: streetInput.value.trim(),
        city: cityInput.value.trim(),
        region: regionInput.value.trim(),
        postalCode: postalInput.value.trim(),
        country: countryInput.value.trim(),
      },
      order: orderSection.style.display !== "none" ? {
        customerPo: customerPoInput.value.trim(),
        fulfillmentMethod,
        dropoffAddress,
        logisticsInstructions: logisticsInstructionsInput?.value.trim() || "",
        siteName: siteNameInput?.value.trim() || "",
        siteAddress: siteAddressInput.value.trim(),
        ...(Number.isFinite(siteAddressLat) ? { siteAddressLat } : {}),
        ...(Number.isFinite(siteAddressLng) ? { siteAddressLng } : {}),
        ...(siteAddressQuery ? { siteAddressQuery } : {}),
        siteAccessInfo: siteAccessInfoInput?.value.trim() || "",
        criticalAreas: criticalAreasInput?.value.trim() || "",
        monitoringPersonnel: monitoringPersonnelInput?.value.trim() || "",
        generalNotes: convertedNotes.trim(),
        notificationCircumstances: collectNotificationCircumstances(),
        coverageHours: collectCoverageHoursFromInputs(),
        coverageTimeZone: getCoverageTimeZoneInputValue(),
        coverageStatHolidaysRequired: coverageStatHolidaysCheckbox?.checked === true,
        emergencyContacts: collectContacts(emergencyContactsList),
        emergencyContactInstructions: emergencyContactInstructionsInput?.value.trim() || "",
        siteContacts: collectContacts(siteContactsList),
      } : {},
      lineItems: lineItemsSection.style.display !== "none" ? lineItems.map((li) => ({
        lineItemId: li.lineItemId || null,
        typeId: li.typeId || null,
        bundleId: li.bundleId || null,
        startAt: fromLocalInputValue(li.startLocal),
        endAt: fromLocalInputValue(li.endLocal),
      })) : [],
    };

    if (orderSection.style.display !== "none" && rentalInfoFields?.generalNotes?.enabled !== false && generalNotesImages.length) {
      payload.order.generalNotesImages = generalNotesImages.map((img) => ({
        url: img.url,
        fileName: img.fileName,
        mime: img.mime || null,
        sizeBytes: img.sizeBytes ?? null,
      }));
    }

    if (serviceAgreementRequired && serviceAgreementAck && !serviceAgreementAck.checked) {
      throw new Error("Please confirm the service agreement.");
    }
    if (signatureRequired && (!signatureName.value.trim() || !signatureActive)) {
      throw new Error("Please provide your typed name and drawn signature.");
    }

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    formData.append("docCategoryMap", JSON.stringify(docCategoryMap));
    if (serviceAgreementAck) {
      formData.append("serviceAgreementAck", serviceAgreementAck.checked ? "true" : "false");
    }
    if (signatureSection.style.display !== "none") {
      formData.append("signatureName", signatureName.value.trim());
      formData.append("signatureData", signatureCanvas.toDataURL("image/png"));
    }

    Object.keys(docCategoryMap).forEach((slug) => {
      const input = document.getElementById(`doc-${slug}`);
      if (!input || !input.files || !input.files.length) return;
      Array.from(input.files).forEach((file) => {
        formData.append(`doc_${slug}`, file);
      });
    });

    const res = await fetch(`/api/public/customer-links/${encodeURIComponent(token)}/submit`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to submit update.");

    submissionComplete = true;
    linkBanner.textContent = "Thank you! Your submission has been received.";
    linkHint.textContent = "Your update is pending review. This link is now closed.";
    proofActions.style.display = "flex";
    downloadProof.href = data.proofUrl || `/api/public/customer-links/${encodeURIComponent(token)}/proof`;
    setFormDisabled(true);
  } catch (err) {
    linkHint.textContent = err?.message ? String(err.message) : "Unable to submit update.";
  } finally {
    if (!submissionComplete) submitBtn.disabled = false;
  }
});

setupSignatureCanvas();
renderGeneralNotesPreviews();
loadLink();
