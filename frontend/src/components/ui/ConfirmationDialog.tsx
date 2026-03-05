import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Portal } from '@mui/material';
import sounds from '../../utils/soundDesign';

// ============================================================================
// Types
// ============================================================================

export type ConfirmationDialogVariant = 'danger' | 'warning' | 'info' | 'default';

interface ParticleConfig {
  x: number;
  y: number;
  delay: number;
  colorIdx: number;
}

interface RippleConfig {
  scale: number;
  opacity: number;
  duration: number;
  delay: number;
  borderColor: string;
}

export interface ConfirmationDialogProps {
  /** Whether the dialog is shown */
  open: boolean;
  /** Called when the animation completes and the dialog closes */
  onClose?: () => void;
  /** Called when confirm action is triggered (alias for onClose in auto-dismiss mode) */
  onConfirm?: () => void;
  /** Title text displayed on card-style dialogs */
  title?: string;
  /** Description/subtitle text displayed on card-style dialogs */
  description?: string;
  /** Not used for auto-dismiss animations, kept for API compatibility */
  confirmText?: string;
  /** Not used for auto-dismiss animations, kept for API compatibility */
  cancelText?: string;
  /** Visual variant controlling colors, icon, particles, and sound */
  variant?: ConfirmationDialogVariant;

  // --- Advanced customization (used by wrappers) ---

  /** Display mode: 'card' shows backdrop + white card with text, 'icon' shows floating icon only */
  displayMode?: 'card' | 'icon';
  /** Primary color for the icon circle, ripples, and particles */
  primaryColor?: string;
  /** Secondary color for second ripple ring */
  secondaryColor?: string;
  /** Custom particle color palette */
  particleColors?: string[];
  /** Custom particle configs for precise positioning */
  particleConfigs?: ParticleConfig[];
  /** Custom ripple configurations */
  rippleConfigs?: RippleConfig[];
  /** Sound to play on show */
  soundType?: 'save' | 'delete' | 'discard' | 'none';
  /** Duration before auto-dismiss (ms) */
  dismissDelay?: number;
  /** Delay after dismiss before calling onClose (ms) */
  exitDelay?: number;
  /** Custom icon rendered inside the colored circle */
  icon?: React.ReactNode;
  /** Whether to show backdrop blur (card mode only) */
  showBackdrop?: boolean;
  /** Box shadow for the icon circle */
  iconShadow?: string;
  /** Size of the icon circle */
  iconSize?: number;
  /** Particle generation mode: 'radial' generates evenly spaced radial particles, 'fixed' uses particleConfigs */
  particleMode?: 'radial' | 'fixed';
  /** Number of radial particles (only for radial mode) */
  radialParticleCount?: number;
  /** Radial particle distance range [min, max] */
  radialParticleDistance?: [number, number];
  /** Particle size in px */
  particleSize?: number;
  /** Whether particles can be square (random shape) or always circular */
  particleRandomShape?: boolean;
  /** Particle animation duration */
  particleDuration?: number;
  /** Particle opacity keyframes */
  particleOpacity?: number[];
  /** Whether to use hasTriggeredRef guard (prevents re-trigger while animating) */
  useTriggeredGuard?: boolean;
}

// ============================================================================
// Variant presets
// ============================================================================

interface VariantPreset {
  primaryColor: string;
  secondaryColor: string;
  particleColors: string[];
  soundType: 'save' | 'delete' | 'discard' | 'none';
  dismissDelay: number;
  exitDelay: number;
  displayMode: 'card' | 'icon';
  iconShadow: string;
}

const VARIANT_PRESETS: Record<ConfirmationDialogVariant, VariantPreset> = {
  default: {
    primaryColor: '#10b981',
    secondaryColor: '#34D399',
    particleColors: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'],
    soundType: 'save',
    dismissDelay: 2200,
    exitDelay: 0,
    displayMode: 'card',
    iconShadow: 'none',
  },
  warning: {
    primaryColor: '#f59e0b',
    secondaryColor: '#fbbf24',
    particleColors: ['#f59e0b', '#fbbf24', '#d97706', '#fcd34d', '#f97316', '#fde68a'],
    soundType: 'discard',
    dismissDelay: 2000,
    exitDelay: 0,
    displayMode: 'card',
    iconShadow: 'none',
  },
  danger: {
    primaryColor: '#EF4444',
    secondaryColor: '#EF4444',
    particleColors: [],
    soundType: 'delete',
    dismissDelay: 1500,
    exitDelay: 400,
    displayMode: 'icon',
    iconShadow: '0 8px 32px rgba(239, 68, 68, 0.4)',
  },
  info: {
    primaryColor: '#3B82F6',
    secondaryColor: '#60A5FA',
    particleColors: ['#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4', '#EF4444', '#84CC16'],
    soundType: 'save',
    dismissDelay: 2500,
    exitDelay: 500,
    displayMode: 'icon',
    iconShadow: '0 8px 32px rgba(59, 130, 246, 0.4)',
  },
};

