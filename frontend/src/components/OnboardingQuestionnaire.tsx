'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Phone,
  Briefcase,
  GraduationCap,
  User,
  Building2,
  Megaphone,
  Users,
  Search,
  Newspaper,
  MessageCircle,
  Check,
  Mic,
  Video,
  FileText,
  Sparkles,
} from 'lucide-react';
import { logger } from '@/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

interface QuestionnaireData {
  phoneCountryCode: string;
  phone: string;
  usage: string[]; // choix multiples
  status: string;
  companyName: string;
  sector: string;
  source: string;
  cguAccepted: boolean;
}

// ============================================================================
// COUNTRY CODES DATA
// ============================================================================

interface CountryCode {
  code: string;
  country: string;
  flag: string;
  format: string; // Format pattern with X as digit placeholder
  maxDigits: number;
}

const COUNTRY_CODES: CountryCode[] = [
  { code: '+33', country: 'France', flag: '🇫🇷', format: 'X XX XX XX XX', maxDigits: 9 },
  { code: '+32', country: 'Belgique', flag: '🇧🇪', format: 'XXX XX XX XX', maxDigits: 9 },
  { code: '+41', country: 'Suisse', flag: '🇨🇭', format: 'XX XXX XX XX', maxDigits: 9 },
  { code: '+352', country: 'Luxembourg', flag: '🇱🇺', format: 'XXX XXX XXX', maxDigits: 9 },
  { code: '+1', country: 'USA / Canada', flag: '🇺🇸', format: 'XXX-XXX-XXXX', maxDigits: 10 },
  { code: '+44', country: 'Royaume-Uni', flag: '🇬🇧', format: 'XXXX XXXXXX', maxDigits: 10 },
  { code: '+49', country: 'Allemagne', flag: '🇩🇪', format: 'XXX XXXXXXXX', maxDigits: 11 },
  { code: '+34', country: 'Espagne', flag: '🇪🇸', format: 'XXX XX XX XX', maxDigits: 9 },
  { code: '+39', country: 'Italie', flag: '🇮🇹', format: 'XXX XXX XXXX', maxDigits: 10 },
  { code: '+351', country: 'Portugal', flag: '🇵🇹', format: 'XXX XXX XXX', maxDigits: 9 },
  { code: '+212', country: 'Maroc', flag: '🇲🇦', format: 'XXX-XXXXXX', maxDigits: 9 },
  { code: '+216', country: 'Tunisie', flag: '🇹🇳', format: 'XX XXX XXX', maxDigits: 8 },
  { code: '+213', country: 'Algérie', flag: '🇩🇿', format: 'XXX XX XX XX', maxDigits: 9 },
];

// Pays où le 0 initial est le préfixe national (à retirer pour l'international)
const STRIP_LEADING_ZERO_CODES = new Set(['+33', '+32', '+41', '+352', '+212', '+216', '+213']);

// Format phone number based on country pattern
const formatPhoneNumber = (value: string, countryCode: string): string => {
  const country = COUNTRY_CODES.find(c => c.code === countryCode);
  if (!country) return value;

  // Garder uniquement les chiffres
  let digits = value.replace(/\D/g, '');

  // Retirer le 0 initial si l'utilisateur a saisi le format national (ex. 06 12 34 56 78 en France)
  // pour éviter de dépasser maxDigits et perdre le dernier chiffre
  if (STRIP_LEADING_ZERO_CODES.has(countryCode) && digits.length > 0 && digits[0] === '0') {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, country.maxDigits);

  if (!digits) return '';

  // Apply format pattern
  let formatted = '';
  let digitIndex = 0;

  for (const char of country.format) {
    if (digitIndex >= digits.length) break;
    if (char === 'X') {
      formatted += digits[digitIndex];
      digitIndex++;
    } else {
      formatted += char;
    }
  }

  return formatted;
};

// Get raw digits from formatted phone
const getRawPhone = (formatted: string): string => {
  return formatted.replace(/\D/g, '');
};

interface OnboardingQuestionnaireProps {
  isOpen: boolean;
  onComplete: (data: QuestionnaireData) => void;
}

