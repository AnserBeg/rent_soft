const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");

// Load env from repo root even if server is started from `backend/`.
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const { mimeFromExtension, readImageAsInlinePart, generateDamageReportMarkdown } = require("./aiDamageReport");
const { editImageBufferWithGemini, writeCompanyUpload } = require("./aiImageEdit");

const {
  ensureTables,
  createCompanyWithUser,
  createUser,
  listUsers,
  getUser,
  updateUserRoleModes,
  authenticateUser,
  createCompanyUserSession,
  getCompanyUserByToken,
  revokeCompanyUserSession,
  getCompanyProfile,
  updateCompanyProfile,
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  setLocationGeocode,
  deleteLocation,
  getEquipmentLocationIds,
  listEquipmentCurrentLocationIdsForIds,
  recordEquipmentCurrentLocationChange,
  cleanupNonBaseLocationIfUnused,
  listEquipmentCurrentLocationHistory,
  listEquipment,
  setEquipmentCurrentLocationForIds,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  purgeEquipmentForCompany,
  listEquipmentBundles,
  getEquipmentBundle,
  createEquipmentBundle,
  updateEquipmentBundle,
  deleteEquipmentBundle,
  listCategories,
  createCategory,
  listTypes,
  createType,
  updateType,
  deleteType,
  listTypeStats,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  importCustomersFromText,
  importInventoryFromText,
  importCustomerPricingFromInventoryText,
  importRentalOrdersFromLegacyExports,
  importRentalOrdersFromFutureInventoryReport,
  backfillLegacyRates,
  listCustomerPricing,
  upsertCustomerPricing,
  deleteCustomerPricing,
  listSalesPeople,
  getSalesPerson,
  createSalesPerson,
  updateSalesPerson,
  deleteSalesPerson,
  listRentalOrders,
  listRentalOrdersForRange,
  listRentalOrderContacts,
  listTimelineData,
  getRentalOrder,
  createRentalOrder,
  updateRentalOrder,
  updateRentalOrderSiteAddress,
  updateRentalOrderStatus,
  listRentalOrderAudits,
  addRentalOrderNote,
  addRentalOrderAttachment,
  deleteRentalOrderAttachment,
  listCustomerDocuments,
  addCustomerDocument,
  deleteCustomerDocument,
  getCustomerStorefrontExtras,
  listAvailableInventory,
  getBundleAvailability,
  getTypeDemandAvailability,
  listStorefrontListings,
  createStorefrontCustomer,
  authenticateStorefrontCustomer,
  authenticateStorefrontCustomerAnyCompany,
  getStorefrontCustomerByToken,
  revokeStorefrontCustomerSession,
  updateStorefrontCustomerProfile,
  createCustomerAccount,
  authenticateCustomerAccount,
  getCustomerAccountByToken,
  revokeCustomerAccountSession,
  updateCustomerAccountProfile,
  createStorefrontReservation,
  listCustomerOrdersForInternalCustomer,
  listCustomerCompaniesByEmail,
  findInternalCustomerIdByEmail,
  getCompanySettings,
  upsertCompanySettings,
  getCompanyEmailSettings,
  upsertCompanyEmailSettings,
  rescheduleLineItemEnd,
  setLineItemPickedUp,
  setLineItemReturned,
  applyWorkOrderPauseToEquipment,
  createPickupBillingForLineItem,
  createReturnBillingForLineItem,
  createPauseBillingAdjustments,
  getTypeAvailabilitySeries,
  getAvailabilityShortfallsSummary,
  getTypeAvailabilitySeriesWithProjection,
  getTypeAvailabilityShortfallDetails,
  getUtilizationDashboard,
  getRevenueSummary,
  getRevenueTimeSeries,
  getSalespersonSummary,
  getSalespersonClosedTransactionsTimeSeries,
  getLocationClosedTransactionsTimeSeries,
  getLocationTypeStockSummary,
  listInvoices,
  getInvoice,
  replaceInvoiceLineItems,
  createManualInvoice,
  addInvoicePayment,
  addCustomerPayment,
  addCustomerDeposit,
  getCustomerCreditBalance,
  getCustomerDepositBalance,
  applyCustomerCreditToInvoice,
  applyCustomerDepositToInvoice,
  applyCustomerCreditToOldestInvoices,
  listCustomerCreditActivity,
  refundCustomerDeposit,
  reverseInvoicePayment,
  markInvoiceEmailSent,
  createInvoiceVersion,
  markInvoiceVersionSent,
  getLatestSentInvoiceVersion,
  getLatestInvoiceVersion,
  createInvoiceCorrection,
  deleteInvoice,
  voidInvoice,
  generateInvoicesForRentalOrder,
  listCompaniesWithMonthlyAutoRun,
  generateMonthlyInvoicesForCompany,
  getAccountsReceivableSummary,
} = require("./db");

const { streamOrderPdf, buildOrderPdfBuffer, streamInvoicePdf, buildInvoicePdfBuffer, streamOrdersReportPdf } = require("./pdf");
const { sendCompanyEmail, requestSubmittedEmail, statusUpdatedEmail, invoiceEmail } = require("./mailer");

const app = express();
const PORT = process.env.PORT || 4000;

const publicRoot = path.join(__dirname, "..", "public");
const spaRoot = path.join(publicRoot, "spa");
const defaultUploadRoot = path.join(publicRoot, "uploads");
const uploadRoot = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : defaultUploadRoot;

function normalizeInvoiceDocumentType(value) {
  const raw = String(value || "").trim().toLowerCase();
  switch (raw) {
    case "credit_memo":
    case "credit":
      return "credit_memo";
    case "debit_memo":
    case "debit":
      return "debit_memo";
    default:
      return "invoice";
  }
}

function buildInvoiceSnapshot({ detail, companyProfile, companyLogoUrl }) {
  return {
    generatedAt: new Date().toISOString(),
    invoice: detail?.invoice || null,
    lineItems: Array.isArray(detail?.lineItems) ? detail.lineItems : [],
    payments: Array.isArray(detail?.payments) ? detail.payments : [],
    companyProfile: companyProfile || null,
    companyLogoUrl: companyLogoUrl || null,
  };
}

async function createInvoiceVersionSnapshot({
  companyId,
  invoiceId,
  detail,
  companyProfile = null,
  companyLogoPath = null,
  companyLogoUrl = null,
  billingTimeZone = null,
} = {}) {
  const invoiceDetail = detail || (await getInvoice({ companyId, id: invoiceId }));
  if (!invoiceDetail) return null;

  const pdf = await buildInvoicePdfBuffer({ ...invoiceDetail, companyLogoPath, companyProfile, timeZone: billingTimeZone });
  const snapshot = buildInvoiceSnapshot({ detail: invoiceDetail, companyProfile, companyLogoUrl });
  const version = await createInvoiceVersion({
    companyId,
    invoiceId,
    snapshot,
    pdfBuffer: pdf.buffer,
    pdfFilename: pdf.filename,
  });
  if (!version) return null;
  return { detail: invoiceDetail, pdf, snapshot, version };
}

async function sendInvoiceEmailWithVersion({
  companyId,
  invoiceId,
  detail,
  to,
  message = null,
  emailSettings,
  companyProfile = null,
  companyLogoPath = null,
  companyLogoUrl = null,
  billingTimeZone = null,
} = {}) {
  const recipient = String(to || "").trim();
  if (!recipient) return { ok: false, error: "Recipient email is required." };

  const versioned = await createInvoiceVersionSnapshot({
    companyId,
    invoiceId,
    detail,
    companyProfile,
    companyLogoPath,
    companyLogoUrl,
    billingTimeZone,
  });
  if (!versioned) return { ok: false, error: "Invoice not found." };

  const tpl = invoiceEmail({
    invoice: versioned.detail.invoice,
    companyName: companyProfile?.name || null,
    message: message || null,
  });
  const attachments = [{ filename: versioned.pdf.filename, content: versioned.pdf.buffer, contentType: "application/pdf" }];
  const result = await sendCompanyEmail({
    companyId,
    settings: emailSettings,
    to: recipient,
    subject: tpl.subject,
    text: tpl.text,
    attachments,
  });
  if (result.ok) {
    const versionId = versioned.version?.id;
    if (versionId) {
      await markInvoiceVersionSent({ companyId, invoiceId, versionId }).catch(() => null);
    }
    await markInvoiceEmailSent({ companyId, invoiceId }).catch(() => null);
  }
  return result;
}

async function emailInvoicesIfConfigured({ companyId, invoices } = {}) {
  const cid = Number(companyId);
  const created = Array.isArray(invoices) ? invoices : [];
  if (!Number.isFinite(cid) || !created.length) return;

  const emailSettings = await getCompanyEmailSettings(cid);
  if (emailSettings.email_enabled !== true || emailSettings.email_notify_invoices !== true) return;

  const companySettings = await getCompanySettings(cid);
  const companyLogoUrl = companySettings?.logo_url || null;
  const billingTimeZone = companySettings?.billing_timezone || null;
  const rawLogoPath = companySettings?.logo_url
    ? resolveCompanyUploadPath({ companyId: cid, url: companySettings.logo_url })
    : null;
  const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
  const profile = await getCompanyProfile(cid).catch(() => null);

  for (const createdInvoice of created) {
    const invoiceId = createdInvoice?.id ? Number(createdInvoice.id) : null;
    if (!invoiceId) continue;
    const detail = await getInvoice({ companyId: cid, id: invoiceId }).catch(() => null);
    const recipients = getInvoiceRecipientEmails(detail?.invoice);
    if (!detail || !recipients.length) continue;

    await sendInvoiceEmailWithVersion({
      companyId: cid,
      invoiceId,
      detail,
      to: recipients.join(", "),
      emailSettings,
      companyProfile: profile || null,
      companyLogoPath: logoPath,
      companyLogoUrl,
      billingTimeZone,
    });
  }
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const rawUrl = String(req.url || "");
  const [pathname, query = ""] = rawUrl.split("?", 2);
  if (!pathname.startsWith("/uploads/")) return next();

  // Backward compatibility: some persisted upload URLs accidentally include multiple submissionIds like
  // `customer-signup-<uuid1>,<uuid2>/...` even though files were stored under `<uuid1>`.
  const rewriteSubmissionSegment = (prefix, submissionSegment) => {
    const normalized = normalizeSubmissionId(submissionSegment);
    if (!normalized || normalized === submissionSegment) return null;
    return `${prefix}${normalized}/`;
  };

  let fixedPath = null;

  const storefrontMatch = pathname.match(
    /^\/uploads\/storefront\/company-(\d+)\/(customer-(?:signup|profile))-([^/]+)\/(.+)$/
  );
  if (storefrontMatch) {
    const [, companyId, kind, submissionSegment, rest] = storefrontMatch;
    const prefix = `/uploads/storefront/company-${companyId}/${kind}-`;
    const rewritten = rewriteSubmissionSegment(prefix, submissionSegment);
    if (rewritten) fixedPath = `${rewritten}${rest}`;
  }

  const customersSignupMatch = pathname.match(/^\/uploads\/customers\/signup-([^/]+)\/(.+)$/);
  if (!fixedPath && customersSignupMatch) {
    const [, submissionSegment, rest] = customersSignupMatch;
    const prefix = "/uploads/customers/signup-";
    const rewritten = rewriteSubmissionSegment(prefix, submissionSegment);
    if (rewritten) fixedPath = `${rewritten}${rest}`;
  }

  const customersProfileMatch = pathname.match(/^\/uploads\/customers\/account-(\d+)\/profile-([^/]+)\/(.+)$/);
  if (!fixedPath && customersProfileMatch) {
    const [, accountId, submissionSegment, rest] = customersProfileMatch;
    const prefix = `/uploads/customers/account-${accountId}/profile-`;
    const rewritten = rewriteSubmissionSegment(prefix, submissionSegment);
    if (rewritten) fixedPath = `${rewritten}${rest}`;
  }

  if (!fixedPath) return next();
  req.url = query ? `${fixedPath}?${query}` : fixedPath;
  next();
});
if (fs.existsSync(spaRoot)) {
  app.use(express.static(spaRoot));
}
app.use("/uploads", express.static(uploadRoot));
app.use(express.static(publicRoot));

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
      } catch {
        return [];
      }
    }
    return [raw];
  }
  return [];
}

function normalizeTimestampInput(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["true", "1", "yes", "y", "on"].includes(raw)) return true;
  if (["false", "0", "no", "n", "off"].includes(raw)) return false;
  return null;
}

function normalizePurchaseOrderStatus(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "closed") return "closed";
  return "open";
}

function getInvoiceRecipientEmails(invoice) {
  const contacts = Array.isArray(invoice?.customerAccountingContacts) ? invoice.customerAccountingContacts : [];
  const normalizeEmail = (value) => String(value || "").trim();
  const selected = contacts
    .filter((c) => c && c.invoiceEmail === true)
    .map((c) => normalizeEmail(c.email))
    .filter(Boolean);
  if (selected.length) return selected;
  const accounting = contacts.map((c) => normalizeEmail(c?.email)).filter(Boolean);
  if (accounting.length) return accounting;
  const fallback = normalizeEmail(invoice?.customerEmail);
  return fallback ? [fallback] : [];
}

app.get(
  "/api/public-config",
  asyncHandler(async (req, res) => {
    res.json({
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ? String(process.env.GOOGLE_MAPS_API_KEY) : null,
    });
  })
);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function normalizeSubmissionId(value) {
  const candidate = Array.isArray(value) ? value.find((v) => String(v || "").trim()) : value;
  const raw = String(candidate || "").trim();
  if (!raw) return "";

  const match = raw.match(UUID_RE);
  if (match) return match[0];

  if (raw.includes(",")) {
    const first = raw
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    return first || raw;
  }

  return raw;
}

function getOrCreateUploadSubmissionId(req) {
  if (req._uploadSubmissionId) return req._uploadSubmissionId;
  const normalized = normalizeSubmissionId(req.body?.submissionId);
  req._uploadSubmissionId = normalized || crypto.randomUUID();
  return req._uploadSubmissionId;
}

const COMPANY_SESSION_COOKIE = "rentSoft.cu";

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const [k, ...rest] = part.split("=");
    const key = String(k || "").trim();
    if (!key) continue;
    const value = rest.join("=");
    out[key] = decodeURIComponent(String(value || "").trim());
  }
  return out;
}

function readCompanyUserToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (tokenFromHeader) return tokenFromHeader;
  const cookies = parseCookies(req);
  return String(cookies[COMPANY_SESSION_COOKIE] || "").trim();
}

