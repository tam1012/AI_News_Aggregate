const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    const res = await page.goto('https://old.reddit.com/r/technology/comments/1izwzcd.json', { waitUntil: 'networkidle2' });
    console.log("Status:", res.status());
    const content = await page.evaluate(() => document.body.innerText);
    console.log("Response text:", content.substring(0, 500));
  } catch(e) {
    console.log("Error:", e.message);
  }
  await browser.close();
})();
