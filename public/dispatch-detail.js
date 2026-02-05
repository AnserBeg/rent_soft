const params = new URLSearchParams(window.location.search);
const lastSelection = (() => {
  try {
    const raw = localStorage.getItem("rentSoft.dispatch.lastSelection");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();
const initialCompanyId =
  params.get("companyId") ||
  (lastSelection?.companyId ? String(lastSelection.companyId) : null) ||
  window.RentSoft?.getCompanyId?.();
const initialEquipmentId = params.get("equipmentId") || (lastSelection?.equipmentId ? String(lastSelection.equipmentId) : null);
const initialOrderId = params.get("orderId") || (lastSelection?.orderId ? String(lastSelection.orderId) : null);

const companyMeta = document.getElementById("company-meta");
const detailSummary = document.getElementById("dispatch-detail-summary");

const detailEmpty = document.getElementById("dispatch-detail-empty");
const detailWrap = document.getElementById("dispatch-detail");
const unitDetails = document.getElementById("unit-details");
const orderDetails = document.getElementById("order-details");
const lineItemDetails = document.getElementById("line-item-details");
const guardNotesList = document.getElementById("guard-notes-list");
const guardNotesEmpty = document.getElementById("guard-notes-empty");
const guardNotesEditor = document.getElementById("guard-notes-editor");
const guardNotesToolbar = document.getElementById("guard-notes-toolbar");
const guardNotesInput = document.getElementById("guard-notes-input");
const guardNotesInsertImageBtn = document.getElementById("guard-notes-insert-image");
const guardNotesImages = document.getElementById("guard-notes-images");
const guardNotesPreviews = document.getElementById("guard-notes-previews");
const guardNotesClear = document.getElementById("guard-notes-clear");
const guardNotesStatus = document.getElementById("guard-notes-status");
const guardNotesSubmitBtn = document.getElementById("guard-notes-submit");
const createWorkOrderBtn = document.getElementById("create-work-order");
const openSiteAddressPickerBtn = document.getElementById("open-site-address-picker");
const siteAddressStatus = document.getElementById("site-address-status");
const siteAddressPickerModal = document.getElementById("site-address-picker-modal");
const closeSiteAddressPickerBtn = document.getElementById("close-site-address-picker");
const saveSiteAddressPickerBtn = document.getElementById("save-site-address-picker");
const siteAddressPickerSearch = document.getElementById("site-address-picker-search");
const siteAddressPickerInput = document.getElementById("site-address-picker-input");
const siteAddressPickerMapEl = document.getElementById("site-address-picker-map");
const siteAddressPickerMeta = document.getElementById("site-address-picker-meta");
const siteAddressPickerSuggestions = document.getElementById("site-address-picker-suggestions");
const siteAddressPickerMapStyle = document.getElementById("site-address-picker-map-style");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let selectedUnit = null;
let orderCache = new Map();
let currentOrderDetail = null;
let equipmentId = initialEquipmentId;
let orderId = initialOrderId;
let siteAddressPicker = {
  mode: "google",
  mapStyle: "street",
  google: {
    map: null,
    marker: null,
    autocomplete: null,
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
    searchBound: false,
  },
  selected: null, // { lat, lng, provider, query }
};
let siteAddressInputBound = false;
let rentalInfoFields = null;
let guardNotesState = [];
let guardNotesPendingImages = [];
let guardNotesUploadsInFlight = 0;
let guardNotesUploadToken = 0;
let guardNotesEditing = null;
let guardNotesEditingToken = 0;
const guardNotesSelection = { lastRange: null };
let guardNotesInsertMode = null;

function fmtDate(value, withTime = false) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

function docNumberFor(row) {
  const ro = row?.ro_number || row?.roNumber || null;
  const quote = row?.quote_number || row?.quoteNumber || null;
  const ext = row?.external_contract_number || row?.externalContractNumber || null;
  return ro || quote || ext || (row?.order_id ? `#${row.order_id}` : "--");
}

function equipmentLabel(eq) {
  if (!eq) return "--";
  const serial = eq.serial_number ? String(eq.serial_number).trim() : "";
  const model = eq.model_name ? String(eq.model_name).trim() : "";
  const type = eq.type_name || eq.type || "Equipment";
  if (serial && model) return `${type} Aú ${serial} Aú ${model}`;
  if (serial) return `${type} Aú ${serial}`;
  if (model) return `${type} Aú ${model}`;
  return `${type} #${eq.id}`;
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

function formatContactLines(label, contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) return "--";
  return contacts
    .map((contact) => {
      const name = contact?.name || "--";
      const title = contact?.title || "";
      const email = contact?.email || "--";
      const phone = contact?.phone || "--";
      const nameLine = title ? `${name} - ${title}` : name;
      return `${label}: ${nameLine} | ${email} | ${phone}`;
    })
    .join("<br />");
}

function formatCoverageHours(coverage) {
  if (!coverage) return "--";
  let raw = coverage;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return "--";
    }
  }
  if (!raw || typeof raw !== "object") return "--";

  const dayLabels = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const dayKeys = Object.keys(dayLabels);
  const timeToMinutes = (value) => {
    const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };

  const slots = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const startDay = String(entry.startDay || entry.start_day || "").toLowerCase();
      const endDay = String(entry.endDay || entry.end_day || startDay || "").toLowerCase();
      const startTime = entry.startTime || entry.start_time || entry.start || "";
      const endTime = entry.endTime || entry.end_time || entry.end || "";
      if (!startDay || !endDay || (!startTime && !endTime)) return;
      slots.push({ startDay, endDay, startTime, endTime });
    });
  } else {
    dayKeys.forEach((day) => {
      const entry = raw[day] || {};
      const startTime = entry.start || "";
      const endTime = entry.end || "";
      if (!startTime && !endTime) return;
      let endDay = day;
      const explicit = entry.endDayOffset ?? entry.end_day_offset;
      if (explicit === 1 || explicit === "1" || explicit === true || entry.spansMidnight === true) {
        const idx = dayKeys.indexOf(day);
        endDay = dayKeys[(idx + 1) % dayKeys.length];
      } else if (startTime && endTime) {
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
          const idx = dayKeys.indexOf(day);
          endDay = dayKeys[(idx + 1) % dayKeys.length];
        }
      }
      slots.push({ startDay: day, endDay, startTime, endTime });
    });
  }

  const sorted = slots.sort((a, b) => {
    const dayDiff = dayKeys.indexOf(a.startDay) - dayKeys.indexOf(b.startDay);
    if (dayDiff) return dayDiff;
    const aStart = timeToMinutes(a.startTime) ?? 0;
    const bStart = timeToMinutes(b.startTime) ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = timeToMinutes(a.endTime) ?? 0;
    const bEnd = timeToMinutes(b.endTime) ?? 0;
    return aEnd - bEnd;
  });

  const lines = sorted.map((slot) => {
    const startLabel = dayLabels[slot.startDay] || slot.startDay || "--";
    const endLabel = dayLabels[slot.endDay] || slot.endDay || "--";
    const start = slot.startTime || "--";
    const end = slot.endTime || "--";
    if (slot.startDay === slot.endDay) {
      return `${startLabel}: ${start} - ${end}`;
    }
    return `${startLabel} ${start} - ${endLabel} ${end}`;
  });

  return lines.length ? lines.join("<br />") : "--";
}

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  siteContacts: { enabled: true, required: true },
  notificationCircumstances: { enabled: true, required: false },
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

rentalInfoFields = normalizeRentalInfoFields(null);

function isRentalInfoEnabled(key) {
  return rentalInfoFields?.[key]?.enabled !== false;
}

function applyRentalInfoConfig() {
  const siteEnabled = isRentalInfoEnabled("siteAddress");
  if (openSiteAddressPickerBtn) openSiteAddressPickerBtn.style.display = siteEnabled ? "" : "none";
  if (siteAddressStatus) siteAddressStatus.style.display = siteEnabled ? "" : "none";
  if (siteAddressPickerModal) siteAddressPickerModal.style.display = siteEnabled ? "" : "none";
}

function detailItem(label, value, className = "") {
  const classes = ["detail-item", className].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <div class="detail-label">${label}</div>
      <div class="detail-value">${value ?? "--"}</div>
    </div>
  `;
}

function generalNotesImagesFromDetail(detail) {
  const list = Array.isArray(detail?.attachments) ? detail.attachments : [];
  return list.filter((img) => String(img?.category || "") === "general_notes" && img?.url);
}

function renderGeneralNotesImages(images) {
  const rows = Array.isArray(images) ? images : [];
  if (!rows.length) return "";
  const tiles = rows
    .map((img) => {
      const url = escapeHtml(img.url || "");
      const name = escapeHtml(img.file_name || img.fileName || "General notes image");
      return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${name}" loading="lazy" /></a>`;
    })
    .join("");
  return `<div class="general-notes-images">${tiles}</div>`;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function normalizeRichTextValue(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const looksLikeHtml = /<\s*[a-z][\s\S]*>/i.test(raw);
  const html = looksLikeHtml ? raw : escapeHtml(raw).replaceAll("\n", "<br />");
  return sanitizeRichText(html);
}

