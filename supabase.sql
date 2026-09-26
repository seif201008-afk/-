-- شغّل الكود ده كامل في Supabase ← SQL Editor ← Run
-- كل حاجة هنا بتضيف بس ومبتمسحش بيانات: المشاكل والنقاش الموجودين بيفضلوا زي ما هم.
-- تقدر تشغّله أكتر من مرة من غير مشاكل.
--
-- من النسخة دي: الموقع مبيفتحش غير لأعضاء الفريق اللي داخلين بحساب جوجل.

-- =====================================================================
-- 1) الجداول
-- =====================================================================

-- ---------- المشاكل ----------
create table if not exists public.team_problems (
  id          bigint generated always as identity primary key,
  title       text        not null check (char_length(title)  between 1 and 120),
  details     text,
  note        text,
  author      text        not null check (char_length(author) between 1 and 60),
  status      text        not null default 'open',
  created_at  timestamptz not null default now(),
  solved_at   timestamptz,
  solved_by   text,
  solution    text
);

alter table public.team_problems add column if not exists images           text[]      not null default '{}';
alter table public.team_problems add column if not exists assignee         text;
alter table public.team_problems add column if not exists priority         text        not null default 'normal';
alter table public.team_problems add column if not exists edited_at        timestamptz;
alter table public.team_problems add column if not exists due_at           timestamptz;
alter table public.team_problems add column if not exists pinned           boolean     not null default false;
alter table public.team_problems add column if not exists recur_count      int         not null default 0;
alter table public.team_problems add column if not exists last_reminded_at timestamptz;
alter table public.team_problems add column if not exists created_by       uuid;
alter table public.team_problems add column if not exists duplicate_of     bigint references public.team_problems(id) on delete set null;

do $$ begin
  alter table public.team_problems drop constraint if exists team_problems_status_check;
  alter table public.team_problems
    add constraint team_problems_status_check check (status in ('open', 'in_progress', 'solved'));
  if not exists (select 1 from pg_constraint where conname = 'team_problems_priority_check') then
    alter table public.team_problems
      add constraint team_problems_priority_check check (priority in ('normal', 'urgent'));
  end if;
end $$;

