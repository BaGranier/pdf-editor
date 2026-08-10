import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopBootstrapErrorBoundary } from "./DesktopBootstrapErrorBoundary";

function BrokenBootstrap(): never {
  throw new Error("desktop bootstrap failed");
}

describe("DesktopBootstrapErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows and logs a visible fallback when desktop React rendering fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <DesktopBootstrapErrorBoundary>
        <BrokenBootstrap />
      </DesktopBootstrapErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "L’interface desktop n’a pas pu démarrer.",
    );
    expect(consoleError).toHaveBeenCalledWith(
      "[desktop:start:react]",
      expect.any(Error),
      expect.any(String),
    );
  });
});
