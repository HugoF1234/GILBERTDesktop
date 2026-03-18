/**
 * Point d'entrée de l'application Gilbert
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { NotificationProvider } from './contexts/NotificationContext';
import ErrorBoundary from './components/ErrorBoundary';
import { router } from './rooter';
import theme from './styles/theme';
import './index.css';
import './styles/global.css';
import { logger } from '@/utils/logger';
import { initTokenRefresh } from './services/authService';

// ============================================================================
// CLEANUP LOCALSTORAGE SI QUOTA DÉPASSÉ (fix pour QuotaExceededError)
// ============================================================================
try {
  const dataStoreKey = 'gilbert-data-store';
  const stored = localStorage.getItem(dataStoreKey);
  if (stored) {
    const size = new Blob([stored]).size;
    if (size > 2 * 1024 * 1024) {
      localStorage.removeItem(dataStoreKey);
    }
  }
} catch (e) {
  try { localStorage.clear(); } catch {}
}

// ============================================================================
// COLD START TAURI — détection via sessionStorage
//
// Le sessionStorage est GARANTI vide à chaque nouveau lancement du process macOS.
// C'est un comportement natif WebKit : sessionStorage ne persiste pas entre
// les lancements de l'app (contrairement à localStorage).
//
// Stratégie :
//   - Absence de 'gilbert_app_session' dans sessionStorage = cold start (nouveau lancement)
//   - Présence = navigation interne React (rechargement JS sans fermeture de l'app)
//
// Au cold start → vider uniquement le CACHE (pas le token d'auth) → poser le flag sessionStorage
// Le token d'auth est conservé pour permettre la reconnexion automatique.
// RootLayout.checkAuth() vérifiera sa validité via /auth/me au démarrage.
// ============================================================================
const SESSION_CACHE_KEYS = [
  'meeting-transcriber-meetings-cache',
  'gilbert-data-store',
];

const COLD_START_SESSION_FLAG = 'gilbert_app_session';

// Détection Tauri : synchrone, disponible dès le chargement du script
const isTauriEnv =
  typeof (window as any).__TAURI_IPC__ !== 'undefined' ||
  typeof (window as any).__TAURI__ !== 'undefined' ||
  // Fallback : Tauri injecte '__TAURI_METADATA__' dans certaines versions
  typeof (window as any).__TAURI_METADATA__ !== 'undefined';

if (isTauriEnv) {
  const alreadyRunning = sessionStorage.getItem(COLD_START_SESSION_FLAG);

  if (!alreadyRunning) {
    // Nouveau démarrage (cold start ou rechargement forcé après login/logout)
    // Vider uniquement les caches (jamais le token d'auth)
    SESSION_CACHE_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
    // Nettoyer aussi les flags de navigation sessionStorage de la session précédente
    try { sessionStorage.removeItem('auto_start_recording'); } catch {}
    try { sessionStorage.removeItem('auto_start_recording_compact'); } catch {}
    sessionStorage.setItem(COLD_START_SESSION_FLAG, '1');
    logger.info('🔒 [COLD START] Nouvelle session Tauri → caches vidés, token conservé');
  } else {
    logger.debug('🔄 [COLD START] Session en cours → auth conservée');
  }
}

// ============================================================================
// OAUTH CALLBACK LISTENER — installé AVANT React pour éviter tout problème de timing
//
// Le serveur HTTP local Rust émet l'event "oauth-callback" dès qu'il reçoit le token
// de Google. Ce listener doit être actif le plus tôt possible, indépendamment de
// l'état des composants React (AuthForm isLoading, RootLayout monté ou non).
//
// Flux : Chrome reçoit le redirect → localhost:PORT/callback?token=JWT
//        → Rust intercepte → émet "oauth-callback" → ici on stocke + reload propre
// ============================================================================
if (isTauriEnv) {
  const tauri = (window as any).__TAURI__;
  const listenFn = tauri?.event?.listen;
  if (listenFn) {
    listenFn('oauth-callback', (event: { payload: string }) => {
      const token = event.payload;
      if (!token) return;
      logger.info('[OAuth] Token reçu dans main.tsx, stockage + reload...');
      try {
        localStorage.setItem('auth_token', token);
        // Forcer un reload propre : sessionStorage vide → cold start → checkAuth trouve le token
        sessionStorage.removeItem('gilbert_app_session');
        window.location.replace('/');
      } catch (e) {
        logger.error('[OAuth] Erreur stockage token:', e);
      }
    }).then(() => {
      logger.debug('[OAuth] Listener oauth-callback actif (main.tsx)');
    }).catch(() => {});
  }
}

// Resume token auto-refresh if user is already logged in
initTokenRefresh();

// Vérification des mises à jour (Tauri uniquement, non bloquant)
if (isTauriEnv) {
  import('./services/updaterService').then(({ checkForUpdates }) => {
    checkForUpdates();
  }).catch(() => {});
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <NotificationProvider>
          <CssBaseline />
          <RouterProvider router={router} />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
