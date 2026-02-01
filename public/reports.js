const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");

const datasetSelect = document.getElementById("reports-dataset");
const searchInput = document.getElementById("reports-search");
const fromInput = document.getElementById("reports-from");
const toInput = document.getElementById("reports-to");
const rangeRow = document.getElementById("reports-range-row");
const dateFieldRow = document.getElementById("reports-date-field-row");
const dateFieldSelect = document.getElementById("reports-date-field");
const statusesWrap = document.getElementById("reports-statuses");
const statusCheckboxes = Array.from(statusesWrap?.querySelectorAll?.("input[type=\"checkbox\"]") || []);
const analyticsWrap = document.getElementById("reports-analytics");
const revenueGroupSelect = document.getElementById("reports-revenue-group");
const salespersonMetricSelect = document.getElementById("reports-salesperson-metric");
const utilizationBasisSelect = document.getElementById("reports-utilization-basis");
const utilizationForwardInput = document.getElementById("reports-utilization-forward-months");
const analyticsLocationSelect = document.getElementById("reports-analytics-location");
const analyticsTypeSelect = document.getElementById("reports-analytics-type");
const analyticsCategorySelect = document.getElementById("reports-analytics-category");
const lineItemGroupRow = document.getElementById("reports-lineitem-group-row");
const lineItemGroupSelect = document.getElementById("reports-lineitem-group");
const analyticsRevenueRow = document.getElementById("reports-analytics-row-revenue");
const analyticsSalespersonRow = document.getElementById("reports-analytics-row-salesperson");
const analyticsFiltersRow = document.getElementById("reports-analytics-row-filters");
const analyticsUtilizationRow = document.getElementById("reports-analytics-row-utilization");
const analyticsCategoryRow = document.getElementById("reports-analytics-row-category");

const fieldsEl = document.getElementById("reports-fields");
const runBtn = document.getElementById("reports-run");
const exportBtn = document.getElementById("reports-export");
const countPill = document.getElementById("reports-count");
const previewTitle = document.getElementById("reports-preview-title");
const tableEl = document.getElementById("reports-table");

const chartCanvas = document.getElementById("reports-chart");
const chartTypeSelect = document.getElementById("reports-chart-type");
const xSelect = document.getElementById("reports-x");
const yAggSelect = document.getElementById("reports-y-agg");
const yFieldRow = document.getElementById("reports-y-field-row");
const yFieldSelect = document.getElementById("reports-y-field");
const topNInput = document.getElementById("reports-topn");
const metaEl = document.getElementById("reports-meta");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let rawRows = [];
let filteredRows = [];
let selectedFields = [];
let chart = null;
let analyticsOptionsLoaded = false;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toLocalDateInputValue(d) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
}

