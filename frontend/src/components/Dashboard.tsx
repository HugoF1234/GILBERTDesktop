import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Chip,
  Tooltip,
} from '@mui/material';
import {
  Mic as MicIcon,
  Stop as StopIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
  UploadFile as UploadFileIcon,
  CloudUpload as CloudUploadIcon,
  Description as DescriptionIcon,
  Share as ShareIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';

import { User } from '../services/authService';
import { getUserProfile } from '../services/profileService';
import apiClient from '../services/apiClient';
import { useNotification } from '../contexts/NotificationContext';
import SettingsDialog from './SettingsDialog';
import { recordingStorage } from '../services/recordingStorage';
import { recordingManager } from '../services/recordingManager';
import { ConnectionStatus } from '../services/connectionMonitor';

import {
  uploadMeeting,
  watchTranscriptionStatus,
  onTranscriptionCompleted,
} from '../services/meetingService';
import { useRouteContext } from '../hooks/useRouteContext';
import { useDataStore } from '../stores/dataStore';
import { logger } from '@/utils/logger';
import { toUserFriendlyMessage } from '@/utils/errorMessages';

interface DashboardProps {
  user?: User | null;
  onRecordingStateChange?: (recording: boolean) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  isMobile?: boolean;
  isRecordingFromParent?: boolean;
}

interface RecentMeeting {
  id: string;
  title: string;
  date: string;
  created_at?: string; // Date originale de création pour le graphique d'activité
  duration?: number; // Durée en secondes
  audio_duration?: number; // Durée audio en secondes
  participants: number;
  progress: number;
  status?: string; // Statut de la transcription
  error_message?: string; // Message d'erreur éventuel
}

const features = [
  {
    title: '🎙️ Transcription en temps réel',
    description: 'Transcrivez les réunions en temps réel avec une grande précision',
    icon: <MicIcon sx={{ color: '#3B82F6' }} />,
    action: 'Commencer l\'enregistrement',
    highlight: true,
  },
  {
    title: '🌍 Support multi-langues',
    description: 'Support pour plus de 100 langues et dialectes',
    icon: <UploadFileIcon sx={{ color: '#10B981' }} />,
    action: 'Changer de langue',
  },
  {
    title: '✨ Résumés intelligents',
    description: 'Résumés de réunions et points clés propulsés par l\'IA',
    icon: <DescriptionIcon sx={{ color: '#6366F1' }} />,
    action: 'Voir la démo',
  },
  {
    title: '👥 Reconnaissance des orateurs',
    description: 'Identifiez automatiquement les différents orateurs',
    icon: <ShareIcon sx={{ color: '#8B5CF6' }} />,
    action: 'Partager maintenant',
  },
  {
    title: 'Analyse des sentiments',
    description: 'Analysez le ton des réunions et l\'engagement des participants',
    icon: <StopIcon />,
    action: 'Afficher les analyses',
  },
  {
    title: 'Durée de la réunion',
    description: 'Suivi automatique du temps de réunion',
    icon: <RefreshIcon />,
    action: 'Voir les statistiques',
  },
];

const Dashboard: React.FC<DashboardProps> = (props) => {
  // Utiliser le context de route, avec fallback vers les props
  const routeContext = useRouteContext();
  const user = props.user ?? routeContext.currentUser;
  const onRecordingStateChange = props.onRecordingStateChange ?? routeContext.setIsRecording;
  const onUploadStateChange = props.onUploadStateChange ?? routeContext.setIsUploading;
  const isMobile = props.isMobile ?? routeContext.isMobile;
  // Note: isRecordingFromParent disponible si besoin via routeContext.isRecording

  const { showSuccessPopup } = useNotification();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // État pour le fichier audio le plus récent
  const [latestAudioFile, setLatestAudioFile] = useState<File | null>(null);
  const [titleInput, setTitleInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<'preparing' | 'uploading' | 'processing' | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showCancelConfirmation, setShowCancelConfirmation] = useState(false);
  const [errorState, setErrorState] = useState<{message: string} | null>(null);

  // ===== DATA STORE - Données globales avec cache SWR =====
  const storeMeetings = useDataStore((state) => state.meetings);
  const fetchMeetingsFromStore = useDataStore((state) => state.fetchMeetings);
  const addMeetingToStore = useDataStore((state) => state.addMeeting);
  const updateMeetingInStore = useDataStore((state) => state.updateMeeting);

  // Dériver meetingsList depuis le store
  const meetingsList: RecentMeeting[] = React.useMemo(() => {
    return storeMeetings.map(meeting => ({
      id: meeting.id,
      title: meeting.name || meeting.title || `Meeting ${meeting.id.substring(0, 8)}`,
      date: meeting.created_at ? new Date(meeting.created_at).toLocaleDateString() : 'Unknown date',
      created_at: meeting.created_at,
      status: meeting.transcript_status || meeting.transcription_status || 'unknown',
      duration: meeting.duration_seconds || meeting.audio_duration,
      audio_duration: meeting.audio_duration,
      participants: meeting.speakers_count || 0,
      progress: meeting.transcript_status === 'completed' || meeting.transcription_status === 'completed' ? 100 :
               meeting.transcript_status === 'processing' || meeting.transcription_status === 'processing' ? 50 :
               meeting.transcript_status === 'pending' || meeting.transcription_status === 'pending' ? 25 : 0
    }));
  }, [storeMeetings]);

  const [, setUserProfile] = useState<unknown>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showPremiumDialog, setShowPremiumDialog] = useState(false);

  // États de chargement pour les animations fluides
  const [isLoaded, setIsLoaded] = useState(false);

  // État pour le popup d'avertissement avant l'enregistrement
  const [showRecordingWarning, setShowRecordingWarning] = useState(false);

  // ===== NOUVEAUX ÉTATS POUR PHASE 1 + 2 =====
  const [connectionStatus] = useState<ConnectionStatus>('online');

  // ===== ÉTAT POUR L'ANIMATION DE GILBERT =====
  const [gilbertState, setGilbertState] = useState<'salut' | 'idle' | 'recording'>('salut');
  const [, setImagePreloaded] = useState(false);
  const salutVideoRef = useRef<HTMLVideoElement>(null);
  const idleImageRef = useRef<HTMLImageElement>(null);

  // ===== GESTION DES TRANSITIONS DE GILBERT =====
  useEffect(() => {
    if (isRecording) {
      // Passer à l'animation d'écriture quand on enregistre
      setGilbertState('recording');
    } else if (gilbertState === 'recording') {
      // Retour à idle quand l'enregistrement s'arrête
      setGilbertState('idle');
    }
  }, [isRecording]);

  // Handler pour détecter la fin de la vidéo de salut
  const handleSalutEnded = () => {
    logger.debug('🎬 Vidéo salut terminée, passage à idle');
    setGilbertState('idle');
  };

  // ===== SYNCHRONISATION AVEC LE RECORDING MANAGER (SINGLETON) =====
  useEffect(() => {
    // Vérifier si un enregistrement est actif dans le manager
    const isActiveRecording = recordingManager.isRecording();
    
    if (isActiveRecording) {
      logger.debug('🔄 Enregistrement actif détecté dans recordingManager');
      setIsRecording(true);
      setAudioDuration(recordingManager.getCurrentDuration());
      
      // Notifier le parent
      if (onRecordingStateChange) {
        onRecordingStateChange(true);
      }
      
      // Reconnecter les callbacks pour mettre à jour l'UI
      recordingManager.updateCallbacks({
        onDurationUpdate: (duration) => {
          setAudioDuration(duration);
        },
        onStateChange: (state) => {
          const recording = state === 'recording';
          const paused = state === 'paused';
          setIsRecording(recording);
          setIsPaused(paused);
          if (onRecordingStateChange) {
            onRecordingStateChange(recording || paused);
          }
        },
        onRecordingComplete: (audioBlob, mimeType, duration) => {
          handleRecordingComplete(audioBlob, mimeType, duration);
        },
      });
    }
  }, []); // Exécuter une seule fois au montage

  // ===== INITIALISATION DES SERVICES DE PROTECTION (PHASE 1 + 2) =====
  useEffect(() => {
    const initServices = async () => {
      logger.debug('🚀 Initialisation des services de protection...');
      
      // 1. Initialiser IndexedDB
      try {
        await recordingStorage.init();
      } catch (error) {
        logger.error('Erreur initialisation IndexedDB:', error);
      }

      // 2. Vérifier s'il y a des enregistrements en attente (SAUF celui en cours)
      try {
        const pendingRecordings = await recordingStorage.getPendingRecordings();
        const currentRecordingUuid = recordingManager.getCurrentRecordingUuid();
        
        // Filtrer : exclure l'enregistrement EN COURS
        const oldFailedRecordings = pendingRecordings.filter(
          (r: { uuid: string }) => r.uuid !== currentRecordingUuid
        );
        
        if (oldFailedRecordings.length > 0) {
          logger.debug(`⚠️ ${oldFailedRecordings.length} ancien(s) enregistrement(s) — upload auto à la reconnexion`);
          // Upload auto en arrière-plan, pas d'UI
          uploadPendingRecordingsSilently(oldFailedRecordings);
        } else if (currentRecordingUuid) {
          logger.debug('✅ Enregistrement en cours détecté, pas d\'alerte Recovery');
        }
      } catch (error) {
        logger.error('Erreur vérification enregistrements pendants:', error);
      }

      // 3. Le monitoring de connexion sera démarré UNIQUEMENT pendant l'enregistrement
      // (pas besoin de vérifier la connexion en dehors des enregistrements)

      // 4. Nettoyer les vieux enregistrements (> 7 jours)
      try {
        await recordingStorage.cleanupOldRecordings();
      } catch (error) {
        logger.error('Erreur nettoyage:', error);
      }
    };

    initServices();

    // ✅ VÉRIFICATION AUTOMATIQUE APRÈS RECONNEXION
    // Écouter les événements de reconnexion pour proposer automatiquement les enregistrements
    const handleOnline = async () => {
      logger.debug('✅ Reconnexion détectée - Vérification des enregistrements en attente...');
      try {
        const pendingRecordings = await recordingStorage.getPendingRecordings();
        const currentRecordingUuid = recordingManager.getCurrentRecordingUuid();
        
        // Filtrer : exclure l'enregistrement EN COURS
        const oldFailedRecordings = pendingRecordings.filter(
          (r: { uuid: string }) => r.uuid !== currentRecordingUuid
        );
        
        if (oldFailedRecordings.length > 0) {
          logger.debug(`📦 ${oldFailedRecordings.length} enregistrement(s) — upload auto après reconnexion`);
          uploadPendingRecordingsSilently(oldFailedRecordings);
        }
      } catch (error) {
        logger.error('Erreur vérification enregistrements après reconnexion:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    fetchMeetingsFromStore();
    loadUserProfile();
    
    // Animation d'entrée progressive - très rapide
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 20);

    return () => clearTimeout(timer);
  }, []);

  // Fonction pour ouvrir la fenêtre de paramètres
  const handleOpenSettings = () => {
    setShowSettingsDialog(true);
  };

  // Fonction pour fermer la fenêtre de paramètres
  const handleCloseSettings = () => {
    setShowSettingsDialog(false);
  };

  // Fonction pour ouvrir le popup premium
  const handleOpenPremiumDialog = () => {
    setShowPremiumDialog(true);
  };

  // Fonction pour fermer le popup premium
  const handleClosePremiumDialog = () => {
    setShowPremiumDialog(false);
  };

  // Fonction pour contacter Lexia France
  const handleContactSupport = () => {
    window.open('mailto:support@gilbert.ai?subject=Support Gilbert', '_blank');
  };

  // Fonctions pour gérer le popup d'avertissement d'enregistrement
  const handleOpenRecordingWarning = () => {
    setShowRecordingWarning(true);
  };

  const handleCloseRecordingWarning = () => {
    setShowRecordingWarning(false);
  };

  const handleConfirmRecording = () => {
    setShowRecordingWarning(false);
    startRecording();
  };

  useEffect(() => {
    // Écouter les événements de transcription terminée (sans notification - déjà gérée par le polling)
    const unsubscribe = onTranscriptionCompleted((meeting) => {
      logger.debug("Transcription completed event received for:", meeting.name || meeting.title);
      // Notification supprimée car déjà gérée par le polling
    });
    
    return () => {
      logger.debug("Cleaning up transcription completed listener");
      unsubscribe();
    };
  }, []);

  // Référence pour stocker la fonction de nettoyage du polling
  const [cleanupPolling, setCleanupPolling] = useState<(() => void) | null>(null);

  // ===== CHARGEMENT DES DONNÉES VIA LE STORE =====
  // Le store gère automatiquement le cache et la revalidation
  useEffect(() => {
    if (user) {
      fetchMeetingsFromStore();
    }
  }, [user, fetchMeetingsFromStore]);

  // ===== POLLING POUR LES MEETINGS EN TRAITEMENT =====
  useEffect(() => {
    // Vérifier s'il y a des meetings en cours de transcription
    const processingMeetings = meetingsList.filter(m =>
      m.status === 'pending' || m.status === 'processing'
    );

    if (processingMeetings.length === 0) return;

    processingMeetings.forEach(meeting => {
      logger.debug(`Starting polling for meeting transcription in progress: ${meeting.id} (${meeting.status})`);

      const stopPolling = watchTranscriptionStatus(
        meeting.id,
        (newStatus: string) => {
          logger.debug(`Transcription status update for ${meeting.id}: ${newStatus}`);

          if (newStatus === 'completed' || newStatus === 'error') {
            logger.debug(`Meeting ${meeting.id} transcription reached final status: ${newStatus}`);

            if (stopPolling) {
              stopPolling();
            }

            // Rafraîchir le store
            setTimeout(() => {
              fetchMeetingsFromStore(true);
            }, 1000);
          }
        }
      );

      if (stopPolling && typeof stopPolling === 'function') {
        setCleanupPolling(prev => {
          if (prev) prev();
          return stopPolling;
        });
      }
    });

    return () => {
      if (cleanupPolling) {
        cleanupPolling();
      }
    };
  }, [meetingsList, fetchMeetingsFromStore, cleanupPolling]);

  // Charger le profil utilisateur
  useEffect(() => {
    if (user) {
      loadUserProfile();
    }
  }, [user]);
  
  // Réinitialiser l'état d'enregistrement uniquement au montage initial du composant
  useEffect(() => {
    // Vérifier si un enregistrement est en cours au montage initial du composant
    if (isRecording) {
      // Si on vient de revenir au dashboard après avoir confirmé l'arrêt de l'enregistrement
      // via la boîte de dialogue de confirmation, on s'assure que l'état local est cohérent
      setIsRecording(false);
      if (onRecordingStateChange) {
        onRecordingStateChange(false);
      }
    }
    
    // Nettoyer lors du démontage
    return () => {
      // ===== NE PAS arrêter l'enregistrement lors du démontage =====
      // Le recordingManager est un singleton qui persiste
      // L'enregistrement doit continuer même si l'utilisateur change de page
      logger.debug('🔄 Dashboard unmounting - enregistrement continue en arrière-plan');
      
      // Arrêter le polling de transcription si en cours
      if (cleanupPolling) {
        logger.debug('🧹 Dashboard unmounting - stopping transcription polling');
        cleanupPolling();
        setCleanupPolling(null);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Dépendance vide pour n'exécuter qu'au montage initial
  
  // Upload silencieux des enregistrements en attente (reconnexion, init)
  const uploadPendingRecordingsSilently = async (recordings: { uuid: string; audioBlob?: Blob; metadata?: { title?: string; mimeType?: string } }[]) => {
    for (const recording of recordings) {
      if (!navigator.onLine) break;
      if (!recording.audioBlob || recording.audioBlob.size < 1024) continue;
      try {
        await recordingStorage.updateUploadStatus(recording.uuid, 'uploading');
        const title = recording.metadata?.title?.trim() || 'Enregistrement sans titre';
        const ext = recording.metadata?.mimeType?.split('/')[1] || 'webm';
        const file = new File(
          [recording.audioBlob],
          `${title}.${ext}`,
          { type: recording.metadata?.mimeType || 'audio/webm' }
        );
        const result = await uploadMeeting(file, title);
        await recordingStorage.updateUploadStatus(recording.uuid, 'completed', result.id);
        setTimeout(() => recordingStorage.deleteRecording(recording.uuid), 5000);
        logger.debug(`✅ Upload auto: ${recording.uuid} → ${result.id}`);
      } catch (err) {
        logger.error(`❌ Upload auto échoué ${recording.uuid}:`, err);
        await recordingStorage.updateUploadStatus(recording.uuid, 'failed');
      }
    }
    fetchMeetingsFromStore(true);
  };

  // Fonction pour charger le profil complet de l'utilisateur
  const loadUserProfile = async () => {
    try {
      const profileData = await getUserProfile();
      setUserProfile(profileData);
    } catch (error) {
      logger.error('Erreur lors du chargement du profil:', error);
      // Utiliser les informations de base de l'utilisateur en cas d'échec
      if (user) {
        setUserProfile({
          id: user.id,
          email: user.email,
          full_name: user.name || '',
          profile_picture_url: null
        });
      }
    }
  };

  // Fonction appelée quand l'enregistrement est terminé
  const handleRecordingComplete = (audioBlob: Blob, mimeType: string, _duration: number) => {
    logger.debug('✅ Enregistrement terminé, création du fichier');
    
    // Déterminer l'extension
    let fileExtension = 'webm';
    if (mimeType.includes('wav')) fileExtension = 'wav';
    else if (mimeType.includes('mp3')) fileExtension = 'mp3';
    else if (mimeType.includes('mp4')) fileExtension = 'mp4';
    else if (mimeType.includes('ogg')) fileExtension = 'ogg';
    
    // Créer le fichier
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const audioFile = new File([audioBlob], `recording_${timestamp}.${fileExtension}`, {
      type: mimeType,
      lastModified: Date.now(),
    });
    
    setLatestAudioFile(audioFile);
    setShowDialog(true);
  };

  // Fonction pour démarrer l'enregistrement
  const startRecording = async () => {
    try {
      // ===== UTILISATION DU RECORDING MANAGER (SINGLETON) =====
      const result = await recordingManager.startRecording({
        onDurationUpdate: (duration) => {
          setAudioDuration(duration);
        },
        onStateChange: (state) => {
          const recording = state === 'recording';
          const paused = state === 'paused';
          setIsRecording(recording);
          setIsPaused(paused);
          if (onRecordingStateChange) {
            onRecordingStateChange(recording || paused);
          }
        },
        onRecordingComplete: (audioBlob, mimeType, duration) => {
          handleRecordingComplete(audioBlob, mimeType, duration);
        },
      });

      if (!result.success) {
        alert(result.error || 'Impossible de démarrer l\'enregistrement');
        return;
      }

      // Notifier le backend avec device_type "web"
      try {
        await apiClient.post('/api/recordings/start', { device_type: 'web' });
        logger.debug('✅ Backend notifié (device: web)');
      } catch (error) {
        logger.error('❌ Erreur notification backend:', error);
      }
      
    } catch (error) {
      logger.error('Erreur lors du démarrage de l\'enregistrement:', error);
      alert('Impossible d\'accéder au microphone. Veuillez vérifier les permissions.');
    }
  };

  // Fonction pour mettre en pause l'enregistrement
  const pauseRecording = async () => {
    try {
      logger.debug('⏸️ Mise en pause de l\'enregistrement...');
      await recordingManager.pauseRecording();
      
      // Notifier le backend (optionnel - on peut garder l'enregistrement actif)
      // On ne notifie pas le backend car l'enregistrement n'est pas vraiment arrêté
    } catch (error) {
      logger.error('Erreur pause enregistrement:', error);
      alert('Une erreur est survenue lors de la mise en pause de l\'enregistrement.');
    }
  };

  // Fonction pour reprendre l'enregistrement
  const resumeRecording = async () => {
    try {
      logger.debug('▶️ Reprise de l\'enregistrement...');
      await recordingManager.resumeRecording();
    } catch (error) {
      logger.error('Erreur reprise enregistrement:', error);
      alert('Une erreur est survenue lors de la reprise de l\'enregistrement.');
    }
  };

  // Fonction pour finaliser l'enregistrement (arrêt définitif)
  const finishRecording = async () => {
    try {
      logger.debug('🛑 Finalisation de l\'enregistrement...');
      const audioBlob = await recordingManager.finalizeRecording();
      
      if (audioBlob) {
        // Créer le fichier à partir du blob finalisé
        const mimeType = audioBlob.type || 'audio/webm';
        let fileExtension = 'webm';
        if (mimeType.includes('wav')) fileExtension = 'wav';
        else if (mimeType.includes('mp3')) fileExtension = 'mp3';
        else if (mimeType.includes('mp4')) fileExtension = 'mp4';
        else if (mimeType.includes('ogg')) fileExtension = 'ogg';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const audioFile = new File([audioBlob], `recording_${timestamp}.${fileExtension}`, {
          type: mimeType,
          lastModified: Date.now(),
        });
        
        setLatestAudioFile(audioFile);
        setShowDialog(true); // Ouvrir le dialog de sauvegarde
      
      // Notifier le backend
      try {
        await apiClient.post('/api/recordings/stop');
        logger.debug('✅ Backend notifié de l\'arrêt');
      } catch (error) {
        logger.error('❌ Erreur notification backend:', error);
        }
      } else {
        logger.error('❌ Impossible de finaliser l\'enregistrement');
        alert('Erreur lors de la finalisation de l\'enregistrement. Veuillez réessayer.');
      }
    } catch (error) {
      logger.error('Erreur finalisation enregistrement:', error);
      alert('Une erreur est survenue lors de la finalisation de l\'enregistrement.');
    }
  };

  // Fonction pour formater le temps d'enregistrement (secondes -> MM:SS)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Fonction pour calculer le score d'engagement basé sur l'activité réelle
  const calculateEngagementScore = (): number => {
    if (meetingsList.length === 0) return 0;
    
    // Statistiques de base
    const totalMeetings = meetingsList.length;
    const totalMinutes = Math.floor(
      meetingsList.reduce((total, meeting) => {
        const duration = meeting.duration || meeting.audio_duration || 0;
        return total + (typeof duration === 'number' ? duration : 0);
      }, 0) / 60
    );
    const completedTranscriptions = meetingsList.filter(m => 
      m.status === 'completed' || 
      (m as any).transcript_status === 'completed' || 
      (m as any).transcription_status === 'completed'
    ).length;
    
    // Calcul du score (sur 100)
    let score = 0;
    
    // Points pour les réunions (max 30 points)
    score += Math.min(totalMeetings * 5, 30);
    
    // Points pour les minutes d'écoute (max 25 points)
    score += Math.min(totalMinutes * 0.5, 25);
    
    // Points pour les transcriptions complétées (max 30 points)
    score += Math.min(completedTranscriptions * 10, 30);
    
    // Bonus de régularité si l'utilisateur a des réunions récentes (max 10 points)
    const recentMeetings = meetingsList.filter(meeting => {
      const meetingDate = new Date(meeting.date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return meetingDate >= thirtyDaysAgo;
    }).length;
    score += Math.min(recentMeetings * 2, 10);
    
    // Bonus de diversité si différentes durées de réunion (max 5 points)
    const uniqueDurations = new Set(meetingsList.map(m => Math.floor((m.duration || 0) / 300))); // Groupes de 5 minutes
    score += Math.min(uniqueDurations.size, 5);
    
    return Math.min(Math.round(score), 100);
  };

  // Fonction pour déterminer le niveau d'engagement basé sur le score
  const getEngagementLevel = (score: number): string => {
    if (score >= 90) return "Expert Gilbert 🏆";
    if (score >= 75) return "Utilisateur avancé 🚀";
    if (score >= 50) return "Utilisateur actif 🔥";
    if (score >= 25) return "Débutant motivé 🌱";
    return "Nouveau utilisateur 👋";
  };

  // Fonction pour calculer le pourcentage d'utilisateurs moins actifs
  const getTopPercentage = (score: number): number => {
    // Simulation basée sur le score - en réalité, cela viendrait d'une API
    if (score >= 85) return 10; // Top 10%
    if (score >= 70) return 25; // Top 25%
    if (score >= 50) return 50; // Top 50%
    if (score >= 30) return 75; // Top 75%
    return 90; // Top 90%
  };

  // Calcul des métriques d'engagement
  const engagementScore = calculateEngagementScore();
  const topPercentage = getTopPercentage(engagementScore);
  const engagementLevel = getEngagementLevel(engagementScore);
  const pointsToNextLevel = engagementScore < 100 ? Math.ceil((Math.ceil(engagementScore / 10) * 10 + 10) - engagementScore) : 0;

  // Fonction pour générer des données d'activité basées sur les vraies réunions
  const generateActivityData = () => {
    const data = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364); // 52 semaines = 364 jours
    
    // Créer un map des dates avec l'activité réelle
    const activityMap = new Map<string, number>();
    
    // Parcourir les réunions existantes pour compter l'activité par jour
    meetingsList.forEach(meeting => {
      // Utiliser created_at (date originale) pour le graphique d'activité
      if (meeting.created_at) {
        const meetingDate = new Date(meeting.created_at);
        
        // Vérifier que la date est valide et compter l'activité
        if (!isNaN(meetingDate.getTime())) {
          const dateKey = meetingDate.toISOString().split('T')[0];
          const currentCount = activityMap.get(dateKey) || 0;
          activityMap.set(dateKey, currentCount + 1);
        } else {
          logger.warn('Invalid created_at date found for meeting:', meeting.id, meeting.created_at);
        }
      }
    });
    
    // Générer les 365 derniers jours avec l'activité réelle
    for (let i = 0; i < 365; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateKey = currentDate.toISOString().split('T')[0];
      
      // Récupérer l'activité réelle pour cette date
      const realActivity = activityMap.get(dateKey) || 0;
      
      // Déterminer le niveau d'intensité basé sur le nombre de réunions
      let level = 0;
      if (realActivity > 0) {
        if (realActivity === 1) level = 1;
        else if (realActivity === 2) level = 2;
        else if (realActivity === 3) level = 3;
        else level = 4; // 4+ réunions dans la journée
      }
      
      data.push({
        date: dateKey,
        count: realActivity,
        level: level
      });
    }
    
    return data;
  };

  const activityData = generateActivityData();
  
  // Calculer les statistiques d'activité basées sur les vraies données
  const totalContributions = activityData.reduce((sum, day) => sum + day.count, 0);
  
  // Calculer le nombre de semaines avec au moins une activité
  const activeWeeks = (() => {
    const weeklyActivity = new Map<string, boolean>();
    activityData.forEach(day => {
      if (day.count > 0) {
        const date = new Date(day.date);
        // Obtenir le lundi de la semaine pour cette date
        const monday = new Date(date);
        const dayOfWeek = date.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Dimanche = 0, donc 6 jours jusqu'au lundi
        monday.setDate(date.getDate() - daysToMonday);
        const weekKey = monday.toISOString().split('T')[0];
        weeklyActivity.set(weekKey, true);
      }
    });
    return weeklyActivity.size;
  })();
  
  // Calculer la série actuelle de jours consécutifs avec activité
  const currentStreak = (() => {
    let streak = 0;
    const today = new Date();
    
    // Parcourir les jours depuis aujourd'hui vers le passé
    for (let i = activityData.length - 1; i >= 0; i--) {
      const dayDate = new Date(activityData[i].date);
      const daysDiff = Math.floor((today.getTime() - dayDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Si on a dépassé la série continue, arrêter
      if (daysDiff > streak) break;
      
      // Si ce jour a de l'activité, continuer la série
      if (activityData[i].count > 0) {
        // Vérifier que c'est bien consécutif (pas de trou dans les jours)
        if (daysDiff === streak) {
          streak++;
        } else {
          // Il y a un trou, la série s'arrête
          break;
        }
      } else if (daysDiff === streak) {
        // Pas d'activité ce jour-ci et c'est le jour attendu, la série s'arrête
        break;
      }
    }
    
    return streak;
  })();

  // Organiser les données par semaines pour l'affichage
  const organizeDataByWeeks = (data: typeof activityData) => {
    const weeks = [];
    for (let i = 0; i < data.length; i += 7) {
      weeks.push(data.slice(i, i + 7));
    }
    return weeks;
  };

  const weeklyData = organizeDataByWeeks(activityData);

  // Fonction pour gérer l'annulation avec confirmation
  const handleCancelClick = () => {
    setShowCancelConfirmation(true);
  };

  const handleConfirmCancel = async () => {
    // ===== ABANDON VOLONTAIRE via recordingManager =====
    await recordingManager.abandonRecording();
    logger.debug('🗑️ Enregistrement abandonné volontairement');

    setIsRecording(false);
    setShowCancelConfirmation(false);
    setShowDialog(false);
    setTitleInput('');
    setErrorState(null);
    setAudioDuration(0);
    
    if (latestAudioFile) {
      setLatestAudioFile(null);
    }

    // Notifier le parent
    if (onRecordingStateChange) {
      onRecordingStateChange(false);
    }
  };

  const handleCancelConfirmationClose = () => {
    setShowCancelConfirmation(false);
  };

  // Fonction pour sauvegarder l'enregistrement
  const saveRecording = async () => {
    let audioFileToSave = latestAudioFile;
    
    // Si un enregistrement est actif (en cours ou en pause), le finaliser d'abord
    if (recordingManager.isActive()) {
      logger.debug('🛑 Finalisation de l\'enregistrement avant sauvegarde...');
      const audioBlob = await recordingManager.finalizeRecording();
      
      if (audioBlob) {
        // Créer le fichier à partir du blob finalisé
        const mimeType = audioBlob.type || 'audio/webm';
        let fileExtension = 'webm';
        if (mimeType.includes('wav')) fileExtension = 'wav';
        else if (mimeType.includes('mp3')) fileExtension = 'mp3';
        else if (mimeType.includes('mp4')) fileExtension = 'mp4';
        else if (mimeType.includes('ogg')) fileExtension = 'ogg';
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        audioFileToSave = new File([audioBlob], `recording_${timestamp}.${fileExtension}`, {
          type: mimeType,
          lastModified: Date.now(),
        });
        
        setLatestAudioFile(audioFileToSave);
      } else {
        logger.error('❌ Impossible de finaliser l\'enregistrement');
        alert('Erreur lors de la finalisation de l\'enregistrement. Veuillez réessayer.');
        return;
      }
    }
    
    if (!audioFileToSave || !titleInput.trim()) {
      alert('Veuillez entrer un titre pour l\'enregistrement.');
      return;
    }
    
    setIsUploading(true);
    setUploadStage('preparing');
    setUploadProgress(0);
    setErrorState(null);
    
    // Notifier le changement d'état d'upload
    if (onUploadStateChange) {
      onUploadStateChange(true);
    }
    
    try {
      // Conserver le type MIME original du fichier audio
      const originalMimeType = audioFileToSave.type;
      let fileExtension = 'webm'; // Extension par défaut
      
      // Déterminer l'extension appropriée en fonction du type MIME original
      if (originalMimeType.includes('wav')) {
        fileExtension = 'wav';
      } else if (originalMimeType.includes('mp3')) {
        fileExtension = 'mp3';
      } else if (originalMimeType.includes('mp4')) {
        fileExtension = 'mp4';
      } else if (originalMimeType.includes('ogg')) {
        fileExtension = 'ogg';
      } else if (originalMimeType.includes('webm')) {
        fileExtension = 'webm';
      }
      
      // Créer un nom de fichier simple sans caractères spéciaux
      const sanitizedTitle = titleInput.trim().replace(/[^a-zA-Z0-9]/g, '_');
      const newFileName = `${sanitizedTitle}_${Date.now()}.${fileExtension}`;
      
      logger.debug('Type MIME original:', originalMimeType);
      logger.debug('Taille du fichier original:', Math.round(audioFileToSave.size / 1024) + ' KB');
      
      // Créer un nouveau fichier audio directement à partir du contenu brut
      const arrayBuffer = await audioFileToSave.arrayBuffer();
      logger.debug('Contenu du fichier lu avec succès, taille:', Math.round(arrayBuffer.byteLength / 1024) + ' KB');
      
      // Créer un nouveau fichier avec le contenu brut
      const audioFile = new File([arrayBuffer], newFileName, { 
        type: originalMimeType,
        lastModified: Date.now()
      });
      
      logger.debug('Préparation du fichier audio pour upload:', {
        name: audioFile.name,
        type: audioFile.type,
        size: Math.round(audioFile.size / 1024) + ' KB'
      });
      
      // Vérifier que le fichier est valide avant de l'envoyer
      if (audioFile.size < 1000) {
        throw new Error("L'enregistrement audio est trop petit ou corrompu. Veuillez réessayer.");
      }

      // Mettre à jour le titre dans IndexedDB avant l'upload
      const recordingUuid = recordingManager.getCurrentRecordingUuid();
      if (recordingUuid && titleInput.trim()) {
        await recordingStorage.updateRecordingMetadata(
          recordingUuid,
          titleInput.trim()
        );
        logger.debug(`📝 Titre mis à jour dans IndexedDB: "${titleInput.trim()}"`);
      }

      logger.debug(`Uploading recording "${titleInput}" (${audioFile.type}, ${(audioFile.size / 1024 / 1024).toFixed(2)} MB)...`);
      setUploadStage('uploading');
      
      // Uploader la réunion en utilisant la même logique que transcribeAudio
      const meeting = await uploadMeeting(audioFile, titleInput.trim(), {
        onProgress: (progress) => {
          setUploadProgress(progress);
          if (progress >= 100) setUploadStage('processing');
        }
      });
      
      // Vérifier que l'upload a réussi et que nous avons un ID valide
      if (!meeting || !meeting.id) {
        throw new Error("L'upload a réussi mais aucun ID de réunion n'a été retourné par le serveur");
      }
      
      logger.debug(`Recording uploaded successfully with ID: ${meeting.id}`);
      setUploadProgress(100);

      // ===== PHASE 2: Marquer comme uploadé avec succès dans IndexedDB =====
      const uuid = recordingManager.getCurrentRecordingUuid();
      if (uuid) {
        await recordingStorage.updateUploadStatus(uuid, 'completed', meeting.id);
        // Supprimer de IndexedDB après un court délai
        setTimeout(async () => {
          if (uuid) {
            await recordingStorage.deleteRecording(uuid);
          }
        }, 5000);
      }

      // Afficher un message de succès immédiat
      showSuccessPopup(
        "Upload réussi !",
        `Votre enregistrement "${titleInput}" a été uploadé. Vous pouvez le retrouver dans "Mes réunions récentes".`
      );
      
      // Commencer à surveiller le statut de la transcription en arrière-plan
      // Note: stopPolling peut être utilisé pour arrêter le polling si nécessaire
      watchTranscriptionStatus(
        meeting.id,
        (status, updatedMeeting) => {
          logger.debug(`Transcription status update: ${status}`);
          
          // Mettre à jour le store avec la nouvelle version
          if (status === 'completed') {
            updateMeetingInStore(updatedMeeting.id, updatedMeeting);

            // Afficher une notification de succès
            showSuccessPopup(
              "Transcription terminée !",
              `La transcription de "${updatedMeeting.title || updatedMeeting.name}" est prête.`
            );

            // Auto-génération de résumé selon préférence globale
            try {
              // 🚫 GÉNÉRATION AUTOMATIQUE DÉSACTIVÉE
              // Les résumés doivent être générés manuellement via le dropdown
              logger.debug('🚫 [PROTECTION] Génération automatique désactivée - l\'utilisateur doit choisir manuellement via le dropdown');
            } catch {}
          } else if (status === 'error') {
            // Notification d'erreur
            showSuccessPopup(
              "Erreur de transcription",
              "Une erreur est survenue pendant la transcription."
            );
          }
        }
      );

      // Mise à jour immédiate du store sans attendre la prochaine requête
      addMeetingToStore(meeting);
      
      // Réinitialiser l'état et fermer la modal après succès
      setTimeout(() => {
        setShowDialog(false);
        setTitleInput('');
        setLatestAudioFile(null);
        setIsUploading(false);
        setUploadStage(null);
        setUploadProgress(0);
        setErrorState(null);
        
        // Notifier la fin de l'upload
        if (onUploadStateChange) {
          onUploadStateChange(false);
        }
      }, 1500); // Délai de 1.5 secondes pour laisser le temps de voir le message de succès
      
    } catch (error) {
      logger.error('Error during recording upload:', error);
      const errorMessage = toUserFriendlyMessage(error);

      // ===== PHASE 2: Marquer comme échoué dans IndexedDB =====
      const uuid = recordingManager.getCurrentRecordingUuid();
      if (uuid) {
        await recordingStorage.updateUploadStatus(uuid, 'failed');
        logger.debug('⚠️ Enregistrement marqué comme échoué - disponible pour récupération');
      }
      
      setErrorState({ message: errorMessage });
      setIsUploading(false);
      setUploadStage(null);
      setUploadProgress(0);
      
      // Notifier la fin de l'upload en cas d'erreur
      if (onUploadStateChange) {
        onUploadStateChange(false);
      }
    }
  };

  // Handler for file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }
    
    // Récupérer le fichier
    const audioFile = event.target.files[0];
    
    logger.debug('File upload details:', {
      name: audioFile.name,
      type: audioFile.type,
      size: `${Math.round(audioFile.size / 1024)} KB`,
      lastModified: new Date(audioFile.lastModified).toISOString()
    });
    
    // Vérification de la taille du fichier
    if (audioFile.size < 1000) { // Moins de 1 KB est probablement un fichier vide ou corrompu
      logger.error('Audio file is too small, likely empty or corrupted');
      showSuccessPopup(
        "Fichier audio invalide",
        "Le fichier audio semble vide ou corrompu. Veuillez sélectionner un autre fichier."
      );
      return;
    }
    
    // La vérification de la taille maximale des fichiers audio a été retirée pour permettre
    // le téléversement de fichiers audio de grande taille
    
    // Vérifier que le fichier est un audio
    if (!audioFile.type.startsWith('audio/') && !audioFile.name.endsWith('.mp3') && !audioFile.name.endsWith('.wav') && !audioFile.name.endsWith('.webm') && !audioFile.name.endsWith('.ogg')) {
      showSuccessPopup(
        "Fichier non supporté",
        "Veuillez sélectionner un fichier audio (MP3, WAV, WebM ou OGG)."
      );
      return;
    }
    
    // Notifier le début de l'upload
    if (onUploadStateChange) {
      onUploadStateChange(true);
    }
    
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        // Simuler une progression d'upload plus réaliste
        if (prev < 90) {
          const increment = Math.random() * 5 + 1;
          return Math.min(prev + increment, 90);
        }
        return prev;
      });
    }, 300);
    
    // Utiliser le titre saisi ou le nom du fichier par défaut
    const title = titleInput || audioFile.name.replace(/\.[^/.]+$/, "");
    
    // Créer une copie du fichier avec un nom plus descriptif si nécessaire
    let processedAudioFile = audioFile;
    
    // Si le titre est différent du nom du fichier, créer une nouvelle instance de File
    if (title && title !== audioFile.name.replace(/\.[^/.]+$/, "")) {
      // Déterminer l'extension appropriée en fonction du type MIME
      let fileExtension = '.webm';  // Par défaut
      if (audioFile.type.includes('ogg')) {
        fileExtension = '.ogg';
      } else if (audioFile.type.includes('mp4') || audioFile.type.includes('mp3')) {
        fileExtension = '.mp3';
      } else if (audioFile.type.includes('wav')) {
        fileExtension = '.wav';
      } else {
        // Extraire l'extension du nom de fichier original si le type MIME n'est pas reconnu
        const originalExt = audioFile.name.split('.').pop();
        if (originalExt) {
          fileExtension = `.${originalExt}`;
        }
      }
      
      // Créer un nouveau fichier avec le titre spécifié
      processedAudioFile = new File([audioFile], `${title}${fileExtension}`, {
        type: audioFile.type,
        lastModified: new Date().getTime()
      });
      
      logger.debug('Created new file with custom title:', {
        name: processedAudioFile.name,
        type: processedAudioFile.type,
        size: `${Math.round(processedAudioFile.size / 1024)} KB`
      });
    }
    
    // Uploader le fichier et démarrer la transcription
    try {
      // Vérifier une dernière fois que le fichier est valide
      if (!processedAudioFile || processedAudioFile.size === 0) {
        throw new Error("Le fichier audio est invalide ou vide.");
      }
      
      await transcribeAudio(processedAudioFile, title);
      
      clearInterval(interval);
      setUploadProgress(100);
      
      // Réinitialiser les états
      setTitleInput('');
      setErrorState(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
      // Cacher la modal après un court délai
      setTimeout(() => {
        setShowDialog(false);
        setUploadProgress(0);
        
        // Notifier la fin de l'upload
        if (onUploadStateChange) {
          onUploadStateChange(false);
        }
      }, 1000);
      
    } catch (error) {
      clearInterval(interval);
      setUploadProgress(0);
      logger.error('Error uploading file:', error);
      
      // Notifier la fin de l'upload en cas d'erreur
      if (onUploadStateChange) {
        onUploadStateChange(false);
      }
    }
  };

  // Fonction pour l'upload et la transcription d'un fichier audio
  const transcribeAudio = async (file: File, title: string) => {
    setIsUploading(true);
    setUploadProgress(0);
    
    // Notifier le début de l'upload
    if (onUploadStateChange) {
      onUploadStateChange(true);
    }
    
    try {
      logger.debug(`Uploading file "${title}" (${file.type}, ${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
      
      // Uploader la réunion
      const meeting = await uploadMeeting(file, title, {
        onProgress: (progress) => {
          setUploadProgress(progress);
        }
      });
      
      // Vérifier que l'upload a réussi et que nous avons un ID valide
      if (!meeting || !meeting.id) {
        throw new Error("L'upload a réussi mais aucun ID de réunion n'a été retourné par le serveur");
      }
      
      logger.debug(`Meeting uploaded successfully with ID: ${meeting.id}`);
      
      // Afficher un message de succès
      showSuccessPopup(
        "Upload réussi !",
        `Votre enregistrement "${title}" a été uploadé. Vous pouvez le retrouver dans "Mes réunions récentes".`
      );
      
      // Commencer à surveiller le statut de la transcription
      watchTranscriptionStatus(
        meeting.id,
        (status, updatedMeeting) => {
          logger.debug(`Transcription status update: ${status}`);
          
          // Mettre à jour le store avec la nouvelle version
          if (status === 'completed') {
            updateMeetingInStore(updatedMeeting.id, updatedMeeting);

            // Afficher une notification de succès
            showSuccessPopup(
              "Transcription terminée !",
              `La transcription de "${updatedMeeting.title || updatedMeeting.name}" est prête.`
            );

            // Auto-génération de résumé selon préférence globale
            try {
              // 🚫 GÉNÉRATION AUTOMATIQUE DÉSACTIVÉE
              // Les résumés doivent être générés manuellement via le dropdown
              logger.debug('🚫 [PROTECTION] Génération automatique désactivée - l\'utilisateur doit choisir manuellement via le dropdown');
            } catch {}
          } else if (status === 'error') {
            // Notification d'erreur
            showSuccessPopup(
              "Erreur de transcription",
              "Une erreur est survenue pendant la transcription."
            );
          }
        }
      );

      // Mise à jour immédiate du store sans attendre la prochaine requête
      addMeetingToStore(meeting);
      
    } catch (error) {
      logger.error('Error during upload/transcription:', error);
      const errorMessage = toUserFriendlyMessage(error);
      
      showSuccessPopup(
        "Erreur",
        errorMessage
      );
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      
      // Notifier la fin de l'upload
      if (onUploadStateChange) {
        onUploadStateChange(false);
      }
    }
  };

  return (
    <Box sx={{ 
      p: 4,
      minHeight: '100vh',
      opacity: isLoaded ? 1 : 0,
      transform: isLoaded ? 'translateY(0)' : 'translateY(10px)',
      transition: 'all 0.2s ease-out'
    }}>
      {/* Header */}
      <Box sx={{ 
        mb: 4,
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(10px)',
        transition: 'all 0.2s ease-out 0.02s'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', ml: -2 }}>
            {/* Animation de Gilbert - stratégie anti-flash optimale */}
            <Box sx={{ 
              width: 150, 
              height: 150, 
              position: 'relative',
              // Vignettage circulaire pour fondre les bords avec le fond
              maskImage: 'radial-gradient(circle at center, black 45%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0.4) 75%, transparent 95%)',
              WebkitMaskImage: 'radial-gradient(circle at center, black 45%, rgba(0,0,0,0.8) 60%, rgba(0,0,0,0.4) 75%, transparent 95%)'
            }}>
              {/* Image statique - TOUJOURS affichée en fond (zIndex le plus bas) */}
              <Box
                component="img"
                ref={idleImageRef}
                src="/img/LeG.webp"
                alt="Gilbert"
                onLoad={() => {
                  setImagePreloaded(true);
                  logger.debug('✅ Image Gilbert chargée');
                }}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  display: 'block',
                  zIndex: 0
                }}
              />
              
              {/* Salut initial - PAR-DESSUS l'image, disparaît à la fin */}
              {gilbertState === 'salut' && (
                <Box
                  component="video"
                  ref={salutVideoRef}
                  autoPlay
                  muted
                  playsInline
                  preload="auto"
                  onEnded={handleSalutEnded}
                  src="/img/SalutduG.webm"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    zIndex: 1
                  }}
                />
              )}
              
              {/* Animation d'écriture - PAR-DESSUS tout pendant l'enregistrement */}
              {gilbertState === 'recording' && (
                <Box
                  component="video"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  src="/img/LeGecrit.webm"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                    zIndex: 2
                  }}
                />
              )}
            </Box>
            <Typography 
              variant="h4" 
              sx={{
                fontWeight: 700,
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-0.5px',
                ml: 0.5
              }}
            >
              👋 Content de te revoir
            </Typography>

            {/* Indicateur de connexion (PHASE 1) - UNIQUEMENT si hors ligne */}
            {isRecording && connectionStatus === 'offline' && (
              <Chip
                icon={<WifiOffIcon />}
                label="Mode hors ligne - Sauvegarde locale"
                size="small"
                color="warning"
                sx={{
                  ml: 2,
                  fontWeight: 600,
                  animation: 'pulse 2s infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 },
                  },
                }}
              />
            )}
          </Box>
        </Box>
        <Typography variant="body1" color="text.secondary">
           Gilbert travaille pour toi : retrouve tes réunions résumées et prêtes à l'emploi.
        </Typography>
      </Box>

      <Box sx={{ 
        mb: 6,
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(15px)',
        transition: 'all 0.2s ease-out 0.04s'
      }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'primary.main',
                color: 'white',
                borderRadius: '16px',
                boxShadow: '0 10px 20px rgba(59, 130, 246, 0.15)',
                transition: 'none',
                pointerEvents: 'auto'
              }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Lancer l'enregistrement
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, opacity: 0.8 }}>
                  Commence à enregistrer instantanément.
                </Typography>
                {isRecording || isPaused ? (
                  <Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      {isPaused ? 'En pause' : 'Enregistrement'}: {formatTime(audioDuration)}
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      {/* Bouton Pause/Reprendre - toujours à la même position */}
                      {isPaused ? (
                    <Button
                      variant="contained"
                          startIcon={<PlayArrowIcon sx={{ color: 'white' }} />}
                          onClick={resumeRecording}
                      sx={{
                            bgcolor: '#4CAF50',
                            color: 'white',
                            minWidth: '120px',
                            fontWeight: 'bold',
                            fontSize: '0.95rem',
                            py: 1.2,
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)',
                        '&:hover': {
                              bgcolor: '#45a049',
                              boxShadow: '0 4px 12px rgba(76, 175, 80, 0.4)',
                        },
                      }}
                    >
                          Reprendre
                        </Button>
                      ) : (
                        <Button
                          variant="contained"
                          startIcon={<PauseIcon sx={{ color: 'white' }} />}
                          onClick={pauseRecording}
                          sx={{
                            bgcolor: '#2196F3',
                            color: 'white',
                            minWidth: '120px',
                            fontWeight: 'bold',
                            fontSize: '0.95rem',
                            py: 1.2,
                            borderRadius: '8px',
                            boxShadow: '0 2px 8px rgba(33, 150, 243, 0.3)',
                            '&:hover': {
                              bgcolor: '#1976D2',
                              boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                            },
                          }}
                        >
                          Pause
                        </Button>
                      )}
                      {/* Bouton Fin - toujours à la même position */}
                      <Button
                        variant="outlined"
                        startIcon={<StopIcon sx={{ color: '#D32F2F' }} />}
                        onClick={finishRecording}
                        sx={{
                          bgcolor: 'transparent',
                          color: '#D32F2F',
                          border: '2px solid #D32F2F',
                          minWidth: '120px',
                          fontWeight: 'bold',
                          fontSize: '0.95rem',
                          py: 1.2,
                          borderRadius: '8px',
                          boxShadow: '0 2px 8px rgba(211, 47, 47, 0.2)',
                          '&:hover': {
                            bgcolor: '#D32F2F',
                            color: 'white',
                            border: '2px solid #D32F2F',
                            boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
                            '& .MuiSvgIcon-root': {
                              color: 'white',
                            },
                          },
                        }}
                      >
                        Fin
                    </Button>
                    </Box>
                  </Box>
                ) : (
                  <Button
                    variant="contained"
                    startIcon={<MicIcon sx={{ color: 'white' }} />}
                    onClick={() => setShowRecordingWarning(true)}
                    sx={{
                      bgcolor: '#FF5722', // Orange vif
                      color: 'white',
                      fontWeight: 'bold',
                      boxShadow: '0 4px 10px rgba(0, 0, 0, 0.15)',
                      border: '2px solid white',
                      '&:hover': {
                        bgcolor: '#E64A19', // Orange plus foncé
                        boxShadow: '0 6px 12px rgba(0, 0, 0, 0.2)',
                      },
                    }}
                  >
                    Démarrer
                  </Button>
                )}
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
                borderRadius: '16px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                transition: 'none',
                pointerEvents: 'auto'
              }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Importer un enregistrement
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  Glisse ton audio, on s'en charge.
                </Typography>
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <Button
                  variant="outlined"
                  startIcon={isUploading ? <CircularProgress size={20} /> : <CloudUploadIcon />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? 'Importation en cours...' : 'Téléverser un fichier'}
                </Button>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <LinearProgress 
                    variant="determinate" 
                    value={uploadProgress} 
                    sx={{ mt: 1, borderRadius: 1 }}
                  />
                )}
                {errorState && (
                  <Typography color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>
                    {errorState.message}
                  </Typography>
                )}
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                p: 3,
                display: 'flex',
                alignItems: 'center',
                bgcolor: 'background.paper',
              }}
            >
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                Partager les réunions
                </Typography>
                <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                  Collaborez avec votre équipe
                </Typography>
                <Button 
                  variant="outlined" 
                  startIcon={<ShareIcon />}
                  onClick={handleOpenPremiumDialog}
                >
                  Obtenir
                </Button>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      {/* Carte d'engagement utilisateur */}
      <Box sx={{ 
        mb: 6,
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.2s ease-out 0.06s'
      }}>
        <Paper
          sx={{
            p: 4,
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.02) 0%, rgba(99, 102, 241, 0.02) 50%, rgba(168, 85, 247, 0.02) 100%)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.3s ease-in-out',
            overflow: 'hidden',
            position: 'relative',
            pointerEvents: 'auto'
          }}
        >
          <Grid container spacing={3} alignItems="center">
            {/* Section principale avec statistiques */}
            <Grid item xs={12} lg={8}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: { xs: 'center', sm: 'flex-start' }, 
                flexDirection: { xs: 'column', sm: 'row' },
                mb: { xs: 2, md: 3 },
                textAlign: { xs: 'center', sm: 'left' }
              }}>
                {/* Avatar Gilbert avec animation */}
                <Box
                  sx={{
                    width: { xs: 50, sm: 60 },
                    height: { xs: 50, sm: 60 },
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: { xs: 0, sm: 3 },
                    mb: { xs: 2, sm: 0 },
                    flexShrink: 0,
                    boxShadow: '0 8px 20px rgba(59, 130, 246, 0.15)',
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '70%',
                      height: '70%',
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.2)',
                      backdropFilter: 'blur(10px)',
                    }
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Icône de trophée stylisée */}
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2C13.1 2 14 2.9 14 4V6H18C19.1 6 20 6.9 20 8V10C20 11.1 19.1 12 18 12H16.5C16.1 13.7 15.2 15.2 14 16.3V18H16C16.6 18 17 18.4 17 19S16.6 20 16 20H8C7.4 20 7 19.6 7 19S7.4 18 8 18H10V16.3C8.8 15.2 7.9 13.7 7.5 12H6C4.9 12 4 11.1 4 10V8C4 6.9 4.9 6 6 6H10V4C10 2.9 10.9 2 12 2ZM6 8V10H7.5C7.8 9.3 8.2 8.7 8.7 8H6ZM18 8H15.3C15.8 8.7 16.2 9.3 16.5 10H18V8Z"
                        fill="white"
                      />
                    </svg>
                  </Box>
                </Box>

                <Box sx={{ flex: 1, width: '100%' }}>
                  <Typography 
                    variant="h5"
                    sx={{ 
                      fontWeight: 600,
                      color: 'text.primary',
                      mb: 1,
                      fontSize: { xs: '1.25rem', sm: '1.5rem' }
                    }}
                  >
                    Score Gilbert
                  </Typography>
                  <Typography 
                    variant="body1" 
                    color="text.secondary" 
                    sx={{ 
                      mb: 2, 
                      lineHeight: 1.6,
                      fontSize: { xs: '0.9rem', sm: '1rem' }
                    }}
                  >
                    Félicitations ! Vous faites partie des <Box component="span" sx={{ color: '#3B82F6', fontWeight: 600 }}>{topPercentage}% d'utilisateurs les plus actifs</Box> de Gilbert.
                    Continuez sur cette lancée ! 🚀
                  </Typography>

                  {/* Statistiques détaillées */}
                  <Box sx={{ mb: { xs: 2, md: 3 } }}>
                    <Grid container spacing={{ xs: 1, sm: 2 }}>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography 
                            variant="h4"
                            sx={{ 
                              fontWeight: 700,
                              color: '#3B82F6',
                              mb: 0.5,
                              fontSize: { xs: '1.5rem', sm: '2rem' }
                            }}
                          >
                            {meetingsList.length}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontWeight: 500,
                              fontSize: { xs: '0.7rem', sm: '0.75rem' }
                            }}
                          >
                            Réunions
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography 
                            variant="h4"
                            sx={{ 
                              fontWeight: 700,
                              color: '#6366F1',
                              mb: 0.5,
                              fontSize: { xs: '1.5rem', sm: '2rem' }
                            }}
                          >
                            {Math.floor(
                              meetingsList.reduce((total, meeting) => {
                                const duration = meeting.duration || meeting.audio_duration || 0;
                                return total + (typeof duration === 'number' ? duration : 0);
                              }, 0) / 60
                            )}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontWeight: 500,
                              fontSize: { xs: '0.7rem', sm: '0.75rem' }
                            }}
                          >
                            Minutes
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography 
                            variant="h4"
                            sx={{ 
                              fontWeight: 700,
                              color: '#8B5CF6',
                              mb: 0.5,
                              fontSize: { xs: '1.5rem', sm: '2rem' }
                            }}
                          >
                            {meetingsList.filter(m => 
                              m.status === 'completed' || 
                              (m as any).transcript_status === 'completed' || 
                              (m as any).transcription_status === 'completed'
                            ).length}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontWeight: 500,
                              fontSize: { xs: '0.7rem', sm: '0.75rem' }
                            }}
                          >
                            Transcrites
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                          <Typography 
                            variant="h2"
                            sx={{ 
                              fontWeight: 800,
                              background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
                              backgroundClip: 'text',
                              WebkitBackgroundClip: 'text',
                              color: 'transparent',
                              WebkitTextFillColor: 'transparent',
                              filter: 'drop-shadow(0 2px 4px rgba(59, 130, 246, 0.2))',
                              lineHeight: 0.9,
                              mb: 0.5,
                              fontSize: { xs: '1.8rem', sm: '2.125rem' }
                            }}
                          >
                            {engagementScore}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            color="text.secondary" 
                            sx={{ 
                              fontWeight: 500,
                              fontSize: { xs: '0.7rem', sm: '0.75rem' }
                            }}
                          >
                            Score
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Barre de progression du score */}
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 600, 
                          color: 'text.primary',
                          fontSize: { xs: '0.8rem', sm: '0.875rem' }
                        }}
                      >
                        Niveau d'engagement
                      </Typography>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 600, 
                          color: '#3B82F6',
                          fontSize: { xs: '0.8rem', sm: '0.875rem' }
                        }}
                      >
                        {engagementScore}/100
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={engagementScore} 
                      sx={{ 
                        height: { xs: 6, sm: 8 },
                        borderRadius: 4,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        '& .MuiLinearProgress-bar': {
                          background: 'linear-gradient(90deg, #3B82F6 0%, #6366F1 100%)',
                          borderRadius: 4,
                        }
                      }}
                    />
                    <Typography 
                      variant="caption" 
                      color="text.secondary" 
                      sx={{ 
                        display: 'block', 
                        mt: 1,
                        fontStyle: 'italic',
                        fontSize: { xs: '0.7rem', sm: '0.75rem' }
                      }}
                    >
                      {pointsToNextLevel > 0 ? `Prochain niveau dans ${pointsToNextLevel} points ! 🎯` : 'Félicitations ! Vous avez atteint le niveau maximum ! 🏆'}
                    </Typography>
                  </Box>

                  {/* Badges de récompenses professionnels */}
                  <Stack 
                    direction="row" 
                    spacing={1} 
                    sx={{ 
                      flexWrap: 'wrap', 
                      gap: { xs: 0.5, sm: 1 },
                      justifyContent: { xs: 'center', sm: 'flex-start' }
                    }}
                  >
                    {/* Badge de niveau d'engagement */}
                    <Chip 
                      icon={
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          width: 16,
                          height: 16
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
                              fill="currentColor"
                            />
                          </svg>
                        </Box>
                      }
                      label={engagementLevel.replace(/[🏆🚀🔥🌱👋]/g, '').trim()} 
                      size="small"
                      sx={{ 
                        bgcolor: engagementScore >= 75 ? 'rgba(59, 130, 246, 0.1)' : 
                                engagementScore >= 50 ? 'rgba(16, 185, 129, 0.1)' : 
                                engagementScore >= 25 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                        color: engagementScore >= 75 ? '#2563EB' : 
                               engagementScore >= 50 ? '#059669' : 
                               engagementScore >= 25 ? '#D97706' : '#6B7280',
                        fontWeight: 600,
                        border: '1px solid',
                        borderColor: engagementScore >= 75 ? 'rgba(59, 130, 246, 0.2)' : 
                                    engagementScore >= 50 ? 'rgba(16, 185, 129, 0.2)' : 
                                    engagementScore >= 25 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                        '& .MuiChip-icon': { 
                          color: 'inherit'
                        },
                        fontSize: { xs: '0.7rem', sm: '0.8125rem' },
                        height: { xs: 24, sm: 32 }
                      }}
                    />
                    
                    {/* Badge de classement */}
                    <Chip 
                      icon={
                        <Box sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          width: 16,
                          height: 16
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M16 6L18.29 8.29L13.41 13.17L9.41 9.17L2 16.59L3.41 18L9.41 12L13.41 16L19.71 9.71L22 12V6H16Z"
                              fill="currentColor"
                            />
                          </svg>
                        </Box>
                      }
                      label={`Top ${topPercentage}%`} 
                      size="small"
                      sx={{ 
                        bgcolor: 'rgba(245, 158, 11, 0.1)',
                        color: '#D97706',
                        fontWeight: 600,
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        '& .MuiChip-icon': { 
                          color: 'inherit'
                        },
                        fontSize: { xs: '0.7rem', sm: '0.8125rem' },
                        height: { xs: 24, sm: 32 }
                      }}
                    />
                    
                    {/* Badge Gilbert Expert (si score élevé) */}
                    {engagementScore >= 75 && (
                      <Chip 
                        icon={
                          <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            width: 16,
                            height: 16
                          }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path
                                d="M12 1L3 5V11C3 16.55 6.84 21.74 12 23C17.16 21.74 21 16.55 21 11V5L12 1ZM10.5 17L6 12.5L7.5 11L10.5 14L16.5 8L18 9.5L10.5 17Z"
                                fill="currentColor"
                              />
                            </svg>
                          </Box>
                        }
                        label="Maître Gilbert" 
                        size="small"
                        sx={{ 
                          bgcolor: 'rgba(99, 102, 241, 0.1)',
                          color: '#6366F1',
                          fontWeight: 600,
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          '& .MuiChip-icon': { 
                            color: 'inherit'
                          },
                          fontSize: { xs: '0.7rem', sm: '0.8125rem' },
                          height: { xs: 24, sm: 32 }
                        }}
                      />
                    )}
                    
                    {/* Badge Utilisateur Actif (si beaucoup de réunions récentes) */}
                    {(() => {
                      const recentMeetings = meetingsList.filter(meeting => {
                        const meetingDate = new Date(meeting.date);
                        const thirtyDaysAgo = new Date();
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        return meetingDate >= thirtyDaysAgo;
                      });
                      
                      return recentMeetings.length >= 5 ? (
                        <Chip 
                          icon={
                            <Box sx={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              width: 16,
                              height: 16
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path
                                  d="M13 9V3.5L18.49 9M6 2C4.89 2 4 2.89 4 4V20A2 2 0 0 0 6 22H18A2 2 0 0 0 20 20V8L14 2H6Z"
                                  fill="currentColor"
                                />
                              </svg>
                            </Box>
                          }
                          label="Très actif" 
                          size="small"
                          sx={{ 
                            bgcolor: 'rgba(16, 185, 129, 0.1)',
                            color: '#059669',
                            fontWeight: 600,
                            border: '1px solid rgba(16, 185, 129, 0.2)',
                            '& .MuiChip-icon': { 
                              color: 'inherit'
                            },
                            fontSize: { xs: '0.7rem', sm: '0.8125rem' },
                            height: { xs: 24, sm: 32 }
                          }}
                        />
                      ) : null;
                    })()}
                  </Stack>
                </Box>
              </Box>
            </Grid>

            {/* Graphique circulaire du score */}
            <Grid item xs={12} lg={4}>
              <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center',
                alignItems: 'center',
                position: 'relative',
                mt: { xs: 2, lg: 0 }
              }}>
                <Box
                  sx={{
                    width: { xs: 120, sm: 140 },
                    height: { xs: 120, sm: 140 },
                    borderRadius: '50%',
                    background: `conic-gradient(#3B82F6 0% ${engagementScore}%, rgba(59, 130, 246, 0.08) ${engagementScore}% 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    boxShadow: '0 8px 32px rgba(59, 130, 246, 0.15)',
                    transition: 'all 0.3s ease',
                    pointerEvents: 'auto',
                    '&::before': {
                      content: '""',
                      width: { xs: 90, sm: 105 },
                      height: { xs: 90, sm: 105 },
                      borderRadius: '50%',
                      backgroundColor: 'background.paper',
                      position: 'absolute',
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.05)',
                    },
                    // Effet de brillance
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: { xs: '12px', sm: '15px' },
                      left: { xs: '12px', sm: '15px' },
                      width: { xs: '32px', sm: '40px' },
                      height: { xs: '32px', sm: '40px' },
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.3) 0%, rgba(255, 255, 255, 0.1) 100%)',
                      filter: 'blur(8px)',
                      opacity: 0.8,
                    }
                  }}
                >
                  <Box sx={{ 
                    position: 'relative', 
                    zIndex: 1, 
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Typography 
                      variant="h3"
                      sx={{ 
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)',
                        backgroundClip: 'text',
                        WebkitBackgroundClip: 'text',
                        color: 'transparent',
                        WebkitTextFillColor: 'transparent',
                        lineHeight: 0.9,
                        mb: 0.5,
                        fontSize: { xs: '2rem', sm: '2.5rem' }
                      }}
                    >
                      {engagementScore}
                    </Typography>
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontWeight: 600,
                        fontSize: { xs: '8px', sm: '10px' },
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase'
                      }}
                    >
                      SCORE
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>

      {/* Graphique d'activité élégant */}
      <Box sx={{ 
        mb: 6,
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(25px)',
        transition: 'all 0.2s ease-out 0.08s'
      }}>
        <Paper
          sx={{
            p: { xs: 2, sm: 3, md: 4 },
            borderRadius: '16px',
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 250, 252, 0.9) 100%)',
            border: '1px solid rgba(0, 0, 0, 0.05)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.3s ease-in-out',
                    pointerEvents: 'auto'
          }}
        >
          {/* En-tête du graphique */}
          <Box sx={{ mb: { xs: 3, md: 4 } }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: { xs: 'flex-start', sm: 'center' }, 
              justifyContent: 'space-between', 
              mb: 2,
              flexDirection: { xs: 'column', sm: 'row' },
              gap: { xs: 2, sm: 0 }
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Box
                  sx={{
                    width: { xs: 40, sm: 48 },
                    height: { xs: 40, sm: 48 },
                    borderRadius: { xs: '10px', sm: '12px' },
                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mr: 2,
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                    position: 'relative',
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: '70%',
                      height: '70%',
                      borderRadius: { xs: '7px', sm: '8px' },
                      background: 'rgba(255, 255, 255, 0.15)',
                      backdropFilter: 'blur(8px)',
                    }
                  }}
                >
                  <Box
                    sx={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* Icône de pulse/activité minimaliste */}
                    <svg width={isMobile ? "20" : "24"} height={isMobile ? "20" : "24"} viewBox="0 0 24 24" fill="none">
                      {/* Ligne de base */}
                      <path d="M2 12h4" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
                      <path d="M18 12h4" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
                      
                      {/* Pulse principal */}
                      <path 
                        d="M6 12l2-6 2 12 2-8 2 4 2-2" 
                        stroke="white" 
                        strokeWidth="2.5" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        fill="none"
                        opacity="1"
                      />
                    </svg>
                  </Box>
                </Box>
                <Box>
                  <Typography 
                    variant="h5" 
                    sx={{ 
                      fontWeight: 600, 
                      color: 'text.primary',
                      fontSize: { xs: '1.25rem', sm: '1.5rem' }
                    }}
                  >
                    Votre activité Gilbert
                  </Typography>
                  <Typography 
                    variant="body2" 
                    color="text.secondary"
                    sx={{ 
                      fontSize: { xs: '0.8rem', sm: '0.875rem' }
                    }}
                  >
                    {totalContributions > 0 
                      ? `${totalContributions} réunion${totalContributions > 1 ? 's' : ''} enregistrée${totalContributions > 1 ? 's' : ''} cette année`
                      : "Commencez à enregistrer vos réunions pour voir votre activité"
                    }
                  </Typography>
                </Box>
              </Box>
              
              {/* Statistiques rapides */}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: { xs: 2, sm: 3 },
                flexWrap: 'wrap',
                justifyContent: { xs: 'flex-start', sm: 'flex-end' }
              }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700, 
                      color: '#10B981',
                      fontSize: { xs: '1rem', sm: '1.25rem' }
                    }}
                  >
                    {totalContributions}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ 
                      fontSize: { xs: '0.7rem', sm: '0.75rem' }
                    }}
                  >
                    réunion{totalContributions > 1 ? 's' : ''}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700, 
                      color: '#3B82F6',
                      fontSize: { xs: '1rem', sm: '1.25rem' }
                    }}
                  >
                    {currentStreak}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ 
                      fontSize: { xs: '0.7rem', sm: '0.75rem' }
                    }}
                  >
                    jour{currentStreak > 1 ? 's' : ''} de suite
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography 
                    variant="h6" 
                    sx={{ 
                      fontWeight: 700, 
                      color: '#8B5CF6',
                      fontSize: { xs: '1rem', sm: '1.25rem' }
                    }}
                  >
                    {activeWeeks}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color="text.secondary"
                    sx={{ 
                      fontSize: { xs: '0.7rem', sm: '0.75rem' }
                    }}
                  >
                    semaine{activeWeeks > 1 ? 's' : ''} active{activeWeeks > 1 ? 's' : ''}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Graphique heatmap */}
          <Box sx={{ mb: 3 }}>
            {/* Labels des mois */}
            <Box sx={{ 
              display: { xs: 'none', sm: 'flex' }, 
              mb: 1, 
              pl: { sm: 3, md: 4 } 
            }}>
              {['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'].map((month, index) => (
                <Box
                  key={month}
                  sx={{
                    flex: 1,
                    textAlign: 'center',
                    display: index % 2 === 0 ? 'block' : 'none', // Afficher un mois sur deux pour éviter l'encombrement
                  }}
                >
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 500 }}>
                    {month}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/* Graphique principal */}
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start',
              overflowX: { xs: 'auto', sm: 'visible' },
              pb: { xs: 1, sm: 0 }
            }}>
              {/* Labels des jours */}
              <Box sx={{ 
                display: { xs: 'none', sm: 'flex' }, 
                flexDirection: 'column', 
                mr: 2, 
                pt: 1 
              }}>
                {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((day, index) => (
                  <Box
                    key={day}
                    sx={{
                      height: '11px',
                      mb: '2px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      pr: 1,
                      minWidth: '24px',
                    }}
                  >
                    {index % 2 === 0 && ( // Afficher un jour sur deux
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '9px', fontWeight: 500 }}>
                        {day}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>

              {/* Grille d'activité */}
              <Box sx={{ 
                display: 'flex', 
                gap: { xs: '1px', sm: '2px' }, 
                flexWrap: 'wrap', 
                maxWidth: '100%',
                minWidth: { xs: '280px', sm: 'auto' }
              }}>
                {weeklyData.map((week, weekIndex) => (
                  <Box key={weekIndex} sx={{ display: 'flex', flexDirection: 'column', gap: { xs: '1px', sm: '2px' } }}>
                    {week.map((day, dayIndex) => {
                      const getColor = (level: number) => {
                        switch (level) {
                          case 0: return 'rgba(0, 0, 0, 0.04)'; // Gris très clair
                          case 1: return 'rgba(16, 185, 129, 0.3)'; // Vert clair
                          case 2: return 'rgba(16, 185, 129, 0.5)'; // Vert moyen
                          case 3: return 'rgba(16, 185, 129, 0.7)'; // Vert foncé
                          case 4: return 'rgba(16, 185, 129, 0.9)'; // Vert très foncé
                          default: return 'rgba(0, 0, 0, 0.04)';
                        }
                      };

                      const isToday = day.date === new Date().toISOString().split('T')[0];

                      return (
                        <Tooltip
                          key={dayIndex}
                          title={
                            day.count === 0 
                              ? `Aucune réunion le ${new Date(day.date).toLocaleDateString('fr-FR', { 
                                  day: 'numeric', 
                                  month: 'long', 
                                  year: 'numeric' 
                                })}`
                              : `${day.count} réunion${day.count > 1 ? 's' : ''} enregistrée${day.count > 1 ? 's' : ''} le ${new Date(day.date).toLocaleDateString('fr-FR', { 
                                  day: 'numeric', 
                                  month: 'long', 
                                  year: 'numeric' 
                                })}`
                          }
                          placement="top"
                          arrow
                        >
                          <Box
                            sx={{
                              width: { xs: '9px', sm: '11px' },
                              height: { xs: '9px', sm: '11px' },
                              borderRadius: '2px',
                              backgroundColor: getColor(day.level),
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              border: isToday ? '1px solid #10B981' : 'none',
                              boxShadow: isToday ? '0 0 0 1px rgba(16, 185, 129, 0.3)' : 'none',
                              '&:hover': {
                                transform: 'scale(1.2)',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                zIndex: 1,
                                position: 'relative',
                              },
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

          {/* Légende et informations supplémentaires */}
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            pt: 2, 
            borderTop: '1px solid rgba(0, 0, 0, 0.05)',
            flexDirection: { xs: 'column', sm: 'row' },
            gap: { xs: 2, sm: 0 }
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                  fontWeight: 500,
                  fontSize: { xs: '0.7rem', sm: '0.75rem' }
                }}
              >
                Moins
              </Typography>
              <Box sx={{ display: 'flex', gap: '2px' }}>
                {[0, 1, 2, 3, 4].map((level) => (
                  <Box
                    key={level}
                    sx={{
                      width: { xs: '8px', sm: '10px' },
                      height: { xs: '8px', sm: '10px' },
                      borderRadius: '2px',
                      backgroundColor: level === 0 ? 'rgba(0, 0, 0, 0.04)' : `rgba(16, 185, 129, ${0.2 + level * 0.2})`,
                    }}
                  />
                ))}
              </Box>
              <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                  fontWeight: 500,
                  fontSize: { xs: '0.7rem', sm: '0.75rem' }
                }}
              >
                Plus
              </Typography>
            </Box>
            
            {/* Message motivationnel */}
            <Typography 
              variant="caption" 
              color="text.secondary" 
              sx={{ 
                fontStyle: 'italic',
                textAlign: { xs: 'center', sm: 'right' },
                fontSize: { xs: '0.7rem', sm: '0.75rem' }
              }}
            >
              {totalContributions > 0 
                ? `Excellent travail ! Continuez sur cette lancée 🚀`
                : "Votre première réunion vous attend ! 💪"
              }
            </Typography>
          </Box>
        </Paper>
      </Box>

      {/* Features Grid */}
      <Box sx={{
        opacity: isLoaded ? 1 : 0,
        transform: isLoaded ? 'translateY(0)' : 'translateY(30px)',
        transition: 'all 0.2s ease-out 0.1s'
      }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
      Fonctionnalités disponibles
      </Typography>
      <Grid container spacing={3} sx={{ mb: 6 }}>
        {features.map((feature) => (
          <Grid item xs={12} sm={6} md={4} key={feature.title}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                ...(feature.highlight && {
                  borderColor: 'primary.main',
                  borderWidth: 2,
                  borderStyle: 'solid',
                }),
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <IconButton
                  sx={{
                    mb: 2,
                    color: feature.highlight ? 'primary.main' : 'text.secondary',
                    bgcolor: feature.highlight
                      ? 'primary.light'
                      : 'action.selected',
                    pointerEvents: 'auto'
                  }}
                >
                  {feature.icon}
                </IconButton>
                <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                  {feature.title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {feature.description}
                </Typography>
              </CardContent>
              <CardActions>
                <Button 
                  size="small"
                  onClick={
                    feature.action === "Commencer l'enregistrement"
                      ? handleOpenRecordingWarning
                      : handleOpenSettings
                  }
                >
                  {feature.action}
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
      </Box>

      {/* Dialogue pour nommer l'enregistrement */}
      <Dialog 
        open={showDialog} 
        onClose={() => {}} // Empêcher la fermeture en cliquant à l'extérieur
        disableEscapeKeyDown // Empêcher la fermeture avec Échap
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Sauvegarder l'enregistrement</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Veuillez nommer votre enregistrement pour le sauvegarder.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Nom de l'enregistrement"
            fullWidth
            variant="outlined"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            disabled={isUploading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && titleInput.trim() && !isUploading) {
                e.preventDefault();
                saveRecording();
              }
            }}
          />
          {uploadProgress > 0 && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress 
                variant="determinate" 
                value={uploadProgress} 
                sx={{ borderRadius: 1 }}
              />
              <Typography variant="caption" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                {uploadStage === 'preparing' && 'Préparation du fichier...'}
                {uploadStage === 'uploading' && `Envoi au serveur... ${Math.max(1, Math.min(99, Math.round(uploadProgress)))}%`}
                {uploadStage === 'processing' && 'Traitement en cours côté serveur...'}
                {!uploadStage && uploadProgress >= 100 && 'Terminé !'}
              </Typography>
            </Box>
          )}
          {errorState && (
            <Typography color="error" variant="body2" sx={{ mt: 2 }}>
              {errorState.message}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelClick} disabled={isUploading}>
            Annuler
          </Button>
          <Button 
            onClick={saveRecording} 
            variant="contained" 
            disabled={!titleInput.trim() || isUploading}
          >
            {isUploading ? 'Traitement...' : 'Sauvegarder'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de confirmation d'annulation */}
      <Dialog 
        open={showCancelConfirmation} 
        onClose={handleCancelConfirmationClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Confirmer l'annulation</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Êtes-vous sûr de vouloir quitter ? L'enregistrement sera perdu !
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Si vous quittez maintenant, votre enregistrement audio sera définitivement supprimé et ne pourra pas être récupéré.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelConfirmationClose} color="inherit">
            Continuer l'édition
          </Button>
          <Button onClick={handleConfirmCancel} color="error" variant="contained">
            Quitter et perdre l'enregistrement
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog d'erreur d'upload avec sauvegarde locale */}
      <Dialog 
        open={!!errorState} 
        onClose={() => setErrorState(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ 
          borderBottom: '1px solid #eee', 
          display: 'flex', 
          alignItems: 'center',
          gap: 2,
          pb: 2
        }}>
          <Box sx={{ 
            bgcolor: '#FEF3C7', 
            borderRadius: '50%', 
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <WarningIcon sx={{ color: '#F59E0B', fontSize: 32 }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight={700}>
              Upload impossible
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Enregistrement sauvegardé localement
            </Typography>
          </Box>
          <IconButton onClick={() => setErrorState(null)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ mt: 3, pb: 2 }}>
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              ✅ Votre enregistrement est EN SÉCURITÉ
            </Typography>
            <Typography variant="body2">
              L'audio a été sauvegardé automatiquement sur votre appareil.
            </Typography>
          </Alert>

          <Typography variant="body2" color="text.secondary" paragraph>
            L'upload vers le serveur a échoué, probablement à cause d'un problème de connexion Internet.
          </Typography>

          <Box sx={{ 
            bgcolor: '#F3F4F6', 
            borderRadius: 2, 
            p: 2,
            border: '1px solid #E5E7EB'
          }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              💡 Que faire maintenant ?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              1. Vérifiez votre connexion Internet<br/>
              2. Cliquez sur "Accéder à la récupération" ci-dessous<br/>
              3. Uploadez votre enregistrement quand la connexion sera rétablie
            </Typography>
          </Box>

          {errorState?.message && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, fontStyle: 'italic' }}>
              {errorState.message}
            </Typography>
          )}
        </DialogContent>
        
        <DialogActions sx={{ borderTop: '1px solid #eee', p: 3, gap: 1 }}>
          <Button 
            onClick={() => setErrorState(null)}
            sx={{ textTransform: 'none', color: 'text.secondary' }}
          >
            Fermer
          </Button>
          <Button 
            onClick={() => {
              setErrorState(null);
              setShowRecoveryDialog(true);
            }}
            variant="contained"
            sx={{ 
              textTransform: 'none',
              bgcolor: '#3B82F6',
              '&:hover': { bgcolor: '#2563EB' },
              borderRadius: 2,
              px: 3
            }}
          >
            Accéder à la récupération
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialogue des paramètres */}
      <SettingsDialog 
        open={showSettingsDialog}
        onClose={handleCloseSettings}
      />

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

      {/* Dialog d'avertissement avant l'enregistrement */}
      <Dialog 
        open={showRecordingWarning} 
        onClose={handleCloseRecordingWarning}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          }
        }}
        TransitionProps={{
          timeout: 300
        }}
      >
        <DialogTitle sx={{ 
          textAlign: 'center',
          pb: 2,
          pt: 4,
          px: 4,
          position: 'relative'
        }}>
          <IconButton 
            onClick={handleCloseRecordingWarning} 
            size="small"
            sx={{ 
              position: 'absolute',
              top: 16,
              right: 16,
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)'
              }
            }}
          >
            <CloseIcon />
          </IconButton>

          {/* Icône centrale élégante */}
          <Box
            sx={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              position: 'relative',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -4,
                left: -4,
                right: -4,
                bottom: -4,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                opacity: 0.2,
                animation: 'pulse 2s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%, 100%': { 
                    transform: 'scale(1)',
                    opacity: 0.2
                  },
                  '50%': { 
                    transform: 'scale(1.1)',
                    opacity: 0.1
                  }
                }
              }
            }}
          >
            <MicIcon sx={{ color: 'white', fontSize: 32 }} />
          </Box>

          <Typography 
            variant="h5" 
            sx={{ 
              fontWeight: 600,
              color: 'text.primary',
              mb: 1,
              letterSpacing: '-0.02em'
            }}
          >
            Consentement requis
          </Typography>
          
          <Typography 
            variant="body1" 
            sx={{ 
              color: 'text.secondary',
              lineHeight: 1.5,
              maxWidth: '340px',
              margin: '0 auto'
            }}
          >
            Avant de lancer l’enregistrement, assurez-vous d’avoir informé tous les participants et obtenu leur accord explicite, conformément aux obligations légales.
          </Typography>
        </DialogTitle>
        
        <DialogContent sx={{ px: 4, py: 2 }}>
          {/* Points clés avec design épuré */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  mt: 1,
                  mr: 2,
                  flexShrink: 0
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Informez chaque participant que la réunion est enregistrée
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 2 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  mt: 1,
                  mr: 2,
                  flexShrink: 0
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Collectez leur accord (oral ou écrit) et conservez-en la preuve
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  mt: 1,
                  mr: 2,
                  flexShrink: 0
                }}
              />
              <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.6 }}>
                Respectez les règles internes, le RGPD et les lois locales applicables
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        
        <DialogActions sx={{ px: 4, py: 3, gap: 2, justifyContent: 'center' }}>
          <Button 
            onClick={handleCloseRecordingWarning}
            sx={{
              color: 'text.secondary',
              fontWeight: 500,
              px: 3,
              py: 1,
              borderRadius: 2,
              textTransform: 'none',
              '&:hover': {
                backgroundColor: 'rgba(0, 0, 0, 0.04)'
              }
            }}
          >
            Annuler
          </Button>
          <Button 
            onClick={handleConfirmRecording} 
            variant="contained"
            sx={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              fontWeight: 600,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
              '&:hover': {
                background: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
                boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
                transform: 'translateY(-1px)',
              },
              transition: 'all 0.2s ease'
            }}
          >
            Commencer l'enregistrement
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default Dashboard;
