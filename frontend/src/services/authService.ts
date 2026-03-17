import apiClient from './apiClient';
import { useDataStore } from '../stores/dataStore';
import { logger } from '@/utils/logger';

// Détecter si on est dans l'app desktop Tauri
function _isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  name?: string;
}

export interface RegisterParams {
  email: string;
  password: string;
  full_name?: string;
  name?: string; // compat UI
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface RegisterResponse {
  message: string;
  user: any;
  email_verification_required: boolean;
  email_sent?: boolean;
  verification_message?: string;
}

/* ─────────── Token auto-refresh ─────────── */

let _refreshTimerId: ReturnType<typeof setTimeout> | null = null;
let _refreshInFlight = false;

/**
 * Store token + metadata and schedule auto-refresh.
 * Called from every login/OAuth flow.
 */
function _storeTokenAndScheduleRefresh(accessToken: string, expiresIn: number): void {
  localStorage.setItem('auth_token', accessToken);
  localStorage.setItem('token_issued_at', Date.now().toString());
  localStorage.setItem('token_expires_in', expiresIn.toString());
  _scheduleRefresh(expiresIn);
}

/**
 * Schedule a silent token refresh at 75% of the token lifetime.
 * E.g. for an 8h token (28800s), refresh fires after 6h.
 */
function _scheduleRefresh(expiresInSeconds: number): void {
  _cancelRefresh();
  const delayMs = expiresInSeconds * 1000 * 0.75;
  _refreshTimerId = setTimeout(_doRefreshToken, delayMs);
}

function _cancelRefresh(): void {
  if (_refreshTimerId !== null) {
    clearTimeout(_refreshTimerId);
    _refreshTimerId = null;
  }
}

async function _doRefreshToken(): Promise<void> {
  if (_refreshInFlight || !isAuthenticated()) return;
  _refreshInFlight = true;
  try {
    const response = await apiClient.post<AuthResponse>(
      '/auth/refresh-token', undefined, false, true, { ignoreError: true }
    );
    if (response.access_token) {
      _storeTokenAndScheduleRefresh(response.access_token, response.expires_in);
      _invalidateCache(); // force re-validation with new token
      logger.debug('Token auto-refreshed');
    }
  } catch {
    // Refresh failed - token may have expired. Don't force logout here,
    // the next API call will trigger verifyTokenValidity if needed.
    logger.debug('Token auto-refresh failed, will retry on next API call');
  } finally {
    _refreshInFlight = false;
  }
}

/**
 * Resume token refresh scheduling on app startup.
 * Call this once when the app initialises (e.g. in App.tsx or main.tsx).
 */
export function initTokenRefresh(): void {
  if (!isAuthenticated()) return;
  const issuedAtStr = localStorage.getItem('token_issued_at');
  const expiresInStr = localStorage.getItem('token_expires_in');
  if (!issuedAtStr || !expiresInStr) return;

  const issuedAt = parseInt(issuedAtStr, 10);
  const expiresIn = parseInt(expiresInStr, 10);
  const elapsed = (Date.now() - issuedAt) / 1000;
  const remaining = expiresIn - elapsed;

  if (remaining <= 0) return; // token already expired, let normal 401 flow handle it

  const refreshAt = expiresIn * 0.75;
  if (elapsed >= refreshAt) {
    // Past 75% — refresh immediately
    _doRefreshToken();
  } else {
    // Schedule for the remaining time until 75%
    const delayMs = (refreshAt - elapsed) * 1000;
    _cancelRefresh();
    _refreshTimerId = setTimeout(_doRefreshToken, delayMs);
  }
}

/**
 * Register a new user
 */
export async function registerUser(params: RegisterParams): Promise<RegisterResponse> {
  // Adapter explicitement la charge utile attendue par le backend
  const payload = {
    email: params.email,
    password: params.password,
    full_name: params.full_name || params.name || ''
  };

  const response = await apiClient.post<RegisterResponse>(
    '/auth/register',
    payload,
    false,
    false  // Pas d'authentification requise pour l'inscription
  );

  // Note: L'inscription ne retourne plus de token JWT
  // L'utilisateur doit d'abord vérifier son email

  return response;
}

/**
 * Login an existing user
 */
export async function loginUser(params: LoginParams): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>('/auth/login/json', { email: params.username, password: params.password },
      false,
      false
    );
    
    // Store the token and schedule auto-refresh
    if (response.access_token) {
      _storeTokenAndScheduleRefresh(response.access_token, response.expires_in);
      // Nettoyer le cache des meetings après connexion (pour éviter les meetings d'un autre utilisateur)
      try {
        localStorage.removeItem('meeting-transcriber-meetings-cache');
      } catch {}
    }

    return response;
  } catch (error) {
    // Gérer spécifiquement les erreurs de connexion réseau
    if (error instanceof Error && error.name === 'NetworkConnectionError') {
      // Retirer toute erreur de connexion précédente après 30 secondes
      setTimeout(() => {
        localStorage.removeItem('lastConnectionErrorTime');
      }, 30000);
    }
    throw error;
  }
}

const USER_CACHE_KEY = 'gilbert_user_cache';

