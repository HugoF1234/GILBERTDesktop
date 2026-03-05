'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  Mic,
  List,
  FileText,
  ChevronRight,
  X,
  Sparkles,
  Zap
} from 'lucide-react';
import { getDiscoveryStatus } from '../services/profileService';
import { logger } from '@/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

interface TourStep {
  id: string;
  target: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
}

interface OnboardingTourProps {
  onComplete: () => void;
  isOpen: boolean;
  userId?: string;
}

// ============================================================================
// TOUR STEPS CONFIGURATION
// ============================================================================

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '',
    title: 'Bienvenue sur Gilbert',
    description: 'Découvrez comment transformer vos réunions en synthèses structurées en quelques clics.',
    icon: <Sparkles className="w-6 h-6" />,
    position: 'center',
  },
  {
    id: 'record',
    target: '[data-tour="record"]',
    title: 'Enregistrez vos échanges',
    description: 'Lancez un enregistrement en un clic. Gilbert transcrit et analyse automatiquement vos conversations.',
    icon: <Mic className="w-6 h-6" />,
    position: 'right',
  },
  {
    id: 'meetings',
    target: '[data-tour="meetings"]',
    title: 'Retrouvez vos réunions',
    description: 'Accédez à toutes vos transcriptions et synthèses depuis cet espace dédié.',
    icon: <List className="w-6 h-6" />,
    position: 'right',
  },
  {
    id: 'templates',
    target: '[data-tour="templates"]',
    title: 'Personnalisez vos synthèses',
    description: 'Créez des modèles sur mesure : compte-rendu, brief créatif, notes de réunion...',
    icon: <FileText className="w-6 h-6" />,
    position: 'right',
  },
];

// ============================================================================
// DISCOVERY GAUGE HIGHLIGHT COMPONENT
// ============================================================================

interface DiscoveryHighlightProps {
  isOpen: boolean;
  onClose: () => void;
}

