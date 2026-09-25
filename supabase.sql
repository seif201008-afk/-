-- شغّل الكود ده كامل في Supabase ← SQL Editor ← Run
-- بيعمل الجدول ومكان الصور ويظبط كل الصلاحيات. تقدر تشغّله أكتر من مرة من غير مشاكل.

-- ================= الجدول =================
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

-- مسارات صور المشكلة جوه مخزن الصور
alter table public.team_problems add column if not exists images text[] not null default '{}';

alter table public.team_problems enable row level security;

drop policy if exists "team read"   on public.team_problems;
drop policy if exists "team insert" on public.team_problems;
drop policy if exists "team update" on public.team_problems;
drop policy if exists "team delete" on public.team_problems;

-- أي حد معاه اللينك يقدر يشوف ويضيف ويحل ويمسح مشكلة
create policy "team read"   on public.team_problems for select using (true);
create policy "team insert" on public.team_problems for insert with check (status = 'open');
create policy "team update" on public.team_problems for update using (true) with check (true);
create policy "team delete" on public.team_problems for delete using (true);

-- الصلاحيات: قراءة + إضافة + مسح كاملين، والتعديل مسموح بس في الحالة (اتحلت / إعادة فتح)
-- والصور. اسم المشكلة وكاتبها ما بيتغيروش بعد التسجيل.
revoke all on public.team_problems from anon, authenticated;
grant select, insert, delete on public.team_problems to anon, authenticated;
grant update (status, solved_at, solved_by, solution, images) on public.team_problems to anon, authenticated;
grant usage, select on sequence public.team_problems_id_seq to anon, authenticated;

-- ================= مخزن الصور =================
-- مخزن عام: أي حد معاه لينك الصورة يقدر يفتحها. أقصى حجم للصورة 5 ميجا.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('problem-images', 'problem-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "team images read"   on storage.objects;
drop policy if exists "team images upload" on storage.objects;
drop policy if exists "team images delete" on storage.objects;

create policy "team images read"   on storage.objects for select using (bucket_id = 'problem-images');
create policy "team images upload" on storage.objects for insert with check (bucket_id = 'problem-images');
create policy "team images delete" on storage.objects for delete using (bucket_id = 'problem-images');

-- Supabase بيفعّل التحديث اللحظي (Realtime) تلقائي للجداول الجديدة، فمفيش داعي نضيفه يدوي.

-- نقول لـ PostgREST يحدّث نفسه بالصلاحيات الجديدة على طول
notify pgrst, 'reload schema';
