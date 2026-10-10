import { inflate, physicalToCss, union, type Rect } from "../../src/shared/geometry.js";
import { placeBubble } from "../../src/shared/placement.js";
import type { ButtonId, DisplayInfo, RenderMessage } from "../../src/shared/protocol.js";
import { renderMarkdown } from "./markdown.js";
import { easeOutCubic, interpolateRects } from "./tween.js";

const HIGHLIGHT_PADDING = 6;
const HIGHLIGHT_RADIUS = 8;
const DIM_COLOR = "rgba(0, 0, 0, 0.6)";
const ANIMATION_MS = 200;
const ARROW_HALF = 7;

const BUTTON_LABELS: Record<ButtonId, string> = {
  back: "◀ Lùi",
  ask: "Hỏi",
  next: "Tiếp ▶",
  done: "Xong ✓",
  skip: "Bỏ qua",
  start: "Bắt đầu",
  exit: "Thoát",
  close: "Đóng",
};
const PRIMARY_BUTTONS = new Set<ButtonId>(["next", "done", "start", "close"]);

const api = window.easyInstruct;
const canvas = document.getElementById("dim") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const highlightLayer = document.getElementById("highlights")!;
const bubble = document.getElementById("bubble")!;
const statusPill = document.getElementById("status")!;

let currentRects: Rect[] = [];
let animationFrame = 0;
let interactive = false;
let bubbleShown = false;

function resizeCanvas() {
  const dpr = window.devicePixelRatio;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  drawFrame(currentRects);
}

function drawFrame(rects: Rect[]) {
  const dpr = window.devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.fillStyle = DIM_COLOR;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  ctx.globalCompositeOperation = "destination-out";
  for (const r of rects) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, HIGHLIGHT_RADIUS);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  while (highlightLayer.children.length > rects.length) highlightLayer.lastElementChild!.remove();
  while (highlightLayer.children.length < rects.length) {
    const el = document.createElement("div");
    el.className = "highlight";
    highlightLayer.append(el);
  }
  rects.forEach((r, i) => {
    const el = highlightLayer.children[i] as HTMLElement;
    Object.assign(el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
  });
}

function animateTo(target: Rect[]) {
  cancelAnimationFrame(animationFrame);
  const from = currentRects;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / ANIMATION_MS);
    currentRects = interpolateRects(from, target, easeOutCubic(t));
    drawFrame(currentRects);
    if (t < 1) animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function renderStep(step: RenderMessage, display: DisplayInfo) {
  const highlights = step.highlights.map((h) =>
    inflate(physicalToCss(h, display.scaleFactor, display.boundsPhysical), HIGHLIGHT_PADDING),
  );
  animateTo(highlights);
  renderBubble(step, highlights);
}

function renderBubble(step: RenderMessage, highlights: Rect[]) {
  bubble.querySelector(".label")!.textContent = step.label ?? "";
  bubble.querySelector(".title")!.textContent = step.title;
  bubble.querySelector(".body")!.innerHTML = renderMarkdown(step.bodyMd);
  bubble.classList.toggle("card", step.kind === "card");

  const buttons = bubble.querySelector(".buttons")!;
  buttons.replaceChildren(
    ...step.buttons.map((id) => {
      const button = document.createElement("button");
      button.textContent = BUTTON_LABELS[id];
      button.classList.toggle("primary", PRIMARY_BUTTONS.has(id));
      button.classList.toggle("left", id === "back" || id === "exit");
      button.addEventListener("click", () => api.send({ type: "button", stepId: step.stepId, button: id }));
      return button;
    }),
  );

  const target = step.kind === "card" ? null : union(highlights);
  const size = { w: bubble.offsetWidth, h: bubble.offsetHeight };
  const viewport = { w: window.innerWidth, h: window.innerHeight };
  const placement = placeBubble(target, highlights, size, viewport, { gap: 16, margin: 12 });

  // Skip the slide-in on first show so the bubble does not fly in from the corner.
  bubble.style.transition = bubbleShown ? "" : "none";
  bubble.style.left = `${placement.x}px`;
  bubble.style.top = `${placement.y}px`;
  bubble.dataset.side = placement.side;

  const arrow = bubble.querySelector<HTMLElement>(".arrow")!;
  const vertical = placement.side === "left" || placement.side === "right";
  arrow.style.top = vertical ? `${placement.arrowOffset - ARROW_HALF}px` : "";
  arrow.style.left = vertical ? "" : `${placement.arrowOffset - ARROW_HALF}px`;

  bubble.hidden = false;
  bubbleShown = true;
}

// The window ignores the mouse except over the bubble, so clicks reach the IDE underneath.
document.addEventListener("mousemove", (event) => {
  const over = !bubble.hidden && bubble.contains(event.target as Node);
  if (over !== interactive) {
    interactive = over;
    api.setInteractive(over);
  }
});

api.onMessage((message, display) => {
  switch (message.type) {
    case "render":
      renderStep(message, display);
      break;
    case "status":
      statusPill.textContent = message.text ?? "";
      statusPill.hidden = message.text === null;
      break;
    case "visibility":
      document.body.style.visibility = message.visible ? "visible" : "hidden";
      break;
    case "close":
      break;
  }
});

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
api.ready();
