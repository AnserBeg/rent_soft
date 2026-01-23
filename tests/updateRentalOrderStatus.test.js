const test = require("node:test");
const assert = require("node:assert/strict");

test("updateRentalOrderStatus handles reservation without throwing", async () => {
  const pg = require("pg");

  class FakeClient {
    async query(text) {
      const sql = String(text || "").trim();
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("SELECT quote_number, ro_number, status")) {
        return { rows: [{ quote_number: "QO-24-0001", ro_number: "RO-24-0001", status: "quote" }] };
      }
      if (sql.includes("UPDATE rental_orders")) {
        return { rows: [{ id: 1, quote_number: "QO-24-0001", ro_number: "RO-24-0001", status: "reservation" }] };
      }
      if (sql.includes("INSERT INTO rental_order_audits")) {
        return { rows: [{ id: 1, created_at: new Date().toISOString() }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }

    release() {}
  }

  class FakePool {
    async connect() {
      return new FakeClient();
    }
  }

  pg.Pool = FakePool;

  const db = require("../backend/db");
  const result = await db.updateRentalOrderStatus({
    id: 1,
    companyId: 1,
    status: "reservation",
    actorName: "Tester",
    actorEmail: "tester@example.com",
  });

  assert.equal(result.status, "reservation");
  assert.equal(result.prevStatus, "quote");
  assert.equal(result.statusChanged, true);
});
