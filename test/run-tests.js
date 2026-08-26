/**
 * AeroGuard Headless Test Runner
 * Runs integration tests using Puppeteer with the extension loaded
 * CI/CD compatible with exit codes
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_PATH = path.resolve(__dirname, '..');
const FIXTURES_PATH = path.resolve(__dirname, '../tests/fixtures');

// Configuration
const CONFIG = {
  headless: process.env.HEADLESS !== 'false' ? 'new' : false,
  timeout: parseInt(process.env.TEST_TIMEOUT) || 120000,
  navigationTimeout: 60000,
  youtubeTestDuration: 30000,
  blockRateThreshold: 80,
  youtubeBlockRateThreshold: 70,
  verbose: process.env.VERBOSE === 'true'
};

function log(message, level = 'info') {
  const prefix = {
    info: '  ℹ',
    success: '  ✓',
    error: '  ✗',
    warning: '  ⚠',
    debug: '  ›'
  }[level] || '  •';
  console.log(`${prefix} ${message}`);
}

function logVerbose(message) {
  if (CONFIG.verbose) log(message, 'debug');
}

async function waitForTestResults(page, variableName, timeout = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const result = await page.evaluate(() => window[variableName]);
      if (result && typeof result === 'object' && Object.keys(result).length > 0) {
        return result;
      }
    } catch (e) {
      // Variable not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${variableName}`);
}

async function runBlockRateTest(browser) {
  log('Starting Block Rate Test...');
  const page = await browser.newPage();

  // Track blocked/failed requests
  const requestResults = {
    blocked: [],
    loaded: [],
    failed: []
  };

  page.on('requestfailed', request => {
    const url = request.url();
    const error = request.failure();
    if (error && error.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
      requestResults.blocked.push(url);
    } else {
      requestResults.failed.push({ url, error: error?.errorText });
    }
  });

  page.on('requestfinished', request => {
    const url = request.url();
    if (url.includes('google-analytics') || url.includes('doubleclick') ||
        url.includes('googlesyndication') || url.includes('facebook.net') ||
        url.includes('connect.facebook') || url.includes('ads.') ||
        url.includes('adnxs') || url.includes('rubiconproject') ||
        url.includes('mathtag') || url.includes('quantserve') ||
        url.includes('scorecardresearch') || url.includes('metricool')) {
      requestResults.loaded.push(url);
    }
  });

  const testUrl = `file://${path.join(FIXTURES_PATH, 'block-rate-test.html')}`;
  logVerbose(`Navigating to ${testUrl}`);

  try {
    await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: CONFIG.navigationTimeout });

    // Wait for test results from the page
    const results = await waitForTestResults(page, 'testResults', 60000);

    // Also get our tracked results
    const trackedBlocked = requestResults.blocked.length;
    const trackedLoaded = requestResults.loaded.length;

    log(`Block Rate Test Complete: ${results.blockRate}% (page) | Tracked: ${trackedBlocked} blocked, ${trackedLoaded} loaded`);

    // Combine results - prefer page results as they're more comprehensive
    const combinedResults = {
      blockRate: results.blockRate,
      totalTests: results.totalTests,
      blocked: results.blocked,
      loaded: results.loaded,
      details: results.details,
      trackedBlocked,
      trackedLoaded,
      passed: results.blockRate >= CONFIG.blockRateThreshold
    };

    await page.close();
    return combinedResults;

  } catch (error) {
    log(`Block Rate Test Failed: ${error.message}`, 'error');
    await page.close().catch(() => {});
    throw error;
  }
}

async function runYouTubeTest(browser) {
  log('Starting YouTube Ad Block Test...');
  const page = await browser.newPage();

  // Track ad-related requests
  const adRequests = {
    blocked: [],
    loaded: [],
    adDomains: []
  };

  page.on('requestfailed', request => {
    const url = request.url();
    const error = request.failure();
    if (error && error.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
      if (isAdDomain(url)) {
        adRequests.blocked.push(url);
        const domain = new URL(url).hostname;
        if (!adRequests.adDomains.includes(domain)) {
          adRequests.adDomains.push(domain);
        }
      }
    }
  });

  page.on('requestfinished', request => {
    const url = request.url();
    if (isAdDomain(url)) {
      adRequests.loaded.push(url);
      const domain = new URL(url).hostname;
      if (!adRequests.adDomains.includes(domain)) {
        adRequests.adDomains.push(domain);
      }
    }
  });

  const testUrl = `file://${path.join(FIXTURES_PATH, 'youtube-test.html')}`;
  logVerbose(`Navigating to ${testUrl}`);

  try {
    await page.goto(testUrl, { waitUntil: 'networkidle0', timeout: CONFIG.navigationTimeout });

    // Wait for YouTube test to complete (it runs for ~30 seconds)
    logVerbose(`Waiting ${CONFIG.youtubeTestDuration}ms for YouTube test...`);
    await new Promise(r => setTimeout(r, CONFIG.youtubeTestDuration));

    // Get results from page
    const results = await waitForTestResults(page, 'youtubeTestResults', 10000);

    log(`YouTube Test Complete: ${results.youtubeBlockRate}% | Ad domains: ${adRequests.adDomains.join(', ') || 'none'}`);

    const combinedResults = {
      youtubeBlockRate: results.youtubeBlockRate,
      videoLoaded: results.videoLoaded,
      preRollBlocked: results.preRollBlocked,
      midRollBlocked: results.midRollBlocked,
      adElementsFound: results.adElementsFound,
      adScriptsBlocked: results.adScriptsBlocked,
      adDomainsBlocked: adRequests.blocked.length,
      adDomainsLoaded: adRequests.loaded.length,
      adDomains: adRequests.adDomains,
      details: results.details,
      passed: results.youtubeBlockRate >= CONFIG.youtubeBlockRateThreshold
    };

    await page.close();
    return combinedResults;

  } catch (error) {
    log(`YouTube Test Failed: ${error.message}`, 'error');
    await page.close().catch(() => {});
    throw error;
  }
}

function isAdDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    const adPatterns = [
      'doubleclick.net',
      'googlesyndication.com',
      'googleads.g.doubleclick.net',
      'pagead2.googlesyndication.com',
      'pubads.g.doubleclick.net',
      'ads.pubmatic.com',
      'ads.twitter.com',
      'cdn.adnxs.com',
      'acdn.adnxs.com',
      'pixel.rubiconproject.com',
      'sync.mathtag.com',
      'cm.everesttech.net',
      'pixel.quantserve.com',
      'sb.scorecardresearch.com',
      'tracker.metricool.com',
      'facebook.net',
      'connect.facebook.net',
      'google-analytics.com',
      'googletagmanager.com'
    ];
    return adPatterns.some(pattern => hostname.includes(pattern));
  } catch {
    return false;
  }
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║         AeroGuard Headless Test Runner                    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  log(`Extension path: ${EXTENSION_PATH}`);
  log(`Fixtures path: ${FIXTURES_PATH}`);
  log(`Headless mode: ${CONFIG.headless}`);
  log(`Timeouts: ${CONFIG.timeout}ms total, ${CONFIG.navigationTimeout}ms navigation`);
  log(`Thresholds: Block Rate ${CONFIG.blockRateThreshold}%, YouTube ${CONFIG.youtubeBlockRateThreshold}%\n`);

  let browser;
  const results = {
    timestamp: new Date().toISOString(),
    blockRateTest: null,
    youtubeTest: null,
    passed: false,
    exitCode: 0
  };

  try {
    // Launch browser with extension
    log('Launching Chromium with AeroGuard extension...');
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--enable-extensions',
        '--allow-file-access-from-files',
        '--disable-web-security'
      ],
      timeout: CONFIG.timeout
    });

    log('Browser launched successfully\n');

    // Verify extension loaded - wait a bit for extension to initialize
    await new Promise(r => setTimeout(r, 2000));

    let extensionTarget;
    let extensionId;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const targets = await browser.targets();
      extensionTarget = targets.find(t =>
        t.type() === 'service_worker' && t.url().includes('chrome-extension')
      );

      if (extensionTarget) {
        extensionId = extensionTarget.url().split('/')[2];
        log(`Extension loaded: ${extensionId}\n`);
        break;
      }

      attempts++;
      logVerbose(`Waiting for extension to load... (attempt ${attempts}/${maxAttempts})`);
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!extensionTarget) {
      // Debug: list all targets
      const targets = await browser.targets();
      log('Available targets:', 'debug');
      targets.forEach(t => log(`  ${t.type()}: ${t.url()}`, 'debug'));
      throw new Error('Extension service worker not found - extension may not have loaded');
    }

    // Run Block Rate Test
    results.blockRateTest = await runBlockRateTest(browser);

    // Run YouTube Test
    results.youtubeTest = await runYouTubeTest(browser);

    // Determine overall pass/fail
    const blockRatePassed = results.blockRateTest?.passed ?? false;
    const youtubePassed = results.youtubeTest?.passed ?? false;

    results.passed = blockRatePassed && youtubePassed;
    results.exitCode = results.passed ? 0 : 1;

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Block Rate Test:');
    console.log(`  Block Rate:     ${results.blockRateTest.blockRate}%`);
    console.log(`  Threshold:      ${CONFIG.blockRateThreshold}%`);
    console.log(`  Status:         ${blockRatePassed ? 'PASSED ✓' : 'FAILED ✗'}`);
    console.log(`  Total Tests:    ${results.blockRateTest.totalTests}`);
    console.log(`  Blocked:        ${results.blockRateTest.blocked}`);
    console.log(`  Loaded:         ${results.blockRateTest.loaded}`);

    console.log('\nYouTube Ad Block Test:');
    console.log(`  Block Rate:     ${results.youtubeTest.youtubeBlockRate}%`);
    console.log(`  Threshold:      ${CONFIG.youtubeBlockRateThreshold}%`);
    console.log(`  Status:         ${youtubePassed ? 'PASSED ✓' : 'FAILED ✗'}`);
    console.log(`  Video Loaded:   ${results.youtubeTest.videoLoaded ? 'Yes' : 'No'}`);
    console.log(`  Pre-roll Blocked: ${results.youtubeTest.preRollBlocked ? 'Yes' : 'No'}`);
    console.log(`  Mid-roll Blocked: ${results.youtubeTest.midRollBlocked ? 'Yes' : 'No'}`);
    console.log(`  Ad Elements:    ${results.youtubeTest.adElementsFound}`);
    console.log(`  Ad Scripts Blocked: ${results.youtubeTest.adScriptsBlocked}`);
    console.log(`  Ad Domains:     ${results.youtubeTest.adDomains.join(', ') || 'none'}`);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  OVERALL: ${results.passed ? 'ALL TESTS PASSED ✓' : 'SOME TESTS FAILED ✗'}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    if (CONFIG.verbose) console.error(error);
    results.passed = false;
    results.exitCode = 1;
    results.error = error.message;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }

  // Output JSON results for CI/CD
  const jsonOutput = JSON.stringify(results, null, 2);
  console.log('\n--- JSON OUTPUT ---');
  console.log(jsonOutput);

  // Write results to file for CI artifacts
  const outputPath = path.resolve(__dirname, '..', 'test-results.json');
  fs.writeFileSync(outputPath, jsonOutput);
  log(`Results written to ${outputPath}`);

  process.exit(results.exitCode);
}

// Handle uncaught errors
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run tests
runTests();