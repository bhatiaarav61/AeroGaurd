/**
 * Test script for RulePartitioner
 */

import { RulePartitioner, partitionRules } from './rule-partitioner.js';

// Generate test rules
function generateTestRules(count = 1000) {
  const sources = ['easylist', 'easyprivacy', 'fanboy-annoyance', 'ublock-filters', 'adguard-base'];
  const actions = ['block', 'allow', 'allowAllRequests'];
  const rules = [];

  for (let i = 0; i < count; i++) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const priority = Math.floor(Math.random() * 10) + 1;
    const isRegex = Math.random() < 0.05; // 5% regex
    const isSession = Math.random() < 0.02; // 2% session
    const isDynamic = Math.random() < 0.03; // 3% dynamic

    let condition = {
      urlFilter: `||example${i}.com^`,
      resourceTypes: ['main_frame', 'sub_frame']
    };

    if (isRegex) {
      condition = { regexFilter: `example${i}\\.com/.*`, resourceTypes: ['main_frame'] };
    }
    if (isSession) {
      condition.sessionOnly = true;
    }
    if (isDynamic) {
      condition.initiator = 'example.com';
    }

    rules.push({
      id: i + 1,
      priority,
      action,
      condition,
      source
    });
  }

  return rules;
}

// Run tests
console.log('Testing RulePartitioner...\n');

// Test 1: Basic partitioning
console.log('Test 1: Basic partitioning (1000 rules)');
const testRules1 = generateTestRules(1000);
const result1 = partitionRules(testRules1);
console.log(`  Rulesets created: ${result1.rulesets.length}`);
console.log(`  Total rules: ${result1.stats.totalRules}`);
console.log(`  Static rules: ${result1.stats.staticRules}`);
console.log(`  Regex rules: ${result1.stats.regexRules}`);
console.log(`  Session rules: ${result1.stats.sessionRules}`);
console.log(`  Dynamic rules: ${result1.stats.dynamicRules}`);
console.log(`  Validation: ${result1.validation.valid ? 'PASSED' : 'FAILED'}`);
if (!result1.validation.valid) {
  console.log(`  Errors: ${result1.validation.errors.join(', ')}`);
}
if (result1.validation.warnings.length > 0) {
  console.log(`  Warnings: ${result1.validation.warnings.join(', ')}`);
}
console.log();

// Test 2: Large rule set (near limits)
console.log('Test 2: Large rule set (150000 static rules)');
const testRules2 = generateTestRules(150000);
const result2 = partitionRules(testRules2);
console.log(`  Rulesets created: ${result2.rulesets.length}`);
console.log(`  Total rules: ${result2.stats.totalRules}`);
console.log(`  Static rules: ${result2.stats.staticRules}`);
console.log(`  Validation: ${result2.validation.valid ? 'PASSED' : 'FAILED'}`);
if (!result2.validation.valid) {
  console.log(`  Errors: ${result2.validation.errors.join(', ')}`);
}
console.log();

// Test 3: With regex rules exceeding limit
console.log('Test 3: Many regex rules (3000)');
const testRules3 = [];
for (let i = 0; i < 3000; i++) {
  testRules3.push({
    id: i + 1,
    priority: 1,
    action: 'block',
    condition: { regexFilter: `example${i}\\.com/.*`, resourceTypes: ['main_frame'] },
    source: 'test'
  });
}
const result3 = partitionRules(testRules3, { maxRegexRules: 2000 });
console.log(`  Rulesets created: ${result3.rulesets.length}`);
console.log(`  Regex rules: ${result3.stats.regexRules}`);
console.log(`  Regex rulesets: ${result3.rulesets.filter(r => r.options.isRegex).length}`);
console.log(`  Validation: ${result3.validation.valid ? 'PASSED' : 'FAILED'}`);
console.log();

// Test 4: With session rules exceeding limit
console.log('Test 4: Many session rules (6000)');
const testRules4 = [];
for (let i = 0; i < 6000; i++) {
  testRules4.push({
    id: i + 1,
    priority: 1,
    action: 'block',
    condition: { urlFilter: `||example${i}.com^`, sessionOnly: true },
    source: 'test'
  });
}
const result4 = partitionRules(testRules4, { maxSessionRules: 5000 });
console.log(`  Rulesets created: ${result4.rulesets.length}`);
console.log(`  Session rules: ${result4.stats.sessionRules}`);
console.log(`  Session rulesets: ${result4.rulesets.filter(r => r.options.isSession).length}`);
console.log(`  Validation: ${result4.validation.valid ? 'PASSED' : 'FAILED'}`);
console.log();

