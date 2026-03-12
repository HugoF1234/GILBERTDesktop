# Stratégie d'Optimisation des Performances - Gilbert

> Document de diagnostic et guide d'implémentation pour optimiser les temps de chargement.
> Ce document sera enrichi à chaque modification pour permettre l'intégration sur la web app.

---

## Table des matières
1. [Diagnostic Initial](#diagnostic-initial)
2. [Architecture Actuelle](#architecture-actuelle)
3. [Problèmes Identifiés](#problèmes-identifiés)
4. [Stratégie de Cache Globale](#stratégie-de-cache-globale)
5. [Plan d'Implémentation](#plan-dimplémentation)
6. [Changelog des Modifications](#changelog-des-modifications)

---

## Diagnostic Initial

### Date: 15 Janvier 2026
### Contexte
Les pages de l'application (notamment `/meetings`) présentent des temps de chargement lents. À chaque navigation, les données sont rechargées depuis le backend.

### Symptômes Observés
- Temps de chargement visible à chaque changement de page
- Spinner/loader affiché même pour des données déjà consultées
- Sensation de lenteur lors de la navigation

---

## Architecture Actuelle

### Frontend (React + TypeScript + Vite)

#### Structure des Services (`frontend/src/services/`)
```
apiClient.ts          → Client HTTP centralisé (fetch)
meetingService.ts     → CRUD meetings + cache localStorage
templateService.ts    → CRUD templates (pas de cache)
folderService.ts      → CRUD dossiers (pas de cache)
shareService.ts       → Gestion partages (pas de cache)
contactService.ts     → Gestion contacts (pas de cache)
```

#### Stores Zustand Existants (`frontend/src/stores/`)
```
navigationStore.ts    → Vue actuelle, état sidebar
recordingStore.ts     → État enregistrement audio
generationStore.ts    → État génération de résumés
tauriStore.ts         → État spécifique desktop
```

**Problème**: Aucun store pour les données métier (meetings, templates, folders, contacts)

#### Routing (`frontend/src/rooter/index.tsx`)
- Utilise `React.lazy()` pour le code-splitting
- Chaque page est montée/démontée à la navigation
- Pas de persistance d'état entre les routes

### Backend (FastAPI + PostgreSQL + Redis)

#### Endpoints Principaux
```
/simple/meetings/         → Liste meetings utilisateur
/simple/meetings/{id}     → Détails meeting
/api/templates/           → Liste templates
/api/folders/             → Liste dossiers
/api/shares/              → Meetings partagés
/api/contacts/            → Contacts utilisateur
```

#### Utilisation de Redis
- **Actuel**: Tracking utilisateurs en ligne, enregistrements actifs
- **Non utilisé pour**: Cache des données métier

---

## Problèmes Identifiés

### 1. Pas de Store Global pour les Données Métier
**Fichier**: Composants individuels (ExchangesPage.tsx, etc.)
**Impact**: CRITIQUE

Les données sont stockées dans le `useState` local de chaque composant :
```typescript
// ExchangesPage.tsx - Ligne ~1500
const [meetings, setMeetings] = useState<Meeting[]>([])
const [sharedMeetings, setSharedMeetings] = useState<Meeting[]>([])
const [folders, setFolders] = useState<FolderType[]>([])
const [templates, setTemplates] = useState<Template[]>([])
```

À chaque navigation, le composant est démonté → état perdu → rechargement complet.

### 2. Appels API Redondants
**Fichier**: Multiple composants
**Impact**: ÉLEVÉ

Même donnée récupérée par plusieurs pages :

| Donnée | Pages qui l'appellent |
|--------|----------------------|
| `getAllMeetings()` | ExchangesPage, ProfilePage, Dashboard, OrganizationsView, MyMeetings |
| `getSharedMeetings()` | ExchangesPage, SharesView, OrganizationsView, MyMeetings |
| `getFolders()` | ExchangesPage, FoldersTab, MyMeetings |
| `getMyTemplates()` | ExchangesPage, SharesView, AdminTemplatesTab, MyMeetings |

### 3. Cache HTTP Désactivé
**Fichier**: `frontend/src/services/apiClient.ts` - Ligne 100-101
**Impact**: MOYEN

```typescript
headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
headers['Pragma'] = 'no-cache';
```

Toutes les requêtes ignorent le cache HTTP du navigateur.

### 4. Polling Agressif
**Fichier**: `ExchangesPage.tsx` - Ligne ~1694
**Impact**: MOYEN

```typescript
// Polling toutes les 3 secondes
const poll = async () => {
  const freshMeetings = await getAllMeetings()
  // ...
}
```

Polling permanent même quand aucune opération n'est en cours.

### 5. Lazy Loading Destructif
**Fichier**: `frontend/src/rooter/index.tsx`
**Impact**: MOYEN

Le lazy loading détruit le composant à chaque changement de route, perdant tout l'état.

### 6. Pas de Cache Backend pour les Données Métier
**Fichier**: `backend/app/db/redis_database.py`
**Impact**: MOYEN (dépend de la latence DB)

Redis existe mais n'est pas utilisé pour cacher les requêtes fréquentes.

---

## Stratégie de Cache Globale

### Principe: "Stale-While-Revalidate" (SWR)
1. **Afficher immédiatement** les données en cache
2. **Revalider en arrière-plan** si les données sont "stale" (périmées)
3. **Mettre à jour** l'UI quand les nouvelles données arrivent

### Architecture Cible

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    DATA STORE (Zustand)                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │   │
│  │  │  meetings   │ │  templates  │ │  folders/contacts   │ │   │
│  │  │  + status   │ │  + status   │ │  + status           │ │   │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  CACHE LAYER (localStorage)               │   │
│  │  - Persistance entre sessions                             │   │
│  │  - TTL par type de donnée                                 │   │
│  │  - Invalidation intelligente                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    API CLIENT (fetch)                     │   │
│  │  - Cache-Control conditionnel                             │   │
│  │  - ETag support                                           │   │
│  │  - Request deduplication                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    REDIS CACHE                            │   │
│  │  - Cache des listes (meetings, templates, folders)        │   │
│  │  - TTL: 30s-5min selon le type                            │   │
│  │  - Invalidation sur mutation                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### TTL Recommandés par Type de Donnée

| Donnée | TTL Frontend | TTL Backend (Redis) | Raison |
|--------|-------------|---------------------|--------|
| Meetings liste | 30s | 30s | Change fréquemment (transcription, résumé) |
| Meeting détails | 5min | 2min | Plus stable une fois terminé |
| Templates | 5min | 5min | Change rarement |
| Folders | 2min | 2min | Change modérément |
| Contacts | 10min | 10min | Change très rarement |
| Shared meetings | 1min | 1min | Dépend d'actions externes |

### Invalidation du Cache

| Action | Données à invalider |
|--------|---------------------|
| Upload meeting | `meetings.list` |
| Delete meeting | `meetings.list`, `meetings.{id}` |
| Update meeting (titre, etc.) | `meetings.{id}` |
| Transcription terminée | `meetings.{id}` |
| Résumé terminé | `meetings.{id}` |
| Nouveau partage | `shared.list` (destinataire) |
| Nouveau template | `templates.list` |
| Nouveau dossier | `folders.list` |

---

## Plan d'Implémentation

### Phase 1: Store Zustand Global (Frontend - Priorité HAUTE)

**Fichier à créer**: `frontend/src/stores/dataStore.ts`

```typescript
// Structure proposée
interface DataStore {
  // Meetings
  meetings: Meeting[]
  meetingsStatus: 'idle' | 'loading' | 'fresh' | 'stale'
  meetingsLastFetch: number | null

  // Shared meetings
  sharedMeetings: Meeting[]
  sharedMeetingsStatus: 'idle' | 'loading' | 'fresh' | 'stale'
  sharedMeetingsLastFetch: number | null

  // Templates
  templates: Template[]
  templatesStatus: 'idle' | 'loading' | 'fresh' | 'stale'
  templatesLastFetch: number | null

  // Folders
  folders: Folder[]
  foldersStatus: 'idle' | 'loading' | 'fresh' | 'stale'
  foldersLastFetch: number | null

  // Contacts
  contacts: Contact[]
  contactsStatus: 'idle' | 'loading' | 'fresh' | 'stale'
  contactsLastFetch: number | null

  // Actions
  fetchMeetings: (force?: boolean) => Promise<void>
  fetchSharedMeetings: (force?: boolean) => Promise<void>
  fetchTemplates: (force?: boolean) => Promise<void>
  fetchFolders: (force?: boolean) => Promise<void>
  fetchContacts: (force?: boolean) => Promise<void>

  // Invalidation
  invalidateMeetings: () => void
  invalidateAll: () => void

  // Optimistic updates
  addMeeting: (meeting: Meeting) => void
  updateMeeting: (id: string, updates: Partial<Meeting>) => void
  removeMeeting: (id: string) => void
}
```

**Fichiers à modifier**:
- `ExchangesPage.tsx` - Utiliser le store au lieu de useState local
- `Dashboard.tsx` - Utiliser le store
- `ProfilePage.tsx` - Utiliser le store
- `SharesView.tsx` - Utiliser le store
- `FoldersTab.tsx` - Utiliser le store

### Phase 2: Hooks Personnalisés (Frontend)

**Fichier à créer**: `frontend/src/hooks/useData.ts`

```typescript
// Hook avec SWR-like behavior
function useMeetings() {
  const { meetings, meetingsStatus, fetchMeetings } = useDataStore()

  useEffect(() => {
    if (meetingsStatus === 'idle' || meetingsStatus === 'stale') {
      fetchMeetings()
    }
  }, [])

  return {
    meetings,
    isLoading: meetingsStatus === 'loading',
    isStale: meetingsStatus === 'stale',
    refresh: () => fetchMeetings(true)
  }
}
```

### Phase 3: Optimisation du Polling (Frontend)

**Fichier**: `ExchangesPage.tsx`

- Polling uniquement si des meetings sont en `processing`
- Intervalle adaptatif (3s → 10s → 30s)
- Pause si l'onglet n'est pas visible

### Phase 4: Cache Backend Redis (Backend)

**Fichier à créer**: `backend/app/services/cache_service.py`

```python
async def get_user_meetings_cached(user_id: str) -> List[Meeting]:
    cache_key = f"meetings:user:{user_id}"

    # Try cache first
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # Fetch from DB
    meetings = await get_meetings_by_user_async(user_id)

    # Store in cache
    await redis_client.setex(cache_key, 30, json.dumps(meetings))

    return meetings

async def invalidate_user_meetings(user_id: str):
    await redis_client.delete(f"meetings:user:{user_id}")
```

**Fichiers à modifier**:
- `simple_meetings.py` - Utiliser le cache
- `meetings.py` - Utiliser le cache

### Phase 5: Headers HTTP Conditionnels (Frontend/Backend)

**Frontend** (`apiClient.ts`):
- Supprimer `no-cache` pour les requêtes GET de listes
- Ajouter support `If-None-Match` (ETag)

**Backend**:
- Ajouter ETag aux réponses de listes
- Retourner 304 si données inchangées

---

## Gains Attendus

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| Temps chargement page meetings (1ère fois) | ~1-2s | ~1-2s | = |
| Temps chargement page meetings (retour) | ~1-2s | <100ms | **95%** |
| Appels API par session (10 navigations) | ~50+ | ~10-15 | **70%** |
| Polling calls par minute | 20 | 2-5 | **75%** |
| Consommation bande passante | Élevée | Faible | **70%** |

---

## Changelog des Modifications

### [15 Janvier 2026] - Phase 1 Complète

#### Frontend - FAIT
- [x] **Créer `dataStore.ts`** (`frontend/src/stores/dataStore.ts`)
  - Store Zustand global avec persistance localStorage
  - Gestion de meetings, sharedMeetings, templates, folders, contacts
  - TTL configurables par type de donnée
  - Métadonnées de status (idle, loading, fresh, stale, error)
  - Actions de fetch avec logique SWR
  - Updates optimistes (add, update, remove)
  - Selectors pour éviter les re-renders

- [x] **Créer hooks `useData.ts`** (`frontend/src/hooks/useData.ts`)
  - `useMeetings()` - Hook pour les meetings avec auto-fetch
  - `useSharedMeetings()` - Hook pour les meetings partagés
  - `useTemplates()` - Hook pour les templates
  - `useFolders()` - Hook pour les dossiers
  - `useContacts()` - Hook pour les contacts
  - `useAllData()` - Hook pour charger toutes les données
  - `useMeetingById()` - Hook pour un meeting spécifique
  - `dataActions` - Actions exportées pour usage hors composants

- [x] **Modifier `ExchangesPage.tsx`**
  - Remplacé useState locaux par useDataStore
  - Supprimé les fonctions loadMeetings, loadSharedMeetings, loadFolders, loadTemplates, loadContacts, loadAll
  - Utilisation de fetchAll() du store avec gestion SWR
  - Mis à jour toutes les mutations pour utiliser le store (updateMeetingInStore, removeMeetingFromStore, addMeetingToStore)

- [x] **Optimiser le polling**
  - Polling intelligent : ne s'active que si des meetings sont en `processing`
  - Intervalle augmenté de 3s à 5s
  - Utilise fetchMeetings(true) du store au lieu d'appels directs

#### Fichiers Modifiés
```
frontend/src/stores/dataStore.ts          (NOUVEAU)
frontend/src/hooks/useData.ts             (NOUVEAU)
frontend/src/components/exchanges/ExchangesPage.tsx (MODIFIÉ)
```

### [15 Janvier 2026] - Phase 1 Complète (Suite)

#### Frontend - Pages Supplémentaires Modifiées

- [x] **Modifier `Dashboard.tsx`**
  - Ajouté useDataStore pour accéder aux meetings
  - Remplacé getAllMeetings() par fetchMeetingsFromStore()
  - Supprimé la fonction fetchMeetings locale
  - Utilise storeMeetings pour dériver meetingsList via useMemo
  - Updates optimistes avec addMeetingToStore, updateMeetingInStore

- [x] **Modifier `ProfilePage.tsx`**
  - Ajouté useDataStore pour meetings et contacts
  - Remplacé getAllMeetings() et getMyContacts() par fetchs du store
  - Calcul des stats via useEffect séparé sur storeMeetings/storeContacts
  - handleRemoveContact utilise invalidateContacts + fetchContacts(true)

- [x] **Modifier `SharesView.tsx`**
  - Ajouté useDataStore pour contacts, sharedMeetings, templates
  - Remplacé getMyContacts(), getSharedMeetings(), getMyTemplates()
  - Cast des sharedMeetings vers le type Meeting local (propriétés étendues)
  - Templates chargés depuis le store

- [x] **Modifier `FoldersTab.tsx`**
  - Ajouté useDataStore pour folders et contacts
  - Remplacé getFolders() par fetchFolders() du store
  - Remplacé getMyContacts() par fetchContacts() du store
  - loadFolders(forceRefresh) avec invalidation optionnelle
  - Mutations (create, update, delete) appellent fetchFolders(true)

- [x] **Modifier `MyMeetings.tsx`**
  - Ajouté useDataStore pour meetings, sharedMeetings, contacts, folders, templates
  - Remplacé getAllMeetings() par fetchMeetingsFromStore()
  - Remplacé getSharedMeetings() par fetchSharedMeetingsFromStore()
  - Remplacé getMyContacts() par fetchContactsFromStore()
  - Remplacé getFolders() par fetchFoldersFromStore()
  - Remplacé getMyTemplates() par fetchTemplatesFromStore()
  - Traitement local des données préservé (normalisation, durées, etc.)

#### Fichiers Modifiés (Phase 1 Suite)
```
frontend/src/components/Dashboard.tsx               (MODIFIÉ)
frontend/src/components/ProfilePage.tsx             (MODIFIÉ)
frontend/src/components/SharesView.tsx              (MODIFIÉ)
frontend/src/components/FoldersTab.tsx              (MODIFIÉ)
frontend/src/components/MyMeetings.tsx              (MODIFIÉ)
```

### [À venir] - Phase 2: Optimisations Backend

#### Frontend (Restant)
- [ ] Retirer `no-cache` pour les requêtes GET de listes dans `apiClient.ts`
- [ ] Ajouter polling adaptatif (3s → 10s → 30s)
- [ ] Pause polling si l'onglet n'est pas visible

#### Backend
- [ ] Créer `cache_service.py`
- [ ] Ajouter cache Redis aux endpoints meetings
- [ ] Ajouter cache Redis aux endpoints templates
- [ ] Ajouter invalidation sur mutations
- [ ] Ajouter support ETag

---

## Notes pour l'Intégration Web App

Cette stratégie est **100% applicable à la web app** car :

1. **Zustand** fonctionne identiquement en React web
2. **localStorage** est disponible dans tous les navigateurs
3. **Les endpoints backend** sont les mêmes
4. **Redis** est déjà en production

### Différences à considérer

| Aspect | Desktop (Tauri) | Web App |
|--------|-----------------|---------|
| localStorage | Persistant | Limité (5-10MB) |
| Rafraîchissement | Rare (app ouverte) | Fréquent (rechargement page) |
| Connexion | Stable | Variable |

### Recommandations Web App

1. Utiliser le même `dataStore.ts`
2. Ajouter `persist` middleware Zustand pour survie au refresh
3. Implémenter `IndexedDB` si localStorage insuffisant
4. Ajouter Service Worker pour cache offline (optionnel)

---

*Document créé le 15 Janvier 2026 - Dernière mise à jour: 15 Janvier 2026 (Phase 1 complète - toutes les pages)*
