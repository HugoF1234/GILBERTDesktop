#!/bin/bash
# Corrige le CFBundleExecutable dans le bundle macOS après le build Tauri
# Nécessaire car Tauri 1.x dérive CFBundleExecutable du nom du package Cargo ("GilbertDesktop")
# mais le binaire est renommé "Gilbert" (depuis productName)

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

    # Corriger CFBundleExecutable
    /usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName Gilbert" "$PLIST" 2>/dev/null || \
        /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string Gilbert" "$PLIST" 2>/dev/null || true
    /usr/libexec/PlistBuddy -c "Set :CFBundleName Gilbert" "$PLIST" 2>/dev/null || true

    # Renommer le binaire si nécessaire
    if [ -f "$MACOS_DIR/gilbert-desktop" ] && [ ! -f "$MACOS_DIR/Gilbert" ]; then
        mv "$MACOS_DIR/gilbert-desktop" "$MACOS_DIR/Gilbert"
        echo "  ✅ Binaire renommé gilbert-desktop → Gilbert"
    fi

    # Re-signer
    codesign --force --deep --sign - "$BUNDLE" 2>/dev/null || true
    echo "  ✅ Bundle fixé et signé"
done
