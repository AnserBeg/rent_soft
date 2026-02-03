const companyMeta = document.getElementById("company-meta");
const customersTable = document.getElementById("customers-table");
const newCustomerBtn = document.getElementById("new-customer");
const importCustomersBtn = document.getElementById("import-customers");
const importFileInput = document.getElementById("import-file");
const importStatus = document.getElementById("import-status");
const searchInput = document.getElementById("search");
const qboStatus = document.getElementById("qbo-customers-status");
const qboHint = document.getElementById("qbo-customers-hint");
const qboConnectBtn = document.getElementById("qbo-connect");
const qboDisconnectBtn = document.getElementById("qbo-disconnect");
const qboLoadBtn = document.getElementById("qbo-customers-load");
const qboRefreshBtn = document.getElementById("qbo-customers-refresh");
const qboImportAllBtn = document.getElementById("qbo-customers-import-all");
const qboCustomersTable = document.getElementById("qbo-customers-table");
const qboLocalCustomersTable = document.getElementById("qbo-local-customers-table");
const qboCustomersSearch = document.getElementById("qbo-customers-search");
const qboLocalSearch = document.getElementById("qbo-local-search");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let customersCache = [];
let salesCache = [];
let qboCustomersCache = [];
let qboConnected = false;
let sortField = "company_name";
let sortDir = "asc";
let searchTerm = "";
let qboSearchTerm = "";
let qboLocalSearchTerm = "";
let pendingCustomerUpdates = new Set();

const LIST_STATE_KEY = "rentsoft.customers.listState";
const ALLOWED_SORT_FIELDS = new Set(["company_name", "parent_company_name", "contact_name", "email", "phone", "city", "region", "country", "postal_code", "follow_up_date", "sales"]);

function loadListState() {
  const raw = localStorage.getItem(LIST_STATE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved.searchTerm === "string") searchTerm = saved.searchTerm;
    if (typeof saved.sortField === "string" && ALLOWED_SORT_FIELDS.has(saved.sortField)) sortField = saved.sortField;
    if (saved.sortDir === "asc" || saved.sortDir === "desc") sortDir = saved.sortDir;
  } catch { }
}

function persistListState() {
  localStorage.setItem(
    LIST_STATE_KEY,
    JSON.stringify({
      searchTerm: String(searchTerm || ""),
      sortField,
      sortDir,
    })
  );
}


