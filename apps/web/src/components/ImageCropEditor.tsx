import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageCrop } from "../editing/types";

type Handle = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function ImageCropEditor({ initial, onApply, onCancel, rotation = 0 }: {
  initial: ImageCrop; onApply: (crop: ImageCrop) => void; onCancel: () => void; rotation?: number;
}) {
  const [crop, setCrop] = useState(initial);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; crop: ImageCrop; handle: Handle } | null>(null);
  useEffect(() => {
    surface.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onCancel]);
  const start = (event: React.PointerEvent<HTMLElement>, handle: Handle) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    surface.current?.setPointerCapture?.(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, crop, handle };
  };
  return <>
    <div ref={surface} tabIndex={0} className="image-crop-surface" role="group" aria-label="Cadre de rognage"
      onPointerDown={(event) => start(event, "move")}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => {
        const state = drag.current, box = surface.current?.getBoundingClientRect();
        if (!state || state.pointerId !== event.pointerId || !box?.width || !box.height) return;
        const sx = (event.clientX - state.x) / box.width, sy = (event.clientY - state.y) / box.height;
        const angle = (rotation + 360) % 360;
        const [dx, dy] = angle === 90 ? [sy, -sx] : angle === 180 ? [-sx, -sy] : angle === 270 ? [-sy, sx] : [sx, sy];
        const old = state.crop;
        if (state.handle === "move") {
          setCrop({ ...old, x: clamp(old.x + dx, 0, 1 - old.width), y: clamp(old.y + dy, 0, 1 - old.height) });
          return;
        }
        let x0 = old.x, x1 = old.x + old.width, y0 = old.y, y1 = old.y + old.height;
        if (state.handle.includes("w")) x0 = clamp(x0 + dx, 0, x1 - 0.01);
        if (state.handle.includes("e")) x1 = clamp(x1 + dx, x0 + 0.01, 1);
        if (state.handle.includes("n")) y0 = clamp(y0 + dy, 0, y1 - 0.01);
        if (state.handle.includes("s")) y1 = clamp(y1 + dy, y0 + 0.01, 1);
        setCrop({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="image-crop-frame" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}>
        {handles.map((handle) => <button key={handle} type="button" className={`image-crop-handle image-crop-handle--${handle}`} aria-label={`Rogner ${handle}`}
          onPointerDown={(event) => start(event, handle)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 0.05 : 0.01;
            if (event.key === "ArrowLeft") setCrop({ ...crop, x: Math.max(0, crop.x - step) });
            else if (event.key === "ArrowRight") setCrop({ ...crop, x: Math.min(1 - crop.width, crop.x + step) });
            else if (event.key === "ArrowUp") setCrop({ ...crop, y: Math.max(0, crop.y - step) });
            else if (event.key === "ArrowDown") setCrop({ ...crop, y: Math.min(1 - crop.height, crop.y + step) });
            else return;
            event.preventDefault(); event.stopPropagation();
          }} />)}
      </div>
    </div>
    {createPortal(<div className="image-crop-actions" role="toolbar" aria-label="Rognage de l’image">
      <span>Rognage · déplacez le cadre ou ses poignées</span>
      <button type="button" onClick={() => onApply(crop)}>Valider le rognage</button>
      <button type="button" onClick={onCancel}>Annuler le rognage</button>
    </div>, document.body)}
  </>;
}
