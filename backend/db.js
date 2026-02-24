const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SESSION_IDLE_DAYS = (() => {
  const raw = Number(process.env.SESSION_IDLE_DAYS || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(180, Math.floor(raw));
})();

const LEGACY_SHA256_RE = /^[a-f0-9]{64}$/i;
const PASSWORD_V2_PREFIX = "s2$";
const MIN_PASSWORD_LENGTH = 8;
const PASSWORD_LETTER_RE = /[A-Za-z]/;
const PASSWORD_NUMBER_RE = /\d/;

function getPasswordValidationError(password) {
  const cleanPassword = String(password || "");
  if (!cleanPassword) return "password is required.";
  if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!PASSWORD_LETTER_RE.test(cleanPassword)) {
    return "password must include at least one letter.";
  }
  if (!PASSWORD_NUMBER_RE.test(cleanPassword)) {
    return "password must include at least one number.";
  }
  return null;
}

function assertValidPassword(password) {
  const error = getPasswordValidationError(password);
  if (error) throw new Error(error);
}

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

const QBO_TOKEN_ENC_PREFIX = "enc:v1:";
let cachedQboTokenKey = null;
let cachedQboTokenKeyLoaded = false;

function normalizeQboRealmId(value) {
  return String(value || "").trim();
}

function hashQboRealmId(value) {
  const raw = normalizeQboRealmId(value);
  if (!raw) return null;
  return hashToken(raw);
}

function parseQboTokenKey(raw) {
  const clean = String(raw || "").trim();
  if (!clean) return null;
  if (/^[a-f0-9]{64}$/i.test(clean)) return Buffer.from(clean, "hex");
  try {
    const buf = Buffer.from(clean, "base64");
    if (buf.length === 32) return buf;
  } catch {
    // Fall through.
  }
  if (Buffer.byteLength(clean, "utf8") === 32) return Buffer.from(clean, "utf8");
  return null;
}

function getQboTokenKey() {
  if (cachedQboTokenKeyLoaded) return cachedQboTokenKey;
  cachedQboTokenKeyLoaded = true;
  cachedQboTokenKey = parseQboTokenKey(process.env.QBO_TOKEN_ENCRYPTION_KEY);
  return cachedQboTokenKey;
}

function encryptQboTokenValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith(QBO_TOKEN_ENC_PREFIX)) return raw;
  const key = getQboTokenKey();
  if (!key) {
    throw new Error("QBO_TOKEN_ENCRYPTION_KEY is required to encrypt QBO tokens.");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${QBO_TOKEN_ENC_PREFIX}${iv.toString("base64")}.${tag.toString("base64")}.${ciphertext.toString("base64")}`;
}

function decryptQboTokenValue(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (!raw.startsWith(QBO_TOKEN_ENC_PREFIX)) return raw;
  const key = getQboTokenKey();
  if (!key) {
    throw new Error("QBO_TOKEN_ENCRYPTION_KEY is required to decrypt QBO tokens.");
  }
  const payload = raw.slice(QBO_TOKEN_ENC_PREFIX.length);
  const parts = payload.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted QBO token format.");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}

async function backfillQboRealmHashes(client) {
  if (!client) return;
  let rows;
  try {
    const res = await client.query(
      `SELECT company_id, realm_id, realm_id_hash FROM qbo_connections WHERE realm_id_hash IS NULL OR realm_id_hash = ''`
    );
    rows = res.rows || [];
  } catch {
    return;
  }
  if (!rows.length) return;

  for (const row of rows) {
    let decrypted = "";
    try {
      decrypted = decryptQboTokenValue(row.realm_id);
    } catch {
      continue;
    }
    if (!decrypted) continue;
    const hash = hashToken(decrypted);
    if (!hash) continue;
    await client.query(`UPDATE qbo_connections SET realm_id_hash = $1 WHERE company_id = $2`, [
      hash,
      row.company_id,
    ]);
  }
}

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

function overrideStatusFromLineItems(status, lineItems) {
  const normalized = normalizeRentalOrderStatus(status);
  if (!["requested", "reservation", "ordered", "received"].includes(normalized)) return normalized;

  const items = Array.isArray(lineItems) ? lineItems : [];
  let fulfilled = 0;
  let unreturned = 0;
  let total = 0;
  for (const item of items) {
    const startAt = normalizeTimestamptz(item?.startAt);
    const endAt = normalizeTimestamptz(item?.endAt);
    if (!startAt || !endAt) continue;
    total += 1;
    const fulfilledAt = normalizeTimestamptz(item?.fulfilledAt);
    if (fulfilledAt) fulfilled += 1;
    const returnedAt = normalizeTimestamptz(item?.returnedAt);
    if (!returnedAt) unreturned += 1;
  }

  if (total > 0 && unreturned === 0) return "received";
  if (fulfilled > 0 && (normalized === "requested" || normalized === "reservation")) return "ordered";
  if (normalized === "received" && unreturned > 0) return "ordered";
  return normalized;
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
        website TEXT,
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
        last_used_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;`);
    await client.query(
      `ALTER TABLE company_user_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();`
    );
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
        documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        description TEXT,
        terms TEXT,
        daily_rate NUMERIC(12, 2),
        weekly_rate NUMERIC(12, 2),
        monthly_rate NUMERIC(12, 2),
        qbo_item_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, name)
      );
    `);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;`);
      await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS image_url TEXT;`);
      await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS weekly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS monthly_rate NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE equipment_types ADD COLUMN IF NOT EXISTS qbo_item_id TEXT;`);
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
          qbo_customer_id TEXT,
          contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
          accounting_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
          contact_groups JSONB NOT NULL DEFAULT '{}'::jsonb,
          can_charge_deposit BOOLEAN NOT NULL DEFAULT FALSE,
          sales_person_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL,
          follow_up_date DATE,
          notes TEXT,
          is_pending BOOLEAN NOT NULL DEFAULT FALSE,
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
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS qbo_customer_id TEXT;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS accounting_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_groups JSONB NOT NULL DEFAULT '{}'::jsonb;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS can_charge_deposit BOOLEAN NOT NULL DEFAULT FALSE;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_person_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS follow_up_date DATE;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;`);
      await client.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_pending BOOLEAN NOT NULL DEFAULT FALSE;`);
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
        category TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE customer_documents ADD COLUMN IF NOT EXISTS category TEXT;`);
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
        last_used_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `ALTER TABLE storefront_customer_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();`
    );
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
        last_used_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `);
    await client.query(
      `ALTER TABLE customer_account_sessions ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ DEFAULT NOW();`
    );
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
      CREATE TABLE IF NOT EXISTS equipment_out_of_service (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
        work_order_number TEXT NOT NULL,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(company_id, equipment_id, work_order_number)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS equipment_out_of_service_equipment_idx ON equipment_out_of_service (company_id, equipment_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS equipment_out_of_service_range_idx ON equipment_out_of_service (company_id, start_at, end_at);`
    );

    await client.query(`
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
    `);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_order_number TEXT NOT NULL DEFAULT '';`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_date DATE NOT NULL DEFAULT CURRENT_DATE;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS unit_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS unit_labels JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS unit_label TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS work_summary TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS issues TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'open';`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS service_status TEXT NOT NULL DEFAULT 'in_service';`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS return_inspection BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS labor JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source_order_id TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source_order_number TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source_line_item_id TEXT;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_orders_company_idx ON work_orders (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_orders_company_status_idx ON work_orders (company_id, order_status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_orders_company_service_idx ON work_orders (company_id, service_status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_orders_updated_idx ON work_orders (company_id, updated_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS work_orders_unit_ids_idx ON work_orders USING GIN (unit_ids);`);

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        so_number TEXT,
        equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_po TEXT,
        salesperson_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'open',
        sale_price NUMERIC(12, 2),
        description TEXT,
        image_url TEXT,
        image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
        documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS so_number TEXT;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS customer_po TEXT;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS salesperson_id INTEGER REFERENCES sales_people(id) ON DELETE SET NULL;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sale_price NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS description TEXT;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS image_url TEXT;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`CREATE INDEX IF NOT EXISTS sales_orders_company_id_idx ON sales_orders (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS sales_orders_company_status_idx ON sales_orders (company_id, status);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_company_so_number_uniq ON sales_orders (company_id, so_number) WHERE so_number IS NOT NULL;`
    );

    // Repair: if a pre-existing location had an address and was accidentally marked non-base, restore it.
    // (Current-only locations created via picker typically have no address, and dropoff/site locations are prefixed.)
    await client.query(`
      UPDATE locations
         SET is_base_location = TRUE
       WHERE is_base_location = FALSE
         AND name NOT ILIKE 'Dropoff - %'
         AND name NOT ILIKE 'Order % - Site'
         AND name <> 'Order Site'
         AND (
           street_address IS NOT NULL
           OR city IS NOT NULL
           OR region IS NOT NULL
           OR country IS NOT NULL
         );
    `);
    // Keep rental order site-address locations non-base so they don't appear in base-yard pickers.
    await client.query(`
      UPDATE locations
         SET is_base_location = FALSE
       WHERE is_base_location = TRUE
         AND (
           name ILIKE 'Order % - Site'
           OR name = 'Order Site'
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
        customer_id INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
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
        site_access_info TEXT,
        site_address_lat DOUBLE PRECISION,
        site_address_lng DOUBLE PRECISION,
        site_address_query TEXT,
        logistics_instructions TEXT,
        special_instructions TEXT,
        critical_areas TEXT,
        monitoring_personnel TEXT,
        notification_circumstances JSONB NOT NULL DEFAULT '[]'::jsonb,
        coverage_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
        coverage_timezone TEXT,
        coverage_stat_holidays_required BOOLEAN NOT NULL DEFAULT FALSE,
        emergency_contact_instructions TEXT,
        emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
        site_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
        monthly_recurring_subtotal NUMERIC(12, 2),
        monthly_recurring_total NUMERIC(12, 2),
        show_monthly_recurring BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS quote_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS ro_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS external_contract_number TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS legacy_data JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ALTER COLUMN customer_id DROP NOT NULL;`);
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
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_name TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_address TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_access_info TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_address_lat DOUBLE PRECISION;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_address_lng DOUBLE PRECISION;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_address_query TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS logistics_instructions TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS special_instructions TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS critical_areas TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS monitoring_personnel TEXT;`);
    await client.query(
      `ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS notification_circumstances JSONB NOT NULL DEFAULT '[]'::jsonb;`
    );
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS coverage_hours JSONB NOT NULL DEFAULT '{}'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS coverage_timezone TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS coverage_stat_holidays_required BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS emergency_contact_instructions TEXT;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS site_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS monthly_recurring_subtotal NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS monthly_recurring_total NUMERIC(12, 2);`);
    await client.query(`ALTER TABLE rental_orders ADD COLUMN IF NOT EXISTS show_monthly_recurring BOOLEAN NOT NULL DEFAULT FALSE;`);
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
        unit_description TEXT,
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
    await client.query(`ALTER TABLE rental_order_line_conditions ADD COLUMN IF NOT EXISTS unit_description TEXT;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS rental_order_fees (
        id SERIAL PRIMARY KEY,
        rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        fee_date DATE,
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0
      );
    `);
    await client.query(`ALTER TABLE rental_order_fees ADD COLUMN IF NOT EXISTS fee_date DATE;`);
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
      CREATE TABLE IF NOT EXISTS rental_order_dispatch_notes (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        rental_order_id INTEGER NOT NULL REFERENCES rental_orders(id) ON DELETE CASCADE,
        equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
        line_item_id INTEGER REFERENCES rental_order_line_items(id) ON DELETE SET NULL,
        user_name TEXT NOT NULL,
        note TEXT NOT NULL,
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS rental_order_dispatch_notes_company_order_idx ON rental_order_dispatch_notes (company_id, rental_order_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS rental_order_dispatch_notes_equipment_idx ON rental_order_dispatch_notes (equipment_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS rental_order_dispatch_notes_line_item_idx ON rental_order_dispatch_notes (line_item_id);`
    );

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
      CREATE TABLE IF NOT EXISTS customer_share_links (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        rental_order_id INTEGER REFERENCES rental_orders(id) ON DELETE SET NULL,
        scope TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        allowed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        allowed_line_item_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
        allowed_document_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
        terms_text TEXT,
        require_esignature BOOLEAN NOT NULL DEFAULT TRUE,
        single_use BOOLEAN NOT NULL DEFAULT FALSE,
        expires_at TIMESTAMPTZ,
        created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        used_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        last_used_ip TEXT,
        last_used_user_agent TEXT,
        last_change_request_id INTEGER
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_share_links_company_id_idx ON customer_share_links (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_share_links_customer_id_idx ON customer_share_links (customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_share_links_order_id_idx ON customer_share_links (rental_order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_share_links_expires_at_idx ON customer_share_links (expires_at);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_change_requests (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        rental_order_id INTEGER REFERENCES rental_orders(id) ON DELETE SET NULL,
        link_id INTEGER REFERENCES customer_share_links(id) ON DELETE SET NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        documents JSONB NOT NULL DEFAULT '[]'::jsonb,
        signature JSONB NOT NULL DEFAULT '{}'::jsonb,
        proof_pdf_path TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        review_notes TEXT,
        customer_review_status TEXT,
        order_review_status TEXT,
        customer_reviewed_at TIMESTAMPTZ,
        order_reviewed_at TIMESTAMPTZ,
        source_ip TEXT,
        user_agent TEXT,
        applied_customer_id INTEGER,
        applied_order_id INTEGER
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_change_requests_company_id_idx ON customer_change_requests (company_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_change_requests_customer_id_idx ON customer_change_requests (customer_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_change_requests_order_id_idx ON customer_change_requests (rental_order_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_change_requests_link_id_idx ON customer_change_requests (link_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS customer_change_requests_status_idx ON customer_change_requests (status);`);
    await client.query(`ALTER TABLE customer_change_requests ADD COLUMN IF NOT EXISTS customer_review_status TEXT;`);
    await client.query(`ALTER TABLE customer_change_requests ADD COLUMN IF NOT EXISTS order_review_status TEXT;`);
    await client.query(`ALTER TABLE customer_change_requests ADD COLUMN IF NOT EXISTS customer_reviewed_at TIMESTAMPTZ;`);
    await client.query(`ALTER TABLE customer_change_requests ADD COLUMN IF NOT EXISTS order_reviewed_at TIMESTAMPTZ;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        billing_rounding_mode TEXT NOT NULL DEFAULT 'ceil',
        billing_rounding_granularity TEXT NOT NULL DEFAULT 'unit',
        monthly_proration_method TEXT NOT NULL DEFAULT 'hours',
        billing_timezone TEXT NOT NULL DEFAULT 'UTC',
        logo_url TEXT,
        qbo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        qbo_billing_day INTEGER NOT NULL DEFAULT 1,
        qbo_adjustment_policy TEXT NOT NULL DEFAULT 'credit_memo',
        qbo_income_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
        qbo_default_tax_code TEXT,
        tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        default_tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0,
        tax_registration_number TEXT,
        tax_inclusive_pricing BOOLEAN NOT NULL DEFAULT FALSE,
          auto_apply_customer_credit BOOLEAN NOT NULL DEFAULT TRUE,
          auto_work_order_on_return BOOLEAN NOT NULL DEFAULT FALSE,
          required_storefront_customer_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
          rental_info_fields JSONB NOT NULL DEFAULT '{"siteAddress":{"enabled":true,"required":false},"siteName":{"enabled":true,"required":false},"siteAccessInfo":{"enabled":true,"required":false},"criticalAreas":{"enabled":true,"required":true},"monitoringPersonnel":{"enabled":true,"required":false},"generalNotes":{"enabled":true,"required":true},"emergencyContacts":{"enabled":true,"required":true},"emergencyContactInstructions":{"enabled":true,"required":false},"siteContacts":{"enabled":true,"required":true},"notificationCircumstances":{"enabled":true,"required":false},"coverageHours":{"enabled":true,"required":true}}'::jsonb,
        customer_contact_categories JSONB NOT NULL DEFAULT '[{"key":"contacts","label":"Contacts"},{"key":"accountingContacts","label":"Accounting contacts"}]'::jsonb,
        customer_document_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
        customer_terms_template TEXT,
        customer_esign_required BOOLEAN NOT NULL DEFAULT TRUE,
        customer_service_agreement_url TEXT,
        customer_service_agreement_file_name TEXT,
        customer_service_agreement_mime TEXT,
        customer_service_agreement_size_bytes INTEGER,
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
    `);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_rounding_mode TEXT NOT NULL DEFAULT 'ceil';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_rounding_granularity TEXT NOT NULL DEFAULT 'unit';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS monthly_proration_method TEXT NOT NULL DEFAULT 'hours';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS billing_timezone TEXT NOT NULL DEFAULT 'UTC';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qbo_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qbo_billing_day INTEGER NOT NULL DEFAULT 1;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qbo_adjustment_policy TEXT NOT NULL DEFAULT 'credit_memo';`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qbo_income_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS qbo_default_tax_code TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_tax_rate NUMERIC(8, 5) NOT NULL DEFAULT 0;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_registration_number TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS tax_inclusive_pricing BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_apply_customer_credit BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_work_order_on_return BOOLEAN NOT NULL DEFAULT FALSE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS required_storefront_customer_fields JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS rental_info_fields JSONB NOT NULL DEFAULT '{"siteAddress":{"enabled":true,"required":false},"siteName":{"enabled":true,"required":false},"siteAccessInfo":{"enabled":true,"required":false},"criticalAreas":{"enabled":true,"required":true},"monitoringPersonnel":{"enabled":true,"required":false},"generalNotes":{"enabled":true,"required":true},"emergencyContacts":{"enabled":true,"required":true},"emergencyContactInstructions":{"enabled":true,"required":false},"siteContacts":{"enabled":true,"required":true},"notificationCircumstances":{"enabled":true,"required":false},"coverageHours":{"enabled":true,"required":true}}'::jsonb;`
    );
    await client.query(
      `ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_contact_categories JSONB NOT NULL DEFAULT '[{"key":"contacts","label":"Contacts"},{"key":"accountingContacts","label":"Accounting contacts"}]'::jsonb;`
    );
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_document_categories JSONB NOT NULL DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_terms_template TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_esign_required BOOLEAN NOT NULL DEFAULT TRUE;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_service_agreement_url TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_service_agreement_file_name TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_service_agreement_mime TEXT;`);
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS customer_service_agreement_size_bytes INTEGER;`);
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
    await client.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();`);
    await client.query(`UPDATE company_settings SET billing_rounding_granularity = 'unit' WHERE billing_rounding_granularity IS NULL;`);
    await client.query(`UPDATE company_settings SET monthly_proration_method = 'hours' WHERE monthly_proration_method IS NULL;`);
    await client.query(`UPDATE company_settings SET qbo_billing_day = 1 WHERE qbo_billing_day IS NULL;`);
    await client.query(`UPDATE company_settings SET qbo_adjustment_policy = 'credit_memo' WHERE qbo_adjustment_policy IS NULL;`);
    await client.query(`UPDATE company_settings SET qbo_income_account_ids = '[]'::jsonb WHERE qbo_income_account_ids IS NULL;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qbo_connections (
        company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        realm_id TEXT NOT NULL,
        realm_id_hash TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        access_token_expires_at TIMESTAMPTZ,
        refresh_token_expires_at TIMESTAMPTZ,
        scope TEXT,
        token_type TEXT,
        connected_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`ALTER TABLE qbo_connections ADD COLUMN IF NOT EXISTS realm_id_hash TEXT;`);
    await client.query(`CREATE INDEX IF NOT EXISTS qbo_connections_realm_hash_idx ON qbo_connections (realm_id_hash);`);
    await backfillQboRealmHashes(client);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qbo_documents (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        rental_order_id INTEGER REFERENCES rental_orders(id) ON DELETE SET NULL,
        qbo_entity_type TEXT NOT NULL,
        qbo_entity_id TEXT NOT NULL,
        doc_number TEXT,
        billing_period TEXT,
        txn_date DATE,
        due_date DATE,
        total_amount NUMERIC(12, 2),
        balance NUMERIC(12, 2),
        currency_code TEXT,
        status TEXT,
        customer_ref TEXT,
        source TEXT NOT NULL DEFAULT 'qbo',
        is_voided BOOLEAN NOT NULL DEFAULT FALSE,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
        last_updated_at TIMESTAMPTZ,
        last_synced_at TIMESTAMPTZ DEFAULT NOW(),
        raw JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS qbo_documents_unique_idx ON qbo_documents (company_id, qbo_entity_type, qbo_entity_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS qbo_documents_ro_idx ON qbo_documents (company_id, rental_order_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS qbo_documents_period_idx ON qbo_documents (company_id, billing_period);`
    );
    await client.query(`DROP INDEX IF EXISTS qbo_documents_period_unique;`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qbo_sync_state (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        entity_name TEXT NOT NULL,
        last_cdc_timestamp TIMESTAMPTZ,
        PRIMARY KEY (company_id, entity_name)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS qbo_error_logs (
        id BIGSERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        realm_id TEXT,
        endpoint TEXT,
        method TEXT,
        status INTEGER,
        intuit_tid TEXT,
        error_message TEXT,
        error_payload JSONB,
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS qbo_error_logs_company_idx ON qbo_error_logs (company_id, created_at DESC);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS doc_sequences (
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        doc_prefix TEXT NOT NULL,
        year INTEGER NOT NULL,
        next_seq INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (company_id, doc_prefix, year)
      );
    `);

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

function normalizeCoverageTimeZone(value, fallback = null) {
  const raw = String(value || "").trim();
  if (raw) return normalizeBillingTimeZone(raw);
  const nextFallback = String(fallback || "").trim();
  if (nextFallback) return normalizeBillingTimeZone(nextFallback);
  return "UTC";
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

async function getCompanySettingsForClient(client, companyId) {
  const res = await client.query(
    `SELECT company_id,
            billing_rounding_mode,
            billing_rounding_granularity,
            monthly_proration_method,
            billing_timezone,
            logo_url,
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
      logo_url: res.rows[0].logo_url || null,
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
    logo_url: null,
    tax_enabled: false,
    default_tax_rate: 0,
    tax_registration_number: null,
    tax_inclusive_pricing: false,
      auto_apply_customer_credit: true,
      auto_work_order_on_return: false,
      rental_info_fields: normalizeRentalInfoFields(null),
  };
}

async function createCompanyWithUser({ companyName, contactEmail, ownerName, ownerEmail, password }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cleanContactEmail = normalizeEmail(contactEmail);
    const cleanOwnerEmail = normalizeEmail(ownerEmail);
    const cleanCompanyName = String(companyName || "").trim();
    const cleanOwnerName = String(ownerName || "").trim();
    const cleanPassword = String(password || "");
    if (!cleanCompanyName) throw new Error("companyName is required.");
    if (!cleanContactEmail) throw new Error("contactEmail is required.");
    if (!cleanOwnerName) throw new Error("ownerName is required.");
    if (!cleanOwnerEmail) throw new Error("ownerEmail is required.");
    assertValidPassword(cleanPassword);

    const companyResult = await client.query(
      `INSERT INTO companies (name, contact_email) VALUES ($1, $2) RETURNING id, name`,
      [cleanCompanyName, cleanContactEmail]
    );
    const company = companyResult.rows[0];
    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, role, password_hash, can_act_as_customer)
       VALUES ($1, $2, $3, 'owner', $4, TRUE) RETURNING id, name, email, role`,
      [company.id, cleanOwnerName, cleanOwnerEmail, hashPassword(cleanPassword)]
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
    const cleanPassword = String(password || "");
    if (!companyId) throw new Error("companyId is required.");
    if (!cleanName) throw new Error("name is required.");
    if (!cleanEmail) throw new Error("email is required.");
    assertValidPassword(cleanPassword);
  
    const existing = await pool.query(`SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [cleanEmail]);
    if (existing.rows?.[0]?.id) throw new Error("An account already exists with that email.");
  
    const result = await pool.query(
      `INSERT INTO users (company_id, name, email, role, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role`,
      [companyId, cleanName, cleanEmail, cleanRole, hashPassword(cleanPassword)]
  );
  return result.rows[0];
}

async function listUsers(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [cid];
  const where = ["company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`${field} < $${params.length}::timestamptz`);
  }
  const res = await pool.query(
    `SELECT id, name, email, role, can_act_as_customer, created_at
       FROM users
      WHERE ${where.join(" AND ")}
      ORDER BY created_at ASC`,
    params
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
      c.website,
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
      website: row.website,
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
  const idleDays = SESSION_IDLE_DAYS;
  const params = [tokenHash];
  const idleClause =
    idleDays > 0
      ? "AND COALESCE(s.last_used_at, s.created_at) > NOW() - ($2::text || ' days')::interval"
      : "";
  if (idleDays > 0) params.push(idleDays);
  const res = await pool.query(
    `
    WITH session AS (
      UPDATE company_user_sessions s
      SET last_used_at = NOW()
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        ${idleClause}
      RETURNING s.id, s.user_id, s.company_id, s.expires_at
    )
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
      c.website,
      c.phone,
      c.street_address,
      c.city,
      c.region,
      c.country,
      c.postal_code
    FROM session s
    JOIN users u ON u.id = s.user_id
    JOIN companies c ON c.id = s.company_id
    WHERE s.id IS NOT NULL
    LIMIT 1
    `,
    params
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
      website: row.website,
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
    SELECT id, name, contact_email, website, phone, street_address, city, region, country, postal_code
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
    website: row.website,
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
  website,
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
           website = $4,
           phone = $5,
           street_address = $6,
           city = $7,
           region = $8,
           country = $9,
           postal_code = $10,
           updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, contact_email, website, phone, street_address, city, region, country, postal_code
    `,
    [
      companyId,
      String(name || "").trim() || "Company",
      String(email || "").trim() || "unknown@example.com",
      String(website || "").trim() || null,
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
    website: row.website,
    phone: row.phone,
    streetAddress: row.street_address,
    city: row.city,
    region: row.region,
    country: row.country,
    postalCode: row.postal_code,
  };
}

async function listLocations(companyId, { scope, from = null, to = null, dateField = "created_at" } = {}) {
  const normalizedScope = String(scope || "").trim().toLowerCase();
  const includeAll = normalizedScope === "all";
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId, includeAll];
  const where = ["company_id = $1", "($2::boolean OR is_base_location = TRUE)"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`${field} < $${params.length}::timestamptz`);
  }
  const result = await pool.query(
    `SELECT id, name, street_address, city, region, country, latitude, longitude, is_base_location, created_at
     FROM locations
     WHERE ${where.join(" AND ")}
     ORDER BY name`,
    params
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

async function listEquipmentLocationIdsForIds({ companyId, equipmentIds }) {
  const ids = Array.isArray(equipmentIds) ? equipmentIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (!ids.length) return [];
  const res = await pool.query(
    `SELECT id, location_id, current_location_id
     FROM equipment
     WHERE company_id = $1 AND id = ANY($2::int[])`,
    [companyId, ids]
  );
  return res.rows.map((r) => ({
    id: Number(r.id),
    location_id: r.location_id === null ? null : Number(r.location_id),
    current_location_id: r.current_location_id === null ? null : Number(r.current_location_id),
  }));
}

async function setEquipmentCurrentLocationToBaseForIds({ companyId, equipmentIds }) {
  const ids = Array.isArray(equipmentIds) ? equipmentIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)) : [];
  if (!ids.length) return 0;
  const res = await pool.query(
    `UPDATE equipment
        SET current_location_id = location_id
      WHERE company_id = $1
        AND id = ANY($2::int[])
        AND location_id IS NOT NULL`,
    [companyId, ids]
  );
  return res.rowCount || 0;
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

async function listCategories(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`${field} < $${params.length}::timestamptz`);
  }
  const result = await pool.query(
    `SELECT id, name, created_at
       FROM equipment_categories
      WHERE ${where.join(" AND ")}
      ORDER BY name`,
    params
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

async function listTypes(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["et.company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`et.${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`et.${field} < $${params.length}::timestamptz`);
  }
    const result = await pool.query(
      `SELECT et.id, et.name, et.description, et.terms, et.category_id,
              COALESCE(NULLIF(et.image_urls, '[]'::jsonb)->>0, et.image_url) AS image_url,
              et.image_urls,
              et.documents,
              et.qbo_item_id,
              et.daily_rate, et.weekly_rate, et.monthly_rate,
              ec.name AS category,
              et.created_at
       FROM equipment_types et
       LEFT JOIN equipment_categories ec ON et.category_id = ec.id
       WHERE ${where.join(" AND ")}
       ORDER BY et.name`,
      params
    );
    return result.rows.map((row) => ({
      ...row,
      documents: normalizeTypeDocuments(row.documents),
    }));
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

async function createType({
  companyId,
  name,
  categoryId,
  imageUrl,
  imageUrls,
  documents,
  description,
  terms,
  dailyRate,
  weeklyRate,
  monthlyRate,
  qboItemId,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const docs = normalizeTypeDocuments(documents);
  const result = await pool.query(
    `INSERT INTO equipment_types (company_id, name, category_id, image_url, image_urls, documents, description, terms, daily_rate, weekly_rate, monthly_rate, qbo_item_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (company_id, name) DO NOTHING
     RETURNING id, name, category_id, image_url, image_urls, documents, description, terms, daily_rate, weekly_rate, monthly_rate, qbo_item_id`,
    [
      companyId,
      name,
      categoryId || null,
      primaryUrl,
      JSON.stringify(urls),
      JSON.stringify(docs),
      description || null,
      terms || null,
      dailyRate || null,
      weeklyRate || null,
      monthlyRate || null,
      qboItemId ? String(qboItemId).trim() : null,
    ]
  );
  const row = result.rows[0];
  if (row) row.documents = normalizeTypeDocuments(row.documents);
  return row;
}

async function updateType({
  id,
  companyId,
  name,
  categoryId,
  imageUrl,
  imageUrls,
  documents,
  description,
  terms,
  dailyRate,
  weeklyRate,
  monthlyRate,
  qboItemId,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const docs = normalizeTypeDocuments(documents);
  const result = await pool.query(
    `UPDATE equipment_types
     SET name = $1, category_id = $2, image_url = $3, image_urls = $4, documents = $5, description = $6, terms = $7,
         daily_rate = $8, weekly_rate = $9, monthly_rate = $10, qbo_item_id = $11
     WHERE id = $12 AND company_id = $13
     RETURNING id, name, category_id, image_url, image_urls, documents, description, terms, daily_rate, weekly_rate, monthly_rate, qbo_item_id`,
    [
      name,
      categoryId || null,
      primaryUrl,
      JSON.stringify(urls),
      JSON.stringify(docs),
      description || null,
      terms || null,
      dailyRate || null,
      weeklyRate || null,
      monthlyRate || null,
      qboItemId ? String(qboItemId).trim() : null,
      id,
      companyId,
    ]
  );
  const row = result.rows[0];
  if (row) row.documents = normalizeTypeDocuments(row.documents);
  return row;
}

async function deleteType({ id, companyId }) {
  await pool.query(`DELETE FROM equipment_types WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

async function listEquipment(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["e.company_id = $1", "(e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`e.${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`e.${field} < $${params.length}::timestamptz`);
  }
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
           cl.street_address AS current_location_street_address,
           cl.city AS current_location_city,
           cl.region AS current_location_region,
           cl.country AS current_location_country,
           cl.geocode_query AS current_location_query,
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
           COALESCE(av.has_overdue, FALSE) AS is_overdue,
           COALESCE(active_ro.order_id, reserved_ro.order_id) AS rental_order_id,
           COALESCE(active_ro.ro_number, reserved_ro.ro_number) AS rental_order_number,
           COALESCE(active_ro.customer_name, reserved_ro.customer_name) AS rental_customer_name,
           COALESCE(active_ro.customer_id, reserved_ro.customer_id) AS rental_customer_id,
           COALESCE(active_ro.site_address, reserved_ro.site_address) AS rental_site_address,
           COALESCE(active_ro.site_address_query, reserved_ro.site_address_query) AS rental_site_address_query,
           e.created_at
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
        BOOL_OR(ro.status IN ('reservation','requested') AND li.end_at > NOW()) AS has_reserved_now
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      WHERE liv.equipment_id = e.id
        AND ro.company_id = $1
        AND ro.status IN ('requested','reservation','ordered')
    ) av ON TRUE
    LEFT JOIN LATERAL (
      SELECT ro.id AS order_id,
             ro.ro_number,
             ro.customer_id,
             c.company_name AS customer_name,
             ro.site_address,
             ro.site_address_query,
             li.end_at,
             li.returned_at
        FROM rental_order_line_inventory liv
        JOIN rental_order_line_items li ON li.id = liv.line_item_id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        LEFT JOIN customers c ON c.id = ro.customer_id
       WHERE liv.equipment_id = e.id
         AND ro.company_id = $1
         AND ro.status = 'ordered'
         AND (
           (li.returned_at IS NULL AND li.end_at < NOW())
           OR (
             COALESCE(li.fulfilled_at, li.start_at) <= NOW()
             AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > NOW()
           )
         )
       ORDER BY
         CASE WHEN li.returned_at IS NULL AND li.end_at < NOW() THEN 0 ELSE 1 END,
         li.end_at NULLS LAST,
         ro.id DESC
       LIMIT 1
    ) active_ro ON TRUE
    LEFT JOIN LATERAL (
      SELECT ro.id AS order_id,
             ro.ro_number,
             ro.customer_id,
             c.company_name AS customer_name,
             ro.site_address,
             ro.site_address_query,
             li.start_at,
             li.end_at
        FROM rental_order_line_inventory liv
        JOIN rental_order_line_items li ON li.id = liv.line_item_id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        LEFT JOIN customers c ON c.id = ro.customer_id
       WHERE liv.equipment_id = e.id
         AND ro.company_id = $1
         AND ro.status IN ('reservation','requested')
         AND li.end_at > NOW()
       ORDER BY
         CASE WHEN li.start_at <= NOW() THEN 0 ELSE 1 END,
         CASE WHEN li.start_at <= NOW() THEN li.start_at END DESC NULLS LAST,
         CASE WHEN li.start_at > NOW() THEN li.start_at END ASC NULLS LAST,
         ro.id DESC
       LIMIT 1
    ) reserved_ro ON TRUE
    WHERE ${where.join(" AND ")}
    ORDER BY e.created_at DESC;
  `,
    params
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
  const existingRes = await pool.query(
    `SELECT id, type_id FROM equipment WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [id, companyId]
  );
  const existing = existingRes.rows[0];
  if (!existing) return null;
  const prevTypeId = existing.type_id === null || existing.type_id === undefined ? null : Number(existing.type_id);
  const nextTypeId = typeId === null || typeId === undefined ? null : Number(typeId);
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
  const updated = result.rows[0];
  if (updated && prevTypeId !== nextTypeId) {
    await syncLineItemTypesForEquipment({
      companyId,
      equipmentId: updated.id,
      typeId: nextTypeId,
    });
  }
  return updated;
}

async function syncLineItemTypesForEquipment({ companyId, equipmentId, typeId }) {
  if (!companyId || !equipmentId) return 0;
  if (typeId === null || typeId === undefined) return 0;
  const res = await pool.query(
    `
    WITH target AS (
      SELECT li.id
        FROM rental_order_line_items li
        JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
       WHERE liv.equipment_id = $2
         AND ro.company_id = $3
         AND ro.status <> 'closed'
         AND (SELECT COUNT(*) FROM rental_order_line_inventory liv2 WHERE liv2.line_item_id = li.id) = 1
         AND li.type_id IS DISTINCT FROM $1
    )
    UPDATE rental_order_line_items li
       SET type_id = $1
      FROM target
     WHERE li.id = target.id
    `,
    [typeId, equipmentId, companyId]
  );
  return res.rowCount || 0;
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

async function listEquipmentBundles(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "updated_at" ? "updated_at" : "created_at";
  const params = [companyId];
  const where = ["b.company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`b.${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`b.${field} < $${params.length}::timestamptz`);
  }
  const result = await pool.query(
    `
    SELECT b.id,
           b.name,
           b.primary_equipment_id,
           b.daily_rate,
           b.weekly_rate,
           b.monthly_rate,
           b.created_at,
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
     WHERE ${where.join(" AND ")}
     GROUP BY b.id, pe.type_id, et.name, et.daily_rate, et.weekly_rate, et.monthly_rate
     ORDER BY b.name ASC
    `,
    params
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
    createdAt: row.created_at || null,
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

async function listVendors(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`${field} < $${params.length}::timestamptz`);
  }
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
            notes,
            created_at
       FROM vendors
      WHERE ${where.join(" AND ")}
      ORDER BY company_name`,
    params
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

async function listPurchaseOrders(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const allowed = new Set(["created_at", "updated_at", "expected_possession_date"]);
  const field = allowed.has(dateField) ? dateField : "created_at";
  const isDateField = field === "expected_possession_date";
  const params = [companyId];
  const where = ["po.company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`po.${field} >= $${params.length}::${isDateField ? "date" : "timestamptz"}`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`po.${field} < $${params.length}::${isDateField ? "date" : "timestamptz"}`);
  }
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
      WHERE ${where.join(" AND ")}
      ORDER BY po.created_at DESC, po.id DESC`,
    params
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

async function listSalesOrders(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const allowed = new Set(["created_at", "updated_at", "closed_at"]);
  const field = allowed.has(dateField) ? dateField : "created_at";
  const params = [companyId];
  const where = ["so.company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`so.${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`so.${field} < $${params.length}::timestamptz`);
  }
  const result = await pool.query(
    `SELECT so.id,
            so.company_id,
            so.so_number,
            so.equipment_id,
            so.customer_id,
            so.customer_po,
            so.salesperson_id,
            so.status,
            so.sale_price,
            so.description,
            so.image_url,
            so.image_urls,
            so.documents,
            so.closed_at,
            so.created_at,
            so.updated_at,
            e.model_name,
            e.serial_number,
            e.type AS equipment_type,
            et.name AS type_name,
            l.name AS location_name
       FROM sales_orders so
  LEFT JOIN equipment e ON e.id = so.equipment_id
  LEFT JOIN equipment_types et ON et.id = e.type_id
  LEFT JOIN locations l ON l.id = COALESCE(e.current_location_id, e.location_id)
      WHERE ${where.join(" AND ")}
      ORDER BY so.created_at DESC, so.id DESC`,
    params
  );
  return (result.rows || []).map((row) => {
    if (row) row.documents = normalizeTypeDocuments(row.documents);
    return row;
  });
}

async function getSalesOrder({ companyId, id }) {
  const result = await pool.query(
    `SELECT so.id,
            so.company_id,
            so.so_number,
            so.equipment_id,
            so.customer_id,
            so.customer_po,
            so.salesperson_id,
            so.status,
            so.sale_price,
            so.description,
            so.image_url,
            so.image_urls,
            so.documents,
            so.closed_at,
            so.created_at,
            so.updated_at,
            e.model_name,
            e.serial_number,
            e.type AS equipment_type,
            et.name AS type_name,
            l.name AS location_name
       FROM sales_orders so
  LEFT JOIN equipment e ON e.id = so.equipment_id
  LEFT JOIN equipment_types et ON et.id = e.type_id
  LEFT JOIN locations l ON l.id = COALESCE(e.current_location_id, e.location_id)
      WHERE so.company_id = $1 AND so.id = $2`,
    [companyId, id]
  );
  const row = result.rows[0];
  if (row) row.documents = normalizeTypeDocuments(row.documents);
  return row;
}

async function createSalesOrder({
  companyId,
  soNumber,
  equipmentId,
  customerId,
  customerPo,
  salespersonId,
  status,
  salePrice,
  description,
  imageUrl,
  imageUrls,
  documents,
  closedAt,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const docs = normalizeTypeDocuments(documents);
  const effectiveDate = new Date();
  const soNumberValue =
    soNumber || (await nextDocumentNumber(pool, companyId, "SO", effectiveDate, { yearDigits: 4, seqDigits: 5 }));
  const result = await pool.query(
    `INSERT INTO sales_orders
      (company_id, so_number, equipment_id, customer_id, customer_po, salesperson_id, status, sale_price, description, image_url, image_urls, documents, closed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
     RETURNING id, company_id, so_number, equipment_id, customer_id, customer_po, salesperson_id, status, sale_price, description, image_url, image_urls, documents,
               closed_at, created_at, updated_at`,
    [
      companyId,
      soNumberValue,
      equipmentId || null,
      customerId || null,
      customerPo || null,
      salespersonId || null,
      status || "open",
      salePrice ?? null,
      description || null,
      primaryUrl,
      JSON.stringify(urls),
      JSON.stringify(docs),
      closedAt || null,
    ]
  );
  const row = result.rows[0];
  if (row) row.documents = normalizeTypeDocuments(row.documents);
  return row;
}

async function updateSalesOrder({
  id,
  companyId,
  equipmentId,
  customerId,
  customerPo,
  salespersonId,
  status,
  salePrice,
  description,
  imageUrl,
  imageUrls,
  documents,
  closedAt,
}) {
  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).map(String) : [];
  const primaryUrl = urls[0] || imageUrl || null;
  const docs = normalizeTypeDocuments(documents);
  const result = await pool.query(
    `UPDATE sales_orders
        SET equipment_id = $1,
            customer_id = $2,
            customer_po = $3,
            salesperson_id = $4,
            status = $5,
            sale_price = $6,
            description = $7,
            image_url = $8,
            image_urls = $9,
            documents = $10,
            closed_at = $11,
            updated_at = NOW()
      WHERE id = $12 AND company_id = $13
      RETURNING id, company_id, so_number, equipment_id, customer_id, customer_po, salesperson_id, status, sale_price, description, image_url, image_urls, documents,
                closed_at, created_at, updated_at`,
    [
      equipmentId || null,
      customerId || null,
      customerPo || null,
      salespersonId || null,
      status || "open",
      salePrice ?? null,
      description || null,
      primaryUrl,
      JSON.stringify(urls),
      JSON.stringify(docs),
      closedAt || null,
      id,
      companyId,
    ]
  );
  const row = result.rows[0];
  if (row) row.documents = normalizeTypeDocuments(row.documents);
  return row;
}

async function deleteSalesOrder({ id, companyId }) {
  await pool.query(`DELETE FROM sales_orders WHERE id = $1 AND company_id = $2`, [id, companyId]);
}

function formatWorkOrderRow(row) {
  if (!row) return null;
  const unitIdsRaw = coerceJsonArray(row.unit_ids);
  const unitLabelsRaw = coerceJsonArray(row.unit_labels);
  const unitIds = normalizeWorkOrderUnitIds(
    unitIdsRaw.map((id) => (id === null || id === undefined ? "" : String(id)))
  );
  const unitLabels = normalizeWorkOrderUnitLabels(
    unitLabelsRaw.map((label) => (label === null || label === undefined ? "" : String(label)))
  );
  const parts = normalizeWorkOrderLines(coerceJsonArray(row.parts));
  const labor = normalizeWorkOrderLines(coerceJsonArray(row.labor));
  const workDate = row.work_date instanceof Date
    ? row.work_date.toISOString().slice(0, 10)
    : row.work_date
      ? String(row.work_date).slice(0, 10)
      : null;
  const primaryUnitId = row.unit_id !== undefined && row.unit_id !== null
    ? Number(row.unit_id)
    : unitIds[0]
      ? Number(unitIds[0])
      : null;
  const primaryUnitLabel = row.unit_label || unitLabels[0] || "";

  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    number: row.work_order_number || "",
    date: workDate,
    unitIds,
    unitLabels,
    unitId: Number.isFinite(primaryUnitId) ? primaryUnitId : null,
    unitLabel: primaryUnitLabel,
    workSummary: row.work_summary || "",
    issues: row.issues || "",
    orderStatus: row.order_status || "open",
    serviceStatus: row.service_status || "in_service",
    returnInspection: row.return_inspection === true,
    parts,
    labor,
    source: row.source || null,
    sourceOrderId: row.source_order_id || null,
    sourceOrderNumber: row.source_order_number || null,
    sourceLineItemId: row.source_line_item_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    completedAt: row.completed_at || null,
    closedAt: row.closed_at || null,
  };
}

async function listWorkOrders({
  companyId,
  unitId,
  orderStatus,
  serviceStatus,
  returnInspection,
  search,
  limit = 250,
  offset = 0,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const filters = ["company_id = $1"];
  const params = [cid];
  let idx = 2;

  if (unitId !== undefined && unitId !== null && String(unitId || "").trim()) {
    const unitIdStr = String(unitId || "").trim();
    const unitIdNum = Number(unitIdStr);
    if (Number.isFinite(unitIdNum)) {
      filters.push(`(unit_ids ? $${idx} OR unit_id = $${idx + 1})`);
      params.push(unitIdStr, unitIdNum);
      idx += 2;
    } else {
      filters.push(`unit_ids ? $${idx}`);
      params.push(unitIdStr);
      idx += 1;
    }
  }
  if (orderStatus) {
    filters.push(`order_status = $${idx}`);
    params.push(normalizeWorkOrderStatus(orderStatus));
    idx += 1;
  }
  if (serviceStatus) {
    filters.push(`service_status = $${idx}`);
    params.push(normalizeWorkOrderServiceStatus(serviceStatus));
    idx += 1;
  }
  if (returnInspection === true || returnInspection === false) {
    filters.push(`return_inspection = $${idx}`);
    params.push(returnInspection === true);
    idx += 1;
  }
  if (search) {
    filters.push(`(work_order_number ILIKE $${idx} OR work_summary ILIKE $${idx} OR issues ILIKE $${idx})`);
    params.push(`%${String(search).trim()}%`);
    idx += 1;
  }

  const lim = Math.min(Math.max(Number(limit) || 250, 1), 1000);
  const off = Math.max(Number(offset) || 0, 0);
  params.push(lim, off);

  const res = await pool.query(
    `
    SELECT id, company_id, work_order_number, work_date, unit_ids, unit_labels, unit_id, unit_label,
           work_summary, issues, order_status, service_status, return_inspection, parts, labor,
           source, source_order_id, source_order_number, source_line_item_id,
           created_at, updated_at, completed_at, closed_at
      FROM work_orders
     WHERE ${filters.join(" AND ")}
     ORDER BY updated_at DESC, id DESC
     LIMIT $${idx} OFFSET $${idx + 1}
    `,
    params
  );
  return (res.rows || []).map(formatWorkOrderRow);
}

async function getWorkOrder({ companyId, id }) {
  const cid = Number(companyId);
  const wid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(wid) || wid <= 0) throw new Error("id is required.");
  const res = await pool.query(
    `
    SELECT id, company_id, work_order_number, work_date, unit_ids, unit_labels, unit_id, unit_label,
           work_summary, issues, order_status, service_status, return_inspection, parts, labor,
           source, source_order_id, source_order_number, source_line_item_id,
           created_at, updated_at, completed_at, closed_at
      FROM work_orders
     WHERE company_id = $1 AND id = $2
     LIMIT 1
    `,
    [cid, wid]
  );
  return formatWorkOrderRow(res.rows?.[0]);
}

async function createWorkOrder(payload = {}) {
  const cid = Number(payload.companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");

  const date = normalizeDateOnly(payload.date);
  if (!date) throw new Error("date is required.");

  let unitIds = normalizeWorkOrderUnitIds(payload.unitIds);
  if (!unitIds.length && payload.unitId) unitIds = normalizeWorkOrderUnitIds([payload.unitId]);
  if (!unitIds.length) throw new Error("unitIds are required.");

  let unitLabels = normalizeWorkOrderUnitLabels(payload.unitLabels);
  if (!unitLabels.length && payload.unitLabel) unitLabels = normalizeWorkOrderUnitLabels([payload.unitLabel]);

  const unitId = toNullableInt(unitIds[0] || payload.unitId);
  const unitLabel = unitLabels[0] || (payload.unitLabel ? String(payload.unitLabel).trim() : null);

  const orderStatus = normalizeWorkOrderStatus(payload.orderStatus);
  const serviceStatus = normalizeWorkOrderServiceStatus(payload.serviceStatus);
  const returnInspection = payload.returnInspection === true;
  const workSummary = payload.workSummary ? String(payload.workSummary).trim() : null;
  const issues = payload.issues ? String(payload.issues).trim() : null;
  const parts = normalizeWorkOrderLines(payload.parts);
  const labor = normalizeWorkOrderLines(payload.labor);
  const source = payload.source ? String(payload.source).trim() : null;
  const sourceOrderId = payload.sourceOrderId ? String(payload.sourceOrderId).trim() : null;
  const sourceOrderNumber = payload.sourceOrderNumber ? String(payload.sourceOrderNumber).trim() : null;
  const sourceLineItemId = payload.sourceLineItemId ? String(payload.sourceLineItemId).trim() : null;

  const nowIso = new Date().toISOString();
  let completedAt = normalizeTimestamptz(payload.completedAt);
  let closedAt = normalizeTimestamptz(payload.closedAt);
  if (orderStatus === "completed" && !completedAt) completedAt = nowIso;
  if (orderStatus === "closed" && !closedAt) closedAt = nowIso;
  if (orderStatus === "open") {
    completedAt = null;
    closedAt = null;
  }

  const effectiveDate = new Date(date);
  const providedNumber = payload.number || payload.workOrderNumber;
  const workOrderNumber = providedNumber
    ? String(providedNumber).trim()
    : await nextDocumentNumber(pool, cid, "WO", effectiveDate, { yearDigits: 4, seqDigits: 5 });

  const res = await pool.query(
    `
    INSERT INTO work_orders
      (company_id, work_order_number, work_date, unit_ids, unit_labels, unit_id, unit_label,
       work_summary, issues, order_status, service_status, return_inspection, parts, labor,
       source, source_order_id, source_order_number, source_line_item_id, completed_at, closed_at, updated_at)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
    RETURNING id, company_id, work_order_number, work_date, unit_ids, unit_labels, unit_id, unit_label,
              work_summary, issues, order_status, service_status, return_inspection, parts, labor,
              source, source_order_id, source_order_number, source_line_item_id,
              created_at, updated_at, completed_at, closed_at
    `,
    [
      cid,
      workOrderNumber,
      date,
      JSON.stringify(unitIds),
      JSON.stringify(unitLabels),
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      JSON.stringify(parts),
      JSON.stringify(labor),
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
    ]
  );
  return formatWorkOrderRow(res.rows?.[0]);
}

async function updateWorkOrder(payload = {}) {
  const cid = Number(payload.companyId);
  const wid = Number(payload.id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(wid) || wid <= 0) throw new Error("id is required.");

  const existing = await getWorkOrder({ companyId: cid, id: wid });
  if (!existing) return null;

  const merged = { ...existing, ...payload };
  const date = normalizeDateOnly(merged.date);
  if (!date) throw new Error("date is required.");

  let unitIds = normalizeWorkOrderUnitIds(merged.unitIds);
  if (!unitIds.length && merged.unitId) unitIds = normalizeWorkOrderUnitIds([merged.unitId]);
  if (!unitIds.length) throw new Error("unitIds are required.");

  let unitLabels = normalizeWorkOrderUnitLabels(merged.unitLabels);
  if (!unitLabels.length && merged.unitLabel) unitLabels = normalizeWorkOrderUnitLabels([merged.unitLabel]);

  const unitId = toNullableInt(unitIds[0] || merged.unitId);
  const unitLabel = unitLabels[0] || (merged.unitLabel ? String(merged.unitLabel).trim() : null);

  const orderStatus = normalizeWorkOrderStatus(merged.orderStatus);
  const serviceStatus = normalizeWorkOrderServiceStatus(merged.serviceStatus);
  const returnInspection = merged.returnInspection === true;
  const workSummary = merged.workSummary ? String(merged.workSummary).trim() : null;
  const issues = merged.issues ? String(merged.issues).trim() : null;
  const parts = normalizeWorkOrderLines(merged.parts);
  const labor = normalizeWorkOrderLines(merged.labor);
  const source = merged.source ? String(merged.source).trim() : null;
  const sourceOrderId = merged.sourceOrderId ? String(merged.sourceOrderId).trim() : null;
  const sourceOrderNumber = merged.sourceOrderNumber ? String(merged.sourceOrderNumber).trim() : null;
  const sourceLineItemId = merged.sourceLineItemId ? String(merged.sourceLineItemId).trim() : null;

  const nowIso = new Date().toISOString();
  let completedAt = normalizeTimestamptz(merged.completedAt);
  let closedAt = normalizeTimestamptz(merged.closedAt);
  if (orderStatus === "completed" && !completedAt) completedAt = nowIso;
  if (orderStatus === "closed" && !closedAt) closedAt = nowIso;
  if (orderStatus === "open") {
    completedAt = null;
    closedAt = null;
  }

  const workOrderNumber = merged.number ? String(merged.number).trim() : existing.number;

  const res = await pool.query(
    `
    UPDATE work_orders
       SET work_order_number = $1,
           work_date = $2,
           unit_ids = $3,
           unit_labels = $4,
           unit_id = $5,
           unit_label = $6,
           work_summary = $7,
           issues = $8,
           order_status = $9,
           service_status = $10,
           return_inspection = $11,
           parts = $12,
           labor = $13,
           source = $14,
           source_order_id = $15,
           source_order_number = $16,
           source_line_item_id = $17,
           completed_at = $18,
           closed_at = $19,
           updated_at = NOW()
     WHERE id = $20 AND company_id = $21
     RETURNING id, company_id, work_order_number, work_date, unit_ids, unit_labels, unit_id, unit_label,
               work_summary, issues, order_status, service_status, return_inspection, parts, labor,
               source, source_order_id, source_order_number, source_line_item_id,
               created_at, updated_at, completed_at, closed_at
    `,
    [
      workOrderNumber,
      date,
      JSON.stringify(unitIds),
      JSON.stringify(unitLabels),
      unitId,
      unitLabel,
      workSummary,
      issues,
      orderStatus,
      serviceStatus,
      returnInspection,
      JSON.stringify(parts),
      JSON.stringify(labor),
      source,
      sourceOrderId,
      sourceOrderNumber,
      sourceLineItemId,
      completedAt,
      closedAt,
      wid,
      cid,
    ]
  );
  return formatWorkOrderRow(res.rows?.[0]);
}

async function deleteWorkOrder({ companyId, id }) {
  const cid = Number(companyId);
  const wid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(wid) || wid <= 0) throw new Error("id is required.");
  await pool.query(`DELETE FROM work_orders WHERE company_id = $1 AND id = $2`, [cid, wid]);
}

async function listCustomers(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["c.company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`c.${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`c.${field} < $${params.length}::timestamptz`);
  }
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
            c.qbo_customer_id,
              c.contacts,
              c.accounting_contacts,
              c.contact_groups,
              c.can_charge_deposit,
            c.sales_person_id,
            c.follow_up_date,
            c.notes,
            c.is_pending,
            c.parent_customer_id,
            c.created_at,
            p.company_name AS parent_company_name,
            CASE
              WHEN c.parent_customer_id IS NOT NULL THEN p.can_charge_deposit
              ELSE c.can_charge_deposit
            END AS effective_can_charge_deposit
     FROM customers c
     LEFT JOIN customers p ON p.id = c.parent_customer_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.company_name`,
    params
  );
  return result.rows;
}

async function getCustomerById({ companyId, id }) {
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
            c.qbo_customer_id,
              c.contacts,
              c.accounting_contacts,
              c.contact_groups,
              c.can_charge_deposit,
            c.sales_person_id,
            c.follow_up_date,
            c.notes,
            c.is_pending,
            c.parent_customer_id,
            p.company_name AS parent_company_name,
            CASE
              WHEN c.parent_customer_id IS NOT NULL THEN p.can_charge_deposit
              ELSE c.can_charge_deposit
            END AS effective_can_charge_deposit
     FROM customers c
     LEFT JOIN customers p ON p.id = c.parent_customer_id
     WHERE c.company_id = $1 AND c.id = $2
     LIMIT 1`,
    [companyId, id]
  );
  return result.rows[0] || null;
}

async function findCustomerIdByQboCustomerId({ companyId, qboCustomerId }) {
  const qboId = String(qboCustomerId || "").trim();
  if (!qboId) return null;
  const result = await pool.query(
    `SELECT id FROM customers WHERE company_id = $1 AND qbo_customer_id = $2 LIMIT 1`,
    [companyId, qboId]
  );
  return result.rows[0] ? Number(result.rows[0].id) : null;
}

async function updateCustomerQboLink({
  companyId,
  id,
  qboCustomerId,
  companyName = null,
  contactName = null,
} = {}) {
  const qboId = qboCustomerId ? String(qboCustomerId).trim() : null;
  const result = await pool.query(
    `UPDATE customers
        SET qbo_customer_id = $1,
            company_name = COALESCE($2, company_name),
            contact_name = COALESCE($3, contact_name)
      WHERE id = $4 AND company_id = $5
      RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, qbo_customer_id, contacts, accounting_contacts, can_charge_deposit, sales_person_id, follow_up_date, notes, parent_customer_id, is_pending`,
    [qboId, companyName, contactName, id, companyId]
  );
  return result.rows[0] || null;
}

function normalizeContactField(value) {
  const clean = String(value ?? "").trim();
  return clean || null;
}

function normalizeContactEntries(value) {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) raw = parsed;
    } catch {
      raw = [];
    }
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const name = normalizeContactField(entry.name || entry.contactName || entry.contact_name);
      const title = normalizeContactField(entry.title || entry.contactTitle || entry.contact_title);
      const emailValue = normalizeContactField(entry.email);
      const phoneValue = normalizeContactField(entry.phone);
      if (!name && !emailValue && !phoneValue) return null;
      return { name, title, email: emailValue, phone: phoneValue };
    })
    .filter(Boolean);
}

function normalizeCustomerContacts({ contacts, contactName, email, phone }) {
  const normalized = normalizeContactEntries(contacts);

  if (!normalized.length) {
    const name = normalizeContactField(contactName);
    const title = null;
    const emailValue = normalizeContactField(email);
    const phoneValue = normalizeContactField(phone);
    if (name || emailValue || phoneValue) {
      normalized.push({ name, title, email: emailValue, phone: phoneValue });
    }
  }

  return normalized;
}

function normalizeAccountingContacts({ accountingContacts }) {
  return normalizeContactEntries(accountingContacts);
}

function normalizeContactGroups(contactGroups) {
  let raw = contactGroups;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    const cleanKey = normalizeContactCategoryKey(key);
    if (!cleanKey || cleanKey === "contacts" || cleanKey === "accountingContacts") return;
    const list = normalizeContactEntries(value);
    if (list.length) normalized[cleanKey] = list;
  });
  return normalized;
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
      const title = normalizeContactField(entry.title || entry.contactTitle || entry.contact_title);
      const emailValue = normalizeContactField(entry.email);
      const phoneValue = normalizeContactField(entry.phone);
      if (!name && !emailValue && !phoneValue) return null;
      return { name, title, email: emailValue, phone: phoneValue };
    })
    .filter(Boolean);
}

function normalizeCoverageHours(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && Array.isArray(raw.slots)) {
    raw = raw.slots;
  }

  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const dayMap = {
    mon: "mon",
    monday: "mon",
    tue: "tue",
    tues: "tue",
    tuesday: "tue",
    wed: "wed",
    weds: "wed",
    wednesday: "wed",
    thu: "thu",
    thur: "thu",
    thurs: "thu",
    thursday: "thu",
    fri: "fri",
    friday: "fri",
    sat: "sat",
    saturday: "sat",
    sun: "sun",
    sunday: "sun",
  };
  const normalizeDay = (val) => dayMap[String(val || "").trim().toLowerCase()] || "";
  const normalizeTime = (val) => {
    const match = String(val || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return "";
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return "";
    }
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };
  const timeToMinutes = (val) => {
    const match = String(val || "").trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  };
  const dayIndex = (day) => days.indexOf(day);
  const addDayOffset = (day, offset) => {
    const idx = dayIndex(day);
    if (idx === -1) return day;
    return days[(idx + offset + days.length) % days.length];
  };

  const slots = [];
  if (Array.isArray(raw)) {
    raw.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const startDay = normalizeDay(entry.startDay ?? entry.start_day ?? entry.day ?? entry.startDayKey);
      const endDayRaw = normalizeDay(entry.endDay ?? entry.end_day ?? entry.endDayKey ?? entry.day_end);
      const startTime = normalizeTime(entry.startTime ?? entry.start_time ?? entry.start);
      const endTime = normalizeTime(entry.endTime ?? entry.end_time ?? entry.end);
      if (!startDay || !startTime || !endTime) return;
      let endDay = endDayRaw || startDay;
      const explicitOffset = entry.endDayOffset ?? entry.end_day_offset;
      if (!endDayRaw) {
        if (explicitOffset === 1 || explicitOffset === "1" || explicitOffset === true || entry.spansMidnight === true) {
          endDay = addDayOffset(startDay, 1);
        } else {
          const startMinutes = timeToMinutes(startTime);
          const endMinutes = timeToMinutes(endTime);
          if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
            endDay = addDayOffset(startDay, 1);
          }
        }
      }
      slots.push({ startDay, startTime, endDay, endTime });
    });
  } else if (raw && typeof raw === "object") {
    days.forEach((day) => {
      const entry = raw[day] || {};
      const startTime = normalizeTime(entry.start);
      const endTime = normalizeTime(entry.end);
      if (!startTime && !endTime) return;
      if (!startTime || !endTime) return;
      let endDay = day;
      const explicitOffset = entry.endDayOffset ?? entry.end_day_offset;
      if (explicitOffset === 1 || explicitOffset === "1" || explicitOffset === true || entry.spansMidnight === true) {
        endDay = addDayOffset(day, 1);
      } else {
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        if (startMinutes !== null && endMinutes !== null && endMinutes < startMinutes) {
          endDay = addDayOffset(day, 1);
        }
      }
      slots.push({ startDay: day, startTime, endDay, endTime });
    });
  }

  return slots.sort((a, b) => {
    const dayDiff = dayIndex(a.startDay) - dayIndex(b.startDay);
    if (dayDiff) return dayDiff;
    const aStart = timeToMinutes(a.startTime) ?? 0;
    const bStart = timeToMinutes(b.startTime) ?? 0;
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = timeToMinutes(a.endTime) ?? 0;
    const bEnd = timeToMinutes(b.endTime) ?? 0;
    return aEnd - bEnd;
  });
}

function normalizeNotificationCircumstances(value) {
  let raw = [];
  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      raw = [];
    } else {
      try {
        const parsed = JSON.parse(trimmed);
        raw = Array.isArray(parsed) ? parsed : [trimmed];
      } catch {
        raw = [trimmed];
      }
    }
  }

  const normalized = [];
  const seen = new Set();
  raw.forEach((entry) => {
    if (entry === null || entry === undefined) return;
    const text = String(entry).trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
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
  qboCustomerId,
  canChargeDeposit,
  salesPersonId,
  followUpDate,
  notes,
  contacts,
  accountingContacts,
  contactGroups,
  isPending = false,
}) {
  const parent = await resolveParentCustomer({ companyId, parentCustomerId });
  const isBranch = !!parent;
  const contactList = normalizeCustomerContacts({ contacts, contactName, email, phone });
  const accountingContactList = normalizeAccountingContacts({ accountingContacts });
  const contactGroupMap = normalizeContactGroups(contactGroups);
  const primary = contactList[0] || {};
  const primaryName = normalizeContactField(primary.name) || normalizeContactField(contactName);
  const primaryEmail = normalizeContactField(primary.email) || normalizeContactField(email);
  const primaryPhone = normalizeContactField(primary.phone) || normalizeContactField(phone);
  const finalCompanyName = parent?.company_name || companyName;
  const result = await pool.query(
    `INSERT INTO customers (company_id, parent_customer_id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, qbo_customer_id, contacts, accounting_contacts, contact_groups, can_charge_deposit, sales_person_id, follow_up_date, notes, is_pending)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
     RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, qbo_customer_id, contacts, accounting_contacts, contact_groups, can_charge_deposit, sales_person_id, follow_up_date, notes, parent_customer_id, is_pending`,
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
      qboCustomerId ? String(qboCustomerId).trim() : null,
      JSON.stringify(contactList),
      JSON.stringify(accountingContactList),
      JSON.stringify(contactGroupMap),
      isBranch ? false : !!canChargeDeposit,
      salesPersonId || null,
      followUpDate || null,
      notes || null,
      isPending === true,
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
  qboCustomerId,
  canChargeDeposit,
  salesPersonId,
  followUpDate,
  notes,
  contacts,
  accountingContacts,
  contactGroups,
}) {
  const normalizedParentId = normalizeCustomerId(parentCustomerId);
  if (normalizedParentId && Number(id) === normalizedParentId) {
    throw new Error("Customer cannot be its own parent.");
  }
  const parent = await resolveParentCustomer({ companyId, parentCustomerId: normalizedParentId });
  const isBranch = !!parent;
  const contactList = normalizeCustomerContacts({ contacts, contactName, email, phone });
  const accountingContactList = normalizeAccountingContacts({ accountingContacts });
  const contactGroupMap = normalizeContactGroups(contactGroups);
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
         qbo_customer_id = $11,
         contacts = $12,
         accounting_contacts = $13,
         contact_groups = $14,
         can_charge_deposit = $15,
         sales_person_id = $16,
         follow_up_date = $17,
         notes = $18
     WHERE id = $19 AND company_id = $20
     RETURNING id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, qbo_customer_id, contacts, accounting_contacts, contact_groups, can_charge_deposit, sales_person_id, follow_up_date, notes, parent_customer_id, is_pending`,
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
      qboCustomerId ? String(qboCustomerId).trim() : null,
      JSON.stringify(contactList),
      JSON.stringify(accountingContactList),
      JSON.stringify(contactGroupMap),
      isBranch ? false : !!canChargeDeposit,
      salesPersonId || null,
      followUpDate || null,
      notes || null,
      id,
      companyId,
    ]
  );
  return result.rows[0];
}

async function setCustomerPendingStatus({ companyId, customerId, isPending }) {
  const cid = Number(companyId);
  const id = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(id) || id <= 0) throw new Error("customerId is required.");
  const result = await pool.query(
    `UPDATE customers
        SET is_pending = $1
      WHERE id = $2 AND company_id = $3
      RETURNING id, is_pending`,
    [isPending === true, id, cid]
  );
  return result.rows[0] || null;
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

async function listSalesPeople(companyId, { from = null, to = null, dateField = "created_at" } = {}) {
  const fromIso = from ? normalizeTimestamptz(from) : null;
  const toIso = to ? normalizeTimestamptz(to) : null;
  const field = dateField === "created_at" ? "created_at" : "created_at";
  const params = [companyId];
  const where = ["company_id = $1"];
  if (fromIso) {
    params.push(fromIso);
    where.push(`${field} >= $${params.length}::timestamptz`);
  }
  if (toIso) {
    params.push(toIso);
    where.push(`${field} < $${params.length}::timestamptz`);
  }
  const result = await pool.query(
    `SELECT id, name, email, phone, image_url, created_at
       FROM sales_people
      WHERE ${where.join(" AND ")}
      ORDER BY name`,
    params
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

function normalizeDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value || "").trim();
  if (!raw) return null;
  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return isoMatch ? isoMatch[1] : null;
}

function normalizeWorkOrderStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "completed" || v === "closed") return v;
  return "open";
}

function normalizeWorkOrderServiceStatus(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "out_of_service") return "out_of_service";
  return "in_service";
}

function normalizeWorkOrderUnitIds(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  value.forEach((id) => {
    const str = String(id || "").trim();
    if (!str || seen.has(str)) return;
    seen.add(str);
    out.push(str);
  });
  return out;
}

function normalizeWorkOrderUnitLabels(value) {
  if (!Array.isArray(value)) return [];
  return value.map((label) => String(label || "").trim()).filter((label) => label);
}

function normalizeWorkOrderLines(value) {
  return Array.isArray(value) ? value : [];
}

function toNullableInt(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function coerceJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function normalizeQboAdjustmentPolicy(value) {
  const v = String(value || "").trim().toLowerCase();
  if (
    v === "none" ||
    v === "no_action" ||
    v === "no-action" ||
    v === "no_adjustment" ||
    v === "no-adjustment"
  ) {
    return "none";
  }
  if (v === "next_invoice" || v === "next-invoice") return "next_invoice";
  return "credit_memo";
}

function normalizeQboBillingDay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(28, Math.max(1, Math.floor(num)));
}

function normalizeQboIncomeAccountIds(value) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = raw.split(",").map((v) => v.trim());
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v || "").trim()).filter(Boolean);
}

function normalizeQboTaxCodeId(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value || "").trim();
  return raw || null;
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
    const monthlyMode = "none";
    const monthlyGranularity = "unit";
    raw = computeMonthlyUnits({
      startAt: start,
      endAt: end,
      pausePeriods,
      prorationMethod: monthlyProrationMethod,
      roundingMode: monthlyMode,
      roundingGranularity: monthlyGranularity,
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
  if (basis === "monthly") return raw;
  if (mode === "none") return raw;
  if (granularity !== "unit") return raw;
  return applyRoundingValue(raw, mode);
}

async function getCompanySettings(companyId) {
  const res = await pool.query(
    `SELECT company_id,
            billing_rounding_mode,
            billing_rounding_granularity,
            monthly_proration_method,
            billing_timezone,
            logo_url,
            qbo_enabled,
            qbo_billing_day,
            qbo_adjustment_policy,
            qbo_income_account_ids,
            qbo_default_tax_code,
            tax_enabled,
            default_tax_rate,
            tax_registration_number,
            tax_inclusive_pricing,
              auto_apply_customer_credit,
              auto_work_order_on_return,
                  required_storefront_customer_fields,
            rental_info_fields,
            customer_contact_categories,
            customer_document_categories,
            customer_terms_template,
            customer_esign_required,
            customer_service_agreement_url,
            customer_service_agreement_file_name,
            customer_service_agreement_mime,
            customer_service_agreement_size_bytes
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
      logo_url: res.rows[0].logo_url || null,
      qbo_enabled: res.rows[0].qbo_enabled === true,
      qbo_billing_day: normalizeQboBillingDay(res.rows[0].qbo_billing_day),
      qbo_adjustment_policy: normalizeQboAdjustmentPolicy(res.rows[0].qbo_adjustment_policy),
      qbo_income_account_ids: normalizeQboIncomeAccountIds(res.rows[0].qbo_income_account_ids),
      qbo_default_tax_code: normalizeQboTaxCodeId(res.rows[0].qbo_default_tax_code),
      tax_enabled: res.rows[0].tax_enabled === true,
      default_tax_rate: Number(res.rows[0].default_tax_rate || 0),
      tax_registration_number: res.rows[0].tax_registration_number || null,
      tax_inclusive_pricing: res.rows[0].tax_inclusive_pricing === true,
        auto_apply_customer_credit: res.rows[0].auto_apply_customer_credit === true,
        auto_work_order_on_return: res.rows[0].auto_work_order_on_return === true,
          required_storefront_customer_fields: normalizeStorefrontCustomerRequirements(res.rows[0].required_storefront_customer_fields),
          rental_info_fields: normalizeRentalInfoFields(res.rows[0].rental_info_fields),
          customer_contact_categories: normalizeCustomerContactCategories(res.rows[0].customer_contact_categories),
          customer_document_categories: normalizeCustomerDocumentCategories(res.rows[0].customer_document_categories),
          customer_terms_template: res.rows[0].customer_terms_template || null,
          customer_esign_required: res.rows[0].customer_esign_required === true,
          customer_service_agreement_url: res.rows[0].customer_service_agreement_url || null,
          customer_service_agreement_file_name: res.rows[0].customer_service_agreement_file_name || null,
          customer_service_agreement_mime: res.rows[0].customer_service_agreement_mime || null,
          customer_service_agreement_size_bytes: Number.isFinite(Number(res.rows[0].customer_service_agreement_size_bytes))
            ? Number(res.rows[0].customer_service_agreement_size_bytes)
            : null,
      };
  }
  return {
    company_id: Number(companyId),
    billing_rounding_mode: "ceil",
    billing_rounding_granularity: "unit",
    monthly_proration_method: "hours",
    billing_timezone: "UTC",
    logo_url: null,
    qbo_enabled: false,
    qbo_billing_day: 1,
    qbo_adjustment_policy: "credit_memo",
    qbo_income_account_ids: [],
    qbo_default_tax_code: null,
    tax_enabled: false,
    default_tax_rate: 0,
    tax_registration_number: null,
    tax_inclusive_pricing: false,
      auto_apply_customer_credit: true,
      auto_work_order_on_return: false,
        required_storefront_customer_fields: [],
        rental_info_fields: normalizeRentalInfoFields(null),
        customer_contact_categories: normalizeCustomerContactCategories(null),
        customer_document_categories: [],
        customer_terms_template: null,
        customer_esign_required: true,
        customer_service_agreement_url: null,
        customer_service_agreement_file_name: null,
        customer_service_agreement_mime: null,
        customer_service_agreement_size_bytes: null,
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
             updated_at = NOW()
       WHERE company_id = $13
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

  async function upsertCompanySettings({
    companyId,
  billingRoundingMode = null,
  billingRoundingGranularity = null,
  monthlyProrationMethod = null,
  billingTimeZone = null,
  taxEnabled = null,
  defaultTaxRate = null,
  taxRegistrationNumber = null,
  taxInclusivePricing = null,
  autoApplyCustomerCredit = null,
  autoWorkOrderOnReturn = null,
  logoUrl = undefined,
    requiredStorefrontCustomerFields = undefined,
    rentalInfoFields = undefined,
    customerContactCategories = undefined,
    customerDocumentCategories = undefined,
    customerTermsTemplate = undefined,
    customerEsignRequired = undefined,
    customerServiceAgreementUrl = undefined,
    customerServiceAgreementFileName = undefined,
    customerServiceAgreementMime = undefined,
    customerServiceAgreementSizeBytes = undefined,
  qboEnabled = null,
  qboBillingDay = null,
  qboAdjustmentPolicy = null,
  qboIncomeAccountIds = undefined,
  qboDefaultTaxCode = undefined,
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
    const nextCustomerDocumentCategories = normalizeCustomerDocumentCategories(
      customerDocumentCategories === undefined ? current.customer_document_categories : customerDocumentCategories
    );
    const nextCustomerContactCategories = normalizeCustomerContactCategories(
      customerContactCategories === undefined ? current.customer_contact_categories : customerContactCategories
    );
    const nextCustomerTermsTemplate =
      customerTermsTemplate === undefined
        ? current.customer_terms_template || null
        : (customerTermsTemplate ? String(customerTermsTemplate).trim() : null);
  const nextCustomerEsignRequired =
    customerEsignRequired === undefined
      ? current.customer_esign_required === true
      : customerEsignRequired === true;
  let nextServiceAgreementUrl =
    customerServiceAgreementUrl === undefined
      ? current.customer_service_agreement_url || null
      : (customerServiceAgreementUrl ? String(customerServiceAgreementUrl).trim() : null);
  let nextServiceAgreementFileName =
    customerServiceAgreementFileName === undefined
      ? current.customer_service_agreement_file_name || null
      : (customerServiceAgreementFileName ? String(customerServiceAgreementFileName).trim() : null);
  let nextServiceAgreementMime =
    customerServiceAgreementMime === undefined
      ? current.customer_service_agreement_mime || null
      : (customerServiceAgreementMime ? String(customerServiceAgreementMime).trim() : null);
  let nextServiceAgreementSizeBytes =
    customerServiceAgreementSizeBytes === undefined
      ? (Number.isFinite(Number(current.customer_service_agreement_size_bytes))
          ? Number(current.customer_service_agreement_size_bytes)
          : null)
      : (() => {
          const parsed = Number(customerServiceAgreementSizeBytes);
          return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
        })();
  if (!nextServiceAgreementUrl) {
    nextServiceAgreementUrl = null;
    nextServiceAgreementFileName = null;
    nextServiceAgreementMime = null;
    nextServiceAgreementSizeBytes = null;
  }
  const nextQboEnabled =
    qboEnabled === null || qboEnabled === undefined ? current.qbo_enabled === true : qboEnabled === true;
  const nextQboBillingDay =
    qboBillingDay === null || qboBillingDay === undefined
      ? normalizeQboBillingDay(current.qbo_billing_day)
      : normalizeQboBillingDay(qboBillingDay);
  const nextQboAdjustment =
    qboAdjustmentPolicy === null || qboAdjustmentPolicy === undefined
      ? normalizeQboAdjustmentPolicy(current.qbo_adjustment_policy)
      : normalizeQboAdjustmentPolicy(qboAdjustmentPolicy);
  const nextQboIncomeAccounts = normalizeQboIncomeAccountIds(
    qboIncomeAccountIds === undefined ? current.qbo_income_account_ids : qboIncomeAccountIds
  );
  const nextQboDefaultTaxCode =
    qboDefaultTaxCode === undefined ? normalizeQboTaxCodeId(current.qbo_default_tax_code) : normalizeQboTaxCodeId(qboDefaultTaxCode);
  const res = await pool.query(
    `
        INSERT INTO company_settings
          (company_id, billing_rounding_mode, billing_rounding_granularity, monthly_proration_method, billing_timezone, logo_url, qbo_enabled, qbo_billing_day, qbo_adjustment_policy, qbo_income_account_ids, qbo_default_tax_code, tax_enabled, default_tax_rate, tax_registration_number, tax_inclusive_pricing, auto_apply_customer_credit, auto_work_order_on_return, required_storefront_customer_fields, rental_info_fields, customer_contact_categories, customer_document_categories, customer_terms_template, customer_esign_required, customer_service_agreement_url, customer_service_agreement_file_name, customer_service_agreement_mime, customer_service_agreement_size_bytes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20::jsonb, $21::jsonb, $22, $23, $24, $25, $26, $27)
      ON CONFLICT (company_id)
      DO UPDATE SET billing_rounding_mode = EXCLUDED.billing_rounding_mode,
                    billing_rounding_granularity = EXCLUDED.billing_rounding_granularity,
                    monthly_proration_method = EXCLUDED.monthly_proration_method,
                    billing_timezone = EXCLUDED.billing_timezone,
                    logo_url = EXCLUDED.logo_url,
                    qbo_enabled = EXCLUDED.qbo_enabled,
                    qbo_billing_day = EXCLUDED.qbo_billing_day,
                    qbo_adjustment_policy = EXCLUDED.qbo_adjustment_policy,
                    qbo_income_account_ids = EXCLUDED.qbo_income_account_ids,
                    qbo_default_tax_code = EXCLUDED.qbo_default_tax_code,
                    tax_enabled = EXCLUDED.tax_enabled,
                    default_tax_rate = EXCLUDED.default_tax_rate,
                    tax_registration_number = EXCLUDED.tax_registration_number,
                    tax_inclusive_pricing = EXCLUDED.tax_inclusive_pricing,
                    auto_apply_customer_credit = EXCLUDED.auto_apply_customer_credit,
                    auto_work_order_on_return = EXCLUDED.auto_work_order_on_return,
                    required_storefront_customer_fields = EXCLUDED.required_storefront_customer_fields,
                    rental_info_fields = EXCLUDED.rental_info_fields,
                    customer_contact_categories = EXCLUDED.customer_contact_categories,
                    customer_document_categories = EXCLUDED.customer_document_categories,
                    customer_terms_template = EXCLUDED.customer_terms_template,
                    customer_esign_required = EXCLUDED.customer_esign_required,
                    customer_service_agreement_url = EXCLUDED.customer_service_agreement_url,
                    customer_service_agreement_file_name = EXCLUDED.customer_service_agreement_file_name,
                    customer_service_agreement_mime = EXCLUDED.customer_service_agreement_mime,
                    customer_service_agreement_size_bytes = EXCLUDED.customer_service_agreement_size_bytes,
                    updated_at = NOW()
      RETURNING company_id,
                billing_rounding_mode,
                billing_rounding_granularity,
                monthly_proration_method,
                billing_timezone,
                logo_url,
                qbo_enabled,
                qbo_billing_day,
                qbo_adjustment_policy,
                qbo_income_account_ids,
                qbo_default_tax_code,
                tax_enabled,
                default_tax_rate,
                tax_registration_number,
                tax_inclusive_pricing,
                auto_apply_customer_credit,
                auto_work_order_on_return,
                required_storefront_customer_fields,
                rental_info_fields,
                customer_contact_categories,
                customer_document_categories,
                customer_terms_template,
                customer_esign_required,
                customer_service_agreement_url,
                customer_service_agreement_file_name,
                customer_service_agreement_mime,
                customer_service_agreement_size_bytes
      `,
      [
        companyId,
      nextMode,
      nextGranularity,
      nextProrationMethod,
      nextTimeZone,
      nextLogo,
      nextQboEnabled,
      nextQboBillingDay,
      nextQboAdjustment,
      JSON.stringify(nextQboIncomeAccounts),
      nextQboDefaultTaxCode,
      nextTaxEnabled,
      nextTaxRate,
        nextTaxRegistration,
        nextTaxInclusive,
        nextAutoApplyCustomerCredit,
        nextAutoWorkOrderOnReturn,
        JSON.stringify(nextRequired),
        JSON.stringify(nextRentalInfoFields),
        JSON.stringify(nextCustomerContactCategories),
        JSON.stringify(nextCustomerDocumentCategories),
        nextCustomerTermsTemplate,
        nextCustomerEsignRequired,
        nextServiceAgreementUrl,
        nextServiceAgreementFileName,
        nextServiceAgreementMime,
        nextServiceAgreementSizeBytes,
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

  function normalizeCustomerDocumentCategories(value) {
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
          .slice(0, 50)
      )
    );
  }

  const DEFAULT_CUSTOMER_CONTACT_CATEGORIES = [
    { key: "contacts", label: "Contacts" },
    { key: "accountingContacts", label: "Accounting contacts" },
  ];

  function normalizeContactCategoryKey(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(raw)) {
      return raw.slice(0, 1).toLowerCase() + raw.slice(1);
    }
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(raw)) {
      const parts = raw
        .split("_")
        .map((part) => part.trim())
        .filter(Boolean);
      if (!parts.length) return "";
      return parts
        .map((part, idx) => {
          const lower = part.toLowerCase();
          return idx === 0 ? lower : lower.slice(0, 1).toUpperCase() + lower.slice(1);
        })
        .join("");
    }
    const cleaned = raw.replace(/[^A-Za-z0-9]+/g, " ").trim();
    if (!cleaned) return "";
    const parts = cleaned.split(/\s+/);
    return parts
      .map((part, idx) => {
        const lower = part.toLowerCase();
        return idx === 0 ? lower : lower.slice(0, 1).toUpperCase() + lower.slice(1);
      })
      .join("");
  }

  function normalizeCustomerContactCategories(value) {
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
    const normalized = [];
    const usedKeys = new Set();

    const pushEntry = (key, label) => {
      const cleanLabel = String(label || "").trim();
      if (!cleanLabel) return;
      let cleanKey = String(key || "").trim();
      if (!cleanKey) cleanKey = normalizeContactCategoryKey(cleanLabel);
      if (!cleanKey) return;
      if (usedKeys.has(cleanKey)) {
        let suffix = 2;
        let candidate = `${cleanKey}${suffix}`;
        while (usedKeys.has(candidate)) {
          suffix += 1;
          candidate = `${cleanKey}${suffix}`;
        }
        cleanKey = candidate;
      }
      usedKeys.add(cleanKey);
      normalized.push({ key: cleanKey, label: cleanLabel });
    };

    arr.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === "string") {
        pushEntry("", entry);
        return;
      }
      if (typeof entry !== "object") return;
      const label = entry.label || entry.name || entry.title || "";
      const key = entry.key || entry.id || "";
      pushEntry(key, label);
    });

    const byKey = new Map(normalized.map((entry) => [entry.key, entry]));
    const baseContacts = byKey.get("contacts")?.label || DEFAULT_CUSTOMER_CONTACT_CATEGORIES[0].label;
    const baseAccounting =
      byKey.get("accountingContacts")?.label || DEFAULT_CUSTOMER_CONTACT_CATEGORIES[1].label;
    const extras = normalized.filter(
      (entry) => entry.key !== "contacts" && entry.key !== "accountingContacts"
    );
    return [
      { key: "contacts", label: baseContacts },
      { key: "accountingContacts", label: baseAccounting },
      ...extras,
    ];
  }

