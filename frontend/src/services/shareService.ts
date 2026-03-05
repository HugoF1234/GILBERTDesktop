/**
 * Service pour la gestion des partages de réunions
 */
import apiClient from './apiClient';
import { formatImageUrl } from './profileService';
import { logger } from '@/utils/logger';

export interface ShareIdResponse {
  share_id: string;
}

export interface VerifyShareIdRequest {
  share_id: string;
}

export interface VerifyShareIdResponse {
  exists: boolean;
  user_name?: string;
  user_id?: string;
}

// Types de rôles pour le partage
export type ShareRole = 'reader' | 'editor';

export interface ShareMeetingRequest {
  share_id: string;
  role?: ShareRole;
  include_transcript?: boolean;
  // Legacy: garder pour rétrocompatibilité
  permissions?: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
    role?: ShareRole;
    can_edit?: boolean;
    can_share?: boolean;
    can_regenerate?: boolean;
  };
}

export interface ShareMeetingResponse {
  success: boolean;
  shared_with: string;
  shared_with_id: string;
  share_id_used: string;
}

export interface MeetingShareInfo {
  id: string;
  meeting_id: string;
  owner_id: string;
  shared_with_user_id: string;
  shared_with_share_id?: string | null;
  shared_with_email?: string | null;
  shared_with_identifier?: string | null;
  shared_with_name: string;
  shared_at: string;
  permissions: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
    role?: ShareRole;
    can_edit?: boolean;
    can_share?: boolean;
    can_regenerate?: boolean;
  };
  role?: ShareRole;
  is_active: boolean;
}

export interface RevokeMeetingShareResponse {
  success: boolean;
  message: string;
}

export interface OutgoingShareRecord {
  share_id: string;
  meeting_id: string;
  meeting_title?: string | null;
  meeting_created_at?: string | null;
  meeting_duration_seconds?: number | null;
  meeting_summary_status?: string | null;
  shared_at: string;
  permissions: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
  };
}

export interface OutgoingShareHistoryEntry {
  contact_user_id: string;
  contact_name: string;
  contact_email?: string | null;
  contact_share_id?: string | null;
  contact_profile_picture?: string | null;
  profile_picture_url?: string | null;
  share_count: number;
  last_shared_at?: string | null;
  shares: OutgoingShareRecord[];
}

export interface SharedMeeting {
  id: string;
  title?: string;
  name?: string;
  created_at: string;
  shared_at?: string;
  shared_by?: string;  // Name of owner from backend
  shared_by_email?: string;
  owner_name?: string;
  owner_id?: string;
  user_id?: string;
  permissions?: MeetingShareInfo['permissions'] | string;  // Can be string (JSON) or object
  role?: ShareRole;  // Role can be at top level or inside permissions
  transcript_status?: string;
  summary_status?: string;
  summary_text?: string;
  duration?: number;
  duration_seconds?: number;
  speakers_count?: number;
}

/**
 * Récupère le share_id de l'utilisateur connecté
 */
export async function getMyShareId(): Promise<ShareIdResponse> {
  try {
    logger.debug('📤 Récupération du share_id...');
    const response = await apiClient.get<ShareIdResponse>('/api/me/share-id', true);
    logger.debug('✅ Share_id récupéré:', response.share_id);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la récupération du share_id:', error);
    throw error;
  }
}

/**
 * Vérifie si un share_id existe
 */
export async function verifyShareId(shareId: string): Promise<VerifyShareIdResponse> {
  try {
    logger.debug('📤 Vérification du share_id:', shareId);
    const response = await apiClient.post<VerifyShareIdResponse>(
      '/api/verify-share-id',
      { share_id: shareId },
      false, // withMultipart
      true   // withAuth
    );
    logger.debug('✅ Vérification:', response);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la vérification du share_id:', error);
    throw error;
  }
}

