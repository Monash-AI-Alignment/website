// Headless render check. Usage: node check.js <url> [textToAssert]
// Exits 1 on any page/console error, or if textToAssert is given and not found.
const puppeteer = require('puppeteer-core');
(async () => {
  const url = process.argv[2];
  const needle = process.argv[3];
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const body = await page.evaluate(() => document.body.innerText);
  const shadow = await page.evaluate(() => {
    const a = document.querySelector('d-article');
    return a && a.shadowRoot ? a.shadowRoot.textContent.slice(0, 600) : '(no d-article shadow)';
  });
  console.log('=== CONSOLE/PAGE ERRORS ===\n' + (errors.join('\n') || '(none)'));
  console.log('=== BODY TEXT (first 900) ===\n' + body.slice(0, 900));
  console.log('=== D-ARTICLE SHADOW (first 600) ===\n' + shadow);
  const combined = body + ' ' + shadow;
  const missing = needle && !combined.includes(needle);
  if (missing) console.log('=== MISSING ASSERTION: "' + needle + '" ===');
  await browser.close();
  process.exit(errors.length || missing ? 1 : 0);
})();
