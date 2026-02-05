(() => {
  const sectionId = "rs-rental-info-section";
  const emergencyListId = "rs-emergency-contacts";
  const siteListId = "rs-site-contacts";
  const siteAddressId = "rs-site-address";
  const criticalAreasId = "rs-critical-areas";
  const generalNotesId = "rs-general-notes";
  const generalNotesImagesInputId = "rs-general-notes-images";
  const generalNotesImagesPreviewsId = "rs-general-notes-previews";
  const generalNotesImagesStatusId = "rs-general-notes-status";
  const notificationCircumstancesId = "rs-notification-circumstances";
  const notificationOtherInputId = "rs-notification-other-input";
  const deliveryInstructionsId = "rs-delivery-instructions";

  const DEFAULT_RENTAL_INFO_FIELDS = {
    siteAddress: { enabled: true, required: false },
    criticalAreas: { enabled: true, required: true },
    generalNotes: { enabled: true, required: true },
    emergencyContacts: { enabled: true, required: true },
    siteContacts: { enabled: true, required: true },
    notificationCircumstances: { enabled: true, required: false },
    coverageHours: { enabled: true, required: true },
  };

  const rentalInfoByCompanyId = new Map();
  const rentalInfoByCompanyName = new Map();
  let currentRentalInfoConfig = normalizeRentalInfoFields(null);
  let generalNotesPendingFiles = [];
  let generalNotesUploadsInFlight = 0;

  const coverageDays = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
  ];

  const coverageDayOptionsHtml = coverageDays
    .map((day) => `<option value="${day.key}">${day.label}</option>`)
    .join("");
  const coverageCopyDaysHtml = coverageDays
    .map(
      (day) =>
        `<label class="flex items-center gap-2 text-xs text-slate-500">
          <input type="checkbox" value="${day.key}" data-coverage-copy-day="${day.key}" class="rounded border-gray-300 text-brand-accent focus:ring-brand-accent w-4 h-4" />
          <span>${day.label}</span>
        </label>`
    )
    .join("");

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
    return coverageDays.findIndex((d) => d.key === day);
  }

  function addCoverageDayOffset(day, offset) {
    const idx = coverageDayIndex(day);
    if (idx === -1) return day;
    const nextIdx = (idx + offset + coverageDays.length) % coverageDays.length;
    return coverageDays[nextIdx].key;
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
      coverageDays.forEach((day) => {
        const entry = raw[day.key] || {};
        const startTime = normalizeTimeValue(entry.start);
        const endTime = normalizeTimeValue(entry.end);
        if (!startTime && !endTime) return;
        if (!startTime || !endTime) return;
        let endDay = day.key;
        const explicit = entry.endDayOffset ?? entry.end_day_offset;
        if (explicit === 1 || explicit === "1" || explicit === true || entry.spansMidnight === true) {
          endDay = addCoverageDayOffset(day.key, 1);
        } else {
          const startMinutes = timeToMinutes(startTime);
          const endMinutes = timeToMinutes(endTime);
          if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
            endDay = addCoverageDayOffset(day.key, 1);
          }
        }
        slots.push({ startDay: day.key, startTime, endDay, endTime });
      });
    }

    return sortCoverageSlots(slots);
  }

  function buildCoverageSlotRow(slot = {}) {
    const row = document.createElement("div");
    row.className = "border border-gray-200 rounded-xl p-3 bg-white space-y-3 w-full xl:w-[calc(50%-0.75rem)]";
    row.dataset.coverageSlot = "true";
    row.innerHTML = `
      <div class="grid gap-3 md:grid-cols-2 items-start">
        <label class="block text-xs font-bold text-slate-500">
          Start
          <div class="mt-1 grid gap-2">
            <select data-coverage-field="start-day" class="w-full max-w-[150px] p-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all">
              ${coverageDayOptionsHtml}
            </select>
            <input data-coverage-field="start-time" type="time" step="300" class="w-full max-w-[150px] p-2 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
          </div>
        </label>
        <label class="block text-xs font-bold text-slate-500">
          End
          <div class="mt-1 grid gap-2">
            <select data-coverage-field="end-day" class="w-full max-w-[150px] p-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all">
              ${coverageDayOptionsHtml}
            </select>
            <input data-coverage-field="end-time" type="time" step="300" class="w-full max-w-[150px] p-2 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
          </div>
        </label>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-coverage-action="duplicate">Duplicate</button>
        <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-coverage-action="copy">Copy to days</button>
        <button type="button" class="text-xs font-bold text-red-600 hover:text-red-700" data-coverage-action="remove">Remove</button>
      </div>
      <div class="hidden border border-dashed border-gray-200 rounded-lg p-3 bg-slate-50 space-y-2" data-coverage-copy>
        <div class="text-xs text-slate-500 font-bold">Copy this slot to start on:</div>
        <div class="flex flex-wrap gap-3">
          ${coverageCopyDaysHtml}
        </div>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-coverage-action="apply-copy">Apply</button>
          <button type="button" class="text-xs font-bold text-slate-400 hover:text-slate-500" data-coverage-action="cancel-copy">Cancel</button>
        </div>
      </div>
    `;

    const normalized = normalizeCoverageSlot(slot) || {};
    const startDaySelect = row.querySelector('[data-coverage-field="start-day"]');
    const endDaySelect = row.querySelector('[data-coverage-field="end-day"]');
    const startTimeInput = row.querySelector('[data-coverage-field="start-time"]');
    const endTimeInput = row.querySelector('[data-coverage-field="end-time"]');
    const fallbackDay = coverageDays[0]?.key || "mon";
    const startDay = normalized.startDay || coerceCoverageDay(slot.startDay ?? slot.start_day) || fallbackDay;
    const endDay =
      normalized.endDay || coerceCoverageDay(slot.endDay ?? slot.end_day) || (startDay ? startDay : fallbackDay);

    if (startDaySelect) startDaySelect.value = startDay;
    if (endDaySelect) endDaySelect.value = endDay;
    if (startTimeInput && normalized.startTime) startTimeInput.value = normalized.startTime;
    if (endTimeInput && normalized.endTime) endTimeInput.value = normalized.endTime;

    return row;
  }

  function getCoverageSlotsContainer(section) {
    return section?.querySelector?.("[data-coverage-slots]") || null;
  }

  function addCoverageSlotRow(section, slot = {}, { afterRow = null } = {}) {
    const container = getCoverageSlotsContainer(section);
    if (!container) return null;
    const row = buildCoverageSlotRow(slot);
    if (afterRow && afterRow.parentNode === container) {
      afterRow.insertAdjacentElement("afterend", row);
    } else {
      container.appendChild(row);
    }
    return row;
  }

  function renderCoverageSlots(section, slots) {
    const container = getCoverageSlotsContainer(section);
    if (!container) return;
    container.innerHTML = "";
    const normalized = normalizeCoverageHours(slots);
    if (!normalized.length) {
      addCoverageSlotRow(section, {});
      return;
    }
    normalized.forEach((slot) => addCoverageSlotRow(section, slot));
  }

  function readCoverageSlotFromRow(row) {
    if (!row) return null;
    const startDay = row.querySelector('[data-coverage-field="start-day"]')?.value || "";
    const endDay = row.querySelector('[data-coverage-field="end-day"]')?.value || "";
    const startTime = row.querySelector('[data-coverage-field="start-time"]')?.value || "";
    const endTime = row.querySelector('[data-coverage-field="end-time"]')?.value || "";
    return { startDay, startTime, endDay, endTime };
  }

  function collectCoverageSlotRows(section) {
    const container = getCoverageSlotsContainer(section);
    if (!container) return [];
    return Array.from(container.querySelectorAll("[data-coverage-slot]")).map((row) => {
      const slot = readCoverageSlotFromRow(row) || {};
      const hasAny = Boolean(slot.startDay || slot.startTime || slot.endDay || slot.endTime);
      const isComplete = Boolean(slot.startDay && slot.startTime && slot.endDay && slot.endTime);
      return { ...slot, hasAny, isComplete };
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

  function cacheRentalInfoFromListings(listings) {
    const rows = Array.isArray(listings) ? listings : [];
    rows.forEach((listing) => {
      const company = listing?.company || {};
      const config = normalizeRentalInfoFields(company.rentalInfoFields);
      if (company?.id) rentalInfoByCompanyId.set(String(company.id), config);
      if (company?.name) rentalInfoByCompanyName.set(String(company.name).trim(), config);
    });
  }

  function findCompanyName(form) {
    if (!form) return null;
    const container = form.closest("div");
    if (!container) return null;
    const matchEl = Array.from(container.querySelectorAll("p")).find((el) =>
      String(el.textContent || "").toLowerCase().includes("request this equipment from")
    );
    if (!matchEl) return null;
    const text = String(matchEl.textContent || "");
    const match = text.match(/request this equipment from\s+(.+?)\./i);
    return match ? match[1].trim() : null;
  }

  function resolveRentalInfoConfig(form) {
    const name = findCompanyName(form);
    if (name && rentalInfoByCompanyName.has(name)) return rentalInfoByCompanyName.get(name);
    return normalizeRentalInfoFields(null);
  }

  function applyRentalInfoConfig(section, config) {
    if (!section) return;
    currentRentalInfoConfig = normalizeRentalInfoFields(config);
    section.querySelectorAll("[data-rental-info-field]").forEach((el) => {
      const key = el.getAttribute("data-rental-info-field");
      const enabled = currentRentalInfoConfig?.[key]?.enabled !== false;
      el.style.display = enabled ? "" : "none";
    });
    const siteAddressInput = section.querySelector(`#${siteAddressId}`);
    const criticalAreasInput = section.querySelector(`#${criticalAreasId}`);
    const generalNotesInput = section.querySelector(`#${generalNotesId}`);
    if (siteAddressInput) {
      siteAddressInput.required =
        currentRentalInfoConfig?.siteAddress?.enabled && currentRentalInfoConfig?.siteAddress?.required;
    }
    if (criticalAreasInput) {
      criticalAreasInput.required =
        currentRentalInfoConfig?.criticalAreas?.enabled && currentRentalInfoConfig?.criticalAreas?.required;
    }
    if (generalNotesInput) {
      generalNotesInput.required =
        currentRentalInfoConfig?.generalNotes?.enabled && currentRentalInfoConfig?.generalNotes?.required;
    }
    if (currentRentalInfoConfig?.generalNotes?.enabled === false) {
      clearGeneralNotesPendingFiles();
    }
  }

  function findRequestForm() {
    const heading = Array.from(document.querySelectorAll("h2")).find(
      (el) => el.textContent && el.textContent.trim() === "Finalize Request"
    );
    if (!heading) return null;
    const container = heading.closest("div");
    if (!container) return null;
    return container.querySelector("form");
  }

  function findFulfillmentCard(form) {
    if (!form) return null;
    const heading = Array.from(form.querySelectorAll("h3")).find(
      (el) => el.textContent && el.textContent.trim().includes("Fulfillment Method")
    );
    return heading ? heading.closest("div") : null;
  }

  function insertDeliveryInstructions(form) {
    const fulfillmentCard = findFulfillmentCard(form);
    if (!fulfillmentCard) return;
    if (fulfillmentCard.querySelector(`#${deliveryInstructionsId}`)) return;
    const field = document.createElement("label");
    field.className = "block text-xs font-bold text-slate-500";
    field.innerHTML = `
      Delivery instructions (optional)
      <textarea id="${deliveryInstructionsId}" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" rows="2" placeholder="Gate code, site contact, best drop point..."></textarea>
    `;
    const deliveryAddressLabel = Array.from(fulfillmentCard.querySelectorAll("label")).find((label) =>
      String(label.textContent || "").includes("Delivery Address")
    );
    if (deliveryAddressLabel) {
      deliveryAddressLabel.insertAdjacentElement("afterend", field);
    } else {
      fulfillmentCard.appendChild(field);
    }
  }

  function buildContactRow(type) {
    const row = document.createElement("div");
    row.className = "grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,1fr,auto] gap-3 items-end";
    row.dataset.contactRow = type;
    row.innerHTML = `
      <label class="block text-xs font-bold text-slate-500">
        Contact name
        <input data-contact-field="name" type="text" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
      </label>
      <label class="block text-xs font-bold text-slate-500">
        Title
        <input data-contact-field="title" type="text" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
      </label>
      <label class="block text-xs font-bold text-slate-500">
        Email
        <input data-contact-field="email" type="email" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
      </label>
      <label class="block text-xs font-bold text-slate-500">
        Phone
        <input data-contact-field="phone" type="text" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
      </label>
      <button type="button" class="text-xs font-bold text-red-600 hover:text-red-700" data-action="remove-contact">Remove</button>
    `;
    return row;
  }

  function ensureContactRows(listEl, type) {
    if (!listEl) return;
    const existing = listEl.querySelectorAll("[data-contact-row]");
    if (existing.length) return;
    listEl.appendChild(buildContactRow(type));
  }

  function buildRentalInfoSection() {
    const section = document.createElement("div");
    section.id = sectionId;
    section.className = "bg-slate-50 p-6 rounded-2xl border border-gray-100";
    section.innerHTML = `
      <h3 class="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Rental Information</h3>
      <div class="space-y-4">
        <div data-rental-info-field="siteAddress">
          <label class="block text-xs font-bold text-slate-500">
            Site address
            <input id="${siteAddressId}" type="text" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" />
          </label>
        </div>
        <div data-rental-info-field="criticalAreas">
          <label class="block text-xs font-bold text-slate-500">
            Critical Areas on Site
            <textarea id="${criticalAreasId}" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" rows="3" required></textarea>
          </label>
        </div>
        <div data-rental-info-field="generalNotes">
          <label class="block text-xs font-bold text-slate-500">
            General notes
            <textarea id="${generalNotesId}" class="mt-1 w-full p-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all" rows="3" required></textarea>
          </label>
          <div class="mt-2 flex flex-wrap items-center gap-3">
            <label class="text-xs font-bold text-brand-accent hover:text-yellow-600 cursor-pointer" for="${generalNotesImagesInputId}">
              Add photos
            </label>
            <input id="${generalNotesImagesInputId}" type="file" accept="image/*" multiple class="hidden" />
            <span id="${generalNotesImagesStatusId}" class="text-xs text-slate-400"></span>
          </div>
          <div id="${generalNotesImagesPreviewsId}" class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2"></div>
        </div>
        <div class="space-y-2" data-rental-info-field="emergencyContacts">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-slate-700">Emergency contacts</span>
            <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-action="add-emergency">+ Add contact</button>
          </div>
          <div class="space-y-3" id="${emergencyListId}"></div>
        </div>
        <div class="space-y-2" data-rental-info-field="siteContacts">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-slate-700">Site contacts</span>
            <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-action="add-site">+ Add contact</button>
          </div>
          <div class="space-y-3" id="${siteListId}"></div>
        </div>
        <div class="space-y-3" data-rental-info-field="notificationCircumstances">
          <label class="block text-xs font-bold text-slate-500">Notification circumstance</label>
          <div id="${notificationCircumstancesId}" class="flex flex-wrap items-center gap-4">
             <label class="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" value="Damage" class="rounded border-gray-300 text-brand-accent focus:ring-brand-accent w-4 h-4" />
               <span class="text-sm text-slate-700">Damage</span>
             </label>
             <label class="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" value="Trespassing" class="rounded border-gray-300 text-brand-accent focus:ring-brand-accent w-4 h-4" />
               <span class="text-sm text-slate-700">Trespassing</span>
             </label>
             <label class="flex items-center gap-2 cursor-pointer">
               <input type="checkbox" value="Suspicious activity" class="rounded border-gray-300 text-brand-accent focus:ring-brand-accent w-4 h-4" />
               <span class="text-sm text-slate-700">Suspicious activity</span>
             </label>
             <div class="flex items-center gap-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" value="Other" data-action="toggle-notification-other" class="rounded border-gray-300 text-brand-accent focus:ring-brand-accent w-4 h-4" />
                  <span class="text-sm text-slate-700">Other</span>
                </label>
                <input id="${notificationOtherInputId}" type="text" class="hidden px-2 py-1 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition-all w-48" placeholder="Please specify..." />
             </div>
          </div>
        </div>
        <div class="space-y-3" data-rental-info-field="coverageHours">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-bold text-slate-700">Hours of coverage required</span>
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs text-slate-400">Use 24-hour time - 5-minute steps</span>
              <button type="button" class="text-xs font-bold text-brand-accent hover:text-yellow-600" data-action="add-coverage-slot">
                + Add time slot
              </button>
            </div>
          </div>
          <div class="flex flex-wrap gap-3" data-coverage-slots></div>
        </div>
      </div>
    `;
    renderCoverageSlots(section, []);
    section.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action === "add-emergency") {
        const list = section.querySelector(`#${emergencyListId}`);
        if (list) list.appendChild(buildContactRow("emergency"));
      }
      if (target.dataset.action === "add-site") {
        const list = section.querySelector(`#${siteListId}`);
        if (list) list.appendChild(buildContactRow("site"));
      }
      if (target.dataset.action === "remove-contact") {
        const row = target.closest("[data-contact-row]");
        if (row) row.remove();
      }
      const coverageAction = target.closest?.("[data-coverage-action]");
      if (target.dataset.action === "add-coverage-slot") {
        addCoverageSlotRow(section, {});
      }
      if (coverageAction) {
        const row = coverageAction.closest?.("[data-coverage-slot]");
        if (!row) return;
        const action = coverageAction.dataset.coverageAction;
        if (action === "remove") {
          row.remove();
          if (!getCoverageSlotsContainer(section)?.querySelector("[data-coverage-slot]")) {
            addCoverageSlotRow(section, {});
          }
          return;
        }
        if (action === "duplicate") {
          const slot = readCoverageSlotFromRow(row);
          if (!slot) return;
          addCoverageSlotRow(section, slot, { afterRow: row });
          return;
        }
        if (action === "copy") {
          const panel = row.querySelector("[data-coverage-copy]");
          if (panel) panel.classList.toggle("hidden");
          return;
        }
        if (action === "cancel-copy") {
          const panel = row.querySelector("[data-coverage-copy]");
          if (panel) {
            panel.classList.add("hidden");
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
          const offset = (coverageDayIndex(slot.endDay) - coverageDayIndex(slot.startDay) + coverageDays.length) % coverageDays.length;
          const existingKeys = new Set(collectCoverageHours(section).map((s) => coverageSlotKey(s)));
          selected.forEach((day) => {
            const startDay = coerceCoverageDay(day);
            if (!startDay) return;
            const endDay = addCoverageDayOffset(startDay, offset);
            const nextSlot = { startDay, startTime: slot.startTime, endDay, endTime: slot.endTime };
            const key = coverageSlotKey(nextSlot);
            if (existingKeys.has(key)) return;
            existingKeys.add(key);
            addCoverageSlotRow(section, nextSlot);
          });
          if (panel) {
            panel.classList.add("hidden");
            panel.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
              cb.checked = false;
            });
          }
        }
      }
      if (target.dataset.action === "toggle-notification-other") {
        const otherInput = section.querySelector(`#${notificationOtherInputId}`);
        if (otherInput) {
          otherInput.classList.toggle("hidden", !target.checked);
          if (target.checked) otherInput.focus();
        }
      }
    });
    return section;
  }

  function bindGeneralNotesImageHandlers(section) {
    if (!section || section.dataset.generalNotesImagesBound === "true") return;
    const input = section.querySelector(`#${generalNotesImagesInputId}`);
    const previews = section.querySelector(`#${generalNotesImagesPreviewsId}`);
    if (!input || !previews) return;
    section.dataset.generalNotesImagesBound = "true";

    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      let invalid = false;
      files.forEach((file) => {
        if (!String(file?.type || "").startsWith("image/")) {
          invalid = true;
          return;
        }
        const previewUrl = URL.createObjectURL(file);
        generalNotesPendingFiles.push({ id: makeImageId("note"), file, previewUrl });
      });
      if (invalid) {
        setGeneralNotesImageStatus("Only image uploads are allowed.");
      }
      renderGeneralNotesImagePreviews();
      input.value = "";
    });

    previews.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const id = target.dataset.removeGeneralNotesImage;
      if (!id) return;
      const idx = generalNotesPendingFiles.findIndex((entry) => String(entry.id) === String(id));
      if (idx < 0) return;
      const [removed] = generalNotesPendingFiles.splice(idx, 1);
      if (removed?.previewUrl) {
        try {
          URL.revokeObjectURL(removed.previewUrl);
        } catch {
          // ignore
        }
      }
      renderGeneralNotesImagePreviews();
      setGeneralNotesImageStatus("Image removed.");
    });

    renderGeneralNotesImagePreviews();
  }

  function insertRentalInfoSection() {
    const form = findRequestForm();
    if (!form) return;
    insertDeliveryInstructions(form);
    const existing = form.querySelector(`#${sectionId}`);
    if (existing) {
      applyRentalInfoConfig(existing, resolveRentalInfoConfig(form));
      bindGeneralNotesImageHandlers(existing);
      return;
    }
    const fulfillmentCard = findFulfillmentCard(form);
    if (!fulfillmentCard) return;
    const section = buildRentalInfoSection();
    fulfillmentCard.insertAdjacentElement("afterend", section);
    ensureContactRows(section.querySelector(`#${emergencyListId}`), "emergency");
    ensureContactRows(section.querySelector(`#${siteListId}`), "site");
    applyRentalInfoConfig(section, resolveRentalInfoConfig(form));
    bindGeneralNotesImageHandlers(section);
  }

  function normalizeValue(value) {
    return String(value ?? "").trim();
  }

  function makeImageId(prefix = "img") {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now()}-${rand}`;
  }

  function setGeneralNotesImageStatus(message) {
    const el = document.getElementById(generalNotesImagesStatusId);
    if (!el) return;
    el.textContent = String(message || "");
  }

  function renderGeneralNotesImagePreviews() {
    const wrap = document.getElementById(generalNotesImagesPreviewsId);
    if (!wrap) return;
    wrap.replaceChildren();
    wrap.style.display = generalNotesPendingFiles.length ? "" : "none";
    generalNotesPendingFiles.forEach((item) => {
      const tile = document.createElement("div");
      tile.className = "relative border border-gray-200 rounded-lg overflow-hidden bg-white";
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = item.file?.name || "General notes photo";
      img.className = "block w-full h-24 object-cover";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "absolute top-2 right-2 text-xs font-bold text-red-600 bg-white/90 px-2 py-1 rounded";
      button.textContent = "Remove";
      button.dataset.removeGeneralNotesImage = item.id;
      tile.appendChild(img);
      tile.appendChild(button);
      wrap.appendChild(tile);
    });
  }

  function clearGeneralNotesPendingFiles() {
    generalNotesPendingFiles.forEach((item) => {
      if (item.previewUrl) {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore
        }
      }
    });
    generalNotesPendingFiles = [];
    generalNotesUploadsInFlight = 0;
    renderGeneralNotesImagePreviews();
    setGeneralNotesImageStatus("");
  }

  async function uploadGeneralNotesImages(companyId) {
    const cid = Number(companyId);
    if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
    if (!generalNotesPendingFiles.length) return [];
    generalNotesUploadsInFlight += generalNotesPendingFiles.length;
    setGeneralNotesImageStatus(`Uploading ${generalNotesPendingFiles.length} image${generalNotesPendingFiles.length === 1 ? "" : "s"}...`);
    const results = await Promise.allSettled(
      generalNotesPendingFiles.map(async (item) => {
        const file = item.file;
        if (!file || !String(file.type || "").startsWith("image/")) {
          throw new Error("Only image uploads are allowed.");
        }
        const body = new FormData();
        body.append("companyId", String(cid));
        body.append("image", file);
        const res = await fetch("/api/uploads/image", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to upload image.");
        if (!data.url) throw new Error("Upload did not return an image url.");
        return {
          url: data.url,
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
    generalNotesUploadsInFlight = Math.max(0, generalNotesUploadsInFlight - generalNotesPendingFiles.length);
    if (failures.length) {
      const msg = failures[0]?.message || "Some uploads failed.";
      setGeneralNotesImageStatus(msg);
      await Promise.allSettled(
        uploaded.map((img) =>
          fetch("/api/uploads/image", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId: cid, url: img.url }),
          })
        )
      );
      throw new Error(msg);
    }
    setGeneralNotesImageStatus(uploaded.length ? "Images ready." : "No images uploaded.");
    return uploaded;
  }

  function collectContacts(list) {
    if (!list) return [];
    const rows = Array.from(list.querySelectorAll("[data-contact-row]"));
    return rows
      .map((row) => {
        const name = normalizeValue(row.querySelector('[data-contact-field="name"]')?.value);
        const title = normalizeValue(row.querySelector('[data-contact-field="title"]')?.value);
        const email = normalizeValue(row.querySelector('[data-contact-field="email"]')?.value);
        const phone = normalizeValue(row.querySelector('[data-contact-field="phone"]')?.value);
        return { name, title, email, phone };
      })
      .filter((entry) => entry.name || entry.email || entry.phone);
  }

  function collectNotificationCircumstances(section) {
    if (!section) return [];
    const container = section.querySelector(`#${notificationCircumstancesId}`);
    if (!container) return [];
    const checked = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'));
    const values = checked.map((cb) => {
      if (cb.value === "Other") {
        const otherInput = section.querySelector(`#${notificationOtherInputId}`);
        const otherVal = normalizeValue(otherInput?.value);
        return otherVal ? `Other: ${otherVal}` : "Other";
      }
      return cb.value;
    });
    return values;
  }

  function collectCoverageHours(section) {
    if (!section) return [];
    const rows = collectCoverageSlotRows(section);
    const slots = rows
      .filter((row) => row.isComplete)
      .map((row) => ({
        startDay: row.startDay,
        startTime: normalizeValue(row.startTime),
        endDay: row.endDay,
        endTime: normalizeValue(row.endTime),
      }));
    return normalizeCoverageHours(slots);
  }

  function readRentalInfo() {
    const section = document.getElementById(sectionId);
    if (!section) return null;
    const useField = (key) => currentRentalInfoConfig?.[key]?.enabled !== false;
    const siteAddress = useField("siteAddress") ? normalizeValue(document.getElementById(siteAddressId)?.value) : "";
    const criticalAreas = useField("criticalAreas") ? normalizeValue(document.getElementById(criticalAreasId)?.value) : "";
    const generalNotes = useField("generalNotes") ? normalizeValue(document.getElementById(generalNotesId)?.value) : "";
    const emergencyContacts = useField("emergencyContacts")
      ? collectContacts(section.querySelector(`#${emergencyListId}`))
      : [];
    const siteContacts = useField("siteContacts") ? collectContacts(section.querySelector(`#${siteListId}`)) : [];
    const notificationCircumstances = useField("notificationCircumstances") ? collectNotificationCircumstances(section) : [];
    const coverageHours = useField("coverageHours") ? collectCoverageHours(section) : [];
    return {
      ...(useField("siteAddress") ? { siteAddress } : {}),
      ...(useField("criticalAreas") ? { criticalAreas } : {}),
      ...(useField("generalNotes") ? { generalNotes } : {}),
      ...(useField("emergencyContacts") ? { emergencyContacts } : {}),
      ...(useField("siteContacts") ? { siteContacts } : {}),
      ...(useField("notificationCircumstances") ? { notificationCircumstances } : {}),
      ...(useField("coverageHours") ? { coverageHours } : {}),
    };
  }

  function readDeliveryInstructions() {
    return normalizeValue(document.getElementById(deliveryInstructionsId)?.value);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    let nextInit = init;
    const url = typeof input === "string" ? input : input?.url;
    try {
      if (url && url.includes("/api/storefront/reservations") && nextInit && typeof nextInit.body === "string") {
        const data = JSON.parse(nextInit.body);
        const rentalInfo = readRentalInfo();
        if (rentalInfo) {
          Object.assign(data, rentalInfo);
        }
        const deliveryInstructions = readDeliveryInstructions();
        if (deliveryInstructions) data.deliveryInstructions = deliveryInstructions;
        const companyId = Number(data.companyId);
        let uploadedImages = [];
        if (generalNotesPendingFiles.length && currentRentalInfoConfig?.generalNotes?.enabled !== false) {
          uploadedImages = await uploadGeneralNotesImages(companyId);
          if (uploadedImages.length) data.generalNotesImages = uploadedImages;
        }
        nextInit = { ...nextInit, body: JSON.stringify(data) };
        const response = await originalFetch(input, nextInit);
        if (uploadedImages.length) {
          if (response.ok) {
            clearGeneralNotesPendingFiles();
          } else if (companyId) {
            await Promise.allSettled(
              uploadedImages.map((img) =>
                fetch("/api/uploads/image", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ companyId, url: img.url }),
                })
              )
            );
          }
        }
        return response;
      }
      const response = await originalFetch(input, nextInit);
      if (url && url.includes("/api/storefront/listings")) {
        response
          .clone()
          .json()
          .then((payload) => cacheRentalInfoFromListings(payload?.listings))
          .catch(() => { });
      }
      return response;
    } catch (err) {
      if (url && url.includes("/api/storefront/reservations")) throw err;
      return originalFetch(input, nextInit);
    }
  };

  const observer = new MutationObserver(() => {
    insertRentalInfoSection();
  });

  document.addEventListener("DOMContentLoaded", () => {
    insertRentalInfoSection();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
