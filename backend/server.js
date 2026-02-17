const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const PDFDocument = require("pdfkit");

// Load env from repo root even if server is started from `backend/`.
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const { mimeFromExtension, readImageAsInlinePart, generateDamageReportMarkdown } = require("./aiDamageReport");
const { editImageBufferWithGemini, writeCompanyUpload } = require("./aiImageEdit");

const {
  pool,
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
  listEquipmentLocationIdsForIds,
  recordEquipmentCurrentLocationChange,
  cleanupNonBaseLocationIfUnused,
  listEquipmentCurrentLocationHistory,
  listEquipment,
  setEquipmentCurrentLocationForIds,
  setEquipmentCurrentLocationToBaseForIds,
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
  getCustomerById,
  createCustomer,
  updateCustomer,
  setCustomerPendingStatus,
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
  listSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  deleteSalesOrder,
  listWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
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
  listRentalOrderLineItemsForRange,
  getLineItemRevenueSummary,
  listRentalOrderContacts,
  listTimelineData,
  getRentalOrder,
  createRentalOrder,
  updateRentalOrder,
  updateRentalOrderSiteAddress,
  updateRentalOrderStatus,
  deleteRentalOrder,
  listRentalOrderAudits,
  addRentalOrderNote,
  addRentalOrderAttachment,
  deleteRentalOrderAttachment,
  listCustomerDocuments,
  addCustomerDocument,
  deleteCustomerDocument,
  createCustomerShareLink,
  getCustomerShareLinkByHash,
  markCustomerShareLinkUsed,
  revokeCustomerShareLink,
  createCustomerChangeRequest,
  updateCustomerChangeRequestStatus,
  listCustomerChangeRequests,
  getCustomerChangeRequest,
  getLatestCustomerChangeRequestForLink,
  getCustomerStorefrontExtras,
  listAvailableInventory,
  getBundleAvailability,
  getTypeDemandAvailability,
  listStorefrontListings,
  listStorefrontSaleListings,
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
  getPasswordValidationError,
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
  getTypeAvailabilitySeries,
  getAvailabilityShortfallsSummary,
  getAvailabilityShortfallsCustomerDemand,
  getTypeAvailabilitySeriesWithProjection,
  getTypeAvailabilityShortfallDetails,
  getUtilizationDashboard,
  getRevenueSummary,
  getRevenueTimeSeries,
  getSalespersonSummary,
  getSalespersonClosedTransactionsTimeSeries,
  getLocationClosedTransactionsTimeSeries,
  getLocationTypeStockSummary,
  getQboConnection,
  findCompanyIdByQboRealmId,
  upsertQboConnection,
  findCustomerIdByQboCustomerId,
  updateCustomerQboLink,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
  listQboDocuments,
  getQboDocument,
  listQboErrorLogs,
  listRentalOrdersWithOutItems,
  countOutItemsForOrder,
} = require("./db");

const { streamOrderPdf, buildOrderPdfBuffer } = require("./pdf");
const { sendCompanyEmail, requestSubmittedEmail, statusUpdatedEmail } = require("./mailer");
const {
  getQboConfig,
  buildAuthUrl,
  exchangeAuthCode,
  disconnectQboConnection,
  createPickupDraftInvoice,
  createPickupDraftInvoiceBulk,
  createMonthlyDraftInvoice,
  createReturnCreditMemo,
  getPickupBulkDocNumber,
  handleWebhookEvent,
  runCdcSync,
  getIncomeTotals,
  getIncomeTimeSeries,
  listQboCustomers,
  getQboCustomerById,
  createQboCustomer,
  normalizeQboCustomer,
  listQboItems,
  normalizeQboItem,
  listQboIncomeAccounts,
  listQboTaxCodes,
} = require("./qboService");
const { verifyWebhookSignature, computeExpiryTimestamp, initQboDiscovery } = require("./qbo");

const app = express();
const PORT = process.env.PORT || 4000;

const publicRoot = path.join(__dirname, "..", "public");
const spaRoot = path.join(publicRoot, "spa");
const defaultUploadRoot = path.join(publicRoot, "uploads");
const uploadRoot = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : defaultUploadRoot;
const IMAGE_URL_MODE = String(process.env.IMAGE_URL_MODE || process.env.IMAGE || "").trim().toLowerCase();
const IMAGE_URL_BASE = String(process.env.IMAGE_URL_BASE || "").trim();

const FORCE_HTTPS = parseBoolean(process.env.FORCE_HTTPS) === true;
const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY) === true || FORCE_HTTPS === true;
const SECURITY_HEADERS_DISABLED = parseBoolean(process.env.SECURITY_HEADERS_DISABLED) === true;
const ALLOWED_HTTP_METHODS = parseHttpMethodList(process.env.ALLOWED_HTTP_METHODS, [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
]);
const ALLOWED_REDIRECT_HOSTS = parseStringArray(process.env.ALLOWED_REDIRECT_HOSTS).map((h) =>
  String(h || "").trim().toLowerCase()
);
const DEFAULT_QBO_REDIRECT_PATHS = ["/settings.html", "/customers.html", "/invoices.html", "/qbo-customers.html"];
const QBO_ALLOWED_REDIRECT_PATHS = parseStringArray(process.env.QBO_ALLOWED_REDIRECT_PATHS);
const QBO_ALLOWED_REDIRECTS = new Set(
  (QBO_ALLOWED_REDIRECT_PATHS.length ? QBO_ALLOWED_REDIRECT_PATHS : DEFAULT_QBO_REDIRECT_PATHS)
    .map((entry) => normalizeInternalRedirectPath(entry))
    .filter(Boolean)
    .map((entry) => entry.split(/[?#]/)[0])
);
const DISPATCH_ALLOWED_PAGES = new Set([
  "/dispatch.html",
  "/dispatch-detail.html",
  "/work-orders.html",
  "/work-order-form.html",
]);
const DISPATCH_ALLOWED_API = [
  { method: "GET", pattern: /^\/api\/auth\/me$/ },
  { method: "POST", pattern: /^\/api\/logout$/ },
  { method: "GET", pattern: /^\/api\/public-config$/ },
  { method: "GET", pattern: /^\/api\/company-settings$/ },
  { method: "GET", pattern: /^\/api\/geocode\/search$/ },
  { method: "GET", pattern: /^\/api\/rental-orders\/timeline$/ },
  { method: "GET", pattern: /^\/api\/rental-orders\/[^/]+$/ },
  { method: "PUT", pattern: /^\/api\/rental-orders\/[^/]+\/site-address$/ },
  { method: "GET", pattern: /^\/api\/equipment$/ },
  { method: "GET", pattern: /^\/api\/work-orders$/ },
  { method: "GET", pattern: /^\/api\/work-orders\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/work-orders$/ },
  { method: "PUT", pattern: /^\/api\/work-orders\/[^/]+$/ },
  { method: "DELETE", pattern: /^\/api\/work-orders\/[^/]+$/ },
  { method: "POST", pattern: /^\/api\/equipment\/[^/]+\/work-order-pause$/ },
  { method: "POST", pattern: /^\/api\/uploads\/image$/ },
  { method: "DELETE", pattern: /^\/api\/uploads\/image$/ },
];
const HSTS_MAX_AGE = parseHstsMaxAge(process.env.HSTS_MAX_AGE, 60 * 60 * 24 * 180);
const HSTS_INCLUDE_SUBDOMAINS = parseBoolean(process.env.HSTS_INCLUDE_SUBDOMAINS) !== false;
const HSTS_PRELOAD = parseBoolean(process.env.HSTS_PRELOAD) === true;
const CONTENT_SECURITY_POLICY = buildCspHeaderValue(process.env.CONTENT_SECURITY_POLICY);
const JSON_BODY_LIMIT = parseBodySize(process.env.JSON_BODY_LIMIT, "5mb");
if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function shouldPrefixImageUrls(req) {
  if (!(IMAGE_URL_MODE === "local" || IMAGE_URL_MODE === "absolute" || !!IMAGE_URL_BASE)) return false;
  const path = String(req?.path || "");
  if (!path) return false;
  return (
    path.startsWith("/api/storefront") ||
    path.startsWith("/api/public") ||
    path.startsWith("/api/customers")
  );
}

function resolveImageBaseUrl(req) {
  const configured = normalizeBaseUrl(IMAGE_URL_BASE);
  if (configured) return configured;
  const host = req.get("host");
  if (!host) return "";
  const protocol = req.protocol || "http";
  return `${protocol}://${host}`;
}

const PUBLIC_UPLOAD_ASSET_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
]);

function isPublicCompanyUploadAsset(pathname) {
  const clean = String(pathname || "");
  if (!/^\/company-\d+\//.test(clean)) return false;
  const ext = path.extname(clean).toLowerCase();
  return PUBLIC_UPLOAD_ASSET_EXTS.has(ext);
}

function withImageBaseUrl(req, url) {
  const raw = String(url || "").trim();
  if (!raw) return url;
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (!raw.startsWith("/uploads/") && !raw.startsWith("uploads/")) return raw;
  const base = resolveImageBaseUrl(req);
  if (!base) return raw;
  const pathPart = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${pathPart}`;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function prefixUploadUrls(req, value, seen = new WeakSet()) {
  if (typeof value === "string") return withImageBaseUrl(req, value);
  if (Array.isArray(value)) return value.map((item) => prefixUploadUrls(req, item, seen));
  if (!value || typeof value !== "object" || !isPlainObject(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = prefixUploadUrls(req, entry, seen);
  }
  return next;
}

function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function isHtmlFilePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === ".html" || ext === ".htm" || ext === ".xhtml";
}

function isHtmlRequest(req) {
  if (isHtmlFilePath(req.path)) return true;
  if (path.extname(req.path)) return false;
  const accept = String(req.headers.accept || "");
  return accept.includes("text/html");
}

function isAllowedRedirectHost(host) {
  const clean = String(host || "").trim().toLowerCase();
  if (!clean) return false;
  if (!/^[a-z0-9.-]+(?::\d+)?$/.test(clean)) return false;
  if (!ALLOWED_REDIRECT_HOSTS.length) return false;
  return ALLOWED_REDIRECT_HOSTS.includes(clean);
}

function normalizeInternalRedirectPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  if (raw.startsWith("//") || raw.startsWith("\\") || raw.includes("://")) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
  if (raw.includes("\\")) return null;
  let normalized = raw.startsWith("/") ? raw : `/${raw}`;
  if (normalized.startsWith("//")) return null;
  return normalized;
}

function sanitizeInternalRedirect(value) {
  const normalized = normalizeInternalRedirectPath(value);
  if (!normalized) return null;
  const pathOnly = normalized.split(/[?#]/)[0];
  if (QBO_ALLOWED_REDIRECTS.size && !QBO_ALLOWED_REDIRECTS.has(pathOnly)) return null;
  return normalized;
}

function requestIsSecure(req) {
  if (req.secure) return true;
  const forwarded = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (!forwarded) return false;
  return forwarded === "https";
}

if (FORCE_HTTPS) {
  app.use((req, res, next) => {
    if (requestIsSecure(req)) return next();
    const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
    if (!isAllowedRedirectHost(host)) return res.status(400).send("Bad Request");
    return res.redirect(308, `https://${host}${req.originalUrl}`);
  });
}

if (!SECURITY_HEADERS_DISABLED) {
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (CONTENT_SECURITY_POLICY) {
      res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    if ((requestIsSecure(req) || FORCE_HTTPS) && HSTS_MAX_AGE > 0) {
      const directives = [`max-age=${HSTS_MAX_AGE}`];
      if (HSTS_INCLUDE_SUBDOMAINS) directives.push("includeSubDomains");
      if (HSTS_PRELOAD) directives.push("preload");
      res.setHeader("Strict-Transport-Security", directives.join("; "));
    }
    return next();
  });
}

app.use(cors());
const allowedHttpMethods = new Set(ALLOWED_HTTP_METHODS);
app.use((req, res, next) => {
  const method = String(req.method || "").toUpperCase();
  if (!allowedHttpMethods.has(method)) {
    res.setHeader("Allow", ALLOWED_HTTP_METHODS.join(", "));
    return res.status(405).json({ error: "Method not allowed." });
  }
  return next();
});
app.use(
  express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req, res, buf) => {
      if (buf && buf.length) req.rawBody = buf.toString("utf8");
    },
  })
);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use((req, res, next) => {
  if (!shouldPrefixImageUrls(req)) return next();
  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(prefixUploadUrls(req, payload));
  next();
});

app.use(
  asyncHandler(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    if (!isHtmlRequest(req)) return next();
    const { token } = getCompanyUserToken(req);
    if (!token) return next();
    const session = await getCompanyUserByToken(token);
    res.locals.companySession = session || null;
    if (session) {
      res.locals.noCacheHtml = true;
    }
    return next();
  })
);

app.use(
  asyncHandler(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    if (!isHtmlRequest(req)) return next();

    const session = res.locals.companySession;
    if (!session) return next();

    const role = session?.user?.role ? String(session.user.role).trim().toLowerCase() : "";
    if (role !== "dispatch") return next();

      const normalizedPath = req.path || "/";
      if (normalizedPath === "/" || normalizedPath === "/index.html") {
        return res.redirect(302, "/dispatch.html");
      }
      if (DISPATCH_ALLOWED_PAGES.has(normalizedPath)) return next();

    return res.status(403).send("Insufficient permissions.");
  })
);

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
  app.use(
    express.static(spaRoot, {
      setHeaders: (res, filePath) => {
        if (res.locals?.noCacheHtml && isHtmlFilePath(filePath)) {
          setNoCacheHeaders(res);
        }
      },
    })
  );
}
app.use(
  "/uploads",
  asyncHandler(async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      return res.status(405).send("Method not allowed.");
    }

    // Allow unauthenticated access to public storefront assets (images + docs).
    if (isPublicCompanyUploadAsset(req.path)) return next();

    const { token } = getCompanyUserToken(req);
    if (token) {
      const session = await getCompanyUserByToken(token);
      if (session) return next();
    }

    const authHeader = String(req.headers.authorization || "").trim();
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (bearer) {
      const account = await getCustomerAccountByToken(bearer);
      if (account) return next();
      const storefront = await getStorefrontCustomerByToken(bearer);
      if (storefront) return next();
    }

    return res.status(401).send("Login required.");
  })
);
app.use(
  "/uploads",
  express.static(uploadRoot, {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const cacheable = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
      if (cacheable.has(ext)) {
        res.setHeader("Cache-Control", "private, max-age=604800, immutable");
      } else {
        setNoCacheHeaders(res);
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
      const inline = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"]);
      if (!inline.has(ext)) {
        res.setHeader("Content-Disposition", "attachment");
      }
    },
  })
);
app.use(
  express.static(publicRoot, {
    setHeaders: (res, filePath) => {
      if (res.locals?.noCacheHtml && isHtmlFilePath(filePath)) {
        setNoCacheHeaders(res);
      }
    },
  })
);

function parseRateLimitMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1000, Math.floor(parsed));
}

function parseRateLimitMax(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function parseBodySize(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return fallback;
    return Math.floor(value);
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return Math.max(1, Number(raw));
  if (/^\d+(\.\d+)?\s*(b|kb|mb|gb)$/i.test(raw)) {
    return raw.replace(/\s+/g, "");
  }
  return fallback;
}

const RATE_LIMIT_LOGIN_WINDOW_MS = parseRateLimitMs(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 15 * 60 * 1000);
const RATE_LIMIT_LOGIN_MAX = parseRateLimitMax(process.env.RATE_LIMIT_LOGIN_MAX, 5);
const QBO_OAUTH_STATE_TTL_MS = parseRateLimitMs(process.env.QBO_OAUTH_STATE_TTL_MS, 10 * 60 * 1000);
const QBO_OAUTH_STATE_MAX = parseRateLimitMax(process.env.QBO_OAUTH_STATE_MAX, 2000);
const QBO_OAUTH_ERROR_REDIRECT = "/settings.html?qbo=error";
const qboOauthStateStore = new Map();

function buildRateLimitHandler(message) {
  return (req, res, next, options) => {
    const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).getTime() : null;
    const retryAfterSeconds = resetTime ? Math.max(0, Math.ceil((resetTime - Date.now()) / 1000)) : null;
    const payload = { error: message };
    if (retryAfterSeconds !== null) payload.retryAfterSeconds = retryAfterSeconds;
    res.status(options.statusCode).json(payload);
  };
}

const loginLimiter = rateLimit({
  windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
  max: RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler("Too many login attempts, please try again later."),
});

const customerLinkLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler("Too many link requests, please try again later."),
});

const customerLinkSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: buildRateLimitHandler("Too many submissions, please try again later."),
});

function pruneQboOauthStates(now = Date.now()) {
  for (const [key, entry] of qboOauthStateStore.entries()) {
    if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now) {
      qboOauthStateStore.delete(key);
    }
  }
  if (qboOauthStateStore.size <= QBO_OAUTH_STATE_MAX) return;
  const toRemove = qboOauthStateStore.size - QBO_OAUTH_STATE_MAX;
  const keys = Array.from(qboOauthStateStore.keys()).slice(0, toRemove);
  keys.forEach((key) => qboOauthStateStore.delete(key));
}

function createQboOauthState({ companyId, redirect }) {
  const state = base64Url(crypto.randomBytes(32));
  const now = Date.now();
  qboOauthStateStore.set(state, {
    companyId: Number(companyId),
    redirect: redirect || null,
    createdAt: now,
    expiresAt: now + QBO_OAUTH_STATE_TTL_MS,
  });
  pruneQboOauthStates(now);
  return state;
}

function consumeQboOauthState(value) {
  const state = String(value || "").trim();
  if (!state) return null;
  const entry = qboOauthStateStore.get(state);
  qboOauthStateStore.delete(state);
  if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= Date.now()) return null;
  return entry;
}

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

function parseHttpMethodList(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
    return items.length ? Array.from(new Set(items)) : fallback;
  }
  const raw = String(value).trim();
  if (!raw) return fallback;
  const items = raw
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  return items.length ? Array.from(new Set(items)) : fallback;
}

function parseHstsMaxAge(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
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

function buildCspHeaderValue(value) {
  const raw = String(value || "").trim();
  if (raw) return raw;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://server.arcgisonline.com https://*.googleapis.com https://*.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com https://*.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://esm.sh https://cdn.esm.sh https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com",
    "connect-src 'self' https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://esm.sh https://cdn.esm.sh https://raw.githack.com https://raw.githubusercontent.com",
    "worker-src 'self' blob:",
  ];
  return directives.join("; ");
}

function extractPickupLineItemIdFromDocNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const pickupMatch = raw.match(/PICKUP-(\d+)/i);
  if (pickupMatch) return Number(pickupMatch[1]);
  const compactMatch = raw.match(/-P(\d+)$/i);
  if (compactMatch) return Number(compactMatch[1]);
  return null;
}

