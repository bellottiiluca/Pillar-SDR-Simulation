import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Vapi') || msg.text().includes('Error')) {
      console.log('PAGE LOG:', msg.text());
      if (msg.args().length > 0) {
        msg.args().forEach(async arg => {
          try {
            const val = await arg.jsonValue();
            console.log('ARG:', JSON.stringify(val));
          } catch(e) {}
        });
      }
    }
  });
  
  // Connect to the local server
  await page.goto('http://localhost:3001');
  console.log("Page loaded");
  
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const btn = document.querySelector('.boot-btn.primary');
    if (btn) btn.click();
  });
  console.log("Boot finished");
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("Looking for Slack CTA...");
  await page.evaluate(() => {
    const btn = document.querySelector('.ws-cta-btn');
    if (btn) btn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  console.log("Looking for Call button on CRM...");
  await page.evaluate(() => {
    const btn = document.getElementById('discovery-call-btn');
    if (btn) btn.click();
  });
  
  console.log("Call started, waiting 12 seconds for Vapi...");
  await new Promise(r => setTimeout(r, 12000));
  
  await browser.close();
})();
