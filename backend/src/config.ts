/** Central, typed access to environment variables. See .env.example for documentation. */
function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name}`);
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

const nodeEnv = str("NODE_ENV", "development");

export const config = {
  nodeEnv,
  isProd: nodeEnv === "production",
  port: Number(str("PORT", "4000")),

  /** Public origin of the frontend (Next.js). */
  websiteDomain: str("WEBSITE_DOMAIN", "http://localhost:3000"),
  /**
   * Public origin through which the browser reaches this API. By default the frontend proxies
   * /api/* to this service, so the API is reached on the frontend origin (first-party cookies).
   */
  apiDomain: str("API_DOMAIN", "http://localhost:3000"),
  /** Extra origins allowed to call the API directly (comma separated). */
  corsOrigins: str("CORS_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  supertokens: {
    connectionUri: str("SUPERTOKENS_CONNECTION_URI", "https://try.supertokens.com"),
    apiKey: process.env.SUPERTOKENS_API_KEY || undefined,
    appName: str("APP_NAME", "FE Panel"),
  },

  sms: {
    /** console | twilio | supertokens */
    provider: str("SMS_PROVIDER", "console") as "console" | "twilio" | "supertokens",
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioFrom: process.env.TWILIO_FROM,
    twilioMessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
    supertokensSmsApiKey: process.env.SUPERTOKENS_SMS_API_KEY,
  },

  defaultCountry: str("DEFAULT_PHONE_COUNTRY", "IN"),

  llm: {
    apiKey: process.env.LLM_API_KEY || undefined,
    baseUrl: str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    model: str("LLM_MODEL", "gpt-4o-mini"),
    /** When true and no API key is set, a deterministic mock drafts tasks (dev only). */
    mock: bool("LLM_MOCK", false),
  },

  uploads: {
    blobToken: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    localDir: str("UPLOAD_DIR", "uploads"),
    maxBytes: Number(str("UPLOAD_MAX_BYTES", String(5 * 1024 * 1024))),
  },
};