function extractLineItemIdsFromPrivateNote(note) {
  const raw = String(note || "").trim();
  if (!raw) return [];
  const match = raw.match(/LINEITEMS=([0-9,]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

function collectPickupLineItemIdsFromDocs(docs) {
  const ids = new Set();
  for (const doc of docs || []) {
    if (doc?.qbo_entity_type !== "Invoice") continue;
    if (doc?.source && doc.source !== "rent_soft") continue;
    if (doc?.is_voided || doc?.is_deleted) continue;
    const docNumber = String(doc?.doc_number || doc?.docNumber || "").trim();
    const docLineItemId = extractPickupLineItemIdFromDocNumber(docNumber);
    if (Number.isFinite(docLineItemId)) ids.add(docLineItemId);
    const note = doc?.raw?.PrivateNote || doc?.raw?.privateNote || "";
    const noteIds = extractLineItemIdsFromPrivateNote(note);
    for (const noteId of noteIds) {
      ids.add(noteId);
    }
  }
  return ids;
}

function pickupBulkInvoiceIncludesLineItem({ docs, bulkDocNumber, lineItemId }) {
  const docNumber = String(bulkDocNumber || "").trim();
  const targetId = Number(lineItemId);
  if (!docNumber || !Number.isFinite(targetId)) return null;
  const doc = (docs || []).find((docItem) => {
    if (docItem?.qbo_entity_type !== "Invoice") return false;
    if (docItem?.source && docItem.source !== "rent_soft") return false;
    if (docItem?.is_voided || docItem?.is_deleted) return false;
    const candidate = String(docItem?.doc_number || docItem?.docNumber || "").trim();
    return candidate === docNumber;
  });
  if (!doc) return null;
  const note = doc?.raw?.PrivateNote || doc?.raw?.privateNote || "";
  const noteIds = extractLineItemIdsFromPrivateNote(note);
  if (!noteIds.length) return null;
  return noteIds.includes(targetId);
}

function normalizePurchaseOrderStatus(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "closed") return "closed";
  return "open";
}

function normalizeSalesOrderStatus(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "closed") return "closed";
  return "open";
}

async function createPickupInvoicesForOrder({ companyId, orderId, source, mode, pickedUpAt } = {}) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  if (!Number.isFinite(cid) || !Number.isFinite(oid)) {
    return { ok: false, skipped: "invalid_ids" };
  }
  const settings = await getCompanySettings(cid).catch(() => null);
  if (!settings?.qbo_enabled) {
    return { ok: false, skipped: "disabled" };
  }
  const detail = await getRentalOrder({ companyId: cid, id: oid }).catch(() => null);
  const lineItems = Array.isArray(detail?.lineItems) ? detail.lineItems : [];
  const pickedUpItems = lineItems.filter((li) => li?.fulfilledAt);
  if (!pickedUpItems.length) {
    return { ok: false, skipped: "no_fulfilled_items" };
  }
  const existingDocs = await listQboDocumentsForRentalOrder({ companyId: cid, orderId: oid }).catch(() => []);
  const existingDocNumbers = new Set(
    (existingDocs || [])
      .map((doc) => String(doc?.doc_number || doc?.docNumber || ""))
      .filter(Boolean)
  );
  const existingPickupLineItemIds = collectPickupLineItemIdsFromDocs(existingDocs);
  const roNumber = detail?.order?.ro_number || detail?.order?.roNumber || null;

  if (mode === "bulk") {
    const lineItemIds = pickedUpItems
      .map((lineItem) => Number(lineItem?.id))
      .filter((lineItemId) => Number.isFinite(lineItemId));
    if (!lineItemIds.length) {
      return { ok: false, skipped: "no_valid_line_items" };
    }
    const existingPickupLineItemIds = collectPickupLineItemIdsFromDocs(existingDocs);
    const filteredLineItemIds = lineItemIds.filter((lineItemId) => !existingPickupLineItemIds.has(lineItemId));
    if (!filteredLineItemIds.length) {
      return { ok: false, skipped: "line_items_already_invoiced", lineItemIds };
    }
    const filteredLineItemIdSet = new Set(filteredLineItemIds);
    const fallbackPickedUpAt = pickedUpItems.find((item) =>
      filteredLineItemIdSet.has(Number(item?.id))
    )?.fulfilledAt;
    const normalizedPickedUpAt = normalizeTimestampInput(pickedUpAt) || fallbackPickedUpAt || null;
    const bulkDocNumber = getPickupBulkDocNumber({
      roNumber,
      orderId: oid,
      pickedUpAt: normalizedPickedUpAt,
      billingDay: settings.qbo_billing_day,
    });
    if (bulkDocNumber && existingDocNumbers.has(bulkDocNumber)) {
      console.info("QBO pickup invoice skipped (bulk invoice exists)", {
        companyId: cid,
        orderId: oid,
        docNumber: bulkDocNumber,
        source: source || null,
      });
      return { ok: false, skipped: "bulk_invoice_exists", docNumber: bulkDocNumber };
    }
    console.info("QBO pickup invoice attempt (bulk order save)", {
      companyId: cid,
      orderId: oid,
      lineItemCount: filteredLineItemIds.length,
      pickedUpAt: normalizedPickedUpAt,
      source: source || null,
    });
    try {
      const qbo = await createPickupDraftInvoiceBulk({
        companyId: cid,
        orderId: oid,
        lineItemIds: filteredLineItemIds,
        pickedUpAt: normalizedPickedUpAt || new Date().toISOString(),
      });
      const result = {
        lineItemIds: filteredLineItemIds,
        ok: qbo?.ok ?? null,
        skipped: qbo?.skipped ?? null,
        error: qbo?.error ?? null,
        docNumber: qbo?.document?.doc_number || qbo?.document?.docNumber || null,
      };
      console.info("QBO pickup invoice result (bulk order save)", {
        companyId: cid,
        orderId: oid,
        ok: result.ok,
        skipped: result.skipped,
        error: result.error,
        docNumber: result.docNumber,
        source: source || null,
      });
      return { ok: true, bulk: true, results: [result] };
    } catch (err) {
      const errorMessage = err?.message ? String(err.message) : "QBO invoice failed.";
      console.error("QBO pickup invoice failed (bulk order save)", {
        companyId: cid,
        orderId: oid,
        error: errorMessage,
        source: source || null,
      });
      return { ok: false, error: errorMessage };
    }
  }

  const results = [];
  for (const lineItem of pickedUpItems) {
    const lineItemId = Number(lineItem?.id);
    if (!Number.isFinite(lineItemId)) continue;
    if (existingPickupLineItemIds.has(lineItemId)) {
      const result = {
        lineItemId,
        ok: false,
        skipped: "line_item_already_invoiced",
      };
      results.push(result);
      console.info("QBO pickup invoice skipped (line item already invoiced)", {
        companyId: cid,
        orderId: oid,
        lineItemId,
        source: source || null,
      });
      continue;
    }
    const pickedUpAt = lineItem?.fulfilledAt || null;
    const bulkDocNumber = getPickupBulkDocNumber({
      roNumber,
      orderId: oid,
      pickedUpAt,
      billingDay: settings.qbo_billing_day,
    });
    const bulkBlocks =
      bulkDocNumber &&
      existingDocNumbers.has(bulkDocNumber) &&
      pickupBulkInvoiceIncludesLineItem({
        docs: existingDocs,
        bulkDocNumber,
        lineItemId,
      }) !== false;
    if (bulkBlocks) {
      const result = {
        lineItemId,
        ok: false,
        skipped: "bulk_invoice_exists",
        docNumber: bulkDocNumber,
      };
      results.push(result);
      console.info("QBO pickup invoice skipped (bulk invoice exists)", {
        companyId: cid,
        orderId: oid,
        lineItemId,
        docNumber: result.docNumber,
        source: source || null,
      });
      continue;
    }
    console.info("QBO pickup invoice attempt (order save)", {
      companyId: cid,
      orderId: oid,
      lineItemId,
      pickedUpAt,
      source: source || null,
    });
    try {
      const qbo = await createPickupDraftInvoice({
        companyId: cid,
        orderId: oid,
        lineItemId,
        pickedUpAt: pickedUpAt || new Date().toISOString(),
      });
      const result = {
        lineItemId,
        ok: qbo?.ok ?? null,
        skipped: qbo?.skipped ?? null,
        error: qbo?.error ?? null,
        docNumber: qbo?.document?.doc_number || qbo?.document?.docNumber || null,
      };
      results.push(result);
      console.info("QBO pickup invoice result (order save)", {
        companyId: cid,
        orderId: oid,
        lineItemId,
        ok: result.ok,
        skipped: result.skipped,
        error: result.error,
        docNumber: result.docNumber,
        source: source || null,
      });
    } catch (err) {
      const errorMessage = err?.message ? String(err.message) : "QBO invoice failed.";
      results.push({ lineItemId, ok: false, error: errorMessage });
      console.error("QBO pickup invoice failed (order save)", {
        companyId: cid,
        orderId: oid,
        lineItemId,
        error: errorMessage,
        source: source || null,
      });
    }
  }

  if (!results.length) {
    return { ok: false, skipped: "no_valid_line_items" };
  }
  return { ok: true, results };
}

app.get(
  "/api/public-config",
  asyncHandler(async (req, res) => {
    res.json({
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ? String(process.env.GOOGLE_MAPS_API_KEY) : null,
    });
  })
);

app.get(
  "/api/public/customer-links/:token",
  customerLinkLimiter,
  asyncHandler(async (req, res) => {
    const resolved = await resolveCustomerShareLink(req.params?.token);
    if (resolved.error) return res.status(404).json({ error: resolved.error });
    const link = resolved.link;

    const [settings, companyProfile, latestProof] = await Promise.all([
      getCompanySettings(link.company_id),
      getCompanyProfile(link.company_id),
      getLatestCustomerChangeRequestForLink({ companyId: link.company_id, linkId: link.id }),
    ]);

    const customer = link.customer_id ? await getCustomerById({ companyId: link.company_id, id: link.customer_id }) : null;
    const orderDetail = link.rental_order_id ? await getRentalOrder({ companyId: link.company_id, id: link.rental_order_id }) : null;
    const types = await listTypes(link.company_id);
    const sanitizedTypes = (types || []).map((t) => ({
      id: Number(t.id),
      name: t.name || "",
      category: t.category || null,
      description: t.description || null,
      terms: t.terms || null,
      imageUrl: t.image_url || null,
    }));

    const order = orderDetail?.order || null;
    const lineItems = Array.isArray(orderDetail?.lineItems) ? orderDetail.lineItems : [];
    const preparedLineItems = lineItems.map((li) => {
      const lineItemId = li.lineItemId ?? li.id ?? null;
      const typeId = li.typeId ?? li.type_id ?? null;
      const bundleId = li.bundleId ?? li.bundle_id ?? null;
      const startAt = li.startAt ?? li.start_at ?? null;
      const endAt = li.endAt ?? li.end_at ?? null;
      const rateBasis = li.rateBasis ?? li.rate_basis ?? null;
      const rateAmount = li.rateAmount ?? li.rate_amount ?? null;
      const billableUnits = li.billableUnits ?? li.billable_units ?? null;
      const lineAmount = li.lineAmount ?? li.line_amount ?? null;
      const unitDescription = li.unitDescription ?? li.unit_description ?? null;
      const hasPricing = rateAmount !== null && rateAmount !== undefined || lineAmount !== null && lineAmount !== undefined;
      return {
        lineItemId: lineItemId === null ? null : Number(lineItemId),
        typeId: typeId === null ? null : Number(typeId),
        bundleId: bundleId === null ? null : Number(bundleId),
        unitDescription: unitDescription ? String(unitDescription) : "",
        startAt,
        endAt,
        rateBasis: hasPricing ? rateBasis || null : null,
        rateAmount: hasPricing && rateAmount !== null ? Number(rateAmount) : null,
        billableUnits: hasPricing && billableUnits !== null ? Number(billableUnits) : null,
        lineAmount: hasPricing && lineAmount !== null ? Number(lineAmount) : null,
      };
    });
    const equipmentIds = collectEquipmentIdsFromLineItems(lineItems);
    const unitSnapshots = await listCustomerLinkUnitSnapshots({ companyId: link.company_id, equipmentIds });
    const orderUnits = unitSnapshots.map((row) => {
      const modelName = row.model_name || "";
      const serialNumber = row.serial_number || "";
      let label = "";
      if (modelName && serialNumber) {
        label = `${modelName} (${serialNumber})`;
      } else if (modelName || serialNumber) {
        label = modelName || serialNumber;
      } else {
        label = `Unit #${row.id}`;
      }
      return {
        id: Number(row.id),
        modelName,
        serialNumber,
        label,
        currentLocation: row.current_location || null,
        currentLocationLat:
          row.current_location_latitude === null || row.current_location_latitude === undefined
            ? null
            : Number(row.current_location_latitude),
        currentLocationLng:
          row.current_location_longitude === null || row.current_location_longitude === undefined
            ? null
            : Number(row.current_location_longitude),
      };
    });

    res.json({
      link: {
        id: link.id,
        scope: link.scope,
        singleUse: link.single_use === true,
        usedAt: link.used_at || null,
        expiresAt: link.expires_at || null,
        requireEsignature: link.require_esignature === true,
        termsText: link.terms_text || settings?.customer_terms_template || null,
        documentCategories:
          Array.isArray(link.allowed_document_categories) && link.allowed_document_categories.length
            ? link.allowed_document_categories
            : settings?.customer_document_categories || [],
      },
      company: {
        id: companyProfile?.id || link.company_id,
        name: companyProfile?.name || null,
        email: companyProfile?.contact_email || null,
        phone: companyProfile?.phone || null,
        logoUrl: settings?.logo_url || null,
      },
      customer: customer
        ? {
            id: customer.id,
            companyName: customer.company_name || null,
            contactName: customer.contact_name || null,
            streetAddress: customer.street_address || null,
            city: customer.city || null,
            region: customer.region || null,
            country: customer.country || null,
            postalCode: customer.postal_code || null,
            email: customer.email || null,
            phone: customer.phone || null,
            contacts: Array.isArray(customer.contacts) ? customer.contacts : [],
            accountingContacts: Array.isArray(customer.accounting_contacts) ? customer.accounting_contacts : [],
          }
        : null,
      order: order
        ? {
            id: order.id,
            status: order.status || null,
            customerPo: order.customer_po || null,
            fulfillmentMethod: order.fulfillment_method || "pickup",
            pickupLocationId: order.pickup_location_id || null,
            pickupLocationName: order.pickup_location_name || null,
            pickupStreetAddress: order.pickup_street_address || null,
            pickupCity: order.pickup_city || null,
            pickupRegion: order.pickup_region || null,
            pickupCountry: order.pickup_country || null,
            dropoffAddress: order.dropoff_address || null,
            siteName: order.site_name || null,
            siteAddress: order.site_address || null,
            siteAccessInfo: order.site_access_info || null,
            siteAddressLat: order.site_address_lat || null,
            siteAddressLng: order.site_address_lng || null,
            siteAddressQuery: order.site_address_query || null,
            logisticsInstructions: order.logistics_instructions || null,
            specialInstructions: order.special_instructions || null,
            criticalAreas: order.critical_areas || null,
            notificationCircumstances: order.notification_circumstances || [],
            coverageHours: order.coverage_hours || [],
            coverageTimeZone: order.coverage_timezone || null,
            emergencyContacts: order.emergency_contacts || [],
            siteContacts: order.site_contacts || [],
            generalNotes: order.general_notes || null,
          }
        : null,
      orderUnits,
      lineItems: preparedLineItems,
      types: sanitizedTypes,
      rentalInfoFields: settings?.rental_info_fields || null,
      proofAvailable: !!(latestProof?.proof_pdf_path),
    });
  })
);

app.post(
  "/api/public/customer-links/:token/unit-pins",
  customerLinkLimiter,
  asyncHandler(async (req, res) => {
    const resolved = await resolveCustomerShareLink(req.params?.token);
    if (resolved.error) return res.status(404).json({ error: resolved.error });
    const link = resolved.link;

    if (link.single_use && link.used_at) {
      return res.status(409).json({ error: "This share link has already been used." });
    }
    if (!link.rental_order_id) {
      return res.status(400).json({ error: "This link is not tied to a rental order." });
    }

    const equipmentId = Number(req.body?.equipmentId ?? req.body?.equipment_id);
    const latitude = Number(req.body?.latitude ?? req.body?.lat);
    const longitude = Number(req.body?.longitude ?? req.body?.lng);
    if (!Number.isFinite(equipmentId)) return res.status(400).json({ error: "equipmentId is required." });
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return res.status(400).json({ error: "latitude and longitude are required." });
    }
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ error: "Invalid latitude/longitude." });
    }

    const orderDetail = await getRentalOrder({ companyId: link.company_id, id: link.rental_order_id });
    if (!orderDetail?.order) return res.status(404).json({ error: "Rental order not found." });
    const allowedIds = new Set(collectEquipmentIdsFromLineItems(orderDetail.lineItems));
    if (!allowedIds.has(Number(equipmentId))) {
      return res.status(403).json({ error: "Unit is not assigned to this order." });
    }

    const rawLabel = String(req.body?.label || "").trim();
    const safeLabel = rawLabel || `Unit ${equipmentId}`;
    const orderLabel = orderDetail.order?.ro_number
      ? `Order ${orderDetail.order.ro_number}`
      : `Order ${orderDetail.order.id || link.rental_order_id}`;
    const stamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const locationName = `${orderLabel} - ${safeLabel} - ${stamp}`;

    const location = await createLocation({
      companyId: link.company_id,
      name: locationName,
      streetAddress: null,
      city: null,
      region: null,
      country: null,
      isBaseLocation: false,
    });
    if (!location?.id) return res.status(400).json({ error: "Unable to create location." });

    const provider = String(req.body?.provider || "manual").trim() || "manual";
    const query = req.body?.query ? String(req.body.query).trim() : null;
    const saved = await setLocationGeocode({
      companyId: link.company_id,
      id: Number(location.id),
      latitude,
      longitude,
      provider,
      query,
    });

    const beforeRows = await listEquipmentCurrentLocationIdsForIds({
      companyId: link.company_id,
      equipmentIds: [equipmentId],
    });
    const updated = await setEquipmentCurrentLocationForIds({
      companyId: link.company_id,
      equipmentIds: [equipmentId],
      currentLocationId: Number(location.id),
    });
    const cleanupIds = new Set();
    for (const row of beforeRows) {
      const beforeId = row.current_location_id ?? null;
      if (String(beforeId || "") === String(location.id || "")) continue;
      await recordEquipmentCurrentLocationChange({
        companyId: link.company_id,
        equipmentId: Number(row.id),
        fromLocationId: beforeId,
        toLocationId: Number(location.id),
      }).catch(() => null);
      if (beforeId) cleanupIds.add(Number(beforeId));
    }
    for (const oldId of cleanupIds) {
      await cleanupNonBaseLocationIfUnused({ companyId: link.company_id, locationId: oldId }).catch(() => null);
    }

    res.status(201).json({
      ok: true,
      updated,
      equipmentId: Number(equipmentId),
      location: saved || location,
    });
  })
);

