/**
 * Service pour gérer les organisations
 */
import apiClient from './apiClient';
import { logger } from '@/utils/logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gilbert.lexiapro.fr';

// ==================== Types ====================

export interface Organization {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  organization_code: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  member_count?: number;
  meeting_count?: number;
  role?: string;
  joined_at?: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  user_email: string;
  user_full_name?: string;
  user_profile_picture_url?: string;
  role: string;
  joined_at: string;
  is_active: boolean;
}

export interface OrganizationMeeting {
  id: string;
  organization_id: string;
  meeting_id: string;
  meeting_title: string;
  meeting_duration_seconds?: number;
  meeting_created_at: string;
  shared_by: string;
  shared_by_name?: string;
  shared_at: string;
  permissions: {
    can_view: boolean;
    can_export: boolean;
    include_transcript?: boolean;
  };
  is_active: boolean;
  transcript_status?: string;
  summary_status?: string;
  summary_text?: string | null;
}

export interface OrganizationTemplate {
  id: string;
  organization_id: string;
  template_id: string;
  template_name: string;
  template_description?: string;
  template_logo_url?: string;
  assigned_by: string;
  assigned_at: string;
  is_active: boolean;
}

// ==================== CRUD Organisations (Admin uniquement) ====================

export async function createOrganization(formData: FormData): Promise<Organization> {
  const response = await apiClient.post<Organization>('/api/organizations', formData, true);
  return response;
}

export async function getAllOrganizations(): Promise<Organization[]> {
  logger.debug('📡 Calling GET /api/organizations...');
  const response = await apiClient.get<Organization[]>('/api/organizations');
  logger.debug('📡 Response:', response);
  logger.debug('📡 Response type:', typeof response);
  logger.debug('📡 Is array?', Array.isArray(response));
  return response;
}

export async function getUserOrganizationsAdmin(userId: string): Promise<Organization[]> {
  const response = await apiClient.get<Organization[]>(`/api/admin/users/${userId}/organizations`);
  return response;
}

export async function getOrganizationById(organizationId: string): Promise<Organization> {
  const response = await apiClient.get<Organization>(`/api/organizations/${organizationId}`);
  return response;
}

export async function updateOrganization(organizationId: string, formData: FormData): Promise<Organization> {
  const response = await apiClient.put<Organization>(`/api/organizations/${organizationId}`, formData, true);
  return response;
}

export async function deleteOrganization(organizationId: string): Promise<{ message: string }> {
  return await apiClient.delete<{ message: string }>(`/api/organizations/${organizationId}`);
}

// ==================== Gestion des membres (Admin uniquement) ====================

export async function addMemberToOrganization(organizationId: string, userId: string): Promise<OrganizationMember> {
  return await apiClient.post<OrganizationMember>(`/api/organizations/${organizationId}/members`, {
    user_id: userId,
  });
}

export async function addMemberToMyOrganization(organizationId: string, userId: string): Promise<OrganizationMember> {
  return await apiClient.post<OrganizationMember>(`/api/me/organizations/${organizationId}/members`, {
    user_id: userId,
  });
}

export async function removeMemberFromOrganization(organizationId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${organizationId}/members/${userId}`);
}

export async function getOrganizationMembers(organizationId: string): Promise<OrganizationMember[]> {
  return await apiClient.get<OrganizationMember[]>(`/api/organizations/${organizationId}/members`);
}

export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<{ message: string }> {
  return await apiClient.put<{ message: string }>(
    `/api/organizations/${organizationId}/members/${userId}/role?role=${role}`
  );
}

// ==================== Utilisateurs (rejoindre organisation) ====================

export async function joinOrganization(organizationCode: string): Promise<{ message: string; organization_id: string }> {
  return await apiClient.post<{ message: string; organization_id: string }>('/api/organizations/join', {
    organization_code: organizationCode,
  });
}

export async function createMyOrganization(formData: FormData): Promise<Organization> {
  const response = await apiClient.post<Organization>('/api/me/organizations', formData, true);
  return response;
}

export async function getMyOrganizations(): Promise<Organization[]> {
  return await apiClient.get<Organization[]>('/api/me/organizations');
}

// ==================== Partage de réunions avec organisation ====================

export async function shareMeetingWithOrganization(
  meetingId: string,
  organizationId: string,
  permissions?: { can_view: boolean; can_export: boolean; include_transcript?: boolean }
): Promise<{ message: string }> {
  return await apiClient.post<{ message: string }>(`/api/meetings/${meetingId}/share-organization`, {
    organization_id: organizationId,
    permissions,
  });
}

export async function getOrganizationMeetings(organizationId: string): Promise<OrganizationMeeting[]> {
  return await apiClient.get<OrganizationMeeting[]>(`/api/organizations/${organizationId}/meetings`);
}

// ==================== Assignation de templates à l'organisation (Admin uniquement) ====================

export async function assignTemplateToOrganization(
  organizationId: string,
  templateId: string
): Promise<OrganizationTemplate> {
  return await apiClient.post<OrganizationTemplate>(`/api/organizations/${organizationId}/templates`, {
    template_id: templateId,
  });
}

export async function getOrganizationTemplates(organizationId: string): Promise<OrganizationTemplate[]> {
  return await apiClient.get<OrganizationTemplate[]>(`/api/organizations/${organizationId}/templates`);
}

// ==================== Helper pour les URLs d'images ====================

export function getOrganizationLogoUrl(logoUrl?: string | null): string | undefined {
  if (!logoUrl) return undefined;
  if (logoUrl.startsWith('http')) return logoUrl;
  return `${API_BASE_URL}${logoUrl}`;
}

