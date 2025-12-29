const companyMeta = document.getElementById("company-meta");
const refreshBtn = document.getElementById("refresh");
const customersTable = document.getElementById("customers-table");
const newCustomerBtn = document.getElementById("new-customer");
const importCustomersBtn = document.getElementById("import-customers");
const importFileInput = document.getElementById("import-file");
const importStatus = document.getElementById("import-status");
const searchInput = document.getElementById("search");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let customersCache = [];
let salesCache = [];
let sortField = "company_name";
let sortDir = "asc";
let searchTerm = "";

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
      <span></span>
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
      <span></span>
    `;
    customersTable.appendChild(div);
  });
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

async function loadCustomers() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/customers?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch customers");
    const data = await res.json();
    customersCache = data.customers || [];
    renderCustomers(applyFilters());
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

refreshBtn.addEventListener("click", (e) => {
  e.preventDefault();
  loadSales();
  loadCustomers();
});

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
});

// Init
if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;
  loadSales();
  loadCustomers();
} else {
  companyMeta.textContent = "Log in to view customers.";
}
