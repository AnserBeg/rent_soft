const params = new URLSearchParams(window.location.search);
const initialCompanyId = params.get("companyId") || window.RentSoft?.getCompanyId?.();

const companyMeta = document.getElementById("company-meta");

const rangeStartInput = document.getElementById("range-start");
const rangeDaysSelect = document.getElementById("range-days");
const groupBySelect = document.getElementById("group-by");
const todayBtn = document.getElementById("today");

const statusReservation = document.getElementById("status-reservation");
const statusRequested = document.getElementById("status-requested");
const statusOrdered = document.getElementById("status-ordered");
const statusReceived = document.getElementById("status-received");
const statusClosed = document.getElementById("status-closed");
const statusQuote = document.getElementById("status-quote");

const timelineDaysEl = document.getElementById("timeline-days");
const timelineLeftEl = document.getElementById("timeline-left");
const timelineRowsEl = document.getElementById("timeline-rows");
const scrollHead = document.getElementById("timeline-scroll-head");
const scrollBody = document.getElementById("timeline-scroll-body");

const revGroup = document.getElementById("rev-group");
const revLocation = document.getElementById("rev-location");
const revType = document.getElementById("rev-type");
const revCanvas = document.getElementById("rev-chart");
let revenueChart = null;

const revTsGroup = document.getElementById("rev-ts-group");
const revTsBucket = document.getElementById("rev-ts-bucket");
const revTsStacked = document.getElementById("rev-ts-stacked");
const revTsCanvas = document.getElementById("rev-ts-chart");
let revenueTsChart = null;

const spMetric = document.getElementById("sp-metric");
const spDonutCanvas = document.getElementById("sp-donut");
let salespersonDonutChart = null;

const utilPeriodToggle = document.getElementById("util-period-toggle");
const utilStartInput = document.getElementById("util-start");
const utilEndInput = document.getElementById("util-end");
const utilYard = document.getElementById("util-yard");
const utilCategory = document.getElementById("util-category");
const utilType = document.getElementById("util-type");
const utilExpectedToggle = document.getElementById("util-expected");
const utilTodayBtn = document.getElementById("util-today");

const utilKpiMax = document.getElementById("util-kpi-max");
const utilKpiActive = document.getElementById("util-kpi-active");
const utilKpiReserved = document.getElementById("util-kpi-reserved");
const utilKpiDead = document.getElementById("util-kpi-dead");
const utilKpiUtilization = document.getElementById("util-kpi-utilization");
const utilKpiDiscount = document.getElementById("util-kpi-discount");

const utilHeroCanvas = document.getElementById("util-hero-chart");
const utilTrendCanvas = document.getElementById("util-trend-chart");
const utilForwardCanvas = document.getElementById("util-forward-chart");
let utilHeroChart = null;
let utilTrendChart = null;
let utilForwardChart = null;

const tooltip = document.getElementById("timeline-tooltip");
let timelineMenuEl = null;
const conflictModal = document.getElementById("conflict-modal");
const closeConflictModalBtn = document.getElementById("close-conflict-modal");
const conflictBody = document.getElementById("conflict-body");

const benchSearchInput = document.getElementById("bench-search");
const benchNewRoBtn = document.getElementById("bench-new-ro");
const benchEnding72Btn = document.getElementById("bench-ending-72h");

const benchViewToggle = document.getElementById("bench-view-toggle");
const benchViewTimelineBtn = document.getElementById("bench-view-timeline-btn");
const benchViewStagesBtn = document.getElementById("bench-view-stages-btn");
const benchViewTimeline = document.getElementById("bench-view-timeline");
const benchViewStages = document.getElementById("bench-view-stages");

const benchStageRequestedTable = document.getElementById("bench-stage-requested-table");
const benchStageQuoteTable = document.getElementById("bench-stage-quote-table");
const benchStageReservationTable = document.getElementById("bench-stage-reservation-table");
const benchStageOrderedTable = document.getElementById("bench-stage-ordered-table");
const benchStageReceivedTable = document.getElementById("bench-stage-received-table");
const benchStageClosedTable = document.getElementById("bench-stage-closed-table");

const benchStageRequestedCount = document.getElementById("bench-stage-requested-count");
const benchStageQuoteCount = document.getElementById("bench-stage-quote-count");
const benchStageReservationCount = document.getElementById("bench-stage-reservation-count");
const benchStageOrderedCount = document.getElementById("bench-stage-ordered-count");
const benchStageReceivedCount = document.getElementById("bench-stage-received-count");
const benchStageClosedCount = document.getElementById("bench-stage-closed-count");

const benchKpiAssignments = document.getElementById("bench-kpi-assignments");
const benchKpiActive = document.getElementById("bench-kpi-active");
const benchKpiStarting = document.getElementById("bench-kpi-starting");
const benchKpiEnding = document.getElementById("bench-kpi-ending");
const benchKpiOverdue = document.getElementById("bench-kpi-overdue");
const benchKpiReservations = document.getElementById("bench-kpi-reservations");

let activeCompanyId = initialCompanyId ? Number(initialCompanyId) : null;
let rangeStartDate = startOfLocalDay(new Date());
let rangeDays = 30;
let utilPeriod = "month";
let rawEquipment = [];
let rawAssignments = [];
let equipmentLabelById = new Map();
let equipmentById = new Map();

const DAY_MS = 24 * 60 * 60 * 1000;
const COL_W = 44;
const BAR_H = 18;
const BAR_GAP = 6;
const DEFAULT_ENDING_DAYS = 2;
const ENDING_72H_DAYS = 3;
const UTIL_COLORS = {
  active: "rgba(34, 197, 94, 0.7)",
  reserved: "rgba(37, 99, 235, 0.65)",
  dead: "rgba(148, 163, 184, 0.55)",
  max: "rgba(15, 23, 42, 0.6)",
};
let focusEndingOnly = false;
let endingDays = DEFAULT_ENDING_DAYS;

const BENCH_VIEW_STORAGE_KEY = "rentsoft.workbench.view";
let benchActiveView = null; // "timeline" | "stages" | null
let benchOrdersCache = [];
let benchOrdersCacheKey = "";

function hasTimelineUI() {
  return Boolean(timelineDaysEl && timelineLeftEl && timelineRowsEl && scrollHead && scrollBody);
}

function hasBenchSummaryUI() {
  return Boolean(
    benchSearchInput ||
      benchNewRoBtn ||
      benchKpiAssignments ||
      benchKpiActive ||
      benchKpiStarting ||
      benchKpiEnding ||
      benchKpiOverdue ||
      benchKpiReservations
  );
}

function hasBenchStagesUI() {
  return Boolean(
    benchViewToggle &&
      benchViewTimeline &&
      benchViewStages &&
      benchViewTimelineBtn &&
      benchViewStagesBtn &&
      benchStageRequestedTable &&
      benchStageQuoteTable &&
      benchStageReservationTable &&
      benchStageOrderedTable &&
      benchStageReceivedTable &&
      benchStageClosedTable
  );
}

function hasRevenueUI() {
  return Boolean(revCanvas);
}

function hasRevenueTimeSeriesUI() {
  return Boolean(revTsCanvas);
}

function hasSalespersonDonutUI() {
  return Boolean(spDonutCanvas);
}

function hasUtilizationUI() {
  return Boolean(utilHeroCanvas && utilTrendCanvas && utilForwardCanvas);
}

function fmtMoney(n) {
  const x = Number(n || 0);
  return `$${x.toFixed(2)}`;
}

function fmtPercent(v) {
  const x = Number(v || 0);
  if (!Number.isFinite(x)) return "--";
  return `${(x * 100).toFixed(1)}%`;
}

function seriesColor(i) {
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
  const rgb = palette[i % palette.length];
  return { r: rgb[0], g: rgb[1], b: rgb[2] };
}

function bucketKey(d, bucket) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  const b = String(bucket || "month").toLowerCase();
  if (b === "month") return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return dt.toISOString().slice(0, 10);
}

function startOfBucket(d, bucket) {
  const b = String(bucket || "month").toLowerCase();
  const x = startOfLocalDay(d);
  if (b === "month") return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
  if (b === "week") {
    const day = x.getDay(); // 0..6 (Sun..Sat)
    const offset = (day + 6) % 7; // Monday as week start
    return new Date(x.getTime() - offset * DAY_MS);
  }
  return x; // day
}

function addBucket(d, bucket, n = 1) {
  const b = String(bucket || "month").toLowerCase();
  const x = new Date(d);
  if (b === "month") return new Date(x.getFullYear(), x.getMonth() + n, 1, 0, 0, 0, 0);
  if (b === "week") return new Date(x.getTime() + 7 * n * DAY_MS);
  return new Date(x.getTime() + n * DAY_MS);
}

