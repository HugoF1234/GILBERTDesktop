# 🚀 Instructions de Déploiement Gilbert sur OVH VPS TEST

## 📞 Résumé de la Situation

Vous avez une application Gilbert fonctionnelle mais vous voulez :
1. **Migrer de SQLite vers PostgreSQL** pour la scalabilité
2. **Déployer sur votre VPS OVH** avec Docker
3. **Avoir une architecture robuste** et sécurisée

J'ai analysé vos tentatives précédentes et créé une solution complète qui corrige tous les problèmes rencontrés.

## 🎯 Ce qui a été Préparé

### ✅ **Fichiers de Configuration Créés**
- `docker-compose.production.yml` - Orchestration complète
- `backend/Dockerfile` - Image optimisée avec PostgreSQL
- `frontend/Dockerfile` - Build corrigé (problème Rollup résolu)
- `database/init.sql` - Initialisation PostgreSQL automatique
- `nginx/` - Configuration reverse proxy + SSL
- `deploy.sh` - Script de déploiement intelligent
- `env.production` - Variables d'environnement de production

### ✅ **Améliorations Majeures**
- **PostgreSQL** avec pool de connexions optimisé
- **Redis** pour le cache distribué
- **SSL automatique** avec Let's Encrypt
- **Nginx** optimisé pour la production
- **Monitoring** et health checks
- **Sauvegardes** automatiques
- **Scripts de migration** SQLite → PostgreSQL

## 🔧 Instructions Étape par Étape

### **Étape 1 : Connexion et Préparation**
```bash
# Connexion au VPS
ssh ubuntu@51.38.177.18

# Aller dans le répertoire du projet
cd ~/gilbert

# Pull des dernières modifications
git pull origin main
```

### **Étape 2 : Configuration des Variables**
```bash
# Copier le fichier d'environnement
cp env.production .env

# Éditer avec vos vraies clés API
nano .env
```

**Variables OBLIGATOIRES à modifier :**
```env
# VOS CLÉS API (obligatoires)
ASSEMBLYAI_API_KEY=votre_vraie_cle_assemblyai
MISTRAL_API_KEY=votre_vraie_cle_mistral

# SÉCURITÉ (recommandé)
POSTGRES_PASSWORD=votre_mot_de_passe_tres_securise
JWT_SECRET=votre_jwt_secret_tres_long_minimum_32_caracteres
```

### **Étape 3 : Lancement du Déploiement**
```bash
# Rendre le script exécutable
chmod +x deploy.sh

# Déploiement complet (10-15 minutes)
./deploy.sh
```

Le script va automatiquement :
1. ✅ Vérifier les prérequis
2. ✅ Sauvegarder les données existantes
3. ✅ Construire les images Docker
4. ✅ Démarrer PostgreSQL + Redis
5. ✅ Initialiser la base de données
6. ✅ Démarrer l'API + Frontend
7. ✅ Configurer Nginx + SSL
8. ✅ Tester tous les services

## 📊 Résultat Attendu

Après le déploiement, vous aurez :

### **🌐 URLs Fonctionnelles**
- **Application** : https://gilbert-assistant.ovh
- **API Docs** : https://gilbert-assistant.ovh/api/docs  
- **Health Check** : https://gilbert-assistant.ovh/api/health

### **🏗️ Architecture Robuste**
```
Internet → Nginx (SSL) → Frontend (React) + API (FastAPI) → PostgreSQL + Redis
```

### **🔒 Sécurité**
- Certificats SSL automatiques
- Headers de sécurité optimisés
- Base de données sécurisée
- Authentification JWT robuste

## 🛠️ Commandes de Maintenance

```bash
# Voir l'état des services
./deploy.sh status

# Voir les logs en temps réel
./deploy.sh logs

# Redémarrer un service
docker-compose -f docker-compose.production.yml restart api

# Sauvegarder les données
./deploy.sh backup

# Reconfigurer SSL
./deploy.sh ssl
```

## 🗄️ Migration des Données

Si vous avez des données SQLite existantes :

```bash
# 1. Copier votre app.db dans le dossier scripts/
cp /chemin/vers/votre/app.db scripts/

# 2. Installer les dépendances Python
pip install asyncpg sqlite3

# 3. Lancer la migration
cd scripts
python migrate_sqlite_to_postgres.py
```

## ⚠️ Points d'Attention

### **1. Clés API**
- **ASSEMBLYAI_API_KEY** : Obligatoire pour la transcription
- **MISTRAL_API_KEY** : Obligatoire pour les résumés

### **2. DNS**
- Vérifiez que `gilbert-assistant.ovh` pointe vers `51.38.177.18`
- Le SSL ne fonctionnera que si le DNS est correct

### **3. Ports**
- Ports 80, 443 doivent être ouverts sur votre VPS
- Ports 5432, 6379 pour PostgreSQL et Redis (internes)

## 🔍 Vérifications Post-Déploiement

```bash
# 1. Tous les conteneurs démarrés
docker-compose -f docker-compose.production.yml ps

# 2. API fonctionnelle
curl https://gilbert-assistant.ovh/api/health

# 3. Frontend accessible
curl -I https://gilbert-assistant.ovh

# 4. Base de données opérationnelle
docker exec gilbert-postgres pg_isready -U gilbert_user

# 5. SSL valide
curl -I https://gilbert-assistant.ovh | grep "HTTP"
```

## 🚨 Dépannage Rapide

### **Problème : Services ne démarrent pas**
```bash
./deploy.sh logs
docker system prune -f
./deploy.sh restart
```

### **Problème : SSL ne fonctionne pas**
```bash
# Vérifier le DNS
nslookup gilbert-assistant.ovh

# Reconfigurer SSL
./deploy.sh ssl
```

### **Problème : API inaccessible**
```bash
# Vérifier l'API directement
docker logs gilbert-api
curl http://localhost/api/health
```

## 🎉 Différences avec vos Tentatives Précédentes

### **✅ Problèmes Corrigés**
1. **Build Frontend** : Bug Rollup/npm résolu avec `--legacy-peer-deps`
2. **Configuration CORS** : Gestion propre sans conflit Pydantic
3. **Permissions Docker** : Script vérifie et guide la résolution
4. **PostgreSQL** : Configuration optimisée avec pool de connexions
5. **SSL** : Génération automatique et renouvellement
6. **Nginx** : Configuration robuste pour SPA React

### **🚀 Améliorations**
1. **Redis** : Cache distribué pour les performances
2. **Health Checks** : Surveillance automatique des services
3. **Sauvegardes** : Système de backup automatique
4. **Logs** : Logging centralisé et structuré
5. **Sécurité** : Headers optimisés, certificats automatiques

## 📞 Support

Si vous rencontrez des problèmes :

1. **Logs** : `./deploy.sh logs` pour voir les erreurs
2. **État** : `./deploy.sh status` pour vérifier les services
3. **Restart** : `./deploy.sh restart` pour redémarrer
4. **Clean** : `docker system prune -f` pour nettoyer

## 🎯 Prochaines Étapes

Après le déploiement réussi :

1. **Testez l'application** avec vos comptes utilisateurs
2. **Configurez les sauvegardes** automatiques
3. **Surveillez les performances** via les logs
4. **Planifiez la scalabilité** si nécessaire

---

**Êtes-vous prêt à lancer le déploiement ? Commencez par l'Étape 1 ! 🚀**
