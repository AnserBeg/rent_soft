const params = new URLSearchParams(window.location.search);
const orderId = params.get("id");
const fromParam = params.get("from");

const companyMeta = document.getElementById("company-meta");
const orderSummaryEl = document.getElementById("order-summary");
const pageMeta = document.getElementById("page-meta");
const monthlyTable = document.getElementById("monthly-charges-table");
const monthlyDetails = document.getElementById("monthly-details");
const backToOrder = document.getElementById("back-to-order");

let billingRoundingMode = "ceil";
let billingRoundingGranularity = "unit";
let monthlyProrationMethod = "hours";
let billingTimeZone = "UTC";
const PRORATED_VIEW = true;

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

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function lineItemLabel(lineItem) {
  if (lineItem.bundleName) return `Bundle: ${lineItem.bundleName}`;
  return lineItem.typeName || "Line item";
}

function unitLabelForBasis(rateBasis, units) {
  const basis = normalizeRateBasis(rateBasis);
  if (basis === "monthly") return units === 1 ? "month" : "months";
  if (basis === "weekly") return units === 1 ? "week" : "weeks";
  return units === 1 ? "day" : "days";
}

function rateLabel(rateBasis, rateAmount, qty) {
  const basis = normalizeRateBasis(rateBasis);
  const amount = moneyNumber(rateAmount);
  const basisLabel = basis ? basis.charAt(0).toUpperCase() + basis.slice(1) : "Rate";
  const qtyLabel = qty && qty > 1 ? ` x ${qty}` : "";
  return `${basisLabel} ${fmtMoney(amount)}${qtyLabel}`;
}

