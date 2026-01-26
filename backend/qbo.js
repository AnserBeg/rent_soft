const crypto = require("crypto");

const DEFAULT_MINOR_VERSION = 75;
const DEFAULT_DOC_NUMBER_MODE = "rental";
const DEFAULT_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const DEFAULT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const DEFAULT_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const DEFAULT_DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";

const discoveryState = {
  loaded: false,
  fetchedAt: null,
  endpoints: {
    authUrl: DEFAULT_AUTH_URL,
    tokenUrl: DEFAULT_TOKEN_URL,
    revokeUrl: DEFAULT_REVOKE_URL,
  },
};

function getQboDiscoveryUrl() {
  return String(process.env.QBO_DISCOVERY_URL || DEFAULT_DISCOVERY_URL).trim();
}

function getQboEndpoints() {
  const authOverride = String(process.env.QBO_AUTH_URL || "").trim();
  const tokenOverride = String(process.env.QBO_TOKEN_URL || "").trim();
  const revokeOverride = String(process.env.QBO_REVOKE_URL || "").trim();
  const endpoints = discoveryState.endpoints || {};
  return {
    authUrl: authOverride || endpoints.authUrl || DEFAULT_AUTH_URL,
    tokenUrl: tokenOverride || endpoints.tokenUrl || DEFAULT_TOKEN_URL,
    revokeUrl: revokeOverride || endpoints.revokeUrl || DEFAULT_REVOKE_URL,
  };
}

async function initQboDiscovery() {
  if (discoveryState.loaded) return discoveryState;
  const url = getQboDiscoveryUrl();
  if (!url) {
    discoveryState.loaded = true;
    discoveryState.fetchedAt = new Date().toISOString();
    return discoveryState;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), 5000) : null;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) {
      throw new Error(`QBO discovery error (${res.status})`);
    }
    const data = await res.json().catch(() => null);
    discoveryState.endpoints = {
      authUrl: String(data?.authorization_endpoint || "").trim() || DEFAULT_AUTH_URL,
      tokenUrl: String(data?.token_endpoint || "").trim() || DEFAULT_TOKEN_URL,
      revokeUrl: String(data?.revocation_endpoint || "").trim() || DEFAULT_REVOKE_URL,
    };
    discoveryState.loaded = true;
    discoveryState.fetchedAt = new Date().toISOString();
    console.info("QBO discovery loaded", {
      authUrl: discoveryState.endpoints.authUrl,
      tokenUrl: discoveryState.endpoints.tokenUrl,
      revokeUrl: discoveryState.endpoints.revokeUrl,
    });
  } catch (err) {
    discoveryState.loaded = true;
    discoveryState.fetchedAt = new Date().toISOString();
    discoveryState.endpoints = {
      authUrl: DEFAULT_AUTH_URL,
      tokenUrl: DEFAULT_TOKEN_URL,
      revokeUrl: DEFAULT_REVOKE_URL,
    };
    console.warn("QBO discovery failed; using default endpoints.", {
      error: err?.message ? String(err.message) : "Unknown error",
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  return discoveryState;
}

function getQboConfig() {
  const clientId = String(process.env.QBO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.QBO_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.QBO_REDIRECT_URI || "").trim();
  const env = String(process.env.QBO_ENV || "production").trim().toLowerCase();
  const minorVersion = Number(process.env.QBO_MINOR_VERSION || DEFAULT_MINOR_VERSION);
  const defaultTaxCode = String(process.env.QBO_DEFAULT_TAX_CODE || "").trim();
  const docNumberMode = normalizeQboDocNumberMode(process.env.QBO_DOC_NUMBER_MODE);
  const host = env === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
  const endpoints = getQboEndpoints();
  return {
    clientId,
    clientSecret,
    redirectUri,
    env,
    host,
    minorVersion: Number.isFinite(minorVersion) ? minorVersion : DEFAULT_MINOR_VERSION,
    defaultTaxCode,
    docNumberMode,
    revokeUrl: endpoints.revokeUrl,
    authUrl: endpoints.authUrl,
    tokenUrl: endpoints.tokenUrl,
  };
}

function normalizeQboDocNumberMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "qbo" || raw === "auto" || raw === "quickbooks" || raw === "quickbooks_auto") return "qbo";
  if (raw === "rental" || raw === "rent_soft" || raw === "custom") return "rental";
  return DEFAULT_DOC_NUMBER_MODE;
}

