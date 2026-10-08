import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

/** Development-only fallback so `npm run dev` works without setup. Never used when NODE_ENV=production. */
const DEV_KEY = createHash("sha256").update("devhub-insecure-development-totp-key").digest();

export function parseKey(raw: string | undefined, isProd: boolean): Buffer {
  if (!raw) {
    if (isProd) throw new Error("TOTP_ENCRYPTION_KEY is required in production (32 bytes, base64 or hex). Generate one with: openssl rand -base64 32");
    return DEV_KEY;
  }
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64 hex chars).");
  return key;
}

let cachedKey: Buffer | undefined;
const key = () => (cachedKey ??= parseKey(config.auth.totpEncryptionKey, config.isProd));

export const usingDevKey = () => !config.auth.totpEncryptionKey;

/** AES-256-GCM. Output: "v1.<iv>.<tag>.<ciphertext>" (base64url parts). */
export function encryptSecret(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(payload: string, k: Buffer = key()): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export const newToken = () => randomBytes(32).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