/**
 * Partage une réunion avec un utilisateur via son share_id
 * @param meetingId - ID de la réunion à partager
 * @param shareId - Share ID du destinataire
 * @param role - Rôle du destinataire ('reader' ou 'editor')
 * @param includeTranscript - Inclure la transcription dans le partage
 */
export async function shareMeeting(
  meetingId: string,
  shareId: string,
  role: ShareRole = 'reader',
  includeTranscript: boolean = false
): Promise<ShareMeetingResponse> {
  try {
    logger.debug('📤 Partage de la réunion:', meetingId, 'avec:', shareId, 'rôle:', role);
    const requestBody = {
      share_id: shareId,
      role: role,
      include_transcript: includeTranscript
    };
    
    const response = await apiClient.post<ShareMeetingResponse>(
      `/api/meetings/${meetingId}/share`,
      requestBody,
      false, // withMultipart
      true   // withAuth
    );
    logger.debug('✅ Réunion partagée:', response);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors du partage de la réunion:', error);
    throw error;
  }
}

/**
 * Récupère la liste des utilisateurs avec qui une réunion est partagée
 */
export async function getMeetingShares(meetingId: string): Promise<MeetingShareInfo[]> {
  try {
    logger.debug('📤 Récupération des partages pour la réunion:', meetingId);
    const response = await apiClient.get<MeetingShareInfo[]>(
      `/api/meetings/${meetingId}/shares`,
      true // withAuth
    );
    logger.debug('✅ Partages récupérés:', response.length);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la récupération des partages:', error);
    throw error;
  }
}

/**
 * Récupère l'historique complet des partages sortants pour l'utilisateur connecté
 */
export async function getOutgoingShareHistory(): Promise<OutgoingShareHistoryEntry[]> {
  try {
    logger.debug('📤 [shareService] Récupération de l\'historique des partages sortants...');
    const response = await apiClient.get<OutgoingShareHistoryEntry[]>(
      '/api/me/shares/history',
      true
    );
    logger.debug('✅ [shareService] Historique récupéré:', response.length);
    return response.map(entry => {
      const rawPictureUrl = entry.contact_profile_picture || entry.profile_picture_url || null;
      return {
        ...entry,
        contact_profile_picture: formatImageUrl(rawPictureUrl)
      };
    });
  } catch (error) {
    logger.error('❌ [shareService] Erreur lors de la récupération de l\'historique des partages:', error);
    throw error;
  }
}

/**
 * Récupère les réunions partagées avec l'utilisateur connecté
 */
export async function getSharedMeetings(): Promise<SharedMeeting[]> {
  try {
    logger.debug('📤 Récupération des réunions partagées...');
    const response = await apiClient.get<SharedMeeting[]>(
      '/api/meetings/shared-with-me',
      true // withAuth
    );
    logger.debug('✅ Réunions partagées récupérées:', response.length);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la récupération des réunions partagées:', error);
    throw error;
  }
}

/**
 * Révoque un partage de réunion
 */
export async function revokeMeetingShare(
  meetingId: string,
  sharedWithUserId: string
): Promise<RevokeMeetingShareResponse> {
  try {
    logger.debug('📤 Révocation du partage:', meetingId, 'user:', sharedWithUserId);
    const response = await apiClient.delete<RevokeMeetingShareResponse>(
      `/api/meetings/${meetingId}/shares/${sharedWithUserId}`,
      true // withAuth
    );
    logger.debug('✅ Partage révoqué:', response);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la révocation du partage:', error);
    throw error;
  }
}

/**
 * Met à jour les permissions d'un partage existant
 * Comme il n'y a pas d'endpoint PUT, on révoque et recrée le partage
 */
export async function updateMeetingShare(
  meetingId: string,
  sharedWithUserId: string,
  sharedWithShareId: string,
  role: ShareRole = 'reader',
  includeTranscript: boolean = false
): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Révoquer le partage existant
    await revokeMeetingShare(meetingId, sharedWithUserId);

    // 2. Recréer le partage avec les nouvelles permissions
    await shareMeeting(meetingId, sharedWithShareId, role, includeTranscript);

    return { success: true, message: 'Permissions mises à jour avec succès' };
  } catch (error) {
    logger.error('Erreur lors de la mise à jour du partage:', error);
    throw error;
  }
}

