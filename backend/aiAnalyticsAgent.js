const OpenAI = require("openai");
const { pool } = require("./db");
const {
  DURATION_CLARIFICATION,
  classifyAnalyticsQuestion,
  formatAnalyticsGlossaryForPrompt,
  normalizeClarification,
} = require("./aiAnalyticsGlossary");

const HARD_ROW_LIMIT = 1000;
const DEFAULT_ROW_LIMIT = 250;
const MODEL = String(process.env.AI_ANALYTICS_MODEL || process.env.ANSWER_MODEL || "gpt-5.4-mini");

const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|vacuum|analyze|refresh|merge|listen|notify|set|reset|show)\b/i;
const FORBIDDEN_SCHEMA_OR_FUNCTION =
  /("?(public|pg_catalog|information_schema)"?\s*\.)|\bpg_[a-z0-9_]*\b|\b(current_setting|set_config|dblink|postgres_fdw|file_fdw|lo_import|lo_export)\s*\(/i;

let openAiClient = null;

function getOpenAiClient() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing. Add it to .env first.");
  if (!openAiClient) openAiClient = new OpenAI({ apiKey });
  return openAiClient;
}

function normalizeSql(sql) {
  return String(sql || "").trim().replace(/;+\s*$/, "").trim();
}

function validateReadOnlyAnalyticsSql(sql) {
  const normalized = normalizeSql(sql);
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Only SELECT or WITH queries are allowed.");
  }
  if (normalized.includes(";")) {
    throw new Error("Only one SQL statement is allowed.");
  }
  if (/--|\/\*/.test(normalized)) {
    throw new Error("SQL comments are not allowed in AI Analytics queries.");
  }
  if (FORBIDDEN_SQL.test(normalized)) {
    throw new Error("Only read-only analytics queries are allowed.");
  }
  if (FORBIDDEN_SCHEMA_OR_FUNCTION.test(normalized)) {
    throw new Error("Queries may only use the tenant-scoped ai_analytics views.");
  }
  return normalized;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowsToCsv(rows, columns) {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => columns.map((col) => csvEscape(row[col])).join(",")).join("\n");
  return body ? `${header}\n${body}\n` : `${header}\n`;
}

function safeJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function fetchAnalyticsSchema() {
  const { rows } = await pool.query(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.views v
      ON v.table_schema = c.table_schema
     AND v.table_name = c.table_name
    WHERE c.table_schema = 'ai_analytics'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, { name: row.table_name, columns: [] });
    }
    tables.get(row.table_name).columns.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
    });
  }
  return Array.from(tables.values());
}

function sanitizeClarificationResponse(clarification) {
  const rawQuestion = String(clarification?.question || DURATION_CLARIFICATION.question).trim();
  const rawOptions = Array.isArray(clarification?.options) ? clarification.options : DURATION_CLARIFICATION.options;
  const options = rawOptions
    .map((option) => ({
      value: String(option?.value || "").trim(),
      label: String(option?.label || option?.value || "").trim(),
    }))
    .filter((option) => option.value && option.label)
    .slice(0, 6);
  return {
    question: rawQuestion || DURATION_CLARIFICATION.question,
    options: options.length ? options : DURATION_CLARIFICATION.options,
  };
}

async function preflightClarification({ question, schema, clarification }) {
  const deterministic = classifyAnalyticsQuestion({ question, clarification });
  if (deterministic.status === "clarification_required") {
    return {
      status: "clarification_required",
      clarification: sanitizeClarificationResponse(deterministic.clarification),
      reason: deterministic.reason || "Clarification required.",
    };
  }
  if (deterministic.clarification) return deterministic;

  if (String(process.env.AI_ANALYTICS_CLARIFIER_ENABLED || "true").toLowerCase() === "false") {
    return deterministic;
  }

  const client = getOpenAiClient();
  const prompt = `
You are the preflight clarification classifier for Aiven Rental AI Analytics.
Return only valid JSON:
{
  "status": "ready_to_query|clarification_required",
  "reason": "short reason",
  "clarification": {
    "question": "one concise clarification question",
    "options": [
      { "value": "machine_value", "label": "Human label" }
    ]
  }
}

Rules:
- Do not generate SQL.
- Ask for clarification only when the user's business meaning is materially ambiguous and likely changes the SQL.
- If the question is clear enough to run safely, return ready_to_query.
- For ambiguous rental duration questions such as "rented out days", use the standard duration options from the glossary.
- If the user says actual, booked, billable, active, current, or so far, do not ask the same duration clarification.

Analytics glossary:
${formatAnalyticsGlossaryForPrompt()}

Relevant schema:
${JSON.stringify(schema, null, 2)}
`;

  try {
    const response = await client.responses.create({
      model: MODEL,
      input: [
        { role: "developer", content: [{ type: "input_text", text: prompt }] },
        { role: "user", content: [{ type: "input_text", text: String(question || "").trim() }] },
      ],
    });
    const parsed = safeJsonFromText(response.output_text || "");
    if (parsed?.status === "clarification_required") {
      return {
        status: "clarification_required",
        clarification: sanitizeClarificationResponse(parsed.clarification),
        reason: String(parsed.reason || "Clarification required.").trim(),
      };
    }
  } catch (err) {
    console.warn("AI analytics clarification preflight failed:", err?.message || err);
  }
  return deterministic;
}

