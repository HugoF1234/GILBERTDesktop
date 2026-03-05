/**
 * MyTemplates - Page marketing "Modèles de synthèse"
 * Design épuré avec formulaire de contact intégré
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Target,
  FileText,
  Building2,
  Layers,
  Palette,
  Zap,
  CheckCircle2,
  Send,
  Loader2,
  Mail,
  HelpCircle,
} from 'lucide-react';
import { sendContactEmail, openMailClient } from '@/services/contactService';
import type { ContactFormData } from '@/services/contactService';
import { logger } from '@/utils/logger';

/** Catégories d'intérêt pour le formulaire */
interface Category {
  id: string;
  label: string;
  icon: React.ElementType;
}

const categories: Category[] = [
  { id: 'vocabulaire', label: 'Vocabulaire métier', icon: Target },
  { id: 'format', label: 'Format personnalisé', icon: FileText },
  { id: 'identite', label: 'Identité visuelle', icon: Building2 },
  { id: 'sections', label: 'Sections sur mesure', icon: Layers },
  { id: 'autre', label: 'Autre', icon: HelpCircle },
];

/** Avantages des modèles personnalisés */
const advantages = [
  {
    icon: Target,
    title: 'Adapté à votre métier',
    description: 'Des synthèses qui utilisent votre vocabulaire spécifique.',
  },
  {
    icon: FileText,
    title: 'Format sur mesure',
    description: 'Structure de compte-rendu personnalisée.',
  },
  {
    icon: Building2,
    title: 'Votre identité visuelle',
    description: 'Intégrez votre logo dans les exports.',
  },
  {
    icon: Layers,
    title: 'Sections personnalisées',
    description: 'Points clés, décisions, actions configurables.',
  },
  {
    icon: Palette,
    title: 'Verbiage spécialisé',
    description: 'Terminologie adaptée à votre secteur.',
  },
  {
    icon: Zap,
    title: 'Gain de temps',
    description: 'Synthèses prêtes à être partagées.',
  },
];

/** État du formulaire */
interface FormState {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  selectedCategories: string[];
}

/** État d'envoi */
type SendStatus = 'idle' | 'sending' | 'success' | 'error';