function setRichTextValue(editor, hiddenInput, value) {
  const cleaned = normalizeRichTextValue(value);
  if (editor) editor.innerHTML = cleaned;
  if (hiddenInput) hiddenInput.value = cleaned;
  return cleaned;
}

function getRichTextValue(editor, hiddenInput) {
  const raw = editor ? editor.innerHTML : String(hiddenInput?.value || "");
  const cleaned = normalizeRichTextValue(raw);
  if (hiddenInput) hiddenInput.value = cleaned;
  return cleaned;
}

function richTextHasContent(value) {
  const cleaned = normalizeRichTextValue(value);
  if (!cleaned) return false;
  if (/<img\b/i.test(cleaned)) return true;
  const doc = new DOMParser().parseFromString(`<div>${cleaned}</div>`, "text/html");
  const text = String(doc.body.textContent || "").replace(/\s+/g, " ").trim();
  return Boolean(text);
}

function richTextToPlainText(value) {
  const cleaned = normalizeRichTextValue(value);
  if (!cleaned) return "";
  const doc = new DOMParser().parseFromString(`<div>${cleaned}</div>`, "text/html");
  return String(doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function storeRichTextSelection(editor, state) {
  if (!editor || !state) return;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;
  state.lastRange = range.cloneRange();
}

function restoreRichTextSelection(editor, state) {
  if (!editor || !state?.lastRange) return;
  const sel = window.getSelection();
  if (!sel) return;
  if (!editor.contains(state.lastRange.commonAncestorContainer)) return;
  sel.removeAllRanges();
  sel.addRange(state.lastRange);
}

function execRichTextCommand(editor, state, command, value) {
  if (!editor) return;
  editor.focus();
  restoreRichTextSelection(editor, state);
  document.execCommand(command, false, value);
  storeRichTextSelection(editor, state);
}

function insertRichTextImage(editor, state, url, name) {
  if (!editor || !url) return;
  editor.focus();
  restoreRichTextSelection(editor, state);
  document.execCommand("insertImage", false, url);
  if (name) {
    const imgs = Array.from(editor.querySelectorAll("img"));
    const matching = imgs.filter((img) => String(img.getAttribute("src") || "") === String(url));
    const last = (matching.length ? matching : imgs)[(matching.length ? matching : imgs).length - 1];
    if (last) last.alt = String(name || "Guard notes image");
  }
  storeRichTextSelection(editor, state);
}

function setGuardNotesHtml(value) {
  return setRichTextValue(guardNotesEditor, guardNotesInput, value);
}

function getGuardNotesHtml() {
  return getRichTextValue(guardNotesEditor, guardNotesInput);
}

function getGuardNotesPlainText() {
  return richTextToPlainText(getGuardNotesHtml());
}

function storeGuardNotesSelection() {
  storeRichTextSelection(guardNotesEditor, guardNotesSelection);
}

function restoreGuardNotesSelection() {
  restoreRichTextSelection(guardNotesEditor, guardNotesSelection);
}

function execGuardNotesCommand(command, value) {
  execRichTextCommand(guardNotesEditor, guardNotesSelection, command, value);
}

function insertGuardNotesImage(url, name) {
  insertRichTextImage(guardNotesEditor, guardNotesSelection, url, name);
}

function storeGuardNoteEditSelection(editor) {
  if (!guardNotesEditing) return;
  storeRichTextSelection(editor, guardNotesEditing);
}

function restoreGuardNoteEditSelection(editor) {
  if (!guardNotesEditing) return;
  restoreRichTextSelection(editor, guardNotesEditing);
}

function execGuardNoteEditCommand(editor, command, value) {
  if (!guardNotesEditing) return;
  execRichTextCommand(editor, guardNotesEditing, command, value);
  if (editor) guardNotesEditing.noteText = editor.innerHTML || "";
}

function insertGuardNoteEditImage(editor, url, name) {
  if (!guardNotesEditing) return;
  insertRichTextImage(editor, guardNotesEditing, url, name);
}

async function getPublicConfig() {
  const res = await fetch("/api/public-config");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load config");
  return data || {};
}

async function loadCompanySettings() {
  rentalInfoFields = normalizeRentalInfoFields(null);
  applyRentalInfoConfig();
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    rentalInfoFields = normalizeRentalInfoFields(data.settings?.rental_info_fields || null);
    applyRentalInfoConfig();
  }
}

function openSiteAddressPickerModal() {
  siteAddressPickerModal?.classList.add("show");
}

function closeSiteAddressPickerModal() {
  siteAddressPickerModal?.classList.remove("show");
  if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "";
  if (siteAddressPickerSearch) siteAddressPickerSearch.value = "";
  if (siteAddressPickerInput) siteAddressPickerInput.value = "";
  if (siteAddressPickerSuggestions) siteAddressPickerSuggestions.hidden = true;
  if (siteAddressPickerSuggestions) siteAddressPickerSuggestions.replaceChildren();
  if (siteAddressPicker.google.debounceTimer) {
    clearTimeout(siteAddressPicker.google.debounceTimer);
    siteAddressPicker.google.debounceTimer = null;
  }
  siteAddressPicker.google.searchSeq = (siteAddressPicker.google.searchSeq || 0) + 1;
  siteAddressPicker.google.pickSeq = (siteAddressPicker.google.pickSeq || 0) + 1;
  if (siteAddressPicker.leaflet.debounceTimer) {
    clearTimeout(siteAddressPicker.leaflet.debounceTimer);
    siteAddressPicker.leaflet.debounceTimer = null;
  }
  try {
    siteAddressPicker.leaflet.searchAbort?.abort?.();
  } catch { }
  siteAddressPicker.selected = null;
}

function setSiteAddressSelected(lat, lng, { provider, query } = {}) {
  siteAddressPicker.selected = {
    lat: Number(lat),
    lng: Number(lng),
    provider: provider || "manual",
    query: query || null,
  };
  if (siteAddressPickerMeta) {
    siteAddressPickerMeta.textContent = `Selected: ${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
  }
  if (siteAddressPickerInput && query) {
    siteAddressPickerInput.value = String(query);
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

function renderSiteAddressSuggestions(predictions, onPick) {
  if (!siteAddressPickerSuggestions) return;
  siteAddressPickerSuggestions.replaceChildren();
  const rows = Array.isArray(predictions) ? predictions : [];
  if (!rows.length) {
    siteAddressPickerSuggestions.hidden = true;
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
    siteAddressPickerSuggestions.appendChild(btn);
  });
  siteAddressPickerSuggestions.hidden = false;
}

function hideSiteAddressSuggestions() {
  if (!siteAddressPickerSuggestions) return;
  siteAddressPickerSuggestions.hidden = true;
  siteAddressPickerSuggestions.replaceChildren();
}

function bindSiteAddressSearchMirror() {
  if (!siteAddressPickerInput || !siteAddressPickerSearch || siteAddressInputBound) return;
  siteAddressInputBound = true;
  siteAddressPickerInput.addEventListener("input", () => {
    const next = String(siteAddressPickerInput.value || "");
    if (siteAddressPickerSearch.value !== next) {
      siteAddressPickerSearch.value = next;
      siteAddressPickerSearch.dispatchEvent(new Event("input", { bubbles: true }));
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

function applyLeafletSiteAddressStyle(style) {
  const map = siteAddressPicker.leaflet.map;
  if (!map || !window.L) return;
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  if (!siteAddressPicker.leaflet.layers) siteAddressPicker.leaflet.layers = {};
  const layers = siteAddressPicker.leaflet.layers;
  if (!layers[normalized]) {
    const cfg = MAP_TILE_SOURCES[normalized];
    layers[normalized] = window.L.tileLayer(cfg.url, cfg.options);
  }
  Object.values(layers).forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  layers[normalized].addTo(map);
}

function applyGoogleSiteAddressStyle(style) {
  const map = siteAddressPicker.google.map;
  if (!map) return;
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  map.setMapTypeId(normalized === "satellite" ? "satellite" : "roadmap");
}

function setSiteAddressPickerMapStyle(style) {
  const normalized = normalizeMapStyle(style ?? siteAddressPicker.mapStyle);
  siteAddressPicker.mapStyle = normalized;
  if (siteAddressPickerMapStyle && siteAddressPickerMapStyle.value !== normalized) {
    siteAddressPickerMapStyle.value = normalized;
  }
  if (siteAddressPicker.mode === "google") {
    applyGoogleSiteAddressStyle(normalized);
  } else {
    applyLeafletSiteAddressStyle(normalized);
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

function resetSiteAddressPickerMapContainer() {
  if (!siteAddressPickerMapEl) return;
  try {
    siteAddressPicker.leaflet.map?.remove?.();
  } catch { }
  siteAddressPicker.leaflet.map = null;
  siteAddressPicker.leaflet.marker = null;
  siteAddressPicker.leaflet.layers = null;

  siteAddressPicker.google.map = null;
  siteAddressPicker.google.marker = null;
  siteAddressPicker.google.autocomplete = null;

  if (siteAddressPickerMapEl._leaflet_id) {
    delete siteAddressPickerMapEl._leaflet_id;
  }
  siteAddressPickerMapEl.replaceChildren();
}

function initLeafletSiteAddressPicker(center) {
  if (!siteAddressPickerMapEl || !window.L) throw new Error("Map library not available.");
  if (!siteAddressPicker.leaflet.map) {
    const map = window.L.map(siteAddressPickerMapEl, { scrollWheelZoom: true });
    map.on("click", (e) => {
      const lat = e?.latlng?.lat;
      const lng = e?.latlng?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (!siteAddressPicker.leaflet.marker) {
        siteAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
        siteAddressPicker.leaflet.marker.on("dragend", () => {
          const ll = siteAddressPicker.leaflet.marker?.getLatLng?.();
          if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
          setSiteAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
        });
      } else {
        siteAddressPicker.leaflet.marker.setLatLng([lat, lng]);
      }
      setSiteAddressSelected(lat, lng, { provider: "manual_pin" });
    });
    siteAddressPicker.leaflet.map = map;
  }
  applyLeafletSiteAddressStyle(siteAddressPicker.mapStyle);
  const map = siteAddressPicker.leaflet.map;
  map.setView([center.lat, center.lng], 16);
  setTimeout(() => map.invalidateSize?.(), 50);

  if (!siteAddressPicker.leaflet.searchBound && siteAddressPickerSearch) {
    siteAddressPicker.leaflet.searchBound = true;
    siteAddressPickerSearch.addEventListener("input", () => {
      const q = String(siteAddressPickerSearch.value || "").trim();
      if (!q) {
        hideSiteAddressSuggestions();
        return;
      }
      if (siteAddressPicker.leaflet.debounceTimer) clearTimeout(siteAddressPicker.leaflet.debounceTimer);
      siteAddressPicker.leaflet.debounceTimer = setTimeout(async () => {
        const seq = (siteAddressPicker.leaflet.searchSeq || 0) + 1;
        siteAddressPicker.leaflet.searchSeq = seq;
        try {
          siteAddressPicker.leaflet.searchAbort?.abort?.();
        } catch { }
        siteAddressPicker.leaflet.searchAbort = new AbortController();
        try {
          const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}&limit=6`, {
            signal: siteAddressPicker.leaflet.searchAbort.signal,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Unable to search address.");
          if (seq !== siteAddressPicker.leaflet.searchSeq) return;
          if (String(siteAddressPickerSearch.value || "").trim() !== q) return;
          const results = (data.results || []).map((r) => ({
            place_id: null,
            description: r.label,
            __rs_lat: r.latitude,
            __rs_lng: r.longitude,
          }));
          renderSiteAddressSuggestions(results, (picked) => {
            const label = picked?.description || "";
            const lat = Number(picked?.__rs_lat);
            const lng = Number(picked?.__rs_lng);
            hideSiteAddressSuggestions();
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            if (siteAddressPickerInput) siteAddressPickerInput.value = label || "";
            if (siteAddressPickerSearch) siteAddressPickerSearch.value = label || "";
            if (!siteAddressPicker.leaflet.marker) {
              siteAddressPicker.leaflet.marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
              siteAddressPicker.leaflet.marker.on("dragend", () => {
                const ll = siteAddressPicker.leaflet.marker?.getLatLng?.();
                if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return;
                setSiteAddressSelected(ll.lat, ll.lng, { provider: "manual_pin" });
              });
            } else {
              siteAddressPicker.leaflet.marker.setLatLng([lat, lng]);
            }
            map.setView([lat, lng], 17);
            setSiteAddressSelected(lat, lng, { provider: "nominatim", query: label });
          });
        } catch (err) {
          hideSiteAddressSuggestions();
          const msg = err?.message || String(err);
          if (siteAddressPickerMeta) {
            siteAddressPickerMeta.textContent = `${msg}. You can still click the map to drop a pin.`;
          }
        }
      }, 300);
    });
    siteAddressPickerSearch.addEventListener("blur", () => setTimeout(() => hideSiteAddressSuggestions(), 150));
  }
}

