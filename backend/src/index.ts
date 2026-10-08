import supertokens from "supertokens-node";
import { middleware, errorHandler } from "supertokens-node/framework/express";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initSupertokens } from "./auth/supertokens.js";
import { supertokensAuthenticate } from "./auth/middleware.js";
import { llmMode } from "./lib/llm.js";

initSupertokens();

const app = createApp({
  authenticate: supertokensAuthenticate(),
  before: [middleware()],
  errorHandlers: [errorHandler()],
  corsAllowedHeaders: supertokens.getAllCORSHeaders(),
});

app.listen(config.port, () => {
  console.log(`DevHub API listening on http://localhost:${config.port}`);
  console.log(`  SuperTokens core: ${config.supertokens.connectionUri}`);
  console.log(`  SMS provider:     ${config.sms.provider}${config.sms.provider === "console" ? " (OTP codes are printed here)" : ""}`);
  console.log(`  AI drafting:      ${llmMode()}${llmMode() === "mock" ? " (deterministic dev mock, no LLM key)" : ""}`);
  console.log(`  Uploads:          ${config.uploads.blobToken ? "Vercel Blob" : `local disk (${config.uploads.localDir}/)`}`);
});
