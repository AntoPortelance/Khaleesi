#!/usr/bin/env bash
# Installs Khaleesi on a Raspberry Pi 5 and turns its Wi-Fi into an access point.
#
# Run from an Ethernet connection, with Internet access: the last step takes over wlan0.
#   sudo ./deploy/setup_pi.sh
#
# Optional environment variables: KHALEESI_SSID, KHALEESI_WIFI_COUNTRY.
set -euo pipefail

SSID="${KHALEESI_SSID:-Khaleesi}"
WIFI_COUNTRY="${KHALEESI_WIFI_COUNTRY:-KR}"
HOST_NAME="khaleesi.lan"
AP_ADDRESS="10.42.0.1"
AP_CONNECTION="khaleesi-ap"
INSTALL_DIR="/opt/khaleesi"
DATA_DIR="/var/lib/khaleesi"
TLS_DIR="/etc/khaleesi/tls"
SERVICE_USER="khaleesi"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script with sudo." >&2
  exit 1
fi

read -rsp "Wi-Fi password for ${SSID} (8 to 63 characters): " wifi_password
echo
if ((${#wifi_password} < 8 || ${#wifi_password} > 63)); then
  echo "The Wi-Fi password must contain 8 to 63 characters." >&2
  exit 1
fi
read -rsp "Confirm the Wi-Fi password: " wifi_password_confirmation
echo
if [[ "${wifi_password}" != "${wifi_password_confirmation}" ]]; then
  echo "The passwords do not match." >&2
  exit 1
fi

echo "==> Installing system packages"
apt-get update
apt-get install -y python3-venv dnsmasq-base openssl

echo "==> Installing the application"
id "${SERVICE_USER}" >/dev/null 2>&1 ||
  useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 750 "${DATA_DIR}"
install -d "${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}/khaleesi"
cp -r "${REPO_DIR}/khaleesi" "${REPO_DIR}/requirements.txt" "${INSTALL_DIR}/"
python3 -m venv "${INSTALL_DIR}/.venv"
"${INSTALL_DIR}/.venv/bin/python" -m pip install -r "${INSTALL_DIR}/requirements.txt"

echo "==> Creating the local certificate authority and server certificate"
install -d -m 755 "${TLS_DIR}"
if [[ ! -f "${TLS_DIR}/khaleesi-ca.crt" ]]; then
  (umask 077 && openssl genrsa -out "${TLS_DIR}/khaleesi-ca.key" 3072)
  openssl req -x509 -new -sha256 -days 3650 \
    -key "${TLS_DIR}/khaleesi-ca.key" \
    -out "${TLS_DIR}/khaleesi-ca.crt" \
    -subj "/CN=Khaleesi Local CA" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,keyCertSign,cRLSign"
fi
if [[ ! -f "${TLS_DIR}/server.crt" ]]; then
  (umask 077 && openssl genrsa -out "${TLS_DIR}/server.key" 2048)
  chown "${SERVICE_USER}:${SERVICE_USER}" "${TLS_DIR}/server.key"
  extensions="$(mktemp)"
  cat >"${extensions}" <<EOF
subjectAltName=DNS:${HOST_NAME},IP:${AP_ADDRESS}
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF
  openssl req -new -sha256 -key "${TLS_DIR}/server.key" -subj "/CN=${HOST_NAME}" |
    openssl x509 -req -sha256 -days 825 \
      -CA "${TLS_DIR}/khaleesi-ca.crt" \
      -CAkey "${TLS_DIR}/khaleesi-ca.key" \
      -CAcreateserial \
      -extfile "${extensions}" \
      -out "${TLS_DIR}/server.crt"
  rm -f "${extensions}"
fi

echo "==> Starting the service"
install -m 644 "${REPO_DIR}/deploy/khaleesi.service" /etc/systemd/system/khaleesi.service
systemctl daemon-reload
systemctl enable khaleesi.service
systemctl restart khaleesi.service

echo "==> Configuring the Wi-Fi access point"
install -d /etc/NetworkManager/dnsmasq-shared.d
echo "address=/${HOST_NAME}/${AP_ADDRESS}" >/etc/NetworkManager/dnsmasq-shared.d/khaleesi.conf
if command -v raspi-config >/dev/null 2>&1; then
  raspi-config nonint do_wifi_country "${WIFI_COUNTRY}"
fi
nmcli connection delete "${AP_CONNECTION}" >/dev/null 2>&1 || true
nmcli connection add type wifi ifname wlan0 con-name "${AP_CONNECTION}" \
  autoconnect yes ssid "${SSID}" \
  802-11-wireless.mode ap 802-11-wireless.band bg 802-11-wireless.channel 6 \
  ipv4.method shared ipv4.addresses "${AP_ADDRESS}/24" ipv6.method disabled \
  wifi-sec.key-mgmt wpa-psk wifi-sec.proto rsn \
  wifi-sec.pairwise ccmp wifi-sec.group ccmp wifi-sec.psk "${wifi_password}"
nmcli connection up "${AP_CONNECTION}"

echo
echo "Done. Wi-Fi network: ${SSID}, address: https://${HOST_NAME}"
echo "Next: create an account and install ${TLS_DIR}/khaleesi-ca.crt on each device."
echo "See deploy/README.md."