// ============================================================================
// Particle sub-components
// ============================================================================

/** Radial particle (used by card-mode dialogs like Save/Discard) */
const RadialParticle: React.FC<{
  delay: number;
  angle: number;
  distance: number;
  colors: string[];
  size?: number;
  randomShape?: boolean;
  duration?: number;
  opacityKeyframes?: number[];
}> = ({ delay, angle, distance, colors, size = 10, randomShape = true, duration = 1.2, opacityKeyframes }) => {
  const colorRef = useRef(colors[Math.floor(Math.random() * colors.length)]);
  const isRoundRef = useRef(Math.random() > 0.5);

  const radians = (angle * Math.PI) / 180;
  const endX = Math.cos(radians) * distance;
  const endY = Math.sin(radians) * distance;

  return (
    <motion.div
      initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
      animate={{
        opacity: opacityKeyframes || [0, 1, 1, 0],
        x: [0, endX * 0.3, endX * 0.7, endX],
        y: [0, endY * 0.3, endY * 0.7, endY],
        scale: [0, 1.2, 1, 0.3],
        rotate: [0, 180, 360, 540],
      }}
      transition={{
        duration,
        delay,
        ease: 'easeOut',
      }}
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: randomShape ? (isRoundRef.current ? '50%' : '2px') : '50%',
        backgroundColor: colorRef.current,
      }}
    />
  );
};

/** Warning-style radial particle with gravity effect */
const WarningRadialParticle: React.FC<{
  delay: number;
  angle: number;
  distance: number;
  colors: string[];
}> = ({ delay, angle, distance, colors }) => {
  const colorRef = useRef(colors[Math.floor(Math.random() * colors.length)]);
  const isRoundRef = useRef(Math.random() > 0.5);

  const radians = (angle * Math.PI) / 180;
  const endX = Math.cos(radians) * distance;
  const endY = Math.sin(radians) * distance;

  return (
    <motion.div
      initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
      animate={{
        opacity: [0, 0.8, 0.6, 0],
        x: [0, endX * 0.3, endX * 0.6, endX * 0.8],
        y: [0, endY * 0.3, endY * 0.8, endY * 1.2],
        scale: [0, 1, 0.8, 0.2],
        rotate: [0, 90, 180, 270],
      }}
      transition={{
        duration: 1.4,
        delay,
        ease: 'easeOut',
      }}
      style={{
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: isRoundRef.current ? '50%' : '2px',
        backgroundColor: colorRef.current,
      }}
    />
  );
};

/** Fixed-position particle (used by icon-mode dialogs) */
const FixedParticle: React.FC<{ config: ParticleConfig; colors: string[] }> = ({ config, colors }) => {
  const color = colors[config.colorIdx % colors.length];

  return (
    <motion.div
      initial={{ opacity: 0, y: 0, x: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 1, 1, 0],
        y: [0, config.y * 0.3, config.y * 0.6, config.y * 0.85, config.y],
        x: [0, config.x * 0.3, config.x * 0.6, config.x * 0.85, config.x],
        scale: [0, 1, 1.1, 1, 0.6],
        rotate: [0, 90, 180, 270, 360],
      }}
      transition={{
        duration: 1.4,
        delay: config.delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
      }}
    />
  );
};

// ============================================================================
// Default icons per variant
// ============================================================================

const DefaultCheckIcon: React.FC = () => (
  <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
    <motion.path
      d="M5 12l5 5L20 7"
      stroke="white"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
    />
  </svg>
);

const DefaultWarningIcon: React.FC = () => (
  <svg width="50" height="50" viewBox="0 0 24 24" fill="none">
    <motion.path
      d="M12 2L2 20h20L12 2z"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
    />
    <motion.line
      x1="12" y1="9" x2="12" y2="13"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ duration: 0.2, delay: 0.5, ease: 'easeOut' }}
    />
    <motion.circle
      cx="12" cy="16" r="1"
      fill="white"
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, delay: 0.65, ease: 'easeOut' }}
    />
  </svg>
);

function getDefaultIcon(variant: ConfirmationDialogVariant): React.ReactNode {
  switch (variant) {
    case 'warning':
      return <DefaultWarningIcon />;
    case 'default':
    case 'danger':
    case 'info':
    default:
      return <DefaultCheckIcon />;
  }
}

