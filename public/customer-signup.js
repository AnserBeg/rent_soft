function $(id) {
  return document.getElementById(id);
}

function setMeta(el, text) {
  if (!el) return;
  el.textContent = text || "";
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search || "");
  const value = params.get(name);
  return value ? String(value) : null;
}

function normalizeCompanyId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function addQueryParam(url, key, value) {
  if (!url) return url;
  try {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set(String(key), String(value));
    const out = parsed.pathname + parsed.search + parsed.hash;
    return out || url;
  } catch {
    return url;
  }
}

function normalizeContactValue(value) {
  return String(value ?? "").trim();
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
        name: normalizeContactValue(row?.name || row?.contactName || row?.contact_name),
        title: normalizeContactValue(row?.title || row?.contactTitle || row?.contact_title),
        email: normalizeContactValue(row?.email),
        phone: normalizeContactValue(row?.phone),
      },
      { focus: false }
    );
  });
}

function collectContacts(list) {
  if (!list) return [];
  const rows = Array.from(list.querySelectorAll(".contact-row"));
  return rows
    .map((row) => {
      const name = normalizeContactValue(row.querySelector('[data-contact-field="name"]')?.value);
      const title = normalizeContactValue(row.querySelector('[data-contact-field="title"]')?.value);
      const email = normalizeContactValue(row.querySelector('[data-contact-field="email"]')?.value);
      const phone = normalizeContactValue(row.querySelector('[data-contact-field="phone"]')?.value);
      if (!name && !email && !phone) return null;
      return { name, title, email, phone };
    })
    .filter(Boolean);
}

const DEFAULT_CONTACT_CATEGORIES = [
  { key: "contacts", label: "Contacts" },
  { key: "accountingContacts", label: "Accounting contacts" },
];
let contactCategoryConfig = DEFAULT_CONTACT_CATEGORIES;
const contactCategoryLists = new Map();

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

function renderContactCategories(container, categories) {
  if (!container) return;
  container.innerHTML = "";
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
    container.appendChild(block);
    contactCategoryLists.set(category.key, list);
  });
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

document.addEventListener("DOMContentLoaded", () => {
  const form = $("customer-signup-form");
  const meta = $("customer-signup-meta");
  const submit = $("customer-signup-submit");
  const loginLink = $("login-link");
  const accountSection = $("account-section");
  const businessSection = $("business-section");
  const continueBtn = $("customer-signup-continue");
  const backBtn = $("customer-signup-back");
  const contactCategoriesContainer = $("customer-contact-categories");

  const returnTo = getQueryParam("returnTo");
  const companyId = normalizeCompanyId(getQueryParam("companyId"));
  if (loginLink) {
    const qs = new URLSearchParams();
    if (returnTo) qs.set("returnTo", returnTo);
    if (companyId) qs.set("companyId", String(companyId));
    loginLink.href = `customer-login.html${qs.toString() ? `?${qs.toString()}` : ""}`;
  }

  function showBusinessSection() {
    if (accountSection) accountSection.style.display = "none";
    if (businessSection) businessSection.style.display = "block";
    const companyNameInput = form?.querySelector?.('input[name="companyName"]');
    if (companyNameInput) companyNameInput.focus();
  }

  function showAccountSection() {
    if (accountSection) accountSection.style.display = "block";
    if (businessSection) businessSection.style.display = "none";
    const nameInput = form?.querySelector?.('input[name="name"]');
    if (nameInput) nameInput.focus();
  }

  function validateAccountSection() {
    if (!form) return false;
    const fields = [
      form.querySelector('input[name="name"]'),
      form.querySelector('input[name="email"]'),
      form.querySelector('input[name="password"]'),
    ].filter(Boolean);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  continueBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    if (!validateAccountSection()) return;
    showBusinessSection();
  });

  backBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showAccountSection();
  });

  async function loadContactCategories() {
    let categories = DEFAULT_CONTACT_CATEGORIES;
    if (companyId) {
      try {
        const res = await fetch(
          `/api/public/company-contact-categories?companyId=${encodeURIComponent(String(companyId))}`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) categories = data.categories || categories;
      } catch {
        // ignore
      }
    }
    renderContactCategories(contactCategoriesContainer, categories);
    setContactCategoryRows({});
  }

  loadContactCategories();

  contactCategoriesContainer?.addEventListener("click", (e) => {
    const addBtn = e.target.closest?.("[data-add-contact-category]");
    if (addBtn) {
      e.preventDefault();
      const key = addBtn.getAttribute("data-add-contact-category");
      const list = contactCategoryLists.get(String(key || ""));
      if (list) addContactRow(list, {}, { focus: true });
      return;
    }

    const removeBtn = e.target.closest?.(".contact-remove");
    if (!removeBtn) return;
    e.preventDefault();
    const row = removeBtn.closest(".contact-row");
    const list = row?.parentElement || null;
    if (row) row.remove();
    updateContactRemoveButtons(list);
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (businessSection && businessSection.style.display === "none") {
      if (validateAccountSection()) showBusinessSection();
      return;
    }
    setMeta(meta, "");
    if (submit) submit.disabled = true;
    try {
      const formData = new FormData(form);
      const { contacts, accountingContacts, contactGroups } = collectContactCategoryPayload();
      const accountName = String(formData.get("name") || "").trim();
      const accountEmail = String(formData.get("email") || "").trim();
      const accountPhone = String(formData.get("phone") || "").trim();
      if (!contacts.length && (accountName || accountEmail || accountPhone)) {
        contacts.push({ name: accountName, email: accountEmail, phone: accountPhone });
      }
      formData.set("contacts", JSON.stringify(contacts));
      formData.set("accountingContacts", JSON.stringify(accountingContacts));
      formData.set("contactGroups", JSON.stringify(contactGroups));

      const companyName = String(formData.get("companyName") || "").trim();
      if (companyName && !formData.get("businessName")) {
        formData.set("businessName", companyName);
      }

      if (companyId) {
        formData.set("companyId", String(companyId));
      }

      const canChargeDeposit = form.querySelector('input[name="canChargeDeposit"]')?.checked === true;
      formData.set("canChargeDeposit", canChargeDeposit ? "true" : "false");

      const endpoint = companyId ? "/api/storefront/customers/signup" : "/api/customers/signup";
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sign up failed.");

      window.CustomerAccount?.setSession?.({ token: data.token, customer: data.customer });
      if (returnTo) {
        window.location.href = addQueryParam(returnTo, "customerWelcome", "1");
      } else {
        window.location.href = "index.html";
      }
    } catch (err) {
      setMeta(meta, err?.message ? String(err.message) : String(err));
    } finally {
      if (submit) submit.disabled = false;
    }
  });
});
