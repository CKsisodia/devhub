/**
 * Creates the single production admin (no demo data). Safe to run against a freshly migrated database.
 *
 *   npm run create-admin -- --email you@company.com --name "Your Name"
 *
 * Password: taken from ADMIN_PASSWORD if set, otherwise prompted (hidden). Hashed with argon2id.
 * Refuses to run if an admin already exists. The admin enrols TOTP (QR code) at first sign-in.
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { prisma } from "../db.js";
import { hashPassword, passwordProblem } from "../lib/password.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({ write: (chunk, _enc, cb) => (muted ? cb() : process.stdout.write(chunk, cb)) });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    throw new Error('Usage: npm run create-admin -- --email you@company.com --name "Your Name"');
  }

  const adminRole = await prisma.role.upsert({ where: { name: "admin" }, update: {}, create: { name: "admin" } });
  await prisma.role.upsert({ where: { name: "viewer" }, update: {}, create: { name: "viewer" } });
  const existing = await prisma.user.findFirst({ where: { roleId: adminRole.id }, select: { email: true } });
  if (existing) throw new Error(`An admin already exists (${existing.email}). DevHub has a single admin; nothing changed.`);
  if (await prisma.user.findUnique({ where: { email } })) throw new Error(`A user with ${email} already exists; nothing changed.`);

  let password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("Admin password: ");
    if ((await promptHidden("Repeat password: ")) !== password) throw new Error("Passwords do not match.");
  }
  const problem = passwordProblem(password, email);
  if (problem) throw new Error(`Password rejected: ${problem}`);

  await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password), roleId: adminRole.id } });
  console.log(`Admin ${email} created. Sign in and scan the QR code with your authenticator app.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
