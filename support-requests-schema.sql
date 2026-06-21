-- ============================================================
-- Support / Help & Report Issues
-- Run once in the Supabase SQL editor.
-- (Image uploads reuse the existing public "share-images" bucket under support/.)
-- ============================================================
create table if not exists support_requests (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        references auth.users on delete set null,
  email       text,
  type        text        not null,                 -- assistance | feedback | issue
  priority    text        not null default 'Normal', -- Low | Normal | High | Urgent
  category    text,
  notes       text        not null,
  image_urls  text[]      not null default '{}',
  status      text        not null default 'open',
  created_at  timestamptz not null default now()
);

alter table support_requests enable row level security;

-- Any signed-in user can file a request as themselves.
drop policy if exists "sr_insert" on support_requests;
create policy "sr_insert" on support_requests for insert to authenticated
  with check (auth.uid() = user_id);

-- Admin emails can read + triage all requests.
drop policy if exists "sr_admin_read" on support_requests;
create policy "sr_admin_read" on support_requests for select to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'));

drop policy if exists "sr_admin_update" on support_requests;
create policy "sr_admin_update" on support_requests for update to authenticated
  using (auth.jwt() ->> 'email' in ('jlintvet@gmail.com','jlintvet@butterpayments.com'))
  with check (true);