function buildQuestionContext({ question, clarification }) {
  const normalizedClarification = normalizeClarification(clarification);
  if (!normalizedClarification) return String(question || "").trim();
  return JSON.stringify(
    {
      question: String(question || "").trim(),
      clarification: {
        question: normalizedClarification.question,
        answer: normalizedClarification.answer,
        value: normalizedClarification.value,
      },
    },
    null,
    2
  );
}

async function generateSqlForQuestion({ question, schema, clarification }) {
  const client = getOpenAiClient();
  const prompt = `
You are the SQL planner for Aiven Rental AI Analytics.
Return only valid JSON:
{
  "sql": "one PostgreSQL SELECT or WITH query",
  "purpose": "short description",
  "chart": {
    "type": "bar|line|pie|doughnut",
    "x": "column name or null",
    "y": "numeric column name or null",
    "aggregation": "count|sum|avg"
  }
}

Rules:
- Use only the ai_analytics schema views listed below. Unqualified table names are OK because the server search_path is ai_analytics.
- Never query public, pg_catalog, information_schema, sessions, password hashes, tokens, or settings.
- Do not include company_id filters unless they are useful for display. The database already enforces the current company.
- Prefer explicit column names.
- For totals, use clear aliases like total_revenue, order_count, active_count, customer_name, bucket.
- Use the analytics glossary below to resolve app terms.
- Asset-level rental questions should prefer rental_order_line_item_assets because it has one row per assigned equipment unit and includes equipment_id, serial_number, and rental duration fields.
- rental_order_line_items can have many assigned equipment units. If you use it directly, equipment_id is only a compatibility field for simple joins; use rental_order_line_inventory or rental_order_line_item_assets for precise asset-level counts.
- For rental duration questions, prefer derived duration columns on rental_order_line_items over raw timestamp math.
- If the clarified intent is actual_completed_days, use actual_completed_duration_days and do not fall back to booked_duration_days when actual timestamps are missing.
- If actual duration timestamps are missing, surface missing actual timestamp counts or incomplete rows rather than silently substituting booked dates.
- If the clarified intent is actual_live_days, use actual_live_duration_days.
- If the clarified intent is booked_days, use booked_duration_days.
- If the clarified intent is billable_days, use billable_duration_days or billable_units with a daily rate_basis filter.
- Return at most 1000 rows.

Analytics glossary:
${formatAnalyticsGlossaryForPrompt()}

Available views:
${JSON.stringify(schema, null, 2)}
`;

  const response = await client.responses.create({
    model: MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: prompt }] },
      { role: "user", content: [{ type: "input_text", text: buildQuestionContext({ question, clarification }) }] },
    ],
  });

  const parsed = safeJsonFromText(response.output_text || "");
  if (!parsed || !parsed.sql) {
    throw new Error("AI Analytics could not produce a valid SQL query.");
  }
  return {
    sql: validateReadOnlyAnalyticsSql(parsed.sql),
    purpose: String(parsed.purpose || "").trim(),
    chart: parsed.chart && typeof parsed.chart === "object" ? parsed.chart : null,
  };
}

async function summarizeQueryResult({ question, clarification, sql, columns, rows, rowCount, chart }) {
  const client = getOpenAiClient();
  const prompt = `
You are Aiven Rental's AI Analytics analyst.
Return only valid JSON:
{
  "answer_markdown": "concise business answer based only on the returned rows",
  "chart": {
    "type": "bar|line|pie|doughnut",
    "x": "column name or null",
    "y": "numeric column name or null",
    "aggregation": "count|sum|avg"
  }
}

Do not invent data. Mention when the result appears limited by row count.
`;

  const response = await client.responses.create({
    model: MODEL,
    input: [
      { role: "developer", content: [{ type: "input_text", text: prompt }] },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify(
              {
                question,
                clarification: normalizeClarification(clarification),
                sql,
                columns,
                rowCount,
                previewRows: rows.slice(0, 60),
                initialChartSuggestion: chart || null,
              },
              null,
              2
            ),
          },
        ],
      },
    ],
  });

  const parsed = safeJsonFromText(response.output_text || "");
  if (parsed?.answer_markdown) {
    return {
      answer: String(parsed.answer_markdown),
      chart: parsed.chart && typeof parsed.chart === "object" ? parsed.chart : chart,
    };
  }
  return {
    answer: rows.length
      ? `Returned ${rowCount} row${rowCount === 1 ? "" : "s"} for this question.`
      : "No matching rows were found for this question.",
    chart,
  };
}

