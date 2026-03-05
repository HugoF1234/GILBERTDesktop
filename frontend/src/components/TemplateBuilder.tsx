/**
 * TemplateBuilder - Éditeur de templates avec widgets drag & drop
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Stepper,
  Step,
  StepLabel,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Stack,
  Card,
  CardContent,
  CardActions,
  alpha,
  useTheme,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Close as CloseIcon,
  Add as AddIcon,
  DragIndicator as DragIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Preview as PreviewIcon,
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Palette as PaletteIcon,
  Widgets as WidgetsIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
// import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { useNotification } from '../contexts/NotificationContext';
import { 
  WidgetTemplate, 
  Widget, 
  WidgetPreset, 
  getWidgetPresets, 
  createWidgetTemplate, 
  updateWidgetTemplate,
  validateTemplate,
  generateWidgetId,
  reorderWidgets
} from '../services/widgetTemplateService';
import WidgetPalette from './WidgetPalette';
import WidgetConfigPanel from './WidgetConfigPanel';
import LivePreview from './LivePreview';
import EnhancedPreview from './EnhancedPreview';
import { logger } from '@/utils/logger';

interface TemplateBuilderProps {
  open: boolean;
  onClose: () => void;
  onSave: (template: WidgetTemplate) => void;
  template?: WidgetTemplate; // Pour l'édition
  mode: 'create' | 'edit';
}

const TemplateBuilder: React.FC<TemplateBuilderProps> = ({
  open,
  onClose,
  onSave,
  template,
  mode
}) => {
  const theme = useTheme();
  const { showSuccessPopup, showErrorPopup } = useNotification();
  
  // États principaux
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<WidgetPreset[]>([]);
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);
  
  // État du template en cours d'édition
  const defaultConfig: WidgetTemplate['config'] = {
    global_style: {
      font_family: 'Inter, sans-serif',
      primary_color: '#FF6B6B',
      secondary_color: '#8B5CF6',
      max_width: '800px',
      background_color: '#ffffff',
    },
    ai_instructions: 'Génère un compte-rendu professionnel basé sur les widgets configurés.',
    layout: {
      header_logo_url: '',
      header_position: 'left',
      repeat_header: true,
      show_page_numbers: true,
      page_number_position: 'bottom-center',
      page_number_format: 'Page {n}/{total}',
      margins: { top: '40px', bottom: '40px', left: '36px', right: '36px' },
      show_separators: false,
    },
    typography: {
      h1: { size: '22px', weight: 700, color: '#0f172a', margin_bottom: '8px' },
      h2: { size: '18px', weight: 700, color: '#111827', margin_bottom: '6px' },
      body: { size: '14px', line_height: '1.6', color: '#111827' },
    },
    box_style: {
      border: '1px solid #E5E7EB',
      border_radius: '8px',
      padding: '12px',
      background_color: '#ffffff',
      separator: false,
    },
    export_options: {
      pdf_enable: true,
      word_enable: true,
      repeat_header: true,
    },
  };

  const [templateData, setTemplateData] = useState<Omit<WidgetTemplate, 'id' | 'created_at' | 'updated_at'>>({
    name: '',
    description: '',
    version: '1.0.0',
    config: defaultConfig,
    widgets: []
  });
  
  const steps = [
    'Informations générales',
    'Construction du template',
    'Prévisualisation',
    'Sauvegarde'
  ];
  
  // Charger les presets au montage
  useEffect(() => {
    if (open) {
      loadPresets();
      if (mode === 'edit' && template) {
        setTemplateData({
          ...template,
          config: {
            ...defaultConfig,
            ...template.config,
            global_style: { ...defaultConfig.global_style, ...template.config.global_style },
            layout: { ...defaultConfig.layout, ...(template.config as any).layout },
            typography: { ...defaultConfig.typography, ...(template.config as any).typography },
            box_style: { ...defaultConfig.box_style, ...(template.config as any).box_style },
            export_options: { ...defaultConfig.export_options, ...(template.config as any).export_options },
          },
        });
      } else {
        // Reset pour création
        setTemplateData({
          name: '',
          description: '',
          version: '1.0.0',
          config: defaultConfig,
          widgets: []
        });
      }
      setActiveStep(0);
      setSelectedWidget(null);
    }
  }, [open, mode, template]);
  
  const loadPresets = async () => {
    try {
      logger.debug('🔄 Chargement des presets...');
      const presetsData = await getWidgetPresets();
      logger.debug('✅ Presets chargés:', presetsData?.length || 0);
      setPresets(presetsData || []);
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des presets:', error);
      showErrorPopup('Erreur', 'Impossible de charger les widgets disponibles');
      setPresets([]); // Assurer que presets n'est pas undefined
    }
  };
  
  const handleNext = () => {
    logger.debug('🔄 handleNext appelé, étape actuelle:', activeStep);
    logger.debug('📊 Presets disponibles:', presets?.length || 0);
    
    if (activeStep === 0) {
      // Validation étape 1
      if (!templateData.name.trim()) {
        showErrorPopup('Erreur', 'Le nom du template est requis');
        return;
      }
      if (!templateData.description.trim()) {
        showErrorPopup('Erreur', 'La description du template est requise');
        return;
      }
      logger.debug('✅ Validation étape 1 OK');
    }
    
    if (activeStep === 1) {
      // Vérifier que les presets sont chargés avant de passer à l'étape 2
      if (!presets || presets.length === 0) {
        logger.debug('❌ Presets pas encore chargés');
        showErrorPopup('Erreur', 'Les widgets ne sont pas encore chargés. Veuillez patienter.');
        return;
      }
      logger.debug('✅ Presets chargés, passage à l\'étape suivante');
    }
    
    if (activeStep === 2) {
      // Validation finale avant sauvegarde
      const errors = validateTemplate(templateData);
      if (errors.length > 0) {
        showErrorPopup('Erreur', `Erreurs de validation: ${errors.join(', ')}`);
        return;
      }
    }
    
    setActiveStep((prev) => prev + 1);
  };
  
  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };
  
  const handleClose = () => {
    if (activeStep > 0) {
      // Demander confirmation si l'utilisateur a commencé à créer un template
      if (window.confirm('Êtes-vous sûr de vouloir fermer ? Toutes les modifications seront perdues.')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  const handleSave = async () => {
    setLoading(true);
    try {
      const errors = validateTemplate(templateData);
      if (errors.length > 0) {
        showErrorPopup('Erreur', `Erreurs de validation: ${errors.join(', ')}`);
        return;
      }
      
      let savedTemplate: WidgetTemplate;
      
      if (mode === 'create') {
        savedTemplate = await createWidgetTemplate(templateData);
        showSuccessPopup('Succès', 'Template créé avec succès');
      } else {
        if (!template?.id) {
          throw new Error('ID du template requis pour la modification');
        }
        savedTemplate = await updateWidgetTemplate(template.id, templateData);
        showSuccessPopup('Succès', 'Template modifié avec succès');
      }
      
      onSave(savedTemplate);
      onClose();
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      showErrorPopup('Erreur', 'Erreur lors de la sauvegarde du template');
    } finally {
      setLoading(false);
    }
  };
  
  const handleAddWidget = (preset: WidgetPreset) => {
    const newWidget: Widget = {
      id: generateWidgetId(),
      type: preset.type as any,
      order: templateData.widgets.length + 1,
      config: { ...preset.default_config }
    };
    
    setTemplateData(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget]
    }));
  };

  const handleAddCustomWidget = (config: WidgetConfig) => {
    const newWidget: Widget = {
      id: generateWidgetId(),
      type: config.type,
      order: templateData.widgets.length + 1,
      config: config
    };
    
    setTemplateData(prev => ({
      ...prev,
      widgets: [...prev.widgets, newWidget]
    }));
  };
  
  const handleRemoveWidget = (widgetId: string) => {
    setTemplateData(prev => ({
      ...prev,
      widgets: reorderWidgets(prev.widgets.filter(w => w.id !== widgetId))
    }));
    
    if (selectedWidget?.id === widgetId) {
      setSelectedWidget(null);
    }
  };
  
  const handleUpdateWidget = (updatedWidget: Widget) => {
    setTemplateData(prev => ({
      ...prev,
      widgets: prev.widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w)
    }));
    setSelectedWidget(updatedWidget);
  };
  
  const handleReorderWidgets = (newWidgets: Widget[]) => {
    setTemplateData(prev => ({
      ...prev,
      widgets: reorderWidgets(newWidgets)
    }));
  };

  const handleDragEnd = (result: any) => {
    const { destination, source, draggableId } = result;

    logger.debug('🎯 handleDragEnd:', { destination, source, draggableId });

    // Si l'élément est lâché en dehors d'une zone valide
    if (!destination) {
      logger.debug('❌ Pas de destination valide');
      return;
    }

    // Si l'élément est lâché au même endroit
    if (destination.droppableId === source.droppableId && destination.index === source.index) {
      logger.debug('❌ Même position');
      return;
    }

    // Si c'est un preset qui est dragé depuis la palette
    if (draggableId.startsWith('preset-')) {
      logger.debug('📦 Ajout d\'un preset:', draggableId);
      const presetType = draggableId.replace('preset-', '');
      const preset = presets.find(p => p.type === presetType);
      if (preset) {
        const newWidget: Widget = {
          id: generateWidgetId(),
          type: preset.type as any,
          order: destination.index + 1,
          config: { ...preset.default_config }
        };
        
        const newWidgets = [...templateData.widgets];
        newWidgets.splice(destination.index, 0, newWidget);
        
        setTemplateData(prev => ({
          ...prev,
          widgets: reorderWidgets(newWidgets)
        }));
        logger.debug('✅ Widget ajouté');
      }
      return;
    }

    // Si c'est un widget existant qui est réorganisé
    logger.debug('🔄 Réorganisation d\'un widget');
    const newWidgets = Array.from(templateData.widgets);
    const [reorderedWidget] = newWidgets.splice(source.index, 1);
    newWidgets.splice(destination.index, 0, reorderedWidget);

    setTemplateData(prev => ({
      ...prev,
      widgets: reorderWidgets(newWidgets)
    }));
    logger.debug('✅ Widget réorganisé');
  };
  
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Informations générales
            </Typography>
            
            <Stack spacing={3}>
              <TextField
                label="Nom du template"
                value={templateData.name}
                onChange={(e) => setTemplateData(prev => ({ ...prev, name: e.target.value }))}
                fullWidth
                required
                helperText={`${templateData.name.length}/100 caractères`}
                inputProps={{ maxLength: 100 }}
              />
              
              <TextField
                label="Description"
                value={templateData.description}
                onChange={(e) => setTemplateData(prev => ({ ...prev, description: e.target.value }))}
                fullWidth
                required
                multiline
                rows={3}
                helperText={`${templateData.description.length}/500 caractères`}
                inputProps={{ maxLength: 500 }}
              />
              
              <TextField
                label="Instructions pour l'IA"
                value={templateData.config.ai_instructions}
                onChange={(e) => setTemplateData(prev => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    ai_instructions: e.target.value
                  }
                }))}
                fullWidth
                multiline
                rows={4}
                helperText="Ces instructions guideront l'IA dans la génération du contenu"
                placeholder="Ex: Génère un compte-rendu professionnel, focus sur les décisions techniques..."
              />

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>
                Mise en page (PDF / Word)
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Logo (URL)"
                    value={templateData.config.layout?.header_logo_url || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, layout: { ...prev.config.layout, header_logo_url: e.target.value } }
                    }))}
                    fullWidth
                    placeholder="https://.../logo.png"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Select
                    fullWidth
                    value={templateData.config.layout?.header_position || 'left'}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, layout: { ...prev.config.layout, header_position: e.target.value as any } }
                    }))}
                    displayEmpty
                  >
                    <MenuItem value="left">Logo à gauche</MenuItem>
                    <MenuItem value="center">Logo centré</MenuItem>
                    <MenuItem value="right">Logo à droite</MenuItem>
                  </Select>
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={templateData.config.layout?.repeat_header ?? true}
                        onChange={(e) => setTemplateData(prev => ({
                          ...prev,
                          config: { ...prev.config, layout: { ...prev.config.layout, repeat_header: e.target.checked } }
                        }))}
                      />
                    }
                    label="Répéter l'en-tête à chaque page"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={templateData.config.layout?.show_page_numbers ?? true}
                        onChange={(e) => setTemplateData(prev => ({
                          ...prev,
                          config: { ...prev.config, layout: { ...prev.config.layout, show_page_numbers: e.target.checked } }
                        }))}
                      />
                    }
                    label="Afficher les numéros de page"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Select
                    fullWidth
                    value={templateData.config.layout?.page_number_position || 'bottom-center'}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, layout: { ...prev.config.layout, page_number_position: e.target.value as any } }
                    }))}
                  >
                    <MenuItem value="bottom-left">Bas gauche</MenuItem>
                    <MenuItem value="bottom-center">Bas centre</MenuItem>
                    <MenuItem value="bottom-right">Bas droite</MenuItem>
                    <MenuItem value="top-left">Haut gauche</MenuItem>
                    <MenuItem value="top-center">Haut centre</MenuItem>
                    <MenuItem value="top-right">Haut droite</MenuItem>
                  </Select>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Format numéro de page"
                    value={templateData.config.layout?.page_number_format || 'Page {n}/{total}'}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, layout: { ...prev.config.layout, page_number_format: e.target.value } }
                    }))}
                    fullWidth
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                {(['top','bottom','left','right'] as const).map((side) => (
                  <Grid item xs={6} md={3} key={side}>
                    <TextField
                      label={`Marge ${side}`}
                      value={templateData.config.layout?.margins?.[side] || ''}
                      onChange={(e) => setTemplateData(prev => ({
                        ...prev,
                        config: { 
                          ...prev.config, 
                          layout: { 
                            ...prev.config.layout, 
                            margins: { ...(prev.config.layout?.margins || {}), [side]: e.target.value } 
                          } 
                        }
                      }))}
                      fullWidth
                      placeholder="40px"
                    />
                  </Grid>
                ))}
              </Grid>

              <FormControlLabel
                control={
                  <Switch
                    checked={templateData.config.layout?.show_separators ?? false}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, layout: { ...prev.config.layout, show_separators: e.target.checked } }
                    }))}
                  />
                }
                label="Afficher des lignes de séparation"
              />

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>
                Typographie & encadrés
              </Typography>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Taille Titre (H1)"
                    value={templateData.config.typography?.h1?.size || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, h1: { ...prev.config.typography?.h1, size: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="22px"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Taille Sous-titre (H2)"
                    value={templateData.config.typography?.h2?.size || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, h2: { ...prev.config.typography?.h2, size: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="18px"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Taille texte"
                    value={templateData.config.typography?.body?.size || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, body: { ...prev.config.typography?.body, size: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="14px"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Interligne"
                    value={templateData.config.typography?.body?.line_height || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, body: { ...prev.config.typography?.body, line_height: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="1.6"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Couleur titres"
                    value={templateData.config.typography?.h1?.color || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, h1: { ...prev.config.typography?.h1, color: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="#0f172a"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Couleur texte"
                    value={templateData.config.typography?.body?.color || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, typography: { ...prev.config.typography, body: { ...prev.config.typography?.body, color: e.target.value } } }
                    }))}
                    fullWidth
                    placeholder="#111827"
                  />
                </Grid>
              </Grid>

              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Bordure encadré"
                    value={templateData.config.box_style?.border || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, box_style: { ...prev.config.box_style, border: e.target.value } }
                    }))}
                    fullWidth
                    placeholder="1px solid #E5E7EB"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Arrondi"
                    value={templateData.config.box_style?.border_radius || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, box_style: { ...prev.config.box_style, border_radius: e.target.value } }
                    }))}
                    fullWidth
                    placeholder="8px"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Padding encadré"
                    value={templateData.config.box_style?.padding || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, box_style: { ...prev.config.box_style, padding: e.target.value } }
                    }))}
                    fullWidth
                    placeholder="12px"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Fond encadré"
                    value={templateData.config.box_style?.background_color || ''}
                    onChange={(e) => setTemplateData(prev => ({
                      ...prev,
                      config: { ...prev.config, box_style: { ...prev.config.box_style, background_color: e.target.value } }
                    }))}
                    fullWidth
                    placeholder="#ffffff"
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={templateData.config.box_style?.separator ?? false}
                        onChange={(e) => setTemplateData(prev => ({
                          ...prev,
                          config: { ...prev.config, box_style: { ...prev.config.box_style, separator: e.target.checked } }
                        }))}
                      />
                    }
                    label="Séparateur entre sections"
                  />
                </Grid>
              </Grid>

              <Divider />
              <Typography variant="subtitle1" fontWeight={700}>
                Export
              </Typography>
              <Stack direction="row" spacing={2} alignItems="center">
                <FormControlLabel
                  control={
                    <Switch
                      checked={templateData.config.export_options?.pdf_enable ?? true}
                      onChange={(e) => setTemplateData(prev => ({
                        ...prev,
                        config: { ...prev.config, export_options: { ...prev.config.export_options, pdf_enable: e.target.checked } }
                      }))}
                    />
                  }
                  label="Exporter en PDF"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={templateData.config.export_options?.word_enable ?? true}
                      onChange={(e) => setTemplateData(prev => ({
                        ...prev,
                        config: { ...prev.config, export_options: { ...prev.config.export_options, word_enable: e.target.checked } }
                      }))}
                    />
                  }
                  label="Exporter en Word"
                />
                <FormControlLabel
                  control={
                    <Switch
                      checked={templateData.config.export_options?.repeat_header ?? true}
                      onChange={(e) => setTemplateData(prev => ({
                        ...prev,
                        config: { ...prev.config, export_options: { ...prev.config.export_options, repeat_header: e.target.checked } }
                      }))}
                    />
                  }
                  label="Répéter l'en-tête à l'export"
                />
              </Stack>
            </Stack>
          </Box>
        );
        
      case 1:
        return (
          <Box sx={{ height: '100%', minHeight: '600px', display: 'flex' }}>
              {/* Palette de widgets */}
              <Box sx={{ width: '300px', borderRight: 1, borderColor: 'divider', p: 2 }}>
              <WidgetPalette
                presets={presets}
                onAddWidget={handleAddWidget}
                onAddCustomWidget={handleAddCustomWidget}
              />
              </Box>
              
              {/* Zone de construction */}
              <Box sx={{ flex: 1, display: 'flex' }}>
                <Box sx={{ flex: 1, p: 2 }}>
                  <Typography variant="h6" gutterBottom>
                    Template en construction ({templateData.widgets.length} widgets)
                  </Typography>
                  
                  {templateData.widgets.length === 0 ? (
                    <Paper 
                      sx={{ 
                        p: 4, 
                        textAlign: 'center',
                        backgroundColor: alpha(theme.palette.primary.main, 0.05),
                        border: `2px dashed ${alpha(theme.palette.primary.main, 0.3)}`
                      }}
                    >
                      <WidgetsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                      <Typography variant="h6" color="primary">
                        Aucun widget ajouté
                      </Typography>
                      <Typography color="text.secondary">
                        Cliquez sur les widgets dans la palette à gauche pour les ajouter
                      </Typography>
                    </Paper>
                  ) : (
                    <Stack spacing={2}>
                      {templateData.widgets.map((widget, index) => (
                        <Card 
                          key={widget.id}
                          sx={{ 
                            cursor: 'pointer',
                            border: selectedWidget?.id === widget.id ? 2 : 1,
                            borderColor: selectedWidget?.id === widget.id ? 'primary.main' : 'divider'
                          }}
                          onClick={() => setSelectedWidget(widget)}
                        >
                          <CardContent sx={{ pb: 1 }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <DragIcon color="action" />
                              <Typography variant="subtitle2">
                                {widget.config.emoji} {widget.config.title}
                              </Typography>
                              <Chip 
                                label={widget.type} 
                                size="small" 
                                color="primary" 
                                variant="outlined"
                              />
                            </Stack>
                          </CardContent>
                          <CardActions>
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWidget(widget);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveWidget(widget.id);
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </CardActions>
                        </Card>
                      ))}
                    </Stack>
                  )}
                </Box>
              
              {/* Panel de configuration */}
              {selectedWidget && (
                <Box sx={{ 
                  width: '350px', 
                  backgroundColor: 'background.paper',
                  boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                  p: 2,
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: '600px'
                }}>
                  <WidgetConfigPanel
                    widget={selectedWidget}
                    onUpdate={handleUpdateWidget}
                    onClose={() => setSelectedWidget(null)}
                  />
                </Box>
              )}
            </Box>
          </Box>
        );
        
      case 2:
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Prévisualisation
            </Typography>
            
            {templateData.widgets.length === 0 ? (
              <Alert severity="warning">
                Aucun widget configuré. Ajoutez au moins un widget pour continuer.
              </Alert>
            ) : (
              <EnhancedPreview 
                template={templateData}
              />
            )}
          </Box>
        );
        
      case 3:
        return (
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Validation finale
            </Typography>
            
            <Stack spacing={2}>
              <Alert severity="info">
                Vérification des données avant sauvegarde...
              </Alert>
              
              <Box>
                <Typography variant="subtitle1" gutterBottom>
                  Résumé du template :
                </Typography>
                <Typography><strong>Nom :</strong> {templateData.name}</Typography>
                <Typography><strong>Description :</strong> {templateData.description}</Typography>
                <Typography><strong>Nombre de widgets :</strong> {templateData.widgets.length}</Typography>
                <Typography><strong>Version :</strong> {templateData.version}</Typography>
              </Box>
              
              {templateData.widgets.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" gutterBottom>
                    Widgets configurés :
                  </Typography>
                  {templateData.widgets.map((widget, index) => (
                    <Chip 
                      key={widget.id}
                      label={`${index + 1}. ${widget.config.emoji} ${widget.config.title}`}
                      sx={{ m: 0.5 }}
                    />
                  ))}
                </Box>
              )}
            </Stack>
          </Box>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
      PaperProps={{
        sx: { height: '90vh' }
      }}
    >
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h5">
            {mode === 'create' ? 'Créer un nouveau template' : 'Modifier le template'}
          </Typography>
          <IconButton onClick={handleClose}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </DialogTitle>
      
      <DialogContent sx={{ p: 0 }}>
        {/* Stepper */}
        <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Stepper activeStep={activeStep} alternativeLabel>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>
        
        {/* Contenu de l'étape */}
        {renderStepContent()}
      </DialogContent>
      
      <DialogActions sx={{ p: 3, borderTop: 1, borderColor: 'divider' }}>
        <Button 
          onClick={handleClose}
          startIcon={<ArrowBackIcon />}
        >
          Annuler
        </Button>
        
        {activeStep > 0 && (
          <Button 
            onClick={handleBack}
            disabled={loading}
          >
            Précédent
          </Button>
        )}
        
        {activeStep < steps.length - 1 ? (
          <Button 
            variant="contained" 
            onClick={handleNext}
            disabled={loading}
          >
            Suivant
          </Button>
        ) : (
          <Button 
            variant="contained" 
            onClick={handleSave}
            disabled={loading || templateData.widgets.length === 0}
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {loading ? 'Sauvegarde...' : (mode === 'create' ? 'Créer le template' : 'Modifier le template')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TemplateBuilder;
