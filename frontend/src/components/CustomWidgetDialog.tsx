import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Box,
  Typography,
  IconButton,
  Chip,
  Switch,
  FormControlLabel
} from '@mui/material';
import { Close as CloseIcon, Add as AddIcon } from '@mui/icons-material';
import { WidgetConfig } from '../services/widgetTemplateService';

interface CustomWidgetDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (widget: WidgetConfig) => void;
}

const CustomWidgetDialog: React.FC<CustomWidgetDialogProps> = ({
  open,
  onClose,
  onSave
}) => {
  const [config, setConfig] = useState<WidgetConfig>({
    type: 'custom_paragraph',
    title: '',
    emoji: '📝',
    description: '',
    ai_prompt: 'Traite ce contenu selon les instructions suivantes :',
    display_title: true,
    max_length: 200,
    allow_markdown: false
  });

  const handleSave = () => {
    if (!config.title.trim()) {
      alert('Le titre est obligatoire');
      return;
    }
    onSave(config);
    onClose();
  };

  const handleReset = () => {
    setConfig({
      type: 'custom_paragraph',
      title: '',
      emoji: '📝',
      description: '',
      ai_prompt: 'Traite ce contenu selon les instructions suivantes :',
      display_title: true,
      max_length: 200,
      allow_markdown: false
    });
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Créer un widget personnalisé</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ pt: 1 }}>
          {/* Type de widget */}
          <FormControl fullWidth>
            <InputLabel>Type de widget</InputLabel>
            <Select
              value={config.type}
              label="Type de widget"
              onChange={(e) => setConfig({ ...config, type: e.target.value as any })}
            >
              <MenuItem value="custom_paragraph">Paragraphe personnalisé</MenuItem>
              <MenuItem value="free_text">Zone de texte libre</MenuItem>
            </Select>
          </FormControl>

          {/* Emoji */}
          <TextField
            label="Emoji"
            value={config.emoji}
            onChange={(e) => setConfig({ ...config, emoji: e.target.value })}
            helperText="Emoji qui apparaîtra avec le titre"
            fullWidth
          />

          {/* Titre */}
          <TextField
            label="Titre"
            value={config.title}
            onChange={(e) => setConfig({ ...config, title: e.target.value })}
            required
            fullWidth
            helperText={`${config.title.length}/50 caractères`}
            inputProps={{ maxLength: 50 }}
          />

          {/* Description */}
          <TextField
            label="Description"
            value={config.description}
            onChange={(e) => setConfig({ ...config, description: e.target.value })}
            multiline
            rows={2}
            fullWidth
            helperText="Description courte du widget"
          />

          {/* Instructions IA */}
          <TextField
            label="Instructions pour l'IA"
            value={config.ai_prompt}
            onChange={(e) => setConfig({ ...config, ai_prompt: e.target.value })}
            multiline
            rows={3}
            fullWidth
            helperText="Instructions spécifiques pour l'IA sur comment traiter ce widget"
          />

          {/* Configuration spécifique */}
          <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              Configuration spécifique
            </Typography>
            
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.display_title || false}
                    onChange={(e) => setConfig({ ...config, display_title: e.target.checked })}
                  />
                }
                label="Afficher le titre"
              />

              <TextField
                label="Longueur maximale (caractères)"
                type="number"
                value={config.max_length || 200}
                onChange={(e) => setConfig({ ...config, max_length: parseInt(e.target.value) || 200 })}
                fullWidth
                helperText="Nombre maximum de caractères pour le contenu généré"
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={config.allow_markdown || false}
                    onChange={(e) => setConfig({ ...config, allow_markdown: e.target.checked })}
                  />
                }
                label="Autoriser le Markdown"
              />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleReset} color="secondary">
          Réinitialiser
        </Button>
        <Button onClick={onClose}>
          Annuler
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained"
          disabled={!config.title.trim()}
        >
          Créer le widget
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomWidgetDialog;