function setCompanySessionCookie(res, token, maxAgeMs) {
  const raw = String(token || "").trim();
  const maxAge = Number.isFinite(Number(maxAgeMs)) ? Number(maxAgeMs) : 0;
  const secure = String(process.env.COOKIE_SECURE || "").trim().toLowerCase() === "true";
  const parts = [
    `${COMPANY_SESSION_COOKIE}=${encodeURIComponent(raw)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearCompanySessionCookie(res) {
  const secure = String(process.env.COOKIE_SECURE || "").trim().toLowerCase() === "true";
  const parts = [`${COMPANY_SESSION_COOKIE}=`, "Path=/", "HttpOnly", "Max-Age=0", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

async function requireCompanyUserAuth(req, res, next) {
  const token = readCompanyUserToken(req);
  if (!token) return res.status(401).json({ error: "Login required." });
  const session = await getCompanyUserByToken(token);
  if (!session) return res.status(401).json({ error: "Login required." });

  req.auth = {
    token,
    sessionId: session.sessionId,
    expiresAt: session.expiresAt || null,
    userId: session.user.id,
    companyId: session.company.id,
    role: session.user.role,
    user: session.user,
    company: session.company,
  };

  // Enforce tenant scoping regardless of what the client sent.
  req.query = req.query || {};
  req.query.companyId = String(session.company.id);
  if (!req.body || typeof req.body !== "object") req.body = {};
  req.body.companyId = session.company.id;

  next();
}

function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles.map((r) => String(r)) : [String(roles)];
  return (req, res, next) => {
    const role = req.auth?.role ? String(req.auth.role) : "";
    if (!role || !allowed.includes(role)) return res.status(403).json({ error: "Insufficient permissions." });
    next();
  };
}

async function requireCustomerAccount(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const account = await getCustomerAccountByToken(token);
  if (account) return { kind: "account", token, customer: account };
  const storefront = await getStorefrontCustomerByToken(token);
  if (storefront) return { kind: "storefront", token, customer: storefront };
  return null;
}

function buildLocationGeocodeQuery(location) {
  if (!location) return "";
  const parts = [location.street_address, location.city, location.region, location.country]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return parts.join(", ");
}

function getGeocodeUserAgent() {
  const userAgent = String(process.env.GEOCODE_USER_AGENT || "").trim();
  if (userAgent) return userAgent;
  return "AivenRental/0.1 (set GEOCODE_USER_AGENT=AivenRental/0.1 (you@example.com))";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GEOCODE_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.GEOCODE_TIMEOUT_MS);
  const fallback = 15000;
  const raw = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  return Math.max(2000, Math.min(60000, Math.floor(raw)));
})();

const NOMINATIM_BASE_URL = (() => {
  const raw = String(process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org").trim();
  return raw.replace(/\/+$/, "") || "https://nominatim.openstreetmap.org";
})();

const nominatimSearchCache = new Map();
const NOMINATIM_CACHE_TTL_MS = 1000 * 60 * 10;
const NOMINATIM_CACHE_MAX = 250;
const nominatimSearchInflight = new Map();

function pruneNominatimCache(now = Date.now()) {
  for (const [key, entry] of nominatimSearchCache.entries()) {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) nominatimSearchCache.delete(key);
  }
  if (nominatimSearchCache.size <= NOMINATIM_CACHE_MAX) return;
  const toRemove = nominatimSearchCache.size - NOMINATIM_CACHE_MAX;
  const keys = Array.from(nominatimSearchCache.keys()).slice(0, toRemove);
  keys.forEach((k) => nominatimSearchCache.delete(k));
}

function classifyFetchError(err) {
  const name = err?.name ? String(err.name) : "";
  const message = err?.message ? String(err.message) : "";
  if (name === "TimeoutError" || message.toLowerCase().includes("aborted due to timeout")) {
    return { status: 504, message: "Geocoding request timed out." };
  }
  return { status: 503, message: message || "Geocoding request failed." };
}

function normalizeWhitespace(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function buildUniqueLocationName(existingNames, baseName) {
  const raw = normalizeWhitespace(baseName) || "Dropoff site";
  if (!existingNames.has(raw)) return raw;
  for (let i = 2; i <= 50; i += 1) {
    const next = `${raw} (${i})`;
    if (!existingNames.has(next)) return next;
  }
  return `${raw} (${Date.now()})`;
}

async function ensureDropoffLocation({ companyId, dropoffAddress }) {
  const addr = normalizeWhitespace(dropoffAddress);
  if (!addr) return null;

  const locations = await listLocations(companyId).catch(() => []);
  const normalizedAddr = addr.toLowerCase();
  const existing = (locations || []).find((l) => String(l?.street_address || "").trim().toLowerCase() === normalizedAddr);
  if (existing?.id) return existing;

  const existingNames = new Set((locations || []).map((l) => String(l?.name || "").trim()).filter(Boolean));
  const firstLine = addr.split("\n").map((x) => normalizeWhitespace(x)).find(Boolean) || addr;
  const trimmed = firstLine.length > 64 ? `${firstLine.slice(0, 61)}...` : firstLine;
  const name = buildUniqueLocationName(existingNames, `Dropoff - ${trimmed}`);

  const created = await createLocation({
    companyId,
    name,
    streetAddress: addr,
    city: null,
    region: null,
    country: null,
    isBaseLocation: false,
  });
  if (!created?.id) return null;

  const geo = await geocodeWithNominatim(addr);
  if (geo?.latitude && geo?.longitude) {
    const updated = await setLocationGeocode({
      companyId,
      id: Number(created.id),
      latitude: geo.latitude,
      longitude: geo.longitude,
      provider: geo.provider,
      query: geo.query,
    });
    return updated || created;
  }
  return created;
}

async function updateEquipmentCurrentLocationFromDropoff({ companyId, status, fulfillmentMethod, dropoffAddress, lineItems }) {
  const st = String(status || "").trim().toLowerCase();
  if (st !== "ordered") return { ok: true, updated: 0 };
  if (String(fulfillmentMethod || "").trim().toLowerCase() !== "dropoff") return { ok: true, updated: 0 };
  const addr = normalizeWhitespace(dropoffAddress);
  if (!addr) return { ok: true, updated: 0 };

  const equipmentIds = Array.from(
    new Set(
      (Array.isArray(lineItems) ? lineItems : [])
        .flatMap((li) => (Array.isArray(li?.inventoryIds) ? li.inventoryIds : []))
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v))
    )
  );
  if (!equipmentIds.length) return { ok: true, updated: 0 };

  const before = await listEquipmentCurrentLocationIdsForIds({ companyId, equipmentIds });
  const loc = await ensureDropoffLocation({ companyId, dropoffAddress: addr });
  if (!loc?.id) return { ok: false, updated: 0, error: "Unable to create dropoff location." };
  const count = await setEquipmentCurrentLocationForIds({ companyId, equipmentIds, currentLocationId: Number(loc.id) });
  const cleanupIds = new Set();
  for (const row of before) {
    if (row?.current_location_id && Number(row.current_location_id) !== Number(loc.id)) {
      await recordEquipmentCurrentLocationChange({
        companyId,
        equipmentId: Number(row.id),
        fromLocationId: Number(row.current_location_id),
        toLocationId: Number(loc.id),
      });
      cleanupIds.add(Number(row.current_location_id));
    }
  }
  for (const oldId of cleanupIds) {
    await cleanupNonBaseLocationIfUnused({ companyId, locationId: oldId }).catch(() => null);
  }
  return { ok: true, updated: count, locationId: Number(loc.id) };
}

async function geocodeWithNominatimResult(query) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, status: 400, message: "Missing query." };

  const url = new URL(`${NOMINATIM_BASE_URL}/search`);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", q);

  const headers = {
    Accept: "application/json",
    "User-Agent": getGeocodeUserAgent(),
  };

  const attempt = async () => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        message: text ? String(text).slice(0, 300) : `HTTP ${res.status}`,
      };
    }

    const data = await res.json().catch(() => null);
    const item = Array.isArray(data) ? data[0] : null;
    if (!item) return { ok: false, status: 200, message: "No results returned." };

    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, status: 200, message: "Result missing lat/lon." };
    }

    return { ok: true, latitude, longitude, provider: "nominatim", query: q };
  };

  try {
    const first = await attempt();
    if (first.ok) return first;
    if (first.status === 429) {
      await sleep(1200);
      return await attempt();
    }
    return first;
  } catch (err) {
    const mapped = classifyFetchError(err);
    return { ok: false, status: mapped.status, message: mapped.message };
  }
}

async function geocodeWithNominatim(query) {
  const result = await geocodeWithNominatimResult(query);
  if (!result.ok) return null;
  return result;
}

async function searchWithNominatimResult(query, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return { ok: false, status: 400, message: "Missing query.", results: [] };

  const normalizedLimit = Math.max(1, Math.min(10, Number(limit) || 6));
  const cacheKey = `${q.toLowerCase()}|${normalizedLimit}`;
  const now = Date.now();
  pruneNominatimCache(now);

  const cached = nominatimSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.value) return cached.value;

  const inflight = nominatimSearchInflight.get(cacheKey);
  if (inflight) return await inflight;

  const run = (async () => {
    const url = new URL(`${NOMINATIM_BASE_URL}/search`);
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(normalizedLimit));
    url.searchParams.set("q", q);

    const headers = {
      Accept: "application/json",
      "User-Agent": getGeocodeUserAgent(),
    };

    const attempt = async () => {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          status: res.status,
          message: text ? String(text).slice(0, 300) : `HTTP ${res.status}`,
          results: [],
        };
      }

      const data = await res.json().catch(() => null);
      const items = Array.isArray(data) ? data : [];
      const results = items
        .map((item) => {
          const latitude = Number(item?.lat);
          const longitude = Number(item?.lon);
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
          const address = item?.address && typeof item.address === "object" ? item.address : null;
          const house = address?.house_number ? String(address.house_number) : "";
          const road = address?.road ? String(address.road) : "";
          const city =
            address?.city || address?.town || address?.village || address?.hamlet || address?.municipality || address?.county || "";
          const region = address?.state || address?.region || "";
          const country = address?.country || "";
          const postalCode = address?.postcode || "";
          const street = [house, road].filter(Boolean).join(" ").trim() || "";
          return {
            label: item?.display_name ? String(item.display_name) : `${latitude},${longitude}`,
            latitude,
            longitude,
            street: street || null,
            city: city ? String(city) : null,
            region: region ? String(region) : null,
            country: country ? String(country) : null,
            postalCode: postalCode ? String(postalCode) : null,
          };
        })
        .filter(Boolean);

      return { ok: true, status: 200, message: "", results };
    };

    try {
      const first = await attempt();
      if (first.ok) return first;
      if (first.status === 429) {
        await sleep(1200);
        return await attempt();
      }
      return first;
    } catch (err) {
      const mapped = classifyFetchError(err);
      return { ok: false, status: mapped.status, message: mapped.message, results: [] };
    }
  })();

  nominatimSearchInflight.set(cacheKey, run);
  try {
    const result = await run;
    if (result?.ok) {
      nominatimSearchCache.set(cacheKey, { expiresAt: now + NOMINATIM_CACHE_TTL_MS, value: result });
      pruneNominatimCache(Date.now());
    }
    return result;
  } finally {
    nominatimSearchInflight.delete(cacheKey);
  }
}

// Company/admin APIs are protected by a server-enforced session.
// Public APIs: company signup, company login, storefront, and customer-account endpoints.
app.use(
  "/api",
  asyncHandler(async (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const apiPath = `${req.baseUrl}${req.path}`; // "/api/…"
    if (apiPath === "/api/login") return next();
    if (apiPath === "/api/companies" && req.method === "POST") return next();
    if (apiPath.startsWith("/api/customers")) return next();
    if (apiPath.startsWith("/api/storefront")) return next();

    await requireCompanyUserAuth(req, res, next);
  })
);

// Owner-only controls (authorization).
app.use(
  "/api",
  (req, res, next) => {
    const apiPath = `${req.baseUrl}${req.path}`;
    if (!req.auth) return next();

    const ownerOnly =
      (apiPath.startsWith("/api/users") && (req.method === "POST" || req.method === "PUT")) ||
      (apiPath === "/api/company-settings" && req.method === "PUT") ||
      (apiPath === "/api/company-profile" && req.method === "PUT") ||
      req.method === "DELETE";

    if (!ownerOnly) return next();
    return requireRole("owner")(req, res, next);
  }
);

app.post(
  "/api/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required." });
    const base = await authenticateUser({ email, password });
    if (!base) return res.status(401).json({ error: "Invalid email or password." });

    const session = await createCompanyUserSession({ userId: base.user.id, companyId: base.company.id });
    const payload = { ...base, token: session.token, expiresAt: session.expiresAt || null };
    setCompanySessionCookie(res, session.token, 1000 * 60 * 60 * 24 * 30);
    res.json(payload);
  })
);

app.get(
  "/api/geocode/search",
  asyncHandler(async (req, res) => {
    const { q, limit } = req.query || {};
    const out = await searchWithNominatimResult(q, limit);
    if (!out.ok) {
      const status = out.status && Number.isFinite(Number(out.status)) ? Number(out.status) : 500;
      return res.status(status).json({ error: out.message || "Unable to geocode", results: [] });
    }
    return res.json({ results: out.results || [] });
  })
);

app.get(
  "/api/auth/me",
  asyncHandler(async (req, res) => {
    // Auth is enforced by the /api middleware above.
    res.json({
      user: req.auth?.user || null,
      company: req.auth?.company || null,
      expiresAt: req.auth?.expiresAt || null,
    });
  })
);

app.post(
  "/api/logout",
  asyncHandler(async (req, res) => {
    // Auth is enforced by the /api middleware above.
    const token = req.auth?.token || "";
    await revokeCompanyUserSession(token);
    clearCompanySessionCookie(res);
    res.json({ ok: true });
  })
);

app.post(
  "/api/customers/signup",
  (req, res, next) => {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.startsWith("multipart/form-data")) return next();

    customerAccountSignupUpload.fields([
      { name: "reference1", maxCount: 1 },
      { name: "reference2", maxCount: 1 },
      { name: "proofOfInsurance", maxCount: 1 },
      { name: "driversLicense", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      if (req._uploadSubmissionId) {
        if (!req.body || typeof req.body !== "object") req.body = {};
        req.body.submissionId = req._uploadSubmissionId;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!name || !email || !password) return res.status(400).json({ error: "name, email, and password are required." });

    const created = await createCustomerAccount({ name, email, password });
    let customerForResponse = created;

    const hasOwn = (k) => Object.prototype.hasOwnProperty.call(body, k);
    const readValue = (k) => (hasOwn(k) ? String(body[k] || "") : undefined);

    const files = req.files || {};

    function mapDoc(field, uploadBase) {
      const file = Array.isArray(files[field]) ? files[field][0] : null;
      if (!file?.filename) return null;
      return {
        file,
        doc: {
          url: `${uploadBase}${file.filename}`,
          fileName: file.originalname,
          mime: file.mimetype,
          sizeBytes: file.size,
        },
      };
    }

    const submissionId = normalizeSubmissionId(req._uploadSubmissionId || body.submissionId) || crypto.randomUUID();
    const accountDir = path.join(uploadRoot, "customers", `account-${created.id}`, `profile-${submissionId}`);
    const uploadBase = `/uploads/customers/account-${created.id}/profile-${submissionId}/`;

    const docUpdates = {};
    const toMove = [];
    for (const key of ["reference1", "reference2", "proofOfInsurance", "driversLicense"]) {
      const mapped = mapDoc(key, uploadBase);
      if (!mapped) continue;
      docUpdates[key] = mapped.doc;
      toMove.push(mapped.file);
    }

    if (toMove.length) {
      fs.mkdirSync(accountDir, { recursive: true });
      for (const file of toMove) {
        const src = file.path;
        const dest = path.join(accountDir, file.filename);
        try {
          fs.renameSync(src, dest);
        } catch {
          fs.copyFileSync(src, dest);
          fs.unlinkSync(src);
        }
      }
    }

    const wantsProfileUpdate =
      Object.keys(docUpdates).length > 0 ||
      ["businessName", "phone", "streetAddress", "city", "region", "country", "postalCode", "creditCardNumber"].some((k) => hasOwn(k));

    if (wantsProfileUpdate) {
      const updated = await updateCustomerAccountProfile({
        customerId: created.id,
        businessName: readValue("businessName"),
        phone: readValue("phone"),
        streetAddress: readValue("streetAddress"),
        city: readValue("city"),
        region: readValue("region"),
        country: readValue("country"),
        postalCode: readValue("postalCode"),
        creditCardNumber: readValue("creditCardNumber"),
        documents: Object.keys(docUpdates).length ? docUpdates : undefined,
      });
      if (updated) customerForResponse = updated;
    }

    const session = await authenticateCustomerAccount({ email, password });
    res.status(201).json({ customer: session?.customer || customerForResponse, token: session?.token || null, expiresAt: session?.expiresAt || null });
  })
);

app.post(
  "/api/customers/login",
  asyncHandler(async (req, res) => {
    const { email, password, companyId } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required." });
    const globalSession = await authenticateCustomerAccount({ email, password });
    if (globalSession) return res.json(globalSession);

    const cid = companyId ? Number(companyId) : null;
    if (cid && Number.isFinite(cid) && cid > 0) {
      const storeSession = await authenticateStorefrontCustomer({ companyId: cid, email, password });
      if (storeSession) return res.json(storeSession);
    }

    const storeAny = await authenticateStorefrontCustomerAnyCompany({ email, password });
    if (storeAny) return res.json(storeAny);

    return res.status(401).json({ error: "Invalid email or password." });
  })
);

app.get(
  "/api/customers/me",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });
    res.json({ customer: auth.customer, kind: auth.kind, companyId: auth.customer?.companyId || null });
  })
);

app.post(
  "/api/customers/profile",
  asyncHandler(async (req, res, next) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });
    req.customerAuth = auth;
    if (auth.kind === "account") req.customerAccount = auth.customer;
    if (auth.kind === "storefront") req.storefrontCustomer = auth.customer;
    next();
  }),
  (req, res, next) => {
    const auth = req.customerAuth;
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    const upload = auth.kind === "storefront" ? storefrontCustomerProfileUpload : customerAccountProfileUpload;
    if (auth.kind === "storefront") {
      if (!req.body || typeof req.body !== "object") req.body = {};
      if (!req.body.companyId && auth.customer?.companyId) req.body.companyId = String(auth.customer.companyId);
    }

    upload.fields([
      { name: "reference1", maxCount: 1 },
      { name: "reference2", maxCount: 1 },
      { name: "proofOfInsurance", maxCount: 1 },
      { name: "driversLicense", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      if (req._uploadSubmissionId) {
        if (!req.body || typeof req.body !== "object") req.body = {};
        req.body.submissionId = req._uploadSubmissionId;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const auth = req.customerAuth;
    const customer = auth?.customer || null;
    if (!customer) return res.status(401).json({ error: "Customer login required." });

    const files = req.files || {};

    const submissionId = normalizeSubmissionId(req._uploadSubmissionId || req.body.submissionId);
    const uploadBase =
      auth?.kind === "storefront"
        ? submissionId
          ? `/uploads/storefront/company-${customer.companyId}/customer-profile-${submissionId}/`
          : `/uploads/storefront/company-${customer.companyId}/`
        : submissionId
        ? `/uploads/customers/account-${customer.id}/profile-${submissionId}/`
        : `/uploads/customers/account-${customer.id}/`;

    function mapDoc(field) {
      const file = Array.isArray(files[field]) ? files[field][0] : null;
      if (!file?.filename) return null;
      return {
        url: `${uploadBase}${file.filename}`,
        fileName: file.originalname,
        mime: file.mimetype,
        sizeBytes: file.size,
      };
    }

    const docUpdates = {};
    for (const key of ["reference1", "reference2", "proofOfInsurance", "driversLicense"]) {
      const doc = mapDoc(key);
      if (doc) docUpdates[key] = doc;
    }

    const hasOwn = (k) => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    const readValue = (k) => (hasOwn(k) ? String(req.body[k] || "") : undefined);

    const updated =
      auth?.kind === "storefront"
        ? await updateStorefrontCustomerProfile({
            customerId: customer.id,
            companyId: customer.companyId,
            name: readValue("name"),
            businessName: readValue("businessName"),
            phone: readValue("phone"),
            streetAddress: readValue("streetAddress"),
            city: readValue("city"),
            region: readValue("region"),
            country: readValue("country"),
            postalCode: readValue("postalCode"),
            creditCardNumber: readValue("creditCardNumber"),
            documents: Object.keys(docUpdates).length ? docUpdates : undefined,
          })
        : await updateCustomerAccountProfile({
            customerId: customer.id,
            name: readValue("name"),
            businessName: readValue("businessName"),
            phone: readValue("phone"),
            streetAddress: readValue("streetAddress"),
            city: readValue("city"),
            region: readValue("region"),
            country: readValue("country"),
            postalCode: readValue("postalCode"),
            creditCardNumber: readValue("creditCardNumber"),
            documents: Object.keys(docUpdates).length ? docUpdates : undefined,
          });

    if (!updated) return res.status(404).json({ error: "Customer not found." });
    res.json({ customer: updated });
  })
);

app.post(
  "/api/customers/logout",
  asyncHandler(async (req, res) => {
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Customer login required." });
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });
    if (auth.kind === "storefront") await revokeStorefrontCustomerSession(token);
    else await revokeCustomerAccountSession(token);
    res.json({ ok: true });
  })
);

app.get(
  "/api/customers/companies",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    if (auth.kind === "storefront") {
      const cid = Number(auth.customer?.companyId);
      if (!Number.isFinite(cid) || cid <= 0) return res.json({ companies: [] });
      const profile = await getCompanyProfile(cid).catch(() => null);
      const name = profile?.name ? String(profile.name) : `Company #${cid}`;
      return res.json({ companies: [{ id: cid, name }] });
    }

    const companies = await listCustomerCompaniesByEmail({ email: auth.customer?.email });
    return res.json({ companies });
  })
);

