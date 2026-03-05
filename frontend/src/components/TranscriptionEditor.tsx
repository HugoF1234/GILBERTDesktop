import React, { useState, useCallback, useEffect } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import Notification from './Notification';
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Divider,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  useTheme,
  alpha,
  CircularProgress,
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Business as BusinessIcon,
  Code as CodeIcon,
  Assignment as AssignmentIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';

import { getSpeakers, updateSpeakerName, deleteSpeakerName, updateTranscriptWithCustomNames, Speaker } from '../services/speakerService';
import { updateMeetingTranscriptText } from '../services/meetingService';
import { logger } from '@/utils/logger';

// Interface de transcription utilisée dans le composant
interface TranscriptionData {
  id: string;
  title: string;
  text: string;
  audio_url?: string;
  audio_duration?: number;
  utterances: TranscriptionUtterance[];
}

interface TranscriptionUtterance {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

interface Report {
  type: 'general' | 'commercial' | 'technical' | 'custom';
  title: string;
  content: string;
}

const TranscriptionEditor: React.FC = () => {
  const theme = useTheme();
  const location = useLocation();
  const transcription: TranscriptionData | undefined = location.state?.transcription;
  
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({ open: false, message: '', severity: 'info' });

  const [reports, setReports] = useState<Report[]>([]);
  const [isCustomReportDialogOpen, setIsCustomReportDialogOpen] = useState(false);
  const [customReportTitle, setCustomReportTitle] = useState('');
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  
  // État pour la modification des noms de locuteurs
  const [editSpeakerDialogOpen, setEditSpeakerDialogOpen] = useState(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<{id: string, name: string}>({ id: '', name: '' });
  const [customSpeakers, setCustomSpeakers] = useState<Speaker[]>([]);
  // État pour indiquer le chargement des noms de locuteurs (peut être utilisé pour afficher un indicateur de chargement)
  const [, setIsLoadingSpeakers] = useState(false);
  const [isUpdatingTranscript, setIsUpdatingTranscript] = useState(false);
  
  // État pour l'édition du texte de transcription
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState('');
  const [isSavingText, setIsSavingText] = useState(false);

  // Charger les noms personnalisés des locuteurs
  useEffect(() => {
    if (transcription?.id) {
      loadSpeakers();
    }
  }, [transcription?.id]);

  // Charger les locuteurs personnalisés depuis l'API
  const loadSpeakers = async () => {
    if (!transcription?.id) return;
    
    setIsLoadingSpeakers(true); // Utilisé pour gérer l'état de chargement
    try {
      const speakers = await getSpeakers(transcription.id);
      setCustomSpeakers(speakers);
    } catch (error) {
      logger.error("Erreur lors du chargement des noms de locuteurs:", error);
      setNotification({
        open: true,
        message: "Impossible de charger les noms personnalisés des locuteurs",
        severity: 'error'
      });
    } finally {
      setIsLoadingSpeakers(false);
    }
  };

  // Ouvrir le dialogue d'édition pour un locuteur
  const handleEditSpeaker = (speakerId: string, speakerName: string) => {
    setCurrentSpeaker({ id: speakerId, name: speakerName });
    setEditSpeakerDialogOpen(true);
  };

  // Sauvegarder les modifications du nom de locuteur
  const handleSaveSpeakerName = async () => {
    if (!transcription?.id || !currentSpeaker.id) return;
    
    try {
      await updateSpeakerName(transcription.id, currentSpeaker.id, currentSpeaker.name);
      
      // Mettre à jour la liste locale
      setCustomSpeakers(prev => {
        const existingIndex = prev.findIndex(s => s.id === currentSpeaker.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], name: currentSpeaker.name };
          return updated;
        } else {
          return [...prev, { id: currentSpeaker.id, name: currentSpeaker.name }];
        }
      });
      
      setEditSpeakerDialogOpen(false);
      setNotification({
        open: true,
        message: "Nom du locuteur mis à jour avec succès",
        severity: 'success'
      });
    } catch (error) {
      logger.error("Erreur lors de la mise à jour du nom:", error);
      setNotification({
        open: true,
        message: "Erreur lors de la mise à jour du nom du locuteur",
        severity: 'error'
      });
    }
  };