-- ---------- النقاش ----------
create table if not exists public.problem_comments (
  id          bigint generated always as identity primary key,
  problem_id  bigint      not null references public.team_problems(id) on delete cascade,
  author      text        not null check (char_length(author) between 1 and 60),
  body        text        not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists problem_comments_problem_idx on public.problem_comments (problem_id, created_at);

-- مرفقات الرسالة: صور وملفات ورسايل صوتية [{kind, path, name, type, size, duration}]
alter table public.problem_comments add column if not exists attachments jsonb not null default '[]';
alter table public.problem_comments add column if not exists created_by  uuid;
alter table public.problem_comments add column if not exists reply_to    bigint references public.problem_comments(id) on delete set null;
alter table public.problem_comments add column if not exists edited_at   timestamptz;
alter table public.problem_comments add column if not exists deleted_at  timestamptz;
alter table public.problem_comments add column if not exists deleted_by  text;
alter table public.problem_comments alter column body set default '';

do $$ begin
  alter table public.problem_comments drop constraint if exists problem_comments_body_check;
  alter table public.problem_comments add constraint problem_comments_body_check
    check (deleted_at is not null or
           (char_length(body) <= 2000 and (char_length(body) > 0 or jsonb_array_length(attachments) > 0)));
end $$;

-- "امسحها من عندي بس" في نقاش المشكلة
create table if not exists public.comment_hides (
  comment_id  bigint      not null references public.problem_comments(id) on delete cascade,
  user_id     uuid        not null,
  hidden_at   timestamptz not null default now(),
  primary key (comment_id, user_id)
);

-- ---------- الفريق ----------
create table if not exists public.team_settings (
  id            int  primary key default 1 check (id = 1),
  member_limit  int  not null default 5 check (member_limit between 1 and 1000),
  admin_email   text
);
insert into public.team_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.members (
  user_id          uuid        primary key references auth.users(id) on delete cascade,
  email            text        not null,
  display_name     text        not null check (char_length(btrim(display_name)) between 1 and 60),
  joined_at        timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  removed          boolean     not null default false,
  availability     text        not null default 'available' check (availability in ('available', 'busy', 'away')),
  status_note      text        check (char_length(status_note) <= 80),
  quiet_start      smallint    check (quiet_start between 0 and 23),
  quiet_end        smallint    check (quiet_end between 0 and 23),
  summary_hour     smallint    check (summary_hour between 0 and 23),
  tz               text        not null default 'Africa/Cairo',
  last_summary_on  date
);
create unique index if not exists members_display_name_key on public.members (lower(btrim(display_name)));

-- ---------- سجل التغييرات ----------
create table if not exists public.problem_events (
  id          bigint generated always as identity primary key,
  problem_id  bigint      not null references public.team_problems(id) on delete cascade,
  actor       text,
  kind        text        not null,
  detail      jsonb       not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists problem_events_problem_idx on public.problem_events (problem_id, created_at);

-- ---------- الردود السريعة على الرسايل ----------
create table if not exists public.comment_reactions (
  comment_id  bigint      not null references public.problem_comments(id) on delete cascade,
  user_id     uuid        not null default auth.uid(),
  member      text,
  emoji       text        not null check (emoji in ('👍', '✅', '👀', '❤️', '😂')),
  created_at  timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

-- ---------- مين قرا النقاش لحد فين ----------
create table if not exists public.problem_reads (
  problem_id    bigint      not null references public.team_problems(id) on delete cascade,
  user_id       uuid        not null,
  member        text,
  last_read_at  timestamptz not null default now(),
  primary key (problem_id, user_id)
);

-- ---------- "فكّرني بعدين" ----------
create table if not exists public.reminders (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null default auth.uid(),
  problem_id  bigint      not null references public.team_problems(id) on delete cascade,
  remind_at   timestamptz not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (remind_at) where sent_at is null;

-- ---------- المشاكل المرتبطة ببعض ----------
create table if not exists public.problem_links (
  a           bigint      not null references public.team_problems(id) on delete cascade,
  b           bigint      not null references public.team_problems(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);

-- ---------- إشعارات الموبايل ----------
create table if not exists public.push_subscriptions (
  endpoint    text        primary key,
  p256dh      text        not null,
  auth        text        not null,
  member      text        not null,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists public.push_config (
  id             int  primary key default 1 check (id = 1),
  vapid_public   text not null,
  vapid_private  text not null,
  vapid_subject  text not null,
  hook_secret    text not null,
  function_url   text not null
);
alter table public.push_config add column if not exists gemini_key   text;
alter table public.push_config add column if not exists gemini_model text not null default 'gemini-2.5-flash';

-- =====================================================================
-- 2) مين عضو في الفريق
-- الأدمن دايمًا جوه. الباقيين بالترتيب حسب أول ما دخلوا، لحد العدد المسموح.
-- =====================================================================

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') = lower((select admin_email from public.team_settings where id = 1)),
    false);
$$;

create or replace function public.is_active_member(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with s as (
    select member_limit, lower(coalesce(admin_email, '')) as admin from public.team_settings where id = 1
  ), ranked as (
    select m.user_id,
           row_number() over (order by (lower(m.email) = (select admin from s)) desc, m.joined_at, m.user_id) as rn
    from public.members m
    where not m.removed
  )
  select exists (select 1 from ranked r where r.user_id = p_uid and r.rn <= (select member_limit from s));
$$;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(auth.uid());
$$;

create or replace function public.my_name()
returns text language sql stable security definer set search_path = public as $$
  select display_name from public.members where user_id = auth.uid();
$$;

-- أول ما حد يدخل بجوجل: بيتسجل، وبيرجعله هو جوه الفريق ولا الفريق كامل
create or replace function public.join_team(p_name text default null, p_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  em     text := auth.jwt() ->> 'email';
  m      public.members%rowtype;
  base   text;
  cand   text;
  n      int := 1;
  is_new boolean := false;
begin
  if uid is null or em is null then raise exception 'not_signed_in'; end if;

  select * into m from public.members where user_id = uid;
  if not found then
    base := left(coalesce(nullif(btrim(p_name), ''), split_part(em, '@', 1)), 55);
    cand := base;
    while exists (select 1 from public.members where lower(btrim(display_name)) = lower(cand)) loop
      n := n + 1;
      cand := base || ' ' || n;
    end loop;
    insert into public.members (user_id, email, display_name, tz)
    values (uid, em, cand, coalesce(nullif(p_tz, ''), 'Africa/Cairo'))
    returning * into m;
    is_new := true;
  elsif m.last_seen < now() - interval '1 minute' or m.email is distinct from em
        or (nullif(p_tz, '') is not null and m.tz is distinct from p_tz) then
    -- بنحدّث بس لو فيه جديد، عشان كل تحديث بيوصل لأجهزة الفريق كلها
    update public.members
       set last_seen = now(), email = em, tz = coalesce(nullif(p_tz, ''), tz)
     where user_id = uid
    returning * into m;
  end if;

  return jsonb_build_object(
    'state',    case when m.removed then 'removed'
                     when public.is_active_member(uid) then 'member'
                     else 'full' end,
    'is_new',   is_new,
    'is_admin', public.is_admin(),
    'member',   to_jsonb(m));
end $$;

-- قايمة الفريق: مين جوه، ومين مستني مكان، ومين اتشال (الإيميلات بتظهر للأدمن بس)
create or replace function public.team_roster()
returns table (
  user_id uuid, display_name text, email text, joined_at timestamptz, last_seen timestamptz,
  removed boolean, availability text, status_note text, is_admin boolean, active boolean, rank int
) language sql stable security definer set search_path = public as $$
  with s as (
    select member_limit, lower(coalesce(admin_email, '')) as admin from public.team_settings where id = 1
  ), ranked as (
    select m.user_id,
           row_number() over (order by (lower(m.email) = (select admin from s)) desc, m.joined_at, m.user_id) as rn
    from public.members m
    where not m.removed
  )
  select m.user_id, m.display_name,
         case when public.is_admin() then m.email end,
         m.joined_at, m.last_seen, m.removed, m.availability, m.status_note,
         lower(m.email) = (select admin from s),
         (not m.removed and coalesce(r.rn, 1000000) <= (select member_limit from s)),
         coalesce(r.rn, 0)::int
  from public.members m
  left join ranked r on r.user_id = m.user_id
  where public.is_team_member()
  order by m.removed, coalesce(r.rn, 1000000);
$$;

-- للأدمن بس: العدد المسموح، وشيل أو رجّع حد
create or replace function public.admin_set_limit(p_limit int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.team_settings set member_limit = greatest(1, least(p_limit, 1000)) where id = 1;
end $$;

create or replace function public.admin_set_removed(p_user uuid, p_removed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_self'; end if;
  update public.members set removed = p_removed where user_id = p_user;
end $$;

-- لما حد يغيّر اسمه، اسمه بيتغيّر في كل المشاكل والرسايل القديمة كمان
create or replace function public.members_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.display_name = old.display_name then return null; end if;
  -- التغيير ده مجرد تغيير اسم: من غير سجل تغييرات ولا إشعارات
  perform set_config('app.renaming', 'on', true);
  update public.team_problems   set author    = new.display_name where lower(author)    = lower(old.display_name);
  update public.team_problems   set solved_by = new.display_name where lower(solved_by) = lower(old.display_name);
  update public.team_problems   set assignee  = new.display_name where lower(assignee)  = lower(old.display_name);
  update public.problem_comments set author   = new.display_name where lower(author)    = lower(old.display_name);
  update public.comment_reactions set member  = new.display_name where user_id = new.user_id;
  update public.problem_reads   set member    = new.display_name where user_id = new.user_id;
  update public.push_subscriptions set member = new.display_name where user_id = new.user_id;
  update public.problem_events  set actor     = new.display_name where lower(actor)     = lower(old.display_name);
  update public.chat_messages   set author    = new.display_name where created_by = new.user_id;
  update public.chat_reads      set member    = new.display_name where user_id = new.user_id;
  update public.chat_reactions  set member    = new.display_name where user_id = new.user_id;
  perform set_config('app.renaming', 'off', true);
  return null;
end $$;

drop trigger if exists members_rename on public.members;
create trigger members_rename after update of display_name on public.members
  for each row execute function public.members_rename();

-- =====================================================================
-- 3) حماية البيانات من جوه قاعدة البيانات
-- =====================================================================

-- اسم اللي سجّل أو حل بياخده من حسابه، واسم المشكلة بيعدّله اللي كتبها بس،
-- و"بيتشتغل عليها" بيعلّمها المسؤول بس.
create or replace function public.team_problems_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me    text := public.my_name();
  canon text;
begin
  if auth.uid() is null then return new; end if;

  -- المسؤول لازم يكون عضو في الفريق (وبنكتب اسمه زي ما هو متسجل بالظبط)
  if new.assignee is not null and btrim(new.assignee) = '' then new.assignee := null; end if;
  if new.assignee is not null and (tg_op = 'INSERT' or new.assignee is distinct from old.assignee)
     and coalesce(current_setting('app.renaming', true), '') <> 'on' then
    select m.display_name into canon from public.members m
     where lower(btrim(m.display_name)) = lower(btrim(new.assignee)) and public.is_active_member(m.user_id);
    if canon is null then raise exception 'assignee_not_member'; end if;
    new.assignee := canon;
  end if;

  if tg_op = 'INSERT' then
    new.author     := coalesce(me, new.author);
    new.created_by := auth.uid();
    return new;
  end if;

  if (new.title, coalesce(new.details, ''), coalesce(new.note, ''))
       is distinct from (old.title, coalesce(old.details, ''), coalesce(old.note, ''))
     and not (coalesce(old.created_by = auth.uid(), false) or lower(old.author) = lower(coalesce(me, ''))) then
    raise exception 'only_author_can_edit';
  end if;

  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    if lower(coalesce(new.assignee, '')) <> lower(coalesce(me, '')) then
      raise exception 'only_assignee_can_start';
    end if;
  elsif old.status = 'in_progress' then
    if new.assignee is distinct from old.assignee then
      -- المسؤول اتغيّر: الشغل عليها بيقف لحد ما المسؤول الجديد يبدأ
      if new.status = 'in_progress' then new.status := 'open'; end if;
    elsif new.status = 'open' and lower(coalesce(old.assignee, '')) <> lower(coalesce(me, '')) then
      raise exception 'only_assignee_can_stop';
    end if;
  end if;

  if new.status = 'solved' and old.status is distinct from 'solved' then
    new.solved_by := coalesce(me, new.solved_by);
    new.solved_at := coalesce(new.solved_at, now());
  end if;
  return new;
end $$;

drop trigger if exists team_problems_guard on public.team_problems;
create trigger team_problems_guard before insert or update on public.team_problems
  for each row execute function public.team_problems_guard();

-- صاحب الرسالة: اللي بعتها بحسابه، أو (للرسايل القديمة قبل الدخول بجوجل) اللي اسمه عليها
create or replace function public.owns_comment(p_created_by uuid, p_author text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(p_created_by = auth.uid(), false)
      or (p_created_by is null and public.my_name() is not null
          and lower(btrim(coalesce(p_author, ''))) = lower(btrim(public.my_name())));
$$;

create or replace function public.problem_comments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  txt  text;
  atts jsonb;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.author     := coalesce(public.my_name(), new.author);
      new.created_by := auth.uid();
    end if;
    new.edited_at  := null;
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;
  -- تغيير اسم عضو بيتنقل لرسايله القديمة
  if current_setting('app.renaming', true) = 'on' or auth.uid() is null then return new; end if;
  if new.deleted_at is not null and old.deleted_at is null then
    return new; -- بيتم بس من خلال comment_delete_for_everyone
  end if;
  if old.deleted_at is not null then raise exception 'message_deleted'; end if;
  if not public.owns_comment(old.created_by, old.author) then raise exception 'only_sender_can_edit'; end if;
  txt  := new.body;
  atts := new.attachments;
  new := old;
  new.body        := txt;
  new.attachments := atts;
  new.edited_at   := now();
  return new;
end $$;

drop trigger if exists problem_comments_guard on public.problem_comments;
create trigger problem_comments_guard before insert or update on public.problem_comments
  for each row execute function public.problem_comments_guard();

create or replace function public.comment_reactions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.member  := public.my_name();
  return new;
end $$;

drop trigger if exists comment_reactions_guard on public.comment_reactions;
create trigger comment_reactions_guard before insert on public.comment_reactions
  for each row execute function public.comment_reactions_guard();

-- سجل التغييرات: كل تغيير بيتسجل لوحده مع اسم اللي عمله
create or replace function public.log_problem_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor text := coalesce(public.my_name(), 'النظام');
  k     text;
begin
  if current_setting('app.renaming', true) = 'on' then return null; end if;
  if tg_op = 'INSERT' then
    insert into public.problem_events (problem_id, actor, kind) values (new.id, new.author, 'created');
    return null;
  end if;

  if new.status is distinct from old.status then
    k := case
      when new.status = 'solved'                                  then 'solved'
      when new.status = 'in_progress'                             then 'started'
      when old.status = 'in_progress'                             then 'stopped'
      when old.status = 'solved' and new.recur_count > old.recur_count then 'recurred'
      else 'reopened'
    end;
    insert into public.problem_events (problem_id, actor, kind)
    values (new.id, case when k = 'solved' then coalesce(new.solved_by, actor) else actor end, k);
  end if;
  if new.assignee is distinct from old.assignee then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'assigned', jsonb_build_object('from', old.assignee, 'to', new.assignee));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'priority', jsonb_build_object('to', new.priority));
  end if;
  if new.due_at is distinct from old.due_at then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'due', jsonb_build_object('to', new.due_at));
  end if;
  if new.pinned is distinct from old.pinned then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'pinned', jsonb_build_object('to', new.pinned));
  end if;
  if new.duplicate_of is distinct from old.duplicate_of then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'duplicate', jsonb_build_object('of', new.duplicate_of));
  end if;
  if (new.title, coalesce(new.details, ''), coalesce(new.note, ''))
       is distinct from (old.title, coalesce(old.details, ''), coalesce(old.note, '')) then
    insert into public.problem_events (problem_id, actor, kind) values (new.id, actor, 'edited');
  end if;
  if coalesce(cardinality(new.images), 0) <> coalesce(cardinality(old.images), 0) then
    insert into public.problem_events (problem_id, actor, kind, detail)
    values (new.id, actor, 'images',
            jsonb_build_object('change', coalesce(cardinality(new.images), 0) - coalesce(cardinality(old.images), 0)));
  end if;
  return null;
end $$;

drop trigger if exists team_problems_log on public.team_problems;
create trigger team_problems_log after insert or update on public.team_problems
  for each row execute function public.log_problem_event();

-- مين قرا النقاش لحد فين
create or replace function public.mark_read(p_problem bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then return; end if;
  insert into public.problem_reads (problem_id, user_id, member, last_read_at)
  values (p_problem, auth.uid(), public.my_name(), now())
  on conflict (problem_id, user_id) do update set last_read_at = now(), member = excluded.member;
end $$;

-- =====================================================================
-- 4) الصلاحيات: محدش يشوف أو يعدّل حاجة غير أعضاء الفريق
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array['team_problems', 'problem_comments', 'team_settings', 'members', 'problem_events',
                           'comment_reactions', 'problem_reads', 'reminders', 'problem_links',
                           'push_subscriptions', 'push_config'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- الجدول القديم بتاع الأسامي (قبل الدخول بجوجل) مبقاش مستخدم
do $$ begin
  revoke all on public.team_members from anon, authenticated;
exception when undefined_table then null;
end $$;
drop function if exists public.touch_member(text);

-- المشاكل
drop policy if exists "team read"   on public.team_problems;
drop policy if exists "team insert" on public.team_problems;
drop policy if exists "team update" on public.team_problems;
drop policy if exists "team delete" on public.team_problems;
create policy "team read"   on public.team_problems for select to authenticated using ((select public.is_team_member()));
create policy "team insert" on public.team_problems for insert to authenticated
  with check ((select public.is_team_member()) and status = 'open');
create policy "team update" on public.team_problems for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "team delete" on public.team_problems for delete to authenticated using ((select public.is_team_member()));
grant select, insert, delete on public.team_problems to authenticated;
grant update (title, details, note, edited_at, status, solved_at, solved_by, solution, images,
              assignee, priority, due_at, pinned, recur_count, duplicate_of)
  on public.team_problems to authenticated;
grant usage, select on sequence public.team_problems_id_seq to authenticated;

-- النقاش
drop policy if exists "comments read"   on public.problem_comments;
drop policy if exists "comments insert" on public.problem_comments;
create policy "comments read"   on public.problem_comments for select to authenticated using ((select public.is_team_member()));
create policy "comments insert" on public.problem_comments for insert to authenticated with check ((select public.is_team_member()));
grant select, insert on public.problem_comments to authenticated;
grant usage, select on sequence public.problem_comments_id_seq to authenticated;

-- إعدادات الفريق (التعديل بيتم من دوال الأدمن بس)
drop policy if exists "settings read" on public.team_settings;
create policy "settings read" on public.team_settings for select to authenticated using ((select public.is_team_member()));
grant select on public.team_settings to authenticated;

-- الأعضاء: كل عضو بيشوف الفريق، وبيعدّل بياناته هو بس
drop policy if exists "members read"        on public.members;
drop policy if exists "members update self" on public.members;
create policy "members read" on public.members for select to authenticated
  using ((select public.is_team_member()) or user_id = (select auth.uid()));
create policy "members update self" on public.members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- الإيميلات مش ظاهرة للأعضاء (الأدمن بيشوفها من team_roster)
grant select (user_id, display_name, joined_at, last_seen, removed, availability, status_note,
              quiet_start, quiet_end, summary_hour, tz)
  on public.members to authenticated;
grant update (display_name, availability, status_note, quiet_start, quiet_end, summary_hour, tz, last_seen)
  on public.members to authenticated;

-- سجل التغييرات (بيتكتب من قاعدة البيانات لوحدها)
drop policy if exists "events read" on public.problem_events;
create policy "events read" on public.problem_events for select to authenticated using ((select public.is_team_member()));
grant select on public.problem_events to authenticated;

-- الردود السريعة
drop policy if exists "reactions read"   on public.comment_reactions;
drop policy if exists "reactions insert" on public.comment_reactions;
drop policy if exists "reactions delete" on public.comment_reactions;
create policy "reactions read"   on public.comment_reactions for select to authenticated using ((select public.is_team_member()));
create policy "reactions insert" on public.comment_reactions for insert to authenticated with check ((select public.is_team_member()));
create policy "reactions delete" on public.comment_reactions for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.comment_reactions to authenticated;

-- مين قرا
drop policy if exists "reads read" on public.problem_reads;
create policy "reads read" on public.problem_reads for select to authenticated using ((select public.is_team_member()));
grant select on public.problem_reads to authenticated;

-- التذكيرات: كل واحد بيشوف تذكيراته هو بس
drop policy if exists "reminders own read"   on public.reminders;
drop policy if exists "reminders own insert" on public.reminders;
drop policy if exists "reminders own delete" on public.reminders;
create policy "reminders own read"   on public.reminders for select to authenticated using (user_id = (select auth.uid()));
create policy "reminders own insert" on public.reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_team_member()));
create policy "reminders own delete" on public.reminders for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.reminders to authenticated;
grant usage, select on sequence public.reminders_id_seq to authenticated;

-- المشاكل المرتبطة
drop policy if exists "links read"   on public.problem_links;
drop policy if exists "links insert" on public.problem_links;
drop policy if exists "links delete" on public.problem_links;
create policy "links read"   on public.problem_links for select to authenticated using ((select public.is_team_member()));
create policy "links insert" on public.problem_links for insert to authenticated with check ((select public.is_team_member()));
create policy "links delete" on public.problem_links for delete to authenticated using ((select public.is_team_member()));
grant select, insert, delete on public.problem_links to authenticated;

-- الدوال
do $$
declare f text;
begin
  foreach f in array array[
    'public.is_admin()', 'public.is_active_member(uuid)', 'public.is_team_member()', 'public.my_name()',
    'public.join_team(text, text)', 'public.team_roster()', 'public.admin_set_limit(int)',
    'public.admin_set_removed(uuid, boolean)', 'public.mark_read(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- =====================================================================
-- 5) إشعارات الموبايل
-- =====================================================================

drop function if exists public.save_push_subscription(text, text, text, text);

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not_member'; end if;
  if p_endpoint !~ '^https://' then raise exception 'invalid subscription'; end if;
  insert into public.push_subscriptions (endpoint, p256dh, auth, member, user_id)
  values (p_endpoint, p_p256dh, p_auth, public.my_name(), auth.uid())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, member = excluded.member, user_id = excluded.user_id;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions
   where endpoint = p_endpoint and (user_id = auth.uid() or user_id is null);
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- مع كل حدث مهم بنبلّغ دالة الإشعارات. لو حصل أي خطأ، التسجيل نفسه بيكمل عادي.
create or replace function public.notify_team()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg     public.push_config%rowtype;
  payload jsonb;
  ptitle  text;
  actor   text := public.my_name();
begin
  if current_setting('app.renaming', true) = 'on' then return null; end if;
  select * into cfg from public.push_config where id = 1;
  if not found then return null; end if;

  if tg_table_name = 'team_problems' then
    if tg_op = 'INSERT' then
      payload := jsonb_build_object('type', 'new_problem', 'problem_id', new.id, 'title', new.title,
        'actor', new.author, 'priority', new.priority, 'assignee', new.assignee);
    elsif new.status = 'solved' and old.status is distinct from 'solved' then
      payload := jsonb_build_object('type', 'solved', 'problem_id', new.id, 'title', new.title,
        'actor', new.solved_by);
    elsif old.status = 'solved' and new.recur_count > old.recur_count then
      payload := jsonb_build_object('type', 'recurred', 'problem_id', new.id, 'title', new.title,
        'actor', actor, 'priority', new.priority, 'recur_count', new.recur_count);
    elsif new.status = 'in_progress' and old.status is distinct from 'in_progress' then
      payload := jsonb_build_object('type', 'started', 'problem_id', new.id, 'title', new.title,
        'actor', actor, 'author', new.author);
    elsif new.assignee is not null and new.assignee is distinct from old.assignee then
      payload := jsonb_build_object('type', 'assigned', 'problem_id', new.id, 'title', new.title,
        'actor', actor, 'assignee', new.assignee, 'priority', new.priority);
    else
      return null;
    end if;
  elsif tg_table_name = 'chat_messages' then
    -- شات الفريق: كل الفريق النشط. المجموعة: أعضاؤها الحقيقيين بس (الأدمن مبيوصلهوش حاجة لو مش عضو فيها)
    select jsonb_build_object('type', 'chat', 'group_id', g.id, 'group_name', g.name, 'is_team', g.is_team,
             'message_id', new.id, 'actor', new.author, 'text', left(new.body, 400),
             'attachment', new.attachments -> 0 ->> 'kind',
             'recipients', coalesce((
               case when g.is_team then
                 (select jsonb_agg(m.user_id) from public.members m
                   where public.is_active_member(m.user_id) and m.user_id is distinct from new.created_by)
               else
                 (select jsonb_agg(gm.user_id) from public.chat_group_members gm
                   where gm.group_id = g.id and public.is_active_member(gm.user_id)
                     and gm.user_id is distinct from new.created_by)
               end), '[]'::jsonb))
      into payload
      from public.chat_groups g where g.id = new.group_id;
    if payload is null then return null; end if;
  else
    select title into ptitle from public.team_problems where id = new.problem_id;
    payload := jsonb_build_object('type', 'comment', 'problem_id', new.problem_id, 'title', ptitle,
      'actor', new.author, 'text', left(new.body, 400),
      'attachment', new.attachments -> 0 ->> 'kind');
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

-- كل 5 دقايق: التذكيرات، والمشاكل المتأخرة، والملخص اليومي
create or replace function public.notify_tick()
returns void language plpgsql security definer set search_path = public as $$
declare cfg public.push_config%rowtype;
begin
  select * into cfg from public.push_config where id = 1;
  if not found then return; end if;
  perform net.http_post(
    url     := cfg.function_url,
    body    := '{"type": "tick"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', cfg.hook_secret)
  );
exception when others then
  return;
end $$;
revoke all on function public.notify_tick() from public, anon, authenticated;

-- =====================================================================
-- شات الفريق والمجموعات (شات عام، ومجموعات وشاتات خاصة يعملها أي عضو)
-- =====================================================================

-- كل محادثة (شات الفريق العام، أو مجموعة/شات خاص) صف في الجدول ده
create table if not exists public.chat_groups (
  id          bigint generated always as identity primary key,
  name        text,
  is_team     boolean     not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create unique index if not exists chat_groups_team_unique on public.chat_groups ((is_team)) where is_team;

-- شات الفريق: صف ثابت واحد، بيتضاف تلقائي أول مرة، وكل عضو نشط فيه من غير ما يتسجل في جدول أعضاء
insert into public.chat_groups (name, is_team)
select 'شات الفريق', true
where not exists (select 1 from public.chat_groups where is_team);

-- مين جوه كل مجموعة (مش محتاجة لشات الفريق، عضويته تلقائية لكل الفريق)
create table if not exists public.chat_group_members (
  group_id  bigint      not null references public.chat_groups(id) on delete cascade,
  user_id   uuid        not null,
  added_by  uuid,
  added_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- رسايل الشات (نفس فكرة نقاش المشكلة، بس هنا لكل محادثة)
create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  group_id     bigint      not null references public.chat_groups(id) on delete cascade,
  author       text        not null check (char_length(author) between 1 and 60),
  created_by   uuid,
  body         text        not null default '',
  attachments  jsonb       not null default '[]',
  reply_to     bigint      references public.chat_messages(id) on delete set null,
  pinned_at    timestamptz,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  deleted_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_group_idx on public.chat_messages (group_id, created_at);

do $$ begin
  alter table public.chat_messages drop constraint if exists chat_messages_body_check;
  alter table public.chat_messages add constraint chat_messages_body_check
    check (deleted_at is not null or
           (char_length(body) <= 2000 and (char_length(body) > 0 or jsonb_array_length(attachments) > 0)));
end $$;

-- "امسحها من عندي بس": الرسالة بتفضل موجودة للباقيين، وبتختفي من عند اللي عمل كده بس
create table if not exists public.chat_message_hides (
  message_id  bigint      not null references public.chat_messages(id) on delete cascade,
  user_id     uuid        not null,
  hidden_at   timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- مين قرا كل محادثة لحد فين (لعلامات الصح: اتبعتت / حد شافها / الكل شافها)
create table if not exists public.chat_reads (
  group_id      bigint      not null references public.chat_groups(id) on delete cascade,
  user_id       uuid        not null,
  member        text,
  last_read_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- عضو حقيقي في المحادثة (بيبعت فيها وبيتنادى عليه فيها)
create or replace function public.is_group_participant(p_group bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_groups g
    where g.id = p_group
      and (
        (g.is_team and public.is_team_member())
        or exists (select 1 from public.chat_group_members m where m.group_id = g.id and m.user_id = auth.uid())
      )
  );
$$;

-- زي اللي فوق، بس الأدمن كمان بيقدر يشوف أي محادثة بره ما يبقى عضو فيها (متابعة صامتة مبتظهرش لحد)
create or replace function public.is_chat_member(p_group bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_group_participant(p_group) or public.is_admin();
$$;

-- عمل مجموعة أو شات خاص جديد: أي عضو نشط في الفريق يقدر
create or replace function public.create_chat_group(p_name text, p_members uuid[])
returns bigint language plpgsql security definer set search_path = public as $$
declare gid bigint; m uuid;
begin
  if not public.is_team_member() then raise exception 'not_member'; end if;
  if p_members is null or array_length(p_members, 1) is null then raise exception 'no_members'; end if;
  insert into public.chat_groups (name, is_team, created_by)
    values (nullif(btrim(coalesce(p_name, '')), ''), false, auth.uid())
  returning id into gid;
  insert into public.chat_group_members (group_id, user_id, added_by) values (gid, auth.uid(), auth.uid());
  foreach m in array p_members loop
    if m is distinct from auth.uid() and public.is_active_member(m) then
      insert into public.chat_group_members (group_id, user_id, added_by) values (gid, m, auth.uid())
      on conflict do nothing;
    end if;
  end loop;
  return gid;
end $$;

create or replace function public.chat_group_add_member(p_group bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_participant(p_group) then raise exception 'not_member'; end if;
  if not public.is_active_member(p_user) then raise exception 'not_active_member'; end if;
  insert into public.chat_group_members (group_id, user_id, added_by) values (p_group, p_user, auth.uid())
  on conflict do nothing;
end $$;

-- تشيل نفسك (تسيب المجموعة)، أو صاحب المجموعة أو الأدمن يشيل حد تاني
create or replace function public.chat_group_remove_member(p_group bigint, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare creator uuid;
begin
  select created_by into creator from public.chat_groups where id = p_group;
  if p_user is distinct from auth.uid() and creator is distinct from auth.uid() and not public.is_admin() then
    raise exception 'not_allowed';
  end if;
  delete from public.chat_group_members where group_id = p_group and user_id = p_user;
end $$;

create or replace function public.chat_group_rename(p_group bigint, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare creator uuid; team boolean;
begin
  select created_by, is_team into creator, team from public.chat_groups where id = p_group;
  if team then raise exception 'cannot_rename_team_chat'; end if;
  if creator is distinct from auth.uid() and not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.chat_groups set name = nullif(btrim(coalesce(p_name, '')), '') where id = p_group;
end $$;

-- كل المحادثات اللي أقدر أشوفها (شات الفريق + مجموعاتي)، والأدمن بيشوف الكل من غير ما يبان
create or replace function public.my_chat_groups()
returns table (id bigint, name text, is_team boolean, created_by uuid, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.is_team, g.created_by, g.created_at
  from public.chat_groups g
  where public.is_chat_member(g.id)
  order by g.is_team desc, g.created_at;
$$;

-- تسجيل إني قريت لحد دلوقتي (بيتجاهل صامت لو الأدمن بيبص على محادثة مش عضو فيها فعليًا)
create or replace function public.mark_chat_read(p_group bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_participant(p_group) then return; end if;
  insert into public.chat_reads (group_id, user_id, member, last_read_at)
  values (p_group, auth.uid(), public.my_name(), now())
  on conflict (group_id, user_id) do update set last_read_at = now(), member = excluded.member;
end $$;

-- "امسحها من عندي بس"
create or replace function public.chat_hide_for_me(p_message bigint)
returns void language plpgsql security definer set search_path = public as $$
declare gid bigint;
begin
  select group_id into gid from public.chat_messages where id = p_message;
  if gid is null or not public.is_chat_member(gid) then raise exception 'not_member'; end if;
  insert into public.chat_message_hides (message_id, user_id) values (p_message, auth.uid())
  on conflict do nothing;
end $$;

-- "امسحها من عند الكل": اللي بعتها أو الأدمن بس
create or replace function public.chat_delete_for_everyone(p_message bigint)
returns void language plpgsql security definer set search_path = public as $$
declare row public.chat_messages%rowtype;
begin
  select * into row from public.chat_messages where id = p_message;
  if not found then return; end if;
  if row.created_by is distinct from auth.uid() and not public.is_admin() then
    raise exception 'only_sender_or_admin_can_delete';
  end if;
  update public.chat_messages
     set body = '', attachments = '[]', deleted_at = now(),
         deleted_by = case when public.is_group_participant(row.group_id) then public.my_name() end
   where id = p_message;
end $$;

-- الحرّاس: بس صاحب الرسالة يعدّلها (من غير حد وقت)، وأي عضو في المحادثة يثبّتها، ومفيش تعديل بعد المسح
create or replace function public.chat_messages_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pin  timestamptz;
  txt  text;
  atts jsonb;
begin
  if tg_op = 'INSERT' then
    new.author     := coalesce(public.my_name(), new.author);
    new.created_by := auth.uid();
    new.pinned_at  := null;
    new.edited_at  := null;
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;
  if current_setting('app.renaming', true) = 'on' or auth.uid() is null then return new; end if;
  if new.deleted_at is not null and old.deleted_at is null then
    return new; -- بيتم بس من خلال chat_delete_for_everyone
  end if;
  if old.deleted_at is not null then
    raise exception 'message_deleted';
  end if;
  pin  := new.pinned_at;
  txt  := new.body;
  atts := new.attachments;
  if (txt, atts) is not distinct from (old.body, old.attachments) then
    -- تثبيت أو شيل تثبيت بس
    if not public.is_group_participant(old.group_id) then raise exception 'not_member'; end if;
    new := old;
    new.pinned_at := pin;
    return new;
  end if;
  if old.created_by is distinct from auth.uid() then
    raise exception 'only_sender_can_edit';
  end if;
  new := old;
  new.body        := txt;
  new.attachments := atts;
  new.pinned_at   := pin;
  new.edited_at   := now();
  return new;
end $$;

drop trigger if exists chat_messages_guard on public.chat_messages;
create trigger chat_messages_guard before insert or update on public.chat_messages
  for each row execute function public.chat_messages_guard();

create or replace function public.chat_group_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.added_by := auth.uid();
  return new;
end $$;

drop trigger if exists chat_group_members_guard on public.chat_group_members;
create trigger chat_group_members_guard before insert on public.chat_group_members
  for each row execute function public.chat_group_members_guard();

-- إشعار لكل رسالة جديدة (دالة notify_team متعرّفة فوق)
drop trigger if exists chat_messages_notify on public.chat_messages;
create trigger chat_messages_notify after insert on public.chat_messages
  for each row execute function public.notify_team();

-- الردود السريعة على رسايل الشات
create table if not exists public.chat_reactions (
  message_id  bigint      not null references public.chat_messages(id) on delete cascade,
  user_id     uuid        not null default auth.uid(),
  member      text,
  emoji       text        not null check (emoji in ('👍', '✅', '👀', '❤️', '😂')),
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create or replace function public.chat_msg_group(p_message bigint)
returns bigint language sql stable security definer set search_path = public as $$
  select group_id from public.chat_messages where id = p_message;
$$;

drop trigger if exists chat_reactions_guard on public.chat_reactions;
create trigger chat_reactions_guard before insert on public.chat_reactions
  for each row execute function public.comment_reactions_guard();

-- نقاش المشكلة: "امسحها من عندي" و"امسحها من عند الكل" (صاحبها أو الأدمن)
create or replace function public.comment_hide_for_me(p_comment bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_team_member() then raise exception 'not_member'; end if;
  insert into public.comment_hides (comment_id, user_id) values (p_comment, auth.uid())
  on conflict do nothing;
end $$;

create or replace function public.comment_delete_for_everyone(p_comment bigint)
returns void language plpgsql security definer set search_path = public as $$
declare row public.problem_comments%rowtype;
begin
  select * into row from public.problem_comments where id = p_comment;
  if not found then return; end if;
  if not public.is_team_member() then raise exception 'not_member'; end if;
  if not public.owns_comment(row.created_by, row.author) and not public.is_admin() then
    raise exception 'only_sender_or_admin_can_delete';
  end if;
  update public.problem_comments
     set body = '', attachments = '[]', deleted_at = now(), deleted_by = public.my_name()
   where id = p_comment;
end $$;

-- الصلاحيات: القراءة للأعضاء (والأدمن)، والكتابة بس للأعضاء الحقيقيين، والتعديل والحذف من خلال الدوال بس
do $$
declare t text;
begin
  foreach t in array array['chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_hides', 'chat_reads',
                           'chat_reactions', 'comment_hides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

drop policy if exists "chat groups read" on public.chat_groups;
create policy "chat groups read" on public.chat_groups for select to authenticated
  using ((select public.is_chat_member(id)));
grant select on public.chat_groups to authenticated;

drop policy if exists "chat members read" on public.chat_group_members;
create policy "chat members read" on public.chat_group_members for select to authenticated
  using ((select public.is_chat_member(group_id)));
grant select on public.chat_group_members to authenticated;

drop policy if exists "chat messages read"   on public.chat_messages;
drop policy if exists "chat messages insert" on public.chat_messages;
drop policy if exists "chat messages update" on public.chat_messages;
create policy "chat messages read"   on public.chat_messages for select to authenticated
  using ((select public.is_chat_member(group_id)));
create policy "chat messages insert" on public.chat_messages for insert to authenticated
  with check ((select public.is_group_participant(group_id)));
create policy "chat messages update" on public.chat_messages for update to authenticated
  using ((select public.is_chat_member(group_id))) with check ((select public.is_chat_member(group_id)));
grant select, insert on public.chat_messages to authenticated;
grant update (body, attachments, pinned_at) on public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_id_seq to authenticated;

drop policy if exists "chat hides own" on public.chat_message_hides;
create policy "chat hides own" on public.chat_message_hides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.chat_message_hides to authenticated;

drop policy if exists "chat reads read" on public.chat_reads;
create policy "chat reads read" on public.chat_reads for select to authenticated
  using ((select public.is_chat_member(group_id)));
grant select on public.chat_reads to authenticated;

drop policy if exists "chat reactions read"   on public.chat_reactions;
drop policy if exists "chat reactions insert" on public.chat_reactions;
drop policy if exists "chat reactions delete" on public.chat_reactions;
create policy "chat reactions read" on public.chat_reactions for select to authenticated
  using (public.is_chat_member(public.chat_msg_group(message_id)));
create policy "chat reactions insert" on public.chat_reactions for insert to authenticated
  with check (public.is_group_participant(public.chat_msg_group(message_id)));
create policy "chat reactions delete" on public.chat_reactions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.chat_reactions to authenticated;

-- نقاش المشكلة: صاحب الرسالة بيعدّلها، وكل واحد يخفي اللي عايزه من عنده
drop policy if exists "comments update" on public.problem_comments;
create policy "comments update" on public.problem_comments for update to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
grant update (body, attachments) on public.problem_comments to authenticated;

drop policy if exists "comment hides own" on public.comment_hides;
create policy "comment hides own" on public.comment_hides for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, delete on public.comment_hides to authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_group_participant(bigint)', 'public.is_chat_member(bigint)',
    'public.create_chat_group(text, uuid[])', 'public.chat_group_add_member(bigint, uuid)',
    'public.chat_group_remove_member(bigint, uuid)', 'public.chat_group_rename(bigint, text)',
    'public.my_chat_groups()', 'public.mark_chat_read(bigint)',
    'public.chat_hide_for_me(bigint)', 'public.chat_delete_for_everyone(bigint)',
    'public.chat_msg_group(bigint)', 'public.owns_comment(uuid, text)',
    'public.comment_hide_for_me(bigint)', 'public.comment_delete_for_everyone(bigint)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- =====================================================================
-- 6) مخازن الصور والملفات
-- =====================================================================
do $$ begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('problem-images', 'problem-images', true, 5242880,
          array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  -- ملفات النقاش: صور وملفات ورسايل صوتية، لحد 10 ميجا
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('chat-files', 'chat-files', true, 10485760)
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;

  drop policy if exists "team images read"   on storage.objects;
  drop policy if exists "team images upload" on storage.objects;
  drop policy if exists "team images delete" on storage.objects;
  drop policy if exists "team files read"    on storage.objects;
  drop policy if exists "team files upload"  on storage.objects;
  drop policy if exists "team files delete"  on storage.objects;

  create policy "team files read" on storage.objects for select to authenticated
    using (bucket_id in ('problem-images', 'chat-files') and (select public.is_team_member()));
  create policy "team files upload" on storage.objects for insert to authenticated
    with check (bucket_id in ('problem-images', 'chat-files') and (select public.is_team_member()));
  create policy "team files delete" on storage.objects for delete to authenticated
    using (bucket_id in ('problem-images', 'chat-files') and (select public.is_team_member()));
exception when others then
  raise notice 'storage setup skipped: %', sqlerrm;
end $$;

-- =====================================================================
-- 7) التحديث اللحظي، والإضافات، والمواعيد
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['team_problems', 'problem_comments', 'members', 'team_settings', 'problem_events',
                           'comment_reactions', 'problem_reads', 'reminders', 'problem_links',
                           'chat_groups', 'chat_group_members', 'chat_messages', 'chat_message_hides',
                           'chat_reads', 'chat_reactions', 'comment_hides'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then
  raise notice 'realtime setup skipped: %', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net skipped: %', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron skipped: %', sqlerrm;
end $$;

do $$ begin
  perform cron.schedule('team-problems-tick', '*/5 * * * *', 'select public.notify_tick()');
exception when others then
  raise notice 'cron schedule skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
