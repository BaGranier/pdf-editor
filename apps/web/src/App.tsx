import { facingSpreadSize, isMultipageMode, isScrollingMode, PAGE_ROW_GAP } from "./viewer/pageLayout";
import type { ReactNode } from "react";
import { PdfLinks, PdfOutline, LinkInspector, followWebLink } from "./components/PdfLinks";
import type { LinkDestination, PdfLinkEdit } from "./editing/types";
import { ImageDocumentDialog } from "./components/ImageDocumentDialog";
import { THEMES, isThemeId, systemTheme, type ThemeId } from "./viewer/themes";
import { ToolbarIcon } from "./components/ToolbarIcon";
import { DOCUMENT_ACCEPT, readImageSource, createImagePdf, type ImageSource, type ImageLayout, DEFAULT_IMAGE_LAYOUT, type ImageTransform, validateImageDocumentSession } from "./images/imageDocument";
import { ImagesPdfDialog } from "./components/ImagesPdfDialog";
import { requestToolChange } from "./editing/toolTransition";
import { SidebarNavigation } from "./components/SidebarNavigation";
import type { NavigationAction } from "./viewer/navigationGroups";
import { PdfPasswordDialog } from "./components/PdfPasswordDialog";
import { unlockWorkingPdf, PdfOpenCancelled, PdfUnlockError } from "./pdf/passwords";
import { LayerControls } from "./components/LayerControls";
import { loadImageAssets } from "./storage/viewerStorage";
import { AdvancedExportDialog } from "./components/AdvancedExportDialog";
import { EXPORT_QUALITY_LABELS, type ExportOptions } from "./saving/exportOptions";
import { importLocalImage } from "./images/importImage";
import { initialImageRect } from "./editing/objectGeometry";
import type { LineGeometry, ImageEdit } from "./editing/types";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { floatingPortalTarget, useFloatingPosition } from "./hooks/useFloatingPosition";
import { moveMenuFocus, usePopoverDismiss } from "./hooks/usePopoverDismiss";
import * as pdfjsLib from "pdfjs-dist";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
  clearViewerStorage,
  loadOrganizationPlan,
  loadStoredDocuments,
  loadViewerPreferences,
  removeOrganizationPlan,
  removeStoredDocument,
  saveOrganizationPlan,
  saveStoredDocument,
  saveViewerPreferences,
  type ViewerMode as PersistedViewerMode,
} from "./storage/viewerStorage";
import {
  createInitialPagePlan,
  hydratePlanSourceNames,
  isPlanModified,
  isValidPagePlanForDocument,
  moveOrganizedPageByIndex,
  renumberOrganizedPages,
  rotatePage,
  type OrganizePagePlan,
  type OrganizedPage,
} from "./organize/pagePlan";
import { OcrDialog } from "./components/OcrDialog";
import { validateImageSession } from "./images/imagePolicy";
import { ConversionDialog } from "./components/ConversionDialog";
import {
  useDocumentProcessing,
  type ProcessingFeedback as ExportFeedback,
} from "./hooks/useDocumentProcessing";
import {
  renderPdfTextLayer,
  type PdfTextLayerRenderTask,
} from "./pdf/textLayer";
import { getWebBackendBaseUrl, isDesktopRuntime } from "./api/backend";
import {
  getDesktopStartupPdfs,
  openDesktopPdf,
  saveDesktopPdf,
  saveDesktopPdfAs,
  type DocumentSource,
} from "./desktop/files";
import {
  getAppCommandShortcutLabel,
  getShortcutPlatform,
  isEditableKeyboardTarget,
  resolveAppShortcut,
  type AppCommandId,
} from "./commands/appShortcuts";
import { PdfEditLayer } from "./components/PdfEditLayer";
import { TextEditToolbar } from "./components/TextEditToolbar";
import { NativeTextLayer } from "./components/NativeTextLayer";
import { createTextStamp, STAMP_PRESETS } from "./editing/stamps";
import { RedactionSearchPanel } from "./components/RedactionSearchPanel";
import { prepareSearchRedactions } from "./editing/redactionSearch";
import { WatermarkComposer } from "./components/WatermarkComposer";
import { createWatermark, watermarkPages, type WatermarkDraft } from "./editing/watermarks";
import type { StampEdit } from "./editing/types";
import { StampInspector } from "./components/StampInspector";
import { ShapeEditToolbar } from "./components/ShapeEditToolbar";
import { FreehandEditToolbar } from "./components/FreehandEditToolbar";
import { PdfSearchBar } from "./components/PdfSearchBar";
import { PdfSearchHighlights } from "./components/PdfSearchHighlights";
import { PdfFormLayer } from "./components/PdfFormLayer";
import { FormLockToolbar } from "./components/FormLockToolbar";
import { AppLogo } from "./components/AppLogo";
import { AppStateScreen } from "./components/AppStateScreen";
import { ColorPicker } from "./components/ColorPicker";
import { SaveAsDialog } from "./components/SaveAsDialog";
import { PrintPreviewDialog, type PrintPreviewStage } from "./components/PrintPreviewDialog";
import {
  SignatureDialog,
  type SignatureImageDraft,
} from "./components/SignatureDialog";
import {
  DEFAULT_SHAPE_STYLE,
  DEFAULT_FREEHAND_STYLE,
  DEFAULT_TEXT_STYLE,
  type AddTextEdit,
  type EditingTool,
  type FreehandEdit,
  type FreehandStyle,
  type PdfEdit,
  type PdfCommentEdit,
  type PdfRect,
  type SignatureEdit,
  type SignatureImage,
  type ShapeEdit,
  type ShapeType,
  type TextMarkupEdit,
  type TextMarkupKind,
  type NativeTextEdit,
  type PdfFormEdit,
  type PdfFormLockEdit,
  type PdfFormStateEdit,
} from "./editing/types";
import { clearNativeTextCache, loadNativeTextPage, renderNativeTextBackground, validateNativeTextFont, type NativeTextFontValidation, type NativeTextSpan } from "./pdf/nativeText";
import {
  buildViewerSnapshot,
  getDocumentUsageWarnings,
  getUniqueFileName,
  releasePdfDocument,
  restoreOpenDocument,
  type OpenPdfDocument,
} from "./pdf/documentLifecycle";
import { normalizeSubsetFontName } from "./fonts/catalog";
import { fontRegistry, getCustomFont } from "./fonts/fontRegistry";
import { selectionClientRectsToPdfRects } from "./pdf/selectionGeometry";
import { findTextMarkupAtPoint } from "./pdf/textMarkupHitTest";
import { loadPdfComments } from "./pdf/comments";
import { getCommentTypeLabel } from "./editing/comments";
import { offsetPdfRectWithinPage } from "./editing/coordinates";
import { getAnnotationScrollTop } from "./pdf/annotationNavigation";
import { getDisplayAnnotationMode } from "./pdf/formRenderMode";
import {
  getDocumentEditingState,
  pdfEditsReducer,
  type PdfEditsByDocument,
} from "./editing/state";
import { getSuggestedPdfSaveName } from "./saving/fileName";
import { downloadPdfToBrowser } from "./saving/destination";
import { buildPdfExportPayload } from "./saving/exportPayload";
import { executePdfExport } from "./saving/exportRequest";
import { openPdfBlobForPrint, printPdfBlob } from "./saving/print";
import { computeFitScale } from "./viewer/fit";
import { getContinuousRenderWindow } from "./viewer/continuousRenderWindow";
import { getCanvasRenderDimensions } from "./viewer/rendering";
import { type PdfSearchHit } from "./pdf/search";
import { loadPdfFormPage, type PdfFormField } from "./pdf/forms";
import { usePdfSearch } from "./hooks/usePdfSearch";
import "./App.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DOCUMENT_STORAGE_WARNING = "Les PDF ne peuvent pas être conservés durablement dans ce navigateur. Ils resteront ouverts jusqu'à la fermeture de l'onglet.";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const VIEWER_PAN_STEP = 56;
// PDF.js 6.1.200 exports these values. The numeric fallback keeps existing
// lightweight PDF.js test doubles compatible with the display contract.
const PDFJS_DISPLAY_ANNOTATION_MODES = {
  ENABLE: pdfjsLib.AnnotationMode?.ENABLE ?? 1,
  ENABLE_FORMS: pdfjsLib.AnnotationMode?.ENABLE_FORMS ?? 2,
};

type RenderState = "idle" | "loading" | "ready" | "error";
type WorkspaceMode = "read" | "organize";
type ViewerMode = PersistedViewerMode | "presentation";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Lecture de ressource impossible.")));
    reader.readAsDataURL(blob);
  });
}

type PageNavigationRequest = {
  documentId: string;
  pageNumber: number;
  requestId: number;
  commentId?: string;
  position?: Extract<LinkDestination, { kind: "internal" }>;
};

type DocumentSidebarProps = {
  documents: OpenPdfDocument[];
  openFileInputRef: RefObject<HTMLInputElement | null>;
  activePageNumber: number;
  pagePlan: OrganizePagePlan | null;
  outline?: ReactNode;
  onSelectPage: (pageNumber: number) => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  status: string;
  storageWarning: string | null;
  sidebarId: string;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  pageView: "list" | "grid";
  onPageViewChange: (view: "list" | "grid") => void;
  comments: PdfCommentEdit[];
  commentsView: boolean;
  selectedCommentId: string | null;
  onCommentsViewChange: (value: boolean) => void;
  onSelectComment: (comment: PdfCommentEdit) => void;
};

function CommentInspector({ edit, onUpdate, onDelete }: { edit: PdfCommentEdit; onUpdate: (edit: PdfCommentEdit) => void; onDelete: () => void }) {
  const [author, setAuthor] = useState(edit.author ?? "");
  const [content, setContent] = useState(edit.content);
  useEffect(() => { setAuthor(edit.author ?? ""); setContent(edit.content); }, [edit]);
  const editable = edit.source === "local";
  const commit = () => {
    const nextAuthor = author.trim() || undefined;
    const nextContent = content.trim();
    if (!editable || !nextContent || (nextAuthor === edit.author && nextContent === edit.content)) return;
    onUpdate({ ...edit, author: nextAuthor, content: nextContent, modifiedAt: new Date().toISOString() });
  };
  return <section className="shape-edit-toolbar comment-inspector" aria-label="Propriétés du commentaire">
    <strong>Commentaire</strong>
    <label>Rédacteur<input aria-label="Rédacteur" value={author} readOnly={!editable} onChange={(event) => setAuthor(event.target.value)} onBlur={commit} placeholder="Non renseigné" /></label>
    <label>Message<textarea aria-label="Message" value={content} readOnly={!editable} onChange={(event) => setContent(event.target.value)} onBlur={commit} rows={4} /></label>
    <label>Type de message<output aria-label="Type de message">{getCommentTypeLabel(edit.commentType)}</output></label>
    <label>Source<output aria-label="Source">{edit.source === "pdf" ? "PDF source" : "Créé dans PDF Studio Local"}</output></label>
    {editable ? <button type="button" onClick={onDelete}>Supprimer le commentaire</button> : null}
  </section>;
}

type SidebarKeyTarget = "file-input" | string | null;
type ViewerFocusTarget = "viewer" | null;
type FocusTarget = SidebarKeyTarget | ViewerFocusTarget;
type TextMarkupSelection = { page: number; rects: PdfRect[]; anchor: Range };

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  const context = canvas.getContext("2d");
  context?.clearRect(0, 0, canvas.width, canvas.height);
  canvas.width = 0;
  canvas.height = 0;
  canvas.removeAttribute("style");
}

function clonePdfEdit(edit: PdfEdit): PdfEdit {
  if (edit.type === "add_text") {
    return {
      ...edit,
      rect: { ...edit.rect },
      style: { ...edit.style },
    };
  }

  if (edit.type === "shape") {
    return {
      ...edit,
      rect: { ...edit.rect },
      style: { ...edit.style },
    };
  }

  if (edit.type === "freehand") {
    return { ...edit, rect: { ...edit.rect }, points: edit.points.map((point) => ({ ...point })), style: { ...edit.style } };
  }

  if (edit.type === "text_markup") {
    return { ...edit, rect: { ...edit.rect }, rects: edit.rects.map((rect) => ({ ...rect })) };
  }

  if (edit.type === "comment") {
    return { ...edit, rect: { ...edit.rect } };
  }

  return { ...edit, rect: { ...edit.rect } };
}

function isInteractiveElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.closest(
      "button, input, textarea, select, a[href], [contenteditable='true'], .textLayer, .pdf-edit-layer",
    ) !== null
  );
}

function getSidebarDocumentId(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const documentButton = target.closest<HTMLElement>("[data-document-id]");

  return documentButton?.dataset.documentId ?? null;
}

function scrollViewerToPosition(viewer: HTMLElement, left: number, top: number) {
  if (typeof viewer.scrollTo === "function") {
    viewer.scrollTo({ left, top, behavior: "smooth" });
    return;
  }

  viewer.scrollLeft = left;
  viewer.scrollTop = top;
}

function scrollViewerByDelta(viewer: HTMLElement, left: number, top: number) {
  if (typeof viewer.scrollBy === "function") {
    viewer.scrollBy({ left, top, behavior: "smooth" });
    return;
  }

  viewer.scrollLeft += left;
  viewer.scrollTop += top;
}

type PdfPageCanvasProps = {
  backendUrl: string;
  sourceFile: File;
  sourceImageName?: string;
  pdfDocument: PDFDocumentProxy;
  sourcePageNumber: number;
  displayPageNumber: number;
  rotation: number;
  zoom: number;
  edits: PdfEdit[];
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  nativeTextRuntimeActive: boolean;
  formRuntimeActive: boolean;
  formOrganizationUnsupported: boolean;
  formUiLocked: boolean;
  pdfFormLocked: boolean;
  freehandStyle: FreehandStyle;
  pendingSignatureImage: SignatureImage | null;
  eyedropperTarget: "stroke" | "fill" | null;
  registerPageRef: (pageNumber: number, node: HTMLElement | null) => void;
  allowTextMarkup: boolean;
  onFollowLink: (destination: LinkDestination) => void;
  onEditLink?: (edit: PdfLinkEdit) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onAddNativeText: (span: NativeTextSpan, text: string) => void;
  onAddStamp: (pageNumber: number, rect: PdfRect) => void;
  onAddRedaction: (pageNumber: number, rect: PdfRect) => void;
  onAddShape: (pageNumber: number, shapeType: ShapeType, rect: PdfRect, line?: LineGeometry) => void;
  onAddFreehand: (pageNumber: number, points: import("./editing/types").PdfPoint[]) => void;
  onStartComment: (pageNumber: number, point: import("./editing/types").PdfPoint) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit, coalesceKey?: string) => void;
  onFinishEditCoalescing: (editId: string, property: string) => void;
  onDeleteEdit: (editId: string) => void;
  onSampleColor: (color: string) => void;
  onSetFormUiLock: (locked: boolean) => void;
  onRequestPdfFormLock: () => void;
  onUnlockPdfForm: () => void;
  fontLibraryRevision: number;
  searchHits: PdfSearchHit[];
  activeSearchHitId: string | null;
  isIncomingPage?: boolean;
  renderEnabled: boolean;
  onRenderReady?: (pageNumber: number) => void;
  onRenderError?: (pageNumber: number) => void;
  presentation?: boolean;
};

function PdfPageCanvas({
  backendUrl,
  sourceFile,
  sourceImageName,
  pdfDocument,
  sourcePageNumber,
  displayPageNumber,
  rotation,
  zoom,
  edits,
  signatureImages,
  selectedEditId,
  activeTool,
  nativeTextRuntimeActive,
  formRuntimeActive,
  formOrganizationUnsupported,
  formUiLocked,
  pdfFormLocked,
  freehandStyle,
  pendingSignatureImage,
  eyedropperTarget,
  registerPageRef,
  allowTextMarkup,
  onFollowLink,
  onEditLink,
  onAddText,
  onAddNativeText,
  onAddShape,
  onAddRedaction,
  onAddStamp,
  onAddFreehand,
  onStartComment,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onFinishEditCoalescing,
  onDeleteEdit,
  onSampleColor,
  onSetFormUiLock,
  onRequestPdfFormLock,
  onUnlockPdfForm,
  fontLibraryRevision,
  searchHits,
  activeSearchHitId,
  isIncomingPage = false,
  renderEnabled,
  onRenderReady,
  onRenderError,
  presentation = false,
}: PdfPageCanvasProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [textLayerRevision, setTextLayerRevision] = useState(0);
  const shouldRender = renderEnabled;
  const [renderState, setRenderState] = useState<RenderState>("idle");
  const [geometryPage, setGeometryPage] = useState<PDFPageProxy | null>(null);
  const viewport = useMemo(() => geometryPage?.getViewport({
    scale: zoom,
    rotation: ((geometryPage.rotate ?? 0) + rotation) % 360,
  }), [geometryPage, rotation, zoom]);
  const [nativeTextSpans, setNativeTextSpans] = useState<NativeTextSpan[]>([]);
  const [formFields, setFormFields] = useState<PdfFormField[]>([]);
  const [canvasAnnotationMode, setCanvasAnnotationMode] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [nativeTextError, setNativeTextError] = useState<string | null>(null);
  const [nativeTextIndexed, setNativeTextIndexed] = useState(false);
  const [nativeTextPreviewDraft, setNativeTextPreviewDraft] = useState<NativeTextEdit | null>(null);
  const [nativeTextPreviewUrl, setNativeTextPreviewUrl] = useState<string | null>(null);
  const [nativeTextBackgroundReady, setNativeTextBackgroundReady] = useState(false);
  const [nativeTextFontValidation, setNativeTextFontValidation] = useState<Record<string, NativeTextFontValidation>>({});
  const nativeTextMaskEdits = (() => {
    const committed = edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text");
    return nativeTextPreviewDraft
      ? [...committed.filter((edit) => edit.source.sourceFingerprint !== nativeTextPreviewDraft.source.sourceFingerprint), nativeTextPreviewDraft]
      : committed;
  })();
  const nativeTextMaskKey = nativeTextMaskEdits.map((edit) => edit.source.sourceFingerprint).sort().join(":");
  // PDF.js 6.1.200's ENABLE_FORMS excludes interactive widget appearances from
  // the canvas. They are rendered exactly once by PdfFormLayer instead.
  const formLayerActive = formRuntimeActive && formFields.length > 0;
  const requestedAnnotationMode = getDisplayAnnotationMode(
    formLayerActive,
    PDFJS_DISPLAY_ANNOTATION_MODES,
  );
  const isFormCanvasReady = formLayerActive && canvasAnnotationMode === PDFJS_DISPLAY_ANNOTATION_MODES.ENABLE_FORMS;

  // Every continuous-mode page keeps a lightweight shell with its exact PDF
  // dimensions. This preserves scroll geometry while canvases and overlays are
  // only mounted for the shared render window around the viewport.
  useEffect(() => {
    let cancelled = false;
    void pdfDocument.getPage(sourcePageNumber).then((page) => {
      if (cancelled) return;
      setGeometryPage(page);
    }).catch(() => {
      if (!cancelled) setRenderState("error");
    });
    return () => { cancelled = true; };
  }, [pdfDocument, sourcePageNumber]);

  useEffect(() => {
    if (shouldRender) return;
    setRenderState("idle");
    setCanvasAnnotationMode(null);
    setTextLayerRevision((revision) => revision + 1);
    clearCanvas(canvasRef.current);
  }, [shouldRender]);

  useEffect(() => () => {
    if (nativeTextPreviewUrl) URL.revokeObjectURL(nativeTextPreviewUrl);
  }, [nativeTextPreviewUrl]);

  useEffect(() => {
    if (!nativeTextRuntimeActive) {
      setNativeTextPreviewUrl(null);
      setNativeTextBackgroundReady(false);
      return;
    }
    if (nativeTextMaskEdits.length === 0) {
      setNativeTextPreviewUrl(null);
      setNativeTextBackgroundReady(false);
      return;
    }
    let cancelled = false;
    setNativeTextBackgroundReady(false);
    void renderNativeTextBackground(backendUrl, sourceFile, sourcePageNumber, nativeTextMaskEdits, rotation).then((blob) => {
      if (cancelled) return;
      const next = URL.createObjectURL(blob);
      setNativeTextPreviewUrl(next);
      setNativeTextBackgroundReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setNativeTextError(error instanceof Error ? error.message : "Aperçu du texte impossible.");
    });
    return () => { cancelled = true; };
  }, [backendUrl, nativeTextMaskKey, nativeTextRuntimeActive, rotation, sourceFile, sourcePageNumber]);

  const prepareNativeTextBackground = useCallback(async (span: NativeTextSpan) => {
    try {
      await renderNativeTextBackground(backendUrl, sourceFile, sourcePageNumber, [{
        id: `native-preview-${span.sourceFingerprint}`,
        type: "native_text",
        page: span.page,
        rect: span.rect,
        source: span,
        text: "",
        style: {
          fontFamily: span.sourceFontName ?? "Noto Sans",
          fontSize: span.sourceFontSize,
          color: span.sourceColor,
          bold: span.fontWeight >= 700,
          fontStyle: span.fontStyle,
        },
      }], rotation);
      return true;
    } catch (error) {
      setNativeTextError(error instanceof Error ? error.message : "Aperçu du texte impossible.");
      return false;
    }
  }, [backendUrl, rotation, sourceFile, sourcePageNumber]);

  useEffect(() => {
    if (!nativeTextRuntimeActive) {
      setNativeTextFontValidation({});
      return;
    }
    const nativeEdits = edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text");
    let cancelled = false;
    if (nativeEdits.length === 0) {
      setNativeTextFontValidation({});
      return;
    }
    void Promise.all(nativeEdits.map(async (edit) => {
      const fontRef = edit.style.fontRef ?? edit.style.fontFamily;
      const customFont = fontRef.startsWith("custom:") ? await getCustomFont(fontRef) : null;
      if (fontRef.startsWith("custom:") && !customFont) {
        return [edit.id, { status: "missing", fontRef, message: `Police manquante : « ${edit.style.fontFamily} ». Importez le fichier .ttf ou .otf correspondant pour l’utiliser dans le PDF.` } satisfies NativeTextFontValidation] as const;
      }
      const resources = customFont ? [{ id: customFont.id, sha256: customFont.sha256, format: customFont.format, fileName: customFont.originalFileName, dataUrl: await blobToDataUrl(customFont.binary) }] : [];
      return [edit.id, await validateNativeTextFont(backendUrl, sourceFile, sourcePageNumber, edit, resources)] as const;
    })).then((entries) => {
      if (!cancelled) setNativeTextFontValidation(Object.fromEntries(entries));
    }).catch((error: unknown) => {
      if (!cancelled) setNativeTextError(error instanceof Error ? error.message : "Validation de police impossible.");
    });
    return () => { cancelled = true; };
  }, [backendUrl, edits, fontLibraryRevision, nativeTextRuntimeActive, sourceFile, sourcePageNumber]);

  useEffect(() => {
    if (!nativeTextRuntimeActive || !shouldRender) {
      setNativeTextSpans([]);
      setNativeTextIndexed(false);
      setNativeTextPreviewDraft(null);
      clearNativeTextCache(sourceFile);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setNativeTextIndexed(false);
    setNativeTextSpans([]);
    setNativeTextError(null);
    void loadNativeTextPage(backendUrl, sourceFile, sourcePageNumber, controller.signal)
      .then((spans) => {
        if (!cancelled) {
          setNativeTextSpans(spans);
          setNativeTextIndexed(true);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (!cancelled) {
          setNativeTextError(error instanceof Error ? error.message : "Analyse du texte impossible.");
          setNativeTextIndexed(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearNativeTextCache(sourceFile);
      setNativeTextSpans([]);
      setNativeTextIndexed(false);
      setNativeTextPreviewDraft(null);
    };
  }, [backendUrl, nativeTextRuntimeActive, shouldRender, sourceFile, sourcePageNumber]);

  useEffect(() => {
    if (!formRuntimeActive || !shouldRender) {
      setFormFields([]);
      setFormError(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    void pdfDocument.getPage(sourcePageNumber)
      .then(async (page) => {
        const annotations = await page.getAnnotations({ intent: "display" });
        if (!annotations.some((annotation) => annotation.subtype === "Widget")) return [];
        return loadPdfFormPage(backendUrl, sourceFile, sourcePageNumber, controller.signal);
      })
      .then((fields) => { if (!cancelled) setFormFields(fields ?? []); })
      .catch((error: unknown) => {
        // A PDF.js mock or a reader without annotation support is simply not a
        // form document. Real backend errors remain visible once widgets exist.
        if (!controller.signal.aborted && !cancelled && error instanceof Error && !/getAnnotations/.test(error.message)) setFormError(error.message);
      });
    return () => { cancelled = true; controller.abort(); setFormFields([]); };
  }, [backendUrl, formRuntimeActive, pdfDocument, shouldRender, sourceFile, sourcePageNumber]);

  const sampleRenderedColor = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!eyedropperTarget) {
        return false;
      }
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return true;
      }
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return true;
      }
      const pixelX = Math.max(
        0,
        Math.min(
          canvas.width - 1,
          Math.floor((event.clientX - bounds.left) * (canvas.width / bounds.width)),
        ),
      );
      const pixelY = Math.max(
        0,
        Math.min(
          canvas.height - 1,
          Math.floor((event.clientY - bounds.top) * (canvas.height / bounds.height)),
        ),
      );
      try {
        const [red, green, blue] = context.getImageData(pixelX, pixelY, 1, 1).data;
        onSampleColor(
          `#${[red, green, blue]
            .map((channel) => channel.toString(16).padStart(2, "0"))
            .join("")}`,
        );
      } catch {
        // A canvas that cannot be sampled simply leaves the color unchanged.
      }
      return true;
    },
    [eyedropperTarget, onSampleColor],
  );

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayerTask: PdfTextLayerRenderTask | null = null;
    const staging = document.createElement("canvas");
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    const textLayerContainer = textLayerRef.current;

    if (!shouldRender || !canvas || !surface || !textLayerContainer) {
      return;
    }

    async function renderPage() {
      setRenderState("loading");

      try {
        const page = await pdfDocument.getPage(sourcePageNumber);

        if (
          isCancelled ||
          !canvas ||
          !surface ||
          !textLayerContainer
        ) {
          return;
        }

        const viewport = page.getViewport({
          scale: zoom,
          rotation: ((page.rotate ?? 0) + rotation) % 360,
        });
        const renderDimensions = getCanvasRenderDimensions(
          viewport.width,
          viewport.height,
          window.devicePixelRatio,
        );
        staging.width = renderDimensions.canvasWidth;
        staging.height = renderDimensions.canvasHeight;
        const context = staging.getContext("2d");
        if (!context) throw new Error("Le canvas n'est pas disponible.");

        try {
          if (!presentation) textLayerTask = renderPdfTextLayer({
            page,
            viewport,
            container: textLayerContainer,
          });
          void textLayerTask?.promise.then((rendered) => {
            if (!isCancelled && rendered) setTextLayerRevision((revision) => revision + 1);
          }).catch((error: unknown) => {
            if (!isCancelled) {
              console.warn("Impossible de rendre la couche texte PDF.", error);
            }
          });
        } catch (error) {
          textLayerContainer.replaceChildren();
          textLayerContainer.hidden = true;
          console.warn("Impossible de démarrer la couche texte PDF.", error);
        }

        renderTask = page.render({
          canvas: staging,
          canvasContext: context,
          viewport,
          annotationMode: requestedAnnotationMode,
          transform: [renderDimensions.outputScale, 0, 0, renderDimensions.outputScale, 0, 0],
        });

        await renderTask.promise;

        if (!isCancelled) {
          const visibleContext = canvas.getContext("2d");
          if (!visibleContext) throw new Error("Canvas indisponible.");
          // Synchronous copy: the browser cannot paint between resize and draw.
          canvas.width = staging.width;
          canvas.height = staging.height;
          visibleContext.drawImage(staging, 0, 0);
          if (context.isContextLost?.() || visibleContext.isContextLost?.()) {
            throw new Error("Le contexte du canvas a été perdu.");
          }
          canvas.style.width = `${renderDimensions.cssWidth}px`;
          canvas.style.height = `${renderDimensions.cssHeight}px`;
          setCanvasAnnotationMode(requestedAnnotationMode);
          setRenderState("ready");
          onRenderReady?.(displayPageNumber);
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          if (sourceImageName) console.warn("IMAGE_DOCUMENT_RENDER_FAILED", {
            cause: error instanceof Error ? error.name : "UnknownError",
            page: sourcePageNumber,
          });
          setRenderState("error");
          onRenderError?.(displayPageNumber);
        }
      } finally {
        clearCanvas(staging);
      }
    }

    void renderPage();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      textLayerTask?.cancel();
      textLayerContainer.replaceChildren();
      textLayerContainer.hidden = true;
      // Preserve the visible frame until its replacement has fully rendered.
    };
  }, [displayPageNumber, onRenderReady, onRenderError, presentation, pdfDocument, requestedAnnotationMode, rotation, shouldRender, sourceImageName, sourcePageNumber, zoom]);

  useEffect(() => {
    return () => {
      clearCanvas(canvasRef.current);
    };
  }, []);

  return (
    <article
      ref={(node) => {
        pageRef.current = node;
        registerPageRef(displayPageNumber, node);
      }}
      className={isIncomingPage ? "pdf-page pdf-page--incoming" : "pdf-page"}
      data-page-buffer={isIncomingPage ? "back" : "front"}
      data-page-number={displayPageNumber}
      data-source-page-number={sourcePageNumber}
      data-rotation={rotation}
      data-rendered={shouldRender ? "true" : "false"}
      data-render-state={renderState}
      data-annotation-mode={canvasAnnotationMode === PDFJS_DISPLAY_ANNOTATION_MODES.ENABLE_FORMS ? "enable_forms" : "enable"}
      aria-label={`Page ${displayPageNumber}`}
      aria-hidden={isIncomingPage || undefined}
      inert={isIncomingPage}
    >
      <div className="page-number">Page {displayPageNumber}</div>
      <div
        ref={surfaceRef}
        className="page-surface"
        style={viewport ? { width: viewport.width, height: viewport.height, minWidth: 0, minHeight: 0 } : undefined}
        onClick={(event) => {
          if (sampleRenderedColor(event)) {
            return;
          }
          if (activeTool === "select") {
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed) {
              return;
            }
            if (viewport && surfaceRef.current) {
              const bounds = surfaceRef.current.getBoundingClientRect();
              const [x, y] = viewport.convertToPdfPoint(
                event.clientX - bounds.left,
                event.clientY - bounds.top,
              );
              const markup = findTextMarkupAtPoint(
                edits.filter((edit): edit is TextMarkupEdit => edit.type === "text_markup"),
                sourcePageNumber,
                { x, y },
              );
              if (markup) {
                onSelectEdit(markup.id);
                return;
              }
            }
            onDeselectEdit();
          }
        }}
      >
        {!shouldRender ? <div className="page-placeholder" aria-hidden="true" /> : null}
        {shouldRender && renderState === "error" ? (
          <p className="page-error" role="alert">{sourceImageName
            ? `Impossible d’afficher l’image « ${sourceImageName} ».`
            : "Impossible d'afficher cette page."}</p>
        ) : null}
        {shouldRender && renderState !== "ready" && renderState !== "error" ? (
          <div className="page-placeholder" aria-hidden="true">
            {renderState === "loading" ? "Chargement..." : ""}
          </div>
        ) : null}
        {shouldRender ? <canvas ref={canvasRef} className="pdf-canvas" /> : null}
        {shouldRender && searchHits.length > 0 ? (
          <PdfSearchHighlights
            hits={searchHits}
            activeHitId={activeSearchHitId}
            textLayer={textLayerRef.current}
            surface={surfaceRef.current}
            textLayerRevision={textLayerRevision}
          />
        ) : null}
        {shouldRender && nativeTextPreviewUrl ? <img className="native-text-preview" data-native-preview-kind="clean-background" src={nativeTextPreviewUrl} alt="" aria-hidden="true" /> : null}
        {shouldRender ? <div
          ref={textLayerRef}
          className="textLayer pdf-text-layer"
          hidden
          onMouseUp={() => {
            if (!allowTextMarkup || activeTool !== "select" || !viewport || !surfaceRef.current || !textLayerRef.current) return;
            window.setTimeout(() => {
              const selection = window.getSelection();
              if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
              const range = selection.getRangeAt(0);
              try {
                if (!range.intersectsNode(textLayerRef.current!)) return;
              } catch {
                return;
              }
              const surfaceBounds = surfaceRef.current!.getBoundingClientRect();
              const pageRects = [...range.getClientRects()].filter((rect) => {
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                return centerX >= surfaceBounds.left && centerX <= surfaceBounds.right && centerY >= surfaceBounds.top && centerY <= surfaceBounds.bottom;
              });
              const rects = selectionClientRectsToPdfRects(pageRects, surfaceBounds, viewport);
              const anchor = range.getBoundingClientRect();
              if (rects.length === 0 || anchor.width < 1) return;
              window.dispatchEvent(new CustomEvent("pdf-text-markup-selection", { detail: { page: sourcePageNumber, rects, anchor: range.cloneRange() } }));
            }, 0);
          }}
        /> : null}
        {shouldRender && viewport && nativeTextRuntimeActive ? (
          <NativeTextLayer
            spans={nativeTextSpans.length ? nativeTextSpans : edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text").map((edit) => ({ ...edit.source, page: edit.page, rect: edit.rect, fontWeight: edit.style.bold ? 700 : 400, fontStyle: edit.style.fontStyle ?? "normal" }))}
            edits={edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text")}
            viewport={viewport}
            selectedEditId={selectedEditId}
            onCreateEdit={onAddNativeText}
            onSelectEdit={onSelectEdit}
            onUpdateEdit={(edit) => onUpdateEdit(edit)}
            onPreviewChange={setNativeTextPreviewDraft}
            onPrepareBackground={prepareNativeTextBackground}
            isBackgroundReady={nativeTextBackgroundReady}
            fontValidationByEditId={nativeTextFontValidation}
          />
        ) : null}
        {shouldRender && viewport && isFormCanvasReady ? (
          <>
          <PdfFormLayer
            fields={formFields}
            edits={edits.filter((edit): edit is PdfFormEdit => edit.type === "form_field")}
            viewport={viewport}
            uiLocked={formUiLocked || formOrganizationUnsupported}
            pdfLocked={pdfFormLocked}
            onChange={(field, value) => {
              const existing = edits.find((edit): edit is PdfFormEdit => edit.type === "form_field" && edit.fieldName === field.name);
              const next: PdfFormEdit = existing ?? { id: `form-${field.pageIndex}-${field.name}`, type: "form_field", page: sourcePageNumber, rect: field.rect, fieldName: field.name, value };
              onUpdateEdit({ ...next, value }, `form-${field.pageIndex}-${field.name}:value`);
            }}
            onFinish={(field) => onFinishEditCoalescing(`form-${field.pageIndex}-${field.name}`, "value")}
          />
          {formOrganizationUnsupported ? <p className="native-text-layer__error" role="status">Formulaires après organisation — WIP. L’édition des champs est désactivée. Rétablissez l’organisation source pour modifier le formulaire.</p> : <FormLockToolbar
            uiLocked={formUiLocked}
            pdfLocked={pdfFormLocked}
            onSetUiLocked={onSetFormUiLock}
            onRequestPdfLock={onRequestPdfFormLock}
            onUnlockPdf={onUnlockPdfForm}
          />}
          </>
        ) : null}
        {shouldRender && formError && formRuntimeActive ? <p className="native-text-layer__error" role="status">{formError}</p> : null}
        {shouldRender && nativeTextError && nativeTextRuntimeActive ? <p className="native-text-layer__error" role="status">{nativeTextError}</p> : null}
        {shouldRender && nativeTextRuntimeActive && !nativeTextIndexed && !nativeTextError ? <p className="native-text-layer__error" role="status">Analyse du texte de cette page…</p> : null}
        {shouldRender && nativeTextRuntimeActive &&
        nativeTextIndexed &&
        !nativeTextError &&
        nativeTextSpans.length === 0 &&
        !edits.some((edit) => edit.type === "native_text") ? (
          <p className="native-text-layer__error" role="status">
            Aucun texte PDF natif modifiable sur cette page. Le texte présent uniquement dans une image ou converti en courbes ne peut pas être édité directement.
          </p>
        ) : null}
        {shouldRender && viewport ? <PdfLinks
          key={sourcePageNumber}
          pdf={pdfDocument} pageNumber={sourcePageNumber} viewport={viewport}
          edits={edits.filter((edit): edit is PdfLinkEdit => edit.type === "link")}
          tool={activeTool} disabled={Boolean(eyedropperTarget)}
          onFollow={onFollowLink} onEdit={onEditLink}
        /> : null}
        {shouldRender && viewport ? (
          <PdfEditLayer
            inert={presentation}
            pageNumber={sourcePageNumber}
            viewport={viewport}
            edits={edits}
            images={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeTool}
            freehandStyle={freehandStyle}
            pendingSignatureImage={pendingSignatureImage}
            onAddLink={(rect) => onEditLink?.({ type: "link", id: crypto.randomUUID(), page: sourcePageNumber, rect, destination: null })}
            onAddText={(rect) => onAddText(sourcePageNumber, rect)}
            onAddStamp={(rect) => onAddStamp(sourcePageNumber, rect)}
            onAddRedaction={(rect) => onAddRedaction(sourcePageNumber, rect)}
            onAddShape={(shapeType, rect, line) =>
              onAddShape(sourcePageNumber, shapeType, rect, line)
            }
            onAddFreehand={(points) => onAddFreehand(sourcePageNumber, points)}
            onStartComment={(point) => onStartComment(sourcePageNumber, point)}
            onPlaceSignature={(rect) => onPlaceSignature(sourcePageNumber, rect)}
            onSelect={onSelectEdit}
            onUpdate={onUpdateEdit}
            onDelete={onDeleteEdit}
          />
        ) : null}
      </div>
    </article>
  );
}