const DEFAULT_RENTAL_INFO_FIELDS = {
  siteAddress: { enabled: true, required: false },
  siteName: { enabled: true, required: false },
  siteAccessInfo: { enabled: true, required: false },
  criticalAreas: { enabled: true, required: true },
  monitoringPersonnel: { enabled: true, required: false },
  generalNotes: { enabled: true, required: true },
  emergencyContacts: { enabled: true, required: true },
  emergencyContactInstructions: { enabled: true, required: false },
  siteContacts: { enabled: true, required: true },
  notificationCircumstances: { enabled: true, required: false },
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

function isDemandOnlyStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s === "quote" || s === "quote_rejected" || s === "reservation" || s === "requested";
}

function splitIntoCalendarMonthsInTimeZone({ startAt, endAt, timeZone }) {
  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) return [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const tz = normalizeBillingTimeZone(timeZone);
  const segments = [];
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
    const segmentEnd = nextBoundaryMs < endMs ? nextBoundary : endIso;
    if (Date.parse(segmentEnd) <= Date.parse(cursorIso)) break;
    segments.push({
      startAt: cursorIso,
      endAt: segmentEnd,
      daysInMonth: daysInMonthUTC(parts.year, parts.month - 1),
    });
    cursorIso = segmentEnd;
    guard += 1;
  }
  return segments;
}

