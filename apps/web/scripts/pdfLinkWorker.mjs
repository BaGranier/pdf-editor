import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * PDF.js exposes URLs synthesized from Launch, GoToR and certain JavaScript
 * actions alongside URI links. Retain the actual primary action type so the
 * viewer can enforce its URI/GoTo allowlist without uploading the PDF.
 */
export function addPdfLinkProvenance(source) {
  const action = 'const actionName = actionType.name;\n      switch (actionName)';
  const directDestination = 'dest = destDict.get("Dest");';
  const outline = "unsafeUrl: data.unsafeUrl,\n        newWindow: data.newWindow,";
  for (const marker of [action, directDestination, outline]) {
    if (source.split(marker).length !== 2) {
      throw new Error("Vérifiez la provenance des actions après la mise à jour de PDF.js.");
    }
  }
  return "// Modified by PDF Studio Local to expose the primary PDF link action.\n" + source
    .replace(action, action.replace("switch", `if (action === destDict.get("A")) {
        resultObj.pdfLinkAction = actionName;
        resultObj.pdfLinkEditable = !destDict.has("AA") && !action.has("Next");
      }
      switch`))
    .replace(directDestination, `${directDestination}
      resultObj.pdfLinkAction = "GoTo";
      resultObj.pdfLinkEditable = !destDict.has("AA");`)
    .replace(outline, `pdfLinkAction: data.pdfLinkAction,\n        ${outline}`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.stdout.write(addPdfLinkProvenance(readFileSync(process.argv[2], "utf8")));
}
