-- =====================================================================
-- CRM لموقع Syneixa SmartChat: الجداول والعروض والدوال والسياسات
-- =====================================================================
-- التشغيل: من SQL Editor في Supabase. الأول على Supabase التجريبي بتاع وكيل الموقع، وبعد المراجعة على الحقيقي.
-- ممكن يتشغّل أكتر من مرة من غير مشاكل (idempotent).
-- لا يلمس أي جدول موجود غير إنه بيضيف: فهارس، و trigger واحد على orders (بيملى جدول order_lines).
-- الـ trigger مصمم إنه ما يفشلش أبدًا (أي خطأ فيه بيتحوّل لتحذير)، فمش هيأثر على تسجيل الأوردرات من البوت.
-- لازم الجداول دي تكون موجودة: businesses, business_users, orders, complaints, audit_log.
-- مين يشوف الـ CRM: المالك (owner) والمدير (manager) بس. الموظف (staff) لأ.
--
-- لتجربة العرض من SQL Editor كأنك مستخدم من الموقع:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<user uuid من auth.users>', true);
--   select set_config('request.jwt.claims', '{"sub":"<user uuid من auth.users>","role":"authenticated"}', true);
--   select * from crm_customers where business_id = '<business uuid>' limit 5;
--   rollback;
-- =====================================================================

-- ---------- 0) دوال مساعدة (نفس اللي في ملف سياسات الأمان، آمنة لو اتعادت) ----------
create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_users u where u.business_id = b and u.user_id = auth.uid());
$$;
create or replace function public.is_manager(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_users u where u.business_id = b and u.user_id = auth.uid() and u.role in ('owner','manager'));
$$;
create or replace function public.is_owner(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.business_users u where u.business_id = b and u.user_id = auth.uid() and u.role = 'owner');
$$;
revoke execute on function public.is_member(uuid), public.is_manager(uuid), public.is_owner(uuid) from public, anon;
grant execute on function public.is_member(uuid), public.is_manager(uuid), public.is_owner(uuid) to authenticated, service_role;

-- ---------- 1) دوال التوقيت والأرقام والأسماء ----------
-- يوم العمل بتوقيت القاهرة (start_hour = ساعة بداية يوم المطعم، زي businesses.day_start_hour)
create or replace function public.crm_biz_day(ts timestamptz, start_hour int default 0) returns date
language sql stable as $$
  select ((ts at time zone 'Africa/Cairo') - make_interval(hours => coalesce(start_hour, 0)))::date
$$;

-- توحيد رقم الموبايل المصري: بيرجّع 11 رقم (01xxxxxxxxx) أو null لو مش صالح
create or replace function public.crm_norm_phone(t text) returns text
language plpgsql immutable as $$
declare d text;
begin
  if t is null then return null; end if;
  d := translate(t, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '\D', '', 'g');
  if d like '0020%' then d := substr(d, 5);
  elsif d like '20%' and length(d) = 12 then d := substr(d, 3);
  end if;
  if length(d) = 10 and d like '1%' then d := '0' || d; end if;
  if d ~ '^01[0125][0-9]{8}$' then return d; end if;
  return null;
end $$;

-- مفتاح العميل: الموبايل (phone ثم phone2)، ولو مفيش فمعرّف المحادثة. أوردرات العملاء المحذوفين = null
create or replace function public.crm_customer_key(p1 text, p2 text, sid text) returns text
language sql immutable as $$
  select coalesce(
    public.crm_norm_phone(p1),
    public.crm_norm_phone(p2),
    case when nullif(btrim(coalesce(sid, '')), '') is not null and btrim(sid) <> 'deleted' then 'psid:' || btrim(sid) end
  )
$$;

-- توحيد اسم الصنف للتجميع (حروف مختلفة لنفس الكلمة)
create or replace function public.crm_norm_name(t text) returns text
language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(t, ''), 'أإآٱىة', 'ااااي' || 'ه')), '\s+', ' ', 'g'))
$$;

-- تفكيك نص الأوردر (order_items) لأسطر: كمية + اسم + سعر مكتوب (تقريبي)
-- بيدعم: "1 صنف - 85 جنيه" و "1 صنف: 160 جنيه" و "1 صنف (85 جنيه)" و "1 صنف + 1 صنف تاني" في نفس السطر.
create or replace function public.crm_parse_order_items(p_items text)
returns table(line_no int, qty int, item_name text, listed_price numeric)
language plpgsql immutable as $$
declare
  txt text; ln text; seg text; m text[]; q int; nm text; pr numeric; n int := 0;
