-- شغّل الكود ده مرة واحدة في Supabase ← SQL Editor ← Run
-- بيعمل جدول جديد ومنفصل خالص عن جداول المطاعم

create table if not exists public.team_problems (
  id          bigint generated always as identity primary key,
  title       text        not null check (char_length(title)  between 1 and 120),
  details     text,
  note        text,
  author      text        not null check (char_length(author) between 1 and 60),
  status      text        not null default 'open' check (status in ('open', 'solved')),
  created_at  timestamptz not null default now(),
  solved_at   timestamptz,
  solved_by   text,
  solution    text
);

alter table public.team_problems enable row level security;

drop policy if exists "team read"   on public.team_problems;
drop policy if exists "team insert" on public.team_problems;
drop policy if exists "team update" on public.team_problems;
drop policy if exists "team delete" on public.team_problems;

-- أي حد معاه اللينك يقدر يشوف ويضيف ويمسح مشكلة
create policy "team read"   on public.team_problems for select using (true);
create policy "team insert" on public.team_problems for insert with check (status = 'open');
create policy "team update" on public.team_problems for update using (true) with check (true);
create policy "team delete" on public.team_problems for delete using (true);

-- التعديل مسموح في خانات الحالة بس (اتحلت / إعادة فتح). اسم المشكلة وكاتبها
-- ما بيتغيروش بعد ما تتسجل، لكن مسموح تتمسح خالص.
revoke update on public.team_problems from anon, authenticated;
grant  update (status, solved_at, solved_by, solution) on public.team_problems to anon, authenticated;
grant  delete on public.team_problems to anon, authenticated;

-- تحديث لحظي: أي مشكلة جديدة تظهر عند الكل من غير ريفريش
alter publication supabase_realtime add table public.team_problems;