function computeMonthlyUnitsInTimeZone({
  startAt,
  endAt,
  prorationMethod = null,
  roundingMode = null,
  roundingGranularity = null,
  timeZone = null,
} = {}) {
  const segments = splitIntoCalendarMonthsInTimeZone({ startAt, endAt, timeZone });
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
    const activeMs = segmentEnd - segmentStart;
    if (activeMs <= 0) continue;
    if (method === "days") {
      let days = activeMs / dayMs;
      if (mode !== "none" && granularity === "day") {
        days = applyRoundingValue(days, mode);
      } else {
        days = Math.ceil(days - 1e-9);
      }
      units += days / segment.daysInMonth;
    } else {
      const adjustedMs =
        mode !== "none" && (granularity === "hour" || granularity === "day")
          ? applyDurationRoundingMs({
              activeMs,
              roundingMode: mode,
              roundingGranularity: granularity,
            })
          : activeMs;
      units += adjustedMs / (segment.daysInMonth * dayMs);
    }
  }
  if (!Number.isFinite(units) || units <= 0) return null;
  return units;
}

function computeDisplayLineAmount({
  startAt,
  endAt,
  rateBasis,
  rateAmount,
  qty,
  billingRoundingMode,
  billingRoundingGranularity,
  monthlyProrationMethod,
  billingTimeZone,
}) {
  const basis = normalizeRateBasis(rateBasis);
  const amount = rateAmount === null || rateAmount === undefined ? null : Number(rateAmount);
  const quantity = qty === null || qty === undefined ? 0 : Number(qty);
  if (!basis || amount === null || !Number.isFinite(amount) || !Number.isFinite(quantity) || quantity <= 0) return null;
  const startIso = normalizeTimestamptz(startAt);
  const endIso = normalizeTimestamptz(endAt);
  if (!startIso || !endIso) return null;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  const mode = normalizeBillingRoundingMode(billingRoundingMode);
  const granularity = normalizeBillingRoundingGranularity(billingRoundingGranularity);
  const monthlyMethod = normalizeMonthlyProrationMethod(monthlyProrationMethod);
  const isMonthly = basis === "monthly";
  const effectiveMode = isMonthly ? "none" : mode;
  const effectiveGranularity = isMonthly ? "unit" : granularity;
  let unitsRaw = null;
  if (basis === "monthly") {
    unitsRaw = computeMonthlyUnitsInTimeZone({
      startAt: startIso,
      endAt: endIso,
      prorationMethod: monthlyMethod,
      roundingMode: effectiveMode,
      roundingGranularity: effectiveGranularity,
      timeZone: billingTimeZone,
    });
  } else {
    const adjustedMs =
      effectiveMode !== "none" && (effectiveGranularity === "hour" || effectiveGranularity === "day")
        ? applyDurationRoundingMs({
            activeMs: endMs - startMs,
            roundingMode: effectiveMode,
            roundingGranularity: effectiveGranularity,
          })
        : endMs - startMs;
    unitsRaw = (adjustedMs / dayMs) / billingPeriodDays(basis);
  }
  if (!Number.isFinite(unitsRaw)) return null;
  const units =
    effectiveMode !== "none" && effectiveGranularity === "unit"
      ? applyRoundingValue(unitsRaw, effectiveMode)
      : unitsRaw;
  return units * amount * quantity;
}

function computeMonthlyRecurringForItems({
  items,
  orderStatus,
  monthlyProrationMethod,
  billingTimeZone,
  billingRoundingMode,
  billingRoundingGranularity,
}) {
  const basisOrder = ["daily", "weekly", "monthly"];
  const basisTotals = new Map(basisOrder.map((basis) => [basis, 0]));
  const demandOnly = isDemandOnlyStatus(orderStatus);
  const dayMs = 24 * 60 * 60 * 1000;
  let monthlyRecurringSubtotal = 0;
  let earliestMs = null;
  let latestMs = null;

  for (const item of items || []) {
    const effectiveStart = item.fulfilled_at || item.start_at;
    const effectiveEnd = item.returned_at || item.end_at;
    const startIso = normalizeTimestamptz(effectiveStart);
    const endIso = normalizeTimestamptz(effectiveEnd);
    if (!startIso || !endIso) continue;

    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
    earliestMs = earliestMs === null ? startMs : Math.min(earliestMs, startMs);
    latestMs = latestMs === null ? endMs : Math.max(latestMs, endMs);
    const durationDays = Math.max(1, Math.ceil((endMs - startMs) / dayMs - 1e-9));

    const inventoryCount = Number(item.inventory_count || 0);
    const qty = item.bundle_id ? 1 : inventoryCount > 0 ? 1 : demandOnly ? 1 : 0;
    const computedLineAmount = computeDisplayLineAmount({
      startAt: startIso,
      endAt: endIso,
      rateBasis: item.rate_basis,
      rateAmount: item.rate_amount,
      qty,
      billingRoundingMode,
      billingRoundingGranularity,
      monthlyProrationMethod,
      billingTimeZone,
    });
    const lineAmount = Number.isFinite(computedLineAmount)
      ? computedLineAmount
      : item.line_amount === null || item.line_amount === undefined
        ? null
        : Number(item.line_amount);
    const hasLineAmount = Number.isFinite(lineAmount);
    const basis = normalizeRateBasis(item.rate_basis);
    const rateAmount = item.rate_amount === null || item.rate_amount === undefined ? null : Number(item.rate_amount);
    const billableUnits =
      item.billable_units === null || item.billable_units === undefined ? null : Number(item.billable_units);

    if (basis && basisTotals.has(basis) && hasLineAmount) {
      basisTotals.set(basis, (basisTotals.get(basis) || 0) + lineAmount);
    }
    if (!hasLineAmount) continue;

    if (basis === "daily") {
      let perDay = Number.isFinite(rateAmount) ? rateAmount : null;
      if (!Number.isFinite(perDay) && Number.isFinite(billableUnits) && billableUnits > 0 && qty > 0) {
        perDay = lineAmount / (billableUnits * qty);
      }
      if (!Number.isFinite(perDay) && qty > 0 && durationDays > 0) {
        perDay = lineAmount / (durationDays * qty);
      }
      if (Number.isFinite(perDay) && qty > 0) {
        const recurringDays = Math.min(30, durationDays);
        monthlyRecurringSubtotal += perDay * recurringDays * qty;
      }
    } else if (basis === "weekly") {
      let perWeek = Number.isFinite(rateAmount) ? rateAmount : null;
      if (!Number.isFinite(perWeek) && Number.isFinite(billableUnits) && billableUnits > 0 && qty > 0) {
        perWeek = lineAmount / (billableUnits * qty);
      }
      if (!Number.isFinite(perWeek) && qty > 0 && durationDays > 0) {
        perWeek = lineAmount / ((durationDays / 7) * qty);
      }
      if (Number.isFinite(perWeek) && qty > 0) {
        const recurringWeeks = Math.min(30, durationDays) / 7;
        monthlyRecurringSubtotal += perWeek * recurringWeeks * qty;
      }
    } else {
      const monthlyUnits = computeMonthlyUnitsInTimeZone({
        startAt: startIso,
        endAt: endIso,
        prorationMethod: monthlyProrationMethod,
        roundingMode: "none",
        roundingGranularity: "unit",
        timeZone: billingTimeZone,
      });
      if (Number.isFinite(monthlyUnits) && monthlyUnits > 0) {
        monthlyRecurringSubtotal += lineAmount / monthlyUnits;
      }
    }
  }

  const recurringSubtotal = Number.isFinite(monthlyRecurringSubtotal) ? monthlyRecurringSubtotal : 0;
  const recurringTotal = recurringSubtotal * 1.05;

  const activeBases = basisOrder.filter((basis) => (basisTotals.get(basis) || 0) > 0);
  const days =
    Number.isFinite(earliestMs) && Number.isFinite(latestMs) && latestMs > earliestMs
      ? Math.round((latestMs - earliestMs) / dayMs)
      : 0;
  const months =
    Number.isFinite(earliestMs) && Number.isFinite(latestMs) && latestMs > earliestMs
      ? computeMonthlyUnitsInTimeZone({
          startAt: new Date(earliestMs).toISOString(),
          endAt: new Date(latestMs).toISOString(),
          prorationMethod: monthlyProrationMethod,
          roundingMode: "none",
          roundingGranularity: "unit",
          timeZone: billingTimeZone,
        }) || 0
      : 0;

  let showRecurring = true;
  if (activeBases.length === 1) {
    const basis = activeBases[0];
    if (basis === "monthly") showRecurring = months > 1;
    else if (basis === "weekly") showRecurring = days > 7;
    else if (basis === "daily") showRecurring = days > 1;
  }

  return {
    recurringSubtotal,
    recurringTotal,
    showRecurring: showRecurring && recurringSubtotal > 0,
  };
}

async function recomputeMonthlyRecurringForOrder({
  client,
  companyId,
  orderId,
  orderStatus,
  settings,
}) {
  const lineItemsRes = await client.query(
    `
      SELECT li.start_at,
             li.end_at,
             li.fulfilled_at,
             li.returned_at,
             li.rate_basis,
             li.rate_amount,
             li.billable_units,
             li.line_amount,
             li.bundle_id,
             (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS inventory_count
        FROM rental_order_line_items li
       WHERE li.rental_order_id = $1
    `,
    [orderId]
  );

  const recurring = computeMonthlyRecurringForItems({
    items: lineItemsRes.rows || [],
    orderStatus,
    monthlyProrationMethod: settings?.monthly_proration_method || "hours",
    billingTimeZone: settings?.billing_timezone || "UTC",
    billingRoundingMode: settings?.billing_rounding_mode || "ceil",
    billingRoundingGranularity: settings?.billing_rounding_granularity || "unit",
  });

  await client.query(
    `
      UPDATE rental_orders
         SET monthly_recurring_subtotal = $1,
             monthly_recurring_total = $2,
             show_monthly_recurring = $3
       WHERE id = $4 AND company_id = $5
    `,
    [recurring.recurringSubtotal, recurring.recurringTotal, recurring.showRecurring, orderId, companyId]
  );

  return recurring;
}

