# MapControlPanel Reference

**File:** `src/components/MapControlPanel.jsx`  
**Current commit:** `ffb3da4` (as of 2026-06-11)

---

## Overview

The control panel is a fixed-position overlay on the right side of the map (`right: 8, top: 8, zIndex: 500`). Width is 160px. It scrolls vertically with `maxHeight: calc(100% - ${16 + (windSliderHeight || 0)}px)` — the `windSliderHeight` prop (typically 80 when wind is active, 0 otherwise) shrinks it to prevent overlap with the wind time slider.

It is hidden on mobile (`hidden sm:flex`). When `collapsed` is true the component returns `null`; the parent handles showing a re-open button.

---

## Internal components

### `ProGate`
Wraps any child. If `isPro` is false, grays out the child and shows a portal popup with upgrade CTA on click. The popup costs $69/yr link.

```jsx
<ProGate isPro={isPro} label="Feature is Pro.">
  <ToolBtn ...>Feature</ToolBtn>
</ProGate>
```

### `LayerBtn`
Used for the main data layer row buttons (SST, CHL, Sea color, Altimetry, Wind map). Has a per-button `color` prop that maps to distinct Tailwind active colors — **keep these distinct** since they identify the active layer visually.

Active colors by layer:
| Layer | color prop | Active class |
|---|---|---|
| SST | cyan | `bg-cyan-600` |
| Chlorophyll | green | `bg-green-600` |
| Sea color | teal | `bg-teal-600` |
| Altimetry | violet | `bg-violet-600` |
| Wind map | sky | `bg-sky-600` |

### `SubSourceBtn`
Used for SST sub-sources (Daily / Hourly / Composite 36h). Active state is `bg-violet-50 text-violet-700`.

### `ToolBtn`
Used for all Overlay and Tool toggle buttons. **All active states are the same color: `bg-cyan-700 text-white border-cyan-700`.** Do NOT add per-button color variants — the user explicitly standardized this.

### `SectionHeader`
Collapsible section header with chevron. Takes `title`, `open`, `onToggle`.

### `DateNav`
Date navigator with `‹` / `›` arrows. Used beneath layer buttons when multiple dates exist. Takes `label`, `onPrev`, `onNext`, `disablePrev`, `disableNext`, `color`.

### `IsothermSubControls`
Temp range slider + sharpness slider that appears inline when Temp Break is active. The parent `effectiveTargetTemp` value clamps to `[sstMin, sstMax]` before rendering.

### `Divider`
`<div className="border-t border-slate-100 mx-0" />`

---

## Section order (top to bottom)

1. **Header** — "Controls" label + collapse button (chevron-left SVG)
2. **Mode row** — Pan / Inspect buttons
3. **Data layer** — collapsible
4. **Gain** — collapsible, hidden when altimetry or windmap is active
5. **Overlays** — collapsible
6. **Tools** — collapsible
7. **Community** — collapsible
8. **Help modal portal** — rendered at end of JSX via `ReactDOM.createPortal`

---

## Help system

### `HELP_CONFIG`
Top-level `const` object keyed by string ID. Each entry has:
```js
{ title: string, image: string, text: string }
```

All image paths reference `/public/` files (Vite serves `src/public/`). If an image 404s it is hidden via `onError`.

| Key | Image path |
|---|---|
| `sst` | `/help/sst.png` |
| `chlorophyll` | `/chl_ref_point.png` |
| `seacolor` | `/help/seacolor.png` |
| `altimetry` | `/altimetry_ref.png` |
| `windmap` | `/help/windmap.png` |
| `isotherm` | `/help/isotherm.png` |
| `hotspots` | `/help/hotspots.png` |
| `windoverlay` | `/help/windoverlay.png` |
| `currents` | `/help/currents.png` |
| `trip` | `/trip_plan_ref.png` |
| `gps` | `/help/gps.png` |
| `bathy` | `/help/bathy.png` |
| `altoverlay` | `/altimetry_ref.png` |
| `bottomfeat` | `/help/bottomfeat.png` |
| `loran` | `/loran_ref_point.png` |
| `community` | `/help/community.png` |
| `labels` | `/help/labels.png` |

### `hbtn(id)` helper
Inline helper function that returns a **22×22px square button** matching the height of `ToolBtn`:
```jsx
<button className="w-[22px] h-[22px] flex items-center justify-center rounded border text-[11px] font-bold ...">?</button>
```
Clicking toggles `helpOpen` state. The `?` button is rendered in a `flex gap-1 items-stretch` row next to the feature button:
```jsx
<div className="flex gap-1 items-stretch">
  <div className="flex-1"><ToolBtn ...>Feature</ToolBtn></div>
  {hbtn("featureKey")}
</div>
```

