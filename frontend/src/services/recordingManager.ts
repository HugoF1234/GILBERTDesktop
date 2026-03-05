/**
 * Service singleton pour gérer l'enregistrement audio
 * Persiste l'état de l'enregistrement même quand les composants se démontent
 */

import { recordingStorage } from './recordingStorage';
import { wakeLockService } from './wakeLockService';
import { logger } from '@/utils/logger';

// Import du store pour mise à jour globale (évite les problèmes de callback lors de la navigation)
let recordingStore: any = null;

// Fonction pour enregistrer le store (appelée depuis le store lui-même)
export function setRecordingStore(store: any): void {
  recordingStore = store;
}

type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

interface RecordingData {
  uuid: string;
  audioBlob?: Blob;
  mimeType: string;
  duration: number;
  title: string;
}

class RecordingManagerService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private state: RecordingState = 'idle';
  private currentRecordingUuid: string | null = null;
  private duration: number = 0;
  private startTime: number = 0;
  private pendingChunks: Array<{ index: number; blob: Blob }> = [];
  private saveTimeout: NodeJS.Timeout | null = null;
  private chunkIndex: number = 0;
  private title: string = 'Enregistrement sans titre'; // ✅ SOLUTION 3 : Stocker le titre pour l'utiliser lors de la sauvegarde
  
  // Callbacks pour mettre à jour l'UI
  private onDurationUpdateCallback?: (duration: number) => void;
  private onStateChangeCallback?: (state: RecordingState) => void;
  private onRecordingCompleteCallback?: (audioBlob: Blob, mimeType: string, duration: number) => void;

  /**
   * ✅ SOLUTION 3 : Définir le titre de l'enregistrement
   */
  setTitle(title: string): void {
    this.title = title.trim() || 'Enregistrement sans titre';
    logger.debug(`📝 Titre défini dans recordingManager: "${this.title}"`);
  }

  /**
   * Récupère le titre actuel de l'enregistrement
   */
  getTitle(): string {
    return this.title;
  }

  /**
   * Démarre un nouvel enregistrement
   */
  async startRecording(callbacks?: {
    stream?: MediaStream; // Stream optionnel pour réutiliser un stream existant
    onDurationUpdate?: (duration: number) => void;
    onStateChange?: (state: RecordingState) => void;
    onRecordingComplete?: (audioBlob: Blob, mimeType: string, duration: number) => void;
  }): Promise<{ success: boolean; error?: string }> {
    if (this.state === 'recording') {
      return { success: false, error: 'Un enregistrement est déjà en cours' };
    }

    try {
      // Sauvegarder les callbacks
      this.onDurationUpdateCallback = callbacks?.onDurationUpdate;
      this.onStateChangeCallback = callbacks?.onStateChange;
      this.onRecordingCompleteCallback = callbacks?.onRecordingComplete;

      // Générer UUID
      this.currentRecordingUuid = recordingStorage.generateUUID();
      logger.debug(`🆔 UUID enregistrement: ${this.currentRecordingUuid}`);

      // ✅ SOLUTION CRASH : Créer une entrée préliminaire IMMÉDIATEMENT
      // Si un crash survient avant onstop, cette entrée permettra la récupération
      // Le status 'pending' avec recoveryReason 'crash' sera écrasé si l'enregistrement
      // se termine normalement (user_saved, completed, ou supprimé)
      try {
        await recordingStorage.saveRecording({
          uuid: this.currentRecordingUuid,
          audioBlob: new Blob([], { type: 'audio/webm' }), // Blob vide initial
          title: this.title,
          duration: 0,
          mimeType: 'audio/webm',
        });
        // Marquer immédiatement comme 'pending' avec raison 'crash' (par défaut)
        // Si l'enregistrement se termine normalement, ce sera écrasé
        await recordingStorage.updateUploadStatus(this.currentRecordingUuid, 'pending', undefined, 'crash');
        logger.debug('✅ Entrée préliminaire créée pour protection crash');
      } catch (error) {
        logger.warn('⚠️ Erreur création entrée préliminaire (non bloquant):', error);
      }

      // Activer Wake Lock
      await wakeLockService.acquire();

      // NOTE: Connection Monitor est géré par ImmersiveRecordingPage
      // Ne pas le démarrer ici pour éviter les conflits

      // Utiliser le stream fourni ou demander l'accès au microphone
      if (callbacks?.stream) {
        // Réutiliser le stream existant (évite de demander l'accès deux fois)
        // Utiliser directement le stream sans cloner car MediaRecorder peut partager le stream
        this.stream = callbacks.stream;
        logger.debug('🎙️ Réutilisation du stream audio existant');
      } else {
        // Demander accès au microphone si aucun stream n'est fourni
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 44100,
          },
        });
      }

      // Déterminer le MIME type supporté
      const mimeTypes = [
        'audio/wav',
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ];

      let mimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          break;
        }
      }

      logger.debug('🎙️ MIME type utilisé:', mimeType || 'défaut navigateur');

      // Créer MediaRecorder
      const recorderOptions = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : {};
      this.mediaRecorder = new MediaRecorder(this.stream, recorderOptions);
      this.audioChunks = [];

      // Handler pour les chunks audio - SAUVEGARDE OPTIMISÉE (batch + debounce)
      this.chunkIndex = 0;
      this.pendingChunks = [];
      if (this.saveTimeout) clearTimeout(this.saveTimeout);
      
      // Fonction pour sauvegarder les chunks en batch (toutes les 3 secondes ou si > 5 chunks)
      const saveChunksBatch = async () => {
        if (this.pendingChunks.length === 0 || !this.currentRecordingUuid) return;
        
        const chunksToSave = [...this.pendingChunks];
        this.pendingChunks = [];
        
        try {
          // Utiliser la méthode batch optimisée
          await recordingStorage.saveChunksBatch(this.currentRecordingUuid, chunksToSave);
          logger.debug(`💾 ${chunksToSave.length} chunk(s) sauvegardé(s) en batch`);
        } catch (error) {
          logger.error('❌ Erreur sauvegarde batch:', error);
          // Réajouter tous les chunks pour retry
          this.pendingChunks.push(...chunksToSave);
        }
      };
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          // Log seulement tous les 10 chunks pour éviter le spam
          if (this.chunkIndex % 10 === 0) {
            logger.debug(`📦 Chunk audio ${this.chunkIndex}: ${Math.round(event.data.size / 1024)} KB`);
          }
          
          // Ajouter au batch de sauvegarde (non-bloquant)
          if (this.currentRecordingUuid) {
            this.pendingChunks.push({ index: this.chunkIndex, blob: event.data });
            this.chunkIndex++;
            
            // Sauvegarder immédiatement si >= 5 chunks (évite accumulation)
            if (this.pendingChunks.length >= 5) {
              if (this.saveTimeout) clearTimeout(this.saveTimeout);
              saveChunksBatch(); // Non-bloquant (fire and forget)
            } else {
              // Debounce 2s pour limiter la perte en cas de fermeture brutale (tab/crash)
              if (this.saveTimeout) clearTimeout(this.saveTimeout);
              this.saveTimeout = setTimeout(saveChunksBatch, 2000);
            }
          }
        }
      };

      // Handler pour la fin de l'enregistrement
      this.mediaRecorder.onstop = async () => {
        logger.debug('🛑 Enregistrement arrêté');
        
        const finalMimeType = this.mediaRecorder?.mimeType || mimeType || 'audio/webm';
        
        // ✅ SOLUTION 4 : Ne jamais return early, toujours sauvegarder même si blob vide
        let audioBlob: Blob | null = null;
        
        // Essayer de reconstruire depuis les chunks sauvegardés (plus fiable)
        if (this.currentRecordingUuid) {
          try {
            const savedChunks = await recordingStorage.getChunks(this.currentRecordingUuid);
            if (savedChunks.length > 0) {
              logger.debug(`🔄 Reconstruction depuis ${savedChunks.length} chunks sauvegardés...`);
              audioBlob = new Blob(savedChunks, { type: finalMimeType });
              logger.debug(`✅ Audio blob reconstruit depuis chunks: ${Math.round(audioBlob.size / 1024)} KB`);
            } else {
              // Fallback sur les chunks en mémoire
              if (this.audioChunks.length > 0) {
                audioBlob = new Blob(this.audioChunks, { type: finalMimeType });
                logger.debug(`✅ Audio blob créé depuis mémoire: ${Math.round(audioBlob.size / 1024)} KB`);
              } else {
                logger.warn('⚠️ Aucune donnée audio capturée, création d\'un blob vide pour traçabilité');
                audioBlob = new Blob([], { type: finalMimeType });
              }
            }
          } catch (error) {
            logger.warn('⚠️ Erreur reconstruction depuis chunks, utilisation mémoire:', error);
            // Fallback sur les chunks en mémoire
            if (this.audioChunks.length > 0) {
              audioBlob = new Blob(this.audioChunks, { type: finalMimeType });
              logger.debug(`✅ Audio blob créé depuis mémoire (fallback): ${Math.round(audioBlob.size / 1024)} KB`);
            } else {
              logger.warn('⚠️ Aucune donnée audio capturée, création d\'un blob vide pour traçabilité');
              audioBlob = new Blob([], { type: finalMimeType });
            }
          }
        } else {
          if (this.audioChunks.length > 0) {
            audioBlob = new Blob(this.audioChunks, { type: finalMimeType });
            logger.debug(`✅ Audio blob créé: ${Math.round(audioBlob.size / 1024)} KB`);
          } else {
            logger.warn('⚠️ Aucune donnée audio capturée, création d\'un blob vide pour traçabilité');
            audioBlob = new Blob([], { type: finalMimeType });
          }
        }
        
        // ✅ SOLUTION 4 : Toujours avoir un blob (même vide) pour continuer
        if (!audioBlob) {
          logger.error('❌ Impossible de créer un blob audio, création d\'un blob vide');
          audioBlob = new Blob([], { type: finalMimeType });
        }

        // ✅ SOLUTION 3 : Sauvegarder dans IndexedDB avec le titre stocké (pas hardcodé)
        // ✅ CORRECTION : saveRecording() fusionne maintenant les métadonnées existantes
        // Elle préserve le statut, recoveryReason, etc. si l'enregistrement existe déjà
        if (this.currentRecordingUuid && audioBlob) {
          // ✅ CORRECTION TITRE : Vérifier si un titre existe déjà dans IndexedDB (mis à jour via updateRecordingMetadata)
          let finalTitle = this.title;
          try {
            const existingRecording = await recordingStorage.getRecording(this.currentRecordingUuid);
            if (existingRecording?.metadata?.title && existingRecording.metadata.title !== 'Enregistrement sans titre') {
              finalTitle = existingRecording.metadata.title;
              logger.debug(`📝 Titre récupéré depuis IndexedDB: "${finalTitle}"`);
            }
          } catch (error) {
            logger.warn('⚠️ Erreur récupération titre depuis IndexedDB, utilisation du titre stocké:', error);
          }
          
          // ✅ saveRecording() préserve maintenant le statut et recoveryReason si l'enregistrement existe déjà
          await recordingStorage.saveRecording({
            uuid: this.currentRecordingUuid,
            audioBlob: audioBlob,
            title: finalTitle, // ✅ Utiliser le titre depuis IndexedDB si disponible, sinon celui stocké
            duration: this.duration,
            mimeType: finalMimeType,
          });
          
          // Nettoyer les chunks individuels après sauvegarde complète
          try {
            await recordingStorage.deleteChunks(this.currentRecordingUuid);
          } catch (error) {
            logger.warn('⚠️ Erreur nettoyage chunks:', error);
          }
        }

        // Callback pour l'UI
        if (this.onRecordingCompleteCallback) {
          this.onRecordingCompleteCallback(audioBlob, finalMimeType, this.duration);
        }

        // Nettoyage
        this.cleanup();
      };

      // Démarrer l'enregistrement avec capture optimisée (toutes les 1s - équilibre performance/sécurité)
      this.mediaRecorder.start(1000); // Capturer un chunk toutes les 1s (optimisé pour performance)
      this.state = 'recording';
      this.startTime = Date.now();
      this.duration = 0;

      // Démarrer le timer
      this.timerInterval = setInterval(() => {
        this.duration += 1;
        // Mettre à jour le callback spécifique (pour ImmersiveRecordingPage)
        if (this.onDurationUpdateCallback) {
          this.onDurationUpdateCallback(this.duration);
        }
        // Mettre à jour le store global directement (pour RecordingBanner et autres composants)
        if (recordingStore && recordingStore.setDuration) {
          recordingStore.setDuration(this.duration);
        }
      }, 1000);

      // Notifier le changement d'état
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback('recording');
      }

      logger.debug('✅ Enregistrement démarré');
      return { success: true };
    } catch (error) {
      logger.error('❌ Erreur démarrage enregistrement:', error);
      // Nettoyer sans appeler cleanup() complet pour éviter les erreurs d'initialisation
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      wakeLockService.release();
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.state = 'idle';
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Met en pause l'enregistrement en cours (peut être repris)
   */
  async pauseRecording(): Promise<void> {
    if (this.state !== 'recording' || !this.mediaRecorder) {
      logger.warn('⚠️ Aucun enregistrement en cours à mettre en pause');
      return;
    }

    logger.debug('⏸️ Mise en pause de l\'enregistrement...');

    // Vérifier si le MediaRecorder supporte pause/resume
    if (this.mediaRecorder.state === 'recording') {
      try {
        this.mediaRecorder.pause();
        this.state = 'paused';
        
        // Arrêter le timer pendant la pause
        if (this.timerInterval) {
          clearInterval(this.timerInterval);
          this.timerInterval = null;
        }

        // Notifier le changement d'état
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('paused');
        }
        // Mettre à jour le store global directement
        if (recordingStore && recordingStore.setState) {
          recordingStore.setState('paused');
        }

        logger.debug('✅ Enregistrement mis en pause');
      } catch (error) {
        logger.error('❌ Erreur lors de la pause:', error);
        // Si pause() n'est pas supporté, on arrête complètement
        logger.warn('⚠️ pause() non supporté, arrêt complet de l\'enregistrement');
        await this.finalizeRecording();
      }
    }
  }

  /**
   * Reprend l'enregistrement en pause
   */
  async resumeRecording(): Promise<void> {
    if (this.state !== 'paused' || !this.mediaRecorder) {
      logger.warn('⚠️ Aucun enregistrement en pause à reprendre');
      return;
    }

    logger.debug('▶️ Reprise de l\'enregistrement...');

    if (this.mediaRecorder.state === 'paused') {
      try {
        this.mediaRecorder.resume();
        this.state = 'recording';

        // Redémarrer le timer
        this.timerInterval = setInterval(() => {
          this.duration += 1;
          // Mettre à jour le callback spécifique (pour ImmersiveRecordingPage)
          if (this.onDurationUpdateCallback) {
            this.onDurationUpdateCallback(this.duration);
          }
          // Mettre à jour le store global directement (pour RecordingBanner et autres composants)
          if (recordingStore && recordingStore.setDuration) {
            recordingStore.setDuration(this.duration);
          }
        }, 1000);

        // Notifier le changement d'état
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('recording');
        }
        // Mettre à jour le store global directement
        if (recordingStore && recordingStore.setState) {
          recordingStore.setState('recording');
        }

        logger.debug('✅ Enregistrement repris');
      } catch (error) {
        logger.error('❌ Erreur lors de la reprise:', error);
        throw error;
      }
    }
  }

  /**
   * Finalise et arrête définitivement l'enregistrement (appelé lors de la sauvegarde)
   * Retourne une Promise qui se résout quand le blob est créé
   */
  async finalizeRecording(): Promise<Blob | null> {
    if ((this.state !== 'recording' && this.state !== 'paused') || !this.mediaRecorder) {
      logger.warn('⚠️ Aucun enregistrement en cours à finaliser');
      return null;
    }

    logger.debug('🛑 Finalisation de l\'enregistrement...');

    // Créer une Promise qui se résout quand le blob est créé
    return new Promise((resolve) => {
      // Sauvegarder temporairement le callback original
      const originalCallback = this.onRecordingCompleteCallback;
      
      // Créer un nouveau callback qui résout la Promise
      this.onRecordingCompleteCallback = (audioBlob: Blob, mimeType: string, duration: number) => {
        // Appeler le callback original si présent
        if (originalCallback) {
          originalCallback(audioBlob, mimeType, duration);
        }
        // Résoudre la Promise avec le blob
        resolve(audioBlob);
      };

      // Si en pause, reprendre brièvement pour capturer les derniers chunks
      if (this.state === 'paused' && this.mediaRecorder && this.mediaRecorder.state === 'paused') {
        try {
          this.mediaRecorder.resume();
          setTimeout(() => {
            // Forcer un dernier chunk
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
              this.mediaRecorder.requestData();
            }
            // Arrêter après un court délai
            setTimeout(() => {
              if (this.mediaRecorder) {
                this.mediaRecorder.stop();
                this.state = 'stopped';
              }
            }, 100);
          }, 100);
        } catch (error) {
          logger.warn('⚠️ Impossible de reprendre avant finalisation:', error);
          // Si erreur, arrêter directement
          if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.state = 'stopped';
          }
        }
      } else {
        // Forcer un dernier chunk
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.requestData();
        }
        // Arrêter après un court délai
        setTimeout(() => {
          if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.state = 'stopped';
          }
        }, 100);
      }
    });
  }

  /**
   * Arrête l'enregistrement en cours (alias pour pause - pour compatibilité)
   * @deprecated Utiliser pauseRecording() à la place
   */
  async stopRecording(): Promise<void> {
    logger.warn('⚠️ stopRecording() est déprécié, utilisation de pauseRecording()');
    await this.pauseRecording();
  }

  /**
   * Force la sauvegarde de tous les chunks en attente (appelé avant fermeture)
   */
  async flushPendingChunks(): Promise<void> {
    if (this.pendingChunks.length === 0 || !this.currentRecordingUuid) {
      return;
    }
    
    logger.debug(`🔄 Flush final de ${this.pendingChunks.length} chunk(s) en attente...`);
    
    try {
      // Sauvegarder tous les chunks restants en batch
      await recordingStorage.saveChunksBatch(
        this.currentRecordingUuid,
        this.pendingChunks
      );
      this.pendingChunks = [];
      logger.debug('✅ Flush terminé');
    } catch (error) {
      logger.error('❌ Erreur lors du flush final:', error);
    }
  }

  /**
   * Nettoyage des ressources
   */
  private cleanup(): void {
    // Arrêter le timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    // Nettoyer le timeout de sauvegarde batch
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    
    // Flush final des chunks en attente (non-bloquant)
    if (this.pendingChunks.length > 0 && this.currentRecordingUuid) {
      recordingStorage.saveChunksBatch(this.currentRecordingUuid, this.pendingChunks).catch((err) => {
        logger.error('❌ Erreur flush final lors du cleanup:', err);
      });
      this.pendingChunks = [];
    }

    // Arrêter le stream audio
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Libérer Wake Lock
    wakeLockService.release();

    // NOTE: Connection Monitor est géré par ImmersiveRecordingPage
    // Ne pas l'arrêter ici pour éviter les problèmes d'initialisation

    // Réinitialiser l'état
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.state = 'idle';
    this.duration = 0; // Réinitialiser la durée à 0
    this.currentRecordingUuid = null;
    this.chunkIndex = 0;
    this.title = 'Enregistrement sans titre'; // Réinitialiser le titre

    // Notifier le changement d'état
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('idle');
    }
    if (this.onDurationUpdateCallback) {
      this.onDurationUpdateCallback(0);
    }
    // Mettre à jour le store global directement
    if (recordingStore) {
      if (recordingStore.setState) {
        recordingStore.setState('idle');
      }
      if (recordingStore.setDuration) {
        recordingStore.setDuration(0);
      }
    }

    logger.debug('🧹 Nettoyage terminé');
  }

  /**
   * Met à jour les callbacks (utile quand le composant se remonte)
   */
  updateCallbacks(callbacks: {
    onDurationUpdate?: (duration: number) => void;
    onStateChange?: (state: RecordingState) => void;
    onRecordingComplete?: (audioBlob: Blob, mimeType: string, duration: number) => void;
  }): void {
    this.onDurationUpdateCallback = callbacks.onDurationUpdate;
    this.onStateChangeCallback = callbacks.onStateChange;
    this.onRecordingCompleteCallback = callbacks.onRecordingComplete;
    
    // Si un enregistrement est en cours, notifier immédiatement avec la durée actuelle
    if (this.state === 'recording' && this.onDurationUpdateCallback) {
      this.onDurationUpdateCallback(this.duration);
    }
  }

  /**
   * Récupère l'UUID de l'enregistrement en cours
   */
  getCurrentRecordingUuid(): string | null {
    return this.currentRecordingUuid;
  }

  /**
   * Récupère la durée actuelle de l'enregistrement
   */
  getCurrentDuration(): number {
    return this.duration;
  }

  /**
   * Récupère l'état actuel de l'enregistrement
   */
  getState(): RecordingState {
    return this.state;
  }

  /**
   * Vérifie si un enregistrement est en cours
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * Vérifie si un enregistrement est en pause
   */
  isPaused(): boolean {
    return this.state === 'paused';
  }

  /**
   * Vérifie si un enregistrement est actif (en cours ou en pause)
   */
  isActive(): boolean {
    return this.state === 'recording' || this.state === 'paused';
  }

  /**
   * Abandonne l'enregistrement en cours (suppression volontaire)
   */
  async abandonRecording(): Promise<void> {
    logger.debug('🗑️ Abandon volontaire de l\'enregistrement');
    
    // Supprimer de IndexedDB si existe
    if (this.currentRecordingUuid) {
      try {
        await recordingStorage.deleteRecording(this.currentRecordingUuid);
        logger.debug('✅ Enregistrement supprimé de IndexedDB');
      } catch (error) {
        logger.error('Erreur suppression:', error);
      }
    }

    // Arrêter tout
    if (this.mediaRecorder && this.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.cleanup();
  }
}

// Instance singleton
export const recordingManager = new RecordingManagerService();

