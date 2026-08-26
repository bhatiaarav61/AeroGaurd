/**
 * Test with 200K rules as specified in requirements
 */

import { RulePartitioner, partitionRules } from './rule-partitioner.js';

function generateLargeRules(count) {
  const sources = ['easylist', 'easyprivacy', 'fanboy-annoyance', 'ublock-filters', 'adguard-base', 'adguard-mobile', 'adguard-tracking', 'adguard-social'];
  const actions = ['block', 'allow', 'allowAllRequests'];
  const rules = [];

  for (let i = 0; i < count; i++) {
    const source = sources[Math.floor(Math.random() * sources.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const priority = Math.floor(Math.random() * 10) + 1;
    const isRegex = Math.random() < 0.01; // 1% regex
    const isSession = Math.random() < 0.005; // 0.5% session
    const isDynamic = Math.random() < 0.01; // 1% dynamic

    let condition = {
      urlFilter: `||example${i}.com^`,
      resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'other']
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

console.log('Testing with 200K rules...\n');
const startTime = Date.now();

const testRules = generateLargeRules(200000);
console.log(`Generated ${testRules.length} rules in ${Date.now() - startTime}ms`);

const partitionStart = Date.now();
const result = partitionRules(testRules, {
  maxRulesets: 20,
  maxStaticRules: 150000,
  maxRegexRules: 2000,
  maxSessionRules: 5000,
  reservedDynamicRulesets: 2
});

console.log(`Partitioned in ${Date.now() - partitionStart}ms`);
console.log(`\nResults:`);
console.log(`  Rulesets created: ${result.rulesets.length} / 20`);
console.log(`  Total rules: ${result.stats.totalRules}`);
console.log(`  Static rules: ${result.stats.staticRules}`);
console.log(`  Regex rules: ${result.stats.regexRules}`);
console.log(`  Session rules: ${result.stats.sessionRules}`);
console.log(`  Dynamic rules: ${result.stats.dynamicRules}`);
console.log(`  Validation: ${result.validation.valid ? 'PASSED' : 'FAILED'}`);

if (!result.validation.valid) {
  console.log(`  Errors: ${result.validation.errors.join(', ')}`);
}

if (result.validation.warnings.length > 0) {
  console.log(`  Warnings: ${result.validation.warnings.join(', ')}`);
}

console.log(`\nRuleset breakdown:`);
for (const rs of result.rulesets) {
  const typeFlags = [];
  if (rs.options.isStatic) typeFlags.push('static');
  if (rs.options.isRegex) typeFlags.push('regex');
  if (rs.options.isSession) typeFlags.push('session');
  if (rs.options.isDynamic) typeFlags.push('dynamic');
  if (rs.options.isUserCustom) typeFlags.push('user-custom');
  if (rs.options.isSessionRules) typeFlags.push('session-rules');
  console.log(`  Ruleset ${rs.id}: ${rs.name} [${typeFlags.join(', ')}] - ${rs.ruleCount} rules`);
}

console.log(`\nBy source:`);
for (const [source, count] of Object.entries(result.stats.bySource)) {
  console.log(`  ${source}: ${count}`);
}

console.log(`\nBy action:`);
for (const [action, count] of Object.entries(result.stats.byAction)) {
  console.log(`  ${action}: ${count}`);
}

console.log(`\nBy priority:`);
for (const [priority, count] of Object.entries(result.stats.byPriority)) {
  console.log(`  Priority ${priority}: ${count}`);
}

// Verify limits
console.log('\n--- Limit Verification ---');
const totalStatic = result.rulesets.filter(r => r.options.isStatic && !r.options.isRegex && !r.options.isSession).reduce((sum, r) => sum + r.ruleCount, 0);
const totalRegex = result.rulesets.filter(r => r.options.isRegex).reduce((sum, r) => sum + r.ruleCount, 0);
const totalSession = result.rulesets.filter(r => r.options.isSession).reduce((sum, r) => sum + r.ruleCount, 0);

console.log(`Total static rules: ${totalStatic} (limit: 150000) - ${totalStatic <= 150000 ? 'OK' : 'EXCEEDED'}`);
console.log(`Total regex rules: ${totalRegex} (limit: 2000 per ruleset) - ${totalRegex <= 2000 * result.rulesets.filter(r => r.options.isRegex).length ? 'OK' : 'EXCEEDED'}`);
console.log(`Total session rules: ${totalSession} (limit: 5000 per ruleset) - ${totalSession <= 5000 * result.rulesets.filter(r => r.options.isSession).length ? 'OK' : 'EXCEEDED'}`);
console.log(`Total rulesets: ${result.rulesets.length} (limit: 20) - ${result.rulesets.length <= 20 ? 'OK' : 'EXCEEDED'}`);

// Check ID uniqueness
const allIds = new Set();
let duplicateCount = 0;
for (const rs of result.rulesets) {
  for (const rule of rs.rules) {
    if (allIds.has(rule.id)) {
      duplicateCount++;
    }
    allIds.add(rule.id);
  }
}
console.log(`Unique rule IDs: ${allIds.size} (expected: ${result.stats.totalRules}) - ${duplicateCount === 0 ? 'OK' : `DUPLICATES: ${duplicateCount}`}`);

// Check priority distribution
const staticRulesets = result.rulesets.filter(r => r.options.isStatic && !r.options.isRegex && !r.options.isSession);
let priorityOk = true;
for (let i = 1; i < staticRulesets.length; i++) {
  if (staticRulesets[i].id < staticRulesets[i - 1].id) {
    priorityOk = false;
  }
}
console.log(`Static ruleset IDs ordered by priority: ${priorityOk ? 'OK' : 'ISSUE'}`);

console.log(`\nTotal time: ${Date.now() - startTime}ms`);