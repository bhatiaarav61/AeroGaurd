const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/options/options.js';
let s = fs.readFileSync(p, 'utf8');

// 1. cacheElements
s = s.replace(
  "    this.blockWebRTCToggle = document.getElementById('blockWebRTC');",
  "    this.blockWebRTCToggle = document.getElementById('blockWebRTC');\r\n    this.httpsByDefaultToggle = document.getElementById('httpsByDefault');"
);

// 2. event listener
s = s.replace(
  "    this.blockWebRTCToggle.addEventListener('click', () => this.toggleSetting('advanced.blockWebRTC', this.blockWebRTCToggle));",
  "    this.blockWebRTCToggle.addEventListener('click', () => this.toggleSetting('advanced.blockWebRTC', this.blockWebRTCToggle));\r\n    this.httpsByDefaultToggle.addEventListener('click', () => this.toggleSetting('advanced.httpsByDefault', this.httpsByDefaultToggle));"
);

// 3. reflect state (default ON like Brave)
s = s.replace(
  "    setToggle(this.blockWebRTCToggle, this.settings.advanced?.blockWebRTC === true);",
  "    setToggle(this.blockWebRTCToggle, this.settings.advanced?.blockWebRTC === true);\r\n    setToggle(this.httpsByDefaultToggle, this.settings.advanced?.httpsByDefault !== false);"
);

fs.writeFileSync(p, s);
console.log('wired:', ['httpsByDefaultToggle = document', "toggleSetting('advanced.httpsByDefault'", 'advanced?.httpsByDefault !== false'].map(k => s.includes(k)));
