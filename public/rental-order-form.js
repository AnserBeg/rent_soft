const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const initialOrderId = params.get("id");
const selectedCustomerIdParam = params.get("selectedCustomerId");
const initialStatusParam = params.get("status");
const fromParam = params.get("from");
const blankParam = params.get("blank");
const startBlank =
  !initialOrderId && ["1", "true", "yes"].includes(String(blankParam || "").trim().toLowerCase());

const companyMeta = document.getElementById("company-meta");
const backToList = document.getElementById("back-to-list");

const modeLabel = document.getElementById("mode-label");
const formTitle = document.getElementById("form-title");
const saveOrderBtn = document.getElementById("save-order");
const statusSelect = document.getElementById("status-select");
const roStatusLabel = document.getElementById("ro-status-label");
const quoteActions = document.getElementById("quote-actions");
const quoteReserveBtn = document.getElementById("quote-reserve");
const quoteRejectBtn = document.getElementById("quote-reject");
const quoteUndoBtn = document.getElementById("quote-undo");
const requestActions = document.getElementById("request-actions");
const requestApproveBtn = document.getElementById("request-approve");
const requestRejectBtn = document.getElementById("request-reject");
const requestUndoBtn = document.getElementById("request-undo");
const requestRejectModal = document.getElementById("request-reject-modal");
const closeRequestRejectModalBtn = document.getElementById("close-request-reject-modal");
const cancelRequestRejectBtn = document.getElementById("cancel-request-reject");
const confirmRequestRejectBtn = document.getElementById("confirm-request-reject");
const requestRejectNoteInput = document.getElementById("request-reject-note");
const requestRejectHint = document.getElementById("request-reject-hint");
const closeOpenBtn = document.getElementById("close-open");
const statusPill = document.getElementById("status-pill");
const orderNumberPill = document.getElementById("order-number-pill");
const downloadOrderPdfBtn = document.getElementById("download-order-pdf");
const openHistoryBtn = document.getElementById("open-history");
const openInvoicesBtn = document.getElementById("open-invoices");
const rentalOrderInvoicesTable = document.getElementById("rental-order-invoices-table");
const rentalOrderInvoicesMeta = document.getElementById("rental-order-invoices-meta");

function setCompanyMeta(message) {
  if (!companyMeta) return;
  const msg = String(message || "").trim();
  companyMeta.textContent = msg;
  companyMeta.style.display = msg ? "block" : "none";
}

setCompanyMeta("");

const customerSelect = document.getElementById("customer-select");
const customerPoInput = document.getElementById("customer-po");
const salesSelect = document.getElementById("sales-select");
const customerDetailsEl = document.getElementById("customer-details");
const emergencyContactsList = document.getElementById("emergency-contacts-list");
const addEmergencyContactRowBtn = document.getElementById("add-emergency-contact-row");
const siteContactsList = document.getElementById("site-contacts-list");
const addSiteContactRowBtn = document.getElementById("add-site-contact-row");
const fulfillmentSelects = [
  document.getElementById("fulfillment-select"),
  document.getElementById("fulfillment-select-2"),
].filter(Boolean);
const pickupLocationSelects = [
  document.getElementById("pickup-location-select"),
  document.getElementById("pickup-location-select-2"),
].filter(Boolean);
const fulfillmentAddresses = [
  document.getElementById("fulfillment-address"),
  document.getElementById("fulfillment-address-2"),
].filter(Boolean);

const logisticsInstructions = document.getElementById("logistics-instructions");
const termsInput = document.getElementById("terms");
const specialInstructions = document.getElementById("special-instructions");
const siteAddressInput = document.getElementById("site-address");
const criticalAreasInput = document.getElementById("critical-areas");
const generalNotesInput = document.getElementById("general-notes");
const rentalInfoFieldContainers = {
  siteAddress: document.querySelector('[data-rental-info-field="siteAddress"]'),
  criticalAreas: document.querySelector('[data-rental-info-field="criticalAreas"]'),
  generalNotes: document.querySelector('[data-rental-info-field="generalNotes"]'),
  emergencyContacts: document.querySelector('[data-rental-info-field="emergencyContacts"]'),
  siteContacts: document.querySelector('[data-rental-info-field="siteContacts"]'),
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
const coverageDayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const coverageInputs = {
  mon: {
    start: document.getElementById("coverage-mon-start"),
    end: document.getElementById("coverage-mon-end"),
  },
  tue: {
    start: document.getElementById("coverage-tue-start"),
    end: document.getElementById("coverage-tue-end"),
  },
  wed: {
    start: document.getElementById("coverage-wed-start"),
    end: document.getElementById("coverage-wed-end"),
  },
  thu: {
    start: document.getElementById("coverage-thu-start"),
    end: document.getElementById("coverage-thu-end"),
  },
  fri: {
    start: document.getElementById("coverage-fri-start"),
    end: document.getElementById("coverage-fri-end"),
  },
  sat: {
    start: document.getElementById("coverage-sat-start"),
    end: document.getElementById("coverage-sat-end"),
  },
  sun: {
    start: document.getElementById("coverage-sun-start"),
    end: document.getElementById("coverage-sun-end"),
  },
};
const termsPanel = document.getElementById("terms-panel");
const toggleTermsBtn = document.getElementById("toggle-terms");
const extrasNotesBadge = document.getElementById("extras-notes-badge");
const extrasFilesBadge = document.getElementById("extras-files-badge");
const extrasTermsBadge = document.getElementById("extras-terms-badge");

const addLineItemBtn = document.getElementById("add-line-item");
const lineItemsEl = document.getElementById("line-items");

const openFeesBtn = document.getElementById("open-fees");
const feesEl = document.getElementById("fees");
const feeTotalInlineEl = document.getElementById("fee-total-inline");
const feeTotalModalEl = document.getElementById("fee-total-modal");
const orderSubtotalEl = document.getElementById("order-subtotal");
const orderGstEl = document.getElementById("order-gst");
const orderTotalEl = document.getElementById("order-total");
const ratePeriodTotalsEl = document.getElementById("rate-period-totals");
const ratePeriodTotalsBodyEl = document.getElementById("rate-period-totals-body");

const feesModal = document.getElementById("fees-modal");
const closeFeesModalBtn = document.getElementById("close-fees-modal");

const lineItemDocsModal = document.getElementById("lineitem-docs-modal");
const closeLineItemDocsModalBtn = document.getElementById("close-lineitem-docs-modal");
const lineItemDocsSubtitle = document.getElementById("lineitem-docs-subtitle");
const lineItemBeforeNotes = document.getElementById("lineitem-before-notes");
const lineItemAfterNotes = document.getElementById("lineitem-after-notes");
const lineItemBeforeUpload = document.getElementById("lineitem-before-upload");
const lineItemAfterUpload = document.getElementById("lineitem-after-upload");
const lineItemBeforeThumbs = document.getElementById("lineitem-before-thumbs");
const lineItemAfterThumbs = document.getElementById("lineitem-after-thumbs");
const lineItemAiReportHint = document.getElementById("lineitem-ai-report-hint");
const lineItemAiGenerateBtn = document.getElementById("lineitem-ai-generate");
const lineItemAiCopyBtn = document.getElementById("lineitem-ai-copy");
const lineItemAiClearBtn = document.getElementById("lineitem-ai-clear");
const lineItemAiReport = document.getElementById("lineitem-ai-report");

const lineItemTimeModal = document.getElementById("lineitem-time-modal");
const closeLineItemTimeModalBtn = document.getElementById("close-lineitem-time-modal");
const lineItemStartInput = document.getElementById("lineitem-start");
const lineItemEndInput = document.getElementById("lineitem-end");
const lineItemTimeSaveBtn = document.getElementById("save-lineitem-time");
const lineItemTimeApplyAllBtn = document.getElementById("save-lineitem-time-all");
const lineItemActualModal = document.getElementById("lineitem-actual-modal");
const closeLineItemActualModalBtn = document.getElementById("close-lineitem-actual-modal");
const lineItemActualPickupInput = document.getElementById("lineitem-actual-pickup");
const lineItemActualReturnInput = document.getElementById("lineitem-actual-return");
const lineItemActualHint = document.getElementById("lineitem-actual-hint");
const lineItemActualSaveBtn = document.getElementById("save-lineitem-actual");
const lineItemActualSaveAllBtn = document.getElementById("save-lineitem-actual-all");
const lineItemPauseToggleBtn = document.getElementById("toggle-lineitem-pause");
const lineItemPauseDetails = document.getElementById("lineitem-pause-details");
const lineItemPauseStartInput = document.getElementById("lineitem-pause-start");
const lineItemPauseEndInput = document.getElementById("lineitem-pause-end");
const lineItemPauseAddBtn = document.getElementById("add-lineitem-pause");
const lineItemPauseList = document.getElementById("lineitem-pause-list");

const openNoteModalBtn = document.getElementById("open-note-modal");
const noteUserInput = document.getElementById("note-user");
const noteTextInput = document.getElementById("note-text");
const saveNoteBtn = document.getElementById("save-note");
const noteHint = document.getElementById("note-hint");
const notesList = document.getElementById("notes-list");

const openAttachmentModalBtn = document.getElementById("open-attachment-modal");
const attachmentFile = document.getElementById("attachment-file");
const uploadAttachmentBtn = document.getElementById("upload-attachment");
const attachmentHint = document.getElementById("attachment-hint");
const attachmentsList = document.getElementById("attachments-list");

const extrasDrawerOverlay = document.getElementById("extras-drawer-overlay");
const extrasDrawer = document.getElementById("extras-drawer");
const extrasDrawerSubtitle = document.getElementById("extras-drawer-subtitle");
const closeExtrasDrawerBtn = document.getElementById("close-extras-drawer");
const extrasTabButtons = Array.from(extrasDrawer?.querySelectorAll?.("[data-tab]") || []);
const extrasPanels = Array.from(extrasDrawer?.querySelectorAll?.("[data-panel]") || []);

const salesModal = document.getElementById("sales-modal");
const closeSalesModalBtn = document.getElementById("close-sales-modal");
const salesForm = document.getElementById("sales-form");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let editingOrderId = initialOrderId ? Number(initialOrderId) : null;
let editingLineItemTempId = null;
let editingLineItemTimeTempId = null;
let editingLineItemActualTempId = null;

let customersCache = [];
let customerPricingByTypeId = new Map();
let salesCache = [];
let typesCache = [];
let locationsCache = [];
let equipmentCache = [];
let bundlesCache = [];
let emergencyContactOptions = [];
let siteContactOptions = [];
let billingRoundingMode = "ceil";
let billingRoundingGranularity = "unit";
let monthlyProrationMethod = "hours";
let billingTimeZone = "UTC";
let invoiceAutoRun = "off";
let invoiceAutoMode = "auto";
let autoWorkOrderOnReturn = false;
let rentalInfoFields = null;

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  siteContacts: { enabled: true, required: true },
  coverageHours: { enabled: true, required: true },
};

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
}
let rentalOrderInvoicesCache = [];
let sideAddressPicker = {
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
let sideAddressInputBound = false;

let draft = {
  status: "quote",
  quoteNumber: null,
  roNumber: null,
  customerId: null,
  customerPo: "",
  salespersonId: null,
  fulfillmentMethod: "pickup",
  pickupLocationId: null,
  dropoffAddress: "",
  logisticsInstructions: "",
  terms: "",
  specialInstructions: "",
  siteAddress: "",
  siteAddressLat: null,
  siteAddressLng: null,
  siteAddressQuery: "",
  criticalAreas: "",
  generalNotes: "",
  coverageHours: {},
  emergencyContacts: [],
  siteContacts: [],
  lineItems: [],
  fees: [],
  isOverdue: false,
};

function resetDraftForNew() {
  draft = {
    status: "quote",
    quoteNumber: null,
    roNumber: null,
    customerId: null,
    customerPo: "",
    salespersonId: null,
    fulfillmentMethod: "pickup",
    pickupLocationId: null,
    dropoffAddress: "",
    logisticsInstructions: "",
    terms: "",
    specialInstructions: "",
    siteAddress: "",
    siteAddressLat: null,
    siteAddressLng: null,
    siteAddressQuery: "",
    criticalAreas: "",
    generalNotes: "",
    coverageHours: {},
    emergencyContacts: [],
    siteContacts: [],
    lineItems: [],
    fees: [],
    isOverdue: false,
  };
}

function normalizeCoverageHours(value) {
  let raw = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = {};
    }
  }
  const normalized = {};
  coverageDayKeys.forEach((day) => {
    const entry = raw[day] || {};
    const start = typeof entry.start === "string" ? entry.start.trim() : "";
    const end = typeof entry.end === "string" ? entry.end.trim() : "";
    if (!start && !end) return;
    normalized[day] = { start, end };
  });
  return normalized;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
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

function closeSideAddressPickerModal() {
  sideAddressPickerModal?.classList.remove("show");
  if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "";
  if (sideAddressPickerSearch) sideAddressPickerSearch.value = "";
  if (sideAddressPickerInput) sideAddressPickerInput.value = "";
  if (sideAddressPickerSuggestions) sideAddressPickerSuggestions.hidden = true;
  if (sideAddressPickerSuggestions) sideAddressPickerSuggestions.replaceChildren();
  sideAddressPicker.selected = null;
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

function renderSideAddressSuggestions(predictions, onPick) {
  if (!sideAddressPickerSuggestions) return;
  sideAddressPickerSuggestions.replaceChildren();
  const rows = Array.isArray(predictions) ? predictions : [];
  if (!rows.length) {
    sideAddressPickerSuggestions.hidden = true;
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
    sideAddressPickerSuggestions.appendChild(btn);
  });
  sideAddressPickerSuggestions.hidden = false;
}

function hideSideAddressSuggestions() {
  if (!sideAddressPickerSuggestions) return;
  sideAddressPickerSuggestions.hidden = true;
  sideAddressPickerSuggestions.replaceChildren();
}

