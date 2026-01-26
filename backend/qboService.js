const crypto = require("crypto");

const {
  getQboConnection,
  upsertQboConnection,
  deleteQboConnection,
  upsertQboDocument,
  markQboDocumentRemoved,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
  upsertQboSyncState,
  getQboSyncState,
  logQboError,
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
  revokeToken,
  qboRequest,
  computeExpiryTimestamp,
} = require("./qbo");

function parseTimestampMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isTokenExpiringSoon(expiresAt, skewMs = 60 * 1000) {
  const ms = parseTimestampMs(expiresAt);
  if (!ms) return true;
  return ms - Date.now() <= skewMs;
}

function isTokenExpired(expiresAt, skewMs = 0) {
  const ms = parseTimestampMs(expiresAt);
  if (!ms) return false;
  return ms - Date.now() <= skewMs;
}

function extractQboAuthErrorDetails(err) {
  const status = Number(err?.status);
  const payload = err?.payload || {};
  const fault = Array.isArray(payload?.Fault?.Error) ? payload.Fault.Error[0] : null;
  const faultDetail = fault?.Detail || fault?.detail || "";
  const faultMessage = fault?.Message || fault?.message || "";
  const faultCode = fault?.code || "";
  const oauthError = payload?.error || payload?.error_description || "";
  const message = err?.message || "";
  const combined = `${oauthError} ${faultDetail} ${faultMessage} ${faultCode} ${message}`.toLowerCase();
  return { status, combined };
}

function isAuthInvalidError(err) {
  const { status, combined } = extractQboAuthErrorDetails(err);
  if (status === 401 || status === 403) return true;
  if (status === 400 && (combined.includes("invalid_grant") || combined.includes("invalid_token"))) return true;
  if (combined.includes("token revoked") || combined.includes("token expired")) return true;
  return false;
}

function buildQboAuthError(reason) {
  const err = new Error("QuickBooks authorization is no longer valid. Please reconnect.");
  err.code = "qbo_auth_expired";
  err.status = 401;
  err.reason = reason;
  return err;
}

async function invalidateQboConnection({ companyId, reason, error } = {}) {
  try {
    await deleteQboConnection({ companyId });
  } catch (cleanupErr) {
    console.error("QBO connection cleanup failed", {
      companyId,
      reason,
      error: cleanupErr?.message ? String(cleanupErr.message) : "Unknown error",
    });
  }
  if (error) {
    console.warn("QBO connection invalidated", {
      companyId,
      reason,
      error: error?.message ? String(error.message) : "Unknown error",
      status: error?.status || null,
    });
  }
  return buildQboAuthError(reason);
}

