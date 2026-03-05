/**
 * Data Store - Store Zustand global pour les données métier
 *
 * Stratégie "Stale-While-Revalidate":
 * 1. Afficher immédiatement les données en cache
 * 2. Revalider en arrière-plan si les données sont périmées
 * 3. Mettre à jour l'UI silencieusement
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Meeting } from '@/services/meetingService'
import type { Template, TemplateListResponse } from '@/services/templateService'
import type { Folder } from '@/services/folderService'
import type { Contact } from '@/services/shareService'
import { getAllMeetings } from '@/services/meetingService'
import { getMyTemplates } from '@/services/templateService'
import { getFolders } from '@/services/folderService'
import { getSharedMeetings, getMyContacts } from '@/services/shareService'

// ============================================================================
// TYPES
// ============================================================================

type DataStatus = 'idle' | 'loading' | 'fresh' | 'stale' | 'error'

interface CacheMetadata {
  status: DataStatus
  lastFetch: number | null
  error: string | null
}

// TTL en millisecondes
const TTL = {
  meetings: 30 * 1000,        // 30 secondes - change fréquemment
  sharedMeetings: 60 * 1000,  // 1 minute - dépend d'actions externes
  templates: 5 * 60 * 1000,   // 5 minutes - change rarement
  folders: 2 * 60 * 1000,     // 2 minutes - change modérément
  contacts: 10 * 60 * 1000,   // 10 minutes - change très rarement
} as const

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface DataState {
  // === Meetings ===
  meetings: Meeting[]
  meetingsMeta: CacheMetadata

  // === Shared Meetings ===
  sharedMeetings: Meeting[]
  sharedMeetingsMeta: CacheMetadata

  // === Templates ===
  templates: Template[]
  defaultTemplateId: string | null
  templatesMeta: CacheMetadata

  // === Folders ===
  folders: Folder[]
  foldersMeta: CacheMetadata

  // === Contacts ===
  contacts: Contact[]
  contactsMeta: CacheMetadata

  // === Actions de fetch ===
  fetchMeetings: (force?: boolean) => Promise<Meeting[]>
  fetchSharedMeetings: (force?: boolean) => Promise<Meeting[]>
  fetchTemplates: (force?: boolean) => Promise<Template[]>
  fetchFolders: (force?: boolean) => Promise<Folder[]>
  fetchContacts: (force?: boolean) => Promise<Contact[]>
  fetchAll: (force?: boolean) => Promise<void>

  // === Invalidation ===
  invalidateMeetings: () => void
  invalidateSharedMeetings: () => void
  invalidateTemplates: () => void
  invalidateFolders: () => void
  invalidateContacts: () => void
  invalidateAll: () => void

  // === Updates optimistes pour meetings ===
  addMeeting: (meeting: Meeting) => void
  updateMeeting: (id: string, updates: Partial<Meeting>) => void
  removeMeeting: (id: string) => void

  // === Updates optimistes pour autres données ===
  addTemplate: (template: Template) => void
  updateTemplate: (id: string, updates: Partial<Template>) => void
  removeTemplate: (id: string) => void
  addFolder: (folder: Folder) => void
  updateFolder: (id: string, updates: Partial<Folder>) => void
  removeFolder: (id: string) => void

  // === Helpers ===
  getMeetingById: (id: string) => Meeting | undefined
  getTemplateById: (id: string) => Template | undefined
  getFolderById: (id: string) => Folder | undefined
  isStale: (type: keyof typeof TTL) => boolean
  reset: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

const createInitialMeta = (): CacheMetadata => ({
  status: 'idle',
  lastFetch: null,
  error: null,
})

const isDataStale = (lastFetch: number | null, ttl: number): boolean => {
  if (!lastFetch) return true
  return Date.now() - lastFetch > ttl
}

// ============================================================================
// IN-FLIGHT GUARDS - Empêche les appels API concurrents qui écrasent les données
// ============================================================================

let _meetingsFetchPromise: Promise<Meeting[]> | null = null
let _sharedMeetingsFetchPromise: Promise<Meeting[]> | null = null

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useDataStore = create<DataState>()(
  persist(
    (set, get) => ({
      // === Initial State ===
      meetings: [],
      meetingsMeta: createInitialMeta(),

      sharedMeetings: [],
      sharedMeetingsMeta: createInitialMeta(),

      templates: [],
      defaultTemplateId: null,
      templatesMeta: createInitialMeta(),

      folders: [],
      foldersMeta: createInitialMeta(),

      contacts: [],
      contactsMeta: createInitialMeta(),

      // === Fetch Meetings ===
      fetchMeetings: async (force = false) => {
        const state = get()
        const isStale = isDataStale(state.meetingsMeta.lastFetch, TTL.meetings)

        // Si pas force et données fraîches, retourner le cache
        if (!force && !isStale && state.meetingsMeta.status === 'fresh') {
          return state.meetings
        }

        // Si un fetch est déjà en vol, réutiliser la même promesse
        // Empêche les appels concurrents (polling + import) d'écraser les données
        if (_meetingsFetchPromise) {
          return _meetingsFetchPromise
        }

        // Marquer comme stale si on a des données, sinon loading
        set({
          meetingsMeta: {
            ...state.meetingsMeta,
            status: state.meetings.length > 0 ? 'stale' : 'loading',
          },
        })

        _meetingsFetchPromise = (async () => {
          try {
            const data = await getAllMeetings()
            const sortedData = data.sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )

            // Sécurité : si l'API retourne vide mais qu'on a des données,
            // garder les données existantes (évite le flash de liste vide)
            const currentMeetings = get().meetings
            if (sortedData.length === 0 && currentMeetings.length > 0) {
              set({
                meetingsMeta: {
                  status: 'stale',
                  lastFetch: null,
                  error: null,
                },
              })
              return currentMeetings
            }

            set({
              meetings: sortedData,
              meetingsMeta: {
                status: 'fresh',
                lastFetch: Date.now(),
                error: null,
              },
            })

            return sortedData
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
            set({
              meetingsMeta: {
                ...get().meetingsMeta,
                status: 'error',
                error: errorMessage,
              },
            })
            return get().meetings
          } finally {
            _meetingsFetchPromise = null
          }
        })()

        return _meetingsFetchPromise
      },

      // === Fetch Shared Meetings ===
      fetchSharedMeetings: async (force = false) => {
        const state = get()
        const isStale = isDataStale(state.sharedMeetingsMeta.lastFetch, TTL.sharedMeetings)

        if (!force && !isStale && state.sharedMeetingsMeta.status === 'fresh') {
          return state.sharedMeetings
        }

        if (_sharedMeetingsFetchPromise) {
          return _sharedMeetingsFetchPromise
        }

        set({
          sharedMeetingsMeta: {
            ...state.sharedMeetingsMeta,
            status: state.sharedMeetings.length > 0 ? 'stale' : 'loading',
          },
        })

        _sharedMeetingsFetchPromise = (async () => {
          try {
            const data = await getSharedMeetings()
            const sortedData = (data as unknown as Meeting[]).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            ).map(m => ({
              ...m,
              is_shared: true,
            }))

            const currentShared = get().sharedMeetings
            if (sortedData.length === 0 && currentShared.length > 0) {
              set({
                sharedMeetingsMeta: {
                  status: 'stale',
                  lastFetch: null,
                  error: null,
                },
              })
              return currentShared
            }

            set({
              sharedMeetings: sortedData,
              sharedMeetingsMeta: {
                status: 'fresh',
                lastFetch: Date.now(),
                error: null,
              },
            })

            return sortedData
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
            set({
              sharedMeetingsMeta: {
                ...get().sharedMeetingsMeta,
                status: 'error',
                error: errorMessage,
              },
            })
            return get().sharedMeetings
          } finally {
            _sharedMeetingsFetchPromise = null
          }
        })()

        return _sharedMeetingsFetchPromise
      },

      // === Fetch Templates ===
      fetchTemplates: async (force = false) => {
        const state = get()
        const isStale = isDataStale(state.templatesMeta.lastFetch, TTL.templates)

        if (!force && !isStale && state.templatesMeta.status === 'fresh') {
          return state.templates
        }

        if (state.templatesMeta.status === 'loading') {
          return state.templates
        }

        set({
          templatesMeta: {
            ...state.templatesMeta,
            status: state.templates.length > 0 ? 'stale' : 'loading',
          },
        })

        try {
          const response: TemplateListResponse = await getMyTemplates()

          set({
            templates: response.templates || [],
            defaultTemplateId: response.default_template_id || null,
            templatesMeta: {
              status: 'fresh',
              lastFetch: Date.now(),
              error: null,
            },
          })

          return response.templates || []
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
          set({
            templatesMeta: {
              ...get().templatesMeta,
              status: 'error',
              error: errorMessage,
            },
          })
          return get().templates
        }
      },

      // === Fetch Folders ===
      fetchFolders: async (force = false) => {
        const state = get()
        const isStale = isDataStale(state.foldersMeta.lastFetch, TTL.folders)

        if (!force && !isStale && state.foldersMeta.status === 'fresh') {
          return state.folders
        }

        if (state.foldersMeta.status === 'loading') {
          return state.folders
        }

        set({
          foldersMeta: {
            ...state.foldersMeta,
            status: state.folders.length > 0 ? 'stale' : 'loading',
          },
        })

        try {
          const data = await getFolders()

          set({
            folders: data,
            foldersMeta: {
              status: 'fresh',
              lastFetch: Date.now(),
              error: null,
            },
          })

          return data
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
          set({
            foldersMeta: {
              ...get().foldersMeta,
              status: 'error',
              error: errorMessage,
            },
          })
          return get().folders
        }
      },

      // === Fetch Contacts ===
      fetchContacts: async (force = false) => {
        const state = get()
        const isStale = isDataStale(state.contactsMeta.lastFetch, TTL.contacts)

        if (!force && !isStale && state.contactsMeta.status === 'fresh') {
          return state.contacts
        }

        if (state.contactsMeta.status === 'loading') {
          return state.contacts
        }

        set({
          contactsMeta: {
            ...state.contactsMeta,
            status: state.contacts.length > 0 ? 'stale' : 'loading',
          },
        })

        try {
          const data = await getMyContacts()

          set({
            contacts: data,
            contactsMeta: {
              status: 'fresh',
              lastFetch: Date.now(),
              error: null,
            },
          })

          return data
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
          set({
            contactsMeta: {
              ...get().contactsMeta,
              status: 'error',
              error: errorMessage,
            },
          })
          return get().contacts
        }
      },

      // === Fetch All ===
      fetchAll: async (force = false) => {
        const { fetchMeetings, fetchSharedMeetings, fetchTemplates, fetchFolders, fetchContacts } = get()
        await Promise.all([
          fetchMeetings(force),
          fetchSharedMeetings(force),
          fetchTemplates(force),
          fetchFolders(force),
          fetchContacts(force),
        ])
      },

      // === Invalidation ===
      invalidateMeetings: () => {
        set({
          meetingsMeta: {
            ...get().meetingsMeta,
            status: 'stale',
          },
        })
      },

      invalidateSharedMeetings: () => {
        set({
          sharedMeetingsMeta: {
            ...get().sharedMeetingsMeta,
            status: 'stale',
          },
        })
      },

      invalidateTemplates: () => {
        set({
          templatesMeta: {
            ...get().templatesMeta,
            status: 'stale',
          },
        })
      },

      invalidateFolders: () => {
        set({
          foldersMeta: {
            ...get().foldersMeta,
            status: 'stale',
          },
        })
      },

      invalidateContacts: () => {
        set({
          contactsMeta: {
            ...get().contactsMeta,
            status: 'stale',
          },
        })
      },

      invalidateAll: () => {
        const { invalidateMeetings, invalidateSharedMeetings, invalidateTemplates, invalidateFolders, invalidateContacts } = get()
        invalidateMeetings()
        invalidateSharedMeetings()
        invalidateTemplates()
        invalidateFolders()
        invalidateContacts()
      },

      // === Optimistic Updates - Meetings ===
      addMeeting: (meeting: Meeting) => {
        set((state) => ({
          meetings: [meeting, ...state.meetings],
        }))
      },

      updateMeeting: (id: string, updates: Partial<Meeting>) => {
        set((state) => ({
          meetings: state.meetings.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
          sharedMeetings: state.sharedMeetings.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }))
      },

      removeMeeting: (id: string) => {
        set((state) => ({
          meetings: state.meetings.filter((m) => m.id !== id),
          sharedMeetings: state.sharedMeetings.filter((m) => m.id !== id),
        }))
      },

      // === Optimistic Updates - Templates ===
      addTemplate: (template: Template) => {
        set((state) => ({
          templates: [template, ...state.templates],
        }))
      },

      updateTemplate: (id: string, updates: Partial<Template>) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }))
      },

      removeTemplate: (id: string) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id),
        }))
      },

      // === Optimistic Updates - Folders ===
      addFolder: (folder: Folder) => {
        set((state) => ({
          folders: [folder, ...state.folders],
        }))
      },

      updateFolder: (id: string, updates: Partial<Folder>) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, ...updates } : f
          ),
        }))
      },

      removeFolder: (id: string) => {
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
        }))
      },

      // === Helpers ===
      getMeetingById: (id: string) => {
        const state = get()
        return state.meetings.find((m) => m.id === id) ||
               state.sharedMeetings.find((m) => m.id === id)
      },

      getTemplateById: (id: string) => {
        return get().templates.find((t) => t.id === id)
      },

      getFolderById: (id: string) => {
        return get().folders.find((f) => f.id === id)
      },

      isStale: (type: keyof typeof TTL) => {
        const state = get()
        const metaMap = {
          meetings: state.meetingsMeta,
          sharedMeetings: state.sharedMeetingsMeta,
          templates: state.templatesMeta,
          folders: state.foldersMeta,
          contacts: state.contactsMeta,
        }
        const meta = metaMap[type]
        return isDataStale(meta.lastFetch, TTL[type])
      },

      reset: () => {
        set({
          meetings: [],
          meetingsMeta: createInitialMeta(),
          sharedMeetings: [],
          sharedMeetingsMeta: createInitialMeta(),
          templates: [],
          defaultTemplateId: null,
          templatesMeta: createInitialMeta(),
          folders: [],
          foldersMeta: createInitialMeta(),
          contacts: [],
          contactsMeta: createInitialMeta(),
        })
      },
    }),
    {
      name: 'gilbert-data-store',
      // Ne persister que les données légères, pas les transcriptions ni les résumés complets
      partialize: (state) => ({
        // Exclure transcript_text et summary_text des meetings pour éviter QuotaExceededError
        meetings: state.meetings.map(m => ({
          ...m,
          transcript_text: undefined,
          summary_text: undefined,
          transcription: undefined,
          transcript: undefined,
        })),
        sharedMeetings: state.sharedMeetings.map(m => ({
          ...m,
          transcript_text: undefined,
          summary_text: undefined,
          transcription: undefined,
          transcript: undefined,
        })),
        templates: state.templates,
        defaultTemplateId: state.defaultTemplateId,
        folders: state.folders,
        contacts: state.contacts,
        // Persister lastFetch pour savoir si les données sont stale au reload
        meetingsMeta: { lastFetch: state.meetingsMeta.lastFetch },
        sharedMeetingsMeta: { lastFetch: state.sharedMeetingsMeta.lastFetch },
        templatesMeta: { lastFetch: state.templatesMeta.lastFetch },
        foldersMeta: { lastFetch: state.foldersMeta.lastFetch },
        contactsMeta: { lastFetch: state.contactsMeta.lastFetch },
      }),
      // Merger pour restaurer les métadonnées complètes
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        meetingsMeta: {
          ...createInitialMeta(),
          lastFetch: persistedState?.meetingsMeta?.lastFetch || null,
          status: persistedState?.meetings?.length > 0 ? 'stale' : 'idle',
        },
        sharedMeetingsMeta: {
          ...createInitialMeta(),
          lastFetch: persistedState?.sharedMeetingsMeta?.lastFetch || null,
          status: persistedState?.sharedMeetings?.length > 0 ? 'stale' : 'idle',
        },
        templatesMeta: {
          ...createInitialMeta(),
          lastFetch: persistedState?.templatesMeta?.lastFetch || null,
          status: persistedState?.templates?.length > 0 ? 'stale' : 'idle',
        },
        foldersMeta: {
          ...createInitialMeta(),
          lastFetch: persistedState?.foldersMeta?.lastFetch || null,
          status: persistedState?.folders?.length > 0 ? 'stale' : 'idle',
        },
        contactsMeta: {
          ...createInitialMeta(),
          lastFetch: persistedState?.contactsMeta?.lastFetch || null,
          status: persistedState?.contacts?.length > 0 ? 'stale' : 'idle',
        },
      }),
      // Gestion d'erreur pour QuotaExceededError
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch (e) {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (e) {
            try {
              localStorage.removeItem(name);
              localStorage.setItem(name, JSON.stringify(value));
            } catch (e2) {
              // Silently fail on cache errors
            }
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch (e) {
            // Silently fail on cache errors
          }
        },
      },
    }
  )
)

// ============================================================================
// SELECTORS (pour éviter les re-renders inutiles)
// ============================================================================

export const selectMeetings = (state: DataState) => state.meetings
export const selectMeetingsStatus = (state: DataState) => state.meetingsMeta.status
export const selectMeetingsLoading = (state: DataState) =>
  state.meetingsMeta.status === 'loading' || state.meetingsMeta.status === 'idle'

export const selectSharedMeetings = (state: DataState) => state.sharedMeetings
export const selectSharedMeetingsStatus = (state: DataState) => state.sharedMeetingsMeta.status

export const selectTemplates = (state: DataState) => state.templates
export const selectTemplatesStatus = (state: DataState) => state.templatesMeta.status
export const selectDefaultTemplateId = (state: DataState) => state.defaultTemplateId

export const selectFolders = (state: DataState) => state.folders
export const selectFoldersStatus = (state: DataState) => state.foldersMeta.status

export const selectContacts = (state: DataState) => state.contacts
export const selectContactsStatus = (state: DataState) => state.contactsMeta.status
