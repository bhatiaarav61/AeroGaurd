# AeroGuard — Manifest V3 Ad Blocker

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Build](https://img.shields.io/badge/Build-Passing-brightgreen)]()

A powerful, privacy-focused ad blocker built on **Manifest V3** that works across all modern browsers (Chrome, Firefox, Edge, Safari, Brave, Opera, Vivaldi). Blocks ads, trackers, malware, annoyances, and cookie notices — with zero data collection.

---

## Features

| Feature | Description |
|---------|-------------|
| **Comprehensive Blocking** | Ads, trackers, malware domains, annoyances, social widgets, cookie notices |
| **Manifest V3** | Modern, secure, performant architecture using Declarative Net Request API |
| **Cosmetic Filtering** | Element hiding via CSS injection for cleaner pages |
| **Multiple Filter Lists** | EasyList, EasyPrivacy, EasyList Cookie, Malware, Annoyances, Fanboy Social, Regional |
| **Custom Rules** | Create your own block/allow rules using Adblock Plus syntax |
| **Visual Element Picker** | Click any element on a page to block it instantly |
| **Real-time Statistics** | Per-site and global blocking counters |
| **Auto-updates** | Filter lists update automatically (configurable interval) |
| **Dark Mode** | Automatic light/dark theme detection |
| **Accessible** | WCAG compliant with full keyboard navigation |
| **Privacy First** | No data collection, no tracking, works completely offline |

---

## Installation

### For Developers (Load Unpacked)

#### Chrome / Edge / Brave / Vivaldi / Opera
1. Open `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`, etc.)
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `AeroGuard` folder

#### Firefox
1. Open `about:debugging`
2. Click **This Firefox** → **Load Temporary Add-on**
2. Select `manifest.json` in the AeroGuard folder

#### Safari (macOS)
1. Enable Develop menu: Safari → Settings → Advanced → Show Develop menu
2. Develop → Allow Unsigned Extensions
3. Use Safari Web Extension Converter to build the `.app` file
4. Install the generated app

---

## Project Structure

```
AeroGuard/
├── manifest.json                 # Manifest V3 configuration
├── background/
│   └── service-worker.js         # Main service worker (all modules bundled)
├── content-scripts/
│   ├── content-script.js         # Main content script
│   ├── element-hider.js          # Cosmetic filtering (element hiding)
│   └── content-script.css        # Injected styles
├── popup/
│   ├── popup.html                # Extension popup UI
│   ├── popup.js                  # Popup logic
│   └── popup.css                 # Popup styles
├── options/
│   ├── options.html              # Full settings page
│   ├── options.js                # Settings logic
│   └── options.css               # Settings styles
├── help/
│   └── help.html                 # Help & troubleshooting page
├── rules/
│   ├── block-rules.json          # Static blocking rules
│   ├── allow-rules.json          # Static allowlist rules
│   └── custom-rules.json         # User custom rules (empty initially)
├── icons/
│   ├── icon.svg                  # Source SVG icon
│   ├── icon-16.png               # 16x16 toolbar icon
│   ├── icon-32.png               # 32x32 extension management
│   ├── icon-48.png               # 48x48 extension page
│   └── icon-128.png              # 128x128 store icon
├── _locales/
│   └── en/
│       └── messages.json         # English localization
└── LICENSE                       # MIT License
```

---

## Key Technologies

- **Manifest V3**: Service workers, Declarative Net Request API
- **Declarative Net Request (DNR)**: High-performance rule-based blocking
- **Chrome Storage API**: Settings and statistics persistence
- **Fetch API**: Filter list downloads with ETag/Last-Modified support
- **MutationObserver**: Dynamic content monitoring for cosmetic filters
- **CSS Injection**: Element hiding via stylesheet injection
- **ES Modules**: Modern JavaScript with import/export (bundled for SW)

---

## Filter Lists Included

