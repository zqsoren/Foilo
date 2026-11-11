#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$PWD
out="$root/output/mac"
app="$out/DIGTODO.app"
widget="$app/Contents/PlugIns/XipoTodoWidget.appex"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" "$widget/Contents/MacOS" "$out/module-cache"
if ! test -e "$out/AppIcon.icns"; then
  xcrun swift -module-cache-path "$out/module-cache" mac/XipoTodo/make-icon.swift "$out/AppIcon.iconset"
  iconutil -c icns "$out/AppIcon.iconset" -o "$out/AppIcon.icns"
fi
xcrun swiftc -O -parse-as-library -swift-version 5 -target arm64-apple-macos14.0 \
  -module-cache-path "$out/module-cache" \
  mac/XipoTodo/Sources/*.swift -o "$app/Contents/MacOS/XipoTodo" \
  -framework AppKit -framework SwiftUI -framework WidgetKit -framework Security -framework ServiceManagement
# Enter through Foundation's extension service entry point; an ordinary Swift
# executable exits before chronod can read widget descriptors on macOS 26.
xcrun swiftc -O -parse-as-library -application-extension -module-name XipoTodoWidget -swift-version 5 -target arm64-apple-macos14.0 \
  -module-cache-path "$out/module-cache" \
  mac/XipoTodo/Sources/WidgetSnapshot.swift mac/XipoTodo/Widget/TodayWidget.swift \
  -o "$widget/Contents/MacOS/XipoTodoWidget" \
  -framework SwiftUI -framework WidgetKit -framework AppIntents \
  -Xlinker -e -Xlinker _NSExtensionMain
cp mac/XipoTodo/Info.plist "$app/Contents/Info.plist"
cp mac/XipoTodo/Widget/Info.plist "$widget/Contents/Info.plist"
cp mac/XipoTodo/install-update.sh "$app/Contents/Resources/install-update.sh"
python3 mac/XipoTodo/widget-intent-metadata.py "$widget/Contents/Resources"
build_number=$(date -u +%Y%m%d%H%M%S)
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_number" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $build_number" "$widget/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :XipoDevelopmentSourcePath string $root" "$app/Contents/Info.plist"
bridge_token=$(openssl rand -hex 32)
/usr/libexec/PlistBuddy -c "Add :XipoWidgetBridgeToken string $bridge_token" "$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :XipoWidgetBridgeToken string $bridge_token" "$widget/Contents/Info.plist"
if test -e "$out/AppIcon.icns"; then cp "$out/AppIcon.icns" "$app/Contents/Resources/"; fi
signing_identity=${XIPO_SIGNING_IDENTITY:-Xipo Local Code Signing}
codesign --force --sign "$signing_identity" --identifier io.xipo.todo.mac.widget \
  --entitlements mac/XipoTodo/Widget/Entitlements.plist "$widget"
codesign --force --sign "$signing_identity" --identifier io.xipo.todo.mac "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/Xipo-Todo-Mac-arm64.zip"
mkdir -p "$out/dmg-content"
rm -rf "$out/dmg-content/DIGTODO.app"
ditto "$app" "$out/dmg-content/DIGTODO.app"
ln -sfn /Applications "$out/dmg-content/应用程序"
hdiutil create -volname 'DIGTODO' -srcfolder "$out/dmg-content" -ov -format UDZO "$out/Xipo-Todo-Mac-arm64.dmg" >/dev/null
python3 - "$out/dmg-content" <<'PY'
from pathlib import Path
import shutil
import sys
shutil.rmtree(Path(sys.argv[1]))
PY
printf 'Built: %s\n' "$app"
