import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import {
  AccessTime as AccessTimeIcon,
  CallMade as CallMadeIcon,
  CallReceived as CallReceivedIcon,
  ArrowBack as ArrowBackIcon,
  CalendarToday as CalendarTodayIcon,
  ErrorOutline as ErrorOutlineIcon,
  Forum as ForumIcon,
  People as PeopleIcon,
  Share as ShareIcon,
  Person as PersonIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import {
  Organization,
  OrganizationMember,
  OrganizationMeeting,
  OrganizationTemplate,
  getMyOrganizations,
  getOrganizationLogoUrl,
  getOrganizationMembers,
  getOrganizationMeetings,
  getOrganizationTemplates,
} from '../services/organizationService';
import {
  Contact,
  MeetingShareInfo,
  OutgoingShareHistoryEntry,
  OutgoingShareRecord,
  getMeetingShares,
  getMyContacts,
  getOutgoingShareHistory,
  getSharedMeetings,
} from '../services/shareService';
import { Meeting, getAllMeetings } from '../services/meetingService';
import apiClient from '../services/apiClient';
import MeetingSummaryRenderer from './MeetingSummaryRenderer';
import SummaryExportButton from './SummaryExportButton';
import { useNotification } from '../contexts/NotificationContext';
import { OrganizationsNavigationIntent } from '../types/navigation';
import { logger } from '@/utils/logger';

interface OrganizationsViewProps {
  user?: import('../services/authService').User | null;
  isMobile?: boolean;
  navigationIntent?: OrganizationsNavigationIntent | null;
  onNavigationConsumed?: () => void;
}

interface SharedMeetingSummary {
  id: string;
  title?: string | null;
  created_at?: string | null;
  shared_at?: string | null;
  shared_by?: string | null;
  shared_by_email?: string | null;
  owner_share_id?: string | null;
  owner_id?: string | null;
  summary_status?: string | null;
  summary_text?: string | null;
  permissions?: {
    can_view: boolean;
    can_export: boolean;
  };
  duration_seconds?: number | null;
}

type ShareActivityItem = {
  id: string;
  type: 'incoming' | 'outgoing';
  title: string;
  subtitle: string;
  timestamp?: string | null;
  meta?: string;
  meetingId?: string;
  target?: { type: 'contact'; key: string } | { type: 'organization'; id: string };
};

type SelectedEntity =
  | { type: 'organization'; organization: Organization }
  | { type: 'contact'; conversation: ContactConversationEntry }
  | null;

type ViewableMeeting =
  | (SharedMeetingSummary & { kind: 'shared' })
  | (OrganizationMeeting & { kind: 'organization' })
  | (Meeting & { kind: 'outgoing' });

type OutgoingShareSummary = OutgoingShareRecord & {
  meeting_title?: string | null;
  meeting_created_at?: string | null;
  meeting_duration_seconds?: number | null;
};

type ContactConversationEntry = {
  key: string;
  displayName: string;
  shareId?: string | null;
  contact?: Contact;
  avatarUrl?: string | null;
  fallbackInitials: string;
  lastActivity?: string | null;
  incomingMeetings: SharedMeetingSummary[];
  outgoingMeetings: OutgoingShareSummary[];
};

type ConversationMeetingEntry = {
  id: string;
  direction: 'incoming' | 'outgoing';
  sharedAt?: string | null;
  permissions?: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
  };
  meeting: ViewableMeeting;
};

type MeetingSharedEventRecipient =
  | { type: 'contact'; shareId?: string; userId?: string; name?: string; includeTranscript?: boolean }
  | { type: 'organization'; organizationId: string; name?: string; includeTranscript?: boolean };

type MeetingSharedEventDetail = {
  meetingId: string;
  timestamp?: string;
  direction?: 'incoming' | 'outgoing';
  recipients?: MeetingSharedEventRecipient[];
};

const DESKTOP_SCROLL_AREA_HEIGHT = 'calc(100vh - 220px)';

const formatShareKey = (value?: string | null) => value?.toLowerCase().trim() ?? '';

const collectConversationKeys = (conversation: ContactConversationEntry) => {
  const keys = new Set<string>();
  const add = (value?: string | null) => {
    const key = formatShareKey(value);
    if (key) {
      keys.add(key);
    }
  };

  add(conversation.key);
  add(conversation.shareId);
  add(conversation.contact?.contact_user_id);
  add(conversation.contact?.contact_share_id);
  add(conversation.contact?.id);

  return keys;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return 'Date inconnue';
  }
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
};

const formatRelativeTime = (value: string | null | undefined) => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) {
    return '';
  }
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return "À l'instant";
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `Il y a ${diffDays} j`;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDuration = (seconds?: number | null) => {
  if (!seconds || Number.isNaN(seconds)) {
    return 'Durée inconnue';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
};

const getMeetingTitle = (meeting: ViewableMeeting) => {
  if ('meeting_title' in meeting && meeting.meeting_title) {
    return meeting.meeting_title;
  }
  if ('title' in meeting && meeting.title) {
    return meeting.title;
  }
  if ('name' in meeting && meeting.name) {
    return meeting.name;
  }
  return 'Réunion';
};

const getMeetingDurationSeconds = (meeting: ViewableMeeting) => {
  if ('meeting_duration_seconds' in meeting && meeting.meeting_duration_seconds != null) {
    return meeting.meeting_duration_seconds;
  }
  if ('duration_seconds' in meeting && meeting.duration_seconds != null) {
    return meeting.duration_seconds;
  }
  if ('duration' in meeting && typeof meeting.duration === 'number') {
    return meeting.duration;
  }
  if ('audio_duration' in meeting && typeof meeting.audio_duration === 'number') {
    return meeting.audio_duration;
  }
  return null;
};

const getMeetingCreatedAt = (meeting: ViewableMeeting) => {
  if ('meeting_created_at' in meeting && meeting.meeting_created_at) {
    return meeting.meeting_created_at;
  }
  if ('created_at' in meeting && meeting.created_at) {
    return meeting.created_at;
  }
  return null;
};

const getMeetingId = (meeting: ViewableMeeting) => {
  if ('meeting_id' in meeting && meeting.meeting_id) {
    return meeting.meeting_id;
  }
  if ('id' in meeting && meeting.id) {
    return meeting.id;
  }
  return '';
};

const getSummaryStatus = (meeting: ViewableMeeting) => {
  if ('summary_status' in meeting) {
    return meeting.summary_status ?? null;
  }
  return null;
};

type TranscriptEntry = {
  speaker: string;
  text: string;
  timestamp?: string;
};

const parseTranscriptEntries = (rawTranscript: unknown): TranscriptEntry[] | null => {
  if (!rawTranscript) {
    return null;
  }

  if (Array.isArray(rawTranscript)) {
    return rawTranscript
      .map((item) => {
        if (typeof item === 'object' && item) {
          const speaker = 'speaker' in item ? String(item.speaker ?? 'Intervenant') : 'Intervenant';
          const text = 'text' in item ? String(item.text ?? '') : '';
          const timestamp = 'timestamp' in item && item.timestamp ? String(item.timestamp) : undefined;
          return { speaker, text, timestamp };
        }
        return { speaker: 'Intervenant', text: String(item) };
      })
      .filter((entry) => entry.text.trim().length > 0);
  }

  if (typeof rawTranscript === 'string') {
    const lines = rawTranscript.split('\n');
    const entries: TranscriptEntry[] = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
      if (bracketMatch) {
        entries.push({
          timestamp: bracketMatch[1].trim(),
          speaker: bracketMatch[2].trim(),
          text: bracketMatch[3].trim(),
        });
        return;
      }

      const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch) {
        entries.push({
          speaker: colonMatch[1].trim(),
          text: colonMatch[2].trim(),
        });
        return;
      }

      entries.push({
        speaker: 'Intervenant',
        text: trimmed,
      });
    });

    return entries.length > 0 ? entries : null;
  }

  try {
    const parsed = JSON.parse(JSON.stringify(rawTranscript));
    return parseTranscriptEntries(parsed);
  } catch {
    return [{ speaker: 'Intervenant', text: String(rawTranscript) }];
  }
};

