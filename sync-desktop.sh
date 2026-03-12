#!/bin/bash
# Script pour synchroniser main → desktop

set -e  # Arrêter en cas d'erreur

echo "🔄 Synchronisation main → desktop..."

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier qu'on est dans un repo git
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Erreur: Pas dans un repository Git${NC}"
    exit 1
fi

# Sauvegarder la branche actuelle
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${YELLOW}📍 Branche actuelle: ${CURRENT_BRANCH}${NC}"

# Sauvegarder les changements locaux s'il y en a
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}💾 Sauvegarde des changements locaux...${NC}"
    git stash push -m "Auto-stash before sync $(date +%Y-%m-%d_%H-%M-%S)"
    STASHED=true
else
    STASHED=false
fi

# Aller sur main et récupérer les dernières modifications
echo -e "${YELLOW}📥 Mise à jour de main...${NC}"
git checkout main
git pull origin main || echo -e "${YELLOW}⚠️  Pas de remote main ou déjà à jour${NC}"

# Aller sur desktop
echo -e "${YELLOW}🖥️  Passage sur desktop...${NC}"
git checkout desktop

# Merger main dans desktop
echo -e "${YELLOW}🔀 Merge de main dans desktop...${NC}"
if git merge main --no-edit; then
    echo -e "${GREEN}✅ Merge réussi sans conflits${NC}"
else
    echo -e "${YELLOW}⚠️  Conflits détectés, résolution automatique...${NC}"
    
    # Résoudre les conflits en gardant la version desktop pour les fichiers spécifiques
    git checkout --ours desktop/ 2>/dev/null || true
    git checkout --ours frontend/src/App.tsx 2>/dev/null || true
    
    # Ajouter les fichiers résolus
    git add .
    
    # Si des fichiers sont encore en conflit, on commit quand même
    if git diff --staged --quiet && git diff --check; then
        echo -e "${GREEN}✅ Conflits résolus automatiquement${NC}"
        git commit -m "Sync: Merge main into desktop (auto-resolved conflicts)"
    else
        echo -e "${RED}❌ Conflits non résolus automatiquement. Résolution manuelle nécessaire.${NC}"
        echo -e "${YELLOW}💡 Utilise 'git status' pour voir les fichiers en conflit${NC}"
        
        # Restaurer les changements si on avait stash
        if [ "$STASHED" = true ]; then
            git stash pop
        fi
        
        exit 1
    fi
fi

# Push sur GitHub
echo -e "${YELLOW}📤 Push sur GitHub...${NC}"
if git push origin desktop; then
    echo -e "${GREEN}✅ Push réussi !${NC}"
else
    echo -e "${RED}❌ Erreur lors du push${NC}"
    echo -e "${YELLOW}💡 Vérifie tes permissions GitHub${NC}"
    
    # Restaurer les changements si on avait stash
    if [ "$STASHED" = true ]; then
        git stash pop
    fi
    
    exit 1
fi

# Restaurer les changements locaux si on avait stash
if [ "$STASHED" = true ]; then
    echo -e "${YELLOW}🔄 Restauration des changements locaux...${NC}"
    git stash pop || echo -e "${YELLOW}⚠️  Pas de stash à restaurer${NC}"
fi

# Revenir sur la branche d'origine si différente
if [ "$CURRENT_BRANCH" != "desktop" ]; then
    echo -e "${YELLOW}🔄 Retour sur ${CURRENT_BRANCH}...${NC}"
    git checkout "$CURRENT_BRANCH" 2>/dev/null || echo -e "${YELLOW}⚠️  Branche ${CURRENT_BRANCH} n'existe plus${NC}"
fi

echo -e "${GREEN}✅ Synchronisation terminée avec succès !${NC}"
echo -e "${GREEN}📦 La branche desktop est maintenant à jour avec main${NC}"