function bindSideAddressSearchMirror() {
  if (!sideAddressPickerInput || !sideAddressPickerSearch || sideAddressInputBound) return;
  sideAddressInputBound = true;
  sideAddressPickerInput.addEventListener("input", () => {
    const next = String(sideAddressPickerInput.value || "");
    if (sideAddressPickerSearch.value !== next) {
      sideAddressPickerSearch.value = next;
      sideAddressPickerSearch.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
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

function applyLeafletSideAddressStyle(style) {
  const map = sideAddressPicker.leaflet.map;
  if (!map || !window.L) return;
  const normalized = normalizeMapStyle(style ?? sideAddressPicker.mapStyle);
  sideAddressPicker.mapStyle = normalized;
  if (!sideAddressPicker.leaflet.layers) sideAddressPicker.leaflet.layers = {};
  const layers = sideAddressPicker.leaflet.layers;
  if (!layers[normalized]) {
    const cfg = MAP_TILE_SOURCES[normalized];
    layers[normalized] = window.L.tileLayer(cfg.url, cfg.options);
  }
  Object.values(layers).forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  layers[normalized].addTo(map);
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
  if (sideAddressPicker.mode === "google") {
    applyGoogleSideAddressStyle(normalized);
  } else {
    applyLeafletSideAddressStyle(normalized);
  }
}

function applySideAddressPickerDraftSelection() {
  const lat = Number(draft.siteAddressLat);
  const lng = Number(draft.siteAddressLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const label = String(draft.siteAddressQuery || draft.siteAddress || "").trim();

  if (sideAddressPicker.mode === "google" && sideAddressPicker.google.map) {
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
    setSideAddressSelected(lat, lng, { provider: "draft", query: label || null });
    return;
  }

  if (sideAddressPicker.mode === "leaflet" && sideAddressPicker.leaflet.map) {
    const map = sideAddressPicker.leaflet.map;
    if (!sideAddressPicker.leaflet.marker) {
      sideAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      sideAddressPicker.leaflet.marker.on("dragend", () => {
        const ll = sideAddressPicker.leaflet.marker?.getLatLng?.();
        if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
        setSideAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
      });
    } else {
      sideAddressPicker.leaflet.marker.setLatLng([lat, lng]);
    }
    map.setView([lat, lng], 17);
    setSideAddressSelected(lat, lng, { provider: "draft", query: label || null });
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

function resetSideAddressPickerMapContainer() {
  if (!sideAddressPickerMapEl) return;
  try {
    sideAddressPicker.leaflet.map?.remove?.();
  } catch {}
  sideAddressPicker.leaflet.map = null;
  sideAddressPicker.leaflet.marker = null;
  sideAddressPicker.leaflet.layers = null;

  sideAddressPicker.google.map = null;
  sideAddressPicker.google.marker = null;
  sideAddressPicker.google.autocomplete = null;

  if (sideAddressPickerMapEl._leaflet_id) {
    delete sideAddressPickerMapEl._leaflet_id;
  }
  sideAddressPickerMapEl.replaceChildren();
}

function initLeafletSideAddressPicker(center) {
  if (!sideAddressPickerMapEl || !window.L) throw new Error("Map library not available.");
  if (!sideAddressPicker.leaflet.map) {
    const map = window.L.map(sideAddressPickerMapEl, { scrollWheelZoom: true });
    map.on("click", (e) => {
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!sideAddressPicker.leaflet.marker) {
        sideAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        sideAddressPicker.leaflet.marker.on("dragend", () => {
          const ll = sideAddressPicker.leaflet.marker?.getLatLng?.();
          if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
          setSideAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
        });
      } else {
        sideAddressPicker.leaflet.marker.setLatLng([lat, lng]);
      }
      setSideAddressSelected(lat, lng, { provider: "manual_pin" });
    });
    sideAddressPicker.leaflet.map = map;
  }
  applyLeafletSideAddressStyle(sideAddressPicker.mapStyle);
  const map = sideAddressPicker.leaflet.map;
  map.setView([center.lat, center.lng], 16);
  setTimeout(() => map.invalidateSize?.(), 50);

  if (!sideAddressPicker.leaflet.searchBound && sideAddressPickerSearch) {
    sideAddressPicker.leaflet.searchBound = true;
    sideAddressPickerSearch.addEventListener("input", () => {
      const q = String(sideAddressPickerSearch.value || "").trim();
      if (!q) {
        hideSideAddressSuggestions();
        return;
      }
      if (sideAddressPicker.leaflet.debounceTimer) clearTimeout(sideAddressPicker.leaflet.debounceTimer);
      sideAddressPicker.leaflet.debounceTimer = setTimeout(async () => {
        const seq = (sideAddressPicker.leaflet.searchSeq || 0) + 1;
        sideAddressPicker.leaflet.searchSeq = seq;
        try {
          sideAddressPicker.leaflet.searchAbort?.abort?.();
        } catch {}
        sideAddressPicker.leaflet.searchAbort = new AbortController();
        try {
          const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}&limit=6`, {
            signal: sideAddressPicker.leaflet.searchAbort.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Unable to search address.");
          if (seq !== sideAddressPicker.leaflet.searchSeq) return;
          if (String(sideAddressPickerSearch.value || "").trim() !== q) return;
          const results = (data.results || []).map((r) => ({
            place_id: null,
            description: r.label,
            __rs_lat: r.latitude,
            __rs_lng: r.longitude,
          }));
          renderSideAddressSuggestions(results, (picked) => {
            const label = picked?.description || "";
            const lat = Number(picked?.__rs_lat);
            const lng = Number(picked?.__rs_lng);
            hideSideAddressSuggestions();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            if (sideAddressPickerInput) sideAddressPickerInput.value = label || "";
            if (sideAddressPickerSearch) sideAddressPickerSearch.value = label || "";
            if (!sideAddressPicker.leaflet.marker) {
              sideAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
              sideAddressPicker.leaflet.marker.on("dragend", () => {
                const ll = sideAddressPicker.leaflet.marker?.getLatLng?.();
                if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
                setSideAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
              });
            } else {
              sideAddressPicker.leaflet.marker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng], 17);
            setSideAddressSelected(lat, lng, { provider: "nominatim", query: label });
          });
        } catch (err) {
          hideSideAddressSuggestions();
          const msg = err?.message || String(err);
          if (sideAddressPickerMeta) {
            sideAddressPickerMeta.textContent = `${msg}. You can still click the map to drop a pin.`;
          }
        }
      }, 300);
    });
    sideAddressPickerSearch.addEventListener("blur", () => setTimeout(() => hideSideAddressSuggestions(), 150));
  }
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
        sideAddressPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            renderSideAddressSuggestions(preds, async (p) => {
              hideSideAddressSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const details = await fetchPlaceDetails(placeId, label);
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
  if (!activeCompanyId) {
    setCompanyMeta("Log in to continue.");
    return;
  }
  openSideAddressPickerModal();
  if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "Loading map...";
  hideSideAddressSuggestions();
  bindSideAddressSearchMirror();

  if (sideAddressPickerInput && !String(sideAddressPickerInput.value || "").trim()) {
    const existing = String(siteAddressInput?.value || draft.siteAddress || "").trim();
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

  if (key) {
    try {
      if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = "Loading Google Maps...";
      await loadGoogleMaps(key);
      resetSideAddressPickerMapContainer();
      sideAddressPicker.mode = "google";
      initGoogleSideAddressPicker(center);
      if (sideAddressPickerMeta) {
        const places = window.google?.maps?.places;
        const hasSvc = !!places?.AutocompleteService;
        const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
        sideAddressPickerMeta.textContent = msg;
      }
      applySideAddressPickerDraftSelection();
      return;
    } catch (err) {
      if (sideAddressPickerMeta) {
        sideAddressPickerMeta.textContent =
          `Google Maps failed to load: ${err?.message || String(err)}. ` +
          "Falling back to pin-drop. Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
      }
    }
  }

  resetSideAddressPickerMapContainer();
  sideAddressPicker.mode = "leaflet";
  initLeafletSideAddressPicker(center);
  if (sideAddressPickerMeta) {
    sideAddressPickerMeta.textContent =
      key
        ? "Search (OpenStreetMap) or click the map to drop a pin (Google failed to load)."
        : "Search (OpenStreetMap) or click the map to drop a pin.";
  }
  applySideAddressPickerDraftSelection();
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
    draft.siteAddressLat = Number.isFinite(lat) ? lat : null;
    draft.siteAddressLng = Number.isFinite(lng) ? lng : null;
    draft.siteAddressQuery = sideAddressPicker.selected.query ? String(sideAddressPicker.selected.query) : nextValue;
  } else {
    draft.siteAddressLat = null;
    draft.siteAddressLng = null;
    draft.siteAddressQuery = "";
  }
  if (siteAddressInput) siteAddressInput.value = nextValue;
  syncRentalInfoDraft();
  closeSideAddressPickerModal();
}

function collectCoverageHoursFromInputs() {
  const raw = {};
  coverageDayKeys.forEach((day) => {
    const entry = coverageInputs[day] || {};
    raw[day] = {
      start: entry.start ? String(entry.start.value || "").trim() : "",
      end: entry.end ? String(entry.end.value || "").trim() : "",
    };
  });
  return normalizeCoverageHours(raw);
}

function setCoverageInputs(value) {
  const raw = value && typeof value === "object" ? value : {};
  coverageDayKeys.forEach((day) => {
    const entry = raw[day] || {};
    if (coverageInputs[day]?.start) {
      coverageInputs[day].start.value = typeof entry.start === "string" ? entry.start : "";
    }
    if (coverageInputs[day]?.end) {
      coverageInputs[day].end.value = typeof entry.end === "string" ? entry.end : "";
    }
  });
}

function normalizeOrderStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  switch (raw) {
    case "draft":
      return "quote";
    case "quote":
      return "quote";
    case "quote_rejected":
    case "rejected":
      return "quote_rejected";
    case "requested":
    case "request":
      return "requested";
    case "request_rejected":
    case "requested_rejected":
      return "request_rejected";
    case "reservation":
      return "reservation";
    case "ordered":
      return "ordered";
    case "recieved":
      return "received";
    case "received":
      return "received";
    case "closed":
      return "closed";
    default:
      return "quote";
  }
}

function isQuoteStatus(status) {
  const s = normalizeOrderStatus(status);
  return s === "quote" || s === "quote_rejected";
}

function isDemandOnlyStatus(status) {
  const s = normalizeOrderStatus(status);
  return s === "quote" || s === "quote_rejected" || s === "reservation" || s === "requested";
}

function isUnitSelectionLocked(status) {
  const s = normalizeOrderStatus(status);
  return s === "quote" || s === "quote_rejected" || s === "requested";
}

function isUnitSelectionRequired(status) {
  const s = normalizeOrderStatus(status);
  return s === "ordered" || s === "received" || s === "closed";
}

function statusLabel(status) {
  const s = normalizeOrderStatus(status);
  switch (s) {
    case "quote":
      return "Quote";
    case "quote_rejected":
      return "Rejected";
    case "requested":
      return "Requested";
    case "request_rejected":
      return "Request rejected";
    case "reservation":
      return "Reservation";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "closed":
      return "Closed";
    default:
      return s;
  }
}

function computeOverdueFlag() {
  const normalized = normalizeOrderStatus(draft.status);
  if (normalized !== "ordered") return false;
  const now = Date.now();
  for (const li of draft.lineItems || []) {
    if (li.returnedAt) continue;
    const endIso = fromLocalInputValue(li.endLocal || "");
    if (!endIso) continue;
    if (Date.parse(endIso) < now) return true;
  }
  return false;
}

function isRoWorkflowStatus(status) {
  const s = normalizeOrderStatus(status);
  return s === "requested" || s === "reservation" || s === "ordered" || s === "received";
}

function normalizeRateBasis(value) {
  const v = String(value || "").toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly") return v;
  return null;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeContactValue(value) {
  return String(value ?? "").trim();
}

function contactOptionLabel(entry) {
  return [entry?.name, entry?.email, entry?.phone].filter(Boolean).join(" - ") || "Contact";
}

function contactDatalistId(list) {
  if (list === emergencyContactsList) return "emergency-contacts-datalist";
  if (list === siteContactsList) return "site-contacts-datalist";
  return "contacts-datalist";
}

function ensureContactDatalist(list) {
  if (!list) return null;
  const id = contactDatalistId(list);
  let datalist = document.getElementById(id);
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = id;
    list.appendChild(datalist);
  }
  return datalist;
}

function fillContactDatalist(list, options) {
  const datalist = ensureContactDatalist(list);
  if (!datalist) return;
  datalist.innerHTML = "";
  (options || []).forEach((entry, idx) => {
    const opt = document.createElement("option");
    const label = contactOptionLabel(entry);
    opt.value = entry?.name ? String(entry.name) : label;
    opt.label = label;
    opt.dataset.contactIndex = String(idx);
    datalist.appendChild(opt);
  });
}

function updateContactSelectOptions(list, options) {
  if (!list) return;
  fillContactDatalist(list, options);
}

function parseContacts(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
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

function addContactRow(list, { name = "", email = "", phone = "" } = {}, { focus = false } = {}) {
  if (!list) return;
  const row = document.createElement("div");
  row.className = "contact-row";
  row.innerHTML = `
    <label>Contact name <input data-contact-field="name" list="${contactDatalistId(list)}" /></label>
    <label>Email <input data-contact-field="email" type="email" /></label>
    <label>Phone number <input data-contact-field="phone" /></label>
    <button type="button" class="ghost small contact-remove" aria-label="Remove contact">Remove</button>
  `;
  const nameInput = row.querySelector('[data-contact-field="name"]');
  const emailInput = row.querySelector('[data-contact-field="email"]');
  const phoneInput = row.querySelector('[data-contact-field="phone"]');
  if (nameInput) nameInput.value = name;
  if (emailInput) emailInput.value = email;
  if (phoneInput) phoneInput.value = phone;
  const options = list === emergencyContactsList ? emergencyContactOptions : siteContactOptions;
  fillContactDatalist(list, options);
  list.appendChild(row);
  updateContactRemoveButtons(list);
  if (focus && nameInput) nameInput.focus();
}

function setContactRows(list, rows, options = []) {
  if (!list) return;
  list.innerHTML = "";
  const normalized = Array.isArray(rows) && rows.length ? rows : [{ name: "", email: "", phone: "" }];
  normalized.forEach((row) => {
    addContactRow(
      list,
      {
        name: normalizeContactValue(row?.name || row?.contactName || row?.contact_name),
        email: normalizeContactValue(row?.email),
        phone: normalizeContactValue(row?.phone),
      },
      { focus: false }
    );
  });
  updateContactSelectOptions(list, options);
}

function collectContacts(list) {
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll(".contact-row"));
  return rows
    .map((row) => {
      const name = normalizeContactValue(row.querySelector('[data-contact-field="name"]')?.value);
      const email = normalizeContactValue(row.querySelector('[data-contact-field="email"]')?.value);
      const phone = normalizeContactValue(row.querySelector('[data-contact-field="phone"]')?.value);
      if (!name && !email && !phone) return null;
      return { name, email, phone };
    })
    .filter(Boolean);
}

function syncContactDraft() {
  draft.emergencyContacts = collectContacts(emergencyContactsList);
  draft.siteContacts = collectContacts(siteContactsList);
  scheduleDraftSave();
}

function applySavedContactFromName(list, nameInput, options) {
  if (!list || !nameInput) return false;
  const datalistId = nameInput.getAttribute("list");
  if (!datalistId) return false;
  const datalist = document.getElementById(datalistId);
  if (!datalist) return false;
  const match = Array.from(datalist.options).find((opt) => opt.value === nameInput.value);
  if (!match) return false;
  const idx = Number(match.dataset.contactIndex);
  if (!Number.isFinite(idx) || !options?.[idx]) return false;
  const entry = options[idx];
  const row = nameInput.closest(".contact-row");
  if (!row) return false;
  nameInput.value = entry.name || "";
  const emailInput = row.querySelector('[data-contact-field="email"]');
  const phoneInput = row.querySelector('[data-contact-field="phone"]');
  if (emailInput) emailInput.value = entry.email || "";
  if (phoneInput) phoneInput.value = entry.phone || "";
  return true;
}

function suggestedRateAmount({ customerId, typeId, basis }) {
  const rateBasis = normalizeRateBasis(basis);
  if (!customerId || !typeId || !rateBasis) return null;

  const pricing = customerPricingByTypeId.get(String(typeId));
  const type = typesCache.find((t) => String(t.id) === String(typeId));

  const fromCustomer =
    pricing && pricing[`${rateBasis}_rate`] !== null && pricing[`${rateBasis}_rate`] !== undefined
      ? Number(pricing[`${rateBasis}_rate`])
      : null;
  if (fromCustomer !== null && Number.isFinite(fromCustomer)) return fromCustomer;

  const fromType = type && type[`${rateBasis}_rate`] !== null && type[`${rateBasis}_rate`] !== undefined ? Number(type[`${rateBasis}_rate`]) : null;
  if (fromType !== null && Number.isFinite(fromType)) return fromType;

  return null;
}

function findBundle(bundleId) {
  if (!bundleId) return null;
  return bundlesCache.find((b) => String(b.id) === String(bundleId)) || null;
}

function defaultRateBasisForBundle(bundle) {
  if (!bundle) return "daily";
  if (bundle.dailyRate !== null && bundle.dailyRate !== undefined) return "daily";
  if (bundle.weeklyRate !== null && bundle.weeklyRate !== undefined) return "weekly";
  if (bundle.monthlyRate !== null && bundle.monthlyRate !== undefined) return "monthly";
  return "daily";
}

function suggestedBundleRateAmount({ bundleId, basis }) {
  const rateBasis = normalizeRateBasis(basis);
  if (!bundleId || !rateBasis) return null;
  const bundle = findBundle(bundleId);
  if (!bundle) return null;
  if (rateBasis === "weekly") return bundle.weeklyRate ?? null;
  if (rateBasis === "monthly") return bundle.monthlyRate ?? null;
  return bundle.dailyRate ?? null;
}

function defaultRateBasisForType(typeId) {
  const type = typesCache.find((t) => String(t.id) === String(typeId));
  if (!type) return "daily";
  if (type.daily_rate !== null && type.daily_rate !== undefined) return "daily";
  if (type.weekly_rate !== null && type.weekly_rate !== undefined) return "weekly";
  if (type.monthly_rate !== null && type.monthly_rate !== undefined) return "monthly";
  return "daily";
}

async function loadCustomerPricing(customerId) {
  customerPricingByTypeId = new Map();
  if (!activeCompanyId || !customerId) return;
  const res = await fetch(`/api/customers/${customerId}/pricing?companyId=${activeCompanyId}`);
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  (data.pricing || []).forEach((row) => {
    customerPricingByTypeId.set(String(row.type_id), row);
  });
}

async function loadCompanySettings() {
  billingRoundingMode = "ceil";
  billingRoundingGranularity = "unit";
  monthlyProrationMethod = "hours";
  billingTimeZone = "UTC";
  invoiceAutoRun = "off";
  invoiceAutoMode = "auto";
  autoWorkOrderOnReturn = false;
  applyRentalInfoConfig(null);
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.settings?.billing_rounding_mode) {
    billingRoundingMode = normalizeRoundingMode(data.settings.billing_rounding_mode);
  }
  if (res.ok && data.settings?.billing_rounding_granularity) {
    billingRoundingGranularity = normalizeRoundingGranularity(data.settings.billing_rounding_granularity);
  }
  if (res.ok && data.settings?.monthly_proration_method) {
    monthlyProrationMethod = normalizeMonthlyProrationMethod(data.settings.monthly_proration_method);
  }
  if (res.ok && data.settings?.billing_timezone) {
    billingTimeZone = String(data.settings.billing_timezone);
  }
  if (res.ok && data.settings?.invoice_auto_run) {
    invoiceAutoRun = String(data.settings.invoice_auto_run);
  }
  if (res.ok && data.settings?.invoice_auto_mode) {
    invoiceAutoMode = String(data.settings.invoice_auto_mode);
  }
  if (res.ok && data.settings?.auto_work_order_on_return !== undefined) {
    autoWorkOrderOnReturn = data.settings.auto_work_order_on_return === true;
  }
  if (res.ok) {
    applyRentalInfoConfig(data.settings?.rental_info_fields || null);
  }
}

function billingPeriodDays(rateBasis) {
  switch (normalizeRateBasis(rateBasis)) {
    case "weekly":
      return 7;
    case "daily":
    default:
      return 1;
  }
}

function normalizeBillingTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
}

function getTimeZoneParts(date, timeZone) {
  const tz = normalizeBillingTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  if (!Number.isFinite(parts.year)) return 0;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset).toISOString();
}

function daysInMonthUTC(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function splitIntoCalendarMonths({ startAt, endAt, timeZone }) {
  if (!startAt || !endAt) return [];
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const tz = normalizeBillingTimeZone(timeZone);
  const segments = [];
  let cursorIso = start.toISOString();
  const endIso = end.toISOString();
  let guard = 0;
  while (Date.parse(cursorIso) < Date.parse(endIso) && guard < 1200) {
    const cursorDate = new Date(cursorIso);
    const parts = getTimeZoneParts(cursorDate, tz);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextBoundary = zonedTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }, tz);
    if (!nextBoundary) break;
    const nextBoundaryMs = Date.parse(nextBoundary);
    const endMs = Date.parse(endIso);
    const segmentEnd = nextBoundaryMs < endMs ? nextBoundary : endIso;
    if (Date.parse(segmentEnd) <= Date.parse(cursorIso)) break;
    segments.push({
      startAt: cursorIso,
      endAt: segmentEnd,
      daysInMonth: daysInMonthUTC(parts.year, parts.month - 1),
    });
    cursorIso = segmentEnd;
    guard += 1;
  }
  return segments;
}

function computeMonthlyUnits({
  startAt,
  endAt,
  prorationMethod = null,
  roundingMode = null,
  roundingGranularity = null,
  timeZone = null,
} = {}) {
  const segments = splitIntoCalendarMonths({ startAt, endAt, timeZone });
  if (!segments.length) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const method = normalizeMonthlyProrationMethod(prorationMethod);
  const mode = normalizeRoundingMode(roundingMode);
  const granularity = normalizeRoundingGranularity(roundingGranularity);
  let units = 0;
  for (const segment of segments) {
    const segmentStart = Date.parse(segment.startAt);
    const segmentEnd = Date.parse(segment.endAt);
    if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd) || segmentEnd <= segmentStart) continue;
    const activeMs = segmentEnd - segmentStart;
    if (activeMs <= 0) continue;
    if (method === "days") {
      let days = activeMs / dayMs;
      if (mode !== "none" && granularity === "day") {
        days = applyRoundingValue(days, mode);
      } else {
        days = Math.ceil(days - 1e-9);
      }
      units += days / segment.daysInMonth;
    } else {
      const adjustedMs =
        mode !== "none" && (granularity === "hour" || granularity === "day")
          ? applyDurationRoundingMs(activeMs, mode, granularity)
          : activeMs;
      units += adjustedMs / (segment.daysInMonth * dayMs);
    }
  }
  if (!Number.isFinite(units) || units <= 0) return null;
  return units;
}

function normalizeRoundingMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "prorate" || raw === "none") return "none";
  if (raw === "ceil" || raw === "floor" || raw === "nearest") return raw;
  return "ceil";
}

function normalizeRoundingGranularity(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "hour" || raw === "day" || raw === "unit") return raw;
  return "unit";
}

function normalizeMonthlyProrationMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "days" || raw === "hours") return raw;
  return "hours";
}

function applyRoundingValue(value, mode) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const normalized = normalizeRoundingMode(mode);
  if (normalized === "none") return n;
  if (normalized === "ceil") return Math.ceil(n - 1e-9);
  if (normalized === "floor") return Math.floor(n + 1e-9);
  return Math.round(n);
}

function applyDurationRoundingMs(activeMs, mode, granularity) {
  const normalized = normalizeRoundingMode(mode);
  if (normalized === "none") return activeMs;
  const unit = normalizeRoundingGranularity(granularity);
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (unit === "hour") {
    const hours = applyRoundingValue(activeMs / hourMs, normalized);
    return Math.max(0, hours) * hourMs;
  }
  if (unit === "day") {
    const days = applyRoundingValue(activeMs / dayMs, normalized);
    return Math.max(0, days) * dayMs;
  }
  return activeMs;
}

function computeLineAmount({ startLocal, endLocal, rateBasis, rateAmount, qty }) {
  const startAt = fromLocalInputValue(startLocal);
  const endAt = fromLocalInputValue(endLocal);
  const basis = normalizeRateBasis(rateBasis);
  const amount = numberOrNull(rateAmount);
  const quantity = qty === null || qty === undefined ? 0 : Number(qty);
  if (!startAt || !endAt || !basis || amount === null || !Number.isFinite(quantity) || quantity <= 0) return null;
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const mode = normalizeRoundingMode(billingRoundingMode);
  const granularity = normalizeRoundingGranularity(billingRoundingGranularity);
  const monthlyMethod = normalizeMonthlyProrationMethod(monthlyProrationMethod);
  const activeMs = endMs - startMs;
  if (!Number.isFinite(activeMs) || activeMs <= 0) return null;
  let unitsRaw = null;
  if (basis === "monthly") {
    unitsRaw = computeMonthlyUnits({
      startAt,
      endAt,
      prorationMethod: monthlyMethod,
      roundingMode: mode,
      roundingGranularity: granularity,
      timeZone: billingTimeZone,
    });
  } else {
    const adjustedMs =
      mode !== "none" && (granularity === "hour" || granularity === "day")
        ? applyDurationRoundingMs(activeMs, mode, granularity)
        : activeMs;
    unitsRaw = (adjustedMs / dayMs) / billingPeriodDays(basis);
  }
  if (!Number.isFinite(unitsRaw)) return null;
  const units =
    mode !== "none" && granularity === "unit" ? applyRoundingValue(unitsRaw, mode) : unitsRaw;
  const lineAmount = units * amount * quantity;
  return {
    billableUnits: units,
    lineAmount,
  };
}

function lineItemQty(li) {
  if (isDemandOnlyStatus(draft.status)) return 1;
  if (li?.bundleId) return 1;
  return (li.inventoryIds || []).length ? 1 : 0;
}

function applyOrderedPickup(li) {
  if (normalizeOrderStatus(draft.status || "") !== "ordered") return;
  if (li.pickedUpAt) return;
  const startAt = fromLocalInputValue(li.startLocal);
  if (startAt) li.pickedUpAt = startAt;
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

function effectiveLineItemLocalPeriod(li) {
  const actualStartLocal = li?.pickedUpAt ? toLocalInputValue(li.pickedUpAt) : "";
  const actualEndLocal = li?.returnedAt ? toLocalInputValue(li.returnedAt) : "";
  const startLocal = actualStartLocal || li?.startLocal || "";
  const endLocal = actualEndLocal || li?.endLocal || "";
  return { startLocal, endLocal };
}

function localNowValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function addHoursToLocalValue(localValue, hours) {
  const iso = fromLocalInputValue(localValue);
  if (!iso) return "";
  const startMs = Date.parse(iso);
  if (!Number.isFinite(startMs)) return "";
  const end = new Date(startMs + hours * 60 * 60 * 1000);
  end.setMinutes(end.getMinutes() - end.getTimezoneOffset());
  return end.toISOString().slice(0, 16);
}

function formatDurationForDisplay(startLocal, endLocal) {
  const startIso = fromLocalInputValue(startLocal);
  const endIso = fromLocalInputValue(endLocal);
  if (!startIso || !endIso) return "";
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return "";
  const totalMinutes = Math.round((endMs - startMs) / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.round((totalMinutes - days * 24 * 60) / 60);
  const normalizedDays = hours === 24 ? days + 1 : days;
  const normalizedHours = hours === 24 ? 0 : hours;
  if (normalizedDays === 0 && normalizedHours === 0) return "0h";
  if (normalizedDays === 0) return `${normalizedHours}h`;
  if (normalizedHours === 0) return `${normalizedDays}d`;
  return `${normalizedDays}d ${normalizedHours}h`;
}

function formatActualAt(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

function parseDurationToHours(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return null;
  const dMatch = raw.match(/(\d+(?:\.\d+)?)\s*d/);
  const hMatch = raw.match(/(\d+(?:\.\d+)?)\s*h/);
  if (dMatch || hMatch) {
    const days = dMatch ? Number(dMatch[1]) : 0;
    const hours = hMatch ? Number(hMatch[1]) : 0;
    if (!Number.isFinite(days) || !Number.isFinite(hours)) return null;
    const total = days * 24 + hours;
    return total >= 0 ? total : null;
  }
  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber)) return null;
  return asNumber >= 0 ? asNumber : null;
}

function moneyNumber(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v) {
  const n = moneyNumber(v);
  return `$${n.toFixed(2)}`;
}

function fmtMoneyNullable(v) {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

function formatDateInTimeZone(value, timeZone) {
  if (!value || !timeZone) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = dtf.formatToParts(d).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    if (!parts.year || !parts.month || !parts.day) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
}

function fmtDate(value) {
  if (!value) return "--";
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  const tzDate = formatDateInTimeZone(value, billingTimeZone);
  if (tzDate) return tzDate;
  return d.toISOString().slice(0, 10);
}

function billingReasonLabel(reason) {
  const v = String(reason || "").trim().toLowerCase();
  switch (v) {
    case "monthly":
      return "Monthly billing";
    case "monthly_arrears":
      return "Monthly billing (arrears)";
    case "contract_final":
      return "Final invoice";
    case "pickup_proration":
      return "Pickup proration";
    case "pause_credit":
      return "Pause credit";
    case "return_credit":
      return "Return credit";
    case "resume_charge":
      return "Resume charge";
    default:
      return "";
  }
}

function draftKey() {
  return activeCompanyId ? `ro-draft-${activeCompanyId}` : "ro-draft";
}

let draftSaveTimer = null;
function scheduleDraftSave() {
  if (!activeCompanyId || editingOrderId) return;
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(draftKey(), JSON.stringify(draft));
    } catch (_) {}
  }, 250);
}

function updateModeLabels() {
  const normalized = normalizeOrderStatus(draft.status);
  const primary = !isQuoteStatus(normalized) ? (draft.roNumber || null) : (draft.quoteNumber || null);

  if (openHistoryBtn) {
    openHistoryBtn.style.display = editingOrderId ? "inline-flex" : "none";
  }
  if (openInvoicesBtn) {
    openInvoicesBtn.style.display = editingOrderId ? "inline-flex" : "none";
  }
  if (editingOrderId) {
    const label = primary ? `Edit ${primary}` : `Edit #${editingOrderId}`;
    modeLabel.textContent = label;
    formTitle.textContent = isQuoteStatus(normalized) ? "Quote" : "Rental Order";
  } else {
    modeLabel.textContent = isQuoteStatus(normalized) ? "New quote" : "New RO";
    formTitle.textContent = isQuoteStatus(normalized) ? "Quote" : "Rental Order";
  }

  if (orderNumberPill) {
    const parts = [];
    if (draft.roNumber) parts.push(draft.roNumber);
    if (draft.quoteNumber && draft.quoteNumber !== draft.roNumber) parts.push(draft.quoteNumber);
    if (parts.length) {
      orderNumberPill.textContent = parts.join(" / ");
      orderNumberPill.style.display = "inline-block";
    } else {
      orderNumberPill.textContent = "";
      orderNumberPill.style.display = "none";
    }
  }

  if (saveOrderBtn) {
    saveOrderBtn.textContent = isQuoteStatus(normalized) ? "Save quote" : "Save RO";
  }

  renderStatusControls();
}

function updatePdfButtonState() {
  if (!downloadOrderPdfBtn) return;
  downloadOrderPdfBtn.disabled = !editingOrderId;
}

function renderStatusControls() {
  const normalized = normalizeOrderStatus(draft.status);
  const quoteMode = isQuoteStatus(normalized);
  const requestMode = normalized === "requested" || normalized === "request_rejected";
  draft.isOverdue = computeOverdueFlag();

  if (statusPill) {
    const show = quoteMode || normalized === "closed" || requestMode || draft.isOverdue;
    statusPill.style.display = show ? "inline-flex" : "none";
    statusPill.textContent = show ? (draft.isOverdue ? "Overdue" : statusLabel(normalized)) : "";
  }

  if (quoteActions) quoteActions.style.display = quoteMode ? "flex" : "none";
  if (requestActions) requestActions.style.display = requestMode ? "flex" : "none";
  if (roStatusLabel) roStatusLabel.style.display = !quoteMode && normalized !== "closed" && normalized !== "request_rejected" ? "flex" : "none";

  if (quoteReserveBtn) quoteReserveBtn.style.display = normalized === "quote" ? "inline-flex" : "none";
  if (quoteRejectBtn) quoteRejectBtn.style.display = normalized === "quote" ? "inline-flex" : "none";
  if (quoteUndoBtn) quoteUndoBtn.style.display = normalized === "quote_rejected" ? "inline-flex" : "none";

  if (requestApproveBtn) requestApproveBtn.style.display = normalized === "requested" ? "inline-flex" : "none";
  if (requestRejectBtn) requestRejectBtn.style.display = normalized === "requested" ? "inline-flex" : "none";
  if (requestUndoBtn) requestUndoBtn.style.display = normalized === "request_rejected" ? "inline-flex" : "none";

  if (statusSelect && isRoWorkflowStatus(normalized)) {
    statusSelect.value = normalized;
  }

  if (closeOpenBtn) {
    if (quoteMode || requestMode) {
      closeOpenBtn.style.display = "none";
      return;
    }
    closeOpenBtn.style.display = "inline-flex";
    closeOpenBtn.textContent = normalized === "closed" ? "Open" : "Close";
    closeOpenBtn.classList.toggle("danger", normalized !== "closed");
  }
}

async function persistStatus(nextStatus, { note = null } = {}) {
  const previous = normalizeOrderStatus(draft.status);
  const desired = normalizeOrderStatus(nextStatus);
  if (previous === desired) return;

  draft.status = desired;
  if (isUnitSelectionLocked(desired)) {
    (draft.lineItems || []).forEach((li) => {
      li.inventoryIds = [];
    });
  }
  renderStatusControls();
  updateModeLabels();
  updatePdfButtonState();
  scheduleDraftSave();

  if (!editingOrderId) return;
  if (!activeCompanyId) {
    throw new Error("Select a company first.");
  }

  try {
    const session = window.RentSoft?.getSession?.();
    const actorName = session?.user?.name ? String(session.user.name) : null;
    const actorEmail = session?.user?.email ? String(session.user.email) : null;
    const res = await fetch(`/api/rental-orders/${encodeURIComponent(editingOrderId)}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        status: desired,
        actorName,
        actorEmail,
        note: note === null || note === undefined ? null : String(note),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to update status");
    const order = data.order;
    draft.status = normalizeOrderStatus(order.status);
    draft.quoteNumber = order.quoteNumber ?? null;
    draft.roNumber = order.roNumber ?? null;
    renderStatusControls();
    updateModeLabels();
  } catch (err) {
    draft.status = previous;
    renderStatusControls();
    updateModeLabels();
    throw err;
  }
}

function pickupAddressString() {
  const locId = draft.pickupLocationId ? Number(draft.pickupLocationId) : null;
  const loc = locationsCache.find((l) => Number(l.id) === Number(locId));
  if (!loc) return "";
  const parts = [loc.street_address, loc.city, loc.region, loc.country].filter(Boolean);
  return parts.join(", ");
}

function setPickupPreview() {
  const method = draft.fulfillmentMethod === "dropoff" ? "dropoff" : "pickup";
  fulfillmentSelects.forEach((el) => {
    el.value = method;
  });
  pickupLocationSelects.forEach((el) => {
    el.value = draft.pickupLocationId ? String(draft.pickupLocationId) : "";
  });
  fulfillmentAddresses.forEach((el) => {
    el.readOnly = method === "pickup";
    el.value = method === "pickup" ? pickupAddressString() : (draft.dropoffAddress || "");
  });
}

function ensureAtLeastOneLineItem() {
  if (!draft.lineItems || draft.lineItems.length === 0) {
    draft.lineItems = [
      {
        tempId: uuid(),
        typeId: null,
        bundleId: null,
        bundleItems: [],
        bundleAvailable: null,
        startLocal: "",
        endLocal: "",
        rateBasis: "daily",
        rateAmount: null,
        rateManual: false,
        inventoryIds: [],
        inventoryOptions: [],
        beforeNotes: "",
        afterNotes: "",
        beforeImages: [],
        afterImages: [],
        aiDamageReport: "",
        pausePeriods: [],
      },
    ];
  }
}

function ensureAtLeastOneFeeRow() {
  if (!draft.fees || draft.fees.length === 0) {
    draft.fees = [{ name: "", amount: "", invoiced: false }];
  }
}

function updateFeeTotals() {
  const total = (draft.fees || []).reduce((sum, f) => sum + moneyNumber(f.amount), 0);
  if (feeTotalInlineEl) feeTotalInlineEl.textContent = fmtMoney(total);
  if (feeTotalModalEl) feeTotalModalEl.textContent = fmtMoney(total);
  updateOrderTotals();
}

function rateBasisLabel(basis) {
  switch (basis) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Rate";
  }
}

function updateRatePeriodTotals(periodSummaries) {
  if (!ratePeriodTotalsEl || !ratePeriodTotalsBodyEl) return;
  const basisOrder = ["daily", "weekly", "monthly"];
  const activeBases = basisOrder.filter((basis) => (periodSummaries.get(basis)?.totalAmount || 0) > 0);
  const hasMultipleBases = activeBases.length > 1;
  const hasMultipleUnits = activeBases.some((basis) => (periodSummaries.get(basis)?.unitCount || 0) > 1);
  const shouldShow = activeBases.length > 0 && (hasMultipleBases || hasMultipleUnits);

  if (!shouldShow) {
    ratePeriodTotalsEl.style.display = "none";
    ratePeriodTotalsBodyEl.innerHTML = "";
    return;
  }

  ratePeriodTotalsEl.style.display = "block";
  ratePeriodTotalsBodyEl.innerHTML = activeBases
    .map((basis) => {
      const summary = periodSummaries.get(basis) || {};
      const subtotal = Number.isFinite(summary.periodSubtotal) ? summary.periodSubtotal : 0;
      const gst = subtotal * 0.05;
      const total = subtotal + gst;
      const label = rateBasisLabel(basis);
      const unitSuffix = basis === "daily" ? "per day" : basis === "weekly" ? "per week" : "per month";
      return `
        <div class="totals-row">
          <span class="hint">${label} subtotal (${unitSuffix})</span>
          <strong>${fmtMoney(subtotal)}</strong>
        </div>
        <div class="totals-row">
          <span class="hint">${label} GST (5%) (${unitSuffix})</span>
          <strong>${fmtMoney(gst)}</strong>
        </div>
        <div class="totals-row">
          <span class="hint">${label} total (${unitSuffix})</span>
          <strong>${fmtMoney(total)}</strong>
        </div>
      `;
    })
    .join("");
}

function updateOrderTotals() {
  if (!orderSubtotalEl || !orderGstEl || !orderTotalEl) return;
  const feesTotal = (draft.fees || []).reduce((sum, f) => sum + moneyNumber(f.amount), 0);
  const periodSummaries = new Map();
  const lineSubtotal = (draft.lineItems || []).reduce((sum, li) => {
    const { startLocal, endLocal } = effectiveLineItemLocalPeriod(li);
    const calc = computeLineAmount({
      startLocal,
      endLocal,
      rateBasis: li.rateBasis,
      rateAmount: li.rateAmount,
      qty: lineItemQty(li),
    });
    const basis = normalizeRateBasis(li.rateBasis);
    if (!calc || !Number.isFinite(calc.lineAmount)) return sum;
    if (basis) {
      const summary = periodSummaries.get(basis) || { totalAmount: 0, unitCount: 0, periodSubtotal: 0 };
      summary.totalAmount += calc.lineAmount;
      if (Number.isFinite(calc.billableUnits)) {
        summary.unitCount += calc.billableUnits;
      }
      const qty = lineItemQty(li);
      const perPeriod =
        Number.isFinite(Number(li.rateAmount)) && Number.isFinite(qty) && qty > 0
          ? Number(li.rateAmount) * qty
          : Number.isFinite(calc.billableUnits) && calc.billableUnits > 0
            ? calc.lineAmount / calc.billableUnits
            : 0;
      summary.periodSubtotal += Number.isFinite(perPeriod) ? perPeriod : 0;
      periodSummaries.set(basis, summary);
    }
    return sum + calc.lineAmount;
  }, 0);

  const subtotal = lineSubtotal + feesTotal;
  const gst = subtotal * 0.05;
  const total = subtotal + gst;
  orderSubtotalEl.textContent = fmtMoney(subtotal);
  orderGstEl.textContent = fmtMoney(gst);
  orderTotalEl.textContent = fmtMoney(total);
  updateRatePeriodTotals(periodSummaries);
}

function renderFees() {
  feesEl.innerHTML = "";
  (draft.fees || []).forEach((fee, index) => {
    const statusBadge = fee.invoiced
      ? '<span class="badge new fee-status">Invoiced &#10003;</span>'
      : '<span class="badge normal fee-status">Not invoiced</span>';
    const row = document.createElement("div");
    row.className = "two-col";
    row.innerHTML = `
      <label class="fee-label">
        <div class="fee-label-row">
          <span>Fee name</span>
          ${statusBadge}
        </div>
        <input data-fee-name="${index}" value="${fee.name || ""}" />
      </label>
      <label>Fee amount
        <input data-fee-amount="${index}" value="${fee.amount ?? ""}" type="number" min="0" step="0.01" />
      </label>
    `;
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    actions.innerHTML = `
      <button class="ghost small" data-insert-fee="${index}">Add fee</button>
      <button class="ghost small danger" data-remove-fee="${index}">Remove</button>
    `;
    feesEl.appendChild(row);
    feesEl.appendChild(actions);
  });
  updateFeeTotals();
}

function renderNotes(notes) {
  notesList.innerHTML = "";
  (notes || []).forEach((n) => {
    const div = document.createElement("div");
    div.className = "note-row";
    const when = n.created_at ? new Date(n.created_at).toLocaleString() : "--";
    div.innerHTML = `
      <div class="note-meta">${n.user_name} • ${when}</div>
      <div>${String(n.note || "").replaceAll("\n", "<br />")}</div>
    `;
    notesList.appendChild(div);
  });

  const count = Array.isArray(notes) ? notes.length : 0;
  if (extrasNotesBadge) {
    extrasNotesBadge.textContent = String(count);
    extrasNotesBadge.style.display = count > 0 ? "inline-flex" : "none";
  }
}

function renderAttachments(list) {
  attachmentsList.innerHTML = "";
  (list || []).forEach((a) => {
    const div = document.createElement("div");
    div.className = "attachment-row";
    div.dataset.attachmentId = a.id;
    div.innerHTML = `
      <a href="${a.url}" target="_blank" rel="noopener">${a.file_name}</a>
      <span class="hint">${a.mime || ""}${a.size_bytes ? ` • ${Math.round(a.size_bytes / 1024)} KB` : ""}</span>
      <button class="ghost small danger" data-remove-attachment="${a.id}" data-url="${a.url}">Remove</button>
    `;
    attachmentsList.appendChild(div);
  });

  const count = Array.isArray(list) ? list.length : 0;
  if (extrasFilesBadge) {
    extrasFilesBadge.textContent = String(count);
    extrasFilesBadge.style.display = count > 0 ? "inline-flex" : "none";
  }
}

function renderCustomerDetails() {
  const customerId = draft.customerId ? Number(draft.customerId) : null;
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
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value || ""}</div>
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
    if (!activeCompanyId || !draft.customerId) return;
    const url = new URL("customers-form.html", window.location.origin);
    url.searchParams.set("id", String(draft.customerId));
    url.searchParams.set("returnTo", "rental-order-form.html");
    url.searchParams.set("returnSelect", "customer");
    if (editingOrderId) url.searchParams.set("returnOrderId", String(editingOrderId));
    window.location.href = url.pathname + url.search;
  });
}

function selectedInventoryDetails(ids) {
  const byId = new Map(equipmentCache.map((e) => [String(e.id), e]));
  return (ids || []).map((id) => byId.get(String(id)) || { id, serial_number: `#${id}`, model_name: "" });
}

function unitLabel(inv) {
  const model = inv?.model_name || "Unit";
  const base = inv?.location ? String(inv.location) : "Unknown";
  const current = inv?.current_location ? String(inv.current_location) : "";
  const location = current && current !== base ? `${base} (${current})` : base;
  return `${model} - ${location}`;
}

function workOrdersStorageKey(companyId) {
  return `rentSoft.workOrders.${companyId}`;
}

function workOrdersSeqKey(companyId, year) {
  return `rentSoft.workOrdersSeq.${companyId}.${year}`;
}

function loadWorkOrdersForCompany(companyId) {
  if (!companyId) return [];
  const raw = localStorage.getItem(workOrdersStorageKey(companyId));
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

function saveWorkOrdersForCompany(companyId, orders) {
  if (!companyId) return;
  localStorage.setItem(workOrdersStorageKey(companyId), JSON.stringify(orders || []));
}

function nextWorkOrderNumber(companyId) {
  const year = new Date().getFullYear();
  if (!companyId) return `WO-${year}-${String(1).padStart(5, "0")}`;
  const key = workOrdersSeqKey(companyId, year);
  const current = Number(localStorage.getItem(key) || 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem(key, String(next));
  return `WO-${year}-${String(next).padStart(5, "0")}`;
}

function ensureReturnInspectionWorkOrders(li) {
  if (!autoWorkOrderOnReturn || !activeCompanyId) return false;
  const ids = Array.isArray(li?.inventoryIds)
    ? li.inventoryIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  if (!ids.length) return false;

  const orders = loadWorkOrdersForCompany(activeCompanyId);
  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  const orderNumber = draft?.roNumber || draft?.quoteNumber || null;
  const unitDetails = selectedInventoryDetails(ids);
  let created = false;

  ids.forEach((unitId, idx) => {
    const existing = orders.find((order) => {
      if (order?.returnInspection !== true) return false;
      if (order?.orderStatus === "closed") return false;
      if (String(order?.unitId) !== String(unitId)) return false;
      if (li?.lineItemId && String(order?.sourceLineItemId) !== String(li.lineItemId)) return false;
      return true;
    });
    if (existing) return;
    const unitInfo = unitDetails[idx] || { id: unitId };
    const label = unitLabel(unitInfo);
    const summary = orderNumber ? `Return inspection for ${orderNumber}` : "Return inspection";
    orders.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      number: nextWorkOrderNumber(activeCompanyId),
      createdAt: now,
      updatedAt: now,
      date,
      unitId: String(unitId),
      unitLabel: label,
      workSummary: summary,
      orderStatus: "open",
      serviceStatus: "out_of_service",
      returnInspection: true,
      source: "return_inspection",
      sourceOrderId: editingOrderId ? String(editingOrderId) : null,
      sourceOrderNumber: orderNumber,
      sourceLineItemId: li?.lineItemId ? String(li.lineItemId) : null,
      parts: [],
      labor: [],
      closedAt: null,
    });
    created = true;
  });

  if (created) saveWorkOrdersForCompany(activeCompanyId, orders);
  return created;
}

function ensureSingleUnitSelection(li) {
  const ids = Array.isArray(li.inventoryIds)
    ? li.inventoryIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  li.inventoryIds = ids.length ? [ids[0]] : [];
  return li;
}

function explodeLineItems(items) {
  const expanded = [];
  (items || []).forEach((li) => {
    if (li.bundleId) {
      const ids = Array.isArray(li.inventoryIds)
        ? li.inventoryIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      const next = { ...li, inventoryIds: ids.length ? [ids[0]] : [] };
      if (!next.tempId) next.tempId = uuid();
      expanded.push(next);
      return;
    }
    const ids = Array.isArray(li.inventoryIds)
      ? li.inventoryIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [];
    if (ids.length <= 1) {
      const next = ensureSingleUnitSelection({ ...li });
      if (!next.tempId) next.tempId = uuid();
      expanded.push(next);
      return;
    }
    ids.forEach((id) => {
      expanded.push({
        ...li,
        tempId: uuid(),
        lineItemId: null,
        inventoryIds: [id],
      });
    });
  });
  return expanded;
}

function lineItemKey(li) {
  const typeId = li.bundleId ? `bundle:${li.bundleId}` : li.typeId ? String(li.typeId) : "";
  const startAt = fromLocalInputValue(li.startLocal);
  const endAt = fromLocalInputValue(li.endLocal);
  const rateBasis = normalizeRateBasis(li.rateBasis) || "";
  const rateAmount = li.rateAmount === null || li.rateAmount === undefined ? "" : String(li.rateAmount);
  if (!typeId || !startAt || !endAt) return null;
  return `${typeId}|${startAt}|${endAt}|${rateBasis}|${rateAmount}`;
}

function mergeLineItems(items) {
  return explodeLineItems(items);
}

function openLineItemDocsModal(tempId) {
  editingLineItemTempId = tempId;
  renderLineItemDocsModal();
  lineItemDocsModal?.classList.add("show");
}

function closeLineItemDocsModal() {
  editingLineItemTempId = null;
  lineItemDocsModal?.classList.remove("show");
}

function getEditingLineItem() {
  if (!editingLineItemTempId) return null;
  return (draft.lineItems || []).find((x) => x.tempId === editingLineItemTempId) || null;
}

function renderLineItemDocsModal() {
  const li = getEditingLineItem();
  if (!li) return;

  const bundle = li.bundleId ? findBundle(li.bundleId) : null;
  const typeName = bundle?.name
    ? `Bundle: ${bundle.name}`
    : typesCache.find((t) => String(t.id) === String(li.typeId))?.name || "Line item";
  const startAt = li.startLocal ? new Date(li.startLocal).toLocaleString() : "--";
  const endAt = li.endLocal ? new Date(li.endLocal).toLocaleString() : "--";
  if (lineItemDocsSubtitle) {
    lineItemDocsSubtitle.textContent = `${typeName} • ${startAt} → ${endAt}`;
  }

  if (lineItemBeforeNotes) lineItemBeforeNotes.value = li.beforeNotes || "";
  if (lineItemAfterNotes) lineItemAfterNotes.value = li.afterNotes || "";
  if (lineItemAiReport) lineItemAiReport.value = li.aiDamageReport || "";
  if (lineItemAiReportHint) lineItemAiReportHint.textContent = "";

  if (lineItemBeforeThumbs) {
    lineItemBeforeThumbs.innerHTML = (li.beforeImages || [])
      .map(
        (url) => `
        <div class="thumb-tile">
          <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <button class="ghost small danger" data-remove-before="${url}">Remove</button>
        </div>`
      )
      .join("");
  }

  if (lineItemAfterThumbs) {
    lineItemAfterThumbs.innerHTML = (li.afterImages || [])
      .map(
        (url) => `
        <div class="thumb-tile">
          <img class="thumb" src="${url}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <button class="ghost small danger" data-remove-after="${url}">Remove</button>
        </div>`
      )
      .join("");
  }
}

function openLineItemTimeModal(tempId) {
  editingLineItemTimeTempId = tempId;
  renderLineItemTimeModal();
  lineItemTimeModal?.classList.add("show");
}

function closeLineItemTimeModal() {
  if (lineItemTimeRefreshTimer) clearTimeout(lineItemTimeRefreshTimer);
  if (editingLineItemTimeTempId) {
    void syncLineItemTimeFromModal({ immediate: true, reportErrors: true, force: true });
  }
  editingLineItemTimeTempId = null;
  lineItemTimeModal?.classList.remove("show");
}

function getEditingLineItemTime() {
  if (!editingLineItemTimeTempId) return null;
  return (draft.lineItems || []).find((x) => x.tempId === editingLineItemTimeTempId) || null;
}

function renderLineItemTimeModal() {
  const li = getEditingLineItemTime();
  if (!li) return;
  if (lineItemStartInput) lineItemStartInput.value = li.startLocal || "";
  if (lineItemEndInput) lineItemEndInput.value = li.endLocal || "";
}

function openLineItemActualModal(tempId) {
  editingLineItemActualTempId = tempId;
  renderLineItemActualModal();
  lineItemActualModal?.classList.add("show");
}

function closeLineItemActualModal() {
  editingLineItemActualTempId = null;
  lineItemActualModal?.classList.remove("show");
  if (lineItemActualHint) lineItemActualHint.textContent = "";
}

function getEditingLineItemActual() {
  if (!editingLineItemActualTempId) return null;
  return (draft.lineItems || []).find((x) => x.tempId === editingLineItemActualTempId) || null;
}

function normalizePausePeriods(li) {
  if (!li.pausePeriods || !Array.isArray(li.pausePeriods)) li.pausePeriods = [];
}

function getActivePauseLabel(li) {
  normalizePausePeriods(li);
  const now = Date.now();
  const active = li.pausePeriods.filter((p) => {
    const startMs = Date.parse(p?.startAt);
    if (!Number.isFinite(startMs)) return false;
    const endMs = p?.endAt ? Date.parse(p.endAt) : null;
    if (p?.endAt && !Number.isFinite(endMs)) return false;
    return startMs <= now && (endMs === null || now < endMs);
  });
  if (!active.length) return null;
  const workOrderPause = active.find((p) => p?.source === "work_order" && p?.workOrderNumber);
  if (workOrderPause?.workOrderNumber) {
    return `Paused (${workOrderPause.workOrderNumber})`;
  }
  return "Paused";
}

function renderLineItemPausePeriods(li) {
  if (!lineItemPauseList) return;
  normalizePausePeriods(li);
  if (lineItemPauseDetails) lineItemPauseDetails.open = li.pausePeriods.length > 0;
  const rows = li.pausePeriods
    .map((p, index) => {
      const startLabel = formatActualAt(p?.startAt) || "--";
      const endLabel = p?.endAt ? formatActualAt(p.endAt) || "--" : "Ongoing";
      const workOrderLabel =
        p?.source === "work_order" && p?.workOrderNumber ? `Work order ${p.workOrderNumber}` : "";
      return `
          <div class="pause-period-row">
            <div>
              <div class="text-sm font-medium">${startLabel}</div>
              <div class="text-xs text-slate-500">${endLabel}</div>
              ${workOrderLabel ? `<div class="text-xs text-slate-500">${workOrderLabel}</div>` : ""}
            </div>
            <button class="ghost small danger" data-remove-pause="${index}" type="button">Remove</button>
          </div>
        `;
    })
    .join("");
  lineItemPauseList.innerHTML = rows || `<div class="hint">No pause periods yet.</div>`;
}

function renderLineItemActualModal() {
  const li = getEditingLineItemActual();
  if (!li) return;
  applyOrderedPickup(li);
  if (lineItemActualPickupInput) lineItemActualPickupInput.value = toLocalInputValue(li.pickedUpAt);
  if (lineItemActualReturnInput) lineItemActualReturnInput.value = toLocalInputValue(li.returnedAt);
  if (lineItemPauseStartInput) lineItemPauseStartInput.value = "";
  if (lineItemPauseEndInput) lineItemPauseEndInput.value = "";
  renderLineItemPausePeriods(li);
  if (lineItemActualHint) {
    lineItemActualHint.textContent = "Pick up/delivery time is required before recording a return.";
  }
}

function collectActualModalTargets() {
  const pickupValue = lineItemActualPickupInput?.value || "";
  const returnValue = lineItemActualReturnInput?.value || "";
  return {
    targetPickup: fromLocalInputValue(pickupValue),
    targetReturn: fromLocalInputValue(returnValue),
  };
}

async function applyActualPeriodToLineItem(li, { targetPickup, targetReturn }) {
  const pickupChanged = targetPickup !== (li.pickedUpAt || null);
  const returnChanged = targetReturn !== (li.returnedAt || null);
  if (!pickupChanged && !returnChanged) return;

  li.pickedUpAt = targetPickup || null;
  li.returnedAt = targetReturn || null;

  if (!editingOrderId || !li.lineItemId) return;
  const session = window.RentSoft?.getSession?.();
  const actorName = session?.user?.name ? String(session.user.name) : null;
  const actorEmail = session?.user?.email ? String(session.user.email) : null;

  if (pickupChanged) {
    const res = await fetch(`/api/rental-orders/line-items/${encodeURIComponent(String(li.lineItemId))}/pickup`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        pickedUp: !!targetPickup,
        ...(targetPickup ? { pickedUpAt: targetPickup } : {}),
        actorName,
        actorEmail,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to update pickup time.");
    li.pickedUpAt = data.pickedUpAt || null;
    li.returnedAt = data.returnedAt || null;
    if (data.orderStatus) {
      draft.status = normalizeOrderStatus(data.orderStatus);
      if (statusSelect && isRoWorkflowStatus(draft.status)) statusSelect.value = normalizeOrderStatus(draft.status);
      renderStatusControls();
    }
  }

  if (returnChanged) {
    const res = await fetch(`/api/rental-orders/line-items/${encodeURIComponent(String(li.lineItemId))}/return`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        returned: !!targetReturn,
        ...(targetReturn ? { returnedAt: targetReturn } : {}),
        actorName,
        actorEmail,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to update return time.");
    li.pickedUpAt = data.pickedUpAt || null;
    li.returnedAt = data.returnedAt || null;
    if (data.orderStatus) {
      draft.status = normalizeOrderStatus(data.orderStatus);
      if (statusSelect && isRoWorkflowStatus(draft.status)) statusSelect.value = normalizeOrderStatus(draft.status);
      renderStatusControls();
    }
    if (Array.isArray(data.invoices) && data.invoices.length) {
      setCompanyMeta(`All items returned - invoice created (${data.invoices.map((x) => x.invoiceNumber || `#${x.id}`).join(", ")}).`);
    } else if (data.invoiceError) {
      setCompanyMeta(`All items returned - invoice generation failed: ${data.invoiceError}`);
    } else if (normalizeOrderStatus(data.orderStatus) === "received") {
      setCompanyMeta("All items returned - order received.");
    }
    if (targetReturn) {
      ensureReturnInspectionWorkOrders(li);
    }
  }

  await refreshAvailabilityForLineItem(li).catch(() => {});
}

function renderLineItems() {
  lineItemsEl.innerHTML = "";
  const lockUnits = isUnitSelectionLocked(draft.status);
  (draft.lineItems || []).forEach((li) => {
    const card = document.createElement("div");
    card.className = "line-item-card";
    card.dataset.tempId = li.tempId;

    applyOrderedPickup(li);
    const { startLocal, endLocal } = effectiveLineItemLocalPeriod(li);
    const pauseLabel = getActivePauseLabel(li);
    const actualPickupDisplay =
      pauseLabel || (li.returnedAt ? "Returned" : li.pickedUpAt ? "Return pending" : "Awaiting pickup/delivery");
    const actualButtonLabel = "Actual period";

    const typeOptions = typesCache
      .map((t) => `<option value="${t.id}" ${String(t.id) === String(li.typeId || "") ? "selected" : ""}>${t.name}</option>`)
      .join("");
    const availableUnits = Array.isArray(li.inventoryOptions) ? li.inventoryOptions : [];
    const selectedUnitId = (li.inventoryIds || []).map((id) => Number(id)).find((id) => Number.isFinite(id)) || null;
    const selectedUnit = selectedUnitId ? selectedInventoryDetails([selectedUnitId])[0] : null;
    const unitOptions = availableUnits
      .map((e) => {
        const selected = String(e.id) === String(selectedUnitId) ? "selected" : "";
        const bundleParts = Array.isArray(e.bundle_items)
          ? e.bundle_items
              .map((item) => {
                const qty = Number(item.qty || item.count || 0);
                const name = String(item.type_name || item.typeName || "").trim();
                if (!name) return null;
                return `${qty || 1}x ${name}`;
              })
              .filter(Boolean)
          : [];
        const bundleText = bundleParts.length ? ` (Bundle: ${bundleParts.join("; ")})` : "";
        const bundleId = e.bundle_id ? ` data-bundle-id="${e.bundle_id}"` : "";
        return `<option value="${e.id}"${bundleId} ${selected}>${unitLabel(e)}${bundleText}</option>`;
      })
      .join("");
    const selectedUnavailable =
      selectedUnitId && !availableUnits.some((e) => String(e.id) === String(selectedUnitId))
        ? `<option value="${selectedUnitId}" selected>Unavailable: ${unitLabel(selectedUnit || { id: selectedUnitId })}</option>`
        : "";
    const emptyHint = availableUnits.length ? "" : `<option value="" disabled>No available units for dates</option>`;
    const unitOptionsHtml = `${selectedUnavailable}<option value="">Select unit</option>${emptyHint}${unitOptions}`;
    const capacityLabel = Number.isFinite(li.capacityUnits) ? String(li.capacityUnits) : "--";
    const totalLabel = Number.isFinite(li.totalUnits) ? String(li.totalUnits) : "--";
    const bundleItems = Array.isArray(li.bundleItems) ? li.bundleItems : [];
    const equipmentById = new Map(equipmentCache.map((e) => [String(e.id), e]));
    const bundleTypeSummaryParts = [];
    const bundleModelParts = [];
    if (bundleItems.length) {
      const counts = new Map();
      bundleItems.forEach((item) => {
        const typeName = String(item.typeName || item.type_name || "").trim();
        if (typeName) counts.set(typeName, (counts.get(typeName) || 0) + 1);
        let modelName = String(item.modelName || item.model_name || "").trim();
        if (!modelName && item.id) {
          const cached = equipmentById.get(String(item.id));
          modelName = cached?.model_name ? String(cached.model_name).trim() : "";
        }
        if (modelName) bundleModelParts.push(modelName);
      });
      counts.forEach((qty, name) => {
        bundleTypeSummaryParts.push(`${qty}x ${name}`);
      });
    }
    const bundleTypeText = bundleTypeSummaryParts.length
      ? bundleTypeSummaryParts.join("; ")
      : "Bundle items will load after selection.";
    const bundleModelText = bundleModelParts.length
      ? bundleModelParts.join("; ")
      : "Bundle items will load after selection.";
    const bundleAvailabilityLabel =
      li.bundleAvailable === false ? "Unavailable" : li.bundleAvailable === true ? "Available" : "Checking";
    const bundleAvailabilitySuffix =
      bundleAvailabilityLabel === "Available" ? "" : ` (${bundleAvailabilityLabel})`;

    const bundleHintTypeHtml = li.bundleId
      ? `<div class="hint">Bundle items: ${escapeHtml(bundleTypeText)}${bundleAvailabilitySuffix}</div>`
      : "";
    const bundleHintUnitHtml = li.bundleId
      ? `<div class="hint">Bundle items: ${escapeHtml(bundleModelText)}${bundleAvailabilitySuffix}</div>`
      : "";
    const unitFieldHtml = lockUnits
        ? `
          <label>
            <div class="label-head">
              <span>Units</span>
              <span class="hint">Capacity: ${capacityLabel} (of ${totalLabel})</span>
            </div>
            <input value="No unit assigned until ordered." disabled />
          </label>
        `
        : `
          <label>
            <div class="label-head">
              <span>Unit</span>
              <span class="hint">Available: ${availableUnits.length}</span>
            </div>
            <select data-unit>
              ${unitOptionsHtml}
            </select>
            ${bundleHintUnitHtml}
          </label>
        `;


    card.innerHTML = `
      <div class="line-item-header">
        <div class="text-sm">${actualPickupDisplay}</div>
        <div class="inline-actions">
          <button class="ghost small" data-open-docs>Before/After docs</button>
          <button class="ghost small" data-open-time>Booked Dates</button>
          <button class="ghost small" data-open-actual type="button">Actual dates</button>
          <button class="ghost small danger" data-remove-line>Remove</button>
        </div>
      </div>

        <div class="stack">
          <div class="line-item-toprow">
            <label>Equipment type
              <select data-type>
                <option value="">Select type</option>
                ${typeOptions}
              </select>
              ${bundleHintTypeHtml}
            </label>
          ${unitFieldHtml}
          <label>Duration (days/hours)
            <input data-duration value="${formatDurationForDisplay(startLocal, endLocal)}" />
          </label>
          <div class="rate-fields">
            <label>
              <span class="field-label">Period</span>
              <select data-rate-basis>
                <option value="daily" ${li.rateBasis === "daily" ? "selected" : ""}>Daily</option>
                <option value="weekly" ${li.rateBasis === "weekly" ? "selected" : ""}>Weekly</option>
                <option value="monthly" ${li.rateBasis === "monthly" ? "selected" : ""}>Monthly</option>
              </select>
            </label>
            <label>
              <span class="field-label">Rate</span>
              <input data-rate-amount type="number" min="0" step="0.01" value="${li.rateAmount ?? ""}" />
            </label>
          </div>
          <label>Line amount
            <input data-line-amount readonly value="${
              (() => {
                const calc = computeLineAmount({
                  startLocal,
                  endLocal,
                  rateBasis: li.rateBasis,
                  rateAmount: li.rateAmount,
                  qty: lineItemQty(li),
                });
                if (!calc) return "";
                return fmtMoneyNullable(calc.lineAmount);
              })()
            }" />
          </label>
        </div>

        <div class="inline"></div>
      </div>

    `;
    lineItemsEl.appendChild(card);
  });
  updateOrderTotals();
  renderStatusControls();
}

async function uploadImage({ file }) {
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("image", file);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image");
  if (!data.url) throw new Error("Upload did not return an image url");
  return data.url;
}

async function deleteUploadedImage(url) {
  if (!url) return;
  const res = await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete image");
}

async function uploadFile({ file }) {
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("file", file);
  const res = await fetch("/api/uploads/file", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload file");
  if (!data.url) throw new Error("Upload did not return a url");
  return data;
}

async function deleteUploadedFile(url) {
  if (!url) return;
  const res = await fetch("/api/uploads/file", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete file");
}

async function refreshAvailabilityForLineItem(li) {
  const startAt = li.pickedUpAt || fromLocalInputValue(li.startLocal);
  const endAt = li.returnedAt || fromLocalInputValue(li.endLocal);
  if (!li.typeId || !startAt || !endAt) {
    li.inventoryOptions = [];
    li.totalUnits = null;
    li.demandUnits = null;
    li.capacityUnits = null;
    return;
  }
  const lockUnits = isUnitSelectionLocked(draft.status);
  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    typeId: String(li.typeId),
    startAt,
    endAt,
  });
  if (editingOrderId) qs.set("excludeOrderId", String(editingOrderId));
  const res = await fetch(`/api/rental-orders/availability?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to check availability");
  li.inventoryOptions = data.available || [];
  const totalUnits = Number.isFinite(Number(data.totalUnits)) ? Number(data.totalUnits) : null;
  const demandUnits = Number.isFinite(Number(data.demandUnits)) ? Number(data.demandUnits) : 0;
  li.totalUnits = totalUnits;
  li.demandUnits = Number.isFinite(demandUnits) ? demandUnits : null;
  li.capacityUnits =
    totalUnits === null ? null : Math.max(totalUnits - (Number.isFinite(demandUnits) ? demandUnits : 0), 0);
  if (lockUnits) {
    li.inventoryIds = [];
    return;
  }
  const availableIds = new Set(li.inventoryOptions.map((e) => Number(e.id)));
  li.inventoryIds = (li.inventoryIds || []).map((x) => Number(x)).filter((id) => availableIds.has(id));
  ensureSingleUnitSelection(li);
  autoSelectUnitForLineItem(li);

  if (li.bundleId) {
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      bundleId: String(li.bundleId),
      startAt,
      endAt,
    });
    if (editingOrderId) qs.set("excludeOrderId", String(editingOrderId));
    const res = await fetch(`/api/rental-orders/availability?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to check bundle availability");
    li.bundleAvailable = data.bundleAvailable === true;
    li.bundleItems = Array.isArray(data.bundleItems) ? data.bundleItems : [];
  }
}

function normalizeRangeMs(startAt, endAt) {
  const startMs = Date.parse(startAt);
  const endMs = Date.parse(endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs };
}

function normalizeLineItemRangeMs(li) {
  const startAt = li.pickedUpAt || fromLocalInputValue(li.startLocal);
  const endAt = li.returnedAt || fromLocalInputValue(li.endLocal);
  if (!startAt || !endAt) return null;
  const range = normalizeRangeMs(startAt, endAt);
  if (!range) return null;
  if (!li.returnedAt) {
    const nowMs = Date.now();
    if (range.endMs < nowMs) range.endMs = nowMs;
  }
  return range;
}

async function refreshAvailabilityForAllLineItems({ onError } = {}) {
  const items = draft.lineItems || [];
  for (const li of items) {
    try {
      await refreshAvailabilityForLineItem(li);
    } catch (err) {
      if (onError) onError(err);
    }
  }
  draft.lineItems = mergeLineItems(draft.lineItems);
  renderLineItems();
}

function autoSelectUnitForLineItem(li) {
  const inventoryOptions = Array.isArray(li.inventoryOptions) ? li.inventoryOptions : [];
  if (li.inventoryIds && li.inventoryIds.length) return;
  if (inventoryOptions.length === 1) {
    li.inventoryIds = [Number(inventoryOptions[0].id)];
  }
}

async function loadCustomers() {
  const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch customers");
  const data = await res.json();
  customersCache = data.customers || [];
  customerSelect.innerHTML = `<option value="">Select customer</option>`;
  customersCache.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.company_name;
    customerSelect.appendChild(opt);
  });
  const addOpt = document.createElement("option");
  addOpt.value = "__new__";
  addOpt.textContent = "+ Add new customer...";
  customerSelect.appendChild(addOpt);

  if (!startBlank && selectedCustomerIdParam) {
    customerSelect.value = String(selectedCustomerIdParam);
    draft.customerId = Number(selectedCustomerIdParam);
  } else if (draft.customerId) {
    customerSelect.value = String(draft.customerId);
  }
  renderCustomerDetails();
  if (draft.customerId) {
    await loadCustomerContactOptions(draft.customerId);
  } else {
    loadCustomerContactOptions(null);
  }
}

async function loadCustomerContactOptions(customerId) {
  emergencyContactOptions = [];
  siteContactOptions = [];
  if (!activeCompanyId || !customerId) {
    updateContactSelectOptions(emergencyContactsList, emergencyContactOptions);
    updateContactSelectOptions(siteContactsList, siteContactOptions);
    return;
  }
  try {
    const res = await fetch(
      `/api/rental-orders/contacts?companyId=${activeCompanyId}&customerId=${encodeURIComponent(String(customerId))}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load contact suggestions");
    emergencyContactOptions = Array.isArray(data.emergencyContacts) ? data.emergencyContacts : [];
    siteContactOptions = Array.isArray(data.siteContacts) ? data.siteContacts : [];
  } catch (_) {
    emergencyContactOptions = [];
    siteContactOptions = [];
  }
  updateContactSelectOptions(emergencyContactsList, emergencyContactOptions);
  updateContactSelectOptions(siteContactsList, siteContactOptions);
}

async function loadSales() {
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
  salesSelect.value = draft.salespersonId ? String(draft.salespersonId) : "";
}

async function loadTypes() {
  const res = await fetch(`/api/equipment-types?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch equipment types");
  const data = await res.json();
  typesCache = data.types || [];
}

async function loadLocations() {
  const res = await fetch(`/api/locations?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch locations");
  const data = await res.json();
  locationsCache = data.locations || [];
  pickupLocationSelects.forEach((select) => {
    select.innerHTML = `<option value="">Select pickup location</option>`;
    locationsCache.forEach((l) => {
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = l.name;
      select.appendChild(opt);
    });
    select.value = draft.pickupLocationId ? String(draft.pickupLocationId) : "";
  });
  setPickupPreview();
}

async function loadEquipment() {
  const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch equipment");
  const data = await res.json();
  equipmentCache = data.equipment || [];
}

async function loadBundles() {
  const res = await fetch(`/api/equipment-bundles?companyId=${activeCompanyId}`);
  if (!res.ok) throw new Error("Unable to fetch bundles");
  const data = await res.json();
  bundlesCache = data.bundles || [];
}

async function hydrateLookups() {
  await Promise.all([
    loadCustomers(),
    loadSales(),
    loadTypes(),
    loadLocations(),
    loadEquipment(),
    loadBundles(),
    loadCompanySettings(),
    draft.customerId ? loadCustomerPricing(draft.customerId).catch(() => {}) : Promise.resolve(),
  ]);
}

function applySuggestedRatesToLineItems() {
  (draft.lineItems || []).forEach((li) => {
    if (!li) return;
    if (li.bundleId) {
      const bundle = findBundle(li.bundleId);
      if (!li.rateBasis) li.rateBasis = defaultRateBasisForBundle(bundle);
      if (li.rateManual) return;
      li.rateAmount = suggestedBundleRateAmount({ bundleId: li.bundleId, basis: li.rateBasis });
      return;
    }
    if (!li.typeId) return;
    if (!li.rateBasis) li.rateBasis = defaultRateBasisForType(li.typeId);
    if (li.rateManual) return;
    li.rateAmount = suggestedRateAmount({ customerId: draft.customerId, typeId: li.typeId, basis: li.rateBasis });
  });
}

function loadDraftFromStorage() {
  if (!activeCompanyId || editingOrderId) return;
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored && typeof stored === "object") {
      draft = {
        ...draft,
        ...stored,
        lineItems: Array.isArray(stored.lineItems) ? explodeLineItems(stored.lineItems) : [],
        fees: Array.isArray(stored.fees) ? stored.fees : [],
        emergencyContacts: Array.isArray(stored.emergencyContacts) ? stored.emergencyContacts : [],
        siteContacts: Array.isArray(stored.siteContacts) ? stored.siteContacts : [],
        siteAddress: typeof stored.siteAddress === "string" ? stored.siteAddress : "",
        siteAddressLat: Number.isFinite(Number(stored.siteAddressLat)) ? Number(stored.siteAddressLat) : null,
        siteAddressLng: Number.isFinite(Number(stored.siteAddressLng)) ? Number(stored.siteAddressLng) : null,
        siteAddressQuery: typeof stored.siteAddressQuery === "string" ? stored.siteAddressQuery : "",
        criticalAreas: typeof stored.criticalAreas === "string" ? stored.criticalAreas : "",
        generalNotes: typeof stored.generalNotes === "string" ? stored.generalNotes : "",
        coverageHours: normalizeCoverageHours(stored.coverageHours),
      };
    }
  } catch (_) {}
}

function initFormFieldsFromDraft() {
  if (statusSelect && isRoWorkflowStatus(draft.status)) {
    statusSelect.value = normalizeOrderStatus(draft.status);
  }
  customerPoInput.value = draft.customerPo || "";
  fulfillmentSelects.forEach((el) => {
    el.value = draft.fulfillmentMethod || "pickup";
  });
  logisticsInstructions.value = draft.logisticsInstructions || "";
  termsInput.value = draft.terms || "";
  specialInstructions.value = draft.specialInstructions || "";
  if (siteAddressInput) siteAddressInput.value = draft.siteAddress || "";
  if (criticalAreasInput) criticalAreasInput.value = draft.criticalAreas || "";
  if (generalNotesInput) generalNotesInput.value = draft.generalNotes || "";
  setCoverageInputs(draft.coverageHours || {});
  setContactRows(emergencyContactsList, draft.emergencyContacts || [], emergencyContactOptions);
  setContactRows(siteContactsList, draft.siteContacts || [], siteContactOptions);
  setPickupPreview();
  syncTermsBadgeFromInputs();
  updateModeLabels();
  renderStatusControls();
}

function syncTermsBadgeFromInputs() {
  const hasContent = Boolean((termsInput?.value || "").trim() || (specialInstructions?.value || "").trim());
  if (extrasTermsBadge) {
    extrasTermsBadge.textContent = "✓";
    extrasTermsBadge.style.display = hasContent ? "inline-flex" : "none";
  }
}

function syncRentalInfoDraft() {
  draft.customerPo = customerPoInput?.value || "";
  draft.logisticsInstructions = logisticsInstructions?.value || "";
  draft.terms = termsInput?.value || "";
  draft.specialInstructions = specialInstructions?.value || "";
  draft.siteAddress = siteAddressInput?.value || "";
  if (!String(draft.siteAddress || "").trim() || draft.siteAddress !== draft.siteAddressQuery) {
    draft.siteAddressLat = null;
    draft.siteAddressLng = null;
    draft.siteAddressQuery = "";
  }
  draft.criticalAreas = criticalAreasInput?.value || "";
  draft.generalNotes = generalNotesInput?.value || "";
  draft.coverageHours = collectCoverageHoursFromInputs();
  scheduleDraftSave();
  syncTermsBadgeFromInputs();
}

async function loadOrder() {
  if (!editingOrderId) return;
  const res = await fetch(`/api/rental-orders/${editingOrderId}?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to fetch rental order");

  const o = data.order;
  draft.status = normalizeOrderStatus(o.status || "quote");
  draft.isOverdue = !!(o.is_overdue || o.isOverdue);
  draft.quoteNumber = o.quote_number || o.quoteNumber || null;
  draft.roNumber = o.ro_number || o.roNumber || null;
  draft.customerId = o.customer_id;
  draft.customerPo = o.customer_po || "";
  draft.salespersonId = o.salesperson_id || null;
  draft.fulfillmentMethod = o.fulfillment_method || (o.dropoff_address ? "dropoff" : "pickup");
  draft.pickupLocationId = o.pickup_location_id || null;
  draft.dropoffAddress = o.dropoff_address || "";
  draft.logisticsInstructions = o.logistics_instructions || "";
  draft.terms = o.terms || "";
  draft.specialInstructions = o.special_instructions || "";
  draft.siteAddress = o.site_address || o.siteAddress || "";
  draft.criticalAreas = o.critical_areas || o.criticalAreas || "";
  draft.generalNotes = o.general_notes || o.generalNotes || "";
  draft.coverageHours = normalizeCoverageHours(o.coverage_hours || o.coverageHours || {});
  draft.emergencyContacts = parseContacts(o.emergency_contacts || o.emergencyContacts || []);
  draft.siteContacts = parseContacts(o.site_contacts || o.siteContacts || []);
  draft.fees = (data.fees || []).map((f) => ({
    id: f.id,
    name: f.name,
    amount: f.amount,
    invoiced: !!f.invoiced,
  }));
  draft.lineItems = (data.lineItems || []).map((li) => ({
    tempId: uuid(),
    lineItemId: li.id,
    typeId: li.typeId,
    bundleId: li.bundleId || null,
    bundleItems: Array.isArray(li.bundleItems) ? li.bundleItems : [],
    bundleAvailable: null,
    startLocal: toLocalInputValue(li.startAt),
    endLocal: toLocalInputValue(li.endAt),
    pickedUpAt: li.fulfilledAt || null,
    returnedAt: li.returnedAt || null,
    rateBasis: normalizeRateBasis(li.rateBasis) || "daily",
    rateAmount: li.rateAmount === null || li.rateAmount === undefined ? null : Number(li.rateAmount),
    rateManual: true,
    inventoryIds: li.inventoryIds || [],
    inventoryOptions: [],
    beforeNotes: li.beforeNotes || "",
    afterNotes: li.afterNotes || "",
    beforeImages: li.beforeImages || [],
    afterImages: li.afterImages || [],
    aiDamageReport: li.aiDamageReport || "",
    pausePeriods: Array.isArray(li.pausePeriods) ? li.pausePeriods : [],
  }));
  draft.lineItems = explodeLineItems(draft.lineItems);
  draft.lineItems.forEach((li) => applyOrderedPickup(li));

  await loadCustomerContactOptions(draft.customerId);
  initFormFieldsFromDraft();
  await hydrateLookups();
  renderFees();
  renderLineItems();
  renderCustomerDetails();
  renderNotes(data.notes || []);
  renderAttachments(data.attachments || []);
  setPickupPreview();
  syncTermsBadgeFromInputs();
  updateModeLabels();
  updatePdfButtonState();

  for (const li of draft.lineItems) {
    await refreshAvailabilityForLineItem(li).catch(() => {});
  }
  renderLineItems();
  await maybeAutoGenerateInvoicesForOrder();
}

let autoInvoiceAttempted = false;
async function maybeAutoGenerateInvoicesForOrder() {
  if (!activeCompanyId || !editingOrderId) return;
  if (autoInvoiceAttempted) return;
  autoInvoiceAttempted = true;
  const status = normalizeOrderStatus(draft.status);
  if (!["ordered", "closed", "received"].includes(status)) return;

  const run = String(invoiceAutoRun || "off").toLowerCase();
  if (run !== "monthly") return;

  try {
    const res = await fetch(`/api/rental-orders/${encodeURIComponent(String(editingOrderId))}/invoices/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, mode: "monthly" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const created = Array.isArray(data?.created) ? data.created : [];
    if (created.length) {
      setCompanyMeta(`Auto-invoiced ${created.length} invoice${created.length === 1 ? "" : "s"}.`);
    }
  } catch (_) {}
}

function openSalesModal() {
  salesModal.classList.add("show");
}

function closeSalesModal() {
  salesModal.classList.remove("show");
  salesForm.reset();
}

function openFeesModal() {
  feesModal?.classList.add("show");
}

function closeFeesModal() {
  feesModal?.classList.remove("show");
}

function setRentalOrderInvoicesMeta(message) {
  if (!rentalOrderInvoicesMeta) return;
  rentalOrderInvoicesMeta.textContent = String(message || "");
}

function isInvoiceOverdue(inv) {
  const balance = Number(inv?.balance);
  if (!Number.isFinite(balance) || balance <= 0) return false;
  const due = inv?.dueDate ? new Date(inv.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

function renderRentalOrderInvoices(rows) {
  if (!rentalOrderInvoicesTable) return;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    rentalOrderInvoicesTable.innerHTML = `
      <div class="table-row table-header">
        <span>Invoice #</span>
        <span>Amount</span>
        <span>Billing</span>
        <span>Overdue</span>
        <span>Email sent</span>
      </div>
      <div class="table-row">
        <span class="hint" style="grid-column: 1 / -1;">No invoices yet.</span>
      </div>`;
    return;
  }

  const body = list
    .map((inv) => {
      const number = inv.invoiceNumber || `#${inv.id}`;
      const amount = fmtMoney(inv.total || 0);
      const reason = billingReasonLabel(inv.billingReason);
      const servicePeriodStart = inv.servicePeriodStart || inv.periodStart;
      const servicePeriodEnd = inv.servicePeriodEnd || inv.periodEnd;
      const period = servicePeriodStart && servicePeriodEnd ? `${fmtDate(servicePeriodStart)} to ${fmtDate(servicePeriodEnd)}` : "--";
      const billingText = reason ? `${reason} \u2022 ${period}` : period;
      const overdue = isInvoiceOverdue(inv);
      const emailSent = inv.emailSent === true || Boolean(inv.emailSentAt);
      return `
        <div class="table-row" data-id="${escapeHtml(String(inv.id))}">
          <span>${escapeHtml(number)}</span>
          <span>${escapeHtml(amount)}</span>
          <span title="${escapeHtml(billingText)}">${escapeHtml(billingText)}</span>
          <span class="status-cell" title="${overdue ? "Overdue" : "Not overdue"}">
            ${overdue ? '<span class="status-dot danger"></span>' : '<span class="status-placeholder">--</span>'}
          </span>
          <span class="status-cell" title="${emailSent ? "Email sent" : "Not sent"}">
            <span class="status-check ${emailSent ? "ok" : "muted"}">${emailSent ? "&#10003;" : "--"}</span>
          </span>
        </div>`;
    })
    .join("");

  rentalOrderInvoicesTable.innerHTML = `
    <div class="table-row table-header">
      <span>Invoice #</span>
      <span>Amount</span>
      <span>Billing</span>
      <span>Overdue</span>
      <span>Email sent</span>
    </div>
    ${body}`;
}

async function loadRentalOrderInvoices() {
  if (!activeCompanyId || !editingOrderId) return;
  setRentalOrderInvoicesMeta("Loading invoices...");
  if (rentalOrderInvoicesTable) {
    rentalOrderInvoicesTable.innerHTML = `
      <div class="table-row table-header">
        <span>Invoice #</span>
        <span>Amount</span>
        <span>Billing</span>
        <span>Overdue</span>
        <span>Email sent</span>
      </div>
      <div class="table-row">
        <span class="hint" style="grid-column: 1 / -1;">Loading...</span>
      </div>`;
  }

  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    rentalOrderId: String(editingOrderId),
  });
  const res = await fetch(`/api/invoices?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error || "Unable to load invoices.";
    setRentalOrderInvoicesMeta(msg);
    rentalOrderInvoicesCache = [];
    renderRentalOrderInvoices([]);
    return;
  }
  rentalOrderInvoicesCache = Array.isArray(data.invoices) ? data.invoices : [];
  setRentalOrderInvoicesMeta(rentalOrderInvoicesCache.length ? "" : "No invoices for this rental order yet.");
  renderRentalOrderInvoices(rentalOrderInvoicesCache);
}

function openRentalOrderInvoicesDrawer() {
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  if (!editingOrderId) {
    setCompanyMeta("Save the document first.");
    return;
  }
  openExtrasDrawer("invoices");
  loadRentalOrderInvoices().catch((err) => {
    setRentalOrderInvoicesMeta(err?.message ? String(err.message) : String(err));
  });
}

customerSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new__") {
    e.target.value = "";
    if (!activeCompanyId) return;
    scheduleDraftSave();
    const url = new URL("customers-form.html", window.location.origin);
    url.searchParams.set("returnTo", "rental-order-form.html");
    url.searchParams.set("returnSelect", "customer");
    if (editingOrderId) url.searchParams.set("returnOrderId", String(editingOrderId));
    window.location.href = url.pathname + url.search;
    return;
  }
  draft.customerId = e.target.value ? Number(e.target.value) : null;
  renderCustomerDetails();
  loadCustomerContactOptions(draft.customerId).catch(() => {});
  loadCustomerPricing(draft.customerId)
    .then(() => {
      applySuggestedRatesToLineItems();
      renderLineItems();
    })
    .catch(() => {});
  scheduleDraftSave();
});

// Edit customer action is rendered inside the customer details panel.

salesSelect.addEventListener("change", (e) => {
  if (e.target.value === "__new_sales__") {
    e.target.value = "";
    openSalesModal();
    return;
  }
  draft.salespersonId = e.target.value ? Number(e.target.value) : null;
  scheduleDraftSave();
});

pickupLocationSelects.forEach((select) => {
  select.addEventListener("change", () => {
    draft.pickupLocationId = select.value ? Number(select.value) : null;
    pickupLocationSelects.forEach((other) => {
      if (other !== select) other.value = select.value;
    });
    setPickupPreview();
    scheduleDraftSave();
  });
});

fulfillmentSelects.forEach((select) => {
  select.addEventListener("change", () => {
    draft.fulfillmentMethod = select.value === "dropoff" ? "dropoff" : "pickup";
    fulfillmentSelects.forEach((other) => {
      if (other !== select) other.value = select.value;
    });
    setPickupPreview();
    scheduleDraftSave();
  });
});

fulfillmentAddresses.forEach((area) => {
  area.addEventListener("input", () => {
    if (draft.fulfillmentMethod !== "dropoff") return;
    draft.dropoffAddress = area.value;
    fulfillmentAddresses.forEach((other) => {
      if (other !== area) other.value = area.value;
    });
    scheduleDraftSave();
  });
});

statusSelect?.addEventListener("change", async () => {
  try {
    await persistStatus(statusSelect.value || "reservation");
  } catch (err) {
    setCompanyMeta(err.message);
  }
});

quoteReserveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  quoteReserveBtn.disabled = true;
  try {
    await persistStatus("reservation");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    quoteReserveBtn.disabled = false;
  }
});

quoteRejectBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  quoteRejectBtn.disabled = true;
  try {
    await persistStatus("quote_rejected");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    quoteRejectBtn.disabled = false;
  }
});

quoteUndoBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  quoteUndoBtn.disabled = true;
  try {
    await persistStatus("quote");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    quoteUndoBtn.disabled = false;
  }
});

requestApproveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  requestApproveBtn.disabled = true;
  try {
    await persistStatus("reservation");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    requestApproveBtn.disabled = false;
  }
});

requestRejectBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!requestRejectModal || !requestRejectNoteInput) {
    requestRejectBtn.disabled = true;
    try {
      await persistStatus("request_rejected");
    } catch (err) {
      setCompanyMeta(err.message);
    } finally {
      requestRejectBtn.disabled = false;
    }
    return;
  }

  if (requestRejectHint) requestRejectHint.textContent = "";
  requestRejectNoteInput.value = "";
  requestRejectModal.classList.add("show");
  setTimeout(() => requestRejectNoteInput.focus(), 0);
});

function closeRequestRejectModal() {
  requestRejectModal?.classList.remove("show");
}

closeRequestRejectModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeRequestRejectModal();
});

cancelRequestRejectBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeRequestRejectModal();
});

requestRejectModal?.addEventListener("click", (e) => {
  if (e.target === requestRejectModal) closeRequestRejectModal();
});

confirmRequestRejectBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!confirmRequestRejectBtn) return;
  confirmRequestRejectBtn.disabled = true;
  if (requestRejectHint) requestRejectHint.textContent = "Rejectingƒ?Ý";
  try {
    const note = String(requestRejectNoteInput?.value || "").trim();
    await persistStatus("request_rejected", { note });
    closeRequestRejectModal();
  } catch (err) {
    if (requestRejectHint) requestRejectHint.textContent = err?.message ? String(err.message) : String(err);
    setCompanyMeta(err.message);
  } finally {
    confirmRequestRejectBtn.disabled = false;
  }
});

requestUndoBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  requestUndoBtn.disabled = true;
  try {
    await persistStatus("requested");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    requestUndoBtn.disabled = false;
  }
});

closeOpenBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const normalized = normalizeOrderStatus(draft.status);
  closeOpenBtn.disabled = true;
  try {
    await persistStatus(normalized === "closed" ? "received" : "closed");
  } catch (err) {
    setCompanyMeta(err.message);
  } finally {
    closeOpenBtn.disabled = false;
  }
});

const rentalInfoInputs = [
  customerPoInput,
  logisticsInstructions,
  termsInput,
  specialInstructions,
  siteAddressInput,
  criticalAreasInput,
  generalNotesInput,
].filter(Boolean);
const coverageInputsList = coverageDayKeys.flatMap((day) => {
  const entry = coverageInputs[day];
  if (!entry) return [];
  return [entry.start, entry.end].filter(Boolean);
});
[...rentalInfoInputs, ...coverageInputsList].forEach((el) => {
  el.addEventListener("input", syncRentalInfoDraft);
});

addEmergencyContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(emergencyContactsList, {}, { focus: true });
  syncContactDraft();
});

emergencyContactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".contact-remove");
  if (!btn) return;
  const row = btn.closest(".contact-row");
  if (!row) return;
  row.remove();
  updateContactRemoveButtons(emergencyContactsList);
  syncContactDraft();
});

emergencyContactsList?.addEventListener("input", () => {
  syncContactDraft();
});

emergencyContactsList?.addEventListener("change", (e) => {
  const nameInput = e.target.closest?.('[data-contact-field="name"]');
  if (!nameInput) return;
  const entry = applySavedContactFromName(emergencyContactsList, nameInput, emergencyContactOptions);
  if (entry) syncContactDraft();
});

addSiteContactRowBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  addContactRow(siteContactsList, {}, { focus: true });
  syncContactDraft();
});

siteContactsList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".contact-remove");
  if (!btn) return;
  const row = btn.closest(".contact-row");
  if (!row) return;
  row.remove();
  updateContactRemoveButtons(siteContactsList);
  syncContactDraft();
});

siteContactsList?.addEventListener("input", () => {
  syncContactDraft();
});

siteContactsList?.addEventListener("change", (e) => {
  const nameInput = e.target.closest?.('[data-contact-field="name"]');
  if (!nameInput) return;
  const entry = applySavedContactFromName(siteContactsList, nameInput, siteContactOptions);
  if (entry) syncContactDraft();
});

addLineItemBtn.addEventListener("click", (e) => {
  e.preventDefault();
  const startLocal = localNowValue();
  draft.lineItems.push({
    tempId: uuid(),
    typeId: null,
    bundleId: null,
    bundleItems: [],
    bundleAvailable: null,
    startLocal,
    endLocal: addHoursToLocalValue(startLocal, 24),
    rateBasis: "daily",
    rateAmount: null,
    rateManual: false,
    inventoryIds: [],
    inventoryOptions: [],
    beforeNotes: "",
    afterNotes: "",
    beforeImages: [],
    afterImages: [],
    aiDamageReport: "",
    pausePeriods: [],
  });
  renderLineItems();
  scheduleDraftSave();
});

openFeesBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  ensureAtLeastOneFeeRow();
  renderFees();
  openFeesModal();
});

feesEl.addEventListener("input", (e) => {
  const nameIdx = e.target.getAttribute("data-fee-name");
  const amtIdx = e.target.getAttribute("data-fee-amount");
  if (nameIdx !== null) draft.fees[Number(nameIdx)].name = e.target.value;
  if (amtIdx !== null) draft.fees[Number(amtIdx)].amount = e.target.value;
  updateFeeTotals();
  scheduleDraftSave();
});

feesEl.addEventListener("click", (e) => {
  const insertIdx = e.target.getAttribute("data-insert-fee");
  if (insertIdx !== null) {
    e.preventDefault();
    const idx = Number(insertIdx);
    const next = { name: "", amount: "", invoiced: false };
    if (Number.isFinite(idx) && idx >= 0) draft.fees.splice(idx + 1, 0, next);
    else draft.fees.push(next);
    renderFees();
    scheduleDraftSave();
    return;
  }
  const idx = e.target.getAttribute("data-remove-fee");
  if (idx === null) return;
  e.preventDefault();
  draft.fees.splice(Number(idx), 1);
  ensureAtLeastOneFeeRow();
  renderFees();
  scheduleDraftSave();
});

lineItemsEl.addEventListener("change", async (e) => {
  const card = e.target.closest(".line-item-card");
  if (!card) return;
  const li = draft.lineItems.find((x) => x.tempId === card.dataset.tempId);
  if (!li) return;

  if (e.target.matches("[data-type]")) {
    li.typeId = e.target.value ? Number(e.target.value) : null;
    li.inventoryIds = [];
    li.bundleId = null;
    li.bundleItems = [];
    li.bundleAvailable = null;
    li.rateBasis = li.typeId ? defaultRateBasisForType(li.typeId) : "daily";
    li.rateManual = false;
    li.rateAmount = li.typeId ? suggestedRateAmount({ customerId: draft.customerId, typeId: li.typeId, basis: li.rateBasis }) : null;
    await refreshAvailabilityForAllLineItems({ onError: (err) => setCompanyMeta(err.message) });
    scheduleDraftSave();
    return;
  }

  if (e.target.matches("[data-duration]")) {
    const hours = parseDurationToHours(e.target.value);
    if (hours === null) return;
    if (!li.startLocal) li.startLocal = localNowValue();
    li.endLocal = addHoursToLocalValue(li.startLocal, hours);
    await refreshAvailabilityForAllLineItems();
    scheduleDraftSave();
    return;
  }

  if (e.target.matches("[data-rate-basis]")) {
    li.rateBasis = normalizeRateBasis(e.target.value) || "daily";
    if (!li.rateManual || li.rateAmount === null || li.rateAmount === undefined) {
      li.rateManual = false;
      if (li.bundleId) {
        li.rateAmount = suggestedBundleRateAmount({ bundleId: li.bundleId, basis: li.rateBasis });
      } else {
        li.rateAmount = li.typeId
          ? suggestedRateAmount({ customerId: draft.customerId, typeId: li.typeId, basis: li.rateBasis })
          : null;
      }
    }
    draft.lineItems = mergeLineItems(draft.lineItems);
    renderLineItems();
    scheduleDraftSave();
  }

  if (e.target.matches("[data-unit]")) {
    const nextId = e.target.value ? Number(e.target.value) : null;
    li.inventoryIds = nextId ? [nextId] : [];
    const selected = e.target.selectedOptions?.[0];
    const nextBundleId = selected?.dataset?.bundleId ? Number(selected.dataset.bundleId) : null;
    if (nextBundleId) {
      li.bundleId = nextBundleId;
      li.bundleItems = [];
      li.bundleAvailable = null;
      li.rateManual = false;
      const bundle = findBundle(nextBundleId);
      li.rateBasis = defaultRateBasisForBundle(bundle);
      li.rateAmount = suggestedBundleRateAmount({ bundleId: nextBundleId, basis: li.rateBasis });
    } else {
      li.bundleId = null;
      li.bundleItems = [];
      li.bundleAvailable = null;
      if (li.typeId && !li.rateManual) {
        li.rateBasis = defaultRateBasisForType(li.typeId);
        li.rateAmount = suggestedRateAmount({ customerId: draft.customerId, typeId: li.typeId, basis: li.rateBasis });
      }
    }
    await refreshAvailabilityForLineItem(li).catch(() => {});
    renderLineItems();
    scheduleDraftSave();
  }
});

lineItemsEl.addEventListener("input", (e) => {
  const card = e.target.closest(".line-item-card");
  if (!card) return;
  const li = draft.lineItems.find((x) => x.tempId === card.dataset.tempId);
  if (!li) return;
  if (e.target.matches("[data-rate-amount]")) {
    li.rateAmount = numberOrNull(e.target.value);
    li.rateManual = true;
    const calc = computeLineAmount({
      startLocal: li.startLocal,
      endLocal: li.endLocal,
      rateBasis: li.rateBasis,
      rateAmount: li.rateAmount,
      qty: lineItemQty(li),
    });
    const out = card.querySelector("[data-line-amount]");
    if (out) out.value = calc ? fmtMoneyNullable(calc.lineAmount) : "";
    scheduleDraftSave();
  }
  scheduleDraftSave();
});

lineItemsEl.addEventListener("click", async (e) => {
  const card = e.target.closest(".line-item-card");
  if (!card) return;
  const li = draft.lineItems.find((x) => x.tempId === card.dataset.tempId);
  if (!li) return;

  const actualBtn = e.target.closest("[data-open-actual]");
  if (actualBtn) {
    e.preventDefault();
    if (!activeCompanyId) {
      setCompanyMeta("Set company first.");
      return;
    }
    openLineItemActualModal(li.tempId);
    return;
  }

  if (e.target.hasAttribute("data-open-docs")) {
    e.preventDefault();
    openLineItemDocsModal(li.tempId);
    return;
  }

  if (e.target.hasAttribute("data-open-time")) {
    e.preventDefault();
    openLineItemTimeModal(li.tempId);
    return;
  }

  if (e.target.hasAttribute("data-remove-line")) {
    e.preventDefault();
    draft.lineItems = draft.lineItems.filter((x) => x.tempId !== li.tempId);
    ensureAtLeastOneLineItem();
    await refreshAvailabilityForAllLineItems();
    scheduleDraftSave();
    return;
  }
});

saveOrderBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  if (!draft.customerId) {
    setCompanyMeta("Select a customer.");
    return;
  }
  const validLines = (draft.lineItems || []).filter((li) => li.typeId && li.startLocal && li.endLocal);
  if (validLines.length === 0) {
    setCompanyMeta("Add at least one line item with type and dates.");
    return;
  }
  const lockUnits = isUnitSelectionLocked(draft.status);
  const requireUnits = isUnitSelectionRequired(draft.status);
  for (const li of validLines) {
    const s = new Date(li.startLocal);
    const en = new Date(li.endLocal);
    if (!(en > s)) {
      setCompanyMeta("Line item end time must be after start time.");
      return;
    }
    if (requireUnits) {
      if (li.bundleId) {
        if (li.bundleAvailable === false) {
          setCompanyMeta("One or more bundles are unavailable for the selected dates.");
          return;
        }
        if (!Array.isArray(li.bundleItems) || !li.bundleItems.length) {
          setCompanyMeta("Select a bundle with at least one asset.");
          return;
        }
        continue;
      }
      const availableQty = (li.inventoryOptions || []).length;
      if (availableQty === 0) {
        setCompanyMeta("One or more line items have no available units for the selected dates.");
        return;
      }
      if ((li.inventoryIds || []).length !== 1) {
        setCompanyMeta("Select a unit for each line item.");
        return;
      }
    }
  }

  const session = window.RentSoft?.getSession?.();
  const actorName = session?.user?.name ? String(session.user.name) : null;
  const actorEmail = session?.user?.email ? String(session.user.email) : null;

  const payload = {
    companyId: activeCompanyId,
    customerId: draft.customerId,
    customerPo: draft.customerPo || null,
    salespersonId: draft.salespersonId || null,
    pickupLocationId: draft.pickupLocationId || null,
    fulfillmentMethod: draft.fulfillmentMethod || "pickup",
    dropoffAddress: draft.fulfillmentMethod === "dropoff" ? (draft.dropoffAddress || null) : null,
    logisticsInstructions: draft.logisticsInstructions || null,
    terms: draft.terms || null,
    specialInstructions: draft.specialInstructions || null,
    siteAddress: draft.siteAddress || null,
    criticalAreas: draft.criticalAreas || null,
    generalNotes: draft.generalNotes || null,
    coverageHours: draft.coverageHours || {},
    emergencyContacts: collectContacts(emergencyContactsList),
    siteContacts: collectContacts(siteContactsList),
    status: normalizeOrderStatus(draft.status || "quote"),
    actorName,
    actorEmail,
    lineItems: validLines.map((li) => ({
      typeId: li.typeId,
      bundleId: li.bundleId || null,
      startAt: fromLocalInputValue(li.startLocal),
      endAt: fromLocalInputValue(li.endLocal),
      fulfilledAt:
        normalizeOrderStatus(draft.status || "") === "ordered" && !li.pickedUpAt
          ? fromLocalInputValue(li.startLocal)
          : (li.pickedUpAt || null),
      returnedAt: li.returnedAt || null,
      rateBasis: normalizeRateBasis(li.rateBasis),
      rateAmount: numberOrNull(li.rateAmount),
      inventoryIds: lockUnits ? [] : (li.inventoryIds || []),
      beforeNotes: li.beforeNotes || "",
      afterNotes: li.afterNotes || "",
      beforeImages: li.beforeImages || [],
      afterImages: li.afterImages || [],
      aiDamageReport: li.aiDamageReport || "",
      pausePeriods: Array.isArray(li.pausePeriods) ? li.pausePeriods : [],
    })),
    fees: (draft.fees || [])
      .filter((f) => String(f.name || "").trim())
      .map((f) => ({ id: f.id, name: f.name, amount: moneyNumber(f.amount) })),
  };

  try {
    const res = await fetch(editingOrderId ? `/api/rental-orders/${editingOrderId}` : "/api/rental-orders", {
      method: editingOrderId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save rental order");
    if (data?.quoteNumber !== undefined) draft.quoteNumber = data.quoteNumber || null;
    if (data?.roNumber !== undefined) draft.roNumber = data.roNumber || null;
    if (!editingOrderId && data?.id) {
      editingOrderId = data.id;
      localStorage.removeItem(draftKey());
      const url = new URL(window.location.href);
      url.searchParams.set("id", String(editingOrderId));
      url.searchParams.set("companyId", String(activeCompanyId));
      url.searchParams.delete("selectedCustomerId");
      url.searchParams.delete("status");
      window.history.replaceState({}, "", url.toString());
      updateModeLabels();
      updatePdfButtonState();
      syncExtrasDisabledState();
      await loadOrder();
    } else if (editingOrderId) {
      await loadOrder();
    }
  } catch (err) {
    setCompanyMeta(err.message);
  }
});

downloadOrderPdfBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  if (!editingOrderId) {
    setCompanyMeta("Save the document first.");
    return;
  }
  window.open(`/api/rental-orders/${editingOrderId}/pdf?companyId=${activeCompanyId}`, "_blank");
});

openHistoryBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  if (!editingOrderId) {
    setCompanyMeta("Save the document first.");
    return;
  }
  const fromParam = params.get("from");
  const from = fromParam ? `&from=${encodeURIComponent(fromParam)}` : "";
  window.location.href = `rental-order-history.html?id=${encodeURIComponent(String(editingOrderId))}${from}`;
});

openInvoicesBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openRentalOrderInvoicesDrawer();
});

rentalOrderInvoicesTable?.addEventListener("click", (e) => {
  const row = e.target?.closest?.(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id) return;
  const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `invoice.html?id=${encodeURIComponent(id)}&returnTo=${returnTo}`;
});

let extrasDrawerOpen = false;
let extrasActiveTab = "terms";

function setExtrasTab(tab) {
  const next = ["terms", "notes", "attachments", "invoices"].includes(String(tab)) ? String(tab) : "terms";
  extrasActiveTab = next;
  extrasTabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-tab") === next);
  });
  extrasPanels.forEach((panel) => {
    panel.style.display = panel.getAttribute("data-panel") === next ? "block" : "none";
  });
}

  function syncExtrasDisabledState() {
    if (noteHint) noteHint.textContent = editingOrderId ? "" : "Save the RO first to enable adding notes.";
    if (saveNoteBtn) saveNoteBtn.disabled = !editingOrderId;
    if (attachmentHint) attachmentHint.textContent = editingOrderId ? "" : "Save the RO first to enable uploads.";
    if (uploadAttachmentBtn) uploadAttachmentBtn.disabled = !editingOrderId;
  }

function openExtrasDrawer(tab) {
  if (!extrasDrawer || !extrasDrawerOverlay) return;
  extrasDrawerOpen = true;
  extrasDrawerOverlay.style.display = "block";
  extrasDrawer.classList.add("open");
  extrasDrawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  syncExtrasDisabledState();
  setExtrasTab(tab || extrasActiveTab);
}

function closeExtrasDrawer() {
  if (!extrasDrawer || !extrasDrawerOverlay) return;
  extrasDrawerOpen = false;
  extrasDrawerOverlay.style.display = "none";
  extrasDrawer.classList.remove("open");
  extrasDrawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

openNoteModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openExtrasDrawer("notes");
});

openAttachmentModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openExtrasDrawer("attachments");
});

toggleTermsBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openExtrasDrawer("terms");
});

closeExtrasDrawerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeExtrasDrawer();
});

extrasDrawerOverlay?.addEventListener("click", () => closeExtrasDrawer());
extrasTabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.getAttribute("data-tab");
    setExtrasTab(tab);
    if (tab === "invoices") {
      if (activeCompanyId && editingOrderId) {
        loadRentalOrderInvoices().catch((err) => {
          setRentalOrderInvoicesMeta(err?.message ? String(err.message) : String(err));
        });
      } else {
        setRentalOrderInvoicesMeta(editingOrderId ? "" : "Save the document first.");
        renderRentalOrderInvoices([]);
      }
    }
  });
});

saveNoteBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingOrderId) {
    if (noteHint) noteHint.textContent = "Save the RO first to enable adding notes.";
    return;
  }
  const userName = (noteUserInput?.value || "").trim();
  const note = (noteTextInput?.value || "").trim();
  if (!userName || !note) {
    if (noteHint) noteHint.textContent = "Enter your name and a note.";
    return;
  }
  try {
    localStorage.setItem("roUserName", userName);
  } catch (_) {}
  try {
    const res = await fetch(`/api/rental-orders/${editingOrderId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, userName, note }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to add note");
    if (noteTextInput) noteTextInput.value = "";
    if (noteHint) noteHint.textContent = "";
    const refreshed = await fetch(`/api/rental-orders/${editingOrderId}?companyId=${activeCompanyId}`);
    const detail = await refreshed.json();
    renderNotes(detail.notes || []);
  } catch (err) {
    if (noteHint) noteHint.textContent = err.message;
  }
});

uploadAttachmentBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!editingOrderId) {
    if (attachmentHint) attachmentHint.textContent = "Save the RO first to enable uploads.";
    return;
  }
  if (!attachmentFile?.files || attachmentFile.files.length === 0) {
    if (attachmentHint) attachmentHint.textContent = "Choose a file first.";
    return;
  }
  if (attachmentHint) attachmentHint.textContent = "";
  try {
    const session = window.RentSoft?.getSession?.();
    const actorName = session?.user?.name ? String(session.user.name) : null;
    const actorEmail = session?.user?.email ? String(session.user.email) : null;
    const uploaded = await uploadFile({ file: attachmentFile.files[0] });
    const res = await fetch(`/api/rental-orders/${editingOrderId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        fileName: uploaded.fileName,
        mime: uploaded.mime,
        sizeBytes: uploaded.sizeBytes,
        url: uploaded.url,
        actorName,
        actorEmail,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save attachment");
    if (attachmentFile) attachmentFile.value = "";
    if (attachmentHint) attachmentHint.textContent = "";
    const refreshed = await fetch(`/api/rental-orders/${editingOrderId}?companyId=${activeCompanyId}`);
    const detail = await refreshed.json();
    renderAttachments(detail.attachments || []);
  } catch (err) {
    if (attachmentHint) attachmentHint.textContent = err.message;
  }
});

attachmentsList.addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-remove-attachment");
  const url = e.target.getAttribute("data-url");
  if (!id || !editingOrderId) return;
  e.preventDefault();
  try {
    const session = window.RentSoft?.getSession?.();
    const actorName = session?.user?.name ? String(session.user.name) : null;
    const actorEmail = session?.user?.email ? String(session.user.email) : null;
    await deleteUploadedFile(url).catch(() => {});
    await fetch(`/api/rental-orders/${editingOrderId}/attachments/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, actorName, actorEmail }),
    });
    const refreshed = await fetch(`/api/rental-orders/${editingOrderId}?companyId=${activeCompanyId}`);
    const detail = await refreshed.json();
    renderAttachments(detail.attachments || []);
  } catch (err) {
    attachmentHint.textContent = err.message;
  }
});

closeSalesModalBtn.addEventListener("click", (e) => {
  e.preventDefault();
  closeSalesModal();
});

salesModal.addEventListener("click", (e) => {
  if (e.target === salesModal) closeSalesModal();
});

closeFeesModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeFeesModal();
});

feesModal?.addEventListener("click", (e) => {
  if (e.target === feesModal) closeFeesModal();
});

closeLineItemDocsModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeLineItemDocsModal();
});

lineItemDocsModal?.addEventListener("click", (e) => {
  if (e.target === lineItemDocsModal) closeLineItemDocsModal();
});

closeLineItemTimeModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeLineItemTimeModal();
});

lineItemTimeModal?.addEventListener("click", (e) => {
  if (e.target === lineItemTimeModal) closeLineItemTimeModal();
});

closeLineItemActualModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeLineItemActualModal();
});

