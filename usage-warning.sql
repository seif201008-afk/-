-- ===== إشعار قرب/وصول الحد الشهري للرسايل (usage_warning) =====
-- بيشتغل لوحده لما n8n (UpdateCounter) يحدّث message_count أو warned في businesses.
create or replace function public.notify_usage_warning()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) أول مرة نقترب من الحد (warned بتتحوّل لـ true)
  if new.warned is true and old.warned is distinct from true then
    insert into notifications (business_id, type, severity, title, body, requires_action)
    values (new.id, 'usage_warning', 'high',
            'قربت تخلّص حد الرسايل الشهري',
            'استهلكت ' || coalesce(new.message_count, 0) || ' رسالة من ' || coalesce(new.message_limit, 0) || ' هذا الشهر.',
            false);
  end if;
  -- 2) وصلنا للحد (البوت هيتوقف لحد الشهر الجاي)
  if new.message_limit is not null and new.message_count >= new.message_limit
     and (old.message_count is null or old.message_count < new.message_limit) then
    insert into notifications (business_id, type, severity, title, body, requires_action)
    values (new.id, 'usage_warning', 'urgent',
            'وصلت للحد الشهري: البوت متوقف',
            'وصلت لـ ' || new.message_limit || ' رسالة. البوت مش هيرد لحد الشهر الجاي أو لحد ما نزوّد الحد.',
            true);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_usage_warning_trg on public.businesses;
create trigger notify_usage_warning_trg
  after update of message_count, warned on public.businesses
  for each row execute function public.notify_usage_warning();