async function attachMonthlyRecurringTotals(companyId, orders) {
  if (!Array.isArray(orders) || orders.length === 0) return orders;

  const orderIds = orders.map((order) => Number(order.id)).filter(Number.isFinite);
  if (orderIds.length === 0) return orders;

  const settings = await getCompanySettings(companyId).catch(() => null);
  const monthlyProrationMethod = settings?.monthly_proration_method || "hours";
  const billingTimeZone = settings?.billing_timezone || "UTC";
  const billingRoundingMode = settings?.billing_rounding_mode || "ceil";
  const billingRoundingGranularity = settings?.billing_rounding_granularity || "unit";

  const lineItemsRes = await pool.query(
    `
      SELECT li.id,
             li.rental_order_id,
             li.start_at,
             li.end_at,
             li.fulfilled_at,
             li.returned_at,
             li.rate_basis,
             li.rate_amount,
             li.billable_units,
             li.line_amount,
             li.bundle_id,
             (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS inventory_count
        FROM rental_order_line_items li
       WHERE li.rental_order_id = ANY($1::int[])
    `,
    [orderIds]
  );

  const itemsByOrder = new Map();
  for (const row of lineItemsRes.rows || []) {
    const orderId = Number(row.rental_order_id);
    if (!Number.isFinite(orderId)) continue;
    const list = itemsByOrder.get(orderId);
    if (list) list.push(row);
    else itemsByOrder.set(orderId, [row]);
  }

  for (const order of orders) {
    const items = itemsByOrder.get(Number(order.id)) || [];
    const recurring = computeMonthlyRecurringForItems({
      items,
      orderStatus: order.status,
      monthlyProrationMethod,
      billingTimeZone,
      billingRoundingMode,
      billingRoundingGranularity,
    });

    order.monthly_recurring_subtotal = recurring.recurringSubtotal;
    order.monthly_recurring_total = recurring.recurringTotal;
    order.show_monthly_recurring = recurring.showRecurring;
  }

  return orders;
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
           ro.site_name,
           ro.site_address,
           ro.critical_areas,
           ro.coverage_hours,
           ro.coverage_timezone,
           ro.coverage_stat_holidays_required,
           ro.monthly_recurring_subtotal,
           ro.monthly_recurring_total,
           ro.show_monthly_recurring,
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
           (SELECT COALESCE(jsonb_agg(DISTINCT e.model_name ORDER BY e.model_name), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN rental_order_line_items li ON li.id = liv.line_item_id
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE li.rental_order_id = ro.id
               AND e.model_name IS NOT NULL) AS equipment_models,
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
 LEFT JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY ro.created_at DESC
  `,
    params
  );
  return result.rows;
}

async function listRentalOrdersForRange(companyId, { from, to, statuses = null, quoteOnly = false, dateField = "rental_period" } = {}) {
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
  if (quoteOnly) where.push("ro.quote_number IS NOT NULL");
  if (dateField === "created_at" || dateField === "updated_at") {
    where.push(`ro.${dateField} >= $2::timestamptz`);
    where.push(`ro.${dateField} < $3::timestamptz`);
  } else {
    where.push(`(SELECT MIN(li.start_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) < $3::timestamptz`);
    where.push(`(SELECT MAX(li.end_at) FROM rental_order_line_items li WHERE li.rental_order_id = ro.id) > $2::timestamptz`);
  }
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
           ro.site_name,
           ro.site_address,
           ro.critical_areas,
           ro.coverage_hours,
           ro.coverage_timezone,
           ro.coverage_stat_holidays_required,
           ro.monthly_recurring_subtotal,
           ro.monthly_recurring_total,
           ro.show_monthly_recurring,
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
           (SELECT COALESCE(jsonb_agg(DISTINCT e.model_name ORDER BY e.model_name), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN rental_order_line_items li ON li.id = liv.line_item_id
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE li.rental_order_id = ro.id
               AND e.model_name IS NOT NULL) AS equipment_models,
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
 LEFT JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
     WHERE ${where.join(" AND ")}
     ORDER BY start_at ASC NULLS LAST, ro.created_at DESC
    `,
    params
  );
  return result.rows;
}

async function listRentalOrderLineItemsForRange(
  companyId,
  { from, to, statuses = null, dateField = "start_at" } = {}
) {
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

  const fieldMap = {
    start_at: "li.start_at",
    end_at: "li.end_at",
    fulfilled_at: "li.fulfilled_at",
    returned_at: "li.returned_at",
    order_created_at: "ro.created_at",
    order_updated_at: "ro.updated_at",
  };
  const field = fieldMap[dateField] || "li.start_at";

  const params = [companyId, fromIso, toIso];
  const where = ["ro.company_id = $1", `${field} >= $2::timestamptz`, `${field} < $3::timestamptz`];
  if (useStatuses) {
    params.push(useStatuses);
    where.push(`ro.status = ANY($${params.length}::text[])`);
  }

  const result = await pool.query(
    `
    SELECT li.id AS line_item_id,
           li.rental_order_id,
           ro.status AS order_status,
           ro.quote_number,
           ro.ro_number,
           ro.customer_po,
           ro.created_at AS order_created_at,
           ro.updated_at AS order_updated_at,
           ro.customer_id,
           c.company_name AS customer_name,
           ro.salesperson_id,
           sp.name AS salesperson_name,
           ro.pickup_location_id,
           l.name AS pickup_location_name,
           li.type_id,
           et.name AS type_name,
           ec.id AS category_id,
           ec.name AS category_name,
           li.bundle_id,
           b.name AS bundle_name,
           li.start_at,
           li.end_at,
           li.fulfilled_at,
           li.returned_at,
           li.rate_basis,
           li.rate_amount,
           li.billable_units,
           li.line_amount,
           (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS equipment_count,
           (SELECT COALESCE(jsonb_agg(e.id ORDER BY e.id), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE liv.line_item_id = li.id) AS equipment_ids,
           (SELECT COALESCE(jsonb_agg(e.serial_number ORDER BY e.serial_number), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE liv.line_item_id = li.id) AS equipment_serials
          ,
           (SELECT COALESCE(jsonb_agg(e.model_name ORDER BY e.serial_number), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE liv.line_item_id = li.id) AS equipment_models,
           (SELECT COALESCE(jsonb_agg(e.condition ORDER BY e.serial_number), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE liv.line_item_id = li.id) AS equipment_conditions,
           (SELECT COALESCE(jsonb_agg(e.manufacturer ORDER BY e.serial_number), '[]'::jsonb)
              FROM rental_order_line_inventory liv
              JOIN equipment e ON e.id = liv.equipment_id
             WHERE liv.line_item_id = li.id) AS equipment_manufacturers
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN customers c ON c.id = ro.customer_id
 LEFT JOIN sales_people sp ON sp.id = ro.salesperson_id
 LEFT JOIN locations l ON l.id = ro.pickup_location_id
 LEFT JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN equipment_categories ec ON ec.id = et.category_id
 LEFT JOIN equipment_bundles b ON b.id = li.bundle_id
     WHERE ${where.join(" AND ")}
     ORDER BY ${field} ASC NULLS LAST, li.id ASC
    `,
    params
  );
  return result.rows;
}

async function getLineItemRevenueSummary(
  companyId,
  { from, to, statuses = null, dateField = "start_at", groupBy = "type" } = {}
) {
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

  const fieldMap = {
    start_at: "li.start_at",
    end_at: "li.end_at",
    fulfilled_at: "li.fulfilled_at",
    returned_at: "li.returned_at",
    order_created_at: "ro.created_at",
    order_updated_at: "ro.updated_at",
  };
  const field = fieldMap[dateField] || "li.start_at";

  const group = String(groupBy || "type").toLowerCase();

  const params = [companyId, fromIso, toIso];
  const filters = ["ro.company_id = $1", `${field} >= $2::timestamptz`, `${field} < $3::timestamptz`];
  if (useStatuses) {
    params.push(useStatuses);
    filters.push(`ro.status = ANY($${params.length}::text[])`);
  }

  if (group === "bundle") {
    const res = await pool.query(
      `
      SELECT li.bundle_id AS key,
             COALESCE(b.name, 'No bundle') AS label,
             COALESCE(SUM(li.line_amount), 0) AS revenue
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
   LEFT JOIN equipment_bundles b ON b.id = li.bundle_id
       WHERE ${filters.join(" AND ")}
       GROUP BY li.bundle_id, b.name
       ORDER BY revenue DESC, label ASC
      `,
      params
    );
    return res.rows.map((r) => ({ key: r.key, label: r.label, revenue: Number(r.revenue || 0) }));
  }

  if (group === "customer") {
    const res = await pool.query(
      `
      SELECT ro.customer_id AS key,
             COALESCE(c.company_name, 'Unknown') AS label,
             COALESCE(SUM(li.line_amount), 0) AS revenue
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN customers c ON c.id = ro.customer_id
       WHERE ${filters.join(" AND ")}
       GROUP BY ro.customer_id, c.company_name
       ORDER BY revenue DESC, label ASC
      `,
      params
    );
    return res.rows.map((r) => ({ key: r.key, label: r.label, revenue: Number(r.revenue || 0) }));
  }

  const res = await pool.query(
    `
    SELECT li.type_id AS key,
           COALESCE(et.name, 'Unknown type') AS label,
           COALESCE(SUM(li.line_amount), 0) AS revenue
      FROM rental_order_line_items li
      JOIN rental_orders ro ON ro.id = li.rental_order_id
 LEFT JOIN equipment_types et ON et.id = li.type_id
     WHERE ${filters.join(" AND ")}
     GROUP BY li.type_id, et.name
     ORDER BY revenue DESC, label ASC
    `,
    params
  );
  return res.rows.map((r) => ({ key: r.key, label: r.label, revenue: Number(r.revenue || 0) }));
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

  const timelineStartExpr = `
    CASE
      WHEN ro.status IN ('ordered', 'received', 'closed') THEN COALESCE(li.fulfilled_at, li.start_at)
      ELSE li.start_at
    END
  `;
  const timelineEndExpr = `
    CASE
      WHEN ro.status = 'ordered' THEN COALESCE(li.returned_at, GREATEST(li.end_at, NOW()))
      WHEN ro.status IN ('received', 'closed') THEN COALESCE(li.returned_at, li.end_at)
      ELSE li.end_at
    END
  `;
  const timelineEndRawExpr = `
    CASE
      WHEN ro.status = 'ordered' THEN COALESCE(li.returned_at, li.end_at)
      WHEN ro.status IN ('received', 'closed') THEN COALESCE(li.returned_at, li.end_at)
      ELSE li.end_at
    END
  `;

  const params = [companyId, fromIso, toIso];
  const where = [
    "ro.company_id = $1",
    `${timelineStartExpr} < $3::timestamptz`,
    `${timelineEndExpr} > $2::timestamptz`,
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
           ${timelineStartExpr} AS start_at,
           ${timelineEndExpr} AS end_at,
           ${timelineEndRawExpr} AS end_at_raw,
           li.returned_at,
           ro.id AS order_id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           ro.site_name,
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
           ${timelineStartExpr} AS start_at,
           ${timelineEndExpr} AS end_at,
           ${timelineEndRawExpr} AS end_at_raw,
           li.returned_at,
           ro.id AS order_id,
           ro.status,
           ro.quote_number,
           ro.ro_number,
           ro.external_contract_number,
           ro.customer_po,
           ro.site_name,
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
    const rescheduleSettings = await getCompanySettings(companyId).catch(() => null);
    await recomputeMonthlyRecurringForOrder({
      client,
      companyId,
      orderId: Number(li.order_id),
      orderStatus: status,
      settings: rescheduleSettings,
    });
    await client.query("COMMIT");
    return { ok: true, endAt: endIso };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function createPickupConflictError(conflicts) {
  const err = new Error("No available units for that actual pickup time.");
  err.code = "pickup_conflict";
  err.conflicts = conflicts;
  return err;
}

async function findPickupConflicts({ client, companyId, equipmentIds, orderId, startAt, endAt }) {
  if (!equipmentIds.length) return [];
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
             CASE
               WHEN li.fulfilled_at IS NOT NULL AND li.returned_at IS NULL THEN 'infinity'::timestamptz
               ELSE COALESCE(li.returned_at, GREATEST(li.end_at, NOW()))
             END AS end_at
        FROM rental_order_line_inventory liv
        JOIN rental_order_line_items li ON li.id = liv.line_item_id
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN customers c ON c.id = ro.customer_id
       WHERE liv.equipment_id = $1
         AND ro.company_id = $2
         AND ($3::int IS NULL OR ro.id <> $3)
         AND tstzrange(
           COALESCE(li.fulfilled_at, li.start_at),
           CASE
             WHEN li.fulfilled_at IS NOT NULL AND li.returned_at IS NULL THEN 'infinity'::timestamptz
             ELSE COALESCE(li.returned_at, GREATEST(li.end_at, NOW()))
           END,
           '[)'
         ) && tstzrange($4::timestamptz, $5::timestamptz, '[)')
       ORDER BY COALESCE(li.fulfilled_at, li.start_at) ASC
       LIMIT 3
      `,
      [equipmentId, companyId, orderId || null, startAt, endAt]
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
  return conflicts;
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
  if (providedPickedUpAt) {
    const pickedMs = Date.parse(providedPickedUpAt);
    if (!Number.isFinite(pickedMs)) return { ok: false, error: "Invalid actual pickup time." };
    if (pickedMs > Date.now()) return { ok: false, error: "Actual pickup time cannot be in the future." };
  }

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
             AND tstzrange(
               COALESCE(li.fulfilled_at, li.start_at),
               CASE
                 WHEN li.fulfilled_at IS NOT NULL AND li.returned_at IS NULL THEN 'infinity'::timestamptz
                 ELSE COALESCE(li.returned_at, GREATEST(li.end_at, NOW()))
               END,
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

    const pickupSettings = await getCompanySettings(cid).catch(() => null);
    await recomputeMonthlyRecurringForOrder({
      client,
      companyId: cid,
      orderId,
      orderStatus: nextStatus || status,
      settings: pickupSettings,
    });

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
  if (providedReturnedAt) {
    const returnedMs = Date.parse(providedReturnedAt);
    if (!Number.isFinite(returnedMs)) return { ok: false, error: "Invalid actual return time." };
    if (returnedMs > Date.now()) return { ok: false, error: "Actual return time cannot be in the future." };
  }

  const client = await pool.connect();
  let orderId = null;
  let prevStatus = null;
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
    if (nextReturned && existing.fulfilled_at) {
      const fulfilledMs = Date.parse(existing.fulfilled_at);
      const effectiveReturnedAt = providedReturnedAt || existing.returned_at || new Date().toISOString();
      const returnedMs = Date.parse(effectiveReturnedAt);
      if (Number.isFinite(fulfilledMs) && Number.isFinite(returnedMs) && returnedMs <= fulfilledMs) {
        await client.query("ROLLBACK");
        return { ok: false, error: "Return time must be after pickup time." };
      }
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
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE returned_at IS NULL) AS unreturned
          FROM rental_order_line_items
         WHERE rental_order_id = $1
        `,
        [orderId]
      );
      const counts = countsRes.rows[0] || {};
      const total = Number(counts.total || 0);
      const unreturned = Number(counts.unreturned || 0);

      if (total > 0 && unreturned === 0) {
        nextStatus = "received";
      } else if (status === "received" && unreturned > 0) {
        nextStatus = "ordered";
      }

    if (nextStatus && nextStatus !== status) {
      statusChanged = true;
      await client.query(`UPDATE rental_orders SET status = $1, updated_at = NOW() WHERE id = $2 AND company_id = $3`, [
        nextStatus,
        orderId,
        cid,
      ]);
    }

    const returnSettings = await getCompanySettings(cid).catch(() => null);
    await recomputeMonthlyRecurringForOrder({
      client,
      companyId: cid,
      orderId,
      orderStatus: nextStatus || status,
      settings: returnSettings,
    });

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

  return {
    ok: true,
    orderId,
    orderStatus: nextStatus || null,
    lineItemId: liid,
    pickedUpAt: updatedLine?.fulfilled_at || null,
    returnedAt: updatedLine?.returned_at || null,
  };
}

async function applyWorkOrderPauseToEquipment({
  companyId,
  equipmentId,
  workOrderNumber,
  startAt = null,
  endAt = null,
  serviceStatus = null,
  orderStatus = null,
}) {
  const cid = Number(companyId);
  const eid = Number(equipmentId);
  if (!Number.isFinite(cid) || !Number.isFinite(eid)) throw new Error("companyId and equipmentId are required.");

  const woNumber = String(workOrderNumber || "").trim();
  if (!woNumber) throw new Error("workOrderNumber is required.");

  const normalizedServiceStatus = String(serviceStatus || "").trim() || "out_of_service";
  const normalizedOrderStatus = String(orderStatus || "").trim() || "open";
  const isOutOfService = normalizedServiceStatus === "out_of_service";

  const startIso = startAt ? normalizeTimestamptz(startAt) : null;
  const endIso = endAt ? normalizeTimestamptz(endAt) : null;
  if (startAt && !startIso) throw new Error("Invalid startAt.");
  if (endAt && !endIso) throw new Error("Invalid endAt.");
  if (startIso && endIso && Date.parse(endIso) <= Date.parse(startIso)) {
    throw new Error("endAt must be after startAt.");
  }

  if (isOutOfService && !startIso) {
    throw new Error("startAt is required when setting out_of_service.");
  }

  if (isOutOfService) {
    await pool.query(
      `
      INSERT INTO equipment_out_of_service
        (company_id, equipment_id, work_order_number, start_at, end_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (company_id, equipment_id, work_order_number)
      DO UPDATE SET start_at = EXCLUDED.start_at, end_at = EXCLUDED.end_at, updated_at = NOW()
      `,
      [cid, eid, woNumber, startIso, endIso || null]
    );
  } else if (endIso || normalizedOrderStatus === "closed") {
    await pool.query(
      `
      UPDATE equipment_out_of_service
         SET end_at = COALESCE($4, NOW()),
             updated_at = NOW()
       WHERE company_id = $1
         AND equipment_id = $2
         AND work_order_number = $3
         AND end_at IS NULL
      `,
      [cid, eid, woNumber, endIso || null]
    );
  }

  if (!isOutOfService) {
    return { ok: true, updatedLineItems: 0, lineItemIds: [] };
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

  const defaultLocationRes = await pool.query(
    `SELECT id, name
       FROM locations
      WHERE company_id = $1
        AND is_base_location = TRUE
      ORDER BY id
      LIMIT 1`,
    [companyId]
  );
  const defaultLocation = defaultLocationRes.rows?.[0]
    ? { id: Number(defaultLocationRes.rows[0].id), name: defaultLocationRes.rows[0].name }
    : null;
  const defaultLocationId = Number.isFinite(defaultLocation?.id) ? defaultLocation.id : null;
  const defaultLocationName = defaultLocation?.name || "No location";

  const equipmentRes = await pool.query(
    `
    SELECT e.id,
           COALESCE(l.id, $3) AS location_id,
           COALESCE(l.name, $4) AS location_name
      FROM equipment e
 LEFT JOIN locations l ON l.id = e.location_id
                        AND l.is_base_location = TRUE
     WHERE e.company_id = $1
       AND e.type_id = $2
       AND (e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')
    `,
    [companyId, typeId, defaultLocationId, defaultLocationName]
  );
  const units = equipmentRes.rows.map((r) => ({
    id: Number(r.id),
    locationId: r.location_id === null || r.location_id === undefined ? null : Number(r.location_id),
    locationName: r.location_name || "No location",
  }));

  const demandRes = await pool.query(
    `
    WITH assigned AS (
      SELECT li.id,
             COALESCE(base_loc.id, pickup_loc.id, $5) AS location_id,
             COALESCE(base_loc.name, pickup_loc.name, $6) AS location_name,
             COALESCE(li.fulfilled_at, li.start_at) AS start_at,
             COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
             COUNT(*)::int AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
        JOIN equipment e ON e.id = liv.equipment_id
   LEFT JOIN locations base_loc ON base_loc.id = e.location_id
                               AND base_loc.is_base_location = TRUE
   LEFT JOIN locations pickup_loc ON pickup_loc.id = ro.pickup_location_id
                                 AND pickup_loc.is_base_location = TRUE
       WHERE ro.company_id = $1
         AND li.type_id = $2
         AND ro.status IN ('quote','requested','reservation','ordered')
         AND (
           COALESCE(li.fulfilled_at, li.start_at) < $4::timestamptz
           AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $3::timestamptz
         )
       GROUP BY li.id,
                base_loc.id,
                base_loc.name,
                pickup_loc.id,
                pickup_loc.name,
                li.fulfilled_at,
                li.start_at,
                li.returned_at,
                li.end_at
    ),
    unassigned AS (
      SELECT li.id,
             COALESCE(pickup_loc.id, $5) AS location_id,
             COALESCE(pickup_loc.name, $6) AS location_name,
             COALESCE(li.fulfilled_at, li.start_at) AS start_at,
             COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
             1::int AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
   LEFT JOIN locations pickup_loc ON pickup_loc.id = ro.pickup_location_id
                                 AND pickup_loc.is_base_location = TRUE
       WHERE ro.company_id = $1
         AND li.type_id = $2
         AND ro.status IN ('quote','requested','reservation','ordered')
         AND (
           COALESCE(li.fulfilled_at, li.start_at) < $4::timestamptz
           AND COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) > $3::timestamptz
         )
         AND NOT EXISTS (SELECT 1 FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id)
    )
    SELECT * FROM assigned
    UNION ALL
    SELECT * FROM unassigned
    `,
    [companyId, typeId, start.toISOString(), end.toISOString(), defaultLocationId, defaultLocationName]
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
    const locKey = String(r.location_id ?? "none");
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: r.location_id === null || r.location_id === undefined ? null : Number(r.location_id),
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
           COALESCE(base_loc.id, $4) AS location_id,
           COALESCE(base_loc.name, $5) AS location_name,
           COUNT(*)::int AS qty
      FROM purchase_orders po
 LEFT JOIN locations base_loc ON base_loc.id = po.location_id
                             AND base_loc.is_base_location = TRUE
     WHERE po.company_id = $1
       AND po.type_id = $2
       AND po.status <> 'closed'
       AND po.equipment_id IS NULL
       AND po.expected_possession_date IS NOT NULL
       AND po.expected_possession_date <= $3::date
     GROUP BY po.expected_possession_date,
              COALESCE(base_loc.id, $4),
              COALESCE(base_loc.name, $5)
    `,
    [companyId, typeId, end.toISOString().slice(0, 10), defaultLocationId, defaultLocationName]
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

async function getAvailabilityShortfallsCustomerDemand({
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

  const start = new Date(fromIso);
  const end = new Date(toIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return { rows: [] };

  const locationIdNum = locationId === null || locationId === undefined ? null : Number(locationId);
  const categoryIdNum = categoryId === null || categoryId === undefined ? null : Number(categoryId);
  const typeIdNum = typeId === null || typeId === undefined ? null : Number(typeId);

  const params = [companyId, fromIso, toIso];
  const filters = [
    "ro.company_id = $1",
    "ro.status IN ('quote','requested','reservation')",
    "li.start_at >= $2::timestamptz",
    "li.start_at < $3::timestamptz",
  ];
  if (Number.isFinite(locationIdNum)) {
    params.push(locationIdNum);
    filters.push(`ro.pickup_location_id = $${params.length}`);
  }
  if (Number.isFinite(categoryIdNum)) {
    params.push(categoryIdNum);
    filters.push(`et.category_id = $${params.length}`);
  }
  if (Number.isFinite(typeIdNum)) {
    params.push(typeIdNum);
    filters.push(`li.type_id = $${params.length}`);
  }

  const res = await pool.query(
    `
    WITH line_totals AS (
      SELECT li.id,
             ro.customer_id,
             c.company_name AS customer_name,
             li.type_id,
             et.name AS type_name,
             li.start_at,
             CASE WHEN COUNT(liv.equipment_id) > 0 THEN COUNT(liv.equipment_id) ELSE 1 END AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN customers c ON c.id = ro.customer_id
        JOIN equipment_types et ON et.id = li.type_id AND et.company_id = ro.company_id
   LEFT JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
       WHERE ${filters.join(" AND ")}
       GROUP BY li.id, ro.customer_id, c.company_name, li.type_id, et.name, li.start_at
    )
    SELECT customer_id,
           customer_name,
           type_id,
           type_name,
           start_at::date AS start_date,
           SUM(qty)::int AS qty
      FROM line_totals
     GROUP BY customer_id, customer_name, type_id, type_name, start_at
     ORDER BY start_at ASC, customer_name ASC, type_name ASC
    `,
    params
  );

  return { rows: res.rows || [] };
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

  const defaultLocationRes = await pool.query(
    `SELECT id, name
       FROM locations
      WHERE company_id = $1
        AND is_base_location = TRUE
      ORDER BY id
      LIMIT 1`,
    [companyId]
  );
  const defaultLocation = defaultLocationRes.rows?.[0]
    ? { id: Number(defaultLocationRes.rows[0].id), name: defaultLocationRes.rows[0].name }
    : null;
  const defaultLocationId = Number.isFinite(defaultLocation?.id) ? defaultLocation.id : null;

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
    equipmentFilters.push(`COALESCE(e.current_location_id, e.location_id) = $${equipmentParams.length}`);
  }

  const equipmentSelectParams = [...equipmentParams, defaultLocationId];
  const equipmentDefaultIdx = equipmentSelectParams.length;
  const equipmentRes = await pool.query(
    `
    SELECT e.id,
           COALESCE(e.current_location_id, e.location_id, $${equipmentDefaultIdx}) AS location_id,
           l.name AS location_name
      FROM equipment e
 LEFT JOIN locations l ON l.id = COALESCE(e.current_location_id, e.location_id, $${equipmentDefaultIdx})
     WHERE ${equipmentFilters.join(" AND ")}
    `,
    equipmentSelectParams
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
  let assignedLocationFilter = "";
  let unassignedLocationFilter = "";
  if (Number.isFinite(locationIdNum)) {
    demandParams.push(locationIdNum);
    assignedLocationFilter = `AND COALESCE(e.current_location_id, e.location_id, ro.pickup_location_id, $${demandParams.length + 1}) = $${demandParams.length}`;
    unassignedLocationFilter = `AND COALESCE(ro.pickup_location_id, $${demandParams.length + 1}) = $${demandParams.length}`;
  }

  const demandDefaultIdx = demandParams.length + 1;
  const demandSelectParams = [...demandParams, defaultLocationId];
  const demandRes = await pool.query(
    `
    WITH assigned AS (
      SELECT li.id,
             ro.status,
             COALESCE(e.current_location_id, e.location_id, ro.pickup_location_id, $${demandDefaultIdx}) AS location_id,
             COALESCE(l.name, 'No location') AS location_name,
             COALESCE(li.fulfilled_at, li.start_at) AS start_at,
             COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
             COUNT(*)::int AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
        JOIN rental_order_line_inventory liv ON liv.line_item_id = li.id
        JOIN equipment e ON e.id = liv.equipment_id
   LEFT JOIN locations l ON l.id = COALESCE(e.current_location_id, e.location_id, ro.pickup_location_id, $${demandDefaultIdx})
       WHERE ${demandFilters.join(" AND ")}
             ${assignedLocationFilter}
       GROUP BY li.id,
                ro.status,
                COALESCE(e.current_location_id, e.location_id, ro.pickup_location_id, $${demandDefaultIdx}),
                l.name,
                li.fulfilled_at,
                li.start_at,
                li.returned_at,
                li.end_at
    ),
    unassigned AS (
      SELECT li.id,
             ro.status,
             COALESCE(ro.pickup_location_id, $${demandDefaultIdx}) AS location_id,
             COALESCE(l.name, 'No location') AS location_name,
             COALESCE(li.fulfilled_at, li.start_at) AS start_at,
             COALESCE(li.returned_at, GREATEST(li.end_at, NOW())) AS end_at,
             1::int AS qty
        FROM rental_order_line_items li
        JOIN rental_orders ro ON ro.id = li.rental_order_id
   LEFT JOIN locations l ON l.id = COALESCE(ro.pickup_location_id, $${demandDefaultIdx})
       WHERE ${demandFilters.join(" AND ")}
             ${unassignedLocationFilter}
         AND NOT EXISTS (SELECT 1 FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id)
    )
    SELECT * FROM assigned
    UNION ALL
    SELECT * FROM unassigned
    `,
    demandSelectParams
  );

  const committedStatuses = new Set(["reservation", "ordered"]);
  const startMs = start.getTime();
  demandRes.rows.forEach((r) => {
    const locKey = doSplit ? String(r.location_id ?? "none") : "all";
    if (!byLocation.has(locKey)) {
      byLocation.set(locKey, {
        locationId: r.location_id === null || r.location_id === undefined ? null : Number(r.location_id),
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

  const incomingDefaultIdx = incomingParams.length + 1;
  const incomingSelectParams = [...incomingParams, defaultLocationId];
  const incomingRes = await pool.query(
    `
    SELECT po.expected_possession_date,
           COALESCE(po.location_id, $${incomingDefaultIdx}) AS location_id,
           COALESCE(l.name, 'No location') AS location_name,
           COUNT(*)::int AS qty
      FROM purchase_orders po
 LEFT JOIN locations l ON l.id = COALESCE(po.location_id, $${incomingDefaultIdx})
     WHERE ${incomingFilters.join(" AND ")}
     GROUP BY po.expected_possession_date, COALESCE(po.location_id, $${incomingDefaultIdx}), l.name
    `,
    incomingSelectParams
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
 LEFT JOIN customers c ON c.id = ro.customer_id
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
           cond.before_notes, cond.after_notes, cond.unit_description, cond.before_images, cond.after_images,
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
    unitDescription: r.unit_description || "",
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
           f.fee_date AS "feeDate"
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
  siteName,
  siteAddress,
  siteAccessInfo,
  siteAddressLat,
  siteAddressLng,
  siteAddressQuery,
  logisticsInstructions,
  specialInstructions,
  criticalAreas,
  monitoringPersonnel,
  notificationCircumstances,
  coverageHours,
  coverageTimeZone,
  coverageStatHolidaysRequired,
  emergencyContacts,
  emergencyContactInstructions,
  siteContacts,
  lineItems = [],
  fees = [],
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await getCompanySettings(companyId);
    const effectiveStatus = overrideStatusFromLineItems(status, lineItems);
    const demandOnly = isDemandOnlyStatus(effectiveStatus);
    const allowsInventory = allowsInventoryAssignment(effectiveStatus);
    const emergencyContactList = normalizeOrderContacts(emergencyContacts);
    const siteContactList = normalizeOrderContacts(siteContacts);
    const notificationCircumstancesValue = normalizeNotificationCircumstances(notificationCircumstances);
    const coverageHoursValue = normalizeCoverageHours(coverageHours);
    const coverageTimeZoneValue = normalizeCoverageTimeZone(coverageTimeZone, settings?.billing_timezone);
    const coverageStatHolidaysRequiredValue = coverageStatHolidaysRequired === true;
    const effectiveDate = createdAt ? new Date(createdAt) : new Date();
      const quoteNumber = isQuoteStatus(effectiveStatus) ? await nextDocumentNumber(client, companyId, "QO", effectiveDate) : null;
      const roNumber = !isQuoteStatus(effectiveStatus) ? await nextDocumentNumber(client, companyId, "RO", effectiveDate) : null;
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
         terms, general_notes, pickup_location_id, dropoff_address, site_name, site_address, site_access_info, site_address_lat, site_address_lng, site_address_query,
         logistics_instructions, special_instructions, critical_areas, monitoring_personnel,
         notification_circumstances, coverage_hours, coverage_timezone, coverage_stat_holidays_required,
         emergency_contact_instructions, emergency_contacts, site_contacts, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25::jsonb,$26::jsonb,$27,$28,$29,$30::jsonb,$31::jsonb,COALESCE($32::timestamptz, NOW()),COALESCE($32::timestamptz, NOW()))
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
          effectiveStatus,
        terms || null,
        generalNotes || null,
        pickupLocationId || null,
        fulfillmentMethod === "dropoff" ? (dropoffAddress || null) : null,
        siteName || null,
        siteAddress || null,
        siteAccessInfo || null,
        Number.isFinite(Number(siteAddressLat)) ? Number(siteAddressLat) : null,
        Number.isFinite(Number(siteAddressLng)) ? Number(siteAddressLng) : null,
        siteAddressQuery || null,
        logisticsInstructions || null,
        specialInstructions || null,
        criticalAreas || null,
        monitoringPersonnel || null,
        JSON.stringify(notificationCircumstancesValue),
        JSON.stringify(coverageHoursValue),
        coverageTimeZoneValue || null,
        coverageStatHolidaysRequiredValue,
        emergencyContactInstructions || null,
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
      if (fulfilledAt && inventoryIds.length) {
        const actualStart = fulfilledAt;
        const actualEnd = returnedAt || endAt;
        const startMs = Date.parse(actualStart);
        const endMs = Date.parse(actualEnd);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          const err = new Error("Actual return time must be after pickup time.");
          err.code = "invalid_actual_dates";
          throw err;
        }
        const conflicts = await findPickupConflicts({
          client,
          companyId,
          equipmentIds: inventoryIds,
          orderId,
          startAt: actualStart,
          endAt: actualEnd,
        });
        if (conflicts.length) {
          throw createPickupConflictError(conflicts);
        }
      }
      const qty = bundleData ? 1 : inventoryIds.length;
      const isRerent = !!String(item.unitDescription || item.unit_description || "").trim();
      const effectiveQty = bundleData ? 1 : (qty ? qty : isRerent ? 1 : (demandOnly ? 1 : 0));
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
          (line_item_id, before_notes, after_notes, unit_description, before_images, after_images, pause_periods, ai_report_markdown, ai_report_generated_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)
        `,
        [
          lineItemId,
          item.beforeNotes || null,
          item.afterNotes || null,
          item.unitDescription || item.unit_description || null,
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
      const feeDate = normalizeDateOnly(fee.feeDate ?? fee.fee_date);
      await client.query(
        `INSERT INTO rental_order_fees (rental_order_id, name, amount, fee_date) VALUES ($1,$2,$3,$4)`,
        [orderId, name, Number.isFinite(amount) ? amount : 0, feeDate]
      );
    }

    await recomputeMonthlyRecurringForOrder({
      client,
      companyId,
      orderId,
      orderStatus: effectiveStatus,
      settings,
    });

    await insertRentalOrderAudit({
      client,
      companyId,
      orderId,
      actorName,
      actorEmail,
      action: "create",
        summary: `Created ${isQuoteStatus(effectiveStatus) ? "quote" : "rental order"}.`,
        changes: {
          status: effectiveStatus,
          customerId,
          pickupLocationId: pickupLocationId || null,
          salespersonId: salespersonId || null,
          fulfillmentMethod: fulfillmentMethod || "pickup",
          lineItemsCount: Array.isArray(lineItems) ? lineItems.length : 0,
          feesCount: Array.isArray(fees) ? fees.length : 0,
        },
      });

    await client.query("COMMIT");
      return {
        id: orderId,
        quoteNumber: headerRes.rows[0].quote_number,
        roNumber: headerRes.rows[0].ro_number,
        status: effectiveStatus,
      };
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
  siteName,
  siteAddress,
  siteAccessInfo,
  siteAddressLat,
  siteAddressLng,
  siteAddressQuery,
  logisticsInstructions,
  specialInstructions,
  criticalAreas,
  monitoringPersonnel,
  notificationCircumstances,
  coverageHours,
  coverageTimeZone,
  coverageStatHolidaysRequired,
  emergencyContacts,
  emergencyContactInstructions,
  siteContacts,
  lineItems = [],
  fees = [],
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
      const settings = await getCompanySettings(companyId);
      const effectiveStatus = overrideStatusFromLineItems(status, lineItems);
      const demandOnly = isDemandOnlyStatus(effectiveStatus);
      const allowsInventory = allowsInventoryAssignment(effectiveStatus);
    const emergencyContactList = normalizeOrderContacts(emergencyContacts);
    const siteContactList = normalizeOrderContacts(siteContacts);
    const notificationCircumstancesValue = normalizeNotificationCircumstances(notificationCircumstances);
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
      `SELECT quote_number, ro_number, status, customer_id, pickup_location_id, salesperson_id, fulfillment_method, coverage_timezone
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
      if (isQuoteStatus(effectiveStatus) && !quoteNumber) {
        quoteNumber = await nextDocumentNumber(client, companyId, "QO");
      }
      if (!isQuoteStatus(effectiveStatus) && !roNumber) {
        roNumber = await nextDocumentNumber(client, companyId, "RO");
      }
    const coverageTimeZoneValue = normalizeCoverageTimeZone(
      coverageTimeZone,
      existing.coverage_timezone || settings?.billing_timezone
    );
    const coverageStatHolidaysRequiredValue = coverageStatHolidaysRequired === true;
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
             site_name = $12,
             site_address = $13,
             site_access_info = $14,
             site_address_lat = $15,
             site_address_lng = $16,
             site_address_query = $17,
             logistics_instructions = $18,
             special_instructions = $19,
             critical_areas = $20,
             monitoring_personnel = $21,
             notification_circumstances = $22::jsonb,
             coverage_hours = $23::jsonb,
             coverage_timezone = $24,
             coverage_stat_holidays_required = $25,
             emergency_contact_instructions = $26,
             emergency_contacts = $27::jsonb,
             site_contacts = $28::jsonb,
             updated_at = NOW()
       WHERE id = $29 AND company_id = $30
       RETURNING id, quote_number, ro_number
      `,
      [
        quoteNumber,
        roNumber,
        customerId,
        customerPo || null,
        salespersonId || null,
        fulfillmentMethod || "pickup",
          effectiveStatus,
        terms || null,
        generalNotes || null,
        pickupLocationId || null,
        fulfillmentMethod === "dropoff" ? (dropoffAddress || null) : null,
        siteName || null,
        siteAddress || null,
        siteAccessInfo || null,
        Number.isFinite(Number(siteAddressLat)) ? Number(siteAddressLat) : null,
        Number.isFinite(Number(siteAddressLng)) ? Number(siteAddressLng) : null,
        siteAddressQuery || null,
        logisticsInstructions || null,
        specialInstructions || null,
        criticalAreas || null,
        monitoringPersonnel || null,
        JSON.stringify(notificationCircumstancesValue),
        JSON.stringify(coverageHoursValue),
        coverageTimeZoneValue || null,
        coverageStatHolidaysRequiredValue,
        emergencyContactInstructions || null,
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
      if (fulfilledAt && inventoryIds.length) {
        const actualStart = fulfilledAt;
        const actualEnd = returnedAt || endAt;
        const startMs = Date.parse(actualStart);
        const endMs = Date.parse(actualEnd);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
          const err = new Error("Actual return time must be after pickup time.");
          err.code = "invalid_actual_dates";
          throw err;
        }
        const conflicts = await findPickupConflicts({
          client,
          companyId,
          equipmentIds: inventoryIds,
          orderId: id,
          startAt: actualStart,
          endAt: actualEnd,
        });
        if (conflicts.length) {
          throw createPickupConflictError(conflicts);
        }
      }
      const qty = bundleData ? 1 : inventoryIds.length;
      const isRerent = !!String(item.unitDescription || item.unit_description || "").trim();
      const effectiveQty = bundleData ? 1 : (qty ? qty : isRerent ? 1 : (demandOnly ? 1 : 0));
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
          (line_item_id, before_notes, after_notes, unit_description, before_images, after_images, pause_periods, ai_report_markdown, ai_report_generated_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)
        `,
        [
          lineItemId,
          item.beforeNotes || null,
          item.afterNotes || null,
          item.unitDescription || item.unit_description || null,
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
      const feeDate = normalizeDateOnly(fee.feeDate ?? fee.fee_date);
      const feeId = Number(fee.id);
      if (Number.isFinite(feeId) && existingFeeIds.has(feeId)) {
        await client.query(
          `UPDATE rental_order_fees SET name = $1, amount = $2, fee_date = $3 WHERE id = $4 AND rental_order_id = $5`,
          [name, Number.isFinite(amount) ? amount : 0, feeDate, feeId, id]
        );
        keepFeeIds.add(feeId);
      } else {
        const insertRes = await client.query(
          `INSERT INTO rental_order_fees (rental_order_id, name, amount, fee_date) VALUES ($1,$2,$3,$4) RETURNING id`,
          [id, name, Number.isFinite(amount) ? amount : 0, feeDate]
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

    await recomputeMonthlyRecurringForOrder({
      client,
      companyId,
      orderId: id,
      orderStatus: effectiveStatus,
      settings,
    });

    const before = {
      status: existing.status,
      customerId: existing.customer_id,
      pickupLocationId: existing.pickup_location_id,
      salespersonId: existing.salesperson_id,
      fulfillmentMethod: existing.fulfillment_method,
    };
      const after = {
        status: effectiveStatus,
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
        status: effectiveStatus,
        statusChanged: prevStatus !== effectiveStatus,
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
  let quoteNumberOut = null;
  let roNumberOut = null;
  let statusOut = null;
  let prevStatusOut = null;
  let statusChangedOut = false;
  try {
    await client.query("BEGIN");
    const normalizedStatus = normalizeRentalOrderStatus(status);
    const allowsInventory = allowsInventoryAssignment(normalizedStatus);
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

    // If an order is closed, clamp any future line-item end dates to now so availability
    // reflects the closure.
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

    const statusSettings = await getCompanySettings(companyId).catch(() => null);
    await recomputeMonthlyRecurringForOrder({
      client,
      companyId,
      orderId: id,
      orderStatus: normalizedStatus,
      settings: statusSettings,
    });

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

  return {
    id,
    quoteNumber: quoteNumberOut,
    roNumber: roNumberOut,
    status: statusOut,
    prevStatus: prevStatusOut,
    statusChanged: statusChangedOut,
  };
}

async function deleteRentalOrder({ id, companyId }) {
  const cid = Number(companyId);
  const oid = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(oid) || oid <= 0) throw new Error("id is required.");

  const existingRes = await pool.query(
    `SELECT status FROM rental_orders WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [oid, cid]
  );
  const existing = existingRes.rows?.[0] || null;
  if (!existing) return { deleted: false, notFound: true };

  const normalized = normalizeRentalOrderStatus(existing.status);
  if (normalized === "closed") {
    const err = new Error("Closed rental orders cannot be deleted.");
    err.code = "rental_order_closed";
    throw err;
  }

  await pool.query(`DELETE FROM rental_orders WHERE id = $1 AND company_id = $2`, [oid, cid]);
  return { deleted: true };
}

async function updateRentalOrderSiteAddress({ companyId, orderId, siteAddress, siteAddressLat, siteAddressLng, siteAddressQuery }) {
  const res = await pool.query(
    `
    UPDATE rental_orders
       SET site_address = $1,
           site_address_lat = $2,
           site_address_lng = $3,
           site_address_query = $4,
           updated_at = NOW()
     WHERE id = $5 AND company_id = $6
     RETURNING id, site_address, site_address_lat, site_address_lng, site_address_query, updated_at
    `,
    [
      siteAddress || null,
      Number.isFinite(Number(siteAddressLat)) ? Number(siteAddressLat) : null,
      Number.isFinite(Number(siteAddressLng)) ? Number(siteAddressLng) : null,
      siteAddressQuery || null,
      orderId,
      companyId,
    ]
  );
  return res.rows[0] || null;
}

function normalizeDispatchNoteImages(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry === "object");
}

async function listDispatchNotes({ companyId, orderId, equipmentId = null, lineItemId = null }) {
  const values = [companyId, orderId];
  let idx = 3;
  let where = "company_id = $1 AND rental_order_id = $2";
  if (Number.isFinite(Number(equipmentId))) {
    where += ` AND equipment_id = $${idx++}`;
    values.push(Number(equipmentId));
  }
  if (Number.isFinite(Number(lineItemId))) {
    where += ` AND line_item_id = $${idx++}`;
    values.push(Number(lineItemId));
  }
  const res = await pool.query(
    `
    SELECT id,
           rental_order_id,
           equipment_id,
           line_item_id,
           user_name,
           note,
           images,
           created_at,
           updated_at
      FROM rental_order_dispatch_notes
     WHERE ${where}
     ORDER BY created_at
    `,
    values
  );
  return res.rows;
}

async function addDispatchNote({ companyId, orderId, equipmentId = null, lineItemId = null, userName, note, images = [] }) {
  const payload = JSON.stringify(normalizeDispatchNoteImages(images));
  const res = await pool.query(
    `
    INSERT INTO rental_order_dispatch_notes (
      company_id,
      rental_order_id,
      equipment_id,
      line_item_id,
      user_name,
      note,
      images
    )
    SELECT $1, ro.id, $2, $3, $4, $5, $6::jsonb
      FROM rental_orders ro
     WHERE ro.id = $7 AND ro.company_id = $1
     RETURNING id, rental_order_id, equipment_id, line_item_id, user_name, note, images, created_at, updated_at
    `,
    [companyId, Number(equipmentId) || null, Number(lineItemId) || null, userName, note, payload, orderId]
  );
  return res.rows[0] || null;
}

async function updateDispatchNote({ companyId, noteId, note, images = [] }) {
  const payload = JSON.stringify(normalizeDispatchNoteImages(images));
  const res = await pool.query(
    `
    UPDATE rental_order_dispatch_notes
       SET note = $1,
           images = $2::jsonb,
           updated_at = NOW()
     WHERE id = $3
       AND company_id = $4
     RETURNING id, rental_order_id, equipment_id, line_item_id, user_name, note, images, created_at, updated_at
    `,
    [note, payload, noteId, companyId]
  );
  return res.rows[0] || null;
}

async function deleteDispatchNote({ companyId, noteId }) {
  await pool.query(`DELETE FROM rental_order_dispatch_notes WHERE id = $1 AND company_id = $2`, [noteId, companyId]);
  return { deleted: true };
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
    SELECT d.id, d.file_name, d.mime, d.size_bytes, d.url, d.category, d.created_at
      FROM customer_documents d
      JOIN customers c ON c.id = d.customer_id
     WHERE d.customer_id = $1 AND c.company_id = $2
     ORDER BY d.created_at ASC, d.id ASC
    `,
    [customer, cid]
  );
  return result.rows || [];
}

async function addCustomerDocument({ companyId, customerId, fileName, mime, sizeBytes, url, category = null }) {
  const cid = Number(companyId);
  const customer = Number(customerId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(customer) || customer <= 0) throw new Error("customerId is required.");
  const cleanName = String(fileName || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!cleanName || !cleanUrl) throw new Error("fileName and url are required.");

  const result = await pool.query(
    `
    INSERT INTO customer_documents (customer_id, file_name, mime, size_bytes, url, category)
    SELECT c.id, $1, $2, $3, $4, $5
      FROM customers c
     WHERE c.id = $6 AND c.company_id = $7
     RETURNING id, file_name, mime, size_bytes, url, category, created_at
    `,
    [cleanName, mime || null, sizeBytes || null, cleanUrl, category ? String(category).trim() : null, customer, cid]
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

function normalizeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return value && typeof value === "object" ? value : [];
}

function normalizeTypeDocuments(value) {
  const list = normalizeJsonArray(value);
  if (!Array.isArray(list)) return [];
  return list
    .map((doc) => {
      if (!doc) return null;
      if (typeof doc === "string") return { url: doc };
      if (typeof doc !== "object") return null;
      const url = String(doc.url || "").trim();
      if (!url) return null;
      const sizeRaw = doc.sizeBytes ?? doc.size_bytes;
      const sizeNum = Number(sizeRaw);
      return {
        url,
        fileName: doc.fileName || doc.file_name || null,
        mime: doc.mime || doc.mimetype || null,
        sizeBytes: Number.isFinite(sizeNum) ? sizeNum : null,
      };
    })
    .filter(Boolean);
}

function normalizeJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

async function createCustomerShareLink({
  companyId,
  customerId = null,
  rentalOrderId = null,
  scope,
  tokenHash,
  allowedFields = [],
  allowedLineItemFields = [],
  allowedDocumentCategories = [],
  termsText = null,
  requireEsignature = true,
  singleUse = false,
  expiresAt = null,
  createdByUserId = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const token = String(tokenHash || "").trim();
  if (!token) throw new Error("tokenHash is required.");
  const normalizedCustomerId = Number(customerId);
  const normalizedRentalOrderId = Number(rentalOrderId);
  const res = await pool.query(
    `
    INSERT INTO customer_share_links
      (company_id, customer_id, rental_order_id, scope, token_hash, allowed_fields, allowed_line_item_fields, allowed_document_categories, terms_text, require_esignature, single_use, expires_at, created_by_user_id)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11,$12::timestamptz,$13)
    RETURNING id, company_id, customer_id, rental_order_id, scope, allowed_fields, allowed_line_item_fields, allowed_document_categories, terms_text, require_esignature, single_use, expires_at, created_at, used_at, revoked_at, last_change_request_id
    `,
    [
      cid,
      Number.isFinite(normalizedCustomerId) && normalizedCustomerId > 0 ? normalizedCustomerId : null,
      Number.isFinite(normalizedRentalOrderId) && normalizedRentalOrderId > 0 ? normalizedRentalOrderId : null,
      String(scope || "").trim(),
      token,
      JSON.stringify(allowedFields || []),
      JSON.stringify(allowedLineItemFields || []),
      JSON.stringify(allowedDocumentCategories || []),
      termsText ? String(termsText) : null,
      requireEsignature === true,
      singleUse === true,
      expiresAt ? normalizeTimestamptz(expiresAt) : null,
      Number.isFinite(Number(createdByUserId)) ? Number(createdByUserId) : null,
    ]
  );
  return res.rows?.[0] || null;
}

async function getCustomerShareLinkByHash(tokenHash) {
  const token = String(tokenHash || "").trim();
  if (!token) return null;
  const res = await pool.query(
    `
    SELECT id, company_id, customer_id, rental_order_id, scope, token_hash, allowed_fields, allowed_line_item_fields, allowed_document_categories, terms_text,
           require_esignature, single_use, expires_at, created_at, used_at, revoked_at, last_used_ip, last_used_user_agent, last_change_request_id
      FROM customer_share_links
     WHERE token_hash = $1
     LIMIT 1
    `,
    [token]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    customer_id: row.customer_id === null ? null : Number(row.customer_id),
    rental_order_id: row.rental_order_id === null ? null : Number(row.rental_order_id),
    scope: row.scope || null,
    allowed_fields: normalizeJsonArray(row.allowed_fields),
    allowed_line_item_fields: normalizeJsonArray(row.allowed_line_item_fields),
    allowed_document_categories: normalizeJsonArray(row.allowed_document_categories),
    terms_text: row.terms_text || null,
    require_esignature: row.require_esignature === true,
    single_use: row.single_use === true,
    expires_at: row.expires_at || null,
    created_at: row.created_at || null,
    used_at: row.used_at || null,
    revoked_at: row.revoked_at || null,
    last_used_ip: row.last_used_ip || null,
    last_used_user_agent: row.last_used_user_agent || null,
    last_change_request_id: row.last_change_request_id === null ? null : Number(row.last_change_request_id),
  };
}

async function markCustomerShareLinkUsed({ linkId, ip = null, userAgent = null, changeRequestId = null } = {}) {
  const id = Number(linkId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("linkId is required.");
  const res = await pool.query(
    `
    UPDATE customer_share_links
       SET used_at = COALESCE(used_at, NOW()),
           last_used_ip = $1,
           last_used_user_agent = $2,
           last_change_request_id = COALESCE($3, last_change_request_id)
     WHERE id = $4
     RETURNING id, used_at, last_change_request_id
    `,
    [ip || null, userAgent || null, Number.isFinite(Number(changeRequestId)) ? Number(changeRequestId) : null, id]
  );
  return res.rows?.[0] || null;
}

async function revokeCustomerShareLink({ companyId, linkId }) {
  const cid = Number(companyId);
  const id = Number(linkId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(id) || id <= 0) throw new Error("linkId is required.");
  const res = await pool.query(
    `UPDATE customer_share_links SET revoked_at = NOW() WHERE id = $1 AND company_id = $2 RETURNING id, revoked_at`,
    [id, cid]
  );
  return res.rows?.[0] || null;
}

async function createCustomerChangeRequest({
  companyId,
  customerId = null,
  rentalOrderId = null,
  linkId = null,
  scope,
  status = "pending",
  payload = {},
  documents = [],
  signature = {},
  proofPdfPath = null,
  sourceIp = null,
  userAgent = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const normalizedStatus = String(status || "pending").trim().toLowerCase();
  const normalizedCustomerId = normalizeCustomerId(customerId);
  const normalizedRentalOrderId = Number(rentalOrderId);
  const normalizedLinkId = Number(linkId);
  const res = await pool.query(
    `
    INSERT INTO customer_change_requests
      (company_id, customer_id, rental_order_id, link_id, scope, status, payload, documents, signature, proof_pdf_path, source_ip, user_agent)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12)
    RETURNING id, company_id, customer_id, rental_order_id, link_id, scope, status, payload, documents, signature, proof_pdf_path, submitted_at
    `,
    [
      cid,
      normalizedCustomerId,
      Number.isFinite(normalizedRentalOrderId) && normalizedRentalOrderId > 0
        ? normalizedRentalOrderId
        : null,
      Number.isFinite(normalizedLinkId) && normalizedLinkId > 0 ? normalizedLinkId : null,
      String(scope || "").trim(),
      normalizedStatus,
      JSON.stringify(payload || {}),
      JSON.stringify(documents || []),
      JSON.stringify(signature || {}),
      proofPdfPath ? String(proofPdfPath) : null,
      sourceIp || null,
      userAgent || null,
    ]
  );
  return res.rows?.[0] || null;
}

async function updateCustomerChangeRequestStatus({
  companyId,
  id,
  status,
  reviewedByUserId = null,
  reviewNotes = null,
  appliedCustomerId = undefined,
  appliedOrderId = undefined,
  customerReviewStatus = undefined,
  orderReviewStatus = undefined,
  proofPdfPath = undefined,
} = {}) {
  const cid = Number(companyId);
  const reqId = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(reqId) || reqId <= 0) throw new Error("id is required.");
  const updates = [];
  const params = [];
  const push = (sql, value) => {
    params.push(value);
    updates.push(`${sql} $${params.length}`);
  };
  if (status) push("status =", String(status).trim().toLowerCase());
  if (reviewedByUserId !== null) push("reviewed_by_user_id =", Number(reviewedByUserId));
  if (reviewNotes !== null) push("review_notes =", reviewNotes ? String(reviewNotes) : null);
  if (appliedCustomerId !== undefined) {
    push("applied_customer_id =", appliedCustomerId === null ? null : Number(appliedCustomerId));
  }
  if (appliedOrderId !== undefined) {
    push("applied_order_id =", appliedOrderId === null ? null : Number(appliedOrderId));
  }
  if (customerReviewStatus !== undefined) push("customer_review_status =", customerReviewStatus ? String(customerReviewStatus).trim().toLowerCase() : null);
  if (orderReviewStatus !== undefined) push("order_review_status =", orderReviewStatus ? String(orderReviewStatus).trim().toLowerCase() : null);
  if (proofPdfPath !== undefined) push("proof_pdf_path =", proofPdfPath ? String(proofPdfPath) : null);
  if (customerReviewStatus !== undefined) updates.push("customer_reviewed_at = NOW()");
  if (orderReviewStatus !== undefined) updates.push("order_reviewed_at = NOW()");
  const shouldSetReviewedAt =
    (status && String(status).trim() && String(status).trim().toLowerCase() !== "pending") ||
    reviewedByUserId !== null ||
    reviewNotes !== null;
  if (shouldSetReviewedAt) updates.push("reviewed_at = COALESCE(reviewed_at, NOW())");
  if (!updates.length) return null;
  params.push(reqId, cid);
  const res = await pool.query(
    `
    UPDATE customer_change_requests
       SET ${updates.join(", ")}
     WHERE id = $${params.length - 1} AND company_id = $${params.length}
     RETURNING id, status, reviewed_at, reviewed_by_user_id, review_notes, applied_customer_id, applied_order_id, proof_pdf_path, customer_review_status, order_review_status, customer_reviewed_at, order_reviewed_at
    `,
    params
  );
  return res.rows?.[0] || null;
}

async function listCustomerChangeRequests({ companyId, status = null, customerId = null, rentalOrderId = null, limit = 200, offset = 0 } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const params = [cid];
  const where = ["r.company_id = $1"];
  if (status) {
    params.push(String(status).trim().toLowerCase());
    where.push(`LOWER(TRIM(r.status)) = $${params.length}`);
  }
  const normalizedCustomerId = Number(customerId);
  if (Number.isFinite(normalizedCustomerId) && normalizedCustomerId > 0) {
    params.push(normalizedCustomerId);
    where.push(`r.customer_id = $${params.length}`);
  }
  const normalizedRentalOrderId = Number(rentalOrderId);
  if (Number.isFinite(normalizedRentalOrderId) && normalizedRentalOrderId > 0) {
    params.push(normalizedRentalOrderId);
    where.push(`r.rental_order_id = $${params.length}`);
  }
  params.push(Math.max(1, Math.min(500, Number(limit) || 200)));
  params.push(Math.max(0, Number(offset) || 0));
  const res = await pool.query(
    `
    SELECT r.id,
           r.scope,
           r.status,
           r.customer_review_status,
           r.order_review_status,
           r.customer_id,
           r.rental_order_id,
           r.link_id,
           r.submitted_at,
           r.reviewed_at,
           c.company_name AS customer_name,
           ro.quote_number,
           ro.ro_number,
           ro.status AS order_status
      FROM customer_change_requests r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN rental_orders ro ON ro.id = r.rental_order_id
     WHERE ${where.join(" AND ")}
     ORDER BY r.submitted_at DESC, r.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );
  return res.rows || [];
}

