#!/bin/bash
# Diagnostic DMG — vérifier si un DMG est correctement signé et notarisé
# Usage: ./scripts/diagnostic-dmg.sh Gilbert_1.3.1_aarch64.dmg

DMG="${1:-Gilbert_1.3.1_aarch64.dmg}"

if [ ! -f "$DMG" ]; then
  echo "❌ Fichier introuvable: $DMG"
  echo "Usage: $0 <chemin-vers-le.dmg>"
  exit 1
fi

echo "=========================================="
echo "  Diagnostic DMG: $DMG"
echo "=========================================="
echo ""

echo "1. Signature codesign:"
codesign -dv --verbose=2 "$DMG" 2>&1
echo ""

echo "2. Staple (notarisation) — doit afficher 'The validate action worked!':"
xcrun stapler validate "$DMG" 2>&1
STAPLE_OK=$?
echo ""

echo "3. Gatekeeper (spctl) — doit afficher 'accepted':"
spctl -a -vv -t open "$DMG" 2>&1
SPCTL_OK=$?
echo ""

echo "4. Attribut quarantaine (xattr):"
xattr "$DMG" 2>&1
echo ""

if [ $STAPLE_OK -eq 0 ]; then
  echo "✅ Le DMG est correctement signé et notarisé (stapler validate OK)."
  echo ""
  echo "   Note: spctl peut afficher 'rejected / Insufficient Context' sur les DMG —"
  echo "   c'est un faux positif connu. Ce qui compte c'est que stapler validate réussisse."
  echo ""
  if xattr "$DMG" 2>/dev/null | grep -q "com.apple.quarantine"; then
    echo "   ⚠️  L'attribut quarantaine (téléchargement internet) peut déclencher Gatekeeper."
    echo ""
    echo "   Pour supprimer la quarantaine et tester :"
    echo "   xattr -d com.apple.quarantine \"$DMG\""
    echo ""
    echo "   Puis : double-cliquer le DMG → glisser Gilbert dans Applications → lancer."
    echo ""
    echo "   Alternative : clic droit sur le DMG → Ouvrir (contourne le 1er avertissement)."
  fi
else
  echo "❌ Problème : le DMG n'est PAS notarisé (stapler validate a échoué)."
  echo "   Vérifiez les secrets APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID dans GitHub."
fi
