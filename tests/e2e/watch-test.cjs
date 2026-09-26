// Watch-page render test with extension + de-automation flags
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
      '--window-size=1380,860',
      `--user-data-dir=${path.join(__dirname, 'profile-watch')}`
    ]
  });
  await sleep(8000);
  const page = await browser.newPage();
  const blocked = [];
  page.on('requestfailed', r => {
    if (/BLOCKED_BY_CLIENT/.test(r.failure()?.errorText || '')) blocked.push(r.url().slice(8, 80));
  });
  await page.goto('https://www.youtube.com/watch?v=aqz-KE-bpKQ', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(14000);
  const state = await page.evaluate(() => {
    const v = document.querySelector('video.html5-main-video');
    const player = document.querySelector('#movie_player');
    return {
      title: document.title.slice(0, 50),
      videoEl: !!v,
      videoSize: v ? v.videoWidth + 'x' + v.videoHeight : null,
      readyState: v ? v.readyState : -1,
      playerApi: !!(player && typeof player.playVideo === 'function'),
      adsShowing: !!document.querySelector('.ad-showing'),
      bodyTextLen: document.body.innerText.length,
      imgsLoaded: [...document.images].filter(i => i.naturalWidth > 0).length,
      imgsTotal: document.images.length,
      titleText: (document.querySelector('h1.ytd-watch-metadata, h1') || {}).textContent || ''
    };
  }).catch(e => ({ evalError: e.message.slice(0, 100) }));
  console.log(JSON.stringify(state, null, 1));
  console.log('blocked core requests:', blocked.slice(0, 8));
  await page.screenshot({ path: path.join(__dirname, 'shot-yt-watch.png') });
  await browser.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
