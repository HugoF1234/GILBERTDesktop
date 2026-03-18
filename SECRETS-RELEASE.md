# Secrets GitHub pour le workflow Release Gilbert Desktop

Pour que le workflow `release-gilbert.yml` fonctionne et produise un DMG **signé et notarisé** (sans message Gatekeeper « Apple n'a pas pu confirmer »), configurez les secrets suivants.

## Prérequis

- Le dépôt doit être **HugoF1234/GILBERTDesktop** (ou adapter les URLs dans `tauri.conf.json`)
- Un compte Apple Developer avec certificat **Developer ID Application**

---

## Secrets obligatoires

| Secret | Description | Comment obtenir |
|--------|-------------|-----------------|
| `APPLE_CERTIFICATE` | Certificat .p12 encodé en base64 | `base64 -i certificat.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | Mot de passe du fichier .p12 | Défini à l'export |
| `APPLE_ID` | Email du compte Apple Developer | Compte utilisé pour la notarisation |
| `APPLE_PASSWORD` | Mot de passe ou app-specific password | Générer un app-specific password sur appleid.apple.com |
| `TAURI_PRIVATE_KEY` | Clé privée pour l'updater | Contenu de `~/.tauri/gilbert.key` |
| `TAURI_KEY_PASSWORD` | Mot de passe de la clé (si défini) | Optionnel |

---

## Secrets optionnels (valeurs par défaut)

| Secret | Valeur par défaut | Usage |
|--------|-------------------|-------|
| `APPLE_TEAM_ID` | `2U6L38DLSW` | Team ID Apple (visible dans le certificat) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Mathis Escriva (2U6L38DLSW)` | Nom exact de l'identité codesign |

**Si vous utilisez un autre certificat**, récupérez l'identité exacte après import :

```bash
security find-identity -v -p codesign
```

Copiez la ligne complète (ex. `Developer ID Application: Votre Nom (TEAM_ID)`).

---

## Ordre des opérations (workflow)

1. **Build** Tauri → app et DMG non signés
2. **Signer** l'app (dylib, frameworks, binaire, bundle)
3. **Notariser** l'app → Apple vérifie
4. **Stapler** le ticket sur l'app
5. **Créer** un nouveau DMG avec l'app staplée
6. **Signer** le DMG
7. **Notariser** le DMG
8. **Stapler** le DMG
9. **Upload** sur GitHub Release

Le DMG final est ainsi accepté par Gatekeeper sans avertissement.

---

## Déclencher le workflow

**Option A — Tag (recommandé)**  
```bash
git tag v1.3.1
git push origin v1.3.1
```

**Option B — Manuel**  
GitHub → Actions → Release Gilbert Desktop → Run workflow

---

## Vérification

Après une release réussie :

1. Télécharger le `.dmg` depuis [GitHub Releases](https://github.com/HugoF1234/GILBERTDesktop/releases)
2. Double-cliquer → glisser Gilbert dans Applications
3. Lancer Gilbert : **aucun message Gatekeeper** si tout est correct
