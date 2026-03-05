/**
 * Service pour la gestion des dossiers
 */
import apiClient from './apiClient';

// ============================================
// Types
// ============================================

export type FolderRole = 'reader' | 'contributor' | 'admin';

export interface FolderPermissions {
  can_view: boolean;
  can_add_meetings: boolean;
  can_remove_meetings: boolean;
  can_rename: boolean;
  can_share: boolean;
  can_delete: boolean;
}

export interface Folder {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon: string;
  owner_id: string;
  owner_name?: string;
  parent_id?: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  meeting_count: number;
  is_shared: boolean;
  shared_by?: string;
  my_role?: FolderRole;
  my_permissions?: FolderPermissions;
}

export interface FolderMeetingInfo {
  id: string;
  meeting_id: string;
  title?: string;
  date?: string;
  duration_seconds?: number;
  summary_status?: string;
  added_at: string;
  added_by?: string;
}

export interface FolderShareInfo {
  id: string;
  folder_id: string;
  shared_with_user_id: string;
  shared_with_name: string;
  shared_with_email?: string;
  shared_with_share_id?: string;
  shared_with_profile_picture?: string;
  role: FolderRole;
  permissions: FolderPermissions;
  auto_share_new_meetings: boolean;
  shared_at: string;
  is_active: boolean;
}

export interface FolderDetail extends Folder {
  meetings: FolderMeetingInfo[];
  shares: FolderShareInfo[];
}

export interface CreateFolderRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  parent_id?: string | null;
}

export interface UpdateFolderRequest {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  is_archived?: boolean;
}

export interface ShareFolderRequest {
  share_id: string;
  role: FolderRole;
  auto_share_new_meetings?: boolean;
}

export interface ShareFolderResponse {
  success: boolean;
  folder_id: string;
  shared_with: string;
  shared_with_id: string;
  role: FolderRole;
}

// ============================================
// API Functions
// ============================================

/**
 * Crée un nouveau dossier
 */
export async function createFolder(data: CreateFolderRequest): Promise<Folder> {
  const response = await apiClient.post<Folder>('/api/folders', data);
  return response;
}

/**
 * Récupère tous les dossiers de l'utilisateur
 */
export async function getFolders(includeArchived: boolean = false): Promise<Folder[]> {
  try {
    // apiClient.get() retourne directement les données, pas un objet avec .data
    const response = await apiClient.get<{ folders: Folder[]; total: number }>('/api/folders', true, {
      params: { include_archived: includeArchived }
    });

    // L'API retourne FolderListResponse qui a { folders: [], total: number }
    if (response && response.folders && Array.isArray(response.folders)) {
      return response.folders;
    }

    // Fallback: si c'est directement un array
    if (Array.isArray(response)) {
      return response;
    }

    return [];
  } catch (error) {
    throw error;
  }
}

/**
 * Récupère les détails d'un dossier
 */
export async function getFolderDetails(folderId: string): Promise<FolderDetail> {
  const response = await apiClient.get<FolderDetail>(`/api/folders/${folderId}`);
  return response;
}

/**
 * Met à jour un dossier
 */
export async function updateFolder(folderId: string, data: UpdateFolderRequest): Promise<Folder> {
  const response = await apiClient.put<Folder>(`/api/folders/${folderId}`, data);
  return response;
}

/**
 * Supprime un dossier
 */
export async function deleteFolder(folderId: string): Promise<void> {
  await apiClient.delete(`/api/folders/${folderId}`);
}

/**
 * Ajoute une réunion à un dossier
 */
export async function addMeetingToFolder(folderId: string, meetingId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post<{ success: boolean; message: string }>(`/api/folders/${folderId}/meetings`, {
    meeting_id: meetingId
  });
  return response;
}

/**
 * Retire une réunion d'un dossier
 */
export async function removeMeetingFromFolder(folderId: string, meetingId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete<{ success: boolean; message: string }>(`/api/folders/${folderId}/meetings/${meetingId}`);
  return response;
}

/**
 * Récupère les réunions d'un dossier
 */
export async function getFolderMeetings(folderId: string): Promise<FolderMeetingInfo[]> {
  const response = await apiClient.get<FolderMeetingInfo[]>(`/api/folders/${folderId}/meetings`);
  return response;
}

/**
 * Récupère les dossiers contenant une réunion
 */
export async function getMeetingFolders(meetingId: string): Promise<{ id: string; name: string; color: string }[]> {
  const response = await apiClient.get<{ id: string; name: string; color: string }[]>(`/api/folders/meeting/${meetingId}/folders`);
  return response;
}

/**
 * Partage un dossier avec un utilisateur
 */
export async function shareFolder(folderId: string, data: ShareFolderRequest): Promise<ShareFolderResponse> {
  const response = await apiClient.post<ShareFolderResponse>(`/api/folders/${folderId}/share`, data);
  return response;
}

/**
 * Révoque le partage d'un dossier
 */
export async function revokeFolderShare(folderId: string, sharedWithUserId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete<{ success: boolean; message: string }>(`/api/folders/${folderId}/share/${sharedWithUserId}`);
  return response;
}

/**
 * Récupère les partages d'un dossier
 */
export async function getFolderShares(folderId: string): Promise<FolderShareInfo[]> {
  const response = await apiClient.get<FolderShareInfo[]>(`/api/folders/${folderId}/shares`);
  return response;
}

/**
 * Retire un dossier partagé de son espace personnel
 */
export async function removeFolderFromMySpace(folderId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete<{ success: boolean; message: string }>(`/api/folders/${folderId}/remove-from-my-space`);
  return response;
}

// ============================================
// Couleurs prédéfinies pour les dossiers
// ============================================

export const FOLDER_COLORS = [
  { name: 'Bleu', value: '#3b82f6' },
  { name: 'Vert', value: '#10b981' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Jaune', value: '#eab308' },
  { name: 'Gris', value: '#6b7280' },
  { name: 'Indigo', value: '#6366f1' },
];

export const FOLDER_ICONS = [
  { name: 'Dossier', value: 'folder' },
  { name: 'Étoile', value: 'star' },
  { name: 'Travail', value: 'work' },
  { name: 'Client', value: 'person' },
  { name: 'Projet', value: 'assignment' },
  { name: 'Important', value: 'priority_high' },
  { name: 'Archive', value: 'archive' },
  { name: 'Favori', value: 'favorite' },
];

export default {
  createFolder,
  getFolders,
  getFolderDetails,
  updateFolder,
  deleteFolder,
  addMeetingToFolder,
  removeMeetingFromFolder,
  getFolderMeetings,
  getMeetingFolders,
  shareFolder,
  revokeFolderShare,
  getFolderShares,
  removeFolderFromMySpace,
  FOLDER_COLORS,
  FOLDER_ICONS,
};

