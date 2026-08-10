import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEB_BACKEND_BASE_URL,
  getDesktopBackendStatus,
  getWebBackendBaseUrl,
  isDesktopRuntime,
  restartDesktopBackend,
} from "./backend";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("backend URL resolution", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("keeps the existing web backend default", () => {
    expect(getWebBackendBaseUrl(undefined)).toBe(DEFAULT_WEB_BACKEND_BASE_URL);
    expect(getWebBackendBaseUrl("http://127.0.0.1:9000/")).toBe(
      "http://127.0.0.1:9000",
    );
  });

  it("detects a mocked Tauri runtime without depending on Tauri", () => {
    expect(isDesktopRuntime({} as Window)).toBe(false);
    expect(
      isDesktopRuntime({ __TAURI_INTERNALS__: { invoke: () => undefined } } as unknown as Window),
    ).toBe(true);
  });

  it("uses the named Tauri invoke export for desktop commands", async () => {
    invokeMock
      .mockResolvedValueOnce({
        state: "ready",
        baseUrl: "http://127.0.0.1:43127/",
        logPath: "/logs/pdf-engine.log",
        message: null,
      })
      .mockResolvedValueOnce({
        state: "starting",
        baseUrl: null,
        logPath: "/logs/pdf-engine.log",
        message: null,
      });

    await expect(getDesktopBackendStatus()).resolves.toMatchObject({
      state: "ready",
      baseUrl: "http://127.0.0.1:43127",
    });
    await expect(restartDesktopBackend()).resolves.toMatchObject({
      state: "starting",
      baseUrl: null,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_backend_status");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "restart_backend");
  });
});
