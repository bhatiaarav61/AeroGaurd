#!/usr/bin/env python3
"""
AeroGuard declarativeNetRequest ruleset validator (+ auto-fixer).

Checks every rules/*.json static ruleset against the real Chrome DNR schema
(see extensions/common/api/declarative_net_request.idl) and the manifest.

Usage:
    python validate-dnr.py            # validate and report
    python validate-dnr.py --fix      # rewrite rulesets, removing invalid rules
    python validate-dnr.py --quiet    # print errors only
"""

import argparse
import collections
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
RULES_DIR = os.path.join(ROOT, 'rules')
MANIFEST_PATH = os.path.join(ROOT, 'manifest.json')

VALID_RESOURCE_TYPES = {
    'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
    'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
    'webtransport', 'webbundle', 'other',
}
NAVIGATION_TYPES = {'main_frame', 'sub_frame'}
VALID_ACTION_TYPES = {
    'block', 'redirect', 'allow', 'upgradeScheme', 'modifyHeaders',
    'allowAllRequests',
}
VALID_METHODS = {'connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'other'}
VALID_DOMAIN_TYPES = {'firstParty', 'thirdParty'}
HEADER_OPERATIONS = {'append', 'set', 'remove'}

CONDITION_KEYS = {
    'urlFilter', 'regexFilter', 'isUrlFilterCaseSensitive',
    'initiatorDomains', 'excludedInitiatorDomains',
    'requestDomains', 'excludedRequestDomains',
    'resourceTypes', 'excludedResourceTypes',
    'requestMethods', 'excludedRequestMethods',
    'domainType', 'tabIds', 'excludedTabIds',
    'domains', 'excludedDomains',  # deprecated, migrated by --fix
}
ACTION_KEYS = {'type', 'redirect', 'requestHeaders', 'responseHeaders'}
DOMAIN_RE = re.compile(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$')

MAX_STATIC_RULES = 330000
MAX_REGEX_RULES = 1000
MAX_STATIC_RULESETS = 100
MAX_ENABLED_STATIC_RULESETS = 50

# Characters that are ABP-only syntax and therefore a conversion bug.
URLFILTER_BAD_CHARS = '~'


def is_ascii(value):
    try:
        value.encode('ascii')
        return True
    except (UnicodeDecodeError, AttributeError, ValueError):
        return False


def check_url_filter(url_filter, errors):
    if not isinstance(url_filter, str) or not url_filter:
        errors.append('urlFilter is empty')
        return
    if not is_ascii(url_filter):
        errors.append('urlFilter is not ASCII: %r' % url_filter[:60])
    for ch in URLFILTER_BAD_CHARS:
        if ch in url_filter:
            errors.append("urlFilter contains ABP-only '%s': %r" % (ch, url_filter[:60]))
    if '**' in url_filter:
        errors.append("urlFilter contains consecutive '*': %r" % url_filter[:60])
    for idx, ch in enumerate(url_filter):
        if ch == '|' and idx not in (0, 1):
            errors.append("urlFilter has misplaced '|': %r" % url_filter[:60])
            break
    if url_filter.startswith('||') and url_filter[2:3] in ('*', '^'):
        errors.append('urlFilter has empty domain anchor: %r' % url_filter[:60])


def check_domain_list(domains, label, errors):
    if domains is None:
        return
    if not isinstance(domains, list) or not domains:
        errors.append('%s must be a non-empty array' % label)
        return
    for domain in domains:
        if not isinstance(domain, str) or not domain:
            errors.append('%s contains an empty entry' % label)
            continue
        if not is_ascii(domain):
            errors.append('%s contains non-ASCII domain %r' % (label, domain))
            continue
        if domain != domain.lower():
            errors.append('%s contains non-lowercase domain %r' % (label, domain))
        for bad in ('*', '/', ':', ' ', '?', '#', '@'):
            if bad in domain:
                errors.append('%s contains invalid domain %r' % (label, domain))
                break
        else:
            if not DOMAIN_RE.match(domain):
                errors.append('%s contains malformed domain %r' % (label, domain))


def is_re2_safe(pattern):
    """Chrome uses RE2: no lookaround, no backreferences."""
    if not pattern or not is_ascii(pattern):
        return False
    if re.search(r'\(\?[=!<]', pattern):
        return False
    if re.search(r'\\[1-9]', pattern):
        return False
    try:
        re.compile(pattern)
    except re.error:
        return False
    return True


INCLUDE_EXCLUDE_PAIRS = [
    ('resourceTypes', 'excludedResourceTypes'),
    ('requestDomains', 'excludedRequestDomains'),
    ('initiatorDomains', 'excludedInitiatorDomains'),
    ('requestMethods', 'excludedRequestMethods'),
    ('tabIds', 'excludedTabIds'),
]


def check_include_exclude_overlap(rule, index, errors):
    """Chrome rejects rules that include and exclude the same resource."""
    condition = rule.get('condition') or {}
    for inc_key, exc_key in INCLUDE_EXCLUDE_PAIRS:
        inc = condition.get(inc_key)
        exc = condition.get(exc_key)
        if not isinstance(inc, list) or not isinstance(exc, list):
            continue
        overlap = [v for v in inc if v in exc]
        if overlap:
            errors.append(
                'rule[%d] includes and excludes the same %s: %r'
                % (index, inc_key, overlap)
            )


def check_rule(rule, index, errors, warnings, seen_ids):
    if not isinstance(rule, dict):
        errors.append('rule[%d] is not an object' % index)
        return

    check_include_exclude_overlap(rule, index, errors)

    rule_id = rule.get('id')
    if isinstance(rule_id, bool) or not isinstance(rule_id, int) or not (1 <= rule_id <= 2147483647):
        errors.append('rule[%d] invalid id %r' % (index, rule_id))
    elif rule_id in seen_ids:
        errors.append('rule[%d] duplicate id %d' % (index, rule_id))
    else:
        seen_ids.add(rule_id)

    priority = rule.get('priority')
    if priority is not None and (isinstance(priority, bool) or not isinstance(priority, int) or priority < 1):
        errors.append('rule[%d] invalid priority %r' % (index, priority))

    action = rule.get('action')
    if not isinstance(action, dict) or action.get('type') not in VALID_ACTION_TYPES:
        errors.append('rule[%d] invalid action.type %r' % (index, (action or {}).get('type')))
        action = {}
    else:
        for key in action:
            if key not in ACTION_KEYS:
                errors.append('rule[%d] unsupported action key %r' % (index, key))
        action_type = action['type']
        if action_type == 'redirect':
            redirect = action.get('redirect')
            if not isinstance(redirect, dict) or not redirect:
                errors.append('rule[%d] redirect action without redirect payload' % index)
            else:
                if not ({'url', 'extensionPath', 'transform', 'regexSubstitution'} & set(redirect)):
                    errors.append('rule[%d] redirect payload has no target' % index)
                if 'regexSubstitution' in redirect:
                    errors.append('rule[%d] regexSubstitution must live inside redirect.transform' % index)
                for key in redirect:
                    if key not in ('url', 'extensionPath', 'transform'):
                        errors.append('rule[%d] unsupported redirect key %r' % (index, key))
                transform = redirect.get('transform') or {}
                for key in transform:
                    if key not in ('scheme', 'host', 'port', 'path', 'query', 'fragment', 'queryTransform'):
                        errors.append('rule[%d] unsupported transform key %r' % (index, key))
        elif action_type == 'modifyHeaders':
            request_headers = action.get('requestHeaders')
            response_headers = action.get('responseHeaders')
            if not request_headers and not response_headers:
                errors.append('rule[%d] modifyHeaders without headers' % index)
            for header_list, label, allow_append in (
                (request_headers, 'requestHeaders', False),
                (response_headers, 'responseHeaders', True),
            ):
                if header_list is None:
                    continue
                if not isinstance(header_list, list) or not header_list:
                    errors.append('rule[%d] %s must be a non-empty array' % (index, label))
                    continue
                for header in header_list:
                    if not isinstance(header, dict) or not header.get('header'):
                        errors.append('rule[%d] malformed %s entry' % (index, label))
                        continue
                    operation = header.get('operation')
                    if operation not in HEADER_OPERATIONS:
                        errors.append('rule[%d] invalid header operation %r' % (index, operation))
                    if operation == 'append' and not allow_append:
                        errors.append("rule[%d] 'append' is not allowed for request headers" % index)
                    if operation in ('set', 'append') and 'value' not in header:
                        errors.append('rule[%d] header %r needs a value' % (index, header.get('header')))


    condition = rule.get('condition')
    if not isinstance(condition, dict):
        errors.append('rule[%d] missing condition' % index)
        return

    for key in condition:
        if key not in CONDITION_KEYS:
            errors.append('rule[%d] unsupported condition key %r' % (index, key))

    url_filter = condition.get('urlFilter')
    regex_filter = condition.get('regexFilter')
    if url_filter is None and regex_filter is None:
        errors.append('rule[%d] has neither urlFilter nor regexFilter' % index)
    if url_filter is not None and regex_filter is not None:
        errors.append('rule[%d] has both urlFilter and regexFilter' % index)
    if url_filter is not None:
        check_url_filter(url_filter, errors)
    if regex_filter is not None and not is_ascii(regex_filter):
        errors.append('rule[%d] regexFilter is not ASCII' % index)

    for key in ('initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains'):
        check_domain_list(condition.get(key), key, errors)

    for legacy, modern in (('domains', 'initiatorDomains'), ('excludedDomains', 'excludedInitiatorDomains')):
        if legacy in condition:
            warnings.append('rule[%d] uses deprecated %r (use %r)' % (index, legacy, modern))
            check_domain_list(condition.get(legacy), legacy, errors)

    resource_types = condition.get('resourceTypes')
    if resource_types is not None:
        if not isinstance(resource_types, list) or not resource_types:
            errors.append('rule[%d] resourceTypes must be a non-empty array' % index)
        else:
            for rt in resource_types:
                if rt not in VALID_RESOURCE_TYPES:
                    errors.append('rule[%d] invalid resourceType %r' % (index, rt))
            if action.get('type') == 'allowAllRequests':
                invalid = [rt for rt in resource_types if rt not in NAVIGATION_TYPES]
                if invalid:
                    errors.append('rule[%d] allowAllRequests only allows navigation types (got %r)' % (index, invalid))
    elif action.get('type') == 'allowAllRequests':
        errors.append('rule[%d] allowAllRequests requires resourceTypes' % index)

    excluded_types = condition.get('excludedResourceTypes')
    if excluded_types is not None:
        if not isinstance(excluded_types, list) or not excluded_types:
            errors.append('rule[%d] excludedResourceTypes must be a non-empty array' % index)
        else:
            for rt in excluded_types:
                if rt not in VALID_RESOURCE_TYPES:
                    errors.append('rule[%d] invalid excludedResourceType %r' % (index, rt))

    for key in ('requestMethods', 'excludedRequestMethods'):
        methods = condition.get(key)
        if methods is None:
            continue
        if not isinstance(methods, list) or not methods:
            errors.append('rule[%d] %s must be a non-empty array' % (index, key))
            continue
        for method in methods:
            if method not in VALID_METHODS:
                errors.append('rule[%d] invalid %s %r' % (index, key, method))

    domain_type = condition.get('domainType')
    if domain_type is not None and domain_type not in VALID_DOMAIN_TYPES:
        errors.append('rule[%d] invalid domainType %r' % (index, domain_type))


def sanitize_rule(rule):
    """Return a corrected copy of the rule, or None when it cannot be used."""
    if not isinstance(rule, dict):
        return None
    action = rule.get('action')
    condition = rule.get('condition')
    if not isinstance(action, dict) or not isinstance(condition, dict):
        return None
    if action.get('type') not in VALID_ACTION_TYPES:
        return None

    fixed = {
        'id': rule.get('id'),
        'priority': rule.get('priority', 1),
        'action': json.loads(json.dumps(action)),
        'condition': json.loads(json.dumps(condition)),
    }
    condition = fixed['condition']
    action = fixed['action']

    # migrate deprecated domain keys (domains == initiator domains semantics)
    if 'domains' in condition:
        condition['initiatorDomains'] = list(condition.get('initiatorDomains', [])) + list(condition.pop('domains'))
    if 'excludedDomains' in condition:
        condition['excludedInitiatorDomains'] = list(condition.get('excludedInitiatorDomains', [])) + list(condition.pop('excludedDomains'))

    # drop unsupported keys
    for key in list(condition):
        if key not in CONDITION_KEYS or key in ('domains', 'excludedDomains'):
            condition.pop(key)
    for key in list(action):
        if key not in ACTION_KEYS:
            action.pop(key)
    if isinstance(action.get('redirect'), dict):
        redirect = action['redirect']
        for key in list(redirect):
            if key not in ('url', 'extensionPath', 'transform'):
                redirect.pop(key)
        if not redirect:
            action.pop('redirect')
    if action.get('type') == 'redirect' and not isinstance(action.get('redirect'), dict):
        return None

    # dedupe / sanitize resource types
    if 'resourceTypes' in condition:
        seen = []
        for rt in condition['resourceTypes'] if isinstance(condition['resourceTypes'], list) else []:
            if rt in VALID_RESOURCE_TYPES and rt not in seen:
                seen.append(rt)
        if action.get('type') == 'allowAllRequests':
            seen = [rt for rt in seen if rt in NAVIGATION_TYPES]
        if not seen:
            return None
        condition['resourceTypes'] = seen
    if 'excludedResourceTypes' in condition:
        seen = []
        for rt in condition['excludedResourceTypes'] if isinstance(condition['excludedResourceTypes'], list) else []:
            if rt in VALID_RESOURCE_TYPES and rt not in seen:
                seen.append(rt)
        if seen:
            condition['excludedResourceTypes'] = seen
        else:
            condition.pop('excludedResourceTypes')

    # sanitize domain lists
    had_domain_restriction = any(
        key in condition and condition[key]
        for key in ('initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains')
    )
    for key in ('initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains'):
        if key not in condition:
            continue
        cleaned = []
        values = condition[key] if isinstance(condition[key], list) else []
        for domain in values:
            if not isinstance(domain, str):
                continue
            domain = domain.strip().lower().lstrip('*.').rstrip('.')
            if not domain or not is_ascii(domain) or not DOMAIN_RE.match(domain):
                continue
            if domain not in cleaned:
                cleaned.append(domain)
        if cleaned:
            condition[key] = cleaned
        else:
            condition.pop(key)
            if key in ('initiatorDomains', 'requestDomains'):
                # an include-list that lost every entry would match everything
                return None
    if had_domain_restriction and not any(
        key in condition for key in ('initiatorDomains', 'excludedInitiatorDomains', 'requestDomains', 'excludedRequestDomains')
    ):
        return None

    # ABP regex filters (/pattern/) become DNR regexFilter rules
    url_filter = condition.get('urlFilter')
    if isinstance(url_filter, str):
        regex_match = re.match(r'^/(.+)/$', url_filter, re.S)
        if regex_match:
            pattern = regex_match.group(1)
            if not is_re2_safe(pattern):
                return None
            condition.pop('urlFilter')
            condition['regexFilter'] = pattern
            url_filter = None

    # drop urlFilters that DNR cannot represent faithfully
    if isinstance(url_filter, str):
        if not url_filter or '~' in url_filter or not is_ascii(url_filter) or '**' in url_filter:
            return None
        if any(ch == '|' for ch in url_filter[2:]):
            return None
        if url_filter.startswith('||') and url_filter[2:3] in ('*', '^'):
            return None
    elif 'regexFilter' not in condition and 'urlFilter' not in condition:
        return None

    if condition.get('domainType') not in (None, 'firstParty', 'thirdParty'):
        condition.pop('domainType', None)

    # final validation pass; drop anything still broken
    errors = []
    warnings = []
    check_rule(fixed, 0, errors, warnings, set())
    if errors:
        return None
    return fixed


def load_json(path):
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def validate(fix=False, quiet=False):
    if not os.path.isdir(RULES_DIR):
        print('rules/ directory not found', file=sys.stderr)
        return 1

    SKIP = {'ruleset-index.json', 'static-index.json'}  # metadata, not rulesets
    files = sorted(f for f in os.listdir(RULES_DIR) if f.endswith('.json') and f not in SKIP)
    total_rules = 0
    total_regex = 0
    all_errors = collections.OrderedDict()
    all_warnings = collections.OrderedDict()
    fixed_report = collections.OrderedDict()

    for filename in files:
        path = os.path.join(RULES_DIR, filename)
        try:
            rules = load_json(path)
        except Exception as exc:  # noqa: BLE001 - surface any parse failure
            all_errors[filename] = ['JSON parse error: %s' % exc]
            continue
        if not isinstance(rules, list):
            all_errors[filename] = ['top-level value must be an array']
            continue

        errors = []
        warnings = []
        seen_ids = set()
        kept = []
        dropped = 0
        for index, rule in enumerate(rules):
            rule_errors = []
            rule_warnings = []
            check_rule(rule, index, rule_errors, rule_warnings, seen_ids)
            errors.extend(rule_errors)
            warnings.extend(rule_warnings)
            total_regex += 1 if (isinstance(rule, dict) and rule.get('condition', {}).get('regexFilter')) else 0
            if fix:
                sanitized = sanitize_rule(rule)
                if sanitized is None:
                    dropped += 1
                else:
                    kept.append(sanitized)

        if fix:
            for position, rule in enumerate(kept, start=1):
                rule['id'] = position
            with open(path, 'w', encoding='utf-8', newline='\n') as handle:
                json.dump(kept, handle, separators=(',', ':'))
                handle.write('\n')
            fixed_report[filename] = (len(rules), len(kept), dropped)
            rules = kept

        total_rules += len(rules)
        if errors and not fix:
            all_errors[filename] = errors
        if warnings and not fix:
            all_warnings[filename] = warnings

    # manifest consistency
    manifest_rulesets = []
    enabled_rulesets = 0
    unused = []
    try:
        manifest = load_json(MANIFEST_PATH)
        resources = manifest.get('declarative_net_request', {}).get('rule_resources', [])
        manifest_rulesets = [os.path.basename(entry.get('path', '')) for entry in resources]
        enabled_rulesets = sum(1 for entry in resources if entry.get('enabled'))
        if len(resources) > MAX_STATIC_RULESETS:
            all_errors.setdefault('manifest.json', []).append(
                'too many rule_resources: %d (limit %d)' % (len(resources), MAX_STATIC_RULESETS))
        if enabled_rulesets > MAX_ENABLED_STATIC_RULESETS:
            all_errors.setdefault('manifest.json', []).append(
                'too many enabled rulesets: %d (limit %d)' % (enabled_rulesets, MAX_ENABLED_STATIC_RULESETS))
        missing = [name for name in manifest_rulesets if name not in files]
        if missing:
            all_errors.setdefault('manifest.json', []).append('rule files missing on disk: %s' % ', '.join(missing))
        unused = [name for name in files if name not in manifest_rulesets]
    except Exception as exc:  # noqa: BLE001
        all_errors.setdefault('manifest.json', []).append('failed to read manifest: %s' % exc)

    if total_rules > MAX_STATIC_RULES:
        all_errors.setdefault('(global)', []).append(
            'static rules exceed limit: %d > %d' % (total_rules, MAX_STATIC_RULES))
    if total_regex > MAX_REGEX_RULES:
        all_errors.setdefault('(global)', []).append(
            'regex rules exceed limit: %d > %d' % (total_regex, MAX_REGEX_RULES))

    if not quiet:
        print('rulesets on disk : %d' % len(files))
        print('rules in manifest: %d (%d enabled)' % (len(manifest_rulesets), enabled_rulesets))
        print('total rules      : %d' % total_rules)
        print('regex rules      : %d' % total_regex)
        if unused:
            print('not in manifest  : %s' % ', '.join(unused))
        if fix:
            print('\n--- fixed files (before -> after, dropped) ---')
            for filename, (before, after, dropped) in fixed_report.items():
                print('%-30s %6d -> %-6d (-%d)' % (filename, before, after, dropped))

    print('\n=== validation ===')
    if all_errors:
        for filename, errors in all_errors.items():
            print('-- %s: %d error(s)' % (filename, len(errors)))
            for error in errors[:10]:
                print('   %s' % error)
            if len(errors) > 10:
                print('   ... %d more' % (len(errors) - 10))
        print('\nFAILED: %d file(s) with errors' % len(all_errors))
        return 1

    if all_warnings and not quiet:
        print('warnings: %d rule(s) use deprecated keys (run --fix to migrate)' %
              sum(len(v) for v in all_warnings.values()))
    print('OK: all rulesets are valid DNR rules')
    return 0


def main():
    parser = argparse.ArgumentParser(description='Validate AeroGuard DNR rulesets')
    parser.add_argument('--fix', action='store_true', help='rewrite rulesets, removing invalid rules')
    parser.add_argument('--quiet', action='store_true', help='print errors only')
    args = parser.parse_args()
    return validate(fix=args.fix, quiet=args.quiet)


if __name__ == '__main__':
    sys.exit(main())

