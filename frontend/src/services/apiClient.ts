import { logger } from '@/utils/logger';

// Base URL for API calls - utilise VITE_API_BASE_URL pour le développement local
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh';

/**
 * Convertit une URL de logo/image (relative ou absolue) en URL complète vers le backend.
 * Utile pour les logos d'organisation, de template, etc. uploadés via l'API.
 */
export function getAssetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const base = API_BASE_URL.replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

// Classe d'erreur personnalisée pour les erreurs réseau (offline)
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

// Fonction pour vérifier si on est offline
export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

// Fonction pour récupérer le token d'authentification
function getAuthToken() {
  return localStorage.getItem('auth_token');
}

interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  cache?: RequestCache;
  ignoreError?: boolean; // Option pour ignorer les erreurs de connexion
}

interface ApiClient {
  get<T>(endpoint: string, withAuth?: boolean, options?: RequestOptions): Promise<T>;
  post<T>(endpoint: string, data?: any, withMultipart?: boolean, withAuth?: boolean, options?: RequestOptions): Promise<T>;
  put<T>(endpoint: string, data?: any, withAuth?: boolean, options?: RequestOptions): Promise<T>;
  patch<T>(endpoint: string, data?: any, withAuth?: boolean, options?: RequestOptions): Promise<T>;
  delete<T>(endpoint: string, withAuth?: boolean, options?: RequestOptions): Promise<T>;
}

/**
 * Generic request function that handles authentication and error handling
 */
