#!/usr/bin/env bash
# Run on the existing server after uploading release.tar.gz to the matching
# backup directory. Alternate two slots so active requests can finish.
set -euo pipefail
release=${1:?release id required}
checksum=${2:?archive checksum required}
[[ "$release" =~ ^[0-9]{8}-[0-9]{2}$ ]]
[[ "$checksum" =~ ^[a-f0-9]{64}$ ]]
root=/opt/life-workbench
backup=/var/backups/life-workbench-$release
archive=$backup/release.tar.gz
nginx_config=/etc/nginx/sites-available/life-workbench
node=$root/runtime/node22/bin/node
new=$root/releases/$release
test ! -e "$new"
test "$(sha256sum "$archive" | cut -d ' ' -f 1)" = "$checksum"
old=$(readlink -f "$root/current")
old_port=$(sed -nE 's/.*proxy_pass http:\/\/127\.0\.0\.1:(302[01]);/\1/p' "$nginx_config")
case "$old_port" in
  3020) slot=green; port=3021; prior=blue ;;
  3021) slot=blue; port=3020; prior=green ;;
  *) echo 'Unexpected workbench upstream; refusing to alter nginx' >&2; exit 1 ;;
esac
unit=life-workbench@$slot.service
old_unit=life-workbench@$prior.service
if ! systemctl is-active --quiet "$old_unit"; then old_unit=life-workbench.service; fi
systemctl is-active --quiet "$old_unit"
if systemctl is-active --quiet "$unit"; then echo 'Standby slot is still draining; retry later' >&2; exit 1; fi
sudo cp "$nginx_config" "$backup/nginx-before.conf"
"$node" - "$backup/before-deploy.sqlite" <<'NODE'
const D=require('/opt/life-workbench/current/node_modules/better-sqlite3');
const db=new D('/var/lib/life-workbench/life-workbench.sqlite',{readonly:true});
(async()=>{await db.backup(process.argv[2]);console.log('Database backup:',db.pragma('quick_check')[0].quick_check);db.close()})().catch(e=>{console.error(e.message);process.exit(1)});
NODE
sudo install -d -m 755 "$new" "$root/slots" "$root/shared/static"
sudo tar -xzf "$archive" --no-same-owner -C "$new"
test ! -e "$new/data"
"$node" --check "$new/server.js"
"$node" - "$new" <<'NODE'
const D=require(process.argv[2]+'/node_modules/better-sqlite3');const db=new D(':memory:');db.prepare('SELECT 1').get();db.close();
NODE
# Keep immutable public build assets from prior versions available to old tabs.
for static in "$root"/releases/*/.next/static; do
  if test -d "$static"; then sudo cp -an "$static/." "$root/shared/static/"; fi
done
sudo ln -sfn "$new" "$root/slots/$slot"
sudo install -d -m 755 /etc/life-workbench
printf 'PORT=%s\n' "$port" | sudo tee "/etc/life-workbench/$slot.env" >/dev/null
sudo tee /etc/systemd/system/life-workbench@.service >/dev/null <<'UNIT'
[Unit]
Description=Life Workbench (%i)
After=network.target
[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/opt/life-workbench/slots/%i
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=MY_LIFE_DB_PATH=/var/lib/life-workbench/life-workbench.sqlite
Environment=NODE_OPTIONS=--max-old-space-size=256
EnvironmentFile=/etc/life-workbench/%i.env
ExecStart=/opt/life-workbench/runtime/node22/bin/node /opt/life-workbench/slots/%i/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
MemoryHigh=320M
MemoryMax=448M
CPUQuota=100%
TasksMax=128
OOMScoreAdjust=500
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/var/lib/life-workbench
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl start "$unit"
healthy=0
for attempt in $(seq 1 25); do
  if curl -fsS --max-time 3 "http://127.0.0.1:$port/api/health" >/dev/null; then healthy=1; break; fi
  sleep 1
done
if test "$healthy" != 1; then sudo systemctl stop "$unit"; echo 'Standby unhealthy; live service unchanged' >&2; exit 1; fi
# Prepare only this site's configuration; a failed check restores the old file.
sudo python3 - "$nginx_config" "$old_port" "$port" <<'PY'
from pathlib import Path
import sys
path=Path(sys.argv[1]);s=path.read_text()
old=f'proxy_pass http://127.0.0.1:{sys.argv[2]};';new=f'proxy_pass http://127.0.0.1:{sys.argv[3]};'
assert s.count(old)==1
s=s.replace(old,new)
if 'location ^~ /_next/static/' not in s:
 s=s.replace('    location / {', '''    location ^~ /_next/static/ {
        alias /opt/life-workbench/shared/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {''',1)
path.write_text(s)
PY
if ! sudo nginx -t || ! sudo systemctl reload nginx; then
 sudo cp "$backup/nginx-before.conf" "$nginx_config"
 sudo systemctl reload nginx
 sudo systemctl stop "$unit"
 exit 1
fi
if ! curl -fsS --retry 3 --retry-delay 1 --max-time 10 https://life-152-32-131-4.nip.io/api/health >/dev/null; then
 sudo cp "$backup/nginx-before.conf" "$nginx_config"
 sudo systemctl reload nginx
 sudo systemctl stop "$unit"
 echo 'Public health check failed; restored prior upstream' >&2
 exit 1
fi
sudo ln -s "$new" "$root/current-$release"
sudo mv -Tf "$root/current-$release" "$root/current"
sudo systemctl enable "$unit"
sudo systemctl disable "$old_unit"
# Existing AI calls may last 120 seconds; nginx old workers drain before stop.
sudo systemd-run --unit="life-drain-$release" --on-active=190s /bin/systemctl stop "$old_unit"
printf 'Live release: %s; serving port: %s; prior release retained: %s\n' "$release" "$port" "$old"
