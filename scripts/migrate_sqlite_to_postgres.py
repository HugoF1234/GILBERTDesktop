#!/usr/bin/env python3
"""
Script de migration SQLite vers PostgreSQL pour Gilbert
Migre toutes les données utilisateurs, meetings, clients et speakers
"""

import sqlite3
import asyncpg
import asyncio
import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Configuration
SQLITE_DB_PATH = "app.db"  # Chemin vers votre base SQLite
POSTGRES_URL = "postgresql://gilbert_user:gilbert_secure_password_2025@localhost:5432/gilbert_db"

async def migrate_data():
    """Migration complète des données SQLite vers PostgreSQL"""
    
    print("🔄 Début de la migration SQLite → PostgreSQL")
    
    # Vérifier que la base SQLite existe
    if not os.path.exists(SQLITE_DB_PATH):
        print(f"❌ Base de données SQLite non trouvée: {SQLITE_DB_PATH}")
        return False
    
    # Connexion SQLite
    sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    
    try:
        # Connexion PostgreSQL
        pg_conn = await asyncpg.connect(POSTGRES_URL)
        
        print("✅ Connexions établies")
        
        # Migration des utilisateurs
        await migrate_users(sqlite_conn, pg_conn)
        
        # Migration des clients
        await migrate_clients(sqlite_conn, pg_conn)
        
        # Migration des meetings
        await migrate_meetings(sqlite_conn, pg_conn)
        
        # Migration des speakers
        await migrate_speakers(sqlite_conn, pg_conn)
        
        print("✅ Migration terminée avec succès!")
        return True
        
    except Exception as e:
        print(f"❌ Erreur lors de la migration: {e}")
        return False
    finally:
        sqlite_conn.close()
        if 'pg_conn' in locals():
            await pg_conn.close()

async def migrate_users(sqlite_conn, pg_conn):
    """Migrer la table users"""
    print("📊 Migration des utilisateurs...")
    
    cursor = sqlite_conn.cursor()
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    
    migrated = 0
    for user in users:
        try:
            # Convertir les dates
            created_at = datetime.fromisoformat(user['created_at']) if user['created_at'] else datetime.utcnow()
            
            await pg_conn.execute("""
                INSERT INTO users (id, email, hashed_password, full_name, 
                                 profile_picture_url, oauth_provider, oauth_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (email) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    profile_picture_url = EXCLUDED.profile_picture_url,
                    oauth_provider = EXCLUDED.oauth_provider,
                    oauth_id = EXCLUDED.oauth_id
            """, 
                user['id'],
                user['email'],
                user['hashed_password'],
                user['full_name'],
                user['profile_picture_url'],
                user['oauth_provider'],
                user['oauth_id'],
                created_at
            )
            migrated += 1
        except Exception as e:
            print(f"   ⚠️  Erreur utilisateur {user['email']}: {e}")
    
    print(f"   ✅ {migrated} utilisateurs migrés")

async def migrate_clients(sqlite_conn, pg_conn):
    """Migrer la table clients"""
    print("📊 Migration des clients...")
    
    cursor = sqlite_conn.cursor()
    
    # Vérifier si la table clients existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'")
    if not cursor.fetchone():
        print("   ℹ️  Table clients n'existe pas dans SQLite")
        return
    
    cursor.execute("SELECT * FROM clients")
    clients = cursor.fetchall()
    
    migrated = 0
    for client in clients:
        try:
            created_at = datetime.fromisoformat(client['created_at']) if client['created_at'] else datetime.utcnow()
            
            await pg_conn.execute("""
                INSERT INTO clients (id, user_id, name, summary_template, created_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    summary_template = EXCLUDED.summary_template
            """,
                client['id'],
                client['user_id'],
                client['name'],
                client['summary_template'],
                created_at
            )
            migrated += 1
        except Exception as e:
            print(f"   ⚠️  Erreur client {client['name']}: {e}")
    
    print(f"   ✅ {migrated} clients migrés")

