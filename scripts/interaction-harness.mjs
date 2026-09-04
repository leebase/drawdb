// usage: node harness.mjs web <distDir> | node harness.mjs electron <repoDir>
import { chromium, _electron as electron } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const [mode, target] = process.argv.slice(2);
const ADD_TABLE = 'button:has(svg path[d^="M4 2 L20 2"])';
const errors = []; const hook = (page) => { page.on("pageerror", e => errors.push("PAGEERROR: " + e.message.split("\n")[0])); page.on("console", m => { if (m.type() === "error") errors.push("CONSOLE: " + m.text().slice(0, 400)); }); };
let page, browser, app, srv;
if (mode === "web") {
  const DIST = target; const port = 43118;
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".wasm": "application/wasm" };
  srv = http.createServer((req, res) => { let f = path.join(DIST, decodeURIComponent(req.url.split("?")[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, "index.html"); res.setHeader("Content-Type", types[path.extname(f)] || "application/octet-stream"); fs.createReadStream(f).pipe(res); }).listen(port, "127.0.0.1");
  browser = await chromium.launch(); page = await browser.newPage({ viewport: { width: 1372, height: 888 } }); hook(page);
  await page.goto(`http://127.0.0.1:${port}/editor`, { waitUntil: "networkidle" });
} else {
  app = await electron.launch({ args: [path.join(target, "dist-electron/main.cjs")], cwd: target, timeout: 60000 });
  page = await app.firstWindow(); hook(page); await page.waitForLoadState("domcontentloaded");
}
await page.waitForTimeout(2000);
const modalText = await page.locator(".semi-modal-wrap").allInnerTexts().catch(()=>[]);
if (modalText.length) { console.error("STARTUP MODAL:", JSON.stringify(modalText).slice(0,600)); const cancel = page.locator(".semi-modal-wrap button").filter({ hasText: /cancel|close|skip|later|no thanks/i }).first(); if (await cancel.count()) await cancel.click(); else await page.keyboard.press("Escape"); await page.waitForTimeout(800); }
const before = await page.evaluate(() => document.body.innerText.length);
const btn = page.locator(ADD_TABLE).first();
const visible = await btn.isVisible().catch(() => false);
if (visible) { await btn.click(); await page.waitForTimeout(1500); }
const after = await page.evaluate(() => document.body.innerText.length);
const tables = await page.locator("foreignObject").count();
console.log(JSON.stringify({ mode, addTableButtonVisible: visible, bodyTextBefore: before, bodyTextAfter: after, foreignObjects: tables, errors }, null, 1));
if (browser) await browser.close(); if (app) await app.close(); if (srv) srv.close();
process.exit(0);
