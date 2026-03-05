# 📥 Comment Partager et Ouvrir l'Application Desktop

## 🚀 Pour toi : Ouvrir l'application depuis le terminal

### Option 1 : Ouvrir directement l'app (recommandé)

```bash
# Depuis n'importe où
open /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app
```

### Option 2 : Depuis le dossier desktop

```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop
open src-tauri/target/release/bundle/macos/GilbertDesktop.app
```

### Option 3 : Créer un alias (pour ouvrir facilement)

Ajoute dans ton `~/.zshrc` :

```bash
alias gilbert-desktop="open /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app"
```

Puis :
```bash
source ~/.zshrc
gilbert-desktop  # Ouvre l'app d'un coup !
```

### Option 4 : Copier dans Applications (pour l'avoir dans le Dock)

```bash
# Copier l'app dans Applications
cp -R /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app /Applications/

# Ouvrir depuis Applications
open /Applications/GilbertDesktop.app
```

## 📤 Pour partager l'application avec d'autres

### Option 1 : Partager le fichier .app directement

**1. Créer un fichier compressé :**
```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos
zip -r GilbertDesktop.zip GilbertDesktop.app
```

**2. Partager le fichier :**
- Upload sur Google Drive / Dropbox / WeTransfer
- Partage le lien avec les utilisateurs
- Ils téléchargent et décompressent

**3. Pour les utilisateurs :**
- Double-clic sur `GilbertDesktop.zip` pour décompresser
- Double-clic sur `GilbertDesktop.app` pour lancer

### Option 2 : GitHub Releases (recommandé pour distribution publique)

**1. Créer une release sur GitHub :**
```bash
# Aller sur GitHub
# https://github.com/HugoF1234/GILBERT/releases
# Cliquer sur "Draft a new release"
```

**2. Préparer le fichier :**
```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos
zip -r GilbertDesktop-v0.1.0-macos.zip GilbertDesktop.app
```

**3. Upload sur GitHub :**
- Tag : `v0.1.0`
- Titre : `Gilbert Desktop v0.1.0`
- Glisse-dépose le fichier `.zip` dans "Attach binaries"
- Publie

**4. Lien de téléchargement :**
```
https://github.com/HugoF1234/GILBERT/releases/download/v0.1.0/GilbertDesktop-v0.1.0-macos.zip
```

### Option 3 : Serveur web (ton VPS)

**1. Uploader sur le serveur :**
```bash
# Compresser
cd /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos
zip -r GilbertDesktop.zip GilbertDesktop.app

# Uploader (remplace par ton user et IP)
scp GilbertDesktop.zip ubuntu@ton-vps:/var/www/html/downloads/
```

**2. Créer une page de téléchargement :**
Sur ton serveur, crée `/var/www/html/download.html` :
```html
<!DOCTYPE html>
<html>
<head>
    <title>Télécharger Gilbert Desktop</title>
    <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        .download-btn { 
            display: inline-block; 
            padding: 15px 30px; 
            background: #06b6d4; 
            color: white; 
            text-decoration: none; 
            border-radius: 10px;
            font-size: 18px;
            margin: 20px;
        }
    </style>
</head>
<body>
    <h1>📥 Télécharger Gilbert Desktop</h1>
    <p>Application desktop pour macOS</p>
    <a href="/downloads/GilbertDesktop.zip" class="download-btn" download>
        Télécharger pour macOS
    </a>
    <p style="margin-top: 30px; color: #666;">
        Version 0.1.0 • Compatible macOS (Apple Silicon)
    </p>
</body>
</html>
```

**3. Lien de téléchargement :**
```
https://gilbert-assistant.ovh/download.html
```

## 🔧 Commandes rapides (copier-coller)

### Ouvrir l'app
```bash
open /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app
```

### Créer un zip pour partager
```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos
zip -r GilbertDesktop-v0.1.0-macos.zip GilbertDesktop.app
```

### Copier dans Applications
```bash
cp -R /Users/hugofouan/Documents/Lexia/Gilbert/GILBERT-desktop/desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app /Applications/
```

## ⚠️ Note importante pour les utilisateurs

Si macOS affiche "GilbertDesktop.app ne peut pas être ouvert car il provient d'un développeur non identifié" :

**Solution :**
1. Clic droit sur `GilbertDesktop.app`
2. Choisir "Ouvrir"
3. Confirmer dans la popup

Ou en terminal :
```bash
xattr -cr GilbertDesktop.app
```

## 📍 Emplacement des fichiers

- **Application :** `desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app`
- **Après build :** Toujours au même endroit
- **Taille :** ~50-100 MB (avec toutes les dépendances)

