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
    }
  }
} catch (e) {
  try { localStorage.clear(); } catch {}
}

// ============================================================================
// COLD START TAURI — détection via nonce de session Rust
//
// À chaque démarrage du process Rust, un nonce unique est généré (OnceLock).
// On le compare au nonce stocké dans localStorage :
//   - Différent ou absent → cold start → vider l'auth
//   - Identique → rechargement interne (navigation React) → conserver la session
//
// Cela garantit que l'utilisateur arrive sur la page de connexion à chaque
// ouverture de l'app, sans impacter les navigations internes.
// ============================================================================
const SESSION_AUTH_KEYS = [
  'auth_token',
  'token_issued_at',
  'token_expires_in',
  'meeting-transcriber-meetings-cache',
  'gilbert-data-store',
];

const NONCE_STORAGE_KEY = 'gilbert_session_nonce';
const isTauriEnv = typeof (window as any).__TAURI_IPC__ !== 'undefined'
  || typeof (window as any).__TAURI__ !== 'undefined';

async function checkColdStart(): Promise<void> {
  if (!isTauriEnv) return;

  try {
    // invoke Tauri sans importer le SDK (withGlobalTauri=true expose window.__TAURI__.tauri.invoke)
    const invoke = (window as any).__TAURI__?.tauri?.invoke
      || (window as any).__TAURI__?.core?.invoke;

    if (!invoke) {
      // __TAURI__ pas encore injecté (race condition au tout premier rendu)
      // → vider par précaution
      SESSION_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
      logger.info('🔒 [COLD START] __TAURI__ non disponible → auth vidée par précaution');
      return;
    }

    const rustNonce: string = await invoke('get_session_nonce');
    const storedNonce = localStorage.getItem(NONCE_STORAGE_KEY);

    if (storedNonce !== rustNonce) {
      // Nouveau process Rust → cold start
      SESSION_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
      localStorage.setItem(NONCE_STORAGE_KEY, rustNonce);
      logger.info('🔒 [COLD START] Nouveau process Rust détecté → auth vidée');
    } else {
      logger.debug('🔄 [COLD START] Rechargement interne → session conservée');
    }
  } catch (e) {
    // En cas d'erreur : vider par précaution
    SESSION_AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
    logger.warn('⚠️ [COLD START] Erreur nonce → auth vidée par précaution:', e);
  }
}

// Lancer le check cold start de façon synchrone (bloquante avant render)
// puis render une fois la vérification terminée
checkColdStart().finally(() => {
  // Resume token auto-refresh if user is already logged in (après cold start check)
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
});
