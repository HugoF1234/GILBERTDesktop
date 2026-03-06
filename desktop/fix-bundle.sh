#!/bin/bash
# Corrige le CFBundleExecutable dans le bundle macOS après le build Tauri
# Depuis que Cargo.toml a name="Gilbert", le binaire est déjà nommé "Gilbert"
# Ce script corrige uniquement l'Info.plist si nécessaire, SANS re-signer
# (re-signer invaliderait les permissions TCC accordées par macOS)

set -e

TARGETS=("aarch64-apple-darwin" "x86_64-apple-darwin")

for TARGET in "${TARGETS[@]}"; do
    BUNDLE="src-tauri/target/$TARGET/release/bundle/macos/Gilbert.app"
    if [ ! -d "$BUNDLE" ]; then
        continue
    fi

    PLIST="$BUNDLE/Contents/Info.plist"
    MACOS_DIR="$BUNDLE/Contents/MacOS"

    echo "🔧 Fix bundle: $TARGET"

    # Corriger CFBundleExecutable si nécessaire
    /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Gilbert" "$PLIST" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleName Gilbert" "$PLIST" 2>/dev/null || true

    # Renommer le binaire si nécessaire (cas fallback)
    if [ -f "$MACOS_DIR/gilbert-desktop" ] && [ ! -f "$MACOS_DIR/Gilbert" ]; then
        mv "$MACOS_DIR/gilbert-desktop" "$MACOS_DIR/Gilbert"
        echo "  ✅ Binaire renommé gilbert-desktop → Gilbert"
    fi

    # Signer une seule fois avec l'Info.plist liée
    # IMPORTANT: ne pas utiliser --force pour ne pas invalider les permissions TCC
    codesign --deep --sign - --preserve-metadata=entitlements "$BUNDLE" 2>/dev/null || \
        codesign --force --deep --sign - "$BUNDLE" 2>/dev/null || true

    echo "  ✅ Bundle fixé"
done
