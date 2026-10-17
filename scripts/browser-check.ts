// Runs every preset in a real (headless) browser and prints the outcome, to confirm the
// browser build lands the same tricks as the Node test. Usage: npx tsx scripts/browser-check.ts
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5196 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 320 } });
await page.goto('http://localhost:5196/');
await page.waitForFunction('window.__flip', null, { timeout: 120000 });
const ids: string[] = await page.$$eval('#sel-preset option', (os) => os.map((o) => (o as HTMLOptionElement).value));
for (const id of ids.filter((x) => x !== 'custom')) {
  await page.selectOption('#sel-preset', id);
  await page.evaluate('window.__flip.play()');
  await page.waitForFunction("!document.getElementById('result').hidden", null, { timeout: 300000 });
  const o: any = await page.evaluate('window.__flip.outcome');
  console.log(id.padEnd(9), o.status, o.trick, 'gas', o.gasUsed.toFixed(1), 'td', o.touchdownSpeed.toFixed(1));
}
await browser.close();
await server.close();
