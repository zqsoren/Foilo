#!/bin/bash
set -euo pipefail
staged_app=$1
installed_app=$2
old_pid=$3
backup_app="${installed_app}.previous-$$"
for i in {1..100}; do
  if ! kill -0 "$old_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if kill -0 "$old_pid" 2>/dev/null; then exit 1; fi
if test -e "$installed_app"; then mv "$installed_app" "$backup_app"; fi
if ! ditto "$staged_app" "$installed_app" || ! codesign --verify --deep --strict "$installed_app"; then
  rm -rf "$installed_app"
  if test -e "$backup_app"; then mv "$backup_app" "$installed_app"; fi
  exit 1
fi
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$installed_app"
pluginkit -a "$installed_app/Contents/PlugIns/XipoTodoWidget.appex"
# Restore the active extension choice after app registration/name changes.
pluginkit -e use -i io.xipo.todo.mac.widget
# WidgetKit can keep the old extension executable alive after replacing its bundle.
# End only our widget process so the next timeline request loads the new build.
/usr/bin/pkill -x XipoTodoWidget 2>/dev/null || true
open -a "$installed_app"
rm -rf "$backup_app" "$(dirname "$staged_app")"
