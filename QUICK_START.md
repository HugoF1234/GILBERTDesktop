# 🚀 Guide Rapide : Sync et Distribution

## ⚡ Commandes essentielles

### Synchroniser main → desktop

**Option 1 : Script automatique (recommandé)**
```bash
./sync-desktop.sh
```

**Option 2 : Manuellement**
```bash
git checkout desktop
git merge main
git push origin desktop
```

### Build et distribuer

**1. Build l'application :**
```bash
cd desktop
npm run tauri build
```

**2. Créer une release GitHub :**
- Va sur https://github.com/HugoF1234/GILBERT/releases
- "Draft a new release"
- Tag : `v0.1.0`
- Upload le fichier : `desktop/src-tauri/target/release/bundle/dmg/GilbertDesktop_0.1.0_aarch64.dmg`
- Publie

**3. Partager le lien :**
```
https://github.com/HugoF1234/GILBERT/releases/latest
```

## 📋 Workflow quotidien

```bash
# 1. Travailler sur main
git checkout main
# ... faire tes modifications ...
git add .
git commit -m "Feature: ..."
git push origin main

# 2. Synchroniser vers desktop
./sync-desktop.sh

# 3. Tester l'app desktop (optionnel)
cd desktop
npm run tauri dev
```

## 🔄 Automatisation GitHub Actions

Les workflows sont déjà configurés :

1. **Auto-sync** : Quand tu push sur `main`, ça sync automatiquement vers `desktop`
2. **Auto-build** : Quand tu crées une release, ça build automatiquement le .dmg

Pour activer, il suffit de push ces fichiers sur GitHub.

## 📦 Distribution rapide

```bash
# Build
cd desktop && npm run tauri build

# Le .dmg est ici :
open desktop/src-tauri/target/release/bundle/dmg/
```

## ❓ Besoin d'aide ?

Voir le guide complet : `SYNC_AND_DISTRIBUTE.md`

