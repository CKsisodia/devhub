import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { config } from "../config.js";

/** Normalise user input to E.164 (e.g. "98765 43210" -> "+919876543210"). Returns null if invalid. */
export function normalizePhone(input: string, country = config.defaultCountry): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** "+919876543210" -> "+91 •••• ••3210" */
export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4);
  const cc = e164.startsWith("+91") ? "+91" : e164.slice(0, e164.length - 10) || "+";
  return `${cc} •••• ••${last4}`;
}
