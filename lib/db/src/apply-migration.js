import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
try {
  const envPath = path.resolve(__dirname, "../../../.env");
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
  console.log("Connecting to database...");
  const pool = new pg.Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    const sqlPath = path.resolve(__dirname, "../drizzle/0000_nice_mastermind.sql");
    console.log("Reading migration SQL from:", sqlPath);
    const sqlContent = fs.readFileSync(sqlPath, "utf8");
    
    // Split statements by drizzle's breakpoint marker
    const statements = sqlContent
      .split("--> statement-breakpoint")
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute.`);

    // Start transaction
    await client.query("BEGIN;");
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      await client.query(stmt);
    }
    await client.query("COMMIT;");
    console.log("Migration applied successfully!");
  } catch (err) {
    console.error("Error applying migration, rolling back:", err);
    await client.query("ROLLBACK;");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