lineItemActualModal?.addEventListener("click", (e) => {
  if (e.target === lineItemActualModal) {
    closeLineItemActualModal();
    return;
  }
  const removePauseIndex = e.target.getAttribute("data-remove-pause");
  if (removePauseIndex !== null) {
    e.preventDefault();
    const li = getEditingLineItemActual();
    if (!li) return;
    normalizePausePeriods(li);
    li.pausePeriods.splice(Number(removePauseIndex), 1);
    renderLineItemPausePeriods(li);
    scheduleDraftSave();
  }
});

lineItemPauseToggleBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!lineItemPauseDetails) return;
  lineItemPauseDetails.open = !lineItemPauseDetails.open;
  if (lineItemPauseDetails.open) lineItemPauseStartInput?.focus();
});

lineItemPauseAddBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const li = getEditingLineItemActual();
  if (!li) return;
  const startLocal = lineItemPauseStartInput?.value || "";
  const endLocal = lineItemPauseEndInput?.value || "";
  const startAt = fromLocalInputValue(startLocal);
  const endAt = fromLocalInputValue(endLocal);
  if (!startAt || !endAt) {
    if (lineItemActualHint) lineItemActualHint.textContent = "Pause start and end are required.";
    return;
  }
  if (!(new Date(endAt) > new Date(startAt))) {
    if (lineItemActualHint) lineItemActualHint.textContent = "Pause end must be after pause start.";
    return;
  }
  normalizePausePeriods(li);
  li.pausePeriods.push({ startAt, endAt });
  if (lineItemPauseStartInput) lineItemPauseStartInput.value = "";
  if (lineItemPauseEndInput) lineItemPauseEndInput.value = "";
  renderLineItemPausePeriods(li);
  scheduleDraftSave();
});

lineItemActualSaveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const li = getEditingLineItemActual();
  if (!li) return;
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  const { targetPickup, targetReturn } = collectActualModalTargets();
  const pickupChanged = targetPickup !== (li.pickedUpAt || null);
  const returnChanged = targetReturn !== (li.returnedAt || null);
  if (!pickupChanged && !returnChanged) {
    if (lineItemActualHint) lineItemActualHint.textContent = "No changes to save.";
    return;
  }

  lineItemActualSaveBtn.disabled = true;
  if (lineItemActualHint) lineItemActualHint.textContent = "Saving actual period...";
  try {
    await applyActualPeriodToLineItem(li, { targetPickup, targetReturn });
    renderLineItems();
    scheduleDraftSave();
    if (lineItemActualHint) lineItemActualHint.textContent = "Actual rental period saved.";
    closeLineItemActualModal();
  } catch (err) {
    if (lineItemActualHint) lineItemActualHint.textContent = err?.message || "Unable to save actual period.";
  } finally {
    lineItemActualSaveBtn.disabled = false;
  }
});

lineItemActualSaveAllBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
  const { targetPickup, targetReturn } = collectActualModalTargets();
  lineItemActualSaveAllBtn.disabled = true;
  if (lineItemActualHint) lineItemActualHint.textContent = "Saving actual period for all line items...";
  try {
    for (const li of draft.lineItems || []) {
      await applyActualPeriodToLineItem(li, { targetPickup, targetReturn });
    }
    renderLineItems();
    scheduleDraftSave();
    if (lineItemActualHint) lineItemActualHint.textContent = "Actual rental period saved for all line items.";
    closeLineItemActualModal();
  } catch (err) {
    if (lineItemActualHint) lineItemActualHint.textContent = err?.message || "Unable to save actual period.";
  } finally {
    lineItemActualSaveAllBtn.disabled = false;
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (extrasDrawerOpen) {
    closeExtrasDrawer();
    return;
  }
});

