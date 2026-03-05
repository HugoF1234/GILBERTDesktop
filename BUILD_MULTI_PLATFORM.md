# 🌍 Build pour Windows et Linux

## ⚠️ Limitation actuelle

**Tu es sur macOS**, donc tu ne peux pas build directement pour Windows ou Linux depuis ton Mac. Voici tes options :

## 🎯 Option 1 : GitHub Actions (Recommandé - Automatique)

J'ai déjà créé un workflow GitHub Actions qui build automatiquement pour toutes les plateformes quand tu crées une release.

### Comment ça marche :

1. **Push le workflow sur GitHub** (déjà fait) :
   ```bash
   git add .github/workflows/build-desktop.yml
   git commit -m "Add multi-platform build"
   git push origin desktop
   ```

2. **Créer une release sur GitHub** :
   - Va sur https://github.com/HugoF1234/GILBERT/releases
   - Clique sur "Draft a new release"
   - Tag : `v0.1.0`
   - Titre : `Gilbert Desktop v0.1.0`
   - Publie la release

3. **GitHub Actions build automatiquement** :
   - ✅ macOS (.dmg)
   - ✅ Windows (.exe / .msi)
   - ✅ Linux (.deb / .AppImage)

4. **Télécharger les fichiers** :
   - Va dans l'onglet "Actions" de ton repo
   - Télécharge les artifacts pour chaque plateforme

## 🎯 Option 2 : Machine Windows/Linux (Manuel)

Si tu as accès à une machine Windows ou Linux :

### Sur Windows :
```bash
# Installer Rust et les dépendances
# Puis :
cd desktop
npm run tauri build
# Génère : .exe et .msi dans target/release/bundle/
```

### Sur Linux :
```bash
# Installer Rust et les dépendances
# Puis :
cd desktop
npm run tauri build
# Génère : .deb et .AppImage dans target/release/bundle/
```

## 🎯 Option 3 : Service Cloud (Payant)

Services qui peuvent build pour toi :
- **GitHub Actions** (gratuit pour repos publics) ✅ Déjà configuré
- **CircleCI** (gratuit jusqu'à 6000 min/mois)
- **GitLab CI** (gratuit)
- **AppVeyor** (gratuit pour repos publics)

## 📦 Format des fichiers générés

### Windows :
- **`.exe`** : Exécutable simple (double-clic pour installer)
- **`.msi`** : Installer Windows (recommandé pour distribution)

### Linux :
- **`.deb`** : Pour Debian/Ubuntu (double-clic pour installer)
- **`.AppImage`** : Portable, fonctionne sur toutes les distros Linux

### macOS :
- **`.app`** : Application macOS
- **`.dmg`** : Installer macOS (actuellement en erreur, mais `.app` fonctionne)

## 🚀 Workflow recommandé

### Pour distribuer à tout le monde :

1. **Créer une release GitHub** :
   ```bash
   # Sur GitHub, crée une release
   # Tag : v0.1.0
   ```

2. **GitHub Actions build automatiquement** :
   - Attends 5-10 minutes
   - Va dans Actions → Dernière workflow run
   - Télécharge les artifacts

3. **Uploader les fichiers** :
   - Upload les `.exe`, `.msi`, `.deb`, `.AppImage` sur la release GitHub
   - Ou sur ton serveur web

4. **Créer une page de téléchargement** :
   ```html
   <h1>Télécharger Gilbert Desktop</h1>
   <a href="...">macOS</a>
   <a href="...">Windows</a>
   <a href="...">Linux</a>
   ```

## 🔧 Améliorer le workflow GitHub Actions

Le workflow actuel build seulement pour macOS. Je peux le modifier pour build pour toutes les plateformes. Veux-tu que je le fasse ?

## 💡 Solution rapide maintenant

Pour l'instant, tu peux :
1. **Partager la version macOS** avec `./share-app.sh`
2. **Dire aux utilisateurs Windows/Linux** qu'ils peuvent utiliser la version web : https://gilbert-assistant.ovh
3. **Ou** activer GitHub Actions pour build automatiquement pour toutes les plateformes

Veux-tu que j'améliore le workflow GitHub Actions pour build automatiquement pour Windows et Linux ?

