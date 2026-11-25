export type ToolbarIconName =
  | "save-as"
  | "open"
  | "select"
  | "settings"
  | "text"
  | "signature"
  | "shape"
  | "freehand"
  | "link"
  | "comment"
  | "organize"
  | "ocr"
  | "conversion"
  | "undo"
  | "redo"
  | "pencil" | "shield" | "image" | "edit-text"
  | "redaction" | "visual-mask" | "watermark" | "stamp"
  | "rectangle" | "square" | "ellipse" | "circle" | "line" | "arrow"
  | "highlight" | "underline" | "strikeout"
  | "read" | "check" | "list" | "chevron-left" | "chevron-right";

export function ToolbarIcon({ name, className = "" }: { name: ToolbarIconName; className?: string }) {
  return (
    <svg
      className={`toolbar-icon ${className}`.trim()}
      data-icon={name}
      aria-hidden="true"
      viewBox="0 0 20 20"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "link" ? <><path d="m8 12 4-4m-6 2-2 2a3 3 0 0 0 4 4l2-2m0-8 2-2a3 3 0 0 1 4 4l-2 2" /></> : null}
      {name === "pencil" ? <><path d="m4 13 9-9 3 3-9 9-4 1z" /><path d="m11 6 3 3" /></> : null}
      {name === "shield" ? <><path d="M10 2 17 5v5c0 4-4 6-7 8-3-2-7-4-7-8V5z" /><path d="m6.5 9.5 2.5 2.5 4.5-5" /></> : null}
      {name === "image" ? <><rect x="3" y="3" width="14" height="14" rx="1" /><circle cx="7" cy="7" r="1" /><path d="m3 14 4-4 3 3 3-5 4 6" /></> : null}
      {name === "edit-text" ? <><path d="M3 6V3h9v3M7.5 3v14M5 17h5" /><path d="m12 13 4-4 2 2-4 4-3 1z" /></> : null}
      {name === "redaction" ? <><rect x="3" y="5" width="14" height="10" rx="1" /><path d="m4 13 7-7M8 14l8-8M12 14l4-4" /></> : null}
      {name === "visual-mask" ? <><rect x="3" y="4" width="14" height="12" rx="1" /><path d="M3 8h14M7 8v8M3 3l14 14" /></> : null}
      {name === "watermark" ? <><path d="M5 6V4h10v2M10 4v14M7 18h6" transform="rotate(-30 10 10)" /><path d="M3 18h14" /></> : null}
      {name === "stamp" ? <><path d="M4 13h12l1 3H3zM3 18h14M7 13V9c0-2-1-3-1-4a4 4 0 0 1 8 0c0 1-1 2-1 4v4" /></> : null}
      {name === "rectangle" ? <rect x="2" y="5" width="16" height="10" rx="1" /> : null}
      {name === "square" ? <rect x="3" y="3" width="14" height="14" rx="1" /> : null}
      {name === "ellipse" ? <ellipse cx="10" cy="10" rx="8" ry="5" /> : null}
      {name === "circle" ? <circle cx="10" cy="10" r="7" /> : null}
      {name === "line" ? <path d="m3 17 14-14" /> : null}
      {name === "arrow" ? <path d="m3 17 14-14M8 3h9v9" /> : null}
      {name === "read" ? <><path d="M4 2h9l3 3v13H4zM12 2v4h4M7 10h6M7 14h6" /></> : null}
      {name === "highlight" ? <path d="m5 11 7-7 4 4-7 7H5v-4Zm0 4-2 2h5m2-11 4 4" /> : null}
      {name === "underline" ? <path d="M5 3v7a5 5 0 0 0 10 0V3M4 18h12" /> : null}
      {name === "strikeout" ? <path d="M15 5c-1-1-3-2-5-2-3 0-5 1.5-5 3.5 0 4 10 2 10 7 0 2-2 3.5-5 3.5-2 0-4-1-5-2M3 10h14" /> : null}
      {name === "list" ? <path d="M3 4h14M3 10h14M3 16h14" /> : null}
      {name === "chevron-left" ? <path d="m12 4-6 6 6 6" /> : null}
      {name === "chevron-right" ? <path d="m8 4 6 6-6 6" /> : null}
      {name === "check" ? <path d="m4 10 4 4 8-8" /> : null}
      {name === "save-as" ? (
        <>
          <path d="M4 3h10l2 2v12H4z" />
          <path d="M7 3v5h6V3" />
          <path d="M7 17v-5h6v5" />
        </>
      ) : null}
      {name === "open" ? <><path d="M3 6h5l1.5 2H17v8H3z" /><path d="M10 11h5m-2.5-2.5v5" /></> : null}
      {name === "text" ? (
        <>
          <path d="M4 6V3h12v3" />
          <path d="M10 3v14" />
          <path d="M7 17h6" />
        </>
      ) : null}
      {name === "settings" ? <><circle cx="10" cy="10" r="2.5" /><path d="M8 2h4l.6 2.4 2 .9 2.2-.8 2 3.5-1.8 1.6v1.8l1.8 1.6-2 3.5-2.2-.8-2 .9L12 18H8l-.6-2.4-2-.9-2.2.8-2-3.5 1.8-1.6V9.6L1.2 8l2-3.5 2.2.8 2-.9Z" /></> : null}
      {name === "select" ? (
        <path d="m5 3 9.5 8.1-4.2.8 2.3 4.1-2.4 1.3-2.2-4-3 3z" />
      ) : null}
      {name === "signature" ? (
        <>
          <path d="M3 14c2.4-4.8 3.9-7.2 5.1-7.2 1.9 0-.9 7.5.8 7.5 1.1 0 2.1-3.5 3.2-3.5.7 0 .2 3.2 1.2 3.2.6 0 1.4-1.4 2.1-1.4.6 0 .7.8 1.6.8" />
          <path d="M3 17h14" />
        </>
      ) : null}
      {name === "shape" ? (
        <>
          <rect x="3" y="4" width="7" height="7" rx="1" />
          <circle cx="13.5" cy="13.5" r="3.5" />
        </>
      ) : null}
      {name === "freehand" ? <path d="M3 15c2-6 3.5-8 5-8 1.8 0-.8 7 1 7 1.5 0 2-5 3.4-5 .9 0-.1 4 1.3 4 .8 0 1.2-1.3 2.3-1.3M3 17h14" /> : null}
      {name === "comment" ? <path d="M3 3h14v10H8l-5 4V3Z" /> : null}
      {name === "organize" ? (
        <>
          <rect x="3" y="3" width="5" height="6" rx="1" />
          <rect x="12" y="3" width="5" height="6" rx="1" />
          <rect x="7.5" y="11" width="5" height="6" rx="1" />
        </>
      ) : null}
      {name === "ocr" ? (
        <>
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
          <path d="M6 10h8M10 6v8" />
        </>
      ) : null}
      {name === "conversion" ? (
        <>
          <path d="M3 7h11m-3-3 3 3-3 3" />
          <path d="M17 13H6m3-3-3 3 3 3" />
        </>
      ) : null}
      {name === "undo" ? (
        <path d="M7 6 3.5 9.5 7 13M4 9.5h6a5 5 0 0 1 5 5" />
      ) : null}
      {name === "redo" ? (
        <path d="m13 6 3.5 3.5L13 13m3-3.5h-6a5 5 0 0 0-5 5" />
      ) : null}
    </svg>
  );
}
