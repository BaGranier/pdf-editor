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
import { AppStateScreen } from "./AppStateScreen";

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
      <AppStateScreen
        state="loading"
        title="Démarrage en cours"
        description="Démarrage du moteur PDF local…"
      />
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
      <AppStateScreen
        state="error"
        title="Impossible de démarrer"
        description={state.status.message ?? "Impossible de démarrer le moteur PDF local."}
        action={<button type="button" onClick={() => void retry()}>Réessayer</button>}
        details={state.status.logPath ? <>Journal : <code>{state.status.logPath}</code></> : undefined}
      />
    );
  }

  // A healthy local backend is not a persistent workspace status. Keeping the
  // application as the direct root also lets its height chain match the Tauri
  // window exactly; startup and failure states above remain explicit.
  return children(state.status.baseUrl);
}