async function getCustomerChangeRequest({ companyId, id }) {
  const cid = Number(companyId);
  const reqId = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(reqId) || reqId <= 0) throw new Error("id is required.");
  const res = await pool.query(
    `
    SELECT id, company_id, customer_id, rental_order_id, link_id, scope, status, customer_review_status, order_review_status, customer_reviewed_at, order_reviewed_at, payload, documents, signature, proof_pdf_path, submitted_at, reviewed_at, reviewed_by_user_id, review_notes, applied_customer_id, applied_order_id
      FROM customer_change_requests
     WHERE id = $1 AND company_id = $2
     LIMIT 1
    `,
    [reqId, cid]
  );
  const row = res.rows?.[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    customer_id: row.customer_id === null ? null : Number(row.customer_id),
    rental_order_id: row.rental_order_id === null ? null : Number(row.rental_order_id),
    link_id: row.link_id === null ? null : Number(row.link_id),
    scope: row.scope || null,
    status: row.status || null,
    customer_review_status: row.customer_review_status || null,
    order_review_status: row.order_review_status || null,
    customer_reviewed_at: row.customer_reviewed_at || null,
    order_reviewed_at: row.order_reviewed_at || null,
    payload: normalizeJsonObject(row.payload),
    documents: normalizeJsonArray(row.documents),
    signature: normalizeJsonObject(row.signature),
    proof_pdf_path: row.proof_pdf_path || null,
    submitted_at: row.submitted_at || null,
    reviewed_at: row.reviewed_at || null,
    reviewed_by_user_id: row.reviewed_by_user_id === null ? null : Number(row.reviewed_by_user_id),
    review_notes: row.review_notes || null,
    applied_customer_id: row.applied_customer_id === null ? null : Number(row.applied_customer_id),
    applied_order_id: row.applied_order_id === null ? null : Number(row.applied_order_id),
  };
}