app.get(
  "/api/customers/orders",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    const companyIdQuery = String(req.query?.companyId || "").trim();
    const cid = auth.kind === "storefront" ? Number(auth.customer.companyId) : Number(companyIdQuery);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: "companyId is required." });

    let internalCustomerId = null;
    if (auth.kind === "storefront" && auth.customer?.internalCustomerId) {
      internalCustomerId = Number(auth.customer.internalCustomerId);
    }
    if (!internalCustomerId && auth.customer?.email) {
      internalCustomerId = await findInternalCustomerIdByEmail({ companyId: cid, email: auth.customer.email });
    }

    if (!internalCustomerId) return res.json({ orders: [] });
    const orders = await listCustomerOrdersForInternalCustomer({
      companyId: cid,
      customerId: internalCustomerId,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    res.json({ orders, companyId: cid });
  })
);

app.get(
  "/api/customers/invoices",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    const companyIdQuery = String(req.query?.companyId || "").trim();
    const cid = auth.kind === "storefront" ? Number(auth.customer.companyId) : Number(companyIdQuery);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: "companyId is required." });

    let internalCustomerId = null;
    if (auth.kind === "storefront" && auth.customer?.internalCustomerId) {
      internalCustomerId = Number(auth.customer.internalCustomerId);
    }
    if (!internalCustomerId && auth.customer?.email) {
      internalCustomerId = await findInternalCustomerIdByEmail({ companyId: cid, email: auth.customer.email });
    }

    if (!internalCustomerId) return res.json({ invoices: [], companyId: cid });
    const invoices = await listInvoices(cid, { customerId: internalCustomerId });
    return res.json({ invoices, companyId: cid });
  })
);

app.get(
  "/api/customers/invoices/:id/pdf",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    const invoiceId = Number(req.params?.id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: "Invalid invoice id." });

    const companyIdQuery = String(req.query?.companyId || "").trim();
    const cid = auth.kind === "storefront" ? Number(auth.customer.companyId) : Number(companyIdQuery);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: "companyId is required." });

    let internalCustomerId = null;
    if (auth.kind === "storefront" && auth.customer?.internalCustomerId) {
      internalCustomerId = Number(auth.customer.internalCustomerId);
    }
    if (!internalCustomerId && auth.customer?.email) {
      internalCustomerId = await findInternalCustomerIdByEmail({ companyId: cid, email: auth.customer.email });
    }
    if (!internalCustomerId) return res.status(404).json({ error: "Invoice not found." });

    const detail = await getInvoice({ companyId: cid, id: invoiceId });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });
    if (Number(detail?.invoice?.customerId) !== Number(internalCustomerId)) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    const status = String(detail?.invoice?.status || "").trim().toLowerCase();
    if (status === "void") {
      const version = await getLatestInvoiceVersion({
        companyId: cid,
        invoiceId: Number(detail.invoice?.id || invoiceId),
      });
      if (version?.pdfBytes) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${version.pdfFilename || `invoice-${detail.invoice?.invoiceNumber || invoiceId}.pdf`}"`
        );
        res.send(version.pdfBytes);
        return;
      }
    } else if (["sent", "paid"].includes(status)) {
      const version = await getLatestSentInvoiceVersion({
        companyId: cid,
        invoiceId: Number(detail.invoice?.id || invoiceId),
      });
      if (version?.pdfBytes) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${version.pdfFilename || `invoice-${detail.invoice?.invoiceNumber || invoiceId}.pdf`}"`
        );
        res.send(version.pdfBytes);
        return;
      }
    }

    const settings = await getCompanySettings(cid);
    const billingTimeZone = settings?.billing_timezone || null;
    const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: settings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
    const companyProfile = await getCompanyProfile(Number(cid));
    streamInvoicePdf(res, { ...detail, companyLogoPath: logoPath, companyProfile, timeZone: billingTimeZone });
  })
);

app.get(
  "/api/customers/orders/:id/pdf",
  asyncHandler(async (req, res) => {
    const auth = await requireCustomerAccount(req);
    if (!auth) return res.status(401).json({ error: "Customer login required." });

    const orderId = Number(req.params?.id);
    if (!Number.isFinite(orderId) || orderId <= 0) return res.status(400).json({ error: "Invalid order id." });

    const companyIdQuery = String(req.query?.companyId || "").trim();
    const cid = auth.kind === "storefront" ? Number(auth.customer.companyId) : Number(companyIdQuery);
    if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ error: "companyId is required." });

    let internalCustomerId = null;
    if (auth.kind === "storefront" && auth.customer?.internalCustomerId) {
      internalCustomerId = Number(auth.customer.internalCustomerId);
    }
    if (!internalCustomerId && auth.customer?.email) {
      internalCustomerId = await findInternalCustomerIdByEmail({ companyId: cid, email: auth.customer.email });
    }
    if (!internalCustomerId) return res.status(404).json({ error: "Rental order not found." });

    const detail = await getRentalOrder({ companyId: cid, id: orderId });
    if (!detail) return res.status(404).json({ error: "Rental order not found." });
    if (Number(detail?.order?.customer_id) !== Number(internalCustomerId)) return res.status(404).json({ error: "Rental order not found." });

    const settings = await getCompanySettings(cid);
    const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: settings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
      const companyProfile = await getCompanyProfile(Number(cid));
      streamOrderPdf(res, {
        ...detail,
        companyLogoPath: logoPath,
        companyProfile,
        rentalInfoFields: settings?.rental_info_fields || null,
      });
  })
);

app.get(
  "/api/storefront/listings",
  asyncHandler(async (req, res) => {
    const { equipment, company, location, from, to, limit, offset } = req.query || {};
    const listings = await listStorefrontListings({
      equipment,
      company,
      location,
      from,
      to,
      limit,
      offset,
    });
    res.json({ listings });
  })
);

app.post(
  "/api/storefront/reservations",
  asyncHandler(async (req, res) => {
      const {
        companyId,
        typeId,
        locationId,
        startAt,
        endAt,
        quantity,
        customerToken,
        customerAccountToken,
        customerNotes,
        deliveryMethod,
        deliveryAddress,
        siteAddress,
        deliveryInstructions,
        criticalAreas,
        generalNotes,
        generalNotesImages,
        emergencyContacts,
        siteContacts,
        coverageHours,
      } = req.body || {};

    const authHeader = String(req.headers.authorization || "").trim();
    const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const token = tokenFromHeader || String(customerToken || customerAccountToken || "").trim();

    if (!companyId || !typeId || !startAt || !endAt || !token) {
      return res.status(400).json({
        error: "companyId, typeId, startAt, endAt, and customer login token are required.",
      });
    }

      try {
        const result = await createStorefrontReservation({
          companyId,
          typeId,
          locationId,
          startAt,
          endAt,
          quantity,
          customerToken: token,
          customerNotes,
          deliveryMethod,
          deliveryAddress,
          siteAddress,
          deliveryInstructions,
          criticalAreas,
          generalNotes,
          generalNotesImages,
          emergencyContacts,
          siteContacts,
          coverageHours,
        });
        if (!result.ok) {
          if (result.error === "missing_rental_information") return res.status(400).json(result);
          return res.status(409).json(result);
        }
        res.status(201).json(result);

      (async () => {
        try {
          const cid = Number(companyId);
          const emailSettings = await getCompanyEmailSettings(cid);
          if (emailSettings.email_enabled !== true || emailSettings.email_notify_request_submit === false) return;
          const detail = await getRentalOrder({ companyId: cid, id: Number(result.orderId) });
          const customerEmail = detail?.order?.customer_email ? String(detail.order.customer_email).trim() : "";
          if (!customerEmail) return;
          const profile = await getCompanyProfile(cid).catch(() => null);
          const tpl = requestSubmittedEmail({ order: detail?.order, companyName: profile?.name || null });
          await sendCompanyEmail({ companyId: cid, settings: emailSettings, to: customerEmail, subject: tpl.subject, text: tpl.text });
        } catch (err) {
          console.warn("Storefront request email failed:", err?.message || err);
        }
      })();
    } catch (err) {
      const message = err?.message ? String(err.message) : "Invalid request.";
      if (message.toLowerCase().includes("login required")) return res.status(401).json({ error: message });
      res.status(400).json({ error: message });
    }
  })
);

