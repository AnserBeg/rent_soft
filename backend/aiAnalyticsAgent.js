const crypto = require("crypto");
const OpenAI = require("openai");
const { pool } = require("./db");
const { formatAnalyticsBusinessLogicForPrompt } = require("./aiAnalyticsBusinessLogic");
const {
  BLOCKED_ANALYTICS_RESPONSE,
  DURATION_CLARIFICATION,
  classifyAnalyticsQuestion,
  formatAnalyticsGlossaryForPrompt,
  getAnalyticsQuestionGuidance,
  normalizeClarification,
} = require("./aiAnalyticsGlossary");

const HARD_ROW_LIMIT = 1000;
const DEFAULT_ROW_LIMIT = 250;
const MODEL = String(process.env.AI_ANALYTICS_MODEL || process.env.ANSWER_MODEL || "gpt-5.4-mini");
const CONTEXT_MODEL = String(process.env.AI_ANALYTICS_CONTEXT_MODEL || MODEL);
const CONTEXT_TTL_MS = Math.max(
  60_000,
  Number(process.env.AI_ANALYTICS_CONTEXT_TTL_MS || 7 * 24 * 60 * 60 * 1000) || 7 * 24 * 60 * 60 * 1000
);
const MAX_CONTEXT_MARKDOWN_CHARS = Math.max(
  1000,
  Math.min(12000, Number(process.env.AI_ANALYTICS_CONTEXT_MAX_CHARS || 4500) || 4500)
);