async function insertAudit({ companyId, userId, question, sql, rowCount, status, error }) {
  try {
    await pool.query(
      `INSERT INTO ai_analytics_queries (company_id, user_id, question, generated_sql, row_count, status, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        companyId,
        userId || null,
        String(question || "").slice(0, 10000),
        sql ? String(sql).slice(0, 50000) : null,
        Number.isFinite(Number(rowCount)) ? Number(rowCount) : null,
        status,
        error ? String(error).slice(0, 2000) : null,
      ]
    );
  } catch (err) {
    console.warn("AI analytics audit insert failed:", err?.message || err);
  }
}

async function executeAnalyticsSql({ companyId, sql, maxRows }) {
  const normalizedMax = Math.max(1, Math.min(HARD_ROW_LIMIT, Number(maxRows) || DEFAULT_ROW_LIMIT));
  const timeoutMs = Math.max(1000, Math.min(30000, Number(process.env.AI_ANALYTICS_STATEMENT_TIMEOUT_MS) || 8000));
  const idleTimeoutMs = timeoutMs + 2000;
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}ms'`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = '${idleTimeoutMs}ms'`);
    await client.query("SET LOCAL lock_timeout = '2000ms'");
    await client.query("SET LOCAL search_path = ai_analytics");
    await client.query("SELECT set_config('rentsoft.current_company_id', $1, true)", [String(companyId)]);
    const result = await client.query(`SELECT * FROM (${sql}) AS ai_agent_result LIMIT $1`, [normalizedMax]);
    await client.query("COMMIT");
    const columns = result.fields.map((field) => field.name);
    return {
      rows: result.rows,
      columns,
      rowCount: result.rowCount,
      maxRowsApplied: normalizedMax,
      csv: rowsToCsv(result.rows, columns),
    };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw err;
  } finally {
    client.release();
  }
}

async function runAiAnalyticsQuery({ auth, question, maxRows, clarification }) {
  const companyId = Number(auth?.companyId || auth?.company?.id);
  const userId = Number(auth?.userId || auth?.user?.id);
  const cleanQuestion = String(question || "").trim();
  if (!Number.isFinite(companyId) || companyId <= 0) throw new Error("Login required.");
  if (!cleanQuestion) throw new Error("question is required.");
  if (cleanQuestion.length > 2000) throw new Error("question must be 2,000 characters or fewer.");

  let sql = "";
  try {
    const schema = await fetchAnalyticsSchema();
    if (!schema.length) throw new Error("AI Analytics schema is not available. Restart the server to run migrations.");
    const preflight = await preflightClarification({ question: cleanQuestion, schema, clarification });
    if (preflight.status === "clarification_required") {
      await insertAudit({
        companyId,
        userId: Number.isFinite(userId) ? userId : null,
        question: cleanQuestion,
        status: "clarification_required",
        error: preflight.reason || null,
      });
      return {
        status: "clarification_required",
        clarification: preflight.clarification,
      };
    }

    const clarified = preflight.clarification || normalizeClarification(clarification);
    const generated = await generateSqlForQuestion({ question: cleanQuestion, schema, clarification: clarified });
    sql = generated.sql;
    const result = await executeAnalyticsSql({ companyId, sql, maxRows });
    const summary = await summarizeQueryResult({
      question: cleanQuestion,
      clarification: clarified,
      sql,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      chart: generated.chart,
    });
    await insertAudit({
      companyId,
      userId,
      question: cleanQuestion,
      sql,
      rowCount: result.rowCount,
      status: "success",
    });
    return {
      status: "success",
      answer: summary.answer,
      sql,
      purpose: generated.purpose,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      maxRowsApplied: result.maxRowsApplied,
      csv: Buffer.from(result.csv, "utf8").toString("base64"),
      csvEncoding: "base64",
      chart: summary.chart || generated.chart || null,
    };
  } catch (err) {
    await insertAudit({
      companyId,
      userId: Number.isFinite(userId) ? userId : null,
      question: cleanQuestion,
      sql,
      status: "error",
      error: err?.message || err,
    });
    throw err;
  }
}

module.exports = {
  runAiAnalyticsQuery,
  validateReadOnlyAnalyticsSql,
  normalizeSql,
  classifyAnalyticsQuestion,
  normalizeClarification,
};
