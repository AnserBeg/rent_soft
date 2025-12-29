"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

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

  const createOrderAndInvoice = async ({ startAt, endAt, rateBasis, rateAmount }) => {
    const order = await db.createRentalOrder({
      companyId,
      customerId,
      status: "received",
      pickupLocationId: locationId,
      lineItems: [
        {
          typeId,
          startAt,
          endAt,
          fulfilledAt: startAt,
          returnedAt: endAt,
          rateBasis,
          rateAmount,
          inventoryIds: [equipmentId],
        },
      ],
    });

    const lineRes = await db.pool.query(
      `SELECT id FROM rental_order_line_items WHERE rental_order_id = $1 ORDER BY id ASC LIMIT 1`,
      [Number(order.id)]
    );
    const lineItemId = Number(lineRes.rows[0]?.id);
    assert.ok(lineItemId, "Expected rental order line item.");

    const result = await db.createPickupBillingForLineItem({ companyId, lineItemId });
    const created = Array.isArray(result?.created) ? result.created : [];
    assert.strictEqual(created.length, 1, "Expected pickup proration invoice.");

    const invoiceId = Number(created[0].id);
    const detail = await db.getInvoice({ companyId, id: invoiceId });
    assert.ok(detail, "Expected invoice detail.");
    return detail;
  };

  try {
    await db.upsertCompanySettings({ companyId, billingTimeZone: "UTC" });

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
      dailyRate: 100,
      monthlyRate: 310,
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

    await db.upsertCompanySettings({
      companyId,
      billingRoundingMode: "ceil",
      billingRoundingGranularity: "day",
      monthlyProrationMethod: "hours",
    });
    let settings = await db.getCompanySettings(companyId);
    assert.strictEqual(settings.billing_rounding_mode, "ceil");
    assert.strictEqual(settings.billing_rounding_granularity, "day");
    assert.strictEqual(settings.monthly_proration_method, "hours");

    const dayStart = "2024-01-10T00:00:00Z";
    const dayEnd = "2024-01-11T12:00:00Z";
    const dayInvoice = await createOrderAndInvoice({
      startAt: dayStart,
      endAt: dayEnd,
      rateBasis: "daily",
      rateAmount: 100,
    });
    assert.strictEqual(dayInvoice.lineItems.length, 1, "Expected one line item.");
    assert.strictEqual(dayInvoice.lineItems[0].quantity, 2);
    assert.strictEqual(dayInvoice.lineItems[0].amount, 200);
    assert.ok(
      dayInvoice.invoice.generalNotes.includes("Rounding: Round up to day."),
      "Expected rounding note in general notes."
    );

    await db.upsertCompanySettings({
      companyId,
      billingRoundingMode: "none",
      billingRoundingGranularity: "unit",
      monthlyProrationMethod: "hours",
    });
    settings = await db.getCompanySettings(companyId);
    assert.strictEqual(settings.billing_rounding_mode, "none");
    assert.strictEqual(settings.billing_rounding_granularity, "unit");
    assert.strictEqual(settings.monthly_proration_method, "hours");

    const monthStart = "2024-01-05T00:00:00Z";
    const monthEnd = "2024-01-06T12:00:00Z";
    const hourlyInvoice = await createOrderAndInvoice({
      startAt: monthStart,
      endAt: monthEnd,
      rateBasis: "monthly",
      rateAmount: 310,
    });
    assert.strictEqual(hourlyInvoice.lineItems.length, 1, "Expected one line item.");
    const expectedHoursUnits = 1.5 / 31;
    assert.ok(
      Math.abs(hourlyInvoice.lineItems[0].quantity - expectedHoursUnits) < 2e-4,
      "Expected hours-based monthly proration."
    );
    assert.strictEqual(hourlyInvoice.lineItems[0].amount, 15);
    assert.ok(
      hourlyInvoice.invoice.generalNotes.includes("Rounding: exact time (no rounding)."),
      "Expected no-rounding note in general notes."
    );
    assert.ok(
      hourlyInvoice.invoice.generalNotes.includes("Monthly proration: hours-based."),
      "Expected hours-based proration note."
    );

    await db.upsertCompanySettings({
      companyId,
      billingRoundingMode: "none",
      billingRoundingGranularity: "unit",
      monthlyProrationMethod: "days",
    });
    settings = await db.getCompanySettings(companyId);
    assert.strictEqual(settings.monthly_proration_method, "days");

    const dayInvoiceMonthly = await createOrderAndInvoice({
      startAt: monthStart,
      endAt: monthEnd,
      rateBasis: "monthly",
      rateAmount: 310,
    });
    assert.strictEqual(dayInvoiceMonthly.lineItems.length, 1, "Expected one line item.");
    assert.strictEqual(dayInvoiceMonthly.lineItems[0].amount, 20);
    assert.ok(
      dayInvoiceMonthly.invoice.generalNotes.includes("Monthly proration: day-based"),
      "Expected day-based proration note."
    );

    console.log("Item 12 tests passed.");
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
