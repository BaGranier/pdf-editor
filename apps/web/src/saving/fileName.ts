const PDF_EXTENSION = /(?:\.pdf)+$/i;
const FORBIDDEN_FILE_NAME_CHARACTERS = /[<>:"/\\|?*\u0000-\u001f\u007f]/g;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export type PdfFileNameResult =
  | { fileName: string; error: null }
  | { fileName: null; error: string };

function cleanStem(value: string) {
  const cleaned = value
    .replace(FORBIDDEN_FILE_NAME_CHARACTERS, "-")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!cleaned) {
    return "";
  }

  return WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function normalizePdfFileName(value: string): PdfFileNameResult {
  const trimmed = value.trim();
  const withoutExtension = trimmed.replace(PDF_EXTENSION, "");
  const stem = cleanStem(withoutExtension);

  if (!stem) {
    return {
      fileName: null,
      error: "Saisissez un nom de fichier avant d'enregistrer.",
    };
  }

  return { fileName: `${stem}.pdf`, error: null };
}

export function getSuggestedPdfSaveName(
  currentFileName: string,
  workingSaveName: string | null = null,
) {
  if (workingSaveName) {
    const normalizedWorkingName = normalizePdfFileName(workingSaveName);
    if (normalizedWorkingName.fileName) {
      return normalizedWorkingName.fileName;
    }
  }

  const currentResult = normalizePdfFileName(currentFileName);
  const currentStem = currentResult.fileName?.slice(0, -4) || "document";

  return currentStem.toLocaleLowerCase().endsWith("-modifie")
    ? `${currentStem}.pdf`
    : `${currentStem}-modifie.pdf`;
}
