#!/bin/bash
# Simule l'import CI pour tester localement (sans GitHub)
# Usage:
#   export APPLE_CERTIFICATE_B64=$(base64 -i cert.p12 | tr -d '\n')
#   export APPLE_CERTIFICATE_PASSWORD="ton_mot_de_passe"
#   export APPLE_INSTALLER_CERTIFICATE_B64=$(base64 -i installer.p12 | tr -d '\n')
#   export APPLE_INSTALLER_CERTIFICATE_PASSWORD="..."  # optionnel si = APPLE_CERTIFICATE_PASSWORD
#   ./scripts/simulate-ci-import.sh

set -e
KEYCHAIN_PATH=$(mktemp -u).keychain
KEYCHAIN_PASSWORD=$(openssl rand -base64 16)
trap "security delete-keychain $KEYCHAIN_PATH 2>/dev/null || true" EXIT

decode_base64() { echo "$1" | tr -d '\n\r' | base64 --decode; }

echo "Création trousseau..."
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "Import Application..."
decode_base64 "$APPLE_CERTIFICATE_B64" > /tmp/cert.p12
security import /tmp/cert.p12 -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/productbuild
rm /tmp/cert.p12

if [ -n "$APPLE_INSTALLER_CERTIFICATE_B64" ]; then
  echo "Import Installer..."
  INSTALLER_PWD="${APPLE_INSTALLER_CERTIFICATE_PASSWORD:-$APPLE_CERTIFICATE_PASSWORD}"
  decode_base64 "$APPLE_INSTALLER_CERTIFICATE_B64" > /tmp/installer.p12
  if security import /tmp/installer.p12 -k "$KEYCHAIN_PATH" -P "$INSTALLER_PWD" -T /usr/bin/codesign -T /usr/bin/productbuild; then
    echo "✅ Installer importé"
  else
    echo "❌ Échec import Installer (vérifie le mot de passe)"
    exit 1
  fi
  rm /tmp/installer.p12
fi

security list-keychain -d user -a "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo ""
echo "Identités trouvées:"
security find-identity -v -p codesigning "$KEYCHAIN_PATH"
echo ""
echo "Si tu vois 2 identités, le PKG devrait fonctionner en CI."
