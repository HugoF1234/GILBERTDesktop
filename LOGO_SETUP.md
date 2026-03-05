# 📱 Configuration du Logo de l'Application

## 📍 Où placer le logo

Place ton fichier `AppIcon.png` dans le dossier suivant :

```
desktop/src-tauri/icons/
```

**Chemin complet :**
```
/Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/icons/AppIcon.png
```

## 🎨 Génération des icônes requises

Tauri nécessite plusieurs tailles d'icônes pour différentes plateformes. Tu as deux options :

### Option 1 : Utiliser Tauri CLI (recommandé)

1. **Installer Tauri CLI globalement** (si pas déjà fait) :
   ```bash
   cargo install tauri-cli
   ```

2. **Placer ton AppIcon.png** dans `desktop/src-tauri/icons/`

3. **Générer automatiquement toutes les icônes** :
   ```bash
   cd desktop/src-tauri
   tauri icon icons/AppIcon.png
   ```

   Cette commande va générer automatiquement :
   - `32x32.png`
   - `128x128.png`
   - `128x128@2x.png`
   - `icon.icns` (macOS)
   - `icon.ico` (Windows)

### Option 2 : Génération manuelle

Si tu préfères créer les icônes manuellement :

1. **Créer le dossier** :
   ```bash
   mkdir -p desktop/src-tauri/icons
   ```

2. **Placer AppIcon.png** dans ce dossier

3. **Créer les différentes tailles** :
   - `32x32.png` - 32x32 pixels
   - `128x128.png` - 128x128 pixels
   - `128x128@2x.png` - 256x256 pixels (pour Retina)
   - `icon.icns` - Format macOS (peut être créé avec `iconutil` sur macOS)
   - `icon.ico` - Format Windows

4. **Pour créer icon.icns sur macOS** :
   ```bash
   # Créer un dossier temporaire avec les images
   mkdir icon.iconset
   cp AppIcon.png icon.iconset/icon_16x16.png
   cp AppIcon.png icon.iconset/icon_32x32.png
   cp AppIcon.png icon.iconset/icon_128x128.png
   cp AppIcon.png icon.iconset/icon_256x256.png
   cp AppIcon.png icon.iconset/icon_512x512.png
   cp AppIcon.png icon.iconset/icon_1024x1024.png
   
   # Générer l'icns
   iconutil -c icns icon.iconset -o icon.icns
   rm -rf icon.iconset
   ```

## ✅ Vérification

Après avoir placé les icônes, vérifie que le fichier `tauri.conf.json` contient bien :

```json
"icon": [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico"
]
```

## 🚀 Test

Pour voir le logo dans l'application :

```bash
cd desktop
npm run tauri dev
```

Le logo devrait apparaître :
- Dans la barre de menu macOS
- Dans le dock macOS
- Dans la fenêtre de l'application

## 📝 Notes

- Le logo doit être au format PNG avec fond transparent (recommandé)
- La taille minimale recommandée pour AppIcon.png est 1024x1024 pixels
- Les icônes seront automatiquement redimensionnées par Tauri si nécessaire
- Après modification des icônes, il faut rebuilder l'application pour voir les changements

