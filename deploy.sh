#!/usr/bin/env bash

set -euo pipefail

# =============================================================================
# 0. COLOR DEFINITIONS
# =============================================================================
GREEN='\033[0;32m'
NC='\033[0m'

# =============================================================================
# 1. ENVIRONMENT VARIABLES
# =============================================================================
MY_DOMAIN="${MY_DOMAIN:-}"
CERT_EMAIL="${CERT_EMAIL:-}"
NAME_PREFIX="${NAME_PREFIX:-}"
CERT_RELOAD_CMD="${CERT_RELOAD_CMD:-systemctl restart sing-box nginx}"

# =============================================================================
# 2. VALIDATION
# =============================================================================
if [ "$EUID" -ne 0 ]; then
  echo "[Error] Please run as root"
  exit 1
fi

if [ -z "${MY_DOMAIN}" ] || [ -z "${CERT_EMAIL}" ] || [ -z "${NAME_PREFIX}" ]; then
  echo "[Error] Missing env vars"
  exit 1
fi

CERT_EXPORT_DIR="/etc/ssl/private/${MY_DOMAIN}"

echo "=================================================="
echo "Target Domain: ${MY_DOMAIN}"
echo "Cert Email:    ${CERT_EMAIL}"
echo "Prefix:        ${NAME_PREFIX}"
echo "=================================================="

# =============================================================================
# INSTALL DEPENDENCIES
# =============================================================================
echo -e "${GREEN}[Step 1/7]${NC} Installing dependencies..."
apt-get update && apt-get install -y curl jq uuid-runtime sudo nginx cron
systemctl enable --now cron
# =============================================================================
# ARCH DETECTION
# =============================================================================
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) SINGBOX_ARCH="linux-amd64" ;;
  aarch64) SINGBOX_ARCH="linux-arm64" ;;
  *) echo "Unsupported arch"; exit 1 ;;
esac

# =============================================================================
# INSTALL SING-BOX
# =============================================================================
echo -e "${GREEN}[Step 2/7]${NC} Installing sing-box..."

LATEST_VERSION=$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | jq -r .tag_name)
VERSION_NUM=${LATEST_VERSION#v}

curl -Lo sing-box.tar.gz \
"https://github.com/SagerNet/sing-box/releases/download/${LATEST_VERSION}/sing-box-${VERSION_NUM}-${SINGBOX_ARCH}.tar.gz"

tar -zxf sing-box.tar.gz
cd sing-box-${VERSION_NUM}-${SINGBOX_ARCH}
mv sing-box /usr/local/bin/
cd ..
rm -rf sing-box*

cat <<EOF > /etc/systemd/system/sing-box.service
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

# =============================================================================
# ACME CERT
# =============================================================================
echo -e "${GREEN}[Step 3/7]${NC} Installing acme..."

if [ ! -f "${HOME}/.acme.sh/acme.sh" ]; then
  curl https://get.acme.sh | sh -s email="${CERT_EMAIL}"
fi

ACME_BIN="${HOME}/.acme.sh/acme.sh"

"${ACME_BIN}" --set-default-ca --server letsencrypt
"${ACME_BIN}" --issue -d "${MY_DOMAIN}" --standalone || true

mkdir -p "${CERT_EXPORT_DIR}"

CERT_PATH="${CERT_EXPORT_DIR}/fullchain.cer"
KEY_PATH="${CERT_EXPORT_DIR}/private.key"

"${ACME_BIN}" --install-cert -d "${MY_DOMAIN}" \
  --key-file "${KEY_PATH}" \
  --fullchain-file "${CERT_PATH}" \
  --reloadcmd "${CERT_RELOAD_CMD}"

# =============================================================================
# PORTS
# =============================================================================
echo -e "${GREEN}[Step 4/7]${NC} Generating ports..."

while true; do
  TUIC_PORT=$((10000 + RANDOM % 20000))
  VLESS_PORT=$((10000 + RANDOM % 20000))
  SUB_PORT=$((10000 + RANDOM % 20000))

  if [ "$TUIC_PORT" -ne "$VLESS_PORT" ] && \
     [ "$TUIC_PORT" -ne "$SUB_PORT" ] && \
     [ "$VLESS_PORT" -ne "$SUB_PORT" ]; then
    break
  fi
done

# HY2 固定 443
HY2_PORT=443

UUID=$(uuidgen)
PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16)
HY2_PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 20)

