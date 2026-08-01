import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { loadRuntimeConfig } from "../config/index.js";
import { isMainModule } from "../helper/isMainModule.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const config = loadRuntimeConfig();
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 1,
  });

  try {
    // dist/db/migrate.js -> drizzle/ at the deployment root.
    const migrationsFolder = resolve(__dirname, "../../drizzle");
    const db = drizzle({ client: pool });
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (isMainModule(import.meta.url)) {
  runMigrations()
    .then(() => {
      process.stdout.write("Migrations complete\n");
      process.exit(0);
    })
    .catch((error: unknown) => {
      process.stderr.write(`Migrations failed: ${(error as Error).message ?? String(error)}\n`);
      process.exit(1);
    });
}
