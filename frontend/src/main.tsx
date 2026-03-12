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
// COLD START TAURI : vider la session au lancement de l'app (pas au reload)
// L'event "app-cold-start" est émis une seule fois par le process Rust.
// Cela garantit qu'à chaque ouverture du DMG, l'utilisateur arrive sur
// la page de connexion et non sur un compte précédemment connecté.
// ============================================================================
function clearSessionStorage(): void {
  const SESSION_KEYS = [
    'auth_token',
    'token_issued_at',
    'token_expires_in',
    'meeting-transcriber-meetings-cache',
    'gilbert-data-store',
  ];
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
  logger.info('🔒 [COLD START] Session vidée — retour à la page de connexion');
}

// Détection Tauri sans importer le SDK (évite l'import conditionnel)
const isTauriEnv = typeof (window as any).__TAURI__ !== 'undefined'
  || typeof (window as any).__TAURI_IPC__ !== 'undefined';

if (isTauriEnv) {
  // Écouter l'event cold-start émis par Rust au setup()
  // Utilise window.__TAURI__.event directement (pas d'import SDK externe)
  const tryListen = () => {
    const tauriEvent = (window as any).__TAURI__?.event;
    if (tauriEvent?.listen) {
      tauriEvent.listen('app-cold-start', () => {
        clearSessionStorage();
        if (!window.location.pathname.startsWith('/auth')) {
          window.location.replace('/auth');
        }
      }).then((unlisten: () => void) => {
        (window as any).__coldStartUnlisten = unlisten;
        logger.debug('👂 [COLD START] Écoute de app-cold-start activée');
      }).catch((e: unknown) => {
        logger.warn('⚠️ [COLD START] listen échoué:', e);
      });
    } else {
      // __TAURI__ pas encore prêt, réessayer dans 100ms
      setTimeout(tryListen, 100);
    }
  };
  tryListen();
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
