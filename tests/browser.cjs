const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
(async () => {
 const server = http.createServer(async (request, response) => {
  try {
   const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
   if (!file.startsWith(root + path.sep) || file.includes(path.sep + '.git' + path.sep)) throw new Error('Forbidden');
   response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
   response.end(await fs.readFile(file));
  } catch (_) { response.statusCode = 404; response.end('Not found'); }
 });
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 let browser;
 try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [file, button] of [['frontend-browser.html'], ['openpgp-browser.html', 'Run encryption checks']]) {
   const page = await browser.newPage();
   const errors = [];
   page.on('pageerror', error => errors.push(error.message));
   await page.goto(`${origin}/tests/${file}`);
   if (button) await page.getByRole('button', { name: button }).click();
   await page.waitForFunction(() => /checks passed|FAILED:/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
   const status = await page.locator('#status').textContent();
   assert.match(status, /checks passed/, `${file}: ${status}`);
   assert.deepEqual(errors, [], `${file}: uncaught browser errors`);
   console.log(`${file}: ${status}`);
   await page.close();
  }
 } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
