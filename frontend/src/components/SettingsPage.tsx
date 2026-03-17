/**
 * SettingsPage - Page de paramètres
 * Affiche l'abonnement, les factures, CGU/CGV et déconnexion
 * Style inspiré de ProfilePage - sobre et épuré
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CreditCard,
  FileText,
  LogOut,
  Loader2,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Shield,
  Scale,
  Settings as SettingsIcon,
  Check,
  Zap,
  Calendar,
  RefreshCw,
  Building2,
  Users,
  Mail,
  Send,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { useNotification } from '../contexts/NotificationContext';
import { subscriptionService } from '../services/subscriptionService';
import type { Subscription, Invoice } from '../services/subscriptionService';
import { logoutUser } from '../services/authService';
import { getMyOrganizations, type Organization } from '../services/organizationService';
import { getDiscoveryStatus, changePassword, type DiscoveryStatus } from '../services/profileService';
import sounds from '../utils/soundDesign';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { logger } from '@/utils/logger';

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

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showSuccessPopup, showErrorPopup } = useNotification();
  
  // États pour l'abonnement
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [userOrganizations, setUserOrganizations] = useState<Organization[]>([]);
  const [loadingSubscription, setLoadingSubscription] = useState(false);
  const [changingPlan, setChangingPlan] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Changement de mot de passe (accordéon)
  const [passwordAccordionOpen, setPasswordAccordionOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Helper pour vérifier si le plan est Pro (mensuel ou annuel)
  const isProPlan = (plan?: string) => {
    return plan === 'gilbert_plus' || plan === 'gilbert_plus_monthly' || plan === 'gilbert_plus_yearly';
  };

  // Helper pour vérifier si le plan est Beta Testeur ou pas d'abonnement
  const isBetaPlan = (plan?: string) => {
    return !plan || plan === 'beta_tester';
  };

  // Helper pour vérifier si le plan est Discovery
  const isDiscoveryPlan = (plan?: string) => {
    return plan === 'discovery';
  };

  // États pour le formulaire de contact entreprise
  const [contactForm, setContactForm] = useState({
    fullName: '',
    email: '',
    companyName: '',
    estimatedUsers: '',
    message: '',
  });
  const [sendingContact, setSendingContact] = useState(false);

  // État pour le statut Discovery
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus | null>(null);

  // Charger le statut Discovery
  const loadDiscoveryStatus = async () => {
    try {
      const status = await getDiscoveryStatus();
      setDiscoveryStatus(status);
    } catch (error) {
      logger.warn('Impossible de charger le statut Discovery:', error);
    }
  };

  // Charger les données d'abonnement et Discovery au montage
  useEffect(() => {
    loadSubscriptionData();
    loadDiscoveryStatus();
  }, []);

  // Recharger périodiquement les données d'abonnement et Discovery pour synchroniser les modifications admin
  // showLoading = false pour un rechargement silencieux (pas de spinner)
  useEffect(() => {
    const interval = setInterval(() => {
      loadSubscriptionData(false);
      loadDiscoveryStatus();
    }, 15000); // Recharger toutes les 15 secondes silencieusement

    return () => clearInterval(interval);
  }, []);

  // Détecter le retour de Stripe Checkout
  useEffect(() => {
    const subscriptionStatus = searchParams.get('subscription');
    
    if (subscriptionStatus === 'success') {
      logger.debug('✅ Retour de Stripe Checkout détecté - Rechargement des données...');
      // Retour réussi de Stripe - recharger les données après un court délai
      // pour laisser le temps au webhook de créer l'abonnement en BDD
      const reloadData = async () => {
        // Essayer plusieurs fois avec des délais croissants
        for (let attempt = 1; attempt <= 5; attempt++) {
          const delay = attempt * 2000; // 2s, 4s, 6s, 8s, 10s
          await new Promise(resolve => setTimeout(resolve, delay));
          logger.debug(`🔄 Tentative ${attempt}/5 de rechargement des données...`);
          
          // Recharger les données
          await loadSubscriptionData();
          
          // Attendre un peu pour que le state se mette à jour
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Vérifier à nouveau via API pour être sûr
          const currentSub = await subscriptionService.getCurrentSubscription().catch(() => null);
          logger.debug('📊 Abonnement récupéré après rechargement:', currentSub?.subscription);
          logger.debug('📊 Plan de l\'abonnement:', currentSub?.subscription?.plan);
          logger.debug('📊 Status de l\'abonnement:', currentSub?.subscription?.status);
          
          // Après un retour de Stripe avec ?subscription=success, on attend gilbert_plus
          // Si on a gilbert_plus actif, c'est bon !
          if (currentSub?.subscription && 
              currentSub.subscription.plan === 'gilbert_plus' && 
              currentSub.subscription.status === 'active') {
            logger.debug('✅ Abonnement Gilbert Pro trouvé et actif - Mise à jour du state');
            // Forcer la mise à jour du state explicitement
            setSubscription(currentSub.subscription);
            
            // Attendre un peu pour que React mette à jour le DOM
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Recharger une dernière fois pour être sûr d'avoir les factures aussi
            await loadSubscriptionData();
            
            logger.debug('✅ State mis à jour, affichage du message de succès');
            showSuccessPopup('Succès', 'Votre abonnement Gilbert Pro a été activé avec succès !');
            setSearchParams({});
            return;
          } else {
            // Si on a toujours beta_tester après plusieurs tentatives, le webhook n'a peut-être pas fonctionné
            // Mais on continue les tentatives pour voir si gilbert_plus arrive
            logger.debug('⏳ En attente de l\'abonnement Gilbert Pro...', {
              hasSubscription: !!currentSub?.subscription,
              plan: currentSub?.subscription?.plan,
              status: currentSub?.subscription?.status,
              attempt: attempt
            });
          }
        }
        
        // Si après 5 tentatives, toujours pas de gilbert_plus, afficher un message
        logger.warn('⚠️ Abonnement Gilbert Pro non trouvé après plusieurs tentatives');
        const finalCheck = await subscriptionService.getCurrentSubscription().catch(() => null);
        
        if (finalCheck?.subscription?.plan === 'gilbert_plus' && finalCheck.subscription.status === 'active') {
          // Dernière chance : si on a gilbert_plus maintenant, l'afficher
          setSubscription(finalCheck.subscription);
          await loadSubscriptionData();
          showSuccessPopup('Succès', 'Votre abonnement Gilbert Pro a été activé avec succès !');
        } else {
          // Le webhook n'a peut-être pas encore été traité
          showSuccessPopup('Paiement réussi', 'Votre paiement a été traité. L\'abonnement sera activé sous peu. Si le problème persiste, veuillez rafraîchir la page ou contacter le support.');
        }
        setSearchParams({});
      };
      
      reloadData();
    } else if (subscriptionStatus === 'canceled') {
      // Paiement annulé
      showErrorPopup('Annulé', 'Le paiement a été annulé. Votre abonnement n\'a pas été modifié.');
      // Nettoyer l'URL
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, showSuccessPopup, showErrorPopup]);

  const loadSubscriptionData = async (showLoading = true) => {
    if (showLoading) {
      setLoadingSubscription(true);
    }
    try {
      const [subscriptionData, invoicesData, organizationsData] = await Promise.all([
        subscriptionService.getCurrentSubscription().catch((error: any) => {
          if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
            return { subscription: null, message: '' };
          }
          logger.error('Erreur lors du chargement de l\'abonnement:', error);
          return { subscription: null, message: '' };
        }),
        subscriptionService.getInvoices().catch((error: any) => {
          if (error?.detail === 'Not authenticated' || error?.message === 'Not authenticated') {
            return { invoices: [], total: 0 };
          }
          logger.error('Erreur lors du chargement des factures:', error);
          return { invoices: [], total: 0 };
        }),
        getMyOrganizations().catch((error: any) => {
          logger.error('Erreur lors du chargement des organisations:', error);
          return [];
        }),
      ]);

      // Charger les organisations de l'utilisateur
      setUserOrganizations(organizationsData || []);

      if (subscriptionData && subscriptionData.subscription) {
        const sub = subscriptionData.subscription;
        logger.debug('📦 Abonnement reçu dans loadSubscriptionData:', sub);
        logger.debug('📦 Plan:', sub.plan, 'Status:', sub.status);
        logger.debug('📦 Toutes les propriétés:', Object.keys(sub));

        // Pour Discovery, le status "none" est normal (pas d'abonnement Stripe)
        // On garde les infos de subscription pour que le plan soit accessible
        if (sub.plan === 'discovery') {
          logger.debug('✅ Plan Discovery détecté, conservation des données');
          setSubscription({ ...sub });
        } else if (sub.status === 'canceled' || sub.status === 'none') {
          // Si l'abonnement est annulé (et pas Discovery), l'utilisateur est de facto sur beta_tester
          logger.debug('⚠️ Abonnement annulé, passage à beta_tester');
          setSubscription(null);
        } else {
          logger.debug('✅ Abonnement actif, plan:', sub.plan, '- Mise à jour du state');
          // Forcer la mise à jour en créant un nouvel objet
          setSubscription({ ...sub });
        }
      } else {
        // Pas d'abonnement, l'utilisateur est sur beta_tester
        logger.debug('ℹ️ Aucun abonnement, plan beta_tester');
        setSubscription(null);
      }
      logger.debug('📄 Factures reçues:', invoicesData?.invoices?.length || 0);
      setInvoices(invoicesData?.invoices || []);
    } catch (error: any) {
      logger.error('Erreur lors du chargement des données d\'abonnement:', error);
      if (error?.detail !== 'Not authenticated' && error?.message !== 'Not authenticated') {
        showErrorPopup('Erreur', 'Impossible de charger les données d\'abonnement');
      }
    } finally {
      if (showLoading) {
        setLoadingSubscription(false);
      }
    }
  };

  const handleChangePlan = async () => {
    setChangingPlan(true);
    try {
      sounds.click();
      const response = await subscriptionService.changePlan('gilbert_plus', billingPeriod);
      logger.debug('Response from changePlan:', response);
      
      // Vérifier que response existe
      if (!response) {
        throw new Error('Réponse vide du serveur');
      }
      
      if (response.subscription) {
        setSubscription(response.subscription);
      }
      
      const paymentUrl = response.hosted_payment_url;
      if (paymentUrl && paymentUrl.trim() !== '') {
        // Redirection vers Stripe Checkout
        logger.debug('Redirection vers Stripe Checkout:', paymentUrl);
        window.location.href = paymentUrl;
      } else {
        // Pas d'URL de paiement, peut-être que l'abonnement a été créé directement
        showSuccessPopup('Succès', response.message || 'Abonnement Gilbert+ créé avec succès');
        await loadSubscriptionData();
      }
    } catch (error: any) {
      logger.error('Erreur lors du changement de plan:', error);
      showErrorPopup('Erreur', error.response?.data?.detail || error.detail || error.message || 'Erreur lors du changement de plan');
    } finally {
      setChangingPlan(false);
    }
  };

  const handleCancelSubscription = async () => {
    setChangingPlan(true);
    try {
      sounds.click();
      const response = await subscriptionService.cancelSubscription();

      // Le nouveau comportement : l'accès est maintenu jusqu'à la fin de la période
      const message = response.message || 'Votre abonnement sera résilié à la fin de la période en cours. Vous conservez l\'accès complet jusqu\'à cette date.';
      showSuccessPopup('Résiliation programmée', message);

      // Mettre à jour l'état local immédiatement pour refléter le changement
      if (response.subscription) {
        setSubscription(response.subscription);
      }

      // Recharger les données pour être sûr
      await loadSubscriptionData();
    } catch (error: any) {
      logger.error('Erreur lors de la résiliation:', error);
      showErrorPopup('Erreur', error.response?.data?.detail || error.detail || error.message || 'Erreur lors de la résiliation');
    } finally {
      setChangingPlan(false);
    }
  };

  // Fonction pour passer de mensuel à annuel (ou vice versa)
  const handleSwitchBillingPeriod = async (newPeriod: 'monthly' | 'yearly') => {
    setChangingPlan(true);
    try {
      sounds.click();
      const response = await subscriptionService.changePlan('gilbert_plus', newPeriod);
      logger.debug('Response from switchBillingPeriod:', response);

      if (!response) {
        throw new Error('Réponse vide du serveur');
      }

      // Si une URL de paiement est retournée, rediriger (cas où Stripe doit facturer la différence)
      const paymentUrl = response.hosted_payment_url;
      if (paymentUrl && paymentUrl.trim() !== '') {
        logger.debug('Redirection vers Stripe pour le prorata:', paymentUrl);
        window.location.href = paymentUrl;
        return;
      }

      // Sinon, la modification a été faite directement
      if (response.subscription) {
        setSubscription(response.subscription);
      }

      const periodLabel = newPeriod === 'yearly' ? 'annuel' : 'mensuel';
      showSuccessPopup('Succès', response.message || `Votre abonnement a été modifié vers le plan ${periodLabel}.`);
      await loadSubscriptionData();
    } catch (error: any) {
      logger.error('Erreur lors du changement de période:', error);
      showErrorPopup('Erreur', error.response?.data?.detail || error.detail || error.message || 'Erreur lors du changement de période');
    } finally {
      setChangingPlan(false);
    }
  };

  const handleLogout = () => {
    sounds.click();
    logoutUser();
    // Dans Tauri, forcer un rechargement complet de la WebView pour repartir d'un état propre
    if ((window as any).__TAURI__) {
      sessionStorage.removeItem('gilbert_app_session');
      window.location.replace('/');
    } else {
      navigate('/auth', { replace: true });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showErrorPopup('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    if (newPassword.length < 8) {
      showErrorPopup('Erreur', 'Le nouveau mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (newPassword !== confirmPassword) {
      showErrorPopup('Erreur', 'Les deux mots de passe ne correspondent pas');
      return;
    }
    setChangingPassword(true);
    try {
      sounds.click();
      await changePassword(currentPassword, newPassword);
      sounds.success();
      showSuccessPopup('Succès', 'Votre mot de passe a été modifié avec succès');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordAccordionOpen(false);
    } catch (error: any) {
      showErrorPopup(
        'Erreur',
        error?.response?.data?.detail || error?.message || 'Impossible de modifier le mot de passe'
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const scrollToContact = () => {
    sounds.click();
    const contactSection = document.getElementById('contact-section');
    if (contactSection) {
      contactSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation basique
    if (!contactForm.fullName || !contactForm.email || !contactForm.companyName) {
      showErrorPopup('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    setSendingContact(true);
    try {
      sounds.click();
      const response = await fetch('/api/contact/enterprise', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactForm),
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'envoi');
      }

      showSuccessPopup('Message envoyé', 'Votre demande a bien été envoyée. Nous vous contacterons rapidement.');
      setContactForm({
        fullName: '',
        email: '',
        companyName: '',
        estimatedUsers: '',
        message: '',
      });
    } catch (error) {
      logger.error('Erreur lors de l\'envoi du formulaire:', error);
      showErrorPopup('Erreur', 'Impossible d\'envoyer votre demande. Veuillez réessayer.');
    } finally {
      setSendingContact(false);
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number): string => {
    return (amount / 100).toFixed(2).replace('.', ',') + ' €';
  };

  const getInvoiceStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-slate-500" />;
    }
  };

  const getInvoiceStatusLabel = (status: string): string => {
    switch (status) {
      case 'paid':
        return 'Payée';
      case 'pending':
        return 'En attente';
      case 'failed':
        return 'Échouée';
      default:
        return status;
    }
  };

  // Détecter si l'abonnement est résilié (programmé pour annulation)
  const isCanceled = subscription?.status === 'canceling';

  return (
    <div className="min-h-screen bg-slate-50">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-4xl mx-auto px-4 sm:px-6 py-8"
    >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Paramètres</h1>
          <p className="text-slate-500 text-sm">Gérez votre abonnement et vos préférences</p>
        </motion.div>

        {/* Section Mon Plan - inspirée de ProfilePage */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
                Mon Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
              {loadingSubscription ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                  {/* Plan Discovery ou Beta Testeur - À GAUCHE */}
                  {/* Beta Testeur n'est affiché QUE si l'utilisateur est explicitement beta_tester (mis par admin) */}
                  {/* Sinon, on affiche Discovery */}
                  {(() => {
                    // Déterminer si on affiche Beta Testeur ou Discovery
                    const showBetaTester = subscription?.plan === 'beta_tester';
                    const isCurrentPlanFree = isDiscoveryPlan(subscription?.plan) || isDiscoveryPlan(discoveryStatus?.subscription_plan) || showBetaTester;

                    return (
                      <div className={cn(
                        "flex-1 p-3 sm:p-4 rounded-xl min-h-[280px] sm:min-h-[320px] flex flex-col",
                        isCurrentPlanFree
                          ? "border-2 border-emerald-500 bg-emerald-50/30"
                          : "border border-slate-200 bg-white"
                      )}>
                        <div className="flex items-center justify-between mb-2 sm:mb-3">
                          <span className={cn(
                            "px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded",
                            isCurrentPlanFree
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-500"
                          )}>
                            {isCurrentPlanFree ? 'Offre actuelle' : 'Disponible'}
                          </span>
                        </div>
                        <h3 className="font-semibold text-base sm:text-lg text-slate-900 mb-0.5 sm:mb-1">
                          {showBetaTester ? 'Bêta Testeur' : 'Discovery'}
                        </h3>
                        <p className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-3">
                          Gratuit
                        </p>
                        <div className="space-y-1 sm:space-y-1.5 mb-3 sm:mb-4">
                          {showBetaTester ? (
                            // Features Beta Testeur (plan spécial admin)
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
                          ) : (
                            // Features Discovery (plan gratuit par défaut)
                            <>
                              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                                <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                                <span><strong>{discoveryStatus?.minutes_total || 300}</strong> minutes offertes</span>
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
                          )}
                        </div>

                    {/* Jauge Discovery */}
                    {isDiscoveryPlan(discoveryStatus?.subscription_plan) && discoveryStatus && (
                      <div className="mb-3 p-2 sm:p-3 rounded-lg bg-white border border-slate-200">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] sm:text-xs font-medium text-slate-600">Minutes utilisées</span>
                          <span className={cn(
                            "text-[10px] sm:text-xs font-semibold",
                            discoveryStatus.percentage_used >= 80
                              ? "text-red-600"
                              : discoveryStatus.percentage_used >= 50
                                ? "text-amber-600"
                                : "text-emerald-600"
                          )}>
                            {discoveryStatus.minutes_used} / {discoveryStatus.minutes_total} min
                          </span>
                        </div>
                        <div className="relative h-2 sm:h-2.5 bg-slate-100 rounded-full overflow-hidden">
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
                          "mt-1 text-[9px] sm:text-[10px]",
                          discoveryStatus.percentage_used >= 80 ? "text-red-600" : "text-slate-500"
                        )}>
                          {discoveryStatus.percentage_used >= 100
                            ? "Quota épuisé - Passez à Gilbert Pro"
                            : `${discoveryStatus.minutes_remaining} min restantes`
                          }
                        </p>
                      </div>
                    )}

                    <div className="mt-auto">
                    {isProPlan(subscription?.plan) && !isCanceled && (
                      <Button
                        onClick={() => {
                          sounds.click();
                          const periodEnd = subscription?.current_period_end
                            ? new Date(subscription.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'la fin de la période';
                          if (window.confirm(`Résilier votre abonnement Gilbert Pro ?\n\nVous conserverez l'accès complet jusqu'au ${periodEnd}, puis passerez automatiquement sur Discovery.`)) {
                            handleCancelSubscription();
                          }
                        }}
                        variant="outline"
                        disabled={changingPlan}
                        className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm border-slate-300 text-slate-700 hover:bg-slate-50"
                      >
                        {changingPlan ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                            Traitement...
                          </>
                        ) : (
                          'Passer à Discovery'
                        )}
                      </Button>
                    )}
                    {isProPlan(subscription?.plan) && isCanceled && (
                      <div className="text-center text-xs text-amber-600 py-2">
                        Résiliation programmée
                      </div>
                    )}
                    </div>
                      </div>
                    );
                  })()}

                  {/* Plan Gilbert Pro - TOUJOURS À DROITE */}
                  <div className={cn(
                    "flex-1 p-3 sm:p-4 rounded-xl min-h-[280px] sm:min-h-[320px] flex flex-col",
                    isProPlan(subscription?.plan)
                      ? "border-2 border-blue-600 bg-blue-50/30"
                      : "border border-slate-200 bg-white"
                  )}>
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className={cn(
                        "px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded",
                        isProPlan(subscription?.plan)
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-500"
                      )}>
                        {isProPlan(subscription?.plan) ? 'Offre actuelle' : 'Disponible'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-base sm:text-lg text-slate-900 mb-0.5 sm:mb-1">Gilbert Pro</h3>

                    {/* Toggle Mensuel/Annuel - visible si pas Pro OU si sur Gilbert+ mensuel, et pas résilié */}
                    {(!isProPlan(subscription?.plan) || subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly') && subscription?.plan !== 'enterprise' && !isCanceled && (
                      <div className="flex items-center justify-center gap-2 mb-2 sm:mb-3 p-1 bg-slate-100 rounded-lg">
                        <button
                          onClick={() => setBillingPeriod('monthly')}
                          className={cn(
                            "flex-1 py-1 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors",
                            billingPeriod === 'monthly'
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          Mensuel
                        </button>
                        <button
                          onClick={() => setBillingPeriod('yearly')}
                          className={cn(
                            "flex-1 py-1 px-2 text-xs sm:text-sm font-medium rounded-md transition-colors",
                            billingPeriod === 'yearly'
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          Annuel
                          <span className="ml-1 text-[10px] text-emerald-600 font-medium">-20%</span>
                        </button>
                      </div>
                    )}

                    {/* Prix dynamique selon la période */}
                    <p className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-3">
                      {subscription?.plan === 'gilbert_plus_yearly' ? (
                        // Abonné annuel : toujours afficher le prix mensuel engagement
                        <>19,90€<span className="text-xs sm:text-sm font-normal">/mois</span></>
                      ) : (
                        // Pas Pro OU mensuel : afficher selon le toggle
                        billingPeriod === 'yearly' ? (
                          <>19,90€<span className="text-xs sm:text-sm font-normal">/mois</span></>
                        ) : (
                          <>24,90€<span className="text-xs sm:text-sm font-normal">/mois</span></>
                        )
                      )}
                    </p>
                    {billingPeriod === 'yearly' && subscription?.plan !== 'gilbert_plus_yearly' && (
                      <p className="text-xs text-emerald-600 mb-2 -mt-2">
                        soit 19,90€/mois (économisez 60€/an avec l'engagement 12 mois)
                      </p>
                    )}
                    <div className="space-y-1 sm:space-y-1.5 mb-3 sm:mb-4">
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
                    </div>

                    {/* Bouton Passer à l'annuel - visible quand on est mensuel et qu'on sélectionne yearly, pas résilié */}
                    {(subscription?.plan === 'gilbert_plus' || subscription?.plan === 'gilbert_plus_monthly') &&
                     billingPeriod === 'yearly' &&
                     !isCanceled && (
                      <button
                        onClick={() => {
                          sounds.click();
                          if (window.confirm('Passer à l\'abonnement avec engagement 12 mois (19,90€/mois) ?\n\nVous économiserez 60€ sur l\'année. L\'engagement est ferme sur 12 mois. Le prorata sera calculé automatiquement.')) {
                            handleSwitchBillingPeriod('yearly');
                          }
                        }}
                        disabled={changingPlan}
                        className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-3 text-xs sm:text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {changingPlan ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5" />
                        )}
                        Passer à l'engagement 12 mois (-20%)
                      </button>
                    )}

                    {/* Informations de période et renouvellement - uniquement si abonné Pro */}
                    {isProPlan(subscription?.plan) && (
                      <div className={cn(
                        "mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg border",
                        isCanceled
                          ? "bg-amber-50/50 border-amber-200"
                          : "bg-slate-50 border-slate-200"
                      )}>
                        {/* Badge Résilié si abonnement annulé */}
                        {isCanceled && (
                          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-amber-200">
                            <span className="px-2 py-0.5 text-[10px] sm:text-xs font-semibold bg-amber-100 text-amber-700 rounded-full">
                              Résilié
                            </span>
                            <span className="text-[10px] sm:text-xs text-amber-600">
                              Accès maintenu jusqu'au {formatDate(subscription?.current_period_end)}
                            </span>
                          </div>
                        )}
                        <div className="space-y-2">
                          {/* Type de plan */}
                          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                            <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                            <span>
                              Plan : {subscription?.plan === 'gilbert_plus_yearly' ? 'Engagement 12 mois (19,90€/mois)' : 'Mensuel sans engagement (24,90€/mois)'}
                            </span>
                          </div>
                          {/* Période en cours */}
                          {subscription?.current_period_start && subscription?.current_period_end && (
                            <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600">
                              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                              <span>
                                Période : {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                              </span>
                            </div>
                          )}
                          {/* Renouvellement automatique */}
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <RefreshCw className={cn(
                              "w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0",
                              isCanceled ? "text-amber-500" : "text-emerald-500"
                            )} />
                            <span className={isCanceled ? "text-amber-600 font-medium" : "text-slate-600"}>
                              {isCanceled
                                ? 'Renouvellement automatique : Non'
                                : 'Renouvellement automatique : Oui'
                              }
                            </span>
                          </div>

                          {/* Bouton pour passer au mensuel (uniquement si annuel et pas résilié) */}
                          {subscription?.plan === 'gilbert_plus_yearly' && !isCanceled && (
                            <div className="pt-2 border-t border-slate-200 mt-2">
                              <button
                                onClick={() => {
                                  sounds.click();
                                  if (window.confirm('Passer à l\'abonnement mensuel sans engagement (24,90€/mois) ?\n\nLe changement prendra effet à votre prochaine période de facturation.\n\nAttention : si votre engagement 12 mois est encore en cours, ce changement peut être refusé.')) {
                                    handleSwitchBillingPeriod('monthly');
                                  }
                                }}
                                disabled={changingPlan}
                                className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs sm:text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50"
                              >
                                {changingPlan ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5" />
                                )}
                                Passer au mensuel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-auto">
                    {/* Bouton Mettre à niveau pour les utilisateurs gratuits (Discovery ou Beta) */}
                    {!isProPlan(subscription?.plan) && subscription?.plan !== 'enterprise' ? (
                      <Button
                        onClick={handleChangePlan}
                        disabled={changingPlan}
                        className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm"
                      >
                        {changingPlan ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                            Traitement...
                          </>
                        ) : (
                          'Mettre à niveau'
                        )}
                      </Button>
                    ) : subscription?.plan === 'enterprise' ? (
                      // Plan entreprise - pas de bouton de résiliation, géré par l'organisation
                      <div className="text-center text-xs sm:text-sm text-slate-500 py-2">
                        Inclus dans votre offre Entreprise
                      </div>
                    ) : isProPlan(subscription?.plan) && !isCanceled ? (
                      // Bouton de résiliation uniquement pour Gilbert Pro actif (pas résilié)
                      <Button
                        onClick={() => {
                          sounds.click();
                          const periodEnd = subscription?.current_period_end
                            ? new Date(subscription.current_period_end).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'la fin de la période';
                          if (window.confirm(`Résilier votre abonnement Gilbert Pro ?\n\nVous conserverez l'accès complet jusqu'au ${periodEnd}.`)) {
                            handleCancelSubscription();
                          }
                        }}
                        variant="outline"
                        disabled={changingPlan}
                        className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        {changingPlan ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                            Traitement...
                          </>
                        ) : (
                          'Résilier l\'abonnement'
                        )}
                      </Button>
                    ) : isProPlan(subscription?.plan) && isCanceled ? (
                      // Abonnement résilié - proposer de réactiver
                      <Button
                        onClick={() => {
                          sounds.click();
                          if (window.confirm('Réactiver votre abonnement Gilbert Pro ?\n\nVotre abonnement continuera à se renouveler automatiquement.')) {
                            handleSwitchBillingPeriod(subscription?.plan === 'gilbert_plus_yearly' ? 'yearly' : 'monthly');
                          }
                        }}
                        variant="outline"
                        disabled={changingPlan}
                        className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        {changingPlan ? (
                          <>
                            <Loader2 className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                            Traitement...
                          </>
                        ) : (
                          'Réactiver l\'abonnement'
                        )}
                      </Button>
                    ) : null}
                    </div>
                  </div>

                  {/* Plan Entreprise */}
                  <div className={cn(
                    "flex-1 p-3 sm:p-4 rounded-xl min-h-[280px] sm:min-h-[320px] flex flex-col",
                    subscription?.plan === 'enterprise'
                      ? "border-2 border-purple-600 bg-purple-50/30"
                      : "border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100"
                  )}>
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <span className={cn(
                        "px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium rounded",
                        subscription?.plan === 'enterprise'
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-purple-100 text-purple-700"
                      )}>
                        {subscription?.plan === 'enterprise' ? 'Offre actuelle' : 'Sur mesure'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-base sm:text-lg text-slate-900 mb-0.5 sm:mb-1 flex items-center gap-2">
                      <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                      Entreprise
                    </h3>

                    {/* Nom de l'organisation si plan enterprise */}
                    {subscription?.plan === 'enterprise' && subscription?.organization_name && (
                      <div className="mb-2 sm:mb-3 p-2 rounded-lg bg-purple-100/50 border border-purple-200">
                        <p className="text-xs sm:text-sm font-medium text-purple-800 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          {subscription.organization_name}
                        </p>
                      </div>
                    )}

                    <p className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 sm:mb-3">
                      {subscription?.plan === 'enterprise' ? 'Actif' : 'Nous contacter'}
                    </p>
                    <div className="space-y-1 sm:space-y-1.5 mb-3 sm:mb-4">
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Tout Gilbert Pro inclus</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Templates personnalisés</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500 flex-shrink-0" />
                        <span>Groupes et sous-groupes</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 flex-shrink-0" />
                        <span>Support dédié</span>
                      </div>
                    </div>
                    <div className="mt-auto">
                      {subscription?.plan === 'enterprise' ? (
                        <div className="text-center text-xs sm:text-sm text-purple-700 font-medium py-2">
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 text-purple-600" />
                          Plan géré par votre organisation
                        </div>
                      ) : (
                        <Button
                          onClick={scrollToContact}
                          variant="outline"
                          className="w-full py-1.5 sm:py-2 px-3 sm:px-4 text-xs sm:text-sm border-purple-300 text-purple-700 hover:bg-purple-50 hover:text-purple-800"
                        >
                          <Mail className="mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          Faire la demande
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Section Factures */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                Mes factures
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
              {loadingSubscription ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
                </div>
              ) : invoices.length > 0 ? (
                <div className="space-y-2">
                  {invoices.slice(0, 5).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {getInvoiceStatusIcon(invoice.status)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">
                            {formatAmount(invoice.amount)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(invoice.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={cn(
                            'px-2 py-1 rounded-full text-xs font-medium',
                            invoice.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-700'
                              : invoice.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : invoice.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-700'
                          )}
                          >
                          {getInvoiceStatusLabel(invoice.status)}
                        </span>
                        {invoice.invoice_pdf && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              sounds.click();
                              window.open(invoice.invoice_pdf, '_blank');
                            }}
                            className="h-8 w-8 p-0 text-slate-600 hover:text-slate-900"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {invoices.length > 5 && (
                    <p className="text-xs text-slate-500 text-center pt-2">
                      {invoices.length - 5} autre(s) facture(s)
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Aucune facture disponible</p>
                </div>
              )}
                  </CardContent>
                </Card>
        </motion.div>

        {/* Section Prendre contact - Offre Entreprise */}
        <motion.div id="contact-section" variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                Prendre contact
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
              <p className="text-sm text-slate-500 mb-4">
                Vous souhaitez en savoir plus sur l'offre Entreprise ? Remplissez le formulaire ci-dessous et nous vous contacterons rapidement.
              </p>
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nom complet */}
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1">
                      Nom complet <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      value={contactForm.fullName}
                      onChange={(e) => setContactForm({ ...contactForm, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Jean Dupont"
                      required
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="jean.dupont@entreprise.com"
                      required
                    />
                  </div>

                  {/* Nom de l'entreprise */}
                  <div>
                    <label htmlFor="companyName" className="block text-sm font-medium text-slate-700 mb-1">
                      Nom de l'entreprise <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="companyName"
                      value={contactForm.companyName}
                      onChange={(e) => setContactForm({ ...contactForm, companyName: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="Mon Entreprise SAS"
                      required
                    />
                  </div>

                  {/* Nombre d'utilisateurs estimé */}
                  <div>
                    <label htmlFor="estimatedUsers" className="block text-sm font-medium text-slate-700 mb-1">
                      Nombre d'utilisateurs estimé
                    </label>
                    <input
                      type="text"
                      id="estimatedUsers"
                      value={contactForm.estimatedUsers}
                      onChange={(e) => setContactForm({ ...contactForm, estimatedUsers: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="10-50"
                    />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-slate-700 mb-1">
                    Message / Besoins spécifiques
                  </label>
                  <textarea
                    id="message"
                    value={contactForm.message}
                    onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    placeholder="Décrivez vos besoins spécifiques..."
                  />
                </div>

                {/* Bouton d'envoi */}
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={sendingContact}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6"
                  >
                    {sendingContact ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Envoyer la demande
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Section Informations légales */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                Informations légales
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    sounds.tab();
                    navigate('/cgu');
                    window.scrollTo(0, 0);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  <FileText className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">Conditions générales d'utilisation</p>
                    <p className="text-xs text-slate-500 mt-0.5">Consulter les CGU</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    sounds.tab();
                    navigate('/cgv');
                    window.scrollTo(0, 0);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
          >
                  <FileText className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">Conditions générales de vente</p>
                    <p className="text-xs text-slate-500 mt-0.5">Consulter les CGV</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    sounds.tab();
                    navigate('/privacy');
                    window.scrollTo(0, 0);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  <Shield className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">Politique de confidentialité</p>
                    <p className="text-xs text-slate-500 mt-0.5">Protection des données</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    sounds.tab();
                    navigate('/legal');
                    window.scrollTo(0, 0);
                  }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  <Scale className="w-5 h-5 text-slate-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 text-sm">Mentions légales</p>
                    <p className="text-xs text-slate-500 mt-0.5">Informations légales</p>
                  </div>
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Section Changement de mot de passe (accordéon) */}
        <motion.div variants={itemVariants} className="mb-6 sm:mb-8">
          <Card className="border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                sounds.tab();
                setPasswordAccordionOpen(!passwordAccordionOpen);
              }}
              className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-slate-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Lock className="h-5 w-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Changer le mot de passe</h3>
                  <p className="text-sm text-slate-500">Modifier votre mot de passe de connexion</p>
                </div>
              </div>
              {passwordAccordionOpen ? (
                <ChevronUp className="h-5 w-5 text-slate-500 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-500 flex-shrink-0" />
              )}
            </button>
            {passwordAccordionOpen && (
              <CardContent className="pt-0 px-4 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100">
                <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                  <div>
                    <Label htmlFor="current-password" className="text-slate-700">Mot de passe actuel</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1"
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-password" className="text-slate-700">Nouveau mot de passe</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1"
                      autoComplete="new-password"
                      minLength={8}
                    />
                    <p className="text-xs text-slate-500 mt-1">Minimum 8 caractères</p>
                  </div>
                  <div>
                    <Label htmlFor="confirm-password" className="text-slate-700">Confirmer le nouveau mot de passe</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="mt-1"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" disabled={changingPassword}>
                    {changingPassword ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Modification...
                      </>
                    ) : (
                      'Modifier le mot de passe'
                    )}
                  </Button>
                </form>
              </CardContent>
            )}
          </Card>
        </motion.div>

        {/* Section Déconnexion */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6 px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <LogOut className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">Déconnexion</h3>
                    <p className="text-sm text-slate-500">Se déconnecter de votre compte</p>
                  </div>
                </div>
        <Button
                  variant="outline"
                  onClick={() => {
                    sounds.click();
                    setShowLogoutDialog(true);
                  }}
                  className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <LogOut className="mr-2 h-4 w-4" />
          Se déconnecter
        </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Dialog de confirmation de déconnexion */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la déconnexion</DialogTitle>
            <DialogDescription>
            Êtes-vous sûr de vouloir vous déconnecter ? Vous devrez vous reconnecter pour accéder à votre compte.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                sounds.click();
                setShowLogoutDialog(false);
              }}
              className="border-slate-300"
            >
            Annuler
          </Button>
          <Button
              variant="destructive"
            onClick={handleLogout}
          >
              <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;
