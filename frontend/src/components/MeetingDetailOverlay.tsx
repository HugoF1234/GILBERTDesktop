import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogContent,
  CircularProgress,
  Grid,
  TextField,
  Paper,
  Fade,
  Slide,
  useTheme,
  alpha,
  Collapse,
  useMediaQuery,
} from '@mui/material';
import {
  Close as CloseIcon,
  Description as DescriptionIcon,
  Edit as EditIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Check as CheckIcon,
  LightbulbOutlined as LightbulbIcon,
  Groups as GroupsIcon,
  Forum as ForumIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { AnimatedTabs } from './ui/AnimatedTabs';
import {
  AnimatedSummaryIcon,
  AnimatedRefreshIcon,
} from './ui/AnimatedIcons';
import { SpeakerAvatar, SpeakerAvatarSmall } from './ui/SpeakerAvatars';
import MeetingSummaryRenderer from './MeetingSummaryRenderer';
// Lazy load des composants d'export (jsPDF, docx sont lourds)
const SummaryExportButton = lazy(() => import('./SummaryExportButton'));
const TranscriptExportButton = lazy(() => import('./TranscriptExportButton'));
// Lazy load de l'éditeur TipTap (librairie lourde)
const TipTapEditor = lazy(() => import('./TipTapEditor'));
// Lazy load du canvas de dessin
const DrawingCanvas = lazy(() => import('./ui/DrawingCanvas'));
import SummaryGenerator from './SummaryGenerator';
import { Template } from '../services/templateService';
import { getAssetUrl } from '../services/apiClient';
import { motion, AnimatePresence } from 'framer-motion';
import { useGenerationStore } from '../stores/generationStore';
import sounds from '../utils/soundDesign';
import { getDiscoveryStatus, DiscoveryStatus } from '../services/profileService';
import LockIcon from '@mui/icons-material/Lock';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { logger } from '@/utils/logger';

// Composant de chargement pour les éléments lazy
const ExportButtonLoader = () => (
  <CircularProgress size={20} />
);

// Type for transcript entries
interface TranscriptEntry {
  speakerId: string;  // Original ID (e.g., "speaker_0") - never changes
  speaker: string;    // Display name (e.g., "Jean") - can be updated
  text: string;
  timestamp?: string;
}

// Using a flexible type for meeting to avoid conflicts with MyMeetings.tsx
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MeetingData = any;

// Gamified Loading Screen for Summary Generation - Style TranscriptLoadingAnimation
interface SummaryLoadingScreenProps {
  meetingId: string;
  isCompleted?: boolean;
}

const QUOTES = [
  { text: "Quand les gens parlent, écoutez complètement.", author: "Ernest Hemingway" },
  { text: "Le plus important dans la communication, c'est d'entendre ce qui n'est pas dit.", author: "Peter Drucker" },
  { text: "On n'écoute pas pour comprendre. On écoute pour répondre.", author: "Stephen Covey" },
  { text: "Le courage, c'est se lever et parler. Le courage, c'est aussi s'asseoir et écouter.", author: "Winston Churchill" },
  { text: "Parlez aux gens d'eux-mêmes et ils vous écouteront pendant des heures.", author: "Dale Carnegie" },
  { text: "La connaissance parle, mais la sagesse écoute.", author: "Jimi Hendrix" },
  { text: "Les gens oublieront ce que vous avez dit, mais jamais ce que vous leur avez fait ressentir.", author: "Maya Angelou" },
  { text: "La plupart des gens qui réussissent sont ceux qui écoutent plus qu'ils ne parlent.", author: "Bernard Baruch" },
];

const SummaryLoadingScreen: React.FC<SummaryLoadingScreenProps> = ({ meetingId, isCompleted = false }) => {
  const theme = useTheme();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [currentQuote, setCurrentQuote] = React.useState(() => Math.floor(Math.random() * QUOTES.length));

  const markAnimationDone = useGenerationStore(state => state.markAnimationDone);

  // Quand terminé, marquer l'animation comme finie
  React.useEffect(() => {
    if (isCompleted) {
      const timeout = setTimeout(() => markAnimationDone(meetingId), 500);
      return () => clearTimeout(timeout);
    }
  }, [isCompleted, meetingId, markAnimationDone]);

  // Rotation des citations
  React.useEffect(() => {
    const interval = setInterval(() => setCurrentQuote(prev => (prev + 1) % QUOTES.length), 8000);
    return () => clearInterval(interval);
  }, []);

  const quote = QUOTES[currentQuote];

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        bgcolor: 'background.paper',
        // Curseur stylo pour toute la zone de dessin
        cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'20\' height=\'20\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%230A66FF\' stroke-width=\'2.5\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z\'/%3E%3C/svg%3E") 1 19, crosshair',
        // S'assurer que tous les enfants héritent du curseur
        '& *': {
          cursor: 'inherit !important',
        },
      }}
    >
      <Suspense fallback={null}>
        <DrawingCanvas containerRef={containerRef} />
      </Suspense>

      {/* Logo G centré avec anneau animé */}
      <Box
        sx={{
          position: 'absolute',
          top: '35%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
          gap: 3,
        }}
      >
        <Box sx={{ position: 'relative', width: 120, height: 120 }}>
          {/* Anneau de progression SVG - rotation fluide, pas de scale */}
          <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={alpha(theme.palette.primary.main, 0.1)}
              strokeWidth="5"
            />
            <motion.circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke={theme.palette.primary.main}
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="80 247"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{ transformOrigin: 'center' }}
            />
          </svg>

          {/* Logo G au centre */}
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <img
              src="/img/icon.png"
              alt="G"
              draggable={false}
              style={{ width: 60, height: 60, objectFit: 'contain' }}
            />
          </Box>
        </Box>

        {/* Texte informatif */}
        <Typography
          sx={{
            fontSize: '0.9rem',
            color: alpha(theme.palette.text.secondary, 0.6),
            fontWeight: 500,
          }}
        >
          Cela peut prendre quelques minutes
        </Typography>
      </Box>

      {/* Citation tout en bas */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 32,
          left: 0,
          right: 0,
          zIndex: 1,
          px: 4,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuote}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            style={{ textAlign: 'center', pointerEvents: 'none' }}
          >
            <Typography sx={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic', mb: 0.5, pointerEvents: 'none' }}>
              « {quote.text} »
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: '#b0b5bd', pointerEvents: 'none' }}>
              — {quote.author}
            </Typography>
          </motion.div>
        </AnimatePresence>
      </Box>
    </Box>
  );
};

// Regenerate Dropdown Component
interface RegenerateDropdownProps {
  templates: Template[];
  selectedTemplateId: string | null;
  onSelectTemplate: (id: string) => void;
  onCancel: () => void;
  onRegenerate: () => void;
  isGenerating: boolean;
}

