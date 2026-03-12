#!/bin/bash

# Script de déploiement intelligent pour Gilbert
# =============================================

set -e  # Arrêter le script en cas d'erreur

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables
DOMAIN="gilbert-assistant.ovh"
EMAIL="hugofouan@gmail.com"
BACKUP_DIR="./backups"
COMPOSE_FILE="docker-compose.production.yml"

# Fonctions utilitaires
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Vérification des prérequis..."
    
    # Vérifier Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker n'est pas installé"
        exit 1
    fi
    
    # Vérifier Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose n'est pas installé"
        exit 1
    fi
    
    # Vérifier les permissions Docker
    if ! docker ps &> /dev/null; then
        log_error "Permissions Docker insuffisantes. Exécutez: sudo usermod -aG docker $USER"
        exit 1
    fi
    
    log_success "Prérequis validés"
}

backup_data() {
    log_info "Sauvegarde des données existantes..."
    
    # Créer le répertoire de sauvegarde
    mkdir -p "$BACKUP_DIR"
    
    # Sauvegarder la base de données existante si elle existe
    if docker ps | grep -q gilbert-postgres; then
        log_info "Sauvegarde de la base de données PostgreSQL..."
        docker exec gilbert-postgres pg_dumpall -c -U gilbert_user > "$BACKUP_DIR/gilbert_backup_$(date +%Y%m%d_%H%M%S).sql"
        log_success "Sauvegarde de la base de données créée"
    fi
    
    # Sauvegarder les uploads si ils existent
    if docker volume ls | grep -q gilbert_uploads_data; then
        log_info "Sauvegarde des fichiers uploads..."
        docker run --rm -v gilbert_uploads_data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar czf /backup/uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
        log_success "Sauvegarde des uploads créée"
    fi
}

setup_environment() {
    log_info "Configuration de l'environnement..."
    
    # Copier le fichier d'environnement si il n'existe pas
    if [ ! -f .env ]; then
        if [ -f .env.production ]; then
            cp .env.production .env
            log_info "Fichier .env créé à partir de .env.production"
        else
            log_warning "Aucun fichier .env trouvé. Utilisation des valeurs par défaut."
        fi
    fi
    
    # Créer les répertoires nécessaires
    mkdir -p nginx/ssl
    mkdir -p database
    
    # Générer un certificat SSL auto-signé pour le serveur par défaut
    if [ ! -f nginx/ssl/default.crt ]; then
        log_info "Génération du certificat SSL par défaut..."
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/default.key \
            -out nginx/ssl/default.crt \
            -subj "/C=FR/ST=Alsace/L=Strasbourg/O=Gilbert/CN=default" \
            2>/dev/null || log_warning "Impossible de générer le certificat SSL par défaut"
    fi
    
    log_success "Environnement configuré"
}

stop_existing_services() {
    log_info "Arrêt des services existants..."
    
    # Arrêter les services s'ils sont en cours d'exécution
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        docker-compose -f "$COMPOSE_FILE" down
        log_success "Services arrêtés"
    else
        log_info "Aucun service en cours d'exécution"
    fi
}

build_and_start_services() {
    log_info "Construction et démarrage des services..."
    
    # Nettoyer les images orphelines
    docker system prune -f > /dev/null 2>&1 || true
    
    # Construire et démarrer les services
    docker-compose -f "$COMPOSE_FILE" up -d --build
    
    log_success "Services démarrés"
}

wait_for_services() {
    log_info "Attente de la disponibilité des services..."
    
    # Attendre PostgreSQL
    log_info "Attente de PostgreSQL..."
    timeout 60 bash -c 'until docker exec gilbert-postgres pg_isready -U gilbert_user; do sleep 2; done' || {
        log_error "PostgreSQL ne répond pas après 60 secondes"
        return 1
    }
    
    # Attendre Redis
    log_info "Attente de Redis..."
    timeout 30 bash -c 'until docker exec gilbert-redis redis-cli ping; do sleep 2; done' || {
        log_error "Redis ne répond pas après 30 secondes"
        return 1
    }
    
    # Attendre l'API
    log_info "Attente de l'API..."
    timeout 120 bash -c 'until docker exec gilbert-api curl -f http://localhost:8000/health > /dev/null 2>&1; do sleep 5; done' || {
        log_error "L'API ne répond pas après 120 secondes"
        return 1
    }
    
    log_success "Tous les services sont opérationnels"
}

