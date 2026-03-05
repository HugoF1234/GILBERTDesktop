import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { Template } from '../services/templateService';
import { getAssetUrl } from '../services/apiClient';

interface SummaryGeneratorProps {
  templates: Template[];
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  hasTranscript: boolean;
}

const MotionBox = motion.div;

const SummaryGenerator: React.FC<SummaryGeneratorProps> = ({
  templates,
  selectedTemplateId,
  onSelectTemplate,
  onGenerate,
  isGenerating,
  hasTranscript,
}) => {
  const theme = useTheme();
  // Ensure templates is an array
  const safeTemplates = Array.isArray(templates) ? templates : [];
  const hasTemplates = safeTemplates.length > 0;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Auto-select first template on mount if none selected
  useEffect(() => {
    if (hasTemplates && !selectedTemplateId) {
      onSelectTemplate(safeTemplates[0].id);
    }
  }, [hasTemplates, selectedTemplateId, safeTemplates, onSelectTemplate]);

  // Update active index when selected template changes
  useEffect(() => {
    const index = safeTemplates.findIndex(t => t.id === selectedTemplateId);
    if (index !== -1) {
      setActiveIndex(index);
    }
  }, [selectedTemplateId, safeTemplates]);

  // Scroll to selected template
  useEffect(() => {
    if (scrollContainerRef.current && selectedTemplateId) {
      const container = scrollContainerRef.current;
      const cards = container.querySelectorAll('[data-template-card]');
      const index = safeTemplates.findIndex(t => t.id === selectedTemplateId);
      if (index !== -1 && cards[index]) {
        cards[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedTemplateId, safeTemplates]);

  // Track scroll position for dot indicators
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || safeTemplates.length === 0) return;

    const container = scrollContainerRef.current;
    const cards = container.querySelectorAll('[data-template-card]');
    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestIndex = 0;
    let closestDistance = Infinity;

    cards.forEach((card, index) => {
      const cardRect = card.getBoundingClientRect();
      const cardCenter = cardRect.top + cardRect.height / 2;
      const distance = Math.abs(cardCenter - containerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveIndex(closestIndex);
  }, [safeTemplates.length]);

  const handleDotClick = (index: number) => {
    if (safeTemplates[index]) {
      onSelectTemplate(safeTemplates[index].id);
    }
  };

  const isButtonDisabled = !selectedTemplateId || !hasTranscript || isGenerating;

  return (
    <Box
      sx={{
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: '#fafafa',
        userSelect: 'none',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
      }}
    >
      {!hasTemplates ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <Box
            component="img"
            src="/img/icon.png"
            alt="Gilbert"
            sx={{ width: 56, height: 56, objectFit: 'contain', mb: 2, opacity: 0.6 }}
          />
          <Typography variant="body1" fontWeight={500} color="text.secondary">
            Prêt à générer
          </Typography>
        </Box>
      ) : (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          {/* Fade top */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 20,
              background: 'linear-gradient(to bottom, #fafafa, transparent)',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
          {/* Fade bottom */}
          <Box
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 80,
              background: 'linear-gradient(to top, #fafafa 60%, transparent)',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />

          {/* Scrollable list - hidden scrollbar */}
          <Box
            ref={scrollContainerRef}
            onScroll={handleScroll}
            sx={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              px: 2,
              pr: 3.5,
              pt: 3,
              pb: 16,
            }}
          >
            {/* Template cards */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <AnimatePresence>
                {safeTemplates.map((template, index) => {
                  const isSelected = template.id === selectedTemplateId;

                  return (
                    <MotionBox
                      key={template.id}
                      data-template-card
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      onClick={() => onSelectTemplate(template.id)}
                      style={{
                        padding: '16px 18px',
                        borderRadius: 12,
                        backgroundColor: isSelected ? '#f0f4ff' : '#fff',
                        border: `1px solid ${isSelected ? theme.palette.primary.main : '#e5e7eb'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease, background-color 0.15s ease',
                      }}
                    >
                      {/* Logo container */}
                      <Box
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: '10px',
                          bgcolor: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Box
                          component="img"
                          src={getAssetUrl(template.logo_url) || '/img/icon.png'}
                          alt=""
                          draggable={false}
                          sx={{
                            width: 28,
                            height: 28,
                            objectFit: 'contain',
                          }}
                        />
                      </Box>

                      {/* Content */}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            color: isSelected ? theme.palette.primary.main : '#111827',
                            lineHeight: 1.3,
                            mb: 0.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {template.name}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.8rem',
                            color: '#6b7280',
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {template.description || 'Modèle de synthèse'}
                        </Typography>
                      </Box>

                      {/* Selection indicator */}
                      {isSelected && (
                        <Box
                          sx={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            backgroundColor: theme.palette.primary.main,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M20 6L9 17L4 12"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </Box>
                      )}
                    </MotionBox>
                  );
                })}
              </AnimatePresence>
            </Box>
          </Box>

          {/* Dot indicators - positioned at the far right edge */}
          {safeTemplates.length > 1 && (
            <Box
              sx={{
                position: 'absolute',
                right: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 15,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              {safeTemplates.map((_, index) => (
                <Box
                  key={index}
                  onClick={() => handleDotClick(index)}
                  sx={{
                    width: 4,
                    height: activeIndex === index ? 12 : 4,
                    borderRadius: 2,
                    backgroundColor: activeIndex === index
                      ? theme.palette.primary.main
                      : '#d1d5db',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: activeIndex === index ? 1 : 0.5,
                    '&:hover': {
                      opacity: 1,
                    },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Generate Button with label */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.75,
        }}
      >
        <MotionBox
          whileHover={!isButtonDisabled && !isGenerating ? { scale: 1.05 } : {}}
          whileTap={!isButtonDisabled ? { scale: 0.95 } : {}}
          onClick={onGenerate}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isButtonDisabled ? '#d1d5db' : theme.palette.primary.main,
            boxShadow: isButtonDisabled ? 'none' : `0 2px 8px ${alpha(theme.palette.primary.main, 0.3)}`,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
          {isGenerating ? (
            <MotionBox
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ display: 'flex' }}
            >
              <Box
                component="img"
                src="/img/icon.png"
                alt=""
                sx={{ width: 24, height: 24, filter: 'brightness(0) invert(1)' }}
              />
            </MotionBox>
          ) : (
            <Box
              component="img"
              src="/img/icon.png"
              alt=""
              sx={{
                width: 24,
                height: 24,
                filter: isButtonDisabled ? 'grayscale(1) opacity(0.5)' : 'brightness(0) invert(1)',
              }}
            />
          )}
        </MotionBox>
        <Typography
          sx={{
            fontSize: '0.65rem',
            fontWeight: 500,
            color: isGenerating ? theme.palette.primary.main : '#9ca3af',
            letterSpacing: '0.02em',
          }}
        >
          {isGenerating ? 'Génération...' : 'Générer'}
        </Typography>
      </Box>
    </Box>
  );
};

export default SummaryGenerator;