/**
 * Sauvegarde le profil utilisateur pour affichage offline
 */
export function cacheUserForOffline(user: User): void {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      _cachedAt: Date.now(),
    }));
  } catch { /* ignore */ }
}

/**
 * Récupère le profil utilisateur en cache (pour mode offline)
 */
export function getCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      id: parsed.id,
      username: parsed.username ?? parsed.email,
      email: parsed.email,
      name: parsed.name,
    };
  } catch {
    return null;
  }
}

/**
 * Get the current user's profile
 */
export async function getUserProfile(): Promise<User> {
  const user = await apiClient.get<User>('/auth/me');
  cacheUserForOffline(user);
  return user;
}

/**
 * Logout the current user
 */
export function logoutUser(): void {
  _cancelRefresh();
  localStorage.removeItem('auth_token');
  localStorage.removeItem('token_issued_at');
  localStorage.removeItem('token_expires_in');
  localStorage.removeItem(USER_CACHE_KEY);
  localStorage.removeItem('gilbert_profile_cache');
  // Purger le cache des meetings au logout
  try {
    localStorage.removeItem('meeting-transcriber-meetings-cache');
  } catch {}
  // Vider le store Zustand pour ne pas afficher les données de l'ancien compte
  useDataStore.getState().reset();
  // Reset the token validation cache so stale results don't persist
  _invalidateCache();
}

/**
 * Check if a user is currently logged in
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token');
}

/**
 * Centralized token validation - single source of truth for the entire app.
 *
 * Features:
 * - Checks if token exists in localStorage
 * - Verifies it with the backend (/auth/me endpoint)
 * - Returns true/false
 * - Handles network errors gracefully (returns true if offline - assume valid)
 * - Clears token + redirects to /auth if invalid
 * - Debounce guard: prevents multiple simultaneous validation calls
 * - 30-second cache: skips re-validation if recently verified
 */

// --- Internal state for debounce & caching ---
let _validationInFlight: Promise<boolean> | null = null;
let _lastValidationTime = 0;
let _lastValidationResult = false;
const VALIDATION_CACHE_TTL_MS = 30_000; // 30 seconds

export async function verifyTokenValidity(): Promise<boolean> {
  // 1. Quick check: token must exist
  if (!isAuthenticated()) {
    _invalidateCache();
    return false;
  }

  // 2. Return cached result if still fresh
  const now = Date.now();
  if (now - _lastValidationTime < VALIDATION_CACHE_TTL_MS) {
    return _lastValidationResult;
  }

  // 3. Debounce: if a validation call is already in flight, piggyback on it
  if (_validationInFlight) {
    return _validationInFlight;
  }

  // 4. Perform the actual validation
  _validationInFlight = _doVerifyToken();

  try {
    const result = await _validationInFlight;
    return result;
  } finally {
    _validationInFlight = null;
  }
}

async function _doVerifyToken(): Promise<boolean> {
  try {
    // Call /auth/me to verify token server-side
    await apiClient.get('/auth/me', true, { ignoreError: true });

    // If we get here, the token is valid
    _lastValidationTime = Date.now();
    _lastValidationResult = true;
    return true;
  } catch (error) {
    // Network errors (offline): assume token is still valid, don't logout
    if (
      (error instanceof Error && error.name === 'NetworkConnectionError') ||
      (error instanceof Error && error.message.includes('Failed to fetch')) ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    ) {
      // Don't update cache - we want to re-check once back online
      return true;
    }

    // Auth errors (401, 403, or explicit "Not authenticated"): token is invalid
    if (error instanceof Error && (
      error.message.includes('401') ||
      error.message.includes('403') ||
      error.message.includes('Not authenticated')
    )) {
      _handleInvalidToken();
      return false;
    }

    // Structured error object from API (e.g. { detail: "Not authenticated" })
    if (error && typeof error === 'object' && 'detail' in error) {
      _handleInvalidToken();
      return false;
    }

    // Unknown errors: assume invalid to be safe
    _handleInvalidToken();
    return false;
  }
}

/**
 * Handle an invalid token: clear storage and redirect to /auth.
 * Called exclusively from the centralized verifyTokenValidity flow.
 * Sur desktop Tauri, on ne déconnecte JAMAIS automatiquement — on laisse l'utilisateur
 * décider (pour éviter de perdre l'accès en cas d'erreur temporaire de serveur).
 */
function _handleInvalidToken(): void {
  _invalidateCache();

  // Sur desktop Tauri : ne pas déconnecter automatiquement
  // L'utilisateur peut toujours utiliser l'app et se reconnecter manuellement
  if (_isTauri()) {
    logger.warn('[Auth] Token invalide détecté sur desktop — déconnexion automatique désactivée.');
    return;
  }

  logoutUser();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth';
  }
}

/**
 * Reset the internal validation cache.
 * Useful after logout or when the token changes.
 */
export function invalidateTokenCache(): void {
  _invalidateCache();
}

function _invalidateCache(): void {
  _lastValidationTime = 0;
  _lastValidationResult = false;
  _validationInFlight = null;
}

