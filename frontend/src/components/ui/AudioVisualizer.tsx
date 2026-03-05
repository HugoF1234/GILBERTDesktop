import React, { useEffect, useState } from 'react';
import { Box, alpha } from '@mui/material';

interface AudioVisualizerProps {
  isActive?: boolean;
  audioLevel?: number; // 0-1
  variant?: 'bars' | 'circle' | 'wave';
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}

/**
 * AudioVisualizer - Visual feedback for microphone input
 * Shows animated bars/circles based on audio level
 */
export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  isActive = false,
  audioLevel = 0,
  variant = 'bars',
  size = 'md',
  color = '#3B82F6',
}) => {
  const [levels, setLevels] = useState<number[]>([0.2, 0.3, 0.4, 0.3, 0.2]);

  // Animate levels based on audio input
  useEffect(() => {
    if (!isActive) {
      setLevels([0.2, 0.3, 0.4, 0.3, 0.2]);
      return;
    }

    const interval = setInterval(() => {
      setLevels((prev) =>
        prev.map((_, i) => {
          const baseLevel = audioLevel || 0.5;
          const variation = Math.random() * 0.4 - 0.2;
          return Math.max(0.15, Math.min(1, baseLevel + variation + Math.sin(Date.now() / 200 + i) * 0.2));
        })
      );
    }, 50);

    return () => clearInterval(interval);
  }, [isActive, audioLevel]);

  // Size configurations
  const sizeConfig = {
    sm: { barWidth: 3, barGap: 2, maxHeight: 24 },
    md: { barWidth: 4, barGap: 3, maxHeight: 32 },
    lg: { barWidth: 6, barGap: 4, maxHeight: 48 },
  };

  const config = sizeConfig[size];

  if (variant === 'bars') {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: `${config.barGap}px`,
          height: config.maxHeight,
        }}
      >
        {levels.map((level, i) => (
          <Box
            key={i}
            sx={{
              width: config.barWidth,
              height: `${Math.max(4, level * config.maxHeight)}px`,
              borderRadius: config.barWidth / 2,
              bgcolor: isActive ? color : alpha(color, 0.3),
              transition: 'height 50ms ease-out, background-color 200ms ease',
              transformOrigin: 'center',
            }}
          />
        ))}
      </Box>
    );
  }

  if (variant === 'circle') {
    const circleSize = size === 'sm' ? 48 : size === 'md' ? 64 : 96;
    const baseScale = 1;
    const activeScale = 1 + audioLevel * 0.3;

    return (
      <Box
        sx={{
          position: 'relative',
          width: circleSize,
          height: circleSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Outer pulse ring */}
        {isActive && (
          <Box
            sx={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: `2px solid ${alpha(color, 0.3)}`,
              animation: 'pulseRing 1.5s ease-out infinite',
              '@keyframes pulseRing': {
                '0%': { transform: 'scale(1)', opacity: 0.8 },
                '100%': { transform: 'scale(1.5)', opacity: 0 },
              },
            }}
          />
        )}
        {/* Level indicator ring */}
        <Box
          sx={{
            position: 'absolute',
            width: `${(baseScale + audioLevel * 0.4) * 100}%`,
            height: `${(baseScale + audioLevel * 0.4) * 100}%`,
            borderRadius: '50%',
            bgcolor: alpha(color, 0.15),
            transition: 'all 100ms ease-out',
          }}
        />
        {/* Main circle */}
        <Box
          sx={{
            width: '70%',
            height: '70%',
            borderRadius: '50%',
            bgcolor: isActive ? color : alpha(color, 0.2),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 200ms ease',
            transform: isActive ? `scale(${activeScale})` : 'scale(1)',
            boxShadow: isActive
              ? `0 0 20px ${alpha(color, 0.4)}, 0 0 40px ${alpha(color, 0.2)}`
              : 'none',
          }}
        />
      </Box>
    );
  }

  // Wave variant
  if (variant === 'wave') {
    const waveCount = 7;
    const waveHeight = size === 'sm' ? 24 : size === 'md' ? 36 : 48;

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          height: waveHeight,
        }}
      >
        {Array.from({ length: waveCount }).map((_, i) => {
          const delay = i * 0.1;
          const height = isActive
            ? Math.max(4, levels[i % levels.length] * waveHeight)
            : 4;

          return (
            <Box
              key={i}
              sx={{
                width: 3,
                height,
                borderRadius: 1.5,
                bgcolor: isActive ? color : alpha(color, 0.3),
                transition: 'height 80ms ease-out',
                animation: isActive
                  ? `wave 0.8s ease-in-out infinite ${delay}s`
                  : 'none',
                '@keyframes wave': {
                  '0%, 100%': { transform: 'scaleY(0.4)' },
                  '50%': { transform: 'scaleY(1)' },
                },
              }}
            />
          );
        })}
      </Box>
    );
  }

  return null;
};

