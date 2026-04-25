const companyMeta = document.getElementById("company-meta");
const unitMeta = document.getElementById("unit-meta");
const workOrderTitle = document.getElementById("work-order-title");
const workOrderNumber = document.getElementById("work-order-number");
const workSummaryInput = document.getElementById("work-summary");
const workIssuesInput = document.getElementById("work-issues");
const workDateInput = document.getElementById("work-date");
const createdDateInput = document.getElementById("created-date");
const unitSelect = document.getElementById("unit-select");
const unitSearchInput = document.getElementById("unit-search-input");
const unitSuggestions = document.getElementById("unit-suggestions");
const unitSelectedList = document.getElementById("unit-selected");
const orderStatusInput = document.getElementById("order-status");
const serviceStatusSelect = document.getElementById("service-status");
const returnInspectionToggle = document.getElementById("return-inspection");
const serviceHint = document.getElementById("service-hint");

const rentalOrderSelect = document.getElementById("rental-order-id");
const customerSelect = document.getElementById("customer-id");
const customerNameInput = document.getElementById("customer-name");
const categoryInput = document.getElementById("work-category");
const contactInput = document.getElementById("work-contact");
const siteNameInput = document.getElementById("site-name");
const siteAddressInput = document.getElementById("site-address");
const siteAccessCodeInput = document.getElementById("site-access-code");
const dueDateInput = document.getElementById("due-date");
const isRecurringToggle = document.getElementById("is-recurring");
const recurrenceIntervalInput = document.getElementById("recurrence-interval");
const recurrenceFrequencySelect = document.getElementById("recurrence-frequency");
const recurrenceHint = document.getElementById("recurrence-hint");
const addPartLineBtn = document.getElementById("add-part-line");
const addLaborLineBtn = document.getElementById("add-labor-line");
const partsLines = document.getElementById("parts-lines");
const laborLines = document.getElementById("labor-lines");
const partsCatalog = document.getElementById("parts-catalog");
const partsTotalEl = document.getElementById("parts-total");
const laborTotalEl = document.getElementById("labor-total");
const grandTotalEl = document.getElementById("grand-total");
const saveStatus = document.getElementById("save-status");
const saveBtn = document.getElementById("save-work-order");
const deleteBtn = document.getElementById("delete-work-order");
const markCompleteBtn = document.getElementById("mark-complete");
const markClosedBtn = document.getElementById("mark-closed");
const markOpenBtn = document.getElementById("mark-open");
const workOrderSourceHint = document.getElementById("work-order-source-hint");

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const workOrderId = params.get("id");
const initialUnitId = params.get("unitId");
const initialSummary = params.get("summary");
const initialSource = params.get("source");
const initialSourceMeta = params.get("sourceMeta");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let partsCache = [];
let equipmentCache = [];
let workOrdersCache = [];
let rentalOrdersCache = [];
let customersCache = [];
let editingWorkOrder = null;
let pendingUnitId = initialUnitId ? String(initialUnitId) : null;
let pendingSummary = initialSummary ? String(initialSummary) : null;
let pendingSource = initialSource ? String(initialSource) : null;
let pendingSourceMeta = initialSourceMeta ? String(initialSourceMeta) : null;

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

function normalizeSourceMeta(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  const parsed = safeJsonParse(value, null);
  if (!parsed || typeof parsed !== "object") return null;
  if (!Object.keys(parsed).length) return null;
  return parsed;
}

function effectiveSourceMeta() {
  return normalizeSourceMeta(editingWorkOrder?.sourceMeta) || normalizeSourceMeta(pendingSourceMeta) || null;
}

function renderSourceMetaHint() {
  const meta = effectiveSourceMeta();
  if (!workOrderSourceHint) return;
  if (!meta) {
    workOrderSourceHint.textContent = "";
    return;
  }

  const equipmentId = meta.equipmentId || meta.unitId || null;
  const parts = [];
  if (equipmentId) parts.push(`Unit #${equipmentId}`);
  workOrderSourceHint.textContent = parts.join(" · ");

}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "$0.00";
  return `$${amount.toFixed(2)}`;
}

function normalizePartNumber(value) {
  return String(value || "").trim();
}

function normalizePartKey(value) {
  return normalizePartNumber(value).toLowerCase();
}

