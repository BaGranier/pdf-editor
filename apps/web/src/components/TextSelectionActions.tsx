import { ToolbarIcon } from "./ToolbarIcon";
import { useLocale } from "../viewer/locale";

export function TextSelectionActions({ onComment, onRedact, canComment }: {
  onComment: () => void;
  onRedact?: () => void;
  canComment: boolean;
}) {
  const { t } = useLocale();
  return <>
    <button type="button" title={t("Commentaire")} aria-label={t("Commentaire")} disabled={!canComment}
      onMouseDown={(event) => event.preventDefault()} onClick={onComment}><ToolbarIcon name="comment" /></button>
    {onRedact ? <button type="button" title={t("Biffage")} aria-label={t("Biffage")}
      onMouseDown={(event) => event.preventDefault()} onClick={onRedact}><ToolbarIcon name="redaction" /></button> : null}
  </>;
}
