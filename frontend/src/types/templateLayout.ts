/**
 * Types pour la configuration de mise en page des templates
 */

// Position du logo
export type LogoPosition = 'left' | 'center' | 'right';

// Position des numéros de page
export type PageNumberPosition = 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-left' | 'top-center' | 'top-right';

// Orientation de la page
export type PageOrientation = 'portrait' | 'landscape';

// Format de la page
export type PageFormat = 'A4' | 'Letter' | 'Legal';

// Espacement des lignes
export type LineSpacing = 'single' | '1.5' | 'double';

// Style de séparateur
export type SeparatorStyle = 'none' | 'line' | 'double-line' | 'dotted';

// Format de date
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD MMMM YYYY';

// Polices disponibles
export type FontFamily = 'Helvetica' | 'Times New Roman' | 'Arial' | 'Calibri' | 'Georgia' | 'Verdana';

// Taille de titre
export type TitleSize = 'small' | 'medium' | 'large';

// Style de titre
export type TitleStyle = 'normal' | 'underline' | 'background' | 'boxed';

// Qualité d'image pour PDF
export type ImageQuality = 'low' | 'medium' | 'high';

// Marges
export interface Margins {
  top: number;    // en mm
  bottom: number; // en mm
  left: number;   // en mm
  right: number;  // en mm
}

// Configuration de l'en-tête
export interface HeaderConfig {
  // Logo
  logoUrl?: string;
  logoPosition: LogoPosition;
  logoMaxHeight: number;      // en mm
  repeatLogoOnAllPages: boolean;

  // Texte d'en-tête
  headerText?: string;
  showCompanyName: boolean;
  companyName?: string;

  // Séparateur sous l'en-tête
  showHeaderSeparator: boolean;
  headerSeparatorStyle: SeparatorStyle;
}

// Configuration du pied de page
export interface FooterConfig {
  // Texte personnalisé
  footerText?: string;
  showContactInfo: boolean;
  contactInfo?: string;

  // Numéros de page
  showPageNumbers: boolean;
  pageNumberPosition: PageNumberPosition;
  pageNumberFormat: string; // ex: "Page {n}/{total}" ou "{n}/{total}" ou "{n}"

  // Séparateur au-dessus du pied de page
  showFooterSeparator: boolean;
  footerSeparatorStyle: SeparatorStyle;
}

// Configuration de la mise en page
export interface PageConfig {
  format: PageFormat;
  orientation: PageOrientation;
  margins: Margins;
}

// Configuration du style visuel
export interface StyleConfig {
  // Couleurs
  primaryColor: string;     // Couleur des titres principaux
  secondaryColor: string;   // Couleur des sous-titres
  textColor: string;        // Couleur du texte normal
  backgroundColor: string;  // Couleur de fond

  // Police
  fontFamily: FontFamily;
  fontSize: number;         // Taille du texte normal en pt
  lineSpacing: LineSpacing;

  // Style des titres
  titleStyle: TitleStyle;
  titleSize: TitleSize;

  // Filigrane
  showWatermark: boolean;
  watermarkText?: string;
  watermarkOpacity: number; // 0 à 1
}

// Configuration du contenu
export interface ContentConfig {
  // Table des matières
  showTableOfContents: boolean;

  // Métadonnées
  showMeetingDate: boolean;
  dateFormat: DateFormat;
  showParticipants: boolean;
  showDuration: boolean;

  // Export
  imageQuality: ImageQuality;
  pdfAuthor?: string;
  pdfSubject?: string;
  pdfKeywords?: string;
}

// Configuration complète du layout
export interface LayoutConfig {
  // Configuration de l'en-tête
  header: HeaderConfig;

  // Configuration du pied de page
  footer: FooterConfig;

  // Configuration de la page
  page: PageConfig;

  // Configuration du style
  style: StyleConfig;

  // Configuration du contenu
  content: ContentConfig;
}

// Configuration par défaut
export const defaultLayoutConfig: LayoutConfig = {
  header: {
    logoPosition: 'left',
    logoMaxHeight: 20,
    repeatLogoOnAllPages: true,
    showCompanyName: false,
    showHeaderSeparator: true,
    headerSeparatorStyle: 'line',
  },
  footer: {
    showContactInfo: false,
    showPageNumbers: true,
    pageNumberPosition: 'bottom-center',
    pageNumberFormat: 'Page {n}/{total}',
    showFooterSeparator: false,
    footerSeparatorStyle: 'none',
  },
  page: {
    format: 'A4',
    orientation: 'portrait',
    margins: {
      top: 25,
      bottom: 25,
      left: 20,
      right: 20,
    },
  },
  style: {
    primaryColor: '#1e3a5f',
    secondaryColor: '#4a6fa5',
    textColor: '#333333',
    backgroundColor: '#ffffff',
    fontFamily: 'Helvetica',
    fontSize: 11,
    lineSpacing: 'single',
    titleStyle: 'normal',
    titleSize: 'medium',
    showWatermark: false,
    watermarkOpacity: 0.1,
  },
  content: {
    showTableOfContents: false,
    showMeetingDate: true,
    dateFormat: 'DD/MM/YYYY',
    showParticipants: true,
    showDuration: true,
    imageQuality: 'high',
  },
};

// Helper pour convertir un ancien format de layout_config vers le nouveau
export function migrateLayoutConfig(oldConfig: any): LayoutConfig {
  if (!oldConfig) return { ...defaultLayoutConfig };

  // Si c'est déjà le nouveau format
  if (oldConfig.header && oldConfig.footer && oldConfig.page && oldConfig.style) {
    return oldConfig as LayoutConfig;
  }

  // Migration depuis l'ancien format
  return {
    header: {
      logoUrl: oldConfig.header_logo_url || oldConfig.logo_url,
      logoPosition: oldConfig.header_position || 'left',
      logoMaxHeight: 20,
      repeatLogoOnAllPages: oldConfig.repeat_header ?? true,
      showCompanyName: false,
      showHeaderSeparator: oldConfig.show_separators ?? true,
      headerSeparatorStyle: 'line',
    },
    footer: {
      showContactInfo: false,
      showPageNumbers: oldConfig.show_page_numbers ?? true,
      pageNumberPosition: oldConfig.page_number_position || 'bottom-center',
      pageNumberFormat: oldConfig.page_number_format || 'Page {n}/{total}',
      showFooterSeparator: false,
      footerSeparatorStyle: 'none',
    },
    page: {
      format: 'A4',
      orientation: 'portrait',
      margins: oldConfig.margins ? {
        top: parseInt(oldConfig.margins.top) || 25,
        bottom: parseInt(oldConfig.margins.bottom) || 25,
        left: parseInt(oldConfig.margins.left) || 20,
        right: parseInt(oldConfig.margins.right) || 20,
      } : defaultLayoutConfig.page.margins,
    },
    style: {
      primaryColor: oldConfig.title_color || '#1e3a5f',
      secondaryColor: '#4a6fa5',
      textColor: oldConfig.text_color || '#333333',
      backgroundColor: oldConfig.background_color || '#ffffff',
      fontFamily: 'Helvetica',
      fontSize: 11,
      lineSpacing: 'single',
      titleStyle: 'normal',
      titleSize: 'medium',
      showWatermark: false,
      watermarkOpacity: 0.1,
    },
    content: {
      showTableOfContents: false,
      showMeetingDate: true,
      dateFormat: 'DD/MM/YYYY',
      showParticipants: true,
      showDuration: true,
      imageQuality: 'high',
    },
  };
}
