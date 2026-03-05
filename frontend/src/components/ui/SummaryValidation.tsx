import React from 'react';
import { Lightbulb } from 'lucide-react';
import ConfirmationDialog from './ConfirmationDialog';

interface SummaryValidationProps {
  show: boolean;
  onComplete?: () => void;
}

const PARTICLE_CONFIGS = [
  { x: 40, y: -85, delay: 0, colorIdx: 0 },
  { x: -45, y: -95, delay: 0.05, colorIdx: 1 },
  { x: 55, y: -65, delay: 0.1, colorIdx: 2 },
  { x: -60, y: -75, delay: 0.15, colorIdx: 3 },
  { x: 30, y: -105, delay: 0.2, colorIdx: 4 },
  { x: -35, y: -90, delay: 0.25, colorIdx: 0 },
  { x: 65, y: -80, delay: 0.3, colorIdx: 1 },
  { x: -50, y: -100, delay: 0.35, colorIdx: 2 },
];

const COLORS = ['#10B981', '#34D399', '#6EE7B7', '#059669', '#047857'];

const SummaryValidation: React.FC<SummaryValidationProps> = ({ show, onComplete }) => {
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
      icon={<Lightbulb size={36} color="white" strokeWidth={2.5} />}
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

export default SummaryValidation;
