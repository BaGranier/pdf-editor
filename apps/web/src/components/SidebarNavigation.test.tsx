import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarNavigation } from "./SidebarNavigation";
import { NAVIGATION_GROUPS } from "../viewer/navigationGroups";

const props = { activeTool: "watermark" as const, organizing: false, disabled: false, processingDisabled: false, imageDisabled: false, onSelect: vi.fn() };
describe("compact navigation", () => {
  it("declares every action once and uses a separate selection icon and an icon for each group", () => {
    const ids = NAVIGATION_GROUPS.flatMap((group) => group.tools.map((tool) => tool.id));
    expect(new Set(ids).size).toBe(ids.length);
    render(<SidebarNavigation {...props} />);
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
      ["Sélection", "Texte", "Formes et images", "Biffage et tampons", "Signature", "Pages", "Conversion", "Annotations"],
    );
    for (const button of screen.getAllByRole("button")) expect(button).toHaveTextContent(/^$/);
    const select = screen.getByRole("button", { name: "Sélection" });
    expect(select.querySelector("svg")).toHaveAttribute("data-icon", "select");
    fireEvent.click(select);
    expect(props.onSelect).toHaveBeenLastCalledWith("select");
    props.onSelect.mockClear();
  });
  it("separates open group from selected tool and restores focus on Escape", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SidebarNavigation {...props} onSelect={onSelect} />);
    const parent = screen.getByRole("button", { name: "Biffage et tampons" });
    fireEvent.click(parent);
    expect(parent).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Filigrane" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Biffer" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Masquage visuel" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(parent).toHaveFocus(); expect(parent).toHaveAttribute("aria-expanded", "false");
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(parent); fireEvent.click(screen.getByRole("button", { name: "Biffer" }));
    expect(onSelect).toHaveBeenCalledWith("redaction");
    rerender(<SidebarNavigation {...props} activeTool="redaction" onSelect={onSelect} />);
    expect(parent).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(parent);
    expect(screen.getByRole("button", { name: "Filigrane" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Texte" }));
    expect(screen.queryByRole("button", { name: "Filigrane" })).not.toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});

  it("renders every category, sub-tool and active marker as a decorative monochrome SVG", () => {
    const { container } = render(<SidebarNavigation {...props} />);
    const checkIcons = () => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(".tool-rail button, .navigation-popover button")];
      for (const button of buttons) {
        expect(button.querySelectorAll('svg:not([data-icon="check"])')).toHaveLength(1);
        expect(button.textContent).not.toMatch(/[\u2196\u2197\u25a4\u25a7\u2713\u270e]|\p{Extended_Pictographic}/u);
        for (const svg of button.querySelectorAll("svg")) {
          expect(svg).toHaveAttribute("viewBox", "0 0 20 20");
          expect(svg).toHaveAttribute("aria-hidden", "true");
          expect(svg).toHaveAttribute("focusable", "false");
          expect(svg).toHaveAttribute("stroke", "currentColor");
          expect(svg).toHaveAttribute("fill", "none");
          expect(svg).toHaveAttribute("stroke-width", "1.7");
          expect(svg.children.length).toBeGreaterThan(0);
          expect(svg.textContent).toBe("");
          expect(svg.querySelector("image, use, text, foreignObject")).toBeNull();
        }
      }
    };
    for (const theme of ["light", "dark"]) {
      document.documentElement.dataset.theme = theme;
      checkIcons();
      for (const group of NAVIGATION_GROUPS) {
        fireEvent.click(screen.getByRole("button", { name: group.label }));
        checkIcons();
        for (const tool of group.tools) expect(screen.getByRole("button", { name: tool.label }).querySelector("svg")).toHaveAttribute("data-icon", tool.icon);
        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      }
    }
    expect(container.querySelector(".tool-rail__active-marker")).toHaveAttribute("data-icon", "check");
    delete document.documentElement.dataset.theme;
  });

  it("keeps disabled states and both Pages/Read icons vectorial", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SidebarNavigation {...props} disabled onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Biffage et tampons" }));
    for (const label of ["Biffer", "Masquage visuel", "Filigrane", "Tampon"]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pages" }));
    expect(screen.getByRole("button", { name: "Organiser" }).querySelector("svg")).toHaveAttribute("data-icon", "organize");
    rerender(<SidebarNavigation {...props} organizing onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: "Revenir à la lecture" }).querySelector("svg")).toHaveAttribute("data-icon", "read");
  });

it("shows and dismisses a portaled tooltip without selecting a tool", () => {
  const onSelect = vi.fn();
  render(<SidebarNavigation {...props} onSelect={onSelect} />);
  const button = screen.getByRole("button", { name: "Biffage et tampons" });
  fireEvent.mouseEnter(button);
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip).toHaveTextContent("Biffage et tampons");
  expect(tooltip.parentElement).toBe(document.body);
  fireEvent.keyDown(button, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(onSelect).not.toHaveBeenCalled();
});