### Help modal
`ReactDOM.createPortal` renders a centered modal (`fixed inset-0 z-[99999]`) with:
- Title from `HELP_CONFIG[id].title`
- Image (`maxHeight: 200`)
- Body text from `HELP_CONFIG[id].text`
- Special case: `loran` key renders hardcoded multi-paragraph text instead of `.text` field

---

## Overlays section (complete list)

| Button text | Prop | Help key | Pro? |
|---|---|---|---|
| Bathy | `showBathyLayer` | `bathy` | No |
| Currents | `showCurrents` | `currents` | Yes |
| SLA Overlay | `showAltimetryOverlay` | `altoverlay` | Yes |
| Loran Grid | `showLoranGrid` | `loran` | No |
| Community (N) | `showCommunityLayer` | `community` | No |
| Labels | `showCanyonLabels` | `labels` | No |

Community button shows active pin count: `Community (${communityCount ?? 0})`.

---

## Tools section (complete list)

| Button text | Prop | Help key | Pro? | Notes |
|---|---|---|---|---|
| Temp break | `showIsotherm` | `isotherm` | Yes | Only shown when `isSST` (not composite/CHL/alt) |
| Hot spots | `showHotspots` | `hotspots` | Yes | Species chip row appears when active |
| Wind overlay | `showWindOverlay` | `windoverlay` | Yes | Hidden entirely when `isWindMap` active |
| Bottom Features | `showWrecks` | `bottomfeat` | Yes | |
| Plan Trip | `tripMode` (via `onToggleTripMode`) | `trip` | Yes | |
| Real Time (GPS) | `gpsActive` (via `onToggleGps`) | `gps` | Yes | |

---

## Community section

- **"Access active"** badge: shown when `communityAccess?.hasAccess` is true
- **"+ Drop Live Pin"** button: calls `onDropLivePin` — solid emerald (`bg-emerald-600`)
- **"Top Anglers"** button: calls `onOpenLeaderboard` — slate background

The old "Post your first catch to unlock reports" / days-since-post message was **removed** (commit `e4ea5bb`). Do not restore it.

---

## Design rules

- **No icons on any buttons.** Text only. Functional close/chevron SVGs are acceptable.
- **No emojis** anywhere in the panel JSX (see CLAUDE.md §5).
- **All `ToolBtn` active states use `bg-cyan-700`** — do not add per-button color variants.
- **`hbtn()` must be square** (`w-[22px] h-[22px]`) — matches the height of `ToolBtn` so rows align.

---

## Props reference

```
// mode
interactionMode, setInteractionMode

// data layers
activeDataLayer, setActiveDataLayer
dataSource, setDataSource
compositeData, compositeGenerated, compositeDateIndex, setCompositeDateIndex, compositeDates
viirsData, viirsDateIndex, setViirsDateIndex, viirsHour, setViirsHour
murData, murDateIndex, setMurDateIndex
goesCompData, goesCompDateIndex, setGoesCompDateIndex, activeGoesCompDay
activeViirsNppDay, viirsNppData, viirsNppDateIndex, setViirsNppDateIndex
chlData, chlDateIndex, setChlDateIndex, chlLoading
seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading
windLoading
date

// gain / range
sstRange, onSstRangeChange, userId, rangeControlOpenRef
chlDataMin, chlDataMax, seaColorDataMin, seaColorDataMax

// tools
showIsotherm, setShowIsotherm
isothermalTargetTemp, setIsothermalTargetTemp   // default: 76°F
isothermalSensitivity, setIsothermalSensitivity // default: 2.0°F
effectiveTargetTemp, sstMin, sstMax
showHotspots, setShowHotspots
hotspotLoading
selectedFishSpecies, setSelectedFishSpecies
showWindOverlay, setShowWindOverlay
currentsLoading, showCurrents, setShowCurrents
showAltimetryOverlay, setShowAltimetryOverlay

// overlays
showBathyLayer, setShowBathyLayer
jsonContoursLoading
showWrecks, setShowWrecks
wrecksLoading
showCanyonLabels, setShowCanyonLabels
showLoranGrid, setShowLoranGrid

// tier
isPro   // true when tier === "pro" || tier === "trial"

// trip / gps
tripMode, onToggleTripMode
gpsActive, onToggleGps

// layout
collapsed, setCollapsed
windSliderHeight          // 80 when wind active, 0 otherwise (from SSTHeatmapLeaflet)
onPointerEnter, onPointerLeave, panelRef

// community
showCommunityLayer, setShowCommunityLayer
communityAccess           // { hasAccess: bool, ... }
communityCount
onOpenLeaderboard
onDropLivePin             // no onPostReport — post report button was removed
```

---

## Where `windSliderHeight` comes from

In `SSTHeatmapLeaflet.jsx`:
```js
const sliderHeight = windActive ? 80 : 0;
// ...
<MapControlPanel windSliderHeight={sliderHeight} ... />
```

This ensures the panel's `maxHeight` shrinks by 80px when the wind time slider is visible, preventing overlap.
