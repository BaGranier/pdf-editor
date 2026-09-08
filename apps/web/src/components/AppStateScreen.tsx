import type { ReactNode } from "react";
import { AppLogo } from "./AppLogo";

type AppStateScreenProps = {
  state: "loading" | "error";
  title: string;
  description: string;
  action?: ReactNode;
  details?: ReactNode;
};

export function AppStateScreen({
  state,
  title,
  description,
  action,
  details,
}: AppStateScreenProps) {
  return (
    <main
      className={`app-state-screen app-state-screen--${state}`}
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <AppLogo className="app-state-screen__logo" size={52} />
      <p className="app-state-screen__brand">PDF Studio Local</p>
      <h1>{title}</h1>
      <p className="app-state-screen__description">{description}</p>
      {state === "loading" ? (
        <span className="app-state-screen__spinner" aria-hidden="true" />
      ) : null}
      {action ? <div className="app-state-screen__action">{action}</div> : null}
      {details ? (
        <details className="app-state-screen__details">
          <summary>Détails techniques</summary>
          <div>{details}</div>
        </details>
      ) : null}
    </main>
  );
}
