/**
 * Read-only JSON backup of every table in the public schema to backend/backups/db-backup-<timestamp>.json.
 *
 *   npm run db:backup                 # uses DATABASE_URL (environment first, then backend/.env)
 *
 * Works against local Postgres or Neon. It only reads (one REPEATABLE READ transaction, so the snapshot is
 * consistent). The file holds password hashes and encrypted TOTP secrets: it is written with mode 600 and
 * backend/backups/ is gitignored. Never commit or share it.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const backupDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "backups");

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function dbHost(): string {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Dumps every table in the `public` schema with raw SQL (row_to_json), not through the Prisma models. The
 * backup therefore works whatever the generated client looks like, including *before* a pending migration
 * is applied (the client already knows new columns the database doesn't have yet).
 */
async function main() {
  const data: Record<string, unknown[]> = {};

  await prisma.$transaction(
    async (tx) => {
      const tables = await tx.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;
      for (const { table_name } of tables) {
        const ident = '"' + table_name.replace(/"/g, '""') + '"';
        const rows = await tx.$queryRawUnsafe<{ row: unknown }[]>(`SELECT row_to_json(t) AS row FROM public.${ident} t`);
        data[table_name] = rows.map((r) => r.row);
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000, maxWait: 30_000 },
  );

  const counts = Object.fromEntries(Object.entries(data).map(([k, rows]) => [k, rows.length]));
  const payload = {
    meta: { createdAt: new Date().toISOString(), host: dbHost(), format: "devhub-json-backup/2", counts },
    data,
  };
  const json = JSON.stringify(
    payload,
    (_key, value: unknown) => {
      if (typeof value === "bigint") return value.toString();
      if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString("base64") };
      return value;
    },
    2,
  );

  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const file = path.join(backupDir, `db-backup-${stamp()}.json`);
  await writeFile(file, json, { mode: 0o600, flag: "wx" });

  console.log(`Backup written: ${file}`);
  console.log(`Host: ${payload.meta.host}`);
  for (const [model, n] of Object.entries(counts)) console.log(`  ${model}: ${n}`);
}

main()
  .catch((err) => {
    console.error("Backup FAILED:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