app.post(
  "/api/storefront/customers/signup",
  (req, res, next) => {
    storefrontSignupUpload.fields([
      { name: "reference1", maxCount: 1 },
      { name: "reference2", maxCount: 1 },
      { name: "proofOfInsurance", maxCount: 1 },
      { name: "driversLicense", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      if (req._uploadSubmissionId) {
        if (!req.body || typeof req.body !== "object") req.body = {};
        req.body.submissionId = req._uploadSubmissionId;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = String(req.body.companyId || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const submissionId = normalizeSubmissionId(req._uploadSubmissionId || req.body.submissionId);
    const uploadBase = submissionId
      ? `/uploads/storefront/company-${companyId}/customer-signup-${submissionId}/`
      : `/uploads/storefront/company-${companyId}/`;

    const files = req.files || {};

    function mapDoc(field) {
      const file = Array.isArray(files[field]) ? files[field][0] : null;
      if (!file?.filename) return null;
      return {
        url: `${uploadBase}${file.filename}`,
        fileName: file.originalname,
        mime: file.mimetype,
        sizeBytes: file.size,
      };
    }

    const documents = {
      reference1: mapDoc("reference1"),
      reference2: mapDoc("reference2"),
      proofOfInsurance: mapDoc("proofOfInsurance"),
      driversLicense: mapDoc("driversLicense"),
    };

      const parsedDeposit = parseBoolean(req.body.canChargeDeposit);
      const paymentTermsRaw = String(req.body.paymentTermsDays ?? "").trim();
      const paymentTermsDays = paymentTermsRaw ? Number(paymentTermsRaw) : null;
      const payload = {
        companyId,
        name: String(req.body.name || "").trim(),
        businessName: String(req.body.businessName || "").trim() || null,
        companyName: String(req.body.companyName || "").trim() || null,
        streetAddress: String(req.body.streetAddress || "").trim() || null,
        city: String(req.body.city || "").trim() || null,
        region: String(req.body.region || "").trim() || null,
        country: String(req.body.country || "").trim() || null,
        postalCode: String(req.body.postalCode || "").trim() || null,
        email: String(req.body.email || "").trim(),
        phone: String(req.body.phone || "").trim() || null,
        password: String(req.body.password || ""),
        creditCardNumber: String(req.body.creditCardNumber || "").trim() || null,
        contacts: req.body.contacts,
        accountingContacts: req.body.accountingContacts,
        followUpDate: String(req.body.followUpDate || "").trim() || null,
        notes: String(req.body.notes || "").trim() || null,
        canChargeDeposit: parsedDeposit === null ? null : parsedDeposit,
        paymentTermsDays: Number.isFinite(paymentTermsDays) ? paymentTermsDays : null,
        documents,
      };

    const created = await createStorefrontCustomer(payload);
    const session = await authenticateStorefrontCustomer({ companyId, email: payload.email, password: payload.password });
    res.status(201).json({ customer: created, token: session?.token || null, expiresAt: session?.expiresAt || null });
  })
);

app.post(
  "/api/storefront/customers/login",
  asyncHandler(async (req, res) => {
    const { companyId, email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required." });
    const session = await authenticateStorefrontCustomer({ companyId, email, password });
    if (!session) return res.status(401).json({ error: "Invalid email or password." });
    res.json(session);
  })
);

app.post(
  "/api/storefront/customers/logout",
  asyncHandler(async (req, res) => {
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Customer login required." });
    await revokeStorefrontCustomerSession(token);
    res.json({ ok: true });
  })
);

app.post(
  "/api/storefront/customers/profile",
  (req, res, next) => {
    storefrontCustomerProfileUpload.fields([
      { name: "reference1", maxCount: 1 },
      { name: "reference2", maxCount: 1 },
      { name: "proofOfInsurance", maxCount: 1 },
      { name: "driversLicense", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      if (req._uploadSubmissionId) {
        if (!req.body || typeof req.body !== "object") req.body = {};
        req.body.submissionId = req._uploadSubmissionId;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Customer login required." });

    const customer = await getStorefrontCustomerByToken(token);
    if (!customer) return res.status(401).json({ error: "Customer login required." });

    const companyId = Number(customer.companyId);
    if (!Number.isFinite(companyId) || companyId <= 0) return res.status(400).json({ error: "companyId is required." });

    const files = req.files || {};
    const submissionId = normalizeSubmissionId(req._uploadSubmissionId || req.body?.submissionId);
    const uploadBase = submissionId
      ? `/uploads/storefront/company-${companyId}/customer-profile-${submissionId}/`
      : `/uploads/storefront/company-${companyId}/`;

    function mapDoc(field) {
      const file = Array.isArray(files[field]) ? files[field][0] : null;
      if (!file?.filename) return null;
      return {
        url: `${uploadBase}${file.filename}`,
        fileName: file.originalname,
        mime: file.mimetype,
        sizeBytes: file.size,
      };
    }

    const docUpdates = {};
    for (const key of ["reference1", "reference2", "proofOfInsurance", "driversLicense"]) {
      const doc = mapDoc(key);
      if (doc) docUpdates[key] = doc;
    }

    const hasOwn = (k) => Object.prototype.hasOwnProperty.call(req.body || {}, k);
    const readValue = (k) => (hasOwn(k) ? String(req.body[k] || "") : undefined);
    const readBoolean = (k) => {
      if (!hasOwn(k)) return undefined;
      const parsed = parseBoolean(req.body?.[k]);
      if (parsed === null) throw new Error(`${k} must be boolean.`);
      return parsed;
    };

    let updated = null;
    try {
      updated = await updateStorefrontCustomerProfile({
        customerId: customer.id,
        companyId,
        name: readValue("name"),
        businessName: readValue("businessName"),
        canActAsCompany: readBoolean("canActAsCompany"),
        phone: readValue("phone"),
        streetAddress: readValue("streetAddress"),
        city: readValue("city"),
        region: readValue("region"),
        country: readValue("country"),
        postalCode: readValue("postalCode"),
        creditCardNumber: readValue("creditCardNumber"),
        documents: Object.keys(docUpdates).length ? docUpdates : undefined,
      });
    } catch (err) {
      return res.status(400).json({ error: err?.message ? String(err.message) : "Invalid request." });
    }

    if (!updated) return res.status(404).json({ error: "Customer not found." });
    res.json({ customer: updated });
  })
);

app.get(
  "/api/storefront/customers/me",
  asyncHandler(async (req, res) => {
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Customer login required." });

    const customer = await getStorefrontCustomerByToken(token);
    if (!customer) return res.status(401).json({ error: "Customer login required." });
    res.json({ customer });
  })
);

app.get(
  "/api/storefront/customers/upgrade-context",
  asyncHandler(async (req, res) => {
    const authHeader = String(req.headers.authorization || "").trim();
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Customer login required." });

    const customer = await getStorefrontCustomerByToken(token);
    if (!customer) return res.status(401).json({ error: "Customer login required." });
    if (!customer.canActAsCompany) {
      return res.status(403).json({ error: "Enable rental company mode in your customer account first." });
    }

    res.json({
      prefill: {
        ownerName: customer.name || "",
        ownerEmail: customer.email || "",
        contactEmail: customer.email || "",
      },
    });
  })
);

function imageExtensionForMime(mime) {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

function resolveCompanyUploadPath({ companyId, url, allowFiles = false }) {
  const cid = String(companyId || "").trim();
  const raw = String(url || "").trim();
  if (!cid || !raw) return null;
  const base = `/uploads/company-${cid}/`;
  if (!raw.startsWith(base)) return null;
  if (!allowFiles && raw.startsWith(`${base}files/`)) return null;
  const clean = raw.replace(/^\/+/, "");
  if (!clean.startsWith("uploads/")) return null;
  const rel = clean.slice("uploads/".length);
  const full = path.join(uploadRoot, rel);
  const safeRel = path.relative(uploadRoot, full);
  if (safeRel.startsWith("..") || path.isAbsolute(safeRel)) return null;
  return full;
}

async function resolvePdfCompatibleImagePath(fullPath) {
  const src = String(fullPath || "");
  if (!src) return null;
  if (!fs.existsSync(src)) return null;

  const ext = path.extname(src).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return src;

  const target = ext ? `${src.slice(0, -ext.length)}.png` : `${src}.png`;
  if (fs.existsSync(target)) return target;

  try {
    const sharp = require("sharp");
    const input = await fs.promises.readFile(src);
    await sharp(input, { failOnError: false })
      .resize({ width: 600, height: 400, fit: "inside", withoutEnlargement: true })
      .png()
      .toFile(target);
    return target;
  } catch {
    return src;
  }
}

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = String(req.body.companyId || "").trim();
      if (!companyId) return cb(new Error("companyId is required."));
      const dir = path.join(uploadRoot, `company-${companyId}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = imageExtensionForMime(file.mimetype) || path.extname(file.originalname || "");
      const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext.toLowerCase()) ? ext.toLowerCase() : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed."));
    }
    cb(null, true);
  },
});

const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = String(req.body.companyId || "").trim();
      if (!companyId) return cb(new Error("companyId is required."));
      const dir = path.join(uploadRoot, `company-${companyId}`, "files");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, "") : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const storefrontSignupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = String(req.body.companyId || "").trim();
      if (!companyId) return cb(new Error("companyId is required."));
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = path.join(uploadRoot, "storefront", `company-${companyId}`, `customer-signup-${submissionId}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, "") : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const storefrontCustomerProfileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = String(req.body.companyId || "").trim();
      if (!companyId) return cb(new Error("companyId is required."));
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = path.join(uploadRoot, "storefront", `company-${companyId}`, `customer-profile-${submissionId}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, "") : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const customerAccountSignupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = path.join(uploadRoot, "customers", `signup-${submissionId}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, "") : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const customerAccountProfileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const accountId = Number(req.customerAccount?.id);
      if (!Number.isFinite(accountId) || accountId <= 0) return cb(new Error("Customer login required."));
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = path.join(uploadRoot, "customers", `account-${accountId}`, `profile-${submissionId}`);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "");
      const safeExt = ext && ext.length <= 12 ? ext.replace(/[^a-zA-Z0-9.]/g, "") : "";
      cb(null, `${crypto.randomUUID()}${safeExt}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const aiImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image uploads are allowed."));
    }
    cb(null, true);
  },
});

app.post("/api/uploads/image", (req, res, next) => {
  imageUpload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, (req, res) => {
  const companyId = String(req.body.companyId || "").trim();
  if (!companyId) return res.status(400).json({ error: "companyId is required." });
  if (!req.file?.filename) return res.status(400).json({ error: "image file is required." });
  res.status(201).json({ url: `/uploads/company-${companyId}/${req.file.filename}` });
});

app.post("/api/uploads/file", (req, res, next) => {
  fileUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, (req, res) => {
  const companyId = String(req.body.companyId || "").trim();
  if (!companyId) return res.status(400).json({ error: "companyId is required." });
  if (!req.file?.filename) return res.status(400).json({ error: "file is required." });
  res.status(201).json({
    url: `/uploads/company-${companyId}/files/${req.file.filename}`,
    fileName: req.file.originalname,
    mime: req.file.mimetype,
    sizeBytes: req.file.size,
  });
});

app.delete(
  "/api/uploads/image",
  asyncHandler(async (req, res) => {
    const companyId = String(req.body.companyId || "").trim();
    const url = String(req.body.url || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!url) return res.status(400).json({ error: "url is required." });

    const expectedPrefix = `/uploads/company-${companyId}/`;
    if (!url.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: "Invalid image url." });
    }

    const filename = path.posix.basename(url);
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "Invalid image url." });
    }

    const fullPath = path.join(uploadRoot, `company-${companyId}`, filename);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err) {
      if (err && err.code !== "ENOENT") throw err;
    }
    res.status(204).end();
  })
);

app.delete(
  "/api/uploads/file",
  asyncHandler(async (req, res) => {
    const companyId = String(req.body.companyId || "").trim();
    const url = String(req.body.url || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!url) return res.status(400).json({ error: "url is required." });

    const expectedPrefix = `/uploads/company-${companyId}/files/`;
    if (!url.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: "Invalid file url." });
    }

    const filename = path.posix.basename(url);
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "Invalid file url." });
    }

    const fullPath = path.join(uploadRoot, `company-${companyId}`, "files", filename);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err) {
      if (err && err.code !== "ENOENT") throw err;
    }
    res.status(204).end();
  })
);

async function inlineImagePartsFromUrls({ companyId, urls, label }) {
  const cid = String(companyId || "").trim();
  const list = Array.isArray(urls) ? urls : [];
  const parts = [];
  const failures = [];

  for (const url of list) {
    const raw = String(url || "").trim();
    if (!raw) continue;
    const fullPath = resolveCompanyUploadPath({ companyId: cid, url: raw, allowFiles: false });
    if (!fullPath) {
      failures.push(raw);
      continue;
    }
    try {
      parts.push(await readImageAsInlinePart({ fullPath, mimeType: mimeFromExtension(fullPath) }));
    } catch {
      failures.push(raw);
    }
  }

  if (!parts.length) {
    const which = label ? String(label) : "Images";
    const detail = failures.length ? ` Unable to read: ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? ", ..." : ""}` : "";
    throw new Error(`${which} are required.${detail}`);
  }

  return parts;
}

app.post(
  "/api/ai/damage-report",
  asyncHandler(async (req, res) => {
    const { companyId, beforeImages, afterImages, beforeNotes, afterNotes, extraContext } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const beforeUrls = Array.isArray(beforeImages) ? beforeImages.slice(0, 10) : [];
    const afterUrls = Array.isArray(afterImages) ? afterImages.slice(0, 10) : [];

    if (!beforeUrls.length || !afterUrls.length) {
      return res.status(400).json({ error: "Provide at least 1 Before image and 1 After image." });
    }

    const beforeParts = await inlineImagePartsFromUrls({ companyId, urls: beforeUrls, label: "Before images" });
    const afterParts = await inlineImagePartsFromUrls({ companyId, urls: afterUrls, label: "After images" });

    const reportMarkdown = await generateDamageReportMarkdown({
      beforeImages: beforeParts,
      afterImages: afterParts,
      beforeNotes,
      afterNotes,
      extraContext,
    });

    res.status(200).json({ reportMarkdown });
  })
);

app.post(
  "/api/ai/image-edit",
  (req, res, next) => {
    aiImageUpload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = String(req.body.companyId || "").trim();
    const prompt = String(req.body.prompt || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!req.file?.buffer?.length) return res.status(400).json({ error: "image file is required." });
    if (!prompt) return res.status(400).json({ error: "prompt is required." });

    const { outputBuffer, outputMimeType } = await editImageBufferWithGemini({
      inputBuffer: req.file.buffer,
      inputMimeType: req.file.mimetype,
      prompt,
    });

    const { url } = await writeCompanyUpload({
      uploadRoot,
      companyId,
      buffer: outputBuffer,
      mimeType: outputMimeType,
    });

    res.status(201).json({ url });
  })
);

app.post(
  "/api/ai/image-edit-from-url",
  asyncHandler(async (req, res) => {
    const companyId = String(req.body.companyId || "").trim();
    const url = String(req.body.url || "").trim();
    const prompt = String(req.body.prompt || "").trim();
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!url) return res.status(400).json({ error: "url is required." });
    if (!prompt) return res.status(400).json({ error: "prompt is required." });

    const fullPath = resolveCompanyUploadPath({ companyId, url, allowFiles: false });
    if (!fullPath) return res.status(400).json({ error: "Invalid image url." });

    const inputBuffer = await fs.promises.readFile(fullPath);
    const { outputBuffer, outputMimeType } = await editImageBufferWithGemini({
      inputBuffer,
      inputMimeType: mimeFromExtension(fullPath),
      prompt,
    });

    const saved = await writeCompanyUpload({
      uploadRoot,
      companyId,
      buffer: outputBuffer,
      mimeType: outputMimeType,
    });

    res.status(201).json({ url: saved.url });
  })
);

app.post(
  "/api/companies",
  asyncHandler(async (req, res) => {
    const { companyName, contactEmail, ownerName, ownerEmail, password } = req.body;
    if (!companyName || !contactEmail || !ownerName || !ownerEmail || !password) {
      return res.status(400).json({ error: "companyName, contactEmail, ownerName, ownerEmail, and password are required." });
    }
    const result = await createCompanyWithUser({
      companyName,
      contactEmail,
      ownerName,
      ownerEmail,
      password,
    });
    res.status(201).json(result);
  })
);

app.post(
  "/api/users",
  asyncHandler(async (req, res) => {
    const { companyId, name, email, role, password } = req.body;
    if (!companyId || !name || !email || !password) {
      return res.status(400).json({ error: "companyId, name, email, and password are required." });
    }
    const user = await createUser({ companyId, name, email, role, password });
    res.status(201).json(user);
  })
);

app.get(
  "/api/users",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const users = await listUsers(companyId);
    res.json({ users });
  })
);

app.get(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const user = await getUser({ companyId, userId: id });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      user: {
        id: Number(user.id),
        companyId: Number(user.company_id),
        name: user.name,
        email: user.email,
        role: user.role,
        canActAsCustomer: user.can_act_as_customer === true,
        createdAt: user.created_at || null,
      },
    });
  })
);

app.put(
  "/api/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, canActAsCustomer } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const parsed = parseBoolean(canActAsCustomer);
    if (parsed === null) return res.status(400).json({ error: "canActAsCustomer must be boolean." });
    const user = await updateUserRoleModes({ companyId, userId: id, canActAsCustomer: parsed });
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({
      user: {
        id: Number(user.id),
        companyId: Number(user.company_id),
        name: user.name,
        email: user.email,
        role: user.role,
        canActAsCustomer: user.can_act_as_customer === true,
        createdAt: user.created_at || null,
      },
    });
  })
);

app.get(
  "/api/locations",
  asyncHandler(async (req, res) => {
    const { companyId, scope } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const locations = await listLocations(companyId, { scope });
    res.json({ locations });
  })
);

app.post(
  "/api/locations",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      name,
      streetAddress,
      city,
      region,
      country,
      latitude,
      longitude,
      geocodeProvider,
      geocodeQuery,
      isBaseLocation,
    } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const baseFlag = isBaseLocation === undefined ? true : parseBoolean(isBaseLocation);
    if (baseFlag === null) return res.status(400).json({ error: "isBaseLocation must be boolean." });

    const location = await createLocation({ companyId, name, streetAddress, city, region, country, isBaseLocation: baseFlag });
    if (!location) return res.status(404).json({ error: "Unable to create or load location." });

    let saved = location;
    const hasManualCoords = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    if (hasManualCoords) {
      const updated = await setLocationGeocode({
        companyId,
        id: Number(location.id),
        latitude: Number(latitude),
        longitude: Number(longitude),
        provider: geocodeProvider || "manual",
        query: geocodeQuery || null,
      });
      if (updated) saved = updated;
    } else {
      const query = buildLocationGeocodeQuery(location);
      if (query) {
        const geo = await geocodeWithNominatim(query);
        if (geo) {
          const updated = await setLocationGeocode({
            companyId,
            id: Number(location.id),
            latitude: geo.latitude,
            longitude: geo.longitude,
            provider: geo.provider,
            query: geo.query,
          });
          if (updated) saved = updated;
        }
      }
    }

    res.status(201).json(saved);
  })
);

app.put(
  "/api/locations/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, name, streetAddress, city, region, country, isBaseLocation } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const baseFlag = isBaseLocation === undefined ? undefined : parseBoolean(isBaseLocation);
    if (isBaseLocation !== undefined && baseFlag === null) return res.status(400).json({ error: "isBaseLocation must be boolean." });
    try {
      const before = await getLocation({ companyId, id: Number(id) });
      const location = await updateLocation({
        companyId,
        id: Number(id),
        name,
        streetAddress,
        city,
        region,
        country,
        isBaseLocation: baseFlag === undefined ? undefined : baseFlag,
      });
      if (!location) return res.status(404).json({ error: "Location not found." });

      const addressChanged = ["street_address", "city", "region", "country"].some(
        (k) => String(before?.[k] || "") !== String(location?.[k] || "")
      );
      const coordsMissing =
        !Number.isFinite(Number(location?.latitude)) || !Number.isFinite(Number(location?.longitude));
      const query = buildLocationGeocodeQuery(location);

      let saved = location;
      if (query && (addressChanged || coordsMissing)) {
        const geo = await geocodeWithNominatim(query);
        if (geo) {
          const updated = await setLocationGeocode({
            companyId,
            id: Number(location.id),
            latitude: geo.latitude,
            longitude: geo.longitude,
            provider: geo.provider,
            query: geo.query,
          });
          if (updated) saved = updated;
        }
      }

      res.json({ location: saved });
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "A location with that name already exists." });
      throw err;
    }
  })
);

app.post(
  "/api/locations/:id/geocode",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const location = await getLocation({ companyId, id: Number(id) });
    if (!location) return res.status(404).json({ error: "Location not found." });

    const query = buildLocationGeocodeQuery(location);
    if (!query) return res.status(400).json({ error: "Location address is incomplete." });

    const geo = await geocodeWithNominatimResult(query);
    if (!geo.ok) {
      const detail = geo.status ? ` (HTTP ${geo.status})` : "";
      return res.status(422).json({
        error: `Unable to geocode address${detail}: ${geo.message || "Unknown error"}`,
      });
    }

    const updated = await setLocationGeocode({
      companyId,
      id: Number(id),
      latitude: geo.latitude,
      longitude: geo.longitude,
      provider: geo.provider,
      query: geo.query,
    });
    if (!updated) return res.status(404).json({ error: "Location not found." });
    res.json({ location: updated });
  })
);

app.delete(
  "/api/locations/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const count = await deleteLocation({ companyId, id: Number(id) });
    if (!count) return res.status(404).json({ error: "Location not found." });
    res.status(204).end();
  })
);

app.get(
  "/api/locations/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const location = await getLocation({ companyId, id: Number(id) });
    if (!location) return res.status(404).json({ error: "Location not found." });
    res.json({ location });
  })
);

app.get(
  "/api/locations/:id/transactions-closed-timeseries",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, from, to, bucket } = req.query;
    if (!companyId || !from || !to) return res.status(400).json({ error: "companyId, from, and to are required." });
    const rows = await getLocationClosedTransactionsTimeSeries({
      companyId,
      locationId: Number(id),
      from,
      to,
      bucket: bucket || "month",
    });
    res.json({ rows });
  })
);

app.get(
  "/api/locations/:id/type-stock",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const rows = await getLocationTypeStockSummary({ companyId, locationId: Number(id) });
    res.json({ rows });
  })
);

app.get(
  "/api/equipment-categories",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const categories = await listCategories(companyId);
    res.json({ categories });
  })
);

app.post(
  "/api/equipment-categories",
  asyncHandler(async (req, res) => {
    const { companyId, name } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const category = await createCategory({ companyId, name });
    if (!category) return res.status(200).json({ message: "Category already exists." });
    res.status(201).json(category);
  })
);

app.get(
  "/api/equipment-types",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const types = await listTypes(companyId);
    res.json({ types });
  })
);

app.get(
  "/api/equipment-type-stats",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const stats = await listTypeStats(companyId);
    res.json({ stats });
  })
);

app.post(
  "/api/equipment-types",
  asyncHandler(async (req, res) => {
    const { companyId, name, categoryId, imageUrl, imageUrls, description, terms, dailyRate, weeklyRate, monthlyRate } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const type = await createType({
      companyId,
      name,
      categoryId,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      description,
      terms,
      dailyRate,
      weeklyRate,
      monthlyRate,
    });
    if (!type) return res.status(200).json({ message: "Equipment type already exists." });
    res.status(201).json(type);
  })
);

app.put(
  "/api/equipment-types/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, name, categoryId, imageUrl, imageUrls, description, terms, dailyRate, weeklyRate, monthlyRate } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const updated = await updateType({
      id,
      companyId,
      name,
      categoryId,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      description,
      terms,
      dailyRate,
      weeklyRate,
      monthlyRate,
    });
    if (!updated) return res.status(404).json({ error: "Type not found" });
    res.json(updated);
  })
);

app.delete(
  "/api/equipment-types/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteType({ id, companyId });
    res.status(204).end();
  })
);

app.get(
  "/api/customers",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const customers = await listCustomers(companyId);
    res.json({ customers });
  })
);

app.get(
  "/api/vendors",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const vendors = await listVendors(companyId);
    res.json({ vendors });
  })
);

app.post(
  "/api/vendors",
  asyncHandler(async (req, res) => {
    const { companyId, companyName, contactName, streetAddress, city, region, country, postalCode, email, phone, notes } =
      req.body || {};
    if (!companyId || !companyName) {
      return res.status(400).json({ error: "companyId and companyName are required." });
    }
    const vendor = await createVendor({
      companyId,
      companyName,
      contactName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      email,
      phone,
      notes,
    });
    res.status(201).json(vendor);
  })
);

app.put(
  "/api/vendors/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, companyName, contactName, streetAddress, city, region, country, postalCode, email, phone, notes } =
      req.body || {};
    if (!companyId || !companyName) {
      return res.status(400).json({ error: "companyId and companyName are required." });
    }
    const updated = await updateVendor({
      id,
      companyId,
      companyName,
      contactName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      email,
      phone,
      notes,
    });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json(updated);
  })
);

app.delete(
  "/api/vendors/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteVendor({ id, companyId });
    res.status(204).end();
  })
);

app.get(
  "/api/customers/:id/extras",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!id) return res.status(400).json({ error: "customer id is required." });

    const [documents, storefront] = await Promise.all([
      listCustomerDocuments({ companyId, customerId: Number(id) }),
      getCustomerStorefrontExtras({ companyId, customerId: Number(id) }),
    ]);

    res.json({
      documents,
      storefront: storefront || null,
    });
  })
);

app.get(
  "/api/customers/:id/credit",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const credit = await getCustomerCreditBalance({ companyId: Number(companyId), customerId: Number(id) });
    res.json({ credit });
  })
);

app.get(
  "/api/customers/:id/deposit",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const deposit = await getCustomerDepositBalance({ companyId: Number(companyId), customerId: Number(id) });
    res.json({ deposit });
  })
);

app.get(
  "/api/customers/:id/credits",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, limit } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const activity = await listCustomerCreditActivity({
      companyId: Number(companyId),
      customerId: Number(id),
      limit: limit ?? 25,
    });
    res.json({ activity });
  })
);

app.post(
  "/api/customers/:id/payments",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount, paidAt, method, reference, note } = req.body || {};
    if (!companyId || amount === null || amount === undefined) {
      return res.status(400).json({ error: "companyId and amount are required." });
    }
    const created = await addCustomerPayment({
      companyId: Number(companyId),
      customerId: Number(id),
      amount,
      paidAt: paidAt || null,
      method: method || null,
      reference: reference || null,
      note: note || null,
    });
    if (!created) return res.status(404).json({ error: "Customer not found." });
    const settings = await getCompanySettings(Number(companyId));
    const autoApplied = settings?.auto_apply_customer_credit === true
      ? await applyCustomerCreditToOldestInvoices({ companyId: Number(companyId), customerId: Number(id) })
      : { appliedAmount: 0 };
    const credit = await getCustomerCreditBalance({ companyId: Number(companyId), customerId: Number(id) });
    res.status(201).json({ ...created, credit, autoAppliedAmount: autoApplied?.appliedAmount || 0 });
  })
);

app.post(
  "/api/customers/:id/deposits",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount, paidAt, method, reference, note } = req.body || {};
    if (!companyId || amount === null || amount === undefined) {
      return res.status(400).json({ error: "companyId and amount are required." });
    }
    const created = await addCustomerDeposit({
      companyId: Number(companyId),
      customerId: Number(id),
      amount,
      paidAt: paidAt || null,
      method: method || null,
      reference: reference || null,
      note: note || null,
    });
    if (!created) return res.status(404).json({ error: "Customer not found." });
    const deposit = await getCustomerDepositBalance({ companyId: Number(companyId), customerId: Number(id) });
    res.status(201).json({ ...created, deposit });
  })
);

app.post(
  "/api/customers/:id/deposits/refund",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount, paidAt, method, reference, note } = req.body || {};
    if (!companyId || amount === null || amount === undefined) {
      return res.status(400).json({ error: "companyId and amount are required." });
    }
    const result = await refundCustomerDeposit({
      companyId: Number(companyId),
      customerId: Number(id),
      amount,
      paidAt: paidAt || null,
      method: method || null,
      reference: reference || null,
      note: note || null,
    });
    if (!result) return res.status(404).json({ error: "Customer not found." });
    res.status(201).json(result);
  })
);

app.post(
  "/api/customers/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, fileName, mime, sizeBytes, url } = req.body || {};
    if (!companyId || !fileName || !url) {
      return res.status(400).json({ error: "companyId, fileName, and url are required." });
    }
    const created = await addCustomerDocument({
      companyId,
      customerId: Number(id),
      fileName,
      mime,
      sizeBytes,
      url,
    });
    if (!created) return res.status(404).json({ error: "Customer not found" });
    res.status(201).json(created);
  })
);

app.delete(
  "/api/customers/:id/documents/:documentId",
  asyncHandler(async (req, res) => {
    const { id, documentId } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteCustomerDocument({ companyId, customerId: Number(id), documentId: Number(documentId) });
    res.status(204).end();
  })
);

app.post(
  "/api/customers",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      companyName,
      parentCustomerId,
      contactName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      email,
      phone,
      contacts,
      accountingContacts,
      canChargeDeposit,
      paymentTermsDays,
    } = req.body;
    if (!companyId || (!companyName && !parentCustomerId)) {
      return res.status(400).json({ error: "companyId and companyName are required." });
    }
    try {
      const customer = await createCustomer({
        companyId,
        companyName,
        parentCustomerId,
        contactName,
        streetAddress,
        city,
        region,
        country,
        postalCode,
        email,
        phone,
        contacts,
        accountingContacts,
        canChargeDeposit: canChargeDeposit === true || canChargeDeposit === "true" || canChargeDeposit === "on",
        paymentTermsDays: paymentTermsDays ?? null,
      });
      res.status(201).json(customer);
    } catch (err) {
      const message = err?.message ? String(err.message) : "Unable to save customer.";
      if (message.toLowerCase().includes("parent customer") || message.toLowerCase().includes("own parent")) {
        return res.status(400).json({ error: message });
      }
      throw err;
    }
  })
);

app.put(
  "/api/customers/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      companyName,
      parentCustomerId,
      contactName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      email,
      phone,
      contacts,
      accountingContacts,
      canChargeDeposit,
      paymentTermsDays,
    } = req.body;
    if (!companyId || (!companyName && !parentCustomerId)) {
      return res.status(400).json({ error: "companyId and companyName are required." });
    }
    try {
      const updated = await updateCustomer({
        id,
        companyId,
        companyName,
        parentCustomerId,
        contactName,
        streetAddress,
        city,
        region,
        country,
        postalCode,
        email,
        phone,
        contacts,
        accountingContacts,
        canChargeDeposit: canChargeDeposit === true || canChargeDeposit === "true" || canChargeDeposit === "on",
        paymentTermsDays: paymentTermsDays ?? null,
      });
      if (!updated) return res.status(404).json({ error: "Customer not found" });
      res.json(updated);
    } catch (err) {
      const message = err?.message ? String(err.message) : "Unable to save customer.";
      if (message.toLowerCase().includes("parent customer") || message.toLowerCase().includes("own parent")) {
        return res.status(400).json({ error: message });
      }
      throw err;
    }
  })
);

app.post(
  "/api/customers/import",
  (req, res, next) => {
    importUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!req.file?.buffer) return res.status(400).json({ error: "file is required." });

    const text = req.file.buffer.toString("utf8");
    const result = await importCustomersFromText({ companyId, text });
    res.status(201).json(result);
  })
);

app.post(
  "/api/inventory/import",
  (req, res, next) => {
    importUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!req.file?.buffer) return res.status(400).json({ error: "file is required." });

    const text = req.file.buffer.toString("utf8");
    const result = await importInventoryFromText({ companyId, text });
    res.status(201).json(result);
  })
);

app.post(
  "/api/customers/:id/pricing/import",
  (req, res, next) => {
    importUpload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!id) return res.status(400).json({ error: "customer id is required." });
    if (!req.file?.buffer) return res.status(400).json({ error: "file is required." });

    const text = req.file.buffer.toString("utf8");
    const result = await importCustomerPricingFromInventoryText({ companyId, customerId: Number(id), text });
    res.status(201).json(result);
  })
);

app.post(
  "/api/rental-orders/import-legacy",
  (req, res, next) => {
    importUpload.fields([
      { name: "futureReport", maxCount: 1 },
      { name: "salesReport", maxCount: 1 },
      { name: "transactions", maxCount: 1 },
      { name: "instances", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const futureFile = req.files?.futureReport?.[0];
    const salesReportFile = req.files?.salesReport?.[0];
    const salesReportText = salesReportFile?.buffer ? salesReportFile.buffer.toString("utf8") : null;
    const txFile = req.files?.transactions?.[0];
    const instFile = req.files?.instances?.[0];
    const hasLegacyFiles = !!(txFile?.buffer && instFile?.buffer);
    if (!hasLegacyFiles) {
      return res.status(400).json({
        error: "Transaction List and Transaction List with Item ID are required. The Future Transactions report is optional for return times.",
      });
    }

    const transactionsText = txFile.buffer.toString("utf8");
    const instancesText = instFile.buffer.toString("utf8");
    const futureReportText = futureFile?.buffer ? futureFile.buffer.toString("utf8") : null;
    const result = await importRentalOrdersFromLegacyExports({
      companyId,
      transactionsText,
      instancesText,
      salesReportText,
      futureReportText,
    });
    res.status(201).json({ ...result, importSource: futureReportText ? "legacy_plus_future" : "legacy_exports" });
  })
);

app.post(
  "/api/rental-orders/backfill-legacy-rates",
  asyncHandler(async (req, res) => {
    const { companyId, includeAlreadyRated } = req.body || {};
    const cid = Number(companyId);
    if (!cid) return res.status(400).json({ error: "companyId is required." });
    const result = await backfillLegacyRates({ companyId: cid, includeAlreadyRated: includeAlreadyRated === true || includeAlreadyRated === "true" });
    res.status(201).json(result);
  })
);

app.delete(
  "/api/customers/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteCustomer({ id, companyId });
    res.status(204).end();
  })
);

app.get(
  "/api/customers/:id/pricing",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const pricing = await listCustomerPricing({ companyId, customerId: id });
    res.json({ pricing });
  })
);

app.post(
  "/api/customers/:id/pricing",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, typeId, dailyRate, weeklyRate, monthlyRate } = req.body;
    if (!companyId || !typeId) return res.status(400).json({ error: "companyId and typeId are required." });
    const pricing = await upsertCustomerPricing({ companyId, customerId: id, typeId, dailyRate, weeklyRate, monthlyRate });
    res.status(201).json(pricing);
  })
);

app.delete(
  "/api/customers/:id/pricing/:typeId",
  asyncHandler(async (req, res) => {
    const { id, typeId } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteCustomerPricing({ companyId, customerId: id, typeId });
    res.status(204).end();
  })
);

app.get(
  "/api/sales-people",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const sales = await listSalesPeople(companyId);
    res.json({ sales });
  })
);

app.get(
  "/api/sales-people/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const salesPerson = await getSalesPerson({ companyId, id: Number(id) });
    if (!salesPerson) return res.status(404).json({ error: "Sales person not found." });
    res.json({ salesPerson });
  })
);

app.get(
  "/api/sales-people/:id/transactions-closed-timeseries",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, from, to, bucket } = req.query;
    if (!companyId || !from || !to) return res.status(400).json({ error: "companyId, from, and to are required." });
    const rows = await getSalespersonClosedTransactionsTimeSeries({
      companyId,
      salespersonId: Number(id),
      from,
      to,
      bucket: bucket || "month",
    });
    res.json({ rows });
  })
);

app.post(
  "/api/sales-people",
  asyncHandler(async (req, res) => {
    const { companyId, name, email, phone, imageUrl } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const sales = await createSalesPerson({ companyId, name, email, phone, imageUrl });
    if (!sales) return res.status(200).json({ message: "Sales person already exists." });
    res.status(201).json(sales);
  })
);

app.put(
  "/api/sales-people/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, name, email, phone, imageUrl } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    try {
      const salesPerson = await updateSalesPerson({
        companyId,
        id: Number(id),
        name,
        email,
        phone,
        imageUrl,
      });
      if (!salesPerson) return res.status(404).json({ error: "Sales person not found." });
      res.json({ salesPerson });
    } catch (err) {
      if (err && err.code === "23505") return res.status(409).json({ error: "A sales person with that name already exists." });
      throw err;
    }
  })
);

app.delete(
  "/api/sales-people/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const count = await deleteSalesPerson({ companyId, id: Number(id) });
    if (!count) return res.status(404).json({ error: "Sales person not found." });
    res.status(204).end();
  })
);

app.get(
  "/api/company-profile",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const profile = await getCompanyProfile(Number(companyId));
    if (!profile) return res.status(404).json({ error: "Company not found" });
    res.json({ profile });
  })
);

app.put(
  "/api/company-profile",
  asyncHandler(async (req, res) => {
    const { companyId, name, email, phone, streetAddress, city, region, country, postalCode } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!name || !email) return res.status(400).json({ error: "name and email are required." });
    const updated = await updateCompanyProfile({
      companyId: Number(companyId),
      name,
      email,
      phone,
      streetAddress,
      city,
      region,
      country,
      postalCode,
    });
    if (!updated) return res.status(404).json({ error: "Company not found" });
    res.json({ profile: updated });
  })
);

app.get(
  "/api/company-settings",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const settings = await getCompanySettings(companyId);
    res.json({ settings });
  })
);

app.put(
    "/api/company-settings",
    asyncHandler(async (req, res) => {
      const {
        companyId,
        billingRoundingMode,
        billingRoundingGranularity,
        monthlyProrationMethod,
        billingTimeZone,
        invoiceDateMode,
        defaultPaymentTermsDays,
        invoiceAutoRun,
        invoiceAutoMode,
        taxEnabled,
        defaultTaxRate,
          taxRegistrationNumber,
          taxInclusivePricing,
          autoApplyCustomerCredit,
          autoWorkOrderOnReturn,
          logoUrl,
          requiredStorefrontCustomerFields,
          rentalInfoFields,
        } = req.body;
      if (!companyId) return res.status(400).json({ error: "companyId is required." });
      const settings = await upsertCompanySettings({
        companyId,
        billingRoundingMode: billingRoundingMode ?? null,
        billingRoundingGranularity: billingRoundingGranularity ?? null,
        monthlyProrationMethod: monthlyProrationMethod ?? null,
        billingTimeZone: billingTimeZone ?? null,
        invoiceDateMode: invoiceDateMode ?? null,
        defaultPaymentTermsDays: defaultPaymentTermsDays ?? null,
        invoiceAutoRun: invoiceAutoRun ?? null,
        invoiceAutoMode: invoiceAutoMode ?? null,
        taxEnabled: taxEnabled ?? null,
        defaultTaxRate: defaultTaxRate ?? null,
        taxRegistrationNumber: taxRegistrationNumber ?? null,
        taxInclusivePricing: taxInclusivePricing ?? null,
          autoApplyCustomerCredit: autoApplyCustomerCredit ?? null,
          autoWorkOrderOnReturn: autoWorkOrderOnReturn ?? null,
          logoUrl,
          requiredStorefrontCustomerFields,
          rentalInfoFields,
        });
    res.json({ settings });
  })
);

app.get(
  "/api/company-email-settings",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const settings = await getCompanyEmailSettings(companyId);
    res.json({
      settings: {
        company_id: settings.company_id,
        email_enabled: settings.email_enabled === true,
        email_smtp_provider: settings.email_smtp_provider || "custom",
        email_smtp_host: settings.email_smtp_host || null,
        email_smtp_port: settings.email_smtp_port === null || settings.email_smtp_port === undefined ? null : Number(settings.email_smtp_port),
        email_smtp_secure: settings.email_smtp_secure === true,
        email_smtp_require_tls: settings.email_smtp_require_tls === true,
        email_smtp_user: settings.email_smtp_user || null,
        has_smtp_pass: Boolean(settings.email_smtp_pass),
        email_from_name: settings.email_from_name || null,
        email_from_address: settings.email_from_address || null,
        email_notify_request_submit: settings.email_notify_request_submit !== false,
        email_notify_status_updates: settings.email_notify_status_updates !== false,
        email_notify_invoices: settings.email_notify_invoices === true,
        updated_at: settings.updated_at || null,
      },
    });
  })
);

app.put(
  "/api/company-email-settings",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      enabled,
      smtpProvider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpRequireTls,
      smtpUser,
      smtpPass,
      fromName,
      fromAddress,
      notifyRequestSubmit,
      notifyStatusUpdates,
      notifyInvoices,
    } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const updated = await upsertCompanyEmailSettings({
      companyId,
      enabled,
      smtpProvider,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpRequireTls,
      smtpUser,
      smtpPass,
      fromName,
      fromAddress,
      notifyRequestSubmit,
      notifyStatusUpdates,
      notifyInvoices,
    });

    res.json({
      settings: {
        company_id: updated.company_id,
        email_enabled: updated.email_enabled === true,
        email_smtp_provider: updated.email_smtp_provider || "custom",
        email_smtp_host: updated.email_smtp_host || null,
        email_smtp_port: updated.email_smtp_port === null || updated.email_smtp_port === undefined ? null : Number(updated.email_smtp_port),
        email_smtp_secure: updated.email_smtp_secure === true,
        email_smtp_require_tls: updated.email_smtp_require_tls === true,
        email_smtp_user: updated.email_smtp_user || null,
        has_smtp_pass: Boolean(updated.email_smtp_pass),
        email_from_name: updated.email_from_name || null,
        email_from_address: updated.email_from_address || null,
        email_notify_request_submit: updated.email_notify_request_submit !== false,
        email_notify_status_updates: updated.email_notify_status_updates !== false,
        email_notify_invoices: updated.email_notify_invoices === true,
        updated_at: updated.updated_at || null,
      },
    });
  })
);

app.post(
  "/api/company-email-settings/test",
  asyncHandler(async (req, res) => {
    const { companyId, to } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const settings = await getCompanyEmailSettings(companyId);
    const profile = await getCompanyProfile(Number(companyId)).catch(() => null);
    const recipient = String(to || "").trim() || profile?.email || null;
    if (!recipient) return res.status(400).json({ error: "to is required." });

    const subject = "Aiven Rental: Test email";
    const text = "This is a test email from Aiven Rental. Your email settings are working.";
    const result = await sendCompanyEmail({ companyId: Number(companyId), settings, to: recipient, subject, text });
    if (!result.ok) return res.status(400).json({ error: result.error || "Unable to send test email." });
    res.json({ ok: true, messageId: result.messageId || null });
  })
);

app.get(
  "/api/rental-orders",
  asyncHandler(async (req, res) => {
    const { companyId, statuses } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const orders = await listRentalOrders(companyId, { statuses: statuses || null });
    res.json({ orders });
  })
);

app.get(
  "/api/rental-quotes",
  asyncHandler(async (req, res) => {
    const { companyId, statuses } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const orders = await listRentalOrders(companyId, { quoteOnly: true, statuses: statuses || null });
    res.json({ orders });
  })
);

app.get(
  "/api/rental-orders/calendar",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, statuses } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const orders = await listRentalOrdersForRange(companyId, { from, to, statuses: statuses || null });
    res.json({ orders });
  })
);

app.get(
  "/api/rental-orders/timeline",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, statuses } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const data = await listTimelineData(companyId, { from, to, statuses: statuses || null });
    res.json(data);
  })
);

app.get(
  "/api/equipment-types/:id/availability-series",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, from, days, includeProjected, splitLocation, locationId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const wantsProjection =
      String(includeProjected || "").toLowerCase() === "true" || String(includeProjected || "") === "1";
    const wantsSplit = String(splitLocation || "").toLowerCase() === "true" || String(splitLocation || "") === "1";
    const locationIdNum = locationId ? Number(locationId) : null;

    if (wantsProjection || wantsSplit || Number.isFinite(locationIdNum)) {
      const series = await getTypeAvailabilitySeriesWithProjection({
        companyId,
        typeId: Number(id),
        from: from || new Date().toISOString(),
        days: days ? Number(days) : 30,
        locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
        splitLocation: wantsSplit,
      });
      return res.json(series);
    }

    const series = await getTypeAvailabilitySeries({
      companyId,
      typeId: Number(id),
      from: from || new Date().toISOString(),
      days: days ? Number(days) : 30,
    });
    return res.json(series);
  })
);

app.get(
  "/api/availability-shortfalls",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, locationId, categoryId, typeId } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const data = await getAvailabilityShortfallsSummary({
      companyId,
      from,
      to,
      locationId: locationId ? Number(locationId) : null,
      categoryId: categoryId ? Number(categoryId) : null,
      typeId: typeId ? Number(typeId) : null,
    });
    res.json(data);
  })
);

app.get(
  "/api/equipment-types/:id/availability-shortfall-details",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, date, locationId } = req.query;
    if (!companyId || !date) {
      return res.status(400).json({ error: "companyId and date are required." });
    }
    const data = await getTypeAvailabilityShortfallDetails({
      companyId,
      typeId: Number(id),
      date,
      locationId: locationId ? Number(locationId) : null,
    });
    res.json(data);
  })
);

app.get(
  "/api/utilization-dashboard",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, locationId, categoryId, typeId, maxBasis, forwardMonths } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const data = await getUtilizationDashboard({
      companyId,
      from,
      to,
      locationId: locationId ? Number(locationId) : null,
      categoryId: categoryId ? Number(categoryId) : null,
      typeId: typeId ? Number(typeId) : null,
      maxBasis: maxBasis || "rack",
      forwardMonths: forwardMonths ? Number(forwardMonths) : 12,
    });
    res.json(data);
  })
);

app.get(
  "/api/revenue-summary",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, groupBy, pickupLocationId, typeId } = req.query;
    if (!companyId || !from || !to) return res.status(400).json({ error: "companyId, from, and to are required." });
    const rows = await getRevenueSummary({
      companyId,
      from,
      to,
      groupBy: groupBy || "location",
      pickupLocationId: pickupLocationId ? Number(pickupLocationId) : null,
      typeId: typeId ? Number(typeId) : null,
    });
    res.json({ rows });
  })
);

app.get(
  "/api/revenue-timeseries",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, groupBy, bucket, pickupLocationId, typeId } = req.query;
    if (!companyId || !from || !to) return res.status(400).json({ error: "companyId, from, and to are required." });
    const rows = await getRevenueTimeSeries({
      companyId,
      from,
      to,
      groupBy: groupBy || "location",
      bucket: bucket || "month",
      pickupLocationId: pickupLocationId ? Number(pickupLocationId) : null,
      typeId: typeId ? Number(typeId) : null,
    });
    res.json({ rows });
  })
);

app.get(
  "/api/salesperson-summary",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, metric, pickupLocationId, typeId } = req.query;
    if (!companyId || !from || !to) return res.status(400).json({ error: "companyId, from, and to are required." });
    const rows = await getSalespersonSummary({
      companyId,
      from,
      to,
      metric: metric || "revenue",
      pickupLocationId: pickupLocationId ? Number(pickupLocationId) : null,
      typeId: typeId ? Number(typeId) : null,
    });
    res.json({ rows });
  })
);

app.put(
  "/api/rental-orders/line-items/:id/reschedule",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, endAt } = req.body;
    if (!companyId || !endAt) return res.status(400).json({ error: "companyId and endAt are required." });
    const result = await rescheduleLineItemEnd({ companyId, lineItemId: Number(id), endAt });
    if (!result.ok) return res.status(409).json(result);
    res.json(result);
  })
);

app.put(
  "/api/rental-orders/line-items/:id/pickup",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, pickedUp, pickedUpAt, actorName, actorEmail } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const normalizedPickedUpAt = normalizeTimestampInput(pickedUpAt);
    if (
      pickedUpAt !== undefined &&
      pickedUpAt !== null &&
      pickedUpAt !== "" &&
      normalizedPickedUpAt === null
    ) {
      return res.status(400).json({ error: "Invalid pickedUpAt value." });
    }
    const result = await setLineItemPickedUp({
      companyId: Number(companyId),
      lineItemId: Number(id),
      pickedUp: !!pickedUp,
      pickedUpAt: normalizedPickedUpAt,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
    });
    if (!result.ok) return res.status(409).json(result);
    if (pickedUp) {
      try {
        const billing = await createPickupBillingForLineItem({
          companyId: Number(companyId),
          lineItemId: Number(id),
          actorName: actorName || null,
          actorEmail: actorEmail || null,
        });
        result.invoices = Array.isArray(billing?.created) ? billing.created : [];
        result.invoiceError = null;
        if (result.invoices.length) {
          await emailInvoicesIfConfigured({ companyId: Number(companyId), invoices: result.invoices }).catch(() => null);
        }
      } catch (err) {
        result.invoiceError = err?.message ? String(err.message) : "Unable to create invoice.";
      }
    }
    res.json(result);
  })
);

app.put(
  "/api/rental-orders/line-items/:id/return",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, returned, returnedAt, actorName, actorEmail } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const normalizedReturnedAt = normalizeTimestampInput(returnedAt);
    if (
      returnedAt !== undefined &&
      returnedAt !== null &&
      returnedAt !== "" &&
      normalizedReturnedAt === null
    ) {
      return res.status(400).json({ error: "Invalid returnedAt value." });
    }
    const result = await setLineItemReturned({
      companyId: Number(companyId),
      lineItemId: Number(id),
      returned: !!returned,
      returnedAt: normalizedReturnedAt,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
    });
    if (!result.ok) return res.status(409).json(result);
    try {
      const billing = await createReturnBillingForLineItem({
        companyId: Number(companyId),
        lineItemId: Number(id),
        returned: !!returned,
        actorName: actorName || null,
        actorEmail: actorEmail || null,
      });
      const existing = Array.isArray(result.invoices) ? result.invoices : [];
      const created = Array.isArray(billing?.created) ? billing.created : [];
      result.invoices = existing.concat(created);
      if (!result.invoiceError) result.invoiceError = null;
      if (created.length) {
        await emailInvoicesIfConfigured({ companyId: Number(companyId), invoices: created }).catch(() => null);
      }
    } catch (err) {
      result.invoiceError = err?.message ? String(err.message) : "Unable to create invoice.";
    }
    res.json(result);
  })
);

app.post(
  "/api/equipment/:id/work-order-pause",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, workOrderNumber, startAt, endAt } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!workOrderNumber) return res.status(400).json({ error: "workOrderNumber is required." });
    if (!startAt && !endAt) {
      return res.status(400).json({ error: "startAt or endAt is required." });
    }
    const result = await applyWorkOrderPauseToEquipment({
      companyId: Number(companyId),
      equipmentId: Number(id),
      workOrderNumber,
      startAt,
      endAt,
    });
    try {
      const billing = await createPauseBillingAdjustments({
        companyId: Number(companyId),
        lineItemIds: result?.lineItemIds || [],
        startAt: startAt || null,
        endAt: endAt || null,
        workOrderNumber,
      });
      result.invoices = Array.isArray(billing?.created) ? billing.created : [];
      result.invoiceError = null;
      if (result.invoices.length) {
        await emailInvoicesIfConfigured({ companyId: Number(companyId), invoices: result.invoices }).catch(() => null);
      }
    } catch (err) {
      result.invoiceError = err?.message ? String(err.message) : "Unable to create invoice.";
    }
    res.json(result);
  })
);

app.get(
  "/api/rental-orders/availability",
  asyncHandler(async (req, res) => {
    const { companyId, typeId, bundleId, startAt, endAt, excludeOrderId } = req.query;
    if (!companyId || !startAt || !endAt || (!typeId && !bundleId)) {
      return res.status(400).json({ error: "companyId, startAt, endAt, and (typeId or bundleId) are required." });
    }
    if (bundleId) {
      const bundle = await getBundleAvailability({
        companyId: Number(companyId),
        bundleId: Number(bundleId),
        startAt,
        endAt,
        excludeOrderId: excludeOrderId ? Number(excludeOrderId) : null,
      });
      return res.json({ bundleAvailable: bundle.available, bundleItems: bundle.items });
    }
    const available = await listAvailableInventory({
      companyId,
      typeId: Number(typeId),
      startAt,
      endAt,
      excludeOrderId: excludeOrderId ? Number(excludeOrderId) : null,
    });
    const demand = await getTypeDemandAvailability({
      companyId,
      typeId: Number(typeId),
      startAt,
      endAt,
      excludeOrderId: excludeOrderId ? Number(excludeOrderId) : null,
    });
    res.json({ available, ...demand });
  })
);

app.get(
  "/api/rental-orders/contacts",
  asyncHandler(async (req, res) => {
    const { companyId, customerId } = req.query;
    if (!companyId || !customerId) {
      return res.status(400).json({ error: "companyId and customerId are required." });
    }
    const contacts = await listRentalOrderContacts({
      companyId: Number(companyId),
      customerId: Number(customerId),
    });
    res.json(contacts);
  })
);

app.get(
  "/api/rental-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const detail = await getRentalOrder({ companyId, id: Number(id) });
    if (!detail) return res.status(404).json({ error: "Rental order not found" });
    res.json(detail);
  })
);

app.get(
  "/api/rental-orders/:id/pdf",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const detail = await getRentalOrder({ companyId, id: Number(id) });
    if (!detail) return res.status(404).json({ error: "Rental order not found" });
    const settings = await getCompanySettings(companyId);
    const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId, url: settings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
      const companyProfile = await getCompanyProfile(Number(companyId));
      streamOrderPdf(res, {
        ...detail,
        companyLogoPath: logoPath,
        companyProfile,
        rentalInfoFields: settings?.rental_info_fields || null,
      });
  })
);

app.get(
  "/api/rental-orders/pdf",
  asyncHandler(async (req, res) => {
    const { companyId, statuses, includeQuotes } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const requested = String(statuses || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allRequested = includeQuotes ? [...new Set([...requested, "quote", "quote_rejected"])] : requested;
    const finalStatuses = allRequested.length ? allRequested : null;
    const orders = await listRentalOrders(companyId, { statuses: finalStatuses });
    const settings = await getCompanySettings(companyId);
    const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId, url: settings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
    const companyProfile = await getCompanyProfile(Number(companyId));
      streamOrdersReportPdf(res, {
        title: "Rental Orders & Quotes",
        rows: orders,
        companyLogoPath: logoPath,
        companyProfile,
        rentalInfoFields: settings?.rental_info_fields || null,
      });
  })
);

app.post(
  "/api/rental-orders",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      customerId,
      customerPo,
      salespersonId,
      fulfillmentMethod,
      status,
      terms,
      generalNotes,
      pickupLocationId,
      dropoffAddress,
      siteAddress,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      coverageHours,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
      actorName,
      actorEmail,
    } = req.body;
    if (!companyId || !customerId) return res.status(400).json({ error: "companyId and customerId are required." });
    const created = await createRentalOrder({
      companyId,
      customerId,
      customerPo,
      salespersonId,
      actorName,
      actorEmail,
      fulfillmentMethod,
      status,
      terms,
      generalNotes,
      pickupLocationId,
      dropoffAddress,
      siteAddress,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      coverageHours,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
    });
    try {
      await updateEquipmentCurrentLocationFromDropoff({
        companyId: Number(companyId),
        status,
        fulfillmentMethod,
        dropoffAddress,
        lineItems,
      });
    } catch (err) {
      console.warn("Dropoff current-location update failed:", err?.message || err);
    }
    res.status(201).json(created);
  })
);

app.put(
  "/api/rental-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      customerId,
      customerPo,
      salespersonId,
      fulfillmentMethod,
      status,
      terms,
      generalNotes,
      pickupLocationId,
      dropoffAddress,
      siteAddress,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      coverageHours,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
      actorName,
      actorEmail,
    } = req.body;
    if (!companyId || !customerId) return res.status(400).json({ error: "companyId and customerId are required." });
    const updated = await updateRentalOrder({
      id: Number(id),
      companyId,
      customerId,
      customerPo,
      salespersonId,
      actorName,
      actorEmail,
      fulfillmentMethod,
      status,
      terms,
      generalNotes,
      pickupLocationId,
      dropoffAddress,
      siteAddress,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      coverageHours,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
    });
    if (!updated) return res.status(404).json({ error: "Rental order not found" });
    res.json(updated);

    (async () => {
      try {
        await updateEquipmentCurrentLocationFromDropoff({
          companyId: Number(companyId),
          status: updated.status,
          fulfillmentMethod,
          dropoffAddress,
          lineItems,
        });
      } catch (err) {
        console.warn("Dropoff current-location update failed:", err?.message || err);
      }
    })();

    (async () => {
      try {
        const cid = Number(companyId);
        if (updated.statusChanged !== true) return;
        const nextStatus = String(updated.status || "").toLowerCase();
        if (!["request_rejected", "reservation", "ordered", "received"].includes(nextStatus)) return;

        const emailSettings = await getCompanyEmailSettings(cid);
        if (emailSettings.email_enabled !== true || emailSettings.email_notify_status_updates === false) return;

        const detail = await getRentalOrder({ companyId: cid, id: Number(id) });
        const customerEmail = detail?.order?.customer_email ? String(detail.order.customer_email).trim() : "";
        if (!customerEmail) return;
        const profile = await getCompanyProfile(cid).catch(() => null);
        const tpl = statusUpdatedEmail({ order: detail?.order, companyName: profile?.name || null, prevStatus: updated.prevStatus });
        await sendCompanyEmail({ companyId: cid, settings: emailSettings, to: customerEmail, subject: tpl.subject, text: tpl.text });
      } catch (err) {
        console.warn("Order update email failed:", err?.message || err);
      }
    })();
  })
);

app.put(
  "/api/rental-orders/:id/site-address",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, siteAddress } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const updated = await updateRentalOrderSiteAddress({
      companyId: Number(companyId),
      orderId: Number(id),
      siteAddress,
    });
    if (!updated) return res.status(404).json({ error: "Rental order not found" });
    res.json({ order: updated });
  })
);

app.put(
  "/api/rental-orders/:id/status",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, status, actorName, actorEmail, note } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!status) return res.status(400).json({ error: "status is required." });
    const updated = await updateRentalOrderStatus({
      id: Number(id),
      companyId: Number(companyId),
      status,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
    });
    if (!updated) return res.status(404).json({ error: "Rental order not found" });
    res.json({ order: updated });

    (async () => {
      try {
        const nextStatus = String(updated.status || "").trim().toLowerCase();
        if (nextStatus !== "ordered") return;
        const detail = await getRentalOrder({ companyId: Number(companyId), id: Number(id) }).catch(() => null);
        const order = detail?.order || null;
        const lineItems = Array.isArray(detail?.lineItems) ? detail.lineItems : [];
        if (!order) return;
        await updateEquipmentCurrentLocationFromDropoff({
          companyId: Number(companyId),
          status: order.status,
          fulfillmentMethod: order.fulfillment_method || order.fulfillmentMethod || null,
          dropoffAddress: order.dropoff_address || order.dropoffAddress || null,
          lineItems,
        });
      } catch (err) {
        console.warn("Dropoff current-location update failed:", err?.message || err);
      }
    })();

    (async () => {
      try {
        const cid = Number(companyId);
        const createdInvoices = Array.isArray(updated.invoices) ? updated.invoices : [];

        const emailSettings = await getCompanyEmailSettings(cid);

        if (createdInvoices.length && emailSettings.email_enabled === true && emailSettings.email_notify_invoices === true) {
          const companySettings = await getCompanySettings(cid);
          const companyLogoUrl = companySettings?.logo_url || null;
          const billingTimeZone = companySettings?.billing_timezone || null;
          const rawLogoPath = companySettings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: companySettings.logo_url }) : null;
          const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
          const profile = await getCompanyProfile(cid).catch(() => null);

          for (const created of createdInvoices) {
            const invoiceId = created?.id ? Number(created.id) : null;
            if (!invoiceId) continue;
            const detail = await getInvoice({ companyId: cid, id: invoiceId }).catch(() => null);
            const recipients = getInvoiceRecipientEmails(detail?.invoice);
            if (!detail || !recipients.length) continue;

            await sendInvoiceEmailWithVersion({
              companyId: cid,
              invoiceId,
              detail,
              to: recipients.join(", "),
              emailSettings,
              companyProfile: profile || null,
              companyLogoPath: logoPath,
              companyLogoUrl,
              billingTimeZone,
            });
          }
        }

        if (updated.statusChanged !== true) return;
        const nextStatus = String(updated.status || "").toLowerCase();
        if (!["request_rejected", "reservation", "ordered", "received"].includes(nextStatus)) return;

        const rejectionNote = nextStatus === "request_rejected" ? String(note || "").trim() : "";
        if (nextStatus === "request_rejected" && rejectionNote) {
          await addRentalOrderNote({
            companyId: cid,
            orderId: Number(id),
            userName: actorName || actorEmail || "System",
            note: rejectionNote,
          }).catch(() => null);
        }

        if (emailSettings.email_enabled !== true || emailSettings.email_notify_status_updates === false) return;

        const detail = await getRentalOrder({ companyId: cid, id: Number(id) });
        const customerEmail = detail?.order?.customer_email ? String(detail.order.customer_email).trim() : "";
        if (!customerEmail) return;
        const profile = await getCompanyProfile(cid).catch(() => null);
        const tpl = statusUpdatedEmail({
          order: detail?.order,
          companyName: profile?.name || null,
          prevStatus: updated.prevStatus,
          note: rejectionNote,
        });

        let attachments = undefined;
        if (nextStatus === "request_rejected") {
          const companySettings = await getCompanySettings(cid);
          const rawLogoPath = companySettings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: companySettings.logo_url }) : null;
          const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
          const pdf = await buildOrderPdfBuffer({
            ...detail,
            companyLogoPath: logoPath,
            companyProfile: profile || null,
            rentalInfoFields: companySettings?.rental_info_fields || null,
          });
          attachments = [{ filename: pdf.filename, content: pdf.buffer, contentType: "application/pdf" }];
        }

            const result = await sendCompanyEmail({
              companyId: cid,
              settings: emailSettings,
              to: customerEmail,
              subject: tpl.subject,
              text: tpl.text,
              attachments,
            });
            if (result.ok) {
              await markInvoiceEmailSent({ companyId: cid, invoiceId }).catch(() => null);
            }
      } catch (err) {
        console.warn("Status update email failed:", err?.message || err);
      }
    })();
  })
);

app.get(
  "/api/rental-orders/:id/history",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const rows = await listRentalOrderAudits({ companyId, orderId: Number(id) });
    res.json({ rows });
  })
);

app.post(
  "/api/rental-orders/:id/notes",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, userName, note } = req.body;
    if (!companyId || !userName || !note) {
      return res.status(400).json({ error: "companyId, userName, and note are required." });
    }
    const created = await addRentalOrderNote({ companyId, orderId: Number(id), userName, note });
    if (!created) return res.status(404).json({ error: "Rental order not found" });
    res.status(201).json(created);
  })
);

app.post(
  "/api/rental-orders/:id/attachments",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, fileName, mime, sizeBytes, url, category, actorName, actorEmail } = req.body;
    if (!companyId || !fileName || !url) {
      return res.status(400).json({ error: "companyId, fileName, and url are required." });
    }
    const created = await addRentalOrderAttachment({
      companyId,
      orderId: Number(id),
      fileName,
      mime,
      sizeBytes,
      url,
      category: category || null,
      actorName,
      actorEmail,
    });
    if (!created) return res.status(404).json({ error: "Rental order not found" });
    res.status(201).json(created);
  })
);

app.delete(
  "/api/rental-orders/:id/attachments/:attachmentId",
  asyncHandler(async (req, res) => {
    const { id, attachmentId } = req.params;
    const { companyId, actorName, actorEmail } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteRentalOrderAttachment({
      companyId,
      orderId: Number(id),
      attachmentId: Number(attachmentId),
      actorName: actorName || null,
      actorEmail: actorEmail || null,
    });
    res.status(204).end();
  })
);

app.post(
  "/api/rental-orders/:id/invoices/generate",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, mode } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const result = await generateInvoicesForRentalOrder({
      companyId: Number(companyId),
      orderId: Number(id),
      mode: mode || "auto",
    });
    if (!result) return res.status(404).json({ error: "Rental order not found." });
    res.status(201).json(result);

    (async () => {
      try {
        const cid = Number(companyId);
        const createdInvoices = Array.isArray(result?.created) ? result.created : [];
        if (!createdInvoices.length) return;

        const emailSettings = await getCompanyEmailSettings(cid);
        if (emailSettings.email_enabled !== true || emailSettings.email_notify_invoices !== true) return;

        const companySettings = await getCompanySettings(cid);
        const companyLogoUrl = companySettings?.logo_url || null;
        const billingTimeZone = companySettings?.billing_timezone || null;
        const rawLogoPath = companySettings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: companySettings.logo_url }) : null;
        const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
        const profile = await getCompanyProfile(cid).catch(() => null);

        for (const created of createdInvoices) {
          const invoiceId = created?.id ? Number(created.id) : null;
          if (!invoiceId) continue;
          const detail = await getInvoice({ companyId: cid, id: invoiceId }).catch(() => null);
          const recipients = getInvoiceRecipientEmails(detail?.invoice);
          if (!detail || !recipients.length) continue;

          await sendInvoiceEmailWithVersion({
            companyId: cid,
            invoiceId,
            detail,
            to: recipients.join(", "),
            emailSettings,
            companyProfile: profile || null,
            companyLogoPath: logoPath,
            companyLogoUrl,
            billingTimeZone,
          });
        }
      } catch (err) {
        console.warn("Invoice email failed:", err?.message || err);
      }
    })();
  })
);

app.post(
  "/api/invoices/:id/email",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, to, message } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const cid = Number(companyId);
    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: "Invalid invoice id." });

    const detail = await getInvoice({ companyId: cid, id: invoiceId });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });

    const fallbackRecipients = getInvoiceRecipientEmails(detail?.invoice);
    const recipient = String(to || "").trim() || fallbackRecipients.join(", ");
    if (!recipient) return res.status(400).json({ error: "Recipient email is required." });

    const emailSettings = await getCompanyEmailSettings(cid);
    if (emailSettings.email_enabled !== true) return res.status(400).json({ error: "Email is not enabled for this company." });

    const companySettings = await getCompanySettings(cid);
    const companyLogoUrl = companySettings?.logo_url || null;
    const billingTimeZone = companySettings?.billing_timezone || null;
    const rawLogoPath = companySettings?.logo_url ? resolveCompanyUploadPath({ companyId: cid, url: companySettings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
    const profile = await getCompanyProfile(cid).catch(() => null);

    const result = await sendInvoiceEmailWithVersion({
      companyId: cid,
      invoiceId,
      detail,
      to: recipient,
      message,
      emailSettings,
      companyProfile: profile || null,
      companyLogoPath: logoPath,
      companyLogoUrl,
      billingTimeZone,
    });
    if (!result.ok) return res.status(400).json({ error: result.error || "Unable to send invoice email." });
    res.json({ ok: true, messageId: result.messageId || null });
  })
);

app.get(
  "/api/invoices",
  asyncHandler(async (req, res) => {
    const { companyId, customerId, rentalOrderId, status } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const invoices = await listInvoices(Number(companyId), { customerId, rentalOrderId, status });
    res.json({ invoices });
  })
);

app.post(
  "/api/invoices/manual",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      customerId,
      invoiceDate,
      dueDate,
      servicePeriodStart,
      servicePeriodEnd,
      generalNotes,
      notes,
      lineItems,
    } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!customerId) return res.status(400).json({ error: "customerId is required." });
    if (!Array.isArray(lineItems) || !lineItems.length) {
      return res.status(400).json({ error: "At least one line item is required." });
    }

    const invoice = await createManualInvoice({
      companyId: Number(companyId),
      customerId: Number(customerId),
      invoiceDate: invoiceDate || null,
      dueDate: dueDate || null,
      servicePeriodStart: servicePeriodStart || null,
      servicePeriodEnd: servicePeriodEnd || null,
      generalNotes: generalNotes || null,
      notes: notes || null,
      lineItems,
    });
    res.status(201).json(invoice);
  })
);

app.get(
  "/api/invoices/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const invoice = await getInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    res.json(invoice);
  })
);

app.get(
  "/api/invoices/:id/pdf",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const detail = await getInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });
    const status = String(detail?.invoice?.status || "").trim().toLowerCase();
    if (status === "void") {
      const version = await getLatestInvoiceVersion({
        companyId: Number(companyId),
        invoiceId: Number(detail.invoice?.id || id),
      });
      if (version?.pdfBytes) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${version.pdfFilename || `invoice-${detail.invoice?.invoiceNumber || id}.pdf`}"`
        );
        res.send(version.pdfBytes);
        return;
      }
    } else if (["sent", "paid"].includes(status)) {
      const version = await getLatestSentInvoiceVersion({
        companyId: Number(companyId),
        invoiceId: Number(detail.invoice?.id || id),
      });
      if (version?.pdfBytes) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${version.pdfFilename || `invoice-${detail.invoice?.invoiceNumber || id}.pdf`}"`
        );
        res.send(version.pdfBytes);
        return;
      }
    }
    const settings = await getCompanySettings(companyId);
    const billingTimeZone = settings?.billing_timezone || null;
    const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId, url: settings.logo_url }) : null;
    const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
    const companyProfile = await getCompanyProfile(Number(companyId));
    streamInvoicePdf(res, { ...detail, companyLogoPath: logoPath, companyProfile, timeZone: billingTimeZone });
  })
);

