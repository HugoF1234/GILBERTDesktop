# CONTEXT — Gilbert Desktop

> Fichier de référence pour reprendre le contexte en cas de nouvelle conversation.
> Dernière mise à jour : 5 mars 2026

---

## 1. Architecture du projet

```
GILBERT-desktop/
├── desktop/                    ← Application Tauri (Rust + Swift)
│   ├── src-tauri/
│   │   ├── src/
│   │   │   ├── main.rs         ← Point d'entrée Tauri, commandes, tray, dock
│   │   │   ├── state.rs        ← AppState, cache permission audio système
│   │   │   ├── recorder.rs     ← Enregistrement micro (cpal/hound)
│   │   │   ├── api.rs          ← Client HTTP vers le backend Gilbert
│   │   │   ├── queue.rs        ← File d'attente uploads offline
│   │   │   ├── background_sync.rs ← Auto-retry uploads toutes les 30s
│   │   │   └── swift/
│   │   │       ├── ScreenCaptureAudio.swift  ← Capture son système (ScreenCaptureKit)
│   │   │       └── sck_bridge.h              ← Header C pour FFI Rust↔Swift
│   │   ├── icons/              ← Icônes app (PNG, ICNS, ICO)
│   │   ├── build.rs            ← Compile le Swift bridge au build
│   │   └── tauri.conf.json     ← Config Tauri (productName: "Gilbert", v0.2.0)
│   └── package.json
├── frontend/                   ← React + Vite (interface utilisateur)
│   ├── src/
│   │   ├── components/
│   │   │   ├── recording/ImmersiveRecordingPage.tsx  ← Page d'enregistrement
│   │   │   └── RecordingBanner.tsx                  ← Bandeau recording persistant
│   │   ├── stores/
│   │   │   └── recordingStore.ts   ← Store Zustand (état global recording)
│   │   └── services/
│   │       └── tauriRecordingService.ts  ← Bridge frontend↔Tauri
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── .github/
│   └── workflows/
│       └── release.yml         ← GitHub Actions (build macOS + Windows + Linux)
└── CONTEXT.md                  ← CE FICHIER
```

---

## 2. Fonctionnalités implémentées

### Audio
- **Micro** : capture via `cpal` (cross-platform)
- **Son système (macOS)** : via Swift + ScreenCaptureKit (SCKit)
  - Détection dynamique du sample rate de l'output device via CoreAudio
  - Fix AirPods : rate 44100 Hz détecté automatiquement (au lieu du hardcodé 48000)
  - Permission cachée : pas de popup en boucle (cache dans `AtomicBool`)
- **Mode d'enregistrement** : mic seul, système seul, ou les deux simultanément

### Interface
- `RecordingBanner` : bandeau en haut toujours visible pendant l'enregistrement, même en naviguant
- `ImmersiveRecordingPage` : page principale d'enregistrement avec chronomètre
- Store Zustand (`recordingStore.ts`) : persist l'état + `tauriStartTime` pour recalculer la durée après navigation
- DevTools désactivés en production

### Fenêtre & Dock macOS
- Fermer la fenêtre → masque l'app (ne quitte pas)
- Clic sur l'icône Dock → réouvre la fenêtre
  - Implémenté via `NSApplicationDelegate` custom en Swift (`GilbertAppDelegate`)
  - FFI : `setup_dock_reopen_handler` → callback Rust `dock_reopen_callback`
  - Chaînage avec le delegate Tauri existant (forwarding)
- System tray : menu Afficher / Masquer / Quitter

