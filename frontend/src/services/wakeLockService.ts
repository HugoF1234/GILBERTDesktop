import { logger } from '@/utils/logger';
/**
 * Service Wake Lock pour empêcher le téléphone/ordinateur de se mettre en veille
 * pendant l'enregistrement audio
 */

class WakeLockService {
  private wakeLock: WakeLockSentinel | null = null;
  private isSupported: boolean = false;

  constructor() {
    // Vérifier si l'API Wake Lock est supportée
    this.isSupported = 'wakeLock' in navigator;
    
    if (this.isSupported) {
      logger.debug('✅ Wake Lock API supportée');
    } else {
      logger.warn('⚠️ Wake Lock API non supportée sur ce navigateur');
    }
  }

  /**
   * Active le Wake Lock pour empêcher la mise en veille
   */
  async acquire(): Promise<boolean> {
    if (!this.isSupported) {
      logger.warn('Wake Lock non disponible');
      return false;
    }

    try {
      // @ts-ignore - Wake Lock API peut ne pas être dans les types TypeScript
      this.wakeLock = await navigator.wakeLock.request('screen');
      
      logger.debug('🔒 Wake Lock activé - L\'appareil ne se mettra pas en veille');

      // Gérer la libération du wake lock (par exemple si l'onglet perd le focus)
      this.wakeLock.addEventListener('release', () => {
        logger.debug('🔓 Wake Lock libéré');
      });

      return true;
    } catch (error) {
      logger.error('❌ Erreur activation Wake Lock:', error);
      return false;
    }
  }

  /**
   * Libère le Wake Lock (permet la mise en veille)
   */
  async release(): Promise<void> {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
        this.wakeLock = null;
        logger.debug('🔓 Wake Lock libéré manuellement');
      } catch (error) {
        logger.error('❌ Erreur libération Wake Lock:', error);
      }
    }
  }

  /**
   * Réacquiert le Wake Lock si l'onglet revient au premier plan
   * Utile car le Wake Lock est automatiquement libéré quand l'onglet perd le focus
   */
  async reacquireIfNeeded(): Promise<void> {
    if (this.isSupported && !this.wakeLock) {
      await this.acquire();
    }
  }

  /**
   * Vérifie si le Wake Lock est actuellement actif
   */
  isActive(): boolean {
    return this.wakeLock !== null;
  }

  /**
   * Vérifie si l'API est supportée par le navigateur
   */
  isSupportedByBrowser(): boolean {
    return this.isSupported;
  }
}

// Instance singleton
export const wakeLockService = new WakeLockService();