function initGoogleSiteAddressPicker(center) {
  if (!siteAddressPickerMapEl || !window.google?.maps) throw new Error("Google Maps not available.");
  if (!siteAddressPicker.google.map) {
    const mapStyle = normalizeMapStyle(siteAddressPicker.mapStyle);
    const map = new window.google.maps.Map(siteAddressPickerMapEl, {
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
      if (!siteAddressPicker.google.marker) {
        siteAddressPicker.google.marker = new window.google.maps.Marker({ position: { lat, lng }, map, draggable: true });
        siteAddressPicker.google.marker.addListener("dragend", (evt) => {
          const dLat = evt?.latLng?.lat?.();
          const dLng = evt?.latLng?.lng?.();
          if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
          setSiteAddressSelected(dLat, dLng, { provider: "manual_pin" });
        });
      } else {
        siteAddressPicker.google.marker.setPosition({ lat, lng });
      }
      setSiteAddressSelected(lat, lng, { provider: "manual_pin" });
    });

    if (!window.google.maps.places?.AutocompleteService || !window.google.maps.places?.PlacesService) {
      if (siteAddressPickerMeta) {
        siteAddressPickerMeta.textContent = "Click the map to drop a pin (Places library missing).";
      }
    } else {
      siteAddressPicker.google.autocompleteService = new window.google.maps.places.AutocompleteService();
      siteAddressPicker.google.placesService = new window.google.maps.places.PlacesService(map);
      const requestPredictions = (input) =>
        new Promise((resolve, reject) => {
          siteAddressPicker.google.autocompleteService.getPlacePredictions(
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
          siteAddressPicker.google.placesService.getDetails(
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

      siteAddressPickerSearch?.addEventListener("input", () => {
        const q = String(siteAddressPickerSearch.value || "").trim();
        if (!q) {
          hideSiteAddressSuggestions();
          return;
        }
        if (siteAddressPicker.google.debounceTimer) clearTimeout(siteAddressPicker.google.debounceTimer);
        const seq = (siteAddressPicker.google.searchSeq || 0) + 1;
        siteAddressPicker.google.searchSeq = seq;
        siteAddressPicker.google.debounceTimer = setTimeout(async () => {
          try {
            const preds = await requestPredictions(q);
            if (seq !== siteAddressPicker.google.searchSeq) return;
            if (String(siteAddressPickerSearch.value || "").trim() !== q) return;
            renderSiteAddressSuggestions(preds, async (p) => {
              hideSiteAddressSuggestions();
              const placeId = p?.place_id;
              if (!placeId) return;
              const label = p?.description || "";
              try {
                const pickSeq = (siteAddressPicker.google.pickSeq || 0) + 1;
                siteAddressPicker.google.pickSeq = pickSeq;
                const details = await fetchPlaceDetails(placeId, label);
                if (pickSeq !== siteAddressPicker.google.pickSeq) return;
                if (siteAddressPickerInput) siteAddressPickerInput.value = details.label;
                if (siteAddressPickerSearch) siteAddressPickerSearch.value = details.label;
                if (!siteAddressPicker.google.marker) {
                  siteAddressPicker.google.marker = new window.google.maps.Marker({
                    position: { lat: details.lat, lng: details.lng },
                    map,
                    draggable: true,
                  });
                  siteAddressPicker.google.marker.addListener("dragend", (evt) => {
                    const dLat = evt?.latLng?.lat?.();
                    const dLng = evt?.latLng?.lng?.();
                    if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;
                    setSiteAddressSelected(dLat, dLng, { provider: "manual_pin" });
                  });
                } else {
                  siteAddressPicker.google.marker.setPosition({ lat: details.lat, lng: details.lng });
                }
                map.setCenter({ lat: details.lat, lng: details.lng });
                map.setZoom(17);
                setSiteAddressSelected(details.lat, details.lng, { provider: "google_places", query: details.label });
              } catch (err) {
                if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
              }
            });
          } catch (err) {
            hideSiteAddressSuggestions();
            if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
          }
        }, 250);
      });

      siteAddressPickerSearch?.addEventListener("blur", () => {
        setTimeout(() => hideSiteAddressSuggestions(), 150);
      });
    }

    siteAddressPicker.google.map = map;
  }

  applyGoogleSiteAddressStyle(siteAddressPicker.mapStyle);
  siteAddressPicker.google.map.setCenter(center);
  siteAddressPicker.google.map.setZoom(16);
}

async function openSiteAddressPicker() {
  if (!activeCompanyId) {
    if (siteAddressStatus) siteAddressStatus.textContent = "No active company session.";
    return;
  }
  openSiteAddressPickerModal();
  if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Loading map...";
  hideSiteAddressSuggestions();
  bindSiteAddressSearchMirror();

  if (siteAddressPickerInput && currentOrderDetail?.order) {
    const existing = currentOrderDetail.order.site_address || currentOrderDetail.order.siteAddress || "";
    if (existing && !String(siteAddressPickerInput.value || "").trim()) siteAddressPickerInput.value = String(existing);
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
    resetSiteAddressPickerMapContainer();
    if (siteAddressPickerMeta) {
      siteAddressPickerMeta.textContent =
        "Google Maps API key is required. Set GOOGLE_MAPS_API_KEY and reload to use the map picker.";
    }
    return;
  }

  try {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Loading Google Maps...";
    if (!hasGoogle) await loadGoogleMaps(key);
    resetSiteAddressPickerMapContainer();
    siteAddressPicker.mode = "google";
    initGoogleSiteAddressPicker(center);
    if (siteAddressPickerMeta) {
      const places = window.google?.maps?.places;
      const hasSvc = !!places?.AutocompleteService;
      const msg = hasSvc ? "Search (Google Places) or click to drop a pin." : "Click to drop a pin (Places library missing).";
      siteAddressPickerMeta.textContent = msg;
    }
  } catch (err) {
    resetSiteAddressPickerMapContainer();
    if (siteAddressPickerMeta) {
      siteAddressPickerMeta.textContent =
        `Google Maps failed to load: ${err?.message || String(err)}. ` +
        "Check browser console for: InvalidKeyMapError / RefererNotAllowedMapError / ApiNotActivatedMapError / BillingNotEnabledMapError.";
    }
  }
}

async function saveSiteAddressFromPicker() {
  const orderIdValue = selectedUnit?.assignment?.order_id || orderId;
  if (!activeCompanyId || !orderIdValue) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "No rental order selected.";
    return;
  }
  const manual = String(siteAddressPickerInput?.value || "").trim();
  const fallbackQuery = siteAddressPicker.selected?.query ? String(siteAddressPicker.selected.query) : "";
  const fallbackCoords = siteAddressPicker.selected
    ? `${Number(siteAddressPicker.selected.lat).toFixed(6)}, ${Number(siteAddressPicker.selected.lng).toFixed(6)}`
    : "";
  const siteAddress = manual || fallbackQuery || fallbackCoords;
  if (!siteAddress) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = "Enter a site address or pick a point on the map.";
    return;
  }

  saveSiteAddressPickerBtn.disabled = true;
  try {
    const res = await fetch(`/api/rental-orders/${orderIdValue}/site-address`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        siteAddress,
        siteAddressLat: siteAddressPicker.selected?.lat ?? null,
        siteAddressLng: siteAddressPicker.selected?.lng ?? null,
        siteAddressQuery: siteAddressPicker.selected?.query ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to update site address.");
    const updatedAddress = data?.order?.site_address ?? siteAddress;
    if (currentOrderDetail?.order) {
      currentOrderDetail.order.site_address = updatedAddress;
      if (data?.order) {
        currentOrderDetail.order.site_address_lat = data.order.site_address_lat ?? currentOrderDetail.order.site_address_lat;
        currentOrderDetail.order.site_address_lng = data.order.site_address_lng ?? currentOrderDetail.order.site_address_lng;
        currentOrderDetail.order.site_address_query = data.order.site_address_query ?? currentOrderDetail.order.site_address_query;
      }
    }
    if (orderCache.has(String(orderIdValue))) {
      const cached = orderCache.get(String(orderIdValue));
      if (cached?.order) {
        cached.order.site_address = updatedAddress;
        if (data?.order) {
          cached.order.site_address_lat = data.order.site_address_lat ?? cached.order.site_address_lat;
          cached.order.site_address_lng = data.order.site_address_lng ?? cached.order.site_address_lng;
          cached.order.site_address_query = data.order.site_address_query ?? cached.order.site_address_query;
        }
      }
    }
    renderOrderDetail(selectedUnit, currentOrderDetail);
    if (siteAddressStatus) siteAddressStatus.textContent = `Site address updated at ${new Date().toLocaleTimeString()}`;
    closeSiteAddressPickerModal();
  } catch (err) {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
  } finally {
    saveSiteAddressPickerBtn.disabled = false;
  }
}

function updateDetailEmpty(show) {
  if (detailEmpty) detailEmpty.hidden = !show;
  if (detailWrap) detailWrap.hidden = show;
}

function renderUnitDetail(row) {
  const eq = row?.equipment || {};
  unitDetails.innerHTML = `
    ${detailItem("Type of equipment", eq.type_name || eq.type || "--")}
    ${detailItem("Serial", eq.serial_number || "--")}
    ${detailItem("Model", eq.model_name || "--")}
  `;
}

function renderOrderDetail(row, detail) {
  const order = detail?.order || {};

  const emergencyContacts = parseContacts(order.emergency_contacts || order.emergencyContacts || []);
  const siteContacts = parseContacts(order.site_contacts || order.siteContacts || []);
  const notificationCircumstances = order.notification_circumstances || order.notificationCircumstances || [];
  const coverageHours = order.coverage_hours || order.coverageHours || [];
  const siteAddress = order.site_address || order.siteAddress || "--";
  const criticalAreas = order.critical_areas || order.criticalAreas || "--";
  const generalNotes = order.general_notes || order.generalNotes || "";
  const generalNotesImages = generalNotesImagesFromDetail(detail);
  const generalNotesText = formatRichText(generalNotes);
  const generalNotesValue = generalNotesImages.length
    ? `${generalNotesText || "--"}<div class="general-notes-media">${renderGeneralNotesImages(generalNotesImages)}</div>`
    : (generalNotesText || "--");

  const orderDetailItems = [];
  if (isRentalInfoEnabled("siteContacts")) {
    orderDetailItems.push(detailItem("Site contacts", formatContactLines("Site contact", siteContacts)));
  }
  if (isRentalInfoEnabled("emergencyContacts")) {
    orderDetailItems.push(detailItem("Emergency contacts", formatContactLines("Emergency contact", emergencyContacts)));
  }
  orderDetails.innerHTML = orderDetailItems.join("");

  const lineDetailItems = [];
  if (isRentalInfoEnabled("siteAddress")) {
    lineDetailItems.push(detailItem("Site address", siteAddress || "--"));
  }
  if (isRentalInfoEnabled("criticalAreas")) {
    lineDetailItems.push(detailItem("Critical areas on site", criticalAreas || "--"));
  }
  if (isRentalInfoEnabled("notificationCircumstances")) {
    const notifValue = Array.isArray(notificationCircumstances) && notificationCircumstances.length
      ? notificationCircumstances.map(v => escapeHtml(v)).join(", ")
      : "--";
    lineDetailItems.push(detailItem("Notification circumstance", notifValue));
  }
  if (isRentalInfoEnabled("coverageHours")) {
    lineDetailItems.push(detailItem("Hours of coverage", formatCoverageHours(coverageHours)));
  }
  if (isRentalInfoEnabled("generalNotes")) {
    lineDetailItems.push(detailItem("General notes", generalNotesValue, "detail-item-wide"));
  }
  lineItemDetails.innerHTML = lineDetailItems.join("");
}

function guardNotesKey(row) {
  const equipmentIdValue = row?.assignment?.equipment_id ?? "0";
  const orderIdValue = row?.assignment?.order_id ?? "0";
  return `rentSoft.dispatch.guardNotes.${equipmentIdValue}.${orderIdValue}`;
}

function makeGuardNoteId(prefix = "note") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

function getGuardNotesUserName() {
  const session = window.RentSoft?.getSession?.();
  const user = session?.user || {};
  const candidates = [user.name, user.full_name, user.fullName, user.email];
  const value = candidates.find((entry) => String(entry || "").trim());
  return value ? String(value).trim() : "Unknown user";
}

function normalizeGuardNoteImages(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((img) => {
      if (!img) return null;
      if (typeof img === "string") {
        return { id: makeGuardNoteId("img"), name: "Photo", type: "", size: null, url: img };
      }
      if (typeof img !== "object") return null;
      const url = img.url || img.dataUrl || img.src || "";
      if (!url) return null;
      return {
        id: img.id || makeGuardNoteId("img"),
        name: String(img.name || "Photo"),
        type: img.type ? String(img.type) : "",
        size: Number.isFinite(img.size) ? img.size : null,
        url: String(url),
      };
    })
    .filter(Boolean);
}

function cloneGuardNoteImage(image) {
  if (!image || typeof image !== "object") return null;
  const url = image.url ? String(image.url) : "";
  if (!url) return null;
  return {
    id: image.id || makeGuardNoteId("img"),
    name: String(image.name || "Photo"),
    type: image.type ? String(image.type) : "",
    size: Number.isFinite(image.size) ? image.size : null,
    url,
  };
}

function normalizeGuardNotesList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = [];
  list.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const noteHtml = normalizeRichTextValue(item.note || item.text || "");
    const images = normalizeGuardNoteImages(item.images || item.photos || []);
    if (!richTextHasContent(noteHtml) && images.length === 0) return;
    normalized.push({
      id: item.id || makeGuardNoteId(),
      userName: String(item.userName || item.user_name || "Unknown user"),
      createdAt: item.createdAt || item.created_at || null,
      note: noteHtml,
      images,
    });
  });
  return normalized;
}

