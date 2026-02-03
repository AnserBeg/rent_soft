const test = require("node:test");
const assert = require("node:assert/strict");

function loadDbWithPool(queryHandler) {
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
  return require("../backend/db");
}

test("listCustomerChangeRequests normalizes status filter", async () => {
  let last = null;
  const db = loadDbWithPool(async (text, params) => {
    last = { text, params };
    return { rows: [] };
  });

  await db.listCustomerChangeRequests({ companyId: 1, status: " Pending " });

  assert.ok(last, "Expected query to run");
  assert.match(String(last.text), /LOWER\(TRIM\(r\.status\)\)/);
  assert.equal(last.params[1], "pending");
});

test("listCustomerChangeRequests does not filter null customer/order ids", async () => {
  let last = null;
  const db = loadDbWithPool(async (text, params) => {
    last = { text, params };
    return { rows: [] };
  });

  await db.listCustomerChangeRequests({ companyId: 1, status: "pending" });

  assert.ok(last, "Expected query to run");
  assert.ok(!String(last.text).includes("r.customer_id ="), "Expected no customer_id filter");
  assert.ok(!String(last.text).includes("r.rental_order_id ="), "Expected no rental_order_id filter");
});

test("createCustomerChangeRequest lowercases status before insert", async () => {
  let last = null;
  const db = loadDbWithPool(async (text, params) => {
    last = { text, params };
    return { rows: [{ id: 1 }] };
  });

  await db.createCustomerChangeRequest({
    companyId: 1,
    scope: "order_update",
    status: " Pending ",
  });

  assert.ok(last, "Expected query to run");
  assert.equal(last.params[5], "pending");
});

test("updateCustomerChangeRequestStatus lowercases status updates", async () => {
  let last = null;
  const db = loadDbWithPool(async (text, params) => {
    last = { text, params };
    return { rows: [{ id: 1, status: params[0] }] };
  });

  await db.updateCustomerChangeRequestStatus({
    companyId: 1,
    id: 1,
    status: " Pending ",
  });

  assert.ok(last, "Expected query to run");
  assert.ok(last.params.includes("pending"));
});
