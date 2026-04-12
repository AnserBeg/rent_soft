#!/usr/bin/env node
/* eslint-disable no-console */

const http = require("node:http");
const https = require("node:https");
const { URL } = require("node:url");

function usage() {
  console.log(`Usage:
  node scripts/diagnose-customer-link.js --url <customer-link-url>
  node scripts/diagnose-customer-link.js --token <token> [--base <baseUrl>]

Examples:
  node scripts/diagnose-customer-link.js --url "http://127.0.0.1:4000/customer-link.html?token=..."
  node scripts/diagnose-customer-link.js --token abc123 --base "http://127.0.0.1:4000/"
`);
}

function maskToken(token) {
  const clean = String(token || "").trim();
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}…${clean.slice(-6)}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value && !value.startsWith("--")) {
      out[key] = value;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function requestJson(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? https : http;
    const start = Date.now();
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: { accept: "application/json" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          const durationMs = Date.now() - start;
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch {
            json = null;
          }
          resolve({
            status: res.statusCode || 0,
            durationMs,
            headers: res.headers || {},
            body,
            json,
          });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function summarizePayload(json) {
  if (!json || typeof json !== "object") return null;
  const link = json.link || {};
  const order = json.order || null;
  return {
    link: {
      id: link.id ?? null,
      scope: link.scope ?? null,
      singleUse: link.singleUse ?? null,
      usedAt: link.usedAt ?? null,
      expiresAt: link.expiresAt ?? null,
      requireEsignature: link.requireEsignature ?? null,
      documentCategoriesCount: Array.isArray(link.documentCategories) ? link.documentCategories.length : null,
      hasTermsText: Boolean(link.termsText),
      hasServiceAgreement: Boolean(link.serviceAgreement?.url),
      hasSignedServiceAgreement: Boolean(link.serviceAgreement?.signedDoc?.url),
    },
    company: {
      id: json.company?.id ?? null,
      hasName: Boolean(json.company?.name),
    },
    customer: {
      id: json.customer?.id ?? null,
      hasCompanyName: Boolean(json.customer?.companyName),
    },
    order: order
      ? {
          id: order.id ?? null,
          status: order.status ?? null,
          fulfillmentMethod: order.fulfillmentMethod ?? null,
        }
      : null,
    contactCategoriesCount: Array.isArray(json.contactCategories) ? json.contactCategories.length : null,
    orderUnitsCount: Array.isArray(json.orderUnits) ? json.orderUnits.length : null,
    lineItemsCount: Array.isArray(json.lineItems) ? json.lineItems.length : null,
    proofAvailable: json.proofAvailable ?? null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    usage();
    process.exit(0);
  }

  const urlArg = args.url || args.u || "";
  const tokenArg = args.token || args.t || "";
  const baseArg = args.base || args.b || "";

  let token = String(tokenArg || "").trim();
  let baseUrl = String(baseArg || "").trim();

  if (urlArg) {
    const url = new URL(String(urlArg));
    token = token || url.searchParams.get("token") || "";
    baseUrl = baseUrl || new URL(".", url).toString();
  }

  if (!token) {
    console.error("Missing token. Provide --url (with ?token=) or --token.");
    usage();
    process.exit(2);
  }

  if (!baseUrl) {
    const port = Number(process.env.PORT) || 4000;
    baseUrl = `http://127.0.0.1:${port}/`;
  }

  console.log(`Customer link token: ${maskToken(token)}`);
  const apiPath = `api/public/customer-links/${encodeURIComponent(token)}`;
  const apiUrl = new URL(apiPath, baseUrl).toString();
  const safeApiUrl = new URL(`api/public/customer-links/${encodeURIComponent(maskToken(token))}`, baseUrl).toString();
  console.log(`GET ${safeApiUrl}`);

  const res = await requestJson(apiUrl);
  console.log(`Status: ${res.status} (${res.durationMs}ms)`);

  if (!res.json) {
    const preview = String(res.body || "").slice(0, 220).replace(/\s+/g, " ").trim();
    console.log(`Non-JSON response preview: ${preview || "(empty)"}`);
    process.exit(res.status === 200 ? 0 : 1);
  }

  if (res.status !== 200) {
    console.log(`Error: ${res.json.error || "(no error field)"}`);
    process.exit(1);
  }

  console.log(JSON.stringify(summarizePayload(res.json), null, 2));
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
