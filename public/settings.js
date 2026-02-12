const companyMeta = document.getElementById("company-meta");
const userMeta = document.getElementById("user-meta");
const logoutBtn = document.getElementById("logout-button");
const canActAsCustomerToggle = document.getElementById("can-act-as-customer");
const saveCustomerModeBtn = document.getElementById("save-customer-mode");
const customerModeHint = document.getElementById("customer-mode-hint");


const storefrontRequirementsContainer = document.getElementById("storefront-requirements");
const storefrontRequirementsHint = document.getElementById("storefront-requirements-hint");
const saveStorefrontRequirementsBtn = document.getElementById("save-storefront-requirements");
const rentalInfoFieldsContainer = document.getElementById("rental-info-fields");
const rentalInfoFieldsHint = document.getElementById("rental-info-fields-hint");
const saveRentalInfoFieldsBtn = document.getElementById("save-rental-info-fields");
const customerDocCategoriesInput = document.getElementById("customer-doc-categories");
const customerTermsTemplateInput = document.getElementById("customer-terms-template");
const customerEsignRequiredToggle = document.getElementById("customer-esign-required");
const customerLinkSettingsHint = document.getElementById("customer-link-settings-hint");
const saveCustomerLinkSettingsBtn = document.getElementById("save-customer-link-settings");

const saveCompanyBtn = document.getElementById("save-company");
const companyNameInput = document.getElementById("company-name");
const companyEmailInput = document.getElementById("company-email");
const companyPhoneInput = document.getElementById("company-phone");
const companyWebsiteInput = document.getElementById("company-website");
const companyStreetInput = document.getElementById("company-street");
const companyCityInput = document.getElementById("company-city");
const companyRegionInput = document.getElementById("company-region");
const companyPostalInput = document.getElementById("company-postal");
const companyCountryInput = document.getElementById("company-country");
const companyInfoHint = document.getElementById("company-info-hint");

const logoFileInput = document.getElementById("logo-file");
const logoPreview = document.getElementById("logo-preview");
const removeLogoBtn = document.getElementById("remove-logo");
const logoHint = document.getElementById("logo-hint");

const qboStatus = document.getElementById("qbo-status");
const qboConnectBtn = document.getElementById("qbo-connect");
const qboDisconnectBtn = document.getElementById("qbo-disconnect");
const qboEnabledToggle = document.getElementById("qbo-enabled");
const qboBillingDayInput = document.getElementById("qbo-billing-day");
const qboAdjustmentPolicySelect = document.getElementById("qbo-adjustment-policy");
const qboIncomeAccountsSelect = document.getElementById("qbo-income-accounts");
const qboIncomeAccountsRefreshBtn = document.getElementById("qbo-income-accounts-refresh");
const qboIncomeAccountsHint = document.getElementById("qbo-income-accounts-hint");
const qboDefaultTaxCodeSelect = document.getElementById("qbo-default-tax-code");
const qboTaxCodesRefreshBtn = document.getElementById("qbo-tax-codes-refresh");
const qboTaxCodesHint = document.getElementById("qbo-tax-codes-hint");
const qboHint = document.getElementById("qbo-hint");
const saveQboSettingsBtn = document.getElementById("save-qbo-settings");

const autoWorkOrderOnReturnToggle = document.getElementById("auto-work-order-on-return");
const saveWorkOrderSettingsBtn = document.getElementById("save-work-order-settings");
const workOrderSettingsHint = document.getElementById("work-order-settings-hint");

const saveEmailSettingsBtn = document.getElementById("save-email-settings");
const testEmailSettingsBtn = document.getElementById("test-email-settings");
const emailEnabledToggle = document.getElementById("email-enabled");
const emailProviderSelect = document.getElementById("email-provider");
const emailHostInput = document.getElementById("email-host");
const emailPortInput = document.getElementById("email-port");
const emailSecureToggle = document.getElementById("email-secure");
const emailRequireTlsToggle = document.getElementById("email-require-tls");
const emailUserInput = document.getElementById("email-user");
const emailPassInput = document.getElementById("email-pass");
const emailFromNameInput = document.getElementById("email-from-name");
const emailFromAddressInput = document.getElementById("email-from-address");
const emailTestToInput = document.getElementById("email-test-to");
const emailNotifyRequestToggle = document.getElementById("email-notify-request");
const emailNotifyStatusToggle = document.getElementById("email-notify-status");
const emailSettingsHint = document.getElementById("email-settings-hint");

let activeCompanyId = window.RentSoft?.getCompanyId?.() ? Number(window.RentSoft.getCompanyId()) : null;
let currentLogoUrl = null;
let companyProfileLoaded = false;
let storefrontRequirementsLoaded = false;
let rentalInfoFieldsLoaded = false;
let customerLinkSettingsLoaded = false;
let userModeLoaded = false;
let emailSettingsLoaded = false;
let qboSettingsLoaded = false;
let qboConnected = false;
let qboIncomeAccountsCache = [];
let qboIncomeAccountsLoading = false;
let qboIncomeAccountIds = [];
let qboTaxCodesCache = [];
let qboTaxCodesLoading = false;
let qboDefaultTaxCode = "";
let workOrderSettingsLoaded = false;