begin
  if p_items is null or btrim(p_items) = '' then return; end if;
  txt := translate(replace(p_items, E'\r', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  foreach ln in array regexp_split_to_array(txt, E'\n') loop
    ln := btrim(ln);
    continue when ln = '';
    foreach seg in array regexp_split_to_array(ln, '\s+\+\s+(?=[0-9]+\s)') loop
      seg := btrim(regexp_replace(seg, '^[-•*·\s]+', ''));
      continue when seg = '';
      continue when seg ~* '^(الاجمالي|الإجمالي|اجمالي|إجمالي|المجموع|رسوم|total|delivery fee)';
      pr := null;
      m := regexp_match(seg, '\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:جنيه|جنية|ج\.م|ج|EGP|le)?\s*\)\s*$', 'i');
      if m is not null then
        pr := m[1]::numeric;
        seg := btrim(regexp_replace(seg, '\(\s*[0-9]+(?:\.[0-9]+)?\s*(?:جنيه|جنية|ج\.م|ج|EGP|le)?\s*\)\s*$', '', 'i'));
      else
        m := regexp_match(seg, '\s*[-–—:]\s*([0-9]+(?:\.[0-9]+)?)\s*(?:جنيه|جنية|ج\.م|ج|EGP|le)?\s*$', 'i');
        if m is not null then
          pr := m[1]::numeric;
          seg := btrim(regexp_replace(seg, '\s*[-–—:]\s*[0-9]+(?:\.[0-9]+)?\s*(?:جنيه|جنية|ج\.م|ج|EGP|le)?\s*$', '', 'i'));
        end if;
      end if;
      m := regexp_match(seg, '^([0-9]{1,3})\s*[xX×]?\s+(.+)$');
      if m is not null then q := m[1]::int; nm := m[2]; else q := 1; nm := seg; end if;
      nm := btrim(regexp_replace(nm, '\s+', ' ', 'g'));
      nm := btrim(nm, ' -:،,.');
      continue when nm = '' or length(nm) < 2;
      n := n + 1;
      line_no := n;
      qty := greatest(least(q, 99), 1);
      item_name := left(nm, 120);
      listed_price := pr;
      return next;
    end loop;
  end loop;
end $$;

-- ---------- 2) جداول جديدة ----------
-- 2.1 أسطر الأوردرات (بتتملي أوتوماتيك من orders.order_items بالـ trigger)
do $$
declare idtype text;
begin
  if to_regclass('public.order_lines') is null then
    select format_type(a.atttypid, a.atttypmod) into idtype
      from pg_attribute a where a.attrelid = 'public.orders'::regclass and a.attname = 'id';
    execute format($f$
      create table public.order_lines (
        id bigint generated by default as identity primary key,
        order_id %s not null references public.orders(id) on delete cascade,
        business_id uuid not null,
        line_no int not null,
        qty int not null check (qty between 1 and 99),
        item_name text not null,
        name_norm text not null,
        listed_price numeric,
        created_at timestamptz not null default now()
      )$f$, idtype);
  end if;
end $$;
create index if not exists order_lines_order_idx on public.order_lines (order_id);
create index if not exists order_lines_biz_name_idx on public.order_lines (business_id, name_norm);

-- 2.2 إعدادات الشرائح لكل مطعم (لو مفيش صف بتتطبق القيم الافتراضية)
create table if not exists public.crm_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  new_days int not null default 14 check (new_days between 1 and 365),
  active_days int not null default 30 check (active_days between 1 and 365),
  lost_days int not null default 90 check (lost_days between 2 and 730),
  vip_min_orders int not null default 5 check (vip_min_orders between 2 and 1000),
  vip_min_spent numeric not null default 2000 check (vip_min_spent between 0 and 10000000),
  updated_at timestamptz not null default now(),
  check (lost_days > active_days)
);

-- 2.3 ملف إضافي للعميل (وسوم، موافقة تسويقية، عيد ميلاد، اسم مفضّل)
create table if not exists public.customer_profiles (
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_key text not null check (customer_key ~ '^(01[0125][0-9]{8}|psid:[0-9A-Za-z_-]{3,64})$'),
  preferred_name text check (preferred_name is null or char_length(preferred_name) <= 60),
  tags text[] not null default '{}',
  marketing_consent text not null default 'unknown' check (marketing_consent in ('unknown','yes','no')),
  consent_at timestamptz,
  birthday date,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, customer_key)
);

