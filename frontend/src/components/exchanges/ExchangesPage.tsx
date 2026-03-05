import { logger } from '@/utils/logger';
/**
 * ExchangesPage - Page "Mes échanges" redesign
 * Design épuré, cartes premium, avatars des speakers
 * Bleu Gilbert (#3B82F6)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { getTabFromPath, TAB_TO_PATH } from '@/types/router'
import type { TabValue } from '@/types/router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Search,
  Upload,
  Mic,
  Folder,
  FolderPlus,
  Users,
  FileText,
  Trash2,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Lightbulb,
  Zap,
  Pencil,
  Share2,
  FileType,
  Check,
} from 'lucide-react'
import { Forum as ForumIcon } from '@mui/icons-material'
import { AnimatedTabs } from '@/components/ui/AnimatedTabs'
import { deleteMeeting, getMeetingDetails, generateMeetingSummary, updateMeetingTitle, uploadMeeting, updateMeetingTranscriptText, updateMeetingSummaryText, onTranscriptionCompleted, type Meeting as ApiMeeting } from '@/services/meetingService'
import ImportValidation from '@/components/ui/ImportValidation'
import SummaryValidation from '@/components/ui/SummaryValidation'
import DeleteValidation from '@/components/ui/DeleteValidation'
import ExportValidation from '@/components/ui/ExportValidation'
import ShareValidation from '@/components/ui/ShareValidation'
import ShareDialog from '@/components/ui/ShareDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { exportTranscriptToPDF, exportTranscriptToWord, exportTranscriptToMarkdown } from '@/services/exportTranscriptService'
import { exportToPDF as exportSummaryToPDF, exportToWord as exportSummaryToWord } from '@/components/SummaryExportButton'
import { exportToPDFWithTemplate, exportToWordWithTemplate } from '@/services/templateExportService'
import { shareMeeting } from '@/services/shareService'
import { addMeetingToFolder, removeMeetingFromFolder, getMeetingFolders, type Folder as FolderType } from '@/services/folderService'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type Template } from '@/services/templateService'
import { updateSpeakerName, getSpeakers, hasCustomName as checkHasCustomName } from '@/services/speakerService'
import MeetingDetailOverlay from '@/components/MeetingDetailOverlay'
import { useNavigationStore } from '@/stores/navigationStore'
import FoldersTab from '@/components/FoldersTab'
import apiClient from '@/services/apiClient'
import { useNotification } from '@/contexts/NotificationContext'
import { useGenerationStore } from '@/stores/generationStore'
import { useDataStore } from '@/stores/dataStore'
import sounds from '@/utils/soundDesign'

// ============================================================================
// TYPES
// ============================================================================

interface TranscriptEntry {
  speakerId: string  // ID original (ex: "speaker_0") - ne change jamais
  speaker: string    // Nom d'affichage (ex: "Jean") - peut être modifié
  text: string
  timestamp?: string
}

interface Meeting extends ApiMeeting {
  is_shared?: boolean
  shared_by?: string
  shared_at?: string
  owner_name?: string  // Name of the person who shared the meeting with us
  role?: 'reader' | 'editor'  // Role can be at top level
  permissions?: {
    can_view: boolean
    can_edit: boolean
    can_export: boolean
    can_share: boolean
    can_regenerate: boolean
    include_transcript: boolean
    role?: 'reader' | 'editor'  // Role can also be inside permissions
  }
}

// TabValue importé depuis @/types/router

interface DateGroup {
  label: string
  date: string
  meetings: Meeting[]
}

// ============================================================================
// CONSTANTES
// ============================================================================

const GILBERT_BLUE = '#3B82F6'
const GILBERT_BLUE_LIGHT = '#EFF6FF'

// Same avatar colors as MeetingDetailOverlay - soft pastel backgrounds
const AVATAR_COLORS = [
  '#E3F2FD',  // Bleu
  '#F3E5F5',  // Violet
  '#E8F5E9',  // Vert
  '#FFF3E0',  // Orange
  '#FCE4EC',  // Rose
  '#E0F7FA',  // Cyan
  '#FFF8E1',  // Ambre
  '#F3E5F5',  // Indigo
  '#EFEBE9',  // Marron
  '#ECEFF1',  // Bleu-gris
]

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function formatTimeAgo(dateString: string): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "À l'instant"
  if (diffMins < 60) return `Il y a ${diffMins} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays} jours`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function formatDateLabel(dateString: string): { label: string; date: string } {
  const date = new Date(dateString)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const meetingDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  const formattedDate = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  })

  if (meetingDate.getTime() === today.getTime()) {
    return { label: "Aujourd'hui", date: formattedDate }
  }
  if (meetingDate.getTime() === yesterday.getTime()) {
    return { label: 'Hier', date: formattedDate }
  }
  return { label: formattedDate, date: formattedDate }
}

function groupMeetingsByDate(meetings: Meeting[]): DateGroup[] {
  const groups: Record<string, Meeting[]> = {}

  meetings.forEach(meeting => {
    const date = new Date(meeting.created_at)
    const key = date.toDateString()
    if (!groups[key]) groups[key] = []
    groups[key].push(meeting)
  })

  return Object.entries(groups)
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .map(([, items]) => {
      const { label, date } = formatDateLabel(items[0].created_at)
      return { label, date, meetings: items }
    })
}

function parseTextTranscript(text: string): TranscriptEntry[] {
  // Séparer par double saut de ligne (format de sauvegarde) ou simple saut de ligne
  const blocks = text.includes('\n\n')
    ? text.split('\n\n').filter(block => block.trim())
    : text.split('\n').filter(line => line.trim())

  const entries: TranscriptEntry[] = []

  blocks.forEach(block => {
    // Regex amélioré pour matcher:
    // - [timestamp] Speaker X: text
    // - Speaker X: text
    // - Participant 1: text
    // - Jean-Pierre: text
    // - Intervenant 1: text
    // - speaker_0: text
    const match = block.match(/^(?:\[([^\]]+)\])?\s*([^:]+):\s*(.+)$/s)
    if (match) {
      const speakerName = match[2].trim()
      const textContent = match[3].trim()
      entries.push({
        timestamp: match[1] || undefined,
        speakerId: speakerName,  // ID original
        speaker: speakerName,    // Sera remplacé par le display name
        text: textContent
      })
    } else if (block.trim()) {
      // Ligne sans format speaker: text - l'ajouter comme entrée avec speaker par défaut
      if (entries.length > 0) {
        entries[entries.length - 1].text += ' ' + block.trim()
      } else {
        entries.push({
          speakerId: 'Intervenant 1',
          speaker: 'Intervenant 1',
          text: block.trim()
        })
      }
    }
  })

  return entries
}

// Same hash function as SpeakerAvatars.tsx for consistency
function getAvatarIndex(meetingId: string, speakerIndex: number): number {
  const seed = `${meetingId}-${speakerIndex}`
  const hash = seed.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)
  return Math.abs(hash) % 24 // 24 avatar files (avatar-0.png to avatar-23.png)
}

function getAvatarPath(meetingId: string, speakerIndex: number): string {
  return `/avatars/avatar-${getAvatarIndex(meetingId, speakerIndex)}.png`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Animated Generate Button with hover effect
interface GenerateButtonProps {
  onClick: () => void
  disabled?: boolean
}

const GenerateButton = memo(function GenerateButton({ onClick, disabled }: GenerateButtonProps): JSX.Element {
  return (
    <motion.button
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) {
          sounds.generate()
          onClick()
        }
      }}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      className={cn(
        "flex items-center gap-2 px-4 py-2 rounded-lg",
        "text-sm font-medium transition-all duration-150",
        "bg-blue-50 text-blue-600 border border-blue-200",
        "shadow-sm",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:bg-blue-100 hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50"
      )}
    >
      <Zap className="h-4 w-4" />
      <span>Générer</span>
    </motion.button>
  )
})

// Speaker Avatar Stack with count - Uses deterministic avatar images
interface SpeakerAvatarsProps {
  meetingId: string
  speakersCount: number
  maxDisplay?: number
}

const SpeakerAvatars = memo(function SpeakerAvatars({ meetingId, speakersCount, maxDisplay = 3 }: SpeakerAvatarsProps): JSX.Element {
  const count = Math.min(speakersCount, maxDisplay)

  if (speakersCount === 0) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Users className="w-4 h-4" />
        <span className="text-sm">--</span>
      </div>
    )
  }

  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

  const handleImageLoad = (index: number) => {
    setLoadedImages(prev => new Set(prev).add(index))
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-1">
        {Array.from({ length: count }).map((_, i) => {
          const ringColor = AVATAR_COLORS[i % AVATAR_COLORS.length]
          const isLoaded = loadedImages.has(i)
          return (
            <div
              key={i}
              className="w-6 h-6 rounded-full p-[2px] shadow-sm flex-shrink-0"
              style={{
                backgroundColor: ringColor,
                zIndex: count - i
              }}
            >
              <div
                className="w-full h-full rounded-full overflow-hidden relative flex items-center justify-center"
                style={{ backgroundColor: `${ringColor}30` }}
              >
                {!isLoaded && (
                  <Loader2 className="w-3 h-3 animate-spin text-gray-400 absolute" />
                )}
                <img
                  src={getAvatarPath(meetingId, i)}
                  alt={`Participant ${i + 1}`}
                  className={cn(
                    "w-full h-full object-cover transition-opacity duration-200",
                    isLoaded ? "opacity-100" : "opacity-0"
                  )}
                  loading="eager"
                  onLoad={() => handleImageLoad(i)}
                />
              </div>
            </div>
          )
        })}
        {speakersCount > maxDisplay && (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-medium bg-gray-100 text-gray-400 shadow-sm flex-shrink-0"
            style={{ zIndex: 0 }}
          >
            +{speakersCount - maxDisplay}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">
        {speakersCount} participant{speakersCount > 1 ? 's' : ''}
      </span>
    </div>
  )
})

// Editable Title Component - Style like speaker editing
interface EditableTitleProps {
  title: string
  onSave: (newTitle: string) => Promise<void>
}

const EditableTitle = memo(function EditableTitle({ title, onSave }: EditableTitleProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [editedTitle, setEditedTitle] = useState(title)
  const [isSaving, setIsSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setEditedTitle(title)
  }, [title])

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = async () => {
    if (editedTitle.trim() && editedTitle.trim() !== title) {
      setIsSaving(true)
      try {
        await onSave(editedTitle.trim())
      } catch {
        setEditedTitle(title) // Revert on error
      } finally {
        setIsSaving(false)
      }
    } else {
      setEditedTitle(title) // Revert if empty or unchanged
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditedTitle(title)
      setIsEditing(false)
    }
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          disabled={isSaving}
          className={cn(
            "text-sm sm:text-lg font-semibold text-gray-900",
            "bg-transparent border-b-2 border-blue-400 outline-none",
            "py-0 w-full",
            "transition-colors duration-150",
            isSaving && "opacity-60"
          )}
        />
        {isSaving && (
          <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin flex-shrink-0" />
        )}
      </div>
    )
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      className="group/title flex items-center gap-1.5 sm:gap-2 cursor-pointer min-w-0 max-w-full"
    >
      <h3 className={cn(
        "text-sm sm:text-lg font-semibold text-gray-900 truncate",
        "group-hover/title:text-blue-600 transition-colors"
      )}>
        {title}
      </h3>
      <Pencil className={cn(
        "h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-300 flex-shrink-0",
        "opacity-0 group-hover/title:opacity-100",
        "group-hover/title:text-blue-400",
        "transition-all duration-200"
      )} />
    </div>
  )
})

// Type for meeting folder info
interface MeetingFolderInfo {
  id: string
  name: string
  color: string
}

// Folder Picker Component - Popover to add meeting to folder
interface FolderPickerProps {
  meetingId: string
  folders: FolderType[]
  onFolderChange: () => void
  onFoldersLoaded?: (folders: MeetingFolderInfo[]) => void
  initialFolders?: MeetingFolderInfo[]
}

const FolderPicker = memo(function FolderPicker({ meetingId, folders, onFolderChange, onFoldersLoaded, initialFolders }: FolderPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [meetingFolders, setMeetingFolders] = useState<Map<string, MeetingFolderInfo>>(
    new Map(initialFolders?.map(f => [f.id, f]) || [])
  )
  const [loadingFolders, setLoadingFolders] = useState(false)
  const hasLoadedRef = useRef(false)

  // Load meeting's current folders on mount
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true
      getMeetingFolders(meetingId)
        .then(loadedFolders => {
          const folderMap = new Map(loadedFolders.map(f => [f.id, f]))
          setMeetingFolders(folderMap)
          onFoldersLoaded?.(loadedFolders)
        })
        .catch(() => {})
    }
  }, [meetingId, onFoldersLoaded])

  // Reload when popover opens to ensure fresh data
  useEffect(() => {
    if (open) {
      setLoadingFolders(true)
      getMeetingFolders(meetingId)
        .then(loadedFolders => {
          const folderMap = new Map(loadedFolders.map(f => [f.id, f]))
          setMeetingFolders(folderMap)
          onFoldersLoaded?.(loadedFolders)
        })
        .catch(() => {})
        .finally(() => setLoadingFolders(false))
    }
  }, [open, meetingId, onFoldersLoaded])

  const handleToggleFolder = async (folder: FolderType) => {
    setLoading(true)
    try {
      if (meetingFolders.has(folder.id)) {
        await removeMeetingFromFolder(folder.id, meetingId)
        setMeetingFolders(prev => {
          const next = new Map(prev)
          next.delete(folder.id)
          return next
        })
        const newFolders = Array.from(meetingFolders.values()).filter(f => f.id !== folder.id)
        onFoldersLoaded?.(newFolders)
      } else {
        await addMeetingToFolder(folder.id, meetingId)
        const newFolderInfo = { id: folder.id, name: folder.name, color: folder.color }
        setMeetingFolders(prev => new Map([...prev, [folder.id, newFolderInfo]]))
        const newFolders = [...Array.from(meetingFolders.values()), newFolderInfo]
        onFoldersLoaded?.(newFolders)
      }
      sounds.click()
      onFolderChange()
    } catch (error) {
      // Error toggling folder - silent fail
    } finally {
      setLoading(false)
    }
  }

  const inFolderCount = meetingFolders.size

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-9 w-9 rounded-lg bg-white border flex items-center justify-center transition-colors relative",
            inFolderCount > 0
              ? "border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
              : "border-gray-200 text-gray-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
          )}
          title={inFolderCount > 0 ? `Dans ${inFolderCount} dossier(s)` : "Ajouter à un dossier"}
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 px-2 py-1">
            Ajouter à un dossier
          </p>
          {loadingFolders ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
            </div>
          ) : folders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Aucun dossier créé
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {/* Sort folders: checked ones first, then alphabetically */}
              {[...folders].sort((a, b) => {
                const aInFolder = meetingFolders.has(a.id)
                const bInFolder = meetingFolders.has(b.id)
                if (aInFolder && !bInFolder) return -1
                if (!aInFolder && bInFolder) return 1
                return a.name.localeCompare(b.name)
              }).map(folder => {
                const isInFolder = meetingFolders.has(folder.id)
                return (
                  <button
                    key={folder.id}
                    onClick={() => handleToggleFolder(folder)}
                    disabled={loading}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all text-left",
                      isInFolder
                        ? "bg-gray-100"
                        : "hover:bg-gray-50"
                    )}
                  >
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: folder.color + '20' }}
                    >
                      <Folder className="h-3.5 w-3.5" style={{ color: folder.color }} />
                    </div>
                    <span className="text-sm font-medium truncate flex-1 text-gray-700">
                      {folder.name}
                    </span>
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isInFolder
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-300 bg-white"
                    )}>
                      {isInFolder && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})

