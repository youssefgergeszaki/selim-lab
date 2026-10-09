-- SELIM LAB — DEVELOPMENT SEED DATA
-- Everything below is clearly marked as development data ([DEV] / [تجريبي]).
-- Product names, prices, stock, shipping fees and FAQ answers are placeholders, NOT real
-- business data, ingredients or claims. Do not run this file against production.
-- Run locally with `supabase db reset` (applies migrations + this seed).

-- Categories & collections ---------------------------------------------------
insert into public.categories (id, kind, slug, name_ar, name_en, description_ar, description_en, sort_order) values
  ('00000000-0000-4000-8000-000000000101', 'category', 'cleansers', 'منظفات', 'Cleansers', null, null, 10),
  ('00000000-0000-4000-8000-000000000102', 'category', 'serums', 'سيروم', 'Serums', null, null, 20),
  ('00000000-0000-4000-8000-000000000103', 'category', 'moisturizers', 'مرطبات', 'Moisturizers', null, null, 30),
  ('00000000-0000-4000-8000-000000000104', 'category', 'sun-care', 'الحماية من الشمس', 'Sun care', null, null, 40),
  ('00000000-0000-4000-8000-000000000201', 'collection', 'daily-routine', 'روتين يومي [تجريبي]', 'Daily routine [DEV]',
    'مجموعة تجريبية لأغراض التطوير.', 'Development collection for testing.', 10)
on conflict (id) do nothing;

-- Products ------------------------------------------------------------------------
insert into public.products (id, status, is_featured, sort_order, published_at) values
  ('00000000-0000-4000-8000-000000001001', 'published', true, 10, now()),
  ('00000000-0000-4000-8000-000000001002', 'published', true, 20, now()),
  ('00000000-0000-4000-8000-000000001003', 'published', false, 30, now()),
  ('00000000-0000-4000-8000-000000001004', 'published', false, 40, now())
on conflict (id) do nothing;

insert into public.product_translations
  (product_id, locale, name, slug, short_description, description, ingredients, how_to_use, warnings, attributes)
values
  ('00000000-0000-4000-8000-000000001001', 'ar', '[تجريبي] منظف لطيف', 'dev-gentle-cleanser',
    'منتج تجريبي لأغراض التطوير فقط.', 'وصف تجريبي. يُستبدل بوصف المنتج الحقيقي من لوحة التحكم.',
    'قائمة المكونات تُضاف من لوحة التحكم.', 'طريقة الاستخدام تُضاف من لوحة التحكم.', 'التحذيرات تُضاف من لوحة التحكم.',
    '[{"label":"نوع البشرة","value":"يُحدَّث"}]'),
  ('00000000-0000-4000-8000-000000001001', 'en', '[DEV] Gentle Cleanser', 'dev-gentle-cleanser',
    'Development product for testing only.', 'Placeholder description. Replace with the real product copy from the dashboard.',
    'Ingredient list to be added from the dashboard.', 'Directions to be added from the dashboard.', 'Warnings to be added from the dashboard.',
    '[{"label":"Skin type","value":"TBD"}]'),
  ('00000000-0000-4000-8000-000000001002', 'ar', '[تجريبي] سيروم', 'dev-serum',
    'منتج تجريبي لأغراض التطوير فقط.', 'وصف تجريبي.', null, null, null, '[]'),
  ('00000000-0000-4000-8000-000000001002', 'en', '[DEV] Serum', 'dev-serum',
    'Development product for testing only.', 'Placeholder description.', null, null, null, '[]'),
  ('00000000-0000-4000-8000-000000001003', 'ar', '[تجريبي] كريم مرطب', 'dev-moisturizer',
    'منتج تجريبي لأغراض التطوير فقط.', 'وصف تجريبي.', null, null, null, '[]'),
  ('00000000-0000-4000-8000-000000001003', 'en', '[DEV] Moisturizer', 'dev-moisturizer',
    'Development product for testing only.', 'Placeholder description.', null, null, null, '[]'),
  ('00000000-0000-4000-8000-000000001004', 'ar', '[تجريبي] واقي شمس', 'dev-sunscreen',
    'منتج تجريبي لأغراض التطوير فقط.', 'وصف تجريبي.', null, null, null, '[]'),
  ('00000000-0000-4000-8000-000000001004', 'en', '[DEV] Sunscreen', 'dev-sunscreen',
    'Development product for testing only.', 'Placeholder description.', null, null, null, '[]')
on conflict do nothing;

