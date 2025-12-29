const companyMeta = document.getElementById("company-meta");
const partsTable = document.getElementById("parts-table");
const refreshBtn = document.getElementById("refresh");
const newPartBtn = document.getElementById("new-part");
const searchInput = document.getElementById("search");
const partModal = document.getElementById("part-modal");
const partModalTitle = document.getElementById("part-modal-title");
const closePartModalBtn = document.getElementById("close-part-modal");
const partForm = document.getElementById("part-form");
const partModalStatus = document.getElementById("part-modal-status");
const deletePartBtn = document.getElementById("delete-part");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let partsCache = [];
let searchTerm = "";
let editingPartKey = null;

function keyForParts(companyId) {
  return `rentSoft.parts.${companyId}`;
}

function safeJsonParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizePartNumber(value) {
  return String(value || "").trim();
}

function normalizePartKey(value) {
  return normalizePartNumber(value).toLowerCase();
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function loadPartsFromStorage() {
  if (!activeCompanyId) return [];
  const raw = localStorage.getItem(keyForParts(activeCompanyId));
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

function savePartsToStorage(parts) {
  if (!activeCompanyId) return;
  localStorage.setItem(keyForParts(activeCompanyId), JSON.stringify(parts || []));
}

function renderParts(rows) {
  if (!partsTable) return;
  partsTable.innerHTML = `
    <div class="table-row table-header">
      <span>Part #</span>
      <span>Description</span>
      <span>UOM</span>
      <span>Unit cost</span>
      <span>Updated</span>
    </div>`;

  rows.forEach((part) => {
    const updatedAt = part?.updatedAt ? new Date(part.updatedAt) : null;
    const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
      ? updatedAt.toLocaleDateString()
      : "--";

    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.key = normalizePartKey(part.partNumber);
    row.innerHTML = `
      <span>${part.partNumber || "--"}</span>
      <span>${part.description || "--"}</span>
      <span>${part.uom || "--"}</span>
      <span>${formatMoney(part.unitCost)}</span>
      <span>${updatedLabel}</span>
    `;
    partsTable.appendChild(row);
  });
}

function applyFilters() {
  let rows = [...partsCache];
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    rows = rows.filter((part) => {
      return [part.partNumber, part.description, part.uom]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }
  rows.sort((a, b) => String(a.partNumber || "").localeCompare(String(b.partNumber || "")));
  return rows;
}

function loadParts() {
  partsCache = loadPartsFromStorage();
  renderParts(applyFilters());
}

function openPartModal(part) {
  if (!partModal || !partForm) return;
  partModal.classList.add("show");
  partModalStatus.textContent = "";

  if (part) {
    editingPartKey = normalizePartKey(part.partNumber);
    partModalTitle.textContent = "Edit part";
    partForm.partNumber.value = part.partNumber || "";
    partForm.description.value = part.description || "";
    partForm.uom.value = part.uom || "";
    partForm.unitCost.value = Number.isFinite(Number(part.unitCost)) ? Number(part.unitCost) : "";
    deletePartBtn.style.display = "inline-flex";
  } else {
    editingPartKey = null;
    partModalTitle.textContent = "Add part";
    partForm.reset();
    deletePartBtn.style.display = "none";
  }
}

function closePartModal() {
  if (!partModal) return;
  partModal.classList.remove("show");
}

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadParts();
});

newPartBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  openPartModal();
});

searchInput?.addEventListener("input", (e) => {
  searchTerm = String(e.target.value || "");
  renderParts(applyFilters());
});

partsTable?.addEventListener("click", (e) => {
  const row = e.target.closest(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const key = row.dataset.key;
  if (!key) return;
  const part = partsCache.find((p) => normalizePartKey(p.partNumber) === key);
  if (part) openPartModal(part);
});

closePartModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closePartModal();
});

partModal?.addEventListener("click", (e) => {
  if (e.target === partModal) closePartModal();
});

deletePartBtn?.addEventListener("click", () => {
  if (!editingPartKey) return;
  partsCache = partsCache.filter((part) => normalizePartKey(part.partNumber) !== editingPartKey);
  savePartsToStorage(partsCache);
  closePartModal();
  loadParts();
});

partForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!activeCompanyId) return;

  const partNumber = normalizePartNumber(partForm.partNumber.value);
  const description = String(partForm.description.value || "").trim();
  const uom = String(partForm.uom.value || "").trim();
  const unitCost = Number(partForm.unitCost.value || 0);

  if (!partNumber) {
    partModalStatus.textContent = "Part number is required.";
    return;
  }

  const next = [...partsCache];
  const key = normalizePartKey(partNumber);
  const duplicateIndex = next.findIndex((p) => normalizePartKey(p.partNumber) === key);
  if (duplicateIndex >= 0 && (!editingPartKey || editingPartKey !== key)) {
    partModalStatus.textContent = "Part number already exists.";
    return;
  }

  const existingIndex = next.findIndex((p) => normalizePartKey(p.partNumber) === (editingPartKey || key));
  const now = new Date().toISOString();

  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      partNumber,
      description,
      uom,
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      updatedAt: now,
    };
  } else {
    next.push({
      partNumber,
      description,
      uom,
      unitCost: Number.isFinite(unitCost) ? unitCost : 0,
      updatedAt: now,
      createdAt: now,
    });
  }

  partsCache = next;
  savePartsToStorage(partsCache);
  closePartModal();
  loadParts();
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = `Using company #${activeCompanyId}`;
  loadParts();
} else {
  companyMeta.textContent = "Log in to view parts.";
}
