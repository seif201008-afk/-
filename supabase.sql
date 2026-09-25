-- شغّل الكود ده كامل في Supabase ← SQL Editor ← Run
-- كل حاجة هنا بتضيف بس ومبتمسحش بيانات: المشاكل الموجودة بتفضل زي ما هي.
-- تقدر تشغّله أكتر من مرة من غير مشاكل.

-- ================= المشاكل =================
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

alter table public.team_problems add column if not exists images    text[]      not null default '{}';
alter table public.team_problems add column if not exists assignee  text;
alter table public.team_problems add column if not exists priority  text        not null default 'normal';
alter table public.team_problems add column if not exists edited_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_problems_priority_check') then
    alter table public.team_problems
      add constraint team_problems_priority_check check (priority in ('normal', 'urgent'));
  end if;
end $$;

alter table public.team_problems enable row level security;

drop policy if exists "team read"   on public.team_problems;
drop policy if exists "team insert" on public.team_problems;
drop policy if exists "team update" on public.team_problems;
drop policy if exists "team delete" on public.team_problems;

create policy "team read"   on public.team_problems for select using (true);
create policy "team insert" on public.team_problems for insert with check (status = 'open');
create policy "team update" on public.team_problems for update using (true) with check (true);
create policy "team delete" on public.team_problems for delete using (true);

revoke all on public.team_problems from anon, authenticated;
grant select, insert, delete on public.team_problems to anon, authenticated;
grant update (title, details, note, edited_at, status, solved_at, solved_by, solution,
              images, assignee, priority)
  on public.team_problems to anon, authenticated;
grant usage, select on sequence public.team_problems_id_seq to anon, authenticated;

-- ================= النقاش (الشات) =================
create table if not exists public.problem_comments (
  id          bigint generated always as identity primary key,
  problem_id  bigint      not null references public.team_problems(id) on delete cascade,
  author      text        not null check (char_length(author) between 1 and 60),
  body        text        not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);
create index if not exists problem_comments_problem_idx on public.problem_comments (problem_id, created_at);

alter table public.problem_comments enable row level security;
drop policy if exists "comments read"   on public.problem_comments;
drop policy if exists "comments insert" on public.problem_comments;
create policy "comments read"   on public.problem_comments for select using (true);
create policy "comments insert" on public.problem_comments for insert with check (true);

revoke all on public.problem_comments from anon, authenticated;
grant select, insert on public.problem_comments to anon, authenticated;
grant usage, select on sequence public.problem_comments_id_seq to anon, authenticated;

-- ================= الفريق =================
create table if not exists public.team_members (
  name        text        primary key check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

alter table public.team_members enable row level security;
drop policy if exists "members read" on public.team_members;
create policy "members read" on public.team_members for select using (true);

revoke all on public.team_members from anon, authenticated;
grant select on public.team_members to anon, authenticated;

-- كل واحد بيكتب اسمه بيتسجل في الفريق، وبيتحدث آخر ظهور ليه
create or replace function public.touch_member(p_name text)
returns void language sql security definer set search_path = public as $$
  insert into public.team_members (name) values (btrim(p_name))
  on conflict (name) do update set last_seen = now();
$$;
revoke all on function public.touch_member(text) from public;
grant execute on function public.touch_member(text) to anon, authenticated;

-- ================= إشعارات الموبايل =================
-- الاشتراكات والمفاتيح محدش يقدر يقراها من الموقع؛ بس السيرفر (Edge Function).
create table if not exists public.push_subscriptions (
  endpoint    text        primary key,
  p256dh      text        not null,
  auth        text        not null,
  member      text        not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table if not exists public.push_config (
  id             int  primary key default 1 check (id = 1),
  vapid_public   text not null,
  vapid_private  text not null,
  vapid_subject  text not null,
  hook_secret    text not null,
  function_url   text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_member text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_endpoint !~ '^https://' or coalesce(btrim(p_member), '') = '' then
    raise exception 'invalid subscription';
  end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, member)
  values (p_endpoint, p_p256dh, p_auth, btrim(p_member))
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, member = excluded.member;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public;
revoke all on function public.delete_push_subscription(text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to anon, authenticated;
grant execute on function public.delete_push_subscription(text) to anon, authenticated;

-- مع كل مشكلة جديدة أو حل أو تعيين مسؤول أو رسالة في النقاش، بنبلّغ دالة الإشعارات.
-- لو الإشعارات لسه مش متظبطة، أو حصل أي خطأ، التسجيل نفسه بيكمل عادي.
create or replace function public.notify_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg     public.push_config%rowtype;
  payload jsonb;
  ptitle  text;
begin
  select * into cfg from public.push_config where id = 1;
  if not found then return null; end if;

  if tg_table_name = 'team_problems' then
    if tg_op = 'INSERT' then
      payload := jsonb_build_object('type', 'new_problem', 'problem_id', new.id, 'title', new.title,
        'actor', new.author, 'priority', new.priority, 'assignee', new.assignee);
    elsif new.status = 'solved' and old.status is distinct from 'solved' then
      payload := jsonb_build_object('type', 'solved', 'problem_id', new.id, 'title', new.title,
        'actor', new.solved_by);
    elsif new.assignee is not null and new.assignee is distinct from old.assignee then
      payload := jsonb_build_object('type', 'assigned', 'problem_id', new.id, 'title', new.title,
        'assignee', new.assignee, 'priority', new.priority);
    else
      return null;
    end if;
  else
    select title into ptitle from public.team_problems where id = new.problem_id;
    payload := jsonb_build_object('type', 'comment', 'problem_id', new.problem_id, 'title', ptitle,
      'actor', new.author, 'text', left(new.body, 160));
  end if;

  perform net.http_post(
    url     := cfg.function_url,
    body    := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.hook_secret)
  );
  return null;
exception when others then
  return null;
end $$;

drop trigger if exists team_problems_notify on public.team_problems;
create trigger team_problems_notify after insert or update on public.team_problems
  for each row execute function public.notify_team();

drop trigger if exists problem_comments_notify on public.problem_comments;
create trigger problem_comments_notify after insert on public.problem_comments
  for each row execute function public.notify_team();

-- ================= مخزن الصور =================
do $$ begin
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
exception when others then
  raise notice 'images setup skipped: %', sqlerrm;
end $$;

-- ================= التحديث اللحظي =================
do $$
declare t text;
begin
  foreach t in array array['team_problems', 'problem_comments', 'team_members'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then
  raise notice 'realtime setup skipped: %', sqlerrm;
end $$;

-- الإضافة اللي بتخلي قاعدة البيانات تبعت للإشعارات
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
