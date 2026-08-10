import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopBackendGate } from "./DesktopBackendGate";

describe("DesktopBackendGate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not add a startup gate in web mode", () => {
    render(
      <DesktopBackendGate desktop={false}>
        {(url) => <p>Web URL: {url ?? "configuration web"}</p>}
      </DesktopBackendGate>,
    );

    expect(screen.getByText("Web URL: configuration web")).toBeInTheDocument();
    expect(screen.queryByText(/Démarrage du moteur/)).not.toBeInTheDocument();
  });

  it("shows the ready state and forwards the dynamic desktop URL", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const resolveStatus = vi
      .fn()
      .mockResolvedValueOnce({
        state: "starting",
        baseUrl: null,
        logPath: "/logs/pdf-engine.log",
        message: null,
      })
      .mockResolvedValue({
        state: "ready",
        baseUrl: "http://127.0.0.1:43127",
        logPath: "/logs/pdf-engine.log",
        message: null,
      });
    render(
      <DesktopBackendGate
        desktop
        resolveStatus={resolveStatus}
      >
        {(url) => <p>API: {url}</p>}
      </DesktopBackendGate>,
    );

    expect(screen.getByText("Démarrage du moteur PDF local…")).toBeInTheDocument();
    expect(await screen.findByText("Moteur PDF local prêt")).toBeInTheDocument();
    expect(screen.getByText("API: http://127.0.0.1:43127")).toBeInTheDocument();
    expect(resolveStatus).toHaveBeenCalledTimes(2);
    expect(consoleInfo).toHaveBeenCalledWith("[desktop:start:react-mounted]");
  });

  it("shows startup errors, the log path and retries", async () => {
    const restart = vi.fn().mockResolvedValue({
      state: "ready",
      baseUrl: "http://127.0.0.1:43128",
      logPath: "/logs/pdf-engine.log",
      message: null,
    });
    render(
      <DesktopBackendGate
        desktop
        resolveStatus={vi.fn().mockResolvedValue({
          state: "error",
          baseUrl: null,
          logPath: "/logs/pdf-engine.log",
          message: "Impossible de démarrer le moteur PDF local.",
        })}
        restart={restart}
      >
        {(url) => <p>API: {url}</p>}
      </DesktopBackendGate>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de démarrer le moteur PDF local.",
    );
    expect(screen.getByText("/logs/pdf-engine.log")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    await waitFor(() => expect(restart).toHaveBeenCalledOnce());
    expect(await screen.findByText("API: http://127.0.0.1:43128")).toBeInTheDocument();
  });

  it("shows and logs a visible fallback when backend status lookup fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const startupError = new Error("IPC unavailable");

    render(
      <DesktopBackendGate
        desktop
        resolveStatus={vi.fn().mockRejectedValue(startupError)}
      >
        {(url) => <p>API: {url}</p>}
      </DesktopBackendGate>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Impossible de démarrer le moteur PDF local.",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[desktop:start:backend-status]",
      startupError,
      "",
    );
    consoleError.mockRestore();
  });
});