let lineItemTimeRefreshTimer = null;

async function syncLineItemTimeFromModal({ immediate = false, reportErrors = false, force = false } = {}) {
  const li = getEditingLineItemTime();
  if (!li) return;
  const startLocal = lineItemStartInput?.value || "";
  const endLocalInput = lineItemEndInput?.value || "";
  const endLocal = endLocalInput || (startLocal ? addHoursToLocalValue(startLocal, 24) : "");
  const hasChange = startLocal !== (li.startLocal || "") || endLocal !== (li.endLocal || "");
  li.startLocal = startLocal;
  li.endLocal = endLocal;
  applyOrderedPickup(li);

  const run = async () => {
    const startAt = fromLocalInputValue(li.startLocal);
    const endAt = fromLocalInputValue(li.endLocal);
    if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
      if (reportErrors) setCompanyMeta("Line item end time must be after start time.");
      return;
    }
    try {
      await refreshAvailabilityForLineItem(li);
    } catch (err) {
      if (reportErrors) setCompanyMeta(err?.message ? String(err.message) : String(err));
    }
    draft.lineItems = mergeLineItems(draft.lineItems);
    renderLineItems();
    scheduleDraftSave();
    renderLineItemTimeModal();
  };

  if (!force && !hasChange && immediate) return;

  if (immediate || force) {
    await run();
    return;
  }

  if (lineItemTimeRefreshTimer) clearTimeout(lineItemTimeRefreshTimer);
  lineItemTimeRefreshTimer = setTimeout(run, 300);
}

