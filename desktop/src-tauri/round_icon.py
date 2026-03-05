#!/usr/bin/env python3
"""
Script pour arrondir le logo avant de générer les icônes Tauri
"""
from PIL import Image, ImageDraw
import os
import sys

def round_icon(input_path, output_path, radius=180):
    """
    Arrondit les coins d'une image avec un rayon donné
    """
    try:
        # Charger l'image source
        source = Image.open(input_path).convert('RGBA')
        size = source.size[0]  # Supposer que c'est carré
        
        # Créer un masque arrondi
        mask = Image.new('L', (size, size), 0)
        draw = ImageDraw.Draw(mask)
        
        # Dessiner un rectangle arrondi blanc (255) sur fond noir (0)
        draw.rounded_rectangle([(0, 0), (size, size)], radius=radius, fill=255)
        
        # Appliquer le masque à l'image
        output = Image.new('RGBA', source.size, (0, 0, 0, 0))
        output.paste(source, (0, 0))
        output.putalpha(mask)
        
        # Sauvegarder
        output.save(output_path)
        print(f"✅ Logo arrondi créé : {output_path}")
        return True
    except Exception as e:
        print(f"❌ Erreur : {e}")
        return False

if __name__ == "__main__":
    icon_dir = "icons"
    source_icon = os.path.join(icon_dir, "AppIcon.png")
    rounded_icon = os.path.join(icon_dir, "AppIcon-rounded.png")
    
    if not os.path.exists(source_icon):
        print(f"❌ Logo source non trouvé : {source_icon}")
        sys.exit(1)
    
    # Arrondir le logo (rayon = 180 pixels pour un logo 1024x1024)
    if round_icon(source_icon, rounded_icon, radius=180):
        print("🔄 Génération des icônes à partir du logo arrondi...")
        os.system(f"cargo tauri icon {rounded_icon}")
        print("✅ Icônes générées avec coins arrondis !")
    else:
        print("❌ Échec de l'arrondissement du logo")
        sys.exit(1)

