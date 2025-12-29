"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

const formatDateInTimeZone = (value, timeZone) => {
  if (!value || !timeZone) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(d).reduce((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});
    if (!parts.year || !parts.month || !parts.day) return null;
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return null;
  }
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
};

const zonedTimeToUtc = ({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset).toISOString();
};

const iso = (value) => new Date(value).toISOString();
const dateOnly = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

const run = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Configure it in .env before testing.");
  }

  await db.ensureTables();

  const ts = Date.now();
  const companyName = `Codex Test Co ${ts}`;
  const contactEmail = `codex_${ts}@example.com`;
  const ownerEmail = `owner_${ts}@example.com`;
  const tz = "America/Edmonton";

  const { company } = await db.createCompanyWithUser({
    companyName,
    contactEmail,
    ownerName: "Codex Tester",
    ownerEmail,
    password: "TestPass123!",
  });
  const companyId = Number(company.id);

  let customerId = null;
  let orderId = null;

  try {
    await db.upsertCompanySettings({ companyId, billingTimeZone: tz, invoiceDateMode: "period_start" });
    const settings = await db.getCompanySettings(companyId);
    assert.strictEqual(settings.billing_timezone, tz);

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

    const type = await db.createType({
      companyId,
      name: `Test Type ${ts}`,
      monthlyRate: 100,
    });

    const equipmentRes = await db.pool.query(
      `
      INSERT INTO equipment
        (company_id, type, model_name, serial_number, condition, image_urls, location_id, current_location_id, type_id)
      VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6, $7, $8)
      RETURNING id
      `,
      [companyId, type.name, "TZ-Model", `SN-${ts}`, "good", location.id, location.id, type.id]
    );
    const equipment = { id: Number(equipmentRes.rows[0].id) };

    const startAt = zonedTimeToUtc({ year: 2024, month: 1, day: 31, hour: 23, minute: 30 }, tz);
    const boundary = zonedTimeToUtc({ year: 2024, month: 2, day: 1, hour: 0, minute: 0 }, tz);
    const endAt = zonedTimeToUtc({ year: 2024, month: 2, day: 1, hour: 1, minute: 30 }, tz);

    assert(Date.parse(startAt) < Date.parse(boundary), "Expected startAt before boundary.");
    assert(Date.parse(boundary) < Date.parse(endAt), "Expected boundary before endAt.");

    const order = await db.createRentalOrder({
      companyId,
      customerId,
      status: "received",
      pickupLocationId: location.id,
      lineItems: [
        {
          typeId: type.id,
          startAt,
          endAt,
          fulfilledAt: startAt,
          returnedAt: endAt,
          rateBasis: "monthly",
          rateAmount: 100,
          inventoryIds: [equipment.id],
        },
      ],
    });
    orderId = Number(order.id);

    const result = await db.generateInvoicesForRentalOrder({ companyId, orderId, mode: "monthly" });
    const created = Array.isArray(result?.created) ? result.created : [];
    assert.strictEqual(created.length, 2, "Expected two monthly invoices for a local month boundary split.");

    const invoiceRes = await db.pool.query(
      `
      SELECT id, service_period_start, service_period_end, period_start, period_end, invoice_date
        FROM invoices
       WHERE company_id = $1 AND rental_order_id = $2
       ORDER BY period_start ASC
      `,
      [companyId, orderId]
    );
    const rows = invoiceRes.rows || [];
    assert.strictEqual(rows.length, 2, "Expected two invoices in storage.");

    const first = rows[0];
    const second = rows[1];

    const firstStart = first.service_period_start || first.period_start;
    const firstEnd = first.service_period_end || first.period_end;
    const secondStart = second.service_period_start || second.period_start;
    const secondEnd = second.service_period_end || second.period_end;

    assert.strictEqual(iso(firstStart), startAt);
    assert.strictEqual(iso(firstEnd), boundary);
    assert.strictEqual(iso(secondStart), boundary);
    assert.strictEqual(iso(secondEnd), endAt);

    const expectedInvoice1 = formatDateInTimeZone(startAt, tz);
    const expectedInvoice2 = formatDateInTimeZone(boundary, tz);
    assert.strictEqual(dateOnly(first.invoice_date), expectedInvoice1);
    assert.strictEqual(dateOnly(second.invoice_date), expectedInvoice2);

    console.log("Item 9 tests passed.");
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
