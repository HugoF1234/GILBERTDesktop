# Guide de distribution - Gilbert Desktop

## 📦 Fichiers générés

Après le build, tu as deux fichiers prêts pour la distribution :

1. **`.app` (Application macOS)** :
   - Chemin : `desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app`
   - Utilisation : Double-clic pour installer dans Applications

2. **`.dmg` (Installeur macOS)** :
   - Chemin : `desktop/src-tauri/target/release/bundle/dmg/GilbertDesktop_0.1.0_aarch64.dmg`
   - Utilisation : Fichier d'installation standard macOS

## 🚀 Options de distribution

### Option 1 : Distribution directe (simple)

1. **Partager le fichier `.dmg`** :
   - Upload le `.dmg` sur un service de stockage (Google Drive, Dropbox, etc.)
   - Partage le lien avec tes utilisateurs
   - Ils téléchargent et installent directement

2. **Héberger sur ton site web** :
   ```bash
   # Créer une page de téléchargement sur gilbert-assistant.ovh
   # Exemple : https://gilbert-assistant.ovh/download
   ```

### Option 2 : GitHub Releases (recommandé)

1. **Créer une release GitHub** :
   ```bash
   # Sur GitHub, va dans ton repo → Releases → Draft a new release
   # Tag : v0.1.0
   # Titre : Gilbert Desktop v0.1.0
   # Description : Première version de l'application desktop
   ```

2. **Uploader le `.dmg`** :
   - Glisse-dépose le fichier `.dmg` dans la section "Attach binaries"
   - Publie la release

3. **Lien de téléchargement** :
   - Les utilisateurs peuvent télécharger depuis : `https://github.com/ton-username/ton-repo/releases`

### Option 3 : Serveur web dédié

1. **Créer un endpoint de téléchargement** :
   ```bash
   # Sur ton VPS, crée un dossier pour les téléchargements
   mkdir -p /var/www/downloads
   
   # Copie le .dmg
   cp desktop/src-tauri/target/release/bundle/dmg/GilbertDesktop_0.1.0_aarch64.dmg /var/www/downloads/
   
   # Configure nginx pour servir les fichiers
   # Ajoute dans nginx :
   location /downloads/ {
       alias /var/www/downloads/;
       add_header Content-Disposition "attachment";
   }
   ```

2. **Lien de téléchargement** :
   - `https://gilbert-assistant.ovh/downloads/GilbertDesktop_0.1.0_aarch64.dmg`

### Option 4 : CI/CD automatique (avancé)

Créer un workflow GitHub Actions qui build et publie automatiquement :

```yaml
# .github/workflows/release.yml
name: Build and Release
on:
  release:
    types: [created]

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions-rs/cargo@v1
      - name: Build Tauri
        run: |
          cd desktop
          npm install
          npm run tauri build
      - name: Upload DMG
        uses: actions/upload-artifact@v3
        with:
          name: GilbertDesktop.dmg
          path: desktop/src-tauri/target/release/bundle/dmg/*.dmg
```

## 📝 Page de téléchargement (exemple HTML)

Crée une page simple sur ton site :

```html
<!DOCTYPE html>
<html>
<head>
    <title>Télécharger Gilbert Desktop</title>
</head>
<body>
    <h1>Télécharger Gilbert Desktop</h1>
    <p>Application desktop pour macOS</p>
    <a href="/downloads/GilbertDesktop_0.1.0_aarch64.dmg" download>
        <button>Télécharger pour macOS</button>
    </a>
    <p>Version 0.1.0 - Compatible macOS (Apple Silicon)</p>
</body>
</html>
```

## 🔐 Signature et notarisation (optionnel, pour distribution publique)

Pour éviter les avertissements macOS Gatekeeper :

1. **Obtenir un certificat Developer ID** :
   - Inscris-toi sur [Apple Developer](https://developer.apple.com) (99$/an)
   - Télécharge le certificat "Developer ID Application"

2. **Signer l'app** :
   ```bash
   codesign --deep --force --verify --verbose --sign "Developer ID Application: Ton Nom" GilbertDesktop.app
   ```

3. **Notariser** :
   ```bash
   xcrun notarytool submit GilbertDesktop.dmg --apple-id ton@email.com --team-id TON_TEAM_ID --password app-specific-password
   ```

## 📊 Statistiques de téléchargement

Pour tracker les téléchargements, ajoute un script de tracking :

```javascript
// Sur la page de téléchargement
fetch('/api/track-download', {
  method: 'POST',
  body: JSON.stringify({ version: '0.1.0', platform: 'macos' })
});
```

## 🔄 Mises à jour automatiques (futur)

Pour activer les mises à jour automatiques avec Tauri :

1. Configure un serveur de mises à jour
2. Active le plugin Tauri updater
3. Les utilisateurs recevront des notifications de mise à jour

## 📍 Emplacement des fichiers build

```
desktop/src-tauri/target/release/bundle/
├── macos/
│   └── GilbertDesktop.app          # Application
└── dmg/
    └── GilbertDesktop_0.1.0_aarch64.dmg  # Installeur
```

## ✅ Checklist avant distribution

- [ ] Tester l'app sur une machine propre (sans dev tools)
- [ ] Vérifier que le backend est accessible depuis l'app
- [ ] Tester le login/inscription
- [ ] Vérifier les permissions micro (si utilisées)
- [ ] Uploader le `.dmg` sur ton serveur/GitHub
- [ ] Créer une page de téléchargement
- [ ] Tester le téléchargement depuis un autre Mac

