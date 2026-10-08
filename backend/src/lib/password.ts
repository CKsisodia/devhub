import { hash, verify } from "@node-rs/argon2";

/** argon2id with OWASP-recommended parameters (19 MiB, 2 iterations). */
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const hashPassword = (password: string) => hash(password, OPTS);

/** Never throws: malformed / placeholder hashes simply don't verify. */
export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  if (!stored.startsWith("$argon2")) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Used when the email is unknown, so response time doesn't reveal which emails exist. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword("not-a-real-password-placeholder");
  await verifyPassword(await dummy, password);
}

/** Returns an error message, or null if the password is acceptable. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use at least one letter and one number.";
  if (email && password.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "Don't include your email name in the password.";
  return null;
}
