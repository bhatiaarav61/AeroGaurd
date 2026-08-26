# AeroGuard Pro — Production MV3 Ad Blocker

Complete, battle-tested ad blocker with YouTube-specific protection.

## Features

- ✅ **YouTube Fixed**: 22 Priority-2 ALLOW rules protect video playback, thumbnails, captions, player JS
- ✅ **All Ad Types Blocked**: 67 Priority-1 BLOCK rules cover pre/mid/post-roll, overlay, Shorts, Live, IMA SDK, VMAP/VAST
- ✅ **No Broken Sites**: Surgical cosmetic selectors + player allow-list
- ✅ **15 Premium Filter Lists**: EasyList, EasyPrivacy, Fanboy Annoyances/Social, uBlock 4 lists, Anti-Adblock, Cookie, Germany/France/China/Italy/Spain regional
- ✅ **Auto-Updates**: Every 6 hours via Chrome alarms
- ✅ **3 YouTube Modes**: Basic / Standard / Aggressive
- ✅ **Zero Telemetry**: All local, no data collection

## Install

1. Download/clone this folder
2. Open `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → Select this folder
5. Pin extension → Click icon → Settings → Set YouTube to **Aggressive**

## Generate Icons

Open `icons/generate-icons.html` in browser → Click "Generate All" → Download each size (16, 32, 48, 128) → Save to `icons/` folder as `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

## Verify It Works

Open YouTube → DevTools Console → Run:

```javascript
const v = document.querySelector('video.html5-main-video, video#movie_player');
console.log('Visible:', v && getComputedStyle(v).display!=='none' && v.offsetWidth>0);
console.log('Src OK:', v?.src?.includes('googlevideo.com/videoplayback') ? '✅ ALLOWED' : '❌ BLOCKED');
```

**Expected:** `Visible: true` + `Src OK: ✅` + Zero ads

## YouTube Modes

| Mode | Network | Player Patch | IMA Block | DOM Hide |
|------|---------|--------------|-----------|----------|
| Basic | ✅ | ❌ | ❌ | ❌ |
| Standard | ✅ | ✅ | ❌ | ✅ |
| Aggressive | ✅ | ✅ | ✅ | ✅ |

## Filter Lists (15)

- **Core**: EasyList, EasyPrivacy, Peter Lowe
- **Annoyances**: Fanboy Annoyances, Fanboy Social
- **uBlock**: Filters, Privacy, Badware, Annoyances
- **Specialized**: EasyList Cookie, Anti-Adblock Killer
- **Regional**: Germany, France, China, Italy, Spain

## Architecture

```
background.js (Service Worker)
├── FilterEngine → 15 lists → DNR rules
├── YouTubeEngine → 22 ALLOW + 67 BLOCK + 4 Scriptlets
└── StatsEngine → Block/allow tracking

Content Scripts:
├── content/yt.js → YouTube DOM + player patches + IMA block
└── content/generic.js → All sites cosmetic + cookie banners + anti-adblock
```

## Files

```
├── manifest.json
├── background.js
├── filter-engine.js
├── youtube-engine.js
├── stats-engine.js
├── content/
│   ├── yt.js
│   └── generic.js
├── popup/
│   ├── popup.html
│   └── popup.js
├── options/
│   ├── options.html
│   └── options.js
├── welcome.html
├── rules/dynamic.json
├── icons/
│   ├── generate-icons.html
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── README.md
```

## Troubleshooting

**White video?** → YouTube mode = Aggressive, check ALLOW rules exist (Priority 2)

**Ads showing?** → Force Update in popup, wait for filter lists

**Site broken?** → Disable cosmetic in options, or add to allowlist

**Low block rate?** → Ensure all 15 lists enabled, wait for auto-update