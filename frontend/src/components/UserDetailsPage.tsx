/**
 * UserDetailsPage - Page de détails utilisateur (admin)
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  User,
  Mail,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Loader2,
  FileText,
  Share2,
  TrendingUp,
  CreditCard,
  Zap,
  AlertCircle,
  UserCog,
  Send,
  Mic2,
  Building2,
  Settings,
  RefreshCw,
  Plus,
  RotateCcw,
  Pencil,
  Phone,
  Briefcase,
  GraduationCap,
  Video,
  Megaphone,
  Users,
  Search,
  Newspaper,
  MessageCircle,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { useNotification } from '../contexts/NotificationContext';
import { getUserDetails } from '../services/meetingService';
import apiClient from '../services/apiClient';
import sounds from '../utils/soundDesign';
import { logger } from '@/utils/logger';

interface DiscoveryStatus {
  subscription_plan: string;
  minutes_total: number;
  minutes_used: number;
  minutes_remaining: number;
  percentage_used: number;
  can_view_transcript: boolean;
}

interface UserDetails {
  user: {
    id: string;
    email: string;
    full_name: string;
    created_at: string;
    last_login?: string;
    is_active: boolean;
    oauth_provider?: string;
    profile_picture_url?: string;
    email_verified: boolean;
    share_id?: string | null;
    subscription_plan?: string;
    transcription_provider?: string;
    // Onboarding questionnaire fields
    phone_country_code?: string;
    phone?: string;
    usage?: string;
    status?: string;
    company_name?: string;
    activity_sector?: string;
    discovery_source?: string;
    cgu_accepted?: boolean;
    cgu_accepted_at?: string;
    onboarding_completed?: boolean;
  };
  meeting_stats?: {
    total_meetings: number;
    completed_transcriptions: number;
    completed_summaries: number;
    total_duration: number;
    avg_duration: number;
    last_meeting_date?: string;
  };
  recent_meetings?: Array<{
    id: string;
    title: string;
    created_at: string;
    duration_seconds: number;
    transcript_status: string;
    summary_status: string;
    speakers_count: number;
    template_id: string | null;
    template_name: string | null;
    template_description: string | null;
  }>;
  template_usage?: Array<{
    template_id: string;
    template_name: string;
    usage_count: number;
    last_used: string;
  }>;
  assigned_templates?: Array<{
    template_id: string;
    template_name: string;
    template_description: string | null;
    is_default: boolean;
    assigned_at: string;
  }>;
  sharing_stats?: {
    meetings_shared_out: number;
    meetings_shared_in: number;
  };
  stats?: {
    total_meetings: number;
    completed_transcriptions: number;
    completed_summaries: number;
    total_duration: number;
    avg_duration: number;
    last_meeting_date?: string;
  };
  meetings?: Array<{
    id: string;
    title: string;
    created_at: string;
    duration_seconds: number;
    transcript_status: string;
    summary_status: string;
    speakers_count: number;
    template_id: string | null;
    template_name: string | null;
    template_description: string | null;
  }>;
  subscription?: {
    id: string;
    plan: string;
    status: string;
    current_period_start?: string;
    current_period_end?: string;
    created_at?: string;
    updated_at?: string;
    canceled_at?: string;
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 12 } },
};

const UserDetailsPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { showSuccessPopup, showErrorPopup } = useNotification();

  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<'beta_tester' | 'gilbert_plus'>('gilbert_plus');
  const [assigningSubscription, setAssigningSubscription] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailData, setEmailData] = useState({
    subject: '',
    body: '',
  });
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);
  const [minutesToAdd, setMinutesToAdd] = useState<number>(100);
  const [addingMinutes, setAddingMinutes] = useState(false);
  const [minutesUsedInput, setMinutesUsedInput] = useState<number>(0);
  const [minutesTotalInput, setMinutesTotalInput] = useState<number>(300);
  const [settingMinutes, setSettingMinutes] = useState(false);
  const [settingTotal, setSettingTotal] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUserDetails();
    }
  }, [userId]);

  const loadUserDetails = async () => {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);

      // Charger les détails utilisateur
      const details = await getUserDetails(userId);
      
      // Récupérer l'abonnement de l'utilisateur
      try {
        const subscriptionResponse = await apiClient.get(`/admin/subscriptions/user/${userId}`) as { subscription?: any };
        if (subscriptionResponse?.subscription) {
          details.subscription = subscriptionResponse.subscription;
        }
      } catch (err) {
        logger.warn('Impossible de récupérer l\'abonnement:', err);
      }

      // Récupérer le statut Discovery de l'utilisateur
      try {
        setLoadingDiscovery(true);
        const discoveryResponse = await apiClient.get(`/admin/users/${userId}/discovery`) as { discovery?: DiscoveryStatus };
        if (discoveryResponse?.discovery) {
          setDiscoveryStatus(discoveryResponse.discovery);
          setMinutesUsedInput(discoveryResponse.discovery.minutes_used || 0);
          setMinutesTotalInput(discoveryResponse.discovery.minutes_total || 300);
        }
      } catch (err) {
        logger.warn('Impossible de récupérer le statut Discovery:', err);
        setDiscoveryStatus(null);
      } finally {
        setLoadingDiscovery(false);
      }

      setUserDetails(details);
    } catch (err: any) {
      logger.error('Error loading user details:', err);
      if (err?.detail === 'Not authenticated' || err?.message === 'Not authenticated') {
        return;
      }
      if (err?.detail === 'Not Found' || err?.status === 404) {
        setError('Utilisateur non trouvé');
      } else {
        setError('Erreur lors du chargement des détails utilisateur');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Date invalide';
    }
  };

  const handleCopyShareId = (shareId: string) => {
    if (!shareId) return;
    navigator.clipboard.writeText(shareId).then(() => {
      setCopyFeedback('ID copié !');
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  const handleAssignSubscription = async () => {
    if (!userId) return;

    setAssigningSubscription(true);
    try {
      sounds.click();
      await apiClient.post(`/admin/subscriptions/assign`, {
        user_id: userId,
        plan: subscriptionPlan,
      });
      await loadUserDetails();
      showSuccessPopup('Succès', `Abonnement ${subscriptionPlan === 'gilbert_plus' ? 'Gilbert Pro' : 'Beta Testeur'} attribué avec succès`);
    } catch (error: any) {
      logger.error('Erreur lors de l\'attribution de l\'abonnement:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible d\'attribuer l\'abonnement');
    } finally {
      setAssigningSubscription(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!userId) return;
    if (!window.confirm('Êtes-vous sûr de vouloir résilier l\'abonnement de cet utilisateur ?')) {
      return;
    }

    try {
      sounds.click();
      await apiClient.post(`/admin/subscriptions/cancel`, { user_id: userId });
      await loadUserDetails();
      showSuccessPopup('Succès', 'Abonnement résilié avec succès');
    } catch (error: any) {
      logger.error('Erreur lors de la résiliation:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de résilier l\'abonnement');
    }
  };

  const handleSendEmail = async () => {
    if (!userId || !emailData.subject || !emailData.body) {
      showErrorPopup('Erreur', 'Le sujet et le corps de l\'email sont requis');
      return;
    }

    setSendingEmail(true);
    try {
      sounds.click();
      await apiClient.post('/admin/emails/send', {
        recipient: userDetails?.user.email,
        subject: emailData.subject,
        body: emailData.body,
      });
      showSuccessPopup('Succès', 'Email envoyé avec succès');
      setEmailData({ subject: '', body: '' });
    } catch (error: any) {
      logger.error('Erreur lors de l\'envoi de l\'email:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible d\'envoyer l\'email');
    } finally {
      setSendingEmail(false);
    }
  };

  const handleAddDiscoveryMinutes = async () => {
    if (!userId || minutesToAdd <= 0) return;

    setAddingMinutes(true);
    try {
      sounds.click();
      await apiClient.post(`/admin/users/${userId}/discovery/add-minutes`, {
        minutes: minutesToAdd,
      });
      // Recharger le statut Discovery
      const discoveryResponse = await apiClient.get(`/admin/users/${userId}/discovery`) as { discovery?: DiscoveryStatus };
      if (discoveryResponse?.discovery) {
        setDiscoveryStatus(discoveryResponse.discovery);
        setMinutesUsedInput(discoveryResponse.discovery.minutes_used || 0);
          setMinutesTotalInput(discoveryResponse.discovery.minutes_total || 300);
      }
      showSuccessPopup('Succès', `${minutesToAdd} minutes ajoutées avec succès`);
    } catch (error: any) {
      logger.error('Erreur lors de l\'ajout de minutes:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible d\'ajouter les minutes');
    } finally {
      setAddingMinutes(false);
    }
  };

  const handleResetDiscoveryMinutes = async () => {
    if (!userId) return;
    if (!window.confirm('Êtes-vous sûr de vouloir remettre les minutes utilisées à 0 ?')) {
      return;
    }

    try {
      sounds.click();
      await apiClient.put(`/admin/users/${userId}/discovery`, {
        reset: true,
      });
      // Recharger le statut Discovery
      const discoveryResponse = await apiClient.get(`/admin/users/${userId}/discovery`) as { discovery?: DiscoveryStatus };
      if (discoveryResponse?.discovery) {
        setDiscoveryStatus(discoveryResponse.discovery);
        setMinutesUsedInput(discoveryResponse.discovery.minutes_used || 0);
          setMinutesTotalInput(discoveryResponse.discovery.minutes_total || 300);
      }
      showSuccessPopup('Succès', 'Minutes remises à zéro');
    } catch (error: any) {
      logger.error('Erreur lors du reset:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de remettre à zéro');
    }
  };

  const handleSetDiscoveryMinutesUsed = async () => {
    if (!userId) return;
    if (minutesUsedInput < 0) {
      showErrorPopup('Erreur', 'Le nombre de minutes ne peut pas être négatif');
      return;
    }

    try {
      setSettingMinutes(true);
      sounds.click();
      await apiClient.put(`/admin/users/${userId}/discovery`, {
        minutes_used: minutesUsedInput,
      });
      // Recharger le statut Discovery
      const discoveryResponse = await apiClient.get(`/admin/users/${userId}/discovery`) as { discovery?: DiscoveryStatus };
      if (discoveryResponse?.discovery) {
        setDiscoveryStatus(discoveryResponse.discovery);
        setMinutesUsedInput(discoveryResponse.discovery.minutes_used || 0);
          setMinutesTotalInput(discoveryResponse.discovery.minutes_total || 300);
      }
      showSuccessPopup('Succès', `Minutes utilisées définies à ${minutesUsedInput}`);
    } catch (error: any) {
      logger.error('Erreur lors de la modification:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de modifier les minutes');
    } finally {
      setSettingMinutes(false);
    }
  };

  const handleSetDiscoveryMinutesTotal = async () => {
    if (!userId) return;
    if (minutesTotalInput < 0) {
      showErrorPopup('Erreur', 'Le quota total ne peut pas être négatif');
      return;
    }

    try {
      setSettingTotal(true);
      sounds.click();
      await apiClient.put(`/admin/users/${userId}/discovery`, {
        minutes_total: minutesTotalInput,
      });
      // Recharger le statut Discovery
      const discoveryResponse = await apiClient.get(`/admin/users/${userId}/discovery`) as { discovery?: DiscoveryStatus };
      if (discoveryResponse?.discovery) {
        setDiscoveryStatus(discoveryResponse.discovery);
        setMinutesUsedInput(discoveryResponse.discovery.minutes_used || 0);
        setMinutesTotalInput(discoveryResponse.discovery.minutes_total || 300);
      }
      showSuccessPopup('Succès', `Quota total défini à ${minutesTotalInput} minutes`);
    } catch (error: any) {
      logger.error('Erreur lors de la modification:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de modifier le quota');
    } finally {
      setSettingTotal(false);
    }
  };

  const getPlanBadge = (plan?: string) => {
    switch (plan) {
      case 'gilbert_plus':
      case 'gilbert_plus_monthly':
        return <Badge variant="default" className="bg-amber-500 text-white">Gilbert Pro Mensuel</Badge>;
      case 'gilbert_plus_yearly':
        return <Badge variant="default" className="bg-amber-600 text-white">Gilbert Pro Annuel</Badge>;
      case 'enterprise':
        return <Badge variant="default" className="bg-purple-600 text-white">Entreprise</Badge>;
      case 'discovery':
        return <Badge variant="default" className="bg-emerald-500 text-white">Discovery</Badge>;
      case 'beta_tester':
      default:
        return <Badge variant="secondary">Beta Testeur</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="h-10 w-48 rounded-lg bg-slate-200 animate-pulse mb-8" />
          <div className="h-10 w-64 rounded-lg bg-slate-200 animate-pulse mb-2" />
          <div className="h-4 w-48 rounded bg-slate-200 animate-pulse mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="space-y-6">
              <div className="rounded-lg border border-slate-200 p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-slate-200 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-3/4 rounded bg-slate-200 animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-slate-200 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-4 w-full rounded bg-slate-200 animate-pulse" />
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-6">
                  <div className="h-6 w-32 rounded bg-slate-200 animate-pulse mb-4" />
                  <div className="space-y-3">
                    {[1, 2, 3].map((j) => (
                      <div key={j} className="h-4 w-full rounded bg-slate-200 animate-pulse" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !userDetails) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4">
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-600" />
                <p className="text-lg font-semibold text-red-900">{error || 'Utilisateur non trouvé'}</p>
              </div>
              <Button variant="outline" onClick={() => navigate('/admin')} className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour à l'admin
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { user, meeting_stats, recent_meetings, stats, meetings, subscription } = userDetails;
  const actualMeetingStats = stats || meeting_stats;
  const actualRecentMeetings = meetings || recent_meetings;

  return (
    <div className="min-h-screen bg-slate-50">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Button
            variant="ghost"
            onClick={() => {
              sounds.click();
              navigate('/admin');
            }}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Détails de l'utilisateur</h1>
          <p className="text-slate-500 text-sm">Informations complètes et statistiques</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne gauche - Informations utilisateur */}
          <motion.div variants={itemVariants} className="lg:col-span-1 space-y-6">
            {/* Carte utilisateur */}
            <Card className="border-slate-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold text-xl">
                    {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{user.full_name || 'Nom non défini'}</h2>
                    <p className="text-sm text-slate-500">{user.email}</p>
                  </div>
                </div>

                {/* ID de partage */}
                {user.share_id && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4">
                    <p className="text-sm font-medium text-slate-700 mb-1">ID de partage</p>
                    <div className="flex items-center gap-2">
                      <Input
                        value={user.share_id.toUpperCase()}
                        readOnly
                        className="font-mono text-center text-sm font-semibold tracking-wider"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleCopyShareId(user.share_id || '')}
                        title="Copier"
                      >
                        {copyFeedback ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    {copyFeedback && (
                      <p className="text-xs text-emerald-600 mt-1">{copyFeedback}</p>
                    )}
                  </div>
                )}

                {/* Informations */}
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Mail className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600 mb-1">Email</p>
                      <p className="text-sm text-slate-900">{user.email}</p>
                      <Badge variant={user.email_verified ? 'default' : 'secondary'} className="mt-1">
                        {user.email_verified ? 'Vérifié' : 'Non vérifié'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Calendar className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Inscription</p>
                      <p className="text-sm text-slate-900">{formatDate(user.created_at)}</p>
                    </div>
                  </div>

                  {user.last_login && (
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">Dernière connexion</p>
                        <p className="text-sm text-slate-900">{formatDate(user.last_login)}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <User className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-600 mb-1">Statut</p>
                      <div className="flex gap-2">
                        <Badge variant={user.is_active ? 'default' : 'destructive'}>
                          {user.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                        {user.oauth_provider && (
                          <Badge variant="outline">Via {user.oauth_provider}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Plan d'abonnement</p>
                      {getPlanBadge(user.subscription_plan)}
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mic2 className="w-5 h-5 text-slate-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Modèle de transcription</p>
                      <Badge className={user.transcription_provider === 'ovh_whisper' ? 'bg-purple-100 text-purple-700 hover:bg-purple-100' : user.transcription_provider === 'voxtral' ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : 'bg-blue-100 text-blue-700 hover:bg-blue-100'}>
                        {user.transcription_provider === 'ovh_whisper' ? 'OVH Whisper' : user.transcription_provider === 'voxtral' ? 'Voxtral (Mistral AI)' : 'AssemblyAI'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Questionnaire d'onboarding */}
            {user.onboarding_completed && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="w-5 h-5 text-emerald-500" />
                    Questionnaire d'onboarding
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Téléphone */}
                    {user.phone && (
                      <div className="flex items-start gap-3">
                        <Phone className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Téléphone</p>
                          <p className="text-sm text-slate-900">{user.phone_country_code} {user.phone}</p>
                        </div>
                      </div>
                    )}

                    {/* Usage (peut être plusieurs, stockés en comma-separated) */}
                    {user.usage && (
                      <div className="flex items-start gap-3">
                        <Video className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Usages</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(user.usage.includes(',') ? user.usage.split(',').map(u => u.trim()) : [user.usage]).map((u) => {
                              const labels: Record<string, string> = {
                                meetings: 'Réunions professionnelles',
                                courses: 'Cours / Conférences',
                                interviews: 'Interviews / Entretiens',
                                notes: 'Prise de notes personnelle',
                                other: 'Autre',
                              };
                              return (
                                <Badge key={u} className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                  {labels[u] ?? u}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Statut */}
                    {user.status && (
                      <div className="flex items-start gap-3">
                        {user.status === 'student' && <GraduationCap className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.status === 'employee' && <Briefcase className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.status === 'freelance' && <User className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.status === 'company' && <Building2 className="w-5 h-5 text-slate-400 mt-0.5" />}
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Statut</p>
                          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                            {user.status === 'student' && 'Étudiant'}
                            {user.status === 'employee' && 'Salarié'}
                            {user.status === 'freelance' && 'Indépendant / Freelance'}
                            {user.status === 'company' && 'Dirigeant / Entreprise'}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Nom de l'entreprise */}
                    {user.company_name && (
                      <div className="flex items-start gap-3">
                        <Building2 className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Entreprise</p>
                          <p className="text-sm text-slate-900">{user.company_name}</p>
                        </div>
                      </div>
                    )}

                    {/* Secteur d'activité */}
                    {user.activity_sector && (
                      <div className="flex items-start gap-3">
                        <Briefcase className="w-5 h-5 text-slate-400 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Secteur d'activité</p>
                          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">
                            {user.activity_sector === 'tech' && 'Technologie / IT'}
                            {user.activity_sector === 'consulting' && 'Conseil / Services'}
                            {user.activity_sector === 'health' && 'Santé / Médical'}
                            {user.activity_sector === 'legal' && 'Juridique / Droit'}
                            {user.activity_sector === 'education' && 'Éducation / Formation'}
                            {user.activity_sector === 'finance' && 'Finance / Banque / Assurance'}
                            {user.activity_sector === 'public' && 'Secteur public / Collectivités'}
                            {user.activity_sector === 'media' && 'Médias / Communication'}
                            {user.activity_sector === 'other' && 'Autre secteur'}
                            {!['tech', 'consulting', 'health', 'legal', 'education', 'finance', 'public', 'media', 'other'].includes(user.activity_sector) && user.activity_sector}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Source de découverte */}
                    {user.discovery_source && (
                      <div className="flex items-start gap-3">
                        {user.discovery_source === 'social' && <Megaphone className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.discovery_source === 'wordofmouth' && <Users className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.discovery_source === 'search' && <Search className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.discovery_source === 'press' && <Newspaper className="w-5 h-5 text-slate-400 mt-0.5" />}
                        {user.discovery_source === 'other' && <MessageCircle className="w-5 h-5 text-slate-400 mt-0.5" />}
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">Comment nous a connu</p>
                          <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                            {user.discovery_source === 'social' && 'Réseaux sociaux'}
                            {user.discovery_source === 'wordofmouth' && 'Bouche à oreille'}
                            {user.discovery_source === 'search' && 'Recherche Google'}
                            {user.discovery_source === 'press' && 'Article / Presse'}
                            {user.discovery_source === 'other' && 'Autre'}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* CGU */}
                    {user.cgu_accepted_at && (
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-600 mb-1">CGU acceptées</p>
                          <p className="text-sm text-slate-500">
                            {new Date(user.cgu_accepted_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions rapides */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-slate-500" />
                  Actions rapides
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      sounds.click();
                      navigate('/admin?tab=actions&subtab=subscriptions&user=' + userId);
                    }}
                  >
                    <CreditCard className="w-5 h-5 mr-3 text-amber-500" />
                    Gérer l'abonnement
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      sounds.click();
                      navigate('/admin?tab=actions&subtab=transcription&user=' + userId);
                    }}
                  >
                    <Mic2 className="w-5 h-5 mr-3 text-purple-500" />
                    Modèle de transcription
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      sounds.click();
                      navigate('/admin?tab=actions&subtab=emails&user=' + userId);
                    }}
                  >
                    <Mail className="w-5 h-5 mr-3 text-blue-500" />
                    Envoyer un email
                  </Button>
                  <Button
                    variant="outline"
                    className="justify-start h-12"
                    onClick={() => {
                      sounds.click();
                      navigate('/admin?tab=actions&subtab=organizations&user=' + userId);
                    }}
                  >
                    <Building2 className="w-5 h-5 mr-3 text-emerald-500" />
                    Gérer l'organisation
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Abonnement */}
            {subscription && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-amber-500" />
                    Abonnement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Plan</p>
                      {getPlanBadge(subscription.plan)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-600 mb-1">Statut</p>
                      <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                        {subscription.status}
                      </Badge>
                    </div>
                    {subscription.current_period_start && (
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">Période début</p>
                        <p className="text-sm text-slate-900">{formatDate(subscription.current_period_start)}</p>
                      </div>
                    )}
                    {subscription.current_period_end && (
                      <div>
                        <p className="text-sm font-medium text-slate-600 mb-1">Période fin</p>
                        <p className="text-sm text-slate-900">{formatDate(subscription.current_period_end)}</p>
                      </div>
                    )}
                    {subscription.status === 'active' && subscription.plan === 'gilbert_plus' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleCancelSubscription}
                        className="w-full"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Résilier l'abonnement
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Minutes Discovery - Affiché uniquement pour le plan Discovery */}
            {discoveryStatus?.subscription_plan === 'discovery' && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-500" />
                    Minutes Discovery
                    {loadingDiscovery && (
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Jauge de progression */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-600">Utilisation</span>
                        <span className={cn(
                          "text-sm font-semibold",
                          discoveryStatus.percentage_used >= 80
                            ? "text-red-600"
                            : discoveryStatus.percentage_used >= 50
                              ? "text-amber-600"
                              : "text-emerald-600"
                        )}>
                          {discoveryStatus.minutes_used} / {discoveryStatus.minutes_total} min
                        </span>
                      </div>
                      <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "absolute left-0 top-0 h-full rounded-full transition-all duration-500",
                            discoveryStatus.percentage_used >= 80
                              ? "bg-gradient-to-r from-red-400 to-red-500"
                              : discoveryStatus.percentage_used >= 50
                                ? "bg-gradient-to-r from-amber-400 to-amber-500"
                                : "bg-gradient-to-r from-emerald-400 to-emerald-500"
                          )}
                          style={{ width: `${Math.min(discoveryStatus.percentage_used, 100)}%` }}
                        />
                      </div>
                      <p className={cn(
                        "mt-2 text-xs",
                        discoveryStatus.percentage_used >= 80
                          ? "text-red-600"
                          : discoveryStatus.percentage_used >= 50
                            ? "text-amber-600"
                            : "text-slate-500"
                      )}>
                        {discoveryStatus.percentage_used >= 100
                          ? "Quota épuisé"
                          : `${discoveryStatus.minutes_remaining} minutes restantes (${Math.round(discoveryStatus.percentage_used)}% utilisé)`
                        }
                      </p>
                    </div>

                    {/* Statut accès transcription */}
                    <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                      <div className="flex items-center gap-2">
                        {discoveryStatus.can_view_transcript ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-sm text-emerald-700">Accès aux transcriptions actif</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span className="text-sm text-red-700">Accès aux transcriptions bloqué</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions admin */}
                    <div className="pt-4 border-t border-slate-200">
                      <p className="text-sm font-medium text-slate-700 mb-3">Actions admin</p>

                      {/* Ajouter des minutes */}
                      <div className="flex items-center gap-2 mb-3">
                        <Input
                          type="number"
                          min="1"
                          value={minutesToAdd}
                          onChange={(e) => setMinutesToAdd(parseInt(e.target.value) || 0)}
                          className="w-24 text-center"
                          placeholder="100"
                        />
                        <span className="text-sm text-slate-500">min</span>
                        <Button
                          size="sm"
                          onClick={handleAddDiscoveryMinutes}
                          disabled={addingMinutes || minutesToAdd <= 0}
                          className="flex-1"
                        >
                          {addingMinutes ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4 mr-2" />
                          )}
                          Ajouter
                        </Button>
                      </div>

                      {/* Reset minutes utilisées */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResetDiscoveryMinutes}
                        className="w-full"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Remettre l'utilisation à 0
                      </Button>

                      {/* Définir quota total */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                        <Input
                          type="number"
                          min={0}
                          value={minutesTotalInput}
                          onChange={(e) => setMinutesTotalInput(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-24"
                          placeholder="300"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSetDiscoveryMinutesTotal}
                          disabled={settingTotal}
                          className="flex-1"
                        >
                          {settingTotal ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Settings className="w-4 h-4 mr-2" />
                          )}
                          Définir quota total
                        </Button>
                      </div>

                      {/* Définir minutes utilisées */}
                      <div className="flex gap-2 mt-2">
                        <Input
                          type="number"
                          min={0}
                          max={discoveryStatus?.minutes_total || 300}
                          value={minutesUsedInput}
                          onChange={(e) => setMinutesUsedInput(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-24"
                          placeholder="0"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleSetDiscoveryMinutesUsed}
                          disabled={settingMinutes}
                          className="flex-1"
                        >
                          {settingMinutes ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Pencil className="w-4 h-4 mr-2" />
                          )}
                          Définir minutes utilisées
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>

          {/* Colonne droite - Statistiques et actions */}
          <motion.div variants={itemVariants} className="lg:col-span-2 space-y-6">
            {/* Statistiques */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Statistiques des réunions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-bold text-slate-900">{actualMeetingStats?.total_meetings || 0}</p>
                    <p className="text-sm text-slate-500">Total réunions</p>
                  </div>
                  <div className="text-center p-4 bg-emerald-50 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-600">{actualMeetingStats?.completed_transcriptions || 0}</p>
                    <p className="text-sm text-slate-500">Transcriptions</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{actualMeetingStats?.completed_summaries || 0}</p>
                    <p className="text-sm text-slate-500">Résumés</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{formatDuration(actualMeetingStats?.total_duration || 0)}</p>
                    <p className="text-sm text-slate-500">Durée totale</p>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-lg">
                    <p className="text-2xl font-bold text-amber-600">
                      {actualMeetingStats?.avg_duration ? formatDuration(actualMeetingStats.avg_duration) : '0h 0m'}
                    </p>
                    <p className="text-sm text-slate-500">Durée moyenne</p>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-bold text-slate-900">
                      {actualMeetingStats?.last_meeting_date
                        ? new Date(actualMeetingStats.last_meeting_date).toLocaleDateString('fr-FR')
                        : 'Jamais'}
                    </p>
                    <p className="text-sm text-slate-500">Dernière réunion</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Statistiques de partage */}
            {userDetails.sharing_stats && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-blue-500" />
                    Statistiques de partage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {userDetails.sharing_stats.meetings_shared_out || 0}
                      </p>
                      <p className="text-sm text-slate-500">Réunions partagées</p>
                    </div>
                    <div className="text-center p-4 bg-emerald-50 rounded-lg">
                      <p className="text-2xl font-bold text-emerald-600">
                        {userDetails.sharing_stats.meetings_shared_in || 0}
                      </p>
                      <p className="text-sm text-slate-500">Réunions reçues</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Historique des réunions */}
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Historique des réunions (20 dernières)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!actualRecentMeetings || actualRecentMeetings.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">Aucune réunion trouvée</p>
                ) : (
                  <div className="space-y-3">
                    {actualRecentMeetings.map((meeting: any) => (
                      <div
                        key={meeting.id}
                        className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900 mb-1">{meeting.title || 'Sans titre'}</h3>
                            <p className="text-sm text-slate-500 mb-2">
                              {formatDate(meeting.created_at)} • {formatDuration(meeting.duration_seconds)}
                            </p>
                            {meeting.template_name && (
                              <div className="flex items-center gap-1 text-xs text-blue-600">
                                <FileText className="w-3 h-3" />
                                <span>Template : {meeting.template_name}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 items-end">
                            <Badge variant={meeting.transcript_status === 'completed' ? 'default' : 'secondary'}>
                              {meeting.transcript_status === 'completed' ? (
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                              ) : (
                                <Clock className="w-3 h-3 mr-1" />
                              )}
                              {meeting.transcript_status === 'completed' ? 'Transcrit' : 'En attente'}
                            </Badge>
                            {meeting.summary_status && (
                              <Badge variant={meeting.summary_status === 'completed' ? 'default' : 'secondary'}>
                                {meeting.summary_status === 'completed' ? (
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                ) : (
                                  <Clock className="w-3 h-3 mr-1" />
                                )}
                                {meeting.summary_status === 'completed' ? 'Résumé' : 'En attente'}
                              </Badge>
                            )}
                            <Badge variant="outline">
                              {meeting.speakers_count || 0} intervenant(s)
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Templates disponibles (assignés) */}
            {userDetails.assigned_templates && userDetails.assigned_templates.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    Templates disponibles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userDetails.assigned_templates.map((template) => (
                      <div
                        key={template.template_id}
                        className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-slate-900">{template.template_name}</p>
                              {template.is_default && (
                                <Badge variant="default" className="bg-emerald-500 text-white">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  Défaut
                                </Badge>
                              )}
                            </div>
                            {template.template_description && (
                              <p className="text-sm text-slate-600 mt-1">{template.template_description}</p>
                            )}
                            <p className="text-xs text-slate-500 mt-1">
                              Assigné le : {formatDate(template.assigned_at)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Templates utilisés */}
            {userDetails.template_usage && userDetails.template_usage.length > 0 && (
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-purple-500" />
                    Templates utilisés
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {userDetails.template_usage.map((template) => (
                      <div
                        key={template.template_id}
                        className="p-4 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{template.template_name}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Dernière utilisation : {formatDate(template.last_used)}
                            </p>
                          </div>
                          <Badge variant="default">
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {template.usage_count} fois
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default UserDetailsPage;
