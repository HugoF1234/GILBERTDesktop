import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import {
  PictureAsPdf as PictureAsPdfIcon,
  Description as DescriptionIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import { AnimatedDownloadIcon } from './ui/AnimatedIcons';
import SaveValidation from './ui/SaveValidation';
import sounds from '../utils/soundDesign';
import { 
  exportTranscriptToPDF, 
  exportTranscriptToWord, 
  exportTranscriptToMarkdown 
} from '../services/exportTranscriptService';
import { logger } from '@/utils/logger';

interface TranscriptExportButtonProps {
  transcript: Array<{speaker: string; text: string; timestamp?: string}> | null;
  meetingId: string | null;
  meetingName: string;
  meetingDate: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const TranscriptExportButton: React.FC<TranscriptExportButtonProps> = ({
  transcript,
  meetingId,
  meetingName,
  meetingDate,
  onSuccess,
  onError
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState<string | null>(null); // 'pdf', 'word', 'markdown' ou null
  const [showValidation, setShowValidation] = useState(false);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    sounds.click();
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const handleExport = async (format: 'pdf' | 'word' | 'markdown') => {
    if (!transcript || !meetingId) {
      onError('La transcription n\'est pas disponible pour l\'exportation');
      handleCloseMenu();
      return;
    }

    setLoading(format);

    try {
      switch (format) {
        case 'pdf':
          await exportTranscriptToPDF(transcript, meetingName, meetingDate);
          setShowValidation(true);
          onSuccess('La transcription a été exportée au format PDF');
          break;
        case 'word':
          await exportTranscriptToWord(transcript, meetingName, meetingDate);
          setShowValidation(true);
          onSuccess('La transcription a été exportée au format Word');
          break;
        case 'markdown':
          await exportTranscriptToMarkdown(transcript, meetingName, meetingDate);
          setShowValidation(true);
          onSuccess('La transcription a été exportée au format Markdown');
          break;
      }
    } catch (error) {
      // Ne pas afficher d'erreur si l'utilisateur a annulé
      if ((error as Error).message === 'Sauvegarde annulée') {
        logger.debug('Export annulé par l\'utilisateur');
      } else {
        logger.error(`Erreur lors de l'exportation de la transcription en ${format}:`, error);
        onError(`Erreur lors de l'exportation: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      }
    } finally {
      setLoading(null);
      handleCloseMenu();
    }
  };

  // Ne pas afficher le bouton si la transcription n'est pas disponible
  if (!transcript || transcript.length === 0) {
    return null;
  }

  return (
    <>
      <SaveValidation show={showValidation} onComplete={() => setShowValidation(false)} />
      <Button
        variant="outlined"
        size="small"
        onClick={handleOpenMenu}
        startIcon={<AnimatedDownloadIcon size={16} />}
        disableElevation
        sx={{
          borderRadius: '10px',
          borderColor: alpha(theme.palette.divider, 0.8),
          color: 'text.secondary',
          fontWeight: 500,
          textTransform: 'none',
          px: 2,
          py: 0.75,
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: 'primary.main',
            color: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
          },
        }}
      >
        Exporter
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleCloseMenu}
        sx={{
          '& .MuiPaper-root': {
            borderRadius: '10px',
            mt: 1,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
          }
        }}
      >
        <MenuItem
          onClick={() => handleExport('pdf')}
          disabled={loading !== null}
          sx={{
            borderRadius: 1,
            mx: 0.5,
            py: 1.5,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
          }}
        >
          <ListItemIcon>
            {loading === 'pdf' ? (
              <CircularProgress size={20} />
            ) : (
              <PictureAsPdfIcon sx={{ color: '#e53935' }} />
            )}
          </ListItemIcon>
          <ListItemText primary="Exporter en PDF" />
        </MenuItem>
        <MenuItem
          onClick={() => handleExport('word')}
          disabled={loading !== null}
          sx={{
            borderRadius: 1,
            mx: 0.5,
            py: 1.5,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
          }}
        >
          <ListItemIcon>
            {loading === 'word' ? (
              <CircularProgress size={20} />
            ) : (
              <DescriptionIcon sx={{ color: '#1565c0' }} />
            )}
          </ListItemIcon>
          <ListItemText primary="Exporter en Word" />
        </MenuItem>
        <MenuItem
          onClick={() => handleExport('markdown')}
          disabled={loading !== null}
          sx={{
            borderRadius: 1,
            mx: 0.5,
            py: 1.5,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) }
          }}
        >
          <ListItemIcon>
            {loading === 'markdown' ? (
              <CircularProgress size={20} />
            ) : (
              <CodeIcon sx={{ color: '#424242' }} />
            )}
          </ListItemIcon>
          <ListItemText primary="Exporter en Markdown" />
        </MenuItem>
      </Menu>
    </>
  );
};

export default TranscriptExportButton;
