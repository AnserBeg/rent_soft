const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const sharp = require("sharp");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipDb = args.has("--skip-db");
const skipFiles = args.has("--skip-files");
const deleteOriginal = args.has("--delete-original");

const repoRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(repoRoot, "public");
const uploadRoot = process.env.UPLOAD_ROOT ? path.resolve(process.env.UPLOAD_ROOT) : path.join(publicRoot, "uploads");

const allowedExts = new Set([".jpg", ".jpeg", ".png", ".gif"]);
const urlPattern = /\/uploads\/[^\s"'<>]+?\.(?:jpe?g|png|gif)/gi;
const dataUrlPattern = /data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)/gi;

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function shouldConvertExt(ext) {
  return allowedExts.has(ext.toLowerCase());
}

async function convertBufferToWebp(buffer, { quality = 82 } = {}) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  if (!input.length) throw new Error("Missing image buffer.");
  return sharp(input, { failOnError: false, animated: true }).webp({ quality }).toBuffer();
}

function buildUrlMapEntry(filePath) {
  const ext = path.extname(filePath);
  if (!shouldConvertExt(ext)) return null;
  const relative = path.relative(uploadRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  const relPosix = toPosixPath(relative);
  const oldUrl = `/uploads/${relPosix}`;
  const newRel = relPosix.slice(0, -ext.length) + ".webp";
  const newUrl = `/uploads/${newRel}`;
  return { oldUrl, newUrl, targetPath: path.join(uploadRoot, newRel), ext };
}

async function walkFiles(dir, results = []) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, results);
      continue;
    }
    if (!entry.isFile()) continue;
    results.push(full);
  }
  return results;
}

function replaceUrlsInString(value, urlMap) {
  if (typeof value !== "string") return value;
  if (!urlPattern.test(value)) return value;
  urlPattern.lastIndex = 0;
  return value.replace(urlPattern, (match) => urlMap.get(match) || match);
}

async function replaceDataUrlsInString(value) {
  if (typeof value !== "string") return value;
  if (!/data:image\/(png|jpe?g);base64,/i.test(value)) return value;
  const parts = [];
  let lastIndex = 0;
  dataUrlPattern.lastIndex = 0;
  let match = null;
  while ((match = dataUrlPattern.exec(value)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    parts.push(value.slice(lastIndex, start));
    let replacement = match[0];
    try {
      const buffer = Buffer.from(match[2], "base64");
      const webpBuffer = await convertBufferToWebp(buffer);
      replacement = `data:image/webp;base64,${webpBuffer.toString("base64")}`;
    } catch {
      // Keep original if conversion fails.
    }
    parts.push(replacement);
    lastIndex = end;
  }
  parts.push(value.slice(lastIndex));
  return parts.join("");
}

async function replaceUrlsInValue(value, urlMap) {
  if (typeof value === "string") {
    const withUrls = replaceUrlsInString(value, urlMap);
    return replaceDataUrlsInString(withUrls);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = [];
    for (const item of value) {
      const updated = await replaceUrlsInValue(item, urlMap);
      if (updated !== item) changed = true;
      out.push(updated);
    }
    return changed ? out : value;
  }
  if (value && typeof value === "object") {
    let changed = false;
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const updated = await replaceUrlsInValue(entry, urlMap);
      if (updated !== entry) changed = true;
      out[key] = updated;
    }
    return changed ? out : value;
  }
  return value;
}

function updateFileNameForWebp(name) {
  if (!name || typeof name !== "string") return name;
  if (!/\.(jpe?g|png|gif)$/i.test(name)) return name;
  return name.replace(/\.(jpe?g|png|gif)$/i, ".webp");
}

