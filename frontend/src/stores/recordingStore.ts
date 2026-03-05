/**
 * Store Zustand pour gérer l'état global de l'enregistrement audio
 * Permet de persister l'état de l'enregistrement lors de la navigation entre pages
 */

import { create } from 'zustand';
import { recordingManager, setRecordingStore } from '../services/recordingManager';

// Type pour l'état de l'enregistrement (compatible avec recordingManager et ImmersiveRecordingPage)
export type RecordingStateType = 'idle' | 'recording' | 'paused' | 'stopped' | 'processing';

interface RecordingStore {
  // État de l'enregistrement
  state: RecordingStateType;
  duration: number;
  isActive: boolean;
  showSaveDialog: boolean;
  // Timestamp de début (mode Tauri) pour recalculer la durée au remontage
  tauriStartTime: number | null;

  // Actions
  setState: (state: RecordingStateType) => void;
  setDuration: (duration: number) => void;
  setTauriStartTime: (t: number | null) => void;
  incrementDuration: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  reset: () => void;
  setShowSaveDialog: (show: boolean) => void;

  // Synchronisation avec recordingManager
  syncWithManager: () => void;
}

export const useRecordingStore = create<RecordingStore>((set) => {
  // Créer les fonctions de mise à jour pour enregistrer dans recordingManager
  const storeMethods = {
    setState: (state: RecordingStateType): void => {
      set({
        state,
        isActive: state === 'recording' || state === 'paused'
      });
    },
    setDuration: (duration: number): void => {
      set({ duration });
    },
  };
  
  // Enregistrer le store dans recordingManager pour mise à jour directe
  setRecordingStore(storeMethods);
  
  return {
    state: 'idle',
    duration: 0,
    isActive: false,
    showSaveDialog: false,
    tauriStartTime: null,

    setState: storeMethods.setState,
    setDuration: storeMethods.setDuration,
    setTauriStartTime: (t: number | null): void => { set({ tauriStartTime: t }); },

  incrementDuration: (): void => {
    set((prev) => ({ duration: prev.duration + 1 }));
  },

  startRecording: (): void => {
    set({
      state: 'recording',
      duration: 0,
      isActive: true
    });
  },

  pauseRecording: (): void => {
    set({ state: 'paused' });
  },

  resumeRecording: (): void => {
    set({ state: 'recording' });
  },

  stopRecording: (): void => {
    set({ state: 'stopped' });
  },

  reset: (): void => {
    set({
      state: 'idle',
      duration: 0,
      isActive: false,
      showSaveDialog: false,
      tauriStartTime: null,
    });
  },

  setShowSaveDialog: (show: boolean): void => {
    set({ showSaveDialog: show });
  },

  syncWithManager: (): void => {
    const managerState = recordingManager.getState();
    const managerDuration = recordingManager.getCurrentDuration();
    const isActiveValue = recordingManager.isActive();

    set({
      state: managerState as RecordingStateType,
      duration: managerDuration,
      isActive: isActiveValue,
    });
  },
  };
});

/**
 * Formate les secondes en format MM:SS
 */
export function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

