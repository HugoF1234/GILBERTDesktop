#!/bin/bash
# Script pour nettoyer les traces Gilbert sur Mac (cache Gatekeeper, anciennes versions)
# À exécuter avant de retester un DMG notarisé fraîchement téléchargé

set -e

echo "=== Nettoyage des traces Gilbert ==="

# 1. Démonter les DMG Gilbert
echo ""
echo "1. Démonter les volumes Gilbert..."
for vol in "/Volumes/Gilbert" "/Volumes/Gilbert 1" "/Volumes/Gilbert 2"; do
  if [ -d "$vol" ]; then
    hdiutil detach "$vol" -force 2>/dev/null || true
    echo "   Démonté: $vol"
  fi
done

# 2. Supprimer l'app dans Applications
echo ""
echo "2. Supprimer /Applications/Gilbert.app..."
if [ -d "/Applications/Gilbert.app" ]; then
  rm -rf "/Applications/Gilbert.app"
  echo "   Supprimé"
else
  echo "   (déjà absent)"
fi

# 3. Supprimer GilbertDesktop.app dans Downloads (ancienne version non notarisée)
echo ""
echo "3. Supprimer ~/Downloads/GilbertDesktop.app..."
if [ -d "$HOME/Downloads/GilbertDesktop.app" ]; then
  rm -rf "$HOME/Downloads/GilbertDesktop.app"
  echo "   Supprimé"
else
  echo "   (déjà absent)"
fi

# 4. Vider le cache Launch Services (optionnel, peut aider Gatekeeper)
echo ""
echo "4. Réinitialiser Launch Services (base de données des apps)..."
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -kill -r -domain local -domain system -domain user 2>/dev/null || true
echo "   Fait"

echo ""
echo "=== Nettoyage terminé ==="
echo ""
echo "Prochaines étapes :"
echo "1. Télécharger le DMG depuis GitHub Release (la dernière version)"
echo "2. Double-cliquer sur le DMG pour le monter"
echo "3. Glisser Gilbert.app dans Applications"
echo "4. Lancer Gilbert (double-clic ou Clic droit → Ouvrir)"
echo ""
echo "Pour vérifier que l'app a bien le ticket de notarisation :"
echo "  xcrun stapler validate /Volumes/Gilbert/Gilbert.app"
echo "  (doit afficher 'The validate action worked!')"
echo ""