const DiscoveryHighlight: React.FC<DiscoveryHighlightProps> = ({ isOpen, onClose }) => {
  const [gaugeRect, setGaugeRect] = useState<DOMRect | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Find the Discovery gauge in the sidebar
    const findGauge = () => {
      // Look for the Discovery gauge element
      const gauge = document.querySelector('[data-tour="discovery-gauge"]') ||
                    document.querySelector('.discovery-gauge') ||
                    // Fallback: find by text content
                    Array.from(document.querySelectorAll('button')).find(
                      el => el.textContent?.includes('Discovery') || el.textContent?.includes('min')
                    );

      if (gauge) {
        setGaugeRect(gauge.getBoundingClientRect());
        // Small delay before showing tooltip
        setTimeout(() => setShowTooltip(true), 300);
      } else {
        // If no gauge found, just close after delay
        setTimeout(onClose, 2000);
      }
    };

    // Small delay to let the sidebar render
    const timer = setTimeout(findGauge, 100);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  // Auto-close after showing
  useEffect(() => {
    if (showTooltip) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [showTooltip, onClose]);

  if (!isOpen) return null;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[9999] pointer-events-none"
        >
          {/* Dark overlay with rounded cutout */}
          {gaugeRect ? (
            <>
              {/* Clickable dark overlay area */}
              <div
                className="absolute inset-0"
                onClick={onClose}
                style={{ pointerEvents: 'auto' }}
              />
              {/* Transparent cutout with box-shadow */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: gaugeRect.left - 6,
                  top: gaugeRect.top - 6,
                  width: gaugeRect.width + 12,
                  height: gaugeRect.height + 12,
                  borderRadius: '16px',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                }}
              />

              {/* Pulse animation border around gauge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: [0.5, 1, 0.5],
                  scale: [0.98, 1.02, 0.98],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute pointer-events-none"
                style={{
                  left: gaugeRect.left - 10,
                  top: gaugeRect.top - 10,
                  width: gaugeRect.width + 20,
                  height: gaugeRect.height + 20,
                  borderRadius: '16px',
                  border: '2px solid rgba(59, 130, 246, 0.8)',
                }}
              />

              {/* Tooltip */}
              <AnimatePresence>
                {showTooltip && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.3, delay: 0.2 }}
                    className="absolute pointer-events-auto"
                    style={{
                      left: gaugeRect.right + 20,
                      // Keep tooltip within viewport bounds
                      top: Math.min(
                        Math.max(gaugeRect.top - 50, 20),
                        window.innerHeight - 200
                      ),
                    }}
                  >
                    <div className="bg-white rounded-2xl shadow-xl p-5 max-w-[280px] border border-gray-100">
                      {/* Arrow pointing left */}
                      <div
                        className="absolute w-3 h-3 bg-white border-l border-b border-gray-100 rotate-45"
                        style={{
                          left: -6,
                          top: '50%',
                          transform: 'translateY(-50%) rotate(45deg)',
                        }}
                      />

                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                          <Zap className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 text-sm">Plan Discovery</h4>
                          <p className="text-xs text-gray-500">Votre cadeau de bienvenue</p>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 mb-3">
                        <span className="font-semibold text-blue-600">300 minutes gratuites</span> pour découvrir Gilbert sans engagement.
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Aucune CB requise</span>
                        <button
                          onClick={onClose}
                          className="text-xs text-blue-600 font-medium hover:text-blue-700"
                        >
                          Compris
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DISCOVERY_HIGHLIGHT_STORAGE_KEY = 'gilbert_discovery_highlight_shown';

const getDiscoveryKey = (uid?: string) =>
  uid ? `${DISCOVERY_HIGHLIGHT_STORAGE_KEY}_${uid}` : DISCOVERY_HIGHLIGHT_STORAGE_KEY;

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete, isOpen, userId }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showDiscoveryHighlight, setShowDiscoveryHighlight] = useState(false);
  const [hasDiscoveryPlan, setHasDiscoveryPlan] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const discoveryKey = getDiscoveryKey(userId);

  const step = TOUR_STEPS[currentStep];
  const isWelcomeStep = step.position === 'center';
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  // Check if user has Discovery plan
  useEffect(() => {
    const checkDiscoveryPlan = async () => {
      try {
        const status = await getDiscoveryStatus();
        setHasDiscoveryPlan(status?.subscription_plan === 'discovery');
      } catch {
        setHasDiscoveryPlan(false);
      }
    };
    if (isOpen) {
      checkDiscoveryPlan();
    }
  }, [isOpen]);

  // Update target element position
  const updateTargetPosition = useCallback(() => {
    if (!step.target) {
      setTargetRect(null);
      return;
    }

    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step.target]);

  useEffect(() => {
    if (!isOpen) return;

    updateTargetPosition();
    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition);

    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition);
    };
  }, [isOpen, currentStep, updateTargetPosition]);

  // Check if Discovery highlight should be shown (par utilisateur)
  const shouldShowDiscoveryHighlight = useCallback(() => {
    if (!hasDiscoveryPlan) return false;
    const alreadyShown = localStorage.getItem(discoveryKey);
    return !alreadyShown;
  }, [hasDiscoveryPlan, discoveryKey]);

  // Handle next step
  const handleNext = useCallback(() => {
    if (isAnimating) return;

    if (isLastStep) {
      // Show Discovery highlight after tour only if user has Discovery plan and hasn't seen it
      if (shouldShowDiscoveryHighlight()) {
        setShowDiscoveryHighlight(true);
      } else {
        onComplete();
      }
    } else {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        setIsAnimating(false);
      }, 150);
    }
  }, [isLastStep, isAnimating, shouldShowDiscoveryHighlight, onComplete]);

  // Handle skip
  const handleSkip = useCallback(() => {
    if (shouldShowDiscoveryHighlight()) {
      setShowDiscoveryHighlight(true);
    } else {
      onComplete();
    }
  }, [shouldShowDiscoveryHighlight, onComplete]);

  // Handle Discovery highlight close
  const handleDiscoveryClose = useCallback(() => {
    localStorage.setItem(discoveryKey, 'true');
    setShowDiscoveryHighlight(false);
    onComplete();
  }, [onComplete, discoveryKey]);

  // Calculate tooltip position
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    // For welcome step, always center
    if (isWelcomeStep) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    // For steps with target
    if (!targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const padding = 16;
    const tooltipWidth = 340;
    const tooltipHeight = 220;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'right':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + padding;
        break;
      case 'left':
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - padding;
        break;
      case 'bottom':
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = targetRect.top - tooltipHeight - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
    }

    top = Math.max(20, Math.min(top, window.innerHeight - tooltipHeight - 20));
    left = Math.max(20, Math.min(left, window.innerWidth - tooltipWidth - 20));

    return {
      position: 'fixed',
      top,
      left,
    };
  }, [isWelcomeStep, targetRect, step.position]);

  if (!isOpen) return null;

  // Show Discovery highlight instead of tour
  if (showDiscoveryHighlight) {
    return <DiscoveryHighlight isOpen={true} onClose={handleDiscoveryClose} />;
  }

  const content = (
    <motion.div
      key="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[9999]"
    >
      {/* Dark overlay with rounded cutout - no blur to avoid issues */}
      {targetRect && !isWelcomeStep ? (
        <>
          {/* Transparent cutout with box-shadow for dark overlay */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: targetRect.left - 4,
              top: targetRect.top - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              borderRadius: '12px',
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
            }}
          />
          {/* Border around the element */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute pointer-events-none"
            style={{
              left: targetRect.left - 4,
              top: targetRect.top - 4,
              width: targetRect.width + 8,
              height: targetRect.height + 8,
              borderRadius: '12px',
              border: '2px solid rgba(59, 130, 246, 0.8)',
            }}
          />
        </>
      ) : (
        /* Full dark overlay for welcome step */
        <div
          className="absolute inset-0 bg-black/50"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Tooltip Card */}
      <motion.div
        ref={tooltipRef}
        key={`tooltip-${currentStep}`}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        style={getTooltipStyle()}
        className="w-[340px] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header - Blue gradient with WHITE text */}
        <div className="relative bg-gradient-to-br from-blue-500 to-blue-600 px-6 py-6">
          {/* Decorative element */}
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />

          {/* Step indicators - WHITE */}
          <div className="absolute top-4 right-4 flex gap-1.5">
            {TOUR_STEPS.map((_, index) => (
              <div
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === currentStep
                    ? "bg-white w-5"
                    : index < currentStep
                    ? "bg-white/60 w-1.5"
                    : "bg-white/30 w-1.5"
                )}
              />
            ))}
          </div>

          {/* Icon - WHITE */}
          <div className="relative w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center text-white mb-4">
            {step.icon}
          </div>

          {/* Title - WHITE */}
          <h3 className="relative text-lg font-semibold" style={{ color: '#ffffff' }}>
            {step.title}
          </h3>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 text-sm leading-relaxed mb-6">
            {step.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2 py-1"
            >
              Passer
            </button>

            <button
              onClick={handleNext}
              className={cn(
                "flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-medium text-sm",
                "bg-blue-500 text-white",
                "hover:bg-blue-600 transition-all duration-200",
                "shadow-md shadow-blue-500/20",
              )}
            >
              {isLastStep ? "Terminer" : 'Suivant'}
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </motion.div>

      {/* Close button */}
      <button
        onClick={handleSkip}
        className={cn(
          "fixed top-5 right-5 p-2.5 rounded-full z-[10000]",
          "bg-white/20 text-white/80",
          "hover:bg-white/30 hover:text-white transition-all"
        )}
      >
        <X className="w-5 h-5" />
      </button>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export default OnboardingTour;

// ============================================================================
// HOOK FOR MANAGING ONBOARDING STATE
// ============================================================================

const ONBOARDING_STORAGE_KEY = 'gilbert_onboarding_completed';

const getTourStorageKey = (userId?: string) =>
  userId ? `${ONBOARDING_STORAGE_KEY}_${userId}` : ONBOARDING_STORAGE_KEY;

const getDiscoveryHighlightStorageKey = (userId?: string) =>
  userId ? `${DISCOVERY_HIGHLIGHT_STORAGE_KEY}_${userId}` : DISCOVERY_HIGHLIGHT_STORAGE_KEY;

// Expose global function for testing (optionnel: resetOnboarding(userId))
if (typeof window !== 'undefined') {
  (window as any).resetOnboarding = (uid?: string) => {
    localStorage.removeItem(getTourStorageKey(uid));
    localStorage.removeItem(getDiscoveryHighlightStorageKey(uid));
    logger.debug('Onboarding reset! Refresh the page to see the tour again.');
    window.location.reload();
  };
}

export const useOnboarding = (userId?: string) => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const tourKey = getTourStorageKey(userId);

  useEffect(() => {
    if (userId === undefined) return; // Attendre d'avoir un user pour décider (chaque compte a son tour)
    const completed = localStorage.getItem(tourKey);
    if (!completed) {
      const timer = setTimeout(() => {
        setShowOnboarding(true);
      }, 800);
      return () => clearTimeout(timer);
    }
    setIsReady(true);
  }, [userId, tourKey]);

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(tourKey, 'true');
    setShowOnboarding(false);
    setIsReady(true);
  }, [tourKey]);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(tourKey);
    localStorage.removeItem(getDiscoveryHighlightStorageKey(userId));
    setShowOnboarding(true);
    setIsReady(false);
  }, [userId, tourKey]);

  return {
    showOnboarding,
    isReady,
    completeOnboarding,
    resetOnboarding,
  };
};
