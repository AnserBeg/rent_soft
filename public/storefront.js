function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

function fromDatetimeLocalValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function toDateValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromDateValue(value, { endOfDay = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const ms = Date.parse(`${raw}${suffix}`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `$${n.toFixed(2)}`;
}

function buildLocationLabel(loc) {
  if (!loc || typeof loc !== "object") return "";
  const bits = [loc.name, loc.city, loc.region, loc.country].filter(Boolean).map(String);
  return bits.join(" • ");
}

function summarizeLocations(locations) {
  const list = Array.isArray(locations) ? locations : [];
  const labels = list.map(buildLocationLabel).filter(Boolean);
  if (!labels.length) return "—";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} + ${labels.length - 1} more`;
}

function setBusy(button, isBusy, labelBusy = "Working...") {
  if (!button) return;
  button.disabled = !!isBusy;
  if (isBusy) {
    button.dataset.originalText = button.textContent || "";
    button.textContent = labelBusy;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
    delete button.dataset.originalText;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  if (!companyId) throw new Error("companyId is required.");
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

function isSaleListing(listing) {
  return String(listing?.listingType || "").trim().toLowerCase() === "sale";
}

function renderRates(listing) {
  if (isSaleListing(listing)) {
    const price = formatMoney(listing?.salePrice);
    return price ? `Sale ${price}` : "Sale price on request";
  }
  const bits = [];
  const daily = formatMoney(listing?.dailyRate);
  const weekly = formatMoney(listing?.weeklyRate);
  const monthly = formatMoney(listing?.monthlyRate);
  if (daily) bits.push(`Day ${daily}`);
  if (weekly) bits.push(`Week ${weekly}`);
  if (monthly) bits.push(`Month ${monthly}`);
  return bits.length ? bits.join(" • ") : "Rates not set";
}

function renderAvailability(listing) {
  if (isSaleListing(listing)) return "Available for purchase";
  return "Availability on request";
}

function listingCardHtml(listing) {
  const imageUrls = Array.isArray(listing?.imageUrls) ? listing.imageUrls.filter(Boolean).map(String) : [];
  const primaryImage = listing?.imageUrl ? String(listing.imageUrl) : null;
  if (primaryImage && !imageUrls.includes(primaryImage)) {
    imageUrls.unshift(primaryImage);
  }
  const image = imageUrls.length
    ? `
      <div class="storefront-thumb-carousel">
        ${imageUrls
          .map(
            (url) =>
              `<img class="storefront-thumb" src="${escapeHtml(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          )
          .join("")}
      </div>
    `
    : `<div class="storefront-thumb placeholder">No image</div>`;

  const typeName = escapeHtml(listing?.typeName || "Unnamed type");
  const companyName = escapeHtml(listing?.company?.name || "Unknown company");
  const category = listing?.categoryName ? escapeHtml(listing.categoryName) : null;
  const locations = summarizeLocations(listing?.stock?.locations);
  const saleBadge = isSaleListing(listing) ? `<span class="mini-badge">For sale</span>` : "";
  const actionLabel = isSaleListing(listing) ? "Contact" : "Reserve";
  const actionValue = isSaleListing(listing) ? "contact" : "reserve";

  return `
    <div class="storefront-card-inner">
      <div class="storefront-thumb-wrap">${image}</div>
      <div class="storefront-card-body">
        <div class="storefront-title-row">
          <div class="storefront-title">${typeName}</div>
          ${saleBadge}
        </div>
        <div class="storefront-sub">${companyName}${category ? ` • ${category}` : ""}</div>
        <div class="storefront-sub">${escapeHtml(locations)}</div>
        <div class="storefront-rates">${escapeHtml(renderRates(listing))}</div>
        <div class="storefront-sub">${escapeHtml(renderAvailability(listing))}</div>
      </div>
      <div class="storefront-card-actions">
        <button class="primary" data-action="${actionValue}">${actionLabel}</button>
      </div>
    </div>
  `;
}

const CUSTOMER_LAST_COMPANY_KEY = "rentSoft.customerLastCompanyId";

document.addEventListener("DOMContentLoaded", () => {
  const form = $("storefront-search");
  const clearBtn = $("storefront-clear");
  const submitBtn = $("storefront-submit");
  const meta = $("storefront-meta");
  const count = $("storefront-count");
  const rangeHint = $("storefront-range-hint");
  const grid = $("storefront-grid");

  const reserveModal = $("reserve-modal");
  const reserveClose = $("reserve-close");
  const reserveSelected = $("reserve-selected");
  const reserveForm = $("reserve-form");
  const reserveLocation = $("reserve-location");
  const reserveSubmit = $("reserve-submit");
  const reserveMeta = $("reserve-meta");
  const reserveAuthBox = $("reserve-auth-box");
  const reserveAuthActions = $("reserve-auth-actions");
  const topbarAccountActions = $("storefront-account-actions");
  const reserveCriticalAreas = $("reserve-critical-areas");
  const reserveGeneralNotes = $("reserve-general-notes");
  const reserveGeneralNotesImagesInput = $("reserve-general-notes-images");
  const reserveGeneralNotesStatus = $("reserve-general-notes-status");
  const reserveGeneralNotesPreviews = $("reserve-general-notes-previews");
  const reserveSiteAddress = $("reserve-site-address");
  const reserveSiteAccessInfo = $("reserve-site-access-info");
  const reserveCoverageTimeZone = $("reserve-coverage-timezone");
    const rentalInfoFieldContainers = {
      siteAddress: document.querySelector('[data-rental-info-field="siteAddress"]'),
      siteAccessInfo: document.querySelector('[data-rental-info-field="siteAccessInfo"]'),
      criticalAreas: document.querySelector('[data-rental-info-field="criticalAreas"]'),
      generalNotes: document.querySelector('[data-rental-info-field="generalNotes"]'),
      emergencyContacts: document.querySelector('[data-rental-info-field="emergencyContacts"]'),
      siteContacts: document.querySelector('[data-rental-info-field="siteContacts"]'),
      coverageHours: document.querySelector('[data-rental-info-field="coverageHours"]'),
    };
    applyRentalInfoConfig(null);
  const reserveEmergencyContactsList = $("reserve-emergency-contacts-list");
  const reserveSiteContactsList = $("reserve-site-contacts-list");
  const reserveAddEmergencyContact = $("reserve-add-emergency-contact");
  const reserveAddSiteContact = $("reserve-add-site-contact");

  const coverageDayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const coverageDayLabels = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
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
  const coverageSlotsContainer = $("reserve-coverage-slots");
  const addCoverageSlotBtn = $("reserve-add-coverage-slot");

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
    if (!reserveCoverageTimeZone) return;
    if (reserveCoverageTimeZone.dataset.ready === "true") return;
    const zones = Array.from(new Set(supportedTimeZones().map((z) => String(z).trim()).filter(Boolean)));
    if (!zones.includes("UTC")) zones.unshift("UTC");
    reserveCoverageTimeZone.innerHTML = "";
    zones.forEach((zone) => {
      const option = document.createElement("option");
      option.value = zone;
      option.textContent = timeZoneLabel(zone);
      reserveCoverageTimeZone.appendChild(option);
    });
    reserveCoverageTimeZone.dataset.ready = "true";
  }

  function resolveDefaultCoverageTimeZone() {
    const local = normalizeCoverageTimeZone(browserTimeZone());
    return local || "UTC";
  }

  function setCoverageTimeZoneInput(value) {
    if (!reserveCoverageTimeZone) return;
    ensureCoverageTimeZoneOptions();
    const normalized = normalizeCoverageTimeZone(value) || resolveDefaultCoverageTimeZone();
    if (
      normalized &&
      !Array.from(reserveCoverageTimeZone.options).some((opt) => String(opt.value) === normalized)
    ) {
      const option = document.createElement("option");
      option.value = normalized;
      option.textContent = timeZoneLabel(normalized);
      reserveCoverageTimeZone.appendChild(option);
    }
    reserveCoverageTimeZone.value = normalized;
  }

  function getCoverageTimeZoneInputValue() {
    if (!reserveCoverageTimeZone) return resolveDefaultCoverageTimeZone();
    const raw = String(reserveCoverageTimeZone.value || "").trim();
    return normalizeCoverageTimeZone(raw) || resolveDefaultCoverageTimeZone();
  }

  let currentListings = [];
  let activeListing = null;
  let pendingWelcome = false;
  let pendingAutoOpen = null;
  let activeRentalInfoConfig = null;
  let reserveGeneralNotesImages = [];
  let reserveGeneralNotesUploadsInFlight = 0;

  const DEFAULT_RENTAL_INFO_FIELDS = {
    siteAddress: { enabled: true, required: false },
    siteAccessInfo: { enabled: true, required: false },
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

  function normalizeContactValue(value) {
    return String(value ?? "").trim();
  }

  function applyRentalInfoConfig(config) {
    activeRentalInfoConfig = normalizeRentalInfoFields(config);
    Object.entries(rentalInfoFieldContainers).forEach(([key, el]) => {
      if (!el) return;
      const enabled = activeRentalInfoConfig?.[key]?.enabled !== false;
      el.style.display = enabled ? "" : "none";
    });
    if (reserveSiteAddress) {
      reserveSiteAddress.required = activeRentalInfoConfig?.siteAddress?.enabled && activeRentalInfoConfig?.siteAddress?.required;
    }
    if (reserveSiteAccessInfo) {
      reserveSiteAccessInfo.required =
        activeRentalInfoConfig?.siteAccessInfo?.enabled && activeRentalInfoConfig?.siteAccessInfo?.required;
    }
    if (reserveCriticalAreas) {
      reserveCriticalAreas.required =
        activeRentalInfoConfig?.criticalAreas?.enabled && activeRentalInfoConfig?.criticalAreas?.required;
    }
    if (reserveGeneralNotes) {
      reserveGeneralNotes.required =
        activeRentalInfoConfig?.generalNotes?.enabled && activeRentalInfoConfig?.generalNotes?.required;
    }
    if (activeRentalInfoConfig?.generalNotes?.enabled === false) {
      clearReserveGeneralNotesImages({ deleteUploads: true });
    }
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
    const normalized = Array.isArray(rows) && rows.length ? rows : [{ name: "", email: "", phone: "" }];
    normalized.forEach((row) => addContactRow(list, row));
    updateContactRemoveButtons(list);
  }

  function collectContacts(list) {
    if (!list) return [];
    const rows = Array.from(list.querySelectorAll(".contact-row"));
    return rows.map((row) => {
      const name = normalizeContactValue(row.querySelector('[data-contact-field="name"]')?.value);
      const title = normalizeContactValue(row.querySelector('[data-contact-field="title"]')?.value);
      const email = normalizeContactValue(row.querySelector('[data-contact-field="email"]')?.value);
      const phone = normalizeContactValue(row.querySelector('[data-contact-field="phone"]')?.value);
      return { name, title, email, phone };
    });
  }

  function validateContacts(list, label, { required = true } = {}) {
    const contacts = collectContacts(list).filter((entry) => entry.name || entry.email || entry.phone);
    if (!contacts.length) {
      return required ? { ok: false, message: `Add at least one ${label.toLowerCase()} contact.` } : { ok: true, contacts: [] };
    }
    for (const entry of contacts) {
      if (!entry.name) {
        return { ok: false, message: `${label}: contact name is required.` };
      }
      if (!entry.email && !entry.phone) {
        return { ok: false, message: `${label}: add an email or phone number for ${entry.name}.` };
      }
    }
    return { ok: true, contacts };
  }

  function normalizeTimeValue(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function timeToMinutes(value) {
    const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
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

  function collectCoverageSlotRows() {
    if (!coverageSlotsContainer) return [];
    return Array.from(coverageSlotsContainer.querySelectorAll("[data-coverage-slot]")).map((row) => {
      const slot = readCoverageSlotFromRow(row) || {};
      const hasAny = Boolean(slot.startDay || slot.startTime || slot.endDay || slot.endTime);
      const isComplete = Boolean(slot.startDay && slot.startTime && slot.endDay && slot.endTime);
      return { ...slot, hasAny, isComplete };
    });
  }

  function collectCoverageHoursFromInputs() {
    const slots = collectCoverageSlotRows()
      .filter((slot) => slot.isComplete)
      .map((slot) => ({
        startDay: slot.startDay,
        startTime: slot.startTime,
        endDay: slot.endDay,
        endTime: slot.endTime,
      }));
    return normalizeCoverageHours(slots);
  }

  function validateCoverageHours(coverageSlots, { required = true } = {}) {
    const rows = collectCoverageSlotRows();
    const hasComplete = rows.some((row) => row.isComplete);
    const hasPartial = rows.some((row) => row.hasAny && !row.isComplete);
    if (hasPartial) {
      return { ok: false, message: "Complete start and end day/time for each coverage slot." };
    }
    if (!hasComplete) {
      return required ? { ok: false, message: "Add coverage hours for at least one time slot." } : { ok: true, coverageHours: [] };
    }
    return { ok: true, coverageHours: coverageSlots };
  }

  function resetCoverageInputs() {
    if (!coverageSlotsContainer) return;
    coverageSlotsContainer.innerHTML = "";
    addCoverageSlotRow({});
    setCoverageTimeZoneInput(null);
  }

  function resetRentalInfoFields() {
    if (reserveSiteAddress) reserveSiteAddress.value = "";
    if (reserveSiteAccessInfo) reserveSiteAccessInfo.value = "";
    if (reserveCriticalAreas) reserveCriticalAreas.value = "";
    if (reserveGeneralNotes) reserveGeneralNotes.value = "";
    setContactRows(reserveEmergencyContactsList, []);
    setContactRows(reserveSiteContactsList, []);
    resetCoverageInputs();
    clearReserveGeneralNotesImages({ deleteUploads: true });
  }

  function setReserveGeneralNotesStatus(message) {
    if (!reserveGeneralNotesStatus) return;
    reserveGeneralNotesStatus.textContent = String(message || "");
  }

  function renderReserveGeneralNotesPreviews() {
    if (!reserveGeneralNotesPreviews) return;
    reserveGeneralNotesPreviews.replaceChildren();
    reserveGeneralNotesPreviews.hidden = reserveGeneralNotesImages.length === 0;
    reserveGeneralNotesImages.forEach((img) => {
      const tile = document.createElement("div");
      tile.className = "guard-notes-preview";
      tile.innerHTML = `
        <img src="${escapeHtml(img.url || "")}" alt="${escapeHtml(img.fileName || "General notes photo")}" loading="lazy" />
        <button class="ghost tiny" type="button" data-remove-reserve-image="${escapeHtml(String(img.id || ""))}">Remove</button>
      `;
      reserveGeneralNotesPreviews.appendChild(tile);
    });
  }

  async function clearReserveGeneralNotesImages({ deleteUploads = false } = {}) {
    if (deleteUploads && reserveGeneralNotesImages.length) {
      const companyId = activeListing?.company?.id || Number(reserveForm?.companyId?.value);
      if (companyId) {
        const urls = reserveGeneralNotesImages.map((img) => img.url).filter(Boolean);
        await Promise.allSettled(urls.map((url) => deleteImage({ companyId, url })));
      }
    }
    reserveGeneralNotesImages = [];
    reserveGeneralNotesUploadsInFlight = 0;
    renderReserveGeneralNotesPreviews();
    setReserveGeneralNotesStatus("");
  }

  function readUrlParams() {
    const params = new URLSearchParams(window.location.search || "");
    const reserveCompanyId = Number(params.get("reserveCompanyId"));
    const reserveTypeId = Number(params.get("reserveTypeId"));
    const welcome = params.get("customerWelcome") === "1";
    return {
      reserveCompanyId: Number.isFinite(reserveCompanyId) && reserveCompanyId > 0 ? reserveCompanyId : null,
      reserveTypeId: Number.isFinite(reserveTypeId) && reserveTypeId > 0 ? reserveTypeId : null,
      welcome,
    };
  }

  function replaceUrl(params) {
    try {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(params || {})) {
        if (v === null || v === undefined || v === "") url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
      }
      window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }

  function rememberLastCompanyId(companyId) {
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) return;
    localStorage.setItem(CUSTOMER_LAST_COMPANY_KEY, String(cid));
  }

  function getLastCompanyId() {
    const raw = localStorage.getItem(CUSTOMER_LAST_COMPANY_KEY);
    const cid = Number(raw);
    if (!Number.isFinite(cid) || cid <= 0) return null;
    return cid;
  }

  function currentReturnTo() {
    return window.location.pathname + window.location.search;
  }

  function profileButtonHtml(label, href) {
    const displayName = String(label || "Your profile").trim() || "Your profile";
    const userIcon = `<span class="profile-view-avatar" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8" r="3"></circle>
        <path d="M4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1"></path>
      </svg>
    </span>`;
    const actionIcon = `<span class="profile-view-action" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 17l5-5-5-5"></path>
      </svg>
    </span>`;
    return `<a class="profile-view-btn" href="${escapeHtml(href)}" aria-label="View your profile">${userIcon}<span class="profile-view-name">${escapeHtml(displayName)}</span>${actionIcon}</a>`;
  }

  function renderTopbarAccount() {
    if (!topbarAccountActions) return;
    const token = window.CustomerAccount?.getToken?.() || "";
    const customer = window.CustomerAccount?.getCustomer?.() || null;
    if (!token) {
      topbarAccountActions.innerHTML = `<a class="ghost" href="customer-login.html">Customer log in</a><a class="primary" href="customer-signup.html">Customer sign up</a>`;
      return;
    }
    const label = customer?.name || customer?.email || "Your profile";
    const hrefQs = new URLSearchParams();
    hrefQs.set("returnTo", currentReturnTo());
    const lastCompanyId = getLastCompanyId();
    if (lastCompanyId) hrefQs.set("companyId", String(lastCompanyId));
    const href = `customer-account.html?${hrefQs.toString()}`;
    topbarAccountActions.innerHTML = profileButtonHtml(label, href);
  }

  function setReserveAuthUi({ companyId }) {
    if (!reserveForm) return;
    const token = window.CustomerAccount?.getToken?.() || "";
    const customer = window.CustomerAccount?.getCustomer?.() || null;
    reserveForm.customerToken.value = token;

    if (reserveAuthActions) reserveAuthActions.innerHTML = "";

    if (!token) {
      setMeta(reserveAuthBox, "Log in or create a customer account to reserve.");
      if (reserveSubmit) reserveSubmit.disabled = true;

      const returnTo = encodeURIComponent(currentReturnTo());
      const login = document.createElement("a");
      login.className = "ghost";
      login.href = `customer-login.html?returnTo=${returnTo}&companyId=${encodeURIComponent(String(companyId || ""))}`;
      login.textContent = "Customer log in";

      const signup = document.createElement("a");
      signup.className = "primary";
      signup.href = `customer-signup.html?returnTo=${returnTo}&companyId=${encodeURIComponent(String(companyId || ""))}`;
      signup.textContent = "Customer sign up";

      reserveAuthActions?.appendChild(login);
      reserveAuthActions?.appendChild(signup);
      return;
    }

    const label = customer?.email ? `${customer.name || "Customer"} <${customer.email}>` : "Customer logged in";
    setMeta(reserveAuthBox, `Logged in as ${label}.`);
    if (reserveSubmit) reserveSubmit.disabled = false;

    const returnTo = encodeURIComponent(currentReturnTo());
    const account = document.createElement("a");
    account.className = "ghost";
    account.href = `customer-account.html?returnTo=${returnTo}&companyId=${encodeURIComponent(String(companyId || ""))}`;
    account.textContent = "Profile";
    reserveAuthActions?.appendChild(account);

    const logout = document.createElement("button");
    logout.type = "button";
    logout.className = "ghost danger";
    logout.textContent = "Log out customer";
    logout.addEventListener("click", () => {
      fetch("/api/customers/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      window.CustomerAccount?.clearSession?.();
      renderTopbarAccount();
      setReserveAuthUi({ companyId });
    });
    reserveAuthActions?.appendChild(logout);
  }

  function openReserveModal(listing) {
    activeListing = listing;
    if (!reserveModal || !reserveForm) return;

    rememberLastCompanyId(listing.company.id);
    replaceUrl({
      reserveCompanyId: listing.company.id,
      reserveTypeId: listing.typeId,
    });

    reserveForm.companyId.value = String(listing.company.id);
    reserveForm.typeId.value = String(listing.typeId);
    setReserveAuthUi({ companyId: listing.company.id });
    setMeta(
      reserveSelected,
      `${listing.typeName} • ${listing.company.name} • ${renderAvailability(listing)}`
    );

    reserveLocation.innerHTML = `<option value="">Any</option>`;
    const locs = Array.isArray(listing?.stock?.locations) ? listing.stock.locations : [];
    locs
      .filter((l) => l && l.id)
      .sort((a, b) => buildLocationLabel(a).localeCompare(buildLocationLabel(b)))
      .forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = String(loc.id);
        opt.textContent = buildLocationLabel(loc) || `Location ${loc.id}`;
        reserveLocation.appendChild(opt);
      });

    const fromInput = form?.from?.value ? fromDateValue(form.from.value) : null;
    const toInput = form?.to?.value ? fromDateValue(form.to.value, { endOfDay: true }) : null;
      if (fromInput) reserveForm.startAt.value = toDatetimeLocalValue(fromInput);
      if (toInput) reserveForm.endAt.value = toDatetimeLocalValue(toInput);

      applyRentalInfoConfig(listing?.company?.rentalInfoFields);
      resetRentalInfoFields();
      setMeta(reserveMeta, "");
    reserveModal.classList.add("show");
    reserveModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");

    if (pendingWelcome) {
      pendingWelcome = false;
      setMeta(reserveMeta, "Account created. You're logged in ƒ?İ you can submit your reservation now.");
      replaceUrl({ customerWelcome: null });
    }
  }

  function openSaleContact(listing) {
    const email = listing?.company?.email || "";
    const phone = listing?.company?.phone || "";
    if (email) {
      const subject = encodeURIComponent(`Sales inquiry - ${listing?.typeName || "Equipment"}`);
      window.location.href = `mailto:${email}?subject=${subject}`;
      return;
    }
    if (phone) {
      window.location.href = `tel:${phone}`;
      return;
    }
    window.alert("No contact details provided for this seller.");
  }

  renderTopbarAccount();

  setContactRows(reserveEmergencyContactsList, []);
  setContactRows(reserveSiteContactsList, []);

  reserveAddEmergencyContact?.addEventListener("click", () =>
    addContactRow(reserveEmergencyContactsList, {}, { focus: true })
  );
  reserveAddSiteContact?.addEventListener("click", () =>
    addContactRow(reserveSiteContactsList, {}, { focus: true })
  );

  reserveEmergencyContactsList?.addEventListener("click", (e) => {
    if (!e.target?.classList?.contains("contact-remove")) return;
    e.preventDefault();
    const row = e.target.closest(".contact-row");
    if (row) row.remove();
    updateContactRemoveButtons(reserveEmergencyContactsList);
  });

  reserveSiteContactsList?.addEventListener("click", (e) => {
    if (!e.target?.classList?.contains("contact-remove")) return;
    e.preventDefault();
    const row = e.target.closest(".contact-row");
    if (row) row.remove();
    updateContactRemoveButtons(reserveSiteContactsList);
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

  reserveGeneralNotesImagesInput?.addEventListener("change", async (e) => {
    const files = Array.from(e.target?.files || []);
    if (!files.length) return;
    const companyId = activeListing?.company?.id || Number(reserveForm?.companyId?.value);
    if (!companyId) {
      setReserveGeneralNotesStatus("Select a company first.");
      if (reserveGeneralNotesImagesInput) reserveGeneralNotesImagesInput.value = "";
      return;
    }
    reserveGeneralNotesUploadsInFlight += files.length;
    setReserveGeneralNotesStatus(`Uploading ${files.length} image${files.length === 1 ? "" : "s"}...`);
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const url = await uploadImage({ companyId, file });
        return {
          id: makeImageId("reserve"),
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
    reserveGeneralNotesUploadsInFlight = Math.max(0, reserveGeneralNotesUploadsInFlight - files.length);
    if (uploaded.length) {
      reserveGeneralNotesImages = reserveGeneralNotesImages.concat(uploaded);
      renderReserveGeneralNotesPreviews();
    }
    if (failures.length) {
      setReserveGeneralNotesStatus(failures[0]?.message || "Some uploads failed.");
    } else {
      setReserveGeneralNotesStatus(uploaded.length ? "Images added." : "No images uploaded.");
    }
    if (reserveGeneralNotesImagesInput) reserveGeneralNotesImagesInput.value = "";
  });

  reserveGeneralNotesPreviews?.addEventListener("click", async (e) => {
    const btn = e.target?.closest?.("[data-remove-reserve-image]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove-reserve-image");
    if (!id) return;
    const companyId = activeListing?.company?.id || Number(reserveForm?.companyId?.value);
    const target = reserveGeneralNotesImages.find((img) => String(img.id) === String(id));
    reserveGeneralNotesImages = reserveGeneralNotesImages.filter((img) => String(img.id) !== String(id));
    renderReserveGeneralNotesPreviews();
    if (companyId && target?.url) {
      await deleteImage({ companyId, url: target.url }).catch(() => {});
    }
    setReserveGeneralNotesStatus("Image removed.");
  });

  function closeReserveModal() {
    if (!reserveModal) return;
    reserveModal.classList.remove("show");
    reserveModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
    clearReserveGeneralNotesImages({ deleteUploads: true });
    activeListing = null;
    replaceUrl({ reserveCompanyId: null, reserveTypeId: null });
  }

  function setDefaults() {
    const now = new Date();
    const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    if (form?.from && !form.from.value) form.from.value = toDateValue(start);
    if (form?.to && !form.to.value) form.to.value = toDateValue(end);
  }

  function readSearch() {
    const equipment = String(form?.equipment?.value || "").trim();
    const company = String(form?.company?.value || "").trim();
    const location = String(form?.location?.value || "").trim();
    const from = fromDateValue(form?.from?.value);
    const to = fromDateValue(form?.to?.value, { endOfDay: true });
    return { equipment, company, location, from, to };
  }

  async function loadListings() {
    if (!grid) return;
    const { equipment, company, location, from, to } = readSearch();

    const params = new URLSearchParams();
    if (equipment) params.set("equipment", equipment);
    if (company) params.set("company", company);
    if (location) params.set("location", location);
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
      const fromLabel = form?.from?.value || from.slice(0, 10);
      const toLabel = form?.to?.value || to.slice(0, 10);
      setMeta(rangeHint, `for ${fromLabel} to ${toLabel}`);
    } else {
      setMeta(rangeHint, "");
    }
    const saleParams = new URLSearchParams();
    if (equipment) saleParams.set("equipment", equipment);
    if (company) saleParams.set("company", company);
    if (location) saleParams.set("location", location);

    setBusy(submitBtn, true, "Searching...");
    setMeta(meta, "Loading listings...");
    grid.innerHTML = "";
    setMeta(count, "0");
    currentListings = [];

    try {
      const fetchListings = async (url) => {
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to load listings.");
        return Array.isArray(data.listings) ? data.listings : [];
      };

      const [rentalResult, saleResult] = await Promise.allSettled([
        fetchListings(`/api/storefront/listings?${params.toString()}`),
        fetchListings(`/api/storefront/sale-listings?${saleParams.toString()}`),
      ]);

      const merged = [];
      const errors = [];
      if (rentalResult.status === "fulfilled") merged.push(...rentalResult.value);
      else errors.push(rentalResult.reason);
      if (saleResult.status === "fulfilled") merged.push(...saleResult.value);
      else errors.push(saleResult.reason);

      if (!merged.length && errors.length) {
        throw errors[0];
      }

      const deduped = Array.from(
        new Map(
          merged.map((listing) => {
            const kind = isSaleListing(listing) ? "sale" : "rental";
            const key = kind === "sale"
              ? `sale:${listing.saleId || listing.unitId || listing.typeId}`
              : `rental:${listing.company?.id}:${listing.typeId}`;
            return [key, listing];
          })
        ).values()
      );

      currentListings = deduped;
      setMeta(count, String(currentListings.length));

      if (!currentListings.length) {
        setMeta(meta, "No listings found. Try a different search.");
        return;
      }

      setMeta(meta, "");
      currentListings.forEach((listing) => {
        const card = document.createElement("div");
        card.className = "card storefront-card";
        card.dataset.companyId = String(listing.company.id);
        card.dataset.typeId = String(listing.typeId);
        card.innerHTML = listingCardHtml(listing);
        card.addEventListener("click", (e) => {
          const target = e.target;
          const action = target?.dataset?.action;
          if (!action) return;
          e.preventDefault();
          if (action === "reserve" && !isSaleListing(listing)) {
            openReserveModal(listing);
            return;
          }
          if (action === "contact" && isSaleListing(listing)) {
            openSaleContact(listing);
          }
        });
        grid.appendChild(card);
      });

      if (pendingAutoOpen && pendingAutoOpen.reserveCompanyId && pendingAutoOpen.reserveTypeId) {
        const match = currentListings.find(
          (l) => Number(l?.company?.id) === pendingAutoOpen.reserveCompanyId && Number(l?.typeId) === pendingAutoOpen.reserveTypeId
        );
        if (match) openReserveModal(match);
        pendingAutoOpen = null;
      }
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : "Unable to load listings.");
    } finally {
      setBusy(submitBtn, false);
    }
  }

  function clearSearch() {
    if (!form) return;
    form.equipment.value = "";
    form.company.value = "";
    form.location.value = "";
    form.from.value = "";
    form.to.value = "";
    setDefaults();
    loadListings();
  }

  setDefaults();
  const initial = readUrlParams();
  pendingWelcome = initial.welcome;
  pendingAutoOpen = initial.reserveCompanyId && initial.reserveTypeId ? initial : null;
  loadListings();

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    loadListings();
  });

  clearBtn?.addEventListener("click", () => clearSearch());
  reserveClose?.addEventListener("click", () => closeReserveModal());
  reserveModal?.addEventListener("click", (e) => {
    if (e.target === reserveModal) closeReserveModal();
  });

  reserveForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeListing) return;

    const rentalInfoConfig = normalizeRentalInfoFields(activeRentalInfoConfig);
    const isFieldEnabled = (key) => rentalInfoConfig?.[key]?.enabled !== false;
    const isFieldRequired = (key) => rentalInfoConfig?.[key]?.enabled !== false && rentalInfoConfig?.[key]?.required === true;

    const siteAddress = normalizeContactValue(reserveSiteAddress?.value);
    const siteAccessInfo = normalizeContactValue(reserveSiteAccessInfo?.value);
    const criticalAreas = normalizeContactValue(reserveCriticalAreas?.value);
    const generalNotes = normalizeContactValue(reserveGeneralNotes?.value);

    if (isFieldRequired("siteAddress") && !siteAddress) {
      setMeta(reserveMeta, "Site address is required.");
      return;
    }
    if (isFieldRequired("siteAccessInfo") && !siteAccessInfo) {
      setMeta(reserveMeta, "Site access information / pin is required.");
      return;
    }
    if (isFieldRequired("criticalAreas") && !criticalAreas) {
      setMeta(reserveMeta, "Critical Areas on Site is required.");
      return;
    }
    if (isFieldRequired("generalNotes") && !generalNotes) {
      setMeta(reserveMeta, "General notes are required.");
      return;
    }
    if (reserveGeneralNotesUploadsInFlight > 0) {
      setMeta(reserveMeta, "Wait for image uploads to finish.");
      return;
    }

    const emergencyCheck = isFieldEnabled("emergencyContacts")
      ? validateContacts(reserveEmergencyContactsList, "Emergency contacts", { required: isFieldRequired("emergencyContacts") })
      : { ok: true, contacts: [] };
    if (!emergencyCheck.ok) {
      setMeta(reserveMeta, emergencyCheck.message);
      return;
    }

    const siteCheck = isFieldEnabled("siteContacts")
      ? validateContacts(reserveSiteContactsList, "Site contacts", { required: isFieldRequired("siteContacts") })
      : { ok: true, contacts: [] };
    if (!siteCheck.ok) {
      setMeta(reserveMeta, siteCheck.message);
      return;
    }

    const coverageHours = isFieldEnabled("coverageHours") ? collectCoverageHoursFromInputs() : [];
    const coverageCheck = isFieldEnabled("coverageHours")
      ? validateCoverageHours(coverageHours, { required: isFieldRequired("coverageHours") })
      : { ok: true, coverageHours: [] };
    if (!coverageCheck.ok) {
      setMeta(reserveMeta, coverageCheck.message);
      return;
    }

    const payload = Object.fromEntries(new FormData(reserveForm).entries());
    payload.companyId = Number(payload.companyId);
    payload.typeId = Number(payload.typeId);
    if (payload.locationId === "") delete payload.locationId;
    payload.startAt = fromDatetimeLocalValue(payload.startAt);
    payload.endAt = fromDatetimeLocalValue(payload.endAt);
    payload.quantity = 1;
    if (isFieldEnabled("siteAddress") && siteAddress) payload.siteAddress = siteAddress;
    if (isFieldEnabled("siteAccessInfo") && siteAccessInfo) payload.siteAccessInfo = siteAccessInfo;
    if (isFieldEnabled("criticalAreas") && criticalAreas) payload.criticalAreas = criticalAreas;
    if (isFieldEnabled("generalNotes") && generalNotes) payload.generalNotes = generalNotes;
    if (isFieldEnabled("generalNotes") && reserveGeneralNotesImages.length) {
      payload.generalNotesImages = reserveGeneralNotesImages.map((img) => ({
        url: img.url,
        fileName: img.fileName,
        mime: img.mime || null,
        sizeBytes: img.sizeBytes ?? null,
      }));
    }
    if (isFieldEnabled("emergencyContacts") && emergencyCheck.contacts.length) payload.emergencyContacts = emergencyCheck.contacts;
    if (isFieldEnabled("siteContacts") && siteCheck.contacts.length) payload.siteContacts = siteCheck.contacts;
    if (isFieldEnabled("coverageHours") && coverageCheck.coverageHours.length)
      payload.coverageHours = coverageCheck.coverageHours;
    if (isFieldEnabled("coverageHours")) {
      payload.coverageTimeZone = getCoverageTimeZoneInputValue();
    } else {
      delete payload.coverageTimeZone;
    }

    setBusy(reserveSubmit, true, "Reserving...");
    setMeta(reserveMeta, "");

    try {
      if (!payload.customerToken) throw new Error("Please log in before reserving.");
      const res = await fetch("/api/storefront/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${payload.customerToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.error === "missing_profile_fields" && Array.isArray(data?.missingFields) && data.missingFields.length) {
          const fields = encodeURIComponent(JSON.stringify(data.missingFields));
          window.location.href = `customer-account.html?returnTo=${encodeURIComponent(window.location.href)}&fields=${fields}`;
          return;
        }
        if (data?.error === "missing_rental_information") {
          throw new Error(data.message || "Complete the rental information before submitting.");
        }
        throw new Error(data.error || data.message || "Reservation failed.");
      }

      const ref = data.roNumber ? `Reservation ${data.roNumber}` : `Reservation created (#${data.orderId})`;
      const customer = window.CustomerAccount?.getCustomer?.() || null;
      const email = customer?.email ? String(customer.email) : "your email";
      setMeta(reserveMeta, `${ref} confirmed. The rental company will follow up at ${email}.`);
      clearReserveGeneralNotesImages({ deleteUploads: false });
      await loadListings();
    } catch (err) {
      setMeta(reserveMeta, err?.message ? String(err.message) : "Reservation failed.");
    } finally {
      setBusy(reserveSubmit, false);
    }
  });
});
