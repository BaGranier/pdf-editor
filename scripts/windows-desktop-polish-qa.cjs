// Native development-build QA; never attach to an installed candidate's WebView.
// Prerequisites: cargo build in apps/desktop/src-tauri; Vite on 127.0.0.1:5173.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const executable = path.join(root, 'apps/desktop/src-tauri/target/debug/pdf-studio-local.exe');
const simulatedScale = process.env.PDF_STUDIO_QA_SCALE;
const launchMode = process.env.PDF_STUDIO_QA_LAUNCH_MODE || 'rapid';
if (simulatedScale && !['1', '1.25', '2'].includes(simulatedScale)) throw Error('Unsupported QA scale');
if (!['rapid', 'batch'].includes(launchMode)) throw Error('Unsupported QA launch mode');
const output = path.join(root, 'data/output/desktop-005', simulatedScale ? `dpr-${simulatedScale}` : '', launchMode === 'batch' ? 'cold-batch' : '');
const fixtures = path.join(root, 'apps/web/e2e/fixtures');
const report = { scope: 'Windows native debug Tauri/WebView2, synthetic PDFs; no installed-candidate or physical Explorer qualification', simulatedScale: simulatedScale || null, launchMode, checks: [] };
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(output, 'os-temp'), { recursive: true });
const env = { ...process.env,
  PDF_STUDIO_QA_DATA_ROOT: output,
  WEBVIEW2_USER_DATA_FOLDER: path.join(output, 'webview-profile'),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9235' + (simulatedScale ? ` --force-device-scale-factor=${simulatedScale}` : ''),
  TEMP: path.join(output, 'os-temp'), TMP: path.join(output, 'os-temp'),
  UV_CACHE_DIR: path.join(root, '.uv-cache'),
};
const log = fs.openSync(path.join(output, 'native.log'), 'a');
const invoke = (args) => spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', log, log] });
const native = (pid, action, width = 1280, height = 820) => JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-desktop-polish-window.ps1'), '-ApplicationPid', String(pid), '-Action', action, '-Width', String(width), '-Height', String(height)], { encoding: 'utf8', windowsHide: true }));
const write = () => fs.writeFileSync(path.join(output, 'native-results.json'), JSON.stringify(report, null, 2));
async function check(name, action) {
  const start = performance.now();
  try { report.checks.push({ name, status: 'PASS', evidence: await action(), ms: Math.round(performance.now() - start) }); }
  catch (error) { report.checks.push({ name, status: 'FAIL', error: error.message }); throw error; }
  finally { write(); }
}
async function exited(child) {
  await expect.poll(() => child.exitCode, { timeout: 15000 }).toBe(0);
}
(async () => {
  // Exercise spaces and relative arguments without touching user documents.
  const spaced = path.join(output, 'QA with spaces.pdf');
  fs.copyFileSync(path.join(fixtures, 'pdf-render-sharpness.pdf'), spaced);
  const otherFiles = [path.join(fixtures, 'pdf-small-1-page.pdf'), path.join(fixtures, 'pdf-small-5-pages.pdf')];
  let first = invoke(launchMode === 'batch' ? [spaced, ...otherFiles] : [spaced]);
  let early = launchMode === 'batch' ? [] : otherFiles.map(file => invoke([file]));
  let browser;
  try {
    await expect.poll(async () => {
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:9235', { timeout: 1000 }); return true; }
      catch { return false; }
    }, { timeout: 30000 }).toBe(true);
    const launches = [first, ...early];
    await expect.poll(() => launches.filter(child => child.exitCode === null).length).toBe(1);
    first = launches.find(child => child.exitCode === null);
    early = launches.filter(child => child !== first);
    let page;
    await expect.poll(() => {
      page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('http://127.0.0.1:5173'));
      return !!page;
    }, { timeout: 30000 }).toBe(true);
    page.setDefaultTimeout(15000);
    await check(`cold start: ${launchMode === 'batch' ? 'one invocation with three PDFs' : 'multiple rapid invocations'}`, async () => {
      await Promise.all(early.map(exited));
      await expect(page.locator('.document-tab')).toHaveCount(3, { timeout: 30000 });
      const state = native(first.pid, 'Inspect');
      expect(state.windows).toBe(1);
      return { ...state, documents: 3, dpr: await page.evaluate(() => window.devicePixelRatio) };
    });
    await check('minimized instance receives multi-file batch and focus', async () => {
      expect(native(first.pid, 'Minimize').minimized).toBe(true);
      const secondary = invoke([path.join(fixtures, 'conversion-simple-text.pdf'), path.join(fixtures, 'pdf-native-text.pdf')]);
      await exited(secondary);
      await expect(page.locator('.document-tab')).toHaveCount(5);
      const state = native(first.pid, 'Inspect');
      expect(state.minimized).toBe(false);
      expect(state.visible).toBe(true);
      expect(state.foregroundPid).toBe(first.pid);
      expect(state.windows).toBe(1);
      return { ...state, documents: 5 };
    });
    await check('relative and differently cased paths activate existing tab', async () => {
      const duplicate = invoke([path.relative(root, spaced).toUpperCase()]);
      await exited(duplicate);
      await expect(page.locator('.document-tab.is-active .document-select')).toHaveAttribute('title', path.basename(spaced));
      await expect(page.locator('.document-tab')).toHaveCount(5);
      return { documents: 5, active: path.basename(spaced) };
    });
    await page.locator(`.document-select[title="${path.basename(spaced)}"]`).click();
    await check('native File menu contained in viewport', async () => {
      await page.getByRole('button', { name: 'Fichier', exact: true }).click();
      const menu = page.getByRole('menu', { name: 'Fichier' });
      await expect(menu).toBeVisible();
      const box = await menu.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.y).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
      await page.screenshot({ path: path.join(output, 'native-file-menu.png') });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Fichier', exact: true })).toBeFocused();
      return { box, viewport };
    });
    await check('native low-zoom bitmap and text layer', async () => {
      const metrics = [];
      const canvas = page.locator('.pdf-canvas').first();
      for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Réduire le zoom' }).click();
      for (const zoom of [0.5, 1]) {
        if (zoom === 1) for (let index = 0; index < 5; index++) await page.getByRole('button', { name: 'Augmenter le zoom' }).click();
        await expect(canvas).toHaveAttribute('data-render-zoom', String(zoom));
        const metric = await canvas.evaluate(canvas => ({ cssWidth: canvas.getBoundingClientRect().width, cssHeight: canvas.getBoundingClientRect().height, width: canvas.width, height: canvas.height, ratio: Number(canvas.dataset.renderPixelRatio), zoom: Number(canvas.dataset.renderZoom) }));
        expect(metric.width).toBeGreaterThanOrEqual(599);
        expect(Math.abs(metric.width - metric.cssWidth * metric.ratio)).toBeLessThanOrEqual(1);
        metrics.push(metric);
        await canvas.screenshot({ path: path.join(output, `native-zoom-${zoom}.png`) });
      }
      await expect(page.locator('.pdf-text-layer').first()).toBeVisible();
      return metrics;
    });
    await check('native resize, fitted 75% and search geometry', async () => {
      await page.getByLabel("Mode d'affichage").selectOption('single-page');
      const target = await page.getByTestId('pdf-viewer').evaluate(viewer => ({
        width: innerWidth,
        height: Math.round(innerHeight + 800 * 0.75 + 40 + viewer.querySelector('.viewer-page-navigation').offsetHeight - viewer.clientHeight),
        dpr: devicePixelRatio,
      }));
      // Win32 sizes are physical pixels; innerWidth/Height are CSS pixels.
      native(first.pid, 'Resize', Math.round(target.width * target.dpr), Math.round(target.height * target.dpr));
      await page.getByRole('button', { name: 'Ajuster à la page' }).click();
      const canvas = page.locator('.pdf-canvas').first();
      await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-render-zoom')) - 0.75)).toBeLessThanOrEqual(0.01);
      await canvas.screenshot({ path: path.join(output, 'native-zoom-0.75.png') });
      await page.keyboard.press('Control+f');
      await page.getByRole('textbox', { name: 'Rechercher dans le document' }).fill('Reading PDF');
      await expect(page.locator('.pdf-search-highlight').first()).toBeVisible();
      const selection = await page.locator('.pdf-text-layer span').filter({ hasText: 'Reading PDF' }).first().evaluate(span => {
        const range = document.createRange(); range.selectNodeContents(span);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        return selection.toString();
      });
      expect(selection).toContain('Reading PDF');
      await page.keyboard.press('Escape');
      return { target, zoom: Number(await canvas.getAttribute('data-render-zoom')), selection };
    });
    await check('invalid PDF path does not discard the following valid file', async () => {
      const batch = invoke([path.join(output, 'missing.pdf'), path.join(fixtures, 'pdf-landscape-portrait.pdf')]);
      await exited(batch);
      await expect(page.locator('.document-tab')).toHaveCount(6);
      return { documents: 6 };
    });
  } finally {
    if (browser) await browser.close();
    if (first.exitCode === null) {
      native(first.pid, 'Close');
      await expect.poll(() => first.exitCode, { timeout: 15000 }).not.toBe(null);
    }
    fs.closeSync(log);
    write();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