async function getLatestCustomerChangeRequestForLink({ companyId, linkId }) {
  const cid = Number(companyId);
  const lid = Number(linkId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(lid) || lid <= 0) throw new Error("linkId is required.");
  const res = await pool.query(
    `
    SELECT id, proof_pdf_path, status, submitted_at
      FROM customer_change_requests
     WHERE company_id = $1 AND link_id = $2
     ORDER BY submitted_at DESC, id DESC
     LIMIT 1
    `,
    [cid, lid]
  );
  return res.rows?.[0] || null;
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
       AND (
         (ebi.bundle_id IS NULL AND e.type_id = $2)
         OR (
           ebi.bundle_id IS NOT NULL
           AND (
             e.type_id = $2
             OR EXISTS (
               SELECT 1
                 FROM equipment_bundle_items bi2
                 JOIN equipment e2 ON e2.id = bi2.equipment_id
                WHERE bi2.bundle_id = ebi.bundle_id
                  AND e2.type_id = $2
             )
           )
         )
       )
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
       AND (
         ebi.bundle_id IS NULL
         OR NOT EXISTS (
           SELECT 1
             FROM equipment_bundle_items bi2
             JOIN equipment_out_of_service eos ON eos.equipment_id = bi2.equipment_id
            WHERE bi2.bundle_id = ebi.bundle_id
              AND eos.company_id = $1
              AND tstzrange(
                eos.start_at,
                COALESCE(eos.end_at, 'infinity'::timestamptz),
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
       AND NOT EXISTS (
         SELECT 1
           FROM equipment_out_of_service eos
          WHERE eos.company_id = $1
            AND eos.equipment_id = e.id
            AND tstzrange(
              eos.start_at,
              COALESCE(eos.end_at, 'infinity'::timestamptz),
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
  if (conflicts > 0) return { available: false, items };

  const serviceConflictRes = await pool.query(
    `
    SELECT COUNT(*)::int AS conflicts
      FROM equipment_out_of_service eos
     WHERE eos.company_id = $1
       AND eos.equipment_id = ANY($2::int[])
       AND tstzrange(
         eos.start_at,
         COALESCE(eos.end_at, 'infinity'::timestamptz),
         '[)'
       ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
    `,
    [companyId, equipmentIds, start, end]
  );
  const serviceConflicts = Number(serviceConflictRes.rows?.[0]?.conflicts || 0);
  return { available: serviceConflicts === 0, items };
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
       AND NOT EXISTS (
         SELECT 1
           FROM equipment_out_of_service eos
          WHERE eos.company_id = $1
            AND eos.equipment_id = equipment.id
            AND tstzrange(
              eos.start_at,
              COALESCE(eos.end_at, 'infinity'::timestamptz),
              '[)'
            ) && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       )
    `,
    [companyId, typeId, start, end]
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
          COALESCE(NULLIF(et.image_urls, '[]'::jsonb)->>0, et.image_url) AS image_url,
          et.image_urls,
          et.documents,
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
        c.website AS company_website,
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
    return result.rows.map((row) => {
      const imageUrls = Array.isArray(row.image_urls)
        ? row.image_urls.filter(Boolean).map((url) => String(url))
        : [];
      const primaryImageUrl = row.image_url ? String(row.image_url) : null;
      if (primaryImageUrl && !imageUrls.includes(primaryImageUrl)) {
        imageUrls.unshift(primaryImageUrl);
      }

      return {
      typeId: Number(row.type_id),
      typeName: row.type_name,
      imageUrl: imageUrls[0] || null,
      imageUrls,
      documents: normalizeTypeDocuments(row.documents),
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
        website: row.company_website || null,
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
  };
  });
}

async function listStorefrontSaleListings({
  equipment = null,
  company = null,
  location = null,
  limit = 48,
  offset = 0,
} = {}) {
  const equipmentTokens = normalizeSearchTokens(equipment);
  const companyTokens = normalizeSearchTokens(company);
  const locationTokens = normalizeSearchTokens(location);

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 48));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const params = [];
  const where = [
    "so.status = 'open'",
    "so.equipment_id IS NOT NULL",
    "e.id IS NOT NULL",
    "(e.serial_number IS NULL OR e.serial_number NOT ILIKE 'UNALLOCATED-%')",
    "(e.condition IS NULL OR e.condition NOT IN ('Lost','Unusable'))",
  ];

  for (const token of equipmentTokens) {
    params.push(token);
    const idx = params.length;
    where.push(
      `(e.model_name ILIKE $${idx} ESCAPE '\\' OR e.serial_number ILIKE $${idx} ESCAPE '\\' OR e.type ILIKE $${idx} ESCAPE '\\' OR et.name ILIKE $${idx} ESCAPE '\\' OR so.description ILIKE $${idx} ESCAPE '\\')`
    );
  }

  for (const token of companyTokens) {
    params.push(token);
    const idx = params.length;
    where.push(`(c.name ILIKE $${idx} ESCAPE '\\')`);
  }

  for (const token of locationTokens) {
    params.push(token);
    const idx = params.length;
    where.push(
      `(
        c.city ILIKE $${idx} ESCAPE '\\'
        OR c.region ILIKE $${idx} ESCAPE '\\'
        OR c.country ILIKE $${idx} ESCAPE '\\'
        OR l.name ILIKE $${idx} ESCAPE '\\'
        OR l.city ILIKE $${idx} ESCAPE '\\'
        OR l.region ILIKE $${idx} ESCAPE '\\'
        OR l.country ILIKE $${idx} ESCAPE '\\'
      )`
    );
  }

  const sql = `
    SELECT
      so.id AS sale_id,
      so.equipment_id,
      so.status,
      so.sale_price,
      so.description,
      so.image_url AS sale_image_url,
      so.image_urls AS sale_image_urls,
      so.documents,
      e.model_name,
      e.serial_number,
      e.type AS equipment_type,
      e.type_id AS equipment_type_id,
      e.image_url AS equipment_image_url,
      e.image_urls AS equipment_image_urls,
      et.name AS type_name,
      et.image_url AS type_image_url,
      et.image_urls AS type_image_urls,
      cat.name AS category_name,
      c.id AS company_id,
      c.name AS company_name,
      c.phone AS company_phone,
      c.contact_email AS company_email,
      c.website AS company_website,
      cs.logo_url AS company_logo_url,
      c.street_address AS company_street_address,
      c.city AS company_city,
      c.region AS company_region,
      c.country AS company_country,
      c.postal_code AS company_postal_code,
      l.id AS location_id,
      l.name AS location_name,
      l.street_address AS location_street_address,
      l.city AS location_city,
      l.region AS location_region,
      l.country AS location_country
    FROM sales_orders so
    JOIN companies c ON c.id = so.company_id
    LEFT JOIN company_settings cs ON cs.company_id = c.id
    LEFT JOIN equipment e ON e.id = so.equipment_id
    LEFT JOIN equipment_types et ON et.id = e.type_id
    LEFT JOIN equipment_categories cat ON cat.id = et.category_id
    LEFT JOIN locations l ON l.id = COALESCE(e.current_location_id, e.location_id)
    WHERE ${where.join(" AND ")}
    ORDER BY so.updated_at DESC, so.id DESC
    LIMIT $${params.length + 1}
   OFFSET $${params.length + 2}
  `;

  const result = await pool.query(sql, [...params, safeLimit, safeOffset]);
  return (result.rows || []).map((row) => {
    const saleUrls = Array.isArray(row.sale_image_urls)
      ? row.sale_image_urls.filter(Boolean).map((url) => String(url))
      : [];
    const equipmentUrls = Array.isArray(row.equipment_image_urls)
      ? row.equipment_image_urls.filter(Boolean).map((url) => String(url))
      : [];
    const typeUrls = Array.isArray(row.type_image_urls)
      ? row.type_image_urls.filter(Boolean).map((url) => String(url))
      : [];
    let imageUrls = saleUrls.length ? saleUrls : equipmentUrls.length ? equipmentUrls : typeUrls;
    imageUrls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
    const primaryImageUrl =
      row.sale_image_url || row.equipment_image_url || row.type_image_url || imageUrls[0] || null;
    if (primaryImageUrl && !imageUrls.includes(primaryImageUrl)) {
      imageUrls.unshift(primaryImageUrl);
    }

    const locations = row.location_id
      ? [
          {
            id: Number(row.location_id),
            name: row.location_name || null,
            streetAddress: row.location_street_address || null,
            city: row.location_city || null,
            region: row.location_region || null,
            country: row.location_country || null,
          },
        ]
      : [];

    const unitName = row.model_name || row.type_name || row.equipment_type || "Unit";
    const serial = row.serial_number ? String(row.serial_number) : "";
    const unitLabel = serial ? `${unitName} (${serial})` : unitName;

    return {
      listingType: "sale",
      saleId: Number(row.sale_id),
      unitId: Number(row.equipment_id),
      unitLabel,
      typeId: Number(row.equipment_type_id || 0),
      typeName: unitName,
      imageUrl: imageUrls[0] || null,
      imageUrls,
      documents: normalizeTypeDocuments(row.documents),
      description: row.description || null,
      categoryName: row.category_name || null,
      salePrice: row.sale_price === null || row.sale_price === undefined ? null : Number(row.sale_price),
      company: {
        id: Number(row.company_id),
        name: row.company_name,
        email: row.company_email || null,
        phone: row.company_phone || null,
        website: row.company_website || null,
        logoUrl: row.company_logo_url || null,
        streetAddress: row.company_street_address || null,
        city: row.company_city || null,
        region: row.company_region || null,
        country: row.company_country || null,
        postalCode: row.company_postal_code || null,
      },
      stock: {
        totalUnits: 1,
        reservedUnits: 0,
        availableUnits: 1,
        locations,
      },
    };
  });
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
  contactGroups,
  followUpDate = null,
  notes = null,
  canChargeDeposit = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) throw new Error("email is required.");
  const cleanName = String(name || "").trim();
  if (!cleanName) throw new Error("name is required.");
  const cleanPassword = String(password || "");
  assertValidPassword(cleanPassword);

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
  const contactGroupMap = normalizeContactGroups(contactGroups);
  const primary = contactList[0] || {};
  const primaryName = normalizeContactField(primary.name) || normalizeContactField(cleanName);
  const primaryEmail = normalizeContactField(primary.email) || normalizeContactField(cleanEmail);
  const primaryPhone = normalizeContactField(primary.phone) || normalizeContactField(phone);
  const finalCompanyName = String(companyName || businessName || cleanName || cleanEmail).trim();
  const depositFlag = canChargeDeposit === true;
  const cleanedNotes = String(notes || "").trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let internalCustomerRow = null;
      const internalByEmail = await client.query(
        `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, contact_groups, can_charge_deposit, follow_up_date, notes
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
          `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, contact_groups, can_charge_deposit, follow_up_date, notes
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
            `SELECT id, company_name, contact_name, street_address, city, region, country, postal_code, email, phone, contacts, accounting_contacts, contact_groups, can_charge_deposit, follow_up_date, notes
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
        const isEmptyObject = (value) =>
          !value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0;
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
        if (isEmptyObject(normalizeContactGroups(internalCustomerRow.contact_groups)) && Object.keys(contactGroupMap).length) {
          updates.contact_groups = contactGroupMap;
        }
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
            contact_groups,
            can_charge_deposit,
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
            contactGroupMap,
            depositFlag,
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
  const idleDays = SESSION_IDLE_DAYS;
  const params = [tokenHash];
  const idleClause =
    idleDays > 0
      ? "AND COALESCE(s.last_used_at, s.created_at) > NOW() - ($2::text || ' days')::interval"
      : "";
  if (idleDays > 0) params.push(idleDays);
  const res = await pool.query(
    `
    WITH session AS (
      UPDATE storefront_customer_sessions s
      SET last_used_at = NOW()
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        ${idleClause}
      RETURNING s.customer_id
    )
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
    FROM session s
    JOIN storefront_customers c ON c.id = s.customer_id
    LIMIT 1
    `,
    params
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
  assertValidPassword(cleanPassword);

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
  const idleDays = SESSION_IDLE_DAYS;
  const params = [tokenHash];
  const idleClause =
    idleDays > 0
      ? "AND COALESCE(s.last_used_at, s.created_at) > NOW() - ($2::text || ' days')::interval"
      : "";
  if (idleDays > 0) params.push(idleDays);
  const res = await pool.query(
    `
    WITH session AS (
      UPDATE customer_account_sessions s
      SET last_used_at = NOW()
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        ${idleClause}
      RETURNING s.customer_account_id
    )
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
    FROM session s
    JOIN customer_accounts c ON c.id = s.customer_account_id
    LIMIT 1
    `,
    params
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
  siteName,
  siteAddress,
  siteAccessInfo,
  deliveryInstructions,
  criticalAreas,
  monitoringPersonnel,
  notificationCircumstances,
  generalNotes,
  generalNotesImages,
  emergencyContacts,
  emergencyContactInstructions,
  siteContacts,
  coverageHours,
  coverageTimeZone,
  coverageStatHolidaysRequired,
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
  const siteNameValue = useRentalInfoField("siteName") ? String(siteName || "").trim() || null : null;
  const siteAddressValue = useRentalInfoField("siteAddress") ? String(siteAddress || "").trim() || null : null;
  const siteAccessInfoValue = useRentalInfoField("siteAccessInfo") ? String(siteAccessInfo || "").trim() || null : null;
  const criticalAreasValue = useRentalInfoField("criticalAreas") ? String(criticalAreas || "").trim() || null : null;
  const monitoringPersonnelValue = useRentalInfoField("monitoringPersonnel")
    ? String(monitoringPersonnel || "").trim() || null
    : null;
  const notificationCircumstancesValue = useRentalInfoField("notificationCircumstances")
    ? normalizeNotificationCircumstances(notificationCircumstances)
    : [];
  const generalNotesValue = useRentalInfoField("generalNotes") ? String(generalNotes || "").trim() || null : null;
  const emergencyContactList = useRentalInfoField("emergencyContacts") ? normalizeOrderContacts(emergencyContacts) : [];
  const emergencyContactInstructionsValue = useRentalInfoField("emergencyContactInstructions")
    ? String(emergencyContactInstructions || "").trim() || null
    : null;
  const siteContactList = useRentalInfoField("siteContacts") ? normalizeOrderContacts(siteContacts) : [];
  const coverageHoursValue = useRentalInfoField("coverageHours") ? normalizeCoverageHours(coverageHours) : [];
  const coverageTimeZoneValue = normalizeCoverageTimeZone(coverageTimeZone, settings?.billing_timezone);
  const coverageStatHolidaysRequiredValue = useRentalInfoField("coverageHours") ? coverageStatHolidaysRequired === true : false;

  const missingRentalInfo = [];
  const contactIsValid = (list) =>
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((entry) => String(entry?.name || "").trim() && (String(entry?.email || "").trim() || String(entry?.phone || "").trim()));
  const coverageIsValid = (coverageValue) => {
    if (!coverageValue) return false;
    if (!Array.isArray(coverageValue)) return false;
    if (!coverageValue.length) return false;
    return coverageValue.every(
      (slot) =>
        slot &&
        String(slot.startDay || "").trim() &&
        String(slot.startTime || "").trim() &&
        String(slot.endDay || "").trim() &&
        String(slot.endTime || "").trim()
    );
  };

  if (rentalInfoFields?.siteAddress?.enabled && rentalInfoFields?.siteAddress?.required && !siteAddressValue) {
    missingRentalInfo.push("Site address");
  }
  if (rentalInfoFields?.siteName?.enabled && rentalInfoFields?.siteName?.required && !siteNameValue) {
    missingRentalInfo.push("Site name");
  }
  if (rentalInfoFields?.siteAccessInfo?.enabled && rentalInfoFields?.siteAccessInfo?.required && !siteAccessInfoValue) {
    missingRentalInfo.push("Site access information / pin");
  }
  if (rentalInfoFields?.criticalAreas?.enabled && rentalInfoFields?.criticalAreas?.required && !criticalAreasValue) {
    missingRentalInfo.push("Critical Assets and Locations on Site");
  }
  if (
    rentalInfoFields?.monitoringPersonnel?.enabled &&
    rentalInfoFields?.monitoringPersonnel?.required &&
    !monitoringPersonnelValue
  ) {
    missingRentalInfo.push("Personnel/contractors expected on site during monitoring hours");
  }
  if (
    rentalInfoFields?.notificationCircumstances?.enabled &&
    rentalInfoFields?.notificationCircumstances?.required &&
    !notificationCircumstancesValue.length
  ) {
    missingRentalInfo.push("Notification circumstance");
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
    rentalInfoFields?.emergencyContactInstructions?.enabled &&
    rentalInfoFields?.emergencyContactInstructions?.required &&
    !emergencyContactInstructionsValue
  ) {
    missingRentalInfo.push("Additional emergency contact instructions");
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

  const coverageDays = coverageHoursValue.length;

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
    monitoringPersonnel: monitoringPersonnelValue,
    notificationCircumstances: notificationCircumstancesValue,
    coverageHours: coverageHoursValue,
    coverageTimeZone: coverageTimeZoneValue,
    coverageStatHolidaysRequired: coverageStatHolidaysRequiredValue,
    emergencyContacts: emergencyContactList,
    emergencyContactInstructions: emergencyContactInstructionsValue,
    siteContacts: siteContactList,
    siteName: siteNameValue,
    siteAddress: siteAddressValue,
    siteAccessInfo: siteAccessInfoValue,
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

async function getQboConnection({ companyId } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    SELECT company_id,
           realm_id,
           access_token,
           refresh_token,
           access_token_expires_at,
           refresh_token_expires_at,
           scope,
           token_type,
           connected_at,
           updated_at
      FROM qbo_connections
     WHERE company_id = $1
     LIMIT 1
    `,
    [cid]
  );
  const row = res.rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    realm_id: decryptQboTokenValue(row.realm_id),
    access_token: decryptQboTokenValue(row.access_token),
    refresh_token: decryptQboTokenValue(row.refresh_token),
  };
}

async function findCompanyIdByQboRealmId({ realmId } = {}) {
  const raw = normalizeQboRealmId(realmId);
  if (!raw) return null;
  const realmHash = hashQboRealmId(raw);
  if (realmHash) {
    const res = await pool.query(
      `SELECT company_id FROM qbo_connections WHERE realm_id_hash = $1 LIMIT 1`,
      [realmHash]
    );
    const row = res.rows?.[0] || null;
    if (row?.company_id) return Number(row.company_id);
  }
  const legacy = await pool.query(
    `SELECT company_id FROM qbo_connections WHERE realm_id = $1 LIMIT 1`,
    [raw]
  );
  const legacyRow = legacy.rows?.[0] || null;
  if (legacyRow?.company_id) return Number(legacyRow.company_id);

  const missingHash = await pool.query(
    `SELECT company_id, realm_id FROM qbo_connections WHERE realm_id_hash IS NULL OR realm_id_hash = ''`
  );
  for (const row of missingHash.rows || []) {
    let decrypted = "";
    try {
      decrypted = decryptQboTokenValue(row.realm_id);
    } catch {
      continue;
    }
    if (decrypted !== raw) continue;
    if (realmHash) {
      await pool.query(`UPDATE qbo_connections SET realm_id_hash = $1 WHERE company_id = $2`, [
        realmHash,
        row.company_id,
      ]);
    }
    return Number(row.company_id);
  }

  return null;
}

async function upsertQboConnection({
  companyId,
  realmId,
  accessToken,
  refreshToken,
  accessTokenExpiresAt = null,
  refreshTokenExpiresAt = null,
  scope = null,
  tokenType = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const cleanRealmId = normalizeQboRealmId(realmId);
  const encryptedRealmId = encryptQboTokenValue(cleanRealmId);
  const realmIdHash = hashQboRealmId(cleanRealmId);
  const encryptedAccessToken = encryptQboTokenValue(accessToken);
  const encryptedRefreshToken = encryptQboTokenValue(refreshToken);
  const res = await pool.query(
    `
    INSERT INTO qbo_connections
      (company_id, realm_id, realm_id_hash, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, scope, token_type)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (company_id)
    DO UPDATE SET realm_id = EXCLUDED.realm_id,
                  realm_id_hash = EXCLUDED.realm_id_hash,
                  access_token = EXCLUDED.access_token,
                  refresh_token = EXCLUDED.refresh_token,
                  access_token_expires_at = EXCLUDED.access_token_expires_at,
                  refresh_token_expires_at = EXCLUDED.refresh_token_expires_at,
                  scope = EXCLUDED.scope,
                  token_type = EXCLUDED.token_type,
                  updated_at = NOW()
    RETURNING company_id, realm_id, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, scope, token_type, connected_at, updated_at
    `,
    [
      cid,
      encryptedRealmId,
      realmIdHash,
      encryptedAccessToken,
      encryptedRefreshToken,
      accessTokenExpiresAt ? normalizeTimestamptz(accessTokenExpiresAt) : null,
      refreshTokenExpiresAt ? normalizeTimestamptz(refreshTokenExpiresAt) : null,
      scope ? String(scope) : null,
      tokenType ? String(tokenType) : null,
    ]
  );
  const row = res.rows[0] || null;
  if (!row) return null;
  return {
    ...row,
    realm_id: decryptQboTokenValue(row.realm_id),
    access_token: decryptQboTokenValue(row.access_token),
    refresh_token: decryptQboTokenValue(row.refresh_token),
  };
}

async function deleteQboConnection({ companyId } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  await pool.query(`DELETE FROM qbo_connections WHERE company_id = $1`, [cid]);
}

async function upsertQboDocument({
  companyId,
  rentalOrderId = null,
  entityType,
  entityId,
  docNumber = null,
  billingPeriod = null,
  txnDate = null,
  dueDate = null,
  totalAmount = null,
  balance = null,
  currencyCode = null,
  status = null,
  customerRef = null,
  source = "qbo",
  isVoided = false,
  isDeleted = false,
  lastUpdatedAt = null,
  raw = {},
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    INSERT INTO qbo_documents
      (company_id, rental_order_id, qbo_entity_type, qbo_entity_id, doc_number, billing_period, txn_date, due_date, total_amount, balance, currency_code, status, customer_ref, source, is_voided, is_deleted, last_updated_at, last_synced_at, raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), $18::jsonb)
    ON CONFLICT (company_id, qbo_entity_type, qbo_entity_id)
    DO UPDATE SET rental_order_id = EXCLUDED.rental_order_id,
                  doc_number = EXCLUDED.doc_number,
                  billing_period = EXCLUDED.billing_period,
                  txn_date = EXCLUDED.txn_date,
                  due_date = EXCLUDED.due_date,
                  total_amount = EXCLUDED.total_amount,
                  balance = EXCLUDED.balance,
                  currency_code = EXCLUDED.currency_code,
                  status = EXCLUDED.status,
                  customer_ref = EXCLUDED.customer_ref,
                  source = EXCLUDED.source,
                  is_voided = EXCLUDED.is_voided,
                  is_deleted = EXCLUDED.is_deleted,
                  last_updated_at = EXCLUDED.last_updated_at,
                  last_synced_at = NOW(),
                  raw = EXCLUDED.raw
    RETURNING *
    `,
    [
      cid,
      rentalOrderId ? Number(rentalOrderId) : null,
      String(entityType || "").trim(),
      String(entityId || "").trim(),
      docNumber ? String(docNumber) : null,
      billingPeriod ? String(billingPeriod) : null,
      txnDate ? String(txnDate) : null,
      dueDate ? String(dueDate) : null,
      Number.isFinite(Number(totalAmount)) ? Number(totalAmount) : null,
      Number.isFinite(Number(balance)) ? Number(balance) : null,
      currencyCode ? String(currencyCode) : null,
      status ? String(status) : null,
      customerRef ? String(customerRef) : null,
      source ? String(source) : "qbo",
      isVoided === true,
      isDeleted === true,
      lastUpdatedAt ? normalizeTimestamptz(lastUpdatedAt) : null,
      JSON.stringify(raw || {}),
    ]
  );
  return res.rows[0] || null;
}

async function markQboDocumentRemoved({
  companyId,
  entityType,
  entityId,
  isVoided = false,
  isDeleted = false,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  await pool.query(
    `
    UPDATE qbo_documents
       SET is_voided = $4,
           is_deleted = $5,
           last_synced_at = NOW()
     WHERE company_id = $1 AND qbo_entity_type = $2 AND qbo_entity_id = $3
    `,
    [cid, String(entityType || ""), String(entityId || ""), isVoided === true, isDeleted === true]
  );
}

async function listQboDocumentsForRentalOrder({ companyId, orderId } = {}) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(oid) || oid <= 0) throw new Error("orderId is required.");
  const res = await pool.query(
    `
    SELECT *
      FROM qbo_documents
     WHERE company_id = $1 AND rental_order_id = $2
     ORDER BY txn_date DESC NULLS LAST, created_at DESC
    `,
    [cid, oid]
  );
  return res.rows || [];
}

async function listQboDocumentsUnassigned({ companyId, limit = 50, offset = 0 } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const res = await pool.query(
    `
    SELECT *
      FROM qbo_documents
     WHERE company_id = $1 AND rental_order_id IS NULL
     ORDER BY txn_date DESC NULLS LAST, created_at DESC
     LIMIT $2 OFFSET $3
    `,
    [cid, lim, off]
  );
  return res.rows || [];
}

async function listQboDocuments({ companyId, assigned = null, search = null, limit = 50, offset = 0 } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const lim = Math.max(1, Math.min(200, Number(limit) || 50));
  const off = Math.max(0, Number(offset) || 0);
  const filters = ["d.company_id = $1"];
  const params = [cid];

  if (assigned === true) filters.push("d.rental_order_id IS NOT NULL");
  if (assigned === false) filters.push("d.rental_order_id IS NULL");

  if (search) {
    params.push(`%${String(search).trim()}%`);
    const idx = params.length;
    filters.push(
      `(d.doc_number ILIKE $${idx} OR d.qbo_entity_id ILIKE $${idx} OR d.customer_ref ILIKE $${idx} OR d.status ILIKE $${idx} OR ro.ro_number ILIKE $${idx})`
    );
  }

  params.push(lim, off);
  const res = await pool.query(
    `
    SELECT d.*,
           ro.ro_number,
           COALESCE(ro.customer_id, qbo_customer.id) AS customer_id
      FROM qbo_documents d
 LEFT JOIN rental_orders ro ON ro.id = d.rental_order_id
 LEFT JOIN LATERAL (
           SELECT c.id
             FROM customers c
            WHERE c.company_id = d.company_id
              AND c.qbo_customer_id = d.customer_ref
            ORDER BY c.id
            LIMIT 1
       ) qbo_customer ON true
     WHERE ${filters.join(" AND ")}
     ORDER BY d.txn_date DESC NULLS LAST, d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}
    `,
    params
  );
  return res.rows || [];
}

async function getQboDocument({ companyId, id } = {}) {
  const cid = Number(companyId);
  const docId = Number(id);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(docId) || docId <= 0) throw new Error("id is required.");
  const res = await pool.query(
    `
    SELECT d.*,
           ro.ro_number,
           COALESCE(ro.customer_id, qbo_customer.id) AS customer_id
      FROM qbo_documents d
 LEFT JOIN rental_orders ro ON ro.id = d.rental_order_id
 LEFT JOIN LATERAL (
           SELECT c.id
             FROM customers c
            WHERE c.company_id = d.company_id
              AND c.qbo_customer_id = d.customer_ref
            ORDER BY c.id
            LIMIT 1
       ) qbo_customer ON true
     WHERE d.company_id = $1 AND d.id = $2
     LIMIT 1
    `,
    [cid, docId]
  );
  return res.rows?.[0] || null;
}

async function listRentalOrdersWithOutItems({ companyId } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    SELECT DISTINCT ro.id
      FROM rental_orders ro
      JOIN rental_order_line_items li ON li.rental_order_id = ro.id
     WHERE ro.company_id = $1
       AND ro.status IN ('ordered','received')
       AND li.fulfilled_at IS NOT NULL
       AND li.returned_at IS NULL
     ORDER BY ro.id
    `,
    [cid]
  );
  return (res.rows || []).map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
}

async function countOutItemsForOrder({ companyId, orderId } = {}) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(oid) || oid <= 0) throw new Error("orderId is required.");
  const res = await pool.query(
    `
    SELECT COUNT(*) AS count
      FROM rental_order_line_items
     WHERE rental_order_id = $1
       AND fulfilled_at IS NOT NULL
       AND returned_at IS NULL
    `,
    [oid]
  );
  const count = Number(res.rows?.[0]?.count || 0);
  return Number.isFinite(count) ? count : 0;
}

async function getRentalOrderQboContext({ companyId, orderId } = {}) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(oid) || oid <= 0) throw new Error("orderId is required.");
  const res = await pool.query(
    `
    SELECT ro.id,
           ro.ro_number,
           ro.quote_number,
           ro.status,
           ro.customer_id,
           c.company_name AS customer_name,
           c.qbo_customer_id
      FROM rental_orders ro
      JOIN customers c ON c.id = ro.customer_id
     WHERE ro.company_id = $1 AND ro.id = $2
     LIMIT 1
    `,
    [cid, oid]
  );
  const row = res.rows?.[0] || null;
  if (!row) return null;
  return {
    id: Number(row.id),
    roNumber: row.ro_number || null,
    quoteNumber: row.quote_number || null,
    status: row.status || null,
    customerId: Number(row.customer_id),
    customerName: row.customer_name || null,
    qboCustomerId: row.qbo_customer_id || null,
  };
}

async function buildRentalOrderBillingLines({
  companyId,
  orderId,
  periodStart,
  periodEnd,
  lineItemIds = null,
  ignoreReturnedAt = false,
} = {}) {
  const cid = Number(companyId);
  const oid = Number(orderId);
  const startIso = normalizeTimestamptz(periodStart);
  const endIso = normalizeTimestamptz(periodEnd);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!Number.isFinite(oid) || oid <= 0) throw new Error("orderId is required.");
  if (!startIso || !endIso) throw new Error("periodStart and periodEnd are required.");
  if (Date.parse(endIso) <= Date.parse(startIso)) return [];

  const settings = await getCompanySettings(cid);
  const idList =
    Array.isArray(lineItemIds) && lineItemIds.length
      ? Array.from(new Set(lineItemIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))))
      : null;

  const params = [oid];
  const filters = ["li.rental_order_id = $1"];
  if (idList && idList.length) {
    params.push(idList);
    filters.push(`li.id = ANY($${params.length}::int[])`);
  }

  const res = await pool.query(
    `
    SELECT li.id,
           li.type_id,
           et.name AS type_name,
           et.qbo_item_id,
           li.rate_basis,
           li.rate_amount,
           et.daily_rate,
           et.weekly_rate,
           et.monthly_rate,
           li.bundle_id,
           li.start_at,
           li.end_at,
           li.fulfilled_at,
           li.returned_at,
           cond.pause_periods,
           (SELECT COUNT(*) FROM rental_order_line_inventory liv WHERE liv.line_item_id = li.id) AS qty
      FROM rental_order_line_items li
      JOIN equipment_types et ON et.id = li.type_id
 LEFT JOIN rental_order_line_conditions cond ON cond.line_item_id = li.id
     WHERE ${filters.join(" AND ")} AND li.fulfilled_at IS NOT NULL
     ORDER BY li.id
    `,
    params
  );

  const lines = [];
  for (const row of res.rows || []) {
    const fulfilledAt = row.fulfilled_at || row.start_at;
    const returnedAt = ignoreReturnedAt ? row.end_at : row.returned_at || row.end_at;
    const chargeStart = new Date(Math.max(Date.parse(startIso), Date.parse(fulfilledAt))).toISOString();
    const chargeEnd = new Date(Math.min(Date.parse(endIso), Date.parse(returnedAt))).toISOString();
    if (Date.parse(chargeEnd) <= Date.parse(chargeStart)) continue;

    const rateBasis = normalizeRateBasis(row.rate_basis);
    const rateAmount =
      row.rate_amount === null || row.rate_amount === undefined
        ? rateBasis === "daily"
          ? row.daily_rate
          : rateBasis === "weekly"
            ? row.weekly_rate
            : row.monthly_rate
        : row.rate_amount;
    const pausePeriods = Array.isArray(row.pause_periods) ? row.pause_periods : [];
    const units = computeBillableUnits({
      startAt: chargeStart,
      endAt: chargeEnd,
      rateBasis,
      roundingMode: settings.billing_rounding_mode,
      roundingGranularity: settings.billing_rounding_granularity,
      monthlyProrationMethod: settings.monthly_proration_method,
      pausePeriods,
    });
    if (!Number.isFinite(Number(units)) || units <= 0) continue;

    const qty = row.bundle_id ? 1 : Math.max(1, Number(row.qty || 0));
    const rateValue = rateAmount === null || rateAmount === undefined ? null : Number(rateAmount);
    if (!Number.isFinite(rateValue) || rateValue <= 0) continue;

    const amount = Number((rateValue * units * qty).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    lines.push({
      lineItemId: Number(row.id),
      typeId: Number(row.type_id),
      typeName: row.type_name || "Rental",
      qboItemId: row.qbo_item_id || null,
      rateBasis,
      rateAmount: rateValue,
      quantity: qty,
      units: Number(units),
      amount,
      chargeStart,
      chargeEnd,
    });
  }

  return lines;
}

async function upsertQboSyncState({ companyId, entityName, lastCdcTimestamp } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    INSERT INTO qbo_sync_state (company_id, entity_name, last_cdc_timestamp)
    VALUES ($1, $2, $3)
    ON CONFLICT (company_id, entity_name)
    DO UPDATE SET last_cdc_timestamp = EXCLUDED.last_cdc_timestamp
    RETURNING company_id, entity_name, last_cdc_timestamp
    `,
    [cid, String(entityName || "").trim(), lastCdcTimestamp ? normalizeTimestamptz(lastCdcTimestamp) : null]
  );
  return res.rows[0] || null;
}

async function getQboSyncState({ companyId, entityName } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const res = await pool.query(
    `
    SELECT company_id, entity_name, last_cdc_timestamp
      FROM qbo_sync_state
     WHERE company_id = $1 AND entity_name = $2
     LIMIT 1
    `,
    [cid, String(entityName || "").trim()]
  );
  return res.rows[0] || null;
}

function normalizeJsonbInput(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "object") return value;
  return { value: String(value) };
}

async function logQboError({
  companyId,
  realmId = null,
  endpoint = null,
  method = null,
  status = null,
  intuitTid = null,
  errorMessage = null,
  errorPayload = null,
  context = null,
} = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const payload = normalizeJsonbInput(errorPayload);
  const ctx = normalizeJsonbInput(context) || {};
  await pool.query(
    `
    INSERT INTO qbo_error_logs
      (company_id, realm_id, endpoint, method, status, intuit_tid, error_message, error_payload, context)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      cid,
      realmId ? String(realmId) : null,
      endpoint ? String(endpoint) : null,
      method ? String(method).toUpperCase() : null,
      Number.isFinite(Number(status)) ? Number(status) : null,
      intuitTid ? String(intuitTid) : null,
      errorMessage ? String(errorMessage) : null,
      payload,
      ctx,
    ]
  );
}

async function listQboErrorLogs({ companyId, limit = 50, offset = 0 } = {}) {
  const cid = Number(companyId);
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const res = await pool.query(
    `
    SELECT id, company_id, realm_id, endpoint, method, status, intuit_tid, error_message, error_payload, context, created_at
      FROM qbo_error_logs
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3
    `,
    [cid, lim, off]
  );
  return res.rows || [];
}

async function findRentalOrderIdByRoNumber({ companyId, roNumber } = {}) {
  const cid = Number(companyId);
  const raw = String(roNumber || "").trim();
  if (!Number.isFinite(cid) || cid <= 0) throw new Error("companyId is required.");
  if (!raw) return null;
  const res = await pool.query(
    `SELECT id FROM rental_orders WHERE company_id = $1 AND UPPER(ro_number) = UPPER($2) LIMIT 1`,
    [cid, raw]
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
  listEquipmentLocationIdsForIds,
  recordEquipmentCurrentLocationChange,
  cleanupNonBaseLocationIfUnused,
  listEquipmentCurrentLocationHistory,
  listEquipment,
  setEquipmentCurrentLocationForIds,
  setEquipmentCurrentLocationToBaseForIds,
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
  getCustomerById,
  findCustomerIdByQboCustomerId,
  updateCustomerQboLink,
  createCustomer,
  updateCustomer,
  setCustomerPendingStatus,
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
  listSalesOrders,
  getSalesOrder,
  createSalesOrder,
  updateSalesOrder,
  deleteSalesOrder,
  listWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
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
  listRentalOrderLineItemsForRange,
  getLineItemRevenueSummary,
  listRentalOrderContacts,
  listTimelineData,
  getRentalOrder,
  createRentalOrder,
  updateRentalOrder,
  updateRentalOrderSiteAddress,
  updateRentalOrderStatus,
  deleteRentalOrder,
  listDispatchNotes,
  addDispatchNote,
  updateDispatchNote,
  deleteDispatchNote,
  addRentalOrderNote,
  addRentalOrderAttachment,
  deleteRentalOrderAttachment,
  listCustomerDocuments,
  addCustomerDocument,
  deleteCustomerDocument,
  createCustomerShareLink,
  getCustomerShareLinkByHash,
  markCustomerShareLinkUsed,
  revokeCustomerShareLink,
  createCustomerChangeRequest,
  updateCustomerChangeRequestStatus,
  listCustomerChangeRequests,
  getCustomerChangeRequest,
  getLatestCustomerChangeRequestForLink,
  getCustomerStorefrontExtras,
  listRentalOrderAudits,
  listAvailableInventory,
  getBundleAvailability,
  getTypeDemandAvailability,
  listStorefrontListings,
  listStorefrontSaleListings,
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
  getQboConnection,
  findCompanyIdByQboRealmId,
  upsertQboConnection,
  deleteQboConnection,
  upsertQboDocument,
  markQboDocumentRemoved,
  listQboDocumentsForRentalOrder,
  listQboDocumentsUnassigned,
  listQboDocuments,
  getQboDocument,
  listRentalOrdersWithOutItems,
  countOutItemsForOrder,
  getRentalOrderQboContext,
  buildRentalOrderBillingLines,
  upsertQboSyncState,
  getQboSyncState,
  logQboError,
  listQboErrorLogs,
  findRentalOrderIdByRoNumber,
  rescheduleLineItemEnd,
  setLineItemPickedUp,
  setLineItemReturned,
  applyWorkOrderPauseToEquipment,
  getTypeAvailabilitySeries,
  getAvailabilityShortfallsSummary,
  getAvailabilityShortfallsCustomerDemand,
  getTypeAvailabilitySeriesWithProjection,
  getTypeAvailabilityShortfallDetails,
  getUtilizationDashboard,
  getRevenueSummary,
  getRevenueTimeSeries,
  getSalespersonSummary,
  getSalespersonClosedTransactionsTimeSeries,
  getLocationClosedTransactionsTimeSeries,
  getLocationTypeStockSummary,
  getPasswordValidationError,
};

