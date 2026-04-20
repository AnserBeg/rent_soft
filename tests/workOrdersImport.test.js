const test = require("node:test");
const assert = require("node:assert/strict");

function loadDbWithPool(PoolImpl) {
  const pg = require("pg");
  pg.Pool = PoolImpl;
  delete require.cache[require.resolve("../backend/db")];
  return require("../backend/db");
}

const SAMPLE_CSV = [
  "work order number,category,created date,due date,recurring,recurrence_detail,customer,site,contact,task_at_hand,inventory_summary,notes,RO,Site Name",
  "WO-0001,Scheduled Service,2026-04-10,2026-04-11,Yes,Weekly Friday,Sage Creek,A-46-L-44-A-13,Joe,Service due,42680,Some notes,RO-29-0052,NV28 Water Hub",
].join("\n");

test("importWorkOrdersFromText inserts rows with mapped units + dates", async () => {
  let insertQuery = null;

  class FakePool {
    async query(text, params) {
      const sql = String(text || "");
      if (sql.includes("FROM equipment")) {
        return { rows: [{ id: 5, model_name: "42680", serial_number: "42680" }] };
      }
      if (sql.includes("FROM customers")) {
        return { rows: [{ id: 7, company_name: "Sage Creek" }] };
      }
      if (sql.includes("FROM work_orders") && sql.includes("work_order_number")) {
        return { rows: [] };
      }
      if (sql.includes("FROM rental_orders")) {
        return { rows: [{ id: 9, ro_number: "RO-29-0052" }] };
      }
      if (sql.includes("INSERT INTO work_orders")) {
        insertQuery = { sql, params };
        return { rows: [{ id: 55 }] };
      }
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  const result = await db.importWorkOrdersFromText({ companyId: 1, text: SAMPLE_CSV });

  assert.equal(result.created, 1);
  assert.equal(result.updated, 0);
  assert.equal(result.skipped, 0);
  assert.ok(insertQuery, "expected INSERT INTO work_orders");

  const p = insertQuery.params;
  assert.equal(p[0], 1);
  assert.equal(p[1], "WO-0001");
  assert.equal(p[2], "2026-04-10");
  assert.equal(p[3], 9);
  assert.equal(p[4], "RO-29-0052");
  assert.equal(p[5], 7);
  assert.equal(p[6], "Sage Creek");
  assert.equal(p[7], "Scheduled Service");
  assert.equal(p[8], "Joe");
  assert.equal(p[9], "NV28 Water Hub");
  assert.equal(p[10], "A-46-L-44-A-13");
  assert.equal(p[11], "2026-04-11");
  assert.equal(p[12], true);
  assert.equal(p[13], "weeks");
  assert.equal(p[14], 1);
  assert.equal(p[15], JSON.stringify(["5"]));
  assert.equal(p[16], JSON.stringify(["42680"]));
  assert.equal(p[17], 5);
  assert.equal(p[18], "42680");
  assert.equal(p[19], "Service due");
  assert.equal(p[20], "Some notes");
  assert.equal(p[21], "open");
  assert.equal(p[22], "in_service");
  assert.equal(p[23], false);
  assert.equal(p[24], "2026-04-10T00:00:00.000Z");
  assert.equal(p[25], "2026-04-10T00:00:00.000Z");
});

test("importWorkOrdersFromText updates existing work orders by number", async () => {
  let updateQuery = null;

  class FakePool {
    async query(text, params) {
      const sql = String(text || "");
      if (sql.includes("FROM equipment")) {
        return { rows: [{ id: 5, model_name: "42680", serial_number: "42680" }] };
      }
      if (sql.includes("FROM customers")) {
        return { rows: [{ id: 7, company_name: "Sage Creek" }] };
      }
      if (sql.includes("FROM work_orders") && sql.includes("work_order_number")) {
        return { rows: [{ id: 123, work_order_number: "WO-0001" }] };
      }
      if (sql.includes("FROM rental_orders")) {
        return { rows: [{ id: 9, ro_number: "RO-29-0052" }] };
      }
      if (sql.includes("UPDATE work_orders")) {
        updateQuery = { sql, params };
        return { rows: [] };
      }
      return { rows: [] };
    }
  }

  const db = loadDbWithPool(FakePool);
  const result = await db.importWorkOrdersFromText({ companyId: 1, text: SAMPLE_CSV });

  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.ok(updateQuery, "expected UPDATE work_orders");
  assert.equal(updateQuery.params?.[22], 1);
  assert.equal(updateQuery.params?.[23], 123);
});

