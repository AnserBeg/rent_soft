const params = new URLSearchParams(window.location.search);

const companyMeta = document.getElementById("company-meta");
const monthPicker = document.getElementById("month-picker");
const refreshBtn = document.getElementById("refresh-monthly");
const pageMeta = document.getElementById("page-meta");
const asOfMeta = document.getElementById("as-of-meta");
const customerTable = document.getElementById("customer-monthly-table");
const customerCount = document.getElementById("customer-count");
const customerSearchInput = document.getElementById("customer-search");
const totalHero = document.getElementById("monthly-total-hero");
const totalValue = document.getElementById("monthly-total-value");
const totalMonth = document.getElementById("monthly-total-month");
const totalCustomers = document.getElementById("monthly-total-customers");
const totalOrdersEl = document.getElementById("monthly-total-orders");
const totalStatusesEl = document.getElementById("monthly-total-statuses");
const monthBar = document.getElementById("monthly-month-bar");

const filterRequested = document.getElementById("filter-requested");
const filterReservation = document.getElementById("filter-reservation");
const filterOrdered = document.getElementById("filter-ordered");
const filterReceived = document.getElementById("filter-received");
const filterClosed = document.getElementById("filter-closed");

let billingRoundingMode = "ceil";
let billingRoundingGranularity = "unit";
let monthlyProrationMethod = "hours";
let billingTimeZone = "UTC";
const PRORATED_VIEW = true;
let requestSeq = 0;
let activeCompanyId = null;
let customersCache = [];
let currentMonthLabel = "this month";
let customerSearchTerm = "";
let customerSortField = "total";
let customerSortDir = "desc";
const MONTH_SHORT_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const yearTotalsCache = new Map();

function setCompanyMeta(message) {
  if (!companyMeta) return;
  const msg = String(message || "").trim();
  companyMeta.textContent = msg;
  companyMeta.style.display = msg ? "block" : "none";
}

function setPageMeta(message) {
  if (!pageMeta) return;
  pageMeta.textContent = String(message || "");
}

function setAsOfMeta(message) {
  if (!asOfMeta) return;
  const msg = String(message || "").trim();
  asOfMeta.textContent = msg;
  asOfMeta.style.display = msg ? "block" : "none";
}

function setCustomerCount(value) {
  if (!customerCount) return;
  customerCount.textContent = String(value ?? 0);
}