app.put(
  "/api/invoices/:id/line-items",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, lineItems } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const detail = await getInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });
    const status = String(detail?.invoice?.status || "").trim().toLowerCase();
    if (status !== "draft") {
      return res.status(409).json({ error: "Invoice line items are locked once sent, paid, or void." });
    }
    const updated = await replaceInvoiceLineItems({
      companyId: Number(companyId),
      invoiceId: Number(id),
      lineItems,
    });
    if (!updated) return res.status(404).json({ error: "Invoice not found." });
    res.json(updated);
  })
);

app.post(
  "/api/invoices/:id/payments",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount, paidAt, method, reference, note } = req.body || {};
    if (!companyId || amount === null || amount === undefined) {
      return res.status(400).json({ error: "companyId and amount are required." });
    }
    const updated = await addInvoicePayment({
      companyId: Number(companyId),
      invoiceId: Number(id),
      amount,
      paidAt: paidAt || null,
      method: method || null,
      reference: reference || null,
      note: note || null,
    });
    if (!updated) return res.status(404).json({ error: "Invoice not found." });
    const settings = await getCompanySettings(Number(companyId));
    if (settings?.auto_apply_customer_credit === true) {
      const customerId = updated?.invoice?.customerId;
      if (customerId) {
        await applyCustomerCreditToOldestInvoices({
          companyId: Number(companyId),
          customerId: Number(customerId),
          excludeInvoiceId: Number(id),
        });
      }
    }
    res.status(201).json(updated);
  })
);