function buildBucketKeys(from, to, bucket) {
  const keys = [];
  let cur = startOfBucket(from, bucket);
  const end = new Date(to);
  while (cur < end && keys.length < 2000) {
    keys.push(bucketKey(cur, bucket));
    cur = addBucket(cur, bucket, 1);
  }
  return keys;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function currentSearchTokens() {
  const q = String(benchSearchInput?.value || "")
    .trim()
    .toLowerCase();
  if (!q) return [];
  return q.split(/\s+/g).filter(Boolean).slice(0, 12);
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

function fmtDateTime(v) {
  if (!v) return "--";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString();
}

function statusLabel(status) {
  const s = String(status || "").toLowerCase();
  switch (s) {
    case "quote":
      return "Quote";
    case "quote_rejected":
      return "Rejected";
    case "requested":
      return "Requested";
    case "request_rejected":
      return "Request rejected";
    case "reservation":
      return "Reservation";
    case "ordered":
      return "Ordered";
    case "received":
      return "Received";
    case "closed":
      return "Closed";
    default:
      return s || "--";
  }
}

function isRejectedStatus(status) {
  return String(status || "").toLowerCase().includes("reject");
}

function docNumber(row) {
  const ro = row.ro_number || row.roNumber || null;
  const qo = row.quote_number || row.quoteNumber || null;
  if (ro && qo) return `${ro} / ${qo}`;
  return ro || qo || `#${row.order_id || row.id || ""}`;
}

function selectedStatuses() {
  const statuses = [];
  if (statusRequested?.checked) statuses.push("requested");
  if (statusReservation?.checked) statuses.push("reservation");
  if (statusOrdered?.checked) statuses.push("ordered");
  if (statusReceived?.checked) statuses.push("received");
  if (statusClosed?.checked) statuses.push("closed");
  if (statusQuote?.checked) statuses.push("quote");
  return [...new Set(statuses)];
}

function assignmentHaystack(a) {
  const equip = equipmentLabelById.get(String(a.equipment_id)) || "";
  const parts = [
    docNumber(a),
    a.external_contract_number,
    a.customer_po,
    a.customer_name,
    a.pickup_location_name,
    a.type_name,
    equip,
  ];
  return parts
    .filter((p) => p !== null && p !== undefined)
    .map((p) => String(p))
    .join(" ")
    .toLowerCase();
}

function matchesSearchTokens(a, tokens) {
  if (!tokens || !tokens.length) return true;
  const hay = assignmentHaystack(a);
  return tokens.every((t) => hay.includes(t));
}

function currentAssignments() {
  const focus = Boolean(focusEndingOnly);
  const activeEndingDays = Math.max(1, Number(endingDays) || DEFAULT_ENDING_DAYS);

  const now = Date.now();
  const focusCutoff = now + activeEndingDays * DAY_MS;
  const tokens = currentSearchTokens();

  return rawAssignments
    .filter((a) => {
      if (!focus) return true;
      const s = String(a.status || "").toLowerCase();
      const endMs = Date.parse(a.end_at);
      if (s !== "ordered") return false;
      if (!Number.isFinite(endMs)) return false;
      return endMs < now || endMs <= focusCutoff;
    })
    .filter((a) => matchesSearchTokens(a, tokens));
}

function barStateFor(assignment, endingDays) {
  const now = Date.now();
  const startMs = Date.parse(assignment.start_at);
  const endMs = Date.parse(assignment.end_at);
  const s = String(assignment.status || "").toLowerCase();
  const endingSoonMs = Math.max(1, Number(endingDays) || 2) * DAY_MS;
  const isOverdue = s === "ordered" && Number.isFinite(endMs) && endMs < now;
  const isEndingSoon = s === "ordered" && Number.isFinite(endMs) && endMs >= now && endMs <= now + endingSoonMs;
  const isActive = s === "ordered" && Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && now <= endMs;
  const isReserved = s === "reservation" || s === "requested";
  const base =
    isOverdue ? "overdue" : isEndingSoon ? "ending" : isActive ? "active" : isReserved ? "reserved" : "other";
  const endTodayOrEarlier = Number.isFinite(endMs) && endMs <= endOfLocalTodayMs();
  const within48h = Number.isFinite(endMs) && endMs >= now && endMs <= now + 48 * 60 * 60 * 1000;
  const bell = s === "ordered" && within48h;
  return {
    base,
    statusKey: statusKeyFor(s),
    endTodayOrEarlier,
    isOverdue,
    isEndingSoon,
    isActive,
    bell,
  };
}

function statusKeyFor(status) {
  const s = String(status || "").toLowerCase();
  if (s === "requested") return "requested";
  if (s === "reservation") return "reservation";
  if (s === "ordered") return "ordered";
  if (s === "received") return "received";
  if (s === "closed") return "closed";
  if (s === "quote") return "quote";
  return "other";
}

function endOfLocalTodayMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function computeLanes(bars) {
  const sorted = [...bars].sort((a, b) => a.startMs - b.startMs);
  const lanes = [];
  sorted.forEach((b) => {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      const last = lanes[i][lanes[i].length - 1];
      if (b.startMs >= last.endMs) {
        lanes[i].push(b);
        b.lane = i;
        placed = true;
        break;
      }
    }
    if (!placed) {
      b.lane = lanes.length;
      lanes.push([b]);
    }
  });
  return { bars: sorted, laneCount: lanes.length };
}

async function loadTimeline() {
  if (!activeCompanyId) return;
  if (!hasTimelineUI()) return;
  const statuses = selectedStatuses();
  const from = rangeStartDate.toISOString();
  const to = new Date(rangeStartDate.getTime() + rangeDays * DAY_MS).toISOString();
  const statusesParam = statuses.length ? `&statuses=${encodeURIComponent(statuses.join(","))}` : "";

  companyMeta.textContent = "Loading…";
  try {
    await loadTimelineData(from, to, statusesParam);
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function loadTimelineData(from, to, statusesParam) {
  const res = await fetch(
    `/api/rental-orders/timeline?companyId=${activeCompanyId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${statusesParam}`
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load timeline");
  rawEquipment = data.equipment || [];
  rawAssignments = (data.assignments || []).filter((a) => !isRejectedStatus(a.status));
  equipmentLabelById = new Map((rawEquipment || []).map((e) => [String(e.id), equipmentLabel(e)]));
  equipmentById = new Map((rawEquipment || []).map((e) => [String(e.id), e]));
  companyMeta.textContent = `Loaded ${rawAssignments.length} assignments.`;
  renderTimeline();
  renderBenchSummary();
}

function safeStorageGet(key) {
  try {
    return window.localStorage?.getItem?.(key) ?? null;
  } catch (_) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage?.setItem?.(key, value);
  } catch (_) {}
}

function currentBenchViewPref() {
  const v = String(safeStorageGet(BENCH_VIEW_STORAGE_KEY) || "").toLowerCase();
  return v === "stages" ? "stages" : "timeline";
}

function setBenchView(view, { persist = true, load = true } = {}) {
  if (!hasBenchStagesUI()) return;
  const next = view === "stages" ? "stages" : "timeline";
  benchActiveView = next;
  if (persist) safeStorageSet(BENCH_VIEW_STORAGE_KEY, next);

  if (benchViewTimeline) benchViewTimeline.style.display = next === "timeline" ? "" : "none";
  if (benchViewStages) benchViewStages.style.display = next === "stages" ? "" : "none";
  benchViewTimelineBtn?.classList.toggle("active", next === "timeline");
  benchViewStagesBtn?.classList.toggle("active", next === "stages");

  if (next !== "timeline") hideTooltip();

  if (load && next === "stages") {
    loadBenchStages();
  }
}

function setStageCount(el, n) {
  if (!el) return;
  const count = Number(n || 0);
  el.textContent = Number.isFinite(count) && count > 0 ? `(${count})` : "";
}

function fmtMoneyMaybe(v) {
  if (v === null || v === undefined) return "--";
  const n = Number(v);
  if (!Number.isFinite(n)) return "--";
  return `$${n.toFixed(2)}`;
}

function poOrLegacy(row) {
  const legacy = row.external_contract_number || row.externalContractNumber || null;
  return row.customer_po || row.customerPo || legacy || "--";
}

function orderHaystack(row) {
  return [
    docNumber(row),
    row.status,
    row.customer_name,
    poOrLegacy(row),
    row.salesperson_name,
    row.pickup_location_name,
    row.start_at,
    row.end_at,
  ]
    .filter((p) => p !== null && p !== undefined)
    .map((p) => String(p))
    .join(" ")
    .toLowerCase();
}

function matchesOrderTokens(row, tokens) {
  if (!tokens || !tokens.length) return true;
  const hay = orderHaystack(row);
  return tokens.every((t) => hay.includes(t));
}

function renderBenchStageTable(tableEl, rows) {
  if (!tableEl) return;
  if (!rows || !rows.length) {
    tableEl.innerHTML = `<div class="bench-stage-empty">No items.</div>`;
    return;
  }

  tableEl.innerHTML = `
    <div class="table-row table-header">
      <span>Doc #</span>
      <span>Status</span>
      <span>Customer</span>
      <span>PO / Legacy #</span>
      <span>Start</span>
      <span>End</span>
      <span>Total</span>
      <span></span>
    </div>`;

  rows.forEach((row) => {
    const div = document.createElement("div");
    div.className = "table-row";
    div.dataset.id = String(row.id || "");
    div.innerHTML = `
      <span>${docNumber(row)}</span>
      <span>${statusLabel(row.status)}</span>
      <span>${row.customer_name || "--"}</span>
      <span>${poOrLegacy(row)}</span>
      <span>${fmtDateTime(row.start_at)}</span>
      <span>${fmtDateTime(row.end_at)}</span>
      <span>${fmtMoneyMaybe(row.total ?? row.order_total ?? null)}</span>
      <span style="justify-self:end;">
        <button class="ghost small" type="button" data-open>Open</button>
      </span>
    `;
    tableEl.appendChild(div);
  });
}

function renderBenchStages() {
  if (!hasBenchStagesUI()) return;
  const tokens = currentSearchTokens();
  const filtered = (benchOrdersCache || [])
    .filter((r) => !isRejectedStatus(r.status))
    .filter((r) => matchesOrderTokens(r, tokens));

  const stageRows = (statuses) =>
    filtered.filter((r) => statuses.includes(String(r.status || "").toLowerCase()));

  const requestedRows = stageRows(["requested"]);
  const quoteRows = stageRows(["quote"]);
  const reservationRows = stageRows(["reservation"]);
  const orderedRows = stageRows(["ordered"]);
  const receivedRows = stageRows(["received"]);
  const closedRows = stageRows(["closed"]);

  setStageCount(benchStageRequestedCount, requestedRows.length);
  setStageCount(benchStageQuoteCount, quoteRows.length);
  setStageCount(benchStageReservationCount, reservationRows.length);
  setStageCount(benchStageOrderedCount, orderedRows.length);
  setStageCount(benchStageReceivedCount, receivedRows.length);
  setStageCount(benchStageClosedCount, closedRows.length);

  renderBenchStageTable(benchStageRequestedTable, requestedRows);
  renderBenchStageTable(benchStageQuoteTable, quoteRows);
  renderBenchStageTable(benchStageReservationTable, reservationRows);
  renderBenchStageTable(benchStageOrderedTable, orderedRows);
  renderBenchStageTable(benchStageReceivedTable, receivedRows);
  renderBenchStageTable(benchStageClosedTable, closedRows);
}

async function loadBenchStages() {
  if (!hasBenchStagesUI()) return;
  if (!activeCompanyId) return;

  const statuses = selectedStatuses();
  const from = rangeStartDate.toISOString();
  const to = new Date(rangeStartDate.getTime() + rangeDays * DAY_MS).toISOString();
  const statusesKey = [...statuses].sort().join(",");
  const nextKey = `${activeCompanyId}|${from}|${to}|${statusesKey}`;

  if (nextKey === benchOrdersCacheKey && Array.isArray(benchOrdersCache)) {
    renderBenchStages();
    return;
  }

  [benchStageRequestedTable, benchStageQuoteTable, benchStageReservationTable, benchStageOrderedTable, benchStageReceivedTable, benchStageClosedTable]
    .filter(Boolean)
    .forEach((el) => (el.innerHTML = `<div class="bench-stage-empty">Loadingƒ?İ</div>`));

  const statusesParam = statuses.length ? `&statuses=${encodeURIComponent(statuses.join(","))}` : "";
  try {
    const res = await fetch(
      `/api/rental-orders/calendar?companyId=${activeCompanyId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${statusesParam}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load stage view.");
    benchOrdersCache = data.orders || [];
    benchOrdersCacheKey = nextKey;
    renderBenchStages();
  } catch (err) {
    companyMeta.textContent = err.message;
  }
}

async function ensureRevenueLookups() {
  if (!activeCompanyId) return;
  if (!revLocation || !revType) return;
  const [locRes, typeRes] = await Promise.all([
    fetch(`/api/locations?companyId=${activeCompanyId}`),
    fetch(`/api/equipment-types?companyId=${activeCompanyId}`),
  ]);
  const locData = await locRes.json().catch(() => ({}));
  const typeData = await typeRes.json().catch(() => ({}));
  if (locRes.ok) {
    const current = revLocation.value;
    revLocation.innerHTML = `<option value="">All</option>`;
    (locData.locations || []).forEach((l) => {
      const opt = document.createElement("option");
      opt.value = String(l.id);
      opt.textContent = l.name;
      revLocation.appendChild(opt);
    });
    revLocation.value = current;
  }
  if (typeRes.ok) {
    const current = revType.value;
    revType.innerHTML = `<option value="">All</option>`;
    (typeData.types || []).forEach((t) => {
      const opt = document.createElement("option");
      opt.value = String(t.id);
      opt.textContent = t.name;
      revType.appendChild(opt);
    });
    revType.value = current;
  }
}

async function loadRevenue() {
  if (!activeCompanyId || !revCanvas) return;
  if (typeof Chart === "undefined") return;
  await ensureRevenueLookups().catch(() => null);

  const group = String(revGroup?.value || "location");
  const pickupLocationId = revLocation?.value ? Number(revLocation.value) : null;
  const typeId = revType?.value ? Number(revType.value) : null;

  const from = rangeStartDate.toISOString();
  const to = new Date(rangeStartDate.getTime() + rangeDays * DAY_MS).toISOString();

  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    from,
    to,
    groupBy: group,
  });
  if (pickupLocationId) qs.set("pickupLocationId", String(pickupLocationId));
  if (typeId) qs.set("typeId", String(typeId));

  const res = await fetch(`/api/revenue-summary?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load revenue");
  const rows = Array.isArray(data.rows) ? data.rows : [];

  const labels = rows.map((r) => r.label || "--");
  const values = rows.map((r) => Number(r.revenue || 0));

  if (revenueChart) revenueChart.destroy();
  revenueChart = new Chart(revCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Revenue",
          data: values,
          backgroundColor: "rgba(37, 99, 235, 0.25)",
          borderColor: "rgba(37, 99, 235, 0.6)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `$${Number(ctx.raw || 0).toFixed(2)}` } } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
        x: { grid: { display: false } },
      },
    },
  });
}

async function loadRevenueTimeSeries() {
  if (!activeCompanyId || !hasRevenueTimeSeriesUI()) return;
  if (typeof Chart === "undefined") return;

  const bucket = String(revTsBucket?.value || "month");
  const groupBy = String(revTsGroup?.value || "location");
  const stacked = Boolean(revTsStacked?.checked);

  const from = rangeStartDate.toISOString();
  const to = new Date(rangeStartDate.getTime() + rangeDays * DAY_MS).toISOString();

  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    from,
    to,
    groupBy,
    bucket,
  });
  if (revLocation?.value) qs.set("pickupLocationId", String(Number(revLocation.value)));
  if (revType?.value) qs.set("typeId", String(Number(revType.value)));

  const res = await fetch(`/api/revenue-timeseries?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load revenue time series");

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const bucketKeys = buildBucketKeys(rangeStartDate, new Date(rangeStartDate.getTime() + rangeDays * DAY_MS), bucket);
  const labels = bucketKeys;

  const seriesMap = new Map();
  rows.forEach((r) => {
    const key = String(r.label || "--");
    if (!seriesMap.has(key)) seriesMap.set(key, new Map());
    const m = seriesMap.get(key);
    m.set(bucketKey(r.bucket, bucket), Number(r.revenue || 0));
  });

  const datasets = Array.from(seriesMap.entries()).map(([label, points], idx) => {
    const c = seriesColor(idx);
    return {
      label,
      data: bucketKeys.map((bk) => Number(points.get(bk) || 0)),
      borderColor: `rgba(${c.r}, ${c.g}, ${c.b}, 0.85)`,
      backgroundColor: `rgba(${c.r}, ${c.g}, ${c.b}, 0.20)`,
      tension: 0.25,
      pointRadius: 0,
      fill: stacked,
      stack: stacked ? "rev" : undefined,
    };
  });

  if (revenueTsChart) revenueTsChart.destroy();
  revenueTsChart = new Chart(revTsCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw || 0)}` } },
      },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, stacked, ticks: { callback: (v) => `$${v}` } },
      },
    },
  });
}

