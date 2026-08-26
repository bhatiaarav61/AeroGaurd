/**
 * Test Runner — CI/CD ready, parallel, flaky detection, JUnit output
 * Runs all test suites with comprehensive reporting
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const TEST_DIR = join(PROJECT_ROOT, 'test');
const RESULTS_DIR = join(PROJECT_ROOT, 'test-results');

const TEST_SUITES = [
  { name: 'unit', path: join(TEST_DIR, 'unit'), command: 'npx jest', timeout: 120000 },
  { name: 'integration', path: join(TEST_DIR, 'integration'), command: 'npx jest', timeout: 180000 },
  { name: 'e2e', path: join(TEST_DIR, 'e2e'), command: 'npx playwright test', timeout: 300000 },
  { name: 'performance', path: join(TEST_DIR, 'performance'), command: 'node benchmark.js', timeout: 300000 },
  { name: 'adversarial', path: join(TEST_DIR, 'adversarial'), command: 'npx jest', timeout: 180000 },
  { name: 'youtube', path: join(TEST_DIR, 'youtube'), command: 'npx jest', timeout: 300000 },
  { name: 'cosmetic', path: join(TEST_DIR, 'cosmetic'), command: 'npx jest', timeout: 180000 }
];

class TestRunner {
  constructor() {
    this.results = [];
    this.flakyTests = new Map();
    this.startTime = Date.now();
  }

  async runAll() {
    console.log('🧪 AeroGuard Test Runner');
    console.log('='.repeat(50));

    if (!existsSync(RESULTS_DIR)) {
      mkdirSync(RESULTS_DIR, { recursive: true });
    }

    // Run suites in parallel (with concurrency limit)
    const concurrency = 3;
    const queue = [...TEST_SUITES];
    const running = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < concurrency && queue.length > 0) {
        const suite = queue.shift();
        running.push(this.runSuite(suite));
      }

      if (running.length > 0) {
        const finished = await Promise.race(running);
        running.splice(running.indexOf(finished), 1);
      }
    }

    this.generateReport();
    return this.results.every(r => r.passed);
  }

  async runSuite(suite) {
    console.log(`\n📦 Running ${suite.name} tests...`);

    const startTime = Date.now();
    let passed = false;
    let output = '';
    let error = null;

    try {
      const result = await this.runCommand(suite.command, suite.path, suite.timeout);
      output = result.stdout;
      passed = result.code === 0;

      if (!passed) {
        error = result.stderr;
      }
    } catch (e) {
      error = e.message;
      passed = false;
    }

    const duration = Date.now() - startTime;

    const suiteResult = {
      name: suite.name,
      passed,
      duration,
      output,
      error,
      timestamp: new Date().toISOString()
    };

    this.results.push(suiteResult);

    console.log(`  ${passed ? '✅' : '❌'} ${suite.name} (${duration}ms)`);

    if (!passed && error) {
      console.log(`     Error: ${error.substring(0, 200)}`);
    }

    // Check for flaky tests
    this._detectFlaky(suite.name, passed);

    return suiteResult;
  }

  runCommand(command, cwd, timeout) {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => stdout += data.toString());
      child.stderr.on('data', data => stderr += data.toString());

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve({ code: -1, stdout, stderr: 'Timeout' });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: err.message });
      });
    });
  }

  _detectFlaky(suiteName, passed) {
    const key = suiteName;
    if (!this.flakyTests.has(key)) {
      this.flakyTests.set(key, { passes: 0, failures: 0, history: [] });
    }

    const record = this.flakyTests.get(key);
    record.history.push({ passed, timestamp: Date.now() });
    if (passed) record.passes++; else record.failures++;

    // Keep last 10 runs
    if (record.history.length > 10) record.history.shift();

    // Detect flakiness: mixed results in recent history
    const recent = record.history.slice(-5);
    const hasPass = recent.some(r => r.passed);
    const hasFail = recent.some(r => !r.passed);

    if (hasPass && hasFail) {
      console.log(`  ⚠️ Flaky detected: ${suiteName}`);
    }
  }

  generateReport() {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    console.log('\n' + '='.repeat(50));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total Suites: ${this.results.length}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Duration: ${totalDuration}ms`);
    console.log('='.repeat(50));

    // JUnit XML
    this._writeJUnitXML();

    // JSON report
    writeFileSync(
      join(RESULTS_DIR, 'test-report.json'),
      JSON.stringify({
        summary: { total: this.results.length, passed, failed, duration: totalDuration },
        suites: this.results,
        flaky: Object.fromEntries(this.flakyTests)
      }, null, 2)
    );

    // HTML report
    this._writeHTMLReport();
  }

  _writeJUnitXML() {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n';

    for (const suite of this.results) {
      xml += `  <testsuite name="${suite.name}" tests="1" failures="${suite.passed ? 0 : 1}" time="${(suite.duration / 1000).toFixed(3)}">\n`;
      xml += `    <testcase name="${suite.name}" classname="${suite.name}" time="${(suite.duration / 1000).toFixed(3)}">\n`;

      if (!suite.passed) {
        xml += `      <failure message="${suite.error || 'Test failed'}">${suite.output}</failure>\n`;
      }

      xml += `    </testcase>\n`;
      xml += `  </testsuite>\n`;
    }

    xml += '</testsuites>\n';
    writeFileSync(join(RESULTS_DIR, 'junit.xml'), xml);
  }

  _writeHTMLReport() {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>AeroGuard Test Report</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 40px; background: #0f172a; color: #f8fafc; }
    h1 { color: #38bdf8; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
    .card { background: #1e293b; padding: 20px; border-radius: 10px; border: 1px solid #334155; }
    .card.passed { border-color: #22c55e; }
    .card.failed { border-color: #ef4444; }
    .suite { background: #1e293b; margin: 10px 0; padding: 15px; border-radius: 8px; border: 1px solid #334155; }
    .suite.passed { border-left: 4px solid #22c55e; }
    .suite.failed { border-left: 4px solid #ef4444; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
    .badge.passed { background: #22c55e; color: white; }
    .badge.failed { background: #ef4444; color: white; }
    pre { background: #0f172a; padding: 15px; border-radius: 8px; overflow: auto; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>🧪 AeroGuard Test Report</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="summary">
    <div class="card ${this.results.every(r => r.passed) ? 'passed' : 'failed'}">
      <h3>Total Suites</h3>
      <div style="font-size: 36px; font-weight: bold;">${this.results.length}</div>
    </div>
    <div class="card passed">
      <h3>Passed</h3>
      <div style="font-size: 36px; font-weight: bold; color: #22c55e;">${this.results.filter(r => r.passed).length}</div>
    </div>
    <div class="card failed">
      <h3>Failed</h3>
      <div style="font-size: 36px; font-weight: bold; color: #ef4444;">${this.results.filter(r => !r.passed).length}</div>
    </div>
    <div class="card">
      <h3>Duration</h3>
      <div style="font-size: 36px; font-weight: bold;">${((Date.now() - this.startTime) / 1000).toFixed(1)}s</div>
    </div>
  </div>

  <h2>Suite Results</h2>
  ${this.results.map(suite => `
    <div class="suite ${suite.passed ? 'passed' : 'failed'}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3>${suite.name}</h3>
        <span class="badge ${suite.passed ? 'passed' : 'failed'}">${suite.passed ? 'PASSED' : 'FAILED'}</span>
      </div>
      <p>Duration: ${suite.duration}ms</p>
      ${!suite.passed ? `<pre>${suite.error || suite.output}</pre>` : ''}
    </div>
  `).join('')}

  <h2>Flaky Tests</h2>
  <p>${this.flakyTests.size > 0 ? '⚠️ Flaky tests detected!' : '✅ No flaky tests'}</p>
</body>
</html>`;

    writeFileSync(join(RESULTS_DIR, 'report.html'), html);
  }
}

// Run if executed directly
const runner = new TestRunner();
runner.runAll().then(allPassed => {
  console.log(allPassed ? '\n🎉 All tests passed!' : '\n💥 Some tests failed!');
  process.exit(allPassed ? 0 : 1);
}).catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});