### Icône
- Source : `desktop/src-tauri/icons/AppIcon.png` (1024×1024, fourni par l'utilisateur)
- Traitement Python (Pillow) :
  - Recadrage au bounding box du G (crop serré)
  - G à **72% du carré blanc**
  - Carré blanc arrondi à **80% du canvas total** (le reste est transparent)
  - Arrondi macOS standard : radius = 22.37% du carré
  - Fond transparent autour → icône même taille que Docker/Chrome dans le Dock
- Généré : `AppIcon-rounded.png` → toutes les tailles PNG → `icon.icns` / `icon.ico`

### Distribution
- App installée dans `/Applications/Gilbert.app`
- `Info.plist` corrigé : `CFBundleExecutable = Gilbert` (l'ancien bundle Tauri avait `GilbertDesktop`)
- Signature ad-hoc : `codesign --force --deep --sign -`
- Gatekeeper : `xattr -cr /Applications/Gilbert.app`
- Repo GitHub : [github.com/HugoF1234/GILBERTDesktop](https://github.com/HugoF1234/GILBERTDesktop)
- Release v0.2.0 avec `.dmg` Apple Silicon : [releases](https://github.com/HugoF1234/GILBERTDesktop/releases)

---

## 3. GitHub Actions (`release.yml`)

Déclenché par :
- `git tag vX.Y.Z && git push --tags`
- ou manuellement depuis l'onglet Actions → "Run workflow"

3 jobs en parallèle :
| Job | Runner | Output | Son système |
|-----|--------|--------|-------------|
| macOS | `macos-latest` | `.dmg` (aarch64) | ✅ Swift/SCKit |
| Windows | `windows-latest` | `.msi` | ❌ micro seulement |
| Linux | `ubuntu-22.04` | `.AppImage` | ❌ micro seulement |

Puis job `Publish GitHub Release` qui attache les 3 binaires.

---

## 4. Problèmes résolus (historique)

| Problème | Solution |
|----------|----------|
| Popup "Screen Recording" en boucle | Cache `AtomicBool` dans `state.rs` + flag `PERMISSION_REQUESTED` dans `recorder.rs` |
| Son silencieux avec AirPods | Détection dynamique du sample rate via CoreAudio (`getNativeOutputSampleRate()`) |
| Fenêtre impossible à rouvrir depuis le Dock | `NSApplicationDelegate` custom Swift + FFI callback Rust |
| Icône barrée au lancement | `CFBundleExecutable` dans `Info.plist` pointait sur `GilbertDesktop` au lieu de `Gilbert` |
| App "endommagée ou incomplète" (Gatekeeper) | `xattr -cr` + `codesign --force --deep --sign -` |
| Cache icône macOS persistant | `lsregister -kill` + `rm -rf ~/Library/Caches/com.apple.iconservices.store` + `killall Dock` |
| `tsconfig.node.json` manquant en CI | Ajouté au repo git (`git add frontend/tsconfig.node.json`) |
| Icône trop grande dans le Dock | Fond transparent autour du carré arrondi (80% du canvas) |
| Disque plein (97%) → git timeout | Supprimé `target/debug/` (719 Mo), travail fichier par fichier |

---

## 5. Commandes utiles

### Rebuilder l'app localement
```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/DESK/GILBERT-desktop/desktop
npm run tauri build -- --target aarch64-apple-darwin
```

### Réinstaller après build
```bash
APP_SRC="desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Gilbert.app"
rm -rf /Applications/Gilbert.app
rsync -a "$APP_SRC/" /Applications/Gilbert.app/
/usr/libexec/PlistBuddy -c "Set :CFBundleExecutable Gilbert" /Applications/Gilbert.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Set :CFBundleName Gilbert" /Applications/Gilbert.app/Contents/Info.plist
xattr -cr /Applications/Gilbert.app
codesign --force --deep --sign - /Applications/Gilbert.app
```

### Régénérer l'icône
```bash
cd desktop/src-tauri/icons
# Modifier AppIcon.png puis relancer :
python3 round_icon.py   # génère AppIcon-rounded.png + toutes les tailles
iconutil -c icns /tmp/gilbert_icon.iconset -o icon.icns
```

### Publier une nouvelle release
```bash
cd /Users/hugofouan/Documents/Lexia/Gilbert/DESK/GILBERT-desktop
git add -A && git commit -m "description"
git push origin main
git tag v0.X.Y
git push origin v0.X.Y
# → GitHub Actions démarre automatiquement
```

### Révoquer les permissions macOS (test)
```bash
tccutil reset ScreenCapture com.gilbert.desktop
tccutil reset Microphone com.gilbert.desktop
```

---

## 6. État actuel (5 mars 2026)

- ✅ App locale fonctionnelle dans `/Applications/Gilbert.app`
- ✅ Repo GitHub : [HugoF1234/GILBERTDesktop](https://github.com/HugoF1234/GILBERTDesktop)
- ✅ GitHub Actions configuré
- 🔄 Premier run GitHub Actions en cours (fix `tsconfig.node.json` appliqué)
- ⏳ À faire si Windows/Linux échouent : corriger les erreurs de compilation cross-platform
- ⏳ À faire plus tard : son système Windows (WASAPI) et Linux (PipeWire)