// Test 5: Priority distribution verification
console.log('Test 5: Priority distribution (allow rules in lower ID rulesets)');
const testRules5 = [
  { id: 1, priority: 1, action: 'block', condition: { urlFilter: '||block1.com^' }, source: 'test' },
  { id: 2, priority: 1, action: 'allow', condition: { urlFilter: '||allow1.com^' }, source: 'test' },
  { id: 3, priority: 10, action: 'block', condition: { urlFilter: '||block2.com^' }, source: 'test' },
  { id: 4, priority: 10, action: 'allow', condition: { urlFilter: '||allow2.com^' }, source: 'test' },
  { id: 5, priority: 1, action: 'block', condition: { urlFilter: '||block3.com^' }, source: 'test' },
];
const result5 = partitionRules(testRules5, { maxRulesets: 5, maxStaticRules: 100 });
const staticRulesets = result5.rulesets.filter(r => r.options.isStatic && !r.options.isRegex && !r.options.isSession);
console.log(`  Static rulesets: ${staticRulesets.length}`);
for (const rs of staticRulesets) {
  const allowCount = rs.rules.filter(r => r.action === 'allow').length;
  const blockCount = rs.rules.filter(r => r.action === 'block').length;
  console.log(`  Ruleset ${rs.id} (${rs.name}): allow=${allowCount}, block=${blockCount}`);
}
console.log(`  Validation: ${result5.validation.valid ? 'PASSED' : 'FAILED'}`);
console.log();

// Test 6: ID collision handling
console.log('Test 6: ID collision handling');
const testRules6 = [
  { id: 1, priority: 1, action: 'block', condition: { urlFilter: '||test1.com^' }, source: 'test' },
  { id: 1, priority: 1, action: 'block', condition: { urlFilter: '||test2.com^' }, source: 'test' }, // Duplicate ID
  { priority: 1, action: 'block', condition: { urlFilter: '||test3.com^' }, source: 'test' }, // No ID
];
try {
  const result6 = partitionRules(testRules6);
  console.log(`  Rulesets: ${result6.rulesets.length}`);
  const allIds = new Set();
  for (const rs of result6.rulesets) {
    for (const rule of rs.rules) {
      allIds.add(rule.id);
    }
  }
  console.log(`  Unique rule IDs: ${allIds.size} (expected 3)`);
  console.log(`  Validation: ${result6.validation.valid ? 'PASSED' : 'FAILED'}`);
} catch (e) {
  console.log(`  Error (expected): ${e.message}`);
}
console.log();

// Test 7: Export to manifest
console.log('Test 7: Export to manifest format');
const testRules7 = generateTestRules(100);
const result7 = partitionRules(testRules7);
const manifest = result7.rulesets.map(rs => ({ id: rs.id, enabled: rs.enabled, path: `rulesets/${rs.name}.json` }));
console.log(`  Manifest entries: ${manifest.length}`);
console.log(`  First entry: ${JSON.stringify(manifest[0])}`);
console.log();

// Test 8: Get ruleset by ID/name
console.log('Test 8: Get ruleset by ID/name');
const partitioner = new RulePartitioner();
partitioner.partition(generateTestRules(50));
const rsById = partitioner.getRuleset(1);
const rsByName = partitioner.getRulesetByName('static-1');
console.log(`  By ID: ${rsById ? rsById.name : 'not found'}`);
console.log(`  By Name: ${rsByName ? rsByName.id : 'not found'}`);
console.log();

// Test 9: Custom options
console.log('Test 9: Custom options');
const customOptions = {
  maxRulesets: 10,
  maxStaticRules: 50000,
  maxRegexRules: 1000,
  maxSessionRules: 2500,
  reservedDynamicRulesets: 2
};
const testRules9 = generateTestRules(50000);
const result9 = partitionRules(testRules9, customOptions);
console.log(`  Rulesets: ${result9.rulesets.length} (max 10)`);
console.log(`  Static rules: ${result9.stats.staticRules}`);
console.log(`  Validation: ${result9.validation.valid ? 'PASSED' : 'FAILED'}`);
console.log();

console.log('All tests completed!');