app.post(
  "/api/public/customer-links/:token/submit",
  customerLinkSubmitLimiter,
  asyncHandler(async (req, res, next) => {
    const resolved = await resolveCustomerShareLink(req.params?.token);
    if (resolved.error) return res.status(404).json({ error: resolved.error });
    req.customerShareLink = resolved.link;
    req.customerShareToken = resolved.token;
    next();
  }),
  (req, res, next) => {
    customerLinkUpload.any()(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const link = req.customerShareLink;
    if (!link) return res.status(404).json({ error: "Share link not found." });
    if (link.single_use && link.used_at) {
      return res.status(409).json({ error: "This share link has already been used." });
    }

    const allowedCustomerFields = filterAllowedFields(link.allowed_fields, ALLOWED_CUSTOMER_FIELDS, Array.from(ALLOWED_CUSTOMER_FIELDS));
    const allowedOrderFields = filterAllowedFields(link.allowed_fields, ALLOWED_ORDER_FIELDS, Array.from(ALLOWED_ORDER_FIELDS));
    const allowedLineItemFields = filterAllowedFields(
      link.allowed_line_item_fields,
      ALLOWED_LINE_ITEM_FIELDS,
      Array.from(ALLOWED_LINE_ITEM_FIELDS)
    );

    const payload = parseJsonObject(req.body?.payload);
    const customerPayload = sanitizeCustomerPayload(payload.customer || {}, allowedCustomerFields);
    const allowOrderData = link.scope === "new_quote" || link.scope === "order_update" || !!link.rental_order_id;
    const orderPayload = allowOrderData ? sanitizeOrderPayload(payload.order || {}, allowedOrderFields) : {};
    const lineItemsPayload = allowOrderData ? sanitizeLineItems(payload.lineItems || [], allowedLineItemFields) : [];
    if (allowOrderData && orderPayload?.generalNotesImages) {
      orderPayload.generalNotesImages = normalizeGeneralNotesImages({
        companyId: link.company_id,
        images: orderPayload.generalNotesImages,
      });
      if (!orderPayload.generalNotesImages.length) delete orderPayload.generalNotesImages;
    }

    const needsNewCustomer =
      !link.customer_id && ["new_customer", "new_quote", "order_update"].includes(link.scope);
    if (needsNewCustomer && !customerPayload.companyName && !customerPayload.contactName) {
      return res.status(400).json({ error: "Customer name is required." });
    }
    if (allowOrderData && lineItemsPayload.length === 0) {
      return res.status(400).json({ error: "At least one line item is required." });
    }

    const signatureName = String(req.body?.signatureName || "").trim();
    const signatureDataUrl = String(req.body?.signatureData || "").trim();
    if (link.require_esignature && (!signatureName || !signatureDataUrl)) {
      return res.status(400).json({ error: "Typed name and signature are required." });
    }

    const docCategoryMap = parseJsonObject(req.body?.docCategoryMap);
    const allowedDocCategories =
      Array.isArray(link.allowed_document_categories) && link.allowed_document_categories.length
        ? link.allowed_document_categories
        : (await getCompanySettings(link.company_id)).customer_document_categories || [];

    const submissionId = req.body?.submissionId || crypto.randomUUID();
    const uploadBase = `/uploads/customer-links/link-${link.id}/submission-${submissionId}/`;
    const docs = [];
    const files = Array.isArray(req.files) ? req.files : [];
    for (const file of files) {
      const field = String(file.fieldname || "");
      if (!field.startsWith("doc_")) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
        continue;
      }
      const slug = field.slice(4);
      const category = docCategoryMap[slug] ? String(docCategoryMap[slug]) : null;
      if (!category || !allowedDocCategories.includes(category)) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
        continue;
      }
      docs.push({
        category,
        fileName: file.originalname,
        mime: file.mimetype,
        sizeBytes: file.size,
        url: `${uploadBase}${file.filename}`,
      });
    }

    let signature = null;
    let signatureForPdf = null;
    if (signatureName && signatureDataUrl) {
      const decoded = decodeDataUrlImage(signatureDataUrl);
      if (!decoded) return res.status(400).json({ error: "Invalid signature image data." });
      const sigDir = safeUploadPath("customer-links", `link-${link.id}`, `submission-${submissionId}`);
      if (!sigDir) return res.status(400).json({ error: "Invalid upload path." });
      fs.mkdirSync(sigDir, { recursive: true });
      let sigBuffer = decoded.buffer;
      let sigMime = decoded.mime || "image/png";
      let sigExt = ".png";
      if (String(sigMime).toLowerCase() !== "image/webp") {
        try {
          sigBuffer = await convertBufferToWebp(sigBuffer);
          sigMime = "image/webp";
          sigExt = ".webp";
        } catch {
          return res.status(400).json({ error: "Unable to convert signature image to WebP." });
        }
      }
      const sigFilename = `signature-${crypto.randomUUID()}${sigExt}`;
      const sigPath = path.join(sigDir, sigFilename);
      fs.writeFileSync(sigPath, sigBuffer);
      signature = {
        typedName: signatureName,
        imageUrl: `${uploadBase}${sigFilename}`,
        imageMime: sigMime,
        signedAt: new Date().toISOString(),
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] || ""),
      };
      signatureForPdf = { ...signature, imageDataUrl: signatureDataUrl };
    }

    let lineItemsForStore = [...lineItemsPayload];
    if (link.rental_order_id) {
      const existingOrder = await getRentalOrder({ companyId: link.company_id, id: link.rental_order_id });
      const existingMap = new Map();
      (existingOrder?.lineItems || []).forEach((li) => {
        existingMap.set(String(li.id), li);
      });
      lineItemsForStore = lineItemsPayload.map((li) => {
        const existing = li.lineItemId ? existingMap.get(String(li.lineItemId)) : null;
        if (
          existing &&
          (existing.rate_amount !== null || existing.line_amount !== null) &&
          Number(existing.type_id) === Number(li.typeId) &&
          Number(existing.bundle_id || 0) === Number(li.bundleId || 0)
        ) {
          return {
            ...li,
            rateBasis: existing.rate_basis || null,
            rateAmount: existing.rate_amount !== null ? Number(existing.rate_amount) : null,
            lineAmount: existing.line_amount !== null ? Number(existing.line_amount) : null,
          };
        }
        return li;
      });
    }

    const typesForPdf = await listTypes(link.company_id);
    const typeNameById = new Map((typesForPdf || []).map((t) => [String(t.id), t.name || ""]));
    const lineItemsWithNames = lineItemsForStore.map((li) => ({
      ...li,
      typeName: li.typeId ? typeNameById.get(String(li.typeId)) || null : null,
    }));

    let pendingCustomer = null;
    if (!link.customer_id && (customerPayload.companyName || customerPayload.contactName)) {
      pendingCustomer = await createCustomer({
        companyId: link.company_id,
        companyName: customerPayload.companyName || customerPayload.contactName || "New customer",
        contactName: customerPayload.contactName || null,
        streetAddress: customerPayload.streetAddress || null,
        city: customerPayload.city || null,
        region: customerPayload.region || null,
        country: customerPayload.country || null,
        postalCode: customerPayload.postalCode || null,
        email: customerPayload.email || null,
        phone: customerPayload.phone || null,
        contacts: customerPayload.contacts || null,
        accountingContacts: customerPayload.accountingContacts || null,
        isPending: true,
      });
    }

    const changeRequest = await createCustomerChangeRequest({
      companyId: link.company_id,
      customerId: pendingCustomer?.id || link.customer_id,
      rentalOrderId: link.rental_order_id,
      linkId: link.id,
      scope: link.scope,
      payload: {
        customer: customerPayload,
        order: orderPayload,
        lineItems: lineItemsWithNames,
      },
      documents: docs,
      signature: signature || {},
      sourceIp: req.ip,
      userAgent: String(req.headers["user-agent"] || ""),
    });

    const proofDir = safeUploadPath("customer-links", `link-${link.id}`, "proofs");
    if (!proofDir) return res.status(400).json({ error: "Invalid proof path." });
    fs.mkdirSync(proofDir, { recursive: true });
    const proofPath = path.join(proofDir, `change-request-${changeRequest.id}.pdf`);
    await writeCustomerChangeRequestPdf({
      filePath: proofPath,
      company: await getCompanyProfile(link.company_id),
      link,
      payload: {
        customer: customerPayload,
        order: orderPayload,
        lineItems: lineItemsWithNames,
      },
      documents: docs,
      signature: signatureForPdf || signature || {},
    });
    await updateCustomerChangeRequestStatus({
      companyId: link.company_id,
      id: changeRequest.id,
      proofPdfPath: proofPath,
    });
    await markCustomerShareLinkUsed({ linkId: link.id, ip: req.ip, userAgent: String(req.headers["user-agent"] || ""), changeRequestId: changeRequest.id });

    res.status(201).json({
      ok: true,
      changeRequestId: changeRequest.id,
      proofUrl: `/api/public/customer-links/${encodeURIComponent(req.customerShareToken)}/proof`,
    });
  })
);

app.get(
  "/api/public/customer-links/:token/proof",
  customerLinkLimiter,
  asyncHandler(async (req, res) => {
    const resolved = await resolveCustomerShareLink(req.params?.token, { allowExpired: true });
    if (resolved.error) return res.status(404).json({ error: resolved.error });
    const link = resolved.link;
    const latest = await getLatestCustomerChangeRequestForLink({ companyId: link.company_id, linkId: link.id });
    if (!latest?.proof_pdf_path) return res.status(404).json({ error: "Proof not available." });
    const pdfPath = String(latest.proof_pdf_path);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: "Proof not available." });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"customer-update-proof.pdf\"");
    fs.createReadStream(pdfPath).pipe(res);
  })
);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function normalizeSubmissionId(value) {
  const candidate = Array.isArray(value) ? value.find((v) => String(v || "").trim()) : value;
  const raw = String(candidate || "").trim();
  if (!raw) return "";

  const match = raw.match(UUID_RE);
  if (match) return match[0];
  return "";
}

function getOrCreateUploadSubmissionId(req) {
  if (req._uploadSubmissionId) return req._uploadSubmissionId;
  const normalized = normalizeSubmissionId(req.body?.submissionId);
  req._uploadSubmissionId = normalized || crypto.randomUUID();
  return req._uploadSubmissionId;
}

function normalizeCompanyId(value) {
  const cid = Number(value);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  return String(Math.trunc(cid));
}

const COMPANY_SESSION_COOKIE = "rentSoft.cu";
const CSRF_COOKIE = "rentSoft.csrf";
const CSRF_HEADER = "x-csrf-token";
const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

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

function getCompanyUserToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (tokenFromHeader) return { token: tokenFromHeader, source: "header" };
  const cookies = parseCookies(req);
  const cookieToken = String(cookies[COMPANY_SESSION_COOKIE] || "").trim();
  if (cookieToken) return { token: cookieToken, source: "cookie" };
  return { token: "", source: "none" };
}

function readCompanyUserToken(req) {
  return getCompanyUserToken(req).token;
}

function readHeaderValue(value) {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : "";
  if (value === undefined || value === null) return "";
  return String(value);
}

