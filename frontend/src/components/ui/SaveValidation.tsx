import React from 'react';
import ConfirmationDialog from './ConfirmationDialog';

interface SaveValidationProps {
  show: boolean;
  onComplete?: () => void;
  title?: string;
  subtitle?: string;
}

const SaveValidation: React.FC<SaveValidationProps> = ({
  show,
  onComplete,
  title = 'Réunion terminée',
  subtitle = 'Enregistrement sauvegardé avec succès'
}) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      title={title}
      description={subtitle}
      variant="default"
      displayMode="card"
      primaryColor="#10b981"
      particleColors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']}
      soundType="save"
      dismissDelay={2200}
      exitDelay={0}
      particleMode="radial"
      radialParticleCount={24}
      radialParticleDistance={[80, 140]}
      particleSize={10}
      particleRandomShape={true}
      particleDuration={1.2}
      useTriggeredGuard={false}
      rippleConfigs={[
        { scale: 2.5, opacity: 0.6, duration: 0.8, delay: 0.2, borderColor: '#10b981' },
      ]}
    />
  );
};

export default SaveValidation;
