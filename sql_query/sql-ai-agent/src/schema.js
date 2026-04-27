const { pool } = require('./db');

function getAllowedSchemas() {
  return (process.env.ALLOWED_SCHEMAS || 'public')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

async function fetchDatabaseSchema() {
  const allowedSchemas = getAllowedSchemas();

  const schemaSql = `
    WITH allowed_tables AS (
      SELECT
        c.oid,
        n.nspname AS schema_name,
        c.relname AS table_name,
        c.relkind,
        obj_description(c.oid, 'pg_class') AS table_comment
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'v', 'm')
        AND n.nspname = ANY($1::text[])
    ),
    pk_columns AS (
      SELECT
        con.conrelid AS table_oid,
        a.attname AS column_name
      FROM pg_constraint con
      JOIN pg_attribute a
        ON a.attrelid = con.conrelid
       AND a.attnum = ANY(con.conkey)
      WHERE con.contype = 'p'
    ),
    fk_columns AS (
      SELECT
        con.conrelid AS table_oid,
        a.attname AS column_name,
        nr.nspname AS foreign_schema,
        cr.relname AS foreign_table,
        ar.attname AS foreign_column
      FROM pg_constraint con
      JOIN pg_class cr ON cr.oid = con.confrelid
      JOIN pg_namespace nr ON nr.oid = cr.relnamespace
      JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
      JOIN unnest(con.confkey) WITH ORDINALITY AS fk(attnum, ord) ON fk.ord = ck.ord
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ck.attnum
      JOIN pg_attribute ar ON ar.attrelid = con.confrelid AND ar.attnum = fk.attnum
      WHERE con.contype = 'f'
    )
    SELECT
      t.schema_name,
      t.table_name,
      CASE t.relkind WHEN 'r' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS object_type,
      COALESCE(t.table_comment, '') AS table_comment,
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
      a.attnotnull AS is_not_null,
      COALESCE(col_description(t.oid, a.attnum), '') AS column_comment,
      (pk.column_name IS NOT NULL) AS is_primary_key,
      CASE
        WHEN fk.column_name IS NULL THEN NULL
        ELSE json_build_object(
          'schema', fk.foreign_schema,
          'table', fk.foreign_table,
          'column', fk.foreign_column
        )
      END AS foreign_key
    FROM allowed_tables t
    JOIN pg_attribute a ON a.attrelid = t.oid
    LEFT JOIN pk_columns pk ON pk.table_oid = t.oid AND pk.column_name = a.attname
    LEFT JOIN fk_columns fk ON fk.table_oid = t.oid AND fk.column_name = a.attname
    WHERE a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY t.schema_name, t.table_name, a.attnum;
  `;

  const { rows } = await pool.query(schemaSql, [allowedSchemas]);

  const tablesByKey = new Map();
  for (const row of rows) {
    const key = `${row.schema_name}.${row.table_name}`;
    if (!tablesByKey.has(key)) {
      tablesByKey.set(key, {
        schema: row.schema_name,
        name: row.table_name,
        type: row.object_type,
        description: row.table_comment || '',
        columns: []
      });
    }

    tablesByKey.get(key).columns.push({
      name: row.column_name,
      type: row.data_type,
      description: row.column_comment || '',
      not_null: row.is_not_null,
      primary_key: row.is_primary_key,
      foreign_key: row.foreign_key
    });
  }

  return {
    dialect: 'PostgreSQL',
    allowed_schemas: allowedSchemas,
    instructions_for_model: [
      'Use table and column descriptions/comments to map user-friendly wording to the correct tables and fields.',
      'Only write read-only SELECT queries. Never write INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, COPY, CALL, DO, EXECUTE, VACUUM, ANALYZE, or REFRESH queries.',
      'Prefer explicit column names over SELECT * unless the user asks for raw records.',
      'Use joins through primary keys and foreign keys where available.',
      'When uncertain, ask a short clarification question rather than guessing.'
    ],
    tables: Array.from(tablesByKey.values())
  };
}

module.exports = { fetchDatabaseSchema };
