import React from 'react';
import ConfirmationDialog from './ConfirmationDialog';

interface DiscardValidationProps {
  show: boolean;
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
}

const DiscardValidation: React.FC<DiscardValidationProps> = ({
  show,
  onComplete,
  title = 'Échanges abandonnés',
  subtitle = "L'enregistrement a été supprimé"
}) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      title={title}
      description={subtitle}
      variant="warning"
      displayMode="card"
      primaryColor="#f59e0b"
      particleColors={['#f59e0b', '#fbbf24', '#d97706', '#fcd34d', '#f97316', '#fde68a']}
      soundType="discard"
      dismissDelay={2000}
      exitDelay={0}
      particleMode="radial"
      radialParticleCount={20}
      radialParticleDistance={[60, 110]}
      useTriggeredGuard={false}
      rippleConfigs={[
        { scale: 2.2, opacity: 0.5, duration: 0.7, delay: 0.2, borderColor: '#f59e0b' },
      ]}
    />
  );
};

export default DiscardValidation;
