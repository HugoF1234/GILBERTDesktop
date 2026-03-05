# 📦 Fichiers à mettre dans la Release GitHub

## 🎯 Option 1 : GitHub Actions (Automatique - Recommandé)

Si tu utilises GitHub Actions, les fichiers sont **automatiquement uploadés** quand tu crées une release. Tu n'as rien à faire manuellement !

**Étapes :**
1. Créer la release sur GitHub
2. GitHub Actions build automatiquement
3. Les fichiers sont automatiquement attachés à la release

## 🎯 Option 2 : Upload Manuel

Si tu veux uploader manuellement depuis ton Mac :

### Pour macOS :
```
desktop/src-tauri/target/release/bundle/macos/GilbertDesktop.app
```
**OU** créer un zip :
```bash
cd desktop/src-tauri/target/release/bundle/macos
zip -r GilbertDesktop-v0.1.0-macos.zip GilbertDesktop.app
```
→ Upload : `GilbertDesktop-v0.1.0-macos.zip`

### Pour Windows (si tu as build sur Windows) :
```
desktop/src-tauri/target/release/bundle/msi/GilbertDesktop_0.1.0_x64_en-US.msi
```
→ Upload : `GilbertDesktop_0.1.0_x64_en-US.msi`

### Pour Linux (si tu as build sur Linux) :
```
desktop/src-tauri/target/release/bundle/appimage/gilbert-desktop_0.1.0_amd64.AppImage
```
→ Upload : `gilbert-desktop_0.1.0_amd64.AppImage`

## 📋 Checklist Release GitHub

### Informations de la release :
- **Tag** : `v0.1.0` (ou version suivante)
- **Titre** : `Gilbert Desktop v0.1.0`
- **Description** : Notes de version (ce qui a changé)

### Fichiers à attacher :

**Si GitHub Actions fonctionne** (automatique) :
- ✅ macOS : `.app` ou `.dmg` (automatique)
- ✅ Windows : `.msi` (automatique)
- ✅ Linux : `.AppImage` (automatique)

**Si upload manuel** :
- ✅ macOS : `GilbertDesktop-v0.1.0-macos.zip`
- ⚠️ Windows : Nécessite une machine Windows (ou GitHub Actions)
- ⚠️ Linux : Nécessite une machine Linux (ou GitHub Actions)

## 🚀 Workflow Recommandé

### 1. Push le workflow sur GitHub :
```bash
git add .github/workflows/build-desktop.yml
git commit -m "Add multi-platform build"
git push origin desktop
```

### 2. Créer la release :
- Va sur https://github.com/HugoF1234/GILBERT/releases
- "Draft a new release"
- Tag : `v0.1.0`
- Titre : `Gilbert Desktop v0.1.0`
- Description : 
  ```
  Première version de Gilbert Desktop
  
  Fonctionnalités :
  - Application desktop complète
  - Compatible macOS, Windows, Linux
  - Connexion au backend Gilbert
  ```

### 3. Publier la release :
- Clique sur "Publish release"
- GitHub Actions se déclenche automatiquement
- Attends 5-10 minutes
- Les fichiers sont automatiquement attachés

### 4. Vérifier les fichiers :
- Va dans l'onglet "Actions" de ton repo
- Vérifie que les builds sont terminés
- Les fichiers apparaissent dans la release

## 📝 Exemple de Description de Release

```markdown
# Gilbert Desktop v0.1.0

## 🎉 Première version publique

Application desktop pour Gilbert Assistant.

### 📥 Téléchargements

- **macOS** : [GilbertDesktop.app](lien)
- **Windows** : [GilbertDesktop.msi](lien)
- **Linux** : [GilbertDesktop.AppImage](lien)

### ✨ Fonctionnalités

- Interface complète de Gilbert
- Connexion au backend
- Gestion des réunions
- Partage et collaboration

### 🐛 Problèmes connus

- DMG macOS en cours de correction (l'app .app fonctionne)
```

## 💡 Astuce

Pour l'instant, tu peux :
1. **Uploader seulement la version macOS** (depuis ton Mac)
2. **Activer GitHub Actions** pour avoir Windows et Linux automatiquement
3. **Dire aux utilisateurs Windows/Linux** d'utiliser la version web en attendant


