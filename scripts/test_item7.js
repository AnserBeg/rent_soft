"use strict";

require("dotenv").config();
const assert = require("assert");
const db = require("../backend/db");

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

  let invoiceId = null;
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
    invoiceId = Number(invRes.rows[0].id);

    const lineItems = [{ description: "Deposit Test Item", quantity: 1, unitPrice: 100, amount: 100 }];
    const updated = await db.replaceInvoiceLineItems({ companyId, invoiceId, lineItems });
    approxEqual(updated.invoice.total, 100);

    const dep1 = await db.addCustomerDeposit({ companyId, customerId, amount: 120, method: "deposit" });
    assert(dep1?.paymentId, "Expected deposit payment id.");

    const depositBalance1 = await db.getCustomerDepositBalance({ companyId, customerId });
    approxEqual(depositBalance1, 120);

    const applied1 = await db.applyCustomerDepositToInvoice({ companyId, invoiceId, amount: 50 });
    approxEqual(applied1.appliedAmount, 50);

    const invoiceAfter1 = await db.getInvoice({ companyId, id: invoiceId });
    approxEqual(invoiceAfter1.invoice.balance, 50);
    assert(invoiceAfter1.payments.some((p) => p.isDeposit === true), "Expected deposit payment to be flagged.");

    const depositBalance2 = await db.getCustomerDepositBalance({ companyId, customerId });
    approxEqual(depositBalance2, 70);

    const applied2 = await db.applyCustomerDepositToInvoice({ companyId, invoiceId, amount: 30 });
    approxEqual(applied2.appliedAmount, 30);

    const invoiceAfter2 = await db.getInvoice({ companyId, id: invoiceId });
    approxEqual(invoiceAfter2.invoice.balance, 20);

    const depositBalanceBeforeRefund = await db.getCustomerDepositBalance({ companyId, customerId });

    const refund = await db.refundCustomerDeposit({ companyId, customerId, amount: 15, note: "refund" });
    approxEqual(refund.refundedAmount, 15);
    approxEqual(refund.remainingDeposit, 25);

    const applied3 = await db.applyCustomerDepositToInvoice({ companyId, invoiceId, amount: null });
    approxEqual(applied3.appliedAmount, 20);

    const invoiceAfter3 = await db.getInvoice({ companyId, id: invoiceId });
    approxEqual(invoiceAfter3.invoice.balance, 0);
    assert(invoiceAfter3.invoice.status === "paid", "Invoice should be paid after deposit applied.");

    const depositBalance3 = await db.getCustomerDepositBalance({ companyId, customerId });
    approxEqual(depositBalance3, 5);

    const creditBalance = await db.getCustomerCreditBalance({ companyId, customerId });
    approxEqual(creditBalance, 0);

    const activity = await db.listCustomerCreditActivity({ companyId, customerId, limit: 50 });
    assert(activity.some((row) => row.type === "deposit"), "Expected deposit activity.");
    assert(activity.some((row) => row.type === "deposit_allocation"), "Expected deposit allocation activity.");
    assert(activity.some((row) => row.type === "deposit_refund"), "Expected deposit refund activity.");

    await assertThrows(
      () => db.refundCustomerDeposit({ companyId, customerId, amount: 10 }),
      "Refund exceeds"
    );

    console.log("Item 7 tests passed.");
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
