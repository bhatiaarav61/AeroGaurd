# AeroGuard Enhanced - Production-Grade Manifest V3 Ad Blocker

## Overview

AeroGuard Enhanced is a production-grade, ultra-performant Manifest V3 browser extension for high-yield ad blocking, tracker protection, and anti-adblock defusal with near-zero page breakage.

## Architecture Highlights

### 1. Declarative Net Request (DNR) Core
- **Static Rulesets**: 40+ filter lists (EasyList, EasyPrivacy, uBlock, AdGuard, OISD, Peter Lowe, Fanboy, NoCoin, regional lists)
- **Dynamic Rules**: Real-time rule updates via `updateDynamicRules()` with collision prevention
- **Session Rules**: Per-tab temporary exceptions
- **CNAME Uncloaking DNR Integration**: Network-level blocking of CNAME-cloaked trackers

### 2. MAIN World Scriptlet Injection
Scriptlets run in the page's global context (`world: "MAIN"`) for direct `window` access:

| Scriptlet | Target | Purpose |
|-----------|--------|---------|
| `yt-defuser.js` | YouTube | Strips ad payloads, neutralizes playability errors, removes enforcement modals |
| `news-defuser.js` | News sites | Stubs Admiral/Piano/BlockAdBlock, restores scroll, removes paywalls |
| `generic-defuser.js` | All sites | Universal anti-adblock stubs, timing trap defusal, overlay removal |

### 3. Enhanced Filter Manager (`filter-manager-enhanced.js`)
- **RuleIdAllocator**: Collision-free ID allocation across modules
- **CNAME DNR Rules**: Auto-generates DNR block rules from detected CNAME tracking domains
- **Atomic Updates**: Safe batch updates with validation and deduplication
- **Session Rules**: Per-tab temporary allow/block rules
- **Performance Tracking**: Sub-millisecond refresh monitoring

### 4. Enhanced Scriptlet Manager (`scriptlet-injection-enhanced.js`)
- **30+ Specialized Scriptlets**: YouTube, news, generic, uBlock-style, CSP, WebRTC, cookie clearing
- **DNR Redirect Integration**: Creates redirect rules for MAIN world injection
- **Per-Domain Rules**: Targeted scriptlet deployment (YouTube, major news sites, all domains)

### 5. Unbreak Engine (`unbreak-engine.js`)
- **Exception Rules**: Handles `#@#` generichide exceptions
- **Structural Fallbacks**: 10 built-in fixes for common breakage patterns:
  - Video player container collapse
  - Sidebar/widget collapse
  - Header/nav collapse
  - Article content collapse
  - Comment section collapse
  - Cookie consent banner removal
  - Paywall overlay removal
  - Anti-adblock wall removal
  - Modal/overlay cleanup
- **Breakage Reporting**: Auto-generates exception rules after repeated breakage

### 6. Privacy Modules (Enhanced)
- **CNAME Uncloaking**: DNS-over-HTTPS resolution, 150+ tracking patterns, DNR integration
- **WebRTC Protection**: 3 modes (default, disable, proxy-only), ICE candidate filtering
- **Fingerprinting Protection**: 20+ protections (canvas, WebGL, audio, fonts, client rects, etc.)
- **Bounce Tracking Protection**: Redirect chain analysis, storage clearing
- **Cookie Protection**: 3rd-party blocking, partitioning, auto-delete on close
- **HTTPS Upgrade**: HSTS preload (50 domains), mixed content blocking, navigation upgrades

## File Structure

```
AeroGuard/
├── manifest.json                          # Manifest V3 configuration
├── background/
│   ├── service-worker.js                  # Main service worker (85KB)
│   ├── abp-parser.js                      # ABP → DNR parser
│   ├── filter-manager-enhanced.js         # Enhanced filter manager
│   └── utils/
│       └── rule-update-queue.js           # Atomic DNR update queue
├── content-scripts/
│   ├── content-script.js                  # Main content script
│   ├── element-hider.js                   # Aggressive cosmetic filtering
│   ├── cosmetic-filter-engine.js          # Advanced cosmetic engine
│   ├── unbreak-engine.js                  # Site compatibility engine
│   └── scriptlets/
│       ├── yt-defuser.js                  # YouTube anti-adblock defuser
│       ├── news-defuser.js                # News site defuser
│       └── generic-defuser.js             # Universal defuser
├── privacy-modules/
│   ├── cname-uncloaking.js                # CNAME uncloaking
│   ├── webrtc-protection.js               # WebRTC IP leak protection
│   ├── fingerprinting-protection.js       # Browser fingerprinting protection
│   ├── bounce-tracking-protection.js      # Redirect tracking protection
│   ├── cookie-protection.js               # Cookie partitioning/blocking
│   ├── https-upgrade.js                   # HTTPS Everywhere
│   ├── scriptlet-injection.js             # Original scriptlet manager
│   └── scriptlet-injection-enhanced.js    # Enhanced with 30+ scriptlets
├── rules/                                 # DNR static rulesets (40+ files)
│   ├── block-rules.json                   # Combined ruleset
│   ├── cname-uncloaking.json              # CNAME tracking domains
│   └── *.json                             # Individual filter list rulesets
├── build-rules.js                         # Original build script
├── build-rules-enhanced.js                # Enhanced build with CNAME
└── _locales/en/messages.json              # i18n messages
```

