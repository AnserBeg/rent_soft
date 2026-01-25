# Aiven Rental – equipment inventory (multi-tenant)

Backend: Node + Express + PostgreSQL. Frontend: static HTML/CSS/JS served by the same server. Supports multi-tenant companies, users, locations, and equipment scoped by `company_id`.

## Setup
1) Copy env and edit database connection:
```
cp .env.example .env
```
2) Install packages (requires network access):
```
npm install
```
3) Ensure PostgreSQL is running and accessible from `DATABASE_URL`.
4) (Optional) Set `GEMINI_API_KEY` to enable AI damage reports in Rental Orders -> Before/After docs.

## Database
- Optional: run the schema manually with `psql -f db/schema.sql`.
- The server also calls `ensureTables()` on boot to create tables if missing.

## Run
```
npm start
```
Server listens on `PORT` (default 4000) and serves the UI at `http://localhost:4000`.

## Mobile UI
The UI is not a separate app: it’s the same HTML pages with responsive CSS (media queries) and a small JS enhancement. On small screens the left sidebar becomes an off-canvas menu opened via a top “menu” button.

## Legacy rental order import
- Go to `Rental Orders` and use `Import legacy exports`.
- Required: upload both files (the `transactions` export and the `instances` export).
- Import behavior:
  - Creates missing customers, equipment categories/types, and equipment units as needed.
  - Uses `Contract #` as `external_contract_number` on the rental order.
  - If a serial number is missing/unallocated, creates placeholder serials like `UNALLOCATED-<contract>-<typeId>-<n>`.
  - If an end date is missing, tries `Charged Duration`; otherwise defaults to `start + 30 days`.
  - Stores all non-empty legacy columns from both files in `rental_orders.legacy_data` (JSONB).

## API quick reference
- `POST /api/companies` -> `{ companyName, contactEmail, ownerName, ownerEmail, password }`
- `POST /api/users` -> `{ companyId, name, email, role?, password }`
- `GET /api/locations?companyId=1`
- `POST /api/locations` -> `{ companyId, name }`
- `GET /api/equipment?companyId=1`
- `POST /api/equipment` -> `{ companyId, type, modelName, serialNumber, condition, manufacturer?, locationId?, purchasePrice? }`

## Password policy
- Minimum length: 8 characters for company users and customer accounts.
- Recommendation: include letters, numbers, and symbols.

All entities are tied to `company_id` for multitenancy. No authentication layer is included; add one before production use.
