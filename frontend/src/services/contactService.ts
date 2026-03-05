/**
 * Service pour l'envoi d'emails de contact via Brevo (backend)
 */

import apiClient from './apiClient';
import { logger } from '@/utils/logger';

export interface ContactFormData {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message: string;
  categories?: string[];
  subject?: string;
}

export interface ContactResponse {
  success: boolean;
  message: string;
}

/**
 * Envoie un email de contact via le backend (Brevo)
 */
export async function sendContactEmail(data: ContactFormData): Promise<ContactResponse> {
  try {
    const response = await apiClient.post<ContactResponse>('/api/contact/send', {
      name: data.name,
      email: data.email,
      company: data.company || '',
      phone: data.phone || '',
      message: data.message,
      categories: data.categories || [],
      subject: data.subject || 'Demande de modèle de synthèse personnalisé',
    }, false, false);

    return response;
  } catch (error) {
    logger.error('Erreur lors de l\'envoi du mail de contact:', error);
    // Fallback: ouvrir le client mail si le backend échoue
    throw error;
  }
}

/**
 * Fallback: ouvre le client mail avec les données pré-remplies
 */
export function openMailClient(data: ContactFormData): void {
  const categories = data.categories?.join(', ') || 'Non spécifiées';

  const mailBody = `
Bonjour,

Je souhaite obtenir des informations sur vos modèles de synthèse personnalisés.

Nom: ${data.name}
Email: ${data.email}
Entreprise: ${data.company || 'Non renseigné'}
Téléphone: ${data.phone || 'Non renseigné'}

Catégories d'intérêt: ${categories}

Message:
${data.message}

Cordialement,
${data.name}
  `.trim();

  window.open(
    `mailto:contact@lexiapro.fr?subject=${encodeURIComponent(data.subject || 'Demande de modèle de synthèse personnalisé')}&body=${encodeURIComponent(mailBody)}`,
    '_blank'
  );
}
