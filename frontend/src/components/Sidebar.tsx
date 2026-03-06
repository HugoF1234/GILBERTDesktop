'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User } from '../services/authService';
import { getUserProfile, getDiscoveryStatus, DiscoveryStatus } from '../services/profileService';
import sounds from '../utils/soundDesign';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Zap } from 'lucide-react';
import { VIEW_TO_PATH, getViewFromPath } from '../types/router';
import type { ViewType } from '../types/router';
import { useRecordingStore } from '../stores/recordingStore';
import {
  MicrophoneIcon,
  ListIcon,
  ShareIcon,
  TemplateIcon,
  SettingsIcon,
  AdminIcon,
  DictionaryIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
  CloseIcon,
} from './ui/SidebarIcons';
import { logger } from '@/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  profile_picture_url: string | null;
  created_at: string;
}

type SidebarView = 'dashboard' | 'meetings' | 'templates' | 'admin' | 'user-details' | 'shares' | 'dictionary' | 'profile' | 'settings';

interface SidebarProps {
  onViewChange?: (view: SidebarView) => void;
  currentView?: SidebarView;
  user: User | null;
  isMobile?: boolean;
  isTablet?: boolean;
  isSmallScreen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  isRecording?: boolean;
  pendingRecordingsCount?: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const NAV_ITEMS = [
  { id: 'dashboard' as const, label: 'Enregistrer', Icon: MicrophoneIcon, description: 'Nouvelle réunion', showNewBadge: false },
  { id: 'meetings' as const, label: 'Mes échanges', Icon: ListIcon, description: 'Voir les échanges', showNewBadge: false },
  { id: 'shares' as const, label: 'Partages', Icon: ShareIcon, description: 'Réunions partagées', showNewBadge: false },
  { id: 'templates' as const, label: 'Modèles', Icon: TemplateIcon, description: 'Modèles de synthèse', showNewBadge: false },
  { id: 'dictionary' as const, label: 'Dictionnaire', Icon: DictionaryIcon, description: 'Vocabulaire personnalisé', showNewBadge: false },
];

const SIDEBAR_WIDTH_EXPANDED = 240;
const SIDEBAR_WIDTH_COLLAPSED = 68;
const MOBILE_SIDEBAR_WIDTH = 280;

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const sidebarVariants = {
  expanded: { width: SIDEBAR_WIDTH_EXPANDED },
  collapsed: { width: SIDEBAR_WIDTH_COLLAPSED },
};

const mobileDrawerVariants = {
  open: { x: 0, opacity: 1 },
  closed: { x: -MOBILE_SIDEBAR_WIDTH, opacity: 0.5 },
};

const backdropVariants = {
  open: { opacity: 1 },
  closed: { opacity: 0 },
};

// ============================================================================
// COMPONENT
// ============================================================================

const Sidebar: React.FC<SidebarProps> = ({
  onViewChange: onViewChangeProp,
  currentView: currentViewProp,
  user,
  isMobile = false,
  isTablet = false,
  isSmallScreen = false,
  open = true,
  onToggle,
  isRecording = false,
  pendingRecordingsCount = 0,
}) => {
  // React Router hooks
  const navigate = useNavigate();
  const location = useLocation();

  // Déterminer la vue actuelle depuis l'URL ou la prop
  const currentView = useMemo<SidebarView>(() => {
    if (currentViewProp !== undefined) {
      return currentViewProp;
    }
    return getViewFromPath(location.pathname) as SidebarView;
  }, [currentViewProp, location.pathname]);

  // Handler de navigation : utilise la prop si fournie, sinon navigate
  const onViewChange = useCallback((view: SidebarView): void => {
    if (onViewChangeProp) {
      onViewChangeProp(view);
    } else {
      const path = VIEW_TO_PATH[view as ViewType] ?? '/';
      navigate(path);
    }
  }, [onViewChangeProp, navigate]);

  // Combined check: mobile and tablet both use drawer mode (< 900px)
  const useDrawerMode = isSmallScreen || isMobile || isTablet;
  // State
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  // État du dialog de sauvegarde depuis le store
  const showSaveDialog = useRecordingStore((state: any) => state.showSaveDialog);


  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Garder l'image en cache pour éviter le clignotement lors de la navigation
  // IMPORTANT: Ne jamais réinitialiser à null, seulement mettre à jour avec une nouvelle valeur
  const [cachedProfilePicture, setCachedProfilePicture] = useState<string | null | undefined>(null);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Ne charger le profil que si l'ID utilisateur change vraiment (pas juste la référence)
    const currentUserId = user?.id || null;
    
    if (currentUserId && currentUserId !== lastUserIdRef.current) {
      // Nouvel utilisateur, charger le profil
      lastUserIdRef.current = currentUserId;
      fetchUserProfile();
    } else if (!currentUserId && lastUserIdRef.current) {
      // Déconnexion
      lastUserIdRef.current = null;
      setUserProfile(null);
      setCachedProfilePicture(null);
    }
    // Si c'est le même utilisateur (même ID), ne rien faire pour éviter le rechargement
  }, [user?.id]); // Utiliser user?.id au lieu de user pour éviter les rechargements inutiles

  // Mettre à jour le cache seulement quand on a une nouvelle image valide
  // Ne jamais réinitialiser à null, garder l'ancienne valeur si la nouvelle est null
  useEffect(() => {
    if (userProfile?.profile_picture_url) {
      // Mettre à jour seulement si on a une nouvelle URL valide
      setCachedProfilePicture(prev => {
        // Si on a une nouvelle URL, l'utiliser
        if (userProfile.profile_picture_url) {
          return userProfile.profile_picture_url;
        }
        // Sinon, garder l'ancienne valeur pour éviter le clignotement
        return prev;
      });
    }
    // Si userProfile existe mais n'a pas de profile_picture_url, on garde l'ancienne valeur
    // Ne pas réinitialiser à null pour éviter le clignotement
  }, [userProfile?.profile_picture_url]);

  // Reset collapsed state when switching to drawer mode
  useEffect(() => {
    if (useDrawerMode) {
      setIsCollapsed(false); // Reset to expanded for drawer
    }
  }, [useDrawerMode]);

  // Fetch Discovery status for the gauge
  useEffect(() => {
    const fetchDiscoveryStatus = async () => {
      try {
        const status = await getDiscoveryStatus();
        setDiscoveryStatus(status);
        // Sauvegarder dans localStorage pour éviter le clignotement au rechargement
        if (status && user?.id) {
          localStorage.setItem(`discovery_status_${user.id}`, JSON.stringify(status));
        }
      } catch (error) {
        // En cas d'erreur, NE PAS effacer le status - garder la valeur précédente
        // Cela évite le clignotement de la barre
        logger.warn('Erreur fetch discovery status:', error);
      }
    };

    if (user?.id) {
      // Charger d'abord depuis localStorage pour éviter le clignotement initial
      const cached = localStorage.getItem(`discovery_status_${user.id}`);
      if (cached && !discoveryStatus) {
        try {
          setDiscoveryStatus(JSON.parse(cached));
        } catch { /* ignore */ }
      }

      fetchDiscoveryStatus();
      // Polling toutes les 30 secondes pour mettre à jour la jauge
      const interval = setInterval(fetchDiscoveryStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const fetchUserProfile = async (): Promise<void> => {
    // Ne pas réinitialiser userProfile pendant le chargement pour éviter le clignotement
    // On garde l'ancienne valeur jusqu'à ce que les nouvelles données arrivent
    try {
      const profileData = await getUserProfile();
      setUserProfile(prevProfile => {
        // Conserver l'ancienne photo si la nouvelle n'est pas disponible
        const newProfile = {
          ...profileData,
          // Si la nouvelle photo n'est pas disponible, garder l'ancienne
          profile_picture_url: profileData.profile_picture_url || prevProfile?.profile_picture_url || null
        };
        return newProfile;
      });
    } catch (error) {
      logger.error('Échec du chargement du profil:', error);
      // Seulement mettre à jour si on n'a pas déjà un profil en cache
      // Cela évite de perdre l'image pendant la navigation
      if (user && !userProfile) {
        setUserProfile({
          id: user.id,
          email: user.username,
          full_name: user.name || '',
          profile_picture_url: cachedProfilePicture || null, // Garder l'image en cache si disponible
          created_at: new Date().toISOString(),
        });
      }
      // Si on a déjà un profil, ne rien faire pour garder l'image
    }
  };

  const handleNavClick = useCallback((view: SidebarView): void => {
    sounds.softTab(); // Ultra subtle navigation sound
    onViewChange(view);
    if (useDrawerMode && onToggle) {
      onToggle();
    }
  }, [onViewChange, useDrawerMode, onToggle]);

  const handleToggleCollapse = useCallback((): void => {
    sounds.softSlide(); // Soft slide sound for collapse/expand
    setIsCollapsed((prev) => !prev);
  }, []);

  const getInitials = (name: string): string => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  // Discovery Gauge Component - Affiche la jauge d'utilisation Discovery
  // Cliquable pour naviguer vers les paramètres
  const DiscoveryGauge: React.FC = () => {
    // Ne pas afficher si pas en plan Discovery ou pas de données
    if (!discoveryStatus || discoveryStatus.subscription_plan !== 'discovery') {
      return null;
    }

    const percentageUsed = Math.min(discoveryStatus.percentage_used, 100);
    const minutesRemaining = discoveryStatus.minutes_remaining;
    const minutesTotal = discoveryStatus.minutes_total;
    const minutesUsed = discoveryStatus.minutes_used;

    // Couleur basée sur le pourcentage d'utilisation
    const getProgressColor = () => {
      if (percentageUsed >= 90) return 'bg-red-500';
      if (percentageUsed >= 70) return 'bg-amber-500';
      return 'bg-emerald-500';
    };

    const getTextColor = () => {
      if (percentageUsed >= 90) return 'text-red-600';
      if (percentageUsed >= 70) return 'text-amber-600';
      return 'text-emerald-600';
    };

    // Handler pour naviguer vers les paramètres
    const handleGaugeClick = () => {
      sounds.click();
      handleNavClick('settings');
    };

    // Version collapsed : juste une icône avec tooltip
    if (isCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleGaugeClick}
              data-tour="discovery-gauge"
              className="flex justify-center py-2 w-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded-lg"
            >
              <div className={cn(
                "relative p-2 rounded-lg cursor-pointer transition-colors",
                percentageUsed >= 90 ? "bg-red-50 hover:bg-red-100" :
                percentageUsed >= 70 ? "bg-amber-50 hover:bg-amber-100" :
                "bg-emerald-50 hover:bg-emerald-100"
              )}>
                <Zap className={cn("w-5 h-5", getTextColor())} />
                {/* Petit indicateur de progression circulaire */}
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    className="text-gray-200"
                    strokeWidth="3"
                    stroke="currentColor"
                    fill="transparent"
                    r="14"
                    cx="18"
                    cy="18"
                  />
                  <circle
                    className={getTextColor()}
                    strokeWidth="3"
                    strokeDasharray={`${percentageUsed * 0.88} 88`}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="14"
                    cx="18"
                    cy="18"
                  />
                </svg>
              </div>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-white text-gray-900 border shadow-lg p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className={cn("w-4 h-4", getTextColor())} />
                <span className="font-medium">Plan Discovery</span>
              </div>
              <div className="text-sm text-gray-600">
                <span className={cn("font-semibold", getTextColor())}>{minutesRemaining}</span>
                <span> minutes restantes</span>
              </div>
              <div className="text-xs text-gray-400">
                {minutesUsed} / {minutesTotal} min utilisées
              </div>
              <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getProgressColor())}
                  style={{ width: `${percentageUsed}%` }}
                />
              </div>
              <div className="text-xs text-blue-500 mt-2">
                Cliquez pour gérer votre abonnement
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Version expanded : barre de progression avec texte
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleGaugeClick}
            data-tour="discovery-gauge"
            className="w-full px-3 py-2 cursor-pointer group text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded-lg"
          >
            <div className={cn(
              "p-3 rounded-xl transition-colors",
              percentageUsed >= 90 ? "bg-red-50/50 hover:bg-red-50" :
              percentageUsed >= 70 ? "bg-amber-50/50 hover:bg-amber-50" :
              "bg-emerald-50/50 hover:bg-emerald-50"
            )}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className={cn("w-4 h-4", getTextColor())} />
                  <span className="text-xs font-medium text-gray-600">Discovery</span>
                </div>
                <span className={cn("text-xs font-semibold", getTextColor())}>
                  {minutesRemaining} min
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-200/50 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-300", getProgressColor())}
                  style={{ width: `${percentageUsed}%` }}
                />
              </div>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="bg-white text-gray-900 border shadow-lg p-3">
          <div className="space-y-1">
            <div className="font-medium">Quota Discovery</div>
            <div className="text-sm text-gray-600">
              <span className={cn("font-semibold", getTextColor())}>{minutesRemaining}</span>
              <span> minutes restantes sur {minutesTotal}</span>
            </div>
            <div className="text-xs text-gray-400">
              {Math.round(percentageUsed)}% utilisé
            </div>
            {percentageUsed >= 90 && (
              <div className="text-xs text-red-600 font-medium pt-1">
                Quota presque épuisé
              </div>
            )}
            <div className="text-xs text-blue-500 mt-2">
              Cliquez pour gérer votre abonnement
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  // Navigation Item Component - Simple, no tooltips, minimal animations
  const NavItem: React.FC<{
    item: typeof NAV_ITEMS[0];
    isActive: boolean;
  }> = ({ item, isActive }) => {
    const { Icon } = item;
    const isRecordingItem = item.id === 'dashboard' && isRecording;
    const hasPendingRecovery = item.id === 'dashboard' && pendingRecordingsCount > 0 && !isRecording;

    // Map item id to tour target
    const getTourTarget = () => {
      switch (item.id) {
        case 'dashboard': return 'record';
        case 'meetings': return 'meetings';
        case 'templates': return 'templates';
        default: return undefined;
      }
    };

    return (
      <button
        onClick={() => handleNavClick(item.id)}
        data-tour={getTourTarget()}
        className={cn(
          'group relative flex items-center w-full rounded-xl transition-colors duration-150',
          'outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
          isCollapsed ? 'justify-center px-3 py-3' : 'px-3 py-2.5 gap-3',
          isActive
            ? 'bg-blue-50/80 text-blue-600'
            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
        )}
      >
        {/* Icon container with recording indicator */}
        <div className="relative flex items-center justify-center flex-shrink-0">
          <Icon
            size={20}
            isActive={isActive}
            className={cn(
              'transition-colors duration-150',
              isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'
            )}
          />
          {/* Recording pulse indicator */}
          {isRecordingItem && (
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse"
              style={{ boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)' }}
            />
          )}
          {/* Pending recovery badge */}
          {hasPendingRecovery && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center"
              style={{ boxShadow: '0 0 6px rgba(249, 115, 22, 0.5)' }}
            >
              {pendingRecordingsCount}
            </span>
          )}
        </div>

        {/* Label - simple show/hide, no animation */}
        {!isCollapsed && (
          <>
            <span
              className={cn(
                'text-sm font-medium whitespace-nowrap',
                isActive ? 'text-blue-600' : 'text-gray-600 group-hover:text-gray-700'
              )}
            >
              {item.label}
            </span>
            {/* Badge "Nouveau" animé pour Dictionnaire */}
            {item.showNewBadge && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="ml-auto"
              >
                <motion.span
                  animate={{ opacity: [0.85, 1, 0.85] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
                    isActive ? 'bg-blue-200/80 text-blue-700' : 'bg-blue-100 text-blue-600'
                  )}
                >
                  Nouveau
                </motion.span>
              </motion.span>
            )}
          </>
        )}
      </button>
    );
  };

  // User Profile Button - Navigation directe vers /profile
  const UserProfileButton: React.FC = () => {
    const displayName = userProfile?.full_name || user?.name || user?.username?.split('@')[0] || '';
    const displayEmail = userProfile?.email || user?.username || '';

    const handleProfileClick = (): void => {
      sounds.click();
      navigate('/profile');
      if (useDrawerMode && onToggle) {
        onToggle();
      }
    };

    return (
      <button
        onClick={handleProfileClick}
        className={cn(
          'w-full flex items-center gap-3 p-2 rounded-xl transition-colors duration-150',
          'hover:bg-gray-50/50 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
          isCollapsed ? 'justify-center' : ''
        )}
      >
        <Avatar className="h-9 w-9 ring-2 ring-blue-100 ring-offset-1">
          <AvatarImage 
            src={cachedProfilePicture || undefined} 
            alt={displayName}
          />
          <AvatarFallback className="bg-blue-50 text-blue-600 font-semibold text-sm">
            {cachedProfilePicture ? '' : getInitials(displayName)}
          </AvatarFallback>
        </Avatar>

        {!isCollapsed && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
            <p className="text-xs text-gray-500 truncate">{displayEmail}</p>
          </div>
        )}
      </button>
    );
  };

  // ============================================================================
  // SIDEBAR CONTENT
  // ============================================================================

  // Build sidebar content with optional floating style
  const buildSidebarContent = (isFloating: boolean): React.ReactNode => (
    <div className={cn(
      "h-full flex flex-col bg-white",
      isFloating && !isCollapsed && "rounded-tr-2xl rounded-br-2xl shadow-xl border-r-0",
      isFloating && isCollapsed && "rounded-tr-xl rounded-br-xl",
      !isFloating && "border-r border-gray-100"
    )}>
      {/* Header with logo */}
      <div className={cn(
        'flex items-center min-h-[64px] px-4',
        isCollapsed ? 'justify-center' : 'justify-between'
      )}>
        {/* Logo */}
        <button
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-2 outline-none opacity-90 hover:opacity-100 transition-opacity duration-150"
        >
          <AnimatePresence mode="wait" initial={false}>
            {isCollapsed ? (
              <motion.img
                key="icon"
                src="/img/icon.png"
                alt="Gilbert"
                className="h-8 w-8 object-contain"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              />
            ) : (
              <motion.img
                key="logo"
                src="/img/logo_gilbert.png"
                alt="Gilbert"
                className="h-6 object-contain"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </button>

        {/* Close button (drawer mode) */}
        {useDrawerMode && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-gray-100/70 transition-colors duration-150"
          >
            <CloseIcon size={20} className="text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-gray-100" />

      {/* User section - Navigation directe vers /profile */}
      <div className={cn('py-3', isCollapsed ? 'px-2' : 'px-3')}>
        <UserProfileButton />
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-gray-100" />

      {/* Navigation */}
      <nav className={cn('flex-1 py-2', isCollapsed ? 'px-2' : 'px-3')}>
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.id} item={item} isActive={currentView === item.id} />
          ))}

          {/* Admin item */}
          {(import.meta.env.VITE_ADMIN_EMAILS || 'admin@lexiapro.fr').split(',').map((e: string) => e.trim().toLowerCase()).includes(user?.email?.toLowerCase()) && (
            <div className="pt-2 mt-2 border-t border-gray-100">
              <button
                onClick={() => handleNavClick('admin')}
                className={cn(
                  'w-full flex items-center rounded-xl transition-colors duration-150',
                  isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
                  currentView === 'admin'
                    ? 'bg-red-50 text-red-600'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'
                )}
              >
                <AdminIcon size={20} isActive={currentView === 'admin'} />
                {!isCollapsed && <span className="text-sm font-medium">Administration</span>}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Settings - En bas de la sidebar, position fixe */}
      <div className={cn('flex-shrink-0 py-2 border-t border-gray-100', isCollapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={() => {
            sounds.click();
            handleNavClick('settings');
          }}
          className={cn(
            'w-full flex items-center rounded-xl transition-colors duration-150',
            isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
            currentView === 'settings'
              ? 'bg-blue-50 text-blue-600'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'
          )}
        >
          <SettingsIcon size={20} isActive={currentView === 'settings'} />
          {!isCollapsed && <span className="text-sm font-medium">Paramètres</span>}
        </button>

        {/* Discovery Gauge - Sous les paramètres, cliquable vers settings */}
        <DiscoveryGauge />
      </div>

      {/* Footer - masqué en mode réduit pour éviter le saut du bouton Paramètres */}
      {!isCollapsed && (
        <div className="flex-shrink-0 border-t border-gray-100 p-4 text-center">
          <p className="text-[10px] text-gray-400">Propulsé par Lexia France</p>
          <p className="text-[9px] text-gray-300 mt-0.5">Version 1.1.2</p>
        </div>
      )}

    </div>
  );


  // ============================================================================
  // DRAWER RENDER (Mobile + Tablet)
  // ============================================================================

  if (useDrawerMode) {
    const drawerContent = (
      <>
        {/* Mobile/Tablet menu button */}
        <AnimatePresence>
          {!open && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => {
                sounds.softSlide();
                onToggle?.();
              }}
              style={{
                position: 'fixed',
                top: 16,
                left: 16,
                zIndex: 1100,
                padding: 10,
                backgroundColor: 'white',
                borderRadius: 12,
                border: '1px solid #f3f4f6',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MenuIcon size={22} className="text-gray-700" />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Backdrop */}
        <AnimatePresence>
          {open && (
            <motion.div
              variants={backdropVariants}
              initial="closed"
              animate="open"
              exit="closed"
              transition={{ duration: 0.2 }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1200,
                backgroundColor: 'rgba(0,0,0,0.25)',
                backdropFilter: 'blur(4px)',
              }}
              onClick={onToggle}
            />
          )}
        </AnimatePresence>

        {/* Drawer */}
        <AnimatePresence>
          {open && (
            <motion.div
              variants={mobileDrawerVariants}
              initial="closed"
              animate="open"
              exit="closed"
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                bottom: 0,
                zIndex: 1300,
                width: 280,
                boxShadow: '4px 0 24px rgba(0,0,0,0.12)',
                borderTopRightRadius: 20,
                borderBottomRightRadius: 20,
                overflow: 'hidden',
              }}
            >
              {buildSidebarContent(true)}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );

    return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
  }

  // ============================================================================
  // DESKTOP RENDER - Floating sidebar with integrated tab toggle
  // ============================================================================

  return (
    <>
      <motion.div
        variants={sidebarVariants}
        initial={false}
        animate={isCollapsed ? 'collapsed' : 'expanded'}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "relative h-screen flex-shrink-0",
          // Floating effect with shadow
          !isCollapsed && "shadow-[4px_0_24px_rgba(0,0,0,0.06)]"
        )}
        style={{
          // Rounded corners for floating effect
          borderTopRightRadius: isCollapsed ? 12 : 20,
          borderBottomRightRadius: isCollapsed ? 12 : 20,
          overflow: 'visible', // Allow toggle tab to overflow
        }}
      >
        {/* Main sidebar content */}
        <div className={cn(
          "h-full flex flex-col bg-white overflow-hidden",
          !isCollapsed && "rounded-tr-[20px] rounded-br-[20px]",
          isCollapsed && "rounded-tr-[12px] rounded-br-[12px]"
        )}>
          {buildSidebarContent(true)}
        </div>

        {/* Integrated toggle tab - Languette collée au bord */}
        {/* Afficher le bouton de collapse seulement si on n'est pas en mode drawer ET pas en enregistrement ET pas de dialog de sauvegarde */}
        {!useDrawerMode && !isRecording && !showSaveDialog && (
          <button
            onClick={handleToggleCollapse}
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              right: -20,
              zIndex: 1000,
              width: 20,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderLeft: 'none',
              borderRadius: '0 8px 8px 0',
              boxShadow: '2px 0 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              outline: 'none',
            }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'white';
          }}
        >
            {isCollapsed ? (
              <ChevronRightIcon size={14} className="text-gray-400" />
            ) : (
              <ChevronLeftIcon size={14} className="text-gray-400" />
            )}
          </button>
        )}
      </motion.div>
    </>
  );
};

export default Sidebar;