async function loadSalespersonDonut() {
  if (!activeCompanyId || !hasSalespersonDonutUI()) return;
  if (typeof Chart === "undefined") return;

  const metric = String(spMetric?.value || "revenue");
  const from = rangeStartDate.toISOString();
  const to = new Date(rangeStartDate.getTime() + rangeDays * DAY_MS).toISOString();

  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    from,
    to,
    metric,
  });
  if (revLocation?.value) qs.set("pickupLocationId", String(Number(revLocation.value)));
  if (revType?.value) qs.set("typeId", String(Number(revType.value)));

  const res = await fetch(`/api/salesperson-summary?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load salesperson summary");
  const rows = Array.isArray(data.rows) ? data.rows : [];

  const sorted = [...rows].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  const maxSlices = 10;
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices);
  const otherValue = rest.reduce((sum, r) => sum + Number(r.value || 0), 0);
  if (rest.length && otherValue > 0) top.push({ label: "Other", value: otherValue });

  const labels = top.map((r) => String(r.label || "--"));
  const values = top.map((r) => Number(r.value || 0));
  const colors = labels.map((_, i) => {
    const c = seriesColor(i);
    return `rgba(${c.r}, ${c.g}, ${c.b}, 0.75)`;
  });

  if (salespersonDonutChart) salespersonDonutChart.destroy();
  salespersonDonutChart = new Chart(spDonutCanvas.getContext("2d"), {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 1 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              return metric === "transactions" ? `${ctx.label}: ${v}` : `${ctx.label}: ${fmtMoney(v)}`;
            },
          },
        },
      },
    },
  });
}

function utilDefaultRange(period) {
  const today = startOfLocalDay(new Date());
  if (period === "month") {
    return { start: new Date(today.getFullYear(), today.getMonth() - 11, 1), end: today };
  }
  if (period === "week") {
    return { start: new Date(today.getTime() - 12 * 7 * DAY_MS), end: today };
  }
  return { start: new Date(today.getTime() - 29 * DAY_MS), end: today };
}

function setUtilRangeInputs(start, end) {
  if (utilStartInput) utilStartInput.value = toLocalDateInputValue(start);
  if (utilEndInput) utilEndInput.value = toLocalDateInputValue(end);
}

function setUtilPeriod(period, { resetRange = false } = {}) {
  const next = ["day", "week", "month"].includes(String(period)) ? String(period) : "month";
  utilPeriod = next;
  if (utilPeriodToggle) {
    utilPeriodToggle.querySelectorAll(".view-toggle-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.period === next);
    });
  }
  if (resetRange) {
    const { start, end } = utilDefaultRange(next);
    setUtilRangeInputs(start, end);
  }
}

function utilRangeFromInputs() {
  let start = parseLocalDateInputValue(utilStartInput?.value) || startOfLocalDay(new Date());
  let end = parseLocalDateInputValue(utilEndInput?.value) || startOfLocalDay(new Date());
  if (end < start) end = start;
  const endExclusive = new Date(end.getTime() + DAY_MS);
  return { start, end, endExclusive, from: start.toISOString(), to: endExclusive.toISOString() };
}

async function ensureUtilizationLookups() {
  if (!activeCompanyId) return;
  const requests = [];
  if (utilYard) requests.push(fetch(`/api/locations?companyId=${activeCompanyId}`));
  if (utilCategory) requests.push(fetch(`/api/equipment-categories?companyId=${activeCompanyId}`));
  if (utilType) requests.push(fetch(`/api/equipment-types?companyId=${activeCompanyId}`));

  const responses = await Promise.all(requests);
  const results = await Promise.all(responses.map((r) => r.json().catch(() => ({}))));

  let idx = 0;
  if (utilYard) {
    const locData = results[idx++];
    if (responses[idx - 1]?.ok) {
      const current = utilYard.value;
      utilYard.innerHTML = `<option value="">All</option>`;
      (locData.locations || []).forEach((l) => {
        const opt = document.createElement("option");
        opt.value = String(l.id);
        opt.textContent = l.name;
        utilYard.appendChild(opt);
      });
      utilYard.value = current;
    }
  }

  if (utilCategory) {
    const catData = results[idx++];
    if (responses[idx - 1]?.ok) {
      const current = utilCategory.value;
      utilCategory.innerHTML = `<option value="">All</option>`;
      (catData.categories || []).forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c.id);
        opt.textContent = c.name;
        utilCategory.appendChild(opt);
      });
      utilCategory.value = current;
    }
  }

  if (utilType) {
    const typeData = results[idx++];
    if (responses[idx - 1]?.ok) {
      const current = utilType.value;
      utilType.innerHTML = `<option value="">All</option>`;
      (typeData.types || []).forEach((t) => {
        const opt = document.createElement("option");
        opt.value = String(t.id);
        opt.textContent = t.name;
        utilType.appendChild(opt);
      });
      utilType.value = current;
    }
  }
}

function computeUtilSummaryFromDaily(daily, useExpected) {
  const rollup = daily.reduce(
    (acc, row) => {
      acc.rackTotal += Number(row.rackTotal || 0);
      acc.activeEffective += Number(row.activeEffective || 0);
      acc.reservedEffective += Number(row.reservedEffective || 0);
      acc.activeRack += Number(row.activeRack || 0);
      acc.reservedRack += Number(row.reservedRack || 0);
      acc.discountImpact += Number(row.discountImpact || 0);
      return acc;
    },
    {
      rackTotal: 0,
      activeEffective: 0,
      reservedEffective: 0,
      activeRack: 0,
      reservedRack: 0,
      discountImpact: 0,
    }
  );

  const maxPotential = useExpected
    ? rollup.rackTotal - (rollup.activeRack + rollup.reservedRack) + (rollup.activeEffective + rollup.reservedEffective)
    : rollup.rackTotal;
  const activeRevenue = rollup.activeEffective;
  const reservedRevenue = rollup.reservedEffective;
  const deadRevenue = Math.max(0, maxPotential - activeRevenue - reservedRevenue);
  const utilization = maxPotential > 0 ? (activeRevenue + reservedRevenue) / maxPotential : 0;

  return {
    maxPotential,
    activeRevenue,
    reservedRevenue,
    deadRevenue,
    utilization,
    discountImpact: rollup.discountImpact,
  };
}

function buildUtilSeries(daily, bucket, rangeStart, rangeEnd, useExpected) {
  const series = new Map();
  daily.forEach((row) => {
    const dateStr = String(row.date || "");
    const dateObj = parseLocalDateInputValue(dateStr) || new Date(dateStr);
    let key = "";
    if (bucket === "month") key = dateStr.slice(0, 7);
    else if (bucket === "day") key = dateStr;
    else if (bucket === "week") key = bucketKey(startOfBucket(dateObj, "week"), "day");
    else key = bucketKey(dateObj, bucket);
    if (!key) return;
    if (!series.has(key)) {
      series.set(key, { active: 0, reserved: 0, dead: 0, max: 0 });
    }
    const active = Number(row.activeEffective || 0);
    const reserved = Number(row.reservedEffective || 0);
    const rackTotal = Number(row.rackTotal || 0);
    const activeRack = Number(row.activeRack || 0);
    const reservedRack = Number(row.reservedRack || 0);
    const max = useExpected ? rackTotal - (activeRack + reservedRack) + (active + reserved) : rackTotal;
    const dead = Math.max(0, max - active - reserved);
    const bucketEntry = series.get(key);
    bucketEntry.active += active;
    bucketEntry.reserved += reserved;
    bucketEntry.dead += dead;
    bucketEntry.max += max;
  });

  let keys = [];
  if (bucket === "day") {
    keys = daily.map((row) => String(row.date || ""));
  } else if (bucket === "month") {
    const seen = new Set();
    daily.forEach((row) => {
      const k = String(row.date || "").slice(0, 7);
      if (k && !seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    });
  } else {
    keys = buildBucketKeys(rangeStart, rangeEnd, bucket);
  }
  return {
    labels: keys,
    active: keys.map((k) => Number(series.get(k)?.active || 0)),
    reserved: keys.map((k) => Number(series.get(k)?.reserved || 0)),
    dead: keys.map((k) => Number(series.get(k)?.dead || 0)),
    max: keys.map((k) => Number(series.get(k)?.max || 0)),
  };
}

function renderUtilKpis(summary) {
  if (!summary) return;
  if (utilKpiMax) utilKpiMax.textContent = fmtMoney(summary.maxPotential || 0);
  if (utilKpiActive) utilKpiActive.textContent = fmtMoney(summary.activeRevenue || 0);
  if (utilKpiReserved) utilKpiReserved.textContent = fmtMoney(summary.reservedRevenue || 0);
  if (utilKpiDead) utilKpiDead.textContent = fmtMoney(summary.deadRevenue || 0);
  if (utilKpiUtilization) utilKpiUtilization.textContent = fmtPercent(summary.utilization || 0);
  if (utilKpiDiscount) utilKpiDiscount.textContent = fmtMoney(summary.discountImpact || 0);
}

function renderUtilHeroChart(summary) {
  if (!utilHeroCanvas || typeof Chart === "undefined") return;
  const active = Number(summary?.activeRevenue || 0);
  const reserved = Number(summary?.reservedRevenue || 0);
  const dead = Number(summary?.deadRevenue || 0);
  const total = Number(summary?.maxPotential || 0);

  if (utilHeroChart) utilHeroChart.destroy();
  utilHeroChart = new Chart(utilHeroCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: ["Selected window"],
      datasets: [
        { label: "Active", data: [active], backgroundColor: UTIL_COLORS.active },
        { label: "Reserved", data: [reserved], backgroundColor: UTIL_COLORS.reserved },
        { label: "Dead", data: [dead], backgroundColor: UTIL_COLORS.dead },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = Number(ctx.raw || 0);
              const pct = total > 0 ? ` (${((v / total) * 100).toFixed(1)}%)` : "";
              return `${ctx.dataset.label}: ${fmtMoney(v)}${pct}`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
        y: { stacked: true, grid: { display: false } },
      },
    },
  });
}

function renderUtilTrendChart(series) {
  if (!utilTrendCanvas || typeof Chart === "undefined") return;
  if (utilTrendChart) utilTrendChart.destroy();
  utilTrendChart = new Chart(utilTrendCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: series.labels,
      datasets: [
        {
          label: "Active",
          data: series.active,
          backgroundColor: UTIL_COLORS.active,
          stack: "util",
        },
        {
          label: "Reserved",
          data: series.reserved,
          backgroundColor: UTIL_COLORS.reserved,
          stack: "util",
        },
        {
          label: "Dead",
          data: series.dead,
          backgroundColor: UTIL_COLORS.dead,
          stack: "util",
        },
        {
          type: "line",
          label: "Max",
          data: series.max,
          borderColor: UTIL_COLORS.max,
          backgroundColor: "transparent",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${fmtMoney(ctx.raw || 0)}`,
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
      },
    },
  });
}

