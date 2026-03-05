import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import ConfirmationDialog from './ConfirmationDialog';

interface ExportValidationProps {
  show: boolean;
  onComplete?: () => void;
}

const PARTICLE_CONFIGS = [
  { x: 40, y: -85, delay: 0, colorIdx: 0 },
  { x: -45, y: -95, delay: 0.05, colorIdx: 1 },
  { x: 55, y: -65, delay: 0.1, colorIdx: 2 },
  { x: -60, y: -75, delay: 0.15, colorIdx: 3 },
  { x: 30, y: -105, delay: 0.2, colorIdx: 4 },
  { x: -35, y: -90, delay: 0.25, colorIdx: 5 },
  { x: 65, y: -80, delay: 0.3, colorIdx: 6 },
  { x: -50, y: -100, delay: 0.35, colorIdx: 7 },
  { x: 45, y: -70, delay: 0.12, colorIdx: 0 },
  { x: -55, y: -85, delay: 0.22, colorIdx: 2 },
];

const COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B',
  '#EC4899', '#06B6D4', '#EF4444', '#84CC16',
];

const ExportIcon = (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 15 }}
  >
    <Check size={40} color="white" strokeWidth={3} />
  </motion.div>
);

const ExportValidation: React.FC<ExportValidationProps> = ({ show, onComplete }) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      variant="info"
      displayMode="icon"
      primaryColor="#10B981"
      secondaryColor="#34D399"
      particleColors={COLORS}
      particleConfigs={PARTICLE_CONFIGS}
      iconShadow="0 8px 32px rgba(16, 185, 129, 0.4)"
      icon={ExportIcon}
      soundType="save"
      dismissDelay={2500}
      exitDelay={500}
      useTriggeredGuard={true}
      rippleConfigs={[
        { scale: 2.2, opacity: 0.6, duration: 1, delay: 0, borderColor: '#10B981' },
        { scale: 2.5, opacity: 0.4, duration: 1.3, delay: 0.15, borderColor: '#34D399' },
      ]}
    />
  );
};

export default ExportValidation;
