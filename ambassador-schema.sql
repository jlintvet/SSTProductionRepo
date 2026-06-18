-- ambassador_applications table
-- Run in Supabase SQL editor: https://supabase.com/dashboard/project/upxerlzdgdbjkbjpuktn/sql

CREATE TABLE IF NOT EXISTS ambassador_applications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text NOT NULL,
  email       text NOT NULL,
  boat_name   text,
  location    text,
  phone       text,
  comments    text,
  created_at  timestamptz DEFAULT now()
);

-- Anyone can insert (public form), nobody can read except service role
ALTER TABLE ambassador_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert" ON ambassador_applications
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Only service role can SELECT (admin/dashboard only)
-- No SELECT policy = anon/authenticated get nothing back, service role bypasses RLS