/**
 * MicrophoneIndicator - Shows microphone status with visual feedback
 */
interface MicrophoneIndicatorProps {
  status: 'idle' | 'active' | 'speaking' | 'muted' | 'error';
  audioLevel?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export const MicrophoneIndicator: React.FC<MicrophoneIndicatorProps> = ({
  status,
  audioLevel = 0,
  size = 'md',
  showLabel = false,
}) => {
  const sizeConfig = {
    sm: { iconSize: 16, containerSize: 32 },
    md: { iconSize: 24, containerSize: 48 },
    lg: { iconSize: 32, containerSize: 64 },
  };

  const config = sizeConfig[size];

  const statusConfig = {
    idle: {
      bgcolor: '#F3F4F6',
      color: '#6B7280',
      label: 'Prêt',
    },
    active: {
      bgcolor: '#EF4444',
      color: '#FFFFFF',
      label: 'Enregistrement',
    },
    speaking: {
      bgcolor: '#10B981',
      color: '#FFFFFF',
      label: 'Parole détectée',
    },
    muted: {
      bgcolor: '#F59E0B',
      color: '#FFFFFF',
      label: 'Micro coupé',
    },
    error: {
      bgcolor: '#DC2626',
      color: '#FFFFFF',
      label: 'Erreur micro',
    },
  };

  const currentConfig = statusConfig[status];
  const isRecording = status === 'active' || status === 'speaking';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          position: 'relative',
          width: config.containerSize,
          height: config.containerSize,
          borderRadius: '50%',
          bgcolor: currentConfig.bgcolor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isRecording ? `scale(${1 + audioLevel * 0.15})` : 'scale(1)',
          boxShadow: isRecording
            ? `0 0 0 ${4 + audioLevel * 8}px ${alpha(currentConfig.bgcolor, 0.2)}`
            : 'none',
        }}
      >
        {/* Recording pulse effect */}
        {isRecording && (
          <Box
            sx={{
              position: 'absolute',
              inset: -4,
              borderRadius: '50%',
              border: `2px solid ${alpha(currentConfig.bgcolor, 0.5)}`,
              animation: 'pulseRing 2s ease-out infinite',
              '@keyframes pulseRing': {
                '0%': { transform: 'scale(1)', opacity: 0.8 },
                '100%': { transform: 'scale(1.4)', opacity: 0 },
              },
            }}
          />
        )}
        {/* Mic icon */}
        <svg
          width={config.iconSize}
          height={config.iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke={currentConfig.color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
          {status === 'muted' && (
            <line x1="4" y1="4" x2="20" y2="20" stroke="#FFFFFF" strokeWidth={2.5} />
          )}
        </svg>
      </Box>

      {showLabel && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.25,
            borderRadius: '4px',
            bgcolor: alpha(currentConfig.bgcolor, 0.1),
          }}
        >
          {isRecording && (
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: currentConfig.bgcolor,
                animation: 'pulse 1s infinite',
                '@keyframes pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.5 },
                },
              }}
            />
          )}
          <Box
            component="span"
            sx={{
              fontSize: '0.7rem',
              fontWeight: 600,
              color: currentConfig.bgcolor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {currentConfig.label}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default AudioVisualizer;
