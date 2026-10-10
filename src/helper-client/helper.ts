/** A line win-helper prints on its own (no request id), e.g. {event: "click", x, y}. */
export interface HelperEvent {
  event: string;
  [key: string]: unknown;
}

/** What callers need from win-helper; HelperClient and FallbackHelper fit, tests use fakes. */
export interface Helper {
  request<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  onEvent?(listener: (event: HelperEvent) => void): void;
}
