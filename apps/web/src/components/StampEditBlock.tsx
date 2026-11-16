import { useEffect } from "react";
import { ensureFontLoaded } from "../fonts/fontRegistry";
import { layoutStamp, stampFonts, stampPalette } from "../editing/stampLayout";
import type { PageViewport } from "pdfjs-dist";
import type { PdfRect, SignatureImage, StampEdit } from "../editing/types";
import { stampRotationFit } from "../editing/stamps";
import { ShapeEditBlock } from "./ShapeEditLayer";

export function StampEditBlock({ edit, image, viewport, selected, onSelect, onMove }: { edit: StampEdit; image?: SignatureImage; viewport: PageViewport; selected: boolean; onSelect: () => void; onMove: (rect: PdfRect) => void }) {
  const width = edit.rect.x1 - edit.rect.x0, height = edit.rect.y1 - edit.rect.y0;
  const modern = edit.layoutVersion === 2 && !edit.imageId;
  const palette = stampPalette(edit);
  const layout = modern ? layoutStamp(edit, width, height) : null;
  useEffect(() => { if (modern) void ensureFontLoaded(stampFonts[edit.fontFamily].fontRef).catch(() => undefined); }, [modern, edit.fontFamily]);
  const fit = stampRotationFit(width, height, edit.rotation);
  const font = { Helvetica: "Arial, sans-serif", Times: "Times New Roman, serif", Courier: "Courier New, monospace" }[edit.fontFamily];
  const align = edit.align ?? "center";
  const ascender = { Helvetica: 1.07, Times: 1.044, Courier: 1.007 }[edit.fontFamily];
  return <ShapeEditBlock edit={{ ...edit, type: "shape", shapeType: "rectangle", style: { strokeColor: edit.color, strokeWidth: 0, fillColor: null, opacity: 0 } }} label={`Tampon page ${edit.page}`} viewport={viewport} selected={selected} onSelect={onSelect} onMove={onMove}>
    <svg className="pdf-stamp-content" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <g opacity={edit.opacity} transform={`translate(${width / 2} ${height / 2}) scale(${fit}) rotate(${edit.rotation}) translate(${-width / 2} ${-height / 2})`}>
        {modern && (edit.fillOpacity ?? 0) > 0 ? <rect x={0} y={0} width={width} height={height} fill={palette.fill} fillOpacity={edit.fillOpacity} /> : null}
        {layout ? layout.lines.map((line, index) => <text key={index} x={line.x} y={line.y} fontSize={layout.fontSize} fontFamily={stampFonts[edit.fontFamily].cssFamily} fontWeight="400" fill={palette.text} fillOpacity={edit.textOpacity ?? 1} textLength={line.advance || undefined} lengthAdjust="spacing">{line.text}</text>) : edit.imageId ? image ? <image href={image.dataUrl} width={width} height={height} preserveAspectRatio="none" /> : <text x={8} y={24}>Image indisponible</text> : edit.text.split("\n").map((line, index) => <text key={index} x={align === "left" ? 8 : align === "right" ? width - 8 : width / 2} y={8 + edit.fontSize * ascender + index * edit.fontSize * 1.4} textAnchor={align === "left" ? "start" : align === "right" ? "end" : "middle"} fontSize={edit.fontSize} fontFamily={font} fontWeight="bold" fill={edit.color}>{line}</text>)}
        {edit.border ? <rect x={1} y={1} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} fill="none" stroke={modern ? palette.border : edit.color} strokeWidth={modern ? edit.borderWidth ?? 2 : 2} strokeOpacity={modern ? edit.borderOpacity ?? 1 : 1} /> : null}
      </g>
    </svg>
  </ShapeEditBlock>;
}
