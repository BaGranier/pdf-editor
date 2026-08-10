export type DesktopStartupStage =
  | "bootstrap"
  | "backend-status"
  | "backend-restart"
  | "react"
  | "window-error"
  | "unhandled-rejection";

export function logDesktopStartupError(
  stage: DesktopStartupStage,
  error: unknown,
  details?: string,
) {
  console.error(`[desktop:start:${stage}]`, error, details ?? "");
}

export function logDesktopReactMounted() {
  console.info("[desktop:start:react-mounted]");
}

export function installDesktopStartupDiagnostics() {
  window.addEventListener("error", (event) => {
    logDesktopStartupError("window-error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    logDesktopStartupError("unhandled-rejection", event.reason);
  });
}
