#!/usr/bin/env bash
set -euo pipefail

# The hosted Ubuntu runner's Azure HTTP mirror stalled for >12 minutes.
# Keep Ubuntu's signed repositories, changing only the transport/mirror.
for source in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources /etc/apt/mirrors/ubuntu*.list; do
  if [ -f "$source" ]; then
    sudo sed -i \
      -e 's|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
      -e 's|http://security.ubuntu.com/ubuntu|https://security.ubuntu.com/ubuntu|g' "$source"
  fi
done
APT_OPTIONS=(-o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30)
sudo apt-get "${APT_OPTIONS[@]}" -o APT::Update::Error-Mode=any update
sudo apt-get "${APT_OPTIONS[@]}" install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
