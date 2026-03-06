import apiClient, { API_BASE_URL } from './apiClient';
import { logger } from '@/utils/logger';

// Interface pour les données de profil
export interface ProfileData {
  id: string;
  email: string;
  full_name: string;
  profile_picture_url: string | null;
  created_at: string;
}

// Interface pour le statut Discovery
export interface DiscoveryStatus {
  subscription_plan: string;
  minutes_total: number;
  minutes_used: number;
  minutes_remaining: number;
  percentage_used: number;
  can_view_transcript: boolean;
}

/**
 * Formate l'URL d'une image si nécessaire
 * Si l'URL est relative, on utilise l'URL de base de l'API
 * Ajoute un cache-buster pour forcer le rafraîchissement de l'image
 */
export function formatImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  let fullUrl: string;
  
  logger.debug(`Formatage de l'URL d'image - URL originale: ${url}, API_BASE_URL: ${API_BASE_URL}`);
  
  // Si l'URL est déjà absolue (commence par http:// ou https://), la retourner telle quelle
  if (url.startsWith('http://') || url.startsWith('https://')) {
    fullUrl = url;
    logger.debug('URL déjà absolue, pas de transformation nécessaire');
  } else {
    // Pour les URLs relatives, utiliser l'URL de base de l'API
    const apiBaseUrl = API_BASE_URL;
    
    // Assurer que nous n'avons pas de barres obliques en double
    if (url.startsWith('/') && apiBaseUrl.endsWith('/')) {
      fullUrl = `${apiBaseUrl}${url.substring(1)}`;
    } else if (!url.startsWith('/') && !apiBaseUrl.endsWith('/')) {
      // Gérer le cas où apiBaseUrl n'a pas de barre oblique finale et url n'a pas de barre initiale
      fullUrl = `${apiBaseUrl}/${url}`;
    } else {
      fullUrl = `${apiBaseUrl}${url}`;
    }
    logger.debug(`URL relative transformée: ${url} -> ${fullUrl}`);
  }
  
  logger.debug(`Image URL finale: ${fullUrl}`);

  return fullUrl;
}

/**
 * Formate les données de profil pour s'assurer que l'URL de l'image est absolue
 */
function formatProfileData(data: ProfileData): ProfileData {
  return {
    ...data,
    profile_picture_url: formatImageUrl(data.profile_picture_url)
  };
}

/**
 * Get the current user's profile information
 */
export async function getUserProfile(): Promise<ProfileData> {
  // Utilise le point d'entrée décrit dans la documentation API
  const data = await apiClient.get<ProfileData>('/profile/me');
  return formatProfileData(data);
}

/**
 * Update the user's profile information
 */
export async function updateUserProfile(data: {
  full_name?: string;
  email?: string;
}): Promise<ProfileData> {
  // Ne pas envoyer l'email: il est fixé à l'inscription / OAuth et non modifiable ici
  const { full_name } = data || {};
  const payload: { full_name?: string } = {};
  if (typeof full_name === 'string') payload.full_name = full_name;

  const response = await apiClient.put<ProfileData>('/profile/update', payload);
  return formatProfileData(response);
}

/**
 * Upload a new profile picture
 */
export async function uploadProfilePicture(file: File): Promise<ProfileData> {
  const formData = new FormData();
  
  // Utiliser le nom de champ "file" comme attendu par l'API
  formData.append('file', file);
  
  logger.debug(`Préparation de l'upload de l'image: ${file.name}, taille: ${file.size} bytes, type: ${file.type}`);
  
  // Utilise le point d'entrée décrit dans la documentation API
  // withMultipart = true pour que le navigateur ajoute le boundary Content-Type automatiquement
  const response = await apiClient.post<ProfileData>(
    '/profile/upload-picture',
    formData,
    true, // with multipart
    true  // with auth
  );
  
  // Log de la réponse pour déboguer
  logger.debug('Réponse brute du serveur après upload:', response);
  
  // Formater l'URL de l'image si nécessaire
  const formattedProfile = formatProfileData(response);
  logger.debug('Profil formatté avec cache-buster:', formattedProfile);

  return formattedProfile;
}

/**
 * Get the user's Discovery status (minutes usage)
 */
export async function getDiscoveryStatus(): Promise<DiscoveryStatus> {
  const data = await apiClient.get<DiscoveryStatus>('/profile/discovery');
  return data;
}

// Interface pour les données du questionnaire d'onboarding
export interface OnboardingQuestionnaireData {
  phone_country_code: string;
  phone: string;
  usage: string;
  status: string;
  company_name?: string | null;
  activity_sector?: string | null;
  discovery_source: string;
  cgu_accepted: boolean;
}

// Interface pour le statut d'onboarding
export interface OnboardingStatus {
  onboarding_completed: boolean;
  cgu_accepted: boolean;
}

/**
 * Save the onboarding questionnaire data
 */
export async function saveOnboardingQuestionnaire(data: OnboardingQuestionnaireData): Promise<ProfileData> {
  const response = await apiClient.put<ProfileData>('/profile/onboarding-questionnaire', data);
  return formatProfileData(response);
}

/**
 * Get the user's onboarding status
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const data = await apiClient.get<OnboardingStatus>('/profile/onboarding-status');
  return data;
}

/**
 * Change the user's password
 * @param currentPassword Current password
 * @param newPassword New password
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return apiClient.put<{ message: string }>('/profile/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

// Interface pour les mots de vocabulaire personnalisé (context_bias / Word Boost)
export interface ContextBiasWords {
  words: string[];
  count: number;
  max_words: number;
  message?: string;
}

/**
 * Get the user's context bias words (custom vocabulary for Voxtral transcription)
 */
export async function getContextBiasWords(): Promise<ContextBiasWords> {
  return apiClient.get<ContextBiasWords>('/profile/context-bias-words');
}

/**
 * Update the user's context bias words
 * @param words Array of words to use for context bias (max 100)
 */
export async function updateContextBiasWords(words: string[]): Promise<ContextBiasWords> {
  return apiClient.put<ContextBiasWords>('/profile/context-bias-words', { words });
}