app.post(
  "/api/payments/:id/reverse",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, reason, reversedAt } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const result = await reverseInvoicePayment({
      companyId: Number(companyId),
      paymentId: Number(id),
      reason: reason || null,
      reversedAt: reversedAt || null,
    });
    if (!result) return res.status(404).json({ error: "Payment not found." });
    res.status(201).json(result);
  })
);

app.post(
  "/api/invoices/:id/apply-credit",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const applied = await applyCustomerCreditToInvoice({
      companyId: Number(companyId),
      invoiceId: Number(id),
      amount: amount ?? null,
    });
    if (!applied) return res.status(404).json({ error: "Invoice not found." });
    const updated = await getInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!updated) return res.status(404).json({ error: "Invoice not found." });
    res.status(201).json({ appliedAmount: applied.appliedAmount || 0, ...updated });
  })
);

app.post(
  "/api/invoices/:id/apply-deposit",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, amount } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const applied = await applyCustomerDepositToInvoice({
      companyId: Number(companyId),
      invoiceId: Number(id),
      amount: amount ?? null,
    });
    if (!applied) return res.status(404).json({ error: "Invoice not found." });
    const updated = await getInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!updated) return res.status(404).json({ error: "Invoice not found." });
    res.status(201).json({ appliedAmount: applied.appliedAmount || 0, ...updated });
  })
);

