-- شغّل الكود ده مرة واحدة في Supabase → SQL Editor
-- بيعمل جدول جديد ومنفصل خالص عن جداول المطاعم

create table if not exists public.team_issues (
  id          bigint generated always as identity primary key,
  problem     text        not null,
  note        text,
  author      text        not null,
  category    text        not null default 'تاني',
  status      text        not null default 'open' check (status in ('open', 'solved')),
  created_at  timestamptz not null default now(),
  solved_at   timestamptz
);

-- السماح للموقع يقرا ويضيف ويعدّل الحالة بالمفتاح العام (anon)
alter table public.team_issues enable row level security;

drop policy if exists "team read"   on public.team_issues;
drop policy if exists "team insert" on public.team_issues;
drop policy if exists "team update" on public.team_issues;

create policy "team read"   on public.team_issues for select using (true);
create policy "team insert" on public.team_issues for insert with check (true);
create policy "team update" on public.team_issues for update using (true) with check (true);

-- تحديث لحظي: أي مشكلة جديدة تظهر عند الكل من غير ريفريش
alter publication supabase_realtime add table public.team_issues;
