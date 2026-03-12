-- Script d'initialisation PostgreSQL pour Gilbert
-- Ce script sera exécuté automatiquement au premier démarrage de PostgreSQL

-- Extensions utiles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Création des tables
-- Table users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT,
    full_name VARCHAR(255),
    profile_picture_url TEXT,
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les utilisateurs
CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_user_oauth ON users(oauth_provider, oauth_id);

-- Table clients
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    summary_template TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les clients
CREATE INDEX IF NOT EXISTS idx_client_user ON clients(user_id);

-- Table meetings
CREATE TABLE IF NOT EXISTS meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    transcript_text TEXT,
    transcript_status VARCHAR(50) DEFAULT 'pending',
    summary_text TEXT,
    summary_status VARCHAR(50) DEFAULT NULL,
    duration_seconds INTEGER,
    speakers_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour les meetings
CREATE INDEX IF NOT EXISTS idx_meeting_user ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_client ON meetings(client_id);
CREATE INDEX IF NOT EXISTS idx_meeting_status ON meetings(transcript_status);

-- Table meeting_speakers pour les noms personnalisés des locuteurs
CREATE TABLE IF NOT EXISTS meeting_speakers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    speaker_id VARCHAR(50) NOT NULL,
    custom_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(meeting_id, speaker_id)
);

-- Index pour les speakers
CREATE INDEX IF NOT EXISTS idx_speaker_meeting ON meeting_speakers(meeting_id);

-- Utilisateur test par défaut (mot de passe: test123)
-- Hash bcrypt pour 'test123': $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukD4i4IVe
INSERT INTO users (id, email, hashed_password, full_name, oauth_provider, oauth_id, created_at) 
VALUES (
    uuid_generate_v4(),
    'test@example.com',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukD4i4IVe',
    'Utilisateur Test',
    NULL,
    NULL,
    NOW()
) ON CONFLICT (email) DO NOTHING;

-- Client test par défaut
INSERT INTO clients (id, user_id, name, summary_template, created_at)
SELECT 
    uuid_generate_v4(),
    u.id,
    'Client Test',
    'Résumé par défaut pour {{client_name}}',
    NOW()
FROM users u 
WHERE u.email = 'test@example.com'
ON CONFLICT DO NOTHING;

-- Configuration PostgreSQL optimisée
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET effective_io_concurrency = 200;

-- Recharger la configuration
SELECT pg_reload_conf();