app.post(
  "/api/invoices/:id/corrections",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, documentType } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: "Invalid invoice id." });

    const docType = normalizeInvoiceDocumentType(documentType);
    if (docType === "invoice") {
      return res.status(400).json({ error: "documentType must be credit_memo or debit_memo." });
    }

    const detail = await getInvoice({ companyId: Number(companyId), id: invoiceId });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });

    const baseType = normalizeInvoiceDocumentType(detail?.invoice?.documentType);
    if (baseType !== "invoice") {
      return res.status(400).json({ error: "Corrections can only be created from invoices." });
    }

    const status = String(detail?.invoice?.status || "").trim().toLowerCase();
    if (status === "draft") {
      return res.status(409).json({ error: "Draft invoices can be edited directly." });
    }
    if (status === "void") {
      return res.status(409).json({ error: "Voided invoices cannot be corrected." });
    }
    if (!["sent", "paid"].includes(status)) {
      return res.status(409).json({ error: "Invoice must be sent or paid before creating a correction." });
    }

    const created = await createInvoiceCorrection({
      companyId: Number(companyId),
      invoiceId,
      documentType: docType,
    });
    if (!created) return res.status(404).json({ error: "Invoice not found." });
    res.status(201).json({ invoiceId: created.id, invoiceNumber: created.invoiceNumber });
  })
);

