/**
 * Utilitaires pour la récupération des enregistrements.
 * Filtre les enregistrements déjà transcrits sur le serveur.
 */

import { recordingStorage } from '@/services/recordingStorage';
import { getAllMeetings } from '@/services/meetingService';
import type { Meeting } from '@/services/meetingService';
import { logger } from '@/utils/logger';
import { isTauriApp, tauriListJobs } from '@/services/tauriRecordingService';
import type { TauriJob } from '@/services/tauriRecordingService';

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Retourne les enregistrements à récupérer, en excluant ceux déjà transcrits sur le serveur.
 * Supprime de IndexedDB les doublons détectés.
 */
export async function getPendingRecordingsForRecovery(): Promise<any[]> {
  const recordings = await recordingStorage.getPendingRecordings();
  try {
    const meetings = await getAllMeetings();
    const transcribed = meetings.filter(
      (m: Meeting) =>
        m.transcript_status === 'completed' || m.transcription_status === 'completed'
    );
    const filtered = recordings.filter((r) => {
      const localTitle = (r.metadata?.title || '').trim();
      const localDate = r.metadata?.createdAt ? new Date(r.metadata.createdAt) : null;
      const match = transcribed.some((m: Meeting) => {
        const serverTitle = ((m.title || m.name) || '').trim();
        if (!serverTitle || serverTitle !== localTitle) return false;
        const serverDate = m.created_at ? new Date(m.created_at) : null;
        if (!localDate || !serverDate) return true;
        return isSameDay(localDate, serverDate);
      });
      if (match) {
        recordingStorage.deleteRecording(r.uuid).catch(() => {});
        return false;
      }
      return true;
    });
    if (filtered.length !== recordings.length) {
      logger.debug(`📦 ${recordings.length - filtered.length} enregistrement(s) déjà transcrit(s) exclus de la récupération`);
    }
    return filtered;
  } catch (error) {
    logger.warn('Impossible de vérifier les meetings (offline?), affichage de tous les pendants:', error);
    return recordings;
  }
}

/**
 * Retourne les jobs Tauri en attente (Pending ou Failed).
 * Utilisé par l'overlay Récupérer en mode desktop.
 */
export async function getPendingTauriJobs(): Promise<TauriJob[]> {
  if (!isTauriApp()) return [];
  try {
    const jobs = await tauriListJobs();
    return jobs.filter((j) => j.status === 'pending' || j.status === 'failed');
  } catch (error) {
    logger.warn('Erreur récupération jobs Tauri:', error);
    return [];
  }
}
