#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status, and catch undefined variables
set -euo pipefail

# =============================================================================
# 1. ENVIRONMENT VARIABLES CONFIGURATION (ALL DEFINED AT THE BEGINNING)
# =============================================================================

# [REQUIRED] The domain name pointed to this server (e.g., example.com)
MY_DOMAIN="${MY_DOMAIN:-}"

# [REQUIRED] Contact email used for Let's Encrypt certificate registration
CERT_EMAIL="${CERT_EMAIL:-}"

# [REQUIRED] Name prefix for your proxy nodes (e.g., MasonHK)
NAME_PREFIX="${NAME_PREFIX:-}"

# [REQUIRED] Fallback destination for VLESS-Vision (e.g., www.microsoft.com:443)
FALLBACK_DEST="${FALLBACK_DEST:-}"

# [OPTIONAL] Command executed after certificate renewal
CERT_RELOAD_CMD="${CERT_RELOAD_CMD:-systemctl restart sing-box}"


# =============================================================================
# 2. VALIDATION AND PRE-REQUISITES
# =============================================================================

# Ensure the script is run as root
if [ "$EUID" -ne 0 ]; then
  echo "[Error] Please run this script as root." >&2
  exit 1
fi

# Validate all required environment variables
if [ -z "${MY_DOMAIN}" ] || [ -z "${CERT_EMAIL}" ] || [ -z "${NAME_PREFIX}" ] || [ -z "${FALLBACK_DEST}" ]; then
  echo "[Error] Missing required environment variables." >&2
  echo "Please set MY_DOMAIN, CERT_EMAIL, NAME_PREFIX, and FALLBACK_DEST before running this script." >&2
  exit 1
fi

# Define persistent storage path for the certificates
CERT_EXPORT_DIR="/etc/ssl/private/${MY_DOMAIN}"

echo "=================================================="
echo "Target Domain:      ${MY_DOMAIN}"
echo "Contact Email:      ${CERT_EMAIL}"
echo "Node Name Prefix:   ${NAME_PREFIX}"
echo "VLESS Fallback:     ${FALLBACK_DEST}"
echo "Cert Export Dir:    ${CERT_EXPORT_DIR}"
echo "Cert Reload Cmd:    ${CERT_RELOAD_CMD}"
echo "=================================================="

# Install basic dependencies via apt (Debian)
echo "[Step 1/7] Updating package list and installing dependencies..."
apt-get update && apt-get install -y curl jq uuid-runtime sudo

# Detect system architecture for sing-box core
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  SINGBOX_ARCH="linux-amd64" ;;
  aarch64) SINGBOX_ARCH="linux-arm64" ;;
  *)       echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac


# =============================================================================
# 3. SING-BOX CORE INSTALLATION (MOVED UPFRONT TO PREVENT SYSTEMD UNIT ERRORS)
# =============================================================================

# Fetch the latest stable version of sing-box from GitHub API
echo "[Step 2/7] Fetching the latest sing-box version..."
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
  echo "[Step 3/7] acme.sh not detected. Initializing installation..."
  curl https://get.acme.sh | sh -s email="${CERT_EMAIL}"
  export LE_WORKING_DIR="${HOME}/.acme.sh"
else
  echo "[Step 3/7] acme.sh is already installed. Skipping installation."
fi

# Set binary path for acme.sh
ACME_BIN="${HOME}/.acme.sh/acme.sh"

# Set default CA to Let's Encrypt
echo "[Step 4/7] Setting default CA to Let's Encrypt..."
"${ACME_BIN}" --set-default-ca --server letsencrypt

# Issue certificate using Standalone mode
echo "[Step 5/7] Issuing certificate via Standalone mode (Ensure port 80 is open)..."
if ! "${ACME_BIN}" --issue -d "${MY_DOMAIN}" --standalone; then
  echo "[Notice] acme.sh skipped renewal or encountered an expected non-zero state. Proceeding safely..."
fi

# Install certificates into the persistent directory and register the reload command
echo "[Step 6/7] Deploying certificates to destination and binding reload hook..."
sudo mkdir -p "${CERT_EXPORT_DIR}"

# Define absolute paths for certificate files used by sing-box
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

# This will succeed now because the systemd unit file already exists
"${ACME_BIN}" "${INSTALL_ARGS[@]}"


# =============================================================================
# 5. CONFIGURATION GENERATION (PORTS, CREDENTIALS, AND STARTUP)
# =============================================================================

echo "[Step 7/7] Generating configurations and bringing up service..."

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
  - name: 🚀 Proxy
    type: select
    proxies:
      - "${TUIC_NODE_NAME}"
      - "${VLESS_NODE_NAME}"
EOF

# Generate sing-box server JSON configuration file
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
        "key_path": "${KEY_PATH}"
      }
    },
    {
      "type": "vless",
      "tag": "vless-in",
      "listen": "::",
      "listen_port": ${VLESS_PORT},
      "users": [
        {
          "uuid": "${UUID}"
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "${MY_DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}",
        "flow": "xtls-rprx-vision"
      },
      "multiplex": {
        "enabled": false
      },
      "tls_passthrough": false,
      "fallbacks": [
        {
          "dest": "${FALLBACK_DEST}"
        }
      ]
    },
    {
      "type": "http",
      "tag": "sub-in",
      "listen": "::",
      "listen_port": ${SUB_PORT},
      "tls": {
        "enabled": true,
        "server_name": "${MY_DOMAIN}",
        "certificate_path": "${CERT_PATH}",
        "key_path": "${KEY_PATH}"
      },
      "users": [],
      "response_by_path": {
        "/${SUB_PATH}": {
          "status_code": 200,
          "content_type": "text/yaml; charset=utf-8",
          "body": $(jq -Rs . /var/www/subscribe/clash.yaml)
        }
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

# Enable on startup and trigger the actual final start
systemctl enable sing-box
systemctl restart sing-box


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
echo "YOUR CLASH/MIHOMO SUBSCRIPTION URL:"
echo "https://${MY_DOMAIN}:${SUB_PORT}/${SUB_PATH}"
echo "--------------------------------------------------"