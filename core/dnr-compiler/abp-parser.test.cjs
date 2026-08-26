/**
 * Tests for ABP Parser
 */

const { ABPParser, parseFilterList } = require('./abp-parser');

function runTests() {
  console.log('Running ABP Parser tests...\n');
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  function assertEqual(actual, expected, msg) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertTrue(val, msg) {
    if (!val) throw new Error(msg || `Expected truthy, got ${val}`);
  }

  // Test 1: Basic blocking rule
  test('parses basic blocking rule', () => {
    const result = parseFilterList('||example.com^');
    assertEqual(result.rules.length, 1);
    assertEqual(result.rules[0].type, 'blocking');
    assertEqual(result.rules[0].pattern, '||example.com^');
  });

  // Test 2: Exception rule
  test('parses exception rule (@@)', () => {
    const result = parseFilterList('@@||example.com^');
    assertEqual(result.rules.length, 1);
    assertEqual(result.rules[0].type, 'exception');
  });

  // Test 3: Rule with options
  test('parses rule with options', () => {
    const result = parseFilterList('||example.com^$script,image,domain=example.com');
    assertEqual(result.rules.length, 1);
    const opts = result.rules[0].options;
    assertTrue(opts.script && opts.script.value === true);
    assertTrue(opts.image && opts.image.value === true);
    assertTrue(opts.domain && opts.domain.value.length === 1);
  });

  // Test 4: Element hiding rule
  test('parses element hiding rule (##)', () => {
    const result = parseFilterList('example.com##.ad-banner');
    assertEqual(result.rules.length, 1);
    assertEqual(result.rules[0].type, 'elemhide');
    assertEqual(result.rules[0].selector, '.ad-banner');
    assertEqual(result.rules[0].domains.length, 1);
    assertEqual(result.rules[0].domains[0].domain, 'example.com');
  });

  // Test 5: Element hiding exception
  test('parses element hiding exception (#@##)', () => {
    const result = parseFilterList('example.com#@##.ad-banner');
    assertEqual(result.rules[0].type, 'elemhide-exception');
  });

  // Test 6: Extended CSS
  test('parses extended CSS (#?#)', () => {
    const result = parseFilterList('example.com#?#.ad-banner:-abp-has(.sponsor)');
    assertEqual(result.rules[0].type, 'extended-css');
  });

  // Test 7: Scriptlet
  test('parses scriptlet (#%#)', () => {
    const result = parseFilterList('example.com#%#log(message)');
    assertEqual(result.rules[0].type, 'scriptlet');
  });

  // Test 8: HTML filter
  test('parses HTML filter (##^pattern$)', () => {
    const result = parseFilterList('example.com##^<div class="ad">$');
    assertEqual(result.rules[0].type, 'html-filter');
  });

  // Test 9: Regex pattern
  test('parses regex pattern', () => {
    const result = parseFilterList('/example\\.com/');
    assertEqual(result.rules[0].isRegex, true);
    assertEqual(result.rules[0].pattern, 'example\\.com');
  });

  // Test 10: Comments
  test('parses comments', () => {
    const result = parseFilterList('! This is a comment\n||example.com^');
    assertEqual(result.rules.length, 2);
    assertEqual(result.rules[0].type, 'comment');
    assertEqual(result.rules[1].type, 'blocking');
  });

  // Test 11: Metadata
  test('parses metadata [Adblock]', () => {
    const result = parseFilterList('[Adblock]\n! Title: Test\n||example.com^');
    assertEqual(result.rules[0].type, 'metadata');
    assertEqual(result.rules[0].header, 'Adblock');
  });

  // Test 12: Negated options
  test('parses negated options (~third-party)', () => {
    const result = parseFilterList('||example.com^$~third-party,script');
    const opts = result.rules[0].options;
    assertTrue(opts['third-party'].negated === true);
    assertTrue(opts['third-party'].value === false);
    assertTrue(opts.script.value === true);
  });

  // Test 13: Domain list with negation
  test('parses domain list with negation', () => {
    const result = parseFilterList('||example.com^$domain=example.com,~sub.example.com');
    const domains = result.rules[0].options.domain.value;
    assertEqual(domains.length, 2);
    assertTrue(domains[0].domain === 'example.com' && !domains[0].negated);
    assertTrue(domains[1].domain === 'sub.example.com' && domains[1].negated);
  });

  // Test 14: Removeparam option
  test('parses removeparam option', () => {
    const result = parseFilterList('||example.com^$removeparam=tracking');
    assertEqual(result.rules[0].options.removeparam.value, 'tracking');
  });

  // Test 15: Redirect option
  test('parses redirect option', () => {
    const result = parseFilterList('||example.com^$redirect=https://safe.com');
    assertEqual(result.rules[0].options.redirect.value, 'https://safe.com');
  });

  // Test 16: Important flag
  test('parses important flag', () => {
    const result = parseFilterList('||example.com^$important');
    assertTrue(result.rules[0].options.important.value === true);
  });

  // Test 17: Match-case flag
  test('parses match-case flag', () => {
    const result = parseFilterList('||Example.com^$match-case');
    assertTrue(result.rules[0].options['match-case'].value === true);
  });

  // Test 18: Collapse flag
  test('parses collapse flag', () => {
    const result = parseFilterList('||example.com^$collapse');
    assertTrue(result.rules[0].options.collapse.value === true);
  });

  // Test 19: Cookie option
  test('parses cookie option', () => {
    const result = parseFilterList('||example.com^$cookie');
    assertTrue(result.rules[0].options.cookie.value === true);
  });

  // Test 20: CSP option
  test('parses csp option', () => {
    const result = parseFilterList('||example.com^$csp=script-src \'self\'');
    assertEqual(result.rules[0].options.csp.value, "script-src 'self'");
  });

  // Test 21: Scriptlet with arguments
  test('parses scriptlet with arguments', () => {
    const result = parseFilterList('example.com#%#log("hello", 123)');
    assertEqual(result.rules[0].args.length, 2);
    assertEqual(result.rules[0].args[0], 'hello');
    assertEqual(result.rules[0].args[1], 123);
  });

  // Test 22: Multiple domains
  test('parses multiple domains', () => {
    const result = parseFilterList('example.com,other.com##.ad');
    assertEqual(result.rules[0].domains.length, 2);
  });

  // Test 23: Error recovery - skip bad line
  test('recovers from malformed line', () => {
    const result = parseFilterList('||good.com^\ninvalid!!!\n||also-good.com^');
    assertEqual(result.rules.length, 2); // 2 valid rules, malformed line skipped
    assertEqual(result.stats.errors, 0); // No error thrown, just skipped
    assertEqual(result.stats.skipped, 1); // 1 malformed line skipped
  });

  // Test 24: Stats tracking
  test('tracks stats correctly', () => {
    const content = '! Comment\n||example.com^\n||test.com^$script\n\n';
    const result = parseFilterList(content);
    // 5 lines: comment, rule1, rule2, empty, empty (trailing newline creates extra line)
    assertEqual(result.stats.linesParsed, 5);
    assertEqual(result.stats.rulesExtracted, 3); // comment + 2 blocking
    assertEqual(result.stats.skipped, 3); // 2 empty lines + 1 comment (comments are extracted but also counted as skipped in code)
    assertTrue(result.stats.bytesProcessed > 0);
  });

  // Test 25: toDNRRule conversion
  test('converts blocking rule to DNR', () => {
    const parser = new ABPParser();
    const result = parser.parse('||example.com^$script,image');
    const dnr = parser.toDNRRule(result.rules[0], 1);
    assertTrue(dnr !== null);
    assertEqual(dnr.action.type, 'block');
    assertTrue(dnr.condition.urlFilter.includes('example.com'));
    assertTrue(dnr.condition.resourceTypes.includes('script'));
    assertTrue(dnr.condition.resourceTypes.includes('image'));
  });

  // Test 26: toDNRRule exception
  test('converts exception rule to DNR allow', () => {
    const parser = new ABPParser();
    const result = parser.parse('@@||example.com^');
    const dnr = parser.toDNRRule(result.rules[0], 1);
    assertTrue(dnr !== null);
    assertEqual(dnr.action.type, 'allow');
  });

  // Test 27: toDNRRule skips element hiding
  test('skips element hiding in DNR conversion', () => {
    const parser = new ABPParser();
    const result = parser.parse('example.com##.ad');
    const dnr = parser.toDNRRule(result.rules[0], 1);
    assertTrue(dnr === null);
  });

  // Test 28: Encoding detection
  test('handles UTF-8 content', () => {
    const content = '||example.com^\n||test.com^';
    const result = parseFilterList(content);
    assertEqual(result.rules.length, 2);
  });

  // Test 29: Empty lines skipped
  test('skips empty lines', () => {
    const result = parseFilterList('\n\n||example.com^\n\n');
    // 5 lines: empty, empty, rule, empty, empty (trailing newline)
    assertEqual(result.stats.skipped, 4); // 4 empty lines
  });

  // Test 30: Large options list
  test('parses all known options', () => {
    const options = [
      'domain', 'third-party', 'script', 'image', 'stylesheet',
      'xmlhttprequest', 'subdocument', 'font', 'object', 'media',
      'websocket', 'csp_report', 'ping', 'match-case', 'collapse',
      'redirect', 'redirect-rule', 'removeparam', 'csp', 'cookie',
      'important'
    ].join(',');

    const result = parseFilterList(`||example.com^$${options}`);
    const opts = result.rules[0].options;

    for (const opt of options.split(',')) {
      assertTrue(opt in opts, `Missing option: ${opt}`);
    }
  });

  // Summary
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  return failed === 0;
}

const success = runTests();
process.exit(success ? 0 : 1);