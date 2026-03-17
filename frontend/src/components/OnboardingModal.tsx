/**
 * OnboardingModal — Guide la première connexion pour activer micro, audio système et notifications.
 * Affiché une seule fois par compte (clé localStorage : `onboarding_done_${userId}`).
 * Toutes les étapes ont la même taille fixe et le bouton "Suivant" est toujours au même endroit.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Bell, Volume2, Check, ChevronRight, X } from 'lucide-react';

const tauriInvoke = (cmd: string, args?: Record<string, unknown>) =>
  ((window as any).__TAURI__?.tauri?.invoke || (window as any).__TAURI__?.core?.invoke)?.(cmd, args);

const isTauri = () => !!(window as any).__TAURI__;

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => Promise<void>;
}

interface OnboardingModalProps {
  userId: string;
  onDone: () => void;
}

export default function OnboardingModal({ userId, onDone }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepDone, setStepDone] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const storageKey = `onboarding_done_${userId}`;

  const requestMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setStepDone(p => ({ ...p, mic: true }));
    } catch {
      setStepDone(p => ({ ...p, mic: false }));
    }
  }, []);

  const requestSystemAudio = useCallback(async () => {
    if (isTauri()) {
      try { await tauriInvoke('request_system_audio_permission'); } catch {}
    }
    setStepDone(p => ({ ...p, system: true }));
  }, []);

  const requestNotifications = useCallback(async () => {
    const perm = await Notification.requestPermission();
    setStepDone(p => ({ ...p, notif: perm === 'granted' }));
  }, []);

  const steps: Step[] = [
    {
      id: 'welcome',
      icon: <span className="text-5xl">👋</span>,
      title: 'Bienvenue sur Gilbert !',
      description:
        'Quelques autorisations sont nécessaires pour que Gilbert fonctionne parfaitement. Ça prend moins de 30 secondes.',
    },
    {
      id: 'mic',
      icon: <Mic className="w-12 h-12 text-blue-500" />,
      title: 'Accès au microphone',
      description:
        'Gilbert a besoin de votre micro pour enregistrer vos réunions.',
      actionLabel: stepDone['mic'] === true ? '✓ Microphone autorisé' : 'Autoriser le microphone',
      onAction: requestMic,
    },
    {
      id: 'system',
      icon: <Volume2 className="w-12 h-12 text-purple-500" />,
      title: 'Audio système',
      description:
        "Capturez ce que disent vos interlocuteurs Zoom, Teams ou Meet sans câble supplémentaire.",
      actionLabel: stepDone['system'] === true ? '✓ Audio système configuré' : "Activer l'audio système",
      onAction: requestSystemAudio,
    },
    {
      id: 'notif',
      icon: <Bell className="w-12 h-12 text-amber-500" />,
      title: 'Notifications intelligentes',
      description:
        "Gilbert détecte quand votre micro s'active et vous propose de démarrer l'enregistrement d'un clic.",
      actionLabel: stepDone['notif'] === true ? '✓ Notifications activées' : 'Activer les notifications',
      onAction: requestNotifications,
    },
    {
      id: 'done',
      icon: <span className="text-5xl">🚀</span>,
      title: 'Tout est prêt !',
      description:
        'Gilbert est configuré. Lancez votre prochain appel, Gilbert vous proposera automatiquement de l\'enregistrer.',
    },
  ];

  const current = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  const handleAction = useCallback(async () => {
    if (!current.onAction) return;
    setLoading(true);
    await current.onAction();
    setLoading(false);
  }, [current]);

  const handleNext = useCallback(() => {
    if (isLast) {
      localStorage.setItem(storageKey, 'true');
      onDone();
    } else {
      setCurrentStep(p => p + 1);
    }
  }, [isLast, storageKey, onDone]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    onDone();
  }, [storageKey, onDone]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ height: 400 }}
      >
        {/* Bouton fermer */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors z-10"
          aria-label="Ignorer l'onboarding"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Barre de progression — hauteur fixe */}
        <div className="flex gap-1.5 px-6 pt-6 shrink-0">
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= currentStep ? 'bg-blue-500' : 'bg-slate-200'
              }`}
            />
          ))}
        </div>

        {/* Zone de contenu : flex-1 avec overflow hidden pour que le contenu ne déborde pas */}
        <div className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center"
            >
              <div className="mb-4">{current.icon}</div>
              <h2 className="text-xl font-semibold text-slate-800 mb-2">{current.title}</h2>
              <p className="text-sm text-slate-500 leading-relaxed">{current.description}</p>

              {/* Bouton d'action (autorisation) — hauteur réservée même si absent pour éviter le décalage */}
              <div className="mt-5 w-full h-10">
                {current.onAction && (
                  <button
                    onClick={handleAction}
                    disabled={loading || stepDone[current.id] === true}
                    className={`flex items-center justify-center gap-2 w-full h-full rounded-xl font-medium text-sm transition-all ${
                      stepDone[current.id] === true
                        ? 'bg-green-50 text-green-600 border border-green-200 cursor-default'
                        : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                    }`}
                  >
                    {loading ? (
                      <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : stepDone[current.id] === true ? (
                      <Check className="w-4 h-4" />
                    ) : null}
                    {current.actionLabel}
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bouton Suivant/Commencer — toujours fixé en bas */}
        <div className="px-8 pb-6 shrink-0">
          <button
            onClick={handleNext}
            className="flex items-center justify-center gap-1 w-full py-2.5 px-4 rounded-xl font-medium text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all"
          >
            {isLast ? 'Commencer' : 'Suivant'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