const RegenerateDropdown: React.FC<RegenerateDropdownProps> = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onCancel,
  onRegenerate,
  isGenerating,
}) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Ensure templates is an array
  const safeTemplates = Array.isArray(templates) ? templates : [];
  const selectedTemplate = safeTemplates.find(t => t.id === selectedTemplateId);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        mb: 2,
        borderRadius: '12px',
        border: '1px solid',
        borderColor: alpha(theme.palette.divider, 0.8),
        bgcolor: '#fafafa',
      }}
    >
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#6b7280', mb: 1.5 }}>
        Choisir un modèle de synthèse
      </Typography>

      {/* Dropdown */}
      <Box ref={dropdownRef} sx={{ position: 'relative', mb: 2 }}>
        <Box
          onClick={() => setIsOpen(!isOpen)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.5,
            pl: 2,
            borderRadius: '10px',
            bgcolor: '#fff',
            border: '1px solid',
            borderColor: isOpen ? theme.palette.primary.main : '#e5e7eb',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: isOpen
              ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.1)}`
              : '0 1px 2px rgba(0,0,0,0.05)',
            '&:hover': {
              borderColor: isOpen ? theme.palette.primary.main : '#d1d5db',
            },
          }}
        >
          {/* Logo */}
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '6px',
              bgcolor: '#f9fafb',
              border: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Box
              component="img"
              src={getAssetUrl(selectedTemplate?.logo_url) || '/img/icon.png'}
              alt=""
              draggable={false}
              sx={{ width: 20, height: 20, objectFit: 'contain' }}
            />
          </Box>

          {/* Text */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 500,
                fontSize: '0.875rem',
                color: selectedTemplate ? '#111827' : '#9ca3af',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedTemplate?.name || 'Sélectionner un modèle...'}
            </Typography>
          </Box>

          {/* Arrow */}
          <KeyboardArrowDownIcon
            sx={{
              fontSize: 20,
              color: '#9ca3af',
              transition: 'transform 0.2s ease',
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </Box>

        {/* Dropdown menu */}
        {isOpen && (
          <Box
            sx={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              zIndex: 50,
              bgcolor: '#fff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 40px -10px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {safeTemplates.map((template) => {
              const isSelected = template.id === selectedTemplateId;

              return (
                <Box
                  key={template.id}
                  onClick={() => {
                    onSelectTemplate(template.id);
                    setIsOpen(false);
                  }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    p: 1.5,
                    cursor: 'pointer',
                    bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    transition: 'background-color 0.1s ease',
                    '&:hover': {
                      bgcolor: isSelected
                        ? alpha(theme.palette.primary.main, 0.08)
                        : '#f9fafb',
                    },
                  }}
                >
                  {/* Logo */}
                  <Box
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '6px',
                      bgcolor: '#f3f4f6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Box
                      component="img"
                      src={getAssetUrl(template.logo_url) || '/img/icon.png'}
                      alt=""
                      draggable={false}
                      sx={{ width: 18, height: 18, objectFit: 'contain' }}
                    />
                  </Box>

                  {/* Text */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontWeight: isSelected ? 600 : 500,
                        fontSize: '0.875rem',
                        color: isSelected ? theme.palette.primary.main : '#111827',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {template.name}
                    </Typography>
                  </Box>

                  {/* Check */}
                  {isSelected && (
                    <CheckIcon
                      sx={{
                        fontSize: 18,
                        color: theme.palette.primary.main,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Buttons */}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button
          size="small"
          variant="outlined"
          onClick={onCancel}
          disableElevation
          sx={{
            borderRadius: '10px',
            borderColor: alpha(theme.palette.divider, 0.8),
            color: 'text.secondary',
            fontWeight: 500,
            textTransform: 'none',
            px: 2,
            py: 0.75,
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.main',
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          Annuler
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onRegenerate}
          disabled={!selectedTemplateId || isGenerating}
          disableElevation
          startIcon={<AnimatedRefreshIcon size={16} />}
          sx={{
            borderRadius: '10px',
            borderColor: alpha(theme.palette.divider, 0.8),
            color: 'text.secondary',
            fontWeight: 500,
            textTransform: 'none',
            px: 2,
            py: 0.75,
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.main',
              color: 'primary.main',
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
            },
            '&.Mui-disabled': {
              borderColor: alpha(theme.palette.divider, 0.4),
              color: alpha(theme.palette.text.secondary, 0.4),
            },
          }}
        >
          {isGenerating ? 'Régénération...' : 'Régénérer'}
        </Button>
      </Box>
    </Paper>
  );
};

interface MeetingDetailOverlayProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingData;
  // Initial tab to open (useful when opening from "Generate" button)
  initialTab?: 'transcription' | 'summary';
  // Transcription
  formattedTranscript: TranscriptEntry[] | null;
  isLoadingTranscript: boolean;
  onLoadTranscript: (meetingId: string) => Promise<void>;
  // Speaker management
  onSaveSpeakerName: (speakerId: string, customName: string) => void;
  hasCustomName: (meetingId: string, speakerId: string) => boolean;
  // Transcript editing
  isEditingTranscript: boolean;
  onStartEditTranscript: () => void;
  onCancelEditTranscript: () => void;
  onSaveTranscript: (textToSave?: string) => Promise<void>;
  isSavingTranscript: boolean;
  editedTranscriptText: string;
  onTranscriptTextChange: (text: string) => void;
  onTranscriptEntryChange: (index: number, newText: string) => void;
  // Summary
  templates: Template[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onGenerateSummary: (meetingId: string, templateId: string) => Promise<void>;
  isGeneratingSummary: boolean;
  // Summary editing
  isEditingSummary: boolean;
  editedSummaryText: string;
  onStartEditSummary: () => void;
  onCancelEditSummary: () => void;
  onSaveSummary: () => Promise<void>;
  isSavingSummary: boolean;
  onSummaryTextChange: (text: string) => void;
  // Actions
  onDelete: (meetingId: string) => void;
  onShare: (meeting: MeetingData) => void;
  onPlayAudio: (meetingId: string, title: string) => void;
  // Rename
  onSaveTitle?: (meetingId: string, newTitle: string) => Promise<void>;
  // Template resolution for export
  resolveTemplateForMeeting: (meeting: MeetingData) => Template | undefined;
  // Error handling
  onError: (title: string, message: string) => void;
}

const MeetingDetailOverlay: React.FC<MeetingDetailOverlayProps> = ({
  open,
  onClose,
  meeting,
  initialTab,
  formattedTranscript,
  isLoadingTranscript,
  onLoadTranscript,
  onSaveSpeakerName,
  hasCustomName: _hasCustomName, // Kept for API compatibility
  isEditingTranscript,
  onStartEditTranscript,
  onCancelEditTranscript,
  onSaveTranscript,
  isSavingTranscript: _isSavingTranscript2, // Kept for API compatibility
  editedTranscriptText: _editedTranscriptText, // Kept for API compatibility
  onTranscriptTextChange: _onTranscriptTextChange, // Kept for API compatibility
  onTranscriptEntryChange: _onTranscriptEntryChange, // Kept for API compatibility
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onGenerateSummary,
  isGeneratingSummary,
  isEditingSummary: _isEditingSummary, // Kept for API compatibility
  editedSummaryText,
  onStartEditSummary: _onStartEditSummary, // Kept for API compatibility
  onCancelEditSummary: _onCancelEditSummary, // Kept for API compatibility
  onSaveSummary, // Utilisé pour auto-save onBlur
  isSavingSummary: _isSavingSummary, // Kept for API compatibility
  onSummaryTextChange,
  onDelete: _onDelete, // Kept for API compatibility
  onShare: _onShare, // Kept for API compatibility
  onPlayAudio: _onPlayAudio, // Kept for API compatibility
  onSaveTitle,
  resolveTemplateForMeeting,
  onError,
}) => {
  const theme = useTheme();
  // Responsive breakpoint (currently unused but keeping for future responsive features)
  void useMediaQuery(theme.breakpoints.down('sm'));
  
  // State
  const [activeTab, setActiveTab] = useState<'transcription' | 'summary'>('transcription');
  const [showSpeakerManagement, setShowSpeakerManagement] = useState(false);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editingUtteranceIndex, setEditingUtteranceIndex] = useState<number | null>(null);
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
  const [regenerateTemplateId, setRegenerateTemplateId] = useState<string | null>(null);
  const [showSpeakerRenameAlert, setShowSpeakerRenameAlert] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [loadingDiscoveryStatus, setLoadingDiscoveryStatus] = useState(false);
  const [hoveredSeparatorIndex, setHoveredSeparatorIndex] = useState<number | null>(null);
  const [hoveredUtteranceIndex, setHoveredUtteranceIndex] = useState<number | null>(null);
  const [addingAtIndex, setAddingAtIndex] = useState<number | null>(null);
  const [newInterventionSpeaker, setNewInterventionSpeaker] = useState('');
  const [newInterventionText, setNewInterventionText] = useState('');

  // Charger le statut Discovery au montage pour savoir si l'utilisateur peut voir la transcription
  useEffect(() => {
    if (open) {
      const loadDiscoveryStatus = async () => {
        setLoadingDiscoveryStatus(true);
        try {
          const status = await getDiscoveryStatus();
          setDiscoveryStatus(status);
        } catch (error) {
          // Si l'API échoue, on considère que l'utilisateur peut voir la transcription
          logger.warn('Impossible de charger le statut Discovery:', error);
          setDiscoveryStatus(null);
        } finally {
          setLoadingDiscoveryStatus(false);
        }
      };
      loadDiscoveryStatus();
    }
  }, [open]);

  // Vérifier si l'utilisateur peut voir la transcription
  // LOGIQUE:
  // 1. Si l'utilisateur est Pro (pas discovery), il peut TOUJOURS voir toutes ses réunions
  // 2. Si l'utilisateur est Discovery, seule la réunion spécifique marquée locked est bloquée
  const isProUser = discoveryStatus?.subscription_plan && discoveryStatus.subscription_plan !== 'discovery';
  const canViewTranscript = isProUser || meeting?.is_quota_locked !== true;

  // Ref to track if speaker input has been focused (prevent refocus on re-render)
  const speakerInputFocusedRef = useRef<boolean>(false);

  // Check if a speaker name looks like a default/unnamed speaker
  const isUnnamedSpeaker = useCallback((speakerName: string): boolean => {
    const name = speakerName.trim();
    // Match patterns for default speaker names (both English and French)
    const unnamedPatterns = [
      // English patterns
      /^speaker[\s_-]?\d+$/i,
      /^speaker[\s_-]?[a-z]$/i,
      /^speakers?$/i,
      /^spk[\s_-]?\d+$/i,
      /^spkr[\s_-]?\d+$/i,
      /^person[\s_-]?\d+$/i,
      /^user[\s_-]?\d+$/i,
      /^voice[\s_-]?\d+$/i,
      /^audio[\s_-]?\d+$/i,
      /^unknown[\s_-]?\d*$/i,
      // French patterns (including transformed names)
      /^participant[\s_-]?\d+$/i,       // Participant 1, Participant 2
      /^intervenant[\s_-]?\d*$/i,       // Intervenant, Intervenant 1
      /^locuteur[\s_-]?\d*$/i,          // Locuteur, Locuteur 1
      /^personne[\s_-]?\d*$/i,          // Personne, Personne 1
      /^inconnu[\s_-]?\d*$/i,           // Inconnu, Inconnu 1
      // Just a number
      /^\d+$/,
    ];
    return unnamedPatterns.some(pattern => pattern.test(name));
  }, []);

  // Check if any speakers in the transcript are unnamed
  const hasUnnamedSpeakers = useCallback((transcript: TranscriptEntry[] | null): boolean => {
    if (!transcript || transcript.length === 0) return false;
    const speakers = new Set<string>();
    transcript.forEach(entry => {
      if (entry.speaker) speakers.add(entry.speaker);
    });
    const speakerList = Array.from(speakers);
    return speakerList.some(speaker => isUnnamedSpeaker(speaker));
  }, [isUnnamedSpeaker]);

  // Check if transcript is available (for shared meetings, check permissions)
  // Pour les réunions partagées: afficher transcription seulement si include_transcript === true
  // Pour les réunions non partagées: toujours afficher la transcription
  const isTranscriptAvailable = meeting?.is_shared 
    ? meeting?.permissions?.include_transcript === true 
    : true;

  // Permission helpers for shared meetings
  const isSharedMeeting = meeting?.is_shared === true;
  const meetingRole = meeting?.permissions?.role || 'reader';
  
  // Owner can do everything
  // Editor can: view, export, edit, share (not regenerate)
  // Reader can: view, export only
  const canEdit = !isSharedMeeting || meetingRole === 'editor' || meeting?.permissions?.can_edit === true;
  const canRegenerate = !isSharedMeeting; // Only owner can regenerate
  // canShare is calculated but not currently used - keeping for future share button implementation
  void (!isSharedMeeting || meetingRole === 'editor' || meeting?.permissions?.can_share === true);

  // Reset state when meeting changes
  useEffect(() => {
    if (meeting) {
      // Use initialTab if provided, otherwise default based on transcript availability
      if (initialTab) {
        setActiveTab(initialTab);
      } else {
        // Si transcription non disponible, aller directement au résumé
        setActiveTab(isTranscriptAvailable ? 'transcription' : 'summary');
      }
      setShowSpeakerManagement(false);
      setEditingSpeaker(null);
      setEditingUtteranceIndex(null);
      setEditingTextIndex(null);
      setEditingName('');
      setShowRegenerateOptions(false);
      setRegenerateTemplateId(null);
      setShowSpeakerRenameAlert(false);
      setIsEditingTitle(false);
      setEditingTitle('');
      speakerInputFocusedRef.current = false;
    }
  }, [meeting?.id, isTranscriptAvailable, initialTab]);

  // Load transcript when opening or when transcript status changes to completed
  const transcriptStatus = meeting?.transcript_status || meeting?.transcription_status;

  // Detect if transcript is being processed (either by status or placeholder text)
  const isTranscriptProcessing = React.useMemo(() => {
    // Only check the status directly - trust the backend
    if (transcriptStatus === 'processing' || transcriptStatus === 'pending') {
      return true;
    }

    // If status is 'completed' or 'error', stop polling
    // Don't second-guess the backend - if it says completed, it's completed
    if (transcriptStatus === 'completed' || transcriptStatus === 'error') {
      return false;
    }

    // Check if transcript has placeholder content (only if status is unknown)
    if (!formattedTranscript || formattedTranscript.length === 0) {
      return false; // No transcript and unknown status - don't poll
    }

    // Check if any entry contains processing placeholder
    const processingPatterns = [
      /transcription.*en cours/i,
      /traitement.*en cours/i,
      /processing/i,
      /en attente/i,
      /\.{3}$/,  // Ends with "..."
      /^[a-f0-9-]{20,}$/i,  // UUID-like IDs
    ];

    // If there's only 1-2 entries and they match processing patterns
    if (formattedTranscript.length <= 2) {
      const isPlaceholder = formattedTranscript.some(entry =>
        processingPatterns.some(pattern => pattern.test(entry.text)) ||
        processingPatterns.some(pattern => pattern.test(entry.speaker))
      );
      if (isPlaceholder) {
        return true;
      }
    }
    return false;
  }, [formattedTranscript, transcriptStatus]);

  // Auto-refresh polling when transcription is processing
  useEffect(() => {
    if (!open || !meeting || !isTranscriptProcessing) return;

    // Start polling immediately and then every 3 seconds
    const pollInterval = setInterval(() => {
      onLoadTranscript(meeting.id);
    }, 3000); // Poll every 3 seconds for faster response

    return () => clearInterval(pollInterval);
  }, [open, meeting?.id, isTranscriptProcessing, onLoadTranscript]);

  useEffect(() => {
    if (open && meeting && !formattedTranscript && !isLoadingTranscript) {
      onLoadTranscript(meeting.id);
    }
  }, [open, meeting?.id, transcriptStatus, formattedTranscript, isLoadingTranscript, onLoadTranscript]);

  // Get unique speakers from transcript (returns display names)
  const getUniqueSpeakers = useCallback((transcript: TranscriptEntry[] | null): string[] => {
    if (!transcript) return [];
    const speakers = new Set<string>();
    transcript.forEach(entry => {
      if (entry.speaker) speakers.add(entry.speaker);
    });
    return Array.from(speakers);
  }, []);

  // Memoize unique speakers list to avoid recalculating on every render
  const uniqueSpeakers = React.useMemo(() =>
    getUniqueSpeakers(formattedTranscript),
    [formattedTranscript, getUniqueSpeakers]
  );

  // Stable unique speaker IDs (based on speakerId, not display name) for consistent avatar assignment
  const uniqueSpeakerIds = React.useMemo(() => {
    if (!formattedTranscript) return [];
    const ids = new Set<string>();
    formattedTranscript.forEach(entry => {
      if (entry.speakerId) ids.add(entry.speakerId);
    });
    return Array.from(ids);
  }, [formattedTranscript]);

  // Stable speakerId -> index map for avatar/color assignment (never changes when display name changes)
  const speakerIdIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    uniqueSpeakerIds.forEach((id, index) => {
      map.set(id, index);
    });
    return map;
  }, [uniqueSpeakerIds]);

  // Map display name to speakerId for API calls
  const speakerIdLookup = React.useMemo(() => {
    const map = new Map<string, string>();
    if (formattedTranscript) {
      formattedTranscript.forEach(entry => {
        // Map display name to original speakerId
        if (entry.speaker && entry.speakerId) {
          map.set(entry.speaker, entry.speakerId);
        }
      });
    }
    return map;
  }, [formattedTranscript]);

  // Avatar colors - 20 distinct colors for up to 20 speakers
  const avatarColors = [
    { bg: '#E3F2FD', color: '#1976D2' },  // Bleu
    { bg: '#F3E5F5', color: '#7B1FA2' },  // Violet
    { bg: '#E8F5E9', color: '#388E3C' },  // Vert
    { bg: '#FFF3E0', color: '#F57C00' },  // Orange
    { bg: '#FCE4EC', color: '#C2185B' },  // Rose
    { bg: '#E0F7FA', color: '#0097A7' },  // Cyan
    { bg: '#FFF8E1', color: '#FFA000' },  // Ambre
    { bg: '#F3E5F5', color: '#512DA8' },  // Indigo
    { bg: '#EFEBE9', color: '#5D4037' },  // Marron
    { bg: '#ECEFF1', color: '#455A64' },  // Bleu-gris
    { bg: '#E8EAF6', color: '#303F9F' },  // Indigo foncé
    { bg: '#E1F5FE', color: '#0288D1' },  // Bleu clair
    { bg: '#F1F8E9', color: '#689F38' },  // Vert clair
    { bg: '#FBE9E7', color: '#D84315' },  // Orange foncé
    { bg: '#EDE7F6', color: '#673AB7' },  // Violet profond
    { bg: '#E0F2F1', color: '#00796B' },  // Teal
    { bg: '#FFF9C4', color: '#F9A825' },  // Jaune
    { bg: '#FFEBEE', color: '#C62828' },  // Rouge
    { bg: '#E8F5E9', color: '#2E7D32' },  // Vert foncé
    { bg: '#F5F5F5', color: '#616161' },  // Gris
  ];

  const handleTabChange = (newTab: string) => {
    sounds.tab();
    setActiveTab(newTab as 'transcription' | 'summary');
  };

  // Title editing handlers
  const startEditingTitle = () => {
    setEditingTitle(meeting?.title || 'Réunion');
    setIsEditingTitle(true);
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setEditingTitle('');
  };

  const saveTitle = async () => {
    if (!meeting || !onSaveTitle || !editingTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      await onSaveTitle(meeting.id, editingTitle.trim());
      setIsEditingTitle(false);
    } catch (err) {
      void err;
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (!meeting || !selectedTemplateId) return;

    // Check if there are unnamed speakers (only if transcript is loaded and not processing)
    if (formattedTranscript && formattedTranscript.length > 0 && !isTranscriptProcessing) {
      const hasUnnamed = hasUnnamedSpeakers(formattedTranscript);
      if (hasUnnamed) {
        sounds.pop();
        setShowSpeakerRenameAlert(true);
        return;
      }
    }

    // Son de validation + Fermer la fenêtre pour faire patienter l'utilisateur
    sounds.save();
    onClose();
    await onGenerateSummary(meeting.id, selectedTemplateId);
  };

  const handleGenerateSummaryAnyway = async () => {
    if (!meeting || !selectedTemplateId) return;
    setShowSpeakerRenameAlert(false);
    sounds.save();
    onClose();
    await onGenerateSummary(meeting.id, selectedTemplateId);
  };

  const handleGoToRenameParticipants = () => {
    setShowSpeakerRenameAlert(false);
    setActiveTab('transcription');
    setShowSpeakerManagement(true);
  };

  const handleRegenerateSummary = async () => {
    if (!meeting) return;
    const templateToUse = regenerateTemplateId || meeting.template_id || selectedTemplateId;
    if (!templateToUse) {
      setShowRegenerateOptions(true);
      return;
    }
    setShowRegenerateOptions(false);
    sounds.save();
    // Don't close the overlay for regenerate - keep it open to show loading animation
    // The loading screen will display inside the overlay
    await onGenerateSummary(meeting.id, templateToUse);
  };

  const handleSaveSpeakerName = (speakerId: string, name: string) => {
    onSaveSpeakerName(speakerId, name);
    // Réinitialiser tous les états d'édition pour fermer l'input et afficher le nom mis à jour
    speakerInputFocusedRef.current = false;
    setEditingSpeaker(null);
    setEditingUtteranceIndex(null);
    setEditingName('');
  };

  const startEditingSpeaker = (speakerId: string, currentName: string, utteranceIndex: number) => {
    speakerInputFocusedRef.current = false; // Reset focus tracking for new edit session
    setEditingSpeaker(speakerId);
    setEditingUtteranceIndex(utteranceIndex);
    setEditingName(currentName);
  };

  const cancelEditingSpeaker = () => {
    speakerInputFocusedRef.current = false;
    setEditingSpeaker(null);
    setEditingUtteranceIndex(null);
    setEditingName('');
  };

  // Handle adding a new intervention at a specific index
  const handleAddIntervention = async (insertAfterIndex: number) => {
    if (!formattedTranscript || !newInterventionSpeaker.trim() || !newInterventionText.trim()) return;

    const newEntry: TranscriptEntry = {
      speakerId: `speaker_new_${Date.now()}`,
      speaker: newInterventionSpeaker.trim(),
      text: newInterventionText.trim(),
    };

    // Insert the new entry after the specified index
    const updatedTranscript = [
      ...formattedTranscript.slice(0, insertAfterIndex + 1),
      newEntry,
      ...formattedTranscript.slice(insertAfterIndex + 1),
    ];

    // Format and save - parent will update state automatically
    const fullText = updatedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');

    try {
      await onSaveTranscript(fullText);
    } catch (error) {
      logger.error('Error adding intervention:', error);
    }

    // Reset states
    setAddingAtIndex(null);
    setNewInterventionSpeaker('');
    setNewInterventionText('');
  };

  // Handle deleting an intervention
  const handleDeleteIntervention = async (indexToDelete: number) => {
    if (!formattedTranscript || formattedTranscript.length <= 1) return; // Don't allow deleting the last entry

    const updatedTranscript = formattedTranscript.filter((_, i) => i !== indexToDelete);
    const fullText = updatedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');

    try {
      await onSaveTranscript(fullText);
    } catch (error) {
      logger.error('Error deleting intervention:', error);
    }
  };

  // Get unique speakers for the dropdown when adding interventions
  const getExistingSpeakers = useCallback((): string[] => {
    if (!formattedTranscript) return [];
    const speakers = new Set<string>();
    formattedTranscript.forEach(entry => {
      if (entry.speaker) speakers.add(entry.speaker);
    });
    return Array.from(speakers);
  }, [formattedTranscript]);

  // Check if meeting has transcript
  const hasTranscript = meeting?.transcript_status === 'completed' || meeting?.transcription_status === 'completed';
  const hasSummary = meeting?.summary_status === 'completed' && meeting?.summary_text;
  const isProcessingSummary = meeting?.summary_status === 'processing' || isGeneratingSummary;

  // Utiliser le store pour savoir si l'animation est terminée
  const generation = useGenerationStore(state => state.getActiveGeneration(meeting?.id || ''));
  const isAnimationDone = generation?.animationDone ?? false;

  // Afficher le loading tant que l'animation n'est pas terminée
  // Même si le backend a fini, on attend que l'animation soit complète
  const shouldShowLoading = isProcessingSummary || (hasSummary && !isAnimationDone && generation !== undefined);

  // Signal pour le loading screen que le backend a terminé
  const isLoadingComplete = hasSummary;

  // Get template for export
  const templateForExport = meeting ? resolveTemplateForMeeting(meeting) : undefined;

  if (!meeting) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      TransitionComponent={Slide}
      TransitionProps={{ direction: 'up' } as any}
      sx={{
        '& .MuiBackdrop-root': {
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
        },
        '& .MuiDialog-paper': {
          bgcolor: '#f8fafc',
          borderRadius: { xs: '20px 20px 0 0', sm: '20px' },
          height: { xs: '97vh', sm: '94vh' },
          maxHeight: '94vh',
          m: { xs: 0, sm: 2 },
          maxWidth: { sm: '1100px', md: '1300px', lg: '1400px' },
          width: '100%',
          position: { xs: 'fixed', sm: 'relative' },
          bottom: { xs: 0, sm: 'auto' },
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        },
      }}
    >
      {/* Header - single row */}
      <Box
        sx={{
          bgcolor: 'white',
          borderBottom: '1px solid',
          borderColor: alpha(theme.palette.divider, 0.5),
          zIndex: 10,
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          borderRadius: { xs: '20px 20px 0 0', sm: '20px 20px 0 0' },
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          px: { xs: 2, sm: 3 },
          py: { xs: 1.5, sm: 1.75 },
          gap: 2,
        }}
      >
        {/* Left: Close + Title */}
        <Box sx={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <IconButton onClick={() => { sounds.click(); onClose(); }} sx={{ mr: 1.5, flexShrink: 0 }}>
            <CloseIcon />
          </IconButton>
          <Box sx={{ minWidth: 0 }}>
            {isEditingTitle ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <TextField
                  value={editingTitle}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  size="small"
                  autoFocus
                  variant="standard"
                  sx={{
                    minWidth: 150,
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveTitle();
                    } else if (e.key === 'Escape') {
                      cancelEditingTitle();
                    }
                  }}
                  disabled={isSavingTitle}
                />
                <IconButton 
                  size="small" 
                  onClick={saveTitle} 
                  disabled={isSavingTitle}
                  sx={{ p: 0.5, color: 'success.main' }}
                >
                  {isSavingTitle ? <CircularProgress size={16} /> : <CheckIcon sx={{ fontSize: 18 }} />}
                </IconButton>
                <IconButton 
                  size="small" 
                  onClick={cancelEditingTitle} 
                  disabled={isSavingTitle}
                  sx={{ p: 0.5, color: 'text.secondary' }}
                >
                  <CancelIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  maxWidth: '100%',
                  '&:hover .rename-icon': onSaveTitle ? {
                    opacity: 1,
                  } : {},
                }}
              >
                <Typography
                  noWrap
                  component="span"
                  sx={{
                    fontWeight: 600,
                    fontSize: { xs: '1rem', sm: '1.1rem' },
                    lineHeight: 1.3,
                    cursor: onSaveTitle ? 'pointer' : 'default',
                    '&:hover': onSaveTitle ? {
                      color: 'primary.main',
                    } : {},
                  }}
                  onClick={onSaveTitle ? startEditingTitle : undefined}
                >
                  {meeting.title || 'Réunion'}
                </Typography>
                {onSaveTitle && (
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
                    onClick={startEditingTitle}
                  />
                )}
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ fontSize: '0.8rem' }}
              >
                {new Date(meeting.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </Typography>
              {isSharedMeeting && (
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.25,
                    borderRadius: '6px',
                    bgcolor: 'rgba(156, 39, 176, 0.1)',
                    border: '1px solid rgba(156, 39, 176, 0.2)',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'rgb(156, 39, 176)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {meetingRole === 'editor' ? 'Éditeur' : 'Lecteur'}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Center: Animated Tab Group */}
        <AnimatedTabs
          tabs={[
            ...(isTranscriptAvailable ? [{
              value: 'transcription',
              label: 'Échanges',
              icon: (isActive: boolean) => <ForumIcon sx={{ fontSize: 18, color: isActive ? 'primary.main' : 'text.secondary' }} />,
            }] : []),
            {
              value: 'summary',
              label: 'Synthèse',
              icon: (isActive: boolean) => <AnimatedSummaryIcon size={18} isActive={isActive} />,
            },
          ]}
          value={activeTab}
          onChange={handleTabChange}
        />

        {/* Right: Empty space for symmetry */}
        <Box sx={{ flex: 1 }} />
      </Box>

      {/* Content */}
      <DialogContent
        sx={{
          p: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minHeight: 0, // Important for flex children to scroll properly
          position: 'relative',
        }}
      >
        {/* Full-screen loading for summary generation */}
        {activeTab === 'summary' && shouldShowLoading && (
          <SummaryLoadingScreen meetingId={meeting?.id || ''} isCompleted={isLoadingComplete} />
        )}

        {/* Normal content with padding/maxWidth */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarGutter: 'stable',
            px: { xs: 2, sm: 3, md: 4 },
            py: 3,
            maxWidth: 1000,
            mx: 'auto',
            width: '100%',
            display: (activeTab === 'summary' && shouldShowLoading) ? 'none' : 'block',
          }}
        >
          {/* Transcription Tab - affiché uniquement si disponible */}
          {activeTab === 'transcription' && isTranscriptAvailable && (
            <Fade in={activeTab === 'transcription'} timeout={300}>
              <Box>
                {/* Blocage Discovery - quota épuisé - prend toute la place */}
                {!canViewTranscript && !loadingDiscoveryStatus ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 10,
                      px: 4,
                      textAlign: 'center',
                      minHeight: 450,
                    }}
                  >
                    <Box
                      sx={{
                        width: 72,
                        height: 72,
                        borderRadius: '50%',
                        bgcolor: 'error.lighter',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 3,
                      }}
                    >
                      <LockIcon sx={{ fontSize: 36, color: 'error.main' }} />
                    </Box>

                    <Typography variant="h5" fontWeight={600} color="text.primary" gutterBottom>
                      Quota Discovery épuisé
                    </Typography>

                    <Typography variant="body1" color="text.secondary" sx={{ mb: 1, maxWidth: 400 }}>
                      Vous avez utilisé toutes vos minutes Discovery gratuites.
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
                      Pour accéder à vos transcriptions et continuer à enregistrer sans limite, passez à Gilbert Pro.
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => window.location.href = '/settings?tab=subscription'}
                        sx={{
                          bgcolor: 'primary.main',
                          px: 5,
                          py: 1.5,
                          borderRadius: '12px',
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.95rem',
                          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'primary.dark',
                            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.35)',
                            transform: 'translateY(-1px)',
                          },
                          '&:active': {
                            transform: 'translateY(0)',
                          },
                        }}
                      >
                        Passer à Gilbert Pro
                      </Button>

                      {discoveryStatus && (
                        <Typography variant="caption" color="text.disabled" sx={{ mt: 1 }}>
                          {discoveryStatus.minutes_used} / {discoveryStatus.minutes_total} minutes utilisées
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ) : canViewTranscript ? (
                  <>
                {/* Action bar - unified with speaker management toggle - hide during loading */}
                {formattedTranscript && formattedTranscript.length > 0 && !isLoadingTranscript && !isTranscriptProcessing && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 2,
                      gap: 1,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* Left: Speaker management toggle */}
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<GroupsIcon />}
                      endIcon={showSpeakerManagement ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      onClick={() => { sounds.toggle(); setShowSpeakerManagement(!showSpeakerManagement); }}
                      sx={{
                        color: 'text.secondary',
                        fontWeight: 500,
                        textTransform: 'none',
                        px: 1.5,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                      }}
                    >
                      Participants ({uniqueSpeakers.length})
                    </Button>

                    {/* Right: Export only (click on text to edit) */}
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      {!isEditingTranscript && editingTextIndex === null && (
                        <Suspense fallback={<ExportButtonLoader />}>
                          <TranscriptExportButton
                            transcript={formattedTranscript}
                            meetingId={meeting.id}
                            meetingName={meeting.title || 'Réunion'}
                            meetingDate={new Date(meeting.created_at).toLocaleDateString('fr-FR')}
                            onSuccess={() => {}}
                            onError={(msg) => onError('Erreur', msg)}
                          />
                        </Suspense>
                      )}
                      {/* Sauvegarde dynamique sur blur */}
                    </Box>
                  </Box>
                )}

                {/* Speaker Management Panel (collapsible) - hide during loading */}
                {formattedTranscript && formattedTranscript.length > 0 && !isLoadingTranscript && !isTranscriptProcessing && (
                  <Collapse in={showSpeakerManagement}>
                    <Paper
                      elevation={0}
                      sx={{
                        mb: 3,
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: 'divider',
                        overflow: 'hidden',
                        p: 2,
                      }}
                    >
                      <Grid container spacing={2}>
                        {uniqueSpeakers.map((speaker, speakerIdx) => {
                          // Use stable speakerId for avatar index to ensure consistency
                          const originalSpeakerId = speakerIdLookup.get(speaker) || speaker;
                          const stableIndex = speakerIdIndexMap.get(originalSpeakerId) ?? speakerIdx;
                          const avatarStyle = avatarColors[stableIndex % avatarColors.length];
                          // Panel editing: index is -1 minus speakerIdx to have unique negative indexes
                          const panelEditIndex = -1 - speakerIdx;
                          const isEditing = editingSpeaker === originalSpeakerId && editingUtteranceIndex === panelEditIndex;

                          return (
                            <Grid item xs={12} sm={6} key={speaker}>
                              <Paper
                                elevation={0}
                                onClick={() => {
                                  if (canEdit && !isEditing) {
                                    startEditingSpeaker(originalSpeakerId, speaker, panelEditIndex);
                                  }
                                }}
                                sx={{
                                  p: 2,
                                  borderRadius: '8px', // Smaller than outer container (12px) for proper proportions
                                  bgcolor: alpha(avatarStyle.color, 0.04),
                                  border: '1px solid',
                                  borderColor: alpha(avatarStyle.color, 0.15),
                                  cursor: canEdit && !isEditing ? 'pointer' : 'default',
                                  transition: 'all 0.2s ease',
                                  '&:hover': canEdit && !isEditing ? {
                                    borderColor: alpha(avatarStyle.color, 0.4),
                                    bgcolor: alpha(avatarStyle.color, 0.08),
                                    boxShadow: `0 4px 12px ${alpha(avatarStyle.color, 0.1)}`,
                                  } : {},
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <SpeakerAvatarSmall
                                    index={stableIndex}
                                    bgColor={avatarStyle.bg}
                                    iconColor={avatarStyle.color}
                                    meetingId={meeting.id}
                                  />
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    {/* Container with consistent height to prevent shift */}
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        minHeight: 24,
                                      }}
                                      onClick={(e) => isEditing && e.stopPropagation()}
                                    >
                                      {isEditing && canEdit ? (
                                        <TextField
                                          variant="standard"
                                          value={editingName}
                                          onChange={(e) => setEditingName(e.target.value)}
                                          placeholder="Nom du locuteur"
                                          size="small"
                                          fullWidth
                                          onBlur={() => {
                                            if (editingName.trim()) {
                                              handleSaveSpeakerName(originalSpeakerId, editingName.trim());
                                            } else {
                                              cancelEditingSpeaker();
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleSaveSpeakerName(originalSpeakerId, editingName.trim());
                                            } else if (e.key === 'Escape') {
                                              cancelEditingSpeaker();
                                            }
                                          }}
                                          inputRef={(input) => {
                                            if (input) {
                                              input.focus();
                                              const len = input.value.length;
                                              input.setSelectionRange(len, len);
                                            }
                                          }}
                                          InputProps={{
                                            disableUnderline: true,
                                          }}
                                          sx={{
                                            '& .MuiInputBase-root': {
                                              p: 0,
                                              '&:before, &:after': { display: 'none' },
                                            },
                                            '& .MuiInput-underline:before, & .MuiInput-underline:after': {
                                              display: 'none',
                                            },
                                            '& .MuiInputBase-input': {
                                              fontWeight: 600,
                                              color: avatarStyle.color,
                                              fontSize: '0.875rem',
                                              lineHeight: 1.5,
                                              p: 0,
                                            },
                                          }}
                                        />
                                      ) : (
                                        <>
                                          <Typography
                                            variant="body2"
                                            sx={{
                                              fontWeight: 600,
                                              color: avatarStyle.color,
                                              lineHeight: 1.5,
                                            }}
                                            noWrap
                                          >
                                            {speaker}
                                          </Typography>
                                          {canEdit && (
                                            <EditIcon
                                              sx={{
                                                fontSize: 14,
                                                color: avatarStyle.color,
                                                opacity: 0.4,
                                              }}
                                            />
                                          )}
                                        </>
                                      )}
                                    </Box>
                                  </Box>
                                </Box>
                              </Paper>
                            </Grid>
                          );
                        })}
                      </Grid>
                    </Paper>
                  </Collapse>
                )}

                {/* Subtle hint for unnamed speakers - only show when transcript is ready */}
                {formattedTranscript && formattedTranscript.length > 0 &&
                  !isLoadingTranscript && !isTranscriptProcessing &&
                  hasUnnamedSpeakers(formattedTranscript) && !showSpeakerManagement && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 2,
                      py: 1,
                      px: 1.5,
                      borderRadius: '10px',
                      bgcolor: alpha(theme.palette.info.main, 0.04),
                      border: '1px solid',
                      borderColor: alpha(theme.palette.info.main, 0.1),
                    }}
                  >
                    <LightbulbIcon sx={{ fontSize: 16, color: alpha(theme.palette.info.main, 0.6) }} />
                    <Typography
                      variant="caption"
                      sx={{
                        color: alpha(theme.palette.text.secondary, 0.8),
                        fontSize: '0.75rem',
                      }}
                    >
                      Astuce : nommez les participants pour une meilleure synthèse
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => { sounds.click(); setShowSpeakerManagement(true); }}
                      sx={{
                        ml: 'auto',
                        minWidth: 'auto',
                        px: 1,
                        py: 0.25,
                        fontSize: '0.7rem',
                        textTransform: 'none',
                        color: theme.palette.info.main,
                        '&:hover': {
                          bgcolor: alpha(theme.palette.info.main, 0.08),
                        },
                      }}
                    >
                      Identifier
                    </Button>
                  </Box>
                )}

                {/* Transcript Content */}
                {isLoadingTranscript || isTranscriptProcessing ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 8,
                      px: 4,
                      width: '100%',
                    }}
                  >
                    {/* Animated waveform lines - drawing style */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mb: 4,
                        height: 40,
                      }}
                    >
                      {[...Array(7)].map((_, i) => (
                        <Box
                          key={i}
                          sx={{
                            width: 3,
                            height: '100%',
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.15 + (i % 3) * 0.1),
                            animation: 'waveform 1.2s ease-in-out infinite',
                            animationDelay: `${i * 0.1}s`,
                            '@keyframes waveform': {
                              '0%, 100%': {
                                transform: 'scaleY(0.3)',
                              },
                              '50%': {
                                transform: 'scaleY(1)',
                              },
                            },
                          }}
                        />
                      ))}
                    </Box>

                    {/* Skeleton lines - cycling animation */}
                    <Box
                      sx={{
                        width: '100%',
                        maxWidth: 480,
                        margin: '0 auto',
                        animation: 'skeletonCycle 3s ease-in-out infinite',
                        '@keyframes skeletonCycle': {
                          '0%': { opacity: 0 },
                          '15%': { opacity: 1 },
                          '85%': { opacity: 1 },
                          '100%': { opacity: 0 },
                        },
                      }}
                    >
                      {[...Array(5)].map((_, i) => (
                        <Box
                          key={i}
                          sx={{
                            display: 'flex',
                            flexWrap: 'nowrap',
                            alignItems: 'flex-start',
                            gap: 1.5,
                            mb: 2,
                            width: '100%',
                            animation: 'skeletonSlideIn 3s ease-in-out infinite',
                            animationDelay: `${i * 0.15}s`,
                            '@keyframes skeletonSlideIn': {
                              '0%': { opacity: 0, transform: 'translateY(-8px)' },
                              '15%': { opacity: 1, transform: 'translateY(0)' },
                              '85%': { opacity: 1, transform: 'translateY(4px)' },
                              '100%': { opacity: 0, transform: 'translateY(8px)' },
                            },
                          }}
                        >
                          {/* Avatar skeleton */}
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                              flexShrink: 0,
                            }}
                          />
                          {/* Text skeleton - variable widths */}
                          <Box sx={{ flex: 1, pt: 0.25, minWidth: 0 }}>
                            <Box
                              sx={{
                                width: 60 + (i % 4) * 20,
                                height: 10,
                                borderRadius: 1,
                                bgcolor: alpha(theme.palette.primary.main, 0.1),
                                mb: 0.75,
                              }}
                            />
                            <Box
                              sx={{
                                width: `${70 + (i % 3) * 10}%`,
                                height: 36,
                                borderRadius: '10px',
                                bgcolor: alpha(theme.palette.grey[400], 0.06),
                              }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 3, fontWeight: 500 }}
                    >
                      Chargement des échanges...
                    </Typography>
                  </Box>
                ) : formattedTranscript && formattedTranscript.length > 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {formattedTranscript.map((utterance, index) => {
                      const speakerIndex = speakerIdIndexMap.get(utterance.speakerId) ?? 0;
                      const avatarStyle = avatarColors[speakerIndex % avatarColors.length];
                      const prevSpeaker = index > 0 ? formattedTranscript[index - 1].speaker : null;
                      const isNewSpeaker = utterance.speaker !== prevSpeaker;
                      const existingSpeakers = getExistingSpeakers();

                      return (
                        <React.Fragment key={index}>
                          {/* Add intervention separator - shown between utterances */}
                          {index > 0 && canEdit && (
                            <Box
                              onMouseEnter={() => setHoveredSeparatorIndex(index - 1)}
                              onMouseLeave={() => setHoveredSeparatorIndex(null)}
                              sx={{
                                position: 'relative',
                                height: addingAtIndex === index - 1 ? 'auto' : '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                my: 0.5,
                              }}
                            >
                              {addingAtIndex === index - 1 ? (
                                /* Form to add new intervention - subtle design */
                                <Fade in timeout={300}>
                                  <Paper
                                    elevation={0}
                                    sx={{
                                      width: 'calc(100% - 52px)',
                                      ml: '52px',
                                      p: 2,
                                      borderRadius: '12px',
                                      border: '1px solid',
                                      borderColor: alpha(theme.palette.divider, 0.6),
                                      bgcolor: alpha(theme.palette.grey[100], 0.5),
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                                        {existingSpeakers.map((speaker) => {
                                          // Use stable speakerId index for consistent avatar/color
                                          const spkId = speakerIdLookup.get(speaker) || speaker;
                                          const stableIdx = speakerIdIndexMap.get(spkId) ?? 0;
                                          const speakerAvatarStyle = avatarColors[stableIdx % avatarColors.length];
                                          const isSelected = newInterventionSpeaker === speaker;
                                          return (
                                            <Box
                                              key={speaker}
                                              onClick={() => setNewInterventionSpeaker(speaker)}
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.75,
                                                pl: 0.5,
                                                pr: 1.5,
                                                py: 0.5,
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                bgcolor: isSelected
                                                  ? alpha(speakerAvatarStyle.color, 0.15)
                                                  : speakerAvatarStyle.bg,
                                                color: speakerAvatarStyle.color,
                                                border: '2px solid',
                                                borderColor: isSelected
                                                  ? speakerAvatarStyle.color
                                                  : 'transparent',
                                                '&:hover': {
                                                  bgcolor: alpha(speakerAvatarStyle.color, 0.2),
                                                  borderColor: alpha(speakerAvatarStyle.color, 0.5),
                                                },
                                              }}
                                            >
                                              <SpeakerAvatarSmall
                                                index={stableIdx}
                                                size={24}
                                                bgColor={speakerAvatarStyle.bg}
                                                iconColor={speakerAvatarStyle.color}
                                                meetingId={meeting.id}
                                              />
                                              {speaker}
                                            </Box>
                                          );
                                        })}
                                        {/* Chip "Autre" avec input inline */}
                                        {(() => {
                                          const isNewSpeakerActive = !existingSpeakers.includes(newInterventionSpeaker) && newInterventionSpeaker;
                                          const newSpeakerAvatarStyle = avatarColors[existingSpeakers.length % avatarColors.length];
                                          return (
                                            <Box
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.75,
                                                pl: 0.5,
                                                pr: 1.5,
                                                py: 0.5,
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: 500,
                                                transition: 'all 0.2s ease',
                                                bgcolor: isNewSpeakerActive
                                                  ? alpha(newSpeakerAvatarStyle.color, 0.15)
                                                  : alpha(theme.palette.grey[200], 0.6),
                                                color: isNewSpeakerActive
                                                  ? newSpeakerAvatarStyle.color
                                                  : theme.palette.text.secondary,
                                                border: '2px solid',
                                                borderColor: isNewSpeakerActive
                                                  ? newSpeakerAvatarStyle.color
                                                  : 'transparent',
                                              }}
                                            >
                                              <Box
                                                sx={{
                                                  width: 22,
                                                  height: 22,
                                                  borderRadius: '50%',
                                                  bgcolor: isNewSpeakerActive
                                                    ? newSpeakerAvatarStyle.color
                                                    : alpha(theme.palette.grey[500], 0.3),
                                                  color: '#fff',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  fontSize: '0.65rem',
                                                  fontWeight: 600,
                                                  textTransform: 'uppercase',
                                                }}
                                              >
                                                {isNewSpeakerActive
                                                  ? newInterventionSpeaker.charAt(0)
                                                  : '+'}
                                              </Box>
                                              <input
                                                type="text"
                                                placeholder="Autre..."
                                                value={existingSpeakers.includes(newInterventionSpeaker) ? '' : newInterventionSpeaker}
                                                onChange={(e) => setNewInterventionSpeaker(e.target.value)}
                                                style={{
                                                  border: 'none',
                                                  outline: 'none',
                                                  background: 'transparent',
                                                  width: '70px',
                                                  fontSize: '0.75rem',
                                                  fontWeight: 500,
                                                  color: 'inherit',
                                                  fontFamily: 'inherit',
                                                }}
                                              />
                                            </Box>
                                          );
                                        })()}
                                      </Box>
                                      <TextField
                                        fullWidth
                                        multiline
                                        minRows={2}
                                        placeholder="Texte de l'intervention..."
                                        value={newInterventionText}
                                        onChange={(e) => setNewInterventionText(e.target.value)}
                                        sx={{
                                          '& .MuiInputBase-root': {
                                            borderRadius: '10px',
                                            fontSize: '0.85rem',
                                            bgcolor: '#fff',
                                          },
                                          '& .MuiOutlinedInput-notchedOutline': {
                                            borderColor: alpha(theme.palette.divider, 0.4),
                                          },
                                        }}
                                      />
                                      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                        <Typography
                                          onClick={() => {
                                            setAddingAtIndex(null);
                                            setNewInterventionSpeaker('');
                                            setNewInterventionText('');
                                          }}
                                          sx={{
                                            fontSize: '0.8rem',
                                            color: 'text.secondary',
                                            cursor: 'pointer',
                                            py: 0.5,
                                            px: 1,
                                            borderRadius: '6px',
                                            '&:hover': { bgcolor: alpha(theme.palette.grey[200], 0.5) },
                                          }}
                                        >
                                          Annuler
                                        </Typography>
                                        <Typography
                                          onClick={() => {
                                            if (newInterventionSpeaker.trim() && newInterventionText.trim()) {
                                              handleAddIntervention(index - 1);
                                            }
                                          }}
                                          sx={{
                                            fontSize: '0.8rem',
                                            fontWeight: 500,
                                            color: (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                              ? 'text.disabled'
                                              : theme.palette.primary.main,
                                            cursor: (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                              ? 'not-allowed'
                                              : 'pointer',
                                            py: 0.5,
                                            px: 1,
                                            borderRadius: '6px',
                                            '&:hover': (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                              ? {}
                                              : { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                                          }}
                                        >
                                          Ajouter
                                        </Typography>
                                      </Box>
                                    </Box>
                                  </Paper>
                                </Fade>
                              ) : (
                                /* Plus button that appears on hover - subtle design */
                                <Fade in={hoveredSeparatorIndex === index - 1} timeout={400}>
                                  <IconButton
                                    size="small"
                                    onClick={() => setAddingAtIndex(index - 1)}
                                    sx={{
                                      width: 20,
                                      height: 20,
                                      bgcolor: alpha(theme.palette.grey[400], 0.3),
                                      color: theme.palette.grey[500],
                                      transition: 'all 0.25s ease',
                                      '&:hover': {
                                        bgcolor: alpha(theme.palette.grey[500], 0.4),
                                        color: theme.palette.grey[700],
                                      },
                                    }}
                                  >
                                    <AddIcon sx={{ fontSize: 14 }} />
                                  </IconButton>
                                </Fade>
                              )}
                            </Box>
                          )}

                          {/* Utterance container with hover for delete */}
                          <Box
                            onMouseEnter={() => setHoveredUtteranceIndex(index)}
                            onMouseLeave={() => setHoveredUtteranceIndex(null)}
                            sx={{
                              position: 'relative',
                              mt: isNewSpeaker && index > 0 ? 2 : 0,
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1.5,
                              py: 0.5,
                            }}
                          >
                            {/* Avatar - always visible on new speaker, invisible but space-keeping otherwise */}
                            <Box
                              sx={{
                                flexShrink: 0,
                                width: 36,
                                visibility: isNewSpeaker ? 'visible' : 'hidden',
                              }}
                            >
                              <SpeakerAvatar
                                index={speakerIndex}
                                size={36}
                                bgColor={avatarStyle.bg}
                                iconColor={avatarStyle.color}
                                meetingId={meeting.id}
                              />
                            </Box>

                            {/* Content: speaker name above bubble */}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              {/* Speaker name - only show for new speaker */}
                              {isNewSpeaker && (
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 1 }}>
                                  {editingUtteranceIndex === index && canEdit ? (
                                    <Box onClick={(e) => e.stopPropagation()}>
                                      <TextField
                                        variant="standard"
                                        size="small"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            if (editingSpeaker && editingName.trim()) {
                                              handleSaveSpeakerName(editingSpeaker, editingName);
                                            }
                                          } else if (e.key === 'Escape') {
                                            cancelEditingSpeaker();
                                          }
                                        }}
                                        onBlur={() => {
                                          if (editingSpeaker && editingName.trim()) {
                                            handleSaveSpeakerName(editingSpeaker, editingName.trim());
                                          } else {
                                            cancelEditingSpeaker();
                                          }
                                        }}
                                        inputRef={(input) => {
                                          if (input && !speakerInputFocusedRef.current) {
                                            speakerInputFocusedRef.current = true;
                                            setTimeout(() => {
                                              input.focus({ preventScroll: true });
                                              const len = input.value.length;
                                              input.setSelectionRange(len, len);
                                            }, 0);
                                          }
                                        }}
                                        InputProps={{ disableUnderline: true }}
                                        sx={{
                                          '& .MuiInputBase-root': {
                                            py: 0.25,
                                            px: 0.5,
                                            borderRadius: '6px',
                                            bgcolor: alpha(avatarStyle.color, 0.1),
                                            '&:before, &:after': { display: 'none' },
                                          },
                                          '& .MuiInput-underline:before, & .MuiInput-underline:after': {
                                            display: 'none',
                                          },
                                          '& .MuiInputBase-input': {
                                            fontWeight: 600,
                                            color: avatarStyle.color,
                                            fontSize: '0.8rem',
                                            p: 0,
                                          },
                                        }}
                                      />
                                    </Box>
                                  ) : (
                                    <Box
                                      sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        cursor: canEdit ? 'pointer' : 'default',
                                        borderRadius: '6px',
                                        px: 0.5,
                                        py: 0.25,
                                        ml: -0.5,
                                        transition: 'all 0.15s ease',
                                        '&:hover': canEdit ? {
                                          bgcolor: alpha(avatarStyle.color, 0.1),
                                        } : {},
                                        '&:hover .edit-icon': canEdit ? {
                                          opacity: 1,
                                        } : {},
                                      }}
                                      onClick={(e) => {
                                        if (!canEdit) return;
                                        e.stopPropagation();
                                        startEditingSpeaker(utterance.speakerId, utterance.speaker, index);
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontWeight: 600,
                                          color: avatarStyle.color,
                                          fontSize: '0.8rem',
                                        }}
                                      >
                                        {utterance.speaker}
                                      </Typography>
                                      {canEdit && (
                                        <EditIcon
                                          className="edit-icon"
                                          sx={{
                                            fontSize: 11,
                                            color: avatarStyle.color,
                                            opacity: 0.3,
                                            ml: 0.5,
                                            transition: 'opacity 0.2s ease',
                                          }}
                                        />
                                      )}
                                    </Box>
                                  )}
                                  {utterance.timestamp && (
                                    <Typography
                                      variant="caption"
                                      sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
                                    >
                                      {utterance.timestamp}
                                    </Typography>
                                  )}
                                </Box>
                              )}

                              {/* Text bubble - only contains text */}
                              <Box sx={{ position: 'relative' }}>
                                <Paper
                                  elevation={0}
                                  sx={{
                                    p: { xs: 1.5, sm: 2 },
                                    borderRadius: '16px',
                                    borderTopLeftRadius: isNewSpeaker ? '4px' : '16px',
                                    bgcolor: alpha(avatarStyle.color, 0.06),
                                    border: '1px solid',
                                    borderColor: alpha(avatarStyle.color, 0.12),
                                    transition: 'background-color 0.2s ease, border-color 0.2s ease',
                                    '&:hover': {
                                      bgcolor: alpha(avatarStyle.color, 0.09),
                                      borderColor: alpha(avatarStyle.color, 0.2),
                                    },
                                  }}
                                >
                                  {editingTextIndex === index && canEdit ? (
                                    <Box
                                      key={`edit-${index}`}
                                      component="div"
                                      contentEditable
                                      suppressContentEditableWarning
                                      onInput={(_e: React.FormEvent<HTMLDivElement>) => {
                                        onStartEditTranscript();
                                      }}
                                      onBlur={async (e: React.FocusEvent<HTMLDivElement>) => {
                                        // Capture final text on blur
                                        const newText = (e.currentTarget.textContent || '').trim();
                                        // Save if text changed
                                        if (newText !== utterance.text && formattedTranscript) {
                                          // Build the full transcript text with the updated entry
                                          const updatedTranscript = formattedTranscript.map((u, i) =>
                                            i === index ? { ...u, text: newText } : u
                                          );
                                          // Use speaker display name for the format
                                          const fullText = updatedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n');
                                          await onSaveTranscript(fullText);
                                        }
                                        setEditingTextIndex(null);
                                      }}
                                      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                                        if (e.key === 'Escape') {
                                          onCancelEditTranscript();
                                          setEditingTextIndex(null);
                                        }
                                        // Empêcher les retours à la ligne (Enter)
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                        }
                                      }}
                                      ref={(el: HTMLDivElement | null) => {
                                        if (el && !el.dataset.initialized) {
                                          el.dataset.initialized = 'true';
                                          // Set initial content (plain text, no line breaks)
                                          el.textContent = utterance.text.replace(/\n/g, ' ');
                                          el.focus();
                                          // Place cursor at end
                                          const range = document.createRange();
                                          const sel = window.getSelection();
                                          range.selectNodeContents(el);
                                          range.collapse(false);
                                          sel?.removeAllRanges();
                                          sel?.addRange(range);
                                        }
                                      }}
                                      sx={{
                                        width: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        bgcolor: 'transparent',
                                        color: 'text.primary',
                                        lineHeight: 1.7,
                                        fontSize: '0.9rem',
                                        fontFamily: 'inherit',
                                        p: 0,
                                        m: 0,
                                        minHeight: '1.7em',
                                        display: 'block',
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        whiteSpace: 'pre-wrap',
                                        cursor: 'text',
                                      }}
                                    />
                                  ) : (
                                    <Typography
                                      variant="body2"
                                      onClick={() => {
                                        if (canEdit) {
                                          setEditingTextIndex(index);
                                        }
                                      }}
                                      sx={{
                                        color: 'text.primary',
                                        lineHeight: 1.7,
                                        wordBreak: 'break-word',
                                        overflowWrap: 'break-word',
                                        fontSize: '0.9rem',
                                        cursor: canEdit ? 'text' : 'default',
                                        minHeight: 'auto',
                                      }}
                                    >
                                      {utterance.text}
                                    </Typography>
                                  )}
                                </Paper>

                                {/* Delete button - appears on hover - subtle design */}
                                {canEdit && formattedTranscript.length > 1 && (
                                  <Box
                                    sx={{
                                      position: 'absolute',
                                      top: 6,
                                      right: 6,
                                      zIndex: 10,
                                      opacity: hoveredUtteranceIndex === index ? 1 : 0,
                                      transition: 'opacity 0.3s ease',
                                      pointerEvents: hoveredUtteranceIndex === index ? 'auto' : 'none',
                                    }}
                                  >
                                    <IconButton
                                      size="small"
                                      onClick={() => handleDeleteIntervention(index)}
                                      sx={{
                                        width: 24,
                                        height: 24,
                                        bgcolor: alpha(theme.palette.grey[500], 0.15),
                                        color: theme.palette.grey[600],
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                          bgcolor: alpha('#ef4444', 0.2),
                                          color: '#dc2626',
                                        },
                                      }}
                                    >
                                      <DeleteIcon sx={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Box>
                                )}
                              </Box>
                            </Box>
                          </Box>
                        </React.Fragment>
                      );
                    })}

                    {/* Add button at the end */}
                    {canEdit && (
                      <Box
                        onMouseEnter={() => setHoveredSeparatorIndex(formattedTranscript.length - 1)}
                        onMouseLeave={() => setHoveredSeparatorIndex(null)}
                        sx={{
                          position: 'relative',
                          height: addingAtIndex === formattedTranscript.length - 1 ? 'auto' : '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          mt: 0.5,
                        }}
                      >
                        {addingAtIndex === formattedTranscript.length - 1 ? (
                          /* Form to add new intervention at the end - subtle design */
                          <Fade in timeout={300}>
                            <Paper
                              elevation={0}
                              sx={{
                                width: 'calc(100% - 52px)',
                                ml: '52px',
                                p: 2,
                                borderRadius: '12px',
                                border: '1px solid',
                                borderColor: alpha(theme.palette.divider, 0.6),
                                bgcolor: alpha(theme.palette.grey[100], 0.5),
                              }}
                            >
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                                  {getExistingSpeakers().map((speaker) => {
                                    const spkId = speakerIdLookup.get(speaker) || speaker;
                                    const stableIdx = speakerIdIndexMap.get(spkId) ?? 0;
                                    const speakerAvatarStyle = avatarColors[stableIdx % avatarColors.length];
                                    const isSelected = newInterventionSpeaker === speaker;
                                    return (
                                      <Box
                                        key={speaker}
                                        onClick={() => setNewInterventionSpeaker(speaker)}
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.75,
                                          pl: 0.5,
                                          pr: 1.5,
                                          py: 0.5,
                                          borderRadius: '20px',
                                          fontSize: '0.75rem',
                                          fontWeight: 500,
                                          cursor: 'pointer',
                                          transition: 'all 0.2s ease',
                                          bgcolor: isSelected
                                            ? alpha(speakerAvatarStyle.color, 0.15)
                                            : speakerAvatarStyle.bg,
                                          color: speakerAvatarStyle.color,
                                          border: '2px solid',
                                          borderColor: isSelected
                                            ? speakerAvatarStyle.color
                                            : 'transparent',
                                          '&:hover': {
                                            bgcolor: alpha(speakerAvatarStyle.color, 0.2),
                                            borderColor: alpha(speakerAvatarStyle.color, 0.5),
                                          },
                                        }}
                                      >
                                        <SpeakerAvatarSmall
                                          index={stableIdx}
                                          size={24}
                                          bgColor={speakerAvatarStyle.bg}
                                          iconColor={speakerAvatarStyle.color}
                                          meetingId={meeting.id}
                                        />
                                        {speaker}
                                      </Box>
                                    );
                                  })}
                                  {/* Chip "Autre" avec input inline */}
                                  {(() => {
                                    const existingSpeakersList = getExistingSpeakers();
                                    const isNewSpeakerActive = !existingSpeakersList.includes(newInterventionSpeaker) && newInterventionSpeaker;
                                    const newSpeakerAvatarStyle = avatarColors[existingSpeakersList.length % avatarColors.length];
                                    return (
                                      <Box
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 0.75,
                                          pl: 0.5,
                                          pr: 1.5,
                                          py: 0.5,
                                          borderRadius: '20px',
                                          fontSize: '0.75rem',
                                          fontWeight: 500,
                                          transition: 'all 0.2s ease',
                                          bgcolor: isNewSpeakerActive
                                            ? alpha(newSpeakerAvatarStyle.color, 0.15)
                                            : alpha(theme.palette.grey[200], 0.6),
                                          color: isNewSpeakerActive
                                            ? newSpeakerAvatarStyle.color
                                            : theme.palette.text.secondary,
                                          border: '2px solid',
                                          borderColor: isNewSpeakerActive
                                            ? newSpeakerAvatarStyle.color
                                            : 'transparent',
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: '50%',
                                            bgcolor: isNewSpeakerActive
                                              ? newSpeakerAvatarStyle.color
                                              : alpha(theme.palette.grey[500], 0.3),
                                            color: isNewSpeakerActive
                                              ? '#fff'
                                              : theme.palette.text.secondary,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.65rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                          }}
                                        >
                                          {isNewSpeakerActive
                                            ? newInterventionSpeaker.charAt(0)
                                            : '+'}
                                        </Box>
                                        <input
                                          type="text"
                                          placeholder="Autre..."
                                          value={existingSpeakersList.includes(newInterventionSpeaker) ? '' : newInterventionSpeaker}
                                          onChange={(e) => setNewInterventionSpeaker(e.target.value)}
                                          style={{
                                            border: 'none',
                                            outline: 'none',
                                            background: 'transparent',
                                            width: '70px',
                                            fontSize: '0.75rem',
                                            fontWeight: 500,
                                            color: 'inherit',
                                            fontFamily: 'inherit',
                                          }}
                                        />
                                      </Box>
                                    );
                                  })()}
                                </Box>
                                <TextField
                                  fullWidth
                                  multiline
                                  minRows={2}
                                  placeholder="Texte de l'intervention..."
                                  value={newInterventionText}
                                  onChange={(e) => setNewInterventionText(e.target.value)}
                                  sx={{
                                    '& .MuiInputBase-root': {
                                      borderRadius: '10px',
                                      fontSize: '0.85rem',
                                      bgcolor: '#fff',
                                    },
                                    '& .MuiOutlinedInput-notchedOutline': {
                                      borderColor: alpha(theme.palette.divider, 0.4),
                                    },
                                  }}
                                />
                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                  <Typography
                                    onClick={() => {
                                      setAddingAtIndex(null);
                                      setNewInterventionSpeaker('');
                                      setNewInterventionText('');
                                    }}
                                    sx={{
                                      fontSize: '0.8rem',
                                      color: 'text.secondary',
                                      cursor: 'pointer',
                                      py: 0.5,
                                      px: 1,
                                      borderRadius: '6px',
                                      '&:hover': { bgcolor: alpha(theme.palette.grey[200], 0.5) },
                                    }}
                                  >
                                    Annuler
                                  </Typography>
                                  <Typography
                                    onClick={() => {
                                      if (newInterventionSpeaker.trim() && newInterventionText.trim()) {
                                        handleAddIntervention(formattedTranscript.length - 1);
                                      }
                                    }}
                                    sx={{
                                      fontSize: '0.8rem',
                                      fontWeight: 500,
                                      color: (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                        ? 'text.disabled'
                                        : theme.palette.primary.main,
                                      cursor: (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                        ? 'not-allowed'
                                        : 'pointer',
                                      py: 0.5,
                                      px: 1,
                                      borderRadius: '6px',
                                      '&:hover': (!newInterventionSpeaker.trim() || !newInterventionText.trim())
                                        ? {}
                                        : { bgcolor: alpha(theme.palette.primary.main, 0.08) },
                                    }}
                                  >
                                    Ajouter
                                  </Typography>
                                </Box>
                              </Box>
                            </Paper>
                          </Fade>
                        ) : (
                          /* Plus button that appears on hover at the end - subtle design */
                          <Fade in={hoveredSeparatorIndex === formattedTranscript.length - 1} timeout={400}>
                            <IconButton
                              size="small"
                              onClick={() => setAddingAtIndex(formattedTranscript.length - 1)}
                              sx={{
                                width: 20,
                                height: 20,
                                bgcolor: alpha(theme.palette.grey[400], 0.3),
                                color: theme.palette.grey[500],
                                transition: 'all 0.25s ease',
                                '&:hover': {
                                  bgcolor: alpha(theme.palette.grey[500], 0.4),
                                  color: theme.palette.grey[700],
                                },
                              }}
                            >
                              <AddIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Fade>
                        )}
                      </Box>
                    )}
                  </Box>
                ) : !hasTranscript ? (
                  /* Transcription is being processed on server - use same skeleton as loading */
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 8,
                      px: 4,
                      width: '100%',
                    }}
                  >
                    {/* Animated waveform lines */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mb: 4,
                        height: 40,
                      }}
                    >
                      {[...Array(7)].map((_, i) => (
                        <Box
                          key={i}
                          sx={{
                            width: 3,
                            height: '100%',
                            borderRadius: 1.5,
                            bgcolor: alpha(theme.palette.primary.main, 0.15 + (i % 3) * 0.1),
                            animation: 'waveform2 1.2s ease-in-out infinite',
                            animationDelay: `${i * 0.1}s`,
                            '@keyframes waveform2': {
                              '0%, 100%': { transform: 'scaleY(0.3)' },
                              '50%': { transform: 'scaleY(1)' },
                            },
                          }}
                        />
                      ))}
                    </Box>

                    {/* Skeleton lines - cycling animation */}
                    <Box
                      sx={{
                        width: '100%',
                        maxWidth: 480,
                        margin: '0 auto',
                        animation: 'skeletonCycle2 3s ease-in-out infinite',
                        '@keyframes skeletonCycle2': {
                          '0%': { opacity: 0 },
                          '15%': { opacity: 1 },
                          '85%': { opacity: 1 },
                          '100%': { opacity: 0 },
                        },
                      }}
                    >
                      {[...Array(5)].map((_, i) => (
                        <Box
                          key={i}
                          sx={{
                            display: 'flex',
                            flexWrap: 'nowrap',
                            alignItems: 'flex-start',
                            gap: 1.5,
                            mb: 2,
                            width: '100%',
                            animation: 'skeletonSlideIn2 3s ease-in-out infinite',
                            animationDelay: `${i * 0.15}s`,
                            '@keyframes skeletonSlideIn2': {
                              '0%': { opacity: 0, transform: 'translateY(-8px)' },
                              '15%': { opacity: 1, transform: 'translateY(0)' },
                              '85%': { opacity: 1, transform: 'translateY(4px)' },
                              '100%': { opacity: 0, transform: 'translateY(8px)' },
                            },
                          }}
                        >
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              bgcolor: alpha(theme.palette.primary.main, 0.08),
                              flexShrink: 0,
                            }}
                          />
                          <Box sx={{ flex: 1, pt: 0.25, minWidth: 0 }}>
                            <Box
                              sx={{
                                width: 60 + (i % 4) * 20,
                                height: 10,
                                borderRadius: 1,
                                bgcolor: alpha(theme.palette.primary.main, 0.1),
                                mb: 0.75,
                              }}
                            />
                            <Box
                              sx={{
                                width: `${70 + (i % 3) * 10}%`,
                                height: 36,
                                borderRadius: '10px',
                                bgcolor: alpha(theme.palette.grey[400], 0.06),
                              }}
                            />
                          </Box>
                        </Box>
                      ))}
                    </Box>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 3, fontWeight: 500 }}
                    >
                      Traitement en cours...
                    </Typography>
                  </Box>
                ) : (
                  /* Transcript failed to load */
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 8,
                      px: 4,
                    }}
                  >
                    <DescriptionIcon sx={{ fontSize: 40, color: '#d1d5db', mb: 2 }} />
                    <Typography sx={{ fontWeight: 500, color: '#6b7280', mb: 0.5 }}>
                      Transcription non disponible
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                      La transcription n'a pas pu être chargée.
                    </Typography>
                  </Box>
                )}
                </>
                ) : null}
              </Box>
            </Fade>
          )}

          {/* Summary Tab */}
          {activeTab === 'summary' && !shouldShowLoading && (
            <Fade in={activeTab === 'summary' && !shouldShowLoading} timeout={300}>
              <Box sx={{
                position: 'relative',
                // SummaryGenerator uses position:absolute inset:0, so parent needs explicit height
                ...(hasSummary ? {} : {
                  height: 550,
                  minHeight: 450,
                }),
              }}>
                {/* Blocage Discovery - quota épuisé */}
                {!canViewTranscript && !loadingDiscoveryStatus ? (
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      py: 8,
                      px: 4,
                      textAlign: 'center',
                      minHeight: 400,
                    }}
                  >
                    <Box
                      sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        bgcolor: 'error.lighter',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mb: 3,
                      }}
                    >
                      <LockIcon sx={{ fontSize: 40, color: 'error.main' }} />
                    </Box>

                    <Typography variant="h5" fontWeight={600} color="text.primary" gutterBottom>
                      Quota Discovery épuisé
                    </Typography>

                    <Typography variant="body1" color="text.secondary" sx={{ mb: 1, maxWidth: 400 }}>
                      Vous avez utilisé toutes vos minutes Discovery gratuites.
                    </Typography>

                    <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
                      Pour accéder à vos résumés et continuer à enregistrer sans limite, passez à Gilbert Pro.
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <Button
                        variant="contained"
                        size="large"
                        onClick={() => window.location.href = '/settings?tab=subscription'}
                        sx={{
                          bgcolor: 'primary.main',
                          px: 5,
                          py: 1.5,
                          borderRadius: '12px',
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.95rem',
                          boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'primary.dark',
                            boxShadow: '0 6px 20px rgba(59, 130, 246, 0.35)',
                            transform: 'translateY(-1px)',
                          },
                          '&:active': {
                            transform: 'translateY(0)',
                          },
                        }}
                      >
                        Passer à Gilbert Pro
                      </Button>

                      {discoveryStatus && (
                        <Typography variant="caption" color="text.disabled">
                          {discoveryStatus.minutes_used} / {discoveryStatus.minutes_total} minutes utilisées
                        </Typography>
                      )}
                    </Box>
                  </Box>
                ) : hasSummary ? (
                  <>
                    {/* Action bar */}
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        mb: 2,
                        gap: 1,
                      }}
                    >
                      {!showRegenerateOptions && (
                        <>
                          {canRegenerate && (
                            <Button
                              variant="outlined"
                              size="small"
                              startIcon={<AnimatedRefreshIcon size={16} />}
                              onClick={() => setShowRegenerateOptions(true)}
                              disableElevation
                              sx={{
                                borderRadius: '10px',
                                borderColor: alpha(theme.palette.divider, 0.8),
                                color: 'text.secondary',
                                fontWeight: 500,
                                textTransform: 'none',
                                px: 2,
                                py: 0.75,
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                  borderColor: 'primary.main',
                                  color: 'primary.main',
                                  bgcolor: alpha(theme.palette.primary.main, 0.04),
                                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
                                },
                              }}
                            >
                              Régénérer
                            </Button>
                          )}
                          <Suspense fallback={<ExportButtonLoader />}>
                            <SummaryExportButton
                              summaryText={editedSummaryText || meeting.summary_text || ''}
                              meetingId={meeting.id}
                              meetingName={meeting.title || 'Réunion'}
                              meetingDate={new Date(meeting.created_at).toLocaleDateString('fr-FR')}
                              logoUrl={templateForExport?.logo_url}
                              layoutConfig={templateForExport?.layout_config}
                              participants={meeting.speakers?.map((s: { name: string }) => s.name)}
                              duration={meeting.duration ? `${Math.floor(meeting.duration / 60)} min` : undefined}
                              onSuccess={() => {}}
                              onError={(msg) => onError('Erreur', msg)}
                            />
                          </Suspense>
                        </>
                      )}
                    </Box>

                    {/* Regenerate options panel - Full width dropdown */}
                    {showRegenerateOptions && canRegenerate && (
                      <RegenerateDropdown
                        templates={templates}
                        selectedTemplateId={regenerateTemplateId}
                        onSelectTemplate={setRegenerateTemplateId}
                        onCancel={() => {
                          setShowRegenerateOptions(false);
                          setRegenerateTemplateId(null);
                        }}
                        onRegenerate={handleRegenerateSummary}
                        isGenerating={isGeneratingSummary}
                      />
                    )}

                    {/* Summary content - always editable when canEdit */}
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: 'divider',
                        overflow: 'hidden',
                      }}
                    >
                      {canEdit ? (
                        <Box sx={{ p: 0 }}>
                          <Suspense fallback={<CircularProgress size={24} />}>
                            <TipTapEditor
                              value={editedSummaryText || meeting.summary_text || ''}
                              onChange={(newText) => {
                                onSummaryTextChange(newText);
                              }}
                              onBlur={() => {
                                // Auto-save quand l'éditeur perd le focus
                                if (editedSummaryText && editedSummaryText !== meeting.summary_text) {
                                  void onSaveSummary();
                                }
                              }}
                              placeholder="Éditez votre compte-rendu..."
                              minHeight={550}
                            />
                          </Suspense>
                        </Box>
                      ) : (
                        <MeetingSummaryRenderer
                          summaryText={meeting.summary_text || ''}
                          isLoading={false}
                        />
                      )}
                    </Paper>
                  </>
                ) : (
                  /* No summary - Show template selector and generate button */
                  <SummaryGenerator
                    templates={templates}
                    selectedTemplateId={selectedTemplateId}
                    onSelectTemplate={onSelectTemplate}
                    onGenerate={handleGenerateSummary}
                    isGenerating={isGeneratingSummary}
                    hasTranscript={hasTranscript}
                  />
                )}
              </Box>
            </Fade>
          )}
        </Box>
      </DialogContent>


      {/* Alert Dialog for unnamed speakers - Notion/Apple minimalist style */}
      {showSpeakerRenameAlert && (
        <Box
          component={motion.div}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setShowSpeakerRenameAlert(false)}
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0, 0, 0, 0.25)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box
            component={motion.div}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 32,
              mass: 0.8,
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{
              position: 'relative',
              width: '100%',
              maxWidth: 380,
              mx: 2,
              bgcolor: '#fff',
              borderRadius: '14px',
              boxShadow: '0 4px 24px -4px rgba(0, 0, 0, 0.08), 0 12px 48px -8px rgba(0, 0, 0, 0.12)',
              overflow: 'hidden',
            }}
          >
            {/* Close button - discrete */}
            <IconButton
              onClick={() => setShowSpeakerRenameAlert(false)}
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                color: '#c4c4c4',
                '&:hover': {
                  color: '#999',
                  bgcolor: 'transparent',
                },
              }}
            >
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>

            {/* Content */}
            <Box sx={{ px: 3, pt: 2.5, pb: 2, pr: 5 }}>
              {/* Title - clean typography */}
              <Typography
                sx={{
                  fontWeight: 600,
                  fontSize: '1rem',
                  color: '#1a1a1a',
                  letterSpacing: '-0.01em',
                  mb: 0.75,
                }}
              >
                Identifier les participants ?
              </Typography>

              {/* Description - subtle */}
              <Typography
                sx={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  lineHeight: 1.5,
                }}
              >
                Les comptes-rendus sont plus pertinents avec des noms identifiés.
              </Typography>
            </Box>

            {/* Divider */}
            <Box sx={{ height: '1px', bgcolor: '#f0f0f0' }} />

            {/* Actions - Apple style stacked buttons */}
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* Primary action */}
              <Box
                component="button"
                onClick={handleGoToRenameParticipants}
                sx={{
                  width: '100%',
                  py: 1.5,
                  px: 3,
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#f7f7f7' },
                  '&:active': { bgcolor: '#efefef' },
                }}
              >
                <Typography
                  sx={{
                    color: theme.palette.primary.main,
                    fontWeight: 600,
                    fontSize: '0.9375rem',
                    textAlign: 'center',
                  }}
                >
                  Identifier les participants
                </Typography>
              </Box>

              {/* Divider */}
              <Box sx={{ height: '1px', bgcolor: '#f0f0f0' }} />

              {/* Secondary action */}
              <Box
                component="button"
                onClick={handleGenerateSummaryAnyway}
                sx={{
                  width: '100%',
                  py: 1.5,
                  px: 3,
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#f7f7f7' },
                  '&:active': { bgcolor: '#efefef' },
                }}
              >
                <Typography
                  sx={{
                    color: '#6b7280',
                    fontWeight: 500,
                    fontSize: '0.9375rem',
                    textAlign: 'center',
                  }}
                >
                  Continuer sans identifier
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Dialog>
  );
};

export default MeetingDetailOverlay;