-- 2.4 ملاحظات على العميل
create table if not exists public.customer_notes (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_key text not null check (customer_key ~ '^(01[0125][0-9]{8}|psid:[0-9A-Za-z_-]{3,64})$'),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  pinned boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists customer_notes_idx on public.customer_notes (business_id, customer_key, created_at desc);

-- 2.5 شرائح محفوظة (فلاتر بيسميها المطعم)
create table if not exists public.crm_saved_segments (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  filters jsonb not null default '{}'::jsonb check (char_length(filters::text) <= 4000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists crm_saved_segments_idx on public.crm_saved_segments (business_id);

-- 2.6 عملاء مستوردين من نظام كاشير (للمستقبل، الجدول جاهز، والاستيراد بدالة crm_import_customers)
-- لو تاريخ آخر أوردر مش موجود في الملف المستورد بنستخدم تاريخ الاستيراد كتاريخ آخر نشاط.
create table if not exists public.crm_external_customers (
  id bigint generated by default as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null check (source ~ '^[a-z0-9_]{2,30}$'),
  external_id text,
  customer_key text not null check (customer_key ~ '^01[0125][0-9]{8}$'),
  name text check (name is null or char_length(name) <= 80),
  orders_count int not null default 0 check (orders_count >= 0),
  total_spent numeric(14,2) not null default 0 check (total_spent >= 0),
  first_order_at timestamptz,
  last_order_at timestamptz,
  import_batch uuid,
  imported_at timestamptz not null default now(),
  unique (business_id, source, customer_key)
);

-- فهارس على جداول موجودة (لو مش موجودة)
create index if not exists crm_orders_biz_created_idx on public.orders (business_id, created_at);
create index if not exists crm_orders_biz_phone_idx on public.orders (business_id, phone);
create index if not exists crm_complaints_biz_idx on public.complaints (business_id, created_at);

-- ---------- 3) trigger: ملء order_lines (ما يفشلش أبدًا) ----------
create or replace function public.crm_sync_order_lines() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'UPDATE' and new.order_items is not distinct from old.order_items then
      return new;
    end if;
    delete from public.order_lines where order_id = new.id;
    insert into public.order_lines (order_id, business_id, line_no, qty, item_name, name_norm, listed_price)
    select new.id, new.business_id, p.line_no, p.qty, p.item_name, public.crm_norm_name(p.item_name), p.listed_price
    from public.crm_parse_order_items(new.order_items) p;
  exception when others then
    raise warning 'crm_sync_order_lines فشلت للأوردر %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists crm_sync_order_lines_trg on public.orders;
create trigger crm_sync_order_lines_trg after insert or update of order_items on public.orders
  for each row execute function public.crm_sync_order_lines();

-- تعبئة الأوردرات القديمة (مرة واحدة، آمنة لو اتعادت)
insert into public.order_lines (order_id, business_id, line_no, qty, item_name, name_norm, listed_price)
select o.id, o.business_id, p.line_no, p.qty, p.item_name, public.crm_norm_name(p.item_name), p.listed_price
from public.orders o
cross join lateral public.crm_parse_order_items(o.order_items) p
where not exists (select 1 from public.order_lines l where l.order_id = o.id);

-- ---------- 4) تحقق مدخلات المستخدم (لمستخدمي الموقع بس) ----------
create or replace function public.crm_check_inputs() returns trigger
language plpgsql as $$
declare t text; j jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  j := to_jsonb(new);
  if tg_table_name = 'customer_profiles' then
    if new.preferred_name is not null and new.preferred_name ~ '(\[|\]|\{\{|\}\})' then
      raise exception 'الاسم فيه أقواس [ ] أو {{ }} ممنوعة' using errcode = '22023'; end if;
    if coalesce(array_length(new.tags, 1), 0) > 10 then
      raise exception 'أقصى عدد وسوم 10' using errcode = '22023'; end if;
    foreach t in array new.tags loop
      if t is null or char_length(btrim(t)) = 0 or char_length(t) > 24 then
        raise exception 'الوسم من 1 لـ 24 حرف' using errcode = '22023'; end if;
      if t ~ '(\[|\]|\{\{|\}\})' then
        raise exception 'الوسم فيه أقواس ممنوعة' using errcode = '22023'; end if;
    end loop;
    if tg_op = 'INSERT' or new.marketing_consent is distinct from old.marketing_consent then
      new.consent_at := case when new.marketing_consent = 'unknown' then null else now() end;
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  elsif tg_table_name = 'customer_notes' then
    if new.body ~ '(\[|\]|\{\{|\}\})' then
      raise exception 'الملاحظة فيها أقواس [ ] أو {{ }} ممنوعة' using errcode = '22023'; end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    if tg_op = 'INSERT' and new.created_by is distinct from auth.uid() then
      raise exception 'created_by لازم يكون المستخدم الحالي' using errcode = '42501'; end if;
  elsif tg_table_name = 'crm_saved_segments' then
    if new.name ~ '(\[|\]|\{\{|\}\})' then
      raise exception 'الاسم فيه أقواس ممنوعة' using errcode = '22023'; end if;
    if tg_op = 'INSERT' and (select count(*) from public.crm_saved_segments s where s.business_id = new.business_id) >= 30 then
      raise exception 'أقصى عدد شرائح محفوظة 30' using errcode = '22023'; end if;
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif tg_table_name = 'crm_settings' then
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists crm_check_profiles_trg on public.customer_profiles;
create trigger crm_check_profiles_trg before insert or update on public.customer_profiles
  for each row execute function public.crm_check_inputs();
drop trigger if exists crm_check_notes_trg on public.customer_notes;
create trigger crm_check_notes_trg before insert or update on public.customer_notes
  for each row execute function public.crm_check_inputs();
drop trigger if exists crm_check_segments_trg on public.crm_saved_segments;
create trigger crm_check_segments_trg before insert or update on public.crm_saved_segments
  for each row execute function public.crm_check_inputs();
drop trigger if exists crm_check_settings_trg on public.crm_settings;
create trigger crm_check_settings_trg before insert or update on public.crm_settings
  for each row execute function public.crm_check_inputs();

-- ---------- 5) العرض الرئيسي: العملاء مجمّعين (صف لكل عميل) ----------
-- بيشتغل بصلاحيات المستخدم (security_invoker) وبيرجّع بس مطاعم المستخدم فيها owner أو manager.
create or replace view public.crm_customers with (security_invoker = true) as
with my_biz as (
  select bu.business_id from public.business_users bu
  where bu.user_id = auth.uid() and bu.role in ('owner', 'manager')
),
ord as (
  select o.business_id, o.id, o.created_at, coalesce(o.status, 'new') as status, coalesce(o.total, 0) as total,
         o.rating, o.order_type, o.customer_name, o.customer_title, o.phone, o.phone2, o.address, o.sender_id,
         public.crm_customer_key(o.phone, o.phone2, o.sender_id) as customer_key
  from public.orders o
  where o.business_id in (select business_id from my_biz)
),
ok as (
  select * from ord where customer_key is not null and status not in ('cancelled', 'rejected')
),
bot_agg as (
  select business_id, customer_key,
    min(created_at) as first_order_at,
    max(created_at) as last_order_at,
    count(*)::int as orders_count,
    sum(total) as total_spent,
    avg(rating) filter (where rating is not null) as avg_rating,
    (count(rating) filter (where rating is not null))::int as rated_count,
    (count(*) filter (where order_type = 'delivery'))::int as delivery_orders_count,
    (count(*) filter (where order_type = 'pickup'))::int as pickup_orders_count,
    (array_agg(nullif(btrim(customer_name), '') order by created_at desc) filter (where nullif(btrim(customer_name), '') is not null))[1] as name,
    (array_agg(nullif(btrim(customer_title), '') order by created_at desc) filter (where nullif(btrim(customer_title), '') is not null))[1] as title,
    (array_agg(public.crm_norm_phone(phone2) order by created_at desc) filter (where public.crm_norm_phone(phone2) is not null))[1] as phone2,
    (array_agg(nullif(btrim(address), '') order by created_at desc) filter (where nullif(btrim(address), '') is not null))[1] as address,
    (array_agg(sender_id order by created_at desc) filter (where sender_id is not null and sender_id <> 'deleted'))[1] as last_sender_id
  from ok group by business_id, customer_key
),
cancelled as (
  select business_id, customer_key, count(*)::int as cancelled_count
  from ord where customer_key is not null and status in ('cancelled', 'rejected')
  group by business_id, customer_key
),
fav as (
  select distinct on (business_id, customer_key) business_id, customer_key, item_name as favorite_item, q::int as favorite_item_qty
  from (
    select ok.business_id, ok.customer_key, ol.name_norm,
           (array_agg(ol.item_name order by ol.id desc))[1] as item_name, sum(ol.qty) as q
    from ok join public.order_lines ol on ol.order_id = ok.id
    group by ok.business_id, ok.customer_key, ol.name_norm
  ) s
  order by business_id, customer_key, q desc, item_name
),
sid as (
  select distinct business_id, sender_id, customer_key from ok where sender_id is not null and sender_id <> 'deleted'
),
cmp as (
  select c.business_id, coalesce(public.crm_norm_phone(c.phone), s.customer_key) as customer_key, c.status
  from public.complaints c
  left join sid s on s.business_id = c.business_id and s.sender_id = c.sender_id
  where c.business_id in (select business_id from my_biz)
),
cmp_agg as (
  select business_id, customer_key, count(*)::int as complaints_count,
         (count(*) filter (where coalesce(status, 'open') = 'open'))::int as open_complaints_count
  from cmp where customer_key is not null group by business_id, customer_key
),
ext as (
  select e.business_id, e.customer_key,
         sum(e.orders_count)::int as pos_orders_count, sum(e.total_spent) as pos_total_spent,
         min(coalesce(e.first_order_at, e.last_order_at, e.imported_at)) as pos_first_order_at,
         max(coalesce(e.last_order_at, e.imported_at)) as pos_last_order_at,
         (array_agg(e.name order by e.imported_at desc) filter (where e.name is not null))[1] as name
  from public.crm_external_customers e
  where e.business_id in (select business_id from my_biz)
  group by e.business_id, e.customer_key
),
notes as (
  select business_id, customer_key, count(*)::int as notes_count
  from public.customer_notes where business_id in (select business_id from my_biz)
  group by business_id, customer_key
),
joined as (
  select coalesce(b.business_id, e.business_id) as business_id,
         coalesce(b.customer_key, e.customer_key) as customer_key,
         b.name as bot_name, e.name as pos_name, b.title, b.phone2, b.address, b.last_sender_id,
         coalesce(b.orders_count, 0) as bot_orders_count,
         coalesce(e.pos_orders_count, 0) as pos_orders_count,
         coalesce(b.total_spent, 0) as bot_total_spent,
         coalesce(e.pos_total_spent, 0) as pos_total_spent,
         least(b.first_order_at, e.pos_first_order_at) as first_order_at,
         greatest(b.last_order_at, e.pos_last_order_at) as last_order_at,
         b.avg_rating, coalesce(b.rated_count, 0) as rated_count,
         coalesce(b.delivery_orders_count, 0) as delivery_orders_count,
         coalesce(b.pickup_orders_count, 0) as pickup_orders_count
  from bot_agg b
  full join ext e on e.business_id = b.business_id and e.customer_key = b.customer_key
)
select
  j.business_id,
  j.customer_key,
  coalesce(nullif(p.preferred_name, ''), j.bot_name, j.pos_name,
           case when j.customer_key like 'psid:%' then 'عميل ماسنجر' else j.customer_key end) as display_name,
  j.title,
  case when j.customer_key like 'psid:%' then null else j.customer_key end as phone,
  j.phone2,
  j.address,
  j.last_sender_id,
  j.first_order_at,
  j.last_order_at,
  ((now() at time zone 'Africa/Cairo')::date - (j.last_order_at at time zone 'Africa/Cairo')::date) as days_since_last,
  (j.bot_orders_count + j.pos_orders_count) as orders_count,
  j.bot_orders_count,
  j.pos_orders_count,
  coalesce(c.cancelled_count, 0) as cancelled_count,
  (j.bot_total_spent + j.pos_total_spent) as total_spent,
  case when (j.bot_orders_count + j.pos_orders_count) > 0
       then round((j.bot_total_spent + j.pos_total_spent) / (j.bot_orders_count + j.pos_orders_count), 2) end as avg_order_value,
  round(j.avg_rating::numeric, 1) as avg_rating,
  j.rated_count,
  j.delivery_orders_count,
  j.pickup_orders_count,
  case when j.delivery_orders_count > j.pickup_orders_count then 'delivery'
       when j.pickup_orders_count > j.delivery_orders_count then 'pickup'
       when j.delivery_orders_count > 0 then 'delivery' end as preferred_order_type,
  f.favorite_item,
  f.favorite_item_qty,
  coalesce(ca.complaints_count, 0) as complaints_count,
  coalesce(ca.open_complaints_count, 0) as open_complaints_count,
  coalesce(n.notes_count, 0) as notes_count,
  case
    when (j.bot_orders_count + j.pos_orders_count) = 1
         and ((now() at time zone 'Africa/Cairo')::date - (j.last_order_at at time zone 'Africa/Cairo')::date) <= coalesce(s.new_days, 14) then 'new'
    when ((now() at time zone 'Africa/Cairo')::date - (j.last_order_at at time zone 'Africa/Cairo')::date) <= coalesce(s.active_days, 30) then 'active'
    when ((now() at time zone 'Africa/Cairo')::date - (j.last_order_at at time zone 'Africa/Cairo')::date) <= coalesce(s.lost_days, 90) then 'at_risk'
    else 'lost'
  end as lifecycle,
  ((j.bot_orders_count + j.pos_orders_count) >= coalesce(s.vip_min_orders, 5)
    or (j.bot_total_spent + j.pos_total_spent) >= coalesce(s.vip_min_spent, 2000)) as is_vip,
  ((j.bot_orders_count + j.pos_orders_count) >= 2) as is_repeat,
  array_remove(array[case when j.bot_orders_count > 0 then 'bot' end, case when j.pos_orders_count > 0 then 'pos' end], null) as sources,
  coalesce(p.tags, '{}'::text[]) as tags,
  coalesce(p.marketing_consent, 'unknown') as marketing_consent,
  p.birthday
