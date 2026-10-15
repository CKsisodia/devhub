import { createApp } from "./app.js";
import { assertProductionConfig, config } from "./config.js";
import { parseKey, usingDevKey } from "./lib/crypto.js";
import { llmMode } from "./lib/llm.js";

assertProductionConfig(); // fail fast on missing production settings
parseKey(config.auth.totpEncryptionKey, config.isProd); // fail fast on a missing / malformed key in production

const app = createApp();

app.listen(config.port, () => {
  console.log(`DevHub API listening on http://localhost:${config.port}`);
  console.log(`  Auth:             email + password, then TOTP (authenticator app)`);
  console.log(`  TOTP secret key:  ${usingDevKey() ? "built-in DEV key (set TOTP_ENCRYPTION_KEY before deploying)" : "TOTP_ENCRYPTION_KEY"}`);
  console.log(`  Session cookie:   ${config.auth.cookieSecure ? "Secure (HTTPS only)" : "not Secure (local HTTP)"}, ${config.auth.sessionTtlHours} h`);
  console.log(`  AI drafting:      ${llmMode()}${llmMode() === "mock" ? " (deterministic dev mock, no LLM configured)" : llmMode() === "llm" ? ` (${config.llm.model} @ ${config.llm.baseUrl})` : ""}`);
  console.log(`  Uploads:          ${config.uploads.blobToken ? "Vercel Blob" : `local disk (${config.uploads.localDir}/)`}`);
});
