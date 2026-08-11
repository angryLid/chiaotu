#!/usr/bin/env bash
#
# Supported OS:    Debian / Ubuntu (systemd)
#                  Alpine Linux    (OpenRC or systemd)
# Prerequisites:   bash (Alpine: apk add bash)
# Usage:           DOMAIN=... EMAIL=... PREFIX=... DNS_PROVIDER=dns_cf bash deploy.sh
#                  (also export the DNS provider API env vars, e.g. CF_Token/CF_Zone_ID)
# Force redeploy:  FORCE=1 DOMAIN=... EMAIL=... PREFIX=... DNS_PROVIDER=dns_cf bash deploy.sh
# Optional ports:  TUIC_PORT  VLESS_PORT  HY2_PORT  SUB_PORT  (random if unset)
# Note:            Certs are issued via DNS-01 (no public port 80 required),
#                  so this works behind LXC hosts that don't forward :80/:443.
#

set -euo pipefail

# =============================================================================
# 0. COLOR DEFINITIONS
# =============================================================================
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# =============================================================================
# 1. ENVIRONMENT VARIABLES
# =============================================================================
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
PREFIX="${PREFIX:-}"
FORCE="${FORCE:-0}"
# ACME DNS-01 provider (e.g. dns_cf for Cloudflare). Requires the
# corresponding DNS API env vars (CF_Token / CF_Zone_ID for dns_cf, etc.).
DNS_PROVIDER="${DNS_PROVIDER:-}"

# =============================================================================
# 2. VALIDATION
# =============================================================================
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[Error]${NC} Please run as root"
  exit 1
fi

if [ -z "${DOMAIN}" ] || [ -z "${EMAIL}" ] || [ -z "${PREFIX}" ]; then
  echo -e "${RED}[Error]${NC} Missing env vars (DOMAIN, EMAIL, PREFIX)"
  exit 1
fi

CERT_EXPORT_DIR="/etc/ssl/private/${DOMAIN}"

# =============================================================================
# 3. OS & INIT DETECTION
# =============================================================================
if [ -f /etc/os-release ]; then
  # shellcheck source=/dev/null
  . /etc/os-release
  OS_ID="${ID:-unknown}"
else
  OS_ID="unknown"
fi

# Detect init system
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  INIT_SYSTEM="systemd"
elif command -v rc-service >/dev/null 2>&1 && [ -d /etc/init.d ]; then
  INIT_SYSTEM="openrc"
else
  INIT_SYSTEM="unknown"
fi

# -----------------------------------------------------------------------------
# Abstracted: package install
# -----------------------------------------------------------------------------
pkg_install() {
  case "$OS_ID" in
    alpine)
      apk update
      apk add --no-cache "$@"
      ;;
    debian|ubuntu)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y "$@"
      ;;
    *)
      echo -e "${RED}[Error]${NC} Unsupported OS: ${OS_ID}"
      exit 1
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Abstracted: enable and start a service
# -----------------------------------------------------------------------------
svc_enable_start() {
  local svc="$1"
  case "$INIT_SYSTEM" in
    systemd)
      systemctl enable --now "$svc"
      ;;
    openrc)
      rc-update add "$svc" default
      rc-service "$svc" start
      ;;
    *)
      echo -e "${RED}[Error]${NC} Unsupported init system: ${INIT_SYSTEM}"
      exit 1
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Abstracted: restart a service
# -----------------------------------------------------------------------------
svc_restart() {
  local svc="$1"
  case "$INIT_SYSTEM" in
    systemd) systemctl restart "$svc" ;;
    openrc)  rc-service "$svc" restart ;;
    *)
      echo -e "${RED}[Error]${NC} Unsupported init system: ${INIT_SYSTEM}"
      exit 1
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Abstracted: enable a service (without starting)
# -----------------------------------------------------------------------------
svc_enable() {
  local svc="$1"
  case "$INIT_SYSTEM" in
    systemd) systemctl enable "$svc" ;;
    openrc)  rc-update add "$svc" default ;;
    *)
      echo -e "${RED}[Error]${NC} Unsupported init system: ${INIT_SYSTEM}"
      exit 1
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Default cert reload command (can be overridden by env var)
# -----------------------------------------------------------------------------
if [ -z "${CERT_RELOAD_CMD:-}" ]; then
  case "$INIT_SYSTEM" in
    systemd)
      CERT_RELOAD_CMD="systemctl restart sing-box nginx"
      ;;
    openrc)
      CERT_RELOAD_CMD="rc-service sing-box restart && rc-service nginx restart"
      ;;
    *)
      CERT_RELOAD_CMD=""
      ;;
  esac
