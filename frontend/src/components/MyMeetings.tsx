import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useMediaQuery, useTheme } from '@mui/material';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Stack,
  useTheme as useMuiTheme,
  Grid,
  Alert,
  InputBase,
  LinearProgress,
  Fade,
  Zoom,
  TextField,
  Card,
  CardContent,
  Radio,
  Checkbox,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Tabs,
  Tab,
  Badge,
  Avatar,
  List,
  ListItemAvatar,
  ListItemButton,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Pagination
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import MeetingSummaryRenderer from './MeetingSummaryRenderer';
import SpeakerNameAutocomplete from './SpeakerNameAutocomplete';
import MeetingDetailOverlay from './MeetingDetailOverlay';
import {
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  EventNote as EventNoteIcon,
  Warning as WarningIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  Add as AddIcon,
  Share as ShareIcon,
  NewReleases as NewReleasesIcon,
  Person as PersonIcon,
  Edit as EditIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  Save as SaveIcon,
  Summarize as SummarizeIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Autorenew as AutorenewIcon,
  People as PeopleIcon,
  Business as BusinessIcon,
  FolderOpen as FolderIcon
} from '@mui/icons-material';
import {
  getAllMeetings,
  deleteMeeting,
  generateMeetingSummary,
  getMeetingDetails,
  onTranscriptionCompleted,
  getMeetingAudio,
  updateMeetingParticipantsAndDuration,
  watchSummaryStatus,
  Meeting as ApiMeeting,
  updateMeetingTranscriptText,
  updateMeetingSummaryText
} from '../services/meetingService';
import {
  verifyShareId,
  shareMeeting,
  removeSharedMeetingFromMySpace,
  getMeetingShares,
  revokeMeetingShare,
  getSharedMeetings,
  getMyContacts,
  Contact,
  ShareRole,
  MeetingShareInfo
} from '../services/shareService';
import {
  getMyOrganizations,
  getOrganizationMeetings,
  shareMeetingWithOrganization,
  createMyOrganization,
  addMemberToMyOrganization,
  type Organization
} from '../services/organizationService';
import apiClient, { API_BASE_URL } from '../services/apiClient';
import { getMyTemplates } from '../services/templateService';
import type { Template } from '../services/templateService';
import { useNotification } from '../contexts/NotificationContext';
import { User } from '../services/authService';
import MeetingAudioPlayer from './MeetingAudioPlayer';
import TranscriptExportButton from './TranscriptExportButton';
import SummaryExportButton from './SummaryExportButton';
import {
  updateSpeakerName,
  getSpeakers,
  hasCustomName
} from '../services/speakerService';
import { emitNavigateToOrganizations } from '../types/navigation';
import FoldersTab from './FoldersTab';
import type { Folder } from '../services/folderService';
import { getFolders, addMeetingToFolder, createFolder } from '../services/folderService';
import { logger } from '@/utils/logger';

interface Meeting extends Omit<ApiMeeting, 'summary_status'> {
  summary?: {
    status: string;
    lastModified?: string;
  };
  summary_status?: string;
  summary_text?: string;
  speakers_count?: number;
  template_id?: string | null;
  // Propriétés pour les réunions partagées
  is_shared?: boolean;
  shared_by?: string;
  shared_at?: string;
  permissions?: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
    role?: 'reader' | 'editor';
    can_edit?: boolean;
    can_share?: boolean;
    can_regenerate?: boolean;
  };
  organization_id?: string;
  organization_name?: string;
  organization_code?: string;
  owner_share_id?: string | null;
  owner_id?: string | null;
  shared_by_email?: string | null;
}

type ManualShareTarget = {
  shareId: string;
  userId?: string;
  name?: string;
};

type MeetingsTabKey = 'my-meetings' | 'folders' | 'shared-with-me' | 'organizations';

type MyMeetingsVariant = 'default' | 'organizations';

interface MyMeetingsProps {
  user?: User | null;
  isMobile?: boolean;
  variant?: MyMeetingsVariant;
}

