"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const iso = (value) => new Date(value).toISOString();

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Configure it in .env before testing.");
  }

  await db.ensureTables();

  const ts = Date.now();
  const companyName = `Codex Test Co ${ts}`;
  const contactEmail = `codex_${ts}@example.com`;
  const ownerEmail = `owner_${ts}@example.com`;

  const { company } = await db.createCompanyWithUser({
    companyName,
    contactEmail,
    ownerName: "Codex Tester",
    ownerEmail,
    password: "TestPass123!",
  });
  const companyId = Number(company.id);

  let customerId = null;
  let locationId = null;
  let typeId = null;
  let equipmentId = null;

  try {
    await db.upsertCompanySettings({ companyId, billingTimeZone: "UTC", invoiceDateMode: "generation" });

    const customer = await db.createCustomer({
      companyId,
      companyName: `Test Customer ${ts}`,
      contactName: "Test Contact",
      email: `customer_${ts}@example.com`,
      phone: "555-0000",
      streetAddress: "123 Test St",
      city: "Testville",
      region: "TS",
      country: "CA",
      postalCode: "T3S T00",
    });
    customerId = Number(customer.id);

    const location = await db.createLocation({
      companyId,
      name: `Test Yard ${ts}`,
      streetAddress: "1 Yard Rd",
      city: "Testville",
      region: "TS",
      country: "CA",
    });
    locationId = Number(location.id);

    const type = await db.createType({
      companyId,
      name: `Test Type ${ts}`,
      dailyRate: 10,
    });
    typeId = Number(type.id);

    const equipmentRes = await db.pool.query(
      `
      INSERT INTO equipment
        (company_id, type, model_name, serial_number, condition, image_urls, location_id, current_location_id, type_id)
      VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6, $7, $8)
      RETURNING id
      `,
      [companyId, type.name, "TZ-Model", `SN-${ts}`, "good", locationId, locationId, typeId]
    );
    equipmentId = Number(equipmentRes.rows[0].id);

    const now = new Date();
    const startAt1 = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const endAt1 = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const order1 = await db.createRentalOrder({
      companyId,
      customerId,
      status: "received",
      pickupLocationId: locationId,
      lineItems: [
        {
          typeId,
          startAt: startAt1,
          endAt: endAt1,
          fulfilledAt: startAt1,
          returnedAt: endAt1,
          rateBasis: "daily",
          rateAmount: 10,
          inventoryIds: [equipmentId],
        },
      ],
    });

    const result1 = await db.generateInvoicesForRentalOrder({ companyId, orderId: Number(order1.id), mode: "single" });
    const created1 = Array.isArray(result1?.created) ? result1.created : [];
    assert.strictEqual(created1.length, 1, "Expected one invoice in generation mode.");

    const inv1Res = await db.pool.query(
      `
      SELECT invoice_date, issue_date, service_period_start, service_period_end, period_start, period_end
        FROM invoices
       WHERE company_id = $1 AND rental_order_id = $2
       LIMIT 1
      `,
      [companyId, Number(order1.id)]
    );
    const inv1 = inv1Res.rows[0];
    const expectedToday = dateOnly(new Date());
    const serviceStart1 = inv1.service_period_start || inv1.period_start;
    const serviceEnd1 = inv1.service_period_end || inv1.period_end;

    assert.strictEqual(dateOnly(inv1.invoice_date), expectedToday);
    assert.strictEqual(dateOnly(inv1.issue_date), expectedToday);
    assert.strictEqual(iso(serviceStart1), startAt1);
    assert.strictEqual(iso(serviceEnd1), endAt1);
    assert.notStrictEqual(dateOnly(inv1.invoice_date), dateOnly(serviceStart1));

    await db.upsertCompanySettings({ companyId, invoiceDateMode: "period_start" });

    const startAt2 = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const endAt2 = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();

    const order2 = await db.createRentalOrder({
      companyId,
      customerId,
      status: "received",
      pickupLocationId: locationId,
      lineItems: [
        {
          typeId,
          startAt: startAt2,
          endAt: endAt2,
          fulfilledAt: startAt2,
          returnedAt: endAt2,
          rateBasis: "daily",
          rateAmount: 10,
          inventoryIds: [equipmentId],
        },
      ],
    });

    const result2 = await db.generateInvoicesForRentalOrder({ companyId, orderId: Number(order2.id), mode: "single" });
    const created2 = Array.isArray(result2?.created) ? result2.created : [];
    assert.strictEqual(created2.length, 1, "Expected one invoice in period_start mode.");

    const inv2Res = await db.pool.query(
      `
      SELECT invoice_date, issue_date, service_period_start, service_period_end, period_start, period_end
        FROM invoices
       WHERE company_id = $1 AND rental_order_id = $2
       LIMIT 1
      `,
      [companyId, Number(order2.id)]
    );
    const inv2 = inv2Res.rows[0];
    const serviceStart2 = inv2.service_period_start || inv2.period_start;
    const serviceEnd2 = inv2.service_period_end || inv2.period_end;

    assert.strictEqual(dateOnly(inv2.invoice_date), dateOnly(serviceStart2));
    assert.strictEqual(dateOnly(inv2.issue_date), dateOnly(serviceStart2));
    assert.strictEqual(iso(serviceStart2), startAt2);
    assert.strictEqual(iso(serviceEnd2), endAt2);

    console.log("Item 10 tests passed.");
  } finally {
    if (companyId) {
      await db.pool.query(`UPDATE invoices SET status = 'draft' WHERE company_id = $1`, [companyId]);
      await db.pool.query(
        `
        DELETE FROM invoice_versions
         WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)
        `,
        [companyId]
      );
      await db.pool.query(
        `
        DELETE FROM invoice_payment_allocations
         WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)
            OR payment_id IN (
              SELECT p.id
                FROM invoice_payments p
                JOIN customers c ON c.id = p.customer_id
               WHERE c.company_id = $1
            )
        `,
        [companyId]
      );
      await db.pool.query(
        `
        DELETE FROM invoice_payments
         WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)
            OR customer_id IN (SELECT id FROM customers WHERE company_id = $1)
        `,
        [companyId]
      );
      await db.pool.query(
        `
        DELETE FROM invoice_line_items
         WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = $1)
        `,
        [companyId]
      );
      await db.pool.query(`DELETE FROM invoices WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM doc_sequences WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM rental_orders WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM equipment WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM equipment_types WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM locations WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM customers WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM users WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM company_settings WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
    await db.pool.end();
  }
};

run().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exitCode = 1;
});
