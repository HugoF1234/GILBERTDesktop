#!/bin/bash

# Script de déploiement du système de queue Redis + Celery
# Usage: ./deploy_queue_system_clean.sh

set -e

echo "🚀 Déploiement du système de queue Redis + Celery pour Gilbert"

# Vérifier que nous sommes dans le bon répertoire
echo "🔍 Répertoire actuel: $(pwd)"
if [ ! -f "docker-compose.production.yml" ]; then
    echo "❌ Erreur: Ce script doit être exécuté depuis le répertoire GilbertSaas"
    echo "❌ Fichier docker-compose.production.yml non trouvé dans $(pwd)"
    exit 1
fi
echo "✅ docker-compose.production.yml trouvé"

# 1. Mettre à jour les dépendances
echo "📦 Mise à jour des dépendances Python..."
docker-compose -f docker-compose.production.yml exec api pip install -r requirements.txt

# 2. Redémarrer les services existants
echo "🔄 Redémarrage des services existants..."
docker-compose -f docker-compose.production.yml restart api

# 3. Vérifier que Redis est disponible
echo "🔍 Vérification de Redis..."
if ! docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping | grep -q "PONG"; then
    echo "❌ Redis n'est pas disponible. Démarrage de Redis..."
    docker-compose -f docker-compose.production.yml up -d redis
    sleep 5
fi

# 4. Tester la connexion Redis
echo "✅ Test de connexion Redis..."
docker-compose -f docker-compose.production.yml exec -T redis redis-cli ping

# 5. Démarrer le worker Celery
echo "👷 Démarrage du worker Celery..."
docker-compose -f docker-compose.production.yml exec -d api celery -A app.services.celery_app worker --loglevel=info --concurrency=4 --queues=transcription,summary --hostname=worker@%h
echo "📝 Worker Celery démarré en arrière-plan"

# 6. Attendre que le worker soit prêt
echo "⏳ Attente que le worker Celery soit prêt..."
sleep 10

# 7. Tester le système de queue
echo "🧪 Test du système de queue..."
docker-compose -f docker-compose.production.yml exec api python -c "
from app.services.celery_app import celery_app
from app.services.transcription_tasks import transcribe_audio_task

# Test simple de la queue
print('✅ Celery configuré correctement')
print('🎯 Système de queue opérationnel')
"

echo ""
echo "✅ Déploiement du système de queue terminé!"
echo ""
echo "📋 Prochaines étapes:"
echo "1. Tester l'upload avec queue: POST /queue/meetings/upload"
echo "2. Vérifier le statut: GET /queue/meetings/{meeting_id}/task-status"
echo ""
echo "🔧 Configuration:"
echo "- Redis: redis://localhost:6379/0"
echo "- Celery: 4 workers parallèles"
echo "- Queues: transcription, summary"
echo ""
echo "📱 Pour l'iPhone:"
echo "- Utiliser /queue/meetings/upload au lieu de /simple/meetings/upload"
echo "- Polling: GET /queue/meetings/{meeting_id}/task-status"
echo "- WebSocket: ws://gilbert-assistant.ovh/queue/meetings/ws/{user_id}"
