// ===============================
//  إعدادات الموقع — عدّل هنا بس
// ===============================
window.APP_CONFIG = {
  // من Supabase: Project Settings ← API
  // لو سبتهم فاضيين، الموقع هيشتغل "وضع تجربة" والمشاكل هتتحفظ على جهازك بس.
  SUPABASE_URL: "https://phiopcwyaigslczgugzj.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xdb0RW0mAj2vLKm4W29xpw_nvxWPxwY",

  // اسم الجدول في Supabase (لازم يطابق اللي في ملف supabase.sql)
  TABLE: "team_problems",

  // باسورد بسيط للفريق (اختياري). سيبه "" لو مش عايز باسورد.
  // ملحوظة: ده حماية خفيفة عشان لو اللينك اتسرب، مش حماية قوية.
  TEAM_PASSWORD: "",
};
