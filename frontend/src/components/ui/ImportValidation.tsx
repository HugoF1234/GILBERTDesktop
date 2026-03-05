import React from 'react';
import { motion } from 'framer-motion';
import ConfirmationDialog from './ConfirmationDialog';

interface ImportValidationProps {
  show: boolean;
  onComplete?: () => void;
}

const PARTICLE_CONFIGS = [
  { x: 35, y: -80, delay: 0, colorIdx: 0 },
  { x: -40, y: -90, delay: 0.05, colorIdx: 1 },
  { x: 50, y: -60, delay: 0.1, colorIdx: 2 },
  { x: -55, y: -70, delay: 0.15, colorIdx: 3 },
  { x: 25, y: -100, delay: 0.2, colorIdx: 4 },
  { x: -30, y: -85, delay: 0.25, colorIdx: 0 },
  { x: 60, y: -75, delay: 0.3, colorIdx: 1 },
  { x: -45, y: -95, delay: 0.35, colorIdx: 2 },
];

const COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#2563eb', '#1d4ed8'];

// Custom animated import icon matching the original exactly
const AnimatedImportIcon: React.FC = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
    <motion.path
      d="M4 17h16"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
    />
    <motion.path
      d="M12 3v10"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.4, delay: 0, ease: [0.22, 1, 0.36, 1] }}
    />
    <motion.path
      d="M8 9l4 4 4-4"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
    />
  </svg>
);

const ImportValidation: React.FC<ImportValidationProps> = ({ show, onComplete }) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      variant="info"
      displayMode="icon"
      primaryColor="#3b82f6"
      secondaryColor="#60a5fa"
      particleColors={COLORS}
      particleConfigs={PARTICLE_CONFIGS}
      iconShadow="0 8px 32px rgba(59, 130, 246, 0.4)"
      icon={<AnimatedImportIcon />}
      soundType="save"
      dismissDelay={2500}
      exitDelay={500}
      useTriggeredGuard={true}
      rippleConfigs={[
        { scale: 2.2, opacity: 0.6, duration: 1, delay: 0, borderColor: '#3b82f6' },
        { scale: 2.5, opacity: 0.4, duration: 1.3, delay: 0.15, borderColor: '#60a5fa' },
      ]}
    />
  );
};

export default ImportValidation;
