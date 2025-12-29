"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");
const { buildInvoicePdfBuffer } = require("../backend/pdf");

const approxEqual = (actual, expected, epsilon = 0.02) => {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(diff <= epsilon, `Expected ${expected} but got ${actual} (diff ${diff})`);
};

const assertThrows = async (fn, messageMatch) => {
  let threw = false;
  try {
    await fn();
  } catch (err) {
    threw = true;
    if (messageMatch) {
      const msg = String(err?.message || err);
      assert(msg.includes(messageMatch), `Expected error to include "${messageMatch}", got "${msg}"`);
    }
  }
  assert(threw, "Expected function to throw.");
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

  let baseInvoiceId = null;
  let customerId = null;

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
    baseInvoiceId = Number(invRes.rows[0].id);

    const initialLines = [
      { description: "Item A", quantity: 1, unitPrice: 100, amount: 100 },
      { description: "Item B", quantity: 2, unitPrice: 50, amount: 100 },
    ];

    const initial = await db.replaceInvoiceLineItems({ companyId, invoiceId: baseInvoiceId, lineItems: initialLines });
    approxEqual(initial.invoice.total, 200);

    // Item 1: lock edits for non-draft invoices (DB trigger).
    await db.pool.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [baseInvoiceId]);

    await assertThrows(
      () =>
        db.replaceInvoiceLineItems({
          companyId,
          invoiceId: baseInvoiceId,
          lineItems: [{ description: "Should fail", quantity: 1, unitPrice: 1, amount: 1 }],
        }),
      "locked for edits"
    );

    const lockedInvoice = await db.getInvoice({ companyId, id: baseInvoiceId });
    assert(lockedInvoice.lineItems.length === 2, "Line items should remain unchanged after failed edit.");

    // Item 2: invoice versions store snapshots + PDFs.
    const detail = await db.getInvoice({ companyId, id: baseInvoiceId });
    const pdf = await buildInvoicePdfBuffer({
      invoice: detail.invoice,
      lineItems: detail.lineItems,
      payments: detail.payments,
    });
    assert(pdf?.buffer?.length > 1000, "Expected PDF buffer to be generated.");

    const snapshot = {
      generatedAt: new Date().toISOString(),
      invoice: detail.invoice,
      lineItems: detail.lineItems,
      payments: detail.payments,
    };

    const version1 = await db.createInvoiceVersion({
      companyId,
      invoiceId: baseInvoiceId,
      snapshot,
      pdfBuffer: pdf.buffer,
      pdfFilename: pdf.filename,
    });
    assert(version1?.id, "Expected invoice version to be created.");

    const sentAt1 = await db.markInvoiceVersionSent({
      companyId,
      invoiceId: baseInvoiceId,
      versionId: version1.id,
    });
    assert(sentAt1, "Expected version to be marked sent.");

    const version2 = await db.createInvoiceVersion({
      companyId,
      invoiceId: baseInvoiceId,
      snapshot,
      pdfBuffer: pdf.buffer,
      pdfFilename: pdf.filename,
    });
    const sentAt2 = new Date(Date.now() + 1000).toISOString();
    await db.markInvoiceVersionSent({
      companyId,
      invoiceId: baseInvoiceId,
      versionId: version2.id,
      sentAt: sentAt2,
    });

    const latest = await db.getLatestSentInvoiceVersion({ companyId, invoiceId: baseInvoiceId });
    assert(latest && latest.id === version2.id, "Expected latest sent invoice version to be returned.");
    assert(latest.pdfBytes && latest.pdfBytes.length > 1000, "Expected stored PDF bytes.");

    // Item 3: corrections via credit/debit memos.
    const creditMemo = await db.createInvoiceCorrection({
      companyId,
      invoiceId: baseInvoiceId,
      documentType: "credit_memo",
    });
    assert(creditMemo?.id, "Expected credit memo to be created.");

    const creditDetail = await db.getInvoice({ companyId, id: creditMemo.id });
    assert(creditDetail.invoice.documentType === "credit_memo", "Expected credit memo document type.");
    assert(creditDetail.invoice.appliesToInvoiceId === baseInvoiceId, "Expected applies_to_invoice_id to be set.");
    assert(String(creditDetail.invoice.invoiceNumber || "").startsWith("CRM"), "Expected CRM prefix.");
    assert(creditDetail.invoice.status === "draft", "Credit memo should be draft.");

    // Draft invoices should not allow corrections.
    const draftRes = await db.pool.query(
      `
      INSERT INTO invoices (company_id, invoice_number, customer_id, status, issue_date, due_date)
      VALUES ($1, $2, $3, 'draft', CURRENT_DATE, CURRENT_DATE)
      RETURNING id
      `,
      [companyId, `TEST-DRAFT-${ts}`, customerId]
    );
    const draftInvoiceId = Number(draftRes.rows[0].id);

    await assertThrows(
      () => db.createInvoiceCorrection({ companyId, invoiceId: draftInvoiceId, documentType: "debit_memo" }),
      "Draft invoices can be edited"
    );

    console.log("Item 1-3 tests passed.");
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
      await db.pool.query(`DELETE FROM customers WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM users WHERE company_id = $1`, [companyId]);
      await db.pool.query(`DELETE FROM locations WHERE company_id = $1`, [companyId]);
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
