const fs = require('fs');
const p = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/run-e2e.cjs';
let s = fs.readFileSync(p, 'utf8');
s = s.replace('headless: true,', 'headless: false,');
s = s.split('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/YouTube_logo_%282017%29.svg/512px-YouTube_logo_%282017%29.svg.png')
  .join('https://www.wikipedia.org/portal/wikipedia.org/assets/img/Wikipedia-logo-v2.png');
s = s.split('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4')
  .join('https://www.w3schools.com/html/mov_bbb.mp4');
fs.writeFileSync(p, s);
console.log('harness updated: headed mode + stable assets');
