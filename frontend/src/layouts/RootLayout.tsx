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
import { isAuthenticated, getUserProfile, logoutUser, exchangeOAuthCode, verifyTokenValidity } from '../services/authService';
import type { User } from '../services/authService';
import { NetworkError, isOffline } from '../services/apiClient';
import { getViewFromPath, VIEW_TO_PATH } from '../types/router';
import type { ViewType } from '../types/router';
import type { RouteContextType } from '../hooks/useRouteContext';
import { recordingManager } from '../services/recordingManager';
import { isTauriApp, onMicActivityDetected } from '../services/tauriRecordingService';

// Import des bannières
import GenerationBanner from '../components/GenerationBanner';
import RecordingBanner from '../components/RecordingBanner';

// Import Onboarding Tour & Questionnaire
import OnboardingTour, { useOnboarding } from '../components/OnboardingTour';
import OnboardingQuestionnaire, { useOnboardingQuestionnaire } from '../components/OnboardingQuestionnaire';
import { saveOnboardingQuestionnaire } from '../services/profileService';
import { logger } from '@/utils/logger';

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

  // État utilisateur et authentification
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessingOAuth, setIsProcessingOAuth] = useState<boolean>(false);

  // États d'enregistrement et upload
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [showUploadWarning, setShowUploadWarning] = useState<boolean>(false);

  // État de la sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  // Toast de détection de réunion (Tauri desktop uniquement)
  const [showMeetingDetectedToast, setShowMeetingDetectedToast] = useState<boolean>(false);

  // Souscrire à l'événement Tauri "mic-activity-detected" (réunion détectée)
  useEffect(() => {
    if (!isTauriApp()) return;
    let unlisten: (() => void) | undefined;
    onMicActivityDetected(() => {
      setShowMeetingDetectedToast(true);
      setTimeout(() => setShowMeetingDetectedToast(false), 6000);
    }).then((fn) => { unlisten = fn; });
    return () => { if (unlisten) unlisten(); };
  }, []);

  // Onboarding Questionnaire & Tour : par utilisateur (backend pour questionnaire, localStorage par user pour le tour)
  const userId = currentUser?.id;
  const { showQuestionnaire, isCompleted: questionnaireCompleted, completeQuestionnaire } = useOnboardingQuestionnaire(!!currentUser, userId);
  const { showOnboarding, completeOnboarding } = useOnboarding(userId);

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
          const authResponse = await exchangeOAuthCode(oauthCode);
          logger.debug('[RootLayout] Code échangé avec succès, token reçu');

          // Le token est déjà stocké par exchangeOAuthCode, récupérer le profil
          const user = await getUserProfile();
          logger.debug('[RootLayout] Profil utilisateur récupéré:', user.email);
          setCurrentUser(user);

          setIsProcessingOAuth(false);
          setIsLoading(false);

          // Nettoyer l'URL et rediriger vers l'application
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
          setCurrentUser(user);

          setIsProcessingOAuth(false);
          setIsLoading(false);

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
        setCurrentUser(user);
      } catch (error) {
        // If getUserProfile fails after token was validated, it's likely a network error
        // (since verifyTokenValidity already confirmed the token is good).
        // Don't redirect - keep the user on the page.
        if (error instanceof NetworkError || isOffline()) {
          logger.debug('[RootLayout] Erreur reseau (offline) - garder l\'utilisateur sur la page actuelle');
          setIsLoading(false);
          return;
        }
        // Unexpected error fetching profile - don't break the app
        logger.debug('[RootLayout] Erreur inattendue lors de la recuperation du profil');
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
          setCurrentUser(user);

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
            <Outlet context={outletContext} />
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

        {/* Toast de détection de réunion (Tauri desktop) */}
        {showMeetingDetectedToast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              padding: '16px 20px',
              background: '#06b6d4',
              color: '#fff',
              borderRadius: 12,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 280,
              cursor: 'pointer',
            }}
            onClick={() => {
              setShowMeetingDetectedToast(false);
              navigate('/record');
            }}
          >
            <span style={{ fontSize: 22 }}>🎙️</span>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 3, fontSize: 15 }}>
                Réunion détectée
              </div>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                Cliquez pour démarrer l'enregistrement
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setShowMeetingDetectedToast(false); }}
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              ✕
            </button>
          </div>
        )}
      </Box>
  );
}

export default RootLayout;
