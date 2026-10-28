import { z } from "zod";
import type { ChatMessage } from "./draft.js";

/**
 * AI "Rephrase" for a work item's notes: rewrites rough notes into clear, professional, well-structured
 * plain text. The server only returns the suggestion; the admin accepts or discards it in the form.
 */
export function buildRephraseMessages(text: string, title?: string): ChatMessage[] {
  const system = [
    "You are an editor for a frontend engineering team's task tracker.",
    "Rewrite the user's task notes so they are easy to read, professional and well structured.",
    "Rules:",
    "- Keep every fact, name, number, date, URL, code identifier and decision. Do not invent details, owners, dates or steps that aren't in the notes.",
    "- Fix spelling, grammar and punctuation; use concise, neutral, professional British English (unless the notes are in another language: then keep that language).",
    "- Structure: a one or two sentence summary first, then short paragraphs or '- ' bullet points (one idea per bullet). Use a short label line ending with ':' (e.g. 'Steps:', 'Open questions:') only when it helps.",
    "- Plain text only: no Markdown headings (#), no bold/italics (** or _), no tables, no code fences. Keep inline code identifiers as they are.",
    "- Don't add a title, greeting, sign-off or any commentary about the rewrite.",
    'Answer with a JSON object only: {"text": "<rewritten notes>"} (use \\n for line breaks).',
  ].join("\n");
  const user = `${title ? `Task title (context only, don't repeat it): ${title}\n\n` : ""}Notes to rewrite:\n"""\n${text}\n"""`;
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

const replySchema = z.object({ text: z.string().trim().min(1).max(20000) });

export class RephraseParseError extends Error {}

/** Extracts the rewritten text from the model's JSON answer (tolerates code fences / surrounding prose). */
export function parseRephraseResponse(reply: string): string {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new RephraseParseError("no JSON object in the answer");
  let data: unknown;
  try {
    data = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new RephraseParseError("the answer wasn't valid JSON");
  }
  const parsed = replySchema.safeParse(data);
  if (!parsed.success) throw new RephraseParseError('expected {"text": "..."} with non-empty text');
  // Normalise line endings and trailing spaces; collapse 3+ blank lines.
  return parsed.data.text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Dev-only mock (no LLM configured): tidies whitespace and capitalises lines, so the UI flow can be tried. */
export function mockRephrase(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .map((l) => (l.startsWith("- ") || l.startsWith("* ") ? `- ${cap(l.slice(2))}` : cap(l)))
    .map((l) => (l && !/[.!?:]$/.test(l) ? `${l}.` : l));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
