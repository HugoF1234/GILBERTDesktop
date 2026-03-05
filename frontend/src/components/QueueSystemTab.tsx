import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Card,
  CardContent,
  Grid,
  Button,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Clear as ClearIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  HealthAndSafety as HealthIcon
} from '@mui/icons-material';

interface QueueSystemTabProps {
  queueStatus: any;
  queueHistory: any[];
  systemHealth: any;
  loading: boolean;
  onRefresh: () => void;
  onClearQueue: () => void;
}

const QueueSystemTab: React.FC<QueueSystemTabProps> = ({
  queueStatus,
  queueHistory,
  systemHealth,
  loading,
  onRefresh,
  onClearQueue
}) => {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    return date.toLocaleString('fr-FR');
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'completed':
        return <Chip icon={<CheckCircleIcon />} label="Terminé" color="success" size="small" />;
      case 'processing':
        return <Chip icon={<ScheduleIcon />} label="En cours" color="warning" size="small" />;
      case 'pending':
        return <Chip icon={<ScheduleIcon />} label="En attente" color="info" size="small" />;
      case 'error':
        return <Chip icon={<ErrorIcon />} label="Erreur" color="error" size="small" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      {/* Actions */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
          disabled={loading}
        >
          Actualiser
        </Button>
        {queueStatus?.size > 0 && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<ClearIcon />}
            onClick={onClearQueue}
          >
            Vider la queue
          </Button>
        )}
      </Box>

      <Grid container spacing={3}>
        {/* État de santé du système */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                <HealthIcon color="primary" sx={{ mr: 2 }} />
                <Typography variant="h6">État de santé</Typography>
              </Box>
              {systemHealth ? (
                <Box>
                  <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                    <Chip 
                      label={systemHealth.health?.status || 'unknown'} 
                      color={getHealthColor(systemHealth.health?.status || 'unknown') as any}
                      sx={{ mr: 2 }}
                    />
                    <Typography variant="h4">
                      {systemHealth.health?.score || 0}%
                    </Typography>
                  </Box>
                  {systemHealth.health?.issues?.length > 0 && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      <Typography variant="subtitle2">Problèmes détectés :</Typography>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {systemHealth.health.issues.map((issue: string, index: number) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">Chargement...</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Statistiques de la queue */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" sx={{ mb: 2 }}>
                <ScheduleIcon color="primary" sx={{ mr: 2 }} />
                <Typography variant="h6">File d'attente</Typography>
              </Box>
              {queueStatus ? (
                <Box>
                  <Typography variant="h4" sx={{ mb: 1 }}>
                    {queueStatus.size || 0}
                  </Typography>
                  <Typography color="text.secondary">
                    Tâches en attente
                  </Typography>
                  {queueStatus.oldest_task && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Plus ancienne : {formatDate(queueStatus.oldest_task)}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography color="text.secondary">Chargement...</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Détails de la queue */}
        {queueStatus?.queue_files?.length > 0 && (
          <Grid item xs={12}>
            <Paper>
              <Box sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  Fichiers dans la queue
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Réunion ID</TableCell>
                        <TableCell>Utilisateur</TableCell>
                        <TableCell>Fichier</TableCell>
                        <TableCell>Créé le</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {queueStatus.queue_files.map((file: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {file.meeting_id?.substring(0, 8)}...
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                              {file.user_id?.substring(0, 8)}...
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {file.file_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {file.created_at ? formatDate(file.created_at) : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Paper>
          </Grid>
        )}

        {/* Historique des transcriptions */}
        <Grid item xs={12}>
          <Paper>
            <Box sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Historique des transcriptions récentes
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Réunion</TableCell>
                      <TableCell>Utilisateur</TableCell>
                      <TableCell>Statut Transcription</TableCell>
                      <TableCell>Statut Résumé</TableCell>
                      <TableCell>Durée</TableCell>
                      <TableCell>Créé le</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {queueHistory.map((transcription, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">
                            {transcription.title}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">
                              {transcription.user_name || transcription.user_email}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {transcription.user_email}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          {getStatusChip(transcription.transcript_status)}
                        </TableCell>
                        <TableCell>
                          {getStatusChip(transcription.summary_status || 'N/A')}
                        </TableCell>
                        <TableCell>
                          {transcription.duration_seconds 
                            ? `${Math.floor(transcription.duration_seconds / 60)}min`
                            : 'N/A'
                          }
                        </TableCell>
                        <TableCell>
                          {transcription.created_at ? formatDate(transcription.created_at) : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default QueueSystemTab;
