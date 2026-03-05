/**
 * Composant pour l'onglet Dossiers dans Mes Réunions
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  Divider,
  Avatar,
  Radio,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Breadcrumbs,
} from '@mui/material';
import {
  FolderOpen as FolderIcon,
  Add as AddIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Share as ShareIcon,
  ArrowBack as ArrowBackIcon,
  Close as CloseIcon,
  Check as CheckIcon,
  ExpandMore as ExpandMoreIcon,
  RemoveCircleOutline as RemoveIcon,
  Person as PersonIcon,
  Star as StarIcon,
  Work as WorkIcon,
  Assignment as AssignmentIcon,
  PriorityHigh as PriorityHighIcon,
  Archive as ArchiveIcon,
  Favorite as FavoriteIcon,
  Article as ArticleIcon,
  PlaylistRemove as RemoveFolderIcon,
} from '@mui/icons-material';
import {
  Folder,
  FolderDetail,
  FolderRole,
  FolderShareInfo,
  createFolder,
  getFolderDetails,
  updateFolder,
  deleteFolder,
  addMeetingToFolder,
  removeMeetingFromFolder,
  shareFolder,
  getFolderShares,
  revokeFolderShare,
  removeFolderFromMySpace,
  FOLDER_COLORS,
  FOLDER_ICONS,
} from '../services/folderService';
import { useDataStore } from '../stores/dataStore';
import { logger } from '@/utils/logger';

// Props
interface FoldersTabProps {
  onOpenMeeting?: (meetingId: string) => void;
  meetings?: any[];
}

// Icon mapping
const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'star': return <StarIcon />;
    case 'work': return <WorkIcon />;
    case 'person': return <PersonIcon />;
    case 'assignment': return <AssignmentIcon />;
    case 'priority_high': return <PriorityHighIcon />;
    case 'archive': return <ArchiveIcon />;
    case 'favorite': return <FavoriteIcon />;
    default: return <FolderIcon />;
  }
};

const FoldersTab: React.FC<FoldersTabProps> = ({ onOpenMeeting, meetings = [] }) => {
  // ===== DATA STORE - Données globales avec cache SWR =====
  const storeFolders = useDataStore((state) => state.folders);
  const storeContacts = useDataStore((state) => state.contacts);
  const fetchFolders = useDataStore((state) => state.fetchFolders);
  const fetchContacts = useDataStore((state) => state.fetchContacts);
  const foldersStatus = useDataStore((state) => state.foldersMeta.status);
  const invalidateFolders = useDataStore((state) => state.invalidateFolders);

  // State
  const [selectedFolder, setSelectedFolder] = useState<FolderDetail | null>(null);
  const [subfolders, setSubfolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // searchQuery removed - no search bar on folders page
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [addMeetingDialogOpen, setAddMeetingDialogOpen] = useState(false);
  
  // Form states
  const [folderName, setFolderName] = useState('');
  const [folderDescription, setFolderDescription] = useState('');
  const [folderColor, setFolderColor] = useState('#3b82f6');
  const [folderIcon, setFolderIcon] = useState('folder');
  
  // Menu state
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuFolder, setMenuFolder] = useState<Folder | null>(null);
  
  // Share states
  const [shareRole, setShareRole] = useState<FolderRole>('reader');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [shareIdInput, setShareIdInput] = useState('');
  const [folderShares, setFolderShares] = useState<FolderShareInfo[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  
  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load folders depuis le store
  const loadFolders = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      logger.debug('🔄 Loading folders from store...');
      if (forceRefresh) {
        invalidateFolders();
      }
      await fetchFolders(forceRefresh);
    } catch (err) {
      logger.error('❌ Error loading folders:', err);
      setError('Erreur lors du chargement des dossiers');
    } finally {
      setLoading(false);
    }
  }, [fetchFolders, invalidateFolders]);

  // Charger les dossiers au montage
  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Mettre à jour le loading depuis le status du store
  useEffect(() => {
    setLoading(foldersStatus === 'loading' && storeFolders.length === 0);
  }, [foldersStatus, storeFolders.length]);

  // Load contacts when share dialog opens
  useEffect(() => {
    if (shareDialogOpen) {
      fetchContacts();
    }
  }, [shareDialogOpen, fetchContacts]);

  // Map rapide id -> dossier pour les breadcrumbs/parents
  const folderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    storeFolders.forEach(f => map.set(f.id, f));
    return map;
  }, [storeFolders]);

  // Filtrer pour n'afficher que les dossiers racine (sans parent) dans la vue principale
  // Un dossier racine est un dossier qui n'a pas de parent_id (null, undefined, ou chaîne vide)
  const filteredFolders = useMemo(() => {
    logger.debug('📁 Filtering folders...');
    logger.debug('📁 Total folders:', storeFolders.length);

    // Log tous les dossiers avec leur parent_id
    storeFolders.forEach(f => {
      logger.debug(`📁 Folder "${f.name}": parent_id = ${f.parent_id} (type: ${typeof f.parent_id}, null?: ${f.parent_id === null}, undefined?: ${f.parent_id === undefined})`);
    });

    const rootFolders = storeFolders.filter(f => {
      // Vérifier si le dossier a un parent
      const hasParent = f.parent_id !== null && f.parent_id !== undefined && f.parent_id !== '';
      const isRoot = !hasParent;
      if (!isRoot) {
        logger.debug(`📁 Folder "${f.name}" is a subfolder (parent_id: ${f.parent_id}), excluding from main view`);
      }
      return isRoot;
    });

    logger.debug('📁 Root folders (filtered):', rootFolders.length);
    const subfoldersFiltered = storeFolders.filter(f => f.parent_id);
    if (subfoldersFiltered.length > 0) {
      logger.debug('📁 Subfolders (should not appear in main view):', subfoldersFiltered.map(f => ({ id: f.id, name: f.name, parent_id: f.parent_id })));
    }
    return rootFolders;
  }, [storeFolders]);

  // Chemin hiérarchique pour afficher les breadcrumbs
  const breadcrumbPath = useMemo(() => {
    if (!selectedFolder) return [];
    const path: (Folder | FolderDetail)[] = [];
    let current: Folder | FolderDetail | undefined | null = selectedFolder;

    while (current) {
      path.unshift(current);
      const parentId = (current as Folder).parent_id;
      if (!parentId) break;
      const parent = folderMap.get(parentId);
      if (!parent) break;
      current = parent;
    }
    return path;
  }, [selectedFolder, folderMap]);

  // Handlers
  const handleOpenFolder = async (folder: Folder) => {
    try {
      const details = await getFolderDetails(folder.id);
      setSelectedFolder(details);
      // Charger les sous-dossiers depuis le store
      const allFolders = await fetchFolders();
      const subfoldersList = allFolders.filter(f => f.parent_id === folder.id);
      setSubfolders(subfoldersList);
    } catch (err) {
      logger.error('Error loading folder details:', err);
      setError('Erreur lors du chargement du dossier');
    }
  };

  const handleCloseFolder = async () => {
    if (!selectedFolder) return;

    // Si le dossier a un parent, ouvrir le dossier parent
    if (selectedFolder.parent_id) {
      try {
        logger.debug('📁 Remontant au dossier parent:', selectedFolder.parent_id);
        const parentDetails = await getFolderDetails(selectedFolder.parent_id);
        setSelectedFolder(parentDetails);
        // Charger les sous-dossiers du parent depuis le store
        const allFolders = await fetchFolders();
        const subfoldersList = allFolders.filter(f => f.parent_id === parentDetails.id);
        setSubfolders(subfoldersList);
      } catch (err) {
        logger.error('Error loading parent folder:', err);
        // En cas d'erreur, revenir à la vue principale
        setSelectedFolder(null);
        setSubfolders([]);
      }
    } else {
      // Si pas de parent, revenir à la vue principale
      setSelectedFolder(null);
      setSubfolders([]);
    }
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, folder: Folder) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuFolder(folder);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuFolder(null);
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    
    try {
      setIsSubmitting(true);
      const parentId = selectedFolder?.id || null;
      logger.debug('📁 Creating folder with parent_id:', parentId, selectedFolder ? `(inside folder: ${selectedFolder.name})` : '(root folder)');
      
      const newFolder = await createFolder({
        name: folderName.trim(),
        description: folderDescription.trim() || undefined,
        color: folderColor,
        icon: folderIcon,
        parent_id: parentId, // Si on est dans un dossier, créer un sous-dossier
      });
      
      logger.debug('📁 Created folder:', newFolder);
      logger.debug('📁 New folder parent_id:', newFolder?.parent_id);
      
      setCreateDialogOpen(false);
      resetForm();
      
      // Recharger tous les dossiers
      const allFolders = await fetchFolders(true);

      // Si on a créé un sous-dossier, recharger la liste des sous-dossiers
      if (selectedFolder && newFolder) {
        const subfoldersList = allFolders.filter(f => f.parent_id === selectedFolder.id);
        logger.debug('📁 Subfolders for', selectedFolder.name, ':', subfoldersList.length);
        setSubfolders(subfoldersList);
      }
      
      setSuccessMessage(selectedFolder ? 'Sous-dossier créé avec succès' : 'Dossier créé avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error('Error creating folder:', err);
      setError('Erreur lors de la création du dossier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditFolder = async () => {
    if (!menuFolder || !folderName.trim()) return;
    
    try {
      setIsSubmitting(true);
      await updateFolder(menuFolder.id, {
        name: folderName.trim(),
        description: folderDescription.trim() || undefined,
        color: folderColor,
        icon: folderIcon,
      });
      setEditDialogOpen(false);
      resetForm();
      handleMenuClose();
      await loadFolders(true);
      if (selectedFolder?.id === menuFolder.id) {
        const details = await getFolderDetails(menuFolder.id);
        setSelectedFolder(details);
      }
      setSuccessMessage('Dossier modifié avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error('Error updating folder:', err);
      setError('Erreur lors de la modification du dossier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFolder = async () => {
    if (!menuFolder) return;
    
    try {
      setIsSubmitting(true);
      await deleteFolder(menuFolder.id);
      setDeleteDialogOpen(false);
      handleMenuClose();
      // Recharger les dossiers après suppression
      const allFolders = await fetchFolders(true);

      if (selectedFolder?.id === menuFolder.id) {
        setSelectedFolder(null);
        setSubfolders([]);
      } else if (selectedFolder && menuFolder.parent_id === selectedFolder.id) {
        // Si on supprime un sous-dossier, recharger la liste
        const subfoldersList = allFolders.filter(f => f.parent_id === selectedFolder.id);
        setSubfolders(subfoldersList);
      }
      setSuccessMessage('Dossier supprimé avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error('Error deleting folder:', err);
      setError('Erreur lors de la suppression du dossier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveFromMySpace = async () => {
    if (!menuFolder) return;
    
    try {
      setIsSubmitting(true);
      await removeFolderFromMySpace(menuFolder.id);
      handleMenuClose();
      if (selectedFolder?.id === menuFolder.id) {
        setSelectedFolder(null);
      }
      await loadFolders(true);
      setSuccessMessage('Dossier retiré de votre espace');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error('Error removing folder:', err);
      setError('Erreur lors du retrait du dossier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareFolder = async () => {
    if (!menuFolder) return;
    
    const targetShareId = selectedContactId 
      ? storeContacts.find(c => c.contact_user_id === selectedContactId)?.contact_share_id
      : shareIdInput.trim();
    
    if (!targetShareId) {
      setError('Veuillez sélectionner un contact ou entrer un ID de partage');
      return;
    }
    
    try {
      setIsSubmitting(true);
      await shareFolder(menuFolder.id, {
        share_id: targetShareId,
        role: shareRole,
        auto_share_new_meetings: true,
      });
      setShareDialogOpen(false);
      resetShareForm();
      handleMenuClose();
      setSuccessMessage('Dossier partagé avec succès');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      logger.error('Error sharing folder:', err);
      setError('Erreur lors du partage du dossier');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMeetingFromFolder = async (meetingId: string) => {
    if (!selectedFolder) return;
    
    try {
      await removeMeetingFromFolder(selectedFolder.id, meetingId);
      const details = await getFolderDetails(selectedFolder.id);
      setSelectedFolder(details);
      await loadFolders(true);
    } catch (err) {
      logger.error('Error removing meeting from folder:', err);
      setError('Erreur lors du retrait de la réunion');
    }
  };

  const handleAddMeetingToFolder = async (meetingId: string) => {
    if (!selectedFolder) return;
    
    try {
      await addMeetingToFolder(selectedFolder.id, meetingId);
      const details = await getFolderDetails(selectedFolder.id);
      setSelectedFolder(details);
      setAddMeetingDialogOpen(false);
      await loadFolders(true);
    } catch (err) {
      logger.error('Error adding meeting to folder:', err);
      setError('Erreur lors de l\'ajout de la réunion');
    }
  };

  const openEditDialog = () => {
    if (!menuFolder) return;
    setFolderName(menuFolder.name);
    setFolderDescription(menuFolder.description || '');
    setFolderColor(menuFolder.color);
    setFolderIcon(menuFolder.icon);
    setEditDialogOpen(true);
  };

  const resetForm = () => {
    setFolderName('');
    setFolderDescription('');
    setFolderColor('#3b82f6');
    setFolderIcon('folder');
  };

  const resetShareForm = () => {
    setShareRole('reader');
    setSelectedContactId(null);
    setShareIdInput('');
    setFolderShares([]);
  };

  const openShareDialog = async () => {
    if (!menuFolder) return;
    logger.debug('📤 Opening share dialog for folder:', menuFolder.id);
    setShareDialogOpen(true);
    setLoadingShares(true);
    try {
      const shares = await getFolderShares(menuFolder.id);
      logger.debug('📤 Folder shares loaded:', shares);
      setFolderShares(shares);
    } catch (err) {
      logger.error('❌ Error loading folder shares:', err);
    } finally {
      setLoadingShares(false);
    }
  };

  const handleRevokeShare = async (sharedWithUserId: string) => {
    if (!menuFolder) return;
    try {
      setIsSubmitting(true);
      await revokeFolderShare(menuFolder.id, sharedWithUserId);
      // Refresh shares
      const shares = await getFolderShares(menuFolder.id);
      setFolderShares(shares);
    } catch (err) {
      logger.error('Error revoking folder share:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Available meetings (not already in folder)
  const availableMeetings = useMemo(() => {
    if (!selectedFolder) return meetings;
    const folderMeetingIds = new Set(selectedFolder.meetings.map(m => m.meeting_id));
    return meetings.filter(m => !folderMeetingIds.has(m.id));
  }, [meetings, selectedFolder]);

  // Can edit folder
  const canEditFolder = (folder: Folder) => {
    if (!folder.is_shared) return true;
    return folder.my_permissions?.can_rename === true;
  };

  const canDeleteFolder = (folder: Folder) => {
    return !folder.is_shared; // Only owner can delete
  };

  const canShareFolder = (folder: Folder) => {
    if (!folder.is_shared) return true;
    return folder.my_permissions?.can_share === true;
  };

  const canAddMeetings = (folder: Folder) => {
    if (!folder.is_shared) return true;
    return folder.my_permissions?.can_add_meetings === true;
  };

  const canRemoveMeetings = (folder: Folder) => {
    if (!folder.is_shared) return true;
    return folder.my_permissions?.can_remove_meetings === true;
  };

  // Render folder view
  if (selectedFolder) {
    return (
      <Box>
        {/* Header compact */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5 }}>
          <IconButton 
            onClick={handleCloseFolder} 
            size="small"
            sx={{ color: 'text.secondary' }}
          >
            <ArrowBackIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>
                {selectedFolder.name}
              </Typography>
              {selectedFolder.is_shared && (
                <Chip
                  size="small"
                  label={`Partagé par ${selectedFolder.shared_by}`}
                  sx={{ 
                    height: 20, 
                    fontSize: '0.7rem',
                    bgcolor: 'rgba(156, 39, 176, 0.1)', 
                    color: '#9c27b0' 
                  }}
                />
              )}
            </Box>
            {selectedFolder.description && (
              <Typography variant="caption" color="text.secondary" noWrap>
                {selectedFolder.description}
              </Typography>
            )}
            {breadcrumbPath.length > 1 && (
              <Breadcrumbs separator="›" sx={{ mt: 0.5, fontSize: '0.85rem' }}>
                {breadcrumbPath.map((item, idx) => {
                  const isLast = idx === breadcrumbPath.length - 1;
                  return (
                    <Box
                      key={item.id}
                      component="span"
                      onClick={() => {
                        if (!isLast) {
                          handleOpenFolder(item as Folder);
                        }
                      }}
                      sx={{
                        cursor: isLast ? 'default' : 'pointer',
                        color: isLast ? 'text.primary' : 'primary.main',
                        fontWeight: isLast ? 700 : 500,
                        '&:hover': !isLast ? { textDecoration: 'underline' } : undefined,
                      }}
                    >
                      {item.name}
                    </Box>
                  );
                })}
              </Breadcrumbs>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!selectedFolder.is_shared && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<FolderIcon sx={{ fontSize: 16 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  logger.debug('📁 Opening create folder dialog from folder view');
                  setCreateDialogOpen(true);
                }}
                sx={{ 
                  borderRadius: 1.5, 
                  fontSize: '0.8rem',
                  py: 0.5,
                  px: 1.5,
                }}
              >
                Nouveau dossier
              </Button>
            )}
            {canAddMeetings(selectedFolder) && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                onClick={() => setAddMeetingDialogOpen(true)}
                sx={{ 
                  borderRadius: 1.5, 
                  fontSize: '0.8rem',
                  py: 0.5,
                  px: 1.5,
                }}
              >
                Ajouter
              </Button>
            )}
          </Box>
        </Box>

        {/* Sous-dossiers - Toujours afficher la section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
            Dossiers {subfolders.length > 0 && `(${subfolders.length})`}
          </Typography>
          {subfolders.length > 0 ? (
            <Grid container spacing={2}>
              {subfolders.map((subfolder) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={subfolder.id}>
                  <Box
                    onClick={() => handleOpenFolder(subfolder)}
                    sx={{
                      position: 'relative',
                      cursor: 'pointer',
                      pt: 1.5,
                    }}
                  >
                    {/* Onglet du dossier */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 12,
                        width: 50,
                        height: 12,
                        bgcolor: subfolder.is_shared ? 'rgba(156, 39, 176, 0.15)' : `${subfolder.color}15`,
                        borderRadius: '6px 6px 0 0',
                        border: subfolder.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
                        borderBottom: 'none',
                      }}
                    />
                    {/* Corps du dossier */}
                    <Paper
                      elevation={0}
                      sx={{
                        p: 2,
                        borderRadius: '4px 12px 12px 12px',
                        transition: 'background-color 0.2s ease',
                        border: subfolder.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
                        '&:hover': {
                          bgcolor: 'rgba(59, 130, 246, 0.08)',
                        },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: 1.5,
                            bgcolor: `${subfolder.color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: subfolder.color,
                          }}
                        >
                          {getIconComponent(subfolder.icon)}
                        </Box>
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMenuOpen(e, subfolder);
                          }}
                          sx={{ color: 'text.secondary' }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1.5 }} noWrap>
                        {subfolder.name}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {subfolder.meeting_count} réunion{subfolder.meeting_count !== 1 ? 's' : ''}
                        </Typography>
                        {subfolder.is_shared && (
                          <Chip
                            size="small"
                            label={subfolder.my_role === 'reader' ? 'Lecteur' : subfolder.my_role === 'contributor' ? 'Contributeur' : 'Admin'}
                            sx={{
                              height: 20,
                              fontSize: '0.65rem',
                              bgcolor: 'rgba(156, 39, 176, 0.1)',
                              color: '#9c27b0',
                            }}
                          />
                        )}
                      </Box>
                    </Paper>
                  </Box>
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper
              sx={{
                p: 3,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                bgcolor: 'rgba(0, 0, 0, 0.02)',
              }}
            >
              <FolderIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Aucun sous-dossier
              </Typography>
            </Paper>
          )}
        </Box>

        {/* Meetings grid */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
          {selectedFolder.meetings.length} réunion{selectedFolder.meetings.length !== 1 ? 's' : ''}
        </Typography>

        {selectedFolder.meetings.length === 0 ? (
          <Paper
            sx={{
              p: 4,
              textAlign: 'center',
              borderRadius: 2,
              border: '1px dashed',
              borderColor: 'divider',
            }}
          >
            <ArticleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
            <Typography color="text.secondary">
              Aucune réunion dans ce dossier
            </Typography>
            {canAddMeetings(selectedFolder) && (
              <Button
                variant="text"
                startIcon={<AddIcon />}
                onClick={() => setAddMeetingDialogOpen(true)}
                sx={{ mt: 2 }}
              >
                Ajouter une réunion
              </Button>
            )}
          </Paper>
        ) : (
          <Grid container spacing={2}>
            {selectedFolder.meetings.map((meeting) => (
              <Grid item xs={12} sm={6} key={meeting.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: { xs: 2, sm: 3 },
                    borderRadius: { xs: '12px', sm: '16px' },
                    cursor: 'pointer',
                    bgcolor: 'white',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                  onClick={() => {
                    logger.debug('📂 Clicked on meeting in folder:', meeting.meeting_id);
                    onOpenMeeting?.(meeting.meeting_id);
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography 
                        variant="subtitle1" 
                        fontWeight={600} 
                        noWrap
                        sx={{ mb: 1 }}
                      >
                        {meeting.title || 'Sans titre'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {meeting.date ? new Date(meeting.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </Typography>
                        {meeting.duration_seconds && meeting.duration_seconds > 0 && (
                          <Typography variant="body2" color="text.secondary">
                            {Math.floor(meeting.duration_seconds / 60)} min
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    {canRemoveMeetings(selectedFolder) && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveMeetingFromFolder(meeting.meeting_id);
                        }}
                        sx={{ color: 'text.secondary', ml: 1 }}
                      >
                        <RemoveIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    )}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Add meeting dialog */}
        <Dialog
          open={addMeetingDialogOpen}
          onClose={() => setAddMeetingDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Ajouter une réunion
          </DialogTitle>
          <DialogContent>
            {availableMeetings.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                Toutes vos réunions sont déjà dans ce dossier
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {availableMeetings.map((meeting) => (
                  <Paper
                    key={meeting.id}
                    sx={{
                      p: 2,
                      mb: 1,
                      borderRadius: 2,
                      cursor: 'pointer',
                      transition: 'background-color 0.2s ease',
                      '&:hover': {
                        bgcolor: 'rgba(59, 130, 246, 0.08)',
                      },
                    }}
                    onClick={() => handleAddMeetingToFolder(meeting.id)}
                  >
                    <Typography variant="subtitle1" fontWeight={500}>
                      {meeting.name || meeting.title || 'Sans titre'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {meeting.created_at ? new Date(meeting.created_at).toLocaleDateString('fr-FR') : ''}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAddMeetingDialogOpen(false)}>
              Fermer
            </Button>
          </DialogActions>
        </Dialog>

        {/* Create folder dialog - doit être rendu même dans la vue du dossier */}
        <Dialog
          open={createDialogOpen}
          onClose={() => { setCreateDialogOpen(false); resetForm(); }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {selectedFolder ? 'Nouveau sous-dossier' : 'Nouveau dossier'}
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              label="Nom du dossier"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              fullWidth
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              label="Description (optionnel)"
              value={folderDescription}
              onChange={(e) => setFolderDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              sx={{ mb: 3 }}
            />
            
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Couleur
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
              {FOLDER_COLORS.map((color) => (
                <Box
                  key={color.value}
                  onClick={() => setFolderColor(color.value)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    bgcolor: color.value,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: folderColor === color.value ? '2px solid #1a1a1a' : '2px solid transparent',
                    transition: 'transform 0.1s',
                    '&:hover': { transform: 'scale(1.1)' },
                  }}
                >
                  {folderColor === color.value && (
                    <CheckIcon sx={{ color: 'white', fontSize: 18 }} />
                  )}
                </Box>
              ))}
            </Box>
            
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Icône
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {FOLDER_ICONS.map((icon) => (
                <Box
                  key={icon.value}
                  onClick={() => setFolderIcon(icon.value)}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    bgcolor: folderIcon === icon.value ? `${folderColor}20` : 'transparent',
                    color: folderIcon === icon.value ? folderColor : 'text.secondary',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid',
                    borderColor: folderIcon === icon.value ? folderColor : 'divider',
                    transition: 'all 0.1s',
                    '&:hover': { borderColor: folderColor },
                  }}
                >
                  {getIconComponent(icon.value)}
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleCreateFolder}
              disabled={!folderName.trim() || isSubmitting}
              sx={{ borderRadius: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} /> : 'Créer'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Context menu for subfolders */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={handleMenuClose}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {menuFolder && canEditFolder(menuFolder) && (
            <MenuItem onClick={openEditDialog}>
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Modifier</ListItemText>
            </MenuItem>
          )}
          {menuFolder && canShareFolder(menuFolder) && (
            <MenuItem onClick={openShareDialog}>
              <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Partager</ListItemText>
            </MenuItem>
          )}
          {menuFolder && menuFolder.is_shared && (
            <MenuItem onClick={handleRemoveFromMySpace}>
              <ListItemIcon><RemoveFolderIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Retirer de mon espace</ListItemText>
            </MenuItem>
          )}
          {menuFolder && canDeleteFolder(menuFolder) && (
            <MenuItem onClick={() => setDeleteDialogOpen(true)} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
              <ListItemText>Supprimer</ListItemText>
            </MenuItem>
          )}
        </Menu>

        {/* Edit folder dialog for subfolders */}
        <Dialog
          open={editDialogOpen}
          onClose={() => { setEditDialogOpen(false); resetForm(); handleMenuClose(); }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Modifier le dossier
          </DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              label="Nom du dossier"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              fullWidth
              sx={{ mt: 2, mb: 2 }}
            />
            <TextField
              label="Description (optionnel)"
              value={folderDescription}
              onChange={(e) => setFolderDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
              sx={{ mb: 3 }}
            />

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Couleur
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
              {FOLDER_COLORS.map((color) => (
                <Box
                  key={color.value}
                  onClick={() => setFolderColor(color.value)}
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: 1,
                    bgcolor: color.value,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: folderColor === color.value ? '2px solid #1a1a1a' : '2px solid transparent',
                    transition: 'transform 0.1s',
                    '&:hover': { transform: 'scale(1.1)' },
                  }}
                >
                  {folderColor === color.value && (
                    <CheckIcon sx={{ color: 'white', fontSize: 18 }} />
                  )}
                </Box>
              ))}
            </Box>

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Icône
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {FOLDER_ICONS.map((icon) => (
                <Box
                  key={icon.value}
                  onClick={() => setFolderIcon(icon.value)}
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    bgcolor: folderIcon === icon.value ? `${folderColor}20` : 'transparent',
                    color: folderIcon === icon.value ? folderColor : 'text.secondary',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid',
                    borderColor: folderIcon === icon.value ? folderColor : 'divider',
                    transition: 'all 0.1s',
                    '&:hover': { borderColor: folderColor },
                  }}
                >
                  {getIconComponent(icon.value)}
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setEditDialogOpen(false); resetForm(); handleMenuClose(); }}>
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleEditFolder}
              disabled={!folderName.trim() || isSubmitting}
              sx={{ borderRadius: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} /> : 'Enregistrer'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete confirmation dialog for subfolders */}
        <Dialog
          open={deleteDialogOpen}
          onClose={() => { setDeleteDialogOpen(false); handleMenuClose(); }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>
            Supprimer le dossier ?
          </DialogTitle>
          <DialogContent>
            <Typography>
              Êtes-vous sûr de vouloir supprimer le dossier "{menuFolder?.name}" ?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Les réunions ne seront pas supprimées, elles seront simplement retirées du dossier.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setDeleteDialogOpen(false); handleMenuClose(); }}>
              Annuler
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={handleDeleteFolder}
              disabled={isSubmitting}
              sx={{ borderRadius: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} /> : 'Supprimer'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Share dialog for subfolders */}
        <Dialog
          open={shareDialogOpen}
          onClose={() => { setShareDialogOpen(false); resetShareForm(); handleMenuClose(); }}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Partager le dossier — {menuFolder?.name}
          </DialogTitle>
          <DialogContent>
            {/* Existing shares */}
            {folderShares.length > 0 && (
              <>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
                  Partagé avec
                </Typography>
                <Box sx={{ maxHeight: 150, overflowY: 'auto', mb: 2 }}>
                  {loadingShares ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    folderShares.map((share) => (
                      <Box
                        key={share.shared_with_user_id}
                        sx={{
                          p: 1.5,
                          mb: 1,
                          borderRadius: 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          bgcolor: 'rgba(156, 39, 176, 0.05)',
                          border: '1px solid rgba(156, 39, 176, 0.2)',
                        }}
                      >
                        <Avatar src={share.shared_with_profile_picture || undefined} sx={{ width: 32, height: 32 }}>
                          {share.shared_with_name?.charAt(0) || 'U'}
                        </Avatar>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            {share.shared_with_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {share.role === 'reader' ? 'Lecteur' : share.role === 'contributor' ? 'Contributeur' : 'Admin'}
                          </Typography>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => handleRevokeShare(share.shared_with_user_id)}
                          disabled={isSubmitting}
                          sx={{ color: 'error.main' }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))
                  )}
                </Box>
                <Divider sx={{ my: 2 }} />
              </>
            )}

            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: folderShares.length > 0 ? 0 : 2, mb: 1 }}>
              Nouveau partage
            </Typography>
            <Box sx={{ maxHeight: 150, overflowY: 'auto', mb: 2 }}>
              {storeContacts.filter(c => !folderShares.find(s => s.shared_with_user_id === c.contact_user_id)).map((contact) => (
                <Box
                  key={contact.contact_user_id}
                  onClick={() => setSelectedContactId(contact.contact_user_id)}
                  sx={{
                    p: 1.5,
                    mb: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    bgcolor: selectedContactId === contact.contact_user_id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: selectedContactId === contact.contact_user_id ? '#3b82f6' : 'divider',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(59, 130, 246, 0.05)',
                    },
                  }}
                >
                  <Avatar src={contact.contact_profile_picture || undefined} sx={{ width: 32, height: 32 }}>
                    {contact.contact_name?.charAt(0) || 'U'}
                  </Avatar>
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {contact.contact_name}
                  </Typography>
                  {selectedContactId === contact.contact_user_id && (
                    <CheckIcon sx={{ color: '#3b82f6' }} />
                  )}
                </Box>
              ))}
            </Box>

            <Accordion elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 2 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2" color="text.secondary">
                  Ajouter par ID de partage
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <TextField
                  label="ID de partage (6 caractères)"
                  value={shareIdInput}
                  onChange={(e) => setShareIdInput(e.target.value.toUpperCase())}
                  inputProps={{ maxLength: 6 }}
                  fullWidth
                  size="small"
                />
              </AccordionDetails>
            </Accordion>

            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Niveau d'accès
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[
                { value: 'reader', label: 'Lecteur', desc: 'Peut voir les réunions du dossier' },
                { value: 'contributor', label: 'Contributeur', desc: 'Peut ajouter et retirer des réunions' },
                { value: 'admin', label: 'Administrateur', desc: 'Peut modifier et partager le dossier' },
              ].map((role) => (
                <Box
                  key={role.value}
                  onClick={() => setShareRole(role.value as FolderRole)}
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    bgcolor: shareRole === role.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                    border: '1px solid',
                    borderColor: shareRole === role.value ? '#3b82f6' : 'divider',
                    transition: 'background-color 0.2s ease',
                    '&:hover': {
                      bgcolor: 'rgba(59, 130, 246, 0.05)',
                    },
                  }}
                >
                  <Radio
                    checked={shareRole === role.value}
                    sx={{ p: 0 }}
                  />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      {role.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {role.desc}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            <Button onClick={() => { setShareDialogOpen(false); resetShareForm(); handleMenuClose(); }}>
              Annuler
            </Button>
            <Button
              variant="contained"
              onClick={handleShareFolder}
              disabled={(!selectedContactId && !shareIdInput.trim()) || isSubmitting}
              sx={{ borderRadius: 2 }}
            >
              {isSubmitting ? <CircularProgress size={20} /> : 'Partager'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // Render folders list
  return (
    <Box>
      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Empty state */}
      {!loading && storeFolders.length === 0 && (
        <Paper
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px dashed',
            borderColor: 'divider',
          }}
        >
          <FolderIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Aucun dossier
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Créez des dossiers pour organiser vos réunions
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ borderRadius: 2 }}
          >
            Créer un dossier
          </Button>
        </Paper>
      )}

      {/* Folders grid with + button inline */}
      {!loading && filteredFolders.length > 0 && (
        <Grid container spacing={2}>
          {/* + button as first grid item */}
          <Grid item xs={12} sm={6} md={4} lg={3}>
            <Box
              onClick={() => setCreateDialogOpen(true)}
              sx={{
                position: 'relative',
                cursor: 'pointer',
                pt: 1.5, // Space for the tab
              }}
            >
                {/* Folder tab shape */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 12,
                    width: 50,
                    height: 12,
                    bgcolor: 'rgba(59, 130, 246, 0.08)',
                    borderRadius: '6px 6px 0 0',
                    border: '2px dashed',
                    borderBottom: 'none',
                    borderColor: 'divider',
                  }}
                />
                {/* Folder body - same structure as folder cards */}
                <Box
                  sx={{
                    p: 2,
                    borderRadius: '4px 12px 12px 12px',
                    border: '2px dashed',
                    borderColor: 'divider',
                    bgcolor: 'rgba(59, 130, 246, 0.04)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      borderColor: '#3b82f6',
                      bgcolor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                >
                  {/* Same layout as folder cards */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1.5,
                        bgcolor: 'rgba(59, 130, 246, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#3b82f6',
                      }}
                    >
                      <AddIcon sx={{ fontSize: 20 }} />
                    </Box>
                    {/* Placeholder for same height as folder cards with menu button */}
                    <Box sx={{ width: 28, height: 28 }} />
                  </Box>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1.5 }} color="text.secondary">
                    Nouveau
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="text.disabled">
                      Créer un dossier
                    </Typography>
                  </Box>
                </Box>
            </Box>
          </Grid>
          
          {filteredFolders.map((folder) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={folder.id}>
              <Box
                onClick={() => handleOpenFolder(folder)}
                sx={{
                  position: 'relative',
                  cursor: 'pointer',
                  pt: 1.5, // Space for the tab
                }}
              >
                {/* Folder tab shape */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 12,
                    width: 50,
                    height: 12,
                    bgcolor: folder.is_shared ? 'rgba(156, 39, 176, 0.15)' : `${folder.color}15`,
                    borderRadius: '6px 6px 0 0',
                    border: folder.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
                    borderBottom: 'none',
                  }}
                />
                {/* Folder body */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2,
                    borderRadius: '4px 12px 12px 12px',
                    transition: 'background-color 0.2s ease',
                    border: folder.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
                    '&:hover': {
                      bgcolor: 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1.5,
                        bgcolor: `${folder.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: folder.color,
                      }}
                    >
                      {getIconComponent(folder.icon)}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMenuOpen(e, folder);
                      }}
                      sx={{ color: 'text.secondary' }}
                    >
                      <MoreVertIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1.5 }} noWrap>
                    {folder.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      {folder.meeting_count} réunion{folder.meeting_count !== 1 ? 's' : ''}
                    </Typography>
                    {folder.is_shared && (
                      <Chip
                        size="small"
                        label={folder.my_role === 'reader' ? 'Lecteur' : folder.my_role === 'contributor' ? 'Contributeur' : 'Admin'}
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: 'rgba(156, 39, 176, 0.1)',
                          color: '#9c27b0',
                        }}
                      />
                    )}
                  </Box>
                </Paper>
              </Box>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {menuFolder && canEditFolder(menuFolder) && (
          <MenuItem onClick={openEditDialog}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Modifier</ListItemText>
          </MenuItem>
        )}
        {menuFolder && canShareFolder(menuFolder) && (
          <MenuItem onClick={openShareDialog}>
            <ListItemIcon><ShareIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Partager</ListItemText>
          </MenuItem>
        )}
        {menuFolder && menuFolder.is_shared && (
          <MenuItem onClick={handleRemoveFromMySpace}>
            <ListItemIcon><RemoveFolderIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Retirer de mon espace</ListItemText>
          </MenuItem>
        )}
        {menuFolder && canDeleteFolder(menuFolder) && (
          <MenuItem onClick={() => setDeleteDialogOpen(true)} sx={{ color: 'error.main' }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Supprimer</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Create folder dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => { setCreateDialogOpen(false); resetForm(); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Nouveau dossier
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Nom du dossier"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            fullWidth
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            label="Description (optionnel)"
            value={folderDescription}
            onChange={(e) => setFolderDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            sx={{ mb: 3 }}
          />
          
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Couleur
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            {FOLDER_COLORS.map((color) => (
              <Box
                key={color.value}
                onClick={() => setFolderColor(color.value)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  bgcolor: color.value,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: folderColor === color.value ? '2px solid #1a1a1a' : '2px solid transparent',
                  transition: 'transform 0.1s',
                  '&:hover': { transform: 'scale(1.1)' },
                }}
              >
                {folderColor === color.value && (
                  <CheckIcon sx={{ color: 'white', fontSize: 18 }} />
                )}
              </Box>
            ))}
          </Box>
          
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Icône
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {FOLDER_ICONS.map((icon) => (
              <Box
                key={icon.value}
                onClick={() => setFolderIcon(icon.value)}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  bgcolor: folderIcon === icon.value ? `${folderColor}20` : 'transparent',
                  color: folderIcon === icon.value ? folderColor : 'text.secondary',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid',
                  borderColor: folderIcon === icon.value ? folderColor : 'divider',
                  transition: 'all 0.1s',
                  '&:hover': { borderColor: folderColor },
                }}
              >
                {getIconComponent(icon.value)}
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => { setCreateDialogOpen(false); resetForm(); }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateFolder}
            disabled={!folderName.trim() || isSubmitting}
            sx={{ borderRadius: 2 }}
          >
            {isSubmitting ? <CircularProgress size={20} /> : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit folder dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); resetForm(); handleMenuClose(); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Modifier le dossier
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Nom du dossier"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            fullWidth
            sx={{ mt: 2, mb: 2 }}
          />
          <TextField
            label="Description (optionnel)"
            value={folderDescription}
            onChange={(e) => setFolderDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
            sx={{ mb: 3 }}
          />
          
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Couleur
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
            {FOLDER_COLORS.map((color) => (
              <Box
                key={color.value}
                onClick={() => setFolderColor(color.value)}
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: 1,
                  bgcolor: color.value,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: folderColor === color.value ? '2px solid #1a1a1a' : '2px solid transparent',
                  transition: 'transform 0.1s',
                  '&:hover': { transform: 'scale(1.1)' },
                }}
              >
                {folderColor === color.value && (
                  <CheckIcon sx={{ color: 'white', fontSize: 18 }} />
                )}
              </Box>
            ))}
          </Box>
          
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Icône
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {FOLDER_ICONS.map((icon) => (
              <Box
                key={icon.value}
                onClick={() => setFolderIcon(icon.value)}
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  bgcolor: folderIcon === icon.value ? `${folderColor}20` : 'transparent',
                  color: folderIcon === icon.value ? folderColor : 'text.secondary',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid',
                  borderColor: folderIcon === icon.value ? folderColor : 'divider',
                  transition: 'all 0.1s',
                  '&:hover': { borderColor: folderColor },
                }}
              >
                {getIconComponent(icon.value)}
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => { setEditDialogOpen(false); resetForm(); handleMenuClose(); }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={handleEditFolder}
            disabled={!folderName.trim() || isSubmitting}
            sx={{ borderRadius: 2 }}
          >
            {isSubmitting ? <CircularProgress size={20} /> : 'Enregistrer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); handleMenuClose(); }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          Supprimer le dossier ?
        </DialogTitle>
        <DialogContent>
          <Typography>
            Êtes-vous sûr de vouloir supprimer le dossier "{menuFolder?.name}" ?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Les réunions ne seront pas supprimées, elles seront simplement retirées du dossier.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => { setDeleteDialogOpen(false); handleMenuClose(); }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteFolder}
            disabled={isSubmitting}
            sx={{ borderRadius: 2 }}
          >
            {isSubmitting ? <CircularProgress size={20} /> : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Share dialog */}
      <Dialog
        open={shareDialogOpen}
        onClose={() => { setShareDialogOpen(false); resetShareForm(); handleMenuClose(); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Partager le dossier — {menuFolder?.name}
        </DialogTitle>
        <DialogContent>
          {/* Existing shares */}
          {folderShares.length > 0 && (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
                Partagé avec
              </Typography>
              <Box sx={{ maxHeight: 150, overflowY: 'auto', mb: 2 }}>
                {loadingShares ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  folderShares.map((share) => (
                    <Box
                      key={share.shared_with_user_id}
                      sx={{
                        p: 1.5,
                        mb: 1,
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        bgcolor: 'rgba(156, 39, 176, 0.05)',
                        border: '1px solid rgba(156, 39, 176, 0.2)',
                      }}
                    >
                      <Avatar src={share.shared_with_profile_picture || undefined} sx={{ width: 32, height: 32 }}>
                        {share.shared_with_name?.charAt(0) || 'U'}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {share.shared_with_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {share.role === 'reader' ? 'Lecteur' : share.role === 'contributor' ? 'Contributeur' : 'Admin'}
                        </Typography>
                      </Box>
                      <IconButton 
                        size="small" 
                        onClick={() => handleRevokeShare(share.shared_with_user_id)}
                        disabled={isSubmitting}
                        sx={{ color: 'error.main' }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))
                )}
              </Box>
              <Divider sx={{ my: 2 }} />
            </>
          )}

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: folderShares.length > 0 ? 0 : 2, mb: 1 }}>
            Nouveau partage
          </Typography>
          <Box sx={{ maxHeight: 150, overflowY: 'auto', mb: 2 }}>
            {storeContacts.filter(c => !folderShares.find(s => s.shared_with_user_id === c.contact_user_id)).map((contact) => (
              <Box
                key={contact.contact_user_id}
                onClick={() => setSelectedContactId(contact.contact_user_id)}
                sx={{
                  p: 1.5,
                  mb: 1,
                  borderRadius: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  bgcolor: selectedContactId === contact.contact_user_id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  border: '1px solid',
                  borderColor: selectedContactId === contact.contact_user_id ? '#3b82f6' : 'divider',
                  transition: 'background-color 0.2s ease',
                  '&:hover': {
                    bgcolor: 'rgba(59, 130, 246, 0.05)',
                  },
                }}
              >
                <Avatar src={contact.contact_profile_picture || undefined} sx={{ width: 32, height: 32 }}>
                  {contact.contact_name?.charAt(0) || 'U'}
                </Avatar>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {contact.contact_name}
                </Typography>
                {selectedContactId === contact.contact_user_id && (
                  <CheckIcon sx={{ color: '#3b82f6' }} />
                )}
              </Box>
            ))}
          </Box>
          
          <Accordion elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" color="text.secondary">
                Ajouter par ID de partage
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                label="ID de partage (6 caractères)"
                value={shareIdInput}
                onChange={(e) => setShareIdInput(e.target.value.toUpperCase())}
                inputProps={{ maxLength: 6 }}
                fullWidth
                size="small"
              />
            </AccordionDetails>
          </Accordion>
          
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Niveau d'accès
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[
              { value: 'reader', label: 'Lecteur', desc: 'Peut voir les réunions du dossier' },
              { value: 'contributor', label: 'Contributeur', desc: 'Peut ajouter et retirer des réunions' },
              { value: 'admin', label: 'Administrateur', desc: 'Peut modifier et partager le dossier' },
            ].map((role) => (
              <Box
                key={role.value}
                onClick={() => setShareRole(role.value as FolderRole)}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  bgcolor: shareRole === role.value ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  border: '1px solid',
                  borderColor: shareRole === role.value ? '#3b82f6' : 'divider',
                  transition: 'background-color 0.2s ease',
                  '&:hover': {
                    bgcolor: 'rgba(59, 130, 246, 0.05)',
                  },
                }}
              >
                <Radio
                  checked={shareRole === role.value}
                  sx={{ p: 0 }}
                />
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {role.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {role.desc}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => { setShareDialogOpen(false); resetShareForm(); handleMenuClose(); }}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={handleShareFolder}
            disabled={(!selectedContactId && !shareIdInput.trim()) || isSubmitting}
            sx={{ borderRadius: 2 }}
          >
            {isSubmitting ? <CircularProgress size={20} /> : 'Partager'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FoldersTab;
export { FoldersTab };


