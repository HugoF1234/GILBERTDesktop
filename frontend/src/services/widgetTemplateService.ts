/**
 * Service pour gérer les templates avec widgets
 */

import apiClient from './apiClient';

// Types basés sur les modèles backend
export interface WidgetConfig {
  title: string;
  emoji?: string;
  show_title: boolean;
  ai_prompt: string;
  max_length?: number;
  max_items?: number;
  color?: string;
  list_style?: 'bullet' | 'numbered' | 'checkbox';
  columns?: Array<{
    key: string;
    label: string;
    width: string;
  }>;
  severity_levels?: string[];
  show_speakers?: boolean;
  show_timestamps?: boolean;
  show_date?: boolean;
  show_description?: boolean;
  group_by_topic?: boolean;
  allow_markdown?: boolean;
  markdown_allowed_tags?: string[];
}

export interface Widget {
  id: string;
  type: 'summary' | 'list' | 'table' | 'actions' | 'risks' | 'milestone' | 'conversation_log' | 'custom_paragraph' | 'custom';
  order: number;
  config: WidgetConfig;
  base_type?: string;
}

export interface TemplateConfig {
  global_style: {
    font_family: string;
    primary_color: string;
    secondary_color: string;
    max_width: string;
    background_color?: string;
  };
  ai_instructions: string;
  layout?: {
    header_logo_url?: string;
    header_position?: 'left' | 'center' | 'right';
    repeat_header?: boolean;
    show_page_numbers?: boolean;
    page_number_position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
    page_number_format?: string;
    margins?: {
      top: string;
      bottom: string;
      left: string;
      right: string;
    };
    show_separators?: boolean;
  };
  typography?: {
    h1?: { size?: string; weight?: number; color?: string; margin_bottom?: string };
    h2?: { size?: string; weight?: number; color?: string; margin_bottom?: string };
    body?: { size?: string; line_height?: string; color?: string };
  };
  box_style?: {
    border?: string;
    border_radius?: string;
    padding?: string;
    background_color?: string;
    separator?: boolean;
  };
  export_options?: {
    pdf_enable?: boolean;
    word_enable?: boolean;
    repeat_header?: boolean;
  };
}

export interface WidgetTemplate {
  id?: string;
  name: string;
  description: string;
  version: string;
  config: TemplateConfig;
  widgets: Widget[];
  is_system?: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  is_default?: boolean;
  assigned_at?: string;
}

export interface WidgetPreset {
  type: string;
  label: string;
  description: string;
  icon: string;
  default_config: WidgetConfig;
}

export interface WidgetTemplateListResponse {
  templates: WidgetTemplate[];
  default_template_id?: string;
}

// Fonctions API
export const getWidgetPresets = async (): Promise<WidgetPreset[]> => {
  const response = await apiClient.get('/api/widget-templates/presets');
  return response;
};

export const getMyWidgetTemplates = async (): Promise<WidgetTemplateListResponse> => {
  const response = await apiClient.get('/api/widget-templates/');
  return response;
};

export const getWidgetTemplateById = async (id: string): Promise<WidgetTemplate> => {
  const response = await apiClient.get(`/api/widget-templates/${id}`);
  return response;
};

