const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
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

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let customersCache = [];
let qboCustomersCache = [];
let qboConnected = false;
let qboSearchTerm = "";
let qboLocalSearchTerm = "";

function setCompanyMeta(message) {
  if (!companyMeta) return;
  companyMeta.textContent = String(message || "");
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
      localTokens.forEach((token) => {
        if (qboTokens.has(token)) overlap += 1;
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
  `;
  qboCustomersTable.appendChild(header);

  if (!qboConnected) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>Connect QBO to load customers.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span>
    `;
    qboCustomersTable.appendChild(row);
    return;
  }

  if (!qboCustomersCache.length) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>Load QBO customers to view matches.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span>
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
    const haystack = [qbo.displayName, qbo.companyName, qbo.email, qbo.phone].filter(Boolean).join(" ");
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
      `<option value="">Select local customer...</option>`,
      ...suggestions.map(
        (entry) => `<option value="${entry.local.id}">${entry.local.company_name} (suggested)</option>`
      ),
      ...sortedLocals
        .filter((local) => !suggestedIds.has(local.id))
        .map((local) => `<option value="${local.id}">${local.company_name}</option>`),
    ];

    const disabledAttr = linkedLocal ? "disabled" : "";
    const linkCell = linkedLocal
      ? `<span>${linkedLocal.company_name}</span>`
      : `<span><select class="qbo-link-select">${options.join("")}</select></span>`;
    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.qboId = qbo.id || "";
    row.innerHTML = `
      <span>${qbo.displayName || qbo.companyName || `QBO #${qbo.id || "--"}`}</span>
      <span>${qbo.email || "--"}</span>
      <span>${qbo.phone || "--"}</span>
      <span>${suggestedLabel}</span>
      ${linkCell}
      <span>
        <input type="checkbox" class="qbo-update-name" ${disabledAttr} />
      </span>
      <span class="inline">
        <button class="ghost small" data-action="link-qbo" ${disabledAttr}>Link</button>
        <button class="ghost small" data-action="create-local" ${disabledAttr}>Create local</button>
      </span>
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
  `;
  qboLocalCustomersTable.appendChild(header);

  const term = normalizeMatchValue(qboLocalSearchTerm);
  const locals = customersCache.filter((local) => !local.qbo_customer_id).filter((local) => {
    if (!term) return true;
    const haystack = [local.company_name, local.email, local.phone, local.contact_name]
      .filter(Boolean)
      .join(" ");
    return normalizeMatchValue(haystack).includes(term);
  });

  if (!locals.length) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <span>All local customers are linked to QBO.</span>
      <span></span><span></span><span></span><span></span><span></span><span></span>
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
      `<option value="">Select QBO customer...</option>`,
      ...suggestions.map(
        (entry) => `<option value="${entry.qbo.id}">${entry.qbo.displayName || entry.qbo.companyName} (suggested)</option>`
      ),
      ...sortedQbo
        .filter((qbo) => !suggestedIds.has(qbo.id))
        .map((qbo) => `<option value="${qbo.id}">${qbo.displayName || qbo.companyName || `QBO #${qbo.id}`}</option>`),
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
        <select class="qbo-link-select" ${disabledAttr}>${options.join("")}</select>
      </span>
      <span>
        <input type="checkbox" class="qbo-update-name" ${disabledAttr} />
      </span>
      <span class="inline">
        <button class="ghost small" data-action="link-local" ${disabledAttr}>Link</button>
        <button class="ghost small" data-action="create-qbo" ${disabledAttr}>Create QBO</button>
      </span>
    `;
    qboLocalCustomersTable.appendChild(row);
  });
}

function renderQboTables() {
  renderQboCustomersTable();
  renderLocalQboTable();
}

async function loadLocalCustomers() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch customers");
    const data = await res.json();
    customersCache = data.customers || [];
    renderQboTables();
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to load customers.");
  }
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
    await loadLocalCustomers();
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
    await loadLocalCustomers();
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
    await loadLocalCustomers();
    if (qboConnected) {
      await loadQboCustomers().catch(() => null);
    }
    setQboHint(data.skipped ? "Customer already linked." : "QBO customer created.");
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to create QBO customer.");
  }
}

qboConnectBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;
  const redirect = "/qbo-customers.html?qbo=connected";
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

    await loadLocalCustomers();
    await loadQboCustomers().catch(() => null);
  } catch (err) {
    setQboHint(err?.message ? String(err.message) : "Unable to import QBO customers.");
  }
});

qboRefreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadQboStatus().catch((err) => setQboHint(err?.message ? String(err.message) : "Unable to refresh QBO status."));
  loadLocalCustomers().catch(() => null);
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

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  const session = window.RentSoft?.getSession?.();
  const companyName = session?.company?.name ? String(session.company.name) : null;
  setCompanyMeta(companyName ? `${companyName} (Company #${activeCompanyId})` : `Company #${activeCompanyId}`);
  if (new URLSearchParams(window.location.search).get("qbo") === "connected") {
    setQboHint("QuickBooks connected.");
  }
  loadLocalCustomers();
  loadQboStatus().catch((err) => setQboHint(err?.message ? String(err.message) : "Unable to load QBO status."));
} else {
  setCompanyMeta("Log in to view customers.");
  setQboStatus("Log in to view QBO sync.");
}
