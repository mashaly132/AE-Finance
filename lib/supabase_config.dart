// القيم بتتبعت وقت البناء عن طريق:
//   --dart-define=SUPABASE_URL=...  --dart-define=SUPABASE_ANON_KEY=...
// استخدم الـ anon key بس. ممنوع تحط service_role key في التطبيق.
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
bool get supabaseConfigured => supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;
