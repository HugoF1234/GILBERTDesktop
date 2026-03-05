/**
 * Service de stockage local des enregistrements audio via IndexedDB
 * Permet de sauvegarder les enregistrements localement pour éviter toute perte de données
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { logger } from '@/utils/logger';

interface RecordingDB extends DBSchema {
  recordings: {
    key: string; // UUID de l'enregistrement
    value: {
      uuid: string;
      audioBlob: Blob;
      metadata: {
        title: string;
        duration: number;
        createdAt: number; // timestamp
        mimeType: string;
        fileSize: number;
      };
      uploadStatus: 'pending' | 'uploading' | 'completed' | 'failed' | 'user_saved';
      uploadAttempts: number;
      lastUploadAttempt?: number;
      meetingId?: string; // ID serveur une fois uploadé
      recoveryReason?: 'offline' | 'crash' | 'user_choice' | 'error'; // Raison de la sauvegarde locale
    };
    indexes: { 'by-status': string; 'by-date': number };
  };
  chunks: {
    key: string; // `${recordingUuid}_${chunkIndex}`
    value: {
      recordingUuid: string;
      chunkIndex: number;
      blob: Blob;
      uploadStatus: 'pending' | 'completed';
    };
  };
}

class RecordingStorageService {
  private db: IDBPDatabase<RecordingDB> | null = null;
  private readonly DB_NAME = 'GilbertRecordings';
  private readonly DB_VERSION = 1;

  /**
   * Initialise la base de données IndexedDB
   */
  async init(): Promise<void> {
    try {
      this.db = await openDB<RecordingDB>(this.DB_NAME, this.DB_VERSION, {
        upgrade(db) {
          // Store pour les enregistrements complets
          if (!db.objectStoreNames.contains('recordings')) {
            const recordingsStore = db.createObjectStore('recordings', { keyPath: 'uuid' });
            recordingsStore.createIndex('by-status', 'uploadStatus');
            recordingsStore.createIndex('by-date', 'metadata.createdAt');
          }

          // Store pour les chunks (optionnel, pour upload progressif)
          if (!db.objectStoreNames.contains('chunks')) {
            const chunksStore = db.createObjectStore('chunks', { keyPath: 'key' });
            chunksStore.createIndex('by-recording', 'recordingUuid');
          }
        },
      });
      logger.debug('✅ IndexedDB initialisée avec succès');
    } catch (error) {
      logger.error('❌ Erreur initialisation IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Génère un UUID unique pour identifier un enregistrement
   */
  generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Sauvegarde un nouvel enregistrement dans IndexedDB
   * ✅ CORRECTION : Fusionne les métadonnées existantes au lieu de les écraser
   */
  async saveRecording(params: {
    uuid: string;
    audioBlob: Blob;
    title: string;
    duration: number;
    mimeType: string;
  }): Promise<void> {
    if (!this.db) await this.init();

    // ✅ CORRECTION : Vérifier si l'enregistrement existe déjà
    const existingRecording = await this.db.get('recordings', params.uuid);
    
    if (existingRecording) {
      // L'enregistrement existe déjà - mettre à jour seulement le blob et les métadonnées nécessaires
      // PRÉSERVER le statut, recoveryReason, uploadAttempts, etc.
      existingRecording.audioBlob = params.audioBlob;
      existingRecording.metadata.fileSize = params.audioBlob.size;
      existingRecording.metadata.duration = params.duration;
      existingRecording.metadata.mimeType = params.mimeType;
      
      // Ne mettre à jour le titre que s'il n'est pas "Enregistrement sans titre" ou si l'existant est "Enregistrement sans titre"
      if (params.title !== 'Enregistrement sans titre' || existingRecording.metadata.title === 'Enregistrement sans titre') {
        existingRecording.metadata.title = params.title;
      }
      
      await this.db.put('recordings', existingRecording);
      logger.debug(`✅ Enregistrement ${params.uuid} mis à jour (blob et métadonnées, statut préservé: ${existingRecording.uploadStatus})`);
    } else {
      // Nouvel enregistrement - créer normalement
      const recording = {
        uuid: params.uuid,
        audioBlob: params.audioBlob,
        metadata: {
          title: params.title,
          duration: params.duration,
          createdAt: Date.now(),
          mimeType: params.mimeType,
          fileSize: params.audioBlob.size,
        },
        uploadStatus: 'pending' as const,
        uploadAttempts: 0,
        recoveryReason: undefined as 'offline' | 'crash' | 'user_choice' | 'error' | undefined,
      };

      await this.db.put('recordings', recording);
      logger.debug(`✅ Enregistrement ${params.uuid} sauvegardé localement (${Math.round(params.audioBlob.size / 1024 / 1024)}MB)`);
    }
  }

  /**
   * Récupère un enregistrement par son UUID
   */
  async getRecording(uuid: string) {
    if (!this.db) await this.init();
    return await this.db!.get('recordings', uuid);
  }

  /**
   * Récupère tous les enregistrements non uploadés qui nécessitent une récupération
   * Exclut les enregistrements où l'utilisateur a choisi de fermer sans uploader
   * ✅ SOLUTION CRASH : Reconstruit le blob à partir des chunks si nécessaire
   */
  async getPendingRecordings() {
    if (!this.db) await this.init();
    const allRecordings = await this.db!.getAll('recordings');

    // Filtrer : uniquement ceux qui ont échoué (upload) ou un problème (connexion, crash, erreur)
    // Exclure les "terminés OK" et le choix utilisateur de ne pas uploader
    const RECOVERY_REASONS = ['offline', 'error', 'crash'] as const;
    const pendingRecordings = allRecordings.filter(
      (r) => {
        if (r.recoveryReason === 'user_choice') return false;
        if (r.uploadStatus === 'failed') return true;
        if (r.uploadStatus === 'pending' && r.recoveryReason && RECOVERY_REASONS.includes(r.recoveryReason)) return true;
        return false;
      }
    );

    // ✅ SOLUTION CRASH : Pour chaque recording, vérifier si on doit reconstruire depuis les chunks
    for (const recording of pendingRecordings) {
      // Si le blob est vide ou très petit (< 1KB), essayer de reconstruire depuis les chunks
      if (!recording.audioBlob || recording.audioBlob.size < 1024) {
        try {
          const chunks = await this.getChunks(recording.uuid);
          if (chunks.length > 0) {
            logger.debug(`🔧 Reconstruction du blob pour ${recording.uuid} depuis ${chunks.length} chunk(s)`);
            const reconstructedBlob = new Blob(chunks, { type: recording.metadata.mimeType || 'audio/webm' });

            // Mettre à jour l'enregistrement avec le blob reconstruit
            recording.audioBlob = reconstructedBlob;
            recording.metadata.fileSize = reconstructedBlob.size;

            // Estimer la durée si non définie (approximation: chunks de 1 seconde)
            if (recording.metadata.duration === 0) {
              recording.metadata.duration = chunks.length;
            }

            // Sauvegarder la mise à jour dans IndexedDB
            await this.db!.put('recordings', recording);
            logger.debug(`✅ Blob reconstruit: ${Math.round(reconstructedBlob.size / 1024)}KB, ~${recording.metadata.duration}s`);
          }
        } catch (error) {
          logger.warn(`⚠️ Erreur reconstruction blob pour ${recording.uuid}:`, error);
        }
      }
    }

    // Filtrer les enregistrements avec un blob valide (> 1KB = ~1 seconde audio min)
    return pendingRecordings.filter(r => r.audioBlob && r.audioBlob.size > 1024);
  }

  /**
   * Met à jour le statut d'upload d'un enregistrement
   */
  async updateUploadStatus(
    uuid: string,
    status: 'pending' | 'uploading' | 'completed' | 'failed' | 'user_saved',
    meetingId?: string,
    recoveryReason?: 'offline' | 'crash' | 'user_choice' | 'error'
  ): Promise<void> {
    if (!this.db) await this.init();
    
    const recording = await this.db!.get('recordings', uuid);
    if (!recording) {
      logger.error(`Enregistrement ${uuid} introuvable`);
      return;
    }

    recording.uploadStatus = status;
    recording.uploadAttempts += 1;
    recording.lastUploadAttempt = Date.now();
    
    if (meetingId) {
      recording.meetingId = meetingId;
    }
    
    if (recoveryReason) {
      recording.recoveryReason = recoveryReason;
    }

    await this.db!.put('recordings', recording);
    logger.debug(`📝 Statut enregistrement ${uuid} mis à jour: ${status}${recoveryReason ? ` (${recoveryReason})` : ''}`);
  }

  /**
   * Met à jour les métadonnées (titre, durée) d'un enregistrement
   */
  async updateRecordingMetadata(
    uuid: string,
    title?: string,
    duration?: number
  ): Promise<void> {
    if (!this.db) await this.init();
    
    const recording = await this.db!.get('recordings', uuid);
    if (!recording) {
      logger.error(`Enregistrement ${uuid} introuvable`);
      return;
    }

    if (title) {
      recording.metadata.title = title;
    }
    if (duration !== undefined) {
      recording.metadata.duration = duration;
    }

    await this.db!.put('recordings', recording);
    logger.debug(`📝 Métadonnées enregistrement ${uuid} mises à jour`);
  }

  /**
   * Supprime un enregistrement de IndexedDB (une fois uploadé avec succès)
   * ✅ CORRECTION : Supprime aussi les chunks associés
   */
  async deleteRecording(uuid: string): Promise<void> {
    if (!this.db) await this.init();

    // Supprimer l'enregistrement principal
    await this.db!.delete('recordings', uuid);

    // ✅ CORRECTION : Supprimer aussi les chunks associés
    try {
      await this.deleteChunks(uuid);
    } catch (error) {
      logger.warn(`⚠️ Erreur suppression chunks pour ${uuid}:`, error);
    }

    logger.debug(`🗑️ Enregistrement ${uuid} et ses chunks supprimés de IndexedDB`);
  }

  /**
   * Nettoie les vieux enregistrements (> 7 jours et uploadés avec succès)
   */
  async cleanupOldRecordings(): Promise<void> {
    if (!this.db) await this.init();
    
    const allRecordings = await this.db!.getAll('recordings');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const recording of allRecordings) {
      if (
        recording.uploadStatus === 'completed' &&
        recording.metadata.createdAt < sevenDaysAgo
      ) {
        await this.deleteRecording(recording.uuid);
      }
    }

    logger.debug('🧹 Nettoyage des anciens enregistrements terminé');
  }

  /**
   * Obtient la taille totale utilisée dans IndexedDB
   */
  async getStorageSize(): Promise<{ totalSizeMB: number; recordingsCount: number }> {
    if (!this.db) await this.init();
    
    const recordings = await this.db!.getAll('recordings');
    const totalSize = recordings.reduce((sum, r) => sum + r.metadata.fileSize, 0);

    return {
      totalSizeMB: Math.round((totalSize / 1024 / 1024) * 100) / 100,
      recordingsCount: recordings.length,
    };
  }

  /**
   * Sauvegarde un chunk audio dans IndexedDB (pour sauvegarde progressive)
   * OPTIMISÉ : Utilise une transaction pour éviter les blocages
   */
  async saveChunk(recordingUuid: string, chunkIndex: number, blob: Blob): Promise<void> {
    if (!this.db) await this.init();
    
    try {
      const chunkKey = `${recordingUuid}_${chunkIndex}`;
      const chunk = {
        key: chunkKey,
        recordingUuid,
        chunkIndex,
        blob,
        uploadStatus: 'pending' as const,
      };
      
      // Utiliser une transaction pour éviter les blocages
      const tx = this.db!.transaction('chunks', 'readwrite');
      await tx.store.put(chunk);
      await tx.done; // Attendre la fin de la transaction
      
      // Log seulement tous les 10 chunks pour éviter le spam
      if (chunkIndex % 10 === 0) {
        logger.debug(`💾 Chunk ${chunkIndex} sauvegardé (batch) pour l'enregistrement ${recordingUuid}`);
      }
    } catch (error) {
      logger.error(`❌ Erreur sauvegarde chunk ${chunkIndex}:`, error);
      throw error; // Propager l'erreur pour retry
    }
  }
  
  /**
   * Sauvegarde plusieurs chunks en batch (plus efficace)
   */
  async saveChunksBatch(recordingUuid: string, chunks: Array<{ index: number; blob: Blob }>): Promise<void> {
    if (!this.db) await this.init();
    if (chunks.length === 0) return;
    
    try {
      const tx = this.db!.transaction('chunks', 'readwrite');
      
      // Sauvegarder tous les chunks dans la même transaction
      await Promise.all(
        chunks.map(({ index, blob }) => {
          const chunkKey = `${recordingUuid}_${index}`;
          const chunk = {
            key: chunkKey,
            recordingUuid,
            chunkIndex: index,
            blob,
            uploadStatus: 'pending' as const,
          };
          return tx.store.put(chunk);
        })
      );
      
      await tx.done;
      logger.debug(`💾 ${chunks.length} chunk(s) sauvegardé(s) en batch pour l'enregistrement ${recordingUuid}`);
    } catch (error) {
      const isQuota = error instanceof Error && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      if (isQuota) {
        logger.error(`❌ IndexedDB quota dépassée - les chunks restent en mémoire. Fermer l'onglet peut entraîner une perte.`);
      } else {
        logger.error(`❌ Erreur sauvegarde batch (${chunks.length} chunks):`, error);
      }
      throw error;
    }
  }

  /**
   * Récupère tous les chunks d'un enregistrement
   */
  async getChunks(recordingUuid: string): Promise<Blob[]> {
    if (!this.db) await this.init();
    
    const index = this.db!.transaction('chunks').store.index('by-recording');
    const chunks = await index.getAll(recordingUuid);
    
    // Trier par chunkIndex pour reconstruire dans le bon ordre
    chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    return chunks.map(c => c.blob);
  }

  /**
   * Supprime tous les chunks d'un enregistrement
   */
  async deleteChunks(recordingUuid: string): Promise<void> {
    if (!this.db) await this.init();
    
    const index = this.db!.transaction('chunks').store.index('by-recording');
    const chunks = await index.getAll(recordingUuid);
    
    for (const chunk of chunks) {
      await this.db!.delete('chunks', chunk.key);
    }
    
    logger.debug(`🗑️ ${chunks.length} chunk(s) supprimé(s) pour l'enregistrement ${recordingUuid}`);
  }

  /**
   * Reconstruit un blob audio à partir des chunks sauvegardés
   */
  async reconstructRecordingFromChunks(recordingUuid: string, mimeType: string): Promise<Blob> {
    const chunks = await this.getChunks(recordingUuid);
    if (chunks.length === 0) {
      throw new Error(`Aucun chunk trouvé pour l'enregistrement ${recordingUuid}`);
    }
    
    return new Blob(chunks, { type: mimeType });
  }

  /**
   * Exporte un enregistrement localement (téléchargement)
   */
  async exportRecordingLocally(uuid: string): Promise<void> {
    if (!this.db) await this.init();
    
    const recording = await this.db!.get('recordings', uuid);
    if (!recording) {
      throw new Error(`Enregistrement ${uuid} introuvable`);
    }

    // Déterminer l'extension correcte à partir du MIME type
    let extension = 'webm'; // Défaut
    const mimeType = recording.metadata.mimeType;
    
    if (mimeType.includes('wav')) {
      extension = 'wav';
    } else if (mimeType.includes('mp3')) {
      extension = 'mp3';
    } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
      extension = 'm4a';
    } else if (mimeType.includes('ogg')) {
      extension = 'ogg';
    } else if (mimeType.includes('webm')) {
      extension = 'webm';
    }

    // Nettoyer le titre (enlever caractères spéciaux)
    const cleanTitle = recording.metadata.title.replace(/[^a-z0-9]/gi, '_');
    const timestamp = new Date(recording.metadata.createdAt).toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Créer un nom de fichier propre
    const filename = `${cleanTitle}_${timestamp}.${extension}`;

    // Créer un lien de téléchargement temporaire
    const url = URL.createObjectURL(recording.audioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    logger.debug(`📥 Enregistrement ${uuid} exporté localement sous ${filename}`);
  }
}

// Instance singleton
export const recordingStorage = new RecordingStorageService();