function readGuardNotesFromStorage(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeGuardNotesList(parsed);
  } catch {
    const legacy = String(raw || "").trim();
    if (!legacy) return [];
    const cleaned = normalizeRichTextValue(legacy);
    if (!richTextHasContent(cleaned)) return [];
    return [
      {
        id: makeGuardNoteId(),
        userName: "Imported note",
        createdAt: null,
        note: cleaned,
        images: [],
      },
    ];
  }
}

function buildDispatchWorkOrderSummary() {
  const inputNote = getGuardNotesPlainText();
  if (inputNote) return inputNote;

  const latest = guardNotesState.length ? guardNotesState[guardNotesState.length - 1] : null;
  if (!latest) return "";
  const noteText = richTextToPlainText(latest.note || "");
  const imageUrls = (latest.images || []).map((img) => img?.url).filter(Boolean);
  const metaParts = [];
  if (latest.userName) metaParts.push(`By ${latest.userName}`);
  if (latest.createdAt) metaParts.push(`At ${fmtDate(latest.createdAt, true)}`);
  const header = metaParts.length ? `Dispatch note (${metaParts.join(" · ")}):` : "Dispatch note:";
  const details = noteText ? `${header}\n${noteText}` : header;
  if (!imageUrls.length) return details;
  return `${details}\nPhotos: ${imageUrls.join(", ")}`;
}

