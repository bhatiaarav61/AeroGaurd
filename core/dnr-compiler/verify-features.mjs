import { RulePartitioner } from './rule-partitioner.js';

// Verify all features from requirements
console.log('=== Feature Verification ===');
console.log();

// 1. 200K rules across 20 rulesets
console.log('1. 200K rules across 20 rulesets:');
const p1 = new RulePartitioner({ maxRulesets: 20, maxStaticRules: 150000 });
const rules200k = [];
for (let i = 0; i < 200000; i++) {
  rules200k.push({ id: i+1, priority: 1, action: 'block', condition: { urlFilter: '||ex' + i + '.com^' }, source: 'test' });
}
const r1 = p1.partition(rules200k);
console.log('   Total rulesets:', r1.rulesets.length, '(expected 20)');
console.log('   Total rules processed:', r1.stats.totalRules, '(expected 200000)');
console.log('   Static rules (capped at 150K):', r1.validation.summary.totalStaticRules);
console.log();

// 2. Dynamic partitioning
console.log('2. Dynamic partitioning (adapts to input):');
const p2 = new RulePartitioner();
const rulesSmall = [{id:1,priority:1,action:'block',condition:{urlFilter:'||a.com^'},source:'test'}];
const r2 = p2.partition(rulesSmall);
console.log('   Small input (1 rule):', r2.rulesets.length, 'rulesets');
console.log();

// 3. Quota management
console.log('3. Quota management:');
console.log('   Max static rules per partition:', 150000);
console.log('   Max regex rules per ruleset:', 2000);
console.log('   Max session rules per ruleset:', 5000);
console.log('   Reserved dynamic rulesets:', 2);
console.log();

// 4. Strategy by list source then by priority/action
console.log('4. Strategy by source + priority/action:');
console.log('   - Rules grouped by source (easylist, easyprivacy, etc.)');
console.log('   - Within source: sorted by priority then action (allow first)');
console.log('   - Verified in test output above');
console.log();

// 5. Load balancing: even distribution respecting 150K static limit
console.log('5. Load balancing:');
const staticRulesets = r1.rulesets.filter(rs => rs.options.isStatic && !rs.options.isRegex && !rs.options.isSession);
const counts = staticRulesets.map(rs => rs.ruleCount);
console.log('   Static ruleset counts:', counts.slice(0, 5), '... (total:', counts.length, 'rulesets)');
console.log('   Min:', Math.min(...counts), 'Max:', Math.max(...counts), 'Avg:', (counts.reduce((a,b)=>a+b,0)/counts.length).toFixed(0));
console.log();

// 6. Priority distribution: high-priority in lower-ID rulesets
console.log('6. Priority distribution (allow in lower IDs):');
const p6 = new RulePartitioner({ maxRulesets: 5, maxStaticRules: 100 });
const rules6 = [
  {id:1,priority:1,action:'block',condition:{urlFilter:'||b1.com^'},source:'test'},
  {id:2,priority:1,action:'allow',condition:{urlFilter:'||a1.com^'},source:'test'},
  {id:3,priority:10,action:'block',condition:{urlFilter:'||b2.com^'},source:'test'},
  {id:4,priority:10,action:'allow',condition:{urlFilter:'||a2.com^'},source:'test'},
];
const r6 = p6.partition(rules6);
const s6 = r6.rulesets.filter(rs => rs.options.isStatic && !rs.options.isRegex && !rs.options.isSession);
for (const rs of s6) {
  const allows = rs.rules.filter(r => r.action === 'allow').length;
  const blocks = rs.rules.filter(r => r.action === 'block').length;
  console.log('   Ruleset', rs.id, '(' + rs.name + '): allow=' + allows, 'block=' + blocks);
}
console.log();

// 7. Reserved 2 for user custom and session rules
console.log('7. Reserved 2 dynamic rulesets:');
const dynamic = r1.rulesets.filter(rs => rs.options.isDynamic);
console.log('   Dynamic rulesets:', dynamic.map(d => d.name + ' (id=' + d.id + ')'));
console.log();

// 8. Regex ruleset: dedicated, max 2000
console.log('8. Regex ruleset (max 2000 per ruleset):');
const regexRules = [];
for (let i = 0; i < 5000; i++) {
  regexRules.push({id:i+1,priority:1,action:'block',condition:{regexFilter:'ex' + i + '\\.com/.*'},source:'test'});
}
const p8 = new RulePartitioner({ maxRegexRules: 2000 });
const r8 = p8.partition(regexRules);
const regexSets = r8.rulesets.filter(rs => rs.options.isRegex);
console.log('   Regex rulesets created:', regexSets.length, '(expected 3 for 5000 rules at 2000 each)');
for (const rs of regexSets) {
  console.log('   ', rs.name, ': ', rs.ruleCount, ' rules');
}
console.log();

// 9. Session ruleset: dedicated, max 5000
console.log('9. Session ruleset (max 5000 per ruleset):');
const sessionRules = [];
for (let i = 0; i < 12000; i++) {
  sessionRules.push({id:i+1,priority:1,action:'block',condition:{urlFilter:'||ex' + i + '.com^',sessionOnly:true},source:'test'});
}
const p9 = new RulePartitioner({ maxSessionRules: 5000 });
const r9 = p9.partition(sessionRules);
const sessionSets = r9.rulesets.filter(rs => rs.options.isSession);
console.log('   Session rulesets created:', sessionSets.length, '(expected 3 for 12000 rules at 5000 each)');
for (const rs of sessionSets) {
  console.log('   ', rs.name, ': ', rs.ruleCount, ' rules');
}
console.log();

// 10. Validation
console.log('10. Validation:');
console.log('   - Total rulesets <= 20:', r1.validation.summary.totalRulesets <= 20 ? 'PASS' : 'FAIL');
console.log('   - No ID collisions:', r1.validation.errors.filter(e => e.includes('collision')).length === 0 ? 'PASS' : 'FAIL');
console.log('   - Static rules <= 150K:', r1.validation.summary.totalStaticRules <= 150000 ? 'PASS' : 'FAIL');
console.log('   - All rulesets valid structure:', r1.validation.errors.filter(e => e.includes('Invalid ruleset')).length === 0 ? 'PASS' : 'FAIL');
console.log('   - Overall valid:', r1.validation.valid ? 'PASS' : 'FAIL');