async def migrate_meetings(sqlite_conn, pg_conn):
    """Migrer la table meetings"""
    print("📊 Migration des meetings...")
    
    cursor = sqlite_conn.cursor()
    cursor.execute("SELECT * FROM meetings")
    meetings = cursor.fetchall()
    
    migrated = 0
    for meeting in meetings:
        try:
            created_at = datetime.fromisoformat(meeting['created_at']) if meeting['created_at'] else datetime.utcnow()
            
            await pg_conn.execute("""
                INSERT INTO meetings (id, user_id, client_id, title, file_url, 
                                    transcript_text, transcript_status, summary_text, 
                                    summary_status, duration_seconds, speakers_count, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    transcript_text = EXCLUDED.transcript_text,
                    transcript_status = EXCLUDED.transcript_status,
                    summary_text = EXCLUDED.summary_text,
                    summary_status = EXCLUDED.summary_status,
                    duration_seconds = EXCLUDED.duration_seconds,
                    speakers_count = EXCLUDED.speakers_count
            """,
                meeting['id'],
                meeting['user_id'],
                meeting.get('client_id'),  # Peut être NULL
                meeting['title'],
                meeting['file_url'],
                meeting['transcript_text'],
                meeting['transcript_status'],
                meeting.get('summary_text'),
                meeting.get('summary_status'),
                meeting.get('duration_seconds'),
                meeting.get('speakers_count'),
                created_at
            )
            migrated += 1
        except Exception as e:
            print(f"   ⚠️  Erreur meeting {meeting['title']}: {e}")
    
    print(f"   ✅ {migrated} meetings migrés")

async def migrate_speakers(sqlite_conn, pg_conn):
    """Migrer la table meeting_speakers"""
    print("📊 Migration des speakers...")
    
    cursor = sqlite_conn.cursor()
    
    # Vérifier si la table meeting_speakers existe
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_speakers'")
    if not cursor.fetchone():
        print("   ℹ️  Table meeting_speakers n'existe pas dans SQLite")
        return
    
    cursor.execute("SELECT * FROM meeting_speakers")
    speakers = cursor.fetchall()
    
    migrated = 0
    for speaker in speakers:
        try:
            created_at = datetime.fromisoformat(speaker['created_at']) if speaker['created_at'] else datetime.utcnow()
            
            await pg_conn.execute("""
                INSERT INTO meeting_speakers (id, meeting_id, speaker_id, custom_name, created_at)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (meeting_id, speaker_id) DO UPDATE SET
                    custom_name = EXCLUDED.custom_name
            """,
                speaker['id'],
                speaker['meeting_id'],
                speaker['speaker_id'],
                speaker['custom_name'],
                created_at
            )
            migrated += 1
        except Exception as e:
            print(f"   ⚠️  Erreur speaker {speaker['custom_name']}: {e}")
    
    print(f"   ✅ {migrated} speakers migrés")

async def create_backup():
    """Créer une sauvegarde de la base SQLite"""
    if os.path.exists(SQLITE_DB_PATH):
        backup_path = f"{SQLITE_DB_PATH}.backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        import shutil
        shutil.copy2(SQLITE_DB_PATH, backup_path)
        print(f"💾 Sauvegarde créée: {backup_path}")
        return backup_path
    return None

async def verify_migration():
    """Vérifier que la migration s'est bien passée"""
    print("🔍 Vérification de la migration...")
    
    sqlite_conn = sqlite3.connect(SQLITE_DB_PATH)
    pg_conn = await asyncpg.connect(POSTGRES_URL)
    
    try:
        # Compter les enregistrements
        tables = ['users', 'meetings']
        
        for table in tables:
            sqlite_count = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            pg_count = await pg_conn.fetchval(f"SELECT COUNT(*) FROM {table}")
            
            if sqlite_count == pg_count:
                print(f"   ✅ {table}: {sqlite_count} enregistrements")
            else:
                print(f"   ⚠️  {table}: SQLite={sqlite_count}, PostgreSQL={pg_count}")
    
    except Exception as e:
        print(f"   ❌ Erreur de vérification: {e}")
    finally:
        sqlite_conn.close()
        await pg_conn.close()

def main():
    """Fonction principale"""
    print("🚀 Migration SQLite vers PostgreSQL pour Gilbert")
    print("=" * 50)
    
    # Vérifications préalables
    if not os.path.exists(SQLITE_DB_PATH):
        print(f"❌ Base de données SQLite non trouvée: {SQLITE_DB_PATH}")
        print("   Placez votre fichier app.db dans le répertoire courant")
        sys.exit(1)
    
    # Demander confirmation
    response = input("Voulez-vous continuer la migration? (oui/non): ")
    if response.lower() not in ['oui', 'o', 'yes', 'y']:
        print("Migration annulée")
        sys.exit(0)
    
    # Exécuter la migration
    loop = asyncio.get_event_loop()
    
    # Créer une sauvegarde
    loop.run_until_complete(create_backup())
    
    # Lancer la migration
    success = loop.run_until_complete(migrate_data())
    
    if success:
        # Vérifier la migration
        loop.run_until_complete(verify_migration())
        print("\n🎉 Migration terminée avec succès!")
        print("   Vous pouvez maintenant démarrer votre application avec PostgreSQL")
    else:
        print("\n❌ Migration échouée")
        print("   Vérifiez les logs d'erreur ci-dessus")
        sys.exit(1)

if __name__ == "__main__":
    main()