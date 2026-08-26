/**
 * Build-time Rule Precompiler
 * Pre-compiles and optimizes DNR rules at build time
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const RULES_DIR = join(PROJECT_ROOT, 'rules');
const OUTPUT_DIR = join(PROJECT_ROOT, 'dist', 'rules');

const MAX_DYNAMIC_RULES = 5000;
const MAX_STATIC_RULES = 200000;
const RULE_BATCH_SIZE = 4000;

class RulePrecompiler {
  constructor() {
    this.rules = [];
    this.stats = { total: 0, optimized: 0, duplicates: 0, subsumed: 0 };
  }

  /**
   * Compile all rules from source directory
   */
  async compile() {
    console.log('🔨 Precompiling DNR rules...');

    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Load all rule files
    const ruleFiles = this._loadRuleFiles(RULES_DIR);
    console.log(`📂 Found ${ruleFiles.length} rule files`);

    // Parse and combine all rules
    for (const { name, content } of ruleFiles) {
      this._parseRules(name, content);
    }

    console.log(`📝 Parsed ${this.stats.total} raw rules`);

    // Optimize
    this._optimize();

    console.log(`⚡ Optimized to ${this.stats.optimized} rules (duplicates: ${this.stats.duplicates}, subsumed: ${this.stats.subsumed})`);

    // Partition into static and dynamic
    const { staticRules, dynamicRules } = this._partitionRules();

    // Write output files
    await this._writeRules(staticRules, dynamicRules);

    // Generate manifest
    this._writeManifest();

    console.log(`\n✅ Precompiled ${this.stats.optimized} rules`);
    console.log(`   Static: ${staticRules.length}`);
    console.log(`   Dynamic: ${dynamicRules.length}`);
    console.log(`📁 Output: ${OUTPUT_DIR}`);
  }

  _loadRuleFiles(dir) {
    const files = [];
    function walk(currentDir) {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.json') || entry.name.endsWith('.txt')) {
          const content = readFileSync(fullPath, 'utf-8');
          files.push({ name: entry.name, path: fullPath, content });
        }
      }
    }
    walk(dir);
    return files;
  }

  _parseRules(sourceName, content) {
    // Try JSON first (pre-compiled DNR rules)
    if (sourceName.endsWith('.json')) {
      try {
        const rules = JSON.parse(content);
        if (Array.isArray(rules)) {
          for (const rule of rules) {
            if (this._isValidDNRRule(rule)) {
              this.rules.push({ ...rule, _source: sourceName });
              this.stats.total++;
            }
          }
          return;
        }
      } catch (e) {
        // Not valid JSON, fall through to ABP parsing
      }
    }

    // Parse ABP format
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('!') || line.startsWith('[')) continue;

      const rule = this._parseABPLine(line, sourceName, i + 1);
      if (rule) {
        this.rules.push(rule);
        this.stats.total++;
      }
    }
  }

  _parseABPLine(line, sourceName, lineNum) {
    const isException = line.startsWith('@@');
    if (isException) line = line.substring(2);

    // Parse $options
    const options = { domains: [], thirdParty: null, resourceTypes: [], important: false };
    const optionMatch = line.match(/\$(.+)$/);
    if (optionMatch) {
      const opts = optionMatch[1].split(',');
      for (const opt of opts) {
        const [key, value] = opt.split('=').map(s => s.trim());
        if (key === 'domain') {
          if (value) {
            const domains = value.split('|');
            options.domains = domains.filter(d => !d.startsWith('~')).map(d => d.toLowerCase());
          }
        } else if (key === 'third-party') options.thirdParty = true;
        else if (key === '~third-party') options.thirdParty = false;
        else if (key === 'important') options.important = true;
        else if (RESOURCE_TYPE_MAP[key]) options.resourceTypes.push(RESOURCE_TYPE_MAP[key]);
      }

    const cleanLine = line.replace(/\$.*$/, '');

    // Domain filter: ||example.com^
    const domainMatch = cleanLine.match(/^\|\|([^/\^]+)(\^|$)/);
    if (domainMatch) {
      return this._createDNRRule({
        type: 'domain',
        domain: domainMatch[1].toLowerCase(),
        options,
        isException,
        source: sourceName,
        line: lineNum
      });
    }

    // URL pattern
    const urlMatch = cleanLine.match(/^[\|]?([^\|]+)[\|]?$/);
    if (urlMatch && (urlMatch[1].includes('/') || urlMatch[1].includes('*') || urlMatch[1].includes('?'))) {
      return this._createDNRRule({
        type: 'url',
        pattern: urlMatch[1],
        options,
        isException,
        source: sourceName,
        line: lineNum
      });
    }

    // Regex filter: /pattern/
    const regexMatch = cleanLine.match(/^\/(.+)\/([a-z]*)$/);
    if (regexMatch) {
      return this._createDNRRule({
        type: 'regex',
        pattern: regexMatch[1],
        flags: regexMatch[2],
        options,
        isException,
        source: sourceName,
        line: lineNum
      });
    }

    // Element hiding (skip for DNR)
    if (cleanLine.startsWith('##') || cleanLine.startsWith('#?#') || cleanLine.startsWith('#%#')) {
      return null;
    }

    return null;
  }

  _createDNRRule(parsed) {
    const baseRule = {
      id: 0, // Will be assigned later
      priority: parsed.isException ? 2 : 1,
      action: parsed.isException ? { type: 'allow' } : { type: 'block' },
      condition: {}
    };

    const opts = parsed.options || {};

    switch (parsed.type) {
      case 'domain':
        baseRule.condition.urlFilter = `||${parsed.domain}^`;
        if (opts.domains?.length) baseRule.condition.initiatorDomains = opts.domains;
        break;
      case 'url':
        baseRule.condition.urlFilter = parsed.pattern;
        if (opts.domains?.length) baseRule.condition.initiatorDomains = opts.domains;
        break;
      case 'regex':
        baseRule.condition.regexFilter = parsed.pattern;
        baseRule.condition.isUrlFilterCaseSensitive = !parsed.flags?.includes('i');
        if (opts.domains?.length) baseRule.condition.initiatorDomains = opts.domains;
        break;
    }

    if (opts.resourceTypes?.length) {
      baseRule.condition.resourceTypes = opts.resourceTypes.filter(t => VALID_DNR_RESOURCE_TYPES.includes(t));
    } else {
      baseRule.condition.resourceTypes = VALID_DNR_RESOURCE_TYPES.filter(t => t !== 'main_frame');
    }

    if (opts.thirdParty !== null) {
      baseRule.condition.domainType = opts.thirdParty ? 'thirdParty' : 'firstParty';
    }

    if (opts.important) baseRule.priority = 3;

    return baseRule;
  }

  _isValidDNRRule(rule) {
    return rule &&
      typeof rule === 'object' &&
      rule.id !== undefined &&
      rule.action?.type &&
      rule.condition &&
      (rule.condition.urlFilter || rule.condition.regexFilter) &&
      rule.condition.resourceTypes?.length > 0;
  }

  _optimize() {
    console.log('🔧 Optimizing rules...');

    // 1. Remove exact duplicates
    this._removeExactDuplicates();

    // 2. Remove subsumed rules
    this._removeSubsumedRules();

    // 3. Sort by priority and specificity
    this._sortRules();

    // 4. Reassign sequential IDs
    this._reassignIds();

    this.stats.optimized = this.rules.length;
  }

  _removeExactDuplicates() {
    const seen = new Map();
    const unique = [];

    for (const rule of this.rules) {
      const key = this._getRuleKey(rule);
      if (!seen.has(key)) {
        seen.set(key, rule);
        unique.push(rule);
      } else {
        // Keep higher priority
        const existing = seen.get(key);
        if (rule.priority > existing.priority) {
          seen.set(key, rule);
          const idx = unique.findIndex(r => r === existing);
          if (idx !== -1) unique[idx] = rule;
        }
        this.stats.duplicates++;
      }
    }

    this.rules = unique;
  }

  _getRuleKey(rule) {
    const c = rule.condition || {};
    return JSON.stringify({
      action: rule.action,
      urlFilter: c.urlFilter,
      regexFilter: c.regexFilter,
      resourceTypes: c.resourceTypes?.sort().join(','),
      initiatorDomains: c.initiatorDomains?.sort().join(','),
      excludedInitiatorDomains: c.excludedInitiatorDomains?.sort().join(',')
    });
  }

  _removeSubsumedRules() {
    const nonSubsumed = [];

    for (let i = 0; i < this.rules.length; i++) {
      const ruleA = this.rules[i];
      let subsumed = false;

      for (let j = 0; j < this.rules.length; j++) {
        if (i === j) continue;
        if (this._covers(this.rules[j], ruleA)) {
          subsumed = true;
          this.stats.subsumed++;
          break;
        }
      }

      if (!subsumed) nonSubsumed.push(ruleA);
    }

    this.rules = nonSubsumed;
  }

  _covers(ruleA, ruleB) {
    const a = ruleA.condition || {}, b = ruleB.condition || {};
    if (JSON.stringify(ruleA.action) !== JSON.stringify(ruleB.action)) return false;

    if (a.urlFilter && b.urlFilter) {
      if (!this._urlFilterCovers(a.urlFilter, b.urlFilter)) return false;
    } else if (b.urlFilter && !a.urlFilter) return false;

    if (a.resourceTypes && b.resourceTypes) {
      const aSet = new Set(a.resourceTypes), bSet = new Set(b.resourceTypes);
      if (!this._setCovers(aSet, bSet)) return false;
    } else if (b.resourceTypes && !a.resourceTypes) return false;

    if (a.initiatorDomains && b.initiatorDomains) {
      const aSet = new Set(a.initiatorDomains), bSet = new Set(b.initiatorDomains);
      if (!this._setCovers(aSet, bSet)) return false;
    } else if (b.initiatorDomains && !a.initiatorDomains) return false;

    if ((ruleA.priority || 1) > (ruleB.priority || 1)) return false;

    return true;
  }

  _urlFilterCovers(a, b) {
    if (a.endsWith('^') && b.startsWith(a.slice(0, -1))) return true;
    if (a.endsWith('*') && b.startsWith(a.slice(0, -1))) return true;
    return a === b;
  }

  _setCovers(a, b) {
    if (a.size === 0) return true;
    if (b.size === 0) return false;
    for (const item of b) if (!a.has(item)) return false;
    return true;
  }

  _sortRules() {
    this.rules.sort((a, b) => {
      const pa = a.priority || 1, pb = b.priority || 1;
      if (pa !== pb) return pb - pa;

      const aa = a.action?.type, ba = b.action?.type;
      if (aa === 'allow' && ba === 'block') return -1;
      if (aa === 'block' && ba === 'allow') return 1;

      return this._specificity(b) - this._specificity(a);
    });
  }

  _specificity(rule) {
    const c = rule.condition || {};
    let s = 0;
    if (c.urlFilter) s += 10;
    if (c.regexFilter) s += 15;
    if (c.initiatorDomains?.length) s += c.initiatorDomains.length * 2;
    if (c.resourceTypes?.length) s += c.resourceTypes.length;
    return s;
  }

  _reassignIds() {
    this.rules = this.rules.map((r, i) => ({ ...r, id: i + 1 }));
  }

  _partitionRules() {
    const staticRules = [];
    const dynamicRules = [];

    // Static rules: high-priority, well-known patterns
    // Dynamic rules: custom, user rules, lower priority

    const staticPatterns = [
      '||doubleclick.net',
      '||googlesyndication.com',
      '||googleadservices.com',
      '||googletagmanager.com',
      '||googletagservices.com',
      '||pagead2.googlesyndication.com',
      '||pubads.g.doubleclick.net',
      '||securepubads.g.doubleclick.net',
      '||adservice.google.com',
      '||imasdk.googleapis.com',
      '||imasdk.s3.amazonaws.com',
      '||googleads.g.doubleclick.net',
      '||youtube.com/api/stats/ads',
      '||youtube.com/ptracking',
      '||youtube.com/pagead/'
    ];

    for (const rule of this.rules) {
      const isStatic = rule.condition.urlFilter &&
        staticPatterns.some(p => rule.condition.urlFilter.startsWith(p));

      if (isStatic && staticRules.length < MAX_STATIC_RULES) {
        staticRules.push(rule);
      } else if (dynamicRules.length < MAX_DYNAMIC_RULES) {
        dynamicRules.push(rule);
      }
    }

    return { staticRules, dynamicRules };
  }

  async _writeRules(staticRules, dynamicRules) {
    // Write static rulesets (one file per category)
    const staticByCategory = this._groupByCategory(staticRules);
    for (const [category, rules] of Object.entries(staticByCategory)) {
      const outputPath = join(OUTPUT_DIR, `static_${category}.json`);
      writeFileSync(outputPath, JSON.stringify(rules));
      console.log(`  📄 static_${category}.json: ${rules.length} rules`);
    }

    // Write dynamic rules in batches
    const batches = this._chunkArray(dynamicRules, RULE_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      const outputPath = join(OUTPUT_DIR, `dynamic_${i + 1}.json`);
      writeFileSync(outputPath, JSON.stringify(batches[i]));
      console.log(`  📄 dynamic_${i + 1}.json: ${batches[i].length} rules`);
    }
  }

  _groupByCategory(rules) {
    const groups = {};
    for (const rule of rules) {
      const category = rule._source?.replace('.json', '').replace('.txt', '') || 'misc';
      if (!groups[category]) groups[category] = [];
      groups[category].push(rule);
    }
    return groups;
  }

  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }

  _writeManifest() {
    const manifest = {
      version: 1,
      compiledAt: new Date().toISOString(),
      stats: this.stats,
      staticRulesets: this._getStaticRulesetInfo(),
      dynamicRulesets: this._getDynamicRulesetInfo(),
      limits: { maxStatic: MAX_STATIC_RULES, maxDynamic: MAX_DYNAMIC_RULES }
    };
    writeFileSync(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }

  _getStaticRulesetInfo() {
    // Would return info about static rulesets
    return [];
  }

  _getDynamicRulesetInfo() {
    return [];
  }
}

// Resource type mapping
const RESOURCE_TYPE_MAP = {
  script: 'script', image: 'image', stylesheet: 'stylesheet',
  object: 'object', xmlhttprequest: 'xmlhttprequest',
  'object-subrequest': 'object', subdocument: 'sub_frame',
  document: 'main_frame', elemhide: 'other', other: 'other',
  font: 'font', media: 'media', websocket: 'websocket',
  ping: 'ping', csp: 'csp_report', cookie: 'cookie'
};

const VALID_DNR_RESOURCE_TYPES = Object.values(RESOURCE_TYPE_MAP).filter((v, i, a) => a.indexOf(v) === i);

// Run compilation
const compiler = new RulePrecompiler();
compiler.compile().catch(console.error);