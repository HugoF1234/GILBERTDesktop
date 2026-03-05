/**
 * DictionaryPage - Page "Mon Dictionnaire"
 * Vocabulaire personnalisé pour améliorer la transcription Voxtral
 * Auto-save, suggestions, edit on hover
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  X,
  Search,
  BookOpen,
  Sparkles,
  Pencil,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useNotification } from '../contexts/NotificationContext';
import { getContextBiasWords, updateContextBiasWords } from '../services/profileService';
import sounds from '../utils/soundDesign';
import { logger } from '@/utils/logger';

/* ─────────── Constants ─────────── */

const GILBERT_BLUE = '#3B82F6';
const MAX_WORDS = 100;

const suggestions = [
  'EBITDA', 'clause de non-concurrence', 'Jean-Marc Lefèvre',
  'garantie de passif', 'NDA', 'earn-out', 'Safran',
  'due diligence', 'RGPD', 'KPI', 'SPA', 'BNP Paribas',
];

/* ─────────── Component ─────────── */

const DictionaryPage: React.FC = () => {
  const { showSuccessPopup, showErrorPopup } = useNotification();

  const [words, setWords] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');

  const isInitialLoad = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getContextBiasWords();
        setWords(data.words || []);
      } catch (error) {
        logger.warn('Impossible de charger le vocabulaire:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Focus edit input
  useEffect(() => {
    if (editingIndex !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingIndex]);

  // Auto-save
  const saveWords = useCallback(async (w: string[]) => {
    setSaving(true);
    try {
      await updateContextBiasWords(w);
    } catch (error: any) {
      showErrorPopup('Erreur', error?.message || 'Impossible de sauvegarder');
    } finally {
      setSaving(false);
    }
  }, [showErrorPopup]);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    saveWords(words);
  }, [words, saveWords]);

  // Add
  const addWord = useCallback((text?: string) => {
    const value = (text ?? inputValue).trim();
    if (!value || words.length >= MAX_WORDS) return;
    if (words.some((w) => w.toLowerCase() === value.toLowerCase())) {
      if (!text) showErrorPopup('Erreur', 'Ce mot existe déjà dans la liste');
      return;
    }
    sounds.click();
    setWords((prev) => [...prev, value]);
    showSuccessPopup('Mot ajouté', `« ${value} » a été ajouté à votre dictionnaire`);
    if (!text) setInputValue('');
    inputRef.current?.focus();
  }, [inputValue, words, showErrorPopup, showSuccessPopup]);

  // Remove
  const removeWord = useCallback((index: number) => {
    setWords((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Edit
  const startEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(words[index]);
  };

  const confirmEdit = () => {
    if (editingIndex === null) return;
    const newVal = editValue.trim();
    if (!newVal) {
      removeWord(editingIndex);
    } else if (newVal !== words[editingIndex]) {
      if (words.some((w, i) => i !== editingIndex && w.toLowerCase() === newVal.toLowerCase())) {
        showErrorPopup('Erreur', 'Ce mot existe déjà dans la liste');
        setEditingIndex(null);
        return;
      }
      setWords((prev) => prev.map((w, i) => (i === editingIndex ? newVal : w)));
    }
    setEditingIndex(null);
  };

  // Filter
  const filteredWords = searchQuery
    ? words.filter((w) => w.toLowerCase().includes(searchQuery.toLowerCase()))
    : words;

  const progress = (words.length / MAX_WORDS) * 100;

  const availableSuggestions = suggestions.filter(
    (s) => !words.some((w) => w.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="h-full w-full bg-[#F8FAFE] flex flex-col">
      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto max-w-2xl px-4 pt-10 pb-6">

          {/* ── Compteur top-right ── */}
          <div className="flex justify-end items-center gap-3 mb-6">
            {saving && <Loader2 className="h-3 w-3 animate-spin text-[#C7C7CC]" />}
            <span className="text-[0.6875rem] tabular-nums text-[#8E8E93]">
              <span className="font-semibold text-[#1A1A2E]">{words.length}</span>
              <span className="text-[#C7C7CC]"> / {MAX_WORDS}</span>
            </span>
            <div className="w-16 h-1.5 rounded-full bg-[#E8EDF5] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%`, backgroundColor: GILBERT_BLUE }}
              />
            </div>
          </div>

          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-500/10 to-blue-500/5">
              <BookOpen className="h-5 w-5" style={{ color: GILBERT_BLUE }} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1A1A2E]">
              Apprenez vos mots à Gilbert
            </h1>
            <p className="mt-2 text-[0.9rem] text-[#C0C0C8]">
              Ajoutez votre vocabulaire métier. Gilbert les reconnaîtra automatiquement dans vos échanges.
            </p>
          </motion.div>

          {/* ── Input ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-10"
          >
            <div className="relative">
              <input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } }}
                placeholder="EBITDA, clause de non-concurrence, Jean Dupont..."
                disabled={words.length >= MAX_WORDS}
                maxLength={50}
                className="h-14 w-full rounded-2xl border border-[#E4E8F1] bg-white pl-6 pr-14 text-[0.9375rem] text-[#1A1A2E] shadow-[0_2px_12px_rgba(0,0,0,0.04)] outline-none transition-all placeholder:text-[#C7C7CC] focus:border-blue-300/50 focus:shadow-[0_2px_20px_rgba(59,130,246,0.08)] disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => addWord()}
                disabled={!inputValue.trim() || words.length >= MAX_WORDS}
                className={cn(
                  'absolute right-2.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-xl flex items-center justify-center text-white transition-all',
                  (!inputValue.trim() || words.length >= MAX_WORDS)
                    ? 'bg-[#E8EDF5] text-[#C7C7CC]'
                    : 'bg-blue-500 hover:bg-blue-600',
                )}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </motion.div>

          {/* ── Loading ── */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#C7C7CC]" />
            </div>
          )}

          {/* ── Suggestions (when empty) ── */}
          {words.length === 0 && !loading && availableSuggestions.length > 0 && (
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-3.5 w-3.5 text-[#D0D0D8]" />
                <span className="text-[0.75rem] font-medium text-[#D0D0D8]">
                  Essayez avec ces exemples
                </span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {availableSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addWord(s)}
                    className="rounded-full border-[1.5px] border-dashed border-[#B8BFCC] bg-white/50 px-3.5 py-1.5 text-[0.75rem] text-[#8892A4] transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-500"
                  >
                    + {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Words list ── */}
          {!loading && words.length > 0 && (
            <div className="space-y-4">
              {/* Search (5+ words) */}
              {words.length >= 5 && (
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#C7C7CC]" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Rechercher un terme..."
                    className="h-9 w-full rounded-xl border border-[#E8EDF5] bg-white pl-9 pr-4 text-[0.75rem] text-[#1A1A2E] outline-none transition-all placeholder:text-[#C7C7CC] focus:border-blue-400/30 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.05)]"
                  />
                </div>
              )}

              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {filteredWords.map((word, index) => {
                  const realIndex = words.indexOf(word);

                  if (editingIndex === realIndex) {
                    return (
                      <span
                        key={`edit-${realIndex}`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-400 bg-blue-50 px-3 py-2 shadow-[0_0_0_3px_rgba(59,130,246,0.08)] transition-all"
                      >
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
                            else if (e.key === 'Escape') setEditingIndex(null);
                          }}
                          onBlur={confirmEdit}
                          className="bg-transparent outline-none text-[0.8125rem] font-medium text-blue-600 caret-blue-500"
                          style={{ width: `${Math.max(editValue.length + 1, 3)}ch` }}
                          maxLength={50}
                        />
                      </span>
                    );
                  }

                  return (
                    <span
                      key={`${word}-${realIndex}`}
                      className="group inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[0.8125rem] font-medium text-blue-600 transition-all hover:shadow-sm cursor-default"
                    >
                      {word}
                      <button
                        type="button"
                        onClick={() => startEdit(realIndex)}
                        className="ml-0.5 rounded-full p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-100"
                      >
                        <Pencil className="h-2.5 w-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWord(realIndex)}
                        className="rounded-full p-0.5 opacity-0 transition-all group-hover:opacity-100 hover:bg-blue-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>

              {filteredWords.length === 0 && searchQuery && (
                <p className="py-6 text-center text-[0.8125rem] text-[#C7C7CC]">
                  Aucun terme trouvé.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Lottie animation - flex-shrink-0, never overlaps ── */}
      <div className="flex-shrink-0 flex justify-center items-start pointer-events-none pt-2 pb-20 min-h-[260px]">
        <div className="w-72 opacity-30" style={{ filter: 'brightness(0.6) sepia(1) hue-rotate(180deg) saturate(4) brightness(1.6)' }}>
          <DotLottieReact
            src="/animations/typing-hands.json"
            loop
            autoplay
            speed={0.75}
          />
        </div>
      </div>
    </div>
  );
};

export default DictionaryPage;
