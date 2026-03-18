# Diagnostic Gilbert Desktop — Version 1.3.1 (préparation release utilisateurs)

> Dernière mise à jour : 17 mars 2026 — Objectif : rendre l'application prête pour une distribution publique

---

## Phase 1 — Complétée ✅

### 1. Versions harmonisées
| Emplacement | Statut |
|------------|--------|
| `tauri.conf.json`, `Cargo.toml`, `Info.plist`, `environment.ts` | ✅ 1.3.1 |

### 2. Sécurité
| Élément | Statut |
|--------|--------|
| DevTools | ✅ Retirés de Cargo.toml |

### 3. Documentation
| Élément | Statut |
|--------|--------|
| README utilisateur | ✅ Créé |
| INSTALLATION-WINDOWS.md | ✅ Créé |

### 4. Auto-update
| Élément | Statut |
|--------|--------|
| Configuration Tauri updater | ✅ |
| Vérification au démarrage | ✅ |
| Workflow release (latest.json, artifacts) | ✅ |
| Documentation (UPGRADE-AUTO-UPDATE.md) | ✅ |

---

## Phase 2 — Complétée ✅

### 2.1 Permissions macOS (Info.plist) ✅
- NSMicrophoneUsageDescription, NSScreenCaptureUsageDescription : traduites en français.

### 2.2 Messages d'erreur techniques ✅
- Utilitaire `toUserFriendlyMessage` créé (utils/errorMessages.ts).
- Dashboard, ImmersiveRecordingPage, RecordingRecoveryOverlay, RecordingRecoveryDialog : utilisation du mapping.

### 2.3 Onboarding
- ✅ Déjà complet : Questionnaire, OnboardingTour, OnboardingModal (micro, audio système, notifs).

### 2.4 CSP
- Configurée. `'unsafe-inline'` et `'unsafe-eval'` — à restreindre si possible (impact sur libs).

### 2.5 Textes légaux ✅
- Section 3.4 ajoutée dans la Politique de confidentialité (stockage local desktop, IndexedDB).

---

## 3. Distribution et plateformes

### 3.1 macOS (Apple Silicon)

| Élément | Statut |
|---------|--------|
| Signature codesign | ✅ Developer ID |
| Notarisation | ✅ App + DMG |
| Son système (ScreenCaptureKit) | ✅ Opérationnel (Swift bridge) |
| Permissions (micro, écran) | ✅ Gérées avec popup unique |

**Recommandation :** Documenter clairement pour l'utilisateur :
- macOS 13+ requis pour le son système
- Étapes d'installation : glisser dans Applications, première ouverture possiblement bloquée par Gatekeeper → clic droit → Ouvrir

### 3.2 Windows

| Élément | Statut |
|--------|--------|
| Build .msi | ✅ |
| Signature SmartScreen | ❌ Non configurée |
| Son système | ❌ Micro uniquement |

**Problème utilisateur :** SmartScreen affiche « Windows a protégé votre PC » → l'utilisateur doit cliquer sur « Informations complémentaires » → « Exécuter quand même ».

**Actions :**
1. Ajouter une page ou un README dédié « Installation Windows » avec ces étapes
2. À moyen terme : obtenir un certificat EV pour supprimer l’avertissement SmartScreen

### 3.3 Linux

**Statut :** ❌ Build désactivé (Tauri v1 + Ubuntu 22.04 incompatible avec libwebkit2gtk-4.0).

**Options :**
- Migrer vers Tauri v2
- Ou utiliser un runner Ubuntu 20.04

---

## 4. Expérience utilisateur (UX)

### 4.1 Onboarding

- ✅ Questionnaire post-inscription (usage, secteur, etc.)
- ✅ CGU/CGV acceptation
- ⚠️ Pas de tutoriel ou guide pour la première utilisation de l’enregistrement

**Suggestion :** Ajouter un court onboarding (3–4 écrans) expliquant :
- Comment démarrer un enregistrement
- Différence micro / son système / les deux
- Où trouver les transcriptions

### 4.2 Gestion des erreurs

