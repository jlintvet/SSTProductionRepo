# Ambassador Program

## Overview

Ambassadors are active anglers in the trade — captains, mates, and industry folks — who use the app, contribute to the community, and help evangelize RipLoc. In exchange, they get free pro access and the ability to gift pro subscriptions to their network.

There are no current ambassador users.

---

## Benefits

- **Free Pro access** for one year, renewable at discretion
- **Up to 6 gifted Pro subscriptions** to distribute to whoever they choose
- No payment required — ever, as long as they remain active

---

## Requirements

The only requirement is **active community involvement and contribution**: posting community pins, engaging with the platform, and generally being a presence in the fishing community that reflects well on RipLoc. There is no formal metric — it is discretionary.

---

## Tier Value

Ambassadors use `tier = "ambassador"` in `user_profiles`. This is handled in `src/hooks/useRegionAccess.js`:

- `isPro = true` (full Pro feature access)
- No expiry, no countdown, no `trial_end` date
- Immune to `subscription_status = "cancelled"` downgrade
- `daysLeft = null`, `isExpired = false`

To grant ambassador status in Supabase:

```sql
UPDATE user_profiles
SET tier = 'ambassador'
WHERE id = (SELECT id FROM auth.users WHERE email = 'their@email.com');
```

To revoke:

```sql
UPDATE user_profiles
SET tier = 'standard'
WHERE id = (SELECT id FROM auth.users WHERE email = 'their@email.com');
```

---

## Gifted Pro Subscriptions

Each ambassador can gift up to **6 Pro subscriptions**. These are not yet implemented in the app — the current plan is a manual workflow (Jon grants them directly in Supabase) until volume justifies automating it.

When the gifting system is built, it will likely use a `ambassador_gifts` table:

```sql
-- Future schema (not yet created)
CREATE TABLE ambassador_gifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  ambassador_id uuid REFERENCES user_profiles(id),
  recipient_email text NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES user_profiles(id)
);
```

For now, gift redemption = manually run:

```sql
UPDATE user_profiles
SET tier = 'pro', trial_end = now() + interval '1 year'
WHERE id = (SELECT id FROM auth.users WHERE email = 'recipient@email.com');
```

---

## Application Form

The public application form lives on the landing page (`src/pages/LandingPage.jsx`, section `rl-amb-sec`). Submissions go to the `ambassador_applications` Supabase table.

Schema:

```sql
CREATE TABLE ambassador_applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  name text NOT NULL,
  boat_name text,
  location text,
  email text NOT NULL,
  phone text,
  comments text
);
ALTER TABLE ambassador_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert" ON ambassador_applications FOR INSERT WITH CHECK (true);
```

Jon reviews applications manually and grants the tier via SQL above.

---

## Reference

| File | Purpose |
|---|---|
| `src/hooks/useRegionAccess.js` | Tier logic — ambassador branch |
| `src/pages/LandingPage.jsx` | Public application form (`rl-amb-sec`) |
| Supabase table `ambassador_applications` | Raw form submissions |
| Supabase table `user_profiles` | `tier` column controls access |