function renderCustomers(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  customersTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "company_name" ? "active" : ""}" data-sort="company_name">Company ${indicator("company_name")}</span>
      <span class="sort ${sortField === "parent_company_name" ? "active" : ""}" data-sort="parent_company_name">Parent ${indicator("parent_company_name")}</span>
      <span class="sort ${sortField === "contact_name" ? "active" : ""}" data-sort="contact_name">Contact ${indicator("contact_name")}</span>
      <span class="sort ${sortField === "email" ? "active" : ""}" data-sort="email">Email ${indicator("email")}</span>
      <span class="sort ${sortField === "phone" ? "active" : ""}" data-sort="phone">Phone ${indicator("phone")}</span>
      <span class="sort ${sortField === "city" ? "active" : ""}" data-sort="city">City ${indicator("city")}</span>
      <span class="sort ${sortField === "region" ? "active" : ""}" data-sort="region">Region ${indicator("region")}</span>
      <span class="sort ${sortField === "country" ? "active" : ""}" data-sort="country">Country ${indicator("country")}</span>
      <span class="sort ${sortField === "postal_code" ? "active" : ""}" data-sort="postal_code">Postal ${indicator("postal_code")}</span>
      <span class="sort ${sortField === "follow_up_date" ? "active" : ""}" data-sort="follow_up_date">Follow up ${indicator("follow_up_date")}</span>
      <span class="sort ${sortField === "sales" ? "active" : ""}" data-sort="sales">Sales ${indicator("sales")}</span>
      <span>Updates</span>
    </div>`;
  rows.forEach((row) => {
    const sales = salesCache.find((s) => s.id === row.sales_person_id);
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    div.innerHTML = `
      <span>${row.company_name}</span>
      <span>${row.parent_company_name || "--"}</span>
      <span>${row.contact_name || "--"}</span>
      <span>${row.email || "--"}</span>
      <span>${row.phone || "--"}</span>
      <span>${row.city || "--"}</span>
      <span>${row.region || "--"}</span>
      <span>${row.country || "--"}</span>
      <span>${row.postal_code || "--"}</span>
      <span>${row.follow_up_date || "--"}</span>
      <span>${sales?.name || "--"}</span>
      <span>${pendingCustomerUpdates.has(Number(row.id)) ? "Pending" : ""}</span>
    `;
    customersTable.appendChild(div);
  });
}

function setQboStatus(message) {
  if (!qboStatus) return;
  qboStatus.textContent = String(message || "");
}

function setQboHint(message) {
  if (!qboHint) return;
  qboHint.textContent = String(message || "");
}

function normalizeMatchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function scoreCustomerMatch(local, qbo) {
  let score = 0;
  const localName = normalizeMatchValue(local.company_name || "");
  const qboName = normalizeMatchValue(qbo.displayName || qbo.companyName || "");

  if (localName && qboName) {
    if (localName === qboName) score += 3;
    const localTokens = new Set(localName.split(" ").filter(Boolean));
    const qboTokens = new Set(qboName.split(" ").filter(Boolean));
    if (localTokens.size && qboTokens.size) {
      let overlap = 0;
      localTokens.forEach((t) => {
        if (qboTokens.has(t)) overlap += 1;
      });
      const union = localTokens.size + qboTokens.size - overlap;
      if (union > 0) score += (overlap / union) * 2;
    }
    if (localName.includes(qboName) || qboName.includes(localName)) score += 1;
  }

  const localEmail = normalizeEmail(local.email);
  const qboEmail = normalizeEmail(qbo.email);
  if (localEmail && qboEmail && localEmail === qboEmail) score += 3;

  const localPhone = normalizePhone(local.phone);
  const qboPhone = normalizePhone(qbo.phone);
  if (localPhone && qboPhone) {
    if (localPhone === qboPhone) score += 2;
    else if (localPhone.length >= 7 && qboPhone.length >= 7 && localPhone.slice(-7) === qboPhone.slice(-7)) {
      score += 1.5;
    }
  }

  return score;
}

function applyFilters() {
  let rows = [...customersCache];
  const bySalesId = new Map((salesCache || []).map((s) => [s.id, s.name]));

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => {
      const sales = bySalesId.get(r.sales_person_id) || "";
      return [
        r.company_name,
        r.contact_name,
        r.email,
        r.phone,
        r.city,
        r.region,
        r.country,
        r.postal_code,
        r.parent_company_name,
        r.follow_up_date,
        sales,
        r.notes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const sortKey = (row) => {
    const sales = bySalesId.get(row.sales_person_id) || "";
    switch (sortField) {
      case "sales":
        return norm(sales);
      case "follow_up_date": {
        const t = Date.parse(row.follow_up_date || "");
        return Number.isFinite(t) ? t : -Infinity;
      }
      default:
        return norm(row[sortField]);
    }
  };
  rows.sort((a, b) => {
    const av = sortKey(a);
    const bv = sortKey(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return rows;
}

function renderQboCustomersTable() {
  if (!qboCustomersTable) return;
  qboCustomersTable.innerHTML = "";

  const header = document.createElement("div");
  header.className = "table-row table-header";
  header.innerHTML = `
    <span>QBO customer</span>
    <span>Email</span>
    <span>Phone</span>
    <span>Suggested local</span>
    <span>Link to local</span>
    <span>Update name</span>
    <span>Actions</span>
    <span>Status</span>
  `;
  qboCustomersTable.appendChild(header);

  if (!qboConnected) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>Connect QBO to load customers.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    `;
    qboCustomersTable.appendChild(row);
    return;
  }

  if (!qboCustomersCache.length) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>Load QBO customers to view matches.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    `;
    qboCustomersTable.appendChild(row);
    return;
  }

  const linkedByQboId = new Map();
  customersCache.forEach((local) => {
    if (local.qbo_customer_id) linkedByQboId.set(String(local.qbo_customer_id), local);
  });

  const term = normalizeMatchValue(qboSearchTerm);
  const rows = qboCustomersCache.filter((qbo) => {
    if (!term) return true;
    const haystack = [
      qbo.displayName,
      qbo.companyName,
      qbo.email,
      qbo.phone,
    ]
      .filter(Boolean)
      .join(" ");
    return normalizeMatchValue(haystack).includes(term);
  });

  rows.forEach((qbo) => {
    const linkedLocal = qbo.id ? linkedByQboId.get(String(qbo.id)) : null;
    const availableLocals = customersCache.filter(
      (local) => !local.qbo_customer_id || String(local.qbo_customer_id) === String(qbo.id || "")
    );
    const suggestions = availableLocals
      .map((local) => ({ local, score: scoreCustomerMatch(local, qbo) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const suggestedLabel = suggestions[0]?.local?.company_name || "--";
    const suggestedIds = new Set(suggestions.map((entry) => entry.local.id));
    const sortedLocals = availableLocals
      .slice()
      .sort((a, b) => String(a.company_name || "").localeCompare(String(b.company_name || "")));

    const options = [
      `<option value=\"\">Select local customer...</option>`,
      ...suggestions.map(
        (entry) => `<option value=\"${entry.local.id}\">${entry.local.company_name} (suggested)</option>`
      ),
      ...sortedLocals
        .filter((local) => !suggestedIds.has(local.id))
        .map((local) => `<option value=\"${local.id}\">${local.company_name}</option>`),
    ];

    const disabledAttr = linkedLocal ? "disabled" : "";
    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.qboId = qbo.id || "";
    row.innerHTML = `
      <span>${qbo.displayName || qbo.companyName || `QBO #${qbo.id || "--"}`}</span>
      <span>${qbo.email || "--"}</span>
      <span>${qbo.phone || "--"}</span>
      <span>${suggestedLabel}</span>
      <span>
        <select class=\"qbo-link-select\" ${disabledAttr}>${options.join("")}</select>
      </span>
      <span>
        <input type=\"checkbox\" class=\"qbo-update-name\" ${disabledAttr} />
      </span>
      <span class=\"inline\">
        <button class=\"ghost small\" data-action=\"link-qbo\" ${disabledAttr}>Link</button>
        <button class=\"ghost small\" data-action=\"create-local\" ${disabledAttr}>Create local</button>
      </span>
      <span>${linkedLocal ? `Linked: ${linkedLocal.company_name}` : "Unlinked"}</span>
    `;
    qboCustomersTable.appendChild(row);
  });
}

function renderLocalQboTable() {
  if (!qboLocalCustomersTable) return;
  qboLocalCustomersTable.innerHTML = "";

  const header = document.createElement("div");
  header.className = "table-row table-header";
  header.innerHTML = `
    <span>Local customer</span>
    <span>Email</span>
    <span>Phone</span>
    <span>Suggested QBO</span>
    <span>Link to QBO</span>
    <span>Update name</span>
    <span>Actions</span>
    <span>Status</span>
  `;
  qboLocalCustomersTable.appendChild(header);

  const term = normalizeMatchValue(qboLocalSearchTerm);
  const locals = customersCache.filter((local) => !local.qbo_customer_id).filter((local) => {
    if (!term) return true;
    const haystack = [
      local.company_name,
      local.email,
      local.phone,
      local.contact_name,
    ]
      .filter(Boolean)
      .join(" ");
    return normalizeMatchValue(haystack).includes(term);
  });

  if (!locals.length) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>All local customers are linked to QBO.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    `;
    qboLocalCustomersTable.appendChild(row);
    return;
  }

  const linkedQboIds = new Set(
    customersCache.map((local) => String(local.qbo_customer_id || "")).filter(Boolean)
  );
  const availableQbo = qboCustomersCache.filter((qbo) => qbo.id && !linkedQboIds.has(String(qbo.id)));

  locals.forEach((local) => {
    const suggestions = availableQbo
      .map((qbo) => ({ qbo, score: scoreCustomerMatch(local, qbo) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const suggestedLabel = suggestions[0]?.qbo?.displayName || suggestions[0]?.qbo?.companyName || "--";
    const suggestedIds = new Set(suggestions.map((entry) => entry.qbo.id));
    const sortedQbo = availableQbo
      .slice()
      .sort((a, b) => String(a.displayName || a.companyName || "").localeCompare(String(b.displayName || b.companyName || "")));

    const options = [
      `<option value=\"\">Select QBO customer...</option>`,
      ...suggestions.map(
        (entry) => `<option value=\"${entry.qbo.id}\">${entry.qbo.displayName || entry.qbo.companyName} (suggested)</option>`
      ),
      ...sortedQbo
        .filter((qbo) => !suggestedIds.has(qbo.id))
        .map((qbo) => `<option value=\"${qbo.id}\">${qbo.displayName || qbo.companyName || `QBO #${qbo.id}`}</option>`),
    ];

    const disabledAttr = qboConnected ? "" : "disabled";
    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.localId = local.id;
    row.innerHTML = `
      <span>${local.company_name}</span>
      <span>${local.email || "--"}</span>
      <span>${local.phone || "--"}</span>
      <span>${suggestedLabel}</span>
      <span>
        <select class=\"qbo-link-select\" ${disabledAttr}>${options.join("")}</select>
      </span>
      <span>
        <input type=\"checkbox\" class=\"qbo-update-name\" ${disabledAttr} />
      </span>
      <span class=\"inline\">
        <button class=\"ghost small\" data-action=\"link-local\" ${disabledAttr}>Link</button>
        <button class=\"ghost small\" data-action=\"create-qbo\" ${disabledAttr}>Create QBO</button>
      </span>
      <span>${qboConnected ? "Unlinked" : "QBO disconnected"}</span>
    `;
    qboLocalCustomersTable.appendChild(row);
  });
}

function renderQboTables() {
  renderQboCustomersTable();
  renderLocalQboTable();
}

async function loadQboStatus() {
  if (!activeCompanyId) return;
  const res = await fetch(`/api/qbo/status?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load QBO status");
  qboConnected = !!data.connected;
  setQboStatus(
    qboConnected
      ? `Connected to QBO (realm ${data.realmId || "unknown"}).`
      : "Not connected to QuickBooks Online."
  );
  if (qboDisconnectBtn) qboDisconnectBtn.disabled = !qboConnected;
  if (qboLoadBtn) qboLoadBtn.disabled = !qboConnected;
  if (qboImportAllBtn) qboImportAllBtn.disabled = !qboConnected;
  renderQboTables();
  return data;
}

async function loadQboCustomers() {
  if (!activeCompanyId) return;
  if (!qboConnected) {
    setQboHint("Connect QuickBooks to load customers.");
    return;
  }
  setQboHint("Loading QBO customers...");
  const res = await fetch(`/api/qbo/customers?companyId=${encodeURIComponent(String(activeCompanyId))}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load QBO customers");
  qboCustomersCache = Array.isArray(data.customers) ? data.customers : [];
  setQboHint(`Loaded ${qboCustomersCache.length} QBO customers.`);
  renderQboTables();
}

async function linkLocalToQbo({ localId, qboId, updateName }) {
  if (!activeCompanyId) return;
  setQboHint("Linking customer...");
  try {
    const res = await fetch("/api/qbo/customers/link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: activeCompanyId,
        customerId: Number(localId),
        qboCustomerId: String(qboId),
        updateName: !!updateName,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to link customer.");
    await loadCustomers();
    setQboHint("Customer linked.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to link customer.");
  }
}

async function createLocalFromQbo(qboId) {
  if (!activeCompanyId) return;
  setQboHint("Creating local customer...");
  try {
    const res = await fetch("/api/qbo/customers/create-local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, qboCustomerId: String(qboId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to create local customer.");
    await loadCustomers();
    setQboHint(data.skipped ? "Customer already linked." : "Local customer created.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to create local customer.");
  }
}

async function createQboFromLocal(localId) {
  if (!activeCompanyId) return;
  setQboHint("Creating QBO customer...");
  try {
    const res = await fetch("/api/qbo/customers/create-qbo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, customerId: Number(localId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to create QBO customer.");
    await loadCustomers();
    if (qboConnected) {
      await loadQboCustomers().catch(() => null);
    }
    setQboHint(data.skipped ? "Customer already linked." : "QBO customer created.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to create QBO customer.");
  }
}

async function loadCustomers() {
  if (!activeCompanyId) return;
  try {
    const [customersRes, updatesRes] = await Promise.all([
      fetch(`/api/customers?companyId=${activeCompanyId}`),
      fetch(`/api/customer-change-requests?companyId=${activeCompanyId}&status=pending`),
    ]);
    if (!customersRes.ok) throw new Error("Unable to fetch customers");
    const data = await customersRes.json();
    customersCache = data.customers || [];
    if (updatesRes.ok) {
      const updatesData = await updatesRes.json();
      pendingCustomerUpdates = new Set(
        (updatesData.requests || [])
          .map((r) => Number(r.customer_id))
          .filter((id) => Number.isFinite(id))
      );
    } else {
      pendingCustomerUpdates = new Set();
    }
    renderCustomers(applyFilters());
    renderQboTables();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadSales() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/sales-people?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch sales people");
    const data = await res.json();
    salesCache = data.sales || [];
    renderCustomers(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}


newCustomerBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "customers-form.html";
});

importCustomersBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  importFileInput?.click();
});

importFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file || !activeCompanyId) return;
  if (importStatus) importStatus.textContent = "Importing customers…";

  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("file", file);

  try {
    const res = await fetch("/api/customers/import", { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Import failed");
    }
    const data = await res.json();
    if (importStatus) {
      importStatus.textContent = `Import complete: created ${data.created || 0}, updated ${data.updated || 0}, skipped ${data.skipped || 0}.`;
    }
    await loadCustomers();
  } catch (err) {
    if (importStatus) importStatus.textContent = err.message || "Import failed";
  } finally {
    if (importFileInput) importFileInput.value = "";
  }
});


qboConnectBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const redirect = "/customers.html?qbo=connected";
  window.location.href = `/api/qbo/authorize?companyId=${encodeURIComponent(String(activeCompanyId))}&redirect=${encodeURIComponent(redirect)}`;
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
    qboCustomersCache = [];
    await loadQboStatus();
    setQboHint("QBO disconnected.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to disconnect QBO.");
    qboDisconnectBtn.disabled = false;
  }
});

qboLoadBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadQboCustomers().catch((err) => {
    setQboHint(err?.message ? String(err.message) : "Unable to load QBO customers.");
  });
});

qboImportAllBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  if (!qboConnected) {
    setQboHint("Connect QuickBooks to import customers.");
    return;
  }
  setQboHint("Importing unlinked QBO customers...");
  try {
    const res = await fetch("/api/qbo/customers/import-unlinked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to import QBO customers.");

    const imported = data.imported || 0;
    const skippedMatched = data?.skipped?.matched || 0;
    const skippedLinked = data?.skipped?.linked || 0;
    const errors = data?.skipped?.errors || 0;
    const hintParts = [
      `Imported ${imported}.`,
      skippedMatched ? `Skipped ${skippedMatched} (possible matches).` : null,
      skippedLinked ? `Skipped ${skippedLinked} (already linked).` : null,
      errors ? `Errors ${errors}.` : null,
      skippedMatched ? "Review possible matches in the table." : null,
    ].filter(Boolean);
    setQboHint(hintParts.join(" "));

    await loadCustomers();
    await loadQboCustomers().catch(() => null);
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to import QBO customers.");
  }
});

qboRefreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadQboStatus().catch((err) => setQboHint(err?.message ? String(err.message) : "Unable to refresh QBO status."));
  loadCustomers().catch(() => null);
});

