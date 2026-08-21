# AeroGuard Deployment Guide

This guide covers how to package and distribute AeroGuard for free across all major browser extension stores and self-hosted options.

---

## Quick Comparison

| Platform | Cost | Review Time | Users Reach | Auto-Updates |
|----------|------|-------------|-------------|--------------|
| Chrome Web Store | $5 one-time | 1-3 days | Highest | ✅ |
| Firefox Add-ons (AMO) | **Free** | <24 hours | High | ✅ |
| Microsoft Edge Add-ons | **Free** | 1-3 days | Medium | ✅ |
| Safari Extensions | **Free** (Apple Dev $99/yr) | Variable | macOS/iOS | ✅ |
| GitHub Releases | **Free** | Instant | Self-managed | Manual |
| Self-Hosted Website | **Free** | Instant | Self-managed | Manual |

---

## Pre-Packaging Checklist

Before building your distribution package:

```bash
# 1. Verify all required files exist
ls -la AeroGuard/
# Should have: manifest.json, icons/icon-16.png, icon-32.png, icon-48.png, icon-128.png
# And all subdirectories: background/, content-scripts/, popup/, options/, help/, rules/, _locales/

# 2. Verify manifest.json has correct version
cat AeroGuard/manifest.json | grep version
# Should show: "version": "1.0.0"

# 3. Test locally first (see Installation in README)
# 4. Check for console errors in DevTools
```

---

## Create Distribution ZIP

### Option A: Command Line (Recommended)

```bash
cd AeroGuard
zip -r ../aeroguard-v1.0.0.zip . \
  -x "*.git*" \
  -x "node_modules/*" \
  -x "icons/generate-*" \
  -x "icons/*.html" \
  -x "icons/*.js" \
  -x "icons/package*.json" \
  -x "icons/README.md" \
  -x "*.md" \
  -x "DEPLOYMENT.md" \
  -x "LICENSE"
```

This creates `aeroguard-v1.0.0.zip` in the parent directory.

### Option B: GitHub Actions (Automated)

Create `.github/workflows/release.yml`:

```yaml
name: Create Release
on:
  push:
    tags: ['v*']
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create ZIP
        run: |
          cd AeroGuard
          zip -r ../aeroguard-${{ github.ref_name }}.zip . \
            -x "*.git*" "node_modules/*" "icons/generate-*" "icons/*.html" "icons/*.js" "icons/package*.json" "icons/README.md" "*.md" "DEPLOYMENT.md" "LICENSE"
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: aeroguard-${{ github.ref_name }}.zip
          generate_release_notes: true
```

Then tag a release: `git tag v1.0.0 && git push origin v1.0.0`

---

## Store Submissions

### 1. Chrome Web Store ($5 one-time registration)

**Prerequisites:**
- Google account
- $5 registration fee (one-time)
- Privacy policy URL (required)

**Steps:**
1. Go to [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole)
2. Pay $5 registration fee
3. Click **New Item** → Upload `aeroguard-v1.0.0.zip`
4. Fill in store listing:
   - **Name**: AeroGuard
   - **Short description**: Privacy-focused ad blocker — blocks ads, trackers, malware & annoyances
   - **Detailed description**: Use content from README.md
   - **Category**: Productivity → Tools
   - **Language**: English
   - **Icon**: Upload `icons/icon-128.png`
   - **Screenshots**: 1280×800 or 640×400 (capture popup, options page, badge in action)
   - **Privacy policy**: Host on GitHub Pages (see template below)
   - **Support URL**: `https://github.com/bhatiaarav61/AeroGuard/issues`
5. Submit for review (typically 1-3 days)

**Privacy Policy Template** (host at `https://bhatiaarav61.github.io/AeroGuard/privacy.html`):
```html
<!DOCTYPE html>
<html><head><title>AeroGuard Privacy Policy</title></head><body>
<h1>AeroGuard Privacy Policy</h1>
<p><strong>Effective Date:</strong> 2025</p>
<p>AeroGuard does not collect, transmit, or store any personal data. No analytics, no tracking, no user identification.</p>
<h2>Data Processing</h2>
<ul>
<li>Filter lists downloaded directly from official sources (EasyList, etc.)</li>
<li>All blocking decisions happen locally in your browser</li>
<li>No data leaves your device</li>
</ul>
<h2>Permissions</h2>
<p><code>declarativeNetRequest</code> and <code><all_urls></code> are required for network request blocking only.</p>
<h2>Contact</h2>
<p>GitHub: <a href="https://github.com/bhatiaarav61/AeroGuard">bhatiaarav61/AeroGuard</a></p>
</body></html>
```

---

### 2. Firefox Add-ons (AMO) — **Completely Free**

**Prerequisites:**
- Firefox Account
- No registration fee

