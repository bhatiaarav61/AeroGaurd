// Simulate the SW's applyDynamicRules pipeline in Node and validate every rule
const { sanitizeRule, validateRule } = await import('../background/rule-optimizer.js');
const { YouTubeAdBlocker } = await import('../background/youtube-adblocker.js');

const yt = new YouTubeAdBlocker();
await yt.initialize('aggressive');
const rules = yt.getDNRRules();

// httpsUpgrade rule as the SW builds it
rules.push({
  id: 970000,
  priority: 1,
  action: { type: 'upgradeScheme' },
  condition: {
    regexFilter: '^http://[a-z]',
    excludedRequestDomains: ['localhost'],
    resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
      'xmlhttprequest', 'media', 'websocket', 'object', 'ping']
  }
});

let invalid = 0;
for (const rule of rules) {
  const clean = sanitizeRule(rule);
  if (!clean) {
    invalid++;
    console.log('WOULD BE DROPPED:', rule.id, JSON.stringify(rule.condition).slice(0, 140));
    continue;
  }
  const errs = validateRule(clean);
  if (errs.length) {
    invalid++;
    console.log('INVALID:', rule.id, errs.join('; '));
  }
}
console.log(`\ndynamic rules: ${rules.length}, invalid/dropped: ${invalid}`);
console.log('id 80001 check:', JSON.stringify(rules.find(r => r.id === 80001)));
console.log(invalid === 0 ? 'RESULT: ALL DYNAMIC RULES VALID' : 'RESULT: FAILURES REMAIN');
process.exit(invalid === 0 ? 0 : 1);
