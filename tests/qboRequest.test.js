const assert = require("node:assert/strict");
const { test } = require("node:test");

const { qboRequest } = require("../backend/qbo");

test("qboRequest captures intuit_tid on validation errors", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async () =>
    new Response(
      JSON.stringify({
        Fault: {
          Error: [
            {
              Message: "Validation Error",
              Detail: "A required field is missing.",
            },
          ],
        },
      }),
      {
        status: 400,
        headers: { intuit_tid: "tid-123" },
      }
    );

  await assert.rejects(
    () =>
      qboRequest({
        host: "https://quickbooks.api.intuit.com",
        realmId: "12345",
        accessToken: "token",
        method: "POST",
        path: "customer",
        body: { DisplayName: "" },
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.intuitTid, "tid-123");
      assert.ok(err.payload);
      return true;
    }
  );
});

test("qboRequest captures intuit_tid on non-json error responses", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });

  global.fetch = async () =>
    new Response("Bad Request", {
      status: 400,
      headers: { intuit_tid: "tid-456" },
    });

  await assert.rejects(
    () =>
      qboRequest({
        host: "https://quickbooks.api.intuit.com",
        realmId: "12345",
        accessToken: "token",
        method: "GET",
        path: "query?query=select%20*%20from%20Customer",
      }),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.intuitTid, "tid-456");
      assert.ok(err.payload);
      return true;
    }
  );
});
