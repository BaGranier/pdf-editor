import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PageViewport } from "pdfjs-dist";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { NativeTextEdit } from "../editing/types";
import type { NativeTextSpan } from "../pdf/nativeText";

type Props = {
  spans: NativeTextSpan[];
  edits: NativeTextEdit[];
  viewport: PageViewport;
  selectedEditId: string | null;
  onCreateEdit: (span: NativeTextSpan, text: string) => void;
  onSelectEdit: (id: string) => void;
  onUpdateEdit: (edit: NativeTextEdit) => void;
  onPreviewChange: (edit: NativeTextEdit | null) => void;
};

export function NativeTextLayer({ spans, edits, viewport, selectedEditId, onCreateEdit, onSelectEdit, onUpdateEdit, onPreviewChange }: Props) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const editByFingerprint = new Map(edits.map((edit) => [edit.source.sourceFingerprint, edit]));
  return (
    <div className="native-text-layer" aria-label="Textes PDF modifiables">
      {spans.map((span) => {
        const edit = editByFingerprint.get(span.sourceFingerprint);
        const style = pdfRectToViewportStyle(viewport, span.rect);
        if (edit) return <NativeTextEditor key={span.sourceFingerprint} edit={edit} viewport={viewport} selected={edit.id === selectedEditId} onSelect={() => onSelectEdit(edit.id)} onUpdate={onUpdateEdit} onPreviewChange={onPreviewChange} />;
        if (editingSource === span.sourceFingerprint) return <NativeTextDraftEditor key={span.sourceFingerprint} span={span} viewport={viewport} onPreviewChange={onPreviewChange} onCancel={() => setEditingSource(null)} onCommit={(text) => { setEditingSource(null); onCreateEdit(span, text); }} />;
        return (
          <button
            key={span.sourceFingerprint}
            type="button"
            className={`native-text-hitbox${span.editable ? "" : " is-limited"}${selectedSource === span.sourceFingerprint ? " is-selected" : ""}`}
            style={style}
            aria-label={span.editable ? `Modifier le texte « ${span.sourceText} »` : `Texte non modifiable : ${span.limitationMessage ?? span.sourceText}`}
            title={span.editable ? span.sourceText : span.limitationMessage}
            onClick={(event) => { event.stopPropagation(); setSelectedSource(span.sourceFingerprint); }}
            onDoubleClick={(event) => { event.stopPropagation(); if (span.editable) setEditingSource(span.sourceFingerprint); }}
            onKeyDown={(event) => { if (event.key === "Enter" && span.editable) { event.preventDefault(); setEditingSource(span.sourceFingerprint); } }}
          />
        );
      })}
    </div>
  );
}

