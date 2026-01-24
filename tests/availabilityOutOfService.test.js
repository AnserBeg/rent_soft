const test = require("node:test");
const assert = require("node:assert/strict");

function loadDbWithPool(PoolImpl) {
  const pg = require("pg");
  pg.Pool = PoolImpl;
  delete require.cache[require.resolve("../backend/db")];
  return require("../backend/db");
}

test("listAvailableInventory excludes out-of-service equipment in SQL", async () => {
  let lastQuery = null;

  class FakePool {
    async query(text, params) {
      lastQuery = { text: String(text || ""), params };
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  await db.listAvailableInventory({
    companyId: 1,
    typeId: 2,
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-02T00:00:00Z",
  });

  assert.ok(lastQuery, "expected listAvailableInventory to issue a query");
  assert.match(lastQuery.text, /equipment_out_of_service/i);
  assert.match(lastQuery.text, /tstzrange\(\s*eos\.start_at/i);
});

test("listAvailableInventory includes bundle items when type matches non-primary equipment", async () => {
  let lastQuery = null;

  class FakePool {
    async query(text, params) {
      lastQuery = { text: String(text || ""), params };
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  await db.listAvailableInventory({
    companyId: 1,
    typeId: 42,
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-02T00:00:00Z",
  });

  assert.ok(lastQuery, "expected listAvailableInventory to issue a query");
  assert.match(lastQuery.text, /equipment_bundle_items/i);
  assert.match(lastQuery.text, /e2\.type_id\s*=\s*\$2/i);
});

test("getBundleAvailability blocks when out-of-service conflicts exist", async () => {
  const queries = [];

  class FakePool {
    async query(text) {
      const sql = String(text || "");
      queries.push(sql);
      if (sql.includes("FROM equipment_bundle_items")) {
        return { rows: [{ id: 10, serial_number: "S1", model_name: "M1", type_name: "Type A" }] };
      }
      if (sql.includes("FROM rental_order_line_inventory")) {
        return { rows: [{ conflicts: 0 }] };
      }
      if (sql.includes("FROM equipment_out_of_service")) {
        return { rows: [{ conflicts: 1 }] };
      }
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  const result = await db.getBundleAvailability({
    companyId: 1,
    bundleId: 5,
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-02T00:00:00Z",
  });

  assert.equal(result.available, false);
  assert.ok(queries.some((q) => q.includes("equipment_out_of_service")), "expected out-of-service query");
});

test("getTypeDemandAvailability excludes out-of-service equipment in totals SQL", async () => {
  let totalQuery = null;

  class FakePool {
    async query(text) {
      const sql = String(text || "");
      if (sql.includes("FROM rental_order_line_items")) {
        return { rows: [{ qty: 1 }] };
      }
      if (sql.includes("FROM equipment")) {
        totalQuery = sql;
        return { rows: [{ total_units: 4 }] };
      }
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  await db.getTypeDemandAvailability({
    companyId: 1,
    typeId: 2,
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-02T00:00:00Z",
  });

  assert.ok(totalQuery, "expected total units query");
  assert.match(totalQuery, /equipment_out_of_service/i);
});

test("applyWorkOrderPauseToEquipment upserts out-of-service record", async () => {
  const queries = [];

  class FakePool {
    async query(text) {
      queries.push(String(text || ""));
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  await db.applyWorkOrderPauseToEquipment({
    companyId: 1,
    equipmentId: 2,
    workOrderNumber: "WO-1",
    startAt: "2026-01-01T00:00:00Z",
    serviceStatus: "out_of_service",
  });

  assert.ok(queries.some((q) => q.includes("INSERT INTO equipment_out_of_service")), "expected out-of-service upsert");
});

test("applyWorkOrderPauseToEquipment clears out-of-service record when in service", async () => {
  const queries = [];

  class FakePool {
    async query(text) {
      queries.push(String(text || ""));
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  await db.applyWorkOrderPauseToEquipment({
    companyId: 1,
    equipmentId: 2,
    workOrderNumber: "WO-2",
    endAt: "2026-01-02T00:00:00Z",
    serviceStatus: "in_service",
    orderStatus: "open",
  });

  assert.ok(queries.some((q) => q.includes("UPDATE equipment_out_of_service")), "expected out-of-service clear");
  assert.ok(!queries.some((q) => q.includes("rental_order_line_inventory")), "unexpected pause query for in-service");
});
