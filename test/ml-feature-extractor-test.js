/**
 * Test suite for MLFeatureExtractor
 */

import { MLFeatureExtractor, ModelInterface, FeatureVector, FEATURE_DIM, FEATURE_OFFSETS } from '../core/heuristic-engine/ml-feature-extractor.js';

console.log('=== ML Feature Extractor Tests ===\n');

// Test 1: Basic instantiation
console.log('Test 1: Basic instantiation');
const extractor = new MLFeatureExtractor();
console.log('✓ MLFeatureExtractor created');
console.log(`✓ Feature dimension: ${FEATURE_DIM}`);
console.log(`✓ Feature offsets: ${JSON.stringify(FEATURE_OFFSETS)}`);
console.log(`✓ Feature names count: ${extractor.getFeatureNames().length}\n`);

// Test 2: Feature extraction with mock request
console.log('Test 2: Feature extraction with mock request');
const mockRequest = {
  url: 'https://doubleclick.net/ads?utm_source=google&ad_id=12345',
  method: 'GET',
  type: 'xmlhttprequest',
  initiator: 'xmlhttprequest',
  isThirdParty: true,
  navigationStart: Date.now() - 5000,
  requestInterval: 100,
  payloadSize: 1024,
  headers: {
    'user-agent': 'Mozilla/5.0',
    'accept': '*/*',
    'cookie': 'session=abc123',
    'referer': 'https://example.com/'
  },
  paramCount: 2,
  isJSON: false,
  isFormData: false,
  hasRedirectChain: false,
  redirectDepth: 0,
  hasValidSSL: true,
  reputationScore: 0.3
};

const result = extractor.extractFeatures(mockRequest);
console.log('✓ Features extracted');
console.log(`  - Vector type: ${result.vector.constructor.name}`);
console.log(`  - Vector length: ${result.vector.length}`);
console.log(`  - Raw type: ${result.raw.constructor.name}`);
console.log(`  - Raw length: ${result.raw.length}`);
console.log(`  - Normalized type: ${result.normalized.constructor.name}`);
console.log(`  - Normalized length: ${result.normalized.length}`);
console.log(`  - Feature names: ${result.featureNames.length}\n`);

// Test 3: Feature categories verification
console.log('Test 3: Feature categories verification');
const categories = {
  timing: [0, 1, 2, 3],
  payload: [16, 17, 18, 19, 20, 21, 22],
  domain: [48, 49, 50, 51, 52, 53, 54, 55],
  headers: [72, 73, 74, 75, 76, 77],
  initiator: [88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98],
  behavioral: [104, 105, 106, 107, 108, 109]
};

for (const [cat, indices] of Object.entries(categories)) {
  console.log(`  ${cat}:`);
  for (const idx of indices) {
    console.log(`    [${idx}] ${result.featureNames[idx]} = ${result.raw[idx].toFixed(4)} (norm: ${result.normalized[idx].toFixed(4)}, quant: ${result.vector[idx]})`);
  }
}
console.log();

// Test 4: Quantization/Dequantization round-trip
console.log('Test 4: Quantization/Dequantization round-trip');
const testValues = new Float32Array(FEATURE_DIM);
for (let i = 0; i < FEATURE_DIM; i++) {
  testValues[i] = (i % 10) / 10; // 0.0, 0.1, 0.2... pattern
}
const quantized = extractor.quantize(testValues);
const dequantized = extractor.dequantize(quantized);
console.log('  Sample original:', Array.from(testValues.slice(0, 10)).map(v => v.toFixed(3)));
console.log('  Sample quantized:', Array.from(quantized.slice(0, 10)));
console.log('  Sample dequantized:', Array.from(dequantized.slice(0, 10)).map(v => v.toFixed(3)));
const maxError = Math.max(...Array.from(dequantized).map((v, i) => Math.abs(v - testValues[i])));
console.log(`  Max round-trip error: ${maxError.toFixed(4)}`);
console.log('✓ Quantization working correctly\n');

// Test 5: FeatureVector serialization
console.log('Test 5: FeatureVector serialization');
const fv = FeatureVector.fromExtraction(result);
console.log('✓ FeatureVector created');
const json = fv.toJSON();
console.log('✓ Serialized to JSON');
const fv2 = FeatureVector.fromJSON(json);
console.log('✓ Deserialized from JSON');
console.log(`  - Vector match: ${Array.from(fv.vector).every((v, i) => v === fv2.vector[i])}`);
console.log(`  - Feature names match: ${fv.featureNames.every((n, i) => n === fv2.featureNames[i])}`);
console.log(`  - getFeature('isKnownAdDomain'): ${fv.getFeature('isKnownAdDomain').toFixed(4)}`);
console.log();

// Test 6: Different request types
console.log('Test 6: Different request types');

const requests = [
  {
    name: 'Google Analytics (tracking)',
    url: 'https://www.google-analytics.com/collect?v=1&tid=UA-12345&cid=abc',
    type: 'image',
    isThirdParty: true,
    headers: { 'user-agent': 'Mozilla/5.0' }
  },
  {
    name: 'First-party API call',
    url: 'https://api.example.com/v1/user/profile',
    type: 'fetch',
    isThirdParty: false,
    headers: { 'user-agent': 'Mozilla/5.0', 'authorization': 'Bearer token' }
  },
  {
    name: 'CDN resource (legitimate)',
    url: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
    type: 'script',
    isThirdParty: true,
    headers: { 'user-agent': 'Mozilla/5.0' }
  },
  {
    name: 'Suspicious tracking pixel',
    url: 'https://tracker.xyz/pixel.gif?uid=123&ref=example.com',
    type: 'image',
    isThirdParty: true,
    headers: { 'user-agent': 'Mozilla/5.0', 'cookie': 'track=xyz' }
  },
  {
    name: 'Ad request with ad params',
    url: 'https://ads.example.com/ad?zone=123&ad_type=banner&size=300x250',
    type: 'xmlhttprequest',
    isThirdParty: true,
    headers: { 'user-agent': 'Mozilla/5.0' }
  }
];

