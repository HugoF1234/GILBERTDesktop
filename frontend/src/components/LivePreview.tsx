/**
 * LivePreview - Prévisualisation en temps réel du template
 */

import React from 'react';
import {
  Box,
  Typography,
  Paper,
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
  ListItemText,
  ListItemIcon,
  Divider,
  Card,
  CardContent,
  alpha,
  useTheme
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  Person as PersonIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Assignment as AssignmentIcon,
  Chat as ChatIcon,
  TextFields as TextIcon,
  Widgets as WidgetsIcon
} from '@mui/icons-material';
import { WidgetTemplate, Widget } from '../services/widgetTemplateService';

interface LivePreviewProps {
  template: Omit<WidgetTemplate, 'id' | 'created_at' | 'updated_at'>;
  mode: 'preview' | 'real';
  data?: Record<string, any>; // Données réelles pour le mode 'real'
}

const LivePreview: React.FC<LivePreviewProps> = ({ template, mode, data }) => {
  const theme = useTheme();
  
  // Données d'exemple pour la prévisualisation
  const getSampleData = (widget: Widget) => {
    switch (widget.type) {
      case 'summary':
        return "Cette réunion de kick-off a permis de définir les objectifs du projet XYZ. L'équipe a validé l'architecture technique proposée et a planifié les prochaines étapes de développement. Les rôles et responsabilités ont été clarifiés, avec une attention particulière sur les livrables du premier sprint.";
        
      case 'list':
        const listItems = [
          "Présentation du projet et des objectifs",
          "Discussion sur l'architecture technique",
          "Planification des sprints",
          "Attribution des rôles et responsabilités",
          "Questions et clarifications"
        ];
        return listItems.slice(0, widget.config.max_items || 5);
        
      case 'table':
      case 'actions':
        return [
          { decision: "Adoption de l'architecture microservices", responsible: "Jean Dupont", deadline: "15/10/2025", success_criteria: "Validation technique" },
          { decision: "Migration vers React 18", responsible: "Marie Martin", deadline: "20/10/2025", success_criteria: "Tests passants" },
          { decision: "Mise en place CI/CD", responsible: "Pierre Durand", deadline: "25/10/2025", success_criteria: "Pipeline fonctionnel" }
        ];
        
      case 'risks':
        return [
          { risk: "Retard possible sur l'API externe", severity: "medium" },
          { risk: "Complexité de l'intégration", severity: "high" },
          { risk: "Disponibilité de l'équipe", severity: "low" }
        ];
        
      case 'milestone':
        return {
          date: "30/10/2025",
          description: "Livraison du premier module avec les fonctionnalités de base"
        };
        
      case 'conversation_log':
        return [
          { speaker: "Jean", topic: "Architecture", content: "Je propose d'utiliser une approche microservices" },
          { speaker: "Marie", topic: "Architecture", content: "C'est une bonne idée, cela nous donnera plus de flexibilité" },
          { speaker: "Pierre", topic: "Planning", content: "Nous devons prévoir 2 semaines pour la migration" }
        ];
        
      case 'custom_paragraph':
        return "Notes importantes : L'équipe a souligné l'importance de maintenir une documentation à jour tout au long du projet. Il faudra prévoir des sessions de formation pour les nouveaux développeurs qui rejoindront l'équipe au cours du projet.";
        
      default:
        return "Contenu d'exemple";
    }
  };
  
  const getWidgetIcon = (type: string) => {
    switch (type) {
      case 'summary': return <WidgetsIcon />;
      case 'list': return <AssignmentIcon />;
      case 'table': return <AssignmentIcon />;
      case 'actions': return <CheckCircleIcon />;
      case 'risks': return <WarningIcon />;
      case 'milestone': return <ScheduleIcon />;
      case 'conversation_log': return <ChatIcon />;
      case 'custom_paragraph': return <TextIcon />;
      default: return <WidgetsIcon />;
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return theme.palette.success.main;
      case 'medium': return theme.palette.warning.main;
      case 'high': return theme.palette.error.main;
      case 'critical': return theme.palette.error.dark;
      default: return theme.palette.grey[500];
    }
  };
  
  const renderWidget = (widget: Widget, index: number) => {
    const sampleData = mode === 'preview' ? getSampleData(widget) : (data?.[widget.id] || getSampleData(widget));
    
    return (
      <Paper 
        key={widget.id} 
        sx={{ 
          p: 3, 
          mb: 2,
          border: 1,
          borderColor: alpha(theme.palette.primary.main, 0.2)
        }}
      >
        {widget.config.show_title && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            {getWidgetIcon(widget.type)}
            <Typography variant="h6" color="primary">
              {widget.config.emoji} {widget.config.title}
            </Typography>
            {mode === 'preview' && (
              <Chip 
                label="Aperçu" 
                size="small" 
                color="secondary" 
                variant="outlined"
              />
            )}
          </Stack>
        )}
        
        <Box sx={{ color: 'text.secondary', fontStyle: 'italic', mb: 2 }}>
          <Typography variant="caption">
            Prompt IA: {widget.config.ai_prompt}
          </Typography>
        </Box>
        
        {renderWidgetContent(widget, sampleData)}
      </Paper>
    );
  };
  
  const renderWidgetContent = (widget: Widget, data: any) => {
    switch (widget.type) {
      case 'summary':
        return (
          <Typography 
            variant="body1" 
            sx={{ 
              lineHeight: 1.6,
              backgroundColor: alpha(theme.palette.primary.main, 0.05),
              p: 2,
              borderRadius: 1
            }}
          >
            {data}
          </Typography>
        );
        
      case 'list':
        return (
          <List>
            {(data as string[]).map((item, index) => (
              <ListItem key={index} sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {widget.config.list_style === 'numbered' ? (
                    <Typography variant="body2" color="primary">
                      {index + 1}.
                    </Typography>
                  ) : widget.config.list_style === 'checkbox' ? (
                    <CheckCircleIcon color="action" fontSize="small" />
                  ) : (
                    <Typography variant="body2" color="primary">
                      •
                    </Typography>
                  )}
                </ListItemIcon>
                <ListItemText primary={item} />
              </ListItem>
            ))}
          </List>
        );
        
      case 'table':
      case 'actions':
        return (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {(widget.config.columns || []).map((column, index) => (
                    <TableCell key={index}>
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(data as any[]).map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {(widget.config.columns || []).map((column, colIndex) => (
                      <TableCell key={colIndex}>
                        {row[column.key] || '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        );
        
      case 'risks':
        return (
          <Stack spacing={1}>
            {(data as any[]).map((risk, index) => (
              <Box 
                key={index}
                sx={{
                  p: 2,
                  border: 1,
                  borderColor: getSeverityColor(risk.severity),
                  borderRadius: 1,
                  backgroundColor: alpha(getSeverityColor(risk.severity), 0.05)
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1}>
                  <WarningIcon color="action" />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {risk.risk}
                  </Typography>
                  <Chip 
                    label={risk.severity} 
                    size="small"
                    sx={{ 
                      backgroundColor: getSeverityColor(risk.severity),
                      color: 'white'
                    }}
                  />
                </Stack>
              </Box>
            ))}
          </Stack>
        );
        
      case 'milestone':
        return (
          <Card variant="outlined">
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={2}>
                <ScheduleIcon color="primary" />
                <Box>
                  {widget.config.show_date && (
                    <Typography variant="h6" color="primary">
                      {data.date}
                    </Typography>
                  )}
                  {widget.config.show_description && (
                    <Typography variant="body2">
                      {data.description}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </CardContent>
          </Card>
        );
        
      case 'conversation_log':
        return (
          <Stack spacing={2}>
            {(data as any[]).map((exchange, index) => (
              <Box key={index}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <PersonIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2" color="primary">
                    {exchange.speaker}
                  </Typography>
                  {widget.config.group_by_topic && (
                    <Chip 
                      label={exchange.topic} 
                      size="small" 
                      variant="outlined"
                    />
                  )}
                </Stack>
                <Typography variant="body2" sx={{ ml: 3 }}>
                  {exchange.content}
                </Typography>
                {index < data.length - 1 && <Divider sx={{ mt: 1 }} />}
              </Box>
            ))}
          </Stack>
        );
        
      case 'custom_paragraph':
        return (
          <Typography 
            variant="body1" 
            sx={{ 
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}
          >
            {data}
          </Typography>
        );
        
      default:
        return (
          <Typography variant="body2" color="text.secondary">
            Type de widget non supporté: {widget.type}
          </Typography>
        );
    }
  };
  
  return (
    <Box 
      sx={{ 
        maxWidth: template.config.global_style.max_width,
        mx: 'auto',
        p: 2
      }}
    >
      <Typography variant="h4" gutterBottom sx={{ textAlign: 'center', mb: 3 }}>
        {template.name}
      </Typography>
      
      {template.description && (
        <Typography 
          variant="body1" 
          color="text.secondary" 
          sx={{ textAlign: 'center', mb: 4 }}
        >
          {template.description}
        </Typography>
      )}
      
      <Stack spacing={2}>
        {template.widgets
          .sort((a, b) => a.order - b.order)
          .map((widget, index) => renderWidget(widget, index))
        }
      </Stack>
      
      {mode === 'preview' && (
        <Box 
          sx={{ 
            mt: 4, 
            p: 2, 
            backgroundColor: alpha(theme.palette.info.main, 0.1),
            borderRadius: 1,
            textAlign: 'center'
          }}
        >
          <Typography variant="body2" color="info.main">
            💡 Ceci est un aperçu avec des données d'exemple
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default LivePreview;
