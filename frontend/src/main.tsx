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
    // Si le cache est trop gros (>2MB), le vider
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
