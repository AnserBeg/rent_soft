"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

const assertUniqueViolation = async (fn, constraint) => {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert(err, "Expected unique violation.");
  if (err?.code) {
    assert.strictEqual(err.code, "23505");
  }
  if (constraint) {
    assert.strictEqual(err?.constraint, constraint);
  }
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

  const { company } = await db.createCompanyWithUser({
    companyName,
    contactEmail,
    ownerName: "Codex Tester",
    ownerEmail,
    password: "TestPass123!",
  });
  const companyId = Number(company.id);

  let customerId = null;
  let invoiceId = null;
  let orderId = null;

  try {
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

    const invoiceNumber = `TEST-${ts}`;
    const invRes = await db.pool.query(
      `
      INSERT INTO invoices (company_id, invoice_number, customer_id, status, issue_date, due_date)
      VALUES ($1, $2, $3, 'draft', CURRENT_DATE, CURRENT_DATE)
      RETURNING id
      `,
      [companyId, invoiceNumber, customerId]
    );
    invoiceId = Number(invRes.rows[0].id);

    const originKey = `origin-${ts}`;
    await db.pool.query(
      `
      INSERT INTO invoice_line_items
        (invoice_id, description, quantity, unit_price, amount, sort_order, origin_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [invoiceId, "Line A", 1, 100, 100, 0, originKey]
    );

    await assertUniqueViolation(
      () =>
        db.pool.query(
          `
          INSERT INTO invoice_line_items
            (invoice_id, description, quantity, unit_price, amount, sort_order, origin_key)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [invoiceId, "Line A duplicate", 1, 100, 100, 1, originKey]
        ),
      "invoice_line_items_origin_key_uniq"
    );

    const dupRes = await db.pool.query(
      `
      INSERT INTO invoice_line_items
        (invoice_id, description, quantity, unit_price, amount, sort_order, origin_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (invoice_id, origin_key) DO NOTHING
      `,
      [invoiceId, "Line A duplicate", 1, 100, 100, 1, originKey]
    );
    assert.strictEqual(dupRes.rowCount, 0, "Expected duplicate origin_key insert to be ignored.");

    const countRes = await db.pool.query(
      `SELECT COUNT(*)::int AS count FROM invoice_line_items WHERE invoice_id = $1`,
      [invoiceId]
    );
    assert.strictEqual(Number(countRes.rows[0].count), 1);

    const roRes = await db.pool.query(
      `
      INSERT INTO rental_orders (company_id, customer_id, status)
      VALUES ($1, $2, 'received')
      RETURNING id
      `,
      [companyId, customerId]
    );
    orderId = Number(roRes.rows[0].id);

    const periodStart = new Date("2024-01-01T00:00:00Z").toISOString();
    const periodEnd = new Date("2024-02-01T00:00:00Z").toISOString();

    await db.pool.query(
      `
      INSERT INTO invoices
        (company_id, invoice_number, customer_id, rental_order_id, status, issue_date, due_date, period_start, period_end, billing_reason, document_type)
      VALUES ($1,$2,$3,$4,'draft',$5::date,$6::date,$7::timestamptz,$8::timestamptz,$9,$10)
      `,
      [companyId, `RO-${ts}`, customerId, orderId, "2024-02-01", "2024-02-01", periodStart, periodEnd, "monthly", "invoice"]
    );

    await assertUniqueViolation(
      () =>
        db.pool.query(
          `
          INSERT INTO invoices
            (company_id, invoice_number, customer_id, rental_order_id, status, issue_date, due_date, period_start, period_end, billing_reason, document_type)
          VALUES ($1,$2,$3,$4,'draft',$5::date,$6::date,$7::timestamptz,$8::timestamptz,$9,$10)
          `,
          [
            companyId,
            `RO-${ts}-dup`,
            customerId,
            orderId,
            "2024-02-01",
            "2024-02-01",
            periodStart,
            periodEnd,
            "monthly",
            "invoice",
          ]
        ),
      "invoices_company_ro_period_reason_doc_uniq"
    );

    const runMonth = "2024-01-01";
    await db.pool.query(
      `INSERT INTO billing_runs (company_id, run_month, status) VALUES ($1, $2::date, 'running')`,
      [companyId, runMonth]
    );

    await assertUniqueViolation(
      () =>
        db.pool.query(
          `INSERT INTO billing_runs (company_id, run_month, status) VALUES ($1, $2::date, 'running')`,
          [companyId, runMonth]
        ),
      "billing_runs_company_month_uniq"
    );

    console.log("Item 8 tests passed.");
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
      await db.pool.query(`DELETE FROM billing_runs WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM doc_sequences WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM rental_orders WHERE company_id = $1`, [companyId]);
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
