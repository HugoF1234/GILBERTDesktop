import React from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import ConfirmationDialog from './ConfirmationDialog';

interface DeleteValidationProps {
  show: boolean;
  onComplete?: () => void;
}

const DeleteIcon = (
  <motion.div
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
  >
    <Trash2 size={36} color="white" strokeWidth={2.5} />
  </motion.div>
);

const DeleteValidation: React.FC<DeleteValidationProps> = ({ show, onComplete }) => {
  return (
    <ConfirmationDialog
      open={show}
      onClose={onComplete}
      variant="danger"
      displayMode="icon"
      primaryColor="#EF4444"
      iconShadow="0 8px 32px rgba(239, 68, 68, 0.4)"
      icon={DeleteIcon}
      soundType="delete"
      dismissDelay={1500}
      exitDelay={400}
      useTriggeredGuard={true}
      rippleConfigs={[
        { scale: 2, opacity: 0.5, duration: 0.8, delay: 0, borderColor: '#EF4444' },
      ]}
    />
  );
};

export default DeleteValidation;
