#!/usr/bin/env node
"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { seedDemoCompany, DEMO_LOGIN } = require("../backend/demoSeed");
const { pool } = require("../backend/db");

function parseArgs(argv) {
  const args = { reset: false, seed: 42 };
  argv.forEach((arg) => {
    if (arg === "--reset") args.reset = true;
    if (arg.startsWith("--seed=")) {
      const raw = Number(arg.split("=")[1]);
      if (Number.isFinite(raw)) args.seed = raw;
    }
  });
  return args;
}

async function main() {
  const { reset, seed } = parseArgs(process.argv.slice(2));
  const result = await seedDemoCompany({ reset, seed });
  if (result?.skipped) {
    console.error(
      `Existing demo company/user found (company IDs: ${result.companyIds.join(
        ", "
      )}). Re-run with --reset to delete and reseed.`
    );
    process.exitCode = 1;
    return;
  }

  console.log("Demo seed complete.");
  console.log(`Company ID: ${result.companyId}`);
  console.log(`Login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
  console.log(
    `Types: ${result.counts.types}, Equipment: ${result.counts.equipment}, Customers: ${result.counts.customers}, Orders: ${result.counts.orders}`
  );
}

main()
  .catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
