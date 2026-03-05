/**
 * Service de monitoring de la connexion réseau
 * Vérifie régulièrement la connexion et notifie l'application en cas de problème
 */

// Import API_BASE_URL directly to avoid circular dependencies
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh';

export type ConnectionStatus = 'online' | 'offline' | 'checking';

interface ConnectionMonitorOptions {
  checkInterval?: number; // Intervalle de vérification en ms (défaut: 10000 = 10s)
  onStatusChange?: (status: ConnectionStatus) => void;
}

class ConnectionMonitorService {
  private status: ConnectionStatus = 'online';
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval: number = 10000; // 10 secondes par défaut
  private onStatusChangeCallback?: (status: ConnectionStatus) => void;
  private consecutiveFailures: number = 0;
  private readonly MAX_FAILURES_BEFORE_OFFLINE = 5; // Plus tolérant : 5 échecs avant de marquer offline (évite les faux positifs)

  /**
   * Démarre le monitoring de connexion
   */
  start(options: ConnectionMonitorOptions = {}): void {
    if (this.intervalId) {
      // Arrêter l'ancien monitoring avant de redémarrer
      this.stop();
    }

    this.checkInterval = options.checkInterval || 10000;
    this.onStatusChangeCallback = options.onStatusChange;

    // Vérification initiale
    this.checkConnection();

    // Vérification périodique
    this.intervalId = setInterval(() => {
      this.checkConnection();
    }, this.checkInterval);

    // Écouter les événements natifs du navigateur
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  /**
   * Arrête le monitoring de connexion
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);

    // Réinitialiser les échecs consécutifs quand on arrête
    this.consecutiveFailures = 0;
    // Ne pas réinitialiser le statut - le garder tel quel pour la prochaine fois
  }

  /**
   * Vérifie la connexion en faisant un ping léger vers le serveur
   */
  private async checkConnection(): Promise<void> {
    // Si le navigateur dit qu'on est offline, pas besoin de tester
    if (!navigator.onLine) {
      this.updateStatus('offline');
      return;
    }

    try {
      // NE PAS mettre "checking" si on est déjà online - évite le flickering
      if (this.status === 'offline') {
        this.updateStatus('checking');
      }
      
      // Ping léger vers le serveur (endpoint health check)
      // Utiliser /api/health qui existe dans le backend
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Timeout court : 3s

      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
        },
        // Ne pas bloquer si l'endpoint n'existe pas ou est lent
        mode: 'cors',
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.consecutiveFailures = 0;
        this.updateStatus('online');
      } else {
        // Si le health check retourne une erreur mais que le navigateur dit qu'on est online,
        // ne pas compter comme échec immédiatement - peut être un problème temporaire
        this.handleFailure();
      }
    } catch (error) {
      // En cas d'erreur réseau, vérifier si c'est vraiment un problème
      // Ne pas compter comme échec si c'est juste une erreur d'abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        // Ne pas compter les timeouts comme échecs - peut être juste un réseau lent
        // Seulement compter si on a plusieurs timeouts consécutifs ET que navigator.onLine est false
        if (!navigator.onLine) {
          // Si le navigateur dit qu'on est offline, alors c'est vraiment offline
          this.updateStatus('offline');
        } else if (this.consecutiveFailures >= 3) {
          // Seulement après 3 timeouts consécutifs, on commence à compter
          this.handleFailure();
        }
        // Sinon, on ignore le timeout (réseau lent mais toujours connecté)
      } else if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        // Erreur réseau réelle - mais vérifier d'abord navigator.onLine
        if (!navigator.onLine) {
          // Le navigateur confirme qu'on est offline
          this.updateStatus('offline');
        }
        // Le navigateur dit qu'on est online, mais la requête échoue
        // Peut être un problème CORS ou endpoint inexistant - ne pas compter comme échec
      } else {
        // Autres erreurs - vérifier navigator.onLine d'abord
        if (!navigator.onLine) {
          this.updateStatus('offline');
        }
        // Ne pas compter comme échec si le navigateur dit qu'on est online
      }
    }
  }

  /**
   * Gère un échec de vérification
   */
  private handleFailure(): void {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_OFFLINE) {
      this.updateStatus('offline');
    }
  }

  /**
   * Met à jour le statut et notifie les callbacks
   */
  private updateStatus(newStatus: ConnectionStatus): void {
    if (newStatus !== this.status) {
      this.status = newStatus;

      if (this.onStatusChangeCallback) {
        this.onStatusChangeCallback(newStatus);
      }
    }
  }

  /**
   * Gestionnaire événement "online" du navigateur
   */
  private handleOnline = (): void => {
    this.consecutiveFailures = 0;
    this.checkConnection(); // Vérifier immédiatement
  };

  /**
   * Gestionnaire événement "offline" du navigateur
   */
  private handleOffline = (): void => {
    this.updateStatus('offline');
  };

  /**
   * Récupère le statut actuel
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Vérifie si on est actuellement online
   */
  isOnline(): boolean {
    return this.status === 'online';
  }

  /**
   * Force une vérification immédiate
   */
  async forceCheck(): Promise<ConnectionStatus> {
    await this.checkConnection();
    return this.status;
  }
}

// Instance singleton
export const connectionMonitor = new ConnectionMonitorService();