async function request<T>(
  endpoint: string,
  method: string,
  data?: any,
  withMultipart = false,
  withAuth = true,
  options: RequestOptions = {}
): Promise<T> {
  try {
    // Check if we had a recent connection error
    // Réinitialiser l'état d'erreur précédent pour permettre de nouveaux essais
    localStorage.removeItem('lastConnectionErrorTime');
    
    // Code commenté pour éviter le mécanisme de blocage des requêtes
    /*
    const lastConnectionErrorTimeStr = localStorage.getItem('lastConnectionErrorTime');
    if (lastConnectionErrorTimeStr) {
      const lastErrorTime = parseInt(lastConnectionErrorTimeStr);
      const now = Date.now();
      const timeSinceLastError = now - lastErrorTime;
      
      // Si l'erreur est très récente (moins de 5 secondes), attendre avant de réessayer
      // pour éviter trop de requêtes en échec rapprochées
      if (timeSinceLastError < 5000) {
        logger.debug(`Skipping API call due to recent connection error (${Math.round(timeSinceLastError / 1000)}s ago)`);
        throw new Error(`Network connection error: Cannot connect to backend server at ${API_BASE_URL}. Please ensure the server is running.`);
      } else {
        // Pour toute erreur plus ancienne, on réessaie quand même
        // mais on garde l'info pour le log
        logger.debug('Recent connection error detected, but trying again...');
        
        // Si plus de 30 secondes se sont écoulées, on supprime l'état d'erreur
        if (timeSinceLastError > 30000) {
          localStorage.removeItem('lastConnectionErrorTime');
        }
      }
    }
    */
    
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: HeadersInit = {};
  
    // Add authentication header if required and token exists
    if (withAuth) {
      const token = getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  
    // Set content type header based on whether we're sending multipart form data
    // IMPORTANT: NE PAS définir Content-Type pour FormData, fetch le fera automatiquement avec le boundary
    if (!withMultipart && data && !(data instanceof FormData) && !(data instanceof URLSearchParams)) {
      headers['Content-Type'] = 'application/json';
    }
  
    // Add cache control to prevent caching
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';

    // Pour chaque requête, on combine les headers et options
    const requestOptions: RequestInit = {
      method,
      headers,
      body: data
        ? data instanceof FormData
          ? data
          : JSON.stringify(data)
        : undefined,
      signal: options.signal,
      cache: options.cache || 'no-store', // Par défaut, pas de cache
    };

    let timeoutId: number | undefined;
    
    // Si un timeout est spécifié et qu'il n'y a pas déjà un signal d'abort
    if (options.timeout && !options.signal) {
      const controller = new AbortController();
      requestOptions.signal = controller.signal;
      timeoutId = window.setTimeout(() => controller.abort(), options.timeout);
    }
    
    try {
      const response = await fetch(url, requestOptions);
      
      // En cas de succès, nettoyer le timeout si présent
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Cette vérification devrait être suffisante pour la plupart des cas d'erreur
      if (!response.ok) {
        // Gérer les erreurs d'authentification via la fonction centralisée
        // Ne pas rediriger si c'est une requête de login (pas de token attendu)
        const isLoginRequest = endpoint.includes('/auth/login');

        if ((response.status === 401 || response.status === 403) && !isLoginRequest && !options.ignoreError) {
          // Delegate to the centralized token validation in authService.
          // verifyTokenValidity() handles: check token, call /auth/me, logout+redirect if invalid.
          // Note: ignoreError is used by verifyTokenValidity itself to avoid infinite loops.
          const { verifyTokenValidity } = await import('./authService');
          const isValid = await verifyTokenValidity();

          if (!isValid) {
            // verifyTokenValidity already called logoutUser() and redirected to /auth
            return Promise.reject(new Error('Not authenticated'));
          }
        }

        try {
          // Try to parse error response as JSON
          const errorData = await response.text();

          try {
            const parsedError = JSON.parse(errorData);
            return Promise.reject(parsedError);
          } catch {
            return Promise.reject(new Error(`Request failed with status ${response.status}: ${errorData}`));
          }
        } catch {
          return Promise.reject(new Error(`Request failed with status ${response.status}`));
        }
      }
  
      // Check if the response is empty
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          return data as T;
        } catch (error) {
          logger.warn('Response was empty or not valid JSON');
          return {} as T;
        }
      } else {
        // For non-JSON responses
        if (response.status === 204) {
          // No content
          return {} as T;
        }
  
        const textData = await response.text();
        try {
          // Try to parse as JSON anyway
          return JSON.parse(textData) as T;
        } catch (error) {
          // If not parseable as JSON, return as is
          return textData as unknown as T;
        }
      }
    } catch (error) {
      // Gestion des erreurs réseau
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const connectionError = new Error(`Network connection error: Cannot connect to server.`);
        connectionError.name = 'NetworkConnectionError';
        localStorage.setItem('lastConnectionErrorTime', Date.now().toString());
        throw connectionError;
      }
      
      // Check if this is an authentication error (401 or "Not authenticated")
      // Ne pas traiter les erreurs de login comme des erreurs d'auth necessitant une redirection
      const isLoginRequest = endpoint.includes('/auth/login');
      const isAuthError = !isLoginRequest && (
        (error instanceof Error && error.message.includes('401')) ||
        (error && typeof error === 'object' && 'detail' in error &&
         (error as any).detail === 'Not authenticated')
      );

      if (isAuthError && !options.ignoreError) {
        // Delegate to the centralized token validation in authService.
        // verifyTokenValidity() handles: check token, call /auth/me, logout+redirect if invalid.
        // Note: ignoreError is used by verifyTokenValidity itself to avoid infinite loops.
        const { verifyTokenValidity } = await import('./authService');
        const isValid = await verifyTokenValidity();

        if (!isValid) {
          // verifyTokenValidity already called logoutUser() and redirected to /auth
          return Promise.reject(new Error('Not authenticated'));
        }
      }
      
      throw error;
    }
  } catch (error) {
    throw error;
  }
}

// Create API client with the request function
const apiClient: ApiClient & { baseUrl: string } = {
  get<T>(endpoint: string, withAuth = true, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'GET', undefined, false, withAuth, options);
  },
  post<T>(endpoint: string, data?: any, withMultipart = false, withAuth = true, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'POST', data, withMultipart, withAuth, options);
  },
  put<T>(endpoint: string, data?: any, withAuth = true, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'PUT', data, false, withAuth, options);
  },
  patch<T>(endpoint: string, data?: any, withAuth = true, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'PATCH', data, false, withAuth, options);
  },
  delete<T>(endpoint: string, withAuth = true, options?: RequestOptions): Promise<T> {
    return request<T>(endpoint, 'DELETE', undefined, false, withAuth, options);
  },
  baseUrl: API_BASE_URL
};

export default apiClient;
