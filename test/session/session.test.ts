import { beforeEach, describe, expect, it } from "vitest";
import { Session, type StepInput } from "../../src/session/session.js";
import type { ButtonId } from "../../src/shared/protocol.js";

const step = (title: string, overrides: Partial<StepInput> = {}): StepInput => ({
  kind: "bubble",
  title,
  bodyMd: `${title} body`,
  mode: "read",
  highlights: [{ x: 10, y: 10, w: 100, h: 40 }],
  actionButtons: ["ask", "next"],
  ...overrides,
});

const press = (session: Session, stepId: string, button: ButtonId) =>
  session.handleOverlay({ type: "button", stepId, button });

describe("Session.showStep", () => {
  let session: Session;
  beforeEach(() => (session = new Session()));

  it("assigns sequential step ids and renders the new step", () => {
    const first = session.showStep(step("A"));
    const second = session.showStep(step("B"));
    expect(first.render.stepId).toBe("s1");
    expect(second.render.stepId).toBe("s2");
    expect(second.render.title).toBe("B");
  });

  it("omits the back button on the first step and adds it afterwards", () => {
    expect(session.showStep(step("A")).render.buttons).toEqual(["ask", "next"]);
    expect(session.showStep(step("B")).render.buttons).toEqual(["back", "ask", "next"]);
  });

  it("clears the waiting status", () => {
    expect(session.showStep(step("A")).status).toBeNull();
  });

  it("jumps to the new step even while the user is looking at an older one", () => {
    session.showStep(step("A"));
    session.showStep(step("B"));
    press(session, "s2", "back");
    const shown = session.showStep(step("C"));
    expect(shown.render.stepId).toBe("s3");
    expect(session.currentRender()?.stepId).toBe("s3");
  });

  it("drops queued advance events from older steps but keeps questions", () => {
    session.showStep(step("A"));
    session.handleOverlay({ type: "ask", stepId: "s1", question: "Tại sao?" });
    press(session, "s1", "next");
    session.showStep(step("B"));
    expect(session.takeEvent()).toEqual({ event: "ask", stepId: "s1", question: "Tại sao?" });
    expect(session.takeEvent()).toBeUndefined();
  });
});

describe("Session local navigation", () => {
  let session: Session;
  beforeEach(() => {
    session = new Session();
    session.showStep(step("A"));
    session.showStep(step("B", { mode: "do", actionButtons: ["ask", "done"] }));
    session.showStep(step("C"));
  });

  it("goes back locally without waking the agent", () => {
    const effects = press(session, "s3", "back");
    expect(effects.render?.stepId).toBe("s2");
    expect(session.takeEvent()).toBeUndefined();
  });

  it("re-renders the first step without a back button", () => {
    press(session, "s3", "back");
    const effects = press(session, "s2", "back");
    expect(effects.render?.stepId).toBe("s1");
    expect(effects.render?.buttons).toEqual(["ask", "next"]);
  });

  it("ignores back on the first step", () => {
    press(session, "s3", "back");
    press(session, "s2", "back");
    expect(press(session, "s1", "back")).toEqual({});
  });

  it("moves forward locally through steps already seen, including do steps", () => {
    press(session, "s3", "back");
    press(session, "s2", "back");
    expect(press(session, "s1", "next").render?.stepId).toBe("s2");
    expect(press(session, "s2", "done").render?.stepId).toBe("s3");
    expect(session.takeEvent()).toBeUndefined();
  });

  it("ignores events for a step that is not on screen", () => {
    press(session, "s3", "back");
    expect(press(session, "s3", "next")).toEqual({});
    expect(session.takeEvent()).toBeUndefined();
  });
});

describe("Session events for the agent", () => {
  let session: Session;
  beforeEach(() => {
    session = new Session();
    session.showStep(step("A"));
  });

  it("queues next on the newest step and shows a waiting status", () => {
    const effects = press(session, "s1", "next");
    expect(effects.status).toBe("Đang chờ AI…");
    expect(session.takeEvent()).toEqual({ event: "next", stepId: "s1" });
  });

  it("ignores a double click on the newest step", () => {
    press(session, "s1", "next");
    expect(press(session, "s1", "next")).toEqual({});
    session.takeEvent();
    expect(session.takeEvent()).toBeUndefined();
  });

  it("reports done and skip as their own events", () => {
    session.showStep(step("B", { mode: "do", actionButtons: ["ask", "done"] }));
    press(session, "s2", "done");
    expect(session.takeEvent()).toEqual({ event: "done", stepId: "s2" });
    session.showStep(step("C", { mode: "click", actionButtons: ["ask", "skip"] }));
    press(session, "s3", "skip");
    expect(session.takeEvent()).toEqual({ event: "skip", stepId: "s3" });
  });

  it("reports start on the intro card as next", () => {
    const intro = new Session();
    intro.showStep(step("Intro", { kind: "card", actionButtons: ["exit", "start"] }));
    press(intro, "s1", "start");
    expect(intro.takeEvent()).toEqual({ event: "next", stepId: "s1" });
  });

  it("queues questions about the step being viewed, even an older one", () => {
    session.showStep(step("B"));
    press(session, "s2", "back");
    session.handleOverlay({ type: "ask", stepId: "s1", question: "  Cái này là gì?  " });
    expect(session.takeEvent()).toEqual({ event: "ask", stepId: "s1", question: "Cái này là gì?" });
  });

  it("ignores empty questions", () => {
    session.handleOverlay({ type: "ask", stepId: "s1", question: "   " });
    expect(session.takeEvent()).toBeUndefined();
  });

  it("returns events in the order they happened", () => {
    session.handleOverlay({ type: "ask", stepId: "s1", question: "Một" });
    press(session, "s1", "next");
    expect(session.takeEvent()?.event).toBe("ask");
    expect(session.takeEvent()?.event).toBe("next");
  });
});

describe("Session exit and ending", () => {
  let session: Session;
  beforeEach(() => {
    session = new Session();
    session.showStep(step("A"));
  });

  it("queues exit, closes the overlay and ends the session", () => {
    const effects = press(session, "s1", "exit");
    expect(effects.close).toBe(true);
    expect(session.phase).toBe("ended");
    expect(session.takeEvent()).toEqual({ event: "exit", stepId: "s1", reason: "user" });
  });

  it("accepts exit from any step on screen, even while waiting", () => {
    press(session, "s1", "next");
    expect(press(session, "s1", "exit").close).toBe(true);
  });

  it("shows the summary card without a back button when ending", () => {
    session.showStep(step("B"));
    const { render } = session.end("Tổng kết", "Bạn đã học xong");
    expect(render.kind).toBe("card");
    expect(render.buttons).toEqual(["close"]);
    expect(session.phase).toBe("ending");
  });

  it("closes without telling the agent when the summary card is closed", () => {
    const { render } = session.end("Tổng kết", "xong");
    const effects = press(session, render.stepId, "close");
    expect(effects.close).toBe(true);
    expect(session.phase).toBe("ended");
    expect(session.takeEvent()).toBeUndefined();
  });

  it("ignores other buttons while the summary card is shown", () => {
    const { render } = session.end("Tổng kết", "xong");
    expect(press(session, render.stepId, "back")).toEqual({});
  });

  it("ends with an exit event when the overlay is lost", () => {
    session.abort("overlay_crashed");
    expect(session.phase).toBe("ended");
    expect(session.takeEvent()).toEqual({ event: "exit", stepId: "s1", reason: "overlay_crashed" });
  });
});