const storefrontRequirementOptions = [
  { key: "businessName", label: "Business name" },
  { key: "phone", label: "Phone" },
  { key: "streetAddress", label: "Street address" },
  { key: "city", label: "City" },
  { key: "region", label: "Province / State" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" },
  { key: "creditCardNumber", label: "Credit card" },
  { key: "reference1", label: "Reference #1 (file)" },
  { key: "reference2", label: "Reference #2 (file)" },
  { key: "proofOfInsurance", label: "Proof of insurance (file)" },
  { key: "driversLicense", label: "Driver's license (file)" },
];

const rentalInfoFieldOptions = [
  { key: "siteAddress", label: "Site address" },
  { key: "siteName", label: "Site name" },
  { key: "siteAccessInfo", label: "Site access information / pin" },
  { key: "criticalAreas", label: "Critical areas on site" },
  { key: "generalNotes", label: "General notes" },
  { key: "emergencyContacts", label: "Emergency contacts" },
  { key: "siteContacts", label: "Site contacts" },
  { key: "notificationCircumstances", label: "Notification circumstance" },
  { key: "coverageHours", label: "Hours of coverage" },
];

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  siteName: { enabled: true, required: false },
  siteAccessInfo: { enabled: true, required: false },
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

function setStorefrontRequirementsHint(message) {
  if (!storefrontRequirementsHint) return;
  storefrontRequirementsHint.textContent = String(message || "");
}

function setRentalInfoFieldsHint(message) {
  if (!rentalInfoFieldsHint) return;
  rentalInfoFieldsHint.textContent = String(message || "");
}

function setCustomerLinkSettingsHint(message) {
  if (!customerLinkSettingsHint) return;
  customerLinkSettingsHint.textContent = String(message || "");
}

function renderStorefrontRequirements(selected) {
  if (!storefrontRequirementsContainer) return;
  const selectedSet = new Set(Array.isArray(selected) ? selected.map((v) => String(v)) : []);
  storefrontRequirementsContainer.innerHTML = "";
  for (const opt of storefrontRequirementOptions) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "10px";
    label.style.padding = "10px 12px";
    label.style.border = "1px solid var(--border)";
    label.style.borderRadius = "12px";
    label.style.background = "#fff";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = opt.key;
    checkbox.checked = selectedSet.has(opt.key);
    checkbox.dataset.requirementKey = opt.key;

    const text = document.createElement("span");
    text.textContent = opt.label;

    label.appendChild(checkbox);
    label.appendChild(text);
    storefrontRequirementsContainer.appendChild(label);
  }
}

function renderRentalInfoFields(fields) {
  if (!rentalInfoFieldsContainer) return;
  const normalized = normalizeRentalInfoFields(fields);
  rentalInfoFieldsContainer.innerHTML = "";
  rentalInfoFieldOptions.forEach((opt) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gap = "16px";
    row.style.padding = "10px 12px";
    row.style.border = "1px solid var(--border)";
    row.style.borderRadius = "12px";
    row.style.background = "#fff";

    const label = document.createElement("div");
    label.textContent = opt.label;
    label.style.fontWeight = "600";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "12px";

    const showLabel = document.createElement("label");
    showLabel.style.display = "flex";
    showLabel.style.alignItems = "center";
    showLabel.style.gap = "6px";
    const showToggle = document.createElement("input");
    showToggle.type = "checkbox";
    showToggle.checked = normalized[opt.key]?.enabled !== false;
    showToggle.dataset.rentalInfoKey = opt.key;
    showLabel.appendChild(showToggle);
    showLabel.appendChild(document.createTextNode("Show"));

    const requiredLabel = document.createElement("label");
    requiredLabel.style.display = "flex";
    requiredLabel.style.alignItems = "center";
    requiredLabel.style.gap = "6px";
    const requiredToggle = document.createElement("input");
    requiredToggle.type = "checkbox";
    requiredToggle.checked = normalized[opt.key]?.required === true;
    requiredToggle.dataset.rentalInfoRequired = opt.key;
    requiredToggle.disabled = !showToggle.checked;
    requiredLabel.appendChild(requiredToggle);
    requiredLabel.appendChild(document.createTextNode("Required on marketplace"));

    showToggle.addEventListener("change", () => {
      if (!showToggle.checked) requiredToggle.checked = false;
      requiredToggle.disabled = !showToggle.checked;
    });

    controls.appendChild(showLabel);
    controls.appendChild(requiredLabel);
    row.appendChild(label);
    row.appendChild(controls);
    rentalInfoFieldsContainer.appendChild(row);
  });
}

function readRentalInfoFieldsSelection() {
  const normalized = normalizeRentalInfoFields(null);
  rentalInfoFieldOptions.forEach((opt) => {
    const showToggle = rentalInfoFieldsContainer?.querySelector(`[data-rental-info-key="${opt.key}"]`);
    const requiredToggle = rentalInfoFieldsContainer?.querySelector(`[data-rental-info-required="${opt.key}"]`);
    const enabled = showToggle ? showToggle.checked : normalized[opt.key]?.enabled !== false;
    const required = enabled && requiredToggle ? requiredToggle.checked : false;
    normalized[opt.key] = { enabled, required };
  });
  return normalized;
}

