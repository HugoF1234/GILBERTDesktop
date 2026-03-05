/**
 * AdminTemplatesTab - Onglet de gestion des templates (admin)
 * Refait avec la même DA que AdminDashboard (Tailwind + shadcn/ui + framer-motion)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  FileText,
  RefreshCw,
  Plus,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  Settings,
  Save,
  X,
  Palette,
  Type,
  Layout,
  FileDown,
  Users,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { LargeModal } from './ui/large-modal';
import { useNotification } from '../contexts/NotificationContext';
import type { Template } from '../services/templateService';
import { 
  getMyTemplates, 
  createTemplate, 
  updateTemplate, 
  deleteTemplate,
  uploadTemplateLogo
} from '../services/templateService';
import type { WidgetTemplate } from '../services/widgetTemplateService';
import { 
  getMyWidgetTemplates
} from '../services/widgetTemplateService';
import TemplateAssignmentDialog from './TemplateAssignmentDialog';
import TemplateLayoutForm from './TemplateLayoutForm';
import { LayoutConfig, defaultLayoutConfig } from '../types/templateLayout';
import { logger } from '@/utils/logger';

interface AdminTemplatesTabProps {
  loading?: boolean;
}

// Interface pour le composant de formulaire extrait
interface TemplateFormContentProps {
  isEdit?: boolean;
  formTab: 'content' | 'layout';
  setFormTab: (tab: 'content' | 'layout') => void;
  formData: {
    name: string;
    description: string;
    content: string;
    preview: string;
    logo_url: string | undefined;
    layout_config: LayoutConfig;
  };
  handleFormChange: (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  logoFile: File | null;
  logoPreview: string | null;
  setLogoFile: (file: File | null) => void;
  setLogoPreview: (preview: string | null) => void;
  setFormData: React.Dispatch<React.SetStateAction<{
    name: string;
    description: string;
    content: string;
    preview: string;
    logo_url: string | undefined;
    layout_config: LayoutConfig;
  }>>;
  uploadingLogo: boolean;
  showErrorPopup: (title: string, message: string) => void;
}

// Composant extrait en dehors pour éviter le remount à chaque render du parent
const TemplateFormContent = React.memo<TemplateFormContentProps>(({
  isEdit = false,
  formTab,
  setFormTab,
  formData,
  handleFormChange,
  logoFile,
  logoPreview,
  setLogoFile,
  setLogoPreview,
  setFormData,
  uploadingLogo,
  showErrorPopup,
}) => {
  // Handler pour l'upload de logo (accepte un File directement)
  const handleLogoFileChange = useCallback((file: File | null) => {
    if (file === null) {
      // Suppression du logo
      setLogoFile(null);
      setLogoPreview(null);
      setFormData(prev => ({ ...prev, logo_url: undefined }));
      return;
    }

    // Vérifier que c'est une image
    if (!file.type.startsWith('image/')) {
      showErrorPopup('Erreur', 'Le fichier doit être une image.');
      return;
    }

    // Vérifier la taille (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showErrorPopup('Erreur', 'L\'image est trop volumineuse (max 5MB).');
      return;
    }

    setLogoFile(file);

    // Créer un aperçu
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, [showErrorPopup, setLogoFile, setLogoPreview, setFormData]);

  // Handler pour l'input file (wrap handleLogoFileChange)
  const handleLogoChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleLogoFileChange(file);
    }
  }, [handleLogoFileChange]);

  return (
    <div className="flex flex-col">
      {/* Onglets du formulaire */}
      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setFormTab('content')}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
              formTab === 'content'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <FileText className="w-4 h-4" />
            Contenu du template
          </button>
          <button
            type="button"
            onClick={() => setFormTab('layout')}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
              formTab === 'layout'
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Palette className="w-4 h-4" />
            Mise en page (Export)
          </button>
        </div>
      </div>

      {/* Contenu des onglets */}
      {formTab === 'content' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Colonne gauche : Infos de base */}
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium text-slate-700 mb-1.5 block">
                Nom du template <span className="text-red-500">*</span>
              </label>
              <Input
                id="name"
                value={formData.name}
                onChange={handleFormChange('name')}
                placeholder="Ex: Compte-rendu médical détaillé"
                className="w-full"
              />
            </div>

            <div>
              <label htmlFor="description" className="text-sm font-medium text-slate-700 mb-1.5 block">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={handleFormChange('description')}
                placeholder="Une brève description de ce template et de son utilisation..."
                rows={3}
                className="w-full p-3 border border-slate-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* Upload de logo */}
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                Logo du template
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Le logo sera affiché en haut des exports PDF et Word
              </p>
              <div className="flex items-start gap-4">
              <input
                accept="image/*"
                style={{ display: 'none' }}
                  id={`logo-upload-${isEdit ? 'edit' : 'create'}`}
                type="file"
                onChange={handleLogoChange}
              />
                <label htmlFor={`logo-upload-${isEdit ? 'edit' : 'create'}`}>
                  <Button variant="outline" type="button" asChild size="sm">
                    <span className="cursor-pointer">
                      <ImageIcon className="w-4 h-4 mr-2" />
                      {logoFile ? 'Changer' : logoPreview ? 'Remplacer' : 'Ajouter un logo'}
                    </span>
                </Button>
              </label>
              {logoPreview && (
                  <div className="relative">
                  <img
                      src={logoPreview.startsWith('data:') ? logoPreview : `${import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh'}${logoPreview.startsWith('/') ? '' : '/'}${logoPreview}`}
                    alt="Aperçu du logo"
                      className="h-16 w-auto object-contain border border-slate-200 rounded p-1"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setLogoFile(null);
                        setLogoPreview(null);
                        setFormData(prev => ({ ...prev, logo_url: undefined }));
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
              {uploadingLogo && (
                <div className="mt-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs text-slate-500">Upload en cours...</span>
                </div>
              )}
            </div>

            {/* Aperçu */}
            <div>
              <label htmlFor="preview" className="text-sm font-medium text-slate-700 mb-1.5 block">
                Aperçu (exemple de sortie)
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Exemple de ce que ce template va produire comme synthèse
              </p>
              <textarea
                id="preview"
                value={formData.preview}
                onChange={handleFormChange('preview')}
                placeholder="Exemple de synthèse générée avec ce template..."
                rows={6}
                className="w-full p-3 border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
            </div>
          </div>

          {/* Colonne droite : Contenu du template */}
          <div className="space-y-4 flex flex-col">
            <div className="flex-1 flex flex-col">
              <label htmlFor="content" className="text-sm font-medium text-slate-700 mb-1.5 block">
                Prompt IA (Instructions) <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Instructions détaillées pour l'IA. Utilisez <code className="bg-slate-100 px-1 rounded">{'{{variable}}'}</code> pour les variables dynamiques.
              </p>
              <textarea
                id="content"
                value={formData.content}
                onChange={handleFormChange('content')}
                placeholder={`Vous êtes un assistant médical expert. Rédigez un compte-rendu détaillé en suivant cette structure :

1. INFORMATIONS PATIENT
   - Nom : {{patient_name}}
   - Date de consultation : {{date}}

2. MOTIF DE CONSULTATION
   - Synthétisez le motif principal

3. EXAMEN CLINIQUE
   - Décrivez les observations

4. CONCLUSION ET RECOMMANDATIONS
   - Diagnostic
   - Traitement préconisé
   - Suivi recommandé`}
                className="flex-1 min-h-[300px] w-full p-3 border border-slate-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {formTab === 'layout' && (
        <div className="overflow-y-auto">
          <div className="mb-4">
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <FileDown className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-blue-900">Options de mise en page pour l'export</p>
                <p className="text-xs text-blue-700">Ces paramètres s'appliqueront lors de l'export PDF ou Word de la synthèse</p>
              </div>
            </div>
          </div>
          <TemplateLayoutForm
            layoutConfig={formData.layout_config}
            onChange={(config) => setFormData(prev => ({ ...prev, layout_config: config }))}
            logoUrl={logoPreview || undefined}
            onLogoChange={handleLogoFileChange}
            uploadingLogo={uploadingLogo}
          />
        </div>
      )}
    </div>
  );
});

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

