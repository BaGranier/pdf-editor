import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditingTool } from "../editing/types";

export const NAVIGATION_GROUPS = [
  { id: "editing", label: "Édition", icon: "✎", tools: [
    { id: "add_text", label: "Ajouter du texte" }, { id: "edit_text", label: "Modifier le texte existant" },
    { id: "image", label: "Image" }, { id: "freehand", label: "Dessiner" },
    { id: "shape_rectangle", label: "Rectangle" }, { id: "shape_square", label: "Carré" },
    { id: "shape_ellipse", label: "Ellipse" }, { id: "shape_circle", label: "Cercle" },
    { id: "shape_line", label: "Ligne" }, { id: "shape_arrow", label: "Flèche" },
  ] },
  { id: "annotations", label: "Annotations", icon: "☏", tools: [
    { id: "comment", label: "Commentaire" }, { id: "signature", label: "Ajouter une signature" },
  ] },
  { id: "marking", label: "Marquage", icon: "▧", tools: [
    { id: "redaction", label: "Biffer", description: "Biffage sécurisé : supprime les données dans la copie exportée." },
    { id: "visual_mask", label: "Masquage visuel", description: "Recouvre sans supprimer les données." },
    { id: "watermark", label: "Filigrane", description: "Marquage non destructif : les données restent récupérables." },
    { id: "stamp", label: "Tampon", description: "Tampon visuel, sans suppression de données." },
  ] },
  { id: "processing", label: "Conversion", icon: "↗", tools: [ { id: "ocr", label: "OCR" }, { id: "convert", label: "Convertir" } ] },
] as const;
export type NavigationAction = EditingTool | "image" | "ocr" | "convert";

export function SidebarNavigation({ activeTool, organizing, disabled, processingDisabled, imageDisabled, onSelect, onOrganize }: {
  activeTool: EditingTool; organizing: boolean; disabled: boolean; processingDisabled: boolean; imageDisabled: boolean;
  onSelect: (tool: NavigationAction) => void; onOrganize: () => void;
}) {
  const [openNavigationGroup, setOpenNavigationGroup] = useState<string | null>(null);
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const rail = useRef<HTMLElement>(null), panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const group = NAVIGATION_GROUPS.find((item) => item.id === openNavigationGroup);
  const close = (restore = false) => { setOpenNavigationGroup(null); if (restore) trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!group) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(300, window.innerWidth - 16);
      setPosition({ left: Math.max(8, Math.min(anchor.right + 8, window.innerWidth - width - 8)), top: Math.max(8, Math.min(anchor.top, window.innerHeight - (panel.current?.offsetHeight ?? 300) - 8)) });
    };
    place(); panel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [group]);
  useEffect(() => {
    if (!group) return;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !rail.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpenNavigationGroup(null); };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [group]);
  return <nav ref={rail} className="tool-rail" aria-label="Outils d'édition">
    <button type="button" aria-label="Sélection" aria-pressed={!organizing && activeTool === "select"} disabled={disabled} onClick={() => { close(); onSelect("select"); }}>↖<span>Sélection</span></button>
    {NAVIGATION_GROUPS.map((item) => {
      const active = !organizing && item.tools.some((tool) => tool.id === activeTool);
      return <button key={item.id} type="button" aria-label={item.label} aria-expanded={openNavigationGroup === item.id} aria-controls={`navigation-${item.id}`} aria-pressed={active}
        onClick={(event) => { trigger.current = event.currentTarget; setOpenNavigationGroup((current) => current === item.id ? null : item.id); }}>
        <span aria-hidden="true">{item.icon}</span><span>{item.label}{active ? " ✓" : ""}</span>
      </button>;
    })}
    <button type="button" aria-label={organizing ? "Revenir à la lecture" : "Organiser"} aria-pressed={organizing} onClick={() => { close(); onOrganize(); }}>▤<span>{organizing ? "Lecture" : "Pages"}</span></button>
    {group ? createPortal(<div ref={panel} id={`navigation-${group.id}`} className="navigation-popover" role="region" aria-label={`Outils ${group.label}`} style={position}
      onBlur={(event) => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !rail.current?.contains(event.relatedTarget)) close(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        }
      }}><strong>{group.label}</strong>{group.tools.map((tool) => <button key={tool.id} type="button" aria-label={tool.label} title={tool.label} aria-pressed={activeTool === tool.id && !organizing}
        disabled={tool.id === "ocr" || tool.id === "convert" ? processingDisabled : tool.id === "image" ? imageDisabled : disabled}
        onClick={() => { onSelect(tool.id); close(true); }}><span>{tool.label}{activeTool === tool.id && !organizing ? " ✓" : ""}</span>{"description" in tool ? <small>{tool.description}</small> : null}</button>)}
      {group.id === "annotations" ? <p>Sélectionnez du texte dans la page pour surligner, souligner ou barrer.</p> : null}
    </div>, document.body) : null}
  </nav>;
}