function base64Url(bytes) {
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

let warnedInsecureCookie = false;

function resolveCookieSecure() {
  const envValue = String(process.env.COOKIE_SECURE || "").trim().toLowerCase();
  const isProduction = String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
  let secure = envValue === "true";
  if (!secure && isProduction) {
    if (!warnedInsecureCookie) {
      console.warn("COOKIE_SECURE is not true in production; forcing Secure on cookies.");
      warnedInsecureCookie = true;
    }
    secure = true;
  }
  return secure;
}

function buildCookie({ name, value, maxAgeMs, httpOnly = false }) {
  const parts = [`${name}=${encodeURIComponent(value || "")}`, "Path=/", "SameSite=Lax"];
  if (httpOnly) parts.push("HttpOnly");
  if (Number.isFinite(Number(maxAgeMs))) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(maxAgeMs) / 1000))}`);
  }
  const secure = resolveCookieSecure();
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, value) {
  const existing = res.getHeader("Set-Cookie");
  if (!existing) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  const combined = Array.isArray(existing) ? existing.concat(value) : [String(existing), value];
  res.setHeader("Set-Cookie", combined);
}

function setCsrfCookie(res, token, maxAgeMs) {
  const cookie = buildCookie({ name: CSRF_COOKIE, value: token, maxAgeMs, httpOnly: false });
  appendSetCookie(res, cookie);
}

function ensureCsrfCookie(req, res, maxAgeMs = DEFAULT_SESSION_MAX_AGE_MS) {
  const cookies = parseCookies(req);
  const sessionToken = String(cookies[COMPANY_SESSION_COOKIE] || "").trim();
  if (!sessionToken) return;
  const existing = String(cookies[CSRF_COOKIE] || "").trim();
  if (existing) return;
  const token = base64Url(crypto.randomBytes(32));
  setCsrfCookie(res, token, maxAgeMs);
}

function setCompanySessionCookie(res, token, maxAgeMs) {
  const raw = String(token || "").trim();
  const maxAge = Number.isFinite(Number(maxAgeMs)) ? Number(maxAgeMs) : DEFAULT_SESSION_MAX_AGE_MS;
  const sessionCookie = buildCookie({ name: COMPANY_SESSION_COOKIE, value: raw, maxAgeMs: maxAge, httpOnly: true });
  appendSetCookie(res, sessionCookie);
  const csrfToken = base64Url(crypto.randomBytes(32));
  setCsrfCookie(res, csrfToken, maxAge);
}

function clearCompanySessionCookie(res) {
  const sessionCookie = buildCookie({ name: COMPANY_SESSION_COOKIE, value: "", maxAgeMs: 0, httpOnly: true });
  const csrfCookie = buildCookie({ name: CSRF_COOKIE, value: "", maxAgeMs: 0, httpOnly: false });
  appendSetCookie(res, sessionCookie);
  appendSetCookie(res, csrfCookie);
}

async function requireCompanyUserAuth(req, res, next) {
  const { token, source } = getCompanyUserToken(req);
  if (!token) return res.status(401).json({ error: "Login required." });
  const session = await getCompanyUserByToken(token);
  if (!session) return res.status(401).json({ error: "Login required." });

  req.auth = {
    token,
    tokenSource: source,
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

function getApiPath(req) {
  return `${req.baseUrl || ""}${req.path || ""}`;
}

const CUSTOMER_SHARE_SCOPES = new Set(["new_customer", "customer_update", "new_quote", "order_update"]);
const ALLOWED_CUSTOMER_FIELDS = new Set([
  "companyName",
  "contactName",
  "email",
  "phone",
  "contacts",
  "accountingContacts",
  "streetAddress",
  "city",
  "region",
  "postalCode",
  "country",
]);
const ALLOWED_ORDER_FIELDS = new Set([
  "customerPo",
  "fulfillmentMethod",
  "dropoffAddress",
  "siteName",
  "siteAddress",
  "siteAccessInfo",
  "siteAddressLat",
  "siteAddressLng",
  "siteAddressQuery",
  "logisticsInstructions",
  "specialInstructions",
  "criticalAreas",
  "notificationCircumstances",
  "coverageHours",
  "coverageTimeZone",
  "emergencyContacts",
  "siteContacts",
  "generalNotes",
  "generalNotesImages",
]);
const ALLOWED_LINE_ITEM_FIELDS = new Set(["lineItemId", "typeId", "bundleId", "startAt", "endAt"]);

function normalizeCustomerShareScope(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (CUSTOMER_SHARE_SCOPES.has(raw)) return raw;
  return "customer_update";
}

function normalizeStringArray(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : value && typeof value === "object"
        ? value
        : [];
  return Array.from(new Set(raw.map((v) => String(v || "").trim()).filter(Boolean)));
}

function filterAllowedFields(values, allowedSet, fallback) {
  const arr = normalizeStringArray(values);
  const filtered = arr.filter((v) => allowedSet.has(v));
  if (filtered.length) return filtered;
  return fallback;
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonCoverage(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return parsed && typeof parsed === "object" ? parsed : [];
  } catch {
    return [];
  }
}

function hashShareToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function decodeDataUrlImage(dataUrl) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) return null;
    return { mime: match[1], buffer };
  } catch {
    return null;
  }
}

function stripHtml(value) {
  const raw = String(value ?? "");
  if (!raw.trim()) return "";
  const withBreaks = raw
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n");
  return withBreaks
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function writeCustomerChangeRequestPdf({ filePath, company, link, payload, documents, signature }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.on("error", reject);
      stream.on("error", reject);
      stream.on("finish", resolve);

      doc.pipe(stream);
      doc.fontSize(18).text("Customer Update Submission", { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).text(`Company: ${company?.name || "Unknown"}`);
      doc.text(`Link scope: ${link?.scope || "--"}`);
      doc.text(`Submitted: ${new Date().toLocaleString()}`);
      doc.moveDown();

      const customer = payload?.customer || {};
      if (Object.keys(customer).length) {
        doc.fontSize(14).text("Customer");
        doc.fontSize(10);
        doc.text(`Company: ${customer.companyName || "--"}`);
        doc.text(`Contact: ${customer.contactName || "--"}`);
        doc.text(`Email: ${customer.email || "--"}`);
        doc.text(`Phone: ${customer.phone || "--"}`);
        const address = [customer.streetAddress, customer.city, customer.region, customer.postalCode, customer.country]
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .join(", ");
        doc.text(`Address: ${address || "--"}`);
        doc.moveDown();
      }

      const order = payload?.order || {};
      if (Object.keys(order).length) {
        doc.fontSize(14).text("Rental / Quote");
        doc.fontSize(10);
        doc.text(`Customer PO: ${order.customerPo || "--"}`);
        doc.text(`Fulfillment: ${order.fulfillmentMethod || "--"}`);
        doc.text(`Site address: ${order.siteAddress || "--"}`);
        doc.text(`Site access information / pin: ${order.siteAccessInfo || "--"}`);
        doc.text(`Dropoff address: ${order.dropoffAddress || "--"}`);
        doc.text(`General notes: ${stripHtml(order.generalNotes || "--")}`);
        const generalNotesImages = Array.isArray(order.generalNotesImages) ? order.generalNotesImages : [];
        if (generalNotesImages.length) {
          doc.text(`General notes images: ${generalNotesImages.length}`);
          generalNotesImages.slice(0, 10).forEach((img) => {
            const label = img?.fileName || img?.file_name || img?.name || img?.url || "Image";
            doc.text(`- ${label}`);
          });
          if (generalNotesImages.length > 10) {
            doc.text(`- +${generalNotesImages.length - 10} more`);
          }
        }
        doc.moveDown();
      }

      const lineItems = Array.isArray(payload?.lineItems) ? payload.lineItems : [];
      if (lineItems.length) {
        doc.fontSize(14).text("Line Items");
        doc.fontSize(10);
        lineItems.forEach((li, idx) => {
          doc.text(
            `${idx + 1}. Type: ${li.typeName || li.typeId || "--"} | Start: ${li.startAt || "--"} | End: ${li.endAt || "--"}`
          );
          if (li.rateAmount !== null && li.rateAmount !== undefined) {
            doc.text(`   Rate: ${li.rateBasis || "--"} @ ${li.rateAmount}`);
          }
          if (li.lineAmount !== null && li.lineAmount !== undefined) {
            doc.text(`   Line amount: ${li.lineAmount}`);
          }
        });
        doc.moveDown();
      }

      if (Array.isArray(documents) && documents.length) {
        doc.fontSize(14).text("Documents");
        doc.fontSize(10);
        documents.forEach((d) => {
          doc.text(`- ${d.category || "Document"}: ${d.fileName || d.file_name || "--"}`);
        });
        doc.moveDown();
      }

      if (signature && signature.typedName) {
        doc.fontSize(14).text("Signature");
        doc.fontSize(10).text(`Signed by: ${signature.typedName}`);
        if (signature.signedAt) doc.text(`Signed at: ${new Date(signature.signedAt).toLocaleString()}`);
        const decoded = decodeDataUrlImage(signature.imageDataUrl || signature.imageData || "");
        if (decoded) {
          try {
            doc.moveDown(0.5);
            doc.image(decoded.buffer, { width: 220 });
          } catch {
            // Ignore signature image failures.
          }
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function resolveCustomerShareLink(token, { allowExpired = false } = {}) {
  const clean = String(token || "").trim();
  if (!clean) return { error: "Share link token is required." };
  const hashed = hashShareToken(clean);
  const link = await getCustomerShareLinkByHash(hashed);
  if (!link) return { error: "Share link not found." };
  if (link.revoked_at) return { error: "This share link has been revoked." };
  if (!allowExpired && link.expires_at && Date.parse(link.expires_at) <= Date.now()) {
    return { error: "This share link has expired." };
  }
  return { link, token: clean };
}

function sanitizeCustomerPayload(input, allowedFields) {
  const src = input && typeof input === "object" ? input : {};
  const read = (k) => (allowedFields.includes(k) ? String(src[k] || "").trim() : "");
  const out = {};
  if (allowedFields.includes("companyName")) out.companyName = read("companyName") || null;
  if (allowedFields.includes("contactName")) out.contactName = read("contactName") || null;
  if (allowedFields.includes("email")) out.email = read("email") || null;
  if (allowedFields.includes("phone")) out.phone = read("phone") || null;
  if (allowedFields.includes("contacts")) {
    const normalized = parseJsonArray(src.contacts)
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const name = String(entry.name || entry.contactName || entry.contact_name || "").trim();
        const email = String(entry.email || "").trim();
        const phone = String(entry.phone || "").trim();
        if (!name && !email && !phone) return null;
        return { name, email, phone };
      })
      .filter(Boolean);
    if (normalized.length) out.contacts = normalized;
  }
  if (allowedFields.includes("accountingContacts")) {
    const normalized = parseJsonArray(src.accountingContacts)
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const name = String(entry.name || entry.contactName || entry.contact_name || "").trim();
        const email = String(entry.email || "").trim();
        const phone = String(entry.phone || "").trim();
        if (!name && !email && !phone) return null;
        return { name, email, phone };
      })
      .filter(Boolean);
    if (normalized.length) out.accountingContacts = normalized;
  }
  if (allowedFields.includes("streetAddress")) out.streetAddress = read("streetAddress") || null;
  if (allowedFields.includes("city")) out.city = read("city") || null;
  if (allowedFields.includes("region")) out.region = read("region") || null;
  if (allowedFields.includes("postalCode")) out.postalCode = read("postalCode") || null;
  if (allowedFields.includes("country")) out.country = read("country") || null;
  return out;
}

function sanitizeOrderPayload(input, allowedFields) {
  const src = input && typeof input === "object" ? input : {};
  const read = (k) => (allowedFields.includes(k) ? String(src[k] || "").trim() : "");
  const out = {};
  if (allowedFields.includes("customerPo")) out.customerPo = read("customerPo") || null;
  if (allowedFields.includes("fulfillmentMethod")) {
    const method = read("fulfillmentMethod").toLowerCase();
    out.fulfillmentMethod = method === "dropoff" ? "dropoff" : "pickup";
  }
  if (allowedFields.includes("dropoffAddress")) out.dropoffAddress = read("dropoffAddress") || null;
  if (allowedFields.includes("siteName")) out.siteName = read("siteName") || null;
  if (allowedFields.includes("siteAddress")) out.siteAddress = read("siteAddress") || null;
  if (allowedFields.includes("siteAccessInfo")) out.siteAccessInfo = read("siteAccessInfo") || null;
  if (allowedFields.includes("siteAddressLat")) {
    const lat = Number(src.siteAddressLat);
    if (Number.isFinite(lat)) out.siteAddressLat = lat;
  }
  if (allowedFields.includes("siteAddressLng")) {
    const lng = Number(src.siteAddressLng);
    if (Number.isFinite(lng)) out.siteAddressLng = lng;
  }
  if (allowedFields.includes("siteAddressQuery")) out.siteAddressQuery = read("siteAddressQuery") || null;
  if (allowedFields.includes("logisticsInstructions")) out.logisticsInstructions = read("logisticsInstructions") || null;
  if (allowedFields.includes("specialInstructions")) out.specialInstructions = read("specialInstructions") || null;
  if (allowedFields.includes("criticalAreas")) out.criticalAreas = read("criticalAreas") || null;
  if (allowedFields.includes("generalNotes")) out.generalNotes = read("generalNotes") || null;
  if (allowedFields.includes("generalNotesImages") || allowedFields.includes("generalNotes")) {
    const images = parseJsonArray(src.generalNotesImages);
    if (images.length) out.generalNotesImages = images;
  }
  if (allowedFields.includes("notificationCircumstances")) out.notificationCircumstances = parseJsonArray(src.notificationCircumstances);
  if (allowedFields.includes("coverageHours")) out.coverageHours = parseJsonCoverage(src.coverageHours);
  if (allowedFields.includes("coverageTimeZone")) out.coverageTimeZone = read("coverageTimeZone") || null;
  if (allowedFields.includes("emergencyContacts")) out.emergencyContacts = parseJsonArray(src.emergencyContacts);
  if (allowedFields.includes("siteContacts")) out.siteContacts = parseJsonArray(src.siteContacts);
  return out;
}

function normalizeGeneralNotesImages({ companyId, images } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  const list = Array.isArray(images) ? images : [];
  const prefix = `/uploads/company-${cid}/`;
  return list
    .map((entry) => {
      if (!entry) return null;
      const url = String(entry.url || entry.src || "").trim();
      if (!url || !url.startsWith(prefix)) return null;
      const fileName = String(entry.fileName || entry.name || "General notes image").trim() || "General notes image";
      const mime = entry.mime ? String(entry.mime) : entry.type ? String(entry.type) : null;
      const sizeBytes =
        entry.sizeBytes === null || entry.sizeBytes === undefined
          ? entry.size === null || entry.size === undefined
            ? null
            : Number(entry.size)
          : Number(entry.sizeBytes);
      return {
        fileName,
        mime: mime || null,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        url,
        category: "general_notes",
      };
    })
    .filter(Boolean);
}

function sanitizeLineItems(input, allowedFields) {
  const items = Array.isArray(input) ? input : [];
  const out = [];
  items.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    const next = {};
    if (allowedFields.includes("lineItemId") && raw.lineItemId) {
      const liId = Number(raw.lineItemId);
      if (Number.isFinite(liId)) next.lineItemId = liId;
    }
    if (allowedFields.includes("typeId") && raw.typeId) {
      const typeId = Number(raw.typeId);
      if (Number.isFinite(typeId)) next.typeId = typeId;
    }
    if (allowedFields.includes("bundleId") && raw.bundleId) {
      const bundleId = Number(raw.bundleId);
      if (Number.isFinite(bundleId)) next.bundleId = bundleId;
    }
    if (allowedFields.includes("startAt")) next.startAt = String(raw.startAt || "").trim();
    if (allowedFields.includes("endAt")) next.endAt = String(raw.endAt || "").trim();
    if (!next.typeId && !next.bundleId) return;
    if (!next.startAt || !next.endAt) return;
    out.push(next);
  });
  return out;
}

function isDemandOnlyStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return ["quote", "quote_rejected", "reservation", "requested"].includes(normalized);
}

function mergeCustomerPayload(existing, updates) {
  const next = { ...(existing || {}) };
  Object.entries(updates || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null || value === "") return;
    next[key] = value;
  });
  return next;
}

function mergeOrderPayload(existing, updates) {
  const next = { ...(existing || {}) };
  Object.entries(updates || {}).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null || value === "" || (typeof value === "number" && !Number.isFinite(value))) return;
    next[key] = value;
  });
  return next;
}

function mergeLineItemsWithExisting(existingItems, requestedItems) {
  const map = new Map();
  (existingItems || []).forEach((li) => {
    map.set(String(li.id), li);
  });
  return (requestedItems || []).map((li) => {
    const existing = li.lineItemId ? map.get(String(li.lineItemId)) : null;
    const typeId = li.typeId ? Number(li.typeId) : null;
    const bundleId = li.bundleId ? Number(li.bundleId) : null;
    const next = {
      typeId,
      bundleId,
      startAt: li.startAt,
      endAt: li.endAt,
    };
    if (
      existing &&
      Number(existing.type_id) === Number(typeId) &&
      Number(existing.bundle_id || 0) === Number(bundleId || 0)
    ) {
      next.rateBasis = existing.rate_basis || null;
      next.rateAmount = existing.rate_amount !== null ? Number(existing.rate_amount) : null;
      next.billableUnits = existing.billable_units !== null ? Number(existing.billable_units) : null;
      next.lineAmount = existing.line_amount !== null ? Number(existing.line_amount) : null;
    }
    return next;
  });
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

function normalizeSiteAddressValue(siteAddress, siteAddressQuery) {
  return normalizeWhitespace(siteAddressQuery || siteAddress || "");
}

function siteAddressLocationName(orderId) {
  const id = Number(orderId);
  return Number.isFinite(id) ? `Order ${id} - Site` : "Order Site";
}

async function ensureSiteAddressLocation({
  companyId,
  orderId,
  siteAddress,
  siteAddressLat,
  siteAddressLng,
  siteAddressQuery,
}) {
  const addr = normalizeSiteAddressValue(siteAddress, siteAddressQuery);
  const lat = Number(siteAddressLat);
  const lng = Number(siteAddressLng);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  if (!addr && !hasCoords) return null;

  const name = siteAddressLocationName(orderId);
  const created = await createLocation({
    companyId,
    name,
    streetAddress: addr || null,
    city: null,
    region: null,
    country: null,
    isBaseLocation: false,
  });
  if (!created?.id) return null;

  let saved = created;
  if (hasCoords) {
    const updated = await setLocationGeocode({
      companyId,
      id: Number(created.id),
      latitude: lat,
      longitude: lng,
      provider: "site_address",
      query: addr || null,
    });
    if (updated) saved = updated;
  } else if (addr) {
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
      if (updated) saved = updated;
    }
  }

  return saved;
}

function collectEquipmentIdsFromLineItems(lineItems) {
  const ids = new Set();
  (Array.isArray(lineItems) ? lineItems : []).forEach((li) => {
    const list = Array.isArray(li?.inventoryIds)
      ? li.inventoryIds
      : Array.isArray(li?.inventory_ids)
        ? li.inventory_ids
        : [];
    list.forEach((id) => {
      const num = Number(id);
      if (Number.isFinite(num)) ids.add(num);
    });
  });
  return Array.from(ids);
}

async function listCustomerLinkUnitSnapshots({ companyId, equipmentIds }) {
  const cid = Number(companyId);
  const ids = Array.isArray(equipmentIds)
    ? equipmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  if (!Number.isFinite(cid) || !ids.length) return [];
  const res = await pool.query(
    `
    SELECT e.id,
           e.model_name,
           e.serial_number,
           cl.name AS current_location,
           cl.latitude AS current_location_latitude,
           cl.longitude AS current_location_longitude
      FROM equipment e
 LEFT JOIN locations cl ON cl.id = e.current_location_id
     WHERE e.company_id = $1
       AND e.id = ANY($2::int[])
     ORDER BY e.id
    `,
    [cid, ids]
  );
  return res.rows || [];
}

async function updateEquipmentCurrentLocationFromSiteAddress({
  companyId,
  orderId,
  lineItems,
  siteAddress,
  siteAddressLat,
  siteAddressLng,
  siteAddressQuery,
}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid)) return { ok: true, updated: 0 };

  let items = Array.isArray(lineItems) ? lineItems : [];
  let addr = siteAddress || null;
  let lat = siteAddressLat;
  let lng = siteAddressLng;
  let query = siteAddressQuery || null;
  if (orderId) {
    const detail = await getRentalOrder({ companyId: cid, id: Number(orderId) }).catch(() => null);
    if (detail?.order) {
      addr = detail.order.site_address || detail.order.siteAddress || addr;
      lat = detail.order.site_address_lat ?? detail.order.siteAddressLat ?? lat;
      lng = detail.order.site_address_lng ?? detail.order.siteAddressLng ?? lng;
      query = detail.order.site_address_query ?? detail.order.siteAddressQuery ?? query;
    }
    if (!items.length && Array.isArray(detail?.lineItems)) items = detail.lineItems;
  }

  const equipmentIds = collectEquipmentIdsFromLineItems(items);
  if (!equipmentIds.length) return { ok: true, updated: 0 };

  const loc = await ensureSiteAddressLocation({
    companyId: cid,
    orderId,
    siteAddress: addr,
    siteAddressLat: lat,
    siteAddressLng: lng,
    siteAddressQuery: query,
  });
  if (!loc?.id) return { ok: true, updated: 0 };

  const beforeRows = await listEquipmentLocationIdsForIds({ companyId: cid, equipmentIds });
  const targetIds = beforeRows
    .filter((row) => row.current_location_id === null || String(row.current_location_id || "") === String(row.location_id || ""))
    .map((row) => Number(row.id));
  if (!targetIds.length) return { ok: true, updated: 0, locationId: Number(loc.id) };

  const updated = await setEquipmentCurrentLocationForIds({
    companyId: cid,
    equipmentIds: targetIds,
    currentLocationId: Number(loc.id),
  });

  const targetSet = new Set(targetIds.map((id) => String(id)));
  const cleanupIds = new Set();
  for (const row of beforeRows) {
    if (!targetSet.has(String(row.id))) continue;
    const beforeId = row.current_location_id ?? null;
    if (String(beforeId || "") === String(loc.id || "")) continue;
    await recordEquipmentCurrentLocationChange({
      companyId: cid,
      equipmentId: Number(row.id),
      fromLocationId: beforeId,
      toLocationId: Number(loc.id),
    }).catch(() => null);
    if (beforeId) cleanupIds.add(Number(beforeId));
  }
  for (const oldId of cleanupIds) {
    await cleanupNonBaseLocationIfUnused({ companyId: cid, locationId: oldId }).catch(() => null);
  }

  return { ok: true, updated, locationId: Number(loc.id) };
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeModelKey(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeTimeValue(raw, warnings) {
  const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (hour === 24 && minute === 0) {
    if (warnings) warnings.push('Converted "24:00" to "23:59" for time inputs.');
    return "23:59";
  }
  if (hour < 0 || hour > 23) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseCoverageHours(raw, warnings) {
  const value = String(raw || "").trim();
  if (!value) return {};
  const cleaned = value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return {};
  const dayMap = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };
  const dayOrder = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const slots = [];
  const segments = cleaned.split(";").map((seg) => seg.trim()).filter(Boolean);

  for (const segment of segments) {
    const match = segment.match(
      /(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)(?:\s*-\s*(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i
    );
    if (!match) continue;
    const startDay = dayMap[match[1].toLowerCase()];
    const endDay = match[2] ? dayMap[match[2].toLowerCase()] : startDay;
    const startTime = normalizeTimeValue(match[3], warnings);
    const endTime = normalizeTimeValue(match[4], warnings);
    if (!startDay || !endDay || !startTime || !endTime) continue;
    const startIdx = dayOrder.indexOf(startDay);
    const endIdx = dayOrder.indexOf(endDay);
    if (startIdx === -1 || endIdx === -1) continue;
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const endDayOffset =
      startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes ? 1 : 0;

    const days = [];
    if (startIdx <= endIdx) {
      for (let i = startIdx; i <= endIdx; i += 1) days.push(dayOrder[i]);
    } else {
      for (let i = startIdx; i < dayOrder.length; i += 1) days.push(dayOrder[i]);
      for (let i = 0; i <= endIdx; i += 1) days.push(dayOrder[i]);
    }
    days.forEach((day) => {
      const idx = dayOrder.indexOf(day);
      const endDay = endDayOffset ? dayOrder[(idx + 1) % dayOrder.length] : day;
      slots.push({ startDay: day, startTime, endDay, endTime });
    });
  }

  return slots;
}

function extractContactBlocks(raw) {
  const text = String(raw || "");
  if (!text.includes("[") || !text.includes("]")) return { contacts: [], remainder: text.trim() };
  const contacts = [];
  let remainder = text;
  const matches = [...text.matchAll(/\[([^\]]+)\]/g)];
  matches.forEach((match) => {
    const content = match[1] || "";
    if (!content.includes(";")) return;
    const parts = content.split(";").map((v) => normalizeWhitespace(v));
    const name = parts[0] || "";
    const email = parts[1] || "";
    const phone = parts[2] || "";
    if (!name && !email && !phone) return;
    contacts.push({ name, email, phone });
    remainder = remainder.replace(match[0], " ");
  });
  remainder = remainder.replace(/[\s,;]+/g, " ").trim();
  return { contacts, remainder };
}

function contactKey(entry) {
  return [entry?.name, entry?.email, entry?.phone].map((v) => normalizeWhitespace(v).toLowerCase()).join("|");
}

function parseContactTriples(text) {
  const matches = [...String(text || "").matchAll(/([^;\[\]]+?)\s*;\s*([^;\[\]]*?)\s*;\s*([^\],]+?)(?=,|\]|$)/g)];
  return matches
    .map((m) => ({
      name: normalizeWhitespace(m[1]),
      email: normalizeWhitespace(m[2]),
      phone: normalizeWhitespace(m[3]),
    }))
    .filter((c) => c.name || c.email || c.phone);
}

function parseContactList(raw) {
  const text = String(raw || "").trim();
  if (!text) return { contacts: [], remainder: "" };
  const contacts = [];
  let remainder = text;
  const matches = [...text.matchAll(/\[([^\]]+)\]/g)];
  if (matches.length) {
    matches.forEach((match) => {
      const block = match[1] || "";
      const blockContacts = parseContactTriples(block);
      blockContacts.forEach((c) => contacts.push(c));
      remainder = remainder.replace(match[0], " ");
    });
    remainder = remainder.replace(/[\s,;]+/g, " ").trim();
    if (contacts.length) return { contacts, remainder };
  }

  const fallbackContacts = parseContactTriples(text);
  if (fallbackContacts.length) return { contacts: fallbackContacts, remainder: "" };
  return { contacts: [], remainder: text };
}

function parseLatLngCandidate(value) {
  const match = String(value || "")
    .trim()
    .match(/(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function extractLatLngFromMapsUrl(rawUrl) {
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const href = url.href;
  const atMatch = href.match(/@(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (atMatch) {
    return parseLatLngCandidate(`${atMatch[1]},${atMatch[2]}`);
  }
  const dMatch = href.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (dMatch) {
    return parseLatLngCandidate(`${dMatch[1]},${dMatch[2]}`);
  }
  const paramCandidates = ["q", "query", "ll", "center"];
  for (const key of paramCandidates) {
    const val = url.searchParams.get(key);
    if (!val) continue;
    const coords = parseLatLngCandidate(val);
    if (coords) return coords;
  }
  return null;
}

function extractMapsLabelFromUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const placeIdx = parts.findIndex((p) => p.toLowerCase() === "place");
    if (placeIdx !== -1 && parts[placeIdx + 1]) {
      return decodeURIComponent(parts[placeIdx + 1]).replace(/\+/g, " ");
    }
    return "";
  } catch {
    return "";
  }
}

async function resolveMapsUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return { resolved: url };
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { resolved: url };
  }
  const host = parsed.hostname.toLowerCase();
  const isShort =
    host.endsWith("maps.app.goo.gl") ||
    host.endsWith("goo.gl") ||
    (host.endsWith("google.com") && parsed.pathname.startsWith("/maps") && parsed.pathname.includes("/short"));
  if (!isShort) return { resolved: url };
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000) });
    res.body?.cancel?.();
    return { resolved: res.url || url };
  } catch {
    return { resolved: url, error: "Unable to resolve short maps URL." };
  }
}

async function resolveMapPin(rawValue, warnings) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;
  const direct = parseLatLngCandidate(raw);
  if (direct) return { ...direct, provider: "manual", query: raw, label: raw };

  const isUrl = /^https?:\/\//i.test(raw);
  const target = isUrl ? (await resolveMapsUrl(raw)).resolved : raw;
  const coords = extractLatLngFromMapsUrl(target);
  if (coords) {
    return { ...coords, provider: "maps_url", query: target, label: extractMapsLabelFromUrl(target) || raw };
  }
  if (isUrl) {
    if (warnings) warnings.push("Maps URL did not include coordinates; using geocode fallback if possible.");
  }
  let fallbackQuery = target;
  if (isUrl) {
    try {
      const parsed = new URL(target);
      const q = parsed.searchParams.get("q") || parsed.searchParams.get("query");
      fallbackQuery = q || "";
    } catch {
      fallbackQuery = "";
    }
  }
  if (!fallbackQuery) return null;
  const geo = await geocodeWithNominatim(fallbackQuery);
  if (geo?.latitude && geo?.longitude) {
    return { lat: geo.latitude, lng: geo.longitude, provider: geo.provider, query: geo.query, label: fallbackQuery };
  }
  return null;
}

function findLocationByCoords(locations, lat, lng) {
  const tol = 1e-6;
  return (locations || []).find((loc) => {
    const lLat = Number(loc?.latitude);
    const lLng = Number(loc?.longitude);
    if (!Number.isFinite(lLat) || !Number.isFinite(lLng)) return false;
    return Math.abs(lLat - lat) <= tol && Math.abs(lLng - lng) <= tol;
  });
}

async function ensureCurrentLocationFromMap({ companyId, modelName, mapPin, locationsCache, existingNames }) {
  if (!mapPin || !Number.isFinite(mapPin.lat) || !Number.isFinite(mapPin.lng)) return { location: null, created: false };
  const existing = findLocationByCoords(locationsCache, mapPin.lat, mapPin.lng);
  if (existing?.id) return { location: existing, created: false };

  const baseLabel = normalizeWhitespace(mapPin.label || modelName || "Pinned location");
  const trimmed = baseLabel.length > 64 ? `${baseLabel.slice(0, 61)}...` : baseLabel;
  const name = buildUniqueLocationName(existingNames, `Current - ${trimmed}`);
  const created = await createLocation({
    companyId,
    name,
    streetAddress: null,
    city: null,
    region: null,
    country: null,
    isBaseLocation: false,
  });
  if (!created?.id) return { location: null, created: false };
  const updated = await setLocationGeocode({
    companyId,
    id: Number(created.id),
    latitude: mapPin.lat,
    longitude: mapPin.lng,
    provider: mapPin.provider || "maps_url",
    query: mapPin.query || null,
  });
  const finalLoc = updated || created;
  locationsCache.push(finalLoc);
  existingNames.add(String(finalLoc.name || ""));
  return { location: finalLoc, created: true };
}

async function importRentalOrderRentalInfoFromText({ companyId, text }) {
  const result = {
    rowsTotal: 0,
    rowsParsed: 0,
    rowsSkippedMissingModel: 0,
    assetsMatched: 0,
    assetsMissing: 0,
    assetsNotOut: 0,
    ordersUpdated: 0,
    ordersSkipped: 0,
    equipmentLocationsUpdated: 0,
    locationsCreated: 0,
    warnings: [],
    errors: [],
  };
  if (!companyId) throw new Error("companyId is required.");
  if (!text) return result;

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  result.rowsTotal = Math.max(0, rows.length - 1);
  if (rows.length < 2) return result;

  const header = rows[0].map((h) => normalizeHeaderKey(h));
  const indexByKey = new Map();
  header.forEach((name, idx) => {
    if (name) indexByKey.set(name, idx);
  });

  const getIndex = (aliases) => {
    for (const alias of aliases) {
      const idx = indexByKey.get(alias);
      if (idx !== undefined) return idx;
    }
    return undefined;
  };

  const idxModelName = getIndex(["model_name", "model", "modelname", "unit", "asset", "equipment"]);
  if (idxModelName === undefined) {
    result.errors.push("Missing required column: model_name.");
    return result;
  }

  const idxSiteAddress = getIndex(["client_address", "site_address", "siteaddress", "site_location", "address"]);
  const idxCurrentAddress = getIndex([
    "current_address",
    "current_location",
    "currentlocation",
    "map_url",
    "maps_url",
    "map",
  ]);
  const idxGeneralNotes = getIndex(["general_notes", "generalnotes", "notes", "note"]);
  const idxMonitoring = getIndex(["monitoring_times", "monitoring", "coverage", "coverage_hours", "coveragehours"]);
  const idxEmergency = getIndex(["emergency_contacts", "emergency_contact", "emergency", "emergencycontacts"]);
  const idxSiteContacts = getIndex(["site_contacts", "site_contact", "sitecontacts"]);

  const hasSiteAddress = idxSiteAddress !== undefined;
  const hasGeneralNotes = idxGeneralNotes !== undefined;
  const hasMonitoring = idxMonitoring !== undefined;
  let hasEmergencyContacts = idxEmergency !== undefined;
  const hasSiteContacts = idxSiteContacts !== undefined;

  const getCell = (row, idx) => {
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  };

  const rowsData = [];
  rows.slice(1).forEach((row, i) => {
    const modelName = getCell(row, idxModelName);
    if (!modelName) {
      result.rowsSkippedMissingModel += 1;
      return;
    }

    const siteAddress = hasSiteAddress ? getCell(row, idxSiteAddress) : "";
    const currentAddress = idxCurrentAddress !== undefined ? getCell(row, idxCurrentAddress) : "";
    const monitoringTimes = hasMonitoring ? getCell(row, idxMonitoring) : "";

    const notesRaw = hasGeneralNotes ? String(row[idxGeneralNotes] ?? "").trim() : "";
    const emergencyRaw = idxEmergency !== undefined ? String(row[idxEmergency] ?? "").trim() : "";
    const siteContactsRaw = idxSiteContacts !== undefined ? String(row[idxSiteContacts] ?? "").trim() : "";

    let emergencyContacts = [];
    const generalNotes = notesRaw;
    if (emergencyRaw) {
      const parsed = parseContactList(emergencyRaw);
      emergencyContacts = parsed.contacts;
    }

    let siteContacts = [];
    if (siteContactsRaw) {
      const parsed = parseContactList(siteContactsRaw);
      siteContacts = parsed.contacts;
    }

    const coverageWarnings = [];
    const coverageHours = monitoringTimes ? parseCoverageHours(monitoringTimes, coverageWarnings) : [];
    coverageWarnings.forEach((w) => {
      if (result.warnings.length < 50) result.warnings.push(`${modelName}: ${w}`);
    });

    rowsData.push({
      rowNumber: i + 2,
      modelName,
      modelKey: normalizeModelKey(modelName),
      siteAddress,
      currentAddress,
      generalNotes,
      monitoringTimes,
      coverageHours,
      emergencyContacts,
      siteContacts,
    });
    result.rowsParsed += 1;
  });

  if (!rowsData.length) return result;

  const equipmentRes = await pool.query(`SELECT id, model_name FROM equipment WHERE company_id = $1`, [companyId]);
  const equipmentByModel = new Map();
  equipmentRes.rows.forEach((row) => {
    const key = normalizeModelKey(row.model_name);
    if (!equipmentByModel.has(key)) equipmentByModel.set(key, []);
    equipmentByModel.get(key).push(Number(row.id));
  });

  const allEquipmentIds = new Set();
  rowsData.forEach((row) => {
    const ids = equipmentByModel.get(row.modelKey) || [];
    if (!ids.length) {
      result.assetsMissing += 1;
      if (result.warnings.length < 50) {
        result.warnings.push(`Row ${row.rowNumber}: no equipment found for model "${row.modelName}".`);
      }
      return;
    }
    if (ids.length > 1 && result.warnings.length < 50) {
      result.warnings.push(`Row ${row.rowNumber}: multiple equipment records found for model "${row.modelName}".`);
    }
    result.assetsMatched += ids.length;
    ids.forEach((id) => allEquipmentIds.add(id));
  });

  const equipmentIds = Array.from(allEquipmentIds);
  const outOrdersByEquipment = new Map();
  if (equipmentIds.length) {
    const outRes = await pool.query(
      `
      SELECT liv.equipment_id, ro.id AS order_id
        FROM rental_order_line_inventory liv
        JOIN rental_order_line_items li ON li.id = liv.line_item_id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
       WHERE ro.company_id = $1
         AND liv.equipment_id = ANY($2::int[])
         AND li.fulfilled_at IS NOT NULL
         AND li.returned_at IS NULL
      `,
      [companyId, equipmentIds]
    );
    outRes.rows.forEach((row) => {
      const eqId = Number(row.equipment_id);
      const orderId = Number(row.order_id);
      if (!outOrdersByEquipment.has(eqId)) outOrdersByEquipment.set(eqId, new Set());
      outOrdersByEquipment.get(eqId).add(orderId);
    });
  }

  const orderBuckets = new Map();
  const equipmentLocationInputs = new Map();

  rowsData.forEach((row) => {
    const ids = equipmentByModel.get(row.modelKey) || [];
    ids.forEach((equipmentId) => {
      const orderIds = outOrdersByEquipment.get(equipmentId);
      if (!orderIds || !orderIds.size) {
        result.assetsNotOut += 1;
        return;
      }

      if (row.currentAddress && !equipmentLocationInputs.has(equipmentId)) {
        equipmentLocationInputs.set(equipmentId, {
          modelName: row.modelName,
          currentAddress: row.currentAddress,
        });
      }

      orderIds.forEach((orderId) => {
        if (!orderBuckets.has(orderId)) {
          orderBuckets.set(orderId, {
            siteAddress: "",
            generalNotes: "",
            coverageHours: [],
            emergencyContacts: [],
            emergencyKeys: new Set(),
            siteContacts: [],
            siteContactKeys: new Set(),
            hasCoverage: false,
          });
        }
        const bucket = orderBuckets.get(orderId);
        if (hasSiteAddress && !bucket.siteAddress && row.siteAddress) {
          bucket.siteAddress = row.siteAddress;
        }
        if (hasGeneralNotes && !bucket.generalNotes && row.generalNotes) {
          bucket.generalNotes = row.generalNotes;
        }
        if (hasMonitoring && !bucket.hasCoverage && Array.isArray(row.coverageHours) && row.coverageHours.length) {
          bucket.coverageHours = row.coverageHours;
          bucket.hasCoverage = true;
        }
        row.emergencyContacts.forEach((contact) => {
          const key = contactKey(contact);
          if (!key || bucket.emergencyKeys.has(key)) return;
          bucket.emergencyKeys.add(key);
          bucket.emergencyContacts.push(contact);
        });
        row.siteContacts.forEach((contact) => {
          const key = contactKey(contact);
          if (!key || bucket.siteContactKeys.has(key)) return;
          bucket.siteContactKeys.add(key);
          bucket.siteContacts.push(contact);
        });
      });
    });
  });

  const locationsCache = await listLocations(companyId, { scope: "all" }).catch(() => []);
  const locationNames = new Set((locationsCache || []).map((l) => String(l?.name || "").trim()).filter(Boolean));

  for (const [orderId, bucket] of orderBuckets.entries()) {
    const updates = [];
    const values = [companyId, orderId];
    let idx = 3;

    if (hasSiteAddress) {
      updates.push(`site_address = $${idx++}`);
      values.push(bucket.siteAddress || null);
      updates.push(`site_address_query = $${idx++}`);
      values.push(bucket.siteAddress || null);
      updates.push(`site_address_lat = $${idx++}`);
      values.push(null);
      updates.push(`site_address_lng = $${idx++}`);
      values.push(null);
    }
    if (hasGeneralNotes) {
      updates.push(`general_notes = $${idx++}`);
      values.push(bucket.generalNotes || null);
    }
    if (hasMonitoring) {
      updates.push(`coverage_hours = $${idx++}::jsonb`);
      values.push(JSON.stringify(bucket.hasCoverage ? bucket.coverageHours : []));
    }
    if (hasEmergencyContacts) {
      updates.push(`emergency_contacts = $${idx++}::jsonb`);
      values.push(JSON.stringify(bucket.emergencyContacts));
    }
    if (hasSiteContacts) {
      updates.push(`site_contacts = $${idx++}::jsonb`);
      values.push(JSON.stringify(bucket.siteContacts));
    }

    if (!updates.length) {
      result.ordersSkipped += 1;
      continue;
    }

    updates.push("updated_at = NOW()");
    await pool.query(
      `UPDATE rental_orders SET ${updates.join(", ")} WHERE company_id = $1 AND id = $2`,
      values
    );
    result.ordersUpdated += 1;
  }

  const equipmentIdsToUpdate = Array.from(equipmentLocationInputs.keys());
  if (equipmentIdsToUpdate.length) {
    const beforeRows = await listEquipmentCurrentLocationIdsForIds({ companyId, equipmentIds: equipmentIdsToUpdate });
    const beforeMap = new Map(beforeRows.map((row) => [Number(row.id), row.current_location_id]));

    for (const equipmentId of equipmentIdsToUpdate) {
      const info = equipmentLocationInputs.get(equipmentId);
      const warnings = [];
      const mapPin = await resolveMapPin(info.currentAddress, warnings);
      warnings.forEach((w) => {
        if (result.warnings.length < 50) result.warnings.push(`Model ${info.modelName}: ${w}`);
      });
      if (!mapPin) {
        if (result.warnings.length < 50) {
          result.warnings.push(`Model ${info.modelName}: unable to resolve map pin for current location.`);
        }
        continue;
      }
      const locResult = await ensureCurrentLocationFromMap({
        companyId,
        modelName: info.modelName,
        mapPin,
        locationsCache,
        existingNames: locationNames,
      });
      const loc = locResult.location;
      if (!loc?.id) continue;
      const updatedCount = await setEquipmentCurrentLocationForIds({
        companyId,
        equipmentIds: [equipmentId],
        currentLocationId: Number(loc.id),
      });
      if (updatedCount) {
        result.equipmentLocationsUpdated += updatedCount;
      }
      const before = beforeMap.get(equipmentId) ?? null;
      if (String(before || "") !== String(loc.id || "")) {
        await recordEquipmentCurrentLocationChange({
          companyId,
          equipmentId,
          fromLocationId: before,
          toLocationId: Number(loc.id),
        }).catch(() => null);
        if (before) {
          await cleanupNonBaseLocationIfUnused({ companyId, locationId: Number(before) }).catch(() => null);
        }
      }
      if (locResult.created) result.locationsCreated += 1;
    }
  }

  return result;
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

app.use("/api", (req, res, next) => {
  setNoCacheHeaders(res);
  next();
});

app.use("/api", (req, res, next) => {
  ensureCsrfCookie(req, res);
  const method = String(req.method || "").toUpperCase();
  if (CSRF_SAFE_METHODS.has(method)) return next();

  const apiPath = getApiPath(req);
  const publicPath =
    apiPath === "/api/login" ||
    (apiPath === "/api/companies" && method === "POST") ||
    apiPath.startsWith("/api/customers") ||
    apiPath.startsWith("/api/storefront") ||
    apiPath.startsWith("/api/public") ||
    apiPath === "/api/qbo/callback" ||
    apiPath === "/api/qbo/webhooks";
  if (publicPath) return next();

  const tokenSource = getCompanyUserToken(req).source;
  if (tokenSource !== "cookie") return next();

  const cookies = parseCookies(req);
  const csrfCookie = String(cookies[CSRF_COOKIE] || "").trim();
  const csrfHeader =
    readHeaderValue(req.headers[CSRF_HEADER]) || readHeaderValue(req.headers["x-xsrf-token"]);
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: "CSRF token missing or invalid." });
  }
  return next();
});

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
    if (apiPath.startsWith("/api/public")) return next();
    if (apiPath === "/api/qbo/callback") return next();
    if (apiPath === "/api/qbo/webhooks") return next();

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

app.use(
  "/api",
  (req, res, next) => {
    if (!req.auth) return next();
    const role = req.auth?.role ? String(req.auth.role).trim().toLowerCase() : "";
    if (role !== "dispatch") return next();

    const apiPath = `${req.baseUrl || ""}${req.path || ""}`;
    const method = String(req.method || "").toUpperCase();
    const allowed = DISPATCH_ALLOWED_API.some((entry) => entry.method === method && entry.pattern.test(apiPath));
    if (allowed) return next();

    return res.status(403).json({ error: "Insufficient permissions." });
  }
);

app.post(
  "/api/login",
  loginLimiter,
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
    const passwordError = getPasswordValidationError(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

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
  loginLimiter,
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
        monthlyProrationMethod: settings?.monthly_proration_method || null,
        billingTimeZone: settings?.billing_timezone || null,
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

app.get(
  "/api/storefront/sale-listings",
  asyncHandler(async (req, res) => {
    const { equipment, company, location, limit, offset } = req.query || {};
    const listings = await listStorefrontSaleListings({
      equipment,
      company,
      location,
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
        siteAccessInfo,
        deliveryInstructions,
        criticalAreas,
        notificationCircumstances,
        generalNotes,
        generalNotesImages,
        emergencyContacts,
        siteContacts,
        coverageHours,
        coverageTimeZone,
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
          siteAccessInfo,
          deliveryInstructions,
          criticalAreas,
          notificationCircumstances,
          generalNotes,
          generalNotesImages,
          emergencyContacts,
          siteContacts,
          coverageHours,
          coverageTimeZone,
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
    const companyId = normalizeCompanyId(req.body.companyId);
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
      documents,
    };
    const passwordError = getPasswordValidationError(payload.password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const created = await createStorefrontCustomer(payload);
    const session = await authenticateStorefrontCustomer({ companyId, email: payload.email, password: payload.password });
    res.status(201).json({ customer: created, token: session?.token || null, expiresAt: session?.expiresAt || null });
  })
);

app.post(
  "/api/storefront/customers/login",
  loginLimiter,
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
  const cid = normalizeCompanyId(companyId);
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

async function convertBufferToWebp(buffer, { quality = 82 } = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  if (!input.length) throw new Error("Missing image buffer.");
  const sharp = require("sharp");
  return sharp(input, { failOnError: false, animated: true }).webp({ quality }).toBuffer();
}

const BLOCKED_UPLOAD_MIMES = new Set([
  "text/html",
  "application/xhtml+xml",
  "application/javascript",
  "text/javascript",
  "application/x-javascript",
  "image/svg+xml",
]);

const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".js",
  ".mjs",
  ".cjs",
  ".svg",
  ".svgz",
]);

function rejectUnsafeUpload(file) {
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime && BLOCKED_UPLOAD_MIMES.has(mime)) return true;
  const ext = path.extname(String(file?.originalname || "")).toLowerCase();
  return !!(ext && BLOCKED_UPLOAD_EXTENSIONS.has(ext));
}

function safeUploadPath(...parts) {
  const full = path.resolve(uploadRoot, ...parts);
  const rel = path.relative(uploadRoot, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return full;
}

const imageUpload = multer({
  storage: multer.memoryStorage(),
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
      const companyId = normalizeCompanyId(req.body.companyId);
      if (!companyId) return cb(new Error("companyId is required."));
      req.body.companyId = companyId;
      const dir = safeUploadPath(`company-${companyId}`, "files");
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
});

const storefrontSignupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = normalizeCompanyId(req.body.companyId);
      if (!companyId) return cb(new Error("companyId is required."));
      req.body.companyId = companyId;
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = safeUploadPath("storefront", `company-${companyId}`, `customer-signup-${submissionId}`);
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
});

const storefrontCustomerProfileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const companyId = normalizeCompanyId(req.body.companyId);
      if (!companyId) return cb(new Error("companyId is required."));
      req.body.companyId = companyId;
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = safeUploadPath("storefront", `company-${companyId}`, `customer-profile-${submissionId}`);
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
});

const customerAccountSignupUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = safeUploadPath("customers", `signup-${submissionId}`);
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
});

const customerAccountProfileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const accountId = Number(req.customerAccount?.id);
      if (!Number.isFinite(accountId) || accountId <= 0) return cb(new Error("Customer login required."));
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = safeUploadPath("customers", `account-${accountId}`, `profile-${submissionId}`);
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
});

const customerLinkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const link = req.customerShareLink;
      if (!link?.id) return cb(new Error("Invalid share link."));
      const submissionId = getOrCreateUploadSubmissionId(req);
      req.body.submissionId = submissionId;
      const dir = safeUploadPath("customer-links", `link-${link.id}`, `submission-${submissionId}`);
      if (!dir) return cb(new Error("Invalid upload path."));
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
  fileFilter: (req, file, cb) => {
    if (rejectUnsafeUpload(file)) return cb(new Error("File type is not allowed."));
    cb(null, true);
  },
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

app.post(
  "/api/uploads/image",
  (req, res, next) => {
    imageUpload.single("image")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed." });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const companyId = normalizeCompanyId(req.body.companyId);
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!req.file?.buffer?.length) return res.status(400).json({ error: "image file is required." });

    const dir = safeUploadPath(`company-${companyId}`);
    if (!dir) return res.status(400).json({ error: "Invalid upload path." });
    fs.mkdirSync(dir, { recursive: true });

    let outputBuffer = req.file.buffer;
    if (String(req.file.mimetype || "").toLowerCase() !== "image/webp") {
      try {
        outputBuffer = await convertBufferToWebp(req.file.buffer);
      } catch (err) {
        return res.status(400).json({ error: "Unable to convert image to WebP." });
      }
    }

    const filename = `${crypto.randomUUID()}.webp`;
    const fullPath = path.join(dir, filename);
    await fs.promises.writeFile(fullPath, outputBuffer);

    res.status(201).json({ url: `/uploads/company-${companyId}/${filename}` });
  })
);

app.post("/api/uploads/file", (req, res, next) => {
  fileUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed." });
    next();
  });
}, (req, res) => {
  const companyId = normalizeCompanyId(req.body.companyId);
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
    const companyId = normalizeCompanyId(req.body.companyId);
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

    const fullPath = safeUploadPath(`company-${companyId}`, filename);
    if (!fullPath) return res.status(400).json({ error: "Invalid image url." });
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
    const companyId = normalizeCompanyId(req.body.companyId);
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

    const fullPath = safeUploadPath(`company-${companyId}`, "files", filename);
    if (!fullPath) return res.status(400).json({ error: "Invalid file url." });
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
    const companyId = normalizeCompanyId(req.body.companyId);
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
    const companyId = normalizeCompanyId(req.body.companyId);
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
    const passwordError = getPasswordValidationError(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
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
    const passwordError = getPasswordValidationError(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const user = await createUser({ companyId, name, email, role, password });
    res.status(201).json(user);
  })
);

app.get(
  "/api/users",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const users = await listUsers(companyId, { from, to, dateField });
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
    const { companyId, scope, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const locations = await listLocations(companyId, { scope, from, to, dateField });
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
    const {
      companyId,
      name,
      streetAddress,
      city,
      region,
      country,
      isBaseLocation,
      latitude,
      longitude,
      geocodeProvider,
      geocodeQuery,
    } = req.body;
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
        return res.json({ location: saved });
      }
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
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const categories = await listCategories(companyId, { from, to, dateField });
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
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const types = await listTypes(companyId, { from, to, dateField });
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
      const {
        companyId,
        name,
        categoryId,
        imageUrl,
        imageUrls,
        documents,
        description,
        terms,
        dailyRate,
        weeklyRate,
        monthlyRate,
        qboItemId,
    } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const type = await createType({
      companyId,
        name,
        categoryId,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        documents,
        description,
        terms,
        dailyRate,
        weeklyRate,
        monthlyRate,
        qboItemId,
    });
    if (!type) return res.status(200).json({ message: "Equipment type already exists." });
    res.status(201).json(type);
  })
);

app.put(
  "/api/equipment-types/:id",
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const {
        companyId,
        name,
        categoryId,
        imageUrl,
        imageUrls,
        documents,
        description,
        terms,
        dailyRate,
        weeklyRate,
        monthlyRate,
        qboItemId,
    } = req.body;
    if (!companyId || !name) return res.status(400).json({ error: "companyId and name are required." });
    const updated = await updateType({
      id,
      companyId,
        name,
        categoryId,
        imageUrl,
        imageUrls: parseStringArray(imageUrls),
        documents,
        description,
        terms,
        dailyRate,
        weeklyRate,
        monthlyRate,
        qboItemId,
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
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const customers = await listCustomers(companyId, { from, to, dateField });
    res.json({ customers });
  })
);

app.get(
  "/api/vendors",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const vendors = await listVendors(companyId, { from, to, dateField });
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

app.post(
  "/api/customers/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, fileName, mime, sizeBytes, url, category } = req.body || {};
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
      category,
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
      qboCustomerId,
      contacts,
      accountingContacts,
      canChargeDeposit,
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
        qboCustomerId,
        contacts,
        accountingContacts,
        canChargeDeposit: canChargeDeposit === true || canChargeDeposit === "true" || canChargeDeposit === "on",
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
      qboCustomerId,
      contacts,
      accountingContacts,
      canChargeDeposit,
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
        qboCustomerId,
        contacts,
        accountingContacts,
        canChargeDeposit: canChargeDeposit === true || canChargeDeposit === "true" || canChargeDeposit === "on",
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
  "/api/rental-orders/import-rental-info",
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
    const result = await importRentalOrderRentalInfoFromText({ companyId, text });
    res.status(201).json(result);
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

app.post(
  "/api/customer-share-links",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      customerId,
      rentalOrderId,
      scope,
      allowedFields,
      allowedLineItemFields,
      allowedDocumentCategories,
      termsText,
      requireEsignature,
      singleUse,
      expiresAt,
    } = req.body || {};

    const normalizedCustomerId = Number(customerId);
    const normalizedRentalOrderId = Number(rentalOrderId);
    const hasCustomerId = Number.isFinite(normalizedCustomerId) && normalizedCustomerId > 0;
    const hasRentalOrderId = Number.isFinite(normalizedRentalOrderId) && normalizedRentalOrderId > 0;
    const inferredScope =
      scope ||
      (hasRentalOrderId ? "order_update" : hasCustomerId ? "customer_update" : "new_customer");
    const normalizedScope = normalizeCustomerShareScope(inferredScope);
    const defaultCustomerFields = Array.from(ALLOWED_CUSTOMER_FIELDS);
    const defaultOrderFields = Array.from(ALLOWED_ORDER_FIELDS);
    const defaultLineItemFields = Array.from(ALLOWED_LINE_ITEM_FIELDS);
    const shouldAllowOrder = normalizedScope === "new_quote" || normalizedScope === "order_update";
    const defaultAllowedFields = shouldAllowOrder ? [...defaultCustomerFields, ...defaultOrderFields] : defaultCustomerFields;
    const finalAllowedFields = filterAllowedFields(allowedFields, new Set(defaultAllowedFields), defaultAllowedFields);
    const finalLineItemFields = shouldAllowOrder
      ? filterAllowedFields(allowedLineItemFields, ALLOWED_LINE_ITEM_FIELDS, defaultLineItemFields)
      : [];

    const settings = await getCompanySettings(companyId);
    const docCategories =
      normalizeStringArray(allowedDocumentCategories).length > 0
        ? normalizeStringArray(allowedDocumentCategories)
        : settings.customer_document_categories || [];
    const token = crypto.randomBytes(24).toString("hex");
    const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const created = await createCustomerShareLink({
      companyId,
      customerId,
      rentalOrderId,
      scope: normalizedScope,
      tokenHash: hashShareToken(token),
      allowedFields: finalAllowedFields,
      allowedLineItemFields: finalLineItemFields,
      allowedDocumentCategories: docCategories,
      termsText: termsText || null,
      requireEsignature: requireEsignature !== undefined ? requireEsignature === true : settings.customer_esign_required === true,
      singleUse: singleUse === true,
      expiresAt: expiresAt || defaultExpiry,
      createdByUserId: req.auth?.userId || null,
    });

    const url = `/customer-link.html?token=${encodeURIComponent(token)}`;
    res.status(201).json({ link: created, token, url });
  })
);

app.get(
  "/api/customer-change-requests",
  asyncHandler(async (req, res) => {
    const { companyId, status, customerId, rentalOrderId, limit, offset } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const requests = await listCustomerChangeRequests({
      companyId,
      status,
      customerId,
      rentalOrderId,
      limit,
      offset,
    });
    res.json({ requests });
  })
);

app.get(
  "/api/customer-change-requests/:id",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    const { id } = req.params || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const request = await getCustomerChangeRequest({ companyId, id: Number(id) });
    if (!request) return res.status(404).json({ error: "Change request not found." });
    const [currentCustomer, currentOrder] = await Promise.all([
      request.customer_id ? getCustomerById({ companyId, id: request.customer_id }) : null,
      request.rental_order_id ? getRentalOrder({ companyId, id: request.rental_order_id }) : null,
    ]);
    res.json({ request, currentCustomer, currentOrder });
  })
);

app.post(
  "/api/customer-change-requests/:id/accept",
  asyncHandler(async (req, res) => {
    const { companyId, reviewNotes } = req.body || {};
    const { id } = req.params || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const request = await getCustomerChangeRequest({ companyId, id: Number(id) });
    if (!request) return res.status(404).json({ error: "Change request not found." });
    if (String(request.status || "") !== "pending") {
      return res.status(409).json({ error: "Change request has already been reviewed." });
    }

    const payload = request.payload || {};
    const customerUpdate = payload.customer || {};
    const orderUpdate = payload.order || {};
    const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
    const normalizedGeneralNotesImages = normalizeGeneralNotesImages({
      companyId,
      images: orderUpdate?.generalNotesImages,
    });

    let customerId = request.customer_id;
    if (!customerId && (request.scope === "new_customer" || request.scope === "new_quote")) {
      const createdCustomer = await createCustomer({
        companyId,
        companyName: customerUpdate.companyName || customerUpdate.contactName || "New customer",
        contactName: customerUpdate.contactName || null,
        streetAddress: customerUpdate.streetAddress || null,
        city: customerUpdate.city || null,
        region: customerUpdate.region || null,
        country: customerUpdate.country || null,
        postalCode: customerUpdate.postalCode || null,
        email: customerUpdate.email || null,
        phone: customerUpdate.phone || null,
        contacts: customerUpdate.contacts || null,
        accountingContacts: customerUpdate.accountingContacts || null,
      });
      customerId = createdCustomer?.id || null;
    } else if (customerId && Object.keys(customerUpdate).length) {
      const existing = await getCustomerById({ companyId, id: customerId });
      const merged = mergeCustomerPayload(
        {
          companyName: existing?.company_name || null,
          contactName: existing?.contact_name || null,
          streetAddress: existing?.street_address || null,
          city: existing?.city || null,
          region: existing?.region || null,
          country: existing?.country || null,
          postalCode: existing?.postal_code || null,
          email: existing?.email || null,
          phone: existing?.phone || null,
          contacts: Array.isArray(existing?.contacts) ? existing.contacts : [],
          accountingContacts: Array.isArray(existing?.accounting_contacts) ? existing.accounting_contacts : [],
        },
        customerUpdate
      );
      await updateCustomer({
        id: customerId,
        companyId,
        companyName: merged.companyName,
        contactName: merged.contactName,
        streetAddress: merged.streetAddress,
        city: merged.city,
        region: merged.region,
        country: merged.country,
        postalCode: merged.postalCode,
        email: merged.email,
        phone: merged.phone,
        contacts: merged.contacts,
        accountingContacts: merged.accountingContacts,
      });
    }

    if (customerId) {
      await setCustomerPendingStatus({ companyId, customerId, isPending: false });
    }

    let orderId = request.rental_order_id;
    if (request.scope === "order_update" || request.scope === "new_quote") {
      if (!customerId) return res.status(400).json({ error: "Customer is required to accept this request." });
      if (orderId) {
        const existingOrder = await getRentalOrder({ companyId, id: orderId });
        const existing = existingOrder?.order;
        if (!existing) return res.status(404).json({ error: "Rental order not found." });
        if (!isDemandOnlyStatus(existing.status)) {
          return res.status(400).json({ error: "Only quotes or requests can be updated by customers." });
        }
        const mergedOrder = mergeOrderPayload(
          {
            customerPo: existing.customer_po || null,
            fulfillmentMethod: existing.fulfillment_method || "pickup",
            dropoffAddress: existing.dropoff_address || null,
            siteName: existing.site_name || null,
            siteAddress: existing.site_address || null,
            siteAccessInfo: existing.site_access_info || null,
            siteAddressLat: existing.site_address_lat || null,
            siteAddressLng: existing.site_address_lng || null,
            siteAddressQuery: existing.site_address_query || null,
            logisticsInstructions: existing.logistics_instructions || null,
            specialInstructions: existing.special_instructions || null,
            criticalAreas: existing.critical_areas || null,
            notificationCircumstances: existing.notification_circumstances || [],
            coverageHours: existing.coverage_hours || [],
            coverageTimeZone: existing.coverage_timezone || null,
            emergencyContacts: existing.emergency_contacts || [],
            siteContacts: existing.site_contacts || [],
            generalNotes: existing.general_notes || null,
          },
          orderUpdate
        );
        const existingLineItems = Array.isArray(existingOrder?.lineItems) ? existingOrder.lineItems : [];
        const requestedLineItems = lineItems.length
          ? lineItems
          : existingLineItems.map((li) => ({
              lineItemId: li.id,
              typeId: li.type_id,
              bundleId: li.bundle_id,
              startAt: li.start_at,
              endAt: li.end_at,
            }));
        const mergedLineItems = mergeLineItemsWithExisting(existingLineItems, requestedLineItems);
        await updateRentalOrder({
          id: orderId,
          companyId,
          customerId,
          customerPo: mergedOrder.customerPo,
          fulfillmentMethod: mergedOrder.fulfillmentMethod,
          dropoffAddress: mergedOrder.dropoffAddress,
          siteName: mergedOrder.siteName,
          siteAddress: mergedOrder.siteAddress,
          siteAccessInfo: mergedOrder.siteAccessInfo,
          siteAddressLat: mergedOrder.siteAddressLat,
          siteAddressLng: mergedOrder.siteAddressLng,
          siteAddressQuery: mergedOrder.siteAddressQuery,
          logisticsInstructions: mergedOrder.logisticsInstructions,
          specialInstructions: mergedOrder.specialInstructions,
          criticalAreas: mergedOrder.criticalAreas,
          notificationCircumstances: mergedOrder.notificationCircumstances,
          coverageHours: mergedOrder.coverageHours,
          coverageTimeZone: mergedOrder.coverageTimeZone,
          emergencyContacts: mergedOrder.emergencyContacts,
          siteContacts: mergedOrder.siteContacts,
          generalNotes: mergedOrder.generalNotes,
          status: existing.status || "quote",
          lineItems: mergedLineItems,
          actorName: req.auth?.user?.name || null,
          actorEmail: req.auth?.user?.email || null,
        });
        try {
          await updateEquipmentCurrentLocationFromSiteAddress({
            companyId,
            orderId,
            siteAddress: mergedOrder.siteAddress,
            siteAddressLat: mergedOrder.siteAddressLat,
            siteAddressLng: mergedOrder.siteAddressLng,
            siteAddressQuery: mergedOrder.siteAddressQuery,
          });
        } catch (err) {
          console.warn("Site-address current-location update failed:", err?.message || err);
        }
        if (normalizedGeneralNotesImages.length) {
          const actorName = req.auth?.user?.name ? String(req.auth.user.name) : null;
          const actorEmail = req.auth?.user?.email ? String(req.auth.user.email) : null;
          for (const img of normalizedGeneralNotesImages) {
            await addRentalOrderAttachment({
              companyId,
              orderId,
              fileName: img.fileName,
              mime: img.mime,
              sizeBytes: img.sizeBytes,
              url: img.url,
              category: img.category,
              actorName,
              actorEmail,
            });
          }
        }
      } else {
        const createdOrder = await createRentalOrder({
          companyId,
          customerId,
          customerPo: orderUpdate.customerPo || null,
          fulfillmentMethod: orderUpdate.fulfillmentMethod || "pickup",
          dropoffAddress: orderUpdate.dropoffAddress || null,
          siteName: orderUpdate.siteName || null,
          siteAddress: orderUpdate.siteAddress || null,
          siteAccessInfo: orderUpdate.siteAccessInfo || null,
          siteAddressLat: orderUpdate.siteAddressLat || null,
          siteAddressLng: orderUpdate.siteAddressLng || null,
          siteAddressQuery: orderUpdate.siteAddressQuery || null,
          logisticsInstructions: orderUpdate.logisticsInstructions || null,
          specialInstructions: orderUpdate.specialInstructions || null,
          criticalAreas: orderUpdate.criticalAreas || null,
          notificationCircumstances: orderUpdate.notificationCircumstances || [],
          coverageHours: orderUpdate.coverageHours || [],
          coverageTimeZone: orderUpdate.coverageTimeZone || null,
          emergencyContacts: orderUpdate.emergencyContacts || [],
          siteContacts: orderUpdate.siteContacts || [],
          generalNotes: orderUpdate.generalNotes || null,
          status: "quote",
          lineItems: lineItems.map((li) => ({
            typeId: li.typeId,
            bundleId: li.bundleId,
            startAt: li.startAt,
            endAt: li.endAt,
          })),
          actorName: req.auth?.user?.name || null,
          actorEmail: req.auth?.user?.email || null,
        });
        orderId = createdOrder?.id || null;
        if (orderId) {
          try {
            await updateEquipmentCurrentLocationFromSiteAddress({
              companyId,
              orderId,
              siteAddress: orderUpdate.siteAddress,
              siteAddressLat: orderUpdate.siteAddressLat,
              siteAddressLng: orderUpdate.siteAddressLng,
              siteAddressQuery: orderUpdate.siteAddressQuery,
            });
          } catch (err) {
            console.warn("Site-address current-location update failed:", err?.message || err);
          }
        }
        if (orderId && normalizedGeneralNotesImages.length) {
          const actorName = req.auth?.user?.name ? String(req.auth.user.name) : null;
          const actorEmail = req.auth?.user?.email ? String(req.auth.user.email) : null;
          for (const img of normalizedGeneralNotesImages) {
            await addRentalOrderAttachment({
              companyId,
              orderId,
              fileName: img.fileName,
              mime: img.mime,
              sizeBytes: img.sizeBytes,
              url: img.url,
              category: img.category,
              actorName,
              actorEmail,
            });
          }
        }
      }
    }

    const docs = Array.isArray(request.documents) ? request.documents : [];
    if (customerId && docs.length) {
      for (const doc of docs) {
        try {
          await addCustomerDocument({
            companyId,
            customerId,
            fileName: doc.fileName || doc.file_name,
            mime: doc.mime || null,
            sizeBytes: doc.sizeBytes || doc.size_bytes || null,
            url: doc.url,
            category: doc.category || null,
          });
        } catch {
          // Ignore document insert errors to avoid blocking acceptance.
        }
      }
    }

    await updateCustomerChangeRequestStatus({
      companyId,
      id: Number(id),
      status: "accepted",
      reviewedByUserId: req.auth?.userId || null,
      reviewNotes: reviewNotes || null,
      appliedCustomerId: customerId || null,
      appliedOrderId: orderId || null,
    });

    res.json({ ok: true, customerId, orderId });
  })
);

app.post(
  "/api/customer-change-requests/:id/reject",
  asyncHandler(async (req, res) => {
    const { companyId, reviewNotes } = req.body || {};
    const { id } = req.params || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const request = await getCustomerChangeRequest({ companyId, id: Number(id) });
    if (!request) return res.status(404).json({ error: "Change request not found." });
    if (String(request.status || "") !== "pending") {
      return res.status(409).json({ error: "Change request has already been reviewed." });
    }
    await updateCustomerChangeRequestStatus({
      companyId,
      id: Number(id),
      status: "rejected",
      reviewedByUserId: req.auth?.userId || null,
      reviewNotes: reviewNotes || null,
    });
    res.json({ ok: true });
  })
);

app.get(
  "/api/sales-people",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const sales = await listSalesPeople(companyId, { from, to, dateField });
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
    const { companyId, name, email, website, phone, streetAddress, city, region, country, postalCode } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!name || !email) return res.status(400).json({ error: "name and email are required." });
    const updated = await updateCompanyProfile({
      companyId: Number(companyId),
      name,
      email,
      website,
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
        taxEnabled,
        defaultTaxRate,
          taxRegistrationNumber,
          taxInclusivePricing,
      autoApplyCustomerCredit,
      autoWorkOrderOnReturn,
      logoUrl,
      requiredStorefrontCustomerFields,
      rentalInfoFields,
      customerDocumentCategories,
      customerTermsTemplate,
      customerEsignRequired,
      qboEnabled,
      qboBillingDay,
      qboAdjustmentPolicy,
      qboIncomeAccountIds,
      qboDefaultTaxCode,
    } = req.body;
      if (!companyId) return res.status(400).json({ error: "companyId is required." });
      const settings = await upsertCompanySettings({
        companyId,
        billingRoundingMode: billingRoundingMode ?? null,
        billingRoundingGranularity: billingRoundingGranularity ?? null,
        monthlyProrationMethod: monthlyProrationMethod ?? null,
        billingTimeZone: billingTimeZone ?? null,
        taxEnabled: taxEnabled ?? null,
        defaultTaxRate: defaultTaxRate ?? null,
        taxRegistrationNumber: taxRegistrationNumber ?? null,
        taxInclusivePricing: taxInclusivePricing ?? null,
          autoApplyCustomerCredit: autoApplyCustomerCredit ?? null,
          autoWorkOrderOnReturn: autoWorkOrderOnReturn ?? null,
          logoUrl,
          requiredStorefrontCustomerFields,
          rentalInfoFields,
          customerDocumentCategories,
          customerTermsTemplate,
          customerEsignRequired,
      qboEnabled: qboEnabled ?? null,
      qboBillingDay: qboBillingDay ?? null,
      qboAdjustmentPolicy: qboAdjustmentPolicy ?? null,
      qboIncomeAccountIds: qboIncomeAccountIds ?? undefined,
      qboDefaultTaxCode,
    });
    res.json({ settings });
  })
);

function buildQboCustomerDisplayName(customer) {
  const display = String(
    customer?.DisplayName || customer?.displayName || customer?.CompanyName || customer?.companyName || ""
  ).trim();
  if (display) return display;
  const given = String(customer?.GivenName || customer?.givenName || "").trim();
  const family = String(customer?.FamilyName || customer?.familyName || "").trim();
  return [given, family].filter(Boolean).join(" ").trim();
}

function buildQboCustomerContactName(customer) {
  const given = String(customer?.GivenName || customer?.givenName || "").trim();
  const family = String(customer?.FamilyName || customer?.familyName || "").trim();
  const combined = [given, family].filter(Boolean).join(" ").trim();
  return combined || null;
}

function buildQboStreetAddress(addr) {
  if (!addr) return null;
  const lines = [
    addr.Line1 || addr.line1,
    addr.Line2 || addr.line2,
    addr.Line3 || addr.line3,
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

function mapQboCustomerToLocal(customer) {
  const displayName = buildQboCustomerDisplayName(customer);
  const contactName = buildQboCustomerContactName(customer);
  const bill = customer?.BillAddr || customer?.billAddr || null;
  const streetAddress = buildQboStreetAddress(bill);
  const email =
    customer?.PrimaryEmailAddr?.Address ||
    customer?.email ||
    null;
  const phone =
    customer?.PrimaryPhone?.FreeFormNumber ||
    customer?.Mobile?.FreeFormNumber ||
    customer?.phone ||
    null;
  return {
    companyName: displayName || "QBO Customer",
    contactName,
    streetAddress,
    city: bill?.City || bill?.city || null,
    region: bill?.CountrySubDivisionCode || bill?.region || null,
    country: bill?.Country || bill?.country || null,
    postalCode: bill?.PostalCode || bill?.postalCode || null,
    email: email ? String(email) : null,
    phone: phone ? String(phone) : null,
  };
}

function buildQboCustomerPayloadFromLocal(customer) {
  const payload = {};
  const displayName = String(customer?.company_name || customer?.contact_name || `Customer ${customer?.id || ""}`).trim();
  payload.DisplayName = displayName || `Customer ${customer?.id || ""}`;

  if (customer?.company_name) payload.CompanyName = String(customer.company_name).trim();
  if (customer?.contact_name) {
    const parts = String(customer.contact_name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      payload.GivenName = parts[0];
    } else if (parts.length > 1) {
      payload.GivenName = parts[0];
      payload.FamilyName = parts.slice(1).join(" ");
    }
  }

  if (customer?.email) {
    payload.PrimaryEmailAddr = { Address: String(customer.email).trim() };
  }
  if (customer?.phone) {
    payload.PrimaryPhone = { FreeFormNumber: String(customer.phone).trim() };
  }

  const addressLines = String(customer?.street_address || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const addr = {};
  if (addressLines[0]) addr.Line1 = addressLines[0];
  if (addressLines[1]) addr.Line2 = addressLines[1];
  if (addressLines[2]) addr.Line3 = addressLines[2];
  if (customer?.city) addr.City = String(customer.city).trim();
  if (customer?.region) addr.CountrySubDivisionCode = String(customer.region).trim();
  if (customer?.country) addr.Country = String(customer.country).trim();
  if (customer?.postal_code) addr.PostalCode = String(customer.postal_code).trim();
  if (Object.keys(addr).length) payload.BillAddr = addr;

  return payload;
}

function normalizeCustomerMatchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCustomerMatchEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCustomerMatchPhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function scoreCustomerMatch(local, qbo) {
  let score = 0;
  const localName = normalizeCustomerMatchValue(local.company_name || "");
  const qboName = normalizeCustomerMatchValue(buildQboCustomerDisplayName(qbo) || "");

  if (localName && qboName) {
    if (localName === qboName) score += 3;
    const localTokens = new Set(localName.split(" ").filter(Boolean));
    const qboTokens = new Set(qboName.split(" ").filter(Boolean));
    if (localTokens.size && qboTokens.size) {
      let overlap = 0;
      localTokens.forEach((token) => {
        if (qboTokens.has(token)) overlap += 1;
      });
      const union = localTokens.size + qboTokens.size - overlap;
      if (union > 0) score += (overlap / union) * 2;
    }
    if (localName.includes(qboName) || qboName.includes(localName)) score += 1;
  }

  const localEmail = normalizeCustomerMatchEmail(local.email);
  const qboEmail = normalizeCustomerMatchEmail(qbo.email || qbo?.PrimaryEmailAddr?.Address);
  if (localEmail && qboEmail && localEmail === qboEmail) score += 3;

  const localPhone = normalizeCustomerMatchPhone(local.phone);
  const qboPhone = normalizeCustomerMatchPhone(qbo.phone || qbo?.PrimaryPhone?.FreeFormNumber || qbo?.Mobile?.FreeFormNumber);
  if (localPhone && qboPhone) {
    if (localPhone === qboPhone) score += 2;
    else if (localPhone.length >= 7 && qboPhone.length >= 7 && localPhone.slice(-7) === qboPhone.slice(-7)) {
      score += 1.5;
    }
  }

  return score;
}

app.get(
  "/api/qbo/status",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const settings = await getCompanySettings(companyId);
    const connection = await getQboConnection({ companyId: Number(companyId) });
    res.json({
      connected: !!connection,
      realmId: connection?.realm_id || null,
      accessTokenExpiresAt: connection?.access_token_expires_at || null,
      refreshTokenExpiresAt: connection?.refresh_token_expires_at || null,
      settings: {
        qbo_enabled: settings.qbo_enabled,
        qbo_billing_day: settings.qbo_billing_day,
        qbo_adjustment_policy: settings.qbo_adjustment_policy,
        qbo_income_account_ids: settings.qbo_income_account_ids,
      },
    });
  })
);

app.get(
  "/api/qbo/authorize",
  asyncHandler(async (req, res) => {
    const { companyId, redirect } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const config = getQboConfig();
    if (!config.clientId || !config.redirectUri) {
      return res.status(400).json({ error: "QBO_CLIENT_ID and QBO_REDIRECT_URI are required." });
    }
    const safeRedirect = sanitizeInternalRedirect(redirect);
    const state = createQboOauthState({ companyId, redirect: safeRedirect });
    const url = buildAuthUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
      scopes: ["com.intuit.quickbooks.accounting"],
      authUrl: config.authUrl,
    });
    res.redirect(url);
  })
);

app.get(
  "/api/qbo/callback",
  asyncHandler(async (req, res) => {
    const { code, realmId, state } = req.query || {};
    if (!state) return res.redirect(QBO_OAUTH_ERROR_REDIRECT);
    const stateEntry = consumeQboOauthState(state);
    const companyId = Number(stateEntry?.companyId);
    const redirectTo = stateEntry?.redirect ? sanitizeInternalRedirect(stateEntry.redirect) : null;
    if (!Number.isFinite(companyId) || companyId <= 0) {
      return res.redirect(redirectTo || QBO_OAUTH_ERROR_REDIRECT);
    }
    if (!code || !realmId) return res.redirect(redirectTo || QBO_OAUTH_ERROR_REDIRECT);

    const config = getQboConfig();
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      return res.redirect(redirectTo || QBO_OAUTH_ERROR_REDIRECT);
    }

    const token = await exchangeAuthCode({
      code: String(code),
      redirectUri: config.redirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenUrl: config.tokenUrl,
    });

    await upsertQboConnection({
      companyId,
      realmId: String(realmId),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: computeExpiryTimestamp(token.expires_in),
      refreshTokenExpiresAt: computeExpiryTimestamp(token.x_refresh_token_expires_in),
      scope: token.scope,
      tokenType: token.token_type,
    });

    res.redirect(redirectTo || "/settings.html?qbo=connected");
  })
);

app.post(
  "/api/qbo/disconnect",
  asyncHandler(async (req, res) => {
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await disconnectQboConnection({ companyId: Number(companyId) });
    res.status(204).end();
  })
);

app.get(
  "/api/qbo/customers",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const customers = await listQboCustomers({ companyId: Number(companyId) });
      res.json({ customers });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO customers request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.get(
  "/api/qbo/items",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const items = await listQboItems({ companyId: Number(companyId) });
      res.json({ items: items.filter(Boolean) });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO items request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.get(
  "/api/qbo/income-accounts",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const accounts = await listQboIncomeAccounts({ companyId: Number(companyId) });
      res.json({ accounts: accounts.filter(Boolean) });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO income accounts request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.get(
  "/api/qbo/tax-codes",
  asyncHandler(async (req, res) => {
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const taxCodes = await listQboTaxCodes({ companyId: Number(companyId) });
      res.json({ taxCodes: taxCodes.filter(Boolean) });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO tax codes request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/customers/link",
  asyncHandler(async (req, res) => {
    const { companyId, customerId, qboCustomerId, updateName } = req.body || {};
    if (!companyId || !customerId || !qboCustomerId) {
      return res.status(400).json({ error: "companyId, customerId, and qboCustomerId are required." });
    }
    const cid = Number(companyId);
    const localId = Number(customerId);
    const qboId = String(qboCustomerId || "").trim();
    const updateNameFlag = parseBoolean(updateName) === true;

    try {
      const existing = await findCustomerIdByQboCustomerId({ companyId: cid, qboCustomerId: qboId });
      if (existing && existing !== localId) {
        return res.status(409).json({ error: "QBO customer is already linked to another customer." });
      }

      let qboCustomer = null;
      let companyName = null;
      let contactName = null;
      if (updateNameFlag) {
        qboCustomer = await getQboCustomerById({ companyId: cid, qboCustomerId: qboId });
        if (!qboCustomer) return res.status(404).json({ error: "QBO customer not found." });
        companyName = buildQboCustomerDisplayName(qboCustomer) || null;
        contactName = buildQboCustomerContactName(qboCustomer) || null;
      }

      const updated = await updateCustomerQboLink({
        companyId: cid,
        id: localId,
        qboCustomerId: qboId,
        companyName,
        contactName,
      });
      if (!updated) return res.status(404).json({ error: "Customer not found." });
      res.json({ customer: updated, qboCustomer: qboCustomer ? normalizeQboCustomer(qboCustomer) : null });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO customer link failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/customers/create-local",
  asyncHandler(async (req, res) => {
    const { companyId, qboCustomerId } = req.body || {};
    if (!companyId || !qboCustomerId) {
      return res.status(400).json({ error: "companyId and qboCustomerId are required." });
    }
    const cid = Number(companyId);
    const qboId = String(qboCustomerId || "").trim();

    try {
      const existingId = await findCustomerIdByQboCustomerId({ companyId: cid, qboCustomerId: qboId });
      if (existingId) {
        const existingCustomer = await getCustomerById({ companyId: cid, id: existingId });
        return res.json({ customer: existingCustomer, skipped: "already_linked" });
      }

      const qboCustomer = await getQboCustomerById({ companyId: cid, qboCustomerId: qboId });
      if (!qboCustomer) return res.status(404).json({ error: "QBO customer not found." });

      const mapped = mapQboCustomerToLocal(qboCustomer);
      const noteParts = [];
      const extraNotes = String(qboCustomer?.Notes || "").trim();
      if (extraNotes) noteParts.push(extraNotes);
      noteParts.push(`Imported from QBO (Id: ${qboId})`);

      const created = await createCustomer({
        companyId: cid,
        companyName: mapped.companyName,
        contactName: mapped.contactName,
        streetAddress: mapped.streetAddress,
        city: mapped.city,
        region: mapped.region,
        country: mapped.country,
        postalCode: mapped.postalCode,
        email: mapped.email,
        phone: mapped.phone,
        qboCustomerId: qboId,
        notes: noteParts.join("\n"),
      });
      res.status(201).json({ customer: created, qboCustomer: normalizeQboCustomer(qboCustomer) });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO customer import failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/customers/create-qbo",
  asyncHandler(async (req, res) => {
    const { companyId, customerId } = req.body || {};
    if (!companyId || !customerId) {
      return res.status(400).json({ error: "companyId and customerId are required." });
    }
    const cid = Number(companyId);
    const localId = Number(customerId);
    try {
      const local = await getCustomerById({ companyId: cid, id: localId });
      if (!local) return res.status(404).json({ error: "Customer not found." });
      if (local.qbo_customer_id) {
        return res.json({ customer: local, skipped: "already_linked", qboCustomerId: local.qbo_customer_id });
      }

      const payload = buildQboCustomerPayloadFromLocal(local);
      const qboCustomer = await createQboCustomer({ companyId: cid, payload });
      const updated = await updateCustomerQboLink({
        companyId: cid,
        id: localId,
        qboCustomerId: qboCustomer?.Id || null,
      });
      res.status(201).json({ customer: updated || local, qboCustomer: normalizeQboCustomer(qboCustomer) });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO customer creation failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/customers/import-unlinked",
  asyncHandler(async (req, res) => {
    const { companyId } = req.body || {};
    if (!companyId) {
      return res.status(400).json({ error: "companyId is required." });
    }
    const cid = Number(companyId);
    const matchThreshold = 2.5;

    try {
      const [locals, qboCustomers] = await Promise.all([
        listCustomers(cid),
        listQboCustomers({ companyId: cid }),
      ]);

      const linkedQboIds = new Set(
        (locals || []).map((local) => String(local.qbo_customer_id || "")).filter(Boolean)
      );

      let imported = 0;
      let skippedLinked = 0;
      let skippedMatched = 0;
      let errors = 0;
      const candidates = [];

      for (const qbo of qboCustomers || []) {
        if (!qbo?.id) continue;
        const qboId = String(qbo.id);
        if (linkedQboIds.has(qboId)) {
          skippedLinked += 1;
          continue;
        }

        const matches = (locals || [])
          .map((local) => ({ local, score: scoreCustomerMatch(local, qbo) }))
          .filter((entry) => entry.score >= matchThreshold)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (matches.length) {
          skippedMatched += 1;
          candidates.push({
            qboCustomerId: qboId,
            qboName: buildQboCustomerDisplayName(qbo) || null,
            matches: matches.map((entry) => ({
              customerId: entry.local.id,
              companyName: entry.local.company_name,
              email: entry.local.email || null,
              phone: entry.local.phone || null,
              score: Number(entry.score.toFixed(2)),
            })),
          });
          continue;
        }

        try {
          const full = await getQboCustomerById({ companyId: cid, qboCustomerId: qboId }).catch(() => null);
          const source = full || qbo;
          const mapped = mapQboCustomerToLocal(source);
          const noteParts = [];
          const extraNotes = String(source?.Notes || "").trim();
          if (extraNotes) noteParts.push(extraNotes);
          noteParts.push(`Imported from QBO (Id: ${qboId})`);

          const created = await createCustomer({
            companyId: cid,
            companyName: mapped.companyName,
            contactName: mapped.contactName,
            streetAddress: mapped.streetAddress,
            city: mapped.city,
            region: mapped.region,
            country: mapped.country,
            postalCode: mapped.postalCode,
            email: mapped.email,
            phone: mapped.phone,
            qboCustomerId: qboId,
            notes: noteParts.join("\n"),
          });
          if (created?.id) imported += 1;
          else errors += 1;
        } catch {
          errors += 1;
        }
      }

      res.json({
        imported,
        skipped: {
          linked: skippedLinked,
          matched: skippedMatched,
          errors,
        },
        candidates,
      });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO customer import failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/webhooks",
  asyncHandler(async (req, res) => {
    const verifierToken = String(process.env.QBO_WEBHOOK_VERIFIER_TOKEN || "").trim();
    const signature = String(req.headers["intuit-signature"] || "").trim();
    const rawBody = req.rawBody || "";
    if (!verifierToken) {
      return res.status(500).send("Webhook verifier token not configured.");
    }
    const ok = verifyWebhookSignature({ payload: rawBody, signature, verifierToken });
    if (!ok) return res.status(401).send("Invalid webhook signature.");

    const payload = req.body || {};
    const events = Array.isArray(payload.eventNotifications) ? payload.eventNotifications : [];
    for (const event of events) {
      const realm = event?.realmId || event?.realmID || payload?.realmId || null;
      if (!realm) continue;
      const companyId = await findCompanyIdByQboRealmId({ realmId: realm });
      if (!companyId) continue;
      const entities = event?.dataChangeEvent?.entities || [];
      for (const entity of entities) {
        const name = entity?.name;
        if (!name || !["Invoice", "CreditMemo"].includes(name)) continue;
        const id = entity?.id;
        const operation = entity?.operation;
        if (!id) continue;
        await handleWebhookEvent({ companyId, entityType: name, entityId: id, operation });
      }
    }
    res.status(200).send("ok");
  })
);

app.post(
  "/api/qbo/sync",
  asyncHandler(async (req, res) => {
    const { companyId, since, until, mode } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const docs = await runCdcSync({ companyId: Number(companyId), since, until, mode });
      res.json({ documents: docs });
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO sync failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.get(
  "/api/qbo/income",
  asyncHandler(async (req, res) => {
    const { companyId, start, end, debug } = req.query || {};
    if (!companyId || !start || !end) {
      return res.status(400).json({ error: "companyId, start, and end are required." });
    }
    try {
      const data = await getIncomeTotals({
        companyId: Number(companyId),
        startDate: start,
        endDate: end,
        debug: String(debug || "") === "1",
      });
      res.json(data);
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO income request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.get(
  "/api/qbo/income-timeseries",
  asyncHandler(async (req, res) => {
    const { companyId, start, end, bucket, debug } = req.query || {};
    if (!companyId || !start || !end) {
      return res.status(400).json({ error: "companyId, start, and end are required." });
    }
    try {
      const data = await getIncomeTimeSeries({
        companyId: Number(companyId),
        startDate: start,
        endDate: end,
        bucket: bucket || "month",
        debug: String(debug || "") === "1",
      });
      res.json(data);
    } catch (err) {
      const message = err?.message ? String(err.message) : "QBO income time series request failed.";
      if (err?.code === "qbo_not_connected") return res.status(400).json({ error: message });
      if (err?.status === 401 || err?.status === 403) return res.status(401).json({ error: message });
      res.status(500).json({ error: message });
    }
  })
);

app.post(
  "/api/qbo/billing/run",
  asyncHandler(async (req, res) => {
    const { companyId, asOf } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const settings = await getCompanySettings(companyId);
    if (!settings?.qbo_enabled) return res.status(200).json({ ok: true, skipped: "qbo_disabled" });
    const orderIds = await listRentalOrdersWithOutItems({ companyId: Number(companyId) });
    const results = [];
    for (const orderId of orderIds) {
      try {
        const invoice = await createMonthlyDraftInvoice({ companyId: Number(companyId), orderId, asOf });
        results.push({ orderId, result: invoice });
      } catch (err) {
        results.push({ orderId, error: err?.message ? String(err.message) : "QBO billing failed." });
      }
    }
    res.json({ ok: true, results });
  })
);

app.get(
  "/api/qbo/rental-orders/:id/documents",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const docs = await listQboDocumentsForRentalOrder({ companyId: Number(companyId), orderId: Number(id) });
    res.json({ documents: docs });
  })
);

app.get(
  "/api/qbo/documents/unassigned",
  asyncHandler(async (req, res) => {
    const { companyId, limit, offset } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const docs = await listQboDocumentsUnassigned({
      companyId: Number(companyId),
      limit,
      offset,
    });
    res.json({ documents: docs });
  })
);

app.get(
  "/api/qbo/documents/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const docId = Number(id);
    if (!Number.isFinite(docId) || docId <= 0) return res.status(400).json({ error: "id is required." });
    const document = await getQboDocument({ companyId: Number(companyId), id: docId });
    if (!document) return res.status(404).json({ error: "Document not found." });
    res.json({ document });
  })
);

app.get(
  "/api/qbo/documents",
  asyncHandler(async (req, res) => {
    const { companyId, limit, offset, assigned, search } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const assignedFlag =
      assigned === undefined || assigned === null || assigned === ""
        ? null
        : String(assigned).toLowerCase() === "true" || String(assigned).toLowerCase() === "assigned"
          ? true
          : String(assigned).toLowerCase() === "false" || String(assigned).toLowerCase() === "unassigned"
            ? false
            : null;
    const docs = await listQboDocuments({
      companyId: Number(companyId),
      limit,
      offset,
      assigned: assignedFlag,
      search,
    });
    res.json({ documents: docs });
  })
);

app.get(
  "/api/qbo/error-logs",
  requireRole("owner"),
  asyncHandler(async (req, res) => {
    const { companyId, limit, offset } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const logs = await listQboErrorLogs({
      companyId: Number(companyId),
      limit,
      offset,
    });
    res.json({ logs });
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
    const { companyId, statuses, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (from && to) {
      const orders = await listRentalOrdersForRange(companyId, {
        from,
        to,
        statuses: statuses || null,
        quoteOnly: false,
        dateField: dateField || "rental_period",
      });
      return res.json({ orders });
    }
    const orders = await listRentalOrders(companyId, { statuses: statuses || null });
    res.json({ orders });
  })
);

app.get(
  "/api/rental-quotes",
  asyncHandler(async (req, res) => {
    const { companyId, statuses, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (from && to) {
      const orders = await listRentalOrdersForRange(companyId, {
        from,
        to,
        statuses: statuses || null,
        quoteOnly: true,
        dateField: dateField || "rental_period",
      });
      return res.json({ orders });
    }
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
  "/api/rental-order-line-items",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, statuses, dateField } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const items = await listRentalOrderLineItemsForRange(companyId, {
      from,
      to,
      statuses: statuses || null,
      dateField,
    });
    res.json({ items });
  })
);

app.get(
  "/api/rental-order-line-items/revenue-summary",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, statuses, dateField, groupBy } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const rows = await getLineItemRevenueSummary(companyId, {
      from,
      to,
      statuses: statuses || null,
      dateField,
      groupBy,
    });
    res.json({ rows });
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
  "/api/availability-shortfalls/customer-demand",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, locationId, categoryId, typeId } = req.query;
    if (!companyId || !from || !to) {
      return res.status(400).json({ error: "companyId, from, and to are required." });
    }
    const data = await getAvailabilityShortfallsCustomerDemand({
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
    const { companyId, pickedUp, pickedUpAt, actorName, actorEmail, skipInvoice } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const skipPickupInvoice = parseBoolean(skipInvoice) === true;
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
    let qbo = null;
    if (pickedUp && !skipPickupInvoice) {
      const settings = await getCompanySettings(companyId).catch(() => null);
      if (settings?.qbo_enabled) {
        const existingDocs = await listQboDocumentsForRentalOrder({
          companyId: Number(companyId),
          orderId: result.orderId,
        }).catch(() => []);
        const existingDocNumbers = new Set(
          (existingDocs || [])
            .map((doc) => String(doc?.doc_number || doc?.docNumber || ""))
            .filter(Boolean)
        );
        const existingPickupLineItemIds = collectPickupLineItemIdsFromDocs(existingDocs);
        const lineItemId = Number(id);
        const pickedUpAt = result.pickedUpAt || normalizedPickedUpAt || null;
        if (existingPickupLineItemIds.has(lineItemId)) {
          qbo = { ok: false, skipped: "line_item_already_invoiced" };
          console.info("QBO pickup invoice skipped (line item already invoiced)", {
            companyId: Number(companyId),
            orderId: result.orderId,
            lineItemId,
          });
        } else {
          const detail = await getRentalOrder({ companyId: Number(companyId), id: result.orderId }).catch(() => null);
          const roNumber = detail?.order?.ro_number || detail?.order?.roNumber || null;
          const bulkDocNumber = getPickupBulkDocNumber({
            roNumber,
            orderId: result.orderId,
            pickedUpAt,
            billingDay: settings.qbo_billing_day,
          });
          const bulkBlocks =
            bulkDocNumber &&
            existingDocNumbers.has(bulkDocNumber) &&
            pickupBulkInvoiceIncludesLineItem({
              docs: existingDocs,
              bulkDocNumber,
              lineItemId,
            }) !== false;
          if (bulkBlocks) {
            qbo = { ok: false, skipped: "bulk_invoice_exists", docNumber: bulkDocNumber };
            console.info("QBO pickup invoice skipped (bulk invoice exists)", {
              companyId: Number(companyId),
              orderId: result.orderId,
              lineItemId,
              docNumber: bulkDocNumber,
            });
          }
          if (!qbo) {
            console.info("QBO pickup invoice attempt", {
              companyId: Number(companyId),
              orderId: result.orderId,
              lineItemId: Number(id),
              pickedUpAt,
            });
            try {
              qbo = await createPickupDraftInvoice({
                companyId: Number(companyId),
                orderId: result.orderId,
                lineItemId: Number(id),
                pickedUpAt: pickedUpAt || new Date().toISOString(),
              });
              console.info("QBO pickup invoice result", {
                companyId: Number(companyId),
                orderId: result.orderId,
                lineItemId: Number(id),
                ok: qbo?.ok ?? null,
                skipped: qbo?.skipped ?? null,
                error: qbo?.error ?? null,
                docNumber: qbo?.document?.doc_number || qbo?.document?.docNumber || null,
              });
            } catch (err) {
              qbo = { ok: false, error: err?.message ? String(err.message) : "QBO invoice failed." };
              console.error("QBO pickup invoice failed", {
                companyId: Number(companyId),
                orderId: result.orderId,
                lineItemId: Number(id),
                error: qbo.error,
              });
            }
          }
        }
      } else {
        console.info("QBO pickup invoice skipped (disabled)", {
          companyId: Number(companyId),
          orderId: result.orderId,
          lineItemId: Number(id),
        });
      }
    } else if (pickedUp && skipPickupInvoice) {
      console.info("QBO pickup invoice skipped (suppressed)", {
        companyId: Number(companyId),
        orderId: result.orderId,
        lineItemId: Number(id),
      });
    }
    res.json({ ...result, qbo });
  })
);

app.post(
  "/api/rental-orders/:id/pickup-invoice",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, pickedUpAt, lineItemIds } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const oid = Number(id);
    if (!Number.isFinite(oid)) return res.status(400).json({ error: "Invalid order id." });
    const normalizedPickedUpAt = normalizeTimestampInput(pickedUpAt);
    if (
      pickedUpAt !== undefined &&
      pickedUpAt !== null &&
      pickedUpAt !== "" &&
      normalizedPickedUpAt === null
    ) {
      return res.status(400).json({ error: "Invalid pickedUpAt value." });
    }
    const ids = Array.isArray(lineItemIds)
      ? lineItemIds.map((lineItemId) => Number(lineItemId)).filter((lineItemId) => Number.isFinite(lineItemId))
      : [];
    if (!ids.length) return res.status(400).json({ error: "lineItemIds are required." });
    const settings = await getCompanySettings(companyId).catch(() => null);
    if (!settings?.qbo_enabled) {
      return res.json({ ok: false, skipped: "disabled" });
    }
    const detail = await getRentalOrder({ companyId: Number(companyId), id: oid }).catch(() => null);
    const roNumber = detail?.order?.ro_number || detail?.order?.roNumber || null;
    const existingDocs = await listQboDocumentsForRentalOrder({ companyId: Number(companyId), orderId: oid }).catch(
      () => []
    );
    const existingDocNumbers = new Set(
      (existingDocs || [])
        .map((doc) => String(doc?.doc_number || doc?.docNumber || ""))
        .filter(Boolean)
    );
    const bulkDocNumber = getPickupBulkDocNumber({
      roNumber,
      orderId: oid,
      pickedUpAt: normalizedPickedUpAt,
      billingDay: settings.qbo_billing_day,
    });
    if (bulkDocNumber && existingDocNumbers.has(bulkDocNumber)) {
      return res.json({ ok: false, skipped: "bulk_invoice_exists", docNumber: bulkDocNumber });
    }
    const existingPickupLineItemIds = collectPickupLineItemIdsFromDocs(existingDocs);
    const filteredIds = ids.filter((lineItemId) => !existingPickupLineItemIds.has(lineItemId));
    if (!filteredIds.length) {
      return res.json({ ok: false, skipped: "line_items_already_invoiced", lineItemIds: ids });
    }
    let qbo = null;
    console.info("QBO pickup invoice attempt (bulk)", {
      companyId: Number(companyId),
      orderId: oid,
      lineItemCount: filteredIds.length,
      pickedUpAt: normalizedPickedUpAt || null,
    });
    try {
      qbo = await createPickupDraftInvoiceBulk({
        companyId: Number(companyId),
        orderId: oid,
        lineItemIds: filteredIds,
        pickedUpAt: normalizedPickedUpAt || null,
      });
      console.info("QBO pickup invoice result (bulk)", {
        companyId: Number(companyId),
        orderId: oid,
        ok: qbo?.ok ?? null,
        skipped: qbo?.skipped ?? null,
        error: qbo?.error ?? null,
        docNumber: qbo?.document?.doc_number || qbo?.document?.docNumber || null,
      });
    } catch (err) {
      const errorMessage = err?.message ? String(err.message) : "QBO invoice failed.";
      qbo = { ok: false, error: errorMessage };
      console.error("QBO pickup invoice failed (bulk)", {
        companyId: Number(companyId),
        orderId: oid,
        error: errorMessage,
      });
    }
    res.json({ ok: true, qbo });
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
    let qbo = null;
    if (returned) {
      const settings = await getCompanySettings(companyId).catch(() => null);
      if (settings?.qbo_enabled && settings?.qbo_adjustment_policy === "credit_memo") {
        try {
          qbo = await createReturnCreditMemo({
            companyId: Number(companyId),
            orderId: result.orderId,
            lineItemId: Number(id),
            returnedAt: result.returnedAt || normalizedReturnedAt || new Date().toISOString(),
          });
        } catch (err) {
          qbo = { ok: false, error: err?.message ? String(err.message) : "QBO credit memo failed." };
        }
      }
    }
    res.json({ ...result, qbo });
  })
);

app.post(
  "/api/equipment/:id/work-order-pause",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, workOrderNumber, startAt, endAt, serviceStatus, orderStatus } = req.body || {};
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
      serviceStatus: serviceStatus || null,
      orderStatus: orderStatus || null,
    });
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
        monthlyProrationMethod: settings?.monthly_proration_method || null,
        billingTimeZone: settings?.billing_timezone || null,
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
      siteName,
      siteAddress,
      siteAccessInfo,
      siteAddressLat,
      siteAddressLng,
      siteAddressQuery,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      notificationCircumstances,
      coverageHours,
      coverageTimeZone,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
      pickupInvoiceMode,
      pickupInvoiceAt,
      skipPickupInvoice,
      actorName,
      actorEmail,
    } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const normalizedStatus = status ? String(status).trim().toLowerCase() : "quote";
    const normalizedCustomerId = customerId ? Number(customerId) : null;
    if (!isDemandOnlyStatus(normalizedStatus) && !normalizedCustomerId) {
      return res.status(400).json({ error: "customerId is required for ordered rental orders." });
    }
    let created;
    try {
      created = await createRentalOrder({
        companyId,
        customerId: normalizedCustomerId,
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
        siteName,
        siteAddress,
        siteAccessInfo,
        siteAddressLat,
        siteAddressLng,
        siteAddressQuery,
        logisticsInstructions,
        specialInstructions,
        criticalAreas,
        notificationCircumstances,
        coverageHours,
        coverageTimeZone,
        emergencyContacts,
        siteContacts,
        lineItems,
        fees,
      });
    } catch (err) {
      if (err?.code === "pickup_conflict") {
        return res.status(409).json({ error: err.message, conflicts: err.conflicts || [] });
      }
      if (err?.code === "invalid_actual_dates") {
        return res.status(400).json({ error: err.message || "Actual return time must be after pickup time." });
      }
      throw err;
    }
      try {
        await updateEquipmentCurrentLocationFromSiteAddress({
          companyId: Number(companyId),
          orderId: created?.id,
          lineItems,
          siteAddress,
          siteAddressLat,
          siteAddressLng,
          siteAddressQuery,
        });
      } catch (err) {
        console.warn("Site-address current-location update failed:", err?.message || err);
      }
    let qbo = null;
    const suppressPickupInvoice = parseBoolean(skipPickupInvoice) === true;
    if (suppressPickupInvoice) {
      qbo = { ok: false, skipped: "suppressed" };
    } else {
      try {
        const normalizedPickupInvoiceMode = pickupInvoiceMode === "bulk" ? "bulk" : null;
        qbo = await createPickupInvoicesForOrder({
          companyId,
          orderId: created?.id,
          source: "order_create",
          mode: normalizedPickupInvoiceMode,
          pickedUpAt: pickupInvoiceAt || null,
        });
      } catch (err) {
        qbo = { ok: false, error: err?.message ? String(err.message) : "QBO invoice failed." };
        console.error("QBO pickup invoices failed (order create)", {
          companyId: companyId || null,
          orderId: created?.id || null,
          error: qbo.error,
        });
      }
    }
    res.status(201).json({ ...created, qbo });
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
      siteName,
      siteAddress,
      siteAccessInfo,
      siteAddressLat,
      siteAddressLng,
      siteAddressQuery,
      logisticsInstructions,
      specialInstructions,
      criticalAreas,
      notificationCircumstances,
      coverageHours,
      coverageTimeZone,
      emergencyContacts,
      siteContacts,
      lineItems,
      fees,
      pickupInvoiceMode,
      pickupInvoiceAt,
      skipPickupInvoice,
      actorName,
      actorEmail,
    } = req.body;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const normalizedStatus = status ? String(status).trim().toLowerCase() : "quote";
    const normalizedCustomerId = customerId ? Number(customerId) : null;
    if (!isDemandOnlyStatus(normalizedStatus) && !normalizedCustomerId) {
      return res.status(400).json({ error: "customerId is required for ordered rental orders." });
    }
    let updated;
    try {
      updated = await updateRentalOrder({
        id: Number(id),
        companyId,
        customerId: normalizedCustomerId,
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
        siteName,
        siteAddress,
        siteAccessInfo,
        siteAddressLat,
        siteAddressLng,
        siteAddressQuery,
        logisticsInstructions,
        specialInstructions,
        criticalAreas,
        notificationCircumstances,
        coverageHours,
        coverageTimeZone,
        emergencyContacts,
        siteContacts,
        lineItems,
        fees,
      });
    } catch (err) {
      if (err?.code === "pickup_conflict") {
        return res.status(409).json({ error: err.message, conflicts: err.conflicts || [] });
      }
      if (err?.code === "invalid_actual_dates") {
        return res.status(400).json({ error: err.message || "Actual return time must be after pickup time." });
      }
      throw err;
    }
    if (!updated) return res.status(404).json({ error: "Rental order not found" });
    let qbo = null;
    const suppressPickupInvoice = parseBoolean(skipPickupInvoice) === true;
    if (suppressPickupInvoice) {
      qbo = { ok: false, skipped: "suppressed" };
    } else {
      try {
        const normalizedPickupInvoiceMode = pickupInvoiceMode === "bulk" ? "bulk" : null;
        qbo = await createPickupInvoicesForOrder({
          companyId,
          orderId: Number(id),
          source: "order_update",
          mode: normalizedPickupInvoiceMode,
          pickedUpAt: pickupInvoiceAt || null,
        });
      } catch (err) {
        qbo = { ok: false, error: err?.message ? String(err.message) : "QBO invoice failed." };
        console.error("QBO pickup invoices failed (order update)", {
          companyId: companyId || null,
          orderId: id || null,
          error: qbo.error,
        });
      }
    }
    res.json({ ...updated, qbo });

    (async () => {
      try {
        await updateEquipmentCurrentLocationFromSiteAddress({
          companyId: Number(companyId),
          orderId: Number(id),
          lineItems,
          siteAddress,
          siteAddressLat,
          siteAddressLng,
          siteAddressQuery,
        });
      } catch (err) {
        console.warn("Site-address current-location update failed:", err?.message || err);
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

app.delete(
  "/api/rental-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    try {
      const result = await deleteRentalOrder({ id: Number(id), companyId: Number(companyId) });
      if (result?.notFound) return res.status(404).json({ error: "Rental order not found" });
      res.status(204).end();
    } catch (err) {
      if (err?.code === "rental_order_closed") {
        return res.status(409).json({ error: err.message || "Closed rental orders cannot be deleted." });
      }
      throw err;
    }
  })
);

app.put(
  "/api/rental-orders/:id/site-address",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId, siteAddress, siteAddressLat, siteAddressLng, siteAddressQuery } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const updated = await updateRentalOrderSiteAddress({
      companyId: Number(companyId),
      orderId: Number(id),
      siteAddress,
      siteAddressLat,
      siteAddressLng,
      siteAddressQuery,
    });
    if (!updated) return res.status(404).json({ error: "Rental order not found" });
    try {
      await updateEquipmentCurrentLocationFromSiteAddress({
        companyId: Number(companyId),
        orderId: Number(id),
        siteAddress,
        siteAddressLat,
        siteAddressLng,
        siteAddressQuery,
      });
    } catch (err) {
      console.warn("Site-address current-location update failed:", err?.message || err);
    }
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
    const normalizedStatus = String(status).trim().toLowerCase();
    if (!isDemandOnlyStatus(normalizedStatus)) {
      const detail = await getRentalOrder({ companyId: Number(companyId), id: Number(id) });
      const orderCustomerId = detail?.order?.customer_id ?? detail?.order?.customerId ?? null;
      if (!orderCustomerId) {
        return res.status(400).json({ error: "customerId is required for ordered rental orders." });
      }
    }
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
        await updateEquipmentCurrentLocationFromSiteAddress({
          companyId: Number(companyId),
          orderId: Number(id),
          lineItems,
          siteAddress: order.site_address || order.siteAddress || null,
          siteAddressLat: order.site_address_lat ?? order.siteAddressLat ?? null,
          siteAddressLng: order.site_address_lng ?? order.siteAddressLng ?? null,
          siteAddressQuery: order.site_address_query ?? order.siteAddressQuery ?? null,
        });
      } catch (err) {
        console.warn("Site-address current-location update failed:", err?.message || err);
      }
    })();

    (async () => {
      try {
        const cid = Number(companyId);
        const emailSettings = await getCompanyEmailSettings(cid);

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

            await sendCompanyEmail({
              companyId: cid,
              settings: emailSettings,
              to: customerEmail,
              subject: tpl.subject,
              text: tpl.text,
              attachments,
            });
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

app.get(
  "/api/purchase-orders",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const purchaseOrders = await listPurchaseOrders(Number(companyId), { from, to, dateField });
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
  "/api/sales-orders",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const salesOrders = await listSalesOrders(Number(companyId), { from, to, dateField });
    res.json({ salesOrders });
  })
);

app.get(
  "/api/sales-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const salesOrder = await getSalesOrder({ companyId: Number(companyId), id: Number(id) });
    if (!salesOrder) return res.status(404).json({ error: "Sales order not found." });
    res.json({ salesOrder });
  })
);

app.post(
  "/api/sales-orders",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      equipmentId,
      customerId,
      customerPo,
      salespersonId,
      status,
      salePrice,
      description,
      imageUrl,
      imageUrls,
      documents,
    } = req.body || {};
    if (!companyId || !equipmentId) {
      return res.status(400).json({ error: "companyId and equipmentId are required." });
    }
    const equipmentIdNum = Number(equipmentId);
    if (!Number.isFinite(equipmentIdNum)) {
      return res.status(400).json({ error: "equipmentId must be a valid number." });
    }
    const customerIdNum = customerId === "" || customerId === null || customerId === undefined ? null : Number(customerId);
    if (customerIdNum !== null && !Number.isFinite(customerIdNum)) {
      return res.status(400).json({ error: "customerId must be a valid number." });
    }
    const salespersonIdNum =
      salespersonId === "" || salespersonId === null || salespersonId === undefined ? null : Number(salespersonId);
    if (salespersonIdNum !== null && !Number.isFinite(salespersonIdNum)) {
      return res.status(400).json({ error: "salespersonId must be a valid number." });
    }
    const normalizedStatus = normalizeSalesOrderStatus(status);
    const salePriceNum =
      salePrice === "" || salePrice === null || salePrice === undefined ? null : Number(salePrice);
    const order = await createSalesOrder({
      companyId: Number(companyId),
      equipmentId: equipmentIdNum,
      customerId: customerIdNum,
      customerPo: customerPo || null,
      salespersonId: salespersonIdNum,
      status: normalizedStatus,
      salePrice: Number.isFinite(salePriceNum) ? salePriceNum : null,
      description: description || null,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      documents: parseJsonArray(documents),
      closedAt: normalizedStatus === "closed" ? new Date().toISOString() : null,
    });
    res.status(201).json({ salesOrder: order });
  })
);

app.put(
  "/api/sales-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      equipmentId,
      customerId,
      customerPo,
      salespersonId,
      status,
      salePrice,
      description,
      imageUrl,
      imageUrls,
      documents,
    } = req.body || {};
    if (!companyId || !equipmentId) {
      return res.status(400).json({ error: "companyId and equipmentId are required." });
    }
    const equipmentIdNum = Number(equipmentId);
    if (!Number.isFinite(equipmentIdNum)) {
      return res.status(400).json({ error: "equipmentId must be a valid number." });
    }
    const customerIdNum = customerId === "" || customerId === null || customerId === undefined ? null : Number(customerId);
    if (customerIdNum !== null && !Number.isFinite(customerIdNum)) {
      return res.status(400).json({ error: "customerId must be a valid number." });
    }
    const salespersonIdNum =
      salespersonId === "" || salespersonId === null || salespersonId === undefined ? null : Number(salespersonId);
    if (salespersonIdNum !== null && !Number.isFinite(salespersonIdNum)) {
      return res.status(400).json({ error: "salespersonId must be a valid number." });
    }
    const existing = await getSalesOrder({ companyId: Number(companyId), id: Number(id) });
    if (!existing) return res.status(404).json({ error: "Sales order not found." });

    const normalizedStatus = normalizeSalesOrderStatus(status);
    const salePriceNum =
      salePrice === "" || salePrice === null || salePrice === undefined ? null : Number(salePrice);
    const closedAt = normalizedStatus === "closed" ? existing.closed_at || new Date().toISOString() : null;

    const updated = await updateSalesOrder({
      id,
      companyId: Number(companyId),
      equipmentId: equipmentIdNum,
      customerId: customerIdNum,
      customerPo: customerPo || null,
      salespersonId: salespersonIdNum,
      status: normalizedStatus,
      salePrice: Number.isFinite(salePriceNum) ? salePriceNum : null,
      description: description || null,
      imageUrl,
      imageUrls: parseStringArray(imageUrls),
      documents: parseJsonArray(documents),
      closedAt,
    });
    if (!updated) return res.status(404).json({ error: "Sales order not found." });
    res.json({ salesOrder: updated });
  })
);

app.delete(
  "/api/sales-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteSalesOrder({ id, companyId });
    res.status(204).end();
  })
);

app.get(
  "/api/work-orders",
  asyncHandler(async (req, res) => {
    const { companyId, unitId, status, orderStatus, serviceStatus, returnInspection, search, limit, offset } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const parsedReturnInspection = parseBoolean(returnInspection);
    const workOrders = await listWorkOrders({
      companyId: Number(companyId),
      unitId,
      orderStatus: status || orderStatus,
      serviceStatus,
      returnInspection: parsedReturnInspection === null ? undefined : parsedReturnInspection,
      search,
      limit,
      offset,
    });
    res.json({ workOrders });
  })
);

app.get(
  "/api/work-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.query || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const workOrder = await getWorkOrder({ companyId: Number(companyId), id: Number(id) });
    if (!workOrder) return res.status(404).json({ error: "Work order not found." });
    res.json({ workOrder });
  })
);

app.post(
  "/api/work-orders",
  asyncHandler(async (req, res) => {
    const {
      companyId,
      date,
      unitIds,
      unitLabels,
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      parts,
      labor,
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
    } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    if (!date) return res.status(400).json({ error: "date is required." });
    const hasUnitIds = Array.isArray(unitIds) ? unitIds.length > 0 : !!unitId;
    if (!hasUnitIds) return res.status(400).json({ error: "unitIds are required." });

    const workOrder = await createWorkOrder({
      companyId,
      date,
      unitIds,
      unitLabels,
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      parts,
      labor,
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
    });
    res.status(201).json({ workOrder });
  })
);

app.put(
  "/api/work-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      companyId,
      date,
      unitIds,
      unitLabels,
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      parts,
      labor,
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
    } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const updated = await updateWorkOrder({
      id: Number(id),
      companyId,
      date,
      unitIds,
      unitLabels,
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      parts,
      labor,
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
    });
    if (!updated) return res.status(404).json({ error: "Work order not found." });
    res.json({ workOrder: updated });
  })
);

app.delete(
  "/api/work-orders/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { companyId } = req.body || {};
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    await deleteWorkOrder({ companyId, id });
    res.status(204).end();
  })
);

app.get(
  "/api/equipment-bundles",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const bundles = await listEquipmentBundles(Number(companyId), { from, to, dateField });
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

app.post(
  "/api/equipment/current-location",
  asyncHandler(async (req, res) => {
    const { companyId, equipmentIds, equipmentId, currentLocationId } = req.body || {};
    const cid = Number(companyId);
    if (!Number.isFinite(cid)) return res.status(400).json({ error: "companyId is required." });
    const ids = Array.isArray(equipmentIds)
      ? equipmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : Number.isFinite(Number(equipmentId))
        ? [Number(equipmentId)]
        : [];
    const locId = Number(currentLocationId);
    if (!Number.isFinite(locId)) return res.status(400).json({ error: "currentLocationId is required." });
    if (!ids.length) return res.json({ ok: true, updated: 0 });

    const beforeRows = await listEquipmentCurrentLocationIdsForIds({ companyId: cid, equipmentIds: ids });
    const updated = await setEquipmentCurrentLocationForIds({ companyId: cid, equipmentIds: ids, currentLocationId: locId });
    const cleanupIds = new Set();

    for (const row of beforeRows) {
      const beforeId = row.current_location_id ?? null;
      if (String(beforeId || "") === String(locId || "")) continue;
      await recordEquipmentCurrentLocationChange({
        companyId: cid,
        equipmentId: Number(row.id),
        fromLocationId: beforeId,
        toLocationId: locId,
      }).catch(() => null);
      if (beforeId) cleanupIds.add(Number(beforeId));
    }

    for (const oldId of cleanupIds) {
      await cleanupNonBaseLocationIfUnused({ companyId: cid, locationId: oldId }).catch(() => null);
    }

    res.json({ ok: true, updated, locationId: locId });
  })
);

app.post(
  "/api/equipment/current-location/base",
  asyncHandler(async (req, res) => {
    const { companyId, equipmentIds } = req.body || {};
    const cid = Number(companyId);
    if (!Number.isFinite(cid)) return res.status(400).json({ error: "companyId is required." });
    const ids = Array.isArray(equipmentIds) ? equipmentIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)) : [];
    if (!ids.length) return res.json({ ok: true, updated: 0 });

    const rows = await listEquipmentLocationIdsForIds({ companyId: cid, equipmentIds: ids });
    if (!rows.length) return res.json({ ok: true, updated: 0 });

    const updateIds = rows.filter((row) => Number.isFinite(row.location_id)).map((row) => Number(row.id));
    if (!updateIds.length) return res.json({ ok: true, updated: 0 });

    const updated = await setEquipmentCurrentLocationToBaseForIds({ companyId: cid, equipmentIds: updateIds });
    const cleanupIds = new Set();

    for (const row of rows) {
      if (!Number.isFinite(row.location_id)) continue;
      if (String(row.current_location_id || "") === String(row.location_id || "")) continue;
      await recordEquipmentCurrentLocationChange({
        companyId: cid,
        equipmentId: Number(row.id),
        fromLocationId: row.current_location_id ?? null,
        toLocationId: Number(row.location_id),
      }).catch(() => null);
      if (row.current_location_id && Number(row.current_location_id) !== Number(row.location_id)) {
        cleanupIds.add(Number(row.current_location_id));
      }
    }

    for (const oldId of cleanupIds) {
      await cleanupNonBaseLocationIfUnused({ companyId: cid, locationId: oldId }).catch(() => null);
    }

    res.json({ ok: true, updated });
  })
);

app.get(
  "/api/equipment",
  asyncHandler(async (req, res) => {
    const { companyId, from, to, dateField } = req.query;
    if (!companyId) return res.status(400).json({ error: "companyId is required." });
    const equipment = await listEquipment(companyId, { from, to, dateField });
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

  if (res.locals?.noCacheHtml) {
    setNoCacheHeaders(res);
  }
  res.sendFile(path.join(spaRoot, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  await initQboDiscovery();
  await ensureTables();
  app.listen(PORT, () => {
    console.log(`API running on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
}

module.exports = {
  app,
  start,
  normalizeSubmissionId,
  normalizeCompanyId,
  rejectUnsafeUpload,
  safeUploadPath,
  isAllowedRedirectHost,
};