// Interface pour un contact
export interface Contact {
  id: string;
  contact_user_id: string;
  contact_name: string;
  contact_share_id: string;
  contact_email?: string | null;
  contact_profile_picture?: string | null;
  profile_picture_url?: string | null;
  last_shared_at: string | null;
  last_received_at?: string | null;
  last_interaction_at?: string | null;
  share_count: number;
  received_count?: number;
  total_interactions?: number;
  last_direction?: 'incoming' | 'outgoing' | 'unknown';
  created_at: string | null;
}

/**
 * Récupère les contacts de l'utilisateur connecté
 */
export async function getMyContacts(): Promise<Contact[]> {
  try {
    logger.debug('📤 [shareService] Début récupération des contacts...');
    logger.debug('📤 [shareService] URL:', '/api/me/contacts');
    const response = await apiClient.get<Contact[]>(
      '/api/me/contacts',
      true // withAuth
    );
    logger.debug('✅ [shareService] Response brute:', response);
    logger.debug('✅ [shareService] Type de response:', typeof response);
    logger.debug('✅ [shareService] IsArray:', Array.isArray(response));
    logger.debug('✅ [shareService] Longueur:', Array.isArray(response) ? response.length : 'N/A');
    return response.map(contact => {
      const rawPictureUrl = contact.contact_profile_picture || contact.profile_picture_url || null;
      return {
        ...contact,
        contact_profile_picture: formatImageUrl(rawPictureUrl)
      };
    });
  } catch (error: any) {
    logger.error('❌ [shareService] Erreur complète:', error);
    logger.error('❌ [shareService] Error.response:', error?.response);
    logger.error('❌ [shareService] Error.status:', error?.response?.status);
    logger.error('❌ [shareService] Error.data:', error?.response?.data);
    throw error;
  }
}

/**
 * Supprime un contact de la liste
 */
export async function removeContact(contactUserId: string): Promise<{ success: boolean; message: string }> {
  try {
    logger.debug('📤 Suppression du contact:', contactUserId);
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/api/me/contacts/${contactUserId}`,
      true // withAuth
    );
    logger.debug('✅ Contact supprimé:', response);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors de la suppression du contact:', error);
    throw error;
  }
}

/**
 * Ajoute un contact via son share_id
 */
export async function addContactByShareId(shareId: string): Promise<{ success: boolean; message: string; contact?: Contact }> {
  return apiClient.post<{ success: boolean; message: string; contact?: Contact }>(
    '/api/me/contacts',
    { share_id: shareId },
    false,
    true
  );
}

/**
 * Retire une réunion partagée de l'espace de l'utilisateur
 * (Ne supprime pas la réunion originale, juste le partage pour cet utilisateur)
 */
export async function removeSharedMeetingFromMySpace(meetingId: string): Promise<{ success: boolean; message: string }> {
  try {
    logger.debug('📤 Retrait de la réunion partagée de mon espace:', meetingId);
    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/api/meetings/${meetingId}/remove-from-my-space`,
      true // withAuth
    );
    logger.debug('✅ Réunion retirée:', response);
    return response;
  } catch (error) {
    logger.error('❌ Erreur lors du retrait de la réunion partagée:', error);
    throw error;
  }
}

/**
 * Helper pour obtenir les permissions basées sur le rôle
 */
export function getRolePermissions(role: ShareRole, includeTranscript: boolean = false) {
  const base = {
    can_view: true,
    can_export: true,
    include_transcript: includeTranscript,
    role: role,
  };

  if (role === 'editor') {
    return {
      ...base,
      can_edit: true,
      can_share: true,
      can_regenerate: false,
    };
  }
  
  // Reader
  return {
    ...base,
    can_edit: false,
    can_share: false,
    can_regenerate: false,
  };
}

