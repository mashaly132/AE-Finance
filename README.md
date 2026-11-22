# AE Finance v1.0

تطبيق Flutter (أندرويد + آيفون) لحسابات العملاء: مصروفات وإيداعات، يشتغل **أوفلاين** ويزامن مع Supabase أول ما النت يرجع.

## اللي شغال
- تسجيل دخول المكتب (Supabase Auth) + اختيار المهندس لكل عملية (نسبة العملية للمهندس).
- عملاء: إضافة، بحث، رصيد لكل عميل (إيداعات − مصروفات).
- مصروف (بند + خامات/مصنعية) وإيداع (نقدي/InstaPay/Vodafone Cash + المهندس المستلم)، وحذف معاملة.
- أوفلاين أولاً: كل شيء يتحفظ في SQLite على الموبايل، وكل معاملة لها UUID ثابت فمستحيل تتكرر عند المزامنة.
- الخزينة: إجمالي الإيداعات حسب الطريقة وحسب المهندس المستلم.
- التقارير: فلتر بالعميل والتاريخ، المصروفات حسب البند، وتصدير CSV يفتح في Excel.
- الإعدادات: تغيير اللوجو (Supabase Storage)، إضافة/إيقاف مهندسين وبنود، حالة المزامنة، تسجيل خروج.
- أمان: RLS على كل الجداول + سجل Audit تلقائي لكل إضافة/تعديل/حذف.

## مش موجود في النسخة دي
- تصدير PDF (الـ CSV بيفتح في Excel). تعديل معاملة موجودة (المتاح حذفها وإعادة إدخالها).
- حساب منفصل لكل مهندس: فيه حساب واحد للمكتب، واختيار المهندس للنسبة فقط.

## الإعداد (مرة واحدة)

### 1) Supabase
1. أنشئ مشروع جديد.
2. SQL Editor: شغّل `supabase/schema.sql` ثم `supabase/security.sql`.
3. Authentication → Users → Add user (إيميل وباسورد للمكتب، فعّل Auto confirm).
4. Authentication → Providers → Email: **اقفل Allow new users to sign up**.
5. Project Settings → API: انسخ `Project URL` و `anon public key` (مش الـ service_role).

### 2) أندرويد (APK)
على جهازك (Flutter متسطب):
```
bash tools/setup_platforms.sh
flutter build apk --release --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```
الملف: `build/app/outputs/flutter-apk/app-release.apk`.

أو من غير ما تسطب حاجة: ارفع المشروع على GitHub، وضيف في Settings → Secrets → Actions
`SUPABASE_URL` و `SUPABASE_ANON_KEY`، وشغّل Actions → Build Android APK → هتحمّل الـ APK من Artifacts.

### 3) آيفون
محتاج Apple Developer Program (99$ سنوياً). أسهل طريق Codemagic:
1. ارفع المشروع على GitHub واربطه بـ Codemagic (ملف `codemagic.yaml` جاهز).
2. أنشئ Variable group اسمها `supabase` فيها المتغيرين.
3. في App Store Connect أنشئ التطبيق بـ Bundle ID: `com.aedesign.aefinance`، وانسخ الـ Apple ID الرقمي في `APP_STORE_APPLE_ID` جوه `codemagic.yaml`.
4. أنشئ App Store Connect API key واربطه كـ integration باسم `AE_Finance_ASC` (أو غيّر الاسم في الملف).
5. شغّل workflow `ios`. بيطلع IPA ويترفع TestFlight، وتسطبه من تطبيق TestFlight على الآيفون.

### ملاحظات
- أول تسجيل دخول لازم يكون أونلاين عشان تتحمّل المهندسين والبنود.
- تسجيل الخروج بيمسح بيانات الموبايل، فبيرفض لو فيه عمليات لسه متزامنتش.
- الكود ما اتجمّعش (compile) في البيئة اللي اتكتب فيها، فلو أول `flutter build` طلّع خطأ ابعتهولي وأصلحه.
