# Analytics Business Logic Reference

This document explains the business rules that matter when answering analytics questions for Aiven Rental. It is written for the AI Analytics agent, developers maintaining `ai_analytics` views, and anyone validating analytics output against the application UI.

The main principle: analytics should use the same business concepts the app uses. Raw storage columns such as `created_at` and `line_amount` are sometimes correct, but often represent a different question than the one a user intended.

## Tenant And Safety Boundary

All AI Analytics queries must run through tenant-scoped `ai_analytics` views. The SQL agent must not query `public`, `information_schema`, `pg_catalog`, app session tables, passwords, tokens, credentials, QBO connection secrets, or company settings.

The API enforces:

- Read-only transaction.
- `search_path = ai_analytics`.
- `rentsoft.current_company_id` set for row-level scoped views.
- One SQL statement only.
- No writes, DDL, comments, system functions, secret-like identifiers, or base schema access.

Sensitive integration tables such as `qbo_connections`, `qbo_documents`, `qbo_error_logs`, sessions, password hashes, and settings should not be exposed to the analytics model.

## Core Entities

### Companies

`companies` are tenants. Every business record should be scoped to one company directly or through a parent record.

### Customers

Customers can be parent/branch style records. In list views, a branch may be displayed as:

`Parent Company - Branch Company`

Analytics should preserve this naming style where available when users ask for customer-level totals.

Customer records can include contacts, accounting contacts, sales person, follow-up date, notes, and QBO customer IDs. These are business fields, not credentials.

### Equipment And Assets

`equipment_types` are catalog/rate definitions, such as "Solar Surveillance Tower".

`equipment` rows are individual assets/units with serial number, model, type, condition, location, and purchase price.

Important distinction:

- "Equipment type" means a rentable product category/type.
- "Asset", "unit", or "equipment unit" means an individual `equipment` record.
- "Model" and "serial" are individual asset identifiers, not type names.

### Locations

Locations represent yards/branches/sites in the app. For "branch" revenue or charges, default to `rental_orders.pickup_location_id` joined to `locations`, unless the user explicitly asks for job site, base location, or current equipment location.

## Rental Order Statuses

Rental order status values normalize as follows:

- `quote`: quote/draft stage.
- `quote_rejected`: rejected quote.
- `requested`: customer booking request.
- `request_rejected`: rejected booking request.
- `reservation`: reserved demand.
- `ordered`: active rental order.
- `received`: equipment has been received/returned.
- `closed`: finalized/closed order.

Aliases:

- `draft` -> `quote`
- `request`, `booking_request` -> `requested`
- `recieved` -> `received`
- rejected variants normalize to their rejected status.

Business status groups:

- Quote-only statuses: `quote`, `quote_rejected`.
- Demand-only statuses: `quote`, `quote_rejected`, `reservation`, `requested`.
- Inventory assignment is allowed for statuses other than `quote`, `quote_rejected`, and `requested`.

Status can be overridden from line item state:

- If all valid line items are returned, status behaves like `received`.
- If any line item is fulfilled while order is `requested` or `reservation`, status behaves like `ordered`.
- If a `received` order has unreturned items, it behaves like `ordered`.

For analytics, be explicit about status filters. If a UI screenshot shows selected statuses, match those statuses.

## Rental Order Dates

Rental orders have header-level `created_at` and `updated_at`, but the rental period lives on line items.

Line item date fields:

- `start_at`: scheduled rental start.
- `end_at`: scheduled rental end.
- `fulfilled_at`: actual pickup/delivery/out timestamp.
- `returned_at`: actual return/check-in timestamp.

Use the date basis that matches the question:

- "Created", "new orders", "orders opened" -> `rental_order_created_at` or order `created_at`.
- "Rental period", "active during", "out during", "monthly charges" -> line item overlap with the target period.
- "Actual days", "picked up to returned" -> `fulfilled_at` to `returned_at`.
- "Currently out", "still rented", "active rental" -> `fulfilled_at IS NOT NULL AND returned_at IS NULL`.

Do not use order `created_at` to answer questions about activity or charges in a month unless the user explicitly asks for orders created in that month.

## Duration Definitions

The app distinguishes multiple "days rented" concepts:

- `booked_days`: scheduled duration from `end_at - start_at`.
- `actual_completed_days`: actual completed duration from `returned_at - fulfilled_at`; only available when both timestamps exist.
- `actual_live_days`: actual duration so far from `COALESCE(returned_at, NOW()) - fulfilled_at`; only available after fulfillment.
- `billable_days`: billable units for daily rates; based on `billable_units` when rate basis is daily.

