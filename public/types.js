const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");
const newTypeBtn = document.getElementById("new-type");
const typesTable = document.getElementById("types-table");
const importInventoryBtn = document.getElementById("import-inventory");
const inventoryFileInput = document.getElementById("inventory-file");
const inventoryStatus = document.getElementById("inventory-status");
const searchInput = document.getElementById("search");
const viewTableBtn = document.getElementById("types-view-table");
const viewCardsBtn = document.getElementById("types-view-cards");
const typesCards = document.getElementById("types-cards");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let typesCache = [];
let typesWithCounts = [];
let sortField = "name";
let sortDir = "asc";
let searchTerm = "";

const LIST_STATE_KEY = "rentsoft.types.listState";
const ALLOWED_SORT_FIELDS = new Set(["name", "category", "daily_rate", "weekly_rate", "monthly_rate", "count"]);

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

const VIEW_KEY = "rentsoft.types.view";
let currentView = localStorage.getItem(VIEW_KEY) || "table";

function setView(nextView) {
  currentView = nextView === "cards" ? "cards" : "table";
  localStorage.setItem(VIEW_KEY, currentView);

  if (typesTable) typesTable.hidden = currentView !== "table";
  if (typesCards) typesCards.hidden = currentView !== "cards";

  viewTableBtn?.classList.toggle("active", currentView === "table");
  viewCardsBtn?.classList.toggle("active", currentView === "cards");

  render();
}

function formatMoney(v) {
  return v === null || v === undefined ? "--" : `$${Number(v).toFixed(2)}`;
}

function renderTypes(rows) {
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  typesTable.innerHTML = `
    <div class="table-row table-header">
      <span>Photo</span>
      <span class="sort ${sortField === "name" ? "active" : ""}" data-sort="name">Type ${indicator("name")}</span>
      <span class="sort ${sortField === "category" ? "active" : ""}" data-sort="category">Category ${indicator("category")}</span>
      <span class="sort ${sortField === "daily_rate" ? "active" : ""}" data-sort="daily_rate">Daily ${indicator("daily_rate")}</span>
      <span class="sort ${sortField === "weekly_rate" ? "active" : ""}" data-sort="weekly_rate">Weekly ${indicator("weekly_rate")}</span>
      <span class="sort ${sortField === "monthly_rate" ? "active" : ""}" data-sort="monthly_rate">Monthly ${indicator("monthly_rate")}</span>
      <span class="sort ${sortField === "count" ? "active" : ""}" data-sort="count">In stock ${indicator("count")}</span>
    </div>`;
  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = row.id;
    const thumb = row.image_url
      ? `<img class="thumb" src="${row.image_url}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="thumb placeholder">--</span>`;
    div.innerHTML = `
      <span class="thumb-cell">${thumb}</span>
      <span>${row.name}</span>
      <span>${row.category || "--"}</span>
      <span>${formatMoney(row.daily_rate)}</span>
      <span>${formatMoney(row.weekly_rate)}</span>
      <span>${formatMoney(row.monthly_rate)}</span>
      <span>${row.count}</span>
    `;
    typesTable.appendChild(div);
  });
}

function renderTypeCards(rows) {
  if (!typesCards) return;
  typesCards.replaceChildren();

  rows.forEach((row) => {
    const card = document.createElement("div");
    card.className = "type-card";
    card.dataset.id = row.id;

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "type-card-thumb";
    if (row.image_url) {
      const img = document.createElement("img");
      img.src = row.image_url;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      thumbWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "thumb placeholder";
      placeholder.textContent = "--";
      thumbWrap.appendChild(placeholder);
    }

    const body = document.createElement("div");
    body.className = "type-card-body";

    const topRow = document.createElement("div");
    topRow.className = "type-card-title-row";

    const title = document.createElement("div");
    title.className = "type-card-title";
    title.textContent = row.name || "--";

    const count = document.createElement("span");
    count.className = "mini-badge";
    count.textContent = String(row.count ?? 0);
    count.title = "In stock";

    topRow.appendChild(title);
    topRow.appendChild(count);

    const meta = document.createElement("div");
    meta.className = "type-card-meta";
    meta.textContent = row.category || "--";

    body.appendChild(topRow);
    body.appendChild(meta);

    card.appendChild(thumbWrap);
    card.appendChild(body);

    typesCards.appendChild(card);
  });
}

