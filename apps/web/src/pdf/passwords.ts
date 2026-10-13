export class PdfOpenCancelled extends Error {}
export class PdfUnlockError extends Error {}

export async function unlockWorkingPdf(file: File, backendUrl: string,
  prompt: (error: string) => Promise<string | null>): Promise<File> {
  let error = "";
  for (;;) {
    let password = await prompt(error);
    if (password === null) throw new PdfOpenCancelled("Ouverture annulée.");
    const form = new FormData();
    form.append("file", file);
    form.append("password", password);
    password = null;
    let response: Response;
    try {
      response = await fetch(`${backendUrl}/pdf/unlock`, { method: "POST", body: form });
    } catch {
      throw new PdfUnlockError("Impossible de contacter le moteur PDF local.");
    } finally { form.delete("password"); }
    if (response.ok) return new File([await response.blob()], file.name, { type: "application/pdf" });
    const payload = await response.json() as { code?: string; message?: string };
    if (payload.code === "PDF_PASSWORD_INVALID") error = "Mot de passe incorrect. Réessayez.";
    else if (payload.code === "PDF_PERMISSION_DENIED") error = "Ce mot de passe ne permet pas tous les outils de l’éditeur. Utilisez le mot de passe propriétaire.";
    else throw new PdfUnlockError(payload.message || "Impossible d’ouvrir le PDF.");
  }
}