fi

# =============================================================================
# 4. IDEMPOTENCY GUARD
# =============================================================================
SINGBOX_CONFIG="/etc/sing-box/config.json"

if [ -f "${SINGBOX_CONFIG}" ] && [ "${FORCE}" != "1" ]; then
  echo -e "${YELLOW}[Warn]${NC} Existing deployment detected at ${SINGBOX_CONFIG}"
  echo "       Set FORCE=1 to redeploy and overwrite existing configuration."
  exit 1
fi

echo "=================================================="
echo "Target Domain:   ${DOMAIN}"
echo "Cert Email:      ${EMAIL}"
echo "Prefix:          ${PREFIX}"
echo "OS:              ${OS_ID} (${INIT_SYSTEM})"
echo "=================================================="

# =============================================================================
# INSTALL DEPENDENCIES
# =============================================================================
echo -e "${GREEN}[Step 1/7]${NC} Installing dependencies..."

case "$OS_ID" in
  alpine)
    pkg_install bash curl jq util-linux nginx dcron sudo openssl
    svc_enable_start dcron
    ;;
  debian|ubuntu)
    pkg_install curl jq uuid-runtime sudo nginx cron
    svc_enable_start cron
    ;;
  *)
    echo -e "${RED}[Error]${NC} Unsupported OS: ${OS_ID}"
    exit 1
    ;;
esac

# =============================================================================
# ARCH DETECTION
# =============================================================================
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  SINGBOX_ARCH="linux-amd64" ;;
  aarch64) SINGBOX_ARCH="linux-arm64" ;;
  *) echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

# Alpine uses musl libc — use musl build
if [ "$OS_ID" = "alpine" ]; then
  SINGBOX_ARCH="${SINGBOX_ARCH}-musl"
fi

# =============================================================================
# INSTALL SING-BOX
# =============================================================================
echo -e "${GREEN}[Step 2/7]${NC} Installing sing-box..."

LATEST_VERSION=$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | jq -r .tag_name)
VERSION_NUM=${LATEST_VERSION#v}

curl -Lo sing-box.tar.gz \
"https://github.com/SagerNet/sing-box/releases/download/${LATEST_VERSION}/sing-box-${VERSION_NUM}-${SINGBOX_ARCH}.tar.gz"

tar -zxf sing-box.tar.gz
cd "sing-box-${VERSION_NUM}-${SINGBOX_ARCH}"
mv sing-box /usr/local/bin/
cd ..
rm -rf sing-box*

case "$INIT_SYSTEM" in
  systemd)
    cat <<'EOF' > /etc/systemd/system/sing-box.service
[Unit]
Description=sing-box service
Documentation=https://sing-box.sagernet.org
After=network.target nss-lookup.target

[Service]
CapabilityBoundingSet=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=on-failure
RestartSec=18s
LimitNOFILE=infinity

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    ;;

  openrc)
    cat <<'EOF' > /etc/init.d/sing-box
#!/sbin/openrc-run

description="sing-box service"
command="/usr/local/bin/sing-box"
command_args="run -c /etc/sing-box/config.json"
command_background="yes"
pidfile="/run/${RC_SVCNAME}.pid"
respawn_delay=18
respawn_max=0

capabilities="CAP_NET_ADMIN CAP_NET_BIND_SERVICE CAP_NET_RAW"

