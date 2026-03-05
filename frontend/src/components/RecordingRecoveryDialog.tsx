/**
 * Composant Recovery Mode
 * Détecte et permet de récupérer les enregistrements non uploadés stockés localement
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  LinearProgress,
  CircularProgress,
  Divider,
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { recordingStorage } from '../services/recordingStorage';
import { uploadMeeting } from '../services/meetingService';
import { logger } from '@/utils/logger';

interface RecordingRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
  onRecoveriesCompleted?: () => void;
}

const RecordingRecoveryDialog: React.FC<RecordingRecoveryDialogProps> = ({
  open,
  onClose,
  onRecoveriesCompleted,
}) => {
  const [pendingRecordings, setPendingRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingUuid, setUploadingUuid] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ totalSizeMB: number; recordingsCount: number } | null>(null);

  useEffect(() => {
    if (open) {
      loadPendingRecordings();
      loadStorageInfo();
    }
  }, [open]);

  const loadPendingRecordings = async () => {
    setLoading(true);
    try {
      const recordings = await recordingStorage.getPendingRecordings();
      setPendingRecordings(recordings);
      logger.debug(`📦 ${recordings.length} enregistrement(s) en attente de récupération`);
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

  const handleUploadRecording = async (recording: any) => {
    setUploadingUuid(recording.uuid);
    
    try {
      // Mettre à jour le statut en "uploading"
      await recordingStorage.updateUploadStatus(recording.uuid, 'uploading');

      // ✅ CORRECTION : S'assurer que le titre est bien défini
      const recordingTitle = recording.metadata?.title?.trim() || 'Enregistrement sans titre';
      
      // Créer un File à partir du Blob pour l'upload
      const fileExtension = recording.metadata.mimeType?.split('/')[1] || 'webm';
      const file = new File(
        [recording.audioBlob],
        `${recordingTitle}.${fileExtension}`,
        { type: recording.metadata.mimeType || 'audio/webm' }
      );

      logger.debug(`⬆️ Upload de l'enregistrement ${recording.uuid} avec titre: "${recordingTitle}"...`);

      // Upload vers le serveur avec le titre correct
      const result = await uploadMeeting(file, recordingTitle);

      // Marquer comme uploadé avec succès
      await recordingStorage.updateUploadStatus(recording.uuid, 'completed', result.id);

      // Supprimer de IndexedDB après un court délai (pour garder un historique temporaire)
      setTimeout(async () => {
        await recordingStorage.deleteRecording(recording.uuid);
      }, 5000);

      logger.debug(`✅ Enregistrement ${recording.uuid} uploadé avec succès (Meeting ID: ${result.id})`);

      // Recharger la liste
      await loadPendingRecordings();
      await loadStorageInfo();

      if (pendingRecordings.length === 1 && onRecoveriesCompleted) {
        // C'était le dernier, on peut fermer
        setTimeout(() => {
          onRecoveriesCompleted();
        }, 2000);
      }
    } catch (error) {
      logger.error(`❌ Erreur upload enregistrement ${recording.uuid}:`, error);
      await recordingStorage.updateUploadStatus(recording.uuid, 'failed');
      alert(`Échec de l'upload: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    } finally {
      setUploadingUuid(null);
    }
  };

  const handleExportRecording = async (recording: any) => {
    try {
      await recordingStorage.exportRecordingLocally(recording.uuid);
      logger.debug(`✅ Enregistrement ${recording.uuid} exporté localement`);
    } catch (error) {
      logger.error('Erreur export:', error);
      alert('Erreur lors de l\'export local');
    }
  };

  const handleDeleteRecording = async (recording: any) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer cet enregistrement ?\n\n"${recording.metadata.title}"\n\nCette action est irréversible.`)) {
      return;
    }

    try {
      await recordingStorage.deleteRecording(recording.uuid);
      await loadPendingRecordings();
      await loadStorageInfo();
      logger.debug(`🗑️ Enregistrement ${recording.uuid} supprimé`);
    } catch (error) {
      logger.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
  };

  if (pendingRecordings.length === 0 && !loading) {
    return null; // Ne rien afficher s'il n'y a pas d'enregistrements à récupérer
  }

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { 
          borderRadius: 2
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 2, 
        pt: 3,
        px: 3,
        borderBottom: '1px solid #E5E7EB'
      }}>
        <Typography variant="h6" fontWeight={600} color="text.primary">
          Enregistrements en attente
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {pendingRecordings.length} fichier(s) non uploadé(s)
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ 
        px: 3, 
        pt: 0,
        pb: 2
      }}>
        {storageInfo && (
          <Box sx={{ 
            mt: 3,
            mb: 2, 
            p: 1.5, 
            bgcolor: '#F9FAFB',
            borderRadius: 1,
            border: '1px solid #E5E7EB'
          }}>
            <Typography variant="body2" color="text.secondary" fontSize="0.875rem">
              {storageInfo.recordingsCount} fichier(s) • {storageInfo.totalSizeMB} MB
            </Typography>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <List>
            {pendingRecordings.map((recording, index) => (
              <React.Fragment key={recording.uuid}>
                {index > 0 && <Divider sx={{ my: 1 }} />}
                <ListItem
                  sx={{
                    bgcolor: 'white',
                    borderRadius: 1.5,
                    border: '1px solid #E5E7EB',
                    mb: 1.5,
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    p: 2
                  }}
                >
                  <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between' }}>
                    <ListItemText
                      primary={
                        <Typography variant="body1" fontWeight={500}>
                          {recording.metadata.title}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatDate(recording.metadata.createdAt)} • {formatDuration(recording.metadata.duration)} • {formatSize(recording.metadata.fileSize)}
                          {recording.uploadAttempts > 0 && ` • ${recording.uploadAttempts} échec(s)`}
                        </Typography>
                      }
                    />
                    
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<CloudUploadIcon />}
                        onClick={() => handleUploadRecording(recording)}
                        disabled={uploadingUuid !== null}
                        sx={{ 
                          textTransform: 'none',
                          fontSize: '0.8125rem'
                        }}
                      >
                        Upload
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleExportRecording(recording)}
                        disabled={uploadingUuid !== null}
                        sx={{ 
                          textTransform: 'none',
                          fontSize: '0.8125rem'
                        }}
                      >
                        Exporter
                      </Button>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteRecording(recording)}
                        disabled={uploadingUuid !== null}
                        sx={{
                          width: 32,
                          height: 32,
                          color: '#EF4444',
                          '&:hover': {
                            bgcolor: '#FEE2E2'
                          }
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Barre de progression si upload en cours */}
                  {uploadingUuid === recording.uuid && (
                    <Box sx={{ mt: 2, width: '100%' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Upload en cours...
                      </Typography>
                      <LinearProgress 
                        sx={{ 
                          width: '100%',
                          height: 4,
                          borderRadius: 2,
                          bgcolor: '#E5E7EB'
                        }} 
                      />
                    </Box>
                  )}
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        px: 3, 
        pb: 2.5, 
        pt: 2,
        borderTop: '1px solid #E5E7EB'
      }}>
        <Button 
          onClick={onClose}
          variant="contained"
          sx={{ 
            textTransform: 'none',
            bgcolor: '#3B82F6',
            '&:hover': {
              bgcolor: '#2563EB'
            }
          }}
        >
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RecordingRecoveryDialog;

