const { z } = require('zod');
const { pool } = require('./db');
const { rowsToCsv } = require('./csv');

const HARD_ROW_LIMIT = 1000;

const QueryBody = z.object({
  q: z.string().min(1).max(50_000),
  maxRows: z.number().int().positive().max(HARD_ROW_LIMIT).optional(),
  purpose: z.string().max(500).optional()
});

const FORBIDDEN_SQL = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|execute|vacuum|analyze|refresh|merge|listen|notify|set|reset|show)\b/i;

function normalizeSql(sql) {
  return sql.trim().replace(/;+\s*$/, '').trim();
}

function validateReadOnlySql(sql) {
  const normalized = normalizeSql(sql);

  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error('Only SELECT or WITH queries are allowed.');
  }

  if (normalized.includes(';')) {
    throw new Error('Only one SQL statement is allowed. Remove semicolons inside the query.');
  }

  if (FORBIDDEN_SQL.test(normalized)) {
    throw new Error('This query contains a forbidden SQL command. Only read-only SELECT queries are allowed.');
  }

  return normalized;
}

async function executeReadOnlyQuery(body) {
  const parsed = QueryBody.parse(body);
  const sql = validateReadOnlySql(parsed.q);
  const configuredDefaultMaxRows = Number(process.env.MAX_ROWS_DEFAULT || HARD_ROW_LIMIT);
  const maxRows = Math.min(parsed.maxRows || configuredDefaultMaxRows, HARD_ROW_LIMIT);
  const timeoutMs = Number(process.env.STATEMENT_TIMEOUT_MS || 8000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query('SET LOCAL statement_timeout = $1', [timeoutMs]);
    await client.query('SET LOCAL idle_in_transaction_session_timeout = $1', [timeoutMs + 2000]);
    await client.query('SET LOCAL lock_timeout = $1', [2000]);

    // Wrap the model's query so the API can enforce max rows even if the model forgets LIMIT.
    const wrappedSql = `SELECT * FROM (${sql}) AS ai_agent_result LIMIT $1`;
    const result = await client.query(wrappedSql, [maxRows]);
    await client.query('COMMIT');

    const columns = result.fields.map(f => f.name);
    const csv = rowsToCsv(result.rows, columns);
    const base64Csv = Buffer.from(csv, 'utf8').toString('base64');

    return {
      sql_executed: sql,
      row_count: result.rowCount,
      max_rows_applied: maxRows,
      columns,
      preview_rows: result.rows.slice(0, 25),
      openaiFileResponse: [
        {
          name: 'query_result.csv',
          mime_type: 'text/csv',
          content: base64Csv
        }
      ]
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { executeReadOnlyQuery, validateReadOnlySql };