/**
 * Initiate Google OAuth login
 *
 * Dans Tauri : démarre un serveur HTTP local, ouvre l'URL OAuth dans le navigateur
 * SYSTÈME (pas dans le WebView) pour éviter que la web app s'affiche à l'intérieur
 * de l'app desktop. Le backend redirige vers http://localhost:PORT/callback?token=JWT
 * que le serveur local intercepte → émet l'événement Tauri "oauth-callback".
 *
 * Dans le navigateur web : redirection normale dans le même onglet.
 */
export async function initiateGoogleLogin(): Promise<void> {
  try {
    const backendUrl = import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh';

    if (_isTauri()) {
      const tauri = (window as any).__TAURI__;

      // Étape 1 : démarrer le serveur HTTP local et récupérer le port
      const invoke = tauri?.tauri?.invoke || tauri?.core?.invoke;
      let port: number | null = null;
      if (invoke) {
        try {
          port = await invoke('start_oauth_listener') as number;
          console.log('[OAuth] Serveur local démarré sur port', port);
        } catch (e) {
          console.warn('[OAuth] Impossible de démarrer le serveur local:', e);
        }
      }

      // Étape 2 : ouvrir l'URL OAuth dans le navigateur système
      // Si on a un port, on passe desktop_port pour que le backend redirige vers localhost
      const googleAuthUrl = port
        ? `${backendUrl}/auth/google?desktop_port=${port}`
        : `${backendUrl}/auth/google`;

      // shell.open via l'API Tauri
      const shellOpen = tauri?.shell?.open;
      if (shellOpen) {
        await shellOpen(googleAuthUrl);
      } else {
        // Fallback : navigation dans le WebView (moins idéal mais fonctionnel)
        window.location.href = googleAuthUrl;
      }
    } else {
      // Web : redirection normale dans le même onglet
      window.location.href = `${backendUrl}/auth/google`;
    }
  } catch (error) {
    throw new Error('Impossible d\'initier la connexion Google. Veuillez réessayer.');
  }
}

/**
 * Handle Google OAuth callback
 */
export async function handleGoogleCallback(code: string, state: string): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>(
      '/auth/google/callback',
      {
        code: code,
        state: state
      },
      false,
      false
    );

    // Store the token and schedule auto-refresh
    if (response.access_token) {
      _storeTokenAndScheduleRefresh(response.access_token, response.expires_in);
    }

    return response;
  } catch (error: any) {

    // Améliorer les messages d'erreur pour l'utilisateur
    let userFriendlyMessage = 'Erreur lors de l\'authentification avec Google. Veuillez réessayer.';
    
    if (error?.response?.data?.detail) {
      const detail = error.response.data.detail;
      
      if (typeof detail === 'string') {
        if (detail.includes('email_already_exists')) {
          userFriendlyMessage = 'Cet email est déjà utilisé. Veuillez vous connecter avec votre compte existant.';
        } else if (detail.includes('email_exists_other_provider')) {
          userFriendlyMessage = 'Cet email est déjà associé à un autre compte. Veuillez utiliser la méthode de connexion originale.';
        } else if (detail.includes('creation_failed')) {
          userFriendlyMessage = 'Impossible de créer votre compte. Veuillez réessayer.';
        } else if (detail.includes('invalid_state')) {
          userFriendlyMessage = 'Session de sécurité invalide. Veuillez réessayer.';
        } else {
          // Utiliser le message du serveur s'il est fourni
          userFriendlyMessage = detail;
        }
      }
    } else if (error?.message) {
      userFriendlyMessage = error.message;
    }
    
    const friendlyError = new Error(userFriendlyMessage);
    (friendlyError as any).originalError = error;
    throw friendlyError;
  }
}

/**
 * Register a new user via Google OAuth
 */
export async function registerWithGoogle(googleData: any): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>(
      '/auth/register',
      {
        email: googleData.email,
        password: googleData.sub, // Utiliser l'ID Google comme mot de passe temporaire
        full_name: googleData.name
      },
      false,
      false
    );
    
    // Store the token and schedule auto-refresh
    if (response.access_token) {
      _storeTokenAndScheduleRefresh(response.access_token, response.expires_in);
    }

    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Get Google authenticated user profile
 */
export async function getGoogleUserProfile(): Promise<User> {
  try {
    const response = await apiClient.get<User>('/auth/google/me');
    return response;
  } catch (error) {
    throw error;
  }
}

/**
 * Exchange OAuth code for JWT token
 * This is the secure way to complete OAuth flow without exposing JWT in URL
 */
export async function exchangeOAuthCode(code: string): Promise<AuthResponse> {
  try {
    const response = await apiClient.post<AuthResponse>(
      '/auth/exchange-code',
      { code },
      false,
      false  // No authentication required
    );

    // Store the token and schedule auto-refresh
    if (response.access_token) {
      _storeTokenAndScheduleRefresh(response.access_token, response.expires_in);
      // Clean meetings cache after OAuth login
      try {
        localStorage.removeItem('meeting-transcriber-meetings-cache');
      } catch {}
    }

    return response;
  } catch (error) {
    throw new Error('Échec de l\'échange du code OAuth. Veuillez réessayer.');
  }
}
