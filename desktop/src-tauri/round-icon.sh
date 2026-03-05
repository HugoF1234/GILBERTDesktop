#!/bin/bash
# Script pour arrondir le logo avant de générer les icônes

ICON_DIR="icons"
SOURCE_ICON="$ICON_DIR/AppIcon.png"
ROUNDED_ICON="$ICON_DIR/AppIcon-rounded.png"

# Vérifier que ImageMagick ou sips est installé
if command -v convert &> /dev/null; then
    # Utiliser ImageMagick pour arrondir
    echo "🔄 Arrondissement du logo avec ImageMagick..."
    convert "$SOURCE_ICON" \
        \( +clone -alpha extract -draw 'fill black polygon 0,0 0,100 100,100 100,0 fill white circle 100,100 100,0' \
        \( +clone -flip \) -compose Multiply -composite \
        \( +clone -flop \) -compose Multiply -composite \
        \) -alpha off -compose CopyOpacity -composite \
        "$ROUNDED_ICON"
elif command -v sips &> /dev/null; then
    # Utiliser sips (macOS) - créer un masque arrondi
    echo "🔄 Arrondissement du logo avec sips..."
    
    # Créer un masque arrondi avec Python (si disponible)
    python3 << 'PYTHON_SCRIPT'
from PIL import Image, ImageDraw
import sys

size = 1024
radius = 180  # Rayon des coins arrondis (ajuste selon tes préférences)

# Créer un masque arrondi
mask = Image.new('L', (size, size), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)

# Sauvegarder le masque
mask.save('icons/mask.png')
PYTHON_SCRIPT

    if [ -f "icons/mask.png" ]; then
        # Appliquer le masque avec sips (nécessite ImageMagick ou Python PIL)
        python3 << 'PYTHON_SCRIPT'
from PIL import Image
import sys

# Charger l'image source et le masque
source = Image.open('icons/AppIcon.png').convert('RGBA')
mask = Image.open('icons/mask.png').convert('L')

# Appliquer le masque
output = Image.new('RGBA', source.size)
output.paste(source, (0, 0))
output.putalpha(mask)

# Sauvegarder
output.save('icons/AppIcon-rounded.png')
print("✅ Logo arrondi créé !")
PYTHON_SCRIPT
        rm icons/mask.png
    else
        echo "⚠️  Python PIL non disponible, utilisation de la méthode simple..."
        cp "$SOURCE_ICON" "$ROUNDED_ICON"
    fi
else
    echo "⚠️  Aucun outil d'image trouvé. Installation de Pillow..."
    pip3 install Pillow --quiet 2>/dev/null || echo "❌ Impossible d'installer Pillow"
    
    python3 << 'PYTHON_SCRIPT'
from PIL import Image, ImageDraw
import os

size = 1024
radius = 180  # Rayon des coins arrondis

try:
    # Charger l'image source
    source = Image.open('icons/AppIcon.png').convert('RGBA')
    
    # Créer un masque arrondi
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
    
    # Appliquer le masque
    output = Image.new('RGBA', source.size)
    output.paste(source, (0, 0))
    output.putalpha(mask)
    
    # Sauvegarder
    output.save('icons/AppIcon-rounded.png')
    print("✅ Logo arrondi créé avec Python PIL !")
except Exception as e:
    print(f"❌ Erreur: {e}")
    print("💡 Copie du logo original sans arrondissement")
    import shutil
    shutil.copy('icons/AppIcon.png', 'icons/AppIcon-rounded.png')
PYTHON_SCRIPT
fi

if [ -f "$ROUNDED_ICON" ]; then
    echo "✅ Logo arrondi créé : $ROUNDED_ICON"
    echo "🔄 Génération des icônes à partir du logo arrondi..."
    cargo tauri icon "$ROUNDED_ICON"
    echo "✅ Icônes générées avec coins arrondis !"
else
    echo "❌ Erreur lors de la création du logo arrondi"
    exit 1
fi