function parseLocalDateInputValue(v) {
  if (!v) return null;
  const [y, m, d] = String(v).split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function setMeta(message) {
  if (!metaEl) return;
  metaEl.textContent = String(message || "").trim();
}

function fmtCount(n, label) {
  const x = Number(n || 0);
  return `${x} ${label}${x === 1 ? "" : "s"}`;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function selectedStatusesParam() {
  const values = statusCheckboxes.filter((c) => c.checked).map((c) => c.value);
  return values.length ? values.join(",") : "";
}

function hasDateRange(datasetKey) {
  if (Boolean(dateFieldOptionsFor(datasetKey)?.length)) return true;
  return ["revenueTimeseries", "revenueSummary", "salespersonSummary", "utilizationSummary", "utilizationDaily", "utilizationForward"].includes(
    datasetKey
  );
}

function dateFieldOptionsFor(datasetKey) {
  switch (datasetKey) {
    case "rentalOrders":
    case "quotes":
      return [
        { value: "rental_period", label: "Rental period" },
        { value: "created_at", label: "Created" },
        { value: "updated_at", label: "Updated" },
      ];
    case "rentalOrderLineItems":
    case "lineItemRevenueSummary":
      return [
        { value: "start_at", label: "Start" },
        { value: "end_at", label: "End" },
        { value: "fulfilled_at", label: "Fulfilled" },
        { value: "returned_at", label: "Returned" },
        { value: "order_created_at", label: "Order created" },
        { value: "order_updated_at", label: "Order updated" },
      ];
    case "purchaseOrders":
      return [
        { value: "created_at", label: "Created" },
        { value: "updated_at", label: "Updated" },
        { value: "expected_possession_date", label: "Expected" },
      ];
    case "equipmentBundles":
    case "types":
    case "categories":
    case "locations":
    case "vendors":
    case "customers":
    case "users":
    case "equipment":
    case "salesPeople":
      return [{ value: "created_at", label: "Created" }];
    case "revenueTimeseries":
    default:
      return [];
  }
}

function getRangeOrDefault() {
  const range = readDateRangeParams();
  if (range) return range;
  const now = new Date();
  const fromDt = startOfLocalDay(new Date(now.getTime() - 365 * DAY_MS));
  const toDt = startOfLocalDay(now);
  return {
    from: fromDt.toISOString(),
    to: new Date(toDt.getTime() + DAY_MS).toISOString(),
  };
}

function readDateRangeParams() {
  const fromDt = parseLocalDateInputValue(fromInput?.value);
  const toDt = parseLocalDateInputValue(toInput?.value);
  if (!fromDt || !toDt) return null;
  return {
    from: fromDt.toISOString(),
    to: new Date(toDt.getTime() + DAY_MS).toISOString(),
  };
}

function applyDateRangeParams(qs) {
  const range = readDateRangeParams();
  if (!range) return;
  qs.set("from", range.from);
  qs.set("to", range.to);
  const dateField = String(dateFieldSelect?.value || "").trim();
  if (dateField) qs.set("dateField", dateField);
}

function supportsStatuses(datasetKey) {
  return (
    datasetKey === "rentalOrders" ||
    datasetKey === "quotes" ||
    datasetKey === "rentalOrderLineItems" ||
    datasetKey === "lineItemRevenueSummary"
  );
}

function supportsAnalyticsOptions(datasetKey) {
  return (
    datasetKey === "revenueSummary" ||
    datasetKey === "salespersonSummary" ||
    datasetKey.startsWith("utilization") ||
    datasetKey === "lineItemRevenueSummary"
  );
}

function supportsAnalyticsFilters(datasetKey) {
  return (
    datasetKey === "revenueSummary" ||
    datasetKey === "salespersonSummary" ||
    datasetKey.startsWith("utilization")
  );
}

function supportsUtilizationFilters(datasetKey) {
  return datasetKey.startsWith("utilization");
}

function setSelectOptions(select, items, { includeAll = true, allLabel = "All" } = {}) {
  if (!select) return;
  select.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = allLabel;
    select.appendChild(opt);
  }
  (items || []).forEach((item) => {
    const opt = document.createElement("option");
    opt.value = String(item.value);
    opt.textContent = item.label;
    select.appendChild(opt);
  });
}

async function loadAnalyticsOptions() {
  if (!activeCompanyId || analyticsOptionsLoaded) return;
  try {
    const [locationsData, typesData, categoriesData] = await Promise.all([
      fetchJson(`/api/locations?companyId=${activeCompanyId}&scope=all`),
      fetchJson(`/api/equipment-types?companyId=${activeCompanyId}`),
      fetchJson(`/api/equipment-categories?companyId=${activeCompanyId}`),
    ]);
    const locations = Array.isArray(locationsData.locations)
      ? locationsData.locations.map((l) => ({ value: l.id, label: l.name }))
      : [];
    const types = Array.isArray(typesData.types) ? typesData.types.map((t) => ({ value: t.id, label: t.name })) : [];
    const categories = Array.isArray(categoriesData.categories)
      ? categoriesData.categories.map((c) => ({ value: c.id, label: c.name }))
      : [];
    setSelectOptions(analyticsLocationSelect, locations);
    setSelectOptions(analyticsTypeSelect, types);
    setSelectOptions(analyticsCategorySelect, categories);
    analyticsOptionsLoaded = true;
  } catch {
    setSelectOptions(analyticsLocationSelect, []);
    setSelectOptions(analyticsTypeSelect, []);
    setSelectOptions(analyticsCategorySelect, []);
  }
}

async function loadDataset(datasetKey) {
  if (!activeCompanyId) throw new Error("Log in to continue.");
  const statuses = supportsStatuses(datasetKey) ? selectedStatusesParam() : "";

  if (datasetKey === "rentalOrders") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    if (statuses) qs.set("statuses", statuses);
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/rental-orders?${qs.toString()}`);
    return Array.isArray(data.orders) ? data.orders : [];
  }

  if (datasetKey === "quotes") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    if (statuses) qs.set("statuses", statuses);
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/rental-quotes?${qs.toString()}`);
    return Array.isArray(data.orders) ? data.orders : [];
  }

  if (datasetKey === "rentalOrderLineItems") {
    const range = getRangeOrDefault();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
    });
    if (statuses) qs.set("statuses", statuses);
    const dateField = String(dateFieldSelect?.value || "start_at");
    if (dateField) qs.set("dateField", dateField);
    const data = await fetchJson(`/api/rental-order-line-items?${qs.toString()}`);
    return Array.isArray(data.items) ? data.items : [];
  }

  if (datasetKey === "lineItemRevenueSummary") {
    const range = getRangeOrDefault();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
    });
    if (statuses) qs.set("statuses", statuses);
    const dateField = String(dateFieldSelect?.value || "start_at");
    if (dateField) qs.set("dateField", dateField);
    const groupBy = String(lineItemGroupSelect?.value || "type");
    if (groupBy) qs.set("groupBy", groupBy);
    const data = await fetchJson(`/api/rental-order-line-items/revenue-summary?${qs.toString()}`);
    return Array.isArray(data.rows) ? data.rows : [];
  }

  if (datasetKey === "customers") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/customers?${qs.toString()}`);
    return Array.isArray(data.customers) ? data.customers : [];
  }

  if (datasetKey === "users") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/users?${qs.toString()}`);
    return Array.isArray(data.users) ? data.users : [];
  }

  if (datasetKey === "equipment") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/equipment?${qs.toString()}`);
    return Array.isArray(data.equipment) ? data.equipment : [];
  }

  if (datasetKey === "equipmentBundles") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/equipment-bundles?${qs.toString()}`);
    return Array.isArray(data.bundles) ? data.bundles : [];
  }

  if (datasetKey === "types") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/equipment-types?${qs.toString()}`);
    return Array.isArray(data.types) ? data.types : [];
  }

  if (datasetKey === "categories") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/equipment-categories?${qs.toString()}`);
    return Array.isArray(data.categories) ? data.categories : [];
  }

  if (datasetKey === "locations") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/locations?${qs.toString()}`);
    return Array.isArray(data.locations) ? data.locations : [];
  }

  if (datasetKey === "vendors") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/vendors?${qs.toString()}`);
    return Array.isArray(data.vendors) ? data.vendors : [];
  }

  if (datasetKey === "purchaseOrders") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/purchase-orders?${qs.toString()}`);
    return Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [];
  }

  if (datasetKey === "salesPeople") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    applyDateRangeParams(qs);
    const data = await fetchJson(`/api/sales-people?${qs.toString()}`);
    return Array.isArray(data.salesPeople) ? data.salesPeople : [];
  }

  if (datasetKey === "revenueTimeseries") {
    const fromDt = parseLocalDateInputValue(fromInput?.value) || startOfLocalDay(new Date(Date.now() - 365 * DAY_MS));
    const toDt = parseLocalDateInputValue(toInput?.value) || startOfLocalDay(new Date());
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: fromDt.toISOString(),
      to: new Date(toDt.getTime() + DAY_MS).toISOString(),
      groupBy: "location",
      bucket: "month",
    });
    const data = await fetchJson(`/api/revenue-timeseries?${qs.toString()}`);
    return Array.isArray(data.rows) ? data.rows : [];
  }

  if (datasetKey === "revenueSummary") {
    const range = getRangeOrDefault();
    const groupBy = String(revenueGroupSelect?.value || "location");
    const locationId = String(analyticsLocationSelect?.value || "").trim();
    const typeId = String(analyticsTypeSelect?.value || "").trim();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
      groupBy,
    });
    if (locationId) qs.set("pickupLocationId", locationId);
    if (typeId) qs.set("typeId", typeId);
    const data = await fetchJson(`/api/revenue-summary?${qs.toString()}`);
    return Array.isArray(data.rows) ? data.rows : [];
  }

  if (datasetKey === "salespersonSummary") {
    const range = getRangeOrDefault();
    const metric = String(salespersonMetricSelect?.value || "revenue");
    const locationId = String(analyticsLocationSelect?.value || "").trim();
    const typeId = String(analyticsTypeSelect?.value || "").trim();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
      metric,
    });
    if (locationId) qs.set("pickupLocationId", locationId);
    if (typeId) qs.set("typeId", typeId);
    const data = await fetchJson(`/api/salesperson-summary?${qs.toString()}`);
    return Array.isArray(data.rows) ? data.rows : [];
  }

  if (datasetKey === "utilizationSummary") {
    const range = getRangeOrDefault();
    const maxBasis = String(utilizationBasisSelect?.value || "rack");
    const forwardMonths = String(Math.max(1, Math.min(18, Number(utilizationForwardInput?.value) || 12)));
    const locationId = String(analyticsLocationSelect?.value || "").trim();
    const typeId = String(analyticsTypeSelect?.value || "").trim();
    const categoryId = String(analyticsCategorySelect?.value || "").trim();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
      maxBasis,
      forwardMonths,
    });
    if (locationId) qs.set("locationId", locationId);
    if (typeId) qs.set("typeId", typeId);
    if (categoryId) qs.set("categoryId", categoryId);
    const data = await fetchJson(`/api/utilization-dashboard?${qs.toString()}`);
    return data?.summary ? [data.summary] : [];
  }

  if (datasetKey === "utilizationDaily") {
    const range = getRangeOrDefault();
    const maxBasis = String(utilizationBasisSelect?.value || "rack");
    const forwardMonths = String(Math.max(1, Math.min(18, Number(utilizationForwardInput?.value) || 12)));
    const locationId = String(analyticsLocationSelect?.value || "").trim();
    const typeId = String(analyticsTypeSelect?.value || "").trim();
    const categoryId = String(analyticsCategorySelect?.value || "").trim();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
      maxBasis,
      forwardMonths,
    });
    if (locationId) qs.set("locationId", locationId);
    if (typeId) qs.set("typeId", typeId);
    if (categoryId) qs.set("categoryId", categoryId);
    const data = await fetchJson(`/api/utilization-dashboard?${qs.toString()}`);
    return Array.isArray(data?.daily) ? data.daily : [];
  }

  if (datasetKey === "utilizationForward") {
    const range = getRangeOrDefault();
    const maxBasis = String(utilizationBasisSelect?.value || "rack");
    const forwardMonths = String(Math.max(1, Math.min(18, Number(utilizationForwardInput?.value) || 12)));
    const locationId = String(analyticsLocationSelect?.value || "").trim();
    const typeId = String(analyticsTypeSelect?.value || "").trim();
    const categoryId = String(analyticsCategorySelect?.value || "").trim();
    const qs = new URLSearchParams({
      companyId: String(activeCompanyId),
      from: range.from,
      to: range.to,
      maxBasis,
      forwardMonths,
    });
    if (locationId) qs.set("locationId", locationId);
    if (typeId) qs.set("typeId", typeId);
    if (categoryId) qs.set("categoryId", categoryId);
    const data = await fetchJson(`/api/utilization-dashboard?${qs.toString()}`);
    return Array.isArray(data?.forward) ? data.forward : [];
  }

  return [];
}

function datasetLabel(key) {
  switch (key) {
    case "rentalOrders":
      return "Rental Orders";
    case "quotes":
      return "Quotes";
    case "rentalOrderLineItems":
      return "Rental Order Line Items";
    case "lineItemRevenueSummary":
      return "Line Item Revenue Summary";
    case "customers":
      return "Customers";
    case "users":
      return "Users";
    case "equipment":
      return "Stock";
    case "equipmentBundles":
      return "Equipment Bundles";
    case "types":
      return "Equipments";
    case "categories":
      return "Equipment Categories";
    case "locations":
      return "Locations";
    case "vendors":
      return "Vendors";
    case "purchaseOrders":
      return "Purchase Orders";
    case "salesPeople":
      return "Sales People";
    case "revenueTimeseries":
      return "Revenue (time series)";
    case "revenueSummary":
      return "Revenue Summary";
    case "salespersonSummary":
      return "Salesperson Summary";
    case "utilizationSummary":
      return "Utilization Summary";
    case "utilizationDaily":
      return "Utilization Daily";
    case "utilizationForward":
      return "Utilization Forward";
    default:
      return key;
  }
}

function defaultFieldsFor(key, rows) {
  if (key === "revenueTimeseries") return ["bucket", "label", "revenue"];
  if (key === "rentalOrderLineItems")
    return [
      "order_status",
      "ro_number",
      "quote_number",
      "customer_name",
      "type_name",
      "bundle_name",
      "start_at",
      "end_at",
      "rate_basis",
      "rate_amount",
      "billable_units",
      "line_amount",
      "equipment_count",
      "equipment_serials",
      "equipment_models",
      "equipment_conditions",
    ];
  if (key === "lineItemRevenueSummary") return ["label", "revenue"];
  if (key === "revenueSummary") return ["label", "revenue"];
  if (key === "salespersonSummary") return ["label", "value"];
  if (key === "utilizationSummary") return ["maxPotential", "activeRevenue", "reservedRevenue", "deadRevenue", "utilization", "discountImpact"];
  if (key === "utilizationDaily") return ["date", "rackTotal", "activeEffective", "reservedEffective", "discountImpact"];
  if (key === "utilizationForward") return ["bucket", "rackTotal", "activeEffective", "reservedEffective", "discountImpact"];
  if (key === "customers") return ["company_name", "contact_name", "email", "phone", "created_at"];
  if (key === "users") return ["name", "email", "role", "can_act_as_customer", "created_at"];
  if (key === "equipment") return ["type_name", "serial_number", "model_name", "condition", "location_name", "created_at"];
  if (key === "equipmentBundles") return ["name", "primaryTypeName", "itemCount", "dailyRate", "weeklyRate", "createdAt"];
  if (key === "types") return ["name", "category_name", "stock_count", "active_count", "created_at"];
  if (key === "categories") return ["name", "id", "created_at"];
  if (key === "locations") return ["name", "city", "region", "country", "created_at"];
  if (key === "vendors") return ["company_name", "contact_name", "email", "phone", "created_at"];
  if (key === "purchaseOrders") return ["status", "po_number", "vendor_name", "expected_possession_date", "created_at"];
  if (key === "salesPeople") return ["name", "email", "phone", "created_at"];
  if (key === "quotes" || key === "rentalOrders") return ["status", "ro_number", "quote_number", "customer_name", "start_at", "end_at"];

  const first = rows && rows[0] ? Object.keys(rows[0]) : [];
  return first.slice(0, 8);
}

function allFields(rows) {
  const keys = new Set();
  (rows || []).slice(0, 80).forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
  return Array.from(keys.values()).sort((a, b) => a.localeCompare(b));
}

function renderFieldPicker(keys) {
  if (!fieldsEl) return;
  fieldsEl.innerHTML = "";
  if (!keys.length) {
    const div = document.createElement("div");
    div.className = "hint";
    div.textContent = "Run a report to choose columns.";
    fieldsEl.appendChild(div);
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "report-fields-grid";
  keys.forEach((k) => {
    const label = document.createElement("label");
    label.className = "filter-pill";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = k;
    input.checked = selectedFields.includes(k);
    input.addEventListener("change", () => {
      const wanted = new Set(
        Array.from(wrap.querySelectorAll("input[type=\"checkbox\"]"))
          .filter((c) => c.checked)
          .map((c) => c.value)
      );
      selectedFields = Array.from(wanted.values());
      renderPreview();
      renderChart();
      exportBtn.disabled = !filteredRows.length || !selectedFields.length;
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${k}`));
    wrap.appendChild(label);
  });
  fieldsEl.appendChild(wrap);
}