const AdminTemplatesTab: React.FC<AdminTemplatesTabProps> = ({
  loading = false
}) => {
  const { showSuccessPopup, showErrorPopup } = useNotification();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [widgetTemplates, setWidgetTemplates] = useState<WidgetTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'classic' | 'widget'>('classic');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [logoErrors, setLogoErrors] = useState<Set<string>>(new Set());
  
  // États pour les modals
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  
  // États pour la gestion des attributions
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false);
  const [selectedTemplateForAssignment, setSelectedTemplateForAssignment] = useState<Template | null>(null);
  
  // États pour les formulaires
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    content: '',
    preview: '',
    logo_url: '' as string | undefined,
    layout_config: defaultLayoutConfig as LayoutConfig
  });

  // Onglet actif dans le formulaire
  const [formTab, setFormTab] = useState<'content' | 'layout'>('content');
  
  // État pour l'upload de logo
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [saving, setSaving] = useState(false);

  const formatDateSafe = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('fr-FR');
  };

  // Charger les templates
  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);

      // Charger les templates classiques
      const templatesResponse = await getMyTemplates();
      logger.debug('[AdminTemplates] ===== TEMPLATES CHARGÉS =====');
      logger.debug('[AdminTemplates] Nombre:', templatesResponse.templates.length);
      templatesResponse.templates.forEach(t => {
        logger.debug(`[AdminTemplates] Template "${t.name}" (${t.id}):`, {
          logo_url: t.logo_url || 'AUCUN',
          layout_config: t.layout_config ? JSON.stringify(t.layout_config).substring(0, 100) + '...' : 'VIDE/NULL'
        });
      });
      setTemplates(templatesResponse.templates);

      // Charger les templates à widgets
      const widgetTemplatesResponse = await getMyWidgetTemplates();
      setWidgetTemplates(widgetTemplatesResponse.templates);

    } catch (err) {
      logger.error('Erreur lors du chargement des templates:', err);
      showErrorPopup('Erreur', 'Impossible de charger les templates. Veuillez réessayer.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // Actions sur les templates
  const handleViewTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setViewDialogOpen(true);
  };

  const handleEditTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Vérifier si layout_config est vide (objet sans clés) ou null/undefined
    const hasLayoutConfig = template.layout_config && Object.keys(template.layout_config).length > 0;
    setFormData({
      name: template.name,
      description: template.description || '',
      content: template.content,
      preview: template.preview || '',
      logo_url: template.logo_url,
      layout_config: hasLayoutConfig ? template.layout_config : defaultLayoutConfig
    });
    setLogoPreview(template.logo_url || null);
    setLogoFile(null);
    setFormTab('content');
    setEditDialogOpen(true);
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!template.is_system && window.confirm(`Êtes-vous sûr de vouloir supprimer le template "${template.name}" ?`)) {
      try {
        await deleteTemplate(template.id);
        showSuccessPopup('Succès', `Template "${template.name}" supprimé avec succès.`);
        await loadTemplates();
      } catch (err) {
        logger.error('Erreur lors de la suppression:', err);
        showErrorPopup('Erreur', 'Erreur lors de la suppression du template.');
      }
    } else if (template.is_system) {
      if (window.confirm(`⚠️ ATTENTION: Vous êtes sur le point de supprimer un template système "${template.name}". Cette action est irréversible. Continuer ?`)) {
        try {
          await deleteTemplate(template.id);
          showSuccessPopup('Succès', `Template système "${template.name}" supprimé avec succès.`);
          await loadTemplates();
        } catch (err) {
          logger.error('Erreur lors de la suppression:', err);
          showErrorPopup('Erreur', 'Erreur lors de la suppression du template système.');
        }
      }
    }
  };

  // Gestion des formulaires
  const handleCreateTemplate = async () => {
    setSaving(true);
    try {
      const template = await createTemplate(formData);
      
      // Si un logo a été sélectionné, l'uploader
      if (logoFile && template.id) {
        setUploadingLogo(true);
        try {
          const result = await uploadTemplateLogo(template.id, logoFile);
          // Mettre à jour le template avec le logo_url
          await updateTemplate(template.id, { logo_url: result.logo_url });
        } catch (logoErr) {
          logger.error('Erreur lors de l\'upload du logo:', logoErr);
          showErrorPopup('Avertissement', 'Template créé mais erreur lors de l\'upload du logo.');
        } finally {
          setUploadingLogo(false);
        }
      }
      
      showSuccessPopup('Succès', 'Template créé avec succès.');
      handleCloseDialog();
      await loadTemplates();
    } catch (err) {
      logger.error('Erreur lors de la création:', err);
      showErrorPopup('Erreur', 'Erreur lors de la création du template.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    logger.debug('[AdminTemplates] ===== SAUVEGARDE TEMPLATE =====');
    logger.debug('[AdminTemplates] Template ID:', selectedTemplate.id);
    logger.debug('[AdminTemplates] Logo file présent:', logoFile ? 'OUI' : 'NON');
    logger.debug('[AdminTemplates] Logo preview:', logoPreview ? 'OUI' : 'NON');
    logger.debug('[AdminTemplates] formData avant save:', {
      name: formData.name,
      logo_url: formData.logo_url,
      layout_config_keys: formData.layout_config ? Object.keys(formData.layout_config) : 'VIDE'
    });

    setSaving(true);
    try {
      // Si un nouveau logo a été sélectionné, l'uploader d'abord
      if (logoFile) {
        logger.debug('[AdminTemplates] Upload du logo en cours...');
        setUploadingLogo(true);
        try {
          const result = await uploadTemplateLogo(selectedTemplate.id, logoFile);
          logger.debug('[AdminTemplates] Logo uploadé avec succès:', result.logo_url);
          // Mettre à jour formData avec le nouveau logo_url
          formData.logo_url = result.logo_url;
        } catch (logoErr) {
          logger.error('[AdminTemplates] Erreur upload logo:', logoErr);
          showErrorPopup('Erreur', 'Erreur lors de l\'upload du logo.');
          setUploadingLogo(false);
          setSaving(false);
          return;
        } finally {
          setUploadingLogo(false);
        }
      }

      logger.debug('[AdminTemplates] formData après logo upload:', {
        name: formData.name,
        logo_url: formData.logo_url,
        layout_config: formData.layout_config
      });

      await updateTemplate(selectedTemplate.id, formData);
      logger.debug('[AdminTemplates] ✅ Template mis à jour avec succès');
      showSuccessPopup('Succès', 'Template modifié avec succès.');
      handleCloseDialog();
      await loadTemplates();
    } catch (err) {
      logger.error('[AdminTemplates] ❌ Erreur:', err);
      showErrorPopup('Erreur', 'Erreur lors de la modification du template.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setEditDialogOpen(false);
    setSelectedTemplate(null);
    setFormData({ name: '', description: '', content: '', preview: '', logo_url: undefined, layout_config: defaultLayoutConfig });
    setLogoFile(null);
    setLogoPreview(null);
    setFormTab('content');
  };

  const handleOpenCreateDialog = () => {
    setFormData({ name: '', description: '', content: '', preview: '', logo_url: undefined, layout_config: defaultLayoutConfig });
    setLogoFile(null);
    setLogoPreview(null);
    setFormTab('content');
    setCreateDialogOpen(true);
  };

  // ✅ CORRECTION FOCUS : Utiliser useCallback pour mémoriser les handlers
  const handleFormChange = useCallback((field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  }, []);

  // Fonctions pour la gestion des attributions
  const handleManageAssignments = (template: Template) => {
    setSelectedTemplateForAssignment(template);
    setAssignmentDialogOpen(true);
  };

  const handleCloseAssignmentDialog = () => {
    setAssignmentDialogOpen(false);
    setSelectedTemplateForAssignment(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* En-tête avec statistiques */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{templates.length}</p>
                <p className="text-sm text-slate-500">Templates classiques</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Layout className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{widgetTemplates.length}</p>
                <p className="text-sm text-slate-500">Templates widgets</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">
                  {templates.filter(t => t.is_system).length}
                </p>
                <p className="text-sm text-slate-500">Templates système</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Barre d'actions */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-500" />
                  Gestion des Templates
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Créez et gérez les templates de synthèse pour vos utilisateurs
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleOpenCreateDialog}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nouveau Template
                </Button>
                <Button
                  variant="outline"
                  onClick={loadTemplates}
                  disabled={loadingTemplates}
                >
                  <RefreshCw className={cn("w-4 h-4 mr-2", loadingTemplates && "animate-spin")} />
                  Actualiser
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Tabs pour templates classiques et widgets */}
      <motion.div variants={itemVariants}>
        <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'classic' | 'widget')}>
          <TabsList className="mb-6">
            <TabsTrigger value="classic" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Templates Classiques ({templates.length})
            </TabsTrigger>
            <TabsTrigger value="widget" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Templates Widgets ({widgetTemplates.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab Panel - Templates Classiques */}
          <TabsContent value="classic" className="mt-4">
            <Card className="border-slate-200">
              <CardContent className="pt-6 p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Template</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Créé le</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {templates.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center">
                            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">Aucun template trouvé</p>
                            <p className="text-sm text-slate-400 mt-1">Créez votre premier template pour commencer</p>
                            <Button onClick={handleOpenCreateDialog} className="mt-4">
                              <Plus className="w-4 h-4 mr-2" />
                              Créer un template
                            </Button>
                          </td>
                        </tr>
                      ) : (
                        templates.map((template) => (
                          <tr key={template.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                {template.logo_url && !logoErrors.has(template.id) ? (
                                  <img
                                    src={template.logo_url.startsWith('http') ? template.logo_url : `${import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh'}${template.logo_url.startsWith('/') ? '' : '/'}${template.logo_url}`}
                                    alt={template.name}
                                    className="w-10 h-10 object-contain rounded-lg border border-slate-200 p-1"
                                    onError={() => {
                                      setLogoErrors(prev => new Set(prev).add(template.id));
                                    }}
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium text-slate-900">{template.name}</p>
                                  {template.is_default && (
                                    <Badge variant="default" className="bg-emerald-500 text-white mt-1">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Par défaut
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-slate-600 line-clamp-2 max-w-xs">
                                {template.description || 'Aucune description'}
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant={template.is_system ? 'default' : 'secondary'}>
                                {template.is_system ? 'Système' : 'Personnalisé'}
                              </Badge>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600">{formatDateSafe(template.created_at)}</span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleManageAssignments(template)}
                                  title="Gérer les attributions"
                                >
                                  <Users className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleViewTemplate(template)}
                                  title="Aperçu"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleEditTemplate(template)}
                                  title="Modifier"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleDeleteTemplate(template)}
                                  title="Supprimer"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Panel - Templates Widgets */}
          <TabsContent value="widget" className="mt-4">
            <Card className="border-slate-200">
              <CardContent className="pt-6 p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Nom</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Widgets</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Créé le</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {widgetTemplates.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center">
                            <Layout className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-500 font-medium">Aucun template widget trouvé</p>
                            <p className="text-sm text-slate-400 mt-1">Les templates widgets permettent des mises en page avancées</p>
                          </td>
                        </tr>
                      ) : (
                        widgetTemplates.map((template) => (
                          <tr key={template.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                                  <Layout className="w-5 h-5 text-purple-600" />
                                </div>
                                <span className="text-sm font-medium text-slate-900">{template.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm text-slate-600 line-clamp-2 max-w-xs">{template.description}</p>
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant="secondary">
                                {template.widgets.length} widget(s)
                              </Badge>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600">{formatDateSafe(template.created_at)}</span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="icon-sm" title="Voir">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" title="Modifier">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon-sm" title="Supprimer" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Modal de création - TRÈS LARGE */}
      <LargeModal
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title={
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-500" />
            Créer un nouveau template
          </div>
        }
        description="Configurez le contenu et la mise en page de votre nouveau template"
      >
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            <TemplateFormContent
              isEdit={false}
              formTab={formTab}
              setFormTab={setFormTab}
              formData={formData}
              handleFormChange={handleFormChange}
              logoFile={logoFile}
              logoPreview={logoPreview}
              setLogoFile={setLogoFile}
              setLogoPreview={setLogoPreview}
              setFormData={setFormData}
              uploadingLogo={uploadingLogo}
              showErrorPopup={showErrorPopup}
            />
          </div>

          <div className="flex-shrink-0 border-t border-slate-200 pt-4 mt-4 flex justify-end gap-3 pb-0">
            <Button variant="outline" onClick={handleCloseDialog} disabled={saving}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={!formData.name.trim() || !formData.content.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Créer le template
                </>
              )}
            </Button>
          </div>
        </div>
      </LargeModal>

      {/* Modal de modification - TRÈS LARGE */}
      <LargeModal
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        title={
          <div className="flex items-center gap-2">
            <Edit className="w-5 h-5 text-blue-500" />
            Modifier le template
          </div>
        }
        description={`Modifiez le contenu et les options de mise en page du template "${selectedTemplate?.name}"`}
        className="p-8"
      >
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto min-h-0 pb-4">
            <TemplateFormContent
              isEdit={true}
              formTab={formTab}
              setFormTab={setFormTab}
              formData={formData}
              handleFormChange={handleFormChange}
              logoFile={logoFile}
              logoPreview={logoPreview}
              setLogoFile={setLogoFile}
              setLogoPreview={setLogoPreview}
              setFormData={setFormData}
              uploadingLogo={uploadingLogo}
              showErrorPopup={showErrorPopup}
            />
          </div>

          <div className="flex-shrink-0 border-t border-slate-200 pt-4 mt-4 flex justify-end gap-3">
            <Button variant="outline" onClick={handleCloseDialog} disabled={saving}>
              Annuler
            </Button>
          <Button 
            onClick={handleUpdateTemplate}
              disabled={!formData.name.trim() || !formData.content.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Enregistrer les modifications
                </>
              )}
          </Button>
          </div>
        </div>
      </LargeModal>

      {/* Dialog de visualisation */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-500" />
          Aperçu - {selectedTemplate?.name}
        </DialogTitle>
            <DialogDescription>
              {selectedTemplate?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Prompt IA (Instructions)
                </h4>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <pre className="text-sm whitespace-pre-wrap font-mono text-slate-700">{selectedTemplate.content}</pre>
                </div>
              </div>
              {selectedTemplate.preview && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <FileDown className="w-4 h-4" />
                    Exemple de sortie
                  </h4>
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <pre className="text-sm whitespace-pre-wrap font-mono text-emerald-900">{selectedTemplate.preview}</pre>
                  </div>
                </div>
              )}
              {selectedTemplate.layout_config && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Configuration de mise en page
                  </h4>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <pre className="text-xs whitespace-pre-wrap font-mono text-blue-900">
                      {JSON.stringify(selectedTemplate.layout_config, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
          <Button onClick={() => setViewDialogOpen(false)}>Fermer</Button>
            <Button variant="outline" onClick={() => {
              setViewDialogOpen(false);
              if (selectedTemplate) handleEditTemplate(selectedTemplate);
            }}>
              <Edit className="w-4 h-4 mr-2" />
              Modifier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de gestion des attributions */}
      <TemplateAssignmentDialog
        open={assignmentDialogOpen}
        onClose={handleCloseAssignmentDialog}
        templateId={selectedTemplateForAssignment?.id || ''}
        templateName={selectedTemplateForAssignment?.name || ''}
      />
    </motion.div>
  );
};

export default AdminTemplatesTab;
