-- ===== تسجيل حالة اتصال البوت (bot_health) من فحص التوكنات =====
-- بتنادى عليها n8n (Token Health Check v2) بمفتاح الخدمة. مش متاحة للمتصفح.

create or replace function public.report_bot_health(p_business uuid, p_token_ok boolean, p_subscribed boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_problem boolean := (p_token_ok is false) or (p_subscribed is false);
  v_healthy boolean := (p_token_ok is true) and (p_subscribed is true);
begin
  insert into bot_health (business_id, token_ok, subscribed, last_checked_at, last_error)
  values (p_business, p_token_ok, p_subscribed, now(), case when v_healthy then null else left(coalesce(p_error, ''), 500) end)
  on conflict (business_id) do update
    set token_ok = excluded.token_ok,
        subscribed = excluded.subscribed,
        last_checked_at = now(),
        last_error = excluded.last_error;

  if v_problem then
    -- إشعار واحد فقط كل 24 ساعة طول ما المشكلة قايمة
    if not exists (
      select 1 from notifications
      where business_id = p_business and type = 'bot_health' and status = 'unread'
        and created_at > now() - interval '24 hours'
    ) then
      insert into notifications (business_id, type, severity, title, body, requires_action)
      values (
        p_business, 'bot_health', 'urgent',
        case when p_token_ok is false then 'البوت مش متصل بصفحتك' else 'اشتراك البوت في الصفحة وقع' end,
        'راجع تعليمات إعادة الربط في صفحة إدارة المطعم، أو كلّمنا.',
        true
      );
    end if;
  elsif v_healthy then
    -- رجع سليم: اقفل أي إشعار مشكلة قديم
    update notifications set status = 'handled', handled_at = now()
    where business_id = p_business and type = 'bot_health' and status in ('unread', 'read');
  end if;
end;
$$;

-- آخر رسالة عميل لكل مطعم (بتتحدّث مع كل فحص)
create or replace function public.touch_bot_health_messages()
returns void
language sql
security definer
set search_path = public
as $$
  update bot_health h
  set last_customer_message_at = m.last_msg
  from (
    select b.id as bid, (select max(x.created_at) from message_log x where x.page_id = b.page_id) as last_msg
    from businesses b
  ) m
  where h.business_id = m.bid;
$$;

revoke execute on function public.report_bot_health(uuid, boolean, boolean, text) from public, anon, authenticated;
revoke execute on function public.touch_bot_health_messages() from public, anon, authenticated;
grant execute on function public.report_bot_health(uuid, boolean, boolean, text) to service_role;
grant execute on function public.touch_bot_health_messages() to service_role;
