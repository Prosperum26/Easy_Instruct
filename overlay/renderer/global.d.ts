import type { OverlayApi } from "../preload.js";

declare global {
  interface Window {
    easyInstruct: OverlayApi;
  }
}

export {};
