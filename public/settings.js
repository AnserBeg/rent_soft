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

const saveCompanyBtn = document.getElementById("save-company");
const companyNameInput = document.getElementById("company-name");
const companyEmailInput = document.getElementById("company-email");
const companyPhoneInput = document.getElementById("company-phone");
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
let userModeLoaded = false;
let emailSettingsLoaded = false;

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
  { key: "criticalAreas", label: "Critical areas on site" },
  { key: "generalNotes", label: "General notes" },
  { key: "emergencyContacts", label: "Emergency contacts" },
  { key: "siteContacts", label: "Site contacts" },
  { key: "coverageHours", label: "Hours of coverage" },
];

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

function setStorefrontRequirementsHint(message) {
  if (!storefrontRequirementsHint) return;
  storefrontRequirementsHint.textContent = String(message || "");
}

function setRentalInfoFieldsHint(message) {
  if (!rentalInfoFieldsHint) return;
  rentalInfoFieldsHint.textContent = String(message || "");
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

async function uploadLogo({ file }) {
  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("image", file);
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
      deleteLogo(previous).catch(() => {});
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
    await deleteLogo(previous).catch(() => {});
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
  loadSettings().catch((err) => (companyMeta.textContent = err.message));
  loadCompanyProfile().catch((err) => setCompanyInfoHint(err.message));
  loadUserMode().catch((err) => setCustomerModeHint(err.message));
  setEmailControlsEnabled(false);
  loadEmailSettings().catch((err) => setEmailSettingsHint(err.message));
} else {
  companyMeta.textContent = "Log in to view settings.";
}

if (logoutBtn) {
  window.RentSoft?.mountLogoutButton?.({ buttonId: "logout-button", redirectTo: "index.html" });
}
