-- =====================================================================
-- سياسات الأمان (RLS) وصلاحيات الأعمدة لموقع Syneixa SmartChat
-- =====================================================================
-- مبنية على جدول business_users (مين تبع أنهي مطعم وبأنهي دور).
-- مفاتيح الخدمة (service_role / sb_secret) بتتخطى RLS، فمفيش حاجة من دي بتأثر على n8n والبوت.
-- الملف قابل للتشغيل أكتر من مرة (idempotent).
-- التشغيل: على Supabase بتاع التطوير الأول، وبعد المراجعة على الحقيقي من SQL Editor.
-- =====================================================================

-- ---------- 0) دوال مساعدة ----------
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

-- دوال داخلية للبوت: مش للموقع ولا للمتصفح أبدًا (بترجع page_token)
revoke execute on function public.due_carts() from public, anon, authenticated;
revoke execute on function public.pending_replies() from public, anon, authenticated;
grant execute on function public.due_carts() to service_role;
grant execute on function public.pending_replies() to service_role;

-- ---------- 1) تفعيل RLS على كل الجداول ----------
do $$
declare t text;
begin
  foreach t in array array[
    'businesses','branches','menu_categories','menu_items','menu_item_sizes','option_groups','options',
    'menu_item_option_groups','branch_item_availability','offers','delivery_zones',
    'orders','order_events','complaints','unanswered_questions',
    'business_hours','business_pauses','faq_items','notifications','customer_replies',
    'notification_settings','bot_health','business_users','audit_log',
    'message_log','bot_pauses','pending_carts','n8n_chat_histories'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
    end if;
  end loop;
end $$;

-- ---------- 2) جداول داخلية للبوت فقط: مفيش وصول من المتصفح ----------
do $$
declare t text;
begin
  foreach t in array array['message_log','bot_pauses','pending_carts','n8n_chat_histories'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ---------- 3) جداول: قراءة لكل أعضاء المطعم، وكتابة (إضافة/تعديل/حذف) للمالك والمدير ----------
revoke all on table public.menu_categories from anon, authenticated;
grant select, insert, update, delete on table public.menu_categories to authenticated;
drop policy if exists "menu_categories_select" on public.menu_categories;
create policy "menu_categories_select" on public.menu_categories for select to authenticated using (public.is_member(business_id));
drop policy if exists "menu_categories_write" on public.menu_categories;
create policy "menu_categories_write" on public.menu_categories for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.menu_items from anon, authenticated;
grant select, insert, update, delete on table public.menu_items to authenticated;
drop policy if exists "menu_items_select" on public.menu_items;
create policy "menu_items_select" on public.menu_items for select to authenticated using (public.is_member(business_id));
drop policy if exists "menu_items_write" on public.menu_items;
create policy "menu_items_write" on public.menu_items for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.menu_item_sizes from anon, authenticated;
grant select, insert, update, delete on table public.menu_item_sizes to authenticated;
drop policy if exists "menu_item_sizes_select" on public.menu_item_sizes;
create policy "menu_item_sizes_select" on public.menu_item_sizes for select to authenticated using (public.is_member(business_id));
drop policy if exists "menu_item_sizes_write" on public.menu_item_sizes;
create policy "menu_item_sizes_write" on public.menu_item_sizes for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.option_groups from anon, authenticated;
grant select, insert, update, delete on table public.option_groups to authenticated;
drop policy if exists "option_groups_select" on public.option_groups;
create policy "option_groups_select" on public.option_groups for select to authenticated using (public.is_member(business_id));
drop policy if exists "option_groups_write" on public.option_groups;
create policy "option_groups_write" on public.option_groups for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.options from anon, authenticated;
grant select, insert, update, delete on table public.options to authenticated;
drop policy if exists "options_select" on public.options;
create policy "options_select" on public.options for select to authenticated using (public.is_member(business_id));
drop policy if exists "options_write" on public.options;
create policy "options_write" on public.options for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.delivery_zones from anon, authenticated;
grant select, insert, update, delete on table public.delivery_zones to authenticated;
drop policy if exists "delivery_zones_select" on public.delivery_zones;
create policy "delivery_zones_select" on public.delivery_zones for select to authenticated using (public.is_member(business_id));
drop policy if exists "delivery_zones_write" on public.delivery_zones;
create policy "delivery_zones_write" on public.delivery_zones for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.offers from anon, authenticated;
grant select, insert, update, delete on table public.offers to authenticated;
drop policy if exists "offers_select" on public.offers;
create policy "offers_select" on public.offers for select to authenticated using (public.is_member(business_id));
drop policy if exists "offers_write" on public.offers;
create policy "offers_write" on public.offers for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.branches from anon, authenticated;
grant select, insert, update, delete on table public.branches to authenticated;
drop policy if exists "branches_select" on public.branches;
create policy "branches_select" on public.branches for select to authenticated using (public.is_member(business_id));
drop policy if exists "branches_write" on public.branches;
create policy "branches_write" on public.branches for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.faq_items from anon, authenticated;
grant select, insert, update, delete on table public.faq_items to authenticated;
drop policy if exists "faq_items_select" on public.faq_items;
create policy "faq_items_select" on public.faq_items for select to authenticated using (public.is_member(business_id));
drop policy if exists "faq_items_write" on public.faq_items;
create policy "faq_items_write" on public.faq_items for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.business_hours from anon, authenticated;
grant select, insert, update, delete on table public.business_hours to authenticated;
drop policy if exists "business_hours_select" on public.business_hours;
create policy "business_hours_select" on public.business_hours for select to authenticated using (public.is_member(business_id));
drop policy if exists "business_hours_write" on public.business_hours;
create policy "business_hours_write" on public.business_hours for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

