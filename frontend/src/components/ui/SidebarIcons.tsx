'use client';

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface IconProps {
  size?: number;
  className?: string;
  isActive?: boolean;
  color?: string;
}

// ============================================================================
// MICROPHONE ICON - For "Enregistrer"
// ============================================================================

export const MicrophoneIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M12 18.5V22" />
      <path d="M8 22h8" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
    </svg>
  );
};

// ============================================================================
// LIST ICON - For "Mes échanges"
// ============================================================================

export const ListIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
    </svg>
  );
};

// ============================================================================
// COMMUNITY ICON - For "Partages" (3 people)
// ============================================================================

export const ShareIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Center person (main) */}
      <circle cx="12" cy="7" r="3" />
      <path d="M12 14c-3.87 0-7 2.69-7 6h14c0-3.31-3.13-6-7-6z" />
      {/* Left person (smaller, behind) */}
      <circle cx="5" cy="9" r="2" strokeWidth="1.5" opacity="0.6" />
      <path d="M5 13c-2.5 0-4.5 1.79-4.5 4h5" strokeWidth="1.5" opacity="0.6" />
      {/* Right person (smaller, behind) */}
      <circle cx="19" cy="9" r="2" strokeWidth="1.5" opacity="0.6" />
      <path d="M19 13c2.5 0 4.5 1.79 4.5 4h-5" strokeWidth="1.5" opacity="0.6" />
    </svg>
  );
};

// ============================================================================
// TEMPLATE ICON - For "Templates"
// ============================================================================

export const TemplateIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
};

// ============================================================================
// SETTINGS ICON - For menu
// ============================================================================

export const SettingsIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
};

// ============================================================================
// ADMIN ICON - For admin menu
// ============================================================================

export const AdminIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
};

// ============================================================================
// USER ICON - For profile
// ============================================================================

export const UserIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </svg>
  );
};

// ============================================================================
// LOGOUT ICON - For logout
// ============================================================================

export const LogoutIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
};

// ============================================================================
// CHEVRON ICONS - For collapse/expand
// ============================================================================

export const ChevronLeftIcon: React.FC<IconProps> = ({
  size = 18,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
};

export const ChevronRightIcon: React.FC<IconProps> = ({
  size = 18,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
};

// ============================================================================
// MENU ICON - For mobile hamburger (with CSS-based open/close transition)
// ============================================================================

export const MenuIcon: React.FC<IconProps & { isOpen?: boolean }> = ({
  size = 22,
  className = '',
  isOpen = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line
        x1="4"
        y1="6"
        x2="20"
        y2="6"
        style={{
          transformOrigin: '12px 6px',
          transform: isOpen ? 'rotate(45deg) translateY(6px)' : 'none',
          transition: 'transform 0.2s ease',
        }}
      />
      <line
        x1="4"
        y1="12"
        x2="20"
        y2="12"
        style={{
          opacity: isOpen ? 0 : 1,
          transition: 'opacity 0.2s ease',
        }}
      />
      <line
        x1="4"
        y1="18"
        x2="20"
        y2="18"
        style={{
          transformOrigin: '12px 18px',
          transform: isOpen ? 'rotate(-45deg) translateY(-6px)' : 'none',
          transition: 'transform 0.2s ease',
        }}
      />
    </svg>
  );
};

// ============================================================================
// DICTIONARY ICON - For "Mon Dictionnaire"
// ============================================================================

export const DictionaryIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h6" />
    </svg>
  );
};

// ============================================================================
// CLOSE ICON - For closing panels
// ============================================================================

export const CloseIcon: React.FC<IconProps> = ({
  size = 22,
  className = '',
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
};

export default {
  MicrophoneIcon,
  ListIcon,
  ShareIcon,
  TemplateIcon,
  SettingsIcon,
  AdminIcon,
  UserIcon,
  LogoutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DictionaryIcon,
  MenuIcon,
  CloseIcon,
};
