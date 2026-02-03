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
const signatureSection = document.getElementById("signature-section");
const signatureName = document.getElementById("signature-name");
const signatureCanvas = document.getElementById("signature-canvas");
const clearSignatureBtn = document.getElementById("clear-signature");
const proofActions = document.getElementById("proof-actions");
const downloadProof = document.getElementById("download-proof");
const submitBtn = document.getElementById("submit-link");

const companyNameInput = document.getElementById("company-name");
const contactNameInput = document.getElementById("contact-name");
const emailInput = document.getElementById("email");
const phoneInput = document.getElementById("phone");
const streetInput = document.getElementById("street-address");
const cityInput = document.getElementById("city");
const regionInput = document.getElementById("region");
const postalInput = document.getElementById("postal-code");
const countryInput = document.getElementById("country");

const customerPoInput = document.getElementById("customer-po");
const fulfillmentSelect = document.getElementById("fulfillment-method");
const dropoffInput = document.getElementById("dropoff-address");
const logisticsInstructionsInput = document.getElementById("logistics-instructions");
const siteAddressInput = document.getElementById("site-address");
const criticalAreasInput = document.getElementById("critical-areas");
const generalNotesInput = document.getElementById("general-notes");
const generalNotesImagesInput = document.getElementById("general-notes-images");
const generalNotesImagesStatus = document.getElementById("general-notes-images-status");
const generalNotesPreviews = document.getElementById("general-notes-previews");
const emergencyContactsList = document.getElementById("emergency-contacts-list");
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
const coverageSlotsContainer = document.getElementById("coverage-slots");
const addCoverageSlotBtn = document.getElementById("add-coverage-slot");
const rentalInfoFieldContainers = {
  siteAddress: document.querySelector('[data-rental-info-field="siteAddress"]'),
  criticalAreas: document.querySelector('[data-rental-info-field="criticalAreas"]'),
  generalNotes: document.querySelector('[data-rental-info-field="generalNotes"]'),
  emergencyContacts: document.querySelector('[data-rental-info-field="emergencyContacts"]'),
  siteContacts: document.querySelector('[data-rental-info-field="siteContacts"]'),
  notificationCircumstances: document.querySelector('[data-rental-info-field="notificationCircumstances"]'),
  coverageHours: document.querySelector('[data-rental-info-field="coverageHours"]'),
};

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

let linkData = null;
let types = [];
let lineItems = [];
let docCategoryMap = {};
let signatureActive = false;
let rentalInfoFields = null;
let generalNotesImages = [];
let generalNotesUploadsInFlight = 0;
let pickupAddress = "";
let lastDropoffAddress = "";
let originalDropoffAddress = "";

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  siteContacts: { enabled: true, required: true },
  coverageHours: { enabled: true, required: true },
};

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

