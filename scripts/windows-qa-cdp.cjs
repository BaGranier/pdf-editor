// Attach only to the QA WebView2 loopback debugging endpoint. No browser emulation.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data/output/windows-qa-002');
const scenario = process.argv[2] || 'metrics';
const report = { timestamp: new Date().toISOString(), scenario, transport: 'native WebView2 CDP', checks: [] };
function write() {
  fs.mkdirSync(path.join(output, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(output, 'reports', `${scenario}.json`), JSON.stringify(report, null, 2));
}
async function check(name, action) {
  const start = performance.now();
  try { const evidence = await action(); report.checks.push({ name, status: 'OK', milliseconds: performance.now() - start, evidence }); }
  catch (error) { report.checks.push({ name, status: 'KO', message: error.message }); throw error; }
  finally { write(); }
}
(async () => {
  let browser;
  await expect.poll(async () => {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { timeout: 1000 }); return true; }
    catch { return false; }
  }, { timeout: 30000 }).toBe(true);
  try {
    let page;
    await expect.poll(() => {
      page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('tauri.localhost'));
      return !!page;
    }, { timeout: 30000 }).toBe(true);
    page.setDefaultTimeout(15000);
    await expect.poll(() => page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('get_backend_status')).state), { timeout: 30000 }).toBe('ready');
    report.backendReadyObservedAt = new Date().toISOString();
    if (scenario === 'startup') {
      await expect(page.locator('.document-tab.is-active .document-select')).toHaveAttribute('title', process.argv[3] || 'conversion-simple-text.pdf', { timeout: 30000 });
      await expect(page.locator('.pdf-canvas').first()).toBeVisible();
      await expect.poll(() => page.locator('.pdf-canvas').first().evaluate(c => c.width > 0 && c.height > 0)).toBe(true);
      report.pdfCanvasObservedAt = new Date().toISOString();
    }
    if (scenario === 'print') {
      await check('Ctrl+P opens PDF print preview', async () => {
        await page.keyboard.press('Control+p');
        const preview = page.getByRole('dialog', { name: 'Aperçu avant impression' });
        await expect(preview.getByTitle('Aperçu du PDF à imprimer')).toBeVisible();
        await preview.getByRole('button', { name: 'Imprimer', exact: true }).click();
        await expect(preview.getByText(/Le dialogue d’impression a été demandé/)).toBeVisible();
        return { scope: 'Preview and request only; OS dialog and printed output must be qualified independently.' };
      });
    }
    if (scenario === 'files') {
      const native = (action, destination) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-native-qa.ps1'), '-Action', action, ...(destination ? ['-Path', destination] : [])], { windowsHide: true, timeout: 30000 });
      const layer = page.getByLabel("Couche d'édition de la page 1");
      await check('text edit, dirty, undo/redo', async () => {
        await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
        const box = await layer.boundingBox();
        if (!box) throw Error('No editing surface');
        await page.mouse.move(box.x + 60, box.y + 80); await page.mouse.down();
        await page.mouse.move(box.x + 300, box.y + 150, { steps: 4 }); await page.mouse.up();
        await page.getByLabel('Texte ajouté page 1').fill('Qualification Windows été 002');
        await layer.dispatchEvent('click');
        await page.getByRole('button', { name: 'Sélection', exact: true }).click();
        await expect(page.locator('.document-tab.is-active .document-select')).toHaveAccessibleDescription('Modifications non sauvegardées.');
        await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y');
        await expect(page.getByLabel('Texte ajouté page 1')).toHaveValue('Qualification Windows été 002');
      });
      await check('native Save As cancellation preserves dirty', async () => {
        await page.keyboard.press('Control+Shift+s'); native('Cancel');
        await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Sélection', exact: true }).click();
        await expect(page.locator('.document-tab.is-active .document-select')).toHaveAccessibleDescription('Modifications non sauvegardées.');
      });
      const destination = path.join(output, 'contrat été (copie) [1].PDF');
      await check('native Save As Unicode then direct Save', async () => {
        const existed = fs.existsSync(destination);
        await page.keyboard.press('Control+Shift+s'); native('Save', destination);
        if (existed) native('Overwrite');
        await expect.poll(() => fs.existsSync(destination)).toBe(true);
        await expect(page.locator('.document-tab.is-active .document-select')).not.toHaveAttribute('aria-describedby');
        await page.getByLabel('Texte ajouté page 1').fill('Seconde sauvegarde été 002');
        await layer.dispatchEvent('click');
        await page.getByRole('button', { name: 'Sélection', exact: true }).click();
        await page.keyboard.press('Control+s');
        await expect(page.locator('.document-tab.is-active .document-select')).not.toHaveAttribute('aria-describedby');
        return { file: path.basename(destination), bytes: fs.statSync(destination).size };
      });
      await check('native overwrite confirmation', async () => {
        await page.getByLabel('Texte ajouté page 1').fill('Overwrite Windows été 002');
        await layer.dispatchEvent('click');
        await page.getByRole('button', { name: 'Sélection', exact: true }).click();
        await page.keyboard.press('Control+Shift+s'); native('Save', destination); native('Overwrite');
        await expect(page.locator('.document-tab.is-active .document-select')).not.toHaveAttribute('aria-describedby');
      });
    }
    if (scenario === 'retry') {
      const layer = page.getByLabel("Couche d'édition de la page 1");
      await page.getByRole('button', { name: 'Ajouter du texte', exact: true }).click();
      await expect(layer).toHaveAttribute('data-active-editing-tool', 'add_text');
      const box = await layer.boundingBox();
      await page.mouse.move(box.x + 60, box.y + 350); await page.mouse.down();
      await page.mouse.move(box.x + 300, box.y + 410, { steps: 4 }); await page.mouse.up();
      await page.getByLabel('Texte ajouté page 1').fill('Session conservée après deux crashs');
      await page.getByRole('button', { name: 'Sélection', exact: true }).click();
      const ports = [];
      for (let i = 0; i < 2; i++) {
        await check(`worker crash and retry ${i + 1}`, async () => {
          ports.push((await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_backend_status'))).baseUrl);
          execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-qa-processes.ps1'), '-Action', 'KillWorker'], { windowsHide: true });
          await expect(page.getByRole('button', { name: 'Réessayer', exact: true })).toBeVisible({ timeout: 30000 });
          await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
          await expect(page.locator('.app-shell')).toBeVisible({ timeout: 30000 });
          await expect(page.getByLabel('Texte ajouté page 1')).toHaveValue('Session conservée après deux crashs');
          await expect(page.locator('.document-tab.is-active .document-select')).toHaveAccessibleDescription('Modifications non sauvegardées.');
          const status = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_backend_status'));
          expect(status.state).toBe('ready'); expect(ports).not.toContain(status.baseUrl);
          return { baseUrl: status.baseUrl, draftPreserved: true };
        });
      }
    }
    await check('window metrics', async () => {
      const metrics = await page.evaluate(async () => {
        const values = {};
        for (const command of ['current_monitor', 'available_monitors', 'scale_factor', 'outer_position', 'outer_size', 'inner_size', 'is_maximized', 'is_fullscreen', 'is_minimized']) {
          values[command] = await window.__TAURI_INTERNALS__.invoke(`plugin:window|${command}`, { label: 'main' });
        }
        return { timestamp: new Date().toISOString(), ...values, devicePixelRatio, viewport: { width: innerWidth, height: innerHeight }, canvases: [...document.querySelectorAll('.pdf-canvas')].map(c => ({ width: c.width, height: c.height, css: { width: c.clientWidth, height: c.clientHeight } })) };
      });
      fs.mkdirSync(path.join(output, 'window-metrics'), { recursive: true });
      fs.writeFileSync(path.join(output, 'window-metrics', `${scenario}.json`), JSON.stringify(metrics, null, 2));
      return metrics;
    });
    if (scenario === 'smoke' || scenario === 'stress') {
      await check('native argument PDF rendered', async () => {
        await expect(page.locator('.document-tab.is-active')).toBeVisible();
        await expect(page.locator('canvas').first()).toBeVisible();
        return await page.locator('.document-tab.is-active').innerText();
      });
      await check('reading modes and Escape', async () => {
        for (const mode of ['single-page', 'presentation', 'continuous']) {
          await page.getByLabel("Mode d'affichage").selectOption(mode);
          if (mode === 'presentation') {
            await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
            await page.locator('.viewer').click({ position: { x: 10, y: 10 } });
            await page.keyboard.press('Escape');
            await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
          }
        }
      });
      await check('search and theme', async () => {
        await page.keyboard.press('Control+f');
        await expect(page.getByRole('search')).toBeVisible();
        await page.keyboard.press('Escape');
        for (let i = 0; i < (scenario === 'stress' ? 20 : 2); i++) await page.getByRole('switch', { name: 'Basculer le thème', exact: true }).click();
      });
    }
    if (scenario === 'conversion' || scenario === 'stress') {
      const { baseUrl } = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_backend_status'));
      for (let i = 0; i < (scenario === 'stress' ? 10 : 1); i++) {
        for (const format of (scenario === 'stress' ? ['txt'] : ['txt', 'docx', 'png'])) {
          await check(`installed sidecar API conversion ${format} ${i + 1}`, async () => {
            const data = new FormData();
            data.append('file', new Blob([fs.readFileSync(path.join(root, 'apps/web/e2e/fixtures/conversion-simple-text.pdf'))], { type: 'application/pdf' }), 'contrat été.pdf');
            data.append('target_format', format); data.append('ocr_mode', 'never');
            const response = await fetch(`${baseUrl}/convert`, { method: 'POST', body: data, signal: AbortSignal.timeout(60000) });
            if (!response.ok) throw Error(`${response.status}: ${await response.text()}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (!bytes.length) throw Error('Empty conversion');
            const extension = format === 'png' && response.headers.get('content-type')?.includes('zip') ? 'zip' : format;
            if (extension === 'png') expect(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
            if (extension === 'zip' || format === 'docx') expect(bytes.subarray(0, 2).toString()).toBe('PK');
            fs.writeFileSync(path.join(output, 'reports', `contrat été-${i}.${extension}`), bytes);
            return { bytes: bytes.length, contentDisposition: response.headers.get('content-disposition'), scope: 'API, UI download not validated' };
          });
        }
      }
    }
    if (scenario.startsWith('ocr-missing-')) {
      await check(scenario, async () => {
        const language = process.argv[3] || 'eng';
        await page.getByRole('button', { name: 'OCR', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Reconnaissance de texte (OCR)' });
        await dialog.getByLabel('Langue du document').selectOption(language);
        const pending = page.waitForResponse(r => r.url().endsWith('/ocr') && r.request().method() === 'POST', { timeout: 30000 });
        await dialog.getByRole('button', { name: 'Lancer l’OCR' }).click();
        const response = await pending;
        expect(response.ok()).toBe(false);
        const error = await response.json();
        expect(JSON.stringify(error)).toContain(process.argv[4] || 'OCR_TOOL_UNAVAILABLE');
        await expect(page.locator('.export-read-feedback')).toBeVisible();
        return { httpStatus: response.status(), error, message: await page.locator('.export-read-feedback').innerText() };
      });
    }
    if (scenario === 'ocr-eng' || scenario === 'ocr-fra' || scenario === 'ocr-invalid-prefix') {
      const language = scenario === 'ocr-invalid-prefix' ? 'eng' : scenario.slice(4);
      await check(`installed application OCR ${language}`, async () => {
        await page.getByRole('button', { name: 'OCR', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Reconnaissance de texte (OCR)' });
        await dialog.getByLabel('Langue du document').selectOption(language);
        const pending = page.waitForResponse(r => r.url().endsWith('/ocr') && r.request().method() === 'POST', { timeout: 120000 });
        await dialog.getByRole('button', { name: 'Lancer l’OCR' }).click();
        const response = await pending;
        if (!response.ok()) throw Error(`${response.status()}: ${await response.text()}`);
        // Fetch binary from IndexedDB after the result has been reopened by the UI.
        await expect(page.locator('.export-read-feedback')).toContainText('OCR terminé');
        const name = await page.locator('.document-tab.is-active .document-select').getAttribute('title');
        let bytes;
        await expect.poll(async () => {
          bytes = await page.evaluate(async name => {
            const request = indexedDB.open('pdf-editor-mvp-db', 1);
            const db = await new Promise((ok, fail) => { request.onsuccess = () => ok(request.result); request.onerror = () => fail(request.error); });
            try {
              const get = db.transaction('documents', 'readonly').objectStore('documents').getAll();
              const docs = await new Promise((ok, fail) => { get.onsuccess = () => ok(get.result); get.onerror = () => fail(get.error); });
              const doc = docs.find(d => d.fileName === name);
              return doc ? [...new Uint8Array(await doc.content.arrayBuffer())] : null;
            } finally { db.close(); }
          }, name);
          return !!bytes;
        }).toBe(true);
        fs.mkdirSync(path.join(output, 'ocr'), { recursive: true });
        fs.writeFileSync(path.join(output, 'ocr', `${scenario === 'ocr-invalid-prefix' ? scenario : language}.pdf`), Buffer.from(bytes));
        return { name, bytes: bytes.length };
      });
    }
    fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(output, 'screenshots', `${scenario}.png`) });
  } finally { await browser.close(); write(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
