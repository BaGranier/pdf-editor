import { ToolbarIcon } from "./ToolbarIcon";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { EditingTool } from "../editing/types";
import { sidePanelPosition } from "../viewer/floatingPosition";
import { NAVIGATION_GROUPS, PAGE_TOOLS, type NavigationAction } from "../viewer/navigationGroups";

function useFloatingPosition(
  enabled: boolean,
  anchor: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  centered = false,
) {
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const trigger = anchor.current;
  useLayoutEffect(() => {
    const content = panel.current;
    if (!enabled || !trigger || !content) return;
    const place = () => {
      const next = sidePanelPosition(trigger.getBoundingClientRect(), content.getBoundingClientRect(), {
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight,
      }, centered);
      setPosition((previous) => previous.top === next.top && previous.left === next.left ? previous : next);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    observer?.observe(content);
    observer?.observe(trigger);
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [centered, enabled, panel, trigger]);
  return position;
}

export function SidebarNavigation({ rasterSource = false, activeTool, organizing, disabled, processingDisabled, imageDisabled, onSelect }: {
  rasterSource?: boolean; activeTool: EditingTool; organizing: boolean; disabled: boolean; processingDisabled: boolean; imageDisabled: boolean;
  onSelect: (tool: NavigationAction) => boolean | void;
}) {
  const [openNavigationGroup, setOpenNavigationGroup] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HTMLButtonElement | null>(null);
  const [focused, setFocused] = useState<HTMLButtonElement | null>(null);
  const [dismissedTooltip, setDismissedTooltip] = useState<HTMLButtonElement | null>(null);
  const rail = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const tooltipTrigger = useRef<HTMLButtonElement | null>(null);
  const group = NAVIGATION_GROUPS.find((item) => item.id === openNavigationGroup);
  const candidate = hovered ?? focused;
  const label = candidate?.querySelector<HTMLElement>("span");
  const tooltipVisible = Boolean(candidate?.isConnected && candidate !== dismissedTooltip &&
    (group ? panel.current?.contains(candidate) && label && label.scrollWidth > label.clientWidth : rail.current?.contains(candidate)));
  tooltipTrigger.current = tooltipVisible ? candidate : null;
  const position = useFloatingPosition(Boolean(group), trigger, panel);
  const tooltipPosition = useFloatingPosition(tooltipVisible, tooltipTrigger, tooltip, true);
  const close = (restore = false) => {
    setOpenNavigationGroup(null);
    setHovered(null);
    if (restore) {
      setDismissedTooltip(trigger.current);
      trigger.current?.focus();
    }
  };
  const tooltipEvents = {
    onMouseEnter: (event: React.MouseEvent<HTMLButtonElement>) => {
      setDismissedTooltip(null);
      setHovered(event.currentTarget);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLButtonElement>) => {
      const button = event.currentTarget;
      setHovered((current) => current === button ? null : current);
    },
    onFocus: (event: React.FocusEvent<HTMLButtonElement>) => {
      if (event.currentTarget.matches(":focus-visible")) setFocused(event.currentTarget);
    },
    onBlur: () => { setFocused(null); setDismissedTooltip(null); },
  };
  useLayoutEffect(() => {
    if (group) panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [group]);
  useEffect(() => {
    if (!group && !tooltipVisible) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rail.current?.contains(event.target) && !panel.current?.contains(event.target)) {
        setOpenNavigationGroup(null);
        setHovered(null);
        setFocused(null);
      }
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [group, tooltipVisible]);
  useEffect(() => {
    if (!tooltipVisible || group) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setDismissedTooltip(tooltipTrigger.current);
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [group, tooltipVisible]);

  return <nav ref={rail} className="tool-rail" aria-label="Outils d'édition"
    onKeyDown={(event) => {
      if (event.key === "Escape" && group) {
        event.preventDefault(); event.stopPropagation(); close(true);
      }
    }}
    onBlur={(event) => {
      const target = event.relatedTarget;
      if (!target || (target instanceof Node && !rail.current?.contains(target) && !panel.current?.contains(target))) close();
    }}>
    {NAVIGATION_GROUPS.map((item) => {
      const active = organizing ? item.id === "pages" : item.tools.some((tool) => tool.id === activeTool);
      return <button {...tooltipEvents} key={item.id} type="button" aria-label={item.label} aria-expanded={openNavigationGroup === item.id} aria-controls={openNavigationGroup === item.id ? `navigation-${item.id}` : undefined} aria-pressed={active}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setHovered(null);
          setOpenNavigationGroup((current) => current === item.id ? null : item.id);
          setDismissedTooltip(event.currentTarget);
        }}>
        <ToolbarIcon name={item.icon} />{active ? <ToolbarIcon name="check" className="tool-rail__active-marker" /> : null}
      </button>;
    })}
    {group ? createPortal(<div ref={panel} id={`navigation-${group.id}`} className="navigation-popover" role="region" aria-label={`Outils ${group.label}`} style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}>
      <strong>{group.label}</strong>
      {group.tools.map((entry) => {
        const tool = entry.id === "organize" && organizing ? PAGE_TOOLS.read : entry;
        const active = tool.id === "organize" ? organizing : !organizing && activeTool === tool.id;
        const unavailable = tool.id === "organize" || tool.id === "thumbnails" || tool.id === "comments_list" || tool.id === "images_pdf"
          ? false
          : tool.id === "ocr" || tool.id === "convert"
            ? processingDisabled
            : tool.id === "image"
              ? imageDisabled
              : disabled || (rasterSource && (tool.id === "redaction" || tool.id === "edit_text"));
        return <button {...tooltipEvents} key={tool.id} type="button" aria-label={tool.label} aria-pressed={active}
          aria-description={"description" in tool ? tool.description : undefined}
          disabled={unavailable} onClick={() => { const changed = onSelect(tool.id); close(changed !== false); }}>
          <ToolbarIcon name={tool.icon} /><span>{tool.label}</span>
          {active ? <ToolbarIcon name="check" className="navigation-popover__active-marker" /> : null}
          {"description" in tool ? <small>{tool.description}</small> : null}
        </button>;
      })}
      {group.id === "annotations" ? <p>Sélectionnez du texte dans la page pour surligner, souligner ou barrer.</p> : null}
    </div>, document.body) : null}
    {tooltipVisible ? createPortal(<div className="tool-rail-tooltip" ref={tooltip} role="tooltip" style={tooltipPosition}>
      {candidate?.getAttribute("aria-label")}
    </div>, document.body) : null}
  </nav>;
}
