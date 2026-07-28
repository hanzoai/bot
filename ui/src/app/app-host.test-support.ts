import { vi } from "vitest";
import type { ApplicationContext } from "./context.ts";

export type ShellKeyboardState = {
  runtime: { context: ApplicationContext };
  handleDocumentKeydown: (event: KeyboardEvent) => void;
};

export function resetAppHostTestGlobals(): void {
  vi.useRealTimers();
  Reflect.deleteProperty(window, "webkit");
  document.documentElement.classList.remove(
    "bot-native-macos",
    "bot-native-nav",
    "bot-native-web-chrome",
  );
  vi.unstubAllGlobals();
}