function renderUtilForwardChart(forwardRows, useExpected) {
  if (!utilForwardCanvas || typeof Chart === "undefined") return;
  const labels = forwardRows.map((row) => {
    const dt = new Date(`${row.bucket}-01T00:00:00Z`);
    return dt.toLocaleString(undefined, { month: "short", year: "2-digit" });
  });

  const activePct = [];
  const reservedPct = [];
  const deadPct = [];
  const committed = [];

  forwardRows.forEach((row) => {
    const active = Number(row.activeEffective || 0);
    const reserved = Number(row.reservedEffective || 0);
    const rackTotal = Number(row.rackTotal || 0);
    const activeRack = Number(row.activeRack || 0);
    const reservedRack = Number(row.reservedRack || 0);
    const max = useExpected ? rackTotal - (activeRack + reservedRack) + (active + reserved) : rackTotal;
    const pctBase = max > 0 ? max : 0;
    activePct.push(pctBase ? (active / pctBase) * 100 : 0);
    reservedPct.push(pctBase ? (reserved / pctBase) * 100 : 0);
    deadPct.push(pctBase ? Math.max(0, ((max - active - reserved) / pctBase) * 100) : 0);
    committed.push(active + reserved);
  });

  if (utilForwardChart) utilForwardChart.destroy();
  utilForwardChart = new Chart(utilForwardCanvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Active", data: activePct, backgroundColor: UTIL_COLORS.active, stack: "forward" },
        { label: "Reserved", data: reservedPct, backgroundColor: UTIL_COLORS.reserved, stack: "forward" },
        { label: "Dead", data: deadPct, backgroundColor: UTIL_COLORS.dead, stack: "forward" },
        {
          type: "line",
          label: "Committed $",
          data: committed,
          borderColor: UTIL_COLORS.max,
          backgroundColor: "transparent",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          yAxisID: "y2",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === "y2") {
                return `${ctx.dataset.label}: ${fmtMoney(ctx.raw || 0)}`;
              }
              return `${ctx.dataset.label}: ${Number(ctx.raw || 0).toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: {
          stacked: true,
          beginAtZero: true,
          max: 100,
          ticks: { callback: (v) => `${v}%` },
        },
        y2: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { callback: (v) => `$${v}` },
        },
      },
    },
  });
}

async function loadUtilizationDashboard() {
  if (!hasUtilizationUI() || !activeCompanyId) return;
  if (typeof Chart === "undefined") return;
  await ensureUtilizationLookups().catch(() => null);

  const range = utilRangeFromInputs();
  const useExpected = Boolean(utilExpectedToggle?.checked);

  const qs = new URLSearchParams({
    companyId: String(activeCompanyId),
    from: range.from,
    to: range.to,
    maxBasis: useExpected ? "expected" : "rack",
  });
  if (utilYard?.value) qs.set("locationId", String(Number(utilYard.value)));
  if (utilCategory?.value) qs.set("categoryId", String(Number(utilCategory.value)));
  if (utilType?.value) qs.set("typeId", String(Number(utilType.value)));

  const res = await fetch(`/api/utilization-dashboard?${qs.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load utilization");

  const daily = Array.isArray(data.daily) ? data.daily : [];
  const summary = data.summary || computeUtilSummaryFromDaily(daily, useExpected);
  renderUtilKpis(summary);

  renderUtilHeroChart(summary);
  const series = buildUtilSeries(daily, utilPeriod, range.start, range.endExclusive, useExpected);
  renderUtilTrendChart(series);

  const forward = Array.isArray(data.forward) ? data.forward : [];
  renderUtilForwardChart(forward, useExpected);
}

function initUtilizationUI() {
  if (!hasUtilizationUI()) return;
  setUtilPeriod(utilPeriod, { resetRange: true });

  utilPeriodToggle?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".view-toggle-btn");
    if (!btn || !btn.dataset?.period) return;
    setUtilPeriod(btn.dataset.period, { resetRange: true });
    loadUtilizationDashboard().catch((err) => (companyMeta.textContent = err.message));
  });

  utilStartInput?.addEventListener("change", () => loadUtilizationDashboard().catch((err) => (companyMeta.textContent = err.message)));
  utilEndInput?.addEventListener("change", () => loadUtilizationDashboard().catch((err) => (companyMeta.textContent = err.message)));
  utilYard?.addEventListener("change", () => loadUtilizationDashboard().catch(() => null));
  utilCategory?.addEventListener("change", () => loadUtilizationDashboard().catch(() => null));
  utilType?.addEventListener("change", () => loadUtilizationDashboard().catch(() => null));
  utilExpectedToggle?.addEventListener("change", () => loadUtilizationDashboard().catch(() => null));
  utilTodayBtn?.addEventListener("click", () => {
    setUtilPeriod(utilPeriod, { resetRange: true });
    loadUtilizationDashboard().catch(() => null);
  });
}

