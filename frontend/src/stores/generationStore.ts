import { create } from 'zustand'

// Étapes de génération - messages engageants qui occupent l'utilisateur pendant le chargement
// Messages variés pour éviter la répétition et rendre l'attente agréable
const GENERATION_STEPS = [
  { id: 'thinking', label: 'Gilbert réfléchit...' },
  { id: 'listen', label: 'Écoute attentive de votre échange...' },
  { id: 'speakers', label: 'Différenciation des locuteurs...' },
  { id: 'complex', label: 'Analyse des mots complexes...' },
  { id: 'acronyms', label: 'Compréhension des acronymes...' },
  { id: 'context', label: 'Analyse du contexte...' },
  { id: 'technical', label: 'Décryptage du jargon technique...' },
  { id: 'topics', label: 'Identification des sujets abordés...' },
  { id: 'nuances', label: 'Détection des nuances...' },
  { id: 'decisions', label: 'Extraction des décisions...' },
  { id: 'actions', label: 'Repérage des actions à mener...' },
  { id: 'names', label: 'Reconnaissance des noms propres...' },
  { id: 'dates', label: 'Identification des dates et délais...' },
  { id: 'organizing', label: 'Organisation des informations...' },
  { id: 'structure', label: 'Structuration du compte-rendu...' },
  { id: 'formulating', label: 'Rédaction des points clés...' },
  { id: 'clarity', label: 'Amélioration de la clarté...' },
  { id: 'polish', label: 'Peaufinage final...' },
] as const

// Fun facts sur l'importance des comptes-rendus
const FUN_FACTS = [
  'Un compte-rendu bien structuré fait gagner en moyenne 2h par semaine.',
  'Les équipes qui documentent leurs échanges sont plus alignées sur les objectifs.',
  'Retrouver une information dans un compte-rendu prend 10x moins de temps.',
  'Les décisions documentées ont plus de chances d\'être suivies d\'effet.',
  'Un bon compte-rendu évite de refaire les mêmes discussions.',
  'Les nouveaux collaborateurs s\'intègrent plus vite avec un historique écrit.',
  'Documenter libère l\'esprit pour se concentrer sur l\'essentiel.',
  'Les malentendus diminuent quand tout est écrit noir sur blanc.',
] as const

// Pour la compatibilité avec le code existant
const GILBERT_PHRASES = GENERATION_STEPS.map(s => s.label)

type ContentItem = {
  text: string
  type: 'gilbert' | 'fact'
}

const shuffleContent = (): ContentItem[] => {
  return GENERATION_STEPS.map(s => ({ text: s.label, type: 'gilbert' as const }))
}

// Pour la compatibilité
const GENERATION_PHRASES = GILBERT_PHRASES.map(text => ({ text, emoji: '' }))
const GENERATION_PHRASES_SIMPLE = [...GILBERT_PHRASES]

export interface ActiveGeneration {
  meetingId: string
  meetingTitle: string
  status: 'processing' | 'completed' | 'error'
  currentPhraseIndex: number
  startedAt: number
  completedAt: number | null // Quand le backend a terminé
  animationDone: boolean // Quand l'animation UI est terminée
  shuffledContent: ContentItem[]
  bannerDismissed: boolean // Utilisateur a fermé le bandeau mais génération toujours en cours
}

interface GenerationState {
  activeGenerations: Map<string, ActiveGeneration>
  addGeneration: (meetingId: string, title: string) => void
  updateGenerationStatus: (meetingId: string, status: ActiveGeneration['status']) => void
  markCompleted: (meetingId: string) => void // Backend a terminé
  markAnimationDone: (meetingId: string) => void // Animation UI terminée
  removeGeneration: (meetingId: string) => void
  dismissBanner: (meetingId: string) => void // Fermer le bandeau mais garder l'indicateur sidebar
  advancePhrase: (meetingId: string) => void
  getActiveGeneration: (meetingId: string) => ActiveGeneration | undefined
  hasActiveGenerations: () => boolean
  hasDismissedGenerations: () => boolean // Génération en cours avec bandeau fermé
  isAnimationComplete: (meetingId: string) => boolean
  getCurrentPhrase: (meetingId: string) => string
  getCurrentPhraseWithEmoji: (meetingId: string) => { text: string; emoji: string }
  getCurrentContent: (meetingId: string) => ContentItem
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  activeGenerations: new Map(),

