const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

require("dotenv").config();

function normalizeDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : raw;
}

function shouldRunDbTest() {
  if (process.env.RUN_DB_TESTS === "1") return true;
  if (process.env.RUN_RENTAL_ORDER_DB_TESTS === "1") return true;
  if (process.env.RENT_SOFT_RUN_DB_TESTS === "1") return true;

  const raw = String(process.env.DATABASE_URL || "").trim();
  if (!raw) return false;

  try {
    const u = new URL(raw);
    const host = String(u.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

(shouldRunDbTest() ? test : test.skip)(
  "updateRentalOrder persists rental order header fields, line items, and fees",
  async () => {
    const db = require("../backend/db");

    const suffix = crypto.randomUUID().slice(0, 8);
    const companyName = `TestCo ${suffix}`;
    const contactEmail = `contact+${suffix}@example.com`;
    const ownerName = `Owner ${suffix}`;
    const ownerEmail = `owner+${suffix}@example.com`;
    const password = `Passw0rd-${suffix}`;

    let companyId = null;
    let customerId = null;
    let orderId = null;
    let salesPersonId = null;
    let typeId = null;
    let createdCompanyId = null;
    let poolEnded = false;

    try {
      await db.ensureTables();

      const setup = await db.createCompanyWithUser({
        companyName,
        contactEmail,
        ownerName,
        ownerEmail,
        password,
      });

      companyId = Number(setup.company.id);
      createdCompanyId = companyId;
      assert.ok(Number.isFinite(companyId) && companyId > 0);

      const customer = await db.createCustomer({
        companyId,
        companyName: `Customer ${suffix}`,
        contactName: `Customer Contact ${suffix}`,
        email: `customer+${suffix}@example.com`,
        phone: "555-0001",
      });
      customerId = Number(customer.id);

      const salesperson = await db.createSalesPerson({
        companyId,
        name: `Sales ${suffix}`,
        email: `sales+${suffix}@example.com`,
      });
      salesPersonId = Number(salesperson.id);

      const equipmentType = await db.createType({
        companyId,
        name: `Type ${suffix}`,
      });
      typeId = Number(equipmentType.id);

      const created = await db.createRentalOrder({
        companyId,
        customerId,
        salespersonId: salesPersonId,
        pickupLocationId: Number(setup.defaultLocation.id),
        status: "quote",
        fulfillmentMethod: "pickup",
        lineItems: [],
        fees: [],
        actorName: "Test Runner",
        actorEmail: "testrunner@example.com",
      });
      orderId = Number(created.id);

      const startAt = "2026-02-01T00:00:00.000Z";
      const endAt = "2026-02-02T00:00:00.000Z";

      await db.updateRentalOrder({
        id: orderId,
        companyId,
        customerId,
        customerPo: `PO-${suffix}`,
        salespersonId: salesPersonId,
        fulfillmentMethod: "dropoff",
        status: "quote",
        terms: "Net 30",
        generalNotes: "General notes test",
        pickupLocationId: Number(setup.defaultLocation.id),
        dropoffAddress: "123 Dropoff St, Portland, OR",
        siteName: "Riverfront Yard",
        siteAddress: "987 Site Ave, Portland, OR",
        siteAddressLat: "45.523064",
        siteAddressLng: "-122.676483",
        siteAddressQuery: "987 Site Ave",
        logisticsInstructions: "Gate code is 1234",
        specialInstructions: "Call on arrival",
        criticalAreas: "Keep clear of loading zone",
        notificationCircumstances: ["After hours", "Gate locked"],
        coverageHours: [
          { startDay: "mon", startTime: "08:00", endTime: "17:00" },
          { startDay: "sat", startTime: "10:00", endTime: "14:00" },
        ],
        emergencyContacts: [{ name: "Alice", email: "alice@example.com", phone: "555-0101" }],
        siteContacts: [{ name: "Bob", email: "bob@example.com", phone: "555-0202" }],
        lineItems: [
          {
            typeId,
            startAt,
            endAt,
            rateBasis: "daily",
            rateAmount: 99.5,
          },
        ],
        fees: [{ name: "Delivery", amount: 50, feeDate: "2026-02-01" }],
        actorName: "Test Runner",
        actorEmail: "testrunner@example.com",
      });

      const fetched1 = await db.getRentalOrder({ companyId, id: orderId });
      assert.ok(fetched1?.order);

      const order1 = fetched1.order;
      assert.equal(order1.customer_id, customerId);
      assert.equal(order1.customer_po, `PO-${suffix}`);
      assert.equal(order1.salesperson_id, salesPersonId);
      assert.equal(order1.fulfillment_method, "dropoff");
      assert.equal(order1.dropoff_address, "123 Dropoff St, Portland, OR");
      assert.equal(order1.terms, "Net 30");
      assert.equal(order1.general_notes, "General notes test");
      assert.equal(order1.pickup_location_id, Number(setup.defaultLocation.id));
      assert.equal(order1.site_name, "Riverfront Yard");
      assert.equal(order1.site_address, "987 Site Ave, Portland, OR");
      assert.equal(Number(order1.site_address_lat), 45.523064);
      assert.equal(Number(order1.site_address_lng), -122.676483);
      assert.equal(order1.site_address_query, "987 Site Ave");
      assert.equal(order1.logistics_instructions, "Gate code is 1234");
      assert.equal(order1.special_instructions, "Call on arrival");
      assert.equal(order1.critical_areas, "Keep clear of loading zone");
      assert.deepEqual(order1.notification_circumstances, ["After hours", "Gate locked"]);
      assert.deepEqual(order1.coverage_hours, [
        { startDay: "mon", startTime: "08:00", endDay: "mon", endTime: "17:00" },
        { startDay: "sat", startTime: "10:00", endDay: "sat", endTime: "14:00" },
      ]);
      assert.deepEqual(order1.emergency_contacts, [{ name: "Alice", email: "alice@example.com", phone: "555-0101" }]);
      assert.deepEqual(order1.site_contacts, [{ name: "Bob", email: "bob@example.com", phone: "555-0202" }]);

      assert.equal(Array.isArray(fetched1.lineItems) ? fetched1.lineItems.length : 0, 1);
      const lineItem1 = fetched1.lineItems[0];
      assert.equal(lineItem1.typeId, typeId);
      assert.equal(new Date(lineItem1.startAt).toISOString(), startAt);
      assert.equal(new Date(lineItem1.endAt).toISOString(), endAt);
      assert.equal(lineItem1.rateBasis, "daily");
      assert.equal(lineItem1.rateAmount, 99.5);
      assert.equal(lineItem1.billableUnits, 1);
      assert.equal(lineItem1.lineAmount, 99.5);

      assert.equal(Array.isArray(fetched1.fees) ? fetched1.fees.length : 0, 1);
      const fee1 = fetched1.fees[0];
      assert.equal(fee1.name, "Delivery");
      assert.equal(Number(fee1.amount), 50);
      assert.equal(normalizeDateOnly(fee1.feeDate), "2026-02-01");

      await db.updateRentalOrder({
        id: orderId,
        companyId,
        customerId,
        customerPo: `PO2-${suffix}`,
        salespersonId: salesPersonId,
        fulfillmentMethod: "pickup",
        status: "quote",
        terms: "Net 15",
        generalNotes: "General notes test 2",
        pickupLocationId: Number(setup.defaultLocation.id),
        dropoffAddress: "Should be cleared",
        siteName: "Riverfront Yard - West",
        siteAddress: "987 Site Ave, Portland, OR",
        siteAddressLat: 45.523064,
        siteAddressLng: -122.676483,
        siteAddressQuery: "987 Site Ave",
        logisticsInstructions: "Gate code is 5678",
        specialInstructions: "Do not block driveway",
        criticalAreas: "Stage near loading dock",
        notificationCircumstances: ["After hours", "after hours", "  "],
        coverageHours: [{ startDay: "mon", startTime: "08:00", endTime: "17:00" }],
        emergencyContacts: [{ name: "Alice", email: "alice@example.com", phone: "555-0101" }],
        siteContacts: [{ name: "Bob", email: "bob@example.com", phone: "555-0202" }],
        lineItems: [
          {
            typeId,
            startAt,
            endAt,
            rateBasis: "daily",
            rateAmount: 120,
          },
        ],
        fees: [{ id: fee1.id, name: "Delivery", amount: 75, feeDate: "2026-02-02" }],
        actorName: "Test Runner",
        actorEmail: "testrunner@example.com",
      });

      const fetched2 = await db.getRentalOrder({ companyId, id: orderId });
      assert.ok(fetched2?.order);
      const order2 = fetched2.order;
      assert.equal(order2.customer_po, `PO2-${suffix}`);
      assert.equal(order2.fulfillment_method, "pickup");
      assert.equal(order2.dropoff_address, null);
      assert.equal(order2.terms, "Net 15");
      assert.equal(order2.general_notes, "General notes test 2");
      assert.equal(order2.site_name, "Riverfront Yard - West");
      assert.equal(order2.logistics_instructions, "Gate code is 5678");
      assert.equal(order2.special_instructions, "Do not block driveway");
      assert.equal(order2.critical_areas, "Stage near loading dock");
      assert.deepEqual(order2.notification_circumstances, ["After hours"]);
      assert.deepEqual(order2.coverage_hours, [{ startDay: "mon", startTime: "08:00", endDay: "mon", endTime: "17:00" }]);

      assert.equal(Array.isArray(fetched2.lineItems) ? fetched2.lineItems.length : 0, 1);
      const lineItem2 = fetched2.lineItems[0];
      assert.equal(lineItem2.rateAmount, 120);
      assert.equal(lineItem2.billableUnits, 1);
      assert.equal(lineItem2.lineAmount, 120);

      assert.equal(Array.isArray(fetched2.fees) ? fetched2.fees.length : 0, 1);
      const fee2 = fetched2.fees[0];
      assert.equal(fee2.name, "Delivery");
      assert.equal(Number(fee2.amount), 75);
      assert.equal(normalizeDateOnly(fee2.feeDate), "2026-02-02");
    } finally {
      try {
        if (createdCompanyId) {
          await db.pool.query(`DELETE FROM companies WHERE id = $1`, [createdCompanyId]);
        } else {
          if (orderId && companyId) await db.deleteRentalOrder({ id: orderId, companyId });
          if (customerId && companyId) await db.deleteCustomer({ id: customerId, companyId });
          if (salesPersonId && companyId) await db.deleteSalesPerson({ id: salesPersonId, companyId });
          if (typeId && companyId) await db.deleteType({ id: typeId, companyId });
        }
      } catch {
        // Best-effort cleanup (including removing the test company).
      }
      try {
        if (!poolEnded) {
          await db.pool.end();
          poolEnded = true;
        }
      } catch {}
    }
  }
);