async function refreshQboConnection({ companyId, connection, reason } = {}) {
  const config = getQboConfig();
  if (!config.clientId || !config.clientSecret) {
    throw new Error("QBO_CLIENT_ID and QBO_CLIENT_SECRET are required to refresh tokens.");
  }
  if (!connection?.refresh_token) {
    throw await invalidateQboConnection({ companyId, reason: reason || "missing_refresh_token" });
  }

  let refreshed;
  try {
    refreshed = await refreshAccessToken({
      refreshToken: connection.refresh_token,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
  } catch (err) {
    await recordQboError({
      companyId,
      connection,
      err,
      stage: "refresh",
      extraContext: { grantType: "refresh_token" },
    });
    if (isAuthInvalidError(err)) {
      throw await invalidateQboConnection({ companyId, reason: reason || "refresh_failed", error: err });
    }
    throw err;
  }

  if (!refreshed?.access_token) {
    await recordQboError({
      companyId,
      connection,
      err: new Error("QBO refresh did not return an access token."),
      stage: "refresh",
      extraContext: { grantType: "refresh_token", missing: "access_token" },
    });
    throw await invalidateQboConnection({
      companyId,
      reason: reason || "refresh_missing_access_token",
      error: new Error("QBO refresh did not return an access token."),
    });
  }

  const accessToken = refreshed.access_token;
  const refreshToken = refreshed.refresh_token || connection.refresh_token;
  const updated = await upsertQboConnection({
    companyId,
    realmId: connection.realm_id,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: computeExpiryTimestamp(refreshed.expires_in),
    refreshTokenExpiresAt:
      computeExpiryTimestamp(refreshed.x_refresh_token_expires_in) ||
      connection.refresh_token_expires_at ||
      null,
    scope: refreshed.scope || connection.scope,
    tokenType: refreshed.token_type || connection.token_type,
  });

  return {
    ...updated,
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

async function revokeQboTokens({ connection } = {}) {
  const config = getQboConfig();
  if (!connection) return { ok: false, skipped: "missing_connection" };
  if (!config.clientId || !config.clientSecret || !config.revokeUrl) {
    return { ok: false, skipped: "missing_config" };
  }
  const token = connection.refresh_token || connection.access_token;
  if (!token) return { ok: false, skipped: "missing_token" };

  try {
    await revokeToken({
      token,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      revokeUrl: config.revokeUrl,
      tokenTypeHint: connection.refresh_token ? "refresh_token" : "access_token",
    });
    return { ok: true };
  } catch (err) {
    console.warn("QBO token revocation failed", {
      companyId: connection.company_id,
      error: err?.message ? String(err.message) : "Unknown error",
      status: err?.status || null,
    });
    return { ok: false, error: err };
  }
}

async function getValidQboConnection(companyId) {
  const connection = await getQboConnection({ companyId });
  if (!connection) return null;
  if (!connection.access_token || !connection.refresh_token) return null;

  if (isTokenExpired(connection.refresh_token_expires_at, 60 * 1000)) {
    throw await invalidateQboConnection({ companyId, reason: "refresh_token_expired" });
  }

  if (!isTokenExpiringSoon(connection.access_token_expires_at)) {
    return connection;
  }

  return await refreshQboConnection({ companyId, connection, reason: "access_token_expiring" });
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

function resolvePickupPeriod({ pickedUpAt, billingDay }) {
  const period = getBillingPeriodForDate({ date: pickedUpAt || new Date(), billingDay });
  if (!period) return null;
  const periodKey = formatPeriodKey({ start: period.start, billingDay });
  return { periodStart: period.start, periodEnd: period.end, periodKey };
}

function toQboDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const QBO_DOC_NUMBER_MAX = 21;

function useQboAutoDocNumber() {
  return getQboConfig()?.docNumberMode === "qbo";
}

function compactDocToken(value) {
  return String(value || "").replace(/[^A-Za-z0-9]/g, "");
}

function compactPeriodKey(periodKey) {
  if (!periodKey) return "";
  return String(periodKey).replace(/[^0-9]/g, "");
}

function compactSuffix(suffix) {
  if (!suffix) return "";
  const raw = String(suffix || "");
  const pickupMatch = raw.match(/^PICKUP-(\d+)/i);
  if (pickupMatch) return `P${pickupMatch[1]}`;
  const creditMatch = raw.match(/^CM-(\d+)/i);
  if (creditMatch) return `CM${creditMatch[1]}`;
  const cleaned = compactDocToken(raw);
  return cleaned.slice(0, 8);
}

function buildDocNumber({ roNumber, orderId, periodKey, suffix }) {
  const base = roNumber || `RO-${orderId}`;
  const period = periodKey ? `-${periodKey}` : "";
  const tail = suffix ? `-${suffix}` : "";
  const candidate = `${base}${period}${tail}`;
  if (candidate.length <= QBO_DOC_NUMBER_MAX) return candidate;

  const orderToken = Number.isFinite(Number(orderId)) ? String(Math.floor(Number(orderId))) : "X";
  const compactBase = `RO${orderToken}`;
  const compactPeriod = compactPeriodKey(periodKey);
  const compactTail = compactSuffix(suffix);
  const compactParts = [compactBase, compactPeriod, compactTail].filter(Boolean);
  const compactCandidate = compactParts.join("-");
  if (compactCandidate.length <= QBO_DOC_NUMBER_MAX) return compactCandidate;

  const hash = crypto.createHash("sha1").update(candidate).digest("hex").slice(0, 6).toUpperCase();
  const maxPrefix = Math.max(1, QBO_DOC_NUMBER_MAX - hash.length - 1);
  const prefix = compactDocToken(compactBase).slice(0, maxPrefix);
  return `${prefix}-${hash}`;
}

function isPickupDocSuffix(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .startsWith("PICKUP-");
}

function isPickupDocNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return /PICKUP/i.test(raw) || /-P\d+$/i.test(raw);
}

function buildPrivateNote({ roNumber, orderId, periodKey, extraTags = [] }) {
  const ro = roNumber || String(orderId);
  const pieces = [`RO=${ro}`];
  if (periodKey) pieces.push(`PERIOD=${periodKey}`);
  pieces.push("SOURCE=RENTAL_SYS");
  for (const tag of extraTags) {
    if (!tag) continue;
    pieces.push(String(tag));
  }
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

      const name = String(field?.Name || field?.name || "").trim().toLowerCase();
      const isRoField =
        name &&
        /^(ro\s*#|ro\s*number|rental\s*order\s*(id|#|number)?)$/i.test(name);
      if (isRoField) {
        const roMatch = value.match(/\bRO-[A-Za-z0-9-]+\b/i);
        if (roMatch) return roMatch[0];
        return value;
      }
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

async function recordQboError({ companyId, connection, err, method, path, stage, extraContext } = {}) {
  if (!err) return;
  try {
    await logQboError({
      companyId,
      realmId: connection?.realm_id || err?.request?.realmId || null,
      endpoint: path || err?.request?.path || null,
      method: method || err?.request?.method || null,
      status: err?.status || null,
      intuitTid: err?.intuitTid || null,
      errorMessage: err?.message || "QBO error",
      errorPayload: err?.payload || null,
      context: {
        stage: stage || null,
        code: err?.code || null,
        reason: err?.reason || null,
        stack: err?.stack ? String(err.stack) : null,
        extra: extraContext || null,
      },
    });
  } catch (logErr) {
    console.warn("QBO error log failed", {
      companyId,
      error: logErr?.message ? String(logErr.message) : "Unknown error",
    });
  }
}

async function qboApiRequest({ companyId, method, path, body }) {
  let connection = await getValidQboConnection(companyId);
  if (!connection) {
    const err = new Error("QuickBooks Online is not connected.");
    err.code = "qbo_not_connected";
    throw err;
  }
  const config = getQboConfig();
  try {
    return await qboRequest({
      host: config.host,
      realmId: connection.realm_id,
      accessToken: connection.access_token,
      method,
      path,
      body,
      minorVersion: config.minorVersion,
    });
  } catch (err) {
    await recordQboError({ companyId, connection, err, method, path, stage: "request" });
    if (!isAuthInvalidError(err)) throw err;
    connection = await refreshQboConnection({ companyId, connection, reason: "request_unauthorized" });
    try {
      return await qboRequest({
        host: config.host,
        realmId: connection.realm_id,
        accessToken: connection.access_token,
        method,
        path,
        body,
        minorVersion: config.minorVersion,
      });
    } catch (retryErr) {
      await recordQboError({ companyId, connection, err: retryErr, method, path, stage: "retry" });
      if (isAuthInvalidError(retryErr)) {
        throw await invalidateQboConnection({ companyId, reason: "request_unauthorized", error: retryErr });
      }
      throw retryErr;
    }
  }
}

async function disconnectQboConnection({ companyId } = {}) {
  const connection = await getQboConnection({ companyId }).catch(() => null);
  if (connection) {
    await revokeQboTokens({ connection });
  }
  await deleteQboConnection({ companyId });
}

function normalizeQboCustomer(customer) {
  if (!customer) return null;
  const billAddr = customer.BillAddr || null;
  return {
    id: customer.Id ? String(customer.Id) : null,
    displayName: customer.DisplayName || null,
    companyName: customer.CompanyName || null,
    givenName: customer.GivenName || null,
    familyName: customer.FamilyName || null,
    email: customer.PrimaryEmailAddr?.Address || null,
    phone: customer.PrimaryPhone?.FreeFormNumber || customer.Mobile?.FreeFormNumber || null,
    mobile: customer.Mobile?.FreeFormNumber || null,
    active: customer.Active !== false,
    billAddr: billAddr
      ? {
          line1: billAddr.Line1 || null,
          line2: billAddr.Line2 || null,
          line3: billAddr.Line3 || null,
          city: billAddr.City || null,
          region: billAddr.CountrySubDivisionCode || null,
          country: billAddr.Country || null,
          postalCode: billAddr.PostalCode || null,
        }
      : null,
  };
}

async function listQboCustomers({ companyId }) {
  const customers = [];
  let startPosition = 1;
  const maxResults = 1000;
  while (true) {
    const query = `select * from Customer STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const data = await qboApiRequest({
      companyId,
      method: "GET",
      path: `query?query=${encodeURIComponent(query)}`,
    });
    const response = data?.QueryResponse || {};
    const rows = Array.isArray(response.Customer) ? response.Customer : [];
    rows.forEach((row) => {
      const normalized = normalizeQboCustomer(row);
      if (normalized?.id) customers.push(normalized);
    });
    if (rows.length < maxResults) break;
    startPosition += maxResults;
  }
  return customers;
}

function normalizeQboItem(item) {
  if (!item) return null;
  const name = item.Name || item.FullyQualifiedName || item.name || null;
  return {
    id: item.Id ? String(item.Id) : item.id ? String(item.id) : null,
    name,
    type: item.Type || item.type || null,
    active: item.Active !== undefined ? item.Active !== false : item.active !== false,
    incomeAccountRef: item?.IncomeAccountRef?.value || item?.incomeAccountRef || null,
  };
}

function normalizeQboAccount(account) {
  if (!account) return null;
  const fullyQualifiedName = account.FullyQualifiedName || account.fullyQualifiedName || null;
  const name = fullyQualifiedName || account.Name || account.name || null;
  return {
    id: account.Id ? String(account.Id) : account.id ? String(account.id) : null,
    name,
    fullyQualifiedName,
    type: account.AccountType || account.accountType || null,
    subType: account.AccountSubType || account.accountSubType || null,
    active: account.Active !== undefined ? account.Active !== false : account.active !== false,
  };
}

function normalizeQboTaxCode(taxCode) {
  if (!taxCode) return null;
  const name = taxCode.Name || taxCode.name || null;
  const code = taxCode.Code || taxCode.code || null;
  const description = taxCode.Description || taxCode.description || null;
  return {
    id: taxCode.Id ? String(taxCode.Id) : taxCode.id ? String(taxCode.id) : null,
    name,
    code,
    description,
    active: taxCode.Active !== undefined ? taxCode.Active !== false : taxCode.active !== false,
  };
}

async function listQboItems({ companyId }) {
  const items = [];
  let startPosition = 1;
  const maxResults = 1000;
  while (true) {
    const query = `select * from Item STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const data = await qboApiRequest({
      companyId,
      method: "GET",
      path: `query?query=${encodeURIComponent(query)}`,
    });
    const response = data?.QueryResponse || {};
    const rows = Array.isArray(response.Item) ? response.Item : [];
    rows.forEach((row) => {
      const normalized = normalizeQboItem(row);
      if (normalized?.id) items.push(normalized);
    });
    if (rows.length < maxResults) break;
    startPosition += maxResults;
  }
  return items;
}

async function listQboIncomeAccounts({ companyId }) {
  const accounts = [];
  let startPosition = 1;
  const maxResults = 1000;
  while (true) {
    const query = `select * from Account where Active = true STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const data = await qboApiRequest({
      companyId,
      method: "GET",
      path: `query?query=${encodeURIComponent(query)}`,
    });
    const response = data?.QueryResponse || {};
    const rows = Array.isArray(response.Account) ? response.Account : [];
    rows.forEach((row) => {
      const normalized = normalizeQboAccount(row);
      if (!normalized?.id) return;
      const type = String(normalized.type || "").toLowerCase();
      if (type !== "income" && type !== "other income") return;
      accounts.push(normalized);
    });
    if (rows.length < maxResults) break;
    startPosition += maxResults;
  }
  return accounts;
}

async function listQboTaxCodes({ companyId }) {
  const taxCodes = [];
  let startPosition = 1;
  const maxResults = 1000;
  while (true) {
    const query = `select * from TaxCode STARTPOSITION ${startPosition} MAXRESULTS ${maxResults}`;
    const data = await qboApiRequest({
      companyId,
      method: "GET",
      path: `query?query=${encodeURIComponent(query)}`,
    });
    const response = data?.QueryResponse || {};
    const rows = Array.isArray(response.TaxCode) ? response.TaxCode : [];
    rows.forEach((row) => {
      const normalized = normalizeQboTaxCode(row);
      if (normalized?.id) taxCodes.push(normalized);
    });
    if (rows.length < maxResults) break;
    startPosition += maxResults;
  }
  return taxCodes;
}

async function resolveDefaultTaxCode(companyId) {
  const settings = await getCompanySettings(companyId).catch(() => null);
  const fromSettings = String(settings?.qbo_default_tax_code || "").trim();
  return fromSettings;
}

async function getQboCustomerById({ companyId, qboCustomerId }) {
  if (!qboCustomerId) return null;
  const data = await qboApiRequest({
    companyId,
    method: "GET",
    path: `customer/${encodeURIComponent(String(qboCustomerId))}`,
  });
  return data?.Customer || data || null;
}

async function createQboCustomer({ companyId, payload }) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Customer payload is required.");
  }
  const data = await qboApiRequest({
    companyId,
    method: "POST",
    path: "customer",
    body: payload,
  });
  return data?.Customer || data || null;
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
  const defaultTaxCode = await resolveDefaultTaxCode(companyId);
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

  const docNumber = useQboAutoDocNumber()
    ? null
    : buildDocNumber({ roNumber: order.roNumber, orderId, periodKey, suffix: docSuffix });
  const existingDocs = await listQboDocumentsForRentalOrder({ companyId, orderId });
  const extraTags = [];
  if (isPickupDocSuffix(docSuffix) && Array.isArray(lineItemIds) && lineItemIds.length) {
    const normalizedLineItemIds = Array.from(
      new Set(lineItemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))
    );
    if (normalizedLineItemIds.length) {
      extraTags.push(`LINEITEMS=${normalizedLineItemIds.join(",")}`);
    }
  }
  if (isPickupDocSuffix(docSuffix)) {
    const otherPickupDocs = (existingDocs || [])
      .filter(
        (doc) =>
          doc?.qbo_entity_type === "Invoice" &&
          doc?.source === "rent_soft" &&
          !doc?.is_voided &&
          !doc?.is_deleted
      )
      .map((doc) => String(doc?.doc_number || doc?.docNumber || "").trim())
      .filter((value) => value && value !== docNumber && isPickupDocNumber(value));
    if (otherPickupDocs.length) {
      const preview = otherPickupDocs.slice(0, 3);
      extraTags.push(`OTHER_PICKUP_INVOICES=${preview.join(",")}`);
      if (otherPickupDocs.length > preview.length) {
        extraTags.push(`OTHER_PICKUP_INVOICE_COUNT=${otherPickupDocs.length}`);
      }
    }
  }

  const payload = {
    CustomerRef: { value: String(order.qboCustomerId) },
    TxnDate: toQboDate(periodStart),
    PrivateNote: buildPrivateNote({ roNumber: order.roNumber, orderId, periodKey, extraTags }),
    Line: lines.map((line) => {
      const qty = Number((line.units * line.quantity).toFixed(5));
      const unitPrice = Number(line.rateAmount.toFixed(2));
      const amount = Number((qty * unitPrice).toFixed(2));
      const salesDetail = {
        ItemRef: { value: String(line.qboItemId) },
        Qty: qty,
        UnitPrice: unitPrice,
      };
      if (defaultTaxCode) {
        salesDetail.TaxCodeRef = { value: defaultTaxCode };
      }
      return {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: `${line.typeName} (rental)`,
        SalesItemLineDetail: salesDetail,
      };
    }),
  };
  if (docNumber) {
    payload.DocNumber = docNumber;
  }

  const hasDocNumber =
    docNumber &&
    existingDocs.some((doc) => doc?.qbo_entity_type === "Invoice" && doc?.doc_number === payload.DocNumber);
  if (hasDocNumber) {
    return { ok: false, skipped: "existing_document", docNumber: payload.DocNumber };
  }

  let data;
  try {
    data = await qboApiRequest({
      companyId,
      method: "POST",
      path: "invoice",
      body: payload,
    });
  } catch (err) {
    console.error("QBO invoice create failed", {
      companyId,
      orderId,
      docNumber: payload.DocNumber,
      lineItemIds,
      periodStart: payload.TxnDate,
      error: err?.message ? String(err.message) : "Unknown error",
      status: err?.status || null,
      payload: err?.payload || null,
    });
    throw err;
  }

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
  const defaultTaxCode = await resolveDefaultTaxCode(companyId);
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

  const docNumber = useQboAutoDocNumber()
    ? null
    : buildDocNumber({ roNumber: order.roNumber, orderId, periodKey, suffix: docSuffix });
  const payload = {
    CustomerRef: { value: String(order.qboCustomerId) },
    TxnDate: toQboDate(periodStart),
    PrivateNote: buildPrivateNote({ roNumber: order.roNumber, orderId, periodKey }),
    Line: lines.map((line) => {
      const qty = Number((line.units * line.quantity).toFixed(5));
      const unitPrice = Number(line.rateAmount.toFixed(2));
      const amount = Number((qty * unitPrice).toFixed(2));
      const salesDetail = {
        ItemRef: { value: String(line.qboItemId) },
        Qty: qty,
        UnitPrice: unitPrice,
      };
      if (defaultTaxCode) {
        salesDetail.TaxCodeRef = { value: defaultTaxCode };
      }
      return {
        Amount: amount,
        DetailType: "SalesItemLineDetail",
        Description: `${line.typeName} (credit)`,
        SalesItemLineDetail: salesDetail,
      };
    }),
  };
  if (docNumber) {
    payload.DocNumber = docNumber;
  }

  const existingDocs = await listQboDocumentsForRentalOrder({ companyId, orderId });
  const hasDocNumber =
    docNumber &&
    existingDocs.some((doc) => doc?.qbo_entity_type === "CreditMemo" && doc?.doc_number === payload.DocNumber);
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

function parseReportAmount(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw === "--") return null;
  const negative = raw.startsWith("(") && raw.endsWith(")");
  const cleaned = raw.replace(/[(),]/g, "");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

function getReportCellValue(cell) {
  return cell?.value ?? cell?.Value ?? null;
}

function getReportCellId(cell) {
  return cell?.id ?? cell?.Id ?? null;
}

function isQboUnexpectedInternalError(err) {
  const code = err?.payload?.Fault?.Error?.[0]?.code;
  if (code && String(code).includes("30000")) return true;
  const message = String(err?.message || "");
  return message.includes("(-30000)");
}

function sumReportIncomeRows(rows, selectedAccounts, selectedNames = new Set()) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const selected = new Set((selectedAccounts || []).map((v) => String(v)));
  let total = 0;

  const walk = (items) => {
    if (!Array.isArray(items)) return;
    for (const row of items) {
      if (row?.RowType === "Row") {
        const cols = row.ColData || [];
        const accountCell = cols.find((c) => getReportCellId(c)) || cols[0] || null;
        const accountId = getReportCellId(accountCell);
        const accountName = getReportCellValue(cols[0]) || getReportCellValue(accountCell);
        const amount =
          getReportCellValue(cols[1]) ?? getReportCellValue(cols[0]) ?? getReportCellValue(accountCell);
        const nameKeys = accountNameVariants(accountName);
        const matches =
          (accountId && selected.has(String(accountId))) ||
          nameKeys.some((nameKey) => selectedNames.has(nameKey));
        if (matches) {
          const num = parseReportAmount(amount);
          if (Number.isFinite(num)) total += num;
        }
      }
      if (row?.Rows?.Row) walk(row.Rows.Row);
    }
  };
  walk(rows);
  return total;
}

function extractReportColumnMetaValue(meta, name) {
  if (!Array.isArray(meta)) return null;
  const target = String(name || "").toLowerCase();
  const entry = meta.find((m) => String(m?.Name ?? m?.name ?? "").toLowerCase() === target);
  return entry?.Value ?? entry?.value ?? null;
}

function parseReportColumnDate(title) {
  if (!title) return null;
  const raw = String(title).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "account" || lower === "total") return null;
  const cleaned = raw.replace(/^week of\s+/i, "").trim();
  const parsed = Date.parse(cleaned);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  const rangeMatch = cleaned.match(/([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/g);
  if (rangeMatch && rangeMatch.length) {
    const candidate = rangeMatch[rangeMatch.length - 1];
    const rangeParsed = Date.parse(candidate);
    if (Number.isFinite(rangeParsed)) return new Date(rangeParsed).toISOString().slice(0, 10);
  }
  const slashMatch = cleaned.match(/(\d{1,2}\/\d{1,2}\/\d{4})/g);
  if (slashMatch && slashMatch.length) {
    const candidate = slashMatch[slashMatch.length - 1];
    const rangeParsed = Date.parse(candidate);
    if (Number.isFinite(rangeParsed)) return new Date(rangeParsed).toISOString().slice(0, 10);
  }
  const monthMatch = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthMatch) {
    const monthKey = monthMatch[1].slice(0, 3).toLowerCase();
    const monthMap = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    if (monthMap[monthKey] !== undefined) {
      const year = Number(monthMatch[2]);
      if (Number.isFinite(year)) {
        return new Date(Date.UTC(year, monthMap[monthKey], 1)).toISOString().slice(0, 10);
      }
    }
  }
  return null;
}

function startOfUtcBucket(d, bucket) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const b = String(bucket || "month").toLowerCase();
  if (b === "month") return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), 1));
  if (b === "week") {
    const day = dt.getUTCDay();
    const offset = (day + 6) % 7;
    return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() - offset));
  }
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function addUtcBucket(d, bucket) {
  const dt = new Date(d);
  const b = String(bucket || "month").toLowerCase();
  if (b === "month") return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1));
  if (b === "week") return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 7));
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 1));
}

function buildUtcBucketKeys(from, to, bucket) {
  const keys = [];
  const start = startOfUtcBucket(from, bucket);
  if (!start) return keys;
  const end = new Date(to);
  let cur = start;
  while (cur < end && keys.length < 2000) {
    keys.push(cur.toISOString().slice(0, 10));
    cur = addUtcBucket(cur, bucket);
  }
  return keys;
}

function extractReportBucketColumns(report, bucket, startDate, endDate) {
  const columns = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
  const parsed = columns
    .map((col, index) => {
      const meta = col?.MetaData ?? col?.metaData;
      const startDate = extractReportColumnMetaValue(meta, "StartDate") || parseReportColumnDate(col?.ColTitle);
      if (!startDate) return null;
      return { index, startDate };
    })
    .filter(Boolean);
  if (parsed.length) return parsed;

  const startColIdx = columns.findIndex(
    (col) => String(col?.ColTitle || "").trim().toLowerCase() === "account"
  );
  const totalIdx = columns.length
    ? columns.findIndex((col) => String(col?.ColTitle || "").trim().toLowerCase() === "total")
    : -1;
  const baseIdx = startColIdx >= 0 ? startColIdx + 1 : 1;
  const lastIdx = totalIdx >= 0 ? totalIdx : columns.length;
  const keys = buildUtcBucketKeys(startDate, endDate, bucket);
  const maxBuckets = Math.min(keys.length, Math.max(0, lastIdx - baseIdx));
  return keys.slice(0, maxBuckets).map((key, offset) => ({ index: baseIdx + offset, startDate: key }));
}

function normalizeAccountName(value) {
  let raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  raw = raw.replace(/^total for\s+/i, "").replace(/^total\s+/i, "");
  raw = raw.replace(/\s+\(\d+\)\s*$/i, "");
  raw = raw.replace(/\s+\([^)]+\)\s*$/i, "");
  raw = raw.replace(/\s+/g, " ");
  return raw.trim();
}

function accountNameVariants(value) {
  const normalized = normalizeAccountName(value);
  if (!normalized) return [];
  const out = new Set([normalized]);
  if (normalized.includes(":")) {
    const parts = normalized.split(":").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) out.add(last);
  }
  return Array.from(out.values());
}

async function resolveSelectedAccountNames({ companyId, selectedIds }) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  if (!selected.length) return new Set();
  try {
    const accounts = await listQboIncomeAccounts({ companyId });
    const selectedSet = new Set(selected.map((id) => String(id)));
    const names = new Set();
    accounts.forEach((account) => {
      if (!account?.id || !selectedSet.has(String(account.id))) return;
      accountNameVariants(account?.name).forEach((nameKey) => names.add(nameKey));
      accountNameVariants(account?.fullyQualifiedName).forEach((nameKey) => names.add(nameKey));
    });
    return names;
  } catch {
    return new Set();
  }
}

async function resolveSelectedAccountLabels({ companyId, selectedIds }) {
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const labels = new Map();
  if (!selected.length) return labels;
  const selectedSet = new Set(selected.map((id) => String(id)));
  try {
    const accounts = await listQboIncomeAccounts({ companyId });
    accounts.forEach((account) => {
      if (!account?.id) return;
      const id = String(account.id);
      if (!selectedSet.has(id)) return;
      labels.set(id, account?.name || account?.fullyQualifiedName || id);
    });
  } catch {
    // fall through with empty map
  }
  return labels;
}

function extractQuickReportColumnIndex(report, matchFn) {
  const columns = Array.isArray(report?.Columns?.Column) ? report.Columns.Column : [];
  for (let i = 0; i < columns.length; i += 1) {
    const title = String(
      columns[i]?.ColTitle || columns[i]?.colTitle || columns[i]?.ColType || columns[i]?.colType || ""
    )
      .trim()
      .toLowerCase();
    if (matchFn(title)) return i;
  }
  return -1;
}

function summarizeReport(report, rowLimit = 8) {
  const columns = Array.isArray(report?.Columns?.Column)
    ? report.Columns.Column.map((col) => col?.ColTitle || col?.ColType || "")
    : [];
  const rows = [];
  const walk = (items) => {
    if (!Array.isArray(items) || rows.length >= rowLimit) return;
    for (const row of items) {
      if (rows.length >= rowLimit) return;
      if (row?.RowType === "Row") {
        const cols = Array.isArray(row?.ColData) ? row.ColData : [];
        rows.push({
          rowType: row.RowType,
          colData: cols.map((c) => ({
            value: c?.value ?? c?.Value ?? null,
            id: c?.id ?? c?.Id ?? null,
          })),
        });
      }
      if (row?.Rows?.Row) walk(row.Rows.Row);
    }
  };
  walk(report?.Rows?.Row || []);
  return { columns, sampleRows: rows };
}

function collectQuickReportTransactions(report) {
  const dateIdx = extractQuickReportColumnIndex(report, (t) => t.includes("date"));
  const amountIdx = extractQuickReportColumnIndex(report, (t) => t.includes("amount"));
  if (dateIdx < 0 || amountIdx < 0) return [];
  const txns = [];
  walkReportRows(report?.Rows?.Row || [], (row) => {
    const cols = Array.isArray(row?.ColData) ? row.ColData : [];
    if (!cols.length) return;
    const dateRaw = getReportCellValue(cols[dateIdx]);
    const amount = parseReportAmount(getReportCellValue(cols[amountIdx]));
    if (!dateRaw || !Number.isFinite(amount)) return;
    const parsed = Date.parse(dateRaw);
    if (!Number.isFinite(parsed)) return;
    txns.push({ date: new Date(parsed), amount });
  });
  return txns;
}

function bucketStartIso(date, bucket) {
  const start = startOfUtcBucket(date, bucket);
  return start ? start.toISOString().slice(0, 10) : null;
}

async function getIncomeTotalsFromQuickReports({ companyId, selectedIds, startDate, endDate, debug = false }) {
  let total = 0;
  const debugReports = [];
  for (const accountId of selectedIds) {
    const baseQuery = `reports/AccountQuickReport?account=${encodeURIComponent(
      accountId
    )}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
      endDate
    )}`;
    const accrualQuery = `${baseQuery}&accounting_method=Accrual`;
    let report;
    try {
      report = await qboApiRequest({ companyId, method: "GET", path: accrualQuery });
    } catch (err) {
      if (!isQboUnexpectedInternalError(err)) throw err;
      report = await qboApiRequest({ companyId, method: "GET", path: baseQuery });
    }
    if (debug) {
      debugReports.push({
        accountId: String(accountId),
        report: summarizeReport(report),
      });
    }
    const txns = collectQuickReportTransactions(report);
    txns.forEach((txn) => {
      total += txn.amount;
    });
  }
  return { total, debugReports };
}

async function getIncomeTimeSeriesFromQuickReports({
  companyId,
  selectedIds,
  startDate,
  endDate,
  bucket,
  debug = false,
}) {
  const labels = await resolveSelectedAccountLabels({ companyId, selectedIds });
  const series = new Map();
  const debugReports = [];
  for (const accountId of selectedIds) {
    const baseQuery = `reports/AccountQuickReport?account=${encodeURIComponent(
      accountId
    )}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
      endDate
    )}`;
    const accrualQuery = `${baseQuery}&accounting_method=Accrual`;
    let report;
    try {
      report = await qboApiRequest({ companyId, method: "GET", path: accrualQuery });
    } catch (err) {
      if (!isQboUnexpectedInternalError(err)) throw err;
      report = await qboApiRequest({ companyId, method: "GET", path: baseQuery });
    }
    if (debug) {
      debugReports.push({
        accountId: String(accountId),
        report: summarizeReport(report),
      });
    }
    const txns = collectQuickReportTransactions(report);
    if (!txns.length) continue;
    const label = labels.get(String(accountId)) || String(accountId);
    const key = String(accountId);
    if (!series.has(key)) series.set(key, { key, label, values: new Map() });
    const entry = series.get(key);
    txns.forEach((txn) => {
      const bucketIso = bucketStartIso(txn.date, bucket);
      if (!bucketIso) return;
      const prev = entry.values.get(bucketIso) || 0;
      entry.values.set(bucketIso, prev + txn.amount);
    });
  }

  const rows = [];
  for (const entry of series.values()) {
    for (const [bucketIso, value] of entry.values.entries()) {
      if (!Number.isFinite(value) || value === 0) continue;
      rows.push({
        bucket: bucketIso,
        key: entry.key,
        label: entry.label,
        revenue: value,
      });
    }
  }
  return { rows, debugReports };
}

function walkReportRows(rows, cb) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    if (row?.RowType === "Row") cb(row);
    if (row?.RowType === "Section") {
      const headerCol = row?.Header?.ColData?.[0] || null;
      const summaryCols = Array.isArray(row?.Summary?.ColData) ? row.Summary.ColData : null;
      if (headerCol && summaryCols && summaryCols.length) {
        const merged = [{ ...headerCol }, ...summaryCols.slice(1)];
        cb({ RowType: "Row", ColData: merged });
      }
    }
    if (row?.Rows?.Row) walkReportRows(row.Rows.Row, cb);
  }
}

async function getIncomeTotals({ companyId, startDate, endDate, debug = false }) {
  const settings = await getCompanySettings(companyId);
  const selected = settings.qbo_income_account_ids || [];
  if (!selected.length) return { total: 0, selectedAccounts: [] };
  const baseQuery = `reports/ProfitAndLoss?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(
    endDate
  )}`;
  const accrualQuery = `${baseQuery}&accounting_method=Accrual`;
  let data;
  try {
    data = await qboApiRequest({ companyId, method: "GET", path: accrualQuery });
  } catch (err) {
    if (!isQboUnexpectedInternalError(err)) throw err;
    data = await qboApiRequest({ companyId, method: "GET", path: baseQuery });
  }
  const rows = data?.Rows?.Row || [];
  const selectedNames = await resolveSelectedAccountNames({ companyId, selectedIds: selected });
  const total = sumReportIncomeRows(rows, selected, selectedNames);
  const debugInfo = debug ? { pAndL: summarizeReport(data) } : null;
  if (total !== 0) {
    return debug ? { total, selectedAccounts: selected, debug: debugInfo } : { total, selectedAccounts: selected };
  }
  const quick = await getIncomeTotalsFromQuickReports({
    companyId,
    selectedIds: selected,
    startDate,
    endDate,
    debug,
  });
  if (debug) {
    debugInfo.quickReports = quick.debugReports;
    return { total: quick.total, selectedAccounts: selected, debug: debugInfo };
  }
  return { total: quick.total, selectedAccounts: selected };
}

async function getIncomeTimeSeries({ companyId, startDate, endDate, bucket = "month", debug = false }) {
  const settings = await getCompanySettings(companyId);
  const selected = settings.qbo_income_account_ids || [];
  if (!selected.length) return { rows: [], selectedAccounts: [] };

  const start = toQboDate(startDate);
  const end = toQboDate(endDate);
  if (!start || !end) return { rows: [], selectedAccounts: selected };

  const bucketKey = String(bucket || "month").toLowerCase();
  const summarize =
    bucketKey === "day" ? "Day" : bucketKey === "week" ? "Week" : "Month";

  const query = `reports/ProfitAndLoss?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(
    end
  )}&summarize_column_by=${encodeURIComponent(summarize)}`;
  const accrualQuery = `${query}&accounting_method=Accrual`;
  let data;
  try {
    data = await qboApiRequest({ companyId, method: "GET", path: accrualQuery });
  } catch (err) {
    if (!isQboUnexpectedInternalError(err)) throw err;
    data = await qboApiRequest({ companyId, method: "GET", path: query });
  }
  const columnDefs = extractReportBucketColumns(data, bucketKey, start, end);
  if (!columnDefs.length) {
    const quick = await getIncomeTimeSeriesFromQuickReports({
      companyId,
      selectedIds: selected,
      startDate: start,
      endDate: end,
      bucket: bucketKey,
      debug,
    });
    if (debug) {
      return { rows: quick.rows, selectedAccounts: selected, debug: { quickReports: quick.debugReports } };
    }
    return { rows: quick.rows, selectedAccounts: selected };
  }

  const selectedSet = new Set(selected.map((v) => String(v)));
  const selectedNames = await resolveSelectedAccountNames({ companyId, selectedIds: selected });
  const series = new Map();

  walkReportRows(data?.Rows?.Row || [], (row) => {
    const cols = Array.isArray(row?.ColData) ? row.ColData : [];
    if (!cols.length) return;
    const accountCell = cols.find((c) => getReportCellId(c)) || cols[0] || {};
    const accountId = getReportCellId(accountCell) ? String(getReportCellId(accountCell)) : null;
    const accountName = getReportCellValue(cols[0]) || getReportCellValue(accountCell);
    const nameKeys = accountNameVariants(accountName);
    const matches =
      (accountId && selectedSet.has(accountId)) ||
      nameKeys.some((nameKey) => selectedNames.has(nameKey));
    if (!matches) return;
    const label = accountName || accountId;
    const key = accountId || label;
    if (!series.has(key)) {
      series.set(key, { key, label, values: new Map() });
    }
    const entry = series.get(key);
    for (const col of columnDefs) {
      const num = parseReportAmount(getReportCellValue(cols[col.index]));
      if (!Number.isFinite(num)) continue;
      const prev = entry.values.get(col.startDate) || 0;
      entry.values.set(col.startDate, prev + num);
    }
  });

  const rows = [];
  for (const entry of series.values()) {
    for (const col of columnDefs) {
      const value = entry.values.get(col.startDate);
      if (!Number.isFinite(value) || value === 0) continue;
      rows.push({
        bucket: col.startDate,
        key: entry.key,
        label: entry.label,
        revenue: value,
      });
    }
  }
  if (rows.length) {
    if (debug) {
      return { rows, selectedAccounts: selected, debug: { pAndL: summarizeReport(data) } };
    }
    return { rows, selectedAccounts: selected };
  }
  const quick = await getIncomeTimeSeriesFromQuickReports({
    companyId,
    selectedIds: selected,
    startDate: start,
    endDate: end,
    bucket: bucketKey,
    debug,
  });
  if (debug) {
    return { rows: quick.rows, selectedAccounts: selected, debug: { pAndL: summarizeReport(data), quickReports: quick.debugReports } };
  }
  return { rows: quick.rows, selectedAccounts: selected };
}

const PICKUP_BULK_SUFFIX = "PICKUP-ALL";

function getPickupBulkDocNumber({ roNumber, orderId, pickedUpAt, billingDay }) {
  if (useQboAutoDocNumber()) return null;
  const periodInfo = resolvePickupPeriod({ pickedUpAt, billingDay });
  if (!periodInfo) return null;
  return buildDocNumber({ roNumber, orderId, periodKey: periodInfo.periodKey, suffix: PICKUP_BULK_SUFFIX });
}

async function createPickupDraftInvoice({ companyId, orderId, lineItemId, pickedUpAt }) {
  const settings = await getCompanySettings(companyId);
  const periodInfo = resolvePickupPeriod({ pickedUpAt, billingDay: settings.qbo_billing_day });
  if (!periodInfo) return { ok: false, error: "Unable to resolve billing period." };
  return await createDraftInvoice({
    companyId,
    orderId,
    lineItemIds: [lineItemId],
    periodStart: pickedUpAt || periodInfo.periodStart,
    periodEnd: periodInfo.periodEnd,
    periodKey: periodInfo.periodKey,
    docSuffix: `PICKUP-${lineItemId}`,
  });
}

async function createPickupDraftInvoiceBulk({ companyId, orderId, lineItemIds, pickedUpAt }) {
  const ids = Array.isArray(lineItemIds)
    ? lineItemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  if (!ids.length) return { ok: false, error: "lineItemIds are required." };
  const settings = await getCompanySettings(companyId);
  const periodInfo = resolvePickupPeriod({ pickedUpAt, billingDay: settings.qbo_billing_day });
  if (!periodInfo) return { ok: false, error: "Unable to resolve billing period." };
  return await createDraftInvoice({
    companyId,
    orderId,
    lineItemIds: ids,
    periodStart: pickedUpAt || periodInfo.periodStart,
    periodEnd: periodInfo.periodEnd,
    periodKey: periodInfo.periodKey,
    docSuffix: PICKUP_BULK_SUFFIX,
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
  disconnectQboConnection,
  normalizeQboCustomer,
  listQboCustomers,
  normalizeQboItem,
  listQboItems,
  listQboIncomeAccounts,
  listQboTaxCodes,
  getQboCustomerById,
  createQboCustomer,
  createDraftInvoice,
  createDraftCreditMemo,
  createPickupDraftInvoice,
  createPickupDraftInvoiceBulk,
  createMonthlyDraftInvoice,
  createReturnCreditMemo,
  getPickupBulkDocNumber,
  syncQboDocumentById,
  handleWebhookEvent,
  runCdcSync,
  getIncomeTotals,
  getIncomeTimeSeries,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
};
