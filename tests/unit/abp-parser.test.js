/**
 * Comprehensive Test Suite for AeroGuard Ad Blocker
 * Tests ABP parsing, network blocking, cosmetic filtering, privacy modules
 */

import assert from 'assert';
import { parseAbpFilter, convertToUrlFilter, createDnrRule, parseFilterList, filterValidRules } from '../../background/abp-parser.js';

console.log('=== AeroGuard Ad Blocker Test Suite ===\n');

// ==================== ABP Parser Tests ====================

function testAbpParser() {
  console.log('--- ABP Parser Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Simple domain block
  try {
    const result = parseAbpFilter('||example.com^');
    assert(result);
    assert(result.domains.includes('example.com'));
    assert(result.urlPattern === '');
    assert(!result.isException);
    console.log('✓ Test 1: Simple domain block (||example.com^)');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: Simple domain block -', e.message);
    failed++;
  }

  // Test 2: Domain block with path
  try {
    const result = parseAbpFilter('||example.com^ads/banner.js');
    assert(result);
    assert(result.domains.includes('example.com'));
    assert(result.urlPattern === 'ads/banner.js');
    console.log('✓ Test 2: Domain block with path');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Domain block with path -', e.message);
    failed++;
  }

  // Test 3: Exception rule
  try {
    const result = parseAbpFilter('@@||example.com^');
    assert(result);
    assert(result.isException);
    console.log('✓ Test 3: Exception rule (@@||example.com^)');
    passed++;
  } catch (e) {
    console.log('✗ Test 3: Exception rule -', e.message);
    failed++;
  }

  // Test 4: Third-party option
  try {
    const result = parseAbpFilter('||example.com^$third-party');
    assert(result);
    assert(result.options.domainType === 'thirdParty');
    console.log('✓ Test 4: Third-party option');
    passed++;
  } catch (e) {
    console.log('✗ Test 4: Third-party option -', e.message);
    failed++;
  }

  // Test 5: ~third-party option
  try {
    const result = parseAbpFilter('||example.com^$~third-party');
    assert(result);
    assert(result.options.domainType === 'firstParty');
    console.log('✓ Test 5: ~third-party option');
    passed++;
  } catch (e) {
    console.log('✗ Test 5: ~third-party option -', e.message);
    failed++;
  }

  // Test 6: Domain option
  try {
    const result = parseAbpFilter('||ads.example.com^$domain=example.org|example.net');
    assert(result);
    assert(result.options.domains.includes('example.org'));
    assert(result.options.domains.includes('example.net'));
    console.log('✓ Test 6: Domain option');
    passed++;
  } catch (e) {
    console.log('✗ Test 6: Domain option -', e.message);
    failed++;
  }

  // Test 7: ~domain option
  try {
    const result = parseAbpFilter('||ads.example.com^$~domain=example.org');
    assert(result);
    assert(result.options.excludedDomains.includes('example.org'));
    console.log('✓ Test 7: ~domain option');
    passed++;
  } catch (e) {
    console.log('✗ Test 7: ~domain option -', e.message);
    failed++;
  }

  // Test 8: Resource type options
  try {
    const result = parseAbpFilter('||example.com^$script,image');
    assert(result);
    assert(result.options.resourceTypes.includes('script'));
    assert(result.options.resourceTypes.includes('image'));
    console.log('✓ Test 8: Resource type options');
    passed++;
  } catch (e) {
    console.log('✗ Test 8: Resource type options -', e.message);
    failed++;
  }

  // Test 9: Excluded resource types
  try {
    const result = parseAbpFilter('||example.com^$~script,~image');
    assert(result);
    assert(result.options.excludedResourceTypes.includes('script'));
    assert(result.options.excludedResourceTypes.includes('image'));
    console.log('✓ Test 9: Excluded resource types');
    passed++;
  } catch (e) {
    console.log('✗ Test 9: Excluded resource types -', e.message);
    failed++;
  }

  // Test 10: match-case option
  try {
    const result = parseAbpFilter('||Example.com^$match-case');
    assert(result);
    assert(result.options.matchCase === true);
    console.log('✓ Test 10: match-case option');
    passed++;
  } catch (e) {
    console.log('✗ Test 10: match-case option -', e.message);
    failed++;
  }

  // Test 11: Multiple options combined
  try {
    const result = parseAbpFilter('||example.com^ads/*$script,third-party,domain=example.org,match-case');
    assert(result);
    assert(result.options.resourceTypes.includes('script'));
    assert(result.options.domainType === 'thirdParty');
    assert(result.options.domains.includes('example.org'));
    assert(result.options.matchCase === true);
    console.log('✓ Test 11: Multiple options combined');
    passed++;
  } catch (e) {
    console.log('✗ Test 11: Multiple options combined -', e.message);
    failed++;
  }

  // Test 12: Wildcard patterns
  try {
    const result = parseAbpFilter('||example.com^*/ads/*');
    assert(result);
    assert(result.urlPattern.includes('*'));
    console.log('✓ Test 12: Wildcard patterns');
    passed++;
  } catch (e) {
    console.log('✗ Test 12: Wildcard patterns -', e.message);
    failed++;
  }

  // Test 13: Regex patterns
  try {
    const result = parseAbpFilter('/example\\.com/ads/.*\\.js/');
    assert(result);
    assert(result.urlPattern.startsWith('/'));
    console.log('✓ Test 13: Regex patterns');
    passed++;
  } catch (e) {
    console.log('✗ Test 13: Regex patterns -', e.message);
    failed++;
  }

  // Test 14: Important option
  try {
    const result = parseAbpFilter('||example.com^$important');
    assert(result);
    assert(result.options.important === true);
    console.log('✓ Test 14: Important option');
    passed++;
  } catch (e) {
    console.log('✗ Test 14: Important option -', e.message);
    failed++;
  }

  console.log(`\nABP Parser: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== URL Filter Conversion Tests ====================

function testUrlFilterConversion() {
  console.log('--- URL Filter Conversion Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Empty pattern (from ||domain^)
  try {
    const result = convertToUrlFilter('', {});
    assert(result === '*');
    console.log('✓ Test 1: Empty pattern (from ||domain^)');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: Empty pattern -', e.message);
    failed++;
  }

  // Test 2: Pattern with wildcard
  try {
    const result = convertToUrlFilter('example.com/ads/*', {});
    assert(result.includes('*'));
    console.log('✓ Test 2: Pattern with wildcard');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Pattern with wildcard -', e.message);
    failed++;
  }

  // Test 3: Pattern with separator
  try {
    const result = convertToUrlFilter('example.com/ads^banner.js', {});
    assert(result.includes('^'));
    console.log('✓ Test 3: Pattern with separator');
    passed++;
  } catch (e) {
    console.log('✗ Test 3: Pattern with separator -', e.message);
    failed++;
  }

  // Test 4: Empty pattern
  try {
    const result = convertToUrlFilter('', {});
    assert(result === '*');
    console.log('✓ Test 4: Empty pattern');
    passed++;
  } catch (e) {
    console.log('✗ Test 4: Empty pattern -', e.message);
    failed++;
  }

  // Test 5: Asterisk pattern
  try {
    const result = convertToUrlFilter('*', {});
    assert(result === '*');
    console.log('✓ Test 5: Asterisk pattern');
    passed++;
  } catch (e) {
    console.log('✗ Test 5: Asterisk pattern -', e.message);
    failed++;
  }

  // Test 6: Complex pattern
  try {
    const result = convertToUrlFilter('google.com/adsense/*', {});
    assert(result.includes('google.com'));
    console.log('✓ Test 6: Complex pattern');
    passed++;
  } catch (e) {
    console.log('✗ Test 6: Complex pattern -', e.message);
    failed++;
  }

  // Test 7: Domain-only pattern (passed as urlPattern)
  try {
    const result = convertToUrlFilter('example.com', {});
    // When urlPattern is just a domain/path without || or ^, it's treated as path
    assert(result === 'example.com' || result.includes('example.com'));
    console.log('✓ Test 7: Domain/path pattern');
    passed++;
  } catch (e) {
    console.log('✗ Test 7: Domain/path pattern -', e.message);
    failed++;
  }

  console.log(`\nURL Filter Conversion: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== DNR Rule Creation Tests ====================

function testDnrRuleCreation() {
  console.log('--- DNR Rule Creation Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Basic block rule
  try {
    const parsed = parseAbpFilter('||example.com^');
    const rule = createDnrRule(parsed, 1, 'test', '||example.com^');
    assert(rule);
    assert(rule.action.type === 'block');
    // ||example.com^ describes the request URL itself
    assert(rule.condition.urlFilter === '||example.com^');
    // ...and must NOT become an initiator restriction (that would block
    // every request made *by* example.com instead of requests *to* it)
    assert(!rule.condition.domains);
    console.log('✓ Test 1: Basic block rule');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: Basic block rule -', e.message);
    failed++;
  }

  // Test 2: Exception rule (allow)
  try {
    const parsed = parseAbpFilter('@@||example.com^');
    const rule = createDnrRule(parsed, 2, 'test');
    assert(rule);
    assert(rule.action.type === 'allow');
    console.log('✓ Test 2: Exception rule');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Exception rule -', e.message);
    failed++;
  }

  // Test 3: Rule with domains
  try {
    const parsed = parseAbpFilter('||ads.example.com^$domain=example.org');
    const rule = createDnrRule(parsed, 3, 'test', '||ads.example.com^$domain=example.org');
    assert(rule);
    assert(rule.condition.domains);
    assert(rule.condition.domains.includes('example.org'));
    assert(rule.condition.urlFilter === '||ads.example.com^');
    console.log('✓ Test 3: Rule with domains');
    passed++;
  } catch (e) {
    console.log('✗ Test 3: Rule with domains -', e.message);
    failed++;
  }

  // Test 4: Rule with third-party
  try {
    const parsed = parseAbpFilter('||example.com^$third-party');
    const rule = createDnrRule(parsed, 4, 'test');
    assert(rule);
    assert(rule.condition.domainType === 'thirdParty');
    console.log('✓ Test 4: Rule with third-party');
    passed++;
  } catch (e) {
    console.log('✗ Test 4: Rule with third-party -', e.message);
    failed++;
  }

  // Test 5: Rule with match-case
  try {
    const parsed = parseAbpFilter('||Example.com^$match-case');
    const rule = createDnrRule(parsed, 5, 'test');
    assert(rule);
    assert(rule.condition.isUrlFilterCaseSensitive === true);
    console.log('✓ Test 5: Rule with match-case');
    passed++;
  } catch (e) {
    console.log('✗ Test 5: Rule with match-case -', e.message);
    failed++;
  }

  // Test 6: Rule with resource types
  try {
    const parsed = parseAbpFilter('||example.com^$script,image');
    const rule = createDnrRule(parsed, 6, 'test');
    assert(rule);
    assert(rule.condition.resourceTypes.includes('script'));
    assert(rule.condition.resourceTypes.includes('image'));
    console.log('✓ Test 6: Rule with resource types');
    passed++;
  } catch (e) {
    console.log('✗ Test 6: Rule with resource types -', e.message);
    failed++;
  }

  // Test 7: Rule priority for exceptions
  try {
    const parsed = parseAbpFilter('@@||example.com^');
    const rule = createDnrRule(parsed, 7, 'test');
    assert(rule);
    assert(rule.priority > 1); // Exceptions should have higher priority
    console.log('✓ Test 7: Rule priority for exceptions');
    passed++;
  } catch (e) {
    console.log('✗ Test 7: Rule priority for exceptions -', e.message);
    failed++;
  }

  console.log(`\nDNR Rule Creation: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Filter List Parsing Tests ====================

function testFilterListParsing() {
  console.log('--- Filter List Parsing Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Simple filter list
  try {
    const text = `! Comment line
||example.com^
||ads.example.com^
@@||allow.example.com^
##div.ad-banner
#@#div.allow-me
`;
    const rules = parseFilterList(text, { baseId: 1000 });
    assert(rules.length === 3); // 2 block + 1 allow (cosmetic filters skipped)
    console.log('✓ Test 1: Simple filter list');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: Simple filter list -', e.message);
    failed++;
  }

  // Test 2: Filter list with options
  try {
    const text = `||example.com^$third-party
||ads.example.com^$script,image,domain=example.org
`;
    const rules = parseFilterList(text, { baseId: 2000 });
    assert(rules.length === 2);
    assert(rules[0].condition.domainType === 'thirdParty');
    assert(rules[1].condition.resourceTypes.includes('script'));
    assert(rules[1].condition.resourceTypes.includes('image'));
    console.log('✓ Test 2: Filter list with options');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Filter list with options -', e.message);
    failed++;
  }

  // Test 3: Empty and comment lines skipped
  try {
    const text = `
! This is a comment
[Adblock Plus 2.0]

||example.com^

`;
    const rules = parseFilterList(text, { baseId: 3000 });
    assert(rules.length === 1);
    console.log('✓ Test 3: Empty and comment lines skipped');
    passed++;
  } catch (e) {
    console.log('✗ Test 3: Empty and comment lines skipped -', e.message);
    failed++;
  }

  // Test 4: Cosmetic filters skipped
  try {
    const text = `||example.com^
##div.ad
#@#div.allow
#?#div.ad
`;
    const rules = parseFilterList(text, { baseId: 4000 });
    assert(rules.length === 1); // Only network filter
    console.log('✓ Test 4: Cosmetic filters skipped');
    passed++;
  } catch (e) {
    console.log('✗ Test 4: Cosmetic filters skipped -', e.message);
    failed++;
  }

  // Test 5: Invalid rules handled gracefully
  try {
    const text = `||example.com^
invalid rule with no pattern
||valid.com^
`;
    const rules = parseFilterList(text, { baseId: 5000 });
    // The "invalid rule" gets parsed as a substring match rule
    // (it doesn't match skip patterns like comments or cosmetic filters)
    assert(rules.length === 3); // All three lines are parsed as rules
    console.log('✓ Test 5: Invalid rules parsed (not skipped)');
    passed++;
  } catch (e) {
    console.log('✗ Test 5: Invalid rules handled gracefully -', e.message);
    failed++;
  }

  console.log(`\nFilter List Parsing: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Rule Validation Tests ====================

function testRuleValidation() {
  console.log('--- Rule Validation Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: Valid rule passes
  try {
    const rule = {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const valid = filterValidRules([rule]);
    assert(valid.length === 1);
    console.log('✓ Test 1: Valid rule passes');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: Valid rule passes -', e.message);
    failed++;
  }

  // Test 2: Missing id fails
  try {
    const rule = {
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const valid = filterValidRules([rule]);
    assert(valid.length === 0);
    console.log('✓ Test 2: Missing id fails');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Missing id fails -', e.message);
    failed++;
  }

  // Test 3: Missing action fails
  try {
    const rule = {
      id: 1,
      priority: 1,
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const valid = filterValidRules([rule]);
    assert(valid.length === 0);
    console.log('✓ Test 3: Missing action fails');
    passed++;
  } catch (e) {
    console.log('✗ Test 3: Missing action fails -', e.message);
    failed++;
  }

  // Test 4: Missing condition fails
  try {
    const rule = {
      id: 1,
      priority: 1,
      action: { type: 'block' }
    };
    const valid = filterValidRules([rule]);
    assert(valid.length === 0);
    console.log('✓ Test 4: Missing condition fails');
    passed++;
  } catch (e) {
    console.log('✗ Test 4: Missing condition fails -', e.message);
    failed++;
  }

  // Test 5: Empty resourceTypes fails
  try {
    const rule = {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: [] }
    };
    const valid = filterValidRules([rule]);
    assert(valid.length === 0);
    console.log('✓ Test 5: Empty resourceTypes fails');
    passed++;
  } catch (e) {
    console.log('✗ Test 5: Empty resourceTypes fails -', e.message);
    failed++;
  }

  console.log(`\nRule Validation: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Integration Tests ====================

async function runIntegrationTests() {
  console.log('--- Integration Tests ---');
  let passed = 0;
  let failed = 0;

  // Test 1: End-to-end filter parsing
  try {
    const easylistSample = `! EasyList Sample
||doubleclick.net^$third-party
||googlesyndication.com^$script,image
||googleadservices.com^$domain=example.com
@@||allow.example.com^
`;
    const rules = parseFilterList(easylistSample, { baseId: 100000, listKey: 'easylist' });
    assert(rules.length === 4);
    assert(rules[0].condition.domainType === 'thirdParty');
    assert(rules[1].condition.resourceTypes.includes('script'));
    assert(rules[1].condition.resourceTypes.includes('image'));
    assert(rules[2].condition.domains.includes('example.com'));
    assert(rules[3].action.type === 'allow');
    console.log('✓ Test 1: End-to-end filter parsing');
    passed++;
  } catch (e) {
    console.log('✗ Test 1: End-to-end filter parsing -', e.message);
    failed++;
  }

  // Test 2: Complex real-world rules
  try {
    const complexRules = `||facebook.net/tr$third-party,xmlhttprequest
||google-analytics.com/collect$xmlhttprequest,third-party
||ads.youtube.com^$media,domain=youtube.com
@@||google.com/adsense$domain=example.com
||pagead2.googlesyndication.com^$script,image,third-party
`;
    const rules = parseFilterList(complexRules, { baseId: 200000 });
    assert(rules.length === 5);
    assert(rules[0].condition.domainType === 'thirdParty');
    assert(rules[0].condition.resourceTypes.includes('xmlhttprequest'));
    assert(rules[2].condition.domains.includes('youtube.com'));
    assert(rules[3].action.type === 'allow');
    console.log('✓ Test 2: Complex real-world rules');
    passed++;
  } catch (e) {
    console.log('✗ Test 2: Complex real-world rules -', e.message);
    failed++;
  }

  console.log(`\nIntegration Tests: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log('Starting AeroGuard Test Suite...\n');

  const results = [];

  results.push(testAbpParser());
  results.push(testUrlFilterConversion());
  results.push(testDnrRuleCreation());
  results.push(testFilterListParsing());
  results.push(testRuleValidation());
  results.push(await runIntegrationTests());

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);

  console.log('=== TEST SUMMARY ===');
  console.log(`Total: ${totalPassed + totalFailed} tests`);
  console.log(`Passed: ${totalPassed}`);
  console.log(`Failed: ${totalFailed}`);
  console.log(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch(console.error);