// Folder color dots component - shows which folders contain a meeting
interface FolderDotsProps {
  folders: MeetingFolderInfo[]
  maxVisible?: number
}

const FolderDots = memo(function FolderDots({ folders, maxVisible = 3 }: FolderDotsProps): JSX.Element | null {
  if (folders.length === 0) return null

  const visibleFolders = folders.slice(0, maxVisible)
  const remaining = folders.length - maxVisible

  return (
    <div className="flex items-center gap-1">
      {visibleFolders.map((folder, index) => (
        <div
          key={folder.id}
          className="w-2.5 h-2.5 rounded-full ring-1 ring-white"
          style={{
            backgroundColor: folder.color,
            marginLeft: index > 0 ? '-4px' : '0'
          }}
          title={folder.name}
        />
      ))}
      {remaining > 0 && (
        <span className="text-[9px] text-gray-400 ml-0.5">+{remaining}</span>
      )}
    </div>
  )
})

// Meeting Card Component - Two lines with avatars
interface ExchangeCardProps {
  meeting: Meeting
  onClick: () => void
  onOpenSynthesis: () => void
  onDelete: () => void
  onTitleChange: (newTitle: string) => Promise<void>
  onExportTranscript: (format: 'pdf' | 'word' | 'markdown') => void
  onExportSummary: (format: 'pdf' | 'word') => void
  onOpenShareDialog: () => void
  isShared?: boolean
  index: number
  folders: FolderType[]
  onFolderChange: () => void
}

// Helper to get share role from meeting (can be at top level or in permissions)
function getShareRole(meeting: Meeting): 'reader' | 'editor' {
  return meeting.role || meeting.permissions?.role || 'reader'
}