const MyMeetings: React.FC<MyMeetingsProps> = ({ user: _user, isMobile: _isMobile = false, variant = 'default' }) => {
  const theme = useMuiTheme();
  const isMobileScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { showSuccessPopup, showErrorPopup } = useNotification();

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filteredMeetings, setFilteredMeetings] = useState<Meeting[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Toujours démarrer avec loading = true pour éviter de montrer 'No meetings found' prématurément
  const [loading, setLoading] = useState(true);
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const meetingsPerPage = 20;
  
  const allowedTabs = useMemo<MeetingsTabKey[]>(() => (
    variant === 'organizations'
      ? ['organizations']
      : ['my-meetings', 'folders']
  ), [variant]);

  const isOrganizationsMode = variant === 'organizations';
  const headerTitle = isOrganizationsMode ? 'Organisations' : 'Mes réunions';
  const headerSubtitle = isOrganizationsMode
    ? 'Retrouvez les réunions partagées avec vos organisations.'
    : 'Un seul endroit pour piloter vos réunions et comptes rendus';

  const searchPlaceholderDesktop = isOrganizationsMode
    ? 'Rechercher par titre, organisation, partageur...'
    : 'Rechercher par titre, date (janv 2023), durée (30min), participants...';

  const showMyMeetingsTab = allowedTabs.includes('my-meetings');
  const showFoldersTab = allowedTabs.includes('folders');
  const showSharedWithMeTab = allowedTabs.includes('shared-with-me');
  const showOrganizationsTab = allowedTabs.includes('organizations');

  // États pour les tabs et réunions partagées
  const [activeTab, setActiveTab] = useState<MeetingsTabKey>(allowedTabs[0]);
  const [sharedMeetings, setSharedMeetings] = useState<Meeting[]>([]);
  const [filteredSharedMeetings, setFilteredSharedMeetings] = useState<Meeting[]>([]);
  const [loadingSharedMeetings, setLoadingSharedMeetings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [currentAudioTitle, setCurrentAudioTitle] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [formattedTranscript, setFormattedTranscript] = useState<Array<{speaker: string; text: string; timestamp?: string}> | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [localGeneratingId, setLocalGeneratingId] = useState<string | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const [templateSelectorOpen, setTemplateSelectorOpen] = useState(false);
  const [selectedTemplateForGeneration, setSelectedTemplateForGeneration] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [viewingSummaryId, setViewingSummaryId] = useState<string | null>(null);
  // Protection contre la génération automatique - seule la génération manuelle via dropdown est autorisée
  const [manualSummaryGenerationOnly] = useState<boolean>(true);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState<boolean>(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState<boolean>(false);
  const [retryingMeetingId, setRetryingMeetingId] = useState<string | null>(null);
  
  // États pour l'édition inline du nom des réunions
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [editingMeetingName, setEditingMeetingName] = useState<string>('');
  const [updatedMeetingNames, setUpdatedMeetingNames] = useState<Record<string, string>>({});
  
  // États pour le menu d'actions rapides
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState<null | HTMLElement>(null);
  const [selectedMeetingForActions, setSelectedMeetingForActions] = useState<Meeting | null>(null);
  
  // États pour le dialog de partage
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [includeTranscript, setIncludeTranscript] = useState(false);
  const [shareRole, setShareRole] = useState<'reader' | 'editor'>('reader');
  const [shareIdInput, setShareIdInput] = useState('');
  const [recipientSearchQuery, setRecipientSearchQuery] = useState('');
  const [meetingShares, setMeetingShares] = useState<MeetingShareInfo[]>([]);
  const [loadingMeetingShares, setLoadingMeetingShares] = useState(false);
  const [verifiedUser, setVerifiedUser] = useState<{ name: string; id: string } | null>(null);
  const [verifyingShareId, setVerifyingShareId] = useState(false);
  const [sharingMeeting, setSharingMeeting] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [organizationMeetingsByOrg, setOrganizationMeetingsByOrg] = useState<Record<string, Meeting[]>>({});
  const [filteredOrganizationMeetingsByOrg, setFilteredOrganizationMeetingsByOrg] = useState<Record<string, Meeting[]>>({});
  const [organizationMeetingsFlat, setOrganizationMeetingsFlat] = useState<Meeting[]>([]);
  const [loadingOrganizationMeetings, setLoadingOrganizationMeetings] = useState(false);
  const [selectedContactIdsForShare, setSelectedContactIdsForShare] = useState<string[]>([]);
  const [manualShareTargets, setManualShareTargets] = useState<ManualShareTarget[]>([]);
  const [selectedOrganizationIdsForShare, setSelectedOrganizationIdsForShare] = useState<string[]>([]);
  const [shareValidationError, setShareValidationError] = useState<string | null>(null);
  
  // États pour la création de groupe
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedContactsForGroup, setSelectedContactsForGroup] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  
  // Ajout des refs pour gérer le nettoyage des timers
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isComponentMounted = useRef(true);
  // Watchers pour les résumés en cours
  const summaryWatchersRef = useRef<Record<string, () => void>>({});
  
  // Cache intelligent pour éviter les appels répétés
  const lastFetchRef = useRef<number>(0);
  const cachedMeetingsRef = useRef<Meeting[]>([]);
  const CACHE_DURATION = 30000; // Cache valide pendant 30 secondes
  
  // Ajout des états manquants pour l'édition des speakers et des transcriptions
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState<boolean>(false);
  const [editedTranscriptText, setEditedTranscriptText] = useState<string>('');
  const [isSavingTranscript, setIsSavingTranscript] = useState<boolean>(false);
  
  // États pour l'édition du résumé
  const [isEditingSummary, setIsEditingSummary] = useState<boolean>(false);
  const [editedSummaryText, setEditedSummaryText] = useState<string>('');
  const [isSavingSummary, setIsSavingSummary] = useState<boolean>(false);
  
  // États manquants ajoutés
  const [audioDialogOpen, setAudioDialogOpen] = useState<boolean>(false);
  const [refreshingMetadataId, setRefreshingMetadataId] = useState<string | null>(null);
  const [showGilbertPopup, setShowGilbertPopup] = useState<boolean>(false);
  
  // État pour le nouvel overlay de détail de réunion
  const [meetingDetailOverlayOpen, setMeetingDetailOverlayOpen] = useState<boolean>(false);
  const [overlayMeeting, setOverlayMeeting] = useState<Meeting | null>(null);
  
  // États pour le drag and drop vers les dossiers
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [draggingMeeting, setDraggingMeeting] = useState<Meeting | null>(null);
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [droppingToFolder, setDroppingToFolder] = useState<string | null>(null);
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressMeetingRef = useRef<Meeting | null>(null);
  const folderRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const hoveredFolderIdRef = useRef<string | null>(null);
  const draggingMeetingRef = useRef<Meeting | null>(null);
  // Optimisation : throttling pour le drag move
  const dragMoveAnimationFrameRef = useRef<number | null>(null);
  const lastDragCheckRef = useRef<{ x: number; y: number; time: number } | null>(null);
  
  // États pour "Mettre dans un dossier" depuis le menu
  const [addToFolderDialogOpen, setAddToFolderDialogOpen] = useState<boolean>(false);
  const [foldersForSelection, setFoldersForSelection] = useState<Folder[]>([]);
  const [loadingFoldersForSelection, setLoadingFoldersForSelection] = useState<boolean>(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [addingToFolders, setAddingToFolders] = useState<boolean>(false);

  // Trie hiérarchique : racines puis enfants directs, etc.
  const sortFoldersHierarchically = useCallback((folders: Folder[]) => {
    const map = new Map<string, Folder[]>();
    const roots: Folder[] = [];
    folders.forEach((f) => {
      if (f.parent_id) {
        if (!map.has(f.parent_id)) map.set(f.parent_id, []);
        map.get(f.parent_id)!.push(f);
      } else {
        roots.push(f);
      }
    });
    const result: Folder[] = [];
    const visit = (list: Folder[]) => {
      list.forEach((f) => {
        result.push(f);
        const children = map.get(f.id);
        if (children) visit(children);
      });
    };
    visit(roots);
    return result;
  }, []);
  
  // États pour "Nouveau dossier" pendant le drag
  const [createFolderDuringDrag, setCreateFolderDuringDrag] = useState<boolean>(false);
  const [newFolderNameDrag, setNewFolderNameDrag] = useState<string>('');
  const [creatingFolderDuringDrag, setCreatingFolderDuringDrag] = useState<boolean>(false);
  
  // Helpers hiérarchie dossiers (drag + dialog "mettre dans un dossier")
  const folderSelectionMap = useMemo(() => {
    const map = new Map<string, Folder>();
    foldersForSelection.forEach((f) => map.set(f.id, f));
    return map;
  }, [foldersForSelection]);

  const availableFolderMap = useMemo(() => {
    const map = new Map<string, Folder>();
    availableFolders.forEach((f) => map.set(f.id, f));
    return map;
  }, [availableFolders]);

  const getFolderDepthFromMap = useCallback((folder: Folder, map: Map<string, Folder>) => {
    let depth = 0;
    let current: Folder | undefined = folder;
    while (current?.parent_id) {
      depth += 1;
      current = map.get(current.parent_id);
      if (!current) break;
    }
    return depth;
  }, []);

  const getFolderPathLabelFromMap = useCallback((folder: Folder, map: Map<string, Folder>) => {
    const names: string[] = [];
    let current: Folder | undefined = folder;
    while (current) {
      names.unshift(current.name);
      if (!current.parent_id) break;
      current = map.get(current.parent_id);
      if (!current) break;
    }
    return names.join(' / ');
  }, []);

  const getFolderDepth = useCallback((folder: Folder) => getFolderDepthFromMap(folder, folderSelectionMap), [folderSelectionMap, getFolderDepthFromMap]);
  const getFolderPathLabel = useCallback((folder: Folder) => getFolderPathLabelFromMap(folder, folderSelectionMap), [folderSelectionMap, getFolderPathLabelFromMap]);

  // Fonction pour nettoyer les timers de polling
  const cleanupPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      logger.debug('🧹 Cleaning up polling timeout');
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  // Fonction pour gérer la persistance des états de génération
  const getGeneratingSummaryFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem('generating_summary_id');
      return stored || null;
    } catch {
      return null;
    }
  }, []);

  const setGeneratingSummaryInStorage = useCallback((id: string | null) => {
    try {
      if (id) {
        localStorage.setItem('generating_summary_id', id);
      } else {
        localStorage.removeItem('generating_summary_id');
      }
    } catch (error) {
      logger.error('Error managing localStorage for generating summary:', error);
    }
  }, []);

  // Fonction de récupération des réunions mémorisée - MOVED HERE TO FIX DEPENDENCY ORDER
  const fetchMeetings = useCallback(async (silent: boolean = false) => {
    try {
      // Vérifier si on peut utiliser le cache
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchRef.current;
      const canUseCache = timeSinceLastFetch < CACHE_DURATION && cachedMeetingsRef.current.length > 0;
      
      if (canUseCache && !silent) {
        logger.debug(`🔄 [FETCH CACHE] Using cached meetings (${Math.round(timeSinceLastFetch / 1000)}s old)`);
        setMeetings(cachedMeetingsRef.current);
        setFilteredMeetings(cachedMeetingsRef.current);
        setLoading(false);
        setIsRefreshing(false);
        setError(null);
        return cachedMeetingsRef.current;
      }
      
      // S'assurer que l'état de chargement est actif seulement si pas en mode silencieux
      if (!silent) {
        setLoading(true);
        setIsRefreshing(true);
        setError(null);
      }
      
      // Enregistrer le temps de début pour garantir un temps minimum de chargement
      const startTime = Date.now();
      
      logger.debug(`🔄 [FETCH${silent ? ' SILENTLY' : ''}] Fetching all meetings...`);
      const fetchedMeetings = await getAllMeetings();
      
      // Convert the duration values for display
      const processedMeetings = fetchedMeetings.map(meeting => {
        logger.debug(`Processing meeting ${meeting.id} for display:`, {
          rawDuration: meeting.duration,
          rawDurationType: typeof meeting.duration,
          rawAudioDuration: meeting.audio_duration,
          rawAudioDurationType: typeof meeting.audio_duration,
          speakers: meeting.speakers_count || meeting.speakers_count || meeting.participants,
        });
        
        // Process duration - try to ensure we have a numerical value
        let durationInSeconds: number | undefined = undefined;
        
        // Ordre de priorité: audio_duration, duration_seconds, puis duration
        if (typeof meeting.audio_duration === 'number') {
          durationInSeconds = meeting.audio_duration;
        } else if (typeof meeting.duration_seconds === 'number') {
          durationInSeconds = meeting.duration_seconds;
        } else if (typeof meeting.duration === 'number') {
          durationInSeconds = meeting.duration;
        } else if (typeof meeting.duration === 'string' && (meeting.duration as string).includes('min')) {
          // Essayer de convertir un format comme '45 min' en secondes
          const minutes = parseInt(meeting.duration as string);
          if (!isNaN(minutes)) {
            durationInSeconds = minutes * 60;
          }
        }
        
        // Déterminer le nombre de participants avec le bon ordre de priorité
        const participants = meeting.speakers_count || meeting.speakers_count || meeting.participants || 0;
        
        logger.debug(`Processed metadata for ${meeting.id}: Duration=${durationInSeconds}s, Participants=${participants}`);
        
        return {
          ...meeting,
          audio_duration: durationInSeconds,
          duration: durationInSeconds || meeting.duration,
          participants: participants
        };
      });
      
      // Mettre à jour les données des réunions
      setMeetings(processedMeetings);
      setFilteredMeetings(processedMeetings);
      
      // Mettre à jour le cache
      cachedMeetingsRef.current = processedMeetings;
      lastFetchRef.current = now;
      
      // IMPORTANT: Vérifier qu'aucune génération automatique ne se déclenche
      // Les résumés ne doivent être générés QUE manuellement via le dropdown
      logger.debug('🔒 [PROTECTION] Aucune génération automatique de résumé autorisée - seules les générations manuelles sont permises');
      
      // Calculer le temps écoulé depuis le début de la requête
      const elapsedTime = Date.now() - startTime;
      const minLoadingTime = 800; // Temps minimum de chargement en millisecondes
      
      // Si la requête a été trop rapide et pas en mode silencieux, attendre un peu pour montrer le chargement
      if (elapsedTime < minLoadingTime && !silent) {
        await new Promise(resolve => setTimeout(resolve, minLoadingTime - elapsedTime));
      }
      
      logger.debug(`🔄 [FETCH${silent ? ' SILENTLY' : ''}] Successfully fetched ${processedMeetings.length} meetings`);
      return processedMeetings;
    } catch (err) {
      logger.error(`🔄 [FETCH${silent ? ' SILENTLY' : ''}] Failed to load meetings:`, err);
      if (!silent) {
        setError('Failed to load your meetings. Please try again.');
      }
      throw err;
    } finally {
      if (!silent) {
        setLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Fonction pour charger les réunions partagées
  const fetchSharedMeetings = useCallback(async () => {
    try {
      setLoadingSharedMeetings(true);
      logger.debug('🔄 [FETCH] Fetching shared meetings...');

      const fetchedSharedMeetings = await getSharedMeetings();
      
      // Normaliser les réunions partagées (même format que mes réunions)
      const processedSharedMeetings = fetchedSharedMeetings.map((meeting: any) => ({
        ...meeting,
        duration_seconds: meeting.duration_seconds || meeting.audio_duration || 0,
        is_shared: true,
        shared_by: meeting.shared_by || meeting.owner_name,
        shared_at: meeting.shared_at,
        // Conserver explicitement les permissions
        permissions: meeting.permissions || { can_view: true, can_export: true, include_transcript: false }
      }));
      
      setSharedMeetings(processedSharedMeetings);
      setFilteredSharedMeetings(processedSharedMeetings);
      
      logger.debug(`✅ [FETCH] Successfully fetched ${processedSharedMeetings.length} shared meetings`);
      return processedSharedMeetings;
    } catch (err) {
      logger.error('🔄 [FETCH] Failed to load shared meetings:', err);
      setError('Impossible de charger les réunions partagées');
      throw err;
    } finally {
      setLoadingSharedMeetings(false);
    }
  }, []);

  const fetchOrganizationMeetingsData = useCallback(async (targetOrganizations?: Organization[]) => {
    const orgsToUse = targetOrganizations ?? organizations;

    if (!orgsToUse || orgsToUse.length === 0) {
      setOrganizationMeetingsByOrg({});
      setFilteredOrganizationMeetingsByOrg({});
      setOrganizationMeetingsFlat([]);
      return [] as Meeting[];
    }

    setLoadingOrganizationMeetings(true);

    try {
      logger.debug("🏢 [FETCH] Récupération des réunions d'organisation...");
      const aggregatedMeetings: Meeting[] = [];
      const groupedMeetings: Record<string, Meeting[]> = {};

      for (const org of orgsToUse) {
        const orgMeetings = await getOrganizationMeetings(org.id);
        console.debug('[OrgMeetings] Organisation', org.name, 'renvoie', orgMeetings.length, 'réunions');

        const normalizedMeetings: Meeting[] = orgMeetings.map((orgMeeting) => ({
          id: orgMeeting.meeting_id,
          title: orgMeeting.meeting_title ?? 'Réunion partagée',
          duration: orgMeeting.meeting_duration_seconds ?? 0,
          duration_seconds: orgMeeting.meeting_duration_seconds ?? 0,
          audio_duration: orgMeeting.meeting_duration_seconds ?? 0,
          date: orgMeeting.meeting_created_at,
          created_at: orgMeeting.meeting_created_at,
          is_shared: true,
          shared_by: orgMeeting.shared_by_name || orgMeeting.shared_by || org.name,
          shared_at: orgMeeting.shared_at,
          permissions: orgMeeting.permissions,
          organization_id: org.id,
          organization_name: org.name,
          organization_code: org.organization_code,
          transcript_status: (orgMeeting.transcript_status ?? 'completed') as Meeting['transcript_status'],
          summary_status: (orgMeeting.summary_status ?? 'completed') as Meeting['summary_status'],
          summary_text: orgMeeting.summary_text ?? undefined,
          user_id: orgMeeting.shared_by,
        }));

        normalizedMeetings.forEach(meeting => {
          console.debug('[OrgMeeting] ID=', meeting.id, 'summary_status=', meeting.summary_status, 'has_text=', !!meeting.summary_text, 'len=', meeting.summary_text?.length);
        });

        normalizedMeetings.sort((a, b) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA;
        });

        groupedMeetings[org.id] = normalizedMeetings;
        aggregatedMeetings.push(...normalizedMeetings);
      }

      aggregatedMeetings.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      setOrganizationMeetingsByOrg(groupedMeetings);
      setOrganizationMeetingsFlat(aggregatedMeetings);

      if (searchQuery.trim()) {
        const lowercaseQuery = searchQuery.toLowerCase();
        const filteredGrouped: Record<string, Meeting[]> = {};

        Object.entries(groupedMeetings).forEach(([orgId, meetingsList]) => {
          filteredGrouped[orgId] = meetingsList.filter((meeting) => {
            const titleMatch = meeting.title?.toLowerCase().includes(lowercaseQuery);
            const orgMatch = meeting.organization_name?.toLowerCase().includes(lowercaseQuery);
            const sharedByMatch = meeting.shared_by?.toLowerCase().includes(lowercaseQuery);
            return titleMatch || orgMatch || sharedByMatch;
          });
        });

        setFilteredOrganizationMeetingsByOrg(filteredGrouped);
      } else {
        const clonedGrouped = Object.entries(groupedMeetings).reduce((acc, [orgId, meetingsList]) => {
          acc[orgId] = [...meetingsList];
          return acc;
        }, {} as Record<string, Meeting[]>);

        setFilteredOrganizationMeetingsByOrg(clonedGrouped);
      }

      logger.debug(`✅ [FETCH] ${aggregatedMeetings.length} réunions d'organisation chargées`);
      return aggregatedMeetings;
    } catch (err) {
      logger.error("🏢 [FETCH] Erreur lors du chargement des réunions d'organisation:", err);
      showErrorPopup('Erreur', "Impossible de charger les réunions d'organisation");
      throw err;
    } finally {
      setLoadingOrganizationMeetings(false);
    }
  }, [organizations, searchQuery, showErrorPopup]);

  const fetchUserOrganizations = useCallback(async () => {
    try {
      setLoadingOrganizations(true);
      logger.debug("🏢 [FETCH] Récupération des organisations de l'utilisateur...");
      const userOrganizations = await getMyOrganizations();
      setOrganizations(userOrganizations);

      if (userOrganizations.length > 0) {
        await fetchOrganizationMeetingsData(userOrganizations);
      } else {
        setOrganizationMeetingsByOrg({});
        setFilteredOrganizationMeetingsByOrg({});
        setOrganizationMeetingsFlat([]);
      }

      logger.debug(`✅ [FETCH] ${userOrganizations.length} organisation(s) détectée(s)`);
      return userOrganizations;
    } catch (err) {
      logger.error('🏢 [FETCH] Erreur lors du chargement des organisations:', err);
      showErrorPopup('Erreur', "Impossible de charger vos organisations");
      throw err;
    } finally {
      setLoadingOrganizations(false);
    }
  }, [fetchOrganizationMeetingsData, showErrorPopup]);

  // Fonction wrapper pour les gestionnaires d'événements
  const handleRefreshMeetings = useCallback(() => {
    return fetchMeetings(false);
  }, [fetchMeetings]);

  // Fonction pour invalider le cache et forcer un nouveau fetch
  const invalidateCacheAndRefresh = useCallback(async () => {
    logger.debug('🔄 [CACHE] Invalidating cache and forcing refresh');
    lastFetchRef.current = 0; // Invalider le cache
    cachedMeetingsRef.current = []; // Vider le cache
    await fetchMeetings(false); // Forcer un nouveau fetch
    await fetchSharedMeetings();
    await fetchUserOrganizations();
  }, [fetchMeetings, fetchSharedMeetings, fetchUserOrganizations]);

  // Charger les réunions au montage du composant
  useEffect(() => {
    const loadInitialData = async () => {
      // Force loading state to true immediately on mount
      setLoading(true);
      // Reset error state
      setError(null);

      try {
        // Fetch meetings with error handling - on catch les erreurs pour éviter le redirect 401
        await Promise.allSettled([
          fetchMeetings().catch(err => logger.warn('Erreur chargement meetings:', err)),
          loadUserTemplates().catch(err => logger.warn('Erreur chargement templates:', err)),
          fetchSharedMeetings().catch(err => logger.warn('Erreur chargement shared:', err)),
          fetchUserOrganizations().catch(err => logger.warn('Erreur chargement orgs:', err)),
        ]);
      } catch (err) {
        logger.error('Erreur lors du chargement initial:', err);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Charger les réunions partagées quand on change de tab
  useEffect(() => {
    if (activeTab === 'shared-with-me') {
      fetchSharedMeetings();
    } else if (activeTab === 'organizations') {
      fetchOrganizationMeetingsData();
    }
  }, [activeTab, fetchSharedMeetings, fetchOrganizationMeetingsData]);

  useEffect(() => {
    if (variant !== 'organizations' && !loadingOrganizations && organizations.length === 0 && activeTab === 'organizations') {
      setActiveTab('my-meetings');
    }
  }, [loadingOrganizations, organizations, activeTab, variant]);

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [allowedTabs, activeTab]);

  const loadUserTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const response = await getMyTemplates();
      logger.debug('📋 Templates chargés:', response.templates.length);
      logger.debug('📋 Tous les templates:', response.templates);
      logger.debug('📋 Templates avec logo:', response.templates.filter(t => t.logo_url).map(t => ({ name: t.name, logo_url: t.logo_url })));
      setUserTemplates(response.templates);
      // Sélectionner le template par défaut si disponible
      if (response.default_template_id) {
        setSelectedTemplateForGeneration(response.default_template_id);
      } else if (response.templates.length > 0) {
        setSelectedTemplateForGeneration(response.templates[0].id);
      }
    } catch (error) {
      logger.error('Erreur lors du chargement des templates:', error);
      showErrorPopup('Erreur', 'Impossible de charger vos templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const resolveTemplateForMeeting = useCallback((meeting: Meeting) => {
    logger.debug('[resolveTemplate] ===== RÉSOLUTION TEMPLATE =====');
    logger.debug('[resolveTemplate] Meeting:', meeting.title, 'template_id:', meeting.template_id);
    logger.debug('[resolveTemplate] userTemplates disponibles:', userTemplates?.length || 0);

    if (!userTemplates || userTemplates.length === 0) {
      logger.debug('[resolveTemplate] ❌ Aucun template disponible');
      return undefined;
    }

    // Log tous les templates avec leurs infos
    userTemplates.forEach(t => {
      logger.debug(`[resolveTemplate] Template: ${t.name} (${t.id}) - logo_url: ${t.logo_url || 'AUCUN'} - layout_config: ${t.layout_config ? Object.keys(t.layout_config).length + ' clés' : 'VIDE'}`);
    });

    if (meeting.template_id) {
      const matchingTemplate = userTemplates.find((template) => template.id === meeting.template_id);
      if (matchingTemplate) {
        logger.debug('[resolveTemplate] ✅ Template trouvé par meeting.template_id:', matchingTemplate.name);
        logger.debug('[resolveTemplate] Logo URL:', matchingTemplate.logo_url);
        logger.debug('[resolveTemplate] Layout config:', JSON.stringify(matchingTemplate.layout_config));
        return matchingTemplate;
      }
    }

    const defaultTemplate = userTemplates.find((template) => template.is_default);
    if (defaultTemplate) {
      logger.debug('[resolveTemplate] ✅ Template par défaut utilisé:', defaultTemplate.name);
      logger.debug('[resolveTemplate] Logo URL:', defaultTemplate.logo_url);
      logger.debug('[resolveTemplate] Layout config:', JSON.stringify(defaultTemplate.layout_config));
      return defaultTemplate;
    }

    const firstTemplate = userTemplates[0];
    logger.debug('[resolveTemplate] ✅ Premier template utilisé:', firstTemplate.name);
    logger.debug('[resolveTemplate] Logo URL:', firstTemplate.logo_url);
    logger.debug('[resolveTemplate] Layout config:', JSON.stringify(firstTemplate.layout_config));
    return firstTemplate;
  }, [userTemplates]);

  // Effet pour rafraîchir automatiquement les données des réunions en cours de traitement
  useEffect(() => {
    // TEMPORAIREMENT DÉSACTIVÉ pour éviter la boucle infinie
    return;
  }, []); // Dépendances vides pour éviter l'erreur de linter

  // Détection automatique de fin de transcription - Solution propre
  useEffect(() => {
    logger.debug('🔄 Setting up transcription completion listener...');
    
    const unsubscribe = onTranscriptionCompleted((meeting) => {
      logger.debug('✅ Transcription terminée pour la réunion:', meeting.id, meeting.title);
      logger.debug('🔄 Rafraîchissement automatique de la liste des réunions...');
      
      // IMPORTANT: Ne PAS générer automatiquement de résumé
      // Seul l'utilisateur peut déclencher la génération via le dropdown
      logger.debug('🚫 Génération automatique de résumé désactivée - l\'utilisateur doit choisir manuellement');
      
      // Invalider le cache et rafraîchir la liste des réunions
      invalidateCacheAndRefresh();
    });

    return () => {
      logger.debug('🔄 Cleaning up transcription completion listener');
      unsubscribe();
    };
  }, [invalidateCacheAndRefresh]);





  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '0 min';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (minutes === 0) {
      return `${remainingSeconds} sec`;
    } else if (remainingSeconds === 0) {
      return `${minutes} min`;
    } else {
      return `${minutes} min ${remainingSeconds} sec`;
    }
  };

  const formatRelativeInteraction = (timestamp?: string | null) => {
    if (!timestamp) {
      return null;
    }

    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes < 1) {
      return "À l'instant";
    }
    if (diffMinutes < 60) {
      return `Il y a ${diffMinutes} min`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `Il y a ${diffHours} h`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) {
      return `Il y a ${diffDays} j`;
    }

    return date.toLocaleDateString('fr-FR');
  };

  // Fonction pour parser une transcription en texte brut vers un format structuré
  const parseTextTranscript = (transcriptText: string): Array<{speaker: string; text: string; timestamp?: string}> => {
    try {
      const lines = transcriptText.split('\n').filter(line => line.trim().length > 0);
      const formattedData: Array<{speaker: string; text: string; timestamp?: string}> = [];
      
      for (const line of lines) {
        // Essayer différents formats de ligne possibles
        
        // Format: "Speaker: text" ou "Speaker : text"
        const speakerTextMatch = line.match(/^([^:]+):\s*(.+)$/);
        if (speakerTextMatch) {
          formattedData.push({
            speaker: speakerTextMatch[1].trim(),
            text: speakerTextMatch[2].trim()
          });
          continue;
        }
        
        // Format: "[timestamp] Speaker: text"
        const timestampMatch = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
        if (timestampMatch) {
          formattedData.push({
            speaker: timestampMatch[2].trim(),
            text: timestampMatch[3].trim(),
            timestamp: timestampMatch[1].trim()
          });
          continue;
        }
        
        // Format: "Speaker (timestamp): text"
        const speakerTimestampMatch = line.match(/^([^(]+)\s*\(([^)]+)\):\s*(.+)$/);
        if (speakerTimestampMatch) {
          formattedData.push({
            speaker: speakerTimestampMatch[1].trim(),
            text: speakerTimestampMatch[3].trim(),
            timestamp: speakerTimestampMatch[2].trim()
          });
          continue;
        }
        
        // Si aucun format reconnu, traiter comme du texte simple avec Speaker par défaut
        if (line.trim().length > 0) {
          formattedData.push({
            speaker: 'Speaker',
            text: line.trim()
          });
        }
      }
      
      return formattedData;
    } catch (error) {
      logger.error('Error parsing text transcript:', error);
      return [];
    }
  };

  const handleViewTranscript = async (meetingId: string) => {
    logger.debug(`=== DEBUT FETCH TRANSCRIPT ===`);
    logger.debug(`Viewing transcript for meeting ${meetingId}`);
    
    // Indiquer que le chargement est en cours
    setIsLoadingTranscript(true);
    // Stocker la réunion sélectionnée
    const meeting = findMeetingAnywhere(meetingId);
    if (meeting) {
      setSelectedMeeting(meeting);
      logger.debug('Meeting found in state:', {
        id: meeting.id,
        title: meeting.title,
        transcript_status: meeting.transcript_status,
        transcription_status: meeting.transcription_status
      });
    } else {
      logger.error(`Meeting with ID ${meetingId} not found in local state`);
    }
    // Ouvrir le dialogue immédiatement pour montrer que quelque chose se passe
    setTranscriptDialogOpen(true);
    
    try {
      logger.debug(`Fetching transcript for meeting ID: ${meetingId}`);
      
      // Récupérer le token d'authentification
      const token = localStorage.getItem('auth_token');
      logger.debug('Using auth token:', token ? `${token.substring(0, 10)}...` : 'No token found');
      
      // Vérifier si la transcription est terminée
      const isCompleted = meeting?.transcript_status === 'completed' || meeting?.transcription_status === 'completed';
      logger.debug('Transcription completion check:', {
        transcript_status: meeting?.transcript_status,
        transcription_status: meeting?.transcription_status,
        isCompleted
      });
      
      if (!isCompleted) {
        logger.warn('Transcription not completed yet - setting empty state');
        setFormattedTranscript(null);
        setTranscript('La transcription est en cours de traitement. Veuillez patienter...');
        return;
      }
      
      // Toujours utiliser l'endpoint simplifié pour éviter les erreurs 500 sur /meetings/{id}
      let response: any;
      const endpoint = `/simple/meetings/${meetingId}`;
      logger.debug(`=== FETCH: ${API_BASE_URL}${endpoint} ===`);
      response = await apiClient.get(endpoint);
      
      // Traitement de la réponse
      logger.debug('=== TRAITEMENT DE LA REPONSE ===');
      logger.debug('Full API Response:', response);
      
      // L'API peut retourner soit response.data soit directement les données
      let meetingData;
      if (response.data) {
        meetingData = response.data;
        logger.debug('Using response.data');
      } else {
        meetingData = response;
        logger.debug('Using response directly');
      }
      
      if (!meetingData) {
        logger.error('No meeting data received');
          setFormattedTranscript(null);
        setTranscript('Aucune transcription disponible.');
          return;
        }
        
      logger.debug('Meeting data keys:', Object.keys(meetingData));
      logger.debug('Meeting data sample:', JSON.stringify(meetingData, null, 2).substring(0, 500) + '...');
      
      // Chercher la transcription dans différents formats possibles
      const possibleTranscriptFields = [
        'transcript', 
        'transcription', 
        'transcript_text',
        'transcription_text',
        'content',
        'text'
      ];
      
      let transcriptText = null;
      let foundField = '';
      
      for (const field of possibleTranscriptFields) {
        if (meetingData[field]) {
          transcriptText = meetingData[field];
          foundField = field;
          break;
        }
      }
      
      logger.debug('Transcript search results:', {
        foundField,
        transcriptType: typeof transcriptText,
        hasTranscript: !!transcriptText,
        transcriptPreview: transcriptText ? (typeof transcriptText === 'string' ? transcriptText.substring(0, 100) : 'Non-string data') : 'No transcript'
      });
      
      if (!transcriptText) {
        logger.warn('No transcript text found in response');
        logger.debug('Available fields in response:', Object.keys(meetingData));
        setFormattedTranscript(null);
        setTranscript('Transcription non disponible ou en cours de traitement.');
        return;
      }
      
      logger.debug('=== PARSING TRANSCRIPT ===');
      logger.debug('Raw transcript text type:', typeof transcriptText);
      logger.debug('Raw transcript text preview:', 
        typeof transcriptText === 'string' 
          ? transcriptText.substring(0, 200) + '...' 
          : 'Not a string: ' + JSON.stringify(transcriptText).substring(0, 200) + '...'
      );
      
      // Sauvegarder le texte brut
      setTranscript(typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText));
      
      // Essayer de parser la transcription formatée
      try {
        let formattedData: Array<{speaker: string; text: string; timestamp?: string}> = [];
        
        // Tenter de parser comme JSON d'abord
        if (typeof transcriptText === 'string' && transcriptText.trim().startsWith('[')) {
          try {
            formattedData = JSON.parse(transcriptText);
            logger.debug('Parsed transcript as JSON:', formattedData.length, 'utterances');
          } catch (jsonError) {
            logger.debug('Failed to parse as JSON, trying text parsing');
            formattedData = parseTextTranscript(transcriptText);
          }
        } else if (Array.isArray(transcriptText)) {
          // La transcription est déjà un array
          formattedData = transcriptText;
          logger.debug('Transcript already formatted as array:', formattedData.length, 'utterances');
          } else {
          // Parser comme texte brut
          logger.debug('Parsing as plain text');
          formattedData = parseTextTranscript(typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText));
        }
        
        logger.debug('Formatted data result:', {
          length: formattedData.length,
          firstItem: formattedData[0],
          speakers: formattedData.map(item => item.speaker).filter((v, i, a) => a.indexOf(v) === i)
        });
        
        // Les noms personnalisés sont déjà dans le transcript_text (sauvegardés en BDD)
        if (formattedData.length > 0) {
          setFormattedTranscript(formattedData);
          logger.debug('=== SUCCESS: Formatted transcript set with', formattedData.length, 'utterances ===');
      } else {
          logger.warn('No formatted transcript data available - empty array');
        setFormattedTranscript(null);
          setTranscript('La transcription semble vide. Veuillez vérifier que l\'enregistrement contient bien du contenu audio.');
        }
        
      } catch (parseError) {
        logger.error('Error parsing transcript:', parseError);
      setFormattedTranscript(null);
        setTranscript('Erreur lors du parsing de la transcription: ' + (parseError instanceof Error ? parseError.message : 'Erreur inconnue'));
      }
      
    } catch (error) {
      logger.error('=== ERROR FETCHING TRANSCRIPT ===', error);
      showErrorPopup('Error', 'Failed to load transcript: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setFormattedTranscript(null);
      setTranscript('Erreur lors du chargement de la transcription.');
    } finally {
      setIsLoadingTranscript(false);
      logger.debug('=== FIN FETCH TRANSCRIPT ===');
    }
  };

  const handleMeetingClick = (meetingId: string) => {
    // Si on est en mode drag, ne pas ouvrir la réunion
    if (isDragging) return;
    
    const meeting = findMeetingAnywhere(meetingId);
        
    // Ouvrir l'overlay de détail de réunion (pour toutes les réunions, y compris partagées)
    if (meeting) {
      setOverlayMeeting(meeting);
      setSelectedMeeting(meeting);
      setMeetingDetailOverlayOpen(true);
      // Réinitialiser les états de la transcription
      setFormattedTranscript(null);
      setTranscript(null);
    }
  };

  // ===== DRAG AND DROP VERS LES DOSSIERS =====
  
  // Charger les dossiers disponibles pour le drop
  const loadFoldersForDrop = async () => {
    setLoadingFolders(true);
    try {
      const folders = await getFolders();
      // Filtrer les dossiers où on peut ajouter des réunions
      const droppableFolders = folders.filter(folder => {
        if (!folder.is_shared) return true; // Propriétaire
        return folder.my_permissions?.can_add_meetings === true;
      });
      // Ordonner pour afficher parent puis enfants
      const ordered = sortFoldersHierarchically(droppableFolders);
      setAvailableFolders(ordered);
    } catch (err) {
      logger.error('Error loading folders for drop:', err);
      setAvailableFolders([]);
    } finally {
      setLoadingFolders(false);
    }
  };

  // Démarrer le drag (long press)
  const handleMeetingLongPressStart = (meeting: Meeting, e: React.TouchEvent | React.MouseEvent) => {
    // Ne pas activer pour les réunions partagées qu'on ne possède pas
    if (meeting.is_shared) return;
    
    // Récupérer la position initiale
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    longPressMeetingRef.current = meeting;
    longPressTimerRef.current = setTimeout(() => {
      // Vibration feedback si disponible
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      setDraggingMeeting(meeting);
      draggingMeetingRef.current = meeting; // Keep ref in sync
      setIsDragging(true);
      setDragPosition({ x: clientX, y: clientY });
      loadFoldersForDrop();
      
      // Ajouter les listeners globaux pour suivre le mouvement
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.addEventListener('touchmove', handleDragMove);
      document.addEventListener('touchend', handleDragEnd);
    }, 400); // 400ms pour activer le drag
  };

  // Suivre le mouvement pendant le drag (optimisé avec throttling)
  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Throttling : utiliser requestAnimationFrame pour limiter les mises à jour
    if (dragMoveAnimationFrameRef.current !== null) {
      cancelAnimationFrame(dragMoveAnimationFrameRef.current);
    }
    
    dragMoveAnimationFrameRef.current = requestAnimationFrame(() => {
      setDragPosition({ x: clientX, y: clientY });
      
      // Optimisation : vérifier seulement si la position a significativement changé
      const lastCheck = lastDragCheckRef.current;
      const now = Date.now();
      const shouldCheck = !lastCheck || 
        Math.abs(clientX - lastCheck.x) > 10 || 
        Math.abs(clientY - lastCheck.y) > 10 || 
        (now - lastCheck.time) > 50; // Au moins toutes les 50ms
      
      if (shouldCheck) {
        lastDragCheckRef.current = { x: clientX, y: clientY, time: now };
        
        // Optimisation : utiliser elementFromPoint au lieu de parcourir tous les dossiers
        const elementAtPoint = document.elementFromPoint(clientX, clientY);
        let foundFolder: string | null = null;
        
        if (elementAtPoint) {
          // Remonter dans le DOM pour trouver le dossier parent
          let current: HTMLElement | null = elementAtPoint as HTMLElement;
          while (current && !foundFolder) {
            const folderId = current.getAttribute('data-folder-id');
            if (folderId && folderRefs.current[folderId]) {
              foundFolder = folderId;
              break;
            }
            current = current.parentElement;
          }
        }
        
        // Fallback : si elementFromPoint ne fonctionne pas, vérifier seulement les dossiers visibles
        if (!foundFolder) {
          const viewportTop = window.scrollY;
          const viewportBottom = viewportTop + window.innerHeight;
          
          // Parcourir seulement les dossiers visibles dans le viewport
          for (const [folderId, ref] of Object.entries(folderRefs.current)) {
            if (ref) {
              const rect = ref.getBoundingClientRect();
              const elementTop = rect.top + viewportTop;
              const elementBottom = rect.bottom + viewportTop;
              
              // Vérifier seulement si le dossier est visible dans le viewport
              if (elementBottom >= viewportTop && elementTop <= viewportBottom) {
                if (clientX >= rect.left && clientX <= rect.right && 
                    clientY >= rect.top && clientY <= rect.bottom) {
                  foundFolder = folderId;
                  break; // Arrêter dès qu'on trouve
                }
              }
            }
          }
        }
        
        setHoveredFolderId(foundFolder);
        hoveredFolderIdRef.current = foundFolder;
      }
      
      dragMoveAnimationFrameRef.current = null;
    });
  }, []);

  // Fin du drag
  const handleDragEnd = useCallback(async () => {
    // Retirer les listeners
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.removeEventListener('touchmove', handleDragMove);
    document.removeEventListener('touchend', handleDragEnd);
    
    // Utiliser les refs pour avoir les valeurs actuelles
    const currentHoveredFolderId = hoveredFolderIdRef.current;
    const currentDraggingMeeting = draggingMeetingRef.current;
    
    // Si on est au-dessus d'un dossier, ajouter la réunion
    if (currentHoveredFolderId && currentDraggingMeeting) {
      // Cas spécial : création d'un nouveau dossier
      if (currentHoveredFolderId === 'new') {
        // Fermer l'overlay du drag d'abord
        setIsDragging(false);
        setAvailableFolders([]);
        setHoveredFolderId(null);
        hoveredFolderIdRef.current = null;
        setDragPosition(null);
        // Ouvrir le dialog de création de dossier
        setCreateFolderDuringDrag(true);
        setNewFolderNameDrag('');
        // On garde draggingMeetingRef pour l'utiliser après
        return;
      }
      
      setDroppingToFolder(currentHoveredFolderId);
      try {
        await addMeetingToFolder(currentHoveredFolderId, currentDraggingMeeting.id);
        showSuccessPopup('Succès', 'Réunion ajoutée au dossier');
      } catch (err) {
        logger.error('Error adding meeting to folder:', err);
        showErrorPopup('Erreur', 'Impossible d\'ajouter la réunion au dossier');
      } finally {
        setDroppingToFolder(null);
      }
    }
    
    cancelDrag();
  }, [showSuccessPopup, showErrorPopup]);

  // Annuler le long press
  const handleMeetingLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressMeetingRef.current = null;
  };

  // Créer un nouveau dossier pendant le drag et y ajouter la réunion
  const handleCreateFolderDuringDrag = async () => {
    if (!newFolderNameDrag.trim() || !draggingMeetingRef.current) {
      cancelDrag();
      setCreateFolderDuringDrag(false);
      return;
    }
    
    setCreatingFolderDuringDrag(true);
    try {
      // Créer le dossier
      const newFolder = await createFolder({ name: newFolderNameDrag.trim() });
      // Ajouter la réunion au dossier
      await addMeetingToFolder(newFolder.id, draggingMeetingRef.current.id);
      showSuccessPopup('Succès', `Dossier "${newFolderNameDrag}" créé et réunion ajoutée`);
    } catch (err) {
      logger.error('Error creating folder during drag:', err);
      showErrorPopup('Erreur', 'Impossible de créer le dossier');
    } finally {
      setCreatingFolderDuringDrag(false);
      setCreateFolderDuringDrag(false);
      cancelDrag();
    }
  };

  // Ouvrir le dialog pour ajouter une réunion à un dossier (depuis le menu)
  const handleOpenAddToFolderDialog = async () => {
    // Ne pas utiliser handleCloseActionsMenu() car il réinitialise selectedMeetingForActions
    // Fermer juste le menu mais garder la réunion sélectionnée
    setActionsMenuAnchor(null);
    setLoadingFoldersForSelection(true);
    setSelectedFolderIds([]);
    setAddToFolderDialogOpen(true);
    try {
      const folders = await getFolders();
      // Filtrer les dossiers où on peut ajouter des réunions
      const addableFolders = folders.filter(folder => {
        if (!folder.is_shared) return true;
        return folder.my_permissions?.can_add_meetings === true;
      });
      const ordered = sortFoldersHierarchically(addableFolders);
      setFoldersForSelection(ordered);
    } catch (err) {
      logger.error('Error loading folders:', err);
      setFoldersForSelection([]);
    } finally {
      setLoadingFoldersForSelection(false);
    }
  };

  // Toggle la sélection d'un dossier
  const handleToggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds(prev => 
      prev.includes(folderId) 
        ? prev.filter(id => id !== folderId)
        : [...prev, folderId]
    );
  };

  // Ajouter la réunion aux dossiers sélectionnés
  const handleConfirmAddToFolders = async () => {
    logger.debug('handleConfirmAddToFolders called', { 
      selectedMeetingForActions, 
      selectedFolderIds,
      length: selectedFolderIds.length 
    });
    
    if (!selectedMeetingForActions) {
      logger.error('No meeting selected');
      showErrorPopup('Erreur', 'Aucune réunion sélectionnée');
      return;
    }
    
    if (selectedFolderIds.length === 0) {
      logger.error('No folders selected');
      showErrorPopup('Erreur', 'Veuillez sélectionner au moins un dossier');
      return;
    }
    
    setAddingToFolders(true);
    try {
      logger.debug('Adding meeting to folders:', selectedFolderIds);
      // Ajouter à chaque dossier sélectionné
      await Promise.all(
        selectedFolderIds.map(folderId => 
          addMeetingToFolder(folderId, selectedMeetingForActions.id)
        )
      );
      logger.debug('Successfully added to folders');
      showSuccessPopup('Succès', `Réunion ajoutée à ${selectedFolderIds.length} dossier${selectedFolderIds.length > 1 ? 's' : ''}`);
      setAddToFolderDialogOpen(false);
      setSelectedFolderIds([]);
      setSelectedMeetingForActions(null);
    } catch (err) {
      logger.error('Error adding meeting to folders:', err);
      showErrorPopup('Erreur', 'Impossible d\'ajouter la réunion aux dossiers');
    } finally {
      setAddingToFolders(false);
    }
  };

  // Annuler le drag
  const cancelDrag = () => {
    // Annuler l'animation frame en cours
    if (dragMoveAnimationFrameRef.current !== null) {
      cancelAnimationFrame(dragMoveAnimationFrameRef.current);
      dragMoveAnimationFrameRef.current = null;
    }
    lastDragCheckRef.current = null;
    
    setIsDragging(false);
    setDraggingMeeting(null);
    draggingMeetingRef.current = null;
    setAvailableFolders([]);
    setHoveredFolderId(null);
    hoveredFolderIdRef.current = null;
    setDragPosition(null);
    handleMeetingLongPressEnd();
  };

  // Fermer l'overlay de détail
  const handleCloseDetailOverlay = () => {
    setMeetingDetailOverlayOpen(false);
    // Delay cleanup to allow animation
    setTimeout(() => {
      setOverlayMeeting(null);
      setFormattedTranscript(null);
      setTranscript(null);
      setIsEditingTranscript(false);
      setIsEditingSummary(false);
    }, 300);
  };

  // Charger la transcription pour l'overlay
  const handleLoadTranscriptForOverlay = async (meetingId: string) => {
    logger.debug('[Transcript] 🔄 Loading transcript for meeting:', meetingId);
    setIsLoadingTranscript(true);
    try {
      // Utiliser le même endpoint que handleViewTranscript
      const endpoint = `/simple/meetings/${meetingId}`;
      const response = await apiClient.get(endpoint) as Record<string, unknown>;

      logger.debug('[Transcript] 📥 API Response received:', {
        hasData: !!response,
        keys: response ? Object.keys(response) : [],
        hasDataProp: !!(response as any)?.data
      });

      const meetingData = (response.data || response) as Record<string, unknown>;

      logger.debug('[Transcript] 📋 Meeting data:', {
        keys: Object.keys(meetingData),
        transcript_status: meetingData.transcript_status,
        has_transcript_text: !!meetingData.transcript_text,
        transcript_text_length: typeof meetingData.transcript_text === 'string' ? meetingData.transcript_text.length : 0,
        transcript_text_preview: typeof meetingData.transcript_text === 'string' ? meetingData.transcript_text.substring(0, 100) : 'N/A'
      });

      // Chercher la transcription dans différents formats possibles
      const possibleTranscriptFields = ['transcript', 'transcription', 'transcript_text', 'transcription_text', 'content', 'text'];
      let transcriptText = null;
      let foundField = '';

      for (const field of possibleTranscriptFields) {
        if (meetingData[field]) {
          transcriptText = meetingData[field];
          foundField = field;
          logger.debug('[Transcript] ✅ Found transcript in field:', field);
          break;
        }
      }

      if (!transcriptText) {
        logger.warn('[Transcript] ⚠️ No transcript text found! Available fields:', Object.keys(meetingData));
        logger.warn('[Transcript] ⚠️ Field values:', {
          transcript: meetingData.transcript,
          transcription: meetingData.transcription,
          transcript_text: meetingData.transcript_text
        });
        setFormattedTranscript(null);
        return;
      }

      logger.debug('[Transcript] 📝 Processing transcript from field:', foundField, 'length:', String(transcriptText).length);

      setTranscript(typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText));

      // Parser la transcription
      let formattedData: Array<{speaker: string; text: string; timestamp?: string}> = [];

      if (typeof transcriptText === 'string' && transcriptText.trim().startsWith('[')) {
        try {
          formattedData = JSON.parse(transcriptText);
          logger.debug('[Transcript] Parsed as JSON array:', formattedData.length, 'entries');
        } catch {
          formattedData = parseTextTranscript(transcriptText);
          logger.debug('[Transcript] Parsed as text (JSON failed):', formattedData.length, 'entries');
        }
      } else if (Array.isArray(transcriptText)) {
        formattedData = transcriptText;
        logger.debug('[Transcript] Already an array:', formattedData.length, 'entries');
      } else {
        formattedData = parseTextTranscript(typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText));
        logger.debug('[Transcript] Parsed as plain text:', formattedData.length, 'entries');
      }

      logger.debug('[Transcript] 📊 Parsed result:', {
        count: formattedData.length,
        firstEntry: formattedData[0],
        speakers: [...new Set(formattedData.map(d => d.speaker))]
      });

      // Les noms personnalisés sont déjà dans le transcript_text (sauvegardés en BDD)
      if (formattedData.length > 0) {
        setFormattedTranscript(formattedData);
        logger.debug('[Transcript] ✅ SUCCESS: Set formattedTranscript with', formattedData.length, 'entries');
      } else {
        logger.error('[Transcript] ❌ FAILED: formattedData is empty after parsing!');
        logger.error('[Transcript] Raw transcriptText was:', typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText));
        setFormattedTranscript(null);
      }

      // Mettre à jour overlayMeeting avec les dernières données
      if (meetingData) {
        setOverlayMeeting(prev => prev ? { ...prev, ...meetingData } : prev);
      }
    } catch (err) {
      logger.error('[Transcript] ❌ Error loading transcript:', err);
      showErrorPopup('Erreur', 'Impossible de charger la transcription');
      setFormattedTranscript(null);
    } finally {
      setIsLoadingTranscript(false);
      logger.debug('[Transcript] 🏁 Loading complete');
    }
  };

  // Référence pour le polling du résumé
  const summaryPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Nettoyer le polling au démontage
  useEffect(() => {
    return () => {
      if (summaryPollingRef.current) {
        clearInterval(summaryPollingRef.current);
      }
    };
  }, []);

  // Fonction de polling pour le résumé
  const startSummaryPolling = useCallback((meetingId: string) => {
    // Arrêter tout polling existant
    if (summaryPollingRef.current) {
      clearInterval(summaryPollingRef.current);
    }

    logger.debug('🔄 Démarrage du polling pour le résumé...');
    
    // Vérifier toutes les 3 secondes
    summaryPollingRef.current = setInterval(async () => {
      try {
        logger.debug('🔍 Vérification du statut du résumé...');
        const details = await getMeetingDetails(meetingId);
        
        if (details) {
          logger.debug('📊 Statut actuel:', details.summary_status);
          logger.debug('📝 Résumé disponible:', !!details.summary_text, 'Longueur:', details.summary_text?.length || 0);
          logger.debug('📋 Template ID dans details:', details.template_id || 'AUCUN');

          // Mettre à jour l'overlay avec les nouvelles données
          // IMPORTANT: Préserver le template_id local si on l'a défini nous-mêmes
          // Le backend peut ne pas retourner le template_id ou retourner une valeur incorrecte
          setOverlayMeeting(prev => {
            if (!prev) return prev;
            // Préserver notre template_id local s'il existe, sinon utiliser celui du backend
            const preservedTemplateId = prev.template_id || details.template_id;
            logger.debug('📋 Template ID préservé:', preservedTemplateId);
            return { ...prev, ...details, template_id: preservedTemplateId };
          });

          // Mettre à jour aussi la liste des meetings (avec la même logique de préservation)
          setMeetings(prev => prev.map(m => {
            if (m.id !== meetingId) return m;
            const preservedTemplateId = m.template_id || details.template_id;
            return { ...m, ...details, template_id: preservedTemplateId };
          }));

          // Si le résumé est terminé ou en erreur, arrêter le polling
          if (details.summary_status === 'completed') {
            logger.debug('✅ Résumé généré avec succès !');
            logger.debug('📄 Contenu du résumé:', details.summary_text ? `${details.summary_text.substring(0, 100)}...` : 'VIDE');
            
            // Vérifier que le résumé est bien présent
            if (!details.summary_text) {
              logger.warn('⚠️ Résumé marqué comme completed mais summary_text est vide, continuation du polling...');
              // Continuer le polling si le texte n'est pas encore disponible
              return;
            }
            
            if (summaryPollingRef.current) {
              clearInterval(summaryPollingRef.current);
              summaryPollingRef.current = null;
            }
            setGeneratingSummaryId(null);
            // Notification de succès
            showSuccessPopup('Résumé prêt !', 'Le résumé a été généré avec succès.');
          } else if (details.summary_status === 'error') {
            logger.debug('❌ Erreur lors de la génération du résumé');
            if (summaryPollingRef.current) {
              clearInterval(summaryPollingRef.current);
              summaryPollingRef.current = null;
            }
            setGeneratingSummaryId(null);
            showErrorPopup('Erreur', 'La génération du résumé a échoué.');
          }
        }
      } catch (err) {
        logger.error('Erreur lors du polling:', err);
      }
    }, 3000); // Toutes les 3 secondes

    // Timeout de sécurité après 2 minutes
    setTimeout(() => {
      if (summaryPollingRef.current) {
        logger.debug('⏱️ Timeout du polling (2 minutes)');
        clearInterval(summaryPollingRef.current);
        summaryPollingRef.current = null;
        setGeneratingSummaryId(null);
      }
    }, 120000);
  }, [showSuccessPopup, showErrorPopup]);

  // Générer le résumé depuis l'overlay
  const handleGenerateSummaryFromOverlay = async (meetingId: string, templateId: string) => {
    try {
      setGeneratingSummaryId(meetingId);
      // IMPORTANT: passer les bons paramètres (meetingId, clientId=null, templateId, isManualCall=true)
      await generateMeetingSummary(meetingId, null, templateId, true);
      // Mettre à jour l'état local immédiatement avec le template_id utilisé
      // C'est crucial pour que l'export utilise le bon template !
      setOverlayMeeting(prev => prev ? { ...prev, summary_status: 'processing', template_id: templateId } : prev);
      // Mettre à jour aussi la liste des meetings
      setMeetings(prev => prev.map(m =>
        m.id === meetingId ? { ...m, summary_status: 'processing', template_id: templateId } : m
      ));

      // Démarrer le polling pour suivre l'avancement en temps réel
      startSummaryPolling(meetingId);
      
    } catch (err) {
      logger.error('Error generating summary:', err);
      showErrorPopup('Erreur', 'Impossible de générer le résumé');
      setGeneratingSummaryId(null);
    }
  };

  const handlePlayAudio = async (meetingId: string, title: string) => {
    try {
      // Prévenir les clics multiples
      if (audioDialogOpen) return;
      
      // Ouvrir d'abord le dialogue pour montrer un état de chargement
      setCurrentAudioTitle(title);
      setAudioDialogOpen(true);
      // Revoke previous blob URL to prevent memory leak
      if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrl);
      }
      setCurrentAudioUrl(null); // Réinitialiser l'URL précédente
      
      logger.debug(`Getting audio URL for meeting ${meetingId}`);
      
      // Récupérer l'URL de l'audio
      const audioUrl = await getMeetingAudio(meetingId);
      logger.debug(`Received audio URL: ${audioUrl.substring(0, 100)}...`);
      
      // Mettre à jour l'URL audio
      setCurrentAudioUrl(audioUrl);
    } catch (error) {
      logger.error('Error getting audio URL:', error);
      setError(`Erreur lors de la récupération de l'audio: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      // Fermer le dialogue si une erreur survient
      setAudioDialogOpen(false);
    }
  };
  
  const handleCloseAudioDialog = () => {
    setAudioDialogOpen(false);
    // Ne pas effacer l'URL ici - le composant MeetingAudioPlayer va s'en charger
    // avec son effet de nettoyage lorsque le composant sera démonté
  };

  // Fonction pour ouvrir le popup premium
  const handleOpenPremiumDialog = () => {
    setShowPremiumDialog(true);
  };

  // Fonction pour fermer le popup premium
  const handleClosePremiumDialog = () => {
    setShowPremiumDialog(false);
  };

  // Fonction pour contacter le support
  const handleContactSupport = () => {
    window.open('mailto:contact@lexiafrance.fr', '_blank');
  };

  // Fonction pour mettre à jour spécifiquement les métadonnées d'une réunion
  const handleUpdateMetadata = async (meetingId: string) => {
    try {
      setRefreshingMetadataId(meetingId);
      
      logger.debug(`Requesting metadata update for meeting ${meetingId}`);
      
      // Utiliser la nouvelle fonction qui utilise le script transcribe_direct.py
      const updatedMeeting = await updateMeetingParticipantsAndDuration(meetingId);
      
      if (!updatedMeeting) {
        logger.error(`Failed to update metadata for meeting ${meetingId}`);
        showErrorPopup('Erreur', 'Erreur lors de la mise à jour des métadonnées');
        return;
      }
      
      // Extraire les métadonnées mises à jour
      const duration = updatedMeeting.audio_duration || 
                      updatedMeeting.duration_seconds || 
                      updatedMeeting.duration || 0;
                      
      const participants = updatedMeeting.speakers_count || 
                          updatedMeeting.speakers_count || 
                          updatedMeeting.participants || 0;
      
      logger.debug(`Metadata updated: Duration=${duration}s, Participants=${participants}`);
      
      // Mettre à jour l'interface utilisateur
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.id === meetingId 
            ? {
                ...meeting,
                audio_duration: duration,
                duration: duration,
                participants: participants
              } 
            : meeting
        )
      );
      
      // Succès silencieux
    } catch (err) {
      logger.error('Failed to update metadata:', err);
      showErrorPopup('Erreur', `Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
    } finally {
      setRefreshingMetadataId(null);
    }
  };

  
  // Sélectionne le template (sans générer)
  const handleTemplateSelect = (templateId: string) => {
    if (!currentMeetingId) return;
    
    const meetingId = currentMeetingId;
    
    // Mettre à jour l'état local avec le template sélectionné
    setMeetings(prevMeetings => 
      prevMeetings.map(meeting => 
        meeting.id === meetingId 
          ? {
              ...meeting,
              selectedTemplate: templateId,
              showTemplateSelection: true // S'assurer que la sélection reste visible
            } 
          : meeting
      )
    );
    
    logger.debug(`📋 Template sélectionné pour ${meetingId}: ${templateId}`);
  };

  // Génère le résumé avec le template sélectionné - SEULE MÉTHODE AUTORISÉE
  const handleGenerateSummary = async (meetingId: string) => {
    const meeting = meetings.find(m => m.id === meetingId);
    if (!meeting) return;
    
    const templateId = selectedTemplateForGeneration;
    
    // Vérifier que la génération manuelle est autorisée
    if (!manualSummaryGenerationOnly) {
      logger.warn('🚫 Génération automatique désactivée - seules les générations manuelles sont autorisées');
      setGeneratingSummaryId(null);
      setLocalGeneratingId(null);
      return;
    }
    
    // Nettoyer tout polling précédent
    cleanupPolling();
    
    try {
      logger.debug(`🎯 [MANUAL] Generating summary for meeting ${meetingId} with template: ${templateId}`);
      
      // Mettre à jour l'interface utilisateur pour indiquer que le compte rendu est en cours de génération
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.id === meetingId 
            ? {
                ...meeting,
                summary_status: 'processing',
                showTemplateSelection: false // Cacher la sélection de template
              } 
            : meeting
        )
      );
      
      // Appeler l'API pour générer le compte rendu avec le template sélectionné - GÉNÉRATION MANUELLE
      const updatedMeeting = await generateMeetingSummary(meetingId, null, templateId, true);
      
      if (!meeting) {
        logger.error(`Failed to initiate summary generation for meeting ${meetingId}`);
        showErrorPopup('Erreur', 'Erreur lors de la génération du compte rendu');
        setGeneratingSummaryId(null);
        return;
      }
      
      logger.debug(`Summary generation initiated for meeting ${meetingId}:`, meeting);
      
      // APPROCHE AMÉLIORÉE - Polling avec nettoyage approprié
      const pollSummaryStatus = async () => {
        try {
          // Vérifier si le composant est toujours monté
          if (!isComponentMounted.current) {
            logger.debug('🛑 Component unmounted, stopping polling');
            return;
          }
          
          // Attendre 3 secondes puis vérifier le statut
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Vérifier à nouveau si le composant est toujours monté
          if (!isComponentMounted.current) {
            logger.debug('🛑 Component unmounted during wait, stopping polling');
            return;
          }
          
          // Récupérer les données mises à jour silencieusement
          logger.debug(`Polling summary status for meeting ${meetingId}`);
          const updatedMeetings = await fetchMeetings(true);
          
          // Vérifier si la génération est terminée
          const updatedMeeting = updatedMeetings.find(m => m.id === meetingId);
          
          if (updatedMeeting?.summary_status === 'completed') {
            logger.debug(`Summary completed for meeting ${meetingId}`);
            // Succès silencieux
            setGeneratingSummaryId(null);
            setLocalGeneratingId(null);
            setGeneratingSummaryInStorage(null);
            cleanupPolling();
          } else if (updatedMeeting?.summary_status === 'error') {
            logger.debug(`Summary failed for meeting ${meetingId}`);
            showErrorPopup('Erreur', 'Erreur lors de la génération du compte rendu');
            setGeneratingSummaryId(null);
            setLocalGeneratingId(null);
            setGeneratingSummaryInStorage(null);
            cleanupPolling();
          } else if (updatedMeeting?.summary_status === 'processing') {
            // Continuer le polling si toujours en cours et si le composant est monté
            if (isComponentMounted.current) {
              logger.debug(`Summary still processing for meeting ${meetingId}, continuing polling...`);
              pollTimeoutRef.current = setTimeout(pollSummaryStatus, 5000);
            }
          } else {
            // Statut inconnu, arrêter le polling
            logger.debug(`Unknown status for meeting ${meetingId}: ${updatedMeeting?.summary_status}`);
            setGeneratingSummaryId(null);
            setGeneratingSummaryInStorage(null);
            cleanupPolling();
          }
        } catch (error) {
          logger.error('Error polling summary status:', error);
          if (isComponentMounted.current) {
            setGeneratingSummaryId(null);
            setGeneratingSummaryInStorage(null);
          }
          cleanupPolling();
        }
      };
      
      // Démarrer le polling + watcher API pour basculer automatiquement à "Voir résumé"
      pollSummaryStatus();
      try {
        if (summaryWatchersRef.current[meetingId]) {
          summaryWatchersRef.current[meetingId]!();
        }
        const stop = watchSummaryStatus(meetingId, (status, updated) => {
          if (!isComponentMounted.current) return;
          setMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, ...updated } : m)));
          if (status === 'completed' || status === 'error') {
            setGeneratingSummaryId(null);
            setGeneratingSummaryInStorage(null);
            if (summaryWatchersRef.current[meetingId]) delete summaryWatchersRef.current[meetingId];
          }
        });
        summaryWatchersRef.current[meetingId] = stop;
      } catch (e) {
        logger.warn('Could not start summary watcher:', e);
      }
      
    } catch (err) {
      logger.error('Failed to generate summary:', err);
      showErrorPopup('Erreur', `Erreur: ${err instanceof Error ? err.message : 'Erreur inconnue'}`);
      setGeneratingSummaryId(null);
      cleanupPolling();
      
      // Réinitialiser le statut en cas d'erreur
      setMeetings(prevMeetings => 
        prevMeetings.map(meeting => 
          meeting.id === meetingId 
            ? {
                ...meeting,
                summary_status: 'error'
              } 
            : meeting
        )
      );
    }
  };

  // Fonctions pour l'édition inline du nom des réunions
  const handleStartEditingName = (meetingId: string, currentName: string) => {
    setEditingMeetingId(meetingId);
    setEditingMeetingName(currentName || '');
  };

  const handleCancelEditingName = () => {
    setEditingMeetingId(null);
    setEditingMeetingName('');
  };

  const handleSaveMeetingName = async (meetingId: string) => {
    if (!editingMeetingName.trim()) {
      showErrorPopup('Erreur', 'Le nom de la réunion ne peut pas être vide');
      return;
    }

    const newName = editingMeetingName.trim();
    
    logger.debug('🔄 Mise à jour du nom de la réunion:', { meetingId, newName });
    
    // Mettre à jour immédiatement l'affichage avec un état dédié
    setUpdatedMeetingNames(prev => {
      const updated = { ...prev, [meetingId]: newName };
      logger.debug('📝 Noms mis à jour:', updated);
      return updated;
    });
    
    // Mettre à jour aussi l'état principal des réunions
    setMeetings(prevMeetings => {
      logger.debug('📋 État précédent des réunions:', prevMeetings.map(m => ({ id: m.id, title: m.title, name: m.name })));
      
      const updatedMeetings = prevMeetings.map(meeting => 
        meeting.id === meetingId 
          ? { 
              ...meeting, 
              title: newName,
              name: newName
            }
          : meeting
      );
      
      logger.debug('✅ État mis à jour des réunions:', updatedMeetings.map(m => ({ id: m.id, title: m.title, name: m.name })));
      return updatedMeetings;
    });
    
    // Forcer un re-render immédiat
    setForceRender(prev => {
      logger.debug('🔄 Force render:', prev + 1);
      return prev + 1;
    });
    
    // Fermer le mode édition immédiatement
    handleCancelEditingName();

    try {
      // Appeler l'API pour mettre à jour le nom de la réunion en arrière-plan
      const response = await apiClient.put(`/simple/meetings/${meetingId}`, {
        title: newName
      });

      // Mise à jour silencieuse (pas de popup)
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du nom de la réunion:', error);
      
      // En cas d'erreur, restaurer l'ancien nom
      const originalMeeting = meetings.find(m => m.id === meetingId);
      if (originalMeeting) {
        setMeetings(prevMeetings => 
          prevMeetings.map(meeting => 
            meeting.id === meetingId 
              ? { 
                  ...meeting, 
                  title: originalMeeting.title || originalMeeting.name,
                  name: originalMeeting.name || originalMeeting.title
                }
              : meeting
          )
        );
      }
      
      showErrorPopup('Erreur', 'Impossible de mettre à jour le nom de la réunion');
    }
  };

  // Version directe pour l'overlay (sans état d'édition)
  const handleSaveMeetingNameDirect = async (meetingId: string, newName: string) => {
    if (!newName.trim()) {
      throw new Error('Le nom de la réunion ne peut pas être vide');
    }

    const trimmedName = newName.trim();
    
    // Mettre à jour immédiatement l'affichage
    setUpdatedMeetingNames(prev => ({ ...prev, [meetingId]: trimmedName }));
    
    setMeetings(prevMeetings => 
      prevMeetings.map(meeting => 
        meeting.id === meetingId 
          ? { ...meeting, title: trimmedName, name: trimmedName }
          : meeting
      )
    );

    // Appeler l'API
    await apiClient.put(`/simple/meetings/${meetingId}`, { title: trimmedName });
  };

  // Fonction pour afficher le compte rendu sans le régénérer
  const handleViewSummary = async (meetingId: string) => {
    const isOwnMeeting = meetings.some(m => m.id === meetingId);
    const isSharedWithMe = sharedMeetings.some(m => m.id === meetingId);
    const belongsToOrganization = organizationMeetingsFlat.some(m => m.id === meetingId);

    if (isOwnMeeting || isSharedWithMe) {
    try {
      // Récupérer la version la plus récente de la réunion avant d'afficher
      const updated = await getMeetingDetails(meetingId);
      setMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, ...updated } : m)));
        setSharedMeetings(prev => prev.map(m => (m.id === meetingId ? { ...m, ...updated } : m)));

        if (belongsToOrganization) {
          setOrganizationMeetingsByOrg(prev => {
            const next: Record<string, Meeting[]> = {};
            Object.entries(prev).forEach(([orgId, meetings]) => {
              next[orgId] = meetings.map(meeting => (
                meeting.id === meetingId ? { ...meeting, ...updated } : meeting
              ));
            });
            return next;
          });
          setFilteredOrganizationMeetingsByOrg(prev => {
            const next: Record<string, Meeting[]> = {};
            Object.entries(prev).forEach(([orgId, meetings]) => {
              next[orgId] = meetings.map(meeting => (
                meeting.id === meetingId ? { ...meeting, ...updated } : meeting
              ));
            });
            return next;
          });
          setOrganizationMeetingsFlat(prev => prev.map(meeting => (
            meeting.id === meetingId ? { ...meeting, ...updated } : meeting
          )));
        }
    } catch (e) {
      logger.warn('Could not refresh meeting before opening summary:', e);
    }
    }

    // Ouvrir le dialogue du résumé quoi qu'il arrive; le renderer gère l'absence de texte
    logger.debug('Opening summary dialog for meeting:', meetingId);
    setViewingSummaryId(meetingId);
  };

  // Fonction pour fermer le dialogue de summary avec un délai
  const handleCloseSummary = () => {
    // Fermer le dialogue simplement
    setViewingSummaryId(null);
  };

  const renderSummary = () => {
    // Utiliser viewingSummaryId qui est l'ID utilisé pour ouvrir le modal de résumé
    // Chercher dans mes réunions, les réunions partagées avec moi ET les réunions d'organisation
    const meeting = meetings.find(m => m.id === viewingSummaryId) || 
                    sharedMeetings.find(m => m.id === viewingSummaryId) ||
                    organizationMeetingsFlat.find(m => m.id === viewingSummaryId);
    if (!meeting) return null;

    // Le résumé n'est pas en cours de chargement quand on le visualise (seulement pendant la génération)
    const isLoading = false;
    const summaryText = meeting.summary_text ?? null;
    
    return <MeetingSummaryRenderer summaryText={summaryText} isLoading={isLoading} />;
  };

  // Fonctions pour la gestion des speakers
  const getUniqueSpeakers = (transcript: Array<{speaker: string; text: string; timestamp?: string}>): string[] => {
    const speakers = new Set(transcript.map(u => u.speaker));
    return Array.from(speakers);
  };

  // Fonction pour récupérer l'ID original d'un speaker à partir de son nom affiché
  // Utilise l'API (meeting_speakers table) au lieu du localStorage
  const getOriginalSpeakerId = async (meetingId: string, displayName: string): Promise<string> => {
    try {
      const speakers = await getSpeakers(meetingId);
      // Chercher un speaker dont le custom_name correspond au displayName
      const found = speakers.find(s => s.name === displayName);
      if (found) return found.id;
    } catch (e) {
      logger.error('Error fetching speakers for ID resolution:', e);
    }
    // Si pas trouvé, retourner le displayName tel quel (c'est probablement l'ID original)
    return displayName;
  };

  const handleSaveSpeakerName = async (currentDisplayName: string, newName: string) => {
    if (!selectedMeeting || !newName.trim()) return;

    // Mettre à jour l'affichage immédiatement (optimiste)
    let updatedText = '';
    if (formattedTranscript) {
      const updatedTranscript = formattedTranscript.map(utterance => ({
        ...utterance,
        speaker: utterance.speaker === currentDisplayName ? newName.trim() : utterance.speaker
      }));

      setFormattedTranscript(updatedTranscript);
      updatedText = updatedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');
    }

    setEditingSpeaker(null);
    setEditingName('');

    try {
      // Récupérer l'ID original du speaker via l'API
      const originalSpeakerId = await getOriginalSpeakerId(selectedMeeting.id, currentDisplayName);

      logger.debug(`Renaming speaker: ${currentDisplayName} -> ${newName.trim()} (originalId: ${originalSpeakerId})`);

      // Sauvegarder le nom personnalisé via l'API
      await updateSpeakerName(selectedMeeting.id, originalSpeakerId, newName.trim());

      // Sauvegarder le transcript_text directement en BDD (préserve les modifications utilisateur)
      if (updatedText) {
        await updateMeetingTranscriptText(selectedMeeting.id, updatedText);
      }

    } catch (error) {
      logger.error('Error updating speaker name:', error);
      logger.warn('API update failed, but UI was updated optimistically');
    }
  };

  const handleResetSpeakerName = async (speakerId: string) => {
    // Fonction désactivée - reset supprimé
    return;
  };

  const handleUpdateTranscript = async () => {
    if (!selectedMeeting) return;

    try {
      // Recharger la transcription pour s'assurer que tout est synchronisé
      await handleViewTranscript(selectedMeeting.id);
    } catch (error) {
      logger.error('Error updating transcript:', error);
      showErrorPopup('Erreur', 'Erreur lors de la mise à jour de la transcription');
    }
  };

  const startEditingSpeaker = (speakerId: string) => {
    setEditingSpeaker(speakerId);
    setEditingName(speakerId);
  };

  const cancelEditing = () => {
    setEditingSpeaker(null);
    setEditingName('');
  };

  // Missing function implementations
  const handleRetryTranscription = async (meetingId: string) => {
    try {
      setRetryingMeetingId(meetingId);
      // Implementation for retrying transcription
      await fetchMeetings();
      // Succès silencieux
    } catch (error) {
      logger.error('Error retrying transcription:', error);
      showErrorPopup('Error', 'Failed to retry transcription');
    } finally {
      setRetryingMeetingId(null);
    }
  };

  const confirmDeleteMeeting = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
    setDeleteConfirmOpen(true);
  };

  const sortContactsByInteraction = useCallback((list: Contact[]) => {
    return [...list].sort((a, b) => {
      const dateA = a.last_interaction_at ? new Date(a.last_interaction_at).getTime() : 0;
      const dateB = b.last_interaction_at ? new Date(b.last_interaction_at).getTime() : 0;
      return dateB - dateA;
    });
  }, []);

  const cancelDeleteMeeting = () => {
    setMeetingToDelete(null);
    setDeleteConfirmOpen(false);
  };

  // Gestion du menu d'actions rapides
  const handleOpenActionsMenu = (event: React.MouseEvent<HTMLElement>, meeting: Meeting) => {
    event.stopPropagation();
    setActionsMenuAnchor(event.currentTarget);
    setSelectedMeetingForActions(meeting);
  };

  const handleCloseActionsMenu = () => {
    setActionsMenuAnchor(null);
    setSelectedMeetingForActions(null);
  };

  const handleRegenerateSummary = async () => {
    if (!selectedMeetingForActions) return;
    
    handleCloseActionsMenu();
    
    // Ouvrir le sélecteur de template pour la régénération
    setCurrentMeetingId(selectedMeetingForActions.id);
    setTemplateSelectorOpen(true);
  };

  const handleShareMeeting = async () => {
    // Fermer seulement le menu, GARDER selectedMeetingForActions pour le partage
    setActionsMenuAnchor(null);
    
    // Vérifier si le résumé a été généré avant de permettre le partage
    if (selectedMeetingForActions) {
      // Vérifier correctement : summary_status doit être 'completed' OU summary_text doit exister et ne pas être vide
      const summaryStatus = selectedMeetingForActions.summary_status || selectedMeetingForActions.summary?.status;
      const summaryText = selectedMeetingForActions.summary_text;
      
      // Le résumé est considéré comme généré si :
      // 1. Le statut est 'completed', OU
      // 2. Le texte existe et n'est pas vide (même si le statut n'est pas encore mis à jour)
      const hasSummary = summaryStatus === 'completed' || 
                         (summaryText && summaryText.trim().length > 0);
      
      if (!hasSummary) {
        // Afficher une alerte d'erreur
        showErrorPopup('Partage impossible', 'Le résumé de cette réunion n\'a pas encore été généré. Veuillez d\'abord générer le résumé avant de partager.');
        return;
      }
    }
    
    setShareDialogOpen(true);
    setShareIdInput('');
    setVerifiedUser(null);
    setSelectedContactIdsForShare([]);
    setManualShareTargets([]);
    setSelectedOrganizationIdsForShare([]);
    
    // Charger l'historique des partages pour cette réunion
    if (selectedMeetingForActions) {
      setLoadingMeetingShares(true);
      try {
        const shares = await getMeetingShares(selectedMeetingForActions.id);
        setMeetingShares(shares);
      } catch (error) {
        logger.error('Erreur lors du chargement des partages:', error);
        setMeetingShares([]);
      } finally {
        setLoadingMeetingShares(false);
      }
    }
    setShareValidationError(null);
    setIncludeTranscript(false);
    
    // Charger les contacts depuis le store
    try {
      setLoadingContacts(true);
      logger.debug('📋 [MyMeetings] Début chargement des contacts...');
      const fetchedContacts = await getMyContacts();
      logger.debug('✅ [MyMeetings] Contacts reçus:', fetchedContacts);
      logger.debug('✅ [MyMeetings] Type:', typeof fetchedContacts, 'IsArray:', Array.isArray(fetchedContacts));
      logger.debug('✅ [MyMeetings] Nombre de contacts:', fetchedContacts?.length || 0);
      setContacts(sortContactsByInteraction(fetchedContacts));
    } catch (error: any) {
      logger.error('❌ [MyMeetings] Erreur lors du chargement des contacts:', error);
      logger.error('❌ [MyMeetings] Error response:', error?.response);
      logger.error('❌ [MyMeetings] Error data:', error?.response?.data);
      setContacts([]);
    } finally {
      setLoadingContacts(false);
      logger.debug('🏁 [MyMeetings] Fin chargement des contacts');
    }

    if (!organizations.length) {
      try {
        await fetchUserOrganizations();
      } catch (error) {
        logger.error('❌ [MyMeetings] Impossible de rafraîchir les organisations avant le partage:', error);
      }
    }
  };

  const handleCloseShareDialog = () => {
    setShareDialogOpen(false);
    setShareIdInput('');
    setVerifiedUser(null);
    setSelectedContactIdsForShare([]);
    setManualShareTargets([]);
    setSelectedOrganizationIdsForShare([]);
    setShareValidationError(null);
    setIncludeTranscript(false);
    setShareRole('reader'); // Réinitialiser le rôle par défaut
    setMeetingShares([]); // Réinitialiser l'historique des partages
    setSelectedMeetingForActions(null); // Réinitialiser seulement à la fermeture du dialog
    setRecipientSearchQuery(''); // Réinitialiser la recherche
    // Réinitialiser les états de création de groupe
    setShowCreateGroup(false);
    setNewGroupName('');
    setSelectedContactsForGroup([]);
  };

  // Vérifier le share_id en temps réel avec debounce
  useEffect(() => {
    if (shareIdInput.length === 6) {
      const timeoutId = setTimeout(async () => {
        try {
          setVerifyingShareId(true);
          const response = await verifyShareId(shareIdInput);
          if (response.exists && response.user_name && response.user_id) {
            setVerifiedUser({ name: response.user_name, id: response.user_id });
          } else {
            setVerifiedUser(null);
          }
        } catch (error) {
          logger.error('Erreur lors de la vérification du share_id:', error);
          setVerifiedUser(null);
        } finally {
          setVerifyingShareId(false);
        }
      }, 500);

      return () => clearTimeout(timeoutId);
    } else {
      setVerifiedUser(null);
    }
  }, [shareIdInput]);

  useEffect(() => {
    setShareValidationError(null);
  }, [shareIdInput]);

  const toggleContactForShare = (contact: Contact) => {
    const contactKey = contact.contact_user_id || contact.id;
    if (!contactKey) {
      return;
    }

    const isAlreadySelected = selectedContactIdsForShare.includes(contactKey);

    setSelectedContactIdsForShare((prev) =>
      isAlreadySelected ? prev.filter((id) => id !== contactKey) : [...prev, contactKey]
    );

    if (!isAlreadySelected) {
      const normalizedShareId = contact.contact_share_id?.toUpperCase();
      if (normalizedShareId) {
        setManualShareTargets((prev) => prev.filter((target) => target.shareId !== normalizedShareId));
      }
    }

    setShareValidationError(null);
  };

  const handleAddManualShareTarget = () => {
    const normalizedShareId = shareIdInput.trim().toUpperCase();

    if (normalizedShareId.length !== 6) {
      setShareValidationError("L'ID de partage doit contenir 6 caractères.");
      return;
    }

    if (!verifiedUser) {
      setShareValidationError("Impossible de vérifier cet ID de partage.");
      return;
    }

    if (
      manualShareTargets.some((target) => target.shareId === normalizedShareId) ||
      contacts.some(
        (contact) =>
          (contact.contact_user_id || contact.id) &&
          selectedContactIdsForShare.includes(contact.contact_user_id || contact.id) &&
          contact.contact_share_id?.toUpperCase() === normalizedShareId
      )
    ) {
      setShareValidationError('Cet ID de partage est déjà sélectionné.');
      return;
    }

    setManualShareTargets((prev) => [
      ...prev,
      {
        shareId: normalizedShareId,
        userId: verifiedUser.id,
        name: verifiedUser.name,
      },
    ]);
    setShareIdInput('');
    setVerifiedUser(null);
    setShareValidationError(null);
  };

  const handleRemoveManualShareTarget = (shareId: string) => {
    setManualShareTargets((prev) => prev.filter((target) => target.shareId !== shareId));
  };

  const toggleOrganizationForShare = (organizationId: string) => {
    setSelectedOrganizationIdsForShare((prev) =>
      prev.includes(organizationId) ? prev.filter((id) => id !== organizationId) : [...prev, organizationId]
    );
    setShareValidationError(null);
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      showErrorPopup('Erreur', 'Veuillez entrer un nom pour le groupe');
      return;
    }

    if (selectedContactsForGroup.length === 0) {
      showErrorPopup('Erreur', 'Veuillez sélectionner au moins une personne pour créer le groupe. Un groupe doit contenir plusieurs personnes.');
      return;
    }

    try {
      setCreatingGroup(true);
      
      // Créer l'organisation
      const formData = new FormData();
      formData.append('name', newGroupName.trim());
      formData.append('description', `Groupe créé lors du partage de réunion`);
      
      const newOrganization = await createMyOrganization(formData);
      
      // Ajouter les membres sélectionnés à l'organisation
      const addMemberPromises = selectedContactsForGroup.map(contactId => 
        addMemberToMyOrganization(newOrganization.id, contactId)
      );
      
      await Promise.all(addMemberPromises);
      
      // Rafraîchir la liste des organisations pour avoir les données à jour (compteur de membres correct)
      try {
        const refreshedOrganizations = await getMyOrganizations();
        setOrganizations(refreshedOrganizations);
        
        // Trouver l'organisation créée dans la liste rafraîchie
        const refreshedOrg = refreshedOrganizations.find(org => org.id === newOrganization.id);
        if (refreshedOrg) {
          // Sélectionner automatiquement le nouveau groupe
          setSelectedOrganizationIdsForShare(prev => [...prev, refreshedOrg.id]);
        } else {
          // Fallback : utiliser l'ID de l'organisation créée
          setSelectedOrganizationIdsForShare(prev => [...prev, newOrganization.id]);
        }
      } catch (error) {
        logger.error('⚠️ Erreur lors du rafraîchissement des organisations (non bloquant):', error);
        // Fallback : mettre à jour le compteur localement
        const updatedOrganization = {
          ...newOrganization,
          member_count: (newOrganization.member_count || 1) + selectedContactsForGroup.length
        };
        setOrganizations(prev => [...prev, updatedOrganization]);
        setSelectedOrganizationIdsForShare(prev => [...prev, newOrganization.id]);
      }
      
      // Réinitialiser les états de création
      setShowCreateGroup(false);
      setNewGroupName('');
      setSelectedContactsForGroup([]);
      
      showSuccessPopup('Succès', `Groupe "${newGroupName}" créé avec succès`);
    } catch (error: any) {
      logger.error('❌ Erreur lors de la création du groupe:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Impossible de créer le groupe';
      showErrorPopup('Erreur', errorMessage);
    } finally {
      setCreatingGroup(false);
    }
  };

  const toggleContactForGroup = (contact: Contact) => {
    const contactKey = contact.contact_user_id || contact.id;
    if (!contactKey) return;
    
    setSelectedContactsForGroup(prev => 
      prev.includes(contactKey)
        ? prev.filter(id => id !== contactKey)
        : [...prev, contactKey]
    );
  };

  const handleConfirmShare = async () => {
    if (!selectedMeetingForActions) {
      showErrorPopup('Erreur', 'Aucune réunion sélectionnée');
      return;
    }
    
    const meetingId = selectedMeetingForActions.id;

    // Helper function to check if a contact is already shared with (by user_id or share_id)
    const isAlreadySharedWith = (contact: Contact) => {
      const contactKey = contact.contact_user_id || contact.id;
      return meetingShares.some(s => 
        s.is_active && (
          String(s.shared_with_user_id).toLowerCase() === String(contactKey).toLowerCase() ||
          s.shared_with_share_id?.toLowerCase() === contact.contact_share_id?.toLowerCase()
        )
      );
    };

    const recipientsMap = new Map<string, ManualShareTarget>();

    contacts.forEach((contact) => {
      const contactKey = contact.contact_user_id || contact.id;
      if (!contactKey || !selectedContactIdsForShare.includes(contactKey)) {
      return;
    }
      // Skip contacts already shared with
      if (isAlreadySharedWith(contact)) {
        return;
      }
      const normalizedShareId = contact.contact_share_id?.toUpperCase();
      if (!normalizedShareId) {
        return;
      }
      recipientsMap.set(normalizedShareId, {
        shareId: normalizedShareId,
        userId: contact.contact_user_id,
        name: contact.contact_name,
      });
    });

    manualShareTargets.forEach((target) => {
      // Skip if already shared with this user
      const alreadyShared = meetingShares.some(s => 
        s.is_active && (
          String(s.shared_with_user_id).toLowerCase() === String(target.userId).toLowerCase() ||
          s.shared_with_share_id?.toUpperCase() === target.shareId.toUpperCase()
        )
      );
      if (alreadyShared) return;
      
      const normalizedShareId = target.shareId.toUpperCase();
      recipientsMap.set(normalizedShareId, {
        shareId: normalizedShareId,
        userId: target.userId,
        name: target.name,
      });
    });

    if (recipientsMap.size === 0 && selectedOrganizationIdsForShare.length === 0) {
      setShareValidationError('Sélectionnez au moins une personne ou un groupe.');
      return;
    }

    if (selectedOrganizationIdsForShare.length > 0 && !canShareWithOrganizations) {
      showErrorPopup('Résumé requis', 'Vous devez générer le résumé avant de partager avec un groupe.');
      return;
    }

    try {
      setSharingMeeting(true);
      setShareValidationError(null);

      // Utiliser le nouveau système de rôles
      const contactSuccess: ManualShareTarget[] = [];
      const contactFailures: { target: ManualShareTarget; error: unknown }[] = [];

      for (const recipient of recipientsMap.values()) {
        try {
          await shareMeeting(meetingId, recipient.shareId, shareRole, includeTranscript);
          contactSuccess.push(recipient);
        } catch (error) {
          logger.error('❌ Erreur lors du partage avec', recipient.shareId, error);
          contactFailures.push({ target: recipient, error });
        }
      }

      const organizationSuccess: string[] = [];
      const organizationFailures: { id: string; error: unknown }[] = [];

      // Pour les organisations, on utilise les permissions legacy pour l'instant
      const permissionsPayload = {
        can_view: true,
        can_export: true,
        include_transcript: includeTranscript,
        role: shareRole,
        can_edit: shareRole === 'editor',
        can_share: shareRole === 'editor',
        can_regenerate: false,
      };

      for (const orgId of selectedOrganizationIdsForShare) {
        try {
          await shareMeetingWithOrganization(meetingId, orgId, permissionsPayload);
          organizationSuccess.push(orgId);
        } catch (error) {
          logger.error('❌ Erreur lors du partage avec organisation', orgId, error);
          organizationFailures.push({ id: orgId, error });
        }
      }

      if (contactSuccess.length || organizationSuccess.length) {
        const totalSuccess = contactSuccess.length + organizationSuccess.length;
        showSuccessPopup(
          'Succès',
          `Réunion partagée avec ${totalSuccess} destinataire${totalSuccess > 1 ? 's' : ''}.`
        );
      }

      if (contactFailures.length || organizationFailures.length) {
        const errorLabels = [
          ...contactFailures.map(({ target }) => target.name ?? target.shareId),
          ...organizationFailures.map(
            ({ id }) => organizations.find((org) => org.id === id)?.name ?? id
          ),
        ].filter(Boolean);

        const message =
          errorLabels.length > 0
            ? `Certaines partages ont échoué : ${errorLabels.join(', ')}`
            : 'Certaines partages ont échoué.';

        showErrorPopup('Erreur partielle', message);
      }

      if (contactSuccess.length) {
        try {
        const updatedContacts = await getMyContacts();
        setContacts(sortContactsByInteraction(updatedContacts));
      } catch (contactError) {
        logger.error('⚠️ Erreur lors du rafraîchissement des contacts (non bloquant):', contactError);
      }
      }

      if (organizationSuccess.length) {
        try {
          const targetOrganizations = organizations.filter((org) =>
            organizationSuccess.includes(org.id)
          );
          await fetchOrganizationMeetingsData(targetOrganizations);
        } catch (orgError) {
          logger.error('⚠️ Erreur lors du rafraîchissement des réunions d’organisation:', orgError);
        }
      }

      if (typeof window !== 'undefined' && (contactSuccess.length || organizationSuccess.length)) {
        const detailRecipients = [
          ...contactSuccess.map((recipient) => ({
            type: 'contact' as const,
            shareId: recipient.shareId,
            userId: recipient.userId,
            name: recipient.name,
            includeTranscript,
          })),
          ...organizationSuccess.map((orgId) => ({
            type: 'organization' as const,
            organizationId: orgId,
            name: organizations.find((org) => org.id === orgId)?.name,
            includeTranscript,
          })),
        ];

        window.dispatchEvent(
          new CustomEvent('meeting-shared', {
            detail: {
              meetingId,
              timestamp: new Date().toISOString(),
              direction: 'outgoing',
              recipients: detailRecipients,
            },
          })
        );
      }

      if (contactSuccess.length || organizationSuccess.length) {
      handleCloseShareDialog();
      }
    } catch (error: any) {
      logger.error('❌ Erreur lors du partage:', error);
      
      let errorMessage = 'Impossible de partager la réunion';
      
      if (error?.detail) {
        errorMessage = error.detail;
      } else if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      showErrorPopup('Erreur', errorMessage);
    } finally {
      setSharingMeeting(false);
    }
  };

  const handleDeleteFromMenu = () => {
    if (!selectedMeetingForActions) return;
    confirmDeleteMeeting(selectedMeetingForActions);
    handleCloseActionsMenu();
  };

  const handleDeleteMeeting = async () => {
    if (!meetingToDelete) return;
    
    const meetingId = meetingToDelete.id;
    const wasShared = meetingToDelete.is_shared;
    
    try {
      setIsDeleting(true);
      
      if (wasShared) {
        // Pour les réunions partagées : retirer de l'espace
        // Supprimer IMMÉDIATEMENT de TOUS les états locaux pour une animation instantanée
        setSharedMeetings(prev => prev.filter(m => m.id !== meetingId));
        setFilteredSharedMeetings(prev => prev.filter(m => m.id !== meetingId));
        
        // Fermer le dialog immédiatement pour un feedback instantané
        setDeleteConfirmOpen(false);
        setMeetingToDelete(null);
        
        // Appeler l'API en arrière-plan (sans attendre)
        removeSharedMeetingFromMySpace(meetingId).catch(error => {
          logger.error('Error removing shared meeting:', error);
          // En cas d'erreur silencieuse, on ne fait rien car l'UI est déjà mise à jour
        });
      } else {
        // Pour les réunions normales : suppression complète
        await deleteMeeting(meetingId);
      // Forcer un rafraîchissement complet en invalidant le cache
      await invalidateCacheAndRefresh();
      }
    } catch (error) {
      logger.error('Error deleting meeting:', error);
      showErrorPopup('Erreur', 'Impossible de supprimer la réunion');
      // En cas d'erreur, rafraîchir pour restaurer l'état
      if (wasShared) {
        const updatedShared = await getSharedMeetings();
        setSharedMeetings(updatedShared);
        setFilteredSharedMeetings(updatedShared);
      }
    } finally {
      setIsDeleting(false);
      if (!wasShared) {
      setDeleteConfirmOpen(false);
      setMeetingToDelete(null);
      }
    }
  };

  // Fonctions pour l'édition du transcript
  const startEditingTranscript = () => {
    if (transcript) {
      setEditedTranscriptText(transcript);
      setIsEditingTranscript(true);
    }
  };

  // Fonctions pour l'édition du résumé
  const startEditingSummary = () => {
    // Supporter à la fois le dialog classique et l'overlay
    const meeting = overlayMeeting || meetings.find(m => m.id === viewingSummaryId);
    if (meeting?.summary_text) {
      setEditedSummaryText(meeting.summary_text);
      setIsEditingSummary(true);
    }
  };

  const cancelEditingSummary = () => {
    setIsEditingSummary(false);
    setEditedSummaryText('');
  };

  const saveSummaryChanges = async () => {
    // Supporter à la fois le dialog classique et l'overlay
    const meeting = overlayMeeting || meetings.find(m => m.id === viewingSummaryId);
    
    if (!meeting || !editedSummaryText.trim()) {
      showErrorPopup('Erreur', 'Le texte du résumé ne peut pas être vide');
      return;
    }

    try {
      setIsSavingSummary(true);
      
      // Mettre à jour le résumé sur le serveur
      await updateMeetingSummaryText(meeting.id, editedSummaryText);
      
      // Mettre à jour l'état local des réunions
      setMeetings(prevMeetings =>
        prevMeetings.map(m =>
          m.id === meeting.id 
            ? { ...m, summary_text: editedSummaryText }
            : m
        )
      );
      
      // Mettre à jour aussi l'overlay si actif
      if (overlayMeeting?.id === meeting.id) {
        setOverlayMeeting(prev => prev ? { ...prev, summary_text: editedSummaryText } : prev);
      }
      
      // Désactiver le mode édition
      setIsEditingSummary(false);
      setEditedSummaryText('');
      
      showSuccessPopup('Succès', 'Le résumé a été mis à jour avec succès');
    } catch (error) {
      logger.error('Error saving summary:', error);
      showErrorPopup('Erreur', 'Impossible de sauvegarder le résumé. Veuillez réessayer.');
    } finally {
      setIsSavingSummary(false);
    }
  };

  const cancelEditingTranscript = () => {
    setIsEditingTranscript(false);
    setEditedTranscriptText('');
  };

  const saveTranscriptChanges = async (textToSave?: string) => {
    // Supporter à la fois le dialog classique et l'overlay
    const meeting = overlayMeeting || selectedMeeting;

    // Utiliser le texte passé en paramètre ou le state editedTranscriptText
    const textToUpdate = textToSave || editedTranscriptText;

    if (!meeting || !textToUpdate.trim()) {
      showErrorPopup('Erreur', 'Le texte de transcription ne peut pas être vide');
      return;
    }

    setIsSavingTranscript(true);
    try {
      // Mettre à jour le transcript sur le serveur
      await updateMeetingTranscriptText(meeting.id, textToUpdate);

      // Mettre à jour l'état local
      setTranscript(textToUpdate);

      // Re-parser le transcript formaté avec le nouveau texte
      const newFormattedTranscript = parseTextTranscript(textToUpdate);
      setFormattedTranscript(newFormattedTranscript);

      // Mettre à jour la liste des meetings
      setMeetings(prevMeetings =>
        prevMeetings.map(m =>
          m.id === meeting.id
            ? { ...m, transcript_text: textToUpdate }
            : m
        )
      );

      // Mettre à jour aussi l'overlay si actif
      if (overlayMeeting?.id === meeting.id) {
        setOverlayMeeting(prev => prev ? { ...prev, transcript_text: textToUpdate } : prev);
      }

      // Sortir du mode édition seulement si on n'a pas passé de texte en paramètre
      // (mode édition classique vs ajout/suppression inline)
      if (!textToSave) {
        setIsEditingTranscript(false);
        setEditedTranscriptText('');
      }

      // Succès silencieux
    } catch (error) {
      logger.error('Error updating transcript:', error);
      showErrorPopup('Erreur', 'Impossible de mettre à jour la transcription');
    } finally {
      setIsSavingTranscript(false);
    }
  };

  // Fonction de débogage temporaire pour diagnostiquer les problèmes de statut
  const handleDebugSummaryStatus = async (meetingId: string) => {
    logger.debug(`🔧 [DEBUG] Manual status check for meeting ${meetingId}`);
    try {
      const meeting = await getMeetingDetails(meetingId);
      logger.debug(`🔧 [DEBUG] Meeting details:`, {
        id: meeting.id,
        title: meeting.title,
        summary_status: meeting.summary_status,
        hasText: !!meeting.summary_text,
        textLength: meeting.summary_text?.length || 0,
        created_at: meeting.created_at,
        transcript_status: meeting.transcript_status
      });
      
      // Forcer une mise à jour de l'état local
      setMeetings(prevMeetings => 
        prevMeetings.map(m => 
          m.id === meetingId 
            ? { ...m, ...meeting }
            : m
        )
      );
      
      showSuccessPopup('Debug', `Statut: ${meeting.summary_status || 'undefined'}, Texte: ${meeting.summary_text ? 'présent' : 'absent'}`);
    } catch (error) {
      logger.error(`🔧 [DEBUG] Error checking meeting details:`, error);
      showErrorPopup('Debug Error', `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  // Fonction pour forcer la résolution d'un statut "processing" bloqué
  const handleForceResolveSummary = async (meetingId: string) => {
    logger.debug(`🔧 [DEBUG] Force resolving summary for meeting ${meetingId}`);
    try {
      // Réinitialiser l'état de génération
      setGeneratingSummaryId(null);
      
      // Essayer de récupérer le résumé depuis le serveur
      const meeting = await getMeetingDetails(meetingId);
      
      // Mettre à jour l'état local
      setMeetings(prevMeetings => 
        prevMeetings.map(m => 
          m.id === meetingId 
            ? { ...m, ...meeting }
            : m
        )
      );
      
      if (meeting.summary_status === 'completed' && meeting.summary_text) {
        // Succès silencieux
      } else if (meeting.summary_status === 'error') {
        showErrorPopup('Erreur', 'La génération du résumé a échoué sur le serveur');
      } else {
        // Forcer le statut à 'error' pour permettre une nouvelle tentative
        setMeetings(prevMeetings => 
          prevMeetings.map(m => 
            m.id === meetingId 
              ? { ...m, summary_status: 'error' }
              : m
          )
        );
        showErrorPopup('Réinitialisé', 'Statut réinitialisé. Vous pouvez réessayer de générer le résumé.');
      }
    } catch (error) {
      logger.error(`🔧 [DEBUG] Error force resolving summary:`, error);
      showErrorPopup('Erreur', `Erreur lors de la résolution: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  // Fonction pour détecter les résumés en cours au montage
  const checkForOngoingSummaries = useCallback(async () => {
    // PROTECTION: Seules les générations manuelles sont autorisées
    if (!manualSummaryGenerationOnly) {
      logger.debug('🚫 [PROTECTION] Génération automatique désactivée - checkForOngoingSummaries ignoré');
      return;
    }
    
    const storedGeneratingId = getGeneratingSummaryFromStorage();
    if (storedGeneratingId && meetings.length > 0) {
      const meeting = meetings.find(m => m.id === storedGeneratingId);
      if (meeting?.summary_status === 'processing') {
        logger.debug(`📋 [MANUAL] Resuming summary generation polling for meeting ${storedGeneratingId}`);
        setGeneratingSummaryId(storedGeneratingId);
        // Redémarrer le polling pour cette réunion
        setTimeout(() => {
          if (isComponentMounted.current) {
            handleResumePolling(storedGeneratingId);
          }
        }, 1000);
      } else {
        // Nettoyer le localStorage si la génération n'est plus en cours
        setGeneratingSummaryInStorage(null);
      }
    }
  }, [meetings, getGeneratingSummaryFromStorage, setGeneratingSummaryInStorage, manualSummaryGenerationOnly]);

  // Fonction pour reprendre le polling d'un résumé en cours
  const handleResumePolling = useCallback(async (meetingId: string) => {
    const pollSummaryStatus = async () => {
      try {
        if (!isComponentMounted.current) {
          logger.debug('🛑 Component unmounted, stopping resumed polling');
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        if (!isComponentMounted.current) {
          logger.debug('🛑 Component unmounted during resumed wait, stopping polling');
          return;
        }
        
        logger.debug(`Polling resumed summary status for meeting ${meetingId}`);
        // Utiliser fetchMeetings en mode silencieux pour éviter les états de chargement persistants
        const updatedMeetings = await fetchMeetings(true);
        
        const updatedMeeting = updatedMeetings.find(m => m.id === meetingId);
        
        if (updatedMeeting?.summary_status === 'completed') {
          logger.debug(`Resumed polling: Summary completed for meeting ${meetingId}`);
          // Succès silencieux
          setGeneratingSummaryId(null);
          setGeneratingSummaryInStorage(null);
          cleanupPolling();
        } else if (updatedMeeting?.summary_status === 'error') {
          logger.debug(`Resumed polling: Summary failed for meeting ${meetingId}`);
          showErrorPopup('Erreur', 'Erreur lors de la génération du compte rendu');
          setGeneratingSummaryId(null);
          setGeneratingSummaryInStorage(null);
          cleanupPolling();
        } else if (updatedMeeting?.summary_status === 'processing') {
          if (isComponentMounted.current) {
            logger.debug(`Resumed polling: Summary still processing for meeting ${meetingId}, continuing...`);
            pollTimeoutRef.current = setTimeout(pollSummaryStatus, 5000);
          }
        } else {
          logger.debug(`Resumed polling: Unknown status for meeting ${meetingId}: ${updatedMeeting?.summary_status}`);
          setGeneratingSummaryId(null);
          setGeneratingSummaryInStorage(null);
          cleanupPolling();
        }
      } catch (error) {
        logger.error('Error in resumed polling:', error);
        if (isComponentMounted.current) {
          setGeneratingSummaryId(null);
          setGeneratingSummaryInStorage(null);
        }
        cleanupPolling();
      }
    };
    
    pollSummaryStatus();
  }, [fetchMeetings, showSuccessPopup, showErrorPopup, cleanupPolling, setGeneratingSummaryInStorage]);

  // Effet de nettoyage au démontage du composant
  useEffect(() => {
    isComponentMounted.current = true;
    
    return () => {
      logger.debug('🧹 Component unmounting - cleaning up polling');
      isComponentMounted.current = false;
      cleanupPolling();
    };
  }, [cleanupPolling]);

  // États pour la gestion des speakers
  const [showSpeakerManagement, setShowSpeakerManagement] = useState(false);

  // États pour l'édition du transcript
  const [showTranscriptManagement, setShowTranscriptManagement] = useState(false);

  // Fonction de recherche intelligente pour filtrer les réunions
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setFilteredMeetings(meetings);
      setFilteredSharedMeetings(sharedMeetings);
      const clonedMap = Object.entries(organizationMeetingsByOrg).reduce((acc, [orgId, meetingsList]) => {
        acc[orgId] = [...meetingsList];
        return acc;
      }, {} as Record<string, Meeting[]>);
      setFilteredOrganizationMeetingsByOrg(clonedMap);
      return;
    }
    
    const lowercaseQuery = query.toLowerCase().trim();
    
    // Recherche par mois/année (formats: 'janvier 2023', 'jan 2023', '01 2023', etc.)
    const monthNames = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    const shortMonthNames = [
      'jan', 'fév', 'mar', 'avr', 'mai', 'juin',
      'juil', 'août', 'sept', 'oct', 'nov', 'déc'
    ];
    
    let monthFilter: number | null = null;
    let yearFilter: number | null = null;
    
    // Recherche d'un pattern de date (mois année)
    const dateRegex = /(jan|fév|mar|avr|mai|juin|juil|août|sept|oct|nov|déc|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|\d{1,2})\s+(\d{4})/i;
    const dateMatch = lowercaseQuery.match(dateRegex);
    
    if (dateMatch) {
      const monthPart = dateMatch[1].toLowerCase();
      const yearPart = parseInt(dateMatch[2]);
      
      // Vérifier si c'est un nombre de mois (1-12)
      if (/^\d{1,2}$/.test(monthPart)) {
        const monthNum = parseInt(monthPart);
        if (monthNum >= 1 && monthNum <= 12) {
          monthFilter = monthNum - 1; // Convertir en index base 0
          yearFilter = yearPart;
        }
      } else {
        // Vérifier si c'est un nom de mois
        const fullMonthIndex = monthNames.findIndex(m => m.startsWith(monthPart));
        const shortMonthIndex = shortMonthNames.findIndex(m => m.startsWith(monthPart));
        
        if (fullMonthIndex !== -1) {
          monthFilter = fullMonthIndex;
          yearFilter = yearPart;
        } else if (shortMonthIndex !== -1) {
          monthFilter = shortMonthIndex;
          yearFilter = yearPart;
        }
      }
    }
    
    // Filtrer les réunions en fonction des critères
    const filtered = meetings.filter(meeting => {
      // Si on a un filtre mois/année, l'appliquer en priorité
      if (monthFilter !== null && yearFilter !== null && meeting.date) {
        const meetingDate = new Date(meeting.date);
        return meetingDate.getMonth() === monthFilter && meetingDate.getFullYear() === yearFilter;
      }
      
      // Filtrer par titre
      const titleMatch = meeting.title?.toLowerCase().includes(lowercaseQuery);
      
      // Filtrer par nombre de participants (si la requête est un nombre)
      const participantMatch = !isNaN(Number(query)) && meeting.participants === Number(query);
      
      // Filtrer par durée (format: '30min', '1h', '1h30', etc.)
      const durationMatch = meeting.duration !== undefined && 
      (() => {
        const durationRegex = /(\d+)\s*(h|min|s|heures|minutes|secondes)?/i;
        const durationMatch = lowercaseQuery.match(durationRegex);
        
        if (durationMatch) {
          const value = parseInt(durationMatch[1]);
          const unit = durationMatch[2]?.toLowerCase() || 'min'; // Par défaut en minutes
          
          let durationInSeconds = meeting.duration;
          let queryInSeconds = 0;
          
          if (unit.startsWith('h')) {
            queryInSeconds = value * 3600;
          } else if (unit.startsWith('min')) {
            queryInSeconds = value * 60;
          } else if (unit.startsWith('s')) {
            queryInSeconds = value;
          }
          
          // Considérer une marge de 10% pour la durée
          const lowerBound = queryInSeconds * 0.9;
          const upperBound = queryInSeconds * 1.1;
          
          return durationInSeconds >= lowerBound && durationInSeconds <= upperBound;
        }
        
        return false;
      })();
      
      // Vérifier si au moins un critère correspond
      return titleMatch || participantMatch || durationMatch;
    });
    
    setFilteredMeetings(filtered);
    
    // Filtrer aussi les réunions partagées avec les mêmes critères
    const filteredShared = sharedMeetings.filter(meeting => {
      // Si on a un filtre mois/année, l'appliquer en priorité
      if (monthFilter !== null && yearFilter !== null && meeting.date) {
        const meetingDate = new Date(meeting.date);
        return meetingDate.getMonth() === monthFilter && meetingDate.getFullYear() === yearFilter;
      }
      
      // Filtrer par titre
      const titleMatch = meeting.title?.toLowerCase().includes(lowercaseQuery);
      
      // Filtrer par nombre de participants (si la requête est un nombre)
      const participantMatch = !isNaN(Number(query)) && meeting.participants === Number(query);
      
      // Vérifier si au moins un critère correspond
      return titleMatch || participantMatch;
    });
    
    setFilteredSharedMeetings(filteredShared);
    
    const filteredOrgMap: Record<string, Meeting[]> = {};
    Object.entries(organizationMeetingsByOrg).forEach(([orgId, meetingsList]) => {
      filteredOrgMap[orgId] = meetingsList.filter(meeting => {
        if (monthFilter !== null && yearFilter !== null && meeting.date) {
          const meetingDate = new Date(meeting.date);
          if (!(meetingDate.getMonth() === monthFilter && meetingDate.getFullYear() === yearFilter)) {
            return false;
          }
        }

        const titleMatch = meeting.title?.toLowerCase().includes(lowercaseQuery);
        const orgMatch = meeting.organization_name?.toLowerCase().includes(lowercaseQuery);
        const sharedByMatch = meeting.shared_by?.toLowerCase().includes(lowercaseQuery);

        return titleMatch || orgMatch || sharedByMatch;
      });
    });

    setFilteredOrganizationMeetingsByOrg(filteredOrgMap);
  }, [meetings, sharedMeetings, organizationMeetingsByOrg]);

  const filteredOrganizationMeetingsFlat = useMemo(
    () => Object.values(filteredOrganizationMeetingsByOrg).flat(),
    [filteredOrganizationMeetingsByOrg]
  );
  const totalOrganizationMeetingsCount = organizationMeetingsFlat.length;
  const hasOrganizations = organizations.length > 0;

  const getMeetingTimestamp = (meeting: Meeting) => {
    const dateValue = meeting.created_at || meeting.date || meeting.shared_at;
    const timestamp = dateValue ? new Date(dateValue).getTime() : 0;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const canAccessMeetingContent = (meeting: Meeting) => meeting.permissions?.can_view !== false;

  const combinedMeetings = useMemo(() => {
    const merged = [...filteredMeetings, ...filteredSharedMeetings];
    return merged.sort((a, b) => getMeetingTimestamp(b) - getMeetingTimestamp(a));
  }, [filteredMeetings, filteredSharedMeetings]);
  const selectedContactsForShareDisplay = useMemo(() => {
    const selectedSet = new Set(selectedContactIdsForShare);
    // Check if a contact is already shared with (by user_id or share_id)
    const isAlreadyShared = (contact: Contact) => {
      const contactKey = contact.contact_user_id || contact.id;
      return meetingShares.some(s => 
        s.is_active && (
          String(s.shared_with_user_id).toLowerCase() === String(contactKey).toLowerCase() ||
          s.shared_with_share_id?.toLowerCase() === contact.contact_share_id?.toLowerCase()
        )
      );
    };
    return contacts.filter((contact) => {
      const contactKey = contact.contact_user_id || contact.id;
      if (!contactKey) return false;
      // Must be selected AND not already shared
      return selectedSet.has(contactKey) && !isAlreadyShared(contact);
    });
  }, [contacts, selectedContactIdsForShare, meetingShares]);

  const selectedOrganizationsForShareDisplay = useMemo(
    () => organizations.filter((organization) => selectedOrganizationIdsForShare.includes(organization.id)),
    [organizations, selectedOrganizationIdsForShare]
  );

  const hasSelectedRecipients =
    selectedContactsForShareDisplay.length > 0 ||
    manualShareTargets.length > 0 ||
    selectedOrganizationsForShareDisplay.length > 0;

  const canShareWithOrganizations = selectedMeetingForActions?.summary_status === 'completed';

  const currentFilteredList = useMemo(() => {
    if (activeTab === 'shared-with-me') {
      return filteredSharedMeetings;
    }
    if (activeTab === 'organizations') {
      return filteredOrganizationMeetingsFlat;
    }
    return combinedMeetings;
  }, [activeTab, combinedMeetings, filteredSharedMeetings, filteredOrganizationMeetingsFlat]);

  // Pagination : calculer les réunions à afficher pour la page actuelle
  const paginatedMeetings = useMemo(() => {
    const startIndex = (currentPage - 1) * meetingsPerPage;
    const endIndex = startIndex + meetingsPerPage;
    return currentFilteredList.slice(startIndex, endIndex);
  }, [currentFilteredList, currentPage, meetingsPerPage]);

  // Calculer le nombre total de pages
  const totalPages = Math.ceil(currentFilteredList.length / meetingsPerPage);

  // Réinitialiser à la page 1 quand la liste filtrée change
  useEffect(() => {
    setCurrentPage(1);
  }, [currentFilteredList.length, activeTab]);

  const isCurrentTabLoading = activeTab === 'my-meetings'
    ? (loading || loadingSharedMeetings)
    : activeTab === 'folders'
      ? false // FoldersTab gère son propre état de chargement
    : activeTab === 'shared-with-me'
      ? loadingSharedMeetings
      : (loadingOrganizationMeetings || loadingOrganizations);
  const isRefreshingCurrent = activeTab === 'my-meetings' ? isRefreshing : false;

  function findMeetingAnywhere(meetingId: string) {
    return (
      meetings.find((m) => m.id === meetingId) ||
      sharedMeetings.find((m) => m.id === meetingId) ||
      organizationMeetingsFlat.find((m) => m.id === meetingId)
    );
  }

  const renderMeetingCard = (
    meeting: Meeting,
    index: number,
    keySuffix: string = '',
    options: { showOrganizationChip?: boolean } = {}
  ) => {
    const { showOrganizationChip = true } = options;
    const storedGeneratingId = getGeneratingSummaryFromStorage();
    return (
    <Grid 
      item 
      xs={12} 
      key={`${meeting.id}${keySuffix ? `-${keySuffix}` : ''}`}
      sx={{
        opacity: 0,
        transform: 'translateY(20px)',
        animation: `fadeIn 0.5s ease-out forwards ${index * 0.1}s`,
        '@keyframes fadeIn': {
          '0%': {
            opacity: 0,
            transform: 'translateY(20px)',
          },
          '100%': {
            opacity: 1,
            transform: 'translateY(0)',
          },
        },
      }}
    >
      <Paper
        sx={{
          borderRadius: { xs: '12px', sm: '16px' },
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          position: 'relative',
          overflow: 'visible',
          mb: { xs: 2, sm: 0 },
          cursor: isDragging ? (draggingMeeting?.id === meeting.id ? 'grabbing' : 'default') : 'pointer',
          bgcolor: 'transparent',
          opacity: isDragging ? (draggingMeeting?.id === meeting.id ? 0.3 : 0.4) : 1,
          transform: isDragging ? (draggingMeeting?.id === meeting.id ? 'scale(0.7)' : 'scale(0.85)') : 'none',
          transition: 'opacity 0.2s, transform 0.2s',
          pointerEvents: isDragging && draggingMeeting?.id !== meeting.id ? 'none' : 'auto',
          '&:hover .meeting-card-inner': {
            bgcolor: isDragging ? 'transparent' : 'rgba(59, 130, 246, 0.08)',
          },
        }}
        onClick={() => !isDragging && handleMeetingClick(meeting.id)}
        onMouseDown={(e) => {
          if (!meeting.is_shared && !isDragging) {
            e.preventDefault();
            handleMeetingLongPressStart(meeting, e);
          }
        }}
        onMouseUp={() => {
          if (!isDragging) handleMeetingLongPressEnd();
        }}
        onMouseLeave={() => {
          if (!isDragging) handleMeetingLongPressEnd();
        }}
        onTouchStart={(e) => {
          if (!meeting.is_shared && !isDragging) {
            handleMeetingLongPressStart(meeting, e);
          }
        }}
        onTouchEnd={() => {
          if (!isDragging) handleMeetingLongPressEnd();
        }}
      >
        <Box
          className="meeting-card-inner"
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: { xs: '12px', sm: '16px' },
            border: meeting.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
            bgcolor: 'white',
            transition: 'background-color 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            ...(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing') && {
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.08) 20%, rgba(59, 130, 246, 0.15) 50%, rgba(59, 130, 246, 0.08) 80%, transparent 100%)',
                animation: 'waveEffect 2.5s ease-in-out infinite',
                zIndex: 1,
              },
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '-100%',
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 40%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.3) 60%, transparent 100%)',
                animation: 'waveEffect 2.5s ease-in-out infinite 0.3s',
                zIndex: 2,
              },
              '@keyframes waveEffect': {
                '0%': { left: '-100%' },
                '100%': { left: '100%' },
              },
            },
            '& > *': {
              position: 'relative',
              zIndex: 3,
            },
          }}
        >
        <Box sx={{ 
          display: 'flex', 
          flexDirection: { xs: 'column', lg: 'row' },
          gap: { xs: 2, lg: 2 },
          justifyContent: 'space-between', 
          alignItems: 'center'
        }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {editingMeetingId === meeting.id ? (
              <Box 
                sx={{ mb: { xs: 1, sm: 1.25 }, display: 'flex', alignItems: 'center', gap: 0.5 }}
                onClick={(e) => e.stopPropagation()}
              >
                <TextField
                  value={editingMeetingName}
                  onChange={(e) => setEditingMeetingName(e.target.value)}
                  variant="standard"
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiInput-root': {
                      fontSize: { xs: '1rem', sm: '1.1rem' },
                      fontWeight: 600,
                      '&:before': {
                        borderColor: 'divider',
                      },
                      '&:after': {
                        borderColor: 'primary.main',
                      },
                      },
                    '& .MuiInput-input': {
                      py: 0.5,
                    }
                  }}
                  autoFocus
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleSaveMeetingName(meeting.id);
                    } else if (e.key === 'Escape') {
                      handleCancelEditingName();
                    }
                  }}
                />
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSaveMeetingName(meeting.id);
                  }}
                  sx={{ 
                    flexShrink: 0,
                    color: 'success.main',
                    p: 0.5,
                  }}
                >
                  <CheckIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <IconButton 
                  size="small" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelEditingName();
                  }}
                  sx={{ 
                    flexShrink: 0,
                    color: 'text.secondary',
                    p: 0.5,
                  }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1,
                  mb: { xs: 1, sm: 1.25 },
                  maxWidth: '100%',
                  '&:hover .rename-icon': meeting.is_shared ? {} : {
                    opacity: 1,
                  },
                }}
              >
              <Typography 
                variant="h6" 
                  component="span"
                sx={{ 
                  fontWeight: 600,
                  fontSize: { xs: '1.05rem', sm: '1.2rem' },
                  lineHeight: 1.3,
                  overflow: { xs: 'hidden', lg: 'visible' },
                  textOverflow: { xs: 'ellipsis', lg: 'clip' },
                  whiteSpace: { xs: 'nowrap', lg: 'normal' },
                  cursor: meeting.is_shared ? 'default' : 'pointer',
                  '&:hover': meeting.is_shared ? {} : {
                    color: 'primary.main',
                  }
                }}
                  onClick={meeting.is_shared ? undefined : (e) => {
                    e.stopPropagation();
                  handleStartEditingName(meeting.id, meeting.name || meeting.title || 'Sans titre');
                }}
              >
                {(() => {
                  const updatedName = updatedMeetingNames[meeting.id];
                  const displayValue = updatedName || meeting.name || meeting.title || 'Sans titre';
                  return displayValue;
                })()}
              </Typography>
                {!meeting.is_shared && (
                  <EditIcon 
                    className="rename-icon"
                    sx={{ 
                      fontSize: 14, 
                      color: 'text.secondary',
                      opacity: 0,
                      transition: 'opacity 0.2s ease',
                      cursor: 'pointer',
                      flexShrink: 0,
                      '&:hover': {
                        color: 'primary.main',
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditingName(meeting.id, meeting.name || meeting.title || 'Sans titre');
                    }}
                  />
                )}
                {/* Chip "Partagée par" à droite du titre */}
                {meeting.is_shared && meeting.shared_by && (
                  <Chip
                    icon={<PeopleIcon sx={{ fontSize: '0.85rem' }} />}
                    label={`Partagée par ${meeting.shared_by}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(156, 39, 176, 0.1)',
                      color: '#9C27B0',
                      border: '1px solid rgba(156, 39, 176, 0.3)',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      height: 24,
                    }}
                  />
                )}
                {showOrganizationChip && meeting.organization_name && (
                  <Chip
                    icon={<BusinessIcon sx={{ fontSize: '0.85rem' }} />}
                    label={`Organisation : ${meeting.organization_name}`}
                    size="small"
                    sx={{
                      bgcolor: 'rgba(59, 130, 246, 0.1)',
                      color: theme.palette.primary.main,
                      border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      height: 24,
                    }}
                  />
                )}
              </Box>
            )}

            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 0.75, md: 2 }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              sx={{
                color: 'text.secondary',
                fontSize: { xs: '0.85rem', sm: '0.9rem' },
                mb: { xs: 1.5, sm: 2 }
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </Box>
                <Typography 
                  variant="body2" 
                  sx={{ fontWeight: 500 }}
                >
                  {formatDate(meeting.created_at)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                    <path d="M12 7v10M7 12h10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Box>
                <Typography 
                  variant="body2" 
                  sx={{ fontWeight: 500 }}
                >
                  {formatDuration(meeting.duration_seconds || meeting.audio_duration || meeting.duration || 0)}
                </Typography>
              </Box>
            </Stack>
          </Box>

          <Box sx={{ 
            display: 'flex',
            flexDirection: 'row',
            gap: 1.5,
            alignItems: 'center',
            minWidth: { lg: 'auto' },
            '& .MuiButton-root': {
              fontSize: '0.875rem',
              minHeight: '36px',
              whiteSpace: 'nowrap'
            }
          }}>
            <Stack 
              direction="row"
              spacing={{ xs: 1, sm: 1 }}
              sx={{ 
                flex: 1,
                justifyContent: 'flex-start',
                alignItems: 'center',
                width: '100%',
                minWidth: 0,
                maxWidth: { xs: 'calc(100% - 44px)', sm: '100%' }
              }}
            >
              {(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing') && (
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetryTranscription(meeting.id);
                  }}
                  disabled={retryingMeetingId === meeting.id}
                  size="small"
                  sx={{ width: 'auto' }}
                >
                  {retryingMeetingId === meeting.id ? 'Retry...' : 'Retry'}
                </Button>
              )}


              {(() => {
                const summaryCompleted = meeting.summary_status === 'completed';
                const canExport = meeting.permissions?.can_export !== false;

                if (!summaryCompleted || !meeting.summary_text || !canExport) {
                  return null;
                }

                const templateForExport = resolveTemplateForMeeting(meeting);

                return (
                  <Box
                    onClick={(e) => e.stopPropagation()}
                    sx={{ display: 'flex', alignItems: 'center' }}
                  >
                    <SummaryExportButton
                      summaryText={meeting.summary_text}
                      meetingId={meeting.id}
                      meetingName={meeting.title || 'Réunion'}
                      meetingDate={new Date(meeting.created_at).toLocaleDateString('fr-FR')}
                      logoUrl={templateForExport?.logo_url}
                      layoutConfig={templateForExport?.layout_config}
                      onSuccess={() => { /* Succès silencieux */ }}
                      onError={(message) => showErrorPopup('Erreur', message)}
                    />
                  </Box>
                );
              })()}
            </Stack>

            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <IconButton 
                size="small" 
                sx={{ 
                  color: theme.palette.text.secondary,
                  display: { xs: 'flex', sm: 'none', lg: 'flex' },
                  width: { xs: '36px', sm: 'auto' },
                  height: { xs: '36px', sm: 'auto' },
                  minWidth: { xs: '36px', sm: 'auto' },
                  fontSize: { xs: '0.85rem', sm: '1rem' },
                  '&:hover': {
                    color: theme.palette.primary.main,
                    backgroundColor: alpha(theme.palette.primary.main, 0.1)
                  }
                }}
                onClick={(e) => handleOpenActionsMenu(e, meeting)}
                disabled={isDeleting}
              >
                <MoreVertIcon />
              </IconButton>
            </Box>
          </Box>
        </Box>
        </Box>
      </Paper>
    </Grid>
  );
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .markdown-content p {
          margin-bottom: 16px;
          line-height: 1.6;
        }
        .markdown-content h1 {
          font-size: 28px;
          font-weight: 700;
          margin-top: 24px;
          margin-bottom: 16px;
        }
        .markdown-content h2 {
          font-size: 24px;
          font-weight: 600;
          margin-top: 20px;
          margin-bottom: 12px;
        }
        .markdown-content h3 {
          font-size: 20px;
          font-weight: 600;
          margin-top: 16px;
          margin-bottom: 10px;
        }
        .markdown-content ul, .markdown-content ol {
          margin-bottom: 16px;
          padding-left: 24px;
        }
        .markdown-content li {
          margin-bottom: 8px;
        }
        .markdown-content code {
          background-color: rgba(0, 0, 0, 0.05);
          padding: 2px 4px;
          border-radius: 4px;
          font-family: monospace;
        }
        .markdown-content pre {
          background-color: rgba(0, 0, 0, 0.05);
          padding: 16px;
          border-radius: 4px;
          overflow-x: auto;
          margin-bottom: 16px;
        }
        .markdown-content blockquote {
          border-left: 4px solid #e0e0e0;
          padding-left: 16px;
          margin-left: 0;
          margin-bottom: 16px;
          color: #616161;
        }
        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 16px;
        }
        .markdown-content table th, .markdown-content table td {
          border: 1px solid #e0e0e0;
          padding: 8px 12px;
          text-align: left;
        }
        .markdown-content table th {
          background-color: rgba(0, 0, 0, 0.05);
          font-weight: 600;
        }
      ` }} />
      <Box sx={{ 
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 2, sm: 3, md: 4 },
        mb: 4,
        minHeight: '100vh'
      }}>
          {/* En-tête avec logo et titre */}
        <Box sx={{ mb: { xs: 2, sm: 3, md: 4 } }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between', 
            alignItems: { xs: 'flex-start', sm: 'center' }, 
            mb: 2,
            gap: { xs: 1, sm: 0 }
          }}>
            <Box>
              <Typography variant="h4" sx={{ 
                fontWeight: 800, 
                mb: 1, 
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.5px',
                fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' } // Taille responsive
              }}>
                {headerTitle}
              </Typography>
              <Typography 
                variant="body1" 
                color="text.secondary"
                sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }} // Taille responsive
              >
                {headerSubtitle}
              </Typography>
            </Box>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Système de tabs */}
        {allowedTabs.length > 1 && (
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs 
              value={activeTab} 
              onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 600,
                  fontSize: '1rem',
                  minHeight: 56,
                  minWidth: { xs: 160, sm: 200 },
                  px: { xs: 3, sm: 4 }
                }
              }}
            >
              {showMyMeetingsTab && (
                <Tab 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <EventNoteIcon sx={{ fontSize: 20 }} />
                      <span>Mes réunions</span>
                    </Box>
                  }
                  value="my-meetings"
                />
              )}
              {showFoldersTab && (
                <Tab 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <FolderIcon sx={{ fontSize: 20 }} />
                      <span>Dossiers</span>
                    </Box>
                  }
                  value="folders"
                />
              )}
              {showSharedWithMeTab && (
                <Tab 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PeopleIcon sx={{ fontSize: 20 }} />
                      <span>Partagées avec moi</span>
                      {sharedMeetings.length > 0 && (
                        <Badge 
                          badgeContent={sharedMeetings.length} 
                          color="secondary"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Box>
                  }
                  value="shared-with-me"
                />
              )}
              {showOrganizationsTab && hasOrganizations && (
                <Tab
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BusinessIcon sx={{ fontSize: 20 }} />
                      <span>Organisations</span>
                      {totalOrganizationMeetingsCount > 0 && (
                        <Badge
                          badgeContent={totalOrganizationMeetingsCount}
                          color="primary"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </Box>
                  }
                  value="organizations"
                />
              )}
            </Tabs>
          </Box>
        )}

        {/* Barre de recherche simple + bouton de rafraîchissement - cachée sur l'onglet Dossiers */}
        {activeTab !== 'folders' && (
        <Box sx={{ mb: { xs: 2, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 } }}>
          <Paper
            component="form"
            elevation={0}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              px: 2,
              py: 1,
              borderRadius: 2,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              height: { xs: '44px', sm: '48px' },
              transition: 'border-color 0.2s ease',
              '&:focus-within': {
                borderColor: '#3b82f6',
              },
            }}
          >
            <SearchIcon sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
            <InputBase
              sx={{ 
                flex: 1,
                fontSize: '0.95rem',
              }}
              placeholder={
                isMobileScreen
                  ? 'Rechercher...'
                  : searchPlaceholderDesktop
              }
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
            />
            {searchQuery && (
              <IconButton 
                size="small"
                sx={{ color: 'text.secondary' }} 
                aria-label="clear" 
                onClick={() => handleSearch('')}
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            )}
          </Paper>
            <Button
              variant="outlined"
              startIcon={isRefreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
              onClick={invalidateCacheAndRefresh}
              disabled={isRefreshing}
              disableElevation
              disableRipple
              sx={{
                height: { xs: '44px', sm: '48px' },
                borderRadius: '30px',
                px: { xs: 2, sm: 2.5 },
                whiteSpace: 'nowrap',
                minWidth: { xs: '120px', sm: 'auto' },
                fontSize: { xs: '0.875rem', sm: '0.875rem' },
                transition: 'background-color 0.15s ease',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.04)',
                  transform: 'none',
                },
              }}
            >
              Rafraîchir
            </Button>
          </Box>
          {searchQuery && (
            <Box sx={{ 
              mt: { xs: 1, sm: 1.5 }, // Marge responsive
              display: 'flex', 
              alignItems: 'center', 
              flexWrap: 'wrap', 
              gap: { xs: 0.5, sm: 1 } // Gap responsive
            }}>
              <Chip 
                label={`${currentFilteredList.length} résultat(s) trouvé(s)`}
                size="small"
                color={currentFilteredList.length > 0 ? "primary" : "default"}
                sx={{ 
                  borderRadius: '20px',
                  fontWeight: 500,
                  fontSize: { xs: '0.75rem', sm: '0.8125rem' }, // Taille responsive
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                  background: currentFilteredList.length > 0 
                    ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.9)} 0%, ${alpha(theme.palette.primary.light, 0.9)} 100%)`
                    : undefined,
                  border: currentFilteredList.length > 0 
                    ? 'none'
                    : `1px solid ${alpha(theme.palette.divider, 0.7)}`,
                  '& .MuiChip-label': {
                    padding: { xs: '0 8px', sm: '0 12px' }, // Padding responsive
                  }
                }}
              />
              <Chip
                label={`Recherche: "${searchQuery.length > 20 ? searchQuery.substring(0, 20) + '...' : searchQuery}"`} // Texte tronqué sur mobile
                size="small"
                color="secondary"
                onDelete={() => handleSearch('')}
                sx={{
                  bgcolor: alpha('#F59E0B', 0.1),
                  color: '#F59E0B',
                  fontWeight: 500,
                  fontSize: { xs: '0.75rem', sm: '0.8125rem' }, // Taille responsive
                  maxWidth: { xs: '200px', sm: '100%' }, // Largeur max sur mobile
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',
                    overflow: 'visible',
                    textOverflow: 'clip',
                    display: 'block',
                    lineHeight: 1.2,
                    py: 0.5
                  }
                }}
              />
            </Box>
          )}
        </Box>
        )}

        {/* Animation de chargement - toujours prioritaire - pas sur l'onglet Dossiers */}
        {activeTab !== 'folders' && isCurrentTabLoading && (
          <Fade in={isCurrentTabLoading} timeout={400}>
            <Box 
              sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                my: 6, 
                py: 4,
                animation: isRefreshingCurrent ? 'pulseAnimation 1.5s infinite ease-in-out' : 'none',
                '@keyframes pulseAnimation': {
                  '0%': { opacity: 0.9 },
                  '50%': { opacity: 1 },
                  '100%': { opacity: 0.9 },
                }
              }}
            >
              <CircularProgress size={60} thickness={4} sx={{ 
                color: theme.palette.primary.main,
                mb: 3,
                '& .MuiCircularProgress-circle': {
                  strokeLinecap: 'round',
                  animation: isRefreshingCurrent ? 'rotateAnimation 1.5s infinite ease-in-out' : 'none',
                  '@keyframes rotateAnimation': {
                    '0%': { animationTimingFunction: 'ease-in' },
                    '50%': { animationTimingFunction: 'ease-out' },
                    '100%': { animationTimingFunction: 'ease-in' }
                  }
                }
              }} />
              <Typography variant="h6" color="primary" sx={{ fontWeight: 500, mb: 1, textAlign: 'center' }}>
                {activeTab === 'my-meetings'
                  ? (isRefreshingCurrent ? 'Rafraîchissement des réunions...' : 'Chargement de vos réunions...')
                  : activeTab === 'shared-with-me'
                    ? 'Chargement des réunions partagées...'
                    : "Chargement des réunions d'organisation..."}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: '400px' }}>
                {activeTab === 'my-meetings'
                  ? (isRefreshingCurrent ? 'Mise à jour des données en cours' : "Nous préparons l'affichage de vos réunions et transcriptions")
                  : activeTab === 'shared-with-me'
                    ? 'Nous récupérons les réunions partagées avec vous'
                    : 'Nous collectons les réunions partagées avec vos organisations'}
              </Typography>
              <LinearProgress 
                sx={{ 
                  mt: 4, 
                  width: '250px', 
                  height: 6, 
                  borderRadius: 3,
                  background: alpha(theme.palette.primary.main, 0.1),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 3,
                    background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                    animation: isRefreshingCurrent ? 'progressAnimation 1.5s infinite ease-in-out' : 'none',
                    '@keyframes progressAnimation': {
                      '0%': { opacity: 0.7 },
                      '50%': { opacity: 1 },
                      '100%': { opacity: 0.7 }
                    }
                  }
                }} 
              />
            </Box>
          </Fade>
        )}
        
        {/* Onglet Dossiers */}
        {activeTab === 'folders' && (
          <FoldersTab 
            meetings={meetings}
            onOpenMeeting={async (meetingId) => {
              logger.debug('📂 onOpenMeeting called with meetingId:', meetingId);
              
              // Chercher d'abord dans les réunions locales
              let meeting = meetings.find(m => m.id === meetingId);
              logger.debug('📂 Found in local meetings:', !!meeting);
              
              if (!meeting) {
                // Si pas trouvé, chercher dans les réunions partagées
                meeting = sharedMeetings.find(m => m.id === meetingId);
                logger.debug('📂 Found in shared meetings:', !!meeting);
              }
              
              if (!meeting) {
                // Sinon, charger depuis l'API (réunion partagée via dossier)
                logger.debug('📂 Loading meeting from API...');
                try {
                  const meetingData = await getMeetingDetails(meetingId);
                  logger.debug('📂 API response:', meetingData);
                  if (meetingData && !(meetingData as any).deleted && meetingData.transcript_status !== 'deleted') {
                    // Ajouter les permissions pour réunion partagée via dossier
                    meeting = {
                      ...meetingData,
                      is_shared: true,
                      permissions: (meetingData as any).permissions || {
                        role: 'reader',
                        can_edit: false,
                        can_regenerate: false,
                        can_share: false,
                        include_transcript: true
                      }
                    } as Meeting;
                    logger.debug('📂 Meeting loaded successfully:', meeting.id);
                  } else {
                    logger.error('📂 Meeting not found or deleted');
                    showErrorPopup('Erreur', 'Cette réunion n\'est pas accessible');
                    return;
                  }
                } catch (err) {
                  logger.error('📂 Error loading meeting from folder:', err);
                  showErrorPopup('Erreur', 'Impossible de charger cette réunion');
                  return;
                }
              }
              
              if (meeting) {
                logger.debug('📂 Opening meeting overlay for:', meeting.id);
                setOverlayMeeting(meeting);
                setSelectedMeeting(meeting);
                setMeetingDetailOverlayOpen(true);
              }
            }}
          />
        )}
        
        {/* Pas de réunions trouvées ou affichage des cartes - seulement si pas en chargement */}
        {activeTab !== 'folders' && !isCurrentTabLoading ? (
          currentFilteredList.length === 0 ? (
            <Paper
              sx={{
                p: 4,
                borderRadius: '16px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              }}
            >
              <Typography variant="h6" sx={{ mb: 2 }}>
                {activeTab === 'my-meetings'
                  ? 'Aucune réunion trouvée'
                  : activeTab === 'shared-with-me'
                    ? 'Aucune réunion partagée'
                    : "Aucune réunion d'organisation"}
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3 }}>
                {activeTab === 'my-meetings'
                  ? 'Commencez par enregistrer ou uploader un audio de réunion'
                  : activeTab === 'shared-with-me'
                    ? "Les réunions que d'autres utilisateurs partagent avec vous apparaîtront ici"
                    : 'Les réunions partagées avec vos organisations seront affichées sur cet onglet'}
              </Typography>
            </Paper>
          ) : activeTab === 'organizations' ? (
            <Stack spacing={{ xs: 2, sm: 3 }}>
              {organizations.map((org) => {
                const meetingsForOrg = filteredOrganizationMeetingsByOrg[org.id] || [];
                const totalForOrg = organizationMeetingsByOrg[org.id]?.length || 0;
                const hasMeetingsToShow = meetingsForOrg.length > 0;
                const emptyMessage = totalForOrg === 0
                  ? "Aucune réunion n'a encore été partagée dans cette organisation."
                  : searchQuery.trim()
                    ? "Aucune réunion ne correspond à votre recherche pour cette organisation."
                    : "Aucune réunion n'est disponible pour le moment.";

                return (
                  <Paper
                    key={org.id}
                    sx={{
                      p: { xs: 2, sm: 3 },
                      borderRadius: '16px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 1.5, md: 2 } }}>
                      <Box>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <BusinessIcon sx={{ fontSize: 20, color: theme.palette.primary.main }} />
                          {org.name}
                        </Typography>
                        {org.description && (
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {org.description}
                          </Typography>
                        )}
                      </Box>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Chip
                          icon={<PeopleIcon sx={{ fontSize: 18 }} />}
                          label={`${org.member_count || 0} membre${(org.member_count || 0) > 1 ? 's' : ''}`}
                          size="small"
                        />
                        <Chip
                          icon={<EventNoteIcon sx={{ fontSize: 18 }} />}
                          label={`${totalForOrg} réunion${totalForOrg > 1 ? 's' : ''}`}
                          size="small"
                        />
                        <Chip
                          icon={<BusinessIcon sx={{ fontSize: 18 }} />}
                          label={`Code: ${org.organization_code}`}
                          size="small"
                        />
                      </Stack>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    {hasMeetingsToShow ? (
                      <Grid container spacing={{ xs: 2, sm: 3 }}>
                        {meetingsForOrg.map((meeting, index) =>
                          renderMeetingCard(meeting, index, org.id, { showOrganizationChip: false })
                        )}
                      </Grid>
                    ) : (
                      <Box sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {emptyMessage}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Stack>
          ) : (
            <Fade in={!isCurrentTabLoading} timeout={500}>
              <Box>
                <Grid container spacing={{ xs: 2, sm: 3 }}>
            {paginatedMeetings.map((meeting: Meeting, index: number) => (
              <Grid 
                item 
                xs={12} 
                key={meeting.id}
                sx={{
                  opacity: 0,
                  transform: 'translateY(20px)',
                  animation: `fadeIn 0.5s ease-out forwards ${index * 0.1}s`,
                  '@keyframes fadeIn': {
                    '0%': {
                      opacity: 0,
                      transform: 'translateY(20px)',
                    },
                    '100%': {
                      opacity: 1,
                      transform: 'translateY(0)',
                    },
                  },
                }}
              >
                <Paper
                  sx={{
                    borderRadius: { xs: '12px', sm: '16px' },
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                    position: 'relative',
                    overflow: 'visible',
                    mb: { xs: 2, sm: 0 },
                    cursor: isDragging ? (draggingMeeting?.id === meeting.id ? 'grabbing' : 'default') : 'pointer',
                    bgcolor: 'transparent',
                    opacity: isDragging ? (draggingMeeting?.id === meeting.id ? 0.3 : 0.4) : 1,
                    transform: isDragging ? (draggingMeeting?.id === meeting.id ? 'scale(0.7)' : 'scale(0.85)') : 'none',
                    transition: 'opacity 0.2s, transform 0.2s',
                    pointerEvents: isDragging && draggingMeeting?.id !== meeting.id ? 'none' : 'auto',
                    '&:hover .meeting-card-inner': {
                      bgcolor: isDragging ? 'transparent' : 'rgba(59, 130, 246, 0.08)',
                    },
                  }}
                  onClick={() => !isDragging && handleMeetingClick(meeting.id)}
                  onMouseDown={(e) => {
                    if (!meeting.is_shared && !isDragging) {
                      e.preventDefault();
                      handleMeetingLongPressStart(meeting, e);
                    }
                  }}
                  onMouseUp={() => {
                    if (!isDragging) handleMeetingLongPressEnd();
                  }}
                  onMouseLeave={() => {
                    if (!isDragging) handleMeetingLongPressEnd();
                  }}
                  onTouchStart={(e) => {
                    if (!meeting.is_shared && !isDragging) {
                      handleMeetingLongPressStart(meeting, e);
                    }
                  }}
                  onTouchEnd={() => {
                    if (!isDragging) handleMeetingLongPressEnd();
                  }}
                >
                  <Box
                    className="meeting-card-inner"
                    sx={{
                      p: { xs: 2, sm: 3 },
                      borderRadius: { xs: '12px', sm: '16px' },
                      border: meeting.is_shared ? '2px solid rgba(156, 39, 176, 0.3)' : 'none',
                      bgcolor: 'white',
                      transition: 'background-color 0.2s ease',
                      position: 'relative',
                      overflow: 'hidden',
                      ...(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing') && {
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: '-100%',
                          width: '100%',
                          height: '100%',
                          background: 'linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.08) 20%, rgba(59, 130, 246, 0.15) 50%, rgba(59, 130, 246, 0.08) 80%, transparent 100%)',
                          animation: 'waveEffect 2.5s ease-in-out infinite',
                          zIndex: 1,
                        },
                        '&::after': {
                          content: '""',
                          position: 'absolute',
                          top: 0,
                          left: '-100%',
                          width: '100%',
                          height: '100%',
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.3) 40%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.3) 60%, transparent 100%)',
                          animation: 'waveEffect 2.5s ease-in-out infinite 0.3s',
                          zIndex: 2,
                        },
                        '@keyframes waveEffect': {
                          '0%': { left: '-100%' },
                          '100%': { left: '100%' },
                        },
                      },
                      '& > *': {
                        position: 'relative',
                        zIndex: 3,
                      },
                    }}
                  >
                  {/* Layout responsive avec baseline alignée */}
                  <Box sx={{ 
                    display: 'flex', 
                    flexDirection: { xs: 'column', lg: 'row' },
                    gap: { xs: 2, lg: 2 },
                    justifyContent: 'space-between', 
                    alignItems: 'center'
                  }}>
                    {/* Contenu principal */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Nom de la réunion avec édition inline */}
                      {editingMeetingId === meeting.id ? (
                        <Box 
                          sx={{ mb: { xs: 1, sm: 1.25 }, display: 'flex', alignItems: 'center', gap: 0.5 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TextField
                            value={editingMeetingName}
                            onChange={(e) => setEditingMeetingName(e.target.value)}
                            variant="standard"
                            size="small"
                            fullWidth
                            sx={{
                              '& .MuiInput-root': {
                                fontSize: { xs: '1rem', sm: '1.1rem' },
                                fontWeight: 600,
                                '&:before': {
                                  borderColor: 'divider',
                                },
                                '&:after': {
                                  borderColor: 'primary.main',
                                },
                                },
                              '& .MuiInput-input': {
                                py: 0.5,
                              }
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') {
                                handleSaveMeetingName(meeting.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEditingName();
                              }
                            }}
                          />
                          <IconButton 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveMeetingName(meeting.id);
                            }}
                            sx={{ 
                              flexShrink: 0,
                              color: 'success.main',
                              p: 0.5,
                            }}
                          >
                            <CheckIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                          <IconButton 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelEditingName();
                            }}
                            sx={{ 
                              flexShrink: 0,
                              color: 'text.secondary',
                              p: 0.5,
                            }}
                          >
                            <CancelIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                            mb: { xs: 1, sm: 1.25 },
                            maxWidth: '100%',
                            '&:hover .rename-icon': meeting.is_shared ? {} : {
                              opacity: 1,
                            },
                          }}
                        >
                        <Typography 
                          variant="h6" 
                            component="span"
                          sx={{ 
                            fontWeight: 600,
                            fontSize: { xs: '1.05rem', sm: '1.2rem' },
                            lineHeight: 1.3,
                            overflow: { xs: 'hidden', lg: 'visible' },
                            textOverflow: { xs: 'ellipsis', lg: 'clip' },
                            whiteSpace: { xs: 'nowrap', lg: 'normal' },
                            cursor: meeting.is_shared ? 'default' : 'pointer',
                            '&:hover': meeting.is_shared ? {} : {
                              color: 'primary.main',
                            }
                          }}
                            onClick={meeting.is_shared ? undefined : (e) => {
                              e.stopPropagation();
                            handleStartEditingName(meeting.id, meeting.name || meeting.title || 'Sans titre');
                          }}
                        >
                          {(() => {
                            const updatedName = updatedMeetingNames[meeting.id];
                            const displayValue = updatedName || meeting.name || meeting.title || 'Sans titre';
                            return displayValue;
                          })()}
                        </Typography>
                          {!meeting.is_shared && (
                            <EditIcon 
                              className="rename-icon"
                              sx={{ 
                                fontSize: 14, 
                                color: 'text.secondary',
                                opacity: 0,
                                transition: 'opacity 0.2s ease',
                                cursor: 'pointer',
                                flexShrink: 0,
                                '&:hover': {
                                  color: 'primary.main',
                                }
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEditingName(meeting.id, meeting.name || meeting.title || 'Sans titre');
                              }}
                            />
                          )}
                          {/* Chip "Partagée par" à droite du titre */}
                          {meeting.is_shared && meeting.shared_by && (
                            <Chip
                              icon={<PeopleIcon sx={{ fontSize: '0.85rem' }} />}
                              label={`Partagée par ${meeting.shared_by}`}
                              size="small"
                              sx={{
                                bgcolor: 'rgba(156, 39, 176, 0.1)',
                                color: '#9C27B0',
                                border: '1px solid rgba(156, 39, 176, 0.3)',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                height: 24,
                              }}
                            />
                          )}
                          {meeting.organization_name && (
                            <Chip
                              icon={<BusinessIcon sx={{ fontSize: '0.85rem' }} />}
                              label={`Organisation : ${meeting.organization_name}`}
                              size="small"
                              sx={{
                                bgcolor: 'rgba(59, 130, 246, 0.1)',
                                color: theme.palette.primary.main,
                                border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                height: 24,
                              }}
                            />
                          )}
                        </Box>
                      )}
                      
                        {/* Informations de la réunion - Mobile en ligne, Desktop en ligne */}
                        <Stack 
                          direction="row" 
                          spacing={{ xs: 1.5, sm: 1.5 }} // Plus d'espace sur mobile
                          alignItems="center"
                          flexWrap="wrap"
                          sx={{ 
                            mb: 0,
                            // Améliorations mobile uniquement
                            overflowX: { xs: 'auto', sm: 'visible' },
                            '&::-webkit-scrollbar': { display: 'none' },
                            msOverflowStyle: 'none',
                            scrollbarWidth: 'none',
                            padding: { xs: '4px 0', sm: 0 } // Padding vertical sur mobile
                          }}
                        >
                        {/* Durée */}
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 0.5,
                          minWidth: 'fit-content', // Empêche la compression sur mobile
                          flexShrink: 0 // Garde la taille sur mobile
                        }}>
                          <Box sx={{ 
                            width: { xs: 18, sm: 20 }, 
                            height: { xs: 18, sm: 20 },
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                            boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                            </svg>
                          </Box>
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ fontWeight: 500, fontSize: { xs: '0.82rem', sm: '0.9rem' }, lineHeight: 1 }}
                          >
                            {(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing') 
                              ? 'Analyse...' 
                              : formatDuration(meeting.duration_seconds || meeting.audio_duration || meeting.duration)}
                        </Typography>
                        </Box>
                        
                        {/* Date */}
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 0.5,
                          minWidth: 'fit-content',
                          flexShrink: 0
                        }}>
                          <Box sx={{ 
                            width: { xs: 18, sm: 20 }, 
                            height: { xs: 18, sm: 20 },
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                            </svg>
                          </Box>
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ fontWeight: 500, fontSize: { xs: '0.82rem', sm: '0.9rem' }, lineHeight: 1 }}
                          >
                            {formatDate(meeting.created_at)}
                          </Typography>
                        </Box>
                        
                        {/* Participants - Masqué sur très petits écrans */}
                        <Box sx={{ 
                          display: { xs: 'none', sm: 'flex' }, // Masqué sur mobile, visible sur desktop
                          alignItems: 'center', 
                          gap: 0.5,
                          minWidth: 'fit-content',
                          flexShrink: 0
                        }}>
                          <Box sx={{ 
                            width: { xs: 18, sm: 20 }, 
                            height: { xs: 18, sm: 20 },
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          </Box>
                          <Typography 
                            variant="body2" 
                            color="text.secondary" 
                            sx={{ fontWeight: 500, fontSize: { xs: '0.82rem', sm: '0.9rem' }, lineHeight: 1 }}
                          >
                            {(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing')
                              ? 'Détection...'
                              : `${meeting.participants || meeting.speakers_count || '0'} participants`}
                          </Typography>
                        </Box>
                        
                        {/* Avertissement et status - Version responsive */}
                        <Box sx={{ 
                          display: 'flex', 
                          flexWrap: 'wrap', 
                          gap: { xs: 0.5, sm: 1 },
                          alignItems: 'center'
                        }}>
                          {/* Avertissement court */}
                          {((meeting.audio_duration || meeting.duration || 0) < 60) && (
                            <Chip
                              icon={<WarningIcon sx={{ fontSize: { xs: 12, sm: 14 } }} />}
                              label="Court"
                              size="small"
                              sx={{
                                bgcolor: alpha('#FEF3C7', 0.4),
                                color: '#D97706',
                                fontSize: { xs: '0.65rem', sm: '0.7rem' },
                                height: { xs: 20, sm: 24 }
                              }}
                            />
                          )}
                          
                          {/* Status chip */}
                          <Chip
                            label={
                              (meeting.transcript_status === 'completed' || meeting.transcription_status === 'completed') 
                                ? 'Terminé' 
                                : (meeting.transcript_status === 'error' || meeting.transcription_status === 'failed')
                                  ? 'Erreur'
                                  : 'En cours'
                            }
                            size="small"
                            sx={{
                              bgcolor: (meeting.transcript_status === 'completed' || meeting.transcription_status === 'completed') 
                                ? alpha('#10B981', 0.1) 
                                : (meeting.transcript_status === 'error' || meeting.transcription_status === 'failed')
                                  ? alpha('#EF4444', 0.1)
                                  : alpha('#F59E0B', 0.1),
                              color: (meeting.transcript_status === 'completed' || meeting.transcription_status === 'completed') 
                                ? '#10B981' 
                                : (meeting.transcript_status === 'error' || meeting.transcription_status === 'failed')
                                  ? '#EF4444'
                                  : '#F59E0B',
                              fontWeight: 500,
                              fontSize: { xs: '0.7rem', sm: '0.75rem' },
                              height: 24
                            }}
                          />
                        </Box>
                      </Stack>
                    </Box>

                    {/* Section des actions - Layout linéaire (une seule ligne) */}
                    <Box sx={{ 
                      display: 'flex',
                      flexDirection: 'row',
                      gap: 1.5,
                      alignItems: 'center',
                      minWidth: { lg: 'auto' },
                      '& .MuiButton-root': {
                        fontSize: '0.875rem',
                        minHeight: '36px',
                        whiteSpace: 'nowrap'
                      }
                    }}>
                      {/* Boutons principaux - Mobile optimisé */}
                      <Stack 
                        direction="row"
                        spacing={{ xs: 1, sm: 1 }} // Espacement confortable sur mobile
                        sx={{ 
                          flex: 1,
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                          width: '100%',
                          minWidth: 0, // Permet la compression
                          overflow: 'visible', // Laisser respirer les animations
                          maxWidth: { xs: 'calc(100% - 44px)', sm: '100%' } // Réserve de l'espace pour le bouton supprimer
                        }}
                      >
                        {/* Retry button */}
                        {(meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing') && (
                          <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryTranscription(meeting.id);
                            }}
                            disabled={retryingMeetingId === meeting.id}
                            size="small"
                            sx={{ width: 'auto' }}
                          >
                            {retryingMeetingId === meeting.id ? 'Retry...' : 'Retry'}
                          </Button>
                        )}
                        
                      </Stack>

                      {/* Actions secondaires (toujours en ligne) */}
                      <Box sx={{ 
                        display: 'flex',
                        gap: 0.5,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        flexShrink: 0, // Empêche la compression
                        minWidth: { xs: '36px', sm: 'fit-content' },
                        width: { xs: '36px', sm: 'auto' }
                      }}>
                        <IconButton 
                          size="small" 
                          sx={{ 
                            color: theme.palette.text.secondary,
                            display: { xs: 'flex', sm: 'none', lg: 'flex' },
                            width: { xs: '36px', sm: 'auto' },
                            height: { xs: '36px', sm: 'auto' },
                            minWidth: { xs: '36px', sm: 'auto' },
                            fontSize: { xs: '0.85rem', sm: '1rem' },
                            '&:hover': {
                              color: theme.palette.primary.main,
                              backgroundColor: alpha(theme.palette.primary.main, 0.1)
                            }
                          }}
                          onClick={(e) => handleOpenActionsMenu(e, meeting)}
                          disabled={isDeleting}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </Box>
                  </Box>
                </Paper>
              </Grid>
            ))}
            
          </Grid>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={(_event, value) => {
                  setCurrentPage(value);
                  // Scroll vers le haut de la liste
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                color="primary"
                size="large"
                showFirstButton
                showLastButton
                sx={{
                  '& .MuiPaginationItem-root': {
                    fontSize: { xs: '0.875rem', sm: '1rem' },
                  },
                }}
              />
            </Box>
          )}
          
          {/* Affichage du nombre de résultats */}
          {currentFilteredList.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, mb: 2 }}>
              <Typography variant="body2" color="text.secondary">
                Affichage de {((currentPage - 1) * meetingsPerPage) + 1} à {Math.min(currentPage * meetingsPerPage, currentFilteredList.length)} sur {currentFilteredList.length} réunion(s)
              </Typography>
            </Box>
          )}
              </Box>
            </Fade>
          )
        ) : null}
      </Box>

      {/* Menu d'actions rapides */}
      <Menu
        anchorEl={actionsMenuAnchor}
        open={Boolean(actionsMenuAnchor)}
        onClose={handleCloseActionsMenu}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            borderRadius: 2
          }
        }}
      >
        {/* Pour les réunions normales (mes réunions) */}
        {selectedMeetingForActions && !selectedMeetingForActions.is_shared && (
          <>
            <MenuItem onClick={handleRegenerateSummary}>
              <ListItemIcon>
                <AutorenewIcon fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText 
                primary="Régénérer le résumé" 
                primaryTypographyProps={{ fontSize: '0.95rem' }}
              />
            </MenuItem>
            
            <MenuItem onClick={handleShareMeeting}>
              <ListItemIcon>
                <ShareIcon fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText 
                primary="Partager"
                primaryTypographyProps={{ fontSize: '0.95rem' }}
              />
            </MenuItem>
            
            <MenuItem onClick={handleOpenAddToFolderDialog}>
              <ListItemIcon>
                <FolderIcon fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText 
                primary="Mettre dans un dossier"
                primaryTypographyProps={{ fontSize: '0.95rem' }}
              />
            </MenuItem>
            
            <Divider sx={{ my: 0.5 }} />
            
            <MenuItem onClick={handleDeleteFromMenu}>
              <ListItemIcon>
                <DeleteIcon fontSize="small" sx={{ color: '#EF4444' }} />
              </ListItemIcon>
              <ListItemText 
                primary="Supprimer" 
                primaryTypographyProps={{ fontSize: '0.95rem', color: '#EF4444' }}
              />
            </MenuItem>
          </>
        )}
        
        {/* Pour les réunions partagées - menu basé sur les permissions */}
        {selectedMeetingForActions && selectedMeetingForActions.is_shared && (() => {
          const permissions = selectedMeetingForActions.permissions;
          const isEditor = permissions?.role === 'editor' || permissions?.can_edit === true;
          const canShare = isEditor || permissions?.can_share === true;
          
          return (
            <>
              {/* Les éditeurs peuvent partager */}
              {canShare && (
                <MenuItem onClick={handleShareMeeting}>
            <ListItemIcon>
                    <ShareIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText 
                    primary="Partager"
              primaryTypographyProps={{ fontSize: '0.95rem' }}
            />
          </MenuItem>
        )}
              
              {canShare && <Divider sx={{ my: 0.5 }} />}
              
              {/* Tous peuvent supprimer de leur espace */}
              <MenuItem onClick={() => {
                handleCloseActionsMenu();
                // Utiliser la même confirmation que pour les réunions normales
                setMeetingToDelete(selectedMeetingForActions);
                setDeleteConfirmOpen(true);
              }}>
                <ListItemIcon>
                  <DeleteIcon fontSize="small" sx={{ color: '#EF4444' }} />
                </ListItemIcon>
                <ListItemText 
                  primary="Retirer de mon espace" 
                  primaryTypographyProps={{ fontSize: '0.95rem', color: '#EF4444' }}
                />
              </MenuItem>
            </>
          );
        })()}
      </Menu>

      {/* Dialog de partage de réunion */}
      <Dialog
        open={shareDialogOpen}
        onClose={handleCloseShareDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            height: '85vh',
            maxHeight: 750,
          }
        }}
      >
        <DialogTitle sx={{ 
          py: 2.5,
          px: 4,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="h6" fontWeight={600} color="text.primary" sx={{ fontFamily: 'inherit' }}>
          Partager la réunion
            </Typography>
            {selectedMeetingForActions && (
              <Typography variant="body1" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
                — {selectedMeetingForActions.title || 'Sans titre'}
                  </Typography>
            )}
          </Box>
        </DialogTitle>
        
        <DialogContent sx={{ px: 4, pt: 4, pb: 3, flex: 1, overflow: 'auto', mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 4, flexDirection: { xs: 'column', md: 'row' }, height: '100%' }}>
            
            {/* Colonne gauche - Destinataires */}
            <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ mb: 2, fontFamily: 'inherit' }}>
                Sélectionner les destinataires
              </Typography>
              
              {/* Barre de recherche */}
              <TextField
                size="small"
                placeholder="Rechercher un contact..."
                value={recipientSearchQuery}
                onChange={(e) => setRecipientSearchQuery(e.target.value)}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ mr: 1, display: 'flex', alignItems: 'center', color: 'text.secondary' }}>
                      <SearchIcon sx={{ fontSize: 20 }} />
                    </Box>
                  ),
                }}
              />
              
              {/* Liste des contacts et groupes */}
              <Box sx={{ 
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1.5,
                flex: 1,
                minHeight: 180,
                maxHeight: 260,
                overflowY: 'auto',
              }}>
                  {loadingContacts ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
                ) : (
                  <>
                    {/* Contacts */}
                    {contacts.filter(c => 
                      !recipientSearchQuery || 
                      c.contact_name?.toLowerCase().includes(recipientSearchQuery.toLowerCase()) ||
                      c.contact_share_id?.toLowerCase().includes(recipientSearchQuery.toLowerCase())
                    ).map((contact) => {
                        const contactKey = contact.contact_user_id || contact.id;
                        const isSelected = contactKey ? selectedContactIdsForShare.includes(contactKey) : false;
                        const avatarSrc = contact.contact_profile_picture
                          ? `${API_BASE_URL}${contact.contact_profile_picture}`
                          : undefined;
                      
                      // Check if already shared with this contact (by user_id or share_id)
                      const existingShare = meetingShares.find(s => {
                        if (!s.is_active) return false;
                        const matchByUserId = String(s.shared_with_user_id).toLowerCase() === String(contactKey).toLowerCase();
                        const matchByShareId = s.shared_with_share_id?.toLowerCase() === contact.contact_share_id?.toLowerCase();
                        return matchByUserId || matchByShareId;
                      });
                      const isAlreadyShared = !!existingShare;
                      const existingRole = existingShare?.permissions?.role;
                      const existingHasTranscript = existingShare?.permissions?.include_transcript === true;

                      // Handler for clicking on a contact (toggle selection or revoke if already shared)
                      const handleContactClick = async () => {
                        if (!contactKey) return;
                        if (isAlreadyShared && existingShare) {
                          // Revoke the existing share - immediate action, no need to click "Partager"
                          try {
                            await revokeMeetingShare(selectedMeetingForActions!.id, existingShare.shared_with_user_id);
                            // Remove from ALL possible states to ensure clean removal
                            setMeetingShares(prev => prev.filter(s => s.id !== existingShare.id));
                            setSelectedContactIdsForShare(prev => prev.filter(id => id !== contactKey));
                            setManualShareTargets(prev => prev.filter(t => 
                              t.userId !== existingShare.shared_with_user_id && 
                              t.shareId.toUpperCase() !== contact.contact_share_id?.toUpperCase()
                            ));
                            // Show success message
                            showSuccessPopup('Accès révoqué', `${contact.contact_name} n'a plus accès à cette réunion`);
                          } catch (error) {
                            showErrorPopup('Erreur', 'Impossible de révoquer le partage');
                          }
                        } else {
                          toggleContactForShare(contact);
                        }
                      };

                        return (
                        <Box
                            key={contactKey ?? contact.id}
                          onClick={handleContactClick}
                            sx={{
                            display: 'flex',
                              alignItems: 'center',
                            gap: 2,
                            px: 2,
                            py: 1.5,
                            cursor: contactKey ? 'pointer' : 'default',
                            bgcolor: isAlreadyShared 
                              ? 'rgba(34, 197, 94, 0.06)' 
                              : (isSelected ? 'rgba(59, 130, 246, 0.06)' : 'transparent'),
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            transition: 'background-color 0.15s ease',
                            '&:hover': {
                              bgcolor: isAlreadyShared 
                                ? 'rgba(239, 68, 68, 0.06)' 
                                : (isSelected ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0, 0, 0, 0.02)'),
                            },
                            '&:last-child': { borderBottom: 'none' },
                            }}
                          >
                            <Checkbox
                            checked={isSelected || isAlreadyShared}
                            size="small"
                              disableRipple
                            sx={{ 
                              p: 0,
                              color: isAlreadyShared ? 'rgba(34, 197, 94, 0.6)' : undefined,
                              '&.Mui-checked': {
                                color: isAlreadyShared ? 'rgba(34, 197, 94, 0.8)' : undefined,
                              },
                            }}
                          />
                              <Avatar
                                src={avatarSrc}
                            sx={{ width: 36, height: 36, fontSize: '0.875rem' }}
                              >
                                {contact.contact_name?.charAt(0).toUpperCase()}
                              </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'inherit' }}>
                              {contact.contact_name}
                            </Typography>
                            {isAlreadyShared && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                                <Typography 
                                  variant="caption" 
                                  sx={{ 
                                    color: existingRole === 'editor' ? '#3b82f6' : '#6b7280',
                                    fontWeight: 500,
                                    fontSize: '0.7rem',
                                  }}
                                >
                                  {existingRole === 'editor' ? 'Éditeur' : 'Lecteur'}
                                </Typography>
                                {existingHasTranscript && (
                                  <>
                                    <Typography variant="caption" sx={{ color: '#d1d5db', fontSize: '0.65rem' }}>•</Typography>
                                    <Typography variant="caption" sx={{ color: '#6b7280', fontSize: '0.7rem' }}>
                                      + Transcription
                                        </Typography>
                                  </>
                                )}
                              </Box>
                            )}
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem', letterSpacing: 0.5 }}>
                              {contact.contact_share_id}
                </Typography>
                        </Box>
                        );
                      })}
                    
                    {/* Groupes */}
                    {hasOrganizations && organizations.filter(org =>
                      !recipientSearchQuery || org.name?.toLowerCase().includes(recipientSearchQuery.toLowerCase())
                    ).map((organization) => {
                          const isSelected = selectedOrganizationIdsForShare.includes(organization.id);
                          return (
                        <Box
                              key={organization.id}
                              onClick={() => canShareWithOrganizations && toggleOrganizationForShare(organization.id)}
                              sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            px: 2,
                            py: 1.5,
                            cursor: canShareWithOrganizations ? 'pointer' : 'not-allowed',
                            bgcolor: isSelected ? 'rgba(34, 197, 94, 0.06)' : 'transparent',
                            opacity: canShareWithOrganizations ? 1 : 0.5,
                            borderBottom: '1px solid',
                            borderColor: 'divider',
                            transition: 'background-color 0.15s ease',
                            '&:hover': {
                              bgcolor: isSelected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(0, 0, 0, 0.02)',
                            },
                            '&:last-child': { borderBottom: 'none' },
                              }}
                            >
                              <Checkbox
                                checked={isSelected}
                            size="small"
                                disableRipple
                                disabled={!canShareWithOrganizations}
                            sx={{ p: 0 }}
                          />
                          <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(34, 197, 94, 0.12)' }}>
                            <BusinessIcon sx={{ fontSize: 18, color: 'success.main' }} />
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'inherit' }}>
                              {organization.name}
              </Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
                            {organization.member_count ?? 0} membres
                          </Typography>
                        </Box>
                          );
                        })}
                    
                    {contacts.length === 0 && organizations.length === 0 && (
                      <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
                          Aucun contact disponible
              </Typography>
                      </Box>
                    )}
                  </>
                )}
              </Box>

              {/* Sélection affichée */}
              {hasSelectedRecipients && (
                <Box sx={{ mt: 2.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block', fontFamily: 'inherit' }}>
                    Sélectionnés :
                    </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {selectedContactsForShareDisplay.map((contact) => (
                      <Chip
                        key={`contact-${contact.contact_user_id || contact.id}`}
                        label={contact.contact_name}
                        onDelete={() => toggleContactForShare(contact)}
                        size="small"
                        sx={{ borderRadius: 1, fontFamily: 'inherit' }}
                      />
                    ))}
                    {manualShareTargets.map((target) => (
                      <Chip
                        key={`manual-${target.shareId}`}
                        label={target.name || target.shareId}
                        onDelete={() => handleRemoveManualShareTarget(target.shareId)}
                        size="small"
                        sx={{ borderRadius: 1, fontFamily: 'inherit' }}
                      />
                    ))}
                    {selectedOrganizationsForShareDisplay.map((org) => (
                      <Chip
                        key={`org-${org.id}`}
                        label={org.name}
                        onDelete={() => toggleOrganizationForShare(org.id)}
                        size="small"
                        color="success"
                        sx={{ borderRadius: 1, fontFamily: 'inherit' }}
                      />
                    ))}
                  </Stack>
                </Box>
                      )}
                    </Box>

            {/* Colonne droite - Options & Historique */}
            <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
              
              {/* Accordéon pour ajouter via ID */}
              <Accordion 
                disableGutters
                elevation={0}
                sx={{ 
                  mb: 3,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '6px !important',
                  '&:before': { display: 'none' },
                  '&.Mui-expanded': { margin: 0, mb: 3 },
                }}
              >
                <AccordionSummary
                  expandIcon={<KeyboardArrowDownIcon />}
                  sx={{
                    minHeight: 44,
                    px: 2,
                    '& .MuiAccordionSummary-content': { my: 1 },
                  }}
                >
                  <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
                    Ajouter par ID de partage
                    </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 2, pb: 2, pt: 0 }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'stretch' }}>
                      <TextField
                      size="small"
                      placeholder="Ex: ABC123"
                        value={shareIdInput}
                        onChange={(e) => setShareIdInput(e.target.value.toUpperCase())}
                      inputProps={{ maxLength: 6, style: { fontFamily: 'monospace', letterSpacing: 3, textAlign: 'center' } }}
                      sx={{ flex: 1 }}
                      />
                      <Button
                      variant="outlined"
                        onClick={handleAddManualShareTarget}
                      disabled={sharingMeeting || verifyingShareId || shareIdInput.trim().length !== 6 || !verifiedUser}
                      disableRipple
                        sx={{
                        minWidth: 90,
                        borderRadius: 1,
                        height: 40,
                        transition: 'background-color 0.15s ease',
                        '&:hover': {
                          bgcolor: 'rgba(59, 130, 246, 0.04)',
                          transform: 'none',
                        },
                      }}
                    >
                      {verifyingShareId ? '...' : 'Ajouter'}
                      </Button>
                  </Box>
                  {shareIdInput.length === 6 && verifiedUser && (
                    <Typography variant="caption" color="success.main" sx={{ mt: 1, display: 'block', fontFamily: 'inherit' }}>
                      Utilisateur trouvé : {verifiedUser.name}
                    </Typography>
                  )}
                  {shareValidationError && (
                    <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block', fontFamily: 'inherit' }}>
                        {shareValidationError}
                    </Typography>
                    )}
                </AccordionDetails>
              </Accordion>

              {/* Autorisations */}
              <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ mb: 2, fontFamily: 'inherit' }}>
                Niveau d'accès
              </Typography>

              <Stack spacing={1.5} sx={{ mb: 3 }}>
                <Box
                  onClick={() => setShareRole('reader')}
                  sx={{
                    p: 2,
                    borderRadius: 1.5,
                    border: '1.5px solid',
                    borderColor: shareRole === 'reader' ? 'primary.main' : 'divider',
                    bgcolor: shareRole === 'reader' ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: shareRole === 'reader' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(0, 0, 0, 0.02)',
                    },
                  }}
                >
                  <Typography variant="body2" fontWeight={600} color={shareRole === 'reader' ? 'primary.main' : 'text.primary'} sx={{ fontFamily: 'inherit' }}>
                    Lecteur
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontFamily: 'inherit' }}>
                    Peut consulter et télécharger
                  </Typography>
                </Box>
                <Box
                  onClick={() => setShareRole('editor')}
              sx={{
                    p: 2,
                    borderRadius: 1.5,
                    border: '1.5px solid',
                    borderColor: shareRole === 'editor' ? 'primary.main' : 'divider',
                    bgcolor: shareRole === 'editor' ? 'rgba(59, 130, 246, 0.04)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: shareRole === 'editor' ? 'rgba(59, 130, 246, 0.06)' : 'rgba(0, 0, 0, 0.02)',
                    },
                  }}
                >
                  <Typography variant="body2" fontWeight={600} color={shareRole === 'editor' ? 'primary.main' : 'text.primary'} sx={{ fontFamily: 'inherit' }}>
                    Éditeur
            </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontFamily: 'inherit' }}>
                    Peut modifier le résumé et partager
            </Typography>
                </Box>
              </Stack>

              {/* Option transcription */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                p: 2,
                borderRadius: 1.5,
                border: '1px solid',
                borderColor: 'divider',
                mb: 3,
                transition: 'background-color 0.15s ease',
                '&:hover': {
                  bgcolor: 'rgba(0, 0, 0, 0.01)',
                },
              }}>
                <Box>
                  <Typography variant="body2" fontWeight={500} sx={{ fontFamily: 'inherit' }}>
                    Inclure la transcription
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'inherit' }}>
                    Accès au texte complet
                  </Typography>
                </Box>
                <Switch
                  checked={includeTranscript}
                  onChange={(e) => setIncludeTranscript(e.target.checked)}
                />
              </Box>
            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ px: 4, py: 2, borderTop: '1px solid', borderColor: 'divider', gap: 1.5, flexShrink: 0 }}>
          <Button 
            onClick={handleCloseShareDialog} 
            disabled={sharingMeeting}
            variant="outlined"
            disableRipple
            sx={{ 
              px: 4,
              py: 1,
              borderRadius: 0.75,
              fontFamily: 'inherit',
              minWidth: 100,
              transition: 'background-color 0.15s ease',
              '&:hover': {
                bgcolor: 'rgba(0, 0, 0, 0.04)',
                transform: 'none',
              },
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleConfirmShare}
            variant="contained"
            disabled={!hasSelectedRecipients || sharingMeeting}
            disableElevation
            disableRipple
            sx={{
              px: 4,
              py: 1,
              borderRadius: 0.75,
              fontFamily: 'inherit',
              minWidth: 100,
              transition: 'background-color 0.15s ease',
              '&:hover': {
                transform: 'none',
              },
            }}
          >
            {sharingMeeting ? 'Partage...' : 'Partager'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue pour la lecture audio */}
      {currentAudioUrl && (
        <MeetingAudioPlayer
          audioUrl={currentAudioUrl}
          title={currentAudioTitle || "Écouter l'enregistrement"}
          open={audioDialogOpen}
          onClose={handleCloseAudioDialog}
        />
      )}
      
      {/* Dialogue pour afficher la transcription */}
      <Dialog 
        open={transcriptDialogOpen} 
        onClose={() => {
          // Fermer d'abord le dialogue, puis réinitialiser les états
          setTranscriptDialogOpen(false);
          // Utiliser setTimeout pour réinitialiser les états après la fermeture du dialogue
          setTimeout(() => {
            setTranscript(null);
            setFormattedTranscript(null);
          }, 300); // Délai légèrement supérieur à la durée de l'animation de fermeture du dialogue
        }}
        maxWidth="md"
        fullWidth
        sx={{ 
          '& .MuiDialog-paper': { 
            borderRadius: 2,
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {isEditingTranscript ? 'Éditer la transcription' : 'Transcription'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Bouton d'édition de transcription */}
            {!isEditingTranscript && formattedTranscript && formattedTranscript.length > 0 && (
              <IconButton 
                onClick={startEditingTranscript}
                color="primary"
                title="Éditer la transcription"
              >
                <EditIcon />
              </IconButton>
            )}
            
            {/* Bouton d'exportation de transcription */}
            {!isEditingTranscript && selectedMeeting && (
              <TranscriptExportButton 
                transcript={formattedTranscript}
                meetingId={selectedMeeting.id}
                meetingName={selectedMeeting.title || 'Réunion'}
                meetingDate={new Date(selectedMeeting.created_at).toLocaleDateString()}
                onSuccess={() => { /* Succès silencieux */ }}
                onError={(message) => showErrorPopup('Erreur', message)}
              />
            )}
            <IconButton onClick={() => {
              if (isEditingTranscript) {
                cancelEditingTranscript();
              }
              setTranscriptDialogOpen(false);
              setTimeout(() => {
                setTranscript(null);
                setFormattedTranscript(null);
              }, 300);
            }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        {/* Gestion des speakers */}
        {formattedTranscript && formattedTranscript.length > 0 && selectedMeeting && (
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #eee', bgcolor: '#fafafa' }}>
            {/* En-tête cliquable pour plier/déplier */}
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                py: 1,
                px: 2,
                borderRadius: 2,
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: 'rgba(59, 130, 246, 0.05)'
                }
              }}
              onClick={() => setShowSpeakerManagement(!showSpeakerManagement)}
            >
              <PersonIcon sx={{ mr: 1, color: 'primary.main', fontSize: 24 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', flex: 1 }}>
                Gestion des Locuteurs ({getUniqueSpeakers(formattedTranscript).length})
              </Typography>
              {showSpeakerManagement ? <ExpandLessIcon color="primary" /> : <ExpandMoreIcon color="primary" />}
            </Box>
            
            {/* Contenu pliable */}
            {showSpeakerManagement && (
              <Fade in={showSpeakerManagement} timeout={300}>
                <Box sx={{ mt: 2 }}>
                  {/* Liste compacte des speakers */}
                  <Grid container spacing={2}>
                    {getUniqueSpeakers(formattedTranscript).map((speaker, index) => {
                      const originalSpeakerId = speaker;
                      const isEditing = editingSpeaker === speaker;
                      
                      // Couleurs d'avatar plus petites
                      const avatarColors = [
                        { bg: '#E3F2FD', color: '#1976D2' },
                        { bg: '#F3E5F5', color: '#7B1FA2' },
                        { bg: '#E8F5E9', color: '#388E3C' },
                        { bg: '#FFF3E0', color: '#F57C00' },
                        { bg: '#FCE4EC', color: '#C2185B' },
                        { bg: '#F1F8E9', color: '#689F38' },
                      ];
                      const avatarStyle = avatarColors[index % avatarColors.length];
                      
                      return (
                        <Grid item xs={12} sm={6} key={speaker}>
                          <Paper 
                            elevation={1}
                            sx={{ 
                              p: 2, 
                              borderRadius: 2,
                              bgcolor: hasCustomName(selectedMeeting.id, originalSpeakerId) ? '#f8f9ff' : 'white',
                              border: hasCustomName(selectedMeeting.id, originalSpeakerId) ? '1px solid #3B82F6' : '1px solid #e0e0e0',
                              transition: 'all 0.2s ease',
                              '&:hover': {
                                elevation: 2,
                                transform: 'translateY(-1px)'
                              }
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                              {/* Avatar plus petit */}
                              <Box
                                sx={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '50%',
                                  bgcolor: avatarStyle.bg,
                                  color: avatarStyle.color,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  mr: 1.5,
                                  border: `1px solid ${avatarStyle.color}30`
                                }}
                              >
                                <PersonIcon sx={{ fontSize: 18 }} />
                              </Box>
                              
                              <Box sx={{ flex: 1 }}>
                                {isEditing ? (
                                  <SpeakerNameAutocomplete
                                    value={editingName}
                                    onChange={(value) => setEditingName(value)}
                                    placeholder="Nom du locuteur"
                                    autoFocus
                                    onBlur={() => {
                                      // Sauvegarder automatiquement quand on clique ailleurs
                                      if (editingName.trim()) {
                                        handleSaveSpeakerName(speaker, editingName.trim());
                                      } else {
                                        cancelEditing();
                                      }
                                    }}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault(); // Empêcher la navigation par défaut
                                        handleSaveSpeakerName(speaker, editingName.trim());
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        cancelEditing();
                                      }
                                    }}
                                    size="small"
                                  />
                                ) : (
                                  <Box>
                                    <Typography 
                                      variant="body1" 
                                      sx={{ 
                                        fontWeight: 600,
                                        color: hasCustomName(selectedMeeting.id, originalSpeakerId) ? '#3B82F6' : 'text.primary',
                                        fontSize: '0.95rem'
                                      }}
                                    >
                                      {speaker}
                                    </Typography>
                                    {hasCustomName(selectedMeeting.id, originalSpeakerId) && (
                                      <Chip
                                        label="Custom"
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                        sx={{ 
                                          fontSize: '0.65rem', 
                                          height: 20,
                                          mt: 0.5
                                        }}
                                      />
                                    )}
                                  </Box>
                                )}
                              </Box>
                            </Box>
                            
                            {/* Boutons d'action compacts */}
                            {isEditing ? (
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  onClick={() => handleSaveSpeakerName(speaker, editingName)}
                                  variant="contained"
                                  color="success"
                                  size="small"
                                  startIcon={<CheckIcon sx={{ fontSize: 16 }} />}
                                  sx={{ 
                                    flex: 1, 
                                    borderRadius: 1.5,
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    fontSize: '0.8rem',
                                    py: 0.5
                                  }}
                                >
                                  OK
                                </Button>
                                <Button
                                  onClick={cancelEditing}
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                                  sx={{ 
                                    flex: 1, 
                                    borderRadius: 1.5,
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    fontSize: '0.8rem',
                                    py: 0.5
                                  }}
                                >
                                  Annuler
                                </Button>
                              </Box>
                            ) : (
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  onClick={() => startEditingSpeaker(speaker)}
                                  variant="contained"
                                  color="primary"
                                  size="small"
                                  startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                                  sx={{ 
                                    flex: 1, 
                                    borderRadius: 1.5,
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    fontSize: '0.8rem',
                                    py: 0.5
                                  }}
                                >
                                  Renommer
                                </Button>
                              </Box>
                            )}
                          </Paper>
                        </Grid>
                      );
                    })}
                  </Grid>
                  
                </Box>
              </Fade>
            )}
          </Box>
        )}
        
        <DialogContent sx={{ mt: 2, minHeight: '300px', maxHeight: '60vh', overflowY: 'auto' }}>
          {isLoadingTranscript ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 4 }}>
              <CircularProgress size={40} sx={{ mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Loading Transcript...</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                Please wait while we retrieve the transcript.
              </Typography>
            </Box>
          ) : isEditingTranscript ? (
            // Mode d'édition avec les speakers visuels mais éditables
            <Box sx={{ padding: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
                <EditIcon sx={{ fontSize: 16, mr: 1, verticalAlign: 'middle' }} />
                Mode édition : Modifiez le texte directement dans les bulles de conversation ci-dessous. Les modifications seront sauvegardées automatiquement.
              </Typography>
              {formattedTranscript && formattedTranscript.map((utterance, index) => {
                // Générer une couleur d'avatar basée sur le nom du speaker
                const speakerIndex = getUniqueSpeakers(formattedTranscript).indexOf(utterance.speaker);
                const avatarColors = [
                  { bg: '#E3F2FD', color: '#1976D2' }, // Bleu
                  { bg: '#F3E5F5', color: '#7B1FA2' }, // Violet
                  { bg: '#E8F5E9', color: '#388E3C' }, // Vert
                  { bg: '#FFF3E0', color: '#F57C00' }, // Orange
                  { bg: '#FCE4EC', color: '#C2185B' }, // Rose
                  { bg: '#F1F8E9', color: '#689F38' }, // Vert clair
                ];
                const avatarStyle = avatarColors[speakerIndex % avatarColors.length];
                
                return (
                  <Box key={index} sx={{ mb: 3, display: 'flex', alignItems: 'flex-start' }}>
                    {/* Avatar du speaker */}
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: avatarStyle.bg,
                        color: avatarStyle.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 2,
                        mt: 0.5,
                        border: `2px solid ${avatarStyle.color}20`,
                        flexShrink: 0
                      }}
                    >
                      <PersonIcon sx={{ fontSize: 20 }} />
                    </Box>
                    
                    {/* Contenu de l'utterance éditable */}
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 600,
                            color: avatarStyle.color,
                            mr: 1
                          }}
                        >
                          {utterance.speaker}
                        </Typography>
                        {utterance.timestamp && (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.secondary' }}
                          >
                            {utterance.timestamp}
                          </Typography>
                        )}
                      </Box>
                      {/* TextField éditable avec le style de la bulle de conversation */}
                      <TextField
                        multiline
                        fullWidth
                        value={utterance.text}
                        onChange={(e) => {
                          const newTranscript = [...formattedTranscript];
                          newTranscript[index] = { ...utterance, text: e.target.value };
                          setFormattedTranscript(newTranscript);
                          
                          // Mettre à jour aussi le texte brut pour la sauvegarde
                          const newRawText = newTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');
                          setEditedTranscriptText(newRawText);
                        }}
                        variant="outlined"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            pl: 2,
                            borderLeft: `3px solid ${avatarStyle.color}40`,
                            lineHeight: 1.6,
                            bgcolor: `${avatarStyle.color}08`,
                            borderRadius: 1,
                            fontSize: '1rem',
                            fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
                            '&:hover': {
                              bgcolor: `${avatarStyle.color}12`,
                            },
                            '&.Mui-focused': {
                              bgcolor: 'white',
                              boxShadow: `0 0 0 2px ${avatarStyle.color}40`,
                            }
                          },
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: `${avatarStyle.color}30`,
                          },
                          '& .MuiInputBase-input': {
                            padding: '12px 16px',
                          }
                        }}
                      />
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : formattedTranscript && formattedTranscript.length > 0 ? (
            <Box sx={{ padding: 2 }}>
              {formattedTranscript.map((utterance, index) => {
                // Générer une couleur d'avatar basée sur le nom du speaker
                const speakerIndex = getUniqueSpeakers(formattedTranscript).indexOf(utterance.speaker);
                const avatarColors = [
                  { bg: '#E3F2FD', color: '#1976D2' }, // Bleu
                  { bg: '#F3E5F5', color: '#7B1FA2' }, // Violet
                  { bg: '#E8F5E9', color: '#388E3C' }, // Vert
                  { bg: '#FFF3E0', color: '#F57C00' }, // Orange
                  { bg: '#FCE4EC', color: '#C2185B' }, // Rose
                  { bg: '#F1F8E9', color: '#689F38' }, // Vert clair
                ];
                const avatarStyle = avatarColors[speakerIndex % avatarColors.length];
                
                return (
                  <Box key={index} sx={{ mb: 3, display: 'flex', alignItems: 'flex-start' }}>
                    {/* Avatar du speaker */}
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: avatarStyle.bg,
                        color: avatarStyle.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mr: 2,
                        mt: 0.5,
                        border: `2px solid ${avatarStyle.color}20`,
                        flexShrink: 0
                      }}
                    >
                      <PersonIcon sx={{ fontSize: 20 }} />
                    </Box>
                    
                    {/* Contenu de l'utterance */}
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Typography
                          variant="subtitle1"
                          sx={{
                            fontWeight: 600,
                            color: avatarStyle.color,
                            mr: 1
                          }}
                        >
                          {utterance.speaker}
                        </Typography>
                        {utterance.timestamp && (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ color: 'text.secondary' }}
                          >
                            {utterance.timestamp}
                          </Typography>
                        )}
                      </Box>
                      <Typography
                        variant="body1"
                        sx={{
                          pl: 2,
                          borderLeft: `3px solid ${avatarStyle.color}40`,
                          lineHeight: 1.6,
                          bgcolor: `${avatarStyle.color}08`,
                          py: 1,
                          borderRadius: 1
                        }}
                      >
                        {utterance.text}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 4 }}>
              <WarningIcon color="warning" sx={{ fontSize: 48, mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>Transcription non disponible</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
                La transcription de cette réunion n'a pas été générée ou le processus de transcription a échoué.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {isEditingTranscript ? (
            <>
              <Button 
                onClick={cancelEditingTranscript}
                color="inherit"
                disabled={isSavingTranscript}
              >
                Annuler
              </Button>
              <Button 
                onClick={saveTranscriptChanges}
                variant="contained"
                color="primary"
                disabled={isSavingTranscript || !editedTranscriptText.trim()}
                startIcon={isSavingTranscript ? <CircularProgress size={20} /> : <SaveIcon />}
              >
                {isSavingTranscript ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </>
          ) : (
            <Button onClick={() => {
              setTranscriptDialogOpen(false);
              setTimeout(() => {
                setTranscript(null);
                setFormattedTranscript(null);
              }, 300);
            }}>Fermer</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Le menu d'exportation est maintenant géré par le composant TranscriptExportButton */}

      {/* Dialogue pour afficher le compte rendu */}
      <Dialog 
        open={!!viewingSummaryId} 
        onClose={handleCloseSummary}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            {isEditingSummary ? 'Éditer le résumé' : 'Compte rendu'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Bouton d'édition du résumé - seulement pour mes réunions */}
            {!isEditingSummary && (() => {
              const meeting = meetings.find(m => m.id === viewingSummaryId) || 
                             sharedMeetings.find(m => m.id === viewingSummaryId) ||
                             organizationMeetingsFlat.find(m => m.id === viewingSummaryId);
              // Afficher seulement si c'est ma réunion (pas partagée)
              return meeting?.summary_status === 'completed' && meeting?.summary_text && !meeting?.is_shared ? (
                <IconButton 
                  onClick={startEditingSummary}
                  color="primary"
                  title="Éditer le résumé"
                >
                  <EditIcon />
                </IconButton>
              ) : null;
            })()}
            
            {/* Bouton d'exportation de compte rendu */}
            {!isEditingSummary && (() => {
              const meeting = meetings.find(m => m.id === viewingSummaryId) || 
                             sharedMeetings.find(m => m.id === viewingSummaryId) ||
                             organizationMeetingsFlat.find(m => m.id === viewingSummaryId);
              if (meeting?.summary_status === 'completed' && meeting?.summary_text) {
                const templateForExport = resolveTemplateForMeeting(meeting);
                
                logger.debug('📄 Template utilisé pour la génération:', meeting.template_id);
                logger.debug('📄 Template récupéré:', {
                  name: templateForExport?.name,
                  logo_url: templateForExport?.logo_url,
                  is_default: templateForExport?.is_default,
                  id: templateForExport?.id
                });
                
                return (
                  <SummaryExportButton
                    summaryText={meeting.summary_text}
                    meetingId={meeting.id}
                    meetingName={meeting.title || 'Réunion'}
                    meetingDate={new Date(meeting.created_at).toLocaleDateString('fr-FR')}
                    logoUrl={templateForExport?.logo_url}
                    layoutConfig={templateForExport?.layout_config}
                    onSuccess={() => { /* Succès silencieux */ }}
                    onError={(message) => showErrorPopup('Erreur', message)}
                  />
                );
              }
              return null;
            })()}
            <IconButton onClick={() => {
              if (isEditingSummary) {
                cancelEditingSummary();
              }
              handleCloseSummary();
            }}>
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ mt: 2, minHeight: '300px', maxHeight: '60vh', overflowY: 'auto' }}>
          {(() => {
            const meeting = meetings.find(m => m.id === viewingSummaryId) || 
                           sharedMeetings.find(m => m.id === viewingSummaryId) ||
                           organizationMeetingsFlat.find(m => m.id === viewingSummaryId);
            if (!meeting) return null;
            return (
              <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Date: {new Date(meeting.created_at).toLocaleDateString('fr-FR')}
              </Typography>
                {meeting.is_shared && meeting.shared_by && (
                  <Chip
                    icon={<PeopleIcon sx={{ fontSize: '0.9rem' }} />}
                    label={`Partagée par ${meeting.shared_by}`}
                    size="small"
                    sx={{
                      mb: 2,
                      bgcolor: 'rgba(156, 39, 176, 0.1)',
                      color: '#9C27B0',
                      border: '1px solid rgba(156, 39, 176, 0.3)',
                      fontWeight: 600
                    }}
                  />
                )}
              </>
            );
          })()}
          {isEditingSummary ? (
            <Box sx={{ padding: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3, p: 2, bgcolor: '#f8f9fa', borderRadius: 1, border: '1px solid #e9ecef' }}>
                Modifiez le contenu du résumé ci-dessous. Le formatage Markdown sera préservé.
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={15}
                maxRows={25}
                value={editedSummaryText}
                onChange={(e) => setEditedSummaryText(e.target.value)}
                variant="outlined"
                placeholder="Contenu du résumé..."
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontFamily: 'monospace',
                    fontSize: '0.9rem',
                    lineHeight: 1.6,
                    backgroundColor: '#fafafa',
                  }
                }}
              />
            </Box>
          ) : (
            renderSummary()
          )}
        </DialogContent>
        <DialogActions>
          {isEditingSummary ? (
            <>
              <Button 
                onClick={cancelEditingSummary}
                disabled={isSavingSummary}
              >
                Annuler
              </Button>
              <Button 
                onClick={saveSummaryChanges}
                variant="contained"
                color="primary"
                disabled={isSavingSummary || !editedSummaryText.trim()}
                startIcon={isSavingSummary ? <CircularProgress size={20} /> : <SaveIcon />}
              >
                {isSavingSummary ? 'Sauvegarde...' : 'Sauvegarder'}
              </Button>
            </>
          ) : (
          <Button onClick={handleCloseSummary}>Fermer</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Dialogue Premium */}
      <Dialog 
        open={showPremiumDialog} 
        onClose={handleClosePremiumDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 2,
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2
        }}>
          <Typography variant="h6">Fonctionnalité Premium</Typography>
          <IconButton onClick={handleClosePremiumDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ py: 3 }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            textAlign: 'center',
            mb: 2
          }}>
            <Box 
              sx={{ 
                bgcolor: 'primary.light', 
                color: 'primary.main',
                borderRadius: '50%',
                p: 2,
                mb: 2,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              <ShareIcon fontSize="large" />
            </Box>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Gestion des accès partagés
            </Typography>
            <Typography variant="body1" sx={{ mb: 3 }}>
              Cette fonctionnalité est disponible uniquement avec un abonnement premium.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Avec le plan premium, vous pouvez partager vos transcriptions avec votre équipe et gérer les accès de manière sécurisée.
            </Typography>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button onClick={handleClosePremiumDialog} color="inherit">Annuler</Button>
          <Button 
            onClick={handleContactSupport} 
            variant="contained" 
            color="primary"
            startIcon={<ShareIcon />}
          >
            Contacter Lexia France
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue de confirmation de suppression */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={cancelDeleteMeeting}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 12px 28px rgba(0,0,0,0.1)',
            overflow: 'visible'
          }
        }}
        maxWidth="xs"
        fullWidth
      >
        {/* Retrait du cercle flottant avec l'icône pour éviter les redondances */}
        
        <DialogTitle 
          id="delete-dialog-title"
          sx={{ 
            pt: 3,
            textAlign: 'center',
            fontWeight: 500,
            fontSize: '1.25rem',
            color: 'text.primary',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1
          }}
        >
          <Box
            sx={{
              width: '70px',
              height: '70px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(244, 67, 54, 0.06) 0%, rgba(244, 67, 54, 0.12) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
              position: 'relative',
              boxShadow: '0 4px 12px rgba(244, 67, 54, 0.08)'
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                border: '1px solid rgba(244, 67, 54, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
            <Typography sx={{ fontSize: '30px', position: 'relative' }}>🗑</Typography>
          </Box>
          {meetingToDelete?.is_shared ? 'Retirer cette réunion ?' : 'Supprimer cette réunion ?'}
        </DialogTitle>
        
        <DialogContent sx={{ px: 3 }}>
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              textAlign: 'center',
              lineHeight: 1.6
            }}
          >
            {meetingToDelete?.is_shared 
              ? 'Cette réunion sera retirée de votre espace. Vous ne pourrez plus y accéder sauf si elle vous est partagée à nouveau.'
              : 'Les transcriptions et comptes rendus associés seront définitivement supprimés. Cette action est irréversible.'
            }
          </Typography>
        </DialogContent>
        
        <DialogActions sx={{ pb: 4, px: 3, justifyContent: 'center', gap: 2 }}>
          <Button
            onClick={cancelDeleteMeeting}
            sx={{
              borderRadius: '28px',
              textTransform: 'none',
              fontWeight: 500,
              px: 3,
              py: 1.2,
              border: '1px solid rgba(0, 0, 0, 0.12)',
              minWidth: '120px',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.03)',
                borderColor: 'rgba(0, 0, 0, 0.2)'
              }
            }}
          >
            Annuler
          </Button>
          <Button
            onClick={handleDeleteMeeting}
            color="error"
            variant="contained"
            sx={{
              borderRadius: '28px',
              textTransform: 'none',
              fontWeight: 500,
              px: 3,
              py: 1.2,
              minWidth: '120px',
              boxShadow: '0 4px 10px rgba(244, 67, 54, 0.2)',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                boxShadow: '0 6px 12px rgba(244, 67, 54, 0.3)',
                backgroundColor: '#d32f2f'
              }
            }}
          >
            {meetingToDelete?.is_shared ? 'Retirer' : 'Supprimer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Popup élégant pour Gilbert IA */}
      <Dialog
        open={showGilbertPopup}
        onClose={() => setShowGilbertPopup(false)}
        TransitionComponent={Zoom}
        PaperProps={{
          sx: {
            borderRadius: '16px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%)',
            maxWidth: '400px',
            width: '100%'
          }
        }}
      >
        <Box
          sx={{
            position: 'relative',
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}
        >
          <IconButton
            onClick={() => setShowGilbertPopup(false)}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: 'text.secondary',
              '&:hover': {
                color: 'primary.main',
                backgroundColor: 'rgba(59, 130, 246, 0.08)'
              }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          <Box
            sx={{
              mb: 2,
              mt: 1,
              position: 'relative',
              display: 'inline-block'
            }}
          >
            <img
              src="/img/dis_gilbert.png"
              alt="Assistant IA Gilbert"
              style={{
                width: '75px',
                height: '75px',
                objectFit: 'contain',
                filter: 'drop-shadow(0px 4px 8px rgba(0, 0, 0, 0.15))'
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                top: -5,
                right: -5,
                backgroundColor: '#3B82F6',
                color: 'white',
                borderRadius: '50%',
                width: 30,
                height: 30,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 10px rgba(59, 130, 246, 0.5)',
                zIndex: 2
              }}
            >
              <NewReleasesIcon fontSize="small" />
            </Box>
          </Box>

          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              mb: 1,
              background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Gilbert IA arrive bientôt !
          </Typography>

          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Notre assistant intelligent pour faciliter la gestion de vos réunions est en cours de développement.
            Restez à l'écoute pour découvrir ses fonctionnalités innovantes !
          </Typography>
          
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              gap: 2,
              width: '100%'
            }}
          >
            <Button
              variant="contained"
              color="primary"
              onClick={() => setShowGilbertPopup(false)}
              sx={{
                borderRadius: '8px',
                textTransform: 'none',
                fontWeight: 600,
                py: 1,
                px: 3,
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                '&:hover': {
                  background: 'linear-gradient(90deg, #2563EB 0%, #7C3AED 100%)',
                  boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
                }
              }}
            >
              J'ai hâte de découvrir !
            </Button>
          </Box>
        </Box>
      </Dialog>

      {/* Modal de sélection de template */}
      <Dialog
        open={templateSelectorOpen}
        onClose={() => setTemplateSelectorOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={window.innerWidth < 768} // Fullscreen sur mobile
        sx={{
          '& .MuiDialog-paper': {
            margin: window.innerWidth < 768 ? 0 : 'auto',
            maxHeight: window.innerWidth < 768 ? '100vh' : '90vh',
            borderRadius: window.innerWidth < 768 ? 0 : '8px',
          }
        }}
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SummarizeIcon />
            <Typography variant="h6">Choisir un template de résumé</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Sélectionnez un template pour générer votre résumé de réunion.
          </Typography>
          
          {templatesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {userTemplates.map((template) => (
                <Card
                  key={template.id}
                  sx={{
                    cursor: 'pointer',
                    border: selectedTemplateForGeneration === template.id ? 2 : 1,
                    borderColor: selectedTemplateForGeneration === template.id ? 'primary.main' : 'divider',
                    '&:hover': { borderColor: 'primary.main' }
                  }}
                  onClick={() => setSelectedTemplateForGeneration(template.id)}
                >
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Radio
                        checked={selectedTemplateForGeneration === template.id}
                        onChange={() => setSelectedTemplateForGeneration(template.id)}
                      />
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                          <Typography variant="h6">{template.name}</Typography>
                          {template.is_default && (
                            <Chip 
                              label="Par défaut" 
                              size="small" 
                              color="primary" 
                              variant="outlined"
                            />
                          )}
                          {template.is_system && (
                            <Chip 
                              label="Système" 
                              size="small" 
                              color="secondary" 
                              variant="outlined"
                            />
                          )}
                        </Box>
                        <Typography variant="body2" color="text.secondary">
                          {template.description || 'Aucune description disponible'}
                        </Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              ))}
              
              {userTemplates.length === 0 && !templatesLoading && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    Aucun template disponible. Créez un template dans la page "Mes Templates".
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemplateSelectorOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              if (currentMeetingId && selectedTemplateForGeneration) {
                // FORCER LA MISE À JOUR IMMÉDIATE ET SYNCHRONE
                flushSync(() => {
                  setLocalGeneratingId(currentMeetingId);
                  setGeneratingSummaryId(currentMeetingId);
                  
                  // Mettre à jour immédiatement le statut de la réunion pour afficher "En cours..."
                  setMeetings(prevMeetings => 
                    prevMeetings.map(meeting => 
                      meeting.id === currentMeetingId 
                        ? { ...meeting, summary_status: 'processing' }
                        : meeting
                    )
                  );
                  
                  setTemplateSelectorOpen(false);
                });
                
                // Lancer la génération en arrière-plan
                handleGenerateSummary(currentMeetingId);
              }
            }}
            disabled={(generatingSummaryId === currentMeetingId || localGeneratingId === currentMeetingId) || !selectedTemplateForGeneration}
            startIcon={(generatingSummaryId === currentMeetingId || localGeneratingId === currentMeetingId) ? <CircularProgress size={16} /> : <SummarizeIcon />}
          >
            {(generatingSummaryId === currentMeetingId || localGeneratingId === currentMeetingId) ? 'Génération...' : 'Générer le résumé'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Overlay de détail de réunion */}
      <MeetingDetailOverlay
        open={meetingDetailOverlayOpen}
        onClose={handleCloseDetailOverlay}
        meeting={overlayMeeting}
        formattedTranscript={formattedTranscript}
        isLoadingTranscript={isLoadingTranscript}
        onLoadTranscript={handleLoadTranscriptForOverlay}
        onSaveSpeakerName={(speakerId, customName) => {
          if (overlayMeeting) {
            handleSaveSpeakerName(speakerId, customName);
          }
        }}
        hasCustomName={hasCustomName}
        isEditingTranscript={isEditingTranscript}
        onStartEditTranscript={startEditingTranscript}
        onCancelEditTranscript={cancelEditingTranscript}
        onSaveTranscript={saveTranscriptChanges}
        isSavingTranscript={isSavingTranscript}
        editedTranscriptText={editedTranscriptText}
        onTranscriptTextChange={setEditedTranscriptText}
        onTranscriptEntryChange={(index, newText) => {
          if (formattedTranscript) {
            const newTranscript = [...formattedTranscript];
            newTranscript[index] = { ...newTranscript[index], text: newText };
            setFormattedTranscript(newTranscript);
            const newRawText = newTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');
            setEditedTranscriptText(newRawText);
          }
        }}
        templates={userTemplates}
        selectedTemplateId={selectedTemplateForGeneration}
        onSelectTemplate={setSelectedTemplateForGeneration}
        onGenerateSummary={handleGenerateSummaryFromOverlay}
        isGeneratingSummary={generatingSummaryId === overlayMeeting?.id}
        isEditingSummary={isEditingSummary}
        editedSummaryText={editedSummaryText}
        onStartEditSummary={startEditingSummary}
        onCancelEditSummary={cancelEditingSummary}
        onSaveSummary={saveSummaryChanges}
        isSavingSummary={isSavingSummary}
        onSummaryTextChange={setEditedSummaryText}
        onDelete={(meetingId) => {
          const meeting = findMeetingAnywhere(meetingId);
          if (meeting) {
            setMeetingToDelete(meeting);
            setDeleteConfirmOpen(true);
          }
          handleCloseDetailOverlay();
        }}
        onShare={async (meeting) => {
          // Vérifier si le résumé a été généré avant de permettre le partage
          // Vérifier correctement : summary_status doit être 'completed' OU summary_text doit exister et ne pas être vide
          const summaryStatus = meeting.summary_status || meeting.summary?.status;
          const summaryText = meeting.summary_text;
          
          // Le résumé est considéré comme généré si :
          // 1. Le statut est 'completed', OU
          // 2. Le texte existe et n'est pas vide (même si le statut n'est pas encore mis à jour)
          const hasSummary = summaryStatus === 'completed' || 
                             (summaryText && summaryText.trim().length > 0);
          
          if (!hasSummary) {
            showErrorPopup('Partage impossible', 'Le résumé de cette réunion n\'a pas encore été généré. Veuillez d\'abord générer le résumé avant de partager.');
            return;
          }
          
          setSelectedMeetingForActions(meeting);
          setShareDialogOpen(true);
          handleCloseDetailOverlay();
          
          // Charger l'historique des partages pour cette réunion
          setLoadingMeetingShares(true);
          try {
            const shares = await getMeetingShares(meeting.id);
            setMeetingShares(shares);
          } catch (error) {
            logger.error('Erreur lors du chargement des partages:', error);
            setMeetingShares([]);
          } finally {
            setLoadingMeetingShares(false);
          }
        }}
        onPlayAudio={(meetingId, title) => {
          handlePlayAudio(meetingId, title);
        }}
        onSaveTitle={async (meetingId, newTitle) => {
          try {
            await handleSaveMeetingNameDirect(meetingId, newTitle);
            // Update the overlay meeting with the new title
            setOverlayMeeting(prev => prev ? { ...prev, title: newTitle, name: newTitle } : prev);
          } catch (err) {
            logger.error('Error saving title:', err);
          }
        }}
        resolveTemplateForMeeting={resolveTemplateForMeeting}
        onError={showErrorPopup}
      />

      {/* ===== DRAG AND DROP - DOSSIERS EN OVERLAY ===== */}
      {isDragging && (
        <>
          {/* Overlay légèrement flouté */}
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(6px)',
              zIndex: 9997,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              p: 4,
            }}
          >
            {/* Dossiers affichés */}
            {loadingFolders ? (
              <CircularProgress size={32} />
            ) : (
              <>
                {availableFolders.map((folder) => {
                  const depth = getFolderDepthFromMap(folder, availableFolderMap);
                  const pathLabel = getFolderPathLabelFromMap(folder, availableFolderMap);
                  const parentName = folder.parent_id ? availableFolderMap.get(folder.parent_id)?.name : null;
                  return (
                  <Box
                    key={folder.id}
                    data-folder-id={folder.id}
                    ref={(el: HTMLDivElement | null) => { folderRefs.current[folder.id] = el; }}
                    sx={{
                      position: 'relative',
                      pt: 1.5,
                      pl: depth > 0 ? 2 + depth * 1 : 0,
                      borderLeft: depth > 0 ? '3px solid rgba(59, 130, 246, 0.2)' : 'none',
                      bgcolor: depth > 0 ? 'rgba(59, 130, 246, 0.02)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: hoveredFolderId === folder.id ? 'scale(1.03)' : 'none',
                      opacity: hoveredFolderId && hoveredFolderId !== folder.id && hoveredFolderId !== 'new' ? 0.5 : 1,
                    }}
                  >
                    {/* Onglet du dossier */}
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 14,
                        width: 55,
                        height: 14,
                        bgcolor: hoveredFolderId === folder.id 
                          ? 'rgba(59, 130, 246, 0.4)' 
                          : `${folder.color}30`,
                        borderRadius: '7px 7px 0 0',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    {/* Corps du dossier */}
                    <Paper
                      elevation={hoveredFolderId === folder.id ? 12 : 4}
                      sx={{
                        p: 2.5,
                        px: 4,
                        borderRadius: '4px 14px 14px 14px',
                        border: hoveredFolderId === folder.id 
                          ? '2px solid rgba(59, 130, 246, 0.6)' 
                          : '1px solid rgba(0,0,0,0.08)',
                        bgcolor: hoveredFolderId === folder.id 
                          ? 'rgba(59, 130, 246, 0.08)' 
                          : 'white',
                        transition: 'all 0.2s ease',
                        minWidth: 160,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="subtitle1" fontWeight={600} noWrap>
                          {folder.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {folder.meeting_count} réunion{folder.meeting_count !== 1 ? 's' : ''}
                        </Typography>
                        {droppingToFolder === folder.id && (
                          <CircularProgress size={16} sx={{ mt: 1 }} />
                        )}
                      </Box>
                    </Paper>
                    {/* Info hiérarchie */}
                    <Box sx={{ mt: 0.5, px: 1 }}>
                      {pathLabel && depth > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {pathLabel}
                        </Typography>
                      )}
                      {parentName && (
                        <Chip
                          size="small"
                          label={`Sous-dossier de ${parentName}`}
                          sx={{
                            mt: 0.5,
                            height: 18,
                            fontSize: '0.65rem',
                            bgcolor: 'rgba(59, 130, 246, 0.08)',
                            color: '#1d4ed8',
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                )})}
                
                {/* Nouveau dossier */}
                <Box
                  ref={(el: HTMLDivElement | null) => { folderRefs.current['new'] = el; }}
                  sx={{
                    position: 'relative',
                    pt: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    transform: hoveredFolderId === 'new' ? 'scale(1.03)' : 'none',
                    opacity: hoveredFolderId && hoveredFolderId !== 'new' ? 0.5 : 1,
                    zIndex: 1,
                  }}
                >
                  {/* Onglet du dossier */}
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 14,
                      width: 55,
                      height: 14,
                      bgcolor: hoveredFolderId === 'new' 
                        ? 'rgba(59, 130, 246, 0.4)' 
                        : 'rgba(59, 130, 246, 0.15)',
                      borderRadius: '7px 7px 0 0',
                      border: '2px dashed',
                      borderBottom: 'none',
                      borderColor: hoveredFolderId === 'new' ? '#3b82f6' : 'rgba(59, 130, 246, 0.3)',
                      transition: 'all 0.2s ease',
                    }}
                  />
                  {/* Corps du dossier */}
                  <Paper
                    elevation={hoveredFolderId === 'new' ? 12 : 4}
                    sx={{
                      p: 2.5,
                      px: 4,
                      borderRadius: '4px 14px 14px 14px',
                      border: hoveredFolderId === 'new' 
                        ? '2px solid #3b82f6' 
                        : '2px dashed rgba(59, 130, 246, 0.3)',
                      bgcolor: hoveredFolderId === 'new' 
                        ? 'rgba(59, 130, 246, 0.08)' 
                        : 'rgba(59, 130, 246, 0.04)',
                      transition: 'all 0.2s ease',
                      minWidth: 160,
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      <AddIcon sx={{ fontSize: 24, color: '#3b82f6' }} />
                      <Typography variant="subtitle1" fontWeight={600} color="primary">
                        Nouveau
                      </Typography>
                      {creatingFolderDuringDrag && (
                        <CircularProgress size={16} sx={{ mt: 1 }} />
                      )}
                    </Box>
                  </Paper>
                </Box>
              </>
            )}
          </Box>

          {/* Vignette de réunion rectangulaire qui suit le curseur */}
          {dragPosition && draggingMeeting && (
            <Paper
              elevation={16}
              sx={{
                position: 'fixed',
                left: dragPosition.x - 120,
                top: dragPosition.y - 40,
                zIndex: 10000,
                pointerEvents: 'none',
                p: 2,
                borderRadius: 2,
                bgcolor: 'white',
                border: '2px solid #3b82f6',
                transform: 'rotate(-2deg) scale(0.85)',
                transformOrigin: 'center center',
                maxWidth: 240,
                boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
              }}
            >
              <Typography variant="subtitle2" fontWeight={600} noWrap>
                {draggingMeeting.title || draggingMeeting.name || 'Réunion'}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {draggingMeeting.created_at 
                    ? new Date(draggingMeeting.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : ''}
                </Typography>
                {draggingMeeting.duration && (
                  <Typography variant="caption" color="text.secondary">
                    {Math.floor(draggingMeeting.duration / 60)} min
                  </Typography>
                )}
              </Box>
            </Paper>
          )}
        </>
      )}

      {/* Dialog de création de dossier pendant le drag */}
      <Dialog
        open={createFolderDuringDrag}
        onClose={() => {
          setCreateFolderDuringDrag(false);
          cancelDrag();
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Créer un nouveau dossier</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nom du dossier"
            fullWidth
            variant="outlined"
            value={newFolderNameDrag}
            onChange={(e) => setNewFolderNameDrag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newFolderNameDrag.trim()) {
                handleCreateFolderDuringDrag();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setCreateFolderDuringDrag(false);
              cancelDrag();
            }}
            disabled={creatingFolderDuringDrag}
          >
            Annuler
          </Button>
          <Button 
            onClick={handleCreateFolderDuringDrag}
            variant="contained"
            disabled={!newFolderNameDrag.trim() || creatingFolderDuringDrag}
          >
            {creatingFolderDuringDrag ? <CircularProgress size={20} /> : 'Créer'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de sélection de dossier */}
      <Dialog
        open={addToFolderDialogOpen}
        onClose={() => {
          setAddToFolderDialogOpen(false);
          setSelectedFolderIds([]);
          setSelectedMeetingForActions(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Mettre dans un dossier</DialogTitle>
        <DialogContent>
          {loadingFoldersForSelection ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={32} />
            </Box>
          ) : foldersForSelection.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Aucun dossier disponible
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {foldersForSelection.map((folder) => {
                const isSelected = selectedFolderIds.includes(folder.id);
                const depth = getFolderDepth(folder);
                const parentName = folder.parent_id ? folderSelectionMap.get(folder.parent_id)?.name : null;
                const pathLabel = getFolderPathLabel(folder);
                return (
                  <Box
                    key={folder.id}
                    onClick={() => handleToggleFolderSelection(folder.id)}
                    sx={{
                      position: 'relative',
                      pt: 1.5,
                      pl: depth > 0 ? 2 + depth * 1 : 0,
                      ml: depth > 0 ? 0.5 : 0,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: isSelected ? 'scale(1.02)' : 'none',
                      borderLeft: depth > 0 ? '3px solid rgba(59, 130, 246, 0.2)' : 'none',
                      bgcolor: depth > 0 ? 'rgba(59, 130, 246, 0.02)' : 'transparent',
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
                        bgcolor: isSelected 
                          ? 'rgba(59, 130, 246, 0.4)' 
                          : `${folder.color || '#3b82f6'}20`,
                        borderRadius: '6px 6px 0 0',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    {/* Corps du dossier */}
                    <Paper
                      elevation={isSelected ? 4 : 1}
                      sx={{
                        p: 2,
                        borderRadius: '4px 12px 12px 12px',
                        border: isSelected 
                          ? '2px solid #3b82f6' 
                          : '1px solid rgba(0,0,0,0.08)',
                        bgcolor: isSelected 
                          ? 'rgba(59, 130, 246, 0.08)' 
                          : 'white',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                        '&:hover': {
                          bgcolor: isSelected 
                            ? 'rgba(59, 130, 246, 0.12)' 
                            : 'rgba(59, 130, 246, 0.04)',
                        },
                      }}
                    >
                      <Checkbox
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleFolderSelection(folder.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        sx={{ 
                          p: 0,
                          color: folder.color || '#3b82f6',
                          '&.Mui-checked': {
                            color: '#3b82f6',
                          },
                        }}
                      />
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          bgcolor: `${folder.color || '#3b82f6'}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: folder.color || '#3b82f6',
                        }}
                      >
                        <FolderIcon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {folder.name}
                        </Typography>
                        {depth > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            {pathLabel}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {folder.meeting_count} réunion{folder.meeting_count !== 1 ? 's' : ''}
                        </Typography>
                        {parentName && (
                          <Chip
                            size="small"
                            label={`Sous-dossier de ${parentName}`}
                            sx={{
                              mt: 0.5,
                              height: 20,
                              fontSize: '0.7rem',
                              bgcolor: 'rgba(59, 130, 246, 0.08)',
                              color: '#1d4ed8',
                              alignSelf: 'flex-start',
                            }}
                          />
                        )}
                      </Box>
                    </Paper>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button 
            onClick={() => {
              setAddToFolderDialogOpen(false);
              setSelectedFolderIds([]);
              setSelectedMeetingForActions(null);
            }}
          >
            Annuler
          </Button>
          <Button 
            variant="contained"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              logger.debug('Button clicked', { selectedFolderIds, selectedMeetingForActions });
              handleConfirmAddToFolders();
            }}
            disabled={selectedFolderIds.length === 0 || addingToFolders}
            sx={{ minWidth: 120 }}
          >
            {addingToFolders ? (
              <CircularProgress size={20} />
            ) : (
              `Ajouter${selectedFolderIds.length > 0 ? ` (${selectedFolderIds.length})` : ''}`
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default MyMeetings;
