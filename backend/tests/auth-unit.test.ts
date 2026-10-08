/** Password hashing, TOTP, secret encryption and rate limiting (no database needed). */
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { generate, generateSecret } from "otplib";
import { decryptSecret, encryptSecret, parseKey } from "../src/lib/crypto.js";
import { hashPassword, passwordProblem, verifyPassword } from "../src/lib/password.js";
import { checkTotp, totpQrDataUrl, totpUri } from "../src/lib/totp.js";
import { RateLimiter } from "../src/lib/rateLimit.js";
import { stepFor } from "../src/auth/routes.js";

describe("passwords (argon2id)", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("Correct-horse-42");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "Correct-horse-42")).toBe(true);
    expect(await verifyPassword(h, "correct-horse-42")).toBe(false);
  });
  it("uses a unique salt per hash", async () => {
    expect(await hashPassword("Same-pass-123")).not.toBe(await hashPassword("Same-pass-123"));
  });
  it("never verifies placeholder / malformed hashes", async () => {
    expect(await verifyPassword("!", "anything")).toBe(false);
    expect(await verifyPassword("$argon2id$broken", "anything")).toBe(false);
  });
  it("enforces the password policy", () => {
    expect(passwordProblem("short1")).toMatch(/at least 10/);
    expect(passwordProblem("onlyletterslong")).toMatch(/letter and one number/);
    expect(passwordProblem("ravi-secret-123", "ravi@devhub.test")).toMatch(/email/);
    expect(passwordProblem("Good-password-9")).toBeNull();
  });
});

describe("TOTP secret encryption (AES-256-GCM)", () => {
  const key = randomBytes(32);
  it("round-trips and uses a random IV", () => {
    const a = encryptSecret("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", key);
    const b = encryptSecret("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("JBSWY3DP");
    expect(decryptSecret(a, key)).toBe("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  });
  it("detects tampering and wrong keys", () => {
    const enc = encryptSecret("secret", key);
    const parts = enc.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
  });
  it("parses base64 / hex keys and requires a key in production", () => {
    const raw = randomBytes(32);
    expect(parseKey(raw.toString("base64"), true).equals(raw)).toBe(true);
    expect(parseKey(raw.toString("hex"), true).equals(raw)).toBe(true);
    expect(() => parseKey(undefined, true)).toThrow(/required in production/);
    expect(() => parseKey("dG9vLXNob3J0", true)).toThrow(/32 bytes/);
    expect(parseKey(undefined, false)).toHaveLength(32);
  });
});

describe("TOTP codes", () => {
  const secret = generateSecret();
  it("accepts the current code and returns its time-step", async () => {
    const step = await checkTotp(secret, await generate({ secret }));
    expect(step).toBe(Math.floor(Date.now() / 30000));
  });
  it("tolerates one period of clock drift but not more", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await checkTotp(secret, await generate({ secret, epoch: now - 30 }))).not.toBeNull();
    expect(await checkTotp(secret, await generate({ secret, epoch: now - 120 }))).toBeNull();
  });
  it("rejects wrong, malformed and replayed codes", async () => {
    const code = await generate({ secret });
    const step = (await checkTotp(secret, code))!;
    expect(await checkTotp(secret, code, step)).toBeNull(); // replay of the same code
    expect(await checkTotp(secret, "12345")).toBeNull();
    expect(await checkTotp(secret, "abcdef")).toBeNull();
    expect(await checkTotp(generateSecret(), code)).toBeNull();
  });
  it("accepts codes typed with spaces", async () => {
    const code = await generate({ secret });
    expect(await checkTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`)).not.toBeNull();
  });
  it("builds an otpauth URI and a QR code image", async () => {
    const uri = totpUri("ravi@devhub.test", secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\/.*ravi%40devhub\.test\?secret=[A-Z2-7]+&issuer=/);
    expect(await totpQrDataUrl(uri)).toMatch(/^data:image\/png;base64,/);
  });
});

describe("RateLimiter", () => {
  it("blocks after max attempts within the window, then resets", () => {
    const rl = new RateLimiter(3, 1000);
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(rl.retryAfter("k", t)).toBe(0);
      rl.hit("k", t);
    }
    expect(rl.retryAfter("k", t)).toBeGreaterThan(0);
    expect(rl.retryAfter("other", t)).toBe(0);
    expect(rl.retryAfter("k", t + 1001)).toBe(0);
    rl.hit("k", t);
    rl.reset("k");
    expect(rl.retryAfter("k", t)).toBe(0);
  });
});

describe("login steps", () => {
  const u = (totpEnabled: boolean, mustChangePassword: boolean) => ({ totpEnabled, mustChangePassword });
  it("orders password -> TOTP (setup or verify) -> password change -> done", () => {
    expect(stepFor({ mfaVerified: false, user: u(false, true) })).toBe("totp_setup");
    expect(stepFor({ mfaVerified: false, user: u(true, false) })).toBe("totp_verify");
    expect(stepFor({ mfaVerified: true, user: u(true, true) })).toBe("set_password");
    expect(stepFor({ mfaVerified: true, user: u(true, false) })).toBe("done");
  });
});
