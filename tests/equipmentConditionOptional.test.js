const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readPublicFile(name) {
  const root = path.resolve(__dirname, "..");
  return fs.readFileSync(path.join(root, "public", name), "utf8");
}

test("equipment condition field is optional in UI", () => {
  const equipmentHtml = readPublicFile("equipment.html");
  const equipmentFormHtml = readPublicFile("equipment-form.html");

  assert.ok(!equipmentHtml.includes('name="condition" required'), "public/equipment.html still marks condition required");
  assert.ok(!equipmentFormHtml.includes('name="condition" required'), "public/equipment-form.html still marks condition required");

  assert.ok(
    equipmentHtml.includes('<option value="">Not set</option>'),
    'public/equipment.html is missing the "Not set" condition option'
  );
  assert.ok(
    equipmentFormHtml.includes('<option value="">Not set</option>'),
    'public/equipment-form.html is missing the "Not set" condition option'
  );
});

