/**
 * WidgetPalette - Palette des widgets disponibles
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  alpha,
  useTheme
} from '@mui/material';
// import { Draggable } from 'react-beautiful-dnd';
import {
  Add as AddIcon,
  Widgets as WidgetsIcon,
  List as ListIcon,
  TableChart as TableIcon,
  Assignment as AssignmentIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Chat as ChatIcon,
  TextFields as TextIcon,
  Build as BuildIcon
} from '@mui/icons-material';
import { WidgetPreset, WidgetConfig } from '../services/widgetTemplateService';
import CustomWidgetDialog from './CustomWidgetDialog';

interface WidgetPaletteProps {
  presets: WidgetPreset[];
  onAddWidget: (preset: WidgetPreset) => void;
  onAddCustomWidget?: (config: WidgetConfig) => void;
}

const WidgetPalette: React.FC<WidgetPaletteProps> = ({ 
  presets, 
  onAddWidget, 
  onAddCustomWidget 
}) => {
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const theme = useTheme();
  
  // Protection contre les presets vides ou undefined
  if (!presets || presets.length === 0) {
    return (
      <Box>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WidgetsIcon />
          Widgets disponibles
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Chargement des widgets...
        </Typography>
      </Box>
    );
  }
  
  // Icônes pour les différents types de widgets
  const getWidgetIcon = (type: string) => {
    switch (type) {
      case 'summary': return <WidgetsIcon />;
      case 'list': return <ListIcon />;
      case 'table': return <TableIcon />;
      case 'actions': return <AssignmentIcon />;
      case 'risks': return <WarningIcon />;
      case 'milestone': return <ScheduleIcon />;
      case 'conversation_log': return <ChatIcon />;
      case 'custom_paragraph': return <TextIcon />;
      default: return <BuildIcon />;
    }
  };
  
  // Couleurs pour les différents types
  const getWidgetColor = (type: string) => {
    switch (type) {
      case 'summary': return theme.palette.primary.main;
      case 'list': return theme.palette.success.main;
      case 'table': return theme.palette.info.main;
      case 'actions': return theme.palette.warning.main;
      case 'risks': return theme.palette.error.main;
      case 'milestone': return theme.palette.secondary.main;
      case 'conversation_log': return '#9C27B0';
      case 'custom_paragraph': return '#795548';
      default: return theme.palette.grey[600];
    }
  };
  
  // Grouper les widgets par catégorie
  const categorizedWidgets = {
    'Structure': presets.filter(p => ['summary', 'list'].includes(p.type)),
    'Tableaux': presets.filter(p => ['table', 'actions'].includes(p.type)),
    'Spécialisés': presets.filter(p => ['risks', 'milestone', 'conversation_log'].includes(p.type)),
    'Personnalisés': presets.filter(p => ['custom_paragraph'].includes(p.type))
  };
  
  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WidgetsIcon />
        Widgets disponibles
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Cliquez sur un widget pour l'ajouter à votre template
      </Typography>
      
      <Stack spacing={3}>
        {Object.entries(categorizedWidgets).map(([category, widgets]) => (
          <Box key={category}>
            <Typography 
              variant="subtitle2" 
              color="text.secondary" 
              sx={{ 
                mb: 1, 
                textTransform: 'uppercase', 
                letterSpacing: 0.5,
                fontSize: '0.75rem'
              }}
            >
              {category}
            </Typography>
            
            <Stack spacing={1}>
              {widgets.map((preset, index) => (
                <Paper
                  key={preset.type}
                  sx={{
                    p: 2,
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    border: 1,
                    borderColor: 'divider',
                    backgroundColor: 'background.paper',
                    '&:hover': {
                      backgroundColor: alpha(getWidgetColor(preset.type), 0.1),
                      borderColor: getWidgetColor(preset.type),
                      transform: 'translateY(-1px)',
                      boxShadow: theme.shadows[4]
                    }
                  }}
                  onClick={() => onAddWidget(preset)}
                >
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: 1,
                        backgroundColor: alpha(getWidgetColor(preset.type), 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: getWidgetColor(preset.type)
                      }}
                    >
                      {getWidgetIcon(preset.type)}
                    </Box>
                    
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Typography variant="body2" fontWeight="medium" noWrap>
                          {preset.icon} {preset.label}
                        </Typography>
                      </Stack>
                      
                      <Typography 
                        variant="caption" 
                        color="text.secondary"
                        sx={{ 
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}
                      >
                        {preset.description}
                      </Typography>
                    </Box>
                    
                    {/* Bouton + toujours au même endroit */}
                    <Box sx={{ 
                      position: 'absolute', 
                      top: 8, 
                      right: 8,
                      zIndex: 1
                    }}>
                      <IconButton 
                        size="small" 
                        sx={{ 
                          width: 24,
                          height: 24,
                          backgroundColor: alpha(getWidgetColor(preset.type), 0.1),
                          '&:hover': { 
                            backgroundColor: alpha(getWidgetColor(preset.type), 0.2),
                            transform: 'scale(1.1)'
                          },
                          transition: 'all 0.2s ease-in-out'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddWidget(preset);
                        }}
                      >
                        <AddIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>
        ))}
      </Stack>
      
      {/* Section PERSONNALISÉS */}
      <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography 
          variant="subtitle2" 
          color="text.secondary" 
          sx={{ 
            mb: 1, 
            textTransform: 'uppercase', 
            letterSpacing: 0.5,
            fontSize: '0.75rem'
          }}
        >
          PERSONNALISÉS
        </Typography>
        
        <Paper
          sx={{
            p: 2,
            position: 'relative',
            cursor: 'pointer',
            border: 1,
            borderColor: 'divider',
            borderStyle: 'dashed',
            transition: 'all 0.2s ease-in-out',
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              borderColor: theme.palette.primary.main,
              transform: 'translateY(-1px)',
              boxShadow: theme.shadows[4]
            }
          }}
          onClick={() => {
            setCustomDialogOpen(true);
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.palette.primary.main
              }}
            >
              <BuildIcon />
            </Box>
            
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" fontWeight="medium">
                Créer un widget personnalisé
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Widget sur mesure pour vos besoins spécifiques
              </Typography>
            </Box>
            
            <Box sx={{ 
              position: 'absolute', 
              top: 8, 
              right: 8,
              zIndex: 1
            }}>
              <IconButton 
                size="small" 
                sx={{ 
                  width: 24,
                  height: 24,
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  '&:hover': { 
                    backgroundColor: alpha(theme.palette.primary.main, 0.2),
                    transform: 'scale(1.1)'
                  },
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          </Stack>
        </Paper>
      </Box>

      {/* Dialog pour créer un widget personnalisé */}
      <CustomWidgetDialog
        open={customDialogOpen}
        onClose={() => setCustomDialogOpen(false)}
        onSave={(config) => {
          if (onAddCustomWidget) {
            onAddCustomWidget(config);
          }
          setCustomDialogOpen(false);
        }}
      />
    </Box>
  );
};

export default WidgetPalette;
