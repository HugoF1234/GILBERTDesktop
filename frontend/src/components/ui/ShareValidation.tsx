import React from 'react';
import { motion } from 'framer-motion';
import { Share2 } from 'lucide-react';
import ConfirmationDialog from './ConfirmationDialog';

interface ShareValidationProps {
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
];

const COLORS = [
  '#10B981', '#34D399', '#059669', '#047857',
  '#6EE7B7', '#5EEAD4', '#2DD4BF', '#14B8A6',
];

const ShareIcon = (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 15 }}
  >
    <Share2 size={36} color="white" strokeWidth={2.5} />
  </motion.div>
);

const ShareValidation: React.FC<ShareValidationProps> = ({ show, onComplete }) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      variant="default"
      displayMode="icon"
      primaryColor="#10b981"
      secondaryColor="#34D399"
      particleColors={COLORS}
      particleConfigs={PARTICLE_CONFIGS}
      iconShadow="0 8px 32px rgba(16, 185, 129, 0.4)"
      icon={ShareIcon}
      soundType="save"
      dismissDelay={2500}
      exitDelay={500}
      useTriggeredGuard={true}
      rippleConfigs={[
        { scale: 2.2, opacity: 0.6, duration: 1, delay: 0, borderColor: '#10b981' },
        { scale: 2.5, opacity: 0.4, duration: 1.3, delay: 0.15, borderColor: '#34D399' },
      ]}
    />
  );
};

export default ShareValidation;
