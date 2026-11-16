import { fireEvent, screen } from "@testing-library/react";
import { NAVIGATION_GROUPS } from "../components/SidebarNavigation";

/** Follow the same category disclosure as a user before accessing a sub-tool. */
export function navigationTool(label: string): HTMLElement {
  const group = NAVIGATION_GROUPS.find((item) => item.tools.some((tool) => tool.label === label));
  if (!group) throw new Error(`Unknown navigation tool: ${label}`);
  const parent = screen.getByRole("button", { name: group.label });
  if (parent.getAttribute("aria-expanded") !== "true") fireEvent.click(parent);
  return screen.getByRole("button", { name: label });
}
