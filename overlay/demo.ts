import type { Rect } from "../src/shared/geometry.js";
import type { RenderMessage } from "../src/shared/protocol.js";

/** Reads `--rect=x,y,w,h` (physical pixels) from argv, used to check DPI mapping by hand. */
export function parseRectArg(argv: string[]): Rect | null {
  const arg = argv.find((a) => a.startsWith("--rect="));
  if (!arg) return null;
  const parts = arg.slice("--rect=".length).split(",").map(Number);
  const [x, y, w, h] = parts;
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || w <= 0 || h <= 0) {
    throw new Error(`Invalid --rect value "${arg}", expected --rect=x,y,w,h with positive w and h`);
  }
  return { x, y, w, h };
}

/** Reads the 1-based `--step=N` flag and returns the step index to open the demo at. */
export function parseStepArg(argv: string[], stepCount: number): number {
  const arg = argv.find((a) => a.startsWith("--step="));
  if (!arg) return 0;
  const step = Number(arg.slice("--step=".length));
  if (!Number.isInteger(step) || step < 1 || step > stepCount) {
    throw new Error(`Invalid --step value "${arg}", expected a number from 1 to ${stepCount}`);
  }
  return step - 1;
}

/** A fixed walkthrough over a display (physical pixels) exercising every step mode. */
export function buildDemoSteps(display: Rect): RenderMessage[] {
  const at = (fx: number, fy: number, fw: number, fh: number): Rect => ({
    x: Math.round(display.x + display.w * fx),
    y: Math.round(display.y + display.h * fy),
    w: Math.round(display.w * fw),
    h: Math.round(display.h * fh),
  });

  const steps: Omit<RenderMessage, "type" | "stepId" | "label">[] = [
    {
      kind: "card",
      mode: "read",
      title: "Chào mừng tới Easy Instruct",
      bodyMd:
        "Đây là bản demo **M1**: lớp phủ, vùng sáng và bong bóng với vị trí cố định.\n\nBạn vẫn có thể click và gõ vào các cửa sổ bên dưới lớp mờ.",
      highlights: [],
      buttons: ["exit", "start"],
    },
    {
      kind: "bubble",
      mode: "read",
      title: "Cây thư mục",
      bodyMd: "Trong IDE, vùng này thường là **Explorer**:\n\n- `src/`: code chính\n- `tests/`: test",
      highlights: [at(0.03, 0.08, 0.17, 0.6)],
      buttons: ["back", "ask", "next"],
    },
    {
      kind: "bubble",
      mode: "click",
      title: "Bước click",
      bodyMd: "Ở bước kiểu `click`, bạn tự click vào vùng sáng. Tự nhận click sẽ có ở **M5**, giờ bấm *Bỏ qua*.",
      highlights: [at(0.4, 0.05, 0.2, 0.06)],
      buttons: ["back", "ask", "skip"],
    },
    {
      kind: "bubble",
      mode: "do",
      title: "Bước thực hành",
      bodyMd: "Vùng này giống **terminal**. Gõ lệnh rồi Enter:\n\n```bash\nnpm install\n```\n\nChạy xong bấm **Xong**.",
      highlights: [at(0.22, 0.7, 0.75, 0.24)],
      buttons: ["back", "ask", "done"],
    },
    {
      kind: "bubble",
      mode: "read",
      title: "Nhiều vùng sáng",
      bodyMd: "Một bước có thể tô sáng tối đa **3 vùng** cùng lúc, ví dụ định nghĩa hàm và chỗ gọi nó.",
      highlights: [at(0.3, 0.2, 0.3, 0.12), at(0.3, 0.45, 0.3, 0.08)],
      buttons: ["back", "ask", "next"],
    },
    {
      kind: "card",
      mode: "read",
      title: "Hết demo",
      bodyMd: "Phím tắt: `Ctrl+Alt+H` ẩn/hiện lớp phủ, `Ctrl+Alt+Q` thoát.",
      highlights: [],
      buttons: ["back", "close"],
    },
  ];

  return steps.map((step, i) => ({
    ...step,
    type: "render",
    stepId: `demo-${i + 1}`,
    label: step.kind === "bubble" ? `Bước ${i}/${steps.length - 2}` : undefined,
  }));
}

/** A single step highlighting an exact physical rect, for checking DPI mapping by hand. */
export function buildRectCheckStep(rect: Rect): RenderMessage {
  return {
    type: "render",
    stepId: "rect-check",
    kind: "bubble",
    mode: "read",
    title: "Kiểm tra tọa độ",
    bodyMd: `Vùng sáng phải nằm đúng tại \`x=${rect.x}, y=${rect.y}, w=${rect.w}, h=${rect.h}\` (pixel vật lý).`,
    highlights: [rect],
    buttons: ["close"],
  };
}