function buildAuthUrl({ clientId, redirectUri, state, scopes, authUrl } = {}) {
  const scopeList = Array.isArray(scopes) && scopes.length ? scopes : ["com.intuit.quickbooks.accounting"];
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: scopeList.join(" "),
    redirect_uri: redirectUri,
    state: state || "",
  });
  const base = String(authUrl || getQboEndpoints().authUrl || DEFAULT_AUTH_URL).trim();
  if (!base) throw new Error("QBO authorization URL is not configured.");
  return `${base}?${params.toString()}`;
}

function buildBasicAuthHeader({ clientId, clientSecret }) {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${token}`;
}

async function requestToken({ grantType, code, refreshToken, redirectUri, clientId, clientSecret, tokenUrl }) {
  const body = new URLSearchParams({
    grant_type: grantType,
  });
  if (code) body.set("code", code);
  if (refreshToken) body.set("refresh_token", refreshToken);
  if (redirectUri) body.set("redirect_uri", redirectUri);

  const resolvedTokenUrl = String(tokenUrl || getQboEndpoints().tokenUrl || DEFAULT_TOKEN_URL).trim();
  if (!resolvedTokenUrl) throw new Error("QBO token URL is not configured.");

  const res = await fetch(resolvedTokenUrl, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader({ clientId, clientSecret }),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error_description || data?.error || `QBO token error (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function exchangeAuthCode({ code, redirectUri, clientId, clientSecret, tokenUrl }) {
  return await requestToken({
    grantType: "authorization_code",
    code,
    redirectUri,
    clientId,
    clientSecret,
    tokenUrl,
  });
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret, tokenUrl }) {
  return await requestToken({
    grantType: "refresh_token",
    refreshToken,
    clientId,
    clientSecret,
    tokenUrl,
  });
}

async function revokeToken({ token, clientId, clientSecret, revokeUrl, tokenTypeHint } = {}) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) throw new Error("QBO token is required for revoke.");
  const url = String(revokeUrl || "").trim();
  if (!url) throw new Error("QBO revoke URL is not configured.");

  const body = new URLSearchParams({ token: cleanToken });
  if (tokenTypeHint) body.set("token_type_hint", String(tokenTypeHint));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader({ clientId, clientSecret }),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const message = text ? `QBO revoke failed (${res.status}): ${text}` : `QBO revoke failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = text;
    throw err;
  }
  return true;
}

function appendMinorVersion(url, minorVersion) {
  if (!minorVersion) return url;
  const next = new URL(url.toString());
  if (!next.searchParams.has("minorversion")) {
    next.searchParams.set("minorversion", String(minorVersion));
  }
  return next;
}

async function qboRequest({ host, realmId, accessToken, method = "GET", path, body, minorVersion }) {
  const url = appendMinorVersion(new URL(`${host}/v3/company/${realmId}/${path}`), minorVersion);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  let payload = null;
  if (body !== undefined && body !== null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), { method, headers, body: payload });
  const intuitTid =
    res.headers?.get("intuit_tid") ||
    res.headers?.get("intuit-tid") ||
    res.headers?.get("intuit_tid".toUpperCase()) ||
    null;
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (data?.Fault?.Error?.length) {
    const err0 = data?.Fault?.Error?.[0] || {};
    const detail = err0.Detail || err0.detail || null;
    const message =
      detail ||
      err0.Message ||
      err0.message ||
      data?.error_description ||
      data?.error ||
      "QBO request failed (fault)";
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    err.intuitTid = intuitTid;
    err.request = { method, path, realmId, host };
    throw err;
  }
  if (!res.ok) {
    const err0 = data?.Fault?.Error?.[0] || {};
    const detail = err0.Detail || err0.detail || null;
    const message =
      detail ||
      err0.Message ||
      err0.message ||
      data?.error_description ||
      data?.error ||
      `QBO request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
    err.intuitTid = intuitTid;
    err.request = { method, path, realmId, host };
    throw err;
  }
  return data;
}

function computeExpiryTimestamp(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(Date.now() + sec * 1000).toISOString();
}

function verifyWebhookSignature({ payload, signature, verifierToken }) {
  if (!payload || !signature || !verifierToken) return false;
  const hmac = crypto.createHmac("sha256", verifierToken).update(payload).digest("base64");
  const a = Buffer.from(hmac, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  getQboConfig,
  initQboDiscovery,
  buildAuthUrl,
  exchangeAuthCode,
  refreshAccessToken,
  revokeToken,
  qboRequest,
  computeExpiryTimestamp,
  verifyWebhookSignature,
};