async function loadRevenueDashboard() {
  if (!hasRevenueUI()) return;
  await Promise.all([loadRevenue().catch(() => null), loadRevenueTimeSeries().catch(() => null), loadSalespersonDonut().catch(() => null)]);
}

function currentViewRows() {
  const groupBy = String(groupBySelect?.value || "unit");
  const assignments = currentAssignments();

  if (groupBy === "type") {
    const byType = new Map();
    assignments.forEach((a) => {
      const key = String(a.type_id);
      if (!byType.has(key)) {
        byType.set(key, {
          key: `type-${key}`,
          label: a.type_name || `Type ${key}`,
          bars: [],
        });
      }
    });
    const seenLine = new Set();
    assignments.forEach((a) => {
      const lineKey = String(a.line_item_id);
      if (seenLine.has(lineKey)) return;
      seenLine.add(lineKey);
      const row = byType.get(String(a.type_id));
      if (!row) return;
      row.bars.push({ ...a, qty: countQtyForLine(a.line_item_id) });
    });
    return Array.from(byType.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (groupBy === "customer") {
    const byCustomer = new Map();
    assignments.forEach((a) => {
      const label = a.customer_name ? String(a.customer_name) : "Unknown customer";
      const key = label;
      if (!byCustomer.has(key)) {
        byCustomer.set(key, { key: `cust-${key}`, label, bars: [] });
      }
    });
    const seenOrder = new Set();
    assignments.forEach((a) => {
      const ok = String(a.order_id);
      if (seenOrder.has(ok)) return;
      seenOrder.add(ok);
      const label = a.customer_name ? String(a.customer_name) : "Unknown customer";
      const row = byCustomer.get(label);
      if (!row) return;
      row.bars.push({ ...a, qty: countQtyForOrder(a.order_id) });
    });
    return Array.from(byCustomer.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (groupBy === "location") {
    const byLoc = new Map();
    assignments.forEach((a) => {
      const key = String(a.pickup_location_id || "none");
      const label = a.pickup_location_name || "No pickup location";
      if (!byLoc.has(key)) {
        byLoc.set(key, { key: `loc-${key}`, label, bars: [] });
      }
    });
    const seenOrder = new Set();
    assignments.forEach((a) => {
      const ok = String(a.order_id);
      if (seenOrder.has(ok)) return;
      seenOrder.add(ok);
      const row = byLoc.get(String(a.pickup_location_id || "none"));
      if (!row) return;
      row.bars.push({ ...a, qty: countQtyForOrder(a.order_id) });
    });
    return Array.from(byLoc.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  // unit
  const byEquip = new Map();
  rawEquipment.forEach((e) => {
    const model = e.model_name || e.model || "";
    const serial = e.serial_number || e.serial || "";
    const unitDetail = model || serial || `Unit #${e.id}`;
    const locDetail = e.location_name ? `Location: ${e.location_name}` : "";
    const subParts = [unitDetail, locDetail].filter(Boolean);
    byEquip.set(String(e.id), {
      key: `eq-${e.id}`,
      label: equipmentLabel(e),
      displayTitle: e.type_name || "Equipment",
      displaySub: subParts.join(" - "),
      equipmentId: e.id,
      bars: [],
    });
  });
  assignments.forEach((a) => {
    const row = byEquip.get(String(a.equipment_id));
    if (!row) return;
    row.bars.push({ ...a, qty: 1 });
  });
  // Default: hide empty rows for scale.
  return Array.from(byEquip.values())
    .filter((r) => r.bars.length)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function equipmentLabel(e) {
  const type = e.type_name || "";
  const serial = e.serial_number || "";
  const model = e.model_name || "";
  const loc = e.location_name ? ` • ${e.location_name}` : "";
  const core = [serial, model].filter(Boolean).join(" — ") || `#${e.id}`;
  return `${type}: ${core}${loc}`;
}

function countQtyForLine(lineItemId) {
  const id = String(lineItemId);
  let count = 0;
  rawAssignments.forEach((a) => {
    if (String(a.line_item_id) === id) count++;
  });
  return count;
}

function countQtyForOrder(orderId) {
  const id = String(orderId);
  const set = new Set();
  rawAssignments.forEach((a) => {
    if (String(a.order_id) === id) set.add(String(a.equipment_id));
  });
  return set.size;
}

function renderTimeline() {
  const days = rangeDays;
  const widthPx = days * COL_W;
  renderDaysHeader(days, widthPx);
  applyTimelineTimeAnchors();

  const activeEndingDays = Math.max(1, Number(endingDays) || DEFAULT_ENDING_DAYS);
  const rows = currentViewRows();
  timelineLeftEl.innerHTML = "";
  timelineRowsEl.innerHTML = "";

  const todayIdx = dayIndexFor(new Date());

  rows.forEach((row) => {
    const left = document.createElement("div");
    left.className = "timeline-row-label";
    if (row.displayTitle || row.displaySub) {
      const title = document.createElement("div");
      title.className = "timeline-row-title";
      title.textContent = row.displayTitle || row.label;
      title.title = title.textContent;
      left.appendChild(title);

      if (row.displaySub) {
        const sub = document.createElement("div");
        sub.className = "timeline-row-sub";
        sub.textContent = row.displaySub;
        sub.title = sub.textContent;
        left.appendChild(sub);
      }
    } else {
      const title = document.createElement("div");
      title.className = "timeline-row-title";
      title.textContent = row.label;
      title.title = title.textContent;
      left.appendChild(title);
    }
    timelineLeftEl.appendChild(left);

    const track = document.createElement("div");
    track.className = "timeline-track";
    track.style.width = `${widthPx}px`;

    if (todayIdx !== null) {
      const stripe = document.createElement("div");
      stripe.className = "timeline-today-stripe";
      stripe.style.left = `${todayIdx * COL_W}px`;
      stripe.style.width = `${COL_W}px`;
      track.appendChild(stripe);
    }

    const bars = buildBarsForRow(row, activeEndingDays);
    const { bars: laneBars, laneCount } = computeLanes(bars);

    const minLaneHeight = Math.max(32, laneCount * (BAR_H + BAR_GAP) + 10);
    const minLabelHeight = Math.max(32, left.scrollHeight || 0);
    const rowHeight = Math.max(minLaneHeight, minLabelHeight);
    left.style.height = `${rowHeight}px`;
    track.style.height = `${rowHeight}px`;

    laneBars.forEach((b) => {
      const el = renderBar(b, activeEndingDays);
      el.style.top = `${6 + b.lane * (BAR_H + BAR_GAP)}px`;
      track.appendChild(el);
    });

    timelineRowsEl.appendChild(track);
  });

  renderBenchSummary();
}

function applyTimelineTimeAnchors() {
  if (!hasTimelineUI()) return;
  const shiftPx = weekPatternShiftPx(rangeStartDate);
  timelineDaysEl?.style.setProperty("--week-pattern-shift", `${shiftPx}px`);
  timelineRowsEl?.style.setProperty("--week-pattern-shift", `${shiftPx}px`);
}

function weekPatternShiftPx(d) {
  const dow = d instanceof Date ? d.getDay() : new Date(d).getDay(); // 0=Sun..6=Sat
  const mondayIndex = (dow + 6) % 7; // 0=Mon..6=Sun
  return -mondayIndex * COL_W;
}

function renderBenchSummary() {
  if (!hasTimelineUI()) return;
  if (!hasBenchSummaryUI()) return;

  const assignments = currentAssignments();
  const activeEndingDays = Math.max(1, Number(endingDays) || DEFAULT_ENDING_DAYS);

  const counts = { active: 0, starting: 0, ending: 0, overdue: 0, reservations: 0 };
  const now = Date.now();
  const startingSoonMs = activeEndingDays * DAY_MS;
  assignments.forEach((a) => {
    const s = String(a.status || "").toLowerCase();
    if (s === "reservation" || s === "requested") counts.reservations++;
    const startMs = Date.parse(a.start_at);
    if (
      (s === "requested" || s === "reservation" || s === "ordered") &&
      Number.isFinite(startMs) &&
      startMs >= now &&
      startMs <= now + startingSoonMs
    ) {
      counts.starting++;
    }
    const state = barStateFor(a, activeEndingDays);
    if (state.base === "active") counts.active++;
    if (state.base === "ending") counts.ending++;
    if (state.base === "overdue") counts.overdue++;
  });

  const uniqueOrders = new Set(assignments.map((a) => String(a.order_id))).size;
  const uniqueUnits = new Set(assignments.map((a) => String(a.equipment_id))).size;

  if (benchKpiAssignments) {
    benchKpiAssignments.textContent = String(assignments.length);
    benchKpiAssignments.title = `${uniqueOrders} orders · ${uniqueUnits} units`;
  }
  if (benchKpiActive) benchKpiActive.textContent = String(counts.active);
  if (benchKpiStarting) benchKpiStarting.textContent = String(counts.starting);
  if (benchKpiEnding) benchKpiEnding.textContent = String(counts.ending);
  if (benchKpiOverdue) benchKpiOverdue.textContent = String(counts.overdue);
  if (benchKpiReservations) benchKpiReservations.textContent = String(counts.reservations);
}

function buildBarsForRow(row, endingDays) {
  const fromMs = rangeStartDate.getTime();
  const toMs = fromMs + rangeDays * DAY_MS;
  return (row.bars || [])
    .map((a) => {
      const startMs = Date.parse(a.start_at);
      const endMs = Date.parse(a.end_at);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
      if (endMs <= fromMs || startMs >= toMs) return null;
      const clampedStart = clamp(startMs, fromMs, toMs);
      const clampedEnd = clamp(endMs, fromMs, toMs);
      if (clampedEnd <= clampedStart) return null;
      const leftPx = ((clampedStart - fromMs) / DAY_MS) * COL_W;
      const widthPx = Math.max(6, ((clampedEnd - clampedStart) / DAY_MS) * COL_W);
      const state = barStateFor(a, endingDays);
      const durationDays = Math.max(1, Math.ceil((endMs - startMs) / DAY_MS));
      return {
        ...a,
        startMs,
        endMs,
        leftPx,
        widthPx,
        durationDays,
        state,
        lane: 0,
        qty: a.qty || 1,
      };
    })
    .filter(Boolean);
}

function renderBar(b, endingDays) {
  const el = document.createElement("div");
  const classes = ["timeline-bar", `status-${b.state.statusKey}`, `state-${b.state.base}`];
  if (b.state.endTodayOrEarlier) classes.push("due");
  if (b.state.isEndingSoon) classes.push("is-ending");
  if (b.state.bell) classes.push("is-ending-urgent");
  if (b.state.isOverdue) classes.push("is-overdue");
  if (b.durationDays >= 21) classes.push("long");
  el.className = classes.join(" ");
  el.style.left = `${b.leftPx}px`;
  el.style.width = `${b.widthPx}px`;
  el.dataset.orderId = String(b.order_id);
  el.dataset.lineItemId = String(b.line_item_id);
  el.dataset.status = String(b.status || "");
  el.dataset.endAt = String(b.end_at || "");

  const label = document.createElement("div");
  label.className = "timeline-bar-label";
  const suffix = b.qty && b.qty > 1 ? ` ×${b.qty}` : "";
  label.textContent = `${docNumber(b)}${suffix}`;
  el.appendChild(label);

  if (b.durationDays >= 21) {
    const duration = document.createElement("div");
    duration.className = "timeline-duration";
    duration.textContent = `${b.durationDays}d`;
    el.appendChild(duration);
  }

  const badgeText = endingBadgeText(b, endingDays);
  if (badgeText) {
    const badge = document.createElement("div");
    badge.className = "timeline-badge";
    badge.textContent = badgeText;
    el.appendChild(badge);
  }

  if (b.state.bell && !badgeText) {
    const bell = document.createElement("div");
    bell.className = "timeline-bell";
    bell.title = "Ending soon";
    el.appendChild(bell);
  }

  const canDrag =
    !["location", "customer"].includes(String(groupBySelect?.value || "unit")) &&
    (String(b.status || "").toLowerCase() === "ordered" || String(b.status || "").toLowerCase() === "reservation");
  if (canDrag) {
    const handle = document.createElement("div");
    handle.className = "timeline-handle";
    handle.title = "Drag edge to extend/shorten return";
    handle.addEventListener("pointerdown", (e) => beginResize(e, b, el));
    el.appendChild(handle);
  }

  el.addEventListener("mouseenter", (e) => showTooltip(e, b, endingDays));
  el.addEventListener("mousemove", (e) => moveTooltip(e));
  el.addEventListener("mouseleave", () => hideTooltip());
  el.addEventListener("contextmenu", (e) => openBarMenu(e, b));
  el.addEventListener("click", (e) => {
    if (e.target && e.target.classList.contains("timeline-handle")) return;
    window.location.href = `rental-order-form.html?id=${b.order_id}&from=workbench`;
  });
  return el;
}

function endingBadgeText(b, endingDays) {
  const s = String(b.status || "").toLowerCase();
  if (s !== "ordered") return "";
  const endMs = Date.parse(b.end_at);
  if (!Number.isFinite(endMs)) return "";

  const now = Date.now();
  const ms = endMs - now;
  const soonMs = Math.max(1, Number(endingDays) || 2) * DAY_MS;

  if (ms < 0) {
    const overdueMs = Math.abs(ms);
    const overdueDays = Math.floor(overdueMs / DAY_MS);
    if (overdueDays >= 1) return `Overdue ${overdueDays}d`;
    const overdueHours = Math.max(1, Math.floor(overdueMs / (60 * 60 * 1000)));
    return `Overdue ${overdueHours}h`;
  }

  if (ms > soonMs) return "";
  const days = Math.floor(ms / DAY_MS);
  if (days >= 2) return `Ends in ${days}d`;
  if (days === 1) return "Ends in 1d";
  const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  return `Ends in ${hours}h`;
}

function showTooltip(e, b, endingDays) {
  if (!tooltip) return;
  const state = barStateFor(b, endingDays);
  const equip = b.equipment_id ? equipmentLabelById.get(String(b.equipment_id)) : "";
  tooltip.innerHTML = `
    <div class="tt-title">${docNumber(b)} • ${statusLabel(b.status)}</div>
    <div class="tt-sub">Customer: ${b.customer_name || "--"}</div>
    <div class="tt-sub">Pickup: ${b.pickup_location_name || "--"}</div>
    <div class="tt-sub">Type: ${b.type_name || "--"}</div>
    ${equip ? `<div class="tt-sub">Unit: ${equip}</div>` : ""}
    <div class="tt-sub">Start: ${fmtDateTime(b.start_at)}</div>
    <div class="tt-sub">Return: ${fmtDateTime(b.end_at)}</div>
    ${state.base === "overdue" ? `<div class="tt-warn">Overdue</div>` : state.base === "ending" ? `<div class="tt-warn">Ending soon</div>` : ""}
  `;
  tooltip.style.display = "block";
  moveTooltip(e);
}

function moveTooltip(e) {
  if (!tooltip || tooltip.style.display === "none") return;
  const pad = 14;
  const x = e.clientX + pad;
  const y = e.clientY + pad;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  if (!tooltip) return;
  tooltip.style.display = "none";
}

function ensureTimelineMenu() {
  if (timelineMenuEl) return timelineMenuEl;
  const el = document.createElement("div");
  el.className = "timeline-menu";
  el.style.display = "none";
  el.setAttribute("role", "menu");
  document.body.appendChild(el);
  timelineMenuEl = el;

  document.addEventListener("click", (e) => {
    if (!timelineMenuEl || timelineMenuEl.style.display === "none") return;
    if (timelineMenuEl.contains(e.target)) return;
    closeTimelineMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTimelineMenu();
  });

  return el;
}

function closeTimelineMenu() {
  if (!timelineMenuEl) return;
  timelineMenuEl.style.display = "none";
}

async function copyToClipboard(text) {
  const value = String(text || "");
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    if (companyMeta) companyMeta.textContent = "Copied to clipboard.";
  } catch (_) {
    window.prompt("Copy to clipboard:", value);
  }
}

function openBarMenu(e, b) {
  if (!hasTimelineUI()) return;
  const orderId = b?.order_id;
  if (!orderId) return;
  e.preventDefault();
  e.stopPropagation();

  const menu = ensureTimelineMenu();
  menu.innerHTML = "";

  const addItem = (label, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      closeTimelineMenu();
      onClick();
    });
    menu.appendChild(btn);
  };

  addItem("Open order", () => {
    window.location.href = `rental-order-form.html?id=${orderId}&from=workbench`;
  });
  addItem("Open in new tab", () => {
    window.open(`rental-order-form.html?id=${orderId}&from=workbench`, "_blank", "noopener,noreferrer");
  });
  addItem("Copy document #", () => copyToClipboard(docNumber(b)));
  addItem("Copy customer", () => copyToClipboard(b.customer_name || ""));
  addItem("Copy dates", () => copyToClipboard(`${fmtDateTime(b.start_at)} → ${fmtDateTime(b.end_at)}`));

  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const menuW = 240;
  const menuH = 180;
  const left = Math.max(8, Math.min(e.clientX, vw - menuW - 8));
  const top = Math.max(8, Math.min(e.clientY, vh - menuH - 8));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.display = "block";
}

function dayIndexFor(d) {
  const t = startOfLocalDay(d).getTime();
  const from = rangeStartDate.getTime();
  const idx = Math.floor((t - from) / DAY_MS);
  if (idx < 0 || idx >= rangeDays) return null;
  return idx;
}

function renderDaysHeader(days, widthPx) {
  timelineDaysEl.innerHTML = "";
  timelineDaysEl.style.width = `${widthPx}px`;
  const todayKey = toLocalDateInputValue(new Date());
  for (let i = 0; i < days; i++) {
    const d = new Date(rangeStartDate.getTime() + i * DAY_MS);
    const cell = document.createElement("div");
    cell.className = "timeline-day";
    const key = toLocalDateInputValue(d);
    if (key === todayKey) cell.classList.add("today");
    const dow = d.getDay();
    if (dow === 0 || dow === 6) cell.classList.add("weekend");
    if (dow === 1) cell.classList.add("week-start");
    cell.textContent = `${d.getMonth() + 1}/${d.getDate()}`;
    timelineDaysEl.appendChild(cell);
  }
}

let resizeState = null;
function beginResize(e, bar, barEl) {
  e.preventDefault();
  e.stopPropagation();
  if (!barEl || !bar) return;

  const lineItemId = Number(bar.line_item_id);
  if (!Number.isFinite(lineItemId)) return;

  const track = barEl.closest(".timeline-track");
  if (!track) return;

  resizeState = {
    bar,
    barEl,
    track,
    startX: e.clientX,
    origWidth: bar.widthPx,
    lineItemId,
  };
  barEl.classList.add("resizing");
  barEl.setPointerCapture(e.pointerId);
  barEl.addEventListener("pointermove", onResizeMove);
  barEl.addEventListener("pointerup", onResizeEnd, { once: true });
  barEl.addEventListener("pointercancel", onResizeCancel, { once: true });
}

function onResizeMove(e) {
  if (!resizeState) return;
  const dx = e.clientX - resizeState.startX;
  const nextWidth = Math.max(10, resizeState.origWidth + dx);
  resizeState.barEl.style.width = `${nextWidth}px`;
}

async function onResizeEnd(e) {
  if (!resizeState) return;
  const state = resizeState;
  cleanupResize(e);

  const widthPx = parseFloat(state.barEl.style.width);
  const leftPx = state.bar.leftPx;
  const fromMs = rangeStartDate.getTime();
  const endMs = fromMs + ((leftPx + widthPx) / COL_W) * DAY_MS;
  const newEnd = new Date(endMs);

  // Round to nearest 30 minutes.
  const rounded = roundToMinutes(newEnd, 30);
  const iso = rounded.toISOString();

  const confirmed = window.confirm(`Reschedule return to ${rounded.toLocaleString()}?`);
  if (!confirmed) {
    renderTimeline();
    return;
  }

  try {
    const res = await fetch(`/api/rental-orders/line-items/${state.lineItemId}/reschedule`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: activeCompanyId, endAt: iso }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data?.conflicts) openConflictModal(data);
      throw new Error(data.error || "Unable to reschedule");
    }
    companyMeta.textContent = "Return date updated.";
    await loadTimeline();
  } catch (err) {
    companyMeta.textContent = err.message;
    renderTimeline();
  }
}

function onResizeCancel(e) {
  if (!resizeState) return;
  cleanupResize(e);
  renderTimeline();
}

function cleanupResize(e) {
  const state = resizeState;
  resizeState = null;
  if (!state) return;
  state.barEl.classList.remove("resizing");
  try {
    state.barEl.releasePointerCapture(e.pointerId);
  } catch (_) {}
  state.barEl.removeEventListener("pointermove", onResizeMove);
}

function roundToMinutes(d, minutes) {
  const ms = d.getTime();
  const step = Math.max(1, Number(minutes) || 30) * 60 * 1000;
  return new Date(Math.round(ms / step) * step);
}

function openConflictModal(data) {
  if (!conflictModal || !conflictBody) return;
  conflictBody.innerHTML = "";
  const msg = document.createElement("div");
  msg.className = "hint";
  msg.textContent = data.error || "Conflict detected.";
  conflictBody.appendChild(msg);

  (data.conflicts || []).forEach((c) => {
    const div = document.createElement("div");
    div.className = "conflict-row";
    const doc = c.roNumber && c.quoteNumber ? `${c.roNumber} / ${c.quoteNumber}` : c.roNumber || c.quoteNumber || `#${c.orderId}`;
    div.textContent = `Equipment #${c.equipmentId} overlaps ${doc} (${statusLabel(c.status)}) — ${c.customerName} — ${fmtDateTime(
      c.startAt
    )} → ${fmtDateTime(c.endAt)}`;
    conflictBody.appendChild(div);
  });
  conflictModal.classList.add("show");
}

function closeConflictModal() {
  conflictModal?.classList.remove("show");
}

closeConflictModalBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  closeConflictModal();
});

