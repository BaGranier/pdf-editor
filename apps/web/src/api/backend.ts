import { invoke } from "@tauri-apps/api/core";

export const DEFAULT_WEB_BACKEND_BASE_URL = "http://localhost:8000";

export type DesktopBackendStatus = {
  state: "starting" | "ready" | "error";
  baseUrl: string | null;
  logPath: string;
  message: string | null;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
};

export function getWebBackendBaseUrl(
  configuredUrl: string | undefined = import.meta.env.VITE_PDF_ENGINE_URL,
): string {
  return (configuredUrl?.trim() || DEFAULT_WEB_BACKEND_BASE_URL).replace(/\/$/, "");
}

export function isDesktopRuntime(candidate: Window = window): boolean {
  return "__TAURI_INTERNALS__" in (candidate as TauriWindow);
}

function validateDesktopStatus(value: DesktopBackendStatus): DesktopBackendStatus {
  if (value.state === "ready" && !value.baseUrl) {
    throw new Error("Le moteur PDF local n'a fourni aucune adresse.");
  }
  return {
    ...value,
    baseUrl: value.baseUrl?.replace(/\/$/, "") ?? null,
  };
}

export async function getDesktopBackendStatus(): Promise<DesktopBackendStatus> {
  return validateDesktopStatus(
    await invoke<DesktopBackendStatus>("get_backend_status"),
  );
}

export async function restartDesktopBackend(): Promise<DesktopBackendStatus> {
  return validateDesktopStatus(
    await invoke<DesktopBackendStatus>("restart_backend"),
  );
}