function loadPartsCatalog() {
  if (!activeCompanyId) return [];
  const raw = localStorage.getItem(keyForParts(activeCompanyId));
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

function savePartsCatalog(parts) {
  if (!activeCompanyId) return;
  localStorage.setItem(keyForParts(activeCompanyId), JSON.stringify(parts || []));
}

async function fetchWorkOrders() {
  if (!activeCompanyId) return [];
  const res = await fetch(`/api/work-orders?companyId=${encodeURIComponent(activeCompanyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load work orders.");
  const orders = Array.isArray(data.workOrders) ? data.workOrders : [];
  workOrdersCache = orders;
  return orders;
}

async function fetchWorkOrderById(id) {
  if (!activeCompanyId || !id) return null;
  const res = await fetch(`/api/work-orders/${encodeURIComponent(id)}?companyId=${encodeURIComponent(activeCompanyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load work order.");
  return data.workOrder || null;
}

function normalizeUnitIds(order) {
  if (!order) return [];
  if (Array.isArray(order.unitIds)) {
    return order.unitIds.map((id) => String(id)).filter(Boolean);
  }
  if (order.unitId) return [String(order.unitId)];
  return [];
}

function normalizeUnitLabels(order) {
  if (!order) return [];
  if (Array.isArray(order.unitLabels)) {
    return order.unitLabels.map((label) => String(label)).filter(Boolean);
  }
  if (order.unitLabel) return [String(order.unitLabel)];
  return [];
}

function equipmentLabel(item) {
  if (!item) return "";
  const model = String(item.model_name || item.modelName || "").trim();
  const serial = String(item.serial_number || item.serialNumber || "").trim();
  if (model && serial) return `${model} - ${serial}`;
  return model || serial || (item.id ? `Unit ${item.id}` : "Unit");
}

function equipmentModelName(item) {
  return String(item?.model_name || item?.modelName || "").trim();
}

function equipmentSerial(item) {
  return String(item?.serial_number || item?.serialNumber || item?.serial || item?.id || "").trim();
}

function sortEquipmentByModel(items) {
  return [...(items || [])].sort((a, b) => {
    const am = equipmentModelName(a).toLowerCase();
    const bm = equipmentModelName(b).toLowerCase();
    if (am < bm) return -1;
    if (am > bm) return 1;
    const as = equipmentSerial(a).toLowerCase();
    const bs = equipmentSerial(b).toLowerCase();
    if (as < bs) return -1;
    if (as > bs) return 1;
    return 0;
  });
}

function equipmentSearchKey(item) {
  return `${equipmentLabel(item)} ${equipmentModelName(item)} ${equipmentSerial(item)}`.toLowerCase();
}

function dedupeStringList(values) {
  return Array.from(new Set((values || []).map((value) => String(value)).filter(Boolean)));
}

function getSelectedUnitIds() {
  if (!unitSelect) return [];
  return dedupeStringList(Array.from(unitSelect.selectedOptions || []).map((opt) => opt.value));
}

function getSelectedUnitLabels() {
  if (!unitSelect) return [];
  return dedupeStringList(Array.from(unitSelect.selectedOptions || []).map((opt) => opt.textContent || ""));
}

function labelForUnitId(unitId) {
  const match = equipmentCache.find((item) => String(item.id) === String(unitId));
  return equipmentLabel(match) || `Unit ${unitId}`;
}

function setSelectedUnitIds(unitIds) {
  if (!unitSelect) return;
  const ids = dedupeStringList(unitIds);
  Array.from(unitSelect.options).forEach((opt) => {
    opt.selected = ids.includes(String(opt.value));
  });
  if (!ids.length) {
    renderSelectedUnits();
    return;
  }
  const labels = ids.map((id) => labelForUnitId(id));
  applyUnitSelectionToSelect(ids, labels);
  renderSelectedUnits();
}

function renderSelectedUnits() {
  if (!unitSelectedList) return;
  unitSelectedList.replaceChildren();
  const selectedIds = getSelectedUnitIds();
  if (!selectedIds.length) {
    const empty = document.createElement("span");
    empty.className = "hint";
    empty.textContent = "No units selected.";
    unitSelectedList.appendChild(empty);
    return;
  }
  selectedIds.forEach((unitId) => {
    const pill = document.createElement("span");
    pill.className = "selection-pill";
    pill.dataset.unitId = String(unitId);
    const label = labelForUnitId(unitId);
    pill.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <button type="button" data-remove-unit="${escapeHtml(String(unitId))}" aria-label="Remove unit">×</button>
    `;
    unitSelectedList.appendChild(pill);
  });
}

function hideUnitSuggestions() {
  if (!unitSuggestions || !unitSearchInput) return;
  unitSuggestions.hidden = true;
  unitSuggestions.replaceChildren();
  unitSearchInput.setAttribute("aria-expanded", "false");
}

function renderUnitSuggestions({ term = "", showAll = false } = {}) {
  if (!unitSuggestions || !unitSearchInput) return;
  const query = String(term || "").trim().toLowerCase();
  if (!query && !showAll) {
    hideUnitSuggestions();
    return;
  }

  const available = sortEquipmentByModel(equipmentCache);
  const filtered = query
    ? available.filter((item) => equipmentSearchKey(item).includes(query))
    : available;

  unitSuggestions.replaceChildren();
  const selectedIds = new Set(getSelectedUnitIds());

  if (!available.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No units found.";
    unitSuggestions.appendChild(empty);
  } else if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "No matching units.";
    unitSuggestions.appendChild(empty);
  } else {
    filtered.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.unitId = String(item.id);
      const label = equipmentLabel(item);
      if (selectedIds.has(String(item.id))) {
        btn.disabled = true;
      }
      btn.innerHTML = `
        <div class="rs-autocomplete-primary">${escapeHtml(label)}</div>
        <div class="rs-autocomplete-secondary">${selectedIds.has(String(item.id)) ? "Selected" : "Click to add"}</div>
      `;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        addUnitSelection(item.id);
      });
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        addUnitSelection(item.id);
      });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        addUnitSelection(item.id);
      });
      unitSuggestions.appendChild(btn);
    });
  }

  unitSuggestions.hidden = false;
  unitSearchInput.setAttribute("aria-expanded", "true");
}

function addUnitSelection(unitId) {
  if (!unitId) return;
  const ids = new Set(getSelectedUnitIds());
  ids.add(String(unitId));
  setSelectedUnitIds(Array.from(ids));
  updateServiceHint();
  if (unitSearchInput) {
    unitSearchInput.value = "";
    renderUnitSuggestions({ term: "", showAll: true });
    unitSearchInput.focus();
  }
}

function ensureUnitOption(unitId, label) {
  if (!unitSelect || !unitId) return null;
  const idValue = String(unitId);
  let option = Array.from(unitSelect.options).find((opt) => String(opt.value) === idValue);
  if (!option) {
    option = document.createElement("option");
    option.value = idValue;
    option.textContent = label || `Unit ${idValue}`;
    unitSelect.appendChild(option);
  } else if (label && !option.textContent) {
    option.textContent = label;
  }
  option.selected = true;
  return option;
}

function applyUnitSelectionToSelect(unitIds, unitLabels) {
  if (!unitSelect) return;
  const ids = dedupeStringList(unitIds);
  if (!ids.length) return;
  const labels = Array.isArray(unitLabels) ? unitLabels.map((label) => String(label || "")) : [];
  ids.forEach((id, index) => {
    ensureUnitOption(id, labels[index]);
  });
  Array.from(unitSelect.options).forEach((opt) => {
    if (ids.includes(String(opt.value))) opt.selected = true;
  });
  renderSelectedUnits();
}

function getOutOfServiceMap(excludeId = null) {
  const orders = Array.isArray(workOrdersCache) ? workOrdersCache : [];
  const map = new Map();
  orders.forEach((order) => {
    const unitIds = normalizeUnitIds(order);
    if (!unitIds.length) return;
    if (excludeId && String(order.id) === String(excludeId)) return;
    if (order.serviceStatus === "out_of_service" && order.orderStatus !== "closed") {
      unitIds.forEach((unitId) => {
        map.set(String(unitId), order);
      });
    }
  });
  return map;
}

function updateTotals() {
  const parts = collectParts();
  const labor = collectLabor();
  const partsTotal = parts.reduce((sum, item) => sum + Number(item.lineAmount || 0), 0);
  const laborHours = labor.reduce((sum, item) => sum + Number(item.hours || 0), 0);

  if (partsTotalEl) partsTotalEl.textContent = formatMoney(partsTotal);
  if (laborTotalEl) laborTotalEl.textContent = laborHours ? `${laborHours} hrs` : "0";
  if (grandTotalEl) grandTotalEl.textContent = formatMoney(partsTotal);
}

function updateServiceHint() {
  if (!serviceHint) return;
  const orderStatus = orderStatusInput?.value || "open";
  const serviceStatus = serviceStatusSelect?.value || "in_service";
  const outOfServiceMap = getOutOfServiceMap(editingWorkOrder?.id || null);
  const selectedUnitIds = getSelectedUnitIds();
  const conflicts = selectedUnitIds
    .map((unitId) => outOfServiceMap.get(String(unitId)))
    .filter(Boolean);

  if (serviceStatus === "out_of_service" && orderStatus !== "closed") {
    const unitLabel = selectedUnitIds.length === 1 ? "this unit" : "these units";
    serviceHint.textContent = `Out of service makes ${unitLabel} unavailable until the work order is closed.`;
    return;
  }

  if (conflicts.length) {
    const numbers = dedupeStringList(
      conflicts.map((order) => order?.number || "another work order")
    );
    const prefix = selectedUnitIds.length === 1 ? "This unit is" : "Some selected units are";
    serviceHint.textContent = `${prefix} already out of service on ${numbers.join(", ")}.`;
    return;
  }

  serviceHint.textContent = "";
}

function syncStatusActions() {
  if (!orderStatusInput || !markClosedBtn || !markOpenBtn || !markCompleteBtn) return;
  const status = orderStatusInput.value || "open";
  const isClosed = status === "closed";
  const isCompleted = status === "completed";
  markCompleteBtn.style.display = status === "open" ? "inline-flex" : "none";
  markClosedBtn.style.display = isCompleted ? "inline-flex" : "none";
  markOpenBtn.style.display = status !== "open" ? "inline-flex" : "none";
}

function renderPartsCatalogOptions() {
  if (!partsCatalog) return;
  partsCatalog.replaceChildren();
  partsCache.forEach((part) => {
    const option = document.createElement("option");
    const number = part.partNumber || "";
    const desc = part.description ? ` - ${part.description}` : "";
    const cost = Number.isFinite(Number(part.unitCost)) ? ` ($${Number(part.unitCost).toFixed(2)})` : "";
    option.value = number;
    option.label = `${number}${desc}${cost}`.trim();
    partsCatalog.appendChild(option);
  });
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function applyPrefillToForm() {
  if (workOrderId) return;
  if (
    workSummaryInput
    && pendingSummary
    && pendingSource !== "dispatch"
    && !String(workSummaryInput.value || "").trim()
  ) {
    workSummaryInput.value = pendingSummary;
    autoResizeTextarea(workSummaryInput);
  }
}

function setCreatedDateFromWorkOrder(order) {
  if (!createdDateInput) return;
  const iso = order?.createdAt ? String(order.createdAt) : "";
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  createdDateInput.value = match ? match[1] : "";
}

function rentalOrderLabel(order) {
  if (!order) return "";
  const number = order.ro_number || order.quote_number || order.external_contract_number || "";
  const customer = order.customer_name || "";
  const status = order.status ? ` (${order.status})` : "";
  const bits = [number, customer].filter(Boolean).join(" \u2014 ");
  return `${bits}${status}`.trim() || `Order #${order.id}`;
}

function customerLabel(c) {
  if (!c) return "";
  const name = c.company_name || c.companyName || "";
  const contact = c.contact_name || c.contactName || "";
  return contact ? `${name} \u2014 ${contact}` : name;
}

function getSelectedRentalOrder() {
  const id = rentalOrderSelect?.value ? Number(rentalOrderSelect.value) : null;
  if (!Number.isFinite(id)) return null;
  return rentalOrdersCache.find((o) => Number(o.id) === id) || null;
}

function getSelectedCustomer() {
  const id = customerSelect?.value ? Number(customerSelect.value) : null;
  if (!Number.isFinite(id)) return null;
  return customersCache.find((c) => Number(c.id) === id) || null;
}

function syncRecurrenceControls() {
  const enabled = isRecurringToggle?.checked === true;
  if (recurrenceIntervalInput) recurrenceIntervalInput.disabled = !enabled;
  if (recurrenceFrequencySelect) recurrenceFrequencySelect.disabled = !enabled;
  if (recurrenceHint) {
    if (!enabled) {
      recurrenceHint.textContent = "";
    } else {
      const interval = Number(recurrenceIntervalInput?.value || 1);
      const freq = String(recurrenceFrequencySelect?.value || "").trim();
      const intervalLabel = Number.isFinite(interval) && interval > 0 ? interval : 1;
      const freqLabel = freq || "days";
      recurrenceHint.textContent = `Next due date will be ${intervalLabel} ${freqLabel} after the due date.`;
    }
  }
}

async function loadCustomers() {
  if (!activeCompanyId || !customerSelect) return;
  customerSelect.disabled = true;
  try {
    const res = await fetch(`/api/customers?companyId=${encodeURIComponent(String(activeCompanyId))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load customers.");
    customersCache = Array.isArray(data.customers) ? data.customers : [];
    customerSelect.innerHTML = `<option value="">(None)</option>`;
    customersCache.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = customerLabel(c) || `Customer #${c.id}`;
      customerSelect.appendChild(opt);
    });
    if (editingWorkOrder?.customerId) {
      customerSelect.value = String(editingWorkOrder.customerId);
    }
  } catch {
    // ignore
  } finally {
    customerSelect.disabled = false;
  }
}

async function loadRentalOrders() {
  if (!activeCompanyId || !rentalOrderSelect) return;
  rentalOrderSelect.disabled = true;
  try {
    const res = await fetch(`/api/rental-orders?companyId=${encodeURIComponent(String(activeCompanyId))}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load rental orders.");
    rentalOrdersCache = Array.isArray(data.orders) ? data.orders : [];
    rentalOrderSelect.innerHTML = `<option value="">(None)</option>`;
    rentalOrdersCache.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = rentalOrderLabel(o);
      rentalOrderSelect.appendChild(opt);
    });
    if (editingWorkOrder?.rentalOrderId) {
      rentalOrderSelect.value = String(editingWorkOrder.rentalOrderId);
    }
  } catch {
    // ignore
  } finally {
    rentalOrderSelect.disabled = false;
  }
}

function buildPartRow(data = {}) {
  const row = document.createElement("div");
  row.className = "workorder-line-grid workorder-line-row";
  row.innerHTML = `
    <input class="part-number" list="parts-catalog" placeholder="Part #" />
    <input class="part-desc" placeholder="Part description" />
    <input class="part-uom" placeholder="UOM" />
    <input class="part-cost" type="number" min="0" step="0.01" placeholder="Unit cost" />
    <input class="part-qty" type="number" min="0" step="0.01" placeholder="Qty" />
    <input class="part-amount" type="text" readonly />
    <button class="ghost small danger" type="button">Remove</button>
  `;

  const partNumber = row.querySelector(".part-number");
  const desc = row.querySelector(".part-desc");
  const uom = row.querySelector(".part-uom");
  const cost = row.querySelector(".part-cost");
  const qty = row.querySelector(".part-qty");
  const amount = row.querySelector(".part-amount");
  const removeBtn = row.querySelector("button");

  partNumber.value = data.partNumber || "";
  desc.value = data.description || "";
  uom.value = data.uom || "";
  cost.value = Number.isFinite(Number(data.unitCost)) ? Number(data.unitCost) : "";
  qty.value = Number.isFinite(Number(data.quantity)) ? Number(data.quantity) : "";

  function applyAmount() {
    const lineAmount = Number(cost.value || 0) * Number(qty.value || 0);
    amount.value = Number.isFinite(lineAmount) ? formatMoney(lineAmount) : "$0.00";
    updateTotals();
  }

  function tryAutofill() {
    const key = normalizePartKey(partNumber.value);
    if (!key) return;
    const match = partsCache.find((p) => normalizePartKey(p.partNumber) === key);
    if (!match) return;
    if (!desc.value) desc.value = match.description || "";
    if (!uom.value) uom.value = match.uom || "";
    if (!cost.value && Number.isFinite(Number(match.unitCost))) cost.value = Number(match.unitCost);
    applyAmount();
  }

  partNumber.addEventListener("input", () => {
    tryAutofill();
  });
  cost.addEventListener("input", applyAmount);
  qty.addEventListener("input", applyAmount);
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateTotals();
  });

  applyAmount();
  return row;
}

function buildLaborRow(data = {}) {
  const row = document.createElement("div");
  row.className = "workorder-labor-grid workorder-line-row";
  row.innerHTML = `
    <input class="labor-hours" type="number" min="0" step="0.25" placeholder="Hours" />
    <textarea class="labor-notes" placeholder="Work done"></textarea>
    <button class="ghost small danger" type="button">Remove</button>
  `;

  const hours = row.querySelector(".labor-hours");
  const notes = row.querySelector(".labor-notes");
  const removeBtn = row.querySelector("button");

  hours.value = Number.isFinite(Number(data.hours)) ? Number(data.hours) : "";
  notes.value = data.notes || "";
  autoResizeTextarea(notes);

  hours.addEventListener("input", updateTotals);
  notes.addEventListener("input", () => autoResizeTextarea(notes));
  removeBtn.addEventListener("click", () => {
    row.remove();
    updateTotals();
  });

  return row;
}

function collectParts() {
  const rows = Array.from(partsLines?.querySelectorAll(".workorder-line-row") || []);
  return rows
    .map((row) => {
      const partNumber = row.querySelector(".part-number")?.value || "";
      const description = row.querySelector(".part-desc")?.value || "";
      const uom = row.querySelector(".part-uom")?.value || "";
      const unitCost = Number(row.querySelector(".part-cost")?.value || 0);
      const quantity = Number(row.querySelector(".part-qty")?.value || 0);
      const lineAmount = Number.isFinite(unitCost) && Number.isFinite(quantity) ? unitCost * quantity : 0;
      return {
        partNumber: normalizePartNumber(partNumber),
        description: description.trim(),
        uom: uom.trim(),
        unitCost: Number.isFinite(unitCost) ? unitCost : 0,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        lineAmount: Number.isFinite(lineAmount) ? lineAmount : 0,
      };
    })
    .filter((item) => {
      return item.partNumber || item.description || item.uom || item.unitCost || item.quantity;
    });
}

function collectLabor() {
  const rows = Array.from(laborLines?.querySelectorAll(".workorder-line-row") || []);
  return rows
    .map((row) => {
      const hours = Number(row.querySelector(".labor-hours")?.value || 0);
      const notes = row.querySelector(".labor-notes")?.value || "";
      return {
        hours: Number.isFinite(hours) ? hours : 0,
        notes: notes.trim(),
      };
    })
    .filter((item) => item.hours || item.notes);
}

function syncPartsCatalogFromLines(parts) {
  const next = [...partsCache];
  const byKey = new Map(next.map((p) => [normalizePartKey(p.partNumber), p]));

  parts.forEach((item) => {
    const key = normalizePartKey(item.partNumber);
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      if (item.description) existing.description = item.description;
      if (item.uom) existing.uom = item.uom;
      if (Number.isFinite(item.unitCost)) existing.unitCost = item.unitCost;
      existing.updatedAt = new Date().toISOString();
    } else {
      next.push({
        partNumber: item.partNumber,
        description: item.description,
        uom: item.uom,
        unitCost: Number.isFinite(item.unitCost) ? item.unitCost : 0,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
  });

  partsCache = next;
  savePartsCatalog(partsCache);
  renderPartsCatalogOptions();
}

function setSaveStatus(message) {
  if (saveStatus) saveStatus.textContent = message || "";
}

async function syncWorkOrderPause(record) {
  if (!activeCompanyId) return;
  const unitIds = dedupeStringList(normalizeUnitIds(record));
  if (!unitIds.length) return;
  const now = new Date().toISOString();
  const updatedStamp = record.updatedAt || now;
  const payload = {
    companyId: activeCompanyId,
    workOrderNumber: record.number,
    serviceStatus: record.serviceStatus || "in_service",
    orderStatus: record.orderStatus || "open",
  };

  if (record.serviceStatus === "out_of_service") {
    payload.startAt = updatedStamp;
    if (record.orderStatus === "closed") {
      payload.endAt = record.closedAt || updatedStamp || now;
    }
  } else {
    payload.endAt = record.closedAt || updatedStamp || now;
  }

  const errors = [];
  await Promise.all(
    unitIds.map(async (unitId) => {
      const res = await fetch(`/api/equipment/${encodeURIComponent(unitId)}/work-order-pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errors.push(data.error || "Unable to update rental pause period.");
      }
    })
  );
  if (errors.length) {
    throw new Error(errors[0]);
  }
}

function applyWorkOrderToForm(order) {
  editingWorkOrder = order;
  setCreatedDateFromWorkOrder(order);
  if (workOrderNumber && order?.number) {
    workOrderNumber.textContent = order.number;
    workOrderNumber.style.display = "inline-flex";
  }
  if (workSummaryInput) {
    workSummaryInput.value = order?.workSummary || "";
    autoResizeTextarea(workSummaryInput);
  }
  if (workIssuesInput) {
    workIssuesInput.value = order?.issues || "";
    autoResizeTextarea(workIssuesInput);
  }
  if (workDateInput) workDateInput.value = order?.date || "";
  if (unitSelect) {
    Array.from(unitSelect.options).forEach((opt) => {
      opt.selected = false;
    });
    applyUnitSelectionToSelect(normalizeUnitIds(order), normalizeUnitLabels(order));
  }
  renderSelectedUnits();
  if (orderStatusInput) orderStatusInput.value = order?.orderStatus || "open";
  if (serviceStatusSelect) serviceStatusSelect.value = order?.serviceStatus || "in_service";
  if (returnInspectionToggle) returnInspectionToggle.checked = order?.returnInspection === true;

  if (rentalOrderSelect && order?.rentalOrderId) rentalOrderSelect.value = String(order.rentalOrderId);
  if (customerSelect && order?.customerId) customerSelect.value = String(order.customerId);
  if (customerNameInput) customerNameInput.value = order?.customerName || "";
  if (categoryInput) categoryInput.value = order?.category || "";
  if (contactInput) contactInput.value = order?.contact || "";
  if (siteNameInput) siteNameInput.value = order?.siteName || "";
  if (siteAddressInput) siteAddressInput.value = order?.siteAddress || "";
  if (siteAccessCodeInput) siteAccessCodeInput.value = order?.siteAccessCode || "";
  if (dueDateInput) dueDateInput.value = order?.dueDate || "";
  if (isRecurringToggle) isRecurringToggle.checked = order?.isRecurring === true;
  if (recurrenceIntervalInput) recurrenceIntervalInput.value = order?.recurrenceInterval ? String(order.recurrenceInterval) : "1";
  if (recurrenceFrequencySelect) recurrenceFrequencySelect.value = order?.recurrenceFrequency || "";
  syncRecurrenceControls();

  partsLines?.replaceChildren();
  laborLines?.replaceChildren();

  (order?.parts || []).forEach((item) => {
    partsLines?.appendChild(buildPartRow(item));
  });
  (order?.labor || []).forEach((item) => {
    laborLines?.appendChild(buildLaborRow(item));
  });

  if (!order?.parts?.length) partsLines?.appendChild(buildPartRow());
  if (!order?.labor?.length) laborLines?.appendChild(buildLaborRow());

  if (deleteBtn) deleteBtn.style.display = "inline-flex";
  updateTotals();
  updateServiceHint();
  syncStatusActions();
  renderSourceMetaHint();
}

async function loadEquipment() {
  if (!activeCompanyId) return;
  if (!unitSelect) return;
  unitSelect.disabled = true;
  try {
    const res = await fetch(`/api/equipment?companyId=${activeCompanyId}`);
    if (!res.ok) throw new Error("Unable to fetch equipment");
    const data = await res.json();
    equipmentCache = Array.isArray(data.equipment) ? data.equipment : [];
    equipmentCache = sortEquipmentByModel(equipmentCache);
    unitSelect.innerHTML = `<option value="">Select a unit</option>`;
    equipmentCache.forEach((item) => {
      const option = document.createElement("option");
      const label = equipmentLabel(item);
      option.value = item.id;
      option.textContent = label;
      unitSelect.appendChild(option);
    });
    Array.from(unitSelect.options).forEach((opt) => {
      opt.selected = false;
    });
    if (editingWorkOrder) {
      applyUnitSelectionToSelect(normalizeUnitIds(editingWorkOrder), normalizeUnitLabels(editingWorkOrder));
    } else if (pendingUnitId) {
      applyUnitSelectionToSelect([pendingUnitId], [`Unit ${pendingUnitId} (from dispatch)`]);
      pendingUnitId = null;
    }
    renderSelectedUnits();
    unitSelect.disabled = false;
    if (unitMeta) unitMeta.textContent = equipmentCache.length ? `${equipmentCache.length} units available` : "No units found.";
    updateServiceHint();
  } catch (err) {
    if (unitMeta) unitMeta.textContent = err.message || "Unable to load units.";
  } finally {
    unitSelect.disabled = false;
  }
}

function initForm() {
  partsCache = loadPartsCatalog();
  renderPartsCatalogOptions();

  if (workSummaryInput) {
    autoResizeTextarea(workSummaryInput);
    workSummaryInput.addEventListener("input", () => autoResizeTextarea(workSummaryInput));
  }
  if (workIssuesInput) {
    autoResizeTextarea(workIssuesInput);
    workIssuesInput.addEventListener("input", () => autoResizeTextarea(workIssuesInput));
  }

  if (partsLines && !partsLines.children.length) partsLines.appendChild(buildPartRow());
  if (laborLines && !laborLines.children.length) laborLines.appendChild(buildLaborRow());
  if (!workOrderId && createdDateInput && !createdDateInput.value) {
    createdDateInput.value = new Date().toISOString().slice(0, 10);
  }
  if (orderStatusInput && !orderStatusInput.value) orderStatusInput.value = "open";
  if (returnInspectionToggle && returnInspectionToggle.checked) {
    if (serviceStatusSelect) serviceStatusSelect.value = "out_of_service";
  }

  applyPrefillToForm();
  updateTotals();
  updateServiceHint();
  syncStatusActions();
}

async function saveWorkOrder() {
  if (!activeCompanyId) {
    setSaveStatus("Log in to continue.");
    return null;
  }

  const date =
    (editingWorkOrder?.date || "").trim()
    || (createdDateInput?.value || "").trim()
    || new Date().toISOString().slice(0, 10);
  const unitIds = getSelectedUnitIds();
  const unitLabels = getSelectedUnitLabels();
  const workSummary = workSummaryInput?.value?.trim() || "";
  const issues = workIssuesInput?.value?.trim() || "";
  const orderStatus = orderStatusInput?.value || "open";
  const returnInspection = returnInspectionToggle?.checked === true;
  const serviceStatus = returnInspection ? "out_of_service" : (serviceStatusSelect?.value || "in_service");

  const selectedRental = getSelectedRentalOrder();
  const selectedCustomer = getSelectedCustomer();
  const rentalOrderId = selectedRental ? Number(selectedRental.id) : null;
  const rentalOrderNumber = selectedRental ? (selectedRental.ro_number || selectedRental.quote_number || "") : (editingWorkOrder?.rentalOrderNumber || "");
  const customerId = selectedCustomer ? Number(selectedCustomer.id) : null;
  const customerName =
    String(customerNameInput?.value || "").trim()
    || (selectedCustomer ? String(selectedCustomer.company_name || "").trim() : "")
    || (editingWorkOrder?.customerName || "");
  const category = String(categoryInput?.value || "").trim();
  const contact = String(contactInput?.value || "").trim();
  const siteName = String(siteNameInput?.value || "").trim();
  const siteAddress = String(siteAddressInput?.value || "").trim();
  const siteAccessCode = String(siteAccessCodeInput?.value || "").trim();
  const dueDate = dueDateInput?.value || "";
  const isRecurring = isRecurringToggle?.checked === true;
  const recurrenceFrequency = String(recurrenceFrequencySelect?.value || "").trim();
  const recurrenceInterval = Number(recurrenceIntervalInput?.value || 1);

  if (!unitIds.length) {
    setSaveStatus("Please select at least one unit.");
    return null;
  }

  const parts = collectParts();
  const labor = collectLabor();

  const now = new Date().toISOString();
  let completedAt = editingWorkOrder?.completedAt || null;
  let closedAt = editingWorkOrder?.closedAt || null;

  if (orderStatus === "closed") {
    if (!closedAt) closedAt = now;
  } else if (orderStatus === "completed") {
    if (!completedAt) completedAt = now;
    closedAt = null;
  } else {
    completedAt = null;
    closedAt = null;
  }

  const payload = {
    companyId: activeCompanyId,
    date,
    rentalOrderId,
    rentalOrderNumber,
    customerId,
    customerName,
    category,
    contact,
    siteName,
    siteAddress,
    siteAccessCode,
    dueDate: dueDate || null,
    isRecurring,
    recurrenceFrequency: isRecurring ? (recurrenceFrequency || null) : null,
    recurrenceInterval: isRecurring && Number.isFinite(recurrenceInterval) && recurrenceInterval > 0 ? recurrenceInterval : null,
    unitIds,
    unitLabels,
    unitId: unitIds[0] || null,
    unitLabel: unitLabels[0] || "",
    workSummary,
    issues,
    orderStatus,
    serviceStatus,
    returnInspection,
    parts,
    labor,
    source: editingWorkOrder?.source || pendingSource || null,
    sourceOrderId: editingWorkOrder?.sourceOrderId || null,
    sourceOrderNumber: editingWorkOrder?.sourceOrderNumber || null,
    sourceLineItemId: editingWorkOrder?.sourceLineItemId || null,
    sourceMeta: normalizeSourceMeta(editingWorkOrder?.sourceMeta) || normalizeSourceMeta(pendingSourceMeta) || null,
    completedAt,
    closedAt,
  };

  const isEditing = !!editingWorkOrder?.id;
  const res = await fetch(isEditing ? `/api/work-orders/${encodeURIComponent(editingWorkOrder.id)}` : "/api/work-orders", {
    method: isEditing ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    setSaveStatus(data.error || "Unable to save work order.");
    return null;
  }

  const record = data.workOrder;
  editingWorkOrder = record;
  const idx = workOrdersCache.findIndex((order) => String(order?.id) === String(record?.id));
  if (idx >= 0) {
    workOrdersCache[idx] = record;
  } else {
    workOrdersCache.push(record);
  }

  syncPartsCatalogFromLines(parts);

  if (workOrderNumber) {
    workOrderNumber.textContent = record.number;
    workOrderNumber.style.display = "inline-flex";
  }
  if (deleteBtn) deleteBtn.style.display = "inline-flex";
  try {
    await syncWorkOrderPause(record);
    setSaveStatus("Work order saved.");
  } catch (err) {
    setSaveStatus(`Work order saved, but pause update failed: ${err.message}`);
  }
  updateTotals();
  updateServiceHint();
  syncStatusActions();
  renderSourceMetaHint();
  return record;
}

saveBtn?.addEventListener("click", async () => {
  await saveWorkOrder();
});

deleteBtn?.addEventListener("click", () => {
  if (!editingWorkOrder || !activeCompanyId) return;
  fetch(`/api/work-orders/${encodeURIComponent(editingWorkOrder.id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId: activeCompanyId }),
  })
    .then((res) => {
      if (!res.ok) return res.json().catch(() => ({})).then((data) => Promise.reject(new Error(data.error || "Unable to delete work order.")));
      return null;
    })
    .then(() => {
      workOrdersCache = workOrdersCache.filter((order) => String(order.id) !== String(editingWorkOrder.id));
      window.location.href = "work-orders.html";
    })
    .catch((err) => {
      setSaveStatus(err?.message || "Unable to delete work order.");
    });
});


addPartLineBtn?.addEventListener("click", () => {
  partsLines?.appendChild(buildPartRow());
});

addLaborLineBtn?.addEventListener("click", () => {
  laborLines?.appendChild(buildLaborRow());
});

unitSelect?.addEventListener("change", () => {
  renderSelectedUnits();
  updateServiceHint();
});

unitSearchInput?.addEventListener("focus", () => {
  renderUnitSuggestions({ term: unitSearchInput.value, showAll: true });
});

unitSearchInput?.addEventListener("input", () => {
  renderUnitSuggestions({ term: unitSearchInput.value, showAll: true });
});

unitSearchInput?.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideUnitSuggestions();
    unitSearchInput.value = "";
    return;
  }
  if (e.key === "ArrowDown") {
    renderUnitSuggestions({ term: unitSearchInput.value, showAll: true });
    const first = unitSuggestions?.querySelector?.("button[data-unit-id]");
    if (first) {
      e.preventDefault();
      first.focus();
    }
    return;
  }
  if (e.key === "Enter") {
    const first = unitSuggestions?.querySelector?.("button[data-unit-id]");
    if (first) {
      e.preventDefault();
      first.click();
      return;
    }
    const term = String(unitSearchInput.value || "").trim();
    if (!term) {
      e.preventDefault();
      hideUnitSuggestions();
      return;
    }
    const available = sortEquipmentByModel(equipmentCache);
    const exact = available.find(
      (item) => equipmentLabel(item).toLowerCase() === term.toLowerCase()
    );
    if (exact) {
      e.preventDefault();
      addUnitSelection(exact.id);
    }
  }
});

unitSearchInput?.addEventListener("blur", () => {
  setTimeout(() => {
    if (unitSuggestions?.contains(document.activeElement)) return;
    hideUnitSuggestions();
  }, 80);
});

unitSuggestions?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("button[data-unit-id]");
  if (!btn) return;
  e.preventDefault();
  addUnitSelection(btn.dataset.unitId);
});

unitSelectedList?.addEventListener("click", (e) => {
  const btn = e.target.closest?.("[data-remove-unit]");
  if (!btn) return;
  e.preventDefault();
  const removeId = btn.dataset.removeUnit;
  const ids = getSelectedUnitIds().filter((id) => String(id) !== String(removeId));
  setSelectedUnitIds(ids);
  updateServiceHint();
});

document.addEventListener("click", (e) => {
  if (!unitSearchInput || !unitSuggestions) return;
  const target = e.target;
  if (unitSearchInput.contains(target) || unitSuggestions.contains(target)) return;
  hideUnitSuggestions();
});

serviceStatusSelect?.addEventListener("change", updateServiceHint);
returnInspectionToggle?.addEventListener("change", () => {
  if (returnInspectionToggle.checked && serviceStatusSelect) {
    serviceStatusSelect.value = "out_of_service";
  }
  updateServiceHint();
});

isRecurringToggle?.addEventListener("change", syncRecurrenceControls);
recurrenceIntervalInput?.addEventListener("input", syncRecurrenceControls);
recurrenceFrequencySelect?.addEventListener("change", syncRecurrenceControls);

rentalOrderSelect?.addEventListener("change", () => {
  const selected = getSelectedRentalOrder();
  if (!selected) return;
  if (siteNameInput) siteNameInput.value = selected.site_name || siteNameInput.value || "";
  if (siteAddressInput) siteAddressInput.value = selected.site_address || siteAddressInput.value || "";
  if (customerNameInput && !String(customerNameInput.value || "").trim()) {
    customerNameInput.value = selected.customer_name || "";
  }
  if (customerSelect && selected.customer_id) {
    customerSelect.value = String(selected.customer_id);
  }
});

customerSelect?.addEventListener("change", () => {
  const selected = getSelectedCustomer();
  if (!selected) return;
  if (customerNameInput && !String(customerNameInput.value || "").trim()) {
    customerNameInput.value = String(selected.company_name || "").trim();
  }
});

markCompleteBtn?.addEventListener("click", async () => {
  if (orderStatusInput) orderStatusInput.value = "completed";
  updateServiceHint();
  syncStatusActions();
  await saveWorkOrder();
});
markClosedBtn?.addEventListener("click", () => {
  if (orderStatusInput) orderStatusInput.value = "closed";
  updateServiceHint();
  syncStatusActions();
  saveWorkOrder();
});
markOpenBtn?.addEventListener("click", () => {
  if (orderStatusInput) orderStatusInput.value = "open";
  updateServiceHint();
  syncStatusActions();
  saveWorkOrder();
});

if (activeCompanyId) {
  window.RentSoft?.setCompanyId?.(activeCompanyId);
  companyMeta.textContent = "";
  initForm();
  renderSourceMetaHint();
  syncRecurrenceControls();
  loadCustomers();
  loadRentalOrders();
  fetchWorkOrders()
    .then(() => updateServiceHint())
    .catch((err) => {
      setSaveStatus(err?.message || "Unable to load work orders.");
    });
  if (workOrderId) {
    fetchWorkOrderById(workOrderId)
      .then((existing) => {
        if (existing) applyWorkOrderToForm(existing);
        loadCustomers();
        loadRentalOrders();
      })
      .catch((err) => {
        setSaveStatus(err?.message || "Unable to load work order.");
      });
  }
  loadEquipment();
} else {
  companyMeta.textContent = "Log in to create a work order.";
}
