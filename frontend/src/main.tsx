/**
 * Point d'entrée de l'application Gilbert
 * Utilise React Router v7 pour la navigation multi-URL
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
    logger.debug(`📦 [MAIN] Cache localStorage: ${(size / 1024).toFixed(1)} KB`);
    if (size > 2 * 1024 * 1024) {
      logger.warn('⚠️ [MAIN] Cache trop volumineux, nettoyage...');
      localStorage.removeItem(dataStoreKey);
      logger.debug('✅ [MAIN] Cache nettoyé');
    }
  }
} catch (e) {
  logger.warn('⚠️ [MAIN] Erreur accès localStorage, nettoyage complet...');
  try {
    localStorage.clear();
    logger.debug('✅ [MAIN] localStorage vidé');
  } catch (e2) {
    logger.error('❌ [MAIN] Impossible de vider localStorage:', e2);
  }
}

// ============================================================================
// COLD START TAURI : vider la session à chaque lancement de l'app
//
// Principe : sessionStorage est vidé à chaque fermeture de la WebView Tauri.
// Si le flag "gilbert_session_initialized" est absent → c'est un cold start
// → on vide les clés d'auth dans localStorage et on pose le flag.
// Les navigations internes (React Router) ne retriggerent pas ce code.
// ============================================================================
const SESSION_AUTH_KEYS = [
  'auth_token',
  'token_issued_at',
  'token_expires_in',
  'meeting-transcriber-meetings-cache',
  'gilbert-data-store',
];

// Détection Tauri : withGlobalTauri=true expose window.__TAURI_IPC__
const isTauriEnv = typeof (window as any).__TAURI_IPC__ !== 'undefined'
  || typeof (window as any).__TAURI__ !== 'undefined';

if (isTauriEnv) {
  const COLD_START_FLAG = 'gilbert_session_initialized';
  const alreadyInitialized = sessionStorage.getItem(COLD_START_FLAG);

  if (!alreadyInitialized) {
    // Premier chargement depuis le lancement du process → cold start
    SESSION_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    sessionStorage.setItem(COLD_START_FLAG, '1');
    logger.info('🔒 [COLD START] Nouvelle session — auth vidée, retour connexion');
  } else {
    logger.debug('🔄 [COLD START] Rechargement interne — session conservée');
  }
}

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
