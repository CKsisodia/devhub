/**
 * Doc content is stored as Markdown. The editor splits it into blocks:
 *  - text:    any Markdown (headings, lists, tables, code blocks, links)
 *  - mermaid: ```mermaid fenced block
 *  - chart:   ```chart fenced block containing JSON {type, title, data:[{label, value}]}
 *  - image:   a line that is only ![alt](url)
 */
export type Block =
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "mermaid"; code: string }
  | { id: string; kind: "chart"; json: string }
  | { id: string; kind: "image"; url: string; alt: string };

let counter = 0;
export const newId = () => `b${Date.now().toString(36)}${(counter++).toString(36)}`;

export function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let text: string[] = [];
  let inOtherFence = false;

  const flushText = () => {
    const t = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (t) blocks.push({ id: newId(), kind: "text", text: t });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!inOtherFence) {
      const special = trimmed.match(/^```(mermaid|chart)\s*$/);
      if (special) {
        const body: string[] = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== "```") body.push(lines[j++]);
        flushText();
        if (special[1] === "mermaid") blocks.push({ id: newId(), kind: "mermaid", code: body.join("\n") });
        else blocks.push({ id: newId(), kind: "chart", json: body.join("\n") });
        i = j;
        continue;
      }
      const img = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
      if (img) {
        flushText();
        blocks.push({ id: newId(), kind: "image", alt: img[1], url: img[2] });
        continue;
      }
    }
    if (trimmed.startsWith("```")) inOtherFence = !inOtherFence;
    text.push(line);
  }
  flushText();
  return blocks;
}

export function serializeBlocks(blocks: Block[]): string {
  return (
    blocks
      .map((b) => {
        switch (b.kind) {
          case "text":
            return b.text.trim();
          case "mermaid":
            return "```mermaid\n" + b.code.trim() + "\n```";
          case "chart":
            return "```chart\n" + b.json.trim() + "\n```";
          case "image":
            return `![${b.alt.replace(/[[\]]/g, "")}](${b.url})`;
        }
      })
      .filter(Boolean)
      .join("\n\n") + "\n"
  );
}
