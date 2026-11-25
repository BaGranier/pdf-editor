import { useLocale } from "../viewer/locale";
import type { StampEdit } from "../editing/types";
import { StampStyleControls } from "./StampStyleControls";
import { WatermarkProperties } from "./WatermarkProperties";
import { ColorPicker } from "./ColorPicker";
import { PropertySlider } from "./PropertySlider";

export function StampInspector({ edit, onUpdate, onFinish, onDelete, onDeleteGroup }: { edit: StampEdit; onUpdate: (edit: StampEdit, key?: string) => void; onFinish: (key: string) => void; onDelete: () => void; onDeleteGroup?: () => void }) {
  const { t: localize } = useLocale();
  const watermark = edit.purpose === "watermark";
  const noun = watermark ? "filigrane" : "tampon";
  return <section className="shape-edit-toolbar" aria-label={localize("Propriétés du {0}", localize(noun))}>
    <strong>{watermark ? localize("Filigrane non destructif") : localize("Tampon visuel")}</strong>
    <p>{watermark ? localize("Ce marquage laisse les données d’origine récupérables.") : localize("Ce marquage ne constitue pas une signature électronique ni une certification.")}</p>
    {!edit.imageId ? <>
      <label>{localize("Libellé du ")}{noun}<textarea aria-label={localize("Libellé du {0}", localize(noun))} maxLength={200} value={edit.text} onChange={(event) => onUpdate({ ...edit, text: event.target.value }, "text")} onBlur={() => onFinish("text")} /></label>
      {!watermark ? <label>{localize("Alignement du tampon")}<select aria-label={localize("Alignement du tampon")} value={edit.align ?? "center"} onChange={(event) => onUpdate({ ...edit, align: event.target.value as StampEdit["align"] })}><option value="left">{localize("Gauche")}</option><option value="center">{localize("Centré")}</option><option value="right">{localize("Droite")}</option></select></label> : null}
      <label>{localize("Police du ")}{noun}<select aria-label={localize("Police du {0}", localize(noun))} value={edit.fontFamily} onChange={(event) => onUpdate({ ...edit, fontFamily: event.target.value as StampEdit["fontFamily"] })}>{["Helvetica", "Times", "Courier"].map((font) => <option key={font}>{font}</option>)}</select></label>
      <p>{edit.layoutVersion === 2 ? localize("Polices embarquées : Noto Sans, Liberation Serif et Liberation Mono.") : localize("Polices PDF standard ; repli écran Arial, Times New Roman ou Courier New.")}{localize(" Caractères Latin-1 (sans € ni Œ).")}</p>
      {watermark ? <WatermarkProperties edit={edit} onUpdate={onUpdate} onFinish={onFinish} /> : <StampStyleControls edit={edit} onUpdate={onUpdate} onFinish={onFinish} />}
      {edit.fontSizeMode !== "fit" && edit.watermarkMode !== "tiled" ? <PropertySlider label={localize("Taille du texte du {0}", localize(noun))} value={edit.fontSize} min={6} max={144} step={1} unit="pt" color={edit.color} previewLabel={localize("Taille du texte")} onChange={(fontSize) => onUpdate({ ...edit, fontSize }, "fontSize")} onCommit={() => onFinish("fontSize")} /> : null}
    </> : null}
    <ColorPicker label={localize("Couleur du {0}", localize(noun))} value={edit.color} onChange={(color) => onUpdate({ ...edit, color })} />
    <PropertySlider signed={watermark} label={localize("Rotation du {0}", localize(noun))} value={edit.rotation} min={-180} max={180} step={1} unit="°" color={edit.color} previewLabel="Rotation" onChange={(rotation) => onUpdate({ ...edit, rotation }, "rotation")} onCommit={() => onFinish("rotation")} />
    <PropertySlider label={localize("Opacité du {0}", localize(noun))} value={Math.round(edit.opacity * 100)} min={0} max={100} step={1} unit="%" color={edit.color} opacity={edit.opacity} previewLabel={localize("Opacité")} onChange={(opacity) => onUpdate({ ...edit, opacity: opacity / 100 }, "opacity")} onCommit={() => onFinish("opacity")} />
    {!watermark ? <>
      <label><input type="checkbox" checked={edit.border} onChange={(event) => onUpdate({ ...edit, border: event.target.checked })} />{localize("Cadre du tampon")}</label>
      <p>{localize("Déplacez et redimensionnez sur la page. La date reste figée.")}</p>
    </> : null}
    <button type="button" onClick={onDelete}>{watermark ? localize("Supprimer le filigrane de cette page") : localize("Supprimer le tampon")}</button>
    {onDeleteGroup ? <button type="button" onClick={onDeleteGroup}>{localize("Supprimer le groupe de filigranes")}</button> : null}
  </section>;
}
