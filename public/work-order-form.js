const companyMeta = document.getElementById("company-meta");
const unitMeta = document.getElementById("unit-meta");
const workOrderTitle = document.getElementById("work-order-title");
const workOrderNumber = document.getElementById("work-order-number");
const workSummaryInput = document.getElementById("work-summary");
const workDateInput = document.getElementById("work-date");
const unitSelect = document.getElementById("unit-select");
const orderStatusInput = document.getElementById("order-status");
const serviceStatusSelect = document.getElementById("service-status");
const returnInspectionToggle = document.getElementById("return-inspection");
const serviceHint = document.getElementById("service-hint");
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

const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();
const workOrderId = params.get("id");
const initialUnitId = params.get("unitId");
const initialSummary = params.get("summary");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let partsCache = [];
let equipmentCache = [];
let editingWorkOrder = null;
let pendingUnitId = initialUnitId ? String(initialUnitId) : null;
let pendingSummary = initialSummary ? String(initialSummary) : null;

function keyForWorkOrders(companyId) {
  return `rentSoft.workOrders.${companyId}`;
}

function keyForWorkOrderSeq(companyId, year) {
  return `rentSoft.workOrdersSeq.${companyId}.${year}`;
}

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

function loadWorkOrders() {
  if (!activeCompanyId) return [];
  const raw = localStorage.getItem(keyForWorkOrders(activeCompanyId));
  const data = safeJsonParse(raw, []);
  return Array.isArray(data) ? data : [];
}

function saveWorkOrders(orders) {
  if (!activeCompanyId) return;
  localStorage.setItem(keyForWorkOrders(activeCompanyId), JSON.stringify(orders || []));
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
}

