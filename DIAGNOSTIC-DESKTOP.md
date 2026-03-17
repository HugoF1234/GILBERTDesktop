# Diagnostic 360° — Gilbert Desktop

> Généré le 5 mars 2025

---

## 1. Workflow GitHub à utiliser pour les releases

### ✅ **`release-gilbert.yml`** — À UTILISER pour les releases publiques

**Emplacement :** `.github/workflows/release-gilbert.yml`

**Déclenchement :**
- Push d’un tag `v*` : `git tag v0.3.0 && git push --tags`
- Ou lancement manuel : Actions → Release Gilbert Desktop → Run workflow

**Ce qu’il fait :**
- **macOS** : build Apple Silicon → signature codesign → notarisation Apple → DMG signé et notarisé
- **Windows** : build .msi (sans signature SmartScreen)
- **Linux** : désactivé (placeholder uniquement)
- **Release** : création de la GitHub Release avec les binaires

**Ordre de signature macOS (correct) :**
1. dylib / .so
2. .framework
3. Helpers dans Frameworks
4. Binaire principal Gilbert
5. Bundle .app
6. Notarisation de l’app
7. Staple sur l’app
8. Création du DMG
9. Signature du DMG
10. Notarisation du DMG

**Secrets requis :**
- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

---

### ❌ **`build-desktop.yml`** — Ne pas utiliser pour les releases

- Déclenché sur `release: types: [created]` (conflit possible avec release-gilbert)
- Pas de notarisation macOS
- Pas de signature Apple
- Utilise `TAURI_PRIVATE_KEY` (updater Tauri) — différent de la signature Apple

---

### `sync-desktop.yml`

- Merge automatique `main` → `desktop`
- Utile pour la synchro de branches, pas pour les releases

---

## 2. Page Admin — Contrôle des applications desktop

### ✅ Fonctionnalités opérationnelles

| Fonctionnalité | Statut | Détails |
|----------------|--------|---------|
| **Utilisateurs** | ✅ | Liste, recherche, tri, activation/désactivation, suppression, création |
| **Abonnements** | ✅ | Changement de plan (beta_tester, discovery, gilbert_plus_monthly, gilbert_plus_yearly, enterprise) |
| **Organisations** | ✅ | CRUD, membres, templates, réunions |
| **Provider transcription** | ✅ | Attribution par utilisateur : AssemblyAI, OVH Whisper, Voxtral |
| **Emails** | ✅ | Envoi individuel ou groupé, templates, variables |
| **Queue** | ✅ | Suivi des jobs de transcription |
| **Activity** | ✅ | Activité des utilisateurs |
| **Monitoring** | ✅ | Santé des services |
| **Recordings** | ✅ | Enregistrements actifs |
| **Templates** | ✅ | Gestion des templates |
| **Statistiques** | ✅ | Tableau de bord global |

### ⚠️ Points d’attention

- **Teams (Microsoft Teams)** : l’admin ne gère pas l’app Microsoft Teams elle-même. La détection Teams/Meet est côté desktop (détection d’URL, fenêtres). Pas de configuration admin nécessaire.
- **Organisations = équipes** : les « teams » métier sont gérées via l’onglet **Organisations** (membres, rôles, templates).

---

## 3. Son système (macOS)

### ✅ Opérationnel sur macOS 13+ (Ventura)

- **Technologie** : ScreenCaptureKit (API Apple native)
- **Implémentation** : Swift `ScreenCaptureAudio.swift` + bridge FFI Rust
- **Permission** : Capture d’écran (même pour l’audio seul)
- **Format** : WAV, sample rate dynamique (ex. 48 kHz, adapté aux AirPods)

### ❌ Limites

- **Windows** : son système non disponible (micro uniquement)
- **Linux** : son système non disponible (micro uniquement)
- **macOS < 13** : ScreenCaptureKit indisponible

---

## 4. Corrections appliquées

1. **Chemin DMG dynamique** : le workflow ne suppose plus une version fixe `0.2.0` ; il détecte le fichier `.dmg` généré par Tauri.
2. **Job Linux** : suppression du double upload (placeholder vs AppImage) ; un seul artifact `LINUX_DISABLED.txt` pour éviter les échecs.

---

## 5. Recommandations prioritaires

1. **Version** : garder `tauri.conf.json` et `Cargo.toml` synchronisés (version unique).
2. **Release** : utiliser **`release-gilbert.yml`** pour toute release publique.
3. **Admin** : si besoin de « teams » métier supplémentaires, les gérer via les Organisations existantes.
4. **Linux** : pour réactiver le build, migrer vers Tauri v2 ou utiliser un runner Ubuntu 20.04.

---

## 6. Lancement d’une release

```bash
# 1. Mettre à jour la version dans desktop/src-tauri/tauri.conf.json et Cargo.toml
# 2. Commit et push
git add .
git commit -m "Release v0.3.0"
git push

# 3. Créer et pousser le tag
git tag v0.3.0
git push --tags
```

Le workflow `release-gilbert.yml` se lancera automatiquement. Les binaires signés et notarisés seront disponibles sur la GitHub Release.