If a user asks "how many days was it rented out?" without saying booked, actual, live/current, returned/completed, billable, charged, or invoiced, ask for clarification.

## Rates And Line Amounts

Rental line items use:

- `rate_basis`: `daily`, `weekly`, or `monthly`.
- `rate_amount`: amount for that rate basis.
- `billable_units`: computed billing units for the full line item.
- `line_amount`: `rate_amount * billable_units` for the full line item, before fees/taxes.

Important: `line_amount` is not necessarily "revenue in the month." It is a line-level amount for the whole line item and may span multiple months.

Use `line_amount` when the question is about:

- Stored line item totals.
- Total value of orders/lines as entered.
- Revenue by order creation date, if the user explicitly asks that.

Do not use `line_amount` grouped by `rental_order_created_at` for "monthly charges".

## Monthly Charges

"Monthly charges", "customer monthly totals", and "charges from rental orders by month" have a specific business meaning in the app.

They mean charges allocated into the month where rental activity occurs:

- prorated by active time in each month,
- based on line item rate basis and rate amount,
- using actual fulfilled/returned dates where available,
- using scheduled dates where actual dates are not present,
- open items can count through the current time when their scheduled end is in the past,
- minus line item pause periods,
- plus fees whose `fee_date` falls in that month.

Preferred analytics view:

`rental_order_monthly_charges`

Important columns:

- `month`
- `rental_order_id`
- `customer_id`
- `rental_order_status`
- `quote_number`
- `ro_number`
- `pickup_location_id`
- `source_kind`: `line_item` or `fee`
- `line_item_id`
- `fee_id`
- `equipment_type_id`
- `equipment_type_name`
- `rate_basis`
- `rate_amount`
- `quantity`
- `active_days`
- `billable_units_in_month`
- `line_item_charge`
- `fee_amount`
- `total_charge`

Use pattern:

```sql
SELECT month, SUM(total_charge) AS monthly_charges
FROM rental_order_monthly_charges
WHERE month >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
  AND month < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  AND rental_order_status IN ('requested', 'reservation', 'ordered')
GROUP BY month
ORDER BY month
```

Default statuses for the Monthly Customer Totals page are typically `requested`, `reservation`, and `ordered`, but if the user asks for closed/received/invoiced/finalized revenue, use the status they requested.

Common mistake:

```sql
-- Wrong for monthly charges
SELECT date_trunc('month', rental_order_created_at), SUM(line_amount)
FROM rental_order_line_items
GROUP BY 1
```

That answers "line amount on orders created in each month," not "charges earned/allocated in each month."

## Revenue

"Revenue" can mean different things. The agent should infer from wording or ask when the basis would materially change the answer.

Common interpretations:

- Rental line revenue: sum `rental_order_line_items.line_amount`.
- Order total: line subtotal plus `rental_order_fees.amount`.
- Monthly charges: sum `rental_order_monthly_charges.total_charge`.
- QBO invoices: QuickBooks document totals; not currently exposed to AI Analytics for safety.
- Closed sales revenue: sales order `sale_price` for closed sales orders.

Rules:

- Avoid counting `quote` rows as earned revenue unless the user asks for quoted pipeline.
- If the user says "made", "earned", or "charges this month", prefer monthly charges or completed/active order charges, not quote totals.
- If the user says "booked revenue" or "pipeline", include requested/reservation/quote only when asked.
- If the user says "by branch", default to pickup branch.

## Fees And Taxes

Rental order fees live in `rental_order_fees`.

Fees have:

- `name`
- `amount`
- `fee_date`

For monthly charges, fees count in the month of `fee_date`.

The app often displays a 5% GST/tax calculation on order list totals, but analytics should not assume tax unless the user explicitly asks for tax-inclusive totals. Prefer pre-tax charges unless stated otherwise.

## Utilization

"Utilization" is ambiguous. The app has several defensible meanings:

- Live fleet utilization: currently rented assets / total assets.
- Time utilization over a period: utilized asset-days / capacity asset-days.
- Booked utilization: booked scheduled days / capacity days.
- Revenue utilization: revenue or charges relative to possible revenue.

Defaults:

- If no date range is given, default to live fleet utilization.
- If a date range or month is given, use period/time utilization unless the user asks for revenue utilization.
- If the user asks for utilization by equipment type, group by `equipment_type_name`.

Live utilization pattern:

```sql
WITH total_assets AS (
  SELECT equipment_type_name, COUNT(*) AS total_units
  FROM equipment
  GROUP BY equipment_type_name
),
active_assets AS (
  SELECT equipment_type_name, COUNT(DISTINCT equipment_id) AS active_units
  FROM rental_order_line_item_assets
  WHERE fulfilled_at IS NOT NULL
    AND returned_at IS NULL
  GROUP BY equipment_type_name
)
SELECT ...
```

