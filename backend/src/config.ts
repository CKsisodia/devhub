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
const isProd = nodeEnv === "production";

export const config = {
  nodeEnv,
  isProd,
  port: Number(str("PORT", "4000")),
  appName: str("APP_NAME", "FE Panel"),

  /** Public origin of the frontend (Next.js). FRONTEND_ORIGIN is accepted as an alias of WEBSITE_DOMAIN. Mutating requests from other origins are rejected. */
  websiteDomain: str("WEBSITE_DOMAIN", process.env.FRONTEND_ORIGIN || "http://localhost:3000").replace(/\/$/, ""),
  /** Extra origins allowed to call the API directly (comma separated). */
  corsOrigins: str("CORS_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  auth: {
    /**
     * 32-byte key (base64 or 64 hex chars) used to encrypt TOTP secrets at rest (AES-256-GCM).
     * Required in production. In development a fixed, clearly-insecure key is used if unset.
     */
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY || undefined,
    /** Issuer name shown in authenticator apps. */
    totpIssuer: str("TOTP_ISSUER", str("APP_NAME", "FE Panel")),
    /** Full session lifetime after password + TOTP. */
    sessionTtlHours: Number(str("SESSION_TTL_HOURS", "168")),
    /** Time allowed between the password step and finishing TOTP / password change. */
    pendingTtlMinutes: Number(str("PENDING_LOGIN_TTL_MINUTES", "10")),
    /** Secure flag on the session cookie (needs HTTPS). Defaults to true in production. */
    cookieSecure: bool("COOKIE_SECURE", isProd),
    /** Login attempts per email and per IP within the window. */
    loginMaxAttempts: Number(str("LOGIN_MAX_ATTEMPTS", "8")),
    rateLimitWindowMinutes: Number(str("RATE_LIMIT_WINDOW_MINUTES", "15")),
  },

  llm: {
    /** Bearer token. Optional for keyless local servers (Ollama); any placeholder works there. */
    apiKey: process.env.LLM_API_KEY || undefined,
    /** Any OpenAI-compatible chat completions base URL: Ollama (http://localhost:11434/v1), Groq, OpenRouter, OpenAI… */
    baseUrl: str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    model: str("LLM_MODEL", "gpt-4o-mini"),
    /** Per-request timeout. CPU-only local models need ~30–90 s per draft. */
    timeoutMs: Number(str("LLM_TIMEOUT_MS", "90000")),
    /** Max existing items sent as context (keeps prompts small for local models). */
    contextItems: Number(str("LLM_CONTEXT_ITEMS", "60")),
    /** When true and no LLM is configured, a deterministic mock drafts work items (dev only). */
    mock: bool("LLM_MOCK", false),
  },

  uploads: {
    blobToken: process.env.BLOB_READ_WRITE_TOKEN || undefined,
    localDir: str("UPLOAD_DIR", "uploads"),
    maxBytes: Number(str("UPLOAD_MAX_BYTES", String(5 * 1024 * 1024))),
  },
};

/**
 * Production fail-fast: refuse to start with missing or local-only settings when NODE_ENV=production.
 * Called from index.ts (not at import time, so CLI scripts such as create-admin still work).
 */
export function assertProductionConfig(): void {
  if (!config.isProd) return;
  const problems: string[] = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set");
  if (!process.env.TOTP_ENCRYPTION_KEY) problems.push("TOTP_ENCRYPTION_KEY is not set (openssl rand -base64 32)");
  if (!process.env.WEBSITE_DOMAIN && !process.env.FRONTEND_ORIGIN) problems.push("WEBSITE_DOMAIN (or FRONTEND_ORIGIN) is not set to the frontend URL");
  else if (!config.websiteDomain.startsWith("https://")) problems.push("WEBSITE_DOMAIN must be an https:// origin in production");
  if (!config.auth.cookieSecure) problems.push("COOKIE_SECURE must not be false in production");
  if (problems.length) throw new Error(`Refusing to start in production:\n  - ${problems.join("\n  - ")}`);
  if (bool("LLM_MOCK", false)) console.warn("  Note: LLM_MOCK is ignored in production (no mock AI drafts).");
}
