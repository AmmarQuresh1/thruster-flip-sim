// Stress check for the "lags more every run" report: all thrusters on, play/reset repeatedly,
// and compare frames per second at the start and after several cycles.
// Usage: HASH=<share code> npx tsx scripts/stress.ts
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5197 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:5197/#' + (process.env.HASH ?? ''));
await page.waitForFunction(() => (window as any).__flip, null, { timeout: 120000 });
// passed as a string so the bundler's helpers don't leak into the page
const FPS = `new Promise((res) => { let n = 0; const t0 = performance.now();
  const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res((n * 1000) / (performance.now() - t0)); };
  requestAnimationFrame(f); })`;
const fps = () => page.evaluate(FPS) as Promise<number>;
console.log('idle fps', (await fps()).toFixed(1));
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => (window as any).__flip.play());
  await page.waitForTimeout(1500);
  if (i === 0) console.log('mid-run fps (cycle 1)', (await fps()).toFixed(1));
  await page.evaluate(() => (window as any).__flip.resetRun());
}
console.log('idle fps after 6 run/reset cycles', (await fps()).toFixed(1));
await browser.close();
await server.close();
