/**
 * AeroGuard Validation Script
 * Paste this into DevTools console on any page to validate the extension
 * Run after extension is installed and active
 */
(function() {
  'use strict';

  console.log('🔍 Validating AeroGuard Ad Blocker...\n');

  const results = {
    filterLists: {},
    stats: {},
    youtubeMode: null,
    errors: [],
    criticalLists: ['fanboy_social', 'easylist_germany', 'easylist_france', 'easylist_china'],
    passed: 0,
    failed: 0
  };

  function logCheck(name, pass, details = '') {
    const icon = pass ? '✅' : '❌';
    console.log(`${icon} ${name}${details ? ': ' + details : ''}`);
    if (pass) results.passed++; else results.failed++;
  }

  async function validate() {
    // 1. Check all filter lists loaded
    console.log('📋 Checking Filter Lists...');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
      results.filterLists = response || {};

      for (const [id, list] of Object.entries(results.filterLists)) {
        const hasRules = list.ruleCount > 0;
        const isEnabled = list.enabled;
        const status = isEnabled && hasRules ? '✅' : isEnabled && !hasRules ? '⚠️' : '⏸️';
        const details = `${list.ruleCount} rules ${list.errorCount > 0 ? `(${list.errorCount} errors)` : ''}`;
        logCheck(`${list.name} (${id})`, isEnabled && hasRules, details);
      }

      // 2. Check critical lists (previously missing)
      console.log('\n🎯 Critical Lists (Previously Missing):');
      for (const id of results.criticalLists) {
        const list = results.filterLists[id];
        const ok = list && list.enabled && list.ruleCount > 0;
        logCheck(list?.name || id, ok, ok ? `${list.ruleCount} rules` : 'MISSING OR EMPTY');
      }

    } catch (e) {
      logCheck('Filter Lists API', false, e.message);
    }

    // 3. Check statistics
    console.log('\n📊 Checking Statistics...');
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
      results.stats = response || {};

      const blockRate = results.stats.blockRate || 0;
      const ytBlockRate = results.stats.youtubeBlockRate || 0;
      const totalBlocked = results.stats.totalBlocked || 0;
      const ytBlocked = results.stats.youtubeAdsBlocked || 0;

      logCheck(`Overall Block Rate ≥90%`, blockRate >= 90, `${blockRate}% (${totalBlocked} blocked)`);
      logCheck(`YouTube Block Rate ≥95%`, ytBlockRate >= 95, `${ytBlockRate}% (${ytBlocked} blocked)`);
      logCheck(`Total Requests Tracked`, (results.stats.totalRequests || 0) > 0, `${results.stats.totalRequests || 0} total`);

    } catch (e) {
      logCheck('Statistics API', false, e.message);
    }

    // 4. Check YouTube mode
    console.log('\n🎬 Checking YouTube Mode...');
    try {
      const { youtubeBlocking } = await chrome.storage.sync.get('youtubeBlocking');
      results.youtubeMode = youtubeBlocking || 'not set';
      const validModes = ['basic', 'standard', 'aggressive'];
      logCheck(`YouTube Mode`, validModes.includes(results.youtubeMode), results.youtubeMode);
    } catch (e) {
      logCheck('YouTube Mode', false, e.message);
    }

    // 5. Check for errors
    console.log('\n⚠️ Checking for Errors...');
    try {
      const { errorLog = [] } = await chrome.storage.local.get('errorLog');
      const recentErrors = errorLog.filter(e => Date.now() - e.timestamp < 3600000);
      results.errors = recentErrors;

      const criticalErrors = recentErrors.filter(e =>
        e.message?.includes('quota') ||
        e.message?.includes('DNR') ||
        e.message?.includes('scriptlet') ||
        e.message?.includes('chrome.scripting') ||
        e.message?.includes('declarativeNetRequest')
      );

      logCheck(`No Critical Errors (1hr)`, criticalErrors.length === 0, `${recentErrors.length} total, ${criticalErrors.length} critical`);
      if (criticalErrors.length > 0) {
        console.table(criticalErrors.slice(0, 5));
      }
    } catch (e) {
      logCheck('Error Log', false, e.message);
    }

    // 6. Check content scripts active
    console.log('\n📜 Checking Content Scripts...');
    try {
      const hasYouTubeScript = !!window.__adblockerProYT;
      const hasGenericScript = !!window.__adblockerProGeneric;
      const hasFingerprintShield = !!window.fingerprintingProtection;
      const hasScriptletManager = !!window.ScriptletManager;

      logCheck('YouTube Content Script', hasYouTubeScript);
      logCheck('Generic Content Script', hasGenericScript);
      logCheck('Fingerprint Shield', hasFingerprintShield);
      logCheck('Scriptlet Manager', hasScriptletManager);
    } catch (e) {
      logCheck('Content Scripts', false, e.message);
    }

    // 7. Check DNR rules active
    console.log('\n🛡️ Checking DNR Rules...');
    try {
      const rules = await chrome.declarativeNetRequest.getDynamicRules();
      const staticRules = await chrome.declarativeNetRequest.getEnabledRulesets();
      logCheck(`Dynamic Rules Active`, rules.length > 0, `${rules.length} rules`);
      logCheck(`Static Rulesets Enabled`, staticRules.length > 0, `${staticRules.length} rulesets`);
    } catch (e) {
      logCheck('DNR Rules', false, e.message);
    }

    // 8. Check alarms (auto-update)
    console.log('\n⏰ Checking Auto-Update Alarm...');
    try {
      const alarms = await chrome.alarms.get('filterListUpdate');
      logCheck('Auto-Update Alarm', !!alarms, alarms ? `Next: ${new Date(alarms.scheduledTime).toLocaleString()}` : 'NOT SET');
    } catch (e) {
      logCheck('Alarms API', false, e.message);
    }

    // 9. Final verdict
    console.log('\n' + '='.repeat(50));
    const allPassed = results.failed === 0;
    console.log(`🎯 VALIDATION RESULT: ${allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED'}`);
    console.log(`   Passed: ${results.passed} | Failed: ${results.failed}`);
    console.log('='.repeat(50));

    if (!allPassed) {
      console.log('\n🔧 Troubleshooting:');
      console.log('1. Reload the extension at chrome://extensions');
      console.log('2. Check service worker console for errors');
      console.log('3. Click "Update Filter Lists" in popup/options');
      console.log('4. Verify YouTube mode is set to "aggressive"');
      console.log('5. Wait 30 seconds for initial filter list fetch');
    }

    return {
      passed: results.passed,
      failed: results.failed,
      filterLists: results.filterLists,
      stats: results.stats,
      youtubeMode: results.youtubeMode,
      errors: results.errors.length,
      allPassed
    };
  }

  // Run validation
  validate().then(result => {
    window.aeroguardValidation = result;
    console.log('\n💡 Result saved to window.aeroguardValidation');
  });

  // Also provide a quick check function
  window.quickCheck = async function() {
    const { youtubeBlocking } = await chrome.storage.sync.get('youtubeBlocking');
    const stats = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
    const lists = await chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' });
    console.table({
      'YouTube Mode': youtubeBlocking,
      'Block Rate': stats.blockRate + '%',
      'YouTube Block Rate': stats.youtubeBlockRate + '%',
      'Total Blocked': stats.totalBlocked,
      'Lists Loaded': Object.values(lists).filter(l => l.enabled && l.ruleCount > 0).length + '/' + Object.keys(lists).length
    });
  };
})();