function MyTemplates(): JSX.Element {
  const [formState, setFormState] = useState<FormState>({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: '',
    selectedCategories: [],
  });
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  /** Toggle une catégorie */
  function toggleCategory(categoryId: string): void {
    setFormState((prev) => {
      const isSelected = prev.selectedCategories.includes(categoryId);
      return {
        ...prev,
        selectedCategories: isSelected
          ? prev.selectedCategories.filter((id) => id !== categoryId)
          : [...prev.selectedCategories, categoryId],
      };
    });
  }

  /** Met à jour un champ */
  function updateField(field: keyof FormState, value: string): void {
    setFormState((prev) => ({ ...prev, [field]: value }));
  }

  /** Envoie le formulaire */
  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (!formState.name.trim() || !formState.email.trim()) {
      setErrorMessage('Veuillez remplir au moins votre nom et email.');
      return;
    }

    setSendStatus('sending');
    setErrorMessage('');

    const contactData: ContactFormData = {
      name: formState.name,
      email: formState.email,
      company: formState.company || undefined,
      phone: formState.phone || undefined,
      message: formState.message || 'Demande d\'information sur les modèles personnalisés.',
      categories: formState.selectedCategories.map((id) => {
        const cat = categories.find((c) => c.id === id);
        return cat?.label || id;
      }),
      subject: 'Demande de modèle de synthèse personnalisé',
    };

    try {
      await sendContactEmail(contactData);
      setSendStatus('success');
      setFormState({
        name: '',
        email: '',
        company: '',
        phone: '',
        message: '',
        selectedCategories: [],
      });
    } catch (error: any) {
      // Afficher l'erreur à l'utilisateur sans ouvrir le client mail
      logger.error('Erreur lors de l\'envoi:', error);
      const errorMessage = error?.detail || error?.message || 'Une erreur est survenue lors de l\'envoi. Veuillez réessayer.';
      setErrorMessage(errorMessage);
      setSendStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-12">
        {/* Header avec logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8 sm:mb-12"
        >
          <img
            src="/img/logo_gilbert.png"
            alt="Gilbert"
            className="h-12 sm:h-16 lg:h-20 mx-auto mb-4 sm:mb-6"
          />
          <h1 className="text-xl sm:text-2xl lg:text-4xl font-semibold text-slate-900 mb-2 sm:mb-3">
            Modèles de synthèse sur mesure
          </h1>
          <p className="text-sm sm:text-base lg:text-lg text-slate-600 max-w-2xl mx-auto px-2">
            Créez des comptes-rendus parfaitement adaptés à votre entreprise,
            votre secteur et vos processus.
          </p>
        </motion.div>

        {/* Avantages */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-8 sm:mb-12"
        >
          <h2 className="text-base sm:text-lg lg:text-xl font-medium text-slate-900 text-center mb-4 sm:mb-6">
            Pourquoi un modèle personnalisé ?
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
            {advantages.map((advantage) => {
              const Icon = advantage.icon;
              return (
                <div
                  key={advantage.title}
                  className="p-3 sm:p-5 rounded-lg sm:rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-colors"
                >
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-slate-100 flex items-center justify-center mb-2 sm:mb-3">
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
                  </div>
                  <h3 className="font-medium text-xs sm:text-base text-slate-900 mb-0.5 sm:mb-1">
                    {advantage.title}
                  </h3>
                  <p className="text-[10px] sm:text-sm text-slate-600 line-clamp-2">
                    {advantage.description}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Ce que comprend votre modèle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mb-8 sm:mb-12 p-4 sm:p-6 lg:p-8 rounded-lg sm:rounded-xl bg-white border border-slate-200"
        >
          <h2 className="text-base sm:text-lg lg:text-xl font-medium text-slate-900 mb-4 sm:mb-6">
            Ce que comprend votre modèle
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {[
              'Configuration du vocabulaire métier',
              'Structure de synthèse personnalisée',
              'Intégration de votre logo',
              'Format d\'export sur mesure (PDF, Word)',
              'Sections configurables',
              'Terminologie spécifique à votre secteur',
              'Formation de vos équipes',
              'Support technique dédié',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-1.5 sm:gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                <span className="text-xs sm:text-sm text-slate-700">{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Formulaire de contact */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="p-4 sm:p-6 lg:p-8 rounded-lg sm:rounded-xl bg-white border border-slate-200"
        >
          <h2 className="text-base sm:text-lg lg:text-xl font-medium text-slate-900 mb-1 sm:mb-2">
            Demander un modèle personnalisé
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mb-4 sm:mb-6">
            Sélectionnez vos besoins et nous vous recontacterons sous 24h.
          </p>

          {sendStatus === 'success' ? (
            <div className="text-center py-6 sm:py-8">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <CheckCircle2 className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
              </div>
              <h3 className="text-base sm:text-lg font-medium text-slate-900 mb-1 sm:mb-2">
                Message envoyé !
              </h3>
              <p className="text-sm text-slate-600 mb-3 sm:mb-4">
                Nous vous répondrons dans les plus brefs délais.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSendStatus('idle');
                  setErrorMessage('');
                }}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Envoyer un autre message
              </button>
            </div>
          ) : sendStatus === 'error' ? (
            <div className="text-center py-6 sm:py-8">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <Send className="w-6 h-6 sm:w-8 sm:h-8 text-red-600" />
              </div>
              <h3 className="text-base sm:text-lg font-medium text-slate-900 mb-1 sm:mb-2">
                Erreur lors de l'envoi
              </h3>
              <p className="text-sm text-red-600 mb-3 sm:mb-4">
                {errorMessage || 'Une erreur est survenue. Veuillez réessayer.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setSendStatus('idle');
                  setErrorMessage('');
                }}
                className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              {/* Catégories d'intérêt */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">
                  Qu'est-ce qui vous intéresse ?
                </label>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {categories.map((category) => {
                    const Icon = category.icon;
                    const isSelected = formState.selectedCategories.includes(category.id);
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className={cn(
                          'inline-flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors',
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        )}
                      >
                        <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">{category.label}</span>
                        <span className="sm:hidden">{category.label.split(' ')[0]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Champs du formulaire */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label htmlFor="name" className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5 sm:mb-1">
                    Nom *
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={formState.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-sm"
                    placeholder="Votre nom"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5 sm:mb-1">
                    Email *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formState.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-sm"
                    placeholder="votre@email.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="company" className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5 sm:mb-1">
                    Entreprise
                  </label>
                  <input
                    id="company"
                    type="text"
                    value={formState.company}
                    onChange={(e) => updateField('company', e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-sm"
                    placeholder="Nom de votre entreprise"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5 sm:mb-1">
                    Téléphone
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formState.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-sm"
                    placeholder="06 12 34 56 78"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="message" className="block text-xs sm:text-sm font-medium text-slate-700 mb-0.5 sm:mb-1">
                  Message
                </label>
                <textarea
                  id="message"
                  value={formState.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  rows={3}
                  className="w-full px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors text-sm resize-none sm:rows-4"
                  placeholder="Décrivez vos besoins spécifiques..."
                />
              </div>

              {errorMessage && (
                <p className="text-sm text-red-600">{errorMessage}</p>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
                <button
                  type="submit"
                  disabled={sendStatus === 'sending'}
                  className={cn(
                    'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg font-medium text-xs sm:text-sm transition-colors',
                    sendStatus === 'sending'
                      ? 'bg-blue-300 text-blue-100 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  {sendStatus === 'sending' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                      <span className="hidden sm:inline">Envoi en cours...</span>
                      <span className="sm:hidden">Envoi...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">Envoyer ma demande</span>
                      <span className="sm:hidden">Envoyer</span>
                    </>
                  )}
                </button>

                <a
                  href="mailto:contact@lexiapro.fr"
                  className="inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600 hover:text-blue-600 transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  contact@lexiapro.fr
                </a>
              </div>
            </form>
          )}
        </motion.div>

        {/* Footer */}
        <p className="text-center text-xs sm:text-sm text-slate-500 mt-6 sm:mt-8">
          Réponse sous 24h • Devis gratuit • Sans engagement
        </p>
      </div>
    </div>
  );
}

export default MyTemplates;
