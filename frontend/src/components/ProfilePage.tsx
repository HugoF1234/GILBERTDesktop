/**
 * ProfilePage - Page de profil utilisateur
 * Affiche les stats, photo, nom, ID de partage, amis et abonnement
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  User,
  Mail,
  Calendar,
  Share2,
  Users,
  FileText,
  Clock,
  Copy,
  Check,
  Trash2,
  Loader2,
  UserPlus,
  X,
  Zap,
  LogOut,
  Settings,
  Crown,
  RefreshCw,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ProfilePageSkeleton } from './ui/Skeleton';
import { getUserProfile, updateUserProfile, uploadProfilePicture, formatImageUrl, getDiscoveryStatus } from '../services/profileService';
import type { ProfileData, DiscoveryStatus } from '../services/profileService';
import { getMyShareId, removeContact, addContactByShareId } from '../services/shareService';
import { logoutUser } from '../services/authService';
import { useNotification } from '../contexts/NotificationContext';
import { useDataStore } from '../stores/dataStore';
import { useNavigate } from 'react-router-dom';
import { subscriptionService } from '../services/subscriptionService';
import type { Subscription } from '../services/subscriptionService';
import { logger } from '@/utils/logger';

interface Stats {
  totalMeetings: number;
  totalDuration: number;
  totalContacts: number;
  lastActivity: string | null;
}

/** Composant Avatar de contact avec fallback robuste */
function ContactAvatar({ name, pictureUrl }: { name: string | null; pictureUrl: string | null }): JSX.Element {
  const [hasError, setHasError] = useState(false);
  // L'URL est déjà formatée par getMyContacts, pas besoin de reformater
  const showImage = pictureUrl && !hasError;

  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 flex-shrink-0">
      {showImage ? (
        <img
          src={pictureUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-600 font-semibold">
          {name?.charAt(0).toUpperCase() || '?'}
        </div>
      )}
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 12 } },
};

