import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppStateScreen } from "./AppStateScreen";

describe("AppStateScreen", () => {
  it("announces loading without relying on the spinner alone", () => {
    render(
      <AppStateScreen
        state="loading"
        title="Restauration en cours"
        description="Préparation de vos documents locaux…"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Restauration en cours");
    expect(screen.getByText("PDF Studio Local")).toBeInTheDocument();
  });

  it("shows a recoverable error with optional technical details", () => {
    render(
      <AppStateScreen
        state="error"
        title="Impossible de démarrer"
        description="Le moteur PDF local est indisponible."
        action={<button type="button">Réessayer</button>}
        details="Journal : /tmp/pdf-engine.log"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de démarrer");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.getByText("Détails techniques")).toBeInTheDocument();
  });
});
