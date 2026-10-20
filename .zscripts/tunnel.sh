#!/usr/bin/env bash
# ─── FinWise Cloudflare Tunnel setup/run ─────────────────────────────────
# Exposes the app at http://localhost:3000 via a named Cloudflare Tunnel at
# https://xnocode.qzz.io — no router port-forwarding needed.
#
# Prerequisites (do once, in your browser):
#   1. xnocode.qzz.io registered at your qzz.io / DigitalPlat panel
#   2. xnocode.qzz.io added as a site in a free Cloudflare account
#   3. NS records for xnocode.qzz.io pointed at the two Cloudflare nameservers
#      (wait until the Cloudflare zone status says "Active")
set -euo pipefail

CF="$HOME/.local/bin/cloudflared"
TUNNEL_NAME="finwise"
APP_HOST="xnocode.qzz.io"
CONFIG_DIR="$HOME/.cloudflared"
CONFIG="$CONFIG_DIR/config.yml"

[ -x "$CF" ] || { echo "cloudflared not found at $CF"; exit 1; }

# 1) Authenticate (prints a URL — open it in your browser and authorize)
if [ ! -f "$CONFIG_DIR/cert.pem" ]; then
  echo "► Not logged in to Cloudflare yet. A login URL will print below —"
  echo "  open it in your browser and pick your xnocode.qzz.io zone (or your account)."
  "$CF" tunnel login
fi

# 2) Create the tunnel if it doesn't exist
if ! "$CF" tunnel list -o json | grep -q "\"$TUNNEL_NAME\""; then
  echo "► Creating tunnel '$TUNNEL_NAME'..."
  "$CF" tunnel create "$TUNNEL_NAME"
fi

UUID="$("$CF" tunnel list -o json | python3 -c '
import json, sys, os
name = os.environ["TUNNEL_NAME"]
for t in json.load(sys.stdin):
    if t.get("name") == name:
        print(t["id"]); break
')"
[ -n "$UUID" ] || { echo "Could not find tunnel UUID"; exit 1; }
echo "► Tunnel: $TUNNEL_NAME ($UUID)"

# 3) Write the tunnel config — ingress to the local FinWise app
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG" <<EOF
tunnel: $UUID
credentials-file: $CONFIG_DIR/$UUID.json

ingress:
  - hostname: $APP_HOST
    service: http://localhost:3000
  - service: http_status:404
EOF
echo "► Wrote $CONFIG"

# 4) Create the DNS record (CNAME xnocode.qzz.io -> tunnel) if missing
if "$CF" tunnel route dns "$TUNNEL_NAME" "$APP_HOST" >/tmp/route.out 2>&1; then
  echo "► DNS record created: $APP_HOST -> $TUNNEL_NAME"
elif grep -qi 'already exists' /tmp/route.out; then
  echo "► DNS record already exists: $APP_HOST"
else
  echo "► DNS record step failed (zone may not be Active on Cloudflare yet):"
  cat /tmp/route.out
  exit 1
fi

# 5) Make sure the local app is running
if ! curl -sf -o /dev/null --max-time 3 http://localhost:3000; then
  echo "► Local app is NOT running on :3000 — start it first: npm run dev"
  exit 1
fi

# 6) Run the tunnel (foreground; Ctrl+C to stop)
echo "► Running tunnel → https://$APP_HOST  (Ctrl+C to stop)"
exec "$CF" tunnel run "$TUNNEL_NAME"
