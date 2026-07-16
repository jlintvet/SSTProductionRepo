# Ambassador Program

## Overview

Ambassadors are active anglers in the trade — captains, mates, and industry folks — who use the app, contribute to the community, and help evangelize RipLoc. In exchange, they get free Pro access and their own referral code to share, which gives whoever redeems it a free year of Pro too.

The referral-code system is self-service as of July 2026: ambassadors set their own code and see who's redeemed it directly in Settings, without asking Jon. Jon still controls who becomes an ambassador and can suspend a code from the admin panel.

---

## Benefits

- **Free Pro access** for the ambassador themselves, indefinite while `tier = "ambassador"`
- **A referral code** they choose and can change any time, good for **up to 6 redemptions** (unlimited for admin-owned codes — see Redemption limit & code history below)
- Anyone who redeems the code gets **a free year of Pro** (`tier = "referral"`, `referral_end = now() + 365 days`)
- No payment required — ever, as long as they remain active

---

## Requirements

The only requirement is **active community involvement and contribution**: posting community pins, engaging with the platform, and generally being a presence in the fishing community that reflects well on RipLoc. There is no formal metric — it's discretionary, decided by Jon via the admin panel.

---

## How it works end-to-end

1. **Jon promotes a user to ambassador** in the admin panel (`admin/user_admin.html`) by setting their Tier to `ambassador` and Save. A DB trigger (`generate_ambassador_code`, live in Supabase only — not in this repo) auto-fills a starter code the first time someone's tier flips to `ambassador` (pattern: `<name-or-email-prefix>thankyou`, de-duped with a numeric suffix if taken).
2. **The ambassador sets/changes their own code** in Settings → Ambassador section (`src/components/auth/UserSettingsModal.jsx`), which calls the `set_my_referral_code(p_code)` RPC. Codes must be 4-30 lowercase letters/numbers, no spaces or symbols.
3. **Someone redeems the code** via the "Referral Code" section in their own Settings (shown to anyone who isn't already `pro` or `ambassador`), which calls `redeem_referral_code(p_code)`.
4. `redeem_referral_code` (live in Supabase only, see `ambassador-self-service.sql` for the current definition) checks: the code exists and belongs to an ambassador, `ambassador_status = 'active'`, fewer than 6 people have already redeemed it (skipped entirely for admin-owned codes — see below), and the redeemer hasn't already redeemed a code. On success it sets the redeemer's `tier = 'referral'`, stamps `referred_by` with the code string (a snapshot, not a live link), and sets `referral_end = now() + 365 days`.
5. **The ambassador sees who's redeemed their code** in the same Settings section (calls `get_my_referrals()`), and **Jon sees the same list plus can bulk-email them** from the admin panel's Ambassador section (calls the `admin-send-email` edge function).

---

## Tier & status

Ambassadors use `tier = "ambassador"` in `user_profiles`. This is handled in `src/hooks/useRegionAccess.js`:

- `isPro = true` (full Pro feature access)
- No expiry, no countdown, no `trial_end` date
- Immune to `subscription_status = "cancelled"` downgrade
- `daysLeft = null`, `isExpired = false`

Separately, `user_profiles.ambassador_status` (`active` / `suspended` / `inactive`) controls whether their code can still be redeemed — it does **not** affect their own Pro access. Only `redeem_referral_code` checks it (a redeemer gets "This referral code is not currently active" if it isn't `active`). Set from the admin panel's Ambassador Status dropdown.

To grant/revoke ambassador tier directly in SQL (the admin panel does this too):

```sql
UPDATE user_profiles SET tier = 'ambassador' WHERE id = (SELECT id FROM auth.users WHERE email = 'their@email.com');
UPDATE user_profiles SET tier = 'standard'   WHERE id = (SELECT id FROM auth.users WHERE email = 'their@email.com');
```

---

## Redemption limit & code history

Each code caps out at **6 redemptions** (hardcoded in `redeem_referral_code`) — **except codes owned by an admin account** (`jlintvet@gmail.com`, `jlintvet@butterpayments.com` — the same `ADMIN_EMAILS` list used by `user_admin.html` and the `protect_sensitive_profile_cols`/RLS admin checks), which are unlimited. `redeem_referral_code` looks up the ambassador's `email` alongside their code and skips the redemption-count check entirely when it matches one of those two addresses (fixed 2026-07-16, migration `redeem_referral_code_unlimited_for_admins`). Redeemed users are counted by matching `user_profiles.referred_by` against the code string, so the cap (where it applies) is really "6 redemptions per code string," not per ambassador — if a non-admin ambassador changes their code, the new code gets its own fresh count of 6.

**If a new admin account is added to `ADMIN_EMAILS` elsewhere in this app, it is not automatically unlimited here** — `redeem_referral_code`'s email list is a separate hardcoded copy of the same two addresses, not a shared constant. Update it directly in Supabase (or via a new migration) if the admin list ever changes.

Because `referred_by` stores the code as a plain-text snapshot at redemption time (not a link back to the ambassador's user id), changing your code would normally make earlier referrals invisible. `ambassador_code_history` (one row per retired code, written by `set_my_referral_code`) prevents that — both `get_my_referrals()` and the admin panel match against every code an ambassador has ever had, current or past.

---

## Known-fixed issue: `referred_by` column type (fixed 2026-07-16)

`referred_by` was originally created as `uuid` (with a foreign key to `auth.users(id)`) in `ambassador-schema.sql`, but every piece of code that reads or writes it — `redeem_referral_code`, `get_my_referrals`, and the admin panel's referral list — has always treated it as the ambassador's plain-text code, not a uuid. This went undetected because the column had zero non-null rows in production until the first real redemption was actually attempted, which failed outright with `operator does not exist: uuid = text` on `redeem_referral_code`'s own `WHERE referred_by = v_ambassador_code` check. `get_my_referrals()`'s `lower(p.referred_by)` call has the identical latent bug and would have failed the same way the first time anyone had a referral to list.

Fixed by dropping the stale FK and changing the column to `text` (safe — the column was empty in production at the time). The fix now lives as a guarded, re-runnable `DO $$ ... $$` block in `ambassador-self-service.sql`, so re-running that file against any environment (including a fresh one seeded from `ambassador-schema.sql`) still ends up correct. **If this ever resurfaces** — e.g. a fresh Supabase project seeded only from `ambassador-schema.sql` without also running `ambassador-self-service.sql` — the symptom is the exact same `operator does not exist: uuid = text` error on first redemption attempt.

---

## Deprecated: `ambassadors` / `ambassador_referrals` tables

`ambassador-schema.sql` also defines an `ambassadors` table (per-ambassador stats: total referrals, commission, payouts) and an `ambassador_referrals` link table. **These are unused** — confirmed by reading the live `redeem_referral_code` function directly from Supabase, which only ever reads/writes `user_profiles` columns. As of writing, both tables have zero rows in production. Don't build new features against them without first re-verifying they're still dead; if a real commission/payout system gets built, it should probably replace this rather than resurrect it as-is.

---

## Application form (separate from the referral system)

The public "apply to be an ambassador" form lives on the landing page (`src/pages/LandingPage.jsx`, `submitAmbassador()`) and inserts into the `ambassador_applications` table — this is just an interest form, unrelated to `tier`/`referral_code`. Jon reviews applications manually and promotes people via the admin panel if he decides to move forward. See `[[project_ambassador_form_incident]]`-style context: this table's RLS `public_insert` policy is a manual-apply script in `ambassador-schema.sql` and needs to actually be run against prod, not just committed to the repo.

---

## Reference

| File | Purpose |
|---|---|
| `src/hooks/useRegionAccess.js` | Tier logic — ambassador branch (`isPro`, no expiry) |
| `src/components/auth/UserSettingsModal.jsx` | Self-service: set your own code, view redeemers, redeem someone else's code |
| `admin/user_admin.html` | Admin: promote to ambassador, set/edit code, set status, view redeemers, bulk email |
| `src/pages/LandingPage.jsx` | Public "apply to be an ambassador" interest form (`rl-amb-sec`) |
| `ambassador-schema.sql` | Base columns on `user_profiles` (`referral_code`, `referred_by`, `ambassador_status`) + `ambassador_applications` table + the unused `ambassadors`/`ambassador_referrals` tables. **`referred_by`'s declared type here (`uuid`) is historically wrong** — see the Known-fixed issue above; the real fix lives in `ambassador-self-service.sql`, run that file after this one |
| `ambassador-admin-policies.sql` | Admin RLS policies (mostly superseded now that the admin panel reads/writes `user_profiles` directly instead of the dead tables) |
| `ambassador-self-service.sql` | `set_my_referral_code`, `get_my_referrals`, `ambassador_code_history`, the current `redeem_referral_code` definition, and the `referred_by` uuid→text column fix |
| `supabase/functions/admin-send-email/index.ts` | Admin-only Resend sender used to email an ambassador's redeemers in bulk |
| Supabase table `ambassador_applications` | Raw interest-form submissions |
| Supabase table `user_profiles` | `tier`, `referral_code`, `referred_by`, `ambassador_status`, `referral_end` |
| Supabase table `ambassador_code_history` | Past codes per ambassador, so redeemer history survives a code change |
| Supabase function `redeem_referral_code` (live only) | Validates and applies a redemption |
| Supabase function `generate_ambassador_code` (live only) | Trigger: auto-fills a starter code on first promotion to ambassador |