const normalizeSharedMeeting = (meeting: any): SharedMeetingSummary => ({
  id: meeting?.id ?? meeting?.meeting_id ?? '',
  title: meeting?.title ?? meeting?.name ?? 'Réunion partagée',
  created_at: meeting?.created_at ?? null,
  shared_at: meeting?.shared_at ?? null,
  shared_by: meeting?.shared_by ?? meeting?.owner_name ?? null,
  shared_by_email: meeting?.shared_by_email ?? meeting?.owner_email ?? null,
  owner_share_id: meeting?.owner_share_id ?? null,
  owner_id: meeting?.owner_id ?? meeting?.user_id ?? null,
  summary_status: meeting?.summary_status ?? null,
  summary_text: meeting?.summary_text ?? null,
  permissions: meeting?.permissions ?? { can_view: true, can_export: false },
  duration_seconds: meeting?.duration_seconds ?? meeting?.meeting_duration_seconds ?? null,
});

const buildConversationKey = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    const key = formatShareKey(value);
    if (key) {
      return key;
    }
  }
  return '';
};

const normalizeName = (value?: string | null) => value?.toLowerCase().trim() ?? '';

const transcriptSpeakerColors = [
  { bg: '#E3F2FD', color: '#1976D2' },
  { bg: '#F3E5F5', color: '#7B1FA2' },
  { bg: '#E8F5E9', color: '#388E3C' },
  { bg: '#FFF3E0', color: '#F57C00' },
  { bg: '#FCE4EC', color: '#C2185B' },
  { bg: '#F1F8E9', color: '#689F38' },
];