function openWorkOrderFromDispatch() {
  if (!activeCompanyId) {
    if (guardNotesStatus) guardNotesStatus.textContent = "No active company session.";
    return;
  }
  const equipmentIdValue = selectedUnit?.assignment?.equipment_id;
  if (!equipmentIdValue) {
    if (guardNotesStatus) guardNotesStatus.textContent = "Select a unit to create a work order.";
    return;
  }
  const summary = buildDispatchWorkOrderSummary();
  const search = new URLSearchParams();
  search.set("companyId", String(activeCompanyId));
  search.set("unitId", String(equipmentIdValue));
  if (orderId) search.set("orderId", String(orderId));
  if (summary) search.set("summary", summary);
  search.set("source", "dispatch");
  window.location.href = `work-order-form.html?${search.toString()}`;
}

function renderGuardNoteImages(images) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return "";
  const tiles = list
    .map((img) => {
      const url = escapeHtml(img.url || "");
      if (!url) return "";
      const label = escapeHtml(img.name || "Photo");
      return `
        <a href="${url}" target="_blank" rel="noopener">
          <img src="${url}" alt="${label}" loading="lazy" />
        </a>
      `;
    })
    .join("");
  return tiles ? `<div class="guard-note-images">${tiles}</div>` : "";
}

function renderGuardNoteEditImages(images, noteId) {
  const list = Array.isArray(images) ? images : [];
  if (!list.length) return "";
  const tiles = list
    .map((img) => {
      const url = escapeHtml(img.url || "");
      if (!url) return "";
      const label = escapeHtml(img.name || "Photo");
      const imgId = escapeHtml(img.id || "");
      return `
        <div class="guard-note-edit-tile">
          <img src="${url}" alt="${label}" loading="lazy" />
          <button class="ghost tiny" type="button" data-remove-note-image="${escapeHtml(noteId)}" data-image-id="${imgId}">
            Remove
          </button>
        </div>
      `;
    })
    .join("");
  return tiles ? `<div class="guard-note-edit-images">${tiles}</div>` : "";
}

function renderGuardNoteView(note) {
  const name = escapeHtml(note.userName || "Unknown user");
  const when = fmtDate(note.createdAt, true);
  const text = formatRichText(note.note || "");
  return `
    <div class="note-meta note-meta-row">
      <span>${name} | ${when}</span>
      <div class="note-meta-actions">
        <button class="ghost tiny" type="button" data-edit-note="${escapeHtml(note.id)}">Edit</button>
        <button class="ghost tiny" type="button" data-delete-note="${escapeHtml(note.id)}">Delete</button>
      </div>
    </div>
    ${text ? `<div>${text}</div>` : ""}
    ${renderGuardNoteImages(note.images)}
  `;
}

function renderGuardNoteEditor(note, editing) {
  const name = escapeHtml(note.userName || "Unknown user");
  const when = fmtDate(note.createdAt, true);
  const noteText = formatRichText(editing.noteText || "");
  const noteId = escapeHtml(note.id);
  return `
    <div class="note-meta note-meta-row">
      <span>${name} | ${when}</span>
      <span class="pill">Editing</span>
    </div>
    <div class="rich-editor guard-note-editor">
      <div class="rich-toolbar guard-note-toolbar" data-note-toolbar="${noteId}" role="toolbar" aria-label="Guard note editor">
        <select data-rich="font" aria-label="Font">
          <option value="">Font</option>
          <option value="Inter">Inter</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Arial">Arial</option>
          <option value="Verdana">Verdana</option>
          <option value="Courier New">Courier New</option>
        </select>
        <select data-rich="size" aria-label="Font size">
          <option value="">Size</option>
          <option value="1">10</option>
          <option value="2">12</option>
          <option value="3">14</option>
          <option value="4">16</option>
          <option value="5">18</option>
          <option value="6">24</option>
          <option value="7">32</option>
        </select>
        <select data-rich="block" aria-label="Text style">
          <option value="">Style</option>
          <option value="p">Normal</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
        <button type="button" class="ghost tiny" data-rich-cmd="bold" aria-label="Bold"><strong>B</strong></button>
        <button type="button" class="ghost tiny" data-rich-cmd="italic" aria-label="Italic"><em>I</em></button>
        <button type="button" class="ghost tiny" data-rich-cmd="underline" aria-label="Underline"><span style="text-decoration:underline;">U</span></button>
        <button type="button" class="ghost tiny" data-rich-cmd="insertUnorderedList" aria-label="Bullet list">Bullets</button>
        <button type="button" class="ghost tiny" data-rich-cmd="insertOrderedList" aria-label="Numbered list">Numbers</button>
        <button type="button" class="ghost tiny" data-rich-action="link" aria-label="Insert link">Link</button>
        <button type="button" class="ghost tiny" data-rich-action="image" aria-label="Insert image">Image</button>
        <button type="button" class="ghost tiny" data-rich-action="clear" aria-label="Clear formatting">Clear</button>
      </div>
      <div class="rich-editor__body guard-note-edit-input" contenteditable="true" data-note-editor="${noteId}" data-placeholder="Update guard note...">${noteText}</div>
    </div>
    ${renderGuardNoteEditImages(editing.images, note.id)}
    <div class="guard-note-edit-actions">
      <label class="ghost tiny" for="guard-note-images-${noteId}">Add photos</label>
      <input id="guard-note-images-${noteId}" data-note-image-input="${noteId}" type="file" accept="image/*" multiple hidden />
      <button class="primary small" type="button" data-save-note="${noteId}">Save</button>
      <button class="ghost small" type="button" data-cancel-note="${noteId}">Cancel</button>
      <button class="ghost small" type="button" data-delete-note="${noteId}">Delete</button>
      <span class="hint" data-edit-status="${noteId}"></span>
    </div>
  `;
}

function renderGuardNotesList(notes) {
  if (!guardNotesList) return;
  guardNotesList.replaceChildren();
  const list = Array.isArray(notes) ? notes : [];
  if (guardNotesEmpty) guardNotesEmpty.hidden = list.length > 0;
  list.forEach((note) => {
    const row = document.createElement("div");
    row.className = "note-row";
    row.dataset.noteId = note.id;
    const isEditing = guardNotesEditing && guardNotesEditing.id === note.id;
    row.innerHTML = isEditing ? renderGuardNoteEditor(note, guardNotesEditing) : renderGuardNoteView(note);
    guardNotesList.appendChild(row);
  });
}

function renderGuardNotesPreviews() {
  if (!guardNotesPreviews) return;
  guardNotesPreviews.replaceChildren();
  guardNotesPreviews.hidden = guardNotesPendingImages.length === 0;
  guardNotesPendingImages.forEach((img) => {
    const tile = document.createElement("div");
    tile.className = "guard-notes-preview";
    tile.innerHTML = `
      <img src="${escapeHtml(img.url || "")}" alt="${escapeHtml(img.name || "Selected photo")}" loading="lazy" />
      <button class="ghost tiny" type="button" data-remove-image="${img.id}">Remove</button>
    `;
    guardNotesPreviews.appendChild(tile);
  });
}

function persistGuardNotes(row, notes) {
  const key = guardNotesKey(row);
  try {
    if (!notes.length) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(notes));
    }
    return true;
  } catch (err) {
    if (guardNotesStatus) {
      const msg = err?.message || "Unable to save guard notes.";
      guardNotesStatus.textContent = msg;
    }
    return false;
  }
}

