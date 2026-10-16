// Export the hero car and lineup vehicles as .glb files into ./models.
// Usage: npx tsx scripts/export-glb.ts
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('models', { recursive: true });
const server = await createServer({ server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', String(e)));
await page.goto('http://localhost:5198/export.html');
await page.waitForFunction(() => (window as any).__export, null, { timeout: 60000 });
const files: Record<string, string> = await page.evaluate(() => (window as any).__export());
for (const [name, b64] of Object.entries(files)) {
  writeFileSync(`models/${name}.glb`, Buffer.from(b64, 'base64'));
  console.log(`models/${name}.glb`);
}
await browser.close();
await server.close();
