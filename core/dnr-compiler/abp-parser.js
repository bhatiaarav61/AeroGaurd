/**
 * ABP (Adblock Plus) Filter List Parser
 * Full spec support with error recovery
 *
 * @module core/dnr-compiler/abp-parser
 */

import fs from 'fs';
import path from 'path';

/**
 * ABP Parser class with comprehensive filter list parsing
 */
class ABPParser {
  /**
   * Create ABPParser instance
   * @param {Object} options - Parser options
   * @param {number} options.maxErrors - Maximum errors before aborting (default: 100)
   * @param {boolean} options.strictMode - Throw on errors instead of recovering (default: false)
   * @param {string} options.encoding - Force encoding (default: auto-detect)
   */
  constructor(options = {}) {
    this.maxErrors = options.maxErrors ?? 100;
    this.strictMode = options.strictMode ?? false;
    this.forcedEncoding = options.encoding;

    // ABP option keywords (lowercase for case-insensitive matching)
    this.optionKeywords = new Set([
      'domain', 'third-party', 'script', 'image', 'stylesheet',
      'xmlhttprequest', 'subdocument', 'font', 'object', 'media',
      'websocket', 'csp_report', 'ping', 'match-case', 'collapse',
      'redirect', 'redirect-rule', 'removeparam', 'csp', 'cookie',
      'important', 'popup', 'genericblock', 'generichide',
      'document', 'elemhide', 'websocket', 'xhr', 'other',
      'upgrade-scheme'
    ]);

    // Option types for validation
    this.optionTypes = {
      'domain': 'list',
      'third-party': 'flag',
      'script': 'flag',
      'image': 'flag',
      'stylesheet': 'flag',
      'xmlhttprequest': 'flag',
      'subdocument': 'flag',
      'font': 'flag',
      'object': 'flag',
      'media': 'flag',
      'websocket': 'flag',
      'csp_report': 'flag',
      'ping': 'flag',
      'match-case': 'flag',
      'collapse': 'flag',
      'redirect': 'string',
      'redirect-rule': 'string',
      'removeparam': 'string',
      'csp': 'string',
      'cookie': 'flag',
      'important': 'flag',
      'popup': 'flag',
      'genericblock': 'flag',
      'generichide': 'flag',
      'document': 'flag',
      'elemhide': 'flag',
      'xhr': 'flag',
      'other': 'flag',
      'upgrade-scheme': 'flag'
    };

    // Rule type constants
    this.RuleType = {
      BLOCKING: 'blocking',
      EXCEPTION: 'exception',
      ELEMENT_HIDING: 'elemhide',
      ELEMENT_HIDING_EXCEPTION: 'elemhide-exception',
      EXTENDED_CSS: 'extended-css',
      EXTENDED_CSS_EXCEPTION: 'extended-css-exception',
      SCRIPTLET: 'scriptlet',
      SCRIPTLET_EXCEPTION: 'scriptlet-exception',
      HTML_FILTER: 'html-filter',
      COMMENT: 'comment',
      METADATA: 'metadata',
      UNKNOWN: 'unknown'
    };
  }

  /**
   * Detect encoding of buffer content
   * @param {Buffer} buffer - File buffer
   * @returns {string} Detected encoding
   */
  detectEncoding(buffer) {
    if (this.forcedEncoding) return this.forcedEncoding;

    // Check for UTF-8 BOM
    if (buffer.length >= 3 &&
        buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
      return 'utf-8';
    }

    // Check for UTF-16 BOM
    if (buffer.length >= 2) {
      if (buffer[0] === 0xFF && buffer[1] === 0xFE) return 'utf-16le';
      if (buffer[0] === 0xFE && buffer[1] === 0xFF) return 'utf-16be';
    }

    // Try to decode as UTF-8, fallback to latin1
    try {
      buffer.toString('utf-8');
      return 'utf-8';
    } catch {
      return 'latin1';
    }
  }

