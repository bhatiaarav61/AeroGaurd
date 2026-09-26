const fs = require('fs');
const root = 'C:/Users/PC/Documents/AeroGaurd/';

// 1. Fix the fatal syntax error in scriptlets.js: `*/` inside the block
//    comment terminates it early, turning the rest into invalid code.
let p1 = root + 'content-scripts/scriptlets.js';
let s1 = fs.readFileSync(p1, 'utf8');
const badLine = s1.includes('abort-*/set-constant');
s1 = s1.replace(
  ' * (abort-*/set-constant/json-prune/no-fetch-if/remove-attr/remove-class/\r\n *  set-cookie), driven by rules/scriptlets shards the SW serves.',
  ' * (abort-on-property-read, set-constant, json-prune, no-fetch-if,\r\n *  remove-attr, remove-class, set-cookie), driven by rules/scriptlets shards.'
).replace(
  ' * (abort-*/set-constant/json-prune/no-fetch-if/remove-attr/remove-class/\n *  set-cookie), driven by rules/scriptlets shards the SW serves.',
  ' * (abort-on-property-read, set-constant, json-prune, no-fetch-if,\n *  remove-attr, remove-class, set-cookie), driven by rules/scriptlets shards.'
);
fs.writeFileSync(p1, s1);
console.log('scriptlets.js comment fixed:', !s1.includes('abort-*/'), '(was bad:', badLine + ')');

// 2. Service worker: deliver calls to the preloaded MAIN shim via AG.apply,
//    fall back to a pending queue, never inject a competing runner.
let p2 = root + 'background/service-worker.js';
let s2 = fs.readFileSync(p2, 'utf8');
const oldPush = `    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      injectImmediately: true,
      world: 'MAIN',
      files: ['content-scripts/scriptlet-runner.js']
    });
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      injectImmediately: true,
      world: 'MAIN',
      func: (pending) => {
        if (window.__aeroguardScriptlets) window.__aeroguardScriptlets.runAll(pending);
        else window.__aeroguardPendingScriptlets = pending;
      },
      args: [calls]
    });`;
const newPush = `    await chrome.scripting.executeScript({
      target: { tabId: details.tabId, frameIds: [details.frameId] },
      injectImmediately: true,
      world: 'MAIN',
      func: (pending) => {
        const shim = window.__aeroguardScriptlets;
        if (shim && typeof shim.apply === 'function') shim.apply(pending);
        else if (shim && typeof shim.runAll === 'function') shim.runAll(pending);
        else window.__aeroguardPendingScriptlets = pending;
      },
      args: [calls]
    });`;
if (!s2.includes(oldPush)) { console.log('SW PUSH BLOCK NOT FOUND'); process.exit(1); }
s2 = s2.replace(oldPush, newPush);
fs.writeFileSync(p2, s2);
console.log('SW push reconciled to AG.apply');

// 3. Remove the now-redundant runner (the manifest shim supersedes it).
try {
  fs.unlinkSync(root + 'content-scripts/scriptlet-runner.js');
  console.log('deleted redundant scriptlet-runner.js');
} catch (e) { console.log('runner delete:', e.message); }
