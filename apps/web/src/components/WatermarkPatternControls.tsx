import { useLocale } from "../viewer/locale";
import type { StampEdit } from "../editing/types";
import { DEFAULT_TILE, TILE_PRESETS } from "../editing/watermarkTiling";
import { PropertySlider } from "./PropertySlider";

type Pattern = Pick<StampEdit, "watermarkMode" | "tile" | "fontSize" | "fontSizeMode" | "color">;
export function WatermarkPatternControls({ value, onChange, onFinish }: { value: Pattern; onChange: (patch: Partial<Pattern>, key?: string) => void; onFinish: (key: string) => void }) {
  const { t: localize } = useLocale();
  const tile = { ...DEFAULT_TILE, ...value.tile };
  const density = Object.entries(TILE_PRESETS).find(([, preset]) => preset.horizontalGapPt === tile.horizontalGapPt && preset.verticalGapPt === tile.verticalGapPt)?.[0] ?? "custom";
  return <>
    <label>{localize("Mode du filigrane")}<select aria-label={localize("Mode du filigrane")} value={value.watermarkMode ?? "single"} onChange={(event) => onChange({ watermarkMode: event.target.value as "single" | "tiled", ...(event.target.value === "tiled" ? { fontSize: 18, fontSizeMode: "manual", tile } : { fontSizeMode: "fit" }) })}><option value="single">{localize("Unique")}</option><option value="tiled">{localize("Répété")}</option></select></label>
    {value.watermarkMode === "tiled" ? <>
      <label>{localize("Densité")}<select aria-label={localize("Densité du filigrane")} value={density} onChange={(event) => { const preset = TILE_PRESETS[event.target.value as keyof typeof TILE_PRESETS]; if (preset) onChange({ tile: { ...tile, ...preset } }); }}>
        {Object.keys(TILE_PRESETS).map((name) => <option key={name} value={name}>{localize(name)}</option>)}<option value="custom">{localize("Personnalisée")}</option>
      </select></label>
      <PropertySlider label={localize("Taille du motif")} value={value.fontSize} min={6} max={144} step={1} unit="pt" color={value.color} previewLabel={localize("Taille")} onChange={(fontSize) => onChange({ fontSize }, "fontSize")} onCommit={() => onFinish("fontSize")} />
      <details><summary>{localize("Espacements et phase (points PDF)")}</summary>
        {([ ["horizontalGapPt", "Écart horizontal", 8, 720], ["verticalGapPt", "Écart entre lignes", 8, 720], ["offsetXPt", "Phase X", -720, 720], ["offsetYPt", "Phase Y", -720, 720] ] as const).map(([field, label, min, max]) => <PropertySlider key={field} label={label} value={tile[field]} min={min} max={max} step={1} unit="pt" color={value.color} previewLabel={label} onChange={(number) => onChange({ tile: { ...tile, [field]: number } }, field)} onCommit={() => onFinish(field)} />)}
        <button type="button" onClick={() => onChange({ tile: { ...tile, offsetXPt: 0, offsetYPt: 0 } })}>{localize("Centrer le motif")}</button>
      </details>
      <p>{localize("Un seul motif par page, clippé aux bords. Maximum 800 répétitions ; augmentez les espacements si le motif est trop dense.")}</p>
    </> : null}
  </>;
}
