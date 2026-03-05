import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedIconProps {
  size?: number;
  className?: string;
  isActive?: boolean;
}

// Animated Document/Transcription Icon
export const AnimatedDocumentIcon: React.FC<AnimatedIconProps> = ({
  size = 20,
  className = '',
  isActive = false,
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover="hover"
      initial="rest"
      animate={isActive ? 'active' : 'rest'}
    >
      {/* Document outline */}
      <motion.path
        d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
        variants={{
          rest: { scale: 1 },
          hover: { scale: 1.02 },
          active: { scale: 1.02 },
        }}
        transition={{ duration: 0.2 }}
      />
      {/* Folded corner */}
      <motion.polyline
        points="14 2 14 8 20 8"
        variants={{
          rest: { opacity: 0.8 },
          hover: { opacity: 1 },
          active: { opacity: 1 },
        }}
        transition={{ duration: 0.2 }}
      />
      {/* Text lines - animate when active */}
      <motion.line
        x1="8"
        y1="13"
        x2="16"
        y2="13"
        variants={{
          rest: { x2: 16, opacity: 0.8 },
          hover: { x2: 14, opacity: 1 },
          active: { x2: 14, opacity: 1 },
        }}
        transition={{ duration: 0.3 }}
      />
      <motion.line
        x1="8"
        y1="17"
        x2="16"
        y2="17"
        variants={{
          rest: { x2: 16, opacity: 0.8 },
          hover: { x2: 12, opacity: 1 },
          active: { x2: 12, opacity: 1 },
        }}
        transition={{ duration: 0.3, delay: 0.05 }}
      />
    </motion.svg>
  );
};

// Animated Summary/Lightbulb Icon
export const AnimatedSummaryIcon: React.FC<AnimatedIconProps> = ({
  size = 20,
  className = '',
  isActive = false,
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover="hover"
      initial="rest"
      animate={isActive ? 'active' : 'rest'}
    >
      {/* Lightbulb body */}
      <motion.path
        d="M9 18h6"
        variants={{
          rest: { opacity: 0.8 },
          hover: { opacity: 1 },
          active: { opacity: 1 },
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        d="M10 22h4"
        variants={{
          rest: { opacity: 0.8 },
          hover: { opacity: 1 },
          active: { opacity: 1 },
        }}
        transition={{ duration: 0.2 }}
      />
      {/* Bulb */}
      <motion.path
        d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
        variants={{
          rest: { scale: 1 },
          hover: { scale: 1.05 },
          active: { scale: 1.05 },
        }}
        transition={{ duration: 0.3, type: 'spring', stiffness: 300 }}
        style={{ transformOrigin: '12px 10px' }}
      />
      {/* Light rays - visible on hover and when active */}
      <motion.line
        x1="12" y1="2" x2="12" y2="3"
        variants={{
          rest: { opacity: 0, y: 0 },
          hover: { opacity: 1, y: -1 },
          active: { opacity: 1, y: -1 },
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.line
        x1="4.22" y1="4.22" x2="5.64" y2="5.64"
        variants={{
          rest: { opacity: 0 },
          hover: { opacity: 1 },
          active: { opacity: 1 },
        }}
        transition={{ duration: 0.2, delay: 0.05 }}
      />
      <motion.line
        x1="19.78" y1="4.22" x2="18.36" y2="5.64"
        variants={{
          rest: { opacity: 0 },
          hover: { opacity: 1 },
          active: { opacity: 1 },
        }}
        transition={{ duration: 0.2, delay: 0.05 }}
      />
    </motion.svg>
  );
};

// Animated Refresh Icon
export const AnimatedRefreshIcon: React.FC<AnimatedIconProps> = ({
  size = 16,
  className = '',
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover={{ rotate: 180 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </motion.svg>
  );
};

// Animated Edit Icon
export const AnimatedEditIcon: React.FC<AnimatedIconProps> = ({
  size = 16,
  className = '',
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover="hover"
      initial="rest"
      animate="rest"
    >
      <motion.path
        d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
        variants={{
          rest: { x: 0, y: 0 },
          hover: { x: -1, y: 1 },
        }}
        transition={{ duration: 0.2 }}
      />
      <motion.path
        d="m15 5 4 4"
        variants={{
          rest: { x: 0, y: 0 },
          hover: { x: -1, y: 1 },
        }}
        transition={{ duration: 0.2 }}
      />
    </motion.svg>
  );
};

// Animated Download Icon
export const AnimatedDownloadIcon: React.FC<AnimatedIconProps> = ({
  size = 18,
  className = '',
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover="hover"
      initial="rest"
      animate="rest"
    >
      <motion.path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
      />
      <motion.polyline
        points="7 10 12 15 17 10"
        variants={{
          rest: { y: 0 },
          hover: { y: 2 },
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
      <motion.line
        x1="12"
        y1="15"
        x2="12"
        y2="3"
        variants={{
          rest: { y: 0 },
          hover: { y: 2 },
        }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      />
    </motion.svg>
  );
};

// Animated Generation/AI Icon - Spinning brain with sparkles
export const AnimatedGenerationIcon: React.FC<AnimatedIconProps & { loop?: boolean }> = ({
  size = 20,
  className = '',
  isActive = true,
  loop = true,
}) => {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={isActive ? 'active' : 'rest'}
    >
      {/* Central sparkle/star */}
      <motion.path
        d="M12 3v2M12 19v2M3 12h2M19 12h2"
        variants={{
          rest: { opacity: 0.4, scale: 0.9 },
          active: { opacity: 1, scale: 1 },
        }}
        animate={loop ? {
          opacity: [0.4, 1, 0.4],
          scale: [0.9, 1.1, 0.9],
        } : undefined}
        transition={loop ? {
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        } : { duration: 0.3 }}
      />
      {/* Diagonal rays */}
      <motion.path
        d="M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41"
        variants={{
          rest: { opacity: 0.3, rotate: 0 },
          active: { opacity: 0.8, rotate: 45 },
        }}
        animate={loop ? {
          opacity: [0.3, 0.8, 0.3],
          rotate: [0, 15, 0],
        } : undefined}
        transition={loop ? {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.3,
        } : { duration: 0.3 }}
        style={{ transformOrigin: '12px 12px' }}
      />
      {/* Center circle */}
      <motion.circle
        cx="12"
        cy="12"
        r="4"
        animate={loop ? {
          scale: [1, 1.15, 1],
          opacity: [0.8, 1, 0.8],
        } : undefined}
        variants={{
          rest: { scale: 1 },
          active: { scale: 1.1 },
        }}
        transition={loop ? {
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
        } : { duration: 0.3 }}
        style={{ transformOrigin: '12px 12px' }}
      />
      {/* Inner dot */}
      <motion.circle
        cx="12"
        cy="12"
        r="1.5"
        fill="currentColor"
        stroke="none"
        animate={loop ? {
          scale: [1, 0.7, 1],
        } : undefined}
        transition={loop ? {
          duration: 1.2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.1,
        } : { duration: 0.3 }}
        style={{ transformOrigin: '12px 12px' }}
      />
    </motion.svg>
  );
};

export default {
  AnimatedDocumentIcon,
  AnimatedSummaryIcon,
  AnimatedRefreshIcon,
  AnimatedEditIcon,
  AnimatedDownloadIcon,
  AnimatedGenerationIcon,
};
