import pg from "pg";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env
try {
  const envPath = path.resolve(process.cwd(), "../../.env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1].trim();
        let val = (match[2] || "").trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        process.env[key] = val;
      }
    }
  }
} catch (e) {
  console.error("Error loading env:", e);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

async function main() {
  console.log("Connecting to database to drop tables...");
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    // Drop in correct dependency order
    await client.query("DROP TABLE IF EXISTS pos CASCADE;");
    await client.query("DROP TABLE IF EXISTS parts CASCADE;");
    await client.query("DROP TABLE IF EXISTS vendors CASCADE;");
    await client.query("DROP TABLE IF EXISTS materials CASCADE;");
    await client.query("DROP TABLE IF EXISTS rm_index CASCADE;");
    await client.query("DROP TABLE IF EXISTS settings CASCADE;");
    console.log("Successfully dropped all tables!");
  } catch (err) {
    console.error("Error dropping tables:", err);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
