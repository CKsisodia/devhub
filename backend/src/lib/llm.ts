import { config } from "../config.js";
import { HttpError } from "./errors.js";
import { buildMessages, DraftParseError, mockLlmReply, parseDraftResponse, type DraftContext, type DraftResult } from "./draft.js";

export type DraftSource = "llm" | "mock";

export function llmMode(): DraftSource | "disabled" {
  if (config.llm.apiKey) return "llm";
  if (config.llm.mock && !config.isProd) return "mock";
  return "disabled";
}

async function callChatCompletions(messages: ReturnType<typeof buildMessages>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.llm.apiKey}` },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[ai] LLM API error ${res.status}: ${text.slice(0, 500)}`);
      throw new HttpError(502, "Couldn't draft tasks: the AI service returned an error. Try again or add a task manually.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new HttpError(502, "Couldn't draft tasks: the AI returned an empty answer.");
    return content;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("[ai] LLM request failed", e);
    throw new HttpError(502, "Couldn't reach the AI service. Try again or add a task manually.");
  } finally {
    clearTimeout(timer);
  }
}

export async function draftTasks(prompt: string, ctx: DraftContext): Promise<DraftResult & { source: DraftSource }> {
  const mode = llmMode();
  if (mode === "disabled") {
    throw new HttpError(
      503,
      "AI drafting isn't configured. Set LLM_API_KEY (and optionally LLM_BASE_URL / LLM_MODEL) on the backend, or add tasks manually.",
    );
  }
  const reply = mode === "llm" ? await callChatCompletions(buildMessages(prompt, ctx)) : mockLlmReply(prompt, ctx);
  try {
    return { ...parseDraftResponse(reply, ctx), source: mode };
  } catch (e) {
    if (e instanceof DraftParseError) {
      throw new HttpError(502, `Couldn't draft tasks. Try rephrasing or add a task manually. (${e.message})`);
    }
    throw e;
  }
}
