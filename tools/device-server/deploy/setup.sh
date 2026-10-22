#!/usr/bin/env bash
# Installs or updates the device-push server on an Ubuntu/Debian cloud server.
# Run as root from the folder holding device-server.mjs, device-push.service and this file:
#
#   bash setup.sh            first install: asks for the Supabase URL and key
#   bash setup.sh            again later: updates the code, keeps the settings
#
# Optional: PORT=8090 bash setup.sh   (the port the terminal is given; default 8090)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8090}"
ENV_FILE=/etc/device-push.env

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo bash setup.sh)"; exit 1; }
[ -f "$HERE/device-server.mjs" ] || { echo "device-server.mjs not found next to setup.sh"; exit 1; }

# Node.js 20+ ------------------------------------------------------------------
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Installing Node.js 22..."
  apt-get update -y
  apt-get install -y ca-certificates curl
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Settings (kept across updates) ---------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  read -rp  "SUPABASE_URL (https://<project-id>.supabase.co): " SUPABASE_URL
  read -rsp "SUPABASE_SERVICE_ROLE_KEY (hidden): " SUPABASE_SERVICE_ROLE_KEY; echo
  umask 077
  cat > "$ENV_FILE" <<EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
DEVICE_TZ_OFFSET=+05:30
HOST=0.0.0.0
PORT=$PORT
EOF
  chmod 600 "$ENV_FILE"
fi
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"

# Code + service --------------------------------------------------------------
install -d -m 755 /opt/device-push
install -m 644 "$HERE/device-server.mjs" /opt/device-push/device-server.mjs
install -m 644 "$HERE/device-push.service" /etc/systemd/system/device-push.service
systemctl daemon-reload
systemctl enable device-push >/dev/null
systemctl restart device-push

# Open the port if ufw is in use (never turns ufw on by itself).
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null
fi

sleep 2
if curl -fsS "http://127.0.0.1:$PORT/AIData.aspx" >/dev/null; then
  IP="$(curl -fsS -4 --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo
  echo "device-push is running."
  echo "  On the terminal:  Push Server IP = $IP   Push Server Port = $PORT"
  echo "  Health check:     http://$IP:$PORT/AIData.aspx"
  echo "  Live log:         journalctl -u device-push -f"
else
  echo "device-push did not start. See: journalctl -u device-push -n 50"
  exit 1
fi
