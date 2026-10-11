-- =====================================================================
-- بيانات تجريبية للـ CRM (80 عميل + حوالي 450 أوردر على 6 شهور + شكاوى + تقييمات + عملاء من كاشير تجريبي)
-- =====================================================================
-- !!! للـ Supabase التجريبي بتاع وكيل الموقع بس. ممنوع على الحقيقي. !!!
-- بيحط البيانات على المطعم اللي اسمه "مطعم تجريبي Syneixa" (لازم يكون موجود).
-- أرقام العملاء التجريبيين كلها بتبدأ بـ 0109999 (والمستوردين من كاشير بتبدأ 01088880)، والنتيجة ثابتة (من غير عشوائية).
-- لو اتشغّل مرتين مش بيكرر. وللمسح: شغّل القسم الأخير (التنضيف) في آخر الملف.
-- لو ظهر خطأ "null value in column ... violates not-null" ابعتلنا اسم العمود وهنعدّل الملف.
-- شغّل ملف crm-قاعدة-البيانات.sql الأول.
-- =====================================================================

do $seed$
declare b uuid;
begin
  select id into b from public.businesses where name = 'مطعم تجريبي Syneixa' order by id limit 1;
  if b is null then raise exception 'مفيش مطعم اسمه "مطعم تجريبي Syneixa" في جدول businesses'; end if;
  if exists (select 1 from public.orders where business_id = b and phone like '0109999%') then
    raise notice 'البيانات التجريبية موجودة بالفعل، مفيش حاجة اتضافت.';
    return;
  end if;

  create temp table _menu on commit drop as
  select * from (values
    (1, 'سماش برجر سنجل', 85), (2, 'سماش برجر دوبل', 120), (3, 'كومبو بطاطس وبيبسي', 40), (4, 'بيبسي', 20),
    (5, 'شيش طاووق L', 160), (6, 'كفتة L', 140), (7, 'وجبة العيلة', 299), (8, 'بيتزا مارجريتا', 110),
    (9, 'بطاطس مقلية', 35), (10, 'سلطة', 25)
  ) as t(id, name, price);

  create temp table _c on commit drop as
  select i,
         '0109999' || lpad(i::text, 4, '0') as phone,
         (case when i % 2 = 0 then (array['سارة','منى','نورا','هبة','دينا','ريم','مي','ياسمين','فاطمة','آية','نهى','رنا','هدى','أسماء','سلمى','داليا','إيمان','شيماء','جيهان','لبنى'])[(i * 7) % 20 + 1]
               else (array['أحمد','محمد','محمود','مصطفى','عمر','يوسف','كريم','طارق','إسلام','هشام','ياسر','أيمن','حسام','وائل','ماجد','سامح','عادل','رامي','خالد','تامر'])[(i * 7) % 20 + 1] end)
         || ' ' || (array['السيد','حسن','إبراهيم','علي','عبد الله','فتحي','منصور','سالم','الشافعي','عثمان','الجمال','بدر','نصر','رزق','الدسوقي'])[(i * 11) % 15 + 1] as name,
         case when i % 2 = 0 then 'أستاذة' else 'أستاذ' end as title,
         case when i <= 8 then 'vip' when i <= 30 then 'regular' when i <= 50 then 'new'
              when i <= 65 then 'risk' when i <= 76 then 'lost' else 'once' end as grp
  from generate_series(1, 80) i;

  create temp table _o on commit drop as
  select c.i, c.phone, c.name, c.title, c.grp, k, n,
         case c.grp when 'vip' then (c.i % 10) when 'regular' then 3 + (c.i % 20) when 'new' then (c.i % 12)
                    when 'risk' then 35 + (c.i % 40) when 'lost' then 100 + (c.i % 70) else 60 + (c.i % 30) end
         + (n - k) * case c.grp when 'vip' then 5 + (c.i + k) % 5 when 'regular' then 8 + (c.i + k) % 12
                             when 'new' then 5 when 'risk' then 15 + (c.i + k) % 15 when 'lost' then 20 + (c.i + k) % 20 else 0 end as days_ago
  from _c c
  cross join lateral (select case c.grp when 'vip' then 12 + (c.i % 9) when 'regular' then 4 + (c.i % 5) when 'new' then 1 + (c.i % 2)
                                    when 'risk' then 2 + (c.i % 3) when 'lost' then 1 + (c.i % 3) else 1 end as n) nn
  cross join lateral generate_series(1, nn.n) k;

  create temp table _o2 on commit drop as
  select o.*,
         least(((current_date - o.days_ago) + make_time(12 + ((o.i * 3 + o.k * 5) % 12), (o.i * 7 + o.k * 13) % 60, 0)) at time zone 'Africa/Cairo',
               now() - interval '5 minutes') as ts,
         case when (o.i + o.k) % 3 = 0 then 'pickup' else 'delivery' end as order_type,
         (select string_agg(format('%s %s - %s جنيه', x.q, m.name, m.price * x.q), E'\n' order by x.l)
            from (select l, 1 + case when (o.i + o.k + l) % 7 = 0 then 1 else 0 end as q, 1 + ((o.i * 5 + o.k * 3 + l * 7) % 10) as mi
                  from generate_series(1, 1 + (o.i + o.k) % 3) l) x join _menu m on m.id = x.mi) as items_text,
         (select sum(m.price * x.q)
            from (select l, 1 + case when (o.i + o.k + l) % 7 = 0 then 1 else 0 end as q, 1 + ((o.i * 5 + o.k * 3 + l * 7) % 10) as mi
                  from generate_series(1, 1 + (o.i + o.k) % 3) l) x join _menu m on m.id = x.mi) as items_total
  from _o o;

  insert into public.orders (business_id, daily_number, status, order_type, customer_name, customer_title, phone, address, order_items, total, created_at, sender_id, rating)
  select b,
         row_number() over (partition by ((x.ts at time zone 'Africa/Cairo') - interval '5 hours')::date order by x.ts, x.i),
         case when (x.i * 13 + x.k * 7) % 19 = 0 then 'cancelled'
              when (x.i * 17 + x.k * 5) % 41 = 0 then 'rejected'
              when x.ts > now() - interval '1 day' then 'new'
              else 'delivered' end,
         x.order_type, x.name, x.title, x.phone,
         case when x.order_type = 'delivery' then 'بورسعيد، حي ' || (array['الشرق','الضواحي','العرب','المناخ','الزهور'])[x.i % 5 + 1] || '، شارع ' || (array['الجمهورية','فلسطين','محمد علي','سعد زغلول','الثلاثيني'])[x.k % 5 + 1] || ' رقم ' || (x.i % 40 + 1) end,
         x.items_text,
         x.items_total + case when x.order_type = 'delivery' then 15 else 0 end,
         x.ts,
         '9999' || lpad(x.i::text, 6, '0'),
         case when (x.i + x.k) % 5 in (0, 1) and (x.i * 13 + x.k * 7) % 19 <> 0 and (x.i * 17 + x.k * 5) % 41 <> 0 and x.ts <= now() - interval '1 day'
              then case when (x.i * 7 + x.k) % 17 = 0 then 2 when (x.i * 3 + x.k) % 11 = 0 then 5 else 7 + (x.i + x.k) % 4 end end
  from _o2 x order by x.ts, x.i;

  insert into public.complaints (business_id, sender_id, customer_name, phone, source, summary, severity, status, created_at)
  select b, '9999' || lpad(c.i::text, 6, '0'), c.name, c.phone, 'chat',
         (array['الأكل وصل بارد', 'الأوردر ناقص صنف', 'التأخير كان كبير', 'السعر مختلف عن المنيو'])[c.i % 4 + 1],
         case when c.i % 12 = 0 then 'عاجل' else 'عادي' end,
         case when c.i % 4 = 0 then 'open' else 'resolved' end,
         (select max(o.ts) from _o2 o where o.i = c.i) + interval '1 hour'
  from _c c where c.i % 6 = 0;

  insert into public.crm_external_customers (business_id, source, customer_key, name, orders_count, total_spent, first_order_at, last_order_at)
  select b, 'pos_demo', p.phone, p.name, p.oc, p.spent, now() - make_interval(days => p.first_d), now() - make_interval(days => p.last_d)
  from (
    select '0109999' || lpad(i::text, 4, '0') as phone, null::text as name, 3 + (i % 7) as oc, (450 + i * 20)::numeric as spent, 200 as first_d, 60 + (i % 40) as last_d
    from unnest(array[3, 12, 20, 33, 55, 70]) i
    union all
    select '01088880' || lpad(n::text, 3, '0'), (array['وليد فرج', 'هالة سعيد', 'باسم عادل', 'غادة نبيل'])[n], 2 + n, (300 + n * 150)::numeric, 150 - n * 10, 20 + n * 25
    from generate_series(1, 4) n
  ) p;

  insert into public.customer_profiles (business_id, customer_key, tags, marketing_consent, birthday)
  select b, '0109999' || lpad(i::text, 4, '0'),
         case when i <= 3 then array['عميل مهم', 'بدون بصل'] when i = 4 then array['عيد ميلاد قريب'] else '{}'::text[] end,
         case when i <= 5 then 'yes' when i = 6 then 'no' else 'unknown' end,
         case when i = 4 then (current_date + 10 - interval '30 years')::date end
  from generate_series(1, 6) i;

  insert into public.customer_notes (business_id, customer_key, body, pinned)
  values (b, '01099990001', 'عميل قديم ومهم، بيطلب كل أسبوع تقريبًا. يفضّل التوصيل بعد 8 مساءً.', true),
         (b, '01099990001', 'اشتكى مرة من تأخير وتم التعويض.', false),
         (b, '01099990002', 'بيدفع كاش دايمًا.', false),
         (b, '01099990009', 'عنوانه الجديد في حي الزهور.', false);
end
$seed$;

-- =====================================================================
-- للمسح (شغّل ده لوحده لما تخلص): شيل علامات التعليق وشغّله
-- =====================================================================
-- delete from public.orders where phone like '0109999%';
-- delete from public.complaints where phone like '0109999%';
-- delete from public.customer_notes where customer_key like '0109999%';
-- delete from public.customer_profiles where customer_key like '0109999%';
-- delete from public.crm_external_customers where source = 'pos_demo';