lineItemStartInput?.addEventListener("input", () => {
  syncLineItemTimeFromModal();
});

lineItemEndInput?.addEventListener("input", () => {
  syncLineItemTimeFromModal();
});

lineItemStartInput?.addEventListener("change", () => {
  syncLineItemTimeFromModal({ immediate: true, reportErrors: true });
});

lineItemEndInput?.addEventListener("change", () => {
  syncLineItemTimeFromModal({ immediate: true, reportErrors: true });
});

lineItemTimeSaveBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!getEditingLineItemTime()) return;
  await syncLineItemTimeFromModal({ immediate: true, reportErrors: true });
  closeLineItemTimeModal();
});

lineItemTimeApplyAllBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const startLocal = lineItemStartInput?.value || "";
  const endLocal = lineItemEndInput?.value || "";
  if (!startLocal || !endLocal) return;
  for (const li of draft.lineItems || []) {
    li.startLocal = startLocal;
    li.endLocal = endLocal;
    applyOrderedPickup(li);
    await refreshAvailabilityForLineItem(li).catch(() => {});
  }
  draft.lineItems = mergeLineItems(draft.lineItems);
  renderLineItems();
  scheduleDraftSave();
  closeLineItemTimeModal();
});

lineItemBeforeNotes?.addEventListener("input", (e) => {
  const li = getEditingLineItem();
  if (!li) return;
  li.beforeNotes = e.target.value;
  scheduleDraftSave();
});

