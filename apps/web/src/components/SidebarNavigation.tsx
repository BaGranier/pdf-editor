import { useLocale } from "../viewer/locale";
import { ToolbarIcon } from "./ToolbarIcon";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditingTool } from "../editing/types";
import { floatingPortalTarget, useFloatingPosition } from "../hooks/useFloatingPosition";
import { moveMenuFocus } from "../hooks/usePopoverDismiss";
import { NAVIGATION_GROUPS, PAGE_TOOLS, type NavigationAction } from "../viewer/navigationGroups";

export function SidebarNavigation({ rasterSource = false, activeTool, organizing, disabled, processingDisabled, imageDisabled, onSelect, onSettings, settingsOpen = false }: {
  rasterSource?: boolean; activeTool: EditingTool; organizing: boolean; disabled: boolean; processingDisabled: boolean; imageDisabled: boolean;
  onSelect: (tool: NavigationAction) => boolean | void;
  onSettings?: () => void;
  settingsOpen?: boolean;
}) {
  const { t } = useLocale();
  const [openNavigationGroup, setOpenNavigationGroup] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HTMLButtonElement | null>(null);
  const [focused, setFocused] = useState<HTMLButtonElement | null>(null);
  const [dismissedTooltip, setDismissedTooltip] = useState<HTMLButtonElement | null>(null);
  const tooltipId = useId();
  const rail = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const group = NAVIGATION_GROUPS.find((item) => item.id === openNavigationGroup);
  const candidate = hovered ?? focused;
  const tooltipVisible = Boolean(candidate?.isConnected && candidate !== dismissedTooltip && rail.current?.contains(candidate));
  const close = useCallback((restore = false) => {
    setOpenNavigationGroup(null);
    setHovered(null);
    if (restore) {
      setDismissedTooltip(trigger.current);
      trigger.current?.focus({ preventScroll: true });
    }
  }, []);
  useFloatingPosition(Boolean(group), trigger.current, panel, "right-start", close);
  const dismissTooltip = useCallback(() => setDismissedTooltip(candidate), [candidate]);
  useFloatingPosition(tooltipVisible, candidate, tooltip, "right-center", dismissTooltip);
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
        dismissTooltip();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [dismissTooltip, group, tooltipVisible]);

  return <nav ref={rail} className="tool-rail" aria-label={t("Outils d'édition")}
    onKeyDown={(event) => {
      if (event.key === "Escape" && group) {
        event.preventDefault(); event.stopPropagation(); close(true);
      }
    }}
    onBlur={(event) => {
      const target = event.relatedTarget;
      if (!target || (target instanceof Node && !rail.current?.contains(target) && !panel.current?.contains(target))) close();
    }}>
    <button {...tooltipEvents} type="button" aria-label={t("Sélection")} title={t("Sélection")}
      aria-pressed={!organizing && activeTool === "select"} disabled={disabled}
      onClick={() => { close(); onSelect("select"); }}>
      <ToolbarIcon name="select" />
      {!organizing && activeTool === "select" ? <ToolbarIcon name="check" className="tool-rail__active-marker" /> : null}
    </button>
    {NAVIGATION_GROUPS.map((item) => {
      const active = organizing ? item.id === "pages" : item.tools.some((tool) => tool.id === activeTool);
      return <button {...tooltipEvents} key={item.id} type="button" aria-label={t(item.label)} aria-describedby={tooltipVisible && candidate?.getAttribute("aria-label") === t(item.label) ? tooltipId : undefined} aria-expanded={openNavigationGroup === item.id} aria-controls={openNavigationGroup === item.id ? `navigation-${item.id}` : undefined} aria-pressed={active}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setHovered(null);
          setOpenNavigationGroup((current) => current === item.id ? null : item.id);
          setDismissedTooltip(event.currentTarget);
        }}>
        <ToolbarIcon name={item.icon} />{active ? <ToolbarIcon name="check" className="tool-rail__active-marker" /> : null}
      </button>;
    })}
    {onSettings ? <button {...tooltipEvents} type="button" className="tool-rail__settings"
      aria-label={t("Paramètres")} title={t("Paramètres")} aria-expanded={settingsOpen}
      onClick={() => { close(); onSettings(); }}><ToolbarIcon name="settings" /></button> : null}
    {group ? createPortal(<div ref={panel} id={`navigation-${group.id}`} className="floating-surface navigation-popover" role="region" aria-label={`${t("Outils")} ${t(group.label)}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        moveMenuFocus(event);
      }}>
      <strong>{t(group.label)}</strong>
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
        return <button key={tool.id} type="button" aria-label={t(tool.label)} aria-pressed={active}
          aria-description={"description" in tool ? t(tool.description) : undefined}
          disabled={unavailable} onClick={() => { const changed = onSelect(tool.id); close(changed !== false); }}>
          <ToolbarIcon name={tool.icon} /><span>{t(tool.label)}</span>
          {active ? <ToolbarIcon name="check" className="navigation-popover__active-marker" /> : null}
          {"description" in tool ? <small>{t(tool.description)}</small> : null}
        </button>;
      })}
      {group.id === "annotations" ? <p>{t("Sélectionnez du texte dans la page pour surligner, souligner ou barrer.")}</p> : null}
    </div>, floatingPortalTarget(trigger.current)) : null}
    {tooltipVisible ? createPortal(<div id={tooltipId} className="floating-surface tool-rail-tooltip" ref={tooltip} role="tooltip">
      {candidate?.getAttribute("aria-label")}
    </div>, floatingPortalTarget(candidate)) : null}
  </nav>;
}
