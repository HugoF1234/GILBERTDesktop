/**
 * RootLayout - Layout principal de l'application
 * Contient la Sidebar, le GenerationBanner et le Outlet pour les routes enfants
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Box, Typography, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import theme from '../styles/theme';
import Sidebar from '../components/Sidebar';
// NotificationProvider est déjà dans main.tsx, pas besoin de le remettre ici
import { isAuthenticated, getUserProfile, getCachedUser, logoutUser, exchangeOAuthCode, verifyTokenValidity } from '../services/authService';
import type { User } from '../services/authService';
import { NetworkError, isOffline } from '../services/apiClient';
import { getViewFromPath, VIEW_TO_PATH } from '../types/router';
import type { ViewType } from '../types/router';
import type { RouteContextType } from '../hooks/useRouteContext';
import { recordingManager } from '../services/recordingManager';
import { isTauriApp } from '../services/tauriRecordingService';

// Import des bannières
import GenerationBanner from '../components/GenerationBanner';
import RecordingBanner from '../components/RecordingBanner';

// Import Onboarding Tour & Questionnaire
import OnboardingTour, { useOnboarding } from '../components/OnboardingTour';
import OnboardingQuestionnaire, { useOnboardingQuestionnaire } from '../components/OnboardingQuestionnaire';
import { saveOnboardingQuestionnaire } from '../services/profileService';
import { logger } from '@/utils/logger';
import OnboardingModal from '../components/OnboardingModal';

/** Composant de chargement */
function LoadingScreen(): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Typography variant="h6">Chargement...</Typography>
    </Box>
  );
}

