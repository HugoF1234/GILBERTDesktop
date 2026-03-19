/**
 * Onglet de gestion des organisations pour l'admin
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardContent,
  CardActions,
  CardMedia,
  Chip,
  IconButton,
  Avatar,
  List,
  ListItem,
  ListItemText,
  Alert,
  CircularProgress,
  Stack,
  Switch,
  Badge,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  Assignment as AssignmentIcon,
  ContentCopy as CopyIcon,
  Description as TemplateIcon,
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import {
  getAllOrganizations,
  createOrganization,
  updateOrganization,
  getOrganizationMembers,
  addMemberToOrganization,
  removeMemberFromOrganization,
  updateMemberRole,
  getOrganizationMeetings,
  getOrganizationLogoUrl,
  assignTemplateToOrganization,
  getOrganizationTemplates,
  deleteOrganization,
  type Organization,
  type OrganizationMember,
  type OrganizationMeeting,
  type OrganizationTemplate,
} from '../services/organizationService';
import { getAdminUsers } from '../services/meetingService';
import apiClient from '../services/apiClient';
import { logger } from '@/utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gilbert.lexiapro.fr';

interface Template {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
}

interface User {
  id: string;
  email: string;
  full_name: string;
  profile_picture_url?: string;
}

interface AdminOrganizationsTabProps {
  loading?: boolean;
  onRefresh?: () => void;
}

const AdminOrganizationsTab: React.FC<AdminOrganizationsTabProps> = ({ loading: _loading = false, onRefresh }) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [membersDialogOpen, setMembersDialogOpen] = useState(false);
  const [meetingsDialogOpen, setMeetingsDialogOpen] = useState(false);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [organizationToDelete, setOrganizationToDelete] = useState<Organization | null>(null);
  const [deletingOrganization, setDeletingOrganization] = useState(false);

  // Formulaire de création/édition
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Organisation sélectionnée
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [meetings, setMeetings] = useState<OrganizationMeeting[]>([]);
  const [orgTemplates, setOrgTemplates] = useState<OrganizationTemplate[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Gestion des membres et templates
  const [users, setUsers] = useState<User[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchMember, setSearchMember] = useState('');
  const [searchTemplate, setSearchTemplate] = useState('');
  const [togglingMember, setTogglingMember] = useState<string | null>(null);
  const [togglingTemplate, setTogglingTemplate] = useState<string | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // Charger les organisations
  const loadOrganizations = useCallback(async () => {
    logger.debug('📥 loadOrganizations appelée...');
    setLoadingOrgs(true);
    setError(null);
    try {
      const data = await getAllOrganizations();
      logger.debug('✅ Organizations loaded from API:', data);
      logger.debug('✅ Number of organizations:', data?.length || 0);
      setOrganizations(data || []);
    } catch (err: any) {
      logger.error('❌ Erreur lors du chargement des organisations:', err);
      setError(err.response?.data?.detail || 'Erreur lors du chargement des organisations');
      setOrganizations([]);
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  // Charger tous les utilisateurs (jusqu'à 10000, couvre la grande majorité des cas)
  const loadUsers = useCallback(async () => {
    try {
      const data = await getAdminUsers(1, 10000);
      logger.debug('👥 Utilisateurs chargés:', data);
      const usersArray = data?.users || [];
      setUsers(usersArray);
      logger.debug('👥 Users count:', usersArray.length);
    } catch (err) {
      logger.error('❌ Erreur lors du chargement des utilisateurs:', err);
      setUsers([]);
    }
  }, []);

  // Charger les templates
  const loadTemplates = useCallback(async () => {
    try {
      const response = await apiClient.get<Template[]>('/admin/templates');
      logger.debug('📋 Templates chargés:', response);
      setTemplates(response || []);
    } catch (err) {
      logger.error('Erreur lors du chargement des templates:', err);
      setTemplates([]);
    }
  }, []);

  // Créer une organisation
  const handleCreateOrganization = async () => {
    setError(null);
    setSuccess(null);

    if (!formData.name.trim()) {
      setError('Le nom est obligatoire');
      return;
    }

    try {
      setUploadingLogo(true);
      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (logoFile) {
        formDataToSend.append('logo', logoFile);
      }

      const newOrg = await createOrganization(formDataToSend);
      logger.debug('✅ Organisation créée:', newOrg);
      setSuccess('Organisation créée avec succès');
      setCreateDialogOpen(false);
      resetForm();
      logger.debug('🔄 Rechargement des organisations...');
      await loadOrganizations();
      logger.debug('✅ Organisations rechargées:', organizations);
    } catch (err: any) {
      logger.error('Erreur lors de la création:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la création de l\'organisation');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRequestDeleteOrganization = (org: Organization) => {
    setError(null);
    setSuccess(null);
    setOrganizationToDelete(org);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteOrganization = async () => {
    if (!organizationToDelete) {
      return;
    }

    try {
      setDeletingOrganization(true);
      await deleteOrganization(organizationToDelete.id);
      setSuccess(`Organisation "${organizationToDelete.name}" supprimée avec succès`);
      setDeleteDialogOpen(false);
      setOrganizationToDelete(null);
      await loadOrganizations();
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      logger.error('❌ Erreur lors de la suppression de l\'organisation:', err);
      const message = err?.response?.data?.detail || err?.message || "Impossible de supprimer l'organisation";
      setError(message);
    } finally {
      setDeletingOrganization(false);
    }
  };

  // Modifier une organisation
  const handleUpdateOrganization = async () => {
    if (!selectedOrganization) return;

    setError(null);
    setSuccess(null);

    try {
      setUploadingLogo(true);
      const formDataToSend = new FormData();
      if (formData.name) {
        formDataToSend.append('name', formData.name);
      }
      if (formData.description) {
        formDataToSend.append('description', formData.description);
      }
      if (logoFile) {
        formDataToSend.append('logo', logoFile);
      }

      await updateOrganization(selectedOrganization.id, formDataToSend);
      setSuccess('Organisation modifiée avec succès');
      setEditDialogOpen(false);
      setSelectedOrganization(null);
      resetForm();
      await loadOrganizations();
    } catch (err: any) {
      logger.error('Erreur lors de la modification:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la modification de l\'organisation');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Gérer les membres
  const handleManageMembers = async (org: Organization) => {
    setSelectedOrganization(org);
    setMembersDialogOpen(true);
    setLoadingDetails(true);
    try {
      const membersData = await getOrganizationMembers(org.id);
      setMembers(membersData);
      await loadUsers();
    } catch (err) {
      logger.error('Erreur lors du chargement des membres:', err);
      setError('Erreur lors du chargement des membres');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Toggle membre ON/OFF
  const handleToggleMember = async (userId: string, isCurrentlyMember: boolean) => {
    if (!selectedOrganization) return;

    setTogglingMember(userId);
    setError(null);
    try {
      if (isCurrentlyMember) {
        await removeMemberFromOrganization(selectedOrganization.id, userId);
        setSuccess('Membre retiré avec succès');
      } else {
        await addMemberToOrganization(selectedOrganization.id, userId);
        setSuccess('Membre ajouté avec succès');
      }
      const membersData = await getOrganizationMembers(selectedOrganization.id);
      setMembers(membersData);
      await loadOrganizations();
    } catch (err: any) {
      logger.error('Erreur lors de la modification du membre:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la modification du membre');
    } finally {
      setTogglingMember(null);
    }
  };

  // Modifier le rôle d'un membre
  const handleChangeRole = async (userId: string, newRole: 'admin' | 'member') => {
    if (!selectedOrganization) return;

    setUpdatingRole(userId);
    setError(null);
    try {
      await updateMemberRole(selectedOrganization.id, userId, newRole);
      setSuccess(`Rôle mis à jour en "${newRole === 'admin' ? 'Administrateur' : 'Membre'}"`);
      const membersData = await getOrganizationMembers(selectedOrganization.id);
      setMembers(membersData);
    } catch (err: any) {
      logger.error('Erreur lors de la modification du rôle:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la modification du rôle');
    } finally {
      setUpdatingRole(null);
    }
  };

  // Gérer les réunions
  const handleManageMeetings = async (org: Organization) => {
    setSelectedOrganization(org);
    setMeetingsDialogOpen(true);
    setLoadingDetails(true);
    try {
      const meetingsData = await getOrganizationMeetings(org.id);
      setMeetings(meetingsData);
    } catch (err) {
      logger.error('Erreur lors du chargement des réunions:', err);
      setError('Erreur lors du chargement des réunions');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Gérer les templates
  const handleManageTemplates = async (org: Organization) => {
    setSelectedOrganization(org);
    setTemplatesDialogOpen(true);
    setLoadingDetails(true);
    try {
      const templatesData = await getOrganizationTemplates(org.id);
      setOrgTemplates(templatesData);
      await loadTemplates();
    } catch (err) {
      logger.error('Erreur lors du chargement des templates:', err);
      setError('Erreur lors du chargement des templates');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Toggle template ON/OFF
  const handleToggleTemplate = async (templateId: string, isCurrentlyAssigned: boolean) => {
    if (!selectedOrganization) return;

    setTogglingTemplate(templateId);
    setError(null);
    try {
      if (isCurrentlyAssigned) {
        // Pour l'instant, on ne peut pas retirer un template (à implémenter côté backend si besoin)
        setError('La suppression de templates n\'est pas encore implémentée');
      } else {
        await assignTemplateToOrganization(selectedOrganization.id, templateId);
        setSuccess('Template assigné avec succès à tous les membres');
      }
      const templatesData = await getOrganizationTemplates(selectedOrganization.id);
      setOrgTemplates(templatesData);
    } catch (err: any) {
      logger.error('Erreur lors de la modification du template:', err);
      setError(err.response?.data?.detail || 'Erreur lors de la modification du template');
    } finally {
      setTogglingTemplate(null);
    }
  };

  // Réinitialiser le formulaire
  const resetForm = () => {
    setFormData({ name: '', description: '' });
    setLogoFile(null);
    setLogoPreview(null);
  };

  // Gérer le changement de logo
  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Le fichier doit être une image');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('L\'image est trop volumineuse (max 5MB)');
        return;
      }

      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Ouvrir le dialog d'édition
  const handleOpenEdit = (org: Organization) => {
    setSelectedOrganization(org);
    setFormData({
      name: org.name,
      description: org.description || '',
    });
    setLogoPreview(org.logo_url ? getOrganizationLogoUrl(org.logo_url) ?? null : null);
    setEditDialogOpen(true);
  };

  // Copier le code d'organisation
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setSuccess('Code copié dans le presse-papier');
  };

  return (
    <Box>
      {/* Messages */}
      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* En-tête */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Organisations ({organizations?.length || 0})
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Créer une organisation
        </Button>
      </Box>

      {/* Liste des organisations */}
      {loadingOrgs ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : organizations.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BusinessIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Aucune organisation
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Créez votre première organisation pour commencer
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Créer une organisation
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {organizations.map((org) => (
            <Grid item xs={12} sm={6} md={4} key={org.id}>
              <Card>
                {org.logo_url && (
                  <CardMedia
                    component="img"
                    height="140"
                    image={getOrganizationLogoUrl(org.logo_url)}
                    alt={org.name}
                    sx={{ objectFit: 'contain', p: 2, bgcolor: 'background.default' }}
                  />
                )}
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    {org.name}
                  </Typography>
                  {org.description && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {org.description}
                    </Typography>
                  )}
                  <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                    <Chip
                      icon={<PeopleIcon />}
                      label={`${org.member_count || 0} membres`}
                      size="small"
                    />
                    <Chip
                      icon={<AssignmentIcon />}
                      label={`${org.meeting_count || 0} réunions`}
                      size="small"
                    />
                  </Stack>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Code:
                    </Typography>
                    <Chip
                      label={org.organization_code}
                      size="small"
                      onClick={() => handleCopyCode(org.organization_code)}
                      onDelete={() => handleCopyCode(org.organization_code)}
                      deleteIcon={<CopyIcon fontSize="small" />}
                    />
                  </Box>
                </CardContent>
                <CardActions>
                  <IconButton size="small" onClick={() => handleOpenEdit(org)} title="Modifier">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleManageMembers(org)} title="Gérer les membres">
                    <PeopleIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleManageMeetings(org)} title="Voir les réunions">
                    <AssignmentIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleManageTemplates(org)} title="Gérer les templates">
                    <TemplateIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleRequestDeleteOrganization(org)}
                    title="Supprimer l'organisation"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Dialog de création */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Créer une organisation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nom de l'organisation"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <Box>
              <Button variant="outlined" component="label">
                Choisir un logo
                <input type="file" hidden accept="image/*" onChange={handleLogoChange} />
              </Button>
              {logoPreview && (
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <img src={logoPreview} alt="Aperçu" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleCreateOrganization}
            disabled={uploadingLogo || !formData.name.trim()}
          >
            {uploadingLogo ? <CircularProgress size={24} /> : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de suppression */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          if (!deletingOrganization) {
            setDeleteDialogOpen(false);
            setOrganizationToDelete(null);
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Supprimer l'organisation</DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer l'organisation{' '}
            <strong>{organizationToDelete?.name}</strong> ? Cette action est définitive et supprimera aussi les partages associés.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setOrganizationToDelete(null);
            }}
            disabled={deletingOrganization}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirmDeleteOrganization}
            color="error"
            variant="contained"
            startIcon={deletingOrganization ? <CircularProgress size={18} color="inherit" /> : <DeleteIcon />}
            disabled={deletingOrganization}
          >
            {deletingOrganization ? 'Suppression...' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog d'édition */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Modifier l'organisation</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nom de l'organisation"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              multiline
              rows={3}
            />
            <Box>
              <Button variant="outlined" component="label">
                Changer le logo
                <input type="file" hidden accept="image/*" onChange={handleLogoChange} />
              </Button>
              {logoPreview && (
                <Box sx={{ mt: 2, textAlign: 'center' }}>
                  <img src={logoPreview} alt="Aperçu" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Annuler</Button>
          <Button variant="contained" onClick={handleUpdateOrganization} disabled={uploadingLogo}>
            {uploadingLogo ? <CircularProgress size={24} /> : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog des membres */}
      <Dialog open={membersDialogOpen} onClose={() => setMembersDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Gestion des membres - {selectedOrganization?.name}
            </Typography>
            <Chip
              icon={<PeopleIcon />}
              label={`${members?.length || 0} membre${(members?.length || 0) > 1 ? 's' : ''}`}
              color="primary"
            />
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingDetails ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Section 1: Membres actuels */}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2, mt: 1 }}>
                Membres actuels ({members?.length || 0})
              </Typography>

              {(members || []).length === 0 ? (
                <Paper variant="outlined" sx={{ p: 3, mb: 3, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Aucun membre dans cette organisation
                  </Typography>
                </Paper>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Utilisateur</TableCell>
                        <TableCell>Rôle</TableCell>
                        <TableCell>Ajouté le</TableCell>
                        <TableCell align="center">Retirer</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(members || []).map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Avatar
                                src={member.user_profile_picture_url ? `${API_BASE_URL}${member.user_profile_picture_url}` : undefined}
                                sx={{ width: 32, height: 32 }}
                              >
                                {member.user_full_name?.charAt(0).toUpperCase() || member.user_email?.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={600}>
                                  {member.user_full_name || member.user_email}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {member.user_email}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <TextField
                              select
                              size="small"
                              value={member.role || 'member'}
                              onChange={(e) => handleChangeRole(member.user_id, e.target.value as 'admin' | 'member')}
                              disabled={updatingRole === member.user_id}
                              sx={{ minWidth: 130 }}
                              SelectProps={{ native: true }}
                            >
                              <option value="member">Membre</option>
                              <option value="admin">Administrateur</option>
                            </TextField>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(member.joined_at).toLocaleDateString('fr-FR')}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleToggleMember(member.user_id, true)}
                              disabled={togglingMember === member.user_id}
                            >
                              {togglingMember === member.user_id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <DeleteIcon fontSize="small" />
                              )}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {/* Section 2: Ajouter des membres */}
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
                Ajouter des membres
              </Typography>

              {/* Barre de recherche */}
              <TextField
                fullWidth
                placeholder="Rechercher un utilisateur par nom ou email..."
                value={searchMember}
                onChange={(e) => setSearchMember(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />

              {/* Liste des utilisateurs non-membres filtrés */}
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Utilisateur</TableCell>
                      <TableCell>Plan</TableCell>
                      <TableCell align="center">Ajouter</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      const filtered = (users || []).filter((user) => {
                        const isMember = (members || []).some((m) => m.user_id === user.id);
                        if (isMember) return false;
                        if (!searchMember) return true;
                        return (
                          user.full_name?.toLowerCase().includes(searchMember.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchMember.toLowerCase())
                        );
                      });
                      const toShow = filtered.slice(0, 500); // Limite d'affichage pour les perfs, la recherche affine
                      return toShow.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              <Avatar
                                src={user.profile_picture_url ? `${API_BASE_URL}${user.profile_picture_url}` : undefined}
                                sx={{ width: 28, height: 28 }}
                              >
                                {user.full_name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
                              </Avatar>
                              <Box>
                                <Typography variant="body2" fontWeight={500}>
                                  {user.full_name || user.email}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {user.email}
                                </Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={user.subscription_plan || 'beta_tester'}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleToggleMember(user.id, false)}
                              disabled={togglingMember === user.id}
                            >
                              {togglingMember === user.id ? (
                                <CircularProgress size={20} />
                              ) : (
                                <AddIcon fontSize="small" />
                              )}
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ));
                    })()}
                    {(() => {
                      const filtered = (users || []).filter((user) => {
                        const isMember = (members || []).some((m) => m.user_id === user.id);
                        if (isMember) return false;
                        if (!searchMember) return true;
                        return (
                          user.full_name?.toLowerCase().includes(searchMember.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchMember.toLowerCase())
                        );
                      });
                      return filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} align="center">
                          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                            {searchMember ? 'Aucun utilisateur trouvé' : 'Tous les utilisateurs sont déjà membres'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                    })()}
                  </TableBody>
                </Table>
              </TableContainer>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {users.length > 500
                  ? `${users.length} utilisateurs chargés. Utilisez la recherche pour trouver quelqu'un.`
                  : 'Utilisez la recherche pour trouver des utilisateurs spécifiques'}
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMembersDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog des réunions */}
      <Dialog open={meetingsDialogOpen} onClose={() => setMeetingsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Réunions partagées - {selectedOrganization?.name}
        </DialogTitle>
        <DialogContent>
          {loadingDetails ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <List>
              {(meetings || []).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                  Aucune réunion partagée
                </Typography>
              ) : (
                (meetings || []).map((meeting) => (
                  <ListItem key={meeting.id} divider>
                    <ListItemText
                      primary={meeting.meeting_title}
                      secondary={`Partagé par ${meeting.shared_by_name || 'Inconnu'} le ${new Date(
                        meeting.shared_at
                      ).toLocaleDateString()}`}
                    />
                    <Chip
                      label={`${Math.floor((meeting.meeting_duration_seconds || 0) / 60)} min`}
                      size="small"
                    />
                  </ListItem>
                ))
              )}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMeetingsDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog des templates */}
      <Dialog open={templatesDialogOpen} onClose={() => setTemplatesDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Gestion des templates - {selectedOrganization?.name}
            </Typography>
            <Badge badgeContent={`${orgTemplates?.length || 0}/${templates?.length || 0}`} color="primary">
              <TemplateIcon />
            </Badge>
          </Box>
        </DialogTitle>
        <DialogContent>
          {loadingDetails ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Barre de recherche */}
              <TextField
                fullWidth
                placeholder="Rechercher un template..."
                value={searchTemplate}
                onChange={(e) => setSearchTemplate(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />

              {/* Tableau des templates */}
              <TableContainer component={Paper} variant="outlined">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Template</TableCell>
                      <TableCell>Attribution</TableCell>
                      <TableCell align="center">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(templates || [])
                      .filter((template) => 
                        !searchTemplate ||
                        template.name?.toLowerCase().includes(searchTemplate.toLowerCase()) ||
                        template.description?.toLowerCase().includes(searchTemplate.toLowerCase())
                      )
                      .map((template) => {
                        const isAssigned = (orgTemplates || []).some((ot) => ot.template_id === template.id);
                        return (
                          <TableRow key={template.id}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                {template.logo_url && (
                                  <Avatar
                                    src={`${API_BASE_URL}${template.logo_url}`}
                                    variant="rounded"
                                    sx={{ width: 32, height: 32 }}
                                  />
                                )}
                                <Box>
                                  <Typography variant="body2" fontWeight={600}>
                                    {template.name}
                                  </Typography>
                                  {template.description && (
                                    <Typography variant="caption" color="text.secondary">
                                      {template.description}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>
                              {isAssigned ? (
                                <Chip icon={<CheckCircleIcon />} label="Assigné" size="small" color="success" />
                              ) : (
                                <Chip label="Non assigné" size="small" variant="outlined" />
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Switch
                                checked={isAssigned}
                                onChange={() => handleToggleTemplate(template.id, isAssigned)}
                                disabled={togglingTemplate === template.id}
                                color="primary"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplatesDialogOpen(false)}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AdminOrganizationsTab;

