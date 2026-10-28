// Qualify one installed Windows Preview under data/output/mvp-001.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data/output/mvp-001');
const installed = path.join(output, 'installation été QA');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const evidence = { status: 'FAIL', environment: 'Windows development host, not a clean VM', checks: {}, timestamp: new Date().toISOString() };
const write = () => fs.writeFileSync(path.join(output, 'native-mvp.json'), JSON.stringify(evidence, null, 2));
const execute = promisify(execFile);
const native = (action, target) => execute('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-native-qa.ps1'), '-Action', action, '-Path', target], { windowsHide: true, timeout: 30000 });
async function validate(file) {
  const { stdout } = await execute('uv', ['run', '--project', path.join(root, 'services/pdf-engine'), 'python', '-m', 'scripts.validate-qa-pdf', file], { cwd: root, windowsHide: true });
  return JSON.parse(stdout);
}
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'));
    if (!page) throw Error('Installed QA WebView missing');
    page.setDefaultTimeout(20000);
    await expect.poll(() => page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('get_backend_status')).state)).toBe('ready');
    const executable = path.join(installed, 'pdf-studio-local.exe');
    evidence.executable = relative(executable); evidence.sha256 = hash(executable);
    evidence.sidecar = relative(path.join(installed, 'pdf-engine.exe'));
    evidence.sidecarSha256 = hash(path.join(root, evidence.sidecar));
    if (evidence.sidecarSha256 !== hash(path.join(root, 'apps/desktop/src-tauri/binaries/pdf-engine-x86_64-pc-windows-msvc.exe'))) throw Error('Installed sidecar differs from built payload');
    const startup = JSON.parse(fs.readFileSync(path.join(output, 'reports/startup.json')));
    if (!startup.pdfCanvasObservedAt) throw Error('Startup PDF not qualified');
    evidence.checks.startup = 'PASS'; write();
    const source = path.join(root, 'apps/web/e2e/fixtures/conversion-simple-text.pdf');
    const before = hash(source);
    await page.keyboard.press('Control+o'); await native('Open', source);
    await expect(page.getByRole('button', { name: 'conversion-simple-text.pdf, document actif' })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter du texte' }).click();
    const layer = page.getByLabel("Couche d'édition de la page 1");
    const box = await layer.boundingBox();
    await page.mouse.move(box.x + 50, box.y + 90); await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 140, { steps: 4 }); await page.mouse.up();
    const input = page.getByLabel('Texte ajouté page 1');
    await input.fill('PREVIEW INSTALLED WITNESS'); await input.blur();
    const saved = path.join(output, `installed-core-${Date.now()}.pdf`);
    await page.keyboard.press('Control+s'); await native('Save', saved);
    await expect(page.getByText(/PDF sauvegardé avec succès/)).toBeVisible();
    if (!(await validate(saved)).text.replace(/\s+/g, '').includes('PREVIEWINSTALLEDWITNESS')) throw Error('Saved text missing');
    const initial = hash(saved);
    await input.fill('PREVIEW INSTALLED REVISED'); await input.blur();
    await page.keyboard.press('Control+s');
    await expect.poll(() => hash(saved)).not.toBe(initial);
    if (!(await validate(saved)).text.replace(/\s+/g, '').includes('PREVIEWINSTALLEDREVISED')) throw Error('Direct Save text missing');
    if (hash(source) !== before) throw Error('Source changed');
    evidence.checks.save = 'PASS'; write();
    await page.keyboard.press('Control+o'); await native('Open', saved);
    await expect.poll(async () => (await page.locator('.textLayer').allTextContents()).join('').replace(/\s+/g, '')).toContain('PREVIEWINSTALLEDREVISED');
    evidence.checks['export-reopen'] = 'PASS'; write();
    const large = JSON.parse(fs.readFileSync(path.join(output, path.basename(process.env.MVP_SAVE_EVIDENCE || 'save-installed-boundary.json'))));
    if (large.cases.length !== 4 || !large.cases.every(item => item.status === 'PASS' && item.sourceIntact) || !large.cases[3].limitation || !large.cases.some(item => item.sourceBytes > 24 * 1024 * 1024 && !item.limitation)) throw Error('Large-save policy not qualified');
    evidence.checks['large-save-policy'] = 'PASS'; write();
    await page.keyboard.press('Control+o');
    await native('Open', path.join(root, 'apps/web/e2e/fixtures/conversion-scan.pdf'));
    await expect(page.getByRole('button', { name: 'conversion-scan.pdf, document actif' })).toBeVisible();
    await execute(process.execPath, [path.join(root, 'scripts/windows-qa-cdp.cjs'), 'ocr-eng'], { cwd: root, env: { ...process.env, PDF_STUDIO_QA_OUTPUT: 'data/output/mvp-001' }, windowsHide: true, timeout: 150000 });
    const ocr = JSON.parse(fs.readFileSync(path.join(output, 'reports/ocr-eng.json')));
    if (!ocr.checks.length || !ocr.checks.every(check => check.status === 'OK')) throw Error('Installed OCR failed');
    evidence.checks['ocr-bundled'] = 'PASS';
    const index = path.join(root, 'apps/web/dist/index.html');
    const assets = fs.readFileSync(index, 'utf8').match(/\/assets\/[^" ]+\.(?:js|css)/g) || [];
    evidence.webHashes = Object.fromEntries([index, ...assets.map(asset => path.join(root, 'apps/web/dist', asset))].map(file => [relative(file), hash(file)]));
    const loaded = await page.locator('script[src], link[rel="stylesheet"][href]').evaluateAll(elements => elements.map(element => element.getAttribute('src') || element.getAttribute('href')).filter(asset => asset?.startsWith('/assets/')));
    // Read the already-loaded resources through CDP: CSP intentionally does not
    // permit fetch() to arbitrary origins, including this asset protocol.
    const client = await page.context().newCDPSession(page);
    const scripts = [], styles = [];
    client.on('Debugger.scriptParsed', script => scripts.push(script));
    client.on('CSS.styleSheetAdded', event => styles.push(event.header));
    await client.send('DOM.enable'); await client.send('CSS.enable'); await client.send('Debugger.enable');
    for (const asset of assets) {
      if (!loaded.includes(asset)) throw Error('Installed web payload differs from dist');
      let content;
      if (asset.endsWith('.js')) {
        const script = scripts.find(script => script.url.endsWith(asset));
        if (!script) throw Error('Loaded JS source unavailable');
        content = (await client.send('Debugger.getScriptSource', { scriptId: script.scriptId })).scriptSource;
      } else {
        const style = styles.find(style => style.sourceURL.endsWith(asset));
        if (!style) throw Error('Loaded CSS source unavailable');
        content = (await client.send('CSS.getStyleSheetText', { styleSheetId: style.styleSheetId })).text;
      }
      const actual = crypto.createHash('sha256').update(content).digest('hex');
      if (actual !== evidence.webHashes[relative(path.join(root, 'apps/web/dist', asset))]) throw Error('Installed asset hash mismatch');
    }
    await client.send('Debugger.disable'); await client.detach();
    evidence.checks['installed-web-payload'] = 'PASS';
    evidence.status = 'PASS';
  } catch (error) { evidence.error = error.message; process.exitCode = 1; }
  finally { write(); await browser.close(); }
  console.log(JSON.stringify(evidence, null, 2));
})().catch(error => { evidence.error = error.message; write(); console.error(error.message); process.exitCode = 1; });