function getOutOfServiceMap(excludeId = null) {
  const orders = loadWorkOrders();
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

function nextWorkOrderNumber() {
  const year = new Date().getFullYear();
  if (!activeCompanyId) return `WO-${year}-${String(1).padStart(5, "0")}`;
  const raw = localStorage.getItem(keyForWorkOrderSeq(activeCompanyId, year));
  const current = Number(raw || 0);
  const next = Number.isFinite(current) ? current + 1 : 1;
  localStorage.setItem(keyForWorkOrderSeq(activeCompanyId, year), String(next));
  return `WO-${year}-${String(next).padStart(5, "0")}`;
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
  if (workSummaryInput && pendingSummary && !String(workSummaryInput.value || "").trim()) {
    workSummaryInput.value = pendingSummary;
    autoResizeTextarea(workSummaryInput);
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
  const payload = {
    companyId: activeCompanyId,
    workOrderNumber: record.number,
    serviceStatus: record.serviceStatus || "in_service",
    orderStatus: record.orderStatus || "open",
  };

  if (record.serviceStatus === "out_of_service") {
    payload.startAt = record.createdAt || record.updatedAt || now;
    if (record.orderStatus === "closed") {
      payload.endAt = record.closedAt || record.updatedAt || now;
    }
  } else {
    payload.endAt = record.closedAt || record.updatedAt || now;
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
  if (workOrderNumber && order?.number) {
    workOrderNumber.textContent = order.number;
    workOrderNumber.style.display = "inline-flex";
  }
  if (workSummaryInput) {
    workSummaryInput.value = order?.workSummary || "";
    autoResizeTextarea(workSummaryInput);
  }
  if (workDateInput) workDateInput.value = order?.date || "";
  if (unitSelect) {
    Array.from(unitSelect.options).forEach((opt) => {
      opt.selected = false;
    });
    applyUnitSelectionToSelect(normalizeUnitIds(order), normalizeUnitLabels(order));
  }
  if (orderStatusInput) orderStatusInput.value = order?.orderStatus || "open";
  if (serviceStatusSelect) serviceStatusSelect.value = order?.serviceStatus || "in_service";
  if (returnInspectionToggle) returnInspectionToggle.checked = order?.returnInspection === true;

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
    unitSelect.innerHTML = `<option value="">Select a unit</option>`;
    equipmentCache.forEach((item) => {
      const option = document.createElement("option");
      const label = [item.model_name, item.serial_number].filter(Boolean).join(" - ") || `Unit ${item.id}`;
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

  if (partsLines && !partsLines.children.length) partsLines.appendChild(buildPartRow());
  if (laborLines && !laborLines.children.length) laborLines.appendChild(buildLaborRow());
  if (!workOrderId && workDateInput && !workDateInput.value) {
    workDateInput.value = new Date().toISOString().slice(0, 10);
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
    return false;
  }

  const date = workDateInput?.value || "";
  const unitIds = getSelectedUnitIds();
  const unitLabels = getSelectedUnitLabels();
  const workSummary = workSummaryInput?.value?.trim() || "";
  const orderStatus = orderStatusInput?.value || "open";
  const returnInspection = returnInspectionToggle?.checked === true;
  const serviceStatus = returnInspection ? "out_of_service" : (serviceStatusSelect?.value || "in_service");

  if (!date) {
    setSaveStatus("Please select a date.");
    return false;
  }
  if (!unitIds.length) {
    setSaveStatus("Please select at least one unit.");
    return false;
  }

  const parts = collectParts();
  const labor = collectLabor();

  const orders = loadWorkOrders();
  const now = new Date().toISOString();
  let record = editingWorkOrder;

  if (!record) {
    record = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      number: nextWorkOrderNumber(),
      createdAt: now,
    };
    orders.push(record);
  } else {
    const existingIndex = orders.findIndex((order) => String(order?.id) === String(record?.id));
    if (existingIndex >= 0) {
      record = orders[existingIndex];
    } else {
      orders.push(record);
    }
  }

  record.date = date;
  record.unitIds = unitIds;
  record.unitLabels = unitLabels;
  record.unitId = unitIds[0] || null;
  record.unitLabel = unitLabels[0] || "";
  record.workSummary = workSummary;
  record.orderStatus = orderStatus;
  record.serviceStatus = serviceStatus;
  record.returnInspection = returnInspection;
  record.parts = parts;
  record.labor = labor;
  record.updatedAt = now;
  if (orderStatus === "closed") {
    if (!record.closedAt) record.closedAt = now;
  } else if (orderStatus === "completed") {
    if (!record.completedAt) record.completedAt = now;
  } else {
    record.closedAt = null;
    record.completedAt = null;
  }

  saveWorkOrders(orders);
  syncPartsCatalogFromLines(parts);
  editingWorkOrder = record;

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
  return true;
}

saveBtn?.addEventListener("click", async () => {
  await saveWorkOrder();
});

deleteBtn?.addEventListener("click", () => {
  if (!editingWorkOrder || !activeCompanyId) return;
  const orders = loadWorkOrders().filter((order) => String(order.id) !== String(editingWorkOrder.id));
  saveWorkOrders(orders);
  window.location.href = "work-orders.html";
});


addPartLineBtn?.addEventListener("click", () => {
  partsLines?.appendChild(buildPartRow());
});

addLaborLineBtn?.addEventListener("click", () => {
  laborLines?.appendChild(buildLaborRow());
});

unitSelect?.addEventListener("change", updateServiceHint);
serviceStatusSelect?.addEventListener("change", updateServiceHint);
returnInspectionToggle?.addEventListener("change", () => {
  if (returnInspectionToggle.checked && serviceStatusSelect) {
    serviceStatusSelect.value = "out_of_service";
  }
  updateServiceHint();
});
markCompleteBtn?.addEventListener("click", () => {
  if (orderStatusInput) orderStatusInput.value = "completed";
  updateServiceHint();
  syncStatusActions();
  saveWorkOrder();
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
  const orders = loadWorkOrders();
  if (workOrderId) {
    const existing = orders.find((order) => String(order.id) === String(workOrderId));
    if (existing) applyWorkOrderToForm(existing);
  }
  loadEquipment();
} else {
  companyMeta.textContent = "Log in to create a work order.";
}
