import { createContext, useContext } from "react";

export type Locale = "fr" | "en";
export const LocaleContext = createContext<Locale>("fr");

const english: Record<string, string> = {
  "Outils": "Tools", "Paramètres": "Settings", "Général": "General", "Apparence": "Appearance", "Langue de l’interface": "Interface language",
  "Fermer les paramètres": "Close settings", "Sélection": "Select", "Outils d'édition": "Editing tools",
  "Texte": "Text", "Ajouter du texte": "Add text", "Modifier le texte existant": "Edit existing text", "Lien": "Link",
  "Formes et images": "Shapes and images", "Image": "Image", "Dessiner": "Draw", "Carré": "Square", "Cercle": "Circle", "Ligne": "Line", "Flèche": "Arrow",
  "Biffage et tampons": "Redaction and stamps", "Biffer": "Redact", "Biffage": "Redaction", "Biffage sécurisé": "Secure redaction",
  "Masquage visuel": "Visual mask", "Filigrane": "Watermark", "Tampon": "Stamp", "Ajouter une signature": "Add signature",
  "Afficher les miniatures": "Show thumbnails", "Organiser": "Organize", "Revenir à la lecture": "Back to reading",
  "Conversion": "Conversion", "Convertir": "Convert", "Nouveau PDF à partir d’images": "New PDF from images",
  "Annotations": "Annotations", "Commentaire": "Comment", "Commentaires": "Comments", "Afficher les commentaires": "Show comments",
  "Sélectionnez du texte dans la page pour surligner, souligner ou barrer.": "Select text on the page to highlight, underline, or strike it out.",
  "Biffage sécurisé : supprime les données dans la copie exportée.": "Secure redaction removes data from the exported copy.",
  "Recouvre sans supprimer les données.": "Covers the data while retaining it in the file.",
  "Marquage non destructif : les données restent récupérables.": "Adds a watermark while retaining the original data.",
  "Tampon visuel, sans suppression de données.": "Adds a visual stamp.",
  "Thème de l’interface": "Interface theme", "Personnaliser le thème": "Customize theme", "Personnaliser": "Customize",
  "Clair": "Light", "Sombre": "Dark", "Océan": "Ocean", "Forêt": "Forest", "Prune": "Plum", "Sable": "Sand",
  "Nouveau thème": "New theme", "Nom": "Name", "Thème de base": "Base theme", "Couleur principale": "Main color",
  "Accentuation": "Accent", "Fond": "Background", "Panneaux": "Panels", "Bordures": "Borders", "Éléments interactifs": "Interactive elements",
  "Enregistrer le thème": "Save theme", "Dupliquer": "Duplicate", "Supprimer le thème": "Delete theme", "Annuler": "Cancel",
  "Contraste du texte inférieur à 4,5:1 sur au moins un fond.": "Text contrast is below 4.5:1 on at least one background.",
  "Impossible d’enregistrer les thèmes dans le stockage local.": "Could not save themes to local storage.",
  "Réinitialiser les données locales": "Reset local data", "Auteur par défaut des commentaires": "Default comment author",
  "Fichier": "File", "Ouvrir un PDF": "Open PDF", "Enregistrer": "Save", "Enregistrer sous…": "Save as…",
  "Exporter / Finaliser…": "Export / Finalize…", "Exporter en PDF…": "Export as PDF…", "Imprimer…": "Print…", "Rétablir": "Redo",
  "Propriétés": "Properties", "Inspecteur": "Inspector", "Nouveau commentaire": "New comment", "Rédacteur": "Author",
  "Message": "Message", "Non renseigné": "Not specified", "Texte du commentaire": "Comment text", "Saisissez votre commentaire…": "Enter a comment…",
  "Ajouter": "Add", "Type de message": "Annotation type", "Source": "Source", "PDF source": "Source PDF",
  "Créé dans PDF Studio Local": "Created in PDF Studio Local", "Supprimer le commentaire": "Delete comment",
  "Propriétés du commentaire": "Comment properties", "Aucun commentaire dans ce document.": "No comments in this document.",
  "Annotations du texte": "Text annotations", "Surligner": "Highlight", "Souligner": "Underline", "Barrer": "Strikethrough",
  "Ajouter un lien à la sélection": "Add a link to the selection", "Couleur de l'annotation": "Annotation color",
  "Rechercher et biffer": "Find and redact", "Rechercher et biffer…": "Find and redact…", "Biffage sécurisé · Recherche": "Secure redaction · Search",
  "Mot ou expression": "Word or phrase", "Terme à biffer": "Text to redact", "Respecter la casse": "Match case", "Mot entier": "Whole word",
  "Portée de recherche": "Search scope", "Toutes les pages": "All pages", "Page actuelle": "Current page",
  "Compteur des occurrences": "Match count", "Occurrences détectées": "Matches found", "Occurrences à biffer": "Matches to redact",
  "Appliquer le biffage": "Apply redaction", "Fermer onglet": "Close tab", "Recherche en cours…": "Searching…",
  "Analyse du texte et OCR": "Text analysis and OCR", "OCR à vérifier": "Review OCR on", "Page source": "Source page",
  "reconnaissance à vérifier": "review recognition", "aucun texte reconnu dans les zones visuelles": "no text recognized in image areas",
  "OCR indisponible ou en échec": "OCR unavailable or failed", "Aucune occurrence détectée. Vous pouvez tracer une zone de biffage manuellement.": "No matches found. You can draw a redaction area manually.",
  "Sélectionner toutes les occurrences": "Select all matches", "Biffer toutes les occurrences de la page": "Redact all matches on this page",
  "Sélectionner le texte à biffer": "Select text to redact", "Sélection du texte à biffer": "Redaction text selection",
  "Tracer une zone": "Draw an area", "Supprimer le biffage": "Delete redaction",
  "Recherche impossible.": "Search failed.", "Aucune zone créée.": "No areas created.",
  "La suppression définitive s’effectue lors de la génération du PDF.": "The content is permanently removed when the PDF is generated.",
  "Tracez un rectangle.": "Draw a rectangle.", "Glissez sur le passage ou double-cliquez sur un mot.": "Drag across the passage or double-click a word.",
  "Le biffage par zones ne supprime pas les données ailleurs dans le document, notamment les métadonnées.": "Redaction areas do not remove data elsewhere in the document, including metadata.",
  "La recherche utilise le texte natif, le texte modifié et l’OCR des pages comportant du contenu visuel. Vérifiez les zones avant de générer le PDF.": "Search uses PDF text, edited text, and OCR on pages with visual content. Review the areas before generating the PDF.",
  "Erreur du backend": "PDF engine error",
};

export function translator(locale: Locale) {
  return (message: string): string => locale === "en" ? english[message] ?? message : message;
}

export function useLocale() {
  const locale = useContext(LocaleContext);
  return { locale, t: translator(locale) };
}

export function localizePdfError(locale: Locale, detail: string): string {
  if (locale === "fr") return detail;
  const prefix = "Biffage sécurisé refusé : ";
  if (!detail.startsWith(prefix)) return translator(locale)(detail);
  const reason = detail.slice(prefix.length);
  if (reason.includes("volumineuses")) return "Secure redaction refused. The pages containing shared or nested PDF objects exceed the reconstruction limit. Export fewer pages and retry.";
  if (reason.includes("zone hors page")) return "Secure redaction refused. At least one area is outside the page or has invalid coordinates.";
  if (reason.includes("formulaires") || reason.includes("annotations")) return "Secure redaction refused. The PDF contains unsupported annotations, interactive forms, or alternate representations.";
  if (reason.includes("image partagée") || reason.includes("image avec masque")) return "Secure redaction refused. Isolate the shared or masked image before retrying.";
  return "Secure redaction refused. The PDF engine could not verify removal. Try exporting a smaller set of pages.";
}