const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|vacuum|analyze|refresh|merge|listen|notify|set|reset|show)\b/i;
const FORBIDDEN_SCHEMA_OR_FUNCTION =
  /("?(public|pg_catalog|information_schema)"?\s*\.)|\bpg_[a-z0-9_]*\b|\b(current_setting|set_config|dblink|postgres_fdw|file_fdw|lo_import|lo_export)\s*\(/i;
const FORBIDDEN_SENSITIVE_IDENTIFIER =
  /\b[a-z0-9_]*(password|token|secret|credential|session|api_key|access_key|refresh_key)[a-z0-9_]*\b|\b(qbo_connections|company_settings|storefront_customers|customer_accounts)\b/i;

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
  if (FORBIDDEN_SENSITIVE_IDENTIFIER.test(normalized)) {
    throw new Error("Queries may not access credentials, sessions, tokens, passwords, or sensitive settings.");
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

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function computeCompanyAnalyticsContextSourceHash(snapshot) {
  return crypto.createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

function clampText(value, maxLength = MAX_CONTEXT_MARKDOWN_CHARS) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 80)).trim()}\n...context truncated to ${maxLength} chars`;
}

function addCount(map, key, amount = 1) {
  const normalized = String(key || "").trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) || 0) + amount);
}

function topEntries(map, limit) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function inferSerialPattern(serialNumber) {
  const serial = String(serialNumber || "").trim().toUpperCase();
  if (!serial) return "";
  const parts = serial.split(/[-_\s]+/).filter(Boolean);
  if (parts.length > 1) {
    const prefix = [];
    for (const part of parts) {
      if (/^\d+$/.test(part)) break;
      prefix.push(part.replace(/\d+$/g, ""));
      if (prefix.length >= 2) break;
    }
    const cleaned = prefix.filter(Boolean).join("-");
    if (cleaned) return `${cleaned}-*`;
  }
  const leading = serial.match(/^[A-Z]+/);
  if (leading?.[0]) return `${leading[0]}*`;
  return "";
}

function compactCsv(values, limit = 24) {
  const list = (values || []).filter(Boolean).slice(0, limit);
  const suffix = (values || []).length > limit ? `, +${values.length - limit} more` : "";
  return `${list.join(", ")}${suffix}`;
}

function buildCompanyAnalyticsSnapshot({ categories, types, equipment, rentalStatuses, workOrderStatuses, locations }) {
  const typeMap = new Map();
  for (const type of types || []) {
    const typeName = String(type.name || "").trim();
    if (!typeName) continue;
    typeMap.set(typeName, {
      name: typeName,
      category: String(type.category_name || "Uncategorized").trim() || "Uncategorized",
      equipmentCount: 0,
      models: new Map(),
      serialPatterns: new Map(),
    });
  }

  for (const row of equipment || []) {
    const typeName = String(row.equipment_type_name || row.type || "Unspecified").trim() || "Unspecified";
    if (!typeMap.has(typeName)) {
      typeMap.set(typeName, {
        name: typeName,
        category: String(row.category_name || "Uncategorized").trim() || "Uncategorized",
        equipmentCount: 0,
        models: new Map(),
        serialPatterns: new Map(),
      });
    }
    const item = typeMap.get(typeName);
    item.equipmentCount += 1;
    addCount(item.models, row.model_name);
    addCount(item.serialPatterns, inferSerialPattern(row.serial_number));
  }

  const equipmentTypes = Array.from(typeMap.values())
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    .slice(0, 160)
    .map((item) => ({
      name: item.name,
      category: item.category,
      equipmentCount: item.equipmentCount,
      commonModels: topEntries(item.models, 8),
      serialPatterns: topEntries(item.serialPatterns, 8),
    }));

  return {
    categories: (categories || [])
      .map((row) => String(row.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 80),
    equipmentTypes,
    locations: (locations || [])
      .map((row) => String(row.name || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 80),
    rentalOrderStatuses: topEntries(
      new Map((rentalStatuses || []).map((row) => [String(row.status || "Unspecified"), Number(row.count) || 0])),
      30
    ),
    workOrderStatuses: topEntries(
      new Map((workOrderStatuses || []).map((row) => [String(row.status || "Unspecified"), Number(row.count) || 0])),
      30
    ),
  };
}

async function fetchCompanyAnalyticsContextSnapshot(companyId) {
  const [
    categoriesRes,
    typesRes,
    equipmentRes,
    rentalStatusesRes,
    workOrderStatusesRes,
    locationsRes,
  ] = await Promise.all([
    pool.query(
      `SELECT name FROM equipment_categories WHERE company_id = $1 ORDER BY name LIMIT 120`,
      [companyId]
    ),
    pool.query(
      `
      SELECT et.name, ec.name AS category_name
      FROM equipment_types et
      LEFT JOIN equipment_categories ec ON ec.id = et.category_id
      WHERE et.company_id = $1
      ORDER BY ec.name NULLS LAST, et.name
      LIMIT 220
      `,
      [companyId]
    ),
    pool.query(
      `
      SELECT
        COALESCE(et.name, e.type) AS equipment_type_name,
        ec.name AS category_name,
        e.model_name,
        e.serial_number
      FROM equipment e
      LEFT JOIN equipment_types et ON et.id = e.type_id
      LEFT JOIN equipment_categories ec ON ec.id = et.category_id
      WHERE e.company_id = $1
      ORDER BY e.created_at DESC NULLS LAST, e.id DESC
      LIMIT 1000
      `,
      [companyId]
    ),
    pool.query(
      `
      SELECT COALESCE(NULLIF(status, ''), 'Unspecified') AS status, COUNT(*)::integer AS count
      FROM rental_orders
      WHERE company_id = $1
      GROUP BY COALESCE(NULLIF(status, ''), 'Unspecified')
      ORDER BY count DESC, status
      LIMIT 40
      `,
      [companyId]
    ),
    pool.query(
      `
      SELECT COALESCE(NULLIF(order_status, ''), 'Unspecified') AS status, COUNT(*)::integer AS count
      FROM work_orders
      WHERE company_id = $1
      GROUP BY COALESCE(NULLIF(order_status, ''), 'Unspecified')
      ORDER BY count DESC, status
      LIMIT 40
      `,
      [companyId]
    ),
    pool.query(
      `SELECT name FROM locations WHERE company_id = $1 ORDER BY name LIMIT 100`,
      [companyId]
    ),
  ]);

  return buildCompanyAnalyticsSnapshot({
    categories: categoriesRes.rows,
    types: typesRes.rows,
    equipment: equipmentRes.rows,
    rentalStatuses: rentalStatusesRes.rows,
    workOrderStatuses: workOrderStatusesRes.rows,
    locations: locationsRes.rows,
  });
}

function buildFallbackCompanyAnalyticsContext(snapshot) {
  const lines = [
    "Company-specific analytics context generated from this tenant's own data.",
    "Use this context only for terminology, aliases, and matching hints. Do not invent rows or facts not present in query results.",
  ];

  if (snapshot.categories?.length) {
    lines.push(`Equipment categories: ${compactCsv(snapshot.categories, 40)}.`);
  }

  if (snapshot.equipmentTypes?.length) {
    lines.push("Equipment types and common company wording:");
    for (const type of snapshot.equipmentTypes.slice(0, 80)) {
      const models = type.commonModels?.length
        ? ` Models: ${type.commonModels.map((entry) => `${entry.value} (${entry.count})`).join(", ")}.`
        : "";
      const serials = type.serialPatterns?.length
        ? ` Serial patterns: ${type.serialPatterns.map((entry) => `${entry.value} (${entry.count})`).join(", ")}.`
        : "";
      lines.push(`- ${type.name} [category: ${type.category}; units: ${type.equipmentCount}].${models}${serials}`);
    }
  }

  if (snapshot.locations?.length) {
    lines.push(`Known locations/branches: ${compactCsv(snapshot.locations, 40)}.`);
  }
  if (snapshot.rentalOrderStatuses?.length) {
    lines.push(
      `Rental order status values in use: ${snapshot.rentalOrderStatuses
        .map((entry) => `${entry.value} (${entry.count})`)
        .join(", ")}.`
    );
  }
  if (snapshot.workOrderStatuses?.length) {
    lines.push(
      `Work order status values in use: ${snapshot.workOrderStatuses
        .map((entry) => `${entry.value} (${entry.count})`)
        .join(", ")}.`
    );
  }

  lines.push(
    "Matching guidance: when users mention equipment in natural language, match against equipment type names, category names, model names, and serial patterns. Treat singular/plural wording as equivalent. Prefer exact equipment type matches over category matches."
  );

  return clampText(lines.join("\n"));
}

function formatCompanyContextForPrompt(companyContext) {
  const markdown = clampText(companyContext?.contextMarkdown || "");
  if (!markdown) return "No company-specific context is available.";
  return [
    "Use this tenant context only for terminology and matching. Do not use it as a numeric source of truth.",
    markdown,
  ].join("\n");
}

async function generateCompanyAnalyticsContextWithAi(snapshot, fallbackMarkdown) {
  if (String(process.env.AI_ANALYTICS_CONTEXT_GENERATOR_ENABLED || "true").toLowerCase() === "false") {
    return { markdown: fallbackMarkdown, json: { generatedBy: "fallback_disabled" } };
  }

  try {
    const client = getOpenAiClient();
    const response = await client.responses.create({
      model: CONTEXT_MODEL,
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: `
Create compact company-specific context for Aiven Rental AI Analytics.
Return only valid JSON:
{
  "context_markdown": "short markdown context under ${MAX_CONTEXT_MARKDOWN_CHARS} characters",
  "aliases": [
    { "phrase": "user wording", "maps_to": "equipment type/category/model/status" }
  ],
  "query_notes": ["short matching/query guidance"]
}

