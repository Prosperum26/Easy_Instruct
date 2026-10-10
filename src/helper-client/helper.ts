/** What callers need from win-helper; HelperClient and FallbackHelper fit, tests use fakes. */
export interface Helper {
  request<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}