  // Rétablir le nom par défaut du locuteur
  const handleResetSpeakerName = async () => {
    if (!transcription?.id || !currentSpeaker.id) return;
    
    try {
      await deleteSpeakerName(transcription.id, currentSpeaker.id);
      
      // Mettre à jour la liste locale
      setCustomSpeakers(prev => prev.filter(s => s.id !== currentSpeaker.id));
      
      setEditSpeakerDialogOpen(false);
      setNotification({
        open: true,
        message: "Nom du locuteur réinitialisé",
        severity: 'success'
      });
    } catch (error) {
      logger.error("Erreur lors de la réinitialisation du nom:", error);
      setNotification({
        open: true,
        message: "Erreur lors de la réinitialisation du nom du locuteur",
        severity: 'error'
      });
    }
  };

  // Mettre à jour la transcription avec les noms personnalisés
  const handleUpdateTranscript = async () => {
    if (!transcription?.id) return;
    
    setIsUpdatingTranscript(true);
    try {
      await updateTranscriptWithCustomNames(transcription.id);
      
      setNotification({
        open: true,
        message: "Transcription mise à jour avec les noms personnalisés",
        severity: 'success'
      });
      
      // Recharger la page pour afficher les changements
      window.location.reload();
    } catch (error) {
      logger.error("Erreur lors de la mise à jour de la transcription:", error);
      setNotification({
        open: true,
        message: "Erreur lors de la mise à jour de la transcription",
        severity: 'error'
      });
    } finally {
      setIsUpdatingTranscript(false);
    }
  };

  // Démarrer l'édition du texte
  const handleStartEditingText = () => {
    setEditedText(transcription?.text || '');
    setIsEditingText(true);
  };

  // Annuler l'édition du texte
  const handleCancelEditingText = () => {
    setIsEditingText(false);
    setEditedText('');
  };

