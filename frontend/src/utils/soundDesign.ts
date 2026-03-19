// Sound Design - Ultra-subtle, luxury interaction sounds
// Inspired by high-end apps: barely noticeable, dry, sophisticated
// Rule: Less is more. Only important actions get sounds.

const SOUND_DESIGN_STORAGE_KEY = 'gilbert_sound_design_enabled';

export const getSoundDesignEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(SOUND_DESIGN_STORAGE_KEY);
  if (stored === null) return true; // Activé par défaut
  return stored === 'true';
};

export const setSoundDesignEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SOUND_DESIGN_STORAGE_KEY, String(enabled));
};

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
};

// Check if user prefers reduced motion
const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// ============================================================================
// LUXURY SOUND PRIMITIVES - Dry, muffled, sophisticated
// ============================================================================

/**
 * Soft thud - satisfying completion sound
 * Used for: important confirmations like save
 */
const playThud = (ctx: AudioContext): void => {
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Low, short thud
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

  // Very heavy low-pass
  filter.type = 'lowpass';
  filter.frequency.value = 200;
  filter.Q.value = 1;

  // Quick decay
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.06);
};

/**
 * Satisfying click - for navigation/tab changes
 * Short, snappy, pleasant - like a quality mechanical button
 */
const playNavClick = (ctx: AudioContext): void => {
  const now = ctx.currentTime;

  // Main click tone - short and snappy
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  // Pleasant mid-frequency click
  osc.type = 'sine';
  osc.frequency.setValueAtTime(600, now);
  osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

  // Slight resonance for character
  filter.type = 'lowpass';
  filter.frequency.value = 800;
  filter.Q.value = 1.2;

  // Quick attack, quick decay - satisfying snap
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.003); // Fast attack
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035); // Quick decay

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.05);

  // Add subtle "body" with a lower frequency
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(180, now);
  osc2.frequency.exponentialRampToValueAtTime(100, now + 0.02);

  gain2.gain.setValueAtTime(0, now);
  gain2.gain.linearRampToValueAtTime(0.05, now + 0.002);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now);
  osc2.stop(now + 0.04);
};

/**
 * Soft drop - for delete/remove actions
 * Gentle descending tone, not alarming
 */
const playDrop = (ctx: AudioContext): void => {
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);

  filter.type = 'lowpass';
  filter.frequency.value = 400;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.1);
};

/**
 * Attention sound - for discard/warning actions
 * Two descending tones, soft but noticeable
 */
const playAttention = (ctx: AudioContext): void => {
  const now = ctx.currentTime;

  // First tone - higher
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  const filter1 = ctx.createBiquadFilter();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(500, now);
  osc1.frequency.exponentialRampToValueAtTime(350, now + 0.08);

  filter1.type = 'lowpass';
  filter1.frequency.value = 600;
  filter1.Q.value = 0.8;

  gain1.gain.setValueAtTime(0.05, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  osc1.connect(filter1);
  filter1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + 0.12);

  // Second tone - lower, delayed
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  const filter2 = ctx.createBiquadFilter();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(350, now + 0.12);
  osc2.frequency.exponentialRampToValueAtTime(200, now + 0.22);

  filter2.type = 'lowpass';
  filter2.frequency.value = 500;
  filter2.Q.value = 0.8;

  gain2.gain.setValueAtTime(0, now);
  gain2.gain.setValueAtTime(0.05, now + 0.12);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

  osc2.connect(filter2);
  filter2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now);
  osc2.stop(now + 0.25);
};

// ============================================================================
// PUBLIC API - Only essential sounds
// ============================================================================

type SoundType =
  | 'click'      // Deprecated - no sound for regular clicks
  | 'toggle'     // Deprecated - no sound for toggles
  | 'success'    // Deprecated - use 'save' instead
  | 'tab'        // Ultra-subtle navigation
  | 'pop'        // Deprecated - too playful
  | 'save'       // Confirmation tick
  | 'delete'     // Soft drop
  | 'discard'    // Attention sound for discarded recordings
  | 'slide'      // Deprecated
  | 'warning'    // Deprecated - too alarming
  | 'hover'      // Deprecated - no hover sounds
  | 'generate'   // Deprecated - too playful
  | 'softSlide'  // Navigation swoosh
  | 'softTab';   // Same as tab

export const playSound = (type: SoundType): void => {
  if (!getSoundDesignEnabled()) return;
  if (prefersReducedMotion()) return;

  try {
    const ctx = getAudioContext();

    switch (type) {
      case 'save':
      case 'success':
        playThud(ctx);
        break;

      case 'delete':
        playDrop(ctx);
        break;

      case 'discard':
        playAttention(ctx);
        break;

      case 'tab':
      case 'softTab':
      case 'softSlide':
        playNavClick(ctx);
        break;

      // All other sounds are now silent - too intrusive
      case 'click':
      case 'toggle':
      case 'pop':
      case 'slide':
      case 'warning':
      case 'hover':
      case 'generate':
      default:
        // No sound - these were too intrusive
        break;
    }
  } catch {
    // Silently fail
  }
};

// Convenience functions - keep API compatibility but most are now silent
export const sounds = {
  click: () => {}, // Silent - regular clicks don't need sound
  toggle: () => {}, // Silent
  success: () => playSound('save'),
  tab: () => playSound('tab'),
  pop: () => {}, // Silent - was too playful
  save: () => playSound('save'),
  delete: () => playSound('delete'),
  discard: () => playSound('discard'), // Attention sound for discarded recordings
  slide: () => {}, // Silent
  warning: () => {}, // Silent - too alarming
  hover: () => {}, // Silent - never should have hover sounds
  generate: () => {}, // Silent - was too Star Wars
  softSlide: () => playSound('softSlide'),
  softTab: () => playSound('softTab'),
};

export const useSoundEffect = () => sounds;

export default sounds;