function readStorefrontRequirementsSelection() {
  if (!storefrontRequirementsContainer) return [];
  const selected = [];
  storefrontRequirementsContainer.querySelectorAll("input[type='checkbox'][data-requirement-key]").forEach((el) => {
    if (el.checked) selected.push(String(el.value));
  });
  return selected;
}

function setLogoHint(message) {
  if (!logoHint) return;
  logoHint.textContent = String(message || "");
}

function setEmailSettingsHint(message) {
  if (!emailSettingsHint) return;
  emailSettingsHint.textContent = String(message || "");
}

function setCompanyInfoHint(message) {
  if (!companyInfoHint) return;
  companyInfoHint.textContent = String(message || "");
}

function setQboHint(message) {
  if (!qboHint) return;
  qboHint.textContent = String(message || "");
}

function setWorkOrderSettingsHint(message) {
  if (!workOrderSettingsHint) return;
  workOrderSettingsHint.textContent = String(message || "");
}

function setQboIncomeAccountsHint(message) {
  if (!qboIncomeAccountsHint) return;
  qboIncomeAccountsHint.textContent = String(message || "");
}

function setQboTaxCodesHint(message) {
  if (!qboTaxCodesHint) return;
  qboTaxCodesHint.textContent = String(message || "");
}

function setCustomerModeHint(message) {
  if (!customerModeHint) return;
  customerModeHint.textContent = String(message || "");
}

function renderLogoPreview(url) {
  currentLogoUrl = url ? String(url) : null;
  if (logoPreview) {
    if (currentLogoUrl) {
      logoPreview.src = currentLogoUrl;
      logoPreview.style.display = "block";
    } else {
      logoPreview.src = "";
      logoPreview.style.display = "none";
    }
  }
  if (removeLogoBtn) removeLogoBtn.disabled = !currentLogoUrl;
}

function setQboIncomeAccountsEnabled(enabled) {
  if (qboIncomeAccountsSelect) qboIncomeAccountsSelect.disabled = !enabled;
  if (qboIncomeAccountsRefreshBtn) qboIncomeAccountsRefreshBtn.disabled = !enabled;
}

function setQboTaxCodesEnabled(enabled) {
  if (qboDefaultTaxCodeSelect) qboDefaultTaxCodeSelect.disabled = !enabled;
  if (qboTaxCodesRefreshBtn) qboTaxCodesRefreshBtn.disabled = !enabled;
}

function applyQboIncomeAccountSelection() {
  if (!qboIncomeAccountsSelect) return;
  const selected = new Set(qboIncomeAccountIds.map((v) => String(v)));
  Array.from(qboIncomeAccountsSelect.options).forEach((opt) => {
    opt.selected = selected.has(opt.value);
  });
}

function applyQboTaxCodeSelection() {
  if (!qboDefaultTaxCodeSelect) return;
  qboDefaultTaxCodeSelect.value = qboDefaultTaxCode ? String(qboDefaultTaxCode) : "";
}

function renderQboIncomeAccountsOptions(accounts) {
  if (!qboIncomeAccountsSelect) return;
  const rows = Array.isArray(accounts) ? accounts : [];
  qboIncomeAccountsSelect.innerHTML = "";
  const optionIds = new Set();
  rows.forEach((account) => {
    const id = account?.id ? String(account.id) : null;
    if (!id) return;
    const label = account?.name || account?.fullyQualifiedName || `Account ${id}`;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    qboIncomeAccountsSelect.appendChild(option);
    optionIds.add(id);
  });
  qboIncomeAccountIds
    .map((id) => String(id))
    .filter((id) => id && !optionIds.has(id))
    .forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `Account ${id}`;
      qboIncomeAccountsSelect.appendChild(option);
      optionIds.add(id);
    });
  if (!qboIncomeAccountsSelect.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = qboConnected ? "No income accounts found." : "Connect QuickBooks Online to load accounts.";
    option.disabled = true;
    qboIncomeAccountsSelect.appendChild(option);
  }
  applyQboIncomeAccountSelection();
}

function renderQboTaxCodesOptions(taxCodes) {
  if (!qboDefaultTaxCodeSelect) return;
  const rows = Array.isArray(taxCodes) ? taxCodes : [];
  qboDefaultTaxCodeSelect.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "No default tax code";
  qboDefaultTaxCodeSelect.appendChild(emptyOption);

  const optionIds = new Set();
  rows.forEach((taxCode) => {
    const id = taxCode?.id ? String(taxCode.id) : null;
    if (!id) return;
    const name = taxCode?.name || taxCode?.code || taxCode?.description || null;
    const label = name ? `${name}${name === id ? "" : ` (${id})`}` : `Tax code ${id}`;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    qboDefaultTaxCodeSelect.appendChild(option);
    optionIds.add(id);
  });

  if (qboDefaultTaxCode && !optionIds.has(String(qboDefaultTaxCode))) {
    const option = document.createElement("option");
    option.value = String(qboDefaultTaxCode);
    option.textContent = `Tax code ${qboDefaultTaxCode}`;
    qboDefaultTaxCodeSelect.appendChild(option);
  }

  applyQboTaxCodeSelection();
}

