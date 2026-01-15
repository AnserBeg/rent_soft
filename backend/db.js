const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;
const PASSWORD_V2_PREFIX = "s2$";

function hashLegacySha256(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

function hashPasswordV2(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password || ""), salt, 32, { N: 16384, r: 8, p: 1 });
  return `${PASSWORD_V2_PREFIX}${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function verifyPasswordV2(password, stored) {
  const raw = String(stored || "");
  if (!raw.startsWith(PASSWORD_V2_PREFIX)) return false;
  const rest = raw.slice(PASSWORD_V2_PREFIX.length);
  const parts = rest.split("$");
  if (parts.length !== 2) return false;
  const [saltB64u, keyB64u] = parts;
  if (!saltB64u || !keyB64u) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(saltB64u, "base64url");
    expected = Buffer.from(keyB64u, "base64url");
  } catch {
    return false;
  }
  if (!salt.length || !expected.length) return false;
  const actual = crypto.scryptSync(String(password || ""), salt, expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

function verifyPassword(password, stored) {
  const raw = String(stored || "");
  if (raw.startsWith(PASSWORD_V2_PREFIX)) {
    return { ok: verifyPasswordV2(password, raw), needsUpgrade: false };
  }

  if (LEGACY_SHA256_RE.test(raw)) {
    // Compare binary digests so legacy hashes work regardless of hex casing.
    const expected = Buffer.from(hashLegacySha256(password), "hex");
    const actual = Buffer.from(raw, "hex");
    const ok = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
    return { ok, needsUpgrade: ok };
  }

  return { ok: false, needsUpgrade: false };
}

function hashPassword(password) {
  return hashPasswordV2(password);
}

const hashToken = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

function normalizeEmail(value) {
  const clean = String(value || "").trim().toLowerCase();
  return clean || null;
}

function normalizePostalCode(value) {
  const clean = String(value || "").trim();
  return clean || null;
}

function last4FromCardNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function normalizeRentalOrderStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  switch (raw) {
    case "draft":
      return "quote";
    case "quote":
      return "quote";
    case "quote_rejected":
    case "rejected":
    case "rejected_quote":
      return "quote_rejected";
    case "requested":
    case "request":
    case "booking_request":
      return "requested";
    case "request_rejected":
    case "requested_rejected":
    case "booking_request_rejected":
      return "request_rejected";
    case "reservation":
      return "reservation";
    case "ordered":
      return "ordered";
    case "recieved":
      return "received";
    case "received":
      return "received";
    case "closed":
      return "closed";
    default:
      return "quote";
  }
}

function isQuoteStatus(status) {
  const normalized = normalizeRentalOrderStatus(status);
  return normalized === "quote" || normalized === "quote_rejected";
}

function isDemandOnlyStatus(status) {
  const normalized = normalizeRentalOrderStatus(status);
  return normalized === "quote" || normalized === "quote_rejected" || normalized === "reservation" || normalized === "requested";
}

function allowsInventoryAssignment(status) {
  const normalized = normalizeRentalOrderStatus(status);
  return normalized !== "quote" && normalized !== "quote_rejected" && normalized !== "requested";
}

function formatDocNumber(prefix, year, seq, { yearDigits = 2, seqDigits = 4 } = {}) {
  const yearStr = yearDigits === 4 ? String(year).padStart(4, "0") : String(year).slice(-yearDigits).padStart(yearDigits, "0");
  const seqStr = String(seq).padStart(seqDigits, "0");
  return `${prefix}-${yearStr}-${seqStr}`;
}

async function nextDocumentNumber(client, companyId, prefix, effectiveDate = new Date(), options = {}) {
  const year = effectiveDate.getFullYear();
  const res = await client.query(
    `
    WITH upsert AS (
      INSERT INTO doc_sequences (company_id, doc_prefix, year, next_seq)
      VALUES ($1, $2, $3, 2)
      ON CONFLICT (company_id, doc_prefix, year)
      DO UPDATE SET next_seq = doc_sequences.next_seq + 1
      RETURNING next_seq
    )
    SELECT (next_seq - 1) AS seq FROM upsert
    `,
    [companyId, String(prefix).trim().toUpperCase(), year]
  );
  const seq = Number(res.rows?.[0]?.seq);
  if (!Number.isFinite(seq) || seq <= 0) throw new Error("Unable to generate document number.");
  return formatDocNumber(String(prefix).trim().toUpperCase(), year, seq, options);
}

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_email TEXT NOT NULL,
        phone TEXT,
        street_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        postal_code TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS street_address TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS region TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code TEXT;`);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT DEFAULT 'member',
        can_act_as_customer BOOLEAN NOT NULL DEFAULT FALSE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS can_act_as_customer BOOLEAN NOT NULL DEFAULT FALSE;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_user_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS company_user_sessions_user_id_idx ON company_user_sessions (user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS company_user_sessions_company_id_idx ON company_user_sessions (company_id);`);

    // Deduplicate before adding a unique index on (company_id, lower(email)).
    await client.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY company_id, LOWER(email)
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM users
      )
      DELETE FROM users
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_company_email_unique ON users (company_id, LOWER(email));`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        street_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        is_base_location BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      );
    `);
    // Ensure new address columns exist for older databases
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS street_address TEXT;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS city TEXT;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS region TEXT;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS country TEXT;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_base_location BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS geocode_provider TEXT;`);
    await client.query(`ALTER TABLE locations ADD COLUMN IF NOT EXISTS geocode_query TEXT;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      );
    `);
    await client.query(`
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
    `);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12, 2);`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_people (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        image_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      );
    `);
    await client.query(`ALTER TABLE sales_people ADD COLUMN IF NOT EXISTS email TEXT;`);
    await client.query(`ALTER TABLE sales_people ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await client.query(`ALTER TABLE sales_people ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        parent_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        company_name TEXT NOT NULL,
        contact_name TEXT,
        street_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        postal_code TEXT,
        email TEXT,
        phone TEXT,
        contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
        accounting_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
        can_charge_deposit BOOLEAN NOT NULL DEFAULT FALSE,
        payment_terms_days INTEGER,
        sales_person_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL,
        follow_up_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS parent_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_name TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS street_address TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS region TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS postal_code TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS accounting_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS can_charge_deposit BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_person_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS follow_up_date DATE;`);
    await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await client.query(`CREATE INDEX IF NOT EXISTS customers_parent_customer_id_idx ON customers (parent_customer_id);`);

    await client.query(`
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
    `);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_name TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS street_address TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS city TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS region TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS country TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS postal_code TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS email TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS phone TEXT;`);
    await client.query(`ALTER TABLE vendors ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await client.query(`CREATE INDEX IF NOT EXISTS vendors_company_id_idx ON vendors (company_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_documents (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime TEXT,
        size_bytes INTEGER,
        url TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_documents_customer_id_idx ON customer_documents (customer_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS storefront_customers (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        internal_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        business_name TEXT,
        can_act_as_company BOOLEAN NOT NULL DEFAULT FALSE,
        street_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        postal_code TEXT,
        email TEXT NOT NULL,
        phone TEXT,
        password_hash TEXT NOT NULL,
        cc_last4 TEXT,
        cc_hash TEXT,
        documents JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE storefront_customers ADD COLUMN IF NOT EXISTS can_act_as_company BOOLEAN NOT NULL DEFAULT FALSE;`);

    await client.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY company_id, LOWER(email)
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM storefront_customers
      )
      DELETE FROM storefront_customers
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS storefront_customers_company_email_unique ON storefront_customers (company_id, LOWER(email));`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS storefront_customer_sessions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES storefront_customers(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS storefront_customer_sessions_token_unique ON storefront_customer_sessions (token_hash);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        business_name TEXT,
        street_address TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        postal_code TEXT,
        email TEXT NOT NULL UNIQUE,
        phone TEXT,
        password_hash TEXT NOT NULL,
        cc_last4 TEXT,
        cc_hash TEXT,
        documents JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_account_sessions (
        id SERIAL PRIMARY KEY,
        customer_account_id INTEGER NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(`
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
    `);
    await client.query(`ALTER TABLE customer_pricing ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE customer_pricing ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE customer_pricing ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12, 2);`);
    await client.query(`
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
        current_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
        purchase_price NUMERIC(12, 2),
        type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await client.query(`ALTER TABLE equipment ADD COLUMN IF NOT EXISTS current_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_bundles (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        primary_equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
        daily_rate NUMERIC(12, 2),
        weekly_rate NUMERIC(12, 2),
        monthly_rate NUMERIC(12, 2),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      );
    `);
    await client.query(`ALTER TABLE equipment_bundles ADD COLUMN IF NOT EXISTS primary_equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE equipment_bundles ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_bundles ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_bundles ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_bundles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_bundle_items (
        bundle_id INTEGER NOT NULL REFERENCES equipment_bundles(id) ON DELETE CASCADE,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        PRIMARY KEY (bundle_id, equipment_id),
        UNIQUE (equipment_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        po_number TEXT,
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
    `);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_possession_date DATE;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS type_id INTEGER REFERENCES equipment_types(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS model_name TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS serial_number TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS condition TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS manufacturer TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS current_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`CREATE INDEX IF NOT EXISTS purchase_orders_company_id_idx ON purchase_orders (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx ON purchase_orders (company_id, status);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_po_number_uniq ON purchase_orders (company_id, po_number) WHERE po_number IS NOT NULL;`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS purchase_orders_company_expected_idx ON purchase_orders (company_id, expected_possession_date);`
    );

    // Repair: if a pre-existing location had an address and was accidentally marked non-base, restore it.
    // (Current-only locations created via picker typically have no address, and dropoff locations are prefixed.)
    await client.query(`
      UPDATE locations
         SET is_base_location = TRUE
       WHERE is_base_location = FALSE
         AND name NOT ILIKE 'Dropoff - %'
         AND (
           street_address IS NOT NULL
           OR city IS NOT NULL
           OR region IS NOT NULL
           OR country IS NOT NULL
         );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS equipment_current_location_history (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        from_location_id INTEGER,
        to_location_id INTEGER,
        from_label TEXT,
        to_label TEXT,
        from_latitude DOUBLE PRECISION,
        from_longitude DOUBLE PRECISION,
        to_latitude DOUBLE PRECISION,
        to_longitude DOUBLE PRECISION
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS equipment_current_location_history_company_id_idx ON equipment_current_location_history (company_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS equipment_current_location_history_equipment_id_idx ON equipment_current_location_history (equipment_id, changed_at DESC);`
    );

    // Backfill: seed an initial history row for equipment that already has a current location.
    // This does not reconstruct past changes; it only ensures the current state appears in history.
    await client.query(`
      INSERT INTO equipment_current_location_history
        (company_id, equipment_id, changed_at, from_location_id, to_location_id, from_label, to_label,
         from_latitude, from_longitude, to_latitude, to_longitude)
      SELECT
        e.company_id,
        e.id,
        NOW(),
        NULL,
        e.current_location_id,
        NULL,
        cl.name,
        NULL,
        NULL,
        cl.latitude,
        cl.longitude
      FROM equipment e
      LEFT JOIN locations cl
        ON cl.company_id = e.company_id
       AND cl.id = e.current_location_id
      WHERE e.current_location_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM equipment_current_location_history h
          WHERE h.company_id = e.company_id
            AND h.equipment_id = e.id
        );
    `);

    // Rental Orders (RO)
    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        quote_number TEXT,
        ro_number TEXT,
        external_contract_number TEXT,
        legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
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
    `);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS quote_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS ro_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS external_contract_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS customer_po TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS salesperson_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS fulfillment_method TEXT NOT NULL DEFAULT 'pickup';`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'quote';`);
    await client.query(`ALTER TABLE rental_orders ALTER COLUMN status SET DEFAULT 'quote';`);
    await client.query(`UPDATE rental_orders SET status = 'quote' WHERE status = 'draft';`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS terms TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS general_notes TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS pickup_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS dropoff_address TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_address TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS logistics_instructions TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS critical_areas TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS coverage_hours JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);

    await client.query(`
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
    `);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS rate_basis TEXT;`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS rate_amount NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS billable_units NUMERIC(12, 4);`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS line_amount NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE rental_order_line_items ADD COLUMN IF NOT EXISTS bundle_id INTEGER REFERENCES equipment_bundles(id) ON DELETE SET NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_line_items_order_id_idx ON rental_order_line_items (rental_order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_line_items_type_id_idx ON rental_order_line_items (type_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_line_items_bundle_id_idx ON rental_order_line_items (bundle_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_line_inventory (
        line_item_id INTEGER NOT NULL REFERENCES rental_order_line_items(id) ON DELETE CASCADE,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
        PRIMARY KEY (line_item_id, equipment_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_line_inventory_equipment_idx ON rental_order_line_inventory (equipment_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_line_conditions (
        line_item_id INTEGER PRIMARY KEY REFERENCES rental_order_line_items(id) ON DELETE CASCADE,
        before_notes TEXT,
        after_notes TEXT,
        before_images JSONB NOT NULL DEFAULT '[]'::jsonb,
        after_images JSONB NOT NULL DEFAULT '[]'::jsonb,
        pause_periods JSONB NOT NULL DEFAULT '[]'::jsonb,
        ai_report_markdown TEXT,
        ai_report_generated_at TIMESTAMPTZ
      );
    `);
    await client.query(`ALTER TABLE rental_order_line_conditions ADD COLUMN IF NOT EXISTS ai_report_markdown TEXT;`);
    await client.query(`ALTER TABLE rental_order_line_conditions ADD COLUMN IF NOT EXISTS ai_report_generated_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE rental_order_line_conditions ADD COLUMN IF NOT EXISTS pause_periods JSONB NOT NULL DEFAULT '[]'::jsonb;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_fees (
        id SERIAL PRIMARY KEY,
        rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_fees_order_id_idx ON rental_order_fees (rental_order_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_notes (
        id SERIAL PRIMARY KEY,
        rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
        user_name TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_notes_order_id_idx ON rental_order_notes (rental_order_id);`);

    await client.query(`
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
    `);
    await client.query(`ALTER TABLE rental_order_attachments ADD COLUMN IF NOT EXISTS category TEXT;`);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_attachments_order_id_idx ON rental_order_attachments (rental_order_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_audits (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
        actor_name TEXT,
        actor_email TEXT,
        action TEXT NOT NULL,
        summary TEXT,
        changes JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_audits_order_id_idx ON rental_order_audits (rental_order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS rental_order_audits_company_id_idx ON rental_order_audits (company_id);`);

    await client.query(`
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
        rental_info_fields JSONB NOT NULL DEFAULT '{"siteAddress":{"enabled":true,"required":false},"criticalAreas":{"enabled":true,"required":true},"generalNotes":{"enabled":true,"required":true},"emergencyContacts":{"enabled":true,"required":true},"siteContacts":{"enabled":true,"required":true},"coverageHours":{"enabled":true,"required":true}}'::jsonb,
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
    `);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_rounding_mode TEXT NOT NULL DEFAULT 'ceil';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_rounding_granularity TEXT NOT NULL DEFAULT 'unit';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS monthly_proration_method TEXT NOT NULL DEFAULT 'hours';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_timezone TEXT NOT NULL DEFAULT 'UTC';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_date_mode TEXT NOT NULL DEFAULT 'generation';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_payment_terms_days INTEGER NOT NULL DEFAULT 30;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_auto_run TEXT NOT NULL DEFAULT 'off';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_auto_mode TEXT NOT NULL DEFAULT 'auto';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_registration_number TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_inclusive_pricing BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_apply_customer_credit BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_work_order_on_return BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS required_storefront_customer_fields JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS rental_info_fields JSONB NOT NULL DEFAULT '{"siteAddress":{"enabled":true,"required":false},"criticalAreas":{"enabled":true,"required":true},"generalNotes":{"enabled":true,"required":true},"emergencyContacts":{"enabled":true,"required":true},"siteContacts":{"enabled":true,"required":true},"coverageHours":{"enabled":true,"required":true}}'::jsonb;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_provider TEXT NOT NULL DEFAULT 'custom';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_host TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_port INTEGER;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_secure BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_require_tls BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_user TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_smtp_pass TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_from_name TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_from_address TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_notify_request_submit BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_notify_status_updates BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS email_notify_invoices BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`UPDATE company_settings SET invoice_date_mode = 'generation' WHERE invoice_date_mode IS NULL;`);
    await client.query(`UPDATE company_settings SET billing_rounding_granularity = 'unit' WHERE billing_rounding_granularity IS NULL;`);
    await client.query(`UPDATE company_settings SET monthly_proration_method = 'hours' WHERE monthly_proration_method IS NULL;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS doc_sequences (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        doc_prefix TEXT NOT NULL,
        year INTEGER NOT NULL,
        next_seq INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (company_id, doc_prefix, year)
      );
    `);

    // Invoices / Accounts Receivable
      await client.query(`
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
    `);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date DATE;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS applies_to_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by TEXT;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_reason TEXT;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS general_notes TEXT;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_type TEXT NOT NULL DEFAULT 'invoice';`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_period_start TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS service_period_end TIMESTAMPTZ;`);
    await client.query(`UPDATE invoices SET invoice_date = issue_date WHERE invoice_date IS NULL;`);
    await client.query(`ALTER TABLE invoices ALTER COLUMN invoice_date SET DEFAULT CURRENT_DATE;`);
    await client.query(`ALTER TABLE invoices ALTER COLUMN invoice_date SET NOT NULL;`);
    await client.query(`UPDATE invoices SET service_period_start = period_start WHERE service_period_start IS NULL AND period_start IS NOT NULL;`);
    await client.query(`UPDATE invoices SET service_period_end = period_end WHERE service_period_end IS NULL AND period_end IS NOT NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices (company_id, customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoices_rental_order_idx ON invoices (company_id, rental_order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoices_applies_to_idx ON invoices (company_id, applies_to_invoice_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_number_uniq ON invoices (company_id, invoice_number);`
    );
    await client.query(
      `DROP INDEX IF EXISTS invoices_company_ro_period_uniq;`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_ro_period_reason_doc_uniq
       ON invoices (company_id, rental_order_id, period_start, period_end, billing_reason, document_type)
       WHERE rental_order_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL;`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoices_company_ro_service_period_reason_doc_uniq
       ON invoices (company_id, rental_order_id, service_period_start, service_period_end, billing_reason, document_type)
       WHERE rental_order_id IS NOT NULL AND service_period_start IS NOT NULL AND service_period_end IS NOT NULL;`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS billing_runs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        run_month DATE NOT NULL,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS billing_runs_company_month_uniq ON billing_runs (company_id, run_month);`
    );

    await client.query(`
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
        coverage_start TIMESTAMPTZ,
        coverage_end TIMESTAMPTZ,
        billing_reason TEXT
      );
    `);
    await client.query(
      `ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS fee_id INTEGER REFERENCES rental_order_fees(id) ON DELETE SET NULL;`
    );
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS line_item_id INTEGER REFERENCES rental_order_line_items(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS coverage_start TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS coverage_end TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS billing_reason TEXT;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS origin_key TEXT;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items (invoice_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoice_line_items_fee_idx ON invoice_line_items (fee_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS invoice_line_items_line_idx ON invoice_line_items (line_item_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_origin_key_uniq
       ON invoice_line_items (invoice_id, origin_key);`
    );
    await client.query(`
      UPDATE invoice_line_items ili
         SET fee_id = f.id
        FROM invoices i
        JOIN rental_order_fees f ON f.rental_order_id = i.rental_order_id
       WHERE ili.invoice_id = i.id
         AND ili.fee_id IS NULL
         AND ili.description = f.name
         AND ili.quantity = 1
         AND ili.unit_price = f.amount
         AND ili.amount = f.amount
    `);
    await client.query(`
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
    `);
    await client.query(`
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
    `);

      await client.query(`
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
      `);
      await client.query(
        `ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT;`
      );
        await client.query(`ALTER TABLE invoice_payments ALTER COLUMN invoice_id DROP NOT NULL;`);
        await client.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS reverses_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE SET NULL;`);
        await client.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS reversal_reason TEXT;`);
        await client.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS is_deposit BOOLEAN NOT NULL DEFAULT FALSE;`);
      await client.query(`
        UPDATE invoice_payments p
           SET customer_id = i.customer_id
          FROM invoices i
         WHERE p.invoice_id = i.id
           AND p.customer_id IS NULL;
      `);
      await client.query(`ALTER TABLE invoice_payments ALTER COLUMN customer_id SET NOT NULL;`);
      await client.query(`CREATE INDEX IF NOT EXISTS invoice_payments_invoice_idx ON invoice_payments (invoice_id);`);
      await client.query(`CREATE INDEX IF NOT EXISTS invoice_payments_customer_idx ON invoice_payments (customer_id);`);
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_reverses_uniq ON invoice_payments (reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;`
      );
      await client.query(`
        CREATE TABLE IF NOT EXISTS invoice_payment_allocations (
          id SERIAL PRIMARY KEY,
          payment_id INTEGER NOT NULL REFERENCES invoice_payments(id) ON DELETE CASCADE,
          invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
          amount NUMERIC(12, 2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      await client.query(
        `CREATE INDEX IF NOT EXISTS invoice_payment_allocations_invoice_idx ON invoice_payment_allocations (invoice_id);`
      );
      await client.query(
        `CREATE INDEX IF NOT EXISTS invoice_payment_allocations_payment_idx ON invoice_payment_allocations (payment_id);`
      );
      await client.query(`
          WITH totals AS (
            SELECT invoice_id,
                   COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                     + COALESCE(SUM(tax_amount), 0) AS total_amount
              FROM invoice_line_items
             GROUP BY invoice_id
          ),
        payment_rows AS (
          SELECT p.id AS payment_id,
                 p.invoice_id,
                 p.amount,
                 COALESCE(t.total_amount, 0) AS total_amount,
                 SUM(p.amount) OVER (
                   PARTITION BY p.invoice_id
                   ORDER BY p.paid_at ASC NULLS LAST, p.id ASC
                 ) AS running_paid
            FROM invoice_payments p
       LEFT JOIN totals t ON t.invoice_id = p.invoice_id
       LEFT JOIN invoice_payment_allocations a
              ON a.payment_id = p.id AND a.invoice_id = p.invoice_id
           WHERE p.invoice_id IS NOT NULL
             AND a.id IS NULL
        )
        INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
        SELECT payment_id,
               invoice_id,
               GREATEST(LEAST(amount, total_amount - (running_paid - amount)), 0) AS alloc_amount
          FROM payment_rows
         WHERE total_amount > 0
           AND GREATEST(LEAST(amount, total_amount - (running_paid - amount)), 0) > 0;
      `);
    await client.query(`
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
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS invoice_versions_invoice_idx ON invoice_versions (invoice_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS invoice_versions_invoice_version_uniq ON invoice_versions (invoice_id, version_number);`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS rental_orders_quote_number_uniq ON rental_orders (company_id, quote_number) WHERE quote_number IS NOT NULL;`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS rental_orders_ro_number_uniq ON rental_orders (company_id, ro_number) WHERE ro_number IS NOT NULL;`
    );
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS rental_orders_external_contract_uniq ON rental_orders (company_id, external_contract_number) WHERE external_contract_number IS NOT NULL;`
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function normalizeInvoiceStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  switch (raw) {
    case "draft":
    case "sent":
    case "paid":
    case "void":
      return raw;
    default:
      return "draft";
  }
}

function normalizeInvoiceDocumentType(value) {
  const raw = String(value || "").trim().toLowerCase();
  switch (raw) {
    case "credit_memo":
    case "credit":
      return "credit_memo";
    case "debit_memo":
    case "debit":
      return "debit_memo";
    default:
      return "invoice";
  }
}

function daysInMonthUTC(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addUtcMonths(date, months) {
  const base = date instanceof Date ? date : new Date(date);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const d = base.getUTCDate();
  const target = m + Number(months || 0);
  const ty = y + Math.floor(target / 12);
  const tm = ((target % 12) + 12) % 12;
  const dim = daysInMonthUTC(ty, tm);
  const nd = Math.min(d, dim);
  return new Date(
    Date.UTC(
      ty,
      tm,
      nd,
      base.getUTCHours(),
      base.getUTCMinutes(),
      base.getUTCSeconds(),
      base.getUTCMilliseconds()
    )
  );
}

function normalizeBillingTimeZone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw }).format(new Date());
    return raw;
  } catch {
    return "UTC";
  }
}

function getTimeZoneParts(date, timeZone) {
  const tz = normalizeBillingTimeZone(timeZone);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function formatDateInTimeZone(value, timeZone) {
  if (!value) return null;
  const iso = normalizeTimestamptz(value);
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = getTimeZoneParts(d, timeZone);
  if (!Number.isFinite(parts.year) || !Number.isFinite(parts.month) || !Number.isFinite(parts.day)) return null;
  const y = String(parts.year).padStart(4, "0");
  const m = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveInvoiceDate({ servicePeriodStart = null, timeZone = null, invoiceDateMode = null } = {}) {
  const mode = normalizeInvoiceDateMode(invoiceDateMode);
  if (mode === "period_start") {
    const fromPeriod = formatDateInTimeZone(servicePeriodStart, timeZone) || isoDate(servicePeriodStart);
    if (fromPeriod) return fromPeriod;
  }
  return formatDateInTimeZone(new Date(), timeZone) || isoDate(new Date());
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  if (!Number.isFinite(parts.year)) return 0;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timeZone) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset).toISOString();
}

function startOfMonthInTimeZone(value, timeZone) {
  const iso = normalizeTimestamptz(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getTimeZoneParts(date, timeZone);
  return zonedTimeToUtc({ year: parts.year, month: parts.month, day: 1 }, timeZone);
}

function endOfMonthInTimeZone(value, timeZone) {
  const iso = normalizeTimestamptz(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getTimeZoneParts(date, timeZone);
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  return zonedTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }, timeZone);
}

function splitIntoMonthlyPeriods({ startAt, endAt, timeZone }) {
  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) return [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const tz = normalizeBillingTimeZone(timeZone);
  const periods = [];
  let cursorIso = start.toISOString();
  let guard = 0;
  while (Date.parse(cursorIso) < Date.parse(endIso) && guard < 1200) {
    const cursorDate = new Date(cursorIso);
    const parts = getTimeZoneParts(cursorDate, tz);
    const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
    const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
    const nextBoundary = zonedTimeToUtc({ year: nextYear, month: nextMonth, day: 1 }, tz);
    if (!nextBoundary) break;
    const nextBoundaryMs = Date.parse(nextBoundary);
    const endMs = Date.parse(endIso);
    const periodEndIso = nextBoundaryMs < endMs ? nextBoundary : endIso;
    if (Date.parse(periodEndIso) <= Date.parse(cursorIso)) break;
    periods.push({ startAt: cursorIso, endAt: periodEndIso });
    cursorIso = periodEndIso;
    guard += 1;
  }
  return periods;
}

function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function formatPeriodLabel(startIso, endIso, timeZone) {
  const s = formatDateInTimeZone(startIso, timeZone) || isoDate(startIso);
  const e = formatDateInTimeZone(endIso, timeZone) || isoDate(endIso);
  if (!s || !e) return "";
  return `${s} to ${e}`;
}

function startOfMonthUtc(value) {
  const iso = normalizeTimestamptz(value);
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString();
}

function endOfMonthUtc(value) {
  const start = startOfMonthUtc(value);
  if (!start) return null;
  const date = new Date(start);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)).toISOString();
}

function monthRangeForDate(value, timeZone) {
  const tz = normalizeBillingTimeZone(timeZone);
  const startAt = tz === "UTC" ? startOfMonthUtc(value) : startOfMonthInTimeZone(value, tz);
  const endAt = tz === "UTC" ? endOfMonthUtc(value) : endOfMonthInTimeZone(value, tz);
  if (!startAt || !endAt) return null;
  return { startAt, endAt };
}

function previousMonthRangeForDate(value, timeZone) {
  const tz = normalizeBillingTimeZone(timeZone);
  const currentStart = tz === "UTC" ? startOfMonthUtc(value) : startOfMonthInTimeZone(value, tz);
  if (!currentStart) return null;
  const currentDate = new Date(currentStart);
  if (Number.isNaN(currentDate.getTime())) return null;
  let prevStart = null;
  if (tz === "UTC") {
    prevStart = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - 1, 1, 0, 0, 0, 0)).toISOString();
  } else {
    const parts = getTimeZoneParts(currentDate, tz);
    const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
    const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
    prevStart = zonedTimeToUtc({ year: prevYear, month: prevMonth, day: 1 }, tz);
  }
  return prevStart ? { startAt: prevStart, endAt: currentStart } : null;
}

function overlapRange({ startAt, endAt, rangeStart, rangeEnd }) {
  const s = normalizeTimestamptz(startAt);
  const e = normalizeTimestamptz(endAt);
  const rs = normalizeTimestamptz(rangeStart);
  const re = normalizeTimestamptz(rangeEnd);
  if (!s || !e || !rs || !re) return null;
  const startMs = Math.max(Date.parse(s), Date.parse(rs));
  const endMs = Math.min(Date.parse(e), Date.parse(re));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString() };
}

function toMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

function normalizeTaxRate(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function buildTaxConfig(settings) {
  const enabled = settings?.tax_enabled === true;
  const defaultRateRaw = normalizeTaxRate(settings?.default_tax_rate ?? 0);
  return {
    enabled,
    defaultRate: defaultRateRaw === null ? 0 : defaultRateRaw,
    inclusive: settings?.tax_inclusive_pricing === true,
  };
}

function computeLineItemTax({ amount, isTaxable, taxRate, taxConfig }) {
  const enabled = taxConfig?.enabled === true;
  const selectedTaxable = isTaxable !== false;
  const rateRaw = selectedTaxable ? normalizeTaxRate(taxRate) : 0;
  const fallbackRate = Number.isFinite(rateRaw) ? rateRaw : Number(taxConfig?.defaultRate || 0);
  const rate = selectedTaxable && Number.isFinite(fallbackRate) ? fallbackRate : 0;
  const inclusive = enabled && taxConfig?.inclusive === true;
  let taxAmount = 0;
  const amt = Number(amount);
  if (enabled && selectedTaxable && Number.isFinite(amt) && amt !== 0 && Number.isFinite(rate) && rate > 0) {
    if (inclusive) {
      const base = amt / (1 + rate);
      taxAmount = amt - base;
    } else {
      taxAmount = amt * rate;
    }
  }
  return {
    isTaxable: selectedTaxable,
    taxRate: Number.isFinite(rate) ? Number(rate.toFixed(5)) : 0,
    taxAmount: toMoney(taxAmount),
    taxInclusive: inclusive,
  };
}

function computeInvoiceTotalsFromLineItems(items) {
  const rows = Array.isArray(items) ? items : [];
  let subtotal = 0;
  let taxTotal = 0;
  rows.forEach((row) => {
    const amount = Number(row.amount ?? row?.amount ?? 0);
    const taxAmount = Number(row.tax_amount ?? row.taxAmount ?? 0);
    const taxInclusive = row.tax_inclusive ?? row.taxInclusive;
    if (!Number.isFinite(amount)) return;
    subtotal += amount - (taxInclusive ? (Number.isFinite(taxAmount) ? taxAmount : 0) : 0);
    taxTotal += Number.isFinite(taxAmount) ? taxAmount : 0;
  });
  const subtotalFixed = toMoney(subtotal);
  const taxFixed = toMoney(taxTotal);
  return {
    subtotal: subtotalFixed,
    taxTotal: taxFixed,
    total: toMoney(subtotalFixed + taxFixed),
  };
}

function deriveInvoiceArStatus({ status, balance, paid, customerCredit } = {}) {
  const normalized = normalizeInvoiceStatus(status);
  if (normalized === "void" || normalized === "draft") return normalized;
  const bal = Number(balance);
  const paidAmount = Number(paid);
  const creditAmount = Number(customerCredit);
  if (Number.isFinite(bal) && bal < 0) return "credit";
  if (Number.isFinite(creditAmount) && creditAmount > 0) return "credit";
  if (Number.isFinite(bal) && bal <= 0) return "paid";
  if (Number.isFinite(paidAmount) && paidAmount > 0 && Number.isFinite(bal) && bal > 0) return "partial";
  return "open";
}

async function listInvoices(companyId, { customerId = null, rentalOrderId = null, status = null } = {}) {
  const params = [companyId];
  const where = ["i.company_id = $1"];
  if (customerId) {
    params.push(Number(customerId));
    where.push(`i.customer_id = $${params.length}`);
  }
  if (rentalOrderId) {
    params.push(Number(rentalOrderId));
    where.push(`i.rental_order_id = $${params.length}`);
  }
  if (status) {
    params.push(normalizeInvoiceStatus(status));
    where.push(`i.status = $${params.length}`);
  }

  const res = await pool.query(
    `
      WITH totals AS (
        SELECT invoice_id,
               COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0) AS subtotal_amount,
               COALESCE(SUM(tax_amount), 0) AS tax_total,
               COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                 + COALESCE(SUM(tax_amount), 0) AS total_amount
          FROM invoice_line_items
         GROUP BY invoice_id
      ),
      paid AS (
        SELECT invoice_id, COALESCE(SUM(amount), 0) AS paid_amount
          FROM invoice_payment_allocations
         GROUP BY invoice_id
      ),
      customer_credit AS (
        SELECT credit_rows.customer_id,
               COALESCE(SUM(credit_rows.amount - credit_rows.allocated_amount), 0) AS credit
          FROM (
            SELECT p.id,
                   p.customer_id,
                   p.amount,
                   COALESCE(SUM(a.amount), 0) AS allocated_amount
              FROM invoice_payments p
              JOIN customers c ON c.id = p.customer_id
         LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
             WHERE c.company_id = $1
               AND p.is_deposit IS NOT TRUE
             GROUP BY p.id, p.customer_id, p.amount
          ) credit_rows
         GROUP BY credit_rows.customer_id
      )
      SELECT i.id,
             i.invoice_number,
             i.status,
             i.document_type,
             i.invoice_date,
             i.issue_date,
             i.due_date,
             i.service_period_start,
             i.service_period_end,
             i.period_start,
             i.period_end,
             i.billing_reason,
             i.general_notes,
             i.applies_to_invoice_id,
             i.rental_order_id,
             i.customer_id,
             c.company_name AS customer_name,
             ro.ro_number,
           ro.quote_number,
           ro.status AS rental_order_status,
             COALESCE(totals.subtotal_amount, 0) AS subtotal,
             COALESCE(totals.tax_total, 0) AS tax_total,
             COALESCE(totals.total_amount, 0) AS total,
             COALESCE(paid.paid_amount, 0) AS paid,
             COALESCE(totals.total_amount, 0) - COALESCE(paid.paid_amount, 0) AS balance,
             COALESCE(cc.credit, 0) AS customer_credit,
             i.email_sent_at,
             i.created_at,
             i.updated_at
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
 LEFT JOIN rental_orders ro ON ro.id = i.rental_order_id
 LEFT JOIN totals ON totals.invoice_id = i.id
 LEFT JOIN paid ON paid.invoice_id = i.id
 LEFT JOIN customer_credit cc ON cc.customer_id = i.customer_id
     WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(i.invoice_date, i.issue_date) DESC NULLS LAST, i.id DESC
     `,
    params
  );

  return res.rows.map((r) => {
    const invoiceDate = r.invoice_date || r.issue_date || null;
    const servicePeriodStart = r.service_period_start || r.period_start || null;
    const servicePeriodEnd = r.service_period_end || r.period_end || null;
    const paidAmount = Number(r.paid || 0);
    const balance = Number(r.balance || 0);
    const customerCredit = toMoney(Math.max(0, Number(r.customer_credit || 0)));
    return {
      id: Number(r.id),
      invoiceNumber: r.invoice_number,
      status: r.status,
      arStatus: deriveInvoiceArStatus({
        status: r.status,
        balance,
        paid: paidAmount,
        customerCredit,
      }),
      documentType: r.document_type || "invoice",
      invoiceDate,
      issueDate: invoiceDate,
      dueDate: r.due_date,
      servicePeriodStart,
      servicePeriodEnd,
      periodStart: servicePeriodStart,
      periodEnd: servicePeriodEnd,
      billingReason: r.billing_reason || null,
      generalNotes: r.general_notes || "",
      appliesToInvoiceId: r.applies_to_invoice_id === null ? null : Number(r.applies_to_invoice_id),
      rentalOrderId: r.rental_order_id === null ? null : Number(r.rental_order_id),
      rentalOrderNumber: r.ro_number || r.quote_number || null,
      rentalOrderStatus: r.rental_order_status || null,
      customerId: Number(r.customer_id),
      customerName: r.customer_name,
      subtotal: Number(r.subtotal || 0),
      taxTotal: Number(r.tax_total || 0),
      total: Number(r.total || 0),
      paid: paidAmount,
      balance,
      customerCredit,
      emailSentAt: r.email_sent_at || null,
      emailSent: Boolean(r.email_sent_at),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

async function getInvoice({ companyId, id }) {
  const headerRes = await pool.query(
    `
    SELECT i.*,
           c.company_name AS customer_name,
           c.contact_name AS customer_contact_name,
           c.street_address AS customer_street_address,
           c.city AS customer_city,
             c.region AS customer_region,
             c.country AS customer_country,
             c.postal_code AS customer_postal_code,
             c.email AS customer_email,
             c.phone AS customer_phone,
             c.accounting_contacts AS customer_accounting_contacts,
             CASE
               WHEN c.parent_customer_id IS NOT NULL THEN p.payment_terms_days
               ELSE c.payment_terms_days
             END AS customer_payment_terms_days,
           ai.invoice_number AS applies_to_invoice_number,
           ai.status AS applies_to_invoice_status,
           ro.ro_number AS rental_order_number,
           ro.quote_number AS quote_number
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
 LEFT JOIN customers p ON p.id = c.parent_customer_id
 LEFT JOIN invoices ai ON ai.id = i.applies_to_invoice_id
 LEFT JOIN rental_orders ro ON ro.id = i.rental_order_id
     WHERE i.company_id = $1 AND i.id = $2
     LIMIT 1
    `,
    [companyId, id]
  );
  const invoice = headerRes.rows[0];
  if (!invoice) return null;

    const itemsRes = await pool.query(
      `
      SELECT id,
             description,
             quantity,
             unit_price,
             amount,
             is_taxable,
             tax_rate,
             tax_amount,
             tax_inclusive,
             sort_order,
             fee_id,
             line_item_id,
             coverage_start,
             coverage_end,
             billing_reason
        FROM invoice_line_items
       WHERE invoice_id = $1
       ORDER BY sort_order ASC, id ASC
      `,
      [invoice.id]
    );

    const paymentsRes = await pool.query(
      `
        SELECT a.id AS allocation_id,
               a.amount AS allocated_amount,
               a.created_at AS allocation_created_at,
               p.id AS payment_id,
               p.amount AS payment_amount,
               p.paid_at,
               p.method,
               p.reference,
               p.note,
               p.reverses_payment_id,
               p.reversal_reason,
               p.is_deposit,
               rev.id AS reversed_payment_id,
               p.created_at
        FROM invoice_payment_allocations a
        JOIN invoice_payments p ON p.id = a.payment_id
   LEFT JOIN invoice_payments rev ON rev.reverses_payment_id = p.id
       WHERE a.invoice_id = $1
       ORDER BY p.paid_at ASC NULLS LAST, a.id ASC
      `,
      [invoice.id]
    );

    const totals = computeInvoiceTotalsFromLineItems(itemsRes.rows);
    const paid = paymentsRes.rows.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0);
    const paidAmount = toMoney(paid);
    const creditRes = await pool.query(
      `
      WITH payment_totals AS (
        SELECT p.id,
               p.amount,
               COALESCE(SUM(a.amount), 0) AS allocated_amount
          FROM invoice_payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
          JOIN customers c ON c.id = p.customer_id
         WHERE c.company_id = $1 AND c.id = $2
           AND p.is_deposit IS NOT TRUE
         GROUP BY p.id, p.amount
      )
      SELECT COALESCE(SUM(amount - allocated_amount), 0) AS credit
        FROM payment_totals
      `,
      [companyId, invoice.customer_id]
    );
    const customerCredit = toMoney(Math.max(0, Number(creditRes.rows[0]?.credit || 0)));
    const depositRes = await pool.query(
      `
      WITH payment_totals AS (
        SELECT p.id,
               p.amount,
               COALESCE(SUM(a.amount), 0) AS allocated_amount
          FROM invoice_payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
          JOIN customers c ON c.id = p.customer_id
         WHERE c.company_id = $1 AND c.id = $2
           AND p.is_deposit IS TRUE
         GROUP BY p.id, p.amount
      )
      SELECT COALESCE(SUM(amount - allocated_amount), 0) AS deposit
        FROM payment_totals
      `,
      [companyId, invoice.customer_id]
    );
    const customerDeposit = toMoney(Math.max(0, Number(depositRes.rows[0]?.deposit || 0)));
    const balance = toMoney(totals.total - paid);
    const hasReversal = paymentsRes.rows.some((row) => row.reverses_payment_id !== null && row.reverses_payment_id !== undefined);
    const hasRefund = paymentsRes.rows.some(
      (row) =>
        Number(row.payment_amount || 0) < 0 &&
        (row.reverses_payment_id === null || row.reverses_payment_id === undefined)
    );
    const arTags = [];
    if (hasReversal) arTags.push("reversed");
    if (hasRefund) arTags.push("refunded");
    const arStatus = deriveInvoiceArStatus({
      status: invoice.status,
      balance,
      paid: paidAmount,
      customerCredit,
    });

  const invoiceDate = invoice.invoice_date || invoice.issue_date || null;
  const servicePeriodStart = invoice.service_period_start || invoice.period_start || null;
  const servicePeriodEnd = invoice.service_period_end || invoice.period_end || null;

  return {
    invoice: {
      id: Number(invoice.id),
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      documentType: invoice.document_type || "invoice",
      arStatus,
      arTags,
      invoiceDate,
      issueDate: invoiceDate,
      dueDate: invoice.due_date,
      servicePeriodStart,
      servicePeriodEnd,
      periodStart: servicePeriodStart,
      periodEnd: servicePeriodEnd,
      billingReason: invoice.billing_reason || null,
      generalNotes: invoice.general_notes || "",
      appliesToInvoiceId: invoice.applies_to_invoice_id === null ? null : Number(invoice.applies_to_invoice_id),
      appliesToInvoiceNumber: invoice.applies_to_invoice_number || null,
      appliesToInvoiceStatus: invoice.applies_to_invoice_status || null,
      rentalOrderId: invoice.rental_order_id === null ? null : Number(invoice.rental_order_id),
      rentalOrderNumber: invoice.rental_order_number || invoice.quote_number || null,
      customerId: Number(invoice.customer_id),
      customerName: invoice.customer_name,
      customerContactName: invoice.customer_contact_name || null,
      customerStreetAddress: invoice.customer_street_address || null,
      customerCity: invoice.customer_city || null,
      customerRegion: invoice.customer_region || null,
      customerCountry: invoice.customer_country || null,
      customerPostalCode: invoice.customer_postal_code || null,
      customerEmail: invoice.customer_email || null,
      customerPhone: invoice.customer_phone || null,
      customerAccountingContacts: normalizeAccountingContacts({
        accountingContacts: invoice.customer_accounting_contacts,
      }),
      customerPaymentTermsDays:
        invoice.customer_payment_terms_days === null || invoice.customer_payment_terms_days === undefined
          ? null
          : Number(invoice.customer_payment_terms_days),
      notes: invoice.notes || "",
      voidReason: invoice.void_reason || null,
      voidedAt: invoice.voided_at || null,
      voidedBy: invoice.voided_by || null,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      paid: paidAmount,
      balance,
      customerCredit,
      customerDeposit,
      emailSentAt: invoice.email_sent_at || null,
      emailSent: Boolean(invoice.email_sent_at),
      createdAt: invoice.created_at,
      updatedAt: invoice.updated_at,
    },
    lineItems: itemsRes.rows.map((r) => ({
      id: Number(r.id),
      description: r.description,
      quantity: Number(r.quantity || 0),
      unitPrice: Number(r.unit_price || 0),
      amount: Number(r.amount || 0),
      isTaxable: r.is_taxable === true,
      taxRate: Number(r.tax_rate || 0),
      taxAmount: Number(r.tax_amount || 0),
      taxInclusive: r.tax_inclusive === true,
      sortOrder: Number(r.sort_order || 0),
      feeId: r.fee_id === null || r.fee_id === undefined ? null : Number(r.fee_id),
      lineItemId: r.line_item_id === null || r.line_item_id === undefined ? null : Number(r.line_item_id),
      coverageStart: r.coverage_start || null,
      coverageEnd: r.coverage_end || null,
      billingReason: r.billing_reason || null,
    })),
    payments: paymentsRes.rows.map((r) => {
      const paymentAmount = Number(r.payment_amount || 0);
      const isReversal = r.reverses_payment_id !== null && r.reverses_payment_id !== undefined ? true : paymentAmount < 0;
      const isReversed = r.reversed_payment_id !== null && r.reversed_payment_id !== undefined;
      return {
        id: Number(r.allocation_id),
        paymentId: Number(r.payment_id),
        paidAt: r.paid_at,
        amount: Number(r.allocated_amount || 0),
        paymentAmount,
        method: r.method || null,
        reference: r.reference || null,
        note: r.note || null,
        isDeposit: r.is_deposit === true,
        isReversal,
        isReversed,
        canReverse: !isReversal && !isReversed && paymentAmount > 0,
        reversalReason: r.reversal_reason || null,
        createdAt: r.created_at,
        appliedAt: r.allocation_created_at,
      };
    }),
  };
}

async function replaceInvoiceLineItems({ companyId, invoiceId, lineItems }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [companyId, invoiceId]
    );
    if (!invRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const settings = await getCompanySettingsForClient(client, companyId);
    const taxConfig = buildTaxConfig(settings);

    await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId]);

    const items = Array.isArray(lineItems) ? lineItems : [];
    let sort = 0;
    for (const raw of items) {
      const description = String(raw?.description || "").trim();
      if (!description) continue;
      const originKey = raw?.originKey ? String(raw.originKey).trim() : null;
      const quantity = raw?.quantity === null || raw?.quantity === undefined || raw?.quantity === "" ? 1 : Number(raw.quantity);
      const unitPrice = raw?.unitPrice === null || raw?.unitPrice === undefined || raw?.unitPrice === "" ? 0 : Number(raw.unitPrice);
      const providedAmount = raw?.amount === null || raw?.amount === undefined || raw?.amount === "" ? null : Number(raw.amount);
      const amount = Number.isFinite(providedAmount) ? providedAmount : toMoney((Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0));
      const taxInfo = computeLineItemTax({
        amount,
        isTaxable: raw?.isTaxable,
        taxRate: raw?.taxRate,
        taxConfig,
      });
      await client.query(
        `
          INSERT INTO invoice_line_items
            (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, origin_key)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          `,
        [
          invoiceId,
          description,
          Number.isFinite(quantity) ? quantity : 0,
          Number.isFinite(unitPrice) ? unitPrice : 0,
          toMoney(amount),
          taxInfo.isTaxable === true,
          taxInfo.taxRate,
          taxInfo.taxAmount,
          taxInfo.taxInclusive === true,
          sort++,
          originKey,
        ]
      );
    }

    await client.query(`UPDATE invoices SET updated_at = NOW() WHERE id = $1`, [invoiceId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return await getInvoice({ companyId, id: invoiceId });
}

async function addInvoicePayment({ companyId, invoiceId, amount, paidAt = null, method = null, reference = null, note = null }) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Payment amount must be a positive number.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id, customer_id FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [companyId, invoiceId]
    );
    const invoice = invRes.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const paidIso = paidAt ? normalizeTimestamptz(paidAt) : null;
    const paymentRes = await client.query(
      `
      INSERT INTO invoice_payments (invoice_id, customer_id, paid_at, amount, method, reference, note)
      VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5, $6, $7)
      RETURNING id
      `,
      [
        invoiceId,
        invoice.customer_id,
        paidIso,
        toMoney(n),
        method ? String(method).trim() : null,
        reference ? String(reference).trim() : null,
        note ? String(note).trim() : null,
      ]
    );
    const paymentId = paymentRes.rows[0]?.id;

      const totalsRes = await client.query(
        `
        SELECT COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                 + COALESCE(SUM(tax_amount), 0) AS total_amount
          FROM invoice_line_items
         WHERE invoice_id = $1
        `,
        [invoiceId]
      );
    const appliedRes = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS applied_amount
        FROM invoice_payment_allocations
       WHERE invoice_id = $1
      `,
      [invoiceId]
    );
    const totalAmount = Number(totalsRes.rows[0]?.total_amount || 0);
    const appliedAmount = Number(appliedRes.rows[0]?.applied_amount || 0);
    const currentBalance = toMoney(totalAmount - appliedAmount);
    const applyAmount = toMoney(Math.min(toMoney(n), Math.max(0, currentBalance)));
    if (paymentId && applyAmount > 0) {
      await client.query(
        `
        INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
        VALUES ($1, $2, $3)
        `,
        [paymentId, invoiceId, applyAmount]
      );
    }
    const nextBalance = toMoney(currentBalance - applyAmount);
    await client.query(
      `
      UPDATE invoices
         SET status = CASE
                        WHEN status = 'void' THEN status
                        WHEN $3 <= 0 THEN 'paid'
                        ELSE status
                      END,
             updated_at = NOW()
       WHERE id = $1 AND company_id = $2
      `,
      [invoiceId, companyId, nextBalance]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return await getInvoice({ companyId, id: invoiceId });
}

async function addCustomerPayment({ companyId, customerId, amount, paidAt = null, method = null, reference = null, note = null }) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Payment amount must be a positive number.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const custRes = await client.query(
      `SELECT id FROM customers WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [companyId, customerId]
    );
    if (!custRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const paidIso = paidAt ? normalizeTimestamptz(paidAt) : null;
    const paymentRes = await client.query(
      `
      INSERT INTO invoice_payments (invoice_id, customer_id, paid_at, amount, method, reference, note)
      VALUES (NULL, $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6)
      RETURNING id
      `,
      [
        customerId,
        paidIso,
        toMoney(n),
        method ? String(method).trim() : null,
        reference ? String(reference).trim() : null,
        note ? String(note).trim() : null,
      ]
    );
    await client.query("COMMIT");
    return { paymentId: paymentRes.rows[0]?.id || null };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function addCustomerDeposit({ companyId, customerId, amount, paidAt = null, method = null, reference = null, note = null }) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error("Deposit amount must be a positive number.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const custRes = await client.query(
      `SELECT id FROM customers WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [companyId, customerId]
    );
    if (!custRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const paidIso = paidAt ? normalizeTimestamptz(paidAt) : null;
    const paymentRes = await client.query(
      `
      INSERT INTO invoice_payments (invoice_id, customer_id, paid_at, amount, method, reference, note, is_deposit)
      VALUES (NULL, $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, TRUE)
      RETURNING id
      `,
      [
        customerId,
        paidIso,
        toMoney(n),
        method ? String(method).trim() : null,
        reference ? String(reference).trim() : null,
        note ? String(note).trim() : null,
      ]
    );
    await client.query("COMMIT");
    return { paymentId: paymentRes.rows[0]?.id || null };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getCustomerCreditBalance({ companyId, customerId }) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");
  const res = await pool.query(
    `
    WITH payment_totals AS (
      SELECT p.id,
             p.amount,
             COALESCE(SUM(a.amount), 0) AS allocated_amount
        FROM invoice_payments p
   LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
        JOIN customers c ON c.id = p.customer_id
       WHERE c.company_id = $1 AND c.id = $2
         AND p.is_deposit IS NOT TRUE
       GROUP BY p.id, p.amount
    )
    SELECT COALESCE(SUM(amount - allocated_amount), 0) AS credit
      FROM payment_totals
    `,
    [cid, custId]
  );
  return toMoney(Math.max(0, Number(res.rows[0]?.credit || 0)));
}

async function getCustomerDepositBalance({ companyId, customerId }) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");
  const res = await pool.query(
    `
    WITH payment_totals AS (
      SELECT p.id,
             p.amount,
             COALESCE(SUM(a.amount), 0) AS allocated_amount
        FROM invoice_payments p
   LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
        JOIN customers c ON c.id = p.customer_id
       WHERE c.company_id = $1 AND c.id = $2
         AND p.is_deposit IS TRUE
       GROUP BY p.id, p.amount
    )
    SELECT COALESCE(SUM(amount - allocated_amount), 0) AS deposit
      FROM payment_totals
    `,
    [cid, custId]
  );
  return toMoney(Math.max(0, Number(res.rows[0]?.deposit || 0)));
}

async function refundCustomerDeposit({
  companyId,
  customerId,
  amount,
  paidAt = null,
  method = null,
  reference = null,
  note = null,
} = {}) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  const n = Number(amount);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");
  if (!Number.isFinite(n) || n <= 0) throw new Error("Refund amount must be a positive number.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const custRes = await client.query(
      `SELECT id FROM customers WHERE company_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [cid, custId]
    );
    if (!custRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const balanceRes = await client.query(
      `
      WITH payments AS (
        SELECT id, amount
          FROM invoice_payments
         WHERE customer_id = $1
           AND is_deposit IS TRUE
         FOR UPDATE
      ),
      payment_totals AS (
        SELECT p.id,
               p.amount,
               COALESCE(SUM(a.amount), 0) AS allocated_amount
          FROM payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
         GROUP BY p.id, p.amount
      )
      SELECT COALESCE(SUM(amount - allocated_amount), 0) AS deposit
        FROM payment_totals
      `,
      [custId]
    );
    const available = toMoney(Math.max(0, Number(balanceRes.rows[0]?.deposit || 0)));
    if (n > available) {
      throw new Error("Refund exceeds available deposit balance.");
    }

    const paidIso = paidAt ? normalizeTimestamptz(paidAt) : null;
    const refundMethod = method ? String(method).trim() : "refund";
    const refundNote = note ? String(note).trim() : "Deposit refund";
    const refundRes = await client.query(
      `
      INSERT INTO invoice_payments (invoice_id, customer_id, paid_at, amount, method, reference, note, is_deposit)
      VALUES (NULL, $1, COALESCE($2::timestamptz, NOW()), $3, $4, $5, $6, TRUE)
      RETURNING id
      `,
      [custId, paidIso, toMoney(-n), refundMethod, reference ? String(reference).trim() : null, refundNote]
    );

    await client.query("COMMIT");
    const paymentId = refundRes.rows[0]?.id || null;
    return { paymentId, refundedAmount: toMoney(n), remainingDeposit: toMoney(available - n) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function applyCustomerCreditToInvoice({ companyId, invoiceId, amount = null }) {
  const cid = Number(companyId);
  const invId = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(invId) || invId <= 0) throw new Error("invoiceId is required.");
  const requested = amount === null || amount === undefined || amount === "" ? null : Number(amount);
  if (requested !== null && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error("Amount must be a positive number.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id, customer_id FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [cid, invId]
    );
    const invoice = invRes.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

      const totalsRes = await client.query(
        `
        SELECT COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                 + COALESCE(SUM(tax_amount), 0) AS total_amount
          FROM invoice_line_items
         WHERE invoice_id = $1
        `,
        [invId]
      );
    const appliedRes = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS applied_amount
        FROM invoice_payment_allocations
       WHERE invoice_id = $1
      `,
      [invId]
    );
    const totalAmount = Number(totalsRes.rows[0]?.total_amount || 0);
    const appliedAmount = Number(appliedRes.rows[0]?.applied_amount || 0);
    const balance = toMoney(totalAmount - appliedAmount);
    const target = requested === null ? balance : toMoney(Math.min(balance, requested));
    if (target <= 0) {
      await client.query("COMMIT");
      return { appliedAmount: 0 };
    }

      const creditsRes = await client.query(
        `
        SELECT p.id,
               p.paid_at,
               p.amount,
               COALESCE(SUM(a.amount), 0) AS allocated_amount
          FROM invoice_payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
         WHERE p.customer_id = $1
           AND p.is_deposit IS NOT TRUE
         GROUP BY p.id, p.paid_at, p.amount
        HAVING p.amount > COALESCE(SUM(a.amount), 0)
         ORDER BY p.paid_at ASC NULLS LAST, p.id ASC
        `,
        [invoice.customer_id]
      );

    let remaining = target;
    let appliedTotal = 0;
    for (const row of creditsRes.rows) {
      const available = toMoney(Number(row.amount || 0) - Number(row.allocated_amount || 0));
      if (available <= 0) continue;
      const applyNow = toMoney(Math.min(available, remaining));
      if (applyNow <= 0) continue;
      await client.query(
        `
        INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
        VALUES ($1, $2, $3)
        `,
        [row.id, invId, applyNow]
      );
      appliedTotal = toMoney(appliedTotal + applyNow);
      remaining = toMoney(remaining - applyNow);
      if (remaining <= 0) break;
    }

    const nextBalance = toMoney(balance - appliedTotal);
    await client.query(
      `
      UPDATE invoices
         SET status = CASE
                        WHEN status = 'void' THEN status
                        WHEN $3 <= 0 THEN 'paid'
                        ELSE status
                      END,
             updated_at = NOW()
       WHERE id = $1 AND company_id = $2
      `,
      [invId, cid, nextBalance]
    );
    await client.query("COMMIT");
    return { appliedAmount: appliedTotal };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function applyCustomerDepositToInvoice({ companyId, invoiceId, amount = null }) {
  const cid = Number(companyId);
  const invId = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(invId) || invId <= 0) throw new Error("invoiceId is required.");
  const requested = amount === null || amount === undefined || amount === "" ? null : Number(amount);
  if (requested !== null && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error("Amount must be a positive number.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id, customer_id FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [cid, invId]
    );
    const invoice = invRes.rows[0];
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const totalsRes = await client.query(
      `
      SELECT COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
               + COALESCE(SUM(tax_amount), 0) AS total_amount
        FROM invoice_line_items
       WHERE invoice_id = $1
      `,
      [invId]
    );
    const appliedRes = await client.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS applied_amount
        FROM invoice_payment_allocations
       WHERE invoice_id = $1
      `,
      [invId]
    );
    const totalAmount = Number(totalsRes.rows[0]?.total_amount || 0);
    const appliedAmount = Number(appliedRes.rows[0]?.applied_amount || 0);
    const balance = toMoney(totalAmount - appliedAmount);
    const target = requested === null ? balance : toMoney(Math.min(balance, requested));
    if (target <= 0) {
      await client.query("COMMIT");
      return { appliedAmount: 0 };
    }

    const depositsRes = await client.query(
      `
      SELECT p.id,
             p.paid_at,
             p.amount,
             COALESCE(SUM(a.amount), 0) AS allocated_amount
        FROM invoice_payments p
   LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
       WHERE p.customer_id = $1
         AND p.is_deposit IS TRUE
       GROUP BY p.id, p.paid_at, p.amount
      HAVING p.amount > COALESCE(SUM(a.amount), 0)
       ORDER BY p.paid_at ASC NULLS LAST, p.id ASC
      `,
      [invoice.customer_id]
    );

    let remaining = target;
    let appliedTotal = 0;
    for (const row of depositsRes.rows) {
      const available = toMoney(Number(row.amount || 0) - Number(row.allocated_amount || 0));
      if (available <= 0) continue;
      const applyNow = toMoney(Math.min(available, remaining));
      if (applyNow <= 0) continue;
      await client.query(
        `
        INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
        VALUES ($1, $2, $3)
        `,
        [row.id, invId, applyNow]
      );
      appliedTotal = toMoney(appliedTotal + applyNow);
      remaining = toMoney(remaining - applyNow);
      if (remaining <= 0) break;
    }

    const nextBalance = toMoney(balance - appliedTotal);
    await client.query(
      `
      UPDATE invoices
         SET status = CASE
                        WHEN status = 'void' THEN status
                        WHEN $3 <= 0 THEN 'paid'
                        ELSE status
                      END,
             updated_at = NOW()
       WHERE id = $1 AND company_id = $2
      `,
      [invId, cid, nextBalance]
    );

    await client.query("COMMIT");
    return { appliedAmount: appliedTotal };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function applyCustomerCreditToOldestInvoices({ companyId, customerId, excludeInvoiceId = null }) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  const excludeId = excludeInvoiceId === null || excludeInvoiceId === undefined || excludeInvoiceId === "" ? null : Number(excludeInvoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");
  if (excludeId !== null && (!Number.isFinite(excludeId) || excludeId <= 0)) throw new Error("excludeInvoiceId must be a valid id.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoicesRes = await client.query(
      `
        WITH totals AS (
          SELECT invoice_id,
                 COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                   + COALESCE(SUM(tax_amount), 0) AS total_amount
            FROM invoice_line_items
           GROUP BY invoice_id
        ),
      applied AS (
        SELECT invoice_id, COALESCE(SUM(amount), 0) AS applied_amount
          FROM invoice_payment_allocations
         GROUP BY invoice_id
      )
       SELECT i.id,
              i.status,
              COALESCE(i.invoice_date, i.issue_date) AS invoice_date,
              COALESCE(t.total_amount, 0) AS total_amount,
              COALESCE(a.applied_amount, 0) AS applied_amount
         FROM invoices i
   LEFT JOIN totals t ON t.invoice_id = i.id
   LEFT JOIN applied a ON a.invoice_id = i.id
       WHERE i.company_id = $1
         AND i.customer_id = $2
         AND i.status NOT IN ('void', 'draft')
         AND (COALESCE(t.total_amount, 0) - COALESCE(a.applied_amount, 0)) > 0
         AND ($3::integer IS NULL OR i.id <> $3)
       ORDER BY COALESCE(i.invoice_date, i.issue_date) ASC NULLS LAST, i.id ASC
      `,
      [cid, custId, excludeId]
    );

      const creditsRes = await client.query(
        `
        SELECT p.id,
               p.paid_at,
               p.amount,
               COALESCE(SUM(a.amount), 0) AS allocated_amount
          FROM invoice_payments p
     LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
         WHERE p.customer_id = $1
           AND p.is_deposit IS NOT TRUE
         GROUP BY p.id, p.paid_at, p.amount
        HAVING p.amount > COALESCE(SUM(a.amount), 0)
         ORDER BY p.paid_at ASC NULLS LAST, p.id ASC
        `,
        [custId]
      );

    const credits = creditsRes.rows.map((row) => ({
      id: row.id,
      available: toMoney(Number(row.amount || 0) - Number(row.allocated_amount || 0)),
    }));

    let appliedTotal = 0;
    for (const inv of invoicesRes.rows) {
      let balance = toMoney(Number(inv.total_amount || 0) - Number(inv.applied_amount || 0));
      if (balance <= 0) continue;
      for (const credit of credits) {
        if (credit.available <= 0) continue;
        const applyNow = toMoney(Math.min(balance, credit.available));
        if (applyNow <= 0) continue;
        await client.query(
          `
          INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
          VALUES ($1, $2, $3)
          `,
          [credit.id, inv.id, applyNow]
        );
        credit.available = toMoney(credit.available - applyNow);
        balance = toMoney(balance - applyNow);
        appliedTotal = toMoney(appliedTotal + applyNow);
        if (balance <= 0) break;
      }
      await client.query(
        `
        UPDATE invoices
           SET status = CASE
                          WHEN status = 'void' THEN status
                          WHEN $3 <= 0 THEN 'paid'
                          ELSE status
                        END,
               updated_at = NOW()
         WHERE id = $1 AND company_id = $2
        `,
        [inv.id, cid, balance]
      );
    }

    await client.query("COMMIT");
    return { appliedAmount: appliedTotal };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listCustomerCreditActivity({ companyId, customerId, limit = 25 } = {}) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 25));
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");

  const res = await pool.query(
    `
    SELECT *
      FROM (
        SELECT CASE
                 WHEN p.is_deposit IS TRUE AND (p.reverses_payment_id IS NOT NULL OR p.amount < 0) THEN 'deposit_refund'
                 WHEN p.is_deposit IS TRUE THEN 'deposit'
                 WHEN p.reverses_payment_id IS NOT NULL OR p.amount < 0 THEN 'reversal'
                 ELSE 'payment'
               END AS entry_type,
               p.id AS entry_id,
               p.paid_at AS occurred_at,
               p.amount AS amount,
               p.method AS method,
               p.reference AS reference,
               p.reversal_reason AS reversal_reason,
               NULL::integer AS invoice_id,
               NULL::text AS invoice_number
          FROM invoice_payments p
          JOIN customers c ON c.id = p.customer_id
         WHERE c.company_id = $1
           AND p.customer_id = $2
        UNION ALL
        SELECT CASE
                 WHEN p.is_deposit IS TRUE AND a.amount < 0 THEN 'deposit_allocation_reversal'
                 WHEN p.is_deposit IS TRUE THEN 'deposit_allocation'
                 WHEN a.amount < 0 THEN 'allocation_reversal'
                 ELSE 'allocation'
               END AS entry_type,
               a.id AS entry_id,
               a.created_at AS occurred_at,
               -a.amount AS amount,
               p.method AS method,
               p.reference AS reference,
               NULL::text AS reversal_reason,
               i.id AS invoice_id,
               i.invoice_number AS invoice_number
          FROM invoice_payment_allocations a
          JOIN invoice_payments p ON p.id = a.payment_id
          JOIN invoices i ON i.id = a.invoice_id
         WHERE i.company_id = $1
           AND p.customer_id = $2
      ) AS entries
     ORDER BY occurred_at DESC NULLS LAST, entry_id DESC
     LIMIT $3
    `,
    [cid, custId, lim]
  );

  return res.rows.map((row) => ({
    type: row.entry_type,
    id: Number(row.entry_id),
    occurredAt: row.occurred_at || null,
    amount: Number(row.amount || 0),
    method: row.method || null,
    reference: row.reference || null,
    reversalReason: row.reversal_reason || null,
    invoiceId: row.invoice_id === null || row.invoice_id === undefined ? null : Number(row.invoice_id),
    invoiceNumber: row.invoice_number || null,
  }));
}

async function reverseInvoicePayment({ companyId, paymentId, reason = null, reversedAt = null }) {
  const cid = Number(companyId);
  const pid = Number(paymentId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(pid) || pid <= 0) throw new Error("paymentId is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentRes = await client.query(
      `
      SELECT p.id,
             p.invoice_id,
             p.customer_id,
             p.amount,
             p.paid_at,
             p.method,
             p.reference,
             p.note,
             p.reverses_payment_id
        FROM invoice_payments p
        JOIN customers c ON c.id = p.customer_id
       WHERE p.id = $1 AND c.company_id = $2
       LIMIT 1
       FOR UPDATE
      `,
      [pid, cid]
    );
    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return null;
    }
    const amount = Number(payment.amount || 0);
    if (payment.reverses_payment_id) throw new Error("Payment is already a reversal.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Only positive payments can be reversed.");

    const reversedRes = await client.query(
      `SELECT id FROM invoice_payments WHERE reverses_payment_id = $1 LIMIT 1`,
      [pid]
    );
    if (reversedRes.rows[0]) throw new Error("Payment has already been reversed.");

    const paidIso = reversedAt ? normalizeTimestamptz(reversedAt) : null;
    const reversalNote = reason ? `Reversal: ${String(reason).trim()}` : `Reversal of payment #${pid}`;
    const reversalRes = await client.query(
      `
      INSERT INTO invoice_payments (invoice_id, customer_id, paid_at, amount, method, reference, note, reverses_payment_id, reversal_reason)
      VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        payment.invoice_id,
        payment.customer_id,
        paidIso,
        toMoney(-amount),
        payment.method || null,
        payment.reference || null,
        reversalNote,
        pid,
        reason ? String(reason).trim() : null,
      ]
    );
    const reversalId = reversalRes.rows[0]?.id;

    const allocationsRes = await client.query(
      `
      SELECT invoice_id, COALESCE(SUM(amount), 0) AS allocated_amount
        FROM invoice_payment_allocations
       WHERE payment_id = $1
       GROUP BY invoice_id
      `,
      [pid]
    );

    const affectedInvoices = [];
    for (const row of allocationsRes.rows) {
      const invoiceId = Number(row.invoice_id);
      const allocated = Number(row.allocated_amount || 0);
      if (!Number.isFinite(invoiceId) || invoiceId <= 0 || allocated === 0) continue;
      await client.query(
        `
        INSERT INTO invoice_payment_allocations (payment_id, invoice_id, amount)
        VALUES ($1, $2, $3)
        `,
        [reversalId, invoiceId, toMoney(-allocated)]
      );
      affectedInvoices.push(invoiceId);
    }

    for (const invoiceId of affectedInvoices) {
      const balanceRes = await client.query(
        `
          WITH totals AS (
            SELECT COALESCE(SUM(amount - CASE WHEN tax_inclusive THEN tax_amount ELSE 0 END), 0)
                     + COALESCE(SUM(tax_amount), 0) AS total_amount
              FROM invoice_line_items
             WHERE invoice_id = $1
          ),
        applied AS (
          SELECT COALESCE(SUM(amount), 0) AS applied_amount
            FROM invoice_payment_allocations
           WHERE invoice_id = $1
        )
        SELECT COALESCE(t.total_amount, 0) - COALESCE(a.applied_amount, 0) AS balance
          FROM totals t
     LEFT JOIN applied a ON TRUE
        `,
        [invoiceId]
      );
      const balance = toMoney(Number(balanceRes.rows[0]?.balance || 0));
      await client.query(
        `
        UPDATE invoices
           SET status = CASE
                          WHEN status = 'void' THEN status
                          WHEN $3 <= 0 THEN 'paid'
                          WHEN status = 'paid' AND $3 > 0 THEN 'sent'
                          ELSE status
                        END,
               updated_at = NOW()
         WHERE id = $1 AND company_id = $2
        `,
        [invoiceId, cid, balance]
      );
    }

    await client.query("COMMIT");
    return { reversalPaymentId: reversalId || null, affectedInvoices };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function markInvoiceEmailSent({ companyId, invoiceId, sentAt = null } = {}) {
  const cid = Number(companyId);
  const id = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(id) || id <= 0) throw new Error("invoiceId is required.");

  const sentIso = sentAt ? normalizeTimestamptz(sentAt) : null;
  const res = await pool.query(
    `
    UPDATE invoices
       SET email_sent_at = COALESCE($1, NOW()),
           status = CASE
                      WHEN status IN ('paid', 'void') THEN status
                      ELSE 'sent'
                    END,
           updated_at = NOW()
     WHERE company_id = $2 AND id = $3
     RETURNING email_sent_at
    `,
    [sentIso, cid, id]
  );
  return res.rows?.[0]?.email_sent_at || null;
}

async function createInvoiceVersion({ companyId, invoiceId, snapshot, pdfBuffer, pdfFilename, sentAt = null } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");
  if (!Buffer.isBuffer(pdfBuffer) || !pdfBuffer.length) throw new Error("pdfBuffer is required.");

  const safeFilename = String(pdfFilename || "").trim() || `invoice-${iid}.pdf`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [cid, iid]
    );
    if (!invRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const versionRes = await client.query(
      `SELECT COALESCE(MAX(version_number), 0) AS max_version FROM invoice_versions WHERE invoice_id = $1`,
      [iid]
    );
    const nextVersion = Number(versionRes.rows?.[0]?.max_version || 0) + 1;
    const sentIso = sentAt ? normalizeTimestamptz(sentAt) : null;

    const insertRes = await client.query(
      `
      INSERT INTO invoice_versions (invoice_id, version_number, snapshot, pdf_bytes, pdf_filename, sent_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6)
      RETURNING id, version_number, pdf_filename, sent_at, created_at
      `,
      [iid, nextVersion, JSON.stringify(snapshot || {}), pdfBuffer, safeFilename, sentIso]
    );
    await client.query("COMMIT");
    const row = insertRes.rows?.[0] || null;
    if (!row) return null;
    return {
      id: Number(row.id),
      versionNumber: Number(row.version_number),
      pdfFilename: row.pdf_filename || null,
      sentAt: row.sent_at || null,
      createdAt: row.created_at || null,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function markInvoiceVersionSent({ companyId, invoiceId, versionId, sentAt = null } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  const vid = Number(versionId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");
  if (!Number.isFinite(vid) || vid <= 0) throw new Error("versionId is required.");

  const sentIso = sentAt ? normalizeTimestamptz(sentAt) : null;
  const res = await pool.query(
    `
    UPDATE invoice_versions v
       SET sent_at = COALESCE($1, NOW())
      FROM invoices i
     WHERE v.id = $2
       AND v.invoice_id = i.id
       AND i.company_id = $3
       AND i.id = $4
     RETURNING v.sent_at
    `,
    [sentIso, vid, cid, iid]
  );
  return res.rows?.[0]?.sent_at || null;
}

async function getLatestSentInvoiceVersion({ companyId, invoiceId } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");

  const res = await pool.query(
    `
    SELECT v.id,
           v.version_number,
           v.snapshot,
           v.pdf_bytes,
           v.pdf_filename,
           v.sent_at,
           v.created_at
      FROM invoice_versions v
      JOIN invoices i ON i.id = v.invoice_id
     WHERE i.company_id = $1
       AND i.id = $2
       AND v.sent_at IS NOT NULL
     ORDER BY v.sent_at DESC NULLS LAST, v.version_number DESC, v.id DESC
     LIMIT 1
    `,
    [cid, iid]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    versionNumber: Number(row.version_number),
    snapshot: row.snapshot || null,
    pdfBytes: row.pdf_bytes || null,
    pdfFilename: row.pdf_filename || null,
    sentAt: row.sent_at || null,
    createdAt: row.created_at || null,
  };
}

async function getLatestInvoiceVersion({ companyId, invoiceId } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");

  const res = await pool.query(
    `
    SELECT v.id,
           v.version_number,
           v.snapshot,
           v.pdf_bytes,
           v.pdf_filename,
           v.sent_at,
           v.created_at
      FROM invoice_versions v
      JOIN invoices i ON i.id = v.invoice_id
     WHERE i.company_id = $1
       AND i.id = $2
     ORDER BY v.created_at DESC NULLS LAST, v.version_number DESC, v.id DESC
     LIMIT 1
    `,
    [cid, iid]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    versionNumber: Number(row.version_number),
    snapshot: row.snapshot || null,
    pdfBytes: row.pdf_bytes || null,
    pdfFilename: row.pdf_filename || null,
    sentAt: row.sent_at || null,
    createdAt: row.created_at || null,
  };
}

async function deleteInvoice({ companyId, id }) {
  const cid = Number(companyId);
  const iid = Number(id);
  if (!Number.isFinite(cid) || !Number.isFinite(iid)) throw new Error("companyId and id are required.");

  const res = await pool.query(
    `DELETE FROM invoices WHERE company_id = $1 AND id = $2 RETURNING id`,
    [cid, iid]
  );
  return !!res.rows?.[0]?.id;
}

async function voidInvoice({ companyId, invoiceId, reason = null, voidedBy = null, voidedAt = null } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT id, status FROM invoices WHERE company_id = $1 AND id = $2 LIMIT 1 FOR UPDATE`,
      [cid, iid]
    );
    const invoice = invRes.rows?.[0] || null;
    if (!invoice) {
      await client.query("ROLLBACK");
      return null;
    }

    const status = String(invoice.status || "").trim().toLowerCase();
    if (status === "void") {
      await client.query("COMMIT");
      return { id: iid, status: "void", alreadyVoid: true };
    }

    const allocRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS allocated_amount FROM invoice_payment_allocations WHERE invoice_id = $1`,
      [iid]
    );
    const allocated = Number(allocRes.rows?.[0]?.allocated_amount || 0);
    if (Math.abs(allocated) > 0.005) {
      const err = new Error("Invoice has payments applied. Reverse or remove payments before voiding.");
      err.code = "PAYMENTS_EXIST";
      throw err;
    }

    const voidReason = reason ? String(reason).trim() : null;
    const voidBy = voidedBy ? String(voidedBy).trim() : null;
    const voidIso = voidedAt ? normalizeTimestamptz(voidedAt) : null;
    const res = await client.query(
      `
      UPDATE invoices
         SET status = 'void',
             void_reason = $3,
             voided_at = COALESCE($4::timestamptz, NOW()),
             voided_by = $5,
             updated_at = NOW()
       WHERE company_id = $1 AND id = $2
       RETURNING id
      `,
      [cid, iid, voidReason, voidIso, voidBy]
    );
    await client.query("COMMIT");
    return res.rows?.[0]?.id ? { id: Number(res.rows[0].id), status: "void" } : null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getCompanySettingsForClient(client, companyId) {
  const res = await client.query(
    `SELECT company_id,
            billing_rounding_mode,
            billing_rounding_granularity,
            monthly_proration_method,
            billing_timezone,
            invoice_date_mode,
            default_payment_terms_days,
            logo_url,
            invoice_auto_run,
            invoice_auto_mode,
            tax_enabled,
            default_tax_rate,
            tax_registration_number,
            tax_inclusive_pricing,
              auto_apply_customer_credit,
              auto_work_order_on_return,
              rental_info_fields
     FROM company_settings
     WHERE company_id = $1
     LIMIT 1`,
    [companyId]
  );
  if (res.rows[0]) {
    return {
      company_id: Number(res.rows[0].company_id),
      billing_rounding_mode: normalizeBillingRoundingMode(res.rows[0].billing_rounding_mode),
      billing_rounding_granularity: normalizeBillingRoundingGranularity(res.rows[0].billing_rounding_granularity),
      monthly_proration_method: normalizeMonthlyProrationMethod(res.rows[0].monthly_proration_method),
      billing_timezone: normalizeBillingTimeZone(res.rows[0].billing_timezone),
      invoice_date_mode: normalizeInvoiceDateMode(res.rows[0].invoice_date_mode),
      default_payment_terms_days: res.rows[0].default_payment_terms_days === null || res.rows[0].default_payment_terms_days === undefined ? 30 : Number(res.rows[0].default_payment_terms_days),
      logo_url: res.rows[0].logo_url || null,
      invoice_auto_run: normalizeInvoiceAutoRun(res.rows[0].invoice_auto_run),
      invoice_auto_mode: normalizeInvoiceGenerationMode(res.rows[0].invoice_auto_mode),
      tax_enabled: res.rows[0].tax_enabled === true,
      default_tax_rate: Number(res.rows[0].default_tax_rate || 0),
      tax_registration_number: res.rows[0].tax_registration_number || null,
      tax_inclusive_pricing: res.rows[0].tax_inclusive_pricing === true,
        auto_apply_customer_credit: res.rows[0].auto_apply_customer_credit === true,
        auto_work_order_on_return: res.rows[0].auto_work_order_on_return === true,
        rental_info_fields: normalizeRentalInfoFields(res.rows[0].rental_info_fields),
    };
  }
  return {
    company_id: Number(companyId),
    billing_rounding_mode: "ceil",
    billing_rounding_granularity: "unit",
    monthly_proration_method: "hours",
    billing_timezone: "UTC",
    invoice_date_mode: "generation",
    default_payment_terms_days: 30,
    logo_url: null,
    invoice_auto_run: "off",
    invoice_auto_mode: "auto",
    tax_enabled: false,
    default_tax_rate: 0,
    tax_registration_number: null,
    tax_inclusive_pricing: false,
      auto_apply_customer_credit: true,
      auto_work_order_on_return: false,
      rental_info_fields: normalizeRentalInfoFields(null),
  };
}

async function generateInvoicesForRentalOrder({ companyId, orderId, mode = "auto" }) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  if (!Number.isFinite(cid) || !Number.isFinite(oid)) throw new Error("companyId and orderId are required.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const headerRes = await client.query(
      `SELECT id, customer_id, status FROM rental_orders WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [cid, oid]
    );
    const header = headerRes.rows[0];
    if (!header) {
      await client.query("ROLLBACK");
      return null;
    }

    const lineRes = await client.query(
      `
      SELECT li.id,
             li.type_id,
             et.name AS type_name,
             li.start_at,
             li.end_at,
             li.fulfilled_at,
             li.returned_at,
             li.rate_basis,
             li.rate_amount,
             cond.pause_periods,
             (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
        FROM rental_order_line_items li
        JOIN equipment_types et ON et.id = li.type_id
   LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
       WHERE li.rental_order_id = $1
       ORDER BY li.id ASC
      `,
      [oid]
    );
    const lines = lineRes.rows;
    if (!lines.length) {
      await client.query("ROLLBACK");
      throw new Error("Rental order has no line items to invoice.");
    }

    const nowIso = normalizeTimestamptz(new Date().toISOString());
    if (!nowIso) {
      await client.query("ROLLBACK");
      throw new Error("Unable to determine current time.");
    }
    const nowMs = Date.parse(nowIso);

    const normalizedLines = lines
      .map((li) => {
        const lineStart = normalizeTimestamptz(li.fulfilled_at || li.start_at);
        const bookedEnd = normalizeTimestamptz(li.end_at);
        const actualEnd = normalizeTimestamptz(li.returned_at);
        if (!lineStart || (!bookedEnd && !actualEnd)) return null;
        const endSource = actualEnd || bookedEnd;
        let lineEnd = endSource;
        if (!actualEnd && bookedEnd && Date.parse(bookedEnd) < nowMs) {
          lineEnd = nowIso;
        }
        if (!lineEnd || Date.parse(lineEnd) <= Date.parse(lineStart)) return null;
        return {
          ...li,
          lineStart,
          lineEnd,
          pausePeriods: normalizePausePeriods(li.pause_periods),
        };
      })
      .filter(Boolean);

    const contractStart = normalizedLines.reduce((min, r) => (!min || r.lineStart < min ? r.lineStart : min), null);
    const contractEnd = normalizedLines.reduce((max, r) => (!max || r.lineEnd > max ? r.lineEnd : max), null);
    if (!contractStart || !contractEnd) {
      await client.query("ROLLBACK");
      throw new Error("Rental order is missing billable dates.");
    }

    const orderStatus = normalizeRentalOrderStatus(header.status);
    const orderIsClosed = orderStatus === "closed" || orderStatus === "received";

    const contractStartIso = normalizeTimestamptz(contractStart);
    const contractEndIso = normalizeTimestamptz(contractEnd);

    const effectiveEndIso =
      orderIsClosed && contractEndIso && Date.parse(contractEndIso) > Date.parse(nowIso) ? nowIso : contractEndIso;

    const durationMs = Date.parse(effectiveEndIso) - Date.parse(contractStartIso);
    const longContract = Number.isFinite(durationMs) ? durationMs >= 28 * 24 * 60 * 60 * 1000 : false;
    const normalizedMode = String(mode || "auto").trim().toLowerCase();
    const shouldMonthly = normalizedMode === "monthly" || (normalizedMode === "auto" && longContract);

    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";

    // Only generate invoices for periods that are actually due.
    // Monthly billing: allow current period (service period start <= now) for advance billing.
    // Single invoice: generate only once the contract has ended (contract_end <= now).
    const periods = shouldMonthly
      ? splitIntoMonthlyPeriods({ startAt: contractStartIso, endAt: effectiveEndIso, timeZone: billingTimeZone }).filter(
          (p) => p?.startAt && p?.endAt && Date.parse(p.startAt) <= Date.parse(nowIso)
        )
      : (contractStartIso &&
          effectiveEndIso &&
          Date.parse(effectiveEndIso) > Date.parse(contractStartIso) &&
          Date.parse(effectiveEndIso) <= Date.parse(nowIso))
        ? [{ startAt: contractStartIso, endAt: effectiveEndIso }]
        : [];

    const feeRes = await client.query(
      `SELECT id, name, amount FROM rental_order_fees WHERE rental_order_id = $1 ORDER BY id ASC`,
      [oid]
    );
    const fees = feeRes.rows || [];

    const customerRes = await client.query(
      `
      SELECT CASE
               WHEN c.parent_customer_id IS NOT NULL THEN p.payment_terms_days
               ELSE c.payment_terms_days
             END AS payment_terms_days
        FROM customers c
        LEFT JOIN customers p ON p.id = c.parent_customer_id
       WHERE c.company_id = $1 AND c.id = $2
       LIMIT 1
      `,
      [cid, header.customer_id]
    );
    const customerTerms = customerRes.rows?.[0]?.payment_terms_days === null || customerRes.rows?.[0]?.payment_terms_days === undefined
      ? null
      : Number(customerRes.rows[0].payment_terms_days);
    const termsDays = normalizePaymentTermsDays(customerTerms) || settings.default_payment_terms_days || 30;
    const created = [];

    const invoicedFeeRes = await client.query(
      `
      SELECT DISTINCT ili.fee_id
        FROM invoice_line_items ili
        JOIN invoices i ON i.id = ili.invoice_id
       WHERE i.company_id = $1
         AND i.rental_order_id = $2
         AND ili.fee_id IS NOT NULL
      `,
      [cid, oid]
    );
    const invoicedFeeIds = new Set(
      invoicedFeeRes.rows
        .map((r) => (r.fee_id === null || r.fee_id === undefined ? null : Number(r.fee_id)))
        .filter((id) => Number.isFinite(id))
    );

    const invoiceReason = shouldMonthly ? "monthly" : "contract_final";
    for (let idx = 0; idx < periods.length; idx++) {
      const period = periods[idx];
      if (!period?.startAt || !period?.endAt) continue;

      const existingRes = await client.query(
        `
        SELECT id, invoice_number
          FROM invoices
         WHERE company_id = $1
           AND rental_order_id = $2
           AND (
             (service_period_start = $3::timestamptz AND service_period_end = $4::timestamptz)
             OR (service_period_start IS NULL AND period_start = $3::timestamptz AND period_end = $4::timestamptz)
           )
           AND document_type = 'invoice'
         LIMIT 1
         `,
        [cid, oid, period.startAt, period.endAt]
      );
      if (existingRes.rows[0]) continue;

      const invoiceDate = resolveInvoiceDate({
        servicePeriodStart: period.startAt,
        timeZone: billingTimeZone,
        invoiceDateMode: settings.invoice_date_mode,
      });
      const invoiceDateObj = invoiceDate ? new Date(`${invoiceDate}T00:00:00Z`) : new Date();
      const dueDateObj = new Date(invoiceDateObj.getTime() + Number(termsDays) * 24 * 60 * 60 * 1000);
      const invoiceNumber = await nextDocumentNumber(client, cid, "INV", invoiceDateObj);

      const invoiceRes = await client.query(
        `
        INSERT INTO invoices (company_id, invoice_number, customer_id, rental_order_id, status, invoice_date, issue_date, due_date, service_period_start, service_period_end, period_start, period_end, billing_reason, general_notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,'draft',$5::date,$6::date,$7::date,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11::timestamptz,$12,$13,NOW(),NOW())
        RETURNING id, invoice_number
        `,
        [
          cid,
          invoiceNumber,
          header.customer_id,
          oid,
          invoiceDate,
          invoiceDate,
          isoDate(dueDateObj),
          period.startAt,
          period.endAt,
          period.startAt,
          period.endAt,
          invoiceReason,
          generalNotesForBillingReason(invoiceReason),
        ]
      );
      const invoiceId = Number(invoiceRes.rows[0].id);

      let sortOrder = 0;
      for (const li of normalizedLines) {
        const liStart = li.lineStart;
        const liEnd = li.lineEnd;
        if (!liStart || !liEnd) continue;
        const overlapStart = Date.parse(liStart) > Date.parse(period.startAt) ? liStart : period.startAt;
        const overlapEnd = Date.parse(liEnd) < Date.parse(period.endAt) ? liEnd : period.endAt;
        if (!overlapStart || !overlapEnd) continue;
        if (Date.parse(overlapEnd) <= Date.parse(overlapStart)) continue;

        const qty = Number(li.qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const rateAmount = li.rate_amount === null || li.rate_amount === undefined ? null : Number(li.rate_amount);
        const rateBasis = normalizeRateBasis(li.rate_basis);
        if (rateAmount === null || !Number.isFinite(rateAmount) || !rateBasis) continue;

        const pauseInfo = collectPauseOverlap({
          pausePeriods: li.pausePeriods,
          startAt: overlapStart,
          endAt: overlapEnd,
        });
        const billableUnits = computeBillableUnits({
          startAt: overlapStart,
          endAt: overlapEnd,
          rateBasis,
          roundingMode: settings.billing_rounding_mode,
          roundingGranularity: settings.billing_rounding_granularity,
          monthlyProrationMethod: settings.monthly_proration_method,
          pausePeriods: pauseInfo.segments,
        });
        if (billableUnits === null || !Number.isFinite(billableUnits) || billableUnits <= 0) continue;

        const quantity = qty * billableUnits;
        const amount = toMoney(quantity * rateAmount);
        let desc = `${li.type_name} (${qty} units) - ${formatPeriodLabel(overlapStart, overlapEnd, billingTimeZone)}`;
        if (pauseInfo.totalMs > 0) {
          const pauseRanges = pauseInfo.segments
            .map((seg) => formatPeriodLabel(seg.startAt, seg.endAt, billingTimeZone))
            .filter(Boolean)
            .join("; ");
          const pauseDuration = formatDurationDays(pauseInfo.totalMs);
          if (pauseRanges) {
            desc += ` (Paused ${pauseDuration}: ${pauseRanges})`;
          } else {
            desc += ` (Paused ${pauseDuration})`;
          }
        }
        const taxInfo = computeLineItemTax({ amount, isTaxable: true, taxRate: null, taxConfig });
        const originKey = buildLineOriginKey({
          lineItemId: li.id,
          coverageStart: overlapStart,
          coverageEnd: overlapEnd,
          billingReason: invoiceReason,
          isCredit: false,
        });
        await client.query(
          `
          INSERT INTO invoice_line_items
            (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, line_item_id, coverage_start, coverage_end, billing_reason, origin_key)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          ON CONFLICT (invoice_id, origin_key) DO NOTHING
          `,
          [
            invoiceId,
            desc,
            quantity,
            toMoney(rateAmount),
            amount,
            taxInfo.isTaxable === true,
            taxInfo.taxRate,
            taxInfo.taxAmount,
            taxInfo.taxInclusive === true,
            sortOrder++,
            li.id,
            overlapStart,
            overlapEnd,
            invoiceReason,
            originKey,
          ]
        );
      }

      // Apply each order-level fee once; new fees added later should appear on the next invoice.
      if (fees.length) {
        for (const fee of fees) {
          const feeId = Number(fee.id);
          if (!Number.isFinite(feeId) || invoicedFeeIds.has(feeId)) continue;
          const name = String(fee.name || "").trim();
          if (!name) continue;
          const amount = toMoney(fee.amount);
          if (!amount) continue;
          const taxInfo = computeLineItemTax({ amount, isTaxable: true, taxRate: null, taxConfig });
          const originKey = buildFeeOriginKey({ feeId, billingReason: "fee" });
          await client.query(
            `
            INSERT INTO invoice_line_items
              (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, fee_id, billing_reason, origin_key)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            ON CONFLICT (invoice_id, origin_key) DO NOTHING
            `,
            [
              invoiceId,
              name,
              1,
              amount,
              amount,
              taxInfo.isTaxable === true,
              taxInfo.taxRate,
              taxInfo.taxAmount,
              taxInfo.taxInclusive === true,
              sortOrder++,
              feeId,
              "fee",
              originKey,
            ]
          );
          invoicedFeeIds.add(feeId);
        }
      }

      created.push({ id: invoiceId, invoiceNumber });
    }

    await client.query("COMMIT");
    return { orderId: oid, created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getAccountsReceivableSummary(companyId) {
  const res = await pool.query(
    `
    WITH invoice_totals AS (
      SELECT i.id AS invoice_id,
             i.customer_id,
             COALESCE(SUM(li.amount - CASE WHEN li.tax_inclusive THEN li.tax_amount ELSE 0 END), 0) AS subtotal_amount,
             COALESCE(SUM(li.tax_amount), 0) AS tax_total,
             COALESCE(SUM(li.amount - CASE WHEN li.tax_inclusive THEN li.tax_amount ELSE 0 END), 0)
               + COALESCE(SUM(li.tax_amount), 0) AS total_amount
        FROM invoices i
   LEFT JOIN invoice_line_items li ON li.invoice_id = i.id
       WHERE i.company_id = $1
       GROUP BY i.id, i.customer_id
    ),
      invoice_paid AS (
        SELECT invoice_id,
               COALESCE(SUM(amount), 0) AS paid_amount
          FROM invoice_payment_allocations
         GROUP BY invoice_id
      ),
        customer_credit AS (
          SELECT totals.customer_id,
                 COALESCE(SUM(totals.amount - totals.allocated_amount), 0) AS credit
            FROM (
              SELECT p.id,
                     p.customer_id,
                     p.amount,
                     COALESCE(SUM(a.amount), 0) AS allocated_amount
                FROM invoice_payments p
                JOIN customers c ON c.id = p.customer_id
           LEFT JOIN invoice_payment_allocations a ON a.payment_id = p.id
               WHERE c.company_id = $1
                 AND p.is_deposit IS NOT TRUE
               GROUP BY p.id, p.customer_id, p.amount
            ) totals
           GROUP BY totals.customer_id
        ),
      customers_with_activity AS (
        SELECT customer_id FROM invoice_totals
        UNION
        SELECT customer_id FROM customer_credit
      )
      SELECT c.id AS customer_id,
             c.company_name AS customer_name,
             COALESCE(SUM(t.total_amount), 0) AS total_invoiced,
             COALESCE(SUM(COALESCE(p.paid_amount, 0)), 0) AS total_paid,
             COALESCE(SUM(t.total_amount), 0) - COALESCE(SUM(COALESCE(p.paid_amount, 0)), 0) AS balance,
             COALESCE(MAX(cc.credit), 0) AS credit
        FROM customers_with_activity ca
        JOIN customers c ON c.id = ca.customer_id
   LEFT JOIN invoice_totals t ON t.customer_id = ca.customer_id
   LEFT JOIN invoice_paid p ON p.invoice_id = t.invoice_id
   LEFT JOIN customer_credit cc ON cc.customer_id = ca.customer_id
       WHERE c.company_id = $1
       GROUP BY c.id, c.company_name
       ORDER BY balance DESC, c.company_name ASC
    `,
    [companyId]
  );

  return res.rows.map((r) => ({
    customerId: Number(r.customer_id),
      customerName: r.customer_name,
      totalInvoiced: Number(r.total_invoiced || 0),
      totalPaid: Number(r.total_paid || 0),
      balance: Number(r.balance || 0),
      credit: Number(r.credit || 0),
    }));
  }

async function createCompanyWithUser({ companyName, contactEmail, ownerName, ownerEmail, password }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cleanContactEmail = normalizeEmail(contactEmail);
    const cleanOwnerEmail = normalizeEmail(ownerEmail);
    const cleanCompanyName = String(companyName || "").trim();
    const cleanOwnerName = String(ownerName || "").trim();
    if (!cleanCompanyName) throw new Error("companyName is required.");
    if (!cleanContactEmail) throw new Error("contactEmail is required.");
    if (!cleanOwnerName) throw new Error("ownerName is required.");
    if (!cleanOwnerEmail) throw new Error("ownerEmail is required.");
    if (!password) throw new Error("password is required.");

    const companyResult = await client.query(
      `INSERT INTO companies (name, contact_email) VALUES ($1, $2) RETURNING id, name`,
      [cleanCompanyName, cleanContactEmail]
    );
    const company = companyResult.rows[0];
    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, role, password_hash, can_act_as_customer)
       VALUES ($1, $2, $3, 'owner', $4, TRUE) RETURNING id, name, email, role`,
      [company.id, cleanOwnerName, cleanOwnerEmail, hashPassword(password)]
    );
    const locationResult = await client.query(
      `INSERT INTO locations (company_id, name) VALUES ($1, $2) RETURNING id, name`,
      [company.id, "Main"]
    );
    await client.query("COMMIT");
    return {
      company,
      owner: userResult.rows[0],
      defaultLocation: locationResult.rows[0],
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createUser({ companyId, name, email, role = "member", password }) {
    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(email);
    const cleanRole = String(role || "member").trim() || "member";
    if (!companyId) throw new Error("companyId is required.");
    if (!cleanName) throw new Error("name is required.");
    if (!cleanEmail) throw new Error("email is required.");
    if (!password) throw new Error("password is required.");
  
    const existing = await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [cleanEmail]);
    if (existing.rows?.[0]?.id) throw new Error("An account already exists with that email.");
  
    const result = await pool.query(
      `INSERT INTO users (company_id, name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role`,
      [companyId, cleanName, cleanEmail, cleanRole, hashPassword(password)]
  );
  return result.rows[0];
}

async function listUsers(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  const res = await pool.query(
    `SELECT id, name, email, role, can_act_as_customer, created_at FROM users WHERE company_id = $1 ORDER BY created_at ASC`,
    [cid]
  );
  return res.rows || [];
}

async function getUser({ companyId, userId } = {}) {
  const cid = Number(companyId);
  const uid = Number(userId);
  if (!Number.isFinite(cid) || cid <= 0) return null;
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const res = await pool.query(
    `SELECT id, company_id, name, email, role, can_act_as_customer, created_at FROM users WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [uid, cid]
  );
  return res.rows?.[0] || null;
}

async function updateUserRoleModes({ companyId, userId, canActAsCustomer } = {}) {
  const cid = Number(companyId);
  const uid = Number(userId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("userId is required.");
  if (typeof canActAsCustomer !== "boolean") throw new Error("canActAsCustomer must be boolean.");
  const res = await pool.query(
    `
    UPDATE users
       SET can_act_as_customer = $1
     WHERE id = $2 AND company_id = $3
     RETURNING id, company_id, name, email, role, can_act_as_customer, created_at
    `,
    [canActAsCustomer, uid, cid]
  );
  return res.rows?.[0] || null;
}

async function authenticateUser({ email, password }) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const res = await pool.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.can_act_as_customer,
      u.company_id,
      u.password_hash,
      c.name AS company_name,
      c.contact_email,
      c.phone,
      c.street_address,
      c.city,
      c.region,
      c.country,
      c.postal_code
    FROM users u
    JOIN companies c ON c.id = u.company_id
    WHERE LOWER(u.email) = $1
    ORDER BY u.created_at ASC
    LIMIT 1
    `,
    [cleanEmail]
  );

  const row = res.rows?.[0];
  if (!row) return null;
  const check = verifyPassword(cleanPassword, row.password_hash);
  if (!check.ok) return null;
  if (check.needsUpgrade) {
    pool
      .query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hashPassword(cleanPassword), row.id])
      .catch(() => {});
  }

  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      canActAsCustomer: row.can_act_as_customer === true,
      companyId: row.company_id,
    },
    company: {
      id: row.company_id,
      name: row.company_name,
      email: row.contact_email,
      phone: row.phone,
      streetAddress: row.street_address,
      city: row.city,
      region: row.region,
      country: row.country,
      postalCode: row.postal_code,
    },
  };
}

async function createCompanyUserSession({ userId, companyId, ttlDays = 30 } = {}) {
  const uid = Number(userId);
  const cid = Number(companyId);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error("userId is required.");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const token = `cu_${crypto.randomUUID()}`;
  const tokenHash = hashToken(token);
  const days = Math.max(1, Math.min(180, Number(ttlDays) || 30));
  const res = await pool.query(
    `
    INSERT INTO company_user_sessions (user_id, company_id, token_hash, expires_at)
    VALUES ($1, $2, $3, NOW() + ($4::text || ' days')::interval)
    RETURNING id, expires_at
    `,
    [uid, cid, tokenHash, days]
  );
  return { token, expiresAt: res.rows?.[0]?.expires_at || null, sessionId: Number(res.rows?.[0]?.id) };
}

async function getCompanyUserByToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.id AS user_id,
      u.name AS user_name,
      u.email AS user_email,
      u.role AS user_role,
      u.can_act_as_customer,
      c.id AS company_id,
      c.name AS company_name,
      c.contact_email,
      c.phone,
      c.street_address,
      c.city,
      c.region,
      c.country,
      c.postal_code
    FROM company_user_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN companies c ON c.id = s.company_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    sessionId: Number(row.session_id),
    expiresAt: row.expires_at || null,
    user: {
      id: Number(row.user_id),
      name: row.user_name,
      email: row.user_email,
      role: row.user_role,
      canActAsCustomer: row.can_act_as_customer === true,
      companyId: Number(row.company_id),
    },
    company: {
      id: Number(row.company_id),
      name: row.company_name,
      email: row.contact_email,
      phone: row.phone,
      streetAddress: row.street_address,
      city: row.city,
      region: row.region,
      country: row.country,
      postalCode: row.postal_code,
    },
  };
}

async function revokeCompanyUserSession(token) {
  const raw = String(token || "").trim();
  if (!raw) return 0;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `UPDATE company_user_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return Number(res.rowCount || 0);
}

async function getCompanyProfile(companyId) {
  const result = await pool.query(
    `
    SELECT id, name, contact_email, phone, street_address, city, region, country, postal_code
      FROM companies
     WHERE id = $1
     LIMIT 1
    `,
    [companyId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.contact_email,
    phone: row.phone,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
  };
}

async function updateCompanyProfile({
  companyId,
  name,
  email,
  phone,
  streetAddress,
  city,
  region,
  country,
  postalCode,
}) {
  const result = await pool.query(
    `
    UPDATE companies
       SET name = $2,
           contact_email = $3,
           phone = $4,
           street_address = $5,
           city = $6,
           region = $7,
           country = $8,
           postal_code = $9,
           updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, contact_email, phone, street_address, city, region, country, postal_code
    `,
    [
      companyId,
      String(name || "").trim() || "Company",
      String(email || "").trim() || "unknown@example.com",
      String(phone || "").trim() || null,
      String(streetAddress || "").trim() || null,
      String(city || "").trim() || null,
      String(region || "").trim() || null,
      String(country || "").trim() || null,
      String(postalCode || "").trim() || null,
    ]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.contact_email,
    phone: row.phone,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
  };
}

async function listLocations(companyId, { scope } = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase();
  const includeAll = normalizedScope === "all";
  const result = await pool.query(
    `SELECT id, name, street_address, city, region, country, latitude, longitude, is_base_location
     FROM locations
     WHERE company_id = $1
       AND ($2::boolean OR is_base_location = TRUE)
     ORDER BY name`,
    [companyId, includeAll]
  );
  return result.rows;
}

async function getLocation({ companyId, id }) {
  const result = await pool.query(
    `SELECT id, name, street_address, city, region, country, latitude, longitude, is_base_location
       FROM locations
      WHERE company_id = $1 AND id = $2
      LIMIT 1`,
    [companyId, id]
  );
  return result.rows[0] || null;
}

async function createLocation({ companyId, name, streetAddress, city, region, country, isBaseLocation = true }) {
  const baseFlag = isBaseLocation !== false;
  const result = await pool.query(
    `INSERT INTO locations (company_id, name, street_address, city, region, country, is_base_location)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (company_id, name)
     DO UPDATE SET
       name = EXCLUDED.name,
       street_address = COALESCE(EXCLUDED.street_address, locations.street_address),
       city = COALESCE(EXCLUDED.city, locations.city),
       region = COALESCE(EXCLUDED.region, locations.region),
       country = COALESCE(EXCLUDED.country, locations.country),
       is_base_location = (locations.is_base_location OR EXCLUDED.is_base_location)
     RETURNING id, name, street_address, city, region, country, latitude, longitude, is_base_location`,
    [companyId, name, streetAddress || null, city || null, region || null, country || null, baseFlag]
  );
  return result.rows[0];
}

async function updateLocation({ companyId, id, name, streetAddress, city, region, country, isBaseLocation }) {
  const baseFlag = isBaseLocation === undefined ? null : isBaseLocation !== false;
  const result = await pool.query(
    `UPDATE locations
        SET name = $3,
            street_address = $4,
            city = $5,
            region = $6,
            country = $7,
            is_base_location = COALESCE($8::boolean, is_base_location)
      WHERE company_id = $1 AND id = $2
      RETURNING id, name, street_address, city, region, country, latitude, longitude, is_base_location`,
    [companyId, id, name, streetAddress || null, city || null, region || null, country || null, baseFlag]
  );
  return result.rows[0] || null;
}

async function setLocationGeocode({ companyId, id, latitude, longitude, provider, query }) {
  const result = await pool.query(
    `UPDATE locations
        SET latitude = $3,
            longitude = $4,
            geocoded_at = NOW(),
            geocode_provider = $5,
            geocode_query = $6
      WHERE company_id = $1 AND id = $2
      RETURNING id, name, street_address, city, region, country, latitude, longitude, is_base_location`,
    [companyId, id, latitude ?? null, longitude ?? null, provider || null, query || null]
  );
  return result.rows[0] || null;
}

async function deleteLocation({ companyId, id }) {
  const result = await pool.query(`DELETE FROM locations WHERE company_id = $1 AND id = $2`, [companyId, id]);
  return result.rowCount || 0;
}

async function getEquipmentLocationIds({ companyId, equipmentId }) {
  const res = await pool.query(
    `SELECT id, location_id, current_location_id
     FROM equipment
     WHERE company_id = $1 AND id = $2
     LIMIT 1`,
    [companyId, equipmentId]
  );
  const row = res.rows?.[0] || null;
  if (!row?.id) return null;
  return {
    id: Number(row.id),
    location_id: row.location_id === null ? null : Number(row.location_id),
    current_location_id: row.current_location_id === null ? null : Number(row.current_location_id),
  };
}

async function listEquipmentCurrentLocationIdsForIds({ companyId, equipmentIds }) {
  const ids = Array.isArray(equipmentIds) ? equipmentIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (!ids.length) return [];
  const res = await pool.query(
    `SELECT id, current_location_id
     FROM equipment
     WHERE company_id = $1 AND id = ANY($2::int[])`,
    [companyId, ids]
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    current_location_id: r.current_location_id === null ? null : Number(r.current_location_id),
  }));
}

async function getLocationSnapshot({ companyId, id }) {
  const locId = Number(id);
  if (!Number.isFinite(locId)) return null;
  const res = await pool.query(
    `SELECT id, name, latitude, longitude, is_base_location
     FROM locations
     WHERE company_id = $1 AND id = $2
     LIMIT 1`,
    [companyId, locId]
  );
  const row = res.rows?.[0] || null;
  if (!row?.id) return null;
  return {
    id: Number(row.id),
    name: row.name || null,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    is_base_location: row.is_base_location === true,
  };
}

async function recordEquipmentCurrentLocationChange({ companyId, equipmentId, fromLocationId, toLocationId }) {
  const cid = Number(companyId);
  const eid = Number(equipmentId);
  if (!Number.isFinite(cid) || !Number.isFinite(eid)) return null;

  const from = fromLocationId ? await getLocationSnapshot({ companyId: cid, id: fromLocationId }) : null;
  const to = toLocationId ? await getLocationSnapshot({ companyId: cid, id: toLocationId }) : null;

  const res = await pool.query(
    `INSERT INTO equipment_current_location_history
      (company_id, equipment_id, from_location_id, to_location_id, from_label, to_label,
       from_latitude, from_longitude, to_latitude, to_longitude)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, changed_at`,
    [
      cid,
      eid,
      from ? from.id : null,
      to ? to.id : null,
      from ? from.name : null,
      to ? to.name : null,
      from ? from.latitude : null,
      from ? from.longitude : null,
      to ? to.latitude : null,
      to ? to.longitude : null,
    ]
  );
  return res.rows?.[0] || null;
}

async function cleanupNonBaseLocationIfUnused({ companyId, locationId }) {
  const cid = Number(companyId);
  const locId = Number(locationId);
  if (!Number.isFinite(cid) || !Number.isFinite(locId)) return { deleted: false };

  const loc = await getLocationSnapshot({ companyId: cid, id: locId });
  if (!loc) return { deleted: false };
  if (loc.is_base_location) return { deleted: false };

  const usage = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM equipment
     WHERE company_id = $1
       AND (location_id = $2 OR current_location_id = $2)`,
    [cid, locId]
  );
  const n = Number(usage.rows?.[0]?.n || 0);
  if (n > 0) return { deleted: false };

  const del = await pool.query(`DELETE FROM locations WHERE company_id = $1 AND id = $2 AND is_base_location = FALSE`, [cid, locId]);
  return { deleted: (del.rowCount || 0) > 0 };
}

async function listEquipmentCurrentLocationHistory({ companyId, equipmentId, limit = 50 }) {
  const cid = Number(companyId);
  const eid = Number(equipmentId);
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  if (!Number.isFinite(cid) || !Number.isFinite(eid)) return [];

  const res = await pool.query(
    `SELECT id, changed_at, from_location_id, to_location_id,
            from_label, to_label, from_latitude, from_longitude, to_latitude, to_longitude
     FROM equipment_current_location_history
     WHERE company_id = $1 AND equipment_id = $2
     ORDER BY changed_at DESC, id DESC
     LIMIT $3`,
    [cid, eid, lim]
  );
  return res.rows;
}

async function listCategories(companyId) {
  const result = await pool.query(
    `SELECT id, name FROM equipment_categories WHERE company_id = $1 ORDER BY name`,
    [companyId]
  );
  return result.rows;
}

async function createCategory({ companyId, name }) {
  const result = await pool.query(
    `INSERT INTO equipment_categories (company_id, name)
     VALUES ($1, $2)
     ON CONFLICT (company_id, name) DO NOTHING
     RETURNING id, name`,
    [companyId, name]
  );
  return result.rows[0];
}

async function listTypes(companyId) {
  const result = await pool.query(
    `SELECT et.id, et.name, et.description, et.terms, et.category_id,
            COALESCE(NULLIF(et.image_urls, '[]'::jsonb)->>0, et.image_url) AS image_url,
            et.image_urls,
            et.daily_rate, et.weekly_rate, et.monthly_rate,
            ec.name AS category
     FROM equipment_types et
     LEFT JOIN equipment_categories ec ON et.category_id = ec.id
     WHERE et.company_id = $1
     ORDER BY et.name`,
    [companyId]
  );
  return result.rows;
}

async function listTypeStats(companyId) {
  const result = await pool.query(
    `SELECT et.id, et.name, ec.name AS category, COUNT(e.id) AS count
     FROM equipment_types et
     LEFT JOIN equipment_categories ec ON et.category_id = ec.id
     LEFT JOIN equipment e ON e.type_id = et.id AND e.company_id = et.company_id
     WHERE et.company_id = $1
     GROUP BY et.id, et.name, ec.name
     ORDER BY et.name`,
    [companyId]
  );
  return result.rows;
}

async function createType({ companyId, name, categoryId, imageUrl, imageUrls, description, terms, dailyRate, weeklyRate, monthlyRate }) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const result = await pool.query(
    `INSERT INTO equipment_types (company_id, name, category_id, image_url, image_urls, description, terms, daily_rate, weekly_rate, monthly_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (company_id, name) DO NOTHING
     RETURNING id, name, category_id, image_url, image_urls, description, terms, daily_rate, weekly_rate, monthly_rate`,
    [
      companyId,
      name,
      categoryId || null,
      primaryUrl,
      JSON.stringify(urls),
      description || null,
      terms || null,
      dailyRate || null,
      weeklyRate || null,
      monthlyRate || null,
    ]
  );
  return result.rows[0];
}

async function updateType({ id, companyId, name, categoryId, imageUrl, imageUrls, description, terms, dailyRate, weeklyRate, monthlyRate }) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const result = await pool.query(
    `UPDATE equipment_types
     SET name = $1, category_id = $2, image_url = $3, image_urls = $4, description = $5, terms = $6,
         daily_rate = $7, weekly_rate = $8, monthly_rate = $9
     WHERE id = $10 AND company_id = $11
     RETURNING id, name, category_id, image_url, image_urls, description, terms, daily_rate, weekly_rate, monthly_rate`,
    [
      name,
      categoryId || null,
      primaryUrl,
      JSON.stringify(urls),
      description || null,
      terms || null,
      dailyRate || null,
      weeklyRate || null,
      monthlyRate || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

async function deleteType({ id, companyId }) {
  await pool.query(`DELETE FROM equipment_types WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listEquipment(companyId) {
  const result = await pool.query(
    `
    SELECT e.id,
           COALESCE(et.name, e.type) AS type,
           e.model_name, e.serial_number, e.condition, e.manufacturer,
           COALESCE(NULLIF(e.image_urls, '[]'::jsonb)->>0, e.image_url, NULLIF(et.image_urls, '[]'::jsonb)->>0, et.image_url) AS image_url,
           e.image_url AS equipment_image_url,
           et.image_url AS type_image_url,
           e.image_urls AS equipment_image_urls,
           et.image_urls AS type_image_urls,
           e.purchase_price,
           l.name AS location,
           e.location_id,
           l.latitude AS location_latitude,
           l.longitude AS location_longitude,
           cl.name AS current_location,
           e.current_location_id,
           cl.latitude AS current_location_latitude,
           cl.longitude AS current_location_longitude,
           e.type_id,
           e.notes,
           eb.id AS bundle_id,
           eb.name AS bundle_name,
           eb.primary_equipment_id AS bundle_primary_equipment_id,
           CASE
             WHEN COALESCE(av.has_overdue, FALSE) THEN 'Overdue'
             WHEN COALESCE(av.has_ordered, FALSE) THEN 'Rented out'
             WHEN COALESCE(av.has_reserved_now, FALSE) THEN 'Reserved'
             ELSE 'Available'
           END AS availability_status
          ,
           CASE
             WHEN COALESCE(av.has_ordered, FALSE)
              AND (e.current_location_id IS NULL OR e.current_location_id = e.location_id)
             THEN TRUE
             ELSE FALSE
           END AS needs_current_location_update
          ,
           COALESCE(av.has_overdue, FALSE) AS is_overdue
    FROM equipment e
    LEFT JOIN locations l ON e.location_id = l.id
    LEFT JOIN locations cl ON e.current_location_id = cl.id
    LEFT JOIN equipment_types et ON e.type_id = et.id
    LEFT JOIN equipment_bundle_items ebi ON ebi.equipment_id = e.id
    LEFT JOIN equipment_bundles eb ON eb.id = ebi.bundle_id
    LEFT JOIN LATERAL (
      SELECT
        BOOL_OR(
          ro.status = 'ordered'
          AND COALESCE(li.fulfilled_at, li.start_at) <= NOW()
          AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > NOW()
        ) AS has_ordered,
        BOOL_OR(ro.status = 'ordered' AND li.returned_at IS NULL AND li.end_at < NOW()) AS has_overdue,
        BOOL_OR(ro.status IN ('reservation','requested') AND li.start_at <= NOW() AND li.end_at > NOW()) AS has_reserved_now
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      WHERE liv.equipment_id = e.id
        AND ro.company_id = $1
        AND ro.status IN ('requested','reservation','ordered')
    ) av ON TRUE
    WHERE e.company_id = $1
      AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
    ORDER BY e.created_at DESC;
  `,
    [companyId]
  );
  return result.rows;
}

async function setEquipmentCurrentLocationForIds({ companyId, equipmentIds, currentLocationId }) {
  const ids = Array.isArray(equipmentIds) ? equipmentIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  const locId = Number(currentLocationId);
  if (!ids.length || !Number.isFinite(locId)) return 0;
  const result = await pool.query(
    `UPDATE equipment
        SET current_location_id = $3
      WHERE company_id = $1
        AND id = ANY($2::int[])`,
    [companyId, ids, locId]
  );
  return result.rowCount || 0;
}

async function createEquipment({
  companyId,
  typeId,
  typeName,
  modelName,
  serialNumber,
  condition,
  manufacturer,
  imageUrl,
  imageUrls,
  locationId,
  currentLocationId,
  purchasePrice,
  notes,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const result = await pool.query(
    `INSERT INTO equipment
      (company_id, type_id, type, model_name, serial_number, condition, manufacturer, image_url, image_urls, location_id, current_location_id, purchase_price, notes)
     VALUES ($1, $2, COALESCE($3, (SELECT name FROM equipment_types WHERE id = $2)), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id, type_id, type, model_name, serial_number, condition, manufacturer, image_url, image_urls, location_id, current_location_id, purchase_price, notes`,
    [
      companyId,
      typeId || null,
      typeName || null,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      primaryUrl,
      JSON.stringify(urls),
      locationId || null,
      currentLocationId || null,
      purchasePrice,
      notes || null,
    ]
  );
  const updated = result.rows[0];
  return updated;
}

async function updateEquipment({
  id,
  companyId,
  typeId,
  typeName,
  modelName,
  serialNumber,
  condition,
  manufacturer,
  imageUrl,
  imageUrls,
  locationId,
  currentLocationId,
  purchasePrice,
  notes,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const result = await pool.query(
    `UPDATE equipment
     SET type_id = $1,
         type = COALESCE($2, (SELECT name FROM equipment_types WHERE id = $1)),
         model_name = $3,
         serial_number = $4,
         condition = $5,
         manufacturer = $6,
         image_url = $7,
         image_urls = $8,
         location_id = $9,
         current_location_id = $10,
         purchase_price = $11,
         notes = $12
     WHERE id = $13 AND company_id = $14
     RETURNING id, type_id, type, model_name, serial_number, condition, manufacturer, image_url, image_urls, location_id, current_location_id, purchase_price, notes`,
    [
      typeId || null,
      typeName || null,
      modelName,
      serialNumber,
      condition,
      manufacturer,
      primaryUrl,
      JSON.stringify(urls),
      locationId || null,
      currentLocationId || null,
      purchasePrice,
      notes || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

async function deleteEquipment({ id, companyId }) {
  await pool.query(`DELETE FROM rental_order_line_inventory WHERE equipment_id = $1`, [id]);
  await pool.query(`DELETE FROM equipment WHERE id = $1 AND company_id = $2`, [id, companyId]);
  await pool.query(
    `
    DELETE FROM equipment_bundles b
     WHERE b.company_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM equipment_bundle_items bi WHERE bi.bundle_id = b.id
       )
    `,
    [companyId]
  );
}

async function purgeEquipmentForCompany({ companyId }) {
  const equipmentIds = await pool.query(`SELECT id FROM equipment WHERE company_id = $1`, [companyId]);
  const ids = equipmentIds.rows.map((r) => r.id);
  if (!ids.length) return { deletedEquipment: 0, unassignedLineInventory: 0 };

  await pool.query("BEGIN");
  try {
    const unassign = await pool.query(
      `DELETE FROM rental_order_line_inventory WHERE equipment_id = ANY($1::int[])`,
      [ids]
    );
    const del = await pool.query(`DELETE FROM equipment WHERE company_id = $1`, [companyId]);
    await pool.query("COMMIT");
    return { deletedEquipment: del.rowCount || 0, unassignedLineInventory: unassign.rowCount || 0 };
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }
}

function normalizeEquipmentIds(input) {
  const ids = Array.isArray(input) ? input.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  return Array.from(new Set(ids));
}

async function listEquipmentBundles(companyId) {
  const result = await pool.query(
    `
    SELECT b.id,
           b.name,
           b.primary_equipment_id,
           b.daily_rate,
           b.weekly_rate,
           b.monthly_rate,
           pe.type_id AS primary_type_id,
           et.name AS primary_type_name,
           et.daily_rate AS type_daily_rate,
           et.weekly_rate AS type_weekly_rate,
           et.monthly_rate AS type_monthly_rate,
           COUNT(bi.equipment_id) AS item_count
      FROM equipment_bundles b
 LEFT JOIN equipment pe ON pe.id = b.primary_equipment_id
 LEFT JOIN equipment_types et ON et.id = pe.type_id
 LEFT JOIN equipment_bundle_items bi ON bi.bundle_id = b.id
     WHERE b.company_id = $1
     GROUP BY b.id, pe.type_id, et.name, et.daily_rate, et.weekly_rate, et.monthly_rate
     ORDER BY b.name ASC
    `,
    [companyId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    primaryEquipmentId: row.primary_equipment_id === null ? null : Number(row.primary_equipment_id),
    primaryTypeId: row.primary_type_id === null || row.primary_type_id === undefined ? null : Number(row.primary_type_id),
    primaryTypeName: row.primary_type_name || null,
    dailyRate: row.daily_rate === null || row.daily_rate === undefined ? (row.type_daily_rate ?? null) : Number(row.daily_rate),
    weeklyRate: row.weekly_rate === null || row.weekly_rate === undefined ? (row.type_weekly_rate ?? null) : Number(row.weekly_rate),
    monthlyRate: row.monthly_rate === null || row.monthly_rate === undefined ? (row.type_monthly_rate ?? null) : Number(row.monthly_rate),
    itemCount: Number(row.item_count || 0),
  }));
}

async function getEquipmentBundle({ companyId, id }) {
  const headerRes = await pool.query(
    `
    SELECT b.id,
           b.name,
           b.primary_equipment_id,
           b.daily_rate,
           b.weekly_rate,
           b.monthly_rate,
           pe.type_id AS primary_type_id,
           et.name AS primary_type_name,
           et.daily_rate AS type_daily_rate,
           et.weekly_rate AS type_weekly_rate,
           et.monthly_rate AS type_monthly_rate
      FROM equipment_bundles b
 LEFT JOIN equipment pe ON pe.id = b.primary_equipment_id
 LEFT JOIN equipment_types et ON et.id = pe.type_id
     WHERE b.company_id = $1 AND b.id = $2
     LIMIT 1
    `,
    [companyId, id]
  );
  const bundle = headerRes.rows[0];
  if (!bundle) return null;

  const itemsRes = await pool.query(
    `
    SELECT e.id,
           e.serial_number,
           e.model_name,
           e.type_id,
           COALESCE(et.name, e.type) AS type_name
      FROM equipment_bundle_items bi
      JOIN equipment e ON e.id = bi.equipment_id
 LEFT JOIN equipment_types et ON et.id = e.type_id
     WHERE bi.bundle_id = $1
     ORDER BY e.serial_number
    `,
    [id]
  );

  return {
    id: bundle.id,
    name: bundle.name,
    primaryEquipmentId: bundle.primary_equipment_id === null ? null : Number(bundle.primary_equipment_id),
    primaryTypeId: bundle.primary_type_id === null || bundle.primary_type_id === undefined ? null : Number(bundle.primary_type_id),
    primaryTypeName: bundle.primary_type_name || null,
    dailyRate: bundle.daily_rate === null || bundle.daily_rate === undefined ? (bundle.type_daily_rate ?? null) : Number(bundle.daily_rate),
    weeklyRate: bundle.weekly_rate === null || bundle.weekly_rate === undefined ? (bundle.type_weekly_rate ?? null) : Number(bundle.weekly_rate),
    monthlyRate: bundle.monthly_rate === null || bundle.monthly_rate === undefined ? (bundle.type_monthly_rate ?? null) : Number(bundle.monthly_rate),
    items: itemsRes.rows.map((row) => ({
      id: row.id,
      serialNumber: row.serial_number || "",
      modelName: row.model_name || "",
      typeId: row.type_id === null || row.type_id === undefined ? null : Number(row.type_id),
      typeName: row.type_name || "",
    })),
  };
}

async function createEquipmentBundle({
  companyId,
  name,
  primaryEquipmentId,
  equipmentIds,
  dailyRate = null,
  weeklyRate = null,
  monthlyRate = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = normalizeEquipmentIds(equipmentIds);
    if (!ids.length) throw new Error("Bundle must include at least one equipment.");
    const primaryId = Number(primaryEquipmentId);
    const effectivePrimaryId = ids.includes(primaryId) ? primaryId : ids[0];

    const ownedRes = await client.query(
      `SELECT id FROM equipment WHERE company_id = $1 AND id = ANY($2::int[])`,
      [companyId, ids]
    );
    if (ownedRes.rows.length !== ids.length) throw new Error("One or more equipment items are missing.");

    const conflictRes = await client.query(
      `SELECT equipment_id FROM equipment_bundle_items WHERE equipment_id = ANY($1::int[])`,
      [ids]
    );
    if (conflictRes.rows.length) throw new Error("One or more equipment items already belong to another bundle.");

    const headerRes = await client.query(
      `
      INSERT INTO equipment_bundles
        (company_id, name, primary_equipment_id, daily_rate, weekly_rate, monthly_rate, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      RETURNING id
      `,
      [companyId, String(name || "").trim(), effectivePrimaryId, dailyRate, weeklyRate, monthlyRate]
    );
    const bundleId = Number(headerRes.rows[0].id);

    for (const equipmentId of ids) {
      await client.query(
        `INSERT INTO equipment_bundle_items (bundle_id, equipment_id) VALUES ($1,$2)`,
        [bundleId, equipmentId]
      );
    }

    await client.query("COMMIT");
    return { id: bundleId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateEquipmentBundle({
  id,
  companyId,
  name,
  primaryEquipmentId,
  equipmentIds,
  dailyRate = null,
  weeklyRate = null,
  monthlyRate = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = normalizeEquipmentIds(equipmentIds);
    if (!ids.length) throw new Error("Bundle must include at least one equipment.");
    const primaryId = Number(primaryEquipmentId);
    const effectivePrimaryId = ids.includes(primaryId) ? primaryId : ids[0];

    const ownedRes = await client.query(
      `SELECT id FROM equipment WHERE company_id = $1 AND id = ANY($2::int[])`,
      [companyId, ids]
    );
    if (ownedRes.rows.length !== ids.length) throw new Error("One or more equipment items are missing.");

    const conflictRes = await client.query(
      `SELECT equipment_id FROM equipment_bundle_items WHERE equipment_id = ANY($1::int[]) AND bundle_id <> $2`,
      [ids, id]
    );
    if (conflictRes.rows.length) throw new Error("One or more equipment items already belong to another bundle.");

    const updateRes = await client.query(
      `
      UPDATE equipment_bundles
         SET name = $1,
             primary_equipment_id = $2,
             daily_rate = $3,
             weekly_rate = $4,
             monthly_rate = $5,
             updated_at = NOW()
       WHERE id = $6 AND company_id = $7
       RETURNING id
      `,
      [String(name || "").trim(), effectivePrimaryId, dailyRate, weeklyRate, monthlyRate, id, companyId]
    );
    if (!updateRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(`DELETE FROM equipment_bundle_items WHERE bundle_id = $1`, [id]);
    for (const equipmentId of ids) {
      await client.query(
        `INSERT INTO equipment_bundle_items (bundle_id, equipment_id) VALUES ($1,$2)`,
        [id, equipmentId]
      );
    }

    await client.query("COMMIT");
    return { id: Number(id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function deleteEquipmentBundle({ id, companyId }) {
  await pool.query(`DELETE FROM equipment_bundles WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listVendors(companyId) {
  const result = await pool.query(
    `SELECT id,
            company_name,
            contact_name,
            street_address,
            city,
            region,
            country,
            postal_code,
            email,
            phone,
            notes
       FROM vendors
      WHERE company_id = $1
      ORDER BY company_name`,
    [companyId]
  );
  return result.rows;
}

async function createVendor({
  companyId,
  companyName,
  contactName,
  streetAddress,
  city,
  region,
  country,
  postalCode,
  email,
  phone,
  notes,
}) {
  const result = await pool.query(
    `INSERT INTO vendors (company_id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, notes`,
    [
      companyId,
      companyName,
      contactName || null,
      streetAddress || null,
      city || null,
      region || null,
      country || null,
      postalCode || null,
      email || null,
      phone || null,
      notes || null,
    ]
  );
  return result.rows[0];
}

async function updateVendor({
  id,
  companyId,
  companyName,
  contactName,
  streetAddress,
  city,
  region,
  country,
  postalCode,
  email,
  phone,
  notes,
}) {
  const result = await pool.query(
    `UPDATE vendors
        SET company_name = $1,
            contact_name = $2,
            street_address = $3,
            city = $4,
            region = $5,
            country = $6,
            postal_code = $7,
            email = $8,
            phone = $9,
            notes = $10
      WHERE id = $11 AND company_id = $12
      RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, notes`,
    [
      companyName,
      contactName || null,
      streetAddress || null,
      city || null,
      region || null,
      country || null,
      postalCode || null,
      email || null,
      phone || null,
      notes || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

async function deleteVendor({ id, companyId }) {
  await pool.query(`DELETE FROM vendors WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listPurchaseOrders(companyId) {
  const result = await pool.query(
    `SELECT po.id,
            po.company_id,
            po.po_number,
            po.vendor_id,
            po.status,
            po.expected_possession_date,
            po.type_id,
            po.model_name,
            po.serial_number,
            po.condition,
            po.manufacturer,
            po.image_url,
            po.image_urls,
            po.location_id,
            po.current_location_id,
            po.purchase_price,
            po.notes,
            po.equipment_id,
            po.closed_at,
            po.created_at,
            po.updated_at,
            v.company_name AS vendor_name,
            et.name AS type_name,
            l.name AS location_name,
            cl.name AS current_location_name
       FROM purchase_orders po
  LEFT JOIN vendors v ON v.id = po.vendor_id
  LEFT JOIN equipment_types et ON et.id = po.type_id
  LEFT JOIN locations l ON l.id = po.location_id
  LEFT JOIN locations cl ON cl.id = po.current_location_id
      WHERE po.company_id = $1
      ORDER BY po.created_at DESC, po.id DESC`,
    [companyId]
  );
  return result.rows;
}

async function getPurchaseOrder({ companyId, id }) {
  const result = await pool.query(
    `SELECT po.id,
            po.company_id,
            po.po_number,
            po.vendor_id,
            po.status,
            po.expected_possession_date,
            po.type_id,
            po.model_name,
            po.serial_number,
            po.condition,
            po.manufacturer,
            po.image_url,
            po.image_urls,
            po.location_id,
            po.current_location_id,
            po.purchase_price,
            po.notes,
            po.equipment_id,
            po.closed_at,
            po.created_at,
            po.updated_at,
            v.company_name AS vendor_name,
            et.name AS type_name,
            l.name AS location_name,
            cl.name AS current_location_name
       FROM purchase_orders po
  LEFT JOIN vendors v ON v.id = po.vendor_id
  LEFT JOIN equipment_types et ON et.id = po.type_id
  LEFT JOIN locations l ON l.id = po.location_id
  LEFT JOIN locations cl ON cl.id = po.current_location_id
      WHERE po.company_id = $1 AND po.id = $2`,
    [companyId, id]
  );
  return result.rows[0];
}

async function createPurchaseOrder({
  companyId,
  poNumber,
  vendorId,
  status,
  expectedPossessionDate,
  typeId,
  modelName,
  serialNumber,
  condition,
  manufacturer,
  imageUrl,
  imageUrls,
  locationId,
  currentLocationId,
  purchasePrice,
  notes,
  equipmentId,
  closedAt,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  let effectiveDate = expectedPossessionDate ? new Date(expectedPossessionDate) : new Date();
  if (Number.isNaN(effectiveDate.getTime())) effectiveDate = new Date();
  const poNumberValue =
    poNumber || (await nextDocumentNumber(pool, companyId, "PO", effectiveDate, { yearDigits: 4, seqDigits: 5 }));
  const result = await pool.query(
    `INSERT INTO purchase_orders
      (company_id, po_number, vendor_id, status, expected_possession_date, type_id, model_name, serial_number, condition, manufacturer,
       image_url, image_urls, location_id, current_location_id, purchase_price, notes, equipment_id, closed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
     RETURNING id, company_id, po_number, vendor_id, status, expected_possession_date, type_id, model_name, serial_number, condition,
               manufacturer, image_url, image_urls, location_id, current_location_id, purchase_price, notes, equipment_id,
               closed_at, created_at, updated_at`,
    [
      companyId,
      poNumberValue,
      vendorId || null,
      status || "open",
      expectedPossessionDate || null,
      typeId || null,
      modelName || null,
      serialNumber || null,
      condition || null,
      manufacturer || null,
      primaryUrl,
      JSON.stringify(urls),
      locationId || null,
      currentLocationId || null,
      purchasePrice,
      notes || null,
      equipmentId || null,
      closedAt || null,
    ]
  );
  return result.rows[0];
}

async function updatePurchaseOrder({
  id,
  companyId,
  vendorId,
  status,
  expectedPossessionDate,
  typeId,
  modelName,
  serialNumber,
  condition,
  manufacturer,
  imageUrl,
  imageUrls,
  locationId,
  currentLocationId,
  purchasePrice,
  notes,
  equipmentId,
  closedAt,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const result = await pool.query(
    `UPDATE purchase_orders
        SET vendor_id = $1,
            status = $2,
            expected_possession_date = $3,
            type_id = $4,
            model_name = $5,
            serial_number = $6,
            condition = $7,
            manufacturer = $8,
            image_url = $9,
            image_urls = $10,
            location_id = $11,
            current_location_id = $12,
            purchase_price = $13,
            notes = $14,
            equipment_id = $15,
            closed_at = $16,
            updated_at = NOW()
      WHERE id = $17 AND company_id = $18
      RETURNING id, company_id, po_number, vendor_id, status, expected_possession_date, type_id, model_name, serial_number, condition,
                manufacturer, image_url, image_urls, location_id, current_location_id, purchase_price, notes, equipment_id,
                closed_at, created_at, updated_at`,
    [
      vendorId || null,
      status || "open",
      expectedPossessionDate || null,
      typeId || null,
      modelName || null,
      serialNumber || null,
      condition || null,
      manufacturer || null,
      primaryUrl,
      JSON.stringify(urls),
      locationId || null,
      currentLocationId || null,
      purchasePrice,
      notes || null,
      equipmentId || null,
      closedAt || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

async function deletePurchaseOrder({ id, companyId }) {
  await pool.query(`DELETE FROM purchase_orders WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listCustomers(companyId) {
  const result = await pool.query(
    `SELECT c.id,
            c.company_name,
            c.contact_name,
            c.street_address,
            c.city,
            c.region,
            c.country,
            c.postal_code,
            c.email,
            c.phone,
            c.contacts,
            c.accounting_contacts,
            c.can_charge_deposit,
            c.payment_terms_days,
            c.sales_person_id,
            c.follow_up_date,
            c.notes,
            c.parent_customer_id,
            p.company_name AS parent_company_name,
            CASE
              WHEN c.parent_customer_id IS NOT NULL THEN p.can_charge_deposit
              ELSE c.can_charge_deposit
            END AS effective_can_charge_deposit,
            CASE
              WHEN c.parent_customer_id IS NOT NULL THEN p.payment_terms_days
              ELSE c.payment_terms_days
            END AS effective_payment_terms_days
     FROM customers c
     LEFT JOIN customers p ON p.id = c.parent_customer_id
     WHERE c.company_id = $1
     ORDER BY c.company_name`,
    [companyId]
  );
  return result.rows;
}

function normalizeContactField(value) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function normalizeCustomerContacts({ contacts, contactName, email, phone }) {
  let raw = [];
  if (Array.isArray(contacts)) {
    raw = contacts;
  } else if (typeof contacts === "string") {
    try {
      const parsed = JSON.parse(contacts);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = [];
    }
  }

  const normalized = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const name = normalizeContactField(entry.name || entry.contactName || entry.contact_name);
      const emailValue = normalizeContactField(entry.email);
      const phoneValue = normalizeContactField(entry.phone);
      if (!name && !emailValue && !phoneValue) return null;
      return { name, email: emailValue, phone: phoneValue };
    })
    .filter(Boolean);

  if (!normalized.length) {
    const name = normalizeContactField(contactName);
    const emailValue = normalizeContactField(email);
    const phoneValue = normalizeContactField(phone);
    if (name || emailValue || phoneValue) {
      normalized.push({ name, email: emailValue, phone: phoneValue });
    }
  }

  return normalized;
}

function normalizeInvoiceEmailFlag(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return false;
  return ["true", "1", "yes", "y", "on"].includes(raw);
}

function normalizeAccountingContacts({ accountingContacts }) {
  let raw = [];
  if (Array.isArray(accountingContacts)) {
    raw = accountingContacts;
  } else if (typeof accountingContacts === "string") {
    try {
      const parsed = JSON.parse(accountingContacts);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = [];
    }
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const name = normalizeContactField(entry.name || entry.contactName || entry.contact_name);
      const emailValue = normalizeContactField(entry.email);
      const phoneValue = normalizeContactField(entry.phone);
      if (!name && !emailValue && !phoneValue) return null;
      const invoiceEmail = normalizeInvoiceEmailFlag(
        entry.invoiceEmail ?? entry.invoice_email ?? entry.emailInvoices ?? entry.sendInvoices ?? entry.send_invoices
      );
      return { name, email: emailValue, phone: phoneValue, invoiceEmail };
    })
    .filter(Boolean);
}

function normalizeOrderContacts(contacts) {
  let raw = [];
  if (Array.isArray(contacts)) {
    raw = contacts;
  } else if (typeof contacts === "string") {
    try {
      const parsed = JSON.parse(contacts);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = [];
    }
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const name = normalizeContactField(entry.name || entry.contactName || entry.contact_name);
      const emailValue = normalizeContactField(entry.email);
      const phoneValue = normalizeContactField(entry.phone);
      if (!name && !emailValue && !phoneValue) return null;
      return { name, email: emailValue, phone: phoneValue };
    })
    .filter(Boolean);
}

function normalizeCoverageHours(value) {
  let raw = {};
  if (value && typeof value === "object" && !Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = {};
    }
  }
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const normalized = {};
  days.forEach((day) => {
    const entry = raw[day] || {};
    const start = typeof entry.start === "string" ? entry.start.trim() : "";
    const end = typeof entry.end === "string" ? entry.end.trim() : "";
    if (!start && !end) return;
    normalized[day] = { start, end };
  });
  return normalized;
}

function normalizeOrderAttachments({ companyId, attachments, category = null } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  const list = Array.isArray(attachments) ? attachments : [];
  const prefix = `/uploads/company-${cid}/`;
  return list
    .map((entry) => {
      if (!entry) return null;
      const url = String(entry.url || entry.src || "").trim();
      if (!url || !url.startsWith(prefix)) return null;
      const fileName = String(entry.fileName || entry.name || "General notes image").trim() || "General notes image";
      const mime = entry.mime ? String(entry.mime) : entry.type ? String(entry.type) : null;
      const sizeBytes =
        entry.sizeBytes === null || entry.sizeBytes === undefined
          ? entry.size === null || entry.size === undefined
            ? null
            : Number(entry.size)
          : Number(entry.sizeBytes);
      return {
        fileName,
        mime: mime || null,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
        url,
        category: category || null,
      };
    })
    .filter(Boolean);
}

function normalizeCustomerId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

async function resolveParentCustomer({ companyId, parentCustomerId }) {
  const parentId = normalizeCustomerId(parentCustomerId);
  if (
    parentCustomerId !== null &&
    parentCustomerId !== undefined &&
    String(parentCustomerId).trim() !== "" &&
    !parentId
  ) {
    throw new Error("Invalid parent customer.");
  }
  if (!parentId) return null;
  const res = await pool.query(
    `SELECT id, company_name, parent_customer_id FROM customers WHERE company_id = $1 AND id = $2 LIMIT 1`,
    [companyId, parentId]
  );
  const parent = res.rows?.[0] || null;
  if (!parent) throw new Error("Parent customer not found.");
  if (parent.parent_customer_id) throw new Error("Parent customer cannot be a branch.");
  return parent;
}

async function createCustomer({
  companyId,
  companyName,
  parentCustomerId,
  contactName,
  streetAddress,
  city,
  region,
  country,
  postalCode,
  email,
  phone,
  canChargeDeposit,
  paymentTermsDays,
  salesPersonId,
  followUpDate,
  notes,
  contacts,
  accountingContacts,
}) {
  const parent = await resolveParentCustomer({ companyId, parentCustomerId });
  const isBranch = !!parent;
  const terms = isBranch ? null : normalizePaymentTermsDays(paymentTermsDays);
  const contactList = normalizeCustomerContacts({ contacts, contactName, email, phone });
  const accountingContactList = normalizeAccountingContacts({ accountingContacts });
  const primary = contactList[0] || {};
  const primaryName = normalizeContactField(primary.name) || normalizeContactField(contactName);
  const primaryEmail = normalizeContactField(primary.email) || normalizeContactField(email);
  const primaryPhone = normalizeContactField(primary.phone) || normalizeContactField(phone);
  const finalCompanyName = parent?.company_name || companyName;
  const result = await pool.query(
    `INSERT INTO customers (company_id, parent_customer_id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, sales_person_id, follow_up_date, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, sales_person_id, follow_up_date, notes, parent_customer_id`,
    [
      companyId,
      parent?.id || null,
      finalCompanyName,
      primaryName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      primaryEmail,
      primaryPhone,
      JSON.stringify(contactList),
      JSON.stringify(accountingContactList),
      isBranch ? false : !!canChargeDeposit,
      terms,
      salesPersonId || null,
      followUpDate || null,
      notes || null,
    ]
  );
  return result.rows[0];
}

async function updateCustomer({
  id,
  companyId,
  companyName,
  parentCustomerId,
  contactName,
  streetAddress,
  city,
  region,
  country,
  postalCode,
  email,
  phone,
  canChargeDeposit,
  paymentTermsDays,
  salesPersonId,
  followUpDate,
  notes,
  contacts,
  accountingContacts,
}) {
  const normalizedParentId = normalizeCustomerId(parentCustomerId);
  if (normalizedParentId && Number(id) === normalizedParentId) {
    throw new Error("Customer cannot be its own parent.");
  }
  const parent = await resolveParentCustomer({ companyId, parentCustomerId: normalizedParentId });
  const isBranch = !!parent;
  const terms = isBranch ? null : normalizePaymentTermsDays(paymentTermsDays);
  const contactList = normalizeCustomerContacts({ contacts, contactName, email, phone });
  const accountingContactList = normalizeAccountingContacts({ accountingContacts });
  const primary = contactList[0] || {};
  const primaryName = normalizeContactField(primary.name) || normalizeContactField(contactName);
  const primaryEmail = normalizeContactField(primary.email) || normalizeContactField(email);
  const primaryPhone = normalizeContactField(primary.phone) || normalizeContactField(phone);
  const finalCompanyName = parent?.company_name || companyName;
  const result = await pool.query(
    `UPDATE customers
     SET parent_customer_id = $1,
         company_name = $2,
         contact_name = $3,
         street_address = $4,
         city = $5,
         region = $6,
         country = $7,
         postal_code = $8,
         email = $9,
         phone = $10,
         contacts = $11,
         accounting_contacts = $12,
         can_charge_deposit = $13,
         payment_terms_days = $14,
         sales_person_id = $15,
         follow_up_date = $16,
         notes = $17
     WHERE id = $18 AND company_id = $19
     RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, sales_person_id, follow_up_date, notes, parent_customer_id`,
    [
      parent?.id || null,
      finalCompanyName,
      primaryName,
      streetAddress,
      city,
      region,
      country,
      postalCode,
      primaryEmail,
      primaryPhone,
      JSON.stringify(contactList),
      JSON.stringify(accountingContactList),
      isBranch ? false : !!canChargeDeposit,
      terms,
      salesPersonId || null,
      followUpDate || null,
      notes || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

function normalizeCustomerMatchKey(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function parseYesNo(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return false;
  if (["yes", "y", "true", "1"].includes(raw)) return true;
  if (["no", "n", "false", "0"].includes(raw)) return false;
  return false;
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === '"') {
      const next = text[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

function parseMoney(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/[$,]/g, "");
  const parsed = Number.parseFloat(cleaned);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function normalizeCondition(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "Normal Wear & Tear";
  if (raw === "like new") return "New";
  if (raw === "new") return "New";
  if (raw === "normal wear and tear") return "Normal Wear & Tear";
  if (raw === "normal wear & tear") return "Normal Wear & Tear";
  if (raw.includes("damage")) return "Damaged but Usable";
  if (raw.includes("repair")) return "Needs Repair";
  if (raw.includes("unusable")) return "Unusable";
  if (raw.includes("lost")) return "Lost";
  return "Normal Wear & Tear";
}

function pickRateBucket({ duration, baseRate }) {
  const normalized = String(duration ?? "").trim().toLowerCase();
  const rate = baseRate === null || baseRate === undefined ? null : Number(baseRate);
  if (rate === null || Number.isNaN(rate)) return { dailyRate: null, weeklyRate: null, monthlyRate: null };
  if (normalized.includes("month")) return { dailyRate: null, weeklyRate: null, monthlyRate: rate };
  if (normalized.includes("week")) return { dailyRate: null, weeklyRate: rate, monthlyRate: null };
  return { dailyRate: rate, weeklyRate: null, monthlyRate: null };
}

async function getOrCreateCategoryId({ companyId, name }) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  const result = await pool.query(
    `INSERT INTO equipment_categories (company_id, name)
     VALUES ($1, $2)
     ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyId, trimmed]
  );
  return result.rows[0]?.id ?? null;
}

async function upsertEquipmentTypeFromImport({
  companyId,
  name,
  categoryId,
  imageUrl,
  description,
  terms,
  dailyRate,
  weeklyRate,
  monthlyRate,
}) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) return null;
  const result = await pool.query(
    `INSERT INTO equipment_types (company_id, name, category_id, image_url, description, terms, daily_rate, weekly_rate, monthly_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (company_id, name)
     DO UPDATE SET category_id = COALESCE(EXCLUDED.category_id, equipment_types.category_id),
                   image_url = COALESCE(EXCLUDED.image_url, equipment_types.image_url),
                   description = COALESCE(EXCLUDED.description, equipment_types.description),
                   terms = COALESCE(EXCLUDED.terms, equipment_types.terms),
                   daily_rate = COALESCE(EXCLUDED.daily_rate, equipment_types.daily_rate),
                   weekly_rate = COALESCE(EXCLUDED.weekly_rate, equipment_types.weekly_rate),
                   monthly_rate = COALESCE(EXCLUDED.monthly_rate, equipment_types.monthly_rate)
     RETURNING id`,
    [
      companyId,
      trimmedName,
      categoryId || null,
      imageUrl || null,
      description || null,
      terms || null,
      dailyRate === undefined ? null : dailyRate,
      weeklyRate === undefined ? null : weeklyRate,
      monthlyRate === undefined ? null : monthlyRate,
    ]
  );
  return result.rows[0]?.id ?? null;
}

async function getOrCreateImportedLocationId({ companyId, remoteLocationId }) {
  const trimmed = String(remoteLocationId ?? "").trim();
  if (!trimmed) return null;
  const name = `Imported location #${trimmed}`;
  const result = await pool.query(
    `INSERT INTO locations (company_id, name)
     VALUES ($1, $2)
     ON CONFLICT (company_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [companyId, name]
  );
  return result.rows[0]?.id ?? null;
}

async function importInventoryFromText({ companyId, text }) {
  if (!companyId) throw new Error("companyId is required.");
  if (!text) return { typesCreated: 0, typesUpdated: 0, equipmentCreated: 0, equipmentSkipped: 0 };

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length < 2) return { typesCreated: 0, typesUpdated: 0, equipmentCreated: 0, equipmentSkipped: 0 };

  const header = rows[0].map((h) => String(h ?? "").trim());
  const indexByName = new Map();
  header.forEach((name, idx) => {
    if (name) indexByName.set(name, idx);
  });

  const get = (row, name) => {
    const idx = indexByName.get(name);
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  };

  const existingTypeIds = await pool.query(`SELECT id, name FROM equipment_types WHERE company_id = $1`, [companyId]);
  const typeIdByName = new Map(existingTypeIds.rows.map((t) => [normalizeCustomerMatchKey(t.name), t.id]));

  const stats = { typesCreated: 0, typesUpdated: 0, equipmentCreated: 0, equipmentSkipped: 0 };

  let currentTypeId = null;
  let currentTypeName = "";
  let currentImageUrl = null;

  await pool.query("BEGIN");
  try {
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const itemId = get(row, "Item ID Number");
      const itemName = get(row, "Name");

      if (itemId || itemName) {
        const categoryName = get(row, "Category");
        const description = get(row, "Description");
        const terms = get(row, "Contract Terms");
        const imageUrl = get(row, "Photo Url") || null;
        const baseRate = parseMoney(get(row, "Base Rate"));
        const duration = get(row, "Duration");
        const { dailyRate, weeklyRate, monthlyRate } = pickRateBucket({ duration, baseRate });
        const categoryId = await getOrCreateCategoryId({ companyId, name: categoryName });

        currentTypeName = itemName || itemId;
        currentImageUrl = imageUrl;
        const key = normalizeCustomerMatchKey(currentTypeName);
        const existed = typeIdByName.has(key);
        const typeId = await upsertEquipmentTypeFromImport({
          companyId,
          name: currentTypeName,
          categoryId,
          imageUrl,
          description,
          terms,
          dailyRate,
          weeklyRate,
          monthlyRate,
        });
        currentTypeId = typeId;
        if (typeId) typeIdByName.set(key, typeId);
        if (existed) stats.typesUpdated += 1;
        else stats.typesCreated += 1;
        continue;
      }

      const stockId = get(row, "Stock Id");
      const serialNumber = get(row, "Serial Number") || get(row, "Inventory Number") || stockId;
      if (!currentTypeId || !serialNumber) {
        stats.equipmentSkipped += 1;
        continue;
      }

      const already = await pool.query(`SELECT id FROM equipment WHERE company_id = $1 AND serial_number = $2 LIMIT 1`, [
        companyId,
        serialNumber,
      ]);
      if (already.rowCount) {
        stats.equipmentSkipped += 1;
        continue;
      }

      const modelName =
        get(row, "Model Name") || get(row, "Default Model Name") || get(row, "Default Model Number") || currentTypeName;
      const manufacturer = get(row, "Manufacturer") || null;
      const condition = normalizeCondition(get(row, "Condition"));
      const purchasePrice = parseMoney(get(row, "Purchase Price"));
      const locationRemoteId = get(row, "Location ID Number");
      const locationId = await getOrCreateImportedLocationId({ companyId, remoteLocationId: locationRemoteId });

      const notesParts = [];
      const internalNotes = get(row, "Internal Notes");
      const itemBin = get(row, "Item Bin");
      const stockBin = get(row, "Stock Bin");
      const poNumber = get(row, "PO Number");
      if (internalNotes) notesParts.push(internalNotes);
      if (poNumber) notesParts.push(`PO: ${poNumber}`);
      if (itemBin) notesParts.push(`Item bin: ${itemBin}`);
      if (stockBin) notesParts.push(`Stock bin: ${stockBin}`);
      const notes = notesParts.length ? notesParts.join(" | ") : null;

      await pool.query(
        `INSERT INTO equipment
          (company_id, type_id, type, model_name, serial_number, condition, manufacturer, image_url, location_id, purchase_price, notes)
         VALUES ($1, $2, COALESCE((SELECT name FROM equipment_types WHERE id = $2), $3), $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          companyId,
          currentTypeId,
          currentTypeName || "Imported",
          modelName,
          serialNumber,
          condition,
          manufacturer,
          currentImageUrl,
          locationId,
          purchasePrice,
          notes,
        ]
      );
      stats.equipmentCreated += 1;
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  return stats;
}

async function importCustomerPricingFromInventoryText({ companyId, customerId, text }) {
  if (!companyId || !customerId) throw new Error("companyId and customerId are required.");
  if (!text) return { pricingUpserts: 0, typesCreated: 0, typesUpdated: 0 };

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length < 2) return { pricingUpserts: 0, typesCreated: 0, typesUpdated: 0 };

  const header = rows[0].map((h) => String(h ?? "").trim());
  const indexByName = new Map();
  header.forEach((name, idx) => {
    if (name) indexByName.set(name, idx);
  });

  const get = (row, name) => {
    const idx = indexByName.get(name);
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  };

  const existingTypeIds = await pool.query(`SELECT id, name FROM equipment_types WHERE company_id = $1`, [companyId]);
  const typeIdByName = new Map(existingTypeIds.rows.map((t) => [normalizeCustomerMatchKey(t.name), t.id]));

  const stats = { pricingUpserts: 0, typesCreated: 0, typesUpdated: 0 };

  await pool.query("BEGIN");
  try {
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];
      const itemName = get(row, "Name");
      if (!itemName) continue;

      const baseRate = parseMoney(get(row, "Base Rate"));
      if (baseRate === null) continue;
      const duration = get(row, "Duration");
      const { dailyRate, weeklyRate, monthlyRate } = pickRateBucket({ duration, baseRate });

      const categoryId = await getOrCreateCategoryId({ companyId, name: get(row, "Category") });
      const key = normalizeCustomerMatchKey(itemName);
      const existed = typeIdByName.has(key);
      const typeId = await upsertEquipmentTypeFromImport({
        companyId,
        name: itemName,
        categoryId,
        imageUrl: get(row, "Photo Url") || null,
        description: get(row, "Description") || null,
        terms: get(row, "Contract Terms") || null,
        dailyRate,
        weeklyRate,
        monthlyRate,
      });
      if (!typeId) continue;
      typeIdByName.set(key, typeId);
      if (existed) stats.typesUpdated += 1;
      else stats.typesCreated += 1;

      await pool.query(
        `INSERT INTO customer_pricing (company_id, customer_id, type_id, daily_rate, weekly_rate, monthly_rate)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (customer_id, type_id)
         DO UPDATE SET daily_rate = EXCLUDED.daily_rate,
                       weekly_rate = EXCLUDED.weekly_rate,
                       monthly_rate = EXCLUDED.monthly_rate`,
        [companyId, customerId, typeId, dailyRate, weeklyRate, monthlyRate]
      );
      stats.pricingUpserts += 1;
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  return stats;
}

async function importCustomersFromText({ companyId, text }) {
  if (!companyId) throw new Error("companyId is required.");
  if (!text) return { created: 0, updated: 0, skipped: 0, errors: [], updatedCustomers: [] };

  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length < 2) return { created: 0, updated: 0, skipped: 0, errors: [], updatedCustomers: [] };

  const header = rows[0].map((h) => String(h ?? "").trim());
  const indexByName = new Map();
  header.forEach((name, idx) => {
    if (name) indexByName.set(name, idx);
  });

  const get = (row, name) => {
    const idx = indexByName.get(name);
    if (idx === undefined) return "";
    return String(row[idx] ?? "").trim();
  };

  const existing = await pool.query(
    `SELECT id, email, company_name FROM customers WHERE company_id = $1`,
    [companyId]
  );
  const byEmail = new Map();
  const byCompany = new Map();
  existing.rows.forEach((c) => {
    const emailKey = normalizeCustomerMatchKey(c.email);
    const companyKey = normalizeCustomerMatchKey(c.company_name);
    if (emailKey && !byEmail.has(emailKey)) byEmail.set(emailKey, c.id);
    if (companyKey && !byCompany.has(companyKey)) byCompany.set(companyKey, c.id);
  });

  const stats = { created: 0, updated: 0, skipped: 0, errors: [], updatedCustomers: [] };

  await pool.query("BEGIN");
  try {
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i];

      const companyName =
        get(row, "Company Name") ||
        get(row, "Company name") ||
        get(row, "Company") ||
        get(row, "Last Name") ||
        "";
      const contactName = get(row, "Last Name") || "";
      const email = get(row, "Email") || "";
      const primaryPhone = get(row, "Primary Phone") || "";
      const phoneDigits = primaryPhone.replace(/[^\d]/g, "");
      const phone = phoneDigits || primaryPhone;
      const streetAddress = [get(row, "Street Address"), get(row, "Suite")].filter(Boolean).join(", ") || "";
      const city = get(row, "City") || "";
      const region = get(row, "State/Province") || "";
      const postalCode = get(row, "Postal Code") || "";
      const country = get(row, "Country") || "";
      const canChargeDeposit = parseYesNo(get(row, "Can Charge Deposit"));

      if (!companyName && !email && !phone) {
        stats.skipped += 1;
        continue;
      }

      const emailKey = normalizeCustomerMatchKey(email);
      const companyKey = normalizeCustomerMatchKey(companyName);
      const existingId = (emailKey && byEmail.get(emailKey)) || (companyKey && byCompany.get(companyKey)) || null;

      if (existingId) {
        await pool.query(
          `UPDATE customers SET can_charge_deposit = $1 WHERE id = $2 AND company_id = $3`,
          [!!canChargeDeposit, existingId, companyId]
        );
        stats.updated += 1;
        stats.updatedCustomers.push({
          id: existingId,
          companyName: companyName || null,
          email: email || null,
          row: i + 1,
        });
        continue;
      }

      const created = await pool.query(
        `INSERT INTO customers (company_id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, can_charge_deposit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          companyId,
          companyName,
          contactName || null,
          streetAddress || null,
          city || null,
          region || null,
          country || null,
          postalCode || null,
          email || null,
          phone || null,
          !!canChargeDeposit,
        ]
      );
      stats.created += 1;
      const newId = created.rows[0]?.id;
      if (emailKey && newId) byEmail.set(emailKey, newId);
      if (companyKey && newId) byCompany.set(companyKey, newId);
    }

    await pool.query("COMMIT");
  } catch (err) {
    await pool.query("ROLLBACK");
    throw err;
  }

  return stats;
}

async function deleteCustomer({ id, companyId }) {
  await pool.query(`DELETE FROM customers WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listCustomerPricing({ companyId, customerId }) {
  const result = await pool.query(
    `
    WITH base_customer AS (
      SELECT id, parent_customer_id
        FROM customers
       WHERE company_id = $1 AND id = $2
       LIMIT 1
    ),
    branch_pricing AS (
      SELECT cp.type_id,
             cp.daily_rate,
             cp.weekly_rate,
             cp.monthly_rate,
             false AS is_inherited
        FROM customer_pricing cp
        JOIN base_customer bc ON bc.id = cp.customer_id
       WHERE cp.company_id = $1
    ),
    parent_pricing AS (
      SELECT cp.type_id,
             cp.daily_rate,
             cp.weekly_rate,
             cp.monthly_rate,
             true AS is_inherited
        FROM customer_pricing cp
        JOIN base_customer bc ON bc.parent_customer_id = cp.customer_id
       WHERE cp.company_id = $1
         AND bc.parent_customer_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM customer_pricing child
            WHERE child.company_id = $1
              AND child.customer_id = bc.id
              AND child.type_id = cp.type_id
         )
    ),
    combined AS (
      SELECT * FROM branch_pricing
      UNION ALL
      SELECT * FROM parent_pricing
    )
    SELECT c.type_id,
           et.name AS type_name,
           c.daily_rate,
           c.weekly_rate,
           c.monthly_rate,
           c.is_inherited
      FROM combined c
      LEFT JOIN equipment_types et ON c.type_id = et.id
     ORDER BY et.name
    `,
    [companyId, customerId]
  );
  return result.rows;
}

async function upsertCustomerPricing({ companyId, customerId, typeId, dailyRate, weeklyRate, monthlyRate }) {
  const result = await pool.query(
    `INSERT INTO customer_pricing (company_id, customer_id, type_id, daily_rate, weekly_rate, monthly_rate)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (customer_id, type_id)
     DO UPDATE SET daily_rate = EXCLUDED.daily_rate,
                   weekly_rate = EXCLUDED.weekly_rate,
                   monthly_rate = EXCLUDED.monthly_rate
     RETURNING type_id, daily_rate, weekly_rate, monthly_rate`,
    [companyId, customerId, typeId, dailyRate, weeklyRate, monthlyRate]
  );
  return result.rows[0];
}

async function deleteCustomerPricing({ companyId, customerId, typeId }) {
  await pool.query(
    `DELETE FROM customer_pricing WHERE company_id = $1 AND customer_id = $2 AND type_id = $3`,
    [companyId, customerId, typeId]
  );
}

async function listSalesPeople(companyId) {
  const result = await pool.query(
    `SELECT id, name, email, phone, image_url FROM sales_people WHERE company_id = $1 ORDER BY name`,
    [companyId]
  );
  return result.rows;
}

async function getSalesPerson({ companyId, id }) {
  const result = await pool.query(
    `SELECT id, name, email, phone, image_url FROM sales_people WHERE company_id = $1 AND id = $2 LIMIT 1`,
    [companyId, id]
  );
  return result.rows[0] || null;
}

async function createSalesPerson({ companyId, name, email, phone, imageUrl }) {
  const result = await pool.query(
    `INSERT INTO sales_people (company_id, name, email, phone, image_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (company_id, name) DO NOTHING
     RETURNING id, name, email, phone, image_url`,
    [companyId, name, email || null, phone || null, imageUrl || null]
  );
  return result.rows[0];
}

async function updateSalesPerson({ companyId, id, name, email, phone, imageUrl }) {
  const result = await pool.query(
    `UPDATE sales_people
        SET name = $3,
            email = $4,
            phone = $5,
            image_url = $6
      WHERE company_id = $1 AND id = $2
      RETURNING id, name, email, phone, image_url`,
    [companyId, id, name, email || null, phone || null, imageUrl || null]
  );
  return result.rows[0] || null;
}

async function deleteSalesPerson({ companyId, id }) {
  const result = await pool.query(`DELETE FROM sales_people WHERE company_id = $1 AND id = $2`, [companyId, id]);
  return result.rowCount || 0;
}

function normalizeTimestamptz(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeBillingRoundingMode(value) {
  const v = String(value || "").toLowerCase();
  if (v === "prorate" || v === "none") return "none";
  if (v === "ceil" || v === "floor" || v === "nearest") return v;
  return "ceil";
}

function normalizeBillingRoundingGranularity(value) {
  const v = String(value || "").toLowerCase();
  if (v === "hour" || v === "day" || v === "unit") return v;
  return "unit";
}

function normalizeMonthlyProrationMethod(value) {
  const v = String(value || "").toLowerCase();
  if (v === "days" || v === "hours") return v;
  return "hours";
}

function normalizeInvoiceDateMode(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "period_start" || v === "service_period_start") return "period_start";
  return "generation";
}

function normalizeRateBasis(value) {
  const v = String(value || "").toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly") return v;
  return null;
}

function normalizePausePeriods(value, { allowOpen = true } = {}) {
  if (!Array.isArray(value)) return [];
  return value
    .map((p) => {
      const startAt = normalizeTimestamptz(p?.startAt || p?.start_at);
      const endAtRaw = normalizeTimestamptz(p?.endAt || p?.end_at);
      const endAt = endAtRaw || null;
      if (!startAt) return null;
      if (!endAt && !allowOpen) return null;
      if (endAt && Date.parse(endAt) <= Date.parse(startAt)) return null;

      const source = String(p?.source || "").trim() || null;
      const workOrderNumber = String(p?.workOrderNumber || p?.work_order_number || "").trim() || null;
      const normalized = { startAt, endAt };
      if (source) normalized.source = source;
      if (workOrderNumber) normalized.workOrderNumber = workOrderNumber;
      return normalized;
    })
    .filter(Boolean);
}

function billingPeriodDays(rateBasis) {
  switch (normalizeRateBasis(rateBasis)) {
    case "weekly":
      return 7;
    case "daily":
      return 1;
    default:
      return null;
  }
}

function billingReasonLabel(reason) {
  const v = String(reason || "").trim().toLowerCase();
  switch (v) {
    case "monthly":
      return "Monthly billing";
    case "monthly_arrears":
      return "Monthly billing (arrears)";
    case "contract_final":
      return "Final invoice";
    case "pickup_proration":
      return "Pickup proration";
    case "pause_credit":
      return "Pause credit";
    case "return_credit":
      return "Return credit";
    case "resume_charge":
      return "Resume charge";
    case "fee":
      return "Fee";
    default:
      return "Invoice";
  }
}

function generalNotesForBillingReason(reason) {
  const v = String(reason || "").trim().toLowerCase();
  switch (v) {
    case "monthly":
      return "Invoice created for scheduled monthly billing in advance.";
    case "monthly_arrears":
      return "Invoice created for monthly billing in arrears.";
    case "contract_final":
      return "Invoice created because the rental period ended.";
    case "pickup_proration":
      return "Invoice created because items were picked up (prorated for the remainder of the month).";
    case "pause_credit":
      return "Invoice created because the rental was paused.";
    case "return_credit":
      return "Invoice created because items were returned.";
    case "resume_charge":
      return "Invoice created because the rental resumed.";
    case "fee":
      return "Invoice created to bill fees.";
    default:
      return "Invoice created.";
  }
}

async function resolveInvoiceTermsDaysForCustomer(client, companyId, customerId) {
  const settings = await getCompanySettingsForClient(client, companyId);
  const customerRes = await client.query(
    `
    SELECT CASE
             WHEN c.parent_customer_id IS NOT NULL THEN p.payment_terms_days
             ELSE c.payment_terms_days
           END AS payment_terms_days
      FROM customers c
      LEFT JOIN customers p ON p.id = c.parent_customer_id
     WHERE c.company_id = $1 AND c.id = $2
     LIMIT 1
    `,
    [companyId, customerId]
  );
  const customerTerms = customerRes.rows?.[0]?.payment_terms_days === null || customerRes.rows?.[0]?.payment_terms_days === undefined
    ? null
    : Number(customerRes.rows[0].payment_terms_days);
  return normalizePaymentTermsDays(customerTerms) || settings.default_payment_terms_days || 30;
}

async function fetchLineItemForBilling(client, lineItemId) {
  const res = await client.query(
    `
    SELECT li.id,
           li.rental_order_id,
           et.name AS type_name,
           li.start_at,
           li.end_at,
           li.fulfilled_at,
           li.returned_at,
           li.rate_basis,
           li.rate_amount,
           cond.pause_periods,
           (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
      FROM rental_order_line_items li
      JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
     WHERE li.id = $1
     LIMIT 1
    `,
    [lineItemId]
  );
  return res.rows[0] || null;
}

function normalizeLineBillingDates(line) {
  const lineStart = normalizeTimestamptz(line?.fulfilled_at || line?.start_at);
  const lineEnd = normalizeTimestamptz(line?.returned_at || line?.end_at);
  if (!lineStart || !lineEnd) return null;
  if (Date.parse(lineEnd) <= Date.parse(lineStart)) return null;
  return { lineStart, lineEnd };
}

function buildLineOriginKey({ lineItemId, coverageStart, coverageEnd, billingReason, isCredit }) {
  const liid = Number(lineItemId);
  const startIso = normalizeTimestamptz(coverageStart);
  const endIso = normalizeTimestamptz(coverageEnd);
  if (!Number.isFinite(liid) || liid <= 0 || !startIso || !endIso) return null;
  const reason = billingReason ? String(billingReason).trim() : "";
  const creditFlag = isCredit ? "credit" : "debit";
  return `line:${liid}:${startIso}:${endIso}:${reason}:${creditFlag}`;
}

function buildFeeOriginKey({ feeId, billingReason }) {
  const fid = Number(feeId);
  if (!Number.isFinite(fid) || fid <= 0) return null;
  const reason = billingReason ? String(billingReason).trim() : "fee";
  return `fee:${fid}:${reason}`;
}

function buildInvoiceLineEntry({
  line,
  coverageStart,
  coverageEnd,
  roundingMode,
  roundingGranularity,
  monthlyProrationMethod,
  billingReason,
  isCredit = false,
  pausePeriods = null,
  descriptionPrefix = "",
  timeZone = null,
} = {}) {
  if (!line || !coverageStart || !coverageEnd) return null;
  const qty = Number(line.qty || 0);
  if (!Number.isFinite(qty) || qty <= 0) return null;

  const rateAmount = line.rate_amount === null || line.rate_amount === undefined ? null : Number(line.rate_amount);
  const rateBasis = normalizeRateBasis(line.rate_basis);
  if (rateAmount === null || !Number.isFinite(rateAmount) || !rateBasis) return null;

  const pauseInfo = pausePeriods
    ? collectPauseOverlap({ pausePeriods, startAt: coverageStart, endAt: coverageEnd })
    : { totalMs: 0, segments: [] };

  const billableUnits = computeBillableUnits({
    startAt: coverageStart,
    endAt: coverageEnd,
    rateBasis,
    roundingMode,
    roundingGranularity,
    monthlyProrationMethod,
    pausePeriods: pauseInfo.segments,
  });
  if (billableUnits === null || !Number.isFinite(billableUnits) || billableUnits <= 0) return null;

  const quantity = qty * billableUnits;
  const amount = toMoney(quantity * rateAmount);
  if (!amount) return null;

  let desc = `${line.type_name} (${qty} units) - ${formatPeriodLabel(coverageStart, coverageEnd, timeZone)}`;
  if (pauseInfo.totalMs > 0) {
    const pauseRanges = pauseInfo.segments
      .map((seg) => formatPeriodLabel(seg.startAt, seg.endAt, timeZone))
      .filter(Boolean)
      .join("; ");
    const pauseDuration = formatDurationDays(pauseInfo.totalMs);
    if (pauseRanges) {
      desc += ` (Paused ${pauseDuration}: ${pauseRanges})`;
    } else {
      desc += ` (Paused ${pauseDuration})`;
    }
  }

  if (descriptionPrefix) {
    desc = `${descriptionPrefix}${desc}`;
  }

  return {
    description: desc,
    quantity: isCredit ? -quantity : quantity,
    unitPrice: toMoney(rateAmount),
    amount: isCredit ? -amount : amount,
    lineItemId: Number(line.id),
    coverageStart,
    coverageEnd,
    billingReason: billingReason || null,
    originKey: buildLineOriginKey({
      lineItemId: line.id,
      coverageStart,
      coverageEnd,
      billingReason,
      isCredit,
    }),
  };
}

async function hasInvoiceLineItemCoverage({
  client,
  companyId,
  lineItemId,
  coverageStart,
  coverageEnd,
  billingReason,
  isCredit,
}) {
  const originKey = buildLineOriginKey({
    lineItemId,
    coverageStart,
    coverageEnd,
    billingReason,
    isCredit,
  });
  if (originKey) {
    const res = await client.query(
      `
      SELECT ili.id
        FROM invoice_line_items ili
        JOIN invoices i ON i.id = ili.invoice_id
       WHERE i.company_id = $1
         AND ili.origin_key = $2
       LIMIT 1
      `,
      [companyId, originKey]
    );
    if (res.rows?.[0]?.id) return true;
  }
  const res = await client.query(
    `
    SELECT ili.id
      FROM invoice_line_items ili
      JOIN invoices i ON i.id = ili.invoice_id
     WHERE i.company_id = $1
       AND ili.line_item_id = $2
       AND ili.coverage_start = $3::timestamptz
       AND ili.coverage_end = $4::timestamptz
       AND COALESCE(ili.billing_reason, '') = $5
       AND (ili.amount < 0) = $6
     LIMIT 1
    `,
    [companyId, lineItemId, coverageStart, coverageEnd, billingReason || "", !!isCredit]
  );
  return !!res.rows?.[0]?.id;
}

async function findDraftInvoiceCoveringDate(client, companyId, orderId, atIso) {
  const res = await client.query(
    `
    SELECT id, invoice_number, service_period_start, service_period_end, period_start, period_end, billing_reason
      FROM invoices
     WHERE company_id = $1
       AND rental_order_id = $2
       AND status = 'draft'
       AND COALESCE(service_period_start, period_start) IS NOT NULL
       AND COALESCE(service_period_end, period_end) IS NOT NULL
       AND COALESCE(service_period_start, period_start) <= $3::timestamptz
       AND COALESCE(service_period_end, period_end) > $3::timestamptz
     ORDER BY COALESCE(invoice_date, issue_date) DESC NULLS LAST, id DESC
     LIMIT 1
    `,
    [companyId, orderId, atIso]
  );
  return res.rows[0] || null;
}

async function getNextInvoiceSortOrder(client, invoiceId) {
  const res = await client.query(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId]
  );
  const maxSort = res.rows?.[0]?.max_sort;
  const next = Number(maxSort === null || maxSort === undefined ? -1 : maxSort);
  return Number.isFinite(next) ? next + 1 : 0;
}

async function insertInvoiceLineEntries(client, invoiceId, entries, sortOrderStart = 0, taxConfig = null) {
  let sortOrder = Number(sortOrderStart) || 0;
  for (const entry of entries) {
    const taxInfo = computeLineItemTax({
      amount: entry.amount,
      isTaxable: entry.isTaxable,
      taxRate: entry.taxRate,
      taxConfig,
    });
    const originKey = entry.originKey ? String(entry.originKey).trim() : null;
    await client.query(
      `
      INSERT INTO invoice_line_items
          (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, line_item_id, coverage_start, coverage_end, billing_reason, origin_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (invoice_id, origin_key) DO NOTHING
        `,
        [
          invoiceId,
          entry.description,
          entry.quantity,
          entry.unitPrice,
          toMoney(entry.amount),
          taxInfo.isTaxable === true,
          taxInfo.taxRate,
          taxInfo.taxAmount,
          taxInfo.taxInclusive === true,
          sortOrder++,
          entry.lineItemId || null,
          entry.coverageStart || null,
          entry.coverageEnd || null,
          entry.billingReason || null,
          originKey,
        ]
      );
    }
    return sortOrder;
  }

async function collectUninvoicedFeesForOrder(client, companyId, orderId) {
  const feeRes = await client.query(
    `SELECT id, name, amount FROM rental_order_fees WHERE rental_order_id = $1 ORDER BY id ASC`,
    [orderId]
  );
  const fees = feeRes.rows || [];
  if (!fees.length) return [];

  const invoicedFeeRes = await client.query(
    `
    SELECT DISTINCT ili.fee_id
      FROM invoice_line_items ili
      JOIN invoices i ON i.id = ili.invoice_id
     WHERE i.company_id = $1
       AND i.rental_order_id = $2
       AND ili.fee_id IS NOT NULL
    `,
    [companyId, orderId]
  );
  const invoicedFeeIds = new Set(
    invoicedFeeRes.rows
      .map((r) => (r.fee_id === null || r.fee_id === undefined ? null : Number(r.fee_id)))
      .filter((id) => Number.isFinite(id))
  );

  return fees
    .map((fee) => ({
      id: Number(fee.id),
      name: String(fee.name || "").trim(),
      amount: toMoney(fee.amount),
    }))
    .filter((fee) => fee.name && fee.amount && !invoicedFeeIds.has(fee.id));
}

async function insertFeeLineEntries(client, invoiceId, fees, sortOrderStart, taxConfig = null) {
  let sortOrder = Number(sortOrderStart) || 0;
  for (const fee of fees) {
    const taxInfo = computeLineItemTax({ amount: fee.amount, isTaxable: true, taxRate: null, taxConfig });
    const originKey = buildFeeOriginKey({ feeId: fee.id, billingReason: "fee" });
    await client.query(
      `
      INSERT INTO invoice_line_items
          (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, fee_id, billing_reason, origin_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (invoice_id, origin_key) DO NOTHING
        `,
        [
          invoiceId,
          fee.name,
          1,
          fee.amount,
          fee.amount,
          taxInfo.isTaxable === true,
          taxInfo.taxRate,
          taxInfo.taxAmount,
          taxInfo.taxInclusive === true,
          sortOrder++,
          fee.id,
          "fee",
          originKey,
        ]
      );
    }
    return sortOrder;
  }

async function createInvoiceWithEntries({
  client,
  companyId,
  orderId,
  customerId,
  periodStart,
  periodEnd,
  billingReason,
  lineEntries,
  feeEntries,
  generalNotes,
  documentType = "invoice",
  timeZone = null,
  invoiceDateMode = null,
  taxConfig = null,
} = {}) {
  const lines = Array.isArray(lineEntries) ? lineEntries.filter(Boolean) : [];
  const fees = Array.isArray(feeEntries) ? feeEntries.filter(Boolean) : [];
  if (!lines.length && !fees.length) return null;

  const docType = normalizeInvoiceDocumentType(documentType);
  const prefix = docType === "credit_memo" ? "CRM" : docType === "debit_memo" ? "DBM" : "INV";
  const invoiceDate = resolveInvoiceDate({
    servicePeriodStart: periodStart,
    timeZone,
    invoiceDateMode,
  });
  const invoiceDateObj = invoiceDate ? new Date(`${invoiceDate}T00:00:00Z`) : new Date();
  const termsDays = await resolveInvoiceTermsDaysForCustomer(client, companyId, customerId);
  const dueDateObj = new Date(invoiceDateObj.getTime() + Number(termsDays) * 24 * 60 * 60 * 1000);
  const invoiceNumber = await nextDocumentNumber(client, companyId, prefix, invoiceDateObj);

  const invoiceRes = await client.query(
    `
    INSERT INTO invoices
        (company_id, invoice_number, customer_id, rental_order_id, status, document_type, invoice_date, issue_date, due_date, service_period_start, service_period_end, period_start, period_end, billing_reason, general_notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'draft',$5,$6::date,$7::date,$8::date,$9::timestamptz,$10::timestamptz,$11::timestamptz,$12::timestamptz,$13,$14,NOW(),NOW())
      RETURNING id, invoice_number
      `,
      [
        companyId,
        invoiceNumber,
        customerId,
        orderId,
        docType,
        invoiceDate,
        invoiceDate,
        isoDate(dueDateObj),
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        billingReason || null,
        generalNotes ?? generalNotesForBillingReason(billingReason),
      ]
    );
  const invoiceId = Number(invoiceRes.rows[0].id);

  let sortOrder = await insertInvoiceLineEntries(client, invoiceId, lines, 0, taxConfig);
  if (fees.length) {
    await insertFeeLineEntries(client, invoiceId, fees, sortOrder, taxConfig);
  }

  return { id: invoiceId, invoiceNumber, periodStart, periodEnd, servicePeriodStart: periodStart, servicePeriodEnd: periodEnd };
}

async function createManualInvoice({
  companyId,
  customerId,
  invoiceDate = null,
  dueDate = null,
  servicePeriodStart = null,
  servicePeriodEnd = null,
  generalNotes = null,
  notes = null,
  lineItems = null,
} = {}) {
  const cid = Number(companyId);
  const custId = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(custId) || custId <= 0) throw new Error("customerId is required.");

  const items = Array.isArray(lineItems) ? lineItems : [];
  const hasLine = items.some((raw) => String(raw?.description || "").trim());
  if (!hasLine) throw new Error("At least one line item is required.");

  const periodStart = servicePeriodStart ? normalizeTimestamptz(servicePeriodStart) : null;
  const periodEnd = servicePeriodEnd ? normalizeTimestamptz(servicePeriodEnd) : null;
  if (periodStart && periodEnd && Date.parse(periodEnd) <= Date.parse(periodStart)) {
    throw new Error("servicePeriodEnd must be after servicePeriodStart.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";

    let invoiceDateValue = invoiceDate ? isoDate(invoiceDate) : null;
    if (!invoiceDateValue) {
      invoiceDateValue = resolveInvoiceDate({
        servicePeriodStart: periodStart,
        timeZone: billingTimeZone,
        invoiceDateMode: settings.invoice_date_mode,
      });
    }
    if (!invoiceDateValue) invoiceDateValue = isoDate(new Date());
    const invoiceDateObj = new Date(`${invoiceDateValue}T00:00:00Z`);

    let dueDateValue = dueDate ? isoDate(dueDate) : null;
    if (!dueDateValue) {
      const termsDays = await resolveInvoiceTermsDaysForCustomer(client, cid, custId);
      const dueDateObj = new Date(invoiceDateObj.getTime() + Number(termsDays) * 24 * 60 * 60 * 1000);
      dueDateValue = isoDate(dueDateObj);
    }

    const invoiceNumber = await nextDocumentNumber(client, cid, "INV", invoiceDateObj);
    const headerRes = await client.query(
      `
      INSERT INTO invoices
          (company_id, invoice_number, customer_id, rental_order_id, status, document_type,
           invoice_date, issue_date, due_date, service_period_start, service_period_end,
           period_start, period_end, billing_reason, general_notes, notes, created_at, updated_at)
      VALUES ($1,$2,$3,NULL,'draft','invoice',$4::date,$5::date,$6::date,$7::timestamptz,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13,NOW(),NOW())
      RETURNING id, invoice_number
      `,
      [
        cid,
        invoiceNumber,
        custId,
        invoiceDateValue,
        invoiceDateValue,
        dueDateValue,
        periodStart,
        periodEnd,
        periodStart,
        periodEnd,
        "manual",
        generalNotes ?? "Manual invoice.",
        notes ? String(notes).trim() : null,
      ]
    );
    const invoiceId = Number(headerRes.rows[0].id);

    let sort = 0;
    for (const raw of items) {
      const description = String(raw?.description || "").trim();
      if (!description) continue;
      const originKey = raw?.originKey ? String(raw.originKey).trim() : null;
      const quantity = raw?.quantity === null || raw?.quantity === undefined || raw?.quantity === "" ? 1 : Number(raw.quantity);
      const unitPrice = raw?.unitPrice === null || raw?.unitPrice === undefined || raw?.unitPrice === "" ? 0 : Number(raw.unitPrice);
      const providedAmount = raw?.amount === null || raw?.amount === undefined || raw?.amount === "" ? null : Number(raw.amount);
      const amount = Number.isFinite(providedAmount)
        ? providedAmount
        : toMoney((Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitPrice) ? unitPrice : 0));
      const taxInfo = computeLineItemTax({
        amount,
        isTaxable: raw?.isTaxable,
        taxRate: raw?.taxRate,
        taxConfig,
      });

      await client.query(
        `
        INSERT INTO invoice_line_items
          (invoice_id, description, quantity, unit_price, amount, is_taxable, tax_rate, tax_amount, tax_inclusive, sort_order, origin_key)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        `,
        [
          invoiceId,
          description,
          Number.isFinite(quantity) ? quantity : 0,
          Number.isFinite(unitPrice) ? unitPrice : 0,
          toMoney(amount),
          taxInfo.isTaxable === true,
          taxInfo.taxRate,
          taxInfo.taxAmount,
          taxInfo.taxInclusive === true,
          sort++,
          originKey,
        ]
      );
    }

    await client.query("COMMIT");
    return await getInvoice({ companyId: cid, id: invoiceId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createInvoiceCorrection({ companyId, invoiceId, documentType } = {}) {
  const cid = Number(companyId);
  const iid = Number(invoiceId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(iid) || iid <= 0) throw new Error("invoiceId is required.");

  const docType = normalizeInvoiceDocumentType(documentType);
  if (docType === "invoice") throw new Error("documentType must be credit_memo or debit_memo.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const baseRes = await client.query(
      `
      SELECT id,
             invoice_number,
             customer_id,
             rental_order_id,
             status,
             document_type,
             service_period_start,
             service_period_end,
             period_start,
             period_end
        FROM invoices
       WHERE company_id = $1 AND id = $2
       LIMIT 1
      `,
      [cid, iid]
    );
    const base = baseRes.rows?.[0] || null;
    if (!base) {
      await client.query("ROLLBACK");
      return null;
    }

    const baseDocType = normalizeInvoiceDocumentType(base.document_type);
    if (baseDocType !== "invoice") {
      await client.query("ROLLBACK");
      throw new Error("Corrections can only be created from invoices.");
    }

    const status = String(base.status || "").trim().toLowerCase();
    if (status === "draft") {
      await client.query("ROLLBACK");
      throw new Error("Draft invoices can be edited directly.");
    }
    if (status === "void") {
      await client.query("ROLLBACK");
      throw new Error("Voided invoices cannot be corrected.");
    }

    const settings = await getCompanySettingsForClient(client, cid).catch(() => null);
    const billingTimeZone = settings?.billing_timezone || "UTC";
    const servicePeriodStart = base.service_period_start || base.period_start || null;
    const servicePeriodEnd = base.service_period_end || base.period_end || null;
    const invoiceDate = resolveInvoiceDate({
      servicePeriodStart,
      timeZone: billingTimeZone,
      invoiceDateMode: settings?.invoice_date_mode,
    });
    const invoiceDateObj = invoiceDate ? new Date(`${invoiceDate}T00:00:00Z`) : new Date();
    const termsDays = await resolveInvoiceTermsDaysForCustomer(client, cid, base.customer_id);
    const dueDateObj = new Date(invoiceDateObj.getTime() + Number(termsDays) * 24 * 60 * 60 * 1000);

    const prefix = docType === "credit_memo" ? "CRM" : "DBM";
    const invoiceNumber = await nextDocumentNumber(client, cid, prefix, invoiceDateObj);

    const generalNotes =
      docType === "credit_memo"
        ? `Credit memo issued for invoice ${base.invoice_number}.`
        : `Debit memo issued for invoice ${base.invoice_number}.`;

    const invoiceRes = await client.query(
      `
      INSERT INTO invoices
        (company_id, invoice_number, customer_id, rental_order_id, applies_to_invoice_id, status, document_type,
         invoice_date, issue_date, due_date, service_period_start, service_period_end, period_start, period_end, billing_reason, general_notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'draft',$6,$7::date,$8::date,$9::date,$10::timestamptz,$11::timestamptz,$12::timestamptz,$13::timestamptz,$14,$15,NOW(),NOW())
      RETURNING id, invoice_number
      `,
      [
        cid,
        invoiceNumber,
        Number(base.customer_id),
        base.rental_order_id,
        Number(base.id),
        docType,
        invoiceDate,
        invoiceDate,
        isoDate(dueDateObj),
        servicePeriodStart,
        servicePeriodEnd,
        servicePeriodStart,
        servicePeriodEnd,
        docType,
        generalNotes,
      ]
    );

    await client.query("COMMIT");
    const row = invoiceRes.rows?.[0] || null;
    if (!row) return null;
    return { id: Number(row.id), invoiceNumber: row.invoice_number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function rebuildDraftInvoiceLineItemsForLineItem({
  client,
  invoice,
  line,
  roundingMode,
  roundingGranularity,
  monthlyProrationMethod,
  billingReason,
  timeZone = null,
  taxConfig = null,
} = {}) {
  if (!invoice?.id || !line?.id) return false;
  await client.query(
    `DELETE FROM invoice_line_items WHERE invoice_id = $1 AND line_item_id = $2`,
    [invoice.id, line.id]
  );

  const lineDates = normalizeLineBillingDates(line);
  if (!lineDates) return false;
  const overlap = overlapRange({
    startAt: lineDates.lineStart,
    endAt: lineDates.lineEnd,
    rangeStart: invoice.service_period_start || invoice.period_start,
    rangeEnd: invoice.service_period_end || invoice.period_end,
  });
  if (!overlap) return false;

  const pausePeriods = normalizePausePeriods(line.pause_periods);
  const entry = buildInvoiceLineEntry({
    line,
    coverageStart: overlap.startAt,
    coverageEnd: overlap.endAt,
    roundingMode,
    roundingGranularity,
    monthlyProrationMethod,
    billingReason: billingReason || invoice.billing_reason || "draft_adjust",
    pausePeriods,
    timeZone,
  });
  if (!entry) return false;

  const sortOrder = await getNextInvoiceSortOrder(client, invoice.id);
  await insertInvoiceLineEntries(client, invoice.id, [entry], sortOrder, taxConfig);
  return true;
}

async function insertInvoiceAudit({
  client,
  companyId,
  orderId,
  invoice,
  reason,
  summaryPrefix,
  lineEntries,
  actorName,
  actorEmail,
  action = "invoice_created",
} = {}) {
  if (!orderId || !invoice?.id) return;
  const label = billingReasonLabel(reason);
  const invoiceNumber = invoice.invoiceNumber || invoice.invoice_number || null;
  const summary = summaryPrefix || `Created invoice ${invoiceNumber || `#${invoice.id}`} (${label}).`;
  const changes = {
    invoiceId: invoice.id,
    invoiceNumber,
    billingReason: reason || null,
    billingLabel: label,
    periodStart:
      invoice.servicePeriodStart || invoice.service_period_start || invoice.periodStart || invoice.period_start || null,
    periodEnd: invoice.servicePeriodEnd || invoice.service_period_end || invoice.periodEnd || invoice.period_end || null,
    lines: Array.isArray(lineEntries)
      ? lineEntries.map((entry) => ({
          lineItemId: entry.lineItemId || null,
          coverageStart: entry.coverageStart || null,
          coverageEnd: entry.coverageEnd || null,
          amount: entry.amount || 0,
          billingReason: entry.billingReason || null,
        }))
      : [],
  };
  await insertRentalOrderAudit({
    client,
    companyId,
    orderId,
    actorName,
    actorEmail,
    action,
    summary,
    changes,
  });
}

async function createPickupBillingForLineItem({ companyId, lineItemId, actorName = null, actorEmail = null } = {}) {
  const cid = Number(companyId);
  const liid = Number(lineItemId);
  if (!Number.isFinite(cid) || !Number.isFinite(liid)) throw new Error("companyId and lineItemId are required.");

  const client = await pool.connect();
  const created = [];
  let updated = null;

  try {
    await client.query("BEGIN");
    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";

    const line = await fetchLineItemForBilling(client, liid);
    if (!line || !line.fulfilled_at) {
      await client.query("ROLLBACK");
      return { created };
    }

    const orderId = Number(line.rental_order_id);
    const orderRes = await client.query(
      `SELECT id, customer_id FROM rental_orders WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [cid, orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return { created };
    }

    let lineDates = normalizeLineBillingDates(line);
    const period = monthRangeForDate(line.fulfilled_at, billingTimeZone);
    if (!lineDates && !line?.returned_at && !line?.end_at && period) {
      const lineStart = normalizeTimestamptz(line.fulfilled_at || line.start_at);
      const lineEnd = normalizeTimestamptz(period.endAt);
      if (lineStart && lineEnd && Date.parse(lineEnd) > Date.parse(lineStart)) {
        lineDates = { lineStart, lineEnd };
      }
    }
    if (!lineDates || !period) {
      await client.query("ROLLBACK");
      return { created };
    }

    const coverage = overlapRange({
      startAt: line.fulfilled_at,
      endAt: lineDates.lineEnd,
      rangeStart: period.startAt,
      rangeEnd: period.endAt,
    });
    if (!coverage) {
      await client.query("ROLLBACK");
      return { created };
    }

    const already = await hasInvoiceLineItemCoverage({
      client,
      companyId: cid,
      lineItemId: liid,
      coverageStart: coverage.startAt,
      coverageEnd: coverage.endAt,
      billingReason: "pickup_proration",
      isCredit: false,
    });
    if (already) {
      await client.query("COMMIT");
      return { created };
    }

    const pausePeriods = normalizePausePeriods(line.pause_periods);
    const entry = buildInvoiceLineEntry({
      line,
      coverageStart: coverage.startAt,
      coverageEnd: coverage.endAt,
      roundingMode: settings.billing_rounding_mode,
      roundingGranularity: settings.billing_rounding_granularity,
      monthlyProrationMethod: settings.monthly_proration_method,
      billingReason: "pickup_proration",
      pausePeriods,
      timeZone: billingTimeZone,
    });
    if (!entry) {
      await client.query("ROLLBACK");
      return { created };
    }

    const draftInvoice = await findDraftInvoiceCoveringDate(client, cid, orderId, coverage.startAt);
    if (draftInvoice) {
      const sortOrder = await getNextInvoiceSortOrder(client, draftInvoice.id);
        const nextSort = await insertInvoiceLineEntries(client, draftInvoice.id, [entry], sortOrder, taxConfig);
        const fees = await collectUninvoicedFeesForOrder(client, cid, orderId);
        if (fees.length) {
          await insertFeeLineEntries(client, draftInvoice.id, fees, nextSort, taxConfig);
        }
      updated = {
        id: Number(draftInvoice.id),
        invoiceNumber: draftInvoice.invoice_number,
        periodStart: draftInvoice.service_period_start || draftInvoice.period_start,
        periodEnd: draftInvoice.service_period_end || draftInvoice.period_end,
      };
      await insertInvoiceAudit({
        client,
        companyId: cid,
        orderId,
        invoice: updated,
        reason: "pickup_proration",
        summaryPrefix: `Updated draft invoice ${draftInvoice.invoice_number || `#${draftInvoice.id}`} (Pickup proration).`,
        lineEntries: [entry],
        actorName,
        actorEmail,
        action: "invoice_updated",
      });
    } else {
      const fees = await collectUninvoicedFeesForOrder(client, cid, orderId);
      const includeMonthlyMethod = normalizeRateBasis(line.rate_basis) === "monthly";
      const prorationNotes = buildProrationNotes({
        periodStart: coverage.startAt,
        periodEnd: coverage.endAt,
        timeZone: billingTimeZone,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
        includeMonthlyMethod,
      });
      const generalNotes = [generalNotesForBillingReason("pickup_proration"), prorationNotes].filter(Boolean).join("\n");
        const invoice = await createInvoiceWithEntries({
          client,
          companyId: cid,
          orderId,
          customerId: Number(order.customer_id),
          periodStart: coverage.startAt,
          periodEnd: coverage.endAt,
          billingReason: "pickup_proration",
          lineEntries: [entry],
          feeEntries: fees,
          generalNotes,
          timeZone: billingTimeZone,
          invoiceDateMode: settings.invoice_date_mode,
          taxConfig,
        });
      if (invoice) {
        created.push({ ...invoice, orderId });
        await insertInvoiceAudit({
          client,
          companyId: cid,
          orderId,
          invoice,
          reason: "pickup_proration",
          lineEntries: [entry],
          actorName,
          actorEmail,
          action: "invoice_created",
        });
      }
    }

    await client.query("COMMIT");
    return { created, updated };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createReturnBillingForLineItem({
  companyId,
  lineItemId,
  returned,
  actorName = null,
  actorEmail = null,
} = {}) {
  const cid = Number(companyId);
  const liid = Number(lineItemId);
  if (!Number.isFinite(cid) || !Number.isFinite(liid)) throw new Error("companyId and lineItemId are required.");

  const client = await pool.connect();
  const created = [];
  let updated = null;

  try {
    await client.query("BEGIN");
    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";
    const autoRun = normalizeInvoiceAutoRun(settings?.invoice_auto_run);
    if (autoRun === "monthly" && !returned) {
      await client.query("ROLLBACK");
      return { created, updated };
    }
    const line = await fetchLineItemForBilling(client, liid);
    if (!line || !line.fulfilled_at) {
      await client.query("ROLLBACK");
      return { created };
    }
    const orderId = Number(line.rental_order_id);

    const lineDates = normalizeLineBillingDates(line);
    if (!lineDates) {
      await client.query("ROLLBACK");
      return { created };
    }

    const eventIso = returned ? normalizeTimestamptz(line.returned_at) : normalizeTimestamptz(new Date().toISOString());
    if (!eventIso) {
      await client.query("ROLLBACK");
      return { created };
    }
    const period = monthRangeForDate(eventIso, billingTimeZone);
    if (!period) {
      await client.query("ROLLBACK");
      return { created };
    }

    const lineEndForCredit = returned ? (normalizeTimestamptz(line.end_at) || lineDates.lineEnd) : lineDates.lineEnd;
    const coverage = overlapRange({
      startAt: eventIso,
      endAt: lineEndForCredit,
      rangeStart: period.startAt,
      rangeEnd: period.endAt,
    });
    if (!coverage) {
      await client.query("ROLLBACK");
      return { created };
    }

    const draftInvoice = await findDraftInvoiceCoveringDate(client, cid, orderId, eventIso);
    if (draftInvoice) {
      const updatedDraft = await rebuildDraftInvoiceLineItemsForLineItem({
        client,
        invoice: draftInvoice,
        line,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
        timeZone: billingTimeZone,
        taxConfig,
      });
      if (updatedDraft) {
        updated = {
          id: Number(draftInvoice.id),
          invoiceNumber: draftInvoice.invoice_number,
          periodStart: draftInvoice.service_period_start || draftInvoice.period_start,
          periodEnd: draftInvoice.service_period_end || draftInvoice.period_end,
        };
        await insertInvoiceAudit({
          client,
          companyId: cid,
          orderId,
          invoice: updated,
          reason: returned ? "return_credit" : "resume_charge",
          summaryPrefix: `Updated draft invoice ${draftInvoice.invoice_number || `#${draftInvoice.id}`} (${returned ? "Return adjustment" : "Resume adjustment"}).`,
          lineEntries: [],
          actorName,
          actorEmail,
          action: "invoice_updated",
        });
      }
      await client.query("COMMIT");
      return { created, updated };
    }

    const reason = returned ? "return_credit" : "resume_charge";
    const already = await hasInvoiceLineItemCoverage({
      client,
      companyId: cid,
      lineItemId: liid,
      coverageStart: coverage.startAt,
      coverageEnd: coverage.endAt,
      billingReason: reason,
      isCredit: returned,
    });
    if (already) {
      await client.query("COMMIT");
      return { created };
    }

    const pausePeriods = normalizePausePeriods(line.pause_periods);
    const entry = buildInvoiceLineEntry({
      line,
      coverageStart: coverage.startAt,
      coverageEnd: coverage.endAt,
      roundingMode: settings.billing_rounding_mode,
      roundingGranularity: settings.billing_rounding_granularity,
      monthlyProrationMethod: settings.monthly_proration_method,
      billingReason: reason,
      pausePeriods,
      isCredit: returned,
      descriptionPrefix: returned ? "Credit: " : "",
      timeZone: billingTimeZone,
    });
    if (!entry) {
      await client.query("ROLLBACK");
      return { created };
    }

    const orderRes = await client.query(
      `SELECT id, customer_id FROM rental_orders WHERE company_id = $1 AND id = $2 LIMIT 1`,
      [cid, orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      await client.query("ROLLBACK");
      return { created };
    }

        const includeMonthlyMethod = normalizeRateBasis(line.rate_basis) === "monthly";
        const prorationNotes = buildProrationNotes({
          periodStart: coverage.startAt,
          periodEnd: coverage.endAt,
          timeZone: billingTimeZone,
          roundingMode: settings.billing_rounding_mode,
          roundingGranularity: settings.billing_rounding_granularity,
          monthlyProrationMethod: settings.monthly_proration_method,
          includeMonthlyMethod,
        });
        const generalNotes = [generalNotesForBillingReason(reason), prorationNotes].filter(Boolean).join("\n");
    const invoice = await createInvoiceWithEntries({
      client,
      companyId: cid,
      orderId,
      customerId: Number(order.customer_id),
      periodStart: coverage.startAt,
      periodEnd: coverage.endAt,
      billingReason: reason,
      lineEntries: [entry],
      feeEntries: [],
      generalNotes,
      documentType: returned ? "credit_memo" : "invoice",
      timeZone: billingTimeZone,
      invoiceDateMode: settings.invoice_date_mode,
      taxConfig,
    });
    if (invoice) {
      created.push({ ...invoice, orderId });
      await insertInvoiceAudit({
        client,
        companyId: cid,
        orderId,
        invoice,
        reason,
        lineEntries: [entry],
        actorName,
        actorEmail,
        action: returned ? "invoice_credit" : "invoice_created",
        summaryPrefix: returned
          ? `Created credit ${invoice.invoiceNumber || `#${invoice.id}`} (${billingReasonLabel(reason)}).`
          : undefined,
      });
    }

    await client.query("COMMIT");
    return { created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createPauseBillingAdjustments({
  companyId,
  lineItemIds,
  startAt = null,
  endAt = null,
  workOrderNumber = null,
  actorName = "System",
  actorEmail = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid)) throw new Error("companyId is required.");
  const lineIds = Array.isArray(lineItemIds) ? lineItemIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)) : [];
  if (!lineIds.length) return { created: [], updated: [] };

  const startIso = startAt ? normalizeTimestamptz(startAt) : null;
  const endIso = endAt ? normalizeTimestamptz(endAt) : null;
  const isPauseStart = !!startIso;
  const isPauseEnd = !startIso && !!endIso;

  if (!isPauseStart && !isPauseEnd) return { created: [], updated: [] };

  const client = await pool.connect();
  const created = [];
  const updated = [];

  try {
    await client.query("BEGIN");
    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";
    const autoRun = normalizeInvoiceAutoRun(settings?.invoice_auto_run);
    const monthlyMode = autoRun === "monthly";

    for (const lineItemId of lineIds) {
      const line = await fetchLineItemForBilling(client, lineItemId);
      if (!line || !line.fulfilled_at) continue;
      const orderId = Number(line.rental_order_id);
      const lineDates = normalizeLineBillingDates(line);
      if (!lineDates) continue;

      const eventIso = isPauseStart ? startIso : endIso;
      const period = monthRangeForDate(eventIso, billingTimeZone);
      if (!period) continue;

      const pausePeriods = normalizePausePeriods(line.pause_periods, { allowOpen: true });
      const matchWorkOrder = String(workOrderNumber || "").trim();
      const findMatchingPause = () => {
        if (!pausePeriods.length || !endIso) return null;
        const exact = pausePeriods.find((p) => {
          if (!p.endAt || p.endAt !== endIso) return false;
          if (!matchWorkOrder) return true;
          return p.source === "work_order" && p.workOrderNumber === matchWorkOrder;
        });
        if (exact) return exact;
        return pausePeriods.find((p) => p.endAt === endIso) || null;
      };

      let coverage = null;
      let pauseEndReason = null;
      if (monthlyMode && isPauseStart) {
        // In monthly advance billing, pause credits are issued at pause end or month boundary.
        const draftInvoice = await findDraftInvoiceCoveringDate(client, cid, orderId, eventIso);
        if (draftInvoice) {
          const updatedDraft = await rebuildDraftInvoiceLineItemsForLineItem({
            client,
            invoice: draftInvoice,
            line,
            roundingMode: settings.billing_rounding_mode,
            roundingGranularity: settings.billing_rounding_granularity,
            monthlyProrationMethod: settings.monthly_proration_method,
            timeZone: billingTimeZone,
            taxConfig,
          });
          if (updatedDraft) {
            updated.push({
              id: Number(draftInvoice.id),
              invoiceNumber: draftInvoice.invoice_number,
              periodStart: draftInvoice.service_period_start || draftInvoice.period_start,
              periodEnd: draftInvoice.service_period_end || draftInvoice.period_end,
            });
            await insertInvoiceAudit({
              client,
              companyId: cid,
              orderId,
              invoice: draftInvoice,
              reason: "pause_credit",
              summaryPrefix: `Updated draft invoice ${draftInvoice.invoice_number || `#${draftInvoice.id}`} (Pause adjustment).`,
              lineEntries: [],
              actorName,
              actorEmail,
              action: "invoice_updated",
            });
          }
        }
        continue;
      }

      if (monthlyMode && isPauseEnd) {
        const matchedPause = findMatchingPause();
        if (!matchedPause?.startAt) continue;
        const invoiceRes = await client.query(
          `
          SELECT id, created_at
            FROM invoices
           WHERE company_id = $1
             AND rental_order_id = $2
             AND (
               (service_period_start = $3::timestamptz AND service_period_end = $4::timestamptz)
               OR (service_period_start IS NULL AND period_start = $3::timestamptz AND period_end = $4::timestamptz)
             )
             AND document_type = 'invoice'
           LIMIT 1
          `,
          [cid, orderId, period.startAt, period.endAt]
        );
        const invoiceRow = invoiceRes.rows?.[0] || null;
        if (!invoiceRow) continue;
        const invoiceCreatedMs = Date.parse(invoiceRow.created_at);
        const pauseStartMs = Date.parse(matchedPause.startAt);
        if (!Number.isFinite(pauseStartMs)) continue;

        const billedBeforePause = Number.isFinite(invoiceCreatedMs) && invoiceCreatedMs < pauseStartMs;
        if (billedBeforePause) {
          pauseEndReason = "pause_credit";
          const rawCoverage = overlapRange({
            startAt: matchedPause.startAt,
            endAt: endIso,
            rangeStart: period.startAt,
            rangeEnd: period.endAt,
          });
          if (rawCoverage) {
            coverage = overlapRange({
              startAt: rawCoverage.startAt,
              endAt: rawCoverage.endAt,
              rangeStart: lineDates.lineStart,
              rangeEnd: lineDates.lineEnd,
            });
          }
        } else {
          pauseEndReason = "resume_charge";
          coverage = overlapRange({
            startAt: endIso,
            endAt: lineDates.lineEnd,
            rangeStart: period.startAt,
            rangeEnd: period.endAt,
          });
        }
      } else {
        let pauseStart = isPauseStart ? startIso : null;
        let pauseEnd = isPauseStart ? (endIso || period.endAt) : null;
        if (isPauseStart) {
          coverage = overlapRange({ startAt: pauseStart, endAt: pauseEnd, rangeStart: lineDates.lineStart, rangeEnd: lineDates.lineEnd });
          if (coverage) {
            coverage = overlapRange({ startAt: coverage.startAt, endAt: coverage.endAt, rangeStart: period.startAt, rangeEnd: period.endAt });
          }
        } else if (isPauseEnd) {
          coverage = overlapRange({ startAt: endIso, endAt: lineDates.lineEnd, rangeStart: period.startAt, rangeEnd: period.endAt });
        }
      }
      if (!coverage) continue;

      const draftInvoice = await findDraftInvoiceCoveringDate(client, cid, orderId, eventIso);
      if (draftInvoice) {
        const updatedDraft = await rebuildDraftInvoiceLineItemsForLineItem({
          client,
          invoice: draftInvoice,
          line,
          roundingMode: settings.billing_rounding_mode,
          roundingGranularity: settings.billing_rounding_granularity,
          monthlyProrationMethod: settings.monthly_proration_method,
          timeZone: billingTimeZone,
          taxConfig,
        });
        if (updatedDraft) {
          updated.push({
            id: Number(draftInvoice.id),
            invoiceNumber: draftInvoice.invoice_number,
            periodStart: draftInvoice.service_period_start || draftInvoice.period_start,
            periodEnd: draftInvoice.service_period_end || draftInvoice.period_end,
          });
          await insertInvoiceAudit({
            client,
            companyId: cid,
            orderId,
            invoice: draftInvoice,
            reason: isPauseStart ? "pause_credit" : "resume_charge",
            summaryPrefix: `Updated draft invoice ${draftInvoice.invoice_number || `#${draftInvoice.id}`} (${isPauseStart ? "Pause adjustment" : "Resume adjustment"}).`,
            lineEntries: [],
            actorName,
            actorEmail,
            action: "invoice_updated",
          });
        }
        continue;
      }

      const reason = monthlyMode && isPauseEnd
        ? (pauseEndReason || "resume_charge")
        : isPauseStart ? "pause_credit" : "resume_charge";
      const isCredit = reason === "pause_credit";
      const already = await hasInvoiceLineItemCoverage({
        client,
        companyId: cid,
        lineItemId,
        coverageStart: coverage.startAt,
        coverageEnd: coverage.endAt,
        billingReason: reason,
        isCredit,
      });
      if (already) continue;

      let filteredPauses = pausePeriods;
      if ((isPauseStart || (monthlyMode && isPauseEnd)) && startIso) {
        filteredPauses = pausePeriods.filter((p) => {
          if (p.startAt !== startIso) return true;
          if (!matchWorkOrder) return false;
          return !(p.source === "work_order" && p.workOrderNumber === matchWorkOrder);
        });
      } else if (monthlyMode && isPauseEnd && endIso) {
        filteredPauses = pausePeriods.filter((p) => p.endAt !== endIso);
      }

      const entry = buildInvoiceLineEntry({
        line,
        coverageStart: coverage.startAt,
        coverageEnd: coverage.endAt,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
        billingReason: reason,
        pausePeriods: filteredPauses,
        isCredit,
        descriptionPrefix: isCredit ? "Credit: " : "",
        timeZone: billingTimeZone,
      });
      if (!entry) continue;

      const orderRes = await client.query(
        `SELECT id, customer_id FROM rental_orders WHERE company_id = $1 AND id = $2 LIMIT 1`,
        [cid, orderId]
      );
      const order = orderRes.rows[0];
      if (!order) continue;

      const includeMonthlyMethod = normalizeRateBasis(line.rate_basis) === "monthly";
      const prorationNotes = buildProrationNotes({
        periodStart: coverage.startAt,
        periodEnd: coverage.endAt,
        timeZone: billingTimeZone,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
        includeMonthlyMethod,
      });
      const generalNotes = [generalNotesForBillingReason(reason), prorationNotes].filter(Boolean).join("\n");
      const invoice = await createInvoiceWithEntries({
        client,
        companyId: cid,
        orderId,
        customerId: Number(order.customer_id),
        periodStart: coverage.startAt,
        periodEnd: coverage.endAt,
        billingReason: reason,
        lineEntries: [entry],
        feeEntries: [],
        generalNotes,
        documentType: isCredit ? "credit_memo" : "invoice",
        timeZone: billingTimeZone,
        invoiceDateMode: settings.invoice_date_mode,
        taxConfig,
      });
      if (invoice) {
        created.push({ ...invoice, orderId });
        await insertInvoiceAudit({
          client,
          companyId: cid,
          orderId,
          invoice,
          reason,
          lineEntries: [entry],
          actorName,
          actorEmail,
          action: isCredit ? "invoice_credit" : "invoice_created",
          summaryPrefix: isCredit
            ? `Created credit ${invoice.invoiceNumber || `#${invoice.id}`} (${billingReasonLabel(reason)}).`
            : undefined,
        });
      }
    }

    await client.query("COMMIT");
    return { created, updated };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listCompaniesWithMonthlyAutoRun() {
  const res = await pool.query(
    `SELECT company_id FROM company_settings WHERE invoice_auto_run = 'monthly'`
  );
  return res.rows.map((r) => Number(r.company_id)).filter((id) => Number.isFinite(id));
}

function formatRoundingNote({ roundingMode, roundingGranularity } = {}) {
  const mode = normalizeBillingRoundingMode(roundingMode);
  const granularity = normalizeBillingRoundingGranularity(roundingGranularity);
  if (mode === "none") return "Rounding: exact time (no rounding).";
  const modeLabel = mode === "ceil" ? "Round up" : mode === "floor" ? "Round down" : "Round to nearest";
  const granLabel = granularity === "unit" ? "billing unit" : granularity;
  return `Rounding: ${modeLabel} to ${granLabel}.`;
}

function formatMonthlyProrationNote(method) {
  const normalized = normalizeMonthlyProrationMethod(method);
  if (normalized === "days") {
    return "Monthly proration: day-based (partial days count as full days).";
  }
  return "Monthly proration: hours-based.";
}

function buildProrationNotes({
  periodStart,
  periodEnd,
  timeZone,
  roundingMode,
  roundingGranularity,
  monthlyProrationMethod,
  includeMonthlyMethod = false,
} = {}) {
  const notes = [];
  const periodLabel = formatPeriodLabel(periodStart, periodEnd, timeZone);
  if (periodLabel) notes.push(`Service period: ${periodLabel}.`);
  const roundingNote = formatRoundingNote({ roundingMode, roundingGranularity });
  if (roundingNote) notes.push(roundingNote);
  if (includeMonthlyMethod) {
    const monthlyNote = formatMonthlyProrationNote(monthlyProrationMethod);
    if (monthlyNote) notes.push(monthlyNote);
  }
  return notes.join("\n");
}

function buildMonthlyInvoiceNotes({
  period,
  lines,
  feesCount,
  timeZone,
  roundingMode,
  roundingGranularity,
  monthlyProrationMethod,
} = {}) {
  const periodLabel = formatPeriodLabel(period?.startAt, period?.endAt, timeZone);
  const notes = [`Monthly billing in advance for ${periodLabel || "the upcoming period"}.`];
  if (!Array.isArray(lines) || !lines.length) {
    if (feesCount) notes.push("Order-level fees billed this period.");
    const roundingNote = formatRoundingNote({ roundingMode, roundingGranularity });
    if (roundingNote) notes.push(roundingNote);
    const monthlyNote = formatMonthlyProrationNote(monthlyProrationMethod);
    if (monthlyNote) notes.push(monthlyNote);
    return notes.join("\n");
  }

  notes.push("Line item activity:");
  for (const line of lines) {
    const qty = Number(line.qty || 0);
    const typeName = String(line.type_name || "Item");
    const label = qty > 1 ? `${typeName} x${qty}` : typeName;
    const events = [];

    const fulfilledIso = normalizeTimestamptz(line.fulfilled_at);
    if (fulfilledIso) {
      const ms = Date.parse(fulfilledIso);
      if (Number.isFinite(ms) && ms >= Date.parse(period.startAt) && ms < Date.parse(period.endAt)) {
        const localDate = formatDateInTimeZone(fulfilledIso, timeZone) || isoDate(fulfilledIso);
        events.push(`picked up ${localDate}`);
      }
    }

    const returnedIso = normalizeTimestamptz(line.returned_at);
    if (returnedIso) {
      const ms = Date.parse(returnedIso);
      if (Number.isFinite(ms) && ms >= Date.parse(period.startAt) && ms < Date.parse(period.endAt)) {
        const localDate = formatDateInTimeZone(returnedIso, timeZone) || isoDate(returnedIso);
        events.push(`returned ${localDate}`);
      }
    }

    const pausePeriods = normalizePausePeriods(line.pause_periods, { allowOpen: true });
    if (pausePeriods.length) {
      const pauseInfo = collectPauseOverlap({ pausePeriods, startAt: period.startAt, endAt: period.endAt });
      if (pauseInfo?.totalMs > 0) {
        const pauseDuration = formatDurationDays(pauseInfo.totalMs);
        const ranges = pausePeriods
          .map((pause) => {
            const overlap = overlapRange({
              startAt: pause.startAt,
              endAt: pause.endAt || period.endAt,
              rangeStart: period.startAt,
              rangeEnd: period.endAt,
            });
            if (!overlap) return null;
            const rangeLabel = formatPeriodLabel(overlap.startAt, overlap.endAt, timeZone);
            if (!rangeLabel) return null;
            const workOrderLabel = pause.workOrderNumber ? ` (WO ${pause.workOrderNumber})` : "";
            return `${rangeLabel}${workOrderLabel}`;
          })
          .filter(Boolean);
        const rangeNote = ranges.length ? `: ${ranges.join("; ")}` : "";
        events.push(`paused ${pauseDuration}${rangeNote}`);
      }
    }

    if (!events.length) events.push("active during period");
    notes.push(`- ${label}: ${events.join("; ")}`);
  }

  if (feesCount) notes.push("Order-level fees billed this period.");
  const roundingNote = formatRoundingNote({ roundingMode, roundingGranularity });
  if (roundingNote) notes.push(roundingNote);
  const monthlyNote = formatMonthlyProrationNote(monthlyProrationMethod);
  if (monthlyNote) notes.push(monthlyNote);
  return notes.join("\n");
}

async function generateMonthlyInvoicesForCompany({ companyId, runDate = null } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid)) throw new Error("companyId is required.");
  const runIso = normalizeTimestamptz(runDate || new Date().toISOString());
  if (!runIso) throw new Error("Invalid runDate.");

  const client = await pool.connect();
  const created = [];
  let runId = null;

  try {
    await client.query("BEGIN");
    const settings = await getCompanySettingsForClient(client, cid);
    const taxConfig = buildTaxConfig(settings);
    const billingTimeZone = settings?.billing_timezone || "UTC";

    const period = monthRangeForDate(runIso, billingTimeZone);
    if (!period) throw new Error("Unable to determine billing period.");
    const runMonth = formatDateInTimeZone(period.startAt, billingTimeZone) || isoDate(period.startAt);
    if (!runMonth) throw new Error("Unable to determine run month.");

    const runRes = await client.query(
      `
      INSERT INTO billing_runs (company_id, run_month, status, started_at)
      VALUES ($1, $2::date, 'running', NOW())
      ON CONFLICT (company_id, run_month) DO NOTHING
      RETURNING id
      `,
      [cid, runMonth]
    );
    runId = runRes.rows?.[0]?.id || null;
    if (!runId) {
      await client.query("ROLLBACK");
      return { companyId: cid, created: [], skipped: true };
    }

    const ordersRes = await client.query(
      `SELECT id, customer_id FROM rental_orders WHERE company_id = $1 AND status = 'ordered' ORDER BY id ASC`,
      [cid]
    );

    for (const row of ordersRes.rows) {
      const orderId = Number(row.id);
      const existingMonthlyRes = await client.query(
        `
        SELECT id, created_at
          FROM invoices
         WHERE company_id = $1
           AND rental_order_id = $2
            AND (
              (service_period_start = $3::timestamptz AND service_period_end = $4::timestamptz)
              OR (service_period_start IS NULL AND period_start = $3::timestamptz AND period_end = $4::timestamptz)
            )
            AND document_type = 'invoice'
         LIMIT 1
        `,
        [cid, orderId, period.startAt, period.endAt]
      );
      if (existingMonthlyRes.rows[0]) {
        const invoiceCreatedMs = Date.parse(existingMonthlyRes.rows[0].created_at);
        const pauseCreditEntries = [];
        const linesRes = await client.query(
          `
          SELECT li.id,
                 et.name AS type_name,
                 li.start_at,
                 li.end_at,
                 li.fulfilled_at,
                 li.returned_at,
                 li.rate_basis,
                 li.rate_amount,
                 cond.pause_periods,
                 (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
            FROM rental_order_line_items li
            JOIN equipment_types et ON et.id = li.type_id
       LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
           WHERE li.rental_order_id = $1
             AND li.fulfilled_at IS NOT NULL
             AND (li.returned_at IS NULL OR li.returned_at > $2::timestamptz)
          `,
          [orderId, period.startAt]
        );

        for (const line of linesRes.rows) {
          const lineDates = normalizeLineBillingDates(line);
          if (!lineDates) continue;
          const pausePeriods = normalizePausePeriods(line.pause_periods, { allowOpen: true });
          if (!pausePeriods.length) continue;

          for (const pause of pausePeriods) {
            if (!pause?.startAt) continue;
            const pauseStartMs = Date.parse(pause.startAt);
            const periodStartMs = Date.parse(period.startAt);
            const periodEndMs = Date.parse(period.endAt);
            if (!Number.isFinite(pauseStartMs) || !Number.isFinite(periodStartMs) || !Number.isFinite(periodEndMs)) continue;
            if (Number.isFinite(invoiceCreatedMs) && pauseStartMs <= invoiceCreatedMs) continue;
            const pauseEndIso = pause.endAt || null;
            const pauseEndMs = pauseEndIso ? Date.parse(pauseEndIso) : null;

            const rawOverlap = overlapRange({
              startAt: pause.startAt,
              endAt: pause.endAt || period.endAt,
              rangeStart: period.startAt,
              rangeEnd: period.endAt,
            });
            if (!rawOverlap) continue;
            const overlap = overlapRange({
              startAt: rawOverlap.startAt,
              endAt: rawOverlap.endAt,
              rangeStart: lineDates.lineStart,
              rangeEnd: lineDates.lineEnd,
            });
            if (!overlap) continue;

            const already = await hasInvoiceLineItemCoverage({
              client,
              companyId: cid,
              lineItemId: line.id,
              coverageStart: overlap.startAt,
              coverageEnd: overlap.endAt,
              billingReason: "pause_credit",
              isCredit: true,
            });
            if (already) continue;

            const filteredPauses = pausePeriods.filter((p) => !(
              p.startAt === pause.startAt
              && (p.endAt || null) === (pause.endAt || null)
              && (p.source || null) === (pause.source || null)
              && (p.workOrderNumber || null) === (pause.workOrderNumber || null)
            ));

            const entry = buildInvoiceLineEntry({
              line,
              coverageStart: overlap.startAt,
              coverageEnd: overlap.endAt,
              roundingMode: settings.billing_rounding_mode,
              roundingGranularity: settings.billing_rounding_granularity,
              monthlyProrationMethod: settings.monthly_proration_method,
              billingReason: "pause_credit",
              pausePeriods: filteredPauses,
              isCredit: true,
              descriptionPrefix: "Credit: ",
              timeZone: billingTimeZone,
            });
            if (entry) pauseCreditEntries.push(entry);
          }
        }

        if (pauseCreditEntries.length) {
          const includeMonthlyMethod = linesRes.rows.some((li) => normalizeRateBasis(li.rate_basis) === "monthly");
          const prorationNotes = buildProrationNotes({
            periodStart: period.startAt,
            periodEnd: period.endAt,
            timeZone: billingTimeZone,
            roundingMode: settings.billing_rounding_mode,
            roundingGranularity: settings.billing_rounding_granularity,
            monthlyProrationMethod: settings.monthly_proration_method,
            includeMonthlyMethod,
          });
          const generalNotes = [generalNotesForBillingReason("pause_credit"), prorationNotes].filter(Boolean).join("\n");
          const creditInvoice = await createInvoiceWithEntries({
            client,
            companyId: cid,
            orderId,
            customerId: Number(row.customer_id),
            periodStart: period.startAt,
            periodEnd: period.endAt,
            billingReason: "pause_credit",
            lineEntries: pauseCreditEntries,
            feeEntries: [],
            generalNotes,
            documentType: "credit_memo",
            timeZone: billingTimeZone,
            invoiceDateMode: settings.invoice_date_mode,
            taxConfig,
          });
          if (creditInvoice) {
            created.push({ ...creditInvoice, orderId });
            await insertInvoiceAudit({
              client,
              companyId: cid,
              orderId,
              invoice: creditInvoice,
              reason: "pause_credit",
              lineEntries: pauseCreditEntries,
              actorName: "System",
              actorEmail: null,
              action: "invoice_credit",
              summaryPrefix: `Created credit ${creditInvoice.invoiceNumber || `#${creditInvoice.id}`} (Pause credit).`,
            });
          }
        }
        continue;
      }

      const billedRes = await client.query(
        `
        SELECT i.id
          FROM invoices i
          JOIN invoice_line_items ili ON ili.invoice_id = i.id
         WHERE i.company_id = $1
           AND i.rental_order_id = $2
            AND COALESCE(i.service_period_start, i.period_start) IS NOT NULL
            AND COALESCE(i.service_period_start, i.period_start) >= $3::timestamptz
            AND COALESCE(i.service_period_start, i.period_start) < $4::timestamptz
         GROUP BY i.id
        HAVING COALESCE(SUM(ili.amount), 0) > 0
         LIMIT 1
        `,
        [cid, orderId, period.startAt, period.endAt]
      );
      if (billedRes.rows[0]) continue;

      const linesRes = await client.query(
        `
        SELECT li.id,
               et.name AS type_name,
               li.start_at,
               li.end_at,
               li.fulfilled_at,
               li.returned_at,
               li.rate_basis,
               li.rate_amount,
               cond.pause_periods,
               (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
          FROM rental_order_line_items li
          JOIN equipment_types et ON et.id = li.type_id
     LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
         WHERE li.rental_order_id = $1
           AND li.fulfilled_at IS NOT NULL
           AND (li.returned_at IS NULL OR li.returned_at > $2::timestamptz)
        `,
        [orderId, period.startAt]
      );

      const lineEntries = [];
      const billedLines = [];
      for (const line of linesRes.rows) {
        const lineStart = normalizeTimestamptz(line.fulfilled_at || line.start_at);
        const bookedEnd = normalizeTimestamptz(line.end_at);
        const returnedEnd = normalizeTimestamptz(line.returned_at);
        if (!lineStart || (!bookedEnd && !returnedEnd)) continue;
        let lineEnd = returnedEnd || bookedEnd;
        const overdue = !returnedEnd && bookedEnd && Date.parse(runIso) > Date.parse(bookedEnd);
        if (overdue) {
          const periodEnd = normalizeTimestamptz(period.endAt);
          if (periodEnd && Date.parse(periodEnd) > Date.parse(lineEnd)) {
            lineEnd = periodEnd;
          }
        }
        if (!lineEnd || Date.parse(lineEnd) <= Date.parse(lineStart)) continue;
        const overlap = overlapRange({
          startAt: lineStart,
          endAt: lineEnd,
          rangeStart: period.startAt,
          rangeEnd: period.endAt,
        });
        if (!overlap) continue;
        const pausePeriods = normalizePausePeriods(line.pause_periods);
        const entry = buildInvoiceLineEntry({
          line,
          coverageStart: overlap.startAt,
          coverageEnd: overlap.endAt,
          roundingMode: settings.billing_rounding_mode,
          roundingGranularity: settings.billing_rounding_granularity,
          monthlyProrationMethod: settings.monthly_proration_method,
          billingReason: "monthly",
          pausePeriods,
          timeZone: billingTimeZone,
        });
        if (entry) {
          lineEntries.push(entry);
          billedLines.push(line);
        }
      }

      const fees = await collectUninvoicedFeesForOrder(client, cid, orderId);
      if (!lineEntries.length && !fees.length) continue;
      const generalNotes = buildMonthlyInvoiceNotes({
        period,
        lines: billedLines,
        feesCount: fees.length,
        timeZone: billingTimeZone,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
      });

      const invoice = await createInvoiceWithEntries({
        client,
        companyId: cid,
        orderId,
        customerId: Number(row.customer_id),
        periodStart: period.startAt,
        periodEnd: period.endAt,
        billingReason: "monthly",
        lineEntries,
        feeEntries: fees,
        generalNotes,
        timeZone: billingTimeZone,
        invoiceDateMode: settings.invoice_date_mode,
        taxConfig,
      });
      if (invoice) {
        created.push({ ...invoice, orderId });
        await insertInvoiceAudit({
          client,
          companyId: cid,
          orderId,
          invoice,
          reason: "monthly",
          lineEntries,
          actorName: "System",
          actorEmail: null,
          action: "invoice_created",
        });
      }
    }

    await client.query(
      `UPDATE billing_runs SET status = 'completed', completed_at = NOW() WHERE id = $1`,
      [runId]
    );
    await client.query("COMMIT");
    return { companyId: cid, created };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function collectPauseOverlap({ pausePeriods, startAt, endAt }) {
  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) return { totalMs: 0, segments: [] };
  const rangeStart = Date.parse(startIso);
  const rangeEnd = Date.parse(endIso);
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd) || rangeEnd <= rangeStart) {
    return { totalMs: 0, segments: [] };
  }

  const normalized = normalizePausePeriods(pausePeriods);
  if (!normalized.length) return { totalMs: 0, segments: [] };

  const overlaps = [];
  for (const pause of normalized) {
    const pauseStart = Date.parse(pause.startAt);
    const pauseEnd = pause.endAt ? Date.parse(pause.endAt) : rangeEnd;
    if (!Number.isFinite(pauseStart) || !Number.isFinite(pauseEnd) || pauseEnd <= pauseStart) continue;
    const overlapStart = Math.max(rangeStart, pauseStart);
    const overlapEnd = Math.min(rangeEnd, pauseEnd);
    if (overlapEnd > overlapStart) overlaps.push([overlapStart, overlapEnd]);
  }

  if (!overlaps.length) return { totalMs: 0, segments: [] };
  overlaps.sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const range of overlaps) {
    const last = merged[merged.length - 1];
    if (!last || range[0] > last[1]) {
      merged.push([range[0], range[1]]);
    } else {
      last[1] = Math.max(last[1], range[1]);
    }
  }

  const segments = merged.map(([start, end]) => ({
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    durationMs: end - start,
  }));
  const totalMs = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
  return { totalMs, segments };
}

function formatDurationDays(ms) {
  const days = ms / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(days) || days <= 0) return "0d";
  const rounded = Math.round(days * 100) / 100;
  return `${rounded}d`;
}

function applyRoundingValue(value, mode) {
  const n = Number(value);
  if (!Number.isFinite(n)) return n;
  const normalized = normalizeBillingRoundingMode(mode);
  if (normalized === "none") return n;
  if (normalized === "ceil") return Math.ceil(n - 1e-9);
  if (normalized === "floor") return Math.floor(n + 1e-9);
  return Math.round(n);
}

function applyDurationRoundingMs({ activeMs, roundingMode, roundingGranularity }) {
  const mode = normalizeBillingRoundingMode(roundingMode);
  if (mode === "none") return activeMs;
  const granularity = normalizeBillingRoundingGranularity(roundingGranularity);
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  if (granularity === "hour") {
    const hours = applyRoundingValue(activeMs / hourMs, mode);
    return Math.max(0, hours) * hourMs;
  }
  if (granularity === "day") {
    const days = applyRoundingValue(activeMs / dayMs, mode);
    return Math.max(0, days) * dayMs;
  }
  return activeMs;
}

function splitIntoCalendarMonths({ startAt, endAt }) {
  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) return [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const segments = [];
  let cursor = start;
  while (cursor < end) {
    const y = cursor.getUTCFullYear();
    const m = cursor.getUTCMonth();
    const nextMonthStart = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
    const segmentEnd = nextMonthStart < end ? nextMonthStart : end;
    segments.push({
      startAt: cursor.toISOString(),
      endAt: segmentEnd.toISOString(),
      daysInMonth: daysInMonthUTC(y, m),
    });
    cursor = segmentEnd;
  }
  return segments;
}

function computeMonthlyUnits({
  startAt,
  endAt,
  pausePeriods = null,
  prorationMethod = null,
  roundingMode = null,
  roundingGranularity = null,
} = {}) {
  const segments = splitIntoCalendarMonths({ startAt, endAt });
  if (!segments.length) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const method = normalizeMonthlyProrationMethod(prorationMethod);
  const mode = normalizeBillingRoundingMode(roundingMode);
  const granularity = normalizeBillingRoundingGranularity(roundingGranularity);
  let units = 0;
  for (const segment of segments) {
    const segmentStart = Date.parse(segment.startAt);
    const segmentEnd = Date.parse(segment.endAt);
    if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd) || segmentEnd <= segmentStart) continue;
    let activeMs = segmentEnd - segmentStart;
    if (pausePeriods) {
      const pauseInfo = collectPauseOverlap({
        pausePeriods,
        startAt: segment.startAt,
        endAt: segment.endAt,
      });
      activeMs = Math.max(0, activeMs - (pauseInfo?.totalMs || 0));
    }
    if (activeMs <= 0) continue;
    const adjustedMs =
      mode !== "none" && (granularity === "hour" || granularity === "day")
        ? applyDurationRoundingMs({
            activeMs,
            roundingMode: mode,
            roundingGranularity: granularity,
          })
        : activeMs;
    if (adjustedMs <= 0) continue;
    if (method === "days") {
      let days = adjustedMs / dayMs;
      if (mode === "none" || granularity !== "day") {
        days = Math.ceil(days - 1e-9);
      }
      units += days / segment.daysInMonth;
    } else {
      units += adjustedMs / (segment.daysInMonth * dayMs);
    }
  }
  if (!Number.isFinite(units) || units <= 0) return null;
  return units;
}

function computeBillableUnits({
  startAt,
  endAt,
  rateBasis,
  roundingMode,
  roundingGranularity = null,
  monthlyProrationMethod = null,
  pausePeriods = null,
} = {}) {
  const start = normalizeTimestamptz(startAt);
  const end = normalizeTimestamptz(endAt);
  const basis = normalizeRateBasis(rateBasis);
  if (!start || !end || !basis) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  let raw;
  const mode = normalizeBillingRoundingMode(roundingMode);
  const granularity = normalizeBillingRoundingGranularity(roundingGranularity);
  if (basis === "monthly") {
    raw = computeMonthlyUnits({
      startAt: start,
      endAt: end,
      pausePeriods,
      prorationMethod: monthlyProrationMethod,
      roundingMode: mode,
      roundingGranularity: granularity,
    });
  } else {
    const periodDays = billingPeriodDays(basis);
    if (!periodDays) return null;
    const pauseInfo = pausePeriods ? collectPauseOverlap({ pausePeriods, startAt: start, endAt: end }) : null;
    const pausedMs = pauseInfo?.totalMs || 0;
    const activeMs = Math.max(0, endMs - startMs - pausedMs);
    if (!Number.isFinite(activeMs) || activeMs <= 0) return null;
    const days = activeMs / (24 * 60 * 60 * 1000);
    if (mode !== "none" && (granularity === "hour" || granularity === "day")) {
      const adjustedMs = applyDurationRoundingMs({
        activeMs,
        roundingMode: mode,
        roundingGranularity: granularity,
      });
      raw = (adjustedMs / (24 * 60 * 60 * 1000)) / periodDays;
    } else {
      raw = days / periodDays;
    }
  }
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  if (mode === "none") return raw;
  if (granularity !== "unit") return raw;
  return applyRoundingValue(raw, mode);
}

function normalizeInvoiceAutoRun(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "off" || v === "on_received" || v === "on_closed" || v === "monthly") return v;
  return "off";
}

function normalizeInvoiceGenerationMode(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "auto" || v === "monthly" || v === "single") return v;
  return "auto";
}

async function getCompanySettings(companyId) {
  const res = await pool.query(
    `SELECT company_id,
            billing_rounding_mode,
            billing_rounding_granularity,
            monthly_proration_method,
            billing_timezone,
            invoice_date_mode,
            default_payment_terms_days,
            logo_url,
            invoice_auto_run,
            invoice_auto_mode,
            tax_enabled,
            default_tax_rate,
            tax_registration_number,
            tax_inclusive_pricing,
            auto_apply_customer_credit,
            auto_work_order_on_return,
                required_storefront_customer_fields,
                rental_info_fields
     FROM company_settings
     WHERE company_id = $1
     LIMIT 1`,
    [companyId]
  );
  if (res.rows[0]) {
    return {
      company_id: Number(res.rows[0].company_id),
      billing_rounding_mode: normalizeBillingRoundingMode(res.rows[0].billing_rounding_mode),
      billing_rounding_granularity: normalizeBillingRoundingGranularity(res.rows[0].billing_rounding_granularity),
      monthly_proration_method: normalizeMonthlyProrationMethod(res.rows[0].monthly_proration_method),
      billing_timezone: normalizeBillingTimeZone(res.rows[0].billing_timezone),
      invoice_date_mode: normalizeInvoiceDateMode(res.rows[0].invoice_date_mode),
      default_payment_terms_days: res.rows[0].default_payment_terms_days === null || res.rows[0].default_payment_terms_days === undefined ? 30 : Number(res.rows[0].default_payment_terms_days),
      logo_url: res.rows[0].logo_url || null,
      invoice_auto_run: normalizeInvoiceAutoRun(res.rows[0].invoice_auto_run),
      invoice_auto_mode: normalizeInvoiceGenerationMode(res.rows[0].invoice_auto_mode),
      tax_enabled: res.rows[0].tax_enabled === true,
      default_tax_rate: Number(res.rows[0].default_tax_rate || 0),
      tax_registration_number: res.rows[0].tax_registration_number || null,
      tax_inclusive_pricing: res.rows[0].tax_inclusive_pricing === true,
      auto_apply_customer_credit: res.rows[0].auto_apply_customer_credit === true,
      auto_work_order_on_return: res.rows[0].auto_work_order_on_return === true,
        required_storefront_customer_fields: normalizeStorefrontCustomerRequirements(res.rows[0].required_storefront_customer_fields),
        rental_info_fields: normalizeRentalInfoFields(res.rows[0].rental_info_fields),
    };
  }
  return {
    company_id: Number(companyId),
    billing_rounding_mode: "ceil",
    billing_rounding_granularity: "unit",
    monthly_proration_method: "hours",
    billing_timezone: "UTC",
    invoice_date_mode: "generation",
    default_payment_terms_days: 30,
    logo_url: null,
    invoice_auto_run: "off",
    invoice_auto_mode: "auto",
    tax_enabled: false,
    default_tax_rate: 0,
    tax_registration_number: null,
    tax_inclusive_pricing: false,
    auto_apply_customer_credit: true,
    auto_work_order_on_return: false,
      required_storefront_customer_fields: [],
      rental_info_fields: normalizeRentalInfoFields(null),
  };
}

async function getCompanyEmailSettings(companyId) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    SELECT company_id,
           email_enabled,
           email_smtp_provider,
           email_smtp_host,
           email_smtp_port,
           email_smtp_secure,
           email_smtp_require_tls,
           email_smtp_user,
           email_smtp_pass,
           email_from_name,
           email_from_address,
           email_notify_request_submit,
           email_notify_status_updates,
           email_notify_invoices,
           updated_at
      FROM company_settings
     WHERE company_id = $1
     LIMIT 1
    `,
    [cid]
  );
  if (!res.rows[0]) {
    return {
      company_id: cid,
      email_enabled: false,
      email_smtp_provider: "custom",
      email_smtp_host: null,
      email_smtp_port: null,
      email_smtp_secure: false,
      email_smtp_require_tls: false,
      email_smtp_user: null,
      email_smtp_pass: null,
      email_from_name: null,
      email_from_address: null,
      email_notify_request_submit: true,
      email_notify_status_updates: true,
      email_notify_invoices: false,
      updated_at: null,
    };
  }
  return res.rows[0];
}

async function upsertCompanyEmailSettings({
  companyId,
  enabled,
  smtpProvider,
  smtpHost,
  smtpPort,
  smtpSecure,
  smtpRequireTls,
  smtpUser,
  smtpPass,
  fromName,
  fromAddress,
  notifyRequestSubmit,
  notifyStatusUpdates,
  notifyInvoices,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");

  const cleanProvider = String(smtpProvider || "custom").trim().toLowerCase() || "custom";
  const cleanHost = smtpHost === null || smtpHost === undefined ? null : String(smtpHost).trim() || null;
  const cleanPort = smtpPort === null || smtpPort === undefined || smtpPort === "" ? null : Number(smtpPort);
  const portValue = Number.isFinite(cleanPort) && cleanPort > 0 ? cleanPort : null;
  const secureValue = smtpSecure === true;
  const requireTlsValue = smtpRequireTls === true;
  const cleanUser = smtpUser === null || smtpUser === undefined ? null : String(smtpUser).trim() || null;
  const cleanPass = smtpPass === null || smtpPass === undefined ? null : String(smtpPass);
  const cleanFromName = fromName === null || fromName === undefined ? null : String(fromName).trim() || null;
  const cleanFromAddress = fromAddress === null || fromAddress === undefined ? null : normalizeEmail(fromAddress) || null;
  const enabledValue = enabled === true;
  const notifyRequestSubmitValue = notifyRequestSubmit !== false;
  const notifyStatusUpdatesValue = notifyStatusUpdates !== false;
  const notifyInvoicesValue = notifyInvoices === true;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO company_settings (company_id) VALUES ($1) ON CONFLICT (company_id) DO NOTHING`, [cid]);

    const currentRes = await client.query(
      `SELECT email_smtp_pass FROM company_settings WHERE company_id = $1 LIMIT 1 FOR UPDATE`,
      [cid]
    );
    const current = currentRes.rows[0] || {};
    const passToStore = cleanPass === "" || cleanPass === null ? current.email_smtp_pass || null : cleanPass;

    const res = await client.query(
      `
      UPDATE company_settings
         SET email_enabled = $1,
             email_smtp_provider = $2,
             email_smtp_host = $3,
             email_smtp_port = $4,
             email_smtp_secure = $5,
             email_smtp_require_tls = $6,
             email_smtp_user = $7,
             email_smtp_pass = $8,
             email_from_name = $9,
             email_from_address = $10,
             email_notify_request_submit = $11,
             email_notify_status_updates = $12,
             email_notify_invoices = $13,
             updated_at = NOW()
       WHERE company_id = $14
       RETURNING company_id,
                 email_enabled,
                 email_smtp_provider,
                 email_smtp_host,
                 email_smtp_port,
                 email_smtp_secure,
                 email_smtp_require_tls,
                 email_smtp_user,
                 email_smtp_pass,
                 email_from_name,
                 email_from_address,
                 email_notify_request_submit,
                 email_notify_status_updates,
                 email_notify_invoices,
                 updated_at
      `,
      [
        enabledValue,
        cleanProvider,
        cleanHost,
        portValue,
        secureValue,
        requireTlsValue,
        cleanUser,
        passToStore,
        cleanFromName,
        cleanFromAddress,
        notifyRequestSubmitValue,
        notifyStatusUpdatesValue,
        notifyInvoicesValue,
        cid,
      ]
    );
    await client.query("COMMIT");
    return res.rows[0] || null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function normalizePaymentTermsDays(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n === 30 || n === 60) return n;
  return null;
}

  async function upsertCompanySettings({
  companyId,
  billingRoundingMode = null,
  billingRoundingGranularity = null,
  monthlyProrationMethod = null,
  billingTimeZone = null,
  invoiceDateMode = null,
  defaultPaymentTermsDays = null,
  invoiceAutoRun = null,
  invoiceAutoMode = null,
  taxEnabled = null,
  defaultTaxRate = null,
  taxRegistrationNumber = null,
  taxInclusivePricing = null,
  autoApplyCustomerCredit = null,
  autoWorkOrderOnReturn = null,
  logoUrl = undefined,
    requiredStorefrontCustomerFields = undefined,
    rentalInfoFields = undefined,
  }) {
  const current = await getCompanySettings(companyId);
  const nextMode =
    billingRoundingMode === null || billingRoundingMode === undefined
      ? current.billing_rounding_mode
      : normalizeBillingRoundingMode(billingRoundingMode);
  const nextGranularity =
    billingRoundingGranularity === null || billingRoundingGranularity === undefined
      ? current.billing_rounding_granularity
      : normalizeBillingRoundingGranularity(billingRoundingGranularity);
  const nextProrationMethod =
    monthlyProrationMethod === null || monthlyProrationMethod === undefined
      ? current.monthly_proration_method
      : normalizeMonthlyProrationMethod(monthlyProrationMethod);
  const nextTimeZone =
    billingTimeZone === null || billingTimeZone === undefined
      ? normalizeBillingTimeZone(current.billing_timezone)
      : normalizeBillingTimeZone(billingTimeZone);
  const nextInvoiceDateMode =
    invoiceDateMode === null || invoiceDateMode === undefined
      ? normalizeInvoiceDateMode(current.invoice_date_mode)
      : normalizeInvoiceDateMode(invoiceDateMode);
  const nextTerms = defaultPaymentTermsDays === null || defaultPaymentTermsDays === undefined ? current.default_payment_terms_days : (normalizePaymentTermsDays(defaultPaymentTermsDays) || 30);
  const nextAutoRun =
    invoiceAutoRun === null || invoiceAutoRun === undefined ? normalizeInvoiceAutoRun(current.invoice_auto_run) : normalizeInvoiceAutoRun(invoiceAutoRun);
  const nextAutoMode =
    invoiceAutoMode === null || invoiceAutoMode === undefined
      ? normalizeInvoiceGenerationMode(current.invoice_auto_mode)
      : normalizeInvoiceGenerationMode(invoiceAutoMode);
  const nextTaxEnabled =
    taxEnabled === null || taxEnabled === undefined ? current.tax_enabled === true : taxEnabled === true;
  const nextTaxRate =
    defaultTaxRate === null || defaultTaxRate === undefined
      ? Number(current.default_tax_rate || 0)
      : (normalizeTaxRate(defaultTaxRate) ?? Number(current.default_tax_rate || 0));
  const nextTaxRegistration =
    taxRegistrationNumber === null || taxRegistrationNumber === undefined
      ? current.tax_registration_number || null
      : (taxRegistrationNumber ? String(taxRegistrationNumber).trim() : null);
  const nextTaxInclusive =
    taxInclusivePricing === null || taxInclusivePricing === undefined
      ? current.tax_inclusive_pricing === true
      : taxInclusivePricing === true;
  const nextAutoApplyCustomerCredit =
    autoApplyCustomerCredit === null || autoApplyCustomerCredit === undefined
      ? current.auto_apply_customer_credit === true
      : autoApplyCustomerCredit === true;
  const nextAutoWorkOrderOnReturn =
    autoWorkOrderOnReturn === null || autoWorkOrderOnReturn === undefined
      ? current.auto_work_order_on_return === true
      : autoWorkOrderOnReturn === true;
  const nextLogo = logoUrl === undefined ? current.logo_url : (logoUrl ? String(logoUrl) : null);
  const nextRequired = normalizeStorefrontCustomerRequirements(
    requiredStorefrontCustomerFields === undefined ? current.required_storefront_customer_fields : requiredStorefrontCustomerFields
  );
  const nextRentalInfoFields = normalizeRentalInfoFields(
    rentalInfoFields === undefined ? current.rental_info_fields : rentalInfoFields
  );
  const res = await pool.query(
    `
    INSERT INTO company_settings
      (company_id, billing_rounding_mode, billing_rounding_granularity, monthly_proration_method, billing_timezone, invoice_date_mode, default_payment_terms_days, invoice_auto_run, invoice_auto_mode, tax_enabled, default_tax_rate, tax_registration_number, tax_inclusive_pricing, auto_apply_customer_credit, auto_work_order_on_return, logo_url, required_storefront_customer_fields, rental_info_fields)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb)
    ON CONFLICT (company_id)
    DO UPDATE SET billing_rounding_mode = EXCLUDED.billing_rounding_mode,
                  billing_rounding_granularity = EXCLUDED.billing_rounding_granularity,
                  monthly_proration_method = EXCLUDED.monthly_proration_method,
                  billing_timezone = EXCLUDED.billing_timezone,
                  invoice_date_mode = EXCLUDED.invoice_date_mode,
                  default_payment_terms_days = EXCLUDED.default_payment_terms_days,
                  invoice_auto_run = EXCLUDED.invoice_auto_run,
                  invoice_auto_mode = EXCLUDED.invoice_auto_mode,
                  tax_enabled = EXCLUDED.tax_enabled,
                  default_tax_rate = EXCLUDED.default_tax_rate,
                  tax_registration_number = EXCLUDED.tax_registration_number,
                  tax_inclusive_pricing = EXCLUDED.tax_inclusive_pricing,
                  auto_apply_customer_credit = EXCLUDED.auto_apply_customer_credit,
                  auto_work_order_on_return = EXCLUDED.auto_work_order_on_return,
                  logo_url = EXCLUDED.logo_url,
                    required_storefront_customer_fields = EXCLUDED.required_storefront_customer_fields,
                    rental_info_fields = EXCLUDED.rental_info_fields,
                  updated_at = NOW()
    RETURNING company_id,
              billing_rounding_mode,
              billing_rounding_granularity,
              monthly_proration_method,
              billing_timezone,
              invoice_date_mode,
              default_payment_terms_days,
              invoice_auto_run,
              invoice_auto_mode,
              tax_enabled,
              default_tax_rate,
              tax_registration_number,
              tax_inclusive_pricing,
              auto_apply_customer_credit,
              auto_work_order_on_return,
              logo_url,
              required_storefront_customer_fields,
              rental_info_fields
    `,
    [
      companyId,
      nextMode,
      nextGranularity,
      nextProrationMethod,
      nextTimeZone,
      nextInvoiceDateMode,
      nextTerms,
      nextAutoRun,
      nextAutoMode,
      nextTaxEnabled,
      nextTaxRate,
      nextTaxRegistration,
      nextTaxInclusive,
      nextAutoApplyCustomerCredit,
      nextAutoWorkOrderOnReturn,
      nextLogo,
        JSON.stringify(nextRequired),
        JSON.stringify(nextRentalInfoFields),
      ]
    );
  return res.rows[0];
}

function normalizeStorefrontCustomerRequirements(value) {
  const allowed = new Set([
    "name",
    "businessName",
    "phone",
    "streetAddress",
    "city",
    "region",
    "postalCode",
    "country",
    "creditCardNumber",
    "reference1",
    "reference2",
    "proofOfInsurance",
    "driversLicense",
  ]);

  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : value && typeof value === "object"
        ? value
        : [];

  const arr = Array.isArray(raw) ? raw : [];
    return Array.from(
      new Set(
        arr
          .map((v) => String(v || "").trim())
          .filter(Boolean)
          .filter((v) => allowed.has(v))
      )
    );
  }

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  siteContacts: { enabled: true, required: true },
  coverageHours: { enabled: true, required: true },
};

function normalizeRentalInfoFields(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) raw = {};
  const normalized = {};
  for (const [key, defaults] of Object.entries(DEFAULT_RENTAL_INFO_FIELDS)) {
    const entry = raw[key];
    const enabled =
      typeof entry === "boolean"
        ? entry
        : entry && typeof entry === "object" && entry.enabled !== undefined
          ? entry.enabled === true
          : defaults.enabled === true;
    const required =
      entry && typeof entry === "object" && entry.required !== undefined
        ? entry.required === true
        : defaults.required === true;
    normalized[key] = { enabled, required };
  }
  return normalized;
}

async function listRentalOrders(companyId, { statuses = null, quoteOnly = false } = {}) {
  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((s) => normalizeRentalOrderStatus(s)).filter(Boolean)
    : typeof statuses === "string"
      ? statuses
          .split(",")
          .map((s) => normalizeRentalOrderStatus(s))
          .filter(Boolean)
      : null;
  const useStatuses = normalizedStatuses && normalizedStatuses.length ? normalizedStatuses : null;

  const params = [companyId];
  const where = ["ro.company_id = $1"];
  if (quoteOnly) where.push("ro.quote_number IS NOT NULL");
  if (useStatuses) {
    params.push(useStatuses);
    where.push(`ro.status = ANY($${params.length}::text[])`);
  }

  const result = await pool.query(
    `
    SELECT ro.id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           ro.site_address,
           ro.critical_areas,
           ro.coverage_hours,
           ro.created_at,
           ro.updated_at,
           ro.customer_id,
           c.company_name AS customer_name,
           ro.salesperson_id,
           sp.name AS salesperson_name,
           ro.pickup_location_id,
           l.name AS pickup_location_name,
           CASE
             WHEN ro.status = 'ordered'
              AND EXISTS (
                SELECT 1
                  FROM rental_order_line_items li
                 WHERE li.rental_order_id = ro.id
                   AND li.returned_at IS NULL
                   AND li.end_at < NOW()
              )
             THEN TRUE
             ELSE FALSE
           END AS is_overdue,
           (SELECT MIN(li.start_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS start_at,
           (SELECT MAX(li.end_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS end_at,
           (SELECT COUNT(*)
              FROM rental_order_line_inventory liv
              JOIN rental_order_line_items li ON li.id = liv.line_item_id
             WHERE li.rental_order_id = ro.id) AS equipment_count,
           (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id) AS fee_total,
           (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS line_subtotal,
           (
             (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
             +
             (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
           ) AS subtotal,
           (
             (
               (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
               +
               (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
             ) * 0.05
           ) AS gst,
           (
             (
               (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
               +
               (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
             ) * 1.05
           ) AS total
      FROM rental_orders ro
      JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY ro.created_at DESC
  `,
    params
  );
  return result.rows;
}

async function listRentalOrdersForRange(companyId, { from, to, statuses = null } = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((s) => normalizeRentalOrderStatus(s)).filter(Boolean)
    : typeof statuses === "string"
      ? statuses
          .split(",")
          .map((s) => normalizeRentalOrderStatus(s))
          .filter(Boolean)
      : null;
  const useStatuses = normalizedStatuses && normalizedStatuses.length ? normalizedStatuses : null;

  const params = [companyId, fromIso, toIso];
  const where = ["ro.company_id = $1"];
  where.push(`(SELECT MIN(li.start_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) < $3::timestamptz`);
  where.push(`(SELECT MAX(li.end_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) > $2::timestamptz`);
  if (useStatuses) {
    params.push(useStatuses);
    where.push(`ro.status = ANY($${params.length}::text[])`);
  }

  const result = await pool.query(
    `
    SELECT ro.id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           ro.site_address,
           ro.critical_areas,
           ro.coverage_hours,
           ro.created_at,
           ro.updated_at,
           ro.customer_id,
           c.company_name AS customer_name,
           ro.salesperson_id,
           sp.name AS salesperson_name,
           ro.pickup_location_id,
           l.name AS pickup_location_name,
           CASE
             WHEN ro.status = 'ordered'
              AND EXISTS (
                SELECT 1
                  FROM rental_order_line_items li
                 WHERE li.rental_order_id = ro.id
                   AND li.returned_at IS NULL
                   AND li.end_at < NOW()
              )
             THEN TRUE
             ELSE FALSE
           END AS is_overdue,
           (SELECT MIN(li.start_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS start_at,
           (SELECT MAX(li.end_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS end_at,
           (SELECT COUNT(*)
              FROM rental_order_line_inventory liv
              JOIN rental_order_line_items li ON li.id = liv.line_item_id
             WHERE li.rental_order_id = ro.id) AS equipment_count,
           (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id) AS fee_total,
           (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) AS line_subtotal,
           (
             (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
             +
             (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
           ) AS subtotal,
           (
             (
               (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
               +
               (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
             ) * 0.05
           ) AS gst,
           (
             (
               (SELECT COALESCE(SUM(li.line_amount), 0) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id)
               +
               (SELECT COALESCE(SUM(amount), 0) FROM rental_order_fees f WHERE f.rental_order_id = ro.id)
             ) * 1.05
           ) AS total
      FROM rental_orders ro
      JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY start_at ASC NULLS LAST, ro.created_at DESC
    `,
    params
  );
  return result.rows;
}

async function listRentalOrderContacts({ companyId, customerId }) {
  const res = await pool.query(
    `
    SELECT emergency_contacts, site_contacts
      FROM rental_orders
     WHERE company_id = $1 AND customer_id = $2
     ORDER BY updated_at DESC
    `,
    [companyId, customerId]
  );

  const emergencyContacts = [];
  const siteContacts = [];
  const emergencySeen = new Set();
  const siteSeen = new Set();

  const keyFor = (entry) =>
    [entry?.name, entry?.email, entry?.phone]
      .map((v) => String(v || "").trim().toLowerCase())
      .join("|");

  const pushUnique = (list, seen, entry) => {
    const key = keyFor(entry);
    if (!key.replace(/\|/g, "").trim()) return;
    if (seen.has(key)) return;
    seen.add(key);
    list.push(entry);
  };

  res.rows.forEach((row) => {
    normalizeOrderContacts(row.emergency_contacts).forEach((entry) => {
      pushUnique(emergencyContacts, emergencySeen, entry);
    });
    normalizeOrderContacts(row.site_contacts).forEach((entry) => {
      pushUnique(siteContacts, siteSeen, entry);
    });
  });

  return { emergencyContacts, siteContacts };
}

async function listTimelineData(companyId, { from, to, statuses = null } = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return { equipment: [], assignments: [] };

  const normalizedStatuses = Array.isArray(statuses)
    ? statuses.map((s) => normalizeRentalOrderStatus(s)).filter(Boolean)
    : typeof statuses === "string"
      ? statuses
          .split(",")
          .map((s) => normalizeRentalOrderStatus(s))
          .filter(Boolean)
      : null;
  const useStatuses = normalizedStatuses && normalizedStatuses.length ? normalizedStatuses : null;

  const equipmentRes = await pool.query(
    `
    SELECT e.id,
           e.serial_number,
           e.model_name,
           e.type_id,
           COALESCE(et.name, e.type) AS type_name,
           e.location_id,
           l.name AS location_name
      FROM equipment e
 LEFT JOIN equipment_types et ON et.id = e.type_id
 LEFT JOIN locations l ON l.id = e.location_id
     WHERE e.company_id = $1
     ORDER BY COALESCE(et.name, e.type), e.serial_number, e.model_name, e.id
    `,
    [companyId]
  );

  const params = [companyId, fromIso, toIso];
  const where = [
    "ro.company_id = $1",
    "COALESCE(li.fulfilled_at, li.start_at) < $3::timestamptz",
    "COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $2::timestamptz",
  ];
  if (useStatuses) {
    params.push(useStatuses);
    where.push(`ro.status = ANY($${params.length}::text[])`);
  }

  const assignsRes = await pool.query(
    `
    SELECT liv.equipment_id,
           li.id AS line_item_id,
           li.type_id,
           et.name AS type_name,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           ro.id AS order_id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           c.company_name AS customer_name,
           ro.pickup_location_id,
           pl.name AS pickup_location_name,
           FALSE AS is_tbd
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN customers c ON c.id = ro.customer_id
      JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN locations pl ON pl.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}

    UNION ALL

    SELECT NULL AS equipment_id,
           li.id AS line_item_id,
           li.type_id,
           et.name AS type_name,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           ro.id AS order_id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           c.company_name AS customer_name,
           ro.pickup_location_id,
           pl.name AS pickup_location_name,
           TRUE AS is_tbd
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN customers c ON c.id = ro.customer_id
      JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN locations pl ON pl.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}
       AND NOT EXISTS (
         SELECT 1 FROM rental_order_line_inventory liv2 WHERE liv2.line_item_id = li.id
       )
     ORDER BY start_at ASC, end_at ASC, order_id ASC, line_item_id ASC, equipment_id ASC
    `,
    params
  );

  return { equipment: equipmentRes.rows, assignments: assignsRes.rows };
}

async function rescheduleLineItemEnd({ companyId, lineItemId, endAt }) {
  const endIso = normalizeTimestamptz(endAt);
  if (!endIso) return { ok: false, error: "Invalid end date/time." };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const liRes = await client.query(
      `
      SELECT li.id,
             li.start_at,
             li.end_at,
             ro.id AS order_id,
             ro.status
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
       WHERE li.id = $1 AND ro.company_id = $2
       FOR UPDATE
      `,
      [lineItemId, companyId]
    );
    const li = liRes.rows[0];
    if (!li) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Line item not found." };
    }

    const status = normalizeRentalOrderStatus(li.status);
    if (!(status === "reservation" || status === "ordered")) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only Reservation/Ordered line items can be rescheduled." };
    }

    const startMs = Date.parse(li.start_at);
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      await client.query("ROLLBACK");
      return { ok: false, error: "End must be after start." };
    }

    const eqRes = await client.query(
      `SELECT equipment_id FROM rental_order_line_inventory WHERE line_item_id = $1 ORDER BY equipment_id`,
      [lineItemId]
    );
    const equipmentIds = eqRes.rows.map((r) => Number(r.equipment_id)).filter((n) => Number.isFinite(n));
    if (!equipmentIds.length) {
      await client.query("ROLLBACK");
      return { ok: false, error: "No inventory assigned to this line item." };
    }

    const conflicts = [];
    for (const equipmentId of equipmentIds) {
      const conflictRes = await client.query(
        `
        SELECT ro.id AS order_id,
               ro.status,
               ro.quote_number,
               ro.ro_number,
               c.company_name AS customer_name,
               li.start_at,
               li.end_at
          FROM rental_order_line_inventory liv
          JOIN rental_order_line_items li ON li.id = liv.line_item_id
          JOIN rental_orders ro ON ro.id = li.rental_order_id
          JOIN customers c ON c.id = ro.customer_id
         WHERE liv.equipment_id = $1
           AND ro.company_id = $2
           AND li.id <> $3
           AND ro.id <> $4
           AND ro.status IN ('requested','reservation','ordered')
           AND tstzrange(li.start_at, li.end_at, '[)') && tstzrange($5::timestamptz, $6::timestamptz, '[)')
         ORDER BY li.start_at ASC
         LIMIT 3
        `,
        [equipmentId, companyId, lineItemId, li.order_id, li.start_at, endIso]
      );
      conflictRes.rows.forEach((r) => {
        conflicts.push({
          equipmentId,
          orderId: r.order_id,
          status: r.status,
          quoteNumber: r.quote_number,
          roNumber: r.ro_number,
          customerName: r.customer_name,
          startAt: r.start_at,
          endAt: r.end_at,
        });
      });
      if (conflicts.length) break;
    }

    if (conflicts.length) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Conflict detected.", conflicts };
    }

    await client.query(`UPDATE rental_order_line_items SET end_at = $1 WHERE id = $2`, [endIso, lineItemId]);
    await client.query("COMMIT");
    return { ok: true, endAt: endIso };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function setLineItemPickedUp({
  companyId,
  lineItemId,
  pickedUp,
  actorName,
  actorEmail,
  pickedUpAt,
}) {
  const cid = Number(companyId);
  const liid = Number(lineItemId);
  const nextPickedUp = !!pickedUp;
  if (!Number.isFinite(cid) || !Number.isFinite(liid)) throw new Error("companyId and lineItemId are required.");
  const providedPickedUpAt = typeof pickedUpAt === "string" && pickedUpAt.trim() ? pickedUpAt : null;

  const client = await pool.connect();
  let orderId = null;
  let nextStatus = null;
  let statusChanged = false;
  let updatedLine = null;

  try {
    await client.query("BEGIN");

    const existingRes = await client.query(
      `
      SELECT li.id,
             li.rental_order_id,
             li.fulfilled_at,
             li.returned_at,
             li.start_at,
             li.end_at,
             ro.status,
             (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
       WHERE li.id = $1 AND ro.company_id = $2
       FOR UPDATE
      `,
      [liid, cid]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Line item not found." };
    }
    orderId = Number(existing.rental_order_id);

    const status = normalizeRentalOrderStatus(existing.status);
    if (!["requested", "reservation", "ordered", "received"].includes(status)) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only Requested/Reservation/Ordered/Received line items can be picked up." };
    }

    const qty = Number(existing.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "No inventory assigned to this line item." };
    }

    if (nextPickedUp) {
      const startAt = providedPickedUpAt || existing.fulfilled_at || existing.start_at;
      const endAt = existing.returned_at || existing.end_at;
      const startMs = Date.parse(startAt);
      const endMs = Date.parse(endAt);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        await client.query("ROLLBACK");
        return { ok: false, error: "Invalid actual pickup/return dates." };
      }

      const eqRes = await client.query(
        `SELECT equipment_id FROM rental_order_line_inventory WHERE line_item_id = $1 ORDER BY equipment_id`,
        [liid]
      );
      const equipmentIds = eqRes.rows.map((r) => Number(r.equipment_id)).filter((n) => Number.isFinite(n));
      if (!equipmentIds.length) {
        await client.query("ROLLBACK");
        return { ok: false, error: "No inventory assigned to this line item." };
      }

      const conflicts = [];
      for (const equipmentId of equipmentIds) {
        const conflictRes = await client.query(
          `
          SELECT ro.id AS order_id,
                 ro.status,
                 ro.quote_number,
                 ro.ro_number,
                 c.company_name AS customer_name,
                 COALESCE(li.fulfilled_at, li.start_at) AS start_at,
                 COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at
            FROM rental_order_line_inventory liv
            JOIN rental_order_line_items li ON li.id = liv.line_item_id
            JOIN rental_orders ro ON ro.id = li.rental_order_id
            JOIN customers c ON c.id = ro.customer_id
           WHERE liv.equipment_id = $1
             AND ro.company_id = $2
             AND li.id <> $3
             AND ro.id <> $4
             AND ro.status IN ('requested','reservation','ordered')
             AND tstzrange(
               COALESCE(li.fulfilled_at, li.start_at),
               COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
               '[)'
             ) && tstzrange($5::timestamptz, $6::timestamptz, '[)')
           ORDER BY COALESCE(li.fulfilled_at, li.start_at) ASC
           LIMIT 3
          `,
          [equipmentId, cid, liid, orderId, startAt, endAt]
        );
        conflictRes.rows.forEach((r) => {
          conflicts.push({
            equipmentId,
            orderId: r.order_id,
            status: r.status,
            quoteNumber: r.quote_number,
            roNumber: r.ro_number,
            customerName: r.customer_name,
            startAt: r.start_at,
            endAt: r.end_at,
          });
        });
        if (conflicts.length) break;
      }

      if (conflicts.length) {
        await client.query("ROLLBACK");
        return { ok: false, error: "No available units for that actual pickup time.", conflicts };
      }
    }

    const updateRes = nextPickedUp
      ? providedPickedUpAt
        ? await client.query(
            `UPDATE rental_order_line_items SET fulfilled_at = $1 WHERE id = $2 RETURNING fulfilled_at, returned_at`,
            [providedPickedUpAt, liid]
          )
        : await client.query(
            `UPDATE rental_order_line_items SET fulfilled_at = COALESCE(fulfilled_at, NOW()) WHERE id = $1 RETURNING fulfilled_at, returned_at`,
            [liid]
          )
      : await client.query(
          `UPDATE rental_order_line_items SET fulfilled_at = NULL, returned_at = NULL WHERE id = $1 RETURNING fulfilled_at, returned_at`,
          [liid]
        );
    updatedLine = updateRes.rows[0] || { fulfilled_at: null, returned_at: null };

    const countsRes = await client.query(
      `
      SELECT COUNT(*) FILTER (WHERE fulfilled_at IS NULL) AS unfulfilled,
             COUNT(*) FILTER (WHERE returned_at IS NULL) AS unreturned,
             COUNT(*) AS total
        FROM rental_order_line_items
       WHERE rental_order_id = $1
      `,
      [orderId]
    );
    const counts = countsRes.rows[0] || {};
    const unfulfilled = Number(counts.unfulfilled || 0);
    const unreturned = Number(counts.unreturned || 0);
    const total = Number(counts.total || 0);
    const fulfilled = total - unfulfilled;

    if (total > 0 && fulfilled > 0 && ["requested", "reservation"].includes(status)) {
      nextStatus = "ordered";
    } else if (total > 0 && fulfilled === 0 && ["ordered", "received"].includes(status)) {
      nextStatus = "reservation";
    }

    if (nextStatus && nextStatus !== status) {
      statusChanged = true;
      await client.query(`UPDATE rental_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`, [
        nextStatus,
        orderId,
        cid,
      ]);
    }

    await insertRentalOrderAudit({
      client,
      companyId: cid,
      orderId,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
      action: "line_item_pickup",
      summary: nextPickedUp ? "Marked a line item as picked up." : "Undid line item pickup.",
      changes: {
        lineItemId: liid,
        pickedUp: nextPickedUp,
        statusChanged,
        nextStatus: nextStatus || null,
      },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    ok: true,
    orderId,
    orderStatus: nextStatus || null,
    lineItemId: liid,
    pickedUpAt: updatedLine?.fulfilled_at || null,
    returnedAt: updatedLine?.returned_at || null,
    invoices: [],
    invoiceError: null,
  };
}

async function setLineItemReturned({
  companyId,
  lineItemId,
  returned,
  actorName,
  actorEmail,
  returnedAt,
}) {
  const cid = Number(companyId);
  const liid = Number(lineItemId);
  const nextReturned = !!returned;
  if (!Number.isFinite(cid) || !Number.isFinite(liid)) throw new Error("companyId and lineItemId are required.");
  const providedReturnedAt = typeof returnedAt === "string" && returnedAt.trim() ? returnedAt : null;

  const client = await pool.connect();
  let orderId = null;
  let prevStatus = null;
  let nextStatus = null;
  let statusChanged = false;
  let updatedLine = null;
  let shouldGenerateInvoices = false;
  let invoiceMode = "auto";

  try {
    await client.query("BEGIN");

    const existingRes = await client.query(
      `
      SELECT li.id,
             li.rental_order_id,
             li.fulfilled_at,
             li.returned_at,
             ro.status,
             (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
       WHERE li.id = $1 AND ro.company_id = $2
       FOR UPDATE
      `,
      [liid, cid]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Line item not found." };
    }
    orderId = Number(existing.rental_order_id);

    const status = normalizeRentalOrderStatus(existing.status);
    prevStatus = status;
    if (!["requested", "reservation", "ordered", "received"].includes(status)) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Only Requested/Reservation/Ordered/Received line items can be returned." };
    }

    const qty = Number(existing.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "No inventory assigned to this line item." };
    }

    if (nextReturned && !existing.fulfilled_at) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Pick up/deliver the item before marking it returned." };
    }

    const updateRes = nextReturned
      ? providedReturnedAt
        ? await client.query(
            `UPDATE rental_order_line_items SET returned_at = $1 WHERE id = $2 RETURNING fulfilled_at, returned_at`,
            [providedReturnedAt, liid]
          )
        : await client.query(
            `UPDATE rental_order_line_items SET returned_at = COALESCE(returned_at, NOW()) WHERE id = $1 RETURNING fulfilled_at, returned_at`,
            [liid]
          )
      : await client.query(
          `UPDATE rental_order_line_items SET returned_at = NULL WHERE id = $1 RETURNING fulfilled_at, returned_at`,
          [liid]
        );
    updatedLine = updateRes.rows[0] || { fulfilled_at: null, returned_at: null };

    const countsRes = await client.query(
      `
      SELECT COUNT(*) FILTER (WHERE fulfilled_at IS NULL) AS unfulfilled,
             COUNT(*) FILTER (WHERE returned_at IS NULL) AS unreturned,
             COUNT(*) AS total
        FROM rental_order_line_items
       WHERE rental_order_id = $1
      `,
      [orderId]
    );
    const counts = countsRes.rows[0] || {};
    const unfulfilled = Number(counts.unfulfilled || 0);
    const unreturned = Number(counts.unreturned || 0);

    if (unfulfilled === 0 && unreturned === 0) {
      nextStatus = "received";
    } else if (status === "received" && (unfulfilled > 0 || unreturned > 0)) {
      nextStatus = unfulfilled === 0 ? "ordered" : "reservation";
    }

    if (nextStatus && nextStatus !== status) {
      statusChanged = true;
      await client.query(`UPDATE rental_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`, [
        nextStatus,
        orderId,
        cid,
      ]);
      const settings = await getCompanySettingsForClient(client, cid);
      const autoRun = normalizeInvoiceAutoRun(settings?.invoice_auto_run);
      const configuredMode = normalizeInvoiceGenerationMode(settings?.invoice_auto_mode);
      invoiceMode = autoRun === "monthly" ? "monthly" : configuredMode;
      shouldGenerateInvoices =
        prevStatus !== "received" &&
        nextStatus === "received" &&
        (autoRun === "on_received" || autoRun === "on_closed");
    }

    await insertRentalOrderAudit({
      client,
      companyId: cid,
      orderId,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
      action: "line_item_return",
      summary: nextReturned ? "Marked a line item as returned." : "Undid line item return.",
      changes: {
        lineItemId: liid,
        returned: nextReturned,
        statusChanged,
        prevStatus,
        nextStatus: nextStatus || null,
      },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  let invoiceResult = null;
  let invoiceError = null;
  if (shouldGenerateInvoices) {
    try {
      invoiceResult = await generateInvoicesForRentalOrder({ companyId: cid, orderId, mode: invoiceMode });
    } catch (err) {
      invoiceError = err?.message ? String(err.message) : "Unable to generate invoice.";
    }
  }

  return {
    ok: true,
    orderId,
    orderStatus: nextStatus || null,
    lineItemId: liid,
    pickedUpAt: updatedLine?.fulfilled_at || null,
    returnedAt: updatedLine?.returned_at || null,
    invoices: invoiceResult?.created || [],
    invoiceError,
  };
}

async function applyWorkOrderPauseToEquipment({
  companyId,
  equipmentId,
  workOrderNumber,
  startAt = null,
  endAt = null,
}) {
  const cid = Number(companyId);
  const eid = Number(equipmentId);
  if (!Number.isFinite(cid) || !Number.isFinite(eid)) throw new Error("companyId and equipmentId are required.");

  const woNumber = String(workOrderNumber || "").trim();
  if (!woNumber) throw new Error("workOrderNumber is required.");

  const startIso = startAt ? normalizeTimestamptz(startAt) : null;
  const endIso = endAt ? normalizeTimestamptz(endAt) : null;
  if (startAt && !startIso) throw new Error("Invalid startAt.");
  if (endAt && !endIso) throw new Error("Invalid endAt.");
  if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
    throw new Error("endAt must be after startAt.");
  }

  const res = await pool.query(
    `
      SELECT li.id AS line_item_id,
             cond.pause_periods
        FROM rental_order_line_inventory liv
        JOIN rental_order_line_items li ON li.id = liv.line_item_id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
   LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
       WHERE liv.equipment_id = $1
         AND ro.company_id = $2
         AND ro.status IN ('ordered', 'received')
         AND li.fulfilled_at IS NOT NULL
         AND li.returned_at IS NULL
    `,
    [eid, cid]
  );

  let updated = 0;
  const touchedLineItems = [];
  for (const row of res.rows) {
    const lineItemId = Number(row.line_item_id);
    if (!Number.isFinite(lineItemId)) continue;
    const pausePeriods = normalizePausePeriods(row.pause_periods, { allowOpen: true });
    const existing = pausePeriods.find(
      (p) => p.source === "work_order" && p.workOrderNumber === woNumber
    );

    let changed = false;
    if (startIso) {
      if (!existing) {
        pausePeriods.push({
          startAt: startIso,
          endAt: endIso || null,
          source: "work_order",
          workOrderNumber: woNumber,
        });
        changed = true;
      } else {
        if (existing.startAt !== startIso) {
          existing.startAt = startIso;
          changed = true;
        }
        if (endIso && existing.endAt !== endIso) {
          existing.endAt = endIso;
          changed = true;
        }
      }
    } else if (endIso && existing && !existing.endAt) {
      existing.endAt = endIso;
      changed = true;
    }

    if (!changed) continue;
    await pool.query(
      `
      INSERT INTO rental_order_line_conditions (line_item_id, pause_periods)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (line_item_id)
      DO UPDATE SET pause_periods = EXCLUDED.pause_periods
      `,
      [lineItemId, JSON.stringify(pausePeriods)]
    );
    updated += 1;
    touchedLineItems.push(lineItemId);
  }

  return { ok: true, updatedLineItems: updated, lineItemIds: touchedLineItems };
}

async function getTypeAvailabilitySeries({ companyId, typeId, from, days = 30 }) {
  const fromDate = new Date(from || new Date().toISOString());
  if (Number.isNaN(fromDate.getTime())) return { dates: [], series: [] };
  const dayCount = Math.max(1, Math.min(180, Number(days) || 30));
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + dayCount * 24 * 60 * 60 * 1000);

  const equipmentRes = await pool.query(
    `
    SELECT e.id, e.location_id, l.name AS location_name
      FROM equipment e
 LEFT JOIN locations l ON l.id = e.location_id
     WHERE e.company_id = $1
       AND e.type_id = $2
       AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
    `,
    [companyId, typeId]
  );
  const units = equipmentRes.rows.map((r) => ({
    id: Number(r.id),
    locationId: r.location_id === null || r.location_id === undefined ? null : Number(r.location_id),
    locationName: r.location_name || "No location",
  }));

  const demandRes = await pool.query(
    `
    SELECT li.id,
           ro.pickup_location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ro.company_id = $1
       AND li.type_id = $2
       AND ro.status IN ('quote','requested','reservation','ordered')
       AND (
         COALESCE(li.fulfilled_at, li.start_at) < $4::timestamptz
         AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $3::timestamptz
       )
     GROUP BY li.id, ro.pickup_location_id, l.name, li.fulfilled_at, li.start_at, li.returned_at, li.end_at
    `,
    [companyId, typeId, start.toISOString(), end.toISOString()]
  );

  const byLocation = new Map();
  units.forEach((u) => {
    const key = String(u.locationId ?? "none");
    if (!byLocation.has(key)) {
      byLocation.set(key, {
        locationId: u.locationId,
        locationName: u.locationName,
        total: 0,
        reservedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    byLocation.get(key).total += 1;
  });

  const startMs = start.getTime();
  demandRes.rows.forEach((r) => {
    const locKey = String(r.pickup_location_id ?? "none");
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: r.pickup_location_id === null || r.pickup_location_id === undefined ? null : Number(r.pickup_location_id),
        locationName: r.location_name || "No location",
        total: 0,
        reservedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byLocation.get(locKey);
    if (!bucket) return;

    const qty = Number(r.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const s = Date.parse(r.start_at);
    const e = Date.parse(r.end_at);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
    const first = Math.max(0, Math.floor((startOfDayMs(s) - startMs) / (24 * 60 * 60 * 1000)));
    const last = Math.min(dayCount - 1, Math.floor((startOfDayMs(e - 1) - startMs) / (24 * 60 * 60 * 1000)));
    for (let i = first; i <= last; i++) bucket.reservedByDay[i] += qty;
  });

  const incomingRes = await pool.query(
    `
    SELECT po.expected_possession_date,
           po.location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COUNT(*)::int AS qty
      FROM purchase_orders po
 LEFT JOIN locations l ON l.id = po.location_id
     WHERE po.company_id = $1
       AND po.type_id = $2
       AND po.status <> 'closed'
       AND po.equipment_id IS NULL
       AND po.expected_possession_date IS NOT NULL
       AND po.expected_possession_date <= $3::date
     GROUP BY po.expected_possession_date, po.location_id, l.name
    `,
    [companyId, typeId, end.toISOString().slice(0, 10)]
  );

  incomingRes.rows.forEach((row) => {
    const locKey = String(row.location_id ?? "none");
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: row.location_id === null || row.location_id === undefined ? null : Number(row.location_id),
        locationName: row.location_name || "No location",
        total: 0,
        reservedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byLocation.get(locKey);
    if (!bucket) return;
    const qty = Number(row.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const expectedMs = Date.parse(row.expected_possession_date);
    if (!Number.isFinite(expectedMs)) return;
    let idx = Math.floor((startOfDayMs(expectedMs) - startMs) / (24 * 60 * 60 * 1000));
    if (idx < 0) idx = 0;
    if (idx >= dayCount) return;
    for (let i = idx; i < dayCount; i++) bucket.incomingByDay[i] += qty;
  });

  const dates = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const series = Array.from(byLocation.values())
    .sort((a, b) => String(a.locationName).localeCompare(String(b.locationName)))
    .map((loc) => ({
      locationId: loc.locationId,
      locationName: loc.locationName,
      values: loc.reservedByDay.map((reserved, idx) => loc.total + loc.incomingByDay[idx] - reserved),
      total: loc.total + Math.max(0, ...loc.incomingByDay),
    }));

  return { dates, series };
}

async function getAvailabilityShortfallsSummary({
  companyId,
  from,
  to,
  locationId = null,
  categoryId = null,
  typeId = null,
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return { rows: [] };

  const rangeStart = new Date(fromIso);
  if (Number.isNaN(rangeStart.getTime())) return { rows: [] };
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(toIso);
  if (Number.isNaN(rangeEnd.getTime())) return { rows: [] };

  const dayCount = Math.max(1, Math.min(180, Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000))));
  const end = new Date(rangeStart.getTime() + dayCount * 24 * 60 * 60 * 1000);

  const locationIdNum = locationId === null || locationId === undefined ? null : Number(locationId);
  const categoryIdNum = categoryId === null || categoryId === undefined ? null : Number(categoryId);
  const typeIdNum = typeId === null || typeId === undefined ? null : Number(typeId);

  const typeParams = [companyId];
  const typeFilters = ["et.company_id = $1"];
  if (Number.isFinite(categoryIdNum)) {
    typeParams.push(categoryIdNum);
    typeFilters.push(`et.category_id = $${typeParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    typeParams.push(typeIdNum);
    typeFilters.push(`et.id = $${typeParams.length}`);
  }

  const typeRes = await pool.query(
    `
    SELECT et.id,
           et.name,
           ec.name AS category_name
      FROM equipment_types et
 LEFT JOIN equipment_categories ec ON ec.id = et.category_id
     WHERE ${typeFilters.join(" AND ")}
     ORDER BY et.name
    `,
    typeParams
  );
  const types = typeRes.rows.map((r) => ({
    typeId: Number(r.id),
    typeName: r.name || "--",
    categoryName: r.category_name || null,
  }));
  if (!types.length) return { rows: [] };

  const countParams = [companyId];
  const countFilters = ["e.company_id = $1", "(e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')"];
  if (Number.isFinite(locationIdNum)) {
    countParams.push(locationIdNum);
    countFilters.push(`e.location_id = $${countParams.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    countParams.push(categoryIdNum);
    countFilters.push(`et.category_id = $${countParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    countParams.push(typeIdNum);
    countFilters.push(`e.type_id = $${countParams.length}`);
  }

  const countRes = await pool.query(
    `
    SELECT e.type_id,
           COUNT(*)::int AS total_units
      FROM equipment e
      JOIN equipment_types et ON et.id = e.type_id AND et.company_id = e.company_id
     WHERE ${countFilters.join(" AND ")}
     GROUP BY e.type_id
    `,
    countParams
  );
  const totalsByType = new Map(countRes.rows.map((r) => [String(r.type_id), Number(r.total_units || 0)]));

  const byType = new Map();
  types.forEach((t) => {
    const totalUnits = totalsByType.get(String(t.typeId)) || 0;
    byType.set(String(t.typeId), {
      typeId: t.typeId,
      typeName: t.typeName,
      categoryName: t.categoryName,
      totalUnits,
      committedByDay: new Array(dayCount).fill(0),
      projectedByDay: new Array(dayCount).fill(0),
      incomingByDay: new Array(dayCount).fill(0),
    });
  });

  const demandParams = [companyId, rangeStart.toISOString(), end.toISOString()];
  const demandFilters = [
    "ro.company_id = $1",
    "ro.status IN ('quote','requested','reservation','ordered')",
    "COALESCE(li.fulfilled_at, li.start_at) < $3::timestamptz",
    "COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $2::timestamptz",
  ];
  if (Number.isFinite(locationIdNum)) {
    demandParams.push(locationIdNum);
    demandFilters.push(`ro.pickup_location_id = $${demandParams.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    demandParams.push(categoryIdNum);
    demandFilters.push(`et.category_id = $${demandParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    demandParams.push(typeIdNum);
    demandFilters.push(`li.type_id = $${demandParams.length}`);
  }

  const demandRes = await pool.query(
    `
    SELECT li.id,
           li.type_id,
           ro.status,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty,
           et.name AS type_name,
           ec.name AS category_name
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN equipment_types et ON et.id = li.type_id AND et.company_id = ro.company_id
 LEFT JOIN equipment_categories ec ON ec.id = et.category_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
     WHERE ${demandFilters.join(" AND ")}
     GROUP BY li.id, li.type_id, ro.status, li.fulfilled_at, li.start_at, li.returned_at, li.end_at, et.name, ec.name
    `,
    demandParams
  );

  const committedStatuses = new Set(["reservation", "ordered"]);
  const startMs = rangeStart.getTime();
  demandRes.rows.forEach((r) => {
    const typeKey = String(r.type_id);
    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        typeId: Number(r.type_id),
        typeName: r.type_name || "--",
        categoryName: r.category_name || null,
        totalUnits: totalsByType.get(typeKey) || 0,
        committedByDay: new Array(dayCount).fill(0),
        projectedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byType.get(typeKey);
    if (!bucket) return;

    const qty = Number(r.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const s = Date.parse(r.start_at);
    const e = Date.parse(r.end_at);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
    const first = Math.max(0, Math.floor((startOfDayMs(s) - startMs) / (24 * 60 * 60 * 1000)));
    const last = Math.min(dayCount - 1, Math.floor((startOfDayMs(e - 1) - startMs) / (24 * 60 * 60 * 1000)));
    const target = committedStatuses.has(String(r.status || "").toLowerCase())
      ? bucket.committedByDay
      : bucket.projectedByDay;
    for (let i = first; i <= last; i++) target[i] += qty;
  });

  const incomingParams = [companyId, end.toISOString().slice(0, 10)];
  const incomingFilters = [
    "po.company_id = $1",
    "po.status <> 'closed'",
    "po.equipment_id IS NULL",
    "po.expected_possession_date IS NOT NULL",
    "po.expected_possession_date <= $2::date",
  ];
  if (Number.isFinite(locationIdNum)) {
    incomingParams.push(locationIdNum);
    incomingFilters.push(`po.location_id = $${incomingParams.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    incomingParams.push(categoryIdNum);
    incomingFilters.push(`et.category_id = $${incomingParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    incomingParams.push(typeIdNum);
    incomingFilters.push(`po.type_id = $${incomingParams.length}`);
  }

  const incomingRes = await pool.query(
    `
    SELECT po.type_id,
           po.expected_possession_date,
           COUNT(*)::int AS qty,
           et.name AS type_name,
           ec.name AS category_name
      FROM purchase_orders po
      JOIN equipment_types et ON et.id = po.type_id AND et.company_id = po.company_id
 LEFT JOIN equipment_categories ec ON ec.id = et.category_id
     WHERE ${incomingFilters.join(" AND ")}
     GROUP BY po.type_id, po.expected_possession_date, et.name, ec.name
    `,
    incomingParams
  );

  incomingRes.rows.forEach((row) => {
    const typeKey = String(row.type_id);
    if (!byType.has(typeKey)) {
      byType.set(typeKey, {
        typeId: Number(row.type_id),
        typeName: row.type_name || "--",
        categoryName: row.category_name || null,
        totalUnits: totalsByType.get(typeKey) || 0,
        committedByDay: new Array(dayCount).fill(0),
        projectedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byType.get(typeKey);
    if (!bucket) return;
    const qty = Number(row.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const expectedMs = Date.parse(row.expected_possession_date);
    if (!Number.isFinite(expectedMs)) return;
    let idx = Math.floor((startOfDayMs(expectedMs) - startMs) / (24 * 60 * 60 * 1000));
    if (idx < 0) idx = 0;
    if (idx >= dayCount) return;
    for (let i = idx; i < dayCount; i++) bucket.incomingByDay[i] += qty;
  });

  const rows = [];
  byType.forEach((bucket) => {
    let minCommitted = null;
    let minPotential = null;
    for (let i = 0; i < dayCount; i++) {
      const incoming = bucket.incomingByDay[i] || 0;
      const committedAvail = bucket.totalUnits + incoming - bucket.committedByDay[i];
      const potentialAvail = committedAvail - bucket.projectedByDay[i];
      minCommitted = minCommitted === null ? committedAvail : Math.min(minCommitted, committedAvail);
      minPotential = minPotential === null ? potentialAvail : Math.min(minPotential, potentialAvail);
    }
    const maxIncoming = Math.max(0, ...bucket.incomingByDay);
    const hasDemand =
      bucket.committedByDay.some((v) => v > 0) ||
      bucket.projectedByDay.some((v) => v > 0) ||
      bucket.totalUnits > 0 ||
      maxIncoming > 0;
    if (!hasDemand) return;
    rows.push({
      typeId: bucket.typeId,
      typeName: bucket.typeName,
      categoryName: bucket.categoryName,
      totalUnits: bucket.totalUnits + maxIncoming,
      minCommitted: minCommitted ?? bucket.totalUnits + maxIncoming,
      minPotential: minPotential ?? bucket.totalUnits + maxIncoming,
    });
  });

  rows.sort((a, b) => {
    if (a.minCommitted !== b.minCommitted) return a.minCommitted - b.minCommitted;
    return String(a.typeName || "").localeCompare(String(b.typeName || ""));
  });

  return { rows };
}

async function getTypeAvailabilitySeriesWithProjection({
  companyId,
  typeId,
  from,
  days = 30,
  locationId = null,
  splitLocation = false,
} = {}) {
  const fromDate = new Date(from || new Date().toISOString());
  if (Number.isNaN(fromDate.getTime())) return { dates: [], series: [] };
  const dayCount = Math.max(1, Math.min(180, Number(days) || 30));
  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + dayCount * 24 * 60 * 60 * 1000);

  const locationIdNum = locationId === null || locationId === undefined ? null : Number(locationId);
  const doSplit = Boolean(splitLocation && !Number.isFinite(locationIdNum));

  const equipmentParams = [companyId, typeId];
  const equipmentFilters = [
    "e.company_id = $1",
    "e.type_id = $2",
    "(e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')",
  ];
  if (Number.isFinite(locationIdNum)) {
    equipmentParams.push(locationIdNum);
    equipmentFilters.push(`e.location_id = $${equipmentParams.length}`);
  }

  const equipmentRes = await pool.query(
    `
    SELECT e.id, e.location_id, l.name AS location_name
      FROM equipment e
 LEFT JOIN locations l ON l.id = e.location_id
     WHERE ${equipmentFilters.join(" AND ")}
    `,
    equipmentParams
  );
  const units = equipmentRes.rows.map((r) => ({
    id: Number(r.id),
    locationId: r.location_id === null || r.location_id === undefined ? null : Number(r.location_id),
    locationName: r.location_name || "No location",
  }));

  const byLocation = new Map();
  if (doSplit) {
    units.forEach((u) => {
      const key = String(u.locationId ?? "none");
      if (!byLocation.has(key)) {
        byLocation.set(key, {
          locationId: u.locationId,
          locationName: u.locationName,
          total: 0,
          committedByDay: new Array(dayCount).fill(0),
          projectedByDay: new Array(dayCount).fill(0),
          incomingByDay: new Array(dayCount).fill(0),
        });
      }
      byLocation.get(key).total += 1;
    });
  } else {
    const total = units.length;
    const locationName = Number.isFinite(locationIdNum)
      ? units[0]?.locationName || "Location"
      : "All locations";
    byLocation.set("all", {
      locationId: Number.isFinite(locationIdNum) ? locationIdNum : null,
      locationName,
      total,
      committedByDay: new Array(dayCount).fill(0),
      projectedByDay: new Array(dayCount).fill(0),
      incomingByDay: new Array(dayCount).fill(0),
    });
  }

  const demandParams = [companyId, typeId, start.toISOString(), end.toISOString()];
  const demandFilters = [
    "ro.company_id = $1",
    "li.type_id = $2",
    "ro.status IN ('quote','requested','reservation','ordered')",
    "COALESCE(li.fulfilled_at, li.start_at) < $4::timestamptz",
    "COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $3::timestamptz",
  ];
  if (Number.isFinite(locationIdNum)) {
    demandParams.push(locationIdNum);
    demandFilters.push(`ro.pickup_location_id = $${demandParams.length}`);
  }

  const demandRes = await pool.query(
    `
    SELECT li.id,
           ro.status,
           ro.pickup_location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${demandFilters.join(" AND ")}
     GROUP BY li.id, ro.status, ro.pickup_location_id, l.name, li.fulfilled_at, li.start_at, li.returned_at, li.end_at
    `,
    demandParams
  );

  const committedStatuses = new Set(["reservation", "ordered"]);
  const startMs = start.getTime();
  demandRes.rows.forEach((r) => {
    const locKey = doSplit ? String(r.pickup_location_id ?? "none") : "all";
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: r.pickup_location_id === null || r.pickup_location_id === undefined ? null : Number(r.pickup_location_id),
        locationName: r.location_name || "No location",
        total: 0,
        committedByDay: new Array(dayCount).fill(0),
        projectedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byLocation.get(locKey);
    if (!bucket) return;

    const qty = Number(r.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const s = Date.parse(r.start_at);
    const e = Date.parse(r.end_at);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return;
    const first = Math.max(0, Math.floor((startOfDayMs(s) - startMs) / (24 * 60 * 60 * 1000)));
    const last = Math.min(dayCount - 1, Math.floor((startOfDayMs(e - 1) - startMs) / (24 * 60 * 60 * 1000)));
    const target = committedStatuses.has(String(r.status || "").toLowerCase())
      ? bucket.committedByDay
      : bucket.projectedByDay;
    for (let i = first; i <= last; i++) target[i] += qty;
  });

  const incomingParams = [companyId, typeId, end.toISOString().slice(0, 10)];
  const incomingFilters = [
    "po.company_id = $1",
    "po.type_id = $2",
    "po.status <> 'closed'",
    "po.equipment_id IS NULL",
    "po.expected_possession_date IS NOT NULL",
    "po.expected_possession_date <= $3::date",
  ];
  if (Number.isFinite(locationIdNum)) {
    incomingParams.push(locationIdNum);
    incomingFilters.push(`po.location_id = $${incomingParams.length}`);
  }

  const incomingRes = await pool.query(
    `
    SELECT po.expected_possession_date,
           po.location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COUNT(*)::int AS qty
      FROM purchase_orders po
 LEFT JOIN locations l ON l.id = po.location_id
     WHERE ${incomingFilters.join(" AND ")}
     GROUP BY po.expected_possession_date, po.location_id, l.name
    `,
    incomingParams
  );

  incomingRes.rows.forEach((row) => {
    const locKey = doSplit ? String(row.location_id ?? "none") : "all";
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: row.location_id === null || row.location_id === undefined ? null : Number(row.location_id),
        locationName: row.location_name || "No location",
        total: 0,
        committedByDay: new Array(dayCount).fill(0),
        projectedByDay: new Array(dayCount).fill(0),
        incomingByDay: new Array(dayCount).fill(0),
      });
    }
    const bucket = byLocation.get(locKey);
    if (!bucket) return;
    const qty = Number(row.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const expectedMs = Date.parse(row.expected_possession_date);
    if (!Number.isFinite(expectedMs)) return;
    let idx = Math.floor((startOfDayMs(expectedMs) - startMs) / (24 * 60 * 60 * 1000));
    if (idx < 0) idx = 0;
    if (idx >= dayCount) return;
    for (let i = idx; i < dayCount; i++) bucket.incomingByDay[i] += qty;
  });

  const dates = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startMs + i * 24 * 60 * 60 * 1000);
    dates.push(d.toISOString().slice(0, 10));
  }

  const series = Array.from(byLocation.values())
    .sort((a, b) => String(a.locationName).localeCompare(String(b.locationName)))
    .map((loc) => ({
      locationId: loc.locationId,
      locationName: loc.locationName,
      total: loc.total,
      committedValues: loc.committedByDay.map((reserved) => loc.total - reserved),
      potentialValues: loc.committedByDay.map((reserved, idx) => loc.total - reserved - loc.projectedByDay[idx]),
      availableWithIncomingValues: loc.committedByDay.map(
        (reserved, idx) => loc.total + loc.incomingByDay[idx] - reserved
      ),
    }));

  return { dates, series };
}

async function getTypeAvailabilityShortfallDetails({ companyId, typeId, date, locationId = null } = {}) {
  const dayStart = date ? new Date(date) : null;
  if (!dayStart || Number.isNaN(dayStart.getTime())) return { committed: [], projected: [] };
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const startIso = normalizeTimestamptz(dayStart);
  const endIso = normalizeTimestamptz(dayEnd);
  if (!startIso || !endIso) return { committed: [], projected: [] };

  const locationIdNum = locationId === null || locationId === undefined ? null : Number(locationId);
  const params = [companyId, typeId, startIso, endIso];
  const filters = [
    "ro.company_id = $1",
    "li.type_id = $2",
    "ro.status IN ('quote','requested','reservation','ordered')",
    "tstzrange(COALESCE(li.fulfilled_at, li.start_at), COALESCE(li.returned_at, GREATEST(li.end_at, NOW())), '[)')",
    "&& tstzrange($3::timestamptz, $4::timestamptz, '[)')",
  ];
  if (Number.isFinite(locationIdNum)) {
    params.push(locationIdNum);
    filters.push(`ro.pickup_location_id = $${params.length}`);
  }

  const res = await pool.query(
    `
    SELECT li.id AS line_item_id,
           ro.id AS order_id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           c.company_name AS customer_name,
           ro.pickup_location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COALESCE(li.fulfilled_at, li.start_at) AS start_at,
           COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
           CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${filters.join(" AND ")}
     GROUP BY li.id, ro.id, ro.status, ro.quote_number, ro.ro_number, c.company_name, ro.pickup_location_id, l.name,
              li.fulfilled_at, li.start_at, li.returned_at, li.end_at
     ORDER BY COALESCE(li.fulfilled_at, li.start_at) ASC
    `,
    params
  );

  const committed = [];
  const projected = [];
  res.rows.forEach((row) => {
    const status = String(row.status || "").toLowerCase();
    if (status === "reservation" || status === "ordered") committed.push(row);
    else projected.push(row);
  });

  return { committed, projected };
}

function startOfDayMs(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysInUtcMonth(date) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function startOfUtcMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcMonths(date, count) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

async function getUtilizationDashboard({
  companyId,
  from,
  to,
  locationId = null,
  categoryId = null,
  typeId = null,
  maxBasis = "rack",
  forwardMonths = 12,
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) {
    return { summary: null, daily: [], forward: [] };
  }

  const rangeStartMs = Date.parse(fromIso);
  const rangeEndMs = Date.parse(toIso);
  if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs) || rangeEndMs <= rangeStartMs) {
    return { summary: null, daily: [], forward: [] };
  }

  const forwardCount = Math.max(1, Math.min(18, Number(forwardMonths) || 12));
  const forwardStart = startOfUtcMonth(new Date());
  const forwardEnd = addUtcMonths(forwardStart, forwardCount);
  const horizonStartMs = Math.min(rangeStartMs, forwardStart.getTime());
  const horizonEndMs = Math.max(rangeEndMs, forwardEnd.getTime());

  const equipmentParams = [companyId];
  const equipmentFilters = ["e.company_id = $1"];
  const locationIdNum = locationId === null || locationId === undefined ? null : Number(locationId);
  const typeIdNum = typeId === null || typeId === undefined ? null : Number(typeId);
  const categoryIdNum = categoryId === null || categoryId === undefined ? null : Number(categoryId);
  if (Number.isFinite(locationIdNum)) {
    equipmentParams.push(locationIdNum);
    equipmentFilters.push(`COALESCE(e.current_location_id, e.location_id) = $${equipmentParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    equipmentParams.push(typeIdNum);
    equipmentFilters.push(`e.type_id = $${equipmentParams.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    equipmentParams.push(categoryIdNum);
    equipmentFilters.push(`et.category_id = $${equipmentParams.length}`);
  }

  const equipmentRes = await pool.query(
    `
    SELECT e.id,
           COALESCE(e.current_location_id, e.location_id) AS location_id,
           e.type_id,
           et.category_id,
           et.daily_rate,
           et.weekly_rate,
           et.monthly_rate
      FROM equipment e
 LEFT JOIN equipment_types et ON et.id = e.type_id
     WHERE ${equipmentFilters.join(" AND ")}
     ORDER BY e.id ASC
    `,
    equipmentParams
  );

  const equipment = equipmentRes.rows.map((row) => ({
    id: Number(row.id),
    locationId: row.location_id === null || row.location_id === undefined ? null : Number(row.location_id),
    typeId: row.type_id === null || row.type_id === undefined ? null : Number(row.type_id),
    categoryId: row.category_id === null || row.category_id === undefined ? null : Number(row.category_id),
    rackDaily: row.daily_rate === null || row.daily_rate === undefined ? 0 : Number(row.daily_rate),
    rackWeekly: row.weekly_rate === null || row.weekly_rate === undefined ? 0 : Number(row.weekly_rate),
    rackMonthly: row.monthly_rate === null || row.monthly_rate === undefined ? 0 : Number(row.monthly_rate),
  }));

  if (!equipment.length) {
    return {
      summary: {
        maxPotential: 0,
        activeRevenue: 0,
        reservedRevenue: 0,
        deadRevenue: 0,
        utilization: 0,
        discountImpact: 0,
      },
      daily: [],
      forward: [],
    };
  }

  const equipmentByType = new Map();
  for (const equip of equipment) {
    if (!Number.isFinite(equip.typeId)) continue;
    const existing = equipmentByType.get(equip.typeId) || {
      count: 0,
      rackDaily: 0,
      rackWeekly: 0,
      rackMonthly: 0,
    };
    existing.count += 1;
    existing.rackDaily = Math.max(existing.rackDaily, Number(equip.rackDaily || 0));
    existing.rackWeekly = Math.max(existing.rackWeekly, Number(equip.rackWeekly || 0));
    existing.rackMonthly = Math.max(existing.rackMonthly, Number(equip.rackMonthly || 0));
    equipmentByType.set(equip.typeId, existing);
  }

  const equipmentIds = equipment.map((e) => e.id);
  const statuses = ["ordered", "reservation", "requested"];
  const reservedStatuses = ["reservation", "requested"];
  const assignmentsRes = await pool.query(
    `
    SELECT liv.equipment_id,
           li.id AS line_item_id,
           ro.status,
           ro.created_at AS order_created_at,
           li.start_at,
           li.end_at,
           li.fulfilled_at,
           li.returned_at,
           li.rate_basis,
           li.rate_amount,
           li.billable_units,
           li.line_amount
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
     WHERE ro.company_id = $1
       AND liv.equipment_id = ANY($2::int[])
       AND ro.status = ANY($3::text[])
       AND COALESCE(li.fulfilled_at, li.start_at) < $5::timestamptz
       AND COALESCE(
            li.returned_at,
            CASE
              WHEN ro.status = 'ordered' THEN GREATEST(li.end_at, NOW())
              ELSE li.end_at
            END
           ) > $4::timestamptz
    `,
    [companyId, equipmentIds, statuses, new Date(horizonStartMs).toISOString(), new Date(horizonEndMs).toISOString()]
  );

  const unassignedParams = [companyId, reservedStatuses, new Date(horizonStartMs).toISOString(), new Date(horizonEndMs).toISOString()];
  const unassignedWhere = [
    "ro.company_id = $1",
    "ro.status = ANY($2::text[])",
    "COALESCE(li.fulfilled_at, li.start_at) < $4::timestamptz",
    "COALESCE(li.returned_at, li.end_at) > $3::timestamptz",
    "NOT EXISTS (SELECT 1 FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id)",
  ];
  if (Number.isFinite(locationIdNum)) {
    unassignedParams.push(locationIdNum);
    unassignedWhere.push(`ro.pickup_location_id = $${unassignedParams.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    unassignedParams.push(typeIdNum);
    unassignedWhere.push(`li.type_id = $${unassignedParams.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    unassignedParams.push(categoryIdNum);
    unassignedWhere.push(`et.category_id = $${unassignedParams.length}`);
  }

  const unassignedRes = await pool.query(
    `
    SELECT li.id AS line_item_id,
           li.type_id,
           ro.status,
           ro.created_at AS order_created_at,
           ro.pickup_location_id,
           li.start_at,
           li.end_at,
           li.fulfilled_at,
           li.returned_at,
           li.rate_basis,
           li.rate_amount,
           li.billable_units,
           li.line_amount
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN equipment_types et ON et.id = li.type_id
     WHERE ${unassignedWhere.join(" AND ")}
    `,
    unassignedParams
  );

  const assignmentsByEquipment = new Map();
  const unassignedByType = new Map();
  const autoRateBasis = (durationDays) => {
    if (durationDays >= 28) return "monthly";
    if (durationDays >= 7) return "weekly";
    return "daily";
  };

  const nowMs = Date.now();
  const horizonCapMs = Math.min(nowMs, horizonEndMs);

  for (const row of assignmentsRes.rows) {
    const equipmentId = Number(row.equipment_id);
    if (!Number.isFinite(equipmentId)) continue;
    const status = normalizeRentalOrderStatus(row.status);
    if (!["ordered", "reservation", "requested"].includes(status)) continue;
    const startRaw = status === "ordered" ? row.fulfilled_at || row.start_at : row.start_at;
    const endRaw = row.returned_at || row.end_at;
    const startMs = Date.parse(startRaw);
    let endMs = Date.parse(endRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    if (status === "ordered" && !row.returned_at) {
      endMs = Math.max(endMs, horizonCapMs);
      if (endMs <= startMs) continue;
    }

    const durationDays = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
    let rateBasis = normalizeRateBasis(row.rate_basis) || null;
    let rateAmount = row.rate_amount === null || row.rate_amount === undefined ? null : Number(row.rate_amount);
    const billableUnits = row.billable_units === null || row.billable_units === undefined ? null : Number(row.billable_units);
    const lineAmount = row.line_amount === null || row.line_amount === undefined ? null : Number(row.line_amount);

    if (!rateBasis) rateBasis = autoRateBasis(durationDays);
    if (!Number.isFinite(rateAmount) && Number.isFinite(billableUnits) && billableUnits > 0 && Number.isFinite(lineAmount)) {
      rateAmount = lineAmount / billableUnits;
    }
    if (!Number.isFinite(rateAmount) && Number.isFinite(lineAmount)) {
      rateAmount = lineAmount / durationDays;
      rateBasis = "daily";
    }
    if (!Number.isFinite(rateAmount)) rateAmount = 0;

    const entry = {
      equipmentId,
      lineItemId: Number(row.line_item_id),
      status,
      startMs,
      endMs,
      rateBasis,
      rateAmount,
      orderCreatedAt: row.order_created_at ? Date.parse(row.order_created_at) : 0,
    };

    if (!assignmentsByEquipment.has(equipmentId)) assignmentsByEquipment.set(equipmentId, []);
    assignmentsByEquipment.get(equipmentId).push(entry);
  }

  const statusWeight = (status) => {
    if (status === "reservation") return 1;
    if (status === "requested") return 2;
    if (status === "quote") return 3;
    return 9;
  };

  for (const row of unassignedRes.rows) {
    const typeId = row.type_id === null || row.type_id === undefined ? null : Number(row.type_id);
    if (!Number.isFinite(typeId)) continue;
    const status = normalizeRentalOrderStatus(row.status);
    if (!reservedStatuses.includes(status)) continue;
    const startRaw = row.start_at;
    const endRaw = row.returned_at || row.end_at;
    const startMs = Date.parse(startRaw);
    const endMs = Date.parse(endRaw);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;

    const durationDays = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
    let rateBasis = normalizeRateBasis(row.rate_basis) || null;
    let rateAmount = row.rate_amount === null || row.rate_amount === undefined ? null : Number(row.rate_amount);
    const billableUnits = row.billable_units === null || row.billable_units === undefined ? null : Number(row.billable_units);
    const lineAmount = row.line_amount === null || row.line_amount === undefined ? null : Number(row.line_amount);

    if (!rateBasis) rateBasis = autoRateBasis(durationDays);
    if (!Number.isFinite(rateAmount) && Number.isFinite(billableUnits) && billableUnits > 0 && Number.isFinite(lineAmount)) {
      rateAmount = lineAmount / billableUnits;
    }
    if (!Number.isFinite(rateAmount) && Number.isFinite(lineAmount)) {
      rateAmount = lineAmount / durationDays;
      rateBasis = "daily";
    }
    if (!Number.isFinite(rateAmount)) rateAmount = 0;

    const entry = {
      typeId,
      lineItemId: Number(row.line_item_id),
      status,
      startMs,
      endMs,
      rateBasis,
      rateAmount,
      orderCreatedAt: row.order_created_at ? Date.parse(row.order_created_at) : 0,
    };

    if (!unassignedByType.has(typeId)) unassignedByType.set(typeId, []);
    unassignedByType.get(typeId).push(entry);
  }

  for (const [typeId, lines] of unassignedByType.entries()) {
    lines.sort((a, b) => {
      const aw = statusWeight(a.status);
      const bw = statusWeight(b.status);
      if (aw !== bw) return aw - bw;
      return (a.orderCreatedAt || 0) - (b.orderCreatedAt || 0);
    });
    unassignedByType.set(typeId, lines);
  }

  const effectivePerDay = (line, monthDays) => {
    if (!line) return 0;
    if (line.rateBasis === "monthly") return line.rateAmount / monthDays;
    if (line.rateBasis === "weekly") return line.rateAmount / 7;
    return line.rateAmount;
  };

  const rackPerDay = (equip, monthDays) => {
    const daily = Number(equip.rackDaily || 0);
    const weekly = Number(equip.rackWeekly || 0);
    const monthly = Number(equip.rackMonthly || 0);
    const weeklyPerDay = weekly > 0 ? weekly / 7 : 0;
    const monthlyPerDay = monthly > 0 ? monthly / monthDays : 0;
    return Math.max(daily, weeklyPerDay, monthlyPerDay);
  };

  const overlapsDay = (line, dayStartMs, dayEndMs) =>
    line.startMs < dayEndMs && line.endMs > dayStartMs;

  const selectLineForDay = (lines, dayStartMs, dayEndMs, monthDays, statusOrder) => {
    if (!lines || !lines.length) return null;
    for (const status of statusOrder) {
      let best = null;
      let bestValue = -Infinity;
      for (const line of lines) {
        if (line.status !== status) continue;
        if (!overlapsDay(line, dayStartMs, dayEndMs)) continue;
        const val = effectivePerDay(line, monthDays);
        if (val > bestValue) {
          bestValue = val;
          best = line;
          continue;
        }
        if (val === bestValue && best && line.orderCreatedAt < best.orderCreatedAt) {
          best = line;
        }
      }
      if (best) return best;
    }
    return null;
  };

  const computeDailyTotals = (startMs, endMs) => {
    const days = Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000));
    const dailyRows = [];
    for (let i = 0; i < days; i++) {
      const dayStartMs = startMs + i * 24 * 60 * 60 * 1000;
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
      const dayDate = new Date(dayStartMs);
      const monthDays = daysInUtcMonth(dayDate);

      let rackTotal = 0;
      let activeEffective = 0;
      let reservedEffective = 0;
      let activeRack = 0;
      let reservedRack = 0;
      let discountImpact = 0;
      const outCountByType = new Map();
      const reservedCountByType = new Map();

      for (const equip of equipment) {
        const rack = rackPerDay(equip, monthDays);
        rackTotal += rack;
        const lines = assignmentsByEquipment.get(equip.id) || [];
        const outLine = selectLineForDay(lines, dayStartMs, dayEndMs, monthDays, ["ordered"]);
        const reservedLine = outLine ? null : selectLineForDay(lines, dayStartMs, dayEndMs, monthDays, ["reservation", "requested"]);
        if (outLine) {
          const eff = effectivePerDay(outLine, monthDays);
          activeEffective += eff;
          activeRack += rack;
          discountImpact += rack - eff;
          if (Number.isFinite(equip.typeId)) {
            outCountByType.set(equip.typeId, (outCountByType.get(equip.typeId) || 0) + 1);
          }
        } else if (reservedLine) {
          const eff = effectivePerDay(reservedLine, monthDays);
          reservedEffective += eff;
          reservedRack += rack;
          discountImpact += rack - eff;
          if (Number.isFinite(equip.typeId)) {
            reservedCountByType.set(equip.typeId, (reservedCountByType.get(equip.typeId) || 0) + 1);
          }
        }
      }

      if (unassignedByType.size) {
        for (const [typeId, lines] of unassignedByType.entries()) {
          const typeEntry = equipmentByType.get(typeId);
          if (!typeEntry || !Number.isFinite(typeEntry.count) || typeEntry.count <= 0) continue;
          const outCount = outCountByType.get(typeId) || 0;
          const reservedCount = reservedCountByType.get(typeId) || 0;
          let available = typeEntry.count - outCount - reservedCount;
          if (available <= 0) continue;
          const rack = rackPerDay(typeEntry, monthDays);

          let allocated = 0;
          for (const line of lines) {
            if (allocated >= available) break;
            if (!overlapsDay(line, dayStartMs, dayEndMs)) continue;
            const eff = effectivePerDay(line, monthDays);
            reservedEffective += eff;
            reservedRack += rack;
            discountImpact += rack - eff;
            allocated += 1;
          }
        }
      }

      dailyRows.push({
        date: dayDate.toISOString().slice(0, 10),
        rackTotal,
        activeEffective,
        reservedEffective,
        activeRack,
        reservedRack,
        discountImpact,
      });
    }
    return dailyRows;
  };

  const daily = computeDailyTotals(rangeStartMs, rangeEndMs);

  const summary = daily.reduce(
    (acc, row) => {
      acc.rackTotal += row.rackTotal;
      acc.activeEffective += row.activeEffective;
      acc.reservedEffective += row.reservedEffective;
      acc.activeRack += row.activeRack;
      acc.reservedRack += row.reservedRack;
      acc.discountImpact += row.discountImpact;
      return acc;
    },
    {
      rackTotal: 0,
      activeEffective: 0,
      reservedEffective: 0,
      activeRack: 0,
      reservedRack: 0,
      discountImpact: 0,
    }
  );

  const useExpected = String(maxBasis || "").toLowerCase() === "expected";
  const maxPotential = useExpected
    ? summary.rackTotal - (summary.activeRack + summary.reservedRack) + (summary.activeEffective + summary.reservedEffective)
    : summary.rackTotal;
  const activeRevenue = summary.activeEffective;
  const reservedRevenue = summary.reservedEffective;
  const deadRevenue = Math.max(0, maxPotential - activeRevenue - reservedRevenue);
  const utilization = maxPotential > 0 ? (activeRevenue + reservedRevenue) / maxPotential : 0;

  const forwardDaily = computeDailyTotals(forwardStart.getTime(), forwardEnd.getTime());
  const forwardBuckets = new Map();
  for (const row of forwardDaily) {
    const key = row.date.slice(0, 7);
    if (!forwardBuckets.has(key)) {
      forwardBuckets.set(key, {
        bucket: key,
        rackTotal: 0,
        activeEffective: 0,
        reservedEffective: 0,
        activeRack: 0,
        reservedRack: 0,
        discountImpact: 0,
      });
    }
    const bucket = forwardBuckets.get(key);
    bucket.rackTotal += row.rackTotal;
    bucket.activeEffective += row.activeEffective;
    bucket.reservedEffective += row.reservedEffective;
    bucket.activeRack += row.activeRack;
    bucket.reservedRack += row.reservedRack;
    bucket.discountImpact += row.discountImpact;
  }

  const forward = [];
  let cursor = new Date(forwardStart.getTime());
  for (let i = 0; i < forwardCount; i++) {
    const key = cursor.toISOString().slice(0, 7);
    forward.push(forwardBuckets.get(key) || {
      bucket: key,
      rackTotal: 0,
      activeEffective: 0,
      reservedEffective: 0,
      activeRack: 0,
      reservedRack: 0,
      discountImpact: 0,
    });
    cursor = addUtcMonths(cursor, 1);
  }

  return {
    summary: {
      maxPotential,
      activeRevenue,
      reservedRevenue,
      deadRevenue,
      utilization,
      discountImpact: summary.discountImpact,
    },
    daily,
    forward,
  };
}

async function getRevenueSummary({
  companyId,
  from,
  to,
  groupBy = "location",
  pickupLocationId = null,
  typeId = null,
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const group = String(groupBy || "location").toLowerCase();
  const locId = pickupLocationId ? Number(pickupLocationId) : null;
  const tId = typeId ? Number(typeId) : null;

  const baseParams = [companyId, fromIso, toIso];
  const filters = [
    "ro.company_id = $1",
    "ro.status IN ('ordered','received','closed')",
    "li.start_at >= $2::timestamptz",
    "li.start_at < $3::timestamptz",
  ];
  if (Number.isFinite(locId)) {
    baseParams.push(locId);
    filters.push(`ro.pickup_location_id = $${baseParams.length}`);
  }
  if (Number.isFinite(tId)) {
    baseParams.push(tId);
    filters.push(`li.type_id = $${baseParams.length}`);
  }

  if (group === "type") {
    const res = await pool.query(
      `
      SELECT li.type_id AS key,
             et.name AS label,
             COALESCE(SUM(li.line_amount), 0) AS revenue
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN equipment_types et ON et.id = li.type_id
       WHERE ${filters.join(" AND ")}
       GROUP BY li.type_id, et.name
       ORDER BY revenue DESC, et.name ASC
      `,
      baseParams
    );
    return res.rows.map((r) => ({ key: r.key, label: r.label, revenue: Number(r.revenue || 0) }));
  }

  // default: location (pickup location)
  const res = await pool.query(
    `
    SELECT ro.pickup_location_id AS key,
           COALESCE(l.name, 'No pickup location') AS label,
           COALESCE(SUM(li.line_amount), 0) AS revenue
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${filters.join(" AND ")}
     GROUP BY ro.pickup_location_id, l.name
     ORDER BY revenue DESC, label ASC
    `,
    baseParams
  );
  return res.rows.map((r) => ({ key: r.key, label: r.label, revenue: Number(r.revenue || 0) }));
}

async function getRevenueTimeSeries({
  companyId,
  from,
  to,
  groupBy = "location",
  bucket = "month",
  pickupLocationId = null,
  typeId = null,
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const group = String(groupBy || "location").toLowerCase();
  const locId = pickupLocationId ? Number(pickupLocationId) : null;
  const tId = typeId ? Number(typeId) : null;

  const bucketSafe = ["day", "week", "month"].includes(String(bucket).toLowerCase()) ? String(bucket).toLowerCase() : "month";

  const params = [companyId, fromIso, toIso];
  const filters = [
    "ro.company_id = $1",
    "ro.status IN ('ordered','received','closed')",
    "li.start_at >= $2::timestamptz",
    "li.start_at < $3::timestamptz",
  ];
  if (Number.isFinite(locId)) {
    params.push(locId);
    filters.push(`ro.pickup_location_id = $${params.length}`);
  }
  if (Number.isFinite(tId)) {
    params.push(tId);
    filters.push(`li.type_id = $${params.length}`);
  }

  if (group === "type") {
    const res = await pool.query(
      `
      SELECT date_trunc('${bucketSafe}', li.start_at) AS bucket,
             li.type_id AS key,
             et.name AS label,
             COALESCE(SUM(li.line_amount), 0) AS revenue
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN equipment_types et ON et.id = li.type_id
       WHERE ${filters.join(" AND ")}
       GROUP BY bucket, li.type_id, et.name
       ORDER BY bucket ASC, revenue DESC, et.name ASC
      `,
      params
    );
    return res.rows.map((r) => ({
      bucket: r.bucket,
      key: r.key,
      label: r.label,
      revenue: Number(r.revenue || 0),
    }));
  }

  const res = await pool.query(
    `
    SELECT date_trunc('${bucketSafe}', li.start_at) AS bucket,
           ro.pickup_location_id AS key,
           COALESCE(l.name, 'No pickup location') AS label,
           COALESCE(SUM(li.line_amount), 0) AS revenue
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${filters.join(" AND ")}
     GROUP BY bucket, ro.pickup_location_id, l.name
     ORDER BY bucket ASC, revenue DESC, label ASC
    `,
    params
  );
  return res.rows.map((r) => ({
    bucket: r.bucket,
    key: r.key,
    label: r.label,
    revenue: Number(r.revenue || 0),
  }));
}

async function getSalespersonSummary({
  companyId,
  from,
  to,
  metric = "revenue",
  pickupLocationId = null,
  typeId = null,
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const metricSafe = String(metric || "revenue").toLowerCase() === "transactions" ? "transactions" : "revenue";
  const locId = pickupLocationId ? Number(pickupLocationId) : null;
  const tId = typeId ? Number(typeId) : null;

  const params = [companyId, fromIso, toIso];
  const filters = [
    "ro.company_id = $1",
    "ro.status IN ('ordered','received','closed')",
    "li.start_at >= $2::timestamptz",
    "li.start_at < $3::timestamptz",
  ];
  if (Number.isFinite(locId)) {
    params.push(locId);
    filters.push(`ro.pickup_location_id = $${params.length}`);
  }
  if (Number.isFinite(tId)) {
    params.push(tId);
    filters.push(`li.type_id = $${params.length}`);
  }

  const valueExpr = metricSafe === "transactions" ? "COUNT(DISTINCT ro.id)" : "COALESCE(SUM(li.line_amount), 0)";
  const res = await pool.query(
    `
    SELECT ro.salesperson_id AS key,
           COALESCE(sp.name, 'Unassigned') AS label,
           ${valueExpr} AS value
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
     WHERE ${filters.join(" AND ")}
     GROUP BY ro.salesperson_id, sp.name
     ORDER BY value DESC, label ASC
    `,
    params
  );
  return res.rows.map((r) => ({ key: r.key, label: r.label, value: Number(r.value || 0) }));
}

async function getSalespersonClosedTransactionsTimeSeries({
  companyId,
  salespersonId,
  from,
  to,
  bucket = "month",
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const spId = Number(salespersonId);
  if (!Number.isFinite(spId)) return [];

  const bucketSafe = ["day", "week", "month"].includes(String(bucket).toLowerCase()) ? String(bucket).toLowerCase() : "month";

  const res = await pool.query(
    `
    SELECT date_trunc('${bucketSafe}', ro.updated_at) AS bucket,
           COUNT(*)::int AS transactions
      FROM rental_orders ro
     WHERE ro.company_id = $1
       AND ro.salesperson_id = $2
       AND ro.status = 'closed'
       AND ro.updated_at >= $3::timestamptz
       AND ro.updated_at < $4::timestamptz
     GROUP BY bucket
     ORDER BY bucket ASC
    `,
    [companyId, spId, fromIso, toIso]
  );

  return res.rows.map((r) => ({ bucket: r.bucket, transactions: Number(r.transactions || 0) }));
}

async function getLocationClosedTransactionsTimeSeries({
  companyId,
  locationId,
  from,
  to,
  bucket = "month",
} = {}) {
  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  if (!fromIso || !toIso) return [];

  const locId = Number(locationId);
  if (!Number.isFinite(locId)) return [];

  const bucketSafe = ["day", "week", "month"].includes(String(bucket).toLowerCase()) ? String(bucket).toLowerCase() : "month";

  const res = await pool.query(
    `
    SELECT date_trunc('${bucketSafe}', ro.updated_at) AS bucket,
           COUNT(*)::int AS transactions
      FROM rental_orders ro
     WHERE ro.company_id = $1
       AND ro.pickup_location_id = $2
       AND ro.status = 'closed'
       AND ro.updated_at >= $3::timestamptz
       AND ro.updated_at < $4::timestamptz
     GROUP BY bucket
     ORDER BY bucket ASC
    `,
    [companyId, locId, fromIso, toIso]
  );

  return res.rows.map((r) => ({ bucket: r.bucket, transactions: Number(r.transactions || 0) }));
}

async function getLocationTypeStockSummary({ companyId, locationId, at = null } = {}) {
  const locId = Number(locationId);
  if (!Number.isFinite(locId)) return [];

  const atIso = at ? normalizeTimestamptz(at) : new Date().toISOString();
  if (!atIso) return [];

  const stockRes = await pool.query(
    `
    SELECT e.type_id,
           COALESCE(et.name, e.type) AS type_name,
           COUNT(*)::int AS total,
           SUM(CASE WHEN e.condition IN ('New','Normal Wear & Tear') THEN 1 ELSE 0 END)::int AS usable
      FROM equipment e
 LEFT JOIN equipment_types et ON et.id = e.type_id
     WHERE e.company_id = $1
       AND e.location_id = $2
       AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
     GROUP BY e.type_id, type_name
     ORDER BY type_name ASC
    `,
    [companyId, locId]
  );

  const demandRes = await pool.query(
    `
    SELECT li.id,
           li.type_id,
           COALESCE(et.name, 'Unknown type') AS type_name,
           CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
 LEFT JOIN equipment_types et ON et.id = li.type_id
     WHERE ro.company_id = $1
       AND ro.pickup_location_id = $2
       AND ro.status IN ('quote','requested','reservation','ordered')
       AND COALESCE(li.fulfilled_at, li.start_at) <= $3::timestamptz
       AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $3::timestamptz
     GROUP BY li.id, li.type_id, et.name
    `,
    [companyId, locId, atIso]
  );

  const byType = new Map();
  stockRes.rows.forEach((row) => {
    const key = String(row.type_id ?? "none");
    byType.set(key, {
      typeId: row.type_id === null || row.type_id === undefined ? null : Number(row.type_id),
      typeName: row.type_name,
      total: Number(row.total || 0),
      usable: Number(row.usable || 0),
      demand: 0,
    });
  });

  demandRes.rows.forEach((row) => {
    const key = String(row.type_id ?? "none");
    if (!byType.has(key)) {
      byType.set(key, {
        typeId: row.type_id === null || row.type_id === undefined ? null : Number(row.type_id),
        typeName: row.type_name || "Unknown type",
        total: 0,
        usable: 0,
        demand: 0,
      });
    }
    const entry = byType.get(key);
    entry.demand += Number(row.qty || 0);
  });

  return Array.from(byType.values())
    .sort((a, b) => String(a.typeName).localeCompare(String(b.typeName)))
    .map((row) => {
      const available = row.usable - row.demand;
      return {
        typeId: row.typeId,
        typeName: row.typeName,
        total: row.total,
        available,
        unavailable: row.total - available,
      };
    });
}

async function getRentalOrder({ companyId, id }) {
  const headerRes = await pool.query(
    `
    SELECT ro.*,
           c.company_name AS customer_name,
           c.contact_name AS customer_contact_name,
           c.street_address AS customer_street_address,
           c.city AS customer_city,
           c.region AS customer_region,
           c.country AS customer_country,
           c.postal_code AS customer_postal_code,
           c.email AS customer_email,
           c.phone AS customer_phone,
           sp.name AS salesperson_name,
           l.name AS pickup_location_name,
           l.street_address AS pickup_street_address,
           l.city AS pickup_city,
           l.region AS pickup_region,
           l.country AS pickup_country,
           CASE
             WHEN ro.status = 'ordered'
              AND EXISTS (
                SELECT 1
                  FROM rental_order_line_items li
                 WHERE li.rental_order_id = ro.id
                   AND li.returned_at IS NULL
                   AND li.end_at < NOW()
              )
             THEN TRUE
             ELSE FALSE
           END AS is_overdue
      FROM rental_orders ro
      JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ro.company_id = $1 AND ro.id = $2
     LIMIT 1
    `,
    [companyId, id]
  );
  const order = headerRes.rows[0];
  if (!order) return null;

  const lineRes = await pool.query(
    `
    SELECT li.id, li.type_id, et.name AS type_name, li.start_at, li.end_at,
           li.fulfilled_at, li.returned_at,
           li.rate_basis, li.rate_amount, li.billable_units, li.line_amount,
           li.bundle_id, b.name AS bundle_name,
           cond.before_notes, cond.after_notes, cond.before_images, cond.after_images,
           cond.pause_periods, cond.ai_report_markdown, cond.ai_report_generated_at
      FROM rental_order_line_items li
      JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN equipment_bundles b ON b.id = li.bundle_id
 LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
     WHERE li.rental_order_id = $1
     ORDER BY li.id
    `,
    [id]
  );
  const lineItems = lineRes.rows.map((r) => ({
    id: r.id,
    typeId: r.type_id,
    typeName: r.type_name,
    startAt: r.start_at,
    endAt: r.end_at,
    fulfilledAt: r.fulfilled_at || null,
    returnedAt: r.returned_at || null,
    rateBasis: r.rate_basis || null,
    rateAmount: r.rate_amount === null || r.rate_amount === undefined ? null : Number(r.rate_amount),
    billableUnits: r.billable_units === null || r.billable_units === undefined ? null : Number(r.billable_units),
    lineAmount: r.line_amount === null || r.line_amount === undefined ? null : Number(r.line_amount),
    bundleId: r.bundle_id === null || r.bundle_id === undefined ? null : Number(r.bundle_id),
    bundleName: r.bundle_name || null,
    bundleItems: [],
    inventoryIds: [],
    inventoryDetails: [],
    beforeNotes: r.before_notes || "",
    afterNotes: r.after_notes || "",
    beforeImages: r.before_images || [],
    afterImages: r.after_images || [],
    pausePeriods: Array.isArray(r.pause_periods) ? r.pause_periods : [],
    aiDamageReport: r.ai_report_markdown || "",
    aiDamageReportGeneratedAt: r.ai_report_generated_at || null,
  }));

  const invRes = await pool.query(
    `
    SELECT liv.line_item_id,
           liv.equipment_id,
           e.serial_number,
           e.model_name,
           l.name AS location
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN equipment e ON e.id = liv.equipment_id
 LEFT JOIN locations l ON l.id = e.location_id
     WHERE li.rental_order_id = $1
     ORDER BY liv.line_item_id, liv.equipment_id
    `,
    [id]
  );
  const byLine = new Map();
  lineItems.forEach((li) => byLine.set(String(li.id), li));
  invRes.rows.forEach((r) => {
    const li = byLine.get(String(r.line_item_id));
    if (!li) return;
    li.inventoryIds.push(r.equipment_id);
    if (!Array.isArray(li.inventoryDetails)) li.inventoryDetails = [];
    li.inventoryDetails.push({
      id: r.equipment_id,
      serial_number: r.serial_number || "",
      model_name: r.model_name || "",
      location: r.location || "",
    });
  });

  const bundleIds = Array.from(new Set(lineItems.map((li) => li.bundleId).filter((id) => Number.isFinite(id))));
  if (bundleIds.length) {
    const bundleItemsRes = await pool.query(
      `
      SELECT bi.bundle_id,
             e.id,
             e.serial_number,
             e.model_name,
             COALESCE(et.name, e.type) AS type_name
        FROM equipment_bundle_items bi
        JOIN equipment e ON e.id = bi.equipment_id
   LEFT JOIN equipment_types et ON et.id = e.type_id
       WHERE bi.bundle_id = ANY($1::int[])
       ORDER BY bi.bundle_id, e.serial_number
      `,
      [bundleIds]
    );
    const bundleMap = new Map();
    bundleItemsRes.rows.forEach((row) => {
      const key = String(row.bundle_id);
      if (!bundleMap.has(key)) bundleMap.set(key, []);
      bundleMap.get(key).push({
        id: row.id,
        serialNumber: row.serial_number || "",
        modelName: row.model_name || "",
        typeName: row.type_name || "",
      });
    });
    lineItems.forEach((li) => {
      if (!li.bundleId) return;
      li.bundleItems = bundleMap.get(String(li.bundleId)) || [];
    });
  }

  const feesRes = await pool.query(
    `
    SELECT f.id,
           f.name,
           f.amount,
           EXISTS (
             SELECT 1
               FROM invoice_line_items ili
               JOIN invoices i ON i.id = ili.invoice_id
              WHERE i.rental_order_id = f.rental_order_id
                AND ili.fee_id = f.id
           ) AS invoiced
      FROM rental_order_fees f
     WHERE f.rental_order_id = $1
     ORDER BY f.id
    `,
    [id]
  );
  const notesRes = await pool.query(
    `SELECT id, user_name, note, created_at FROM rental_order_notes WHERE rental_order_id = $1 ORDER BY created_at`,
    [id]
  );
  const attachmentsRes = await pool.query(
    `SELECT id, file_name, mime, size_bytes, url, category, created_at FROM rental_order_attachments WHERE rental_order_id = $1 ORDER BY created_at`,
    [id]
  );

  return {
    order,
    lineItems,
    fees: feesRes.rows,
    notes: notesRes.rows,
    attachments: attachmentsRes.rows,
  };
}

async function createRentalOrder({
  companyId,
  customerId,
  externalContractNumber,
  legacyData,
  createdAt,
  customerPo,
  salespersonId,
  actorName,
  actorEmail,
  fulfillmentMethod = "pickup",
  status = "quote",
  terms,
  generalNotes,
  pickupLocationId,
  dropoffAddress,
  siteAddress,
  logisticsInstructions,
  specialInstructions,
  criticalAreas,
  coverageHours,
  emergencyContacts,
  siteContacts,
  lineItems = [],
  fees = [],
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getCompanySettings(companyId);
    const normalizedStatus = normalizeRentalOrderStatus(status);
    const demandOnly = isDemandOnlyStatus(normalizedStatus);
    const allowsInventory = allowsInventoryAssignment(normalizedStatus);
    const emergencyContactList = normalizeOrderContacts(emergencyContacts);
    const siteContactList = normalizeOrderContacts(siteContacts);
    const coverageHoursValue = normalizeCoverageHours(coverageHours);
    const effectiveDate = createdAt ? new Date(createdAt) : new Date();
    const quoteNumber = isQuoteStatus(normalizedStatus) ? await nextDocumentNumber(client, companyId, "QO", effectiveDate) : null;
    const roNumber = !isQuoteStatus(normalizedStatus) ? await nextDocumentNumber(client, companyId, "RO", effectiveDate) : null;
    const createdIso = normalizeTimestamptz(createdAt) || null;
    const bundleCache = new Map();
    const getBundleData = async (bundleId) => {
      const key = String(bundleId);
      if (bundleCache.has(key)) return bundleCache.get(key);
      const headerRes = await client.query(
        `
        SELECT b.id,
               b.primary_equipment_id,
               pe.type_id AS primary_type_id
          FROM equipment_bundles b
     LEFT JOIN equipment pe ON pe.id = b.primary_equipment_id
         WHERE b.company_id = $1 AND b.id = $2
         LIMIT 1
        `,
        [companyId, bundleId]
      );
      const row = headerRes.rows[0];
      if (!row) throw new Error("Bundle not found.");
      const itemsRes = await client.query(
        `SELECT equipment_id FROM equipment_bundle_items WHERE bundle_id = $1 ORDER BY equipment_id`,
        [bundleId]
      );
      const data = {
        id: Number(row.id),
        primaryEquipmentId: row.primary_equipment_id === null ? null : Number(row.primary_equipment_id),
        primaryTypeId: row.primary_type_id === null || row.primary_type_id === undefined ? null : Number(row.primary_type_id),
        equipmentIds: itemsRes.rows.map((r) => Number(r.equipment_id)).filter((v) => Number.isFinite(v)),
      };
      bundleCache.set(key, data);
      return data;
    };
    const headerRes = await client.query(
      `
      INSERT INTO rental_orders
        (company_id, quote_number, ro_number, external_contract_number, legacy_data, customer_id, customer_po, salesperson_id, fulfillment_method, status,
         terms, general_notes, pickup_location_id, dropoff_address, site_address, logistics_instructions, special_instructions, critical_areas, coverage_hours, emergency_contacts, site_contacts, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,$21::jsonb,COALESCE($22::timestamptz, NOW()),COALESCE($22::timestamptz, NOW()))
      RETURNING id, quote_number, ro_number
      `,
      [
        companyId,
        quoteNumber,
        roNumber,
        externalContractNumber || null,
        JSON.stringify(legacyData || {}),
        customerId,
        customerPo || null,
        salespersonId || null,
        fulfillmentMethod || "pickup",
        normalizedStatus,
        terms || null,
        generalNotes || null,
        pickupLocationId || null,
        fulfillmentMethod === "dropoff" ? (dropoffAddress || null) : null,
        siteAddress || null,
        logisticsInstructions || null,
        specialInstructions || null,
        criticalAreas || null,
        JSON.stringify(coverageHoursValue),
        JSON.stringify(emergencyContactList),
        JSON.stringify(siteContactList),
        createdIso,
      ]
    );
    const orderId = headerRes.rows[0].id;

    for (const item of lineItems || []) {
      const startAt = normalizeTimestamptz(item.startAt);
      const endAt = normalizeTimestamptz(item.endAt);
      const bundleId = item.bundleId ? Number(item.bundleId) : null;
      const bundleData = Number.isFinite(bundleId) ? await getBundleData(bundleId) : null;
      const effectiveTypeId = bundleData?.primaryTypeId || item.typeId;
      if (!effectiveTypeId || !startAt || !endAt) continue;
      const rateBasis = normalizeRateBasis(item.rateBasis);
      const rateAmount = item.rateAmount === "" || item.rateAmount === null || item.rateAmount === undefined ? null : Number(item.rateAmount);
      const billableUnitsOverride =
        item.billableUnits === "" || item.billableUnits === null || item.billableUnits === undefined
          ? null
          : Number(item.billableUnits);
      const lineAmountOverride =
        item.lineAmount === "" || item.lineAmount === null || item.lineAmount === undefined
          ? null
          : Number(item.lineAmount);
      const fulfilledAt = normalizeTimestamptz(item.fulfilledAt) || null;
      const returnedAt = fulfilledAt ? normalizeTimestamptz(item.returnedAt) || null : null;
      const pausePeriods = normalizePausePeriods(item.pausePeriods);
      const rawInventoryIds = Array.isArray(item.inventoryIds) ? item.inventoryIds : [];
      const inventoryIds = allowsInventory
        ? bundleData
          ? bundleData.equipmentIds
          : rawInventoryIds
        : [];
      if (bundleData && allowsInventory && !inventoryIds.length) {
        throw new Error("Bundle has no equipment assigned.");
      }
      const qty = bundleData ? 1 : inventoryIds.length;
      const effectiveQty = bundleData ? 1 : (qty || (demandOnly ? 1 : 0));
      const computedUnits = computeBillableUnits({
        startAt,
        endAt,
        rateBasis,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
      });
      const billableUnits =
        Number.isFinite(billableUnitsOverride) && billableUnitsOverride > 0 ? billableUnitsOverride : computedUnits;
      const lineAmount =
        Number.isFinite(lineAmountOverride)
          ? lineAmountOverride
          : rateAmount !== null && Number.isFinite(rateAmount) && billableUnits !== null && Number.isFinite(billableUnits)
            ? Number((rateAmount * billableUnits * effectiveQty).toFixed(2))
            : null;
      const liRes = await client.query(
        `INSERT INTO rental_order_line_items (rental_order_id, type_id, bundle_id, start_at, end_at, fulfilled_at, returned_at, rate_basis, rate_amount, billable_units, line_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          orderId,
          effectiveTypeId,
          bundleData ? bundleData.id : null,
          startAt,
          endAt,
          fulfilledAt,
          returnedAt,
          rateBasis,
          Number.isFinite(rateAmount) ? rateAmount : null,
          billableUnits,
          lineAmount,
        ]
      );
      const lineItemId = liRes.rows[0].id;
      for (const equipmentId of inventoryIds) {
        await client.query(
          `INSERT INTO rental_order_line_inventory (line_item_id, equipment_id) VALUES ($1,$2)`,
          [lineItemId, equipmentId]
        );
      }
      await client.query(
        `
        INSERT INTO rental_order_line_conditions
          (line_item_id, before_notes, after_notes, before_images, after_images, pause_periods, ai_report_markdown, ai_report_generated_at)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)
        `,
        [
          lineItemId,
          item.beforeNotes || null,
          item.afterNotes || null,
          JSON.stringify(item.beforeImages || []),
          JSON.stringify(item.afterImages || []),
          JSON.stringify(pausePeriods),
          item.aiDamageReport || null,
          item.aiDamageReport ? new Date().toISOString() : null,
        ]
      );
    }

    for (const fee of fees || []) {
      const name = String(fee.name || "").trim();
      if (!name) continue;
      const amount = fee.amount === "" || fee.amount === null || fee.amount === undefined ? 0 : Number(fee.amount);
      await client.query(
        `INSERT INTO rental_order_fees (rental_order_id, name, amount) VALUES ($1,$2,$3)`,
        [orderId, name, Number.isFinite(amount) ? amount : 0]
      );
    }

    await insertRentalOrderAudit({
      client,
      companyId,
      orderId,
      actorName,
      actorEmail,
      action: "create",
      summary: `Created ${isQuoteStatus(normalizedStatus) ? "quote" : "rental order"}.`,
      changes: {
        status: normalizedStatus,
        customerId,
        pickupLocationId: pickupLocationId || null,
        salespersonId: salespersonId || null,
        fulfillmentMethod: fulfillmentMethod || "pickup",
        lineItemsCount: Array.isArray(lineItems) ? lineItems.length : 0,
        feesCount: Array.isArray(fees) ? fees.length : 0,
      },
    });

    await client.query("COMMIT");
    return { id: orderId, quoteNumber: headerRes.rows[0].quote_number, roNumber: headerRes.rows[0].ro_number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function normalizeLegacyHeaderName(value) {
  return String(value || "")
    .trim()
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ");
}

function parseLegacyDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = normalizeTimestamptz(raw);
  if (iso) return iso;

  const m = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM))?$/i
  );
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const yyyy = Number(m[3]);
  let hh = m[4] ? Number(m[4]) : 0;
  const min = m[5] ? Number(m[5]) : 0;
  const ampm = (m[6] || "").toUpperCase();
  if (ampm === "PM" && hh < 12) hh += 12;
  if (ampm === "AM" && hh === 12) hh = 0;
  const d = new Date(yyyy, mm - 1, dd, hh, min, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function firstEmailIn(value) {
  const raw = String(value ?? "");
  const m = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0] : "";
}

function normalizeSerialKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeModelKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitCsvishList(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function parseLegacyDurationParts(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const parts = {
    years: 0,
    months: 0,
    weeks: 0,
    days: 0,
    hours: 0,
    minutes: 0,
  };
  const rx = /(\d+(?:\.\d+)?)\s*(year|month|week|day|hour|minute)\(s\)/g;
  let m;
  while ((m = rx.exec(raw))) {
    const n = Number(m[1]);
    if (!Number.isFinite(n)) continue;
    const unit = m[2];
    if (unit === "year") parts.years += n;
    else if (unit === "month") parts.months += n;
    else if (unit === "week") parts.weeks += n;
    else if (unit === "day") parts.days += n;
    else if (unit === "hour") parts.hours += n;
    else if (unit === "minute") parts.minutes += n;
  }
  const total =
    parts.years +
    parts.months +
    parts.weeks +
    parts.days +
    parts.hours +
    parts.minutes;
  if (!total) return null;
  return parts;
}

function rateBasisFromLegacyDuration(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes("year")) return "monthly";
  if (raw.includes("month")) return "monthly";
  if (raw.includes("week")) return "weekly";
  if (raw.includes("day")) return "daily";
  return null;
}

function inferRateBasisFromDates(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const days = (endMs - startMs) / (24 * 60 * 60 * 1000);
  if (!Number.isFinite(days) || days <= 0) return null;
  if (days >= 30) return "monthly";
  if (days >= 7) return "weekly";
  return "daily";
}

function addLegacyDurationToStart(startIso, parts) {
  if (!startIso || !parts) return null;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  const d = new Date(start);
  const years = Number(parts.years || 0);
  const months = Number(parts.months || 0);
  if (Number.isFinite(years) && years) d.setFullYear(d.getFullYear() + years);
  if (Number.isFinite(months) && months) d.setMonth(d.getMonth() + months);
  const ms =
    (Number(parts.weeks || 0) * 7 + Number(parts.days || 0)) * 24 * 60 * 60 * 1000 +
    Number(parts.hours || 0) * 60 * 60 * 1000 +
    Number(parts.minutes || 0) * 60 * 1000;
  if (Number.isFinite(ms) && ms) d.setTime(d.getTime() + ms);
  if (Number.isNaN(d.getTime()) || d.getTime() <= start.getTime()) return null;
  return d.toISOString();
}

function mapLegacyStatus({ contractNumber, statusCode, cancelled, completed }) {
  const contract = String(contractNumber || "").trim().toUpperCase();
  if (contract.startsWith("Q-")) return "quote";
  if (contract.startsWith("R-")) return "reservation";
  if (cancelled) return "quote_rejected";
  const raw = String(statusCode || "").trim().toLowerCase();
  if (raw.includes("quote")) return "quote";
  if (raw.includes("reserved")) return "reservation";
  if (raw.includes("returned")) return "closed";
  if (raw.includes("order")) return "ordered";
  if (raw.includes("out")) return "ordered";
  if (completed) return "closed";
  return "quote";
}

function overrideImportStatusForUnreturnedItems(status, lineItems) {
  const normalized = normalizeRentalOrderStatus(status);
  if (normalized !== "closed") return normalized;
  const items = Array.isArray(lineItems) ? lineItems : [];
  const hasUnreturned = items.some((item) => item?.fulfilledAt && !item?.returnedAt);
  return hasUnreturned ? "ordered" : normalized;
}

function parseLegacyExport(text) {
  if (!text) return null;
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedRows(text, delimiter).filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
  if (rows.length < 2) return null;
  const header = rows[0].map(normalizeLegacyHeaderName);
  const indexByName = new Map();
  header.forEach((name, idx) => {
    if (name) indexByName.set(name, idx);
  });
  const get = (row, names) => {
    for (const name of names) {
      const idx = indexByName.get(name);
      if (idx === undefined) continue;
      const v = String(row[idx] ?? "").trim();
      if (v) return v;
    }
    return "";
  };
  return { rows: rows.slice(1), get, header };
}

async function importRentalOrdersFromLegacyExports({ companyId, transactionsText, instancesText, salesReportText, futureReportText }) {
  if (!companyId) throw new Error("companyId is required.");
  if (!transactionsText || !instancesText) throw new Error("Both legacy export files are required.");

  const tx = parseLegacyExport(transactionsText);
  const inst = parseLegacyExport(instancesText);
  if (!tx || !inst) return { ordersCreated: 0, ordersSkipped: 0, customersCreated: 0, typesUpserted: 0, equipmentCreated: 0, warnings: [], errors: [] };

  const existingCustomers = await pool.query(`SELECT id, company_name, email, phone FROM customers WHERE company_id = $1`, [companyId]);
  const customerIdByCompany = new Map(existingCustomers.rows.map((r) => [normalizeCustomerMatchKey(r.company_name), r.id]));
  const customerIdByEmail = new Map(existingCustomers.rows.filter((r) => r.email).map((r) => [normalizeCustomerMatchKey(r.email), r.id]));
  const customerIdByPhone = new Map(
    existingCustomers.rows
      .map((r) => ({ key: normalizePhoneKey(r.phone), id: r.id }))
      .filter((r) => r.key)
      .map((r) => [r.key, r.id])
  );

  const existingEquipment = await pool.query(
    `SELECT id, serial_number, model_name, type_id FROM equipment WHERE company_id = $1`,
    [companyId]
  );
  const equipmentIdBySerial = new Map(existingEquipment.rows.map((r) => [normalizeSerialKey(r.serial_number), r.id]));
  const equipmentIdsByModel = new Map();
  const equipmentIdsByTypeAndModel = new Map();
  existingEquipment.rows.forEach((r) => {
    const modelKey = normalizeModelKey(r.model_name);
    if (!modelKey) return;

    if (!equipmentIdsByModel.has(modelKey)) equipmentIdsByModel.set(modelKey, []);
    equipmentIdsByModel.get(modelKey).push(r.id);

    if (r.type_id) {
      const tmKey = `${String(r.type_id)}|${modelKey}`;
      if (!equipmentIdsByTypeAndModel.has(tmKey)) equipmentIdsByTypeAndModel.set(tmKey, []);
      equipmentIdsByTypeAndModel.get(tmKey).push(r.id);
    }
  });

  const existingContracts = await pool.query(
    `SELECT external_contract_number FROM rental_orders WHERE company_id = $1 AND external_contract_number IS NOT NULL`,
    [companyId]
  );
  const existingContractSet = new Set(existingContracts.rows.map((r) => String(r.external_contract_number).trim()));
  const { contractToSalesperson, salespersonIdByName } = await buildSalespersonLookup({ companyId, salesReportText });
  const futureReturnByContractSerial = futureReportText ? parseFutureReturnMap(futureReportText) : new Map();
  const resolveSalespersonId = async (salespersonName) => {
    const key = normalizeSalespersonKey(salespersonName);
    if (!key || isNoSalespersonValue(salespersonName)) return null;
    const existing = salespersonIdByName.get(key);
    if (existing) return existing;
    const created = await createSalesPerson({ companyId, name: salespersonName, email: null, phone: null, imageUrl: null });
    if (created?.id) salespersonIdByName.set(key, created.id);
    return created?.id || null;
  };

  const stats = {
    ordersCreated: 0,
    ordersSkipped: 0,
    customersCreated: 0,
    typesUpserted: 0,
    equipmentCreated: 0,
    placeholderSerialsCreated: 0,
    endDatesInferred: 0,
    warnings: [],
    errors: [],
  };

  const lineGroupsByContract = new Map();
  const settings = await getCompanySettings(companyId);

  const rowToObject = (parsed, row) => {
    const obj = {};
    for (let i = 0; i < parsed.header.length; i += 1) {
      const k = parsed.header[i];
      if (!k) continue;
      const v = String(row[i] ?? "").trim();
      if (!v) continue;
      obj[k] = v;
    }
    return obj;
  };

  const ingestRows = (sourceName, parsed) => {
    for (const row of parsed.rows) {
      const contractNumber = parsed.get(row, ["Contract #", "Contract#", "Contract"]);
      if (!contractNumber) continue;

      const companyName = parsed.get(row, ["Company Name"]) || parsed.get(row, ["Customer Name"]) || "Unknown";
      const contactName = parsed.get(row, ["Customer Name"]);
      const email = firstEmailIn(parsed.get(row, ["Email"])) || firstEmailIn(parsed.get(row, ["Address"])) || firstEmailIn(parsed.get(row, ["Customer Name"]));
      const phone = parsed.get(row, ["Primary Phone", "Phone"]);
      const address = parsed.get(row, ["Address"]);
      const postalCode = parsed.get(row, ["Postal Code", "Postal"]);

      const itemName = parsed.get(row, ["Item"]) || "Unknown item";
      const categoryName = parsed.get(row, ["Category"]);
      const manufacturer = parsed.get(row, ["Manufacturer"]);
      const modelRaw = parsed.get(row, ["Model"]);
      const serialRaw = parsed.get(row, ["Serial Number", "Serial"]);
      const qtyRaw = parsed.get(row, ["Quantity"]);
      const quantity = Number.parseInt(String(qtyRaw || "0"), 10) || 0;

      const createdIso = parseLegacyDateTime(parsed.get(row, ["Created"])) || null;
      const startIso =
        parseLegacyDateTime(parsed.get(row, ["Start Time"])) ||
        parseLegacyDateTime(parsed.get(row, ["Start"])) ||
        null;
      let endIso = parseLegacyDateTime(parsed.get(row, ["Due"])) || null;

      const chargedDuration = parsed.get(row, ["Charged Duration"]);
      const durationParts = parseLegacyDurationParts(chargedDuration);
      if (!endIso && startIso && durationParts) endIso = addLegacyDurationToStart(startIso, durationParts);
      if (!endIso && startIso) {
        const fallback = new Date(startIso);
        if (!Number.isNaN(fallback.getTime())) {
          fallback.setDate(fallback.getDate() + 30);
          endIso = fallback.toISOString();
        }
      }
      const endInferred = !!endIso && !parseLegacyDateTime(parsed.get(row, ["Due"])) && !!startIso;

      const statusCode = parsed.get(row, ["Status Code", "Status"]);
      const cancelled = parseYesNo(parsed.get(row, ["Transaction Cancelled", "Cancelled"]));
      const completed = parseYesNo(parsed.get(row, ["Completed"]));

      const totals = {
        totalNoTax: parseMoney(parsed.get(row, ["Total (no tax)", "Total (no tax)"])),
        grandTotal: parseMoney(parsed.get(row, ["GrandTotal", "Grand Total"])),
        amountPaid: parseMoney(parsed.get(row, ["Amount Paid"])),
      };

      const serials = splitCsvishList(serialRaw).filter((s) => !["unallocated", "unserialized item"].includes(s.toLowerCase()));
      const models = splitCsvishList(modelRaw);

      const contractKey = String(contractNumber).trim();
      if (!lineGroupsByContract.has(contractKey)) lineGroupsByContract.set(contractKey, []);
      lineGroupsByContract.get(contractKey).push({
        sourceName,
        contractNumber: contractKey,
        companyName,
        contactName,
        email,
        phone,
        address,
        postalCode,
        itemName,
        categoryName,
        manufacturer,
        quantity,
        createdIso,
        startIso,
        endIso,
        endInferred,
        chargedDuration,
        statusCode,
        cancelled,
        completed,
        totals,
        serials,
        models,
        raw: rowToObject(parsed, row),
      });
    }
  };

  ingestRows("transactions", tx);
  ingestRows("instances", inst);

  const contractNumbers = Array.from(lineGroupsByContract.keys());
  if (!contractNumbers.length) return stats;

  for (const contractNumber of contractNumbers) {
    if (existingContractSet.has(contractNumber)) {
      stats.ordersSkipped += 1;
      continue;
    }

    const lines = lineGroupsByContract.get(contractNumber) || [];
    if (!lines.length) continue;
    const first = lines[0];

    let status = mapLegacyStatus({
      contractNumber,
      statusCode: first.statusCode,
      cancelled: !!first.cancelled,
      completed: !!first.completed,
    });
    const demandOnly = isDemandOnlyStatus(status);
    const customerKey = normalizeCustomerMatchKey(first.companyName);
    const emailKey = normalizeCustomerMatchKey(first.email);
    const phoneKey = normalizePhoneKey(first.phone);
    let customerId =
      (emailKey && customerIdByEmail.get(emailKey)) ||
      (phoneKey && customerIdByPhone.get(phoneKey)) ||
      customerIdByCompany.get(customerKey) ||
      null;

    if (!customerId) {
      const createdCustomer = await createCustomer({
        companyId,
        companyName: first.companyName,
        contactName: first.contactName || null,
        streetAddress: first.address || null,
        city: null,
        region: null,
        country: null,
        postalCode: first.postalCode || null,
        email: first.email || null,
        phone: first.phone || null,
        canChargeDeposit: false,
        notes: `Imported from legacy exports. Contract: ${contractNumber}`,
      });
      customerId = createdCustomer?.id || null;
      if (customerId) {
        customerIdByCompany.set(customerKey, customerId);
        if (emailKey) customerIdByEmail.set(emailKey, customerId);
        if (phoneKey) customerIdByPhone.set(phoneKey, customerId);
        stats.customersCreated += 1;
      }
    }

    if (!customerId) {
      stats.errors.push({ contractNumber, error: "Unable to resolve customer." });
      continue;
    }

    const salespersonName = contractToSalesperson.get(contractNumber) || null;
    const salespersonId = salespersonName ? await resolveSalespersonId(salespersonName) : null;

    const lineItemGroups = new Map();
    for (const line of lines) {
      if (!line.itemName || !line.startIso || !line.endIso) continue;
      const groupKey = `${normalizeCustomerMatchKey(line.itemName)}|${line.startIso}|${line.endIso}`;
      if (!lineItemGroups.has(groupKey)) lineItemGroups.set(groupKey, []);
      lineItemGroups.get(groupKey).push(line);
    }

    const lineItems = [];
    const usedEquipmentIdsForContract = new Set();

    const sumTotals = (rows) => {
      const totals = { totalNoTax: 0, grandTotal: 0, amountPaid: 0 };
      let hasTotalNoTax = false;
      let hasGrandTotal = false;
      let hasAmountPaid = false;
      for (const r of rows) {
        const t = r?.totals || {};
        if (Number.isFinite(t.totalNoTax)) {
          totals.totalNoTax += t.totalNoTax;
          hasTotalNoTax = true;
        }
        if (Number.isFinite(t.grandTotal)) {
          totals.grandTotal += t.grandTotal;
          hasGrandTotal = true;
        }
        if (Number.isFinite(t.amountPaid)) {
          totals.amountPaid += t.amountPaid;
          hasAmountPaid = true;
        }
      }
      return {
        totalNoTax: hasTotalNoTax ? Number(totals.totalNoTax.toFixed(2)) : null,
        grandTotal: hasGrandTotal ? Number(totals.grandTotal.toFixed(2)) : null,
        amountPaid: hasAmountPaid ? Number(totals.amountPaid.toFixed(2)) : null,
      };
    };

    for (const group of lineItemGroups.values()) {
      const txLines = group.filter((g) => g.sourceName === "transactions");
      const instLines = group.filter((g) => g.sourceName === "instances");
      const baseLine = txLines[0] || instLines[0] || group[0];

      const qtyFromTx = txLines.reduce((sum, r) => sum + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);
      const qtyFromInst = instLines.reduce((sum, r) => sum + (Number.isFinite(r.quantity) ? r.quantity : 0), 0);

      const serialsFromInst = instLines.flatMap((r) => r.serials || []);
      const serialsFromTx = txLines.flatMap((r) => r.serials || []);
      const rawSerials = serialsFromInst.length ? serialsFromInst : serialsFromTx;
      const serials = Array.from(new Set(rawSerials.map(String).filter(Boolean)));

      const modelsFromInst = instLines.flatMap((r) => r.models || []);
      const modelsFromTx = txLines.flatMap((r) => r.models || []);
      const rawModels = modelsFromInst.length ? modelsFromInst : modelsFromTx;
      const models = rawModels.map(String).filter(Boolean);

      const totalsFromTx = sumTotals(txLines);
      const totalsFromInst = sumTotals(instLines);
      const totals = totalsFromTx.totalNoTax !== null || totalsFromTx.grandTotal !== null || totalsFromTx.amountPaid !== null
        ? totalsFromTx
        : totalsFromInst;

      const mergedLine = {
        ...baseLine,
        quantity: qtyFromTx > 0 ? qtyFromTx : qtyFromInst > 0 ? qtyFromInst : baseLine.quantity,
        serials,
        models,
        totals: totals.totalNoTax !== null || totals.grandTotal !== null || totals.amountPaid !== null ? totals : baseLine.totals,
      };

      const categoryId = await getOrCreateCategoryId({ companyId, name: mergedLine.categoryName });
      const typeId = await upsertEquipmentTypeFromImport({
        companyId,
        name: mergedLine.itemName,
        categoryId,
      });
      if (!typeId) continue;
      stats.typesUpserted += 1;

      const targetQty = Number.isFinite(mergedLine.quantity) && mergedLine.quantity > 0
        ? mergedLine.quantity
        : Math.max(1, mergedLine.serials.length);
      if (mergedLine.endInferred) stats.endDatesInferred += 1;

      const inventoryIds = [];
      let serialsForInventory = [];
      if (!demandOnly) {
        serialsForInventory = [...(mergedLine.serials || [])];
        while (serialsForInventory.length < targetQty) {
          serialsForInventory.push(`UNALLOCATED-${contractNumber}-${typeId}-${serialsForInventory.length + 1}`);
        }

        for (let i = 0; i < serialsForInventory.length; i += 1) {
          const serial = serialsForInventory[i];
          const serialKey = normalizeSerialKey(serial);
          let equipmentId = !serialKey.startsWith("unallocated-") ? (equipmentIdBySerial.get(serialKey) || null) : null;
          if (!equipmentId) {
            const modelName = (mergedLine.models && mergedLine.models[i]) || (mergedLine.models && mergedLine.models[0]) || mergedLine.itemName;
            const modelKey = normalizeModelKey(modelName);
            if (modelKey) {
              const byType = equipmentIdsByTypeAndModel.get(`${String(typeId)}|${modelKey}`) || [];
              const byModel = equipmentIdsByModel.get(modelKey) || [];
              const poolIds = byType.length ? byType : byModel;
              const candidate = poolIds.find((id) => !usedEquipmentIdsForContract.has(id) && !inventoryIds.includes(id));
              if (candidate) equipmentId = candidate;
            }

            if (!equipmentId) {
              const createdEq = await createEquipment({
                companyId,
                typeId,
                modelName: modelName || mergedLine.itemName,
                serialNumber: serial,
                condition: "Normal Wear & Tear",
                manufacturer: mergedLine.manufacturer || null,
                purchasePrice: null,
                notes: `Imported from legacy exports. Contract: ${contractNumber}`,
              });
              equipmentId = createdEq?.id || null;
              if (equipmentId) {
                equipmentIdBySerial.set(serialKey, equipmentId);
                if (serialKey.startsWith("unallocated-")) stats.placeholderSerialsCreated += 1;
                stats.equipmentCreated += 1;
              }
            }
          }
          if (equipmentId) {
            inventoryIds.push(equipmentId);
            usedEquipmentIdsForContract.add(equipmentId);
          }
        }
      }

      const rateBasis = rateBasisFromLegacyDuration(mergedLine.chargedDuration);
      let rateAmount = null;
      let bookedUnits = null;
      const totalNoTax = mergedLine.totals?.totalNoTax ?? null;
      const basisForPricing = rateBasis || inferRateBasisFromDates(mergedLine.startIso, mergedLine.endIso);
      const quantityForPricing = demandOnly ? targetQty : inventoryIds.length;
      if (totalNoTax !== null && Number.isFinite(totalNoTax) && quantityForPricing) {
        const candidate = totalNoTax / quantityForPricing;
        if (Number.isFinite(candidate) && candidate >= 0) rateAmount = Number(candidate.toFixed(2));
        if (basisForPricing) {
          bookedUnits = computeBillableUnits({
            startAt: mergedLine.startIso,
            endAt: mergedLine.endIso,
            rateBasis: basisForPricing,
            roundingMode: settings.billing_rounding_mode,
            roundingGranularity: settings.billing_rounding_granularity,
            monthlyProrationMethod: settings.monthly_proration_method,
          });
        }
      }
      const baseLineItem = {
        typeId,
        startAt: mergedLine.startIso,
        endAt: mergedLine.endIso,
        rateBasis: basisForPricing,
        rateAmount,
        beforeNotes: null,
        afterNotes: null,
        beforeImages: [],
        afterImages: [],
      };
      const actualUnitsForEnd = (actualEndIso) => {
        if (!basisForPricing || !mergedLine.startIso) return bookedUnits;
        const endIso = actualEndIso || mergedLine.endIso;
        if (!endIso) return bookedUnits;
        const units = computeBillableUnits({
          startAt: mergedLine.startIso,
          endAt: endIso,
          rateBasis: basisForPricing,
          roundingMode: settings.billing_rounding_mode,
          roundingGranularity: settings.billing_rounding_granularity,
          monthlyProrationMethod: settings.monthly_proration_method,
        });
        if (units !== null && Number.isFinite(units) && units > 0) return units;
        return bookedUnits;
      };
      const lineAmountForUnits = (units, qty) =>
        rateAmount !== null && Number.isFinite(rateAmount) && units !== null && Number.isFinite(units) && Number.isFinite(qty) && qty > 0
          ? Number((rateAmount * units * qty).toFixed(2))
          : null;

      if (demandOnly) {
        for (let i = 0; i < targetQty; i += 1) {
          const billableUnits = actualUnitsForEnd(mergedLine.endIso);
          lineItems.push({
            ...baseLineItem,
            inventoryIds: [],
            billableUnits,
            lineAmount: lineAmountForUnits(billableUnits, 1),
          });
        }
      } else {
        if (futureReturnByContractSerial.size) {
          const fulfilledAt = mergedLine.startIso || null;
          for (let i = 0; i < inventoryIds.length; i += 1) {
            const serial = serialsForInventory[i];
            const serialKey = normalizeSerialKey(serial);
            const returnKey = serialKey ? `${contractNumber}|${serialKey}` : null;
            const returnedAt = returnKey ? futureReturnByContractSerial.get(returnKey) || null : null;
            const billableUnits = actualUnitsForEnd(returnedAt || mergedLine.endIso);
            lineItems.push({
              ...baseLineItem,
              inventoryIds: [inventoryIds[i]],
              fulfilledAt,
              returnedAt,
              billableUnits,
              lineAmount: lineAmountForUnits(billableUnits, 1),
            });
          }
        } else {
          const billableUnits = actualUnitsForEnd(mergedLine.endIso);
          lineItems.push({
            ...baseLineItem,
            inventoryIds,
            billableUnits,
            lineAmount: lineAmountForUnits(billableUnits, inventoryIds.length),
          });
        }
      }
    }

    if (!lineItems.length) {
      stats.warnings.push({ contractNumber, warning: "No valid line items found (missing start/end/type)." });
      continue;
    }

    status = overrideImportStatusForUnreturnedItems(status, lineItems);

    const createdAt = first.createdIso || first.startIso || null;
    const legacyData = {
      source: "legacy_exports",
      contractNumber,
      statusCode: first.statusCode || null,
      customer: {
        companyName: first.companyName || null,
        contactName: first.contactName || null,
        email: first.email || null,
        phone: first.phone || null,
        address: first.address || null,
        postalCode: first.postalCode || null,
      },
      totals: {
        totalNoTax: first.totals?.totalNoTax ?? null,
        grandTotal: first.totals?.grandTotal ?? null,
        amountPaid: first.totals?.amountPaid ?? null,
      },
      exports: {
        transactions: lines.filter((l) => l.sourceName === "transactions").map((l) => l.raw),
        instances: lines.filter((l) => l.sourceName === "instances").map((l) => l.raw),
      },
    };

    try {
      await createRentalOrder({
        companyId,
        customerId,
        salespersonId,
        externalContractNumber: contractNumber,
        legacyData,
        createdAt,
        fulfillmentMethod: "pickup",
        status,
        customerPo: null,
        lineItems,
        fees: [],
      });
      existingContractSet.add(contractNumber);
      stats.ordersCreated += 1;
    } catch (err) {
      const msg = err?.message || String(err);
      stats.errors.push({ contractNumber, error: msg });
    }
  }

  return stats;
}

function normalizeFutureImportStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhoneKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || "";
}

function normalizeSalespersonKey(value) {
  if (!value) return "";
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function isNoSalespersonValue(value) {
  const key = normalizeSalespersonKey(value);
  if (!key) return true;
  const collapsed = key.replace(/[^a-z0-9]/g, "");
  if (!collapsed) return true;
  return key === "no" || key === "none" || key === "n/a" || key === "na" || key === "unassigned" || collapsed === "na";
}

function parseSalespersonCommissionReportData(text) {
  let report = parseLegacyExport(text);
  const headerHasContract = report?.header?.some((name) => name === "Contract #" || name === "Contract" || name === "Contract#");
  const headerHasSalesperson = report?.header?.some((name) => name === "Salesperson");
  if (!report || !headerHasContract || !headerHasSalesperson) {
    const lines = String(text || "").split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => line.includes("Contract #") && line.includes("Salesperson"));
    if (headerIndex >= 0) {
      report = parseLegacyExport(lines.slice(headerIndex).join("\n"));
    }
  }
  if (!report) return new Map();
  const contractToSalesperson = new Map();
  for (const row of report.rows) {
    const contractNumber = report.get(row, ["Contract #", "Contract#", "Contract"]);
    if (!contractNumber) continue;
    const salesperson = report.get(row, ["Salesperson"]);
    if (!salesperson || isNoSalespersonValue(salesperson)) continue;
    const contractKey = String(contractNumber).trim();
    if (!contractToSalesperson.has(contractKey)) {
      contractToSalesperson.set(contractKey, String(salesperson).trim());
    }
  }
  return contractToSalesperson;
}

function parseFutureReturnMap(text) {
  let report = parseLegacyExport(text);
  const headerHasContract = report?.header?.some((name) => name === "Contract #" || name === "Contract" || name === "Contract#");
  const headerHasReturned = report?.header?.some((name) => name === "Returned");
  if (!report || !headerHasContract || !headerHasReturned) {
    const lines = String(text || "").split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => line.includes("Contract #") && line.includes("Returned"));
    if (headerIndex >= 0) {
      report = parseLegacyExport(lines.slice(headerIndex).join("\n"));
    }
  }
  if (!report) return new Map();
  const map = new Map();
  for (const row of report.rows) {
    const contractNumber = report.get(row, ["Contract #", "Contract#", "Contract"]);
    if (!contractNumber) continue;
    const serialRaw = report.get(row, ["Serial Number", "Serial"]);
    if (!serialRaw) continue;
    const serialKey = normalizeSerialKey(serialRaw);
    if (!serialKey || serialKey.startsWith("unallocated")) continue;
    const returnedRaw = report.get(row, ["Returned"]);
    const returnedIso = parseLegacyDateTime(returnedRaw) || null;
    const key = `${String(contractNumber).trim()}|${serialKey}`;
    if (!map.has(key)) map.set(key, returnedIso);
  }
  return map;
}

async function getOrCreatePlaceholderCustomer({ companyId, name }) {
  const label = String(name || "").trim() || "Imported Customer";
  const existing = await pool.query(
    `SELECT id FROM customers WHERE company_id = $1 AND LOWER(company_name) = $2 LIMIT 1`,
    [companyId, normalizeCustomerMatchKey(label)]
  );
  if (existing.rows?.[0]?.id) return { id: Number(existing.rows[0].id), created: false };

  const created = await createCustomer({
    companyId,
    companyName: label,
    contactName: null,
    streetAddress: null,
    city: null,
    region: null,
    country: null,
    postalCode: null,
    email: null,
    phone: null,
    canChargeDeposit: false,
    notes: "Placeholder customer for imports.",
  });
  return { id: created?.id || null, created: !!created?.id };
}

async function buildSalespersonLookup({ companyId, salesReportText }) {
  const existingSalespeople = await pool.query(`SELECT id, name FROM sales_people WHERE company_id = $1`, [companyId]);
  const salespersonIdByName = new Map(
    existingSalespeople.rows.map((row) => [normalizeSalespersonKey(row.name), row.id])
  );
  const contractToSalesperson = salesReportText ? parseSalespersonCommissionReportData(salesReportText) : new Map();
  return { contractToSalesperson, salespersonIdByName };
}

function deriveFutureImportOrderStatus(contractNumber, lines) {
  const contract = String(contractNumber || "").trim().toUpperCase();
  if (contract.startsWith("Q-")) return "quote";
  if (contract.startsWith("R-")) return "reservation";

  const codes = (lines || []).map((line) => normalizeFutureImportStatus(line.statusCode));
  const hasOut = codes.some((code) => code.includes("out") || code.includes("order"));
  const hasReserved = codes.some((code) => code.includes("reserved"));
  const hasQuote = codes.some((code) => code.includes("quote"));
  const allReturned = codes.length > 0 && codes.every((code) => code.includes("returned"));

  if (hasOut) return "ordered";
  if (allReturned) return "closed";
  if (hasReserved) return "reservation";
  if (hasQuote) return "quote";
  return mapLegacyStatus({ contractNumber, statusCode: lines?.[0]?.statusCode, cancelled: false, completed: false });
}

async function importRentalOrdersFromFutureInventoryReport({ companyId, reportText, salesReportText }) {
  if (!companyId) throw new Error("companyId is required.");
  if (!reportText) throw new Error("reportText is required.");

  const report = parseLegacyExport(reportText);
  if (!report) {
    return {
      ordersCreated: 0,
      ordersSkipped: 0,
      customersCreated: 0,
      typesUpserted: 0,
      equipmentCreated: 0,
      placeholderSerialsCreated: 0,
      endDatesInferred: 0,
      warnings: [],
      errors: [],
    };
  }

  const existingCustomers = await pool.query(`SELECT id, company_name, email, phone FROM customers WHERE company_id = $1`, [companyId]);
  const customerIdByCompany = new Map(existingCustomers.rows.map((r) => [normalizeCustomerMatchKey(r.company_name), r.id]));
  const customerIdByEmail = new Map(existingCustomers.rows.filter((r) => r.email).map((r) => [normalizeCustomerMatchKey(r.email), r.id]));
  const customerIdByPhone = new Map(
    existingCustomers.rows
      .map((r) => ({ key: normalizePhoneKey(r.phone), id: r.id }))
      .filter((r) => r.key)
      .map((r) => [r.key, r.id])
  );

  const existingEquipment = await pool.query(
    `SELECT id, serial_number, model_name, type_id FROM equipment WHERE company_id = $1`,
    [companyId]
  );
  const equipmentIdBySerial = new Map(existingEquipment.rows.map((r) => [normalizeSerialKey(r.serial_number), r.id]));
  const equipmentIdsByModel = new Map();
  const equipmentIdsByTypeAndModel = new Map();
  existingEquipment.rows.forEach((r) => {
    const modelKey = normalizeModelKey(r.model_name);
    if (!modelKey) return;

    if (!equipmentIdsByModel.has(modelKey)) equipmentIdsByModel.set(modelKey, []);
    equipmentIdsByModel.get(modelKey).push(r.id);

    if (r.type_id) {
      const tmKey = `${String(r.type_id)}|${modelKey}`;
      if (!equipmentIdsByTypeAndModel.has(tmKey)) equipmentIdsByTypeAndModel.set(tmKey, []);
      equipmentIdsByTypeAndModel.get(tmKey).push(r.id);
    }
  });

  const existingContracts = await pool.query(
    `SELECT external_contract_number FROM rental_orders WHERE company_id = $1 AND external_contract_number IS NOT NULL`,
    [companyId]
  );
  const existingContractSet = new Set(existingContracts.rows.map((r) => String(r.external_contract_number).trim()));
  const { contractToSalesperson, salespersonIdByName } = await buildSalespersonLookup({ companyId, salesReportText });
  const resolveSalespersonId = async (salespersonName) => {
    const key = normalizeSalespersonKey(salespersonName);
    if (!key || isNoSalespersonValue(salespersonName)) return null;
    const existing = salespersonIdByName.get(key);
    if (existing) return existing;
    const created = await createSalesPerson({ companyId, name: salespersonName, email: null, phone: null, imageUrl: null });
    if (created?.id) salespersonIdByName.set(key, created.id);
    return created?.id || null;
  };

  const stats = {
    ordersCreated: 0,
    ordersSkipped: 0,
    customersCreated: 0,
    typesUpserted: 0,
    equipmentCreated: 0,
    placeholderSerialsCreated: 0,
    endDatesInferred: 0,
    warnings: [],
    errors: [],
  };

  const placeholder = await getOrCreatePlaceholderCustomer({ companyId, name: "Imported Customer" });
  const placeholderCustomerId = placeholder.id || null;
  if (placeholder.created) stats.customersCreated += 1;

  const lineGroupsByContract = new Map();

  const rowToObject = (parsed, row) => {
    const obj = {};
    for (let i = 0; i < parsed.header.length; i += 1) {
      const k = parsed.header[i];
      if (!k) continue;
      const v = String(row[i] ?? "").trim();
      if (!v) continue;
      obj[k] = v;
    }
    return obj;
  };

  for (const row of report.rows) {
    const contractNumber = report.get(row, ["Contract #", "Contract#", "Contract"]);
    if (!contractNumber) continue;

    const customerRaw = report.get(row, ["Customer", "Company Name", "Customer Name"]) || "Unknown";
    const companyName = report.get(row, ["Company Name"]) || report.get(row, ["Customer"]) || report.get(row, ["Customer Name"]) || "Unknown";
    const contactName = report.get(row, ["Customer Name"]) || report.get(row, ["Picked Up By"]) || null;
    const email =
      firstEmailIn(report.get(row, ["Email"])) ||
      firstEmailIn(customerRaw) ||
      firstEmailIn(report.get(row, ["Address"]));
    const phone = report.get(row, ["Primary Phone", "Phone"]);
    const address = report.get(row, ["Address"]);
    const postalCode = report.get(row, ["Postal Code", "Postal"]);

    const itemName = report.get(row, ["Item"]) || "Unknown item";
    const categoryName = report.get(row, ["Category"]);
    const manufacturer = report.get(row, ["Manufacturer"]);
    const modelRaw = report.get(row, ["Model"]);
    const serialRaw = report.get(row, ["Serial Number", "Serial"]);
    const qtyRaw = report.get(row, ["Quantity"]);
    const quantity = Number.parseInt(String(qtyRaw || "0"), 10) || 0;

    const startIso =
      parseLegacyDateTime(report.get(row, ["Start Time"])) ||
      parseLegacyDateTime(report.get(row, ["Start"])) ||
      null;
    let endIso = parseLegacyDateTime(report.get(row, ["Due"])) || null;
    if (!endIso && startIso) {
      const fallback = new Date(startIso);
      if (!Number.isNaN(fallback.getTime())) {
        fallback.setDate(fallback.getDate() + 30);
        endIso = fallback.toISOString();
      }
    }
    const endInferred = !!endIso && !parseLegacyDateTime(report.get(row, ["Due"])) && !!startIso;

    const returnedRaw = report.get(row, ["Returned"]);
    const returnedIso = parseLegacyDateTime(returnedRaw) || null;
    const statusCode = report.get(row, ["Status Code", "Status"]);

    const serials = splitCsvishList(serialRaw).filter((s) => !["unallocated", "unserialized item"].includes(s.toLowerCase()));
    const models = splitCsvishList(modelRaw);

    const contractKey = String(contractNumber).trim();
    if (!lineGroupsByContract.has(contractKey)) lineGroupsByContract.set(contractKey, []);
    lineGroupsByContract.get(contractKey).push({
      contractNumber: contractKey,
      companyName,
      contactName,
      email,
      phone,
      address,
      postalCode,
      itemName,
      categoryName,
      manufacturer,
      quantity,
      startIso,
      endIso,
      endInferred,
      returnedIso,
      statusCode,
      serials,
      models,
      raw: rowToObject(report, row),
    });
  }

  const contractNumbers = Array.from(lineGroupsByContract.keys());
  if (!contractNumbers.length) return stats;

  for (const contractNumber of contractNumbers) {
    if (existingContractSet.has(contractNumber)) {
      stats.ordersSkipped += 1;
      continue;
    }

    const lines = lineGroupsByContract.get(contractNumber) || [];
    if (!lines.length) continue;
    const first = lines[0];

    let status = deriveFutureImportOrderStatus(contractNumber, lines);
    const demandOnly = isDemandOnlyStatus(status);

    const customerSeed = lines.find((line) => line.email || line.phone || line.companyName) || first;
    const customerKey = normalizeCustomerMatchKey(customerSeed.companyName);
    const emailKey = normalizeCustomerMatchKey(customerSeed.email);
    const phoneKey = normalizePhoneKey(customerSeed.phone);
    let customerId =
      (emailKey && customerIdByEmail.get(emailKey)) ||
      (phoneKey && customerIdByPhone.get(phoneKey)) ||
      (customerKey && customerIdByCompany.get(customerKey)) ||
      null;
    if (!customerId) customerId = placeholderCustomerId;
    if (!customerId) {
      stats.errors.push({ contractNumber, error: "Unable to resolve placeholder customer." });
      continue;
    }

    const salespersonName = contractToSalesperson.get(contractNumber) || null;
    const salespersonId = salespersonName ? await resolveSalespersonId(salespersonName) : null;

    const lineItems = [];
    const usedEquipmentIdsForContract = new Set();

    for (const line of lines) {
      if (!line.itemName || !line.startIso || !line.endIso) {
        stats.warnings.push({
          contractNumber,
          warning: "Skipped a line item missing item name or start/end dates.",
        });
        continue;
      }

      const categoryId = await getOrCreateCategoryId({ companyId, name: line.categoryName });
      const typeId = await upsertEquipmentTypeFromImport({
        companyId,
        name: line.itemName,
        categoryId,
      });
      if (!typeId) continue;
      stats.typesUpserted += 1;

      const targetQty = Number.isFinite(line.quantity) && line.quantity > 0
        ? line.quantity
        : Math.max(1, line.serials.length);
      if (line.endInferred) stats.endDatesInferred += 1;

      const rateBasis = inferRateBasisFromDates(line.startIso, line.endIso);
      const baseLineItem = {
        typeId,
        startAt: line.startIso,
        endAt: line.endIso,
        rateBasis,
        rateAmount: null,
        fulfilledAt: demandOnly ? null : line.startIso,
        returnedAt: demandOnly ? null : line.returnedIso || null,
        beforeNotes: null,
        afterNotes: null,
        beforeImages: [],
        afterImages: [],
      };

      if (demandOnly) {
        for (let i = 0; i < targetQty; i += 1) {
          lineItems.push({ ...baseLineItem, inventoryIds: [] });
        }
        continue;
      }

      const inventoryIds = [];
      const serials = [...(line.serials || [])];
      while (serials.length < targetQty) {
        serials.push(`UNALLOCATED-${contractNumber}-${typeId}-${serials.length + 1}`);
      }

      for (let i = 0; i < serials.length; i += 1) {
        const serial = serials[i];
        const serialKey = normalizeSerialKey(serial);
        let equipmentId = !serialKey.startsWith("unallocated-") ? (equipmentIdBySerial.get(serialKey) || null) : null;
        if (!equipmentId) {
          const modelName = (line.models && line.models[i]) || (line.models && line.models[0]) || line.itemName;
          const modelKey = normalizeModelKey(modelName);
          if (modelKey) {
            const byType = equipmentIdsByTypeAndModel.get(`${String(typeId)}|${modelKey}`) || [];
            const byModel = equipmentIdsByModel.get(modelKey) || [];
            const poolIds = byType.length ? byType : byModel;
            const candidate = poolIds.find((id) => !usedEquipmentIdsForContract.has(id) && !inventoryIds.includes(id));
            if (candidate) equipmentId = candidate;
          }

          if (!equipmentId) {
            const createdEq = await createEquipment({
              companyId,
              typeId,
              modelName: modelName || line.itemName,
              serialNumber: serial,
              condition: "Normal Wear & Tear",
              manufacturer: line.manufacturer || null,
              purchasePrice: null,
              notes: `Imported from Future Transactions by Inventory Item. Contract: ${contractNumber}`,
            });
            equipmentId = createdEq?.id || null;
            if (equipmentId) {
              equipmentIdBySerial.set(serialKey, equipmentId);
              if (serialKey.startsWith("unallocated-")) stats.placeholderSerialsCreated += 1;
              stats.equipmentCreated += 1;
            }
          }
        }
        if (equipmentId) {
          inventoryIds.push(equipmentId);
          usedEquipmentIdsForContract.add(equipmentId);
        }
      }

      lineItems.push({ ...baseLineItem, inventoryIds });
    }

    if (!lineItems.length) {
      stats.warnings.push({ contractNumber, warning: "No valid line items found (missing start/end/type)." });
      continue;
    }

    status = overrideImportStatusForUnreturnedItems(status, lineItems);

    const createdAt = first.startIso || null;
    const legacyData = {
      source: "future_transactions_by_inventory_item",
      contractNumber,
      statusCode: first.statusCode || null,
      customer: {
        companyName: first.companyName || null,
        contactName: first.contactName || null,
        email: first.email || null,
      },
      totals: {
        totalNoTax: null,
        grandTotal: null,
        amountPaid: null,
      },
      exports: {
        futureTransactionsByInventoryItem: lines.map((l) => l.raw),
      },
    };

    try {
      await createRentalOrder({
        companyId,
        customerId,
        salespersonId,
        externalContractNumber: contractNumber,
        legacyData,
        createdAt,
        fulfillmentMethod: "pickup",
        status,
        customerPo: null,
        lineItems,
        fees: [],
      });
      existingContractSet.add(contractNumber);
      stats.ordersCreated += 1;
    } catch (err) {
      const msg = err?.message || String(err);
      stats.errors.push({ contractNumber, error: msg });
    }
  }

  return stats;
}

function normalizeLegacyItemNameForMatch(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function legacyRowStartEndIso(rowObj) {
  const startIso =
    parseLegacyDateTime(rowObj?.["Start Time"]) ||
    parseLegacyDateTime(rowObj?.["Start"]) ||
    null;
  let endIso = parseLegacyDateTime(rowObj?.["Due"]) || null;
  const charged = rowObj?.["Charged Duration"] ?? "";
  const durationParts = parseLegacyDurationParts(charged);
  if (!endIso && startIso && durationParts) endIso = addLegacyDurationToStart(startIso, durationParts);
  if (!endIso && startIso) {
    const fallback = new Date(startIso);
    if (!Number.isNaN(fallback.getTime())) {
      fallback.setDate(fallback.getDate() + 30);
      endIso = fallback.toISOString();
    }
  }
  return { startIso, endIso };
}

function msWithin(aMs, bMs, toleranceMs) {
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return false;
  return Math.abs(aMs - bMs) <= toleranceMs;
}

async function backfillLegacyRates({ companyId, includeAlreadyRated = false } = {}) {
  if (!companyId) throw new Error("companyId is required.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getCompanySettings(companyId);

    const whereMissing = includeAlreadyRated
      ? "TRUE"
      : "(li.rate_amount IS NULL OR li.line_amount IS NULL OR li.rate_basis IS NULL OR li.billable_units IS NULL)";

    const res = await client.query(
      `
      SELECT ro.id AS order_id,
             ro.external_contract_number,
             ro.legacy_data,
             li.id AS line_item_id,
             li.type_id,
             et.name AS type_name,
             li.start_at,
             li.end_at,
             li.returned_at,
             li.rate_basis,
             li.rate_amount,
             li.billable_units,
             li.line_amount,
             (SELECT COUNT(*)::int FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
        FROM rental_orders ro
        JOIN rental_order_line_items li ON li.rental_order_id = ro.id
        JOIN equipment_types et ON et.id = li.type_id
       WHERE ro.company_id = $1
         AND ro.external_contract_number IS NOT NULL
         AND ${whereMissing}
       ORDER BY ro.id ASC, li.id ASC
      `,
      [companyId]
    );

    const stats = {
      lineItemsUpdated: 0,
      lineItemsSkipped: 0,
      ordersTouched: 0,
      warnings: [],
      errors: [],
    };

    const touchedOrders = new Set();
    const toleranceMs = 5 * 60 * 1000;

    for (const row of res.rows) {
      const legacyData = row.legacy_data || {};
      const exportsObj = legacyData.exports || {};
      const txRows = Array.isArray(exportsObj.transactions) ? exportsObj.transactions : [];
      const instRows = Array.isArray(exportsObj.instances) ? exportsObj.instances : [];
      const candidates = txRows.length ? txRows : instRows;
      if (!candidates.length) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "No legacy export rows found in rental_orders.legacy_data.exports.",
        });
        continue;
      }

      const typeNameKey = normalizeLegacyItemNameForMatch(row.type_name);
      const startMs = Date.parse(row.start_at);
      const endMs = Date.parse(row.end_at);
      const qty = Number(row.qty) || 0;
      if (!typeNameKey || !Number.isFinite(startMs) || !Number.isFinite(endMs) || qty <= 0) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "Missing type name, dates, or quantity; cannot backfill.",
        });
        continue;
      }

      const match = candidates.find((r) => {
        const itemName = normalizeLegacyItemNameForMatch(r?.Item || "");
        if (!itemName || itemName !== typeNameKey) return false;
        const { startIso, endIso } = legacyRowStartEndIso(r);
        const aStartMs = Date.parse(startIso);
        const aEndMs = Date.parse(endIso);
        return msWithin(aStartMs, startMs, toleranceMs) && msWithin(aEndMs, endMs, toleranceMs);
      });

      if (!match) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "No matching legacy row found for this line item (by Item + Start + Due).",
        });
        continue;
      }

      const totalNoTax = parseMoney(match["Total (no tax)"] ?? match["Total(no tax)"] ?? match["Total"]);
      if (totalNoTax === null || !Number.isFinite(totalNoTax)) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "Legacy row is missing a numeric Total (no tax).",
        });
        continue;
      }

      const basis =
        rateBasisFromLegacyDuration(match["Charged Duration"] ?? "") ||
        inferRateBasisFromDates(row.start_at, row.end_at) ||
        "daily";

      const bookedUnits = computeBillableUnits({
        startAt: row.start_at,
        endAt: row.end_at,
        rateBasis: basis,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
      });

      if (bookedUnits === null || !Number.isFinite(bookedUnits) || bookedUnits <= 0) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "Unable to compute billable units for this line item.",
        });
        continue;
      }

      const rateAmount = Number((totalNoTax / qty).toFixed(2));
      if (!Number.isFinite(rateAmount) || rateAmount < 0) {
        stats.lineItemsSkipped += 1;
        stats.warnings.push({
          contractNumber: row.external_contract_number,
          lineItemId: row.line_item_id,
          warning: "Computed rate amount was invalid.",
        });
        continue;
      }

      const actualEnd = row.returned_at || row.end_at;
      const actualUnits = computeBillableUnits({
        startAt: row.start_at,
        endAt: actualEnd,
        rateBasis: basis,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
      });
      const billableUnits =
        actualUnits !== null && Number.isFinite(actualUnits) && actualUnits > 0 ? actualUnits : bookedUnits;
      const lineAmount = Number((rateAmount * billableUnits * qty).toFixed(2));

      await client.query(
        `
        UPDATE rental_order_line_items
           SET rate_basis = $1,
               rate_amount = $2,
               billable_units = $3,
               line_amount = $4
         WHERE id = $5
        `,
        [basis, rateAmount, billableUnits, lineAmount, row.line_item_id]
      );

      stats.lineItemsUpdated += 1;
      touchedOrders.add(row.order_id);
    }

    stats.ordersTouched = touchedOrders.size;
    await client.query("COMMIT");
    return stats;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateRentalOrder({
  id,
  companyId,
  customerId,
  customerPo,
  salespersonId,
  actorName,
  actorEmail,
  fulfillmentMethod = "pickup",
  status = "quote",
  terms,
  generalNotes,
  pickupLocationId,
  dropoffAddress,
  siteAddress,
  logisticsInstructions,
  specialInstructions,
  criticalAreas,
  coverageHours,
  emergencyContacts,
  siteContacts,
  lineItems = [],
  fees = [],
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getCompanySettings(companyId);
    const normalizedStatus = normalizeRentalOrderStatus(status);
    const demandOnly = isDemandOnlyStatus(normalizedStatus);
    const allowsInventory = allowsInventoryAssignment(normalizedStatus);
    const emergencyContactList = normalizeOrderContacts(emergencyContacts);
    const siteContactList = normalizeOrderContacts(siteContacts);
    const coverageHoursValue = normalizeCoverageHours(coverageHours);
    const bundleCache = new Map();
    const getBundleData = async (bundleId) => {
      const key = String(bundleId);
      if (bundleCache.has(key)) return bundleCache.get(key);
      const headerRes = await client.query(
        `
        SELECT b.id,
               b.primary_equipment_id,
               pe.type_id AS primary_type_id
          FROM equipment_bundles b
     LEFT JOIN equipment pe ON pe.id = b.primary_equipment_id
         WHERE b.company_id = $1 AND b.id = $2
         LIMIT 1
        `,
        [companyId, bundleId]
      );
      const row = headerRes.rows[0];
      if (!row) throw new Error("Bundle not found.");
      const itemsRes = await client.query(
        `SELECT equipment_id FROM equipment_bundle_items WHERE bundle_id = $1 ORDER BY equipment_id`,
        [bundleId]
      );
      const data = {
        id: Number(row.id),
        primaryEquipmentId: row.primary_equipment_id === null ? null : Number(row.primary_equipment_id),
        primaryTypeId: row.primary_type_id === null || row.primary_type_id === undefined ? null : Number(row.primary_type_id),
        equipmentIds: itemsRes.rows.map((r) => Number(r.equipment_id)).filter((v) => Number.isFinite(v)),
      };
      bundleCache.set(key, data);
      return data;
    };
    const existingRes = await client.query(
      `SELECT quote_number, ro_number, status, customer_id, pickup_location_id, salesperson_id, fulfillment_method
         FROM rental_orders
        WHERE id = $1 AND company_id = $2
        FOR UPDATE`,
      [id, companyId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return null;
    }
    const prevStatus = normalizeRentalOrderStatus(existing.status);
    let quoteNumber = existing.quote_number || null;
    let roNumber = existing.ro_number || null;
    if (isQuoteStatus(normalizedStatus) && !quoteNumber) {
      quoteNumber = await nextDocumentNumber(client, companyId, "QO");
    }
    if (!isQuoteStatus(normalizedStatus) && !roNumber) {
      roNumber = await nextDocumentNumber(client, companyId, "RO");
    }
    const headerRes = await client.query(
      `
      UPDATE rental_orders
         SET quote_number = $1,
             ro_number = $2,
             customer_id = $3,
             customer_po = $4,
             salesperson_id = $5,
             fulfillment_method = $6,
             status = $7,
             terms = $8,
             general_notes = $9,
             pickup_location_id = $10,
             dropoff_address = $11,
             site_address = $12,
             logistics_instructions = $13,
             special_instructions = $14,
             critical_areas = $15,
             coverage_hours = $16::jsonb,
             emergency_contacts = $17::jsonb,
             site_contacts = $18::jsonb,
             updated_at = NOW()
       WHERE id = $19 AND company_id = $20
       RETURNING id, quote_number, ro_number
      `,
      [
        quoteNumber,
        roNumber,
        customerId,
        customerPo || null,
        salespersonId || null,
        fulfillmentMethod || "pickup",
        normalizedStatus,
        terms || null,
        generalNotes || null,
        pickupLocationId || null,
        fulfillmentMethod === "dropoff" ? (dropoffAddress || null) : null,
        siteAddress || null,
        logisticsInstructions || null,
        specialInstructions || null,
        criticalAreas || null,
        JSON.stringify(coverageHoursValue),
        JSON.stringify(emergencyContactList),
        JSON.stringify(siteContactList),
        id,
        companyId,
      ]
    );
    if (!headerRes.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(`DELETE FROM rental_order_line_items WHERE rental_order_id = $1`, [id]);
    for (const item of lineItems || []) {
      const startAt = normalizeTimestamptz(item.startAt);
      const endAt = normalizeTimestamptz(item.endAt);
      const bundleId = item.bundleId ? Number(item.bundleId) : null;
      const bundleData = Number.isFinite(bundleId) ? await getBundleData(bundleId) : null;
      const effectiveTypeId = bundleData?.primaryTypeId || item.typeId;
      if (!effectiveTypeId || !startAt || !endAt) continue;
      const rateBasis = normalizeRateBasis(item.rateBasis);
      const rateAmount = item.rateAmount === "" || item.rateAmount === null || item.rateAmount === undefined ? null : Number(item.rateAmount);
      const fulfilledAt = normalizeTimestamptz(item.fulfilledAt) || null;
      const returnedAt = fulfilledAt ? normalizeTimestamptz(item.returnedAt) || null : null;
      const pausePeriods = normalizePausePeriods(item.pausePeriods);
      const rawInventoryIds = Array.isArray(item.inventoryIds) ? item.inventoryIds : [];
      const inventoryIds = allowsInventory
        ? bundleData
          ? bundleData.equipmentIds
          : rawInventoryIds
        : [];
      if (bundleData && allowsInventory && !inventoryIds.length) {
        throw new Error("Bundle has no equipment assigned.");
      }
      const qty = bundleData ? 1 : inventoryIds.length;
      const effectiveQty = bundleData ? 1 : (qty || (demandOnly ? 1 : 0));
      const billableUnits = computeBillableUnits({
        startAt,
        endAt,
        rateBasis,
        roundingMode: settings.billing_rounding_mode,
        roundingGranularity: settings.billing_rounding_granularity,
        monthlyProrationMethod: settings.monthly_proration_method,
      });
      const lineAmount =
        rateAmount !== null && Number.isFinite(rateAmount) && billableUnits !== null && Number.isFinite(billableUnits)
          ? Number((rateAmount * billableUnits * effectiveQty).toFixed(2))
          : null;
      const liRes = await client.query(
        `INSERT INTO rental_order_line_items (rental_order_id, type_id, bundle_id, start_at, end_at, fulfilled_at, returned_at, rate_basis, rate_amount, billable_units, line_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          id,
          effectiveTypeId,
          bundleData ? bundleData.id : null,
          startAt,
          endAt,
          fulfilledAt,
          returnedAt,
          rateBasis,
          Number.isFinite(rateAmount) ? rateAmount : null,
          billableUnits,
          lineAmount,
        ]
      );
      const lineItemId = liRes.rows[0].id;
      for (const equipmentId of inventoryIds) {
        await client.query(
          `INSERT INTO rental_order_line_inventory (line_item_id, equipment_id) VALUES ($1,$2)`,
          [lineItemId, equipmentId]
        );
      }
      await client.query(
        `
        INSERT INTO rental_order_line_conditions
          (line_item_id, before_notes, after_notes, before_images, after_images, pause_periods, ai_report_markdown, ai_report_generated_at)
        VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)
        `,
        [
          lineItemId,
          item.beforeNotes || null,
          item.afterNotes || null,
          JSON.stringify(item.beforeImages || []),
          JSON.stringify(item.afterImages || []),
          JSON.stringify(pausePeriods),
          item.aiDamageReport || null,
          item.aiDamageReport ? new Date().toISOString() : null,
        ]
      );
    }

    const existingFeesRes = await client.query(
      `SELECT id FROM rental_order_fees WHERE rental_order_id = $1`,
      [id]
    );
    const existingFeeIds = new Set(existingFeesRes.rows.map((r) => Number(r.id)));
    const keepFeeIds = new Set();

    for (const fee of fees || []) {
      const name = String(fee.name || "").trim();
      if (!name) continue;
      const amount = fee.amount === "" || fee.amount === null || fee.amount === undefined ? 0 : Number(fee.amount);
      const feeId = Number(fee.id);
      if (Number.isFinite(feeId) && existingFeeIds.has(feeId)) {
        await client.query(
          `UPDATE rental_order_fees SET name = $1, amount = $2 WHERE id = $3 AND rental_order_id = $4`,
          [name, Number.isFinite(amount) ? amount : 0, feeId, id]
        );
        keepFeeIds.add(feeId);
      } else {
        const insertRes = await client.query(
          `INSERT INTO rental_order_fees (rental_order_id, name, amount) VALUES ($1,$2,$3) RETURNING id`,
          [id, name, Number.isFinite(amount) ? amount : 0]
        );
        const insertedId = Number(insertRes.rows?.[0]?.id);
        if (Number.isFinite(insertedId)) keepFeeIds.add(insertedId);
      }
    }

    if (keepFeeIds.size) {
      await client.query(
        `DELETE FROM rental_order_fees WHERE rental_order_id = $1 AND id <> ALL($2::int[])`,
        [id, Array.from(keepFeeIds)]
      );
    } else {
      await client.query(`DELETE FROM rental_order_fees WHERE rental_order_id = $1`, [id]);
    }

    const before = {
      status: existing.status,
      customerId: existing.customer_id,
      pickupLocationId: existing.pickup_location_id,
      salespersonId: existing.salesperson_id,
      fulfillmentMethod: existing.fulfillment_method,
    };
    const after = {
      status: normalizedStatus,
      customerId,
      pickupLocationId: pickupLocationId || null,
      salespersonId: salespersonId || null,
      fulfillmentMethod: fulfillmentMethod || "pickup",
    };
    await insertRentalOrderAudit({
      client,
      companyId,
      orderId: id,
      actorName,
      actorEmail,
      action: "update",
      summary: before.status !== after.status ? `Status: ${before.status} → ${after.status}` : "Updated rental order.",
      changes: {
        before,
        after,
        lineItemsCount: Array.isArray(lineItems) ? lineItems.length : 0,
        feesCount: Array.isArray(fees) ? fees.length : 0,
      },
    });

    await client.query("COMMIT");
    return {
      id,
      quoteNumber: headerRes.rows[0].quote_number,
      roNumber: headerRes.rows[0].ro_number,
      prevStatus,
      status: normalizedStatus,
      statusChanged: prevStatus !== normalizedStatus,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateRentalOrderStatus({ id, companyId, status, actorName, actorEmail }) {
  const client = await pool.connect();
  let shouldGenerateInvoices = false;
  let invoiceMode = "auto";
  let quoteNumberOut = null;
  let roNumberOut = null;
  let statusOut = null;
  let prevStatusOut = null;
  let statusChangedOut = false;
  try {
    await client.query("BEGIN");
    const normalizedStatus = normalizeRentalOrderStatus(status);
    const demandOnly = isDemandOnlyStatus(normalizedStatus);
    const existingRes = await client.query(
      `SELECT quote_number, ro_number, status
         FROM rental_orders
        WHERE id = $1 AND company_id = $2
        FOR UPDATE`,
      [id, companyId]
    );
    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return null;
    }
    const prevStatus = normalizeRentalOrderStatus(existing.status);
    prevStatusOut = prevStatus;
    statusChangedOut = prevStatus !== normalizedStatus;

    let quoteNumber = existing.quote_number || null;
    let roNumber = existing.ro_number || null;

    if (isQuoteStatus(normalizedStatus)) {
      if (!quoteNumber) quoteNumber = await nextDocumentNumber(client, companyId, "QO");
      roNumber = null;
    } else {
      if (!roNumber) roNumber = await nextDocumentNumber(client, companyId, "RO");
    }

    const headerRes = await client.query(
      `
      UPDATE rental_orders
         SET quote_number = $1,
             ro_number = $2,
             status = $3,
             updated_at = NOW()
       WHERE id = $4 AND company_id = $5
       RETURNING id, quote_number, ro_number, status
      `,
      [quoteNumber, roNumber, normalizedStatus, id, companyId]
    );
    const row = headerRes.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    quoteNumberOut = row.quote_number || null;
    roNumberOut = row.ro_number || null;
    statusOut = row.status || null;

    if (!allowsInventory) {
      await client.query(
        `
        DELETE FROM rental_order_line_inventory
         WHERE line_item_id IN (
           SELECT id FROM rental_order_line_items WHERE rental_order_id = $1
         )
        `,
        [id]
      );
    }

    const settings = await getCompanySettingsForClient(client, companyId);
    const autoRun = normalizeInvoiceAutoRun(settings?.invoice_auto_run);
    const configuredMode = normalizeInvoiceGenerationMode(settings?.invoice_auto_mode);
    invoiceMode = autoRun === "monthly" ? "monthly" : configuredMode;

    // If an order is closed, clamp any future line-item end dates to now so invoice generation
    // doesn't skip the order due to "end_at" being in the future.
    if (normalizedStatus === "closed") {
      await client.query(
        `
        UPDATE rental_order_line_items
           SET end_at = NOW()
         WHERE rental_order_id = $1
           AND start_at <= NOW()
           AND end_at > NOW()
        `,
        [id]
      );
    }

    if (prevStatus !== normalizedStatus) {
      const becameReceived = prevStatus !== "received" && normalizedStatus === "received";
      const becameClosed = prevStatus !== "closed" && normalizedStatus === "closed";
      if (becameReceived && (autoRun === "on_received" || autoRun === "on_closed")) {
        shouldGenerateInvoices = true;
      } else if (becameClosed && autoRun === "on_closed") {
        shouldGenerateInvoices = true;
      }
    }

    await insertRentalOrderAudit({
      client,
      companyId,
      orderId: id,
      actorName,
      actorEmail,
      action: "update",
      summary: existing.status !== normalizedStatus ? `Status: ${existing.status} → ${normalizedStatus}` : "Updated rental order.",
      changes: {
        before: { status: existing.status },
        after: { status: normalizedStatus },
      },
    });

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  let invoices = [];
  let invoiceError = null;
  if (shouldGenerateInvoices) {
    try {
      const result = await generateInvoicesForRentalOrder({ companyId, orderId: id, mode: invoiceMode });
      invoices = result?.created || [];
    } catch (err) {
      invoiceError = err?.message ? String(err.message) : "Unable to generate invoice.";
    }
  }

  return {
    id,
    quoteNumber: quoteNumberOut,
    roNumber: roNumberOut,
    status: statusOut,
    prevStatus: prevStatusOut,
    statusChanged: statusChangedOut,
    invoices,
    invoiceError,
  };
}

async function updateRentalOrderSiteAddress({ companyId, orderId, siteAddress }) {
  const res = await pool.query(
    `
    UPDATE rental_orders
       SET site_address = $1,
           updated_at = NOW()
     WHERE id = $2 AND company_id = $3
     RETURNING id, site_address, updated_at
    `,
    [siteAddress || null, orderId, companyId]
  );
  return res.rows[0] || null;
}

async function addRentalOrderNote({ companyId, orderId, userName, note }) {
  const result = await pool.query(
    `
    INSERT INTO rental_order_notes (rental_order_id, user_name, note)
    SELECT ro.id, $1, $2
      FROM rental_orders ro
     WHERE ro.id = $3 AND ro.company_id = $4
     RETURNING id, user_name, note, created_at
    `,
    [userName, note, orderId, companyId]
  );
  const created = result.rows[0];
  if (created) {
    await insertRentalOrderAudit({
      companyId,
      orderId,
      actorName: userName,
      actorEmail: null,
      action: "note",
      summary: "Added a note.",
      changes: { notePreview: String(note || "").slice(0, 200) },
    });
  }
  return created;
}

async function addRentalOrderAttachment({
  companyId,
  orderId,
  fileName,
  mime,
  sizeBytes,
  url,
  category = null,
  actorName,
  actorEmail,
}) {
  const result = await pool.query(
    `
    INSERT INTO rental_order_attachments (rental_order_id, file_name, mime, size_bytes, url, category)
    SELECT ro.id, $1, $2, $3, $4, $5
      FROM rental_orders ro
     WHERE ro.id = $6 AND ro.company_id = $7
     RETURNING id, file_name, mime, size_bytes, url, category, created_at
    `,
    [fileName, mime || null, sizeBytes || null, url, category, orderId, companyId]
  );
  const created = result.rows[0];
  if (created) {
    await insertRentalOrderAudit({
      companyId,
      orderId,
      actorName: actorName || null,
      actorEmail: actorEmail || null,
      action: "attachment_add",
      summary: "Added an attachment.",
      changes: { fileName, mime: mime || null, sizeBytes: sizeBytes || null, url, category },
    });
  }
  return created;
}

async function deleteRentalOrderAttachment({ companyId, orderId, attachmentId, actorName, actorEmail }) {
  const existingRes = await pool.query(
    `SELECT file_name, url FROM rental_order_attachments WHERE id = $1 AND rental_order_id = $2`,
    [attachmentId, orderId]
  );
  await pool.query(
    `
    DELETE FROM rental_order_attachments a
     USING rental_orders ro
     WHERE a.id = $1 AND a.rental_order_id = ro.id AND ro.id = $2 AND ro.company_id = $3
    `,
    [attachmentId, orderId, companyId]
  );
  const existing = existingRes.rows[0] || null;
  await insertRentalOrderAudit({
    companyId,
    orderId,
    actorName: actorName || null,
    actorEmail: actorEmail || null,
    action: "attachment_delete",
    summary: "Deleted an attachment.",
    changes: { attachmentId, fileName: existing?.file_name || null, url: existing?.url || null },
  });
}

async function listCustomerDocuments({ companyId, customerId }) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");

  const result = await pool.query(
    `
    SELECT d.id, d.file_name, d.mime, d.size_bytes, d.url, d.created_at
      FROM customer_documents d
      JOIN customers c ON c.id = d.customer_id
     WHERE d.customer_id = $1 AND c.company_id = $2
     ORDER BY d.created_at ASC, d.id ASC
    `,
    [customer, cid]
  );
  return result.rows || [];
}

async function addCustomerDocument({ companyId, customerId, fileName, mime, sizeBytes, url }) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");
  const cleanName = String(fileName || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!cleanName || !cleanUrl) throw new Error("fileName and url are required.");

  const result = await pool.query(
    `
    INSERT INTO customer_documents (customer_id, file_name, mime, size_bytes, url)
    SELECT c.id, $1, $2, $3, $4
      FROM customers c
     WHERE c.id = $5 AND c.company_id = $6
     RETURNING id, file_name, mime, size_bytes, url, created_at
    `,
    [cleanName, mime || null, sizeBytes || null, cleanUrl, customer, cid]
  );
  return result.rows?.[0] || null;
}

async function deleteCustomerDocument({ companyId, customerId, documentId }) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  const docId = Number(documentId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");
  if (!Number.isFinite(docId) || docId <= 0) throw new Error("documentId is required.");

  await pool.query(
    `
    DELETE FROM customer_documents d
     USING customers c
     WHERE d.id = $1 AND d.customer_id = c.id AND c.id = $2 AND c.company_id = $3
    `,
    [docId, customer, cid]
  );
}

async function getCustomerStorefrontExtras({ companyId, customerId }) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");

  const res = await pool.query(
    `
    SELECT id, email, cc_last4, cc_hash, documents
      FROM storefront_customers
     WHERE company_id = $1 AND internal_customer_id = $2
     ORDER BY created_at ASC, id ASC
     LIMIT 1
    `,
    [cid, customer]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    storefrontCustomerId: Number(row.id),
    email: row.email || null,
    hasCardOnFile: !!row.cc_hash,
    ccLast4: row.cc_last4 || null,
    documents: row.documents && typeof row.documents === "object" ? row.documents : {},
  };
}

async function insertRentalOrderAudit({
  client = null,
  companyId,
  orderId,
  actorName = null,
  actorEmail = null,
  action,
  summary = null,
  changes = {},
} = {}) {
  const runner = client || pool;
  const act = String(action || "").trim();
  if (!companyId || !orderId || !act) return null;
  const payload = changes && typeof changes === "object" ? changes : {};
  const result = await runner.query(
    `
    INSERT INTO rental_order_audits (company_id, rental_order_id, actor_name, actor_email, action, summary, changes)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    RETURNING id, created_at
    `,
    [companyId, orderId, actorName || null, actorEmail || null, act, summary || null, JSON.stringify(payload)]
  );
  return result.rows[0] || null;
}

async function listRentalOrderAudits({ companyId, orderId }) {
  const result = await pool.query(
    `
    SELECT id, actor_name, actor_email, action, summary, changes, created_at
      FROM rental_order_audits
     WHERE company_id = $1 AND rental_order_id = $2
     ORDER BY created_at DESC, id DESC
    `,
    [companyId, orderId]
  );
  return result.rows;
}

async function listAvailableInventory({ companyId, typeId, startAt, endAt, excludeOrderId }) {
  const start = normalizeTimestamptz(startAt);
  const end = normalizeTimestamptz(endAt);
  if (!start || !end) return [];

  const params = [companyId, typeId, start, end];
  let excludeSql = "";
  if (excludeOrderId) {
    params.push(excludeOrderId);
    excludeSql = "AND ro.id <> $5";
  }

  const result = await pool.query(
    `
    SELECT e.id,
           COALESCE(et.name, e.type) AS type,
           e.model_name,
           e.serial_number,
           e.condition,
           e.location_id,
           l.name AS location,
           cl.name AS current_location,
           eb.id AS bundle_id,
           eb.name AS bundle_name,
           COALESCE(bi.bundle_items, '[]'::jsonb) AS bundle_items
      FROM equipment e
 LEFT JOIN locations l ON l.id = e.location_id
 LEFT JOIN locations cl ON cl.id = e.current_location_id
 LEFT JOIN equipment_types et ON et.id = e.type_id
 LEFT JOIN equipment_bundle_items ebi ON ebi.equipment_id = e.id
 LEFT JOIN equipment_bundles eb ON eb.id = ebi.bundle_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'type_name', type_name,
                   'qty', qty
                 )
                 ORDER BY type_name
               ) AS bundle_items
          FROM (
            SELECT COALESCE(et2.name, e2.type) AS type_name,
                   COUNT(*)::int AS qty
              FROM equipment_bundle_items bi2
              JOIN equipment e2 ON e2.id = bi2.equipment_id
         LEFT JOIN equipment_types et2 ON et2.id = e2.type_id
             WHERE bi2.bundle_id = eb.id
             GROUP BY COALESCE(et2.name, e2.type)
          ) bundle_counts
      ) bi ON TRUE
     WHERE e.company_id = $1
       AND (ebi.bundle_id IS NULL OR e.id = eb.primary_equipment_id)
       AND e.type_id = $2
       AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
       AND (
         ebi.bundle_id IS NULL
         OR NOT EXISTS (
           SELECT 1
             FROM equipment_bundle_items bi2
             JOIN rental_order_line_inventory liv ON liv.equipment_id = bi2.equipment_id
             JOIN rental_order_line_items li ON li.id = liv.line_item_id
             JOIN rental_orders ro ON ro.id = li.rental_order_id
            WHERE bi2.bundle_id = ebi.bundle_id
              AND ro.company_id = $1
              AND ro.status IN ('requested', 'reservation', 'ordered')
              ${excludeSql}
              AND tstzrange(
                COALESCE(li.fulfilled_at, li.start_at),
                COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
                '[)'
              ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
         )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM rental_order_line_inventory liv
           JOIN rental_order_line_items li ON li.id = liv.line_item_id
           JOIN rental_orders ro ON ro.id = li.rental_order_id
          WHERE liv.equipment_id = e.id
            AND ro.company_id = $1
             AND ro.status IN ('requested', 'reservation', 'ordered')
             ${excludeSql}
             AND tstzrange(
               COALESCE(li.fulfilled_at, li.start_at),
               COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
               '[)'
             ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
        )
     ORDER BY e.serial_number
    `,
    params
  );
  return result.rows;
}

async function getBundleAvailability({ companyId, bundleId, startAt, endAt, excludeOrderId }) {
  const start = normalizeTimestamptz(startAt);
  const end = normalizeTimestamptz(endAt);
  if (!start || !end) return { available: false, items: [] };

  const itemsRes = await pool.query(
    `
    SELECT e.id,
           e.serial_number,
           e.model_name,
           COALESCE(et.name, e.type) AS type_name
      FROM equipment_bundle_items bi
      JOIN equipment e ON e.id = bi.equipment_id
 LEFT JOIN equipment_types et ON et.id = e.type_id
     WHERE bi.bundle_id = $1
       AND e.company_id = $2
     ORDER BY e.serial_number
    `,
    [bundleId, companyId]
  );
  const items = itemsRes.rows.map((row) => ({
    id: row.id,
    serialNumber: row.serial_number || "",
    modelName: row.model_name || "",
    typeName: row.type_name || "",
  }));
  if (!items.length) return { available: false, items };

  const equipmentIds = items.map((row) => row.id);
  const params = [companyId, equipmentIds, start, end];
  let excludeSql = "";
  if (excludeOrderId) {
    params.push(excludeOrderId);
    excludeSql = "AND ro.id <> $5";
  }

  const conflictRes = await pool.query(
    `
    SELECT COUNT(*)::int AS conflicts
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
     WHERE liv.equipment_id = ANY($2::int[])
       AND ro.company_id = $1
       AND ro.status IN ('requested', 'reservation', 'ordered')
       ${excludeSql}
       AND tstzrange(
         COALESCE(li.fulfilled_at, li.start_at),
         COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
         '[)'
       ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
    `,
    params
  );
  const conflicts = Number(conflictRes.rows?.[0]?.conflicts || 0);
  return { available: conflicts === 0, items };
}

async function getTypeDemandAvailability({ companyId, typeId, startAt, endAt, excludeOrderId }) {
  const start = normalizeTimestamptz(startAt);
  const end = normalizeTimestamptz(endAt);
  if (!start || !end) return { totalUnits: 0, demandUnits: 0, capacityUnits: 0 };

  const params = [companyId, typeId, start, end];
  let excludeSql = "";
  if (excludeOrderId) {
    params.push(excludeOrderId);
    excludeSql = "AND ro.id <> $5";
  }

  const demandRes = await pool.query(
    `
    SELECT li.id,
           CASE
             WHEN li.bundle_id IS NOT NULL THEN 1
             WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id)
             ELSE 1
           END AS qty
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
     WHERE ro.company_id = $1
       AND li.type_id = $2
       AND ro.status IN ('quote','requested','reservation','ordered')
       ${excludeSql}
       AND tstzrange(
         COALESCE(li.fulfilled_at, li.start_at),
         COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
         '[)'
       ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
     GROUP BY li.id
    `,
    params
  );
  const demandUnits = demandRes.rows.reduce((sum, row) => sum + Number(row.qty || 0), 0);

  const totalRes = await pool.query(
    `
    SELECT COUNT(*)::int AS total_units
      FROM equipment
     WHERE company_id = $1
       AND type_id = $2
       AND condition NOT IN ('Lost','Unusable')
       AND (serial_number IS NULL OR serial_number NOT ILIKE 'UNALLOCATED-%')
    `,
    [companyId, typeId]
  );
  const totalUnits = Number(totalRes.rows?.[0]?.total_units || 0);

  return {
    totalUnits,
    demandUnits,
    capacityUnits: totalUnits - demandUnits,
  };
}

function normalizeSearchTerm(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return `%${raw.replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
}

function normalizeSearchTokens(value, { limit = 6 } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const parts = raw.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  const sliced = parts.slice(0, Math.max(1, Math.min(12, Number(limit) || 6)));
  return sliced.map(normalizeSearchTerm).filter(Boolean);
}

async function listStorefrontListings({
  equipment = null,
  company = null,
  location = null,
  from = null,
  to = null,
  limit = 48,
  offset = 0,
} = {}) {
  const equipmentTokens = normalizeSearchTokens(equipment);
  const companyTokens = normalizeSearchTokens(company);
  const locationTokens = normalizeSearchTokens(location);

  const fromIso = normalizeTimestamptz(from);
  const toIso = normalizeTimestamptz(to);
  const hasRange = !!(fromIso && toIso);
  if (hasRange && Date.parse(fromIso) > Date.parse(toIso)) {
    return [];
  }
  const baseIndex = hasRange ? 2 : 0;

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 48));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const params = [];
  const where = ["stock.total_units > 0"];

  for (const token of equipmentTokens) {
    params.push(token);
    const idx = baseIndex + params.length;
    where.push(
      `(et.name ILIKE $${idx} ESCAPE '\\' OR cat.name ILIKE $${idx} ESCAPE '\\' OR et.description ILIKE $${idx} ESCAPE '\\' OR et.terms ILIKE $${idx} ESCAPE '\\')`
    );
  }

  for (const token of companyTokens) {
    params.push(token);
    const idx = baseIndex + params.length;
    where.push(`(c.name ILIKE $${idx} ESCAPE '\\')`);
  }

  for (const token of locationTokens) {
    params.push(token);
    const idx = baseIndex + params.length;
    where.push(`
      (
        c.city ILIKE $${idx} ESCAPE '\\'
        OR c.region ILIKE $${idx} ESCAPE '\\'
        OR c.country ILIKE $${idx} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
            FROM equipment e2
       LEFT JOIN locations l2 ON l2.id = e2.location_id
           WHERE e2.company_id = et.company_id
             AND e2.type_id = et.id
             AND (
               l2.name ILIKE $${idx} ESCAPE '\\'
               OR l2.city ILIKE $${idx} ESCAPE '\\'
               OR l2.region ILIKE $${idx} ESCAPE '\\'
               OR l2.country ILIKE $${idx} ESCAPE '\\'
             )
        )
      )
    `);
  }

  const rangeJoin = hasRange
    ? `
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT liv.equipment_id) AS reserved_units
          FROM rental_order_line_inventory liv
          JOIN rental_order_line_items li ON li.id = liv.line_item_id
          JOIN rental_orders ro ON ro.id = li.rental_order_id
          JOIN equipment e3 ON e3.id = liv.equipment_id
         WHERE ro.company_id = et.company_id
           AND li.type_id = et.id
           AND ro.status IN ('requested','reservation','ordered')
           AND e3.condition NOT IN ('Lost','Unusable')
           AND (e3.serial_number IS NULL OR e3.serial_number NOT ILIKE 'UNALLOCATED-%')
           AND tstzrange(
             COALESCE(li.fulfilled_at, li.start_at),
             COALESCE(li.returned_at, GREATEST(li.end_at, NOW())),
             '[)'
           ) && tstzrange($1::timestamptz, $2::timestamptz, '[)')
      ) reserved ON TRUE
    `
    : `
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT liv.equipment_id)::int AS reserved_units
          FROM rental_order_line_inventory liv
          JOIN rental_order_line_items li ON li.id = liv.line_item_id
          JOIN rental_orders ro ON ro.id = li.rental_order_id
          JOIN equipment e3 ON e3.id = liv.equipment_id
         WHERE ro.company_id = et.company_id
           AND li.type_id = et.id
           AND ro.status IN ('requested','reservation','ordered')
           AND e3.condition NOT IN ('Lost','Unusable')
           AND (e3.serial_number IS NULL OR e3.serial_number NOT ILIKE 'UNALLOCATED-%')
           AND (
             COALESCE(li.fulfilled_at, li.start_at) <= NOW()
             AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > NOW()
           )
      ) reserved ON TRUE
    `;

  const sql = `
    WITH listing AS (
      SELECT
        et.id AS type_id,
        et.name AS type_name,
        et.image_url,
        et.description,
        et.terms,
        et.daily_rate,
        et.weekly_rate,
        et.monthly_rate,
        cat.name AS category_name,
        c.id AS company_id,
        c.name AS company_name,
        c.phone AS company_phone,
        c.contact_email AS company_email,
          cs.logo_url AS company_logo_url,
          cs.rental_info_fields AS rental_info_fields,
        c.street_address AS company_street_address,
        c.city AS company_city,
        c.region AS company_region,
        c.country AS company_country,
        c.postal_code AS company_postal_code,
        stock.total_units,
        COALESCE(reserved.reserved_units, 0) AS reserved_units,
        GREATEST(stock.total_units - COALESCE(reserved.reserved_units, 0), 0) AS available_units,
        COALESCE(stock.locations, '[]'::jsonb) AS locations
      FROM equipment_types et
      JOIN companies c ON c.id = et.company_id
      LEFT JOIN company_settings cs ON cs.company_id = c.id
      LEFT JOIN equipment_categories cat ON cat.id = et.category_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE e.condition NOT IN ('Lost','Unusable'))::int AS total_units,
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'id', l.id,
              'name', l.name,
              'streetAddress', l.street_address,
              'city', l.city,
              'region', l.region,
              'country', l.country
            )
          ) FILTER (WHERE l.id IS NOT NULL) AS locations
        FROM equipment e
        LEFT JOIN locations l ON l.id = e.location_id
        WHERE e.company_id = et.company_id
          AND e.type_id = et.id
          AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
      ) stock ON TRUE
      ${rangeJoin}
      WHERE ${where.join(" AND ")}
    )
    SELECT *
      FROM listing
     ORDER BY available_units DESC, company_name ASC, type_name ASC
     LIMIT $${baseIndex + params.length + 1}
    OFFSET $${baseIndex + params.length + 2}
  `;

  const finalParams = [];
  if (hasRange) finalParams.push(fromIso, toIso);
  finalParams.push(...params);
  finalParams.push(safeLimit, safeOffset);

  const result = await pool.query(sql, finalParams);
  return result.rows.map((row) => ({
    typeId: Number(row.type_id),
    typeName: row.type_name,
    imageUrl: row.image_url || null,
    description: row.description || null,
    terms: row.terms || null,
    categoryName: row.category_name || null,
    dailyRate: row.daily_rate === null || row.daily_rate === undefined ? null : Number(row.daily_rate),
    weeklyRate: row.weekly_rate === null || row.weekly_rate === undefined ? null : Number(row.weekly_rate),
    monthlyRate: row.monthly_rate === null || row.monthly_rate === undefined ? null : Number(row.monthly_rate),
      company: {
        id: Number(row.company_id),
        name: row.company_name,
        email: row.company_email || null,
        phone: row.company_phone || null,
        logoUrl: row.company_logo_url || null,
        rentalInfoFields: normalizeRentalInfoFields(row.rental_info_fields),
        streetAddress: row.company_street_address || null,
        city: row.company_city || null,
        region: row.company_region || null,
        country: row.company_country || null,
      postalCode: row.company_postal_code || null,
    },
    stock: {
      totalUnits: Number(row.total_units || 0),
      reservedUnits: Number(row.reserved_units || 0),
      availableUnits: Number(row.available_units || 0),
      locations: Array.isArray(row.locations) ? row.locations : [],
    },
  }));
}

async function createStorefrontCustomer({
  companyId,
  name,
  businessName = null,
  companyName = null,
  streetAddress = null,
  city = null,
  region = null,
  country = null,
  postalCode = null,
  email,
  phone = null,
  password,
  creditCardNumber = null,
  documents = {},
  contacts,
  accountingContacts,
  followUpDate = null,
  notes = null,
  canChargeDeposit = null,
  paymentTermsDays = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new Error("email is required.");
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("name is required.");
  const cleanPassword = String(password || "");
  if (!cleanPassword || cleanPassword.length < 6) throw new Error("password must be at least 6 characters.");

    const existing = await pool.query(
      `SELECT id FROM storefront_customers WHERE LOWER(email) = $1 LIMIT 1`,
      [cleanEmail]
    );
    if (existing.rows?.[0]?.id) throw new Error("An account already exists with that email.");

  const ccLast4 = last4FromCardNumber(creditCardNumber);
  const ccHash = creditCardNumber ? hashToken(String(creditCardNumber).replace(/\D/g, "")) : null;
  const contactList = normalizeCustomerContacts({
    contacts,
    contactName: cleanName,
    email: cleanEmail,
    phone,
  });
  const accountingContactList = normalizeAccountingContacts({ accountingContacts });
  const primary = contactList[0] || {};
  const primaryName = normalizeContactField(primary.name) || normalizeContactField(cleanName);
  const primaryEmail = normalizeContactField(primary.email) || normalizeContactField(cleanEmail);
  const primaryPhone = normalizeContactField(primary.phone) || normalizeContactField(phone);
  const finalCompanyName = String(companyName || businessName || cleanName || cleanEmail).trim();
  const terms = normalizePaymentTermsDays(paymentTermsDays);
  const depositFlag = canChargeDeposit === true;
  const cleanedNotes = String(notes || "").trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let internalCustomerRow = null;
    const internalByEmail = await client.query(
      `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, follow_up_date, notes
       FROM customers
       WHERE company_id = $1 AND LOWER(email) = $2
       ORDER BY id ASC
       LIMIT 1`,
      [cid, cleanEmail]
    );
    if (internalByEmail.rows?.[0]) {
      internalCustomerRow = internalByEmail.rows[0];
    }

    if (!internalCustomerRow && finalCompanyName && primaryName) {
      const internalByName = await client.query(
        `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, follow_up_date, notes
         FROM customers
         WHERE company_id = $1
           AND LOWER(company_name) = LOWER($2)
           AND LOWER(contact_name) = LOWER($3)
           AND COALESCE(NULLIF(email, ''), '') = ''
         ORDER BY id ASC
         LIMIT 1`,
        [cid, finalCompanyName, primaryName]
      );
      if (internalByName.rows?.[0]) internalCustomerRow = internalByName.rows[0];
    }

    if (!internalCustomerRow && primaryPhone) {
      const phoneDigits = String(primaryPhone).replace(/\D/g, "");
      if (phoneDigits.length >= 7) {
        const internalByPhone = await client.query(
          `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, can_charge_deposit, payment_terms_days, follow_up_date, notes
           FROM customers
           WHERE company_id = $1
             AND regexp_replace(COALESCE(phone, ''), '\\\\D', '', 'g') = $2
             AND COALESCE(NULLIF(email, ''), '') = ''
           ORDER BY id ASC
           LIMIT 1`,
          [cid, phoneDigits]
        );
        if (internalByPhone.rows?.[0]) internalCustomerRow = internalByPhone.rows[0];
      }
    }

    let internalCustomerId = internalCustomerRow ? Number(internalCustomerRow.id) : null;
    if (internalCustomerRow) {
      const updates = {};
      const isBlank = (value) => value === null || value === undefined || String(value).trim() === "";
      const isEmptyArray = (value) => !Array.isArray(value) || value.length === 0;
      if (isBlank(internalCustomerRow.company_name) && finalCompanyName) updates.company_name = finalCompanyName;
      if (isBlank(internalCustomerRow.contact_name) && primaryName) updates.contact_name = primaryName;
      if (isBlank(internalCustomerRow.street_address) && streetAddress) updates.street_address = String(streetAddress).trim();
      if (isBlank(internalCustomerRow.city) && city) updates.city = String(city).trim();
      if (isBlank(internalCustomerRow.region) && region) updates.region = String(region).trim();
      if (isBlank(internalCustomerRow.country) && country) updates.country = String(country).trim();
      if (isBlank(internalCustomerRow.postal_code)) updates.postal_code = normalizePostalCode(postalCode);
      if (isBlank(internalCustomerRow.email) && primaryEmail) updates.email = primaryEmail;
      if (isBlank(internalCustomerRow.phone) && primaryPhone) updates.phone = primaryPhone;
      if (isEmptyArray(internalCustomerRow.contacts) && contactList.length) updates.contacts = contactList;
      if (isEmptyArray(internalCustomerRow.accounting_contacts) && accountingContactList.length) {
        updates.accounting_contacts = accountingContactList;
      }
      if (internalCustomerRow.payment_terms_days === null && terms !== null) updates.payment_terms_days = terms;
      if (internalCustomerRow.follow_up_date === null && followUpDate) updates.follow_up_date = followUpDate;
      if (isBlank(internalCustomerRow.notes) && cleanedNotes) updates.notes = cleanedNotes;

      const keys = Object.keys(updates);
      if (keys.length) {
        const setClauses = keys.map((key, idx) => `${key} = $${idx + 1}`);
        const values = keys.map((key) => updates[key]);
        values.push(internalCustomerId, cid);
        await client.query(
          `UPDATE customers SET ${setClauses.join(", ")} WHERE id = $${values.length - 1} AND company_id = $${values.length}`,
          values
        );
      }
    } else {
      const finalNotes = cleanedNotes || "Created from customer signup.";
      const internal = await client.query(
        `
        INSERT INTO customers (
          company_id,
          company_name,
          contact_name,
          street_address,
          city,
          region,
          country,
          postal_code,
          email,
          phone,
          contacts,
          accounting_contacts,
          can_charge_deposit,
          payment_terms_days,
          follow_up_date,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id
        `,
        [
          cid,
          finalCompanyName,
          primaryName,
          streetAddress ? String(streetAddress).trim() : null,
          city ? String(city).trim() : null,
          region ? String(region).trim() : null,
          country ? String(country).trim() : null,
          normalizePostalCode(postalCode),
          primaryEmail,
          primaryPhone,
          contactList,
          accountingContactList,
          depositFlag,
          terms,
          followUpDate || null,
          finalNotes,
        ]
      );
      internalCustomerId = Number(internal.rows?.[0]?.id) || null;
    }

    const res = await client.query(
      `
      INSERT INTO storefront_customers (
        company_id,
        internal_customer_id,
        name,
        business_name,
        can_act_as_company,
        street_address,
        city,
        region,
        country,
        postal_code,
        email,
        phone,
        password_hash,
        cc_last4,
        cc_hash,
        documents
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING id, company_id, internal_customer_id, name, business_name, can_act_as_company, street_address, city, region, country, postal_code, email, phone, cc_last4, created_at
      `,
      [
        cid,
        internalCustomerId,
        cleanName,
        businessName ? String(businessName).trim() : null,
        false,
        streetAddress ? String(streetAddress).trim() : null,
        city ? String(city).trim() : null,
        region ? String(region).trim() : null,
        country ? String(country).trim() : null,
        normalizePostalCode(postalCode),
        cleanEmail,
        phone ? String(phone).trim() : null,
        hashPassword(cleanPassword),
        ccLast4,
        ccHash,
        documents && typeof documents === "object" ? documents : {},
      ]
    );

    await client.query("COMMIT");
    return res.rows?.[0] || null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function createStorefrontCustomerSession({ customerId, ttlDays = 30 } = {}) {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("customerId is required.");
  const token = `sfc_${crypto.randomUUID()}`;
  const tokenHash = hashToken(token);
  const days = Math.max(1, Math.min(180, Number(ttlDays) || 30));
  const res = await pool.query(
    `
    INSERT INTO storefront_customer_sessions (customer_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + ($3::text || ' days')::interval)
    RETURNING expires_at
    `,
    [id, tokenHash, days]
  );
  return { token, expiresAt: res.rows?.[0]?.expires_at || null };
}

async function createCustomerAccountSession({ customerAccountId, ttlDays = 30 } = {}) {
  const id = Number(customerAccountId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("customerAccountId is required.");
  const token = `ca_${crypto.randomUUID()}`;
  const tokenHash = hashToken(token);
  const days = Math.max(1, Math.min(180, Number(ttlDays) || 30));
  const res = await pool.query(
    `
    INSERT INTO customer_account_sessions (customer_account_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + ($3::text || ' days')::interval)
    RETURNING expires_at
    `,
    [id, tokenHash, days]
  );
  return { token, expiresAt: res.rows?.[0]?.expires_at || null };
}

async function revokeStorefrontCustomerSession(token) {
  const raw = String(token || "").trim();
  if (!raw) return 0;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `UPDATE storefront_customer_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return Number(res.rowCount || 0);
}

async function revokeCustomerAccountSession(token) {
  const raw = String(token || "").trim();
  if (!raw) return 0;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `UPDATE customer_account_sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
  return Number(res.rowCount || 0);
}

async function authenticateStorefrontCustomer({ companyId, email, password } = {}) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const cid = Number(companyId);
  const hasCompany = Number.isFinite(cid) && cid > 0;

  const query = hasCompany
    ? {
        sql: `
        SELECT id, company_id, internal_customer_id, name, business_name, can_act_as_company, street_address, city, region, country, 
postal_code, email, phone, password_hash, cc_last4
        FROM storefront_customers
        WHERE company_id = $1 AND LOWER(email) = $2
        ORDER BY created_at ASC
        LIMIT 5
        `,
        params: [cid, cleanEmail],
      }
    : {
        sql: `
        SELECT id, company_id, internal_customer_id, name, business_name, can_act_as_company, street_address, city, region, country, 
postal_code, email, phone, password_hash, cc_last4
        FROM storefront_customers
        WHERE LOWER(email) = $1
        ORDER BY created_at ASC
        LIMIT 25
        `,
        params: [cleanEmail],
      };

  const res = await pool.query(query.sql, query.params);
  const rows = Array.isArray(res.rows) ? res.rows : [];
  if (!rows.length) return null;

  const match = rows.find((row) => verifyPassword(cleanPassword, row.password_hash).ok);
  if (!match) return null;

  const check = verifyPassword(cleanPassword, match.password_hash);
  if (check.needsUpgrade) {
    pool.query(`UPDATE storefront_customers SET password_hash = $1 WHERE id = $2`, [hashPassword(cleanPassword), match.id]).catch(() => {});
  }

  const session = await createStorefrontCustomerSession({ customerId: Number(match.id) });
  return {
    customer: {
      id: match.id,
      companyId: match.company_id,
      internalCustomerId: match.internal_customer_id === null ? null : Number(match.internal_customer_id),
      name: match.name,
      businessName: match.business_name,
      canActAsCompany: match.can_act_as_company === true,
      streetAddress: match.street_address,
      city: match.city,
      region: match.region,
      country: match.country,
      postalCode: match.postal_code,
      email: match.email,
      phone: match.phone,
      ccLast4: match.cc_last4,
    },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
async function getStorefrontCustomerByToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `
    SELECT
      c.id,
      c.company_id,
      c.internal_customer_id,
      c.name,
      c.business_name,
      c.can_act_as_company,
      c.street_address,
      c.city,
      c.region,
      c.country,
      c.postal_code,
      c.email,
      c.phone,
      c.cc_last4,
      c.documents
    FROM storefront_customer_sessions s
    JOIN storefront_customers c ON c.id = s.customer_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    internalCustomerId: row.internal_customer_id === null ? null : Number(row.internal_customer_id),
    name: row.name,
    businessName: row.business_name,
    canActAsCompany: row.can_act_as_company === true,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    email: row.email,
    phone: row.phone,
    ccLast4: row.cc_last4 || null,
    documents: row.documents || {},
  };
}

async function createCustomerAccount({
  name,
  email,
  password,
  businessName = null,
  streetAddress = null,
  city = null,
  region = null,
  country = null,
  postalCode = null,
  phone = null,
  creditCardNumber = null,
  documents = {},
} = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new Error("email is required.");
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("name is required.");
  const cleanPassword = String(password || "");
  if (!cleanPassword || cleanPassword.length < 6) throw new Error("password must be at least 6 characters.");

  const existing = await pool.query(`SELECT id FROM customer_accounts WHERE LOWER(email) = $1 LIMIT 1`, [cleanEmail]);
  if (existing.rows?.[0]?.id) throw new Error("An account already exists with that email.");

  const ccLast4 = last4FromCardNumber(creditCardNumber);
  const ccHash = creditCardNumber ? hashToken(String(creditCardNumber).replace(/\D/g, "")) : null;

  const res = await pool.query(
    `
    INSERT INTO customer_accounts (
      name, business_name, street_address, city, region, country, postal_code,
      email, phone, password_hash, cc_last4, cc_hash, documents
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id, name, business_name, street_address, city, region, country, postal_code, email, phone, cc_last4, documents, created_at
    `,
    [
      cleanName,
      businessName ? String(businessName).trim() : null,
      streetAddress ? String(streetAddress).trim() : null,
      city ? String(city).trim() : null,
      region ? String(region).trim() : null,
      country ? String(country).trim() : null,
      normalizePostalCode(postalCode),
      cleanEmail,
      phone ? String(phone).trim() : null,
      hashPassword(cleanPassword),
      ccLast4,
      ccHash,
      documents && typeof documents === "object" ? documents : {},
    ]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    businessName: row.business_name,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    email: row.email,
    phone: row.phone,
    ccLast4: row.cc_last4 || null,
    documents: row.documents || {},
    createdAt: row.created_at || null,
  };
}

async function authenticateCustomerAccount({ email, password } = {}) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const res = await pool.query(
    `
    SELECT id, name, business_name, street_address, city, region, country, postal_code, email, phone, password_hash, cc_last4, documents, created_at
    FROM customer_accounts
    WHERE LOWER(email) = $1
    LIMIT 1
    `,
    [cleanEmail]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  const check = verifyPassword(cleanPassword, row.password_hash);
  if (!check.ok) return null;
  if (check.needsUpgrade) {
    pool.query(`UPDATE customer_accounts SET password_hash = $1 WHERE id = $2`, [hashPassword(cleanPassword), row.id]).catch(() => {});
  }

  const session = await createCustomerAccountSession({ customerAccountId: Number(row.id) });
  return {
    customer: {
      id: Number(row.id),
      name: row.name,
      businessName: row.business_name,
      streetAddress: row.street_address,
      city: row.city,
      region: row.region,
      country: row.country,
      postalCode: row.postal_code,
      email: row.email,
      phone: row.phone,
      ccLast4: row.cc_last4 || null,
      documents: row.documents || {},
    },
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

async function getCustomerAccountByToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const tokenHash = hashToken(raw);
  const res = await pool.query(
    `
    SELECT
      c.id,
      c.name,
      c.business_name,
      c.street_address,
      c.city,
      c.region,
      c.country,
      c.postal_code,
      c.email,
      c.phone,
      c.cc_last4,
      c.documents
    FROM customer_account_sessions s
    JOIN customer_accounts c ON c.id = s.customer_account_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    businessName: row.business_name,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    email: row.email,
    phone: row.phone,
    ccLast4: row.cc_last4 || null,
    documents: row.documents || {},
  };
}

async function updateCustomerAccountProfile({
  customerId,
  name = undefined,
  businessName = undefined,
  streetAddress = undefined,
  city = undefined,
  region = undefined,
  country = undefined,
  postalCode = undefined,
  phone = undefined,
  creditCardNumber = undefined,
  documents = undefined,
} = {}) {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("customerId is required.");

  const hasText = (value) => String(value || "").trim().length > 0;

  const existingRes = await pool.query(
    `
    SELECT id, name, business_name, street_address, city, region, country, postal_code, email, phone, cc_last4, cc_hash, documents
    FROM customer_accounts
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  const existing = existingRes.rows?.[0] || null;
  if (!existing) return null;

  const nextName = name === undefined ? existing.name : hasText(name) ? String(name).trim() : existing.name;
  const nextBusinessName = businessName === undefined ? existing.business_name : hasText(businessName) ? String(businessName).trim() : null;
  const nextStreet = streetAddress === undefined ? existing.street_address : hasText(streetAddress) ? String(streetAddress).trim() : null;
  const nextCity = city === undefined ? existing.city : hasText(city) ? String(city).trim() : null;
  const nextRegion = region === undefined ? existing.region : hasText(region) ? String(region).trim() : null;
  const nextCountry = country === undefined ? existing.country : hasText(country) ? String(country).trim() : null;
  const nextPostal = postalCode === undefined ? existing.postal_code : normalizePostalCode(postalCode);
  const nextPhone = phone === undefined ? existing.phone : hasText(phone) ? String(phone).trim() : null;

  const creditCardRaw = creditCardNumber === undefined ? undefined : String(creditCardNumber || "").trim();
  const nextCcLast4 = creditCardRaw === undefined ? existing.cc_last4 : last4FromCardNumber(creditCardRaw);
  const nextCcHash = creditCardRaw === undefined ? existing.cc_hash : creditCardRaw ? hashToken(creditCardRaw.replace(/\D/g, "")) : null;

  const existingDocs = existing.documents && typeof existing.documents === "object" ? existing.documents : {};
  const updates = documents && typeof documents === "object" ? documents : null;
  const mergedDocs = { ...existingDocs };
  if (updates) {
    for (const [key, doc] of Object.entries(updates)) {
      if (!doc || typeof doc !== "object") continue;
      const url = String(doc.url || "").trim();
      if (!url) continue;
      mergedDocs[key] = doc;
    }
  }

  const res = await pool.query(
    `
    UPDATE customer_accounts
       SET name = $1,
           business_name = $2,
           street_address = $3,
           city = $4,
           region = $5,
           country = $6,
           postal_code = $7,
           phone = $8,
           cc_last4 = $9,
           cc_hash = $10,
           documents = $11::jsonb
     WHERE id = $12
     RETURNING id, name, business_name, street_address, city, region, country, postal_code, email, phone, cc_last4, documents
    `,
    [
      nextName,
      nextBusinessName,
      nextStreet,
      nextCity,
      nextRegion,
      nextCountry,
      nextPostal,
      nextPhone,
      nextCcLast4,
      nextCcHash,
      JSON.stringify(mergedDocs),
      id,
    ]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    businessName: row.business_name,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
    email: row.email,
    phone: row.phone,
    ccLast4: row.cc_last4 || null,
    documents: row.documents || {},
  };
}

async function updateStorefrontCustomerProfile({
  customerId,
  companyId,
  name = undefined,
  businessName = undefined,
  canActAsCompany = undefined,
  streetAddress = undefined,
  city = undefined,
  region = undefined,
  country = undefined,
  postalCode = undefined,
  phone = undefined,
  creditCardNumber = undefined,
  documents = undefined,
} = {}) {
  const id = Number(customerId);
  const cid = Number(companyId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("customerId is required.");
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");

  const hasText = (value) => String(value || "").trim().length > 0;

  const existingRes = await pool.query(
    `
    SELECT id, company_id, internal_customer_id, name, business_name, can_act_as_company, street_address, city, region, country, postal_code, email, phone, cc_last4, cc_hash, documents
    FROM storefront_customers
    WHERE id = $1 AND company_id = $2
    LIMIT 1
    `,
    [id, cid]
  );
  const existing = existingRes.rows?.[0];
  if (!existing) return null;

  const nextName = name === undefined ? existing.name : (hasText(name) ? String(name).trim() : existing.name);
  const nextBusinessName = businessName === undefined ? existing.business_name : (hasText(businessName) ? String(businessName).trim() : null);
  if (canActAsCompany !== undefined && typeof canActAsCompany !== "boolean") throw new Error("canActAsCompany must be boolean.");
  const nextCanActAsCompany = canActAsCompany === undefined ? existing.can_act_as_company === true : canActAsCompany === true;
  const nextStreet = streetAddress === undefined ? existing.street_address : (hasText(streetAddress) ? String(streetAddress).trim() : null);
  const nextCity = city === undefined ? existing.city : (hasText(city) ? String(city).trim() : null);
  const nextRegion = region === undefined ? existing.region : (hasText(region) ? String(region).trim() : null);
  const nextCountry = country === undefined ? existing.country : (hasText(country) ? String(country).trim() : null);
  const nextPostal = postalCode === undefined ? existing.postal_code : normalizePostalCode(postalCode);
  const nextPhone = phone === undefined ? existing.phone : (hasText(phone) ? String(phone).trim() : null);

  const creditCardRaw = creditCardNumber === undefined ? undefined : String(creditCardNumber || "").trim();
  const nextCcLast4 = creditCardRaw === undefined ? existing.cc_last4 : last4FromCardNumber(creditCardRaw);
  const nextCcHash = creditCardRaw === undefined ? existing.cc_hash : (creditCardRaw ? hashToken(creditCardRaw.replace(/\D/g, "")) : null);

  const existingDocs = existing.documents && typeof existing.documents === "object" ? existing.documents : {};
  const updates = documents && typeof documents === "object" ? documents : null;
  const mergedDocs = { ...existingDocs };
  if (updates) {
    for (const [key, doc] of Object.entries(updates)) {
      if (!doc || typeof doc !== "object") continue;
      const url = String(doc.url || "").trim();
      if (!url) continue;
      mergedDocs[key] = doc;
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      UPDATE storefront_customers
         SET name = $1,
             business_name = $2,
             can_act_as_company = $3,
             street_address = $4,
             city = $5,
             region = $6,
             country = $7,
             postal_code = $8,
             phone = $9,
             cc_last4 = $10,
             cc_hash = $11,
             documents = $12::jsonb
       WHERE id = $13 AND company_id = $14
       RETURNING id, company_id, internal_customer_id, name, business_name, can_act_as_company, street_address, city, region, country, postal_code, email, phone, cc_last4, documents
      `,
      [
        nextName,
        nextBusinessName,
        nextCanActAsCompany,
        nextStreet,
        nextCity,
        nextRegion,
        nextCountry,
        nextPostal,
        nextPhone,
        nextCcLast4,
        nextCcHash,
        JSON.stringify(mergedDocs),
        id,
        cid,
      ]
    );

    const row = res.rows?.[0] || null;
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }

    const internalCustomerId = row.internal_customer_id === null ? null : Number(row.internal_customer_id);
    if (internalCustomerId) {
      await client.query(
        `
        UPDATE customers
           SET company_name = $1,
               contact_name = $2,
               street_address = $3,
               city = $4,
               region = $5,
               country = $6,
               postal_code = $7,
               phone = $8
         WHERE id = $9 AND company_id = $10
        `,
        [
          String(nextBusinessName || nextName || row.email || "").trim() || null,
          String(nextName || "").trim() || null,
          nextStreet,
          nextCity,
          nextRegion,
          nextCountry,
          nextPostal,
          nextPhone,
          internalCustomerId,
          cid,
        ]
      );
    }

    await client.query("COMMIT");
    return {
      id: Number(row.id),
      companyId: Number(row.company_id),
      internalCustomerId,
      name: row.name,
      businessName: row.business_name,
      canActAsCompany: row.can_act_as_company === true,
      streetAddress: row.street_address,
      city: row.city,
      region: row.region,
      country: row.country,
      postalCode: row.postal_code,
      email: row.email,
      phone: row.phone,
      ccLast4: row.cc_last4 || null,
      documents: row.documents || {},
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function findOrCreateStorefrontCustomer({
  companyId,
  contactName,
  email,
  phone,
  companyName,
  streetAddress,
  city,
  region,
  country,
  postalCode,
} = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) {
    const existing = await pool.query(
      `SELECT id FROM customers WHERE company_id = $1 AND LOWER(email) = $2 LIMIT 1`,
      [companyId, normalizedEmail]
    );
    if (existing.rows[0]?.id) {
      return Number(existing.rows[0].id);
    }
  }

  const created = await createCustomer({
    companyId,
    companyName: companyName || contactName || (normalizedEmail ? normalizedEmail : "Storefront customer"),
    contactName: contactName || null,
    streetAddress: streetAddress || null,
    city: city || null,
    region: region || null,
    country: country || null,
    postalCode: postalCode || null,
    email: normalizedEmail || null,
    phone: phone || null,
    canChargeDeposit: false,
    salesPersonId: null,
    followUpDate: null,
    notes: "Created from public storefront reservation.",
  });

  return Number(created.id);
}

function getMissingStorefrontCustomerFields({ customer, requiredFields }) {
  const required = Array.isArray(requiredFields) ? requiredFields : [];
  if (!customer || !required.length) return [];

  const hasText = (value) => String(value || "").trim().length > 0;
  const docs = customer.documents && typeof customer.documents === "object" ? customer.documents : {};
  const hasDoc = (key) => {
    const doc = docs[key];
    if (!doc || typeof doc !== "object") return false;
    return hasText(doc.url);
  };

  const missing = [];
  for (const key of required) {
    if (key === "name" && !hasText(customer.name)) missing.push(key);
    else if (key === "businessName" && !hasText(customer.businessName)) missing.push(key);
    else if (key === "phone" && !hasText(customer.phone)) missing.push(key);
    else if (key === "streetAddress" && !hasText(customer.streetAddress)) missing.push(key);
    else if (key === "city" && !hasText(customer.city)) missing.push(key);
    else if (key === "region" && !hasText(customer.region)) missing.push(key);
    else if (key === "postalCode" && !hasText(customer.postalCode)) missing.push(key);
    else if (key === "country" && !hasText(customer.country)) missing.push(key);
    else if (key === "creditCardNumber" && !hasText(customer.ccLast4)) missing.push(key);
    else if (["reference1", "reference2", "proofOfInsurance", "driversLicense"].includes(key) && !hasDoc(key)) missing.push(key);
  }
  return missing;
}

async function createStorefrontReservation({
  companyId,
  typeId,
  locationId = null,
  startAt,
  endAt,
  quantity = 1,
  customerToken,
  customerNotes,
  deliveryMethod,
  deliveryAddress,
  siteAddress,
  deliveryInstructions,
  criticalAreas,
  generalNotes,
  generalNotesImages,
  emergencyContacts,
  siteContacts,
  coverageHours,
} = {}) {
  const cid = Number(companyId);
  const tid = Number(typeId);
  const lid = locationId === null || locationId === undefined || locationId === "" ? null : Number(locationId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(tid) || tid <= 0) throw new Error("typeId is required.");
  if (lid !== null && (!Number.isFinite(lid) || lid <= 0)) throw new Error("Invalid locationId.");

  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) throw new Error("startAt and endAt are required.");
  if (Date.parse(endIso) <= Date.parse(startIso)) throw new Error("endAt must be after startAt.");

  const qty = Math.max(1, Math.min(10, Number(quantity) || 1));

  const globalCustomer = await getCustomerAccountByToken(customerToken);
  const storefrontCustomer = globalCustomer ? null : await getStorefrontCustomerByToken(customerToken);

  let customer = null;
  let allowStorefrontWriteback = false;

  if (globalCustomer) {
    customer = {
      ...globalCustomer,
      companyId: cid,
      internalCustomerId: null,
    };
  } else if (storefrontCustomer) {
    const isSameCompany = Number(storefrontCustomer.companyId) === cid;
    allowStorefrontWriteback = isSameCompany;
    customer = isSameCompany
      ? storefrontCustomer
      : {
          ...storefrontCustomer,
          companyId: cid,
          internalCustomerId: null,
        };
  }
  if (!customer) throw new Error("Login required before reserving equipment.");

  const settings = await getCompanySettings(cid);
  const requiredFields = normalizeStorefrontCustomerRequirements(settings.required_storefront_customer_fields);
  const missingFields = getMissingStorefrontCustomerFields({ customer, requiredFields });
  if (missingFields.length) {
    return {
      ok: false,
      error: "missing_profile_fields",
      message: "Please complete your customer profile before submitting a booking request.",
      missingFields,
      requiredFields,
    };
  }

  const rentalInfoFields = normalizeRentalInfoFields(settings.rental_info_fields);
  const useRentalInfoField = (key) => rentalInfoFields?.[key]?.enabled !== false;
  const siteAddressValue = useRentalInfoField("siteAddress") ? String(siteAddress || "").trim() || null : null;
  const criticalAreasValue = useRentalInfoField("criticalAreas") ? String(criticalAreas || "").trim() || null : null;
  const generalNotesValue = useRentalInfoField("generalNotes") ? String(generalNotes || "").trim() || null : null;
  const emergencyContactList = useRentalInfoField("emergencyContacts") ? normalizeOrderContacts(emergencyContacts) : [];
  const siteContactList = useRentalInfoField("siteContacts") ? normalizeOrderContacts(siteContacts) : [];
  const coverageHoursValue = useRentalInfoField("coverageHours") ? normalizeCoverageHours(coverageHours) : {};

  const missingRentalInfo = [];
  const contactIsValid = (list) =>
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((entry) => String(entry?.name || "").trim() && (String(entry?.email || "").trim() || String(entry?.phone || "").trim()));
  const coverageIsValid = (coverageMap) => {
    if (!coverageMap || typeof coverageMap !== "object") return false;
    const days = Object.keys(coverageMap);
    if (!days.length) return false;
    return days.every((day) => {
      const entry = coverageMap[day] || {};
      return String(entry.start || "").trim() && String(entry.end || "").trim();
    });
  };

  if (rentalInfoFields?.siteAddress?.enabled && rentalInfoFields?.siteAddress?.required && !siteAddressValue) {
    missingRentalInfo.push("Site address");
  }
  if (rentalInfoFields?.criticalAreas?.enabled && rentalInfoFields?.criticalAreas?.required && !criticalAreasValue) {
    missingRentalInfo.push("Critical areas on site");
  }
  if (rentalInfoFields?.generalNotes?.enabled && rentalInfoFields?.generalNotes?.required && !generalNotesValue) {
    missingRentalInfo.push("General notes");
  }
  if (
    rentalInfoFields?.emergencyContacts?.enabled &&
    rentalInfoFields?.emergencyContacts?.required &&
    !contactIsValid(emergencyContactList)
  ) {
    missingRentalInfo.push("Emergency contacts");
  }
  if (
    rentalInfoFields?.siteContacts?.enabled &&
    rentalInfoFields?.siteContacts?.required &&
    !contactIsValid(siteContactList)
  ) {
    missingRentalInfo.push("Site contacts");
  }
  if (rentalInfoFields?.coverageHours?.enabled && rentalInfoFields?.coverageHours?.required && !coverageIsValid(coverageHoursValue)) {
    missingRentalInfo.push("Hours of coverage");
  }
  if (missingRentalInfo.length) {
    return {
      ok: false,
      error: "missing_rental_information",
      message: `Complete the rental information: ${missingRentalInfo.join(", ")}.`,
      missingFields: missingRentalInfo,
    };
  }

  const coverageDays = Object.keys(coverageHoursValue || {});

  const lineItems = Array.from({ length: qty }, () => ({
    typeId: tid,
    startAt: startIso,
    endAt: endIso,
    rateBasis: null,
    rateAmount: null,
    inventoryIds: [],
  }));

  let internalCustomerId = allowStorefrontWriteback ? customer.internalCustomerId : null;
  if (!internalCustomerId) {
    internalCustomerId = await findOrCreateStorefrontCustomer({
      companyId: cid,
      contactName: customer.name,
      email: customer.email,
      phone: customer.phone || null,
      companyName: customer.businessName || null,
      streetAddress: customer.streetAddress || null,
      city: customer.city || null,
      region: customer.region || null,
      country: customer.country || null,
      postalCode: customer.postalCode || null,
    });
    if (allowStorefrontWriteback) {
      await pool.query(
        `UPDATE storefront_customers SET internal_customer_id = $1 WHERE id = $2 AND internal_customer_id IS NULL`,
        [internalCustomerId, customer.id]
      );
    }
  }

  const typeRes = await pool.query(
    `SELECT daily_rate, weekly_rate, monthly_rate, terms FROM equipment_types WHERE id = $1 AND company_id = $2`,
    [tid, cid]
  );
  const typeRow = typeRes.rows[0] || {};
  const rateAmount = typeRow.daily_rate === null || typeRow.daily_rate === undefined ? null : Number(typeRow.daily_rate);

  const deliveryMode = String(deliveryMethod || "").trim().toLowerCase();
  const fulfillmentMethod = deliveryMode === "delivery" || deliveryMode === "dropoff" ? "dropoff" : "pickup";
  const dropoffAddress = fulfillmentMethod === "dropoff" ? String(deliveryAddress || "").trim() || null : null;
  const combinedGeneralNotes = generalNotesValue || null;
  const logisticsInstructions = String(deliveryInstructions || "").trim() || null;
  const normalizedGeneralNotesImages = useRentalInfoField("generalNotes")
    ? normalizeOrderAttachments({
        companyId: cid,
        attachments: generalNotesImages,
        category: "general_notes",
      })
    : [];

  const order = await createRentalOrder({
    companyId: cid,
    customerId: internalCustomerId,
    actorName: customer.name,
    actorEmail: customer.email,
    fulfillmentMethod,
    status: "requested",
    terms: typeRow.terms || null,
    generalNotes: combinedGeneralNotes,
    criticalAreas: criticalAreasValue,
    coverageHours: coverageHoursValue,
    emergencyContacts: emergencyContactList,
    siteContacts: siteContactList,
    siteAddress: siteAddressValue,
    pickupLocationId: fulfillmentMethod === "pickup" ? lid : null,
    dropoffAddress,
    logisticsInstructions,
    lineItems: lineItems.map((li) => ({
      ...li,
      rateBasis: rateAmount !== null && Number.isFinite(rateAmount) ? "daily" : null,
      rateAmount: rateAmount !== null && Number.isFinite(rateAmount) ? rateAmount : null,
    })),
  });

  for (const img of normalizedGeneralNotesImages) {
    await addRentalOrderAttachment({
      companyId: cid,
      orderId: order.id,
      fileName: img.fileName,
      mime: img.mime,
      sizeBytes: img.sizeBytes,
      url: img.url,
      category: img.category,
      actorName: customer.name,
      actorEmail: customer.email,
    });
  }

  const docs = customer?.documents && typeof customer.documents === "object" ? customer.documents : {};
  for (const [key, doc] of Object.entries(docs)) {
    if (!doc || typeof doc !== "object") continue;
    const url = String(doc.url || "").trim();
    if (!url) continue;
    const fileName = String(doc.fileName || key || "document").trim() || "document";
    const mime = String(doc.mime || "").trim() || null;
    const sizeBytes = doc.sizeBytes === null || doc.sizeBytes === undefined ? null : Number(doc.sizeBytes);
    await pool.query(
      `INSERT INTO rental_order_attachments (rental_order_id, file_name, mime, size_bytes, url) VALUES ($1,$2,$3,$4,$5)`,
      [order.id, fileName, mime, Number.isFinite(sizeBytes) ? sizeBytes : null, url]
    );
  }

  return {
    ok: true,
    orderId: order.id,
    roNumber: order.roNumber || null,
    quoteNumber: order.quoteNumber || null,
    inventoryIds: [],
  };
}

async function authenticateStorefrontCustomerAnyCompany({ email, password } = {}) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const res = await pool.query(
    `
    SELECT DISTINCT company_id
    FROM storefront_customers
    WHERE LOWER(email) = $1
    `,
    [cleanEmail]
  );
  const companyIds = Array.from(
    new Set((res.rows || []).map((r) => Number(r.company_id)).filter((n) => Number.isFinite(n) && n > 0))
  );

  if (companyIds.length !== 1) return null;
  return await authenticateStorefrontCustomer({ companyId: companyIds[0], email: cleanEmail, password: cleanPassword });
}

async function listCustomerOrdersForInternalCustomer({ companyId, customerId, limit = 25, offset = 0 } = {}) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");

  const lim = Math.max(1, Math.min(200, Number(limit) || 25));
  const off = Math.max(0, Number(offset) || 0);

  const res = await pool.query(
    `
    SELECT
      o.id,
      o.quote_number,
      o.ro_number,
      o.status,
      o.fulfillment_method,
      o.created_at,
      o.updated_at,
      MIN(li.start_at) AS start_at,
      MAX(li.end_at) AS end_at
    FROM rental_orders o
    LEFT JOIN rental_order_line_items li ON li.rental_order_id = o.id
    WHERE o.company_id = $1 AND o.customer_id = $2
    GROUP BY o.id
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT $3 OFFSET $4
    `,
    [cid, customer, lim, off]
  );

  return (res.rows || []).map((row) => ({
    id: Number(row.id),
    quoteNumber: row.quote_number || null,
    roNumber: row.ro_number || null,
    status: row.status || null,
    fulfillmentMethod: row.fulfillment_method || null,
    startAt: row.start_at || null,
    endAt: row.end_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }));
}

async function listCustomerCompaniesByEmail({ email } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return [];

  const res = await pool.query(
    `
    SELECT DISTINCT c.id, c.name
    FROM customers cu
    JOIN companies c ON c.id = cu.company_id
    WHERE LOWER(cu.email) = $1
    ORDER BY c.name ASC, c.id ASC
    `,
    [cleanEmail]
  );

  return (res.rows || []).map((row) => ({
    id: Number(row.id),
    name: row.name,
  }));
}

async function findInternalCustomerIdByEmail({ companyId, email } = {}) {
  const cid = Number(companyId);
  const cleanEmail = normalizeEmail(email);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!cleanEmail) return null;

  const res = await pool.query(
    `
    SELECT id
    FROM customers
    WHERE company_id = $1 AND LOWER(email) = $2
    LIMIT 1
    `,
    [cid, cleanEmail]
  );
  const row = res.rows?.[0] || null;
  if (!row?.id) return null;
  return Number(row.id);
}

module.exports = {
  pool,
  ensureTables,
  createCompanyWithUser,
  createUser,
  listUsers,
  getUser,
  updateUserRoleModes,
  authenticateUser,
  createCompanyUserSession,
  getCompanyUserByToken,
  revokeCompanyUserSession,
  getCompanyProfile,
  updateCompanyProfile,
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  setLocationGeocode,
  deleteLocation,
  getEquipmentLocationIds,
  listEquipmentCurrentLocationIdsForIds,
  recordEquipmentCurrentLocationChange,
  cleanupNonBaseLocationIfUnused,
  listEquipmentCurrentLocationHistory,
  listEquipment,
  setEquipmentCurrentLocationForIds,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  purgeEquipmentForCompany,
  listEquipmentBundles,
  getEquipmentBundle,
  createEquipmentBundle,
  updateEquipmentBundle,
  deleteEquipmentBundle,
  listCategories,
  createCategory,
  listTypes,
  createType,
  updateType,
  deleteType,
  listTypeStats,
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  listPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  importInventoryFromText,
  importCustomerPricingFromInventoryText,
  importCustomersFromText,
  importRentalOrdersFromLegacyExports,
  importRentalOrdersFromFutureInventoryReport,
  backfillLegacyRates,
  listCustomerPricing,
  upsertCustomerPricing,
  deleteCustomerPricing,
  listSalesPeople,
  getSalesPerson,
  createSalesPerson,
  updateSalesPerson,
  deleteSalesPerson,
  getCompanySettings,
  upsertCompanySettings,
  getCompanyEmailSettings,
  upsertCompanyEmailSettings,
  listRentalOrders,
  listRentalOrdersForRange,
  listRentalOrderContacts,
  listTimelineData,
  getRentalOrder,
  createRentalOrder,
  updateRentalOrder,
  updateRentalOrderSiteAddress,
  updateRentalOrderStatus,
  addRentalOrderNote,
  addRentalOrderAttachment,
  deleteRentalOrderAttachment,
  listCustomerDocuments,
  addCustomerDocument,
  deleteCustomerDocument,
  getCustomerStorefrontExtras,
  listRentalOrderAudits,
  listAvailableInventory,
  getBundleAvailability,
  getTypeDemandAvailability,
  listStorefrontListings,
  createStorefrontCustomer,
  authenticateStorefrontCustomer,
  authenticateStorefrontCustomerAnyCompany,
  getStorefrontCustomerByToken,
  revokeStorefrontCustomerSession,
  updateStorefrontCustomerProfile,
  createCustomerAccount,
  authenticateCustomerAccount,
  getCustomerAccountByToken,
  revokeCustomerAccountSession,
  updateCustomerAccountProfile,
  createStorefrontReservation,
  listCustomerOrdersForInternalCustomer,
  listCustomerCompaniesByEmail,
  findInternalCustomerIdByEmail,
  rescheduleLineItemEnd,
  setLineItemPickedUp,
  setLineItemReturned,
  applyWorkOrderPauseToEquipment,
  createPickupBillingForLineItem,
  createReturnBillingForLineItem,
  createPauseBillingAdjustments,
  getTypeAvailabilitySeries,
  getAvailabilityShortfallsSummary,
  getTypeAvailabilitySeriesWithProjection,
  getTypeAvailabilityShortfallDetails,
  getUtilizationDashboard,
  getRevenueSummary,
  getRevenueTimeSeries,
  getSalespersonSummary,
  getSalespersonClosedTransactionsTimeSeries,
  getLocationClosedTransactionsTimeSeries,
  getLocationTypeStockSummary,
  listInvoices,
  getInvoice,
  replaceInvoiceLineItems,
  createManualInvoice,
  addInvoicePayment,
  addCustomerPayment,
  addCustomerDeposit,
  getCustomerCreditBalance,
  getCustomerDepositBalance,
  applyCustomerCreditToInvoice,
  applyCustomerDepositToInvoice,
  applyCustomerCreditToOldestInvoices,
  listCustomerCreditActivity,
  refundCustomerDeposit,
  reverseInvoicePayment,
  markInvoiceEmailSent,
  createInvoiceVersion,
  markInvoiceVersionSent,
  getLatestSentInvoiceVersion,
  getLatestInvoiceVersion,
  createInvoiceCorrection,
  deleteInvoice,
  voidInvoice,
  generateInvoicesForRentalOrder,
  listCompaniesWithMonthlyAutoRun,
  generateMonthlyInvoicesForCompany,
  getAccountsReceivableSummary,
};
