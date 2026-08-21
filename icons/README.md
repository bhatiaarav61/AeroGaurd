# Icon Generation Instructions

## Quick Start

To generate the required PNG icons for the extension:

### Option 1: Browser-based (Recommended)
1. Open `generate-icons.html` in any modern browser (Chrome, Firefox, Edge, Safari)
2. Click **"Generate Icons"**
3. Right-click each canvas and select **"Save as PNG"** or click **"Save as PNG"** button
4. Save as:
   - `icon-16.png`
   - `icon-32.png`
   - `icon-48.png`
   - `icon-128.png`

### Option 2: Command Line (Requires Visual Studio)
```bash
cd icons
npm install
npm run generate
```
*Note: Requires Visual Studio with "Desktop development with C++" workload installed.*

## Required Icons

| File | Size | Purpose |
|------|------|---------|
| `icon-16.png` | 16×16 | Toolbar icon |
| `icon-32.png` | 32×32 | Extension management |
| `icon-48.png` | 48×48 | Extension page |
| `icon-128.png` | 128×128 | Chrome Web Store |

## Icon Design

The icon features:
- **Blue gradient background** (#3498db → #2980b9) representing trust and technology
- **White shield** symbolizing protection
- **Red X** (cross) representing blocking/stopping ads
- **Subtle glossy highlight** for modern appearance

## After Generation

Once all 4 PNG files are saved in this folder, the extension is ready to load in any Manifest V3 compatible browser.