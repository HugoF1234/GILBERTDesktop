/**
 * Overlay de récupération des enregistrements (échec upload / connexion / crash).
 * Fenêtre fixe shadcn, affichée au clic sur "Récupérer" sur la page d'enregistrement.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CloudUpload, Download, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { recordingStorage } from '@/services/recordingStorage';
import { uploadMeeting } from '@/services/meetingService';
import { getPendingRecordingsForRecovery, getPendingTauriJobs } from '@/utils/recoveryUtils';
import { tauriRetryJob, tauriDeleteJob } from '@/services/tauriRecordingService';
import type { TauriJob } from '@/services/tauriRecordingService';
import { logger } from '@/utils/logger';
import { toUserFriendlyMessage } from '@/utils/errorMessages';

interface RecordingRecoveryOverlayProps {
  open: boolean;
  onClose: () => void;
  onRecoveriesCompleted?: () => void;
}

export default function RecordingRecoveryOverlay({
  open,
  onClose,
  onRecoveriesCompleted,
}: RecordingRecoveryOverlayProps) {
  const [pendingRecordings, setPendingRecordings] = useState<any[]>([]);
  const [pendingTauriJobs, setPendingTauriJobs] = useState<TauriJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingUuid, setUploadingUuid] = useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ totalSizeMB: number; recordingsCount: number } | null>(null);

  const loadPendingRecordings = async () => {
    setLoading(true);
    try {
      const [recordings, tauriJobs] = await Promise.all([
        getPendingRecordingsForRecovery(),
        getPendingTauriJobs(),
      ]);
      setPendingRecordings(recordings);
      setPendingTauriJobs(tauriJobs);
      logger.debug(`📦 ${recordings.length} IndexedDB + ${tauriJobs.length} Tauri à récupérer`);
    } catch (error) {
      logger.error('Erreur chargement enregistrements:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageInfo = async () => {
    try {
      const info = await recordingStorage.getStorageSize();
      setStorageInfo(info);
    } catch (error) {
      logger.error('Erreur chargement info stockage:', error);
    }
  };

  useEffect(() => {
    if (open) {
      loadPendingRecordings();
      loadStorageInfo();
    }
  }, [open]);

  const handleUploadRecording = async (recording: any) => {
    setUploadingUuid(recording.uuid);
    try {
      await recordingStorage.updateUploadStatus(recording.uuid, 'uploading');
      const recordingTitle = recording.metadata?.title?.trim() || 'Enregistrement sans titre';
      const fileExtension = recording.metadata.mimeType?.split('/')[1] || 'webm';
      const file = new File(
        [recording.audioBlob],
        `${recordingTitle}.${fileExtension}`,
        { type: recording.metadata.mimeType || 'audio/webm' }
      );
      const result = await uploadMeeting(file, recordingTitle);
      await recordingStorage.updateUploadStatus(recording.uuid, 'completed', result.id);
      await recordingStorage.deleteRecording(recording.uuid);
      const remaining = await getPendingRecordingsForRecovery();
      setPendingRecordings(remaining);
      await loadStorageInfo();
      if (remaining.length === 0 && onRecoveriesCompleted) {
        setTimeout(() => onRecoveriesCompleted(), 500);
      }
    } catch (error) {
      logger.error(`❌ Erreur upload enregistrement ${recording.uuid}:`, error);
      await recordingStorage.updateUploadStatus(recording.uuid, 'failed');
      alert(`Échec de l'upload: ${toUserFriendlyMessage(error)}`);
    } finally {
      setUploadingUuid(null);
    }
  };

  const handleExportRecording = async (recording: any) => {
    try {
      await recordingStorage.exportRecordingLocally(recording.uuid);
    } catch (error) {
      logger.error('Erreur export:', error);
      alert("Erreur lors de l'export local");
    }
  };

  const handleDeleteRecording = async (recording: any) => {
    if (!window.confirm(`Supprimer cet enregistrement ?\n"${recording.metadata.title}"\nCette action est irréversible.`)) return;
    try {
      await recordingStorage.deleteRecording(recording.uuid);
      await loadPendingRecordings();
      await loadStorageInfo();
    } catch (error) {
      logger.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleRetryTauriJob = async (job: TauriJob) => {
    setRetryingJobId(job.id);
    try {
      await tauriRetryJob(job.id);
      const [recordings, tauriJobs] = await Promise.all([
        getPendingRecordingsForRecovery(),
        getPendingTauriJobs(),
      ]);
      setPendingRecordings(recordings);
      setPendingTauriJobs(tauriJobs);
      if (recordings.length + tauriJobs.length === 0 && onRecoveriesCompleted) {
        setTimeout(() => onRecoveriesCompleted(), 500);
      }
    } catch (error) {
      logger.error('Erreur retry job:', error);
      alert(`Échec de la récupération: ${toUserFriendlyMessage(error)}`);
    } finally {
      setRetryingJobId(null);
    }
  };

  const handleDeleteTauriJob = async (job: TauriJob) => {
    const title = job.title || job.file_path?.split('/').pop() || 'Enregistrement';
    if (!window.confirm(`Supprimer cet enregistrement ?\n"${title}"\nCette action est irréversible.`)) return;
    try {
      await tauriDeleteJob(job.id);
      const [recordings, tauriJobs] = await Promise.all([
        getPendingRecordingsForRecovery(),
        getPendingTauriJobs(),
      ]);
      setPendingRecordings(recordings);
      setPendingTauriJobs(tauriJobs);
      if (recordings.length + tauriJobs.length === 0 && onRecoveriesCompleted) {
        setTimeout(() => onRecoveriesCompleted(), 500);
      }
    } catch (error) {
      logger.error('Erreur suppression job:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const formatSize = (bytes: number) => `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;

  if (!open) return null;

  const overlay = (
    <div
      className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-overlay-title"
    >
      <Card
        className="flex flex-col w-full max-w-2xl border rounded-xl shadow-lg bg-card"
        style={{ minHeight: '420px', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b px-6 py-4 shrink-0 flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle id="recovery-overlay-title" className="text-base">
              Récupérer les enregistrements
            </CardTitle>
            <CardDescription>
              {loading ? 'Chargement...' : `${pendingRecordings.length + pendingTauriJobs.length} fichier(s) à récupérer (connexion, crash ou erreur)`}
              {storageInfo && !loading && ` • ${storageInfo.totalSizeMB} MB`}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0 flex flex-col flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center flex-1 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingRecordings.length + pendingTauriJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-12 text-center px-4">
              <p className="text-muted-foreground mb-4">Aucun enregistrement à récupérer.</p>
              <Button variant="outline" onClick={onClose}>
                Fermer
              </Button>
            </div>
          ) : (
            <ScrollArea className="flex-1 rounded-b-xl" style={{ height: '320px' }}>
              <ul className="p-4 space-y-3">
                {pendingTauriJobs.map((job) => (
                  <li
                    key={`tauri-${job.id}`}
                    className="flex flex-col gap-2 p-3 rounded-lg border bg-card text-card-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{job.title || job.file_path?.split('/').pop() || 'Enregistrement'}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.updated_at ? new Date(job.updated_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          {job.retries > 0 && ` • ${job.retries} tentative(s)`}
                          {job.last_error && ` • ${job.last_error}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleRetryTauriJob(job)}
                          disabled={retryingJobId !== null}
                        >
                          {retryingJobId === job.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline ml-1">Réessayer</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteTauriJob(job)}
                          disabled={retryingJobId !== null}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {retryingJobId === job.id && (
                      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 animate-pulse bg-primary rounded-full" />
                      </div>
                    )}
                  </li>
                ))}
                {pendingRecordings.map((recording) => (
                  <li
                    key={recording.uuid}
                    className="flex flex-col gap-2 p-3 rounded-lg border bg-card text-card-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{recording.metadata?.title || 'Sans titre'}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(recording.metadata.createdAt)} • {formatDuration(recording.metadata.duration)} • {formatSize(recording.metadata.fileSize)}
                          {recording.uploadAttempts > 0 && ` • ${recording.uploadAttempts} échec(s)`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleUploadRecording(recording)}
                          disabled={uploadingUuid !== null}
                        >
                          {uploadingUuid === recording.uuid ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CloudUpload className="h-4 w-4" />
                          )}
                          <span className="hidden sm:inline ml-1">Upload</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportRecording(recording)}
                          disabled={uploadingUuid !== null}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteRecording(recording)}
                          disabled={uploadingUuid !== null}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {uploadingUuid === recording.uuid && (
                      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 animate-pulse bg-primary rounded-full" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );

  return createPortal(overlay, document.body);
}