  // Sauvegarder les modifications du texte
  const handleSaveTextChanges = async () => {
    logger.debug("🔧 [TranscriptionEditor] handleSaveTextChanges appelé");
    logger.debug("🔧 [TranscriptionEditor] transcription?.id:", transcription?.id);
    logger.debug("🔧 [TranscriptionEditor] editedText length:", editedText?.length);
    
    if (!transcription?.id || !editedText.trim()) {
      logger.debug("❌ [TranscriptionEditor] Validation échouée - ID ou texte manquant");
      setNotification({
        open: true,
        message: "Le texte de transcription ne peut pas être vide",
        severity: 'error'
      });
      return;
    }

    logger.debug("✅ [TranscriptionEditor] Validation OK, démarrage de la sauvegarde");
    setIsSavingText(true);
    
    try {
      logger.debug("🔄 [TranscriptionEditor] Appel de updateMeetingTranscriptText...");
      logger.debug("🔄 [TranscriptionEditor] Paramètres:", {
        meetingId: transcription.id,
        transcriptText: editedText.substring(0, 100) + "..."
      });
      
      const result = await updateMeetingTranscriptText(transcription.id, editedText);
      logger.debug("✅ [TranscriptionEditor] updateMeetingTranscriptText réussi:", result);
      
      setNotification({
        open: true,
        message: "Texte de transcription sauvegardé avec succès",
        severity: 'success'
      });
      
      setIsEditingText(false);
      setEditedText('');
      
      logger.debug("🔄 [TranscriptionEditor] Rechargement de la page...");
      // Recharger la page pour afficher les changements
      window.location.reload();
    } catch (error) {
      logger.error("❌ [TranscriptionEditor] Erreur lors de la sauvegarde du texte:", error);
      logger.error("❌ [TranscriptionEditor] Détails de l'erreur:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      setNotification({
        open: true,
        message: `Erreur lors de la sauvegarde du texte de transcription: ${error.message}`,
        severity: 'error'
      });
    } finally {
      setIsSavingText(false);
      logger.debug("🏁 [TranscriptionEditor] handleSaveTextChanges terminé");
    }
  };

  const generateReport = useCallback(async (type: 'general' | 'commercial' | 'technical' | 'custom') => {
    if (!transcription?.text) {
      setNotification({
        open: true,
        message: 'No transcription text available to generate report',
        severity: 'error'
      });
      return;
    }

    try {
      let title = '';
      switch (type) {
        case 'general':
          title = 'Compte rendu général';
          break;
        case 'commercial':
          title = 'Compte rendu business';
          break;
        case 'technical':
          title = 'Compte rendu technique';
          break;
        case 'custom':
          title = customReportTitle || 'Compte rendu personnalisé';
          break;
      }

      // Simulate report generation (replace with actual API call later)
      const newReport: Report = {
        type,
        title,
        content: `Rapport généré pour la transcription:\n\nPoints clés:\n1. Point 1\n2. Point 2\n3. Point 3`
      };

      setReports(prev => [...prev, newReport]);
      setSelectedReport(newReport);
      setNotification({
        open: true,
        message: 'Rapport généré avec succès',
        severity: 'success'
      });

      if (type === 'custom') {
        setIsCustomReportDialogOpen(false);
        setCustomReportTitle('');
      }
    } catch (error) {
      setNotification({
        open: true,
        message: 'Erreur lors de la génération du rapport',
        severity: 'error'
      });
    }
  }, [transcription?.text, customReportTitle]);

  if (!transcription) {
    return <Navigate to="/" replace />;
  }
  return (
    <Box sx={{ p: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Typography variant="h5">
            Transcription Editor
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              onClick={() => generateReport('general')}
              startIcon={<AssignmentIcon />}
              variant="outlined"
            >
              Compte rendu standard
            </Button>
            <Button
              size="small"
              onClick={() => generateReport('commercial')}
              startIcon={<BusinessIcon />}
              variant="outlined"
            >
              Compte rendu business
            </Button>
            <Button
              size="small"
              onClick={() => generateReport('technical')}
              startIcon={<CodeIcon />}
              variant="outlined"
            >
              Compte rendu technique
            </Button>
          </Stack>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Duration: {transcription.audio_duration ? Math.round(transcription.audio_duration / 60) : 0} minutes
        </Typography>
        
        {/* Bouton pour mettre à jour la transcription avec les noms personnalisés */}
        {customSpeakers.length > 0 && (
          <Button
            variant="contained"
            color="primary"
            startIcon={isUpdatingTranscript ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleUpdateTranscript}
            disabled={isUpdatingTranscript}
            sx={{ mb: 2 }}
          >
            {isUpdatingTranscript ? 'Mise à jour...' : 'Mettre à jour la transcription avec les noms personnalisés'}
          </Button>
        )}

        {/* Section d'édition du texte de transcription */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Texte de la transcription</Typography>
            {!isEditingText ? (
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={handleStartEditingText}
              >
                Modifier le texte
              </Button>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={handleCancelEditingText}
                  disabled={isSavingText}
                >
                  Annuler
                </Button>
                <Button
                  variant="contained"
                  startIcon={isSavingText ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                  onClick={handleSaveTextChanges}
                  disabled={isSavingText || !editedText.trim()}
                >
                  {isSavingText ? 'Sauvegarde...' : 'Sauvegarder'}
                </Button>
              </Box>
            )}
          </Box>
          
          {isEditingText ? (
            <TextField
              fullWidth
              multiline
              rows={10}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              variant="outlined"
              placeholder="Modifiez le texte de la transcription ici..."
              sx={{ mb: 2 }}
            />
          ) : (
            <Typography
              variant="body1"
              sx={{
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                backgroundColor: alpha(theme.palette.grey[100], 0.5),
                p: 2,
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                minHeight: '200px',
                maxHeight: '400px',
                overflow: 'auto'
              }}
            >
              {transcription.text || 'Aucun texte de transcription disponible'}
            </Typography>
          )}
        </Paper>
        
        <List>
          {transcription.utterances ? (
            transcription.utterances.map((utterance: TranscriptionUtterance, index: number) => (
            <React.Fragment key={index}>
              <ListItem
                secondaryAction={
                  <IconButton 
                    edge="end" 
                    aria-label="edit"
                    onClick={() => handleEditSpeaker(utterance.speaker, utterance.speaker)}
                  >
                    <EditIcon />
                  </IconButton>
                }
              >
                <ListItemText
                  primary={
                    <Typography
                      component="span"
                      variant="body1"
                      sx={{ 
                        color: 'primary.main',
                        fontWeight: 500,
                        // Mettre en évidence les noms personnalisés
                        backgroundColor: customSpeakers.some(s => s.id === utterance.speaker) ? 
                          alpha(theme.palette.success.light, 0.1) : 'transparent',
                        px: 1,
                        py: 0.5,
                        borderRadius: 1,
                      }}
                    >
                      {/* Afficher le nom personnalisé s'il existe, sinon le nom par défaut */}
                      {customSpeakers.find(s => s.id === utterance.speaker)?.name || utterance.speaker}
                    </Typography>
                  }
                  secondary={
                    <Typography
                      component="span"
                      variant="body1"
                      sx={{ display: 'inline', ml: 1 }}
                    >
                      {utterance.text}
                    </Typography>
                  }
                />
              </ListItem>
              {index < transcription.utterances.length - 1 && <Divider />}
            </React.Fragment>
          ))) : (
            <ListItem>
              <ListItemText 
                primary="No utterances available" 
                secondary="The transcription is still being processed or no speakers were detected."
              />
            </ListItem>
          )}
        </List>
      </Paper>

      {reports.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Comptes rendus générés
          </Typography>
          <Stack spacing={2}>
            {reports.map((report, index) => (
              <Paper
                key={index}
                sx={{
                  p: 2,
                  bgcolor: report === selectedReport ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: alpha(theme.palette.primary.main, 0.05)
                  }
                }}
                onClick={() => setSelectedReport(report)}
              >
                <Typography variant="subtitle1" sx={{ mb: 1, color: 'primary.main' }}>
                  {report.title}
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {report.content}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Paper>
      )}

      <Dialog
        open={isCustomReportDialogOpen}
        onClose={() => setIsCustomReportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Créer un compte rendu personnalisé</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Titre du compte rendu"
            fullWidth
            variant="outlined"
            value={customReportTitle}
            onChange={(e) => setCustomReportTitle(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsCustomReportDialogOpen(false)}>
            Annuler
          </Button>
          <Button
            onClick={() => generateReport('custom')}
            variant="contained"
            disabled={!customReportTitle.trim()}
          >
            Générer
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog pour l'édition des noms de locuteurs */}
      <Dialog open={editSpeakerDialogOpen} onClose={() => setEditSpeakerDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Modifier le nom du locuteur</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nom du locuteur"
            type="text"
            fullWidth
            variant="outlined"
            value={currentSpeaker.name}
            onChange={(e) => setCurrentSpeaker(prev => ({ ...prev, name: e.target.value }))}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={handleResetSpeakerName} 
            color="error" 
            startIcon={<DeleteIcon />}
          >
            Réinitialiser
          </Button>
          <Button onClick={() => setEditSpeakerDialogOpen(false)} color="inherit">
            Annuler
          </Button>
          <Button 
            onClick={handleSaveSpeakerName} 
            color="primary" 
            variant="contained" 
            startIcon={<SaveIcon />}
            disabled={!currentSpeaker.name.trim()}
          >
            Enregistrer
          </Button>
        </DialogActions>
      </Dialog>

      <Notification
        open={notification.open}
        message={notification.message}
        severity={notification.severity}
        onClose={() => setNotification(prev => ({ ...prev, open: false }))}
      />
    </Box>
  );
};

export default TranscriptionEditor;
