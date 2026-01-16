const {
  getQboConnection,
  upsertQboConnection,
  upsertQboDocument,
  markQboDocumentRemoved,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
  upsertQboSyncState,
  getQboSyncState,
  findRentalOrderIdByRoNumber,
  getRentalOrderQboContext,
  buildRentalOrderBillingLines,
  getCompanySettings,
} = require("./db");

const {
  getQboConfig,
  buildAuthUrl,
  exchangeAuthCode,
  refreshAccessToken,
  qboRequest,
  computeExpiryTimestamp,
} = require("./qbo");

function isTokenExpiringSoon(expiresAt, skewMs = 60 * 1000) {
  if (!expiresAt) return true;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return true;
  return ms - Date.now() <= skewMs;
}

async function getValidQboConnection(companyId) {
  const connection = await getQboConnection({ companyId });
  if (!connection) return null;
  if (!connection.access_token || !connection.refresh_token) return null;

  if (!isTokenExpiringSoon(connection.access_token_expires_at)) {
    return connection;
  }

  const config = getQboConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("QBO_CLIENT_ID and QBO_CLIENT_SECRET are required to refresh tokens.");
  }

  const refreshed = await refreshAccessToken({
    refreshToken: connection.refresh_token,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  const updated = await upsertQboConnection({
    companyId,
    realmId: connection.realm_id,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || connection.refresh_token,
    accessTokenExpiresAt: computeExpiryTimestamp(refreshed.expires_in),
    refreshTokenExpiresAt: computeExpiryTimestamp(refreshed.x_refresh_token_expires_in),
    scope: refreshed.scope || connection.scope,
    tokenType: refreshed.token_type || connection.token_type,
  });
  return updated;
}

function formatPeriodKey({ start, billingDay }) {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (billingDay && Number(billingDay) !== 1) {
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return `${y}-${m}`;
}

function getBillingPeriodForDate({ date, billingDay }) {
  const day = Number(billingDay) || 1;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const currentDay = d.getUTCDate();
  const startMonth = currentDay >= day ? m : m - 1;
  const start = new Date(Date.UTC(y, startMonth, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day, 0, 0, 0, 0));
  return { start, end };
}

function toQboDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildDocNumber({ roNumber, orderId, periodKey, suffix }) {
  const base = roNumber || `RO-${orderId}`;
  const period = periodKey ? `-${periodKey}` : "";
  const tail = suffix ? `-${suffix}` : "";
  return `${base}${period}${tail}`;
}

function buildPrivateNote({ roNumber, orderId, periodKey }) {
  const ro = roNumber || String(orderId);
  const pieces = [`RO=${ro}`];
  if (periodKey) pieces.push(`PERIOD=${periodKey}`);
  pieces.push("SOURCE=RENTAL_SYS");
  return pieces.join(";");
}

function extractRoNumberFromDoc(doc) {
  const candidates = [
    doc?.PrivateNote,
    doc?.CustomerMemo?.value,
    doc?.Memo,
    doc?.DocNumber,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);

  for (const text of candidates) {
    const tag = text.match(/RO=([A-Za-z0-9-]+)/i);
    if (tag) return tag[1];
  }

  for (const text of candidates) {
    const match = text.match(/\bRO-[A-Za-z0-9-]+\b/i);
    if (match) {
      return match[0].replace(/-\d{4}-\d{2}$/, "");
    }
  }

  if (Array.isArray(doc?.CustomField)) {
    for (const field of doc.CustomField) {
      const value = String(field?.StringValue || "").trim();
      if (!value) continue;
      const tag = value.match(/RO=([A-Za-z0-9-]+)/i);
      if (tag) return tag[1];
    }
  }

  return null;
}

function extractBillingPeriod(doc) {
  const note = String(doc?.PrivateNote || "");
  const match = note.match(/PERIOD=([0-9-]+)/i);
  return match ? match[1] : null;
}

function deriveStatus(doc, entityType) {
  if (!doc) return null;
  if (doc?.TxnStatus) return doc.TxnStatus;
  if (entityType === "CreditMemo") return "credit";
  const total = Number(doc.TotalAmt || 0);
  const balance = Number(doc.Balance || 0);
  if (total > 0 && balance === 0) return "paid";
  if (total > 0 && balance > 0 && balance < total) return "partial";
  return "open";
}

async function qboApiRequest({ companyId, method, path, body }) {
  const connection = await getValidQboConnection(companyId);
  if (!connection) {
    const err = new Error("QuickBooks Online is not connected.");
    err.code = "qbo_not_connected";
    throw err;
  }
  const config = getQboConfig();
  return await qboRequest({
    host: config.host,
    realmId: connection.realm_id,
    accessToken: connection.access_token,
    method,
    path,
    body,
    minorVersion: config.minorVersion,
  });
}

async function createDraftInvoice({
  companyId,
  orderId,
  lineItemIds,
  periodStart,
  periodEnd,
  periodKey,
  docSuffix = null,
} = {}) {
  const order = await getRentalOrderQboContext({ companyId, orderId });
  if (!order) return { ok: false, error: "Rental order not found." };
  if (!order.qboCustomerId) {
    return { ok: false, error: "Customer is missing a QBO customer ID." };
  }

  const lines = await buildRentalOrderBillingLines({
    companyId,
    orderId,
    periodStart,
    periodEnd,
    lineItemIds,
  });

  if (!lines.length) {
    return { ok: false, error: "No billable line items for this period." };
  }

  const missingItems = lines.filter((line) => !line.qboItemId);
  if (missingItems.length) {
    return {
      ok: false,
      error: "Missing QBO item mappings.",
      missingTypeIds: missingItems.map((line) => line.typeId),
    };
  }

  const payload = {
    CustomerRef: { value: String(order.qboCustomerId) },
    DocNumber: buildDocNumber({ roNumber: order.roNumber, orderId, periodKey, suffix: docSuffix }),
    TxnDate: toQboDate(periodStart),
    PrivateNote: buildPrivateNote({ roNumber: order.roNumber, orderId, periodKey }),
    Line: lines.map((line) => {
      const qty = Number((line.units * line.quantity).toFixed(4));
      return {
        Amount: Number(line.amount.toFixed(2)),
        DetailType: "SalesItemLineDetail",
        Description: `${line.typeName} (rental)`,
        SalesItemLineDetail: {
          ItemRef: { value: String(line.qboItemId) },
          Qty: qty,
          UnitPrice: Number(line.rateAmount.toFixed(2)),
        },
      };
    }),
  };

  const existingDocs = await listQboDocumentsForRentalOrder({ companyId, orderId });
  const hasDocNumber = existingDocs.some(
    (doc) => doc?.qbo_entity_type === "Invoice" && doc?.doc_number === payload.DocNumber
  );
  if (hasDocNumber) {
    return { ok: false, skipped: "existing_document", docNumber: payload.DocNumber };
  }

  const data = await qboApiRequest({
    companyId,
    method: "POST",
    path: "invoice",
    body: payload,
  });

  const doc = data?.Invoice || data;
  const docFields = {
    companyId,
    rentalOrderId: orderId,
    entityType: "Invoice",
    entityId: doc?.Id,
    docNumber: doc?.DocNumber || payload.DocNumber,
    billingPeriod: periodKey || null,
    txnDate: doc?.TxnDate || payload.TxnDate,
    dueDate: doc?.DueDate || null,
    totalAmount: doc?.TotalAmt,
    balance: doc?.Balance,
    currencyCode: doc?.CurrencyRef?.value || null,
    status: deriveStatus(doc, "Invoice"),
    customerRef: doc?.CustomerRef?.value || order.qboCustomerId,
    source: "rent_soft",
    isVoided: false,
    isDeleted: false,
    lastUpdatedAt: doc?.MetaData?.LastUpdatedTime || null,
    raw: doc || payload,
  };
  const stored = await upsertQboDocument(docFields);
  return { ok: true, document: stored, payload };
}

async function createDraftCreditMemo({
  companyId,
  orderId,
  lineItemIds,
  periodStart,
  periodEnd,
  periodKey,
  docSuffix = "CM",
} = {}) {
  const order = await getRentalOrderQboContext({ companyId, orderId });
  if (!order) return { ok: false, error: "Rental order not found." };
  if (!order.qboCustomerId) {
    return { ok: false, error: "Customer is missing a QBO customer ID." };
  }

  const lines = await buildRentalOrderBillingLines({
    companyId,
    orderId,
    periodStart,
    periodEnd,
    lineItemIds,
    ignoreReturnedAt: true,
  });

  if (!lines.length) {
    return { ok: false, error: "No creditable line items for this period." };
  }

  const missingItems = lines.filter((line) => !line.qboItemId);
  if (missingItems.length) {
    return {
      ok: false,
      error: "Missing QBO item mappings.",
      missingTypeIds: missingItems.map((line) => line.typeId),
    };
  }

  const payload = {
    CustomerRef: { value: String(order.qboCustomerId) },
    DocNumber: buildDocNumber({ roNumber: order.roNumber, orderId, periodKey, suffix: docSuffix }),
    TxnDate: toQboDate(periodStart),
    PrivateNote: buildPrivateNote({ roNumber: order.roNumber, orderId, periodKey }),
    Line: lines.map((line) => {
      const qty = Number((line.units * line.quantity).toFixed(4));
      return {
        Amount: Number(line.amount.toFixed(2)),
        DetailType: "SalesItemLineDetail",
        Description: `${line.typeName} (credit)`,
        SalesItemLineDetail: {
          ItemRef: { value: String(line.qboItemId) },
          Qty: qty,
          UnitPrice: Number(line.rateAmount.toFixed(2)),
        },
      };
    }),
  };

  const existingDocs = await listQboDocumentsForRentalOrder({ companyId, orderId });
  const hasDocNumber = existingDocs.some(
    (doc) => doc?.qbo_entity_type === "CreditMemo" && doc?.doc_number === payload.DocNumber
  );
  if (hasDocNumber) {
    return { ok: false, skipped: "existing_document", docNumber: payload.DocNumber };
  }

  const data = await qboApiRequest({
    companyId,
    method: "POST",
    path: "creditmemo",
    body: payload,
  });

  const doc = data?.CreditMemo || data;
  const docFields = {
    companyId,
    rentalOrderId: orderId,
    entityType: "CreditMemo",
    entityId: doc?.Id,
    docNumber: doc?.DocNumber || payload.DocNumber,
    billingPeriod: periodKey || null,
    txnDate: doc?.TxnDate || payload.TxnDate,
    dueDate: doc?.DueDate || null,
    totalAmount: doc?.TotalAmt,
    balance: doc?.Balance,
    currencyCode: doc?.CurrencyRef?.value || null,
    status: deriveStatus(doc, "CreditMemo"),
    customerRef: doc?.CustomerRef?.value || order.qboCustomerId,
    source: "rent_soft",
    isVoided: false,
    isDeleted: false,
    lastUpdatedAt: doc?.MetaData?.LastUpdatedTime || null,
    raw: doc || payload,
  };
  const stored = await upsertQboDocument(docFields);
  return { ok: true, document: stored, payload };
}

async function syncQboDocumentById({ companyId, entityType, entityId }) {
  const path = `${String(entityType || "").toLowerCase()}/${entityId}`;
  const data = await qboApiRequest({ companyId, method: "GET", path });
  const doc = data?.[entityType] || data;
  if (!doc) return null;

  const roNumber = extractRoNumberFromDoc(doc);
  const rentalOrderId = roNumber ? await findRentalOrderIdByRoNumber({ companyId, roNumber }) : null;
  const stored = await upsertQboDocument({
    companyId,
    rentalOrderId,
    entityType,
    entityId: doc?.Id,
    docNumber: doc?.DocNumber || null,
    billingPeriod: extractBillingPeriod(doc),
    txnDate: doc?.TxnDate || null,
    dueDate: doc?.DueDate || null,
    totalAmount: doc?.TotalAmt,
    balance: doc?.Balance,
    currencyCode: doc?.CurrencyRef?.value || null,
    status: deriveStatus(doc, entityType),
    customerRef: doc?.CustomerRef?.value || null,
    source: "qbo",
    isVoided: false,
    isDeleted: false,
    lastUpdatedAt: doc?.MetaData?.LastUpdatedTime || null,
    raw: doc,
  });
  return stored;
}

async function handleWebhookEvent({ companyId, entityType, entityId, operation }) {
  const op = String(operation || "").toLowerCase();
  if (op === "delete" || op === "void") {
    await markQboDocumentRemoved({
      companyId,
      entityType,
      entityId,
      isVoided: op === "void",
      isDeleted: op === "delete",
    });
    return { ok: true, removed: true };
  }
  const doc = await syncQboDocumentById({ companyId, entityType, entityId });
  return { ok: true, document: doc || null };
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function runQuerySync({ companyId, entities, sinceDate, untilDate }) {
  const entityList = Array.isArray(entities) && entities.length ? entities : ["Invoice", "CreditMemo"];
  const results = [];
  const since = sinceDate || new Date();
  const until = untilDate || null;
  const sinceIso = since.toISOString().slice(0, 10);
  const untilIso = until ? until.toISOString().slice(0, 10) : null;
  for (const name of entityList) {
    let startPosition = 1;
    const maxResults = 1000;
    while (true) {
      const filters = [`TxnDate >= '${sinceIso}'`];
      if (untilIso) filters.push(`TxnDate <= '${untilIso}'`);
      const query = `select * from ${name} where ${filters.join(" AND ")} STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
      const data = await qboApiRequest({
        companyId,
        method: "GET",
        path: `query?query=${encodeURIComponent(query)}`,
      });
      const response = data?.QueryResponse || {};
      const docs = Array.isArray(response[name]) ? response[name] : [];
      for (const doc of docs) {
        const entityId = doc?.Id;
        if (!entityId) continue;
        const roNumber = extractRoNumberFromDoc(doc);
        const rentalOrderId = roNumber ? await findRentalOrderIdByRoNumber({ companyId, roNumber }) : null;
        const stored = await upsertQboDocument({
          companyId,
          rentalOrderId,
          entityType: name,
          entityId,
          docNumber: doc?.DocNumber || null,
          billingPeriod: extractBillingPeriod(doc),
          txnDate: doc?.TxnDate || null,
          dueDate: doc?.DueDate || null,
          totalAmount: doc?.TotalAmt,
          balance: doc?.Balance,
          currencyCode: doc?.CurrencyRef?.value || null,
          status: deriveStatus(doc, name),
          customerRef: doc?.CustomerRef?.value || null,
          source: "qbo",
          isVoided: false,
          isDeleted: false,
          lastUpdatedAt: doc?.MetaData?.LastUpdatedTime || null,
          raw: doc,
        });
        results.push(stored);
      }
      if (docs.length < maxResults) break;
      startPosition += maxResults;
    }
  }
  return results;
}

async function runCdcSync({ companyId, entities = ["Invoice", "CreditMemo"], since = null, until = null, mode = null }) {
  const entityList = Array.isArray(entities) && entities.length ? entities : ["Invoice", "CreditMemo"];
  const state = await getQboSyncState({ companyId, entityName: "CDC" });
  const defaultSince = () => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 12);
    return d;
  };
  let sinceDate = parseDate(since) || (state?.last_cdc_timestamp ? new Date(state.last_cdc_timestamp) : defaultSince());
  let untilDate = parseDate(until) || null;
  if (untilDate && sinceDate && untilDate < sinceDate) {
    const tmp = sinceDate;
    sinceDate = untilDate;
    untilDate = tmp;
  }
  const out = [];
  let cdcFailed = false;

  if (String(mode || "").toLowerCase() !== "query") {
    try {
      const sinceIso = sinceDate.toISOString();
      const query = `cdc?entities=${encodeURIComponent(entityList.join(","))}&changedSince=${encodeURIComponent(sinceIso)}`;
      const data = await qboApiRequest({ companyId, method: "GET", path: query });
      const response = data?.CDCResponse || {};
      for (const name of entityList) {
        const items = response[name] || [];
        for (const item of items) {
          const doc = item;
          const entityId = doc?.Id;
          if (!entityId) continue;
          const roNumber = extractRoNumberFromDoc(doc);
          const rentalOrderId = roNumber ? await findRentalOrderIdByRoNumber({ companyId, roNumber }) : null;
          const stored = await upsertQboDocument({
            companyId,
            rentalOrderId,
            entityType: name,
            entityId,
            docNumber: doc?.DocNumber || null,
            billingPeriod: extractBillingPeriod(doc),
            txnDate: doc?.TxnDate || null,
            dueDate: doc?.DueDate || null,
            totalAmount: doc?.TotalAmt,
            balance: doc?.Balance,
            currencyCode: doc?.CurrencyRef?.value || null,
            status: deriveStatus(doc, name),
            customerRef: doc?.CustomerRef?.value || null,
            source: "qbo",
            isVoided: false,
            isDeleted: false,
            lastUpdatedAt: doc?.MetaData?.LastUpdatedTime || null,
            raw: doc,
          });
          out.push(stored);
        }
      }
    } catch {
      cdcFailed = true;
    }
  }

  if (String(mode || "").toLowerCase() === "query" || cdcFailed || out.length === 0) {
    const queried = await runQuerySync({ companyId, entities: entityList, sinceDate, untilDate });
    out.push(...queried);
  }

  await upsertQboSyncState({ companyId, entityName: "CDC", lastCdcTimestamp: new Date().toISOString() });
  return out;
}

function sumReportIncomeRows(rows, selectedAccounts) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const selected = new Set((selectedAccounts || []).map((v) => String(v)));
  let total = 0;

  const walk = (items) => {
    if (!Array.isArray(items)) return;
    for (const row of items) {
      if (row?.RowType === "Row") {
        const cols = row.ColData || [];
        const accountId = cols.find((c) => c?.id)?.id || cols[0]?.id || null;
        const amount = cols[1]?.value || cols[0]?.value || null;
        if (accountId && selected.has(String(accountId))) {
          const num = Number(amount);
          if (Number.isFinite(num)) total += num;
        }
      }
      if (row?.Rows?.Row) walk(row.Rows.Row);
    }
  };
  walk(rows);
  return total;
}

async function getIncomeTotals({ companyId, startDate, endDate }) {
  const settings = await getCompanySettings(companyId);
  const selected = settings.qbo_income_account_ids || [];
  if (!selected.length) return { total: 0, selectedAccounts: [] };
  const query = `reports/ProfitAndLoss?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
    endDate
  )}`;
  const data = await qboApiRequest({ companyId, method: "GET", path: query });
  const rows = data?.Rows?.Row || [];
  const total = sumReportIncomeRows(rows, selected);
  return { total, selectedAccounts: selected };
}

async function createPickupDraftInvoice({ companyId, orderId, lineItemId, pickedUpAt }) {
  const settings = await getCompanySettings(companyId);
  const period = getBillingPeriodForDate({ date: pickedUpAt || new Date(), billingDay: settings.qbo_billing_day });
  if (!period) return { ok: false, error: "Unable to resolve billing period." };
  const periodKey = formatPeriodKey({ start: period.start, billingDay: settings.qbo_billing_day });
  return await createDraftInvoice({
    companyId,
    orderId,
    lineItemIds: [lineItemId],
    periodStart: pickedUpAt || period.start,
    periodEnd: period.end,
    periodKey,
    docSuffix: `PICKUP-${lineItemId}`,
  });
}

async function createMonthlyDraftInvoice({ companyId, orderId, asOf }) {
  const settings = await getCompanySettings(companyId);
  const period = getBillingPeriodForDate({ date: asOf || new Date(), billingDay: settings.qbo_billing_day });
  if (!period) return { ok: false, error: "Unable to resolve billing period." };
  const periodKey = formatPeriodKey({ start: period.start, billingDay: settings.qbo_billing_day });
  const existingDocs = await listQboDocumentsForRentalOrder({ companyId, orderId });
  const hasMonthly = existingDocs.some(
    (doc) =>
      doc?.qbo_entity_type === "Invoice" &&
      doc?.billing_period === periodKey &&
      doc?.source === "rent_soft"
  );
  if (hasMonthly) {
    return { ok: false, skipped: "existing_period_invoice", periodKey };
  }
  return await createDraftInvoice({
    companyId,
    orderId,
    lineItemIds: null,
    periodStart: period.start,
    periodEnd: period.end,
    periodKey,
  });
}

async function createReturnCreditMemo({ companyId, orderId, lineItemId, returnedAt }) {
  const settings = await getCompanySettings(companyId);
  const period = getBillingPeriodForDate({ date: returnedAt || new Date(), billingDay: settings.qbo_billing_day });
  if (!period) return { ok: false, error: "Unable to resolve billing period." };
  const periodKey = formatPeriodKey({ start: period.start, billingDay: settings.qbo_billing_day });
  return await createDraftCreditMemo({
    companyId,
    orderId,
    lineItemIds: [lineItemId],
    periodStart: returnedAt || period.start,
    periodEnd: period.end,
    periodKey,
    docSuffix: `CM-${lineItemId}`,
  });
}

module.exports = {
  getQboConfig,
  buildAuthUrl,
  exchangeAuthCode,
  getValidQboConnection,
  createDraftInvoice,
  createDraftCreditMemo,
  createPickupDraftInvoice,
  createMonthlyDraftInvoice,
  createReturnCreditMemo,
  syncQboDocumentById,
  handleWebhookEvent,
  runCdcSync,
  getIncomeTotals,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
};
