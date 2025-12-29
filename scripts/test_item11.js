"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
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
  let locationId = null;
  let typeId = null;
  let equipmentId = null;

  const createInvoice = async ({ startAt, endAt, markSent = true }) => {
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
          rateBasis: "daily",
          rateAmount: 20,
          inventoryIds: [equipmentId],
        },
      ],
    });

    const result = await db.generateInvoicesForRentalOrder({
      companyId,
      orderId: Number(order.id),
      mode: "single",
    });
    const created = Array.isArray(result?.created) ? result.created : [];
    assert.strictEqual(created.length, 1, "Expected one invoice to be created.");
    const invoiceId = Number(created[0].id);
    if (markSent) {
      await db.markInvoiceEmailSent({ companyId, invoiceId });
    }
    return invoiceId;
  };

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
      dailyRate: 20,
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

    const now = Date.now();
    const start1 = new Date(now - 12 * 24 * 60 * 60 * 1000).toISOString();
    const end1 = new Date(now - 11 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId1 = await createInvoice({ startAt: start1, endAt: end1, markSent: true });

    let detail = await db.getInvoice({ companyId, id: invoiceId1 });
    assert.strictEqual(detail.invoice.arStatus, "open", "Sent invoice without payments should be open.");
    let list = await db.listInvoices(companyId, { customerId });
    let row = list.find((inv) => Number(inv.id) === invoiceId1);
    assert.ok(row, "Invoice should appear in listInvoices.");
    assert.strictEqual(row.arStatus, "open", "listInvoices should report open status.");

    const total = money(detail.invoice.total);
    assert.ok(total > 0, "Invoice total should be positive.");
    const partial = money(total / 2);
    await db.addInvoicePayment({ companyId, invoiceId: invoiceId1, amount: partial, method: "cash" });
    detail = await db.getInvoice({ companyId, id: invoiceId1 });
    assert.strictEqual(detail.invoice.arStatus, "partial", "Partial payments should show partial status.");

    const balance = money(detail.invoice.balance);
    await db.addInvoicePayment({ companyId, invoiceId: invoiceId1, amount: balance, method: "cash" });
    detail = await db.getInvoice({ companyId, id: invoiceId1 });
    assert.strictEqual(detail.invoice.arStatus, "paid", "Paid invoices should show paid status.");

    const paymentToReverse = detail.payments.find((p) => p.canReverse);
    assert.ok(paymentToReverse, "Expected a reversible payment.");
    await db.reverseInvoicePayment({
      companyId,
      paymentId: Number(paymentToReverse.paymentId),
      reason: "Test reversal",
    });
    detail = await db.getInvoice({ companyId, id: invoiceId1 });
    assert.ok(Array.isArray(detail.invoice.arTags), "Expected arTags to be returned.");
    assert.ok(detail.invoice.arTags.includes("reversed"), "Reversals should add a reversed tag.");

    await db.addCustomerPayment({ companyId, customerId, amount: 50, method: "credit" });

    const start2 = new Date(now - 9 * 24 * 60 * 60 * 1000).toISOString();
    const end2 = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId2 = await createInvoice({ startAt: start2, endAt: end2, markSent: true });
    list = await db.listInvoices(companyId, { customerId });
    row = list.find((inv) => Number(inv.id) === invoiceId2);
    assert.ok(row, "Second invoice should appear in listInvoices.");
    assert.strictEqual(row.arStatus, "credit", "Customer credit should mark invoices as credit.");

    const start3 = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
    const end3 = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId3 = await createInvoice({ startAt: start3, endAt: end3, markSent: false });
    list = await db.listInvoices(companyId, { customerId });
    row = list.find((inv) => Number(inv.id) === invoiceId3);
    assert.ok(row, "Draft invoice should appear in listInvoices.");
    assert.strictEqual(row.arStatus, "draft", "Draft invoices should report draft status.");

    console.log("Item 11 tests passed.");
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
