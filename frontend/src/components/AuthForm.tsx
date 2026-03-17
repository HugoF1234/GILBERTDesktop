/**
 * AuthForm - Composant d'authentification full-page deux colonnes
 * Gauche: Logo (top-left) + animation onde sonore interactive | Droite: Formulaires
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import * as authService from '../services/authService';
import { API_BASE_URL } from '../services/apiClient';
import emailService from '../services/emailService';

// Shadcn/ui components
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

// Lucide icons
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// Alias pour les fonctions
const loginUser = authService.loginUser;
const registerUser = authService.registerUser;
const initiateGoogleLogin = authService.initiateGoogleLogin;

// Icône Google
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Subtle wave animation component - reacts to form interactions
interface SoundWaveAnimationProps {
  interactionPulse: number; // 0 to 1, triggered by form interactions
}

const SoundWaveAnimation: React.FC<SoundWaveAnimationProps> = ({ interactionPulse }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  // Responsive mouse tracking
  const smoothMouseX = useSpring(mouseX, { stiffness: 200, damping: 30 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 200, damping: 30 });
  const [time, setTime] = useState(0);

  // Smooth amplitude boost from interactions - subtle response
  const amplitudeBoost = useMotionValue(0);
  const smoothAmplitude = useSpring(amplitudeBoost, { stiffness: 80, damping: 20 });

  // Update amplitude when interaction happens - subtle boost
  useEffect(() => {
    if (interactionPulse > 0) {
      // Add to current amplitude (capped at 1)
      const current = amplitudeBoost.get();
      amplitudeBoost.set(Math.min(1, current + 0.15));
    }
  }, [interactionPulse, amplitudeBoost]);

  // Gradual decay when no interactions
  useEffect(() => {
    const interval = setInterval(() => {
      const current = amplitudeBoost.get();
      if (current > 0) {
        amplitudeBoost.set(Math.max(0, current - 0.025));
      }
    }, 50);
    return () => clearInterval(interval);
  }, [amplitudeBoost]);

  // More bars, thinner = more elegant
  const barCount = 100;

  useEffect(() => {
    if (!containerRef.current) return;
    const { width } = containerRef.current.getBoundingClientRect();

    // Utiliser window.innerHeight comme hauteur stable (ne change pas entre login/register)
    const stableHeight = window.innerHeight;
    setDimensions({ width, height: stableHeight });

    const handleResize = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        // Utiliser window.innerHeight pour la hauteur stable
        setDimensions({ width, height: window.innerHeight });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Slightly slower animation loop
  useEffect(() => {
    let animationId: number;
    const animate = () => {
      setTime(t => t + 0.015);
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  }, [mouseX, mouseY]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  }, [mouseX, mouseY]);

  // Calculate bar heights - reacts to form interactions by amplifying existing waves
  const getBarHeight = (index: number) => {
    const mx = smoothMouseX.get();
    const my = smoothMouseY.get();
    const boost = smoothAmplitude.get();
    const normalizedIndex = index / barCount;

    // Distance from mouse (horizontal)
    const distanceFromMouse = Math.abs(normalizedIndex - mx);
    const mouseInfluence = Math.max(0, 1 - distanceFromMouse * 3) * 0.1;

    // Base wave pattern - subtly amplified by interaction boost
    const waveAmplitude = 1 + boost * 1.5; // Boost multiplies wave amplitude (1x to 2.5x)
    const wave1 = Math.sin(normalizedIndex * Math.PI * 4 + time * 1.5) * 0.04 * waveAmplitude;
    const wave2 = Math.sin(normalizedIndex * Math.PI * 8 + time * 2) * 0.02 * waveAmplitude;

    // Mouse-reactive amplitude
    const mouseAmplitude = mouseInfluence * (1 - my * 0.3) * (1 + boost * 0.3);

    // Base height increases slightly with boost
    const baseHeight = 0.025 + boost * 0.015;

    // Combine waves
    const finalHeight = baseHeight + wave1 + wave2 + mouseAmplitude;

    return Math.max(0.02, Math.min(0.3, finalHeight));
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Very subtle ambient glow that follows mouse */}
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full pointer-events-none opacity-30"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
          filter: 'blur(40px)',
          left: `calc(${smoothMouseX.get() * 100}% - 150px)`,
          top: `calc(${smoothMouseY.get() * 100}% - 150px)`,
        }}
      />

      {/* Full-width waveform - vertically centered */}
      <div className="absolute inset-0 flex items-center">
        <svg
          width={dimensions.width}
          height={dimensions.height * 0.5}
          className="overflow-visible"
          style={{ marginLeft: 0 }}
        >
          {/* Waveform bars - edge to edge */}
          {Array.from({ length: barCount }).map((_, i) => {
            const barHeight = getBarHeight(i);
            const boost = smoothAmplitude.get();
            const maxHeight = dimensions.height * 0.25; // Increased max height
            const height = barHeight * maxHeight;
            const barWidth = dimensions.width / barCount - 1.5;
            const x = i * (dimensions.width / barCount);
            const centerY = dimensions.height * 0.25;

            // Opacity increases with boost
            const mx = smoothMouseX.get();
            const distanceFromMouse = Math.abs(i / barCount - mx);
            const baseIntensity = Math.max(0.08, 0.25 - distanceFromMouse * 0.3);
            const intensity = baseIntensity + boost * 0.15;

            return (
              <g key={i}>
                {/* Top bar (mirrored) */}
                <rect
                  x={x}
                  y={centerY - height}
                  width={Math.max(1, barWidth)}
                  height={height}
                  rx={0.5}
                  fill={`rgba(255, 255, 255, ${intensity})`}
                />
                {/* Bottom bar */}
                <rect
                  x={x}
                  y={centerY}
                  width={Math.max(1, barWidth)}
                  height={height}
                  rx={0.5}
                  fill={`rgba(255, 255, 255, ${intensity * 0.7})`}
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

interface AuthFormProps {
  onAuthSuccess: () => void;
  showEmailVerification?: boolean;
  verificationEmail?: string;
  onEmailVerificationClose?: () => void;
}

type AuthView = 'login' | 'register' | 'forgot-password' | 'email-verification' | 'reset-password';

const AuthForm: React.FC<AuthFormProps> = ({
  onAuthSuccess,
  showEmailVerification: propShowEmailVerification = false,
  verificationEmail: propVerificationEmail = '',
  onEmailVerificationClose,
}) => {
  const location = useLocation();

  // États principaux
  const [currentView, setCurrentView] = useState<AuthView>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // États serveur
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // États formulaire connexion
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // États formulaire inscription
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');

  // États mot de passe oublié
  const [forgotEmail, setForgotEmail] = useState('');

  // États vérification email
  const [verificationEmail, setVerificationEmail] = useState(propVerificationEmail);
  const [verificationCode, setVerificationCode] = useState('');

  // États reset password
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // État pour l'animation réactive aux interactions
  const [interactionPulse, setInteractionPulse] = useState(0);
  const pulseCounter = useRef(0);

  // Déclencher un pulse quand l'utilisateur interagit avec le formulaire
  const triggerPulse = useCallback((intensity: number = 0.5) => {
    pulseCounter.current += 1;
    setInteractionPulse(pulseCounter.current + intensity);
  }, []);

  // Vérification du serveur
  const checkServerStatus = useCallback(async () => {
    setConnectionError(null);

    if (!navigator.onLine) {
      setServerStatus('offline');
      setConnectionError('Aucune connexion internet');
      return;
    }

    setServerStatus('online');
    localStorage.removeItem('lastConnectionErrorTime');

    try {
      const baseUrl = API_BASE_URL || 'https://gilbert-assistant.ovh';
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        mode: 'cors',
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      if (!response.ok && response.status !== 404) {
        setServerStatus('offline');
        setConnectionError('Serveur temporairement inaccessible');
      }
    } catch {
      if (navigator.onLine) {
        setServerStatus('offline');
        setConnectionError('Impossible de contacter le serveur');
      }
    }
  }, []);

  // Effects
  useEffect(() => {
    checkServerStatus();
    const interval = window.setInterval(checkServerStatus, 30000);
    return () => window.clearInterval(interval);
  }, [checkServerStatus]);

  useEffect(() => {
    const stateError = (location.state as any)?.error;
    if (stateError) {
      setError(stateError);
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location.state, location.pathname]);

  // Gérer les erreurs OAuth depuis les query params (pour Tauri desktop)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthError = urlParams.get('oauth_error') || urlParams.get('error');

    if (oauthError) {
      let errorMessage = 'Erreur lors de l\'authentification avec Google';
      switch (oauthError) {
        case 'email_already_exists':
          errorMessage = 'Cet email est déjà utilisé avec un compte classique. Veuillez vous connecter avec votre email et mot de passe.';
          break;
        case 'email_exists_other_provider':
          errorMessage = 'Cet email est déjà associé à un autre compte. Veuillez utiliser la méthode de connexion originale.';
          break;
        case 'creation_failed':
          errorMessage = urlParams.get('message') || 'Impossible de créer votre compte. Veuillez réessayer.';
          break;
        case 'invalid_state':
          errorMessage = 'Session expirée. Veuillez réessayer.';
          break;
        case 'token_exchange_failed':
        case 'token_creation_failed':
          errorMessage = 'Erreur lors de l\'authentification. Veuillez réessayer.';
          break;
        case 'user_info_failed':
          errorMessage = 'Impossible de récupérer vos informations. Veuillez réessayer.';
          break;
        case 'server_error':
          errorMessage = urlParams.get('message') || 'Une erreur est survenue. Veuillez réessayer.';
          break;
        case 'missing_params':
          errorMessage = 'Paramètres manquants. Veuillez réessayer.';
          break;
        default:
          errorMessage = urlParams.get('message') || 'Une erreur est survenue lors de la connexion.';
      }
      setError(errorMessage);
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (propShowEmailVerification) {
      setCurrentView('email-verification');
      if (propVerificationEmail) setVerificationEmail(propVerificationEmail);
    }
  }, [propShowEmailVerification, propVerificationEmail]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (token && window.location.pathname.includes('reset-password')) {
      setResetToken(token);
      setCurrentView('reset-password');
      const email = urlParams.get('email');
      if (email) localStorage.setItem('reset_user_email', email);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await loginUser({ username: loginEmail, password: loginPassword });
      onAuthSuccess();
    } catch (err: any) {
      let errorMessage = 'Email ou mot de passe incorrect';
      if (err?.detail) errorMessage = err.detail;
      else if (err?.response?.data?.detail) errorMessage = err.response.data.detail;
      else if (err?.message && !err.message.includes('Not Found')) errorMessage = err.message;
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (registerPassword !== registerPasswordConfirm) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (registerPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setIsLoading(true);

    try {
      await registerUser({
        full_name: registerName,
        email: registerEmail,
        password: registerPassword,
      });

      setVerificationEmail(registerEmail);
      setCurrentView('email-verification');
      setSuccessMessage('Code de vérification envoyé par email');
    } catch (err: any) {
      setError(err?.message || err?.detail || "Échec de l'inscription");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await initiateGoogleLogin();
      // Dans Tauri : l'URL s'ouvre dans le navigateur système
      // Le listener dans main.tsx recevra le token et rechargera l'app automatiquement
      // On ajoute un timeout de sécurité : si après 3 min toujours rien, débloquer le bouton
      if ((window as any).__TAURI__) {
        setTimeout(() => setIsLoading(false), 3 * 60 * 1000);
      }
    } catch (err: any) {
      setError(err?.message || 'Erreur de connexion avec Google');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const response = await emailService.forgotPassword(forgotEmail);
      if (response.success) {
        setSuccessMessage('Si cette adresse existe, vous recevrez un email de réinitialisation');
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Veuillez saisir un code à 6 chiffres');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await emailService.verifyEmail(verificationEmail, verificationCode);

      if (response?.success) {
        if (response.access_token) {
          localStorage.setItem('auth_token', response.access_token);
        }
        setSuccessMessage('Email vérifié avec succès !');
        setTimeout(() => {
          setCurrentView('login');
          onAuthSuccess();
        }, 1500);
      } else {
        setError(response?.message || 'Erreur de vérification');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await emailService.sendVerificationCode(verificationEmail);
      setSuccessMessage('Code renvoyé par email');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await emailService.resetPassword(resetToken, newPassword);

      if (response.success) {
        setSuccessMessage('Mot de passe réinitialisé avec succès !');

        const userEmail = localStorage.getItem('reset_user_email');
        if (userEmail) {
          try {
            const loginResponse = await loginUser({ username: userEmail, password: newPassword });
            if (loginResponse.access_token) {
              localStorage.setItem('auth_token', loginResponse.access_token);
              localStorage.removeItem('reset_user_email');
              setTimeout(() => onAuthSuccess(), 1500);
              return;
            }
          } catch {
            // Connexion auto échouée, rediriger vers login
          }
        }

        setTimeout(() => {
          setCurrentView('login');
        }, 2000);
      } else {
        setError(response.message || 'Erreur lors de la réinitialisation');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Animation variants
  const formVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.3 } },
  };

  // Render alert
  const renderAlert = () => {
    if (error) {
      return (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </motion.div>
      );
    }
    if (successMessage) {
      return (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 mb-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg"
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMessage}</span>
        </motion.div>
      );
    }
    return null;
  };

  // Render server status
  const renderServerStatus = () => {
    if (serverStatus === 'offline') {
      return (
        <div className="flex items-center justify-between p-3 mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
          <span>{connectionError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setServerStatus('checking');
              checkServerStatus();
            }}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      );
    }
    return null;
  };

  // Login form
  const renderLoginForm = () => (
    <motion.div key="login" variants={formVariants} initial="initial" animate="animate" exit="exit" className="w-full h-[620px]">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Content de vous revoir</h1>
        <p className="text-slate-500">Connectez-vous pour continuer</p>
      </div>

      {renderAlert()}
      {renderServerStatus()}

      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="login-email"
              type="email"
              placeholder="gilbert@lexia.fr"
              className="pl-10 h-11"
              value={loginEmail}
              onChange={(e) => { setLoginEmail(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Mot de passe</Label>
            <button
              type="button"
              onClick={() => setCurrentView('forgot-password')}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Mot de passe oublié ?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Votre mot de passe"
              className="pl-10 pr-10 h-11"
              value={loginPassword}
              onChange={(e) => { setLoginPassword(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          disabled={isLoading || serverStatus === 'offline'}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Connexion...
            </>
          ) : (
            'Se connecter'
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-400">ou</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full h-11"
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <GoogleIcon />
        <span className="ml-2">
          {isLoading && (window as any).__TAURI__ ? 'En attente du navigateur...' : 'Continuer avec Google'}
        </span>
      </Button>

      <p className="mt-8 text-center text-sm text-slate-500">
        Pas encore de compte ?{' '}
        <button
          type="button"
          onClick={() => { setCurrentView('register'); setError(null); }}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Créer un compte
        </button>
      </p>
    </motion.div>
  );

  // Register form
  const renderRegisterForm = () => (
    <motion.div key="register" variants={formVariants} initial="initial" animate="animate" exit="exit" className="w-full h-[620px]">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Créer un compte</h1>
        <p className="text-slate-500">Rejoignez Gilbert en quelques secondes</p>
      </div>

      {renderAlert()}
      {renderServerStatus()}

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-name">Nom complet</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="register-name"
              type="text"
              placeholder="Jean Dupont"
              className="pl-10 h-11"
              value={registerName}
              onChange={(e) => { setRegisterName(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="register-email"
              type="email"
              placeholder="gilbert@lexia.fr"
              className="pl-10 h-11"
              value={registerEmail}
              onChange={(e) => { setRegisterEmail(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password">Mot de passe</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="register-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="8 caractères minimum"
              className="pl-10 pr-10 h-11"
              value={registerPassword}
              onChange={(e) => { setRegisterPassword(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password-confirm">Confirmer le mot de passe</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="register-password-confirm"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirmez votre mot de passe"
              className="pl-10 pr-10 h-11"
              value={registerPasswordConfirm}
              onChange={(e) => { setRegisterPasswordConfirm(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          disabled={isLoading || serverStatus === 'offline'}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Inscription...
            </>
          ) : (
            "S'inscrire"
          )}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-400">ou</span>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full h-11"
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <GoogleIcon />
        <span className="ml-2">Continuer avec Google</span>
      </Button>

      <p className="mt-8 text-center text-sm text-slate-500">
        Déjà un compte ?{' '}
        <button
          type="button"
          onClick={() => { setCurrentView('login'); setError(null); }}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          Se connecter
        </button>
      </p>
    </motion.div>
  );

  // Forgot password form
  const renderForgotPasswordForm = () => (
    <motion.div key="forgot" variants={formVariants} initial="initial" animate="animate" exit="exit" className="w-full">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
          <Mail className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Mot de passe oublié ?</h1>
        <p className="text-slate-500">Entrez votre email pour recevoir un lien de réinitialisation</p>
      </div>

      {renderAlert()}

      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="forgot-email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="forgot-email"
              type="email"
              placeholder="gilbert@lexia.fr"
              className="pl-10 h-11"
              value={forgotEmail}
              onChange={(e) => { setForgotEmail(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
              required
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          disabled={isLoading || !forgotEmail}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Envoi en cours...
            </>
          ) : (
            'Envoyer le lien'
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => { setCurrentView('login'); setError(null); setSuccessMessage(null); }}
        className="flex items-center justify-center gap-2 w-full text-sm text-slate-500 hover:text-slate-700 mt-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour à la connexion
      </button>
    </motion.div>
  );

  // Email verification form
  const renderEmailVerificationForm = () => (
    <motion.div key="verify" variants={formVariants} initial="initial" animate="animate" exit="exit" className="w-full">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Mail className="w-6 h-6 text-emerald-600" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Vérifiez votre email</h1>
        <p className="text-slate-500">
          Un code à 6 chiffres a été envoyé à<br />
          <span className="font-medium text-slate-700">{verificationEmail}</span>
        </p>
      </div>

      {renderAlert()}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="verification-code">Code de vérification</Label>
          <Input
            id="verification-code"
            type="text"
            placeholder="000000"
            className="text-center text-2xl tracking-[0.5em] font-mono h-14"
            maxLength={6}
            value={verificationCode}
            onChange={(e) => { setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6)); triggerPulse(0.4); }}
            onFocus={() => triggerPulse(0.6)}
          />
        </div>

        <Button
          type="button"
          className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          disabled={isLoading || verificationCode.length !== 6}
          onClick={handleVerifyEmail}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Vérification...
            </>
          ) : (
            'Vérifier'
          )}
        </Button>

        <div className="text-center">
          <span className="text-sm text-slate-500">Vous n'avez pas reçu le code ? </span>
          <button
            type="button"
            onClick={handleResendCode}
            disabled={isLoading}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Renvoyer
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => { setCurrentView('login'); setError(null); setSuccessMessage(null); onEmailVerificationClose?.(); }}
        className="flex items-center justify-center gap-2 w-full text-sm text-slate-500 hover:text-slate-700 mt-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Retour
      </button>
    </motion.div>
  );

  // Reset password form
  const renderResetPasswordForm = () => (
    <motion.div key="reset" variants={formVariants} initial="initial" animate="animate" exit="exit" className="w-full">
      <div className="mb-8">
        <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mb-4">
          <Lock className="w-6 h-6 text-violet-600" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Nouveau mot de passe</h1>
        <p className="text-slate-500">Choisissez un mot de passe sécurisé</p>
      </div>

      {renderAlert()}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">Nouveau mot de passe</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="8 caractères minimum"
              className="pl-10 pr-10 h-11"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-new-password">Confirmer le mot de passe</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="confirm-new-password"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirmez votre mot de passe"
              className="pl-10 pr-10 h-11"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); triggerPulse(0.3); }}
              onFocus={() => triggerPulse(0.6)}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button
          type="button"
          className="w-full h-11 bg-violet-600 hover:bg-violet-700 text-white font-medium"
          disabled={isLoading}
          onClick={handleResetPassword}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Réinitialisation...
            </>
          ) : (
            'Réinitialiser le mot de passe'
          )}
        </Button>
      </div>
    </motion.div>
  );

  // Decorative left panel
  const renderDecorativePanel = () => (
    <div className="hidden lg:block lg:w-1/2 h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-violet-900 relative overflow-hidden">
      {/* Sound wave animation covers entire panel - reacts to form interactions */}
      <SoundWaveAnimation interactionPulse={interactionPulse} />

      {/* Logo overlay - top left with higher z-index */}
      <div className="absolute top-0 left-0 z-30 p-8">
        <motion.img
          src="/img/logo_gilbert.png"
          alt="Gilbert"
          className="h-10 brightness-0 invert opacity-95"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        />
      </div>
    </div>
  );

  // Main render
  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left column - Decorative with logo and sound wave animation */}
      {renderDecorativePanel()}

      {/* Right column - Form */}
      <div className="w-full lg:w-1/2 h-screen flex flex-col bg-white overflow-auto">
        {/* Form container */}
        <div className="flex-1 flex items-center justify-center px-8 py-12">
          {/* min-h-[600px] pour éviter le décalage entre login et inscription */}
          <div className="w-full max-w-md min-h-[600px] flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {currentView === 'login' && renderLoginForm()}
              {currentView === 'register' && renderRegisterForm()}
              {currentView === 'forgot-password' && renderForgotPasswordForm()}
              {currentView === 'email-verification' && renderEmailVerificationForm()}
              {currentView === 'reset-password' && renderResetPasswordForm()}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Gilbert - Tous droits réservés
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