Period utilization should clip rental windows to the requested date range and divide utilized asset-days by total equipment units times period days.

## Inventory And Availability

Inventory counts come from `equipment`.

Equipment type counts should group by `equipment_type_name` or `type_id`.

Assigned rental assets are represented by `rental_order_line_inventory` and the analytics view `rental_order_line_item_assets`.

Current rented assets:

- `fulfilled_at IS NOT NULL`
- `returned_at IS NULL`

Out of service equipment uses `equipment_out_of_service` and/or work orders depending on the question. Work orders have service/order status and can include equipment IDs.

Availability and shortage logic in the app may account for demand-only statuses and projection. For high-fidelity availability questions, prefer existing analytics views/functions if available rather than hand-rolling from active rentals alone.

## Work Orders

Work orders represent service/repair/maintenance work.

Important fields:

- `work_order_number`
- `order_status`
- `service_status`
- `due_date`
- `completed_at`
- `closed_at`
- `unit_id` / `unit_ids`
- `rental_order_id`
- `customer_id`
- `work_order_type`
- `priority`

Common interpretations:

- "Open work orders" means not closed/completed, using `order_status` and/or null `closed_at`.
- "Overdue work orders" means due date before current date and not closed/completed.
- "By asset" should include serial/model/type where available.

Work orders can also create line-item pause periods, which affect monthly charges.

## Sales Orders And Purchase Orders

Sales orders represent asset sales, not rentals.

Use `sales_orders.sale_price` for sales revenue, usually with `status = 'closed'` when asking for realized sales revenue.

Purchase orders represent acquiring equipment. Equipment has no dedicated `purchase_date`; acquisition timing may come from purchase order `expected_possession_date`, `closed_at`, or equipment `created_at` as a fallback.

## QBO / QuickBooks

QBO connection credentials and tokens are sensitive and must never be exposed to AI Analytics.

QBO concepts:

- `qbo_connections`: realm and encrypted tokens. Not analytics-safe.
- `qbo_documents`: invoice/document sync metadata. Currently not exposed to AI Analytics.
- `qbo_error_logs`: integration errors/payloads. Not exposed to AI Analytics.

If a user asks for "QuickBooks invoices" or "QBO revenue", the current analytics agent should say that QBO invoice data is not available through AI Analytics unless a safe summary view is added later.

## AI Analytics Preferred Views

Use these views before raw table-style views where possible:

- `rental_order_monthly_charges`: monthly prorated charges and fees.
- `rental_order_line_item_assets`: one row per assigned equipment unit on a rental line; best for asset-level rental questions.
- `rental_order_line_items`: line-level rental dates, rates, and full line amount.
- `rental_order_line_inventory`: assignment join table.
- `equipment`: individual asset/unit data with type and locations.
- `equipment_types`: catalog and rates.
- `customers`: customer records.
- `rental_orders`: order headers/status/customer/site/branch.
- `work_orders`: service/repair work.

## Common Analytics Traps

1. `created_at` is not activity date.
   Use it only for created/opened/new records.

2. `line_amount` is not monthly charge.
   It is the full line item amount. Use `rental_order_monthly_charges.total_charge` for monthly allocation.

3. "Rented days" is ambiguous.
   Ask for booked, actual completed, live/current, or billable basis.

4. "Utilization" is ambiguous.
   Default to live utilization without a date range; use period utilization with a date range.

5. Quotes are not earned revenue.
   Include quotes only for quote/pipeline questions.

6. Requested/reservation statuses are demand, not necessarily equipment physically out.

7. Fees are separate from line items.
   Include them only when the business concept includes order totals or monthly charges.

8. QBO records are not available to AI Analytics unless safe summary views are explicitly added.

9. Branch means pickup branch by default.
   Do not use site, current location, or base location unless the user says so.

10. Parent/branch customer names can be combined.
    Preserve parent context when reporting customer totals.

## Recommended Agent Behavior

When the user asks a business question:

1. Identify the business concept before choosing columns.
2. Choose date basis: created date, rental period, actual active period, billing month, due date, or closed date.
3. Choose amount basis: line amount, fee amount, monthly charge, order total, sale price, or count.
4. Choose status basis: pipeline/demand, active, returned/received, closed, or all.
5. Use company-specific context for terminology and matching only.
6. Use the safest purpose-built analytics view.
7. If a concept is ambiguous and materially changes the SQL, ask for clarification.


