#!/usr/bin/env bash
# بيجهّز مجلدات android/ios ويطبّق التعديلات المطلوبة. شغّله مرة من جذر المشروع.
set -euo pipefail
cd "$(dirname "$0")/.."
flutter create --org com.aedesign --platforms android,ios .
flutter pub get
dart run tools/patch_platforms.dart
dart run flutter_launcher_icons