lineItemAfterNotes?.addEventListener("input", (e) => {
  const li = getEditingLineItem();
  if (!li) return;
  li.afterNotes = e.target.value;
  scheduleDraftSave();
});

lineItemAiReport?.addEventListener("input", (e) => {
  const li = getEditingLineItem();
  if (!li) return;
  li.aiDamageReport = e.target.value;
  scheduleDraftSave();
});

async function copyText(text) {
  const value = String(text || "");
  if (!value.trim()) return;
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const el = document.createElement("textarea");
  el.value = value;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

lineItemAiCopyBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const li = getEditingLineItem();
  if (!li) return;
  try {
    await copyText(li.aiDamageReport || "");
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Copied.";
  } catch (err) {
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = err?.message || "Unable to copy.";
  }
});

lineItemAiClearBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  const li = getEditingLineItem();
  if (!li) return;
  li.aiDamageReport = "";
  if (lineItemAiReport) lineItemAiReport.value = "";
  if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Cleared.";
  scheduleDraftSave();
});

lineItemAiGenerateBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  const li = getEditingLineItem();
  if (!li) return;
  if (!activeCompanyId) {
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Set company first.";
    return;
  }
  const beforeImages = Array.isArray(li.beforeImages) ? li.beforeImages : [];
  const afterImages = Array.isArray(li.afterImages) ? li.afterImages : [];
  if (!beforeImages.length || !afterImages.length) {
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Upload at least 1 Before and 1 After image first.";
    return;
  }

  const typeName = typesCache.find((t) => String(t.id) === String(li.typeId))?.name || "Line item";
  const startAt = li.startLocal ? new Date(li.startLocal).toLocaleString() : "--";
  const endAt = li.endLocal ? new Date(li.endLocal).toLocaleString() : "--";
  const extraContext = `Rental order: ${draft.roNumber || draft.quoteNumber || "(unsaved)"}\nItem: ${typeName}\nPeriod: ${startAt} -> ${endAt}`;

  if (lineItemAiGenerateBtn) lineItemAiGenerateBtn.disabled = true;
  if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Generating...";

  try {
    const res = await fetch("/api/ai/damage-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        beforeImages,
        afterImages,
        beforeNotes: li.beforeNotes || "",
        afterNotes: li.afterNotes || "",
        extraContext,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to generate report");
    li.aiDamageReport = data.reportMarkdown || "";
    if (lineItemAiReport) lineItemAiReport.value = li.aiDamageReport;
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = "Generated.";
    scheduleDraftSave();
  } catch (err) {
    if (lineItemAiReportHint) lineItemAiReportHint.textContent = err?.message || "Unable to generate report.";
  } finally {
    if (lineItemAiGenerateBtn) lineItemAiGenerateBtn.disabled = false;
  }
});

