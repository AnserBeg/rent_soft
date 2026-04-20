const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

function extractRentalInfoOptionKeys(settingsJs) {
  const keys = [];
  const optionListMatch = settingsJs.match(/const\s+rentalInfoFieldOptions\s*=\s*\[[\s\S]*?\];/);
  assert.ok(optionListMatch, "Unable to find rentalInfoFieldOptions in public/settings.js");
  const block = optionListMatch[0];
  const re = /\bkey\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(block))) keys.push(m[1]);
  return keys;
}

function extractDefaultRentalInfoFieldKeys(rentalOrderFormJs) {
  const keys = [];
  const defaultsMatch = rentalOrderFormJs.match(/const\s+DEFAULT_RENTAL_INFO_FIELDS\s*=\s*\{[\s\S]*?\};/);
  assert.ok(defaultsMatch, "Unable to find DEFAULT_RENTAL_INFO_FIELDS in public/rental-order-form.js");
  const block = defaultsMatch[0];
  const re = /\n\s*([a-zA-Z0-9_]+)\s*:\s*\{\s*enabled\s*:/g;
  let m;
  while ((m = re.exec(block))) keys.push(m[1]);
  return keys;
}

test("rental order form supports all rental info settings keys", () => {
  const settingsJs = readFile("public/settings.js");
  const rentalOrderFormJs = readFile("public/rental-order-form.js");

  const optionKeys = extractRentalInfoOptionKeys(settingsJs);
  const defaultKeys = new Set(extractDefaultRentalInfoFieldKeys(rentalOrderFormJs));

  const missing = optionKeys.filter((k) => !defaultKeys.has(k));
  assert.deepEqual(missing, []);
});