interface OptionCardProps {
  icon: React.ReactNode;
  label: string;
  selected: boolean;
  onClick: () => void;
}

// ============================================================================
// OPTIONS DATA
// ============================================================================

const USAGE_OPTIONS = [
  { id: 'meetings', label: 'Réunions professionnelles', icon: <Video className="w-5 h-5" /> },
  { id: 'courses', label: 'Cours / Conférences', icon: <GraduationCap className="w-5 h-5" /> },
  { id: 'interviews', label: 'Interviews / Entretiens', icon: <Mic className="w-5 h-5" /> },
  { id: 'notes', label: 'Prise de notes personnelle', icon: <FileText className="w-5 h-5" /> },
  { id: 'other', label: 'Autre', icon: <Sparkles className="w-5 h-5" /> },
];

const STATUS_OPTIONS = [
  { id: 'student', label: 'Étudiant', icon: <GraduationCap className="w-5 h-5" /> },
  { id: 'employee', label: 'Salarié', icon: <Briefcase className="w-5 h-5" /> },
  { id: 'freelance', label: 'Indépendant / Freelance', icon: <User className="w-5 h-5" /> },
  { id: 'company', label: 'Dirigeant / Entreprise', icon: <Building2 className="w-5 h-5" /> },
];

const SECTOR_OPTIONS = [
  { id: 'tech', label: 'Technologie / IT', icon: <Sparkles className="w-5 h-5" /> },
  { id: 'consulting', label: 'Conseil / Services', icon: <Briefcase className="w-5 h-5" /> },
  { id: 'health', label: 'Santé / Médical', icon: <Users className="w-5 h-5" /> },
  { id: 'legal', label: 'Juridique / Droit', icon: <FileText className="w-5 h-5" /> },
  { id: 'education', label: 'Éducation / Formation', icon: <GraduationCap className="w-5 h-5" /> },
  { id: 'finance', label: 'Finance / Banque / Assurance', icon: <Building2 className="w-5 h-5" /> },
  { id: 'public', label: 'Secteur public / Collectivités', icon: <Building2 className="w-5 h-5" /> },
  { id: 'media', label: 'Médias / Communication', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'other', label: 'Autre secteur', icon: <MessageCircle className="w-5 h-5" /> },
];

const SOURCE_OPTIONS = [
  { id: 'social', label: 'Réseaux sociaux', icon: <Megaphone className="w-5 h-5" /> },
  { id: 'wordofmouth', label: 'Bouche à oreille', icon: <Users className="w-5 h-5" /> },
  { id: 'search', label: 'Recherche Google', icon: <Search className="w-5 h-5" /> },
  { id: 'press', label: 'Article / Presse', icon: <Newspaper className="w-5 h-5" /> },
  { id: 'other', label: 'Autre', icon: <MessageCircle className="w-5 h-5" /> },
];

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

const OptionCard: React.FC<OptionCardProps> = ({ icon, label, selected, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 w-full p-4 rounded-xl border-2 transition-all text-left",
      selected
        ? "border-blue-500 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-white hover:border-gray-300 text-gray-700"
    )}
  >
    <div className={cn(
      "w-10 h-10 rounded-lg flex items-center justify-center",
      selected ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"
    )}>
      {icon}
    </div>
    <span className="font-medium text-sm">{label}</span>
    {selected && (
      <Check className="w-5 h-5 text-blue-500 ml-auto" />
    )}
  </motion.button>
);

const ProgressDots: React.FC<{ current: number; total: number }> = ({ current, total }) => (
  <div className="flex gap-1.5 justify-center">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={cn(
          "h-1.5 rounded-full transition-all duration-300",
          i === current
            ? "w-6 bg-blue-500"
            : i < current
            ? "w-1.5 bg-blue-300"
            : "w-1.5 bg-gray-200"
        )}
      />
    ))}
  </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const QUESTIONNAIRE_STORAGE_KEY = 'gilbert_onboarding_questionnaire_completed';