function stripHtml(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";
  const normalized = raw.replace(/<br\s*\/?>/gi, "\n");
  const el = document.createElement("div");
  el.innerHTML = normalized;
  return String(el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function makeImageId(prefix = "img") {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${rand}`;
}

async function uploadImage({ companyId, file }) {
  if (!companyId) throw new Error("Company id is required.");
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Only image uploads are allowed.");
  }
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", file);
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
  return row;
}

function renderCoverageSlots(slots) {
  if (!coverageSlotsContainer) return;
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

function addContactRow(list, { name = "", email = "", phone = "" } = {}, { focus = false } = {}) {
  if (!list) return;
  const row = document.createElement("div");
  row.className = "contact-row";
  row.innerHTML = `
    <label>Contact name <input data-contact-field="name" /></label>
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
  list.appendChild(row);
  updateContactRemoveButtons(list);
  if (focus && nameInput) nameInput.focus();
}

function setContactRows(list, rows) {
  if (!list) return;
  list.innerHTML = "";
  const normalized = Array.isArray(rows) && rows.length ? rows : [{ name: "", email: "", phone: "" }];
  normalized.forEach((row) => {
    addContactRow(
      list,
      {
        name: row?.name || row?.contactName || row?.contact_name || "",
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
      const email = String(row.querySelector('[data-contact-field="email"]')?.value || "").trim();
      const phone = String(row.querySelector('[data-contact-field="phone"]')?.value || "").trim();
      if (!name && !email && !phone) return null;
      return { name, email, phone };
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
      startLocal: "",
      endLocal: "",
      rateBasis: null,
      rateAmount: null,
      billableUnits: null,
      lineAmount: null,
    });
  }
}

function buildTypeOptions(selectedId) {
  const opts = ['<option value="">Select equipment</option>'];
  types.forEach((t) => {
    const sel = String(selectedId || "") === String(t.id) ? "selected" : "";
    opts.push(`<option value="${t.id}" ${sel}>${t.name}</option>`);
  });
  return opts.join("");
}

function renderLineItems() {
  lineItemsEl.innerHTML = "";
  lineItems.forEach((li, idx) => {
    const div = document.createElement("div");
    div.className = "line-item-card";
    div.dataset.index = String(idx);
    const typeDisabled = li.bundleId ? "disabled" : "";
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
          <label>Equipment type
            <select data-field="typeId" ${typeDisabled}>${buildTypeOptions(li.typeId)}</select>
          </label>
          <label>Booked start
            <input type="datetime-local" data-field="startLocal" value="${li.startLocal || ""}" />
          </label>
          <label>Booked end
            <input type="datetime-local" data-field="endLocal" value="${li.endLocal || ""}" />
          </label>
        </div>
        ${pricingHtml}
      </div>
    `;
    lineItemsEl.appendChild(div);
  });
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
    if (!res.ok) throw new Error(data.error || "Unable to load link.");
    linkData = data;
    linkBanner.textContent = "Fill in the required details and submit for review.";
    pageTitle.textContent = data.company?.name ? `Update for ${data.company.name}` : "Customer update";
    pageSubtitle.textContent = data.link?.scope === "new_quote" ? "Submit your quote details." : "Submit your customer updates.";

    const customer = data.customer || {};
    companyNameInput.value = customer.companyName || "";
    contactNameInput.value = customer.contactName || "";
    emailInput.value = customer.email || "";
    phoneInput.value = customer.phone || "";
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
      siteAddressInput.value = order?.siteAddress || "";
      if (criticalAreasInput) criticalAreasInput.value = order?.criticalAreas || "";
      generalNotesInput.value = stripHtml(order?.generalNotes || "");
      setContactRows(emergencyContactsList, order?.emergencyContacts || []);
      setContactRows(siteContactsList, order?.siteContacts || []);
      applyNotificationCircumstances(order?.notificationCircumstances || []);
      setCoverageInputs(normalizeCoverageHours(order?.coverageHours || []));
      applyRentalInfoConfig(data.rentalInfoFields || null);
    }

    types = Array.isArray(data.types) ? data.types : [];
    lineItems = Array.isArray(data.lineItems)
      ? data.lineItems.map((li) => ({
          lineItemId: li.lineItemId || null,
          typeId: li.typeId || null,
          bundleId: li.bundleId || null,
          startLocal: toLocalInputValue(li.startAt),
          endLocal: toLocalInputValue(li.endAt),
          rateBasis: li.rateBasis || null,
          rateAmount: li.rateAmount ?? null,
          billableUnits: li.billableUnits ?? null,
          lineAmount: li.lineAmount ?? null,
        }))
      : [];
    if (showOrder) {
      ensureLineItem();
      renderLineItems();
    }

    const categories = Array.isArray(data.link?.documentCategories) ? data.link.documentCategories : [];
    renderDocuments(categories);

    if (data.link?.termsText) {
      termsSection.style.display = "block";
      termsText.textContent = data.link.termsText;
    }

    if (data.link?.requireEsignature) {
      signatureSection.style.display = "block";
    }

    if (data.link?.singleUse && data.link?.usedAt) {
      linkBanner.textContent = "This link has already been used.";
      setFormDisabled(true);
      if (data.proofAvailable) {
        proofActions.style.display = "flex";
        downloadProof.href = `/api/public/customer-links/${encodeURIComponent(token)}/proof`;
      }
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
  } else if (field === "startLocal") {
    li.startLocal = evt.target.value || "";
  } else if (field === "endLocal") {
    li.endLocal = evt.target.value || "";
  }
  renderLineItems();
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

notificationOtherCheckbox?.addEventListener("change", () => {
  toggleNotificationOther();
});

generalNotesImagesInput?.addEventListener("change", async (e) => {
  const files = Array.from(e.target?.files || []);
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
      const url = await uploadImage({ companyId, file });
      return {
        id: makeImageId("general"),
        url,
        fileName: file.name || "Photo",
        mime: file.type || "",
        sizeBytes: Number.isFinite(file.size) ? file.size : null,
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

form?.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  if (!linkData || !token) return;
  linkHint.textContent = "";
  submitBtn.disabled = true;

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
    const payload = {
      customer: {
        companyName: companyNameInput.value.trim(),
        contactName: contactNameInput.value.trim(),
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
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
        siteAddress: siteAddressInput.value.trim(),
        criticalAreas: criticalAreasInput?.value.trim() || "",
        generalNotes: generalNotesInput.value.trim(),
        notificationCircumstances: collectNotificationCircumstances(),
        coverageHours: collectCoverageHoursFromInputs(),
        emergencyContacts: collectContacts(emergencyContactsList),
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

    if (linkData.link?.requireEsignature && (!signatureName.value.trim() || !signatureActive)) {
      throw new Error("Please provide your typed name and drawn signature.");
    }

    const formData = new FormData();
    formData.append("payload", JSON.stringify(payload));
    formData.append("docCategoryMap", JSON.stringify(docCategoryMap));
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

    linkHint.textContent = "Submitted! Your update is pending review.";
    proofActions.style.display = "flex";
    downloadProof.href = data.proofUrl || `/api/public/customer-links/${encodeURIComponent(token)}/proof`;
    setFormDisabled(true);
  } catch (err) {
    linkHint.textContent = err?.message ? String(err.message) : "Unable to submit update.";
  } finally {
    submitBtn.disabled = false;
  }
});

setupSignatureCanvas();
loadLink();
