import apiClient from './apiClient';

export interface Template {
  id: string;
  name: string;
  description?: string;
  content: string;
  preview?: string;
  logo_url?: string;
  layout_config?: any;
  is_system: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  is_default?: boolean;
  assigned_at?: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  content: string;
  preview?: string;
  logo_url?: string;
  layout_config?: any;
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  content?: string;
  preview?: string;
  logo_url?: string;
  layout_config?: any;
}

export interface TemplatePreview {
  id: string;
  name: string;
  description?: string;
  is_system: boolean;
  is_default: boolean;
  content_preview: string;
}

export interface TemplateListResponse {
  templates: Template[];
  default_template_id?: string;
}

/**
 * Récupérer tous les templates de l'utilisateur connecté
 */
export const getMyTemplates = async (): Promise<TemplateListResponse> => {
  const response = await apiClient.get<TemplateListResponse>('/api/templates/');
  return response;
};

/**
 * Récupérer un aperçu de tous les templates de l'utilisateur
 */
export const getTemplatesPreview = async (): Promise<TemplatePreview[]> => {
  const response = await apiClient.get<TemplatePreview[]>('/api/templates/preview');
  return response;
};

/**
 * Récupérer un template spécifique
 */
export const getTemplate = async (templateId: string): Promise<Template> => {
  const response = await apiClient.get<Template>(`/api/templates/${templateId}`);
  return response;
};

/**
 * Créer un nouveau template personnalisé
 */
export const createTemplate = async (templateData: TemplateCreate): Promise<Template> => {
  const response = await apiClient.post<Template>('/api/templates/', templateData);
  return response;
};

/**
 * Mettre à jour un template personnalisé
 */
export const updateTemplate = async (
  templateId: string, 
  templateData: TemplateUpdate
): Promise<Template> => {
  const response = await apiClient.put<Template>(`/api/templates/${templateId}`, templateData);
  return response;
};

/**
 * Supprimer un template personnalisé
 */
export const deleteTemplate = async (templateId: string): Promise<void> => {
  await apiClient.delete(`/api/templates/${templateId}`);
};

/**
 * Définir un template comme défaut pour l'utilisateur
 */
export const setDefaultTemplate = async (templateId: string): Promise<void> => {
  await apiClient.post(`/api/templates/${templateId}/set-default`);
};

/**
 * Récupérer le template par défaut actuel de l'utilisateur
 */
export const getCurrentDefaultTemplate = async (): Promise<Template> => {
  const response = await apiClient.get<Template>('/api/templates/default/current');
  return response;
};

/**
 * Uploader un logo pour un template
 */
export const uploadTemplateLogo = async (
  templateId: string,
  file: File
): Promise<{ message: string; logo_url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await apiClient.post<{ message: string; logo_url: string }>(
    `/api/templates/${templateId}/upload-logo`,
    formData,
    true, // withMultipart = true
    true  // withAuth = true
  );
  return response;
};
