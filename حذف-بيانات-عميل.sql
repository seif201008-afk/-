-- حذف بيانات عميل (قانون حماية البيانات): للاستخدام من SQL Editor بصلاحية الأدمن بس (مش للموقع).
-- 1) ابحث عن معرّفات العميل برقمه:   select * from find_customer_ids('<business_uuid>', '01012345678');
-- 2) امسح:                            select delete_customer_data('<business_uuid>', '<sender_id>');
-- بيمسح: المحادثة والذاكرة والسلة والإيقاف والردود والإشعارات والمسودات والأسئلة.
-- (القيم الفاضية '' و'deleted' بدل null عشان أي قيد NOT NULL في الجداول)
-- بيخفي هوية (من غير مسح): الأوردرات والشكاوى (الاسم والرقم والعنوان ومعرّف المحادثة بس)، عشان سجلات المطعم المحاسبية تفضل.

create or replace function find_customer_ids(p_business uuid, p_phone text)
returns table(sender_id text)
language sql security definer set search_path = public as $$
  select distinct o.sender_id from orders o
  where o.business_id = p_business and o.sender_id is not null
    and (o.phone = p_phone or o.phone2 = p_phone)
  union
  select distinct c.sender_id from complaints c
  where c.business_id = p_business and c.sender_id is not null and c.phone = p_phone;
$$;

create or replace function delete_customer_data(p_business uuid, p_sender text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_page text;
  r jsonb := '{}'::jsonb;
  n int;
begin
  if p_sender is null or length(trim(p_sender)) = 0 then
    raise exception 'sender_id required';
  end if;
  select page_id into v_page from businesses where id = p_business;
  if v_page is null then
    raise exception 'business not found';
  end if;

  delete from message_log where page_id = v_page and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('message_log', n);

  delete from message_buffer where sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('message_buffer', n);

  delete from n8n_chat_histories where session_id = v_page || '_' || p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('n8n_chat_histories', n);

  delete from bot_pauses where page_id = v_page and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('bot_pauses', n);

  delete from pending_carts where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('pending_carts', n);

  delete from customer_replies where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('customer_replies', n);

  delete from notifications where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('notifications', n);

  delete from complaint_drafts where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('complaint_drafts', n);

  delete from unanswered_questions where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('unanswered_questions', n);

  delete from return_requests where sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('return_requests', n);

  update orders set customer_name = 'محذوف', phone = '', phone2 = '', address = '', sender_id = 'deleted'
   where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('orders_anonymized', n);

  update complaints set customer_name = 'محذوف', phone = '', sender_id = 'deleted'
   where business_id = p_business and sender_id = p_sender;
  get diagnostics n = row_count; r := r || jsonb_build_object('complaints_anonymized', n);

  return r;
end;
$$;

revoke execute on function find_customer_ids(uuid, text) from public, anon, authenticated;
revoke execute on function delete_customer_data(uuid, text) from public, anon, authenticated;
grant execute on function find_customer_ids(uuid, text) to service_role;
grant execute on function delete_customer_data(uuid, text) to service_role;
