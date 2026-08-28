-- Jalankan file ini di Supabase: SQL Editor → New query → Run.
--
-- Setelah deploy, daftarkan webhook Telegram:
-- https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://<DOMAIN_ANDA>/api/telegram

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  amount numeric(14, 2) not null,
  category text not null default 'Lainnya',
  description text,
  store_name text,
  image_url text
);

create index if not exists expenses_created_at_idx
  on public.expenses (created_at desc);

alter table public.expenses enable row level security;

drop policy if exists "Allow public read expenses" on public.expenses;
create policy "Allow public read expenses"
  on public.expenses
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public insert expenses" on public.expenses;
create policy "Allow public insert expenses"
  on public.expenses
  for insert
  to anon, authenticated
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on table public.expenses to anon, authenticated;
