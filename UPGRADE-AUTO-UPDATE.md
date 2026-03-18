# Configuration de l'auto-update Gilbert Desktop

Ce document décrit comment activer les mises à jour automatiques pour Gilbert Desktop.

## Prérequis

L'auto-update nécessite une paire de clés cryptographiques pour signer les mises à jour. Sans ces clés, les utilisateurs ne pourront pas mettre à jour l'app automatiquement.

---

## Étape 1 : Générer les clés de signature

Sur votre machine (macOS ou Linux) :

```bash
cd desktop
npm run tauri signer generate -- -w ~/.tauri/gilbert.key
```

Cette commande crée deux fichiers :
- **`~/.tauri/gilbert.key`** — Clé privée (à garder secrète, ne jamais partager)
- **`~/.tauri/gilbert.key.pub`** — Clé publique (à mettre dans la config)

> ⚠️ **Important :** Si vous perdez la clé privée, vous ne pourrez plus publier de mises à jour pour les utilisateurs existants. Sauvegardez-la en lieu sûr.

---

## Étape 2 : Mettre à jour la configuration

1. Ouvrir le fichier **`desktop/src-tauri/tauri.conf.json`**
2. Remplacer la valeur de `pubkey` dans la section `updater` par le **contenu complet** du fichier `~/.tauri/gilbert.key.pub` :

```bash
cat ~/.tauri/gilbert.key.pub
```

Copier tout le contenu (plusieurs lignes possibles) et le coller dans `tauri.conf.json` :

```json
"updater": {
  "active": true,
  "endpoints": [
    "https://github.com/HugoF1234/GILBERTDesktop/releases/latest/download/latest.json"
  ],
  "dialog": true,
  "pubkey": "COLLER_ICI_LE_CONTENU_DE_gilbert.key.pub"
}
```

---

## Étape 3 : Configurer les secrets GitHub

1. Aller sur **GitHub** → votre repo **GILBERTDesktop** → **Settings** → **Secrets and variables** → **Actions**
2. Créer les secrets suivants :

| Secret | Valeur | Description |
|--------|--------|-------------|
| `TAURI_PRIVATE_KEY` | Contenu de `~/.tauri/gilbert.key` | Clé privée complète (tout le fichier) |
| `TAURI_KEY_PASSWORD` | (optionnel) | Mot de passe si vous en avez défini un lors de la génération |

Pour copier la clé privée :
```bash
cat ~/.tauri/gilbert.key
```

---

## Étape 4 : Vérifier le workflow

Le workflow `.github/workflows/release-gilbert.yml` a été configuré pour :

1. **macOS** : Créer `Gilbert.app.tar.gz` à partir de l'app signée et notarisée, puis le signer
2. **Windows** : Générer `*.msi.zip` et `*.msi.zip.sig` lors du build
3. **Release** : Créer `latest.json` et l'uploader avec les autres assets

L'URL de vérification des mises à jour est :
```
https://github.com/HugoF1234/GILBERTDesktop/releases/latest/download/latest.json
```

GitHub redirige automatiquement `releases/latest` vers la dernière release.

---

## Fonctionnement côté utilisateur

1. Au lancement de l'app, une vérification silencieuse est effectuée
2. Si une version plus récente existe, une boîte de dialogue native s'affiche
3. L'utilisateur peut accepter ou refuser la mise à jour
4. En cas d'acceptation : téléchargement → installation → redémarrage de l'app

---

## Dépannage

### L'updater ne détecte pas les mises à jour
- Vérifier que `latest.json` est bien présent dans les assets de la release GitHub
- Vérifier que la `pubkey` dans `tauri.conf.json` correspond à la clé utilisée pour signer

### Erreur "signature invalide"
- La clé privée utilisée pour signer doit correspondre à la clé publique dans la config
- Vérifier que `TAURI_PRIVATE_KEY` dans GitHub Secrets contient bien la clé complète

### Le build échoue avec "TAURI_PRIVATE_KEY"
- S'assurer que le secret `TAURI_PRIVATE_KEY` est bien configuré dans GitHub
- Pour tester en local : `export TAURI_PRIVATE_KEY="$(cat ~/.tauri/gilbert.key)"` avant `npm run tauri build`