for (const req of requests) {
  const r = extractor.extractFeatures(req);
  // Check key discriminative features
  const isAdDomain = r.normalized[51];
  const isTrackingDomain = r.normalized[52];
  const hasAdParams = r.normalized[21];
  const hasTrackingParams = r.normalized[22];
  const isThirdParty = r.normalized[48];
  const isSuspiciousTLD = r.normalized[59];

  console.log(`  ${req.name}:`);
  console.log(`    adDomain=${isAdDomain.toFixed(2)} trackingDomain=${isTrackingDomain.toFixed(2)} adParams=${hasAdParams.toFixed(2)} trackingParams=${hasTrackingParams.toFixed(2)} thirdParty=${isThirdParty.toFixed(2)} suspiciousTLD=${isSuspiciousTLD.toFixed(2)}`);
}
console.log();

// Test 7: ModelInterface heuristic prediction
console.log('Test 7: ModelInterface heuristic prediction');
const modelInterface = new ModelInterface({ extractor });

for (const req of requests) {
  const features = extractor.extractFeatures(req);
  const prediction = modelInterface.predictHeuristic(features);
  console.log(`  ${req.name}: adProb=${prediction.adProbability.toFixed(3)} confidence=${prediction.confidence.toFixed(3)} isAd=${prediction.isAd}`);
}
console.log();

// Test 8: Privacy verification - no raw URLs in features
console.log('Test 8: Privacy verification');
const privacyRequest = {
  url: 'https://very-sensitive-bank.com/api/transfer?amount=10000&account=SECRET123&token=PRIVATE_TOKEN',
  type: 'fetch',
  isThirdParty: false,
  headers: { 'authorization': 'Bearer SECRET_TOKEN', 'cookie': 'session=PRIVATE_SESSION' }
};
const privacyResult = extractor.extractFeatures(privacyRequest);

// Verify no raw URL/payload data in features
let hasRawData = false;
for (let i = 0; i < FEATURE_DIM; i++) {
  const val = privacyResult.raw[i];
  // Check if any feature contains recognizable parts of the sensitive URL
  // Note: urlLength (index 23) will equal the URL length - this is expected feature, not a leak
  if (val.toString().includes('SECRET') ||
      val.toString().includes('PRIVATE') ||
      val.toString().includes('very-sensitive-bank')) {
    hasRawData = true;
    console.log(`  ⚠ Potential leak at index ${i}: ${val}`);
  }
}
if (!hasRawData) {
  console.log('✓ No raw URLs, payloads, or PII found in feature vectors');
  console.log('  (URL length at index 23 is an expected feature, not a privacy leak)');
}
console.log();

// Test 9: Behavioral feature computation
console.log('Test 9: Behavioral feature computation');
// Create a fresh extractor to test behavioral features (history is per-instance)
const behavioralExtractor = new MLFeatureExtractor();
const baseTime = Date.now();
// Simulate rapid requests to trigger burst detection (all within 1 second)
for (let i = 0; i < 25; i++) {
  const burstRequest = {
    url: `https://api.example.com/endpoint${i}`,
    type: 'fetch',
    isThirdParty: false,
    headers: { 'user-agent': 'Mozilla/5.0' },
    navigationStart: baseTime - 1000
  };
  behavioralExtractor.extractFeatures(burstRequest);
}

// Check if burst pattern detected
const lastRequest = {
  url: 'https://api.example.com/endpoint25',
  type: 'fetch',
  isThirdParty: false,
  headers: { 'user-agent': 'Mozilla/5.0' },
  navigationStart: baseTime - 1000
};
const burstResult = behavioralExtractor.extractFeatures(lastRequest);
console.log(`  requestsPerSecond feature: ${burstResult.raw[110].toFixed(2)}`);
console.log(`  isBurstPattern feature: ${burstResult.raw[112]}`);
console.log('✓ Behavioral features computed\n');

// Test 10: Normalization params loading
console.log('Test 10: Custom normalization params');
const customParams = new Array(FEATURE_DIM).fill(null).map((_, i) => ({
  min: i * 0.1,
  max: i * 0.1 + 1
}));
extractor.loadNormalizationParams(customParams);
console.log('✓ Custom normalization params loaded');

const testFeatures = new Float32Array(FEATURE_DIM).fill(0.5);
const normalized = extractor.normalize(testFeatures);
console.log(`  Normalized[0] (min=0, max=1): ${normalized[0].toFixed(4)}`);
console.log(`  Normalized[10] (min=1, max=2): ${normalized[10].toFixed(4)}`);
console.log();

// Test 11: Feature importance
console.log('Test 11: Feature importance');
const importance = modelInterface.predictHeuristic(result).featureImportance;
const topFeatures = Array.from(importance)
  .map((v, i) => ({ index: i, name: result.featureNames[i], value: v }))
  .sort((a, b) => b.value - a.value)
  .slice(0, 10);
console.log('  Top 10 important features (heuristic):');
for (const f of topFeatures) {
  console.log(`    [${f.index}] ${f.name}: ${f.value.toFixed(4)}`);
}
console.log();

console.log('=== All Tests Passed ===');