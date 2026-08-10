import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDesktopStartupError } from "../desktop/startupDiagnostics";

type DesktopBootstrapErrorBoundaryProps = {
  children: ReactNode;
};

type DesktopBootstrapErrorBoundaryState = {
  failed: boolean;
};

export class DesktopBootstrapErrorBoundary extends Component<
  DesktopBootstrapErrorBoundaryProps,
  DesktopBootstrapErrorBoundaryState
> {
  state: DesktopBootstrapErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): DesktopBootstrapErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logDesktopStartupError("react", error, info.componentStack ?? undefined);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="desktop-backend-state" role="alert">
          <h1>PDF Studio Local</h1>
          <p>L’interface desktop n’a pas pu démarrer.</p>
          <p>Ouvrez les outils de développement pour consulter l’erreur.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recharger l’application
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
