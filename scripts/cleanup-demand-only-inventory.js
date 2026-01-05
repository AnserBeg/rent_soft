const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const { pool } = require("../backend/db");

async function run() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  const deletePlaceholders = args.has("--delete-placeholders");

  const demandStatuses = ["quote", "quote_rejected", "reservation", "requested"];

  const countsRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
     WHERE ro.status = ANY($1::text[])
    `,
    [demandStatuses]
  );
  const linkCount = Number(countsRes.rows?.[0]?.count || 0);

  const placeholderRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
      FROM equipment
     WHERE serial_number ILIKE 'UNALLOCATED-%'
    `
  );
  const placeholderCount = Number(placeholderRes.rows?.[0]?.count || 0);

  console.log(`Demand-only line-inventory links: ${linkCount}`);
  console.log(`Placeholder equipment (UNALLOCATED-*): ${placeholderCount}`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to make changes.");
    return;
  }

  await pool.query(
    `
    DELETE FROM rental_order_line_inventory
     WHERE line_item_id IN (
       SELECT li.id
         FROM rental_order_line_items li
         JOIN rental_orders ro ON ro.id = li.rental_order_id
        WHERE ro.status = ANY($1::text[])
     )
    `,
    [demandStatuses]
  );

  if (deletePlaceholders) {
    const deleted = await pool.query(
      `
      DELETE FROM equipment
       WHERE serial_number ILIKE 'UNALLOCATED-%'
         AND id NOT IN (SELECT equipment_id FROM rental_order_line_inventory)
      `
    );
    console.log(`Deleted placeholder equipment: ${deleted.rowCount || 0}`);
  } else {
    const updated = await pool.query(
      `
      UPDATE equipment
         SET condition = 'Unusable',
             notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE '\n' END, 'Marked unusable: legacy UNALLOCATED placeholder.')
       WHERE serial_number ILIKE 'UNALLOCATED-%'
         AND condition <> 'Unusable'
      `
    );
    console.log(`Marked placeholder equipment unusable: ${updated.rowCount || 0}`);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
