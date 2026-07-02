#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status, and catch undefined variables
set -euo pipefail

# =============================================================================
# 0. COLOR DEFINITIONS FOR OUTPUT HIGHLIGHTING
# =============================================================================
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# =============================================================================
# 1. ENVIRONMENT VARIABLES CONFIGURATION (ALL DEFINED AT THE BEGINNING)
# =============================================================================

# [REQUIRED] The domain name pointed to this server (e.g., example.com)
MY_DOMAIN="${MY_DOMAIN:-}"

# [REQUIRED] Contact email used for Let's Encrypt certificate registration
CERT_EMAIL="${CERT_EMAIL:-}"

# [REQUIRED] Name prefix for your proxy nodes (e.g., MasonHK)
NAME_PREFIX="${NAME_PREFIX:-}"

# [OPTIONAL] Command executed after certificate renewal
# FIXED: Now renewals will restart both sing-box and nginx to apply new certs
CERT_RELOAD_CMD="${CERT_RELOAD_CMD:-systemctl restart sing-box nginx}"


# =============================================================================
# 2. VALIDATION AND PRE-REQUISITES
# =============================================================================

# Ensure the script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "[Error] Please run this script as root." >&2
  exit 1
fi

# Validate all required environment variables
if [ -z "${MY_DOMAIN}" ] || [ -z "${CERT_EMAIL}" ] || [ -z "${NAME_PREFIX}" ]; then
  echo "[Error] Missing required environment variables." >&2
  echo "Please set MY_DOMAIN, CERT_EMAIL, and NAME_PREFIX before running this script." >&2
  exit 1
fi

# Define persistent storage path for the certificates
CERT_EXPORT_DIR="/etc/ssl/private/${MY_DOMAIN}"

echo "=================================================="
echo "Target Domain:      ${MY_DOMAIN}"
echo "Contact Email:      ${CERT_EMAIL}"
echo "Node Name Prefix:   ${NAME_PREFIX}"
echo "Cert Export Dir:    ${CERT_EXPORT_DIR}"
echo "Cert Reload Cmd:    ${CERT_RELOAD_CMD}"
echo "=================================================="

# Install basic dependencies via apt (Debian)
echo -e "${GREEN}[Step 1/7]${NC} Updating package list and installing dependencies..."
apt-get update && apt-get install -y curl jq uuid-runtime sudo nginx

# Detect system architecture for sing-box core
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  SINGBOX_ARCH="linux-amd64" ;;
  aarch64) SINGBOX_ARCH="linux-arm64" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac


# =============================================================================
# 3. SING-BOX CORE INSTALLATION
# =============================================================================

# Fetch the latest stable version of sing-box from GitHub API
echo -e "${GREEN}[Step 2/7]${NC} Fetching the latest sing-box version..."
LATEST_VERSION=$(curl -s https://api.github.com/repos/SagerNet/sing-box/releases/latest | jq -r .tag_name)
VERSION_NUM=${LATEST_VERSION#v}
echo "Latest version found: $LATEST_VERSION"

# Download and install sing-box core binary
DOWNLOAD_URL="https://github.com/SagerNet/sing-box/releases/download/${LATEST_VERSION}/sing-box-${VERSION_NUM}-${SINGBOX_ARCH}.tar.gz"
echo "Downloading sing-box from $DOWNLOAD_URL ..."
curl -Lo sing-box.tar.gz "$DOWNLOAD_URL"

tar -zxf sing-box.tar.gz
cd sing-box-${VERSION_NUM}-${SINGBOX_ARCH}
mv sing-box /usr/local/bin/
cd .. && rm -rf sing-box.tar.gz sing-box-${VERSION_NUM}-${SINGBOX_ARCH}

# Create Systemd service unit descriptor for sing-box core
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

# Reload systemd to register the new service unit
systemctl daemon-reload


# =============================================================================
# 4. ACME.SH INSTALLATION AND CERTIFICATE ISSUANCE
# =============================================================================

# Check and install acme.sh
if [ ! -f "${HOME}/.acme.sh/acme.sh" ]; then
  echo -e "${GREEN}[Step 3/7]${NC} acme.sh not detected. Initializing installation..."
  curl https://get.acme.sh | sh -s email="${CERT_EMAIL}"
  export LE_WORKING_DIR="${HOME}/.acme.sh"
else
  echo -e "${GREEN}[Step 3/7]${NC} acme.sh is already installed. Skipping installation."
fi

# Set binary path for acme.sh
ACME_BIN="${HOME}/.acme.sh/acme.sh"

# Set default CA to Let's Encrypt
echo -e "${GREEN}[Step 4/7]${NC} Setting default CA to Let's Encrypt..."
"${ACME_BIN}" --set-default-ca --server letsencrypt

# Issue certificate using Standalone mode
echo -e "${GREEN}[Step 5/7]${NC} Issuing certificate via Standalone mode (Ensure port 80 is open)..."
if ! "${ACME_BIN}" --issue -d "${MY_DOMAIN}" --standalone; then
  echo "[Notice] acme.sh skipped renewal or encountered an expected non-zero state. Proceeding safely..."
fi

# Install certificates into the persistent directory and register the reload command
echo -e "${GREEN}[Step 6/7]${NC} Deploying certificates to destination and binding reload hook..."
sudo mkdir -p "${CERT_EXPORT_DIR}"

# Define absolute paths for certificate files used by sing-box and nginx
CERT_PATH="${CERT_EXPORT_DIR}/fullchain.cer"
KEY_PATH="${CERT_EXPORT_DIR}/private.key"

INSTALL_ARGS=(
  --install-cert
  -d "${MY_DOMAIN}"
  --key-file       "${KEY_PATH}"
  --fullchain-file "${CERT_PATH}"
)

if [ -n "${CERT_RELOAD_CMD}" ]; then
  INSTALL_ARGS+=(--reloadcmd "${CERT_RELOAD_CMD}")
fi

"${ACME_BIN}" "${INSTALL_ARGS[@]}"


# =============================================================================
# 5. CONFIGURATION GENERATION (PORTS, CREDENTIALS, AND STARTUP)
# =============================================================================

echo -e "${GREEN}[Step 7/7]${NC} Generating configurations and bringing up service..."

# Generate 3 unique random ports between 10000 and 20000
while true; do
  P1=$((10000 + RANDOM % 10001))
  P2=$((10000 + RANDOM % 10001))
  P3=$((10000 + RANDOM % 10001))
  if [ "$P1" -ne "$P2" ] && [ "$P2" -ne "$P3" ] && [ "$P1" -ne "$P3" ]; then
    TUIC_PORT=$P1
    VLESS_PORT=$P2
    SUB_PORT=$P3
    break
  fi
done

# Generate random credentials for proxies and subscription security
UUID=$(uuidgen)
PASSWORD=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 16)
SUB_PATH=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 12)

