/**
 * ImmersiveRecordingPage - Interface d'enregistrement avec animation Lottie
 * Animation de réunion qui apparaît élégamment au lancement de l'enregistrement
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Square, ChevronDown, Check, Pause, Play, FileAudio, WifiOff, Wifi, CloudOff, CloudUpload } from 'lucide-react';
import { MicrophoneIcon } from '@/components/ui/SidebarIcons';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { recordingManager } from '@/services/recordingManager';
import { recordingStorage } from '@/services/recordingStorage';
import { getPendingRecordingsForRecovery } from '@/utils/recoveryUtils';
import { uploadMeeting, watchTranscriptionStatus } from '@/services/meetingService';
import { useRecordingStore } from '@/stores/recordingStore';
import { useDataStore } from '@/stores/dataStore';
import { connectionMonitor, ConnectionStatus } from '@/services/connectionMonitor';
import apiClient from '@/services/apiClient';
import { getDiscoveryStatus, DiscoveryStatus } from '@/services/profileService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import SaveValidation from '@/components/ui/SaveValidation';
import DiscardValidation from '@/components/ui/DiscardValidation';
import { useRouteContext } from '@/hooks/useRouteContext';
import RecordingRecoveryOverlay from '@/components/RecordingRecoveryOverlay';
import { logger } from '@/utils/logger';
import {
  isTauriApp,
  tauriStartRecording,
  tauriStopRecording,
  tauriCancelRecording,
  tauriPauseRecording,
  tauriResumeRecording,
  tauriGetMicLevel,
  tauriGetSystemAudioLevel,
  tauriRecordingService,
  tauriHasSystemAudioPermission,
} from '@/services/tauriRecordingService';

type RecordingState = 'idle' | 'recording' | 'paused' | 'processing';

interface AudioDevice {
  deviceId: string;
  label: string;
}

// Animation Lottie locale (1920x1080)
const LOTTIE_MEETING_URL = '/animations/meeting.json';

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Composant pour les barres audio - larges et visibles
function AudioBars({ audioLevel, isActive, isPaused, maxHeight = 120 }: { audioLevel: number; isActive: boolean; isPaused: boolean; maxHeight?: number }): JSX.Element {
  const barCount = 12;

  return (
    <div className="flex items-end justify-center gap-2" style={{ height: maxHeight }}>
      {[...Array(barCount)].map((_, i) => {
        const centerIndex = barCount / 2;
        const distanceFromCenter = Math.abs(i - centerIndex) / centerIndex;
        const baseHeight = 0.5 + (1 - distanceFromCenter) * 0.5;

        let heightPercent: number;

        if (isActive && !isPaused) {
          // Enregistrement actif : réaction forte au son
          const wave = Math.sin(Date.now() * 0.008 + i * 0.7) * 0.3 + 0.7;
          heightPercent = Math.max(15, 25 + audioLevel * 75 * baseHeight * wave);
        } else if (isPaused) {
          // Pause : barres moyennes
          heightPercent = 20;
        } else {
          // Repos : légère animation basée sur le niveau audio pour montrer que le micro fonctionne
          const wave = Math.sin(Date.now() * 0.005 + i * 0.5) * 0.2 + 0.8;
          heightPercent = Math.max(12, 15 + audioLevel * 30 * baseHeight * wave);
        }

        return (
          <motion.div
            key={i}
            className="w-2 rounded-full"
            style={{
              backgroundColor: isPaused
                ? 'rgba(251, 191, 36, 0.8)'
                : isActive
                ? 'rgba(59, 130, 246, 0.85)'
                : 'rgba(100, 116, 139, 0.5)',
            }}
            animate={{ height: `${heightPercent}%` }}
            transition={{ duration: 0.08, ease: 'easeOut' }}
          />
        );
      })}
    </div>
  );
}

export function ImmersiveRecordingPage(): JSX.Element {
  const navigate = useNavigate();
  const resetRecordingStore = useRecordingStore((state: any) => state.reset);
  const setShowSaveDialog = useRecordingStore((state: any) => state.setShowSaveDialog);
  const setRecordingState = useRecordingStore((state: any) => state.setState);
  const setRecordingDuration = useRecordingStore((state: any) => state.setDuration);
  const setTauriStartTime = useRecordingStore((s: any) => s.setTauriStartTime);
  // Lire l'état global persisté pour la restauration au remontage (mode Tauri)
  const globalRecordingState = useRecordingStore((s: any) => s.state);
  const globalRecordingDuration = useRecordingStore((s: any) => s.duration);
  const tauriStartTime = useRecordingStore((s: any) => s.tauriStartTime);
  
  const addMeetingToStore = useDataStore((state) => state.addMeeting);

  // ✅ CORRECTION #3 : Utiliser le context global pour isUploading
  const routeContext = useRouteContext();
  const setIsUploadingGlobal = routeContext?.setIsUploading;

  // Initialiser avec l'état actuel du recordingManager pour la persistance
  // En mode Tauri : lire depuis le store Zustand (mis à jour par RecordingBanner/polling)
  const [state, setState] = useState<RecordingState>(() => {
    if (isTauriApp()) {
      // Le store Zustand a été mis à jour par RecordingBanner en arrière-plan
      const storeState = globalRecordingState;
      if (storeState === 'recording' || storeState === 'paused') return storeState as RecordingState;
      return 'idle';
    }
    const managerState = recordingManager.getState();
    return managerState === 'stopped' ? 'idle' : managerState;
  });
  const [duration, setDuration] = useState(() => {
    if (isTauriApp()) return globalRecordingDuration;
    return recordingManager.getCurrentDuration();
  });
  const [audioLevel, setAudioLevel] = useState(0);
  const [systemAudioLevel, setSystemAudioLevel] = useState(0);
  const [systemAudioActive, setSystemAudioActive] = useState(false);
  const [systemAudioPermission, setSystemAudioPermission] = useState<boolean | null>(null);
  // Ref pour le debounce de la désactivation du son système (évite le clignotement)
  const systemAudioOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // État local pour l'UI
  const [uploadProgress, setUploadProgress] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [title, setTitle] = useState('');
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showSaveValidation, setShowSaveValidation] = useState(false);
  const [showDiscardValidation, setShowDiscardValidation] = useState(false);
  const [lottieLoaded, setLottieLoaded] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);
  const [hasPendingRecordings, setHasPendingRecordings] = useState(false);
  const [showRecoveryOverlay, setShowRecoveryOverlay] = useState(false);

  // Discovery quota state
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dotLottieRef = useRef<any>(null);
  const isDiscardingRef = useRef(false); // Flag pour éviter de rouvrir le dialog après discard
  const [, forceUpdate] = useState(0);

  // ── Vérification permission son système (Tauri, macOS) ──
  // Retry car __TAURI__ peut ne pas être disponible immédiatement après une navigation
  useEffect(() => {
    let cancelled = false;
    const check = async (retries = 3): Promise<void> => {
      if (cancelled) return;
      // Attendre que __TAURI__ soit disponible (peut prendre quelques ms après navigation)
      if (!isTauriApp()) {
        if (retries > 0) {
          setTimeout(() => check(retries - 1), 200);
          return;
        }
        return;
      }
      try {
        const hasPerm = await tauriHasSystemAudioPermission();
        if (!cancelled) setSystemAudioPermission(hasPerm);
      } catch {
        if (!cancelled) setSystemAudioPermission(false);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  // ── Gestion Tauri au montage/démontage ──
  useEffect(() => {
    if (!isTauriApp()) return;

    // Au remontage : si un enregistrement est actif, relancer le timer de durée
    const storeState = globalRecordingState;
    if (storeState === 'recording' || storeState === 'paused') {
      // Synchroniser l'état local avec le store global
      setState(storeState as RecordingState);

      if (storeState === 'recording' && tauriStartTime) {
        // Recalculer la durée exacte depuis le vrai timestamp de démarrage
        const currentElapsed = Math.floor((Date.now() - tauriStartTime) / 1000);
        setDuration(currentElapsed);
        setRecordingDuration(currentElapsed);

        // Relancer le timer en continu depuis le startTime réel
        const durationInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - tauriStartTime) / 1000);
          setDuration(elapsed);
          setRecordingDuration(elapsed);
        }, 1000);
        (window as any).__gilbertDurationInterval = durationInterval;
      } else if (storeState === 'paused') {
        setDuration(globalRecordingDuration);
      }

      // Relancer le polling des niveaux audio
      tauriRecordingService.startAudioLevelPolling({
        onMicLevel: (level) => setAudioLevel(level),
      });
    }

    return () => {
      // Au démontage : stopper le polling audio uniquement
      // Le timer (__gilbertDurationInterval) continue à tourner — RecordingBanner lit le store
      tauriRecordingService.stopAudioLevelPolling();
      // Nettoyer le debounce du son système
      if (systemAudioOffTimerRef.current) {
        clearTimeout(systemAudioOffTimerRef.current);
        systemAudioOffTimerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ SOLUTION 1 : Handlers pagehide et visibilitychange pour mobile
  useEffect(() => {
    const handlePageHide = async () => {
      const isRecording = state === 'recording' || state === 'paused';
      if (isRecording) {
        logger.warn('⚠️ Page en cours de masquage (pagehide) - Flush d\'urgence...');
        try {
          await recordingManager.flushPendingChunks();
          logger.debug('✅ Chunks flushés avant masquage de la page');
        } catch (error) {
          logger.error('❌ Erreur flush pagehide:', error);
        }
      }
    };

    const handleVisibilityChange = async () => {
      const isRecording = state === 'recording' || state === 'paused';
      if (isRecording && document.hidden) {
        logger.warn('⚠️ Page masquée (visibilitychange) - Flush d\'urgence...');
        try {
          await recordingManager.flushPendingChunks();
          logger.debug('✅ Chunks flushés avant masquage de la page');
        } catch (error) {
          logger.error('❌ Erreur flush visibilitychange:', error);
        }
      }
    };

    // ⚠️ PROTECTION RENFORCÉE CONTRE LA FERMETURE DE LA PAGE
    const handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
      const isRecording = state === 'recording' || state === 'paused';
      const isUploadingNow = isUploading;
      
      // ✅ CORRECTION : Ne pas bloquer si on est offline et qu'on ne peut pas uploader
      // Si on est en train d'uploader mais qu'on est offline, permettre de quitter
      if (isUploadingNow && !navigator.onLine && connectionStatus === 'offline') {
        logger.debug('⚠️ Upload impossible (offline) - Autorisation de quitter');
        return undefined; // Permettre de quitter
      }
      
      if (isRecording) {
        const message = '⚠️ ENREGISTREMENT EN COURS ⚠️\n\nL\'audio est sauvegardé localement, mais fermer cette page interrompra l\'enregistrement.\n\nÊtes-vous sûr de vouloir quitter ?';
        event.preventDefault();
        // Pour les navigateurs modernes
        event.returnValue = message;
        // Pour Chrome
        return message;
      }
      
      if (isUploadingNow && navigator.onLine) {
        const message = '⚠️ UPLOAD EN COURS ⚠️\n\nL\'enregistrement est en train d\'être uploadé. Fermer cette page interrompra l\'upload.\n\nÊtes-vous sûr de vouloir quitter ?';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
      
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state, isUploading, connectionStatus]);

  // Force re-render for audio bars animation
  useEffect(() => {
    let frame: number;
    const animate = (): void => {
      forceUpdate(n => n + 1);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, []);

  // Énumérer les micros sans demander getUserMedia au chargement (évite le flash "micro activé puis désactivé" au reload)
  const loadDevices = useCallback(async (): Promise<void> => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const mics = list
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Micro ${i + 1}` }));
      setDevices(mics);
      if (mics.length > 0 && !selectedDevice) setSelectedDevice(mics[0].deviceId);
    } catch {
      setError('Microphone inaccessible');
    }
  }, [selectedDevice]);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
  }, [loadDevices]);

  useEffect(() => {
    return () => {
      // Ne pas arrêter le stream si un enregistrement est actif
      // Le stream doit être conservé dans recordingManager pour continuer l'enregistrement
      const isActive = recordingManager.isActive();
      
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      audioCtxRef.current?.close();
      
      // Ne pas arrêter le stream si un enregistrement est en cours
      // Le stream est géré par recordingManager qui doit le conserver
      if (!isActive && streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      // Si un enregistrement est actif, on garde le stream pour recordingManager
    };
  }, []);

  // Resynchronisation avec recordingManager quand on revient sur la page
  // (l'enregistrement a pu continuer en arrière-plan)
  useEffect(() => {
    const managerState = recordingManager.getState();
    const isManagerActive = recordingManager.isActive();

    if (isManagerActive) {
      // Un enregistrement est en cours, reconnecter les callbacks
      recordingManager.updateCallbacks({
        onDurationUpdate: (duration) => {
          setDuration(duration);
          setRecordingDuration(duration); // Mettre à jour le store global
        },
        onStateChange: (s) => {
          if (s === 'recording') {
            setState('recording');
            setRecordingState('recording'); // Mettre à jour le store global
          } else if (s === 'paused') {
            setState('paused');
            setRecordingState('paused'); // Mettre à jour le store global
          } else if (s === 'idle') {
            setState('idle');
            setRecordingState('idle'); // Mettre à jour le store global
          }
        },
        onRecordingComplete: (blob) => {
          if (isDiscardingRef.current) {
            isDiscardingRef.current = false;
            return;
          }
          setAudioBlob(blob);
          setShowSave(true);
          setShowSaveDialog(true);
        },
      });

      // Mettre à jour l'état local avec l'état actuel
      const currentState = managerState === 'stopped' ? 'idle' : managerState;
      setState(currentState);
      setDuration(recordingManager.getCurrentDuration());
      // Mettre à jour le store global
      setRecordingState(currentState);
      setRecordingDuration(recordingManager.getCurrentDuration());

      // Démarrer la visualisation audio si on n'a pas déjà un stream
      if (!streamRef.current && (managerState === 'recording' || managerState === 'paused')) {
        // On utilise un timeout car startViz dépend de selectedDevice qui peut ne pas être encore chargé
        const initViz = async (): Promise<void> => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            analyserRef.current = analyser;

            const update = (): void => {
              if (!analyserRef.current) return;
              const data = new Uint8Array(analyserRef.current.frequencyBinCount);
              analyserRef.current.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < 32; i++) sum += data[i];
              const level = sum / 32 / 255;
              setAudioLevel(prev => prev * 0.3 + level * 0.7);
              animationRef.current = requestAnimationFrame(update);
            };
            update();
          } catch {
            // Silently fail - user might have denied permission
            logger.warn('Could not restart audio visualization');
          }
        };
        void initViz();
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ Vérifier périodiquement s'il y a des enregistrements en attente (exclut ceux déjà transcrits)
  useEffect(() => {
    const checkPendingRecordings = async () => {
      try {
        const pendingRecordings = await getPendingRecordingsForRecovery();
        const currentRecordingUuid = recordingManager.getCurrentRecordingUuid();
        const oldFailedRecordings = pendingRecordings.filter(
          (r: { uuid: string }) => r.uuid !== currentRecordingUuid
        );
        setHasPendingRecordings(oldFailedRecordings.length > 0);
      } catch (error) {
        logger.error('Erreur vérification enregistrements pendants:', error);
      }
    };

    // Vérifier immédiatement
    checkPendingRecordings();

    // Vérifier toutes les 30 secondes
    const interval = setInterval(checkPendingRecordings, 30000);

    return () => clearInterval(interval);
  }, []);

  // 🎯 Vérifier le quota Discovery au chargement
  useEffect(() => {
    const checkDiscoveryQuota = async () => {
      try {
        const status = await getDiscoveryStatus();
        setDiscoveryStatus(status);
        // Vérifier si le quota est épuisé (plan discovery ET minutes_remaining <= 0)
        if (status.subscription_plan === 'discovery' && status.minutes_remaining <= 0) {
          setIsQuotaExceeded(true);
        } else {
          setIsQuotaExceeded(false);
        }
      } catch (error) {
        logger.error('Erreur lors de la vérification du quota Discovery:', error);
        // En cas d'erreur, on laisse l'enregistrement possible
        setIsQuotaExceeded(false);
      }
    };

    checkDiscoveryQuota();
  }, []);

  // Connection monitoring - UNIQUEMENT pendant l'enregistrement
  useEffect(() => {
    const isRecording = state === 'recording' || state === 'paused';
    
    if (isRecording) {
      // Démarrer le monitoring seulement pendant l'enregistrement
      connectionMonitor.start({
        checkInterval: 30000, // Check every 30 seconds (moins agressif pour éviter les faux positifs)
        onStatusChange: async (status) => {
          setConnectionStatus(status);
          // Show warning ONLY if we go offline during recording AND navigator.onLine is false
          // Ne pas afficher si c'est juste un problème d'endpoint health check
          if (status === 'offline' && !navigator.onLine) {
            // Vraiment offline - afficher le warning
            setShowOfflineWarning(true);
            
            // ✅ SOLUTION 2 : Flush d'urgence à la déconnexion pour sauvegarder tous les chunks en mémoire
            try {
              const currentUuid = recordingManager.getCurrentRecordingUuid();
              if (currentUuid && recordingManager.isActive()) {
                logger.warn('⚠️ Perte de connexion détectée - Flush d\'urgence des chunks...');
                
                // Flush immédiat de tous les chunks en attente
                await recordingManager.flushPendingChunks();
                logger.debug('✅ Chunks flushés d\'urgence - Enregistrement protégé');
              }
            } catch (error) {
              logger.error('❌ Erreur lors du flush d\'urgence:', error);
            }
          } else if (status === 'online' && showOfflineWarning) {
            // Auto-dismiss warning when back online
            setTimeout(() => setShowOfflineWarning(false), 2000);
            
            // ✅ Vérifier s'il y a des enregistrements en attente après reconnexion (exclut déjà transcrits)
            try {
              const pendingRecordings = await getPendingRecordingsForRecovery();
              const currentRecordingUuid = recordingManager.getCurrentRecordingUuid();
              const oldFailedRecordings = pendingRecordings.filter(
                (r: { uuid: string }) => r.uuid !== currentRecordingUuid
              );
              if (oldFailedRecordings.length > 0) {
                logger.debug(`📦 ${oldFailedRecordings.length} enregistrement(s) en attente détecté(s) après reconnexion`);
                setHasPendingRecordings(true);
                // Optionnel : ouvrir automatiquement le dialog après reconnexion
                // setShowRecoveryDialog(true);
              } else {
                setHasPendingRecordings(false);
              }
            } catch (error) {
              logger.error('Erreur vérification enregistrements en attente:', error);
            }
          }
        }
      });
    } else {
      // Arrêter le monitoring quand on n'enregistre pas
      connectionMonitor.stop();
      // Réinitialiser le statut à online quand on arrête l'enregistrement
      setConnectionStatus('online');
      setShowOfflineWarning(false);
    }

    return () => {
      // Nettoyer seulement si on quitte la page pendant l'enregistrement
      if (isRecording) {
        connectionMonitor.stop();
      }
    };
  }, [state, showOfflineWarning]);

  const startViz = useCallback(async (): Promise<void> => {
    try {
      const constraints = selectedDevice
        ? { audio: { deviceId: { exact: selectedDevice }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }
        : { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Conserver le stream original pour l'enregistrement
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      // Utiliser le stream original pour la visualisation (MediaStreamSource peut partager le stream)
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const update = (): void => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < 32; i++) sum += data[i];
        const level = sum / 32 / 255;
        setAudioLevel(prev => prev * 0.3 + level * 0.7);
        animationRef.current = requestAnimationFrame(update);
      };
      update();
    } catch (err: any) {
      logger.error('Erreur lors de la demande d\'accès au microphone:', err);
      setError(err.message || 'Erreur microphone');
    }
  }, [selectedDevice]);

  const stopViz = useCallback((): void => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    audioCtxRef.current?.close();
    
    // Ne pas arrêter le stream si un enregistrement est actif
    // Le stream doit être conservé dans recordingManager pour continuer l'enregistrement
    const isActive = recordingManager.isActive();
    
    if (!isActive && streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    // Si un enregistrement est actif, on garde le stream pour recordingManager
    
    analyserRef.current = null;
    audioCtxRef.current = null;
    // Ne pas mettre streamRef.current à null si un enregistrement est actif
    if (!isActive) {
      streamRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const handleStart = useCallback(async (): Promise<void> => {
    setError(null);
    isDiscardingRef.current = false;

    if (isQuotaExceeded) {
      setError('Votre quota Discovery est épuisé. Passez à Gilbert Pro pour continuer à enregistrer.');
      return;
    }

    // ── Mode Tauri (app desktop) : audio système + micro via Rust ──
    if (isTauriApp()) {
      try {
        const token = tauriRecordingService.getAuthToken();
        await tauriStartRecording('both', token, title || undefined);

        // Polling des niveaux audio pour la visualisation des barres
        tauriRecordingService.startAudioLevelPolling({
          onMicLevel: (level) => setAudioLevel((prev) => prev * 0.3 + level * 0.7),
          onSystemLevel: (level) => {
            setSystemAudioLevel((prev) => prev * 0.3 + level * 0.7);
            if (level > 0.01) {
              // Son détecté → activer immédiatement et annuler le timer d'extinction
              if (systemAudioOffTimerRef.current) {
                clearTimeout(systemAudioOffTimerRef.current);
                systemAudioOffTimerRef.current = null;
              }
              setSystemAudioActive(true);
            } else {
              // Son absent → attendre 2s avant de passer à inactif (debounce)
              if (!systemAudioOffTimerRef.current) {
                systemAudioOffTimerRef.current = setTimeout(() => {
                  setSystemAudioActive(false);
                  systemAudioOffTimerRef.current = null;
                }, 2000);
              }
            }
          },
        });

        // Stocker le timestamp de démarrage dans le store pour survivre à la navigation
        const startTime = Date.now();
        setTauriStartTime(startTime);

        // Timer de durée calculé depuis le vrai startTime (recalculable au remontage)
        const durationInterval = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setDuration(elapsed);
          setRecordingDuration(elapsed);
        }, 1000);
        // Stocker le timer pour pouvoir l'arrêter
        (window as any).__gilbertDurationInterval = durationInterval;

        setState('recording');
        setRecordingState('recording');
        logger.debug('✅ Enregistrement Tauri démarré (audio système + micro)');
        return;
      } catch (err: any) {
        logger.error('❌ Erreur démarrage Tauri:', err);
        setError(err.message || 'Erreur lors du démarrage de l\'enregistrement desktop');
        return;
      }
    }

    // ── Mode Web standard : microphone via MediaRecorder ──
    try {
      await startViz();

      if (!streamRef.current) {
        throw new Error('Stream audio non disponible');
      }

      const result = await recordingManager.startRecording({
        stream: streamRef.current,
        onDurationUpdate: (d) => {
          setDuration(d);
          setRecordingDuration(d);
        },
        onStateChange: (s) => {
          if (s === 'recording') {
            setState('recording');
            setRecordingState('recording');
          } else if (s === 'paused') {
            setState('paused');
            setRecordingState('paused');
          } else if (s === 'idle') {
            setState('idle');
            setRecordingState('idle');
          }
        },
        onRecordingComplete: (blob) => {
          if (isDiscardingRef.current) {
            isDiscardingRef.current = false;
            return;
          }
          setAudioBlob(blob);
          setShowSave(true);
          setShowSaveDialog(true);
        },
      });

      if (!result.success) {
        setError(result.error ?? 'Erreur');
        stopViz();
        return;
      }

      try {
        await apiClient.post('/api/recordings/start', { device_type: 'web' });
        logger.debug('✅ Backend notifié du démarrage de l\'enregistrement (device: web)');
      } catch (error) {
        logger.error('❌ Erreur notification backend:', error);
      }

      setState('recording');
      setRecordingState('recording');
    } catch (err: any) {
      logger.error('Erreur lors du démarrage de l\'enregistrement:', err);
      setError(err.message || 'Erreur lors du démarrage de l\'enregistrement');
      stopViz();
    }
  }, [startViz, stopViz, isQuotaExceeded, title, setRecordingDuration, setRecordingState]);

  const handlePause = useCallback(async (): Promise<void> => {
    if (isTauriApp()) {
      await tauriPauseRecording();
      clearInterval((window as any).__gilbertDurationInterval);
      tauriRecordingService.stopAudioLevelPolling();
    } else {
      await recordingManager.pauseRecording();
    }
    setState('paused');
    setRecordingState('paused');
  }, [setRecordingState]);

  const handleResume = useCallback(async (): Promise<void> => {
    if (isTauriApp()) {
      await tauriResumeRecording();
      // Reprendre le polling des niveaux audio
      tauriRecordingService.startAudioLevelPolling({
        onMicLevel: (level) => setAudioLevel((prev) => prev * 0.3 + level * 0.7),
        onSystemLevel: (level) => {
          setSystemAudioLevel((prev) => prev * 0.3 + level * 0.7);
          if (level > 0.01) {
            if (systemAudioOffTimerRef.current) {
              clearTimeout(systemAudioOffTimerRef.current);
              systemAudioOffTimerRef.current = null;
            }
            setSystemAudioActive(true);
          } else {
            if (!systemAudioOffTimerRef.current) {
              systemAudioOffTimerRef.current = setTimeout(() => {
                setSystemAudioActive(false);
                systemAudioOffTimerRef.current = null;
              }, 2000);
            }
          }
        },
      });
      // Reprendre le timer (approximation basée sur la durée actuelle)
      const pausedDuration = duration;
      const resumeTime = Date.now();
      const durationInterval = setInterval(() => {
        const elapsed = pausedDuration + Math.floor((Date.now() - resumeTime) / 1000);
        setDuration(elapsed);
        setRecordingDuration(elapsed);
      }, 1000);
      (window as any).__gilbertDurationInterval = durationInterval;
    } else {
      await recordingManager.resumeRecording();
    }
    setState('recording');
    setRecordingState('recording');
  }, [setRecordingState, duration, setRecordingDuration]);

  // "Terminer" met juste en pause et affiche le dialog de sauvegarde
  const handleStop = useCallback(async (): Promise<void> => {
    if (isTauriApp()) {
      await tauriPauseRecording();
      clearInterval((window as any).__gilbertDurationInterval);
      tauriRecordingService.stopAudioLevelPolling();
    } else {
      await recordingManager.pauseRecording();
    }
    setState('paused');
    setShowSave(true);
    setShowSaveDialog(true);
  }, [setShowSaveDialog]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!title.trim()) return;
      setIsUploading(true);
      // ✅ CORRECTION #3 : Synchroniser avec le context global
      if (setIsUploadingGlobal) setIsUploadingGlobal(true);
      // Démarrer la progression à 2% immédiatement pour un feedback visuel rapide
      setUploadProgress(2);
    try {
      // ── Mode Tauri : stop_record envoie directement l'audio au backend Rust ──
      if (isTauriApp()) {
        const token = tauriRecordingService.getAuthToken();
        clearInterval((window as any).__gilbertDurationInterval);
        tauriRecordingService.unsubscribeAll();
        await tauriStopRecording(token, title.trim());

        setShowSave(false);
        setShowSaveDialog(false);
        setAudioBlob(null);
        setTitle('');
        setDuration(0);
        setState('idle');
        resetRecordingStore();
        setRecordingState('idle');
        setRecordingDuration(0);
        setIsUploading(false);
        if (setIsUploadingGlobal) setIsUploadingGlobal(false);
        setShowSaveValidation(true);
        return;
      }
      const recordingUuidForTitle = recordingManager.getCurrentRecordingUuid();
      if (recordingUuidForTitle && title.trim()) {
        try {
          // Mettre à jour le titre dans IndexedDB avant l'upload
          await recordingStorage.updateRecordingMetadata(recordingUuidForTitle, title.trim());
          logger.debug(`✅ Titre sauvegardé: "${title.trim()}"`);
        } catch (storageError) {
          logger.warn('⚠️ Erreur lors de la sauvegarde du titre:', storageError);
        }
      }

      // Finaliser l'enregistrement maintenant (si pas déjà un fichier importé)
      let blobToUpload = audioBlob;
      if (!blobToUpload) {
        setState('processing');
        blobToUpload = await recordingManager.finalizeRecording();
        stopViz();
      }

      if (!blobToUpload) {
        setError('Aucun enregistrement à sauvegarder');
        setIsUploading(false);
        return;
      }

      // Utiliser le type MIME réel du blob, pas un type forcé
      const mimeType = blobToUpload.type || 'audio/webm';
      const extension = mimeType.includes('wav') ? 'wav'
        : mimeType.includes('mp4') ? 'mp4'
        : mimeType.includes('ogg') ? 'ogg'
        : 'webm';
      const file = new File([blobToUpload], `${title}.${extension}`, { type: mimeType });
      logger.debug('📤 Upload démarré:', {
        title,
        size: file.size,
        type: file.type,
        blobType: blobToUpload.type,
        extension
      });
      // ✅ Vérifier la connexion avant d'uploader
      const isOffline = !navigator.onLine || connectionStatus === 'offline';
      if (isOffline) {
        throw new Error('OFFLINE'); // Marqueur spécial pour détecter l'erreur offline
      }
      
      // ✅ CORRECTION #3 : Synchroniser avec le context global
      if (setIsUploadingGlobal) setIsUploadingGlobal(true);
      
      const meeting = await uploadMeeting(file, title, { onProgress: (p: number) => setUploadProgress(p) });
      logger.debug('✅ Upload réussi:', {
        id: meeting.id,
        title: meeting.title,
        file_url: meeting.file_url,
        transcript_status: meeting.transcript_status,
        transcription_status: meeting.transcription_status,
      });

      // Marquer comme uploadé et supprimer de IndexedDB
      const recordingUuid = recordingManager.getCurrentRecordingUuid();
      if (recordingUuid) {
        try {
          // ✅ CORRECTION: Utiliser l'import statique et supprimer immédiatement
          await recordingStorage.updateUploadStatus(recordingUuid, 'completed', meeting.id);
          await recordingStorage.deleteRecording(recordingUuid);
          logger.debug('✅ Enregistrement supprimé de IndexedDB après upload réussi');
        } catch (storageError) {
          logger.warn('⚠️ Erreur lors de la mise à jour du statut dans IndexedDB:', storageError);
        }
      }

      // Ajouter immédiatement le meeting au store Zustand pour qu'il apparaisse
      // sur la page Mes échanges sans attendre le prochain fetchMeetings
      addMeetingToStore(meeting);

      // Lancer le watcher de transcription - il va notifier via onTranscriptionCompleted
      // quand la transcription est terminée, même après navigation vers /meetings
      if (meeting?.id) {
        watchTranscriptionStatus(meeting.id);
      }

      // Notifier le backend de l'arrêt de l'enregistrement
      try {
        await apiClient.post('/api/recordings/stop');
        logger.debug('✅ Backend notifié de l\'arrêt de l\'enregistrement');
      } catch (error) {
        logger.error('❌ Erreur lors de la notification du backend:', error);
        // Ne pas bloquer la sauvegarde si la notification échoue
      }

      setShowSave(false);
      setShowSaveDialog(false);
      setAudioBlob(null);
      setTitle('');
      setDuration(0);
      setState('idle');
      // Reset le store global pour que le banner disparaisse
      resetRecordingStore();
      setRecordingState('idle');
      setRecordingDuration(0);
      setRecordingState('idle');
      setRecordingDuration(0);
      // Afficher l'animation de validation avant de naviguer
      setShowSaveValidation(true);
    } catch (err: any) {
      logger.error('❌ Erreur upload:', err);
      
      const isOfflineError = err?.message === 'OFFLINE' || !navigator.onLine || connectionStatus === 'offline';
      
      // Sauvegarder localement en cas d'erreur d'upload (toujours marquer pour la récupération)
      const recordingUuid = recordingManager.getCurrentRecordingUuid();
      if (recordingUuid && audioBlob) {
        try {
          await recordingStorage.updateRecordingMetadata(recordingUuid, title.trim());
          const reason = isOfflineError ? 'offline' : 'error';
          await recordingStorage.updateUploadStatus(recordingUuid, 'failed', undefined, reason);
          logger.debug(`✅ Enregistrement marqué failed (${reason}) pour récupération ultérieure`);
        } catch (storageError) {
          logger.warn('⚠️ Erreur lors de la sauvegarde locale:', storageError);
        }
      }
      
      // ✅ CORRECTION #1 : Si offline, fermer le dialog et permettre de quitter
      if (isOfflineError) {
        setError('Pas de connexion internet. L\'enregistrement est sauvegardé localement et pourra être uploadé plus tard.');
        // Fermer le dialog pour permettre à l'utilisateur de quitter
        setShowSave(false);
        setShowSaveDialog(false);
        // Reset les états
        setAudioBlob(null);
        setTitle('');
        setState('idle');
        resetRecordingStore();
        setRecordingState('idle');
        setRecordingDuration(0);
        
        // ✅ CORRECTION : Message plus clair sans référence à un menu inexistant
        setTimeout(() => {
          alert('📦 Enregistrement sauvegardé localement\n\nVous pourrez l\'uploader plus tard depuis la page d\'accueil. Un bouton "Récupérer les enregistrements" apparaîtra automatiquement quand vous reviendrez sur la page.');
        }, 500);
      } else {
        // Pour les autres erreurs, garder le dialog ouvert pour réessayer
        setError(err?.message || 'Erreur upload - L\'enregistrement a été sauvegardé localement et pourra être uploadé plus tard');
      }
    } finally {
      setIsUploading(false);
      // ✅ CORRECTION #3 : Synchroniser avec le context global
      if (setIsUploadingGlobal) setIsUploadingGlobal(false);
    }
  }, [audioBlob, title, stopViz, resetRecordingStore, setIsUploadingGlobal, connectionStatus, setRecordingState, setRecordingDuration]);

  // Callback quand l'animation de validation est terminée
  const handleSaveValidationComplete = useCallback(() => {
    setShowSaveValidation(false);
    navigate('/meetings');
  }, [navigate]);

  // Demander confirmation avant de jeter l'enregistrement
  const handleCancelClick = useCallback((): void => {
    if (isUploading) return;
    setShowDiscardConfirm(true);
  }, [isUploading]);

  // Reprendre l'enregistrement depuis le dialog
  const handleResumeRecording = useCallback(async (): Promise<void> => {
    setShowSave(false);
    setShowSaveDialog(false);
    setShowDiscardConfirm(false);
    // Reprendre la visualisation audio
    await startViz();
    // Reprendre l'enregistrement
    await recordingManager.resumeRecording();
    setState('recording');
    setRecordingState('recording'); // Mettre à jour le store global
  }, [startViz, setRecordingState, setShowSaveDialog]);

  // Confirmer la suppression - finalize et jeter l'enregistrement
  const handleConfirmDiscard = useCallback(async (): Promise<void> => {
    isDiscardingRef.current = true;

    setShowDiscardConfirm(false);
    setShowSave(false);
    setShowSaveDialog(false);

    // ── Mode Tauri : annuler via le backend Rust ──
    if (isTauriApp()) {
      clearInterval((window as any).__gilbertDurationInterval);
      tauriRecordingService.unsubscribeAll();
      try {
        await tauriCancelRecording();
      } catch (err) {
        logger.warn('⚠️ Erreur cancel Tauri:', err);
      }
      setAudioBlob(null);
      setTitle('');
      setDuration(0);
      setState('idle');
      setRecordingState('idle');
      setRecordingDuration(0);
      resetRecordingStore();
      setShowDiscardValidation(true);
      return;
    }

    // ── Mode Web standard ──
    const recordingUuid = recordingManager.getCurrentRecordingUuid();

    await recordingManager.finalizeRecording();

    if (recordingUuid) {
      try {
        await recordingStorage.deleteRecording(recordingUuid);
        logger.debug('🗑️ Enregistrement supprimé de IndexedDB');
      } catch (error) {
        logger.warn('⚠️ Erreur suppression IndexedDB:', error);
      }
    }
    stopViz();

    try {
      await apiClient.post('/api/recordings/stop');
      logger.debug('✅ Backend notifié de l\'arrêt de l\'enregistrement (discard)');
    } catch (error) {
      logger.error('❌ Erreur lors de la notification du backend:', error);
    }

    setAudioBlob(null);
    setTitle('');
    setDuration(0);
    setState('idle');
    setRecordingState('idle');
    setRecordingDuration(0);
    setShowDiscardValidation(true);
  }, [stopViz, setRecordingState, setRecordingDuration, resetRecordingStore]);

  // Callback quand l'animation de discard est terminée
  const handleDiscardValidationComplete = useCallback(() => {
    setShowDiscardValidation(false);
  }, []);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTitle(file.name.replace(/\.[^/.]+$/, ''));
    setAudioBlob(file);
    setShowSave(true);
    setShowSaveDialog(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  useEffect(() => {
    if (showSave) setTimeout(() => inputRef.current?.focus(), 100);
  }, [showSave]);

  const isActive = state === 'recording' || state === 'paused';
  const currentDevice = devices.find(d => d.deviceId === selectedDevice);

  // Contrôle de l'animation Lottie selon l'état
  useEffect(() => {
    const lottie = dotLottieRef.current;
    if (!lottie) return;

    if (state === 'recording') {
      // Enregistrement : animation normale, ils parlent et travaillent
      lottie.setSpeed(1);
      lottie.setLoop(true);
      lottie.play();
    } else if (state === 'paused') {
      // Pause : animation lente, ils ralentissent
      lottie.setSpeed(0.15);
      lottie.setLoop(true);
      lottie.play();
    } else {
      // Idle : animation très lente pour un effet "vivant" au repos
      lottie.setSpeed(0.08);
      lottie.setLoop(true);
      lottie.play();
    }
  }, [state]);

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-50">
      {/* 🎯 Bannière quota Discovery épuisé - minimaliste */}
      {isQuotaExceeded && state === 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-3 right-3 z-50"
        >
          <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex items-center gap-2">
            <span className="text-amber-500 text-sm">🔒</span>
            <span className="text-slate-600 text-sm">Quota épuisé</span>
            <button
              onClick={() => navigate('/settings')}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium ml-1"
            >
              Passer à Pro →
            </button>
          </div>
        </motion.div>
      )}

      {/* Fond subtil avec motif */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      }} />

      {/* Animation Lottie en fond - apparaît après chargement */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: lottieLoaded
            ? (state === 'recording' ? 0.85 : state === 'paused' ? 0.5 : 0.6)
            : 0.4, // Afficher avec une opacité réduite même si pas encore chargé
        }}
        transition={{
          duration: lottieLoaded ? 0.8 : 0.5,
          ease: [0.4, 0, 0.2, 1],
        }}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{
          zIndex: 1, // S'assurer que l'animation est au-dessus du fond
        }}
      >
        {/* Masque dégradé léger pour adoucir le haut */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(248,250,252,0.7) 0%, transparent 8%, transparent 100%)',
          }}
        />

        {/* Animation Lottie - collée en bas, prend toujours toute la largeur */}
        {/* Sur mobile: beaucoup plus grande avec scale, sur desktop: taille normale */}
        <div
          className="absolute bottom-0 left-0 right-0 w-full overflow-hidden sm:scale-100"
          style={{
            height: '95vh',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {/* Le conteneur interne force le Lottie à prendre toute la largeur disponible */}
          {/* Téléphone (<640px): scale 2.5, petite tablette (640-768px): scale 1.2, tablette+ (>768px): scale 1 */}
          <div
            className="scale-[2.5] sm:scale-[1.2] md:scale-100 origin-bottom"
            style={{
              width: '100%',
              minWidth: '100%',
              aspectRatio: '16 / 9',
              position: 'relative',
            }}
          >
            <DotLottieReact
              src={LOTTIE_MEETING_URL}
              loop={isActive}
              autoplay={false}
              dotLottieRefCallback={(ref: any) => {
                dotLottieRef.current = ref;
                if (ref) {
                  ref.addEventListener('load', () => {
                    setLottieLoaded(true);
                    ref.setSpeed(0.08);
                    ref.setLoop(true);
                    ref.play();
                  });
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                bottom: 0,
                left: 0,
              }}
            />
          </div>
        </div>

        {/* Dégradé bleu en bas pour fondre avec le fond (évite le coin blanc) */}
        <div
          className="absolute bottom-0 left-0 right-0 h-8 z-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(59, 130, 246, 0.15) 0%, transparent 100%)',
          }}
        />
      </motion.div>

      {/* Overlay gradient quand enregistrement actif */}
      <AnimatePresence>
        {isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background: state === 'paused'
                ? 'radial-gradient(ellipse at center, transparent 30%, rgba(251, 191, 36, 0.05) 100%)'
                : 'radial-gradient(ellipse at center, transparent 30%, rgba(59, 130, 246, 0.08) 100%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Indicateur de connexion en haut à gauche */}
      <AnimatePresence>
        {connectionStatus !== 'online' && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute top-4 left-4 z-20"
          >
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-sm border text-sm font-medium ${
              connectionStatus === 'offline'
                ? 'bg-amber-50/90 border-amber-200 text-amber-700'
                : 'bg-slate-50/90 border-slate-200 text-slate-600'
            }`}>
              {connectionStatus === 'offline' ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  <span>Hors ligne</span>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full"
                  />
                  <span>Vérification...</span>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sélecteur de micro et bouton de récupération en haut à droite : Micro au-dessus, Récupérer en dessous, même taille */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-2">
        <div className="relative">
          <button
            onClick={() => !isActive && setShowDeviceMenu(!showDeviceMenu)}
            disabled={isActive}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:text-blue-700
                       rounded-xl bg-white/90 hover:bg-white border border-blue-200/60
                       transition-all duration-200 disabled:opacity-50 shadow-sm"
            type="button"
          >
            <MicrophoneIcon size={18} />
            <span className="max-w-[120px] truncate hidden sm:inline">
              {currentDevice?.label?.split(' ').slice(0, 2).join(' ') ?? 'Micro'}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showDeviceMenu ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showDeviceMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowDeviceMenu(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute top-full right-0 mt-2 w-72
                             bg-white rounded-xl shadow-2xl shadow-slate-200/50 border border-slate-100
                             overflow-hidden z-50"
                >
                  <div className="p-2">
                    {devices.map(d => (
                      <button
                        key={d.deviceId}
                        onClick={() => { setSelectedDevice(d.deviceId); setShowDeviceMenu(false); }}
                        className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 rounded-lg transition-all duration-200
                          ${d.deviceId === selectedDevice
                            ? 'bg-blue-50 text-blue-600'
                            : 'text-slate-600 hover:bg-slate-50'}`}
                        type="button"
                      >
                        {d.deviceId === selectedDevice ? (
                          <Check className="w-4 h-4 text-blue-500" />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                        <span className="truncate">{d.label}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Bouton Récupérer : même taille que le bouton Micro, sous le micro */}
        {hasPendingRecordings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative"
          >
            <Button
              onClick={() => setShowRecoveryOverlay(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:text-amber-700
                         rounded-xl bg-amber-50/90 hover:bg-amber-100 border border-amber-200/60
                         transition-all duration-200 shadow-sm font-medium"
              type="button"
            >
              <CloudUpload className="w-4 h-4" />
              <span className="hidden sm:inline">Récupérer</span>
            </Button>
          </motion.div>
        )}
      </div>

      {/* Contenu principal - Overlay */}
      <div className="flex-1 flex flex-col items-center justify-start pt-[8vh] sm:pt-[12vh] relative z-10 px-4">
        {/* Carte principale - fond opaque dès le premier paint pour éviter le flash transparent au reload */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[90vw] sm:max-w-sm"
        >
          <div
            className={`border border-slate-200/50 shadow-lg rounded-[1.5rem] overflow-hidden transition-all duration-500 flex flex-col gap-6 py-6 ${isActive ? 'backdrop-blur-md' : 'backdrop-blur-sm'}`}
            style={{
              backgroundColor: '#ffffff',
              backgroundImage: 'none',
            }}
          >
            <CardContent className="p-6 sm:p-6 py-8">
              {/* Barres audio - larges et centrées, plus grandes sur mobile */}
              <div className="flex justify-center mb-6 sm:mb-5">
                <AudioBars
                  audioLevel={audioLevel}
                  isActive={isActive}
                  isPaused={state === 'paused'}
                  maxHeight={100}
                />
              </div>

              {/* Indicateur son système (Tauri uniquement) */}
              {isTauriApp() && (
                <div className="flex items-center justify-center gap-2 mb-4 -mt-2">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium cursor-default"
                    style={{
                      backgroundColor: systemAudioPermission === false
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'rgba(148, 163, 184, 0.08)',
                      border: `1px solid ${
                        systemAudioPermission === false
                          ? 'rgba(239, 68, 68, 0.20)'
                          : 'rgba(148, 163, 184, 0.18)'
                      }`,
                    }}
                  >
                    {/* Pastille de statut */}
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          systemAudioPermission === false
                            ? '#ef4444'
                            : isActive && systemAudioActive
                              ? '#10b981'
                              : systemAudioPermission === true
                                ? '#10b981'
                                : '#94a3b8',
                        boxShadow:
                          isActive && systemAudioActive
                            ? '0 0 5px rgba(16, 185, 129, 0.55)'
                            : 'none',
                      }}
                    />
                    {/* Mini VU-mètre visible uniquement pendant l'enregistrement actif */}
                    {isActive && (
                      <div className="flex items-center gap-px">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="w-0.5 rounded-full transition-all duration-75"
                            style={{
                              height: `${5 + i * 1.5}px`,
                              backgroundColor: systemAudioLevel * 6 > i
                                ? (i < 4 ? '#10b981' : '#f59e0b')
                                : 'rgba(148, 163, 184, 0.22)',
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <span
                      style={{
                        color: systemAudioPermission === false ? '#ef4444' : '#64748b',
                      }}
                    >
                      {systemAudioPermission === false
                        ? 'Son système : permission manquante'
                        : 'Son système'}
                    </span>
                  </div>
                </div>
              )}

              {/* Timer - plus grand sur mobile */}
              <div className="text-center mb-6 sm:mb-5">
                <motion.div
                  className="text-5xl sm:text-5xl font-light tracking-tight tabular-nums text-slate-700"
                  animate={{
                    opacity: state === 'paused' ? [1, 0.5, 1] : 1,
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: state === 'paused' ? Infinity : 0,
                  }}
                >
                  {formatTime(duration)}
                </motion.div>
                <p className="mt-1 text-xs font-medium text-slate-400 tracking-wide">
                  {state === 'idle' && 'Prêt à enregistrer'}
                  {state === 'recording' && 'Enregistrement en cours'}
                  {state === 'paused' && 'En pause'}
                  {state === 'processing' && 'Traitement...'}
                </p>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center justify-center gap-3">
                {state === 'idle' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    <motion.button
                      onClick={handleStart}
                      initial={{ backgroundColor: '#60a5fa' }}
                      whileHover={{ backgroundColor: '#3b82f6', scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.2 }}
                      className="h-16 sm:h-14 px-12 sm:px-10 rounded-2xl text-lg sm:text-base font-semibold text-white
                                 flex items-center gap-3 cursor-pointer"
                    >
                      <MicrophoneIcon size={24} className="text-white" />
                      Enregistrer
                    </motion.button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,video/*"
                      onChange={handleFileImport}
                      className="hidden"
                    />
                  </motion.div>
                )}

                {state === 'recording' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-4 sm:gap-3"
                  >
                    <motion.button
                      onClick={handlePause}
                      whileHover={{ scale: 1.05, backgroundColor: 'rgba(251, 191, 36, 0.12)' }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="h-14 w-14 sm:h-12 sm:w-12 rounded-xl bg-transparent border border-amber-300/50 text-amber-500
                                 backdrop-blur-sm flex items-center justify-center"
                    >
                      <Pause className="w-6 h-6 sm:w-5 sm:h-5" />
                    </motion.button>
                    <motion.button
                      onClick={handleStop}
                      whileHover={{ scale: 1.03, backgroundColor: 'rgba(100, 116, 139, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="h-14 sm:h-12 px-8 sm:px-6 rounded-xl bg-transparent border border-slate-300/50 text-slate-600
                                 backdrop-blur-sm flex items-center gap-2 font-medium text-base sm:text-sm"
                    >
                      <Square className="w-5 h-5 sm:w-4 sm:h-4" />
                      Terminer
                    </motion.button>
                  </motion.div>
                )}

                {state === 'paused' && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-4 sm:gap-3"
                  >
                    <motion.button
                      onClick={handleResume}
                      whileHover={{ scale: 1.05, backgroundColor: 'rgba(59, 130, 246, 0.15)' }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="h-14 w-14 sm:h-12 sm:w-12 rounded-xl bg-transparent border border-blue-400/50 text-blue-500
                                 backdrop-blur-sm flex items-center justify-center"
                    >
                      <Play className="w-6 h-6 sm:w-5 sm:h-5 ml-0.5" />
                    </motion.button>
                    <motion.button
                      onClick={handleStop}
                      whileHover={{ scale: 1.03, backgroundColor: 'rgba(100, 116, 139, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.1 }}
                      className="h-14 sm:h-12 px-8 sm:px-6 rounded-xl bg-transparent border border-slate-300/50 text-slate-600
                                 backdrop-blur-sm flex items-center gap-2 font-medium text-base sm:text-sm"
                    >
                      <Square className="w-5 h-5 sm:w-4 sm:h-4" />
                      Terminer
                    </motion.button>
                  </motion.div>
                )}

                {state === 'processing' && (
                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-10 h-10 border-3 border-blue-200 border-t-blue-600 rounded-full"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </div>
        </motion.div>

        {/* Indicateur REC - en bas à droite sous l'overlay */}
        <AnimatePresence>
          {isActive && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm"
            >
              <motion.div
                className={`w-2.5 h-2.5 rounded-full ${
                  state === 'recording' ? 'bg-red-500' : 'bg-amber-500'
                }`}
                animate={{
                  scale: state === 'recording' ? [1, 1.3, 1] : 1,
                  opacity: state === 'recording' ? [1, 0.5, 1] : 1,
                }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className={`text-xs font-semibold tracking-wider ${
                state === 'recording' ? 'text-red-600' : 'text-amber-600'
              }`}>
                {state === 'recording' ? 'REC' : 'PAUSE'}
              </span>
              <span className="text-xs text-slate-500 font-medium tabular-nums">
                {formatTime(duration)}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Dialog sauvegarde */}
      <AnimatePresence>
        {showSave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: showDiscardConfirm ? 0 : 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-md"
            onClick={!isUploading && !showDiscardConfirm ? handleCancelClick : undefined}
            style={{ pointerEvents: showDiscardConfirm ? 'none' : 'auto' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{
                opacity: showDiscardConfirm ? 0 : 1,
                scale: showDiscardConfirm ? 0.95 : 1,
                y: showDiscardConfirm ? 10 : 0
              }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
              style={{ pointerEvents: showDiscardConfirm ? 'none' : 'auto' }}
            >
              <Card className="border-0 shadow-2xl rounded-[2rem] overflow-hidden bg-white">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                      <FileAudio className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-800">
                        Sauvegarder
                      </h2>
                      <p className="text-sm text-slate-500">
                        {duration > 0 ? `Durée : ${formatTime(duration)}` : 'Fichier importé'}
                      </p>
                    </div>
                  </div>

                  <Input
                    ref={inputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Nom de l'enregistrement"
                    disabled={isUploading}
                    className="h-12 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20"
                    onKeyDown={(e) => e.key === 'Enter' && title.trim() && !isUploading && handleSave()}
                  />

                  {isUploading && (
                    <div className="mt-5">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.max(2, uploadProgress)}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2 text-right">{Math.max(2, uploadProgress)}%</p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-6">
                    <Button
                      onClick={handleCancelClick}
                      disabled={isUploading}
                      variant="outline"
                      className="flex-1 h-12 rounded-xl border-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={!title.trim() || isUploading}
                      className="flex-1 h-12 rounded-xl bg-blue-500 hover:bg-blue-600
                                 hover:scale-[1.02] active:scale-[0.98] transition-all text-white"
                    >
                      Sauvegarder
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog de confirmation pour annuler */}
      <AnimatePresence>
        {showDiscardConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-sm"
            >
              <Card className="border-0 shadow-2xl rounded-2xl overflow-hidden bg-white">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold text-slate-800 mb-2">
                    Que souhaitez-vous faire ?
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    Vous pouvez reprendre l'enregistrement ou le supprimer définitivement.
                  </p>

                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={handleResumeRecording}
                      className="w-full h-12 rounded-xl bg-blue-500 hover:bg-blue-600 text-white
                                 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Reprendre l'enregistrement
                    </Button>
                    <Button
                      onClick={handleConfirmDiscard}
                      variant="outline"
                      className="w-full h-12 rounded-xl border-2 border-red-200 text-red-600
                                 hover:bg-red-50 hover:border-red-300
                                 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      Supprimer l'enregistrement
                    </Button>
                    <button
                      onClick={() => setShowDiscardConfirm(false)}
                      className="text-sm text-slate-400 hover:text-slate-600 transition-colors mt-1"
                    >
                      Retour
                    </button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast erreur */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3
                       bg-red-50 text-red-600 rounded-2xl shadow-lg border border-red-100
                       text-sm font-medium flex items-center gap-3"
          >
            {error}
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 transition-colors ml-1"
              type="button"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animation de validation après sauvegarde */}
      <SaveValidation
        show={showSaveValidation}
        onComplete={handleSaveValidationComplete}
      />

      {/* Animation d'avertissement après abandon */}
      <DiscardValidation
        show={showDiscardValidation}
        onComplete={handleDiscardValidationComplete}
      />

      {/* Modal d'avertissement hors ligne */}
      <AnimatePresence>
        {showOfflineWarning && connectionStatus === 'offline' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full max-w-sm"
            >
              <Card className="border-0 shadow-2xl rounded-2xl overflow-hidden bg-white">
                <CardContent className="p-6">
                  <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                    <CloudOff className="w-7 h-7 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800 text-center mb-2">
                    Connexion perdue
                  </h3>
                  <p className="text-sm text-slate-500 text-center mb-2">
                    Pas de panique ! Votre enregistrement continue et est sauvegardé localement.
                  </p>
                  <p className="text-xs text-slate-400 text-center mb-6">
                    Vous pourrez l'uploader dès que la connexion sera rétablie.
                  </p>
                  <Button
                    onClick={() => setShowOfflineWarning(false)}
                    className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium"
                  >
                    Compris, continuer
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast de reconnexion */}
      <AnimatePresence>
        {connectionStatus === 'online' && showOfflineWarning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            onAnimationComplete={() => {
              // Auto-dismiss after showing
              setTimeout(() => setShowOfflineWarning(false), 2000);
            }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] px-5 py-3
                       bg-emerald-50 text-emerald-600 rounded-2xl shadow-lg border border-emerald-100
                       text-sm font-medium flex items-center gap-3"
          >
            <Wifi className="w-4 h-4" />
            Connexion rétablie
          </motion.div>
        )}
      </AnimatePresence>

      <RecordingRecoveryOverlay
        open={showRecoveryOverlay}
        onClose={() => setShowRecoveryOverlay(false)}
        onRecoveriesCompleted={() => {
          setShowRecoveryOverlay(false);
          setHasPendingRecordings(false);
        }}
      />
    </div>
  );
}

export default ImmersiveRecordingPage;