from joined j
left join cancelled c on c.business_id = j.business_id and c.customer_key = j.customer_key
left join fav f on f.business_id = j.business_id and f.customer_key = j.customer_key
left join cmp_agg ca on ca.business_id = j.business_id and ca.customer_key = j.customer_key
left join notes n on n.business_id = j.business_id and n.customer_key = j.customer_key
left join public.crm_settings s on s.business_id = j.business_id
left join public.customer_profiles p on p.business_id = j.business_id and p.customer_key = j.customer_key
where j.last_order_at is not null;

-- ---------- 6) دوال التقارير (للمالك والمدير فقط) ----------
-- نظرة عامة: مؤشرات الفترة والفترة السابقة لها، سلسلة زمنية، خريطة حرارية، أفضل الأصناف والعملاء...
create or replace function public.crm_overview(p_business uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  sh int; d_to date; d_from date; len int; pv_to date; pv_from date; res jsonb;
begin
  if auth.uid() is null or not public.is_manager(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(b.day_start_hour, 0) into sh from public.businesses b where b.id = p_business;
  sh := coalesce(sh, 0);
  d_to := coalesce(p_to, public.crm_biz_day(now(), sh));
  d_from := coalesce(p_from, d_to - 29);
  if d_from > d_to then raise exception 'bad range' using errcode = '22023'; end if;
  len := d_to - d_from + 1;
  if len > 366 then raise exception 'range too long' using errcode = '22023'; end if;
  pv_to := d_from - 1;
  pv_from := pv_to - (len - 1);

  with o as (
    select x.id, x.created_at,
           public.crm_biz_day(x.created_at, sh) as d,
           extract(hour from (x.created_at at time zone 'Africa/Cairo'))::int as hr,
           extract(dow from ((x.created_at at time zone 'Africa/Cairo') - make_interval(hours => sh)))::int as dow,
           (coalesce(x.status, 'new') not in ('cancelled', 'rejected')) as valid,
           coalesce(x.total, 0) as total, x.rating, x.order_type, x.customer_name,
           public.crm_customer_key(x.phone, x.phone2, x.sender_id) as k
    from public.orders x where x.business_id = p_business
  ),
  ranked as (
    select k, d, row_number() over (partition by k order by created_at, id) as rn
    from o where valid and k is not null
  ),
  cust as (
    select k, min(d) filter (where rn = 1) as first_d, min(d) filter (where rn = 2) as second_d
    from ranked group by k
  ),
  win(w, a, b) as (values ('cur'::text, d_from, d_to), ('prev'::text, pv_from, pv_to)),
  kp as (
    select w.w,
      (select count(*) from o where o.valid and o.d between w.a and w.b) as orders,
      (select coalesce(sum(o.total), 0) from o where o.valid and o.d between w.a and w.b) as revenue,
      (select count(distinct o.k) from o where o.valid and o.k is not null and o.d between w.a and w.b) as active_customers,
      (select count(*) from cust c where c.first_d between w.a and w.b) as new_customers,
      (select count(*) from o where not o.valid and o.d between w.a and w.b) as cancelled,
      (select count(*) from o where o.d between w.a and w.b) as all_orders,
      (select avg(o.rating) from o where o.valid and o.rating is not null and o.d between w.a and w.b) as avg_rating,
      (select count(*) from o where o.valid and o.rating is not null and o.d between w.a and w.b) as rated_count,
      (select count(*) from cust c where c.first_d <= w.b) as customers_total,
      (select count(*) from cust c where c.second_d <= w.b) as repeat_customers
    from win w
  ),
  kpj as (
    select jsonb_object_agg(kp.w, jsonb_build_object(
      'orders', kp.orders,
      'revenue', kp.revenue,
      'avg_order_value', case when kp.orders > 0 then round(kp.revenue / kp.orders, 2) end,
      'active_customers', kp.active_customers,
      'new_customers', kp.new_customers,
      'returning_customers', kp.active_customers - kp.new_customers,
      'orders_per_customer', case when kp.active_customers > 0 then round(kp.orders::numeric / kp.active_customers, 2) end,
      'cancelled_orders', kp.cancelled,
      'cancel_rate', case when kp.all_orders > 0 then round(kp.cancelled::numeric / kp.all_orders, 4) end,
      'avg_rating', case when kp.avg_rating is not null then round(kp.avg_rating::numeric, 2) end,
      'rated_count', kp.rated_count,
      'customers_total', kp.customers_total,
      'repeat_customers', kp.repeat_customers,
      'repeat_rate', case when kp.customers_total > 0 then round(kp.repeat_customers::numeric / kp.customers_total, 4) end
    )) as j from kp
  ),
  ts as (
    select s.day,
           coalesce(a.orders, 0) as orders, coalesce(a.revenue, 0) as revenue,
           coalesce(a.customers, 0) as customers, coalesce(n.new_c, 0) as new_customers
    from generate_series(d_from::timestamp, d_to::timestamp, interval '1 day') g
    cross join lateral (select g::date as day) s
    left join (select o.d, count(*) as orders, sum(o.total) as revenue, count(distinct o.k) as customers
               from o where o.valid and o.d between d_from and d_to group by o.d) a on a.d = s.day
    left join (select first_d, count(*) as new_c from cust where first_d between d_from and d_to group by first_d) n on n.first_d = s.day
  ),
  hm as (
    select dow, hr, count(*) as c from o where valid and d between d_from and d_to group by dow, hr
  ),
  ti as (
    select (array_agg(ol.item_name order by ol.id desc))[1] as name, sum(ol.qty)::int as qty, count(distinct ol.order_id)::int as orders
    from public.order_lines ol join o on o.id = ol.order_id
    where o.valid and o.d between d_from and d_to
    group by ol.name_norm order by sum(ol.qty) desc, (array_agg(ol.item_name order by ol.id desc))[1] limit 10
  ),
  tc as (
    select k as customer_key,
           (array_agg(nullif(btrim(customer_name), '') order by created_at desc) filter (where nullif(btrim(customer_name), '') is not null))[1] as name,
           count(*)::int as orders, sum(total) as spent
    from o where valid and k is not null and d between d_from and d_to
    group by k order by sum(total) desc, count(*) desc limit 10
  ),
  ty as (
    select order_type, count(*)::int as c from o where valid and d between d_from and d_to group by order_type
  ),
  rd as (
    select least(greatest(round(rating)::int, 1), 10) as r, count(*)::int as c
    from o where valid and rating is not null and d between d_from and d_to group by 1
  ),
  seg as (
    select lifecycle, count(*)::int as c, coalesce(sum(total_spent), 0) as spent
    from public.crm_customers where business_id = p_business group by lifecycle
  ),
  vip as (
    select (count(*) filter (where is_vip))::int as vip,
           (count(*) filter (where is_vip and lifecycle in ('at_risk', 'lost')))::int as vip_at_risk,
           (count(*) filter (where open_complaints_count > 0))::int as with_open_complaints,
           count(*)::int as total
    from public.crm_customers where business_id = p_business
  ),
  cm as (
    select (count(*) filter (where public.crm_biz_day(created_at, sh) between d_from and d_to))::int as in_period,
           (count(*) filter (where coalesce(status, 'open') = 'open'))::int as open_now
    from public.complaints where business_id = p_business
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', d_from, 'to', d_to, 'days', len, 'prev_from', pv_from, 'prev_to', pv_to),
    'kpis', (select j -> 'cur' from kpj),
    'kpis_prev', (select j -> 'prev' from kpj),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'orders', orders, 'revenue', revenue, 'customers', customers, 'new_customers', new_customers) order by day) from ts), '[]'::jsonb),
    'heatmap', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'orders', c) order by dow, hr) from hm), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'orders', orders)) from ti), '[]'::jsonb),
    'top_customers', coalesce((select jsonb_agg(jsonb_build_object('customer_key', customer_key, 'name', name, 'orders', orders, 'spent', spent)) from tc), '[]'::jsonb),
    'order_types', jsonb_build_object(
      'delivery', coalesce((select c from ty where order_type = 'delivery'), 0),
      'pickup', coalesce((select c from ty where order_type = 'pickup'), 0)),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('rating', r, 'count', c) order by r) from rd), '[]'::jsonb),
    'segments', jsonb_build_object(
      'new', jsonb_build_object('count', coalesce((select c from seg where lifecycle = 'new'), 0), 'spent', coalesce((select spent from seg where lifecycle = 'new'), 0)),
      'active', jsonb_build_object('count', coalesce((select c from seg where lifecycle = 'active'), 0), 'spent', coalesce((select spent from seg where lifecycle = 'active'), 0)),
      'at_risk', jsonb_build_object('count', coalesce((select c from seg where lifecycle = 'at_risk'), 0), 'spent', coalesce((select spent from seg where lifecycle = 'at_risk'), 0)),
      'lost', jsonb_build_object('count', coalesce((select c from seg where lifecycle = 'lost'), 0), 'spent', coalesce((select spent from seg where lifecycle = 'lost'), 0)),
      'vip', (select vip from vip), 'vip_at_risk', (select vip_at_risk from vip),
      'with_open_complaints', (select with_open_complaints from vip), 'total', (select total from vip)),
    'complaints', jsonb_build_object('in_period', (select in_period from cm), 'open_now', (select open_now from cm))
  ) into res;
  return res;
