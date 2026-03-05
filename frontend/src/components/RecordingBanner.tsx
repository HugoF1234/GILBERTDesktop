/**
 * RecordingBanner - Bandeau affichant l'enregistrement en cours dans le header
 * Permet de voir le temps d'enregistrement et de revenir à la page d'enregistrement
 * Fonctionne en mode web (recordingManager) et en mode Tauri (polling get_status)
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Pause, Play } from 'lucide-react';
import { useRecordingStore, formatRecordingTime } from '@/stores/recordingStore';
import { recordingManager } from '@/services/recordingManager';
import { isTauriApp, tauriGetStatus } from '@/services/tauriRecordingService';
export default function RecordingBanner(): JSX.Element | null {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, duration, isActive, setDuration, setState, syncWithManager } = useRecordingStore();
  const tauriStartTime = useRecordingStore((s: any) => s.tauriStartTime);
  const tauriDurationRef = useRef<number>(0);

  // Synchronisation mode web
  useEffect(() => {
    if (isTauriApp()) return;
    syncWithManager();
    const syncInterval = setInterval(() => syncWithManager(), 1000);
    return () => clearInterval(syncInterval);
  }, [syncWithManager]);

  // Synchronisation mode Tauri — lit le store (mis à jour par ImmersiveRecordingPage)
  // + polling get_status pour détecter fin d'enregistrement
  useEffect(() => {
    if (!isTauriApp()) return;

    const pollStatus = async (): Promise<void> => {
      try {
        const status = await tauriGetStatus();
        const isPaused = (status as any).is_paused === true;

        if (status.is_recording) {
          setState(isPaused ? 'paused' : 'recording');
          // Mettre à jour la durée depuis tauriStartTime si disponible
          if (!isPaused && tauriStartTime) {
            const elapsed = Math.floor((Date.now() - tauriStartTime) / 1000);
            setDuration(elapsed);
          }
        } else {
          // Plus d'enregistrement actif
          tauriDurationRef.current = 0;
          setState('idle');
          setDuration(0);
        }
      } catch {
        // Silencieux si pas de réponse Tauri
      }
    };

    pollStatus();
    const pollInterval = setInterval(pollStatus, 2000);
    return () => clearInterval(pollInterval);
  }, [setState, setDuration, tauriStartTime]);

  // Handler pour naviguer vers la page d'enregistrement
  const handleClick = useCallback((): void => {
    navigate('/');
  }, [navigate]);

  // Ne pas afficher si on est déjà sur la page d'enregistrement
  const isOnRecordingPage = location.pathname === '/' || location.pathname === '/record';

  // Ne pas afficher si pas d'enregistrement actif
  if (!isActive || isOnRecordingPage) {
    return null;
  }

  const isRecording = state === 'recording';
  const isPaused = state === 'paused';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full bg-white border-b border-gray-100"
      >
        <div className="px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4 md:gap-6">
            {/* Left: Recording indicator */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Pulsing dot */}
              <motion.div
                animate={isRecording ? {
                  scale: [1, 1.3, 1],
                  opacity: [1, 0.5, 1],
                } : {
                  opacity: 1
                }}
                transition={{
                  duration: 1,
                  repeat: isRecording ? Infinity : 0,
                  ease: 'easeInOut',
                }}
                className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 ${
                  isRecording ? 'bg-red-500' : 'bg-amber-500'
                }`}
              />

              <div className="min-w-0 flex items-center gap-1.5 sm:gap-2">
                <span className="text-xs sm:text-sm font-medium text-gray-900">
                  <span className="hidden sm:inline">Enregistrement en cours</span>
                  <span className="sm:hidden">Enreg.</span>
                </span>

                {/* Status icon */}
                {isPaused ? (
                  <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
                ) : (
                  <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-red-500" />
                )}
              </div>
            </div>

            {/* Center: Timer */}
            <motion.div
              className="flex items-center gap-1 sm:gap-2"
              animate={isPaused ? {
                opacity: [1, 0.5, 1],
              } : {
                opacity: 1
              }}
              transition={{
                duration: 1.5,
                repeat: isPaused ? Infinity : 0,
              }}
            >
              <span className={`text-xs sm:text-sm font-mono tabular-nums ${
                isRecording ? 'text-red-600' : 'text-amber-600'
              }`}>
                {formatRecordingTime(duration)}
              </span>
              <span className={`text-[10px] sm:text-xs font-semibold tracking-wider ${
                isRecording ? 'text-red-500' : 'text-amber-500'
              }`}>
                {isRecording ? 'REC' : 'PAUSE'}
              </span>
            </motion.div>

            {/* Right: Action */}
            <button
              onClick={handleClick}
              className="text-[10px] sm:text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-0.5 flex-shrink-0 px-1.5 sm:px-2 py-1 rounded hover:bg-gray-50"
            >
              <span className="hidden xs:inline">Voir</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
