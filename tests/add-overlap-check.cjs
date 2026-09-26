const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/validate-dnr.py';
let s = fs.readFileSync(p, 'utf8');
const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const J = (arr) => arr.join(EOL);

const anchor = J([
  'def check_rule(rule, index, errors, warnings, seen_ids):',
  '    if not isinstance(rule, dict):',
  "        errors.append('rule[%d] is not an object' % index)",
  '        return'
]);
if (!s.includes(anchor)) { console.log('ANCHOR NOT FOUND'); process.exit(1); }

const helper = J([
  'INCLUDE_EXCLUDE_PAIRS = [',
  "    ('resourceTypes', 'excludedResourceTypes'),",
  "    ('requestDomains', 'excludedRequestDomains'),",
  "    ('initiatorDomains', 'excludedInitiatorDomains'),",
  "    ('requestMethods', 'excludedRequestMethods'),",
  "    ('tabIds', 'excludedTabIds'),",
  ']',
  '',
  '',
  'def check_include_exclude_overlap(rule, index, errors):',
  '    """Chrome rejects rules that include and exclude the same resource."""',
  '    condition = rule.get(\'condition\') or {}',
  '    for inc_key, exc_key in INCLUDE_EXCLUDE_PAIRS:',
  '        inc = condition.get(inc_key)',
  '        exc = condition.get(exc_key)',
  '        if not isinstance(inc, list) or not isinstance(exc, list):',
  '            continue',
  '        overlap = [v for v in inc if v in exc]',
  '        if overlap:',
  '            errors.append(',
  "                'rule[%d] includes and excludes the same %s: %r'",
  '                % (index, inc_key, overlap)',
  '            )',
  '',
  '',
  'def check_rule(rule, index, errors, warnings, seen_ids):',
  '    if not isinstance(rule, dict):',
  "        errors.append('rule[%d] is not an object' % index)",
  '        return'
]);
s = s.replace(anchor, helper);

// call it from check_rule after the id checks — anchor on a stable later line
const callAnchor = '    rule_id = rule.get(\'id\')';
if (!s.includes(callAnchor)) { console.log('CALL ANCHOR NOT FOUND'); process.exit(1); }
s = s.replace(callAnchor, J([
  '    check_include_exclude_overlap(rule, index, errors)',
  '',
  '    rule_id = rule.get(\'id\')'
]));

fs.writeFileSync(p, s);
console.log('overlap check added to validate-dnr.py');
