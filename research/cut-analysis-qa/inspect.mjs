import { chromium } from 'file:///C:/Users/17157/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser = await chromium.launch({headless:true,executablePath:"C:/Users/17157/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe"});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://localhost:5173/pure.html');
await page.waitForTimeout(1500);
console.log(await page.locator('body').innerText());
console.log(await page.locator('math-field').evaluateAll(es=>es.map(e=>({value:e.value,outer:e.outerHTML.slice(0,350)}))));
await page.screenshot({path:'research/cut-analysis-qa/initial.png'});
await browser.close();


