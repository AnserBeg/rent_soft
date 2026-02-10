-- Multi-tenant equipment inventory schema

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS equipment_categories (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS equipment_types (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES equipment_categories(id) ON DELETE SET NULL,
  image_url TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT,
  terms TEXT,
  daily_rate NUMERIC(12, 2),
  weekly_rate NUMERIC(12, 2),
  monthly_rate NUMERIC(12, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS sales_people (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  street_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  postal_code TEXT,
  sales_person_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL,
  follow_up_date DATE,
  notes TEXT,
  email TEXT,
  phone TEXT,
  contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  accounting_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  street_address TEXT,
  city TEXT,
  region TEXT,
  country TEXT,
  postal_code TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendors_company_id_idx ON vendors (company_id);

CREATE TABLE IF NOT EXISTS customer_pricing (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE CASCADE,
  daily_rate NUMERIC(12, 2),
  weekly_rate NUMERIC(12, 2),
  monthly_rate NUMERIC(12, 2),
  UNIQUE(customer_id, type_id)
);

CREATE TABLE IF NOT EXISTS equipment (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  condition TEXT NOT NULL,
  manufacturer TEXT,
  image_url TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  purchase_price NUMERIC(12, 2),
  type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open',
  expected_possession_date DATE,
  type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
  model_name TEXT,
  serial_number TEXT,
  condition TEXT,
  manufacturer TEXT,
  image_url TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  current_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  purchase_price NUMERIC(12, 2),
  notes TEXT,
  equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_orders_company_id_idx ON purchase_orders (company_id);
CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx ON purchase_orders (company_id, status);
CREATE INDEX IF NOT EXISTS purchase_orders_company_expected_idx ON purchase_orders (company_id, expected_possession_date);

CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_number TEXT NOT NULL,
  work_date DATE NOT NULL,
  unit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit_labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
  unit_label TEXT,
  work_summary TEXT,
  issues TEXT,
  order_status TEXT NOT NULL DEFAULT 'open',
  service_status TEXT NOT NULL DEFAULT 'in_service',
  return_inspection BOOLEAN NOT NULL DEFAULT FALSE,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  labor JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT,
  source_order_id TEXT,
  source_order_number TEXT,
  source_line_item_id TEXT,
  completed_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, work_order_number)
);

CREATE INDEX IF NOT EXISTS work_orders_company_idx ON work_orders (company_id);
CREATE INDEX IF NOT EXISTS work_orders_company_status_idx ON work_orders (company_id, order_status);
CREATE INDEX IF NOT EXISTS work_orders_company_service_idx ON work_orders (company_id, service_status);
CREATE INDEX IF NOT EXISTS work_orders_updated_idx ON work_orders (company_id, updated_at);
CREATE INDEX IF NOT EXISTS work_orders_unit_ids_idx ON work_orders USING GIN (unit_ids);

-- Rental Orders (RO)
CREATE TABLE IF NOT EXISTS rental_orders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  quote_number TEXT,
  ro_number TEXT,
  customer_po TEXT,
  salesperson_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL,
  fulfillment_method TEXT NOT NULL DEFAULT 'pickup',
  status TEXT NOT NULL DEFAULT 'quote',
  terms TEXT,
  general_notes TEXT,
  pickup_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  dropoff_address TEXT,
  site_name TEXT,
  site_address TEXT,
  logistics_instructions TEXT,
  special_instructions TEXT,
  critical_areas TEXT,
  notification_circumstances JSONB NOT NULL DEFAULT '[]'::jsonb,
  coverage_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  monthly_recurring_subtotal NUMERIC(12, 2),
  monthly_recurring_total NUMERIC(12, 2),
  show_monthly_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS rental_orders_company_quote_number_uniq
  ON rental_orders(company_id, quote_number)
  WHERE quote_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS rental_orders_company_ro_number_uniq
  ON rental_orders(company_id, ro_number)
  WHERE ro_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS doc_sequences (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_prefix TEXT NOT NULL,
  year INTEGER NOT NULL,
  next_seq INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (company_id, doc_prefix, year)
);

CREATE TABLE IF NOT EXISTS rental_order_line_items (
  id SERIAL PRIMARY KEY,
  rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
  type_id INTEGER NOT NULL REFERENCES equipment_types(id) ON DELETE RESTRICT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  fulfilled_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  rate_basis TEXT,
  rate_amount NUMERIC(12, 2),
  billable_units NUMERIC(12, 4),
  line_amount NUMERIC(12, 2)
);

-- Company settings
CREATE TABLE IF NOT EXISTS company_settings (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  billing_rounding_mode TEXT NOT NULL DEFAULT 'ceil',
  billing_rounding_granularity TEXT NOT NULL DEFAULT 'unit',
  monthly_proration_method TEXT NOT NULL DEFAULT 'hours',
  billing_timezone TEXT NOT NULL DEFAULT 'UTC',
  logo_url TEXT,
  tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0,
  tax_registration_number TEXT,
  tax_inclusive_pricing BOOLEAN NOT NULL DEFAULT FALSE,
  auto_apply_customer_credit BOOLEAN NOT NULL DEFAULT TRUE,
  auto_work_order_on_return BOOLEAN NOT NULL DEFAULT FALSE,
  required_storefront_customer_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  rental_info_fields JSONB NOT NULL DEFAULT '{"siteAddress":{"enabled":true,"required":false},"siteName":{"enabled":true,"required":false},"criticalAreas":{"enabled":true,"required":true},"generalNotes":{"enabled":true,"required":true},"emergencyContacts":{"enabled":true,"required":true},"siteContacts":{"enabled":true,"required":true},"notificationCircumstances":{"enabled":true,"required":false},"coverageHours":{"enabled":true,"required":true}}'::jsonb,
  email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_smtp_provider TEXT NOT NULL DEFAULT 'custom',
  email_smtp_host TEXT,
  email_smtp_port INTEGER,
  email_smtp_secure BOOLEAN NOT NULL DEFAULT FALSE,
  email_smtp_require_tls BOOLEAN NOT NULL DEFAULT FALSE,
  email_smtp_user TEXT,
  email_smtp_pass TEXT,
  email_from_name TEXT,
  email_from_address TEXT,
  email_notify_request_submit BOOLEAN NOT NULL DEFAULT TRUE,
  email_notify_status_updates BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_order_line_inventory (
  line_item_id INTEGER NOT NULL REFERENCES rental_order_line_items(id) ON DELETE CASCADE,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  PRIMARY KEY (line_item_id, equipment_id)
);

CREATE TABLE IF NOT EXISTS rental_order_line_conditions (
  line_item_id INTEGER PRIMARY KEY REFERENCES rental_order_line_items(id) ON DELETE CASCADE,
  before_notes TEXT,
  after_notes TEXT,
  unit_description TEXT,
  before_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  after_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_report_markdown TEXT,
  ai_report_generated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rental_order_fees (
  id SERIAL PRIMARY KEY,
  rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fee_date DATE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rental_order_notes (
  id SERIAL PRIMARY KEY,
  rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rental_order_attachments (
  id SERIAL PRIMARY KEY,
  rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER,
  url TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
