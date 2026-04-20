const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("vendors form html includes expected ids", () => {
  const htmlPath = path.join(__dirname, "..", "public", "vendors-form.html");
  const html = fs.readFileSync(htmlPath, "utf8");

  assert.match(html, /id="vendor-form"/, "vendors-form.html should include #vendor-form");
  assert.match(html, /id="mode-label"/, "vendors-form.html should include #mode-label");
  assert.match(html, /id="form-title"/, "vendors-form.html should include #form-title");
});