function guardNoteUploadPrefix() {
  if (!activeCompanyId) return "";
  return `/uploads/company-${activeCompanyId}/`;
}

async function uploadGuardNoteImage(file) {
  if (!activeCompanyId) throw new Error("No active company session.");
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("image", file);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image.");
  if (!data.url) throw new Error("Upload did not return an image url.");
  return {
    id: makeGuardNoteId("img"),
    name: file.name || "Photo",
    type: file.type || "",
    size: Number.isFinite(file.size) ? file.size : null,
    url: data.url,
  };
}

async function deleteGuardNoteImage(url) {
  if (!activeCompanyId || !url) return;
  const prefix = guardNoteUploadPrefix();
  if (!prefix || !String(url).startsWith(prefix)) return;
  try {
    await fetch("/api/uploads/image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, url }),
    });
  } catch {
    // ignore delete failures
  }
}

function collectGuardNoteImageUrls(notes) {
  const urls = [];
  (notes || []).forEach((note) => {
    (note?.images || []).forEach((img) => {
      if (img?.url) urls.push(String(img.url));
    });
  });
  return urls;
}

function loadGuardNotes(row) {
  guardNotesState = [];
  guardNotesPendingImages = [];
  guardNotesUploadsInFlight = 0;
  guardNotesUploadToken += 1;
  guardNotesEditing = null;
  guardNotesEditingToken += 1;
  setGuardNotesHtml("");
  guardNotesSelection.lastRange = null;
  renderGuardNotesPreviews();
  if (!row) {
    renderGuardNotesList([]);
    if (guardNotesStatus) guardNotesStatus.textContent = "";
    return;
  }
  const key = guardNotesKey(row);
  guardNotesState = readGuardNotesFromStorage(key);
  renderGuardNotesList(guardNotesState);
  if (guardNotesStatus) guardNotesStatus.textContent = "";
}

async function clearGuardNotes(row) {
  if (!row) return;
  const urls = collectGuardNoteImageUrls(guardNotesState).concat(collectGuardNoteImageUrls([{ images: guardNotesPendingImages }]));
  const uniqueUrls = Array.from(new Set(urls));
  guardNotesState = [];
  guardNotesPendingImages = [];
  guardNotesUploadsInFlight = 0;
  guardNotesUploadToken += 1;
  guardNotesEditing = null;
  guardNotesEditingToken += 1;
  setGuardNotesHtml("");
  guardNotesSelection.lastRange = null;
  renderGuardNotesList([]);
  renderGuardNotesPreviews();
  const ok = persistGuardNotes(row, []);
  if (ok && guardNotesStatus) guardNotesStatus.textContent = "Notes cleared.";
  if (uniqueUrls.length) {
    await Promise.allSettled(uniqueUrls.map((url) => deleteGuardNoteImage(url)));
  }
}

function submitGuardNote() {
  if (!selectedUnit) {
    if (guardNotesStatus) guardNotesStatus.textContent = "Select a unit to add guard notes.";
    return;
  }
  if (guardNotesUploadsInFlight > 0) {
    if (guardNotesStatus) guardNotesStatus.textContent = "Wait for image uploads to finish.";
    return;
  }
  const noteHtml = getGuardNotesHtml();
  const images = guardNotesPendingImages.map((img) => ({ ...img }));
  if (!richTextHasContent(noteHtml) && images.length === 0) {
    if (guardNotesStatus) guardNotesStatus.textContent = "Enter a note or attach photos.";
    return;
  }

  const userName = getGuardNotesUserName();
  const next = guardNotesState.concat({
    id: makeGuardNoteId(),
    userName,
    createdAt: new Date().toISOString(),
    note: noteHtml,
    images,
  });

  if (!persistGuardNotes(selectedUnit, next)) return;
  guardNotesState = next;
  guardNotesPendingImages = [];
  setGuardNotesHtml("");
  guardNotesSelection.lastRange = null;
  renderGuardNotesPreviews();
  renderGuardNotesList(guardNotesState);
  if (guardNotesStatus) {
    guardNotesStatus.textContent = `Added ${userName} at ${new Date().toLocaleTimeString()}`;
  }
}

function setGuardNoteEditStatus(noteId, message) {
  if (!guardNotesList) return;
  const el = guardNotesList.querySelector(`[data-edit-status="${noteId}"]`);
  if (!el) return;
  el.textContent = message || "";
}

function startGuardNoteEdit(noteId) {
  const target = guardNotesState.find((n) => String(n.id) === String(noteId));
  if (!target) return;
  if (guardNotesEditing && guardNotesEditing.id !== target.id) {
    cancelGuardNoteEdit();
  }
  const images = (target.images || []).map(cloneGuardNoteImage).filter(Boolean);
  guardNotesEditing = {
    id: target.id,
    noteText: normalizeRichTextValue(target.note || ""),
    images,
    newUploadIds: new Set(),
    removedUrls: new Set(),
    uploadsInFlight: 0,
    lastRange: null,
    insertMode: null,
    uploadToken: ++guardNotesEditingToken,
  };
  renderGuardNotesList(guardNotesState);
}

function cancelGuardNoteEdit() {
  if (!guardNotesEditing) return;
  const toDelete = guardNotesEditing.images
    .filter((img) => guardNotesEditing.newUploadIds.has(img.id))
    .map((img) => img.url)
    .filter(Boolean);
  guardNotesEditing = null;
  guardNotesEditingToken += 1;
  renderGuardNotesList(guardNotesState);
  if (toDelete.length) {
    Promise.allSettled(toDelete.map((url) => deleteGuardNoteImage(url)));
  }
}

function saveGuardNoteEdit(noteId) {
  if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  if (guardNotesEditing.uploadsInFlight > 0) {
    setGuardNoteEditStatus(noteId, "Wait for image uploads to finish.");
    return;
  }
  const editor = guardNotesList?.querySelector?.(`[data-note-editor="${noteId}"]`) || null;
  const noteHtml = editor ? getRichTextValue(editor, null) : normalizeRichTextValue(guardNotesEditing.noteText || "");
  const images = guardNotesEditing.images.map(cloneGuardNoteImage).filter(Boolean);
  if (!richTextHasContent(noteHtml) && images.length === 0) {
    setGuardNoteEditStatus(noteId, "Note cannot be empty.");
    return;
  }

  const next = guardNotesState.map((note) => {
    if (String(note.id) !== String(noteId)) return note;
    return { ...note, note: noteHtml, images };
  });
  if (!persistGuardNotes(selectedUnit, next)) return;
  guardNotesState = next;

  const removed = Array.from(guardNotesEditing.removedUrls || []);
  guardNotesEditing = null;
  guardNotesEditingToken += 1;
  renderGuardNotesList(guardNotesState);
  if (removed.length) {
    Promise.allSettled(removed.map((url) => deleteGuardNoteImage(url)));
  }
  if (guardNotesStatus) {
    guardNotesStatus.textContent = `Note updated at ${new Date().toLocaleTimeString()}`;
  }
}

function deleteGuardNote(noteId) {
  if (!selectedUnit) {
    if (guardNotesStatus) guardNotesStatus.textContent = "Select a unit to delete guard notes.";
    return;
  }
  const target = guardNotesState.find((note) => String(note.id) === String(noteId));
  if (!target) return;
  if (guardNotesEditing && String(guardNotesEditing.id) === String(noteId) && guardNotesEditing.uploadsInFlight > 0) {
    setGuardNoteEditStatus(noteId, "Wait for image uploads to finish.");
    return;
  }
  if (!window.confirm("Delete this guard note?")) return;
  if (guardNotesEditing && String(guardNotesEditing.id) === String(noteId)) {
    cancelGuardNoteEdit();
  }
  const next = guardNotesState.filter((note) => String(note.id) !== String(noteId));
  if (!persistGuardNotes(selectedUnit, next)) return;
  guardNotesState = next;
  renderGuardNotesList(guardNotesState);
  if (guardNotesStatus) {
    guardNotesStatus.textContent = `Note deleted at ${new Date().toLocaleTimeString()}`;
  }
  const urls = collectGuardNoteImageUrls([target]);
  if (urls.length) {
    Promise.allSettled(urls.map((url) => deleteGuardNoteImage(url)));
  }
}

async function loadOrderDetail(orderIdValue) {
  if (!activeCompanyId || !orderIdValue) return null;
  const key = String(orderIdValue);
  if (orderCache.has(key)) return orderCache.get(key);
  try {
    const res = await fetch(`/api/rental-orders/${orderIdValue}?companyId=${activeCompanyId}`);
    const detail = await res.json().catch(() => null);
    if (!res.ok || !detail) return null;
    orderCache.set(key, detail);
    return detail;
  } catch {
    return null;
  }
}

function normalizeOrderCustomerName(order) {
  return (
    order?.customer_name ||
    order?.customerName ||
    order?.customer_company_name ||
    order?.customerCompanyName ||
    order?.customer?.company_name ||
    order?.customer?.name ||
    "--"
  );
}