revoke all on table public.notification_settings from anon, authenticated;
grant select, insert, update, delete on table public.notification_settings to authenticated;
drop policy if exists "notification_settings_select" on public.notification_settings;
create policy "notification_settings_select" on public.notification_settings for select to authenticated using (public.is_member(business_id));
drop policy if exists "notification_settings_write" on public.notification_settings;
create policy "notification_settings_write" on public.notification_settings for all to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

-- الإيقاف المؤقت: إضافة وتعديل (الإلغاء بتحديث canceled_at) من غير حذف
revoke all on table public.business_pauses from anon, authenticated;
grant select, insert, update on table public.business_pauses to authenticated;
drop policy if exists "business_pauses_select" on public.business_pauses;
create policy "business_pauses_select" on public.business_pauses for select to authenticated using (public.is_member(business_id));
drop policy if exists "business_pauses_insert" on public.business_pauses;
create policy "business_pauses_insert" on public.business_pauses for insert to authenticated with check (public.is_manager(business_id));
drop policy if exists "business_pauses_update" on public.business_pauses;
create policy "business_pauses_update" on public.business_pauses for update to authenticated using (public.is_manager(business_id)) with check (public.is_manager(business_id));

-- جداول ربط من غير business_id: بتتحدد من الصنف
do $$
begin
  if to_regclass('public.menu_item_option_groups') is not null then
    execute 'revoke all on table public.menu_item_option_groups from anon, authenticated';
    execute 'grant select, insert, update, delete on table public.menu_item_option_groups to authenticated';
    execute 'drop policy if exists "mi_og_select" on public.menu_item_option_groups';
    execute 'create policy "mi_og_select" on public.menu_item_option_groups for select to authenticated using (exists (select 1 from public.menu_items i where i.id = item_id and public.is_member(i.business_id)))';
    execute 'drop policy if exists "mi_og_write" on public.menu_item_option_groups';
    execute 'create policy "mi_og_write" on public.menu_item_option_groups for all to authenticated using (exists (select 1 from public.menu_items i where i.id = item_id and public.is_manager(i.business_id))) with check (exists (select 1 from public.menu_items i where i.id = item_id and public.is_manager(i.business_id)))';
  end if;
  if to_regclass('public.branch_item_availability') is not null then
    execute 'revoke all on table public.branch_item_availability from anon, authenticated';
    execute 'grant select, insert, update, delete on table public.branch_item_availability to authenticated';
    execute 'drop policy if exists "bia_select" on public.branch_item_availability';
    execute 'create policy "bia_select" on public.branch_item_availability for select to authenticated using (exists (select 1 from public.menu_items i where i.id = item_id and public.is_member(i.business_id)))';
    execute 'drop policy if exists "bia_write" on public.branch_item_availability';
    execute 'create policy "bia_write" on public.branch_item_availability for all to authenticated using (exists (select 1 from public.menu_items i where i.id = item_id and public.is_manager(i.business_id))) with check (exists (select 1 from public.menu_items i where i.id = item_id and public.is_manager(i.business_id)))';
  end if;
