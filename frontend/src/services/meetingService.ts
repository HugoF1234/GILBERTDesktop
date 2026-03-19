import apiClient, { API_BASE_URL } from './apiClient';
import { verifyTokenValidity } from './authService';

// Interface pour la réponse de validation des IDs
export interface ValidateIdsResponse {
  valid_ids: string[];   // IDs de réunions qui existent encore
  invalid_ids: string[]; // IDs de réunions qui n'existent plus
}

export interface Meeting {
  id: string;
  name?: string;
  title?: string; 
  file_url?: string;
  transcript_status: 'pending' | 'processing' | 'completed' | 'error' | 'deleted';
  transcript_text?: string;
  user_id: string;
  created_at: string;
  updated_at?: string;
  // Les champs suivants sont pour la compatibilité avec l'interface existante du frontend
  date?: string;
  duration?: number;
  transcription_status?: 'pending' | 'processing' | 'completed' | 'failed';
  // Nouveaux champs pour les détails de la transcription
  audio_duration?: number; // Durée de l'audio en secondes
  participants?: number;   // Nombre de participants détectés
  duration_seconds?: number; // Durée alternative en secondes
  speakers_count?: number;   // Nombre de locuteurs alternatif
  utterances?: Array<{     // Segments de texte avec timing
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
  // Champs pour le compte rendu
  summary_status?: 'not_generated' | 'processing' | 'completed' | 'error';
  summary_text?: string;
  // Champ pour l'association avec un client (pour les templates personnalisés)
  client_id?: string | null;
  // Champs pour l'interface de sélection de template
  showTemplateSelection?: boolean;
  selectedTemplate?: string; // ID du template sélectionné
  // Template utilisé pour générer le résumé
  template_id?: string | null;
  // Quota Discovery - true si cette réunion a dépassé le quota et est verrouillée
  is_quota_locked?: boolean;
}

export interface TranscriptResponse {
  meeting_id: string;
  transcript_text: string;
  transcript_status: 'pending' | 'processing' | 'completed' | 'error' | 'deleted';
  error?: string; // Message d'erreur éventuel
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
  audio_duration?: number; // Durée de l'audio en secondes 
  participants?: number;   // Nombre de participants détectés
  duration_seconds?: number; // Durée alternative en secondes
  speakers_count?: number;   // Nombre de locuteurs alternatif
  summary_status?: 'not_generated' | 'processing' | 'completed' | 'error';
  summary_text?: string;
}

export interface UploadOptions {
  onProgress?: (progress: number) => void;
  onSuccess?: (meeting: Meeting) => void;
  onError?: (error: Error) => void;
  format?: string; // Format audio (wav, mp3, webm, etc.)
  title?: string; // Titre de la réunion
  signal?: AbortSignal; // Permettre l'annulation
}

/** Retourne true si l'erreur est retentable (5xx, 429, réseau) */
function isRetryableUploadError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false;
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  const msg = error instanceof Error ? error.message : String(error);
  const statusMatch = msg.match(/Upload failed \((\d+)\)/);
  if (statusMatch) {
    const status = parseInt(statusMatch[1], 10);
    if (status === 429) return true; // Rate limit
    if (status >= 500 && status < 600) return true; // Server error
    return false; // 4xx (sauf 429) = client error, pas de retry
  }
  // Erreur réseau, timeout, etc.
  return true;
}

/** Délai en ms avant retry (backoff exponentiel: 2s, 4s, 8s) */
function getRetryDelayMs(attempt: number): number {
  return Math.min(2000 * Math.pow(2, attempt), 8000);
}

/**
 * Upload an audio file and create a new meeting
 * Retry avec backoff exponentiel (2s, 4s, 8s) sur erreurs réseau, 5xx, 429
 */
