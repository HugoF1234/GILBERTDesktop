# Guide : Synchroniser main → desktop et Distribuer l'app

## 🔄 Partie 1 : Synchroniser main → desktop

### Option 1 : Synchronisation manuelle (simple)

```bash
# 1. Aller sur la branche desktop
git checkout desktop

# 2. Merger les changements de main
git merge main

# 3. Résoudre les conflits si nécessaire
# (généralement pas de conflits car desktop ajoute des fichiers)

# 4. Push sur GitHub
git push origin desktop
```

### Option 2 : Script automatisé

Crée un script `sync-desktop.sh` :

```bash
#!/bin/bash
# Script pour synchroniser main → desktop

echo "🔄 Synchronisation main → desktop..."

# Sauvegarder les changements locaux
git stash

# Aller sur main et récupérer les dernières modifications
git checkout main
git pull origin main

# Aller sur desktop
git checkout desktop

# Merger main dans desktop
git merge main --no-edit

# Résoudre les conflits automatiquement (si possible)
# Les fichiers de desktop ont priorité
git checkout --ours desktop/ 2>/dev/null || true
git checkout --ours frontend/src/App.tsx 2>/dev/null || true

# Ajouter les changements
git add .

# Commit si nécessaire
if ! git diff --staged --quiet; then
    git commit -m "Sync: Merge main into desktop"
fi

# Push
git push origin desktop

# Restaurer les changements locaux
git stash pop

echo "✅ Synchronisation terminée !"
```

**Utilisation :**
```bash
chmod +x sync-desktop.sh
./sync-desktop.sh
```

### Option 3 : GitHub Actions (automatique)

Crée `.github/workflows/sync-desktop.yml` :

```yaml
name: Sync main to desktop

on:
  push:
    branches:
      - main
  workflow_dispatch:  # Permet de déclencher manuellement

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Nécessaire pour les merges
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure Git
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"

      - name: Merge main into desktop
        run: |
          git checkout desktop
          git merge main --no-edit || true
          
          # Si conflit, garder la version desktop
          git checkout --ours desktop/ || true
          git checkout --ours frontend/src/App.tsx || true
          
          git add .
          if ! git diff --staged --quiet; then
            git commit -m "Auto-sync: Merge main into desktop [skip ci]"
            git push origin desktop
          fi
```

### Option 4 : Git Hooks (local)

Crée `.git/hooks/post-merge` :

```bash
#!/bin/bash
# Après chaque merge sur main, proposer de sync vers desktop

current_branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$current_branch" = "main" ]; then
    echo ""
    echo "📢 Voulez-vous synchroniser vers desktop ? (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        git checkout desktop
        git merge main --no-edit
        git push origin desktop
        git checkout main
    fi
fi
```

**Activer le hook :**
```bash
chmod +x .git/hooks/post-merge
```

## 📦 Partie 2 : Distribuer l'application desktop

### Étape 1 : Build de l'application

```bash
cd desktop
npm run tauri build
```

**Fichiers générés :**
- macOS : `desktop/src-tauri/target/release/bundle/dmg/GilbertDesktop_0.1.0_aarch64.dmg`
- macOS : `desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app`

### Étape 2 : Options de distribution

#### Option A : GitHub Releases (recommandé)

1. **Créer une release sur GitHub :**
   - Va sur https://github.com/HugoF1234/GILBERT/releases
   - Clique sur "Draft a new release"
   - Tag : `v0.1.0` (ou version suivante)
   - Titre : `Gilbert Desktop v0.1.0`
   - Description : Notes de version

2. **Uploader le .dmg :**
   - Glisse-dépose le fichier `.dmg` dans "Attach binaries"
   - Publie la release

3. **Lien de téléchargement :**
   ```
   https://github.com/HugoF1234/GILBERT/releases/download/v0.1.0/GilbertDesktop_0.1.0_aarch64.dmg
   ```

#### Option B : Serveur web (ton VPS)

1. **Uploader sur le serveur :**
   ```bash
   # Depuis ton Mac
   scp desktop/src-tauri/target/release/bundle/dmg/GilbertDesktop_0.1.0_aarch64.dmg \
       ubuntu@ton-vps:/var/www/html/downloads/
   ```

