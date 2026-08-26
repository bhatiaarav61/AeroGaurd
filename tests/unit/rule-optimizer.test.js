/**
 * Test Suite for RuleOptimizer
 * Tests trie dedup, subsumption, priority sort, and other optimizations
 */

import assert from 'assert';
import { RuleOptimizer, optimizeRulesSync, optimizeRules } from '../../core/dnr-compiler/rule-optimizer.js';

console.log('=== RuleOptimizer Test Suite ===\n');

// Helper to create a basic DNR rule
function createRule(overrides = {}) {
  return {
    id: overrides.id || 1,
    priority: overrides.priority || 1,
    action: overrides.action || { type: 'block' },
    condition: {
      urlFilter: overrides.urlFilter || '||example.com^',
      resourceTypes: overrides.resourceTypes || ['script', 'image'],
      initiatorDomains: overrides.initiatorDomains || [],
      excludedInitiatorDomains: overrides.excludedInitiatorDomains || [],
      requestDomains: overrides.requestDomains || [],
      excludedRequestDomains: overrides.excludedRequestDomains || [],
      thirdParty: overrides.thirdParty,
      isUrlFilterCaseSensitive: overrides.isUrlFilterCaseSensitive || false,
      ...overrides.condition
    }
  };
}

// ==================== Test 1: Exact Deduplication ====================

