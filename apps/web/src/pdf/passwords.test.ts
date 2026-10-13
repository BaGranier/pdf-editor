import { afterEach, expect, it, vi } from "vitest";
import { PdfOpenCancelled, unlockWorkingPdf } from "./passwords";
afterEach(() => vi.unstubAllGlobals());
it("cancels without transport or editor state", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(unlockWorkingPdf(new File(["%PDF"], "test.pdf"), "http://local", async () => null)).rejects.toBeInstanceOf(PdfOpenCancelled);
  expect(fetch).not.toHaveBeenCalled();
});
it("retries wrong passwords and removes secrets from request structures", async () => {
  const bodies: FormData[] = [];
  const fetch = vi.fn(async (_url, request) => {
    const form = request.body as FormData;
    expect(form.get("password")).toBe(bodies.length ? "synthetic-correct" : "synthetic-wrong");
    bodies.push(form);
    return bodies.length === 1
      ? { ok: false, json: async () => ({ code: "PDF_PASSWORD_INVALID" }) }
      : { ok: true, blob: async () => new Blob(["%PDF-working"]) };
  });
  vi.stubGlobal("fetch", fetch);
  const prompt = vi.fn().mockResolvedValueOnce("synthetic-wrong").mockResolvedValueOnce("synthetic-correct");
  const file = await unlockWorkingPdf(new File(["%PDF-locked"], "test.pdf"), "http://local", prompt);
  expect(prompt).toHaveBeenLastCalledWith("Mot de passe incorrect. Réessayez.");
  expect(file.name).toBe("test.pdf");
  expect(bodies.every((body) => !body.has("password"))).toBe(true);
  expect(fetch.mock.calls.every(([url]) => url === "http://local/pdf/unlock")).toBe(true);
});
it("clears transport structures even on network error", async () => {
  let body: FormData | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url, request) => { body = request.body; throw new Error("network"); }));
  await expect(unlockWorkingPdf(new File(["%PDF"], "test.pdf"), "http://local", async () => "synthetic")).rejects.toThrow("Impossible de contacter");
  expect(body?.has("password")).toBe(false);
});