depend() {
    need net
    after nss-lookup.target
}
EOF
    chmod +x /etc/init.d/sing-box
    ;;
esac

# =============================================================================
# ACME CERT
# =============================================================================
echo -e "${GREEN}[Step 3/7]${NC} Installing acme..."

if [ ! -f "${HOME}/.acme.sh/acme.sh" ]; then
  curl https://get.acme.sh | sh -s email="${EMAIL}"
fi

ACME_BIN="${HOME}/.acme.sh/acme.sh"

# Defensive: acme.sh needs openssl to generate keys. Install it if missing.
if ! command -v openssl >/dev/null 2>&1; then
  echo -e "${YELLOW}[Warn]${NC} openssl not found - installing it..."
  pkg_install openssl
fi

if [ -z "${DNS_PROVIDER}" ]; then
  echo -e "${RED}[Error]${NC} DNS_PROVIDER is required for the DNS-01 challenge"
  echo "       (e.g. dns_cf for Cloudflare). Also export the matching DNS API"
  echo "       env vars (e.g. CF_Token, CF_Zone_ID)."
  exit 1
fi

mkdir -p "${CERT_EXPORT_DIR}" /var/www/hy2

CERT_PATH="${CERT_EXPORT_DIR}/fullchain.cer"
KEY_PATH="${CERT_EXPORT_DIR}/private.key"

"${ACME_BIN}" --set-default-ca --server letsencrypt

# acme.sh exits non-zero both when it renews successfully-when-unneeded
# ("Skipping. Next renewal time is ...") and on real failures. Under set -e
# that would abort the whole deploy. Only treat a non-zero exit as fatal if
# no cert exists yet (i.e. nothing to fall back on); otherwise keep going.
if [ -f "${CERT_PATH}" ]; then
  if ! "${ACME_BIN}" --issue -d "${DOMAIN}" --dns "${DNS_PROVIDER}"; then
    echo -e "${YELLOW}[Warn]${NC} acme.sh skipped/failed to renew the cert"
    echo "       A valid cert exists at ${CERT_PATH} - continuing with it."
  fi
else
  "${ACME_BIN}" --issue -d "${DOMAIN}" --dns "${DNS_PROVIDER}"
fi

"${ACME_BIN}" --install-cert -d "${DOMAIN}" \
  --key-file "${KEY_PATH}" \
  --fullchain-file "${CERT_PATH}"

# =============================================================================
# PORTS
# =============================================================================
echo -e "${GREEN}[Step 4/7]${NC} Generating ports..."

_rand_port() {
  echo $((10000 + RANDOM % 20000))
}

# Remember which ports were explicitly provided via env
USER_TUIC="${TUIC_PORT:-}"
USER_VLESS="${VLESS_PORT:-}"
USER_SUB="${SUB_PORT:-}"
USER_HY2="${HY2_PORT:-}"

# Fill in defaults / random for unset ports
TUIC_PORT="${TUIC_PORT:-$(_rand_port)}"
VLESS_PORT="${VLESS_PORT:-$(_rand_port)}"
SUB_PORT="${SUB_PORT:-$(_rand_port)}"
HY2_PORT="${HY2_PORT:-443}"

# Re-roll random ports until no conflicts (user-provided ports are never changed)
_attempts=0
while [ "$TUIC_PORT" -eq "$VLESS_PORT" ] || \
      [ "$TUIC_PORT" -eq "$SUB_PORT" ] || \
      [ "$TUIC_PORT" -eq "$HY2_PORT" ] || \
      [ "$VLESS_PORT" -eq "$SUB_PORT" ] || \
      [ "$VLESS_PORT" -eq "$HY2_PORT" ] || \
      [ "$SUB_PORT" -eq "$HY2_PORT" ]; do
  [ -z "$USER_TUIC" ]  && TUIC_PORT=$(_rand_port)
  [ -z "$USER_VLESS" ] && VLESS_PORT=$(_rand_port)
  [ -z "$USER_SUB" ]   && SUB_PORT=$(_rand_port)
  [ -z "$USER_HY2" ]   && HY2_PORT=$(_rand_port)

  _attempts=$((_attempts + 1))
  if [ "$_attempts" -gt 100 ]; then
    echo -e "${RED}[Error]${NC} Port conflict detected and cannot resolve automatically."
    echo "       TUIC_PORT=${TUIC_PORT}"
    echo "       VLESS_PORT=${VLESS_PORT}"
    echo "       HY2_PORT=${HY2_PORT}"
    echo "       SUB_PORT=${SUB_PORT}"
    echo "       Please ensure all user-provided ports are unique."
    exit 1
  fi
