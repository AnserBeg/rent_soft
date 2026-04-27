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
3) Ensure PostgreSQL is running and accessible from `DATABASE_URL` (hosted providers often require TLS/SSL; set `DATABASE_SSL=true` or add `?sslmode=require`).
4) (Optional) Set `GEMINI_API_KEY` to enable AI damage reports in Rental Orders -> Before/After docs.

## Database
- Optional: run the schema manually with `psql -f db/schema.sql`.
- The server also calls `ensureTables()` on boot to create tables if missing.

## Run
```
npm start
```
Server listens on `PORT` (default 4000) and serves the UI at `http://localhost:4000`.

## Recurring work orders
If a work order is marked as recurring and has a `Due Date`, the server will automatically create a new work order when the due date arrives. Configure with `RECURRING_WORK_ORDERS_ENABLED` and `RECURRING_WORK_ORDER_SWEEP_MS` in `.env`.

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
- `POST /api/locations` -> `{ companyId, name, streetAddress?, city?, region?, country?, latitude?, longitude?, isBaseLocation? }`
- `GET /api/equipment?companyId=1`
- `POST /api/equipment` -> `{ companyId, typeId|typeName, modelName, serialNumber, condition?, manufacturer?, locationId?, currentLocationId?, purchasePrice?, notes? }`

## Asset locations
- `locationId` is the asset's base/home yard or branch.
- `currentLocationId` is the asset's physical current location. If it is blank, the UI treats the unit as "Same as base location"; the database does not have to duplicate the base id into `currentLocationId`.
- Map-picked current locations, rental order site locations, drop-off locations, and customer-link unit pins are created as non-base locations (`isBaseLocation=false`) so they do not clutter base-yard selectors.
- Location map markers require saved latitude/longitude. Unit maps use current-location coordinates first and fall back to base-location coordinates when current coordinates are missing.
- Current-location changes are recorded in `equipment_current_location_history`.

## Password policy
- Minimum length: 8 characters for company users and customer accounts.
- Recommendation: include letters, numbers, and symbols.

All entities are tied to `company_id` for multitenancy. No authentication layer is included; add one before production use.
