import { generate, generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { config } from "../config.js";

/** Standard authenticator-app settings: SHA-1, 6 digits, 30 s period, base32 secret (otplib defaults). */
export const newTotpSecret = () => generateSecret();

export const totpUri = (email: string, secret: string) => generateURI({ issuer: config.auth.totpIssuer, label: email, secret });

export const totpQrDataUrl = (uri: string) => QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" });

/**
 * Checks a 6-digit code, allowing ±1 period of clock drift. Returns the matched time-step so callers can
 * reject re-use of the same code (replay), or null when invalid.
 */
export async function checkTotp(secret: string, code: string, lastStep?: number | null): Promise<number | null> {
  const token = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(token)) return null;
  const r = await verify({ secret, token, epochTolerance: 30 });
  if (!r.valid) return null;
  const step = (r as { timeStep?: number }).timeStep ?? Math.floor(Date.now() / 30000);
  if (lastStep != null && step <= lastStep) return null;
  return step;
}

/** For tests and the dev e2e script. */
export const currentTotp = (secret: string) => generate({ secret });
