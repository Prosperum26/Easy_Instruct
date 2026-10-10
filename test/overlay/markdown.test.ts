import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../overlay/renderer/markdown.js";

describe("renderMarkdown", () => {
  it("wraps plain text in a paragraph", () => {
    expect(renderMarkdown("Xin chào")).toBe("<p>Xin chào</p>");
  });

  it("escapes raw HTML", () => {
    expect(renderMarkdown('<img src=x onerror="alert(1)">')).toBe(
      "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>",
    );
  });

  it("renders bold, italic and inline code", () => {
    expect(renderMarkdown("**đậm** và *nghiêng* và `npm i`")).toBe(
      "<p><strong>đậm</strong> và <em>nghiêng</em> và <code>npm i</code></p>",
    );
  });

  it("does not apply emphasis inside inline code", () => {
    expect(renderMarkdown("`a*b*c`")).toBe("<p><code>a*b*c</code></p>");
  });

  it("splits paragraphs on blank lines and keeps single line breaks", () => {
    expect(renderMarkdown("dòng 1\ndòng 2\n\ndòng 3")).toBe("<p>dòng 1<br>dòng 2</p><p>dòng 3</p>");
  });

  it("renders fenced code blocks verbatim and escaped", () => {
    expect(renderMarkdown("Gõ lệnh:\n\n```bash\nnpm install <pkg>\n```")).toBe(
      "<p>Gõ lệnh:</p><pre><code>npm install &lt;pkg&gt;</code></pre>",
    );
  });

  it("renders unordered lists", () => {
    expect(renderMarkdown("- `app/`: code chính\n- `tests/`: test")).toBe(
      "<ul><li><code>app/</code>: code chính</li><li><code>tests/</code>: test</li></ul>",
    );
  });

  it("renders ordered lists", () => {
    expect(renderMarkdown("1. Cài\n2. Chạy")).toBe("<ol><li>Cài</li><li>Chạy</li></ol>");
  });
});