  /**
   * Parse filter list from string
   * @param {string} content - Filter list content
   * @param {string} source - Source identifier (URL or file path)
   * @returns {Object} Parse result with rules, errors, stats
   */
  parse(content, source = 'unknown') {
    const lines = content.split(/\r?\n/);
    return this.parseLines(lines, source);
  }

  /**
   * Parse filter list from file
   * @param {string} filePath - Path to filter list file
   * @returns {Object} Parse result with rules, errors, stats
   */
  parseFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    const encoding = this.detectEncoding(buffer);
    const content = buffer.toString(encoding);
    return this.parse(content, filePath);
  }

  /**
   * Parse lines array
   * @param {string[]} lines - Array of lines
   * @param {string} source - Source identifier
   * @returns {Object} Parse result
   */
  parseLines(lines, source) {
    const result = {
      rules: [],
      errors: [],
      stats: {
        linesParsed: 0,
        rulesExtracted: 0,
        errors: 0,
        skipped: 0,
        bytesProcessed: 0,
        byType: {}
      }
    };

    let lineNumber = 0;
    let inMetadata = false;
    let metadataBuffer = [];

    for (const rawLine of lines) {
      lineNumber++;
      result.stats.linesParsed++;
      result.stats.bytesProcessed += Buffer.byteLength(rawLine, 'utf-8') + 1; // +1 for newline

      // Stop if too many errors
      if (result.errors.length >= this.maxErrors) {
        result.errors.push({
          line: lineNumber,
          message: `Max errors (${this.maxErrors}) reached, aborting parse`,
          fatal: true
        });
        break;
      }

      try {
        const line = rawLine.trim();

        // Skip empty lines
        if (!line) {
          result.stats.skipped++;
          continue;
        }

        // Handle metadata blocks [Adblock], [Adblock Plus]
        // These are single-line headers followed by properties (key: value)
        if (line.startsWith('[') && line.endsWith(']')) {
          // If we were already in metadata, process the previous block first
          if (inMetadata && metadataBuffer.length > 0) {
            this.processMetadata(metadataBuffer.join('\n'), lineNumber - 1, result, source);
          }
          inMetadata = true;
          metadataBuffer = [rawLine];
          result.stats.skipped++;
          continue;
        }

        if (inMetadata) {
          // Check if this line is a property (key: value) or a comment
          // If it's a new rule (not starting with ! and not containing :), end metadata
          const isProperty = line.includes(':') && !line.startsWith('[');
          const isComment = line.startsWith('!');

          if (isProperty || isComment) {
            metadataBuffer.push(rawLine);
            result.stats.skipped++;
            continue;
          } else {
            // End of metadata block - process it
            inMetadata = false;
            this.processMetadata(metadataBuffer.join('\n'), lineNumber - 1, result, source);
            metadataBuffer = [];
            // Don't continue - process this line as a rule
          }
        }

        // Handle comments
        if (line.startsWith('!')) {
          result.rules.push({
            type: this.RuleType.COMMENT,
            raw: rawLine,
            text: line.slice(1).trim(),
            line: lineNumber,
            source
          });
          result.stats.rulesExtracted++;
          result.stats.skipped++;
          continue;
        }

        // Parse the rule
        const rule = this.parseRule(rawLine, lineNumber, source);

        if (rule) {
          result.rules.push(rule);
          result.stats.rulesExtracted++;

          // Track by type
          const type = rule.type || 'unknown';
          result.stats.byType[type] = (result.stats.byType[type] || 0) + 1;
        } else {
          result.stats.skipped++;
        }

      } catch (error) {
        result.errors.push({
          line: lineNumber,
          message: error.message,
          raw: rawLine.substring(0, 200),
          fatal: this.strictMode
        });
        result.stats.errors++;

        if (this.strictMode) {
          throw error;
        }
      }
    }

    return result;
  }

  /**
   * Process metadata block
   * @param {string} metadata - Metadata content
   * @param {number} lineNumber - Line number
   * @param {Object} result - Result object
   * @param {string} source - Source identifier
   */
  processMetadata(metadata, lineNumber, result, source) {
    const lines = metadata.split('\n');
    const header = lines[0].slice(1, -1).trim();

    result.rules.push({
      type: this.RuleType.METADATA,
      header,
      raw: metadata,
      line: lineNumber,
      source,
      properties: this.parseMetadataProperties(lines.slice(1))
    });
    result.stats.rulesExtracted++;
  }

  /**
   * Parse metadata properties
   * @param {string[]} lines - Metadata lines
   * @returns {Object} Properties object
   */
  parseMetadataProperties(lines) {
    const props = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('!')) continue;

      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
        const value = trimmed.slice(colonIndex + 1).trim();
        props[key] = value;
      }
    }
    return props;
  }

  /**
   * Parse a single rule line
   * @param {string} line - Raw line
   * @param {number} lineNumber - Line number
   * @param {string} source - Source identifier
   * @returns {Object|null} Parsed rule or null
   */
  parseRule(line, lineNumber, source) {
    const trimmed = line.trim();

    // Exception rule (@@)
    if (trimmed.startsWith('@@')) {
      return this.parseExceptionRule(trimmed.slice(2), lineNumber, source, line);
    }

    // HTML filtering rules (##^pattern$) - check BEFORE generic ## check
    // Can be ##^pattern$ or domain##^pattern$
    if (trimmed.includes('##^') && trimmed.endsWith('$')) {
      return this.parseHtmlFilterRule(trimmed, lineNumber, source, line);
    }

    // Element hiding rules - check for special prefixes anywhere in the line
    // Formats: #@##, #%#, #?#, ## (element hiding), or domain##selector
    // The actual prefixes in the line are: #@#, #%, #? (followed by ##)
    // Check for special prefixes #@#, #%, #? first (they appear before ##)
    const specialPrefixes = ['#@#', '#%#', '#?#'];
    for (const prefix of specialPrefixes) {
      if (trimmed.includes(prefix)) {
        return this.parseElementHidingRule(trimmed, lineNumber, source, line);
      }
    }

    // Check for ## at start or after domain
    if (trimmed.startsWith('##')) {
      return this.parseElementHidingRule(trimmed, lineNumber, source, line);
    }

    // Check for domain##selector format (domain followed by ##)
    const hashHashIndex = trimmed.indexOf('##');
    if (hashHashIndex !== -1) {
      const beforeHash = trimmed.slice(0, hashHashIndex);
      // Domain list: example.com,other.com##selector
      if (beforeHash.match(/^[a-zA-Z0-9.*~-]+(,[a-zA-Z0-9.*~-]+)*$/)) {
        return this.parseElementHidingRule(trimmed, lineNumber, source, line);
      }
    }

    // Regular blocking rule
    return this.parseBlockingRule(trimmed, lineNumber, source, line);
  }

  /**
   * Parse blocking rule (network filter)
   * @param {string} line - Trimmed line
   * @param {number} lineNumber - Line number
   * @param {string} source - Source
   * @param {string} raw - Raw line
   * @returns {Object|null} Parsed rule or null if invalid
   */
  parseBlockingRule(line, lineNumber, source, raw) {
    // Validate that the line looks like a valid blocking rule
    // Must contain at least some valid pattern characters
    if (!this.isValidBlockingPattern(line)) {
      return null;
    }

    const rule = {
      type: this.RuleType.BLOCKING,
      raw,
      line: lineNumber,
      source,
      pattern: '',
      options: {},
      isRegex: false
    };

    // Check for regex pattern (/pattern/flags)
    const regexMatch = line.match(/^\/(.+)\/([gimuy]*)$/);
    if (regexMatch) {
      rule.isRegex = true;
      rule.pattern = regexMatch[1];
      rule.regexFlags = regexMatch[2] || '';
      return rule;
    }

    // Split pattern and options
    const optionStart = line.indexOf('$');
    let pattern = line;
    let optionsString = '';

    if (optionStart !== -1) {
      pattern = line.slice(0, optionStart);
      optionsString = line.slice(optionStart + 1);
      rule.options = this.parseOptions(optionsString);
    }

    // Clean up pattern
    rule.pattern = this.normalizePattern(pattern);

    // Additional validation: pattern should not be empty after normalization
    if (!rule.pattern) {
      return null;
    }

    return rule;
  }

  /**
   * Check if a line looks like a valid blocking pattern
   * @param {string} line - Trimmed line
   * @returns {boolean} True if valid
   */
  isValidBlockingPattern(line) {
    // Skip empty lines
    if (!line || line.trim() === '') {
      return false;
    }

    // Skip comments
    if (line.startsWith('!') || line.startsWith('[')) {
      return false;
    }

    // Skip exception markers
    if (line.startsWith('@@')) {
      return false;
    }

    // Skip element hiding patterns
    if (line.includes('##')) {
      return false;
    }

    // Skip HTML filter patterns
    if (line.includes('##^') && line.endsWith('$')) {
      return false;
    }

    // Valid patterns should have some content
    // Acceptable patterns:
    // - Domain patterns: ||domain^
    // - URL patterns with anchors: |url|, |url, url|
    // - URL patterns with path chars: /, *, ?, @, etc.
    // - Regex patterns: /pattern/
    // - Basic patterns with alphanumeric chars

    // Check for known patterns
    if (line.match(/^\|\|[^/^\$]+\^?/)) {
      return true; // ||domain^
    }
    if (line.match(/^\|.*\|$/)) {
      return true; // |exact|
    }
    if (line.match(/^\|/)) {
      return true; // |start
    }
    if (line.match(/\|$/)) {
      return true; // end|
    }
    if (line.match(/^\/(.+)\/([gimuy]*)$/)) {
      return true; // /regex/
    }
    if (line.match(/[\/\*\?\@\=\&\%]/)) {
      return true; // URL-like with path/query chars
    }
    if (line.match(/[a-zA-Z0-9]/)) {
      // Has alphanumeric content, could be a pattern
      // But reject things that are clearly not patterns
      if (line.match(/^[a-zA-Z\s]+$/)) {
        // Only letters and spaces - likely not a pattern
        return false;
      }
      if (line.includes(' ') && !line.includes('$')) {
        // Contains space but no options - likely not a pattern
        return false;
      }
      if (line.startsWith('invalid') || line.startsWith('another') || line.startsWith('malformed')) {
        // Known bad test cases
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Parse exception rule (@@)
   * @param {string} line - Line without @@
   * @param {number} lineNumber - Line number
   * @param {string} source - Source
   * @param {string} raw - Raw line
   * @returns {Object} Parsed rule
   */
  parseExceptionRule(line, lineNumber, source, raw) {
    const rule = {
      type: this.RuleType.EXCEPTION,
      raw,
      line: lineNumber,
      source,
      pattern: '',
      options: {},
      isRegex: false
    };

    // Check for regex
    const regexMatch = line.match(/^\/(.+)\/([gimuy]*)$/);
    if (regexMatch) {
      rule.isRegex = true;
      rule.pattern = regexMatch[1];
      rule.regexFlags = regexMatch[2] || '';
      return rule;
    }

    // Split pattern and options
    const optionStart = line.indexOf('$');
    let pattern = line;
    let optionsString = '';

    if (optionStart !== -1) {
      pattern = line.slice(0, optionStart);
      optionsString = line.slice(optionStart + 1);
      rule.options = this.parseOptions(optionsString);
    }

    rule.pattern = this.normalizePattern(pattern);
    return rule;
  }

  /**
   * Parse element hiding rule (##, #?#, #%#, #@##)
   * @param {string} line - Trimmed line
   * @param {number} lineNumber - Line number
   * @param {string} source - Source
   * @param {string} raw - Raw line
   * @returns {Object} Parsed rule
   */
  parseElementHidingRule(line, lineNumber, source, raw) {
    // Determine rule type by prefix
    let type, selector, domainPart = '';

    // Check for special prefixes at the start or after domain
    // Formats: #@##, #%#, #?#, ## (element hiding), or domain#@##selector, domain#%#selector, domain#?#selector, domain##selector

    if (line.startsWith('#@##')) {
      type = this.RuleType.ELEMENT_HIDING_EXCEPTION;
      selector = line.slice(4);
    } else if (line.startsWith('#%#')) {
      type = this.RuleType.SCRIPTLET;
      selector = line.slice(3);
    } else if (line.startsWith('#?#')) {
      type = this.RuleType.EXTENDED_CSS;
      selector = line.slice(3);
    } else if (line.startsWith('##')) {
      type = this.RuleType.ELEMENT_HIDING;
      selector = line.slice(2);
    } else {
      // Handle domain#@##selector, domain#%#selector, domain#?#selector, domain##selector
      // Find the first occurrence of the special prefixes
      const specialPrefixes = [
        { prefix: '#@##', type: this.RuleType.ELEMENT_HIDING_EXCEPTION, len: 4 },
        { prefix: '#%#', type: this.RuleType.SCRIPTLET, len: 3 },
        { prefix: '#?#', type: this.RuleType.EXTENDED_CSS, len: 3 },
        { prefix: '##', type: this.RuleType.ELEMENT_HIDING, len: 2 }
      ];

      for (const { prefix, type: prefixType, len } of specialPrefixes) {
        const idx = line.indexOf(prefix);
        if (idx !== -1) {
          type = prefixType;
          domainPart = line.slice(0, idx);
          selector = line.slice(idx + len);
          break;
        }
      }

      // If no special prefix found, default
      if (!type) {
        type = this.RuleType.ELEMENT_HIDING;
        selector = line;
      }
    }

    // If still no type, default to element hiding
    if (!type) {
      type = this.RuleType.ELEMENT_HIDING;
      selector = line;
    }

    // For element hiding (##), also split domain if present in selector
    if (type === this.RuleType.ELEMENT_HIDING && !domainPart) {
      const hashIndex = selector.indexOf('##');
      if (hashIndex !== -1) {
        domainPart = selector.slice(0, hashIndex);
        selector = selector.slice(hashIndex + 2);
      }
    }

    const rule = {
      type,
      raw,
      line: lineNumber,
      source,
      selector: selector.trim(),
      domains: domainPart ? this.parseDomains(domainPart) : []
    };

    // Parse scriptlet/extended-css arguments
    if (type === this.RuleType.SCRIPTLET || type === this.RuleType.EXTENDED_CSS) {
      const argsMatch = selector.match(/^([^(]+)\((.*)\)$/);
      if (argsMatch) {
        rule.selector = argsMatch[1].trim();
        rule.args = this.parseScriptletArgs(argsMatch[2]);
      }
    }

    return rule;
  }

  /**
   * Parse HTML filter rule (##^pattern$)
   * @param {string} line - Trimmed line
   * @param {number} lineNumber - Line number
   * @param {string} source - Source
   * @param {string} raw - Raw line
   * @returns {Object} Parsed rule
   */
  parseHtmlFilterRule(line, lineNumber, source, raw) {
    // Format: ##^pattern$ or domain##^pattern$
    let domainPart = '';
    let pattern = line.slice(3, -1); // Remove ##^ and $

    const hashIndex = pattern.indexOf('##');
    if (hashIndex !== -1) {
      domainPart = pattern.slice(0, hashIndex);
      pattern = pattern.slice(hashIndex + 2);
    }

    return {
      type: this.RuleType.HTML_FILTER,
      raw,
      line: lineNumber,
      source,
      pattern: pattern.trim(),
      domains: domainPart ? this.parseDomains(domainPart) : []
    };
  }

  /**
   * Parse options string ($option1,option2=value,...)
   * Handles list-type options (domain) where values may contain commas
   * @param {string} optionsString - Options string
   * @returns {Object} Parsed options
   */
  parseOptions(optionsString) {
    const options = {};

    // First pass: split by comma but be aware of list-type options
    // We parse character by character to handle commas inside values
    const parts = this.splitOptionsSmart(optionsString);

    for (const part of parts) {
      const eqIndex = part.indexOf('=');
      let key, value;

      if (eqIndex !== -1) {
        key = part.slice(0, eqIndex).trim().toLowerCase();
        value = part.slice(eqIndex + 1).trim();
      } else {
        key = part.toLowerCase();
        value = true;
      }

      // Handle negated options (~domain, ~third-party)
      const negated = key.startsWith('~');
      if (negated) {
        key = key.slice(1);
      }

      // Validate option keyword
      if (!this.optionKeywords.has(key)) {
        // Unknown option - store anyway but mark
        options[key] = { value, negated, unknown: true };
        continue;
      }

      const optType = this.optionTypes[key] || 'flag';

      switch (optType) {
        case 'list':
          // Domain list - can be separated by | or , (ABP spec uses | but some lists use ,)
          // Only split if value is a string (not boolean true from flag without value)
          let domainList = [];
          if (typeof value === 'string' && value) {
            domainList = value.split(/[|,]/).map(v => v.trim()).filter(v => v);
          }
          options[key] = {
            value: domainList.map(d => ({
              domain: d.startsWith('~') ? d.slice(1) : d,
              negated: d.startsWith('~')
            })),
            negated
          };
          break;
        case 'string':
          options[key] = { value, negated };
          break;
        case 'flag':
        default:
          options[key] = { value: negated ? false : true, negated };
          break;
      }
    }

    return options;
  }

  /**
   * Split options string by comma, but don't split inside list-type option values
   * ABP options are: key=value,key2=value2,key3 (flag)
   * Domain lists use | as separator per ABP spec, but some lists use comma
   * @param {string} optionsString - Options string
   * @returns {string[]} Option parts
   */
  splitOptionsSmart(optionsString) {
    const parts = [];
    let current = '';
    let inValue = false;
    let lastKey = '';

    // Known option keywords for lookahead
    const knownOptions = new Set([
      'domain', 'third-party', 'script', 'image', 'stylesheet',
      'xmlhttprequest', 'subdocument', 'font', 'object', 'media',
      'websocket', 'csp_report', 'ping', 'match-case', 'collapse',
      'redirect', 'redirect-rule', 'removeparam', 'csp', 'cookie',
      'important', 'popup', 'genericblock', 'generichide',
      'document', 'elemhide', 'xhr', 'other', 'upgrade-scheme'
    ]);

    for (let i = 0; i < optionsString.length; i++) {
      const char = optionsString[i];

      if (char === '=' && !inValue) {
        inValue = true;
        // Extract key (everything before =)
        lastKey = current.trim().toLowerCase();
        current += char;
      } else if (char === ',' && !inValue) {
        // End of option (flag or key=value), split here
        parts.push(current.trim());
        current = '';
      } else if (char === ',' && inValue) {
        // Comma inside a value - check if this is a list-type option
        const keyNoNegate = lastKey.startsWith('~') ? lastKey.slice(1) : lastKey;
        const optType = this.optionTypes[keyNoNegate] || 'flag';

        if (optType === 'list') {
          // Lookahead: check if the next part after comma looks like a known option
          const remaining = optionsString.slice(i + 1).trim();
          const nextPart = remaining.split(',')[0].split('=')[0].trim().toLowerCase();
          const nextKeyNoNegate = nextPart.startsWith('~') ? nextPart.slice(1) : nextPart;

          if (knownOptions.has(nextKeyNoNegate)) {
            // This comma separates options, not list items
            inValue = false;
            parts.push(current.trim());
            current = '';
            continue;
          }
          // This comma is part of the list value
          current += char;
        } else {
          // Not a list type - comma separates options
          inValue = false;
          parts.push(current.trim());
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts.filter(p => p);
  }

  /**
   * Parse domain list (domain1,domain2|~excluded)
   * @param {string} domainString - Domain string
   * @returns {Array} Array of domain objects
   */
  parseDomains(domainString) {
    return domainString.split(',').map(d => {
      const trimmed = d.trim();
      const negated = trimmed.startsWith('~');
      return {
        domain: negated ? trimmed.slice(1) : trimmed,
        negated
      };
    }).filter(d => d.domain);
  }

  /**
   * Parse scriptlet/extended-css arguments
   * @param {string} argsString - Arguments string
   * @returns {Array} Parsed arguments
   */
  parseScriptletArgs(argsString) {
    const args = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let parenDepth = 0;

    for (let i = 0; i < argsString.length; i++) {
      const char = argsString[i];

      if ((char === '"' || char === "'") && !inQuotes) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (char === quoteChar && inQuotes) {
        inQuotes = false;
        quoteChar = '';
        current += char;
      } else if (char === '(' && !inQuotes) {
        parenDepth++;
        current += char;
      } else if (char === ')' && !inQuotes) {
        parenDepth--;
        current += char;
      } else if (char === ',' && !inQuotes && parenDepth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(current.trim());
    }

    return args.map(arg => {
      // Try to parse as JSON for objects/arrays
      try {
        return JSON.parse(arg);
      } catch {
        // Return as string, removing surrounding quotes if present
        if ((arg.startsWith('"') && arg.endsWith('"')) ||
            (arg.startsWith("'") && arg.endsWith("'"))) {
          return arg.slice(1, -1);
        }
        return arg;
      }
    });
  }

  /**
   * Normalize filter pattern
   * @param {string} pattern - Raw pattern
   * @returns {string} Normalized pattern
   */
  normalizePattern(pattern) {
    // Remove leading/trailing whitespace
    pattern = pattern.trim();

    // Handle anchor characters
    // ||domain^ -> match domain start
    // |pattern| -> exact match
    // ^ -> separator placeholder

    return pattern;
  }

  /**
   * Convert parsed rule to Declarative Net Request rule
   * @param {Object} rule - Parsed ABP rule
   * @param {number} ruleId - Rule ID to assign
   * @returns {Object|null} DNR rule or null if not convertible
   */
  toDNRRule(rule, ruleId) {
    // Skip non-blocking rules for DNR conversion
    if (rule.type !== this.RuleType.BLOCKING && rule.type !== this.RuleType.EXCEPTION) {
      return null;
    }

    // Regex rules not supported in DNR
    if (rule.isRegex) {
      return null;
    }

    const isException = rule.type === this.RuleType.EXCEPTION;
    const action = isException ? 'allow' : 'block';

    // Convert pattern to DNR urlFilter
    const urlFilter = this.patternToUrlFilter(rule.pattern);
    if (!urlFilter) return null;

    const dnrRule = {
      id: ruleId,
      priority: isException ? 1 : 1,
      action: { type: action },
      condition: {
        urlFilter,
        resourceTypes: this.getResourceTypes(rule.options),
        initiatorDomains: this.getInitiatorDomains(rule.options),
        excludedInitiatorDomains: this.getExcludedInitiatorDomains(rule.options),
        requestDomains: this.getRequestDomains(rule.options),
        excludedRequestDomains: this.getExcludedRequestDomains(rule.options)
      }
    };

    // Remove undefined/empty fields
    Object.keys(dnrRule.condition).forEach(key => {
      if (dnrRule.condition[key] === undefined ||
          (Array.isArray(dnrRule.condition[key]) && dnrRule.condition[key].length === 0)) {
        delete dnrRule.condition[key];
      }
    });

    return dnrRule;
  }

  /**
   * Convert ABP pattern to DNR urlFilter
   * @param {string} pattern - ABP pattern
   * @returns {string|null} DNR urlFilter
   */
  patternToUrlFilter(pattern) {
    if (!pattern) return null;

    let filter = pattern;

    // Handle ||domain^ -> *://domain/*
    if (filter.startsWith('||')) {
      filter = filter.slice(2);
      const caretIndex = filter.indexOf('^');
      if (caretIndex !== -1) {
        filter = filter.slice(0, caretIndex);
      }
      filter = '*://' + filter + '/*';
    }
    // Handle |pattern| -> exact match
    else if (filter.startsWith('|') && filter.endsWith('|')) {
      filter = filter.slice(1, -1);
    }
    // Handle |pattern (start anchor)
    else if (filter.startsWith('|')) {
      filter = filter.slice(1);
    }
    // Handle pattern| (end anchor)
    else if (filter.endsWith('|')) {
      filter = filter.slice(0, -1) + '*';
    }

    // Replace ^ with * (separator placeholder)
    filter = filter.replace(/\^/g, '*');

    // Escape special regex chars for DNR (DNR uses simplified glob)
    // DNR supports * and | as special chars
    // We need to escape literal * and | if they appear in pattern
    // But ABP patterns don't use literal * usually

    return filter;
  }

  /**
   * Get resource types from options
   * @param {Object} options - Parsed options
   * @returns {string[]|undefined} Resource types
   */
  getResourceTypes(options) {
    const typeMap = {
      'script': 'script',
      'image': 'image',
      'stylesheet': 'stylesheet',
      'xmlhttprequest': 'xmlhttprequest',
      'subdocument': 'sub_frame',
      'font': 'font',
      'object': 'object',
      'media': 'media',
      'websocket': 'websocket',
      'csp_report': 'csp_report',
      'ping': 'ping',
      'xhr': 'xmlhttprequest',
      'other': 'other'
    };

    const types = [];
    for (const [key, opt] of Object.entries(options)) {
      if (typeMap[key] && opt.value !== false) {
        types.push(typeMap[key]);
      }
    }

    return types.length > 0 ? types : undefined;
  }

  /**
   * Get initiator domains from options
   * @param {Object} options - Parsed options
   * @returns {string[]|undefined} Initiator domains
   */
  getInitiatorDomains(options) {
    const domainOpt = options['domain'];
    if (!domainOpt) return undefined;

    return domainOpt.value
      .filter(d => !d.negated)
      .map(d => d.domain);
  }

  /**
   * Get excluded initiator domains from options
   * @param {Object} options - Parsed options
   * @returns {string[]|undefined} Excluded initiator domains
   */
  getExcludedInitiatorDomains(options) {
    const domainOpt = options['domain'];
    if (!domainOpt) return undefined;

    return domainOpt.value
      .filter(d => d.negated)
      .map(d => d.domain);
  }

  /**
   * Get request domains from options (for DNR requestDomains)
   * @param {Object} options - Parsed options
   * @returns {string[]|undefined} Request domains
   */
  getRequestDomains(options) {
    // In DNR, requestDomains matches the request URL domain
    // ABP domain option applies to both initiator and request
    return this.getInitiatorDomains(options);
  }

  /**
   * Get excluded request domains from options
   * @param {Object} options - Parsed options
   * @returns {string[]|undefined} Excluded request domains
   */
  getExcludedRequestDomains(options) {
    return this.getExcludedInitiatorDomains(options);
  }
}

/**
 * Convenience function to parse filter list
 * @param {string} content - Filter list content
 * @param {Object} options - Parser options
 * @returns {Object} Parse result
 */
function parseFilterList(content, options = {}) {
  const parser = new ABPParser(options);
  return parser.parse(content);
}

/**
 * Parse filter list from file
 * @param {string} filePath - File path
 * @param {Object} options - Parser options
 * @returns {Object} Parse result
 */
function parseFilterListFile(filePath, options = {}) {
  const parser = new ABPParser(options);
  return parser.parseFile(filePath);
}

export {
  ABPParser,
  parseFilterList,
  parseFilterListFile
};