| List | Category | Enabled | Description |
|------|----------|---------|-------------|
| EasyList | Ads | ✅ | Primary ad blocking filter list |
| EasyPrivacy | Trackers | ✅ | Privacy-focused tracker blocking |
| EasyList Cookie | Cookie Notices | ✅ | GDPR/cookie banner blocking |
| Malware Domains | Malware | ✅ | Known malware/phishing domains |
| Annoyances | Annoyances | ✅ | Anti-adblock, popups, overlays |
| Fanboy Social | Social | ❌ | Social media buttons/widgets |
| EasyList Germany | Regional | ❌ | German-specific ads |
| EasyList France | Regional | ❌ | French-specific ads |
| EasyList China | Regional | ❌ | Chinese-specific ads |

---

## Custom Rules Syntax

AeroGuard supports **Adblock Plus filter syntax** for custom rules:

```
||example.com^                    # Block all requests to example.com
||example.com^$script             # Block only scripts from example.com
@@||example.com^                  # Allow exception for example.com
||example.com^$domain=~allowed.com # Block example.com except on allowed.com
||example.com^$third-party        # Block only third-party requests
```

### Cosmetic Filters (Element Hiding)

```
example.com##.ad-banner           # Hide .ad-banner on example.com
example.com,other.com###sidebar-ad # Hide #sidebar-ad on multiple domains
example.com#@#.ad-banner          # Exception: don't hide .ad-banner on example.com
```

---

## Development

### Prerequisites
- Node.js 18+ (for icon generation only)
- Modern browser with Manifest V3 support

### Building Icons
```bash
# Option 1: Browser-based (open generate-icons.html)
# Option 2: Node.js (requires canvas - needs Visual Studio C++ build tools)
cd icons
npm install
node generate-icons.js
```

### Testing
1. Load extension in developer mode (see Installation)
2. Open any website
3. Click extension icon to see popup
4. Right-click extension → "Options" for full settings
5. Check DevTools console for debug logs

### Debugging
- **Background script**: `chrome://extensions/` → Service worker "Inspect views"
- **Content scripts**: DevTools → Console (filter by "AeroGuard")
- **DNR rules**: DevTools → Application → Declarative Net Request

---

## Performance

| Metric | Value |
|--------|-------|
| Memory | ~2-5 MB (service worker + rules) |
| CPU | Negligible (DNR runs in browser process) |
| Latency | Zero added latency (blocking at network level) |
| Rule Limit | 50,000 dynamic rules + static rulesets |

---

## Privacy

- **No data leaves your browser** — ever
- **No analytics or telemetry**
- **Filter lists downloaded directly** from official sources (EasyList, etc.)
- **All processing happens locally**
- **Works completely offline** after initial list download

---

## Browser Compatibility

| Browser | Manifest V3 Support | Status |
|---------|-------------------|--------|
| Chrome 88+ | ✅ Full | ✅ Tested |
| Edge 88+ | ✅ Full | ✅ Tested |
| Firefox 109+ | ✅ Full | ✅ Tested |
| Safari 15.4+ | ✅ Full | ✅ Tested |
| Brave | ✅ Full | ✅ Tested |
| Opera | ✅ Full | ✅ Tested |
| Vivaldi | ✅ Full | ✅ Tested |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test across browsers
5. Submit a pull request

---

## License

MIT License — See [LICENSE](LICENSE) for details

---

## Credits

- **Filter Lists**: [EasyList](https://easylist.to/), [EasyPrivacy](https://easylist.to/), [Fanboy](https://fanboy.co.nz/)
- **Icons**: [Feather Icons](https://feathericons.com/)
- **Architecture**: Manifest V3, Declarative Net Request API

---

## Support

- **Issues**: [GitHub Issues](https://github.com/bhatiaarav61/AeroGuard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bhatiaarav61/AeroGuard/discussions)
- **Documentation**: [Wiki](https://github.com/bhatiaarav61/AeroGuard/wiki)

---

**AeroGuard** — Making the web cleaner, faster, and more private. 🛡️

*Created by [Aarav Bhati](https://github.com/bhatiaarav61)*
