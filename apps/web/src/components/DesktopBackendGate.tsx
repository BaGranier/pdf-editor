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
const READY_POLL_DELAY_MS = 1_000;

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
  const [sessionBackendUrl, setSessionBackendUrl] = useState<string | null>(null);

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
          const nextState = stateFromStatus(status);
          if (status.state === "ready") setSessionBackendUrl(status.baseUrl);
          setState(nextState);
          await new Promise((resolve) => window.setTimeout(
            resolve,
            status.state === "starting" ? 150 : READY_POLL_DELAY_MS,
          ));
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

  let screen: ReactNode = null;
  if (state.kind === "starting") {
    screen = (
      <AppStateScreen
        state="loading"
        title="Démarrage en cours"
        description="Démarrage du moteur PDF local…"
      />
    );
  } else if (state.kind === "error") {
    const retry = async () => {
      setState({ kind: "starting" });
      try {
        const status = await restart();
        if (status.state === "ready") setSessionBackendUrl(status.baseUrl);
        setState(stateFromStatus(status));
      } catch (error) {
        logDesktopStartupError("backend-restart", error);
        setState({ kind: "error", status: UNKNOWN_ERROR });
      }
    };

    screen = (
      <AppStateScreen
        state="error"
        title="Impossible de démarrer"
        description={state.status.message ?? "Impossible de démarrer le moteur PDF local."}
        action={<button type="button" onClick={() => void retry()}>Réessayer</button>}
        details={state.status.logPath ? <>Journal : <code>{state.status.logPath}</code></> : undefined}
      />
    );
  }

  // Keep the editor mounted while the backend recovers: native destinations
  // and unsaved edits belong to this session, not to the sidecar process.
  return <>
    <div hidden={state.kind !== "ready"} style={{ height: "100%" }}>
      {sessionBackendUrl ? children(sessionBackendUrl) : null}
    </div>
    {screen}
  </>;
}
