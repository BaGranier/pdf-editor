import { useLocale } from "../viewer/locale";
import { invoke } from "@tauri-apps/api/core";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { useEffect, useId, useState } from "react";
import { isDesktopRuntime } from "../api/backend";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { EditingTool, LinkDestination, PdfLinkEdit } from "../editing/types";
import { linkLabel, readPageLinks, resolvePdfDestination, safeWebUrl, type SourcePdfLink } from "../pdf/links";

export function followWebLink(url: string, onError: () => void) {
  const safeUrl = safeWebUrl(url);
  if (!safeUrl) return;
  if (isDesktopRuntime()) void invoke("open_pdf_web_link", { url: safeUrl }).catch(onError);
  else window.open(safeUrl, "_blank", "noopener,noreferrer");
}

export function PdfLinks({ pdf, pageNumber, viewport, edits, tool, disabled, onFollow, onEdit }: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  viewport: PageViewport;
  edits: PdfLinkEdit[];
  tool: EditingTool;
  disabled: boolean;
  onFollow: (destination: LinkDestination) => void;
  onEdit?: (edit: PdfLinkEdit) => void;
}) {
  const { t: localize } = useLocale();
  const [source, setSource] = useState<SourcePdfLink[]>([]);
  useEffect(() => {
    let active = true;
    void pdf.getPage(pageNumber).then((page) => readPageLinks(pdf, page)).then((links) => {
      if (active) setSource(links);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [pdf, pageNumber]);

  const editing = tool === "link" && onEdit !== undefined;
  if (disabled || (tool !== "select" && !editing)) return null;
  const overrides = new Map(edits.filter((edit) => edit.sourceXref !== undefined).map((edit) => [edit.sourceXref, edit]));
  const links: SourcePdfLink[] = [
    ...source.flatMap((link) => {
      const edit = overrides.get(link.sourceXref);
      return edit ? edit.destination ? [{ ...link, ...edit }] : [] : [link];
    }),
    ...edits.filter((edit) => edit.sourceXref === undefined && edit.destination),
  ];
  return <div className={`pdf-links${editing ? " pdf-links--editing" : ""}`}>
    {links.filter((link) => editing || link.destination).map((link) => {
      const { destination, id, rect, areas = [rect], sourceXref, label } = link;
      const editable = edits.some((edit) => edit.id === id) || sourceXref !== undefined;
      const description = label?.trim()
        ? `${label.trim()}${destination?.kind === "uri" ? " (lien externe)" : ""}`
        : linkLabel(destination);
      return areas.map((area, index) => <button key={`${id}-${index}`} tabIndex={index === 0 ? undefined : -1} type="button" role={editing ? undefined : "link"} className="pdf-link"
        aria-label={editing ? editable ? localize("Modifier le lien : {0}", description) : localize("Édition indisponible : {0}", description) : description}
        aria-disabled={editing && !editable || undefined}
        title={editing && !editable ? localize("Ce type de lien PDF ne peut pas être modifié.") : description}
        style={pdfRectToViewportStyle(viewport, area)}
        onClick={(event) => {
          event.stopPropagation();
          if (editing) {
            if (editable && destination) onEdit({ type: "link", id: sourceXref ? `pdf-link-${pageNumber}-${sourceXref}` : id, page: pageNumber, rect, areas: sourceXref === undefined ? link.areas : undefined, sourceXref, destination, label });
          } else if (destination) onFollow(destination);
        }} />);
    })}
  </div>;
}

type Outline = NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>;

function OutlineEntry({ item, onActivate }: {
  item: Outline[number];
  onActivate: (item: Outline[number]) => void;
}) {
  const { t: localize } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const childrenId = useId();
  const title = item.title.trim() || "Signet sans titre";
  const actionType = (item as typeof item & { pdfLinkAction?: string }).pdfLinkAction;
  const href = actionType === "URI" && item.url && item.unsafeUrl ? safeWebUrl(item.unsafeUrl) : null;
  const clickable = (actionType === "GoTo" && item.dest) || href;
  return <li>
    <div className="pdf-outline__entry">
      {item.items.length ? <button type="button" className="pdf-outline__expand"
        aria-expanded={expanded} aria-controls={childrenId} aria-label={localize("{0} : {1}", expanded ? localize("Réduire") : localize("Développer"), title)}
        onClick={() => setExpanded((current) => !current)}>
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor">
          <path d={expanded ? "m5 7 5 5 5-5" : "m7 5 5 5-5 5"} />
        </svg>
      </button> : null}
      {clickable ? <button type="button" onClick={() => onActivate(item)}
        aria-label={href ? localize("{0} (lien externe)", title) : undefined}>{title}</button> : <span>{title}</span>}
    </div>
    {item.items.length ? <ul id={childrenId} hidden={!expanded}>
      {expanded ? item.items.map((child, index) => <OutlineEntry key={index} item={child} onActivate={onActivate} />) : null}
    </ul> : null}
  </li>;
}

export function PdfOutline({ pdf, onFollow }: {
  pdf: PDFDocumentProxy;
  onFollow: (destination: LinkDestination) => void;
}) {
  const { t: localize } = useLocale();
  const [outline, setOutline] = useState<Outline>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void pdf.getOutline?.().then((items) => { if (active) setOutline(items ?? []); }).catch(() => undefined);
    return () => { active = false; };
  }, [pdf]);

  if (!outline.length) return null;
  const activate = (item: Outline[number]) => {
    const actionType = (item as typeof item & { pdfLinkAction?: string }).pdfLinkAction;
    if (actionType === "URI" && item.unsafeUrl) {
      onFollow({ kind: "uri", url: item.unsafeUrl });
    } else if (actionType === "GoTo") {
      void resolvePdfDestination(pdf, item.dest).then((target) => {
        setMessage(target ? "" : "La destination du signet est indisponible.");
        if (target) onFollow(target);
      });
    }
  };
  return <details className="pdf-outline">
    <summary>{localize("Signets")}</summary>
    <ul>{outline.map((item, index) => <OutlineEntry key={index} item={item} onActivate={activate} />)}</ul>
    {message ? <p role="status">{localize(message)}</p> : null}
  </details>;
}

export function LinkInspector({ edit, pageCount, onSave, onDelete, onCancel }: {
  edit: PdfLinkEdit;
  pageCount: number;
  onSave: (edit: PdfLinkEdit) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const { t: localize } = useLocale();
  const initial = edit.destination;
  const [kind, setKind] = useState<LinkDestination["kind"]>(initial?.kind ?? "uri");
  const [url, setUrl] = useState(initial?.kind === "uri" ? initial.url : "");
  const [page, setPage] = useState(String(initial?.kind === "internal" ? initial.pageIndex + 1 : edit.page));
  const [label, setLabel] = useState(edit.label ?? "");
  const [error, setError] = useState("");
  return <form className="link-inspector" onSubmit={(event) => {
    event.preventDefault();
    const safeUrl = safeWebUrl(url);
    const pageIndex = Number(page) - 1;
    let destination: LinkDestination;
    if (kind === "uri") {
      if (!safeUrl) { setError("Saisissez une URL HTTP ou HTTPS valide."); return; }
      destination = { kind, url: safeUrl };
    } else {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
        setError("Sélectionnez une page source valide."); return;
      }
      destination = initial?.kind === kind && initial.pageIndex === pageIndex ? initial : { kind, pageIndex };
    }
    onSave({ ...edit, destination, label: label.trim() || undefined });
  }}>
    <label>{localize("Type de lien")}<select autoFocus value={kind} onChange={(event) => setKind(event.target.value as LinkDestination["kind"])}>
      <option value="uri">{localize("URL web")}</option><option value="internal">{localize("Destination dans le document")}</option>
    </select></label>
    {kind === "uri" ? <label>{localize("URL web")}<input value={url} maxLength={4096} onChange={(event) => setUrl(event.target.value)} /></label>
      : <label>{localize("Page source cible")}<input type="number" min={1} max={pageCount} required value={page} onChange={(event) => setPage(event.target.value)} /></label>}
    <label>{localize("Intitulé facultatif")}<input value={label} maxLength={256} onChange={(event) => setLabel(event.target.value)} /></label>
    {error ? <p role="alert">{localize(error)}</p> : null}
    <div><button type="submit">{localize("Enregistrer le lien")}</button> <button type="button" onClick={onCancel}>{localize("Annuler")}</button>
      {onDelete ? <button type="button" onClick={onDelete}>{localize("Supprimer le lien")}</button> : null}</div>
  </form>;
}
