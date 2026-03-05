/**
 * Service de pont entre le frontend React et le backend Tauri Rust.
 * Gère l'enregistrement audio système + micro via les commandes Tauri invoke.
 * N'est actif que dans l'environnement Tauri (app desktop).
 */

declare global {
  interface Window {
    __TAURI__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      event: {
        listen: (event: string, handler: (payload: unknown) => void) => Promise<() => void>;
      };
    };
  }
}

export type RecordingMode = 'mic' | 'system' | 'both';

export interface TauriStatus {
  is_recording: boolean;
  online: boolean;
  queue_len: number;
  is_paused?: boolean;
  last_result?: {
    transcript?: string;
    summary?: string;
  };
}

export interface TauriJob {
  id: string;
  file_path: string;
  status: string;
  retries: number;
  last_error?: string;
  updated_at: string;
}

/**
 * Détecte si on est dans l'environnement Tauri (app desktop)
 */
export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

/**
 * Appelle une commande Tauri de façon type-safe
 */
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!window.__TAURI__) {
    throw new Error('Tauri non disponible - vous êtes en mode web');
  }
  return window.__TAURI__.invoke(cmd, args) as Promise<T>;
}

/**
 * Démarre l'enregistrement via Tauri (audio système + micro)
 * @param mode - 'mic' | 'system' | 'both' (défaut: 'both')
 * @param token - Token JWT pour l'authentification API
 * @param title - Titre de la réunion (optionnel)
 */
export async function tauriStartRecording(
  mode: RecordingMode = 'both',
  token?: string | null,
  title?: string
): Promise<TauriStatus> {
  return invoke<TauriStatus>('start_record', {
    mode,
    token: token ?? null,
    title: title ?? null,
  });
}

/**
 * Arrête l'enregistrement et déclenche le traitement (transcription + résumé)
 * @param token - Token JWT pour l'upload vers l'API
 * @param title - Titre de la réunion (optionnel)
 */
export async function tauriStopRecording(
  token?: string | null,
  title?: string
): Promise<TauriStatus> {
  return invoke<TauriStatus>('stop_record', {
    token: token ?? null,
    title: title ?? null,
  });
}

/**
 * Annule l'enregistrement en cours sans uploader
 */
export async function tauriCancelRecording(): Promise<TauriStatus> {
  return invoke<TauriStatus>('cancel_record');
}

/**
 * Met en pause l'enregistrement
 */
export async function tauriPauseRecording(): Promise<boolean> {
  return invoke<boolean>('pause_record');
}

/**
 * Reprend l'enregistrement en pause
 */
export async function tauriResumeRecording(): Promise<boolean> {
  return invoke<boolean>('resume_record');
}

/**
 * Récupère le statut actuel de l'application
 */
export async function tauriGetStatus(): Promise<TauriStatus> {
  return invoke<TauriStatus>('get_status');
}

/**
 * Récupère le niveau audio du microphone (0.0 à 1.0)
 * Utile pour la visualisation en temps réel
 */
export async function tauriGetMicLevel(): Promise<number> {
  return invoke<number>('get_mic_audio_level');
}

/**
 * Récupère le niveau audio système (0.0 à 1.0)
 * Utile pour la visualisation en temps réel
 */
export async function tauriGetSystemAudioLevel(): Promise<number> {
  return invoke<number>('get_system_audio_level');
}

/**
 * Vérifie si la permission audio système est accordée (macOS ScreenCaptureKit)
 */
export async function tauriHasSystemAudioPermission(): Promise<boolean> {
  return invoke<boolean>('has_system_audio_permission');
}

/**
 * Demande la permission audio système (macOS ScreenCaptureKit)
 */
export async function tauriRequestSystemAudioPermission(): Promise<boolean> {
  return invoke<boolean>('request_system_audio_permission');
}

/**
 * Récupère la liste des jobs en attente dans la queue
 */
export async function tauriListJobs(): Promise<TauriJob[]> {
  return invoke<TauriJob[]>('list_jobs');
}

/**
 * S'abonne à l'événement de détection d'activité micro (réunion détectée)
 * Retourne une fonction de désabonnement
 */
export async function onMicActivityDetected(handler: () => void): Promise<() => void> {
  if (!window.__TAURI__) {
    return () => {};
  }
  const unlisten = await window.__TAURI__.event.listen('mic-activity-detected', handler);
  return unlisten;
}

/**
 * Service complet d'enregistrement desktop via Tauri
 * Encapsule toute la logique d'enregistrement pour l'app desktop
 */
class TauriRecordingService {
  private audioLevelInterval: ReturnType<typeof setInterval> | null = null;
  private onMicLevelCallback?: (level: number) => void;
  private onSystemLevelCallback?: (level: number) => void;
  private onStatusChangeCallback?: (status: TauriStatus) => void;
  private unlisten?: () => void;

  /**
   * Démarre le polling des niveaux audio pour la visualisation
   */
  startAudioLevelPolling(callbacks: {
    onMicLevel?: (level: number) => void;
    onSystemLevel?: (level: number) => void;
  }): void {
    this.onMicLevelCallback = callbacks.onMicLevel;
    this.onSystemLevelCallback = callbacks.onSystemLevel;

    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
    }

    this.audioLevelInterval = setInterval(async () => {
      try {
        if (this.onMicLevelCallback) {
          const micLevel = await tauriGetMicLevel();
          this.onMicLevelCallback(micLevel);
        }
        if (this.onSystemLevelCallback) {
          const sysLevel = await tauriGetSystemAudioLevel();
          this.onSystemLevelCallback(sysLevel);
        }
      } catch {
        // Silencieux si pas encore en enregistrement
      }
    }, 100);
  }

  /**
   * Arrête le polling des niveaux audio
   */
  stopAudioLevelPolling(): void {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
  }

  /**
   * S'abonne aux événements de détection de réunion
   */
  async subscribeMicActivity(handler: () => void): Promise<void> {
    this.unlisten = await onMicActivityDetected(handler);
  }

  /**
   * Désabonne des événements
   */
  unsubscribeAll(): void {
    this.stopAudioLevelPolling();
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = undefined;
    }
  }

  /**
   * Récupère le token JWT depuis localStorage
   */
  getAuthToken(): string | null {
    return localStorage.getItem('auth_token');
  }
}

export const tauriRecordingService = new TauriRecordingService();
