// Run against one repository QA WebView2 instance with CDP on loopback 9222.
// No document contents or passwords are recorded; only phases, sizes and hashes.
const { chromium, expect } = require('../apps/web/node_modules/@playwright/test');
const { execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'data/output/mvp-001');
const label = process.argv[2] || 'before';
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid QA label');
const evidence = { label, timestamp: new Date().toISOString(), environment: 'Windows development host; not a clean VM', cases: [] };
const write = () => fs.writeFileSync(path.join(output, `save-${label}.json`), JSON.stringify(evidence, null, 2));
function native(action, target) {
  return promisify(execFile)('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts/windows-native-qa.ps1'), '-Action', action, ...(target ? ['-Path', target] : [])], { encoding: 'utf8', timeout: 30000, windowsHide: true });
}
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  try {
    const page = browser.contexts().flatMap(context => context.pages()).find(page => /localhost|127\.0\.0\.1/.test(page.url()));
    if (!page) throw Error('QA page missing');
    page.setDefaultTimeout(20000);
    await expect.poll(() => page.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke('get_backend_status')).state)).toBe('ready');
    evidence.url = page.url();
    await page.evaluate(() => {
      window.__mvpSaveTrace = [];
      const invoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = function(command, args, options) {
        if (command.startsWith('save_pdf')) window.__mvpSaveTrace.push({ phase: 'desktop-invoke', command, bytes: args?.content?.byteLength ?? args?.byteLength, at: performance.now() });
        return invoke.call(this, command, args, options);
      };
    });
    const fixtures = JSON.parse(fs.readFileSync(path.join(output, 'large-fixtures.json')));
    for (const fixture of (process.argv.includes('--large-only') ? fixtures.slice(-1) : fixtures)) {
      const item = { sourceBytes: fixture.bytes, phases: [], status: 'FAIL' };
      evidence.cases.push(item); write();
      const source = path.join(root, fixture.file);
      const originalHash = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      const destination = path.join(output, `saved-${label}-${path.basename(source)}`);
      try {
        await page.evaluate(() => { performance.clearMarks('pdf-save-blob'); performance.clearMarks('pdf-save-invoke'); performance.clearMarks('pdf-save-limited'); });
        await page.locator('input[type=file][aria-label="Ouvrir un PDF"]').setInputFiles(source);
        await expect(page.getByRole('button', { name: `${path.basename(source)}, document actif` })).toBeVisible();
        const responsePromise = page.waitForResponse(response => response.url().endsWith('/pdf/export/organize') && response.request().method() === 'POST');
        await page.keyboard.press('Control+Shift+s');
        const response = await responsePromise;
        item.phases.push({ phase: 'backend-response', status: response.status() });
        if (!response.ok()) throw Error(`Backend ${response.status()}`);
        if (process.argv.includes('--policy') && fixture.bytes > 25 * 1024 * 1024) {
          await expect(page.getByText(/dépasse la taille validée.*25 Mio/)).toBeVisible();
          const theme = page.getByRole('switch', { name: 'Basculer le thème' });
          const before = await theme.getAttribute('aria-checked');
          await theme.click();
          await expect(theme).not.toHaveAttribute('aria-checked', before);
          if (fs.existsSync(destination)) throw Error('Unexpected oversized output');
          item.limitation = 'PASS: oversized native Save refused before IPC; UI interactive';
        } else {
          await native('Save', destination);
        item.phases.push({ phase: 'native-dialog-submitted' });
        await expect.poll(() => fs.existsSync(destination), { timeout: 30000 }).toBe(true);
        await expect(page.getByText(/PDF sauvegardé avec succès/)).toBeVisible();
        item.phases.push({ phase: 'disk', bytes: fs.statSync(destination).size });
          execFileSync('uv', ['run', '--project', path.join(root, 'services/pdf-engine'), 'python', '-m', 'scripts.validate-qa-pdf', destination], { cwd: root, windowsHide: true, stdio: 'pipe' });
        }
        item.status = 'PASS';
      } catch (error) { item.error = error.message; }
      item.phases.push(...await page.evaluate(() => window.__mvpSaveTrace.splice(0)));
      item.phases.push(...await page.evaluate(() => performance.getEntriesByType('mark').filter(mark => mark.name.startsWith('pdf-save-')).map(mark => ({ phase: mark.name, bytes: mark.detail?.bytes, at: mark.startTime }))));
      item.sourceIntact = originalHash === crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      write();
      if (item.status !== 'PASS') break;
    }
  } finally { await browser.close(); write(); }
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.cases.some(item => item.status !== 'PASS' || !item.sourceIntact) ? 1 : 0;
})().catch(error => { evidence.error = error.message; write(); console.error(error.message); process.exitCode = 1; });
