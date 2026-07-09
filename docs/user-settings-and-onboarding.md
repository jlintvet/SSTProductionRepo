# User Settings Modal & Onboarding Carousel

Files: `src/components/auth/UserSettingsModal.jsx`, `src/components/auth/UserMenu.jsx`, `src/components/OnboardingCarousel.jsx`

---

## UserSettingsModal

### Region Picker flow

The Fishing Region section has a "Change" button that opens `RegionPickerInline` inline within the modal.

**Selecting a region:**
- Clicking a region card immediately calls `supabase.from("user_profiles").update({ region: key })`, sets `sessionStorage.setItem("riploc.reopenSettingsAfterReload", "1")`, and calls `window.location.reload()`.
- No "Save Settings" click is required for region changes — they save and reload instantly.
- After the reload, `UserMenu` reads the sessionStorage flag on mount (`useEffect []`) and calls `setShowSettings(true)` to reopen Settings automatically.

**Cancelling the picker (without selecting):**
- The picker has NO Cancel button of its own. The footer Cancel becomes "Back" when the picker is open and calls `setShowRegionPicker(false)` — keeping the user in Settings.
- The footer Cancel only calls `onClose()` when the picker is NOT showing.

```jsx
// Footer Cancel logic
onClick={showRegionPicker ? () => setShowRegionPicker(false) : onClose}
// Label
{showRegionPicker ? "Back" : "Cancel"}
```

**Why a full page reload?**
Region drives `regionConfig`, data URLs, bounds, and location lists throughout the app. Hot-swapping these at runtime would require coordinating AppContext, all data fetchers, and the Leaflet map. A reload is simpler and reliable.

---

### Ambassador code save

The ambassador referral code field (visible only to `tier === "ambassador"` users) is saved as part of the main "Save Settings" button — no separate save action. Logic in `handleSave`:

```js
const codeChanged = referral.tier === "ambassador" &&
  ambCodeInput.trim() &&
  ambCodeInput.trim().toLowerCase() !== (referral.referral_code || "");
if (codeChanged) saves.push(supabase.rpc("set_my_referral_code", { p_code: ambCodeInput.trim().toLowerCase() }));
```

Errors surface as `ambCodeError` state displayed inline below the input.

---

### reopenSettingsAfterReload flag

| Step | Where |
|---|---|
| Set | `UserSettingsModal.handleSave()` before `window.location.reload()` |
| Read + cleared | `UserMenu` `useEffect([], [])` on mount — calls `setShowSettings(true)` if flag is `"1"` |
| Modal renders | `{showSettings && userId && <UserSettingsModal />}` in UserMenu JSX |

If `userId` from AppContext hasn't resolved yet when the flag is read, `showSettings` will still be `true` — the modal opens as soon as `userId` becomes available on the same render.

---

## OnboardingCarousel

### Overview

`OnboardingCarousel` is a portal-rendered fullscreen modal triggered for new users on first login and re-launchable from any component via:

```js
document.dispatchEvent(new CustomEvent("riploc:start-tour"));
```

`SSTLive.jsx` listens for this event and sets `showOnboarding = true`. Completion marks `has_seen_onboarding = true` in `user_profiles`.

### SLIDES array

Each slide:
```js
{
  id: "unique-id",
  title: "Slide Title",
  caption: "Body copy shown below the video.",
  videoUrl: "https://riploc-storage.s3.us-east-2.amazonaws.com/Video+Name.mp4",  // null = placeholder
  posterUrl: "/onboarding-poster-filename.jpg",  // shown before play; omit if no poster
}
```

**Adding a new slide with video:**
1. Upload video to S3 bucket `riploc-storage` (us-east-2). URL pattern: `https://riploc-storage.s3.us-east-2.amazonaws.com/File+Name.mp4` (spaces → `+`).
2. Extract poster frame: `ffmpeg -ss 2 -i /path/to/local/video.mp4 -frames:v 1 -q:v 2 src/public/onboarding-<id>-poster.jpg` (requires local copy; S3 returns 403 from sandbox).
3. Alternatively, convert a screenshot: `python3 -c "from PIL import Image; Image.open('shot.png').convert('RGB').save('poster.jpg', quality=85)"` then save to `src/public/`.
4. Add `posterUrl: "/onboarding-<id>-poster.jpg"` to the slide entry.
5. Commit both `OnboardingCarousel.jsx` and the new poster file.

**Poster files** live in `src/public/` (Vite `publicDir`) and are served at `/filename.jpg` in production.

### Audio default

```js
const [muted, setMuted] = useState(false);  // audio ON by default
```

### Current slide lineup (as of commit `bafad84`)

| # | id | title | video |
|---|---|---|---|
| 1 | welcome | Welcome to RipLoc | RipLoc+Layout.mp4 |
| 2 | control-panel | Navigating the Control Panel | Overview+of+App+Navigation+and+Controls.mp4 |
| 3 | sst-map | Our Data Sources Explained | RipLoc+Source+Data.mp4 |
| 4 | data-sources | User Settings | RipLoc+User+Settings.mp4 |
| 5–11 | temp-break … weather | (placeholder — no video yet) | null |

Slides 5–11 show a numbered placeholder until a `videoUrl` is set.
