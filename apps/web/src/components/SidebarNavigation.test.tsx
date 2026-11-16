import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NAVIGATION_GROUPS, SidebarNavigation } from "./SidebarNavigation";

const props = { activeTool: "watermark" as const, organizing: false, disabled: false, processingDisabled: false, imageDisabled: false, onSelect: vi.fn(), onOrganize: vi.fn() };
describe("compact navigation", () => {
  it("declares every action once and uses six top-level entries", () => {
    const ids = NAVIGATION_GROUPS.flatMap((group) => group.tools.map((tool) => tool.id));
    expect(new Set(ids).size).toBe(ids.length);
    render(<SidebarNavigation {...props} />);
    expect(screen.getAllByRole("button")).toHaveLength(6);
  });
  it("separates open group from selected tool and restores focus on Escape", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SidebarNavigation {...props} onSelect={onSelect} />);
    const parent = screen.getByRole("button", { name: "Marquage" });
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
    fireEvent.click(screen.getByRole("button", { name: "Édition" }));
    expect(screen.queryByRole("button", { name: "Filigrane" })).not.toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
