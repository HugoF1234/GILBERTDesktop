# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances (correction du bug npm)
RUN npm install --legacy-peer-deps

# Copier le code source
COPY . .

# Build de l'application avec variable d'environnement
ARG VITE_API_BASE_URL=https://gilbert-assistant.ovh
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# Production stage
FROM nginx:alpine

# Supprimer la configuration par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier le build de React
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la configuration Nginx pour SPA
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]
