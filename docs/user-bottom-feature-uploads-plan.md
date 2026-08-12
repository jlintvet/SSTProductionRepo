# User Bulk Bottom-Feature Upload

Status: shipped and live in production (2026-08-11). This doc describes the feature as built, not a forward-looking plan — see the "History" section at the bottom for the commits involved if you need the original design rationale.

## 1. What it does

A signed-in user can upload their own bottom-feature list — a Navionics data card export, chartplotter GPX, or a hand-built CSV/KML — from Settings > My Imported Spots. The imported spots render on the map in the existing Bottom Features layer, visually distinct (cyan dot, "YOUR IMPORT" badge on the detail card) from the shared public `wrecks.json` dataset, and are **always private to the uploading user** — never shared with, or visible to, anyone else. An All/Mine toggle next to the Bottom Features control filters the layer to just the user's own spots.

## 2. Data model

Two Supabase tables, both owner-only RLS (`auth.uid() = user_id`) plus an admin-read-only carve-out (email-gated, same pattern as `wreck_photos`) that exists so a future manual tool could review and promote a user's spot into the shared `wrecks.json` — that promotion tool does not exist yet; the carve-out just avoids a schema change if/when it's built.

**`user_bottom_feature_batches`** — one row per upload action:
```
id uuid pk, user_id uuid, file_name text, mode text ('add'|'replace'),
row_count int, superseded_batch_ids uuid[], reverted bool, created_at
```

**`user_bottom_features`** — one row per imported spot:
```
id uuid pk, user_id uuid, name text, lat/lon double precision,
type text, symbol text ('Wreck'|'Rocks'), depth_ft numeric, notes text,
source text (constant 'user_upload'), source_file_name text,
upload_batch_id uuid, deactivated_by_batch_id uuid, active bool,
promoted bool, created_at
```

Both live on Supabase project `upxerlzdgdbjkbjpuktn`.

## 3. Revert (one level of undo)

Every upload creates a batch row. A **replace** upload soft-deactivates the user's previously-active rows (`active = false`, `deactivated_by_batch_id` = the new batch's id) and records which batch ids it superseded. An **add** upload just inserts new rows under a new batch, deactivating nothing.

Only the single most recent, not-yet-reverted batch can be reverted — this is one level of undo, not a full history stack. Reverting deletes that batch's inserted rows and reactivates whatever it deactivated, then marks the batch `reverted = true`. Surfaced as a "Revert" button next to the top entry in Settings' upload-history list.

## 4. File formats accepted

`.gpx`, `.csv`, `.kml` — parsed entirely client-side in the browser (`src/lib/userBottomFeatureImport.js`), nothing hits the network until the user confirms the import.

- **GPX**: `<wpt lat lon><name/><desc/><sym/></wpt>`. The parser is **regex-based, not DOMParser-based** — real-world exports from at least one common source (fishingstatus.com) have been observed missing the closing `</wpt>` tag on the last waypoint in the file, which makes the document invalid XML. A strict XML parser fails the *entire* file over that one dangling tag; the regex parser instead bounds each waypoint by the next `<wpt ` occurrence (or end of file), so one malformed/truncated tag anywhere can't take down the rest of a real import. `<sym>` (or Garmin's `gpxx:Symbol`) maps to `wreck`/`reef`/`rock`/`structure`/`other`.
- **CSV**: flexible header matching (`name`, `lat`/`latitude`, `lon`/`lng`/`longitude`, `type`, `depth_ft`/`depth`, `notes`), quoted-field support. A downloadable template is linked from the upload UI.
- **KML**: `<Placemark><name/><description/><Point><coordinates>lon,lat</coordinates></Point></Placemark>`. No standard wreck/rock symbol vocabulary in KML, so type is best-effort guessed from name/description keywords.

Shared validation regardless of format: coordinate bounds sanity check (roughly the app's full coverage area, not a precise per-region filter), a 2,000-row cap per single upload, a 5,000-row cap total per user, and de-dupe by rounded name+coordinate both within a file and (in "add" mode) against the user's existing spots.

## 5. Settings UI flow

`src/components/auth/UserSettingsModal.jsx`, "My Imported Spots" section:
1. Upload a file → parsed client-side → preview shown (row count, first 10 names, any skipped-row reasons shown verbatim, not just a generic count).
2. If the user already has imported spots, they're asked explicitly each time: **Replace my list** or **Add to my list** — no silent default.
3. Batch history list (most recent first) with a Revert button on the top entry only.
4. "Clear all my imported spots" — full reset, separate from revert.

## 6. Map rendering

`src/components/SSTHeatmapLeaflet.jsx`: the user's own active spots (fetched via `src/hooks/useUserBottomFeatures.js`) are merged into the existing wreck-marker render loop alongside the public `wrecks.json` features, filtered by the `wreckViewMode` state ("all" | "mine"). User-uploaded markers render in cyan instead of the public dataset's pale color, and the detail card shows a "YOUR IMPORT" badge when `properties.source === "user_upload"`. Unlike public wrecks, a user's own spots are **not** filtered by `regionBounds` — it's a small, private, explicitly-imported set, so all of it renders whenever the layer is on, regardless of the selected departure port.

`src/components/MapControlPanel.jsx` (desktop) and the mobile duplicate block inside `SSTHeatmapLeaflet.jsx` both get an All/Mine segmented toggle next to the existing Bottom Features button, only shown once the user actually has imported spots.

Settings dispatches a `riploc:user-bottom-features-updated` custom event after any upload/revert/clear so the already-mounted map component can refetch without a full page reload.

## 7. Files touched

- New: `src/lib/userBottomFeatureImport.js`, `src/hooks/useUserBottomFeatures.js`
- Modified: `src/components/auth/UserSettingsModal.jsx`, `src/components/SSTHeatmapLeaflet.jsx`, `src/components/MapControlPanel.jsx`

## 8. Known limitations / not built

- No sharing of a user's uploads with other users, by design.
- No promotion tool into the shared `wrecks.json` yet (the `promoted` column and admin-read RLS policy exist for this, unused so far).
- No per-row editing — only whole-batch replace/add/clear.
- `SSTHeatmapMapbox.jsx` (an experimental, not-production-wired alternate map renderer from an earlier GL-basemap spike) does **not** have this feature — it isn't imported by `SSTLive.jsx` and isn't part of the deployed app.

## History

- `3437a24` (2026-08-11) — initial ship: tables, parsers, Settings UI, map rendering, All/Mine toggle, revert.
- `d88b515` (2026-08-11) — fixed the GPX-parser-fails-on-truncated-export bug described in §4, and fixed a misleading Settings error message that showed a whole-file parse failure as a generic per-row "skipped" count.
