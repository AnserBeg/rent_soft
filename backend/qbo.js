const crypto = require("crypto");

const DEFAULT_MINOR_VERSION = 75;

function getQboConfig() {
  const clientId = String(process.env.QBO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.QBO_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.QBO_REDIRECT_URI || "").trim();
  const env = String(process.env.QBO_ENV || "production").trim().toLowerCase();
  const minorVersion = Number(process.env.QBO_MINOR_VERSION || DEFAULT_MINOR_VERSION);
  const host = env === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
  return {
    clientId,
    clientSecret,
    redirectUri,
    env,
    host,
    minorVersion: Number.isFinite(minorVersion) ? minorVersion : DEFAULT_MINOR_VERSION,
  };
}

function buildAuthUrl({ clientId, redirectUri, state, scopes } = {}) {
  const scopeList = Array.isArray(scopes) && scopes.length ? scopes : ["com.intuit.quickbooks.accounting"];
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: scopeList.join(" "),
    redirect_uri: redirectUri,
    state: state || "",
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

function buildBasicAuthHeader({ clientId, clientSecret }) {
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${token}`;
}

async function requestToken({ grantType, code, refreshToken, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: grantType,
  });
  if (code) body.set("code", code);
  if (refreshToken) body.set("refresh_token", refreshToken);
  if (redirectUri) body.set("redirect_uri", redirectUri);

  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
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

async function exchangeAuthCode({ code, redirectUri, clientId, clientSecret }) {
  return await requestToken({
    grantType: "authorization_code",
    code,
    redirectUri,
    clientId,
    clientSecret,
  });
}

async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  return await requestToken({
    grantType: "refresh_token",
    refreshToken,
    clientId,
    clientSecret,
  });
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
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  if (!res.ok) {
    const message =
      data?.Fault?.Error?.[0]?.Message ||
      data?.Fault?.Error?.[0]?.Detail ||
      data?.error_description ||
      data?.error ||
      `QBO request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = data;
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
  buildAuthUrl,
  exchangeAuthCode,
  refreshAccessToken,
  qboRequest,
  computeExpiryTimestamp,
  verifyWebhookSignature,
};
