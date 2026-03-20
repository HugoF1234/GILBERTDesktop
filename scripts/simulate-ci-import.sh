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
trap "security delete-keychain $KEYCHAIN_PATH 2>/dev/null; security list-keychain -d user -s $ORIGINAL_KEYCHAINS 2>/dev/null || true" EXIT

# Sauvegarder la liste des keychains (pour les certificats intermédiaires Apple)
ORIGINAL_KEYCHAINS=$(security list-keychain -d user 2>/dev/null | tr '\n' ' ')
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

# Notre keychain en premier + keychains système (WWDR, etc.) pour valider la chaîne
security list-keychain -d user -s "$KEYCHAIN_PATH" $ORIGINAL_KEYCHAINS
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH" 2>/dev/null

echo ""
echo "Identités (toutes, y compris non valides):"
security find-identity -p codesigning 2>/dev/null || true
echo ""
echo "Identités valides (policy codesigning):"
security find-identity -v -p codesigning 2>/dev/null || true
echo ""
echo "Test productbuild (si 2 identités ci-dessus, le PKG devrait fonctionner en CI):"
if [ -d "desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos" ]; then
  APP="desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Gilbert.app"
  if [ -d "$APP" ]; then
    INSTALLER_IDENTITY="Developer ID Installer: Mathis Escriva (2U6L38DLSW)"
    if productbuild --component "$APP" /Applications /tmp/test-gilbert.pkg --sign "$INSTALLER_IDENTITY" 2>/dev/null; then
      echo "✅ productbuild OK — le PKG fonctionnera en CI"
      rm -f /tmp/test-gilbert.pkg
    else
      echo "⚠️ productbuild a échoué (certificat Installer non trouvé)"
    fi
  fi
else
  echo "(Pas d'app buildée — lance le build Tauri puis relance ce script)"
fi
