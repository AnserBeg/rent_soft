(() => {
  const summaryGrid = document.getElementById("dev-summary-grid");
  const summaryMeta = document.getElementById("dev-summary-meta");
  const companiesTable = document.getElementById("dev-companies-table");
  const companiesCount = document.getElementById("dev-companies-count");
  const searchInput = document.getElementById("dev-search");
  const selectedCount = document.getElementById("dev-selected-count");
  const deleteBtn = document.getElementById("dev-delete-selected");
  const refreshBtn = document.getElementById("dev-refresh");
  const logoutBtn = document.getElementById("dev-logout");

  let companies = [];
  let filtered = [];
  let selectedCompanyIds = new Set();
  let deleting = false;
  let selectAllCheckbox = null;

  function normalizeSearch(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString();
  }

  function renderSummary() {
    if (!summaryGrid) return;
    const totals = companies.reduce(
      (acc, row) => {
        acc.users += row.usersCount || 0;
        acc.types += row.typesCount || 0;
        acc.equipment += row.equipmentCount || 0;
        acc.customers += row.customersCount || 0;
        acc.orders += row.ordersCount || 0;
        return acc;
      },
      { users: 0, types: 0, equipment: 0, customers: 0, orders: 0 }
    );

    summaryGrid.innerHTML = `
      <div class="ar-metric"><div class="ar-metric-label">Companies</div><div class="ar-metric-value">${companies.length}</div></div>
      <div class="ar-metric"><div class="ar-metric-label">Users</div><div class="ar-metric-value">${totals.users}</div></div>
      <div class="ar-metric"><div class="ar-metric-label">Equipment Types</div><div class="ar-metric-value">${totals.types}</div></div>
      <div class="ar-metric"><div class="ar-metric-label">Equipment Units</div><div class="ar-metric-value">${totals.equipment}</div></div>
      <div class="ar-metric"><div class="ar-metric-label">Customers</div><div class="ar-metric-value">${totals.customers}</div></div>
      <div class="ar-metric"><div class="ar-metric-label">Rental Orders</div><div class="ar-metric-value">${totals.orders}</div></div>
    `;

    if (summaryMeta) {
      summaryMeta.textContent = `Last updated ${new Date().toLocaleString()}`;
    }
  }

  function companyLabel(row) {
    const name = String(row?.name || "").trim();
    if (name) return `${name} (#${row.id})`;
    return `Company #${row?.id ?? "--"}`;
  }

  function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    const visibleIds = filtered.map((row) => row.id).filter((id) => Number.isFinite(id) && id > 0);
    if (!visibleIds.length) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
      return;
    }
    const selectedVisible = visibleIds.filter((id) => selectedCompanyIds.has(id));
    if (!selectedVisible.length) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else if (selectedVisible.length === visibleIds.length) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }

  function updateSelectionUI() {
    if (selectedCount) {
      const count = selectedCompanyIds.size;
      selectedCount.textContent = `${count} selected`;
    }
    if (deleteBtn) {
      deleteBtn.disabled = deleting || selectedCompanyIds.size === 0;
    }
    updateSelectAllState();
  }

  function renderTable() {
    if (!companiesTable) return;
    companiesTable.innerHTML = `
      <div class="table-row table-header">
        <span class="table-checkbox">
          <input type="checkbox" id="dev-select-all" aria-label="Select all companies" />
        </span>
        <span>Company</span>
        <span>Email</span>
        <span>Website</span>
        <span>Users</span>
        <span>Types</span>
        <span>Equipment</span>
        <span>Customers</span>
        <span>Orders</span>
        <span>Created</span>
      </div>
    `;

    filtered.forEach((row) => {
      const div = document.createElement("div");
      div.className = "table-row";
      div.dataset.companyId = String(row.id || "");
      const isChecked = selectedCompanyIds.has(row.id);
      div.innerHTML = `
        <span class="table-checkbox">
          <input type="checkbox" class="dev-select-company" data-company-id="${row.id}" ${isChecked ? "checked" : ""} aria-label="Select ${companyLabel(row)}" />
        </span>
        <span>${row.name || "--"}</span>
        <span>${row.email || "--"}</span>
        <span>${row.website || "--"}</span>
        <span>${row.usersCount ?? 0}</span>
        <span>${row.typesCount ?? 0}</span>
        <span>${row.equipmentCount ?? 0}</span>
        <span>${row.customersCount ?? 0}</span>
        <span>${row.ordersCount ?? 0}</span>
        <span>${formatDate(row.createdAt)}</span>
      `;
      companiesTable.appendChild(div);
    });

    selectAllCheckbox = companiesTable.querySelector("#dev-select-all");
    updateSelectionUI();

    if (companiesCount) {
      const total = filtered.length;
      companiesCount.textContent = total === companies.length ? `Companies (${total})` : `Companies (${total} of ${companies.length})`;
    }
  }

  function applySearch() {
    const query = normalizeSearch(searchInput?.value || "");
    if (!query) {
      filtered = [...companies];
      renderTable();
      return;
    }
    filtered = companies.filter((row) => {
      const haystack = normalizeSearch(`${row.name || ""} ${row.email || ""} ${row.website || ""} ${row.phone || ""}`);
      return haystack.includes(query);
    });
    renderTable();
  }

  async function deleteSelectedCompanies() {
    if (!window.RentSoftDev || deleting) return;
    const selected = companies.filter((row) => selectedCompanyIds.has(row.id));
    if (!selected.length) {
      if (summaryMeta) summaryMeta.textContent = "Select at least one company to delete.";
      return;
    }
    const active = selected.filter((row) => Number(row.ordersCount || 0) > 1);
    const label = selected.length === 1 ? companyLabel(selected[0]) : `${selected.length} companies`;
    const firstConfirm = window.confirm(
      `Delete ${label}? This will permanently remove the company account and all associated data.`
    );
    if (!firstConfirm) return;
    if (active.length) {
      const preview = active
        .slice(0, 3)
        .map((row) => companyLabel(row))
        .join(", ");
      const extra = active.length > 3 ? ` and ${active.length - 3} more` : "";
      const secondConfirm = window.confirm(
        `Warning: ${active.length} selected ${
          active.length === 1 ? "company has" : "companies have"
        } more than 1 rental order and are considered active (${preview}${extra}). This is your second confirmation. Delete anyway?`
      );
      if (!secondConfirm) return;
    }

    deleting = true;
    const originalLabel = deleteBtn?.textContent || "Delete selected";
    if (deleteBtn) deleteBtn.textContent = "Deleting...";
    updateSelectionUI();

    try {
      const res = await window.RentSoftDev.devFetch("/api/dev/companies/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: selected.map((row) => row.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to delete companies.");
      const deletedIds = Array.isArray(data.deletedIds) ? data.deletedIds.map(Number) : [];
      const deletedSet = new Set(deletedIds);
      companies = companies.filter((row) => !deletedSet.has(row.id));
      filtered = filtered.filter((row) => !deletedSet.has(row.id));
      deletedIds.forEach((id) => selectedCompanyIds.delete(id));
      renderSummary();
      renderTable();
      if (summaryMeta) {
        const count = deletedIds.length || selected.length;
        summaryMeta.textContent = `Deleted ${count} ${count === 1 ? "company" : "companies"}.`;
      }
    } catch (err) {
      if (summaryMeta) {
        summaryMeta.textContent = err?.message ? String(err.message) : "Unable to delete companies.";
      }
    } finally {
      deleting = false;
      if (deleteBtn) deleteBtn.textContent = originalLabel;
      updateSelectionUI();
    }
  }

  async function loadCompanies() {
    if (!window.RentSoftDev) return;
    const ok = await window.RentSoftDev.requireDevAuth();
    if (!ok) return;

    try {
      const res = await window.RentSoftDev.devFetch("/api/dev/companies");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to fetch companies.");
      companies = Array.isArray(data.companies) ? data.companies : [];
      filtered = [...companies];
      const validIds = new Set(companies.map((row) => row.id).filter((id) => Number.isFinite(id) && id > 0));
      selectedCompanyIds = new Set([...selectedCompanyIds].filter((id) => validIds.has(id)));
      renderSummary();
      renderTable();
    } catch (err) {
      if (summaryMeta) {
        summaryMeta.textContent = err?.message ? String(err.message) : "Unable to load companies.";
      }
    }
  }

  refreshBtn?.addEventListener("click", () => loadCompanies());
  searchInput?.addEventListener("input", () => applySearch());
  deleteBtn?.addEventListener("click", () => deleteSelectedCompanies());
  companiesTable?.addEventListener("change", (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === "dev-select-all") {
      if (target.checked) {
        filtered.forEach((row) => {
          if (Number.isFinite(row.id) && row.id > 0) selectedCompanyIds.add(row.id);
        });
      } else {
        filtered.forEach((row) => selectedCompanyIds.delete(row.id));
      }
      renderTable();
      return;
    }
    if (target.classList.contains("dev-select-company")) {
      const companyId = Number(target.dataset.companyId);
      if (!Number.isFinite(companyId) || companyId <= 0) return;
      if (target.checked) {
        selectedCompanyIds.add(companyId);
      } else {
        selectedCompanyIds.delete(companyId);
      }
      updateSelectionUI();
    }
  });
  companiesTable?.addEventListener("click", async (e) => {
    if (e.target?.closest?.("input") || e.target?.closest?.("button")) return;
    const row = e.target?.closest?.(".table-row");
    if (!row || row.classList.contains("table-header")) return;
    const companyId = Number(row.dataset.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) return;
    try {
      const res = await window.RentSoftDev.devFetch("/api/dev/impersonate-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to open company.");
      if (data.url) window.open(data.url, "_blank", "noopener");
    } catch (err) {
      if (summaryMeta) {
        summaryMeta.textContent = err?.message ? String(err.message) : "Unable to open company.";
      }
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    if (!window.RentSoftDev) return;
    try {
      await window.RentSoftDev.devFetch("/api/dev/logout", { method: "POST" });
    } catch {
      // ignore
    }
    window.RentSoftDev.clearDevToken();
    window.location.href = "dev-login.html";
  });

  loadCompanies();
})();
