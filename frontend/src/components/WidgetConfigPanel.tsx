/**
 * WidgetConfigPanel - Panel de configuration d'un widget
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Alert,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  alpha,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Palette as PaletteIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon
} from '@mui/icons-material';
import { Widget, WidgetConfig } from '../services/widgetTemplateService';

interface WidgetConfigPanelProps {
  widget: Widget;
  onUpdate: (widget: Widget) => void;
  onClose: () => void;
}

const WidgetConfigPanel: React.FC<WidgetConfigPanelProps> = ({ 
  widget, 
  onUpdate, 
  onClose 
}) => {
  const theme = useTheme();
  const [config, setConfig] = useState<WidgetConfig>(widget.config);
  const [hasChanges, setHasChanges] = useState(false);
  
  useEffect(() => {
    setConfig(widget.config);
    setHasChanges(false);
  }, [widget]);
  
  const handleConfigChange = (field: keyof WidgetConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };
  
  const handleSave = () => {
    const updatedWidget: Widget = {
      ...widget,
      config
    };
    onUpdate(updatedWidget);
    setHasChanges(false);
  };
  
  const handleCancel = () => {
    setConfig(widget.config);
    setHasChanges(false);
  };
  
  const addColumn = () => {
    const newColumns = [...(config.columns || []), {
      key: `column_${Date.now()}`,
      label: 'Nouvelle colonne',
      width: 'auto'
    }];
    handleConfigChange('columns', newColumns);
  };
  
  const updateColumn = (index: number, field: string, value: string) => {
    const newColumns = [...(config.columns || [])];
    newColumns[index] = { ...newColumns[index], [field]: value };
    handleConfigChange('columns', newColumns);
  };
  
  const removeColumn = (index: number) => {
    const newColumns = [...(config.columns || [])];
    newColumns.splice(index, 1);
    handleConfigChange('columns', newColumns);
  };
  
  const addSeverityLevel = () => {
    const newLevels = [...(config.severity_levels || []), 'nouveau'];
    handleConfigChange('severity_levels', newLevels);
  };
  
  const updateSeverityLevel = (index: number, value: string) => {
    const newLevels = [...(config.severity_levels || [])];
    newLevels[index] = value;
    handleConfigChange('severity_levels', newLevels);
  };
  
  const removeSeverityLevel = (index: number) => {
    const newLevels = [...(config.severity_levels || [])];
    newLevels.splice(index, 1);
    handleConfigChange('severity_levels', newLevels);
  };
  
  const renderBasicConfig = () => (
    <Stack spacing={2}>
      <TextField
        label="Titre du widget"
        value={config.title}
        onChange={(e) => handleConfigChange('title', e.target.value)}
        fullWidth
        required
        helperText={`${config.title.length}/100 caractères`}
        inputProps={{ maxLength: 100 }}
      />
      
      <TextField
        label="Emoji (optionnel)"
        value={config.emoji || ''}
        onChange={(e) => handleConfigChange('emoji', e.target.value)}
        fullWidth
        placeholder="🧠"
        helperText="Emoji qui apparaîtra avec le titre"
        inputProps={{ maxLength: 10 }}
      />
      
      <FormControlLabel
        control={
          <Switch
            checked={config.show_title}
            onChange={(e) => handleConfigChange('show_title', e.target.checked)}
          />
        }
        label="Afficher le titre"
      />
      
      {config.color && (
        <Box>
          <Typography variant="body2" gutterBottom>
            Couleur du widget
          </Typography>
          <Box
            sx={{
              width: 40,
              height: 40,
              backgroundColor: config.color,
              borderRadius: 1,
              border: 1,
              borderColor: 'divider'
            }}
          />
        </Box>
      )}
    </Stack>
  );
  
  const renderTypeSpecificConfig = () => {
    switch (widget.type) {
      case 'summary':
        return (
          <Stack spacing={2}>
            <TextField
              label="Longueur maximale (caractères)"
              type="number"
              value={config.max_length || 150}
              onChange={(e) => handleConfigChange('max_length', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 50, max: 2000 }}
              helperText="Entre 50 et 2000 caractères"
            />
          </Stack>
        );
        
      case 'list':
        return (
          <Stack spacing={2}>
            <FormControl fullWidth>
              <InputLabel>Style de liste</InputLabel>
              <Select
                value={config.list_style || 'bullet'}
                onChange={(e) => handleConfigChange('list_style', e.target.value)}
              >
                <MenuItem value="bullet">À puces</MenuItem>
                <MenuItem value="numbered">Numérotée</MenuItem>
                <MenuItem value="checkbox">Cases à cocher</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              label="Nombre maximum d'items"
              type="number"
              value={config.max_items || 10}
              onChange={(e) => handleConfigChange('max_items', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 1, max: 50 }}
            />
          </Stack>
        );
        
      case 'table':
      case 'actions':
        return (
          <Stack spacing={2}>
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight="medium">
                  Colonnes du tableau
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addColumn}
                  disabled={(config.columns || []).length >= 10}
                >
                  Ajouter
                </Button>
              </Stack>
              
              <Stack spacing={1}>
                {(config.columns || []).map((column, index) => (
                  <Paper key={index} sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <DragIcon color="action" />
                        <TextField
                          label="Clé"
                          value={column.key}
                          onChange={(e) => updateColumn(index, 'key', e.target.value)}
                          size="small"
                          sx={{ flex: 1 }}
                        />
                        <IconButton 
                          size="small" 
                          onClick={() => removeColumn(index)}
                          disabled={(config.columns || []).length <= 1}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      
                      <TextField
                        label="Label affiché"
                        value={column.label}
                        onChange={(e) => updateColumn(index, 'label', e.target.value)}
                        size="small"
                        fullWidth
                      />
                      
                      <FormControl size="small" fullWidth>
                        <InputLabel>Largeur</InputLabel>
                        <Select
                          value={column.width}
                          onChange={(e) => updateColumn(index, 'width', e.target.value)}
                        >
                          <MenuItem value="auto">Automatique</MenuItem>
                          <MenuItem value="10%">10%</MenuItem>
                          <MenuItem value="20%">20%</MenuItem>
                          <MenuItem value="30%">30%</MenuItem>
                          <MenuItem value="40%">40%</MenuItem>
                          <MenuItem value="50%">50%</MenuItem>
                          <MenuItem value="60%">60%</MenuItem>
                          <MenuItem value="70%">70%</MenuItem>
                          <MenuItem value="80%">80%</MenuItem>
                          <MenuItem value="90%">90%</MenuItem>
                        </Select>
                      </FormControl>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
              
              {(config.columns || []).length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Ajoutez au moins une colonne pour ce tableau
                </Alert>
              )}
            </Box>
          </Stack>
        );
        
      case 'risks':
        return (
          <Stack spacing={2}>
            <TextField
              label="Nombre maximum de risques"
              type="number"
              value={config.max_items || 10}
              onChange={(e) => handleConfigChange('max_items', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 1, max: 50 }}
            />
            
            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="body2" fontWeight="medium">
                  Niveaux de sévérité
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addSeverityLevel}
                >
                  Ajouter
                </Button>
              </Stack>
              
              <Stack spacing={1}>
                {(config.severity_levels || []).map((level, index) => (
                  <Stack key={index} direction="row" alignItems="center" spacing={1}>
                    <TextField
                      value={level}
                      onChange={(e) => updateSeverityLevel(index, e.target.value)}
                      size="small"
                      sx={{ flex: 1 }}
                    />
                    <IconButton 
                      size="small" 
                      onClick={() => removeSeverityLevel(index)}
                      disabled={(config.severity_levels || []).length <= 1}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        );
        
      case 'milestone':
        return (
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.show_date || true}
                  onChange={(e) => handleConfigChange('show_date', e.target.checked)}
                />
              }
              label="Afficher la date"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={config.show_description || true}
                  onChange={(e) => handleConfigChange('show_description', e.target.checked)}
                />
              }
              label="Afficher la description"
            />
          </Stack>
        );
        
      case 'conversation_log':
        return (
          <Stack spacing={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={config.show_speakers || true}
                  onChange={(e) => handleConfigChange('show_speakers', e.target.checked)}
                />
              }
              label="Afficher les intervenants"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={config.show_timestamps || false}
                  onChange={(e) => handleConfigChange('show_timestamps', e.target.checked)}
                />
              }
              label="Afficher les timestamps"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={config.group_by_topic || true}
                  onChange={(e) => handleConfigChange('group_by_topic', e.target.checked)}
                />
              }
              label="Grouper par thématique"
            />
            
            <TextField
              label="Nombre maximum d'échanges"
              type="number"
              value={config.max_items || 20}
              onChange={(e) => handleConfigChange('max_items', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 1, max: 100 }}
            />
          </Stack>
        );
        
      case 'custom_paragraph':
        return (
          <Stack spacing={2}>
            <TextField
              label="Longueur maximale (caractères)"
              type="number"
              value={config.max_length || 500}
              onChange={(e) => handleConfigChange('max_length', parseInt(e.target.value))}
              fullWidth
              inputProps={{ min: 100, max: 5000 }}
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={config.allow_markdown || false}
                  onChange={(e) => handleConfigChange('allow_markdown', e.target.checked)}
                />
              }
              label="Autoriser le Markdown"
            />
            
            {config.allow_markdown && (
              <Box>
                <Typography variant="body2" gutterBottom>
                  Tags Markdown autorisés
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {['bold', 'italic', 'code', 'link', 'list'].map((tag) => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      color={
                        (config.markdown_allowed_tags || []).includes(tag) 
                          ? 'primary' 
                          : 'default'
                      }
                      onClick={() => {
                        const current = config.markdown_allowed_tags || [];
                        const newTags = current.includes(tag)
                          ? current.filter(t => t !== tag)
                          : [...current, tag];
                        handleConfigChange('markdown_allowed_tags', newTags);
                      }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
          </Stack>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            Configuration
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Stack>
        
        <Typography variant="body2" color="text.secondary">
          {widget.config.emoji} {widget.config.title}
        </Typography>
      </Box>
      
      <Box sx={{ flex: 1, p: 2, overflow: 'hidden' }}>
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Configuration de base</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {renderBasicConfig()}
            </AccordionDetails>
          </Accordion>
          
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Configuration spécifique</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {renderTypeSpecificConfig()}
            </AccordionDetails>
          </Accordion>
          
        </Stack>
      </Box>
      
      {hasChanges && (
        <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1}>
            <Button 
              variant="outlined" 
              onClick={handleCancel}
              size="small"
            >
              Annuler
            </Button>
            <Button 
              variant="contained" 
              onClick={handleSave}
              size="small"
            >
              Sauvegarder
            </Button>
          </Stack>
        </Box>
      )}
    </Paper>
  );
};

export default WidgetConfigPanel;