function testExactDeduplication() {
  console.log('--- Test 1: Exact Deduplication ---');
  let passed = 0;
  let failed = 0;

  const optimizer = new RuleOptimizer();

  // Test 1a: Exact duplicate rules - keep highest priority
  try {
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, urlFilter: '||example.com^' }), // Higher priority
      createRule({ id: 3, priority: 3, urlFilter: '||example.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].priority, 5);
    assert.strictEqual(optimizer.getStats().exactDeduped, 2);
    console.log('✓ 1a: Keeps highest priority duplicate');
    passed++;
  } catch (e) {
    console.log('✗ 1a:', e.message);
    failed++;
  }

  // Test 1b: Different urlFilters are not duplicates
  try {
    const rules = [
      createRule({ id: 1, urlFilter: '||example.com^' }),
      createRule({ id: 2, urlFilter: '||example.org^' }),
      createRule({ id: 3, urlFilter: '||test.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 3);
    assert.strictEqual(optimizer.getStats().exactDeduped, 0);
    console.log('✓ 1b: Different urlFilters not deduplicated');
    passed++;
  } catch (e) {
    console.log('✗ 1b:', e.message);
    failed++;
  }

  // Test 1c: Different resourceTypes are not duplicates
  try {
    const rules = [
      createRule({ id: 1, resourceTypes: ['script'] }),
      createRule({ id: 2, resourceTypes: ['image'] }),
      createRule({ id: 3, resourceTypes: ['script', 'image'] })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 3);
    console.log('✓ 1c: Different resourceTypes not deduplicated');
    passed++;
  } catch (e) {
    console.log('✗ 1c:', e.message);
    failed++;
  }

  // Test 1d: Different domains are not duplicates
  try {
    const rules = [
      createRule({ id: 1, requestDomains: ['example.com'] }),
      createRule({ id: 2, requestDomains: ['example.org'] })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 2);
    console.log('✓ 1d: Different domains not deduplicated');
    passed++;
  } catch (e) {
    console.log('✗ 1d:', e.message);
    failed++;
  }

  // Test 1e: Different action types are not duplicates
  try {
    const rules = [
      createRule({ id: 1, action: { type: 'block' } }),
      createRule({ id: 2, action: { type: 'allow' } }),
      createRule({ id: 3, action: { type: 'redirect', redirect: { url: 'https://example.com' } } })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 3);
    console.log('✓ 1e: Different action types not deduplicated');
    passed++;
  } catch (e) {
    console.log('✗ 1e:', e.message);
    failed++;
  }

  console.log(`\nExact Deduplication: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 2: Semantic Deduplication ====================

function testSemanticDeduplication() {
  console.log('--- Test 2: Semantic Deduplication ---');
  let passed = 0;
  let failed = 0;

  // Test 2a: Same base filter with different $options in urlFilter
  try {
    const optimizer = new RuleOptimizer({ enableSemanticDedup: true });
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^$script,image' }),
      createRule({ id: 2, priority: 2, urlFilter: '||example.com^$image,script' }), // Same options, different order
      createRule({ id: 3, priority: 3, urlFilter: '||example.com^' }) // No options
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Should keep the most specific one (with resource types from options)
    // or the highest priority among equals
    assert(result.length <= 2); // At least one deduped
    console.log('✓ 2a: Normalizes $options order in urlFilter');
    passed++;
  } catch (e) {
    console.log('✗ 2a:', e.message);
    failed++;
  }

  // Test 2b: Resource types in condition vs urlFilter options
  try {
    const optimizer = new RuleOptimizer({ enableSemanticDedup: true });
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^$script', resourceTypes: ['image'] }),
      createRule({ id: 2, priority: 2, urlFilter: '||example.com^', resourceTypes: ['script', 'image'] })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // They should be semantically equivalent
    assert(result.length === 1);
    console.log('✓ 2b: Normalizes resource types from condition vs options');
    passed++;
  } catch (e) {
    console.log('✗ 2b:', e.message);
    failed++;
  }

  console.log(`\nSemantic Deduplication: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 3: Subsumption Elimination ====================

function testSubsumptionElimination() {
  console.log('--- Test 3: Subsumption Elimination ---');
  let passed = 0;
  let failed = 0;

  // Test 3a: Broader domain rule subsumes narrower
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 10, urlFilter: '||example.com^' }), // Broader
      createRule({ id: 2, priority: 5, urlFilter: '||example.com/path/ads.js' }), // Narrower
      createRule({ id: 3, priority: 3, urlFilter: '||sub.example.com^' }) // Subdomain - broader covers
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // ||example.com^ should subsume both ||example.com/path/ads.js and ||sub.example.com^
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].condition.urlFilter, '||example.com^');
    assert(optimizer.getStats().subsumed >= 2);
    console.log('✓ 3a: Broader domain subsumes narrower paths and subdomains');
    passed++;
  } catch (e) {
    console.log('✗ 3a:', e.message);
    failed++;
  }

  // Test 3b: Rule with fewer resource types subsumes more specific
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 10, resourceTypes: [] }), // All resource types
      createRule({ id: 2, priority: 5, resourceTypes: ['script'] }),
      createRule({ id: 3, priority: 3, resourceTypes: ['script', 'image'] })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 1);
    console.log('✓ 3b: Empty resourceTypes subsumes specific types');
    passed++;
  } catch (e) {
    console.log('✗ 3b:', e.message);
    failed++;
  }

  // Test 3c: Rule with no domains subsumes rule with domains
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 10, requestDomains: [] }), // All domains
      createRule({ id: 2, priority: 5, requestDomains: ['example.com'] })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 1);
    console.log('✓ 3c: No domain restriction subsumes specific domain');
    passed++;
  } catch (e) {
    console.log('✗ 3c:', e.message);
    failed++;
  }

  // Test 3d: Different action types don't subsume
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 10, action: { type: 'block' }, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, action: { type: 'allow' }, urlFilter: '||example.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 2); // Different actions don't subsume
    console.log('✓ 3d: Different action types do not subsume');
    passed++;
  } catch (e) {
    console.log('✗ 3d:', e.message);
    failed++;
  }

  // Test 3e: Lower priority rule doesn't subsume higher priority
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^' }), // Lower priority
      createRule({ id: 2, priority: 10, urlFilter: '||example.com/path^' }) // Higher priority
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 2); // Lower priority shouldn't subsume
    console.log('✓ 3e: Lower priority does not subsume higher priority');
    passed++;
  } catch (e) {
    console.log('✗ 3e:', e.message);
    failed++;
  }

  // Test 3f: Different regexFilters don't subsume (they're incomparable)
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    // Manually create rules without default urlFilter
    const rules = [
      { id: 1, priority: 10, action: { type: 'block' }, condition: { regexFilter: 'example.com.*', resourceTypes: ['script', 'image'] } },
      { id: 2, priority: 5, action: { type: 'block' }, condition: { regexFilter: 'example.com/ads', resourceTypes: ['script', 'image'] } }
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Different regex patterns - don't subsume for safety (incomparable)
    assert.strictEqual(result.length, 2);
    assert.strictEqual(optimizer.getStats().subsumed, 0);
    console.log('✓ 3f: Different regexFilters do not subsume');
    passed++;
  } catch (e) {
    console.log('✗ 3f:', e.message);
    failed++;
  }

  // Test 3g: Same regexFilter is deduplicated in exact dedup (not subsumption)
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: true });
    const rules = [
      createRule({ id: 1, priority: 10, regexFilter: 'example\\.com.*' }),
      createRule({ id: 2, priority: 5, regexFilter: 'example\\.com.*' }) // Same regex, lower priority
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Same regex - deduplicated in exact dedup (keeps highest priority)
    assert.strictEqual(result.length, 1);
    assert.strictEqual(optimizer.getStats().exactDeduped, 1);
    console.log('✓ 3g: Same regexFilter deduplicated in exact dedup');
    passed++;
  } catch (e) {
    console.log('✗ 3g:', e.message);
    failed++;
  }

  console.log(`\nSubsumption Elimination: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 4: Redundancy Removal ====================

function testRedundancyRemoval() {
  console.log('--- Test 4: Redundancy Removal ---');
  let passed = 0;
  let failed = 0;

  // Test 4a: Same domain, broader rule covers specific
  try {
    const optimizer = new RuleOptimizer({ enableRedundancyRemoval: true });
    const rules = [
      createRule({ id: 1, priority: 10, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, urlFilter: '||example.com/ads/' }),
      createRule({ id: 3, priority: 3, urlFilter: '||example.com/tracking.js' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Redundancy removal runs after subsumption, so it may find fewer
    // The broad rule ||example.com^ should make the others redundant
    assert(result.length <= 2); // At least some removed
    console.log('✓ 4a: Redundancy removal reduces rule count');
    passed++;
  } catch (e) {
    console.log('✗ 4a:', e.message);
    failed++;
  }

  // Test 4b: Non-overlapping domains both kept
  try {
    const optimizer = new RuleOptimizer({ enableRedundancyRemoval: true });
    const rules = [
      createRule({ id: 1, priority: 10, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, urlFilter: '||example.org^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 2);
    console.log('✓ 4b: Non-overlapping domains both kept');
    passed++;
  } catch (e) {
    console.log('✗ 4b:', e.message);
    failed++;
  }

  console.log(`\nRedundancy Removal: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 5: Priority Optimization ====================

function testPriorityOptimization() {
  console.log('--- Test 5: Priority Optimization ---');
  let passed = 0;
  let failed = 0;

  // Test 5a: Allow rules before block rules
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 1, priority: 1, action: { type: 'block' }, urlFilter: '||block.com^' }),
      createRule({ id: 2, priority: 1, action: { type: 'allow' }, urlFilter: '||allow.com^' }),
      createRule({ id: 3, priority: 1, action: { type: 'block' }, urlFilter: '||block2.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Allow should come first
    assert.strictEqual(result[0].action.type, 'allow');
    assert.strictEqual(result[1].action.type, 'block');
    assert.strictEqual(result[2].action.type, 'block');
    console.log('✓ 5a: Allow rules sorted before block rules');
    passed++;
  } catch (e) {
    console.log('✗ 5a:', e.message);
    failed++;
  }

  // Test 5b: Redirect rules between allow and block
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 1, action: { type: 'block' }, urlFilter: '||block.com^' }),
      createRule({ id: 2, action: { type: 'redirect', redirect: { url: 'https://safe.com' } }, urlFilter: '||redirect.com^' }),
      createRule({ id: 3, action: { type: 'allow' }, urlFilter: '||allow.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result[0].action.type, 'allow');
    assert.strictEqual(result[1].action.type, 'redirect');
    assert.strictEqual(result[2].action.type, 'block');
    console.log('✓ 5b: Redirect rules sorted between allow and block');
    passed++;
  } catch (e) {
    console.log('✗ 5b:', e.message);
    failed++;
  }

  // Test 5c: Higher priority first within same action type
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 1, priority: 1, action: { type: 'block' }, urlFilter: '||low.com^' }),
      createRule({ id: 2, priority: 10, action: { type: 'block' }, urlFilter: '||high.com^' }),
      createRule({ id: 3, priority: 5, action: { type: 'block' }, urlFilter: '||med.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result[0].condition.urlFilter, '||high.com^');
    assert.strictEqual(result[1].condition.urlFilter, '||med.com^');
    assert.strictEqual(result[2].condition.urlFilter, '||low.com^');
    console.log('✓ 5c: Higher priority first within same action type');
    passed++;
  } catch (e) {
    console.log('✗ 5c:', e.message);
    failed++;
  }

  // Test 5d: More specific rules first when priority equal (disable subsumption to test sorting)
  try {
    const optimizer = new RuleOptimizer({ enableSubsumption: false });
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^' }), // Less specific
      createRule({ id: 2, priority: 1, urlFilter: '||example.com/very/specific/path.js' }), // More specific
      createRule({ id: 3, priority: 1, urlFilter: '||example.com/path/' }) // Medium
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Should sort by specificity (more specific first) then by urlFilter length
    // All have same priority, so specificity determines order
    const spec0 = optimizer.calculateSpecificity(result[0]);
    const spec1 = optimizer.calculateSpecificity(result[1]);
    const spec2 = optimizer.calculateSpecificity(result[2]);
    // First should have highest or equal specificity
    assert(spec0 >= spec1 && spec1 >= spec2, `Specificity order: ${spec0} >= ${spec1} >= ${spec2}`);
    console.log('✓ 5d: Rules sorted by specificity when priority equal');
    passed++;
  } catch (e) {
    console.log('✗ 5d:', e.message);
    failed++;
  }

  console.log(`\nPriority Optimization: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 6: Specificity Scoring ====================

function testSpecificityScoring() {
  console.log('--- Test 6: Specificity Scoring ---');
  let passed = 0;
  let failed = 0;

  const optimizer = new RuleOptimizer();

  // Test 6a: Basic specificity calculation
  try {
    // Use rules without default resourceTypes to test pure filter specificity
    const rule1 = { condition: { urlFilter: '||example.com^', resourceTypes: [] } };
    const rule2 = { condition: { urlFilter: '||example.com/very/long/path/that/is/very/specific.js', resourceTypes: [] } };
    const rule3 = { condition: { regexFilter: 'example\\.com/.*\\.js', resourceTypes: [] } };

    const spec1 = optimizer.calculateSpecificity(rule1);
    const spec2 = optimizer.calculateSpecificity(rule2);
    const spec3 = optimizer.calculateSpecificity(rule3);

    assert(spec2 > spec1); // Longer filter = more specific
    // Regex gets a large base boost (100) so should be highest
    assert(spec3 > spec1); // Regex = more specific
    assert(spec3 > spec2); // Regex should beat long path
    console.log('✓ 6a: Specificity scores calculated correctly');
    passed++;
  } catch (e) {
    console.log('✗ 6a:', e.message);
    failed++;
  }

  // Test 6b: Domains increase specificity
  try {
    const rule1 = createRule({ requestDomains: [] });
    const rule2 = createRule({ requestDomains: ['example.com'] });
    const rule3 = createRule({ requestDomains: ['example.com', 'example.org', 'test.com'] });

    const spec1 = optimizer.calculateSpecificity(rule1);
    const spec2 = optimizer.calculateSpecificity(rule2);
    const spec3 = optimizer.calculateSpecificity(rule3);

    assert(spec2 > spec1);
    assert(spec3 > spec2);
    console.log('✓ 6b: More domains = higher specificity');
    passed++;
  } catch (e) {
    console.log('✗ 6b:', e.message);
    failed++;
  }

  // Test 6c: Resource types increase specificity
  try {
    const rule1 = createRule({ resourceTypes: [] });
    const rule2 = createRule({ resourceTypes: ['script'] });
    const rule3 = createRule({ resourceTypes: ['script', 'image', 'stylesheet', 'font'] });

    const spec1 = optimizer.calculateSpecificity(rule1);
    const spec2 = optimizer.calculateSpecificity(rule2);
    const spec3 = optimizer.calculateSpecificity(rule3);

    assert(spec2 > spec1);
    assert(spec3 > spec2);
    console.log('✓ 6c: More resource types = higher specificity');
    passed++;
  } catch (e) {
    console.log('✗ 6c:', e.message);
    failed++;
  }

  // Test 6d: Allow/redirect get specificity boost
  try {
    const blockRule = createRule({ action: { type: 'block' }, priority: 1 });
    const allowRule = createRule({ action: { type: 'allow' }, priority: 1 });
    const redirectRule = createRule({ action: { type: 'redirect', redirect: { url: 'x' } }, priority: 1 });

    const blockSpec = optimizer.calculateSpecificity(blockRule);
    const allowSpec = optimizer.calculateSpecificity(allowRule);
    const redirectSpec = optimizer.calculateSpecificity(redirectRule);

    assert(allowSpec > blockSpec);
    assert(redirectSpec > blockSpec);
    assert(allowSpec > redirectSpec);
    console.log('✓ 6d: Allow/redirect get specificity boost');
    passed++;
  } catch (e) {
    console.log('✗ 6d:', e.message);
    failed++;
  }

  console.log(`\nSpecificity Scoring: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 7: ID Reassignment ====================

function testIdReassignment() {
  console.log('--- Test 7: ID Reassignment ---');
  let passed = 0;
  let failed = 0;

  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 100, urlFilter: '||a.com^' }),
      createRule({ id: 200, urlFilter: '||b.com^' }),
      createRule({ id: 300, urlFilter: '||c.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');

    assert.strictEqual(result[0].id, 1);
    assert.strictEqual(result[1].id, 2);
    assert.strictEqual(result[2].id, 3);
    console.log('✓ 7: IDs reassigned sequentially from 1');
    passed++;
  } catch (e) {
    console.log('✗ 7:', e.message);
    failed++;
  }

  console.log(`\nID Reassignment: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 8: Batch Processing ====================

async function testBatchProcessing() {
  console.log('--- Test 8: Batch Processing ---');
  let passed = 0;
  let failed = 0;

  // Test 8a: Progress callbacks fired
  try {
    const progressCalls = [];
    const optimizer = new RuleOptimizer({
      batchSize: 2,
      onProgress: (info) => progressCalls.push(info)
    });

    // Create 5 rules (3 batches with batchSize=2)
    const rules = Array.from({ length: 5 }, (_, i) =>
      createRule({ id: i + 1, urlFilter: `||site${i}.com^` })
    );

    await optimizer.optimize(rules, 'batch-test');

    // Should have progress calls for each stage
    assert(progressCalls.length > 0);
    const startCall = progressCalls.find(c => c.stage === 'start');
    const completeCall = progressCalls.find(c => c.stage === 'complete');
    assert(startCall);
    assert(completeCall);
    assert.strictEqual(startCall.total, 5);
    console.log('✓ 8a: Progress callbacks fired correctly');
    passed++;
  } catch (e) {
    console.log('✗ 8a:', e.message);
    failed++;
  }

  // Test 8b: Large rule set processes in batches
  try {
    const optimizer = new RuleOptimizer({
      batchSize: 1000,
      enableSubsumption: false,
      enableSemanticDedup: false,
      enableRedundancyRemoval: false
    });

    const rules = Array.from({ length: 5000 }, (_, i) =>
      createRule({ id: i + 1, urlFilter: `||site${i}.com^` })
    );

    const result = await optimizer.optimize(rules, 'large-test');
    assert.strictEqual(result.length, 5000);
    console.log('✓ 8b: Large rule set processed correctly');
    passed++;
  } catch (e) {
    console.log('✗ 8b:', e.message);
    failed++;
  }

  console.log(`\nBatch Processing: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 9: Stats ====================

function testStats() {
  console.log('--- Test 9: Stats Tracking ---');
  let passed = 0;
  let failed = 0;

  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 1, priority: 10, urlFilter: '||example.com^' }), // High priority broad rule
      createRule({ id: 2, priority: 5, urlFilter: '||example.com^' }), // Exact dup, lower priority
      createRule({ id: 3, priority: 1, urlFilter: '||example.com^' }), // Exact dup, lowest priority
      createRule({ id: 4, priority: 1, urlFilter: '||example.com/path^' }), // Subsumed by rule 1 (broader, higher priority)
      createRule({ id: 5, priority: 1, urlFilter: '||other.com^' })
    ];

    optimizer.optimizeSync(rules, 'test');
    const stats = optimizer.getStats();

    assert.strictEqual(stats.original, 5);
    assert.strictEqual(stats.exactDeduped, 2);
    assert(stats.subsumed >= 1);
    assert(stats.final <= 3);
    assert(stats.reductionPercent);
    console.log('✓ 9: Stats tracked correctly:', stats);
    passed++;
  } catch (e) {
    console.log('✗ 9:', e.message);
    failed++;
  }

  console.log(`\nStats Tracking: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 10: Helper Functions ====================

async function testHelperFunctions() {
  console.log('--- Test 10: Helper Functions ---');
  let passed = 0;
  let failed = 0;

  // Test 10a: optimizeRulesSync helper
  try {
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, urlFilter: '||example.com^' })
    ];

    const result = optimizeRulesSync(rules, 'test');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].priority, 5);
    console.log('✓ 10a: optimizeRulesSync helper works');
    passed++;
  } catch (e) {
    console.log('✗ 10a:', e.message);
    failed++;
  }

  // Test 10b: optimizeRules async helper
  try {
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||example.com^' }),
      createRule({ id: 2, priority: 5, urlFilter: '||example.com^' })
    ];

    const result = await optimizeRules(rules, 'test');
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].priority, 5);
    console.log('✓ 10b: optimizeRules async helper works');
    passed++;
  } catch (e) {
    console.log('✗ 10b:', e.message);
    failed++;
  }

  console.log(`\nHelper Functions: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 11: Real-World Scenarios ====================

function testRealWorldScenarios() {
  console.log('--- Test 11: Real-World Scenarios ---');
  let passed = 0;
  let failed = 0;

  // Test 11a: EasyList-style rules
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      // Google ads
      createRule({ id: 1, priority: 1, urlFilter: '||googlesyndication.com^' }),
      createRule({ id: 2, priority: 1, urlFilter: '||googlesyndication.com/pagead/' }),
      createRule({ id: 3, priority: 1, urlFilter: '||googlesyndication.com/pagead/js/adsbygoogle.js' }),
      // Facebook
      createRule({ id: 4, priority: 1, urlFilter: '||facebook.net^$third-party' }),
      createRule({ id: 5, priority: 1, urlFilter: '||connect.facebook.net^$third-party' }),
      // Allow exception
      createRule({ id: 6, priority: 10, action: { type: 'allow' }, urlFilter: '||example.com^' }),
      // Duplicate
      createRule({ id: 7, priority: 1, urlFilter: '||googlesyndication.com^' })
    ];

    const result = optimizer.optimizeSync(rules, 'easylist');
    // Should dedup the duplicate, subsume the path rules, keep allow first
    assert(result.length <= 5);
    assert.strictEqual(result[0].action.type, 'allow'); // Allow first
    console.log('✓ 11a: EasyList-style rules optimized correctly');
    passed++;
  } catch (e) {
    console.log('✗ 11a:', e.message);
    failed++;
  }

  // Test 11b: uBlock-style rules with resource types
  try {
    const optimizer = new RuleOptimizer({ enableSemanticDedup: true });
    const rules = [
      createRule({ id: 1, urlFilter: '||example.com^$script,image', resourceTypes: ['xmlhttprequest'] }),
      createRule({ id: 2, urlFilter: '||example.com^$xmlhttprequest', resourceTypes: ['script', 'image'] }),
      createRule({ id: 3, urlFilter: '||example.com^', resourceTypes: ['script', 'image', 'xmlhttprequest'] })
    ];

    const result = optimizer.optimizeSync(rules, 'ublock');
    // All three are semantically equivalent
    assert.strictEqual(result.length, 1);
    console.log('✓ 11b: uBlock-style $options normalized');
    passed++;
  } catch (e) {
    console.log('✗ 11b:', e.message);
    failed++;
  }

  console.log(`\nReal-World Scenarios: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Test 12: Edge Cases ====================

function testEdgeCases() {
  console.log('--- Test 12: Edge Cases ---');
  let passed = 0;
  let failed = 0;

  // Test 12a: Empty rules array
  try {
    const optimizer = new RuleOptimizer();
    const result = optimizer.optimizeSync([], 'test');
    assert.strictEqual(result.length, 0);
    console.log('✓ 12a: Empty array handled');
    passed++;
  } catch (e) {
    console.log('✗ 12a:', e.message);
    failed++;
  }

  // Test 12b: Null/undefined input
  try {
    const optimizer = new RuleOptimizer();
    const result = optimizer.optimizeSync(null, 'test');
    assert.strictEqual(result.length, 0);
    console.log('✓ 12b: Null input handled');
    passed++;
  } catch (e) {
    console.log('✗ 12b:', e.message);
    failed++;
  }

  // Test 12c: Rules without condition
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      { id: 1, priority: 1, action: { type: 'block' } }, // Missing condition
      createRule({ id: 2 })
    ];
    const result = optimizer.optimizeSync(rules, 'test');
    assert.strictEqual(result.length, 1); // Only valid rule kept
    console.log('✓ 12c: Invalid rules filtered out');
    passed++;
  } catch (e) {
    console.log('✗ 12c:', e.message);
    failed++;
  }

  // Test 12d: Case sensitivity in urlFilter
  try {
    const optimizer = new RuleOptimizer();
    const rules = [
      createRule({ id: 1, priority: 1, urlFilter: '||Example.com^' }),
      createRule({ id: 2, priority: 1, urlFilter: '||example.com^' }),
      createRule({ id: 3, priority: 1, urlFilter: '||EXAMPLE.COM^' })
    ];

    const result = optimizer.optimizeSync(rules, 'test');
    // Should be deduped due to normalization
    assert.strictEqual(result.length, 1);
    console.log('✓ 12d: Case normalization in deduplication');
    passed++;
  } catch (e) {
    console.log('✗ 12d:', e.message);
    failed++;
  }

  console.log(`\nEdge Cases: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

// ==================== Run All Tests ====================

async function runAllTests() {
  console.log('Starting RuleOptimizer Test Suite...\n');

  const results = [];
  results.push(testExactDeduplication());
  results.push(testSemanticDeduplication());
  results.push(testSubsumptionElimination());
  results.push(testRedundancyRemoval());
  results.push(testPriorityOptimization());
  results.push(testSpecificityScoring());
  results.push(testIdReassignment());
  results.push(await testBatchProcessing());
  results.push(testStats());
  results.push(await testHelperFunctions());
  results.push(testRealWorldScenarios());
  results.push(testEdgeCases());

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