async function buildFallbackRowFromOrder() {
  if (!activeCompanyId || !orderId) return { row: null, detail: null };
  const detail = await loadOrderDetail(orderId);
  if (!detail) return { row: null, detail: null };

  const order = detail.order || {};
  const lineItems = Array.isArray(detail.lineItems) ? detail.lineItems : [];
  let equipmentIdValue = equipmentId || null;

  if (!equipmentIdValue) {
    const withInventory = lineItems.find((li) => Array.isArray(li.inventoryIds) && li.inventoryIds.length);
    if (withInventory) equipmentIdValue = withInventory.inventoryIds[0];
  }

  let equipment = null;
  if (equipmentIdValue) {
    try {
      const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        equipment = (data.equipment || []).find((e) => String(e.id) === String(equipmentIdValue)) || null;
      }
    } catch { }
  }

  const firstLine = lineItems[0] || {};
  const assignment = {
    equipment_id: equipmentIdValue || null,
    order_id: order.id || orderId,
    ro_number: order.ro_number || order.roNumber || null,
    quote_number: order.quote_number || order.quoteNumber || null,
    external_contract_number: order.external_contract_number || order.externalContractNumber || null,
    customer_name: normalizeOrderCustomerName(order),
    start_at: firstLine.startAt || firstLine.start_at || null,
    end_at: firstLine.endAt || firstLine.end_at || null,
    pickup_location_name: order.pickup_location_name || order.pickupLocationName || "--",
  };

  const fallbackEquipment =
    equipment ||
    (equipmentIdValue
      ? { id: equipmentIdValue, type_name: "Equipment", model_name: "", serial_number: "" }
      : { id: "--", type_name: "Equipment", model_name: "", serial_number: "" });

  return { row: { equipment: fallbackEquipment, assignment }, detail };
}

async function loadTimelineUnit() {
  if (!activeCompanyId) return null;
  if (!equipmentId && !orderId) return null;

  const now = new Date();
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `/api/rental-orders/timeline?companyId=${activeCompanyId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&statuses=ordered`
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || "Unable to load timeline data.");

  const equipmentById = new Map((data.equipment || []).map((e) => [String(e.id), e]));
  const assignments = Array.isArray(data.assignments) ? data.assignments : [];
  const assignment = assignments.find((a) => {
    if (equipmentId && String(a.equipment_id) === String(equipmentId)) return true;
    if (orderId && String(a.order_id) === String(orderId)) return true;
    return false;
  });

  if (!assignment) return null;
  const equipment = equipmentById.get(String(assignment.equipment_id));
  if (!equipment) return null;
  return { equipment, assignment };
}

async function loadDetail() {
  if (!activeCompanyId) {
    if (companyMeta) companyMeta.textContent = "No active company session.";
    if (detailSummary) detailSummary.textContent = "Missing active company context.";
    updateDetailEmpty(true);
    return;
  }
  if (!equipmentId && !orderId) {
    if (detailSummary) detailSummary.textContent = "Select a unit from the dispatch table.";
    updateDetailEmpty(true);
    return;
  }

  if (companyMeta) {
    const session = window.RentSoft?.getSession?.();
    const companyName =
      session?.company?.name ||
      session?.company?.company_name ||
      session?.user?.companyName ||
      session?.user?.company_name ||
      null;
    companyMeta.textContent = companyName ? `${companyName} (ID ${activeCompanyId})` : `Company #${activeCompanyId}`;
  }
  if (detailSummary) detailSummary.textContent = "Loading unit detail...";

  try {
    let timelineError = null;
    let row = null;
    try {
      row = await loadTimelineUnit();
    } catch (err) {
      timelineError = err;
    }
    let detail = null;
    if (!row) {
      const fallback = await buildFallbackRowFromOrder();
      row = fallback.row;
      detail = fallback.detail;
    }
    if (!row) {
      const msg = timelineError?.message || "No active dispatch found for this unit.";
      if (detailSummary) detailSummary.textContent = msg;
      updateDetailEmpty(true);
      return;
    }

    selectedUnit = row;
    equipmentId = row.assignment?.equipment_id || equipmentId;
    orderId = row.assignment?.order_id || orderId;
    if (openSiteAddressPickerBtn) openSiteAddressPickerBtn.disabled = !orderId;
    if (siteAddressStatus) siteAddressStatus.textContent = "";
    updateDetailEmpty(false);
    renderUnitDetail(row);
    orderDetails.innerHTML = detailItem("Loading", "Fetching rental order data...");
    lineItemDetails.innerHTML = "";
    loadGuardNotes(row);

    if (!detail) {
      detail = await loadOrderDetail(row.assignment.order_id);
    }
    if (!detail) {
      currentOrderDetail = null;
      orderDetails.innerHTML = detailItem("Unavailable", "Unable to load rental order detail.");
      return;
    }
    currentOrderDetail = detail;
    renderOrderDetail(row, detail);

    if (detailSummary) {
      detailSummary.textContent = `${equipmentLabel(row.equipment)} on ${docNumberFor(row.assignment)}`;
    }
  } catch (err) {
    if (detailSummary) detailSummary.textContent = err?.message || "Unable to load dispatch detail.";
    updateDetailEmpty(true);
  }
}


if (guardNotesEditor) {
  guardNotesEditor.addEventListener("input", () => {
    storeGuardNotesSelection();
    if (guardNotesStatus) guardNotesStatus.textContent = "";
  });
  guardNotesEditor.addEventListener("keyup", storeGuardNotesSelection);
  guardNotesEditor.addEventListener("mouseup", storeGuardNotesSelection);
  guardNotesEditor.addEventListener("blur", () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (guardNotesToolbar && active && guardNotesToolbar.contains(active)) return;
      setGuardNotesHtml(guardNotesEditor.innerHTML);
    });
  });
}

if (guardNotesToolbar) {
  guardNotesToolbar.addEventListener("mousedown", (e) => {
    storeGuardNotesSelection();
    const btn = e.target.closest?.("[data-rich-cmd],[data-rich-action]");
    if (btn) e.preventDefault();
  });
  guardNotesToolbar.addEventListener("click", (e) => {
    const btn = e.target.closest?.("[data-rich-cmd],[data-rich-action]");
    if (!btn) return;
    e.preventDefault();
    const command = btn.getAttribute("data-rich-cmd");
    if (command) {
      execGuardNotesCommand(command);
      return;
    }
    const action = btn.getAttribute("data-rich-action");
    if (action === "link") {
      const url = window.prompt("Enter link URL");
      if (url) execGuardNotesCommand("createLink", url);
      return;
    }
    if (action === "clear") {
      execGuardNotesCommand("removeFormat");
      return;
    }
    if (action === "image") {
      guardNotesInsertMode = "inline";
      storeGuardNotesSelection();
      guardNotesImages?.click();
    }
  });

  guardNotesToolbar.addEventListener("change", (e) => {
    const target = e.target;
    if (!target || !target.matches) return;
    if (target.matches('[data-rich="font"]')) {
      const value = target.value;
      if (value) execGuardNotesCommand("fontName", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="size"]')) {
      const value = target.value;
      if (value) execGuardNotesCommand("fontSize", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="block"]')) {
      const value = target.value;
      if (value) {
        const block = value.startsWith("<") ? value : `<${value}>`;
        execGuardNotesCommand("formatBlock", block);
      }
      target.value = "";
    }
  });
}

guardNotesSubmitBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  submitGuardNote();
});

