import { Component, type ErrorInfo, type ReactNode } from "react";
import { logDesktopStartupError } from "../desktop/startupDiagnostics";
import { useLocale } from "../viewer/locale";
import { AppStateScreen } from "./AppStateScreen";

type DesktopBootstrapErrorBoundaryProps = {
  children: ReactNode;
};

type DesktopBootstrapErrorBoundaryState = {
  failed: boolean;
};

function RetryStartup() {
  const { t } = useLocale();
  return <button type="button" onClick={() => window.location.reload()}>{t("Réessayer")}</button>;
}

function StartupDetails() {
  const { t } = useLocale();
  return t("Consultez la console de développement pour obtenir les détails de diagnostic.");
}

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
          action={<RetryStartup />}
          details={<StartupDetails />}
        />
      );
    }

    return this.props.children;
  }
}
