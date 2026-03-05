import apiClient from './apiClient';

export interface UserTemplateAssignment {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  has_template: boolean;
  assigned_at?: string;
}

export interface TemplateAssignmentResponse {
  template_id: string;
  template_name: string;
  is_system: boolean;
  user_assignments: UserTemplateAssignment[];
}

export interface TemplateUserAssignment {
  template_id: string;
  template_name: string;
  description?: string;
  is_system: boolean;
  assigned_at: string;
}

/**
 * Récupérer les attributions d'un template spécifique
 */
export const getTemplateAssignments = async (templateId: string): Promise<TemplateAssignmentResponse> => {
  const response = await apiClient.get<TemplateAssignmentResponse>(`/api/templates/${templateId}/assignments`);
  return response;
};

/**
 * Attribuer un template à un utilisateur
 */
export const assignTemplateToUser = async (templateId: string, userId: string): Promise<void> => {
  await apiClient.post(`/api/templates/${templateId}/assign/${userId}`);
};

/**
 * Retirer l'attribution d'un template à un utilisateur
 */
export const unassignTemplateFromUser = async (templateId: string, userId: string): Promise<void> => {
  await apiClient.delete(`/api/templates/${templateId}/unassign/${userId}`);
};

/**
 * Récupérer tous les templates attribués à un utilisateur
 */
export const getUserTemplates = async (userId: string): Promise<TemplateUserAssignment[]> => {
  const response = await apiClient.get<TemplateUserAssignment[]>(`/api/users/${userId}/templates`);
  return response;
};
