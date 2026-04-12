const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeTrackingStatusForField,
  computeEquipmentTrackingSummary,
} = require("../backend/equipmentTracking");

test("time_interval marks overdue when past due date", () => {
  const def = {
    id: 1,
    label: "Last maintenance",
    dataType: "date",
    rule: { enabled: true, ruleType: "time_interval", intervalDays: 30, warnDays: 5 },
  };
  const status = computeTrackingStatusForField({
    def,
    rawValue: "2026-01-01",
    latestMeterHours: null,
    now: new Date("2026-02-02T00:00:00Z"),
  });
  assert.equal(status.statusKey, "overdue");
  assert.equal(status.dueAt, "2026-01-31");
});

test("time_interval marks dueSoon when within warnDays", () => {
  const def = {
    id: 1,
    label: "Last fueled",
    dataType: "date",
    rule: { enabled: true, ruleType: "time_interval", intervalDays: 10, warnDays: 3 },
  };
  const status = computeTrackingStatusForField({
    def,
    rawValue: "2026-01-01",
    latestMeterHours: null,
    now: new Date("2026-01-08T12:00:00Z"),
  });
  assert.equal(status.statusKey, "dueSoon");
  assert.equal(status.dueAt, "2026-01-11");
});

test("manual_due_date uses field value as due date", () => {
  const def = {
    id: 2,
    label: "Next fueling",
    dataType: "date",
    rule: { enabled: true, ruleType: "manual_due_date", warnDays: 2 },
  };
  const status = computeTrackingStatusForField({
    def,
    rawValue: "2026-01-10",
    latestMeterHours: null,
    now: new Date("2026-01-11T00:00:00Z"),
  });
  assert.equal(status.statusKey, "overdue");
  assert.equal(status.dueAt, "2026-01-10");
});

test("meter_interval computes due based on latest meter hours", () => {
  const def = {
    id: 3,
    label: "Last service hours",
    dataType: "number",
    rule: { enabled: true, ruleType: "meter_interval", intervalHours: 50, warnHours: 5 },
  };
  const status = computeTrackingStatusForField({
    def,
    rawValue: 100,
    latestMeterHours: 146,
    now: new Date("2026-01-01T00:00:00Z"),
  });
  assert.equal(status.statusKey, "dueSoon");
  assert.equal(status.dueAt, 150);
});

test("equipment tracking summary reports worst status and needs list", () => {
  const defs = [
    { id: 1, label: "Last maintenance", dataType: "date", rule: { enabled: true, ruleType: "time_interval", intervalDays: 30 } },
    { id: 2, label: "Next fueling", dataType: "date", rule: { enabled: true, ruleType: "manual_due_date" } },
  ];
  const valuesByFieldId = { "1": "2026-01-01", "2": "2026-01-05" };
  const summary = computeEquipmentTrackingSummary({
    definitions: defs,
    valuesByFieldId,
    latestMeterHours: null,
    now: new Date("2026-02-10T00:00:00Z"),
  });
  assert.equal(summary.overallStatusKey, "overdue");
  assert.ok(summary.needs.length >= 1);
});