exception when others then
  raise notice 'تخطّيت جداول الربط (راجع أعمدتها): %', sqlerrm;
end $$;

-- ---------- 4) جداول التشغيل: قراءة لكل الأعضاء، وتعديل أعمدة محددة بس (الإضافة من البوت فقط) ----------
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
grant update (status, read_at, handled_at) on table public.notifications to authenticated;
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated using (public.is_member(business_id));
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

revoke all on table public.complaints from anon, authenticated;
grant select on table public.complaints to authenticated;
grant update (status, note, resolved_at) on table public.complaints to authenticated;
drop policy if exists "complaints_select" on public.complaints;
create policy "complaints_select" on public.complaints for select to authenticated using (public.is_member(business_id));
drop policy if exists "complaints_update" on public.complaints;
create policy "complaints_update" on public.complaints for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

revoke all on table public.unanswered_questions from anon, authenticated;
grant select on table public.unanswered_questions to authenticated;
grant update (answer, status, answered_at, answered_by) on table public.unanswered_questions to authenticated;
drop policy if exists "unanswered_questions_select" on public.unanswered_questions;
create policy "unanswered_questions_select" on public.unanswered_questions for select to authenticated using (public.is_member(business_id));
drop policy if exists "unanswered_questions_update" on public.unanswered_questions;
create policy "unanswered_questions_update" on public.unanswered_questions for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

revoke all on table public.orders from anon, authenticated;
grant select on table public.orders to authenticated;
grant update (status, updated_at, shipped_at, delivered_at, carrier, tracking_number) on table public.orders to authenticated;
drop policy if exists "orders_select" on public.orders;
create policy "orders_select" on public.orders for select to authenticated using (public.is_member(business_id));
drop policy if exists "orders_update" on public.orders;
create policy "orders_update" on public.orders for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

revoke all on table public.order_events from anon, authenticated;
grant select on table public.order_events to authenticated;
grant update (status, note) on table public.order_events to authenticated;
drop policy if exists "order_events_select" on public.order_events;
create policy "order_events_select" on public.order_events for select to authenticated using (public.is_member(business_id));
drop policy if exists "order_events_update" on public.order_events;
create policy "order_events_update" on public.order_events for update to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

-- ردود المطعم: إضافة بـ pending بس، ومفيش تعديل ولا حذف
revoke all on table public.customer_replies from anon, authenticated;
grant select, insert on table public.customer_replies to authenticated;
drop policy if exists "customer_replies_select" on public.customer_replies;
create policy "customer_replies_select" on public.customer_replies for select to authenticated using (public.is_member(business_id));
drop policy if exists "customer_replies_insert" on public.customer_replies;
create policy "customer_replies_insert" on public.customer_replies for insert to authenticated
  with check (
    public.is_member(business_id)
    and status = 'pending' and sent_at is null and error is null
    and page_id = (select b.page_id from public.businesses b where b.id = business_id)
  );

-- حالة اتصال البوت: قراءة بس
revoke all on table public.bot_health from anon, authenticated;
grant select on table public.bot_health to authenticated;
drop policy if exists "bot_health_select" on public.bot_health;
create policy "bot_health_select" on public.bot_health for select to authenticated using (public.is_member(business_id));

