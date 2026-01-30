const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config();

const { pool } = require("../backend/db");

async function run() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");

  const countRes = await pool.query(
    `
    SELECT COUNT(*)::int AS count
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN equipment e ON e.id = liv.equipment_id
     WHERE ro.status <> 'closed'
       AND li.type_id IS DISTINCT FROM e.type_id
       AND (SELECT COUNT(*) FROM rental_order_line_inventory liv2 WHERE liv2.line_item_id = li.id) = 1
    `
  );
  const mismatchCount = Number(countRes.rows?.[0]?.count || 0);

  console.log(`Mismatched line item types (non-closed orders): ${mismatchCount}`);

  const sampleRes = await pool.query(
    `
    SELECT ro.ro_number,
           ro.status,
           li.id AS line_item_id,
           li.type_id AS line_type_id,
           e.type_id AS equipment_type_id,
           e.serial_number
      FROM rental_order_line_inventory liv
      JOIN rental_order_line_items li ON li.id = liv.line_item_id
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN equipment e ON e.id = liv.equipment_id
     WHERE ro.status <> 'closed'
       AND li.type_id IS DISTINCT FROM e.type_id
       AND (SELECT COUNT(*) FROM rental_order_line_inventory liv2 WHERE liv2.line_item_id = li.id) = 1
     ORDER BY ro.ro_number, li.id
     LIMIT 20
    `
  );
  if (sampleRes.rows.length) {
    console.log("Sample mismatches:");
    sampleRes.rows.forEach((row) => {
      console.log(
        `  ${row.ro_number || "(no ro #)"} (${row.status}) line ${row.line_item_id}: line type ${row.line_type_id} -> equipment type ${row.equipment_type_id} (serial ${row.serial_number || "--"})`
      );
    });
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to make changes.");
    return;
  }

  const updateRes = await pool.query(
    `
    UPDATE rental_order_line_items li
       SET type_id = e.type_id
      FROM rental_order_line_inventory liv
      JOIN rental_orders ro ON ro.id = li.rental_order_id
      JOIN equipment e ON e.id = liv.equipment_id
     WHERE liv.line_item_id = li.id
       AND ro.status <> 'closed'
       AND (SELECT COUNT(*) FROM rental_order_line_inventory liv2 WHERE liv2.line_item_id = li.id) = 1
       AND li.type_id IS DISTINCT FROM e.type_id
    `
  );

  console.log(`Updated line items: ${updateRes.rowCount || 0}`);
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));
