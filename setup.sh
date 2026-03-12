#!/bin/bash

# Création des dossiers si non existants
mkdir -p backend frontend

# Instructions pour l'utilisateur
echo "Script de fusion des repositories backend et frontend"
echo "==============================================="
echo "Instructions:"
echo "1. Téléchargez manuellement les archives ZIP depuis GitHub:"
echo "   - Backend (branche production): https://github.com/mathisescriva/backend_meeting/archive/refs/heads/production.zip"
echo "   - Frontend (branche production-features): https://github.com/mathisescriva/saas_meeting_retranscription/archive/refs/heads/production-features.zip"
echo "2. Placez ces fichiers ZIP dans ce dossier"
echo "3. Exécutez à nouveau ce script"
echo ""

# Vérification si les archives ZIP sont présentes
BACKEND_ZIP=$(find ./backend -name "*.zip" | head -1)
FRONTEND_ZIP=$(find ./frontend -name "*.zip" | head -1)

# Fonction pour extraire une archive
extract_archive() {
  local zip_file=$1
  local target_dir=$2
  local original_dir_name=$3
  
  echo "Extraction de $zip_file vers $target_dir..."
  
  # Créer un dossier temporaire pour l'extraction
  mkdir -p temp_extract
  
  # Extraire l'archive dans le dossier temporaire
  unzip -q "$zip_file" -d temp_extract
  
  # Copier le contenu du dossier extrait vers le dossier cible
  cp -r temp_extract/"$original_dir_name"/* "$target_dir"/
  
  # Nettoyer
  rm -rf temp_extract
  echo "Extraction terminée!"
}

# Traiter le backend si l'archive est présente
if [ -n "$BACKEND_ZIP" ]; then
  extract_archive "$BACKEND_ZIP" "backend" "backend_meeting-production"
  echo "✅ Backend intégré avec succès!"
else
  echo "❌ Archive backend non trouvée."
fi

# Traiter le frontend si l'archive est présente
if [ -n "$FRONTEND_ZIP" ]; then
  extract_archive "$FRONTEND_ZIP" "frontend" "saas_meeting_retranscription-production-features"
  echo "✅ Frontend intégré avec succès!"
else
  echo "❌ Archive frontend non trouvée."
fi

# Vérifier si les deux projets ont été intégrés
if [ -d "backend/app" ] && [ -d "frontend/src" ]; then
  echo ""
  echo "✅ Les deux projets ont été fusionnés avec succès!"
  echo "Vous pouvez maintenant travailler sur le projet unifié."
else
  echo ""
  echo "⚠️ La fusion n'est pas complète. Veuillez télécharger les archives manquantes et réexécuter ce script."
fi