end $$;

-- يوم العمل الحالي للمطعم (بتوقيت القاهرة وحسب ساعة بداية اليوم). بتتستخدم في اختيار الفترات في الواجهة.
create or replace function public.crm_business_today(p_business uuid)
returns date
language plpgsql stable security definer set search_path = public as $$
declare sh int;
begin
  if auth.uid() is null or not public.is_member(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select coalesce(b.day_start_hour, 0) into sh from public.businesses b where b.id = p_business;
  return public.crm_biz_day(now(), coalesce(sh, 0));
end $$;

-- الاحتفاظ بالعملاء (Cohorts): لكل شهر أول أوردر، كام عميل رجع في الشهور اللي بعده
create or replace function public.crm_cohorts(p_business uuid, p_months int default 6)
returns table(cohort text, cohort_size int, month_offset int, active int)
language plpgsql stable security definer set search_path = public as $$
declare sh int; m int;
begin
  if auth.uid() is null or not public.is_manager(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  m := least(greatest(coalesce(p_months, 6), 1), 12);
  select coalesce(b.day_start_hour, 0) into sh from public.businesses b where b.id = p_business;
  sh := coalesce(sh, 0);
  return query
  with o as (
    select public.crm_customer_key(x.phone, x.phone2, x.sender_id) as k,
           date_trunc('month', public.crm_biz_day(x.created_at, sh))::date as mth
    from public.orders x
    where x.business_id = p_business and coalesce(x.status, 'new') not in ('cancelled', 'rejected')
  ),
  firsts as (select k, min(mth) as cohort_m from o where k is not null group by k),
  act as (select distinct k, mth from o where k is not null),
  cur as (select date_trunc('month', public.crm_biz_day(now(), sh))::date as m_now),
  grid as (
    select f.cohort_m, g.off from (select distinct cohort_m from firsts) f
    cross join generate_series(0, m) g(off)
    cross join cur
    where (f.cohort_m + make_interval(months => g.off))::date <= cur.m_now
      and f.cohort_m >= (cur.m_now - make_interval(months => m))::date
  )
  select to_char(gr.cohort_m, 'YYYY-MM'),
         (select count(*)::int from firsts f where f.cohort_m = gr.cohort_m),
         gr.off,
         (select count(*)::int from firsts f join act a on a.k = f.k
           where f.cohort_m = gr.cohort_m and a.mth = (gr.cohort_m + make_interval(months => gr.off))::date)
  from grid gr
  order by gr.cohort_m, gr.off;
end $$;

-- أكتر أصناف طلبها عميل معيّن
create or replace function public.crm_customer_top_items(p_business uuid, p_key text, p_limit int default 8)
returns table(item_name text, qty int, orders_count int, last_ordered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_manager(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  select (array_agg(ol.item_name order by ol.id desc))[1], sum(ol.qty)::int, count(distinct ol.order_id)::int, max(o.created_at)
  from public.orders o join public.order_lines ol on ol.order_id = o.id
  where o.business_id = p_business and coalesce(o.status, 'new') not in ('cancelled', 'rejected')
    and public.crm_customer_key(o.phone, o.phone2, o.sender_id) = p_key
  group by ol.name_norm
  order by sum(ol.qty) desc, max(o.created_at) desc
  limit least(greatest(coalesce(p_limit, 8), 1), 30);
end $$;

-- خط زمني للعميل: أوردرات وشكاوى وملاحظات (الأحدث أولًا)
create or replace function public.crm_customer_timeline(p_business uuid, p_key text, p_limit int default 100)
returns table(kind text, at timestamptz, ref text, title text, body text, amount numeric, status text, severity text, extra jsonb)
language plpgsql stable security definer set search_path = public as $$
declare lim int := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  if auth.uid() is null or not public.is_manager(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with sids as (
    select distinct o.sender_id from public.orders o
    where o.business_id = p_business and o.sender_id is not null and o.sender_id <> 'deleted'
      and public.crm_customer_key(o.phone, o.phone2, o.sender_id) = p_key
  ),
  items as (
    select 'order'::text as kind, o.created_at as at, o.id::text as ref,
           ('أوردر ' || coalesce(o.daily_number::text, o.id::text)) as title,
           o.order_items as body, coalesce(o.total, 0)::numeric as amount, o.status::text as status,
           null::text as severity,
           jsonb_build_object('order_type', o.order_type, 'rating', o.rating, 'address', o.address, 'daily_number', o.daily_number, 'notes', o.notes) as extra
    from public.orders o
    where o.business_id = p_business and public.crm_customer_key(o.phone, o.phone2, o.sender_id) = p_key
    union all
    select 'complaint', c.created_at, c.id::text, 'شكوى', c.summary, null::numeric, c.status::text, c.severity::text,
           jsonb_build_object('source', c.source, 'rating', c.rating, 'note', c.note, 'resolved_at', c.resolved_at, 'order_id', c.order_id)
    from public.complaints c
    where c.business_id = p_business
      and (public.crm_norm_phone(c.phone) = p_key or c.sender_id in (select sender_id from sids))
    union all
    select 'note', n.created_at, n.id::text, case when n.pinned then 'ملاحظة مثبتة' else 'ملاحظة' end, n.body, null::numeric, null::text, null::text,
           jsonb_build_object('pinned', n.pinned, 'created_by', n.created_by)
    from public.customer_notes n
    where n.business_id = p_business and n.customer_key = p_key
  )
  select i.kind, i.at, i.ref, i.title, i.body, i.amount, i.status, i.severity, i.extra
  from items i order by i.at desc limit lim;
end $$;

-- استيراد عملاء من نظام كاشير (للمرحلة الجاية). p_rows: مصفوفة JSON فيها phone و name و orders_count و total_spent و first_order_at و last_order_at و external_id
create or replace function public.crm_import_customers(p_business uuid, p_source text, p_rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; ph text; ins int := 0; upd int := 0; skp int := 0; errs jsonb := '[]'::jsonb; i int := 0; batch uuid := gen_random_uuid(); was int;
begin
  if auth.uid() is null or not public.is_manager(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source is null or p_source !~ '^[a-z0-9_]{2,30}$' then
    raise exception 'source غير صالح (حروف إنجليزي صغيرة وأرقام و _ من 2 لـ 30)' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows لازم مصفوفة' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'أقصى عدد صفوف في المرة 2000' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    begin
      ph := public.crm_norm_phone(r ->> 'phone');
      if ph is null then
        skp := skp + 1;
        if jsonb_array_length(errs) < 20 then errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'reason', 'رقم موبايل غير صالح')); end if;
        continue;
      end if;
      select count(*) into was from public.crm_external_customers e where e.business_id = p_business and e.source = p_source and e.customer_key = ph;
      insert into public.crm_external_customers (business_id, source, external_id, customer_key, name, orders_count, total_spent, first_order_at, last_order_at, import_batch)
      values (p_business, p_source, nullif(left(r ->> 'external_id', 80), ''), ph, nullif(left(btrim(coalesce(r ->> 'name', '')), 80), ''),
              greatest(coalesce(nullif(r ->> 'orders_count', '')::int, 0), 0),
              greatest(coalesce(nullif(r ->> 'total_spent', '')::numeric, 0), 0),
              nullif(r ->> 'first_order_at', '')::timestamptz, nullif(r ->> 'last_order_at', '')::timestamptz, batch)
      on conflict (business_id, source, customer_key) do update set
        external_id = excluded.external_id, name = excluded.name, orders_count = excluded.orders_count,
        total_spent = excluded.total_spent, first_order_at = excluded.first_order_at,
        last_order_at = excluded.last_order_at, import_batch = excluded.import_batch, imported_at = now();
      if was > 0 then upd := upd + 1; else ins := ins + 1; end if;
    exception when others then
      skp := skp + 1;
      if jsonb_array_length(errs) < 20 then errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'reason', left(sqlerrm, 120))); end if;
    end;
  end loop;
  return jsonb_build_object('inserted', ins, 'updated', upd, 'skipped', skp, 'errors', errs, 'batch', batch);
end $$;

-- مسح كل اللي اتستورد من مصدر معيّن (للمالك)
create or replace function public.crm_delete_import(p_business uuid, p_source text)
returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or not public.is_owner(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.crm_external_customers where business_id = p_business and source = p_source;
  get diagnostics n = row_count;
  return n;
end $$;

-- حذف بيانات عميل نهائيًا (قانون حماية البيانات). للمالك فقط.
-- بيمسح المحادثات والذاكرة والسلة... (لو دالة delete_customer_data موجودة) وبيخفي هويته في الأوردرات والشكاوى.
create or replace function public.crm_forget_customer(p_business uuid, p_key text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  sids text[]; s text; n_orders int := 0; n_complaints int := 0; n_notes int := 0; n_ext int := 0; n_prof int := 0;
begin
  if auth.uid() is null or not public.is_owner(p_business) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key is null or p_key !~ '^(01[0125][0-9]{8}|psid:[0-9A-Za-z_-]{3,64})$' then
    raise exception 'customer_key غير صالح' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct x.sid), '{}') into sids from (
    select o.sender_id as sid from public.orders o
      where o.business_id = p_business and o.sender_id is not null and o.sender_id <> 'deleted'
        and public.crm_customer_key(o.phone, o.phone2, o.sender_id) = p_key
    union
    select c.sender_id from public.complaints c
      where c.business_id = p_business and c.sender_id is not null and c.sender_id <> 'deleted'
        and public.crm_norm_phone(c.phone) = p_key
    union
    select case when p_key like 'psid:%' then substr(p_key, 6) end
  ) x where x.sid is not null;

  if to_regprocedure('public.delete_customer_data(uuid,text)') is not null then
    foreach s in array sids loop
      execute 'select public.delete_customer_data($1, $2)' using p_business, s;
    end loop;
  end if;

  update public.orders set customer_name = 'محذوف', phone = '', phone2 = '', address = '', sender_id = 'deleted'
   where business_id = p_business and public.crm_customer_key(phone, phone2, sender_id) = p_key;
  get diagnostics n_orders = row_count;

  update public.complaints set customer_name = 'محذوف', phone = '', sender_id = 'deleted'
   where business_id = p_business and (public.crm_norm_phone(phone) = p_key or sender_id = any(sids));
  get diagnostics n_complaints = row_count;

  delete from public.customer_notes where business_id = p_business and customer_key = p_key;
  get diagnostics n_notes = row_count;
  delete from public.customer_profiles where business_id = p_business and customer_key = p_key;
  get diagnostics n_prof = row_count;
  delete from public.crm_external_customers where business_id = p_business and customer_key = p_key;
  get diagnostics n_ext = row_count;

  begin
    insert into public.audit_log (business_id, user_id, action, table_name, new_data)
    values (p_business, auth.uid(), 'crm_forget_customer', 'customers',
            jsonb_build_object('key_suffix', right(p_key, 4), 'orders', n_orders, 'complaints', n_complaints));
  exception when others then
    raise warning 'audit_log insert failed: %', sqlerrm;
  end;

  return jsonb_build_object('orders_anonymized', n_orders, 'complaints_anonymized', n_complaints,
                            'notes_deleted', n_notes, 'profile_deleted', n_prof, 'external_deleted', n_ext);
end $$;

-- ---------- 7) الصلاحيات والسياسات (RLS) ----------
alter table public.order_lines enable row level security;
alter table public.crm_settings enable row level security;
alter table public.customer_profiles enable row level security;
alter table public.customer_notes enable row level security;
alter table public.crm_saved_segments enable row level security;
alter table public.crm_external_customers enable row level security;

revoke all on table public.order_lines from anon, authenticated;
grant select on table public.order_lines to authenticated;
drop policy if exists "order_lines_select" on public.order_lines;
create policy "order_lines_select" on public.order_lines for select to authenticated using (public.is_manager(business_id));

revoke all on table public.crm_external_customers from anon, authenticated;
grant select on table public.crm_external_customers to authenticated;
drop policy if exists "crm_external_select" on public.crm_external_customers;
create policy "crm_external_select" on public.crm_external_customers for select to authenticated using (public.is_manager(business_id));

do $$
declare t text;
begin
  foreach t in array array['crm_settings', 'customer_profiles', 'customer_notes', 'crm_saved_segments'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_manager_all', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id))', t || '_manager_all', t);
  end loop;
end $$;

revoke all on table public.crm_customers from public, anon, authenticated;
grant select on table public.crm_customers to authenticated, service_role;

revoke execute on function public.crm_overview(uuid, date, date) from public, anon;
revoke execute on function public.crm_business_today(uuid) from public, anon;
revoke execute on function public.crm_cohorts(uuid, int) from public, anon;
revoke execute on function public.crm_customer_top_items(uuid, text, int) from public, anon;
revoke execute on function public.crm_customer_timeline(uuid, text, int) from public, anon;
revoke execute on function public.crm_import_customers(uuid, text, jsonb) from public, anon;
revoke execute on function public.crm_delete_import(uuid, text) from public, anon;
revoke execute on function public.crm_forget_customer(uuid, text) from public, anon;
grant execute on function public.crm_overview(uuid, date, date) to authenticated, service_role;
grant execute on function public.crm_business_today(uuid) to authenticated, service_role;
grant execute on function public.crm_cohorts(uuid, int) to authenticated, service_role;
grant execute on function public.crm_customer_top_items(uuid, text, int) to authenticated, service_role;
grant execute on function public.crm_customer_timeline(uuid, text, int) to authenticated, service_role;
grant execute on function public.crm_import_customers(uuid, text, jsonb) to authenticated, service_role;
grant execute on function public.crm_delete_import(uuid, text) to authenticated, service_role;
grant execute on function public.crm_forget_customer(uuid, text) to authenticated, service_role;
-- دوال التفكيك والتوحيد (مفيهاش بيانات حساسة)
grant execute on function public.crm_norm_phone(text), public.crm_customer_key(text, text, text),
  public.crm_norm_name(text), public.crm_biz_day(timestamptz, int),
  public.crm_parse_order_items(text) to authenticated, service_role;

-- تحديث ذاكرة PostgREST عشان الدوال والعروض الجديدة تظهر للـ API على طول
notify pgrst, 'reload schema';