type PdfViewerProps = {
  backendUrl: string;
  document: OpenPdfDocument;
  documents: OpenPdfDocument[];
  pagePlan: OrganizePagePlan;
  edits: PdfEdit[];
  editsByDocument: PdfEditsByDocument;
  signatureImages: Record<string, SignatureImage>;
  selectedEditId: string | null;
  activeTool: EditingTool;
  formUiLocked: boolean;
  pdfFormLocked: boolean;
  freehandStyle: FreehandStyle;
  pendingSignatureImage: SignatureImage | null;
  eyedropperTarget: "stroke" | "fill" | null;
  onZoomChange: (documentId: string, delta: number) => void;
  onZoomSet: (documentId: string, zoom: number) => void;
  onScrollPositionChange: (documentId: string, scrollLeft: number, scrollTop: number) => void;
  onFollowLink: (sourceDocumentId: string, destination: LinkDestination, fromPage?: number) => void;
  onEditLink: (edit: PdfLinkEdit) => void;
  onAddText: (pageNumber: number, rect: PdfRect) => void;
  onAddNativeText: (span: NativeTextSpan, text: string) => void;
  onAddStamp: (pageNumber: number, rect: PdfRect) => void;
  onAddRedaction: (pageNumber: number, rect: PdfRect) => void;
  onAddShape: (pageNumber: number, shapeType: ShapeType, rect: PdfRect, line?: LineGeometry) => void;
  onAddFreehand: (pageNumber: number, points: import("./editing/types").PdfPoint[]) => void;
  onStartComment: (pageNumber: number, point: import("./editing/types").PdfPoint) => void;
  onPlaceSignature: (pageNumber: number, rect: PdfRect) => void;
  onSelectEdit: (editId: string) => void;
  onDeselectEdit: () => void;
  onUpdateEdit: (edit: PdfEdit, coalesceKey?: string) => void;
  onFinishEditCoalescing: (editId: string, property: string) => void;
  onDeleteEdit: (editId: string) => void;
  onActivePageChange: (documentId: string, pageNumber: number) => void;
  onSampleColor: (color: string) => void;
  onSetFormUiLock: (locked: boolean) => void;
  onRequestPdfFormLock: () => void;
  onUnlockPdfForm: () => void;
  fontLibraryRevision: number;
  searchHits: PdfSearchHit[];
  activeSearchHitId: string | null;
  focusRequest: number;
  pageNavigationRequest: PageNavigationRequest | null;
  viewerMode: ViewerMode;
  activePageNumber: number;
  shouldFitToPage: boolean;
  fitRefreshToken: number;
};