**Steps:**
1. Go to [addons.mozilla.org/developers](https://addons.mozilla.org/developers/)
2. Click **Submit a New Add-on**
3. Upload `aeroguard-v1.0.0.zip`
4. Choose **On-site** (listed on AMO) or **Self-hosted** (you distribute .xpi)
5. Fill in details (similar to Chrome)
6. Submit — review usually <24 hours for non-experimental extensions

**Note**: Firefox requires a slightly different manifest for some APIs. The current manifest works for both.

---

### 3. Microsoft Edge Add-ons — **Free**

**Prerequisites:**
- Microsoft Partner Center account (free)

**Steps:**
1. Go to [partner.microsoft.com/dashboard/microsoftedge](https://partner.microsoft.com/dashboard/microsoftedge)
2. Sign in with Microsoft account
3. Click **New extension** → Upload `aeroguard-v1.0.0.zip`
3. Fill in listing details
4. Submit — review typically 1-3 business days

---

### 4. Safari Extensions — Requires Apple Developer Program ($99/yr)

**Note**: Unlike other browsers, Safari requires a paid Apple Developer account.

**Steps:**
1. Enable Develop menu: Safari → Settings → Advanced → Show Develop menu
2. Develop → Allow Unsigned Extensions
3. Use **Xcode** → File → New → Project → macOS → Safari Web Extension
4. Select the AeroGuard folder as source
5. Build → Creates `.app` file
6. Distribute via Mac App Store or notarize for direct distribution

---

### 5. GitHub Releases (Self-Hosted, Free, Instant)

**Best for**: Open source, instant updates, no review process

**Steps:**
1. Create repo: `https://github.com/bhatiaarav61/AeroGuard`
2. Push code:
   ```bash
   cd AeroGuard
   git init
   git add .
   git commit -m "AeroGuard v1.0.0 - Initial release"
   git branch -M main
   git remote add origin https://github.com/bhatiaarav61/AeroGuard.git
   git push -u origin main
   ```
3. Create release:
   - Go to **Releases** → **Create a new release**
   - Tag: `v1.0.0`
   - Title: `AeroGuard v1.0.0`
   - Attach `aeroguard-v1.0.0.zip`
   - Publish

**Users install by:**
1. Downloading ZIP from Releases page
2. Extracting folder
3. Loading unpacked in browser developer mode

---

### 6. GitHub Pages Landing Page (Free Hosting)

Create a simple install page:

1. In repo settings → Pages → Deploy from branch → `main` / `docs`
2. Create `docs/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>AeroGuard - Privacy-Focused Ad Blocker</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:system-ui;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6}
    .btn{display:inline-block;padding:1rem 2rem;background:#3498db;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;margin:.5rem}
    .btn:hover{background:#2980b9}
    .card{padding:1.5rem;border:1px solid #eee;border-radius:12px;margin:1rem 0}
  </style>
</head>
<body>
  <h1>AeroGuard</h1>
  <p>Privacy-focused ad blocker for Chrome, Firefox, Edge, Safari, Brave, Opera, Vivaldi.</p>
  
  <a href="https://chromewebstore.google.com/detail/aeroguard/YOUR_EXTENSION_ID" class="btn" target="_blank">
    Install from Chrome Web Store
  </a>
  <a href="https://addons.mozilla.org/en-US/firefox/addon/aeroguard/" class="btn" target="_blank">
    Install from Firefox Add-ons
  </a>
  <a href="https://github.com/bhatiaarav61/AeroGuard/releases/latest" class="btn" style="background:#6c757d" target="_blank">
    Download ZIP (Manual Install)
  </a>

  <div class="card">
    <h3>Manual Installation</h3>
    <ol>
      <li>Download ZIP from latest release</li>
      <li>Extract the folder</li>
      <li>Open <code>chrome://extensions/</code> (or <code>about:debugging</code> for Firefox)</li>
      <li>Enable Developer mode</li>
      <li>Click "Load unpacked" → Select extracted folder</li>
    </ol>
  </div>

  <p><a href="https://github.com/bhatiaarav61/AeroGuard">View on GitHub →</a></p>
</body>
</html>
```

---

## Updating Releases

| Platform | Update Process |
|----------|----------------|
| Chrome Web Store | Upload new ZIP → Submit update (auto-review, ~hours) |
| Firefox AMO | Upload new ZIP → Submit (fast review) |
| Edge Add-ons | Upload new ZIP → Submit |
| GitHub Releases | Create new release with new ZIP → Users re-download |
| Self-hosted | Replace ZIP on your site |

**Version bumping**: Update `manifest.json` version before each release:
```json
"version": "1.0.1"
```

---

## Promotion Checklist

- [ ] Add to [awesome-browser-extensions](https://github.com/awesome-browser-extensions/awesome-browser-extensions) (PR)
- [ ] Submit to [Product Hunt](https://producthunt.com)
- [ ] Share on Reddit: r/browserextensions, r/privacy, r/uBlockOrigin
- [ ] Tweet with screenshots
- [ ] Write a blog post about Manifest V3 advantages
- [ ] Create demo GIF/video showing element picker in action

---

## License & Attribution

- **Code**: MIT License — Free for anyone to use, modify, distribute
- **Filter Lists**: EasyList (GPL-3.0), EasyPrivacy (GPL-3.0) — Must keep license notices
- **Icons**: Feather Icons (MIT) — Already attributed in credits

---

## Support Links for Store Listings

| Field | URL |
|-------|-----|
| Homepage | `https://github.com/bhatiaarav61/AeroGuard` |
| Support / Issues | `https://github.com/bhatiaarav61/AeroGuard/issues` |
| Privacy Policy | `https://bhatiaarav61.github.io/AeroGuard/privacy.html` |
| Source Code | `https://github.com/bhatiaarav61/AeroGuard` |
| Changelog | `https://github.com/bhatiaarav61/AeroGuard/releases` |

---

*Deployment guide for AeroGuard — Created by [Aarav Bhati](https://github.com/bhatiaarav61)*
