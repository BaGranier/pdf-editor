import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { DesktopBackendGate } from "./components/DesktopBackendGate";
import { DesktopBootstrapErrorBoundary } from "./components/DesktopBootstrapErrorBoundary";
import {
  installDesktopStartupDiagnostics,
  logDesktopStartupError,
} from "./desktop/startupDiagnostics";
import { isDesktopRuntime } from "./api/backend";

if (isDesktopRuntime()) {
  installDesktopStartupDiagnostics();
}

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Élément #root introuvable.");
  }
  createRoot(rootElement).render(
    <StrictMode>
      <DesktopBootstrapErrorBoundary>
        <DesktopBackendGate>
          {(backendUrl) => <App backendUrl={backendUrl ?? undefined} />}
        </DesktopBackendGate>
      </DesktopBootstrapErrorBoundary>
    </StrictMode>,
  );
} catch (error) {
  logDesktopStartupError("bootstrap", error);
  document.body.textContent =
    "PDF Studio Local — l’interface desktop n’a pas pu démarrer. Consultez la console de développement.";
}