function syncQboIncomeAccountIdsFromSelect() {
  if (!qboIncomeAccountsSelect) return;
  qboIncomeAccountIds = Array.from(qboIncomeAccountsSelect.selectedOptions)
    .map((opt) => String(opt.value))
    .filter(Boolean);
}

function syncQboDefaultTaxCodeFromSelect() {
  if (!qboDefaultTaxCodeSelect) return;
  qboDefaultTaxCode = String(qboDefaultTaxCodeSelect.value || "").trim();
}

function setQboSettingsFields(settings) {
  if (!settings) return;
  if (qboEnabledToggle) qboEnabledToggle.checked = settings.qbo_enabled === true;
  if (qboBillingDayInput) qboBillingDayInput.value = settings.qbo_billing_day ? String(settings.qbo_billing_day) : "1";
  if (qboAdjustmentPolicySelect) qboAdjustmentPolicySelect.value = settings.qbo_adjustment_policy || "credit_memo";
  if (qboIncomeAccountsSelect) {
    const ids = Array.isArray(settings.qbo_income_account_ids) ? settings.qbo_income_account_ids : [];
    qboIncomeAccountIds = ids.map((id) => String(id)).filter(Boolean);
    renderQboIncomeAccountsOptions(qboIncomeAccountsCache);
  }
  if (qboDefaultTaxCodeSelect) {
    qboDefaultTaxCode = settings.qbo_default_tax_code ? String(settings.qbo_default_tax_code) : "";
    renderQboTaxCodesOptions(qboTaxCodesCache);
  }
}

function qboSettingsPayload() {
  return {
    companyId: activeCompanyId,
    qboEnabled: qboEnabledToggle?.checked === true,
    qboBillingDay: qboBillingDayInput?.value ? Number(qboBillingDayInput.value) : null,
    qboAdjustmentPolicy: qboAdjustmentPolicySelect?.value || "credit_memo",
    qboIncomeAccountIds: qboIncomeAccountIds,
    qboDefaultTaxCode: qboDefaultTaxCode || null,
  };
}

function jpegFileName(name) {
  const base = String(name || "image").replace(/\.[^/.]+$/, "");
  return `${base || "image"}.jpg`;
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

async function convertPngToJpegFile(file, quality = 0.88) {
  if (!file || String(file.type || "").toLowerCase() !== "image/png") return file;
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
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded, 0, 0, width, height);
  if (typeof decoded?.close === "function") decoded.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;
  return new File([blob], jpegFileName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified || Date.now(),
  });
}

async function uploadLogo({ file }) {
  const prepared = await convertPngToJpegFile(file);
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("image", prepared);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

async function deleteLogo(url) {
  const res = await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, url }),
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Unable to delete logo");
  }
}

async function saveLogoUrl(url) {
  const res = await fetch("/api/company-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, logoUrl: url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save logo");
  return data.settings;
}

function companyProfilePayload() {
  return {
    companyId: activeCompanyId,
    name: String(companyNameInput?.value || "").trim(),
    email: String(companyEmailInput?.value || "").trim(),
    phone: String(companyPhoneInput?.value || "").trim(),
    website: String(companyWebsiteInput?.value || "").trim(),
    streetAddress: String(companyStreetInput?.value || "").trim(),
    city: String(companyCityInput?.value || "").trim(),
    region: String(companyRegionInput?.value || "").trim(),
    postalCode: String(companyPostalInput?.value || "").trim(),
    country: String(companyCountryInput?.value || "").trim(),
  };
}

function setCompanyProfileFields(profile) {
  if (!profile) return;
  if (companyNameInput) companyNameInput.value = profile.name || "";
  if (companyEmailInput) companyEmailInput.value = profile.email || "";
  if (emailTestToInput && !String(emailTestToInput.value || "").trim()) emailTestToInput.value = profile.email || "";
  if (companyPhoneInput) companyPhoneInput.value = profile.phone || "";
  if (companyWebsiteInput) companyWebsiteInput.value = profile.website || "";
  if (companyStreetInput) companyStreetInput.value = profile.streetAddress || "";
  if (companyCityInput) companyCityInput.value = profile.city || "";
  if (companyRegionInput) companyRegionInput.value = profile.region || "";
  if (companyPostalInput) companyPostalInput.value = profile.postalCode || "";
  if (companyCountryInput) companyCountryInput.value = profile.country || "";
}

function setEmailControlsEnabled(enabled) {
  [
    emailProviderSelect,
    emailHostInput,
    emailPortInput,
    emailSecureToggle,
    emailRequireTlsToggle,
    emailUserInput,
    emailPassInput,
    emailFromNameInput,
    emailFromAddressInput,
    emailTestToInput,
    emailNotifyRequestToggle,
    emailNotifyStatusToggle,
    saveEmailSettingsBtn,
    testEmailSettingsBtn,
  ]
    .filter(Boolean)
    .forEach((el) => {
      el.disabled = !enabled;
    });
}