export const createWidgetTemplate = async (data: Omit<WidgetTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<WidgetTemplate> => {
  const response = await apiClient.post('/api/widget-templates/', data);
  return response;
};

export const updateWidgetTemplate = async (id: string, data: Partial<WidgetTemplate>): Promise<WidgetTemplate> => {
  const response = await apiClient.put(`/api/widget-templates/${id}`, data);
  return response;
};

export const deleteWidgetTemplate = async (id: string): Promise<void> => {
  await apiClient.delete(`/api/widget-templates/${id}`);
};

// Fonctions utilitaires
export const createDefaultTemplate = (name: string, description: string): Omit<WidgetTemplate, 'id' | 'created_at' | 'updated_at'> => {
  return {
    name,
    description,
    version: '1.0.0',
    config: {
      global_style: {
        font_family: 'Inter, sans-serif',
        primary_color: '#FF6B6B',
        secondary_color: '#8B5CF6',
        max_width: '800px',
        background_color: '#ffffff',
      },
      ai_instructions: 'Génère un compte-rendu professionnel basé sur les widgets configurés.',
      layout: {
        header_logo_url: '',
        header_position: 'left',
        repeat_header: true,
        show_page_numbers: true,
        page_number_position: 'bottom-center',
        page_number_format: 'Page {n}/{total}',
        margins: { top: '40px', bottom: '40px', left: '36px', right: '36px' },
        show_separators: false,
      },
      typography: {
        h1: { size: '22px', weight: 700, color: '#0f172a', margin_bottom: '8px' },
        h2: { size: '18px', weight: 700, color: '#111827', margin_bottom: '6px' },
        body: { size: '14px', line_height: '1.6', color: '#111827' },
      },
      box_style: {
        border: '1px solid #E5E7EB',
        border_radius: '8px',
        padding: '12px',
        background_color: '#ffffff',
        separator: false,
      },
      export_options: {
        pdf_enable: true,
        word_enable: true,
        repeat_header: true,
      },
    },
    widgets: [
      {
        id: 'widget-1',
        type: 'summary',
        order: 1,
        config: {
          title: 'Résumé',
          emoji: '🧠',
          show_title: true,
          max_length: 150,
          ai_prompt: 'Résume les points essentiels de la réunion en maximum 150 mots.'
        }
      }
    ]
  };
};

export const generateWidgetId = (): string => {
  return `widget-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const reorderWidgets = (widgets: Widget[]): Widget[] => {
  return widgets
    .sort((a, b) => a.order - b.order)
    .map((widget, index) => ({
      ...widget,
      order: index + 1
    }));
};

// Validation côté frontend
export const validateWidget = (widget: Widget): string[] => {
  const errors: string[] = [];
  
  if (!widget.id) {
    errors.push('ID du widget requis');
  }
  
  if (!widget.type) {
    errors.push('Type de widget requis');
  }
  
  if (!widget.config.title || widget.config.title.trim().length === 0) {
    errors.push('Titre du widget requis');
  }
  
  if (widget.config.title && widget.config.title.length > 100) {
    errors.push('Le titre ne peut pas dépasser 100 caractères');
  }
  
  if (!widget.config.ai_prompt || widget.config.ai_prompt.trim().length < 10) {
    errors.push('Le prompt IA doit contenir au moins 10 caractères');
  }
  
  if (widget.config.ai_prompt && widget.config.ai_prompt.length > 1000) {
    errors.push('Le prompt IA ne peut pas dépasser 1000 caractères');
  }
  
  // Validation spécifique selon le type
  if (widget.type === 'summary') {
    if (!widget.config.max_length || widget.config.max_length < 50 || widget.config.max_length > 2000) {
      errors.push('La longueur maximale doit être entre 50 et 2000 caractères');
    }
  }
  
  if (widget.type === 'list') {
    if (!widget.config.list_style) {
      errors.push('Style de liste requis');
    }
    if (!widget.config.max_items || widget.config.max_items < 1 || widget.config.max_items > 50) {
      errors.push('Le nombre maximum d\'items doit être entre 1 et 50');
    }
  }
  
  if (widget.type === 'table' || widget.type === 'actions') {
    if (!widget.config.columns || widget.config.columns.length === 0) {
      errors.push('Au moins une colonne est requise');
    }
    if (widget.config.columns && widget.config.columns.length > 10) {
      errors.push('Maximum 10 colonnes autorisées');
    }
  }
  
  return errors;
};

export const validateTemplate = (template: Omit<WidgetTemplate, 'id' | 'created_at' | 'updated_at'>): string[] => {
  const errors: string[] = [];
  
  if (!template.name || template.name.trim().length === 0) {
    errors.push('Nom du template requis');
  }
  
  if (template.name && template.name.length > 100) {
    errors.push('Le nom ne peut pas dépasser 100 caractères');
  }
  
  if (!template.description || template.description.trim().length === 0) {
    errors.push('Description du template requise');
  }
  
  if (template.description && template.description.length > 500) {
    errors.push('La description ne peut pas dépasser 500 caractères');
  }
  
  if (!template.widgets || template.widgets.length === 0) {
    errors.push('Au moins un widget est requis');
  }
  
  if (template.widgets && template.widgets.length > 30) {
    errors.push('Maximum 30 widgets autorisés');
  }
  
  // Vérifier les IDs uniques
  if (template.widgets) {
    const ids = template.widgets.map(w => w.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push('Les IDs des widgets doivent être uniques');
    }
  }
  
  // Vérifier les ordres uniques
  if (template.widgets) {
    const orders = template.widgets.map(w => w.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      errors.push('Les ordres des widgets doivent être uniques');
    }
  }
  
  // Valider chaque widget
  if (template.widgets) {
    template.widgets.forEach((widget, index) => {
      const widgetErrors = validateWidget(widget);
      widgetErrors.forEach(error => {
        errors.push(`Widget ${index + 1}: ${error}`);
      });
    });
  }
  
  return errors;
};