2. **Créer une page de téléchargement :**
   Crée `frontend/public/download.html` :
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
           }
       </style>
   </head>
   <body>
       <h1>📥 Télécharger Gilbert Desktop</h1>
       <p>Application desktop pour macOS</p>
       <a href="/downloads/GilbertDesktop_0.1.0_aarch64.dmg" 
          class="download-btn" 
          download>
           Télécharger pour macOS
       </a>
       <p style="margin-top: 30px; color: #666;">
           Version 0.1.0 • Compatible macOS (Apple Silicon)
       </p>
   </body>
   </html>
   ```

3. **Configurer Nginx :**
   Ajoute dans `nginx/nginx-simple.conf` :
   ```nginx
   location /downloads/ {
       alias /var/www/html/downloads/;
       add_header Content-Disposition "attachment";
       add_header Cache-Control "no-cache";
   }
   ```

4. **Lien de téléchargement :**
   ```
   https://gilbert-assistant.ovh/download.html
   ```

#### Option C : CI/CD automatique avec GitHub Actions

Crée `.github/workflows/build-desktop.yml` :

```yaml
name: Build and Release Desktop

on:
  release:
    types: [created]
  workflow_dispatch:

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Rust
        uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      
      - name: Build Tauri
        run: |
          cd desktop
          npm install
          npm run tauri build
      
      - name: Upload DMG
        uses: actions/upload-artifact@v3
        with:
          name: GilbertDesktop-macos
          path: desktop/src-tauri/target/release/bundle/dmg/*.dmg
      
      - name: Upload to Release
        if: github.event_name == 'release'
        uses: softprops/action-gh-release@v1
        with:
          files: desktop/src-tauri/target/release/bundle/dmg/*.dmg
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Utilisation :**
1. Crée une release sur GitHub
2. Le workflow build automatiquement et attache le .dmg

### Étape 3 : Page de téléchargement intégrée

Ajoute un bouton dans ton frontend web :

```typescript
// Dans frontend/src/components/Sidebar.tsx ou Dashboard.tsx
<a 
  href="https://github.com/HugoF1234/GILBERT/releases/latest"
  target="_blank"
  rel="noopener noreferrer"
  style={{ 
    display: 'flex', 
    alignItems: 'center', 
    gap: '8px',
    padding: '10px',
    borderRadius: '8px',
    background: '#f0f0f0',
    textDecoration: 'none',
    color: '#333'
  }}
>
  <span>📥</span>
  <span>Télécharger l'app desktop</span>
</a>
```

## 🔄 Workflow complet recommandé

### Pour développer :

1. **Travailler sur main (web app) :**
   ```bash
   git checkout main
   # Faire tes modifications
   git add .
   git commit -m "Feature: ..."
   git push origin main
   ```

2. **Synchroniser vers desktop :**
   ```bash
   ./sync-desktop.sh
   # Ou manuellement :
   git checkout desktop
   git merge main
   git push origin desktop
   ```

3. **Tester l'app desktop :**
   ```bash
   cd desktop
   npm run tauri dev
   ```

### Pour distribuer :

1. **Build :**
   ```bash
   cd desktop
   npm run tauri build
   ```

2. **Créer une release GitHub :**
   - Tag : `v0.1.1` (incrémenter la version)
   - Upload le `.dmg`
   - Publie

3. **Partager le lien :**
   ```
   https://github.com/HugoF1234/GILBERT/releases/latest
   ```

## 📝 Checklist avant distribution

- [ ] Tester l'app sur une machine propre
- [ ] Vérifier la connexion au backend
- [ ] Tester login/inscription
- [ ] Vérifier les permissions micro (si utilisées)
- [ ] Incrémenter la version dans `desktop/src-tauri/tauri.conf.json`
- [ ] Build l'application
- [ ] Tester le .dmg sur un autre Mac
- [ ] Créer la release GitHub
- [ ] Uploader le .dmg
- [ ] Partager le lien

## 🚀 Commandes rapides

```bash
# Sync main → desktop
git checkout desktop && git merge main && git push origin desktop

# Build
cd desktop && npm run tauri build

# Build + Sync
./sync-desktop.sh && cd desktop && npm run tauri build
```

## 💡 Astuce : Version automatique

Pour incrémenter automatiquement la version, ajoute dans `desktop/package.json` :

```json
{
  "scripts": {
    "version:patch": "cd src-tauri && cargo version --patch",
    "version:minor": "cd src-tauri && cargo version --minor",
    "version:major": "cd src-tauri && cargo version --major"
  }
}
```

Puis :
```bash
npm run version:patch  # 0.1.0 → 0.1.1
npm run tauri build
```