  addGeneration: (meetingId, title) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      // Ne pas écraser si déjà existant (évite les resets)
      if (!newMap.has(meetingId)) {
        newMap.set(meetingId, {
          meetingId,
          meetingTitle: title,
          status: 'processing',
          currentPhraseIndex: 0,
          startedAt: Date.now(),
          completedAt: null,
          animationDone: false,
          shuffledContent: shuffleContent(),
          bannerDismissed: false,
        })
      }
      return { activeGenerations: newMap }
    })
  },

  updateGenerationStatus: (meetingId, status) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      const existing = newMap.get(meetingId)
      if (existing) {
        newMap.set(meetingId, { ...existing, status })
      }
      return { activeGenerations: newMap }
    })
  },

  markCompleted: (meetingId) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      const existing = newMap.get(meetingId)
      if (existing && existing.completedAt === null) {
        newMap.set(meetingId, {
          ...existing,
          status: 'completed',
          completedAt: Date.now()
        })
      }
      return { activeGenerations: newMap }
    })
  },

  markAnimationDone: (meetingId) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      const existing = newMap.get(meetingId)
      if (existing) {
        newMap.set(meetingId, { ...existing, animationDone: true })
      }
      return { activeGenerations: newMap }
    })
  },

  removeGeneration: (meetingId) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      newMap.delete(meetingId)
      return { activeGenerations: newMap }
    })
  },

  dismissBanner: (meetingId) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      const existing = newMap.get(meetingId)
      if (existing) {
        newMap.set(meetingId, { ...existing, bannerDismissed: true })
      }
      return { activeGenerations: newMap }
    })
  },

  advancePhrase: (meetingId) => {
    set((state) => {
      const newMap = new Map(state.activeGenerations)
      const existing = newMap.get(meetingId)
      if (existing && existing.status === 'processing') {
        const contentLength = existing.shuffledContent.length
        const nextIndex = (existing.currentPhraseIndex + 1) % contentLength
        newMap.set(meetingId, { ...existing, currentPhraseIndex: nextIndex })
      }
      return { activeGenerations: newMap }
    })
  },

  getActiveGeneration: (meetingId) => {
    return get().activeGenerations.get(meetingId)
  },

  hasActiveGenerations: () => {
    const generations = get().activeGenerations
    for (const gen of generations.values()) {
      if (gen.status === 'processing' && !gen.bannerDismissed) return true
    }
    return false
  },

  hasDismissedGenerations: () => {
    const generations = get().activeGenerations
    for (const gen of generations.values()) {
      if (gen.status === 'processing' && gen.bannerDismissed) return true
    }
    return false
  },

  isAnimationComplete: (meetingId) => {
    const gen = get().activeGenerations.get(meetingId)
    return gen?.animationDone ?? false
  },

  getCurrentPhrase: (meetingId) => {
    const gen = get().activeGenerations.get(meetingId)
    if (!gen || !gen.shuffledContent.length) return GILBERT_PHRASES[0]
    return gen.shuffledContent[gen.currentPhraseIndex].text
  },

  getCurrentPhraseWithEmoji: (meetingId) => {
    const gen = get().activeGenerations.get(meetingId)
    if (!gen || !gen.shuffledContent.length) return { text: GILBERT_PHRASES[0], emoji: '' }
    return { text: gen.shuffledContent[gen.currentPhraseIndex].text, emoji: '' }
  },

  getCurrentContent: (meetingId) => {
    const gen = get().activeGenerations.get(meetingId)
    if (!gen || !gen.shuffledContent.length) return { text: GILBERT_PHRASES[0], type: 'gilbert' }
    return gen.shuffledContent[gen.currentPhraseIndex]
  },
}))

export { GENERATION_PHRASES, GENERATION_PHRASES_SIMPLE, GILBERT_PHRASES, FUN_FACTS, GENERATION_STEPS }
export type { ContentItem }

