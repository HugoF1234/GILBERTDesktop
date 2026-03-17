/**
 * AdminDashboard - Tableau de bord administrateur
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Users,
  Search,
  RefreshCw,
  Eye,
  Ban,
  CheckCircle,
  Trash2,
  UserPlus,
  Loader2,
  AlertCircle,
  Mail,
  Send,
  Clock,
  FileText,
  Activity,
  Server,
  Mic,
  Mic2,
  Settings,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  MailOpen,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Building2,
  BarChart3,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import { useNotification } from '../contexts/NotificationContext';
import apiClient from '../services/apiClient';
import { getAdminUsers, getAdminStats, toggleUserStatus, deleteUser, createUserByAdmin } from '../services/meetingService';
import QueueTab from './QueueTab';
import ActivityTab from './ActivityTab';
import RecordingsTab from './RecordingsTab';
import ServicesMonitoringTab from './ServicesMonitoringTab';
import AdminTemplatesTab from './AdminTemplatesTab';
import AdminOrganizationsTab from './AdminOrganizationsTab';
import AdminStatisticsTab from './AdminStatisticsTab';
import sounds from '../utils/soundDesign';
import { getAllOrganizations, getUserOrganizationsAdmin, type Organization } from '../services/organizationService';
import { logger } from '@/utils/logger';

interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  last_login?: string;
  is_active: boolean;
  oauth_provider?: string;
  oauth_id?: string;
  profile_picture_url?: string;
  is_online?: boolean;
  last_activity?: string;
  meeting_count?: number;
  last_meeting_date?: string;
  subscription_plan?: string;
  transcription_provider?: string;
}


interface Stats {
  users: {
    total: number;
    online: number;
    offline: number;
    new_today: number;
    new_this_week: number;
    new_this_month: number;
  };
  meetings: {
    total: number;
    completed_transcriptions: number;
    completed_summaries: number;
    total_duration: number;
    avg_duration: number;
  };
  system: {
    uptime: string;
    last_updated: string;
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

const AdminDashboard: React.FC = () => {
  const { showSuccessPopup, showErrorPopup } = useNotification();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // États principaux
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // Tous les utilisateurs pour les recherches
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingAllUsers, setLoadingAllUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [mainTabValue, setMainTabValue] = useState('users');
  const [refreshing, setRefreshing] = useState(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // États pour la création d'utilisateur
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createUserData, setCreateUserData] = useState({
    email: '',
    password: '',
    full_name: '',
    email_verified: true,
    is_active: true,
  });
  const [createUserError, setCreateUserError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // États pour la suppression
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // États pour l'onglet Actions (abonnements, emails, organisations et transcription)
  const [actionsSubTab, setActionsSubTab] = useState<'subscriptions' | 'emails' | 'organizations' | 'transcription'>('subscriptions');
  const [assigningSubscription, setAssigningSubscription] = useState(false);
  const [selectedUserForSubscription, setSelectedUserForSubscription] = useState<User | null>(null);
  const [quickPlanChangeUser, setQuickPlanChangeUser] = useState<User | null>(null);
  const [showQuickPlanDialog, setShowQuickPlanDialog] = useState(false);
  const [subscriptionPlan, setSubscriptionPlan] = useState<'beta_tester' | 'discovery' | 'gilbert_plus_monthly' | 'gilbert_plus_yearly' | 'enterprise'>('gilbert_plus_monthly');
  const [subscriptionSearchQuery, setSubscriptionSearchQuery] = useState('');
  const [selectedOrganizationForEnterprise, setSelectedOrganizationForEnterprise] = useState<string>('');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  // Discovery minutes controls
  const [discoveryMinutesTotal, setDiscoveryMinutesTotal] = useState<number>(300);
  const [discoveryMinutesUsed, setDiscoveryMinutesUsed] = useState<number>(0);
  
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailType, setEmailType] = useState<'individual' | 'group'>('individual');
  const [emailData, setEmailData] = useState({
    recipient: '',
    subject: '',
    body: '',
    selectedUsers: [] as string[],
  });
  // États pour les emails (nouveau système simplifié)
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [emailPreview, setEmailPreview] = useState<{ subject: string; html_content: string } | null>(null);
  // Filtres pour emails groupés
  const [emailFilterPlan, setEmailFilterPlan] = useState<string>('');
  const [emailFilterOrg, setEmailFilterOrg] = useState<string>('');
  const [emailSearchQuery, setEmailSearchQuery] = useState('');
  // Variables disponibles pour les emails
  const emailVariables = ['nom', 'prenom', 'email', 'plan', 'date', 'heure', 'annee'];

  // États pour l'onglet Transcription (provider)
  const [assigningTranscription, setAssigningTranscription] = useState(false);
  const [selectedUserForTranscription, setSelectedUserForTranscription] = useState<User | null>(null);
  const [transcriptionProvider, setTranscriptionProvider] = useState<'assemblyai' | 'ovh_whisper' | 'voxtral'>('assemblyai');
  const [transcriptionSearchQuery, setTranscriptionSearchQuery] = useState('');

  // Tri des utilisateurs
  const [sortBy, setSortBy] = useState<'name' | 'email' | 'status' | 'plan' | 'connection' | 'created' | 'meetings'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // États pour la queue et les enregistrements
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [queueHistory, setQueueHistory] = useState<any[]>([]);
  const [activeRecordings, setActiveRecordings] = useState<any[]>([]);
  const [activeRecordingsError, setActiveRecordingsError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [servicesMonitoring, setServicesMonitoring] = useState<any>(null);

  // Charger les données initiales
  const loadData = useCallback(async () => {
    try {
      if (debouncedSearchQuery === searchQuery) {
        setLoading(true);
      }
      setError(null);
      
      const [usersData, statsData] = await Promise.all([
        getAdminUsers(currentPage, 50, debouncedSearchQuery, sortBy, sortOrder),
        getAdminStats(),
      ]);
      
      setUsers(usersData.users || []);
      setTotalPages(usersData.pagination?.pages || 1);
      setStats(statsData);
    } catch (err: any) {
      logger.error('Erreur lors du chargement des données:', err);
      if (err?.detail === 'Not authenticated' || err?.message === 'Not authenticated') {
        return;
      }
      if (err?.detail === 'Not Found' || err?.status === 404) {
        setError('Ressource non trouvée');
      } else {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearchQuery, sortBy, sortOrder]);

  // Debouncing de la recherche
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 500);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Rediriger vers la page de détails utilisateur
  const handleViewUserDetails = (userId: string) => {
    sounds.click();
    navigate(`/admin/users/${userId}`);
  };

  // Ouvrir le dialog de changement rapide de plan
  const handleOpenQuickPlanChange = async (user: User) => {
    sounds.click();
    setQuickPlanChangeUser(user);
    setSelectedUserForSubscription(user);
    // Définir le plan actuel de l'utilisateur
    const currentPlan = user.subscription_plan || 'beta_tester';
    if (currentPlan === 'gilbert_plus') {
      setSubscriptionPlan('gilbert_plus_monthly');
    } else if (currentPlan === 'gilbert_plus_yearly') {
      setSubscriptionPlan('gilbert_plus_yearly');
    } else if (currentPlan === 'enterprise') {
      setSubscriptionPlan('enterprise');
    } else if (currentPlan === 'discovery') {
      setSubscriptionPlan('discovery');
      // Charger les minutes Discovery actuelles
      try {
        const response = await apiClient.get(`/admin/users/${user.id}/discovery`);
        if (response?.discovery) {
          setDiscoveryMinutesTotal(response.discovery.minutes_total || 300);
          setDiscoveryMinutesUsed(response.discovery.minutes_used || 0);
        }
      } catch (err) {
        logger.error('Erreur chargement Discovery status:', err);
        setDiscoveryMinutesTotal(300);
        setDiscoveryMinutesUsed(0);
      }
    } else {
      setSubscriptionPlan('beta_tester');
    }
    setShowQuickPlanDialog(true);
  };

  // Fermer le dialog de changement rapide
  const handleCloseQuickPlanDialog = () => {
    setShowQuickPlanDialog(false);
    setQuickPlanChangeUser(null);
    setSelectedOrganizationForEnterprise('');
  };

  // Rafraîchir les données
  const handleRefresh = async () => {
    setRefreshing(true);
    sounds.click();
    await loadData();
    setRefreshing(false);
  };

  // Basculer le statut d'un utilisateur
  const handleToggleUserStatus = async (userId: string) => {
    try {
      sounds.click();
      await toggleUserStatus(userId);
      await loadData();
      showSuccessPopup('Succès', 'Statut utilisateur mis à jour');
    } catch (error: any) {
      logger.error('Erreur lors du changement de statut:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de changer le statut');
    }
  };

  // Gérer la suppression d'utilisateur
  const handleDeleteUser = (user: User) => {
    sounds.click();
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    setDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      await loadData();
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
      showSuccessPopup('Succès', 'Utilisateur supprimé avec succès');
    } catch (error: any) {
      logger.error('Erreur lors de la suppression:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible de supprimer l\'utilisateur');
    } finally {
      setDeleting(false);
    }
  };

  // Gérer la création d'utilisateur
  const handleOpenCreateUser = () => {
    sounds.click();
    setCreateUserOpen(true);
    setCreateUserError(null);
    setShowPassword(false);
    setCreateUserData({
      email: '',
      password: '',
      full_name: '',
      email_verified: true,
      is_active: true,
    });
  };

  const handleCreateUser = async () => {
    if (!createUserData.email || !createUserData.password) {
      setCreateUserError('Email et mot de passe sont requis');
      return;
    }

    if (createUserData.password.length < 8) {
      setCreateUserError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    setCreating(true);
    setCreateUserError(null);

    try {
      await createUserByAdmin(createUserData);
      await loadData();
      handleCloseCreateUser();
      showSuccessPopup('Succès', 'Utilisateur créé avec succès');
    } catch (error: any) {
      logger.error('Erreur lors de la création de l\'utilisateur:', error);
      setCreateUserError(error?.message || 'Erreur lors de la création de l\'utilisateur');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseCreateUser = () => {
    setCreateUserOpen(false);
    setCreateUserError(null);
  };

  // Gérer l'attribution d'abonnement
  const handleAssignSubscription = async () => {
    if (!selectedUserForSubscription) {
      showErrorPopup('Erreur', 'Veuillez sélectionner un utilisateur');
      return;
    }

    // Validation pour le plan enterprise
    if (subscriptionPlan === 'enterprise' && !selectedOrganizationForEnterprise) {
      showErrorPopup('Erreur', 'Veuillez sélectionner une organisation pour le plan Entreprise');
      return;
    }

    setAssigningSubscription(true);
    try {
      sounds.click();
      const payload: any = {
        user_id: selectedUserForSubscription.id,
        plan: subscriptionPlan,
      };

      // Ajouter l'organisation si plan enterprise
      if (subscriptionPlan === 'enterprise' && selectedOrganizationForEnterprise) {
        payload.organization_id = selectedOrganizationForEnterprise;
      }

      await apiClient.post(`/admin/subscriptions/assign`, payload);

      // Si plan discovery, mettre à jour les minutes
      if (subscriptionPlan === 'discovery') {
        try {
          await apiClient.put(`/admin/users/${selectedUserForSubscription.id}/discovery`, {
            minutes_total: discoveryMinutesTotal,
            minutes_used: discoveryMinutesUsed,
          });
        } catch (err) {
          logger.error('Erreur mise à jour minutes Discovery:', err);
        }
      }

      await loadData();
      setSelectedUserForSubscription(null);
      setSubscriptionPlan('gilbert_plus_monthly');
      setSelectedOrganizationForEnterprise('');
      setDiscoveryMinutesTotal(300);
      setDiscoveryMinutesUsed(0);

      const planNames: Record<string, string> = {
        'beta_tester': 'Beta Testeur',
        'discovery': 'Discovery',
        'gilbert_plus_monthly': 'Gilbert Pro (Mensuel)',
        'gilbert_plus_yearly': 'Gilbert Pro (Annuel)',
        'enterprise': 'Entreprise',
      };
      showSuccessPopup('Succès', `Abonnement ${planNames[subscriptionPlan] || subscriptionPlan} attribué avec succès`);
    } catch (error: any) {
      logger.error('Erreur lors de l\'attribution de l\'abonnement:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible d\'attribuer l\'abonnement');
    } finally {
      setAssigningSubscription(false);
    }
  };


  // Gérer l'envoi d'emails avec contenu libre
  const handleSendEmail = async () => {
    if (!emailSubject.trim()) {
      showErrorPopup('Erreur', 'Veuillez remplir le sujet de l\'email');
      return;
    }

    if (!emailContent.trim()) {
      showErrorPopup('Erreur', 'Veuillez remplir le contenu de l\'email');
      return;
    }

    if (emailType === 'individual' && !emailData.recipient) {
      showErrorPopup('Erreur', 'Le destinataire est requis');
      return;
    }

    if (emailType === 'group' && emailData.selectedUsers.length === 0) {
      showErrorPopup('Erreur', 'Sélectionnez au moins un destinataire');
      return;
    }

    setSendingEmail(true);
    try {
      // Récupérer les emails des destinataires
      let recipientEmails: string[] = [];
      if (emailType === 'individual') {
        recipientEmails = [emailData.recipient];
      } else {
        // Récupérer les emails à partir des IDs sélectionnés
        recipientEmails = allUsers
          .filter(u => emailData.selectedUsers.includes(u.id))
          .map(u => u.email);
      }

      const payload = {
        subject: emailSubject,
        content: emailContent,
        recipient_emails: recipientEmails,
      };

      const response = await apiClient.post('/admin/emails/send-custom', payload) as { success?: boolean; sent_count?: number };

      if (emailType === 'individual') {
        showSuccessPopup('Succès', 'Email envoyé avec succès');
      } else {
        showSuccessPopup('Succès', `Email envoyé à ${response.sent_count || recipientEmails.length} destinataire(s)`);
      }

      // Reset form
      setEmailData({
        recipient: '',
        subject: '',
        body: '',
        selectedUsers: [],
      });
      setEmailSubject('');
      setEmailContent('');
      setEmailPreview(null);
      setEmailFilterPlan('');
      setEmailFilterOrg('');
    } catch (error: any) {
      logger.error('Erreur lors de l\'envoi de l\'email:', error);
      showErrorPopup('Erreur', error?.message || 'Impossible d\'envoyer l\'email');
    } finally {
      setSendingEmail(false);
    }
  };

  // Fonctions pour charger les données de la queue et des enregistrements
  const loadQueueData = async () => {
    try {
      const response = await apiClient.get('/admin/queue/status') as { queue_status?: any };
      setQueueStatus(response && response.queue_status ? response.queue_status : {});
    } catch (error) {
      logger.error('Erreur lors du chargement du statut de la queue:', error);
    }
  };

  const loadQueueHistory = async () => {
    try {
      const response = await apiClient.get('/admin/queue/history?limit=50') as { transcriptions?: any[] };
      setQueueHistory(response && response.transcriptions ? response.transcriptions : []);
    } catch (error: any) {
      logger.error('Erreur lors du chargement de l\'historique de la queue:', error);
    }
  };

  const loadActiveRecordings = async () => {
    try {
      setActiveRecordingsError(null);
      const response = await apiClient.get('/admin/recordings/active') as {
        active_recordings?: any[];
        error?: string;
        error_message?: string;
      };
      setActiveRecordings(response?.active_recordings ?? []);
      if (response?.error && response?.error_message) {
        setActiveRecordingsError(response.error_message);
      }
    } catch (error: any) {
      logger.error('Erreur lors du chargement des enregistrements actifs:', error);
      setActiveRecordingsError('Impossible de charger les enregistrements actifs. Vérifiez que le backend et Redis sont disponibles.');
    }
  };

  const loadSystemHealth = async () => {
    try {
      const response = await apiClient.get('/admin/system/health');
      setSystemHealth(response || {});
    } catch (error: any) {
      logger.error('Erreur lors du chargement de l\'état de santé:', error);
    }
  };

  const loadServicesMonitoring = async () => {
    try {
      const response = await apiClient.get('/admin/monitoring/services') as { monitoring?: any };
      setServicesMonitoring(response?.monitoring || null);
    } catch (error) {
      logger.error('Erreur lors du chargement du monitoring des services:', error);
    }
  };

  // Charger tous les utilisateurs pour les recherches (sans pagination)
  const loadAllUsers = useCallback(async () => {
    try {
      setLoadingAllUsers(true);
      logger.debug('🔄 Chargement de TOUS les utilisateurs pour l\'onglet Actions...');
      
      // Charger la première page pour connaître le total
      const firstPageData = await getAdminUsers(1, 10000, '');
      const totalUsers = firstPageData.pagination?.total || 0;
      let loadedUsers = firstPageData.users || [];
      
      logger.debug(`📊 Total d'utilisateurs: ${totalUsers}, déjà chargés: ${loadedUsers.length}`);
      
      // Si il y a plus d'utilisateurs que la limite, charger les pages suivantes
      if (totalUsers > 10000) {
        const totalPages = Math.ceil(totalUsers / 10000);
        logger.debug(`📄 Chargement de ${totalPages} pages...`);
        
        for (let page = 2; page <= totalPages; page++) {
          const pageData = await getAdminUsers(page, 10000, '');
          loadedUsers = [...loadedUsers, ...(pageData.users || [])];
          logger.debug(`✅ Page ${page}/${totalPages} chargée (${loadedUsers.length}/${totalUsers} utilisateurs)`);
        }
      }
      
      logger.debug(`✅ ${loadedUsers.length} utilisateurs chargés pour l'onglet Actions (sur ${totalUsers} total)`);
      setAllUsers(loadedUsers);
    } catch (err: any) {
      logger.error('❌ Erreur lors du chargement de tous les utilisateurs:', err);
      // En cas d'erreur, utiliser les utilisateurs de la page actuelle
      logger.debug(`⚠️ Utilisation des ${users.length} utilisateurs de la page actuelle comme fallback`);
      setAllUsers(users);
    } finally {
      setLoadingAllUsers(false);
    }
  }, [users]);

  // Charger les organisations pour l'attribution enterprise (celles de l'utilisateur sélectionné)
  const loadOrganizationsForEnterprise = useCallback(async (userId?: string) => {
    try {
      setLoadingOrganizations(true);
      if (userId) {
        // Charger uniquement les organisations dont l'utilisateur est membre
        const orgs = await getUserOrganizationsAdmin(userId);
        setOrganizations(orgs || []);
      } else {
        // Pas d'utilisateur sélectionné, vider la liste
        setOrganizations([]);
      }
    } catch (err) {
      logger.error('Erreur lors du chargement des organisations:', err);
      setOrganizations([]);
    } finally {
      setLoadingOrganizations(false);
    }
  }, []);

  // Charger tous les utilisateurs quand on ouvre l'onglet Actions
  useEffect(() => {
    if (mainTabValue === 'actions') {
      loadAllUsers();
    }
  }, [mainTabValue, loadAllUsers]);

  // Charger les organisations quand on arrive sur l'onglet emails
  useEffect(() => {
    if (mainTabValue === 'actions' && actionsSubTab === 'emails') {
      // Charger toutes les organisations pour le filtre
      const loadAllOrganizations = async () => {
        try {
          const orgs = await getAllOrganizations();
          setOrganizations(orgs || []);
        } catch (err) {
          logger.error('Erreur chargement organisations:', err);
        }
      };
      loadAllOrganizations();
    }
  }, [mainTabValue, actionsSubTab]);

  // Fonction pour charger les utilisateurs filtrés
  const loadFilteredUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (emailFilterPlan) params.append('plan', emailFilterPlan);
      if (emailFilterOrg) params.append('organization_id', emailFilterOrg);

      const response = await apiClient.get(`/admin/users/filtered?${params.toString()}`) as { users: any[] };
      return response.users || [];
    } catch (err) {
      logger.error('Erreur filtrage utilisateurs:', err);
      return [];
    }
  }, [emailFilterPlan, emailFilterOrg]);

  // Appliquer les filtres quand ils changent
  useEffect(() => {
    const applyFilters = async () => {
      if (emailType === 'group' && (emailFilterPlan || emailFilterOrg)) {
        const filteredUsers = await loadFilteredUsers();
        setEmailData(prev => ({
          ...prev,
          selectedUsers: filteredUsers.map((u: any) => u.id)
        }));
      }
    };
    applyFilters();
  }, [emailFilterPlan, emailFilterOrg, emailType, loadFilteredUsers]);

  // Template HTML Gilbert unifié
  const generateGilbertEmailHTML = useCallback((content: string, previewMode = false) => {
    // Remplacer les @variables par leurs valeurs (pour preview) ou garder le placeholder stylisé
    let processedContent = content;
    const now = new Date();
    const previewValues: Record<string, string> = {
      nom: 'Jean Dupont',
      prenom: 'Jean',
      email: 'jean.dupont@example.com',
      plan: 'Gilbert Pro',
      date: now.toLocaleDateString('fr-FR'),
      heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      annee: now.getFullYear().toString(),
    };

    // Remplacer @variable par la valeur ou un span stylisé
    emailVariables.forEach(v => {
      const regex = new RegExp(`@${v}\\b`, 'g');
      if (previewMode) {
        processedContent = processedContent.replace(regex, `<span style="color: #6366f1; font-weight: 600;">${previewValues[v]}</span>`);
      } else {
        processedContent = processedContent.replace(regex, `{{${v}}}`);
      }
    });

    // Convertir les sauts de ligne en <br>
    processedContent = processedContent.replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 40px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">Gilbert</h1>
                            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">Votre assistant de transcription intelligent</p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <div style="color: #475569; line-height: 1.8; font-size: 15px;">
                                ${processedContent}
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 30px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                                © ${now.getFullYear()} Gilbert - Tous droits réservés<br>
                                <a href="https://gilbert-assistant.ovh" style="color: #6366f1; text-decoration: none;">gilbert-assistant.ovh</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
  }, [emailVariables]);

  // Fonction pour générer la prévisualisation
  const generatePreview = useCallback(() => {
    if (!emailSubject.trim() || !emailContent.trim()) {
      showErrorPopup('Erreur', 'Veuillez remplir le sujet et le contenu de l\'email');
      return;
    }

    // Remplacer @variables dans le sujet pour la preview
    let previewSubject = emailSubject;
    const now = new Date();
    const previewValues: Record<string, string> = {
      nom: 'Jean Dupont',
      prenom: 'Jean',
      email: 'jean.dupont@example.com',
      plan: 'Gilbert Pro',
      date: now.toLocaleDateString('fr-FR'),
      heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      annee: now.getFullYear().toString(),
    };
    emailVariables.forEach(v => {
      const regex = new RegExp(`@${v}\\b`, 'g');
      previewSubject = previewSubject.replace(regex, previewValues[v]);
    });

    const htmlContent = generateGilbertEmailHTML(emailContent, true);
    setEmailPreview({ subject: previewSubject, html_content: htmlContent });
  }, [emailSubject, emailContent, emailVariables, generateGilbertEmailHTML, showErrorPopup]);

  // Insérer une variable dans le contenu
  const insertVariable = useCallback((variable: string, target: 'subject' | 'content') => {
    const varText = `@${variable}`;
    if (target === 'subject') {
      setEmailSubject(prev => prev + varText);
    } else {
      setEmailContent(prev => prev + varText);
    }
  }, []);

  // Charger les organisations de l'utilisateur sélectionné quand le plan est 'enterprise'
  useEffect(() => {
    if (subscriptionPlan === 'enterprise' && selectedUserForSubscription) {
      loadOrganizationsForEnterprise(selectedUserForSubscription.id);
    } else {
      setOrganizations([]);
      setSelectedOrganizationForEnterprise('');
    }
  }, [subscriptionPlan, selectedUserForSubscription, loadOrganizationsForEnterprise]);

  // Charger les données au montage et quand le tri ou la recherche change
  useEffect(() => {
    if (mainTabValue === 'users') {
      loadData();
    } else if (mainTabValue === 'queue') {
      loadQueueData();
      loadSystemHealth();
    } else if (mainTabValue === 'activity') {
      loadQueueHistory();
    } else if (mainTabValue === 'monitoring') {
      loadServicesMonitoring();
    } else if (mainTabValue === 'recordings') {
      loadActiveRecordings();
    }
  }, [mainTabValue, sortBy, sortOrder, debouncedSearchQuery, currentPage, loadData]);

  // Auto-refresh toutes les 60 secondes (uniquement pour l'onglet utilisateurs)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (mainTabValue === 'users') {
      interval = setInterval(loadData, 60000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [loadData, mainTabValue]);

  // Gestion des paramètres d'URL pour les raccourcis depuis UserDetailsPage
  useEffect(() => {
    const tab = searchParams.get('tab');
    const subtab = searchParams.get('subtab');
    const userIdFromUrl = searchParams.get('user');

    if (tab === 'actions') {
      setMainTabValue('actions');
      if (subtab === 'subscriptions' || subtab === 'emails' || subtab === 'organizations' || subtab === 'transcription') {
        setActionsSubTab(subtab);
      }
      // Si un utilisateur est spécifié, le pré-sélectionner quand allUsers est chargé
      if (userIdFromUrl && allUsers.length > 0) {
        const userFromUrl = allUsers.find(u => u.id === userIdFromUrl);
        if (userFromUrl) {
          if (subtab === 'subscriptions') {
            setSelectedUserForSubscription(userFromUrl);
            setSubscriptionSearchQuery(userFromUrl.email);
          } else if (subtab === 'transcription') {
            setSelectedUserForTranscription(userFromUrl);
            setTranscriptionSearchQuery(userFromUrl.email);
            // Initialiser le provider avec la valeur actuelle de l'utilisateur
            setTranscriptionProvider((userFromUrl.transcription_provider as 'assemblyai' | 'ovh_whisper' | 'voxtral') || 'assemblyai');
          } else if (subtab === 'emails') {
            setEmailData(prev => ({ ...prev, recipient: userFromUrl.email }));
            setEmailSearchQuery(userFromUrl.email);
          }
        }
      }
    }
  }, [searchParams, allUsers]);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }
      return date.toLocaleString('fr-FR', {
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

  // Formater l'URL de la photo de profil
  const formatProfilePictureUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh';
    return url.startsWith('/') ? `${apiBaseUrl}${url}` : `${apiBaseUrl}/${url}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
  };

  const getPlanBadge = (plan?: string) => {
    switch (plan) {
      case 'discovery':
        return <Badge variant="default" className="bg-emerald-500 text-white">Discovery</Badge>;
      case 'gilbert_plus':
      case 'gilbert_plus_monthly':
        return <Badge variant="default" className="bg-amber-500 text-white">Gilbert Pro</Badge>;
      case 'gilbert_plus_yearly':
        return <Badge variant="default" className="bg-amber-600 text-white">Gilbert Pro (Annuel)</Badge>;
      case 'enterprise':
        return <Badge variant="default" className="bg-purple-600 text-white">Entreprise</Badge>;
      default:
        return <Badge variant="secondary">Beta Testeur</Badge>;
    }
  };

  // Fonction de tri (le tri se fait maintenant côté serveur)
  const handleSort = (column: 'name' | 'email' | 'status' | 'plan' | 'connection' | 'created' | 'meetings') => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
    // Le useEffect se chargera de recharger les données
  };

  // Les utilisateurs sont déjà triés côté serveur, on les utilise directement
  const sortedUsers = users || [];

  // Filtrer les utilisateurs pour la gestion des abonnements (utiliser allUsers si on est dans l'onglet Actions)
  const usersForSubscription = mainTabValue === 'actions' ? allUsers : users;
  const filteredUsersForSubscription = usersForSubscription.filter(user => {
    if (!subscriptionSearchQuery) return true;
    const query = subscriptionSearchQuery.toLowerCase();
    return (
      (user.full_name || '').toLowerCase().includes(query) ||
      (user.email || '').toLowerCase().includes(query)
    );
  });

  // Filtrer les utilisateurs pour l'envoi d'emails (utiliser allUsers si on est dans l'onglet Actions)
  const usersForEmail = mainTabValue === 'actions' ? allUsers : users;
  const filteredUsersForEmail = usersForEmail.filter(user => {
    if (!emailSearchQuery) return true;
    const query = emailSearchQuery.toLowerCase();
    return (
      (user.full_name || '').toLowerCase().includes(query) ||
      (user.email || '').toLowerCase().includes(query)
    );
  });

  if (loading && !users.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
          <p className="text-slate-600">Chargement des données d'administration...</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Tableau de bord administrateur</h1>
          <p className="text-slate-500 text-sm">Gestion des utilisateurs et surveillance en temps réel</p>
        </motion.div>

      {/* Tabs principaux */}
        <motion.div variants={itemVariants}>
            <Tabs value={mainTabValue} onValueChange={(v: string) => setMainTabValue(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-8 mb-6">
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Utilisateurs</span>
              </TabsTrigger>
              <TabsTrigger value="statistics" className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Statistiques</span>
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">Actions</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span className="hidden sm:inline">Queue</span>
              </TabsTrigger>
              <TabsTrigger value="activity" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span className="hidden sm:inline">Activité</span>
              </TabsTrigger>
              <TabsTrigger value="monitoring" className="flex items-center gap-2">
                <Server className="w-4 h-4" />
                <span className="hidden sm:inline">Monitoring</span>
              </TabsTrigger>
              <TabsTrigger value="recordings" className="flex items-center gap-2">
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">Enregistrements</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Templates</span>
              </TabsTrigger>
            </TabsList>

      {/* Tab Panel - Utilisateurs */}
            <TabsContent value="users" className="space-y-6">
          {/* Statistiques */}
              {stats && stats.users && stats.meetings && (
                <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-slate-200">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-slate-900">{stats.users.total || 0}</p>
                          <p className="text-sm text-slate-500">Utilisateurs total</p>
                        </div>
                      </div>
              </CardContent>
            </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-100 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-emerald-600">{stats.users.online || 0}</p>
                          <p className="text-sm text-slate-500">En ligne</p>
                        </div>
                      </div>
              </CardContent>
            </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 rounded-lg">
                          <FileText className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-slate-900">{stats.meetings.total || 0}</p>
                          <p className="text-sm text-slate-500">Réunions total</p>
                        </div>
                      </div>
              </CardContent>
            </Card>

                  <Card className="border-slate-200">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Clock className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-slate-900">{formatDuration(stats.meetings.total_duration || 0)}</p>
                          <p className="text-sm text-slate-500">Durée totale</p>
                        </div>
                      </div>
              </CardContent>
            </Card>
                </motion.div>
      )}

      {/* Barre de recherche et actions */}
              <motion.div variants={itemVariants}>
                <Card className="border-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          type="text"
            placeholder="Rechercher par nom ou email..."
            value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                        />
                      </div>
          <Button
                        variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
                        className="shrink-0"
          >
                        <RefreshCw className={cn("w-4 h-4 mr-2", refreshing && "animate-spin")} />
            Actualiser
          </Button>
                      <Button
                        onClick={handleOpenCreateUser}
                        className="shrink-0"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Créer utilisateur
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

      {/* Tableau des utilisateurs */}
              <motion.div variants={itemVariants}>
                <Card className="border-slate-200">
                  <CardContent className="pt-6 p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Utilisateur</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Statut</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Plan</th>
                            <th 
                              className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => handleSort('connection')}
                            >
                              <div className="flex items-center gap-2">
                                Connexion
                                {sortBy === 'connection' ? (
                                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                                )}
                              </div>
                            </th>
                            <th
                              className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                              onClick={() => handleSort('created')}
                            >
                              <div className="flex items-center gap-2">
                                Inscription
                                {sortBy === 'created' ? (
                                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                                )}
                              </div>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Réunions</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-200">
              {!sortedUsers || sortedUsers.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      {!sortedUsers ? 'Chargement des utilisateurs...' : 'Aucun utilisateur trouvé'}
                              </td>
                            </tr>
              ) : (
                sortedUsers.map((user) => {
                  const profilePictureUrl = formatProfilePictureUrl(user.profile_picture_url);
                  return (
                    <tr 
                      key={user.id} 
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => handleViewUserDetails(user.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {profilePictureUrl ? (
                            <img
                              src={profilePictureUrl}
                              alt={user.full_name || user.email}
                              className="w-10 h-10 rounded-full object-cover border-2 border-slate-200"
                              onError={(e) => {
                                // Si l'image ne charge pas, remplacer par l'initiale
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                const parent = target.parentElement;
                                if (parent && !parent.querySelector('.fallback-avatar')) {
                                  const fallback = document.createElement('div');
                                  fallback.className = 'fallback-avatar w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold';
                                  fallback.textContent = user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase();
                                  parent.appendChild(fallback);
                                }
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-semibold">
                              {user.full_name?.charAt(0) || user.email.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-slate-900">{user.full_name || 'Nom non défini'}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-slate-500">{user.email}</p>
                              {user.oauth_provider && (
                                <Badge variant="outline" className="text-xs">
                                  {user.oauth_provider === 'google' ? 'Google' : user.oauth_provider}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={user.is_active ? 'default' : 'destructive'}>
                          {user.is_active ? 'Actif' : 'Inactif'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {getPlanBadge(user.subscription_plan)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {user.is_online === true ? (
                            <>
                              <Badge variant="default" className="bg-emerald-500 text-white">
                                En ligne
                              </Badge>
                              {user.last_activity && (
                                <span className="text-xs text-slate-500">{formatDate(user.last_activity)}</span>
                              )}
                            </>
                          ) : (
                            <>
                              <Badge variant="secondary">
                                Hors ligne
                              </Badge>
                              {user.last_activity && (
                                <span className="text-xs text-slate-500">{formatDate(user.last_activity)}</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{formatDate(user.created_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600">{user.meeting_count || 0} réunions</span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleOpenQuickPlanChange(user)}
                            title="Modifier le plan"
                          >
                            <CreditCard className="w-4 h-4 text-amber-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleViewUserDetails(user.id)}
                            title="Voir les détails"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleToggleUserStatus(user.id)}
                            title={user.is_active ? 'Désactiver' : 'Activer'}
                          >
                            {user.is_active ? <Ban className="w-4 h-4 text-red-600" /> : <CheckCircle className="w-4 h-4 text-emerald-600" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteUser(user)}
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
                          )}
                        </tbody>
                      </table>
                    </div>
        
        {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
                        <p className="text-sm text-slate-600">
                          Page {currentPage} sur {totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </TabsContent>

            {/* Tab Panel - Statistiques */}
            <TabsContent value="statistics" className="space-y-6">
              <AdminStatisticsTab />
            </TabsContent>

            {/* Tab Panel - Actions */}
            <TabsContent value="actions" className="space-y-6">
              <motion.div variants={itemVariants}>
                <Tabs value={actionsSubTab} onValueChange={(v: string) => setActionsSubTab(v as 'subscriptions' | 'emails' | 'organizations' | 'transcription')} className="w-full">
                  <TabsList className="mb-6 h-auto p-2 gap-3 flex-wrap">
                    <TabsTrigger value="subscriptions" className="flex items-center gap-2 px-6 py-3">
                      <CreditCard className="w-4 h-4" />
                      Abonnements
                    </TabsTrigger>
                    <TabsTrigger value="organizations" className="flex items-center gap-2 px-6 py-3">
                      <Building2 className="w-4 h-4" />
                      Organisations
                    </TabsTrigger>
                    <TabsTrigger value="emails" className="flex items-center gap-2 px-6 py-3">
                      <Mail className="w-4 h-4" />
                      Emails
                    </TabsTrigger>
                    <TabsTrigger value="transcription" className="flex items-center gap-2 px-6 py-3">
                      <Mic2 className="w-4 h-4" />
                      Modèle
                    </TabsTrigger>
                  </TabsList>

                  {/* Sous-onglet Abonnements */}
                  <TabsContent value="subscriptions" className="mt-4 space-y-6">
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-amber-500" />
                          Attribuer un abonnement
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Rechercher un utilisateur</label>
                            <div className="relative mb-3">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                type="text"
                                placeholder="Rechercher par nom ou email..."
                                value={subscriptionSearchQuery}
                                onChange={(e) => setSubscriptionSearchQuery(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Sélectionner un utilisateur</label>
                            <select
                              value={selectedUserForSubscription?.id || ''}
                              onChange={(e) => {
                                const user = filteredUsersForSubscription.find(u => u.id === e.target.value);
                                if (user) {
                                  setSelectedUserForSubscription(user);
                                  setSubscriptionPlan(user.subscription_plan === 'gilbert_plus' ? 'gilbert_plus' : 'beta_tester');
                                }
                              }}
                              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={loadingAllUsers}
                            >
                              <option value="">
                                {loadingAllUsers ? 'Chargement des utilisateurs...' : filteredUsersForSubscription.length === 0 && allUsers.length > 0 ? 'Aucun utilisateur trouvé' : 'Sélectionner un utilisateur...'}
                              </option>
                              {filteredUsersForSubscription.length > 0 ? (
                                filteredUsersForSubscription.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.full_name ? `${user.full_name} (${user.email})` : user.email} - {user.subscription_plan || 'beta_tester'}
                                  </option>
                                ))
                              ) : !loadingAllUsers && allUsers.length === 0 && mainTabValue === 'actions' ? (
                                <option value="" disabled>Aucun utilisateur disponible - Chargement en cours...</option>
                              ) : !loadingAllUsers && allUsers.length > 0 ? (
                                <option value="" disabled>Aucun utilisateur ne correspond à votre recherche</option>
                              ) : null}
                            </select>
                            {loadingAllUsers && (
                              <p className="text-xs text-slate-500 mt-1">Chargement de tous les utilisateurs... ({allUsers.length} chargés)</p>
                            )}
                            {!loadingAllUsers && mainTabValue === 'actions' && (
                              <p className="text-xs text-slate-500 mt-1">
                                {allUsers.length > 0 ? `${allUsers.length} utilisateur(s) disponible(s)` : 'Aucun utilisateur chargé - Vérifiez votre connexion'}
                              </p>
                            )}
                          </div>
                          {selectedUserForSubscription && (
                            <>
                              <div>
                                <label className="text-sm font-medium text-slate-700 mb-2 block">Plan d'abonnement</label>
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubscriptionPlan('beta_tester');
                                      setSelectedOrganizationForEnterprise('');
                                    }}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      subscriptionPlan === 'beta_tester'
                                        ? "border-blue-600 bg-blue-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">Beta Testeur</p>
                                    <p className="text-sm text-slate-600">Gratuit</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubscriptionPlan('discovery');
                                      setSelectedOrganizationForEnterprise('');
                                    }}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      subscriptionPlan === 'discovery'
                                        ? "border-emerald-600 bg-emerald-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">Discovery</p>
                                    <p className="text-sm text-slate-600">300 min</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubscriptionPlan('gilbert_plus_monthly');
                                      setSelectedOrganizationForEnterprise('');
                                    }}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      subscriptionPlan === 'gilbert_plus_monthly'
                                        ? "border-amber-600 bg-amber-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">Gilbert Pro</p>
                                    <p className="text-sm text-slate-600">24,90€/mois</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSubscriptionPlan('gilbert_plus_yearly');
                                      setSelectedOrganizationForEnterprise('');
                                    }}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      subscriptionPlan === 'gilbert_plus_yearly'
                                        ? "border-amber-600 bg-amber-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">Gilbert Pro</p>
                                    <p className="text-sm text-slate-600">19,90€/mois</p>
                                    <p className="text-xs text-emerald-600">-20%</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setSubscriptionPlan('enterprise')}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      subscriptionPlan === 'enterprise'
                                        ? "border-purple-600 bg-purple-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900 flex items-center gap-1">
                                      <Building2 className="w-4 h-4" />
                                      Entreprise
                                    </p>
                                    <p className="text-sm text-slate-600">Sur mesure</p>
                                  </button>
                                </div>
                              </div>

                              {/* Configuration des minutes Discovery */}
                              {subscriptionPlan === 'discovery' && (
                                <div className="space-y-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                  <p className="text-sm font-medium text-emerald-800">Configuration du quota Discovery</p>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-xs font-medium text-emerald-700 mb-1 block">
                                        Minutes totales
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={discoveryMinutesTotal}
                                        onChange={(e) => setDiscoveryMinutesTotal(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full h-9 rounded-md border border-emerald-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-emerald-700 mb-1 block">
                                        Minutes utilisées
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        value={discoveryMinutesUsed}
                                        onChange={(e) => setDiscoveryMinutesUsed(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full h-9 rounded-md border border-emerald-300 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-emerald-600">
                                    <span>Restant: {Math.max(0, discoveryMinutesTotal - discoveryMinutesUsed)} min</span>
                                    <button
                                      type="button"
                                      onClick={() => setDiscoveryMinutesUsed(0)}
                                      className="text-emerald-700 hover:text-emerald-900 underline"
                                    >
                                      Réinitialiser l'utilisation
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Sélection d'organisation pour le plan Enterprise */}
                              {subscriptionPlan === 'enterprise' && (
                                <div>
                                  <label className="text-sm font-medium text-slate-700 mb-2 block">
                                    Organisation associée <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    value={selectedOrganizationForEnterprise}
                                    onChange={(e) => setSelectedOrganizationForEnterprise(e.target.value)}
                                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    disabled={loadingOrganizations}
                                  >
                                    <option value="">
                                      {loadingOrganizations ? 'Chargement...' : 'Sélectionner une organisation...'}
                                    </option>
                                    {organizations.map((org) => (
                                      <option key={org.id} value={org.id}>
                                        {org.name} ({org.member_count || 0} membres)
                                      </option>
                                    ))}
                                  </select>
                                  {organizations.length === 0 && !loadingOrganizations && (
                                    <p className="text-xs text-amber-600 mt-1">
                                      Aucune organisation disponible. Créez-en une dans l'onglet "Organisations".
                                    </p>
                                  )}
                                </div>
                              )}

                              <Button
                                onClick={handleAssignSubscription}
                                disabled={assigningSubscription || (subscriptionPlan === 'enterprise' && !selectedOrganizationForEnterprise)}
                                className={cn(
                                  "w-full",
                                  subscriptionPlan === 'enterprise' && "bg-purple-600 hover:bg-purple-700"
                                )}
                              >
                                {assigningSubscription ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Traitement...
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Attribuer l'abonnement
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-amber-500" />
                          Statistiques des abonnements
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                            <p className="text-2xl font-bold text-blue-900">
                              {allUsers.filter(u => !u.subscription_plan || u.subscription_plan === 'beta_tester').length}
                            </p>
                            <p className="text-sm text-blue-700">Beta Testeur</p>
                          </div>
                          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-2xl font-bold text-amber-900">
                              {allUsers.filter(u => u.subscription_plan === 'gilbert_plus' || u.subscription_plan === 'gilbert_plus_monthly').length}
                            </p>
                            <p className="text-sm text-amber-700">Pro Mensuel</p>
                          </div>
                          <div className="p-4 bg-amber-100 rounded-lg border border-amber-300">
                            <p className="text-2xl font-bold text-amber-900">
                              {allUsers.filter(u => u.subscription_plan === 'gilbert_plus_yearly').length}
                            </p>
                            <p className="text-sm text-amber-700">Pro Annuel</p>
                          </div>
                          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-2xl font-bold text-purple-900">
                              {allUsers.filter(u => u.subscription_plan === 'enterprise').length}
                            </p>
                            <p className="text-sm text-purple-700">Entreprise</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Sous-onglet Organisations */}
                  <TabsContent value="organizations" className="mt-4">
                    <AdminOrganizationsTab />
                  </TabsContent>

                  {/* Sous-onglet Emails */}
                  <TabsContent value="emails" className="mt-4 space-y-6">
                    {/* Étape 1: Destinataires */}
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-blue-500" />
                          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full mr-2">1</span>
                          Destinataires
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Type d'envoi */}
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setEmailType('individual');
                                setEmailData({ ...emailData, selectedUsers: [] });
                                setEmailFilterPlan('');
                                setEmailFilterOrg('');
                              }}
                              className={cn(
                                "p-4 rounded-lg border-2 transition-all",
                                emailType === 'individual'
                                  ? "border-blue-600 bg-blue-50"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              )}
                            >
                              <MailOpen className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                              <p className="text-sm font-medium">Individuel</p>
                              <p className="text-xs text-slate-500">Un seul destinataire</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEmailType('group');
                                setEmailData({ ...emailData, recipient: '' });
                              }}
                              className={cn(
                                "p-4 rounded-lg border-2 transition-all",
                                emailType === 'group'
                                  ? "border-blue-600 bg-blue-50"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              )}
                            >
                              <Users className="w-6 h-6 mx-auto mb-2 text-slate-600" />
                              <p className="text-sm font-medium">Groupé</p>
                              <p className="text-xs text-slate-500">Plusieurs destinataires</p>
                            </button>
                          </div>

                          {/* Filtres pour envoi groupé */}
                          {emailType === 'group' && (
                            <div className="p-4 bg-slate-50 rounded-lg space-y-3">
                              <label className="text-sm font-medium text-slate-700 block">Filtrer les utilisateurs</label>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs text-slate-600 mb-1 block">Par abonnement</label>
                                  <select
                                    value={emailFilterPlan}
                                    onChange={(e) => setEmailFilterPlan(e.target.value)}
                                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Tous les plans</option>
                                    <option value="beta_tester">Beta Testeur</option>
                                    <option value="gilbert_plus_monthly">Pro Mensuel</option>
                                    <option value="gilbert_plus_yearly">Pro Annuel</option>
                                    <option value="enterprise">Entreprise</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-xs text-slate-600 mb-1 block">Par organisation</label>
                                  <select
                                    value={emailFilterOrg}
                                    onChange={(e) => setEmailFilterOrg(e.target.value)}
                                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">Toutes</option>
                                    {organizations.map((org) => (
                                      <option key={org.id} value={org.id}>{org.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Sélection des destinataires */}
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <Input
                              type="text"
                              placeholder="Rechercher par nom ou email..."
                              value={emailSearchQuery}
                              onChange={(e) => setEmailSearchQuery(e.target.value)}
                              className="pl-10"
                            />
                          </div>

                          {emailType === 'individual' ? (
                            <select
                              value={emailData.recipient}
                              onChange={(e) => setEmailData({ ...emailData, recipient: e.target.value })}
                              className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              disabled={loadingAllUsers}
                            >
                              <option value="">
                                {loadingAllUsers ? 'Chargement...' : 'Sélectionner un destinataire...'}
                              </option>
                              {filteredUsersForEmail.map((user) => (
                                <option key={user.id} value={user.email}>
                                  {user.full_name ? `${user.full_name} (${user.email})` : user.email}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">
                                  {emailData.selectedUsers.length} sélectionné(s) sur {filteredUsersForEmail.length}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (emailData.selectedUsers.length === filteredUsersForEmail.length) {
                                      setEmailData({ ...emailData, selectedUsers: [] });
                                    } else {
                                      setEmailData({ ...emailData, selectedUsers: filteredUsersForEmail.map(u => u.id) });
                                    }
                                  }}
                                >
                                  {emailData.selectedUsers.length === filteredUsersForEmail.length ? (
                                    <>
                                      <Square className="w-4 h-4 mr-1" />
                                      Désélectionner tout
                                    </>
                                  ) : (
                                    <>
                                      <CheckSquare className="w-4 h-4 mr-1" />
                                      Sélectionner tout
                                    </>
                                  )}
                                </Button>
                              </div>
                              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                                {filteredUsersForEmail.length === 0 ? (
                                  <p className="text-sm text-slate-500 text-center py-6">Aucun utilisateur trouvé</p>
                                ) : (
                                  filteredUsersForEmail.map((user) => (
                                    <label key={user.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={emailData.selectedUsers.includes(user.id)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setEmailData({ ...emailData, selectedUsers: [...emailData.selectedUsers, user.id] });
                                          } else {
                                            setEmailData({ ...emailData, selectedUsers: emailData.selectedUsers.filter(id => id !== user.id) });
                                          }
                                        }}
                                        className="rounded border-slate-300"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 truncate">{user.full_name || user.email}</p>
                                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {user.subscription_plan === 'gilbert_plus_monthly' ? 'Pro' :
                                         user.subscription_plan === 'gilbert_plus_yearly' ? 'Pro Annuel' :
                                         user.subscription_plan === 'enterprise' ? 'Entreprise' : 'Beta'}
                                      </Badge>
                                    </label>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Étape 2: Rédaction */}
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Mail className="w-5 h-5 text-purple-500" />
                          <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full mr-2">2</span>
                          Rédaction
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {/* Variables disponibles */}
                          <div className="p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-indigo-100">
                            <p className="text-xs font-medium text-indigo-700 mb-2">Variables disponibles (cliquez pour insérer)</p>
                            <div className="flex flex-wrap gap-2">
                              {emailVariables.map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => insertVariable(v, 'content')}
                                  className="px-2.5 py-1 bg-white rounded-full text-xs font-medium text-indigo-600 border border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 transition-colors"
                                >
                                  @{v}
                                </button>
                              ))}
                            </div>
                            <p className="text-xs text-slate-500 mt-2">
                              Les variables seront remplacées par les vraies valeurs pour chaque destinataire
                            </p>
                          </div>

                          {/* Sujet */}
                          <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Sujet de l'email</label>
                            <Input
                              type="text"
                              value={emailSubject}
                              onChange={(e) => setEmailSubject(e.target.value)}
                              placeholder="Ex: Bonjour @prenom, voici les dernières nouvelles..."
                              className="h-11"
                            />
                          </div>

                          {/* Contenu */}
                          <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Contenu de l'email</label>
                            <textarea
                              value={emailContent}
                              onChange={(e) => setEmailContent(e.target.value)}
                              placeholder="Bonjour @prenom,

Nous espérons que vous allez bien...

Utilisez @nom, @prenom, @email, @plan, @date, @heure, @annee pour personnaliser votre message."
                              className="w-full min-h-[200px] rounded-md border border-slate-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                            />
                            <p className="text-xs text-slate-400 mt-1">
                              Tapez @ suivi du nom de la variable pour l'insérer (ex: @prenom)
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3 pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={generatePreview}
                              disabled={!emailSubject.trim() || !emailContent.trim()}
                              className="flex-1"
                            >
                              <Eye className="w-4 h-4 mr-2" />
                              Prévisualiser
                            </Button>
                            <Button
                              onClick={handleSendEmail}
                              disabled={sendingEmail || !emailSubject.trim() || !emailContent.trim() || (emailType === 'individual' ? !emailData.recipient : emailData.selectedUsers.length === 0)}
                              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                            >
                              {sendingEmail ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Envoi...
                                </>
                              ) : (
                                <>
                                  <Send className="w-4 h-4 mr-2" />
                                  Envoyer {emailType === 'group' && emailData.selectedUsers.length > 0 && `(${emailData.selectedUsers.length})`}
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Prévisualisation */}
                    {emailPreview && (
                      <Card className="border-slate-200">
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Eye className="w-5 h-5 text-green-500" />
                            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full mr-2">3</span>
                            Prévisualisation
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="p-3 bg-slate-50 rounded-lg">
                              <p className="text-xs text-slate-500 mb-1">Sujet</p>
                              <p className="text-sm font-medium text-slate-700">{emailPreview.subject}</p>
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <iframe
                                srcDoc={emailPreview.html_content}
                                className="w-full h-[500px] bg-white"
                                title="Email Preview"
                                sandbox="allow-same-origin"
                              />
                            </div>
                            <p className="text-xs text-slate-500 text-center">
                              Les valeurs en violet seront remplacées par les données réelles de chaque destinataire
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>

                  {/* Sous-onglet Transcription (Modèle) */}
                  <TabsContent value="transcription" className="mt-4 space-y-6">
                    <Card className="border-slate-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Mic2 className="w-5 h-5 text-purple-500" />
                          Attribuer un modèle de transcription
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Rechercher un utilisateur</label>
                            <div className="relative mb-3">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <Input
                                type="text"
                                placeholder="Rechercher par nom ou email..."
                                value={transcriptionSearchQuery}
                                onChange={(e) => setTranscriptionSearchQuery(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">Sélectionner un utilisateur</label>
                            <select
                              value={selectedUserForTranscription?.id || ''}
                              onChange={(e) => {
                                const user = allUsers.filter(u =>
                                  u.full_name?.toLowerCase().includes(transcriptionSearchQuery.toLowerCase()) ||
                                  u.email.toLowerCase().includes(transcriptionSearchQuery.toLowerCase()) ||
                                  transcriptionSearchQuery === ''
                                ).find(u => u.id === e.target.value);
                                if (user) {
                                  setSelectedUserForTranscription(user);
                                  // Initialiser le provider avec la valeur actuelle de l'utilisateur
                                  setTranscriptionProvider((user.transcription_provider as 'assemblyai' | 'ovh_whisper' | 'voxtral') || 'assemblyai');
                                }
                              }}
                              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                              disabled={loadingAllUsers}
                            >
                              <option value="">
                                {loadingAllUsers ? 'Chargement des utilisateurs...' : 'Sélectionner un utilisateur...'}
                              </option>
                              {allUsers.filter(u =>
                                u.full_name?.toLowerCase().includes(transcriptionSearchQuery.toLowerCase()) ||
                                u.email.toLowerCase().includes(transcriptionSearchQuery.toLowerCase()) ||
                                transcriptionSearchQuery === ''
                              ).map((user) => (
                                <option key={user.id} value={user.id}>
                                  {user.full_name ? `${user.full_name} (${user.email})` : user.email} - [{user.transcription_provider === 'ovh_whisper' ? 'OVH Whisper' : user.transcription_provider === 'voxtral' ? 'Voxtral' : 'AssemblyAI'}]
                                </option>
                              ))}
                            </select>
                            {loadingAllUsers && (
                              <p className="text-xs text-slate-500 mt-1">Chargement de tous les utilisateurs...</p>
                            )}
                          </div>

                          {selectedUserForTranscription && (
                            <>
                              {/* Provider actuel */}
                              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <p className="text-sm text-slate-600 mb-1">Provider actuel de {selectedUserForTranscription.full_name || selectedUserForTranscription.email}</p>
                                <div className="flex items-center gap-2">
                                  <span className={cn(
                                    "px-3 py-1 rounded-full text-sm font-medium",
                                    selectedUserForTranscription.transcription_provider === 'ovh_whisper'
                                      ? "bg-purple-100 text-purple-700"
                                      : selectedUserForTranscription.transcription_provider === 'voxtral'
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-blue-100 text-blue-700"
                                  )}>
                                    {selectedUserForTranscription.transcription_provider === 'ovh_whisper' ? 'OVH Whisper' : selectedUserForTranscription.transcription_provider === 'voxtral' ? 'Voxtral (Mistral AI)' : 'AssemblyAI'}
                                  </span>
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium text-slate-700 mb-2 block">Nouveau provider de transcription</label>
                                <div className="grid grid-cols-3 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => setTranscriptionProvider('assemblyai')}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      transcriptionProvider === 'assemblyai'
                                        ? "border-blue-600 bg-blue-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">AssemblyAI</p>
                                    <p className="text-xs text-slate-600">Asynchrone avec polling</p>
                                    <p className="text-xs text-slate-500 mt-1">Haute qualité, multi-langues</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTranscriptionProvider('ovh_whisper')}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      transcriptionProvider === 'ovh_whisper'
                                        ? "border-purple-600 bg-purple-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">OVH Whisper</p>
                                    <p className="text-xs text-slate-600">Synchrone, rapide</p>
                                    <p className="text-xs text-emerald-600 mt-1">RGPD compliant</p>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setTranscriptionProvider('voxtral')}
                                    className={cn(
                                      "p-4 rounded-lg border-2 transition-all text-left",
                                      transcriptionProvider === 'voxtral'
                                        ? "border-amber-600 bg-amber-50"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                    )}
                                  >
                                    <p className="font-semibold text-slate-900">Voxtral</p>
                                    <p className="text-xs text-slate-600">Mistral AI, synchrone</p>
                                    <p className="text-xs text-amber-600 mt-1">Word Boost (context bias)</p>
                                  </button>
                                </div>
                              </div>

                              <Button
                                onClick={async () => {
                                  if (!selectedUserForTranscription) return;
                                  setAssigningTranscription(true);
                                  try {
                                    await apiClient.put(`/admin/users/${selectedUserForTranscription.id}/transcription-provider`, {
                                      provider: transcriptionProvider
                                    });
                                    const providerLabel = transcriptionProvider === 'ovh_whisper' ? 'OVH Whisper' : transcriptionProvider === 'voxtral' ? 'Voxtral' : 'AssemblyAI';
                                    showSuccessPopup('Succès', `Provider ${providerLabel} attribué à ${selectedUserForTranscription.full_name || selectedUserForTranscription.email}`);
                                    setSelectedUserForTranscription(null);
                                    setTranscriptionSearchQuery('');
                                    // Rafraîchir la liste des utilisateurs
                                    await loadAllUsers();
                                  } catch (error: any) {
                                    logger.error('Erreur attribution provider:', error);
                                    showErrorPopup('Erreur', error?.message || 'Impossible d\'attribuer le provider');
                                  } finally {
                                    setAssigningTranscription(false);
                                  }
                                }}
                                disabled={assigningTranscription}
                                className="w-full bg-purple-600 hover:bg-purple-700"
                              >
                                {assigningTranscription ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Attribution en cours...
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-4 h-4 mr-2" />
                                    Attribuer le provider
                                  </>
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </motion.div>
            </TabsContent>

      {/* Tab Panel - Queue */}
            <TabsContent value="queue">
        <QueueTab
          queueStatus={queueStatus}
          systemHealth={systemHealth}
          loading={loading}
          onRefresh={() => {
            loadQueueData();
            loadSystemHealth();
          }}
                onClearQueue={async () => {
                  if (window.confirm('Êtes-vous sûr de vouloir vider la file d\'attente ?')) {
                    try {
                      await apiClient.post('/admin/queue/clear?confirm=true');
                      await loadQueueData();
                      showSuccessPopup('Succès', 'File d\'attente vidée');
                    } catch (error: any) {
                      showErrorPopup('Erreur', error?.message || 'Impossible de vider la file d\'attente');
                    }
                  }
                }}
              />
            </TabsContent>

      {/* Tab Panel - Activité */}
            <TabsContent value="activity">
        <ActivityTab
          queueHistory={queueHistory}
          loading={loading}
          onRefresh={loadQueueHistory}
        />
            </TabsContent>

      {/* Tab Panel - Monitoring */}
            <TabsContent value="monitoring">
        <ServicesMonitoringTab
          servicesData={servicesMonitoring}
          loading={loading}
          onRefresh={loadServicesMonitoring}
        />
            </TabsContent>

      {/* Tab Panel - Enregistrements */}
            <TabsContent value="recordings">
        <RecordingsTab
          activeRecordings={activeRecordings}
          loading={loading}
          onRefresh={loadActiveRecordings}
          errorMessage={activeRecordingsError}
        />
            </TabsContent>

            {/* Tab Panel - Templates */}
            <TabsContent value="templates">
        <AdminTemplatesTab
          loading={loading}
              />
            </TabsContent>
              </Tabs>
        </motion.div>


      {/* Dialog de création d'utilisateur */}
        <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un nouvel utilisateur</DialogTitle>
              <DialogDescription>
                Remplissez les informations pour créer un nouvel utilisateur
              </DialogDescription>
            </DialogHeader>
          {createUserError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {createUserError}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Email *</label>
                <Input
              type="email"
              value={createUserData.email}
              onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
              disabled={creating}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Mot de passe *</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
              value={createUserData.password}
              onChange={(e) => setCreateUserData({ ...createUserData, password: e.target.value })}
              disabled={creating}
                    placeholder="Minimum 8 caractères"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <Eye className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Nom complet</label>
                <Input
                  type="text"
              value={createUserData.full_name}
              onChange={(e) => setCreateUserData({ ...createUserData, full_name: e.target.value })}
              disabled={creating}
                  placeholder="Nom complet"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserData.email_verified}
                    onChange={(e) => setCreateUserData({ ...createUserData, email_verified: e.target.checked })}
                    disabled={creating}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">Email vérifié</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createUserData.is_active}
                    onChange={(e) => setCreateUserData({ ...createUserData, is_active: e.target.checked })}
                    disabled={creating}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700">Compte actif</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCloseCreateUser} disabled={creating}>
                Annuler
              </Button>
              <Button onClick={handleCreateUser} disabled={creating}>
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Créer l'utilisateur
                  </>
                )}
          </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
            Confirmer la suppression
        </DialogTitle>
              <DialogDescription>
            Êtes-vous sûr de vouloir supprimer définitivement l'utilisateur{' '}
            <strong>{userToDelete?.full_name || userToDelete?.email}</strong> ?
              </DialogDescription>
            </DialogHeader>
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-900 mb-2">ATTENTION : Cette action est irréversible et supprimera :</p>
              <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
              <li>Toutes les réunions de l'utilisateur</li>
              <li>Toutes les transcriptions et résumés</li>
              <li>Tous les clients associés</li>
              <li>Le compte utilisateur et toutes ses données</li>
            </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
            Annuler
          </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Suppression...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Supprimer définitivement
                  </>
                )}
          </Button>
            </DialogFooter>
          </DialogContent>
      </Dialog>

      {/* Dialog de changement rapide de plan */}
      <Dialog open={showQuickPlanDialog} onOpenChange={setShowQuickPlanDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-500" />
              Modifier le plan
            </DialogTitle>
            <DialogDescription>
              {quickPlanChangeUser && (
                <span>
                  Modifier le plan de <strong>{quickPlanChangeUser.full_name || quickPlanChangeUser.email}</strong>
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Sélection du plan */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Plan</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSubscriptionPlan('beta_tester')}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    subscriptionPlan === 'beta_tester'
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <p className="text-sm font-medium">Beta Testeur</p>
                  <p className="text-xs text-slate-500">Gratuit</p>
                </button>
                <button
                  onClick={() => setSubscriptionPlan('gilbert_plus_monthly')}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    subscriptionPlan === 'gilbert_plus_monthly'
                      ? "border-amber-600 bg-amber-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <p className="text-sm font-medium">Pro Mensuel</p>
                  <p className="text-xs text-slate-500">24,90€/mois</p>
                </button>
                <button
                  onClick={() => setSubscriptionPlan('gilbert_plus_yearly')}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    subscriptionPlan === 'gilbert_plus_yearly'
                      ? "border-amber-600 bg-amber-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <p className="text-sm font-medium">Pro Annuel (12 mois)</p>
                  <p className="text-xs text-slate-500">19,90€/mois</p>
                </button>
                <button
                  onClick={() => setSubscriptionPlan('enterprise')}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-all text-left",
                    subscriptionPlan === 'enterprise'
                      ? "border-purple-600 bg-purple-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    Entreprise
                  </p>
                  <p className="text-xs text-slate-500">Sur mesure</p>
                </button>
              </div>
            </div>

            {/* Sélection d'organisation pour enterprise */}
            {subscriptionPlan === 'enterprise' && (
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">
                  Organisation <span className="text-red-500">*</span>
                </label>
                {loadingOrganizations ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des organisations...
                  </div>
                ) : organizations.length > 0 ? (
                  <select
                    value={selectedOrganizationForEnterprise}
                    onChange={(e) => setSelectedOrganizationForEnterprise(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">Sélectionner une organisation...</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-700">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Cet utilisateur n'est membre d'aucune organisation.
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      Ajoutez-le d'abord à une organisation dans l'onglet Actions &gt; Organisations.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseQuickPlanDialog}>
              Annuler
            </Button>
            <Button
              onClick={async () => {
                await handleAssignSubscription();
                handleCloseQuickPlanDialog();
                await loadData(); // Recharger les données pour mettre à jour le badge
              }}
              disabled={assigningSubscription || (subscriptionPlan === 'enterprise' && !selectedOrganizationForEnterprise)}
            >
              {assigningSubscription ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Attribution...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Appliquer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </motion.div>
    </div>
  );
};

export default AdminDashboard;
