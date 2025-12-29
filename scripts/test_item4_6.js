"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");
const { buildInvoicePdfBuffer } = require("../backend/pdf");

const approxEqual = (actual, expected, epsilon = 0.02) => {
  const diff = Math.abs(Number(actual) - Number(expected));
  assert(diff <= epsilon, `Expected ${expected} but got ${actual} (diff ${diff})`);
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

  let invoiceId = null;
  let customerId = null;

  try {
    await db.upsertCompanySettings({
      companyId,
      taxEnabled: true,
      defaultTaxRate: 5,
      taxRegistrationNumber: "GST-TEST-123",
      taxInclusivePricing: false,
      autoApplyCustomerCredit: true,
    });

    const settings = await db.getCompanySettings(companyId);
    assert(settings.tax_enabled === true, "Tax should be enabled in company settings.");
    approxEqual(settings.default_tax_rate, 0.05);

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

    const lineItems = [
      { description: "Taxed item", quantity: 1, unitPrice: 100, amount: 100 },
      { description: "Non-taxable item", quantity: 1, unitPrice: 50, amount: 50, isTaxable: false },
      { description: "Custom tax item", quantity: 1, unitPrice: 200, amount: 200, taxRate: 10 },
    ];

    const updated = await db.replaceInvoiceLineItems({ companyId, invoiceId, lineItems });
    approxEqual(updated.invoice.subtotal, 350);
    approxEqual(updated.invoice.taxTotal, 25);
    approxEqual(updated.invoice.total, 375);

    const taxLine = updated.lineItems.find((li) => li.description === "Taxed item");
    const customLine = updated.lineItems.find((li) => li.description === "Custom tax item");
    const nonTaxLine = updated.lineItems.find((li) => li.description === "Non-taxable item");

    assert(taxLine && customLine && nonTaxLine, "Expected all line items to be present.");
    approxEqual(taxLine.taxAmount, 5);
    approxEqual(customLine.taxAmount, 20);
    approxEqual(nonTaxLine.taxAmount, 0);

    await db.upsertCompanySettings({ companyId, taxInclusivePricing: true, taxEnabled: true, defaultTaxRate: 5 });
    const inclusiveUpdate = await db.replaceInvoiceLineItems({
      companyId,
      invoiceId,
      lineItems: [{ description: "Inclusive item", quantity: 1, unitPrice: 105, amount: 105 }],
    });
    approxEqual(inclusiveUpdate.invoice.subtotal, 100);
    approxEqual(inclusiveUpdate.invoice.taxTotal, 5);
    approxEqual(inclusiveUpdate.invoice.total, 105);
    assert(inclusiveUpdate.lineItems[0].taxInclusive === true, "Tax inclusive flag should be set.");

    await db.upsertCompanySettings({ companyId, taxInclusivePricing: false, taxEnabled: true, defaultTaxRate: 5 });
    await db.replaceInvoiceLineItems({ companyId, invoiceId, lineItems });

    await db.pool.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [invoiceId]);

    const paid = await db.addInvoicePayment({
      companyId,
      invoiceId,
      amount: 375,
      method: "test",
      reference: "pay-1",
      note: "full payment",
    });
    assert(paid.invoice.status === "paid", "Invoice should be marked paid after full payment.");
    approxEqual(paid.invoice.balance, 0);

    const paymentId = paid.payments[0]?.paymentId;
    assert(paymentId, "Payment ID should be available for reversal.");

    const reversal = await db.reverseInvoicePayment({ companyId, paymentId, reason: "test reversal" });
    assert(reversal.reversalPaymentId, "Reversal payment should be created.");

    const afterReversal = await db.getInvoice({ companyId, id: invoiceId });
    approxEqual(afterReversal.invoice.balance, afterReversal.invoice.total);
    assert(afterReversal.invoice.status === "sent", "Invoice should revert to sent after reversal.");

    await db.addCustomerPayment({ companyId, customerId, amount: 50, method: "credit" });
    const creditBalance = await db.getCustomerCreditBalance({ companyId, customerId });
    approxEqual(creditBalance, 50);

    const applied = await db.applyCustomerCreditToInvoice({ companyId, invoiceId, amount: 50 });
    approxEqual(applied.appliedAmount, 50);

    const afterCredit = await db.getInvoice({ companyId, id: invoiceId });
    approxEqual(afterCredit.invoice.balance, afterCredit.invoice.total - 50);

    const creditBalanceAfter = await db.getCustomerCreditBalance({ companyId, customerId });
    approxEqual(creditBalanceAfter, 0);

    const activity = await db.listCustomerCreditActivity({ companyId, customerId, limit: 20 });
    assert(activity.some((row) => row.type === "payment"), "Expected credit activity to include payment.");
    assert(activity.some((row) => row.type === "allocation"), "Expected credit activity to include allocation.");

    const pdf = await buildInvoicePdfBuffer({
      invoice: afterCredit.invoice,
      lineItems: afterCredit.lineItems,
      payments: afterCredit.payments,
    });
    assert(pdf?.buffer?.length > 1000, "Expected PDF buffer to be generated.");

    console.log("Item 4-6 tests passed.");
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