function rowHaystack(row) {
  if (!row || typeof row !== "object") return "";
  return Object.values(row)
    .filter((v) => v !== null && v !== undefined)
    .map((v) => String(v))
    .join(" ")
    .toLowerCase();
}

function applySearch(rows) {
  const q = String(searchInput?.value || "").trim().toLowerCase();
  if (!q) return rows;
  const tokens = q.split(/\s+/g).filter(Boolean).slice(0, 12);
  if (!tokens.length) return rows;
  return rows.filter((r) => {
    const hay = rowHaystack(r);
    return tokens.every((t) => hay.includes(t));
  });
}

function safeCellValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function renderPreview() {
  if (!tableEl) return;
  const cols = selectedFields.length ? selectedFields : allFields(filteredRows).slice(0, 8);
  const head = document.createElement("div");
  head.className = "table-row table-header";
    head.style.gridTemplateColumns = `repeat(${Math.max(1, cols.length)}, 180px)`;
  cols.forEach((c) => {
    const span = document.createElement("span");
    span.textContent = c;
    head.appendChild(span);
  });

  tableEl.innerHTML = "";
  tableEl.appendChild(head);

  filteredRows.slice(0, 200).forEach((r) => {
    const row = document.createElement("div");
    row.className = "table-row";
      row.style.gridTemplateColumns = head.style.gridTemplateColumns;
    cols.forEach((c) => {
      const span = document.createElement("span");
      span.textContent = safeCellValue(r[c]);
      row.appendChild(span);
    });
    tableEl.appendChild(row);
  });
}