function ProfilePage(): JSX.Element {
  const { showSuccessPopup, showErrorPopup } = useNotification();
  const navigate = useNavigate();

  // ===== DATA STORE - Données globales avec cache SWR =====
  const storeMeetings = useDataStore((state) => state.meetings);
  const storeContacts = useDataStore((state) => state.contacts);
  const fetchMeetings = useDataStore((state) => state.fetchMeetings);
  const fetchContacts = useDataStore((state) => state.fetchContacts);
  const invalidateContacts = useDataStore((state) => state.invalidateContacts);

  // États
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [shareId, setShareId] = useState<string>('');
  const [stats, setStats] = useState<Stats>({
    totalMeetings: 0,
    totalDuration: 0,
    totalContacts: 0,
    lastActivity: null,
  });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [removingContact, setRemovingContact] = useState<string | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactId, setAddContactId] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fonction pour charger l'abonnement
  const loadSubscriptionData = useCallback(async () => {
    setLoadingSubscription(true);
    try {
      const response = await subscriptionService.getCurrentSubscription();
      if (response?.subscription) {
        // Pour Discovery, le status "none" est normal (pas d'abonnement Stripe)
        if (response.subscription.plan === 'discovery') {
          setSubscription(response.subscription);
        } else if (response.subscription.status !== 'canceled' && response.subscription.status !== 'none') {
          setSubscription(response.subscription);
        } else {
          setSubscription(null); // beta_tester par défaut
        }
      } else {
        setSubscription(null); // beta_tester par défaut
      }
    } catch (error: any) {
      logger.error('Erreur chargement abonnement:', error);
      // Ne pas afficher d'erreur, l'utilisateur est simplement sur beta_tester
      setSubscription(null);
    } finally {
      setLoadingSubscription(false);
    }
  }, []);

  // Fonction pour charger le statut Discovery
  const loadDiscoveryStatus = useCallback(async () => {
    setLoadingDiscovery(true);
    try {
      const status = await getDiscoveryStatus();
      setDiscoveryStatus(status);
    } catch (error: any) {
      logger.error('Erreur chargement statut Discovery:', error);
      setDiscoveryStatus(null);
    } finally {
      setLoadingDiscovery(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => {
    const loadData = async (): Promise<void> => {
      try {
        setLoading(true);

        // Charger profile et shareId (pas dans le store)
        // + déclencher les fetches du store pour meetings et contacts
        const [profileData, shareIdData] = await Promise.all([
          getUserProfile(),
          getMyShareId(),
          fetchMeetings(),  // Utilise le cache SWR du store
          fetchContacts(),  // Utilise le cache SWR du store
        ]);

        setProfile(profileData);
        setShareId(shareIdData.share_id);
        setEditedName(profileData.full_name);

        // Charger l'abonnement et le statut Discovery
        await Promise.all([
          loadSubscriptionData(),
          loadDiscoveryStatus(),
        ]);

      } catch (error: any) {
        logger.error('Erreur lors du chargement du profil:', error);
        // Ne pas afficher d'erreur si c'est une erreur d'authentification (apiClient gère déjà la redirection)
        // Ne pas afficher d'erreur si c'est une erreur 404 (ressource non trouvée)
        if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
          // apiClient gère déjà la redirection, ne rien faire
          return;
        }
        if (error?.detail === 'Not Found' || error?.status === 404) {
          // Ressource non trouvée, afficher un message plus spécifique
          showErrorPopup('Erreur', 'Profil non trouvé. Veuillez réessayer.');
        } else {
          showErrorPopup('Erreur', 'Impossible de charger le profil');
        }
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [showErrorPopup, loadSubscriptionData, loadDiscoveryStatus, fetchMeetings, fetchContacts]);

  // Calculer les stats à partir des données du store
  useEffect(() => {
    const totalDuration = storeMeetings.reduce((acc, m) => acc + (m.duration_seconds || 0), 0);
    const sortedMeetings = [...storeMeetings].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastMeeting = sortedMeetings[0];

    setStats({
      totalMeetings: storeMeetings.length,
      totalDuration,
      totalContacts: storeContacts.length,
      lastActivity: lastMeeting?.created_at || null,
    });
  }, [storeMeetings, storeContacts]);

  // Polling pour synchroniser les changements d'abonnement et Discovery (admin, etc.)
  useEffect(() => {
    const interval = setInterval(() => {
      loadSubscriptionData();
      loadDiscoveryStatus();
    }, 10000); // Recharger toutes les 10 secondes

    return () => clearInterval(interval);
  }, [loadSubscriptionData, loadDiscoveryStatus]);

  // Copier l'ID de partage
  const handleCopyShareId = useCallback(() => {
    navigator.clipboard.writeText(shareId);
    setCopied(true);
    showSuccessPopup('Copié !', 'Votre ID de partage a été copié');
    setTimeout(() => setCopied(false), 2000);
  }, [shareId, showSuccessPopup]);

  // Modifier le nom
  const handleSaveName = useCallback(async () => {
    if (!editedName.trim() || editedName === profile?.full_name) {
      setIsEditingName(false);
      return;
    }

    try {
      setSavingName(true);
      const updated = await updateUserProfile({ full_name: editedName.trim() });
      setProfile(updated);
      setIsEditingName(false);
      showSuccessPopup('Succès', 'Nom mis à jour');
    } catch (error: any) {
      logger.error('Erreur lors de la mise à jour du nom:', error);
      // Ne pas afficher d'erreur si c'est une erreur d'authentification
      if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
        return; // apiClient gère déjà la redirection
      }
      if (error?.detail === 'Not Found' || error?.status === 404) {
        showErrorPopup('Erreur', 'Profil non trouvé. Veuillez réessayer.');
      } else {
        showErrorPopup('Erreur', 'Impossible de mettre à jour le nom');
      }
    } finally {
      setSavingName(false);
    }
  }, [editedName, profile?.full_name, showSuccessPopup, showErrorPopup]);

  // Clic sur la photo pour upload
  const handlePhotoClick = useCallback(() => {
    if (!uploadingPhoto) {
      fileInputRef.current?.click();
    }
  }, [uploadingPhoto]);

  // Upload de photo
  const handlePhotoUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showErrorPopup('Erreur', 'L\'image est trop volumineuse (max 5 Mo)');
      return;
    }

    try {
      setUploadingPhoto(true);
      const updated = await uploadProfilePicture(file);
      setProfile(updated);
      showSuccessPopup('Succès', 'Photo de profil mise à jour');
    } catch (error: any) {
      logger.error('Erreur lors de l\'upload de la photo:', error);
      // Ne pas afficher d'erreur si c'est une erreur d'authentification
      if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
        return; // apiClient gère déjà la redirection
      }
      if (error?.detail === 'Not Found' || error?.status === 404) {
        showErrorPopup('Erreur', 'Profil non trouvé. Veuillez réessayer.');
      } else {
        showErrorPopup('Erreur', 'Impossible de mettre à jour la photo');
      }
    } finally {
      setUploadingPhoto(false);
    }
  }, [showSuccessPopup, showErrorPopup]);

  // Supprimer un contact
  const handleRemoveContact = useCallback(async (contactUserId: string) => {
    try {
      setRemovingContact(contactUserId);

      // Supprimer via l'API
      await removeContact(contactUserId);

      // Invalider le cache des contacts pour forcer un refresh
      invalidateContacts();
      await fetchContacts(true);
      showSuccessPopup('Succès', 'Contact supprimé');
    } catch (error: any) {
      logger.error('Erreur lors de la suppression du contact:', error);
      // Ne pas afficher d'erreur si c'est une erreur d'authentification
      if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
        return; // apiClient gère déjà la redirection
      }
      if (error?.detail?.includes('non trouvé') || error?.detail === 'Not Found' || error?.status === 404) {
        showErrorPopup('Erreur', 'Ce contact provient de l\'historique des partages et ne peut pas être supprimé.');
      } else {
        showErrorPopup('Erreur', 'Impossible de supprimer le contact');
      }
    } finally {
      setRemovingContact(null);
    }
  }, [showSuccessPopup, showErrorPopup, invalidateContacts, fetchContacts]);

  // Ajouter un contact par share_id
  const handleAddContact = useCallback(async () => {
    const trimmedId = addContactId.trim().toUpperCase();
    if (!trimmedId || trimmedId.length !== 6) {
      showErrorPopup('Erreur', 'L\'ID doit contenir 6 caractères');
      return;
    }

    try {
      setAddingContact(true);
      await addContactByShareId(trimmedId);

      // Rafraîchir les contacts
      invalidateContacts();
      await fetchContacts(true);

      showSuccessPopup('Succès', 'Contact ajouté avec succès');
      setAddContactId('');
      setShowAddContact(false);
    } catch (error: any) {
      logger.error('Erreur lors de l\'ajout du contact:', error);
      if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
        return;
      }
      if (error?.detail?.includes('not found') || error?.message?.includes('not found')) {
        showErrorPopup('Erreur', 'Aucun utilisateur trouvé avec cet ID');
      } else if (error?.detail?.includes('yourself') || error?.message?.includes('yourself')) {
        showErrorPopup('Erreur', 'Vous ne pouvez pas vous ajouter vous-même');
      } else if (error?.detail?.includes('already') || error?.message?.includes('already')) {
        showErrorPopup('Info', 'Ce contact est déjà dans votre liste');
      } else {
        showErrorPopup('Erreur', 'Impossible d\'ajouter ce contact');
      }
    } finally {
      setAddingContact(false);
    }
  }, [addContactId, showSuccessPopup, showErrorPopup, invalidateContacts, fetchContacts]);

  // Formater la durée
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  // Formater la date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ProfilePageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl mx-auto px-4 sm:px-6 py-8"
      >
        {/* Header avec photo et nom */}
        <motion.div variants={itemVariants} className="text-center mb-8">
          {/* Photo de profil - cliquable directement */}
          <button
            type="button"
            onClick={handlePhotoClick}
            disabled={uploadingPhoto}
            className={cn(
              "relative inline-block mb-4 rounded-full focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2",
              "cursor-pointer transition-opacity hover:opacity-90",
              uploadingPhoto && "opacity-50 cursor-not-allowed"
            )}
            title="Cliquez pour changer votre photo"
          >
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-lg">
              {uploadingPhoto ? (
                <div className="w-full h-full flex items-center justify-center bg-slate-200">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
                </div>
              ) : profile?.profile_picture_url ? (
                <img
                  src={formatImageUrl(profile.profile_picture_url) || ''}
                  alt={profile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-600 text-4xl font-bold">
                  {profile?.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />

          {/* Nom */}
          <div className="mb-2">
            {isEditingName ? (
              <div className="flex items-center justify-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-2xl font-bold text-center border-b-2 border-slate-500 bg-transparent outline-none px-2"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName();
                    if (e.key === 'Escape') {
                      setEditedName(profile?.full_name || '');
                      setIsEditingName(false);
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleSaveName()}
                  disabled={savingName}
                >
                  {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditedName(profile?.full_name || '');
                    setIsEditingName(false);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <h1
                onClick={() => setIsEditingName(true)}
                className="text-2xl sm:text-3xl font-bold text-slate-900 cursor-pointer hover:text-slate-700 transition-colors"
              >
                {profile?.full_name || 'Utilisateur'}
              </h1>
            )}
          </div>

          {/* Email */}
          <div className="flex items-center justify-center gap-2 text-slate-500 mb-4">
            <Mail className="w-4 h-4" />
            <span>{profile?.email}</span>
          </div>

          {/* ID de partage */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full">
            <Share2 className="w-4 h-4 text-slate-500" />
            <span className="font-mono text-sm text-slate-700">{shareId}</span>
            <button
              onClick={handleCopyShareId}
              className="p-1 hover:bg-slate-100 rounded-full transition-colors"
              title="Copier l'ID"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4 text-slate-500" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Statistiques - compactes sur mobile */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardContent className="p-2.5 sm:p-4 text-center">
              <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 mx-auto mb-1 sm:mb-2" />
              <p className="text-lg sm:text-2xl font-bold text-slate-900">{stats.totalMeetings}</p>
              <p className="text-[10px] sm:text-xs text-slate-500">Réunions</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-2.5 sm:p-4 text-center">
              <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 mx-auto mb-1 sm:mb-2" />
              <p className="text-lg sm:text-2xl font-bold text-slate-900">{formatDuration(stats.totalDuration)}</p>
              <p className="text-[10px] sm:text-xs text-slate-500">Durée totale</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-2.5 sm:p-4 text-center">
              <Users className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 mx-auto mb-1 sm:mb-2" />
              <p className="text-lg sm:text-2xl font-bold text-slate-900">{stats.totalContacts}</p>
              <p className="text-[10px] sm:text-xs text-slate-500">Contacts</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-2.5 sm:p-4 text-center">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-slate-600 mx-auto mb-1 sm:mb-2" />
              <p className="text-xs sm:text-sm font-semibold text-slate-900">
                {stats.lastActivity ? formatDate(stats.lastActivity) : 'Aucune'}
              </p>
              <p className="text-[10px] sm:text-xs text-slate-500">Dernière activité</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Section Mon Plan - Affiche uniquement le plan actuel */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-base sm:text-lg">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                  Mon Plan
                </div>
                {loadingSubscription && (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
              {/* Plan actuel - dynamique */}
              <div className={cn(
                "p-3 sm:p-4 rounded-xl border-2",
                subscription?.plan === 'enterprise'
                  ? "border-purple-600 bg-purple-50/30"
                  : (subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly' || subscription?.plan === 'gilbert_plus_yearly')
                    ? "border-amber-500 bg-amber-50/30"
                    : discoveryStatus?.subscription_plan === 'discovery'
                      ? "border-emerald-500 bg-emerald-50/30"
                      : "border-blue-600 bg-blue-50/30"
              )}>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-emerald-100 text-emerald-700 rounded">
                    Offre actuelle
                  </span>
                  {(subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly' || subscription?.plan === 'gilbert_plus_yearly') && (
                    <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                  )}
                  {loadingDiscovery && (
                    <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin text-slate-400" />
                  )}
                </div>

                <h3 className="font-semibold text-base sm:text-lg text-slate-900 mb-0.5 sm:mb-1">
                  {subscription?.plan === 'enterprise'
                    ? 'Entreprise'
                    : (subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly' || subscription?.plan === 'gilbert_plus_yearly')
                      ? 'Gilbert Pro'
                      : discoveryStatus?.subscription_plan === 'discovery'
                        ? 'Discovery'
                        : 'Bêta Testeur'}
                </h3>

                {/* Nom de l'organisation pour enterprise */}
                {subscription?.plan === 'enterprise' && subscription?.organization_name && (
                  <p className="text-sm text-purple-700 font-medium mb-2">
                    {subscription.organization_name}
                  </p>
                )}

                {/* Type d'abonnement (mensuel/annuel) pour Gilbert Pro */}
                {(subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly' || subscription?.plan === 'gilbert_plus_yearly') && (
                  <p className="text-sm text-amber-700 font-medium mb-2">
                    {subscription?.plan === 'gilbert_plus_yearly' ? 'Abonnement annuel' : 'Abonnement mensuel'}
                  </p>
                )}

                <div className="space-y-1 sm:space-y-1.5 mb-4">
                  {subscription?.plan === 'enterprise' ? (
                    <>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Tout Gilbert Pro inclus</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Templates personnalisés</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Groupes et sous-groupes</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Support dédié</span>
                      </div>
                    </>
                  ) : (subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly' || subscription?.plan === 'gilbert_plus_yearly') ? (
                    <>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Durée illimitée</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Modèles personnalisés</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Support prioritaire</span>
                      </div>
                    </>
                  ) : discoveryStatus?.subscription_plan === 'discovery' ? (
                    <>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span><strong>{discoveryStatus.minutes_total}</strong> minutes offertes</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Transcription automatique</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Synthèses IA</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Export PDF / Word</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Enregistrement illimité</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Synthèses automatiques</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0" />
                        <span><strong>3h</strong> max par réunion</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Export PDF / Word</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Jauge Discovery - Affichée uniquement pour le plan Discovery */}
                {discoveryStatus?.subscription_plan === 'discovery' && (
                  <div className="mb-4 p-3 sm:p-4 rounded-lg bg-white border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-medium text-slate-700">
                        Minutes utilisées
                      </span>
                      <span className={cn(
                        "text-xs sm:text-sm font-semibold",
                        discoveryStatus.percentage_used >= 80
                          ? "text-red-600"
                          : discoveryStatus.percentage_used >= 50
                            ? "text-amber-600"
                            : "text-emerald-600"
                      )}>
                        {discoveryStatus.minutes_used} / {discoveryStatus.minutes_total} min
                      </span>
                    </div>

                    {/* Barre de progression */}
                    <div className="relative h-3 sm:h-4 bg-slate-100 rounded-full overflow-hidden">
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

                    {/* Message selon le niveau */}
                    <p className={cn(
                      "mt-2 text-[10px] sm:text-xs",
                      discoveryStatus.percentage_used >= 80
                        ? "text-red-600"
                        : discoveryStatus.percentage_used >= 50
                          ? "text-amber-600"
                          : "text-slate-500"
                    )}>
                      {discoveryStatus.percentage_used >= 100
                        ? "Quota épuisé - Passez à Gilbert Pro pour continuer"
                        : discoveryStatus.percentage_used >= 80
                          ? `Plus que ${discoveryStatus.minutes_remaining} minutes restantes`
                          : discoveryStatus.percentage_used >= 50
                            ? `${discoveryStatus.minutes_remaining} minutes restantes`
                            : `${discoveryStatus.minutes_remaining} minutes disponibles`
                      }
                    </p>

                    {/* Alerte si quota épuisé */}
                    {!discoveryStatus.can_view_transcript && (
                      <div className="mt-3 p-2 sm:p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs sm:text-sm text-red-700 font-medium">
                          Quota épuisé
                        </p>
                        <p className="text-[10px] sm:text-xs text-red-600 mt-1">
                          Passez à Gilbert Pro pour accéder à vos transcriptions et continuer à enregistrer sans limite.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Bouton pour gérer l'abonnement */}
                <Button
                  onClick={() => navigate('/settings')}
                  variant="outline"
                  className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                  Gérer mon abonnement
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 items-start">
          {/* Mes contacts */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="border-slate-200 h-full flex flex-col">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
                <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                    Mes contacts
                  </div>
                  <button
                    onClick={() => setShowAddContact(!showAddContact)}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      showAddContact
                        ? "bg-slate-200 text-slate-700"
                        : "hover:bg-slate-100 text-slate-500"
                    )}
                    title="Ajouter un contact"
                  >
                    {showAddContact ? (
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 flex-1">
                {/* Formulaire d'ajout de contact - minimaliste */}
                {showAddContact && (
                  <div className="mb-3 flex gap-2">
                    <input
                      type="text"
                      value={addContactId}
                      onChange={(e) => setAddContactId(e.target.value.toUpperCase())}
                      placeholder="ID (ex: ABC123)"
                      maxLength={6}
                      className="flex-1 px-3 py-2 text-sm font-mono uppercase bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent placeholder:text-slate-400 placeholder:normal-case"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleAddContact();
                        if (e.key === 'Escape') {
                          setShowAddContact(false);
                          setAddContactId('');
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      onClick={() => void handleAddContact()}
                      disabled={addingContact || addContactId.length !== 6}
                      size="sm"
                      className="px-3 rounded-xl"
                    >
                      {addingContact ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                )}
                {storeContacts.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-slate-500">
                    <UserPlus className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-slate-300" />
                    <p className="text-xs sm:text-sm">Aucun contact pour le moment</p>
                    <p className="text-[10px] sm:text-xs mt-1">Partagez des réunions pour ajouter des contacts</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3 max-h-60 sm:max-h-80 overflow-y-auto">
                    {storeContacts.map((contact) => (
                      <div
                        key={contact.contact_user_id}
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <ContactAvatar
                          name={contact.contact_name}
                          pictureUrl={contact.contact_profile_picture ?? null}
                        />

                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm sm:text-base text-slate-800 truncate">
                            {contact.contact_name}
                          </p>
                          {contact.contact_email && (
                            <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                              {contact.contact_email}
                            </p>
                          )}
                        </div>

                        <button
                          onClick={() => void handleRemoveContact(contact.contact_user_id)}
                          disabled={removingContact === contact.contact_user_id}
                          className={cn(
                            "p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors",
                            removingContact === contact.contact_user_id && "opacity-50 cursor-not-allowed"
                          )}
                          title="Supprimer le contact"
                        >
                          {removingContact === contact.contact_user_id ? (
                            <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Informations du compte */}
          <motion.div variants={itemVariants} className="h-full">
            <Card className="border-slate-200 h-full flex flex-col">
              <CardHeader className="px-3 sm:px-6 pt-3 sm:pt-6 pb-2 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                  Informations du compte
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 flex-1">
                <div className="space-y-3 sm:space-y-4">
                  <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-slate-50">
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5 sm:mb-1">Email</p>
                    <p className="font-medium text-sm sm:text-base text-slate-800 truncate">{profile?.email}</p>
                  </div>
                  <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-slate-50">
                    <p className="text-[10px] sm:text-xs text-slate-500 mb-0.5 sm:mb-1">Membre depuis</p>
                    <p className="font-medium text-sm sm:text-base text-slate-800">
                      {profile?.created_at ? formatDate(profile.created_at) : 'Non disponible'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Bouton de déconnexion */}
        <motion.div variants={itemVariants} className="mt-6 sm:mt-8 text-center">
          <button
            type="button"
            onClick={() => {
              logoutUser();
              navigate('/auth');
            }}
            className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Se déconnecter
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default ProfilePage;
