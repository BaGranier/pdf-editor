import { expect, test } from "../helpers/qa-test";
import {
  expectInitialLocalState,
  openApp,
} from "../helpers/app";

test("QA-E2E-001 @smoke démarre le frontend et le backend dans un état utilisable", async ({
  page,
  request,
  qa,
}) => {
  const backendUrl = process.env.QA_BACKEND_URL ?? "http://127.0.0.1:8000";
  await qa.measure("backend-health", async () => {
    const health = await request.get(`${backendUrl}/health`);
    expect(health.ok()).toBe(true);
    expect(await health.json()).toEqual({ status: "ok" });
  });

  await qa.measure("frontend-startup", () => openApp(page));
  await expect(page.getByLabel("Aucun PDF ouvert")).toBeVisible();
  await expect(page.getByRole("button", { name: "OCR" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Organiser" })).toBeVisible();
  await expectInitialLocalState(page);
});
