"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");
const { buildInvoicePdfBuffer } = require("../backend/pdf");

const buildSnapshot = (detail) => ({
  generatedAt: new Date().toISOString(),
  invoice: detail?.invoice || null,
  lineItems: Array.isArray(detail?.lineItems) ? detail.lineItems : [],
  payments: Array.isArray(detail?.payments) ? detail.payments : [],
  companyProfile: null,
  companyLogoUrl: null,
});

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

  const createInvoice = async ({ startAt, endAt }) => {
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
          rateAmount: 50,
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
    return Number(created[0].id);
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
      dailyRate: 50,
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
    const start1 = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
    const end1 = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId1 = await createInvoice({ startAt: start1, endAt: end1 });

    const voided = await db.voidInvoice({
      companyId,
      invoiceId: invoiceId1,
      reason: "Test void reason",
      voidedBy: "tester@example.com",
    });
    assert.ok(voided?.id, "Expected voidInvoice to return an id.");

    let detail = await db.getInvoice({ companyId, id: invoiceId1 });
    assert.strictEqual(detail.invoice.status, "void", "Invoice status should be void.");
    assert.strictEqual(detail.invoice.voidReason, "Test void reason");
    assert.strictEqual(detail.invoice.voidedBy, "tester@example.com");
    assert.ok(detail.invoice.voidedAt, "Expected voidedAt to be set.");

    const voidedAgain = await db.voidInvoice({
      companyId,
      invoiceId: invoiceId1,
      reason: "Test void reason",
      voidedBy: "tester@example.com",
    });
    assert.strictEqual(voidedAgain?.alreadyVoid, true, "Expected second void to report alreadyVoid.");

    detail = await db.getInvoice({ companyId, id: invoiceId1 });
    const pdf = await buildInvoicePdfBuffer({ ...detail, timeZone: "UTC" });
    assert.ok(Buffer.isBuffer(pdf.buffer) && pdf.buffer.length > 0, "Expected PDF buffer to be generated.");
    await db.createInvoiceVersion({
      companyId,
      invoiceId: invoiceId1,
      snapshot: buildSnapshot(detail),
      pdfBuffer: pdf.buffer,
      pdfFilename: pdf.filename,
    });
    const latestVersion = await db.getLatestInvoiceVersion({ companyId, invoiceId: invoiceId1 });
    assert.ok(latestVersion?.pdfBytes?.length > 0, "Expected latest invoice version to have pdf bytes.");

    const start2 = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString();
    const end2 = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const invoiceId2 = await createInvoice({ startAt: start2, endAt: end2 });
    await db.addInvoicePayment({ companyId, invoiceId: invoiceId2, amount: 10, method: "cash" });
    let blocked = false;
    try {
      await db.voidInvoice({
        companyId,
        invoiceId: invoiceId2,
        reason: "Should fail",
        voidedBy: "tester@example.com",
      });
    } catch (err) {
      blocked = err?.code === "PAYMENTS_EXIST";
    }
    assert.strictEqual(blocked, true, "Expected void to fail when payments are applied.");

    console.log("Item 13 tests passed.");
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
