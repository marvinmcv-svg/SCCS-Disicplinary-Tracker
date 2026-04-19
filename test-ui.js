const { chromium } = require('playwright');
const { spawn } = require('child_process');

async function startServers() {
  console.log('Starting backend server...');
  const backend = spawn('npx', ['ts-node', 'server/index.ts'], {
    cwd: 'C:\\Users\\KB\\Documents\\Open code\\discipline-tracker-app',
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: true
  });

  console.log('Starting frontend server...');
  const frontend = spawn('node', ['node_modules/vite/bin/vite.js', '--host'], {
    cwd: 'C:\\Users\\KB\\Documents\\Open code\\discipline-tracker-app\\client',
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    shell: true
  });

  // Wait for servers to start
  await new Promise(resolve => setTimeout(resolve, 5000));

  return { backend, frontend };
}

async function runTest() {
  let backend, frontend;

  try {
    ({ backend, frontend } = await startServers());

    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });

    console.log('Page title:', await page.title());

    // Wait for React to render
    await page.waitForTimeout(3000);

    // Get the HTML content
    const rootContent = await page.$eval('#root', el => el.innerHTML).catch(() => 'Error getting root');
    console.log('Root content length:', rootContent.length);

    if (rootContent.length > 0) {
      console.log('SUCCESS: React app rendered!');
    } else {
      console.log('FAILURE: React app did not render');
    }

    // Take screenshot
    await page.screenshot({ path: 'screenshot.png', fullPage: true });
    console.log('Screenshot saved to screenshot.png');

    await browser.close();
    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (backend) backend.kill();
    if (frontend) frontend.kill();
  }
}

runTest();