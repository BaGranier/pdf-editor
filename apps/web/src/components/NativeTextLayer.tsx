import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { PageViewport } from "pdfjs-dist";
import { pdfRectToViewportStyle } from "../editing/coordinates";
import type { NativeTextEdit } from "../editing/types";
import type { NativeTextFontValidation, NativeTextSpan } from "../pdf/nativeText";

type Props = {
  spans: NativeTextSpan[];
  edits: NativeTextEdit[];
  viewport: PageViewport;
  selectedEditId: string | null;
  onCreateEdit: (span: NativeTextSpan, text: string) => void;
  onSelectEdit: (id: string) => void;
  onUpdateEdit: (edit: NativeTextEdit) => void;
  onPreviewChange: (edit: NativeTextEdit | null) => void;
  /** Prepare the clean canvas patch before a replacement editor becomes visible. */
  onPrepareBackground?: (span: NativeTextSpan) => Promise<boolean>;
  isBackgroundReady?: boolean;
  fontValidationByEditId?: Record<string, NativeTextFontValidation>;
};

export function NativeTextLayer({ spans, edits, viewport, selectedEditId, onCreateEdit, onSelectEdit, onUpdateEdit, onPreviewChange, onPrepareBackground, isBackgroundReady = true, fontValidationByEditId = {} }: Props) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [preparingSource, setPreparingSource] = useState<string | null>(null);
  const editByFingerprint = new Map(edits.map((edit) => [edit.source.sourceFingerprint, edit]));
  const startEditing = async (span: NativeTextSpan) => {
    if (!span.editable || preparingSource) return;
    if (!onPrepareBackground) {
      setEditingSource(span.sourceFingerprint);
      return;
    }
    setPreparingSource(span.sourceFingerprint);
    const prepared = await onPrepareBackground(span);
    setPreparingSource(null);
    if (prepared) setEditingSource(span.sourceFingerprint);
  };
  return (
    <div className="native-text-layer" aria-label="Textes PDF modifiables">
      {spans.map((span) => {
        const edit = editByFingerprint.get(span.sourceFingerprint);
        const style = pdfRectToViewportStyle(viewport, span.rect);
        const validation = edit ? fontValidationByEditId[edit.id] : undefined;
        if (edit) return <FragmentWithDiagnostic key={span.sourceFingerprint} style={style} validation={validation}><NativeTextEditor edit={edit} viewport={viewport} selected={edit.id === selectedEditId} backgroundReady={isBackgroundReady} onSelect={() => onSelectEdit(edit.id)} onUpdate={onUpdateEdit} onPreviewChange={onPreviewChange} /></FragmentWithDiagnostic>;
        if (editingSource === span.sourceFingerprint) return <NativeTextDraftEditor key={span.sourceFingerprint} span={span} viewport={viewport} backgroundReady={isBackgroundReady} onPreviewChange={onPreviewChange} onCancel={() => setEditingSource(null)} onCommit={(text) => { setEditingSource(null); onCreateEdit(span, text); }} />;
        return (
          <button
            key={span.sourceFingerprint}
            type="button"
            className={`native-text-hitbox${span.editable ? "" : " is-limited"}${selectedSource === span.sourceFingerprint ? " is-selected" : ""}`}
            style={style}
            aria-label={span.editable ? `Modifier le texte « ${span.sourceText} »` : `Texte non modifiable : ${span.limitationMessage ?? span.sourceText}`}
            title={span.editable ? span.sourceText : span.limitationMessage}
            onClick={(event) => { event.stopPropagation(); setSelectedSource(span.sourceFingerprint); }}
            onDoubleClick={(event) => { event.stopPropagation(); void startEditing(span); }}
            onKeyDown={(event) => { if (event.key === "Enter" && span.editable) { event.preventDefault(); void startEditing(span); } }}
          >{preparingSource === span.sourceFingerprint ? <span className="visually-hidden">Préparation de l’aperçu du texte</span> : null}</button>
        );
      })}
    </div>
  );
}