lineItemBeforeUpload?.addEventListener("change", async (e) => {
  const li = getEditingLineItem();
  if (!li) return;
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  try {
    for (const file of files) {
      const url = await uploadImage({ file });
      li.beforeImages = [...(li.beforeImages || []), url];
    }
    renderLineItemDocsModal();
    renderLineItems();
    scheduleDraftSave();
  } catch (err) {
    setCompanyMeta(err.message);
  }
});

lineItemAfterUpload?.addEventListener("change", async (e) => {
  const li = getEditingLineItem();
  if (!li) return;
  const files = Array.from(e.target.files || []);
  e.target.value = "";
  try {
    for (const file of files) {
      const url = await uploadImage({ file });
      li.afterImages = [...(li.afterImages || []), url];
    }
    renderLineItemDocsModal();
    renderLineItems();
    scheduleDraftSave();
  } catch (err) {
    setCompanyMeta(err.message);
  }
});

lineItemDocsModal?.addEventListener("click", async (e) => {
  const li = getEditingLineItem();
  if (!li) return;

  const beforeUrl = e.target.getAttribute("data-remove-before");
  if (beforeUrl) {
    e.preventDefault();
    try {
      await deleteUploadedImage(beforeUrl);
      li.beforeImages = (li.beforeImages || []).filter((u) => u !== beforeUrl);
      renderLineItemDocsModal();
      renderLineItems();
      scheduleDraftSave();
    } catch (err) {
      setCompanyMeta(err.message);
    }
    return;
  }

  const afterUrl = e.target.getAttribute("data-remove-after");
  if (afterUrl) {
    e.preventDefault();
    try {
      await deleteUploadedImage(afterUrl);
      li.afterImages = (li.afterImages || []).filter((u) => u !== afterUrl);
      renderLineItemDocsModal();
      renderLineItems();
      scheduleDraftSave();
    } catch (err) {
      setCompanyMeta(err.message);
    }
  }
});

openSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openSideAddressPicker().catch((err) => {
    if (sideAddressPickerMeta) sideAddressPickerMeta.textContent = err?.message || String(err);
  });
});

closeSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSideAddressPickerModal();
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

saveSideAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveSideAddressFromPicker();
});

salesForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    setCompanyMeta("Set company first.");
    return;
  }
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
    await loadSales();
    if (data?.id) {
      salesSelect.value = String(data.id);
      draft.salespersonId = Number(data.id);
      scheduleDraftSave();
    }
  } catch (err) {
    setCompanyMeta(err.message);
  }
});

function init() {
  updateModeLabels();
  if (activeCompanyId) {
    window.RentSoft?.setCompanyId?.(activeCompanyId);
    if (backToList) {
      backToList.href =
        String(fromParam || "").toLowerCase() === "quotes"
          ? "rental-quotes.html"
          : ["workbench", "work-bench", "bench"].includes(String(fromParam || "").toLowerCase())
            ? "work-bench.html"
            : String(fromParam || "").toLowerCase() === "dashboard"
              ? "dashboard.html"
            : "rental-orders.html";
    }

    setCompanyMeta("");

    if (!editingOrderId && startBlank) {
      try {
        localStorage.removeItem(draftKey());
      } catch (_) {}
      resetDraftForNew();
    } else {
      loadDraftFromStorage();
    }

    if (!editingOrderId && initialStatusParam) {
      draft.status = normalizeOrderStatus(initialStatusParam);
    }
    if (!startBlank) ensureAtLeastOneLineItem();
    if (!startBlank) ensureAtLeastOneFeeRow();
    initFormFieldsFromDraft();
    updatePdfButtonState();

    hydrateLookups()
      .then(async () => {
        applySuggestedRatesToLineItems();
        renderFees();
        renderLineItems();
        renderNotes([]);
        renderAttachments([]);
        if (editingOrderId) await loadOrder();
      })
      .catch((err) => setCompanyMeta(err.message));
  } else {
    setCompanyMeta("Log in to continue.");
  }

    if (openHistoryBtn) {
      openHistoryBtn.style.display = editingOrderId ? "inline-flex" : "none";
    }
    if (openInvoicesBtn) {
      openInvoicesBtn.style.display = editingOrderId ? "inline-flex" : "none";
    }
    syncExtrasDisabledState();

  try {
    const existing = localStorage.getItem("roUserName");
    if (existing && noteUserInput) noteUserInput.value = existing;
  } catch (_) {}
}

init();
