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

function renderRates(listing) {
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
  const stock = listing?.stock || {};
  const a = Number(stock.availableUnits || 0);
  const t = Number(stock.totalUnits || 0);
  return `${a} available (of ${t})`;
}

function listingCardHtml(listing) {
  const image = listing?.imageUrl
    ? `<img class="storefront-thumb" src="${escapeHtml(listing.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<div class="storefront-thumb placeholder">No image</div>`;

  const typeName = escapeHtml(listing?.typeName || "Unnamed type");
  const companyName = escapeHtml(listing?.company?.name || "Unknown company");
  const category = listing?.categoryName ? escapeHtml(listing.categoryName) : null;
  const locations = summarizeLocations(listing?.stock?.locations);
  const available = Number(listing?.stock?.availableUnits || 0);

  return `
    <div class="storefront-card-inner">
      <div class="storefront-thumb-wrap">${image}</div>
      <div class="storefront-card-body">
        <div class="storefront-title-row">
          <div class="storefront-title">${typeName}</div>
          <span class="mini-badge" title="Availability">${available}</span>
        </div>
        <div class="storefront-sub">${companyName}${category ? ` • ${category}` : ""}</div>
        <div class="storefront-sub">${escapeHtml(locations)}</div>
        <div class="storefront-rates">${escapeHtml(renderRates(listing))}</div>
        <div class="storefront-sub">${escapeHtml(renderAvailability(listing))}</div>
      </div>
      <div class="storefront-card-actions">
        <button class="primary" data-action="reserve" ${available > 0 ? "" : "disabled"}>Reserve</button>
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
  const reserveSiteAddress = $("reserve-site-address");
    const rentalInfoFieldContainers = {
      siteAddress: document.querySelector('[data-rental-info-field="siteAddress"]'),
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
  const coverageInputs = {
    mon: {
      start: $("reserve-coverage-mon-start"),
      end: $("reserve-coverage-mon-end"),
    },
    tue: {
      start: $("reserve-coverage-tue-start"),
      end: $("reserve-coverage-tue-end"),
    },
    wed: {
      start: $("reserve-coverage-wed-start"),
      end: $("reserve-coverage-wed-end"),
    },
    thu: {
      start: $("reserve-coverage-thu-start"),
      end: $("reserve-coverage-thu-end"),
    },
    fri: {
      start: $("reserve-coverage-fri-start"),
      end: $("reserve-coverage-fri-end"),
    },
    sat: {
      start: $("reserve-coverage-sat-start"),
      end: $("reserve-coverage-sat-end"),
    },
    sun: {
      start: $("reserve-coverage-sun-start"),
      end: $("reserve-coverage-sun-end"),
    },
  };

  let currentListings = [];
  let activeListing = null;
  let pendingWelcome = false;
  let pendingAutoOpen = null;
  let activeRentalInfoConfig = null;

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
    if (reserveCriticalAreas) {
      reserveCriticalAreas.required =
        activeRentalInfoConfig?.criticalAreas?.enabled && activeRentalInfoConfig?.criticalAreas?.required;
    }
    if (reserveGeneralNotes) {
      reserveGeneralNotes.required =
        activeRentalInfoConfig?.generalNotes?.enabled && activeRentalInfoConfig?.generalNotes?.required;
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
    normalized.forEach((row) => addContactRow(list, row));
    updateContactRemoveButtons(list);
  }

  function collectContacts(list) {
    if (!list) return [];
    const rows = Array.from(list.querySelectorAll(".contact-row"));
    return rows.map((row) => {
      const name = normalizeContactValue(row.querySelector('[data-contact-field="name"]')?.value);
      const email = normalizeContactValue(row.querySelector('[data-contact-field="email"]')?.value);
      const phone = normalizeContactValue(row.querySelector('[data-contact-field="phone"]')?.value);
      return { name, email, phone };
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

  function collectCoverageHoursFromInputs() {
    const coverage = {};
    coverageDayKeys.forEach((day) => {
      const entry = coverageInputs[day] || {};
      const start = normalizeContactValue(entry.start?.value);
      const end = normalizeContactValue(entry.end?.value);
      if (!start && !end) return;
      coverage[day] = { start, end };
    });
    return coverage;
  }

  function validateCoverageHours(coverage, { required = true } = {}) {
    const days = Object.keys(coverage || {});
    if (!days.length) {
      return required ? { ok: false, message: "Add coverage hours for at least one day." } : { ok: true, coverageHours: {} };
    }
    for (const day of days) {
      const entry = coverage[day] || {};
      if (!entry.start || !entry.end) {
        const label = coverageDayLabels[day] || day;
        return { ok: false, message: `Coverage hours need both start and end times for ${label}.` };
      }
    }
    return { ok: true, coverageHours: coverage };
  }

  function resetCoverageInputs() {
    coverageDayKeys.forEach((day) => {
      const entry = coverageInputs[day];
      if (entry?.start) entry.start.value = "";
      if (entry?.end) entry.end.value = "";
    });
  }

  function resetRentalInfoFields() {
    if (reserveSiteAddress) reserveSiteAddress.value = "";
    if (reserveCriticalAreas) reserveCriticalAreas.value = "";
    if (reserveGeneralNotes) reserveGeneralNotes.value = "";
    setContactRows(reserveEmergencyContactsList, []);
    setContactRows(reserveSiteContactsList, []);
    resetCoverageInputs();
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

  function closeReserveModal() {
    if (!reserveModal) return;
    reserveModal.classList.remove("show");
    reserveModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
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

    setBusy(submitBtn, true, "Searching...");
    setMeta(meta, "Loading listings...");
    grid.innerHTML = "";
    setMeta(count, "0");
    currentListings = [];

    try {
      const res = await fetch(`/api/storefront/listings?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to load listings.");
      currentListings = Array.isArray(data.listings) ? data.listings : [];
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
          if (action !== "reserve") return;
          e.preventDefault();
          openReserveModal(listing);
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

    const siteAddress = normalizeContactValue(reserveSiteAddress?.value);
    const rentalInfoConfig = normalizeRentalInfoFields(activeRentalInfoConfig);
    const isFieldEnabled = (key) => rentalInfoConfig?.[key]?.enabled !== false;
    const isFieldRequired = (key) => rentalInfoConfig?.[key]?.enabled !== false && rentalInfoConfig?.[key]?.required === true;

    const siteAddress = normalizeContactValue(reserveSiteAddress?.value);
    const criticalAreas = normalizeContactValue(reserveCriticalAreas?.value);
    const generalNotes = normalizeContactValue(reserveGeneralNotes?.value);

    if (isFieldRequired("siteAddress") && !siteAddress) {
      setMeta(reserveMeta, "Site address is required.");
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

    const coverageHours = isFieldEnabled("coverageHours") ? collectCoverageHoursFromInputs() : {};
    const coverageCheck = isFieldEnabled("coverageHours")
      ? validateCoverageHours(coverageHours, { required: isFieldRequired("coverageHours") })
      : { ok: true, coverageHours: {} };
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
    if (isFieldEnabled("criticalAreas") && criticalAreas) payload.criticalAreas = criticalAreas;
    if (isFieldEnabled("generalNotes") && generalNotes) payload.generalNotes = generalNotes;
    if (isFieldEnabled("emergencyContacts") && emergencyCheck.contacts.length) payload.emergencyContacts = emergencyCheck.contacts;
    if (isFieldEnabled("siteContacts") && siteCheck.contacts.length) payload.siteContacts = siteCheck.contacts;
    if (isFieldEnabled("coverageHours") && Object.keys(coverageCheck.coverageHours).length)
      payload.coverageHours = coverageCheck.coverageHours;

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
      await loadListings();
    } catch (err) {
      setMeta(reserveMeta, err?.message ? String(err.message) : "Reservation failed.");
    } finally {
      setBusy(reserveSubmit, false);
    }
  });
});
