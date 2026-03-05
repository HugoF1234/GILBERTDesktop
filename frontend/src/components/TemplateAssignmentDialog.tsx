import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Switch,
  FormControlLabel,
  Chip,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Person as PersonIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import { 
  getTemplateAssignments, 
  assignTemplateToUser, 
  unassignTemplateFromUser,
  TemplateAssignmentResponse,
  UserTemplateAssignment
} from '../services/templateAssignmentService';
import { useNotification } from '../contexts/NotificationContext';
import { logger } from '@/utils/logger';

interface TemplateAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  templateId: string;
  templateName: string;
}

const TemplateAssignmentDialog: React.FC<TemplateAssignmentDialogProps> = ({
  open,
  onClose,
  templateId,
  templateName
}) => {
  const [assignments, setAssignments] = useState<TemplateAssignmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);
  const { showSuccessPopup, showErrorPopup } = useNotification();

  const loadAssignments = async () => {
    if (!templateId) return;
    
    try {
      setLoading(true);
      const data = await getTemplateAssignments(templateId);
      setAssignments(data);
    } catch (error) {
      logger.error('Error loading template assignments:', error);
      showErrorPopup('Erreur', 'Impossible de charger les attributions du template.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && templateId) {
      loadAssignments();
    }
  }, [open, templateId]);

  const handleToggleAssignment = async (user: UserTemplateAssignment) => {
    try {
      setUpdating(user.user_id);
      
      if (user.has_template) {
        await unassignTemplateFromUser(templateId, user.user_id);
        showSuccessPopup('Succès', `Accès retiré pour ${user.email}`);
      } else {
        await assignTemplateToUser(templateId, user.user_id);
        showSuccessPopup('Succès', `Template attribué à ${user.email}`);
      }
      
      // Recharger les données
      await loadAssignments();
    } catch (error) {
      logger.error('Error toggling assignment:', error);
      showErrorPopup('Erreur', 'Impossible de modifier l\'attribution.');
    } finally {
      setUpdating(null);
    }
  };

  const filteredUsers = assignments?.user_assignments.filter(user => 
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.first_name && user.first_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (user.last_name && user.last_name.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  const assignedCount = filteredUsers.filter(user => user.has_template).length;
  const totalCount = filteredUsers.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="h6">
              Gestion des attributions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Template: <strong>{templateName}</strong>
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" gap={1}>
            <Chip 
              label={`${assignedCount}/${totalCount} attribués`}
              color="primary"
              size="small"
            />
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Box>
            {/* Barre de recherche */}
            <TextField
              fullWidth
              placeholder="Rechercher un utilisateur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setSearchQuery('')}
                    >
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{ mb: 2 }}
            />

            {/* Tableau des utilisateurs */}
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Utilisateur</TableCell>
                    <TableCell align="center">Statut</TableCell>
                    <TableCell align="center">Attribution</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.user_id}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <PersonIcon color="action" />
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {user.first_name && user.last_name 
                                ? `${user.first_name} ${user.last_name}`
                                : user.email
                              }
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {user.email}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={user.is_active ? 'Actif' : 'Inactif'}
                          color={user.is_active ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        {user.has_template ? (
                          <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                            <CheckCircleIcon color="success" fontSize="small" />
                            <Typography variant="caption" color="success.main">
                              Attribué
                            </Typography>
                          </Box>
                        ) : (
                          <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                            <CancelIcon color="disabled" fontSize="small" />
                            <Typography variant="caption" color="text.secondary">
                              Non attribué
                            </Typography>
                          </Box>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={user.has_template ? 'Retirer l\'accès' : 'Attribuer le template'}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={user.has_template}
                                onChange={() => handleToggleAssignment(user)}
                                disabled={updating === user.user_id || !user.is_active}
                                color="primary"
                              />
                            }
                            label=""
                          />
                        </Tooltip>
                        {updating === user.user_id && (
                          <CircularProgress size={16} sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {filteredUsers.length === 0 && (
              <Box textAlign="center" py={4}>
                <Typography color="text.secondary">
                  {searchQuery ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur disponible'}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>
          Fermer
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateAssignmentDialog;