## Key Innovations

### Sub-Millisecond Evaluation
- DNR rules evaluated by browser network stack (native speed)
- Cosmetic filters compiled to single stylesheet injection
- Scriptlets injected via DNR redirect (no content script overhead)
- CNAME uncloaking runs in background, results cached to DNR

### Anti-Adblock Defusal Strategy
1. **Network Level**: DNR blocks ad/tracking requests before they fire
2. **Script Level**: MAIN world scriptlets neutralize detection scripts
3. **DOM Level**: MutationObserver removes enforcement overlays
4. **Structural Level**: Unbreak engine fixes collapsed containers

### Zero-Breakage Guarantees
- Exception rules (`#@#`, `@@`) respected at all levels
- Structural fallbacks restore legitimate collapsed content
- Breakage telemetry auto-generates compatibility rules
- Session rules for per-tab temporary fixes

## Building Rules

```bash
# Standard build
node build-rules.js

# Enhanced build with CNAME uncloaking DNR rules
node build-rules-enhanced.js
```

## Installation

1. Load as unpacked extension in Chrome/Edge/Brave (Developer mode)
2. Or build for Chrome Web Store:
   ```bash
   # Ensure all rules are built
   node build-rules-enhanced.js
   # Zip the AeroGuard directory
   ```

## Configuration

### Settings (via options.html)
- **Blocking Categories**: Ads, Trackers, Malware, Annoyances, Social, Cookie Notices
- **Filter Lists**: 40+ lists with individual toggles
- **Allowlist**: Domain/URL exceptions
- **Custom Rules**: ABP syntax support
- **Cosmetic Filters**: Element hiding with domain restrictions
- **Privacy**: WebRTC, Fingerprinting, Bounce Tracking, Cookies, HTTPS Upgrade
- **Advanced**: Strict mode, Debug mode, Theme, Language

### Message API (for popup/options)
```javascript
// Get extension state
chrome.runtime.sendMessage({ type: 'GET_EXTENSION_STATE' })

// Toggle protection
chrome.runtime.sendMessage({ type: 'TOGGLE_EXTENSION', payload: { enabled: true } })

// Get statistics
chrome.runtime.sendMessage({ type: 'GET_STATS', payload: { tabId } })

// Manage filter lists
chrome.runtime.sendMessage({ type: 'GET_FILTER_LISTS' })
chrome.runtime.sendMessage({ type: 'TOGGLE_FILTER_LIST', payload: { key: 'easylist', enabled: true } })
chrome.runtime.sendMessage({ type: 'UPDATE_FILTER_LISTS' })

// Custom rules
chrome.runtime.sendMessage({ type: 'ADD_CUSTOM_RULE', payload: { condition: {...}, action: { type: 'block' } } })

// Privacy modules
chrome.runtime.sendMessage({ type: 'GET_CNAME_UNCLOAKING_STATUS' })
chrome.runtime.sendMessage({ type: 'TOGGLE_CNAME_UNCLOAKING', payload: { enabled: true } })
```

## Performance Targets

| Metric | Target |
|--------|--------|
| DNR Rule Evaluation | < 0.1ms (native) |
| Cosmetic Filter Application | < 1ms |
| Scriptlet Injection | < 2ms (MAIN world) |
| CNAME Resolution | Async, cached 1hr |
| Rule Refresh (full) | < 500ms |
| Memory Usage | < 50MB |

## Browser Compatibility

- **Chrome 88+** (Manifest V3)
- **Edge 88+**
- **Brave** (native DNR support)
- **Firefox 109+** (Manifest V3, limited DNR)
- **Safari 15.4+** (Web Extensions, declarativeNetRequest)

## Credits

- Filter lists: EasyList, EasyPrivacy, uBlock Origin, AdGuard, OISD, Peter Lowe, Fanboy, NoCoin
- Architecture inspired by: Brave Shields, uBlock Origin, AdGuard
- Icons: Feather Icons

## License

MIT License - Copyright © 2026 AeroGuard Contributors