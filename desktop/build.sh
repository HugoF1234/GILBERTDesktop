#!/bin/bash
# ============================================================
# build.sh — Script de build complet Gilbert Desktop (macOS)
# ============================================================
# Usage (depuis TON TERMINAL, pas Cursor) :
#   cd /Users/hugofouan/Documents/Lexia/Gilbert/DESK/GILBERT-desktop/desktop
#   bash build.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Documents/Lexia/Gilbert/DESK"
BUNDLE_ID="com.gilbert.desktop"
APP_NAME="Gilbert"
ENTITLEMENTS="$SCRIPT_DIR/src-tauri/entitlements.mac.plist"
TARGET="aarch64-apple-darwin"
INSTALL_PATH="/Applications/$APP_NAME.app"

# Certificat Developer ID — CDHash stable entre les builds → TCC persiste définitivement
SIGNING_IDENTITY="E5C8A6E1C302BDA37F390078CEB4304C7A2426F0"

echo "=================================================="
echo "  Gilbert Desktop — Build macOS ARM"
echo "=================================================="
echo ""

# ── STEP 0 : Nettoyage TOTAL ────────────────────────────────────────────────
echo "🧹 Step 0 — Nettoyage total (app, caches, quarantaine)..."

# 0a. Tuer Gilbert s'il tourne (sinon les fichiers sont verrouillés)
pkill -9 -x "Gilbert" 2>/dev/null || true
sleep 1

# 0b. Supprimer l'ancienne app installée
if [ -d "$INSTALL_PATH" ]; then
    echo "   Suppression $INSTALL_PATH..."
    rm -rf "$INSTALL_PATH"
fi

# 0c. Vider TOUS les caches WebKit / WKWebView
# macOS peut stocker le cache sous plusieurs identifiants selon le bundle name historique
for WEBKIT_DIR in \
    "$HOME/Library/WebKit/GilbertDesktop" \
    "$HOME/Library/WebKit/com.gilbert.desktop" \
    "$HOME/Library/WebKit/com.gilbert.app" \
    "$HOME/Library/Caches/GilbertDesktop" \
    "$HOME/Library/Caches/com.gilbert.desktop" \
    "$HOME/Library/Caches/com.gilbert.app" \
    "$HOME/Library/Application Support/GilbertDesktop" \
    "$HOME/Library/Application Support/com.gilbert.desktop/WebKit" \
    "$HOME/Library/Application Support/Gilbert/WebKit" \
    "$HOME/Library/Saved Application State/com.gilbert.desktop.savedState" \
    "$HOME/Library/Saved Application State/GilbertDesktop.savedState"; do
    if [ -d "$WEBKIT_DIR" ]; then
        echo "   Suppression cache: $(basename "$WEBKIT_DIR")"
        rm -rf "$WEBKIT_DIR"
    fi
done

# 0d. Supprimer UNIQUEMENT les artefacts Rust liés au code Gilbert (pas les dépendances)
# On conserve target/release/build pour que le build.rs Swift ne soit pas cassé
# On supprime seulement les binaires Gilbert compilés pour forcer une recompilation
rm -rf "$SCRIPT_DIR/src-tauri/target/$TARGET/release/gilbert_desktop" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/src-tauri/target/$TARGET/release/deps/gilbert*" 2>/dev/null || true
rm -rf "$SCRIPT_DIR/src-tauri/target/$TARGET/release/libgilbert*" 2>/dev/null || true
# NE PAS supprimer target/release/build — il contient libsck_bridge.a (Swift compilé)
# Cargo re-exécutera build.rs uniquement si ScreenCaptureAudio.swift a changé

# 0e. Vider le dist frontend pour éviter les fichiers JS orphelins
rm -rf "$SCRIPT_DIR/../frontend/dist"

echo "✅ Nettoyage total effectué"
echo ""

# ── STEP 1 : Build Tauri ────────────────────────────────────────────────────
echo "📦 Step 1/4 — Build Tauri (frontend + Rust + Swift)..."
cd "$SCRIPT_DIR"

npx tauri build --target aarch64-apple-darwin
echo "✅ Build terminé"
echo ""

# ── STEP 2 : Signature Developer ID ────────────────────────────────────────
echo "🔍 Step 2/4 — Signature Developer ID..."
BUNDLE="$SCRIPT_DIR/src-tauri/target/$TARGET/release/bundle/macos/Gilbert.app"

if [ ! -d "$BUNDLE" ]; then
    echo "❌ Bundle introuvable: $BUNDLE"
    echo "   Lance build.sh depuis ton terminal (pas Cursor)."
    exit 1
fi

echo "   Bundle: $BUNDLE"

# Nettoyer les fichiers AppleDouble et xattrs iCloud FileProvider
find "$BUNDLE" -name "._*" -delete 2>/dev/null || true
find "$BUNDLE" -name ".DS_Store" -delete 2>/dev/null || true
xattr -rl "$BUNDLE" 2>/dev/null \
    | grep "^/" | sed 's/: .*$//' | sort -u \
    | while read -r f; do xattr -c "$f" 2>/dev/null || true; done

# Corriger Info.plist — s'assurer que le nom est "Gilbert" (pas GilbertDesktop)
PLIST="$BUNDLE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $APP_NAME"        "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $APP_NAME" "$PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string $APP_NAME" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable $APP_NAME"  "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST" 2>/dev/null || true
xattr -c "$PLIST" 2>/dev/null || true

echo "   CFBundleName:        $(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST" 2>/dev/null)"
echo "   CFBundleDisplayName: $(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST" 2>/dev/null)"
echo "   CFBundleIdentifier:  $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null)"

