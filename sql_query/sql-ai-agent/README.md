# SQL AI Agent Middleware

This project gives a Custom GPT or AI agent safe read-only access to a PostgreSQL database.

It is designed for users who ask plain-English questions and do not know your database schema. The important feature is `/v1/schema`, which retrieves table and column comments from PostgreSQL so the agent can map user wording to the right tables and fields.

## Architecture

User question -> Custom GPT / AI agent -> `getDatabaseSchema` -> `databaseQuery` -> PostgreSQL read-only role -> answer.

## 1. Add useful comments to Postgres

Example:

```sql
COMMENT ON TABLE rental_orders IS 'Rental orders created for customers. Use this for questions about active rentals, customer jobs, delivery, pickup, and rental status.';
COMMENT ON COLUMN rental_orders.status IS 'Current lifecycle status of the rental order, such as draft, active, completed, or cancelled.';
COMMENT ON COLUMN rental_orders.monthly_recurring_total IS 'Monthly recurring rental revenue expected from this rental order.';
```

## 2. Create a read-only database role

Edit and run:

```bash
psql "$DATABASE_URL" -f sql/create_readonly_role.sql
```

Use this read-only role in your middleware `DATABASE_URL`.

## 3. Install and run

```bash
cp .env.example .env
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Schema test:

```bash
curl -H "X-Api-Key: YOUR_KEY" http://localhost:3000/v1/schema
```

Query test:

```bash
curl -X POST http://localhost:3000/v1/query \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: YOUR_KEY" \
  -d '{"q":"SELECT now() AS server_time","maxRows":10,"purpose":"Test query"}'
```

## 4. Deploy

Deploy this like any Node/Express app on Render, Railway, Fly.io, AWS, GCP, or Azure.

Required environment variables:

- `DATABASE_URL`
- `GPT_ACTION_API_KEY`
- `DB_SSL=true` for most hosted Postgres providers
- `ALLOWED_SCHEMAS=public` or a comma-separated list like `public,analytics`

## 5. Configure the Custom GPT Action

1. In your Custom GPT, enable Actions.
2. Paste `openapi.yaml`.
3. Replace `https://YOUR-MIDDLEWARE-DOMAIN.com` with your deployed middleware URL.
4. Authentication: API Key.
5. Header name: `X-Api-Key`.
6. API key value: the same value as `GPT_ACTION_API_KEY`.
7. Enable Code Interpreter / Data Analysis if you want ChatGPT to analyze returned CSV files.
8. Paste `custom_gpt_instructions.md` into the GPT instructions.

## 6. Safety model

This project uses multiple layers:

1. The database account is read-only.
2. The role has `default_transaction_read_only = on`.
3. Middleware only accepts SQL starting with `SELECT` or `WITH`.
4. Middleware blocks common write/admin SQL commands.
5. Middleware wraps every query in a `BEGIN READ ONLY` transaction.
6. Middleware enforces `statement_timeout`, `lock_timeout`, and a hard maximum row limit of 1,000 rows.

Do not connect this middleware with your production owner/admin database user.
