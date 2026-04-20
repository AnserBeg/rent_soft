const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readPublicFile(name) {
  const root = path.resolve(__dirname, "..");
  return fs.readFileSync(path.join(root, "public", name), "utf8");
}

test("equipment UI includes card image selection field", () => {
  const equipmentHtml = readPublicFile("equipment.html");
  const equipmentFormHtml = readPublicFile("equipment-form.html");

  assert.ok(equipmentHtml.includes('name="cardImageUrl"'), "public/equipment.html missing cardImageUrl input");
  assert.ok(equipmentFormHtml.includes('name="cardImageUrl"'), "public/equipment-form.html missing cardImageUrl input");
});

