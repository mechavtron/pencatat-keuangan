-- Jalankan file ini di Supabase: SQL Editor → New query → Run.
-- Aman dijalankan ulang (IF NOT EXISTS / DROP POLICY IF EXISTS).
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
  image_url text,
  type text not null default 'pengeluaran'
);

alter table public.expenses
  add column if not exists type text not null default 'pengeluaran';

alter table public.expenses drop constraint if exists expenses_type_check;
alter table public.expenses
  add constraint expenses_type_check
  check (type in ('pemasukan', 'pengeluaran'));

create index if not exists expenses_created_at_idx
  on public.expenses (created_at desc);

create index if not exists expenses_type_idx
  on public.expenses (type);

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

drop policy if exists "Allow public delete expenses" on public.expenses;
create policy "Allow public delete expenses"
  on public.expenses
  for delete
  to anon, authenticated
  using (true);

grant usage on schema public to anon, authenticated;
grant select, insert, delete on table public.expenses to anon, authenticated;
