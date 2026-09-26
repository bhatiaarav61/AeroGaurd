// Playback progression test: video must PLAY (currentTime increases),
// must NOT auto-skip to end, and no false ad-showing during normal playback.
const puppeteer = require('puppeteer-core');
const path = require('path');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const EXT = 'C:/Users/PC/Documents/AeroGaurd';
const CHROME = 'C:/Users/PC/Documents/AeroGaurd/tests/e2e/browsers/chrome/win64-154.0.8037.57/chrome-win64/chrome.exe';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: [
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
      '--no-first-run', '--no-default-browser-check', '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${path.join(__dirname, 'profile-play')}`
    ]
  });
  await sleep(8000);
  const page = await browser.newPage();
  await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(6000);

  // ensure playback started (click play if paused)
  await page.evaluate(() => {
    const v = document.querySelector('video.html5-main-video');
    if (v && v.paused) { v.muted = true; v.play().catch(() => {}); }
  }).catch(() => {});
  await sleep(2000);

  const samples = [];
  for (let i = 0; i < 7; i++) {
    const s = await page.evaluate(() => {
      const v = document.querySelector('video.html5-main-video');
      const player = document.querySelector('.html5-video-player');
      return {
        t: v ? Math.round(v.currentTime * 10) / 10 : -1,
        duration: v ? Math.round(v.duration) : -1,
        paused: v ? v.paused : null,
        adShowing: !!(player && player.classList.contains('ad-showing')),
        readyState: v ? v.readyState : -1
      };
    }).catch(e => ({ evalError: e.message.slice(0, 80) }));
    samples.push(s);
    await sleep(2000);
  }
  console.log('samples:', JSON.stringify(samples));

  const times = samples.map(s => s.t).filter(t => t >= 0);
  const progressed = times.length >= 3 && times[times.length - 1] > times[0] + 2;
  const jumpedToEnd = times.some(t => t > 0) && samples.some(s => s.duration > 0 && s.t >= s.duration - 1);
  const falseAdShow = samples.filter(s => s.adShowing).length;
  const verdict = {
    progressed, jumpedToEnd, falseAdShow,
    finalState: samples[samples.length - 1]
  };
  console.log('VERDICT:', JSON.stringify(verdict));
  await page.screenshot({ path: path.join(__dirname, 'shot-playback.png') });
  await browser.close();
  process.exit(progressed && !jumpedToEnd ? 0 : 1);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