const ExchangeCard = memo(function ExchangeCard({
  meeting,
  onClick,
  onOpenSynthesis,
  onDelete,
  onTitleChange,
  onExportTranscript,
  onExportSummary,
  onOpenShareDialog,
  isShared,
  index: _index,
  folders,
  onFolderChange,
}: ExchangeCardProps): JSX.Element {
  const [isHovered, setIsHovered] = useState(false)
  const [meetingFolders, setMeetingFolders] = useState<MeetingFolderInfo[]>([])

  // Get the actual role for this shared meeting
  const shareRole = isShared ? getShareRole(meeting) : null

  // Load meeting folders on mount (for all meetings including shared ones)
  useEffect(() => {
    getMeetingFolders(meeting.id)
      .then(loadedFolders => setMeetingFolders(loadedFolders))
      .catch(() => {})
  }, [meeting.id])

  const handleFoldersLoaded = useCallback((loadedFolders: MeetingFolderInfo[]) => {
    setMeetingFolders(loadedFolders)
  }, [])

  const title = meeting.title || meeting.name || 'Sans titre'
  // Use both possible status fields for compatibility
  const status = meeting.transcript_status || meeting.transcription_status
  const hasSummary = meeting.summary_status === 'completed'
  const hasTranscript = status === 'completed'
  const isProcessing = status === 'processing' || status === 'pending'
  const isSummaryProcessing = meeting.summary_status === 'processing'
  const hasError = status === 'error' || status === 'failed'
  const participants = meeting.speakers_count || meeting.participants || 0
  const duration = meeting.duration_seconds || meeting.audio_duration || meeting.duration || 0

  // Show generate button - for meetings with transcript but no summary
  const showGenerateButton = !hasSummary && hasTranscript && !isSummaryProcessing

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on interactive elements
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('[role="menuitem"]') || target.closest('[data-radix-popper-content-wrapper]')) {
      return
    }
    onClick()
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      className={cn(
        'group relative p-3 sm:p-4 cursor-pointer transition-all duration-200',
        'bg-white rounded-xl border overflow-hidden',
        isHovered
          ? 'shadow-md border-gray-200'
          : 'shadow-sm border-gray-100 hover:border-gray-200',
      )}
    >
      {/* Mobile layout: horizontal simple / Desktop: full */}
      <div className="flex items-center sm:items-start gap-2.5 sm:gap-4">
        {/* Left: Icon - always visible */}
        <div className="flex-shrink-0">
            {isProcessing || isSummaryProcessing ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-50 flex items-center justify-center">
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 animate-spin" />
              </div>
            ) : hasError ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-red-50 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-red-500" />
              </div>
            ) : hasSummary ? (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-emerald-50 flex items-center justify-center">
                <Lightbulb className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" />
              </div>
            ) : hasTranscript ? (
              <div
                className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center"
                style={{ backgroundColor: GILBERT_BLUE_LIGHT }}
              >
                <ForumIcon sx={{ fontSize: { xs: 20, sm: 24 }, color: GILBERT_BLUE }} />
              </div>
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gray-50 flex items-center justify-center">
                <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
              </div>
            )}
          </div>

          {/* Center: Title + Meta */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Line 1: Title + Folder dots + Badge (desktop) */}
            <div className="flex items-center gap-2 mb-0.5 sm:mb-2">
              <EditableTitle title={title} onSave={onTitleChange} />
              {/* Folder color indicators */}
              {meetingFolders.length > 0 && (
                <FolderDots folders={meetingFolders} />
              )}
              {isShared && (
                <span className="hidden sm:inline-flex items-center gap-1 flex-shrink-0 px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-medium rounded-full whitespace-nowrap">
                  {meeting.owner_name ? `Par ${meeting.owner_name}` : 'Partagé'} • {shareRole === 'editor' ? 'Éditeur' : 'Lecteur'}
                </span>
              )}
            </div>

            {/* Line 2: Meta - compact on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-3 text-xs text-gray-400">
              {/* Time ago - always show */}
              <span className="flex-shrink-0">{formatTimeAgo(meeting.created_at)}</span>

              {/* Duration - show if available */}
              {duration > 0 && (
                <>
                  <span className="text-gray-200">•</span>
                  <span className="flex-shrink-0">{formatDuration(duration)}</span>
                </>
              )}

              {/* Shared badge mobile */}
              {isShared && (
                <span className="sm:hidden flex-shrink-0 px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[9px] font-medium rounded">
                  {shareRole === 'editor' ? 'Édit.' : 'Lect.'} {meeting.owner_name ? `• ${meeting.owner_name.split(' ')[0]}` : ''}
                </span>
              )}

              {/* Status badge - very compact on mobile */}
              {hasSummary ? (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded-full border border-emerald-100 flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3" />
                  Synthèse
                </span>
              ) : hasTranscript && !isProcessing ? (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-medium rounded-full border border-blue-100 flex-shrink-0">
                  <FileText className="h-3 w-3" />
                  Transcrit
                </span>
              ) : isProcessing ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-medium rounded-full border border-amber-100 flex-shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">En cours</span>
                </span>
              ) : null}

              {/* Speaker avatars - desktop only */}
              <div className="hidden sm:flex flex-shrink-0 ml-1 py-1 overflow-visible">
                <SpeakerAvatars meetingId={meeting.id} speakersCount={participants} />
              </div>
            </div>
          </div>

          {/* Actions on mobile - folder picker + menu button */}
          <div className="sm:hidden flex items-center gap-1.5 flex-shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
            {/* Folder picker on mobile - available for all meetings */}
            <FolderPicker
              meetingId={meeting.id}
              folders={folders}
              onFolderChange={onFolderChange}
              onFoldersLoaded={handleFoldersLoaded}
              initialFolders={meetingFolders}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 active:bg-gray-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {/* Générer - seulement si pas de synthèse */}
                {showGenerateButton && (
                  <DropdownMenuItem onClick={() => { sounds.generate(); onOpenSynthesis(); }}>
                    <Zap className="h-4 w-4 text-blue-500 mr-2" />
                    Générer
                  </DropdownMenuItem>
                )}
                {/* Partager / Re-partager */}
                <DropdownMenuItem onClick={() => { sounds.click(); onOpenShareDialog(); }}>
                  <Share2 className="h-4 w-4 text-gray-500 mr-2" />
                  {isShared ? 'Re-partager' : 'Partager'}
                </DropdownMenuItem>
                {/* Export - prioriser synthèse, masquer transcript si synthèse dispo */}
                {hasSummary && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportSummary('pdf'); }}>
                      <FileType className="h-4 w-4 text-red-500 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportSummary('word'); }}>
                      <FileType className="h-4 w-4 text-blue-500 mr-2" />
                      Export Word
                    </DropdownMenuItem>
                  </>
                )}
                {/* Transcript exports seulement si PAS de synthèse */}
                {hasTranscript && !hasSummary && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportTranscript('pdf'); }}>
                      <FileType className="h-4 w-4 text-red-500 mr-2" />
                      Export PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportTranscript('word'); }}>
                      <FileType className="h-4 w-4 text-blue-500 mr-2" />
                      Export Word
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { sounds.warning(); onDelete(); }} className="text-red-600">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Generate Button - Centré verticalement sur la carte */}
          {showGenerateButton && (
            <div className="hidden sm:flex items-center self-center flex-shrink-0 mr-2" onClick={(e) => e.stopPropagation()}>
              <GenerateButton onClick={onOpenSynthesis} />
            </div>
          )}

          {/* Right: Actions - Desktop only */}
          <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Share Button - opens ShareDialog (enabled for all meetings, including shared ones for re-sharing) */}
          <button
            onClick={onOpenShareDialog}
            className="h-9 w-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
            title={isShared ? "Re-partager" : "Partager"}
          >
            <Share2 className="h-4 w-4" />
          </button>

          {/* Folder Picker - available for all meetings including shared */}
          <FolderPicker
            meetingId={meeting.id}
            folders={folders}
            onFolderChange={onFolderChange}
            onFoldersLoaded={handleFoldersLoaded}
            initialFolders={meetingFolders}
          />

          {/* Export Dropdown */}
          {(hasSummary || hasTranscript) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 w-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
                  title="Exporter"
                >
                  <Download className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {hasSummary && (
                  <>
                    <DropdownMenuLabel>Synthèse</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportSummary('pdf'); }}>
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mr-1">
                        <FileType className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">PDF</span>
                        <span className="text-xs text-gray-400">Document portable</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportSummary('word'); }}>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mr-1">
                        <FileType className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">Word</span>
                        <span className="text-xs text-gray-400">Microsoft Word</span>
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
                {hasTranscript && (
                  <>
                    {hasSummary && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>Transcription</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportTranscript('pdf'); }}>
                      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center mr-1">
                        <FileType className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">PDF</span>
                        <span className="text-xs text-gray-400">Document portable</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportTranscript('word'); }}>
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mr-1">
                        <FileType className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">Word</span>
                        <span className="text-xs text-gray-400">Microsoft Word</span>
                      </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { sounds.click(); onExportTranscript('markdown'); }}>
                      <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center mr-1">
                        <FileText className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">Markdown</span>
                        <span className="text-xs text-gray-400">Texte formaté</span>
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Delete Button */}
          <button
            onClick={onDelete}
            className="h-9 w-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
})

// Date Group Header
interface DateGroupHeaderProps {
  label: string
  count: number
}

const DateGroupHeader = memo(function DateGroupHeader({ label, count }: DateGroupHeaderProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <span className="text-sm font-semibold text-gray-600">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400">
        {count} échange{count > 1 ? 's' : ''}
      </span>
    </div>
  )
})

// Import Dialog with Drag & Drop
interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStartRecording?: () => void
  onImportSuccess?: (meeting: ApiMeeting) => void
  initialFile?: File | null
}

type ImportStep = 'select' | 'preview' | 'uploading'