done

UUID=$(uuidgen)
# Use openssl rand instead of head|tr|head pipelines: the trailing
# `head -c N` closes the pipe early and, under `set -o pipefail`, the
# upstream SIGPIPE (141) makes `set -e` abort the script silently.
PASSWORD=$(openssl rand -hex 8)
HY2_PASSWORD=$(openssl rand -hex 10)

SUB_PATH=$(openssl rand -hex 6)

TUIC_NODE_NAME="${PREFIX}-TUIC"
VLESS_NODE_NAME="${PREFIX}-VLESS"
HY2_NODE_NAME="${PREFIX}-HY2"

# =============================================================================
# DIRECTORY
# =============================================================================
mkdir -p /etc/sing-box
mkdir -p /var/www/subscribe
mkdir -p /var/www/hy2

# =============================================================================
# DOMAIN SALE PAGE
# =============================================================================
echo -e "${GREEN}[Step 5/7]${NC} Writing domain page..."

cat <<EOF > /var/www/hy2/index.html
<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Domain For Sale</title>
<style>
body{margin:0;background:#0b0f17;color:#e8eefc;
font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh}
.container{text-align:center;max-width:600px}
h1{font-size:42px}
.domain{color:#6ea8fe;margin:20px}
.card{padding:20px;border:1px solid #1f2a44;border-radius:12px}
.btn{display:inline-block;margin-top:20px;padding:12px 20px;
background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px}
</style>
</head>
<body>
<div class="container">
<h1>This Domain Is For Sale</h1>
<div class="domain">${DOMAIN}</div>
<div class="card">
<p>Serious inquiries only.</p>
<a class="btn" href="mailto:sales@${DOMAIN}">Contact Owner</a>
</div>
</div>
</body>
</html>
EOF

cat <<EOF > /var/www/subscribe/clash.yaml
mixed-port: 7890
allow-lan: true
bind-address: "*"
mode: rule
log-level: info

dns:
  enable: true
  listen: "0.0.0.0:1053"
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16

  direct-nameserver:
    - system

  proxy-server-nameserver:
    - 223.5.5.5
    - 119.29.29.29

  nameserver:
    - 119.29.29.29
    - 180.184.1.1

  fallback:
    - 77.88.8.8
    - 168.95.1.1
    - https://dns.google/dns-query
    - https://1.1.1.1/dns-query

  fallback-filter:
    geoip: true
    geoip-code: CN
    ipcidr:
      - 240.0.0.0/4
      - 127.0.0.1/8
      - 0.0.0.0/32

  fake-ip-filter:
    # LAN & local addresses
    - "*.lan"
    - "*.local"
    - "*.home.arpa"
    - "localhost"
    - "router.asus.com"
    - "miwifi.com"

    # WeChat & Tencent core services
    - "+.weixin.qq.com"
    - "+.qq.com"
    - "+.tencent.com"
    - "+.qlogo.cn"
    - "+.qpic.cn"

    # Alibaba & Amap
    - "+.alipay.com"
    - "+.taobao.com"
    - "+.amap.com"
    - "+.alicdn.com"

    # System & connectivity checks
    - "*.msftconnecttest.com"
    - "*.msftncsi.com"
    - "*.apple.com"
    - "*.icloud.com"

    # Major gaming platforms
    - "+.xboxlive.com"
    - "+.sony.com"
    - "+.playstation.net"
    - "*.nintendo.net"
    - "+.steamcommunity.com"

    # NTP time sync
    - "time.*.com"
    - "time.*.apple.com"
    - "time.nstl.gov.cn"
    - "*.ntp.org.cn"
rules:
  - RULE-SET,lan_ip,DIRECT
  - RULE-SET,lan_non_ip,DIRECT

  - RULE-SET,ai_non_ip,🤖 AI

  - RULE-SET,apple_cn_non_ip,DIRECT
  - RULE-SET,apple_cdn,🍎 Apple
  - RULE-SET,apple_services,🍎 Apple

  - RULE-SET,microsoft_cdn_non_ip,DIRECT
  - RULE-SET,microsoft_non_ip,🟦 Microsoft

  - RULE-SET,direct_non_ip,DIRECT
  - RULE-SET,domestic_non_ip,DIRECT
  - DOMAIN-SUFFIX,cn,DIRECT
  - DOMAIN-KEYWORD,-cn,DIRECT

  - RULE-SET,domestic_ip,DIRECT,no-resolve
  - GEOIP,CN,DIRECT,no-resolve

  - RULE-SET,global_non_ip,🌐 手动选择
  - MATCH,🌐 手动选择

rule-providers:
  ai_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/ai.txt
    path: ./sukkaw_ruleset/ai_non_ip.txt

  apple_cdn:
    type: http
    behavior: domain
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/domainset/apple_cdn.txt
    path: ./sukkaw_ruleset/apple_cdn.txt

  apple_services:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/apple_services.txt
    path: ./sukkaw_ruleset/apple_services.txt

  apple_cn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/apple_cn.txt
    path: ./sukkaw_ruleset/apple_cn_non_ip.txt

  microsoft_cdn_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/microsoft_cdn.txt
    path: ./sukkaw_ruleset/microsoft_cdn_non_ip.txt

  microsoft_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/microsoft.txt
    path: ./sukkaw_ruleset/microsoft_non_ip.txt

  lan_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/lan.txt
    path: ./sukkaw_ruleset/lan_ip.txt

  lan_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/lan.txt
    path: ./sukkaw_ruleset/lan_non_ip.txt

  domestic_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/domestic.txt
    path: ./sukkaw_ruleset/domestic_non_ip.txt
  direct_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/direct.txt
    path: ./sukkaw_ruleset/direct_non_ip.txt
  global_non_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/non_ip/global.txt
    path: ./sukkaw_ruleset/global_non_ip.txt
  domestic_ip:
    type: http
    behavior: classical
    format: text
    interval: 43200
    url: https://ruleset.skk.moe/Clash/ip/domestic.txt
    path: ./sukkaw_ruleset/domestic_ip.txt

proxies:
  - name: "${HY2_NODE_NAME}"
    type: hysteria2
    server: ${DOMAIN}
    port: ${HY2_PORT}
    password: ${HY2_PASSWORD}
    alpn:
      - h3
    sni: ${DOMAIN}
    skip-cert-verify: false

  - name: "${TUIC_NODE_NAME}"
    type: tuic
    server: ${DOMAIN}
    port: ${TUIC_PORT}
    uuid: ${UUID}
    password: ${PASSWORD}
    alpn:
      - h3
    congestion-controller: bbr
    disable-sni: true
    reduce-rtt: true
    sni: ${DOMAIN}

  - name: "${VLESS_NODE_NAME}"
    type: vless
    server: ${DOMAIN}
    port: ${VLESS_PORT}
    uuid: ${UUID}
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    client-fingerprint: chrome
    sni: ${DOMAIN}

proxy-groups:
  - name: 🌐 手动选择
    type: select
    proxies:
      - "${TUIC_NODE_NAME}"
      - "${VLESS_NODE_NAME}"
      - "${HY2_NODE_NAME}"
  - {name: 🤖 AI, type: select, proxies: [🌐 手动选择]}
  - {name: 🟦 Microsoft, type: select, proxies: [DIRECT, 🌐 手动选择]}
  - {name: 🍎 Apple, type: select, proxies: [DIRECT, 🌐 手动选择]}

EOF

# =============================================================================
# SING-BOX CONFIG
# =============================================================================
echo -e "${GREEN}[Step 6/7]${NC} Writing sing-box config..."

cat <<EOF > /etc/sing-box/config.json
{
  "log": { "level": "info" },

  "inbounds": [

    {
      "type": "tuic",
      "listen": "::",
      "listen_port": ${TUIC_PORT},
      "users": [{ "uuid": "${UUID}", "password": "${PASSWORD}" }],
      "tls": {
        "enabled": true,
        "server_name": "${DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}",
        "alpn": ["h3"]
      }
    },

    {
      "type": "vless",
      "listen": "::",
      "listen_port": ${VLESS_PORT},
      "users": [{ "uuid": "${UUID}", "flow": "xtls-rprx-vision" }],
      "tls": {
        "enabled": true,
        "server_name": "${DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      }
    },

    {
      "type": "hysteria2",
      "listen": "::",
      "listen_port": ${HY2_PORT},

      "users": [
        {
          "name": "hy2",
          "password": "${HY2_PASSWORD}"
        }
      ],

      "up_mbps": 200,
      "down_mbps": 500,

      "ignore_client_bandwidth": false,

      "tls": {
        "enabled": true,
        "server_name": "${DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      },
      "masquerade": "file:///var/www/hy2"
    }
  ],

  "outbounds": [
    { "type": "direct" }
  ]
}
EOF

# =============================================================================
# NGINX SUB
# =============================================================================
# Alpine includes http{} server blocks from /etc/nginx/http.d/; Debian/Ubuntu
# use /etc/nginx/conf.d/. Writing a server{} into the wrong dir triggers
# 'nginx: [emerg] "server" directive is not allowed here'.
case "$OS_ID" in
  alpine)  NGINX_CONF_DIR="/etc/nginx/http.d" ;;
  debian|ubuntu) NGINX_CONF_DIR="/etc/nginx/conf.d" ;;
  *) NGINX_CONF_DIR="/etc/nginx/conf.d" ;;
esac

mkdir -p "${NGINX_CONF_DIR}"

cat <<EOF > "${NGINX_CONF_DIR}/sub.conf"
server {
    listen ${SUB_PORT} ssl;
    listen [::]:${SUB_PORT} ssl;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_PATH};
    ssl_certificate_key ${KEY_PATH};

    location / {
        return 404;
    }

    location /${SUB_PATH} {
        alias /var/www/subscribe/clash.yaml;
        add_header Content-Type "text/yaml; charset=utf-8";
        add_header Content-Disposition "attachment; filename=\"${DOMAIN}.yaml\"";
    }
}
EOF

# =============================================================================
# START SERVICES
# =============================================================================
echo -e "${GREEN}[Step 7/7]${NC} Starting services..."

svc_enable sing-box
svc_enable nginx
svc_restart sing-box
svc_restart nginx

if [ -n "${CERT_RELOAD_CMD}" ]; then
  "${ACME_BIN}" --install-cert -d "${DOMAIN}" --reloadcmd "${CERT_RELOAD_CMD}"
fi

# =============================================================================
# OUTPUT
# =============================================================================
echo "=================================================="
echo "OS / Init:  ${OS_ID} (${INIT_SYSTEM})"
echo "TUIC:       ${TUIC_PORT}"
echo "VLESS:      ${VLESS_PORT}"
echo "HY2:        ${HY2_PORT}"
echo "SUB:        https://${DOMAIN}:${SUB_PORT}/${SUB_PATH}"
if [ "${HY2_PORT}" = "443" ]; then
  echo "HY2 SITE:   https://${DOMAIN}/ (masquerade)"
else
  echo "HY2 SITE:   https://${DOMAIN}:${HY2_PORT}/ (masquerade)"
fi
echo "=================================================="
