// Attach only to the QA WebView2 loopback debugging endpoint. No browser emulation.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, process.env.PDF_STUDIO_QA_OUTPUT || 'data/output/windows-qa-002');
if (!output.startsWith(path.join(root, 'data/output') + path.sep)) throw Error('QA output must stay under repository data/output');
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
    if (['files', 'retry', 'editor-004', 'integration-004'].includes(scenario)) {
      await expect(page.getByLabel("Couche d'édition de la page 1")).toBeVisible({ timeout: 30000 });
    }
    if (scenario === 'idle-004') {
      await check('no-document idle', async () => {
        while (await page.locator('.document-tab').count()) {
          await page.locator('.document-tab').last().getByRole('button', { name: /^Fermer / }).click();
          const discard = page.getByRole('button', { name: 'Ignorer les modifications', exact: true });
          if (await discard.isVisible()) await discard.click();
        }
        await expect(page.locator('.viewer canvas')).toHaveCount(0);
        return { documents: 0 };
      });
    }
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
        await page.keyboard.press('Control+s'); native('Cancel');
        await expect(page.getByRole('button', { name: /^Enregistrer/ })).toBeEnabled();
        await page.getByRole('button', { name: 'Sélection', exact: true }).click();
        await expect(page.locator('.document-tab.is-active .document-select')).toHaveAccessibleDescription('Modifications non sauvegardées.');
      });
      const destination = path.join(output, 'contrat été (copie) [1].PDF');
      await check('native Save As Unicode then direct Save', async () => {
        const existed = fs.existsSync(destination);
        await page.keyboard.press('Control+s'); native('Save', destination);
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
    if (scenario === 'ocr-eng' || scenario === 'ocr-fra' || scenario === 'ocr-invalid-prefix' || scenario === 'ocr-multipage') {
      const language = scenario === 'ocr-invalid-prefix' || scenario === 'ocr-multipage' ? 'eng' : scenario.slice(4);
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
            const request = indexedDB.open('pdf-editor-mvp-db');
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
        fs.writeFileSync(path.join(output, 'ocr', `${scenario === 'ocr-invalid-prefix' || scenario === 'ocr-multipage' ? scenario : language}.pdf`), Buffer.from(bytes));
        return { name, bytes: bytes.length };
      });
    }
    if (scenario === 'ocr-close-004') {
      await check('normal application close during active OCR', async () => {
        await page.getByRole('button', { name: 'OCR', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Reconnaissance de texte (OCR)' });
        await dialog.getByLabel('Langue du document').selectOption('eng');
        await dialog.getByRole('button', { name: 'Lancer l’OCR' }).click();
        let snapshot;
        await expect.poll(() => {
          snapshot = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-clean-qa.ps1'), '-Action', 'Inspect'], { windowsHide: true, encoding: 'utf8' }).replace(/^\uFEFF/, ''));
          return snapshot.processes.filter(process => process.name === 'pdf-engine').length;
        }, { timeout: 15000 }).toBeGreaterThan(2);
        const result = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-clean-qa.ps1'), '-Action', 'Close'], { windowsHide: true, encoding: 'utf8' });
        expect(result).toContain('Remaining application tree processes: 0');
        return { engineProcessesDuringOcr: snapshot.processes.filter(process => process.name === 'pdf-engine').length, normalClose: result.trim() };
      });
      return;
    }
    if (scenario === 'ocr-errors-004') {
      const qaTemp = path.join(root, 'data/output/windows-qa-004/temp');
      const runtimes = fs.readdirSync(qaTemp, { withFileTypes: true }).filter(e => e.isDirectory() && e.name.startsWith('_MEI')).map(e => path.join(qaTemp, e.name, 'ocr')).filter(p => fs.existsSync(path.join(p, 'manifest.json'))).sort((a, b) => fs.statSync(b).birthtimeMs - fs.statSync(a).birthtimeMs);
      if (!runtimes.length) throw Error('No QA-local extracted OCR resources');
      const runtime = runtimes[0];
      for (const [language, corrupt, status, code] of [['eng', true, 503, 'OCR_TOOL_UNAVAILABLE'], ['fra', false, 422, 'OCR_LANGUAGE_UNAVAILABLE']]) {
        await check(corrupt ? 'corrupt bundled language controlled' : 'missing bundled language controlled', async () => {
          const target = path.join(runtime, 'tessdata', `${language}.traineddata`), backup = `${target}.qa-backup`;
          if (fs.lstatSync(target).isSymbolicLink() || fs.existsSync(backup)) throw Error('Unsafe QA resource');
          const sourceName = await page.locator('.document-tab.is-active .document-select').getAttribute('title');
          fs.renameSync(target, backup);
          if (corrupt) fs.writeFileSync(target, 'QA deliberately corrupt');
          try {
            await page.getByRole('button', { name: 'OCR', exact: true }).click();
            const dialog = page.getByRole('dialog', { name: 'Reconnaissance de texte (OCR)' });
            await dialog.getByLabel('Langue du document').selectOption(language);
            const pending = page.waitForResponse(r => r.url().endsWith('/ocr') && r.request().method() === 'POST');
            await dialog.getByRole('button', { name: 'Lancer l’OCR' }).click();
            const response = await pending; expect(response.status()).toBe(status);
            const error = await response.json(); expect(JSON.stringify(error)).toContain(code);
            await expect(page.locator('.export-read-feedback')).toBeVisible();
            await expect(page.locator('.document-tab.is-active .document-select')).toHaveAttribute('title', sourceName);
            return { httpStatus: status, error, message: await page.locator('.export-read-feedback').innerText() };
          } finally { if (corrupt) fs.unlinkSync(target); fs.renameSync(backup, target); }
        });
      }
    }
    if (scenario === 'editor-004') {
      const native = (destination) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-native-qa.ps1'), '-Action', 'Save', '-Path', destination], { windowsHide: true, timeout: 30000 });
      const sourceName = await page.locator('.document-tab.is-active .document-select').getAttribute('title');
      const shape = async (name, start, end) => {
        await page.getByRole('button', { name: 'Formes', exact: true }).click();
        await page.getByRole('menuitem', { name, exact: true }).click();
        const box = await page.getByLabel("Couche d'édition de la page 1").boundingBox();
        await page.mouse.move(box.x + start[0], box.y + start[1]); await page.mouse.down();
        await page.mouse.move(box.x + end[0], box.y + end[1], { steps: 4 }); await page.mouse.up();
      };
      await check('highlight participates in all four mixed layer commands', async () => {
        await expect(page.locator('.pdf-text-layer span').first()).toBeVisible();
        await page.locator('.pdf-text-layer').first().evaluate(layer => {
          const node = [...layer.querySelectorAll('span')].find(span => span.firstChild && span.textContent.trim());
          const range = document.createRange(); range.selectNodeContents(node);
          const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
          layer.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        });
        await page.getByRole('button', { name: 'Surligner', exact: true }).click();
        const highlight = await page.locator('.pdf-text-markup rect').first().boundingBox();
        const layer = await page.getByLabel("Couche d'édition de la page 1").boundingBox();
        await shape('Rectangle', [highlight.x - layer.x - 8, highlight.y - layer.y - 8], [highlight.x - layer.x + highlight.width + 8, highlight.y - layer.y + highlight.height + 8]);
        await page.getByLabel('Remplissage transparent').uncheck();
        await page.getByRole('button', { name: 'Remplissage', exact: true }).click(); await page.getByRole('button', { name: 'Couleur #ffffff', exact: true }).click();
        for (const name of ['Reculer d’un plan', 'Avancer d’un plan', 'Mettre au dernier plan', 'Mettre au premier plan']) await page.getByRole('button', { name, exact: true }).click();
        await expect(page.locator('.pdf-edit-object').first().locator('.pdf-text-markup')).toHaveCount(1);
        await expect(page.locator('.pdf-edit-object').last().locator('[data-shape-edit-id]')).toHaveCount(1);
        await page.screenshot({ path: path.join(output, 'reports', 'native-highlight-covered.png') });
        return { highlight, topType: 'opaque rectangle' };
      });
      await check('square circle arrow geometry and history', async () => {
        await shape('Carré', [240, 310], [340, 450]);
        const square = await page.getByLabel('Carré page 1').boundingBox(); expect(square.width).toBeCloseTo(square.height, 0);
        await shape('Cercle', [390, 310], [500, 460]);
        const circle = await page.getByLabel('Cercle page 1').boundingBox(); expect(circle.width).toBeCloseTo(circle.height, 0);
        await shape('Flèche', [80, 520], [280, 560]);
        await expect(page.getByLabel('Flèche page 1').locator('polyline')).toHaveCount(1);
        await page.getByRole('button', { name: 'Annuler', exact: true }).click();
        await expect(page.getByLabel('Flèche page 1')).toHaveCount(0);
        await page.getByRole('button', { name: 'Rétablir', exact: true }).click();
        await expect(page.getByLabel('Flèche page 1').locator('polyline')).toHaveCount(1);
        return { square, circle };
      });
      for (const encrypted of [false, true]) await check(encrypted ? 'native AES-256 finalization' : 'native mixed vector export', async () => {
        await page.getByRole('button', { name: 'Fichier', exact: true }).click(); await page.getByRole('menuitem', { name: 'Exporter / Finaliser…' }).click();
        if (encrypted) {
          await page.getByLabel('Finaliser les annotations', { exact: true }).check();
          await page.getByLabel('Finaliser les champs de formulaire', { exact: true }).check();
          await page.getByLabel('Mot de passe d’ouverture', { exact: true }).fill('synthetic-open-004');
          await page.getByLabel('Confirmer le mot de passe d’ouverture', { exact: true }).fill('synthetic-open-004');
          await page.getByLabel('Mot de passe propriétaire', { exact: true }).fill('synthetic-owner-004');
          await page.getByLabel('Confirmer le mot de passe propriétaire', { exact: true }).fill('synthetic-owner-004');
          await page.getByLabel('Autoriser l’impression', { exact: true }).uncheck(); await page.getByLabel('Autoriser les modifications', { exact: true }).uncheck();
        }
        const pending = page.waitForResponse(r => r.url().endsWith('/pdf/export/organize'));
        await page.getByRole('button', { name: 'Exporter', exact: true }).click(); expect((await pending).status()).toBe(200);
        const destination = path.join(output, encrypted ? 'native-encrypted.pdf' : 'native-vectors.pdf');
        await page.waitForTimeout(500); native(destination); await expect.poll(() => fs.existsSync(destination)).toBe(true);
        if (encrypted) { await expect(page.locator('.document-tab.is-active .document-select')).toHaveAttribute('title', sourceName); await expect(page.locator('.export-read-feedback')).toContainText(/chiffr/); }
        else { await expect(page.locator('.document-tab.is-active .document-select')).not.toHaveAttribute('title', sourceName); await page.locator(`.document-select[title="${sourceName}"]`).click(); }
        return { file: path.basename(destination), bytes: fs.statSync(destination).size, encrypted };
      });
    }
    if (scenario === 'presentation-004') {
      await check('native fullscreen buffered rapid navigation', async () => {
        await page.getByLabel("Mode d'affichage").selectOption('presentation');
        await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
        await expect(page.locator('.viewer [data-page-buffer="front"][data-render-state="ready"]')).toHaveCount(1);
        await page.evaluate(() => {
          const state = { frames: 0, empty: 0, transparent: 0, monochrome: 0, maxCanvases: 0, running: true }; window.qaFrames004 = state;
          const sample = () => {
            if (!state.running) return;
            state.frames++; state.maxCanvases = Math.max(state.maxCanvases, document.querySelectorAll('.viewer canvas').length);
            const canvas = document.querySelector('.viewer [data-page-buffer="front"] canvas');
            if (!canvas || !canvas.width || !canvas.height) state.empty++;
            else {
              const rgba = canvas.getContext('2d').getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data;
              if (rgba[3] === 0) state.transparent++;
              if (rgba[0] === rgba[1] && rgba[1] === rgba[2] && (rgba[0] < 4 || rgba[0] > 250)) state.monochrome++;
            }
            requestAnimationFrame(sample);
          }; requestAnimationFrame(sample);
        });
        for (let n = 2; n <= 20; n++) { await page.keyboard.press('ArrowRight'); await expect(page.locator(`.viewer [data-page-number="${n}"][data-page-buffer="front"]`)).toHaveCount(1); }
        await page.keyboard.press('Home'); await expect(page.locator('.viewer [data-page-number="1"][data-page-buffer="front"]')).toHaveCount(1);
        await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
        await expect(page.locator('.viewer [data-page-number="4"][data-page-buffer="front"]')).toHaveCount(1);
        await page.keyboard.press('End'); await expect(page.locator('.viewer [data-page-number="20"][data-page-buffer="front"]')).toHaveCount(1);
        const samples = await page.evaluate(() => { window.qaFrames004.running = false; return window.qaFrames004; });
        expect(samples.empty).toBe(0); expect(samples.transparent).toBe(0); expect(samples.monochrome).toBe(0); expect(samples.maxCanvases).toBeLessThanOrEqual(2);
        await page.keyboard.press('Escape'); await expect(page.getByLabel("Mode d'affichage")).toHaveValue('single-page');
        await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
        return samples;
      });
    }
    if (scenario === 'integration-004') {
      const native = (action, destination) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-native-qa.ps1'), '-Action', action, ...(destination ? ['-Path', destination] : [])], { windowsHide: true, timeout: 30000 });
      const metrics = async label => {
        const snapshot = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-clean-qa.ps1'), '-Action', 'Inspect'], { windowsHide: true, encoding: 'utf8', timeout: 30000 }).replace(/^\uFEFF/, ''));
        fs.mkdirSync(path.join(output, 'performance'), { recursive: true });
        fs.writeFileSync(path.join(output, 'performance', `${label}.json`), JSON.stringify(snapshot, null, 2));
        return snapshot;
      };
      await metrics('small-pdf');
      const sourceName = await page.locator('.document-tab.is-active .document-select').getAttribute('title');
      await check('image 5 MiB free resize, crop, history', async () => {
        await page.getByLabel('Fichier image').setInputFiles(path.join(root, 'data/output/windows-qa-004/fixtures/image-5m.png'));
        const image = page.locator('[data-image-edit-id]').last();
        await expect(image).toBeVisible();
        await expect(page.getByLabel('Conserver les proportions')).not.toBeChecked();
        const before = await image.boundingBox(), handle = await page.getByLabel('Redimensionner la largeur de l’image').boundingBox();
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
        await page.mouse.move(handle.x + handle.width / 2 + 50, handle.y + handle.height / 2 + 20, { steps: 4 }); await page.mouse.up();
        const resized = await image.boundingBox(); expect(resized.height).toBeCloseTo(before.height, 0); expect(resized.width).toBeGreaterThan(before.width + 30);
        await page.getByRole('button', { name: 'Rogner l’image', exact: true }).click();
        const nw = await page.getByLabel('Rogner nw', { exact: true }).boundingBox();
        await page.mouse.move(nw.x + 6, nw.y + 6); await page.mouse.down(); await page.mouse.move(nw.x + 45, nw.y + 40, { steps: 4 }); await page.mouse.up();
        await page.getByRole('button', { name: 'Valider le rognage' }).click();
        await expect(page.getByRole('button', { name: 'Rétablir l’image entière' })).toBeVisible();
        await expect.poll(async () => (await image.boundingBox()).width).toBeLessThan(resized.width - 20);
        await page.getByRole('button', { name: 'Annuler', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Rétablir l’image entière' })).toHaveCount(0);
        await page.getByRole('button', { name: 'Rétablir', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Rétablir l’image entière' })).toBeVisible();
        return { before, resized, cropped: await image.boundingBox() };
      });
      await metrics('after-crop');
      await check('ten imports and mixed layer commands', async () => {
        for (let n = 2; n <= 10; n++) {
          await page.getByLabel('Fichier image').setInputFiles(path.join(root, 'data/output/windows-qa-004/fixtures/image-5m.png'));
          await expect(page.locator('[data-image-edit-id]')).toHaveCount(n);
          await page.getByRole('button', { name: 'Mettre au dernier plan', exact: true }).click();
          await page.getByRole('button', { name: 'Mettre au premier plan', exact: true }).click();
        }
        return { images: 10, persistence: 'Native source documents intentionally remain session-only; asset deduplication checked in export payload below.' };
      });
      await metrics('ten-images');
      for (const quality of ['maximum', 'balanced', 'small']) await check(`native export ${quality}`, async () => {
        await page.evaluate(() => {
          if (window.qaObserveExportPlan) return;
          const append = FormData.prototype.append;
          FormData.prototype.append = function (...args) {
            if (args[0] === 'plan' && typeof args[1] === 'string') window.qaLastExportPlan = JSON.parse(args[1]);
            return append.apply(this, args);
          };
          window.qaObserveExportPlan = true;
        });
        await page.getByRole('button', { name: 'Fichier', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Exporter / Finaliser…' }).click();
        await page.getByLabel('Profil de compression').selectOption(quality);
        const response = page.waitForResponse(r => r.url().endsWith('/pdf/export/organize'), { timeout: 60000 });
        await page.getByRole('button', { name: 'Exporter', exact: true }).click();
        const result = await response; expect(result.status()).toBe(200);
        const plan = await page.evaluate(() => window.qaLastExportPlan);
        expect(plan.signatureImages.length).toBe(1);
        expect(plan.images.some(edit => edit.crop && edit.crop.width < .99)).toBe(true);
        const destination = path.join(output, `images-${quality}.pdf`);
        await page.waitForTimeout(500); native('Save', destination);
        await expect.poll(() => fs.existsSync(destination)).toBe(true);
        await expect(page.locator('.document-tab.is-active .document-select')).not.toHaveAttribute('title', sourceName);
        await page.locator(`.document-select[title="${sourceName}"]`).click();
        return { bytes: fs.statSync(destination).size, destination: path.basename(destination), uniqueExportAssets: plan.signatureImages.length };
      });
      await metrics('after-export');
      await page.screenshot({ path: path.join(output, 'reports', 'image-heavy.png') });
    }
    fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
    await page.screenshot({ path: path.join(output, 'screenshots', `${scenario}.png`) });
  } finally { await browser.close(); write(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
