import React from 'react';
import { motion } from 'framer-motion';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';

const loadingMessages = [
  'Analyse en cours...',
  'Traitement de l\'audio...',
  'Identification des locuteurs...',
  'Préparation de la transcription...',
];

export const TranscriptLoadingAnimation: React.FC = () => {
  const theme = useTheme();
  const [messageIndex, setMessageIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        gap: 3,
      }}
    >
      {/* Progress ring - no scale animation */}
      <Box sx={{ position: 'relative', width: 72, height: 72 }}>
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          {/* Background circle */}
          <circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke={alpha(theme.palette.primary.main, 0.1)}
            strokeWidth="4"
          />
          {/* Animated progress arc - rotation only, no scale */}
          <motion.circle
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke={theme.palette.primary.main}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="60 130"
            animate={{ rotate: 360 }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              ease: 'linear',
            }}
            style={{ transformOrigin: 'center' }}
          />
        </svg>

        {/* Center icon - document */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.palette.primary.main}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="12" y2="17" />
          </svg>
        </Box>
      </Box>

      {/* Animated message - fade only */}
      <Box sx={{ textAlign: 'center', minHeight: 48 }}>
        <motion.div
          key={messageIndex}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: 'text.primary',
              mb: 0.5,
            }}
          >
            {loadingMessages[messageIndex]}
          </Typography>
        </motion.div>
        <Typography variant="caption" color="text.secondary">
          Encore quelques instants
        </Typography>
      </Box>

      {/* Static dots with opacity animation only - no scale */}
      <Box sx={{ display: 'flex', gap: 1 }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.palette.primary.main,
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

export default TranscriptLoadingAnimation;
