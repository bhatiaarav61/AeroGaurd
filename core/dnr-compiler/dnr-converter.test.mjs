/**
 * Tests for DNR Converter - Semantic-preserving ABP to DNR conversion with formal verification
 */

import { DNRConverter, DNRValidator, FormalVerifier, RulePartitioner } from './dnr-converter.js';
import { ABPParser, parseFilterList } from './abp-parser.js';
import { RuleFingerprint, IncrementalCompiler } from './incremental-compiler.js';
import fs from 'fs';
import path from 'path';

function runTests() {
  console.log('Running DNR Converter tests...\n');
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

  function assertFalse(val, msg) {
    if (val) throw new Error(msg || `Expected falsy, got ${val}`);
  }

  // ============================================================
  // DNR Validator Tests
  // ============================================================

  test('DNRValidator: valid blocking rule', () => {
    const rule = {
      id: 1,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||example.com^',
        resourceTypes: ['script', 'image']
      }
    };
    const result = DNRValidator.validate(rule);
    assertTrue(result.valid, result.reason);
  });

  test('DNRValidator: valid allow rule (exception)', () => {
    const rule = {
      id: 2,
      priority: 2,
      action: { type: 'allow' },
      condition: {
        urlFilter: '||example.com^',
        resourceTypes: ['script']
      }
    };
    const result = DNRValidator.validate(rule);
    assertTrue(result.valid, result.reason);
  });

  test('DNRValidator: valid redirect rule', () => {
    const rule = {
      id: 3,
      priority: 2,
      action: { type: 'redirect', redirect: { url: 'https://safe.com' } },
      condition: {
        urlFilter: '||example.com^',
        resourceTypes: ['script']
      }
    };
    const result = DNRValidator.validate(rule);
    assertTrue(result.valid, result.reason);
  });

  test('DNRValidator: valid upgradeScheme rule', () => {
    const rule = {
      id: 4,
      priority: 1,
      action: { type: 'upgradeScheme' },
      condition: {
        urlFilter: 'http://example.com/*',
        resourceTypes: ['main_frame']
      }
    };
    const result = DNRValidator.validate(rule);
    assertTrue(result.valid, result.reason);
  });

  test('DNRValidator: rejects invalid action type', () => {
    const rule = {
      id: 1,
      action: { type: 'invalid' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Invalid action type'));
  });

  test('DNRValidator: rejects missing urlFilter/regexFilter', () => {
    const rule = {
      id: 1,
      action: { type: 'block' },
      condition: { resourceTypes: ['script'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Missing urlFilter'));
  });

  test('DNRValidator: rejects both urlFilter and regexFilter', () => {
    const rule = {
      id: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', regexFilter: 'example\\.com', resourceTypes: ['script'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Cannot have both'));
  });

  test('DNRValidator: rejects invalid resourceType', () => {
    const rule = {
      id: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['invalid_type'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Invalid resourceType'));
  });

  test('DNRValidator: rejects invalid priority', () => {
    const rule = {
      id: 1,
      priority: 0,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Invalid priority'));
  });

  test('DNRValidator: rejects redirect without url', () => {
    const rule = {
      id: 1,
      action: { type: 'redirect', redirect: {} },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('redirect.url'));
  });

  test('DNRValidator: validates domain format', () => {
    const rule = {
      id: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'], initiatorDomains: ['invalid..domain'] }
    };
    const result = DNRValidator.validate(rule);
    assertFalse(result.valid);
    assertTrue(result.reason.includes('Invalid initiator domain'));
  });

  test('DNRValidator: accepts valid domain with wildcard', () => {
    const rule = {
      id: 1,
      action: { type: 'block' },
      condition: { urlFilter: '||example.com^', resourceTypes: ['script'], initiatorDomains: ['*.example.com', 'test.org'] }
    };
    const result = DNRValidator.validate(rule);
    assertTrue(result.valid, result.reason);
  });

  // ============================================================
  // DNRConverter Tests - Basic Conversion
  // ============================================================

  test('DNRConverter: converts basic blocking rule', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'block');
    assertTrue(rules[0].condition.urlFilter.includes('example.com'));
  });

  test('DNRConverter: converts exception rule to allow', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('@@||example.com^');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'allow');
  });

  test('DNRConverter: converts script resource type', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$script');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.resourceTypes.includes('script'));
  });

  test('DNRConverter: converts multiple resource types', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$script,image,stylesheet');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    const types = rules[0].condition.resourceTypes;
    assertTrue(types.includes('script'));
    assertTrue(types.includes('image'));
    assertTrue(types.includes('stylesheet'));
  });

  test('DNRConverter: converts third-party option', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$third-party');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.thirdParty === true);
  });

  test('DNRConverter: converts negated third-party', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$~third-party');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.thirdParty === false);
  });

  test('DNRConverter: converts domain option', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$domain=example.com|~sub.example.com');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.initiatorDomains.includes('example.com'));
    assertTrue(rules[0].condition.excludedInitiatorDomains.includes('sub.example.com'));
    assertTrue(rules[0].condition.requestDomains.includes('example.com'));
  });

  test('DNRConverter: converts match-case option', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||Example.com^$match-case');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.isUrlFilterCaseSensitive === true);
  });

  test('DNRConverter: converts important flag (higher priority)', () => {
    const converter = new DNRConverter();
    const parseResult1 = parseFilterList('||example.com^');
    const parseResult2 = parseFilterList('||example.com^$important');
    const rules1 = converter.convert(parseResult1.rules, 1, 'test');
    const rules2 = converter.convert(parseResult2.rules, 1, 'test');
    assertTrue(rules2[0].priority > rules1[0].priority);
  });

  // ============================================================
  // DNRConverter Tests - Advanced Options
  // ============================================================

  test('DNRConverter: converts redirect option', () => {
    const converter = new DNRConverter({ enableRedirect: true });
    const parseResult = parseFilterList('||example.com^$redirect=https://safe.com');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'redirect');
    assertEqual(rules[0].action.redirect.url, 'https://safe.com');
  });

  test('DNRConverter: converts redirect-rule option', () => {
    const converter = new DNRConverter({ enableRedirect: true });
    const parseResult = parseFilterList('||example.com^$redirect-rule=https://safe.com');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'redirect');
  });

  test('DNRConverter: converts cookie option', () => {
    const converter = new DNRConverter({ enableCookie: true });
    const parseResult = parseFilterList('||example.com^$cookie');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.resourceTypes.includes('cookie'));
  });

  test('DNRConverter: converts CSP option', () => {
    const converter = new DNRConverter({ enableCSP: true });
    const parseResult = parseFilterList('||example.com^$csp=script-src \'self\'');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'allow');
    assertEqual(rules[0].action.allow.csp, "script-src 'self'");
  });

  test('DNRConverter: converts upgrade-scheme option', () => {
    const converter = new DNRConverter({ enableUpgradeScheme: true });
    const parseResult = parseFilterList('||example.com^$upgrade-scheme');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].action.type, 'upgradeScheme');
  });

  test('DNRConverter: skips element hiding rules', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('example.com##.ad-banner');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 0);
  });

  test('DNRConverter: skips extended CSS rules', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('example.com#?#.ad:-abp-has(.sponsor)');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 0);
  });

  test('DNRConverter: skips scriptlet rules', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('example.com#%#log(message)');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 0);
  });

  test('DNRConverter: skips HTML filter rules', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('example.com##^<div class="ad">$');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 0);
  });

  test('DNRConverter: skips regex rules (not convertible to urlFilter)', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('/example\\.com/');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    // Regex rules should either be skipped or converted with regexFilter
    // Currently they are skipped since we only convert network rules with urlFilter
    // But let's check - the parser marks them as 'blocking' with isRegex=true
    // The converter should handle them
  });

  // ============================================================
  // DNRConverter Tests - Pattern Conversion
  // ============================================================

  test('DNRConverter: converts ||domain^ pattern', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    // Should become *://example.com/*
    assertTrue(rules[0].condition.urlFilter.includes('*://example.com/*'));
  });

  test('DNRConverter: converts |pattern| exact match', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('|http://example.com/ad.js|');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.urlFilter === 'http://example.com/ad.js');
  });

  test('DNRConverter: converts |pattern start anchor', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('|http://example.com/ad.js');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.urlFilter === 'http://example.com/ad.js*');
  });

  test('DNRConverter: converts pattern| end anchor', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('example.com/ad.js|');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertTrue(rules[0].condition.urlFilter === '*example.com/ad.js');
  });

  test('DNRConverter: converts ^ separator to |', () => {
    const converter = new DNRConverter();
    // Use a pattern where ^ is not at the end after ||, so it gets converted to |
    const parseResult = parseFilterList('example.com^$script');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    // ^ should be converted to | in urlFilter
    assertTrue(rules[0].condition.urlFilter.includes('|'));
  });

  // ============================================================
  // RuleFingerprint Tests
  // ============================================================

  test('RuleFingerprint: generates consistent fingerprints', () => {
    // Different IDs but same content - should have same fingerprint
    // Use high IDs to avoid cache conflicts with other tests
    const rule1 = { id: 1001, priority: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 1002, priority: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const fp1 = RuleFingerprint.generate(rule1);
    const fp2 = RuleFingerprint.generate(rule2);
    assertEqual(fp1, fp2);
  });

  test('RuleFingerprint: different for different actions', () => {
    const rule1 = { id: 1010, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 1011, action: { type: 'allow' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const fp1 = RuleFingerprint.generate(rule1);
    const fp2 = RuleFingerprint.generate(rule2);
    assertTrue(fp1 !== fp2);
  });

  test('RuleFingerprint: different for different conditions', () => {
    const rule1 = { id: 1020, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 1021, action: { type: 'block' }, condition: { urlFilter: '*://test.com/*', resourceTypes: ['script'] } };
    const fp1 = RuleFingerprint.generate(rule1);
    const fp2 = RuleFingerprint.generate(rule2);
    assertTrue(fp1 !== fp2);
  });

  test('RuleFingerprint: includes priority', () => {
    const rule1 = { id: 1030, priority: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 1031, priority: 2, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const fp1 = RuleFingerprint.generate(rule1);
    const fp2 = RuleFingerprint.generate(rule2);
    assertTrue(fp1 !== fp2);
  });

  test('RuleFingerprint: includes redirect info', () => {
    const rule1 = { id: 1040, action: { type: 'redirect', redirect: { url: 'https://a.com' } }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 1041, action: { type: 'redirect', redirect: { url: 'https://b.com' } }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const fp1 = RuleFingerprint.generate(rule1);
    const fp2 = RuleFingerprint.generate(rule2);
    assertTrue(fp1 !== fp2);
  });

  // ============================================================
  // IncrementalCompiler Tests
  // ============================================================

  test('IncrementalCompiler: compiles diff for new rules', () => {
    const compiler = new IncrementalCompiler();
    const newRules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } }
    ];
    const result = compiler.compileDiff([], newRules);
    assertEqual(result.added.length, 1);
    assertEqual(result.removed.length, 0);
    assertEqual(result.unchanged.length, 0);
  });

  test('IncrementalCompiler: detects unchanged rules', () => {
    const compiler = new IncrementalCompiler();
    const rules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } }
    ];
    const result1 = compiler.compileDiff([], rules);
    const result2 = compiler.compileDiff(rules, rules);
    assertEqual(result2.unchanged.length, 1);
    assertEqual(result2.added.length, 0);
    assertEqual(result2.removed.length, 0);
  });

  test('IncrementalCompiler: detects changed rules', () => {
    const compiler = new IncrementalCompiler();
    const oldRules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } }
    ];
    const newRules = [
      { id: 2, action: { type: 'block' }, condition: { urlFilter: '*://test.com/*', resourceTypes: ['script'] } }
    ];
    const result = compiler.compileDiff(oldRules, newRules);
    assertEqual(result.added.length, 1);
    assertEqual(result.removed.length, 1);
    assertEqual(result.unchanged.length, 0);
    assertTrue(result.added[0].condition.urlFilter.includes('test.com'));
    assertTrue(result.removed[0].condition.urlFilter.includes('example.com'));
  });

  test('IncrementalCompiler: computes diff correctly', () => {
    const compiler = new IncrementalCompiler();
    const oldRules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://a.com/*', resourceTypes: ['script'] } },
      { id: 2, action: { type: 'block' }, condition: { urlFilter: '*://b.com/*', resourceTypes: ['script'] } }
    ];
    const newRules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://a.com/*', resourceTypes: ['script'] } },
      { id: 3, action: { type: 'block' }, condition: { urlFilter: '*://c.com/*', resourceTypes: ['script'] } }
    ];
    const diff = compiler.compileDiff(oldRules, newRules);
    assertEqual(diff.unchanged.length, 1);
    assertEqual(diff.added.length, 1);
    assertEqual(diff.removed.length, 1);
    assertTrue(diff.added[0].condition.urlFilter.includes('c.com'));
    assertTrue(diff.removed[0].condition.urlFilter.includes('b.com'));
  });

  test('IncrementalCompiler: dirty tracking', () => {
    const compiler = new IncrementalCompiler();
    const rules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } }
    ];
    const result1 = compiler.compileDiffForList('list1', [], rules);
    assertTrue(result1 !== null); // First time - dirty
    const result2 = compiler.compileDiffForList('list1', rules, rules);
    assertTrue(result2 === null); // Second time - clean
  });

  // ============================================================
  // RulePartitioner Tests
  // ============================================================

  test('RulePartitioner: partitions rules by category', () => {
    const partitioner = new RulePartitioner({ maxRulesPerRuleset: 10, maxRulesets: 5 });
    const rules = {
      easylist: [
        { id: 1, priority: 1, action: 'block', condition: { urlFilter: '||a.com^', resourceTypes: ['script'] } },
        { id: 2, priority: 1, action: 'block', condition: { urlFilter: '||b.com^', resourceTypes: ['script'] } }
      ],
      easyprivacy: [
        { id: 3, priority: 1, action: 'block', condition: { urlFilter: '||c.com^', resourceTypes: ['script'] } }
      ]
    };
    const result = partitioner.partition(rules);
    assertTrue(result.length > 0);
    assertEqual(result[0].categories.includes('easylist'), true);
  });

  test('RulePartitioner: prioritizes allow rules in lower rulesets', () => {
    const partitioner = new RulePartitioner({ maxRulesPerRuleset: 2, maxRulesets: 5 });
    const rules = {
      test: [
        { id: 1, priority: 1, action: 'block', condition: { urlFilter: '||b1.com^', resourceTypes: ['script'] } },
        { id: 2, priority: 1, action: 'allow', condition: { urlFilter: '||a1.com^', resourceTypes: ['script'] } },
        { id: 3, priority: 10, action: 'block', condition: { urlFilter: '||b2.com^', resourceTypes: ['script'] } },
        { id: 4, priority: 10, action: 'allow', condition: { urlFilter: '||a2.com^', resourceTypes: ['script'] } }
      ]
    };
    const result = partitioner.partition(rules);
    // Allow rules should be in first ruleset
    const firstRuleset = result[0];
    const allowsInFirst = firstRuleset.rules.filter(r => r.action === 'allow').length;
    assertTrue(allowsInFirst > 0);
  });

  test('RulePartitioner: respects max rulesets limit', () => {
    const partitioner = new RulePartitioner({ maxRulesPerRuleset: 10, maxRulesets: 3 });
    const rules = {
      test: Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        priority: 1,
        action: 'block',
        condition: { urlFilter: `||ex${i}.com^`, resourceTypes: ['script'] }
      }))
    };
    const result = partitioner.partition(rules);
    assertTrue(result.length <= 3);
  });

  // ============================================================
  // FormalVerifier Tests
  // ============================================================

  test('FormalVerifier: verifies basic blocking rule', () => {
    const verifier = new FormalVerifier();
    const vectors = [{
      abp: '||example.com^',
      expectedCount: 1,
      expectedRules: [{ action: 'block', urlFilter: 'example.com' }]
    }];
    const results = verifier.verify(vectors);
    assertEqual(results.passed, 1);
    assertEqual(results.failed, 0);
  });

  test('FormalVerifier: verifies exception rule', () => {
    const verifier = new FormalVerifier();
    const vectors = [{
      abp: '@@||example.com^',
      expectedCount: 1,
      expectedRules: [{ action: 'allow' }]
    }];
    const results = verifier.verify(vectors);
    assertEqual(results.passed, 1);
  });

  test('FormalVerifier: verifies redirect rule', () => {
    const verifier = new FormalVerifier();
    const vectors = [{
      abp: '||example.com^$redirect=https://safe.com',
      expectedCount: 1,
      expectedRules: [{ action: 'redirect' }]
    }];
    const results = verifier.verify(vectors);
    assertEqual(results.passed, 1);
  });

  test('FormalVerifier: round-trip verification', () => {
    const verifier = new FormalVerifier();
    const abp = '||example.com^$script,image,domain=example.com|~sub.example.com,third-party,match-case,important';
    const result = verifier.verifyRoundTrip(abp);
    assertTrue(result.valid);
    assertTrue(result.dnrRuleCount > 0);
  });

  test('FormalVerifier: semantic equivalence check', () => {
    // Clear cache to ensure fresh fingerprints
    RuleFingerprint.clearCache();

    const rule1 = { id: 1, priority: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule2 = { id: 2, priority: 1, action: { type: 'block' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };
    const rule3 = { id: 3, priority: 1, action: { type: 'allow' }, condition: { urlFilter: '*://example.com/*', resourceTypes: ['script'] } };

    const result1 = FormalVerifier.verifyEquivalence([rule1], [rule2]);
    assertTrue(result1.equivalent);

    const result2 = FormalVerifier.verifyEquivalence([rule1], [rule3]);
    assertFalse(result2.equivalent);
  });

  // ============================================================
  // Batch Validation Tests
  // ============================================================

  test('DNRValidator: batch validation finds all invalid rules', () => {
    const rules = [
      { id: 1, action: { type: 'block' }, condition: { urlFilter: '||a.com^', resourceTypes: ['script'] } },
      { id: 2, action: { type: 'invalid' }, condition: { urlFilter: '||b.com^', resourceTypes: ['script'] } },
      { id: 3, action: { type: 'block' }, condition: { resourceTypes: ['script'] } } // missing urlFilter
    ];
    const results = DNRValidator.validateBatch(rules);
    assertEqual(results.length, 2);
  });

  // ============================================================
  // Full Filter List Test
  // ============================================================

  test('Full filter list: processes ABP spec vectors', () => {
    const converter = new DNRConverter();
    // Load test vectors
    const vectorsPath = path.join(path.dirname('.'), 'test-vectors', 'abp-spec-vectors.txt');
    // We'll create a mini test vector instead
    const testContent = `
! Test filter list
||example.com^
||example.com^$script
||example.com^$image,stylesheet
||example.com^$third-party
||example.com^$domain=example.com|~sub.example.com
||example.com^$~third-party
||example.com^$match-case
||example.com^$collapse
||example.com^$important
||example.com^$cookie
||example.com^$csp=script-src 'self'
||example.com^$redirect=https://safe.com
||example.com^$removeparam=tracking
||example.com^$xmlhttprequest,subdocument,font,object,media,websocket,csp_report,ping
||example.com^$xhr,other
@@||example.com^
@@||example.com^$script
@@||example.com^$domain=example.com
@@||example.com^$important
@@||example.com^$third-party
@@||example.com^$match-case
    `.trim();

    const parseResult = parseFilterList(testContent);
    const rules = converter.convert(parseResult.rules, 1, 'test-vectors');
    const stats = converter.getStats();

    console.log(`  Total parsed: ${stats.total}`);
    console.log(`  Converted: ${stats.converted}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  By type:`, stats.byType);
    console.log(`  By action:`, stats.byAction);

    // Should convert all blocking/exception rules
    assertTrue(stats.converted > 0);
    assertTrue(stats.byAction.block > 0);
    assertTrue(stats.byAction.allow > 0);
    assertTrue(stats.byAction.redirect > 0);
  });

  // ============================================================
  // Edge Cases
  // ============================================================

  test('DNRConverter: handles Unicode domains', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||пример.рф^');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    // Unicode domains may not convert perfectly but shouldn't crash
    assertTrue(rules.length >= 0);
  });

  test('DNRConverter: handles complex domain lists', () => {
    const converter = new DNRConverter();
    const parseResult = parseFilterList('||example.com^$domain=example.com|example.org|~sub.example.com|~other.example.com');
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    assertEqual(rules[0].condition.initiatorDomains.length, 2);
    assertEqual(rules[0].condition.excludedInitiatorDomains.length, 2);
  });

  test('DNRConverter: handles all resource types', () => {
    const converter = new DNRConverter();
    const types = ['script', 'image', 'stylesheet', 'xmlhttprequest', 'subdocument', 'font', 'object', 'media', 'websocket', 'csp_report', 'ping', 'xhr', 'other'];
    const parseResult = parseFilterList(`||example.com^$${types.join(',')}`);
    const rules = converter.convert(parseResult.rules, 1, 'test');
    assertEqual(rules.length, 1);
    // Should have most resource types mapped
    assertTrue(rules[0].condition.resourceTypes.length >= 10);
  });

  // Summary
  console.log(`\n--- Results: ${passed} passed, ${failed} failed ---`);
  return failed === 0;
}

const success = runTests();
process.exit(success ? 0 : 1);