const OnboardingQuestionnaire: React.FC<OnboardingQuestionnaireProps> = ({ isOpen, onComplete }) => {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<QuestionnaireData>({
    phoneCountryCode: '+33',
    phone: '',
    usage: [],
    status: '',
    companyName: '',
    sector: '',
    source: '',
    cguAccepted: false,
  });
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCountryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === data.phoneCountryCode) || COUNTRY_CODES[0];

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value, data.phoneCountryCode);
    setData(prev => ({ ...prev, phone: formatted }));
  };

  const handleCountryChange = (code: string) => {
    setData(prev => ({
      ...prev,
      phoneCountryCode: code,
      phone: formatPhoneNumber(getRawPhone(prev.phone), code)
    }));
    setShowCountryDropdown(false);
  };

  // Calculate total steps (company name for Dirigeant/Entreprise et Salarié + secteur d'activité)
  const needsCompanyName = data.status === 'company' || data.status === 'employee';
  const totalSteps = needsCompanyName ? 7 : 6;

  // Map logical step to actual step (sector = step 4, source = 5, cgu = 6; company optional at 3)
  const getActualStep = (logicalStep: number): number => {
    if (!needsCompanyName && logicalStep >= 3) {
      return logicalStep + 1; // Skip step 3 (company name)
    }
    return logicalStep;
  };

  const actualStep = getActualStep(step);

  const canProceed = useCallback((): boolean => {
    switch (actualStep) {
      case 0: // Phone
        const rawPhone = getRawPhone(data.phone);
        const country = COUNTRY_CODES.find(c => c.code === data.phoneCountryCode);
        return rawPhone.length >= (country?.maxDigits || 9);
      case 1: // Usage (choix multiples : au moins un)
        return data.usage.length > 0;
      case 2: // Status
        return data.status !== '';
      case 3: // Company name (only if company)
        return data.companyName.trim() !== '';
      case 4: // Sector
        return data.sector !== '';
      case 5: // Source
        return data.source !== '';
      case 6: // CGU
        return data.cguAccepted;
      default:
        return false;
    }
  }, [actualStep, data]);

  const handleNext = useCallback(() => {
    if (!canProceed()) return;

    if (step >= totalSteps - 1) {
      onComplete(data);
    } else {
      setStep(prev => prev + 1);
    }
  }, [step, totalSteps, canProceed, data, onComplete]);

  const handleBack = useCallback(() => {
    if (step > 0) {
      setStep(prev => prev - 1);
    }
  }, [step]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceed()) {
      handleNext();
    }
  }, [canProceed, handleNext]);

  if (!isOpen) return null;

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-white flex flex-col"
    >
      {/* Header with progress */}
      <div className="p-6 border-b border-gray-100">
        <div className="max-w-md mx-auto">
          <ProgressDots current={step} total={totalSteps} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <AnimatePresence mode="wait">
            {/* Step 0: Phone */}
            {actualStep === 0 && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Phone className="w-7 h-7 text-blue-500" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Votre numéro de téléphone</h2>
                  <p className="text-gray-500 text-sm">Pour vous contacter si nécessaire</p>
                </div>
                <div className="flex gap-2">
                  {/* Country code dropdown */}
                  <div className="relative" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                      className={cn(
                        "h-12 px-3 flex items-center gap-2 rounded-md border bg-white",
                        "hover:bg-gray-50 transition-colors min-w-[110px] justify-between",
                        showCountryDropdown ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200"
                      )}
                    >
                      <span className="text-lg">{selectedCountry.flag}</span>
                      <span className="text-sm font-medium text-gray-700">{selectedCountry.code}</span>
                      <ChevronDown className={cn(
                        "w-4 h-4 text-gray-400 transition-transform",
                        showCountryDropdown && "rotate-180"
                      )} />
                    </button>

                    {/* Dropdown menu */}
                    <AnimatePresence>
                      {showCountryDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-auto"
                        >
                          {COUNTRY_CODES.map(country => (
                            <button
                              key={country.code}
                              type="button"
                              onClick={() => handleCountryChange(country.code)}
                              className={cn(
                                "w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left",
                                country.code === data.phoneCountryCode && "bg-blue-50"
                              )}
                            >
                              <span className="text-lg">{country.flag}</span>
                              <span className="text-sm text-gray-700 flex-1">{country.country}</span>
                              <span className="text-sm text-gray-500">{country.code}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Phone input */}
                  <Input
                    type="tel"
                    placeholder={selectedCountry.format.replace(/X/g, '0')}
                    value={data.phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="h-12 text-lg flex-1"
                    autoFocus
                  />
                </div>
                {STRIP_LEADING_ZERO_CODES.has(data.phoneCountryCode) && (
                  <p className="text-xs text-gray-500 text-center mt-1">
                    Vous pouvez saisir avec ou sans le 0 au début (ex. 6 12 34 56 78)
                  </p>
                )}
              </motion.div>
            )}

            {/* Step 1: Usage (choix multiples) */}
            {actualStep === 1 && (
              <motion.div
                key="usage"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-gray-900">Comment allez-vous utiliser Gilbert ?</h2>
                  <p className="text-gray-500 text-sm">Sélectionnez un ou plusieurs usages</p>
                </div>
                <div className="space-y-3">
                  {USAGE_OPTIONS.map(option => {
                    const selected = data.usage.includes(option.id);
                    return (
                      <OptionCard
                        key={option.id}
                        icon={option.icon}
                        label={option.label}
                        selected={selected}
                        onClick={() => {
                          setData(prev => ({
                            ...prev,
                            usage: selected
                              ? prev.usage.filter(id => id !== option.id)
                              : [...prev.usage, option.id],
                          }));
                        }}
                      />
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 2: Status */}
            {actualStep === 2 && (
              <motion.div
                key="status"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-gray-900">Quel est votre statut ?</h2>
                  <p className="text-gray-500 text-sm">Pour mieux personnaliser votre expérience</p>
                </div>
                <div className="space-y-3">
                  {STATUS_OPTIONS.map(option => (
                    <OptionCard
                      key={option.id}
                      icon={option.icon}
                      label={option.label}
                      selected={data.status === option.id}
                      onClick={() => setData(prev => ({ ...prev, status: option.id }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 3: Company name (conditional - Dirigeant/Entreprise ou Salarié) */}
            {actualStep === 3 && needsCompanyName && (
              <motion.div
                key="company"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Building2 className="w-7 h-7 text-blue-500" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Nom de votre entreprise</h2>
                  <p className="text-gray-500 text-sm">
                    {data.status === 'employee' ? "Dans quelle entreprise travaillez-vous ?" : "Pour personnaliser vos documents"}
                  </p>
                </div>
                <Input
                  type="text"
                  placeholder="Nom de l'entreprise"
                  value={data.companyName}
                  onChange={(e) => setData(prev => ({ ...prev, companyName: e.target.value }))}
                  onKeyDown={handleKeyDown}
                  className="h-12 text-center text-lg"
                  autoFocus
                />
              </motion.div>
            )}

            {/* Step 4: Secteur d'activité (2 colonnes pour limiter le scroll) */}
            {actualStep === 4 && (
              <motion.div
                key="sector"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-gray-900">Quel est votre secteur d'activité ?</h2>
                  <p className="text-gray-500 text-sm">Sélectionnez le secteur qui vous correspond le mieux</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SECTOR_OPTIONS.map(option => (
                    <OptionCard
                      key={option.id}
                      icon={option.icon}
                      label={option.label}
                      selected={data.sector === option.id}
                      onClick={() => setData(prev => ({ ...prev, sector: option.id }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 5: Source */}
            {actualStep === 5 && (
              <motion.div
                key="source"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-semibold text-gray-900">Comment avez-vous connu Gilbert ?</h2>
                  <p className="text-gray-500 text-sm">Aidez-nous à mieux comprendre notre audience</p>
                </div>
                <div className="space-y-3">
                  {SOURCE_OPTIONS.map(option => (
                    <OptionCard
                      key={option.id}
                      icon={option.icon}
                      label={option.label}
                      selected={data.source === option.id}
                      onClick={() => setData(prev => ({ ...prev, source: option.id }))}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 6: CGU */}
            {actualStep === 6 && (
              <motion.div
                key="cgu"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7 text-green-500" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Dernière étape !</h2>
                  <p className="text-gray-500 text-sm">Acceptez nos conditions pour commencer</p>
                </div>
                <button
                  onClick={() => setData(prev => ({ ...prev, cguAccepted: !prev.cguAccepted }))}
                  className={cn(
                    "flex items-start gap-3 w-full p-4 rounded-xl border-2 transition-all text-left",
                    data.cguAccepted
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                    data.cguAccepted
                      ? "border-green-500 bg-green-500"
                      : "border-gray-300 bg-white"
                  )}>
                    {data.cguAccepted && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm text-gray-700">
                      J'accepte les{' '}
                      <a
                        href="https://gilbert-assistant.fr/conditions-utilisation.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Conditions Générales d'Utilisation
                      </a>
                      {' '}et la{' '}
                      <a
                        href="https://gilbert-assistant.fr/politique-confidentialite.html"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Politique de Confidentialité
                      </a>
                    </p>
                  </div>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer with navigation */}
      <div className="p-6 border-t border-gray-100">
        <div className="max-w-md mx-auto flex items-center justify-between gap-4">
          {step > 0 ? (
            <Button
              variant="ghost"
              onClick={handleBack}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Retour
            </Button>
          ) : (
            <div />
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="gap-2 min-w-[120px]"
          >
            {step >= totalSteps - 1 ? 'Commencer' : 'Continuer'}
            {step < totalSteps - 1 && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};

export default OnboardingQuestionnaire;

// ============================================================================
// HOOK FOR MANAGING QUESTIONNAIRE STATE
// ============================================================================

const getQuestionnaireStorageKey = (userId?: string) =>
  userId ? `${QUESTIONNAIRE_STORAGE_KEY}_${userId}` : QUESTIONNAIRE_STORAGE_KEY;

export const useOnboardingQuestionnaire = (isUserReady: boolean, userId?: string) => {
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [isCompleted, setIsCompleted] = useState(true); // Default to true to avoid flashing
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isUserReady) {
      return;
    }

    const checkOnboardingStatus = async () => {
      // Toujours utiliser le backend comme source de vérité : chaque compte voit le questionnaire si pas encore complété (même appareil, autre compte)
      try {
        const { getOnboardingStatus } = await import('../services/profileService');
        const status = await getOnboardingStatus();

        if (status.onboarding_completed) {
          localStorage.setItem(getQuestionnaireStorageKey(userId), 'true');
          setIsCompleted(true);
        } else {
          setIsCompleted(false);
          setTimeout(() => {
            setShowQuestionnaire(true);
          }, 500);
        }
      } catch (error) {
        logger.error('[Onboarding] Error checking status:', error);
        setIsCompleted(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkOnboardingStatus();
  }, [isUserReady, userId]);

  const completeQuestionnaire = useCallback(() => {
    localStorage.setItem(getQuestionnaireStorageKey(userId), 'true');
    setShowQuestionnaire(false);
    setIsCompleted(true);
  }, [userId]);

  const resetQuestionnaire = useCallback(() => {
    localStorage.removeItem(getQuestionnaireStorageKey(userId));
    setShowQuestionnaire(true);
    setIsCompleted(false);
  }, [userId]);

  return {
    showQuestionnaire,
    isCompleted,
    isLoading,
    completeQuestionnaire,
    resetQuestionnaire,
  };
};

// Expose global function for testing (optionnel: resetQuestionnaire(userId) pour cibler un user)
if (typeof window !== 'undefined') {
  (window as any).resetQuestionnaire = (uid?: string) => {
    const key = uid ? `${QUESTIONNAIRE_STORAGE_KEY}_${uid}` : QUESTIONNAIRE_STORAGE_KEY;
    localStorage.removeItem(key);
    logger.debug('Questionnaire reset! Refresh the page to see it again.');
    window.location.reload();
  };
}
