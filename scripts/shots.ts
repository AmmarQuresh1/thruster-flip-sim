// Headless screenshots of the built app at chosen sim times.
// Usage: npm run build && npx tsx scripts/shots.ts [camera] [times...]
// Writes PNGs to ./shots. Uses software WebGL, so it's slow but needs no GPU.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const cam = process.argv[2] ?? 'event';
const times = (process.argv.slice(3).length ? process.argv.slice(3) : ['0', '1.6', '2.4', '3.0', '3.6']).map(Number);
const width = Number(process.env.W ?? 1280);
const height = Number(process.env.H ?? 720);
mkdirSync('shots', { recursive: true });

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5199/' + (process.env.HASH ? '#' + process.env.HASH : ''));
await page.waitForFunction(() => (window as any).__flip, null, { timeout: 120000 });
await page.evaluate((c) => (window as any).__flip.setCam(c), cam);
await page.waitForTimeout(1500);
if (times[0] === 0) await page.screenshot({ path: `shots/${cam}-idle-${width}.png`, timeout: 180000 });
await page.evaluate(() => (window as any).__flip.setSlow(true));
await page.evaluate(() => (window as any).__flip.play());
for (const t of times.filter((x: number) => x > 0)) {
  await page.waitForFunction((tt) => (window as any).__flip.t >= tt, t, { timeout: 300000, polling: 50 });
  await page.screenshot({ path: `shots/${cam}-t${t.toFixed(1)}-${width}.png`, timeout: 180000 });
}
if (process.env.END) {
  await page.evaluate(() => (window as any).__flip.setSlow(false));
  await page.waitForFunction(() => document.getElementById('result') && !document.getElementById('result')!.hidden, null, { timeout: 300000 });
  await page.screenshot({ path: `shots/${cam}-result-${width}.png`, timeout: 180000 });
}
console.log(JSON.stringify(await page.evaluate(() => (window as any).__flip.outcome)));
if (errors.length) console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
await server.close();