-- فريق المطعم: كل مستخدم يشوف صفه، والمالك والمدير يشوفوا الفريق، والمالك بس يعدّل
revoke all on table public.business_users from anon, authenticated;
grant select, insert, update, delete on table public.business_users to authenticated;
drop policy if exists "business_users_select" on public.business_users;
create policy "business_users_select" on public.business_users for select to authenticated using (user_id = auth.uid() or public.is_manager(business_id));
drop policy if exists "business_users_write" on public.business_users;
create policy "business_users_write" on public.business_users for all to authenticated using (public.is_owner(business_id)) with check (public.is_owner(business_id));

-- سجل التغييرات: المالك والمدير يقروا، وأي عضو يضيف سجل باسمه بس
revoke all on table public.audit_log from anon, authenticated;
grant select, insert on table public.audit_log to authenticated;
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log for select to authenticated using (public.is_manager(business_id));
drop policy if exists "audit_log_insert" on public.audit_log;
create policy "audit_log_insert" on public.audit_log for insert to authenticated with check (public.is_member(business_id) and user_id = auth.uid());

-- ---------- 5) جدول businesses: أعمدة محددة بس (من غير page_token) ----------
revoke all on table public.businesses from anon, authenticated;
do $$
declare c text;
begin
  foreach c in array array[
    'id','name','phone','complaints_phone','address','google_review_link','faq','menu_image_urls',
    'is_open','closed_message','bot_enabled','delivery_enabled','pickup_enabled','delivery_minutes',
    'pickup_minutes','edit_window_minutes','human_pause_minutes','feedback_enabled','feedback_delay_minutes',
    'cart_reminder_enabled','open_time','close_time','page_id','active','message_limit','message_count',
    'business_type','created_at'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='businesses' and column_name=c) then
      execute format('grant select (%I) on table public.businesses to authenticated', c);
    else
      raise notice 'عمود مش موجود في businesses (اتخطّى القراءة): %', c;
    end if;
  end loop;
  foreach c in array array[
    'name','phone','complaints_phone','address','google_review_link','faq','menu_image_urls',
    'is_open','closed_message','bot_enabled','delivery_enabled','pickup_enabled','delivery_minutes',
    'pickup_minutes','edit_window_minutes','human_pause_minutes','feedback_enabled','feedback_delay_minutes',
    'cart_reminder_enabled','open_time','close_time'
  ] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='businesses' and column_name=c) then
      execute format('grant update (%I) on table public.businesses to authenticated', c);
    else
      raise notice 'عمود مش موجود في businesses (اتخطّى التعديل): %', c;
    end if;
  end loop;
end $$;
drop policy if exists "businesses_select" on public.businesses;
create policy "businesses_select" on public.businesses for select to authenticated using (public.is_member(id));
drop policy if exists "businesses_update" on public.businesses;
create policy "businesses_update" on public.businesses for update to authenticated using (public.is_manager(id)) with check (public.is_manager(id));

-- ---------- 6) تنضيف وتحقق النصوص (حماية البوت من الحقن) ----------
-- بيشتغل على مستخدمي الموقع بس (authenticated). مفاتيح الخدمة (البوت وn8n) بتعدّي من غير تحقق.
create or replace function public.has_forbidden_text(t text) returns boolean
language sql immutable as $$ select t is not null and t ~ '(\[|\]|\{\{|\}\})' $$;

-- TG_ARGV: أزواج "عمود:أقصى_طول"
create or replace function public.check_text_columns() returns trigger
language plpgsql as $$
declare a text; col text; mx int; v text; j jsonb;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  j := to_jsonb(new);
  foreach a in array tg_argv loop
    col := split_part(a, ':', 1);
    mx := split_part(a, ':', 2)::int;
    v := j ->> col;
    if v is null then continue; end if;
    if tg_op = 'UPDATE' and v is not distinct from (to_jsonb(old) ->> col) then continue; end if;
    if length(v) > mx then raise exception 'الحقل % أطول من % حرف', col, mx using errcode = '22001'; end if;
    if public.has_forbidden_text(v) then raise exception 'الحقل % فيه أقواس [ ] أو {{ }} ممنوعة', col using errcode = '22023'; end if;
  end loop;
  return new;
end $$;