function applyFilters() {
  let rows = [...typesWithCounts];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((r) =>
      [r.name, r.category, r.description, r.terms]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }

  const dir = sortDir === "asc" ? 1 : -1;
  const norm = (v) => String(v || "").toLowerCase();
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : -Infinity;
  };
  const sortKey = (row) => {
    switch (sortField) {
      case "count":
        return num(row.count);
      case "daily_rate":
      case "weekly_rate":
      case "monthly_rate":
        return num(row[sortField]);
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

function render() {
  const rows = applyFilters();
  if (currentView === "cards") renderTypeCards(rows);
  else renderTypes(rows);
}

async function loadTypeStats() {
  if (!activeCompanyId) return;
  try {
    const [statsRes, typesRes] = await Promise.all([
      fetch(`/api/equipment-type-stats?companyId=${activeCompanyId}`),
      fetch(`/api/equipment-types?companyId=${activeCompanyId}`),
    ]);
    if (!statsRes.ok || !typesRes.ok) throw new Error("Unable to fetch types");
    const statsData = await statsRes.json();
    const typesData = await typesRes.json();
    typesCache = typesData.types || [];
    const countsById = new Map((statsData.stats || []).map((s) => [String(s.id), s.count]));
    typesWithCounts = typesCache.map((t) => ({
      ...t,
      count: countsById.get(String(t.id)) || 0,
    }));
    render();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}


importInventoryBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  inventoryFileInput?.click();
});

inventoryFileInput?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file || !activeCompanyId) return;
  if (inventoryStatus) inventoryStatus.textContent = "Importing inventory…";

  const body = new FormData();
  body.append("companyId", String(activeCompanyId));
  body.append("file", file);

  try {
    const res = await fetch("/api/inventory/import", { method: "POST", body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Import failed");
    }
    const data = await res.json();
    if (inventoryStatus) {
      inventoryStatus.textContent = `Import complete: types +${data.typesCreated || 0} (updated ${data.typesUpdated || 0}), equipment +${data.equipmentCreated || 0} (skipped ${data.equipmentSkipped || 0}).`;
    }
    await loadTypeStats();
  } catch (err) {
    if (inventoryStatus) inventoryStatus.textContent = err.message || "Import failed";
  } finally {
    if (inventoryFileInput) inventoryFileInput.value = "";
  }
});

newTypeBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  window.location.href = "equipment-type-form.html?returnTo=types.html";
});

typesTable.addEventListener("click", (e) => {
  const sort = e.target.closest?.(".sort")?.getAttribute?.("data-sort") ?? e.target.getAttribute?.("data-sort");
  if (sort) {
    e.preventDefault();
    if (sortField === sort) sortDir = sortDir === "asc" ? "desc" : "asc";
    else {
      sortField = sort;
      sortDir = "asc";
    }
    render();
    persistListState();
    return;
  }

  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row.dataset.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `equipment-type-form.html?id=${id}&returnTo=types.html`;
});

typesCards?.addEventListener("click", (e) => {
  const card = e.target.closest?.(".type-card");
  const id = card?.dataset?.id;
  if (!id || !activeCompanyId) return;
  window.location.href = `equipment-type-form.html?id=${id}&returnTo=types.html`;
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  render();
  persistListState();
});

viewTableBtn?.addEventListener("click", () => setView("table"));
viewCardsBtn?.addEventListener("click", () => setView("cards"));
setView(currentView);

// Init
if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;

  loadListState();
  if (searchInput) {
    if (searchInput.value && !searchTerm) searchTerm = searchInput.value;
    searchInput.value = searchTerm;
  }

  loadTypeStats();
} else {
  companyMeta.textContent = "Log in to view equipment types.";
}