conflictModal?.addEventListener("click", (e) => {
  if (e.target === conflictModal) closeConflictModal();
});

function syncScroll() {
  if (!scrollBody || !scrollHead) return;

  let locked = false;
  const unlock = () => requestAnimationFrame(() => (locked = false));

  scrollBody.addEventListener("scroll", () => {
    if (locked) return;
    locked = true;
    scrollHead.scrollLeft = scrollBody.scrollLeft;
    if (timelineLeftEl) timelineLeftEl.scrollTop = scrollBody.scrollTop;
    unlock();
  });

  timelineLeftEl?.addEventListener("scroll", () => {
    if (locked) return;
    locked = true;
    scrollBody.scrollTop = timelineLeftEl.scrollTop;
    unlock();
  });
}

function initWorkbenchShortcuts() {
  if (!hasTimelineUI()) return;
  document.addEventListener("keydown", onWorkbenchKeydown);
}

function onWorkbenchKeydown(e) {
  if (!hasTimelineUI()) return;

  const active = document.activeElement;
  const tag = active && active.tagName ? String(active.tagName).toLowerCase() : "";
  const isTyping = tag === "input" || tag === "textarea" || tag === "select" || active?.isContentEditable;
  if (e.key === "Escape") {
    closeTimelineMenu();
    hideTooltip();
    return;
  }

  if (isTyping) return;

  if ((e.key === "n" || e.key === "N") && benchNewRoBtn) {
    e.preventDefault();
    benchNewRoBtn.click();
    return;
  }

  if (e.key === "/" && benchSearchInput) {
    e.preventDefault();
    benchSearchInput.focus();
    benchSearchInput.select?.();
    return;
  }

  if (!scrollBody) return;
  const hStep = e.shiftKey ? COL_W * 7 : COL_W * 2;
  const vStep = e.shiftKey ? 240 : 120;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    scrollBody.scrollLeft -= hStep;
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    scrollBody.scrollLeft += hStep;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    scrollBody.scrollTop -= vStep;
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    scrollBody.scrollTop += vStep;
  }
}

