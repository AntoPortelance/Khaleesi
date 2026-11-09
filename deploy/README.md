# Deploying on a Raspberry Pi 5

These steps make the Pi a self-contained system: it broadcasts its own Wi-Fi network, serves the interface at `https://khaleesi.lan`, and stores its data locally.

**Status:** this procedure has not been run on a Raspberry Pi yet. Report any step that needs adjusting.

## Requirements

- Raspberry Pi 5 running Raspberry Pi OS Bookworm or newer, which uses NetworkManager.
- An **Ethernet connection with Internet access** during installation. The final step takes over the Wi-Fi interface, and packages cannot be downloaded through the access point.
- The RTC battery is recommended. The network has no time server, so without it the clock is wrong after a power cut and timestamps are unreliable.

## Install

From a copy of this repository on the Pi:

```sh
chmod +x deploy/setup_pi.sh
sudo ./deploy/setup_pi.sh
```

The script asks for the Wi-Fi password. To change the defaults, pass `KHALEESI_SSID` (`Khaleesi`) or `KHALEESI_WIFI_COUNTRY` (`KR`):

```sh
sudo KHALEESI_SSID=Bench-1 KHALEESI_WIFI_COUNTRY=FR ./deploy/setup_pi.sh
```

Running it again updates the application and recreates the access point. Existing certificates and data are kept.

## Create an account

Accounts are created on the Pi. Repeat for each operator:

```sh
cd /opt/khaleesi
sudo -u khaleesi KHALEESI_DATA_DIR=/var/lib/khaleesi .venv/bin/python -m khaleesi.create_user alice
```

## Connect a device

1. Copy `/etc/khaleesi/tls/khaleesi-ca.crt` to the device and install it as a trusted certificate authority. This is needed once per device; without it, the browser shows a security warning.
2. Join the Khaleesi Wi-Fi network. Turn off mobile data on a phone if it drops the network for lacking Internet access.
3. Open `https://khaleesi.lan` and include `https://`, because nothing listens on plain HTTP. If the name does not resolve, use `https://10.42.0.1`.

Keep `/etc/khaleesi/tls/khaleesi-ca.key` on the Pi: anyone holding it can impersonate the server to devices that trust this authority.

## Check the service

```sh
systemctl status khaleesi
journalctl -u khaleesi -f
nmcli connection show --active
```

## Safety

Khaleesi is not a safety system. A software or Wi-Fi failure gives no guarantee about the position of any equipment: an independent emergency stop is required on a real test stand.
