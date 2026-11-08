/**
 * Writes the cloud-designer GLB fixtures beside this file, as README.md
 * here describes: on cloud-designer's default preset, Regenerate, then Cut
 * & Glue, then Export Cloud GLB and Export Wireframe GLB, in the installed
 * Google Chrome.
 *
 * Build and serve cloud-designer at the commit README.md names first, then:
 *   node tests/fixtures/cloud-designer/export-glb.ts [url]
 * (url defaults to http://127.0.0.1:4184/). Node runs this file with its
 * built-in TypeScript type stripping (Node 23.6 or later).
 */
import { chromium, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://127.0.0.1:4184/';
const FILES = { 'Export Cloud GLB': 'default-cloud-cloud.glb', 'Export Wireframe GLB': 'default-cloud-wireframe.glb' };

/** The open accordion section of the cloud-designer panel whose header starts with `label`. */
async function openPanel(page: Page, label: string): Promise<Locator> {
  const section = page.locator('.accordion').filter({ has: page.locator('.accordion-header', { hasText: new RegExp(`^${label}\\b`) }) });
  if ((await section.locator('.accordion-body').count()) === 0) await section.locator('.accordion-header').click();
  await section.locator('.accordion-body').waitFor();
  return section.locator('.accordion-body');
}

/**
 * Click `button` and wait until its label has gone to `busy` and back to
 * `idle` (the worker job ran). A MutationObserver set up before the click
 * sees a busy phase shorter than any polling interval.
 */
async function runJob(button: Locator, busy: string, idle: string): Promise<void> {
  const done = await button.evaluateHandle(
    (el, [busyText, idleText]) => {
      const state = { sawBusy: false, done: false };
      const observer = new MutationObserver(() => {
        const text = el.textContent?.trim();
        if (text === busyText) state.sawBusy = true;
        else if (state.sawBusy && text === idleText && !(el as HTMLButtonElement).disabled) {
          state.done = true;
          observer.disconnect();
        }
      });
      observer.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
      return state;
    },
    [busy, idle] as const,
  );
  await button.click();
  await button.page().waitForFunction(state => state.done, done, { timeout: 120_000 });
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  // A new context has empty localStorage, so the editor opens on its default preset.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, acceptDownloads: true });
  await page.goto(url);
  await page.locator('.accordion-header').nth(5).waitFor();

  const flowCloud = await openPanel(page, 'Flow Cloud');
  await runJob(flowCloud.getByRole('button', { name: /^(Regenerate|Working\.\.\.)$/ }), 'Working...', 'Regenerate');
  await runJob(flowCloud.getByRole('button', { name: /^(Cut & Glue|Generating\.\.\.)$/ }), 'Generating...', 'Cut & Glue');

  const exportPanel = await openPanel(page, 'Export');
  for (const [button, file] of Object.entries(FILES)) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportPanel.getByRole('button', { name: button, exact: true }).click(),
    ]);
    if (download.suggestedFilename() !== file) throw new Error(`${button} wrote ${download.suggestedFilename()}, not ${file}`);
    const bytes = await readFile(await download.path());
    await writeFile(new URL(file, import.meta.url), bytes);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    console.log(`${file}: ${bytes.length} bytes, SHA-256 ${sha256}`);
  }
} finally {
  await browser.close();
}