# Signer avec Developer ID Application
# --no-strict : ignore les xattrs iCloud FileProvider (com.apple.provenance) non supprimables
if [ -f "$ENTITLEMENTS" ]; then
    codesign --force --deep \
        --sign "$SIGNING_IDENTITY" \
        --options runtime \
        --identifier "$BUNDLE_ID" \
        --entitlements "$ENTITLEMENTS" \
        --no-strict \
        "$BUNDLE"
else
    codesign --force --deep \
        --sign "$SIGNING_IDENTITY" \
        --options runtime \
        --identifier "$BUNDLE_ID" \
        --no-strict \
        "$BUNDLE"
fi

SIGNED_ID=$(codesign -dv "$BUNDLE" 2>&1 | grep "Identifier=" | sed 's/.*Identifier=//')
if [ -z "$SIGNED_ID" ]; then
    # Fallback : codesign -d (sans v) sur certains macOS
    SIGNED_ID=$(codesign -d --verbose=2 "$BUNDLE" 2>&1 | grep "^Identifier" | awk '{print $NF}')
fi
echo "✅ Signé — Identifier: ${SIGNED_ID:-inconnu (vérifier manuellement)}"
echo ""

# ── STEP 3 : Installation dans /Applications ───────────────────────────────
echo "📲 Step 3/4 — Installation dans /Applications..."

# Copier le bundle fraîchement signé
cp -R "$BUNDLE" "$INSTALL_PATH"

# Supprimer l'attribut quarantaine ajouté par cp
xattr -dr com.apple.quarantine "$INSTALL_PATH" 2>/dev/null || true
xattr -cr "$INSTALL_PATH" 2>/dev/null || true

# Re-signer dans /Applications (codesign est lié au path réel)
codesign --force --deep \
    --sign "$SIGNING_IDENTITY" \
    --options runtime \
    --identifier "$BUNDLE_ID" \
    --no-strict \
    --entitlements "$ENTITLEMENTS" \
    "$INSTALL_PATH" 2>/dev/null || true

# Vider encore le cache WebKit après l'install (cas où macOS l'a recréé)
for WEBKIT_DIR in \
    "$HOME/Library/WebKit/com.gilbert.desktop" \
    "$HOME/Library/Caches/com.gilbert.desktop" \
    "$HOME/Library/Application Support/com.gilbert.desktop/WebKit"; do
    rm -rf "$WEBKIT_DIR" 2>/dev/null || true
done

echo "✅ Installé dans $INSTALL_PATH"
echo ""

# ── Nettoyage TCC : supprimer SEULEMENT l'ancienne entrée "GilbertDesktop" ──
# L'entrée com.gilbert.desktop est conservée (Developer ID stable → TCC persiste)
echo "🧹 Nettoyage TCC (anciens bundles)..."
tccutil reset Microphone    com.gilbertdesktop.app  2>/dev/null || true
tccutil reset ScreenCapture com.gilbertdesktop.app  2>/dev/null || true
tccutil reset Microphone    GilbertDesktop           2>/dev/null || true
tccutil reset ScreenCapture GilbertDesktop           2>/dev/null || true

# Forcer une nouvelle demande TCC pour com.gilbert.desktop si l'entrée est absente ou refusée
# (cas où seul "GilbertDesktop" était autorisé dans les Réglages Système)
# Cela réinitialise uniquement ScreenCapture pour com.gilbert.desktop.
# Au prochain clic "Enregistrer", macOS demandera l'autorisation → accorder une fois.
CURRENT_SCK=$(sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
    "SELECT allowed FROM access WHERE service='kTCCServiceScreenCapture' AND client='$BUNDLE_ID';" 2>/dev/null || echo "absent")

if [ "$CURRENT_SCK" = "0" ] || [ "$CURRENT_SCK" = "absent" ]; then
    echo "   ⚠️  com.gilbert.desktop n'a PAS la permission ScreenCapture (actuel: $CURRENT_SCK)"
    echo "   → Réinitialisation pour déclencher une nouvelle demande au prochain lancement"
    tccutil reset ScreenCapture com.gilbert.desktop 2>/dev/null || true
    tccutil reset Microphone    com.gilbert.desktop 2>/dev/null || true
    echo "   ✅ TCC réinitialisé → Gilbert demandera l'autorisation au 1er enregistrement"
else
    echo "   ✅ com.gilbert.desktop a déjà la permission ScreenCapture (allowed=$CURRENT_SCK)"
fi

echo ""

# ── STEP 4 : Créer le DMG ───────────────────────────────────────────────────
echo "💿 Step 4/4 — Création du DMG..."
mkdir -p "$DEST"

VERSION=$(node -e "const c=require('$SCRIPT_DIR/src-tauri/tauri.conf.json'); console.log(c.package.version)" 2>/dev/null || echo "0.2.0")
DMG_NAME="Gilbert_${VERSION}_aarch64.dmg"
rm -f "$DEST/${DMG_NAME}"

hdiutil detach /Volumes/Gilbert -force 2>/dev/null || true

hdiutil create \
    -format UDZO \
    -srcfolder "$BUNDLE" \
    -volname "Gilbert" \
    -o "$DEST/${DMG_NAME}"

echo ""
echo "=================================================="
echo "✅ Build terminé !"
echo "   App: $INSTALL_PATH"
echo "   DMG: $DEST/${DMG_NAME}"
echo "   Bundle ID: $BUNDLE_ID"
echo ""
echo "   Lance Gilbert depuis /Applications/Gilbert.app"
echo ""
echo "   Pour créer une release GitHub :"
echo "   git tag v${VERSION} && git push origin v${VERSION}"
echo "=================================================="
