import { useCallback, useState } from "react";
import {
  downloadConversionFile,
  requestConversion,
  type ConversionOptions,
} from "../conversion/conversion";
import { requestOcrPdf, type OcrOptions } from "../ocr/ocr";

export type ProcessingFeedback = {
  kind: "success" | "warning" | "error";
  message: string;
};

type ProcessingSource = { file: File; fileName: string };

type DocumentProcessingOptions = {
  activeDocument: ProcessingSource | null;
  backendUrl: string;
  openGeneratedPdfDocument: (file: File) => Promise<{ usageWarnings: string[] }>;
  onFeedback: (feedback: ProcessingFeedback | null) => void;
};

/** Runs source-file treatments; editing, persistence and result opening stay with the caller. */
export function useDocumentProcessing({
  activeDocument,
  backendUrl,
  openGeneratedPdfDocument,
  onFeedback,
}: DocumentProcessingOptions) {
  const [isOcrDialogOpen, setIsOcrDialogOpen] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [isConversionDialogOpen, setIsConversionDialogOpen] = useState(false);
  const [isConverting, setIsConverting] = useState(false);

  const runOcrOnActiveDocument = useCallback(
    async (options: OcrOptions) => {
      if (!activeDocument || isOcrProcessing) {
        return;
      }

      const sourceDocument = activeDocument;
      const sourceFile = sourceDocument.file;

      setIsOcrDialogOpen(false);
      setIsOcrProcessing(true);
      onFeedback(null);

      try {
        const returnedFile = await requestOcrPdf(
          backendUrl,
          sourceFile,
          options,
        );
        let usageWarnings: string[];
        try {
          ({ usageWarnings } = await openGeneratedPdfDocument(returnedFile));
        } catch {
          throw new Error("Le serveur n'a pas produit un PDF valide.");
        }

        onFeedback({
          kind: usageWarnings.length > 0 ? "warning" : "success",
          message: `OCR terminé. Le document OCR a été ouvert.${usageWarnings
            .map((warning) => ` Avertissement: ${warning}`)
            .join("")}`,
        });
      } catch (error) {
        onFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Le traitement OCR a échoué.",
        });
      } finally {
        setIsOcrProcessing(false);
      }
    },
    [
      activeDocument,
      backendUrl,
      isOcrProcessing,
      openGeneratedPdfDocument,
      onFeedback,
    ],
  );

  const convertActiveDocument = useCallback(
    async (options: ConversionOptions) => {
      if (!activeDocument || isConverting) {
        return;
      }

      const sourceDocument = activeDocument;
      setIsConversionDialogOpen(false);
      setIsConverting(true);
      onFeedback(null);

      try {
        const conversion = await requestConversion(
          backendUrl,
          sourceDocument.file,
          options,
          sourceDocument.fileName,
        );
        downloadConversionFile(conversion.file);
        const pageSummary =
          conversion.metadata.pages.length > 0
            ? `${conversion.metadata.pages.length} page${conversion.metadata.pages.length > 1 ? "s" : ""}`
            : "pages demandées";
        const ocrSummary = conversion.metadata.ocrUsed
          ? " OCR automatique utilisé."
          : "";
        const warnings = conversion.metadata.warnings
          .map((warning) => ` Avertissement : ${warning}`)
          .join("");
        onFeedback({
          kind: warnings ? "warning" : "success",
          message: `Conversion réussie : ${conversion.file.name} (${pageSummary}).${ocrSummary}${warnings}`,
        });
      } catch (error) {
        onFeedback({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "La conversion du document a échoué.",
        });
      } finally {
        setIsConverting(false);
      }
    },
    [activeDocument, backendUrl, isConverting, onFeedback],
  );

  const resetDocumentProcessing = useCallback(() => {
    setIsOcrDialogOpen(false);
    setIsOcrProcessing(false);
    setIsConversionDialogOpen(false);
    setIsConverting(false);
  }, []);

  return {
    isOcrDialogOpen,
    setIsOcrDialogOpen,
    isOcrProcessing,
    isConversionDialogOpen,
    setIsConversionDialogOpen,
    isConverting,
    runOcrOnActiveDocument,
    convertActiveDocument,
    resetDocumentProcessing,
  };
}
