# MapControlPanel Reference

**File:** `src/components/MapControlPanel.jsx`  
**Current commit:** `7ed241e` (as of 2026-07-22)

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
Used for SST sub-sources (Daily / Hourly / Composite 36h) **and CHL / Sea color sub-sources (Daily / Composite)**. Active state is `bg-violet-50 text-violet-700`.

### `ToolBtn`
Used for all Overlay and Tool toggle buttons. **All active states are the same color: `bg-cyan-700 text-white border-cyan-700`.** Do NOT add per-button color variants — the user explicitly standardized this.

### `SectionHeader`
Collapsible section header with chevron. Takes `title`, `open`, `onToggle`.

### `DateNav`
Date navigator with `‹` / `›` arrows. Used beneath layer buttons when multiple dates exist. Takes `label`, `onPrev`, `onNext`, `disablePrev`, `disableNext`, `color`, and (as of `4765190`/`7790ea5`) optional `onPlay`/`playing` -- when `onPlay` is passed, a `Play`/`Pause` icon button (lucide-react, solid fill, not the Unicode ▶/⏸ glyphs -- those render as full-color emoji buttons on some platforms/fonts) renders after the `›` arrow.

`color` is effectively decorative-only: `labelColors` only ever defines a `cyan` entry (`text-cyan-700 bg-cyan-50`), so every DateNav call in this file renders the same cyan pill no matter what `color` value is passed -- the CHL/Sea color sub-sections below explicitly pass `color="cyan"` too, despite what older notes in this doc said about green/teal.

### `IsothermSubControls`
Temp range slider + sharpness slider that appears inline when Temp Break is active. The parent `effectiveTargetTemp` value clamps to `[sstMin, sstMax]` before rendering.

### `Divider`
`<div className="border-t border-slate-100 mx-0" />`

---

## Section order (top to bottom)

