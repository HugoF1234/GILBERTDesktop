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
// Au cold start → vider localStorage auth → poser le flag sessionStorage
// En interne → ne rien faire (session conservée)
// ============================================================================
const SESSION_AUTH_KEYS = [
  'auth_token',
  'token_issued_at',
  'token_expires_in',
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
    // Premier chargement de cette session → cold start
    SESSION_AUTH_KEYS.forEach((key) => {
      try { localStorage.removeItem(key); } catch {}
    });
    sessionStorage.setItem(COLD_START_SESSION_FLAG, '1');
    logger.info('🔒 [COLD START] Nouvelle session Tauri → auth vidée, retour connexion');
  } else {
    logger.debug('🔄 [COLD START] Session en cours → auth conservée');
  }
}

// ============================================================================
// RENDER
// ============================================================================

// Resume token auto-refresh if user is already logged in
initTokenRefresh();

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
