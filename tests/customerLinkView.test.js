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

test("customer link payload includes lineItem typeName and bundleName", async (t) => {
  const handler = async (text, params) => {
    const sql = String(text || "");

    if (sql.includes("FROM customer_share_links") && sql.includes("WHERE token_hash")) {
      return {
        rows: [
          {
            id: 42,
            company_id: 39,
            customer_id: 117,
            rental_order_id: 108,
            scope: "order_update",
            token_hash: params?.[0] || "hashed",
            allowed_fields: JSON.stringify([]),
            allowed_line_item_fields: JSON.stringify([]),
            allowed_document_categories: JSON.stringify([]),
            terms_text: null,
            require_esignature: true,
            single_use: true,
            expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
            created_at: new Date().toISOString(),
            used_at: null,
            revoked_at: null,
            last_used_ip: null,
            last_used_user_agent: null,
            last_change_request_id: null,
          },
        ],
      };
    }

    if (sql.includes("FROM company_settings")) {
      return {
        rows: [
          {
            company_id: 39,
            logo_url: null,
            customer_document_categories: [],
            customer_terms_template: null,
            customer_esign_required: true,
            customer_service_agreement_url: null,
            rental_info_fields: null,
            customer_contact_categories: [],
          },
        ],
      };
    }

    if (sql.includes("FROM companies") && sql.includes("WHERE id =")) {
      return {
        rows: [
          {
            id: 39,
            name: "demo",
            contact_email: null,
            website: null,
            phone: null,
            street_address: null,
            city: null,
            region: null,
            country: null,
            postal_code: null,
          },
        ],
      };
    }

    if (sql.includes("FROM customer_change_requests") && sql.includes("WHERE company_id")) {
      return { rows: [] };
    }

    if (sql.includes("FROM customers c") && sql.includes("WHERE c.company_id")) {
      return {
        rows: [
          {
            id: 117,
            company_name: "Demo Customer 04",
            display_name: "Demo Customer 04",
            contact_name: "Contact 04",
            street_address: null,
            city: null,
            region: null,
            country: null,
            postal_code: null,
            email: "customer04@demo.local",
            phone: "555-01004",
            contacts: JSON.stringify([{ name: "Contact 04", email: "customer04@demo.local", phone: "555-01004" }]),
            accounting_contacts: JSON.stringify([]),
            contact_groups: JSON.stringify({}),
            can_charge_deposit: false,
            sales_person_id: null,
            follow_up_date: null,
            notes: null,
            is_pending: false,
            parent_customer_id: null,
            parent_company_name: null,
            effective_can_charge_deposit: false,
            qbo_customer_id: null,
          },
        ],
      };
    }

    if (sql.includes("FROM rental_orders ro") && sql.includes("WHERE ro.company_id")) {
      return {
        rows: [
          {
            id: 108,
            status: "reservation",
            customer_po: null,
            fulfillment_method: "pickup",
            pickup_location_id: 129,
            pickup_location_name: "Main",
            pickup_street_address: null,
            pickup_city: null,
            pickup_region: null,
            pickup_country: null,
            dropoff_address: null,
            site_name: null,
            site_address: null,
            site_access_info: null,
            monitoring_personnel: null,
            site_address_lat: null,
            site_address_lng: null,
            site_address_query: null,
            logistics_instructions: null,
            special_instructions: null,
            critical_areas: null,
            notification_circumstances: JSON.stringify([]),
            coverage_hours: JSON.stringify([]),
            coverage_timezone: "UTC",
            coverage_stat_holidays_required: false,
            emergency_contacts: JSON.stringify([]),
            emergency_contact_instructions: null,
            site_contacts: JSON.stringify([]),
            order_contact_settings: JSON.stringify({}),
            general_notes: null,
            is_overdue: false,
          },
        ],
      };
    }

    if (sql.includes("FROM rental_order_line_items li") && sql.includes("WHERE li.rental_order_id")) {
      return {
        rows: [
          {
            id: 343,
            type_id: 999,
            type_name: "Discontinued Type",
            start_at: "2026-05-01T19:56:37.096Z",
            end_at: "2026-05-06T19:56:37.096Z",
            fulfilled_at: null,
            returned_at: null,
            rate_basis: null,
            rate_amount: null,
            billable_units: null,
            line_amount: null,
            bundle_id: null,
            bundle_name: null,
            before_notes: null,
            after_notes: null,
            unit_description: "",
            before_images: JSON.stringify([]),
            after_images: JSON.stringify([]),
            pause_periods: JSON.stringify([]),
            ai_report_markdown: null,
            ai_report_generated_at: null,
          },
        ],
      };
    }

    if (sql.includes("FROM rental_order_line_inventory")) return { rows: [] };
    if (sql.includes("FROM rental_order_fees")) return { rows: [] };
    if (sql.includes("FROM rental_order_notes")) return { rows: [] };
    if (sql.includes("FROM rental_order_attachments")) return { rows: [] };

    if (sql.includes("FROM equipment_types et") && sql.includes("LEFT JOIN equipment_categories")) {
      return {
        rows: [
          {
            id: 253,
            name: "Excavator",
            description: null,
            terms: null,
            category_id: null,
            image_url: null,
            image_urls: JSON.stringify([]),
            documents: JSON.stringify([]),
            qbo_item_id: null,
            daily_rate: null,
            weekly_rate: null,
            monthly_rate: null,
            category: "Excavator",
            created_at: new Date().toISOString(),
          },
        ],
      };
    }

    throw new Error(`Unexpected query: ${sql}`);
  };

  const { app } = loadServerWithPool(handler);
  const server = app.listen(0);
  const { port } = server.address();
  t.after(() => server.close());

  const res = await requestJson({
    port,
    method: "GET",
    path: "/api/public/customer-links/test-token",
  });

  assert.equal(res.status, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.link.scope, "order_update");
  assert.ok(Array.isArray(payload.lineItems));
  assert.equal(payload.lineItems.length, 1);
  assert.equal(payload.lineItems[0].typeId, 999);
  assert.equal(payload.lineItems[0].typeName, "Discontinued Type");
  assert.equal(payload.lineItems[0].bundleName, null);
});