const CUSTOMER_SORT_FIELDS = new Set(["customer", "orders", "line_items", "fees", "total"]);

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchCompact(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function ensureCustomerSearchCache(customer) {
  if (customer.searchText && customer.searchCompact) {
    return { text: customer.searchText, compact: customer.searchCompact };
  }
  const base = [
    customer.name,
    customer.orders?.length ?? 0,
    fmtMoney(customer.lineItemsTotal),
    fmtMoney(customer.feesTotal),
    fmtMoney(customer.total),
  ].join(" ");
  const text = normalizeSearchValue(base);
  const compact = normalizeSearchCompact(base);
  customer.searchText = text;
  customer.searchCompact = compact;
  return { text, compact };
}

function filterCustomers(customers) {
  const term = normalizeSearchValue(customerSearchTerm);
  const compact = normalizeSearchCompact(customerSearchTerm);
  if (!term && !compact) return customers;
  return customers.filter((customer) => {
    const cached = ensureCustomerSearchCache(customer);
    if (term && cached.text.includes(term)) return true;
    if (compact && cached.compact.includes(compact)) return true;
    return false;
  });
}

function customerSortValue(customer, field) {
  switch (field) {
    case "customer":
      return String(customer.name || "");
    case "orders":
      return Number(customer.orders?.length ?? 0);
    case "line_items":
      return moneyNumber(customer.lineItemsTotal);
    case "fees":
      return moneyNumber(customer.feesTotal);
    case "total":
      return moneyNumber(customer.total);
    default:
      return moneyNumber(customer.total);
  }
}

function sortCustomers(customers) {
  const field = CUSTOMER_SORT_FIELDS.has(customerSortField) ? customerSortField : "total";
  const dir = customerSortDir === "asc" ? 1 : -1;
  return [...customers].sort((a, b) => {
    if (field === "customer") {
      return String(a.name || "").localeCompare(String(b.name || "")) * dir;
    }
    const av = customerSortValue(a, field);
    const bv = customerSortValue(b, field);
    if (av === bv) {
      return String(a.name || "").localeCompare(String(b.name || ""));
    }
    return (av - bv) * dir;
  });
}

function applyCustomerView() {
  const list = Array.isArray(customersCache) ? customersCache : [];
  const filtered = filterCustomers(list);
  const sorted = sortCustomers(filtered);
  const emptyMessage =
    list.length && customerSearchTerm.trim() ? "No matching customers." : "No customer totals for this month.";
  renderCustomerTable(sorted, currentMonthLabel, {
    emptyMessage,
    sortField: customerSortField,
    sortDir: customerSortDir,
  });
  if (!list.length) {
    setCustomerCount(0);
    return;
  }
  const countLabel = customerSearchTerm.trim() ? `${sorted.length} / ${list.length}` : String(list.length);
  setCustomerCount(countLabel);
}

function updateCustomerList(customers, monthLabel) {
  customersCache = Array.isArray(customers) ? customers : [];
  if (monthLabel) currentMonthLabel = monthLabel;
  applyCustomerView();
}

function renderMonthBar({ monthValue, totals = null, empty = false } = {}) {
  if (!monthBar) return;
  const parsed = parseMonthValue(monthValue);
  const activeMonth = parsed?.month ?? null;
  const activeYear = parsed?.year ?? parseMonthValue(monthPicker?.value)?.year ?? new Date().getFullYear();
  const maxValue = Array.isArray(totals) ? Math.max(0, ...totals) : 0;
  const minHeight = 12;
  const maxHeight = 44;
  monthBar.classList.toggle("is-empty", empty);
  monthBar.innerHTML = "";
  MONTH_SHORT_LABELS.forEach((label, index) => {
    const monthNumber = index + 1;
    const seg = document.createElement("button");
    seg.className = "month-seg";
    seg.type = "button";
    seg.setAttribute("role", "listitem");
    seg.dataset.month = `${activeYear}-${String(monthNumber).padStart(2, "0")}`;
    if (activeMonth === monthNumber) seg.classList.add("is-active");
    seg.setAttribute("aria-pressed", activeMonth === monthNumber ? "true" : "false");
    const bar = document.createElement("span");
    bar.className = "month-seg-bar";
    const monthTotal = Array.isArray(totals) ? Number(totals[index]) || 0 : 0;
    const height =
      maxValue > 0 ? minHeight + (monthTotal / maxValue) * (maxHeight - minHeight) : minHeight;
    bar.style.setProperty("--bar-h", `${Math.round(height)}px`);
    const text = document.createElement("span");
    text.className = "month-seg-label";
    text.textContent = label;
    if (Array.isArray(totals)) {
      if (monthTotal > 0) seg.classList.add("has-value");
      seg.title = `${label} ${activeYear} · ${fmtMoney(monthTotal)}`;
      seg.setAttribute("aria-label", `${label} ${activeYear} total ${fmtMoney(monthTotal)}`);
    }
    seg.appendChild(bar);
    seg.appendChild(text);
    monthBar.appendChild(seg);
  });
}

function updateMonthlyTotalHero({
  monthLabel = "Select a month",
  monthValue = null,
  totalValueText = "$0.00",
  customersWithCharges = 0,
  customersTotal = 0,
  totalOrders = 0,
  statusesCount = 0,
  totals = null,
  empty = false,
} = {}) {
  if (totalValue) totalValue.textContent = totalValueText;
  if (totalMonth) totalMonth.textContent = monthLabel;
  if (totalCustomers) totalCustomers.textContent = String(customersWithCharges ?? 0);
  if (totalOrdersEl) totalOrdersEl.textContent = String(totalOrders ?? 0);
  if (totalStatusesEl) totalStatusesEl.textContent = String(statusesCount ?? 0);
  if (totalHero) {
    totalHero.classList.toggle("is-empty", empty);
  }
  renderMonthBar({ monthValue: monthValue ?? monthPicker?.value ?? "", totals, empty });
}

function getYearTotalsCacheKey(year, statuses) {
  if (!activeCompanyId || !Number.isFinite(year) || !Array.isArray(statuses) || !statuses.length) return null;
  return `${activeCompanyId}|${year}|${statuses.join(",")}`;
}

function getCachedYearTotals(year, statuses) {
  const key = getYearTotalsCacheKey(year, statuses);
  if (!key) return null;
  return yearTotalsCache.get(key) || null;
}

function yearRangeFromYear(year) {
  const safeYear = Number(year);
  if (!Number.isFinite(safeYear)) return null;
  const from = `${safeYear}-01-01`;
  const to = `${safeYear + 1}-01-01`;
  return { from, to };
}

async function loadYearTotals({ year, statuses, seq }) {
  if (!activeCompanyId || !Number.isFinite(year) || !Array.isArray(statuses) || !statuses.length) return;
  const key = getYearTotalsCacheKey(year, statuses);
  if (!key) return;
  if (yearTotalsCache.has(key)) {
    const cached = yearTotalsCache.get(key);
    if (seq === requestSeq) {
      renderMonthBar({ monthValue: monthPicker?.value ?? `${year}-01`, totals: cached, empty: false });
    }
    return;
  }

  const range = yearRangeFromYear(year);
  if (!range) return;

  const query = new URLSearchParams();
  query.set("companyId", String(activeCompanyId));
  query.set("from", range.from);
  query.set("to", range.to);
  query.set("statuses", statuses.join(","));
  query.set("dateField", "rental_period");

  let orders = [];
  try {
    const res = await fetch(`/api/rental-orders?${query.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load yearly totals.");
    orders = Array.isArray(data.orders) ? data.orders : [];
  } catch {
    return;
  }

  if (seq !== requestSeq) return;

  const orderIds = orders.map((o) => o.id).filter((id) => Number.isFinite(Number(id)));
  const details = await fetchOrderDetails(orderIds, seq);
  if (seq !== requestSeq) return;

  const totals = Array.from({ length: 12 }, () => 0);
  details.forEach((detail) => {
    const order = detail.order || {};
    const lineItems = Array.isArray(detail.lineItems) ? detail.lineItems : [];
    const fees = Array.isArray(detail.fees) ? detail.fees : [];
    for (let index = 0; index < 12; index += 1) {
      const monthKey = `${year}-${String(index + 1).padStart(2, "0")}`;
      const monthTotals = computeOrderMonthTotals({ order, lineItems, fees, monthKey });
      if (monthTotals.total <= 0 && monthTotals.lineItemsTotal <= 0 && monthTotals.feesTotal <= 0) continue;
      totals[index] = roundMoney(totals[index] + monthTotals.total);
    }
  });

  yearTotalsCache.set(key, totals);
  if (seq !== requestSeq) return;
  renderMonthBar({ monthValue: monthPicker?.value ?? `${year}-01`, totals, empty: false });
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscapeValue(value) {
  const raw = String(value ?? "");
  if (window.CSS?.escape) return window.CSS.escape(raw);
  return raw.replace(/["\\]/g, "\\$&");
}

function customerDetailRowId(customerId) {
  const safe = String(customerId ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  return `customer-detail-${safe || "unknown"}`;
}

function moneyNumber(v) {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function fmtMoney(v) {
  const n = moneyNumber(v);
  return `$${n.toFixed(2)}`;
}

function normalizeDateOnlyValue(value) {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const date = new Date(parsed);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return "";
}

function normalizeOrderStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  switch (s) {
    case "quote":
      return "quote";
    case "quote_rejected":
    case "rejected":
      return "quote_rejected";
    case "requested":
    case "request":
      return "requested";
    case "request_rejected":
    case "requested_rejected":
      return "request_rejected";
    case "reservation":
      return "reservation";
    case "ordered":
      return "ordered";
    case "recieved":
      return "received";
    case "received":
      return "received";
    case "closed":
      return "closed";
    default:
      return "quote";
  }
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

function isDemandOnlyStatus(status) {
  const s = normalizeOrderStatus(status);
  return s === "quote" || s === "quote_rejected" || s === "reservation" || s === "requested";
}

function normalizeRateBasis(value) {
  const v = String(value || "").toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly") return v;
  return null;
}

function normalizeRoundingMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "prorate" || raw === "none") return "none";
  if (raw === "ceil" || raw === "floor" || raw === "nearest") return raw;
  return "ceil";
}

function normalizeRoundingGranularity(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "hour" || raw === "day" || raw === "unit") return raw;
  return "unit";
}

function normalizeMonthlyProrationMethod(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "days" || raw === "hours") return raw;
  return "hours";
}

function applyRoundingValue(value, mode) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const normalized = normalizeRoundingMode(mode);
  if (normalized === "none") return n;
  if (normalized === "ceil") return Math.ceil(n - 1e-9);
  if (normalized === "floor") return Math.floor(n + 1e-9);
  return Math.round(n);
}

function applyDurationRoundingMs(activeMs, mode, granularity) {
  const normalized = normalizeRoundingMode(mode);
  if (normalized === "none") return activeMs;
  const unit = normalizeRoundingGranularity(granularity);
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (unit === "hour") {
    const hours = applyRoundingValue(activeMs / hourMs, normalized);
    return Math.max(0, hours) * hourMs;
  }
  if (unit === "day") {
    const days = applyRoundingValue(activeMs / dayMs, normalized);
    return Math.max(0, days) * dayMs;
  }
  return activeMs;
}

function normalizeBillingTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
}

function getTimeZoneParts(date, timeZone) {
  const tz = normalizeBillingTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  if (!Number.isFinite(parts.year)) return 0;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset).toISOString();
}

function daysInMonthUTC(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function splitIntoCalendarMonths({ startAt, endAt, timeZone }) {
  if (!startAt || !endAt) return [];
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const tz = normalizeBillingTimeZone(timeZone);
  const segments = [];
  let cursorIso = start.toISOString();
  const endIso = end.toISOString();
  let guard = 0;
  while (Date.parse(cursorIso) < Date.parse(endIso) && guard < 1200) {
    const cursorDate = new Date(cursorIso);
    const parts = getTimeZoneParts(cursorDate, tz);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextBoundary = zonedTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }, tz);
    if (!nextBoundary) break;
    const nextBoundaryMs = Date.parse(nextBoundary);
    const endMs = Date.parse(endIso);
    const segmentEnd = nextBoundaryMs < endMs ? nextBoundary : endIso;
    if (Date.parse(segmentEnd) <= Date.parse(cursorIso)) break;
    segments.push({
      startAt: cursorIso,
      endAt: segmentEnd,
      daysInMonth: daysInMonthUTC(parts.year, parts.month - 1),
    });
    cursorIso = segmentEnd;
    guard += 1;
  }
  return segments;
}

function monthKeyFromParts(parts) {
  if (!Number.isFinite(parts.year) || !Number.isFinite(parts.month)) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function formatMonthLabel({ year, month }) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "";
  const d = new Date(Date.UTC(year, month - 1, 1));
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: billingTimeZone, year: "numeric", month: "long" });
    return fmt.format(d);
  } catch {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
}

function normalizePausePeriods(periods, { rangeEndMs = null } = {}) {
  const items = Array.isArray(periods) ? periods : [];
  const normalized = items
    .map((p) => {
      const startAt = typeof p?.startAt === "string" ? p.startAt : null;
      const endAt = typeof p?.endAt === "string" ? p.endAt : null;
      const startMs = startAt ? Date.parse(startAt) : NaN;
      if (!Number.isFinite(startMs)) return null;
      let endMs = endAt ? Date.parse(endAt) : NaN;
      if (!Number.isFinite(endMs) && Number.isFinite(rangeEndMs)) {
        endMs = rangeEndMs;
      }
      if (!Number.isFinite(endMs) || endMs <= startMs) return null;
      return { startMs, endMs };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMs - b.startMs);

  const merged = [];
  for (const item of normalized) {
    const last = merged[merged.length - 1];
    if (!last || item.startMs > last.endMs) {
      merged.push({ ...item });
      continue;
    }
    last.endMs = Math.max(last.endMs, item.endMs);
  }
  return merged;
}

function subtractPauses({ startMs, endMs, pauses }) {
  let segments = [{ startMs, endMs }];
  for (const pause of pauses) {
    const next = [];
    for (const seg of segments) {
      const overlapStart = Math.max(seg.startMs, pause.startMs);
      const overlapEnd = Math.min(seg.endMs, pause.endMs);
      if (overlapEnd <= overlapStart) {
        next.push(seg);
        continue;
      }
      if (overlapStart > seg.startMs) {
        next.push({ startMs: seg.startMs, endMs: overlapStart });
      }
      if (overlapEnd < seg.endMs) {
        next.push({ startMs: overlapEnd, endMs: seg.endMs });
      }
    }
    segments = next;
  }
  return segments.filter((seg) => seg.endMs > seg.startMs);
}

function computeSegmentUnits({ segment, rateBasis }) {
  const basis = normalizeRateBasis(rateBasis);
  const startMs = Date.parse(segment.startAt);
  const endMs = Date.parse(segment.endAt);
  if (!basis || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { units: 0, activeDays: 0 };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const activeMs = endMs - startMs;
  const mode = PRORATED_VIEW ? "none" : normalizeRoundingMode(billingRoundingMode);
  const granularity = PRORATED_VIEW ? "unit" : normalizeRoundingGranularity(billingRoundingGranularity);
  const method = normalizeMonthlyProrationMethod(monthlyProrationMethod);

  let units = 0;
  if (basis === "monthly") {
    if (method === "days") {
      let days = activeMs / dayMs;
      if (mode !== "none" && granularity === "day") {
        days = applyRoundingValue(days, mode);
      } else if (mode !== "none") {
        days = Math.ceil(days - 1e-9);
      }
      units = days / segment.daysInMonth;
    } else {
      const adjustedMs =
        mode !== "none" && (granularity === "hour" || granularity === "day")
          ? applyDurationRoundingMs(activeMs, mode, granularity)
          : activeMs;
      units = adjustedMs / (segment.daysInMonth * dayMs);
    }
  } else {
    const adjustedMs =
      mode !== "none" && (granularity === "hour" || granularity === "day")
        ? applyDurationRoundingMs(activeMs, mode, granularity)
        : activeMs;
    const days = adjustedMs / dayMs;
    units = basis === "weekly" ? days / 7 : days;
  }

  if (mode !== "none" && granularity === "unit") {
    units = applyRoundingValue(units, mode);
  }

  return { units, activeDays: activeMs / dayMs };
}

function lineItemQty(lineItem, orderStatus) {
  if (lineItem.bundleId) return 1;
  const ids = Array.isArray(lineItem.inventoryIds) ? lineItem.inventoryIds : [];
  if (ids.length) return ids.length;
  return isDemandOnlyStatus(orderStatus) ? 1 : 0;
}

function fmtDateTime(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: billingTimeZone,
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function docNumberFor(order) {
  const roNumber = order.ro_number || order.roNumber || null;
  const quoteNumber = order.quote_number || order.quoteNumber || null;
  return roNumber && quoteNumber ? `${roNumber} / ${quoteNumber}` : roNumber || quoteNumber || `#${order.id}`;
}

function monthValueFromParts(parts) {
  const key = monthKeyFromParts(parts);
  if (key) return key;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthValue(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month, key: `${match[1]}-${match[2]}` };
}

function monthRangeFromValue(value) {
  const parsed = parseMonthValue(value);
  if (!parsed) return null;
  const monthStr = String(parsed.month).padStart(2, "0");
  const from = `${parsed.year}-${monthStr}-01`;
  const nextMonth = parsed.month === 12 ? 1 : parsed.month + 1;
  const nextYear = parsed.month === 12 ? parsed.year + 1 : parsed.year;
  const to = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { ...parsed, from, to };
}

function selectedStatuses() {
  const statuses = [];
  if (filterRequested?.checked) statuses.push("requested");
  if (filterReservation?.checked) statuses.push("reservation");
  if (filterOrdered?.checked) statuses.push("ordered");
  if (filterReceived?.checked) statuses.push("received");
  if (filterClosed?.checked) statuses.push("closed");
  return statuses;
}

async function loadCompanySettings(companyId) {
  billingRoundingMode = "ceil";
  billingRoundingGranularity = "unit";
  monthlyProrationMethod = "hours";
  billingTimeZone = "UTC";
  const res = await fetch(`/api/company-settings?companyId=${encodeURIComponent(companyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return;
  if (data.settings?.billing_rounding_mode) {
    billingRoundingMode = normalizeRoundingMode(data.settings.billing_rounding_mode);
  }
  if (data.settings?.billing_rounding_granularity) {
    billingRoundingGranularity = normalizeRoundingGranularity(data.settings.billing_rounding_granularity);
  }
  if (data.settings?.monthly_proration_method) {
    monthlyProrationMethod = normalizeMonthlyProrationMethod(data.settings.monthly_proration_method);
  }
  if (data.settings?.billing_timezone) {
    billingTimeZone = normalizeBillingTimeZone(data.settings.billing_timezone);
  }
}

function computeOrderMonthTotals({ order, lineItems, fees, monthKey }) {
  const orderStatus = normalizeOrderStatus(order?.status);
  const nowIso = new Date().toISOString();
  let lineItemsTotal = 0;
  let feesTotal = 0;
  let hasOpenItems = false;
  const warnings = [];

  lineItems.forEach((li, index) => {
    const rateBasis = normalizeRateBasis(li.rateBasis);
    const rateAmount = li.rateAmount;
    const qty = lineItemQty(li, orderStatus);
    const startAt = li.fulfilledAt || li.startAt;
    const endAtRaw = li.returnedAt || li.endAt;

    if (!rateBasis) {
      warnings.push(`Line item ${index + 1} missing rate basis.`);
      return;
    }
    if (!Number.isFinite(Number(rateAmount))) {
      warnings.push(`Line item ${index + 1} missing rate amount.`);
      return;
    }
    if (!qty) {
      warnings.push(`Line item ${index + 1} has no billable units assigned.`);
      return;
    }
    if (!startAt || !endAtRaw) {
      warnings.push(`Line item ${index + 1} missing start or end date.`);
      return;
    }

    let endAt = endAtRaw;
    if (!li.returnedAt) {
      const endMs = Date.parse(endAtRaw);
      if (Number.isFinite(endMs) && endMs < Date.now()) {
        endAt = nowIso;
      }
      hasOpenItems = true;
    }

    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      warnings.push(`Line item ${index + 1} has invalid dates.`);
      return;
    }

    const pauses = normalizePausePeriods(li.pausePeriods, { rangeEndMs: endMs });
    const activeSegments = subtractPauses({ startMs, endMs, pauses });
    if (!activeSegments.length) return;

    activeSegments.forEach((seg) => {
      const segments = splitIntoCalendarMonths({
        startAt: new Date(seg.startMs).toISOString(),
        endAt: new Date(seg.endMs).toISOString(),
        timeZone: billingTimeZone,
      });

      segments.forEach((segment) => {
        const parts = getTimeZoneParts(new Date(segment.startAt), billingTimeZone);
        const key = monthKeyFromParts(parts);
        if (!key || key !== monthKey) return;
        const { units } = computeSegmentUnits({ segment, rateBasis });
        if (!Number.isFinite(units) || units <= 0) return;
        const amount = roundMoney(units * Number(rateAmount) * qty);
        lineItemsTotal = roundMoney(lineItemsTotal + amount);
      });
    });
  });

  (fees || []).forEach((fee) => {
    const amount = moneyNumber(fee.amount);
    const date = normalizeDateOnlyValue(fee.feeDate || fee.fee_date || "");
    if (!date) return;
    const feeMonthKey = date.slice(0, 7);
    if (feeMonthKey !== monthKey) return;
    feesTotal = roundMoney(feesTotal + amount);
  });

  const total = roundMoney(lineItemsTotal + feesTotal);
  return { lineItemsTotal, feesTotal, total, warnings, hasOpenItems };
}

function buildCustomerDetailPanel(customer, monthLabel) {
  const panel = document.createElement("div");
  panel.className = "details-panel customer-detail-panel";

  const header = document.createElement("div");
  header.className = "customer-detail-header";
  header.innerHTML = `
    <div class="customer-detail-title">${escapeHtml(customer.name)}</div>
    <div class="customer-detail-meta">${customer.orders.length} order(s) · Total ${escapeHtml(fmtMoney(customer.total))}</div>
  `;
  panel.appendChild(header);

  const content = document.createElement("div");
  content.className = "stack";

  if (!customer.orders.length) {
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = `No rental orders with charges in ${monthLabel || "this month"}.`;
    content.appendChild(empty);
  } else {
    const table = document.createElement("div");
    table.className = "table customer-orders-table";
    table.innerHTML = `
      <div class="table-row table-header">
        <span>Order</span>
        <span>Status</span>
        <span>Start</span>
        <span>End</span>
        <span>Line items</span>
        <span>Fees</span>
        <span>Total</span>
        <span></span>
      </div>
    `;

    customer.orders.forEach((order) => {
      const row = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `
        <span>${escapeHtml(order.doc)}</span>
        <span>${escapeHtml(statusLabel(order.status))}</span>
        <span>${escapeHtml(fmtDateTime(order.startAt))}</span>
        <span>${escapeHtml(fmtDateTime(order.endAt))}</span>
        <span>${escapeHtml(fmtMoney(order.lineItemsTotal))}</span>
        <span>${escapeHtml(fmtMoney(order.feesTotal))}</span>
        <span><strong>${escapeHtml(fmtMoney(order.total))}</strong></span>
        <span style="justify-self:end;">
          <a class="table-link" href="rental-order-form.html?id=${encodeURIComponent(order.id)}">Open</a>
        </span>
      `;
      table.appendChild(row);
    });
    content.appendChild(table);
  }

  panel.appendChild(content);
  return panel;
}

function renderCustomerTable(
  customers,
  monthLabel = "this month",
  { emptyMessage = "No customer totals for this month.", sortField = customerSortField, sortDir = customerSortDir } = {}
) {
  if (!customerTable) return;
  const indicator = (field) => {
    if (sortField !== field) return "";
    return sortDir === "asc" ? "^" : "v";
  };
  customerTable.innerHTML = `
    <div class="table-row table-header">
      <span class="sort ${sortField === "customer" ? "active" : ""}" data-sort="customer">Customer ${indicator("customer")}</span>
      <span class="sort ${sortField === "orders" ? "active" : ""}" data-sort="orders">Orders ${indicator("orders")}</span>
      <span class="sort ${sortField === "line_items" ? "active" : ""}" data-sort="line_items">Line items ${indicator("line_items")}</span>
      <span class="sort ${sortField === "fees" ? "active" : ""}" data-sort="fees">Fees ${indicator("fees")}</span>
      <span class="sort ${sortField === "total" ? "active" : ""}" data-sort="total">Total ${indicator("total")}</span>
    </div>
  `;

  if (!customers.length) {
    customerTable.innerHTML += `
      <div class="table-row" style="grid-template-columns: 1fr; padding: 2rem; justify-items: center; color: var(--text-secondary);">
        ${escapeHtml(emptyMessage)}
      </div>
    `;
    return;
  }

  customers.forEach((customer, index) => {
    const row = document.createElement("div");
    row.className = "table-row customer-row";
    row.dataset.customerId = String(customer.id);
    if (index % 2 === 0) {
      row.classList.add("is-even");
    }
    const detailRowId = customerDetailRowId(`${customer.id}-${index}`);
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-expanded", "false");
    row.setAttribute("aria-controls", detailRowId);
    row.innerHTML = `
      <span>${escapeHtml(customer.name)}</span>
      <span>${customer.orders.length}</span>
      <span>${escapeHtml(fmtMoney(customer.lineItemsTotal))}</span>
      <span>${escapeHtml(fmtMoney(customer.feesTotal))}</span>
      <span><strong>${escapeHtml(fmtMoney(customer.total))}</strong></span>
    `;
    customerTable.appendChild(row);

    const detailRow = document.createElement("div");
    detailRow.className = "table-row table-row-detail";
    detailRow.dataset.customerId = String(customer.id);
    detailRow.id = detailRowId;
    detailRow.setAttribute("aria-hidden", "true");
    detailRow.appendChild(buildCustomerDetailPanel(customer, monthLabel));
    customerTable.appendChild(detailRow);
  });
}

async function fetchOrderDetails(orderIds, seq) {
  const results = [];
  const concurrency = 6;
  let index = 0;

  async function worker() {
    while (index < orderIds.length) {
      const current = index;
      index += 1;
      const id = orderIds[current];
      if (!id) continue;
      try {
        const res = await fetch(`/api/rental-orders/${encodeURIComponent(id)}?companyId=${encodeURIComponent(activeCompanyId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        results.push(data);
      } catch {
        // ignore
      }
      if (seq !== requestSeq) return;
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, orderIds.length) }, worker);
  await Promise.all(workers);
  return results;
}

async function loadMonthlyTotals() {
  const seq = ++requestSeq;
  if (!activeCompanyId) {
    setPageMeta("Log in to view monthly totals.");
    updateMonthlyTotalHero({ monthLabel: "Log in to view totals", statusesCount: selectedStatuses().length, empty: true });
    return;
  }

  await loadCompanySettings(activeCompanyId);
  if (seq !== requestSeq) return;

  const parsed = monthRangeFromValue(monthPicker?.value);
  if (!parsed) {
    setPageMeta("Select a valid month.");
    updateMonthlyTotalHero({ monthLabel: "Select a month", statusesCount: selectedStatuses().length, empty: true });
    return;
  }

  const monthLabel = formatMonthLabel({ year: parsed.year, month: parsed.month });
  const statuses = selectedStatuses();
  const cachedTotals = getCachedYearTotals(parsed.year, statuses);
  if (!statuses.length) {
    setPageMeta("Select at least one status.");
    updateCustomerList([], monthLabel);
    updateMonthlyTotalHero({ monthLabel, monthValue: parsed.key, statusesCount: 0, totals: cachedTotals, empty: true });
    return;
  }

  const query = new URLSearchParams();
  query.set("companyId", String(activeCompanyId));
  query.set("from", parsed.from);
  query.set("to", parsed.to);
  query.set("statuses", statuses.join(","));
  query.set("dateField", "rental_period");

  setPageMeta(`Loading ${monthLabel} totals...`);
  setAsOfMeta("");
  updateMonthlyTotalHero({
    monthLabel,
    monthValue: parsed.key,
    statusesCount: statuses.length,
    totals: cachedTotals,
    empty: true,
  });
  loadYearTotals({ year: parsed.year, statuses, seq });

  let orders = [];
  let customersList = [];
  try {
    const [ordersRes, customersRes] = await Promise.all([
      fetch(`/api/rental-orders?${query.toString()}`),
      fetch(`/api/customers?companyId=${encodeURIComponent(activeCompanyId)}`),
    ]);
    const ordersData = await ordersRes.json().catch(() => ({}));
    if (!ordersRes.ok) throw new Error(ordersData.error || "Unable to load rental orders.");
    orders = Array.isArray(ordersData.orders) ? ordersData.orders : [];
    if (customersRes.ok) {
      const customersData = await customersRes.json().catch(() => ({}));
      customersList = Array.isArray(customersData.customers) ? customersData.customers : [];
    }
  } catch (err) {
    if (seq !== requestSeq) return;
    setPageMeta(err.message || String(err));
    updateCustomerList([], monthLabel);
    updateMonthlyTotalHero({
      monthLabel,
      monthValue: parsed.key,
      statusesCount: statuses.length,
      totals: cachedTotals,
      empty: true,
    });
    return;
  }

  if (seq !== requestSeq) return;

  if (!orders.length && !customersList.length) {
    setPageMeta(`No rental orders or customers in ${monthLabel}.`);
    updateCustomerList([], monthLabel);
    updateMonthlyTotalHero({
      monthLabel,
      monthValue: parsed.key,
      statusesCount: statuses.length,
      totals: cachedTotals,
      empty: true,
    });
    return;
  }

  const orderIds = orders.map((o) => o.id).filter((id) => Number.isFinite(Number(id)));
  const details = await fetchOrderDetails(orderIds, seq);
  if (seq !== requestSeq) return;

  const customerMap = new Map();
  customersList.forEach((customer) => {
    const id = customer.id ?? customer.customer_id ?? null;
    const name =
      customer.company_name || customer.companyName || customer.name || customer.contact_name || "Customer";
    const key = id ? String(id) : name;
    if (customerMap.has(key)) return;
    customerMap.set(key, {
      id: id || key,
      name,
      total: 0,
      lineItemsTotal: 0,
      feesTotal: 0,
      orders: [],
    });
  });
  let totalOrders = 0;
  let grandTotal = 0;
  let hasOpenItems = false;

  details.forEach((detail) => {
    const order = detail.order || {};
    const lineItems = Array.isArray(detail.lineItems) ? detail.lineItems : [];
    const fees = Array.isArray(detail.fees) ? detail.fees : [];
    const totals = computeOrderMonthTotals({ order, lineItems, fees, monthKey: parsed.key });
    if (totals.total <= 0 && totals.lineItemsTotal <= 0 && totals.feesTotal <= 0) return;

    const customerId = order.customer_id || order.customerId || order.customer_id;
    const customerName =
      order.customer_name || order.customerName || order.customer || order.customer_name || "Customer";
    const key = customerId ? String(customerId) : customerName;
    const entry = customerMap.get(key) || {
      id: customerId || key,
      name: customerName,
      total: 0,
      lineItemsTotal: 0,
      feesTotal: 0,
      orders: [],
    };

    entry.total = roundMoney(entry.total + totals.total);
    entry.lineItemsTotal = roundMoney(entry.lineItemsTotal + totals.lineItemsTotal);
    entry.feesTotal = roundMoney(entry.feesTotal + totals.feesTotal);

    entry.orders.push({
      id: order.id,
      doc: docNumberFor(order),
      status: order.status,
      startAt: order.start_at || order.startAt,
      endAt: order.end_at || order.endAt,
      lineItemsTotal: totals.lineItemsTotal,
      feesTotal: totals.feesTotal,
      total: totals.total,
    });

    customerMap.set(key, entry);
    totalOrders += 1;
    grandTotal = roundMoney(grandTotal + totals.total);
    if (totals.hasOpenItems) hasOpenItems = true;
  });

  const customers = Array.from(customerMap.values())
    .map((c) => ({
      ...c,
      orders: c.orders.sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const customersWithCharges = customers.filter((c) => c.total > 0).length;

  if (!customers.length) {
    setPageMeta(`No customer charges in ${monthLabel}.`);
    updateCustomerList([], monthLabel);
    setAsOfMeta("");
    updateMonthlyTotalHero({
      monthLabel,
      monthValue: parsed.key,
      statusesCount: statuses.length,
      totals: getCachedYearTotals(parsed.year, statuses),
      empty: true,
    });
    return;
  }

  const customerLabel =
    customersWithCharges === customers.length
      ? `${customers.length} customers`
      : `${customersWithCharges} / ${customers.length} customers with charges`;
  setPageMeta(`${monthLabel} - ${customerLabel} - ${totalOrders} orders - Total ${fmtMoney(grandTotal)}`);
  setAsOfMeta(hasOpenItems ? `Includes ongoing items through ${fmtDateTime(new Date().toISOString())}.` : "");
  updateMonthlyTotalHero({
    monthLabel,
    monthValue: parsed.key,
    totalValueText: fmtMoney(grandTotal),
    customersWithCharges,
    customersTotal: customers.length,
    totalOrders,
    statusesCount: statuses.length,
    totals: getCachedYearTotals(parsed.year, statuses),
    empty: false,
  });

  updateCustomerList(customers, monthLabel);
}

function updateUrlMonth(value) {
  const parsed = parseMonthValue(value);
  if (!parsed) return;
  const next = new URLSearchParams(window.location.search);
  next.set("month", parsed.key);
  const nextUrl = `${window.location.pathname}?${next.toString()}`;
  window.history.replaceState({}, "", nextUrl);
}

function initMonthPicker() {
  const urlMonth = params.get("month");
  const preset = parseMonthValue(urlMonth);
  if (monthPicker && preset) {
    monthPicker.value = preset.key;
    return;
  }
  const parts = getTimeZoneParts(new Date(), billingTimeZone);
  const fallback = monthValueFromParts(parts);
  if (monthPicker) monthPicker.value = fallback;
}

async function init() {
  const session = window.RentSoft?.getSession?.();
  activeCompanyId = window.RentSoft?.getCompanyId?.();
  if (!session || !activeCompanyId) {
    setCompanyMeta("Log in to view monthly totals.");
    setPageMeta("Missing session.");
    return;
  }

  await loadCompanySettings(activeCompanyId);
  initMonthPicker();

  const companyName =
    session?.company?.name ||
    session?.company?.company_name ||
    session?.companyName ||
    session?.company?.companyName ||
    "Company";
  setCompanyMeta(`${companyName} - Billing TZ: ${billingTimeZone}`);

  await loadMonthlyTotals();
}

function toggleCustomerRow(row) {
  if (!row || !customerTable) return;
  const customerId = row.dataset.customerId;
  if (!customerId) return;
  const detailRow = customerTable.querySelector(
    `.table-row-detail[data-customer-id="${cssEscapeValue(customerId)}"]`
  );
  if (!detailRow) return;
  const nextOpen = !detailRow.classList.contains("is-open");
  detailRow.classList.toggle("is-open", nextOpen);
  detailRow.setAttribute("aria-hidden", nextOpen ? "false" : "true");
  row.classList.toggle("is-active", nextOpen);
  row.setAttribute("aria-expanded", nextOpen ? "true" : "false");
}

customerTable?.addEventListener("click", (e) => {
  const target = e.target;
  const sortEl = target?.closest?.(".sort");
  if (sortEl) {
    const field = sortEl.dataset.sort;
    if (!CUSTOMER_SORT_FIELDS.has(field)) return;
    if (customerSortField === field) {
      customerSortDir = customerSortDir === "asc" ? "desc" : "asc";
    } else {
      customerSortField = field;
      customerSortDir = field === "customer" ? "asc" : "desc";
    }
    applyCustomerView();
    return;
  }
  if (target?.closest?.("a") || target?.closest?.("button") || target?.closest?.("input")) return;
  const row = target?.closest?.(".table-row.customer-row");
  if (!row) return;
  toggleCustomerRow(row);
});

customerTable?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target?.closest?.(".table-row.customer-row");
  if (!row) return;
  e.preventDefault();
  toggleCustomerRow(row);
});

monthPicker?.addEventListener("change", () => {
  updateUrlMonth(monthPicker.value);
  loadMonthlyTotals();
});

monthBar?.addEventListener("click", (e) => {
  const target = e.target?.closest?.(".month-seg");
  if (!target) return;
  const monthValue = target.dataset.month;
  if (!monthValue || !monthPicker) return;
  monthPicker.value = monthValue;
  updateUrlMonth(monthValue);
  loadMonthlyTotals();
});

refreshBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  loadMonthlyTotals();
});

customerSearchInput?.addEventListener("input", (e) => {
  customerSearchTerm = e.target?.value || "";
  applyCustomerView();
});

[filterRequested, filterReservation, filterOrdered, filterReceived, filterClosed]
  .filter(Boolean)
  .forEach((el) => {
    el.addEventListener("change", () => loadMonthlyTotals());
  });

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    setCompanyMeta(err.message || String(err));
    setPageMeta("Unable to load monthly totals.");
  });
});
