const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const {
  app,
  normalizeSubmissionId,
  normalizeCompanyId,
  rejectUnsafeUpload,
  safeUploadPath,
} = require("../backend/server");

function request({ port, method, path, body, headers }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("upload helpers harden inputs", () => {
  const uuid = "2b1f6c7a-3a46-4e8c-9e89-9e7c1f2a1b3c";
  assert.equal(normalizeSubmissionId(uuid), uuid);
  assert.equal(normalizeSubmissionId(`prefix-${uuid}-suffix`), uuid);
  assert.equal(normalizeSubmissionId("not-a-uuid"), "");

  assert.equal(normalizeCompanyId("12"), "12");
  assert.equal(normalizeCompanyId(5.7), "5");
  assert.equal(normalizeCompanyId("abc"), null);
  assert.equal(normalizeCompanyId("-3"), null);

  assert.equal(
    rejectUnsafeUpload({ mimetype: "text/html", originalname: "x.txt" }),
    true
  );
  assert.equal(
    rejectUnsafeUpload({ mimetype: "application/pdf", originalname: "x.pdf" }),
    false
  );

  assert.ok(safeUploadPath("company-1", "files"));
  assert.equal(safeUploadPath("..", "escape"), null);
});

test("uploads and webhooks enforce new access rules", async (t) => {
  const server = app.listen(0);
  const { port } = server.address();
  t.after(() => server.close());

  const uploadsRes = await request({
    port,
    method: "GET",
    path: "/uploads/company-1/files/any.pdf",
  });
  assert.equal(uploadsRes.status, 401);

  const originalToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
  process.env.QBO_WEBHOOK_VERIFIER_TOKEN = "";
  try {
    const body = JSON.stringify({});
    const webhookRes = await request({
      port,
      method: "POST",
      path: "/api/qbo/webhooks",
      body,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      },
    });
    assert.equal(webhookRes.status, 500);
  } finally {
    process.env.QBO_WEBHOOK_VERIFIER_TOKEN = originalToken;
  }
});
