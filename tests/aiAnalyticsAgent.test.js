const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyAnalyticsQuestion,
  normalizeClarification,
  validateReadOnlyAnalyticsSql,
  normalizeSql,
} = require("../backend/aiAnalyticsAgent");

test("AI analytics asks for clarification for ambiguous rental duration", () => {
  const result = classifyAnalyticsQuestion({
    question: "How many days was asset DEMO-EXCAVATOR-01 rented out for?",
  });
  assert.equal(result.status, "clarification_required");
  assert.match(result.clarification.question, /duration basis|rented out days/i);
  assert.deepEqual(
    result.clarification.options.map((option) => option.value),
    ["booked_days", "actual_completed_days", "actual_live_days", "billable_days"]
  );
});

test("AI analytics does not clarify explicit rental duration basis", () => {
  assert.equal(
    classifyAnalyticsQuestion({ question: "How many actual days was DEMO-EXCAVATOR-01 rented?" }).status,
    "ready_to_query"
  );
  assert.equal(
    classifyAnalyticsQuestion({ question: "How many booked days was DEMO-EXCAVATOR-01 rented?" }).status,
    "ready_to_query"
  );
  assert.equal(
    classifyAnalyticsQuestion({ question: "How many billable days was DEMO-EXCAVATOR-01 charged?" }).status,
    "ready_to_query"
  );
});

test("AI analytics clarification answer carries the selected duration basis", () => {
  const clarification = normalizeClarification({
    question: "When you say rented out days, what do you mean?",
    answer: "Actual completed days",
  });
  assert.equal(clarification.value, "actual_completed_days");

  const result = classifyAnalyticsQuestion({
    question: "How many days was asset DEMO-EXCAVATOR-01 rented out for?",
    clarification,
  });
  assert.equal(result.status, "ready_to_query");
  assert.match(result.clarifiedIntent, /actual_completed_days/);
});

test("AI analytics SQL validator allows scoped read-only queries", () => {
  const sql = validateReadOnlyAnalyticsSql(`
      WITH revenue AS (
        SELECT customer_id, SUM(line_amount) AS total_revenue
        FROM rental_order_line_items
        GROUP BY customer_id
      )
      SELECT customer_id, total_revenue
      FROM revenue
      ORDER BY total_revenue DESC
    `);
  assert.match(sql, /^WITH revenue/i);
  assert.match(sql, /FROM rental_order_line_items/i);
  assert.equal(normalizeSql("SELECT * FROM ai_analytics.customers;;;"), "SELECT * FROM ai_analytics.customers");
});

test("AI analytics SQL validator allows asset-level rental analytics view", () => {
  const sql = validateReadOnlyAnalyticsSql(`
      SELECT serial_number, actual_completed_duration_days
      FROM rental_order_line_item_assets
      WHERE serial_number = 'DEMO-EXCAVATOR-01'
    `);
  assert.match(sql, /FROM rental_order_line_item_assets/i);
});

test("AI analytics SQL validator rejects writes and multiple statements", () => {
  assert.throws(() => validateReadOnlyAnalyticsSql("UPDATE customers SET name = 'x'"), /Only SELECT|read-only/i);
  assert.throws(() => validateReadOnlyAnalyticsSql("SELECT * FROM customers; SELECT * FROM users"), /one SQL statement/i);
  assert.throws(() => validateReadOnlyAnalyticsSql("SELECT * FROM customers -- hidden"), /comments/i);
});

test("AI analytics SQL validator rejects base and system schema access", () => {
  assert.throws(() => validateReadOnlyAnalyticsSql("SELECT * FROM public.customers"), /tenant-scoped/i);
  assert.throws(() => validateReadOnlyAnalyticsSql("SELECT * FROM information_schema.tables"), /tenant-scoped/i);
  assert.throws(() => validateReadOnlyAnalyticsSql("SELECT current_setting('rentsoft.current_company_id')"), /tenant-scoped/i);
});