function applyEmailProviderPreset(provider) {
  const p = String(provider || "custom").toLowerCase();
  if (!emailHostInput || !emailPortInput || !emailSecureToggle || !emailRequireTlsToggle) return;
  if (p === "gmail") {
    emailHostInput.value = "smtp.gmail.com";
    emailPortInput.value = "465";
    emailSecureToggle.checked = true;
    emailRequireTlsToggle.checked = false;
    return;
  }
  if (p === "outlook") {
    emailHostInput.value = "smtp.office365.com";
    emailPortInput.value = "587";
    emailSecureToggle.checked = false;
    emailRequireTlsToggle.checked = true;
    return;
  }
  if (p === "titan") {
    emailHostInput.value = "smtp.titan.email";
    emailPortInput.value = "465";
    emailSecureToggle.checked = true;
    emailRequireTlsToggle.checked = false;
  }
}

function emailSettingsPayload() {
  return {
    companyId: activeCompanyId,
    enabled: emailEnabledToggle?.checked === true,
    smtpProvider: String(emailProviderSelect?.value || "custom"),
    smtpHost: String(emailHostInput?.value || "").trim(),
    smtpPort: emailPortInput?.value ? Number(emailPortInput.value) : null,
    smtpSecure: emailSecureToggle?.checked === true,
    smtpRequireTls: emailRequireTlsToggle?.checked === true,
    smtpUser: String(emailUserInput?.value || "").trim(),
    smtpPass: String(emailPassInput?.value || ""),
    fromName: String(emailFromNameInput?.value || "").trim(),
    fromAddress: String(emailFromAddressInput?.value || "").trim(),
    notifyRequestSubmit: emailNotifyRequestToggle?.checked === true,
    notifyStatusUpdates: emailNotifyStatusToggle?.checked === true,
  };
}

function setEmailSettingsFields(settings) {
  if (!settings) return;
  if (emailEnabledToggle) emailEnabledToggle.checked = settings.email_enabled === true;
  if (emailProviderSelect) emailProviderSelect.value = settings.email_smtp_provider || "custom";
  if (emailHostInput) emailHostInput.value = settings.email_smtp_host || "";
  if (emailPortInput) emailPortInput.value = settings.email_smtp_port ? String(settings.email_smtp_port) : "";
  if (emailSecureToggle) emailSecureToggle.checked = settings.email_smtp_secure === true;
  if (emailRequireTlsToggle) emailRequireTlsToggle.checked = settings.email_smtp_require_tls === true;
  if (emailUserInput) emailUserInput.value = settings.email_smtp_user || "";
  if (emailPassInput) emailPassInput.value = "";
  if (emailFromNameInput) emailFromNameInput.value = settings.email_from_name || "";
  if (emailFromAddressInput) emailFromAddressInput.value = settings.email_from_address || "";
  if (emailNotifyRequestToggle) emailNotifyRequestToggle.checked = settings.email_notify_request_submit !== false;
  if (emailNotifyStatusToggle) emailNotifyStatusToggle.checked = settings.email_notify_status_updates !== false;

  const hasPass = settings.has_smtp_pass === true;
  if (emailPassInput) {
    emailPassInput.placeholder = hasPass ? "Saved (leave blank to keep)" : "Enter password / app password";
  }
}

async function loadEmailSettings() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-email-settings?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load email settings");
  setEmailSettingsFields(data.settings);
  emailSettingsLoaded = true;
  setEmailControlsEnabled(true);
  if (saveEmailSettingsBtn) saveEmailSettingsBtn.disabled = false;
  if (testEmailSettingsBtn) testEmailSettingsBtn.disabled = false;
}

async function saveEmailSettings() {
  if (!activeCompanyId) return;
  const payload = emailSettingsPayload();
  const res = await fetch("/api/company-email-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save email settings");
  setEmailSettingsFields(data.settings);
  if (emailPassInput) emailPassInput.value = "";
  return data.settings;
}

async function sendTestEmail() {
  if (!activeCompanyId) return;
  const to = String(emailTestToInput?.value || "").trim();
  const res = await fetch("/api/company-email-settings/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId, to }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to send test email");
  return data;
}

async function loadCompanyProfile() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-profile?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load company profile");
  setCompanyProfileFields(data.profile);
  companyProfileLoaded = true;
  if (saveCompanyBtn) saveCompanyBtn.disabled = false;
}

async function saveCompanyProfile() {
  if (!activeCompanyId) return;
  const payload = companyProfilePayload();
  if (!payload.name || !payload.email) {
    throw new Error("Company name and email are required.");
  }
  const res = await fetch("/api/company-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save company profile");
  setCompanyProfileFields(data.profile);
  return data.profile;
}

async function loadSettings() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/company-settings?companyId=${activeCompanyId}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load settings");
  renderLogoPreview(data.settings?.logo_url || null);
  renderStorefrontRequirements(data.settings?.required_storefront_customer_fields || []);
  storefrontRequirementsLoaded = true;
  if (saveStorefrontRequirementsBtn) saveStorefrontRequirementsBtn.disabled = false;
  renderRentalInfoFields(data.settings?.rental_info_fields || null);
  rentalInfoFieldsLoaded = true;
  if (saveRentalInfoFieldsBtn) saveRentalInfoFieldsBtn.disabled = false;
  if (customerDocCategoriesInput) {
    const categories = Array.isArray(data.settings?.customer_document_categories) ? data.settings.customer_document_categories : [];
    customerDocCategoriesInput.value = categories.join("\n");
  }
  if (customerTermsTemplateInput) customerTermsTemplateInput.value = data.settings?.customer_terms_template || "";
  if (customerEsignRequiredToggle) customerEsignRequiredToggle.checked = data.settings?.customer_esign_required === true;
  customerLinkSettingsLoaded = true;
  if (saveCustomerLinkSettingsBtn) saveCustomerLinkSettingsBtn.disabled = false;
  setQboSettingsFields(data.settings || null);
  qboSettingsLoaded = true;
  if (saveQboSettingsBtn) saveQboSettingsBtn.disabled = false;
  if (autoWorkOrderOnReturnToggle) {
    autoWorkOrderOnReturnToggle.checked = data.settings?.auto_work_order_on_return === true;
  }
  workOrderSettingsLoaded = true;
  if (saveWorkOrderSettingsBtn) saveWorkOrderSettingsBtn.disabled = false;
}