const OrganizationsView: React.FC<OrganizationsViewProps> = ({
  navigationIntent,
  onNavigationConsumed,
}) => {
  const theme = useTheme();
  const { showErrorPopup } = useNotification();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sharedMeetings, setSharedMeetings] = useState<SharedMeetingSummary[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [viewingMeeting, setViewingMeeting] = useState<ViewableMeeting | null>(null);
  const [ownMeetings, setOwnMeetings] = useState<Meeting[]>([]);
  const [outgoingHistory, setOutgoingHistory] = useState<OutgoingShareHistoryEntry[]>([]);
  const [conversationHistories, setConversationHistories] = useState<Record<string, ConversationMeetingEntry[]>>({});
  const [ephemeralConversationEntries, setEphemeralConversationEntries] = useState<
    Record<string, ConversationMeetingEntry[]>
  >({});
  const [loadingConversationHistory, setLoadingConversationHistory] = useState<boolean>(false);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[] | null>(null);
  const [transcriptTitle, setTranscriptTitle] = useState<string>('Transcription');

  const [organizationMembers, setOrganizationMembers] = useState<Record<string, OrganizationMember[]>>({});
  const [organizationMeetings, setOrganizationMeetings] = useState<Record<string, OrganizationMeeting[]>>({});
  const [organizationTemplates, setOrganizationTemplates] = useState<Record<string, OrganizationTemplate[]>>({});
  const meetingSharesCacheRef = useRef<Record<string, MeetingShareInfo[]>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const [orgs, contactsResponse, shared, outgoing] = await Promise.all([
          getMyOrganizations(),
          getMyContacts().catch(() => [] as Contact[]),
          getSharedMeetings(),
          getOutgoingShareHistory().catch(() => [] as OutgoingShareHistoryEntry[]),
        ]);

        if (!isMounted) {
          return;
        }

        const historyByKey = new Map<string, OutgoingShareHistoryEntry>();
        outgoing.forEach((entry) => {
          const key =
            formatShareKey(entry.contact_share_id) ||
            formatShareKey(entry.contact_user_id) ||
            formatShareKey(entry.contact_email);
          if (key) {
            historyByKey.set(key, entry);
          }
        });

        const enrichedContacts = contactsResponse.map((contact) => {
          const key = formatShareKey(contact.contact_share_id || contact.contact_user_id || contact.id);
          if (!key) {
            return contact;
          }
          const historyEntry = historyByKey.get(key);
          if (!historyEntry) {
            return contact;
          }
          return {
            ...contact,
            share_count: historyEntry.shares.length,
            last_shared_at: historyEntry.last_shared_at ?? contact.last_shared_at ?? null,
          };
        });

        const supplementalContacts: Contact[] = [];
        outgoing.forEach((entry) => {
          const key =
            formatShareKey(entry.contact_share_id) ||
            formatShareKey(entry.contact_user_id) ||
            formatShareKey(entry.contact_email);
          if (!key) {
            return;
          }
          const alreadyPresent = enrichedContacts.some((contact) => {
            const contactKey = formatShareKey(contact.contact_share_id || contact.contact_user_id || contact.id);
            return contactKey === key;
          });
          if (!alreadyPresent) {
            supplementalContacts.push({
              id: entry.contact_user_id,
              contact_user_id: entry.contact_user_id,
              contact_name: entry.contact_name,
              contact_share_id: entry.contact_share_id ?? '',
              contact_profile_picture: entry.contact_profile_picture ?? null,
              last_shared_at: entry.last_shared_at ?? null,
              share_count: entry.shares.length,
              created_at: entry.last_shared_at ?? null,
            });
          }
        });

        setOrganizations(orgs);
        setContacts([...enrichedContacts, ...supplementalContacts]);
        setSharedMeetings(shared.map(normalizeSharedMeeting));
        setOutgoingHistory(outgoing);
        setError(null);
      } catch (err: any) {
        logger.error('❌ [Organisations] Chargement impossible', err);
        if (!isMounted) {
          return;
        }
        const message =
          err?.response?.data?.detail ??
          err?.message ??
          "Impossible de charger les données de partage pour le moment.";
        setError(message);
        showErrorPopup?.('Erreur', message);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [showErrorPopup, refreshKey]);

  const ensureOrganizationDetails = useCallback(
    async (organizationId: string) => {
      if (
        organizationMeetings[organizationId] &&
        organizationMembers[organizationId] &&
        organizationTemplates[organizationId]
      ) {
        return;
      }

      try {
        setLoadingDetails(true);
        const [meetings, members, templates] = await Promise.all([
          getOrganizationMeetings(organizationId),
          getOrganizationMembers(organizationId),
          getOrganizationTemplates(organizationId),
        ]);

        setOrganizationMeetings((prev) => ({ ...prev, [organizationId]: meetings }));
        setOrganizationMembers((prev) => ({ ...prev, [organizationId]: members }));
        setOrganizationTemplates((prev) => ({ ...prev, [organizationId]: templates }));
      } catch (err: any) {
        logger.error('❌ [Organisations] Chargement des détails impossible', err);
        const message =
          err?.response?.data?.detail ??
          err?.message ??
          "Impossible de récupérer les informations de l'organisation.";
        setError(message);
        showErrorPopup?.('Erreur', message);
      } finally {
        setLoadingDetails(false);
      }
    },
    [organizationMeetings, organizationMembers, organizationTemplates, showErrorPopup]
  );

  useEffect(() => {
    if (selectedEntity?.type === 'organization') {
      ensureOrganizationDetails(selectedEntity.organization.id);
    }
  }, [selectedEntity, ensureOrganizationDetails]);

  useEffect(() => {
    let isMounted = true;

    const loadOwnMeetings = async () => {
      try {
        const meetings = await getAllMeetings();
        if (isMounted) {
          setOwnMeetings(meetings);
        }
      } catch (err) {
        logger.error('❌ [Organisations] Impossible de charger les réunions personnelles', err);
      }
    };

    loadOwnMeetings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenTranscript = useCallback(
    async (meetingId: string, meetingTitle: string) => {
      if (!meetingId) {
        setTranscriptTitle(meetingTitle || 'Transcription');
        setTranscriptDialogOpen(true);
        setTranscriptLoading(false);
        setTranscriptEntries(null);
        return;
      }

      setTranscriptTitle(meetingTitle || 'Transcription');
      setTranscriptDialogOpen(true);
      setTranscriptLoading(true);
      setTranscriptEntries(null);

      try {
        const response: any = await apiClient.get(`/simple/meetings/${meetingId}`);
        const data = response?.data ?? response ?? null;

        if (!data) {
          setTranscriptEntries(null);
          return;
        }

        const candidateFields = [
          'transcript',
          'transcription',
          'transcript_text',
          'transcription_text',
          'content',
          'text',
        ];

        let transcript: unknown = null;
        for (const field of candidateFields) {
          if (data[field] != null) {
            transcript = data[field];
            break;
          }
        }

        const entries = parseTranscriptEntries(transcript);
        setTranscriptEntries(entries);
      } catch (error: any) {
        logger.error('❌ [Organisations] Erreur lors de la récupération de la transcription', error);
        setTranscriptEntries(null);
      } finally {
        setTranscriptLoading(false);
      }
    },
    []
  );

  const recentActivities = useMemo<ShareActivityItem[]>(() => {
    const incoming: ShareActivityItem[] = sharedMeetings
      .filter((meeting) => !!meeting.shared_at || !!meeting.created_at)
      .map((meeting) => {
        const counterpartShareId =
          meeting.owner_share_id ?? meeting.shared_by_email ?? meeting.shared_by ?? meeting.id;
        const contactKey = formatShareKey(counterpartShareId);

        return {
        id: `incoming-${meeting.id}`,
        type: 'incoming',
        title: meeting.title || 'Réunion partagée',
        subtitle: meeting.shared_by ? `Partagée par ${meeting.shared_by}` : 'Réunion reçue',
        timestamp: meeting.shared_at || meeting.created_at || undefined,
        meta: formatDuration(meeting.duration_seconds),
          meetingId: meeting.id,
          target: contactKey ? { type: 'contact', key: contactKey } : undefined,
        };
      });

    const outgoing: ShareActivityItem[] = contacts
      .filter((contact) => {
        return (
          contact.last_interaction_at ||
          contact.last_shared_at ||
          contact.last_received_at
        );
      })
      .map((contact) => {
        const keySource = contact.contact_share_id || contact.contact_user_id || contact.id;
        const contactKey = formatShareKey(keySource);
        const totalInteractions =
          contact.total_interactions ??
          (contact.share_count ?? 0) + (contact.received_count ?? 0);
        const lastDirection = contact.last_direction ?? 'unknown';
        const directionLabel =
          lastDirection === 'incoming'
            ? 'Dernier échange reçu'
            : lastDirection === 'outgoing'
              ? 'Dernier partage envoyé'
              : 'Dernier échange';
        const timestamp =
          contact.last_interaction_at ||
          contact.last_shared_at ||
          contact.last_received_at ||
          undefined;

        return {
          id: `outgoing-${contact.contact_user_id || keySource}`,
        type: 'outgoing',
        title: contact.contact_name || contact.contact_share_id || 'Contact',
        subtitle:
            totalInteractions > 0
              ? `${directionLabel}`
              : 'Aucun échange',
          timestamp,
          meta:
            totalInteractions > 0
              ? `${totalInteractions} échange${totalInteractions > 1 ? 's' : ''}`
              : undefined,
          target: contactKey ? { type: 'contact', key: contactKey } : undefined,
        };
      });

    const merged = [...incoming, ...outgoing].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    return merged.slice(0, 12);
  }, [sharedMeetings, contacts]);

  const organizationConversationItems = useMemo(
    () =>
      organizations.map((organization) => ({
        key: `organization-${organization.id}`,
        organization,
        lastActivity:
          organizationMeetings[organization.id]?.[0]?.shared_at ??
          organizationMeetings[organization.id]?.[0]?.meeting_created_at ??
          null,
      })),
    [organizations, organizationMeetings]
  );

  const contactConversationData = useMemo<{
    conversations: ContactConversationEntry[];
    lookup: Map<string, ContactConversationEntry>;
  }>(() => {
    const canonicalEntries = new Map<string, ContactConversationEntry>();
    const lookup = new Map<string, ContactConversationEntry>();
    const nameIndex = new Map<string, ContactConversationEntry[]>();

    const bindKeys = (
      entry: ContactConversationEntry,
      keys: Array<string | null | undefined>
    ) => {
      const canonicalKey = formatShareKey(entry.key);
      if (canonicalKey) {
        lookup.set(canonicalKey, entry);
      }
      keys.forEach((rawKey) => {
        const key = formatShareKey(rawKey);
        if (key) {
          lookup.set(key, entry);
        }
      });
    };

    const registerName = (entry: ContactConversationEntry, name?: string | null) => {
      const normalized = normalizeName(name ?? entry.displayName);
      if (!normalized) {
        return;
      }
      const existing = nameIndex.get(normalized);
      if (existing) {
        if (!existing.includes(entry)) {
          existing.push(entry);
        }
      } else {
        nameIndex.set(normalized, [entry]);
      }
    };

    const getOrCreateEntry = (
      primaryKey: string,
      initializer: () => ContactConversationEntry
    ): ContactConversationEntry => {
      let entry = canonicalEntries.get(primaryKey);
      if (!entry) {
        entry = initializer();
        canonicalEntries.set(primaryKey, entry);
      }
      return entry;
    };

    contacts.forEach((contact) => {
      const potentialKeys = [contact.contact_share_id, contact.contact_user_id, contact.id];
      const primaryKey = buildConversationKey(...potentialKeys);
      if (!primaryKey) {
        return;
      }

      const entry = getOrCreateEntry(primaryKey, () => {
      const displayName = contact.contact_name || contact.contact_share_id || 'Collaborateur';
        const lastActivity =
          contact.last_interaction_at ??
          contact.last_shared_at ??
          contact.last_received_at ??
          null;
        return {
          key: primaryKey,
        displayName,
        shareId: contact.contact_share_id ?? null,
        contact,
        avatarUrl: contact.contact_profile_picture ?? null,
        fallbackInitials: displayName.slice(0, 2).toUpperCase(),
          lastActivity,
        incomingMeetings: [],
          outgoingMeetings: [],
        };
      });

      if (!entry.contact) {
        entry.contact = contact;
      }
      if (!entry.shareId && contact.contact_share_id) {
        entry.shareId = contact.contact_share_id;
      }
      if (contact.contact_name && entry.displayName !== contact.contact_name) {
        entry.displayName = contact.contact_name;
      }
      if (!entry.avatarUrl && contact.contact_profile_picture) {
        entry.avatarUrl = contact.contact_profile_picture;
      }
      const candidateDates = [
        contact.last_interaction_at,
        contact.last_shared_at,
        contact.last_received_at,
      ].filter(Boolean) as string[];
      if (candidateDates.length > 0) {
        const latest = candidateDates.reduce((latestSoFar, current) => {
          if (!latestSoFar) {
            return current;
          }
          return new Date(current).getTime() > new Date(latestSoFar).getTime()
            ? current
            : latestSoFar;
        }, entry.lastActivity ?? candidateDates[0]);
        entry.lastActivity = latest ?? entry.lastActivity ?? null;
      }

      bindKeys(entry, potentialKeys);
      registerName(entry, contact.contact_name);
    });

    sharedMeetings.forEach((meeting) => {
      const potentialKeys = [
        meeting.owner_share_id,
        meeting.owner_id,
        meeting.shared_by_email,
        meeting.shared_by,
      ];

      let entry: ContactConversationEntry | undefined;

      for (const value of potentialKeys) {
        const key = formatShareKey(value);
      if (!key) {
          continue;
        }
        entry = lookup.get(key);
        if (entry) {
          break;
        }
      }

      if (!entry) {
        const matches = nameIndex.get(normalizeName(meeting.shared_by || meeting.shared_by_email));
        if (matches?.length === 1) {
          entry = matches[0];
        }
      }

      let primaryKey = entry?.key ?? buildConversationKey(...potentialKeys);
      if (!primaryKey) {
        primaryKey = `shared-${meeting.id}`;
      }

      entry =
        entry ??
        getOrCreateEntry(primaryKey, () => {
          const displayName = meeting.shared_by || meeting.shared_by_email || 'Collaborateur';
          return {
            key: primaryKey,
          displayName,
            shareId: meeting.owner_share_id ?? null,
          contact: undefined,
          avatarUrl: null,
          fallbackInitials: displayName.slice(0, 2).toUpperCase(),
          lastActivity: null,
          incomingMeetings: [],
            outgoingMeetings: [],
        };
        });

      entry.incomingMeetings.push(meeting);

      const timestamp = meeting.shared_at ?? meeting.created_at ?? null;
      if (timestamp) {
        const candidate = new Date(timestamp).getTime();
        const current = entry.lastActivity ? new Date(entry.lastActivity).getTime() : 0;
        if (Number.isFinite(candidate) && candidate > current) {
          entry.lastActivity = timestamp;
        }
      }

      if (!entry.shareId && meeting.owner_share_id) {
        entry.shareId = meeting.owner_share_id;
      }

      bindKeys(entry, [entry.key, ...potentialKeys]);
      registerName(entry, meeting.shared_by);
      registerName(entry, meeting.shared_by_email);
    });

    outgoingHistory.forEach((historyEntry) => {
      const potentialKeys = [
        historyEntry.contact_share_id,
        historyEntry.contact_user_id,
        historyEntry.contact_email,
      ];
      const primaryKey = buildConversationKey(...potentialKeys);
      if (!primaryKey) {
        return;
      }

      const entry = getOrCreateEntry(primaryKey, () => {
        const displayName = historyEntry.contact_name || historyEntry.contact_share_id || 'Collaborateur';
        return {
          key: primaryKey,
          displayName,
          shareId: historyEntry.contact_share_id ?? null,
          contact: undefined,
          avatarUrl: historyEntry.contact_profile_picture ?? null,
          fallbackInitials: displayName.slice(0, 2).toUpperCase(),
          lastActivity: historyEntry.last_shared_at ?? null,
          incomingMeetings: [],
          outgoingMeetings: [],
        };
      });

      if (!entry.shareId && historyEntry.contact_share_id) {
        entry.shareId = historyEntry.contact_share_id;
      }
      if (!entry.contact) {
        entry.contact = {
          id: historyEntry.contact_user_id,
          contact_user_id: historyEntry.contact_user_id,
          contact_name: historyEntry.contact_name,
          contact_share_id: historyEntry.contact_share_id ?? '',
          contact_profile_picture: historyEntry.contact_profile_picture ?? null,
          last_shared_at: historyEntry.last_shared_at ?? null,
          share_count: historyEntry.share_count,
          created_at: historyEntry.last_shared_at ?? null,
        };
      }
      if (historyEntry.contact_profile_picture && !entry.avatarUrl) {
        entry.avatarUrl = historyEntry.contact_profile_picture;
      }

      historyEntry.shares.forEach((shareRecord) => {
        entry.outgoingMeetings.push(shareRecord);
        const candidate = new Date(shareRecord.shared_at).getTime();
        const current = entry.lastActivity ? new Date(entry.lastActivity).getTime() : 0;
        if (Number.isFinite(candidate) && candidate > current) {
          entry.lastActivity = shareRecord.shared_at;
        }
      });

      if (entry.contact) {
        entry.contact.share_count = entry.outgoingMeetings.length;
        entry.contact.last_shared_at = entry.lastActivity ?? entry.contact.last_shared_at ?? null;
      }

      bindKeys(entry, [entry.shareId, ...potentialKeys]);
      registerName(entry, historyEntry.contact_name);
    });

    const conversations = Array.from(canonicalEntries.values());
    conversations.sort((a, b) => {
      const aTime = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bTime = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bTime - aTime;
    });

    return { conversations, lookup };
  }, [contacts, sharedMeetings, outgoingHistory]);

  const contactConversations = contactConversationData.conversations;
  const contactConversationLookup = contactConversationData.lookup;


  const handleBackToHub = () => {
    setSelectedEntity(null);
  };

  const handleSelectOrganization = (organization: Organization) => {
    setSelectedEntity({ type: 'organization', organization });
  };

  const handleSelectConversation = (conversation: ContactConversationEntry) => {
    setSelectedEntity({ type: 'contact', conversation });
  };

  const handleCloseTranscriptDialog = () => {
    setTranscriptDialogOpen(false);
    setTranscriptEntries(null);
  };

  const handleActivityClick = useCallback(
    (activity: ShareActivityItem) => {
      if (!activity.target) {
        return;
      }

      if (activity.target.type === 'contact') {
        const entry = contactConversationLookup.get(activity.target.key);
        const conversation = entry;
        if (conversation) {
          handleSelectConversation(conversation);
        } else {
          showErrorPopup?.(
            'Conversation indisponible',
            "Impossible d'ouvrir cette conversation pour le moment."
          );
        }
      } else if (activity.target.type === 'organization') {
        const organizationId = activity.target.id;
        const organization = organizations.find((org) => org.id === organizationId);
        if (organization) {
          handleSelectOrganization(organization);
        }
      }
    },
    [contactConversationLookup, handleSelectConversation, handleSelectOrganization, organizations, showErrorPopup]
  );

  useEffect(() => {
    if (!navigationIntent) {
      return;
    }

    let resolved = false;

    const trySelectOrganization = (organizationId?: string | null) => {
      if (!organizationId) {
        return;
      }
      const organization = organizations.find((org) => org.id === organizationId);
      if (organization) {
        handleSelectOrganization(organization);
        resolved = true;
      }
    };

    const trySelectConversationByKeys = (keys?: Array<string | null | undefined>) => {
      if (!keys) {
        return;
      }
      for (const rawKey of keys) {
        const key = formatShareKey(rawKey);
        if (!key) {
          continue;
        }
        const entry = contactConversationLookup.get(key);
        if (entry) {
          handleSelectConversation(entry);
          resolved = true;
          return;
        }
      }
    };

    const trySelectConversationByMeeting = (meetingId?: string) => {
      if (!meetingId) {
        return;
      }
      const conversation = contactConversations.find(
        (entry) =>
          entry.incomingMeetings.some((meeting) => meeting.id === meetingId) ||
          entry.outgoingMeetings.some((meeting) => meeting.meeting_id === meetingId)
      );
      if (conversation) {
        handleSelectConversation(conversation);
        resolved = true;
      }
    };

    const trySelectConversationByName = (name?: string | null) => {
      if (!name) {
        return;
      }
      const normalizedTarget = normalizeName(name);
      if (!normalizedTarget) {
        return;
      }
      const conversation = contactConversations.find(
        (entry) => normalizeName(entry.displayName) === normalizedTarget
      );
      if (conversation) {
        handleSelectConversation(conversation);
        resolved = true;
      }
    };

    trySelectOrganization(navigationIntent.organizationId);

    if (!resolved) {
      trySelectConversationByKeys(navigationIntent.conversationKeys);
    }

    if (!resolved) {
      trySelectConversationByMeeting(navigationIntent.meetingId);
    }

    if (!resolved) {
      trySelectConversationByName(navigationIntent.contactName);
    }

    if (resolved) {
      onNavigationConsumed?.();
    }
  }, [
    navigationIntent,
    contactConversationLookup,
    contactConversations,
    organizations,
    handleSelectConversation,
    handleSelectOrganization,
    onNavigationConsumed,
  ]);

  const openMeetingSummary = (meeting: ViewableMeeting) => {
    if (!meeting.summary_text) {
      showErrorPopup?.('Résumé indisponible', "Le résumé n'est pas encore disponible pour cette réunion.");
      return;
    }
    setViewingMeeting(meeting);
  };

  const loadConversationHistory = useCallback(
    async (conversation: ContactConversationEntry) => {
      if (!conversation?.key || conversationHistories[conversation.key]) {
        return;
      }

      setLoadingConversationHistory(true);
      try {
        const history: ConversationMeetingEntry[] = [];
        const seenOutgoingIds = new Set<string>();

        conversation.incomingMeetings.forEach((meeting) => {
          history.push({
            id: `incoming-${meeting.id}-${meeting.shared_at ?? meeting.created_at ?? '0'}`,
            direction: 'incoming',
            sharedAt: meeting.shared_at ?? meeting.created_at ?? null,
            permissions: meeting.permissions,
            meeting: { ...meeting, kind: 'shared' as const },
          });
        });

        const conversationKeys = collectConversationKeys(conversation);
        const targetUserId = conversation.contact?.contact_user_id;

        conversation.outgoingMeetings.forEach((share) => {
          const linkedMeeting =
            ownMeetings.find((meeting) => meeting.id === share.meeting_id) ?? null;

          if (share.share_id) {
            seenOutgoingIds.add(share.share_id);
          }

          const meeting: ViewableMeeting = linkedMeeting
            ? { ...linkedMeeting, kind: 'outgoing' as const }
            : ({
                id: share.meeting_id,
                title: share.meeting_title ?? 'Réunion partagée',
                meeting_title: share.meeting_title ?? 'Réunion partagée',
                created_at: share.meeting_created_at ?? share.shared_at,
                meeting_created_at: share.meeting_created_at ?? share.shared_at,
                duration_seconds: share.meeting_duration_seconds ?? undefined,
                meeting_duration_seconds: share.meeting_duration_seconds ?? undefined,
                summary_status: share.meeting_summary_status ?? undefined,
                summary_text: null,
                kind: 'outgoing' as const,
              } as unknown as Meeting & { kind: 'outgoing' });

          history.push({
            id: `outgoing-${share.share_id}-${share.meeting_id}`,
            direction: 'outgoing',
            sharedAt: share.shared_at,
            permissions: share.permissions,
            meeting,
          });
        });

        if (targetUserId) {
          for (const meeting of ownMeetings) {
            if (!meeting.id) {
              continue;
            }

            let shares = meetingSharesCacheRef.current[meeting.id];
            if (!shares) {
              try {
                shares = await getMeetingShares(meeting.id);
                meetingSharesCacheRef.current[meeting.id] = shares;
              } catch (error: any) {
                logger.error('❌ [Organisations] Impossible de récupérer les partages de la réunion', error);
                meetingSharesCacheRef.current[meeting.id] = [];
                continue;
              }
            }

            shares
              .filter((share) => {
                const candidateIdentifiers = [
                  share.shared_with_user_id,
                  share.shared_with_share_id,
                  share.shared_with_email,
                  share.shared_with_identifier,
                  share.shared_with_name,
                ];
                const hasMatch = candidateIdentifiers.some((identifier) =>
                  conversationKeys.has(formatShareKey(identifier))
                );
                return hasMatch;
              })
              .forEach((share) => {
                if (share.id && seenOutgoingIds.has(share.id)) {
                  return;
                }
                if (share.id) {
                  seenOutgoingIds.add(share.id);
                }
                history.push({
                  id: `outgoing-${meeting.id}-${share.shared_with_user_id}-${share.shared_at ?? '0'}`,
                  direction: 'outgoing',
                  sharedAt: share.shared_at ?? null,
                  permissions: share.permissions ?? { can_view: true, can_export: true },
                  meeting: { ...meeting, kind: 'outgoing' as const },
                });
              });
          }
        }

        history.sort((a, b) => {
          const aTime = a.sharedAt ? new Date(a.sharedAt).getTime() : 0;
          const bTime = b.sharedAt ? new Date(b.sharedAt).getTime() : 0;
          return bTime - aTime;
        });

        setConversationHistories((prev) => ({
          ...prev,
          [conversation.key]: history,
        }));
        setEphemeralConversationEntries((prev) => {
          if (!prev[conversation.key]) {
            return prev;
          }
          const next = { ...prev };
          delete next[conversation.key];
          return next;
        });
      } finally {
        setLoadingConversationHistory(false);
      }
    },
    [conversationHistories, ownMeetings]
  );

  useEffect(() => {
    if (selectedEntity?.type === 'contact') {
      loadConversationHistory(selectedEntity.conversation);
    }
  }, [selectedEntity, loadConversationHistory]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<MeetingSharedEventDetail>).detail;
      if (!detail) {
        return;
      }

      setRefreshKey((prev) => prev + 1);

      const contactKeySet = new Set<string>();
      const includeTranscriptMap = new Map<string, boolean>();
      const organizationIdSet = new Set<string>();

      detail.recipients?.forEach((recipient) => {
        if (recipient.type === 'contact') {
          if (recipient.shareId) {
            const key = formatShareKey(recipient.shareId);
            if (key) {
              contactKeySet.add(key);
              if (recipient.includeTranscript) {
                includeTranscriptMap.set(key, true);
              }
            }
          }
          if (recipient.userId) {
            const key = formatShareKey(recipient.userId);
            if (key) {
              contactKeySet.add(key);
              if (recipient.includeTranscript) {
                includeTranscriptMap.set(key, true);
              }
            }
          }
        } else if (recipient.type === 'organization') {
          organizationIdSet.add(recipient.organizationId);
        }
      });

      organizationIdSet.forEach((organizationId) => {
        ensureOrganizationDetails(organizationId);
      });

      const canonicalContactKeys = new Set<string>();
      const canonicalIncludeTranscript = new Map<string, boolean>();

      contactKeySet.forEach((rawKey) => {
        const normalized = formatShareKey(rawKey);
        if (!normalized) {
          return;
        }
        const entry = contactConversationLookup.get(normalized);
        const canonicalKey = entry ? entry.key : normalized;
        canonicalContactKeys.add(canonicalKey);
        if (includeTranscriptMap.get(normalized)) {
          canonicalIncludeTranscript.set(canonicalKey, true);
        }
      });

      const contactKeys = Array.from(canonicalContactKeys).filter((key) => !!key);

      if (detail.direction !== 'incoming' && detail.meetingId) {
        const sharedMeeting = ownMeetings.find((meeting) => meeting.id === detail.meetingId);
        if (sharedMeeting) {
          const sharedTimestamp = detail.timestamp ?? new Date().toISOString();
          setEphemeralConversationEntries((previous) => {
            const next = { ...previous };
            contactKeys.forEach((key) => {
              if (!key) {
                return;
              }
              const includeTranscript = canonicalIncludeTranscript.get(key) ?? false;
              const existing = next[key] ?? [];
              const duplicate = existing.some(
                (entry) =>
                  entry.direction === 'outgoing' &&
                  getMeetingId(entry.meeting) === sharedMeeting.id &&
                  entry.sharedAt === sharedTimestamp
              );
              if (!duplicate) {
                const outgoingEntry: ConversationMeetingEntry = {
                  id: `outgoing-${sharedMeeting.id}-${sharedTimestamp}-${key}`,
                  direction: 'outgoing',
                  sharedAt: sharedTimestamp,
                  permissions: { can_view: true, can_export: true, include_transcript: includeTranscript },
                  meeting: { ...sharedMeeting, kind: 'outgoing' as const },
                };
                next[key] = [outgoingEntry, ...existing];
              }
            });
            return next;
          });
        }
      }

      if (contactKeys.length > 0) {
        setConversationHistories((prev) => {
          const next = { ...prev };
          contactKeys.forEach((key) => {
            if (key) {
              delete next[key];
            }
          });
          return next;
        });

        if (
          selectedEntity?.type === 'contact' &&
          contactKeys.includes(selectedEntity.conversation.key)
        ) {
          setTimeout(() => {
            loadConversationHistory(selectedEntity.conversation);
          }, 0);
        }
      }
    };

    window.addEventListener('meeting-shared', handler);
    return () => {
      window.removeEventListener('meeting-shared', handler);
    };
  }, [contactConversationLookup, ensureOrganizationDetails, loadConversationHistory, ownMeetings, selectedEntity]);

  const renderActivityList = () => (
    <Paper
      sx={{
        width: '100%',
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        p: { xs: 2, md: 3 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Partages récents
      </Typography>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          mt: 2,
          pr: 1,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(theme.palette.primary.main, 0.25),
            borderRadius: 999,
          },
        }}
      >
        {recentActivities.length === 0 ? (
          <Box
            sx={{
              border: `1px dashed ${alpha(theme.palette.primary.main, 0.2)}`,
              borderRadius: 2,
              p: 3,
              textAlign: 'center',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body2">
              Aucun partage récent. Partagez une réunion pour amorcer une conversation.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {recentActivities.map((activity) => {
              const isClickable = Boolean(activity.target);
              const accentColor =
                activity.type === 'incoming' ? theme.palette.primary.main : theme.palette.success.main;

              return (
                <Paper
                  key={activity.id}
                  onClick={isClickable ? () => handleActivityClick(activity) : undefined}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    border: `1px solid ${alpha(accentColor, isClickable ? 0.24 : 0.12)}`,
                    backgroundColor: alpha(accentColor, 0.05),
                    cursor: isClickable ? 'pointer' : 'default',
                    transition: isClickable ? 'transform 0.2s ease, box-shadow 0.2s ease' : undefined,
                    '&:hover': isClickable
                      ? {
                          transform: 'translateY(-2px)',
                          boxShadow: '0 12px 32px rgba(15, 23, 42, 0.15)',
                        }
                      : undefined,
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor: alpha(accentColor, 0.18),
                      color: accentColor,
                    }}
                  >
                    <ShareIcon fontSize="small" />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
                      {activity.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {activity.subtitle}
                    </Typography>
                    {activity.meta && (
                      <Typography variant="caption" color="text.secondary">
                        {activity.meta}
                      </Typography>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {formatRelativeTime(activity.timestamp)}
                  </Typography>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );

  const renderConversationList = () => (
    <Paper
      sx={{
        width: '100%',
        borderRadius: 3,
        border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
        boxShadow: '0 14px 32px rgba(15, 23, 42, 0.08)',
        p: { xs: 2, md: 3 },
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Conversations & groupes
      </Typography>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          mt: 2,
          pr: 1,
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(theme.palette.primary.main, 0.25),
            borderRadius: 999,
          },
        }}
      >
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Groupes
            </Typography>
            <List disablePadding dense>
              {organizationConversationItems.length === 0 && (
                <ListItemText
                  primary="Aucun groupe actif"
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                />
              )}
              {organizationConversationItems.map(({ key, organization, lastActivity }) => (
                <ListItemButton
                  key={key}
                  onClick={() => handleSelectOrganization(organization)}
                  sx={{
                    borderRadius: 2,
                    mb: 1,
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={getOrganizationLogoUrl(organization.logo_url)}
                      alt={organization.name}
                      sx={{
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                        color: theme.palette.primary.main,
                        borderRadius: 2,
                      }}
                    >
                      {organization.name.slice(0, 2).toUpperCase()}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={organization.name}
                    secondary={
                      organization.member_count
                        ? `${organization.member_count} membre${organization.member_count > 1 ? 's' : ''}`
                        : lastActivity
                          ? `Dernière activité ${formatRelativeTime(lastActivity)}`
                          : undefined
                    }
                    primaryTypographyProps={{ sx: { fontWeight: 600 } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              Conversations
            </Typography>
            <List disablePadding dense>
              {contactConversations.length === 0 && (
                <ListItemText
                  primary="Aucune conversation"
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                />
              )}
              {contactConversations.map((conversation) => (
                <ListItemButton
                  key={conversation.key}
                  onClick={() => handleSelectConversation(conversation)}
                  sx={{
                    borderRadius: 2,
                    mb: 1,
                    border: `1px solid ${alpha(theme.palette.secondary.main, 0.12)}`,
                  }}
                >
                  <ListItemAvatar>
                    <Avatar
                      src={conversation.avatarUrl ?? undefined}
                      alt={conversation.displayName}
                      sx={{
                        bgcolor: alpha(theme.palette.secondary.main, 0.1),
                        color: theme.palette.secondary.main,
                      }}
                    >
                      {conversation.fallbackInitials}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={conversation.displayName}
                    secondary={
                      conversation.lastActivity
                        ? `Dernier partage ${formatRelativeTime(conversation.lastActivity)}`
                        : conversation.incomingMeetings.length > 0
                          ? `${conversation.incomingMeetings.length} partage${conversation.incomingMeetings.length > 1 ? 's' : ''} reçu${conversation.incomingMeetings.length > 1 ? 's' : ''}`
                          : 'Aucune activité enregistrée'
                    }
                    primaryTypographyProps={{ sx: { fontWeight: 600 } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );

  const renderOrganizationDetail = (organization: Organization) => {
    const members = organizationMembers[organization.id] ?? [];
    const meetings = organizationMeetings[organization.id] ?? [];

    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Stack spacing={{ xs: 2, md: 3 }} sx={{ flexShrink: 0 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 2, md: 3 }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  src={getOrganizationLogoUrl(organization.logo_url)}
                  alt={organization.name}
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette.primary.main, 0.12),
                    color: theme.palette.primary.main,
                    fontSize: '1.5rem',
                    fontWeight: 700,
                  }}
                >
                  {organization.name.slice(0, 2).toUpperCase()}
                </Avatar>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {organization.name}
                  </Typography>
                  {organization.description && (
                    <Typography variant="body2" color="text.secondary">
                      {organization.description}
                    </Typography>
                  )}
                </Box>
              </Stack>
              {organization.role && (
                <Chip
                  label={
                    organization.role === 'owner'
                      ? 'Vous êtes administrateur'
                      : `Rôle : ${organization.role}`
                  }
                  size="small"
                />
              )}
            </Stack>
            <Button
              variant="text"
              startIcon={<ArrowBackIcon />}
              onClick={handleBackToHub}
              sx={{ borderRadius: 2 }}
            >
              Retour aux organisations
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', mt: { xs: 2, md: 3 }, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 3, lg: 4 }} alignItems={{ lg: 'flex-start' }} sx={{ height: '100%', overflow: 'hidden' }}>
            <Box sx={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Paper
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  p: { xs: 2, md: 3 },
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ flexShrink: 0, mb: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Réunions partagées
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Historique des réunions accessibles aux membres.
                      </Typography>
                    </Box>
                    {loadingDetails && <CircularProgress size={20} thickness={4} />}
                  </Stack>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                  {meetings.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Aucune réunion partagée dans ce groupe pour le moment.
                    </Typography>
                  ) : (
                    <Grid container spacing={2}>
                      {meetings.map((meeting) => {
                      const includeTranscript = meeting.permissions?.include_transcript ?? false;
                      const allowExport = meeting.permissions?.can_export ?? true;
                      const meetingTitle = meeting.meeting_title || 'Réunion sans titre';
                      const meetingId = meeting.meeting_id;

                        return (
                          <Grid item xs={12} key={meeting.id}>
                            <Paper
                              sx={{
                                p: { xs: 2, sm: 3 },
                                borderRadius: { xs: '12px', sm: '16px' },
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                transition: 'all 0.3s ease-in-out',
                                position: 'relative',
                                overflow: 'visible',
                                bgcolor: 'white',
                                cursor: meeting.summary_status === 'completed' && meeting.summary_text ? 'pointer' : 'default',
                              }}
                              onClick={() => {
                                if (meeting.summary_status === 'completed' && meeting.summary_text) {
                                  openMeetingSummary({
                                    ...meeting,
                                    kind: 'organization',
                                  });
                                }
                              }}
                            >
                              <Box sx={{ 
                                display: 'flex', 
                                flexDirection: { xs: 'column', lg: 'row' },
                                gap: { xs: 2, lg: 2 },
                                justifyContent: 'space-between', 
                                alignItems: 'center'
                              }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ mb: 1.5 }}
                                    flexWrap="wrap"
                                    useFlexGap
                                  >
                                    <Chip
                                      icon={<PeopleIcon fontSize="small" />}
                                      label={meeting.shared_by_name ? `Partagée par ${meeting.shared_by_name}` : 'Partage actif'}
                                      size="small"
                                      sx={{
                                        borderRadius: 2,
                                        bgcolor: alpha(theme.palette.primary.main, 0.12),
                                        color: theme.palette.primary.main,
                                        fontWeight: 600,
                                      }}
                                    />
                                    <Chip
                                      icon={<CalendarTodayIcon fontSize="small" />}
                                      label={formatDate(meeting.shared_at)}
                                      size="small"
                                      variant="outlined"
                                      sx={{ borderRadius: 2 }}
                                    />
                                  </Stack>

                                  <Typography 
                                    variant="h6" 
                                    sx={{ 
                                      mb: { xs: 1, sm: 1.25 }, 
                                      fontWeight: 600,
                                      fontSize: { xs: '1.05rem', sm: '1.2rem' },
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {meeting.meeting_title || 'Réunion sans titre'}
                                  </Typography>

                                  <Stack
                                    direction={{ xs: 'column', md: 'row' }}
                                    spacing={{ xs: 0.75, md: 2 }}
                                    alignItems={{ xs: 'flex-start', md: 'center' }}
                                    sx={{
                                      color: 'text.secondary',
                                      fontSize: { xs: '0.85rem', sm: '0.9rem' },
                                    }}
                                  >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                      <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                          <path d="M8 5v14l11-7z" />
                                        </svg>
                                      </Box>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        {formatDate(meeting.shared_at)}
                                      </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                      <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                          <path d="M12 7v10M7 12h10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                      </Box>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        {formatDuration(meeting.meeting_duration_seconds)}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </Box>

                                <Box sx={{ 
                                  display: 'flex',
                                  flexDirection: 'row',
                                  gap: 1.5,
                                  alignItems: 'center',
                                  minWidth: { lg: 'auto' },
                                }}>
                                  <Stack 
                                    direction="row"
                                    spacing={1}
                                    sx={{ 
                                      flex: 1,
                                      justifyContent: 'flex-start',
                                      alignItems: 'center',
                                    }}
                                  >
                                    {includeTranscript && meetingId && (
                                      <Button
                                        variant="outlined"
                                        color="primary"
                                        startIcon={<DescriptionIcon />}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenTranscript(meetingId, meetingTitle);
                                        }}
                                        size="small"
                                        sx={{ 
                                          width: { xs: 125, sm: 140 },
                                          minWidth: { xs: 125, sm: 140 },
                                          fontSize: { xs: '0.85rem', sm: '0.875rem' },
                                        }}
                                      >
                                        Transcription
                                      </Button>
                                    )}

                                    <Tooltip
                                      title={
                                        meeting.summary_status === 'completed' && meeting.summary_text
                                          ? 'Voir le compte rendu'
                                          : "Le compte rendu n'est pas encore disponible"
                                      }
                                    >
                                      <span>
                                        <Button
                                          variant="contained"
                                          color="primary"
                                          size="small"
                                          disabled={meeting.summary_status !== 'completed' || !meeting.summary_text}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (meeting.summary_status === 'completed' && meeting.summary_text) {
                                              openMeetingSummary({
                                                ...meeting,
                                                kind: 'organization',
                                              });
                                            }
                                          }}
                                          sx={{
                                            width: { xs: 140, sm: 160 },
                                            minWidth: { xs: 140, sm: 160 },
                                            fontSize: { xs: '0.85rem', sm: '0.875rem' },
                                          }}
                                        >
                                          Voir le résumé
                                        </Button>
                                      </span>
                                    </Tooltip>
                                    {allowExport && (
                                      <SummaryExportButton
                                        summaryText={meeting.summary_text ?? ''}
                                        meetingId={meeting.meeting_id}
                                        meetingName={meeting.meeting_title || 'Réunion'}
                                        meetingDate={formatDate(meeting.meeting_created_at)}
                                        logoUrl={getOrganizationLogoUrl(organization.logo_url)}
                                        onError={(message) => showErrorPopup?.('Erreur', message)}
                                        onSuccess={() => {}}
                                      />
                                    )}
                                  </Stack>
                                </Box>
                              </Box>
                            </Paper>
                          </Grid>
                        );
                      })}
                    </Grid>
                  )}
                </Box>
              </Paper>
            </Box>

            <Stack spacing={{ xs: 3, md: 3.5 }} sx={{ width: { lg: 360 }, flexShrink: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Paper
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  p: { xs: 2, md: 3 },
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <Box sx={{ flexShrink: 0, mb: 2.5 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      Membres
                    </Typography>
                    <Chip label={members.length} size="small" color="primary" />
                  </Stack>
                </Box>

                <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
                  {members.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Aucun membre identifié dans cette organisation.
                    </Typography>
                  ) : (
                    <Stack spacing={1.5}>
                      {members.map((member) => (
                        <Stack
                          key={member.id}
                          direction="row"
                          spacing={1.5}
                          alignItems="center"
                          sx={{
                            borderRadius: 2,
                            p: 1.25,
                            border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                          }}
                        >
                          <Avatar
                            src={member.user_profile_picture_url ?? undefined}
                            alt={member.user_full_name ?? member.user_email}
                          >
                            {(member.user_full_name ?? member.user_email ?? '?').slice(0, 2).toUpperCase()}
                          </Avatar>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                              {member.user_full_name ?? 'Utilisateur'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" noWrap>
                              {member.user_email}
                            </Typography>
                          </Box>
                          <Chip label={member.role ?? 'membre'} size="small" variant="outlined" />
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>
              </Paper>

              <Paper
                sx={{
                  borderRadius: 3,
                  border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  p: { xs: 2, md: 3 },
                  flexShrink: 0,
                }}
              >
                <Stack spacing={2}>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Discussion d'équipe
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Lancez une conversation dédiée à ce groupe pour coordonner vos partages. Intégrations Slack/Teams
                    disponibles sur demande.
                  </Typography>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<ForumIcon />}
                    href="mailto:contact@gilbert.lexiapro.fr?subject=Intégration%20messagerie"
                    sx={{ borderRadius: 2 }}
                  >
                    Discuter avec nous
                  </Button>
                </Stack>
              </Paper>
            </Stack>
          </Stack>
        </Box>
      </Box>
    );
  };

  const renderContactDetail = (conversation: ContactConversationEntry) => {
    const baseHistory = conversationHistories[conversation.key] ?? [];
    const ephemeralHistory = ephemeralConversationEntries[conversation.key] ?? [];
    const history = [...ephemeralHistory, ...baseHistory];
    const incomingCount =
      history.filter((item) => item.direction === 'incoming').length ||
      conversation.incomingMeetings.length;
    const outgoingCount = history.filter((item) => item.direction === 'outgoing').length;
    const hasHistory = incomingCount + outgoingCount > 0;

    return (
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Stack spacing={{ xs: 2, md: 3 }} sx={{ flexShrink: 0 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={{ xs: 2, md: 3 }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Stack spacing={1}>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  src={conversation.avatarUrl ?? undefined}
                  alt={conversation.displayName}
                  sx={{
                    width: 60,
                    height: 60,
                    bgcolor: alpha(theme.palette.secondary.main, 0.12),
                    color: theme.palette.secondary.main,
                    fontSize: '1.5rem',
                    fontWeight: 700,
                  }}
                >
                  {conversation.fallbackInitials}
                </Avatar>
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 800 }}>
                    {conversation.displayName}
                  </Typography>
                  {conversation.shareId && (
                    <Typography variant="body2" color="text.secondary">
                      Partage via ID <strong>{conversation.shareId}</strong>
                    </Typography>
                  )}
                  {conversation.lastActivity && (
                    <Typography variant="body2" color="text.secondary">
                      Dernière activité {formatRelativeTime(conversation.lastActivity)}
                    </Typography>
                  )}
                </Box>
              </Stack>
            </Stack>
            <Button variant="text" startIcon={<ArrowBackIcon />} onClick={handleBackToHub} sx={{ borderRadius: 2 }}>
              Retour aux conversations
            </Button>
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', mt: { xs: 2, md: 3 }, overflow: 'hidden' }}>
          <Paper
            sx={{
              borderRadius: 3,
              border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
              p: { xs: 2, md: 3 },
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box sx={{ flexShrink: 0, mb: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                Historique des partages
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Consultez l'ensemble des réunions échangées avec {conversation.displayName}.
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
              {loadingConversationHistory && !history.length ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : !hasHistory ? (
                <Typography variant="body2" color="text.secondary">
                  Aucun échange enregistré pour le moment.
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {history.map((entry) => {
                    const meeting = entry.meeting;
                    const meetingTitle = getMeetingTitle(meeting);
                    const meetingId = getMeetingId(meeting);
                    const meetingDuration = formatDuration(getMeetingDurationSeconds(meeting));
                    const meetingCreatedAt = getMeetingCreatedAt(meeting);
                    const sharedAtLabel = entry.sharedAt
                      ? formatDate(entry.sharedAt)
                      : meetingCreatedAt
                        ? formatDate(meetingCreatedAt)
                        : 'Date inconnue';
                    const summaryStatus = getSummaryStatus(meeting)?.toLowerCase();
                    const summaryText = 'summary_text' in meeting ? meeting.summary_text ?? null : null;
                    const hasSummary = summaryStatus === 'completed' && !!summaryText;
                    const canExport = entry.permissions?.can_export ?? false;
                    const includeTranscript = entry.permissions?.include_transcript ?? false;
                    const allowExport = entry.direction === 'outgoing' || canExport;

                    return (
                      <Grid item xs={12} key={entry.id}>
                        <Paper
                          sx={{
                            p: { xs: 2, sm: 3 },
                            borderRadius: { xs: '12px', sm: '16px' },
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                            transition: 'all 0.3s ease-in-out',
                            position: 'relative',
                            overflow: 'visible',
                            border: 'none',
                            bgcolor: 'white',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            if (hasSummary) {
                              openMeetingSummary(meeting);
                            }
                          }}
                        >
                          <Box sx={{ 
                            display: 'flex', 
                            flexDirection: { xs: 'column', lg: 'row' },
                            gap: { xs: 2, lg: 2 },
                            justifyContent: 'space-between', 
                            alignItems: 'center'
                          }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ mb: 1.5 }}
                                flexWrap="wrap"
                                useFlexGap
                              >
                                <Chip
                                  icon={
                                    entry.direction === 'incoming' ? (
                                      <CallReceivedIcon fontSize="small" />
                                    ) : (
                                      <CallMadeIcon fontSize="small" />
                                    )
                                  }
                                  label={entry.direction === 'incoming' ? 'Reçu' : 'Envoyé'}
                                  size="small"
                                  sx={{
                                    borderRadius: 2,
                                    bgcolor: alpha(
                                      entry.direction === 'incoming'
                                        ? theme.palette.primary.main
                                        : theme.palette.success.main,
                                      0.1
                                    ),
                                    color:
                                      entry.direction === 'incoming'
                                        ? theme.palette.primary.main
                                        : theme.palette.success.main,
                                    fontWeight: 600,
                                  }}
                                />
                                <Chip
                                  icon={<CalendarTodayIcon fontSize="small" />}
                                  label={sharedAtLabel}
                                  size="small"
                                  variant="outlined"
                                  sx={{ borderRadius: 2 }}
                                />
                                {meetingDuration && (
                                  <Chip
                                    icon={<AccessTimeIcon fontSize="small" />}
                                    label={meetingDuration}
                                    size="small"
                                    variant="outlined"
                                    sx={{ borderRadius: 2 }}
                                  />
                                )}
                              </Stack>

                              <Typography 
                                variant="h6" 
                                sx={{ 
                                  mb: { xs: 1, sm: 1.25 }, 
                                  fontWeight: 600,
                                  fontSize: { xs: '1.05rem', sm: '1.2rem' },
                                  lineHeight: 1.1,
                                }}
                              >
                                {meetingTitle}
                              </Typography>

                              <Stack
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={{ xs: 0.75, md: 2 }}
                                alignItems={{ xs: 'flex-start', md: 'center' }}
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: { xs: '0.85rem', sm: '0.9rem' },
                                }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                      <path d="M8 5v14l11-7z" />
                                    </svg>
                                  </Box>
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {sharedAtLabel}
                                  </Typography>
                                </Box>
                                {meetingDuration && (
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
                                        <path d="M12 7v10M7 12h10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                      {meetingDuration}
                                    </Typography>
                                  </Box>
                                )}
                              </Stack>
                            </Box>

                            <Box sx={{ 
                              display: 'flex',
                              flexDirection: 'row',
                              gap: 1.5,
                              alignItems: 'center',
                              minWidth: { lg: 'auto' },
                            }}>
                              <Stack 
                                direction="row"
                                spacing={1}
                                sx={{ 
                                  flex: 1,
                                  justifyContent: 'flex-start',
                                  alignItems: 'center',
                                }}
                              >
                                {includeTranscript && meetingId && (
                                  <Button
                                    variant="outlined"
                                    color="primary"
                                    startIcon={<DescriptionIcon />}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenTranscript(meetingId, meetingTitle);
                                    }}
                                    size="small"
                                    sx={{ 
                                      width: { xs: 125, sm: 140 },
                                      minWidth: { xs: 125, sm: 140 },
                                      fontSize: { xs: '0.85rem', sm: '0.875rem' },
                                    }}
                                  >
                                    Transcription
                                  </Button>
                                )}

                                <Tooltip
                                  title={
                                    hasSummary ? 'Voir le compte rendu' : "Le résumé n'est pas encore disponible"
                                  }
                                >
                                  <span>
                                    <Button
                                      variant="contained"
                                      color="primary"
                                      size="small"
                                      disabled={!hasSummary}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (hasSummary) {
                                          openMeetingSummary(meeting);
                                        }
                                      }}
                                      sx={{
                                        width: { xs: 140, sm: 160 },
                                        minWidth: { xs: 140, sm: 160 },
                                        fontSize: { xs: '0.85rem', sm: '0.875rem' },
                                      }}
                                    >
                                      Voir le résumé
                                    </Button>
                                  </span>
                                </Tooltip>
                                {hasSummary && allowExport && summaryText && (
                                  <SummaryExportButton
                                    summaryText={summaryText}
                                    meetingId={getMeetingId(meeting)}
                                    meetingName={meetingTitle}
                                    meetingDate={sharedAtLabel}
                                    onError={(message) => showErrorPopup?.('Erreur', message)}
                                    onSuccess={() => {}}
                                  />
                                )}
                              </Stack>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          </Paper>
        </Box>
      </Box>
    );
  };

  const renderHub = () => (
    <Stack spacing={{ xs: 3, md: 4 }} sx={{ flex: 1, minHeight: 0 }}>
      <Box sx={{ mb: { xs: 2, sm: 3, md: 4 } }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            gap: { xs: 1, sm: 0 },
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 800,
                mb: 1,
                letterSpacing: '-0.5px',
                background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
              }}
            >
              Mes partages
            </Typography>
            <Typography
              variant="body1"
              color="text.secondary"
              sx={{ fontSize: { xs: '0.9rem', sm: '1rem' } }}
            >
              Retrouvez vos dernières activités de partage et accédez aux groupes ou conversations créés avec vos collaborateurs.
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && (
        <Paper
          sx={{
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
            backgroundColor: alpha(theme.palette.error.main, 0.06),
            p: { xs: 2, md: 3 },
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <ErrorOutlineIcon color="error" />
          <Typography color="error" variant="body2">
            {error}
          </Typography>
        </Paper>
      )}

      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={{ xs: 2, md: 3 }}
        sx={{
          alignItems: 'stretch',
          minHeight: { lg: DESKTOP_SCROLL_AREA_HEIGHT },
          maxHeight: { lg: DESKTOP_SCROLL_AREA_HEIGHT },
          flex: 1,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            width: '100%',
            flex: { xs: '1 1 100%', lg: '1 1 0' },
            display: 'flex',
            height: { xs: 'auto', lg: '100%' },
          }}
        >
          {renderActivityList()}
        </Box>
        <Box
          sx={{
            width: '100%',
            flex: { xs: '1 1 100%', lg: '1 1 0' },
            display: 'flex',
            height: { xs: 'auto', lg: '100%' },
          }}
        >
          {renderConversationList()}
        </Box>
      </Stack>
    </Stack>
  );

  return (
    <Box
      sx={{
        px: { xs: 2, sm: 3, md: 3 },
        py: { xs: 6, sm: 4, md: 5 },
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // Toujours hidden pour éviter le double scroll
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={40} />
          </Box>
        ) : selectedEntity ? (
          selectedEntity.type === 'organization'
            ? renderOrganizationDetail(selectedEntity.organization)
            : renderContactDetail(selectedEntity.conversation)
        ) : (
          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderHub()}
          </Box>
        )}
      </Box>

      <Dialog open={!!viewingMeeting} onClose={() => setViewingMeeting(null)} maxWidth="md" fullWidth>
        <DialogTitle>Compte rendu</DialogTitle>
        <DialogContent dividers sx={{ minHeight: 280 }}>
          {viewingMeeting ? (
            <MeetingSummaryRenderer summaryText={viewingMeeting.summary_text ?? null} />
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewingMeeting(null)}>Fermer</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={transcriptDialogOpen} onClose={handleCloseTranscriptDialog} maxWidth="md" fullWidth>
        <DialogTitle>{transcriptTitle}</DialogTitle>
        <DialogContent dividers sx={{ minHeight: 280 }}>
          {transcriptLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : transcriptEntries && transcriptEntries.length > 0 ? (
            <Box sx={{ maxHeight: 520, overflowY: 'auto', pr: 1 }}>
              {(() => {
                const speakers = Array.from(
                  new Set(transcriptEntries.map((entry) => entry.speaker || 'Intervenant'))
                );
                return transcriptEntries.map((entry, index) => {
                  const speakerName = entry.speaker || 'Intervenant';
                  const speakerIndex = speakers.indexOf(speakerName);
                  const palette = transcriptSpeakerColors[speakerIndex % transcriptSpeakerColors.length];
                  return (
                    <Stack
                      key={`${speakerName}-${index}-${entry.timestamp ?? ''}`}
                      direction="row"
                      spacing={1.5}
                      sx={{ mb: 2 }}
                    >
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          bgcolor: palette.bg,
                          color: palette.color,
                          border: `2px solid ${palette.color}20`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          mt: 0.5,
                          flexShrink: 0,
                        }}
                      >
                        <PersonIcon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600, color: palette.color, mr: 1 }}>
                            {speakerName}
                          </Typography>
                          {entry.timestamp && (
                            <Typography variant="caption" color="text.secondary">
                              {entry.timestamp}
                            </Typography>
                          )}
                        </Box>
                        <Typography
                          variant="body1"
                          sx={{
                            pl: 2,
                            borderLeft: `3px solid ${palette.color}40`,
                            lineHeight: 1.6,
                            bgcolor: `${palette.color}08`,
                            py: 1,
                            borderRadius: 1,
                          }}
                        >
                          {entry.text}
                        </Typography>
                      </Box>
                    </Stack>
                  );
                });
              })()}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Transcription indisponible.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTranscriptDialog}>Fermer</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrganizationsView;