guardNotesList?.addEventListener("mousedown", (e) => {
  const toolbarBtn = e.target?.closest?.(".guard-note-toolbar [data-rich-cmd],[data-rich-action]");
  if (!toolbarBtn) return;
  const toolbar = toolbarBtn.closest(".guard-note-toolbar");
  const noteId = toolbar?.dataset?.noteToolbar;
  if (!noteId || !guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  const editor = guardNotesList.querySelector(`[data-note-editor="${noteId}"]`);
  storeGuardNoteEditSelection(editor);
  e.preventDefault();
});

guardNotesList?.addEventListener("click", (e) => {
  const toolbarBtn = e.target?.closest?.(".guard-note-toolbar [data-rich-cmd],[data-rich-action]");
  if (toolbarBtn) {
    const toolbar = toolbarBtn.closest(".guard-note-toolbar");
    const noteId = toolbar?.dataset?.noteToolbar;
    if (!noteId || !guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
    const editor = guardNotesList.querySelector(`[data-note-editor="${noteId}"]`);
    if (!editor) return;
    e.preventDefault();
    const command = toolbarBtn.getAttribute("data-rich-cmd");
    if (command) {
      execGuardNoteEditCommand(editor, command);
      return;
    }
    const action = toolbarBtn.getAttribute("data-rich-action");
    if (action === "link") {
      const url = window.prompt("Enter link URL");
      if (url) execGuardNoteEditCommand(editor, "createLink", url);
      return;
    }
    if (action === "clear") {
      execGuardNoteEditCommand(editor, "removeFormat");
      return;
    }
    if (action === "image") {
      guardNotesEditing.insertMode = "inline";
      storeGuardNoteEditSelection(editor);
      const input = guardNotesList.querySelector(`[data-note-image-input="${noteId}"]`);
      input?.click();
    }
    return;
  }

  const editBtn = e.target?.closest?.("[data-edit-note]");
  if (editBtn) {
    startGuardNoteEdit(editBtn.dataset.editNote);
    return;
  }
  const deleteBtn = e.target?.closest?.("[data-delete-note]");
  if (deleteBtn) {
    deleteGuardNote(deleteBtn.dataset.deleteNote);
    return;
  }
  const saveBtn = e.target?.closest?.("[data-save-note]");
  if (saveBtn) {
    saveGuardNoteEdit(saveBtn.dataset.saveNote);
    return;
  }
  const cancelBtn = e.target?.closest?.("[data-cancel-note]");
  if (cancelBtn) {
    cancelGuardNoteEdit();
    return;
  }
  const removeBtn = e.target?.closest?.("[data-remove-note-image]");
  if (removeBtn) {
    const noteId = removeBtn.dataset.removeNoteImage;
    const imageId = removeBtn.dataset.imageId;
    if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
    const removing = guardNotesEditing.images.find((img) => String(img.id) === String(imageId));
    guardNotesEditing.images = guardNotesEditing.images.filter((img) => String(img.id) !== String(imageId));
    if (removing?.id && guardNotesEditing.newUploadIds.has(removing.id)) {
      guardNotesEditing.newUploadIds.delete(removing.id);
      if (removing.url) deleteGuardNoteImage(removing.url);
    } else if (removing?.url) {
      guardNotesEditing.removedUrls.add(removing.url);
    }
    renderGuardNotesList(guardNotesState);
    setGuardNoteEditStatus(noteId, "Image removed.");
  }
});

guardNotesList?.addEventListener("input", (e) => {
  const editor = e.target?.closest?.("[data-note-editor]");
  const noteId = editor?.dataset?.noteEditor;
  if (!noteId) return;
  if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  guardNotesEditing.noteText = editor.innerHTML || "";
  storeGuardNoteEditSelection(editor);
});

guardNotesList?.addEventListener("keyup", (e) => {
  const editor = e.target?.closest?.("[data-note-editor]");
  const noteId = editor?.dataset?.noteEditor;
  if (!noteId) return;
  if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  storeGuardNoteEditSelection(editor);
});

guardNotesList?.addEventListener("mouseup", (e) => {
  const editor = e.target?.closest?.("[data-note-editor]");
  const noteId = editor?.dataset?.noteEditor;
  if (!noteId) return;
  if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  storeGuardNoteEditSelection(editor);
});

guardNotesList?.addEventListener("change", async (e) => {
  const target = e.target;
  if (target?.matches?.('[data-rich="font"],[data-rich="size"],[data-rich="block"]')) {
    const toolbar = target.closest(".guard-note-toolbar");
    const noteId = toolbar?.dataset?.noteToolbar;
    if (!noteId || !guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
    const editor = guardNotesList.querySelector(`[data-note-editor="${noteId}"]`);
    if (!editor) return;
    if (target.matches('[data-rich="font"]')) {
      const value = target.value;
      if (value) execGuardNoteEditCommand(editor, "fontName", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="size"]')) {
      const value = target.value;
      if (value) execGuardNoteEditCommand(editor, "fontSize", value);
      target.value = "";
      return;
    }
    if (target.matches('[data-rich="block"]')) {
      const value = target.value;
      if (value) {
        const block = value.startsWith("<") ? value : `<${value}>`;
        execGuardNoteEditCommand(editor, "formatBlock", block);
      }
      target.value = "";
      return;
    }
  }

  const noteId = target?.dataset?.noteImageInput;
  if (!noteId) return;
  if (!guardNotesEditing || String(guardNotesEditing.id) !== String(noteId)) return;
  const files = Array.from(target?.files || []);
  const insertInline = guardNotesEditing.insertMode === "inline";
  guardNotesEditing.insertMode = null;
  if (!files.length) return;
  if (!activeCompanyId) {
    setGuardNoteEditStatus(noteId, "No active company session.");
    target.value = "";
    return;
  }
  const token = guardNotesEditing.uploadToken;
  guardNotesEditing.uploadsInFlight += files.length;
  setGuardNoteEditStatus(noteId, `Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
  const results = await Promise.allSettled(files.map((file) => uploadGuardNoteImage(file)));
  const uploaded = [];
  const failures = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      uploaded.push(result.value);
    } else {
      failures.push(result.reason);
    }
  });
  guardNotesEditing.uploadsInFlight = Math.max(0, guardNotesEditing.uploadsInFlight - files.length);
  if (!guardNotesEditing || guardNotesEditing.uploadToken !== token) {
    await Promise.allSettled(uploaded.map((img) => deleteGuardNoteImage(img.url)));
    target.value = "";
    return;
  }
  if (uploaded.length) {
    uploaded.forEach((img) => {
      guardNotesEditing.images.push(img);
      guardNotesEditing.newUploadIds.add(img.id);
    });
    if (insertInline) {
      const editor = guardNotesList.querySelector(`[data-note-editor="${noteId}"]`);
      uploaded.forEach((img) => {
        insertGuardNoteEditImage(editor, img.url, img.name || img.fileName || "Guard notes image");
      });
      if (editor) guardNotesEditing.noteText = editor.innerHTML || "";
    }
    renderGuardNotesList(guardNotesState);
  }
  if (failures.length) {
    const msg = failures[0]?.message || "Some uploads failed.";
    setGuardNoteEditStatus(noteId, msg);
  } else {
    setGuardNoteEditStatus(noteId, uploaded.length ? "Images added." : "No images uploaded.");
  }
  target.value = "";
});

guardNotesImages?.addEventListener("change", async (e) => {
  const target = e.target;
  const files = Array.from(target?.files || []);
  const insertInline = guardNotesInsertMode === "inline";
  guardNotesInsertMode = null;
  if (!files.length) return;
  if (!activeCompanyId) {
    if (guardNotesStatus) guardNotesStatus.textContent = "No active company session.";
    if (target) target.value = "";
    return;
  }
  const token = guardNotesUploadToken;
  guardNotesUploadsInFlight += files.length;
  if (guardNotesStatus) guardNotesStatus.textContent = `Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`;
  const results = await Promise.allSettled(files.map((file) => uploadGuardNoteImage(file)));
  const uploaded = [];
  const failures = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      uploaded.push(result.value);
    } else {
      failures.push(result.reason);
    }
  });
  guardNotesUploadsInFlight = Math.max(0, guardNotesUploadsInFlight - files.length);
  if (token !== guardNotesUploadToken) {
    await Promise.allSettled(uploaded.map((img) => deleteGuardNoteImage(img.url)));
    if (target) target.value = "";
    return;
  }
  if (uploaded.length) {
    guardNotesPendingImages = guardNotesPendingImages.concat(uploaded);
    renderGuardNotesPreviews();
    if (insertInline) {
      uploaded.forEach((img) => {
        insertGuardNotesImage(img.url, img.name || img.fileName || "Guard notes image");
      });
    }
  }
  if (guardNotesStatus) {
    if (failures.length) {
      const msg = failures[0]?.message || "Some uploads failed.";
      guardNotesStatus.textContent = msg;
    } else {
      guardNotesStatus.textContent = uploaded.length ? "Images ready." : "No images uploaded.";
    }
  }
  if (target) target.value = "";
});

guardNotesPreviews?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.("[data-remove-image]");
  const id = btn?.dataset?.removeImage;
  if (!id) return;
  const removing = guardNotesPendingImages.find((img) => img.id === id);
  guardNotesPendingImages = guardNotesPendingImages.filter((img) => img.id !== id);
  renderGuardNotesPreviews();
  if (removing?.url) {
    deleteGuardNoteImage(removing.url);
  }
});

guardNotesClear?.addEventListener("click", () => {
  if (!selectedUnit) return;
  clearGuardNotes(selectedUnit);
});

createWorkOrderBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openWorkOrderFromDispatch();
});

openSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openSiteAddressPicker().catch((err) => {
    if (siteAddressPickerMeta) siteAddressPickerMeta.textContent = err?.message || String(err);
  });
});

closeSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSiteAddressPickerModal();
});

siteAddressPickerModal?.addEventListener("click", (e) => {
  if (e.target === siteAddressPickerModal) closeSiteAddressPickerModal();
});

if (siteAddressPickerMapStyle) {
  setSiteAddressPickerMapStyle(siteAddressPickerMapStyle.value);
  siteAddressPickerMapStyle.addEventListener("change", () => {
    setSiteAddressPickerMapStyle(siteAddressPickerMapStyle.value);
  });
}

saveSiteAddressPickerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  saveSiteAddressFromPicker();
});

document.addEventListener("DOMContentLoaded", () => {
  loadCompanySettings().finally(() => loadDetail());
});
