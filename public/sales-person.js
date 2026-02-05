const params = new URLSearchParams(window.location.search);
const salesPersonId = params.get("id");

const companyMeta = document.getElementById("company-meta");
const titleEl = document.getElementById("sp-title");

const rangeStartInput = document.getElementById("range-start");
const rangeDaysSelect = document.getElementById("range-days");
const revenueCanvas = document.getElementById("sp-revenue-chart");
const imageWrap = document.getElementById("sp-image-wrap");
const imageEl = document.getElementById("sp-image");

const nameInput = document.getElementById("sp-name");
const emailInput = document.getElementById("sp-email");
const phoneInput = document.getElementById("sp-phone");
const imageFileInput = document.getElementById("sp-image-file");
const saveBtn = document.getElementById("save-sp");
const deleteBtn = document.getElementById("delete-sp");
const formMeta = document.getElementById("sp-meta");

let chart = null;
let currentImageUrl = null;
let requestSeq = 0;

let billingRoundingMode = "ceil";
let billingRoundingGranularity = "unit";
let monthlyProrationMethod = "hours";
let billingTimeZone = "UTC";

const PRORATED_VIEW = true;
const DEFAULT_STATUSES = ["requested", "reservation", "ordered", "received", "closed"];

const DAY_MS = 24 * 60 * 60 * 1000;

async function uploadImage({ companyId, file }) {
  const body = new FormData();
  body.append("companyId", String(companyId));
  body.append("image", file);
  const res = await fetch("/api/uploads/image", { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to upload image");
  if (!data.url) throw new Error("Upload did not return an image url");
  return data.url;
}

async function deleteUploadedImage({ companyId, url }) {
  if (!url) return;
  const res = await fetch("/api/uploads/image", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, url }),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error || "Unable to delete image");
}

function syncSalesPersonImage(url) {
  if (!imageWrap || !imageEl) return;
  const next = url ? String(url) : "";
  if (!next) {
    imageEl.removeAttribute("src");
    imageWrap.hidden = true;
    return;
  }
  imageEl.src = next;
  imageWrap.hidden = false;
}

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
    const day = x.getDay();
    const offset = (day + 6) % 7;
    return new Date(x.getTime() - offset * DAY_MS);
  }
  return x;
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

function computeOrderMonthTotals({ order, lineItems, fees, monthKey }) {
  const orderStatus = normalizeOrderStatus(order?.status);
  const nowIso = new Date().toISOString();
  let lineItemsTotal = 0;
  let feesTotal = 0;
  let hasOpenItems = false;

  lineItems.forEach((li) => {
    const rateBasis = normalizeRateBasis(li.rateBasis);
    const rateAmount = li.rateAmount;
    const qty = lineItemQty(li, orderStatus);
    const startAt = li.fulfilledAt || li.startAt;
    const endAtRaw = li.returnedAt || li.endAt;

    if (!rateBasis) return;
    if (!Number.isFinite(Number(rateAmount))) return;
    if (!qty) return;
    if (!startAt || !endAtRaw) return;

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
  return { lineItemsTotal, feesTotal, total, hasOpenItems };
}

function formatMonthLabel(key) {
  const [year, month] = String(key || "").split("-").map((v) => Number(v));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key || "";
  const d = new Date(Date.UTC(year, month - 1, 1));
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: billingTimeZone, year: "numeric", month: "short" });
    return fmt.format(d);
  } catch {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
}

function qboDocMonthKey(doc) {
  const raw = doc?.txn_date || doc?.txnDate || doc?.raw?.TxnDate || null;
  const date = normalizeDateOnlyValue(raw);
  if (!date) return null;
  return date.slice(0, 7);
}

