/**
 * Per-layer color-gain range persistence (localStorage).
 *
 * SSTRangeControl.jsx's "gain" slider drives one shared range value across
 * three data layers (SST, Chlorophyll, Sea Color). Before this module
 * existed, switching layers — or refreshing/reopening the app — always
 * snapped the gain back to that layer's hardcoded default, discarding
 * whatever the user had last dragged/loaded for it. These helpers let
 * SSTRangeControl recall the last range set for a given layer independent
 * of React state, so it survives layer switches and full page reloads.
 *
 * This is separate from the *named* saved presets in the `user_sst_ranges`
 * Supabase table (opt-in, per signed-in user, cross-device). This is an
 * unnamed, local, always-on "last used" memory — no sign-in required.
 */

const PREFIX = "sst_range_";

export function loadStoredRange(layer) {
  try {
    const raw = localStorage.getItem(PREFIX + layer);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.min === "number" && typeof parsed?.max === "number") {
      return { min: parsed.min, max: parsed.max, maskOutside: !!parsed.maskOutside };
    }
  } catch {
    // Corrupt or blocked storage (private browsing, quota) -- caller falls
    // back to that layer's default.
  }
  return null;
}

export function saveStoredRange(layer, range) {
  try {
    if (!range) {
      localStorage.removeItem(PREFIX + layer);
      return;
    }
    localStorage.setItem(PREFIX + layer, JSON.stringify({
      min: range.min, max: range.max, maskOutside: !!range.maskOutside,
    }));
  } catch {
    // Storage unavailable -- silently no-op, same as a cache miss.
  }
}

// Guards against a recalled range that no longer fits the layer's valid
// bounds (e.g. saved while the region or that day's live data bounds were
// different). Returns null (== "use the default") if out of range.
export function clampStoredRange(range, absMin, absMax) {
  if (!range) return null;
  if (typeof absMin !== "number" || typeof absMax !== "number") return range;
  if (range.min < absMin || range.max > absMax || range.min >= range.max) return null;
  return range;
}
