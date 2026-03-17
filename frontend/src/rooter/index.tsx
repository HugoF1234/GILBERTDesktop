/**
 * Configuration des routes React Router v7
 * Définit toutes les routes de l'application Gilbert
 *
 * Utilise React.lazy() pour le code-splitting et réduire la taille du bundle initial
 */

import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { CircularProgress, Box } from '@mui/material';
import { RouteErrorBoundary } from '../components/ErrorBoundary';
import NotFound from '../pages/NotFound';

// Layouts - chargé immédiatement (nécessaire pour la structure)
import RootLayout from '../layouts/RootLayout';

// Composant de chargement
const PageLoader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <CircularProgress />
  </Box>
);

// Pages principales - lazy loaded (comme dans Marsou2)
const ImmersiveRecordingPage = lazy(() =>
  import('../components/recording').then(m => ({ default: m.ImmersiveRecordingPage }))
);
const ExchangesPage = lazy(() =>
  import('../components/exchanges').then(m => ({ default: m.ExchangesPage }))
);
const MyTemplatesComponent = lazy(() => import('../components/MyTemplates'));
const SharesViewComponent = lazy(() => import('../components/SharesView'));
const ProfilePageComponent = lazy(() => import('../components/ProfilePage'));
const SettingsPageComponent = lazy(() => import('../components/SettingsPage'));
const CGUPageComponent = lazy(() => import('../components/CGUPage'));
const CGVPageComponent = lazy(() => import('../components/CGVPage'));
const PrivacyPolicyPageComponent = lazy(() => import('../components/PrivacyPolicyPage'));
const LegalNoticePageComponent = lazy(() => import('../components/LegalNoticePage'));
const DictionaryPageComponent = lazy(() => import('../components/DictionaryPage'));
const AdminDashboardComponent = lazy(() => import('../components/AdminDashboard'));
const UserDetailsPageComponent = lazy(() => import('../components/UserDetailsPage'));
// Helper pour wrapper les composants lazy avec Suspense
const withSuspense = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<PageLoader />}>
    <Component />
  </Suspense>
);

// Wrapper pour UserDetailsPage (nécessite useParams)
const UserDetailsPageWrapper = () => {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) {
    return <Navigate to="/admin" replace />;
  }
  return <UserDetailsPageComponent userId={userId} />;
};

// Auth - lazy loaded avec import nommé pour éviter les problèmes de minification
const AuthFormComponent = lazy(() => 
  import('../components/AuthForm').then(module => ({ default: module.default }))
);

// Auth - wrapper pour gérer la redirection après connexion
const AuthFormWrapper = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const handleAuthSuccess = () => {
    // Dans Tauri : rechargement complet pour garantir une initialisation propre
    // (son système, compact mode, tous les hooks se réinitialisent correctement)
    if ((window as any).__TAURI__) {
      sessionStorage.removeItem('gilbert_app_session');
      window.location.replace('/');
      return;
    }

    // Web : navigation interne React (pas de rechargement)
    const token = localStorage.getItem('auth_token');
    const from = (location.state as any)?.from?.pathname || '/';

    if (!token) {
      setTimeout(() => {
        const retryToken = localStorage.getItem('auth_token');
        if (retryToken) {
          navigate(from, { replace: true });
        } else {
          logger.error('[AuthFormWrapper] Token still not found after retry');
        }
      }, 100);
      return;
    }
    
    navigate(from, { replace: true });
  };
  
  return (
    <Suspense fallback={<PageLoader />}>
      <AuthFormComponent onAuthSuccess={handleAuthSuccess} />
    </Suspense>
  );
};

// Protection des routes admin
import AdminRoute from '../components/AdminRoute';
import { logger } from '@/utils/logger';


/**
 * Définition des routes de l'application
 * Chaque page est lazy-loaded pour réduire la taille du bundle initial
 */
const routes: RouteObject[] = [
  // Routes protégées (nécessitent authentification)
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      // Enregistrement immersif (comme dans Marsou2)
      {
        index: true,
        element: withSuspense(ImmersiveRecordingPage),
      },
      // Meetings / Échanges (comme dans Marsou2)
      {
        path: 'meetings',
        element: withSuspense(ExchangesPage),
      },
      {
        path: 'meetings/folders',
        element: withSuspense(ExchangesPage),
      },
      {
        path: 'meetings/:meetingId',
        element: withSuspense(ExchangesPage),
      },
      // Templates
      {
        path: 'templates',
        element: withSuspense(MyTemplatesComponent),
      },
      // Partages
      {
        path: 'shares',
        element: withSuspense(SharesViewComponent),
      },
      // Dictionnaire - Vocabulaire personnalisé
      {
        path: 'dictionary',
        element: withSuspense(DictionaryPageComponent),
      },
      // Profil utilisateur
      {
        path: 'profile',
        element: withSuspense(ProfilePageComponent),
      },
      // Paramètres (Settings) - GARDÉ DE MAIN
      {
        path: 'settings',
        element: withSuspense(SettingsPageComponent),
      },
      // CGU - Conditions Générales d'Utilisation
      {
        path: 'cgu',
        element: withSuspense(CGUPageComponent),
      },
      // CGV - Conditions Générales de Vente
      {
        path: 'cgv',
        element: withSuspense(CGVPageComponent),
      },
      // Politique de confidentialité
      {
        path: 'privacy',
        element: withSuspense(PrivacyPolicyPageComponent),
      },
      // Mentions légales
      {
        path: 'legal',
        element: withSuspense(LegalNoticePageComponent),
      },
      // Admin (protégé par AdminRoute)
      {
        path: 'admin',
        element: (
          <AdminRoute>
            <Suspense fallback={<PageLoader />}>
              <AdminDashboardComponent />
            </Suspense>
          </AdminRoute>
        ),
      },
      {
        path: 'admin/users/:userId',
        element: (
          <AdminRoute>
            <Suspense fallback={<PageLoader />}>
              <UserDetailsPageWrapper />
            </Suspense>
          </AdminRoute>
        ),
      },
    ],
  },
  // Routes d'authentification (publiques)
  {
    path: '/auth',
    element: <AuthFormWrapper />,
    errorElement: <RouteErrorBoundary />,
  },
  // Note: Les routes /auth/callback et /auth/google/callback sont gérées par le backend
  // Le backend redirige vers / avec ?token=JWT&success=true après traitement OAuth
  // Redirections legacy
  {
    path: '/record',
    element: <Navigate to="/" replace />,
  },
  // Fallback - page 404
  {
    path: '*',
    element: <NotFound />,
  },
];

/**
 * Router configuré avec createBrowserRouter
 */
export const router = createBrowserRouter(routes);

export default router;
