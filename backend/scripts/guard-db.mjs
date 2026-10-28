#!/usr/bin/env node
/**
 * Safety guard for destructive / dev-only database commands (migrate dev, migrate reset, seed).
 *
 * Exits non-zero if DATABASE_URL points anywhere other than a local database (localhost, 127.0.0.1, ::1),
 * so these commands can never touch the production Neon database by accident.
 * DATABASE_URL is read from the environment first, then from backend/.env (same precedence as Prisma).
 * Override (only if you really mean it): ALLOW_REMOTE_DB_DESTRUCTIVE=1
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function readDotEnv(name) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || m[1] !== name) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    return value;
  }
  return undefined;
}

function fail(message) {
  console.error(`\n[guard-db] BLOCKED: ${message}`);
  console.error("[guard-db] This command can drop or overwrite data, so it only runs against a local database.");
  console.error("[guard-db] For production (Neon) use `npm run db:migrate:safe` (backup + prisma migrate deploy).");
  console.error("[guard-db] Override only if you are absolutely sure: ALLOW_REMOTE_DB_DESTRUCTIVE=1\n");
  process.exit(1);
}

const url = process.env.DATABASE_URL || readDotEnv("DATABASE_URL");
const command = process.argv.slice(2).join(" ") || "this command";

if (process.env.ALLOW_REMOTE_DB_DESTRUCTIVE === "1") {
  console.warn(`[guard-db] WARNING: ALLOW_REMOTE_DB_DESTRUCTIVE=1 set, skipping the local-only check for ${command}.`);
  process.exit(0);
}
if (!url) fail("DATABASE_URL is not set (environment or backend/.env).");

let host;
try {
  host = new URL(url).hostname.toLowerCase();
} catch {
  fail("DATABASE_URL could not be parsed, refusing to guess where it points.");
}
if (!LOCAL_HOSTS.has(host)) {
  fail(`DATABASE_URL points to a non-local host (${host}).`);
}
console.log(`[guard-db] OK: local database (${host}).`);