function PdfViewer({
  backendUrl,
  document,
  documents,
  pagePlan,
  edits,
  editsByDocument,
  signatureImages,
  selectedEditId,
  activeTool,
  formUiLocked,
  pdfFormLocked,
  freehandStyle,
  pendingSignatureImage,
  eyedropperTarget,
  onZoomChange,
  onZoomSet,
  onScrollPositionChange,
  onFollowLink,
  onEditLink,
  onAddText,
  onAddNativeText,
  onAddShape,
  onAddRedaction,
  onAddStamp,
  onAddFreehand,
  onStartComment,
  onPlaceSignature,
  onSelectEdit,
  onDeselectEdit,
  onUpdateEdit,
  onFinishEditCoalescing,
  onDeleteEdit,
  onActivePageChange,
  onSampleColor,
  onSetFormUiLock,
  onRequestPdfFormLock,
  onUnlockPdfForm,
  fontLibraryRevision,
  searchHits,
  activeSearchHitId,
  focusRequest,
  pageNavigationRequest,
  viewerMode,
  activePageNumber,
  shouldFitToPage,
  fitRefreshToken,
}: PdfViewerProps) {
  const viewerRef = useRef<HTMLElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const lastFocusRequestRef = useRef<number | null>(null);
  const consumedNavigation = useRef<number | null>(null);
  const navigationAnchor = useRef<number | null>(null);
  const pageRefs = useRef(new Map<number, HTMLElement | null>());
  const observedPageNumbersRef = useRef(new Set<number>());
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fitLayoutVersion, setFitLayoutVersion] = useState(0);
  const [observedPageNumbers, setObservedPageNumbers] = useState<number[]>([]);
  const scrolling = isScrollingMode(viewerMode);
  const multipage = isMultipageMode(viewerMode);
  const currentLayout = useRef({ mode: viewerMode, zoom: document.zoom });
  currentLayout.current = { mode: viewerMode, zoom: document.zoom };
  const previousLayout = useRef({ mode: viewerMode, zoom: document.zoom, documentId: document.id });
  const readingOffset = useRef({ page: activePageNumber, fraction: 0 });
  const pages = useMemo(
    () =>
      pagePlan.pages.flatMap((plannedPage) => {
        const sourceDocument = documents.find(
          (candidate) => candidate.id === plannedPage.sourceDocumentId,
        );
        return sourceDocument ? [{ ...plannedPage, sourceDocument }] : [];
      }),
    [documents, pagePlan.pages],
  );
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const [visiblePage, setVisiblePage] = useState<{ documentId: string; pageNumber: number } | null>(null);
  const visiblePageNumber = visiblePage?.documentId === document.id ? visiblePage.pageNumber : null;

  useEffect(() => {
    setVisiblePage(null);
  }, [document.id]);

  const [pageTransitionError, setPageTransitionError] = useState<string | null>(null);
  const reportRenderError = useCallback((pageNumber: number) => setPageTransitionError(`La page ${pageNumber} n’a pas pu être rendue. La slide courante est conservée.`), []);
  const requestedPageRef = useRef(activePageNumber);
  requestedPageRef.current = activePageNumber;
  const commitVisiblePage = useCallback((pageNumber: number) => {
    if (scrolling || pageNumber !== requestedPageRef.current) return;
    setPageTransitionError(null);
    setVisiblePage((current) =>
      current?.documentId === document.id && current.pageNumber === pageNumber
        ? current
        : { documentId: document.id, pageNumber },
    );
  }, [document.id, scrolling]);

  const pagesToRender = useMemo(() => {
    if (scrolling) return pages.map((page) => ({ page, isIncoming: false }));
    const requested = pages.find((page) => page.displayPageNumber === activePageNumber);
    if (!requested) return [];
    const visible = visiblePageNumber === null
      ? null
      : pages.find((page) => page.displayPageNumber === visiblePageNumber) ?? null;
    if (!visible || visible.id === requested.id) return [{ page: requested, isIncoming: false }];
    return [{ page: visible, isIncoming: false }, { page: requested, isIncoming: true }];
  }, [activePageNumber, pages, scrolling, visiblePageNumber]);

  const registerPageRef = useCallback((pageNumber: number, node: HTMLElement | null) => {
    const previous = pageRefs.current.get(pageNumber) ?? null;
    if (previous === node) return;
    if (node === null) {
      pageRefs.current.delete(pageNumber);
    } else {
      pageRefs.current.set(pageNumber, node);
    }
  }, []);

  useEffect(() => {
    observedPageNumbersRef.current.clear();
    setObservedPageNumbers([]);
  }, [document.id, viewerMode]);

  // A single observer owned by the viewer drives the bounded continuous render
  // window. Page components no longer keep one sticky observer/canvas each.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!scrolling || !viewer || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      const next = new Set(observedPageNumbersRef.current);
      for (const entry of entries) {
        const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber);
        if (!Number.isInteger(pageNumber)) continue;
        if (entry.isIntersecting) next.add(pageNumber);
        else next.delete(pageNumber);
      }
      observedPageNumbersRef.current = next;
      const nextNumbers = [...next].sort((left, right) => left - right);
      setObservedPageNumbers((current) =>
        current.length === nextNumbers.length && current.every((pageNumber, index) => pageNumber === nextNumbers[index])
          ? current
          : nextNumbers,
      );
    }, { root: viewer, threshold: 0.01 });

    for (const pageElement of pageRefs.current.values()) {
      if (pageElement) observer.observe(pageElement);
    }
    return () => observer.disconnect();
  }, [document.id, pagePlan.pages, scrolling, viewerMode]);

  const continuousRenderPageNumbers = useMemo(
    () => scrolling
      ? getContinuousRenderWindow(pages.length, [activePageNumber, ...observedPageNumbers])
      : null,
    [activePageNumber, observedPageNumbers, pages.length, scrolling],
  );

  const goToPage = useCallback((pageNumber: number) => {
    onActivePageChange(document.id, Math.min(pages.length, Math.max(1, pageNumber)));
  }, [document.id, onActivePageChange, pages.length]);

  const getCurrentPageNumber = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return 1;
    }

    const preferred = navigationAnchor.current === null ? null : pageRefs.current.get(navigationAnchor.current);
    if (preferred) {
      const pageBounds = preferred.getBoundingClientRect();
      const bounds = viewer.getBoundingClientRect();
      const visibleHeight = Math.min(pageBounds.bottom, bounds.bottom) - Math.max(pageBounds.top, bounds.top);
      const visibleWidth = Math.min(pageBounds.right, bounds.right) - Math.max(pageBounds.left, bounds.left);
      if (pageBounds.height > 0 && visibleHeight >= Math.min(pageBounds.height, bounds.height) * 0.12
        && (!multipage || visibleWidth >= Math.min(pageBounds.width, bounds.width) * 0.12)) {
        return navigationAnchor.current!;
      }
      navigationAnchor.current = null;
    }
    const targetScrollTop = viewer.scrollTop + viewer.clientHeight / 2;
    if (multipage) {
      const bounds = viewer.getBoundingClientRect();
      const middleY = bounds.top + viewer.clientHeight / 2;
      const middleX = bounds.left + viewer.clientWidth / 2;
      let nearest = 1;
      let bestDistance = Infinity;
      for (const [pageNumber, element] of pageRefs.current) {
        if (!element) continue;
        const page = element.getBoundingClientRect();
        const y = Math.max(0, page.top - middleY, middleY - page.bottom);
        const x = Math.max(0, page.left - middleX, middleX - page.right);
        const distance = y * (viewer.clientWidth + 1) + x;
        if (distance < bestDistance || (distance === bestDistance && pageNumber < nearest)) {
          bestDistance = distance;
          nearest = pageNumber;
        }
      }
      return nearest;
    }
    let currentPageNumber = 1;

    for (const page of pagesRef.current) {
      const pageElement = pageRefs.current.get(page.displayPageNumber);

      if (!pageElement) {
        continue;
      }

      const pageTop = pageElement.offsetTop;
      const pageBottom = pageTop + pageElement.offsetHeight;

      if (targetScrollTop >= pageTop && targetScrollTop < pageBottom) {
        return page.displayPageNumber;
      }

      if (targetScrollTop >= pageTop) {
        currentPageNumber = page.displayPageNumber;
      }
    }

    return currentPageNumber;
  }, [multipage, pagePlan.pages]);

  useEffect(() => {
    if (viewerMode === "continuous") onActivePageChange(document.id, getCurrentPageNumber());
  // Initial document restoration already sets the viewport scroll offsets.
  }, [document.id]);

  const scrollPageIntoView = useCallback((pageNumber: number, direct = false, fraction = 0) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(pageNumber)
      ?? viewer?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);

    if (!viewer || !pageElement) {
      return false;
    }

    if (direct) {
      const viewerBounds = viewer.getBoundingClientRect();
      const pageBounds = pageElement.getBoundingClientRect();
      if (pageBounds.height > 0 && viewerBounds.height > 0) {
        viewer.scrollTop = Math.max(0, viewer.scrollTop + pageBounds.top - viewerBounds.top - 8 + pageBounds.height * fraction);
        if (pageBounds.left < viewerBounds.left || pageBounds.right > viewerBounds.right) {
          viewer.scrollLeft += pageBounds.left - viewerBounds.left - 8;
        }
      } else {
        viewer.scrollTo({ top: pageElement.offsetTop, behavior: "smooth" });
      }
    } else {
      viewer.scrollTo({ top: pageElement.offsetTop, behavior: "smooth" });
    }
    return true;
  }, []);

  const scrollCommentIntoView = useCallback((pageNumber: number, commentId: string) => {
    const viewer = viewerRef.current;
    const pageElement = pageRefs.current.get(pageNumber)
      ?? viewer?.querySelector<HTMLElement>(`.pdf-page[data-page-number="${pageNumber}"]`);

    if (!viewer || !pageElement) {
      return false;
    }

    const marker = [...pageElement.querySelectorAll<HTMLElement>("[data-comment-id]")]
      .find((candidate) => candidate.dataset.commentId === commentId);

    if (!marker) {
      return false;
    }

    const viewerBounds = viewer.getBoundingClientRect();
    const markerBounds = marker.getBoundingClientRect();
    const annotationTop = viewer.scrollTop + markerBounds.top - viewerBounds.top;
    viewer.scrollTop = getAnnotationScrollTop({
      annotationTop,
      annotationHeight: markerBounds.height,
      viewportHeight: viewer.clientHeight,
      scrollHeight: viewer.scrollHeight,
    });
    return true;
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    viewer.scrollLeft = document.scrollLeft;
    viewer.scrollTop = document.scrollTop;
  }, [document.id, document.scrollLeft, document.scrollTop]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || (scrolling && viewerMode !== "facing") || !shouldFitToPage) {
      return;
    }

    let frame = 0;
    const updateLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setFitLayoutVersion((currentVersion) => currentVersion + 1));
    };
    const observer = "ResizeObserver" in window ? new ResizeObserver(updateLayout) : null;
    observer?.observe(viewer);
    window.addEventListener("resize", updateLayout);
    updateLayout();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [scrolling, shouldFitToPage, viewerMode]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const page = pagesRef.current.find((candidate) => candidate.displayPageNumber === activePageNumber);

    if (!viewer || !page || (scrolling && viewerMode !== "facing") || !shouldFitToPage) {
      return;
    }

    let cancelled = false;
    const measure = async (entry: typeof page) => {
      const source = await entry.sourceDocument.pdfDocument.getPage(entry.sourcePageIndex + 1);
      return source.getViewport({ scale: 1, rotation: ((source.rotate ?? 0) + entry.rotation) % 360 });
    };
    const facing = viewerMode === "facing";
    const size = facing ? Promise.all(pagesRef.current.map(measure)).then(facingSpreadSize) : measure(page);
    void size.then((viewport) => {
      if (cancelled) return;
      const styles = facing ? window.getComputedStyle(viewer) : null;
      const horizontalPadding = styles ? parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight) : 0;
      const verticalPadding = styles ? parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) : 0;
      const navigationHeight = viewerMode === "presentation"
        ? 0
        : viewer.querySelector<HTMLElement>(".viewer-page-navigation")?.offsetHeight ?? 0;
      const scale = computeFitScale({
        pageWidth: viewport.width,
        pageHeight: viewport.height,
        containerWidth: viewer.clientWidth - horizontalPadding - (facing && pagesRef.current.length > 1 ? PAGE_ROW_GAP : 0),
        containerHeight: Math.max(1, viewer.clientHeight - navigationHeight - verticalPadding - (facing ? 28 : 0)),
        padding: viewerMode === "presentation" ? 0 : 20,
        minScale: MIN_ZOOM,
        maxScale: MAX_ZOOM,
      });
      onZoomSet(document.id, scale);
    }).catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activePageNumber, document.id, fitLayoutVersion, fitRefreshToken, onZoomSet, pagePlan.pages, scrolling, shouldFitToPage, viewerMode]);

  useLayoutEffect(() => {
    const previous = previousLayout.current;
    previousLayout.current = { mode: viewerMode, zoom: document.zoom, documentId: document.id };
    if (previous.documentId !== document.id) {
      navigationAnchor.current = null;
      readingOffset.current = { page: activePageNumber, fraction: 0 };
      return;
    }
    const modeChanged = previous.mode !== viewerMode;
    if (!scrolling || (!modeChanged && (!multipage || previous.zoom === document.zoom))) return;
    const fraction = readingOffset.current.page === activePageNumber ? readingOffset.current.fraction : 0;
    const restore = () => {
      navigationAnchor.current = activePageNumber;
      scrollPageIntoView(activePageNumber, true, fraction);
    };
    restore();
    // Coming from a single-page layout mounts the missing shells. Reapply the
    // anchor as soon as their PDF.js sizing promises have resolved.
    if (!modeChanged || isScrollingMode(previous.mode)) return;
    let cancelled = false;
    let frame = 0;
    void Promise.allSettled(pagesRef.current.map((page) =>
      page.sourceDocument.pdfDocument.getPage(page.sourcePageIndex + 1),
    )).then(() => {
      if (cancelled || requestedPageRef.current !== activePageNumber) return;
      frame = window.requestAnimationFrame(() => {
        if (!cancelled && requestedPageRef.current === activePageNumber) restore();
      });
    });
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [activePageNumber, document.id, document.zoom, multipage, pageNavigationRequest?.requestId, scrollPageIntoView, scrolling, viewerMode]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer || lastFocusRequestRef.current === focusRequest) {
      return;
    }

    lastFocusRequestRef.current = focusRequest;
    if (window.document.activeElement instanceof HTMLElement && window.document.activeElement.closest(".navigation-popover, .tool-rail")) return;
    viewer.focus();
  }, [document.id, focusRequest]);

  useEffect(() => {
    if (!pageNavigationRequest || consumedNavigation.current === pageNavigationRequest.requestId) return;
    consumedNavigation.current = pageNavigationRequest.requestId;
    navigationAnchor.current = pageNavigationRequest.pageNumber;
    goToPage(pageNavigationRequest.pageNumber);
    if (!pageNavigationRequest.commentId) {
      scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      const frame = window.requestAnimationFrame(() => {
        scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      });
      return () => window.cancelAnimationFrame(frame);
    }

    let attempts = 0;
    let retryTimer: number | null = null;
    const focusComment = () => {
      if (scrollCommentIntoView(pageNavigationRequest.pageNumber, pageNavigationRequest.commentId!)) {
        return;
      }
      scrollPageIntoView(pageNavigationRequest.pageNumber, true);
      if (attempts++ < 20) {
        retryTimer = window.setTimeout(focusComment, 50);
      }
    };
    focusComment();
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [goToPage, pageNavigationRequest, scrollCommentIntoView, scrollPageIntoView]);

  useEffect(() => {
    const request = pageNavigationRequest;
    if (!request?.position || (request.position.x === undefined && request.position.y === undefined)) return;
    const target = pagesRef.current.find((page) => page.displayPageNumber === request.pageNumber);
    if (!target) return;
    const { x, y, pageIndex } = request.position;
    let cancelled = false;
    let timer: number | undefined;
    void target.sourceDocument.pdfDocument.getPage(pageIndex + 1).then((page) => {
      if (cancelled) return;
      let retries = 40;
      const align = () => {
        const viewer = viewerRef.current;
        const article = pageRefs.current.get(request.pageNumber);
        const surface = article?.querySelector(".page-surface");
        const { mode, zoom } = currentLayout.current;
        const scroll = mode === "presentation" ? viewer?.querySelector<HTMLElement>(".pdf-document") : viewer;
        if (!surface || !scroll || article?.dataset.pageBuffer === "back" || article?.dataset.renderState !== "ready") {
          if (retries-- > 0) timer = window.setTimeout(align, 50);
          return;
        }
        const viewport = page.getViewport({ scale: zoom, rotation: ((page.rotate ?? 0) + target.rotation) % 360 });
        const [x0, , , y1] = viewport.viewBox;
        const [left, top] = viewport.convertToViewportPoint(x ?? x0, y ?? y1);
        const origin = surface.getBoundingClientRect();
        const bounds = scroll.getBoundingClientRect();
        navigationAnchor.current = request.pageNumber;
        scroll.scrollTop += origin.top - bounds.top + Math.max(0, Math.min(top, viewport.height)) - 8;
        if (x !== undefined || viewport.rotation % 180 !== 0) {
          scroll.scrollLeft += origin.left - bounds.left + Math.max(0, Math.min(left, viewport.width)) - 8;
        }
      };
      timer = window.setTimeout(align, 50);
    }).catch(() => undefined);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [document.id, pageNavigationRequest]);

  useEffect(() => {
    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      event.preventDefault();
      onZoomChange(document.id, event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
    }

    viewer.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewer.removeEventListener("wheel", handleWheel);
    };
  }, [document.id, onZoomChange]);

  useEffect(() => {
    const viewer = viewerRef.current;

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }

      if (viewer) {
        onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
      }
    };
  }, [document.id, onScrollPositionChange]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function finishDrag() {
      const viewer = viewerRef.current;

      if (!viewer || dragStateRef.current === null) {
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
    }

    function handleMove(event: globalThis.MouseEvent) {
      const viewer = viewerRef.current;
      const dragState = dragStateRef.current;

      if (!viewer || dragState === null) {
        return;
      }

      viewer.scrollLeft = dragState.startScrollLeft - (event.clientX - dragState.startX);
      viewer.scrollTop = dragState.startScrollTop - (event.clientY - dragState.startY);
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", finishDrag);
    window.addEventListener("blur", finishDrag);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("blur", finishDrag);
    };
  }, [document.id, isDragging, onScrollPositionChange]);

  const handleScroll = useCallback(() => {
    const viewer = viewerRef.current;

    if (!viewer || scrollFrameRef.current !== null) {
      return;
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      onScrollPositionChange(document.id, viewer.scrollLeft, viewer.scrollTop);
      if (scrolling) {
        const page = getCurrentPageNumber();
        const rect = pageRefs.current.get(page)?.getBoundingClientRect();
        if (rect?.height) readingOffset.current = { page, fraction: Math.max(0, (viewer.getBoundingClientRect().top - rect.top) / rect.height) };
        onActivePageChange(document.id, page);
      }
    });
  }, [document.id, getCurrentPageNumber, onActivePageChange, onScrollPositionChange, scrolling]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const viewer = viewerRef.current;

      if (!viewer) {
        return;
      }

      // Page unique and présentation are owned by the window-level navigation
      // listener so they never depend on focus remaining on this scroll area.
      if (!scrolling) {
        return;
      }

      const arrowStep = event.shiftKey ? 280 : VIEWER_PAN_STEP;
      const currentPageNumber = getCurrentPageNumber();
      const maxScrollTop = Math.max(0, viewer.scrollHeight - viewer.clientHeight);

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          scrollViewerByDelta(viewer, -arrowStep, 0);
          break;
        case "ArrowRight":
          event.preventDefault();
          scrollViewerByDelta(viewer, arrowStep, 0);
          break;
        case "ArrowUp":
          event.preventDefault();
          scrollViewerByDelta(viewer, 0, -arrowStep);
          break;
        case "ArrowDown":
          event.preventDefault();
          scrollViewerByDelta(viewer, 0, arrowStep);
          break;
        case "PageUp":
          event.preventDefault();
          if (currentPageNumber > 1) {
            navigationAnchor.current = currentPageNumber - 1;
            goToPage(currentPageNumber - 1);
            scrollPageIntoView(currentPageNumber - 1, multipage);
          }
          break;
        case "PageDown":
          event.preventDefault();
          if (currentPageNumber < pages.length) {
            navigationAnchor.current = currentPageNumber + 1;
            goToPage(currentPageNumber + 1);
            scrollPageIntoView(currentPageNumber + 1, multipage);
          }
          break;
        case "Home":
          event.preventDefault();
          scrollViewerToPosition(viewer, viewer.scrollLeft, 0);
          break;
        case "End":
          event.preventDefault();
          scrollViewerToPosition(viewer, viewer.scrollLeft, maxScrollTop);
          break;
        default:
          return;
      }
    },
    [document.id, getCurrentPageNumber, goToPage, multipage, pages.length, scrollPageIntoView, scrolling],
  );

  const handleMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }

    const viewer = viewerRef.current;

    if (!viewer) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewer.scrollLeft,
      startScrollTop: viewer.scrollTop,
    };
    setIsDragging(true);
  }, []);

  return (
    <section
      ref={viewerRef}
      data-testid="pdf-viewer"
      tabIndex={0}
      className={
        (multipage ? "viewer--multipage " : "") + (isDragging
          ? "viewer viewer--pan-enabled is-panning"
          : viewerMode === "presentation"
            ? "viewer viewer--presentation"
            : viewerMode === "single-page"
              ? "viewer viewer--single-page viewer--pan-enabled"
          : activeTool !== "select"
            ? "viewer viewer--text-tool"
            : eyedropperTarget
              ? "viewer viewer--eyedropper"
              : "viewer viewer--pan-enabled")
      }
      aria-label={`Aperçu PDF ${document.fileName}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onPointerDownCapture={(event) => {
        if (!multipage || !(event.target instanceof Element)) return;
        const article = event.target.closest<HTMLElement>(".pdf-page");
        const pageNumber = Number(article?.dataset.pageNumber);
        if (pageNumber > 0) {
          navigationAnchor.current = pageNumber;
          goToPage(pageNumber);
        }
      }}
    >
      {pageTransitionError ? <p className="presentation-render-error" role="status">{pageTransitionError}</p> : null}
      {document.error ? <p className="status">{document.error}</p> : null}
      <div className={multipage ? `pdf-document pdf-document--${viewerMode}` : scrolling ? "pdf-document" : "pdf-document pdf-document--page-transition"}
        style={multipage ? { gap: PAGE_ROW_GAP } : undefined} aria-label={`Document PDF ${document.fileName}`}>
        {pagesToRender.map(({ page, isIncoming }) => {
          const isActiveDocumentSource = page.sourceDocumentId === document.id;
          const nativeTextRuntimeActive =
            isActiveDocumentSource &&
            activeTool === "edit_text" &&
            viewerMode !== "presentation" &&
            (multipage || page.displayPageNumber === activePageNumber);
          const formRuntimeActive =
            viewerMode !== "presentation" && isActiveDocumentSource && (multipage || page.displayPageNumber === activePageNumber);
          return (
            <PdfPageCanvas
              key={page.id}
              backendUrl={backendUrl}
              sourceFile={page.sourceDocument.file}
              sourceImageName={page.sourceDocument.media?.kind === "image" ? page.sourceDocument.fileName : undefined}
              pdfDocument={page.sourceDocument.pdfDocument}
              sourcePageNumber={page.sourcePageIndex + 1}
              displayPageNumber={page.displayPageNumber}
              rotation={page.rotation}
              zoom={document.zoom}
              edits={
                isActiveDocumentSource
                  ? edits.filter(
                      (edit) => edit.page === page.sourcePageIndex + 1,
                    )
                  : getDocumentEditingState(editsByDocument, page.sourceDocumentId).edits.filter(
                      (edit) => edit.type === "link" && edit.page === page.sourcePageIndex + 1,
                    )
              }
              signatureImages={signatureImages}
              selectedEditId={viewerMode === "presentation" ? null : selectedEditId}
              activeTool={viewerMode === "presentation" ? "select" : isActiveDocumentSource ? activeTool : "select"}
              nativeTextRuntimeActive={nativeTextRuntimeActive}
              formRuntimeActive={formRuntimeActive}
              formOrganizationUnsupported={isPlanModified(pagePlan, document.pageCount)}
              formUiLocked={formUiLocked}
              pdfFormLocked={pdfFormLocked}
              freehandStyle={freehandStyle}
              pendingSignatureImage={
                viewerMode !== "presentation" && isActiveDocumentSource ? pendingSignatureImage : null
              }
              eyedropperTarget={isActiveDocumentSource ? eyedropperTarget : null}
              registerPageRef={registerPageRef}
              allowTextMarkup={isActiveDocumentSource}
              onFollowLink={(destination) => onFollowLink(page.sourceDocumentId, destination, page.displayPageNumber)}
              onEditLink={isActiveDocumentSource && viewerMode !== "presentation" ? onEditLink : undefined}
              onAddText={onAddText}
              onAddNativeText={onAddNativeText}
                onAddStamp={onAddStamp}
                onAddRedaction={onAddRedaction}
                onAddShape={onAddShape}
                onAddFreehand={onAddFreehand}
                onStartComment={onStartComment}
              onPlaceSignature={onPlaceSignature}
              onSelectEdit={onSelectEdit}
              onDeselectEdit={onDeselectEdit}
              onUpdateEdit={onUpdateEdit}
              onFinishEditCoalescing={onFinishEditCoalescing}
              onDeleteEdit={onDeleteEdit}
              onSampleColor={onSampleColor}
              onSetFormUiLock={onSetFormUiLock}
              onRequestPdfFormLock={onRequestPdfFormLock}
              onUnlockPdfForm={onUnlockPdfForm}
              fontLibraryRevision={fontLibraryRevision}
              searchHits={
                isActiveDocumentSource
                  ? searchHits.filter((hit) => hit.pageNumber === page.sourcePageIndex + 1)
                  : []
              }
              activeSearchHitId={activeSearchHitId}
              isIncomingPage={isIncoming}
              presentation={viewerMode === "presentation"}
              renderEnabled={!scrolling || continuousRenderPageNumbers?.has(page.displayPageNumber) === true}
              onRenderReady={scrolling ? undefined : commitVisiblePage}
              onRenderError={scrolling ? undefined : reportRenderError}
            />
          );
        })}
      </div>
      {viewerMode === "single-page" ? (
        <nav className="viewer-page-navigation" aria-label="Navigation des pages">
          <button
            type="button"
            onClick={() => goToPage(activePageNumber - 1)}
            disabled={activePageNumber <= 1}
            aria-label="Page précédente"
            title="Page précédente"
          >
            ←
          </button>
          <output aria-label={`Page ${activePageNumber} sur ${pages.length}`}>{activePageNumber} / {pages.length}</output>
          <button
            type="button"
            onClick={() => goToPage(activePageNumber + 1)}
            disabled={activePageNumber >= pages.length}
            aria-label="Page suivante"
            title="Page suivante"
          >
            →
          </button>
        </nav>
      ) : null}
    </section>
  );
}

type OrganizePageThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  page: OrganizedPage;
};

function OrganizePageThumbnail({ pdfDocument, page }: OrganizePageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    async function renderThumbnail() {
      setRenderState("loading");

      try {
        const pdfPage = await pdfDocument.getPage(page.sourcePageIndex + 1);
        const renderCanvas = canvasRef.current;

        if (isCancelled || !renderCanvas) {
          return;
        }

        const viewport = pdfPage.getViewport({ scale: 0.24, rotation: page.rotation });
        const context = renderCanvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const { canvasWidth, canvasHeight, outputScale } = getCanvasRenderDimensions(
          viewport.width, viewport.height, window.devicePixelRatio,
        );
        renderCanvas.width = canvasWidth;
        renderCanvas.height = canvasHeight;
        renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
        renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = pdfPage.render({ canvas: renderCanvas, canvasContext: context, viewport });
        await renderTask.promise;

        if (!isCancelled) {
          setRenderState("ready");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setRenderState("error");
        }
      }
    }

    void renderThumbnail();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      clearCanvas(canvas);
    };
  }, [page.rotation, page.sourcePageIndex, pdfDocument]);

  return (
    <div className="organize-thumbnail" aria-label={`Miniature de la page source ${page.sourcePageIndex + 1}`}>
      {renderState !== "ready" && renderState !== "error" ? (
        <span className="organize-thumbnail__placeholder" aria-hidden="true">
          {renderState === "loading" ? "Chargement…" : ""}
        </span>
      ) : null}
      {renderState === "error" ? <span className="organize-thumbnail__error">Aperçu indisponible</span> : null}
      <canvas ref={canvasRef} className="organize-thumbnail__canvas" />
    </div>
  );
}

type ExternalPageThumbnailProps = {
  pdfDocument: PDFDocumentProxy;
  pageNumber: number;
};

function ExternalPageThumbnail({ pdfDocument, pageNumber }: ExternalPageThumbnailProps) {
  const thumbnailRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [renderState, setRenderState] = useState<RenderState>("idle");

  useEffect(() => {
    const thumbnail = thumbnailRef.current;

    if (!thumbnail || !("IntersectionObserver" in window)) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px", threshold: 0.01 },
    );
    observer.observe(thumbnail);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: RenderTask | null = null;
    const canvas = canvasRef.current;

    if (!shouldRender || !canvas) {
      return;
    }

    async function renderThumbnail() {
      setRenderState("loading");

      try {
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const renderCanvas = canvasRef.current;

        if (isCancelled || !renderCanvas) {
          return;
        }

        const viewport = pdfPage.getViewport({ scale: 0.12 });
        const context = renderCanvas.getContext("2d");

        if (!context) {
          throw new Error("Le canvas n'est pas disponible.");
        }

        const { canvasWidth, canvasHeight, outputScale } = getCanvasRenderDimensions(
          viewport.width, viewport.height, window.devicePixelRatio,
        );
        renderCanvas.width = canvasWidth;
        renderCanvas.height = canvasHeight;
        renderCanvas.style.width = `${Math.floor(viewport.width)}px`;
        renderCanvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = pdfPage.render({ canvas: renderCanvas, canvasContext: context, viewport });
        await renderTask.promise;

        if (!isCancelled) {
          setRenderState("ready");
        }
      } catch (error) {
        if (!isCancelled && (error as Error).name !== "RenderingCancelledException") {
          setRenderState("error");
        }
      }
    }

    void renderThumbnail();

    return () => {
      isCancelled = true;
      renderTask?.cancel();
      clearCanvas(canvas);
    };
  }, [pageNumber, pdfDocument, shouldRender]);

  return (
    <div ref={thumbnailRef} className="external-page-thumbnail" aria-label={`Miniature externe de la page ${pageNumber}`}>
      {renderState !== "ready" && renderState !== "error" ? (
        <span className="external-page-thumbnail__placeholder" aria-hidden="true">
          {renderState === "loading" ? "Chargement…" : ""}
        </span>
      ) : null}
      {renderState === "error" ? <span className="external-page-thumbnail__fallback">Page {pageNumber}</span> : null}
      <canvas ref={canvasRef} className="external-page-thumbnail__canvas" />
    </div>
  );
}

type OrganizePagesProps = {
  document: OpenPdfDocument;
  documents: OpenPdfDocument[];
  plan: OrganizePagePlan;
  selectedPageId: string | null;
  outputName: string;
  saveToOutputDir: boolean;
  isExporting: boolean;
  exportFeedback: ExportFeedback | null;
  onToggleSelection: (pageId: string) => void;
  onMovePageByIndex: (fromIndex: number, toIndex: number) => void;
  onDeletePage: (pageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onRotatePage: (pageId: string) => void;
  onReset: () => void;
  onOutputNameChange: (outputName: string) => void;
  onSaveToOutputDirChange: (saveToOutputDir: boolean) => void;
  onExport: () => void;
  onAddExternalPages: (sourceDocumentId: string, sourcePageIndexes: number[]) => void;
  onDismissExportFeedback: () => void;
  onRemoveMissingSourcePages: () => void;
};

type OrganizeIconName = "check" | "rotate" | "trash" | "left" | "right" | "duplicate";

function OrganizeIcon({ name }: { name: OrganizeIconName }) {
  const commonProps = {
    "aria-hidden": true,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg className="organize-icon" focusable="false" {...commonProps}>
      {name === "check" ? <path d="m4 10 3.5 3.5L16 5.5" /> : null}
      {name === "rotate" ? (
        <>
          <path d="M15.5 8A6 6 0 1 0 16 12" />
          <path d="M15.5 4.5V8H12" />
        </>
      ) : null}
      {name === "trash" ? (
        <>
          <path d="M4.5 6h11" />
          <path d="M8 3.5h4" />
          <path d="m6.5 6 .7 10h5.6l.7-10" />
          <path d="M9 9v4" />
          <path d="M11 9v4" />
        </>
      ) : null}
      {name === "left" ? <path d="m11.5 4-6 6 6 6" /> : null}
      {name === "right" ? <path d="m8.5 4 6 6-6 6" /> : null}
      {name === "duplicate" ? (
        <>
          <rect x="7" y="7" width="9" height="9" rx="1" />
          <path d="M13 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
        </>
      ) : null}
    </svg>
  );
}

function OrganizePages({
  document,
  documents,
  plan,
  selectedPageId,
  outputName,
  saveToOutputDir,
  isExporting,
  exportFeedback,
  onToggleSelection,
  onMovePageByIndex,
  onDeletePage,
  onDuplicatePage,
  onRotatePage,
  onReset,
  onOutputNameChange,
  onSaveToOutputDirChange,
  onExport,
  onAddExternalPages,
  onDismissExportFeedback,
  onRemoveMissingSourcePages,
}: OrganizePagesProps) {
  const hasPendingChanges = isPlanModified(plan, document.pageCount);
  const canReset = hasPendingChanges || selectedPageId !== null;
  const [draggedPageId, setDraggedPageId] = useState<string | null>(null);
  const [dropPageId, setDropPageId] = useState<string | null>(null);
  const [isAddPagesOpen, setIsAddPagesOpen] = useState(false);
  const [selectedExternalDocumentId, setSelectedExternalDocumentId] = useState("");
  const [selectedExternalPageIndexes, setSelectedExternalPageIndexes] = useState<number[]>([]);
  const additionalDocuments = documents.filter((openDocument) => openDocument.id !== document.id);
  const selectedExternalDocument =
    additionalDocuments.find((openDocument) => openDocument.id === selectedExternalDocumentId) ??
    additionalDocuments[0] ??
    null;
  const missingSourceDocuments = [...new Map(
    plan.pages
      .filter((page) => !documents.some((openDocument) => openDocument.id === page.sourceDocumentId))
      .map((page) => [page.sourceDocumentId, page.sourceDocumentName || "PDF sans nom"]),
  ).values()];
  const hasMissingSources = missingSourceDocuments.length > 0;
  const sourceSummaryByDocument = new Map<string, { fileName: string; pageCount: number }>();

  plan.pages.forEach((page) => {
    const source = sourceSummaryByDocument.get(page.sourceDocumentId);

    sourceSummaryByDocument.set(page.sourceDocumentId, {
      fileName: page.sourceDocumentName,
      pageCount: (source?.pageCount ?? 0) + 1,
    });
  });
  const sourceSummary = [...sourceSummaryByDocument.entries()];

  useEffect(() => {
    setSelectedExternalPageIndexes([]);
  }, [selectedExternalDocument?.id]);

  const handleDragStart = (event: DragEvent<HTMLElement>, pageId: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
    setDraggedPageId(pageId);
  };

  const handleDrop = (event: DragEvent<HTMLElement>, targetPageId: string) => {
    event.preventDefault();
    const sourcePageId = event.dataTransfer.getData("text/plain") || draggedPageId;
    const sourceIndex = plan.pages.findIndex((page) => page.id === sourcePageId);
    const targetIndex = plan.pages.findIndex((page) => page.id === targetPageId);

    if (sourceIndex >= 0 && targetIndex >= 0) {
      onMovePageByIndex(sourceIndex, targetIndex);
    }

    setDraggedPageId(null);
    setDropPageId(null);
  };

  return (
    <section className="organize-workspace" aria-label={`Organiser les pages de ${document.fileName}`}>
      <header className="organize-header">
        <div>
          <h2>Organiser les pages</h2>
          <p>Modifications locales uniquement — les PDF originaux restent inchangés.</p>
        </div>
        <div className="organize-export-bar" aria-label="Plan d'export">
          <label className="organize-export-name">
            <span>Nom final</span>
            <input
              type="text"
              value={outputName}
              onChange={(event) => onOutputNameChange(event.target.value)}
              aria-label="Nom du PDF exporté"
              placeholder="document-modifie.pdf"
            />
          </label>
          <span className="organize-page-count" aria-label={`${plan.pages.length} pages seront exportées`}>
            <strong>{plan.pages.length}</strong> {plan.pages.length > 1 ? "pages" : "page"}
          </span>
          <span className={hasPendingChanges ? "organize-changes is-pending" : "organize-changes"}>
            {hasPendingChanges ? "Modifié" : "Ordre d'origine"}
          </span>
          {!document.sessionOnly ? <label className="organize-export-output-option">
            <input
              type="checkbox"
              checked={saveToOutputDir}
              onChange={(event) => onSaveToOutputDirChange(event.target.checked)}
            />
            Copier dans data/output
          </label> : null}
          <button
            type="button"
            className="organize-reset-button"
            onClick={onReset}
            disabled={!canReset}
            aria-label="Réinitialiser l'organisation"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            className="organize-export-button"
            onClick={onExport}
            disabled={plan.pages.length === 0 || isExporting || hasMissingSources}
          >
            {isExporting ? <span className="organize-spinner" aria-hidden="true" /> : null}
            {isExporting ? "Export en cours…" : "Exporter le PDF"}
          </button>
        </div>
      </header>

      <section className="organize-source-summary" aria-label="Sources du plan d'export">
        <span className="organize-source-summary__label">Sources</span>
        {sourceSummary.map(([sourceDocumentId, source]) => (
          <span key={sourceDocumentId} className="organize-source-summary__item" title={source.fileName}>
            {source.fileName} : {source.pageCount} {source.pageCount > 1 ? "pages" : "page"}
          </span>
        ))}
      </section>

      {hasMissingSources ? (
        <div className="organize-feedback organize-feedback--error" role="alert">
          <div>
            <strong>Des documents sources sont indisponibles.</strong>
            <span title={missingSourceDocuments.join(", ")}>
              Export impossible tant que ces pages sont présentes : {missingSourceDocuments.join(", ")}.
            </span>
          </div>
          <div className="organize-feedback__actions">
            <button type="button" onClick={onRemoveMissingSourcePages}>
              Retirer les pages indisponibles
            </button>
            <button type="button" onClick={onReset}>
              Réinitialiser le plan
            </button>
          </div>
        </div>
      ) : null}

      <section className="organize-add-pages" aria-label="Ajout de pages externes">
        {additionalDocuments.length > 0 ? (
          <>
          <button
            type="button"
            onClick={() => setIsAddPagesOpen((isOpen) => !isOpen)}
            aria-expanded={isAddPagesOpen}
          >
            Ajouter depuis un PDF ouvert
          </button>
          {isAddPagesOpen ? (
            <div className="organize-add-pages__panel">
              <label className="organize-add-pages__source">
                <span>PDF source</span>
                <select
                  value={selectedExternalDocument?.id ?? ""}
                  aria-label="PDF source externe"
                  onChange={(event) => {
                    setSelectedExternalDocumentId(event.target.value);
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  {additionalDocuments.map((sourceDocument) => (
                    <option key={sourceDocument.id} value={sourceDocument.id}>
                      {sourceDocument.fileName}
                    </option>
                  ))}
                </select>
              </label>
              {selectedExternalDocument && selectedExternalDocument.pageCount > 0 ? (
                <div className="external-page-grid" aria-label="Miniatures des pages externes">
                  {Array.from({ length: selectedExternalDocument.pageCount }, (_, sourcePageIndex) => {
                    const isSelected = selectedExternalPageIndexes.includes(sourcePageIndex);

                    return (
                      <button
                        key={sourcePageIndex}
                        type="button"
                        className={isSelected ? "external-page is-selected" : "external-page"}
                        aria-label={`Ajouter ${selectedExternalDocument.fileName}, page ${sourcePageIndex + 1}`}
                        aria-pressed={isSelected}
                        title={`${selectedExternalDocument.fileName} — page ${sourcePageIndex + 1}`}
                        onClick={() => {
                          setSelectedExternalPageIndexes((currentIndexes) =>
                            isSelected
                              ? currentIndexes.filter((index) => index !== sourcePageIndex)
                              : [...currentIndexes, sourcePageIndex],
                          );
                        }}
                      >
                        <ExternalPageThumbnail
                          pdfDocument={selectedExternalDocument.pdfDocument}
                          pageNumber={sourcePageIndex + 1}
                        />
                        <span className="external-page__footer">
                          <span>Page {sourcePageIndex + 1}</span>
                          <span className="external-page__check" aria-hidden="true">✓</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : selectedExternalDocument ? (
                <p className="organize-add-pages__empty">Ce PDF ne contient aucune page disponible.</p>
              ) : null}
              <div className="organize-add-pages__actions">
                <button
                  type="button"
                  disabled={!selectedExternalDocument || selectedExternalPageIndexes.length === 0}
                  onClick={() => {
                    if (!selectedExternalDocument) {
                      return;
                    }

                    onAddExternalPages(selectedExternalDocument.id, selectedExternalPageIndexes);
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  Ajouter les pages sélectionnées
                </button>
                <button
                  type="button"
                  disabled={!selectedExternalDocument}
                  onClick={() => {
                    if (!selectedExternalDocument) {
                      return;
                    }

                    onAddExternalPages(
                      selectedExternalDocument.id,
                      Array.from({ length: selectedExternalDocument.pageCount }, (_, pageIndex) => pageIndex),
                    );
                    setSelectedExternalPageIndexes([]);
                  }}
                >
                  Tout ajouter
                </button>
              </div>
            </div>
          ) : null}
          </>
        ) : (
          <p>Ouvrez un autre PDF pour ajouter ses pages à la fin du plan.</p>
        )}
      </section>

      {isExporting ? (
        <div className="organize-feedback organize-feedback--progress" role="status">
          <span className="organize-spinner" aria-hidden="true" />
          Export en cours…
        </div>
      ) : null}

      {exportFeedback ? (
        <div
          className={`organize-feedback organize-feedback--${exportFeedback.kind}`}
          role={exportFeedback.kind === "error" ? "alert" : "status"}
        >
          <span>{exportFeedback.message}</span>
          <button type="button" onClick={onDismissExportFeedback} aria-label="Fermer le message d'export">
            Fermer
          </button>
        </div>
      ) : null}

      {plan.pages.length > 0 ? (
        <div className="organize-grid" aria-label="Grille des pages organisées">
          {plan.pages.map((page, index) => {
            const selected = page.id === selectedPageId;
            const pageLabel = `Page ${page.displayPageNumber}`;
            const sourceDocument = documents.find((openDocument) => openDocument.id === page.sourceDocumentId);

            return (
              <article
                key={page.id}
                data-testid="organized-page"
                data-source-document-id={page.sourceDocumentId}
                data-source-page-index={page.sourcePageIndex}
                data-rotation={page.rotation}
                draggable
                className={[
                  "organize-page",
                  selected ? "is-selected" : "",
                  draggedPageId === page.id ? "is-dragging" : "",
                  dropPageId === page.id && draggedPageId !== page.id ? "is-drop-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={pageLabel}
                aria-selected={selected}
                onDragStart={(event) => handleDragStart(event, page.id)}
                onDragEnd={() => {
                  setDraggedPageId(null);
                  setDropPageId(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropPageId(page.id);
                }}
                onDragLeave={() => setDropPageId((currentPageId) => (currentPageId === page.id ? null : currentPageId))}
                onDrop={(event) => handleDrop(event, page.id)}
              >
                {sourceDocument ? (
                  <OrganizePageThumbnail pdfDocument={sourceDocument.pdfDocument} page={page} />
                ) : (
                  <div className="organize-thumbnail organize-thumbnail--missing">
                    Source indisponible
                  </div>
                )}
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__select"
                  onClick={() => onToggleSelection(page.id)}
                  aria-label={`Sélectionner la page ${page.displayPageNumber}`}
                  aria-pressed={selected}
                  title={selected ? "Désélectionner la page" : "Sélectionner la page"}
                >
                  <OrganizeIcon name="check" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__rotate"
                  onClick={() => onRotatePage(page.id)}
                  aria-label={`Tourner la page ${page.displayPageNumber} vers la droite`}
                  title="Tourner de 90° vers la droite"
                >
                  <OrganizeIcon name="rotate" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__move organize-page__move--left"
                  onClick={() => onMovePageByIndex(index, index - 1)}
                  disabled={index === 0}
                  aria-label={`Déplacer la page ${page.displayPageNumber} vers la gauche`}
                  title="Déplacer d'un cran vers la gauche"
                >
                  <OrganizeIcon name="left" />
                </button>
                <button
                  type="button"
                  className="organize-page__icon-button organize-page__move organize-page__move--right"
                  onClick={() => onMovePageByIndex(index, index + 1)}
                  disabled={index === plan.pages.length - 1}
                  aria-label={`Déplacer la page ${page.displayPageNumber} vers la droite`}
                  title="Déplacer d'un cran vers la droite"
                >
                  <OrganizeIcon name="right" />
                </button>
                <div className="organize-page__bottom-actions">
                  <button
                    type="button"
                    className="organize-page__icon-button"
                    onClick={() => onDuplicatePage(page.id)}
                    aria-label={`Dupliquer la page ${page.displayPageNumber}`}
                    title="Dupliquer la page"
                  >
                    <OrganizeIcon name="duplicate" />
                  </button>
                  <button
                    type="button"
                    className="organize-page__icon-button organize-page__delete"
                    onClick={() => onDeletePage(page.id)}
                    aria-label={`Supprimer la page ${page.displayPageNumber}`}
                    title="Retirer du plan d'organisation"
                  >
                    <OrganizeIcon name="trash" />
                  </button>
                </div>
                <div className="organize-page__meta">
                  <strong>{pageLabel}</strong>
                  <span className="organize-page__source" title={`${page.sourceDocumentName} — p. ${page.sourcePageIndex + 1}`}>
                    {page.sourceDocumentName} — p. {page.sourcePageIndex + 1}
                  </span>
                  {page.rotation !== 0 ? <span>Rotation : {page.rotation}°</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="organize-empty-state">
          <p>Toutes les pages ont été retirées du plan.</p>
          <button type="button" onClick={onReset}>
            Réinitialiser l'organisation
          </button>
        </div>
      )}
    </section>
  );
}

type SidebarPageListProps = {
  documents: OpenPdfDocument[];
  pagePlan: OrganizePagePlan;
  activePageNumber: number;
  onSelectPage: (pageNumber: number) => void;
  pageView: "list" | "grid";
};

function SidebarPageList({
  documents,
  pagePlan,
  activePageNumber,
  onSelectPage,
  pageView,
}: SidebarPageListProps) {
  return (
    <ol className={`sidebar-page-list sidebar-page-list--${pageView}`} aria-label="Pages du document">
      {pagePlan.pages.map((page) => {
        const sourceDocument = documents.find(
          (document) => document.id === page.sourceDocumentId,
        );
        if (!sourceDocument) {
          return null;
        }
        return (
          <li key={page.id}>
            <button
              type="button"
              className={
                page.displayPageNumber === activePageNumber
                  ? "sidebar-page is-active"
                  : "sidebar-page"
              }
              aria-label={`Aller à la page ${page.displayPageNumber}`}
              aria-current={
                page.displayPageNumber === activePageNumber ? "page" : undefined
              }
              onClick={() => onSelectPage(page.displayPageNumber)}
            >
              <OrganizePageThumbnail
                pdfDocument={sourceDocument.pdfDocument}
                page={page}
              />
              <span>{page.displayPageNumber}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

type DocumentTabsProps = {
  documents: OpenPdfDocument[];
  activeDocumentId: string | null;
  dirtyDocumentIds: ReadonlySet<string>;
  onSelectDocument: (documentId: string) => void;
  onCloseDocument: (documentId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  getDocumentButtonRef: (documentId: string) => (node: HTMLButtonElement | null) => void;
};

function DocumentTabs({
  documents,
  activeDocumentId,
  dirtyDocumentIds,
  onSelectDocument,
  onCloseDocument,
  onKeyDown,
  getDocumentButtonRef,
}: DocumentTabsProps) {
  return (
    <nav className="document-tabs" aria-label="Documents ouverts" onKeyDown={onKeyDown}>
      <div className="document-tabs__scroll" aria-label="Documents ouverts">
        {documents.map((document) => {
          const isActive = document.id === activeDocumentId;
          const isDirty = dirtyDocumentIds.has(document.id);
          return (
            <div key={document.id} className={isActive ? "document-tab is-active" : "document-tab"}>
              <button
                type="button"
                className="document-select"
                data-document-id={document.id}
                ref={getDocumentButtonRef(document.id)}
                onClick={() => onSelectDocument(document.id)}
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                aria-label={`${document.fileName}${isActive ? ", document actif" : ""}`}
                aria-describedby={isDirty ? `document-dirty-${document.id}` : undefined}
                tabIndex={isActive ? 0 : -1}
                title={document.media?.kind === "image" ? `${document.fileName} · Image · ${document.media.mimeType.slice(6).toUpperCase()} · ${document.media.widthPx} × ${document.media.heightPx} px · ratio ${(document.media.widthPx / document.media.heightPx).toFixed(2)}` : document.fileName}
              >
                <span className="document-title">{document.fileName}{document.media?.kind === "image" ? ` · Image · ${document.media.mimeType.slice(6).toUpperCase()}` : ""}</span>
                {isDirty ? <span className="document-tab__dirty" title="Modifications non sauvegardées" aria-hidden="true">●</span> : null}
                {isDirty ? <span id={`document-dirty-${document.id}`} className="visually-hidden">Modifications non sauvegardées.</span> : null}
              </button>
              <button
                type="button"
                className="document-close"
                data-document-id={document.id}
                onClick={() => onCloseDocument(document.id)}
                aria-label={`Fermer ${document.fileName}`}
                title="Fermer"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function DocumentSidebar({
  documents,
  openFileInputRef,
  activePageNumber,
  pagePlan,
  outline,
  onSelectPage,
  onFileChange,
  status,
  storageWarning,
  sidebarId,
  onKeyDown,
  pageView,
  onPageViewChange,
  comments,
  commentsView,
  selectedCommentId,
  onCommentsViewChange,
  onSelectComment,
}: DocumentSidebarProps) {
  return (
    <aside
      id={sidebarId}
      tabIndex={0}
      className="document-sidebar"
      aria-label="Documents ouverts"
      onKeyDown={onKeyDown}
    >
      <div className="sidebar-header">
        <div className="sidebar-section-tabs" role="tablist" aria-label="Navigation latérale">
          <button type="button" role="tab" aria-selected={!commentsView} onClick={() => onCommentsViewChange(false)}>Pages</button>
          <button type="button" role="tab" aria-selected={commentsView} onClick={() => onCommentsViewChange(true)}><span>Commentaires</span>{comments.length > 0 ? <span className="sidebar-tab-badge" aria-label={`${comments.length} commentaires`}>{comments.length}</span> : null}</button>
        </div>
        {!commentsView ? <div className="sidebar-page-view" role="group" aria-label="Affichage des pages">
          <button type="button" aria-label="Vue liste" aria-pressed={pageView === "list"} onClick={() => onPageViewChange("list")}><ToolbarIcon name="list" /></button>
          <button type="button" aria-label="Vue grille" aria-pressed={pageView === "grid"} onClick={() => onPageViewChange("grid")}><ToolbarIcon name="organize" /></button>
          <span className="sidebar-count">{pagePlan?.pages.length ?? 0}</span>
        </div> : null}
      </div>

      <div className="document-sidebar__content">
        <div className="document-sidebar__scroll-area">
          {!commentsView ? outline : null}
          {commentsView ? (
            comments.length ? <ol className="comment-list" aria-label="Commentaires">{[...comments].sort((left, right) => left.page - right.page || left.rect.y0 - right.rect.y0).map((comment) => <li key={comment.id}><button type="button" className={comment.id === selectedCommentId ? "is-selected" : ""} onClick={() => onSelectComment(comment)}><strong>Page {comment.page}</strong><span>{comment.content}</span></button></li>)}</ol> : <p className="sidebar-hint">Aucun commentaire dans ce document.</p>
          ) : pagePlan && pagePlan.pages.length > 0 ? (
            <SidebarPageList
              documents={documents}
              pagePlan={pagePlan}
              activePageNumber={activePageNumber}
              onSelectPage={onSelectPage}
              pageView={pageView}
            />
          ) : (
            <p className="sidebar-hint">{documents.length === 0 ? "Aucun document ouvert." : "Ouvrez un PDF pour afficher ses pages."}</p>
          )}

          {status ? <p className="sidebar-status">{status}</p> : null}
          {storageWarning ? (
            <p className="sidebar-status" role="alert">
              {storageWarning}
            </p>
          ) : null}

        </div>
      </div>
      <input
        ref={openFileInputRef}
        className="visually-hidden"
        data-testid="pdf-file-input"
        type="file"
        accept={DOCUMENT_ACCEPT}
        multiple
        onChange={onFileChange}
        aria-label="Ouvrir un PDF"
      />
    </aside>
  );
}

function ResetIcon() {
  return (
    <svg
      className="danger-button__icon"
      aria-hidden="true"
      viewBox="0 0 20 20"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5.2 8.2A6 6 0 0 1 16 10.4" />
      <path d="M16.4 6.2v4.2h-4.2" />
      <path d="M14.8 11.8A6 6 0 0 1 4 9.6" />
      <path d="M3.6 13.8V9.6h4.2" />
    </svg>
  );
}

type EmptyStateProps = {
  status: string;
  mode: WorkspaceMode;
};

function EmptyState({ status, mode }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-label="Aucun PDF ouvert">
      <p className="status">{status}</p>
      <p>
        {mode === "organize"
          ? "Ouvrez un PDF pour organiser ses pages."
          : "Le panneau de gauche listera vos documents ouverts."}
      </p>
      {mode === "organize" ? (
        <button type="button" disabled>
          Exporter le PDF
        </button>
      ) : null}
    </section>
  );
}

type AppProps = {
  backendUrl?: string;
};

export function App({ backendUrl = getWebBackendBaseUrl() }: AppProps = {}) {
  const storedPreferences = useMemo(() => loadViewerPreferences(), []);
  const nextDocumentId = useRef(1);
  const [passwordPrompt, setPasswordPrompt] = useState<{ error: string; answer: (password: string | null) => void } | null>(null);
  const passwordAnswer = useRef<((password: string | null) => void) | null>(null);
  const protectedOpeningRef = useRef(false);
  useEffect(() => () => { passwordAnswer.current?.(null); }, []);
  const promptPassword = useCallback((error: string) => new Promise<string | null>((resolve) => {
    const answer = (password: string | null) => {
      passwordAnswer.current = null;
      setPasswordPrompt(null);
      resolve(password);
    };
    passwordAnswer.current = answer;
    setPasswordPrompt({ error, answer });
  }), []);
  const documentsRef = useRef<OpenPdfDocument[]>([]);
  const [isImageDocumentOpen, setIsImageDocumentOpen] = useState(false);
  const [imageBackgroundError, setImageBackgroundError] = useState<string | null>(null);
  const [isImagesPdfOpen, setIsImagesPdfOpen] = useState(false);
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const presentationContainerRef = useRef<HTMLElement | null>(null);
  const documentButtonRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocusTargetRef = useRef<FocusTarget>(null);
  const sidebarId = "documents-sidebar";
  const [theme, setTheme] = useState<ThemeId>(() => storedPreferences?.theme ?? systemTheme());
  const [isSidebarVisible, setIsSidebarVisible] = useState(() => storedPreferences?.sidebarVisible ?? true);
  const [pageView, setPageView] = useState<"list" | "grid">("list");
  const [isPropertiesPanelVisible, setIsPropertiesPanelVisible] = useState(true);
  const [propertiesPanelWidth, setPropertiesPanelWidth] = useState(272);
  const [textMarkupSelection, setTextMarkupSelection] = useState<TextMarkupSelection | null>(null);
  const [textMarkupColor, setTextMarkupColor] = useState("#eab308");
  const [pendingComment, setPendingComment] = useState<{ page: number; point: import("./editing/types").PdfPoint } | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentAuthorDraft, setCommentAuthorDraft] = useState(() => storedPreferences?.commentAuthor ?? "");
  const [lastCommentAuthor, setLastCommentAuthor] = useState(() => storedPreferences?.commentAuthor ?? "");
  const [isCommentsView, setIsCommentsView] = useState(false);
  const [documents, setDocuments] = useState<OpenPdfDocument[]>([]);
  const desktopStartupLoadedRef = useRef(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("read");
  const [viewerMode, setViewerMode] = useState<ViewerMode>(
    () => storedPreferences?.viewerMode ?? "continuous",
  );
  const [fitToPageByDocument, setFitToPageByDocument] = useState<Record<string, boolean>>({});
  const presentationReturn = useRef<{ mode: PersistedViewerMode; documentId?: string; zoom?: number; fit?: boolean }>({ mode: "single-page" });
  const [presentationFitRefreshToken, setPresentationFitRefreshToken] = useState(0);
  const [activeEditingTool, setActiveEditingTool] =
    useState<EditingTool>("select");
  const [freehandToolStyle, setFreehandToolStyle] = useState<FreehandStyle>(
    DEFAULT_FREEHAND_STYLE,
  );
  const [pdfEditsByDocument, dispatchPdfEdits] = useReducer(
    pdfEditsReducer,
    {},
  );
  // This is deliberately runtime-only: it prevents accidental edits in this
  // application without changing the PDF or its undo/dirty state.
  const [formUiLockedByDocument, setFormUiLockedByDocument] = useState<Record<string, boolean>>({});
  const [isFormLockConfirmOpen, setIsFormLockConfirmOpen] = useState(false);
  const [redactionSearchDocumentId, setRedactionSearchDocumentId] = useState<string | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<{ documentId: string; edits: StampEdit[] } | null>(null);
  const watermarkGeneration = useRef(0);
  useEffect(() => { watermarkGeneration.current++; setWatermarkPreview(null); }, [activeDocumentId, activeEditingTool]);
  const [stampLabel, setStampLabel] = useState("APPROUVÉ");
  const [stampWithDate, setStampWithDate] = useState(false);
  const [linkDraft, setLinkDraft] = useState<PdfLinkEdit | null>(null);
  useEffect(() => { setLinkDraft(null); }, [activeDocumentId, workspaceMode, viewerMode]);
  useEffect(() => { if (activeEditingTool !== "link") setLinkDraft(null); }, [activeEditingTool]);
  const [selectedEditId, setSelectedEditId] = useState<string | null>(null);
  const [fontLibraryRevision, setFontLibraryRevision] = useState(0);
  const [eyedropperTarget, setEyedropperTarget] = useState<
    "stroke" | "fill" | null
  >(null);
  const clipboardEditRef = useRef<PdfEdit | null>(null);
  const protectedClipboardOrigin = useRef<string | null>(null);
  const pasteSequenceRef = useRef(0);
  const activePageByDocumentRef = useRef<Record<string, number>>({});
  const pageNavigationRequestId = useRef(0);
  const [activePageByDocument, setActivePageByDocument] = useState<
    Record<string, number>
  >({});
  const [pageNavigationRequest, setPageNavigationRequest] = useState<PageNavigationRequest | null>(null);
  const [signatureImages, setSignatureImages] = useState<
    Record<string, SignatureImage>
  >({});
  const [pendingSignatureImageId, setPendingSignatureImageId] = useState<
    string | null
  >(null);
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const fileMenuId = useId();
  useFloatingPosition(isFileMenuOpen, fileMenuTriggerRef, fileMenuRef, "bottom-end", setIsFileMenuOpen);
  usePopoverDismiss(isFileMenuOpen, fileMenuTriggerRef, fileMenuRef, setIsFileMenuOpen);
  useLayoutEffect(() => {
    if (isFileMenuOpen) fileMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [isFileMenuOpen]);
  const [isAdvancedExportOpen, setIsAdvancedExportOpen] = useState(false);
  const [saveAsDocumentId, setSaveAsDocumentId] = useState<string | null>(null);
  const [pendingCloseDocumentId, setPendingCloseDocumentId] = useState<
    string | null
  >(null);
  const [closeAfterSaveDocumentId, setCloseAfterSaveDocumentId] = useState<
    string | null
  >(null);
  const [organizationPlans, setOrganizationPlans] = useState<Record<string, OrganizePagePlan>>({});
  const [selectedPageIdsByDocument, setSelectedPageIdsByDocument] = useState<Record<string, string | null>>({});
  const [outputName, setOutputName] = useState("");
  const [saveToOutputDir, setSaveToOutputDir] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<ExportFeedback | null>(null);
  const [printPreview, setPrintPreview] = useState<{
    documentName: string;
    pdfBlob: Blob | null;
    stage: PrintPreviewStage;
  } | null>(null);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState("Sélectionnez un PDF local.");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [localPersistenceState, setLocalPersistenceState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const persistenceGeneration = useRef(0);
  const [viewerFocusRequest, setViewerFocusRequest] = useState(0);
  const nextOrganizedPageId = useRef(1);
  const nextTextEditId = useRef(1);
  const nextNativeTextEditId = useRef(1);
  const nextShapeEditId = useRef(1);
  const nextFreehandEditId = useRef(1);
  const nextTextMarkupEditId = useRef(1);
  const nextCommentEditId = useRef(1);
  const textMarkupToolbarRef = useRef<HTMLDivElement | null>(null);
  const nextSignatureImageId = useRef(1);
  const nextSignatureEditId = useRef(1);
  const [isRestoringDocuments, setIsRestoringDocuments] = useState(
    () => (storedPreferences?.documentOrder.length ?? 0) > 0,
  );
  const [restorationError, setRestorationError] = useState<string | null>(null);
  const [restorationAttempt, setRestorationAttempt] = useState(0);
  // Keep failed records addressable across reloads; only explicit close/reset deletes data.
  const unrestoredDocumentIds = useRef<string[]>([]);
  const activeDocument = useMemo(
    () => documents.find((document) => document.id === activeDocumentId) ?? null,
    [activeDocumentId, documents],
  );
  const activeDocumentIndex = useMemo(
    () => documents.findIndex((document) => document.id === activeDocumentId),
    [activeDocumentId, documents],
  );
  const activeOrganizationPlan = useMemo(() => {
    if (!activeDocument) {
      return null;
    }

    return (
      organizationPlans[activeDocument.id] ??
      createInitialPagePlan(activeDocument.id, activeDocument.fileName, activeDocument.pageCount)
    );
  }, [activeDocument, organizationPlans]);
  const activePageNumber = activeDocument
    ? Math.min(
        Math.max(1, activePageByDocument[activeDocument.id] ?? 1),
        Math.max(1, activeOrganizationPlan?.pages.length ?? activeDocument.pageCount),
      )
    : 0;
  const selectedOrganizedPageId = activeDocument
    ? (selectedPageIdsByDocument[activeDocument.id] ?? null)
    : null;
  const activeDocumentEditingState = activeDocument
    ? getDocumentEditingState(pdfEditsByDocument, activeDocument.id)
    : null;
  const activePdfEdits = activeDocumentEditingState?.edits ?? [];
  const activePdfFormLock = activePdfEdits.find(
    (edit): edit is PdfFormLockEdit => edit.type === "form_lock",
  ) ?? null;
  const isActivePdfFormLocked = Boolean(activePdfFormLock);
  const isActiveFormUiLocked = activeDocument
    ? Boolean(formUiLockedByDocument[activeDocument.id])
    : false;
  const isActiveDocumentDirty = activeDocumentEditingState?.isDirty ?? false;
  const dirtyDocumentIds = useMemo(
    () =>
      new Set(
        Object.entries(pdfEditsByDocument).flatMap(
          ([documentId, editingState]) =>
            editingState.isDirty ? [documentId] : [],
        ),
      ),
    [pdfEditsByDocument],
  );

  useEffect(() => {
    const referencedFonts = Object.values(pdfEditsByDocument).flatMap((state) =>
      state.edits.flatMap((edit) =>
        (edit.type === "add_text" || edit.type === "native_text") && edit.style.fontRef
          ? [edit.style.fontRef]
          : [],
      ),
    );
    fontRegistry.setProtectedFontRefs(referencedFonts);
    [...new Set(referencedFonts)]
      .filter((fontRef) => !fontRef.startsWith("pdf-standard:") && !fontRef.startsWith("document:"))
      .forEach((fontRef) => {
        void fontRegistry.ensureLoaded(fontRef).catch(() => {
          setStorageWarning(
            `La police ${fontRef} référencée par un document est indisponible. Choisissez une police de remplacement.`,
          );
        });
      });
  }, [pdfEditsByDocument]);
  const pendingCloseDocument = pendingCloseDocumentId
    ? documents.find((document) => document.id === pendingCloseDocumentId) ?? null
    : null;
  const saveAsDocument = saveAsDocumentId
    ? documents.find((document) => document.id === saveAsDocumentId) ?? null
    : null;
  const selectedTextEdit =
    activePdfEdits.find(
      (edit): edit is AddTextEdit =>
        edit.id === selectedEditId && edit.type === "add_text",
    ) ?? null;
  const selectedNativeTextEdit =
    activePdfEdits.find(
      (edit): edit is NativeTextEdit =>
        edit.id === selectedEditId && edit.type === "native_text",
    ) ?? null;
  const selectedShapeEdit =
    activePdfEdits.find(
      (edit): edit is ShapeEdit =>
        edit.id === selectedEditId && edit.type === "shape",
    ) ?? null;
  const selectedFreehandEdit = activePdfEdits.find((edit): edit is FreehandEdit => edit.id === selectedEditId && edit.type === "freehand") ?? null;
  const freehandInspectorEdit = selectedFreehandEdit ?? (
    activeEditingTool === "freehand"
      ? {
          id: "freehand-tool-style",
          type: "freehand" as const,
          page: activePageNumber || 1,
          rect: { x0: 0, y0: 0, x1: 0, y1: 0 },
          points: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          style: freehandToolStyle,
        }
      : null
  );
  const selectedTextMarkupEdit = activePdfEdits.find((edit): edit is TextMarkupEdit => edit.id === selectedEditId && edit.type === "text_markup") ?? null;
  const selectedCommentEdit = activePdfEdits.find((edit): edit is PdfCommentEdit => edit.id === selectedEditId && edit.type === "comment") ?? null;
  const selectedPdfEdit =
    activePdfEdits.find((edit) => edit.id === selectedEditId) ?? null;
  useEffect(() => {
    const used = new Set<string>(pendingSignatureImageId ? [pendingSignatureImageId] : []);
    const copied = clipboardEditRef.current;
    if (copied?.type === "image" || copied?.type === "signature" || (copied?.type === "stamp" && Boolean(copied.imageId))) used.add(copied.imageId!);
    for (const state of Object.values(pdfEditsByDocument)) {
      for (const snapshot of [{ edits: state.edits }, ...state.past, ...state.future]) {
        for (const edit of snapshot.edits) if (edit.type === "image" || edit.type === "signature" || (edit.type === "stamp" && Boolean(edit.imageId))) used.add(edit.imageId!);
      }
    }
    setSignatureImages((images) => Object.keys(images).some((id) => !used.has(id))
      ? Object.fromEntries(Object.entries(images).filter(([id]) => used.has(id))) : images);
  }, [pdfEditsByDocument, pendingSignatureImageId]);

  const pendingSignatureImage = pendingSignatureImageId
    ? (signatureImages[pendingSignatureImageId] ?? null)
    : null;
  const activeComments = activePdfEdits.filter((edit): edit is PdfCommentEdit => edit.type === "comment");
  const hasPendingOrganizationChanges =
    activeDocument !== null &&
    activeOrganizationPlan !== null &&
    (isPlanModified(activeOrganizationPlan, activeDocument.pageCount) ||
      activePdfEdits.length > 0);

  useEffect(() => {
    setOutputName(
      activeDocument
        ? getSuggestedPdfSaveName(
            activeDocument.fileName,
            activeDocument.workingSaveName,
          )
        : "",
    );
    setSaveToOutputDir(false);
  }, [activeDocumentId, activeDocument]);

  useEffect(() => {
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("select");
    setPendingSignatureImageId(null);
    setIsFileMenuOpen(false);
  }, [activeDocumentId]);

  useEffect(() => {
    if (
      selectedEditId &&
      !activePdfEdits.some((edit) => edit.id === selectedEditId)
    ) {
      setSelectedEditId(null);
      setEyedropperTarget(null);
    }
  }, [activePdfEdits, selectedEditId]);

  useEffect(() => {
    if (documents.length === 0) {
      setWorkspaceMode("read");
      setViewerMode((currentMode) => currentMode === "presentation" ? "continuous" : currentMode);
    }
  }, [documents.length]);

  useEffect(() => {
    if (workspaceMode !== "read") {
      setActiveEditingTool("select");
      setSelectedEditId(null);
      setPendingSignatureImageId(null);
    }
  }, [workspaceMode]);

  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    const { mode, documentId, zoom, fit } = presentationReturn.current;
    if (documentId && zoom !== undefined) {
      setDocuments((current) => current.map((item) => item.id === documentId ? { ...item, zoom } : item));
      setFitToPageByDocument((current) => ({ ...current, [documentId]: fit ?? false }));
    }
    setViewerMode(mode);
  }, []);

  useEffect(() => {
    if (viewerMode !== "presentation") {
      return;
    }

    setWorkspaceMode("read");
    setActiveEditingTool("select");
    setSelectedEditId(null);
    setPendingSignatureImageId(null);
    setEyedropperTarget(null);
  }, [viewerMode]);

  useEffect(() => {
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;

    const requestPresentationFitRefresh = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setPresentationFitRefreshToken((currentToken) => currentToken + 1);
        });
      });
    };

    function handleFullscreenChange() {
      if (viewerMode !== "presentation") {
        return;
      }

      if (document.fullscreenElement === presentationContainerRef.current) {
        // Firefox can dispatch fullscreenchange before the fullscreen layout has
        // settled. Two frames ensure the measured viewer bounds are final.
        requestPresentationFitRefresh();
        return;
      }

      if (!document.fullscreenElement) exitPresentation();
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      if (firstFrame !== null) window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [exitPresentation, viewerMode]);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (pendingFocusTargetRef.current === null) {
      return;
    }

    const pendingFocusTarget = pendingFocusTargetRef.current;

    if (pendingFocusTarget === "viewer") {
      setViewerFocusRequest((currentRequest) => currentRequest + 1);
    } else if (pendingFocusTarget === "file-input") {
      openFileInputRef.current?.focus();
    } else {
      documentButtonRefs.current.get(pendingFocusTarget)?.focus();
    }

    pendingFocusTargetRef.current = null;
  }, [activeDocumentId, documents, isSidebarVisible]);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    if (dirtyDocumentIds.size === 0) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyDocumentIds]);

  useEffect(() => {
    return () => {
      documentsRef.current.forEach(releasePdfDocument);
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function restoreDocuments() {
      try {
        const storedIds = storedPreferences?.documentOrder ?? [];

        if (storedIds.length === 0) {
          if (!isCancelled) {
            setIsRestoringDocuments(false);
          }

          return;
        }

        setStatus("Restauration des documents enregistrés...");

        const restoredDocuments: OpenPdfDocument[] = [];
        let failedCount = 0;
        const storedDocuments = await loadStoredDocuments(storedIds);
        const diagnostics: string[] = [];
        const failedIds = storedIds.filter((id) => !storedDocuments.some((document) => document.id === id));
        if (failedIds.length) diagnostics.push("RESTORE_DOCUMENT_ABSENT");
        failedCount += Math.max(0, storedIds.length - storedDocuments.length);

        for (const storedDocument of storedDocuments) {
          try {
            restoredDocuments.push(await restoreOpenDocument(storedDocument, backendUrl));
          } catch (error) {
            failedCount += 1;
            failedIds.push(storedDocument.id);
            const code = error instanceof Error && error.message.startsWith("RESTORE_") ? error.message : "RESTORE_PDFJS_FAILED";
            diagnostics.push(code);
            console.warn("PDF_RESTORE", { code });
          }
        }

        if (isCancelled) {
          restoredDocuments.forEach(releasePdfDocument);
          return;
        }

        const restoredPlans: Record<string, OrganizePagePlan> = {};
        const restoredSelectedPageIds: Record<string, string | null> = {};
        let invalidPlanCount = 0;
        const restoredSourceDocuments = Object.fromEntries(
          restoredDocuments.map((document) => [
            document.id,
            { fileName: document.fileName, pageCount: document.pageCount },
          ]),
        );

        restoredDocuments.forEach((restoredDocument) => {
          const storedPlan = loadOrganizationPlan(restoredDocument.id);

          if (!storedPlan) {
            return;
          }

          const hydratedPlan = hydratePlanSourceNames(storedPlan.plan, restoredSourceDocuments);

          if (!isValidPagePlanForDocument(hydratedPlan, restoredDocument.id, restoredSourceDocuments)) {
            // Preserve the original plan for recovery; use the source plan in this session.
            diagnostics.push("RESTORE_PAGE_PLAN_INVALID");
            invalidPlanCount += 1;
            return;
          }

          restoredPlans[restoredDocument.id] = hydratedPlan;
          restoredSelectedPageIds[restoredDocument.id] = hydratedPlan.pages.some(
            (page) => page.id === storedPlan.selectedPageId,
          )
            ? storedPlan.selectedPageId
            : null;
        });

        const restoredImages = await loadImageAssets([...new Set(storedDocuments.flatMap((doc) => (doc.edits ?? []).flatMap((edit) => edit.type === "image" || edit.type === "signature" || (edit.type === "stamp" && Boolean(edit.imageId)) ? [edit.imageId!] : [])))]);
        if (isCancelled) { restoredDocuments.forEach(releasePdfDocument); return; }
        setSignatureImages(restoredImages);
        unrestoredDocumentIds.current = failedIds;
        setDocuments(restoredDocuments);
        storedDocuments.filter((stored) => restoredDocuments.some((document) => document.id === stored.id)).forEach((storedDocument) => {
          if (storedDocument.edits) {
            dispatchPdfEdits({ type: "hydrate", documentId: storedDocument.id, edits: storedDocument.edits });
            if (storedDocument.editsDirty) dispatchPdfEdits({ type: "mark_dirty", documentId: storedDocument.id });
            return;
          }
          if (storedDocument.nativeTextEdits?.length) {
            dispatchPdfEdits({ type: "hydrate", documentId: storedDocument.id, edits: storedDocument.nativeTextEdits });
          }
          if (storedDocument.formEdits?.length) {
            dispatchPdfEdits({ type: "hydrate", documentId: storedDocument.id, edits: storedDocument.formEdits });
          }
        });
        setOrganizationPlans(restoredPlans);
        setSelectedPageIdsByDocument(restoredSelectedPageIds);
        setActiveDocumentId(
          storedPreferences?.activeDocumentId &&
            restoredDocuments.some((document) => document.id === storedPreferences.activeDocumentId)
            ? storedPreferences.activeDocumentId
            : restoredDocuments[restoredDocuments.length - 1]?.id ?? null,
        );
        if (restoredDocuments.length > 0) {
          pendingFocusTargetRef.current = "viewer";
        }
        const restorationMessages: string[] = [];
        if (failedCount > 0) {
          restorationMessages.push(
            failedCount === 1
              ? "1 document n'a pas pu être restauré."
              : `${failedCount} documents n'ont pas pu être restaurés.`,
          );
        }
        if (invalidPlanCount > 0) {
          restorationMessages.push(
            invalidPlanCount === 1
              ? "1 plan d'organisation a été réinitialisé car une source est indisponible ou invalide."
              : `${invalidPlanCount} plans d'organisation ont été réinitialisés car une source est indisponible ou invalide.`,
          );
        }
        setStatus(restorationMessages.join(" "));
        if (diagnostics.length) setStorageWarning(`Restauration partielle : ${[...new Set(diagnostics)].join(", ")}. Les données locales ont été conservées.`);
        setRestorationError(null);
        setIsRestoringDocuments(false);
      } catch (error) {
        if (!isCancelled) {
          setRestorationError(
            error instanceof Error
              ? error.message
              : "La restauration des documents a échoué.",
          );
          setIsRestoringDocuments(false);
        }
      }
    }

    void restoreDocuments();

    return () => {
      isCancelled = true;
    };
  }, [restorationAttempt, storedPreferences]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const preferencesSaved = saveViewerPreferences({
      theme,
      sidebarVisible: isSidebarVisible,
      activeDocumentId: documents.some((document) => document.id === activeDocumentId && !document.sessionOnly) ? activeDocumentId : null,
      documentOrder: [...new Set([...documents
        .filter((document) => document.source.type === "web" && !document.sessionOnly)
        .map((document) => document.id), ...unrestoredDocumentIds.current])],
      ...(lastCommentAuthor ? { commentAuthor: lastCommentAuthor } : {}),
      viewerMode: viewerMode === "presentation" ? "single-page" : viewerMode,
    });

    if (!preferencesSaved) {
      setStorageWarning("Les préférences locales n'ont pas pu être enregistrées. Vérifiez l'espace de stockage du navigateur.");
    }
  }, [activeDocumentId, documents, isRestoringDocuments, isSidebarVisible, lastCommentAuthor, theme, viewerMode]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const generation = ++persistenceGeneration.current;
    if (documents.some((document) => document.source.type === "web" && !document.sessionOnly)) setLocalPersistenceState("saving");
    const saveTimeout = window.setTimeout(() => {
      const restorableDocuments = documents.filter((document) => document.source.type === "web" && !document.sessionOnly);
      if (restorableDocuments.length === 0) {
        return;
      }

      void Promise.all(restorableDocuments.map((document) => saveStoredDocument({ ...buildViewerSnapshot(
        document,
        getDocumentEditingState(pdfEditsByDocument, document.id).edits.filter((edit): edit is NativeTextEdit => edit.type === "native_text"),
        getDocumentEditingState(pdfEditsByDocument, document.id).edits.filter((edit): edit is PdfFormStateEdit => edit.type === "form_field" || edit.type === "form_lock"),
      ), edits: getDocumentEditingState(pdfEditsByDocument, document.id).edits,
        editsDirty: getDocumentEditingState(pdfEditsByDocument, document.id).isDirty,
        imageAssets: [...new Set(getDocumentEditingState(pdfEditsByDocument, document.id).edits.flatMap((edit) => edit.type === "image" || edit.type === "signature" || (edit.type === "stamp" && Boolean(edit.imageId)) ? [edit.imageId!] : []))].flatMap((id) => signatureImages[id] ? [signatureImages[id]] : []),
      }))).then((results) => {
        if (generation !== persistenceGeneration.current) return;
        setLocalPersistenceState(results.every(Boolean) ? "saved" : "failed");
        if (results.some((saved) => !saved)) {
          setStorageWarning(DOCUMENT_STORAGE_WARNING);
        } else {
          setStorageWarning((current) => current === DOCUMENT_STORAGE_WARNING ? null : current);
        }
      });
    }, 250);

    return () => {
      window.clearTimeout(saveTimeout);
    };
  }, [documents, isRestoringDocuments, pdfEditsByDocument, signatureImages]);

  useEffect(() => {
    if (isRestoringDocuments) {
      return;
    }

    const plansSaved = Object.entries(organizationPlans).flatMap(([documentId, plan]) => {
      if (!documents.some((document) => document.id === documentId && !document.sessionOnly) ||
          plan.pages.some((page) => documents.some((doc) => doc.id === page.sourceDocumentId && doc.sessionOnly))) {
        return [];
      }

      return [
        saveOrganizationPlan(documentId, {
          plan,
          selectedPageId: selectedPageIdsByDocument[documentId] ?? null,
        }),
      ];
    });

    if (plansSaved.some((saved) => !saved)) {
      setStorageWarning("Le plan d'organisation n'a pas pu être enregistré localement. Vérifiez l'espace de stockage du navigateur.");
    }
  }, [documents, isRestoringDocuments, organizationPlans, selectedPageIdsByDocument]);

  const updateDocumentZoom = useCallback((documentId: string, delta: number) => {
    setFitToPageByDocument((currentModes) => ({ ...currentModes, [documentId]: false }));
    setDocuments((currentDocuments) =>
      currentDocuments.map((document) => {
        if (document.id !== documentId) {
          return document;
        }

        const nextZoom = clampZoom(document.zoom + delta);
        return nextZoom === document.zoom ? document : { ...document, zoom: nextZoom };
      }),
    );
  }, []);

  const setDocumentZoom = useCallback((documentId: string, zoom: number) => {
    const nextZoom = clampZoom(zoom);
    setDocuments((currentDocuments) => {
      let changed = false;
      const nextDocuments = currentDocuments.map((document) => {
        if (document.id !== documentId || Math.abs(document.zoom - nextZoom) <= 0.001) {
          return document;
        }
        changed = true;
        return { ...document, zoom: nextZoom };
      });
      return changed ? nextDocuments : currentDocuments;
    });
  }, []);

  const recordActivePage = useCallback(
    (documentId: string, pageNumber: number) => {
      activePageByDocumentRef.current[documentId] = pageNumber;
      setActivePageByDocument((currentPages) =>
        currentPages[documentId] === pageNumber
          ? currentPages
          : { ...currentPages, [documentId]: pageNumber },
      );
    },
    [],
  );

  const goToActivePage = useCallback((pageNumber: number) => {
    if (!activeDocument) return;
    const pageCount = activeOrganizationPlan?.pages.length ?? activeDocument.pageCount;
    recordActivePage(activeDocument.id, Math.min(pageCount, Math.max(1, pageNumber)));
  }, [activeDocument, activeOrganizationPlan, recordActivePage]);

  const followPdfLink = useCallback((sourceDocumentId: string, destination: LinkDestination, fromPage?: number) => {
    if (destination.kind === "uri") {
      followWebLink(destination.url, () => setStatus("Impossible d’ouvrir le lien dans le navigateur."));
      return;
    }
    if (!activeDocument || !activeOrganizationPlan) return;
    const matches = activeOrganizationPlan.pages.filter((page) =>
      page.sourceDocumentId === sourceDocumentId && page.sourcePageIndex === destination.pageIndex);
    const target = matches.find((page) => page.displayPageNumber === fromPage) ?? matches[0];
    if (!target) {
      setStatus("La page cible du lien est absente de la disposition actuelle.");
      return;
    }
    recordActivePage(activeDocument.id, target.displayPageNumber);
    setPageNavigationRequest({ documentId: activeDocument.id, pageNumber: target.displayPageNumber, requestId: ++pageNavigationRequestId.current, position: destination });
  }, [activeDocument, activeOrganizationPlan, recordActivePage]);

  const navigateToSearchResult = useCallback((pageNumber: number) => {
    if (!activeDocument) return;
    recordActivePage(activeDocument.id, pageNumber);
    setPageNavigationRequest({ documentId: activeDocument.id, pageNumber, requestId: ++pageNavigationRequestId.current });
  }, [activeDocument, recordActivePage]);

  const {
    activeSearch,
    openPdfSearch,
    closePdfSearch,
    updatePdfSearchQuery,
    updatePdfSearchOptions,
    selectPdfSearchHit,
    navigatePdfSearch,
    forgetPdfSearchDocument,
  } = usePdfSearch({
    activeDocument,
    activeOrganizationPlan,
    workspaceMode,
    onNavigateToPage: navigateToSearchResult,
  });

  const changeViewerMode = useCallback((nextMode: ViewerMode) => {
    if (!activeDocument || nextMode === viewerMode) return;

    if (nextMode === "single-page" || nextMode === "presentation" || nextMode === "facing") {
      setFitToPageByDocument((currentModes) => ({ ...currentModes, [activeDocument.id]: true }));
    }

    if (nextMode === "presentation") {
      presentationReturn.current = viewerMode === "facing" || viewerMode === "adaptive"
        ? { mode: viewerMode, documentId: activeDocument.id, zoom: activeDocument.zoom, fit: fitToPageByDocument[activeDocument.id] ?? true }
        : { mode: "single-page" };
      const container = presentationContainerRef.current;
      if (container && document.fullscreenEnabled && container.requestFullscreen) {
        void container.requestFullscreen().catch((error: unknown) => {
          console.info("Le plein écran natif est indisponible ; présentation applicative conservée.", error);
        });
      }
    }

    setViewerMode(nextMode);
    if (nextMode === "presentation") setViewerFocusRequest((request) => request + 1);
  }, [activeDocument, fitToPageByDocument, viewerMode]);



  useEffect(() => {
    function handleViewerNavigation(event: globalThis.KeyboardEvent) {
      // The now-hidden mode selector can keep focus when presentation starts.
      if (event.key === "Escape" && viewerMode === "presentation") {
        event.preventDefault();
        exitPresentation();
        return;
      }
      if (
        isScrollingMode(viewerMode) ||
        (event.key === " " && event.target instanceof Element && event.target.closest(".pdf-link")) ||
        !activeDocument ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          goToActivePage(activePageNumber + 1);
          break;
        case " ":
          if (viewerMode === "presentation") {
            event.preventDefault();
            goToActivePage(activePageNumber + 1);
          }
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          goToActivePage(activePageNumber - 1);
          break;
        case "Home":
          event.preventDefault();
          goToActivePage(1);
          break;
        case "End":
          event.preventDefault();
          goToActivePage(activeOrganizationPlan?.pages.length ?? activeDocument.pageCount);
          break;
      }
    }

    window.addEventListener("keydown", handleViewerNavigation);
    return () => window.removeEventListener("keydown", handleViewerNavigation);
  }, [activeDocument, activeOrganizationPlan, activePageNumber, exitPresentation, goToActivePage, viewerMode]);

  const updateDocumentScrollPosition = useCallback(
    (documentId: string, scrollLeft: number, scrollTop: number) => {
      setDocuments((currentDocuments) =>
        currentDocuments.map((document) => {
          if (
            document.id !== documentId ||
            (document.scrollLeft === scrollLeft && document.scrollTop === scrollTop)
          ) {
            return document;
          }

          return { ...document, scrollLeft, scrollTop };
        }),
      );
    },
    [],
  );

  const addTextEdit = useCallback(
    (pageNumber: number, rect: PdfRect) => {
      if (!activeDocument) {
        return;
      }

      const edit: AddTextEdit = {
        id: `text-${Date.now()}-${nextTextEditId.current++}`,
        type: "add_text",
        page: pageNumber,
        rect,
        text: "",
        style: {
          ...DEFAULT_TEXT_STYLE,
          fontSize: Math.min(144, Math.max(6, Math.round((rect.y1 - rect.y0) * 0.48))),
        },
        autoSize: true,
      };

      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const addNativeTextEdit = useCallback(
    (span: NativeTextSpan, text: string) => {
      if (!activeDocument || text === span.sourceText) return;
      const sourceFontName = normalizeSubsetFontName(span.sourceFontName ?? "Police du document");
      const standardFamily = /^(Helvetica|Arial)/i.test(sourceFontName)
        ? "Helvetica"
        : /^Times/i.test(sourceFontName)
          ? "Times"
          : /^Courier/i.test(sourceFontName)
            ? "Courier"
            : null;
      const fontRef = standardFamily
        ? `pdf-standard:${standardFamily.toLowerCase()}:400:normal`
        : span.sourceFontResourceId
          ? `document:${span.sourceFontResourceId}`
          : "bundled:noto-sans:400:normal";
      const edit: NativeTextEdit = {
        id: `native-text-${Date.now()}-${nextNativeTextEditId.current++}`,
        type: "native_text",
        page: span.page,
        rect: span.rect,
        source: {
          sourceId: span.sourceId,
          sourceText: span.sourceText,
          sourceBBox: span.sourceBBox,
          sourceOrigin: span.sourceOrigin,
          sourceFontName: span.sourceFontName,
          sourceFontResourceId: span.sourceFontResourceId,
          sourceFontSize: span.sourceFontSize,
          sourceColor: span.sourceColor,
          sourceRotation: span.sourceRotation,
          sourceFingerprint: span.sourceFingerprint,
          editable: span.editable,
          limitation: span.limitation,
          limitationMessage: span.limitationMessage,
        },
        text,
        style: {
          fontFamily: standardFamily ?? (span.sourceFontResourceId ? sourceFontName : "Noto Sans"),
          fontRef,
          fontSize: span.sourceFontSize,
          color: span.sourceColor,
          bold: span.fontWeight >= 700,
          fontStyle: span.fontStyle,
        },
        ...(!standardFamily && !span.sourceFontResourceId
          ? { fontFallbackReason: "La police source ne peut pas être réutilisée. Noto Sans est proposée explicitement comme fallback exportable." }
          : {}),
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setExportFeedback(null);
    },
    [activeDocument],
  );

  const clearWatermarkPreview = useCallback(() => { watermarkGeneration.current++; setWatermarkPreview(null); }, []);
  const previewWatermark = useCallback(async (draft: WatermarkDraft) => {
    if (!activeDocument || !activeOrganizationPlan) return;
    const generation = ++watermarkGeneration.current;
    const pages = watermarkPages(draft.scope, draft.range, activePageNumber, activeOrganizationPlan.pages.length);
    if (activeOrganizationPlan.pages.some((page) => page.sourceDocumentId !== activeDocument.id) || new Set(activeOrganizationPlan.pages.map((page) => page.sourcePageIndex)).size !== activeOrganizationPlan.pages.length) throw new Error("Filigrane : appliquez-le dans chaque document source avant la composition ou la duplication des pages.");
    const groupId = `watermarks-${crypto.randomUUID()}`;
    const edits: StampEdit[] = [];
    for (const displayPage of pages) {
      const sourceIndex = activeOrganizationPlan.pages[displayPage - 1].sourcePageIndex;
      const page = await activeDocument.pdfDocument.getPage(sourceIndex + 1);
      const [x0, y0, x1, y1] = page.view;
      edits.push(createWatermark(sourceIndex + 1, { x0, y0, x1, y1 }, draft, groupId));
    }
    if (generation === watermarkGeneration.current) setWatermarkPreview({ documentId: activeDocument.id, edits });
  }, [activeDocument, activeOrganizationPlan, activePageNumber]);

  const addStampEdit = useCallback((page: number, rect: PdfRect) => {
    if (!activeDocument) return;
    const edit = createTextStamp(page, rect, stampLabel, stampWithDate);
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument, stampLabel, stampWithDate]);

  const addRedactionEdit = useCallback((page: number, rect: PdfRect) => {
    if (!activeDocument || activeDocument.media?.kind === "image" || !Object.values(rect).every(Number.isFinite) || rect.x1 <= rect.x0 || rect.y1 <= rect.y0) return;
    const edit: PdfEdit = { id: `redaction-${crypto.randomUUID()}`, type: "redaction", page, rect };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setExportFeedback(null);
  }, [activeDocument]);

  const addShapeEdit = useCallback(
    (pageNumber: number, shapeType: ShapeType, rect: PdfRect, line?: LineGeometry) => {
      if (!activeDocument) {
        return;
      }
      const edit: ShapeEdit = {
        id: `shape-${Date.now()}-${nextShapeEditId.current++}`,
        type: "shape",
        visualMask: activeEditingTool === "visual_mask",
        shapeType,
        ...line,
        page: pageNumber,
        rect,
        style: activeEditingTool === "visual_mask" ? { strokeColor: "#000000", strokeWidth: 1, fillColor: "#000000", opacity: 1 } : { ...DEFAULT_SHAPE_STYLE },
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setEyedropperTarget(null);
      setExportFeedback(null);
    },
    [activeDocument, activeEditingTool],
  );

  const addFreehandEdit = useCallback((pageNumber: number, points: import("./editing/types").PdfPoint[]) => {
    if (!activeDocument || points.length < 2) return;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const edit: FreehandEdit = { id: `freehand-${Date.now()}-${nextFreehandEditId.current++}`, type: "freehand", page: pageNumber, points, rect: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs) + 0.1, y1: Math.max(...ys) + 0.1 }, style: { ...freehandToolStyle } };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument, freehandToolStyle]);

  const addTextMarkupEdit = useCallback((kind: TextMarkupKind, color: string) => {
    if (!activeDocument || !textMarkupSelection) return;
    const { page, rects } = textMarkupSelection;
    const edit: TextMarkupEdit = { id: `markup-${Date.now()}-${nextTextMarkupEditId.current++}`, type: "text_markup", kind, page, rects, color, rect: { x0: Math.min(...rects.map((rect) => rect.x0)), y0: Math.min(...rects.map((rect) => rect.y0)), x1: Math.max(...rects.map((rect) => rect.x1)), y1: Math.max(...rects.map((rect) => rect.y1)) } };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setTextMarkupSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [activeDocument, textMarkupSelection]);

  const startComment = useCallback((page: number, point: import("./editing/types").PdfPoint) => {
    if (!activeDocument) return;
    setPendingComment({ page, point });
    setCommentDraft("");
    setCommentAuthorDraft(lastCommentAuthor);
  }, [activeDocument, lastCommentAuthor]);

  const addComment = useCallback(() => {
    if (!activeDocument || !pendingComment || !commentDraft.trim()) return;
    const now = new Date().toISOString();
    const edit: PdfCommentEdit = {
      id: `comment-${Date.now()}-${nextCommentEditId.current++}`,
      type: "comment",
      commentType: "text",
      page: pendingComment.page,
      rect: { x0: pendingComment.point.x, y0: pendingComment.point.y, x1: pendingComment.point.x + 18, y1: pendingComment.point.y + 18 },
      content: commentDraft.trim(), author: commentAuthorDraft.trim() || undefined, createdAt: now, modifiedAt: now, source: "local",
    };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
    setSelectedEditId(edit.id);
    setPendingComment(null);
    setCommentDraft("");
    if (!activeDocument.sessionOnly && commentAuthorDraft.trim()) setLastCommentAuthor(commentAuthorDraft.trim());
    setActiveEditingTool("select");
  }, [activeDocument, commentAuthorDraft, commentDraft, pendingComment]);

  useEffect(() => {
    const handleSelection = (event: Event) => setTextMarkupSelection((event as CustomEvent<TextMarkupSelection>).detail);
    window.addEventListener("pdf-text-markup-selection", handleSelection);
    return () => window.removeEventListener("pdf-text-markup-selection", handleSelection);
  }, []);

  useEffect(() => {
    setTextMarkupSelection(null);
  }, [activeDocumentId, activeEditingTool, viewerMode]);

  const closeMarkupToolbar = useCallback(() => setTextMarkupSelection(null), []);
  useFloatingPosition(Boolean(textMarkupSelection), textMarkupSelection?.anchor ?? null, textMarkupToolbarRef, "top-center", closeMarkupToolbar);
  useEffect(() => {
    if (!textMarkupSelection) return;
    const palette = () => {
      const id = textMarkupToolbarRef.current?.querySelector('[aria-expanded="true"]')?.getAttribute("aria-controls");
      return id ? document.getElementById(id) : null;
    };
    const outside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node &&
          !textMarkupToolbarRef.current?.contains(event.target) && !palette()?.contains(event.target)) closeMarkupToolbar();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || palette()) return;
      event.preventDefault();
      event.stopPropagation();
      closeMarkupToolbar();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [closeMarkupToolbar, textMarkupSelection]);


  const updatePdfEdit = useCallback(
    (edit: PdfEdit, coalesceKey?: string) => {
      if (!activeDocument) {
        return;
      }
      const current = getDocumentEditingState(pdfEditsByDocument, activeDocument.id);
      if (edit.type === "form_field" && !current.edits.some((candidate) => candidate.id === edit.id)) {
        dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
        setExportFeedback(null);
        return;
      }
      if (edit.type === "stamp" && edit.purpose === "watermark" && edit.groupId) {
        const replace = current.edits.filter((item): item is StampEdit => item.type === "stamp" && item.purpose === "watermark" && item.groupId === edit.groupId)
          .map((item) => ({ ...edit, id: item.id, page: item.page, rect: item.rect }));
        dispatchPdfEdits({ type: "batch", documentId: activeDocument.id, replace, coalesceKey });
      } else dispatchPdfEdits({ type: "replace", documentId: activeDocument.id, edit, coalesceKey });
      setExportFeedback(null);
    },
    [activeDocument, pdfEditsByDocument],
  );

  const finishPdfEditCoalescing = useCallback(
    (editId: string, property: string) => {
      if (!activeDocument) {
        return;
      }
      dispatchPdfEdits({
        type: "finish_coalescing",
        documentId: activeDocument.id,
        coalesceKey: `${editId}:${property}`,
      });
    },
    [activeDocument],
  );

  const deletePdfEdit = useCallback(
    (editId: string) => {
      if (!activeDocument) {
        return;
      }
      const edit = getDocumentEditingState(pdfEditsByDocument, activeDocument.id).edits.find((candidate) => candidate.id === editId);
      if (edit?.type === "comment" && edit.source === "pdf") {
        return;
      }
      dispatchPdfEdits({
        type: "delete",
        documentId: activeDocument.id,
        editId,
      });
      setSelectedEditId((currentId) => (currentId === editId ? null : currentId));
      setExportFeedback(null);
    },
    [activeDocument, pdfEditsByDocument],
  );

  const setActiveFormUiLock = useCallback((locked: boolean) => {
    if (!activeDocument) return;
    setFormUiLockedByDocument((current) => ({
      ...current,
      [activeDocument.id]: locked,
    }));
  }, [activeDocument]);

  const lockActivePdfForm = useCallback(() => {
    if (!activeDocument || isActivePdfFormLocked) return;
    const lock: PdfFormLockEdit = {
      id: "form-lock",
      type: "form_lock",
      // The operation is document-scoped. These harmless coordinates allow it
      // to travel through the existing lightweight edit/history pipeline.
      page: 1,
      rect: { x0: 0, y0: 0, x1: 1, y1: 1 },
      locked: true,
    };
    dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit: lock });
    setIsFormLockConfirmOpen(false);
    setExportFeedback(null);
  }, [activeDocument, isActivePdfFormLocked]);

  const unlockActivePdfForm = useCallback(() => {
    if (!activeDocument || !activePdfFormLock) return;
    dispatchPdfEdits({ type: "delete", documentId: activeDocument.id, editId: activePdfFormLock.id });
    setExportFeedback(null);
  }, [activeDocument, activePdfFormLock]);

  const imageJobs = documents.filter((document) => document.media?.kind === "image" && (document.imageBackgroundKey ?? "[]") !== JSON.stringify(getDocumentEditingState(pdfEditsByDocument, document.id).edits.find((edit) => edit.type === "image_background")?.transforms ?? []));
  const imageJobsKey = JSON.stringify(imageJobs.map((document) => [document.id, getDocumentEditingState(pdfEditsByDocument, document.id).edits.find((edit) => edit.type === "image_background")]));
  const activeImagePending = imageJobs.some((document) => document.id === activeDocumentId);
  useEffect(() => {
    setImageBackgroundError(null);
    if (!imageJobs.length) return;
    const controller = new AbortController();
    void (async () => {
      for (const document of imageJobs) {
        if (document.media?.kind !== "image") continue;
        const transforms = getDocumentEditingState(pdfEditsByDocument, document.id).edits.find((edit) => edit.type === "image_background")?.transforms ?? [];
        const blob = await createImagePdf(backendUrl, [document.media], { ...DEFAULT_IMAGE_LAYOUT, transforms }, controller.signal);
        if (controller.signal.aborted) return;
        const file = new File([blob], document.file.name, { type: "application/pdf" });
        const task = pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        try {
          const pdfDocument = await task.promise;
          if (controller.signal.aborted) { void task.destroy(); return; }
          const next = { ...document, file, pdfDocument, loadingTask: task, imageBackgroundKey: JSON.stringify(transforms) };
          setDocuments((current) => current.map((candidate) => candidate.id === document.id ? { ...candidate, file: next.file, pdfDocument: next.pdfDocument, loadingTask: next.loadingTask, imageBackgroundKey: next.imageBackgroundKey } : candidate));
          releasePdfDocument(document);
        } catch (error) { void task.destroy(); throw error; }
      }
    })().catch((error: unknown) => { if (!controller.signal.aborted) setImageBackgroundError(error instanceof Error ? error.message : "Transformation impossible."); });
    return () => controller.abort();
    // Only background history changes trigger regeneration; annotations reuse the same PDF.
  }, [backendUrl, imageJobsKey]);

  function updateImageBackground(transform?: ImageTransform) {
    if (!activeDocument || activeDocument.media?.kind !== "image") return;
    const current = activeDocumentEditingState?.edits.find((edit) => edit.type === "image_background");
    if (!transform) {
      if (current) dispatchPdfEdits({ type: "delete", documentId: activeDocument.id, editId: current.id });
    } else {
      const transforms = [...(current?.transforms ?? []), transform];
      if (transforms.length > 64) { setExportFeedback({ kind: "error", message: "64 transformations maximum. Réinitialisez le fond avant de poursuivre." }); return; }
      const edit = { id: "image-background", type: "image_background" as const, page: 1, rect: { x0: 0, y0: 0, x1: 1, y1: 1 }, transforms };
      dispatchPdfEdits(current ? { type: "replace", documentId: activeDocument.id, edit } : { type: "add", documentId: activeDocument.id, edit });
    }
    setIsImageDocumentOpen(false);
  }

  const undoPdfEdit = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    dispatchPdfEdits({ type: "undo", documentId: activeDocument.id });
    setExportFeedback(null);
  }, [activeDocument]);

  const redoPdfEdit = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    dispatchPdfEdits({ type: "redo", documentId: activeDocument.id });
    setExportFeedback(null);
  }, [activeDocument]);

  const copySelectedPdfEdit = useCallback(() => {
    if (!selectedPdfEdit) {
      return;
    }
    clipboardEditRef.current = clonePdfEdit(selectedPdfEdit);
    protectedClipboardOrigin.current = activeDocument?.sessionOnly ? activeDocument.id : null;
    pasteSequenceRef.current = 0;
  }, [activeDocument, selectedPdfEdit]);

  const pastePdfEdit = useCallback(async () => {
    const sourceEdit = clipboardEditRef.current;
    const targetDocument = activeDocument;
    if (!sourceEdit || !targetDocument || sourceEdit.type === "image_background" || (targetDocument.media?.kind === "image" && sourceEdit.type === "redaction")) {
      return;
    }

    if (protectedClipboardOrigin.current && !targetDocument.sessionOnly) {
      setExportFeedback({ kind: "warning", message: "Collez cet objet dans un autre document en session temporaire." });
      return;
    }
    const pageNumber = Math.min(
      targetDocument.pageCount,
      Math.max(1, activePageByDocumentRef.current[targetDocument.id] ?? 1),
    );
    const page = await targetDocument.pdfDocument.getPage(pageNumber);
    if (clipboardEditRef.current !== sourceEdit ||
        documentsRef.current.every((document) => document.id !== targetDocument.id)) {
      return;
    }

    pasteSequenceRef.current += 1;
    const offset = pasteSequenceRef.current * 12;
    const rect = offsetPdfRectWithinPage(sourceEdit.rect, page.view, {
      x: offset,
      y: offset,
    });
    let edit: PdfEdit;
    if (sourceEdit.type === "stamp" && sourceEdit.purpose === "watermark") {
      const [x0, y0, x1, y1] = page.view;
      edit = { ...sourceEdit, id: `watermark-${crypto.randomUUID()}`, groupId: `watermarks-${crypto.randomUUID()}`, page: pageNumber, rect: { x0, y0, x1, y1 } };
    } else if (sourceEdit.type === "add_text") {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `text-${Date.now()}-${nextTextEditId.current++}`,
        page: pageNumber,
        rect,
      } as AddTextEdit;
    } else if (sourceEdit.type === "shape") {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `shape-${Date.now()}-${nextShapeEditId.current++}`,
        page: pageNumber,
        rect,
      } as ShapeEdit;
      if (sourceEdit.start && sourceEdit.end && edit.type === "shape") {
        const dx = rect.x0 - sourceEdit.rect.x0, dy = rect.y0 - sourceEdit.rect.y0;
        edit.start = { x: sourceEdit.start.x + dx, y: sourceEdit.start.y + dy };
        edit.end = { x: sourceEdit.end.x + dx, y: sourceEdit.end.y + dy };
      }
    } else {
      edit = {
        ...clonePdfEdit(sourceEdit),
        id: `signature-${Date.now()}-${nextSignatureEditId.current++}`,
        page: pageNumber,
        rect,
      } as SignatureEdit;
    }

    dispatchPdfEdits({ type: "add", documentId: targetDocument.id, edit });
    setSelectedEditId(edit.id);
    setActiveEditingTool("select");
    setExportFeedback(null);
  }, [activeDocument]);

  const applySampledShapeColor = useCallback(
    (color: string) => {
      if (!selectedShapeEdit || !eyedropperTarget) {
        return;
      }
      updatePdfEdit({
        ...selectedShapeEdit,
        style: {
          ...selectedShapeEdit.style,
          ...(eyedropperTarget === "stroke"
            ? { strokeColor: color }
            : { fillColor: color }),
        },
      });
      setEyedropperTarget(null);
    },
    [eyedropperTarget, selectedShapeEdit, updatePdfEdit],
  );

  useEffect(() => {
    function handleSelectedEditDeletion(event: globalThis.KeyboardEvent) {
      if (
        !selectedEditId ||
        (event.key !== "Delete" && event.key !== "Backspace") ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target?.closest(".viewer")) {
        return;
      }
      event.preventDefault();
      deletePdfEdit(selectedEditId);
    }

    window.addEventListener("keydown", handleSelectedEditDeletion);
    return () => window.removeEventListener("keydown", handleSelectedEditDeletion);
  }, [deletePdfEdit, selectedEditId]);

  const stampImageInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const insertImage = async (event: ChangeEvent<HTMLInputElement>, asStamp = false) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const document = activeDocument;
    const page = activeOrganizationPlan?.pages.find((page) => page.displayPageNumber === activePageNumber);
    if (!file || !document || !page || page.sourceDocumentId !== document.id) return;
    try {
      const [draft, digest] = await Promise.all([importLocalImage(file), file.arrayBuffer().then((bytes) => crypto.subtle.digest("SHA-256", bytes))]);
      if (documentsRef.current.every((candidate) => candidate.id !== document.id)) return;
      const pdfPage = await document.pdfDocument.getPage(page.sourcePageIndex + 1);
      const image: SignatureImage = { ...draft, id: `image-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}` };
      validateImageSession(Object.values(signatureImages), image);
      const imageEdit: ImageEdit = { id: `image-edit-${crypto.randomUUID()}`, type: "image", page: page.sourcePageIndex + 1, imageId: image.id, aspectLocked: false, rect: initialImageRect(pdfPage.view, image.width, image.height) };
      const edit: PdfEdit = asStamp ? { ...createTextStamp(page.sourcePageIndex + 1, imageEdit.rect, "", false), text: "", imageId: image.id, border: false } : imageEdit;
      setSignatureImages((images) => images[image.id] ? images : { ...images, [image.id]: image });
      dispatchPdfEdits({ type: "add", documentId: document.id, edit });
      setSelectedEditId(edit.id);
      setActiveEditingTool("select");
      setExportFeedback(null);
    } catch (error) {
      setExportFeedback({ kind: "error", message: error instanceof Error ? error.message : "Image invalide." });
    }
  };

  const prepareSignatureImage = useCallback((draft: SignatureImageDraft) => {
    const image: SignatureImage = {
      ...draft,
      id: `signature-image-${Date.now()}-${nextSignatureImageId.current++}`,
    };
    setSignatureImages((currentImages) => ({
      ...currentImages,
      [image.id]: image,
    }));
    setPendingSignatureImageId(image.id);
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("signature");
    setIsSignatureDialogOpen(false);
    setExportFeedback(null);
  }, []);

  const placeSignature = useCallback(
    (pageNumber: number, rect: PdfRect) => {
      if (!activeDocument || !pendingSignatureImageId) {
        return;
      }
      const edit: SignatureEdit = {
        id: `signature-${Date.now()}-${nextSignatureEditId.current++}`,
        type: "signature",
        page: pageNumber,
        rect,
        imageId: pendingSignatureImageId,
      };
      dispatchPdfEdits({ type: "add", documentId: activeDocument.id, edit });
      setSelectedEditId(edit.id);
      setPendingSignatureImageId(null);
      setActiveEditingTool("select");
      setExportFeedback(null);
    },
    [activeDocument, pendingSignatureImageId],
  );

  const performCloseDocument = useCallback(
    (documentId: string) => {
      const closingIndex = documents.findIndex((document) => document.id === documentId);

      if (closingIndex < 0) {
        return;
      }

      const plansUsingDocument = Object.entries(organizationPlans).filter(
        ([planDocumentId, plan]) =>
          planDocumentId !== documentId &&
          plan.pages.some((page) => page.sourceDocumentId === documentId),
      );

      if (
        plansUsingDocument.length > 0 &&
        !window.confirm(
          "Ce document est utilisé dans le plan d'organisation. Le fermer retirera ses pages du document final.",
        )
      ) {
        return;
      }

      plansUsingDocument.forEach(([planDocumentId]) => {
        dispatchPdfEdits({ type: "mark_dirty", documentId: planDocumentId });
      });

      const closingDocument = documents[closingIndex];
      if (protectedClipboardOrigin.current === documentId) {
        clipboardEditRef.current = null;
        protectedClipboardOrigin.current = null;
      }
      const nextDocuments = documents.filter((document) => document.id !== documentId);
      const fallbackIndex = Math.min(closingIndex, nextDocuments.length - 1);
      const fallbackDocument = fallbackIndex >= 0 ? nextDocuments[fallbackIndex] : null;
      pendingFocusTargetRef.current = fallbackDocument?.id ?? "file-input";

      setExportFeedback(null);
      setDocuments(nextDocuments);
      forgetPdfSearchDocument(documentId);
      dispatchPdfEdits({ type: "remove_document", documentId });
      setSelectedEditId(null);
      setActiveEditingTool("select");
      setPendingSignatureImageId(null);
      setOrganizationPlans((currentPlans) => {
        return Object.fromEntries(
          Object.entries(currentPlans).flatMap(([planDocumentId, plan]) => {
            if (planDocumentId === documentId) {
              return [];
            }

            return [[
              planDocumentId,
              {
                ...plan,
                pages: renumberOrganizedPages(
                  plan.pages.filter((page) => page.sourceDocumentId !== documentId),
                ),
              },
            ]];
          }),
        );
      });
      setSelectedPageIdsByDocument((currentSelection) => {
        return Object.fromEntries(
          Object.entries(currentSelection).flatMap(([planDocumentId, selectedPageId]) => {
            if (planDocumentId === documentId) {
              return [];
            }

            const plan = organizationPlans[planDocumentId];
            const selectedPage = plan?.pages.find((page) => page.id === selectedPageId);
            return [[
              planDocumentId,
              selectedPage?.sourceDocumentId === documentId ? null : selectedPageId,
            ]];
          }),
        );
      });
      removeOrganizationPlan(documentId);
      setActiveDocumentId((currentActiveId) => {
        if (currentActiveId !== documentId) {
          return nextDocuments.some((document) => document.id === currentActiveId)
            ? currentActiveId
            : (fallbackDocument?.id ?? null);
        }

        return fallbackDocument?.id ?? null;
      });
      setStatus(nextDocuments.length > 0 ? "" : "Sélectionnez un PDF local.");
      releasePdfDocument(closingDocument);
      if (closingDocument.source.type === "web" && !closingDocument.sessionOnly) {
        void removeStoredDocument(documentId).then((removed) => {
          if (!removed) setStorageWarning("Le retrait de la copie locale n’a pas pu être confirmé. Vérifiez le stockage de ce profil.");
        });
      }
    },
    [documents, organizationPlans],
  );

  const closeDocument = useCallback(
    (documentId: string) => {
      if (getDocumentEditingState(pdfEditsByDocument, documentId).isDirty) {
        setPendingCloseDocumentId(documentId);
        setCloseAfterSaveDocumentId(null);
        return;
      }

      performCloseDocument(documentId);
    },
    [pdfEditsByDocument, performCloseDocument],
  );

  const selectDocumentByKeyboard = useCallback(
    (nextIndex: number) => {
      const nextDocument = documents[nextIndex];

      if (!nextDocument) {
        return;
      }

      pendingFocusTargetRef.current = nextDocument.id;
      setActiveDocumentId(nextDocument.id);
    },
    [documents],
  );

  const activateFocusedDocument = useCallback(
    (documentId: string | null) => {
      if (!documentId) {
        return;
      }

      if (documents.some((document) => document.id === documentId)) {
        pendingFocusTargetRef.current = documentId;
        setActiveDocumentId(documentId);
      }
    },
    [documents],
  );

  const closeActiveDocumentByKeyboard = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    closeDocument(activeDocument.id);
  }, [activeDocument, closeDocument]);

  const selectDocumentFromSidebar = useCallback((documentId: string) => {
    pendingFocusTargetRef.current = "viewer";
    setActiveDocumentId(documentId);
  }, []);

  const handleSidebarKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const targetElement = event.target instanceof HTMLElement ? event.target : null;

      if (targetElement !== event.currentTarget && targetElement?.closest(".document-list") === null) {
        return;
      }

      if (documents.length === 0) {
        return;
      }

      const targetDocumentId = getSidebarDocumentId(event.target);
      const focusedDocumentIndex =
        targetDocumentId === null ? -1 : documents.findIndex((document) => document.id === targetDocumentId);

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (targetDocumentId !== null) {
          closeDocument(targetDocumentId);
        } else {
          closeActiveDocumentByKeyboard();
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        if (targetDocumentId !== null && targetElement?.classList.contains("document-select")) {
          event.preventDefault();
          activateFocusedDocument(targetDocumentId);
        }

        return;
      }

      if (event.key === "PageUp" || event.key === "PageDown") {
        event.preventDefault();
        return;
      }

      let nextIndex = -1;

      switch (event.key) {
        case "ArrowUp":
          nextIndex = Math.max((focusedDocumentIndex >= 0 ? focusedDocumentIndex : activeDocumentIndex) - 1, 0);
          break;
        case "ArrowDown":
          nextIndex = Math.min(
            (focusedDocumentIndex >= 0 ? focusedDocumentIndex : activeDocumentIndex) + 1,
            documents.length - 1,
          );
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = documents.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      selectDocumentByKeyboard(nextIndex);
    },
    [
      activeDocumentIndex,
      activateFocusedDocument,
      closeActiveDocumentByKeyboard,
      closeDocument,
      documents,
      selectDocumentByKeyboard,
    ],
  );

  const updateActiveOrganizationPlan = useCallback(
    (
      updatePlan: (plan: OrganizePagePlan) => OrganizePagePlan,
      marksDocumentDirty = true,
    ) => {
      if (!activeDocument) {
        return;
      }

      const currentPlan = organizationPlans[activeDocument.id] ?? createInitialPagePlan(activeDocument.id, activeDocument.fileName, activeDocument.pageCount);
      const nextPlan = updatePlan(currentPlan);
      const sourceIds = new Set([activeDocument.id, ...nextPlan.pages.map((page) => page.sourceDocumentId)]);
      if (!activeDocument.sessionOnly && documentsRef.current.some((doc) => doc.sessionOnly && sourceIds.has(doc.id))) {
        setExportFeedback({ kind: "warning", message: "Les pages protégées peuvent être ajoutées à un plan ouvert en session temporaire." });
        return;
      }
      if (isPlanModified(nextPlan, activeDocument.pageCount) && [...sourceIds].some((id) =>
        getDocumentEditingState(pdfEditsByDocument, id).edits.some((edit) => edit.type === "form_field" || edit.type === "form_lock"))) {
        setExportFeedback({ kind: "warning", message: "Formulaires après organisation — WIP. Organisation annulée : annulez d’abord les modifications de formulaire, ou enregistrez puis rouvrez le PDF avant de réorganiser ses pages." });
        return;
      }
      setExportFeedback(null);
      if (marksDocumentDirty) {
        dispatchPdfEdits({
          type: "mark_dirty",
          documentId: activeDocument.id,
        });
      }
      setOrganizationPlans((currentPlans) => {
        return {
          ...currentPlans,
          [activeDocument.id]: nextPlan,
        };
      });
    },
    [activeDocument, organizationPlans, pdfEditsByDocument],
  );

  const moveOrganizedPage = useCallback(
    (fromIndex: number, toIndex: number) => {
      updateActiveOrganizationPlan((plan) => {
        return { ...plan, pages: moveOrganizedPageByIndex(plan.pages, fromIndex, toIndex) };
      });
    },
    [updateActiveOrganizationPlan],
  );

  const toggleOrganizedPageSelection = useCallback(
    (pageId: string) => {
      if (!activeDocument) {
        return;
      }

      updateActiveOrganizationPlan((plan) => plan, false);
      setSelectedPageIdsByDocument((currentSelection) => ({
        ...currentSelection,
        [activeDocument.id]: currentSelection[activeDocument.id] === pageId ? null : pageId,
      }));
    },
    [activeDocument, updateActiveOrganizationPlan],
  );

  const deleteOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => ({
        ...plan,
        pages: renumberOrganizedPages(plan.pages.filter((page) => page.id !== pageId)),
      }));
      if (activeDocument) {
        setSelectedPageIdsByDocument((currentSelection) => ({
          ...currentSelection,
          [activeDocument.id]: currentSelection[activeDocument.id] === pageId ? null : currentSelection[activeDocument.id],
        }));
      }
    },
    [activeDocument, updateActiveOrganizationPlan],
  );

  const duplicateOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => {
        const currentIndex = plan.pages.findIndex((page) => page.id === pageId);

        if (currentIndex < 0) {
          return plan;
        }

        const pages = [...plan.pages];
        const pageToDuplicate = pages[currentIndex];
        pages.splice(currentIndex + 1, 0, {
          ...pageToDuplicate,
          id: `${pageToDuplicate.id}:copy:${Date.now()}-${nextOrganizedPageId.current}`,
        });
        nextOrganizedPageId.current += 1;
        return { ...plan, pages: renumberOrganizedPages(pages) };
      });
    },
    [updateActiveOrganizationPlan],
  );

  const rotateOrganizedPage = useCallback(
    (pageId: string) => {
      updateActiveOrganizationPlan((plan) => ({
        ...plan,
        pages: plan.pages.map((page) =>
          page.id === pageId ? { ...page, rotation: rotatePage(page.rotation, 90) } : page,
        ),
      }));
    },
    [updateActiveOrganizationPlan],
  );

  const resetActiveOrganizationPlan = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    setExportFeedback(null);
    const currentPlan = organizationPlans[activeDocument.id];
    if (
      currentPlan &&
      isPlanModified(currentPlan, activeDocument.pageCount)
    ) {
      dispatchPdfEdits({
        type: "mark_dirty",
        documentId: activeDocument.id,
      });
    }
    setOrganizationPlans((currentPlans) => {
      const { [activeDocument.id]: _resetPlan, ...remainingPlans } = currentPlans;
      return remainingPlans;
    });
    setSelectedPageIdsByDocument((currentSelection) => {
      const { [activeDocument.id]: _resetSelection, ...remainingSelection } = currentSelection;
      return remainingSelection;
    });
    removeOrganizationPlan(activeDocument.id);
  }, [activeDocument, organizationPlans]);

  const authenticateWorkingFile = useCallback(async (file: File) => {
    if (protectedOpeningRef.current) throw new PdfUnlockError("Une ouverture protégée est déjà en cours.");
    protectedOpeningRef.current = true;
    try { return await unlockWorkingPdf(file, backendUrl, promptPassword); }
    finally { protectedOpeningRef.current = false; }
  }, [backendUrl, promptPassword]);

  const loadOpenPdfDocument = useCallback(async (
    file: File,
    workingSaveName: string | null = null,
    source: DocumentSource = { type: "web" },
    sessionOnly?: true,
  ): Promise<OpenPdfDocument> => {
    if (protectedOpeningRef.current) throw new PdfUnlockError("Une ouverture protégée est déjà en cours.");
    let media: OpenPdfDocument["media"] = { kind: "pdf" };
    const originalName = file.name;
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...header) !== "%PDF-" && (!/\.pdf$/i.test(file.name) || header[0] === 137 || header[0] === 255 || String.fromCharCode(...header.slice(0, 4)) === "RIFF")) {
      try {
        media = await readImageSource(file);
        validateImageDocumentSession([...documentsRef.current.flatMap((document) => document.media?.kind === "image" ? [document.media] : []), media]);
        const pdf = await createImagePdf(backendUrl, [media]);
        file = new File([pdf], `${originalName}.pdf`, { type: "application/pdf" });
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Conversion impossible.";
        throw new Error(`Impossible de charger l’image « ${originalName} ». ${reason}`);
      }
      source = { type: "web" }; // An image original is never a PDF save destination.
    }
    let data = new Uint8Array(await file.arrayBuffer());
    let loadingTask = pdfjsLib.getDocument({ data });
    try {
      const initialDocument = await loadingTask.promise;
      if (typeof initialDocument.getPermissions === "function" && await initialDocument.getPermissions() !== null) {
        await loadingTask.destroy().catch(() => undefined);
        file = await authenticateWorkingFile(file);
        sessionOnly = true;
        data = new Uint8Array(await file.arrayBuffer());
        loadingTask = pdfjsLib.getDocument({ data });
      }
    } catch (error) {
      await loadingTask.destroy().catch(() => undefined);
      if (error instanceof PdfOpenCancelled || error instanceof PdfUnlockError) throw error;
      if (!(error instanceof Error) || error.name !== "PasswordException") {
        throw new PdfUnlockError("Le PDF est invalide ou son chiffrement n’est pas pris en charge.");
      }
      file = await authenticateWorkingFile(file);
      sessionOnly = true;
      data = new Uint8Array(await file.arrayBuffer());
      loadingTask = pdfjsLib.getDocument({ data });
    }

    try {
      const pdfDocument = await loadingTask.promise;
      const documentId = `pdf-${Date.now()}-${nextDocumentId.current}`;

      nextDocumentId.current += 1;
      const openedDocument: OpenPdfDocument = {
        id: documentId,
        media,
        imageBackgroundKey: "[]",
        fileName: media.kind === "image" ? originalName : file.name,
        workingSaveName,
        source,
        sessionOnly,
        file,
        pdfDocument,
        loadingTask,
        pageCount: pdfDocument.numPages,
        zoom: 1,
        scrollLeft: 0,
        scrollTop: 0,
        error: null,
      };
      // Publish restorable tabs only after their initial snapshot attempt.
      if (source.type === "web" && !sessionOnly && !await saveStoredDocument(buildViewerSnapshot(openedDocument))) {
        setStorageWarning(DOCUMENT_STORAGE_WARNING);
      }
      return openedDocument;
    } catch (error) {
      void loadingTask.destroy().catch(() => undefined);
      throw new PdfUnlockError("La copie de travail PDF n’a pas pu être ouverte.");
    }
  }, [authenticateWorkingFile, backendUrl]);

  const openGeneratedPdfDocument = useCallback(
    async (
      file: File,
      workingSaveName: string | null = null,
      source: DocumentSource = { type: "web" },
      sessionOnly?: true,
    ) => {
      const fileName = getUniqueFileName(
        file.name,
        documents.map((document) => document.fileName),
      );
      const uniqueFile =
        fileName === file.name
          ? file
          : new File([file], fileName, {
              type: file.type || "application/pdf",
            });
      const openedDocument = await loadOpenPdfDocument(
        uniqueFile,
        workingSaveName,
        source,
        sessionOnly,
      );
      const usageWarnings = getDocumentUsageWarnings(
        uniqueFile,
        openedDocument.pageCount,
        documents.length + 1,
      );

      pendingFocusTargetRef.current = "viewer";
      setDocuments((currentDocuments) => [...currentDocuments, openedDocument]);
      setActiveDocumentId(openedDocument.id);
      setWorkspaceMode("read");
      if (!import.meta.env.MODE.startsWith("test")) void loadPdfComments(backendUrl, openedDocument.file).then((comments) => {
        if (comments.length) dispatchPdfEdits({ type: "hydrate", documentId: openedDocument.id, edits: comments });
      });

      return { openedDocument, usageWarnings };
    },
    [backendUrl, documents, loadOpenPdfDocument],
  );

  const {
    isOcrDialogOpen,
    setIsOcrDialogOpen,
    isOcrProcessing,
    isConversionDialogOpen,
    setIsConversionDialogOpen,
    isConverting,
    runOcrOnActiveDocument,
    convertActiveDocument,
    resetDocumentProcessing,
  } = useDocumentProcessing({
    activeDocument,
    backendUrl,
    openGeneratedPdfDocument: (file, sessionOnly) => openGeneratedPdfDocument(file, null, undefined, sessionOnly),
    onFeedback: setExportFeedback,
  });

  const clearLocalData = useCallback(() => {
    if (!window.confirm("Effacer toutes les données locales de ce viewer ?")) {
      return;
    }

    pendingFocusTargetRef.current = "file-input";
    unrestoredDocumentIds.current = [];
    setDocuments((currentDocuments) => {
      currentDocuments.forEach(releasePdfDocument);
      return [];
    });
    setActiveDocumentId(null);
    setOrganizationPlans({});
    setSelectedPageIdsByDocument({});
    activePageByDocumentRef.current = {};
    setActivePageByDocument({});
    setPageNavigationRequest(null);
    dispatchPdfEdits({ type: "clear" });
    setSelectedEditId(null);
    setEyedropperTarget(null);
    setActiveEditingTool("select");
    clipboardEditRef.current = null;
    protectedClipboardOrigin.current = null;
    setSignatureImages({});
    setPendingSignatureImageId(null);
    setIsSignatureDialogOpen(false);
    setIsFileMenuOpen(false);
    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(null);
    setOutputName("");
    setSaveToOutputDir(false);
    setIsExporting(false);
    setExportFeedback(null);
    resetDocumentProcessing();
    setStorageWarning(null);
    setWorkspaceMode("read");
    setStatus("Sélectionnez un PDF local.");
    setIsSidebarVisible(true);
    setIsRestoringDocuments(false);
    setTheme(systemTheme());
    nextDocumentId.current = 1;
    nextTextEditId.current = 1;
    nextShapeEditId.current = 1;
    nextSignatureImageId.current = 1;
    nextSignatureEditId.current = 1;
    documentButtonRefs.current.clear();
    void clearViewerStorage().then((cleared) => {
      if (!cleared) {
        setStorageWarning("Certaines données locales n'ont pas pu être effacées. Fermez puis rouvrez l'application avant de réessayer.");
      }
    });
  }, [resetDocumentProcessing]);

  const openPdfFromUser = useCallback(async () => {
    if (!isDesktopRuntime()) {
      openFileInputRef.current?.click();
      return;
    }
    if (isRestoringDocuments) {
      setStatus("Restauration en cours...");
      return;
    }
    setExportFeedback(null);
    try {
      const selected = await openDesktopPdf();
      if (!selected) return;
      setStatus("Ouverture du PDF...");
      const openedDocument = await loadOpenPdfDocument(
        selected.file,
        null,
        { type: "desktop", documentId: selected.documentId },
      );
      const usageWarnings = getDocumentUsageWarnings(
        openedDocument.file,
        openedDocument.pageCount,
        documents.length + 1,
      );
      pendingFocusTargetRef.current = "viewer";
      setDocuments((currentDocuments) => [...currentDocuments, openedDocument]);
      setActiveDocumentId(openedDocument.id);
      setWorkspaceMode("read");
      if (!import.meta.env.MODE.startsWith("test")) void loadPdfComments(backendUrl, openedDocument.file).then((comments) => {
        if (comments.length) dispatchPdfEdits({ type: "hydrate", documentId: openedDocument.id, edits: comments });
      });
      setStatus(usageWarnings.map((warning) => `Avertissement: ${warning}`).join(" "));
    } catch (error) {
      if (error instanceof PdfOpenCancelled) { setStatus("Ouverture annulée."); return; }
      setExportFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Impossible d'ouvrir le PDF sélectionné.",
      });
    }
  }, [backendUrl, documents.length, isRestoringDocuments, loadOpenPdfDocument]);

  useEffect(() => {
    if (!isDesktopRuntime() || isRestoringDocuments || desktopStartupLoadedRef.current) {
      return;
    }
    desktopStartupLoadedRef.current = true;
    void getDesktopStartupPdfs().then(async (startupFiles) => {
      const openedDocuments: OpenPdfDocument[] = [];
      for (const startupFile of startupFiles) {
        try {
          openedDocuments.push(await loadOpenPdfDocument(
            startupFile.file,
            null,
            { type: "desktop", documentId: startupFile.documentId },
          ));
        } catch (error) {
          if (error instanceof PdfOpenCancelled) continue;
          setExportFeedback({
            kind: "error",
            message: error instanceof Error ? error.message : `Impossible d'ouvrir ${startupFile.file.name}.`,
          });
        }
      }
      if (openedDocuments.length) {
        pendingFocusTargetRef.current = "viewer";
        setDocuments((currentDocuments) => [...currentDocuments, ...openedDocuments]);
        setActiveDocumentId(openedDocuments[openedDocuments.length - 1].id);
        setWorkspaceMode("read");
        setStatus("");
      }
    }).catch((error) => {
      setExportFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Impossible de recevoir le PDF de démarrage.",
      });
    });
  }, [isRestoringDocuments, loadOpenPdfDocument]);

  const addExternalPagesFromOpenDocument = useCallback(
    (sourceDocumentId: string, sourcePageIndexes: number[]) => {
      const sourceDocument = documents.find((document) => document.id === sourceDocumentId);

      if (!sourceDocument || sourcePageIndexes.length === 0) {
        setExportFeedback({
          kind: "error",
          message: "Le PDF source n'est plus disponible. Ouvrez-le à nouveau avant de l'ajouter.",
        });
        return;
      }

      setExportFeedback(null);
      updateActiveOrganizationPlan((plan) => {
        const addedPages = [...sourcePageIndexes]
          .sort((left, right) => left - right)
          .filter((sourcePageIndex) => sourcePageIndex >= 0 && sourcePageIndex < sourceDocument.pageCount)
          .map((sourcePageIndex) => ({
          id: `${sourceDocument.id}:page:${sourcePageIndex}:insert:${Date.now()}-${nextOrganizedPageId.current++}`,
          sourceDocumentId: sourceDocument.id,
          sourceDocumentName: sourceDocument.fileName,
          sourcePageIndex,
          displayPageNumber: 0,
          rotation: 0 as const,
          }));

        return { ...plan, pages: renumberOrganizedPages([...plan.pages, ...addedPages]) };
      });
    },
    [documents, updateActiveOrganizationPlan],
  );

  const generatePdfForDocument = useCallback(async (
    documentId: string,
    operation: "export" | "save" | "save_as" | "print",
    requestedOutputName?: string,
    exportOptions?: ExportOptions,
  ): Promise<boolean> => {
    const includesPendingImage = imageJobs.some(({ id }) =>
      id === documentId || organizationPlans[documentId]?.pages.some((page) => page.sourceDocumentId === id));
    if (includesPendingImage) {
      setExportFeedback({ kind: "error", message: imageBackgroundError ?? "Transformation du fond en cours. Attendez la fin de l’aperçu avant d’exporter." });
      return false;
    }
    const document = documents.find((candidate) => candidate.id === documentId);
    const sessionOnly = document?.sessionOnly;
    setIsExporting(true);
    setExportFeedback(null);
    try {
      const payloadResult = buildPdfExportPayload({
        documentId,
        operation,
        requestedOutputName,
        exportOptions,
        activeDocumentId,
        outputName,
        saveToOutputDir: !sessionOnly && saveToOutputDir,
        documents,
        organizationPlans,
        editsByDocument: pdfEditsByDocument,
        signatureImages,
      });
      const payload = payloadResult instanceof Promise
        ? await payloadResult
        : payloadResult;
      if (!payload.ok) {
        setExportFeedback({ kind: "error", message: payload.message });
        return false;
      }
      const hasRedactions = JSON.parse(String(payload.formData.get("plan"))).redactions?.length > 0;
      if (hasRedactions && !window.confirm("Les informations biffées ne pourront pas être restaurées dans la copie exportée. Le document source reste inchangé. Les données ailleurs et les métadonnées ne sont pas anonymisées.")) return false;
      const exported = await executePdfExport({
        backendUrl,
        formData: payload.formData,
        fallbackFileName: payload.outputName,
      });
      if (!exported.ok) {
        setExportFeedback({
          kind: "error",
          message: exported.kind === "network"
            ? exported.message
            : `Erreur du backend : ${exported.message}`,
        });
        return false;
      }
      if (operation === "print") {
        setPrintPreview({
          documentName: exported.downloadedName,
          pdfBlob: exported.pdfBlob,
          stage: "ready",
        });
        return true;
      }
      const textOverflowWarningCount = exported.warnings.filter(
        (warning) => warning.type === "text_overflow",
      ).length;
      const textOverflowMessage = textOverflowWarningCount
        ? ` ${textOverflowWarningCount} zone${textOverflowWarningCount > 1 ? "s" : ""} de texte dépassai${textOverflowWarningCount > 1 ? "ent" : "t"} de ${textOverflowWarningCount > 1 ? "leur" : "son"} cadre. ${textOverflowWarningCount > 1 ? "Leur export a" : "Son export a"} été réalisé en mode best effort.`
        : "";
      const desktopSource = document?.saveDestination ?? null;
      const nativeSave = isDesktopRuntime()
        ? hasRedactions || operation === "save_as" || operation === "export"
          ? await saveDesktopPdfAs(exported.downloadedName, exported.pdfBlob, Boolean(hasRedactions || sessionOnly || document?.media?.kind === "image"))
          : desktopSource
            ? await saveDesktopPdf(desktopSource.documentId, exported.pdfBlob)
            : null
        : null;

      if (isDesktopRuntime() && nativeSave === null) {
        if (operation === "save_as" || operation === "export") {
          setExportFeedback({ kind: "warning", message: "Enregistrement annulé." });
        } else {
          setExportFeedback({
            kind: "error",
            message: "Ce document n'a pas de destination Desktop. Utilisez Enregistrer sous…."
          });
        }
        return false;
      }

      const savedFileName = nativeSave?.fileName ?? exported.downloadedName;
      const exportedFile = isDesktopRuntime()
        ? new File([exported.pdfBlob], savedFileName, {
            type: exported.pdfBlob.type || "application/pdf",
          })
        : downloadPdfToBrowser(exported.pdfBlob, exported.downloadedName);
      const operationLabel = operation === "export" ? "exporté" : "sauvegardé";
      const sizeReport = exportOptions ? ` Taille source : ${documents.filter((doc) => organizationPlans[documentId]?.pages.some((page) => page.sourceDocumentId === doc.id) || doc.id === documentId).reduce((size, doc) => size + doc.file.size, 0).toLocaleString("fr-FR")} octets. Taille exportée : ${exported.pdfBlob.size.toLocaleString("fr-FR")} octets. Profil : ${EXPORT_QUALITY_LABELS[exportOptions.quality]}.` : "";
      const exportMessage = exported.outputWarning
        ? `PDF ${operationLabel} avec succès : ${savedFileName}. ${exported.outputWarning}`
        : exported.outputStatus === "saved"
          ? `PDF ${operationLabel} avec succès : ${savedFileName}. Copie enregistrée dans data/output.`
          : `PDF ${operationLabel} avec succès : ${savedFileName}.`;

      try {
        if ((!hasRedactions && document?.media?.kind !== "image" && isDesktopRuntime() && operation !== "export") || Boolean(exportOptions?.openPassword || exportOptions?.ownerPassword)) {
          if (operation === "save_as" && nativeSave) {
            setDocuments((currentDocuments) => currentDocuments.map((candidate) =>
              candidate.id === documentId
                ? {
                    ...candidate,
                    fileName: nativeSave.fileName,
                    workingSaveName: nativeSave.fileName,
                    saveDestination: nativeSave,
                  }
                : candidate,
            ));
          }
          setExportFeedback({
            kind: exported.outputWarning || textOverflowWarningCount > 0 ? "warning" : "success",
            message: `${exportMessage}${sizeReport}${textOverflowMessage}${exportOptions?.openPassword || exportOptions?.ownerPassword ? " PDF chiffré : la sortie n’est pas rouverte automatiquement dans l’application." : ""}`,
          });
        } else {
          const { usageWarnings: exportUsageWarnings } =
            await openGeneratedPdfDocument(
              exportedFile,
              operation === "export" ? null : exported.downloadedName,
              isDesktopRuntime() && nativeSave
                ? { type: "desktop", documentId: nativeSave.documentId }
                : { type: "web" },
              sessionOnly,
            );
        setExportFeedback({
          kind:
            exported.outputWarning ||
            textOverflowWarningCount > 0 ||
            exportUsageWarnings.length > 0
              ? "warning"
              : "success",
          message: `${exportMessage}${sizeReport}${textOverflowMessage} Ouvert dans l'application en mode lecture.${exportUsageWarnings
            .map((warning) => ` Avertissement: ${warning}`)
            .join("")}`,
        });
        }
      } catch {
        setExportFeedback({
          kind: "warning",
          message: `${exportMessage}${sizeReport}${textOverflowMessage} Le téléchargement est disponible, mais l'ouverture dans l'application a échoué.`,
        });
      }
      if (operation === "save" || operation === "save_as") {
        const savedState = getDocumentEditingState(pdfEditsByDocument, documentId);
        dispatchPdfEdits({ type: "mark_saved", documentId, revision: savedState.revision, edits: savedState.edits, externalRevision: savedState.externalRevision });
      }
      return true;
    } catch (error) {
      const message = error instanceof Error && error.name === "PreviewSaveLimitError" ? error.message : error instanceof TypeError
        ? "Backend indisponible ou erreur réseau. Vérifiez que le service PDF est démarré."
        : error instanceof Error
          ? `Erreur du backend : ${error.message}`
          : "Le PDF n'a pas pu être exporté.";
      setExportFeedback({ kind: "error", message });
      return false;
    } finally {
      setIsExporting(false);
    }
  }, [imageJobsKey, imageBackgroundError, activeDocumentId, backendUrl, documents, openGeneratedPdfDocument, organizationPlans, outputName, pdfEditsByDocument, saveToOutputDir, signatureImages]);

  const exportActiveOrganizationPlan = useCallback(() => {
    if (!activeDocument) {
      return;
    }
    void generatePdfForDocument(activeDocument.id, "export");
  }, [activeDocument, generatePdfForDocument]);

  const printActiveDocument = useCallback(async () => {
    if (!activeDocument || isExporting) return;
    setIsFileMenuOpen(false);
    setPrintPreview({ documentName: activeDocument.fileName, pdfBlob: null, stage: "preparing" });
    const prepared = await generatePdfForDocument(activeDocument.id, "print");
    if (!prepared) {
      setPrintPreview(null);
    }
  }, [activeDocument, generatePdfForDocument, isExporting]);

  const closePrintPreview = useCallback(() => {
    printCleanupRef.current?.();
    printCleanupRef.current = null;
    setPrintPreview(null);
  }, []);

  const requestPrintFromPreview = useCallback(() => {
    if (!printPreview?.pdfBlob) return;
    printCleanupRef.current?.();
    setPrintPreview((current) => current ? { ...current, stage: "dialog-requested" } : current);
    printCleanupRef.current = printPdfBlob(printPreview.pdfBlob, {
      onComplete: () => {
        printCleanupRef.current = null;
        setPrintPreview(null);
      },
      onError: () => {
        setExportFeedback({ kind: "warning", message: "Le dialogue d’impression n’a pas pu être ouvert. Utilisez le PDF imprimable comme solution de secours." });
      },
    });
  }, [printPreview]);

  useEffect(() => () => {
    printCleanupRef.current?.();
  }, []);

  const openSaveAsDialog = useCallback(
    (documentId: string) => {
      if (isExporting || !documents.some((document) => document.id === documentId)) {
        return;
      }

      setExportFeedback(null);
      setIsFileMenuOpen(false);
      setSaveAsDocumentId(documentId);
    },
    [documents, isExporting],
  );

  const openActiveSaveAsDialog = useCallback(() => {
    if (!activeDocument || isExporting) {
      return;
    }

    if (isDesktopRuntime()) {
      void generatePdfForDocument(
        activeDocument.id,
        "save_as",
        getSuggestedPdfSaveName(activeDocument.fileName, activeDocument.workingSaveName),
      );
      return;
    }

    openSaveAsDialog(activeDocument.id);
  }, [activeDocument, generatePdfForDocument, isActiveDocumentDirty, isExporting, openSaveAsDialog]);

  const saveActiveDocument = useCallback(() => {
    if (!activeDocument || !isActiveDocumentDirty || isExporting) {
      return;
    }
    if (isDesktopRuntime() && activeDocument.saveDestination) {
      void generatePdfForDocument(
        activeDocument.id,
        "save",
        activeDocument.fileName,
      );
      return;
    }
    openActiveSaveAsDialog();
  }, [activeDocument, generatePdfForDocument, isActiveDocumentDirty, isExporting, openActiveSaveAsDialog]);

  const saveDocumentAs = useCallback(
    async (fileName: string) => {
      if (!saveAsDocumentId || isExporting) {
        return false;
      }

      const documentId = saveAsDocumentId;
      const didSave = await generatePdfForDocument(
        documentId,
        "save_as",
        fileName,
      );
      if (didSave) {
        setSaveAsDocumentId(null);
      }
      return didSave;
    },
    [generatePdfForDocument, isExporting, saveAsDocumentId],
  );

  const savePendingCloseDocument = useCallback(() => {
    if (!pendingCloseDocumentId || isExporting) {
      return;
    }

    const documentId = pendingCloseDocumentId;
    const document = documents.find((candidate) => candidate.id === documentId);
    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(documentId);
    if (isDesktopRuntime() && document?.saveDestination) {
      void generatePdfForDocument(documentId, "save", document.fileName).then((didSave) => {
        if (!didSave) {
          setCloseAfterSaveDocumentId(null);
          setPendingCloseDocumentId(documentId);
        }
      });
      return;
    }
    if (isDesktopRuntime() && document) {
      void generatePdfForDocument(documentId, "save_as", getSuggestedPdfSaveName(document.fileName, document.workingSaveName)).then((didSave) => {
        if (!didSave) { setCloseAfterSaveDocumentId(null); setPendingCloseDocumentId(documentId); }
      });
      return;
    }
    openSaveAsDialog(documentId);
  }, [documents, generatePdfForDocument, isExporting, openSaveAsDialog, pendingCloseDocumentId]);

  const cancelSaveAsDialog = useCallback(() => {
    const documentId = saveAsDocumentId;
    setSaveAsDocumentId(null);

    if (documentId && closeAfterSaveDocumentId === documentId) {
      setCloseAfterSaveDocumentId(null);
      setPendingCloseDocumentId(documentId);
    }
  }, [closeAfterSaveDocumentId, saveAsDocumentId]);

  useEffect(() => {
    if (!closeAfterSaveDocumentId || isExporting) {
      return;
    }
    if (
      getDocumentEditingState(pdfEditsByDocument, closeAfterSaveDocumentId)
        .isDirty
    ) {
      return;
    }

    setPendingCloseDocumentId(null);
    setCloseAfterSaveDocumentId(null);
    performCloseDocument(closeAfterSaveDocumentId);
  }, [
    closeAfterSaveDocumentId,
    isExporting,
    pdfEditsByDocument,
    performCloseDocument,
  ]);

  useEffect(() => {
    const handleApplicationShortcut = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const commandId = resolveAppShortcut(event, {
        desktop: isDesktopRuntime(),
        platform: getShortcutPlatform(),
      });
      if (isAdvancedExportOpen || protectedOpeningRef.current) return;
      if (!commandId || isEditableKeyboardTarget(event.target)) return;

      const editingState = activeDocument
        ? getDocumentEditingState(pdfEditsByDocument, activeDocument.id)
        : null;
      const commands: Record<AppCommandId, (() => void) | null> = {
        "file.open": saveAsDocumentId || pendingCloseDocumentId ? null : openPdfFromUser,
        "file.close": activeDocument ? closeActiveDocumentByKeyboard : null,
        "file.save": activeDocument && isActiveDocumentDirty && !isExporting ? saveActiveDocument : null,
        "file.saveAs": activeDocument && !isExporting ? openActiveSaveAsDialog : null,
        "print.document": activeDocument && !isExporting ? printActiveDocument : null,
        "history.undo": workspaceMode === "read" && editingState?.canUndo ? undoPdfEdit : null,
        "history.redo": workspaceMode === "read" && editingState?.canRedo ? redoPdfEdit : null,
        "edit.copy": workspaceMode === "read" && selectedPdfEdit ? copySelectedPdfEdit : null,
        "edit.paste": workspaceMode === "read" && clipboardEditRef.current ? () => void pastePdfEdit() : null,
        "view.zoomIn": activeDocument && workspaceMode === "read" && activeDocument.zoom < MAX_ZOOM
          ? () => updateDocumentZoom(activeDocument.id, ZOOM_STEP)
          : null,
        "view.zoomOut": activeDocument && workspaceMode === "read" && activeDocument.zoom > MIN_ZOOM
          ? () => updateDocumentZoom(activeDocument.id, -ZOOM_STEP)
          : null,
        "view.resetZoom": activeDocument && workspaceMode === "read"
          ? () => {
              setFitToPageByDocument((currentModes) => ({ ...currentModes, [activeDocument.id]: false }));
              setDocumentZoom(activeDocument.id, 1);
            }
          : null,
        "tabs.next": documents.length > 1
          ? () => selectDocumentByKeyboard((activeDocumentIndex + 1) % documents.length)
          : null,
        "tabs.previous": documents.length > 1
          ? () => selectDocumentByKeyboard((activeDocumentIndex - 1 + documents.length) % documents.length)
          : null,
        "search.open": activeDocument && workspaceMode === "read" ? openPdfSearch : null,
        "overlay.escape": activeSearch.isOpen
          ? closePdfSearch
          : saveAsDocumentId
          ? cancelSaveAsDialog
          : isSignatureDialogOpen || eyedropperTarget !== null || activeEditingTool !== "select" || pendingSignatureImageId !== null || selectedEditId !== null
            ? () => {
                if (!requestToolChange()) return;
                setIsSignatureDialogOpen(false);
                setActiveEditingTool("select");
                setEyedropperTarget(null);
                setPendingSignatureImageId(null);
                setSelectedEditId(null);
              }
            : null,
      };
      const execute = commands[commandId];
      if (!execute) return;
      event.preventDefault();
      execute();
    };

    window.addEventListener("keydown", handleApplicationShortcut);
    return () => window.removeEventListener("keydown", handleApplicationShortcut);
  }, [
    activeEditingTool,
    activeDocument,
    activeDocumentIndex,
    cancelSaveAsDialog,
    closeActiveDocumentByKeyboard,
    closePdfSearch,
    copySelectedPdfEdit,
    documents.length,
    isSignatureDialogOpen,
    isAdvancedExportOpen,
    isActiveDocumentDirty,
    isExporting,
    eyedropperTarget,
    openActiveSaveAsDialog,
    openPdfSearch,
    pastePdfEdit,
    printActiveDocument,
    pendingSignatureImageId,
    pendingCloseDocumentId,
    pdfEditsByDocument,
    redoPdfEdit,
    saveActiveDocument,
    selectedPdfEdit,
    saveAsDocumentId,
    selectDocumentByKeyboard,
    selectedEditId,
    setDocumentZoom,
    undoPdfEdit,
    updateDocumentZoom,
    workspaceMode,
    activeSearch.isOpen,
  ]);

  const removeMissingSourcePages = useCallback(() => {
    if (!activeDocument) {
      return;
    }

    const availableDocumentIds = new Set(documents.map((document) => document.id));
    updateActiveOrganizationPlan((plan) => ({
      ...plan,
      pages: renumberOrganizedPages(
        plan.pages.filter((page) => availableDocumentIds.has(page.sourceDocumentId)),
      ),
    }));
    setSelectedPageIdsByDocument((currentSelection) => {
      const selectedPageId = currentSelection[activeDocument.id];
      const selectedPage = activeOrganizationPlan?.pages.find((page) => page.id === selectedPageId);

      return {
        ...currentSelection,
        [activeDocument.id]: selectedPage && !availableDocumentIds.has(selectedPage.sourceDocumentId)
          ? null
          : selectedPageId ?? null,
      };
    });
  }, [activeDocument, activeOrganizationPlan, documents, updateActiveOrganizationPlan]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isRestoringDocuments) {
      setStatus("Restauration en cours...");
      event.currentTarget.value = "";
      return;
    }

    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    await importDocumentFiles(selectedFiles);
  }

  async function importDocumentFiles(selectedFiles: File[]) {
    if (isRestoringDocuments) { setStatus("Restauration en cours..."); return; }
    if (selectedFiles.length === 0) {
      return;
    }

    setExportFeedback(null);
    setStatus(
      selectedFiles.length === 1 ? "Ouverture du document..." : `Ouverture de ${selectedFiles.length} documents...`,
    );

    const openedDocuments: OpenPdfDocument[] = [];
    const failedFileNames: string[] = [];

    for (const file of selectedFiles) {
      try {
        const opened = await loadOpenPdfDocument(file);
        try {
          validateImageDocumentSession([...documents, ...openedDocuments, opened].flatMap((document) => document.media?.kind === "image" ? [document.media] : []));
        } catch (error) { releasePdfDocument(opened); void removeStoredDocument(opened.id); throw error; }
        openedDocuments.push(opened);
      } catch (error) {
        if (!(error instanceof PdfOpenCancelled)) {
          failedFileNames.push(file.name);
          if (error instanceof Error) setExportFeedback({ kind: "error", message: error.message });
        }
      }
    }

    if (openedDocuments.length > 0) {
      setDocuments((currentDocuments) => [...currentDocuments, ...openedDocuments]);
      setActiveDocumentId(openedDocuments[openedDocuments.length - 1].id);
      pendingFocusTargetRef.current = "viewer";
      openedDocuments.forEach((openedDocument) => {
        if (!import.meta.env.MODE.startsWith("test")) void loadPdfComments(backendUrl, openedDocument.file).then((comments) => {
          if (comments.length) dispatchPdfEdits({ type: "hydrate", documentId: openedDocument.id, edits: comments });
        });
      });
    }

    const usageWarnings = openedDocuments.flatMap((openedDocument, index) =>
      getDocumentUsageWarnings(openedDocument.file, openedDocument.pageCount, documents.length + index + 1),
    );

    if (failedFileNames.length > 0) {
      const failureMessage =
        failedFileNames.length === 1
          ? `Impossible d'ouvrir ${failedFileNames[0]}.`
          : `${failedFileNames.length} documents n'ont pas pu être ouverts.`;
      setStatus([failureMessage, ...usageWarnings.map((warning) => `Avertissement: ${warning}`)].join(" "));
      return;
    }

    const ignoredFiles = selectedFiles.length - selectedFiles.length;
    const ignoredFilesMessage = ignoredFiles > 0 ? `${ignoredFiles} fichier non PDF ignoré.` : "";
    setStatus([ignoredFilesMessage, ...usageWarnings.map((warning) => `Avertissement: ${warning}`)].filter(Boolean).join(" "));
  }

  const startPropertiesResize = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = propertiesPanelWidth;
    const resize = (moveEvent: globalThis.MouseEvent) => {
      setPropertiesPanelWidth(
        Math.min(460, Math.max(220, startWidth + startX - moveEvent.clientX)),
      );
    };
    const finish = () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", finish);
    };
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", finish);
  }, [propertiesPanelWidth]);

  const selectNavigationTool = (tool: NavigationAction) => {
    if (tool === "thumbnails" || tool === "comments_list") {
      setIsSidebarVisible(true);
      setIsCommentsView(tool === "comments_list");
      return;
    }
    if (activeDocument?.media?.kind === "image" && (tool === "redaction" || tool === "edit_text")) return false;
    if (!requestToolChange()) return false;
    if (tool === "organize") {
      setWorkspaceMode((mode) => mode === "read" ? "organize" : "read");
      return;
    }
    if (tool === "images_pdf") { setIsImagesPdfOpen(true); return; }
    setExportFeedback(null);
    if (tool === "ocr") { setIsOcrDialogOpen(true); return; }
    if (tool === "convert") { setIsConversionDialogOpen(true); return; }
    if (tool === "image") { imageInputRef.current?.click(); return; }
    setActiveEditingTool(tool);
    setSelectedEditId(null);
    setPendingSignatureImageId(null);
    setEyedropperTarget(null);
    closePdfSearch();
    setTextMarkupSelection(null);
    setIsPropertiesPanelVisible(true);
    if (tool === "signature") setIsSignatureDialogOpen(true);
  };

  const runFileAction = (action: () => void) => {
    setIsFileMenuOpen(false);
    fileMenuTriggerRef.current?.focus({ preventScroll: true });
    action();
  };

  if (isRestoringDocuments) {
    return (
      <AppStateScreen
        state="loading"
        title="Restauration en cours"
        description="Préparation de vos documents locaux…"
      />
    );
  }

  if (restorationError) {
    return (
      <AppStateScreen
        state="error"
        title="Impossible de restaurer vos documents"
        description="L’application n’a pas pu terminer son initialisation."
        action={
          <button
            type="button"
            onClick={() => {
              setRestorationError(null);
              setIsRestoringDocuments(true);
              setRestorationAttempt((attempt) => attempt + 1);
            }}
          >
            Réessayer
          </button>
        }
        details={<code>{restorationError}</code>}
      />
    );
  }

  return (
    <main
      ref={presentationContainerRef}
      data-persistence-state={localPersistenceState}
      className={viewerMode === "presentation" ? "app-shell app-shell--presentation" : "app-shell"}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void importDocumentFiles(Array.from(event.dataTransfer.files)); } }}
    >
      <header
        className="toolbar toolbar--sticky"
        role="region"
        aria-label="Contrôles PDF"
      >
        <div className="app-brand">
          <AppLogo className="app-brand__mark" size={24} />
          <h1>PDF Studio Local</h1>
        </div>

        <div className="toolbar-actions" aria-label="Actions PDF">
          <div className="toolbar-action-group toolbar-actions__primary" aria-label="Actions principales">
            <button type="button" className="toolbar-icon-button" aria-label="Ouvrir un PDF" title={`Ouvrir un PDF ou une image (${getAppCommandShortcutLabel("file.open")})`} onClick={() => void openPdfFromUser()}><ToolbarIcon name="open" /></button>
            <button
              type="button"
              className="toolbar-icon-button"
              aria-label={isDesktopRuntime() ? "Enregistrer" : "Enregistrer sous…"}
              title={isDesktopRuntime()
                ? `Enregistrer (${getAppCommandShortcutLabel("file.save")})`
                : `Enregistrer sous… (${getAppCommandShortcutLabel("file.saveAs")})`}
              onClick={isDesktopRuntime() ? saveActiveDocument : openActiveSaveAsDialog}
              disabled={!activeDocument || !isActiveDocumentDirty || isExporting}
            ><ToolbarIcon name="save-as" /></button>
            <button type="button" className="toolbar-icon-button" aria-label="Sélection" title="Sélection"
              aria-pressed={workspaceMode === "read" && activeEditingTool === "select"}
              disabled={!activeDocument || workspaceMode !== "read"} onClick={() => selectNavigationTool("select")}><ToolbarIcon name="select" /></button>
            <button type="button" className="toolbar-icon-button toolbar-icon-button--danger" aria-label="Réinitialiser les données locales" title="Réinitialiser les données locales" onClick={clearLocalData}><ResetIcon /></button>
          </div>
          <span className="toolbar-actions__spacer" aria-hidden="true" />
          <div className="theme-selector">
            <span className="theme-selector__preview" aria-hidden="true"><i /><i /><i /></span>
            <select aria-label="Thème de l’interface" value={theme} onChange={(event) => {
              const value = event.currentTarget.value;
              if (isThemeId(value)) setTheme(value);
            }}>
              {THEMES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div className="toolbar-action-group" aria-label="Fichier">
            <div className="file-menu">
              <button
                type="button"
                ref={fileMenuTriggerRef}
                onClick={() => setIsFileMenuOpen((isOpen) => !isOpen)}
                aria-haspopup="menu"
                aria-expanded={isFileMenuOpen}
                aria-controls={isFileMenuOpen ? fileMenuId : undefined}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); setIsFileMenuOpen(true); }
                }}
              >
                Fichier <span aria-hidden="true">▾</span>
              </button>
              {isFileMenuOpen ? createPortal(
                <div ref={fileMenuRef} id={fileMenuId} className="floating-surface file-menu__items" role="menu" aria-label="Fichier"
                  onKeyDown={(event) => {
                    if (event.key === "Tab") {
                      setIsFileMenuOpen(false);
                      fileMenuTriggerRef.current?.focus({ preventScroll: true });
                    } else moveMenuFocus(event);
                  }}>
                  <button type="button" role="menuitem" onClick={() => runFileAction(() => setIsImagesPdfOpen(true))}>Nouveau PDF à partir d’images</button>
                  {activeDocument?.media?.kind === "image" ? <button type="button" role="menuitem" disabled={activeImagePending && !imageBackgroundError} onClick={() => runFileAction(() => setIsImageDocumentOpen(true))}>Éditer le fond image…</button> : null}
                  {isDesktopRuntime() ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => runFileAction(saveActiveDocument)}
                      disabled={!isActiveDocumentDirty || isExporting}
                    >
                      Enregistrer <span aria-hidden="true">{getAppCommandShortcutLabel("file.save")}</span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runFileAction(openActiveSaveAsDialog)}
                    disabled={!activeDocument || isExporting}
                  >
                    {activeDocument?.media?.kind === "image" ? "Exporter en PDF…" : "Enregistrer sous…"} <span aria-hidden="true">{getAppCommandShortcutLabel("file.saveAs")}</span>
                  </button>
                  <button type="button" role="menuitem" disabled={!activeDocument || isExporting} onClick={() => runFileAction(() => setIsAdvancedExportOpen(true))}>Exporter / Finaliser…</button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => runFileAction(printActiveDocument)}
                    disabled={!activeDocument || isExporting}
                  >
                    Imprimer (expérimental) <span aria-hidden="true">{isDesktopRuntime() ? getAppCommandShortcutLabel("print.document") : ""}</span>
                  </button>
                </div>, floatingPortalTarget(fileMenuTriggerRef.current),
              ) : null}
            </div>
          </div>
          <div className="toolbar-action-group" role="group" aria-label="Historique">
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={undoPdfEdit}
              disabled={!activeDocumentEditingState?.canUndo}
              aria-label="Annuler"
              aria-keyshortcuts="Control+Z Meta+Z"
              title={`Annuler (${getAppCommandShortcutLabel("history.undo")})`}
            >
              <ToolbarIcon name="undo" />
            </button>
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={redoPdfEdit}
              disabled={!activeDocumentEditingState?.canRedo}
              aria-label="Rétablir"
              aria-keyshortcuts="Control+Y Control+Shift+Z Meta+Shift+Z"
              title={`Rétablir (${getAppCommandShortcutLabel("history.redo")})`}
            >
              <ToolbarIcon name="redo" />
            </button>
          </div>
        </div>
        <DocumentTabs
          documents={documents}
          activeDocumentId={activeDocumentId}
          dirtyDocumentIds={dirtyDocumentIds}
          onSelectDocument={selectDocumentFromSidebar}
          onCloseDocument={closeDocument}
          onKeyDown={handleSidebarKeyDown}
          getDocumentButtonRef={(documentId) => (node) => {
            documentButtonRefs.current.set(documentId, node);
          }}
        />
      </header>
      {isAdvancedExportOpen ? <AdvancedExportDialog busy={isExporting} onCancel={() => setIsAdvancedExportOpen(false)} onExport={async (options) => {
        if (!activeDocument) return false;
        const saved = await generatePdfForDocument(activeDocument.id, "export", undefined, options);
        if (saved) setIsAdvancedExportOpen(false);
        return saved;
      }} /> : null}
      {isSignatureDialogOpen ? (
        <SignatureDialog
          onCancel={() => {
            setIsSignatureDialogOpen(false);
            setActiveEditingTool("select");
          }}
          onConfirm={prepareSignatureImage}
        />
      ) : null}

      {isFormLockConfirmOpen ? (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section className="unsaved-dialog" role="dialog" aria-modal="true" aria-labelledby="form-lock-title">
            <h2 id="form-lock-title">Verrouiller le formulaire ?</h2>
            <p>
              Les champs resteront présents et interactifs dans le PDF, mais ne pourront plus être modifiés dans les lecteurs qui respectent le flag ReadOnly.
            </p>
            <p>Cette action peut être annulée avant l’enregistrement avec Annuler ou Annuler l’action.</p>
            <div className="unsaved-dialog__actions">
              <button type="button" autoFocus onClick={() => setIsFormLockConfirmOpen(false)}>Annuler</button>
              <button type="button" onClick={lockActivePdfForm}>Verrouiller</button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingComment ? (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section className="unsaved-dialog comment-dialog" role="dialog" aria-modal="true" aria-labelledby="comment-dialog-title">
            <h2 id="comment-dialog-title">Nouveau commentaire</h2>
            <label>Rédacteur<input aria-label="Rédacteur" value={commentAuthorDraft} onChange={(event) => setCommentAuthorDraft(event.target.value)} placeholder="Non renseigné" /></label>
            <label>Message</label>
            <textarea autoFocus value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} aria-label="Texte du commentaire" placeholder="Saisissez votre commentaire…" rows={4} />
            <div className="unsaved-dialog__actions">
              <button type="button" onClick={() => { setPendingComment(null); setCommentDraft(""); setActiveEditingTool("select"); }}>Annuler</button>
              <button type="button" onClick={addComment} disabled={!commentDraft.trim()}>Ajouter</button>
            </div>
          </section>
        </div>
      ) : null}

      {saveAsDocument ? (
        <SaveAsDialog
          suggestedName={getSuggestedPdfSaveName(
            saveAsDocument.fileName,
            saveAsDocument.workingSaveName,
          )}
          isSaving={isExporting}
          errorMessage={
            exportFeedback?.kind === "error" ? exportFeedback.message : null
          }
          onCancel={cancelSaveAsDialog}
          onSave={saveDocumentAs}
        />
      ) : null}

      {printPreview ? (
        <PrintPreviewDialog
          documentName={printPreview.documentName}
          pdfBlob={printPreview.pdfBlob}
          stage={printPreview.stage}
          onCancel={closePrintPreview}
          onPrint={requestPrintFromPreview}
          onOpenPdf={() => printPreview.pdfBlob ? openPdfBlobForPrint(printPreview.pdfBlob) : false}
        />
      ) : null}

      {pendingCloseDocument ? (
        <div className="unsaved-dialog-backdrop" role="presentation">
          <section
            className="unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-dialog-title"
          >
            <h2 id="unsaved-dialog-title">Modifications non sauvegardées</h2>
            <p>
              {pendingCloseDocument.fileName} contient des modifications non
              sauvegardées.
            </p>
            <div className="unsaved-dialog__actions">
              <button
                type="button"
                onClick={savePendingCloseDocument}
                disabled={isExporting}
              >
                Enregistrer sous…
              </button>
              <button
                type="button"
                onClick={() => {
                  const documentId = pendingCloseDocument.id;
                  setPendingCloseDocumentId(null);
                  setCloseAfterSaveDocumentId(null);
                  performCloseDocument(documentId);
                }}
                disabled={isExporting}
              >
                Ignorer les modifications
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingCloseDocumentId(null);
                  setCloseAfterSaveDocumentId(null);
                }}
                disabled={isExporting}
              >
                Annuler
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeImagePending ? imageBackgroundError
        ? <p role="alert">{imageBackgroundError} Annulez la transformation ou réinitialisez le fond pour réessayer.</p>
        : <p role="status">Transformation du fond image…</p> : null}
      {isImageDocumentOpen && activeDocument ? <ImageDocumentDialog pdf={activeDocument.pdfDocument} onCancel={() => setIsImageDocumentOpen(false)} onTransform={updateImageBackground} onReset={() => updateImageBackground()} /> : null}
      {isImagesPdfOpen ? <ImagesPdfDialog onCancel={() => setIsImagesPdfOpen(false)} onCreate={async (sources: ImageSource[], layout: ImageLayout, signal: AbortSignal) => {
        const blob = await createImagePdf(backendUrl, sources, layout, signal);
        if (signal.aborted) return;
        await openGeneratedPdfDocument(new File([blob], "images.pdf", { type: "application/pdf" }));
        setIsImagesPdfOpen(false);
      }} /> : null}
      {passwordPrompt ? <PdfPasswordDialog error={passwordPrompt.error} onAnswer={passwordPrompt.answer} /> : null}
      {isOcrDialogOpen && activeDocument ? (
        <OcrDialog
          supportsDeskew={!isDesktopRuntime()}
          sourceFileName={activeDocument.fileName}
          hasPendingOrganizationChanges={hasPendingOrganizationChanges}
          isProcessing={isOcrProcessing}
          onCancel={() => setIsOcrDialogOpen(false)}
          onSubmit={(options) => void runOcrOnActiveDocument(options)}
        />
      ) : null}

      {isConversionDialogOpen && activeDocument ? (
        <ConversionDialog
          sourceFileName={activeDocument.fileName}
          sourcePageCount={activeDocument.pageCount}
          hasPendingOrganizationChanges={hasPendingOrganizationChanges}
          isProcessing={isConverting}
          onCancel={() => setIsConversionDialogOpen(false)}
          onSubmit={(options) => void convertActiveDocument(options)}
        />
      ) : null}

      <section
        className={`${isSidebarVisible ? "content-area" : "content-area content-area--sidebar-hidden"}${isPropertiesPanelVisible ? "" : " content-area--properties-hidden"}`}
        aria-label="Espace de travail PDF"
        style={{ "--properties-panel-width": `${propertiesPanelWidth}px` } as CSSProperties}
      >
        <SidebarNavigation key={`${activeDocumentId ?? ""}:${viewerMode === "presentation"}`} rasterSource={activeDocument?.media?.kind === "image"} activeTool={activeEditingTool} organizing={workspaceMode === "organize"}
          disabled={!activeDocument || workspaceMode !== "read"}
          processingDisabled={!activeDocument || isOcrProcessing || isExporting || isConverting}
          imageDisabled={!activeDocument || workspaceMode !== "read" || activeOrganizationPlan?.pages.find((page) => page.displayPageNumber === activePageNumber)?.sourceDocumentId !== activeDocument.id}
          onSelect={selectNavigationTool} />
        <input ref={stampImageInputRef} type="file" accept="image/png,image/jpeg" aria-label="Fichier tampon image" hidden onChange={(event) => void insertImage(event, true)} />
        <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" aria-label="Fichier image" hidden onChange={(event) => void insertImage(event)} />

        <button
          type="button"
          className="sidebar-rail-toggle"
          onClick={() => setIsSidebarVisible((currentVisible) => !currentVisible)}
          aria-controls={sidebarId}
          aria-expanded={isSidebarVisible}
          aria-label={isSidebarVisible ? "Masquer la barre latérale" : "Afficher la barre latérale"}
        >
          <span aria-hidden="true"><ToolbarIcon name={isSidebarVisible ? "chevron-left" : "chevron-right"} /></span>
        </button>

        {isSidebarVisible ? (
          <DocumentSidebar
            documents={documents}
            openFileInputRef={openFileInputRef}
            activePageNumber={activePageNumber}
            pagePlan={activeOrganizationPlan}
            outline={activeDocument && activeDocument.media?.kind !== "image" && workspaceMode === "read" ? <PdfOutline
              key={activeDocument.id} pdf={activeDocument.pdfDocument}
              onFollow={(destination) => followPdfLink(activeDocument.id, destination)}
            /> : null}
            onSelectPage={(pageNumber) => {
              recordActivePage(activeDocument?.id ?? "", pageNumber);
              if (!activeDocument) return;
              setPageNavigationRequest({
                documentId: activeDocument.id,
                pageNumber,
                requestId: ++pageNavigationRequestId.current,
              });
            }}
            onFileChange={handleFileChange}
            status={status}
            storageWarning={storageWarning}
            sidebarId={sidebarId}
            onKeyDown={handleSidebarKeyDown}
            pageView={pageView}
            onPageViewChange={setPageView}
            comments={activeComments}
            commentsView={isCommentsView}
            selectedCommentId={selectedCommentEdit?.id ?? null}
            onCommentsViewChange={setIsCommentsView}
            onSelectComment={(comment) => {
              setSelectedEditId(comment.id);
              setIsCommentsView(true);
              recordActivePage(activeDocument?.id ?? "", comment.page);
              if (!activeDocument) return;
              setPageNavigationRequest({ documentId: activeDocument.id, pageNumber: comment.page, commentId: comment.id, requestId: ++pageNavigationRequestId.current });
            }}
          />
        ) : null}

        <section className="workspace-stage" aria-label="Document actif">
          {isOcrProcessing ? (
          <div
            className="export-read-feedback organize-feedback organize-feedback--progress"
            role="status"
          >
            <span className="organize-spinner" aria-hidden="true" />
            <span>OCR en cours…</span>
          </div>
        ) : isConverting ? (
          <div
            className="export-read-feedback organize-feedback organize-feedback--progress"
            role="status"
          >
            <span className="organize-spinner" aria-hidden="true" />
            <span>Conversion en cours…</span>
          </div>
        ) : workspaceMode === "read" && exportFeedback ? (
          <div
            className={`export-read-feedback organize-feedback organize-feedback--${exportFeedback.kind}`}
            role={exportFeedback.kind === "error" ? "alert" : "status"}
          >
            <span>{exportFeedback.message}</span>
            <button type="button" onClick={() => setExportFeedback(null)} aria-label="Fermer le message">
              Fermer
            </button>
          </div>
          ) : null}

          {activeDocument && workspaceMode === "read" && activeSearch.isOpen ? (
            <PdfSearchBar
              query={activeSearch.query}
              resultIndex={activeSearch.activeHitIndex}
              resultCount={activeSearch.hits.length}
              pagesScanned={activeSearch.pagesScanned}
              totalPages={activeSearch.totalPages}
              isSearching={activeSearch.status === "searching"}
              error={activeSearch.error}
              onQueryChange={updatePdfSearchQuery}
              onNext={() => navigatePdfSearch(1)}
              onPrevious={() => navigatePdfSearch(-1)}
              onClose={closePdfSearch}
            />
          ) : null}

          {activeDocument && activeOrganizationPlan && workspaceMode === "read" ? (
          <PdfViewer
            backendUrl={backendUrl}
            document={activeDocument}
            documents={documents}
            pagePlan={activeOrganizationPlan}
            edits={watermarkPreview?.documentId === activeDocument.id ? [...activePdfEdits, ...watermarkPreview.edits] : activePdfEdits}
            editsByDocument={pdfEditsByDocument}
            signatureImages={signatureImages}
            selectedEditId={selectedEditId}
            activeTool={activeEditingTool}
            formUiLocked={isActiveFormUiLocked}
            pdfFormLocked={isActivePdfFormLocked}
            freehandStyle={freehandToolStyle}
            pendingSignatureImage={pendingSignatureImage}
            eyedropperTarget={eyedropperTarget}
            onZoomChange={updateDocumentZoom}
            onScrollPositionChange={updateDocumentScrollPosition}
            onFollowLink={followPdfLink}
            onEditLink={(edit) => { setLinkDraft(edit); setIsPropertiesPanelVisible(true); }}
            onAddText={addTextEdit}
            onAddNativeText={addNativeTextEdit}
            onAddStamp={addStampEdit}
            onAddRedaction={addRedactionEdit}
            onAddShape={addShapeEdit}
            onAddFreehand={addFreehandEdit}
            onStartComment={startComment}
            onPlaceSignature={placeSignature}
            onSelectEdit={setSelectedEditId}
            onDeselectEdit={() => setSelectedEditId(null)}
            onUpdateEdit={updatePdfEdit}
            onFinishEditCoalescing={finishPdfEditCoalescing}
            onDeleteEdit={deletePdfEdit}
            onActivePageChange={recordActivePage}
            onSampleColor={applySampledShapeColor}
            onSetFormUiLock={setActiveFormUiLock}
            onRequestPdfFormLock={() => setIsFormLockConfirmOpen(true)}
            onUnlockPdfForm={unlockActivePdfForm}
            fontLibraryRevision={fontLibraryRevision}
            searchHits={activeSearch.hits}
            activeSearchHitId={activeSearch.hits[activeSearch.activeHitIndex]?.id ?? null}
            focusRequest={viewerFocusRequest}
            pageNavigationRequest={pageNavigationRequest?.documentId === activeDocument.id ? pageNavigationRequest : null}
            viewerMode={viewerMode}
            activePageNumber={activePageNumber}
            onZoomSet={setDocumentZoom}
            shouldFitToPage={fitToPageByDocument[activeDocument.id] ?? true}
            fitRefreshToken={presentationFitRefreshToken}
          />
        ) : activeDocument && activeOrganizationPlan ? (
          <OrganizePages
            document={activeDocument}
            documents={documents}
            plan={activeOrganizationPlan}
            selectedPageId={selectedOrganizedPageId}
            outputName={outputName}
            saveToOutputDir={!activeDocument.sessionOnly && saveToOutputDir}
            isExporting={isExporting}
            exportFeedback={exportFeedback}
            onToggleSelection={toggleOrganizedPageSelection}
            onMovePageByIndex={moveOrganizedPage}
            onDeletePage={deleteOrganizedPage}
            onDuplicatePage={duplicateOrganizedPage}
            onRotatePage={rotateOrganizedPage}
            onReset={resetActiveOrganizationPlan}
            onOutputNameChange={(nextOutputName) => {
              setExportFeedback(null);
              setOutputName(nextOutputName);
            }}
            onSaveToOutputDirChange={(shouldSaveToOutputDir) => {
              setExportFeedback(null);
              setSaveToOutputDir(shouldSaveToOutputDir);
            }}
            onExport={exportActiveOrganizationPlan}
            onAddExternalPages={addExternalPagesFromOpenDocument}
            onDismissExportFeedback={() => setExportFeedback(null)}
            onRemoveMissingSourcePages={removeMissingSourcePages}
          />
        ) : (
          <EmptyState status={status} mode={workspaceMode} />
          )}
        </section>

        {isPropertiesPanelVisible ? <aside className="properties-panel" aria-label="Propriétés">
          <button type="button" className="properties-panel__resize" aria-label="Redimensionner les propriétés" onMouseDown={startPropertiesResize} />
          <header className="properties-panel__header">
            <div><span>Inspecteur</span><h2>Propriétés</h2></div>
            <button type="button" aria-label="Masquer les propriétés" title="Masquer les propriétés" onClick={() => setIsPropertiesPanelVisible(false)}>❯</button>
          </header>
          {workspaceMode === "read" && activeEditingTool === "link" && activeDocument ? <section aria-label="Lien">
            {linkDraft ? <LinkInspector key={linkDraft.id} edit={linkDraft} pageCount={activeDocument.pageCount}
              onSave={(edit) => {
                setLinkDraft(null);
                if (JSON.stringify(edit) === JSON.stringify(linkDraft)) return;
                const exists = activePdfEdits.some((item) => item.id === edit.id);
                dispatchPdfEdits({ type: exists ? "replace" : "add", documentId: activeDocument.id, edit });
                setExportFeedback(null);
              }}
              onDelete={linkDraft.destination ? () => {
                if (linkDraft.sourceXref !== undefined) {
                  const exists = activePdfEdits.some((item) => item.id === linkDraft.id);
                  dispatchPdfEdits({ type: exists ? "replace" : "add", documentId: activeDocument.id, edit: { ...linkDraft, destination: null } });
                } else deletePdfEdit(linkDraft.id);
                setLinkDraft(null);
                setExportFeedback(null);
              } : undefined}
              onCancel={() => setLinkDraft(null)}
            /> : <p>Tracez un rectangle pour ajouter un lien, ou cliquez sur un lien pour le modifier. Les destinations nommées et certaines actions PDF sont en lecture seule.</p>}
          </section> : null}
          {workspaceMode === "read" && activeEditingTool === "watermark" ? (
            <WatermarkComposer key={activeDocument?.id} previewReady={watermarkPreview?.documentId === activeDocument?.id && Boolean(watermarkPreview?.edits.length)}
              onPreview={previewWatermark} onClear={clearWatermarkPreview}
              onCancel={() => { clearWatermarkPreview(); setActiveEditingTool("select"); }}
              onApply={() => {
                if (!activeDocument || watermarkPreview?.documentId !== activeDocument.id) return;
                const existing = getDocumentEditingState(pdfEditsByDocument, activeDocument.id).edits;
                const add = watermarkPreview.edits.filter((candidate) => !existing.some((edit) => edit.type === "stamp" && edit.purpose === "watermark" && edit.page === candidate.page && edit.text === candidate.text && edit.color === candidate.color && edit.rotation === candidate.rotation && edit.opacity === candidate.opacity && (edit.watermarkMode ?? "single") === (candidate.watermarkMode ?? "single") && JSON.stringify(edit.tile) === JSON.stringify(candidate.tile) && edit.fontSize === candidate.fontSize && edit.fontFamily === candidate.fontFamily));
                dispatchPdfEdits({ type: "batch", documentId: activeDocument.id, add });
                setSelectedEditId(add[0]?.id ?? null); clearWatermarkPreview(); setActiveEditingTool("select");
              }} />
          ) : workspaceMode === "read" && activeDocument && activeSearch.isOpen && redactionSearchDocumentId === activeDocument.id ? (
            <RedactionSearchPanel search={activeSearch}
              currentPage={(activeOrganizationPlan?.pages.find((page) => page.displayPageNumber === activePageNumber)?.sourcePageIndex ?? activePageNumber - 1) + 1}
              onQuery={updatePdfSearchQuery} onOptions={updatePdfSearchOptions} onNavigate={selectPdfSearchHit}
              onClose={() => { closePdfSearch(); setRedactionSearchDocumentId(null); }}
              onCreate={async (hits, signal) => {
                const target = activeDocument;
                const edits = await prepareSearchRedactions(target.file, backendUrl, hits, getDocumentEditingState(pdfEditsByDocument, target.id).edits, signal);
                if (signal.aborted || documentsRef.current.every((document) => document.id !== target.id)) throw new Error("Le document n’est plus ouvert ; aucune zone créée.");
                dispatchPdfEdits({ type: "batch", documentId: target.id, add: edits });
                setSelectedEditId(null);
                return edits.length;
              }} />
          ) : workspaceMode === "read" && selectedPdfEdit?.type === "stamp" ? (
            <StampInspector edit={selectedPdfEdit} onUpdate={(edit, key) => updatePdfEdit(edit, key ? `${edit.id}:${key}` : undefined)} onFinish={(key) => finishPdfEditCoalescing(selectedPdfEdit.id, key)} onDelete={() => deletePdfEdit(selectedPdfEdit.id)} onDeleteGroup={selectedPdfEdit.purpose === "watermark" && selectedPdfEdit.groupId ? () => {
              if (!activeDocument) return;
              const deleteIds = activePdfEdits.filter((edit) => edit.type === "stamp" && edit.groupId === selectedPdfEdit.groupId).map((edit) => edit.id);
              dispatchPdfEdits({ type: "batch", documentId: activeDocument.id, deleteIds }); setSelectedEditId(null);
            } : undefined} />
          ) : workspaceMode === "read" && activeEditingTool === "stamp" ? (
            <section className="shape-edit-toolbar" aria-label="Bibliothèque de tampons">
              <strong>Tampon visuel</strong>
              <label>Tampon prédéfini<select aria-label="Tampon prédéfini" value={STAMP_PRESETS.includes(stampLabel as typeof STAMP_PRESETS[number]) ? stampLabel : "custom"} onChange={(event) => setStampLabel(event.target.value === "custom" ? "" : event.target.value)}>{STAMP_PRESETS.map((label) => <option key={label}>{label}</option>)}<option value="custom">Personnalisé</option></select></label>
              <label>Texte personnalisé<input aria-label="Texte personnalisé du tampon" maxLength={170} value={stampLabel} onChange={(event) => setStampLabel(event.target.value)} /></label>
              <label><input type="checkbox" checked={stampWithDate} onChange={(event) => setStampWithDate(event.target.checked)} />Date à l’insertion (UTC)</label>
              <p>Cliquez sur une page pour placer le tampon. La date reste figée.</p>
              <button type="button" disabled={activeOrganizationPlan?.pages.find((page) => page.displayPageNumber === activePageNumber)?.sourceDocumentId !== activeDocument?.id} onClick={() => stampImageInputRef.current?.click()}>Tampon image PNG ou JPEG</button>
              <p>Image locale insérée sur la page active. Ce marquage ne constitue pas une signature électronique.</p>
            </section>
          ) : workspaceMode === "read" && activeEditingTool === "visual_mask" ? (
            <section className="properties-panel__empty"><strong>Masquage visuel (réversible)</strong><p>Ce masque ne supprime pas les informations : elles peuvent être copiées ou récupérées. Pour cacher des données sensibles, utiliser Biffage sécurisé.</p><p>Tracez un rectangle ; ajustez ensuite ses propriétés.</p></section>
          ) : workspaceMode === "read" && (activeEditingTool === "redaction" || selectedPdfEdit?.type === "redaction") ? (
            <section className="properties-panel__empty" aria-label="Biffage sécurisé">
              <strong>Biffage sécurisé · En attente</strong>
              <button type="button" onClick={() => { if (!activeDocument) return; if (activeOrganizationPlan?.pages.some((page) => page.sourceDocumentId !== activeDocument.id)) { setExportFeedback({ kind: "error", message: "Recherche de biffage : ouvrez chaque PDF source avant la composition multi-document." }); return; } setRedactionSearchDocumentId(activeDocument.id); updatePdfSearchOptions({ geometryProof: true }); openPdfSearch(); }}>Rechercher et biffer…</button>
              <p>Tracez des rectangles. Le biffage ne devient irréversible que dans le PDF exporté.</p>
              <p>Le biffage par zones ne supprime pas les données ailleurs dans le document, notamment les métadonnées.</p>
              {selectedPdfEdit?.type === "redaction" ? <button type="button" onClick={() => deletePdfEdit(selectedPdfEdit.id)}>Supprimer le biffage</button> : null}
            </section>
          ) : workspaceMode === "read" && (selectedTextEdit || selectedNativeTextEdit) ? (
            <TextEditToolbar
              edit={(selectedTextEdit ?? selectedNativeTextEdit)!}
              onUpdate={(patch) =>
                updatePdfEdit({ ...(selectedTextEdit ?? selectedNativeTextEdit)!, ...patch } as PdfEdit)
              }
              onDelete={() => deletePdfEdit((selectedTextEdit ?? selectedNativeTextEdit)!.id)}
              onLibraryChange={() => setFontLibraryRevision((revision) => revision + 1)}
            />
          ) : workspaceMode === "read" && selectedShapeEdit ? (
            <ShapeEditToolbar
              edit={selectedShapeEdit}
              eyedropperTarget={eyedropperTarget}
              onUpdate={(patch, coalesceKey) =>
                updatePdfEdit(
                  { ...selectedShapeEdit, ...patch },
                  coalesceKey ? `${selectedShapeEdit.id}:${coalesceKey}` : undefined,
                )
              }
              onFinishUpdate={(coalesceKey) => finishPdfEditCoalescing(selectedShapeEdit.id, coalesceKey)}
              onPickColor={(target) =>
                setEyedropperTarget((currentTarget) =>
                  currentTarget === target ? null : target,
                )
              }
              onDelete={() => deletePdfEdit(selectedShapeEdit.id)}
            />
          ) : workspaceMode === "read" && freehandInspectorEdit ? (
            <FreehandEditToolbar
              edit={freehandInspectorEdit}
              onUpdate={(patch, coalesceKey) => {
                const edit = { ...freehandInspectorEdit, ...patch };
                if (edit.style) {
                  setFreehandToolStyle({
                    ...edit.style,
                    opacity: edit.style.opacity ?? 1,
                  });
                }
                if (selectedFreehandEdit) {
                  updatePdfEdit(
                    edit,
                    coalesceKey ? `${selectedFreehandEdit.id}:${coalesceKey}` : undefined,
                  );
                }
              }}
              onFinishUpdate={(coalesceKey) => {
                if (selectedFreehandEdit) {
                  finishPdfEditCoalescing(selectedFreehandEdit.id, coalesceKey);
                }
              }}
              onDelete={selectedFreehandEdit ? () => deletePdfEdit(selectedFreehandEdit.id) : undefined}
            />
          ) : workspaceMode === "read" && selectedTextMarkupEdit ? (
            <section className="shape-edit-toolbar" aria-label="Propriétés de l'annotation texte"><strong>{selectedTextMarkupEdit.kind === "highlight" ? "Surlignage" : selectedTextMarkupEdit.kind === "underline" ? "Soulignement" : "Barré"}</strong><ColorPicker label="Couleur de l'annotation" value={selectedTextMarkupEdit.color} onChange={(color) => updatePdfEdit({ ...selectedTextMarkupEdit, color })} /><button type="button" onClick={() => deletePdfEdit(selectedTextMarkupEdit.id)}>Supprimer l'annotation</button></section>
          ) : workspaceMode === "read" && selectedCommentEdit ? (
            <CommentInspector edit={selectedCommentEdit} onUpdate={updatePdfEdit} onDelete={() => deletePdfEdit(selectedCommentEdit.id)} />
          ) : (selectedPdfEdit?.type === "signature" || selectedPdfEdit?.type === "image") ? (
            <section className="properties-panel__empty">
              <strong>{selectedPdfEdit.type === "image" ? "Image" : "Signature graphique"}</strong>
              <p>Déplacez ou redimensionnez l’image directement sur la page. Shift conserve le ratio.</p>
              {selectedPdfEdit.type === "image" ? <label><input type="checkbox" checked={selectedPdfEdit.aspectLocked ?? true} onChange={(event) => updatePdfEdit({ ...selectedPdfEdit, aspectLocked: event.target.checked })} />Conserver les proportions</label> : null}
              <button type="button" onClick={() => deletePdfEdit(selectedPdfEdit.id)}>
                Supprimer {selectedPdfEdit.type === "image" ? "l’image" : "la signature"}
              </button>
            </section>
          ) : (
            <section className="properties-panel__empty">
              <strong>{workspaceMode === "organize" ? "Organisation" : "Document"}</strong>
              {activeDocument?.media?.kind === "image" ? <>
                <p>Image · {activeDocument.media.mimeType.slice(6).toUpperCase()} · {activeDocument.media.widthPx} × {activeDocument.media.heightPx} px · ratio {(activeDocument.media.widthPx / activeDocument.media.heightPx).toFixed(2)}</p>
                <p>Le projet conserve l’original et les modifications localement. Exporter en PDF crée une copie ; le texte dans les pixels reste une image.</p>
                <button type="button" disabled={activeImagePending && !imageBackgroundError} onClick={() => setIsImageDocumentOpen(true)}>Éditer le fond image…</button>
                <button type="button" disabled={isExporting || activeImagePending} onClick={openActiveSaveAsDialog}>Exporter en PDF</button>
              </> : null}
              <p>
                {activeDocument
                  ? `${activeOrganizationPlan?.pages.length ?? activeDocument.pageCount} page${(activeOrganizationPlan?.pages.length ?? activeDocument.pageCount) > 1 ? "s" : ""}`
                  : "Aucun document ouvert"}
              </p>
              <span>
                {workspaceMode === "organize"
                  ? "Réorganisez les pages sans enregistrer automatiquement."
                  : "Sélectionnez un élément pour afficher ses réglages."}
              </span>
            </section>
          )}
          <LayerControls edits={activeDocumentEditingState?.edits ?? []} page={(activeOrganizationPlan?.pages.find((page) => page.displayPageNumber === activePageNumber)?.sourcePageIndex ?? -1) + 1} selectedId={selectedEditId} onSelect={setSelectedEditId} onReorder={(editId, direction) => activeDocument && dispatchPdfEdits({ type: "reorder", documentId: activeDocument.id, editId, direction })} />
        </aside> : <button type="button" className="properties-panel-toggle" aria-label="Afficher les propriétés" title="Afficher les propriétés" onClick={() => setIsPropertiesPanelVisible(true)}>❮</button>}
      </section>

      {textMarkupSelection && viewerMode !== "presentation" ? createPortal(
        <div ref={textMarkupToolbarRef} className="floating-surface text-markup-toolbar" role="toolbar" aria-label="Annotations du texte">
          <button type="button" title="Surligner" aria-label="Surligner" onClick={() => addTextMarkupEdit("highlight", textMarkupColor)}><ToolbarIcon name="highlight" /></button>
          <button type="button" title="Souligner" aria-label="Souligner" onClick={() => addTextMarkupEdit("underline", textMarkupColor)}><ToolbarIcon name="underline" /></button>
          <button type="button" title="Barrer" aria-label="Barrer" onClick={() => addTextMarkupEdit("strikeout", textMarkupColor)}><ToolbarIcon name="strikeout" /></button>
          <button type="button" title="Ajouter un lien à la sélection" aria-label="Ajouter un lien à la sélection"
            disabled={textMarkupSelection.rects.length > 256}
            onClick={() => {
              const { page, rects: areas } = textMarkupSelection;
              const rect = {
                x0: Math.min(...areas.map((area) => area.x0)),
                y0: Math.min(...areas.map((area) => area.y0)),
                x1: Math.max(...areas.map((area) => area.x1)),
                y1: Math.max(...areas.map((area) => area.y1)),
              };
              setActiveEditingTool("link");
              setLinkDraft({ type: "link", id: crypto.randomUUID(), page, rect, areas, destination: null });
              setIsPropertiesPanelVisible(true);
              setTextMarkupSelection(null);
              window.getSelection()?.removeAllRanges();
            }}><ToolbarIcon name="link" /></button>
          <ColorPicker compact label="Couleur de l'annotation" value={textMarkupColor} onChange={setTextMarkupColor} />
        </div>, document.body) : null}

      <footer className="status-bar" aria-label="État du document">
        <span>
          {activeDocument
            ? `Page ${activePageNumber} / ${activeOrganizationPlan?.pages.length ?? activeDocument.pageCount}`
            : "Aucun document"}
        </span>
        <span
          className="status-bar__document"
          title={activeDocument?.fileName}
        >
          {activeDocument?.fileName ?? ""}{activeDocument?.sessionOnly ? " · Session temporaire" : ""}
        </span>
        <div className="page-controls" aria-label="Affichage et zoom">
          <label className="viewer-mode-control">
            <span className="sr-only">Mode d'affichage</span>
            <select
              value={viewerMode}
              onChange={(event) => {
                changeViewerMode(event.target.value as ViewerMode);
                // A native select keeps focus after selection and would otherwise
                // intentionally suppress the global page-navigation shortcuts.
                event.currentTarget.blur();
              }}
              disabled={!activeDocument || workspaceMode === "organize"}
              aria-label="Mode d'affichage"
              title="Choisir le mode d'affichage"
            >
              <option value="continuous">Continu</option>
              <option value="single-page">Page unique</option>
              <option value="facing">Double page</option>
              <option value="adaptive">Multipage automatique</option>
              <option value="presentation">Présentation</option>
            </select>
          </label>
          <div className="zoom-controls" role="group" aria-label="Zoom">
            <button
              type="button"
              className="zoom-controls__fit"
              onClick={() => {
                if (activeDocument) {
                  setFitToPageByDocument((currentModes) => ({ ...currentModes, [activeDocument.id]: true }));
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || viewerMode === "continuous" || viewerMode === "adaptive"}
              aria-label="Ajuster à la page"
              title="Ajuster la page à l'espace disponible"
            >
              Ajuster
            </button>
            <button
              type="button"
              onClick={() => {
                if (activeDocument) {
                  updateDocumentZoom(activeDocument.id, -ZOOM_STEP);
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || activeDocument.zoom <= MIN_ZOOM}
              aria-label="Réduire le zoom"
              title="Réduire le zoom"
            >
              −
            </button>
            <span className="zoom-value" data-testid="zoom-level" aria-live="polite">
              {activeDocument ? `${Math.round(activeDocument.zoom * 100)}%` : "—"}
            </span>
            <button
              type="button"
              onClick={() => {
                if (activeDocument) {
                  updateDocumentZoom(activeDocument.id, ZOOM_STEP);
                }
              }}
              disabled={!activeDocument || workspaceMode === "organize" || activeDocument.zoom >= MAX_ZOOM}
              aria-label="Augmenter le zoom"
              title="Augmenter le zoom"
            >
              +
            </button>
          </div>
        </div>
      </footer>
    </main>
  );
}