export async function uploadMeeting(
  audioFile: File,
  title: string,
  options?: UploadOptions
): Promise<Meeting> {
  const url = `/simple/meetings/upload`;
  const endpoint = `${API_BASE_URL}${url}`;
  const token = localStorage.getItem('auth_token');

  const MAX_ATTEMPTS = 4; // 1 initial + 3 retries
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const formData = new FormData();
    formData.append('file', audioFile);
    formData.append('title', title);
    try {
      let response: Meeting;

      if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
        response = await new Promise<Meeting>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', endpoint, true);
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          const abortHandler = () => {
            try { xhr.abort(); } catch {}
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (options?.signal) {
            options.signal.addEventListener('abort', abortHandler, { once: true });
          }

          let hasStartedRealProgress = false;
          let simulatedProgress = 2;
          const startTime = Date.now();

          const progressInterval = setInterval(() => {
            if (!hasStartedRealProgress && simulatedProgress < 5) {
              simulatedProgress = Math.min(5, 2 + ((Date.now() - startTime) / 500) * 3);
              if (options?.onProgress) {
                options.onProgress(Math.round(simulatedProgress));
              }
            } else {
              clearInterval(progressInterval);
            }
          }, 50);

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && options?.onProgress) {
              hasStartedRealProgress = true;
              clearInterval(progressInterval);
              const realPercent = Math.round((evt.loaded / evt.total) * 100);
              const percent = Math.max(5, realPercent);
              options.onProgress(percent);
            }
          };

          xhr.onerror = () => {
            clearInterval(progressInterval);
            reject(new Error('Network error during upload'));
          };
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              clearInterval(progressInterval);
              if (xhr.status >= 200 && xhr.status < 300) {
                try {
                  const json = JSON.parse(xhr.responseText) as Meeting;
                  if (options?.onProgress) options.onProgress(100);
                  resolve(json);
                } catch (e) {
                  reject(new Error('Invalid JSON response'));
                }
              } else {
                reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
              }
            }
          };

          xhr.send(formData);
        });
      } else {
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
        const controller = new AbortController();
        const signal = options?.signal || controller.signal;
        const res = await fetch(endpoint, { method: 'POST', headers, body: formData, signal });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Upload failed (${res.status}): ${errText}`);
        }
        response = (await res.json()) as Meeting;
      }

      if (!response.id) {
        throw new Error('Server did not return a valid meeting ID');
      }

      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableUploadError(error) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
      const delayMs = getRetryDelayMs(attempt);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastError;
}

/**
 * Récupère les détails d'une réunion avec gestion d'erreur améliorée
 * @param meetingId ID de la réunion
 * @param options Options supplémentaires (signal pour abort)
 * @returns Détails de la réunion ou null si non trouvée
 */
export async function getMeeting(
  meetingId: string,
  options: { signal?: AbortSignal; isPolling?: boolean } = {},
  retryCount: number = 0
): Promise<Meeting | null> {
  const { signal, isPolling = false } = options;

  try {
    // Récupérer depuis l'API avec signal d'abort en utilisant le nouvel endpoint simplifié
    // isPolling: évite de déclencher logout (verifyTokenValidity) sur 401 pendant le polling
    const response = await apiClient.get<Meeting>(
      `/simple/meetings/${meetingId}`,
      true,  // withAuth = true
      { signal, ignoreError: isPolling }  // ignoreError évite logout sur 401 pendant polling
    );

    if (!response || !response.id) {
      throw new Error('Format de réponse API invalide pour les détails de réunion');
    }
    
    // Normaliser les champs pour compatibilité
    const normalizedMeeting = normalizeMeeting(response);
    
    return normalizedMeeting;
  } catch (error) {
    // Gérer l'erreur 401 (Unauthorized) - token expiré ou invalide
    const is401 = error instanceof Error && error.message?.includes('401') ||
      (error && typeof error === 'object' && 'status' in error && (error as { status?: number }).status === 401) ||
      (error && typeof error === 'object' && 'detail' in error && String((error as { detail?: unknown }).detail).toLowerCase().includes('credential'));
    if (is401) {
      const token = localStorage.getItem('auth_token');
      if (!token || retryCount >= 3) {
        return null;
      }
      // En mode polling : ne pas appeler verifyTokenValidity (évite logout)
      // Simplement réessayer après une pause (le token peut être en cours de refresh)
      await new Promise(resolve => setTimeout(resolve, isPolling ? 2000 : 1000));
      return getMeeting(meetingId, options, retryCount + 1);
    }

    // Gérer l'erreur 404 (Not Found)
    if (error instanceof Error && (error.message?.includes('404') || error.message?.includes('not found'))) {
      return null;
    }

    // Si c'est une erreur d'abort, ne rien faire
    if (signal && signal.aborted) {
      return null;
    }

    // Pour les autres erreurs, relayer l'erreur pour traitement par l'appelant
    throw error;
  }
}

/**
 * Get all meetings for the authenticated user
 */
export async function getAllMeetings(): Promise<Meeting[]> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      return [];
    }

    // Utiliser le nouvel endpoint simplifié
    const response = await apiClient.get<Meeting[]>('/simple/meetings/', true);

    if (!response || !Array.isArray(response)) {
      throw new Error('Invalid API response format');
    }

    // Normaliser les champs de chaque réunion pour compatibilité
    const normalizedMeetings = response.map(normalizeMeeting);

    return normalizedMeetings;
  } catch (error) {
    // Propager l'erreur (le store Zustand gère le fallback avec ses données en cache)
    throw error;
  }
}

/**
 * Récupère directement la transcription avec diarization depuis l'API
 * @param meetingId ID de la réunion
 * @returns Transcription avec identifiants de locuteurs
 */
export async function getTranscriptionWithDiarization(meetingId: string): Promise<any> {
  try {
    // Utiliser le nouvel endpoint simplifié de détails réunion (inclut les champs de transcription)
    const response = await apiClient.get<any>(
      `/simple/meetings/${meetingId}`,
      true
    );

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Get the transcript for a meeting
 * @param options.isPolling - Si true, ignoreError évite logout sur 401 pendant le polling
 */
export async function getTranscript(meetingId: string, options?: { isPolling?: boolean }): Promise<TranscriptResponse> {
  try {
    // Récupérer les détails de la réunion via l'endpoint simplifié (contient la transcription)
    const response = await apiClient.get<any>(
      `/simple/meetings/${meetingId}`,
      true,
      { ignoreError: options?.isPolling }
    );

    // Convertir en format TranscriptResponse
    const transcriptResponse: TranscriptResponse = {
      meeting_id: response.id || meetingId,
      transcript_text: response.transcript_text || '',
      transcript_status: response.transcript_status || response.transcription_status || 'completed',
      utterances: response.utterances || [],
      audio_duration: response.audio_duration || 0,
      participants: response.participants || response.speakers_count || 0,
      duration_seconds: response.duration_seconds || 0,
      speakers_count: response.speakers_count || 0
    };

    return transcriptResponse;
  } catch (error) {
    // Tenter de récupérer via l'autre endpoint en cas d'échec
    try {
      const meeting = await getMeeting(meetingId);

      if (!meeting) {
        throw new Error(`Meeting with ID ${meetingId} not found`);
      }

      // Convertir en format TranscriptResponse
      const response: TranscriptResponse = {
        meeting_id: meeting.id,
        transcript_text: meeting.transcript_text || '',
        transcript_status: meeting.transcript_status,
        utterances: meeting.utterances,
        audio_duration: meeting.audio_duration,
        participants: meeting.participants,
        duration_seconds: meeting.duration_seconds,
        speakers_count: meeting.speakers_count
      };

      return response;
    } catch (fallbackError) {
      throw error; // Throw the original error
    }
  }
}

/**
 * Standardise les champs d'une réunion pour assurer la compatibilité
 * avec les différentes versions de l'API
 * @param meeting La réunion à normaliser
 * @returns La réunion avec les champs standardisés
 */
export function normalizeMeeting(meeting: Meeting): Meeting {
  if (!meeting) return meeting;
  
  // Création d'une copie pour éviter de modifier l'original
  const normalizedMeeting: Meeting = { ...meeting };
  
  // Normalisation du statut de transcription (plusieurs variations possibles)
  if (normalizedMeeting.transcript_status && !normalizedMeeting.transcription_status) {
    normalizedMeeting.transcription_status = normalizedMeeting.transcript_status;
  } else if (normalizedMeeting.transcription_status && !normalizedMeeting.transcript_status) {
    normalizedMeeting.transcript_status = normalizedMeeting.transcription_status;
  }
  
  // Normalisation du titre/nom (plusieurs variations possibles)
  if (normalizedMeeting.name && !normalizedMeeting.title) {
    normalizedMeeting.title = normalizedMeeting.name;
  } else if (normalizedMeeting.title && !normalizedMeeting.name) {
    normalizedMeeting.name = normalizedMeeting.title;
  }
  
  // Déterminer la durée en secondes (en priorité audio_duration)
  normalizedMeeting.duration_seconds = 
    normalizedMeeting.audio_duration || 
    normalizedMeeting.duration_seconds || 
    normalizedMeeting.duration || 
    0;
  
  // S'assurer que nous avons aussi une durée en général
  normalizedMeeting.duration = normalizedMeeting.duration_seconds;
  // Conserver audio_duration pour les API qui s'attendent à ce champ
  normalizedMeeting.audio_duration = normalizedMeeting.duration_seconds;
  
  // Nombre de participants/locuteurs (en priorité speaker_count)
  normalizedMeeting.speakers_count = 
    normalizedMeeting.speaker_count || 
    normalizedMeeting.speakers_count || 
    normalizedMeeting.participants || 
    0;
  
  // Assurez-vous que participants est également défini (pour la rétrocompatibilité)
  normalizedMeeting.participants = normalizedMeeting.speakers_count;
  // Conserver speaker_count pour les API qui s'attendent à ce champ
  normalizedMeeting.speaker_count = normalizedMeeting.speakers_count;
  
  return normalizedMeeting;
}

/**
 * Start a transcription process for a meeting
 */
export async function startTranscription(meetingId: string): Promise<Meeting> {
  try {
    // Utiliser le nouvel endpoint simplifié
    const result = await apiClient.post<Meeting>(`/simple/meetings/${meetingId}/transcribe`);

    // Normaliser le résultat pour la compatibilité
    const normalizedResult = normalizeMeeting(result);

    return normalizedResult;
  } catch (error) {
    // Renvoyer une erreur plus informative
    if (error instanceof Error && error.message.includes('Network connection')) {
      throw new Error(`Network connection error: Cannot connect to transcription server. Please check your connection and ensure the backend is running.`);
    }

    throw error;
  }
}

/**
 * Retry a failed transcription
 */
export async function retryTranscription(
  meetingId: string,
  options?: UploadOptions
): Promise<Meeting> {
  try {
    // Utiliser le nouvel endpoint simplifié
    const result = await apiClient.post<Meeting>(`/simple/meetings/${meetingId}/retry-transcription`);

    // Normaliser le résultat pour la compatibilité
    const normalizedResult = normalizeMeeting(result);

    // Appeler le callback de succès si présent
    if (options?.onSuccess) {
      options.onSuccess(normalizedResult);
    }

    return normalizedResult;
  } catch (error) {
    // Appeler le callback d'erreur si présent
    if (options?.onError && error instanceof Error) {
      options.onError(error);
    }

    throw error;
  }
}

/**
 * Function to extract audio duration and participants count from a meeting object
 * Essaie de récupérer les informations même si elles sont dans des champs différents
 */
function extractAudioMetrics(meeting: Meeting): { duration: number, participants: number } {
  // Extraire la durée avec priorité (audio_duration > duration_seconds > duration)
  const duration = meeting.audio_duration || meeting.duration_seconds || meeting.duration || 0;

  // Extraire le nombre de participants (speaker_count > speakers_count > participants)
  const participants = meeting.speaker_count || meeting.speakers_count || meeting.participants || 0;

  return { duration, participants };
}

/**
 * Check and update meeting metadata (duration, participants) if missing
 */
export async function updateMeetingMetadata(meetingId: string): Promise<Meeting | null> {
  try {
    // Récupérer les données actuelles de la réunion
    const meeting = await getMeeting(meetingId);
    if (!meeting) return null;

    // Vérifier si les métadonnées sont déjà complètes
    const { duration, participants } = extractAudioMetrics(meeting);
    if (duration > 0 && participants > 0) {
      return meeting;
    }

    // Si la transcription est complète mais les métadonnées sont manquantes
    if ((meeting.transcript_status === 'completed' || meeting.transcription_status === 'completed') &&
        (duration === 0 || participants === 0)) {

      // Essayer d'abord avec la nouvelle fonction qui utilise transcribe_direct.py
      try {
        const updatedMeeting = await updateMeetingParticipantsAndDuration(meetingId);
        if (updatedMeeting) {
          return updatedMeeting;
        }
      } catch (directUpdateError) {
        // Fall through to standard method
      }

      // Utiliser l'endpoint standard si la méthode directe échoue
      const refreshedMeeting = await getMeetingDetails(meetingId);

      // Normaliser le résultat
      const normalizedMeeting = normalizeMeeting(refreshedMeeting);

      return normalizedMeeting;
    }

    return meeting;
  } catch (error) {
    return null;
  }
}

/**
 * Mettre à jour spécifiquement les métadonnées (durée et nombre de participants) d'une réunion
 * en utilisant le script backend transcribe_direct.py
 * 
 * @param meetingId ID de la réunion à mettre à jour
 * @returns La réunion mise à jour ou null en cas d'erreur
 */
export async function updateMeetingParticipantsAndDuration(meetingId: string): Promise<Meeting | null> {
  try {
    if (!meetingId) {
      return null;
    }

    // Utiliser le nouvel endpoint simplifié qui appellera transcribe_direct.py en mode update
    const result = await apiClient.post<Meeting>(`/simple/meetings/${meetingId}/update-metadata`);

    if (!result) {
      return null;
    }

    // Normaliser le résultat
    const normalizedMeeting = normalizeMeeting(result);

    return normalizedMeeting;
  } catch (error) {
    return null;
  }
}

/**
 * Delete a meeting
 */
export async function deleteMeeting(meetingId: string): Promise<void> {
  return apiClient.delete<void>(`/simple/meetings/${meetingId}`);
}

/**
 * Get the audio file for a meeting
 * @param meetingId The ID of the meeting
 * @returns A URL to the audio file that can be used in an audio player
 */
export async function getMeetingAudio(meetingId: string): Promise<string> {
  try {
    // Récupérer le token pour l'authentification
    const token = localStorage.getItem('auth_token');

    // Faire une requête pour récupérer le blob audio avec les headers d'authentification
    // en utilisant le nouvel endpoint simplifié
    const response = await fetch(`${apiClient.baseUrl}/simple/meetings/${meetingId}/audio`, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      },
      method: 'GET'
    });

    if (!response.ok) {
      throw new Error(`Failed to retrieve audio: ${response.status} ${response.statusText}`);
    }

    // Récupérer le blob audio
    const audioBlob = await response.blob();

    // Créer une URL pour ce blob que le navigateur peut utiliser
    const audioUrl = URL.createObjectURL(audioBlob);
    return audioUrl;
  } catch (error) {
    throw error;
  }
}

// Event emitter pour les notifications de transcription
type TranscriptionCallback = (meeting: Meeting) => void;
const transcriptionCompletedListeners: TranscriptionCallback[] = [];

/**
 * S'abonner aux événements de complétion de transcription
 * @param callback Fonction à appeler quand une transcription est complétée
 * @returns Fonction pour se désabonner
 */
export function onTranscriptionCompleted(callback: TranscriptionCallback) {
  transcriptionCompletedListeners.push(callback);
  return () => {
    const index = transcriptionCompletedListeners.indexOf(callback);
    if (index !== -1) {
      transcriptionCompletedListeners.splice(index, 1);
    }
  };
}

/**
 * Notifie tous les abonnés qu'une transcription est complétée
 * @param meeting Meeting qui a été complété
 */
function notifyTranscriptionCompleted(meeting: Meeting) {
  transcriptionCompletedListeners.forEach((callback) => {
    try {
      callback(meeting);
    } catch (error) {
      // Silently fail on listener errors
    }
  });
}

/**
 * Type pour les callbacks de statut de transcription
 */
export type TranscriptionStatusCallback = (
  status: 'pending' | 'processing' | 'completed' | 'error' | 'deleted',
  meeting: Meeting
) => void;

/**
 * Poll for transcription status updates
 * @param meetingId ID of the meeting to check status for
 * @param callback Function to call when status is updated
 * @param interval Milliseconds between checks, default 3000
 * @returns Function to stop polling
 * @deprecated Utiliser watchTranscriptionStatus à la place
 */
export function pollTranscriptionStatus(
  meetingId: string,
  callback: TranscriptionStatusCallback,
  interval = 3000
): () => void {
  // Utiliser la nouvelle fonction à la place
  return watchTranscriptionStatus(meetingId, callback);
}

/**
 * Interface pour le nouveau format d'erreur 404 amélioré
 */
interface MeetingNotFoundError {
  detail: {
    message: string;
    meeting_id: string;
    reason: string;
    type: string;
  }
}

/**
 * Vérifie si une erreur est une erreur de réunion non trouvée (404 amélioré)
 */
export function isMeetingNotFoundError(error: any): error is MeetingNotFoundError {
  return error && 
         error.detail && 
         error.detail.type === "MEETING_NOT_FOUND" &&
         error.detail.meeting_id;
}

/**
 * Récupère un message utilisateur approprié pour une erreur de réunion non trouvée
 */
export function getMeetingNotFoundMessage(error: MeetingNotFoundError): string {
  if (error && error.detail) {
    return `${error.detail.message}: ${error.detail.reason}`;
  }
  return "La réunion demandée n'existe plus ou a été supprimée.";
}

/**
 * Surveille le statut de transcription de l'audio
 * @param meetingId ID de la réunion
 * @param onUpdate Callback pour les mises à jour de statut
 * @returns Fonction pour arrêter la surveillance
 */
export function watchTranscriptionStatus(
  meetingId: string,
  onUpdate?: (status: string, meeting: Meeting) => void
): () => void {
  if (!meetingId) {
    return () => {};
  }

  let stopPolling = false;
  let interval = 3000; // Intervalle de base en millisecondes
  let consecutiveErrors = 0;

  // Fonction pour vérifier le statut
  const checkStatus = async () => {
    if (stopPolling) return;

    try {
      const meeting = await getMeeting(meetingId, { isPolling: true });

      if (!meeting) {
        stopPolling = true;
        return;
      }

      const status = meeting.transcript_status || meeting.transcription_status || 'unknown';

      // Appeler le callback s'il existe
      if (onUpdate) {
        onUpdate(status, meeting);
      }

      // Si le statut est final, arrêter le polling
      if (status === 'completed' || status === 'error' || status === 'failed' || status === 'deleted') {
        // Si la transcription est complétée, vérifier et mettre à jour les métadonnées
        if (status === 'completed') {
          try {
            // Extraire les métadonnées actuelles
            const { duration, participants } = extractAudioMetrics(meeting);

            // Si les métadonnées sont manquantes, essayer de les mettre à jour
            if (duration === 0 || participants === 0) {
              const updatedMeeting = await updateMeetingMetadata(meetingId);

              // Si on a réussi à récupérer des métadonnées, utiliser cette version mise à jour
              if (updatedMeeting) {
                // Notifier avec les données mises à jour
                notifyTranscriptionCompleted(updatedMeeting);
                stopPolling = true;
                return;
              }
            }
          } catch (metadataError) {
            // Continuer avec les données disponibles même en cas d'erreur de métadonnées
          }

          // Notifier avec les données disponibles
          notifyTranscriptionCompleted(meeting);
        }

        stopPolling = true;
        return;
      }

      // Réinitialiser le compteur d'erreurs après un succès
      consecutiveErrors = 0;

      // Calculer le prochain intervalle en fonction du statut
      if (status === 'processing') {
        // Plus rapide pendant le traitement
        interval = 2000;
      } else {
        // Plus lent pendant l'attente
        interval = 5000;
      }

    } catch (error) {
      consecutiveErrors++;

      // Augmenter progressivement l'intervalle en cas d'erreurs répétées
      if (consecutiveErrors > 3) {
        interval = Math.min(interval * 1.5, 15000); // Max 15 secondes
      }
    }

    // Planifier la prochaine vérification
    if (!stopPolling) {
      setTimeout(checkStatus, interval);
    }
  };

  // Démarrer la vérification initiale
  setTimeout(checkStatus, 500);

  // Renvoyer une fonction pour arrêter le polling
  return () => {
    stopPolling = true;
  };
}

/**
 * Get detailed meeting info including duration and participant count
 * @param options.isPolling - Si true, ignoreError évite logout sur 401 pendant le polling
 */
export async function getMeetingDetails(meetingId: string, options?: { isPolling?: boolean }): Promise<Meeting> {
  try {
    // Utiliser la fonction getMeeting pour récupérer les données complètes de la réunion
    const meetingData = await getMeeting(meetingId, { isPolling: options?.isPolling });

    // Si meeting est null, c'est probablement qu'il a été supprimé
    if (!meetingData) {
      return {
        id: meetingId,
        name: 'Réunion indisponible',
        title: 'Réunion indisponible',
        created_at: new Date().toISOString(),
        duration: 0,
        user_id: '',
        transcript_status: 'deleted',
        transcription_status: 'deleted',
        error_message: "Cette réunion n'existe plus sur le serveur."
      } as Meeting;
    }

    // Normaliser les informations de durée et de participants
    const meeting: Meeting = {
      ...meetingData,
      // Assurer la compatibilité avec les différents formats de champs
      duration: meetingData.duration_seconds || meetingData.audio_duration || meetingData.duration,
      participants: meetingData.speakers_count || meetingData.participants || 0
    };

    return meeting;
  } catch (error) {
    // Vérifier si c'est une erreur 404 (ressource non trouvée)
    if (error instanceof Error && error.message.includes('404')) {
      // Retourner un objet meeting avec des informations minimales plutôt que de propager l'erreur
      return {
        id: meetingId,
        name: 'Réunion indisponible',
        title: 'Réunion indisponible',
        created_at: new Date().toISOString(),
        duration: 0,
        user_id: '',
        transcript_status: 'deleted',
        transcription_status: 'deleted',
        error_message: "Cette réunion n'existe plus sur le serveur."
      } as Meeting;
    }
    throw error;
  }
}

/**
 * Vérifie quels IDs de réunions sont encore valides sur le serveur
 * et nettoie le cache local des réunions supprimées
 * 
 * @param cachedMeetingIds Liste des IDs de réunions en cache
 * @returns Liste des IDs de réunions valides
 */
export async function syncMeetingsCache(): Promise<Meeting[]> {
  try {
    // Vérifier si le token est valide pour éviter les erreurs 401
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      return [];
    }

    // Fetch all meetings from the server
    const meetings = await getAllMeetings();

    if (meetings && meetings.length > 0) {
      // Normalize and update each meeting in the cache
      const normalizedMeetings = meetings.map(meeting => normalizeMeeting(meeting));

      return normalizedMeetings;
    } else {
      return [];
    }
  } catch (error) {
    // En cas d'erreur serveur, propager l'erreur (le store Zustand gère le fallback)
    throw error;
  }
}

/**
 * Génère un compte rendu pour une réunion spécifique
 * @param meetingId ID de la réunion pour laquelle générer un compte rendu
 * @param clientId ID du client pour utiliser son template (optionnel)
 * @returns La réunion mise à jour avec le statut du compte rendu
 */
export async function generateMeetingSummary(
  meetingId: string,
  clientId?: string | null,
  templateId?: string | null,
  isManualCall: boolean = false
): Promise<Meeting> {
  // PROTECTION: Bloquer toute génération automatique
  if (!isManualCall) {
    throw new Error('Génération automatique désactivée - utilisez le dropdown pour choisir un template');
  }

  try {
    // Récupérer le token d'authentification
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    let data;

    // Étape 1: Associer la réunion au client choisi (seulement pour les templates personnalisés)
    if (clientId !== undefined && clientId !== null) {
      try {
        await apiClient.put(`/meetings/${meetingId}`, { client_id: clientId });
      } catch (err: any) {
        // Continue malgré l'échec de l'association client
      }
    }

    // Étape 2: Générer le résumé
    try {
      const generateEndpoint = `/meetings/${meetingId}/generate-summary`;

      // Essai 1: POST /meetings/{meeting_id}/generate-summary
      try {
        const urlWithTemplate = templateId
          ? `${generateEndpoint}?template_id=${encodeURIComponent(templateId)}&is_manual=true`
          : `${generateEndpoint}?is_manual=true`;
        data = await apiClient.post(urlWithTemplate);

        const updatedMeeting = await getMeetingDetails(meetingId);
        return updatedMeeting;
      } catch (err1: any) {
        // Continue to next attempt
      }

      // Essai 2: POST /meetings/{meeting_id}/summary
      try {
        const summaryEndpoint = `/meetings/${meetingId}/summary`;
        const urlWithTemplate = templateId
          ? `${summaryEndpoint}?template_id=${encodeURIComponent(templateId)}&is_manual=true`
          : `${summaryEndpoint}?is_manual=true`;
        data = await apiClient.post(urlWithTemplate);

        const updatedMeeting = await getMeetingDetails(meetingId);
        return updatedMeeting;
      } catch (err2: any) {
        // Continue to next attempt
      }

      // Essai 3: GET /meetings/{meeting_id}/summary
      try {
        const getSummaryEndpoint = `/meetings/${meetingId}/summary`;
        data = await apiClient.get(getSummaryEndpoint);

        const updatedMeeting = await getMeetingDetails(meetingId);
        return updatedMeeting;
      } catch (err3: any) {
        throw new Error(`Échec de génération du résumé après plusieurs tentatives. Vérifiez la connexion au serveur et réessayez.`);
      }
    } catch (err: any) {
      throw new Error(`Erreur lors de la génération du résumé: ${err.message}`);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Surveille le statut de génération du compte rendu
 * @param meetingId ID de la réunion
 * @param onUpdate Callback pour les mises à jour de statut
 * @returns Fonction pour arrêter la surveillance
 */
export function watchSummaryStatus(
  meetingId: string,
  onUpdate?: (status: string, meeting: Meeting) => void
): () => void {
  let isActive = true;
  let timeoutId: NodeJS.Timeout | null = null;

  const checkStatus = async () => {
    if (!isActive) {
      return;
    }

    try {
      // Récupérer les détails de la réunion
      const meeting = await getMeetingDetails(meetingId);

      if (!meeting) {
        if (isActive && timeoutId) {
          timeoutId = setTimeout(checkStatus, 10000);
        }
        return;
      }

      // Vérifier si le compte rendu est terminé
      if (meeting.summary_status === 'completed' || meeting.summary_status === 'error') {
        if (onUpdate) {
          onUpdate(meeting.summary_status, meeting);
        }
        return; // Arrêter la surveillance
      }

      // Continuer la surveillance
      if (onUpdate) {
        onUpdate(meeting.summary_status || 'processing', meeting);
      }

      // Planifier la prochaine vérification
      timeoutId = setTimeout(checkStatus, 5000);
    } catch (error) {
      if (isActive && timeoutId) {
        timeoutId = setTimeout(checkStatus, 10000);
      }
    }
  };

  // Démarrer la surveillance
  checkStatus();

  // Retourner une fonction pour arrêter la surveillance
  return () => {
    isActive = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Update meeting title
 * @param meetingId The ID of the meeting to update
 * @param title The new title
 * @returns Updated meeting data
 */
export async function updateMeetingTitle(meetingId: string, title: string): Promise<Meeting> {
  const isTokenValid = await verifyTokenValidity();
  if (!isTokenValid) {
    throw new Error('Authentication token is invalid');
  }

  const response = await apiClient.put<Meeting>(
    `/meetings/${meetingId}`,
    { title, name: title },
    true
  );

  if (!response) {
    throw new Error('Invalid API response');
  }

  const normalizedMeeting = normalizeMeeting(response);

  return normalizedMeeting;
}

/**
 * Update meeting transcript text
 * @param meetingId The ID of the meeting to update
 * @param transcriptText The new transcript text
 * @returns Updated meeting data
 */
export async function updateMeetingTranscriptText(meetingId: string, transcriptText: string): Promise<Meeting> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Compter les speakers uniques dans le transcript pour mettre à jour speakers_count
    const lines = transcriptText.split(/\n\n?/).filter(l => l.trim());
    const uniqueSpeakers = new Set<string>();
    for (const line of lines) {
      const match = line.match(/^([^:]+):\s/);
      if (match) {
        uniqueSpeakers.add(match[1].trim());
      }
    }
    const speakersCount = uniqueSpeakers.size || undefined;

    // Make PUT request to update the meeting transcript + speakers_count
    const response = await apiClient.put<Meeting>(
      `/meetings/${meetingId}`,
      { transcript_text: transcriptText, ...(speakersCount ? { speakers_count: speakersCount } : {}) },
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    // Normalize the response
    const normalizedMeeting = normalizeMeeting(response);

    return normalizedMeeting;
  } catch (error) {
    throw error;
  }
}

/**
 * Updates the summary text of a meeting
 * @param meetingId The ID of the meeting to update
 * @param summaryText The new summary text
 * @returns Updated meeting data
 */
export async function updateMeetingSummaryText(meetingId: string, summaryText: string): Promise<Meeting> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make PUT request to update the meeting summary
    const response = await apiClient.put<Meeting>(
      `/meetings/${meetingId}`,
      { summary_text: summaryText },
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    // Normalize the response
    const normalizedMeeting = normalizeMeeting(response);

    return normalizedMeeting;
  } catch (error) {
    throw error;
  }
}

// ===== FONCTIONS D'ADMINISTRATION =====

/**
 * Récupère la liste des utilisateurs pour l'administration
 * @param page Numéro de page
 * @param limit Nombre d'utilisateurs par page
 * @param search Terme de recherche
 * @returns Liste des utilisateurs avec pagination
 */
export async function getAdminUsers(
  page: number = 1,
  limit: number = 50,
  search?: string,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc'
): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Build query parameters
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    });

    if (sortBy) {
      params.append('sort_by', sortBy);
    }
    if (sortOrder) {
      params.append('sort_order', sortOrder);
    }

    if (search) {
      params.append('search', search);
    }

    // Make GET request to admin users endpoint
    const response = await apiClient.get<any>(
      `/admin/users?${params.toString()}`,
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Récupère les statistiques d'administration
 * @returns Statistiques générales de l'application
 */
export async function getAdminStats(): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make GET request to admin stats endpoint
    const response = await apiClient.get<any>(
      '/admin/stats',
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Récupère les détails d'un utilisateur spécifique
 * @param userId ID de l'utilisateur
 * @returns Détails complets de l'utilisateur
 */
export async function getUserDetails(userId: string): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make GET request to user details endpoint
    const response = await apiClient.get<any>(
      `/admin/users/${userId}/details`,
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Récupère la liste des utilisateurs connectés
 * @returns Liste des utilisateurs en ligne
 */
export async function getOnlineUsers(): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make GET request to online users endpoint
    const response = await apiClient.get<any>(
      '/admin/online-users',
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Bascule le statut d'un utilisateur (actif/inactif)
 * @param userId ID de l'utilisateur
 * @returns Résultat de l'opération
 */
export async function toggleUserStatus(userId: string): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make POST request to toggle user status endpoint
    const response = await apiClient.post<any>(
      `/admin/users/${userId}/toggle-status`,
      {},
      true  // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Supprime définitivement un utilisateur (admin seulement)
 * @param userId ID de l'utilisateur à supprimer
 * @returns Réponse de l'API
 */
export async function deleteUser(userId: string): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make DELETE request to admin delete user endpoint
    const response = await apiClient.delete(`/admin/users/${userId}`);

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Crée un nouvel utilisateur (admin seulement)
 * @param userData Données du nouvel utilisateur
 * @returns Utilisateur créé
 */
export async function createUserByAdmin(userData: {
  email: string;
  password: string;
  full_name?: string;
  email_verified?: boolean;
  is_active?: boolean;
}): Promise<any> {
  try {
    // Verify token validity before proceeding
    const isTokenValid = await verifyTokenValidity();
    if (!isTokenValid) {
      throw new Error('Authentication token is invalid');
    }

    // Make POST request to admin create user endpoint
    const response = await apiClient.post<any>(
      '/admin/users',
      userData,
      false, // withMultipart = false
      true   // withAuth = true
    );

    if (!response) {
      throw new Error('Invalid API response');
    }

    return response;
  } catch (error) {
    throw error;
  }
}
