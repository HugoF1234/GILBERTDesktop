#!/bin/bash
# Vérifier qu'un .p12 contient les deux certificats (Application + Installer)
# Usage: ./scripts/verify-p12.sh Gilbert-DeveloperID.p12

P12="${1:-Gilbert-DeveloperID.p12}"
if [ ! -f "$P12" ]; then
  echo "Usage: $0 <chemin-vers-fichier.p12>"
  exit 1
fi

echo "Vérification de $P12"
echo "===================="
echo ""
echo "Certificats dans le .p12 (saisis le mot de passe quand demandé) :"
openssl pkcs12 -in "$P12" -nokeys -info -provider legacy -provider default 2>/dev/null | grep -E "subject=|friendlyName" || openssl pkcs12 -in "$P12" -nokeys -info 2>/dev/null | grep -E "subject=|friendlyName"
echo ""
echo "Tu dois voir 2 certificats : un avec 'Developer ID Application' et un avec 'Developer ID Installer'."
echo "Si un seul apparaît, ré-exporte depuis Accès aux trousseaux en sélectionnant les DEUX."
