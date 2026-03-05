/**
 * TemplateLayoutForm - Formulaire de configuration de mise en page des templates
 */

import React, { useState } from 'react';
import {
  LayoutConfig,
  defaultLayoutConfig,
  LogoPosition,
  PageNumberPosition,
  PageOrientation,
  PageFormat,
  LineSpacing,
  SeparatorStyle,
  DateFormat,
  FontFamily,
  TitleSize,
  TitleStyle,
  ImageQuality,
  migrateLayoutConfig,
} from '../types/templateLayout';
import { cn } from '@/lib/utils';
import {
  Image as ImageIcon,
  Type,
  FileText,
  Settings,
  Layout,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronDown,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

interface TemplateLayoutFormProps {
  layoutConfig: any; // Peut être ancien ou nouveau format
  onChange: (config: LayoutConfig) => void;
  logoUrl?: string;
}

const TemplateLayoutForm: React.FC<TemplateLayoutFormProps> = ({
  layoutConfig,
  onChange,
  logoUrl,
}) => {
  // Migrer le config si nécessaire
  const [config, setConfig] = useState<LayoutConfig>(() => {
    const migrated = migrateLayoutConfig(layoutConfig);
    // Si un logoUrl est passé, l'utiliser
    if (logoUrl && !migrated.header.logoUrl) {
      migrated.header.logoUrl = logoUrl;
    }
    return migrated;
  });

  const [activeTab, setActiveTab] = useState('header');

  const updateConfig = (path: string, value: any) => {
    // Deep clone pour éviter les mutations
    const newConfig = JSON.parse(JSON.stringify(config)) as LayoutConfig;
    const keys = path.split('.');
    let current: any = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    setConfig(newConfig);
    onChange(newConfig);
  };

  // Composant pour checkbox
  const Checkbox = ({
    checked,
    onChange: onChangeHandler,
    label,
    description,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <label className="flex items-start gap-3 cursor-pointer group select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChangeHandler(e.target.checked)}
        className="sr-only"
      />
      <div
        onClick={() => onChangeHandler(!checked)}
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors mt-0.5 cursor-pointer",
          checked
            ? "bg-blue-500 border-blue-500"
            : "border-slate-300 group-hover:border-blue-400"
        )}
      >
        {checked && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div onClick={() => onChangeHandler(!checked)} className="cursor-pointer">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );

  // Composant pour select
  const Select = ({
    value,
    onChange: onChangeHandler,
    options,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    label?: string;
  }) => (
    <div className="relative">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChangeHandler(e.target.value)}
          className="w-full appearance-none bg-white border border-slate-200 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );

  // Composant pour input couleur
  const ColorInput = ({
    value,
    onChange: onChangeHandler,
    label,
  }: {
    value: string;
    onChange: (value: string) => void;
    label: string;
  }) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChangeHandler(e.target.value)}
          className="w-10 h-10 rounded border border-slate-200 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChangeHandler(e.target.value)}
          className="flex-1"
          placeholder="#000000"
        />
      </div>
    </div>
  );

  // Composant pour slider numérique
  const NumberSlider = ({
    value,
    onChange: onChangeHandler,
    min,
    max,
    step = 1,
    label,
    unit = '',
  }: {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    step?: number;
    label: string;
    unit?: string;
  }) => (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="text-sm text-slate-500">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChangeHandler(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-5 gap-1 h-auto p-1">
          <TabsTrigger value="header" className="flex items-center gap-1.5 text-xs py-2 px-3">
            <ImageIcon className="w-3.5 h-3.5" />
            En-tête
          </TabsTrigger>
          <TabsTrigger value="footer" className="flex items-center gap-1.5 text-xs py-2 px-3">
            <FileText className="w-3.5 h-3.5" />
            Pied de page
          </TabsTrigger>
          <TabsTrigger value="page" className="flex items-center gap-1.5 text-xs py-2 px-3">
            <Layout className="w-3.5 h-3.5" />
            Page
          </TabsTrigger>
          <TabsTrigger value="style" className="flex items-center gap-1.5 text-xs py-2 px-3">
            <Palette className="w-3.5 h-3.5" />
            Style
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-1.5 text-xs py-2 px-3">
            <Settings className="w-3.5 h-3.5" />
            Contenu
          </TabsTrigger>
        </TabsList>

        {/* Onglet En-tête */}
        <TabsContent value="header" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-500" />
                Configuration de l'en-tête
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Logo</h4>

                {(logoUrl || config.header.logoUrl) && (
                  <div className="p-3 bg-slate-50 rounded-lg border">
                    <p className="text-xs text-slate-500 mb-2">Aperçu du logo :</p>
                    <img
                      src={logoUrl || config.header.logoUrl}
                      alt="Logo"
                      className="max-h-16 object-contain"
                    />
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <label className="text-sm font-medium text-slate-700 col-span-3">Position du logo</label>
                  {(['left', 'center', 'right'] as LogoPosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      onClick={() => updateConfig('header.logoPosition', pos)}
                      className={cn(
                        "flex items-center justify-center gap-2 p-2 rounded-lg border-2 transition-colors",
                        config.header.logoPosition === pos
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 hover:border-slate-300"
                      )}
                    >
                      {pos === 'left' && <AlignLeft className="w-4 h-4" />}
                      {pos === 'center' && <AlignCenter className="w-4 h-4" />}
                      {pos === 'right' && <AlignRight className="w-4 h-4" />}
                      <span className="text-sm capitalize">
                        {pos === 'left' ? 'Gauche' : pos === 'center' ? 'Centre' : 'Droite'}
                      </span>
                    </button>
                  ))}
                </div>

                <NumberSlider
                  value={config.header.logoMaxHeight}
                  onChange={(v) => updateConfig('header.logoMaxHeight', v)}
                  min={10}
                  max={50}
                  label="Hauteur max du logo"
                  unit="mm"
                />

                <Checkbox
                  checked={config.header.repeatLogoOnAllPages}
                  onChange={(v) => updateConfig('header.repeatLogoOnAllPages', v)}
                  label="Répéter le logo sur toutes les pages"
                  description="Le logo apparaîtra en haut de chaque page du document"
                />
              </div>

              {/* Texte d'en-tête */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Texte d'en-tête</h4>

                <Checkbox
                  checked={config.header.showCompanyName}
                  onChange={(v) => updateConfig('header.showCompanyName', v)}
                  label="Afficher le nom de l'entreprise"
                />

                {config.header.showCompanyName && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Nom de l'entreprise
                    </label>
                    <Input
                      value={config.header.companyName || ''}
                      onChange={(e) => updateConfig('header.companyName', e.target.value)}
                      placeholder="Nom de votre entreprise"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Texte personnalisé (optionnel)
                  </label>
                  <Input
                    value={config.header.headerText || ''}
                    onChange={(e) => updateConfig('header.headerText', e.target.value)}
                    placeholder="Ex: Document confidentiel"
                  />
                </div>
              </div>

              {/* Séparateur */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Séparateur</h4>

                <Checkbox
                  checked={config.header.showHeaderSeparator}
                  onChange={(v) => updateConfig('header.showHeaderSeparator', v)}
                  label="Afficher une ligne sous l'en-tête"
                />

                {config.header.showHeaderSeparator && (
                  <Select
                    value={config.header.headerSeparatorStyle}
                    onChange={(v) => updateConfig('header.headerSeparatorStyle', v)}
                    label="Style du séparateur"
                    options={[
                      { value: 'line', label: 'Ligne simple' },
                      { value: 'double-line', label: 'Double ligne' },
                      { value: 'dotted', label: 'Pointillés' },
                    ]}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Pied de page */}
        <TabsContent value="footer" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                Configuration du pied de page
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Numéros de page */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Numéros de page</h4>

                <Checkbox
                  checked={config.footer.showPageNumbers}
                  onChange={(v) => updateConfig('footer.showPageNumbers', v)}
                  label="Afficher les numéros de page"
                />

                {config.footer.showPageNumbers && (
                  <>
                    <Select
                      value={config.footer.pageNumberPosition}
                      onChange={(v) => updateConfig('footer.pageNumberPosition', v)}
                      label="Position des numéros"
                      options={[
                        { value: 'bottom-left', label: 'Bas gauche' },
                        { value: 'bottom-center', label: 'Bas centre' },
                        { value: 'bottom-right', label: 'Bas droite' },
                        { value: 'top-left', label: 'Haut gauche' },
                        { value: 'top-center', label: 'Haut centre' },
                        { value: 'top-right', label: 'Haut droite' },
                      ]}
                    />

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Format des numéros
                      </label>
                      <Input
                        value={config.footer.pageNumberFormat}
                        onChange={(e) => updateConfig('footer.pageNumberFormat', e.target.value)}
                        placeholder="Page {n}/{total}"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Utilisez {'{n}'} pour le numéro actuel et {'{total}'} pour le nombre total
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Texte de pied de page */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Texte personnalisé</h4>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Texte de pied de page
                  </label>
                  <Input
                    value={config.footer.footerText || ''}
                    onChange={(e) => updateConfig('footer.footerText', e.target.value)}
                    placeholder="Ex: Généré par Gilbert"
                  />
                </div>

                <Checkbox
                  checked={config.footer.showContactInfo}
                  onChange={(v) => updateConfig('footer.showContactInfo', v)}
                  label="Afficher les coordonnées"
                />

                {config.footer.showContactInfo && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Coordonnées
                    </label>
                    <Input
                      value={config.footer.contactInfo || ''}
                      onChange={(e) => updateConfig('footer.contactInfo', e.target.value)}
                      placeholder="Ex: contact@entreprise.com - 01 23 45 67 89"
                    />
                  </div>
                )}
              </div>

              {/* Séparateur */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Séparateur</h4>

                <Checkbox
                  checked={config.footer.showFooterSeparator}
                  onChange={(v) => updateConfig('footer.showFooterSeparator', v)}
                  label="Afficher une ligne au-dessus du pied de page"
                />

                {config.footer.showFooterSeparator && (
                  <Select
                    value={config.footer.footerSeparatorStyle}
                    onChange={(v) => updateConfig('footer.footerSeparatorStyle', v)}
                    label="Style du séparateur"
                    options={[
                      { value: 'line', label: 'Ligne simple' },
                      { value: 'double-line', label: 'Double ligne' },
                      { value: 'dotted', label: 'Pointillés' },
                    ]}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Page */}
        <TabsContent value="page" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layout className="w-4 h-4 text-blue-500" />
                Configuration de la page
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Format et orientation */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  value={config.page.format}
                  onChange={(v) => updateConfig('page.format', v)}
                  label="Format de page"
                  options={[
                    { value: 'A4', label: 'A4 (210 x 297 mm)' },
                    { value: 'Letter', label: 'Letter (216 x 279 mm)' },
                    { value: 'Legal', label: 'Legal (216 x 356 mm)' },
                  ]}
                />

                <Select
                  value={config.page.orientation}
                  onChange={(v) => updateConfig('page.orientation', v)}
                  label="Orientation"
                  options={[
                    { value: 'portrait', label: 'Portrait' },
                    { value: 'landscape', label: 'Paysage' },
                  ]}
                />
              </div>

              {/* Marges */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Marges (mm)</h4>

                <div className="grid grid-cols-2 gap-4">
                  <NumberSlider
                    value={config.page.margins.top}
                    onChange={(v) => updateConfig('page.margins.top', v)}
                    min={10}
                    max={50}
                    label="Haut"
                    unit="mm"
                  />
                  <NumberSlider
                    value={config.page.margins.bottom}
                    onChange={(v) => updateConfig('page.margins.bottom', v)}
                    min={10}
                    max={50}
                    label="Bas"
                    unit="mm"
                  />
                  <NumberSlider
                    value={config.page.margins.left}
                    onChange={(v) => updateConfig('page.margins.left', v)}
                    min={10}
                    max={50}
                    label="Gauche"
                    unit="mm"
                  />
                  <NumberSlider
                    value={config.page.margins.right}
                    onChange={(v) => updateConfig('page.margins.right', v)}
                    min={10}
                    max={50}
                    label="Droite"
                    unit="mm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Style */}
        <TabsContent value="style" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Palette className="w-4 h-4 text-blue-500" />
                Configuration du style
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Couleurs */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Couleurs</h4>

                <div className="grid grid-cols-2 gap-4">
                  <ColorInput
                    value={config.style.primaryColor}
                    onChange={(v) => updateConfig('style.primaryColor', v)}
                    label="Couleur des titres"
                  />
                  <ColorInput
                    value={config.style.secondaryColor}
                    onChange={(v) => updateConfig('style.secondaryColor', v)}
                    label="Couleur des sous-titres"
                  />
                  <ColorInput
                    value={config.style.textColor}
                    onChange={(v) => updateConfig('style.textColor', v)}
                    label="Couleur du texte"
                  />
                  <ColorInput
                    value={config.style.backgroundColor}
                    onChange={(v) => updateConfig('style.backgroundColor', v)}
                    label="Couleur de fond"
                  />
                </div>
              </div>

              {/* Typographie */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Typographie</h4>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={config.style.fontFamily}
                    onChange={(v) => updateConfig('style.fontFamily', v)}
                    label="Police"
                    options={[
                      { value: 'Helvetica', label: 'Helvetica' },
                      { value: 'Arial', label: 'Arial' },
                      { value: 'Times New Roman', label: 'Times New Roman' },
                      { value: 'Calibri', label: 'Calibri' },
                      { value: 'Georgia', label: 'Georgia' },
                      { value: 'Verdana', label: 'Verdana' },
                    ]}
                  />

                  <Select
                    value={config.style.lineSpacing}
                    onChange={(v) => updateConfig('style.lineSpacing', v)}
                    label="Interligne"
                    options={[
                      { value: 'single', label: 'Simple' },
                      { value: '1.5', label: '1,5 ligne' },
                      { value: 'double', label: 'Double' },
                    ]}
                  />
                </div>

                <NumberSlider
                  value={config.style.fontSize}
                  onChange={(v) => updateConfig('style.fontSize', v)}
                  min={8}
                  max={16}
                  label="Taille du texte"
                  unit="pt"
                />
              </div>

              {/* Style des titres */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Style des titres</h4>

                <div className="grid grid-cols-2 gap-4">
                  <Select
                    value={config.style.titleStyle}
                    onChange={(v) => updateConfig('style.titleStyle', v)}
                    label="Style"
                    options={[
                      { value: 'normal', label: 'Normal' },
                      { value: 'underline', label: 'Souligné' },
                      { value: 'background', label: 'Fond coloré' },
                      { value: 'boxed', label: 'Encadré' },
                    ]}
                  />

                  <Select
                    value={config.style.titleSize}
                    onChange={(v) => updateConfig('style.titleSize', v)}
                    label="Taille"
                    options={[
                      { value: 'small', label: 'Petit' },
                      { value: 'medium', label: 'Moyen' },
                      { value: 'large', label: 'Grand' },
                    ]}
                  />
                </div>
              </div>

              {/* Filigrane */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Filigrane (Watermark)</h4>

                <Checkbox
                  checked={config.style.showWatermark}
                  onChange={(v) => updateConfig('style.showWatermark', v)}
                  label="Afficher un filigrane"
                  description="Texte en arrière-plan sur toutes les pages"
                />

                {config.style.showWatermark && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Texte du filigrane
                      </label>
                      <Input
                        value={config.style.watermarkText || ''}
                        onChange={(e) => updateConfig('style.watermarkText', e.target.value)}
                        placeholder="Ex: CONFIDENTIEL, DRAFT, etc."
                      />
                    </div>

                    <NumberSlider
                      value={config.style.watermarkOpacity * 100}
                      onChange={(v) => updateConfig('style.watermarkOpacity', v / 100)}
                      min={5}
                      max={30}
                      label="Opacité"
                      unit="%"
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Contenu */}
        <TabsContent value="content" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-500" />
                Configuration du contenu
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Options du document */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Options du document</h4>

                <Checkbox
                  checked={config.content.showTableOfContents}
                  onChange={(v) => updateConfig('content.showTableOfContents', v)}
                  label="Inclure une table des matières"
                  description="Génère automatiquement une table des matières basée sur les titres"
                />

                <Checkbox
                  checked={config.content.showMeetingDate}
                  onChange={(v) => updateConfig('content.showMeetingDate', v)}
                  label="Afficher la date de la réunion"
                />

                {config.content.showMeetingDate && (
                  <Select
                    value={config.content.dateFormat}
                    onChange={(v) => updateConfig('content.dateFormat', v)}
                    label="Format de date"
                    options={[
                      { value: 'DD/MM/YYYY', label: '31/12/2024' },
                      { value: 'MM/DD/YYYY', label: '12/31/2024' },
                      { value: 'YYYY-MM-DD', label: '2024-12-31' },
                      { value: 'DD MMMM YYYY', label: '31 décembre 2024' },
                    ]}
                  />
                )}

                <Checkbox
                  checked={config.content.showParticipants}
                  onChange={(v) => updateConfig('content.showParticipants', v)}
                  label="Afficher la liste des participants"
                />

                <Checkbox
                  checked={config.content.showDuration}
                  onChange={(v) => updateConfig('content.showDuration', v)}
                  label="Afficher la durée de la réunion"
                />
              </div>

              {/* Options d'export */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-600 border-b pb-1">Options d'export</h4>

                <Select
                  value={config.content.imageQuality}
                  onChange={(v) => updateConfig('content.imageQuality', v)}
                  label="Qualité des images (PDF)"
                  options={[
                    { value: 'low', label: 'Basse (fichier plus léger)' },
                    { value: 'medium', label: 'Moyenne' },
                    { value: 'high', label: 'Haute (meilleure qualité)' },
                  ]}
                />

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Auteur du document (métadonnées PDF)
                  </label>
                  <Input
                    value={config.content.pdfAuthor || ''}
                    onChange={(e) => updateConfig('content.pdfAuthor', e.target.value)}
                    placeholder="Nom de l'auteur"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Sujet (métadonnées PDF)
                  </label>
                  <Input
                    value={config.content.pdfSubject || ''}
                    onChange={(e) => updateConfig('content.pdfSubject', e.target.value)}
                    placeholder="Sujet du document"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Mots-clés (métadonnées PDF)
                  </label>
                  <Input
                    value={config.content.pdfKeywords || ''}
                    onChange={(e) => updateConfig('content.pdfKeywords', e.target.value)}
                    placeholder="réunion, compte-rendu, entreprise"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TemplateLayoutForm;
