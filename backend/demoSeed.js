const {
  pool,
  createCompanyWithUser,
  createCategory,
  createType,
  createEquipment,
  createCustomer,
  createRentalOrder,
  deleteCompaniesForDev,
} = require("./db");

const COMPANY_NAME = "demo";
const CONTACT_EMAIL = "demo@email.com";
const OWNER_NAME = "Demo Owner";
const OWNER_EMAIL = "demo@email.com";
const OWNER_PASSWORD = "1234abcd";

const CATEGORY_SPECS = [
  { name: "Excavator", dailyRate: 250, weeklyRate: 1200, monthlyRate: 3600, manufacturer: "Caterpillar" },
  { name: "Light Tower", dailyRate: 75, weeklyRate: 350, monthlyRate: 1000, manufacturer: "Generac" },
  { name: "Dumpster", dailyRate: 90, weeklyRate: 400, monthlyRate: 1200, manufacturer: "Wastequip" },
  { name: "Fork Lift", dailyRate: 160, weeklyRate: 750, monthlyRate: 2200, manufacturer: "Toyota" },
];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

async function findExistingCompanyIds() {
  const ids = new Set();
  const companyRes = await pool.query(
    `SELECT id FROM companies WHERE LOWER(name) = LOWER($1) OR LOWER(contact_email) = LOWER($2)`,
    [COMPANY_NAME, CONTACT_EMAIL]
  );
  companyRes.rows.forEach((row) => ids.add(Number(row.id)));

  const userRes = await pool.query(`SELECT DISTINCT company_id FROM users WHERE LOWER(email) = LOWER($1)`, [
    OWNER_EMAIL,
  ]);
  userRes.rows.forEach((row) => ids.add(Number(row.company_id)));

  return [...ids].filter((id) => Number.isFinite(id) && id > 0);
}

async function ensureCategory(companyId, name) {
  const created = await createCategory({ companyId, name });
  if (created?.id) return created;
  const res = await pool.query(
    `SELECT id, name FROM equipment_categories WHERE company_id = $1 AND name = $2 LIMIT 1`,
    [companyId, name]
  );
  return res.rows[0] || null;
}

async function ensureType(companyId, spec) {
  const created = await createType({
    companyId,
    name: spec.name,
    categoryId: spec.categoryId,
    dailyRate: spec.dailyRate,
    weeklyRate: spec.weeklyRate,
    monthlyRate: spec.monthlyRate,
  });
  if (created?.id) return created;
  const res = await pool.query(
    `SELECT id, name, category_id FROM equipment_types WHERE company_id = $1 AND name = $2 LIMIT 1`,
    [companyId, spec.name]
  );
  return res.rows[0] || null;
}

async function seedDemoCompany({ seed = 42, reset = false } = {}) {
  const rng = mulberry32(seed);

  const existingIds = await findExistingCompanyIds();
  if (existingIds.length && reset) {
    await deleteCompaniesForDev({ companyIds: existingIds });
  } else if (existingIds.length && !reset) {
    return { skipped: true, companyIds: existingIds };
  }

  const created = await createCompanyWithUser({
    companyName: COMPANY_NAME,
    contactEmail: CONTACT_EMAIL,
    ownerName: OWNER_NAME,
    ownerEmail: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });

  const companyId = Number(created.company.id);
  const defaultLocationId = Number(created.defaultLocation?.id || 0);

  const categories = [];
  for (const spec of CATEGORY_SPECS) {
    const category = await ensureCategory(companyId, spec.name);
    categories.push({ ...spec, categoryId: category?.id || null });
  }

  const types = [];
  for (const spec of categories) {
    const type = await ensureType(companyId, spec);
    types.push({ ...spec, typeId: type?.id || null });
  }

  const equipmentUnits = [];
  for (const type of types) {
    const count = randInt(rng, 2, 10);
    for (let i = 1; i <= count; i += 1) {
      const serial = `DEMO-${type.name.replace(/\s+/g, "").toUpperCase()}-${pad2(i)}-${randInt(rng, 10, 99)}`;
      const modelName = `${type.name} Model ${pad2(i)}`;
      const equipment = await createEquipment({
        companyId,
        typeId: type.typeId,
        modelName,
        serialNumber: serial,
        condition: "Good",
        manufacturer: type.manufacturer,
        locationId: defaultLocationId || null,
        currentLocationId: defaultLocationId || null,
        purchasePrice: randInt(rng, 5000, 40000),
        notes: "Demo unit",
      });
      equipmentUnits.push(equipment);
    }
  }

  const customers = [];
  for (let i = 1; i <= 10; i += 1) {
    const customer = await createCustomer({
      companyId,
      companyName: `Demo Customer ${pad2(i)}`,
      contactName: `Contact ${pad2(i)}`,
      email: `customer${pad2(i)}@demo.local`,
      phone: `555-010${pad2(i)}`,
    });
    customers.push(customer);
  }

  const orders = [];
  for (let i = 1; i <= 20; i += 1) {
    const customer = customers[randInt(rng, 0, customers.length - 1)];
    const lineItemsCount = randInt(rng, 1, 3);
    const lineItems = [];
    for (let j = 0; j < lineItemsCount; j += 1) {
      const type = types[randInt(rng, 0, types.length - 1)];
      const startOffset = randInt(rng, 1, 30);
      const duration = randInt(rng, 1, 7);
      const start = new Date();
      start.setDate(start.getDate() + startOffset);
      const end = new Date(start);
      end.setDate(end.getDate() + duration);
      lineItems.push({
        typeId: type.typeId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      });
    }

    const order = await createRentalOrder({
      companyId,
      customerId: customer?.id,
      status: "quote",
      fulfillmentMethod: "pickup",
      pickupLocationId: defaultLocationId || null,
      lineItems,
      actorName: "Demo Seed",
      actorEmail: OWNER_EMAIL,
    });
    orders.push(order);
  }

  return {
    skipped: false,
    companyId,
    login: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
    counts: {
      types: types.length,
      equipment: equipmentUnits.length,
      customers: customers.length,
      orders: orders.length,
    },
  };
}

async function ensureDemoCompany() {
  return seedDemoCompany({ reset: false });
}

module.exports = {
  ensureDemoCompany,
  seedDemoCompany,
  DEMO_LOGIN: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
};