async function loadQboIncomeAccounts({ force = false } = {}) {
  if (!activeCompanyId || !qboIncomeAccountsSelect) return;
  if (qboIncomeAccountsLoading) return;
  if (!qboConnected) {
    setQboIncomeAccountsEnabled(false);
    setQboIncomeAccountsHint("Connect QuickBooks Online to load accounts.");
    renderQboIncomeAccountsOptions([]);
    return;
  }
  if (qboIncomeAccountsCache.length && !force) {
    renderQboIncomeAccountsOptions(qboIncomeAccountsCache);
    setQboIncomeAccountsHint(`Loaded ${qboIncomeAccountsCache.length} income accounts.`);
    setQboIncomeAccountsEnabled(true);
    return;
  }

  qboIncomeAccountsLoading = true;
  setQboIncomeAccountsEnabled(false);
  setQboIncomeAccountsHint("Loading QBO income accounts...");
  try {
    const res = await fetch(
      `/api/qbo/income-accounts?companyId=${encodeURIComponent(String(activeCompanyId))}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load QBO income accounts");
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    qboIncomeAccountsCache = accounts;
    renderQboIncomeAccountsOptions(accounts);
    setQboIncomeAccountsHint(
      accounts.length
        ? `Loaded ${accounts.length} income accounts. Hold Ctrl/Cmd to select multiple.`
        : "No income accounts found."
    );
  } catch (err) {
    setQboIncomeAccountsHint(err?.message ? String(err.message) : "Unable to load QBO income accounts.");
    renderQboIncomeAccountsOptions(qboIncomeAccountsCache);
  } finally {
    qboIncomeAccountsLoading = false;
    setQboIncomeAccountsEnabled(qboConnected);
  }
}

async function loadQboTaxCodes({ force = false } = {}) {
  if (!activeCompanyId || !qboDefaultTaxCodeSelect) return;
  if (qboTaxCodesLoading) return;
  if (!qboConnected) {
    setQboTaxCodesEnabled(false);
    setQboTaxCodesHint("Connect QuickBooks Online to load tax codes.");
    renderQboTaxCodesOptions([]);
    return;
  }
  if (qboTaxCodesCache.length && !force) {
    renderQboTaxCodesOptions(qboTaxCodesCache);
    setQboTaxCodesHint(`Loaded ${qboTaxCodesCache.length} tax codes.`);
    setQboTaxCodesEnabled(true);
    return;
  }

  qboTaxCodesLoading = true;
  setQboTaxCodesEnabled(false);
  setQboTaxCodesHint("Loading QBO tax codes...");
  try {
    const res = await fetch(
      `/api/qbo/tax-codes?companyId=${encodeURIComponent(String(activeCompanyId))}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load QBO tax codes");
    const taxCodes = Array.isArray(data.taxCodes) ? data.taxCodes : [];
    qboTaxCodesCache = taxCodes;
    renderQboTaxCodesOptions(taxCodes);
    setQboTaxCodesHint(taxCodes.length ? `Loaded ${taxCodes.length} tax codes.` : "No tax codes found.");
  } catch (err) {
    setQboTaxCodesHint(err?.message ? String(err.message) : "Unable to load QBO tax codes.");
    renderQboTaxCodesOptions(qboTaxCodesCache);
  } finally {
    qboTaxCodesLoading = false;
    setQboTaxCodesEnabled(qboConnected);
  }
}

async function loadQboStatus() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/qbo/status?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load QBO status");
  qboConnected = data.connected === true;
  if (qboStatus) {
    qboStatus.textContent = data.connected
      ? `Connected to QBO (realm ${data.realmId || "unknown"}).`
      : "Not connected to QuickBooks Online.";
  }
  if (qboDisconnectBtn) qboDisconnectBtn.disabled = !data.connected;
  if (qboConnected) {
    loadQboIncomeAccounts().catch((err) =>
      setQboIncomeAccountsHint(err?.message ? String(err.message) : "Unable to load QBO income accounts.")
    );
    loadQboTaxCodes().catch((err) =>
      setQboTaxCodesHint(err?.message ? String(err.message) : "Unable to load QBO tax codes.")
    );
  } else {
    loadQboIncomeAccounts().catch(() => null);
    loadQboTaxCodes().catch(() => null);
  }
  return data;
}

async function saveQboSettings() {
  if (!activeCompanyId) return;
  const payload = qboSettingsPayload();
  const res = await fetch("/api/company-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save QBO settings");
  setQboSettingsFields(data.settings);
  return data.settings;
}

