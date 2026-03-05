import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight } from 'lucide-react';
import { useGenerationStore, GENERATION_STEPS } from '../stores/generationStore';
import { useNavigationStore } from '../stores/navigationStore';
import { cn } from '@/lib/utils';

interface GenerationBannerProps {
  onNavigateToMeeting?: (meetingId: string) => void;
}

export default function GenerationBanner({ onNavigateToMeeting }: GenerationBannerProps): JSX.Element | null {
  const {
    activeGenerations,
    advancePhrase,
    dismissBanner,
    hasActiveGenerations
  } = useGenerationStore();

  const openMeetingOverlay = useNavigationStore(state => state.openMeetingOverlay);

  // Get the first active generation that hasn't been dismissed
  const activeGeneration = Array.from(activeGenerations.values()).find(
    (gen) => gen.status === 'processing' && !gen.bannerDismissed
  );

  // Rotate phrases every 4 seconds
  useEffect(() => {
    if (!activeGeneration) return;

    const interval = setInterval(() => {
      advancePhrase(activeGeneration.meetingId);
    }, 4000);

    return () => clearInterval(interval);
  }, [activeGeneration, advancePhrase]);

  const handleClick = useCallback(() => {
    if (activeGeneration) {
      // Ouvre l'overlay du meeting en cours de génération
      openMeetingOverlay(activeGeneration.meetingId);
      // Aussi appeler le callback si fourni (pour changer de vue)
      if (onNavigateToMeeting) {
        onNavigateToMeeting(activeGeneration.meetingId);
      }
    }
  }, [activeGeneration, onNavigateToMeeting, openMeetingOverlay]);

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeGeneration) {
      dismissBanner(activeGeneration.meetingId);
    }
  }, [activeGeneration, dismissBanner]);

  if (!activeGeneration || !hasActiveGenerations()) return null;

  const currentStepIndex = activeGeneration.currentPhraseIndex;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-full bg-white border-b border-gray-100"
      >
        <div className="px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4 md:gap-6">
            {/* Left: Gilbert message */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              {/* Breathing dot */}
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  opacity: [0.7, 1, 0.7],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"
              />

              <div className="min-w-0 flex flex-col sm:flex-row sm:items-center">
                <span className="text-xs sm:text-sm text-gray-900">
                  <span className="font-medium">Gilbert</span>
                  <span className="text-gray-500 hidden xs:inline"> rédige</span>
                </span>
                <span className="text-gray-300 mx-1 sm:mx-2 hidden sm:inline">·</span>
                <span className="text-xs sm:text-sm text-gray-400 truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">
                  {activeGeneration.meetingTitle}
                </span>
              </div>
            </div>

            {/* Center: Steps progress */}
            <div className="hidden md:flex items-center gap-1 flex-shrink-0">
              {GENERATION_STEPS.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isPending = index > currentStepIndex;

                return (
                  <div key={step.id} className="flex items-center">
                    {/* Step dot */}
                    <div className="relative group">
                      <motion.div
                        className={cn(
                          "w-2 h-2 rounded-full transition-colors",
                          isCompleted && "bg-blue-500",
                          isCurrent && "bg-blue-500",
                          isPending && "bg-gray-200"
                        )}
                        animate={isCurrent ? {
                          scale: [1, 1.3, 1],
                        } : {}}
                        transition={isCurrent ? {
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        } : {}}
                      />

                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        {step.label}
                      </div>
                    </div>

                    {/* Connector line */}
                    {index < GENERATION_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "w-4 h-px mx-0.5",
                          index < currentStepIndex ? "bg-blue-500" : "bg-gray-200"
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
              {/* Current step label (tablet only) */}
              <motion.span
                key={currentStepIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] sm:text-xs text-gray-400 hidden sm:block md:hidden"
              >
                {GENERATION_STEPS[currentStepIndex]?.label}
              </motion.span>

              {/* See link */}
              <button
                onClick={handleClick}
                className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-0.5 px-1.5 sm:px-2 py-1 rounded hover:bg-gray-50"
              >
                <span className="hidden xs:inline">Voir</span>
                <ChevronRight className="w-3 h-3" />
              </button>

              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="p-1 rounded text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