1. **Header** — "Controls" label + collapse button. The chevron SVG points **right** (`M4.5 2L8.5 6L4.5 10`), matching the direction the panel collapses (into the icon rail on the right edge) -- it pointed left until `e999790` (2026-07-22), which read backwards. The header div is `sticky top-0 z-10 bg-white/95 backdrop-blur-sm` (same commit) so it stays pinned while the panel body scrolls, instead of scrolling away and forcing a scroll back up just to collapse.
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
| `shadedrelief` | `/help/bathy.png` (reused — no dedicated image) |
| `radar` | `/help/radar.png` (doesn't exist yet — 404s silently, text-only help popup) |

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

## CHL and Sea color sub-sources

Both the Chlorophyll and Sea color layer buttons expand to show a Daily / Composite row of `SubSourceBtn`s when that layer is active.

**Daily sub-source:** Shows `DateNav` when `chlData.days.length > 1`, letting the user step through available daily bundle dates.

**Composite sub-source:** Shows `DateNav` whose label is the built date (`day.builtDate` = `composite.generated` sliced to YYYY-MM-DD). Prev/next step through `chlCompositeDates` / `seaColorCompositeDates` (dated composite snapshots kept for `COMPOSITE_KEEP_DAYS = 7` days by the bundler). Arrows are disabled when at the oldest/newest available composite. Until multiple dated composites exist (i.e. after the first 2 days of bundler runs) both arrows will be disabled — only one date available.

**Do not show a static badge** (e.g. "N passes · 5d gap-fill") in the composite section. The built date from `DateNav` is the only label. Pass count was deliberately removed.

**Color convention:** both CHL and Sea color sub-source `DateNav` calls pass `color="cyan"` -- same as every other `DateNav` in this panel (see the `DateNav` note above). There is no green/teal `DateNav` variant; `labelColors` only defines `cyan`. (Green/teal do appear elsewhere -- e.g. `SubSourceBtn`'s own active-state styling -- but not on the date pill itself.)

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
| Shaded Relief | `showBathyRaster` | `shadedrelief` | Yes | Full basemap-replace mode — fully hides SST/CHL/composite/seacolor/altimetry rendering while active (see `SST_RENDERING.md`). Mutually exclusive with Radar in both directions. Auto-dismissed by every data-source `onClick` in the Data layer section (desktop `MapControlPanel.jsx`) and, as of `b360530`, by every mobile data-source control in `SSTHeatmapLeaflet.jsx` too — the mobile icons/sub-source buttons previously only called `setActiveDataLayer`/`setDataSource` and left Radar/Shaded Relief tiles on screen after switching sources. |
| Radar | `showRadarOverlay` | `radar` | Yes | Same full basemap-replace pattern as Shaded Relief (mutually exclusive with it). Live RainViewer tiles, all regions, desktop + mobile (mobile button added `82b2006`). Renders a bottom time-scrub bar (`TimeScrubber.jsx`, shared with Wind) when frames are loaded — see `SST_RENDERING.md` for the fetch/crossfade/pane details and the mobile weather-sheet z-index fix (`5ad7c57`). |
| Plan Trip | `tripMode` (via `onToggleTripMode`) | `trip` | Yes | |
| Real Time (GPS) | `gpsActive` (via `onToggleGps`) | `gps` | Yes | |

---

## Desktop collapsed icon rail

When `collapsed` is true, `MapControlPanel` itself renders `null` (see Overview), and `SSTHeatmapLeaflet.jsx` shows a `hidden sm:flex` column of 32×32px icon buttons in its place, fixed at `right: 8, top: 8`. This rail was built up incrementally (`aa0b89a` through `e999790`, 2026-07-22) to reach icon parity with the mobile floating rail -- both now expose the same set of layer toggles and action buttons, just in a vertical column instead of mobile's own floating layout.

**Current top-to-bottom order:** Expand (re-open panel), SST, CHL, SC (Sea Color), ALT (Altimetry), Wind, CUR (Currents), TLS (Tools), Plan Trip, divider, Pan, Inspect, Saved, COM (Community), Live Report, Leaderboard, Real Time GPS.

- **TLS** re-opens the panel (`setPanelCollapsed(false)`) and, after a short `setTimeout` (the panel has to remount before the section exists in the DOM), scrolls the reopened panel to `#mcp-tools-section` -- the `id` tagged on the Tools `SectionHeader` call specifically for this purpose. Every other icon here just reopens the panel at the top; TLS is the only one with scroll-to-section behavior.
- **Plan Trip** sits directly below TLS (both here and in the mobile rail) -- moved there `e999790` per an explicit layout request; it previously sat lower, after Leaderboard, in both rails.
- **No Help & feedback icon on this desktop rail.** `TopBar.jsx` already renders a `LifeBuoy` Help button that's `hidden sm:flex` -- i.e. visible only at the `sm`+ breakpoint (desktop), the exact inverse of this rail's own `sm:hidden`-complement mobile rail. Duplicating Help here would be redundant on desktop; removed `e999790`. Mobile's floating rail keeps its own Help icon since mobile has no other Help entry point.

## Mobile Tools icon

The mobile floating Tools icon (`mobilePanel === "tools"` trigger, top-right icon column in `SSTHeatmapLeaflet.jsx`) is a `TLS` text label as of `b360530`, matching the SST/CHL/SC/ALT text-button style. It was previously a circle+arc SVG that read as an ambiguous dot symbol.

## Compact day/hour nav bar (`dayNavContent`, shared by mobile + desktop)

**File:** `src/components/SSTHeatmapLeaflet.jsx`, not `MapControlPanel.jsx` -- this bar is a lightweight alternative to the full panel/drawer, not part of it.

Originally mobile-only (`f21b9c0`, positioning refined `7466ec6`); as of `5a103e9` (2026-07-17) the prev/date/next content-building logic for every layer (VIIRS+hour, MUR, composite, CHL daily/composite, Sea Color daily/composite, Altimetry) was extracted into a single `dayNavContent` computation (a `useMemo`-less IIFE recomputed each render), so both bars render identical content instead of maintaining two copies:

- **Mobile bar** (`showMobileSourceNav && !mobilePanel`): shown after picking a secondary source (SST Cloud Free/Hourly/HD Composite, CHL/Sea Color Daily/HD Composite) closes the full 45vh drawer. Inset (`left-2 right-2`, rounded corners, `zIndex:1500`), sitting at `bottom: calc(60px + env(safe-area-inset-bottom, 0px))` (lowered from an original `104px` offset in `e9ef3c5`, 2026-07-17, to clear the 56px `WeatherBottomSheet` peek bar without floating an extra ~48px above it). `showMobileSourceNav` is only ever set `true` and never explicitly reset -- visibility is derived from `!mobilePanel` plus a valid source. Don't add a `setShowMobileSourceNav(false)` call when reopening the drawer; that reintroduces a bug where collapsing the reopened drawer left neither UI visible (fixed `7466ec6`).
- **Desktop bar** (`panelCollapsed && dayNavContent.content`, added `5a103e9`, widened/centered `2ec65a9`): shown when the sidebar is collapsed, centered horizontally (`left:50%`, `translateX(-50%)`, width `480` capped at `calc(100% - 96px)`), sitting at `bottom: sliderHeight + 8` -- matching the Locations button's own offset (lowered from `+52` in `aa0b89a`, 2026-07-17).

Both bars end with a "more options" ⋮ button: mobile's reopens the full drawer (`setMobilePanel(dayNavContent.reopenPanel)`); desktop's reopens the full panel (`setPanelCollapsed(false)`). Renders nothing (`content` stays `null`) for layer/source combos with no date list to page through (single-day data, Wind).

**Play/pause (`4765190`/`7790ea5`):** every branch with more than one date/composite gets a play/pause button (lucide-react `Play`/`Pause`, solid-fill SVG -- not the Unicode ▶/⏸ glyphs, which render as full-color emoji buttons on some platforms/fonts), reusing the existing `set{X}Playing` booleans already wired to each layer's autoplay interval in `SSTLive.jsx`.

**VIIRS hour nav rolls into adjacent days (`7ed241e`, 2026-07-22):** the VIIRS branch's hour `‹`/`›` buttons used to clamp against the current day's own `available_hours` array and simply disable at the first/last hour. `SSTLive.jsx`'s autoplay loop (`sstAdvanceFn`) already rolled hours into the next day when playing, but manual clicks never had that logic. `goPrevHour`/`goNextHour` (defined inline in the VIIRS branch) now fall through to the adjacent day's last/first available hour when at an hour boundary; the buttons only disable when there's truly no adjacent day left (`atFirstHour && !hasPrevDay` / `atLastHour && !hasNextDay`).

**Uniform button height (`7ed241e`, 2026-07-22):** every button/pill in the bar used to size itself off `py-1.5` padding plus its own font-size's line-height, and the row uses `items-center` (not `stretch`) -- so a `text-[10px]` pill (Day nav, date/hour labels) rendered visibly shorter than a `text-sm` button (chevrons, play) next to it. Every element is now a fixed `h-8` box: buttons use `flex items-center justify-center` to center content regardless of font size; the truncating date/hour label pills use `leading-8` instead (a flex container on the label itself would break `truncate`'s text-overflow ellipsis). Apply the same `h-8` + centering pattern to any new element added to this bar, rather than relying on padding to size it.

**Color convention:** all date/hour label pills in this bar use `text-cyan-700 bg-cyan-50` (standardized `26b1b3a`, 2026-07-17) -- they used to be ad hoc violet (VIIRS/composite/Altimetry), green (CHL), teal (Sea Color), indigo (GOES), which didn't match the large panel's own uniformly-cyan `DateNav` convention (see the `DateNav` note above).

**Legend top-alignment (`3a5c2ab`):** the mobile legend/gradient wrapper (`right:44, bottom:64, zIndex:600`, further down this file) renders one of three different components depending on `activeDataLayer` — `SSTLegend` (bare text + a `height:20` bar, no card chrome, ~20px total) for SST, or `MobileGradientBar` (bordered/padded card, ~29px) for CHL/Sea Color. Left auto-height, the wrapper's visible top edge landed ~9px higher for SST than for CHL/Sea Color, making the gap to the source-nav bar above it look inconsistent (Jon reported this on 2026-07-14). Fixed by wrapping each branch in its own fixed-height (`32px`), top-aligned (`items-start`) flex box, so all three legends' visible top edges land at the same offset regardless of the underlying component's natural height. If a 4th legend variant is ever added here, wrap it the same way rather than leaving it bare.

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
chlSource, setChlSource                               // "daily" | "composite"
chlCompositeDates, chlCompositeDateIndex, setChlCompositeDateIndex
seaColorData, seaColorDateIndex, setSeaColorDateIndex, seaColorLoading
seaColorSource, setSeaColorSource                     // "daily" | "composite"
seaColorCompositeDates, seaColorCompositeDateIndex, setSeaColorCompositeDateIndex
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
showBathyRaster, setShowBathyRaster             // Shaded Relief — full basemap-replace, mutually exclusive with Radar
showRadarOverlay, setShowRadarOverlay           // Radar — full basemap-replace, mutually exclusive with Shaded Relief

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