function NativeTextDraftEditor({ span, viewport, backgroundReady, onCancel, onCommit, onPreviewChange }: { span: NativeTextSpan; viewport: PageViewport; backgroundReady: boolean; onCancel: () => void; onCommit: (text: string) => void; onPreviewChange: (edit: NativeTextEdit | null) => void }) {
  const [draft, setDraft] = useState(span.sourceText);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasOverflow = useTextOverflow(inputRef, draft, viewport);
  const style = pdfRectToViewportStyle(viewport, span.rect);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  useEffect(() => { if (backgroundReady) { inputRef.current?.focus(); inputRef.current?.select(); } }, [backgroundReady]);
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
    {backgroundReady ? <textarea
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
    /> : <span className="native-text-editor__preparing" role="status">Préparation de l’aperçu…</span>}
    {hasOverflow ? <p className="native-text-editor__overflow" role="status">Le texte dépasse la zone d’origine. Il ne sera pas tronqué, mais peut recouvrir le contenu voisin.</p> : null}
    <div className="native-text-editor__actions">
      <button type="button" onClick={onCancel}>Annuler</button>
      <button type="button" onClick={() => draft !== span.sourceText ? onCommit(draft) : onCancel()}>Valider</button>
    </div>
  </div>;
}

function NativeTextEditor({ edit, viewport, selected, backgroundReady, onSelect, onUpdate, onPreviewChange }: { edit: NativeTextEdit; viewport: PageViewport; selected: boolean; backgroundReady: boolean; onSelect: () => void; onUpdate: (edit: NativeTextEdit) => void; onPreviewChange: (edit: NativeTextEdit | null) => void }) {
  const [draft, setDraft] = useState(edit.text);
  const initialRef = useRef(edit.text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasOverflow = useTextOverflow(inputRef, draft, viewport);
  const style = pdfRectToViewportStyle(viewport, edit.rect);
  useEffect(() => { setDraft(edit.text); initialRef.current = edit.text; }, [edit.id, edit.text]);
  useEffect(() => { if (selected && backgroundReady) inputRef.current?.focus(); }, [backgroundReady, selected]);
  useEffect(() => {
    if (!selected || draft === edit.text) return;
    onPreviewChange({ ...edit, text: draft });
    return () => onPreviewChange(null);
  }, [draft, edit, onPreviewChange, selected]);
  const scale = Math.hypot(viewport.transform[0], viewport.transform[1]);
  const commit = () => { if (draft !== edit.text) onUpdate({ ...edit, text: draft }); };
  return (
    <div className={`native-text-editor${selected ? " is-selected" : ""}${hasOverflow ? " has-overflow" : ""}`} style={style} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      {backgroundReady ? <textarea
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
      /> : <span className="native-text-editor__preparing" role="status">Préparation de l’aperçu…</span>}
      {hasOverflow ? <p className="native-text-editor__overflow" role="status">Le texte dépasse la zone d’origine. Il ne sera pas tronqué, mais peut recouvrir le contenu voisin.</p> : null}
    </div>
  );
}

function FragmentWithDiagnostic({ children, style, validation }: { children: ReactNode; style: CSSProperties; validation?: NativeTextFontValidation }) {
  const blocking = validation?.status === "missing" || validation?.status === "missing-glyphs" || validation?.status === "not-embeddable";
  return <>
    {children}
    {blocking ? <div className="native-text-font-diagnostic" style={style} role="status" aria-label={validation.message} title={validation.message}>
      <span className="native-text-font-diagnostic__icon" aria-hidden="true">!</span>
      <span className="native-text-font-diagnostic__message">{validation.message}</span>
    </div> : null}
    {validation?.status === "fallback" ? <span className="visually-hidden" role="status">{validation.message}</span> : null}
  </>;
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