Rules:
- Use only the supplied snapshot.
- Do not invent equipment types, categories, serials, customers, revenue, or counts.
- Focus on terminology: equipment type names, category names, model naming, serial patterns, status values, and likely aliases.
- Keep it concise; this context is injected into every analytics query.
`,
            },
          ],
        },
        { role: "user", content: [{ type: "input_text", text: JSON.stringify(snapshot, null, 2) }] },
      ],
    });
    const parsed = safeJsonFromText(response.output_text || "");
    const markdown = clampText(parsed?.context_markdown || "");
    if (!markdown) throw new Error("AI context response did not include context_markdown.");
    return {
      markdown,
      json: {
        generatedBy: "ai",
        aliases: Array.isArray(parsed.aliases) ? parsed.aliases.slice(0, 80) : [],
        query_notes: Array.isArray(parsed.query_notes) ? parsed.query_notes.slice(0, 80) : [],
      },
    };
  } catch (err) {
    console.warn("AI analytics company context generation failed:", err?.message || err);
    return { markdown: fallbackMarkdown, json: { generatedBy: "fallback_error", error: err?.message || String(err) } };
  }
}

async function getOrCreateCompanyAnalyticsContext(companyId) {
  const snapshot = await fetchCompanyAnalyticsContextSnapshot(companyId);
  const sourceHash = computeCompanyAnalyticsContextSourceHash(snapshot);
  const fallbackMarkdown = buildFallbackCompanyAnalyticsContext(snapshot);

  try {
    const existing = await pool.query(
      `
      SELECT source_hash, context_markdown, context_json, expires_at
      FROM ai_analytics_company_contexts
      WHERE company_id = $1
      LIMIT 1
      `,
      [companyId]
    );
    const row = existing.rows[0];
    const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (row && row.source_hash === sourceHash && (!expiresAt || expiresAt > Date.now())) {
      return {
        sourceHash,
        contextMarkdown: clampText(row.context_markdown),
        contextJson: row.context_json || {},
        generated: false,
      };
    }

    const generated = await generateCompanyAnalyticsContextWithAi(snapshot, fallbackMarkdown);
    const nextExpiresAt = new Date(Date.now() + CONTEXT_TTL_MS).toISOString();
    await pool.query(
      `
      INSERT INTO ai_analytics_company_contexts
        (company_id, source_hash, context_markdown, context_json, generated_at, expires_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW(), $5::timestamptz)
      ON CONFLICT (company_id) DO UPDATE
        SET source_hash = EXCLUDED.source_hash,
            context_markdown = EXCLUDED.context_markdown,
            context_json = EXCLUDED.context_json,
            generated_at = NOW(),
            expires_at = EXCLUDED.expires_at
      `,
      [companyId, sourceHash, generated.markdown, JSON.stringify(generated.json || {}), nextExpiresAt]
    );
    return {
      sourceHash,
      contextMarkdown: generated.markdown,
      contextJson: generated.json || {},
      generated: true,
    };
  } catch (err) {
    console.warn("AI analytics company context cache failed:", err?.message || err);
    return {
      sourceHash,
      contextMarkdown: fallbackMarkdown,
      contextJson: { generatedBy: "fallback_cache_error", error: err?.message || String(err) },
      generated: false,
    };
  }
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

async function preflightClarification({ question, schema, clarification, companyContext }) {
  const preflightDecision = classifyAnalyticsQuestion({ question, clarification });
  if (preflightDecision.status === "blocked") {
    return {
      status: "blocked",
      reason: preflightDecision.reason || BLOCKED_ANALYTICS_RESPONSE.answer,
    };
  }
  if (preflightDecision.status === "clarification_required") {
    return {
      status: "clarification_required",
      clarification: sanitizeClarificationResponse(preflightDecision.clarification),
      reason: preflightDecision.reason || "Clarification required.",
    };
  }
  if (preflightDecision.clarification) return preflightDecision;
  const questionGuidance = getAnalyticsQuestionGuidance(question);
  if (questionGuidance.length) {
    return preflightDecision;
  }

  if (String(process.env.AI_ANALYTICS_CLARIFIER_ENABLED || "false").toLowerCase() !== "true") {
    return preflightDecision;
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

Core business logic:
${formatAnalyticsBusinessLogicForPrompt({ maxChars: 4500 })}

Company-specific context:
${formatCompanyContextForPrompt(companyContext)}

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
  return preflightDecision;
}

function buildQuestionContext({ question, clarification }) {
  const normalizedClarification = normalizeClarification(clarification);
  const guidance = getAnalyticsQuestionGuidance(question);
  if (!normalizedClarification && !guidance.length) return String(question || "").trim();
  if (!normalizedClarification) {
    return JSON.stringify(
      {
        question: String(question || "").trim(),
        guidance,
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      question: String(question || "").trim(),
      clarification: {
        question: normalizedClarification.question,
        answer: normalizedClarification.answer,
        value: normalizedClarification.value,
      },
      guidance,
    },
    null,
    2
  );
}

function extractLatestUserMessage(question) {
  const raw = String(question || "").trim();
  const marker = "\n\nLatest user message:";
  const index = raw.lastIndexOf(marker);
  if (index < 0) return raw;
  return raw.slice(index + marker.length).trim();
}

function extractLastAssistantMessage(question) {
  const raw = String(question || "");
  const latestIndex = raw.lastIndexOf("\n\nLatest user message:");
  const conversation = latestIndex >= 0 ? raw.slice(0, latestIndex) : raw;
  const matches = [...conversation.matchAll(/(?:^|\n)AI:\s*([\s\S]*?)(?=\n(?:User|AI):|\n\nLatest user message:|$)/g)];
  const last = matches.length ? matches[matches.length - 1][1] : "";
  return String(last || "").trim();
}

function buildExplanationFollowUpResponse(question) {
  const latest = extractLatestUserMessage(question).toLowerCase();
  const asksForExplanation =
    /\b(explain|what do you mean|what did you mean|clarify|above answer|previous answer)\b/.test(latest) &&
    /\b(above|previous|that|this|answer|mean)\b/.test(latest);
  if (!asksForExplanation) return null;

  const previousAnswer = extractLastAssistantMessage(question);
  if (!previousAnswer) return null;

  if (/\butili[sz]ation\b/i.test(previousAnswer)) {
    if (/\butili[sz]ed days\b|\bbooked days\b|\brental days\b/i.test(previousAnswer)) {
      return {
        status: "success",
        answer:
          "In the previous answer, utilization meant time-based utilization: utilized rental days divided by booked rental days. That is different from live fleet utilization, which means assets currently out on rent divided by total assets. I should not switch between those definitions in a follow-up unless you ask for a different basis.",
        sql: "",
        purpose: "Explain the previous utilization answer without running a new query.",
        columns: [],
        rows: [],
        rowCount: 0,
        maxRowsApplied: 0,
        csv: Buffer.from("", "utf8").toString("base64"),
        csvEncoding: "base64",
        chart: null,
      };
    }

    if (/\bactive rented assets\b|\btotal equipment units\b|\bcurrently (out|rented)|\bout on rent\b/i.test(previousAnswer)) {
      return {
        status: "success",
        answer:
          "In the previous answer, utilization meant live fleet utilization: active rented assets divided by total equipment units. For example, 22 active rented assets out of 43 total units equals 51.16%. It does not mean historical rented days or revenue utilization.",
        sql: "",
        purpose: "Explain the previous utilization answer without running a new query.",
        columns: [],
        rows: [],
        rowCount: 0,
        maxRowsApplied: 0,
        csv: Buffer.from("", "utf8").toString("base64"),
        csvEncoding: "base64",
        chart: null,
      };
    }
  }

  return {
    status: "success",
    answer:
      "The previous answer was based only on the rows returned by the last query. It should be read as an explanation of those returned rows, not as a new calculation with a different metric.",
    sql: "",
    purpose: "Explain the previous answer without running a new query.",
    columns: [],
    rows: [],
    rowCount: 0,
    maxRowsApplied: 0,
    csv: Buffer.from("", "utf8").toString("base64"),
    csvEncoding: "base64",
    chart: null,
  };
}

async function generateSqlForQuestion({ question, schema, clarification, companyContext }) {
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
- Use the core business logic below for app-wide definitions and default interpretations.
- Use the company-specific context below for tenant terminology, aliases, status values, model names, serial patterns, equipment types, categories, and location names.
- Treat company-specific context as matching guidance only. Do not answer from it directly or invent facts from it.
- If actual duration timestamps are missing, surface missing actual timestamp counts or incomplete rows rather than silently substituting booked dates.
- Follow any question-specific guidance supplied in the user message. It encodes product defaults that should avoid unnecessary clarification.
- Return at most 1000 rows.

Analytics glossary:
${formatAnalyticsGlossaryForPrompt()}

Core business logic:
${formatAnalyticsBusinessLogicForPrompt({ maxChars: 4500 })}

Company-specific context:
${formatCompanyContextForPrompt(companyContext)}

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

async function summarizeQueryResult({
  question,
  clarification,
  sql,
  columns,
  rows,
  rowCount,
  maxRowsApplied,
  chart,
  companyContext,
}) {
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

Do not invent data. Mention row-limit truncation only when rowCount is greater than or equal to maxRowsApplied.
Do not end with follow-up offers or suggestions.
Use company-specific context only to explain wording or aliases, never as a source for numeric facts.
Use the business logic only to explain metric definitions; numeric facts must come from rows.

Core business logic:
${formatAnalyticsBusinessLogicForPrompt({ maxChars: 2500 })}
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
                maxRowsApplied,
                rowLimitReached: Number(rowCount) >= Number(maxRowsApplied),
                previewRows: rows.slice(0, 60),
                initialChartSuggestion: chart || null,
                companyContext: formatCompanyContextForPrompt(companyContext),
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
    const explanation = buildExplanationFollowUpResponse(cleanQuestion);
    if (explanation) {
      await insertAudit({
        companyId,
        userId: Number.isFinite(userId) ? userId : null,
        question: cleanQuestion,
        status: "success",
      });
      return explanation;
    }

    const schema = await fetchAnalyticsSchema();
    if (!schema.length) throw new Error("AI Analytics schema is not available. Restart the server to run migrations.");
    const companyContext = await getOrCreateCompanyAnalyticsContext(companyId);
    const preflight = await preflightClarification({
      question: cleanQuestion,
      schema,
      clarification,
      companyContext,
    });
    if (preflight.status === "blocked") {
      await insertAudit({
        companyId,
        userId: Number.isFinite(userId) ? userId : null,
        question: cleanQuestion,
        status: "blocked",
        error: preflight.reason || null,
      });
      return {
        status: "blocked",
        answer: preflight.reason || BLOCKED_ANALYTICS_RESPONSE.answer,
        columns: [],
        rows: [],
        rowCount: 0,
        chart: null,
      };
    }
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
    const generated = await generateSqlForQuestion({
      question: cleanQuestion,
      schema,
      clarification: clarified,
      companyContext,
    });
    sql = generated.sql;
    const result = await executeAnalyticsSql({ companyId, sql, maxRows });
    const summary = await summarizeQueryResult({
      question: cleanQuestion,
      clarification: clarified,
      sql,
      columns: result.columns,
      rows: result.rows,
      rowCount: result.rowCount,
      maxRowsApplied: result.maxRowsApplied,
      chart: generated.chart,
      companyContext,
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
  getAnalyticsQuestionGuidance,
  normalizeClarification,
  buildCompanyAnalyticsSnapshot,
  buildFallbackCompanyAnalyticsContext,
  computeCompanyAnalyticsContextSourceHash,
  formatAnalyticsBusinessLogicForPrompt,
  formatCompanyContextForPrompt,
  inferSerialPattern,
};