function ImportDialog({ open, onOpenChange, onStartRecording, onImportSuccess, initialFile }: ImportDialogProps): JSX.Element {
  const navigate = useNavigate()
  const [step, setStep] = useState<ImportStep>('select')
  const [isDragging, setIsDragging] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle initial file from drag & drop
  useEffect(() => {
    if (open && initialFile) {
      setSelectedFile(initialFile)
      setFileName(initialFile.name.replace(/\.[^/.]+$/, ''))
      setStep('preview')
    }
  }, [open, initialFile])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (step === 'select') setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleFileSelected = (files: File[]) => {
    if (files.length === 0 || step !== 'select') return
    const file = files[0]
    setSelectedFile(file)
    // Generate title from filename (without extension)
    setFileName(file.name.replace(/\.[^/.]+$/, ''))
    setStep('preview')
  }

  const handleConfirmUpload = async () => {
    if (!selectedFile) return

    setStep('uploading')
    setUploadProgress(0)

    try {
      const meeting = await uploadMeeting(selectedFile, fileName, {
        onProgress: (progress) => {
          setUploadProgress(progress)
        }
      })

      // Upload success - close dialog first, then show animation
      onOpenChange(false)
      // Small delay to let dialog close
      setTimeout(() => {
        setShowSuccess(true)
        onImportSuccess?.(meeting)
      }, 100)

    } catch (error) {
      void error
      setStep('preview') // Go back to preview on error
    }
  }

  const handleSuccessComplete = () => {
    setShowSuccess(false)
    resetState()
  }

  const resetState = () => {
    setStep('select')
    setSelectedFile(null)
    setFileName('')
    setUploadProgress(0)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (step !== 'select') return
    const files = Array.from(e.dataTransfer.files)
    handleFileSelected(files)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    handleFileSelected(files)
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleStartRecording = () => {
    onOpenChange(false)
    resetState()
    // Navigate to recording page
    navigate('/record')
    if (onStartRecording) {
      onStartRecording()
    }
  }

  const handleCancel = () => {
    if (step === 'preview') {
      resetState()
    } else {
      onOpenChange(false)
      resetState()
    }
  }

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Small delay to reset after close animation
      const timer = setTimeout(resetState, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  return (
    <>
      <ImportValidation show={showSuccess} onComplete={handleSuccessComplete} />
      <Dialog open={open} onOpenChange={(newOpen) => {
        if (step !== 'uploading') {
          onOpenChange(newOpen)
          if (!newOpen) resetState()
        }
      }}>
        <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[90vh] sm:max-h-[85vh] flex flex-col p-0" aria-describedby={undefined}>
          <DialogHeader className="flex-shrink-0 p-4 sm:p-6 pb-3 sm:pb-4">
            <DialogTitle className="flex items-center gap-2.5 sm:gap-3 text-lg sm:text-xl font-semibold text-gray-900">
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: GILBERT_BLUE_LIGHT }}
              >
                <Upload className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: GILBERT_BLUE }} />
              </div>
              <span className="hidden sm:inline">{step === 'preview' ? 'Confirmer l\'import' : 'Importer une conversation'}</span>
              <span className="sm:hidden">{step === 'preview' ? 'Confirmer' : 'Importer'}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0 px-4 sm:px-6 pb-4 sm:pb-6">
            <AnimatePresence mode="wait">
              {step === 'uploading' && (
                // Upload in progress view
                <motion.div
                  key="uploading"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="py-6 sm:py-8"
                >
                  <div className="flex flex-col items-center gap-3 sm:gap-4">
                    <div className="relative w-16 h-16 sm:w-20 sm:h-20">
                      {/* Circular progress */}
                      <svg className="w-16 h-16 sm:w-20 sm:h-20 -rotate-90" viewBox="0 0 80 80">
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          fill="none"
                          stroke="#E5E7EB"
                          strokeWidth="6"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r="36"
                          fill="none"
                          stroke={GILBERT_BLUE}
                          strokeWidth="6"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 36}`}
                          strokeDashoffset={`${2 * Math.PI * 36 * (1 - uploadProgress / 100)}`}
                          className="transition-all duration-300"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-base sm:text-lg font-semibold" style={{ color: GILBERT_BLUE }}>
                          {uploadProgress}%
                        </span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-sm sm:text-base font-medium text-gray-900">Import en cours...</p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-[200px] sm:max-w-[250px] truncate">
                        {fileName}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 'preview' && selectedFile && (
                // Preview & rename view
                <motion.div
                  key="preview"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="py-3 sm:py-4 flex flex-col"
                >
                  {/* File preview card */}
                  <div className="bg-gray-50 rounded-xl p-3 sm:p-4 border border-gray-100">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs sm:text-sm font-medium text-gray-900 break-all line-clamp-2"
                          title={selectedFile.name}
                        >
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 flex-shrink-0" />
                    </div>
                  </div>

                  {/* Rename input */}
                  <div className="mt-3 sm:mt-4 px-0.5 sm:px-1">
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                      Nom de la conversation
                    </label>
                    <Input
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && fileName.trim()) {
                          handleConfirmUpload()
                        }
                      }}
                      placeholder="Entrez un nom..."
                      className="h-10 sm:h-11 w-full text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-blue-500"
                    />
                  </div>

                  {/* Action buttons - always at bottom */}
                  <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6 flex-shrink-0">
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      className="flex-1 h-11 text-sm"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleConfirmUpload}
                      disabled={!fileName.trim()}
                      className="flex-1 h-11 text-sm text-white hover:opacity-90"
                      style={{ backgroundColor: GILBERT_BLUE }}
                    >
                      <Upload className="h-4 w-4 mr-1.5 sm:mr-2" />
                      <span className="hidden sm:inline">Importer</span>
                      <span className="sm:hidden">OK</span>
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 'select' && (
                // Normal drop zone view
                <motion.div
                  key="select"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'relative border-2 border-dashed rounded-xl p-6 sm:p-10 text-center cursor-pointer',
                      'transition-all duration-200',
                      isDragging
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100'
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,video/*,.mp3,.wav,.m4a,.webm,.mp4"
                      className="hidden"
                      onChange={handleFileSelect}
                    />

                    <div className="flex flex-col items-center gap-2.5 sm:gap-3">
                      <div
                        className={cn(
                          "w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center transition-colors",
                          isDragging ? "bg-blue-100" : "bg-gray-100"
                        )}
                      >
                        <Upload
                          className={cn(
                            "h-6 w-6 sm:h-7 sm:w-7 transition-colors",
                            isDragging ? "text-blue-500" : "text-gray-400"
                          )}
                        />
                      </div>

                      <div>
                        <p className="text-sm sm:text-base font-medium text-gray-900">
                          {isDragging ? 'Déposez vos fichiers ici' : 'Glissez-déposez vos fichiers'}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          ou cliquez pour parcourir
                        </p>
                      </div>

                      <p className="text-[10px] sm:text-xs text-gray-400">
                        MP3, WAV, M4A, WebM, MP4 • Max 500 MB
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100">
                    <button
                      onClick={handleStartRecording}
                      className={cn(
                        'w-full flex items-center gap-2.5 sm:gap-3 p-3 sm:p-4 rounded-xl min-h-[56px]',
                        'bg-white border border-gray-200',
                        'hover:border-emerald-300 hover:bg-emerald-50 active:bg-emerald-100',
                        'transition-all duration-200'
                      )}
                    >
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <Mic className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="font-medium text-gray-900 text-xs sm:text-sm">Enregistrer maintenant</div>
                        <div className="text-[10px] sm:text-xs text-gray-500 truncate">Capturer une conversation en direct</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Props interface
interface ExchangesPageProps {
  isMobile?: boolean
  isTablet?: boolean
}

export function ExchangesPage({ isMobile: isMobileProp, isTablet: isTabletProp }: ExchangesPageProps): JSX.Element {
  // React Router hooks
  const navigate = useNavigate()
  const location = useLocation()
  const { meetingId: urlMeetingId } = useParams<{ meetingId: string }>()

  // Note: isMobile/isTablet disponibles via useRouteContext() si nécessaire
  void isMobileProp; void isTabletProp; // Props optionnelles conservées pour compatibilité

  const { showSuccessPopup, showErrorPopup } = useNotification()
  const { addGeneration, markCompleted, removeGeneration, advancePhrase, isAnimationComplete } = useGenerationStore()

  // Navigation store for opening overlay from banner (legacy support)
  const pendingMeetingOverlayId = useNavigationStore(state => state.pendingMeetingOverlayId)
  const clearPendingOverlay = useNavigationStore(state => state.clearPendingOverlay)

  // Active tab déterminé depuis l'URL
  const activeTab = useMemo<TabValue>(() => getTabFromPath(location.pathname), [location.pathname])

  // Handler pour changer d'onglet via navigation
  const handleTabChange = useCallback((tab: TabValue): void => {
    sounds.tab()
    navigate(TAB_TO_PATH[tab])
  }, [navigate])
  const [searchQuery, setSearchQuery] = useState('')

  // ============================================================================
  // DATA STORE - Données globales avec cache SWR
  // ============================================================================
  const meetings = useDataStore((state) => state.meetings)
  const sharedMeetings = useDataStore((state) => state.sharedMeetings)
  const folders = useDataStore((state) => state.folders)
  const templates = useDataStore((state) => state.templates)
  const defaultTemplateId = useDataStore((state) => state.defaultTemplateId)
  const contacts = useDataStore((state) => state.contacts)

  const meetingsStatus = useDataStore((state) => state.meetingsMeta.status)

  const fetchMeetings = useDataStore((state) => state.fetchMeetings)
  const fetchFolders = useDataStore((state) => state.fetchFolders)
  const fetchContacts = useDataStore((state) => state.fetchContacts)
  const fetchAll = useDataStore((state) => state.fetchAll)

  const updateMeetingInStore = useDataStore((state) => state.updateMeeting)
  const removeMeetingFromStore = useDataStore((state) => state.removeMeeting)
  const addMeetingToStore = useDataStore((state) => state.addMeeting)

  // isLoading = true seulement si on charge ET qu'on n'a pas de données
  const isLoading = (
    (meetingsStatus === 'loading' || meetingsStatus === 'idle') &&
    meetings.length === 0
  )

  // Pagination
  const MEETINGS_PER_PAGE = 30
  const [currentPage, setCurrentPage] = useState(1)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)

  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false)

  // Overlay state
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [overlayMeeting, setOverlayMeeting] = useState<Meeting | null>(null)
  const [formattedTranscript, setFormattedTranscript] = useState<TranscriptEntry[] | null>(null)
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false)
  // templates et defaultTemplateId viennent du store (voir DATA STORE ci-dessus)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null)

  // Initialiser selectedTemplateId avec defaultTemplateId du store
  useEffect(() => {
    if (defaultTemplateId && !selectedTemplateId) {
      setSelectedTemplateId(defaultTemplateId)
    }
  }, [defaultTemplateId, selectedTemplateId])
  const [showSummarySuccess, setShowSummarySuccess] = useState(false)

  // Editing states
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)
  const [isSavingTranscript, setIsSavingTranscript] = useState(false)
  const [editedTranscriptText, setEditedTranscriptText] = useState('')
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [isSavingSummary, setIsSavingSummary] = useState(false)
  const [editedSummaryText, setEditedSummaryText] = useState('')

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [meetingToShare, setMeetingToShare] = useState<Meeting | null>(null)
  const [showShareSuccess, setShowShareSuccess] = useState(false)

  // Export success animation
  const [showExportSuccess, setShowExportSuccess] = useState(false)

  const summaryPollingRef = useRef<NodeJS.Timeout | null>(null)

  // Tabs config
  const tabs = [
    {
      value: 'exchanges',
      label: 'Échanges',
      icon: (isActive: boolean) => <ForumIcon sx={{ fontSize: 18, color: isActive ? GILBERT_BLUE : '#64748B' }} />,
    },
    {
      value: 'folders',
      label: 'Dossiers',
      icon: (isActive: boolean) => <Folder className="h-4 w-4" style={{ color: isActive ? GILBERT_BLUE : '#64748B' }} />,
    },
  ]

  // ============================================================================
  // DATA LOADING - Utilise le store global avec SWR
  // Les données sont affichées immédiatement depuis le cache, puis mises à jour
  // ============================================================================

  useEffect(() => {
    // Vérifier que l'utilisateur est authentifié avant de charger
    const token = localStorage.getItem('auth_token')
    if (!token) {
      return
    }

    // Le store gère automatiquement le cache et la revalidation
    // fetchAll() ne fait des appels API que si les données sont stale ou absentes
    const timer = setTimeout(() => {
      fetchAll()
    }, 50) // Délai réduit car le store gère le cache

    return () => {
      clearTimeout(timer)
      if (summaryPollingRef.current) {
        clearInterval(summaryPollingRef.current)
      }
    }
  }, [fetchAll])

  // ============================================================================
  // POLLING SYSTEM - Refs partagés (notifiedRef évite les doubles notifications)
  // ============================================================================
  const notifiedRef = useRef<Set<string>>(new Set())

  // ============================================================================
  // TRANSCRIPTION COMPLETION LISTENER - Écoute les événements de transcription
  // ============================================================================
  useEffect(() => {
    const unsubscribe = onTranscriptionCompleted((completedMeeting) => {
      // Marquer comme notifié pour éviter que le polling affiche une 2e notification
      notifiedRef.current.add(`transcript-${completedMeeting.id}`)

      // Mettre à jour le meeting dans le store global
      const existingMeeting = meetings.find(m => m.id === completedMeeting.id)
      if (existingMeeting) {
        updateMeetingInStore(completedMeeting.id, completedMeeting)
      } else {
        addMeetingToStore(completedMeeting as Meeting)
      }

      // Afficher une notification (une seule, le polling n'en affichera pas)
      showSuccessPopup(
        'Transcription terminée',
        `"${completedMeeting.title ?? completedMeeting.name}" est prêt`
      )
    })

    return () => unsubscribe()
  }, [showSuccessPopup, meetings, updateMeetingInStore, addMeetingToStore])
  const previousStatusRef = useRef<Map<string, { transcript: string; summary: string }>>(new Map())

  // Store latest showSuccessPopup in ref
  const showSuccessPopupRef = useRef(showSuccessPopup)
  useEffect(() => {
    showSuccessPopupRef.current = showSuccessPopup
  }, [showSuccessPopup])

  // ============================================================================
  // POLLING INTELLIGENT - Ne poll que si des meetings sont en processing
  // ============================================================================

  // Boolean stable : l'effet ne se relance que quand il change (true↔false),
  // pas à chaque mise à jour du tableau meetings (évite le feedback loop)
  const hasProcessingMeetings = useMemo(() => meetings.some(m => {
    const ts = m.transcript_status || m.transcription_status
    const ss = m.summary_status
    return ts === 'processing' || ts === 'pending' || ss === 'processing'
  }), [meetings])

  useEffect(() => {
    if (!hasProcessingMeetings) {
      return
    }

    const poll = async () => {
      try {
        // Forcer la revalidation du store
        const freshMeetings = await fetchMeetings(true)

        // Pour les meetings "en cours", appeler le détail pour forcer le backend à mettre à jour
        const processingMeetings = freshMeetings.filter(m => {
          const ts = m.transcript_status || m.transcription_status
          const ss = m.summary_status
          return ts === 'processing' || ts === 'pending' || ss === 'processing'
        }).slice(0, 3) // Max 3 pour ne pas surcharger

        if (processingMeetings.length > 0) {
          // Appeler le détail de chaque meeting en cours pour "réveiller" le backend
          const detailPromises = processingMeetings.map(async (m) => {
            try {
              const detail = await getMeetingDetails(m.id)
              if (detail) {
                // Mettre à jour le store avec les détails frais
                updateMeetingInStore(m.id, detail)
                return { id: m.id, ...detail }
              }
            } catch {
              // Ignorer les erreurs
            }
            return null
          })

          await Promise.all(detailPromises)
        }

        // Check for status changes et notifier
        freshMeetings.forEach(m => {
          const currentTranscript = m.transcript_status || m.transcription_status || 'unknown'
          const currentSummary = m.summary_status || 'unknown'
          const prev = previousStatusRef.current.get(m.id)

          // Detect transcript completion
          if (currentTranscript === 'completed') {
            const notifKey = `transcript-${m.id}`
            const alreadyNotified = notifiedRef.current.has(notifKey)
            const wasProcessing = prev && (prev.transcript === 'processing' || prev.transcript === 'pending')

            if (wasProcessing && !alreadyNotified) {
              notifiedRef.current.add(notifKey)
              showSuccessPopupRef.current('Transcription terminée', `"${m.title || m.name}" est prêt`)
            }
          }

          // Detect summary completion
          if (currentSummary === 'completed') {
            const notifKey = `summary-${m.id}`
            const alreadyNotified = notifiedRef.current.has(notifKey)
            const wasProcessing = prev && (prev.summary === 'processing' || prev.summary === 'pending')

            if (wasProcessing && !alreadyNotified) {
              notifiedRef.current.add(notifKey)
              showSuccessPopupRef.current('Synthèse terminée', `"${m.title || m.name}" est prêt`)
              markCompleted(m.id)
            }
          }

          // Store current status for next comparison
          previousStatusRef.current.set(m.id, {
            transcript: currentTranscript,
            summary: currentSummary
          })
        })
      } catch (error) {
        void error
      }
    }

    // Poll every 5 seconds quand il y a des meetings en traitement
    const intervalId = setInterval(poll, 5000)

    // Initial poll after 1 second
    const timeoutId = setTimeout(poll, 1000)

    return () => {
      clearInterval(intervalId)
      clearTimeout(timeoutId)
    }
  }, [hasProcessingMeetings, fetchMeetings, updateMeetingInStore, markCompleted])

  // Cleanup old notifications periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      notifiedRef.current.clear()
    }, 300000) // 5 minutes
    return () => clearInterval(cleanup)
  }, [])

  // Filter meetings - merge own meetings and shared meetings into one list
  const filteredMeetings = useMemo(() => {
    // Combine own meetings with shared meetings (already marked with is_shared: true)
    const allMeetings = [...meetings, ...sharedMeetings]
    // Sort by date (most recent first)
    allMeetings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    if (!searchQuery.trim()) return allMeetings
    const query = searchQuery.toLowerCase()
    return allMeetings.filter(m =>
      (m.title || m.name || '').toLowerCase().includes(query)
    )
  }, [meetings, sharedMeetings, searchQuery])

  // Pagination calculations
  const totalPages = useMemo(() => {
    return Math.ceil(filteredMeetings.length / MEETINGS_PER_PAGE)
  }, [filteredMeetings.length, MEETINGS_PER_PAGE])

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // Paginated meetings
  const paginatedMeetings = useMemo(() => {
    const startIndex = (currentPage - 1) * MEETINGS_PER_PAGE
    const endIndex = startIndex + MEETINGS_PER_PAGE
    return filteredMeetings.slice(startIndex, endIndex)
  }, [filteredMeetings, currentPage, MEETINGS_PER_PAGE])

  const groupedMeetings = useMemo(() => groupMeetingsByDate(paginatedMeetings), [paginatedMeetings])

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page)
    // Scroll vers le haut de la liste
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  // Stats
  const stats = useMemo(() => {
    const total = meetings.length
    const totalDuration = meetings.reduce((acc, m) => {
      const duration = m.duration_seconds || m.audio_duration || m.duration || 0
      return acc + duration
    }, 0)
    const totalHours = Math.round(totalDuration / 3600 * 10) / 10

    return { total, totalHours }
  }, [meetings])

  // Overlay handlers
  const [initialOverlayTab, setInitialOverlayTab] = useState<'transcription' | 'summary'>('transcription')

  const handleOpenOverlay = useCallback((meeting: Meeting, openToTab: 'transcription' | 'summary' = 'transcription') => {
    sounds.pop()
    // For shared meetings without transcript access, default to summary tab
    let tabToOpen = openToTab
    if (meeting.is_shared && meeting.permissions?.include_transcript !== true) {
      tabToOpen = 'summary'
    }
    setInitialOverlayTab(tabToOpen)

    // Récupérer les dernières données du meeting depuis le store (qui a les mises à jour locales)
    const storeMeeting = meetings.find(m => m.id === meeting.id) ||
                         sharedMeetings.find(m => m.id === meeting.id) ||
                         meeting;

    setOverlayMeeting(storeMeeting)

    // Si le store a déjà le transcript_text, l'utiliser directement au lieu de charger depuis l'API
    // Les noms personnalisés sont déjà dans le transcript_text (sauvegardés en BDD)
    if (storeMeeting.transcript_text && storeMeeting.transcript_status === 'completed') {
      const parsed = parseTextTranscript(storeMeeting.transcript_text);
      // Les noms sont déjà corrects dans le texte, pas besoin de getDisplayName()
      // Les speakerIds seront résolus via l'API quand handleLoadTranscript sera appelé
      setFormattedTranscript(parsed);
    } else {
      setFormattedTranscript(null)
    }

    setIsEditingTranscript(false)
    setIsEditingSummary(false)
    setEditedSummaryText('')  // IMPORTANT: Vider la synthèse éditée pour afficher celle du nouveau meeting
    setEditedTranscriptText('')  // Vider aussi la transcription éditée
    setOverlayOpen(true)
  }, [meetings, sharedMeetings])

  const handleOpenSynthesis = useCallback((meeting: Meeting) => {
    handleOpenOverlay(meeting, 'summary')
  }, [handleOpenOverlay])

  const handleCloseOverlay = useCallback(() => {
    // Retour à l'onglet actuel (dossiers ou échanges) au lieu de /meetings
    navigate(TAB_TO_PATH[activeTab] || '/meetings')
    setOverlayOpen(false)
    setTimeout(() => {
      setOverlayMeeting(null)
      setFormattedTranscript(null)
    }, 300)
  }, [navigate, activeTab])

  // Handler pour sauvegarder le nom d'un speaker
  const handleSaveSpeakerName = useCallback((speakerId: string, customName: string) => {
    if (!overlayMeeting) return

    // Mise à jour OPTIMISTE - on met à jour l'UI immédiatement AVANT l'appel API
    let updatedText = ''
    if (formattedTranscript) {
      const updatedTranscript = formattedTranscript.map(entry =>
        entry.speakerId === speakerId ? { ...entry, speaker: customName } : entry
      )
      setFormattedTranscript(updatedTranscript)

      // Mettre à jour le transcript_text dans le store pour que la prochaine ouverture ait les bons noms
      updatedText = updatedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n')
      updateMeetingInStore(overlayMeeting.id, { transcript_text: updatedText } as Partial<Meeting>)
    }

    // Sauvegarder le nom personnalisé en BDD + le transcript_text mis à jour directement
    updateSpeakerName(overlayMeeting.id, speakerId, customName)
      .then(async () => {
        // Sauvegarder le transcript_text directement en BDD (préserve les modifications utilisateur)
        if (updatedText) {
          await updateMeetingTranscriptText(overlayMeeting.id, updatedText)
        }
      })
      .then(() => {
        showSuccessPopup('Nom mis à jour', `"${customName}" a été enregistré`)
      })
      .catch(() => {
        showErrorPopup('Erreur', 'Impossible de sauvegarder le nom')
      })
  }, [overlayMeeting, formattedTranscript, updateMeetingInStore, showSuccessPopup, showErrorPopup])

  // Handler pour vérifier si un speaker a un nom personnalisé
  const handleHasCustomName = useCallback((meetingId: string, speakerId: string) => {
    return checkHasCustomName(meetingId, speakerId)
  }, [])

  // Handler pour sauvegarder la transcription (sauvegarde dynamique sur blur)
  const handleSaveTranscript = useCallback(async (textToSave?: string) => {
    if (!overlayMeeting) return;

    const finalText = textToSave || editedTranscriptText
    if (!finalText) return;

    setIsSavingTranscript(true)
    try {
      await updateMeetingTranscriptText(overlayMeeting.id, finalText)

      // Mettre à jour l'état local avec le nouveau texte formaté
      const lines = finalText.split(/\n\n/).filter((line: string) => line.trim())
      const newFormattedTranscript = lines.map((line: string) => {
        const match = line.match(/^([^:]+):\s*(.+)$/s)
        if (match) {
          const speaker = match[1].trim()
          const text = match[2].trim()
          return {
            speakerId: speaker,
            speaker: speaker,
            text
          }
        }
        return { speakerId: 'Intervenant 1', speaker: 'Intervenant 1', text: line.trim() }
      }).filter((entry: TranscriptEntry) => entry.text.length > 0)

      setFormattedTranscript(newFormattedTranscript)
      setEditedTranscriptText(finalText)
      setIsEditingTranscript(false)

      // Compter les speakers uniques pour mettre à jour le compteur
      const uniqueSpeakers = new Set(newFormattedTranscript.map(e => e.speaker))
      const speakersCount = uniqueSpeakers.size

      // Mettre à jour overlayMeeting avec le nouveau transcript + speakers_count
      setOverlayMeeting(prev => prev ? { ...prev, transcript_text: finalText, speakers_count: speakersCount } : prev)

      // Mettre à jour le store global pour persister les changements
      updateMeetingInStore(overlayMeeting.id, { transcript_text: finalText, speakers_count: speakersCount } as Partial<Meeting>)
    } catch (error) {
      logger.error('Error saving transcript:', error);
      showErrorPopup('Erreur', 'Impossible de sauvegarder la transcription')
    } finally {
      setIsSavingTranscript(false)
    }
  }, [overlayMeeting, editedTranscriptText, showErrorPopup, updateMeetingInStore])

  // Handler pour sauvegarder la synthèse modifiée
  const handleSaveSummary = useCallback(async () => {
    if (!overlayMeeting || !editedSummaryText) return

    setIsSavingSummary(true)
    try {
      await updateMeetingSummaryText(overlayMeeting.id, editedSummaryText)

      // Mettre à jour overlayMeeting avec la nouvelle synthèse
      setOverlayMeeting(prev => prev ? { ...prev, summary_text: editedSummaryText } : prev)

      // Mettre à jour le store global
      updateMeetingInStore(overlayMeeting.id, { summary_text: editedSummaryText })

      setIsEditingSummary(false)
      showSuccessPopup('Synthèse sauvegardée', 'Les modifications ont été enregistrées')
    } catch (error) {
      void error
      showErrorPopup('Erreur', 'Impossible de sauvegarder la synthèse')
    } finally {
      setIsSavingSummary(false)
    }
  }, [overlayMeeting, editedSummaryText, showSuccessPopup, showErrorPopup])

  // Ouvrir l'overlay quand le bandeau de génération demande à voir un meeting (legacy)
  useEffect(() => {
    if (pendingMeetingOverlayId) {
      // Chercher le meeting dans les listes
      const meeting = meetings.find(m => m.id === pendingMeetingOverlayId) ||
                      sharedMeetings.find(m => m.id === pendingMeetingOverlayId)
      if (meeting) {
        // Ouvrir sur l'onglet summary pour voir le chargement
        handleOpenOverlay(meeting, 'summary')
      }
      // Clear pour ne pas re-trigger
      clearPendingOverlay()
    }
  }, [pendingMeetingOverlayId, meetings, sharedMeetings, handleOpenOverlay, clearPendingOverlay])

  // Ouvrir l'overlay quand un meetingId est dans l'URL (nouveau système de routing)
  useEffect(() => {
    if (urlMeetingId && !overlayOpen) {
      const meeting = meetings.find(m => m.id === urlMeetingId) ||
                      sharedMeetings.find(m => m.id === urlMeetingId)
      if (meeting) {
        handleOpenOverlay(meeting)
      }
    }
  }, [urlMeetingId, meetings, sharedMeetings, handleOpenOverlay, overlayOpen])

  // Charger les détails complets du meeting quand l'overlay s'ouvre
  // IMPORTANT: Corrige le bug où la synthèse ne se mettait pas à jour entre les meetings
  // car getAllMeetings() ne retourne pas summary_text pour des raisons de performance
  useEffect(() => {
    if (!overlayMeeting?.id || !overlayOpen) return

    const loadMeetingDetails = async (): Promise<void> => {
      try {
        const details = await getMeetingDetails(overlayMeeting.id)
        if (details && details.id === overlayMeeting.id) {
          // Mettre à jour overlayMeeting avec les données complètes (incluant summary_text)
          setOverlayMeeting(prev => {
            if (prev?.id === details.id) {
              return { ...prev, ...details }
            }
            return prev
          })
        }
      } catch (error) {
        void error
      }
    }

    void loadMeetingDetails()
  }, [overlayMeeting?.id, overlayOpen])

  const handleLoadTranscript = useCallback(async (meetingId: string) => {
    setIsLoadingTranscript(true)
    try {
      // Charger les données du meeting ET les speakers en parallèle
      const [response, speakersData] = await Promise.all([
        apiClient.get(`/simple/meetings/${meetingId}`) as Promise<Record<string, unknown>>,
        getSpeakers(meetingId)
      ])
      const meetingData = (response.data || response) as Record<string, unknown>

      // Construire un reverse map: customName → speakerId (pour retrouver les IDs originaux)
      const nameToIdMap: Record<string, string> = {}
      speakersData.forEach(s => {
        if (s.name && s.id) {
          nameToIdMap[s.name] = s.id
        }
      })

      // Fonction pour résoudre le speakerId depuis le nom affiché
      const resolveSpeakerId = (displayName: string): string => {
        return nameToIdMap[displayName] || displayName
      }

      // Vérifier d'abord les utterances (format structuré du backend)
      const utterances = meetingData.utterances as Array<{speaker: string; text: string; start?: number; end?: number}> | undefined
      if (utterances && Array.isArray(utterances) && utterances.length > 0) {
        const formattedData: TranscriptEntry[] = utterances.map(u => {
          const speakerName = u.speaker || 'speaker_0'
          return {
            speakerId: resolveSpeakerId(speakerName),
            speaker: speakerName,
            text: u.text || ''
          }
        })
        setFormattedTranscript(formattedData)
        setIsLoadingTranscript(false)

        // Mettre à jour le meeting
        if (meetingData) {
          setOverlayMeeting(prev => prev ? { ...prev, ...meetingData } as Meeting : prev)
          const freshStatus = (meetingData as Record<string, unknown>).transcript_status ||
                             (meetingData as Record<string, unknown>).transcription_status
          if (freshStatus) {
            updateMeetingInStore(meetingId, meetingData as Partial<Meeting>)
          }
        }
        return
      }

      // Sinon, chercher dans les champs texte
      const possibleFields = ['transcript', 'transcription', 'transcript_text', 'transcription_text', 'content', 'text']
      let transcriptText = null

      for (const field of possibleFields) {
        if (meetingData[field]) {
          transcriptText = meetingData[field]
          break
        }
      }

      if (transcriptText) {
        let formattedData: TranscriptEntry[] = []

        if (typeof transcriptText === 'string' && transcriptText.trim().startsWith('[')) {
          try {
            formattedData = JSON.parse(transcriptText)
          } catch {
            formattedData = parseTextTranscript(transcriptText)
          }
        } else if (Array.isArray(transcriptText)) {
          formattedData = transcriptText
        } else {
          formattedData = parseTextTranscript(typeof transcriptText === 'string' ? transcriptText : JSON.stringify(transcriptText))
        }

        if (formattedData.length > 0) {
          // Le transcript_text en BDD contient déjà les noms personnalisés
          // On utilise le reverse map pour retrouver les speakerIds originaux
          const updatedTranscript = formattedData.map(utterance => {
            const displayName = utterance.speaker || utterance.speakerId || ''
            return {
              ...utterance,
              speakerId: resolveSpeakerId(displayName),
              speaker: displayName
            }
          })
          setFormattedTranscript(updatedTranscript)
        } else {
          // Set empty array to stop infinite polling
          setFormattedTranscript([])
        }
      } else {
        // No transcript found - set empty array to stop polling
        // The overlay will show appropriate message
        setFormattedTranscript([])
      }

      if (meetingData) {
        setOverlayMeeting(prev => prev ? { ...prev, ...meetingData } as Meeting : prev)

        // IMPORTANT: Mettre à jour le store global avec les données fraîches
        // Ceci permet de détecter les changements de statut immédiatement
        const freshStatus = (meetingData as Record<string, unknown>).transcript_status ||
                           (meetingData as Record<string, unknown>).transcription_status
        if (freshStatus) {
          updateMeetingInStore(meetingId, meetingData as Partial<Meeting>)
        }
      }
    } catch (err) {
      showErrorPopup('Erreur', 'Impossible de charger la transcription')
      // Set empty array on error to stop infinite polling
      setFormattedTranscript([])
    } finally {
      setIsLoadingTranscript(false)
    }
  }, [showErrorPopup])

  // Summary generation
  const startSummaryPolling = useCallback((meetingId: string, meetingTitle: string) => {
    if (summaryPollingRef.current) {
      clearInterval(summaryPollingRef.current)
    }

    addGeneration(meetingId, meetingTitle)

    const phraseInterval = setInterval(() => {
      advancePhrase(meetingId)
    }, 3000)

    summaryPollingRef.current = setInterval(async () => {
      try {
        const details = await getMeetingDetails(meetingId)

        if (details) {
          // IMPORTANT: Préserver le template_id local si on l'a défini
          setOverlayMeeting(prev => {
            if (prev && prev.id === meetingId) {
              const preservedTemplateId = prev.template_id || details.template_id
              return { ...prev, ...details, template_id: preservedTemplateId }
            }
            return prev
          })

          // Préserver aussi le template_id dans le store
          updateMeetingInStore(meetingId, details)

          if (details.summary_status === 'completed') {
            clearInterval(phraseInterval)
            if (summaryPollingRef.current) {
              clearInterval(summaryPollingRef.current)
              summaryPollingRef.current = null
            }
            setGeneratingSummaryId(null)
            markCompleted(meetingId)

            const checkAnimation = setInterval(() => {
              if (isAnimationComplete(meetingId)) {
                clearInterval(checkAnimation)
                setTimeout(() => removeGeneration(meetingId), 500)
              }
            }, 200)

            setTimeout(() => {
              clearInterval(checkAnimation)
              removeGeneration(meetingId)
            }, 10000)

            // Show success animation with lightbulb
            setShowSummarySuccess(true)
          } else if (details.summary_status === 'error') {
            clearInterval(phraseInterval)
            if (summaryPollingRef.current) {
              clearInterval(summaryPollingRef.current)
              summaryPollingRef.current = null
            }
            setGeneratingSummaryId(null)
            removeGeneration(meetingId)
            showErrorPopup('Erreur', 'La génération du compte-rendu a échoué.')
          }
        }
      } catch (err) {
        void err
      }
    }, 3000)

    setTimeout(() => {
      clearInterval(phraseInterval)
      if (summaryPollingRef.current) {
        clearInterval(summaryPollingRef.current)
        summaryPollingRef.current = null
        setGeneratingSummaryId(null)
        removeGeneration(meetingId)
      }
    }, 120000)
  }, [addGeneration, advancePhrase, markCompleted, removeGeneration, isAnimationComplete, showSuccessPopup, showErrorPopup])

  const handleGenerateSummary = useCallback(async (meetingId: string, templateId: string) => {
    try {
      const meeting = meetings.find(m => m.id === meetingId)
      const meetingTitle = meeting?.title || meeting?.name || 'Échange'

      setGeneratingSummaryId(meetingId)
      await generateMeetingSummary(meetingId, null, templateId, true)

      // IMPORTANT: Mettre à jour le template_id localement pour l'export
      setOverlayMeeting(prev => prev ? { ...prev, summary_status: 'processing', template_id: templateId } : prev)
      updateMeetingInStore(meetingId, { summary_status: 'processing', template_id: templateId })

      startSummaryPolling(meetingId, meetingTitle)
    } catch (err) {
      void err
      showErrorPopup('Erreur', 'Impossible de générer la synthèse')
      setGeneratingSummaryId(null)
    }
  }, [meetings, startSummaryPolling, showErrorPopup])

  const handleDeleteClick = useCallback((meeting: Meeting) => {
    sounds.warning()
    setMeetingToDelete(meeting)
    setDeleteDialogOpen(true)
  }, [])

  const handleDeleteConfirm = async () => {
    if (!meetingToDelete) return

    setIsDeleting(true)
    try {
      await deleteMeeting(meetingToDelete.id)
      removeMeetingFromStore(meetingToDelete.id)
      setDeleteDialogOpen(false)
      setMeetingToDelete(null)
      // Show delete success animation
      setShowDeleteSuccess(true)
    } catch (error) {
      void error
      showErrorPopup('Erreur', 'Impossible de supprimer l\'échange.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Export handlers
  // Fonction pour résoudre le template d'une réunion (comme dans MeetingDetailOverlay)
  const resolveTemplateForMeeting = useCallback((meeting: Meeting): Template | undefined => {
    // Si le meeting a un template_id, chercher ce template
    if (meeting.template_id) {
      const matchingTemplate = templates.find(t => t.id === meeting.template_id)
      if (matchingTemplate) {
        return matchingTemplate
      }
    }

    // Sinon, chercher le template par défaut
    const defaultTemplate = templates.find(t => t.is_default)
    if (defaultTemplate) {
      return defaultTemplate
    }

    // En dernier recours, retourner le premier template
    if (templates.length > 0) {
      return templates[0]
    }

    return undefined
  }, [templates])

  const handleExportTranscript = useCallback(async (meeting: Meeting, format: 'pdf' | 'word' | 'markdown') => {
    try {
      // Récupérer le transcript formaté (comme dans l'overlay avec formattedTranscript)
      const details = await getMeetingDetails(meeting.id)
      const title = meeting.title || meeting.name || 'Réunion'
      const date = new Date(meeting.created_at).toLocaleDateString('fr-FR')

      // Parser le transcript_text en format TranscriptEntry[] (comme dans handleLoadTranscript)
      let transcript: TranscriptEntry[] = []
      if (details.transcript_text) {
        transcript = parseTextTranscript(details.transcript_text)
      } else if (details.utterances) {
        // Si on a des utterances, les convertir en TranscriptEntry[]
        transcript = details.utterances.map(u => ({
          speakerId: u.speaker,
          speaker: u.speaker,
          text: u.text,
          timestamp: undefined
        }))
      }

      if (!transcript || transcript.length === 0) {
        showErrorPopup('Erreur', 'La transcription n\'est pas disponible pour l\'exportation.')
        return
      }

      // Convertir en format attendu par les fonctions d'export (array de {speaker, text, timestamp?})
      const exportTranscript = transcript.map(entry => ({
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp
      }))

      // Utiliser les mêmes fonctions que TranscriptExportButton
      if (format === 'pdf') {
        await exportTranscriptToPDF(exportTranscript, title, date)
        setShowExportSuccess(true)
      } else if (format === 'word') {
        await exportTranscriptToWord(exportTranscript, title, date)
        setShowExportSuccess(true)
      } else if (format === 'markdown') {
        await exportTranscriptToMarkdown(exportTranscript, title, date)
        setShowExportSuccess(true)
      }
    } catch (error) {
      // Ne pas afficher d'erreur si l'utilisateur a annulé
      if ((error as Error).message === 'Sauvegarde annulée') {
        return
      }
      showErrorPopup('Erreur', 'Impossible d\'exporter la transcription.')
    }
  }, [showErrorPopup])

  const handleExportSummary = useCallback(async (meeting: Meeting, format: 'pdf' | 'word') => {
    try {
      // Utiliser meeting.summary_text directement (comme dans l'overlay : editedSummaryText || meeting.summary_text || '')
      const summaryText = meeting.summary_text || ''
      const title = meeting.title || meeting.name || 'Réunion'
      const date = new Date(meeting.created_at).toLocaleDateString('fr-FR')

      if (!summaryText || !summaryText.trim()) {
        showErrorPopup('Erreur', 'La synthèse est vide et ne peut pas être exportée.')
        return
      }

      // Récupérer le template et le logo (comme dans l'overlay avec templateForExport?.logo_url)
      const templateForExport = resolveTemplateForMeeting(meeting)
      const logoUrl = templateForExport?.logo_url
      const layoutConfig = templateForExport?.layout_config

      // Utiliser les exports avec template si un layoutConfig est disponible
      if (format === 'pdf') {
        if (layoutConfig) {
          await exportToPDFWithTemplate({
            summaryText,
            meetingName: title,
            meetingDate: date,
            logoUrl,
            layoutConfig,
          })
        } else {
          await exportSummaryToPDF(summaryText, title, logoUrl)
        }
        setShowExportSuccess(true)
      } else if (format === 'word') {
        if (layoutConfig) {
          await exportToWordWithTemplate({
            summaryText,
            meetingName: title,
            meetingDate: date,
            logoUrl,
            layoutConfig,
          })
        } else {
          await exportSummaryToWord(summaryText, title, date, logoUrl)
        }
        setShowExportSuccess(true)
      }
    } catch (error) {
      // Ne pas afficher d'erreur si l'utilisateur a annulé
      if ((error as Error).message === 'Sauvegarde annulée') {
        return
      }
      showErrorPopup('Erreur', 'Impossible d\'exporter la synthèse.')
    }
  }, [showErrorPopup, resolveTemplateForMeeting])

  // Open share dialog
  const handleOpenShareDialog = useCallback((meeting: Meeting) => {
    sounds.pop()
    setMeetingToShare(meeting)
    setShareDialogOpen(true)
  }, [])

  // Share handler - called from ShareDialog
  const handleShare = async (shareIds: string[], permissions?: { role: 'reader' | 'editor'; includeTranscript: boolean }) => {
    if (!meetingToShare) return

    const role = permissions?.role || 'reader'
    const includeTranscript = permissions?.includeTranscript || false

    try {
      // Share with all selected contacts with permissions
      await Promise.all(shareIds.map(id => shareMeeting(meetingToShare.id, id, role, includeTranscript)))
      // Show share success animation
      setShowShareSuccess(true)
      // Reload contacts to update the list
      fetchContacts(true)
    } catch (error) {
      showErrorPopup('Erreur', 'Impossible de partager l\'échange.')
      throw error
    }
  }

  const handleTitleChange = useCallback(async (meetingId: string, newTitle: string) => {
    try {
      await updateMeetingTitle(meetingId, newTitle)
      updateMeetingInStore(meetingId, { title: newTitle, name: newTitle })
      showSuccessPopup('Titre modifié', 'Le titre a été mis à jour.')
    } catch (error) {
      showErrorPopup('Erreur', 'Impossible de modifier le titre.')
      throw error
    }
  }, [updateMeetingInStore, showSuccessPopup, showErrorPopup])


  // Global drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragCounterRef = useRef(0)

  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true)
    }
  }, [])

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false)
    }
  }, [])

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current = 0
    setIsDraggingOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const file = files[0]
      // Check if it's an audio/video file
      if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        sounds.pop()
        setDroppedFile(file)
        setImportDialogOpen(true)
      }
    }
  }, [])

  return (
    <div
      className="flex flex-col h-full bg-[#FAFBFC] relative"
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={handleGlobalDragOver}
      onDrop={handleGlobalDrop}
    >
      {/* Global Drag & Drop Overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(255,255,255,0.85)' }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={cn(
                "flex flex-col items-center gap-3 sm:gap-4 p-8 sm:p-12 rounded-xl sm:rounded-2xl",
                "border-2 border-dashed border-blue-400 bg-blue-50/50",
                "max-w-sm sm:max-w-none"
              )}
            >
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-blue-100 flex items-center justify-center">
                <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
              </div>
              <div className="text-center">
                <p className="text-base sm:text-lg font-semibold text-gray-900">Déposez vos fichiers ici</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">MP3, WAV, M4A, WebM, MP4</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-4 sm:pb-6">
        {/* Title row with stats */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-5">
            {/* Large Icon - responsive size */}
            <div
              className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: GILBERT_BLUE_LIGHT }}
            >
              <ForumIcon sx={{ fontSize: { xs: 24, sm: 28, lg: 32 }, color: GILBERT_BLUE }} />
            </div>

            {/* Title + Stats - reserved height to prevent layout shift */}
            <div className="min-w-0">
              <h1
                className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight truncate"
                style={{ color: GILBERT_BLUE }}
              >
                Mes échanges
              </h1>

              {/* Stats inline - fixed height to prevent layout shift */}
              <div className="flex items-center gap-2 sm:gap-3 mt-1 sm:mt-1.5 h-5 sm:h-6">
                {isLoading ? (
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-3 sm:h-4 w-16 sm:w-20 bg-gray-100 rounded animate-pulse" />
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <div className="h-3 sm:h-4 w-20 sm:w-24 bg-gray-100 rounded animate-pulse hidden sm:block" />
                  </div>
                ) : stats.total > 0 ? (
                  <>
                    <span className="text-xs sm:text-sm text-gray-500">
                      <span className="font-semibold text-gray-700">{stats.total}</span> échange{stats.total > 1 ? 's' : ''}
                    </span>
                    {stats.totalHours > 0 && (
                      <>
                        <span className="text-gray-300 hidden sm:inline">•</span>
                        <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">
                          <span className="font-semibold text-gray-700">{stats.totalHours}h</span> analysée{stats.totalHours > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-xs sm:text-sm text-gray-400">Aucun échange</span>
                )}
              </div>
            </div>
          </div>

          {/* Import button - Icon only on mobile, full on larger screens */}
          <button
            onClick={() => { sounds.pop(); setDroppedFile(null); setImportDialogOpen(true); }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl",
              "text-sm font-medium transition-all duration-200",
              "bg-blue-50 text-blue-600 border border-blue-200",
              "hover:bg-blue-100 hover:border-blue-300 active:scale-95",
              "shadow-sm",
              "w-11 h-11 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5"
            )}
          >
            <Download className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Importer</span>
            <span className="hidden lg:inline">une conversation</span>
          </button>
        </div>

        {/* Search & Tabs row - stack on mobile */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 lg:gap-6">
          <div className="relative w-full sm:flex-1 sm:max-w-md order-2 sm:order-1">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher..."
              className="pl-10 sm:pl-11 h-10 sm:h-11 bg-white border-gray-200 rounded-xl focus:border-blue-300 focus:ring-blue-100 text-sm sm:text-base"
            />
          </div>

          <div className="order-1 sm:order-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <AnimatedTabs
              tabs={tabs}
              value={activeTab}
              onChange={(v) => handleTabChange(v as TabValue)}
            />
          </div>
        </div>
      </div>

      {/* Content - extra padding to prevent card shadows from being cut off */}
      <ScrollArea className="flex-1 px-2 sm:px-4 lg:px-6 pb-6 sm:pb-8">
        <div className="px-2 sm:px-2">
          {isLoading ? (
            <div className="space-y-2 sm:space-y-3 py-3 sm:py-4">
              {/* Skeleton cards with blur effect */}
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-3 sm:p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-100/50"
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gray-100/70 animate-pulse" />
                    <div className="flex-1">
                      <div className="h-4 sm:h-5 bg-gray-100/70 rounded w-2/3 sm:w-1/3 mb-2 sm:mb-3 animate-pulse" />
                      <div className="flex gap-2 sm:gap-4">
                        <div className="h-3 sm:h-4 bg-gray-100/60 rounded w-12 sm:w-16 animate-pulse" />
                        <div className="h-3 sm:h-4 bg-gray-100/60 rounded w-10 sm:w-12 animate-pulse" />
                        <div className="h-3 sm:h-4 bg-gray-100/60 rounded w-16 sm:w-24 hidden sm:block animate-pulse" />
                      </div>
                    </div>
                    <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-gray-100/70 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : activeTab === 'exchanges' ? (
            <div>
              {groupedMeetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
                  <div
                    className="w-16 h-16 sm:w-24 sm:h-24 rounded-2xl sm:rounded-3xl flex items-center justify-center mb-4 sm:mb-6"
                    style={{ backgroundColor: GILBERT_BLUE_LIGHT }}
                  >
                    <ForumIcon sx={{ fontSize: { xs: 32, sm: 48 }, color: GILBERT_BLUE }} />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">
                    Aucun échange
                  </h3>
                  <p className="text-sm sm:text-base text-gray-500 max-w-sm mb-4 sm:mb-6">
                    Importez un fichier audio pour commencer
                  </p>
                  <button
                    onClick={() => { sounds.pop(); setDroppedFile(null); setImportDialogOpen(true); }}
                    className={cn(
                      "flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl",
                      "text-sm font-medium transition-all duration-200",
                      "bg-blue-50 text-blue-600 border border-blue-200",
                      "hover:bg-blue-100 hover:border-blue-300 active:scale-95",
                      "shadow-sm min-h-[44px]"
                    )}
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Importer ma première conversation</span>
                    <span className="sm:hidden">Importer</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedMeetings.map((group) => (
                    <div key={group.label}>
                      <DateGroupHeader
                        label={group.label}
                        count={group.meetings.length}
                      />
                      <div className="grid gap-3 mt-2">
                        {group.meetings.map((meeting, index) => (
                          <ExchangeCard
                            key={meeting.id}
                            meeting={meeting}
                            onClick={() => handleOpenOverlay(meeting)}
                            onDelete={() => handleDeleteClick(meeting)}
                            onExportTranscript={(format) => handleExportTranscript(meeting, format)}
                            onExportSummary={(format) => handleExportSummary(meeting, format)}
                            onOpenShareDialog={() => handleOpenShareDialog(meeting)}
                            onOpenSynthesis={() => handleOpenSynthesis(meeting)}
                            onTitleChange={(newTitle) => handleTitleChange(meeting.id, newTitle)}
                            isShared={meeting.is_shared}
                            index={index}
                            folders={folders}
                            onFolderChange={() => fetchFolders(true)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1 sm:gap-2 pt-4 sm:pt-6 pb-3 sm:pb-4">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className={cn(
                          "p-1.5 sm:p-2 rounded-lg transition-colors",
                          currentPage === 1
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 rotate-180" />
                      </button>

                      <div className="flex items-center gap-0.5 sm:gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // Show first, last, current and adjacent pages
                          const showPage = page === 1 ||
                                          page === totalPages ||
                                          Math.abs(page - currentPage) <= 1
                          const showEllipsis = (page === 2 && currentPage > 3) ||
                                              (page === totalPages - 1 && currentPage < totalPages - 2)

                          if (!showPage && !showEllipsis) return null
                          if (showEllipsis && !showPage) {
                            return (
                              <span key={page} className="px-1 sm:px-2 text-slate-400 text-xs">...</span>
                            )
                          }

                          return (
                            <button
                              key={page}
                              onClick={() => handlePageChange(page)}
                              className={cn(
                                "w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs sm:text-sm font-medium transition-colors",
                                page === currentPage
                                  ? "bg-blue-500 text-white"
                                  : "text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              {page}
                            </button>
                          )
                        })}
                      </div>

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className={cn(
                          "p-1.5 sm:p-2 rounded-lg transition-colors",
                          currentPage === totalPages
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      <span className="ml-2 sm:ml-3 text-[10px] sm:text-xs text-slate-400">
                        {filteredMeetings.length} <span className="hidden sm:inline">réunion{filteredMeetings.length > 1 ? 's' : ''}</span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            // Folders tab - using full FoldersTab component
            <FoldersTab
              onOpenMeeting={(meetingId) => {
                const meeting = meetings.find(m => m.id === meetingId)
                if (meeting) {
                  handleOpenOverlay(meeting, 'transcription')
                }
              }}
              meetings={meetings}
            />
          )}
        </div>
      </ScrollArea>

      {/* Import Dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          setImportDialogOpen(open)
          if (!open) setDroppedFile(null) // Reset dropped file when dialog closes
        }}
        onImportSuccess={(meeting) => {
          addMeetingToStore(meeting as Meeting)
          fetchMeetings(true)
        }}
        initialFile={droppedFile}
      />

      {/* Summary Generation Success Animation */}
      <SummaryValidation
        show={showSummarySuccess}
        onComplete={() => setShowSummarySuccess(false)}
      />

      {/* Delete Success Animation */}
      <DeleteValidation
        show={showDeleteSuccess}
        onComplete={() => setShowDeleteSuccess(false)}
      />

      {/* Export Success Animation */}
      <ExportValidation
        show={showExportSuccess}
        onComplete={() => setShowExportSuccess(false)}
      />

      {/* Share Success Animation */}
      <ShareValidation
        show={showShareSuccess}
        onComplete={() => setShowShareSuccess(false)}
      />

      {/* Share Dialog */}
      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        meetingTitle={meetingToShare?.title || meetingToShare?.name || 'Sans titre'}
        contacts={contacts}
        onShare={handleShare}
        hasTranscript={meetingToShare?.transcript_status === 'completed' || meetingToShare?.transcription_status === 'completed'}
        hasSummary={meetingToShare?.summary_status === 'completed' && !!meetingToShare?.summary_text}
        maxRole={meetingToShare?.is_shared ? (meetingToShare.role || meetingToShare.permissions?.role || 'reader') : 'editor'}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!isDeleting) {
          setDeleteDialogOpen(open)
          if (!open) setMeetingToDelete(null)
        }
      }}>
        <DialogContent showCloseButton={false} className="sm:max-w-[425px]" aria-describedby={undefined}>
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Supprimer l'échange</h2>
          </div>

          {/* Content */}
          <p className="text-gray-600">
            Êtes-vous sûr de vouloir supprimer cet échange ?
          </p>

          {meetingToDelete && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 overflow-hidden">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <p className="font-medium text-gray-900 truncate max-w-full" title={meetingToDelete.title || meetingToDelete.name || 'Sans titre'}>
                    {meetingToDelete.title || meetingToDelete.name || 'Sans titre'}
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Cette action est irréversible
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Buttons - side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', paddingTop: '8px' }}>
            <button
              onClick={() => {
                setDeleteDialogOpen(false)
                setMeetingToDelete(null)
              }}
              disabled={isDeleting}
              style={{
                height: '44px',
                borderRadius: '12px',
                border: '1px solid #E5E7EB',
                backgroundColor: 'white',
                color: '#374151',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              style={{
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#DC2626',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Supprimer
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Meeting Detail Overlay */}
      {overlayMeeting && (
        <MeetingDetailOverlay
          open={overlayOpen}
          onClose={handleCloseOverlay}
          meeting={overlayMeeting}
          initialTab={initialOverlayTab}
          formattedTranscript={formattedTranscript}
          isLoadingTranscript={isLoadingTranscript}
          onLoadTranscript={handleLoadTranscript}
          onSaveSpeakerName={handleSaveSpeakerName}
          hasCustomName={handleHasCustomName}
          isEditingTranscript={isEditingTranscript}
          onStartEditTranscript={() => setIsEditingTranscript(true)}
          onCancelEditTranscript={() => setIsEditingTranscript(false)}
          onSaveTranscript={handleSaveTranscript}
          isSavingTranscript={isSavingTranscript}
          editedTranscriptText={editedTranscriptText}
          onTranscriptTextChange={setEditedTranscriptText}
          onTranscriptEntryChange={(index: number, newText: string) => {
            if (formattedTranscript) {
              const updated = [...formattedTranscript]
              updated[index] = { ...updated[index], text: newText }
              setFormattedTranscript(updated)
              setEditedTranscriptText(updated.map(u => `${u.speaker}: ${u.text}`).join('\n\n'))
            }
          }}
          templates={templates}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={setSelectedTemplateId}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingSummary={generatingSummaryId === overlayMeeting.id}
          isEditingSummary={isEditingSummary}
          editedSummaryText={editedSummaryText}
          onStartEditSummary={() => setIsEditingSummary(true)}
          onCancelEditSummary={() => setIsEditingSummary(false)}
          onSaveSummary={handleSaveSummary}
          isSavingSummary={isSavingSummary}
          onSummaryTextChange={setEditedSummaryText}
          onDelete={(id) => {
            const meeting = meetings.find(m => m.id === id) || sharedMeetings.find(m => m.id === id)
            if (meeting) {
              handleCloseOverlay()
              handleDeleteClick(meeting)
            }
          }}
          onShare={(m) => handleShare(m)}
          onPlayAudio={() => {}}
          onSaveTitle={async (meetingId, newTitle) => {
            await handleTitleChange(meetingId, newTitle)
            // Mettre à jour l'overlay meeting aussi
            setOverlayMeeting(prev => prev ? { ...prev, title: newTitle, name: newTitle } : prev)
          }}
          resolveTemplateForMeeting={resolveTemplateForMeeting}
          onError={(title, msg) => showErrorPopup(title, msg)}
        />
      )}
    </div>
  )
}

export default ExchangesPage