function RootLayout(): React.ReactElement {
  const location = useLocation();
  const navigate = useNavigate();

  // ── Dans Tauri : forcer la navigation vers / au démarrage ────────────────
  // WebKit mémorise la dernière URL visitée et la restaure au prochain lancement.
  // On veut toujours partir de / pour avoir l'interface correcte (ImmersiveRecordingPage).
  useEffect(() => {
    if (isTauriApp() && location.pathname !== '/' && location.pathname !== '/auth') {
      logger.debug(`[RootLayout] Tauri startup: redirection ${location.pathname} → /`);
      navigate('/', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Exécuté une seule fois au montage

  // État utilisateur et authentification
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingOAuth, setIsProcessingOAuth] = useState<boolean>(false);
  // Counter de session : s'incrémente à chaque connexion pour forcer un remontage de l'Outlet
  // même si le même compte se reconnecte (currentUser.id identique entre deux sessions)
  const [sessionCounter, setSessionCounter] = useState<number>(0);

  // Helper : setter l'utilisateur ET incrémenter le counter de session simultanément
  const loginUser = useCallback((user: User) => {
    setSessionCounter(c => c + 1);
    setCurrentUser(user);
  }, []);

  // États d'enregistrement et upload
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showUploadWarning, setShowUploadWarning] = useState<boolean>(false);

  // État de la sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Onboarding Questionnaire & Tour : par utilisateur (backend pour questionnaire, localStorage par user pour le tour)
  const userId = currentUser?.id;
  const { showQuestionnaire, isCompleted: questionnaireCompleted, completeQuestionnaire } = useOnboardingQuestionnaire(!!currentUser, userId);
  const { showOnboarding, completeOnboarding } = useOnboarding(userId);

  // Onboarding desktop (autorisations micro/système/notifs) — uniquement dans Tauri, une fois par compte
  const [showDesktopOnboarding, setShowDesktopOnboarding] = useState(false);
  useEffect(() => {
    if (!currentUser || !isTauriApp()) return;
    const key = `onboarding_done_${currentUser.id}`;
    if (!localStorage.getItem(key)) {
      // Attendre que le questionnaire/tour soient terminés avant d'afficher
      if (questionnaireCompleted) setShowDesktopOnboarding(true);
    }
  }, [currentUser, questionnaireCompleted]);

  // Détection responsive - utilise les breakpoints du thème
  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // < 600px
  const isTablet = useMediaQuery(theme.breakpoints.between('sm', 'md')); // 600px - 900px
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('md')); // < 900px (mobile + tablet)

  // Vue actuelle basée sur l'URL
  const currentView = useMemo<ViewType>(() => {
    return getViewFromPath(location.pathname);
  }, [location.pathname]);

  // Vérification de l'authentification au montage et lors des changements d'URL
  useEffect(() => {
    // Si on arrive sur /auth sans token, effacer l'utilisateur courant
    // (permet un remontage propre de l'Outlet à la reconnexion avec un autre compte)
    if (location.pathname === '/auth' && !window.location.search.includes('token=') && !window.location.search.includes('code=')) {
      if (currentUser !== null) setCurrentUser(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    const checkAuth = async (): Promise<void> => {
      // ========== PRIORITÉ 1: Vérifier s'il y a un OAuth code ou token dans l'URL ==========
      // IMPORTANT: Cette vérification doit être faite AVANT le check /auth
      // Le backend peut rediriger avec:
      // - ?code=...&success=true (flux sécurisé pour web - échange de code)
      // - ?token=...&success=true (flux direct pour mobile apps)
      const urlParams = new URLSearchParams(window.location.search);
      const oauthCode = urlParams.get('code');
      const oauthToken = urlParams.get('token');
      const oauthSuccess = urlParams.get('success');

      // Flux 1: Code exchange (web sécurisé) - ?code=...&success=true
      if (oauthCode && oauthSuccess === 'true') {
        setIsProcessingOAuth(true);
        logger.debug('[RootLayout] Code OAuth reçu, échange contre JWT...');

        try {
          // Échanger le code temporaire contre le vrai JWT
          await exchangeOAuthCode(oauthCode);
          logger.debug('[RootLayout] Code échangé avec succès, token reçu');

          // Le token est déjà stocké par exchangeOAuthCode, récupérer le profil
          const user = await getUserProfile();
          logger.debug('[RootLayout] Profil utilisateur récupéré:', user.email);

          setIsProcessingOAuth(false);
          setIsLoading(false);

          if ((window as any).__TAURI__) {
            // Nettoyer l'URL OAuth de la barre d'adresse AVANT le rechargement
            // (pour éviter que checkAuth re-traite le même code OAuth au prochain démarrage)
            window.history.replaceState({}, document.title, '/');
            // Effacer le flag de session pour que main.tsx traite le rechargement
            // comme un cold start propre (garantit un état React totalement frais)
            sessionStorage.removeItem('gilbert_app_session');
            window.location.replace('/');
            return;
          }

          loginUser(user);
          logger.debug('[RootLayout] OAuth réussi, redirection vers /');
          navigate('/', { replace: true });
          return;
        } catch (error) {
          logger.error('[RootLayout] Échec de l\'échange de code OAuth:', error);

          if (error instanceof NetworkError || isOffline()) {
            logger.debug('[RootLayout] Erreur réseau lors de OAuth - garder pour retry');
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsProcessingOAuth(false);
            setIsLoading(false);
            return;
          }

          // Nettoyer et rediriger vers /auth avec erreur
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsProcessingOAuth(false);
          setIsLoading(false);
          navigate('/auth', {
            replace: true,
            state: { error: 'Erreur lors de la connexion Google. Veuillez réessayer.' }
          });
          return;
        }
      }

      // Flux 2: Token direct (mobile apps) - ?token=...&success=true
      if (oauthToken && oauthSuccess === 'true') {
        setIsProcessingOAuth(true);
        logger.debug('[RootLayout] Token OAuth direct reçu, stockage...', oauthToken.substring(0, 20) + '...');

        localStorage.setItem('auth_token', oauthToken);
        await new Promise(resolve => setTimeout(resolve, 150));

        try {
          logger.debug('[RootLayout] Récupération du profil utilisateur...');
          const user = await getUserProfile();
          logger.debug('[RootLayout] Profil utilisateur récupéré:', user.email);

          setIsProcessingOAuth(false);
          setIsLoading(false);

          // Dans Tauri : rechargement complet pour garantir une initialisation propre
          if ((window as any).__TAURI__) {
            window.history.replaceState({}, document.title, '/');
            sessionStorage.removeItem('gilbert_app_session');
            window.location.replace('/');
            return;
          }

          loginUser(user);
          // Rediriger vers l'application
          if (window.location.pathname === '/auth') {
            logger.debug('[RootLayout] OAuth réussi sur /auth, redirection vers /');
            navigate('/', { replace: true });
          } else {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        } catch (error) {
          logger.error('[RootLayout] Failed to get user profile after OAuth:', error);

          if (error instanceof NetworkError || isOffline()) {
            logger.debug('[RootLayout] Erreur réseau lors de OAuth - garder le token');
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsProcessingOAuth(false);
            setIsLoading(false);
            return;
          }

          localStorage.removeItem('auth_token');
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsProcessingOAuth(false);
          setIsLoading(false);
          navigate('/auth', { replace: true });
          return;
        }
      }

      // ========== PRIORITÉ 2: SKIP SI DÉJÀ SUR /auth (et pas de token OAuth) ==========
      // Éviter les vérifications inutiles quand on est déjà sur la page de connexion
      if (location.pathname === '/auth') {
        setIsLoading(false);
        return;
      }

      // ========== PRIORITÉ 3: Vérifier s'il y a une erreur OAuth dans l'URL ==========
      // Note: Ce check doit rester APRÈS le check /auth pour ne pas interférer avec AuthForm
      const oauthError = urlParams.get('error');

      if (oauthError && (oauthError === 'email_already_exists' || oauthError === 'email_exists_other_provider' || oauthError === 'creation_failed' || oauthError === 'invalid_state' || oauthError === 'missing_params' || oauthError === 'token_exchange_failed' || oauthError === 'user_info_failed' || oauthError === 'user_not_found' || oauthError === 'user_invalid' || oauthError === 'token_creation_failed' || oauthError === 'server_error')) {
        logger.debug('[RootLayout] Erreur OAuth détectée:', oauthError);
        // Nettoyer l'URL et rediriger vers /auth avec l'erreur
        let errorMessage = 'Erreur lors de l\'authentification avec Google';
        if (oauthError === 'email_already_exists') {
          errorMessage = 'Cet email est déjà utilisé avec un compte classique. Veuillez vous connecter avec votre email et mot de passe.';
        } else if (oauthError === 'email_exists_other_provider') {
          errorMessage = 'Cet email est déjà associé à un autre compte. Veuillez utiliser la méthode de connexion originale.';
        } else if (oauthError === 'creation_failed') {
          errorMessage = 'Impossible de créer votre compte. Veuillez réessayer.';
        } else if (oauthError === 'invalid_state') {
          errorMessage = 'Session de sécurité invalide. Veuillez réessayer.';
        } else if (oauthError === 'missing_params') {
          errorMessage = 'Paramètres manquants. Veuillez réessayer.';
        } else if (oauthError === 'token_exchange_failed') {
          errorMessage = 'Échec de l\'échange de token. Veuillez réessayer.';
        } else if (oauthError === 'user_info_failed') {
          errorMessage = 'Impossible de récupérer vos informations. Veuillez réessayer.';
        } else if (oauthError === 'user_not_found' || oauthError === 'user_invalid') {
          errorMessage = 'Erreur lors de la récupération de votre compte. Veuillez réessayer.';
        } else if (oauthError === 'token_creation_failed') {
          errorMessage = 'Erreur lors de la création de la session. Veuillez réessayer.';
        } else if (oauthError === 'server_error') {
          errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
        }
        
        // Nettoyer l'URL immédiatement pour éviter que le useEffect se déclenche à nouveau
        window.history.replaceState({}, document.title, window.location.pathname);
        setIsLoading(false);
        navigate('/auth', { 
          replace: true,
          state: { error: errorMessage }
        });
        return;
      }
      
      // ========== PRIORITE 4: Verification normale de l'authentification ==========
      // Use the centralized verifyTokenValidity() which handles:
      // - checking if token exists in localStorage
      // - verifying with backend (/auth/me)
      // - network error handling (assumes valid if offline)
      // - logout + redirect to /auth if invalid
      // - debounce & 30s caching
      const isValid = await verifyTokenValidity();
      if (!isValid) {
        setIsLoading(false);
        navigate('/auth', { replace: true });
        return;
      }

      // Token is valid - fetch user profile for the UI
      try {
        const user = await getUserProfile();
        loginUser(user);
      } catch (error) {
        // If getUserProfile fails after token was validated, it's likely a network error (offline).
        // Use cached user for display so name/avatar remain visible.
        if (error instanceof NetworkError || isOffline()) {
          const cached = getCachedUser();
          if (cached) {
            logger.debug('[RootLayout] Offline — utilisation du profil en cache');
            loginUser(cached);
          }
        }
        // Unexpected error fetching profile - don't break the app
        if (!(error instanceof NetworkError) && !isOffline()) {
          logger.debug('[RootLayout] Erreur inattendue lors de la recuperation du profil');
        }
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [navigate, location]);

  // Écouter les changements d'URL pour détecter les tokens OAuth même après le montage initial
  useEffect(() => {
    const handleLocationChange = async (): Promise<void> => {
      // Skip si pas sur une route où on attend un token OAuth
      if (window.location.pathname === '/auth' && !window.location.search.includes('token=')) {
        return;
      }

      // Vérifier s'il y a un token dans l'URL
      const urlParams = new URLSearchParams(window.location.search);
      const oauthToken = urlParams.get('token');
      const oauthSuccess = urlParams.get('success');

      if (oauthToken && oauthSuccess === 'true' && !currentUser && !isProcessingOAuth) {
        // Il y a un token dans l'URL et l'utilisateur n'est pas encore connecté
        logger.debug('[RootLayout] Token OAuth détecté après changement d\'URL');
        
        // Stocker le token IMMÉDIATEMENT
        localStorage.setItem('auth_token', oauthToken);
        
        // Vérifier que le token est valide en récupérant le profil AVANT de nettoyer l'URL
        try {
          const user = await getUserProfile();
          logger.debug('[RootLayout] Profil utilisateur récupéré après détection:', user.email);

          if ((window as any).__TAURI__) {
            // Rechargement complet dans Tauri pour une initialisation propre
            window.history.replaceState({}, document.title, '/');
            sessionStorage.removeItem('gilbert_app_session');
            window.location.replace('/');
            return;
          }

          loginUser(user);
          // Nettoyer l'URL APRÈS avoir récupéré le profil avec succès
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoading(false);
        } catch (error) {
          logger.error('[RootLayout] Failed to get user profile after OAuth detection:', error);

          // Ne pas rediriger si c'est une erreur réseau
          if (error instanceof NetworkError || isOffline()) {
            logger.debug('[RootLayout] Erreur réseau lors de OAuth - garder le token pour retry');
            window.history.replaceState({}, document.title, window.location.pathname);
            setIsLoading(false);
            return;
          }

          localStorage.removeItem('auth_token');
          // Nettoyer l'URL même en cas d'erreur
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsLoading(false);
          navigate('/auth', { replace: true });
        }
      }
    };

    // Vérifier immédiatement
    handleLocationChange();

    // Écouter les changements de l'historique (popstate)
    window.addEventListener('popstate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [currentUser, navigate]);

  // Synchroniser isRecording avec recordingManager (web)
  useEffect(() => {
    // Synchronisation initiale
    const checkRecording = (): void => {
      const isActive = recordingManager.isActive();
      setIsRecording(isActive);
    };

    checkRecording();

    // Synchronisation périodique toutes les secondes
    const syncInterval = setInterval(checkRecording, 1000);
    return () => clearInterval(syncInterval);
  }, []);

  // Écouter start-recording-from-notif globalement (clic sur notification macOS)
  // Ce listener est au niveau RootLayout pour fonctionner même si ImmersiveRecordingPage n'est pas monté
  useEffect(() => {
    if (!isTauriApp()) return;
    const tauri = (window as any).__TAURI__;
    if (!tauri?.event?.listen) return;

    const p = tauri.event.listen('start-recording-from-notif', async () => {
      // Stocker le flag pour qu'ImmersiveRecordingPage démarre l'enregistrement au montage
      sessionStorage.setItem('auto_start_recording', '1');
      // Naviguer vers la page d'enregistrement (/) si pas déjà dessus
      if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/auth')) {
        navigate('/', { replace: false });
      }
      // Amener la fenêtre au premier plan si en mode compact
      try {
        const core = tauri?.tauri?.invoke || tauri?.core?.invoke;
        if (core) {
          await core('exit_compact_mode').catch(() => {});
          const win = await tauri?.window?.appWindow || tauri?.window?.WebviewWindow?.getByLabel?.('main');
          if (win) {
            await win.show?.();
            await win.setFocus?.();
          }
        }
      } catch {}
    });

    // start-recording-compact : naviguer vers la page d'enregistrement (/) ET passer en compact
    const p2 = tauri.event.listen('start-recording-compact', async () => {
      sessionStorage.setItem('auto_start_recording_compact', '1');
      if (window.location.pathname !== '/' && !window.location.pathname.startsWith('/auth')) {
        navigate('/', { replace: false });
      }
      try {
        const core = tauri?.tauri?.invoke || tauri?.core?.invoke;
        if (core) {
          const win = await tauri?.window?.appWindow || tauri?.window?.WebviewWindow?.getByLabel?.('main');
          if (win) await win.show?.();
        }
      } catch {}
    });

    return () => {
      p.then((u: () => void) => u()).catch(() => {});
      p2.then((u: () => void) => u()).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // Note : le listener "oauth-callback" est géré dans main.tsx (avant React)
  // pour garantir qu'il est actif dès le démarrage, sans dépendance au cycle de vie React.

  // Protection contre la fermeture pendant l'enregistrement OU l'upload
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): string | undefined => {
      // ✅ CORRECTION : Ne pas bloquer si on est offline et qu'on ne peut pas uploader
      if (isUploading && !navigator.onLine) {
        logger.debug('⚠️ Upload impossible (offline) - Autorisation de quitter');
        return undefined; // Permettre de quitter si offline
      }
      
      if (isRecording) {
        const message = 'Enregistrement en cours. L\'audio est sauvegardé localement, mais arrêter maintenant interrompra l\'enregistrement.';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
      
      if (isUploading && navigator.onLine) {
        const message = 'Upload en cours. Fermer cette page interrompra l\'upload.';
        event.preventDefault();
        event.returnValue = message;
        return message;
      }
      
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording, isUploading]);

  // Handler de navigation depuis la Sidebar
  const handleViewChange = useCallback((view: ViewType | string): void => {
    // Empêcher la navigation pendant l'upload (mais pas pendant l'enregistrement - il continue en arrière-plan)
    if (isUploading) {
      setShowUploadWarning(true);
      return;
    }

    // La navigation est autorisée pendant l'enregistrement
    // L'enregistrement continue en arrière-plan grâce au recordingManager singleton
    const path = VIEW_TO_PATH[view as ViewType] ?? '/';
    navigate(path);
  }, [navigate, isUploading]);

  // Toggle de la sidebar
  const handleToggleSidebar = useCallback((): void => {
    setSidebarOpen(prev => !prev);
  }, []);

  // Fermer le warning d'upload
  const handleCloseUploadWarning = useCallback((): void => {
    setShowUploadWarning(false);
  }, []);

  // ── Écoute des events Tauri globaux (tray menu, widget) ──
  useEffect(() => {
    if (!isTauriApp()) return;
    const tauri = (window as any).__TAURI__;
    if (!tauri?.event?.listen) return;

    // Event depuis le tray "Démarrer enregistrement" → naviguer vers / et démarrer
    const unlistenPromise = tauri.event.listen('tray-start-recording', () => {
      navigate('/', { replace: false });
      // Petit délai pour laisser la page se monter avant d'émettre l'event de démarrage
      setTimeout(() => {
        tauri.event.emit?.('widget-auto-start-recording', {});
      }, 300);
    });

    return () => {
      unlistenPromise.then((unlisten: () => void) => unlisten()).catch(() => {});
    };
  }, [navigate]);

  // Context passé aux routes enfants via Outlet
  const outletContext: RouteContextType = useMemo(() => ({
    currentUser,
    isRecording,
    setIsRecording,
    isUploading,
    setIsUploading,
    isMobile,
    isTablet,
    isSmallScreen,
    onToggleSidebar: handleToggleSidebar,
  }), [currentUser, isRecording, isUploading, isMobile, isTablet, isSmallScreen, handleToggleSidebar]);

  // Afficher l'écran de chargement
  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Box
        sx={{
          display: 'flex',
          height: '100vh',
          width: '100%',
          flexDirection: { xs: 'column', md: 'row' },
          overflow: 'hidden',
          '& > *': { borderColor: '#e0e0e0 !important' },
          '&::before, &::after': { display: 'none !important' },
          '& > div': {
            borderLeft: 'none !important',
            borderRight: { xs: 'none !important', md: '1px solid #e0e0e0 !important' },
            boxShadow: 'none !important',
          },
          // Styles responsive pour les petits écrans
          [theme.breakpoints.down('md')]: {
            '& > div:not(:first-of-type)': {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              overflow: 'auto',
              backgroundColor: 'white',
            },
          },
        }}
      >
        <Sidebar
          onViewChange={handleViewChange}
          currentView={currentView}
          user={currentUser}
          isMobile={isMobile}
          isTablet={isTablet}
          open={sidebarOpen}
          onToggle={handleToggleSidebar}
          isRecording={isRecording}
          isSmallScreen={isSmallScreen}
        />

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            overflow: 'hidden',
            minHeight: 0, // Permet au flex child de scroller correctement
          }}
        >
          {/* Bannières */}
          <GenerationBanner />
          <RecordingBanner />
          <Box sx={{ flexGrow: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* La key combine user id ET session counter pour forcer un remontage
                complet à chaque connexion, même si le même compte se reconnecte */}
            <Outlet key={`${currentUser?.id ?? 'guest'}-${sessionCounter}`} context={outletContext} />
          </Box>
        </Box>

        {/* Dialog d'avertissement upload */}
        <Dialog
          open={showUploadWarning}
          onClose={handleCloseUploadWarning}
          aria-labelledby="upload-warning-title"
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle
            id="upload-warning-title"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              color: '#F97316',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                bgcolor: 'rgba(249, 115, 22, 0.1)',
              }}
            >
              ⚠️
            </Box>
            Upload en cours
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Votre fichier audio est en cours d'upload. Veuillez patienter jusqu'à ce que l'upload soit terminé avant de naviguer vers un autre onglet.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Interrompre l'upload pourrait corrompre votre fichier et vous devrez recommencer.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseUploadWarning} variant="contained" color="primary" autoFocus>
              J'ai compris
            </Button>
          </DialogActions>
        </Dialog>

        {/* Onboarding Questionnaire - Affiché en premier pour les nouveaux utilisateurs */}
        {currentUser && (
          <OnboardingQuestionnaire
            isOpen={showQuestionnaire}
            onComplete={async (data) => {
              logger.debug('[RootLayout] Questionnaire data:', data);
              try {
                // Envoyer les données au backend
                await saveOnboardingQuestionnaire({
                  phone_country_code: data.phoneCountryCode,
                  phone: data.phone,
                  usage: Array.isArray(data.usage) ? data.usage.join(',') : data.usage,
                  status: data.status,
                  company_name: data.companyName || null,
                  activity_sector: data.sector || null,
                  discovery_source: data.source,
                  cgu_accepted: data.cguAccepted,
                });
                logger.debug('[RootLayout] Questionnaire saved successfully');
              } catch (error) {
                logger.error('[RootLayout] Error saving questionnaire:', error);
                // On continue quand même pour ne pas bloquer l'utilisateur
              }
              completeQuestionnaire();
            }}
          />
        )}

        {/* Onboarding Tour - Affiché après le questionnaire (masqué sur téléphone) */}
        {currentUser && questionnaireCompleted && !isMobile && (
          <OnboardingTour
            isOpen={showOnboarding}
            onComplete={completeOnboarding}
            userId={userId}
          />
        )}

        {/* Onboarding Desktop — autorisations micro/système/notifs (Tauri uniquement) */}
        {showDesktopOnboarding && currentUser && (
          <OnboardingModal
            userId={currentUser.id}
            onDone={() => setShowDesktopOnboarding(false)}
          />
        )}

      </Box>
  );
}

export default RootLayout;
