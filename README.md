# Gilbert Desktop

Application desktop Gilbert pour enregistrer et transcrire vos réunions (Zoom, Meet, Teams, etc.).

## Téléchargement

**Releases :** [GitHub Releases](https://github.com/HugoF1234/GILBERTDesktop/releases)

| Plateforme | Fichier | Son système |
|------------|---------|-------------|
| **macOS** (Apple Silicon M1/M2/M3) | `.dmg` | ✅ Micro + son système |
| **Windows** 10/11 | `.msi` | Micro uniquement |
| **Linux** | Bientôt disponible | - |

---

## Prérequis

- **macOS :** 13.0 (Ventura) ou supérieur — requis pour le son système (Zoom, Meet, etc.)
- **Windows :** Windows 10 ou 11
- Compte Gilbert (inscription sur [gilbert-assistant.ovh](https://gilbert-assistant.ovh))

---

## Installation

### macOS

1. Télécharger le fichier `.dmg` depuis les [Releases](https://github.com/HugoF1234/GILBERTDesktop/releases)
2. Double-cliquer sur le `.dmg` pour ouvrir
3. Glisser **Gilbert** dans le dossier **Applications**
4. Lancer Gilbert depuis Applications

> **Première ouverture :** Si macOS affiche « Gilbert ne peut pas être ouvert car le développeur n’est pas identifié », faire un **clic droit** sur l’app → **Ouvrir** → confirmer.

### Windows

1. Télécharger le fichier `.msi` depuis les [Releases](https://github.com/HugoF1234/GILBERTDesktop/releases)
2. Double-cliquer sur le `.msi` pour lancer l’installation
3. Suivre l’assistant d’installation

> **SmartScreen :** Si Windows affiche « Windows a protégé votre PC », cliquer sur **Informations complémentaires** puis **Exécuter quand même**. L’app est signée mais non reconnue par SmartScreen sans certificat EV. Voir [INSTALLATION-WINDOWS.md](INSTALLATION-WINDOWS.md) pour plus de détails.

---

## Premier lancement

1. Se connecter avec votre compte Gilbert (ou créer un compte)
2. Accepter les permissions demandées :
   - **Micro** : pour enregistrer votre voix
   - **Capture d’écran** (macOS uniquement) : pour capturer le son des apps de visio (Zoom, Meet, Teams) — demandée au premier enregistrement avec son système
3. Cliquer sur **Démarrer** pour lancer un enregistrement

---

## Support

- **Site :** [gilbert-assistant.ovh](https://gilbert-assistant.ovh)
- **Contact :** Lexia France

---

## Développeurs

Voir [CONTEXT.md](CONTEXT.md) pour l’architecture du projet et les instructions de build.
