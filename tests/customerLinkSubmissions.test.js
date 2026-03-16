const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

function buildMultipart(fields) {
  const boundary = `----rentsoft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parts = [];
  Object.entries(fields).forEach(([name, value]) => {
    parts.push(`--${boundary}\r\n`);
    parts.push(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
    parts.push(`${value}\r\n`);
  });
  parts.push(`--${boundary}--\r\n`);
  const body = Buffer.from(parts.join(""), "utf8");
  return { body, boundary };
}

function requestMultipart({ port, method, path, fields, headers }) {
  return new Promise((resolve, reject) => {
    const { body, boundary } = buildMultipart(fields);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
          "content-length": body.length,
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
    req.write(body);
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

function createSubmissionQueryHandler(captured) {
  let nextCustomerId = 700;
  let nextChangeId = 900;

  const linkRow = {
    id: 88,
    company_id: 1,
    customer_id: null,
    rental_order_id: null,
    scope: "new_quote",
    token_hash: "hash",
    allowed_fields: ["companyName", "orderContactSettings", "customerPo"],
    allowed_line_item_fields: ["typeId", "startAt", "endAt"],
    allowed_document_categories: [],
    terms_text: null,
    require_esignature: false,
    single_use: false,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    used_at: null,
    revoked_at: null,
    last_used_ip: null,
    last_used_user_agent: null,
    last_change_request_id: null,
  };

  const settingsRow = {
    company_id: 1,
    customer_document_categories: [],
    customer_terms_template: null,
    customer_esign_required: false,
    customer_service_agreement_url: null,
    logo_url: null,
    rental_info_fields: null,
  };

  const companyRow = {
    id: 1,
    name: "Test Co",
    contact_email: "hello@test.co",
    website: null,
    phone: null,
    street_address: null,
    city: null,
    region: null,
    country: null,
    postal_code: null,
  };

  const typeRow = {
    id: 1,
    name: "Scissor Lift",
    description: null,
    terms: null,
    category_id: null,
    image_url: null,
    image_urls: null,
    documents: null,
    qbo_item_id: null,
    daily_rate: null,
    weekly_rate: null,
    monthly_rate: null,
    category: null,
    created_at: new Date().toISOString(),
  };

  return async (text, params) => {
    const sql = String(text || "");

    if (sql.includes("FROM customer_share_links")) {
      return { rows: [linkRow] };
    }

    if (sql.includes("FROM company_settings")) {
      return { rows: [settingsRow] };
    }

    if (sql.includes("FROM equipment_types")) {
      return { rows: [typeRow] };
    }

    if (sql.includes("FROM companies")) {
      return { rows: [companyRow] };
    }

    if (sql.startsWith("INSERT INTO customers")) {
      nextCustomerId += 1;
      return { rows: [{ id: nextCustomerId }] };
    }

    if (sql.includes("INSERT INTO customer_change_requests")) {
      nextChangeId += 1;
      captured.payload = JSON.parse(params[6] || "{}");
      return {
        rows: [
          {
            id: nextChangeId,
            company_id: 1,
            customer_id: params[1],
            rental_order_id: null,
            link_id: linkRow.id,
            scope: linkRow.scope,
            status: params[5],
            payload: captured.payload,
            documents: JSON.parse(params[7] || "[]"),
            signature: JSON.parse(params[8] || "{}"),
            proof_pdf_path: null,
            submitted_at: new Date().toISOString(),
          },
        ],
      };
    }

    if (sql.includes("UPDATE customer_change_requests")) {
      return { rows: [{ id: params[params.length - 2], proof_pdf_path: params[0] }] };
    }

    if (sql.includes("UPDATE customer_share_links")) {
      return { rows: [{ id: linkRow.id, used_at: new Date().toISOString(), last_change_request_id: nextChangeId }] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  };
}

test("customer link submission persists orderContactSettings in change request payload", async (t) => {
  const captured = { payload: null };
  const handler = createSubmissionQueryHandler(captured);
  const { app } = loadServerWithPool(handler);
  const server = app.listen(0);
  const { port } = server.address();
  t.after(() => server.close());

  const orderContactSettings = {
    safetyContacts: {
      mode: "override",
      contacts: [{ name: "Safety Lead", email: "safety@example.com", phone: "555-0303" }],
    },
    billingContacts: {
      mode: "subset",
      contacts: [{ name: "Billing", email: "billing@example.com" }],
    },
  };

  const payload = {
    customer: { companyName: "Acme Rentals" },
    order: { orderContactSettings },
    lineItems: [
      {
        typeId: 1,
        startAt: "2026-03-01T00:00:00.000Z",
        endAt: "2026-03-02T00:00:00.000Z",
      },
    ],
  };

  const res = await requestMultipart({
    port,
    method: "POST",
    path: "/api/public/customer-links/test-token/submit",
    fields: {
      payload: JSON.stringify(payload),
    },
  });

  assert.equal(res.status, 201);
  assert.ok(captured.payload, "Expected change request payload to be captured.");
  assert.deepEqual(captured.payload.order.orderContactSettings, orderContactSettings);
});