setup_ssl() {
    log_info "Configuration SSL..."
    
    # Vérifier que nginx est démarré
    if ! docker ps | grep -q gilbert-nginx; then
        log_error "Nginx n'est pas démarré"
        return 1
    fi
    
    # Générer le certificat Let's Encrypt
    log_info "Génération du certificat Let's Encrypt pour $DOMAIN..."
    
    docker-compose -f "$COMPOSE_FILE" run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$EMAIL" \
        --agree-tos \
        --no-eff-email \
        --force-renewal \
        -d "$DOMAIN" || {
        log_warning "Échec de la génération du certificat SSL. L'application fonctionnera en HTTP."
        return 0
    }
    
    # Recharger nginx pour utiliser le nouveau certificat
    docker exec gilbert-nginx nginx -s reload || {
        log_warning "Échec du rechargement de nginx. Redémarrage du conteneur..."
        docker-compose -f "$COMPOSE_FILE" restart nginx
    }
    
    log_success "SSL configuré avec succès"
}

verify_deployment() {
    log_info "Vérification du déploiement..."
    
    # Vérifier l'état des conteneurs
    log_info "État des conteneurs:"
    docker-compose -f "$COMPOSE_FILE" ps
    
    # Tester l'API
    if curl -f http://localhost/api/health > /dev/null 2>&1; then
        log_success "API accessible en HTTP"
    else
        log_error "API inaccessible en HTTP"
        return 1
    fi
    
    # Tester HTTPS si disponible
    if curl -f -k https://localhost/api/health > /dev/null 2>&1; then
        log_success "API accessible en HTTPS"
    else
        log_warning "API inaccessible en HTTPS (normal si SSL non configuré)"
    fi
    
    # Afficher les URLs d'accès
    echo
    log_success "🎉 Déploiement terminé avec succès!"
    echo
    echo "📊 URLs d'accès:"
    echo "   • Application: http://$DOMAIN (ou https si SSL configuré)"
    echo "   • API Health: http://$DOMAIN/api/health"
    echo "   • API Docs: http://$DOMAIN/api/docs"
    echo
    echo "🔧 Commandes utiles:"
    echo "   • Voir les logs: docker-compose -f $COMPOSE_FILE logs -f"
    echo "   • Redémarrer: docker-compose -f $COMPOSE_FILE restart"
    echo "   • Arrêter: docker-compose -f $COMPOSE_FILE down"
    echo
}

show_logs() {
    log_info "Affichage des logs récents..."
    docker-compose -f "$COMPOSE_FILE" logs --tail=50
}

# Menu principal
main() {
    echo "🚀 Déploiement de Gilbert en production"
    echo "======================================="
    
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            backup_data
            setup_environment
            stop_existing_services
            build_and_start_services
            wait_for_services
            setup_ssl
            verify_deployment
            ;;
        
        logs)
            show_logs
            ;;
        
        stop)
            log_info "Arrêt des services..."
            docker-compose -f "$COMPOSE_FILE" down
            log_success "Services arrêtés"
            ;;
        
        restart)
            log_info "Redémarrage des services..."
            docker-compose -f "$COMPOSE_FILE" restart
            log_success "Services redémarrés"
            ;;
        
        status)
            log_info "État des services:"
            docker-compose -f "$COMPOSE_FILE" ps
            ;;
        
        ssl)
            setup_ssl
            ;;
        
        backup)
            backup_data
            ;;
        
        *)
            echo "Usage: $0 {deploy|logs|stop|restart|status|ssl|backup}"
            echo
            echo "Commandes disponibles:"
            echo "  deploy  - Déploiement complet (par défaut)"
            echo "  logs    - Afficher les logs"
            echo "  stop    - Arrêter les services"
            echo "  restart - Redémarrer les services"
            echo "  status  - Afficher l'état des services"
            echo "  ssl     - Configurer SSL uniquement"
            echo "  backup  - Sauvegarder les données"
            exit 1
            ;;
    esac
}

# Exécution du script
main "$@"
