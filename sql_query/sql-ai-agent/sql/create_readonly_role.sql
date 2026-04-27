-- Run as a database owner/admin. Replace passwords and database/schema names.

-- 1) Create the role/user used by the AI middleware.
CREATE ROLE ai_readonly_user LOGIN PASSWORD 'CHANGE_ME_LONG_RANDOM_PASSWORD';

-- 2) Allow connection to your database.
GRANT CONNECT ON DATABASE your_database_name TO ai_readonly_user;

-- 3) Allow read-only access to the schema(s) the agent may inspect/query.
GRANT USAGE ON SCHEMA public TO ai_readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_readonly_user;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_readonly_user;

-- 4) Make future tables readable too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO ai_readonly_user;

-- Optional but useful: force sensible defaults for the role.
ALTER ROLE ai_readonly_user SET statement_timeout = '8s';
ALTER ROLE ai_readonly_user SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE ai_readonly_user SET default_transaction_read_only = on;