async function main() {
  if (!fs.existsSync(uploadRoot)) {
    console.error(`Upload root not found: ${uploadRoot}`);
    process.exit(1);
  }

  console.log(`Upload root: ${uploadRoot}`);
  console.log(`Dry run: ${dryRun ? "yes" : "no"}`);
  console.log(`Skip files: ${skipFiles ? "yes" : "no"}`);
  console.log(`Skip DB: ${skipDb ? "yes" : "no"}`);
  if (deleteOriginal && skipDb) {
    console.log("Delete original requested but DB updates are skipped; originals will be kept.");
  }

  const files = await walkFiles(uploadRoot);
  const urlMap = new Map();
  const filesToDelete = [];
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const filePath of files) {
    const ext = path.extname(filePath);
    if (!shouldConvertExt(ext)) continue;

    const mapping = buildUrlMapEntry(filePath);
    if (!mapping) continue;

    const { oldUrl, newUrl, targetPath } = mapping;
    if (skipFiles) {
      if (fs.existsSync(targetPath)) {
        urlMap.set(oldUrl, newUrl);
      } else {
        skipped += 1;
      }
      continue;
    }

    if (fs.existsSync(targetPath)) {
      urlMap.set(oldUrl, newUrl);
      skipped += 1;
      continue;
    }

    try {
      if (!dryRun) {
        const input = await fs.promises.readFile(filePath);
        const output = await convertBufferToWebp(input);
        await fs.promises.writeFile(targetPath, output);
      }
      urlMap.set(oldUrl, newUrl);
      filesToDelete.push(filePath);
      converted += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to convert ${filePath}: ${err.message || err}`);
    }
  }

  console.log(`Converted: ${converted}, skipped: ${skipped}, failed: ${failed}`);
  console.log(`URL mappings: ${urlMap.size}`);

  if (!skipDb && urlMap.size) {
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is required for DB updates.");
      process.exit(1);
    }

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const textUpdates = [
      { table: "equipment_types", id: "id", columns: ["image_url"] },
      { table: "equipment", id: "id", columns: ["image_url"] },
      { table: "purchase_orders", id: "id", columns: ["image_url"] },
      { table: "sales_people", id: "id", columns: ["image_url"] },
      { table: "company_settings", id: "company_id", columns: ["logo_url"] },
      { table: "rental_orders", id: "id", columns: ["general_notes"] },
      { table: "rental_order_attachments", id: "id", columns: ["url"], fileNameColumn: "file_name" },
      { table: "customer_documents", id: "id", columns: ["url"], fileNameColumn: "file_name" },
    ];

    const jsonUpdates = [
      { table: "equipment_types", id: "id", columns: ["image_urls", "documents"] },
      { table: "equipment", id: "id", columns: ["image_urls"] },
      { table: "purchase_orders", id: "id", columns: ["image_urls"] },
      { table: "rental_order_line_conditions", id: "line_item_id", columns: ["before_images", "after_images"] },
      { table: "storefront_customers", id: "id", columns: ["documents"] },
      { table: "customer_accounts", id: "id", columns: ["documents"] },
      { table: "customer_change_requests", id: "id", columns: ["documents", "signature", "payload"] },
    ];

    const client = await pool.connect();
    try {
      let rowsUpdated = 0;

      for (const entry of textUpdates) {
        const cols = entry.columns.join(", ");
        const res = await client.query(`SELECT ${entry.id} AS id, ${cols}${entry.fileNameColumn ? `, ${entry.fileNameColumn}` : ""} FROM ${entry.table}`);
        for (const row of res.rows) {
          let updated = false;
          const updates = {};
          for (const col of entry.columns) {
            const raw = row[col];
            if (raw === null || raw === undefined) continue;
            const next = await replaceUrlsInValue(raw, urlMap);
            if (next !== raw) {
              updates[col] = next;
              updated = true;
            }
          }
          if (entry.fileNameColumn && row[entry.fileNameColumn]) {
            const maybeUrl = updates.url || row.url;
            if (maybeUrl && urlMap.has(maybeUrl)) {
              const nextFileName = updateFileNameForWebp(row[entry.fileNameColumn]);
              if (nextFileName !== row[entry.fileNameColumn]) {
                updates[entry.fileNameColumn] = nextFileName;
                updated = true;
              }
            }
          }
          if (!updated) continue;
          if (!dryRun) {
            const setParts = [];
            const values = [];
            let idx = 1;
            for (const [key, value] of Object.entries(updates)) {
              setParts.push(`${key} = $${idx++}`);
              values.push(value);
            }
            values.push(row.id);
            await client.query(`UPDATE ${entry.table} SET ${setParts.join(", ")} WHERE ${entry.id} = $${idx}`, values);
          }
          rowsUpdated += 1;
        }
      }

      for (const entry of jsonUpdates) {
        const cols = entry.columns.join(", ");
        const res = await client.query(`SELECT ${entry.id} AS id, ${cols} FROM ${entry.table}`);
        for (const row of res.rows) {
          let updated = false;
          const updates = {};
          for (const col of entry.columns) {
            const raw = row[col];
            if (raw === null || raw === undefined) continue;
            const next = await replaceUrlsInValue(raw, urlMap);
            if (next !== raw) {
              updates[col] = JSON.stringify(next);
              updated = true;
            }
          }
          if (!updated) continue;
          if (!dryRun) {
            const setParts = [];
            const values = [];
            let idx = 1;
            for (const [key, value] of Object.entries(updates)) {
              setParts.push(`${key} = $${idx++}::jsonb`);
              values.push(value);
            }
            values.push(row.id);
            await client.query(`UPDATE ${entry.table} SET ${setParts.join(", ")} WHERE ${entry.id} = $${idx}`, values);
          }
          rowsUpdated += 1;
        }
      }

      console.log(`DB rows updated: ${rowsUpdated}`);
    } finally {
      client.release();
      await pool.end();
    }
  }

  if (deleteOriginal && !dryRun && !skipDb) {
    let deleted = 0;
    for (const filePath of filesToDelete) {
      try {
        await fs.promises.unlink(filePath);
        deleted += 1;
      } catch {
        // ignore
      }
    }
    console.log(`Deleted originals: ${deleted}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