function init() {
  if (hasTimelineUI()) {
    syncScroll();
    initWorkbenchShortcuts();
  }

  if (hasUtilizationUI()) {
    initUtilizationUI();
  }

  rangeDays = Number(rangeDaysSelect?.value) || 30;
  rangeStartDate = hasTimelineUI()
    ? startOfLocalDay(new Date())
    : hasRevenueUI()
      ? startOfLocalDay(new Date(Date.now() - rangeDays * DAY_MS))
      : startOfLocalDay(new Date());
  if (rangeStartInput) rangeStartInput.value = toLocalDateInputValue(rangeStartDate);

  if (hasBenchStagesUI()) {
    setBenchView(currentBenchViewPref(), { persist: false, load: false });
  }

  if (activeCompanyId) {
    window.RentSoft?.setCompanyId?.(activeCompanyId);
    companyMeta.textContent = `Using company #${activeCompanyId}`;
    if (hasTimelineUI()) {
      if (hasBenchStagesUI() && benchActiveView === "stages") loadBenchStages();
      else loadTimeline();
    } else if (hasRevenueUI() || hasUtilizationUI()) {
      const tasks = [];
      if (hasUtilizationUI()) tasks.push(loadUtilizationDashboard().catch(() => null));
      if (hasRevenueUI()) tasks.push(loadRevenueDashboard().catch(() => null));
      Promise.all(tasks).catch((err) => (companyMeta.textContent = err.message));
    }
  } else {
    companyMeta.textContent = "Log in to view your dashboard.";
  }
}

