const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  page.on('requestfailed', request => {
    console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
  });

  try {
    console.log("Navigating to URL...");
    await page.goto('https://jush-twse.onrender.com/capital-flow', { waitUntil: 'networkidle0' });
    console.log("Done waiting.");
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    if (bodyHTML.includes("系統出現錯誤")) {
      console.log("Found System Error string in HTML.");
    }
  } catch (err) {
    console.error("Puppeteer error:", err);
  } finally {
    await browser.close();
  }
})();