insert into public.product_categories (product_id, category_id) values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000102'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000103'),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000104'),
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000201')
on conflict do nothing;

insert into public.product_variants
  (id, product_id, sku, name_ar, name_en, price, compare_at_price, stock_quantity, is_default, sort_order)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001001', 'DEV-CLN-150', '150 مل', '150 ml', 350.00, null, 25, true, 10),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001002', 'DEV-SER-30', '30 مل', '30 ml', 520.00, 600.00, 12, true, 10),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000001003', 'DEV-MST-50', '50 مل', '50 ml', 410.00, null, 3, true, 10),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000001003', 'DEV-MST-100', '100 مل', '100 ml', 690.00, null, 8, false, 20),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000001004', 'DEV-SUN-50', '50 مل', '50 ml', 450.00, null, 0, true, 10)
on conflict (id) do nothing;

-- Shipping (placeholder fees for development) --------------------------------------
insert into public.shipping_zones (id, name_ar, name_en, governorates, sort_order) values
  ('00000000-0000-4000-8000-000000003001', 'القاهرة الكبرى [تجريبي]', 'Greater Cairo [DEV]', array['cairo', 'giza', 'qalyubia'], 10),
  ('00000000-0000-4000-8000-000000003002', 'باقي المحافظات [تجريبي]', 'Other governorates [DEV]', array[
    'alexandria','beheira','matrouh','dakahlia','damietta','gharbia','kafr-el-sheikh','monufia','sharqia',
    'port-said','ismailia','suez','north-sinai','south-sinai','faiyum','beni-suef','minya','asyut','sohag',
    'qena','luxor','aswan','red-sea','new-valley'], 20)
on conflict (id) do nothing;

insert into public.shipping_rates (zone_id, name_ar, name_en, fee, free_shipping_threshold, eta_min_days, eta_max_days) values
  ('00000000-0000-4000-8000-000000003001', 'توصيل قياسي', 'Standard delivery', 60.00, 1500.00, 1, 3),
  ('00000000-0000-4000-8000-000000003002', 'توصيل قياسي', 'Standard delivery', 90.00, null, 3, 6);

-- Coupon for development --------------------------------------------------------------
insert into public.coupons (code, description, discount_type, value, min_subtotal, usage_limit, per_customer_limit)
values ('DEVTEST10', 'Development coupon — 10% off', 'percentage', 10, 300, 100, 1)
on conflict (code) do nothing;

-- FAQs (placeholders; answers must be written by the business) ------------------------
insert into public.faqs (question_ar, question_en, answer_ar, answer_en, sort_order) values
  ('ما هي وسائل الدفع المتاحة؟', 'Which payment methods are available?',
   '[يُحدَّث] تظهر وسائل الدفع المفعّلة في صفحة إتمام الطلب.', '[TBD] Enabled payment methods are shown at checkout.', 10),
  ('كم تستغرق مدة التوصيل؟', 'How long does delivery take?',
   '[يُحدَّث] تظهر مدة التوصيل المتوقعة لكل محافظة عند إتمام الطلب.', '[TBD] Estimated delivery times per governorate are shown at checkout.', 20);

-- Policy pages (placeholders) ----------------------------------------------------------
insert into public.content_pages (slug, title_ar, title_en, body_ar, body_en, is_published) values
  ('privacy', 'سياسة الخصوصية', 'Privacy policy', '[يُحدَّث] نص سياسة الخصوصية يُضاف من لوحة التحكم.', '[TBD] Privacy policy text to be added from the dashboard.', true),
  ('terms', 'الشروط والأحكام', 'Terms & conditions', '[يُحدَّث] نص الشروط والأحكام يُضاف من لوحة التحكم.', '[TBD] Terms text to be added from the dashboard.', true),
  ('shipping', 'سياسة الشحن', 'Shipping policy', '[يُحدَّث] نص سياسة الشحن يُضاف من لوحة التحكم.', '[TBD] Shipping policy text to be added from the dashboard.', true),
  ('returns', 'الاسترجاع والاستبدال', 'Returns & exchanges', '[يُحدَّث] نص سياسة الاسترجاع يُضاف من لوحة التحكم.', '[TBD] Returns policy text to be added from the dashboard.', true)
on conflict (slug) do nothing;

update public.store_settings set
  announcement_ar = 'نسخة تطوير — البيانات المعروضة تجريبية',
  announcement_en = 'Development build — displayed data is sample data',
  announcement_active = true
where id = 1;