- ✅ ErrorBoundary pour les crashs React
- ✅ Messages d’erreur sur les uploads (offline, erreur serveur)
- ✅ Récupération des enregistrements après reconnexion
- ⚠️ Certains messages techniques peuvent être affichés à l’utilisateur

**Suggestion :** Mapper les erreurs techniques vers des messages utilisateur clairs (ex. « Impossible de se connecter au serveur » au lieu de codes HTTP).

### 4.3 Permissions

- ✅ Micro : demandé au démarrage (silencieusement si déjà accordé)
- ✅ Capture d’écran : demandée au premier enregistrement avec son système
- ✅ Messages d’usage dans Info.plist (anglais)

**Suggestion :** Traduire `NSMicrophoneUsageDescription` et `NSScreenCaptureUsageDescription` en français pour cohérence avec l’UI.

---

## 5. Mise à jour automatique

**Statut :** ❌ Aucun mécanisme d’auto-update (Tauri Updater non configuré).

**Impact :** Les utilisateurs doivent télécharger manuellement chaque nouvelle version depuis GitHub Releases.

**Recommandation :** Configurer `@tauri-apps/plugin-updater` pour :
- Vérifier les mises à jour au lancement
- Proposer le téléchargement et l’installation
- Réduire les versions obsolètes en production

---

## 6. Documentation utilisateur

### 6.1 README actuel

**Problème :** Le README à la racine décrit un projet « Meeting App Unified » (fusion backend/frontend), pas l’app desktop.

**Action :** Créer ou adapter un README orienté utilisateur avec :
- Description de Gilbert Desktop
- Liens de téléchargement (macOS, Windows)
- Prérequis (macOS 13+, Windows 10+)
- Instructions d’installation et de première utilisation
- FAQ (permissions, SmartScreen, etc.)
- Lien support / contact

### 6.2 Pages légales

- ✅ CGU, CGV, Politique de confidentialité, Mentions légales
- ✅ Section 3.4 Politique de confidentialité (stockage local desktop, IndexedDB)

---

## 7. Qualité technique

### 7.1 Dépendances

- Tauri 1.5 (ancienne branche)
- React 18, Vite 5
- Rust 1.70+

**Point d’attention :** Tauri 1.x est en maintenance. Une migration vers Tauri v2 est à planifier pour les évolutions futures.

### 7.2 Logs et debugging

- `println!` utilisés côté Rust (visibles dans la console)
- Logger côté frontend avec niveau DEV/PROD

**Suggestion :** En production, limiter les logs sensibles et utiliser un niveau de log approprié.

---

## 8. Checklist avant mise à disposition des utilisateurs

### Priorité haute (bloquant)

- [x] Aligner toutes les versions sur **1.3.1**
- [x] Désactiver DevTools en production
- [x] Créer un README utilisateur clair
- [x] Documenter l’installation Windows (SmartScreen)

### Priorité moyenne

- [x] Traduire les descriptions de permissions macOS en français
- [ ] Ajouter une page « Installation » ou « Premier lancement » dans l’app
- [x] Configurer l’auto-update (Tauri Updater)
- [x] Vérifier les textes légaux pour le contexte desktop

### Priorité basse

- [ ] Restreindre la CSP (réduire unsafe-inline/eval si possible)
- [ ] Planifier la migration Tauri v2

---

## 9. Synthèse

| Catégorie | État | Action principale |
|-----------|------|-------------------|
| Versions | ⚠️ Incohérentes | Aligner sur 1.3.1 |
| Sécurité | ⚠️ DevTools en prod | Désactiver devtools |
| macOS | ✅ Prêt | Documentation installation |
| Windows | ⚠️ SmartScreen | Documenter contournement |
| Linux | ❌ Désactivé | Migration Tauri v2 |
| Auto-update | ❌ Absent | Configurer plugin updater |
| Documentation | ⚠️ Insuffisante | README utilisateur |
| UX | ✅ Correcte | Améliorer onboarding |

**Conclusion :** L’application est fonctionnelle et prête pour une distribution limitée (beta testeurs). Pour une mise à disposition large, il faut au minimum : aligner les versions, désactiver les DevTools, et fournir une documentation d’installation claire pour macOS et Windows.