# Define node names using the prefix environment variable
TUIC_NODE_NAME="${NAME_PREFIX}-TUIC"
VLESS_NODE_NAME="${NAME_PREFIX}-VLESS_Vision"

# Create standard configuration and web directory paths
mkdir -p /etc/sing-box
mkdir -p /var/www/subscribe

# Create the Clash/Mihomo Subscription YAML File
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
  - {name: 🤖 AI, type: select, proxies: [🌐 手动选择]}
  - {name: 🟦 Microsoft, type: select, proxies: [DIRECT, 🌐 手动选择]}
  - {name: 🍎 Apple, type: select, proxies: [DIRECT, 🌐 手动选择]}

EOF

# Generate sing-box server JSON configuration file (Pure core proxies)
cat <<EOF > /etc/sing-box/config.json
{
  "log": {
    "level": "info",
    "timestamp": true
  },
  "inbounds": [
    {
      "type": "tuic",
      "tag": "tuic-in",
      "listen": "::",
      "listen_port": ${TUIC_PORT},
      "users": [
        {
          "uuid": "${UUID}",
          "password": "${PASSWORD}"
        }
      ],
      "congestion_control": "bbr",
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
      "tag": "vless-in",
      "listen": "::",
      "listen_port": ${VLESS_PORT},
      "users": [
        {
          "uuid": "${UUID}",
          "flow": "xtls-rprx-vision"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "${MY_DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      },
      "multiplex": {
        "enabled": false
      }
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct"
    }
  ]
}
EOF

# Ensure Nginx conf.d directory exists before writing
mkdir -p /etc/nginx/conf.d

# Configure Nginx as a Secure HTTPS Static Web Server for subscription distribution
# FIXED: Writing directly to conf.d/singbox-sub.conf for non-Debian standard layouts
cat <<EOF > /etc/nginx/conf.d/singbox-sub.conf
server {
    listen ${SUB_PORT} ssl;
    listen [::]:${SUB_PORT} ssl;
    server_name ${MY_DOMAIN};

    ssl_certificate ${CERT_PATH};
    ssl_certificate_key ${KEY_PATH};

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Root location returns 404 to block generic scanner probes
    location / {
        return 404;
    }

    # Only requests matching the secure random sub path will get the yaml file
    location /${SUB_PATH} {
        alias /var/www/subscribe/clash.yaml;
        default_type text/yaml;
        add_header Content-Type "text/yaml; charset=utf-8";
        # Standard filename guidance header matching your domain
        add_header Content-Disposition "attachment; filename=\"${MY_DOMAIN}.yaml\"";
    }
}
EOF

# Enable on startup and trigger final start for both services
systemctl enable sing-box nginx
systemctl restart sing-box nginx


# =============================================================================
# 6. EXPORT DEPLOYMENT DETAILS
# =============================================================================
echo "--------------------------------------------------"
echo " All deployments and certificate tasks completed successfully!"
echo "--------------------------------------------------"
echo "Server Domain:  ${MY_DOMAIN}"
echo "TUIC Node:      ${TUIC_NODE_NAME} (Port: ${TUIC_PORT})"
echo "VLESS Node:     ${VLESS_NODE_NAME} (Port: ${VLESS_PORT})"
echo "--------------------------------------------------"
echo "YOUR SECURE CLASH/MIHOMO SUBSCRIPTION URL (HTTPS):"
echo "https://${MY_DOMAIN}:${SUB_PORT}/${SUB_PATH}"
echo "Writing the link to ~/sub.txt"
echo "https://${MY_DOMAIN}:${SUB_PORT}/${SUB_PATH}" >> ~/sub.txt
echo "--------------------------------------------------"