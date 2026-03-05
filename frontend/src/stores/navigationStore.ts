import { create } from 'zustand'

/**
 * Navigation Store simplifié
 * La navigation entre pages est maintenant gérée par React Router
 * Ce store ne garde que les états UI qui ne correspondent pas à des URLs
 */

export type NavigationView = 'recording' | 'meetings' | 'templates' | 'shared' | 'dashboard'

interface NavigationState {
  // Vue actuelle pour synchronisation avec App.tsx
  currentView: NavigationView
  // État de la sidebar (collapsed/expanded)
  sidebarCollapsed: boolean
  // Pour ouvrir l'overlay d'un meeting depuis n'importe où (ex: bandeau génération)
  pendingMeetingOverlayId: string | null
  // Actions
  setCurrentView: (view: NavigationView) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openMeetingOverlay: (meetingId: string) => void
  clearPendingOverlay: () => void
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'dashboard',
  sidebarCollapsed: false,
  pendingMeetingOverlayId: null,

  setCurrentView: (view) => set({ currentView: view }),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  // Ouvre l'overlay d'un meeting (depuis le bandeau de génération par ex.)
  openMeetingOverlay: (meetingId) => set({ pendingMeetingOverlayId: meetingId }),

  clearPendingOverlay: () => set({ pendingMeetingOverlayId: null }),
}))

