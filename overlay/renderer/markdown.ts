/**
 * Minimal, safe Markdown for bubble bodies: paragraphs, line breaks, **bold**, *italic*,
 * `inline code`, fenced code blocks and simple lists. All input is HTML-escaped first.
 */
export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${renderInline(i)}</li>`).join("")}</${list.tag}>`);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      flushParagraph();
      flushList();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trimStart().startsWith("```"); i++) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return out.join("");
}

function renderInline(text: string): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part)
            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.+?)\*/g, "<em>$1</em>"),
    )
    .join("");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