function NativeTextDraftEditor({ span, viewport, onCancel, onCommit, onPreviewChange }: { span: NativeTextSpan; viewport: PageViewport; onCancel: () => void; onCommit: (text: string) => void; onPreviewChange: (edit: NativeTextEdit | null) => void }) {
  const [draft, setDraft] = useState(span.sourceText);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasOverflow = useTextOverflow(inputRef, draft, viewport);
  const style = pdfRectToViewportStyle(viewport, span.rect);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  useEffect(() => {
    const fontName = span.sourceFontName ?? "Noto Sans";
    const standardFamily = /^(Helvetica|Arial)/i.test(fontName) ? "Helvetica" : /^Times/i.test(fontName) ? "Times" : /^Courier/i.test(fontName) ? "Courier" : null;
    onPreviewChange({
      id: `native-preview-${span.sourceFingerprint}`,
      type: "native_text",
      page: span.page,
      rect: span.rect,
      source: span,
      text: draft,
      style: {
        fontFamily: standardFamily ?? (span.sourceFontResourceId ? fontName : "Noto Sans"),
        fontRef: standardFamily ? `pdf-standard:${standardFamily.toLowerCase()}:400:normal` : span.sourceFontResourceId ? `document:${span.sourceFontResourceId}` : "bundled:noto-sans:400:normal",
        fontSize: span.sourceFontSize,
        color: span.sourceColor,
        bold: span.fontWeight >= 700,
        fontStyle: span.fontStyle,
      },
    });
    return () => onPreviewChange(null);
  }, [draft, onPreviewChange, span]);
  return <div className={`native-text-editor is-selected${hasOverflow ? " has-overflow" : ""}`} style={style} onClick={(event) => event.stopPropagation()}>
    <textarea
      ref={inputRef}
      aria-label={`Modifier le texte PDF « ${span.sourceText} »`}
      value={draft}
      style={{ color: span.sourceColor, fontFamily: span.sourceFontName, fontSize: `${span.sourceFontSize * scale}px`, fontWeight: span.fontWeight, fontStyle: span.fontStyle }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => { /* Validation remains explicit for native source text. */ }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") { event.preventDefault(); onCancel(); }
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (draft !== span.sourceText) onCommit(draft); else onCancel(); }
      }}
    />
    {hasOverflow ? <p className="native-text-editor__overflow" role="status">Le texte dépasse la zone d’origine. Il ne sera pas tronqué, mais peut recouvrir le contenu voisin.</p> : null}
    <div className="native-text-editor__actions">
      <button type="button" onClick={onCancel}>Annuler</button>
      <button type="button" onClick={() => draft !== span.sourceText ? onCommit(draft) : onCancel()}>Valider</button>
    </div>
  </div>;
}

function NativeTextEditor({ edit, viewport, selected, onSelect, onUpdate, onPreviewChange }: { edit: NativeTextEdit; viewport: PageViewport; selected: boolean; onSelect: () => void; onUpdate: (edit: NativeTextEdit) => void; onPreviewChange: (edit: NativeTextEdit | null) => void }) {
  const [draft, setDraft] = useState(edit.text);
  const initialRef = useRef(edit.text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasOverflow = useTextOverflow(inputRef, draft, viewport);
  const style = pdfRectToViewportStyle(viewport, edit.rect);
  useEffect(() => { setDraft(edit.text); initialRef.current = edit.text; }, [edit.id, edit.text]);
  useEffect(() => { if (selected) inputRef.current?.focus(); }, [selected]);
  useEffect(() => {
    if (!selected || draft === edit.text) return;
    onPreviewChange({ ...edit, text: draft });
    return () => onPreviewChange(null);
  }, [draft, edit, onPreviewChange, selected]);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const commit = () => { if (draft !== edit.text) onUpdate({ ...edit, text: draft }); };
  return (
    <div className={`native-text-editor${selected ? " is-selected" : ""}${hasOverflow ? " has-overflow" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <textarea
        ref={inputRef}
        aria-label={`Modifier le texte PDF « ${edit.source.sourceText} »`}
        value={draft}
        style={{ color: edit.style.color, fontFamily: edit.style.fontFamily, fontSize: `${edit.style.fontSize * scale}px`, fontWeight: edit.style.bold ? 700 : 400, fontStyle: edit.style.fontStyle ?? "normal" }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { setDraft(edit.text); inputRef.current?.blur(); }
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); inputRef.current?.blur(); }
        }}
      />
      {hasOverflow ? <p className="native-text-editor__overflow" role="status">Le texte dépasse la zone d’origine. Il ne sera pas tronqué, mais peut recouvrir le contenu voisin.</p> : null}
    </div>
  );
}

export function textAreaHasOverflow(textarea: HTMLTextAreaElement): boolean {
  return textarea.scrollHeight > textarea.clientHeight + 1 || textarea.scrollWidth > textarea.clientWidth + 1;
}

function useTextOverflow(ref: RefObject<HTMLTextAreaElement | null>, value: string, viewport: PageViewport): boolean {
  const [hasOverflow, setHasOverflow] = useState(false);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    const update = () => setHasOverflow(textAreaHasOverflow(textarea));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [ref, value, viewport]);
  return hasOverflow;
}
