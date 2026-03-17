#!/bin/bash
# Signe le bundle macOS après le build Tauri avec un identifier STABLE.
#
# POURQUOI C'EST CRITIQUE :
# La signature adhoc sans --identifier fixe dérive un hash du binaire qui change
# à chaque build → macOS TCC voit une "nouvelle app" → redemande micro + screen recording.
# Avec --identifier "com.gilbert.desktop" stable, TCC mémorise les permissions définitivement.

set -e

ENTITLEMENTS="$(dirname "$0")/src-tauri/entitlements.mac.plist"
BUNDLE_ID="com.gilbert.desktop"

# Trouver le bundle .app — chercher dans les emplacements connus
find_bundle() {
    local target="$1"
    local candidates=(
        # Emplacement standard (build local sans sandbox)
        "$(dirname "$0")/src-tauri/target/$target/release/bundle/macos/Gilbert.app"
        # Emplacement Cursor sandbox cache (macOS Ventura+)
        "$HOME/Library/Caches/cursor-sandbox-cache/cargo-target/$target/release/bundle/macos/Gilbert.app"
    )

    # Chercher aussi dans /var/folders (sandbox Cursor)
    local var_bundle
    var_bundle=$(find /var/folders -name "Gilbert.app" -path "*/$target/release/bundle/macos/Gilbert.app" 2>/dev/null | head -1)
    if [ -n "$var_bundle" ]; then
        candidates+=("$var_bundle")
    fi

    for c in "${candidates[@]}"; do
        if [ -d "$c" ]; then
            echo "$c"
            return 0
        fi
    done
    return 1
}

sign_bundle() {
    local BUNDLE="$1"
    local PLIST="$BUNDLE/Contents/Info.plist"
    local MACOS_DIR="$BUNDLE/Contents/MacOS"

    echo "🔧 Bundle trouvé: $BUNDLE"

    # Corriger les clés Info.plist
    /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Gilbert" "$PLIST" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleName Gilbert" "$PLIST" 2>/dev/null || true

    # Renommer le binaire si nécessaire
    if [ -f "$MACOS_DIR/gilbert-desktop" ] && [ ! -f "$MACOS_DIR/Gilbert" ]; then
        mv "$MACOS_DIR/gilbert-desktop" "$MACOS_DIR/Gilbert"
        echo "  ✅ Binaire renommé gilbert-desktop → Gilbert"
    fi

    # Signer avec identifier stable + entitlements
    if [ -f "$ENTITLEMENTS" ]; then
        codesign --force --deep --sign - \
            --identifier "$BUNDLE_ID" \
            --entitlements "$ENTITLEMENTS" \
            "$BUNDLE" 2>/dev/null && {
            echo "  ✅ Signé: $BUNDLE_ID (avec entitlements)"
            return 0
        }
    fi

    # Fallback sans entitlements
    codesign --force --deep --sign - \
        --identifier "$BUNDLE_ID" \
        "$BUNDLE" 2>/dev/null && {
        echo "  ✅ Signé: $BUNDLE_ID (sans entitlements)"
        return 0
    }

    echo "  ⚠️ codesign échoué — l'app sera non signée"
    return 1
}

TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")
SIGNED=0

for TARGET in "${TARGETS[@]}"; do
    BUNDLE=$(find_bundle "$TARGET") || continue
    if sign_bundle "$BUNDLE"; then
        SIGNED=$((SIGNED+1))

        # Vérifier la signature
        IDENTIFIER=$(codesign -dv "$BUNDLE" 2>&1 | grep "^Identifier" | awk '{print $2}')
        echo "  📋 Identifier final: $IDENTIFIER"
    fi
done

if [ "$SIGNED" -eq 0 ]; then
    echo ""
    echo "⚠️  Aucun bundle signé."
    echo "   Les permissions TCC (micro, screen) seront redemandées à chaque lancement."
    echo "   Conseil : lancez ce script directement depuis votre terminal (hors Cursor) :"
    echo "   cd $(dirname "$0") && bash fix-bundle.sh"
fi