app.post(
  "/api/invoices/:id/void",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, reason, voidedAt } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });

    const invoiceId = Number(id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).json({ error: "Invalid invoice id." });

    const reasonText = String(reason || "").trim();
    if (!reasonText) return res.status(400).json({ error: "Void reason is required." });

    const voidedBy = req.auth?.user?.email || req.auth?.user?.name || null;

    let result;
    try {
      result = await voidInvoice({
        companyId: Number(companyId),
        invoiceId,
        reason: reasonText,
        voidedBy,
        voidedAt: voidedAt || null,
      });
    } catch (err) {
      if (err?.code === "PAYMENTS_EXIST") {
        return res.status(409).json({ error: err.message || "Invoice has payments applied." });
      }
      throw err;
    }

    if (!result) return res.status(404).json({ error: "Invoice not found." });
    if (result.alreadyVoid) return res.status(409).json({ error: "Invoice is already void." });

    const detail = await getInvoice({ companyId: Number(companyId), id: invoiceId });
    if (!detail) return res.status(404).json({ error: "Invoice not found." });

    try {
      const settings = await getCompanySettings(Number(companyId));
      const billingTimeZone = settings?.billing_timezone || null;
      const companyLogoUrl = settings?.logo_url || null;
      const rawLogoPath = settings?.logo_url ? resolveCompanyUploadPath({ companyId: Number(companyId), url: settings.logo_url }) : null;
      const logoPath = rawLogoPath ? await resolvePdfCompatibleImagePath(rawLogoPath) : null;
      const companyProfile = await getCompanyProfile(Number(companyId));
      await createInvoiceVersionSnapshot({
        companyId: Number(companyId),
        invoiceId,
        detail,
        companyProfile,
        companyLogoPath: logoPath,
        companyLogoUrl,
        billingTimeZone,
      });
    } catch (err) {
      console.error("Failed to create void invoice version:", err?.message || err);
    }

    res.json(detail);
  })
);

app.delete(
  "/api/invoices/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const deleted = await deleteInvoice({ companyId: Number(companyId), id: Number(id) });
    if (!deleted) return res.status(404).json({ error: "Invoice not found." });
    res.status(204).end();
  })
);

app.get(
  "/api/ar/summary",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const summary = await getAccountsReceivableSummary(Number(companyId));
    res.json({ summary });
  })
);

app.get(
  "/api/purchase-orders",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const purchaseOrders = await listPurchaseOrders(Number(companyId));
    res.json({ purchaseOrders });
  })
);

app.get(
  "/api/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const purchaseOrder = await getPurchaseOrder({ companyId: Number(companyId), id: Number(id) });
    if (!purchaseOrder) return res.status(404).json({ error: "Purchase order not found." });
    res.json({ purchaseOrder });
  })
);

app.post(
  "/api/purchase-orders",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      vendorId,
      status,
      expectedPossessionDate,
      typeId,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls,
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    } = req.body || {};
    if (!companyId || !vendorId || !typeId || !expectedPossessionDate) {
      return res.status(400).json({ error: "companyId, vendorId, typeId, and expectedPossessionDate are required." });
    }
    const normalizedStatus = normalizePurchaseOrderStatus(status);
    const expectedDate = String(expectedPossessionDate || "").trim();
    const locationIdNum = locationId === "" || locationId === null || locationId === undefined ? null : Number(locationId);
    const purchasePriceNum =
      purchasePrice === "" || purchasePrice === null || purchasePrice === undefined ? null : Number(purchasePrice);
    if (!expectedDate || Number.isNaN(Date.parse(expectedDate))) {
      return res.status(400).json({ error: "expectedPossessionDate must be a valid date." });
    }
    if (
      normalizedStatus === "closed" &&
      (!modelName || !serialNumber || !condition || !manufacturer || !Number.isFinite(locationIdNum) || purchasePriceNum === null)
    ) {
      return res.status(400).json({
        error: "modelName, serialNumber, condition, manufacturer, locationId, and purchasePrice are required to close a PO.",
      });
    }

    const order = await createPurchaseOrder({
      companyId,
      vendorId: Number(vendorId),
      status: normalizedStatus,
      expectedPossessionDate: expectedDate,
      typeId: Number(typeId),
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
      currentLocationId: currentLocationId ? Number(currentLocationId) : null,
      purchasePrice: purchasePriceNum,
      notes,
      closedAt: normalizedStatus === "closed" ? new Date().toISOString() : null,
    });

    let finalOrder = order;
    let equipment = null;
    if (normalizedStatus === "closed" && order && !order.equipment_id) {
      equipment = await createEquipment({
        companyId,
        typeId: Number(typeId),
        modelName,
        serialNumber,
        condition,
        manufacturer,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
        currentLocationId: currentLocationId ? Number(currentLocationId) : null,
        purchasePrice: purchasePriceNum,
        notes,
      });
      if (equipment?.id && equipment?.current_location_id) {
        await recordEquipmentCurrentLocationChange({
          companyId,
          equipmentId: Number(equipment.id),
          fromLocationId: null,
          toLocationId: Number(equipment.current_location_id),
        }).catch(() => null);
      }
      finalOrder = await updatePurchaseOrder({
        id: order.id,
        companyId,
        vendorId: Number(vendorId),
        status: "closed",
        expectedPossessionDate: expectedDate,
        typeId: Number(typeId),
        modelName,
        serialNumber,
        condition,
        manufacturer,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
        currentLocationId: currentLocationId ? Number(currentLocationId) : null,
        purchasePrice: purchasePriceNum,
        notes,
        equipmentId: equipment?.id || null,
        closedAt: new Date().toISOString(),
      });
    }

    res.status(201).json({ purchaseOrder: finalOrder, equipment });
  })
);

app.put(
  "/api/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      vendorId,
      status,
      expectedPossessionDate,
      typeId,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls,
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    } = req.body || {};
    if (!companyId || !vendorId || !typeId || !expectedPossessionDate) {
      return res.status(400).json({ error: "companyId, vendorId, typeId, and expectedPossessionDate are required." });
    }
    const existing = await getPurchaseOrder({ companyId: Number(companyId), id: Number(id) });
    if (!existing) return res.status(404).json({ error: "Purchase order not found." });

    const normalizedStatus = normalizePurchaseOrderStatus(status);
    const expectedDate = String(expectedPossessionDate || "").trim();
    const locationIdNum = locationId === "" || locationId === null || locationId === undefined ? null : Number(locationId);
    const purchasePriceNum =
      purchasePrice === "" || purchasePrice === null || purchasePrice === undefined ? null : Number(purchasePrice);
    if (!expectedDate || Number.isNaN(Date.parse(expectedDate))) {
      return res.status(400).json({ error: "expectedPossessionDate must be a valid date." });
    }
    if (
      normalizedStatus === "closed" &&
      (!modelName || !serialNumber || !condition || !manufacturer || !Number.isFinite(locationIdNum) || purchasePriceNum === null)
    ) {
      return res.status(400).json({
        error: "modelName, serialNumber, condition, manufacturer, locationId, and purchasePrice are required to close a PO.",
      });
    }

    const closedAt = normalizedStatus === "closed" ? existing.closed_at || new Date().toISOString() : null;
    let updated = await updatePurchaseOrder({
      id,
      companyId,
      vendorId: Number(vendorId),
      status: normalizedStatus,
      expectedPossessionDate: expectedDate,
      typeId: Number(typeId),
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
      currentLocationId: currentLocationId ? Number(currentLocationId) : null,
      purchasePrice: purchasePriceNum,
      notes,
      equipmentId: existing.equipment_id || null,
      closedAt,
    });
    if (!updated) return res.status(404).json({ error: "Purchase order not found." });

    let equipment = null;
    if (normalizedStatus === "closed" && !existing.equipment_id) {
      equipment = await createEquipment({
        companyId,
        typeId: Number(typeId),
        modelName,
        serialNumber,
        condition,
        manufacturer,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
        currentLocationId: currentLocationId ? Number(currentLocationId) : null,
        purchasePrice: purchasePriceNum,
        notes,
      });
      if (equipment?.id && equipment?.current_location_id) {
        await recordEquipmentCurrentLocationChange({
          companyId,
          equipmentId: Number(equipment.id),
          fromLocationId: null,
          toLocationId: Number(equipment.current_location_id),
        }).catch(() => null);
      }
      updated = await updatePurchaseOrder({
        id,
        companyId,
        vendorId: Number(vendorId),
        status: "closed",
        expectedPossessionDate: expectedDate,
        typeId: Number(typeId),
        modelName,
        serialNumber,
        condition,
        manufacturer,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
        currentLocationId: currentLocationId ? Number(currentLocationId) : null,
        purchasePrice: purchasePriceNum,
        notes,
        equipmentId: equipment?.id || null,
        closedAt: closedAt || new Date().toISOString(),
      });
    }

    res.json({ purchaseOrder: updated, equipment });
  })
);

app.delete(
  "/api/purchase-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deletePurchaseOrder({ id, companyId });
    res.status(204).end();
  })
);

app.get(
  "/api/equipment-bundles",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const bundles = await listEquipmentBundles(Number(companyId));
    res.json({ bundles });
  })
);

app.get(
  "/api/equipment-bundles/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const bundle = await getEquipmentBundle({ companyId: Number(companyId), id: Number(id) });
    if (!bundle) return res.status(404).json({ error: "Bundle not found." });
    res.json(bundle);
  })
);

app.post(
  "/api/equipment-bundles",
  asyncHandler(async (req, res) => {
    const { companyId, name, primaryEquipmentId, equipmentIds, dailyRate, weeklyRate, monthlyRate } = req.body || {};
    if (!companyId || !String(name || "").trim()) {
      return res.status(400).json({ error: "companyId and name are required." });
    }
    const result = await createEquipmentBundle({
      companyId: Number(companyId),
      name: String(name || "").trim(),
      primaryEquipmentId: primaryEquipmentId ? Number(primaryEquipmentId) : null,
      equipmentIds,
      dailyRate:
        dailyRate === "" || dailyRate === null || dailyRate === undefined || !Number.isFinite(Number(dailyRate))
          ? null
          : Number(dailyRate),
      weeklyRate:
        weeklyRate === "" || weeklyRate === null || weeklyRate === undefined || !Number.isFinite(Number(weeklyRate))
          ? null
          : Number(weeklyRate),
      monthlyRate:
        monthlyRate === "" || monthlyRate === null || monthlyRate === undefined || !Number.isFinite(Number(monthlyRate))
          ? null
          : Number(monthlyRate),
    });
    res.status(201).json(result);
  })
);

app.put(
  "/api/equipment-bundles/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, name, primaryEquipmentId, equipmentIds, dailyRate, weeklyRate, monthlyRate } = req.body || {};
    if (!companyId || !String(name || "").trim()) {
      return res.status(400).json({ error: "companyId and name are required." });
    }
    const result = await updateEquipmentBundle({
      id: Number(id),
      companyId: Number(companyId),
      name: String(name || "").trim(),
      primaryEquipmentId: primaryEquipmentId ? Number(primaryEquipmentId) : null,
      equipmentIds,
      dailyRate:
        dailyRate === "" || dailyRate === null || dailyRate === undefined || !Number.isFinite(Number(dailyRate))
          ? null
          : Number(dailyRate),
      weeklyRate:
        weeklyRate === "" || weeklyRate === null || weeklyRate === undefined || !Number.isFinite(Number(weeklyRate))
          ? null
          : Number(weeklyRate),
      monthlyRate:
        monthlyRate === "" || monthlyRate === null || monthlyRate === undefined || !Number.isFinite(Number(monthlyRate))
          ? null
          : Number(monthlyRate),
    });
    if (!result) return res.status(404).json({ error: "Bundle not found." });
    res.json(result);
  })
);

app.delete(
  "/api/equipment-bundles/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteEquipmentBundle({ id: Number(id), companyId: Number(companyId) });
    res.status(204).end();
  })
);

app.get(
  "/api/equipment",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const equipment = await listEquipment(companyId);
    res.json({ equipment });
  })
);

app.post(
  "/api/equipment",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      typeId,
      typeName,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls,
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    } = req.body;
    if (!companyId || (!typeId && !typeName) || !modelName || !serialNumber || !condition) {
      return res
        .status(400)
        .json({ error: "companyId, (typeId or typeName), modelName, serialNumber, and condition are required." });
    }
    const equipment = await createEquipment({
      companyId,
      typeId,
      typeName,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    });
    if (equipment?.id && equipment?.current_location_id) {
      await recordEquipmentCurrentLocationChange({
        companyId,
        equipmentId: Number(equipment.id),
        fromLocationId: null,
        toLocationId: Number(equipment.current_location_id),
      }).catch(() => null);
    }
    res.status(201).json(equipment);
  })
);

app.put(
  "/api/equipment/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      typeId,
      typeName,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls,
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    } = req.body;
    if (!companyId || (!typeId && !typeName) || !modelName || !serialNumber || !condition) {
      return res
        .status(400)
        .json({ error: "companyId, (typeId or typeName), modelName, serialNumber, and condition are required." });
    }

    const before = await getEquipmentLocationIds({ companyId, equipmentId: Number(id) });
    const updated = await updateEquipment({
      id,
      companyId,
      typeId,
      typeName,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      locationId,
      currentLocationId,
      purchasePrice,
      notes,
    });
    if (!updated) return res.status(404).json({ error: "Equipment not found" });
    const beforeCurrent = before?.current_location_id ?? null;
    const afterCurrent = updated?.current_location_id ?? null;
    if (String(beforeCurrent || "") !== String(afterCurrent || "")) {
      await recordEquipmentCurrentLocationChange({
        companyId,
        equipmentId: Number(updated.id),
        fromLocationId: beforeCurrent,
        toLocationId: afterCurrent,
      }).catch(() => null);
      if (beforeCurrent) await cleanupNonBaseLocationIfUnused({ companyId, locationId: Number(beforeCurrent) }).catch(() => null);
    }
    res.json(updated);
  })
);

app.get(
  "/api/equipment/:id/location-history",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, limit } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const rows = await listEquipmentCurrentLocationHistory({
      companyId: Number(companyId),
      equipmentId: Number(id),
      limit,
    });
    res.json({ rows });
  })
);

app.delete(
  "/api/equipment/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const before = await getEquipmentLocationIds({ companyId, equipmentId: Number(id) });
    await deleteEquipment({ id, companyId });
    if (before?.current_location_id) {
      await cleanupNonBaseLocationIfUnused({ companyId, locationId: Number(before.current_location_id) }).catch(() => null);
    }
    res.status(204).end();
  })
);

app.post(
  "/api/equipment/purge",
  asyncHandler(async (req, res) => {
    const { companyId, confirm } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (confirm !== "DELETE_ALL_EQUIPMENT") {
      return res.status(400).json({ error: 'Missing confirmation. Set confirm = "DELETE_ALL_EQUIPMENT".' });
    }
    const result = await purgeEquipmentForCompany({ companyId: Number(companyId) });
    res.status(200).json(result);
  })
);

app.get("*", (req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/")) return next();
  if (!fs.existsSync(path.join(spaRoot, "index.html"))) return next();
  if (path.extname(req.path)) return next();

  const accept = String(req.headers.accept || "");
  if (!accept.includes("text/html")) return next();

  res.sendFile(path.join(spaRoot, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

let lastMonthlyBillingKey = null;

function resolveMonthlyBillingNow() {
  const raw = process.env.MONTHLY_BILLING_TEST_DATE;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function runMonthlyBillingIfDue() {
  const overrideNow = resolveMonthlyBillingNow();
  const now = overrideNow || new Date();
  if (Number.isNaN(now.getTime())) return;
  if (!overrideNow && now.getUTCDate() !== 1) return;
  const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  if (lastMonthlyBillingKey === key) return;
  lastMonthlyBillingKey = key;

  const companies = await listCompaniesWithMonthlyAutoRun();
  for (const companyId of companies) {
    try {
      const result = await generateMonthlyInvoicesForCompany({ companyId, runDate: now.toISOString() });
      const created = Array.isArray(result?.created) ? result.created : [];
      if (created.length) {
        await emailInvoicesIfConfigured({ companyId, invoices: created }).catch(() => null);
      }
    } catch (err) {
      console.warn("Monthly invoice run failed:", err?.message || err);
    }
  }
}

async function start() {
  await ensureTables();
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });

  runMonthlyBillingIfDue().catch((err) => {
    console.warn("Monthly invoice run failed:", err?.message || err);
  });
  setInterval(() => {
    runMonthlyBillingIfDue().catch((err) => {
      console.warn("Monthly invoice run failed:", err?.message || err);
    });
  }, 6 * 60 * 60 * 1000);
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
