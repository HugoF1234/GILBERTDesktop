/**
 * Hook pour accéder au context de route depuis les composants enfants
 * Utilisé avec useOutletContext de React Router
 */

import { useOutletContext } from 'react-router-dom';
import type { User } from '../services/authService';

/** Interface du context de route passé via Outlet */
export interface RouteContextType {
  /** Utilisateur actuellement connecté */
  currentUser: User | null;
  /** État d'enregistrement en cours */
  isRecording: boolean;
  /** Setter pour l'état d'enregistrement */
  setIsRecording: (recording: boolean) => void;
  /** État d'upload en cours */
  isUploading: boolean;
  /** Setter pour l'état d'upload */
  setIsUploading: (uploading: boolean) => void;
  /** Est-ce un écran mobile (< 600px) */
  isMobile: boolean;
  /** Est-ce une tablette (600px - 900px) */
  isTablet: boolean;
  /** Est-ce un petit écran - mobile ou tablette (< 900px) */
  isSmallScreen: boolean;
  /** Toggle de la sidebar */
  onToggleSidebar: () => void;
}

/**
 * Hook pour accéder au context de route
 * @returns Le context contenant user, recording state, etc.
 */
export function useRouteContext(): RouteContextType {
  return useOutletContext<RouteContextType>();
}

export default useRouteContext;

