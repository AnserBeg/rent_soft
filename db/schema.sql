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
  site_address TEXT,
  logistics_instructions TEXT,
  special_instructions TEXT,
  critical_areas TEXT,
  coverage_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
  emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  invoice_date_mode TEXT NOT NULL DEFAULT 'generation',
  default_payment_terms_days INTEGER NOT NULL DEFAULT 30,
  logo_url TEXT,
  invoice_auto_run TEXT NOT NULL DEFAULT 'off',
  invoice_auto_mode TEXT NOT NULL DEFAULT 'auto',
  tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  default_tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0,
  tax_registration_number TEXT,
  tax_inclusive_pricing BOOLEAN NOT NULL DEFAULT FALSE,
  auto_apply_customer_credit BOOLEAN NOT NULL DEFAULT TRUE,
  auto_work_order_on_return BOOLEAN NOT NULL DEFAULT FALSE,
  required_storefront_customer_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  email_notify_invoices BOOLEAN NOT NULL DEFAULT FALSE,
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
  before_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  after_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_report_markdown TEXT,
  ai_report_generated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rental_order_fees (
  id SERIAL PRIMARY KEY,
  rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoices / Accounts Receivable
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  rental_order_id INTEGER REFERENCES rental_orders(id) ON DELETE SET NULL,
  applies_to_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  document_type TEXT NOT NULL DEFAULT 'invoice',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  service_period_start TIMESTAMPTZ,
  service_period_end TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  billing_reason TEXT,
  general_notes TEXT,
  notes TEXT,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by TEXT,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (company_id, customer_id);
CREATE INDEX IF NOT EXISTS invoices_rental_order_idx ON invoices (company_id, rental_order_id);
CREATE INDEX IF NOT EXISTS invoices_applies_to_idx ON invoices (company_id, applies_to_invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_uniq ON invoices (company_id, invoice_number);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_ro_period_reason_doc_uniq
  ON invoices (company_id, rental_order_id, period_start, period_end, billing_reason, document_type)
  WHERE rental_order_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_ro_service_period_reason_doc_uniq
  ON invoices (company_id, rental_order_id, service_period_start, service_period_end, billing_reason, document_type)
  WHERE rental_order_id IS NOT NULL AND service_period_start IS NOT NULL AND service_period_end IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_runs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  run_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_runs_company_month_uniq ON billing_runs (company_id, run_month);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  origin_key TEXT,
  line_item_id INTEGER REFERENCES rental_order_line_items(id) ON DELETE SET NULL,
  fee_id INTEGER REFERENCES rental_order_fees(id) ON DELETE SET NULL,
  coverage_start TIMESTAMPTZ,
  coverage_end TIMESTAMPTZ,
  billing_reason TEXT
);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_line_items_fee_idx ON invoice_line_items (fee_id);
CREATE INDEX IF NOT EXISTS invoice_line_items_line_idx ON invoice_line_items (line_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_origin_key_uniq
  ON invoice_line_items (invoice_id, origin_key);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  amount NUMERIC(12, 2) NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  reverses_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  is_deposit BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payments_customer_idx ON invoice_payments (customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_reverses_uniq ON invoice_payments (reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES invoice_payments(id) ON DELETE CASCADE,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_payment_allocations_invoice_idx ON invoice_payment_allocations (invoice_id);
CREATE INDEX IF NOT EXISTS invoice_payment_allocations_payment_idx ON invoice_payment_allocations (payment_id);

CREATE TABLE IF NOT EXISTS invoice_versions (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  pdf_bytes BYTEA NOT NULL,
  pdf_filename TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_versions_invoice_idx ON invoice_versions (invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_versions_invoice_version_uniq ON invoice_versions (invoice_id, version_number);

CREATE OR REPLACE FUNCTION enforce_invoice_line_items_draft()
RETURNS TRIGGER AS $$
DECLARE
  inv_status TEXT;
  inv_id INTEGER;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT status INTO inv_status FROM invoices WHERE id = inv_id;
  IF inv_status IS NULL THEN
    RAISE EXCEPTION 'Invoice not found for line item update.';
  END IF;
  IF inv_status <> 'draft' THEN
    RAISE EXCEPTION 'Invoice is locked for edits.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'invoice_line_items_draft_lock'
  ) THEN
    CREATE TRIGGER invoice_line_items_draft_lock
    BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
    FOR EACH ROW
    EXECUTE FUNCTION enforce_invoice_line_items_draft();
  END IF;
END $$;