rangeStartInput?.addEventListener("change", () => {
  const dt = parseLocalDateInputValue(rangeStartInput.value);
  if (dt) rangeStartDate = startOfLocalDay(dt);
  if (hasTimelineUI()) {
    if (hasBenchStagesUI() && benchActiveView === "stages") loadBenchStages();
    else loadTimeline();
  } else if (hasRevenueUI()) {
    loadRevenueDashboard().catch((err) => (companyMeta.textContent = err.message));
  }
});

rangeDaysSelect?.addEventListener("change", () => {
  rangeDays = Number(rangeDaysSelect.value) || 30;
  if (hasTimelineUI()) {
    if (hasBenchStagesUI() && benchActiveView === "stages") loadBenchStages();
    else loadTimeline();
  } else if (hasRevenueUI()) {
    loadRevenueDashboard().catch((err) => (companyMeta.textContent = err.message));
  }
});

groupBySelect?.addEventListener("change", () => renderTimeline());

todayBtn?.addEventListener("click", () => {
  rangeStartDate = hasTimelineUI()
    ? startOfLocalDay(new Date())
    : hasRevenueUI()
      ? startOfLocalDay(new Date(Date.now() - rangeDays * DAY_MS))
      : startOfLocalDay(new Date());
  if (rangeStartInput) rangeStartInput.value = toLocalDateInputValue(rangeStartDate);
  if (hasTimelineUI()) {
    if (hasBenchStagesUI() && benchActiveView === "stages") loadBenchStages();
    else loadTimeline();
  } else if (hasRevenueUI()) {
    loadRevenueDashboard().catch((err) => (companyMeta.textContent = err.message));
  }
});

[revGroup, revLocation, revType].filter(Boolean).forEach((el) => el.addEventListener("change", () => loadRevenueDashboard().catch(() => null)));
[revTsGroup, revTsBucket, revTsStacked, spMetric].filter(Boolean).forEach((el) => el.addEventListener("change", () => loadRevenueDashboard().catch(() => null)));

[statusRequested, statusReservation, statusOrdered, statusReceived, statusClosed, statusQuote]
  .filter(Boolean)
  .forEach((el) =>
    el.addEventListener("change", () => {
      if (!hasTimelineUI()) return;
      if (hasBenchStagesUI() && benchActiveView === "stages") loadBenchStages();
      else loadTimeline();
    })
  );

benchSearchInput?.addEventListener("input", () => {
  if (hasBenchStagesUI() && benchActiveView === "stages") {
    renderBenchStages();
    return;
  }
  renderTimeline();
  renderBenchSummary();
});

function openOrderFromWorkbench(orderId) {
  if (!orderId || !activeCompanyId) return;
  const qs = new URLSearchParams({ id: String(orderId), companyId: String(activeCompanyId), from: "workbench" });
  window.location.href = `rental-order-form.html?${qs.toString()}`;
}

benchViewToggle?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.(".view-toggle-btn");
  const view = btn?.dataset?.view;
  if (!view) return;
  setBenchView(view);
  if (view === "timeline") loadTimeline();
});

benchViewStages?.addEventListener("click", (e) => {
  const openBtn = e.target?.closest?.("[data-open]");
  if (openBtn) {
    e.preventDefault();
    const row = openBtn.closest(".table-row");
    const id = row?.dataset?.id;
    if (id) openOrderFromWorkbench(id);
    return;
  }

  const row = e.target?.closest?.(".table-row");
  if (!row || row.classList.contains("table-header")) return;
  const id = row?.dataset?.id;
  if (id) openOrderFromWorkbench(id);
});

benchNewRoBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  if (!activeCompanyId) {
    companyMeta.textContent = "Log in to continue.";
    return;
  }
  const qs = new URLSearchParams({ status: "reservation", from: "workbench" });
  qs.set("companyId", String(activeCompanyId));
  window.location.href = `rental-order-form.html?${qs.toString()}`;
});

function setEnding72Active(active) {
  if (!benchEnding72Btn) return;
  if (hasBenchStagesUI() && benchActiveView === "stages") setBenchView("timeline");
  if (active) {
    focusEndingOnly = true;
    endingDays = ENDING_72H_DAYS;
    benchEnding72Btn.classList.add("active");
    benchEnding72Btn.dataset.active = "1";
    loadTimeline();
    return;
  }

  benchEnding72Btn.classList.remove("active");
  benchEnding72Btn.dataset.active = "0";
  focusEndingOnly = false;
  endingDays = DEFAULT_ENDING_DAYS;
  loadTimeline();
}

benchEnding72Btn?.addEventListener("click", () => {
  const active = benchEnding72Btn.dataset.active === "1" || benchEnding72Btn.classList.contains("active");
  setEnding72Active(!active);
});

init();
