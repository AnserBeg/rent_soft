const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function extractAppJsSrc(html) {
  const match = String(html || "").match(/<script\s+[^>]*src=["']([^"']*app\.js(?:\?[^"']*)?)["'][^>]*>\s*<\/script>/i);
  return match ? match[1] : null;
}

test("equipment pages reference the same app.js url (prevents stale cached script)", () => {
  const root = path.resolve(__dirname, "..");
  const equipmentHtml = fs.readFileSync(path.join(root, "public", "equipment.html"), "utf8");
  const equipmentFormHtml = fs.readFileSync(path.join(root, "public", "equipment-form.html"), "utf8");

  const srcA = extractAppJsSrc(equipmentHtml);
  const srcB = extractAppJsSrc(equipmentFormHtml);

  assert.ok(srcA, "public/equipment.html is missing app.js script tag");
  assert.ok(srcB, "public/equipment-form.html is missing app.js script tag");
  assert.equal(srcA, srcB, "equipment pages must reference the same app.js url");
});