function qboDocTotal(doc) {
  const raw = doc?.total_amount ?? doc?.totalAmount ?? doc?.raw?.TotalAmt ?? 0;
  return moneyNumber(raw);
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

async function fetchOrderDetails(orderIds, seq, companyId) {
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
        const res = await fetch(`/api/rental-orders/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`);
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

async function fetchQboDocuments(orderIds, seq, companyId) {
  const results = [];
  const concurrency = 4;
  let index = 0;

  async function worker() {
    while (index < orderIds.length) {
      const current = index;
      index += 1;
      const id = orderIds[current];
      if (!id) continue;
      try {
        const res = await fetch(
          `/api/qbo/rental-orders/${encodeURIComponent(id)}/documents?companyId=${encodeURIComponent(companyId)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) continue;
        const docs = Array.isArray(data.documents) ? data.documents : [];
        results.push(...docs);
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

async function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    if (companyMeta) companyMeta.textContent = "Log in and select a company to view sales people.";
    return;
  }
  if (!salesPersonId) {
    if (titleEl) titleEl.textContent = "Sales person not found";
    return;
  }

  const companyName = session?.company?.name ? String(session.company.name) : null;
  if (companyMeta) companyMeta.textContent = companyName ? `${companyName} (Company #${companyId})` : `Company #${companyId}`;

  const rangeDays = Number(rangeDaysSelect?.value) || 365;
  const rangeStart = startOfLocalDay(new Date(Date.now() - rangeDays * DAY_MS));
  if (rangeStartInput) rangeStartInput.value = toLocalDateInputValue(rangeStart);

  await loadCompanySettings(companyId);

  const spRes = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}?companyId=${encodeURIComponent(companyId)}`);
  const spData = await spRes.json().catch(() => ({}));
  if (!spRes.ok) throw new Error(spData.error || "Unable to load sales person");
  const sp = spData.salesPerson || null;
  if (titleEl) titleEl.textContent = sp?.name || "Sales person";
  if (nameInput) nameInput.value = sp?.name || "";
  if (emailInput) emailInput.value = sp?.email || "";
  if (phoneInput) phoneInput.value = sp?.phone || "";
  currentImageUrl = sp?.image_url || null;
  syncSalesPersonImage(currentImageUrl);

  async function loadChart() {
    if (!revenueCanvas) return;
    if (typeof Chart === "undefined") return;

    const seq = ++requestSeq;
    const days = Number(rangeDaysSelect?.value) || 365;
    const dt = parseLocalDateInputValue(rangeStartInput?.value);
    const fromDate = dt ? startOfLocalDay(dt) : startOfLocalDay(new Date(Date.now() - days * DAY_MS));
    const toDate = new Date(fromDate.getTime() + days * DAY_MS);

    const bucketKeys = buildBucketKeys(fromDate, toDate, "month");
    const labels = bucketKeys.map((key) => formatMonthLabel(key));
    const chargesMap = new Map(bucketKeys.map((key) => [key, 0]));
    const qboMap = new Map(bucketKeys.map((key) => [key, 0]));

    const qs = new URLSearchParams({
      companyId: String(companyId),
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      statuses: DEFAULT_STATUSES.join(","),
      dateField: "rental_period",
    });
    const res = await fetch(`/api/rental-orders?${qs.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Unable to load rental orders");

    const orders = Array.isArray(data.orders) ? data.orders : [];
    const filteredOrders = orders.filter((order) => {
      const spId =
        order.salesperson_id ?? order.salespersonId ?? order.sales_person_id ?? order.salesPersonId ?? null;
      if (!spId) return false;
      return String(spId) === String(salesPersonId);
    });
    const orderIds = filteredOrders.map((o) => o.id).filter((id) => Number.isFinite(Number(id)));

    if (orderIds.length) {
      const details = await fetchOrderDetails(orderIds, seq, companyId);
      if (seq !== requestSeq) return;

      details.forEach((detail) => {
        const order = detail.order || {};
        const lineItems = Array.isArray(detail.lineItems) ? detail.lineItems : [];
        const fees = Array.isArray(detail.fees) ? detail.fees : [];
        bucketKeys.forEach((key) => {
          const totals = computeOrderMonthTotals({ order, lineItems, fees, monthKey: key });
          if (totals.total <= 0 && totals.lineItemsTotal <= 0 && totals.feesTotal <= 0) return;
          chargesMap.set(key, roundMoney((chargesMap.get(key) || 0) + totals.total));
        });
      });

      const docs = await fetchQboDocuments(orderIds, seq, companyId);
      if (seq !== requestSeq) return;
      docs.forEach((doc) => {
        if (doc?.is_deleted || doc?.is_voided) return;
        const type = String(doc?.qbo_entity_type || "").toLowerCase();
        if (type && type !== "invoice") return;
        const monthKey = qboDocMonthKey(doc);
        if (!monthKey || !qboMap.has(monthKey)) return;
        const amount = qboDocTotal(doc);
        if (!Number.isFinite(amount)) return;
        qboMap.set(monthKey, roundMoney((qboMap.get(monthKey) || 0) + amount));
      });
    }

    const chargeValues = bucketKeys.map((key) => roundMoney(chargesMap.get(key) || 0));
    const qboValues = bucketKeys.map((key) => roundMoney(qboMap.get(key) || 0));

    if (chart) chart.destroy();
    chart = new Chart(revenueCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Monthly charges",
            data: chargeValues,
            backgroundColor: "rgba(37, 99, 235, 0.65)",
            borderColor: "rgba(37, 99, 235, 0.9)",
            borderWidth: 1,
          },
          {
            label: "QBO invoices",
            data: qboValues,
            backgroundColor: "rgba(16, 185, 129, 0.65)",
            borderColor: "rgba(16, 185, 129, 0.9)",
            borderWidth: 1,
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
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } },
        },
      },
    });

  }

  [rangeStartInput, rangeDaysSelect].filter(Boolean).forEach((el) => el.addEventListener("change", () => loadChart().catch((e) => (companyMeta.textContent = e.message))));
  await loadChart();

  saveBtn?.addEventListener("click", async () => {
    if (formMeta) formMeta.textContent = "";
    const name = String(nameInput?.value || "").trim();
    if (!name) {
      if (formMeta) formMeta.textContent = "Name is required.";
      return;
    }
    saveBtn.disabled = true;
    try {
      const imageFile = imageFileInput?.files?.[0] || null;
      const previousImageUrl = currentImageUrl;
      let imageUrl = currentImageUrl;
      if (imageFile) imageUrl = await uploadImage({ companyId, file: imageFile });

      const res = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          name,
          email: String(emailInput?.value || "").trim() || null,
          phone: String(phoneInput?.value || "").trim() || null,
          imageUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (imageFile && imageUrl) await deleteUploadedImage({ companyId, url: imageUrl }).catch(() => {});
        throw new Error(data.error || "Unable to save sales person");
      }
      if (titleEl) titleEl.textContent = data.salesPerson?.name || name;
      currentImageUrl = data.salesPerson?.image_url ?? imageUrl ?? null;
      syncSalesPersonImage(currentImageUrl);
      if (imageFileInput) imageFileInput.value = "";
      if (imageFile && previousImageUrl && previousImageUrl !== currentImageUrl) {
        await deleteUploadedImage({ companyId, url: previousImageUrl }).catch(() => {});
      }
      if (formMeta) formMeta.textContent = "Saved.";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    if (!window.confirm("Delete this sales person?")) return;
    if (formMeta) formMeta.textContent = "";
    deleteBtn.disabled = true;
    try {
      const res = await fetch(`/api/sales-people/${encodeURIComponent(salesPersonId)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: Number(companyId) }),
      });
      if (res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unable to delete sales person");
      }
      window.location.href = "sales-people.html";
    } catch (err) {
      if (formMeta) formMeta.textContent = err.message || String(err);
      deleteBtn.disabled = false;
    }
  });
}

init().catch((err) => {
  if (companyMeta) companyMeta.textContent = err.message || String(err);
});