SUB_PATH=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 12)

TUIC_NODE_NAME="${NAME_PREFIX}-TUIC"
VLESS_NODE_NAME="${NAME_PREFIX}-VLESS"
HY2_NODE_NAME="${NAME_PREFIX}-HY2"

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
<div class="domain">${MY_DOMAIN}</div>
<div class="card">
<p>Serious inquiries only.</p>
<a class="btn" href="mailto:sales@${MY_DOMAIN}">Contact Owner</a>
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
    # 局域网与本地地址
    - "*.lan"
    - "*.local"
    - "*.home.arpa"
    - "localhost"
    - "router.asus.com"
    - "miwifi.com"

    # 微信及腾讯核心服务
    - "+.weixin.qq.com"
    - "+.qq.com"
    - "+.tencent.com"
    - "+.qlogo.cn"
    - "+.qpic.cn"

    # 阿里与高德
    - "+.alipay.com"
    - "+.taobao.com"
    - "+.amap.com"
    - "+.alicdn.com"

    # 系统与联网检测
    - "*.msftconnecttest.com"
    - "*.msftncsi.com"
    - "*.apple.com"
    - "*.icloud.com"

    # 主流游戏平台
    - "+.xboxlive.com"
    - "+.sony.com"
    - "+.playstation.net"
    - "*.nintendo.net"
    - "+.steamcommunity.com"

    # NTP 时间同步
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
    server: ${MY_DOMAIN}
    port: 443
    password: ${HY2_PASSWORD}
    alpn:
      - h3
    sni: ${MY_DOMAIN}
    skip-cert-verify: false
    congestion-controller: bbr

  - name: "${TUIC_NODE_NAME}"
    type: tuic
    server: ${MY_DOMAIN}
    port: ${TUIC_PORT}
    uuid: ${UUID}
    password: ${PASSWORD}
    alpn:
      - h3
    congestion-controller: bbr
    disable-sni: true
    reduce-rtt: true
    sni: ${MY_DOMAIN}

  - name: "${VLESS_NODE_NAME}"
    type: vless
    server: ${MY_DOMAIN}
    port: ${VLESS_PORT}
    uuid: ${UUID}
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    client-fingerprint: chrome
    sni: ${MY_DOMAIN}

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
        "server_name": "${MY_DOMAIN}",
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
        "server_name": "${MY_DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      }
    },

    {
      "type": "hysteria2",
      "listen": "::",
      "listen_port": 443,

      "users": [
        {
          "name": "hy2",
          "password": "${HY2_PASSWORD}"
        }
      ],

      "up_mbps": 200,
      "down_mbps": 500,

      "obfs": {
        "type": "salamander",
        "password": "${HY2_PASSWORD}"
      },

      "ignore_client_bandwidth": false,

      "tls": {
        "enabled": true,
        "server_name": "${MY_DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      },

      "masquerade": {
        "type": "file",
        "directory": "file:///var/www/hy2"
      },

      "bbr_profile": "standard"
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
mkdir -p /etc/nginx/conf.d

cat <<EOF > /etc/nginx/conf.d/sub.conf
server {
    listen ${SUB_PORT} ssl;
    server_name ${MY_DOMAIN};

    ssl_certificate ${CERT_PATH};
    ssl_certificate_key ${KEY_PATH};

    location / {
        return 404;
    }

    location /${SUB_PATH} {
        alias /var/www/subscribe/clash.yaml;
        add_header Content-Type "text/yaml; charset=utf-8";
        add_header Content-Disposition "attachment; filename=\"${MY_DOMAIN}.yaml\"";
    }
}
EOF

# =============================================================================
# START SERVICES
# =============================================================================
echo -e "${GREEN}[Step 7/7]${NC} Starting services..."

systemctl enable sing-box nginx
systemctl restart sing-box nginx

# =============================================================================
# OUTPUT
# =============================================================================
echo "=================================================="
echo "TUIC:   ${TUIC_PORT}"
echo "VLESS:  ${VLESS_PORT}"
echo "HY2:    443"
echo "SUB:    https://${MY_DOMAIN}:${SUB_PORT}/${SUB_PATH}"
echo "HY2 SITE: https://${MY_DOMAIN}/ (masquerade)"
echo "=================================================="