function csvEscape(value) {
  const s = safeCellValue(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/\"/g, "\"\"")}"`;
  }
  return s;
}

function exportCsv() {
  if (!filteredRows.length) return;
  if (!selectedFields.length) return;
  const cols = selectedFields;
  const lines = [];
  lines.push(cols.map(csvEscape).join(","));
  filteredRows.forEach((r) => {
    lines.push(cols.map((c) => csvEscape(r[c])).join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const key = String(datasetSelect?.value || "report");
  a.href = url;
  a.download = `rent-soft-${key}-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function toNumber(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function colorAt(i) {
  const palette = [
    [37, 99, 235],
    [16, 185, 129],
    [245, 158, 11],
    [239, 68, 68],
    [168, 85, 247],
    [14, 165, 233],
    [236, 72, 153],
    [34, 197, 94],
    [99, 102, 241],
    [234, 88, 12],
  ];
  const [r, g, b] = palette[i % palette.length];
  return { r, g, b };
}

function renderChart() {
  if (!chartCanvas) return;
  if (typeof Chart === "undefined") return;
  const xField = String(xSelect?.value || "");
  const agg = String(yAggSelect?.value || "count");
  const yField = String(yFieldSelect?.value || "");
  const topN = Math.max(1, Math.min(50, Number(topNInput?.value) || 12));

  if (!xField) {
    if (chart) chart.destroy();
    chart = null;
    return;
  }
  if ((agg === "sum" || agg === "avg") && !yField) return;

  const map = new Map();
  filteredRows.forEach((r) => {
    const key = safeCellValue(r[xField]) || "--";
    if (!map.has(key)) map.set(key, { count: 0, sum: 0, sumCount: 0 });
    const cur = map.get(key);
    cur.count += 1;
    if (agg === "sum" || agg === "avg") {
      const n = toNumber(r[yField]);
      if (n !== null) {
        cur.sum += n;
        cur.sumCount += 1;
      }
    }
  });

  const items = Array.from(map.entries()).map(([label, v]) => {
    const value = agg === "count" ? v.count : agg === "sum" ? v.sum : v.sumCount ? v.sum / v.sumCount : 0;
    return { label, value };
  });
  items.sort((a, b) => b.value - a.value);
  const sliced = items.slice(0, topN);
  const labels = sliced.map((x) => x.label);
  const values = sliced.map((x) => x.value);

  const type = String(chartTypeSelect?.value || "bar");
  const colors = labels.map((_, i) => {
    const c = colorAt(i);
    return `rgba(${c.r}, ${c.g}, ${c.b}, 0.65)`;
  });

  if (chart) chart.destroy();
  chart = new Chart(chartCanvas.getContext("2d"), {
    type,
    data: {
      labels,
      datasets: [
        {
          label: agg === "count" ? "Count" : agg === "sum" ? `Sum(${yField})` : `Avg(${yField})`,
          data: values,
          backgroundColor: type === "line" ? "rgba(37, 99, 235, 0.18)" : colors,
          borderColor: type === "line" ? "rgba(37, 99, 235, 0.8)" : colors.map((c) => c.replace("0.65", "0.9")),
          borderWidth: 1,
          tension: 0.25,
          fill: type === "line",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: type === "pie" || type === "doughnut", position: "bottom" } },
      scales:
        type === "pie" || type === "doughnut"
          ? {}
          : {
              x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: true },
            },
    },
  });
}

function rebuildChartFieldOptions() {
  if (!xSelect || !yFieldSelect) return;
  const fields = allFields(filteredRows);
  xSelect.innerHTML = "";
  yFieldSelect.innerHTML = "";

  fields.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    xSelect.appendChild(opt);
  });

  const numericFields = fields.filter((f) => {
    const sample = filteredRows.slice(0, 50).map((r) => toNumber(r?.[f])).find((v) => v !== null);
    return sample !== undefined && sample !== null;
  });
  numericFields.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    yFieldSelect.appendChild(opt);
  });

  const datasetKey = String(datasetSelect?.value || "");
  if (datasetKey === "revenueTimeseries") {
    if (fields.includes("bucket")) xSelect.value = "bucket";
    if (numericFields.includes("revenue")) yFieldSelect.value = "revenue";
    yAggSelect.value = "sum";
  } else {
    xSelect.value = fields[0] || "";
    if (numericFields.length) yFieldSelect.value = numericFields[0];
  }

  const needsYField = yAggSelect.value === "sum" || yAggSelect.value === "avg";
  if (yFieldSelect) yFieldSelect.disabled = !needsYField;
  renderChart();
}

function renderStatusVisibility() {
  const key = String(datasetSelect?.value || "");
  if (statusesWrap) statusesWrap.style.display = supportsStatuses(key) ? "block" : "none";
}

function renderAnalyticsVisibility() {
  const key = String(datasetSelect?.value || "");
  if (!analyticsWrap) return;
  const show = supportsAnalyticsOptions(key);
  analyticsWrap.style.display = show ? "block" : "none";
  if (show) {
    loadAnalyticsOptions().catch(() => null);
  }
  if (analyticsRevenueRow) analyticsRevenueRow.style.display = key === "revenueSummary" ? "grid" : "none";
  if (analyticsSalespersonRow) analyticsSalespersonRow.style.display = key === "salespersonSummary" ? "grid" : "none";
  if (lineItemGroupRow) {
    lineItemGroupRow.style.display = key === "lineItemRevenueSummary" ? "grid" : "none";
  }
  if (analyticsFiltersRow) analyticsFiltersRow.style.display = supportsAnalyticsFilters(key) ? "grid" : "none";
  if (analyticsUtilizationRow) analyticsUtilizationRow.style.display = supportsUtilizationFilters(key) ? "grid" : "none";
  if (analyticsCategoryRow) analyticsCategoryRow.style.display = supportsUtilizationFilters(key) ? "grid" : "none";
  if (analyticsLocationSelect) analyticsLocationSelect.disabled = !supportsAnalyticsFilters(key);
  if (analyticsTypeSelect) analyticsTypeSelect.disabled = !supportsAnalyticsFilters(key);
  if (analyticsCategorySelect) analyticsCategorySelect.disabled = !supportsUtilizationFilters(key);
}

function renderRangeVisibility() {
  const key = String(datasetSelect?.value || "");
  if (!rangeRow) return;
  rangeRow.style.display = hasDateRange(key) ? "grid" : "none";
}

function renderDateFieldVisibility() {
  const key = String(datasetSelect?.value || "");
  if (!dateFieldRow || !dateFieldSelect) return;
  const options = dateFieldOptionsFor(key);
  if (!options.length) {
    dateFieldRow.style.display = "none";
    dateFieldSelect.innerHTML = "";
    return;
  }

  dateFieldSelect.innerHTML = "";
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    dateFieldSelect.appendChild(option);
  });
  dateFieldSelect.value = options[0]?.value || "";
  dateFieldRow.style.display = options.length > 1 ? "grid" : "none";
}

function applyDefaultStatusesFor(datasetKey) {
  if (!supportsStatuses(datasetKey)) return;
  if (!statusCheckboxes.length) return;
  if (datasetKey === "quotes") {
    statusCheckboxes.forEach((c) => (c.checked = c.value === "quote"));
    return;
  }
  if (datasetKey === "rentalOrders") {
    statusCheckboxes.forEach((c) => (c.checked = c.value === "reservation" || c.value === "ordered"));
  }
}

async function runReport() {
  setMeta("");
  exportBtn.disabled = true;
  const key = String(datasetSelect?.value || "").trim();
  if (!key) {
    previewTitle.textContent = "Preview";
    companyMeta.textContent = "Select a dataset to run a report.";
    rawRows = [];
    filteredRows = [];
    selectedFields = [];
    renderFieldPicker([]);
    if (countPill) countPill.textContent = "0 rows";
    if (tableEl) tableEl.innerHTML = "";
    if (chart) chart.destroy();
    chart = null;
    return;
  }
  previewTitle.textContent = `Preview: ${datasetLabel(key)}`;
  companyMeta.textContent = "Loading…";
  try {
    rawRows = await loadDataset(key);
    filteredRows = applySearch(rawRows);

    const keys = allFields(filteredRows);
    selectedFields = defaultFieldsFor(key, filteredRows).filter((f) => keys.includes(f));
    if (!selectedFields.length) selectedFields = keys.slice(0, 8);

    renderFieldPicker(keys);
    rebuildChartFieldOptions();
    renderPreview();

    if (countPill) countPill.textContent = fmtCount(filteredRows.length, "row");
    exportBtn.disabled = !filteredRows.length || !selectedFields.length;
    companyMeta.textContent = `Ready. ${fmtCount(filteredRows.length, "row")}.`;
  } catch (err) {
    companyMeta.textContent = err.message;
    rawRows = [];
    filteredRows = [];
    selectedFields = [];
    renderFieldPicker([]);
    if (countPill) countPill.textContent = "0 rows";
    if (tableEl) tableEl.innerHTML = "";
    if (chart) chart.destroy();
    chart = null;
  }
}

function onSearchChange() {
  filteredRows = applySearch(rawRows);
  renderPreview();
  rebuildChartFieldOptions();
  if (countPill) countPill.textContent = fmtCount(filteredRows.length, "row");
  exportBtn.disabled = !filteredRows.length || !selectedFields.length;
}

function init() {
  if (activeCompanyId) {
    window.RentSoft?.setCompanyId?.(activeCompanyId);
    companyMeta.textContent = `Using company #${activeCompanyId}`;
  } else {
    companyMeta.textContent = "Log in to view reports.";
  }

  const now = new Date();
  if (fromInput) fromInput.value = toLocalDateInputValue(startOfLocalDay(new Date(now.getTime() - 365 * DAY_MS)));
  if (toInput) toInput.value = toLocalDateInputValue(startOfLocalDay(now));

  renderStatusVisibility();
  renderAnalyticsVisibility();
  renderRangeVisibility();
  renderDateFieldVisibility();
  renderFieldPicker([]);
  setMeta("Choose a dataset and click Run.");

  datasetSelect?.addEventListener("change", () => {
    renderStatusVisibility();
    renderAnalyticsVisibility();
    renderRangeVisibility();
    renderDateFieldVisibility();
    applyDefaultStatusesFor(String(datasetSelect?.value || ""));
    setMeta("Choose a dataset and click Run.");
  });
  statusCheckboxes.forEach((c) => c.addEventListener("change", () => runReport().catch(() => null)));
  runBtn?.addEventListener("click", () => runReport().catch(() => null));
  searchInput?.addEventListener("input", () => onSearchChange());
  dateFieldSelect?.addEventListener("change", () => runReport().catch(() => null));
  [revenueGroupSelect, salespersonMetricSelect, utilizationBasisSelect, utilizationForwardInput]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("change", () => runReport().catch(() => null)));
  lineItemGroupSelect?.addEventListener("change", () => runReport().catch(() => null));
  [analyticsLocationSelect, analyticsTypeSelect, analyticsCategorySelect]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("change", () => runReport().catch(() => null)));
  exportBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    exportCsv();
  });

  [chartTypeSelect, xSelect, yAggSelect, yFieldSelect, topNInput]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("change", () => renderChart()));

  yAggSelect?.addEventListener("change", () => {
    const needs = yAggSelect.value === "sum" || yAggSelect.value === "avg";
    if (yFieldSelect) yFieldSelect.disabled = !needs;
    renderChart();
  });
}

init();
