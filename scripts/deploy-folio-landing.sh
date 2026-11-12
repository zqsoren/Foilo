#!/usr/bin/env bash
# Run remotely after uploading the standalone landing archive. Does not restart the app.
set -euo pipefail
release=${1:?release required}
checksum=${2:?checksum required}
[[ "$release" =~ ^[0-9]{8}-[0-9]{2}$ ]]
[[ "$checksum" =~ ^[a-f0-9]{64}$ ]]
archive=/tmp/folio-landing-$release.tar.gz
root=/opt/life-workbench/landing
backup=/var/backups/folio-landing-$release
config=/etc/nginx/sites-available/life-workbench
new=$root/releases/$release
test ! -e "$new"
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = "$checksum"
sudo install -d -m 755 "$new" "$backup"
sudo cp "$config" "$backup/nginx-before.conf"
old=$(readlink "$root/current" || true)
printf '%s\n' "$old" | sudo tee "$backup/previous-landing.txt" >/dev/null
sudo tar -xzf "$archive" --no-same-owner -C "$new"
test -s "$new/index.html"
test -s "$new/site-assets/site.css"
test -s "$new/site-assets/motion.js"
test -s "$new/site-assets/motion.css"
test -s "$new/site-assets/layout.css"
test -s "$new/site-assets/account.js"
sudo chmod -R a+rX "$new"
rollback() {
 sudo cp "$backup/nginx-before.conf" "$config"
 if test -n "$old"; then
  sudo ln -sfn "$old" "$root/current-rollback"
  sudo mv -Tf "$root/current-rollback" "$root/current"
 else
  sudo rm -f "$root/current"
 fi
 sudo nginx -t && sudo systemctl reload nginx
}
trap rollback ERR
sudo ln -s "$new" "$root/current-$release"
sudo mv -Tf "$root/current-$release" "$root/current"
sudo python3 - "$config" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text()
if 'location = /folio/' not in s:
 assert s.count('    location / {')==1
 s=s.replace('    location / {', '''    # Standalone landing page; keep /folio/login/ and existing product assets on the app.
    location = /folio { return 302 /folio/; }
    location = /folio/ {
        root /opt/life-workbench/landing/current;
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }
    location ^~ /folio/site-assets/ {
        alias /opt/life-workbench/landing/current/site-assets/;
        add_header Cache-Control "no-cache";
    }

    location / {''',1)
p.write_text(s)
PY
sudo nginx -t
sudo systemctl reload nginx
# nginx reload returns before replacement workers are guaranteed to accept traffic.
healthy=0
for attempt in 1 2 3 4 5; do
 if curl -fsS --max-time 15 https://life-152-32-131-4.nip.io/folio/ | cmp -s - "$new/index.html"; then healthy=1; break; fi
 sleep 1
done
test "$healthy" = 1
curl -fsS --max-time 15 https://life-152-32-131-4.nip.io/folio/site-assets/site.css | cmp -s - "$new/site-assets/site.css"
curl -fsS --max-time 15 https://life-152-32-131-4.nip.io/folio/site-assets/motion.css | cmp -s - "$new/site-assets/motion.css"
curl -fsS --max-time 15 https://life-152-32-131-4.nip.io/folio/site-assets/motion.js | cmp -s - "$new/site-assets/motion.js"
for asset in layout.css account.js; do
 curl -fsS --max-time 15 "https://life-152-32-131-4.nip.io/folio/site-assets/$asset" | cmp -s - "$new/site-assets/$asset"
done
curl -fsS --max-time 15 -o /dev/null https://life-152-32-131-4.nip.io/login
curl -fsS --max-time 15 -o /dev/null https://life-152-32-131-4.nip.io/api/health
trap - ERR
printf 'Published landing %s; backup %s\n' "$release" "$backup"