function orderDateRange(lineItems) {
  let earliest = null;
  let latest = null;
  lineItems.forEach((li) => {
    const startAt = li.fulfilledAt || li.startAt;
    const endAt = li.returnedAt || li.endAt;
    const startMs = startAt ? Date.parse(startAt) : NaN;
    const endMs = endAt ? Date.parse(endAt) : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
    if (earliest === null || startMs < earliest) earliest = startMs;
    if (latest === null || endMs > latest) latest = endMs;
  });
  return { earliest, latest };
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

function renderOrderSummary(order, lineItems, totals, warnings, asOfLabel) {
  if (!orderSummaryEl) return;
  const status = normalizeOrderStatus(order?.status);
  const { earliest, latest } = orderDateRange(lineItems || []);
  const rangeText = earliest && latest ? `${fmtDateTime(earliest)} to ${fmtDateTime(latest)}` : "Dates pending";
  const headerLine = [
    order?.ro_number || order?.roNumber || order?.quote_number || order?.quoteNumber || `Order #${order?.id || "--"}`,
    order?.customer_name || order?.customerName || "--",
  ]
    .filter(Boolean)
    .join(" • ");

  const totalsLine = `Line items: ${fmtMoney(totals.lineItemsTotal)} • Fees: ${fmtMoney(totals.feesTotal)} • Total: ${fmtMoney(
    totals.grandTotal
  )}`;

  const warningText = warnings.length ? warnings.join(" ") : "";

  orderSummaryEl.innerHTML = `
    <div>
      <strong>${escapeHtml(headerLine)}</strong>
      <div class="hint">${escapeHtml(status)} • ${escapeHtml(rangeText)}</div>
      ${asOfLabel ? `<div class="hint">${escapeHtml(asOfLabel)}</div>` : ""}
    </div>
    <div class="totals-row" style="justify-content: space-between;">
      <span class="hint">Totals</span>
      <strong>${escapeHtml(totalsLine)}</strong>
    </div>
    ${warningText ? `<div class="hint">${escapeHtml(warningText)}</div>` : ""}
  `;
}

function renderMonthlyTable(months) {
  if (!monthlyTable) return;
  monthlyTable.innerHTML = `
    <div class="table-row table-header">
      <span>Month</span>
      <span>Line items</span>
      <span>Fees</span>
      <span>Total</span>
    </div>
  `;

  months.forEach((month) => {
    const row = document.createElement("div");
    row.className = "table-row";
    const label = month.isUndated ? "Undated fees" : month.label;
    row.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(fmtMoney(month.lineItemsTotal))}</span>
      <span>${escapeHtml(fmtMoney(month.feesTotal))}</span>
      <span><strong>${escapeHtml(fmtMoney(month.total))}</strong></span>
    `;
    monthlyTable.appendChild(row);
  });
}

function renderMonthlyDetails(months) {
  if (!monthlyDetails) return;
  monthlyDetails.innerHTML = "";

  months.forEach((month) => {
    const wrapper = document.createElement("div");
    wrapper.className = "details-panel";
    const label = month.isUndated ? "Undated fees" : month.label;
    const summaryText = `${label} • ${fmtMoney(month.total)} (Line items ${fmtMoney(month.lineItemsTotal)}, Fees ${fmtMoney(
      month.feesTotal
    )})`;

    const details = document.createElement("details");
    details.className = "inventory-selection-details";
    details.open = true;
    details.innerHTML = `<summary>${escapeHtml(summaryText)}</summary>`;

    const content = document.createElement("div");
    content.className = "stack";
    content.style.marginTop = "10px";

    if (month.items.length) {
      const table = document.createElement("div");
      table.className = "table";
      table.innerHTML = `
        <div class="table-row table-header">
          <span>Line item</span>
          <span>Billable units</span>
          <span>Rate</span>
          <span>Charge</span>
        </div>
      `;
      month.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `
          <span>${escapeHtml(item.label)}</span>
          <span>${escapeHtml(item.unitsLabel)}</span>
          <span>${escapeHtml(item.rateLabel)}</span>
          <span><strong>${escapeHtml(fmtMoney(item.amount))}</strong></span>
        `;
        table.appendChild(row);
      });
      content.appendChild(table);
    } else {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "No line item charges for this month.";
      content.appendChild(empty);
    }

    if (month.fees.length) {
      const table = document.createElement("div");
      table.className = "table";
      table.innerHTML = `
        <div class="table-row table-header">
          <span>Fee</span>
          <span>Date</span>
          <span>Amount</span>
        </div>
      `;
      month.fees.forEach((fee) => {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `
          <span>${escapeHtml(fee.name || "Fee")}</span>
          <span>${escapeHtml(fee.dateLabel || "--")}</span>
          <span><strong>${escapeHtml(fmtMoney(fee.amount))}</strong></span>
        `;
        table.appendChild(row);
      });
      content.appendChild(table);
    } else if (!month.isUndated) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = "No additional fees for this month.";
      content.appendChild(empty);
    }

    details.appendChild(content);
    wrapper.appendChild(details);
    monthlyDetails.appendChild(wrapper);
  });
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

function computeMonthlyBreakdown({ order, lineItems, fees }) {
  const months = new Map();
  const warnings = [];
  const orderStatus = normalizeOrderStatus(order?.status);
  const openItems = [];
  const nowIso = new Date().toISOString();

  function ensureMonth(key, year, month, isUndated = false) {
    if (!months.has(key)) {
      months.set(key, {
        key,
        year,
        month,
        label: isUndated ? "Undated fees" : formatMonthLabel({ year, month }),
        lineItemsTotal: 0,
        feesTotal: 0,
        total: 0,
        itemsByKey: new Map(),
        items: [],
        fees: [],
        isUndated,
      });
    }
    return months.get(key);
  }

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
      openItems.push(li);
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
        if (!key) return;
        const month = ensureMonth(key, parts.year, parts.month);
        const { units, activeDays } = computeSegmentUnits({ segment, rateBasis });
        if (!Number.isFinite(units) || units <= 0) return;
        const amount = roundMoney(units * Number(rateAmount) * qty);
        const itemKey = li.id ? `li-${li.id}` : `li-${index}`;
        const entry = month.itemsByKey.get(itemKey) || {
          key: itemKey,
          label: lineItemLabel(li),
          units: 0,
          amount: 0,
          rateLabel: rateLabel(rateBasis, rateAmount, qty),
        };
        entry.units += Number.isFinite(units) ? units : 0;
        entry.amount = roundMoney(entry.amount + amount);
        const unitLabel = unitLabelForBasis(rateBasis, entry.units);
        entry.unitsLabel = `${entry.units.toFixed(4)} ${unitLabel}`;
        month.itemsByKey.set(itemKey, entry);
        month.lineItemsTotal = roundMoney(month.lineItemsTotal + amount);
      });
    });
  });

  (fees || []).forEach((fee) => {
    const amount = moneyNumber(fee.amount);
    const date = normalizeDateOnlyValue(fee.feeDate || fee.fee_date || "");
    const isDateOnly = !!date;
    const key = isDateOnly ? date.slice(0, 7) : "undated";
    const isUndated = key === "undated";
    let month = months.get(key);
    if (!month) {
      if (isUndated) {
        month = ensureMonth("undated", NaN, NaN, true);
      } else {
        const [yearStr, monthStr] = key.split("-");
        month = ensureMonth(key, Number(yearStr), Number(monthStr));
      }
    }
    month.feesTotal = roundMoney(month.feesTotal + amount);
    month.fees.push({
      name: fee.name || "Fee",
      amount,
      dateLabel: isDateOnly ? date : "",
    });
  });

  const list = Array.from(months.values());
  list.forEach((month) => {
    month.items = Array.from(month.itemsByKey.values()).sort((a, b) => a.label.localeCompare(b.label));
    month.total = roundMoney(month.lineItemsTotal + month.feesTotal);
  });

  list.sort((a, b) => {
    if (a.isUndated && b.isUndated) return 0;
    if (a.isUndated) return 1;
    if (b.isUndated) return -1;
    const keyA = `${a.year}-${String(a.month).padStart(2, "0")}`;
    const keyB = `${b.year}-${String(b.month).padStart(2, "0")}`;
    return keyA.localeCompare(keyB);
  });

  const totals = list.reduce(
    (acc, month) => {
      acc.lineItemsTotal += month.lineItemsTotal;
      acc.feesTotal += month.feesTotal;
      acc.grandTotal += month.total;
      return acc;
    },
    { lineItemsTotal: 0, feesTotal: 0, grandTotal: 0 }
  );

  totals.lineItemsTotal = roundMoney(totals.lineItemsTotal);
  totals.feesTotal = roundMoney(totals.feesTotal);
  totals.grandTotal = roundMoney(totals.grandTotal);

  return { months: list, totals, warnings, openItems };
}

async function init() {
  const session = window.RentSoft?.getSession?.();
  const companyId = window.RentSoft?.getCompanyId?.();
  if (!session || !companyId) {
    setCompanyMeta("Log in to view monthly charges.");
    setPageMeta("Missing session.");
    return;
  }
  if (!orderId) {
    setCompanyMeta("Missing rental order id.");
    setPageMeta("Unable to load order.");
    return;
  }

  const from = fromParam ? `&from=${encodeURIComponent(fromParam)}` : "";
  if (backToOrder) {
    backToOrder.href = `rental-order-form.html?id=${encodeURIComponent(orderId)}&companyId=${encodeURIComponent(
      companyId
    )}${from}`;
  }

  await loadCompanySettings(companyId);

  const res = await fetch(`/api/rental-orders/${encodeURIComponent(orderId)}?companyId=${encodeURIComponent(companyId)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error || "Unable to load rental order.";
    setCompanyMeta(message);
    setPageMeta(message);
    return;
  }

  const order = data.order || {};
  const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
  const fees = Array.isArray(data.fees) ? data.fees : [];

  const companyName =
    session?.company?.name ||
    session?.company?.company_name ||
    session?.companyName ||
    session?.company?.companyName ||
    "Company";
  setCompanyMeta(`${companyName} • Billing TZ: ${billingTimeZone}`);

  const breakdown = computeMonthlyBreakdown({ order, lineItems, fees });
  const asOfLabel =
    breakdown.openItems.length && lineItems.length
      ? `Includes ongoing items through ${fmtDateTime(new Date().toISOString())}.`
      : "";

  renderOrderSummary(order, lineItems, breakdown.totals, breakdown.warnings, asOfLabel);

  if (!breakdown.months.length) {
    setPageMeta("No billable months yet.");
    if (monthlyTable) monthlyTable.innerHTML = "";
    if (monthlyDetails) monthlyDetails.innerHTML = "";
    return;
  }

  setPageMeta(`${breakdown.months.length} month(s) • Total ${fmtMoney(breakdown.totals.grandTotal)}`);
  renderMonthlyTable(breakdown.months);
  renderMonthlyDetails(breakdown.months);
}

init().catch((err) => {
  setCompanyMeta(err.message || String(err));
  setPageMeta("Unable to load monthly charges.");
});
