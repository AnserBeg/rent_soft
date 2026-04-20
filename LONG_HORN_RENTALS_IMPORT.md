# Long Horn Rentals import (Developer + in-app)

## Recommended import order
1. **Developer Portal → Admin import**: import the *Equipment Type* file (creates company + equipment types).
2. **Customers → Import**: import the customers/contacts file (one row per contact is supported).
3. **Equipments → Import inventory**: import the inventory list (supports base/current location, directions, and service tracking columns).
4. **Work Orders → Import**: import the work orders sheet (creates/updates work orders and links units).
5. **Rental Orders → Import CSV**: import the rental orders sheet + line items sheet.

## Customers import (supported columns)
At minimum, provide a customer/company name and at least one contact row.

Common columns supported:
- `customer` / `company` / `company_name`
- `street_add` / `street_address`, `city`, `province` / `state_province`, `country`, `postal_cod` / `postal_code`
- `contact_na` / `contact_name`, `contact_ph` / `contact_phone`, `contact_er` / `contact_email`, `contact_tit` / `contact_title`

## Inventory import (supported columns)
Requires:
- `Equipment Type`
- `Model Name` (used as both `model_name` and `serial_number`)

Optional:
- `Base Location`, `Current Location`
- `Directions` (if any directions are present, the company setting `asset_directions_enabled` is auto-enabled)
- `Last Service Date`, `Service Due Date`, `Current Hours`, `Service Notes`, `Notes`

When service/hour columns have values, the import auto-creates equipment type tracking fields:
- `last_service_date` (Date, manual due date separate)
- `hours_operated` (Number, unit `hours`)

## Work orders import (supported columns)
Requires:
- A unit reference column: `inventory_summary` / `units` / `assets` / `equipment` (comma-separated).

Optional (common):
- `work order number` / `work_order_number` / `wo` (if missing, the importer auto-generates a `WO-YYYY-#####` number)
- `created date` / `created_date` (used as the work order's created date in the UI)
- `due date` / `due_date`
- `category`, `customer`, `contact`
- `task_at_hand` / `work_summary` / `summary` (maps to Work Summary)
- `notes` / `issues` (maps to Issues)
- `RO` / `ro_number` (links to the rental order by `ro_number` when found)
- `site` and `site name` / `site_name` (stored as Site Address + Site Name)
- `recurring` (Yes/No) and `recurrence_detail` (e.g. Weekly, Every 4 days)

Unit references are matched to existing assets by **equipment id**, `model_name`, or `serial_number`. If no match is found, a placeholder asset is created with type `Imported`.

## Rental orders import (supported columns)
### Rental orders sheet
Requires:
- `RO`

Optional:
- `customer`, `fulfillment method`, `status`, `dropoff address`, `site name`, `directions`, `site access information / pin`, `created_at`, `updated_at`

### Line items sheet
Requires:
- `RO`

Optional (but strongly recommended):
- `equipment type`, `model name`, `start_at`, `end_at`, `returned_at`

If `start_at` is empty, the importer defaults to the order `created_at` (if provided), otherwise it defaults to **today**.
If `end_at` is empty, it defaults to `start_at + 30 days`.

If a referenced asset doesn’t exist yet, a placeholder asset is created and assigned to the line item.
