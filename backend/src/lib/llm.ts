import { config } from "../config.js";
import { HttpError } from "./errors.js";
import { buildMessages, buildRepairMessage, DraftParseError, mockLlmReply, parseDraftResponse, type ChatMessage, type DraftContext, type DraftResult } from "./draft.js";

export type DraftSource = "llm" | "mock";

/** Local / self-hosted OpenAI-compatible servers that don't need an API key (e.g. Ollama). */
export function isKeylessBaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return ["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal"].includes(u.hostname) || u.port === "11434";
  } catch {
    return false;
  }
}

/** An LLM is configured when there is an API key, or the base URL points at a keyless local server. */
export function llmConfigured(): boolean {
  return Boolean(config.llm.apiKey) || isKeylessBaseUrl(config.llm.baseUrl);
}

export function llmMode(): DraftSource | "disabled" {
  if (llmConfigured()) return "llm";
  if (config.llm.mock && !config.isProd) return "mock";
  return "disabled";
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** One chat-completions call in JSON mode. Exported for tests (fetch is mocked there). */
export async function callChatCompletions(messages: ChatMessage[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.llm.apiKey) headers.Authorization = `Bearer ${config.llm.apiKey}`;
  let res: Response;
  try {
    res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: 0.2,
        stream: false,
        // JSON mode: supported by OpenAI, Groq, OpenRouter (most models) and Ollama's /v1 endpoint.
        response_format: { type: "json_object" },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      console.error(`[ai] LLM request timed out after ${config.llm.timeoutMs} ms`);
      throw new HttpError(504, `The AI model took longer than ${Math.round(config.llm.timeoutMs / 1000)} s. Try a shorter request, or add items manually.`);
    }
    console.error("[ai] LLM request failed", e);
    const local = isKeylessBaseUrl(config.llm.baseUrl);
    throw new HttpError(
      503,
      local
        ? `The local AI server (${hostOf(config.llm.baseUrl)}) isn't reachable. Is Ollama running? Start it with "ollama serve" (or "brew services start ollama"), or add items manually.`
        : `Couldn't reach the AI service (${hostOf(config.llm.baseUrl)}). Try again or add items manually.`,
    );
  }
  try {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[ai] LLM API error ${res.status}: ${text.slice(0, 500)}`);
      if (res.status === 404 && /model/i.test(text)) {
        throw new HttpError(502, `The AI model "${config.llm.model}" isn't available on ${hostOf(config.llm.baseUrl)}. For Ollama run: ollama pull ${config.llm.model}`);
      }
      if (res.status === 401 || res.status === 403) throw new HttpError(502, "The AI service rejected the API key (LLM_API_KEY).");
      if (res.status === 429) throw new HttpError(503, "The AI service is rate-limiting requests. Wait a moment and try again.");
      throw new HttpError(502, "Couldn't draft items: the AI service returned an error. Try again or add an item manually.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "Couldn't draft items: the AI returned an empty answer.");
    return content;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (controller.signal.aborted) throw new HttpError(504, `The AI model took longer than ${Math.round(config.llm.timeoutMs / 1000)} s. Try a shorter request, or add items manually.`);
    console.error("[ai] LLM response failed", e);
    throw new HttpError(502, "Couldn't read the AI service's answer. Try again or add items manually.");
  } finally {
    clearTimeout(timer);
  }
}

export async function draftWorkItems(prompt: string, ctx: DraftContext): Promise<DraftResult & { source: DraftSource; model?: string; ms: number }> {
  const mode = llmMode();
  if (mode === "disabled") {
    throw new HttpError(
      503,
      "AI drafting isn't configured. Set LLM_BASE_URL / LLM_MODEL (and LLM_API_KEY for hosted providers) on the backend, or add items manually.",
    );
  }
  const started = Date.now();
  if (mode === "mock") return { ...parseDraftResponse(mockLlmReply(prompt, ctx), ctx), source: "mock", ms: Date.now() - started };

  const messages = buildMessages(prompt, ctx, config.llm.contextItems);
  let reply = await callChatCompletions(messages);
  let result: DraftResult;
  try {
    result = parseDraftResponse(reply, ctx);
  } catch (e) {
    if (!(e instanceof DraftParseError)) throw e;
    // One retry: show the model its answer and the problem, ask for the JSON object only.
    console.warn(`[ai] invalid model output (${e.message}); retrying once`);
    reply = await callChatCompletions([...messages, { role: "assistant", content: reply.slice(0, 4000) }, buildRepairMessage(e.message)]);
    try {
      result = parseDraftResponse(reply, ctx);
    } catch (e2) {
      if (e2 instanceof DraftParseError) throw new HttpError(502, `Couldn't draft items: the AI answer wasn't in the expected format twice. Try rephrasing or add an item manually. (${e2.message})`);
      throw e2;
    }
  }
  const ms = Date.now() - started;
  console.log(`[ai] ${ctx.type} draft by ${config.llm.model} in ${ms} ms: ${result.creates.length} creates, ${result.updates.length} updates`);
  return { ...result, source: "llm", model: config.llm.model, ms };
}
