import { useEffect, useState, type ReactNode } from "react";
import {
  getDesktopBackendStatus,
  isDesktopRuntime,
  restartDesktopBackend,
  type DesktopBackendStatus,
} from "../api/backend";
import {
  logDesktopReactMounted,
  logDesktopStartupError,
} from "../desktop/startupDiagnostics";

type DesktopBackendGateProps = {
  children: (backendBaseUrl: string | null) => ReactNode;
  desktop?: boolean;
  resolveStatus?: () => Promise<DesktopBackendStatus>;
  restart?: () => Promise<DesktopBackendStatus>;
};

type GateState =
  | { kind: "starting" }
  | { kind: "ready"; status: DesktopBackendStatus }
  | { kind: "error"; status: DesktopBackendStatus };

const UNKNOWN_ERROR: DesktopBackendStatus = {
  state: "error",
  baseUrl: null,
  logPath: "",
  message: "Impossible de démarrer le moteur PDF local.",
};

function stateFromStatus(status: DesktopBackendStatus): GateState {
  if (status.state === "starting") {
    return { kind: "starting" };
  }
  return status.state === "ready"
    ? { kind: "ready", status }
    : { kind: "error", status };
}

export function DesktopBackendGate({
  children,
  desktop = isDesktopRuntime(),
  resolveStatus = getDesktopBackendStatus,
  restart = restartDesktopBackend,
}: DesktopBackendGateProps) {
  const [state, setState] = useState<GateState>({ kind: "starting" });

  useEffect(() => {
    if (desktop) {
      logDesktopReactMounted();
    }
  }, [desktop]);

  useEffect(() => {
    if (!desktop) {
      return;
    }

    let active = true;
    const pollStatus = async () => {
      try {
        while (active) {
          const status = await resolveStatus();
          if (status.state !== "starting") {
            setState(stateFromStatus(status));
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 150));
        }
      } catch (error) {
        logDesktopStartupError("backend-status", error);
        if (active) {
          setState({ kind: "error", status: UNKNOWN_ERROR });
        }
      }
    };
    void pollStatus();
    return () => {
      active = false;
    };
  }, [desktop, resolveStatus]);

  if (!desktop) {
    return children(null);
  }

  if (state.kind === "starting") {
    return (
      <main className="desktop-backend-state" aria-live="polite">
        <h1>PDF Studio Local</h1>
        <p>Démarrage du moteur PDF local…</p>
      </main>
    );
  }

  if (state.kind === "error") {
    const retry = async () => {
      setState({ kind: "starting" });
      try {
        setState(stateFromStatus(await restart()));
      } catch (error) {
        logDesktopStartupError("backend-restart", error);
        setState({ kind: "error", status: UNKNOWN_ERROR });
      }
    };

    return (
      <main className="desktop-backend-state" role="alert">
        <h1>PDF Studio Local</h1>
        <p>{state.status.message || UNKNOWN_ERROR.message}</p>
        {state.status.logPath ? (
          <p className="desktop-backend-log">
            Journal : <code>{state.status.logPath}</code>
          </p>
        ) : null}
        <button type="button" onClick={() => void retry()}>
          Réessayer
        </button>
      </main>
    );
  }

  return (
    <div className="desktop-app-shell">
      <p className="desktop-backend-ready" role="status">
        Moteur PDF local prêt
      </p>
      {children(state.status.baseUrl)}
    </div>
  );
}
