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
| `TAURI_PRIVATE_KEY` | Clé privée pour l'updater | Contenu de `~/.tauri/gilbert.key` (voir note ci-dessous) |
| `TAURI_KEY_PASSWORD` | Mot de passe de la clé (si défini) | Optionnel |

**TAURI_PRIVATE_KEY :** Collez le contenu exact de `~/.tauri/gilbert.key` (2 lignes). Si vous voyez « Invalid symbol 10 » lors du build, la clé contient peut-être des caractères parasites — vérifiez qu'aucune ligne vide ou caractère supplémentaire n'a été ajoutée.

---

## Secrets optionnels (valeurs par défaut)

| Secret | Valeur par défaut | Usage |
|--------|-------------------|-------|
| `APPLE_TEAM_ID` | `2U6L38DLSW` | Team ID Apple (visible dans le certificat) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Mathis Escriva (2U6L38DLSW)` | Nom exact de l'identité codesign (app) |
| `APPLE_INSTALLER_IDENTITY` | `Developer ID Installer: Mathis Escriva (2U6L38DLSW)` | Nom exact pour signer le `.pkg` (certificat différent) |
| `APPLE_INSTALLER_CERTIFICATE` | *(optionnel)* | Si un seul .p12 avec Application+Installer ne donne qu'une identité en CI, exporte **uniquement** le certificat Developer ID Installer (avec sa clé) dans un second .p12, encode en base64, et ajoute ce secret. Réutilise `APPLE_CERTIFICATE_PASSWORD` pour l'import. |

**Certificat Installer :** Le `.pkg` nécessite un certificat **Developer ID Installer** (distinct de Developer ID Application). Créez-le dans Apple Developer → Certificates, IDs & Profiles.

**Si « 1 valid identities found » malgré un .p12 avec les 2 certs :** L'export Keychain peut ne pas associer correctement les deux clés. Solution : exporter **séparément** le certificat Developer ID Installer (clic droit → Exporter) dans un fichier `installer.p12`, puis créer le secret `APPLE_INSTALLER_CERTIFICATE` avec `base64 -i installer.p12 | pbcopy`.

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
