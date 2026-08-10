import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  await page.goto('file://' + __dirname + '/index.html');
  console.log("Page loaded");
  
  // Wait a bit and click "Avvia simulazione"
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const btn = document.querySelector('.boot-btn.primary');
    if (btn) btn.click();
  });
  console.log("Boot finished");
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Wait for the CTA "Avvia chiamata" in Slack
  console.log("Looking for CTA...");
  
  await browser.close();
})();
