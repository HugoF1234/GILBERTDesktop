/**
 * Service pour la gestion des emails (vérification et récupération de mot de passe)
 */

import apiClient from './apiClient';
import { logger } from '@/utils/logger';

export interface SendVerificationCodeRequest {
  email: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
}

export interface EmailVerificationResponse {
  success: boolean;
  message: string;
  email_verified?: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export interface PasswordResetResponse {
  success: boolean;
  message: string;
}

class EmailService {
  /**
   * Envoie un code de vérification à 6 chiffres par email
   */
  async sendVerificationCode(email: string): Promise<EmailVerificationResponse> {
    try {
      const response = await apiClient.post('/auth/send-verification-code', {
        email
      }, false, false); // withMultipart=false, withAuth=false
      return response;
    } catch (error: any) {
      logger.error('Erreur lors de l\'envoi du code de vérification:', error);
      throw new Error(
        error.response?.data?.message || 
        'Erreur lors de l\'envoi du code de vérification'
      );
    }
  }

  /**
   * Vérifie un code de vérification d'email
   */
  async verifyEmail(email: string, code: string): Promise<EmailVerificationResponse> {
    try {
      const response = await apiClient.post('/auth/verify-email', {
        email,
        code
      }, false, false); // withMultipart=false, withAuth=false
      return response;
    } catch (error: any) {
      logger.error('Erreur lors de la vérification de l\'email:', error);
      throw new Error(
        error.response?.data?.message || 
        'Erreur lors de la vérification de l\'email'
      );
    }
  }

  /**
   * Demande une réinitialisation de mot de passe
   */
  async forgotPassword(email: string): Promise<PasswordResetResponse> {
    try {
      const response = await apiClient.post('/auth/forgot-password', {
        email
      }, false, false); // withMultipart=false, withAuth=false
      return response;
    } catch (error: any) {
      logger.error('Erreur lors de la demande de réinitialisation:', error);
      throw new Error(
        error.response?.data?.message || 
        'Erreur lors de la demande de réinitialisation'
      );
    }
  }

  /**
   * Réinitialise le mot de passe avec un token
   */
  async resetPassword(token: string, newPassword: string): Promise<PasswordResetResponse> {
    try {
      const response = await apiClient.post('/auth/reset-password', {
        token,
        new_password: newPassword
      }, false, false); // withMultipart=false, withAuth=false
      return response;
    } catch (error: any) {
      logger.error('Erreur lors de la réinitialisation du mot de passe:', error);
      throw new Error(
        error.response?.data?.message || 
        'Erreur lors de la réinitialisation du mot de passe'
      );
    }
  }
}

export default new EmailService();
