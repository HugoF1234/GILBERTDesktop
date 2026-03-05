/**
 * SharesView - Page des partages avec design moderne
 * Style cohérent avec le reste de l'application
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  MessageSquare,
  ArrowLeft,
  FileText,
  Edit3,
  X,
  ChevronRight,
  ChevronLeft,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  Mail,
  UserCircle,
  Info,
  Plus,
} from 'lucide-react';
import { User } from '../services/authService';
import {
  getOutgoingShareHistory,
  updateMeetingShare,
  shareMeeting,
  Contact,
  OutgoingShareHistoryEntry,
  ShareRole,
} from '../services/shareService';
import { getMeetingDetails, getTranscript, Meeting as ApiMeeting, updateMeetingTitle } from '../services/meetingService';
import { formatImageUrl } from '../services/profileService';
import {
  getMyOrganizations,
  getOrganizationMembers,
  getOrganizationMeetings,
  getOrganizationLogoUrl,
  shareMeetingWithOrganization,
  type Organization,
  type OrganizationMember,
  type OrganizationMeeting,
} from '../services/organizationService';
import { getAllMeetings } from '../services/meetingService';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { cn } from '@/lib/utils';

// Étendre le type Meeting pour inclure les propriétés de partage
interface Meeting extends ApiMeeting {
  is_shared?: boolean;
  shared_by?: string;
  shared_at?: string;
  permissions?: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
    role?: 'reader' | 'editor';
    can_edit?: boolean;
    can_share?: boolean;
    can_regenerate?: boolean;
  };
  shared_by_email?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
}
import { useNotification } from '../contexts/NotificationContext';
import MeetingDetailOverlay from './MeetingDetailOverlay';
import type { Template } from '../services/templateService';
import { hasCustomName, updateSpeakerName, getDisplayName, formatSpeakerNameFrench } from '../services/speakerService';
import { updateMeetingTranscriptText } from '../services/meetingService';
import { useRouteContext } from '../hooks/useRouteContext';
import { useDataStore } from '../stores/dataStore';
import { logger } from '@/utils/logger';

interface SharesViewProps {
  user?: User | null;
  isMobile?: boolean;
}

interface ConversationMessage {
  id: string;
  meeting: Meeting;
  direction: 'outgoing' | 'incoming';
  sharedAt: string;
  sharedWith?: {
    id: string;
    name: string;
    email?: string;
    profilePicture?: string;
  };
  sharedBy?: {
    id: string;
    name: string;
    email?: string;
    profilePicture?: string;
  };
}

interface Conversation {
  contact: Contact | OutgoingShareHistoryEntry;
  messages: ConversationMessage[];
  lastMessageAt: string;
  unreadCount?: number;
  type?: 'contact';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(months / 12);
  return `il y a ${years} an${years > 1 ? 's' : ''}`;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  return `${mins} min`;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const SharesView: React.FC<SharesViewProps> = (props) => {
  const routeContext = useRouteContext();
  const user = props.user ?? routeContext.currentUser;
  const isMobile = props.isMobile ?? routeContext.isMobile;
  const { showErrorPopup } = useNotification();

  // ===== DATA STORE - Données globales avec cache SWR =====
  const storeContacts = useDataStore((state) => state.contacts);
  const storeSharedMeetings = useDataStore((state) => state.sharedMeetings);
  const storeTemplates = useDataStore((state) => state.templates);
  const fetchContacts = useDataStore((state) => state.fetchContacts);
  const fetchSharedMeetings = useDataStore((state) => state.fetchSharedMeetings);
  const fetchTemplates = useDataStore((state) => state.fetchTemplates);

  // États locaux (outgoingHistory n'est pas dans le store)
  const [outgoingHistory, setOutgoingHistory] = useState<OutgoingShareHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const MESSAGES_PER_PAGE = 30;
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [overlayMeeting, setOverlayMeeting] = useState<Meeting | null>(null);
  const [meetingDetailOverlayOpen, setMeetingDetailOverlayOpen] = useState(false);
  const [profileOverlayOpen, setProfileOverlayOpen] = useState(false);
  const [profileOverlayData, setProfileOverlayData] = useState<
    | { type: 'user'; name: string; email?: string; avatar?: string; since?: string }
    | null
  >(null);

  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const [editPermissionsOpen, setEditPermissionsOpen] = useState(false);
  const [editPermissionsMessage, setEditPermissionsMessage] = useState<ConversationMessage | null>(null);
  const [editRole, setEditRole] = useState<ShareRole>('reader');
  const [editIncludeTranscript, setEditIncludeTranscript] = useState(false);
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);

  // Organisations de l'utilisateur (conversation de groupe = clic sur l'org)
  const [myOrganizations, setMyOrganizations] = useState<Organization[]>([]);
  const [orgMembersCache, setOrgMembersCache] = useState<Record<string, OrganizationMember[]>>({});
  const [orgInfoOrgId, setOrgInfoOrgId] = useState<string | null>(null);
  const [loadingOrgMembers, setLoadingOrgMembers] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<Organization | null>(null);
  const [orgMeetingsCache, setOrgMeetingsCache] = useState<Record<string, OrganizationMeeting[]>>({});
  const [loadingOrgMeetings, setLoadingOrgMeetings] = useState(false);
  // Shortcut partage "+" : commun aux conversations contact et organisation
  const [shareShortcutOpen, setShareShortcutOpen] = useState(false);
  const [shareShortcutStep, setShareShortcutStep] = useState<1 | 2>(1);
  const [meetingsWithSummary, setMeetingsWithSummary] = useState<Meeting[]>([]);
  const [selectedMeetingForShare, setSelectedMeetingForShare] = useState<Meeting | null>(null);
  const [shareShortcutRole, setShareShortcutRole] = useState<ShareRole>('reader');
  const [shareShortcutIncludeTranscript, setShareShortcutIncludeTranscript] = useState(false);
  const [loadingShareMeetings, setLoadingShareMeetings] = useState(false);
  const [sharingInProgress, setSharingInProgress] = useState(false);

  const [formattedTranscript, setFormattedTranscript] = useState<Array<{speakerId: string; speaker: string; text: string; timestamp?: string}> | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscriptText, setEditedTranscriptText] = useState('');
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryText, setEditedSummaryText] = useState('');
  const [isSavingSummary] = useState(false);
  const [isGeneratingSummary] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  const meetingsCacheRef = useRef<Map<string, Meeting>>(new Map());
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages are loaded or conversation changes
  useEffect(() => {
    if (messagesContainerRef.current && conversationMessages.length > 0 && !loadingMessages) {
      // Petit délai pour laisser le DOM se mettre à jour
      const timeoutId = setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [conversationMessages, loadingMessages, selectedConversation]);

  // Load templates depuis le store
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Ref pour tracker si on a déjà chargé les données
  const hasLoadedRef = useRef(false);

  // Load initial data
  useEffect(() => {
    // Ne charger qu'une seule fois
    if (hasLoadedRef.current) {
      return;
    }

    const loadData = async () => {
      try {
        setLoading(true);
        hasLoadedRef.current = true;

        // Charger en parallèle avec gestion d'erreur individuelle
        // Promise.allSettled permet de ne pas bloquer si une promesse échoue
        const results = await Promise.allSettled([
          fetchContacts(),       // Utilise le cache SWR du store
          fetchSharedMeetings(), // Utilise le cache SWR du store
          getOutgoingShareHistory(), // API directe (pas dans le store)
        ]);

        // Extraire les résultats - les erreurs sont gérées silencieusement
        const historyResult = results[2];
        if (historyResult.status === 'fulfilled') {
          setOutgoingHistory(historyResult.value);
        } else {
          logger.warn('Impossible de charger l\'historique des partages:', historyResult.reason);
          setOutgoingHistory([]);
        }

        // Vérifier si toutes les promesses ont échoué (erreur critique)
        const allFailed = results.every(r => r.status === 'rejected');
        if (allFailed) {
          const firstError = (results[0] as PromiseRejectedResult).reason;
          // Ne pas afficher d'erreur si c'est juste une erreur d'authentification
          if (firstError?.detail !== 'Not authenticated' && firstError?.message !== 'Not authenticated') {
            showErrorPopup('Erreur', 'Impossible de charger les partages');
          }
        }
      } catch (error: any) {
        logger.error('Erreur lors du chargement des partages:', error);
        if (error?.detail !== 'Not authenticated' && error?.message !== 'Not authenticated') {
          showErrorPopup('Erreur', 'Impossible de charger les partages');
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [showErrorPopup, fetchContacts, fetchSharedMeetings]);

  // Charger les organisations de l'utilisateur pour le bloc "Groupe d'organisation"
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyOrganizations()
      .then((orgs) => {
        if (!cancelled) setMyOrganizations(orgs || []);
      })
      .catch((err) => {
        if (!cancelled) logger.debug('SharesView: getMyOrganizations failed', err);
      });
    return () => { cancelled = true; };
  }, [user]);

  // Charger les membres d'une org quand on ouvre le popover info
  useEffect(() => {
    if (!orgInfoOrgId) return;
    let cancelled = false;
    setLoadingOrgMembers(true);
    getOrganizationMembers(orgInfoOrgId)
      .then((members) => {
        if (!cancelled) setOrgMembersCache((prev) => ({ ...prev, [orgInfoOrgId]: members || [] }));
      })
      .catch((err) => {
        if (!cancelled) logger.debug('SharesView: getOrganizationMembers failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgMembers(false);
      });
    return () => { cancelled = true; };
  }, [orgInfoOrgId]);

  // Charger les réunions partagées avec l'organisation quand on ouvre la conversation de groupe
  useEffect(() => {
    if (!selectedOrganization) return;
    const orgId = selectedOrganization.id;
    let cancelled = false;
    setLoadingOrgMeetings(true);
    getOrganizationMeetings(orgId)
      .then((meetings) => {
        if (!cancelled) setOrgMeetingsCache((prev) => ({ ...prev, [orgId]: meetings || [] }));
      })
      .catch((err) => {
        if (!cancelled) logger.debug('SharesView: getOrganizationMeetings failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrgMeetings(false);
      });
    return () => { cancelled = true; };
  }, [selectedOrganization?.id]);

  // Ouvrir le shortcut partage "+" : charge les réunions avec synthèse
  const openShareShortcut = useCallback(async () => {
    if (!selectedOrganization && !selectedConversation) return;
    setShareShortcutOpen(true);
    setShareShortcutStep(1);
    setSelectedMeetingForShare(null);
    setShareShortcutRole('reader');
    setShareShortcutIncludeTranscript(false);
    setLoadingShareMeetings(true);
    try {
      const list = await getAllMeetings();
      const withSummary = (list || []).filter((m: Meeting) => m.summary_status === 'completed');
      setMeetingsWithSummary(withSummary);
    } catch (e) {
      logger.error('SharesView: getAllMeetings failed', e);
      showErrorPopup('Erreur', 'Impossible de charger vos réunions');
    } finally {
      setLoadingShareMeetings(false);
    }
  }, [selectedOrganization, selectedConversation, showErrorPopup]);

  // Soumettre le partage (étape 2) : org ou contact
  const submitShareShortcut = useCallback(async () => {
    if (!selectedMeetingForShare) return;
    const meetingId = selectedMeetingForShare.id;
    setSharingInProgress(true);
    try {
      if (selectedOrganization) {
        await shareMeetingWithOrganization(meetingId, selectedOrganization.id, {
          can_view: true,
          can_export: shareShortcutRole === 'editor',
          include_transcript: shareShortcutIncludeTranscript,
        });
        const updated = await getOrganizationMeetings(selectedOrganization.id);
        setOrgMeetingsCache((prev) => ({ ...prev, [selectedOrganization.id]: updated || [] }));
      } else if (selectedConversation) {
        const contact = selectedConversation.contact as Contact;
        const shareId = contact.contact_share_id;
        if (!shareId) {
          showErrorPopup('Erreur', 'Ce contact ne peut pas recevoir de partage');
          return;
        }
        await shareMeeting(meetingId, shareId, shareShortcutRole, shareShortcutIncludeTranscript);
        const history = await getOutgoingShareHistory();
        setOutgoingHistory(history);
      }
      setShareShortcutOpen(false);
      setShareShortcutStep(1);
      setSelectedMeetingForShare(null);
    } catch (err) {
      logger.error('SharesView: share failed', err);
      showErrorPopup('Erreur', selectedOrganization ? 'Impossible de partager avec l\'organisation' : 'Impossible de partager avec ce contact');
    } finally {
      setSharingInProgress(false);
    }
  }, [selectedMeetingForShare, selectedOrganization, selectedConversation, shareShortcutRole, shareShortcutIncludeTranscript, showErrorPopup]);

  // Build conversations from all shares
  const conversations = useMemo(() => {
    const convMap = new Map<string, Conversation>();

    storeContacts.forEach((contact) => {
      const lastInteraction = contact.last_interaction_at || contact.last_shared_at || contact.last_received_at || contact.created_at;
      convMap.set(contact.contact_user_id, {
        contact,
        messages: [],
        lastMessageAt: lastInteraction || new Date().toISOString(),
      });
    });

    outgoingHistory.forEach((entry) => {
      const existingConv = convMap.get(entry.contact_user_id);
      if (existingConv) {
        const entryDate = entry.last_shared_at || new Date().toISOString();
        if (new Date(entryDate) > new Date(existingConv.lastMessageAt)) {
          existingConv.lastMessageAt = entryDate;
        }
      } else {
        convMap.set(entry.contact_user_id, {
          contact: entry,
          messages: [],
          lastMessageAt: entry.last_shared_at || new Date().toISOString(),
        });
      }
    });

    const incomingOwnersMap = new Map<string, { name: string; email?: string; lastSharedAt: string; userId?: string }>();
    // Cast car les shared meetings ont des propriétés additionnelles (shared_by, owner_name, etc.)
    (storeSharedMeetings as Meeting[]).forEach((meeting) => {
      const ownerName = meeting.shared_by || meeting.owner_name;
      const ownerEmail = meeting.shared_by_email || meeting.owner_email;
      const sharedAt = meeting.shared_at || meeting.created_at;
      const ownerId = meeting.owner_id || meeting.user_id;

      if (ownerName) {
        let contactUserId: string | null = null;

        if (ownerId) {
          const matchingContactById = storeContacts.find((c) => c.contact_user_id === ownerId);
          if (matchingContactById) {
            contactUserId = matchingContactById.contact_user_id;
          }
        }

        if (!contactUserId) {
          const matchingContact = storeContacts.find(
            (c) => c.contact_name === ownerName || c.contact_email === ownerEmail
          );
          if (matchingContact) {
            contactUserId = matchingContact.contact_user_id;
          } else if (ownerId) {
            contactUserId = ownerId;
          }
        }

        if (contactUserId) {
          const existing = incomingOwnersMap.get(contactUserId);
          if (!existing || new Date(sharedAt) > new Date(existing.lastSharedAt)) {
            incomingOwnersMap.set(contactUserId, {
              name: ownerName,
              email: ownerEmail ?? undefined,
              lastSharedAt: sharedAt,
              userId: ownerId ?? undefined,
            });
          }
        }
      }
    });

    incomingOwnersMap.forEach((ownerInfo, contactUserId) => {
      const existingConv = convMap.get(contactUserId);
      if (existingConv) {
        if (new Date(ownerInfo.lastSharedAt) > new Date(existingConv.lastMessageAt)) {
          existingConv.lastMessageAt = ownerInfo.lastSharedAt;
        }
      } else {
        const tempContact: OutgoingShareHistoryEntry = {
          contact_user_id: contactUserId,
          contact_name: ownerInfo.name,
          contact_email: ownerInfo.email || null,
          contact_share_id: null,
          contact_profile_picture: null,
          share_count: 0,
          last_shared_at: ownerInfo.lastSharedAt,
          shares: [],
        };
        convMap.set(contactUserId, {
          contact: tempContact,
          messages: [],
          lastMessageAt: ownerInfo.lastSharedAt,
        });
      }
    });

    return Array.from(convMap.values()).sort((a, b) =>
      new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
  }, [storeContacts, outgoingHistory, storeSharedMeetings]);

  const getContactName = useCallback((contact: Contact | OutgoingShareHistoryEntry): string => {
    if ('contact_name' in contact) {
      return (contact as Contact).contact_name;
    }
    return (contact as OutgoingShareHistoryEntry).contact_name;
  }, []);

  const getContactAvatar = useCallback((contact: Contact | OutgoingShareHistoryEntry): string | undefined => {
    const profilePic = contact.contact_profile_picture || contact.profile_picture_url;
    return formatImageUrl(profilePic) ?? undefined;
  }, []);

  // Load conversation messages
  useEffect(() => {
    if (!selectedConversation) {
      setConversationMessages([]);
      setCurrentPage(1); // Reset page when no conversation
      return;
    }

    // Reset to page 1 when conversation changes
    setCurrentPage(1);

    const loadConversationMessages = async () => {
      try {
        setLoadingMessages(true);
        const messages: ConversationMessage[] = [];

        const outgoingEntry = outgoingHistory.find(
          (entry) => entry.contact_user_id === selectedConversation.contact.contact_user_id
        );

        if (outgoingEntry && outgoingEntry.shares.length > 0) {
          const outgoingPromises = outgoingEntry.shares.map(async (share) => {
            try {
              const cachedMeeting = meetingsCacheRef.current.get(share.meeting_id);
              let meeting: Meeting | null = null;

              if (cachedMeeting) {
                meeting = cachedMeeting;
              } else {
                meeting = await getMeetingDetails(share.meeting_id);
                if (meeting) {
                  meetingsCacheRef.current.set(share.meeting_id, meeting);
                }
              }

              if (meeting) {
                const meetingWithPermissions = {
                  ...meeting,
                  is_shared: false,
                };
                return {
                  id: `outgoing-${share.meeting_id}-${share.share_id}`,
                  meeting: meetingWithPermissions,
                  direction: 'outgoing' as const,
                  sharedAt: share.shared_at,
                  sharedWith: {
                    id: outgoingEntry.contact_user_id,
                    name: outgoingEntry.contact_name,
                    email: outgoingEntry.contact_email || undefined,
                    profilePicture: formatImageUrl(outgoingEntry.contact_profile_picture) ?? undefined,
                  },
                };
              }
              return null;
            } catch (error) {
              logger.error(`Erreur lors du chargement de la réunion ${share.meeting_id}:`, error);
              return null;
            }
          });

          const outgoingResults = await Promise.all(outgoingPromises);
          for (const msg of outgoingResults) {
            if (msg !== null) {
              messages.push(msg);
            }
          }
        }

        const contactUserId = selectedConversation.contact.contact_user_id;
        const contactName = getContactName(selectedConversation.contact);
        // Cast car les shared meetings ont des propriétés additionnelles
        const incomingMeetings = (storeSharedMeetings as Meeting[]).filter((meeting) => {
          const ownerId = meeting.owner_id || meeting.user_id;
          const ownerName = meeting.shared_by || meeting.owner_name;
          return (
            ownerId === contactUserId ||
            ownerName === contactName ||
            meeting.shared_by === contactName
          );
        });

        if (incomingMeetings.length > 0) {
          const incomingPromises = incomingMeetings.map(async (meeting) => {
            try {
              const cachedMeeting = meetingsCacheRef.current.get(meeting.id);
              let meetingDetails: Meeting | null = null;

              if (cachedMeeting) {
                meetingDetails = cachedMeeting;
              } else {
                meetingDetails = await getMeetingDetails(meeting.id);
                if (meetingDetails) {
                  meetingsCacheRef.current.set(meeting.id, meetingDetails);
                }
              }

              if (meetingDetails) {
                const ownerName = meeting.shared_by || meeting.owner_name || getContactName(selectedConversation.contact);
                let meetingPerms: Meeting['permissions'] | undefined = undefined;

                if (meeting.permissions) {
                  if (typeof meeting.permissions === 'string') {
                    try {
                      meetingPerms = JSON.parse(meeting.permissions) as Meeting['permissions'];
                    } catch (e) {
                      logger.warn('Erreur lors du parsing des permissions:', e);
                      meetingPerms = undefined;
                    }
                  } else {
                    meetingPerms = meeting.permissions as Meeting['permissions'];
                  }
                }

                const finalPermissions: Meeting['permissions'] = meetingPerms || {
                  can_view: true,
                  can_export: true,
                  include_transcript: false,
                  role: 'reader',
                  can_edit: false,
                  can_share: false,
                  can_regenerate: false,
                };

                const meetingWithPermissions = {
                  ...meetingDetails,
                  is_shared: true,
                  permissions: finalPermissions,
                  shared_by: ownerName,
                  shared_by_email: meeting.shared_by_email || meeting.owner_email,
                  shared_at: meeting.shared_at || meeting.created_at,
                };
                return {
                  id: `incoming-${meeting.id}`,
                  meeting: meetingWithPermissions,
                  direction: 'incoming' as const,
                  sharedAt: meeting.shared_at || meeting.created_at,
                  sharedBy: {
                    id: selectedConversation.contact.contact_user_id,
                    name: ownerName,
                    email: meeting.shared_by_email || meeting.owner_email,
                    profilePicture: getContactAvatar(selectedConversation.contact),
                  },
                };
              }
              return null;
            } catch (error) {
              logger.error(`Erreur lors du chargement de la réunion ${meeting.id}:`, error);
              return null;
            }
          });

          const incomingResults = await Promise.all(incomingPromises);
          for (const msg of incomingResults) {
            if (msg !== null) {
              messages.push(msg);
            }
          }
        }

        messages.sort((a, b) =>
          new Date(a.sharedAt).getTime() - new Date(b.sharedAt).getTime()
        );

        setConversationMessages(messages);
      } catch (error) {
        logger.error('Erreur lors du chargement des messages:', error);
        showErrorPopup('Erreur', 'Impossible de charger les messages');
      } finally {
        setLoadingMessages(false);
      }
    };

    loadConversationMessages();
  }, [selectedConversation, outgoingHistory, storeSharedMeetings, showErrorPopup, user?.id]);

  // Pagination des messages
  const totalPages = useMemo(() => {
    return Math.ceil(conversationMessages.length / MESSAGES_PER_PAGE);
  }, [conversationMessages.length]);

  const paginatedMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * MESSAGES_PER_PAGE;
    const endIndex = startIndex + MESSAGES_PER_PAGE;
    return conversationMessages.slice(startIndex, endIndex);
  }, [conversationMessages, currentPage]);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Meeting handlers
  const handleOpenMeeting = async (meeting: Meeting) => {
    setIsLoadingTranscript(true);
    setSelectedMeeting(meeting);
    setMeetingDetailOverlayOpen(true);
    setFormattedTranscript(null);
    setIsEditingTranscript(false);
    setEditedTranscriptText('');
    setIsEditingSummary(false);
    setEditedSummaryText('');
    setSelectedTemplateId(null);

    try {
      const details = await getMeetingDetails(meeting.id);

      if (!meeting.is_shared) {
        setOverlayMeeting({
          ...details,
          is_shared: false,
        });
      } else {
        const meetingPerms = meeting.permissions;
        setOverlayMeeting({
          ...details,
          is_shared: true,
          permissions: meetingPerms || {
            can_view: true,
            can_export: true,
            include_transcript: false,
            role: 'reader',
            can_edit: false,
            can_share: false,
            can_regenerate: false,
          },
          shared_by: meeting.shared_by,
          shared_by_email: meeting.shared_by_email,
          shared_at: meeting.shared_at,
        });

        const isTranscriptAllowed = meeting.permissions?.include_transcript === true;
        if (isTranscriptAllowed && details.transcript_text) {
          const lines = details.transcript_text.split(/\n\n|\n/).filter((line: string) => line.trim());
          const formatted = lines.map((line: string) => {
            const match = line.match(/^([^:]+):\s*(.+)$/s);
            if (match) {
              const speakerId = match[1].trim();
              const text = match[2].trim();
              return { speakerId, speaker: getDisplayName(meeting.id, speakerId), text };
            }
            return { speakerId: 'speaker_0', speaker: formatSpeakerNameFrench('speaker_0'), text: line.trim() };
          }).filter((entry: {speakerId: string; speaker: string; text: string}) => entry.text.length > 0);
          setFormattedTranscript(formatted);
          setEditedTranscriptText(details.transcript_text);
        }
      }

      setEditedSummaryText(details.summary_text || '');
      setSelectedTemplateId(details.template_id || null);
    } catch (error) {
      logger.error('Error loading meeting details for overlay:', error);
      showErrorPopup('Erreur', 'Impossible de charger les détails de la réunion.');
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  const handleCloseMeetingOverlay = () => {
    setMeetingDetailOverlayOpen(false);
    setSelectedMeeting(null);
    setOverlayMeeting(null);
    setFormattedTranscript(null);
    setIsEditingTranscript(false);
    setEditedTranscriptText('');
    setIsEditingSummary(false);
    setEditedSummaryText('');
  };

  const handleLoadTranscript = async (meetingId: string) => {
    if (!selectedMeeting || !overlayMeeting) return;

    if (overlayMeeting.is_shared && overlayMeeting.permissions?.include_transcript !== true) {
      return;
    }

    setIsLoadingTranscript(true);
    try {
      const transcriptResponse = await getTranscript(meetingId);
      const transcript = typeof transcriptResponse === 'string' ? transcriptResponse : transcriptResponse.transcript_text || '';
      if (transcript) {
        const lines = transcript.split(/\n\n|\n/).filter((line: string) => line.trim());
        const formatted = lines.map((line: string) => {
          const match = line.match(/^([^:]+):\s*(.+)$/s);
          if (match) {
            const speakerId = match[1].trim();
            const text = match[2].trim();
            return { speakerId, speaker: getDisplayName(meetingId, speakerId), text };
          }
          return { speakerId: 'speaker_0', speaker: formatSpeakerNameFrench('speaker_0'), text: line.trim() };
        }).filter((entry: {speakerId: string; speaker: string; text: string}) => entry.text.length > 0);
        setFormattedTranscript(formatted);
        setEditedTranscriptText(transcript);
      }
    } catch (error) {
      logger.error('Erreur lors du chargement de la transcription:', error);
      showErrorPopup('Erreur', 'Impossible de charger la transcription');
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  const handleSaveSpeakerName = (speakerId: string, customName: string) => {
    if (!selectedMeeting) return;
    updateSpeakerName(selectedMeeting.id, speakerId, customName);
    if (selectedMeeting.id) {
      handleLoadTranscript(selectedMeeting.id);
    }
  };

  const handleStartEditTranscript = () => {
    if (overlayMeeting?.is_shared) {
      const canEdit = overlayMeeting.permissions?.can_edit === true || overlayMeeting.permissions?.role === 'editor';
      if (!canEdit) {
        showErrorPopup('Accès refusé', 'Vous n\'avez pas les droits pour modifier cette réunion partagée.');
        return;
      }
    }
    setIsEditingTranscript(true);
  };

  const handleCancelEditTranscript = () => {
    setIsEditingTranscript(false);
    if (selectedMeeting && formattedTranscript) {
      setEditedTranscriptText(formattedTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n'));
    }
  };

  const handleSaveTranscript = async (textToSave?: string) => {
    if (!selectedMeeting || !overlayMeeting) return;

    const finalText = textToSave ?? editedTranscriptText;

    if (overlayMeeting.is_shared) {
      const canEdit = overlayMeeting.permissions?.can_edit === true || overlayMeeting.permissions?.role === 'editor';
      if (!canEdit) {
        showErrorPopup('Accès refusé', 'Vous n\'avez pas les droits pour modifier cette réunion partagée.');
        return;
      }
    }

    setIsSavingTranscript(true);
    try {
      await updateMeetingTranscriptText(selectedMeeting.id, finalText);
      setEditedTranscriptText(finalText);

      const lines = finalText.split(/\n\n/).filter((line: string) => line.trim());
      const newFormattedTranscript = lines.map((line: string) => {
        const match = line.match(/^([^:]+):\s*(.+)$/s);
        if (match) {
          const speakerId = match[1].trim();
          const text = match[2].trim();
          return { speakerId, speaker: getDisplayName(selectedMeeting.id, speakerId), text };
        }
        return { speakerId: 'speaker_0', speaker: formatSpeakerNameFrench('speaker_0'), text: line.trim() };
      }).filter((entry: {speakerId: string; speaker: string; text: string}) => entry.text.length > 0);

      setFormattedTranscript(newFormattedTranscript);
      setIsEditingTranscript(false);
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde de la transcription:', error);
      showErrorPopup('Erreur', 'Impossible de sauvegarder la transcription');
    } finally {
      setIsSavingTranscript(false);
    }
  };

  const handleTranscriptEntryChange = (index: number, newText: string) => {
    if (formattedTranscript) {
      const newTranscript = [...formattedTranscript];
      newTranscript[index] = { ...newTranscript[index], text: newText };
      setFormattedTranscript(newTranscript);
      setEditedTranscriptText(newTranscript.map(u => `${u.speaker}: ${u.text}`).join('\n\n'));
    }
  };

  const handleStartEditSummary = () => {
    if (overlayMeeting?.is_shared) {
      const canEdit = overlayMeeting.permissions?.can_edit === true || overlayMeeting.permissions?.role === 'editor';
      if (!canEdit) {
        showErrorPopup('Accès refusé', 'Vous n\'avez pas les droits pour modifier cette réunion partagée.');
        return;
      }
    }
    if (selectedMeeting?.summary_text) {
      setEditedSummaryText(selectedMeeting.summary_text);
      setIsEditingSummary(true);
    }
  };

  const handleCancelEditSummary = () => {
    setIsEditingSummary(false);
    if (selectedMeeting?.summary_text) {
      setEditedSummaryText(selectedMeeting.summary_text);
    }
  };

  const handleSaveSummary = async () => {
    if (!overlayMeeting) return Promise.resolve();

    if (overlayMeeting.is_shared) {
      const canEdit = overlayMeeting.permissions?.can_edit === true || overlayMeeting.permissions?.role === 'editor';
      if (!canEdit) {
        showErrorPopup('Accès refusé', 'Vous n\'avez pas les droits pour modifier cette réunion partagée.');
        return Promise.resolve();
      }
    }

    showErrorPopup('Info', 'La modification du résumé sera disponible prochainement');
    setIsEditingSummary(false);
    return Promise.resolve();
  };

  const handleGenerateSummary = async (_meetingId: string, _templateId: string) => {
    showErrorPopup('Info', 'La génération de résumé n\'est pas disponible pour les réunions partagées');
  };

  const handleDelete = (_meetingId: string) => {
    showErrorPopup('Info', 'La suppression n\'est pas disponible pour les réunions partagées');
  };

  const handleShare = async (_meeting: Meeting) => {
    showErrorPopup('Info', 'Le partage n\'est pas disponible depuis cette vue');
  };

  const handlePlayAudio = (_meetingId: string, _title: string) => {
    showErrorPopup('Info', 'La lecture audio sera disponible prochainement');
  };

  const handleOpenEditPermissions = (message: ConversationMessage, e: React.MouseEvent) => {
    e.stopPropagation();

    const currentShare = outgoingHistory
      .find(entry => entry.contact_user_id === message.sharedWith?.id)
      ?.shares.find(share => share.meeting_id === message.meeting.id);

    const currentRole: ShareRole = currentShare?.permissions?.role || 'reader';
    const currentIncludeTranscript = currentShare?.permissions?.include_transcript || false;

    setEditPermissionsMessage(message);
    setEditRole(currentRole);
    setEditIncludeTranscript(currentIncludeTranscript);
    setEditPermissionsOpen(true);
  };

  const handleUpdatePermissions = async () => {
    if (!editPermissionsMessage || !editPermissionsMessage.sharedWith) return;

    setIsUpdatingPermissions(true);
    try {
      const contact = storeContacts.find(c => c.contact_user_id === editPermissionsMessage.sharedWith?.id);
      const shareId = contact?.contact_share_id;

      if (!shareId) {
        showErrorPopup('Erreur', 'Impossible de trouver l\'identifiant de partage du contact');
        return;
      }

      await updateMeetingShare(
        editPermissionsMessage.meeting.id,
        editPermissionsMessage.sharedWith.id,
        shareId,
        editRole,
        editIncludeTranscript
      );

      const [historyData] = await Promise.all([
        getOutgoingShareHistory(),
        fetchContacts(true),  // Force refresh du store
      ]);
      setOutgoingHistory(historyData);

      setEditPermissionsOpen(false);
      setEditPermissionsMessage(null);
    } catch (error) {
      logger.error('Erreur lors de la mise à jour des permissions:', error);
      showErrorPopup('Erreur', 'Impossible de mettre à jour les permissions');
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  const resolveTemplateForMeeting = (meeting: Meeting): Template | undefined => {
    if (!meeting.template_id) return undefined;
    return storeTemplates.find(t => t.id === meeting.template_id);
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Collapsible panel state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="h-full w-full flex bg-gradient-to-br from-slate-50 to-blue-50/30">
        {/* Main content - skeleton cards */}
        <div className={cn("flex-1 p-3 sm:p-6", isMobile && "hidden")}>
          <div className="max-w-4xl mx-auto">
            {/* Header skeleton */}
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-8">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-200 animate-pulse" />
              <div>
                <div className="h-4 sm:h-5 w-24 sm:w-32 bg-slate-200 rounded animate-pulse mb-1" />
                <div className="h-2.5 sm:h-3 w-20 sm:w-24 bg-slate-100 rounded animate-pulse" />
              </div>
            </div>

            {/* Skeleton cards grid */}
            <div className="space-y-2 sm:space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-14 sm:h-16 bg-white rounded-xl border border-slate-100 flex items-center gap-3 sm:gap-4 px-3 sm:px-4"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-100 animate-pulse flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="h-3.5 sm:h-4 bg-slate-100 rounded w-32 sm:w-48 mb-1.5 sm:mb-2 animate-pulse" />
                    <div className="h-2.5 sm:h-3 bg-slate-50 rounded w-24 sm:w-32 animate-pulse" />
                  </div>
                  <div className="h-2.5 sm:h-3 w-12 sm:w-16 bg-slate-100 rounded animate-pulse hidden sm:block" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel skeleton / Mobile full screen */}
        <div className={cn(
          "border-l border-slate-100 bg-white p-3 sm:p-4",
          isMobile ? "w-full border-l-0" : "w-72 sm:w-80"
        )}>
          <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-100 animate-pulse" />
            <div className="flex-1">
              <div className="h-3.5 sm:h-4 w-20 sm:w-24 bg-slate-100 rounded animate-pulse mb-1" />
              <div className="h-2.5 sm:h-3 w-14 sm:w-16 bg-slate-50 rounded animate-pulse" />
            </div>
          </div>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 mb-1.5 sm:mb-2">
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-slate-100 animate-pulse" />
              <div className="flex-1">
                <div className="h-3.5 sm:h-4 w-24 sm:w-28 bg-slate-100 rounded animate-pulse mb-1" />
                <div className="h-2.5 sm:h-3 w-16 sm:w-20 bg-slate-50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* Main Content Area (Left) - Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={cn(
          "flex-1 flex flex-col",
          isMobile && !selectedConversation && !selectedOrganization && "hidden"
        )}
      >
        {selectedOrganization ? (
          /* ========== Conversation de groupe (Organisation) ========== */
          <>
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-white border-b border-slate-100 flex items-center gap-2 sm:gap-4">
              {isMobile && (
                <button
                  onClick={() => { setSelectedOrganization(null); }}
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-500" />
                </button>
              )}
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center">
                {getOrganizationLogoUrl(selectedOrganization.logo_url) ? (
                  <img src={getOrganizationLogoUrl(selectedOrganization.logo_url)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-600 font-semibold text-xs sm:text-sm">{selectedOrganization.name.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm sm:text-base text-slate-800 truncate">{selectedOrganization.name}</h2>
                <p className="text-[10px] sm:text-xs text-slate-500">Groupe d'organisation</p>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={openShareShortcut}
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                  title="Partager une réunion"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setOrgInfoOrgId(selectedOrganization.id)}
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                  title="Voir les membres"
                >
                  <Info className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex flex-col">
              {loadingOrgMeetings ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                </div>
              ) : (() => {
                const orgMeetings = orgMeetingsCache[selectedOrganization.id] ?? [];
                if (orgMeetings.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 sm:mb-4">
                        <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300" />
                      </div>
                      <p className="text-sm sm:text-base text-slate-500 font-medium">Aucune réunion partagée avec ce groupe</p>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">Utilisez le bouton + en haut à droite pour partager une réunion</p>
                    </div>
                  );
                }
                const isCurrentUser = (emailOrName: string) => user?.email === emailOrName || user?.full_name === emailOrName;
                return (
                  <div className="space-y-2 sm:space-y-3">
                    {orgMeetings.map((om) => {
                      const isOutgoing = isCurrentUser(om.shared_by || '');
                      return (
                        <motion.div
                          key={om.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}
                        >
                          <div
                            onClick={async () => {
                              try {
                                const meeting = await getMeetingDetails(om.meeting_id);
                                if (meeting) {
                                  const withPerms = {
                                    ...meeting,
                                    is_shared: true,
                                    permissions: om.permissions,
                                    shared_by: om.shared_by_name || om.shared_by,
                                    shared_at: om.shared_at,
                                  };
                                  handleOpenMeeting(withPerms as Meeting);
                                }
                              } catch (err) {
                                logger.error('SharesView: getMeetingDetails failed', err);
                                showErrorPopup('Erreur', 'Impossible d\'ouvrir la réunion');
                              }
                            }}
                            className={cn(
                              "cursor-pointer transition-all rounded-lg sm:rounded-xl px-2.5 py-2 sm:px-4 sm:py-3 w-[85%] sm:w-[70%] max-w-xs sm:max-w-md",
                              isOutgoing ? "bg-blue-500 hover:bg-blue-600 shadow-md shadow-blue-500/15" : "bg-white hover:bg-slate-50 border border-slate-100 shadow-sm"
                            )}
                          >
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className={cn("w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0", isOutgoing ? "bg-blue-400/30" : "bg-slate-100")}>
                                {isOutgoing ? <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" /> : <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs sm:text-sm truncate" style={{ color: isOutgoing ? '#fff' : '#334155' }}>
                                  {om.meeting_title || 'Réunion sans titre'}
                                </p>
                                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs mt-0.5" style={{ color: isOutgoing ? '#bfdbfe' : '#94a3b8' }}>
                                  <span>{formatTime(om.shared_at)}</span>
                                  {om.meeting_duration_seconds && (
                                    <>
                                      <span>•</span>
                                      <span>{formatDuration(om.meeting_duration_seconds)}</span>
                                    </>
                                  )}
                                  {!isOutgoing && om.shared_by_name && <span>• {om.shared_by_name}</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </>
        ) : selectedConversation ? (
          <>
            {/* Conversation Header */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-white border-b border-slate-100 flex items-center gap-2 sm:gap-4">
              {/* Bouton retour - à gauche sur mobile */}
              {isMobile && (
                <button
                  onClick={() => { setSelectedConversation(null); setSelectedOrganization(null); }}
                  className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 text-slate-500" />
                </button>
              )}
              <div
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all bg-slate-100"
                onClick={() => {
                  const contact = selectedConversation.contact as Contact;
                  setProfileOverlayData({
                    type: 'user',
                    name: contact.contact_name,
                    email: contact.contact_email || undefined,
                    avatar: formatImageUrl(contact.contact_profile_picture) ?? undefined,
                    since: contact.created_at || undefined,
                  });
                  setProfileOverlayOpen(true);
                }}
              >
                {(() => {
                  const avatarUrl = getContactAvatar(selectedConversation.contact);
                  if (avatarUrl && !failedAvatars.has(selectedConversation.contact.contact_user_id)) {
                    return (
                      <img
                        src={avatarUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={() => setFailedAvatars(prev => new Set(prev).add(selectedConversation.contact.contact_user_id))}
                      />
                    );
                  }
                  return (
                    <div className="w-full h-full flex items-center justify-center font-semibold text-xs sm:text-sm bg-blue-100 text-blue-600">
                      {getInitials(getContactName(selectedConversation.contact))}
                    </div>
                  );
                })()}
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-sm sm:text-base text-slate-800 truncate">
                  {getContactName(selectedConversation.contact)}
                </h2>
              </div>
              <button
                type="button"
                onClick={openShareShortcut}
                className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                title="Partager une réunion"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6">
              {loadingMessages ? (
                <div className="space-y-2 sm:space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        i % 2 === 0 ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "w-[80%] sm:w-[70%] max-w-xs sm:max-w-md h-12 sm:h-14 rounded-xl animate-pulse",
                          i % 2 === 0 ? "bg-blue-100" : "bg-slate-100"
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : conversationMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-100 flex items-center justify-center mb-3 sm:mb-4">
                    <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-slate-300" />
                  </div>
                  <p className="text-sm sm:text-base text-slate-500 font-medium">Aucun échange</p>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">Les réunions partagées apparaîtront ici</p>
                </div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {paginatedMessages.map((message, index) => {
                    const isOutgoing = message.direction === 'outgoing';

                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={cn(
                          "flex",
                          isOutgoing ? "justify-end" : "justify-start"
                        )}
                      >
                        {/* Card - Style messagerie */}
                        <div
                          onClick={() => handleOpenMeeting(message.meeting)}
                          className={cn(
                            "cursor-pointer transition-all duration-200 rounded-lg sm:rounded-xl px-2.5 py-2 sm:px-4 sm:py-3",
                            "w-[85%] sm:w-[70%] max-w-xs sm:max-w-md",
                            isOutgoing
                              ? "bg-blue-500 hover:bg-blue-600 shadow-md shadow-blue-500/15"
                              : "bg-white hover:bg-slate-50 border border-slate-100 shadow-sm hover:shadow-md"
                          )}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            {/* Direction icon */}
                            <div className={cn(
                              "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                              isOutgoing ? "bg-blue-400/30" : "bg-slate-100"
                            )}>
                              {isOutgoing ? (
                                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                              ) : (
                                <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p
                                className="font-medium text-xs sm:text-sm truncate"
                                style={{ color: isOutgoing ? '#ffffff' : '#334155' }}
                              >
                                {message.meeting.title || message.meeting.name || 'Réunion sans titre'}
                              </p>
                              <div
                                className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs mt-0.5"
                                style={{ color: isOutgoing ? '#bfdbfe' : '#94a3b8' }}
                              >
                                <span>{formatTime(message.sharedAt)}</span>
                                {message.meeting.duration_seconds && (
                                  <>
                                    <span className={isOutgoing ? "text-blue-200" : "text-slate-300"}>•</span>
                                    <span>{formatDuration(message.meeting.duration_seconds)}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Edit button for outgoing */}
                            {isOutgoing && (
                              <button
                                onClick={(e) => handleOpenEditPermissions(message, e)}
                                className="p-1 sm:p-1.5 rounded-md hover:bg-white/20 transition-colors flex-shrink-0"
                                title="Modifier les permissions"
                              >
                                <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-blue-100" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1 sm:gap-2 pt-4 sm:pt-6 pb-2">
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
                        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>

                      <div className="flex items-center gap-0.5 sm:gap-1">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                          // Show first, last, current and adjacent pages
                          const showPage = page === 1 ||
                                          page === totalPages ||
                                          Math.abs(page - currentPage) <= 1;
                          const showEllipsis = page === 2 && currentPage > 3 ||
                                              page === totalPages - 1 && currentPage < totalPages - 2;

                          if (!showPage && !showEllipsis) return null;
                          if (showEllipsis && !showPage) {
                            return (
                              <span key={page} className="px-1 sm:px-2 text-slate-400 text-xs">...</span>
                            );
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
                          );
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
                        {conversationMessages.length} échange{conversationMessages.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-3 sm:mb-4">
              <MessageSquare className="w-8 h-8 sm:w-10 sm:h-10 text-slate-300" />
            </div>
            <p className="text-base sm:text-lg font-medium text-slate-600">Sélectionnez une conversation</p>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">Pour voir les échanges partagés</p>
          </div>
        )}
      </motion.div>

      {/* Conversations Panel (Right) - Collapsible */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0, width: isPanelCollapsed ? 56 : (isMobile ? '100%' : 280) }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "relative border-l border-slate-100 bg-white flex flex-col",
          isMobile && !selectedConversation && "absolute inset-0 border-l-0",
          isMobile && (selectedConversation || selectedOrganization) && "hidden"
        )}
      >
        {/* Collapse toggle button - Style identique à la sidebar principale */}
        {!isMobile && (
          <button
            onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              left: -20,
              zIndex: 1000,
              width: 20,
              height: 56,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRight: 'none',
              borderRadius: '8px 0 0 8px',
              boxShadow: '-2px 0 8px rgba(0,0,0,0.08)',
              cursor: 'pointer',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f9fafb';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
            }}
          >
            {isPanelCollapsed ? (
              <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        )}

        {/* Header */}
        <div className={cn(
          "px-3 sm:px-4 py-3 sm:py-4 border-b border-slate-100",
          isPanelCollapsed && "px-2"
        )}>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={cn(
              "rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0",
              isPanelCollapsed ? "w-9 h-9 sm:w-10 sm:h-10" : "w-9 h-9 sm:w-10 sm:h-10"
            )}>
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            {!isPanelCollapsed && (
              <div>
                <h1 className="text-sm sm:text-base font-semibold text-slate-800">Mes partages</h1>
                <p className="text-[10px] sm:text-xs text-slate-400">{conversations.length} contact{conversations.length > 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
        </div>

        {/* Groupe(s) d'organisation - logo + bouton info (membres) */}
        {/* Clic sur une org = ouvrir la conversation de groupe (comme un contact) */}
        {!isPanelCollapsed && myOrganizations.length > 0 && (
          <div className="px-2 sm:px-3 py-2 border-b border-slate-100">
            <p className="text-[10px] sm:text-xs font-medium text-slate-500 uppercase tracking-wider px-1.5 mb-2">Organisation</p>
            <div className="space-y-1.5">
              {myOrganizations.map((org) => {
                const isSelected = selectedOrganization?.id === org.id;
                return (
                  <div
                    key={org.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedOrganization(org); setSelectedConversation(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedOrganization(org); setSelectedConversation(null); } }}
                    className={cn(
                      "flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 rounded-xl border transition-colors cursor-pointer",
                      isSelected ? "bg-blue-50 border-blue-100" : "bg-slate-50 border-slate-100 hover:bg-slate-100/80"
                    )}
                  >
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-slate-200 flex items-center justify-center">
                      {getOrganizationLogoUrl(org.logo_url) ? (
                        <img
                          src={getOrganizationLogoUrl(org.logo_url)!}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-slate-500 font-semibold text-xs sm:text-sm">
                          {org.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "flex-1 min-w-0 text-xs sm:text-sm font-medium truncate",
                      isSelected ? "text-blue-700" : "text-slate-800"
                    )}>
                      {org.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOrgInfoOrgId(org.id); }}
                      className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
                      title="Voir les membres"
                    >
                      <Info className="w-4 h-4 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            !isPanelCollapsed && (
              <div className="flex flex-col items-center justify-center h-full p-4 sm:p-6 text-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-slate-100 flex items-center justify-center mb-2 sm:mb-3">
                  <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7 text-slate-300" />
                </div>
                <p className="text-slate-500 font-medium text-xs sm:text-sm">Aucune conversation</p>
                <p className="text-[10px] sm:text-xs text-slate-400 mt-1">Partagez des réunions pour démarrer</p>
              </div>
            )
          ) : (
            <div className={cn("p-1.5 sm:p-2", isPanelCollapsed && "p-1")}>
              {conversations.map((conversation, index) => {
                const contact = conversation.contact;
                const name = getContactName(contact);
                const avatar = getContactAvatar(contact);
                const isSelected = selectedConversation?.contact.contact_user_id === contact.contact_user_id;

                return (
                  <motion.button
                    key={contact.contact_user_id}
                    onClick={() => { setSelectedConversation(conversation); setSelectedOrganization(null); }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={cn(
                      "w-full flex items-center gap-2 sm:gap-3 rounded-lg sm:rounded-xl transition-all duration-150 text-left mb-0.5 sm:mb-1",
                      isPanelCollapsed ? "p-1 sm:p-1.5 justify-center" : "p-2 sm:p-3",
                      isSelected
                        ? "bg-blue-50 border border-blue-100"
                        : "hover:bg-slate-50 border border-transparent"
                    )}
                    title={isPanelCollapsed ? name : undefined}
                  >
                    {/* Avatar with proper aspect ratio */}
                    <div className={cn(
                      "rounded-full overflow-hidden flex-shrink-0 bg-slate-100",
                      isPanelCollapsed ? "w-8 h-8 sm:w-9 sm:h-9" : "w-9 h-9 sm:w-11 sm:h-11"
                    )}>
                      {avatar && !failedAvatars.has(contact.contact_user_id) ? (
                        <img
                          src={avatar}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => setFailedAvatars(prev => new Set(prev).add(contact.contact_user_id))}
                        />
                      ) : (
                        <div className={cn(
                          "w-full h-full flex items-center justify-center font-semibold bg-blue-100 text-blue-600",
                          isPanelCollapsed ? "text-[10px] sm:text-xs" : "text-xs sm:text-sm"
                        )}>
                          {getInitials(name)}
                        </div>
                      )}
                    </div>

                    {!isPanelCollapsed && (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 sm:gap-2">
                            <p className={cn(
                              "font-medium text-xs sm:text-sm truncate",
                              isSelected ? "text-blue-700" : "text-slate-700"
                            )}>
                              {name}
                            </p>
                          </div>
                          <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                            {formatTime(conversation.lastMessageAt)}
                          </p>
                        </div>
                        <ChevronLeft className={cn(
                          "w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 transition-colors",
                          isSelected ? "text-blue-400" : "text-slate-300"
                        )} />
                      </>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>

      {/* Profile Overlay - Même animation que ShareDialog */}
      <AnimatePresence>
        {profileOverlayOpen && profileOverlayData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1400] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => { setProfileOverlayOpen(false); setProfileOverlayData(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full sm:max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-0 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden bg-white">
                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-800">
                    {profileOverlayData.type === 'user' ? 'Profil' : 'Organisation'}
                  </h2>
                  <button
                    onClick={() => { setProfileOverlayOpen(false); setProfileOverlayData(null); }}
                    className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  </button>
                </div>

                <CardContent className="p-4 sm:p-6">
                  {profileOverlayData.type === 'user' && (
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                        {profileOverlayData.avatar ? (
                          <img
                            src={profileOverlayData.avatar}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 text-lg sm:text-xl font-semibold">
                            {profileOverlayData.name ? getInitials(profileOverlayData.name) : <UserCircle className="w-6 h-6 sm:w-8 sm:h-8" />}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 text-base sm:text-lg truncate">
                          {profileOverlayData.name || 'Utilisateur'}
                        </p>
                        {profileOverlayData.email && (
                          <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-1 sm:gap-1.5 mt-0.5 sm:mt-1 truncate">
                            <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0" />
                            <span className="truncate">{profileOverlayData.email}</span>
                          </p>
                        )}
                        {profileOverlayData.since && (
                          <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 sm:mt-1">
                            Contact depuis {formatTime(profileOverlayData.since)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50/50">
                  <Button
                    onClick={() => { setProfileOverlayOpen(false); setProfileOverlayData(null); }}
                    className="w-full h-10 sm:h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm"
                  >
                    Fermer
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay Membres de l'organisation (bouton info) */}
      <AnimatePresence>
        {orgInfoOrgId && (() => {
          const org = myOrganizations.find((o) => o.id === orgInfoOrgId);
          const members = orgMembersCache[orgInfoOrgId] ?? [];
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[1400] flex items-end sm:items-center justify-center sm:p-4 bg-black/50 backdrop-blur-sm"
              onClick={() => setOrgInfoOrgId(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="w-full sm:max-w-md max-h-[85vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-800">
                    Membres {org ? `– ${org.name}` : ''}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOrgInfoOrgId(null)}
                    className="p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  {loadingOrgMembers ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                    </div>
                  ) : members.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">Aucun membre</p>
                  ) : (
                    <ul className="space-y-2 sm:space-y-3">
                      {members.map((member) => {
                        const avatarUrl = formatImageUrl(member.user_profile_picture_url ?? undefined) ?? undefined;
                        const name = member.user_full_name || member.user_email || 'Membre';
                        return (
                          <li
                            key={member.id}
                            className="flex items-center gap-3 sm:gap-4 p-2 sm:p-3 rounded-xl bg-slate-50 border border-slate-100"
                          >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden flex-shrink-0 bg-slate-200 flex items-center justify-center">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-slate-600 font-semibold text-sm">
                                  {getInitials(name)}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-800 text-sm sm:text-base truncate">
                                {name}
                              </p>
                              {member.user_email && (
                                <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                  <Mail className="w-3 h-3 flex-shrink-0" />
                                  {member.user_email}
                                </p>
                              )}
                            </div>
                            {member.role && (
                              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 flex-shrink-0">
                                {member.role === 'owner' ? 'Admin' : member.role}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
                  <Button
                    onClick={() => setOrgInfoOrgId(null)}
                    className="w-full h-10 sm:h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm"
                  >
                    Fermer
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Modal partage "+" : étape 1 = choix de l'échange (avec synthèse), étape 2 = paramètres (rôle + transcription) */}
      <AnimatePresence>
        {shareShortcutOpen && (selectedOrganization || selectedConversation) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1400] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              if (!sharingInProgress) {
                setShareShortcutOpen(false);
                setShareShortcutStep(1);
                setSelectedMeetingForShare(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full sm:max-w-md h-[85vh] sm:min-h-[380px] sm:max-h-[85vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0">
                <h2 className="text-base sm:text-lg font-semibold text-slate-800">
                  {shareShortcutStep === 1 ? 'Choisir l\'échange' : 'Paramètres du partage'}
                </h2>
                <button
                  type="button"
                  disabled={sharingInProgress}
                  onClick={() => {
                    if (!sharingInProgress) {
                      if (shareShortcutStep === 2) {
                        setShareShortcutStep(1);
                        setSelectedMeetingForShare(null);
                      } else {
                        setShareShortcutOpen(false);
                      }
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 min-h-[280px] flex flex-col">
                <AnimatePresence mode="wait">
                  {shareShortcutStep === 1 ? (
                    <motion.div
                      key="step1"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                      className="flex flex-col min-h-[240px]"
                    >
                      <p className="text-xs text-slate-500 mb-3">Réunions avec synthèse uniquement</p>
                      {loadingShareMeetings ? (
                        <div className="flex justify-center py-8 flex-1 items-center">
                          <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                        </div>
                      ) : meetingsWithSummary.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-6 flex-1 flex items-center justify-center">Aucune réunion avec synthèse à partager</p>
                      ) : (
                        <ul className="space-y-2">
                          {meetingsWithSummary.map((m) => (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMeetingForShare(m);
                                  setShareShortcutStep(2);
                                }}
                                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 text-left"
                              >
                                <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-800 truncate">{m.title || m.name || 'Sans titre'}</p>
                                  <p className="text-xs text-slate-500">{m.created_at ? formatTime(m.created_at) : ''}</p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="step2"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                      className="flex flex-col min-h-[240px] items-center justify-center"
                    >
                      <div className="w-full max-w-sm flex flex-col gap-5">
                        {selectedMeetingForShare && (
                          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                            <p className="font-medium text-slate-800 truncate text-sm">
                              {selectedMeetingForShare.title || selectedMeetingForShare.name || 'Sans titre'}
                            </p>
                          </div>
                        )}

                        <div>
                          <p className="text-sm font-medium text-slate-700 mb-2">Type d'accès</p>
                          <div className="inline-flex p-1 bg-slate-100 rounded-xl" style={{ gap: 2 }}>
                            <button
                              type="button"
                              onClick={() => setShareShortcutRole('reader')}
                              className={cn(
                                'relative z-10 px-4 py-2 text-sm font-medium rounded-[10px] transition-all duration-200',
                                shareShortcutRole === 'reader'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-slate-500 hover:text-slate-700'
                              )}
                            >
                              Lecteur
                            </button>
                            <button
                              type="button"
                              onClick={() => setShareShortcutRole('editor')}
                              className={cn(
                                'relative z-10 px-4 py-2 text-sm font-medium rounded-[10px] transition-all duration-200',
                                shareShortcutRole === 'editor'
                                  ? 'bg-white text-blue-600 shadow-sm'
                                  : 'text-slate-500 hover:text-slate-700'
                              )}
                            >
                              Éditeur
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-700">Inclure la transcription</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={shareShortcutIncludeTranscript}
                            onClick={() => setShareShortcutIncludeTranscript((v) => !v)}
                            className={cn(
                              'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                              shareShortcutIncludeTranscript ? 'bg-blue-500' : 'bg-slate-200'
                            )}
                          >
                            <span
                              className={cn(
                                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition duration-200 translate-y-0',
                                shareShortcutIncludeTranscript ? 'translate-x-5' : 'translate-x-0.5'
                              )}
                            />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2 flex-shrink-0">
                {shareShortcutStep === 2 ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => { setShareShortcutStep(1); setSelectedMeetingForShare(null); }}
                      disabled={sharingInProgress}
                      className="flex-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                    >
                      Retour
                    </Button>
                    <Button
                      onClick={submitShareShortcut}
                      disabled={sharingInProgress || !selectedMeetingForShare}
                      className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-600 text-white"
                    >
                      {sharingInProgress ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Partager'}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => { setShareShortcutOpen(false); setShareShortcutStep(1); setSelectedMeetingForShare(null); }}
                    className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Fermer
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Meeting Detail Overlay */}
      {selectedMeeting && (
        <MeetingDetailOverlay
          meeting={selectedMeeting}
          open={meetingDetailOverlayOpen}
          onClose={handleCloseMeetingOverlay}
          formattedTranscript={formattedTranscript}
          isLoadingTranscript={isLoadingTranscript}
          onLoadTranscript={handleLoadTranscript}
          onSaveSpeakerName={handleSaveSpeakerName}
          hasCustomName={(meetingId: string, speakerId: string) => hasCustomName(meetingId, speakerId)}
          isEditingTranscript={isEditingTranscript}
          onStartEditTranscript={handleStartEditTranscript}
          onCancelEditTranscript={handleCancelEditTranscript}
          onSaveTranscript={handleSaveTranscript}
          isSavingTranscript={isSavingTranscript}
          editedTranscriptText={editedTranscriptText}
          onTranscriptTextChange={setEditedTranscriptText}
          onTranscriptEntryChange={handleTranscriptEntryChange}
          templates={storeTemplates}
          selectedTemplateId={selectedTemplateId}
          onSelectTemplate={setSelectedTemplateId}
          onGenerateSummary={handleGenerateSummary}
          isGeneratingSummary={isGeneratingSummary}
          isEditingSummary={isEditingSummary}
          editedSummaryText={editedSummaryText}
          onStartEditSummary={handleStartEditSummary}
          onCancelEditSummary={handleCancelEditSummary}
          onSaveSummary={handleSaveSummary}
          isSavingSummary={isSavingSummary}
          onSummaryTextChange={setEditedSummaryText}
          onDelete={handleDelete}
          onShare={handleShare}
          onPlayAudio={handlePlayAudio}
          onSaveTitle={async (meetingId, newTitle) => {
            try {
              await updateMeetingTitle(meetingId, newTitle);
              // Mettre à jour le meeting sélectionné
              setSelectedMeeting(prev => prev ? { ...prev, title: newTitle, name: newTitle } : prev);
              setOverlayMeeting(prev => prev ? { ...prev, title: newTitle, name: newTitle } : prev);
              // Mettre à jour dans la liste de messages
              setConversationMessages(prev => prev.map(msg =>
                msg.meeting.id === meetingId
                  ? { ...msg, meeting: { ...msg.meeting, title: newTitle, name: newTitle } }
                  : msg
              ));
            } catch (error) {
              logger.error('Error saving title:', error);
              showErrorPopup('Erreur', 'Impossible de modifier le titre');
            }
          }}
          resolveTemplateForMeeting={resolveTemplateForMeeting}
          onError={showErrorPopup}
        />
      )}

      {/* Edit Permissions Modal */}
      <AnimatePresence>
        {editPermissionsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => !isUpdatingPermissions && setEditPermissionsOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-0 shadow-2xl rounded-t-2xl sm:rounded-2xl overflow-hidden bg-white">
                {/* Header */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 bg-slate-50/50">
                  <h2 className="text-base sm:text-lg font-semibold text-slate-800">Modifier les permissions</h2>
                  {editPermissionsMessage && (
                    <p className="text-xs sm:text-sm text-slate-500 mt-0.5 truncate">
                      {editPermissionsMessage.meeting.title || editPermissionsMessage.meeting.name || 'Réunion sans titre'}
                    </p>
                  )}
                </div>

                <CardContent className="p-4 sm:p-6 space-y-4 sm:space-y-5">
                  {/* Role selection */}
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-slate-700 mb-2 sm:mb-3">Rôle</p>
                    <div className="space-y-1.5 sm:space-y-2">
                      <label className={cn(
                        "flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all",
                        editRole === 'reader'
                          ? "border-blue-500 bg-blue-50/50"
                          : "border-slate-200 hover:border-slate-300"
                      )}>
                        <input
                          type="radio"
                          name="role"
                          value="reader"
                          checked={editRole === 'reader'}
                          onChange={() => setEditRole('reader')}
                          className="mt-0.5 sm:mt-1"
                        />
                        <div>
                          <p className="font-medium text-xs sm:text-sm text-slate-700">Lecteur</p>
                          <p className="text-[10px] sm:text-xs text-slate-500">Peut consulter la synthèse et exporter</p>
                        </div>
                      </label>

                      <label className={cn(
                        "flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border-2 cursor-pointer transition-all",
                        editRole === 'editor'
                          ? "border-blue-500 bg-blue-50/50"
                          : "border-slate-200 hover:border-slate-300"
                      )}>
                        <input
                          type="radio"
                          name="role"
                          value="editor"
                          checked={editRole === 'editor'}
                          onChange={() => setEditRole('editor')}
                          className="mt-0.5 sm:mt-1"
                        />
                        <div>
                          <p className="font-medium text-xs sm:text-sm text-slate-700">Éditeur</p>
                          <p className="text-[10px] sm:text-xs text-slate-500">Peut modifier et re-partager la réunion</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Transcript toggle */}
                  <div>
                    <label className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={editIncludeTranscript}
                        onChange={(e) => setEditIncludeTranscript(e.target.checked)}
                        className="mt-0.5 sm:mt-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                      />
                      <div>
                        <p className="font-medium text-xs sm:text-sm text-slate-700">Inclure la transcription</p>
                        <p className="text-[10px] sm:text-xs text-slate-500">Permet au destinataire d'accéder à la transcription complète</p>
                      </div>
                    </label>
                  </div>
                </CardContent>

                {/* Footer */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 flex gap-2 sm:gap-3">
                  <Button
                    onClick={() => {
                      setEditPermissionsOpen(false);
                      setEditPermissionsMessage(null);
                    }}
                    disabled={isUpdatingPermissions}
                    variant="outline"
                    className="flex-1 h-10 sm:h-11 rounded-xl text-xs sm:text-sm"
                  >
                    Annuler
                  </Button>
                  <Button
                    onClick={handleUpdatePermissions}
                    disabled={isUpdatingPermissions}
                    className="flex-1 h-10 sm:h-11 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm"
                  >
                    {isUpdatingPermissions ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 animate-spin" />
                        <span className="hidden sm:inline">Mise à jour...</span>
                        <span className="sm:hidden">...</span>
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SharesView;
