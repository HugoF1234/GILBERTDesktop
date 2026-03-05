/**
 * Types TypeScript pour le routing React Router v7
 * Conformes à Pylance basic mode
 */

/** Types de vues principales de l'application */
export type ViewType = 'dashboard' | 'meetings' | 'templates' | 'shares' | 'dictionary' | 'profile' | 'settings' | 'admin';

/** Types d'onglets dans ExchangesPage */
export type TabValue = 'exchanges' | 'folders';

/** Paramètres de route possibles */
export interface RouteParams {
  meetingId?: string;
  userId?: string;
}

/** État de location pour la navigation */
export interface LocationState {
  from?: {
    pathname: string;
  };
  initialTab?: TabValue;
}

/** Mapping des vues vers les chemins URL */
export const VIEW_TO_PATH: Record<ViewType, string> = {
  dashboard: '/',
  meetings: '/meetings',
  templates: '/templates',
  shares: '/shares',
  dictionary: '/dictionary',
  profile: '/profile',
  settings: '/settings',
  admin: '/admin',
} as const;

/** Mapping des chemins URL vers les vues */
export function getViewFromPath(pathname: string): ViewType {
  if (pathname === '/' || pathname === '/record') {
    return 'dashboard';
  }
  if (pathname.startsWith('/meetings')) {
    return 'meetings';
  }
  if (pathname === '/templates') {
    return 'templates';
  }
  if (pathname === '/shares') {
    return 'shares';
  }
  if (pathname === '/dictionary') {
    return 'dictionary';
  }
  if (pathname === '/profile') {
    return 'profile';
  }
  if (pathname === '/settings') {
    return 'settings';
  }
  if (pathname.startsWith('/admin')) {
    return 'admin';
  }
  return 'dashboard';
}

/** Mapping des onglets vers les chemins URL */
export const TAB_TO_PATH: Record<TabValue, string> = {
  exchanges: '/meetings',
  folders: '/meetings/folders',
} as const;

/** Récupère l'onglet actif depuis le pathname */
export function getTabFromPath(pathname: string): TabValue {
  if (pathname.includes('/folders')) {
    return 'folders';
  }
  return 'exchanges';
}