do $$
declare spec text; t text; args text;
begin
  foreach spec in array array[
    'faq_items|question:300,answer:1000',
    'business_pauses|reason:200',
    'menu_items|name:80,name_en:80,description:500,ingredients:500',
    'menu_categories|name:60,name_en:60',
    'menu_item_sizes|name:40',
    'option_groups|name:60',
    'options|name:60',
    'offers|name:80,description:500,items_text:500',
    'delivery_zones|name:60,aliases:200',
    'businesses|name:60,address:200,faq:4000,closed_message:200'
  ] loop
    t := split_part(spec, '|', 1);
    if to_regclass('public.' || t) is null then continue; end if;
    args := (select string_agg(quote_literal(x), ', ') from unnest(string_to_array(split_part(spec, '|', 2), ',')) x);
    execute format('drop trigger if exists check_text_columns_trg on public.%I', t);
    execute format('create trigger check_text_columns_trg before insert or update on public.%I for each row execute function public.check_text_columns(%s)', t, args);
  end loop;
end $$;

-- تحقق أرقام وصيغ إعدادات المطعم (لمستخدمي الموقع بس)
create or replace function public.validate_business_settings() returns trigger
language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then return new; end if;
  if new.phone is distinct from old.phone and new.phone is not null and new.phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'رقم المطعم لازم 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015' using errcode = '22023'; end if;
  if new.complaints_phone is distinct from old.complaints_phone and new.complaints_phone is not null and new.complaints_phone <> '' and new.complaints_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'رقم الشكاوى لازم 11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015' using errcode = '22023'; end if;
  if new.google_review_link is distinct from old.google_review_link and new.google_review_link is not null and new.google_review_link <> ''
     and new.google_review_link !~ '^https://([a-z0-9-]+\.)*(google\.com|g\.page|goo\.gl)(/|$)' then
    raise exception 'رابط جوجل لازم يبدأ بـ https:// ومن google.com أو g.page أو maps.app.goo.gl' using errcode = '22023'; end if;
  if new.delivery_minutes is distinct from old.delivery_minutes and new.delivery_minutes is not null and (new.delivery_minutes < 10 or new.delivery_minutes > 180) then
    raise exception 'وقت التوصيل من 10 لـ 180 دقيقة' using errcode = '22023'; end if;
  if new.pickup_minutes is distinct from old.pickup_minutes and new.pickup_minutes is not null and (new.pickup_minutes < 5 or new.pickup_minutes > 120) then
    raise exception 'وقت التجهيز من 5 لـ 120 دقيقة' using errcode = '22023'; end if;
  if new.edit_window_minutes is distinct from old.edit_window_minutes and new.edit_window_minutes is not null and (new.edit_window_minutes < 0 or new.edit_window_minutes > 60) then
    raise exception 'وقت السماح بالتعديل من 0 لـ 60 دقيقة' using errcode = '22023'; end if;
  if new.human_pause_minutes is distinct from old.human_pause_minutes and new.human_pause_minutes is not null and (new.human_pause_minutes < 5 or new.human_pause_minutes > 240) then
    raise exception 'مدة سكوت البوت من 5 لـ 240 دقيقة' using errcode = '22023'; end if;
  if new.feedback_delay_minutes is distinct from old.feedback_delay_minutes and new.feedback_delay_minutes not in (60,120,180,240,360) then
    raise exception 'مدة انتظار التقييم: 60 أو 120 أو 180 أو 240 أو 360 دقيقة بس' using errcode = '22023'; end if;
  return new;
end $$;

drop trigger if exists validate_business_settings_trg on public.businesses;
create trigger validate_business_settings_trg before update on public.businesses
  for each row execute function public.validate_business_settings();

-- ---------- 7) ربط أول مستخدم بمطعم (بيتنفذ منكم بس، مش من الموقع) ----------
-- بعد ما المستخدم يسجّل دخوله في الموقع، شغّلوا (غيّروا القيم):
--   insert into public.business_users (business_id, user_id, role)
--   values ('<id المطعم>', '<id المستخدم من auth.users>', 'owner');
