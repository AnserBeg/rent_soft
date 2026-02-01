const companyMeta = document.getElementById("company-meta");
const vendorsTable = document.getElementById("vendors-table");
const newVendorBtn = document.getElementById("new-vendor");
const searchInput = document.getElementById("search");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let vendorsCache = [];
let sortField = "company_name";
let sortDir = "asc";
let searchTerm = "";

const LIST_STATE_KEY = "rentsoft.vendors.listState";
const ALLOWED_SORT_FIELDS = new Set(["company_name", "contact_name", "email", "phone", "city", "region", "country", "postal_code"]);

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


function renderVendors(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  vendorsTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "company_name" ? "active" : ""}" data-sort="company_name">Vendor ${indicator("company_name")}</span>
      <span class="sort ${sortField === "contact_name" ? "active" : ""}" data-sort="contact_name">Contact ${indicator("contact_name")}</span>
      <span class="sort ${sortField === "email" ? "active" : ""}" data-sort="email">Email ${indicator("email")}</span>
      <span class="sort ${sortField === "phone" ? "active" : ""}" data-sort="phone">Phone ${indicator("phone")}</span>
      <span class="sort ${sortField === "city" ? "active" : ""}" data-sort="city">City ${indicator("city")}</span>
      <span class="sort ${sortField === "region" ? "active" : ""}" data-sort="region">Region ${indicator("region")}</span>
      <span class="sort ${sortField === "country" ? "active" : ""}" data-sort="country">Country ${indicator("country")}</span>
      <span class="sort ${sortField === "postal_code" ? "active" : ""}" data-sort="postal_code">Postal ${indicator("postal_code")}</span>
    </div>`;
  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    div.innerHTML = `
      <span>${row.company_name}</span>
      <span>${row.contact_name || "--"}</span>
      <span>${row.email || "--"}</span>
      <span>${row.phone || "--"}</span>
      <span>${row.city || "--"}</span>
      <span>${row.region || "--"}</span>
      <span>${row.country || "--"}</span>
      <span>${row.postal_code || "--"}</span>
    `;
    vendorsTable.appendChild(div);
  });
}

function applyFilters() {
  let rows = [...vendorsCache];

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) => {
      return [
        r.company_name,
        r.contact_name,
        r.email,
        r.phone,
        r.city,
        r.region,
        r.country,
        r.postal_code,
        r.notes,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  rows.sort((a, b) => {
    const av = norm(a[sortField]);
    const bv = norm(b[sortField]);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return rows;
}

async function loadVendors() {
  if (!activeCompanyId) return;
  try {
    const res = await fetch(`/api/vendors?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch vendors");
    const data = await res.json();
    vendorsCache = data.vendors || [];
    renderVendors(applyFilters());
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}


newVendorBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "vendors-form.html";
});

vendorsTable.addEventListener("click", (e) => {
  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = "asc";
    }
    renderVendors(applyFilters());
    persistListState();
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `vendors-form.html?id=${id}`;
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderVendors(applyFilters());
  persistListState();
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;

  loadListState();
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadVendors();
} else {
  companyMeta.textContent = "Log in to view vendors.";
}
