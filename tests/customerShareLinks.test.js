const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function requestJson({ port, method, path, body, headers }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
          ...(headers || {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function loadServerWithPool(queryHandler) {
  const pg = require("pg");

  class FakePool {
    async query(text, params) {
      return queryHandler(text, params);
    }

    async connect() {
      return {
        query: (text, params) => queryHandler(text, params),
        release() {},
      };
    }
  }

  pg.Pool = FakePool;
  delete require.cache[require.resolve("../backend/db")];
  delete require.cache[require.resolve("../backend/server")];
  return require("../backend/server");
}

function createShareLinkQueryHandler() {
  let nextLinkId = 200;
  const settingsRow = {
    company_id: 1,
    customer_document_categories: ["COI", "W9"],
    customer_terms_template: "Default terms",
    customer_esign_required: true,
    logo_url: "/logo.png",
    rental_info_fields: { preferredPickup: true },
  };

  return async (text, params) => {
    const sql = String(text || "");

    if (sql.includes("FROM company_settings")) {
      return { rows: [settingsRow] };
    }

    if (sql.includes("FROM session s") && sql.includes("company_user_sessions")) {
      return {
        rows: [
          {
            session_id: 99,
            expires_at: new Date().toISOString(),
            user_id: 9,
            user_name: "Test User",
            user_email: "test@example.com",
            user_role: "owner",
            can_act_as_customer: false,
            company_id: 1,
            company_name: "Test Co",
            contact_email: "hello@test.co",
            phone: "555-0100",
            street_address: "123 Test St",
            city: "Testville",
            region: "CA",
            country: "US",
            postal_code: "94105",
          },
        ],
      };
    }

    if (sql.includes("INSERT INTO customer_share_links")) {
      const [
        companyId,
        customerId,
        rentalOrderId,
        scope,
        tokenHash,
        allowedFieldsJson,
        allowedLineItemFieldsJson,
        allowedDocumentCategoriesJson,
        termsText,
        requireEsignature,
        singleUse,
        expiresAt,
        createdByUserId,
      ] = params;

      nextLinkId += 1;
      return {
        rows: [
          {
            id: nextLinkId,
            company_id: companyId,
            customer_id: customerId,
            rental_order_id: rentalOrderId,
            scope,
            token_hash: tokenHash,
            allowed_fields: JSON.parse(allowedFieldsJson),
            allowed_line_item_fields: JSON.parse(allowedLineItemFieldsJson),
            allowed_document_categories: JSON.parse(allowedDocumentCategoriesJson),
            terms_text: termsText,
            require_esignature: requireEsignature,
            single_use: singleUse,
            expires_at: expiresAt,
            created_at: new Date().toISOString(),
            used_at: null,
            revoked_at: null,
            last_change_request_id: null,
            created_by_user_id: createdByUserId,
          },
        ],
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  };
}

test("creates rental order share link with order fields and line items", async (t) => {
  const handler = createShareLinkQueryHandler();
  const { app } = loadServerWithPool(handler);
  const server = app.listen(0);
  const { port } = server.address();
  t.after(() => server.close());

  const res = await requestJson({
    port,
    method: "POST",
    path: "/api/customer-share-links",
    headers: { authorization: "Bearer test-token" },
    body: {
      companyId: 1,
      rentalOrderId: 77,
    },
  });

  assert.equal(res.status, 201);
  const payload = JSON.parse(res.body);
  assert.equal(payload.link.scope, "order_update");
  assert.equal(payload.link.rental_order_id, 77);
  assert.deepEqual(payload.link.allowed_line_item_fields, ["lineItemId", "typeId", "bundleId", "startAt", "endAt"]);
  assert.ok(payload.link.allowed_fields.includes("companyName"));
  assert.ok(payload.link.allowed_fields.includes("siteAddress"));
  assert.ok(payload.link.allowed_fields.includes("siteName"));
  assert.deepEqual(payload.link.allowed_document_categories, ["COI", "W9"]);
  assert.equal(payload.link.require_esignature, true);
  assert.ok(payload.token);
  assert.match(payload.url, /customer-link\.html\?token=/);
});

test("creates customer profile share link without order-only fields", async (t) => {
  const handler = createShareLinkQueryHandler();
  const { app } = loadServerWithPool(handler);
  const server = app.listen(0);
  const { port } = server.address();
  t.after(() => server.close());

  const res = await requestJson({
    port,
    method: "POST",
    path: "/api/customer-share-links",
    headers: { authorization: "Bearer test-token" },
    body: {
      companyId: 1,
      customerId: 55,
      allowedDocumentCategories: ["Insurance"],
      requireEsignature: false,
    },
  });

  assert.equal(res.status, 201);
  const payload = JSON.parse(res.body);
  assert.equal(payload.link.scope, "customer_update");
  assert.equal(payload.link.customer_id, 55);
  assert.deepEqual(payload.link.allowed_line_item_fields, []);
  assert.ok(payload.link.allowed_fields.includes("companyName"));
  assert.ok(!payload.link.allowed_fields.includes("siteAddress"));
  assert.ok(!payload.link.allowed_fields.includes("siteName"));
  assert.deepEqual(payload.link.allowed_document_categories, ["Insurance"]);
  assert.equal(payload.link.require_esignature, false);
});
