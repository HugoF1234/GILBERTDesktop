# Guide de Déploiement Gilbert sur OVH VPS

## 🎯 Vue d'ensemble

Ce guide vous accompagne dans le déploiement de l'application Gilbert sur votre VPS OVH avec une architecture moderne basée sur Docker, PostgreSQL et Redis.

## 📋 Prérequis

### VPS OVH
- **OS**: Ubuntu 22.04 LTS
- **RAM**: 4 Go minimum
- **CPU**: 2 vCores minimum
- **Stockage**: 80 Go SSD NVMe
- **Domaine**: gilbert-assistant.ovh configuré

### Services Requis
- Docker et Docker Compose installés
- Git configuré
- Ports 80, 443, 5432, 6379 disponibles

## 🚀 Déploiement Rapide

### 1. Connexion au VPS
```bash
ssh ubuntu@51.38.177.18
```

### 2. Cloner le Repository
```bash
cd ~
git clone https://github.com/HugoF1234/GILBERT.git gilbert
cd gilbert
```

### 3. Configuration des Variables d'Environnement
```bash
# Copier le fichier d'environnement
cp .env.production .env

# Éditer avec vos clés API
nano .env
```

**Variables importantes à configurer :**
```env
# Services externes (obligatoires)
ASSEMBLYAI_API_KEY=votre_cle_assemblyai
MISTRAL_API_KEY=votre_cle_mistral

# Sécurité (recommandé de changer)
POSTGRES_PASSWORD=votre_mot_de_passe_securise
JWT_SECRET=votre_jwt_secret_tres_long_et_securise

# Google OAuth (optionnel)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### 4. Lancer le Déploiement
```bash
# Rendre le script exécutable
chmod +x deploy.sh

# Lancer le déploiement complet
./deploy.sh
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐
│     Nginx       │    │    Frontend     │
│  (Reverse Proxy)│◄──►│    (React)      │
│     SSL/TLS     │    │                 │
└─────────────────┘    └─────────────────┘
         │                       ▲
         ▼                       │
┌─────────────────┐              │
│   API Backend   │──────────────┘
│   (FastAPI)     │
└─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │
│  (Base données) │    │    (Cache)      │
└─────────────────┘    └─────────────────┘
```

## 📊 Services Déployés

| Service | Port | Description |
|---------|------|-------------|
| **Nginx** | 80, 443 | Reverse proxy + SSL |
| **Frontend** | - | Application React |
| **API** | - | Backend FastAPI |
| **PostgreSQL** | 5432 | Base de données |
| **Redis** | 6379 | Cache et sessions |
| **Certbot** | - | Gestion SSL automatique |

## 🔧 Commandes de Gestion

### Déploiement et Maintenance
```bash
# Déploiement complet
./deploy.sh deploy

# Voir les logs en temps réel
./deploy.sh logs

# Redémarrer les services
./deploy.sh restart

# Arrêter les services
./deploy.sh stop

# Vérifier l'état
./deploy.sh status

# Sauvegarder les données
./deploy.sh backup

# Reconfigurer SSL
./deploy.sh ssl
```

### Docker Compose Direct
```bash
# Voir l'état des conteneurs
docker-compose -f docker-compose.production.yml ps

# Logs spécifiques
docker-compose -f docker-compose.production.yml logs api
docker-compose -f docker-compose.production.yml logs frontend
docker-compose -f docker-compose.production.yml logs postgres

# Redémarrage d'un service spécifique
docker-compose -f docker-compose.production.yml restart api
```

## 🗄️ Gestion de la Base de Données

### Connexion PostgreSQL
```bash
# Connexion à la base de données
docker exec -it gilbert-postgres psql -U gilbert_user -d gilbert_db

# Sauvegarde
docker exec gilbert-postgres pg_dump -U gilbert_user gilbert_db > backup.sql

# Restauration
docker exec -i gilbert-postgres psql -U gilbert_user gilbert_db < backup.sql
```

### Migration depuis SQLite
Si vous migrez depuis SQLite, vos données seront automatiquement recréées avec la structure PostgreSQL optimisée.

## 🔒 Sécurité

### SSL/TLS
- Certificats Let's Encrypt automatiques
- Renouvellement automatique (certbot)
- Redirection HTTP → HTTPS
- Headers de sécurité optimisés

### Base de Données
- Utilisateur dédié non-root
- Mots de passe sécurisés
- Connexions chiffrées
- Sauvegarde automatique

### Application
- JWT avec secrets robustes
- CORS configuré
- Rate limiting
- Upload sécurisé

## 📈 Monitoring et Logs

### Logs Centralisés
```bash
# Tous les services
docker-compose -f docker-compose.production.yml logs -f

# Service spécifique
docker logs gilbert-api -f
docker logs gilbert-postgres -f
docker logs gilbert-nginx -f
```

### Health Checks
```bash
# API
curl http://gilbert-assistant.ovh/api/health

# Base de données
docker exec gilbert-postgres pg_isready -U gilbert_user

# Redis
docker exec gilbert-redis redis-cli ping
```

## 🔧 Dépannage

### Problèmes Courants

#### 1. Services ne démarrent pas
```bash
# Vérifier les logs
./deploy.sh logs

# Vérifier l'espace disque
df -h

# Nettoyer Docker
docker system prune -f
```

#### 2. SSL ne fonctionne pas
```bash
# Reconfigurer SSL
./deploy.sh ssl

# Vérifier les certificats
docker exec gilbert-nginx ls -la /etc/letsencrypt/live/gilbert-assistant.ovh/
```

#### 3. Base de données inaccessible
```bash
# Vérifier PostgreSQL
docker exec gilbert-postgres pg_isready -U gilbert_user

# Recréer la base si nécessaire
docker-compose -f docker-compose.production.yml restart postgres
```

#### 4. Performance lente
```bash
# Vérifier les ressources
docker stats

# Optimiser PostgreSQL
docker exec gilbert-postgres psql -U gilbert_user -d gilbert_db -c "VACUUM ANALYZE;"
```

## 📊 Urls d'Accès

Après déploiement réussi :

- **Application**: https://gilbert-assistant.ovh
- **API Documentation**: https://gilbert-assistant.ovh/api/docs
- **Health Check**: https://gilbert-assistant.ovh/api/health

## 🔄 Mises à Jour

### Mise à jour du Code
```bash
# Pull des dernières modifications
git pull origin main

# Redéploiement
./deploy.sh deploy
```

### Mise à jour des Dépendances
```bash
# Reconstruire les images
docker-compose -f docker-compose.production.yml up -d --build
```

## 💾 Sauvegarde et Restauration

### Sauvegarde Automatique
```bash
# Sauvegarde complète
./deploy.sh backup
```

### Sauvegarde Manuelle
```bash
# Base de données
docker exec gilbert-postgres pg_dumpall -c -U gilbert_user > gilbert_backup_$(date +%Y%m%d).sql

# Fichiers uploads
docker run --rm -v gilbert_uploads_data:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

## 📞 Support

En cas de problème :

1. Vérifiez les logs : `./deploy.sh logs`
2. Consultez la section dépannage
3. Vérifiez la configuration réseau et DNS
4. Contactez le support si nécessaire

## 🎉 Félicitations !

Votre application Gilbert est maintenant déployée avec une architecture robuste et scalable !

**Prochaines étapes recommandées :**
- Configurer la surveillance (monitoring)
- Mettre en place des sauvegardes automatiques
- Optimiser les performances selon l'usage
- Configurer l'auto-scaling si nécessaire