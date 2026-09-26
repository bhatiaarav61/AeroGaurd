const fs = require('fs');
const sw = fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/background/service-worker.js', 'utf8');
console.log('SW lines:', sw.split('\n').length);
for (const k of ['webRequest', 'texts0Placeholder', 'setSlotCategories', 'cosmeticSelectorsFor', 'applyDynamicRules', 'genericNeg', 'getActiveTab']) {
  console.log(' ', k + ':', sw.includes(k));
}
const st = fs.readFileSync('C:/Users/PC/Documents/AeroGaurd/background/statistics-tracker.js', 'utf8');
console.log('ST recordMatch:', st.includes('recordMatch'), 'getTabStats:', st.includes('getTabStats'));
