-- تنضيف دوري يومي للجداول الداخلية (مش بيلمس الأوردرات ولا الشكاوى ولا الإشعارات)
create or replace function cleanup_old_data()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb;
  n int;
begin
  -- سجل الرسائل (بيستخدمه الفيضان وإرسال الردود): احتفاظ 60 يوم
  delete from message_log where created_at < now() - interval '60 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('message_log', n);

  -- سكوت البوت بعد رد موظف: أقدم من يومين مالوش لازمة
  delete from bot_pauses where paused_at < now() - interval '2 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('bot_pauses', n);

  -- مسودات الشكاوى اللي اتقفلت من أكتر من 30 يوم
  delete from complaint_drafts where resolved = true and created_at < now() - interval '30 days';
  get diagnostics n = row_count; r := r || jsonb_build_object('complaint_drafts', n);

  return r;
end;
$$;

revoke execute on function cleanup_old_data() from public, anon, authenticated;
grant execute on function cleanup_old_data() to service_role;

-- جدولة يومية الساعة 3:30 صباحًا (UTC) بـ pg_cron
create extension if not exists pg_cron;
select cron.schedule('syneixa-cleanup', '30 3 * * *', 'select public.cleanup_old_data()');
