import React from 'react';
import { Box } from '@mui/material';

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
  className?: string;
}

/**
 * Skeleton - Loading placeholder component
 * Provides smooth, elegant loading states with shimmer animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width = '100%',
  height,
  animation = 'wave',
  className,
}) => {
  const getHeight = (): string | number => {
    if (height) return height;
    if (variant === 'text') return '1em';
    if (variant === 'circular') return width;
    return 'auto';
  };

  const getBorderRadius = (): string => {
    switch (variant) {
      case 'circular':
        return '50%';
      case 'rounded':
        return '8px';
      case 'rectangular':
        return '0';
      default:
        return '4px';
    }
  };

  const animationStyles = {
    pulse: {
      animation: 'pulse 1.5s ease-in-out infinite',
      '@keyframes pulse': {
        '0%, 100%': { opacity: 1 },
        '50%': { opacity: 0.4 },
      },
    },
    wave: {
      position: 'relative' as const,
      overflow: 'hidden',
      '&::after': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent)',
        animation: 'shimmer 1.5s infinite',
      },
      '@keyframes shimmer': {
        '0%': { transform: 'translateX(-100%)' },
        '100%': { transform: 'translateX(100%)' },
      },
    },
    none: {},
  };

  return (
    <Box
      className={className}
      sx={{
        width,
        height: getHeight(),
        borderRadius: getBorderRadius(),
        bgcolor: '#E5E7EB',
        ...animationStyles[animation],
      }}
    />
  );
};

/**
 * MeetingCardSkeleton - Loading state for meeting cards
 */
export const MeetingCardSkeleton: React.FC = () => {
  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '16px',
        border: '1px solid #E5E7EB',
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="70%" height={24} />
          <Skeleton variant="text" width="40%" height={16} />
        </Box>
        <Skeleton variant="circular" width={32} height={32} />
      </Box>

      {/* Status chips */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Skeleton variant="rounded" width={80} height={24} />
        <Skeleton variant="rounded" width={60} height={24} />
      </Box>

      {/* Footer */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Skeleton variant="text" width={60} height={14} />
          <Skeleton variant="text" width={80} height={14} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Skeleton variant="circular" width={28} height={28} />
          <Skeleton variant="circular" width={28} height={28} />
        </Box>
      </Box>
    </Box>
  );
};

/**
 * MeetingListSkeleton - Loading state for meeting list
 */
export const MeetingListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Date header */}
      <Skeleton variant="text" width={150} height={20} />

      {/* Meeting cards */}
      {Array.from({ length: count }).map((_, i) => (
        <MeetingCardSkeleton key={i} />
      ))}
    </Box>
  );
};

/**
 * TranscriptSkeleton - Loading state for transcript view
 */
export const TranscriptSkeleton: React.FC = () => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 2 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 2 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={120} height={16} />
            <Skeleton variant="text" width="100%" height={20} />
            <Skeleton variant="text" width="85%" height={20} />
            <Skeleton variant="text" width="70%" height={20} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};

/**
 * SummarySkeleton - Loading state for summary view
 */
export const SummarySkeleton: React.FC = () => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, p: 3 }}>
      {/* Title */}
      <Box>
        <Skeleton variant="text" width={200} height={28} />
        <Skeleton variant="text" width={300} height={16} />
      </Box>

      {/* Sections */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Box key={i} sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Skeleton variant="text" width={180} height={22} />
          <Skeleton variant="text" width="100%" height={16} />
          <Skeleton variant="text" width="95%" height={16} />
          <Skeleton variant="text" width="80%" height={16} />
        </Box>
      ))}

      {/* Action items */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Skeleton variant="text" width={150} height={22} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Skeleton variant="circular" width={20} height={20} />
            <Skeleton variant="text" width={`${70 + Math.random() * 20}%`} height={16} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

/**
 * SpeakersSkeleton - Loading state for speakers list
 */
export const SpeakersSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 2,
            borderRadius: '12px',
            bgcolor: '#F9FAFB',
          }}
        >
          <Skeleton variant="circular" width={36} height={36} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={18} />
            <Skeleton variant="text" width={60} height={14} />
          </Box>
          <Skeleton variant="rounded" width={80} height={32} />
        </Box>
      ))}
    </Box>
  );
};

/**
 * TemplateCardSkeleton - Loading state for template cards
 */
export const TemplateCardSkeleton: React.FC = () => {
  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '12px',
        border: '1px solid #E5E7EB',
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Skeleton variant="rounded" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={18} />
          <Skeleton variant="text" width="40%" height={14} />
        </Box>
      </Box>
      <Skeleton variant="text" width="100%" height={14} />
      <Skeleton variant="text" width="80%" height={14} />
    </Box>
  );
};

/**
 * PageHeaderSkeleton - Loading state for page headers
 */
export const PageHeaderSkeleton: React.FC = () => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 4 }}>
      <Skeleton variant="text" width={250} height={36} />
      <Skeleton variant="text" width={400} height={18} />
    </Box>
  );
};

/**
 * SidebarSkeleton - Loading state for sidebar
 */
export const SidebarSkeleton: React.FC = () => {
  return (
    <Box
      sx={{
        width: 260,
        height: '100vh',
        bgcolor: 'white',
        borderRight: '1px solid #E5E7EB',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Logo */}
      <Skeleton variant="rounded" width={120} height={28} />

      {/* User */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
        <Skeleton variant="circular" width={40} height={40} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="80%" height={16} />
          <Skeleton variant="text" width="60%" height={12} />
        </Box>
      </Box>

      {/* Nav items */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" width="100%" height={44} />
        ))}
      </Box>
    </Box>
  );
};

/**
 * ProfilePageSkeleton - Loading state for profile page
 */
export const ProfilePageSkeleton: React.FC = () => {
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 4 }}>
      {/* Avatar et nom */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
        <Skeleton variant="circular" width={100} height={100} />
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Skeleton variant="text" width={180} height={32} />
          <Skeleton variant="text" width={200} height={18} />
        </Box>
        <Skeleton variant="rounded" width={160} height={36} />
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 4 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Box
            key={i}
            sx={{
              bgcolor: 'white',
              borderRadius: '12px',
              border: '1px solid #E5E7EB',
              p: 2,
              textAlign: 'center',
            }}
          >
            <Skeleton variant="circular" width={24} height={24} />
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="text" width="80%" height={14} />
          </Box>
        ))}
      </Box>

      {/* Plan */}
      <Box
        sx={{
          bgcolor: 'white',
          borderRadius: '12px',
          border: '1px solid #E5E7EB',
          p: 3,
          mb: 4,
        }}
      >
        <Skeleton variant="text" width={120} height={24} />
        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="rounded" width="100%" height={140} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="rounded" width="100%" height={140} />
          </Box>
        </Box>
      </Box>

      {/* Contacts + Infos */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 3 }}>
        <Box
          sx={{
            bgcolor: 'white',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            p: 3,
          }}
        >
          <Skeleton variant="text" width={100} height={22} />
          {Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" width="70%" height={16} />
                <Skeleton variant="text" width="50%" height={12} />
              </Box>
            </Box>
          ))}
        </Box>
        <Box
          sx={{
            bgcolor: 'white',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            p: 3,
          }}
        >
          <Skeleton variant="text" width={150} height={22} />
          {Array.from({ length: 2 }).map((_, i) => (
            <Box key={i} sx={{ mt: 2, p: 2, bgcolor: '#F9FAFB', borderRadius: '8px' }}>
              <Skeleton variant="text" width="40%" height={12} />
              <Skeleton variant="text" width="70%" height={18} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};

export default Skeleton;
