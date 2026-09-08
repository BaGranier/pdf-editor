import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDesktopStartupError } from "../desktop/startupDiagnostics";
import { AppStateScreen } from "./AppStateScreen";

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
        <AppStateScreen
          state="error"
          title="Une erreur inattendue est survenue"
          description="L’interface n’a pas pu démarrer correctement."
          action={<button type="button" onClick={() => window.location.reload()}>Réessayer</button>}
          details="Consultez la console de développement pour obtenir les détails de diagnostic."
        />
      );
    }

    return this.props.children;
  }
}