// ============================================================================
// Main component
// ============================================================================

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  variant = 'default',
  displayMode: displayModeProp,
  primaryColor: primaryColorProp,
  secondaryColor: secondaryColorProp,
  particleColors: particleColorsProp,
  particleConfigs: particleConfigsProp,
  rippleConfigs: rippleConfigsProp,
  soundType: soundTypeProp,
  dismissDelay: dismissDelayProp,
  exitDelay: exitDelayProp,
  icon: iconProp,
  showBackdrop: showBackdropProp,
  iconShadow: iconShadowProp,
  iconSize: iconSizeProp,
  particleMode: particleModeProp,
  radialParticleCount,
  radialParticleDistance,
  particleSize,
  particleRandomShape,
  particleDuration,
  particleOpacity,
  useTriggeredGuard: useTriggeredGuardProp,
}) => {
  const preset = VARIANT_PRESETS[variant];

  // Resolve all values: prop overrides > preset defaults
  const displayMode = displayModeProp ?? preset.displayMode;
  const primaryColor = primaryColorProp ?? preset.primaryColor;
  const secondaryColor = secondaryColorProp ?? preset.secondaryColor;
  const particleColors = particleColorsProp ?? preset.particleColors;
  const soundType = soundTypeProp ?? preset.soundType;
  const dismissDelay = dismissDelayProp ?? preset.dismissDelay;
  const exitDelay = exitDelayProp ?? preset.exitDelay;
  const iconNode = iconProp ?? getDefaultIcon(variant);
  const showBackdrop = showBackdropProp ?? (displayMode === 'card');
  const iconShadow = iconShadowProp ?? preset.iconShadow;
  const iconSize = iconSizeProp ?? (displayMode === 'card' ? 100 : 80);
  const particleMode = particleModeProp ?? (displayMode === 'card' ? 'radial' : 'fixed');
  const useTriggeredGuard = useTriggeredGuardProp ?? (displayMode === 'icon');

  const [isVisible, setIsVisible] = useState(false);
  const hasTriggeredRef = useRef(false);
  const onCompleteRef = useRef(onClose ?? onConfirm);

  useEffect(() => {
    onCompleteRef.current = onClose ?? onConfirm;
  }, [onClose, onConfirm]);

  // Generate radial particles
  const radialParticles = useMemo(() => {
    if (particleMode !== 'radial') return [];
    const count = radialParticleCount ?? (variant === 'warning' ? 20 : 24);
    const [minDist, maxDist] = radialParticleDistance ?? (variant === 'warning' ? [60, 110] : [80, 140]);
    const angleStep = 360 / count;
    const jitter = variant === 'warning' ? 12 : 10;
    return [...Array(count)].map((_, i) => ({
      angle: (i * angleStep) + (Math.random() * jitter - jitter / 2),
      distance: minDist + Math.random() * (maxDist - minDist),
      delay: i * (variant === 'warning' ? 0.025 : 0.02),
    }));
  }, [particleMode, radialParticleCount, radialParticleDistance, variant]);

  // Default ripple configs based on mode
  const rippleConfigs: RippleConfig[] = rippleConfigsProp ?? (displayMode === 'card'
    ? [{ scale: 2.5, opacity: 0.6, duration: 0.8, delay: 0.2, borderColor: primaryColor }]
    : [
        { scale: 2.2, opacity: 0.6, duration: 1, delay: 0, borderColor: primaryColor },
        { scale: 2.5, opacity: 0.4, duration: 1.3, delay: 0.15, borderColor: secondaryColor },
      ]);

  // Play sound and manage visibility
  useEffect(() => {
    if (useTriggeredGuard) {
      // Icon-mode pattern: guard against re-trigger
      if (open && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        setIsVisible(true);
        playValidationSound(soundType);

        const timer = setTimeout(() => {
          setIsVisible(false);
          setTimeout(() => {
            hasTriggeredRef.current = false;
            onCompleteRef.current?.();
          }, exitDelay);
        }, dismissDelay);

        return () => clearTimeout(timer);
      }
      if (!open) {
        hasTriggeredRef.current = false;
      }
    } else {
      // Card-mode pattern: simpler show/hide
      if (open) {
        setIsVisible(true);
        playValidationSound(soundType);

        const timer = setTimeout(() => {
          setIsVisible(false);
          onCompleteRef.current?.();
        }, dismissDelay);

        return () => clearTimeout(timer);
      }
    }
  }, [open, soundType, dismissDelay, exitDelay, useTriggeredGuard]);

  // ---- Card-mode rendering (SaveValidation / DiscardValidation style) ----
  if (displayMode === 'card') {
    return (
      <Portal>
        <AnimatePresence>
          {isVisible && (
            <>
              {/* Backdrop semi-transparent */}
              {showBackdrop && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9998,
                  }}
                />
              )}

              {/* Alert box centered */}
              <Box
                sx={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {/* White card */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: -10 }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 25,
                  }}
                  style={{
                    backgroundColor: 'white',
                    borderRadius: 24,
                    padding: '48px 56px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                    position: 'relative',
                    overflow: 'visible',
                  }}
                >
                  {/* Radial particles */}
                  {particleColors.length > 0 && (
                    <Box sx={{ position: 'absolute', top: '35%', left: '50%', pointerEvents: 'none' }}>
                      {variant === 'warning'
                        ? radialParticles.map((p, i) => (
                            <WarningRadialParticle
                              key={i}
                              delay={p.delay}
                              angle={p.angle}
                              distance={p.distance}
                              colors={particleColors}
                            />
                          ))
                        : radialParticles.map((p, i) => (
                            <RadialParticle
                              key={i}
                              delay={p.delay}
                              angle={p.angle}
                              distance={p.distance}
                              colors={particleColors}
                              size={particleSize}
                              randomShape={particleRandomShape}
                              duration={particleDuration}
                              opacityKeyframes={particleOpacity}
                            />
                          ))}
                    </Box>
                  )}

                  {/* Icon circle */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 20,
                      delay: 0.1,
                    }}
                    style={{
                      width: iconSize,
                      height: iconSize,
                      borderRadius: '50%',
                      backgroundColor: primaryColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 24,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {iconNode}

                    {/* Ripple effect */}
                    {rippleConfigs.map((ripple, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 1, opacity: ripple.opacity }}
                        animate={{ scale: ripple.scale, opacity: 0 }}
                        transition={{ duration: ripple.duration, delay: ripple.delay, ease: 'easeOut' }}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          borderRadius: '50%',
                          border: `3px solid ${ripple.borderColor}`,
                        }}
                      />
                    ))}
                  </motion.div>

                  {/* Title */}
                  {title && (
                    <motion.h2
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      style={{
                        margin: 0,
                        fontSize: 24,
                        fontWeight: 600,
                        color: '#1e293b',
                        textAlign: 'center',
                      }}
                    >
                      {title}
                    </motion.h2>
                  )}

                  {/* Description */}
                  {description && (
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      style={{
                        margin: '8px 0 0 0',
                        fontSize: 15,
                        color: '#64748b',
                        textAlign: 'center',
                      }}
                    >
                      {description}
                    </motion.p>
                  )}
                </motion.div>
              </Box>
            </>
          )}
        </AnimatePresence>
      </Portal>
    );
  }

  // ---- Icon-mode rendering (Delete/Share/Import/Summary/Export style) ----
  return (
    <Portal>
      <AnimatePresence>
        {isVisible && (
          <Box
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            {/* Fixed-position particles */}
            {particleConfigsProp && particleColors.length > 0 && (
              <Box sx={{ position: 'absolute', top: '50%', left: '50%' }}>
                {particleConfigsProp.map((config, i) => (
                  <FixedParticle key={i} config={config} colors={particleColors} />
                ))}
              </Box>
            )}

            {/* Icon circle */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 15,
                opacity: { duration: iconShadow !== 'none' ? 0.6 : 0.5, ease: 'easeOut' },
              }}
              style={{
                width: iconSize,
                height: iconSize,
                borderRadius: '50%',
                backgroundColor: primaryColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: iconShadow,
              }}
            >
              {iconNode}
            </motion.div>

            {/* Ripple effects */}
            {rippleConfigs.map((ripple, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0.8, opacity: ripple.opacity }}
                animate={{ scale: ripple.scale, opacity: 0 }}
                transition={{ duration: ripple.duration, delay: ripple.delay, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: iconSize,
                  height: iconSize,
                  marginTop: -(iconSize / 2),
                  marginLeft: -(iconSize / 2),
                  borderRadius: '50%',
                  border: `2px solid ${ripple.borderColor}`,
                }}
              />
            ))}
          </Box>
        )}
      </AnimatePresence>
    </Portal>
  );
};

// ============================================================================
// Helpers
// ============================================================================

function playValidationSound(soundType: 'save' | 'delete' | 'discard' | 'none') {
  switch (soundType) {
    case 'save':
      sounds.save();
      break;
    case 'delete':
      sounds.delete();
      break;
    case 'discard':
      sounds.discard();
      break;
    case 'none':
    default:
      break;
  }
}

export default ConfirmationDialog;