async function saveWorkOrderSettings() {
  if (!activeCompanyId) return;
  const res = await fetch("/api/company-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: activeCompanyId,
      autoWorkOrderOnReturn: autoWorkOrderOnReturnToggle?.checked === true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save work order settings");
  if (autoWorkOrderOnReturnToggle) {
    autoWorkOrderOnReturnToggle.checked = data.settings?.auto_work_order_on_return === true;
  }
  return data.settings;
}

async function loadUserMode() {
  const session = window.RentSoft?.getSession?.();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!activeCompanyId || !userId) return;
  const res = await fetch(`/api/users/${encodeURIComponent(String(userId))}?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load user profile.");
  if (userMeta) {
    const label = data?.user?.email ? `${data.user.name || "User"} <${data.user.email}>` : "User";
    userMeta.textContent = `${label}${data?.user?.role ? ` • ${data.user.role}` : ""}`;
  }
  if (canActAsCustomerToggle) canActAsCustomerToggle.checked = data?.user?.canActAsCustomer === true;
  userModeLoaded = true;
  if (saveCustomerModeBtn) saveCustomerModeBtn.disabled = false;
}

async function saveUserMode() {
  const session = window.RentSoft?.getSession?.();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  if (!activeCompanyId || !userId) return;
  const res = await fetch(`/api/users/${encodeURIComponent(String(userId))}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: activeCompanyId,
      canActAsCustomer: canActAsCustomerToggle?.checked === true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to save.");
  if (canActAsCustomerToggle) canActAsCustomerToggle.checked = data?.user?.canActAsCustomer === true;
  setCustomerModeHint(data?.user?.canActAsCustomer ? "Customer mode enabled." : "Customer mode disabled.");
  return data?.user || null;
}

saveStorefrontRequirementsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setStorefrontRequirementsHint("Savingƒ?İ");
  saveStorefrontRequirementsBtn.disabled = true;
  try {
    const selected = readStorefrontRequirementsSelection();
    const res = await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        requiredStorefrontCustomerFields: selected,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save requirements");
    renderStorefrontRequirements(data.settings?.required_storefront_customer_fields || selected);
    setStorefrontRequirementsHint("Storefront requirements saved.");
  } catch (err) {
    setStorefrontRequirementsHint(err.message || "Unable to save requirements.");
  } finally {
    saveStorefrontRequirementsBtn.disabled = !storefrontRequirementsLoaded;
  }
});

saveRentalInfoFieldsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setRentalInfoFieldsHint("Saving...");
  saveRentalInfoFieldsBtn.disabled = true;
  try {
    const selected = readRentalInfoFieldsSelection();
    const res = await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        rentalInfoFields: selected,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save rental info fields");
    renderRentalInfoFields(data.settings?.rental_info_fields || selected);
    setRentalInfoFieldsHint("Rental information fields saved.");
  } catch (err) {
    setRentalInfoFieldsHint(err?.message ? String(err.message) : "Unable to save rental info fields.");
  } finally {
    saveRentalInfoFieldsBtn.disabled = !rentalInfoFieldsLoaded;
  }
});

saveCustomerLinkSettingsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setCustomerLinkSettingsHint("Saving...");
  saveCustomerLinkSettingsBtn.disabled = true;
  try {
    const categories = (customerDocCategoriesInput?.value || "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    const res = await fetch("/api/company-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        customerDocumentCategories: categories,
        customerTermsTemplate: customerTermsTemplateInput?.value || "",
        customerEsignRequired: customerEsignRequiredToggle?.checked === true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to save customer update settings");
    if (customerDocCategoriesInput) {
      const next = Array.isArray(data.settings?.customer_document_categories) ? data.settings.customer_document_categories : categories;
      customerDocCategoriesInput.value = next.join("\n");
    }
    if (customerTermsTemplateInput) {
      customerTermsTemplateInput.value = data.settings?.customer_terms_template || "";
    }
    if (customerEsignRequiredToggle) {
      customerEsignRequiredToggle.checked = data.settings?.customer_esign_required === true;
    }
    setCustomerLinkSettingsHint("Customer update settings saved.");
  } catch (err) {
    setCustomerLinkSettingsHint(err?.message ? String(err.message) : "Unable to save customer update settings.");
  } finally {
    saveCustomerLinkSettingsBtn.disabled = !customerLinkSettingsLoaded;
  }
});

logoFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0] || null;
  e.target.value = "";
  if (!file || !activeCompanyId) return;

  setLogoHint("Uploading…");
  logoFileInput.disabled = true;
  removeLogoBtn.disabled = true;
  try {
    const url = await uploadLogo({ file });
    const previous = currentLogoUrl;
    await saveLogoUrl(url);
    renderLogoPreview(url);
    setLogoHint("Logo saved.");
    if (previous) {
      deleteLogo(previous).catch(() => { });
    }
  } catch (err) {
    setLogoHint(err.message || "Unable to upload logo.");
  } finally {
    logoFileInput.disabled = false;
    removeLogoBtn.disabled = !currentLogoUrl;
  }
});

removeLogoBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId || !currentLogoUrl) return;
  const previous = currentLogoUrl;
  setLogoHint("Removing…");
  removeLogoBtn.disabled = true;
  logoFileInput.disabled = true;
  try {
    await saveLogoUrl(null);
    renderLogoPreview(null);
    setLogoHint("Logo removed.");
    await deleteLogo(previous).catch(() => { });
  } catch (err) {
    setLogoHint(err.message || "Unable to remove logo.");
    renderLogoPreview(previous);
  } finally {
    logoFileInput.disabled = false;
    removeLogoBtn.disabled = !currentLogoUrl;
  }
});

saveCompanyBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setCompanyInfoHint("Saving…");
  saveCompanyBtn.disabled = true;
  try {
    await saveCompanyProfile();
    setCompanyInfoHint("Company info saved.");
  } catch (err) {
    setCompanyInfoHint(err.message || "Unable to save company info.");
  } finally {
    saveCompanyBtn.disabled = !companyProfileLoaded;
  }
});

saveCustomerModeBtn?.addEventListener("click", async () => {
  if (!activeCompanyId) return;
  setCustomerModeHint("Saving…");
  saveCustomerModeBtn.disabled = true;
  try {
    await saveUserMode();
  } catch (err) {
    setCustomerModeHint(err?.message ? String(err.message) : String(err));
  } finally {
    saveCustomerModeBtn.disabled = !userModeLoaded;
  }
});

saveQboSettingsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setQboHint("Saving...");
  saveQboSettingsBtn.disabled = true;
  try {
    await saveQboSettings();
    setQboHint("QBO settings saved.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to save QBO settings.");
  } finally {
    saveQboSettingsBtn.disabled = !qboSettingsLoaded;
  }
});

saveWorkOrderSettingsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setWorkOrderSettingsHint("Saving...");
  saveWorkOrderSettingsBtn.disabled = true;
  try {
    await saveWorkOrderSettings();
    setWorkOrderSettingsHint("Work order settings saved.");
  } catch (err) {
    setWorkOrderSettingsHint(err?.message ? String(err.message) : "Unable to save work order settings.");
  } finally {
    saveWorkOrderSettingsBtn.disabled = !workOrderSettingsLoaded;
  }
});

qboIncomeAccountsSelect?.addEventListener("change", () => {
  syncQboIncomeAccountIdsFromSelect();
});

qboDefaultTaxCodeSelect?.addEventListener("change", () => {
  syncQboDefaultTaxCodeFromSelect();
});

qboIncomeAccountsRefreshBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  await loadQboIncomeAccounts({ force: true }).catch((err) =>
    setQboIncomeAccountsHint(err?.message ? String(err.message) : "Unable to load QBO income accounts.")
  );
});

qboTaxCodesRefreshBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  await loadQboTaxCodes({ force: true }).catch((err) =>
    setQboTaxCodesHint(err?.message ? String(err.message) : "Unable to load QBO tax codes.")
  );
});

qboConnectBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  window.location.href = `/api/qbo/authorize?companyId=${encodeURIComponent(String(activeCompanyId))}`;
});

qboDisconnectBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setQboHint("Disconnecting...");
  qboDisconnectBtn.disabled = true;
  try {
    const res = await fetch("/api/qbo/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Unable to disconnect QBO");
    }
    await loadQboStatus();
    setQboHint("QBO disconnected.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to disconnect QBO.");
    qboDisconnectBtn.disabled = false;
  }
});

emailProviderSelect?.addEventListener("change", () => applyEmailProviderPreset(emailProviderSelect.value));

saveEmailSettingsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setEmailSettingsHint("Savingƒ?Ý");
  saveEmailSettingsBtn.disabled = true;
  testEmailSettingsBtn.disabled = true;
  try {
    await saveEmailSettings();
    setEmailSettingsHint("Email settings saved.");
  } catch (err) {
    setEmailSettingsHint(err?.message ? String(err.message) : String(err));
  } finally {
    saveEmailSettingsBtn.disabled = !emailSettingsLoaded;
    testEmailSettingsBtn.disabled = !emailSettingsLoaded;
  }
});

testEmailSettingsBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  setEmailSettingsHint("Sending test emailƒ?Ý");
  testEmailSettingsBtn.disabled = true;
  try {
    await sendTestEmail();
    setEmailSettingsHint("Test email sent.");
  } catch (err) {
    setEmailSettingsHint(err?.message ? String(err.message) : String(err));
  } finally {
    testEmailSettingsBtn.disabled = !emailSettingsLoaded;
  }
});

if (activeCompanyId) {
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  companyMeta.textContent = companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`;
  const qboParam = new URLSearchParams(window.location.search).get("qbo");
  if (qboParam === "connected") setQboHint("QuickBooks connected.");
  loadSettings().catch((err) => (companyMeta.textContent = err.message));
  loadCompanyProfile().catch((err) => setCompanyInfoHint(err.message));
  loadUserMode().catch((err) => setCustomerModeHint(err.message));
  setEmailControlsEnabled(false);
  loadEmailSettings().catch((err) => setEmailSettingsHint(err.message));
  loadQboStatus().catch((err) => setQboHint(err.message));
} else {
  companyMeta.textContent = "Log in to view settings.";
}

if (logoutBtn) {
  window.RentSoft?.mountLogoutButton?.({ buttonId: "logout-button", redirectTo: "index.html" });
}
