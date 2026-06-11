# CLAUDE.md — SST Fishing Map Project Rules

Read this file at the start of every session and before any multi-step task.

---

## 1. Dropbox Truncation — CRITICAL

**The core problem:** The Dropbox mount (`/sessions/.../mnt/SST Development/`) is a cloud-synced folder. When Claude writes or copies a large file to it, Dropbox may not have fully synced before the next operation reads it back — resulting in silently truncated files. This has caused repeated Vercel build failures.

### Rules

**Never** use the `Write` tool or `cp` to push a modified file directly from the sandbox into the Dropbox mount as a way to create a final deliverable for git. The Dropbox copy is unreliable for large files.

**Always** follow this workflow for any source file change:

1. **Get a clean base from git** — never edit the Dropbox copy:
   ```bash
   git show <last-good-commit>:path/to/file.jsx > /tmp/file_base.jsx
   ```

2. **Apply changes via Python patch script** — write the script to `/sessions/.../mnt/outputs/`, run it there, write output to `/sessions/.../mnt/outputs/file_patched.jsx`. Always `assert` every substitution succeeds and verify line count + last 5 lines at the end.

3. **Copy patched file into the fresh git clone** — the clone lives at `/tmp/sst_fresh/` and is NOT in Dropbox:
   ```bash
   cp /sessions/.../mnt/outputs/file_patched.jsx /tmp/sst_fresh/src/...
   ```

4. **Commit and push from the clone:**
   ```bash
   cd /tmp/sst_fresh
   git add <files>
   git commit -m "..."
   git push origin main
   ```

5. **Optionally copy back to Dropbox** after the commit is in git — this is safe because the authoritative copy is already in git.

### Additional rules
- Always verify the patched file ends with `}` (or the correct closing token) before committing.
- When multiple files need changes in one commit, patch all of them first, then `git add` all at once.
- Use `assert OLD in text, "FAIL: <description>"` in every patch script. If an assertion fails, stop and investigate before writing any output.
- After every push, check the Vercel build result using `list_deployments` + `get_deployment_build_logs`. If the deployment is ERROR, fix the build failure and redeploy before doing any other work. Never leave a broken build unresolved.

---

## 2. Editing Existing Files

- **Read the file from Dropbox first** using the `Read` tool before any `Edit` call — the Read tool downloads the current cloud version. Never assume the in-context version is current.
- For small targeted changes (< 5 lines), use the `Edit` tool directly on the Dropbox path after reading.
- For large or structural changes (whole sections, multiple insertions), use the Python patch script workflow above.

---

## 3. Git Workflow

- The production repo is `jlintvet/SSTProductionRepo` (main branch). Vercel auto-deploys on push.
- The fresh clone at `/tmp/sst_fresh/` contains the GitHub token in the remote URL. Reuse it across shell calls rather than re-cloning.
- If `/tmp/sst_fresh/` is missing or stale, re-clone:
  ```bash
  TOKEN=<from existing remote or user>
  git clone https://$TOKEN@github.com/jlintvet/SSTProductionRepo.git /tmp/sst_fresh
  ```
- Always `git fetch origin main && git reset --hard origin/main` at the start of a session before making changes.
- Stale `.git/index.lock` in the Dropbox `.git/` folder cannot be removed — never run git commands against the Dropbox path. Always use `/tmp/sst_fresh/`.
- GitHub API (REST) returns 403 from the sandbox — use git clone/push only.

---

## 4. Reference Docs — Read Before Related Work

| Topic | File |
|---|---|
| SST/CHL/VIIRS rendering pipeline, Leaflet layer architecture | `SST_RENDERING.md` |
| Viewport fill-zoom, grey-bar bugs, Mercator center math | `docs/map_viewport_nuances.md` |
| Weather forecast display, departure location selection | `docs/weather-and-location-display.md` |
| Community reports feature spec, UX flows, access rules | `community-reports-requirements.md` |

**Rule:** Before making changes to any of the following areas, read the corresponding doc:
- Anything touching `SSTHeatmapLeaflet.jsx` viewport, zoom, or overlay rendering → read `SST_RENDERING.md` and `docs/map_viewport_nuances.md`
- Anything touching community pins, access gates, leaderboard, tips → read `community-reports-requirements.md`
- Anything touching weather widget or departure location → read `docs/weather-and-location-display.md`

---

## 5. Design Rules

- **No emojis or decorative icons in UI code.** Do not use emoji characters or icon components (e.g. Trophy, medal emojis, decorative symbols) in JSX. Use clean text, numbers, and color to convey meaning. Functional icons (X close button, chevrons) are acceptable.

---

## 6. Architecture Quick Reference

- **Frontend:** React/Vite, Base44 scaffold, Tailwind, Leaflet. Main page: `src/pages/SSTLive.jsx`. Map component: `src/components/SSTHeatmapLeaflet.jsx`.
- **Auth + DB:** Supabase (auth, RLS, realtime). Client at `src/lib/supabase.js`.
- **Data:** Python backend on GitHub Actions writes JSON to `jlintvet/SSTv2` repo. Frontend fetches raw URLs from that repo.
- **Deploy:** Vercel auto-deploys `jlintvet/SSTProductionRepo` main branch.
- **Sole developer:** Jon — no PRs, direct pushes to main only.
- **isPro check:** `tier === "pro" || tier === "trial"` from `useRegionAccess` hook.

---

## 7. Community Feature Rules

- DB column is `is_flagged` (not `flagged`) on `community_locations`.
- Access gate: post within 30 days OR isPro → `hasAccess: true`.
- Pin types: `live` (5000 pts, 24h expiry) and `report` (1000 pts, 7d expiry).
- When `onPostCommunityReport` is called **without** lat/lon (from control panel), enter `communityPinDrop` mode — show banner, crosshair cursor, intercept next map click