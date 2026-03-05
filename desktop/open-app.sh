#!/bin/bash
# Script pour ouvrir l'application Gilbert Desktop

APP_PATH="/Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Application non trouvée à : $APP_PATH"
    echo "💡 Assure-toi d'avoir fait 'npm run tauri build' d'abord"
    exit 1
fi

echo "🚀 Ouverture de Gilbert Desktop..."
open "$APP_PATH"

