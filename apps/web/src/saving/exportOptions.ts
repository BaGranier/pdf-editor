export const EXPORT_QUALITY_LABELS = { maximum: "Qualité maximale", balanced: "Équilibré", small: "Taille réduite" } as const;
export type ExportOptions = {
  quality: keyof typeof EXPORT_QUALITY_LABELS;
  flattenForms: boolean;
  flattenAnnotations: boolean;
  openPassword: string;
  ownerPassword: string;
  allowPrinting: boolean;
  allowModification: boolean;
};
