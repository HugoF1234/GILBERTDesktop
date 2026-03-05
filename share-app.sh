#!/bin/bash
# Script pour créer un fichier zip de l'application à partager

APP_DIR="/Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos"
APP_NAME="GilbertDesktop.app"
VERSION="0.1.0"
OUTPUT_DIR="$HOME/Desktop"
ZIP_NAME="GilbertDesktop-v${VERSION}-macos.zip"

if [ ! -d "$APP_DIR/$APP_NAME" ]; then
    echo "❌ Application non trouvée à : $APP_DIR/$APP_NAME"
    echo "💡 Assure-toi d'avoir fait 'npm run tauri build' d'abord"
    exit 1
fi

echo "📦 Création du fichier zip..."

cd "$APP_DIR"

# Supprimer le flag de quarantaine local avant de zipper (évite des blocages chez les destinataires)
xattr -dr com.apple.quarantine "$APP_NAME" 2>/dev/null || true

# Utiliser ditto pour préserver les permissions et éviter d'ajouter un nouveau flag de quarantaine
ditto -c -k --keepParent "$APP_NAME" "$OUTPUT_DIR/$ZIP_NAME"

if [ $? -eq 0 ]; then
    echo "✅ Fichier créé avec succès !"
    echo "📍 Emplacement : $OUTPUT_DIR/$ZIP_NAME"
    echo ""
    echo "📤 Tu peux maintenant :"
    echo "   - Uploader sur Google Drive / Dropbox"
    echo "   - Uploader sur GitHub Releases"
    echo "   - Envoyer par email / WeTransfer"
    echo ""
    echo "💡 Pour ouvrir le dossier :"
    echo "   open $OUTPUT_DIR"
    
    # Ouvrir le dossier automatiquement
    open "$OUTPUT_DIR"
else
    echo "❌ Erreur lors de la création du zip"
    exit 1
fi

