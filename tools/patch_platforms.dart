// يعدّل ملفات android/ios اللي بيولّدها `flutter create` (إذن الإنترنت، الاسم، صلاحية الصور، bundle id).
import 'dart:io';

const appId = 'com.aedesign.aefinance';

void edit(String path, String Function(String) fn) {
  final f = File(path);
  if (!f.existsSync()) { stdout.writeln('skip (not found): $path'); return; }
  f.writeAsStringSync(fn(f.readAsStringSync()));
  stdout.writeln('patched: $path');
}

void main() {
  // ---- Android ----
  edit('android/app/src/main/AndroidManifest.xml', (s) {
    if (!s.contains('android.permission.INTERNET')) {
      s = s.replaceFirst('<application', '<uses-permission android:name="android.permission.INTERNET"/>\n    <application');
    }
    return s.replaceFirst(RegExp(r'android:label="[^"]*"'), 'android:label="AE Finance"');
  });
  for (final g in ['android/app/build.gradle.kts', 'android/app/build.gradle']) {
    edit(g, (s) => s.replaceFirst(RegExp(r'applicationId\s*=?\s*"[^"]+"'), g.endsWith('.kts') ? 'applicationId = "$appId"' : 'applicationId "$appId"'));
  }

  // ---- iOS ----
  edit('ios/Runner/Info.plist', (s) {
    s = s.replaceFirstMapped(RegExp(r'(<key>CFBundleDisplayName</key>\s*<string>)[^<]*(</string>)'), (m) => '${m[1]}AE Finance${m[2]}');
    if (!s.contains('NSPhotoLibraryUsageDescription')) {
      final i = s.lastIndexOf('</dict>');
      s = '${s.substring(0, i)}\t<key>NSPhotoLibraryUsageDescription</key>\n\t<string>لاختيار لوجو المكتب</string>\n${s.substring(i)}';
    }
    if (!s.contains('ITSAppUsesNonExemptEncryption')) {
      final i = s.lastIndexOf('</dict>');
      s = '${s.substring(0, i)}\t<key>ITSAppUsesNonExemptEncryption</key>\n\t<false/>\n${s.substring(i)}';
    }
    return s;
  });
  edit('ios/Runner.xcodeproj/project.pbxproj',
      (s) => s.replaceAll(RegExp(r'PRODUCT_BUNDLE_IDENTIFIER = com\.aedesign\.[A-Za-z_]+;'), 'PRODUCT_BUNDLE_IDENTIFIER = $appId;'));

  // اختبار flutter الافتراضي بيشير لـ MyApp وهيكسر `flutter test`
  final t = File('test/widget_test.dart');
  if (t.existsSync()) t.deleteSync();
}