qboCustomersSearch?.addEventListener("input", (e) => {
  qboSearchTerm = String(e.target.value || "");
  renderQboTables();
});

qboLocalSearch?.addEventListener("input", (e) => {
  qboLocalSearchTerm = String(e.target.value || "");
  renderQboTables();
});

qboCustomersTable?.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  const action = button?.dataset?.action;
  if (!action) return;
  const row = button.closest(".table-row");
  const qboId = row?.dataset?.qboId;
  if (!qboId) return;

  if (action === "link-qbo") {
    const select = row.querySelector(".qbo-link-select");
    const localId = select?.value;
    if (!localId) {
      setQboHint("Select a local customer to link.");
      return;
    }
    const updateName = row.querySelector(".qbo-update-name")?.checked;
    linkLocalToQbo({ localId, qboId, updateName });
  } else if (action === "create-local") {
    createLocalFromQbo(qboId);
  }
});

qboLocalCustomersTable?.addEventListener("click", (e) => {
  const button = e.target.closest("button");
  const action = button?.dataset?.action;
  if (!action) return;
  const row = button.closest(".table-row");
  const localId = row?.dataset?.localId;
  if (!localId) return;

  if (action === "link-local") {
    const select = row.querySelector(".qbo-link-select");
    const qboId = select?.value;
    if (!qboId) {
      setQboHint("Select a QBO customer to link.");
      return;
    }
    const updateName = row.querySelector(".qbo-update-name")?.checked;
    linkLocalToQbo({ localId, qboId, updateName });
  } else if (action === "create-qbo") {
    createQboFromLocal(localId);
  }
});
customersTable.addEventListener("click", (e) => {
  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = "asc";
    }
    renderCustomers(applyFilters());
    persistListState();
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `customers-form.html?id=${id}`;
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderCustomers(applyFilters());
  persistListState();
});

// Init
const hasQboPanel = !!document.getElementById("qbo-customers-panel");

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;
  if (hasQboPanel && new URLSearchParams(window.location.search).get("qbo") === "connected") {
    setQboHint("QuickBooks connected.");
  }

  loadListState();
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadSales();
  loadCustomers();
  if (hasQboPanel) {
    loadQboStatus().catch((err) => setQboHint(err?.message ? String(err.message) : "Unable to load QBO status."));
  }
} else {
  companyMeta.textContent = "Log in to view customers.";
  if (hasQboPanel) setQboStatus("Log in to view QBO sync.");
}
