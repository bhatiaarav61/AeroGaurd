document.addEventListener('DOMContentLoaded', async () => {
  const rulesCountEl = document.getElementById('rulesCount');
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    rulesCountEl.textContent = rules.length.toLocaleString();
  } catch (e) {
    rulesCountEl.textContent = 'Active';
  }
});