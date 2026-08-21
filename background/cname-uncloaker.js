// CNAME Alias Filter Generator
const CNAME_TARGET_REGEXES = [
  'omtrdc\\.net', '2o7\\.net', 'eulerian\\.net', 'wizaly\\.com',
  'at-o\\.net', 'wt-eu02\\.net', 'commandersact\\.com', 'go-mpulse\\.net'
];

export async function deployCnameRules() {
  try {
    const rules = CNAME_TARGET_REGEXES.map((pattern, idx) => ({
      id: 500000 + idx,
      priority: 90,
      action: { type: 'block' },
      condition: {
        regexFilter: `^https?://[a-z0-9.-]+\\.(?:${pattern})(:[0-9]+)?(/.*)?$`,
        resourceTypes: ['script', 'xmlhttprequest', 'image', 'ping', 'other']
      }
    }));
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
    console.log('[AeroGuard CNAME] CNAME regex rules successfully loaded.');
  } catch (err) {
    console.warn('[AeroGuard CNAME] Uncloaking rules initialization bypassed:', err.message);
  }
}