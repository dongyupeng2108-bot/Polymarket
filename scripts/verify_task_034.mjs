import { chromium } from '@playwright/test';

(async () => {
  console.log('Starting Task 034 Verification (SSE Console Error Check)...');
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  let sseErrorCaptured = false;
  
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      if (text.includes('SSE Error')) {
        console.error('❌ Captured Forbidden Console Error:', text);
        sseErrorCaptured = true;
      }
    }
  });

  try {
    const url = 'http://localhost:53121/pairs';
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { timeout: 60000 });
    
    // Wait for h1
    await page.waitForSelector('h1', { timeout: 10000 });
    console.log('Page title:', await page.title());
    console.log('H1:', await page.textContent('h1'));

    // List all buttons
    const buttons = await page.$$eval('button', els => els.map(el => el.textContent.trim()));
    console.log('Buttons found:', buttons);

    // Click "Auto Match New Pairs" - finding by partial class or just the first green one
    // Using a more generic selector: button that contains SVG (Sparkles) or specific class
    console.log('Opening Auto Match Dialog...');
    await page.click('button.bg-green-100'); // Assuming this class is unique/stable enough
    
    // Wait for dialog
    await page.waitForSelector('div[role="dialog"]');
    console.log('Dialog opened.');
    
    // List buttons in dialog
    const dialogButtons = await page.$$eval('div[role="dialog"] button', els => els.map(el => el.textContent.trim()));
    console.log('Dialog buttons:', dialogButtons);
    
    // Click Start Scan - likely the last button or the one that is NOT Cancel
    // "Start Scan" is usually the primary action.
    // In Chinese it might be "开始扫描"
    // I'll click the last button in the dialog footer.
    const startButton = await page.$('div[role="dialog"] button:last-child');
    if (startButton) {
        console.log('Clicking Start button...');
        await startButton.click();
    } else {
        throw new Error('Start button not found');
    }
    
    // Wait for Running state
    // The button text changes to "Scanning..." (or Chinese equiv)
    // We can wait for the button to become disabled or text change.
    await page.waitForTimeout(1000); // Give it a moment to update state
    
    // Verify it's running (optional, but good)
    // Trigger User Stop (Press Escape)
    console.log('Triggering User Stop (Press Escape)...');
    await page.keyboard.press('Escape');
    
    // Wait a bit for close logic to trigger
    await page.waitForTimeout(2000);
    
    // Verify results
    if (sseErrorCaptured) {
        console.error('FAILED: "SSE Error" was captured in console.');
        process.exit(1);
    } else {
        console.log('SUCCESS: No "SSE Error" captured after user stop.');
    }

  } catch (e) {
      console.error('Script Error:', e);
      process.exit(1);
  } finally {
      await browser.close();
  }
})();
