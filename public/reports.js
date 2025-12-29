const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");

const datasetSelect = document.getElementById("reports-dataset");
const searchInput = document.getElementById("reports-search");
const fromInput = document.getElementById("reports-from");
const toInput = document.getElementById("reports-to");
const rangeRow = document.getElementById("reports-range-row");
const statusesWrap = document.getElementById("reports-statuses");
const statusCheckboxes = Array.from(statusesWrap?.querySelectorAll?.("input[type=\"checkbox\"]") || []);

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
  return datasetKey === "revenueTimeseries";
}

function supportsStatuses(datasetKey) {
  return datasetKey === "rentalOrders" || datasetKey === "quotes";
}

async function loadDataset(datasetKey) {
  if (!activeCompanyId) throw new Error("Log in to continue.");
  const statuses = supportsStatuses(datasetKey) ? selectedStatusesParam() : "";

  if (datasetKey === "rentalOrders") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    if (statuses) qs.set("statuses", statuses);
    const data = await fetchJson(`/api/rental-orders?${qs.toString()}`);
    return Array.isArray(data.orders) ? data.orders : [];
  }

  if (datasetKey === "quotes") {
    const qs = new URLSearchParams({ companyId: String(activeCompanyId) });
    if (statuses) qs.set("statuses", statuses);
    const data = await fetchJson(`/api/rental-quotes?${qs.toString()}`);
    return Array.isArray(data.orders) ? data.orders : [];
  }

  if (datasetKey === "customers") {
    const data = await fetchJson(`/api/customers?companyId=${activeCompanyId}`);
    return Array.isArray(data.customers) ? data.customers : [];
  }

  if (datasetKey === "equipment") {
    const data = await fetchJson(`/api/equipment?companyId=${activeCompanyId}`);
    return Array.isArray(data.equipment) ? data.equipment : [];
  }

  if (datasetKey === "types") {
    const data = await fetchJson(`/api/equipment-types?companyId=${activeCompanyId}`);
    return Array.isArray(data.types) ? data.types : [];
  }

  if (datasetKey === "locations") {
    const data = await fetchJson(`/api/locations?companyId=${activeCompanyId}`);
    return Array.isArray(data.locations) ? data.locations : [];
  }

  if (datasetKey === "salesPeople") {
    const data = await fetchJson(`/api/sales-people?companyId=${activeCompanyId}`);
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

  return [];
}

function datasetLabel(key) {
  switch (key) {
    case "rentalOrders":
      return "Rental Orders";
    case "quotes":
      return "Quotes";
    case "customers":
      return "Customers";
    case "equipment":
      return "Stock";
    case "types":
      return "Equipments";
    case "locations":
      return "Locations";
    case "salesPeople":
      return "Sales People";
    case "revenueTimeseries":
      return "Revenue (time series)";
    default:
      return key;
  }
}

function defaultFieldsFor(key, rows) {
  if (key === "revenueTimeseries") return ["bucket", "label", "revenue"];
  if (key === "customers") return ["company_name", "contact_name", "contact_email", "phone"];
  if (key === "equipment") return ["type_name", "serial_number", "model_name", "condition", "location_name"];
  if (key === "types") return ["name", "category_name", "stock_count", "active_count"];
  if (key === "locations") return ["name", "city", "region", "country"];
  if (key === "salesPeople") return ["name", "email", "phone"];
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
  head.style.gridTemplateColumns = `repeat(${Math.max(1, cols.length)}, minmax(150px, 1fr))`;
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

function renderRangeVisibility() {
  const key = String(datasetSelect?.value || "");
  if (!rangeRow) return;
  rangeRow.style.display = hasDateRange(key) ? "grid" : "none";
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
  const key = String(datasetSelect?.value || "rentalOrders");
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
  renderRangeVisibility();
  renderFieldPicker([]);
  setMeta("Choose a dataset and click Run.");

  datasetSelect?.addEventListener("change", () => {
    renderStatusVisibility();
    renderRangeVisibility();
    applyDefaultStatusesFor(String(datasetSelect?.value || ""));
    runReport().catch(() => null);
  });
  statusCheckboxes.forEach((c) => c.addEventListener("change", () => runReport().catch(() => null)));
  runBtn?.addEventListener("click", () => runReport().catch(() => null));
  searchInput?.addEventListener("input", () => onSearchChange());
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
