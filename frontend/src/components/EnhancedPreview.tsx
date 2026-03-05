import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Alert
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Assignment as AssignmentIcon,
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Chat as ChatIcon,
  TextFields as TextIcon
} from '@mui/icons-material';
import { Widget, TemplateConfigModel } from '../services/widgetTemplateService';

interface EnhancedPreviewProps {
  template: TemplateConfigModel;
}

const EnhancedPreview: React.FC<EnhancedPreviewProps> = ({ template }) => {
  const renderWidgetContent = (widget: Widget) => {
    const { type, config } = widget;
    
    switch (type) {
      case 'summary':
        return (
          <Box sx={{ p: 2, backgroundColor: 'primary.50', borderRadius: 1 }}>
            <Typography variant="body1" color="text.secondary">
              📝 <strong>Résumé généré :</strong> Cette réunion a porté sur les points clés suivants : 
              la mise en place d'un nouveau système de gestion, l'analyse des performances du trimestre 
              et la planification des prochaines étapes. Les participants ont validé les orientations 
              stratégiques et défini les actions prioritaires pour les semaines à venir.
            </Typography>
          </Box>
        );

      case 'list':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              📋 Points abordés :
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon><TextIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Présentation des résultats trimestriels" />
              </ListItem>
              <ListItem>
                <ListItemIcon><TextIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Discussion sur les nouveaux projets" />
              </ListItem>
              <ListItem>
                <ListItemIcon><TextIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Planification des ressources humaines" />
              </ListItem>
            </List>
          </Box>
        );

      case 'table':
        return (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Décision</TableCell>
                  <TableCell>Responsable</TableCell>
                  <TableCell>Échéance</TableCell>
                  <TableCell>Statut</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>Mise à jour du système CRM</TableCell>
                  <TableCell>Jean Dupont</TableCell>
                  <TableCell>15/12/2024</TableCell>
                  <TableCell>
                    <Chip label="En cours" size="small" color="warning" />
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Recrutement développeur</TableCell>
                  <TableCell>Marie Martin</TableCell>
                  <TableCell>30/11/2024</TableCell>
                  <TableCell>
                    <Chip label="Terminé" size="small" color="success" />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        );

      case 'actions':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              ✅ Actions assignées :
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ p: 1, backgroundColor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Jean Dupont :</strong> Finaliser le cahier des charges - <em>Échéance : 15/12/2024</em>
                </Typography>
              </Box>
              <Box sx={{ p: 1, backgroundColor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="body2">
                  <strong>Marie Martin :</strong> Contacter les fournisseurs - <em>Échéance : 20/12/2024</em>
                </Typography>
              </Box>
            </Stack>
          </Box>
        );

      case 'risks':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              ⚠️ Risques identifiés :
            </Typography>
            <Stack spacing={1}>
              <Alert severity="warning" variant="outlined">
                <Typography variant="body2">
                  <strong>Délai serré :</strong> Risque de retard sur la livraison du projet principal
                </Typography>
              </Alert>
              <Alert severity="info" variant="outlined">
                <Typography variant="body2">
                  <strong>Ressources :</strong> Besoin de formation pour l'équipe technique
                </Typography>
              </Alert>
            </Stack>
          </Box>
        );

      case 'milestone':
        return (
          <Box sx={{ p: 2, backgroundColor: 'success.50', borderRadius: 1, border: 1, borderColor: 'success.200' }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <ScheduleIcon color="success" />
              <Box>
                <Typography variant="subtitle2" color="success.dark">
                  Prochain jalon
                </Typography>
                <Typography variant="body2">
                  <strong>17/12/2024 :</strong> Présentation du prototype au comité de direction
                </Typography>
              </Box>
            </Stack>
          </Box>
        );

      case 'conversation_log':
        return (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              💬 Journal des échanges :
            </Typography>
            <Stack spacing={1}>
              <Box sx={{ p: 1, backgroundColor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <strong>Jean :</strong> "Nous avons fait de bons progrès cette semaine..."
                </Typography>
              </Box>
              <Box sx={{ p: 1, backgroundColor: 'grey.50', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <strong>Marie :</strong> "Les tests utilisateurs sont très encourageants..."
                </Typography>
              </Box>
            </Stack>
          </Box>
        );

      case 'custom_paragraph':
        return (
          <Box sx={{ p: 2, backgroundColor: 'info.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {config.emoji} <strong>{config.title || 'Paragraphe personnalisé'}:</strong> {config.description || 'Contenu personnalisé généré selon les instructions spécifiques pour ce widget. Cette zone peut contenir du texte formaté, des listes, ou tout autre contenu défini par l\'utilisateur.'}
            </Typography>
          </Box>
        );

      case 'free_text':
        return (
          <Box sx={{ p: 2, backgroundColor: 'warning.50', borderRadius: 1, border: 1, borderColor: 'warning.200' }}>
            <Typography variant="body2" color="text.secondary">
              {config.emoji || '✏️'} <strong>{config.title || 'Zone de texte libre'}:</strong> {config.description || 'Cette zone permet d\'ajouter du contenu libre, des notes personnelles ou des observations spécifiques qui ne rentrent pas dans les autres catégories prédéfinies.'}
            </Typography>
          </Box>
        );

      default:
        return (
          <Box sx={{ p: 2, backgroundColor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Widget non reconnu : {type}
            </Typography>
          </Box>
        );
    }
  };

  return (
    <Paper sx={{ p: 3, maxWidth: '800px', mx: 'auto' }}>
      <Stack spacing={3}>
        {/* En-tête du template */}
        <Box sx={{ textAlign: 'center', pb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="h5" gutterBottom>
            📄 {template.title || 'Nouveau Template'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {template.description || 'Description du template'}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip label="Mode Prévisualisation" size="small" color="primary" />
          </Box>
        </Box>

        {/* Contenu des widgets */}
        {template.widgets.length === 0 ? (
          <Alert severity="info">
            Aucun widget configuré dans ce template
          </Alert>
        ) : (
          <Stack spacing={3}>
            {template.widgets.map((widget, index) => (
              <Box key={widget.id}>
                {/* Titre du widget */}
                {widget.config.display_title && (
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="h6" gutterBottom>
                      {widget.config.emoji} {widget.config.title}
                    </Typography>
                    {widget.config.description && (
                      <Typography variant="body2" color="text.secondary">
                        {widget.config.description}
                      </Typography>
                    )}
                  </Box>
                )}
                
                {/* Contenu du widget */}
                {renderWidgetContent(widget)}
                
                {/* Séparateur entre les widgets */}
                {index < template.widgets.length - 1 && (
                  <Divider sx={{ mt: 2 }} />
                )}
              </Box>
            ))}
          </Stack>
        )}

        {/* Pied de page */}
        <Box sx={{ pt: 2, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Template généré le {new Date().toLocaleDateString('fr-FR')} - 
            {template.widgets.length} widget{template.widgets.length > 1 ? 's' : ''} configuré{template.widgets.length > 1 ? 's' : ''}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
};

export default EnhancedPreview;
