import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  alpha,
  useTheme,
} from '@mui/material';
import {
  PictureAsPdf as PictureAsPdfIcon,
  Description as DescriptionIcon,
} from '@mui/icons-material';
import { AnimatedDownloadIcon } from './ui/AnimatedIcons';
import SaveValidation from './ui/SaveValidation';
import sounds from '../utils/soundDesign';
import jsPDF from 'jspdf';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
  ImageRun,
  Header,
  AlignmentType,
} from 'docx';
import { saveFileWithDialog, savePDFWithDialog } from '../services/fileSaveUtils';
import { exportToPDFWithTemplate, exportToWordWithTemplate } from '../services/templateExportService';
import { LayoutConfig } from '../types/templateLayout';
import { logger } from '@/utils/logger';

// ============================================================================
// UTILITAIRES WORD
// ============================================================================

// Parse les segments de texte avec mise en forme (gras, italique)
interface TextSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

const parseInlineFormatting = (text: string): TextSegment[] => {
  const segments: TextSegment[] = [];

  // Nettoyer d'abord le texte des caractères problématiques
  const cleanedText = text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width
    .replace(/\u00A0/g, ' ') // nbsp -> espace
    .trim();

  if (!cleanedText) {
    return [{ text: '' }];
  }

  // Approche simple : chercher les patterns ** et * manuellement

  // D'abord, traiter le cas où toute la ligne est en gras
  const fullBoldMatch = cleanedText.match(/^\*\*([^*]+)\*\*$/);
  if (fullBoldMatch) {
    return [{ text: fullBoldMatch[1], bold: true, italic: false }];
  }

  // Cas où toute la ligne est en italique
  const fullItalicMatch = cleanedText.match(/^\*([^*]+)\*$/);
  if (fullItalicMatch) {
    return [{ text: fullItalicMatch[1], bold: false, italic: true }];
  }

  // Cas où toute la ligne est en gras+italique
  const fullBoldItalicMatch = cleanedText.match(/^\*\*\*([^*]+)\*\*\*$/);
  if (fullBoldItalicMatch) {
    return [{ text: fullBoldItalicMatch[1], bold: true, italic: true }];
  }

  // Pour les cas mixtes, utiliser une approche par tokens
  let remaining = cleanedText;
  let currentBold = false;
  let currentItalic = false;

  while (remaining.length > 0) {
    // Chercher le prochain marqueur
    const boldIdx = remaining.indexOf('**');
    const italicIdx = remaining.indexOf('*');

    // Pas de marqueur trouvé
    if (boldIdx === -1 && italicIdx === -1) {
      if (remaining.trim()) {
        segments.push({ text: remaining, bold: currentBold, italic: currentItalic });
      }
      break;
    }

    // Déterminer quel marqueur vient en premier
    let nextMarkerIdx = -1;
    let isBoldMarker = false;

    if (boldIdx !== -1 && (italicIdx === -1 || boldIdx <= italicIdx)) {
      nextMarkerIdx = boldIdx;
      isBoldMarker = true;
    } else if (italicIdx !== -1) {
      if (boldIdx === italicIdx) {
        nextMarkerIdx = boldIdx;
        isBoldMarker = true;
      } else {
        nextMarkerIdx = italicIdx;
        isBoldMarker = false;
      }
    }

    // Ajouter le texte avant le marqueur
    if (nextMarkerIdx > 0) {
      const beforeText = remaining.substring(0, nextMarkerIdx);
      if (beforeText.trim()) {
        segments.push({ text: beforeText, bold: currentBold, italic: currentItalic });
      }
    }

    // Passer le marqueur et basculer l'état
    if (isBoldMarker) {
      remaining = remaining.substring(nextMarkerIdx + 2);
      currentBold = !currentBold;
    } else {
      remaining = remaining.substring(nextMarkerIdx + 1);
      currentItalic = !currentItalic;
    }
  }

  // Si aucun résultat, retourner le texte brut nettoyé
  if (segments.length === 0) {
    const stripped = cleanedText
      .replace(/\*\*\*/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .trim();
    return [{ text: stripped || cleanedText }];
  }

  return segments.filter(seg => seg.text.length > 0);
};

// Nettoyer les balises de code block
const removeCodeFence = (text: string): string => {
  let result = text.trim();
  if (result.startsWith('```')) {
    result = result.replace(/^```[a-zA-Z-]*\n?/, '');
    result = result.replace(/\n?```\s*$/, '');
  }
  return result.trim();
};

// Nettoie les balises HTML (spans colorés, etc.) tout en gardant le contenu
const cleanHtmlTags = (text: string): string => {
  if (!text) return '';
  return text
    // D'abord, convertir les balises HTML de formatage en markdown
    // pour éviter de perdre le formatage
    .replace(/<strong>([^<]*)<\/strong>/gi, '**$1**')
    .replace(/<b>([^<]*)<\/b>/gi, '**$1**')
    .replace(/<em>([^<]*)<\/em>/gi, '*$1*')
    .replace(/<i>([^<]*)<\/i>/gi, '*$1*')
    // Puis supprimer les balises restantes
    .replace(/<span[^>]*>/gi, '')
    .replace(/<\/span>/gi, '')
    .replace(/<u>/gi, '')
    .replace(/<\/u>/gi, '')
    .replace(/<strong>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<em>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/<b>/gi, '')
    .replace(/<\/b>/gi, '')
    .replace(/<i>/gi, '')
    .replace(/<\/i>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ') // Remplacer <br> par un espace
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '') // Nettoie toute autre balise HTML restante
    // Nettoyer les caractères invisibles (zero-width, espaces insécables)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ') // Convertir nbsp en espace normal
    // Nettoyer les backslash d'échappement markdown
    .replace(/\\{2}([*_~`#\[\]()\\.\-!>])/g, '$1')
    .replace(/\\([*_~`#\[\]()\\.\-!>])/g, '$1')
    // Nettoyer le double markdown (****text**** -> **text**)
    .replace(/\*{4,}([^*]+)\*{4,}/g, '**$1**')
    .replace(/\*{3}([^*]+)\*{3}/g, '***$1***')
    // Nettoyer les espaces multiples
    .replace(/\s+/g, ' ')
    .trim();
};

// Parse les segments de texte avec couleurs ET gras pour le PDF
interface FormattedSegment {
  text: string;
  color: [number, number, number] | null;
  bold: boolean;
  italic: boolean;
}

const parseFormattedSegments = (text: string): FormattedSegment[] => {
  // D'abord, extraire les spans colorés
  const colorSpanRegex = /<span\s+style\s*=\s*["']color:\s*(?:rgb\((\d+),\s*(\d+),\s*(\d+)\)|#([0-9a-fA-F]{6})|#([0-9a-fA-F]{3}))["'][^>]*>(.*?)<\/span>/gi;

  let workingText = text;
  const coloredParts: { start: number; end: number; color: [number, number, number]; content: string }[] = [];

  let match;
  while ((match = colorSpanRegex.exec(text)) !== null) {
    let color: [number, number, number];
    if (match[1] && match[2] && match[3]) {
      color = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
    } else if (match[4]) {
      const hex = match[4];
      color = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    } else if (match[5]) {
      const hex = match[5];
      color = [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    } else {
      color = [30, 30, 30];
    }
    coloredParts.push({ start: match.index, end: match.index + match[0].length, color, content: match[6] || '' });
  }

  // Nettoyer le HTML pour le traitement du markdown
  workingText = cleanHtmlTags(text);

  // Parser le markdown pour bold et italic - APPROCHE SIMPLIFIÉE
  const parseMarkdownSegments = (str: string, defaultColor: [number, number, number] | null): FormattedSegment[] => {
    const result: FormattedSegment[] = [];

    // Nettoyer le texte des caractères problématiques
    let cleanStr = str
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();

    if (!cleanStr) {
      return [{ text: '', color: defaultColor, bold: false, italic: false }];
    }

    // Approche simple : chercher les patterns ** et * manuellement
    // Utiliser split pour séparer sur les marqueurs

    // D'abord, traiter le cas où toute la ligne est en gras
    const fullBoldMatch = cleanStr.match(/^\*\*([^*]+)\*\*$/);
    if (fullBoldMatch) {
      return [{ text: fullBoldMatch[1], color: defaultColor, bold: true, italic: false }];
    }

    // Cas où toute la ligne est en italique
    const fullItalicMatch = cleanStr.match(/^\*([^*]+)\*$/);
    if (fullItalicMatch) {
      return [{ text: fullItalicMatch[1], color: defaultColor, bold: false, italic: true }];
    }

    // Cas où toute la ligne est en gras+italique
    const fullBoldItalicMatch = cleanStr.match(/^\*\*\*([^*]+)\*\*\*$/);
    if (fullBoldItalicMatch) {
      return [{ text: fullBoldItalicMatch[1], color: defaultColor, bold: true, italic: true }];
    }

    // Pour les cas mixtes, utiliser une approche par tokens
    // Découper sur les ** et * en gardant les délimiteurs
    let remaining = cleanStr;
    let currentBold = false;
    let currentItalic = false;

    while (remaining.length > 0) {
      // Chercher le prochain marqueur
      const boldIdx = remaining.indexOf('**');
      const italicIdx = remaining.indexOf('*');

      // Pas de marqueur trouvé
      if (boldIdx === -1 && italicIdx === -1) {
        if (remaining.trim()) {
          result.push({ text: remaining, color: defaultColor, bold: currentBold, italic: currentItalic });
        }
        break;
      }

      // Déterminer quel marqueur vient en premier
      let nextMarkerIdx = -1;
      let isBoldMarker = false;

      if (boldIdx !== -1 && (italicIdx === -1 || boldIdx <= italicIdx)) {
        nextMarkerIdx = boldIdx;
        isBoldMarker = true;
      } else if (italicIdx !== -1) {
        // Vérifier si c'est vraiment un * seul ou le début de **
        if (boldIdx === italicIdx) {
          nextMarkerIdx = boldIdx;
          isBoldMarker = true;
        } else {
          nextMarkerIdx = italicIdx;
          isBoldMarker = false;
        }
      }

      // Ajouter le texte avant le marqueur
      if (nextMarkerIdx > 0) {
        const beforeText = remaining.substring(0, nextMarkerIdx);
        if (beforeText.trim()) {
          result.push({ text: beforeText, color: defaultColor, bold: currentBold, italic: currentItalic });
        }
      }

      // Passer le marqueur et basculer l'état
      if (isBoldMarker) {
        remaining = remaining.substring(nextMarkerIdx + 2);
        currentBold = !currentBold;
      } else {
        remaining = remaining.substring(nextMarkerIdx + 1);
        currentItalic = !currentItalic;
      }
    }

    // Si aucun résultat, retourner le texte brut nettoyé
    if (result.length === 0) {
      const stripped = cleanStr
        .replace(/\*\*\*/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      return [{ text: stripped || cleanStr, color: defaultColor, bold: false, italic: false }];
    }

    // Nettoyer les espaces en trop
    return result.map(seg => ({
      ...seg,
      text: seg.text.replace(/\s+/g, ' ')
    })).filter(seg => seg.text.trim().length > 0);
  };

  // Si pas de couleurs, juste parser le markdown
  if (coloredParts.length === 0) {
    return parseMarkdownSegments(workingText, null);
  }

  // Sinon, combiner couleurs et markdown
  // Simplification: on traite le texte nettoyé et on applique les couleurs trouvées
  // Pour l'instant, on parse juste le markdown sur le texte nettoyé
  return parseMarkdownSegments(workingText, null);
};

// Nettoie le texte des marqueurs markdown inline (version simple pour Word)
const cleanForWord = (text: string): string => {
  if (!text) return '';
  return cleanHtmlTags(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // liens
    .replace(/`(.+?)`/g, '$1') // code inline
    .replace(/~~(.+?)~~/g, '$1') // barré
    // Nettoyer le gras et l'italique markdown
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1') // ***bold+italic***
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/_([^_]+)_/g, '$1') // _italic_
    // Nettoyer les backslash d'échappement markdown (inclut le point pour "1\.")
    .replace(/\\([*_~`#\[\]()\\.\-!>])/g, '$1')
    .replace(/\\\\/g, '\\');
};

// Nettoie le texte en supprimant les marqueurs markdown mais garde le texte
const stripMarkdownMarkers = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width
    .replace(/\u00A0/g, ' ') // nbsp
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
};

// ============================================================================
// EXPORT PDF - Avec jsPDF (parsing amélioré)
// ============================================================================

// Wrapping de texte personnalisé qui ne coupe JAMAIS au milieu d'un mot
// Utilise les métriques de la police pour calculer la largeur
const smartWordWrap = (
  pdf: jsPDF,
  text: string,
  maxWidth: number,
  fontSize: number
): string[] => {
  pdf.setFontSize(fontSize);

  // Normaliser les espaces et nettoyer le texte
  const normalizedText = text
    .replace(/\u00A0/g, ' ')  // nbsp -> espace normal
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '') // zero-width chars
    .replace(/\s+/g, ' ')     // multiple espaces -> un seul
    .trim();

  if (!normalizedText) return [];

  // Utiliser splitTextToSize de jsPDF qui est plus fiable
  // Mais avec une marge de sécurité pour éviter les débordements
  const safeMaxWidth = maxWidth - 2; // 2mm de marge de sécurité

  // Découper en mots
  const words = normalizedText.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;

    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = pdf.getTextWidth(testLine);

    if (testWidth <= safeMaxWidth) {
      currentLine = testLine;
    } else {
      // Le mot ne tient pas sur la ligne actuelle
      if (currentLine) {
        lines.push(currentLine);
      }

      // Si le mot seul est plus large que maxWidth, on doit le couper
      const wordWidth = pdf.getTextWidth(word);
      if (wordWidth > safeMaxWidth) {
        // Couper le mot caractère par caractère
        let remaining = word;
        while (remaining) {
          let chunk = '';
          let chunkWidth = 0;
          for (let i = 0; i < remaining.length; i++) {
            const char = remaining[i];
            const newChunkWidth = pdf.getTextWidth(chunk + char);
            if (newChunkWidth > safeMaxWidth && chunk.length > 0) {
              // On a atteint la limite, arrêter ici
              break;
            }
            chunk += char;
            chunkWidth = newChunkWidth;
            if (i === remaining.length - 1) {
              remaining = '';
            }
          }
          if (chunk) {
            lines.push(chunk);
            if (remaining) {
              remaining = remaining.substring(chunk.length);
            }
          } else {
            // Cas d'urgence: un seul caractère est trop large
            lines.push(remaining[0]);
            remaining = remaining.substring(1);
          }
        }
        currentLine = '';
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
};

// Nettoie et normalise le texte markdown avant export
const normalizeMarkdownForExport = (text: string): string[] => {
  // ÉTAPE 1: Nettoyer et normaliser le texte
  let processed = text
    // Normaliser les retours à la ligne (Windows \r\n, Mac ancien \r)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Supprimer les caractères zero-width (mais garder nbsp pour l'instant)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    // Normaliser les caractères de citation unicode vers >
    .replace(/^[\u203A\u2039\u00BB\u00AB\u276F\u276E›‹»«❯❮]\s*/gm, '> ')
    // Normaliser les tirets unicode pour les séparateurs
    .replace(/^[—–]+\s*$/gm, '---')
    // Désescaper le markdown échappé (\\* -> *, \\** -> **)
    .replace(/\\{2}([*_`~#>])/g, '$1')
    .replace(/\\([*_`~#>])/g, '$1')
    // Nettoyer le double markdown (****text**** -> **text**)
    .replace(/\*{4,}([^*]+)\*{4,}/g, '**$1**')
    // Nettoyer les lignes de liste vides (- suivi de rien ou juste espaces/nbsp)
    .replace(/^(\s*[-*])\s*[\u00A0\s]*$/gm, '')
    .replace(/^(\s*\d+\.)\s*[\u00A0\s]*$/gm, '')
    // Supprimer les lignes qui ne contiennent que des espaces (mais pas les lignes de tableau vides)
    .replace(/^(?![\s]*\|)[\s\u00A0]+$/gm, '')
    // Supprimer les lignes vides multiples (garder max 1) - mais pas dans les tableaux
    .replace(/\n{3,}/g, '\n\n');

  // ÉTAPE 2: SUPPRIMER TOUS LES ** DU TEXTE ENTIER (APPROCHE NUCLÉAIRE)
  // Cela va forcer la suppression des marqueurs de gras
  processed = processed.split('**').join('');

  return processed.split('\n');
};

export const exportToPDF = async (
  summaryText: string,
  meetingName: string,
  logoUrl?: string
): Promise<void> => {
  const content = removeCodeFence(summaryText);
  const lines = normalizeMarkdownForExport(content);

  const pdf = new jsPDF('portrait', 'mm', 'a4');

  // Définir les propriétés du document pour le rendre searchable
  pdf.setProperties({
    title: meetingName,
    subject: 'Compte rendu de réunion',
    creator: 'Gilbert - Meeting Summary',
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const marginLeft = 20;
  const marginRight = 20;
  const marginTop = 20;
  const marginBottom = 20;
  const contentW = pageW - marginLeft - marginRight;
  let y = marginTop;

  const TEXT_COLOR: [number, number, number] = [30, 30, 30];
  const GRAY_COLOR: [number, number, number] = [100, 100, 100];
  const BLUE_COLOR: [number, number, number] = [25, 118, 210]; // primary.main (#1976d2)

  // Charger et afficher le logo si disponible
    if (logoUrl) {
      try {
        const baseUrl = window.location.origin;
        const absoluteLogoUrl = logoUrl.startsWith('http') 
          ? logoUrl 
          : logoUrl.startsWith('/') ? `${baseUrl}${logoUrl}` : `${baseUrl}/${logoUrl}`;
        
        const response = await fetch(absoluteLogoUrl);
      if (response.ok) {
        const blob = await response.blob();
        const logoDataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        // Obtenir les dimensions de l'image pour respecter le ratio
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = logoDataUrl;
        });

        // Calculer dimensions en respectant le ratio (max 50mm large, 15mm haut)
        const maxLogoWidth = 50;
        const maxLogoHeight = 15;
        let logoWidth = img.width * 0.264583; // px to mm
        let logoHeight = img.height * 0.264583;

        if (logoWidth > maxLogoWidth) {
          const ratio = maxLogoWidth / logoWidth;
          logoWidth = maxLogoWidth;
          logoHeight = logoHeight * ratio;
        }
        if (logoHeight > maxLogoHeight) {
          const ratio = maxLogoHeight / logoHeight;
          logoHeight = maxLogoHeight;
          logoWidth = logoWidth * ratio;
        }

        // Logo en haut à droite
        pdf.addImage(logoDataUrl, 'PNG', pageW - marginRight - logoWidth, y, logoWidth, logoHeight);
        y += logoHeight + 8;
      }
      } catch (error) {
      logger.warn('Could not load logo for PDF:', error);
    }
  }

  // Espace restant sur la page
  const getAvailableSpace = (): number => pageH - marginBottom - y;

  // Saut de page si besoin
  const checkPageBreak = (neededSpace: number): void => {
    if (y + neededSpace > pageH - marginBottom) {
      pdf.addPage();
      y = marginTop;
    }
  };

  // Calculer la hauteur d'un bloc titre + sous-titres + premier contenu
  const calculateTitleBlockHeight = (startIdx: number): number => {
    let totalHeight = 0;
    let foundContent = false;
    let contentLinesAdded = 0;
    const maxContentLines = 3; // Inclure au moins 3 lignes de contenu après le titre

    for (let j = 0; j < 15 && startIdx + j < lines.length; j++) {
      const checkLine = lines[startIdx + j].trim();

      if (!checkLine) {
        totalHeight += 4; // Ligne vide
      } else if (checkLine.startsWith('# ')) {
        if (foundContent) break; // Un nouveau H1 = nouveau bloc
        totalHeight += 18; // H1
      } else if (checkLine.startsWith('## ')) {
        if (foundContent) break; // Un nouveau H2 après contenu = nouveau bloc
        totalHeight += 14; // H2
      } else if (checkLine.startsWith('### ') && !checkLine.startsWith('#### ')) {
        if (foundContent) break;
        totalHeight += 12; // H3
      } else if (checkLine.startsWith('#### ') || checkLine.startsWith('##### ') || checkLine.startsWith('###### ')) {
        if (foundContent) break;
        totalHeight += 10; // H4-H6
      } else if (checkLine.startsWith('> ')) {
        // Citation - calcul approximatif
        totalHeight += 15;
        foundContent = true;
        contentLinesAdded++;
        if (contentLinesAdded >= maxContentLines) break;
      } else if (/^\s*[-*] .+$/.test(checkLine) || /^\s*\d+\. .+$/.test(checkLine)) {
        // Liste à puces ou numérotée - inclure les premiers items
        totalHeight += 8;
        foundContent = true;
        contentLinesAdded++;
        if (contentLinesAdded >= maxContentLines) break;
    } else {
        // Paragraphe normal
        totalHeight += 12;
        foundContent = true;
        contentLinesAdded++;
        if (contentLinesAdded >= maxContentLines) break;
      }
    }

    // Minimum de 40mm pour un bloc titre + contenu
    return Math.max(totalHeight, 40);
  };

  // Vérifier si on a assez d'espace pour un titre + ses sous-titres + contenu
  const ensureSpaceForTitleBlock = (currentIdx: number, titleHeight: number): void => {
    const blockHeight = calculateTitleBlockHeight(currentIdx);
    const totalNeeded = Math.max(titleHeight + 50, blockHeight);
    if (getAvailableSpace() < totalNeeded) {
      pdf.addPage();
      y = marginTop;
    }
  };

  // Vérifier espace pour un élément simple
  const ensureSpace = (neededSpace: number): void => {
    if (getAvailableSpace() < neededSpace) {
      pdf.addPage();
      y = marginTop;
    }
  };

  // Pré-calculer la hauteur d'un groupe de lignes consécutives (pour les listes)
  const calculateGroupHeight = (startIdx: number, linesToCheck: number): number => {
    let totalHeight = 0;
    for (let j = 0; j < linesToCheck && startIdx + j < lines.length; j++) {
      const checkLine = lines[startIdx + j].trim();
      if (!checkLine) {
        totalHeight += 4;
      } else if (/^[-*] .+$/.test(checkLine) || /^\d+\. .+$/.test(checkLine)) {
        totalHeight += getTextHeight(checkLine, contentW - 12, 10) + 3;
      } else {
        break; // Fin du groupe de liste
      }
    }
    return totalHeight;
  };

  // Calculer la hauteur d'un texte wrappé
  const getTextHeight = (text: string, maxWidth: number, fontSize: number): number => {
    pdf.setFontSize(fontSize);
    const cleanText = cleanHtmlTags(text)
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1');
    const textLines = pdf.splitTextToSize(cleanText, maxWidth);
    return textLines.length * (fontSize * 0.5);
  };

  // Dessiner du texte avec gestion bold/italic/couleurs et wrapping correct
  const drawFormattedText = (
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number,
    baseStyle: 'normal' | 'bold' | 'italic' = 'normal',
    defaultColor: [number, number, number] = TEXT_COLOR
  ): number => {
    pdf.setFontSize(fontSize);
    const lineSpacing = fontSize * 0.45;
    const safeMaxWidth = maxWidth - 2; // Marge de sécurité

    // Parser les segments formatés (bold, italic, couleurs)
    const segments = parseFormattedSegments(text);

    // Créer des "tokens" avec leur style pour un wrapping intelligent
    interface Token {
      text: string;
      bold: boolean;
      italic: boolean;
      color: [number, number, number] | null;
    }

    // Découper chaque segment en mots tout en préservant le style
    const tokens: Token[] = [];
    for (const seg of segments) {
      const words = seg.text.split(/(\s+)/); // Garder les espaces comme tokens séparés
      for (const word of words) {
        if (word) {
          tokens.push({
            text: word,
            bold: seg.bold,
            italic: seg.italic,
            color: seg.color
          });
        }
      }
    }

    // Calculer la largeur d'un token avec son style
    // Combiner correctement baseStyle et les styles du token
    const computeFontStyle = (token: Token): 'normal' | 'bold' | 'italic' | 'bolditalic' => {
      const isBold = baseStyle === 'bold' || baseStyle === 'bolditalic' || token.bold;
      const isItalic = baseStyle === 'italic' || baseStyle === 'bolditalic' || token.italic;
      if (isBold && isItalic) return 'bolditalic';
      if (isBold) return 'bold';
      if (isItalic) return 'italic';
      return 'normal';
    };

    const getTokenWidth = (token: Token): number => {
      const fontStyle = computeFontStyle(token);
      pdf.setFont('helvetica', fontStyle);
      return pdf.getTextWidth(token.text);
    };

    // Construire les lignes en tenant compte des styles
    const lines: Token[][] = [];
    let currentLine: Token[] = [];
    let currentLineWidth = 0;

    for (const token of tokens) {
      const tokenWidth = getTokenWidth(token);

      // Si c'est juste un espace et qu'on est en début de ligne, ignorer
      if (token.text.trim() === '' && currentLine.length === 0) {
        continue;
      }

      // Si le token tient sur la ligne actuelle
      if (currentLineWidth + tokenWidth <= safeMaxWidth) {
        currentLine.push(token);
        currentLineWidth += tokenWidth;
      } else {
        // Le token ne tient pas
        if (currentLine.length > 0) {
          // Sauvegarder la ligne actuelle
          lines.push(currentLine);
          currentLine = [];
          currentLineWidth = 0;
        }

        // Si le token est un espace, l'ignorer en début de nouvelle ligne
        if (token.text.trim() === '') {
          continue;
        }

        // Si le token seul est plus large que la ligne, le couper
        if (tokenWidth > safeMaxWidth) {
          let remaining = token.text;
          while (remaining.length > 0) {
            let chunk = '';
            let chunkWidth = 0;
            pdf.setFont('helvetica', token.bold ? 'bold' : 'normal');

            for (let i = 0; i < remaining.length; i++) {
              const testChunk = chunk + remaining[i];
              const testWidth = pdf.getTextWidth(testChunk);
              if (testWidth > safeMaxWidth && chunk.length > 0) {
                break;
              }
              chunk = testChunk;
              chunkWidth = testWidth;
            }

            if (chunk.length > 0) {
              lines.push([{ ...token, text: chunk }]);
              remaining = remaining.substring(chunk.length);
            } else {
              // Cas d'urgence
              lines.push([{ ...token, text: remaining[0] }]);
              remaining = remaining.substring(1);
            }
          }
        } else {
          currentLine.push(token);
          currentLineWidth = tokenWidth;
        }
      }
    }

    // Ajouter la dernière ligne
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    // Dessiner les lignes
    let currentY = startY;

    for (const lineTokens of lines) {
      checkPageBreak(lineSpacing);

      let lineX = x;
      for (const token of lineTokens) {
        // Utiliser computeFontStyle pour combiner baseStyle et token styles
        const fontStyle = computeFontStyle(token);

        pdf.setFont('helvetica', fontStyle);
        pdf.setTextColor(
          token.color ? token.color[0] : defaultColor[0],
          token.color ? token.color[1] : defaultColor[1],
          token.color ? token.color[2] : defaultColor[2]
        );

        pdf.text(token.text, lineX, currentY);
        lineX += pdf.getTextWidth(token.text);
      }

      currentY += lineSpacing;
    }

    return currentY;
  };

  // Dessiner texte simple avec wrapping (pour listes) - utilise la même logique que drawFormattedText
  const drawSimpleText = (
    text: string,
    x: number,
    startY: number,
    maxWidth: number,
    fontSize: number,
    _indent: number = 0,
    defaultColor: [number, number, number] = TEXT_COLOR
  ): number => {
    // Réutiliser drawFormattedText qui gère correctement le wrapping avec les styles
    return drawFormattedText(text, x, startY, maxWidth, fontSize, 'normal', defaultColor);
  };

  // Ignorer les lignes avant le premier H1 (souvent le nom de l'échange ajouté par le backend)
  let pdfStartIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('# ')) {
      pdfStartIndex = i;
      break;
    }
  }

  // === PRÉTRAITEMENT : Nettoyer TOUS les marqueurs ** des lignes ===
  // APPROCHE NUCLÉAIRE : supprimer TOUS les ** et marquer comme gras si présents
  interface ProcessedLine {
    text: string;
    isBold: boolean;
    original: string;
  }

  const processedLines: ProcessedLine[] = [];
  let inMultiLineBold = false;
  let multiLineBoldBuffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let trimmed = line.trim();

    // Nettoyer les caractères invisibles
    trimmed = trimmed.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // DÉTECTION AGRESSIVE : vérifier si ** est présent N'IMPORTE OÙ dans la ligne
    const containsDoubleStar = trimmed.indexOf('**') !== -1;

    // Vérifier si commence par ** (en utilisant indexOf au lieu de character check)
    const startsWithDoubleStar = trimmed.indexOf('**') === 0;
    const endsWithDoubleStar = trimmed.length >= 2 && trimmed.substring(trimmed.length - 2) === '**';

    // Cas 1: Ligne entièrement en gras sur une seule ligne **texte**
    if (startsWithDoubleStar && endsWithDoubleStar && trimmed.length > 4) {
      // Supprimer ** au début et à la fin
      let cleanText = trimmed.substring(2, trimmed.length - 2);
      // Supprimer aussi tout ** résiduel à l'intérieur
      cleanText = cleanText.split('**').join('');
      processedLines.push({ text: cleanText, isBold: true, original: line });
      continue;
    }

    // Cas 2: Début de bloc gras multi-ligne (commence par ** mais ne finit pas par **)
    if (startsWithDoubleStar && !endsWithDoubleStar) {
      inMultiLineBold = true;
      let cleanStart = trimmed.substring(2);
      cleanStart = cleanStart.split('**').join(''); // Nettoyer tout ** résiduel
      multiLineBoldBuffer = [cleanStart];
      continue;
    }

    // Cas 3: On est dans un bloc gras multi-ligne
    if (inMultiLineBold) {
      if (endsWithDoubleStar) {
        // Fin du bloc
        let cleanEnd = trimmed.substring(0, trimmed.length - 2);
        cleanEnd = cleanEnd.split('**').join(''); // Nettoyer tout ** résiduel
        multiLineBoldBuffer.push(cleanEnd);
        const fullText = multiLineBoldBuffer.join(' ');
        processedLines.push({ text: fullText, isBold: true, original: line });
        inMultiLineBold = false;
        multiLineBoldBuffer = [];
      } else {
        // Ligne intermédiaire - nettoyer tout ** résiduel
        let cleanMiddle = trimmed.split('**').join('');
        multiLineBoldBuffer.push(cleanMiddle);
      }
      continue;
    }

    // Cas 4: Ligne normale
    let cleanedText = trimmed;
    let isBold = false;

    // Si la ligne contient **, la nettoyer et marquer comme partiellement gras
    if (containsDoubleStar) {
      // Supprimer TOUS les ** de la ligne
      cleanedText = trimmed.split('**').join('');
      // Si la ligne commençait par ** ou finissait par **, c'est une ligne gras
      if (startsWithDoubleStar || endsWithDoubleStar) {
        isBold = true;
      }
    }

    processedLines.push({ text: cleanedText, isBold, original: line });
  }

  // === FIN DU PRÉTRAITEMENT ===

  for (let i = pdfStartIndex; i < processedLines.length; i++) {
    const processed = processedLines[i];
    const line = processed.original;
    let trimmedLine = processed.text;

    // Si la ligne est marquée comme gras, la rendre en gras
    if (processed.isBold && trimmedLine.trim()) {
      checkPageBreak(15);
      y = drawFormattedText(trimmedLine, marginLeft, y, contentW, 10, 'bold', TEXT_COLOR);
      y += 2;
      continue;
    }

    // Ligne vide = espacement
    if (!trimmedLine) {
      y += 4;
          continue;
        }

    // Ignorer les lignes qui sont juste des marqueurs de liste sans contenu réel
    // Inclut: "- ", "* ", "-", "*", "- \n", espaces insécables, etc.
    // Nettoyage agressif pour détecter les listes vides
    const contentAfterMarker = trimmedLine
      .replace(/^[-*]\s*/, '')  // Enlever le marqueur de puce
      .replace(/^\d+\.\s*/, '') // Enlever le marqueur numéroté
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '') // Enlever espaces insécables et zero-width
      .replace(/<[^>]*>/g, '')  // Enlever les balises HTML
      .trim();

    if (/^[-*]\s*/.test(trimmedLine) && !contentAfterMarker) {
      continue; // Liste à puce vide
    }
    if (/^\d+\.\s*/.test(trimmedLine) && !contentAfterMarker) {
      continue; // Liste numérotée vide
    }

    // Séparateur horizontal (toute la largeur)
    if (/^[-*_]{3,}$/.test(trimmedLine)) {
      checkPageBreak(10);
      y += 4;
      pdf.setDrawColor(180, 180, 180);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, y, pageW - marginRight, y);
      y += 5;
      continue;
    }

    // H1 - Titre principal en bleu (plus grand: 18pt)
    if (trimmedLine.startsWith('# ')) {
      const text = trimmedLine.slice(2);
      const titleHeight = getTextHeight(text, contentW, 18) + 14;
      // S'assurer qu'on a assez d'espace pour le titre + sous-titres + contenu
      ensureSpaceForTitleBlock(i, titleHeight);
      y += 8;
      y = drawFormattedText(text, marginLeft, y, contentW, 18, 'bold', BLUE_COLOR);
      // Ligne sous le titre en bleu (toute la largeur)
      pdf.setDrawColor(BLUE_COLOR[0], BLUE_COLOR[1], BLUE_COLOR[2]);
      pdf.setLineWidth(0.5);
      pdf.line(marginLeft, y + 1, pageW - marginRight, y + 1);
      y += 8;
      continue;
    }

    // H2 - Sous-titre en bleu (plus grand: 14pt)
    if (trimmedLine.startsWith('## ')) {
      const text = trimmedLine.slice(3);
      const titleHeight = getTextHeight(text, contentW - 3, 14) + 10;
      // S'assurer qu'on a assez d'espace pour le titre + sous-titres + contenu
      ensureSpaceForTitleBlock(i, titleHeight);
      y += 7;
      // Barre verticale très fine en bleu (0.5mm)
      pdf.setFillColor(BLUE_COLOR[0], BLUE_COLOR[1], BLUE_COLOR[2]);
      pdf.rect(marginLeft, y - 4, 0.5, 6, 'F');
      y = drawFormattedText(text, marginLeft + 3, y, contentW - 3, 14, 'bold', BLUE_COLOR);
      y += 6;
      continue;
    }

    // H3 - Titre tertiaire en bleu (plus grand: 12pt)
    if (trimmedLine.startsWith('### ') && !trimmedLine.startsWith('#### ')) {
      const text = trimmedLine.slice(4);
      const titleHeight = getTextHeight(text, contentW, 12) + 8;
      // S'assurer qu'on a assez d'espace pour le titre + contenu
      ensureSpaceForTitleBlock(i, titleHeight);
      y += 6;
      y = drawFormattedText(text, marginLeft, y, contentW, 12, 'bold', BLUE_COLOR);
      y += 5;
      continue;
    }

    // H4, H5, H6 - Traités comme du texte en gras (pas de style titre)
    // Utiliser une regex plus robuste pour détecter les titres H4+
    const pdfH4Match = trimmedLine.match(/^(#{4,6})\s+(.+)$/);
    if (pdfH4Match) {
      const hashCount = pdfH4Match[1].length;
      const text = pdfH4Match[2];
      const titleHeight = getTextHeight(text, contentW, 10) + 8;
      // S'assurer que le titre reste avec son contenu (pas de saut de page entre titre et contenu)
      ensureSpaceForTitleBlock(i, titleHeight);
      y += 3;
      y = drawFormattedText(text, marginLeft, y, contentW, 10, 'bold', TEXT_COLOR);
      y += 4;
      continue;
    }

    // Citation - regrouper les lignes consécutives qui commencent par >
    // Détection robuste avec regex pour gérer différents encodages de >
    const pdfQuoteRegex = /^[>\u003E\u203A\u00BB\u276F›»❯]\s*/;
    const isQuoteLine = (ln: string): boolean => {
      const t = ln.trim();
      return pdfQuoteRegex.test(t);
    };
    const extractQuoteContent = (ln: string): string => {
      const t = ln.trim();
      return t.replace(pdfQuoteRegex, '').trim();
    };

    if (isQuoteLine(trimmedLine)) {
      // Collecter toutes les lignes de citation consécutives
      const quoteLines: string[] = [];
      let quoteIdx = i;
      while (quoteIdx < lines.length) {
        const quoteLine = lines[quoteIdx].trim();
        if (isQuoteLine(quoteLine)) {
          quoteLines.push(extractQuoteContent(quoteLine));
          quoteIdx++;
        } else if (quoteLine === '' && quoteIdx < lines.length - 1 && isQuoteLine(lines[quoteIdx + 1].trim())) {
          // Ligne vide entre deux citations - continuer
          quoteLines.push('');
          quoteIdx++;
        } else {
          break;
        }
      }
      // Avancer l'index principal
      i = quoteIdx - 1;

      // Filtrer les lignes vides au début et à la fin
      while (quoteLines.length > 0 && !quoteLines[0].trim()) quoteLines.shift();
      while (quoteLines.length > 0 && !quoteLines[quoteLines.length - 1].trim()) quoteLines.pop();

      // Si aucun contenu valide, passer
      if (quoteLines.length === 0 || quoteLines.every(ql => !ql.trim())) {
        continue;
      }

      // Nettoyer et joindre les lignes
      const fullQuoteText = quoteLines.join('\n');

      // Calculer la hauteur nécessaire
      pdf.setFontSize(10);
      const cleanQuoteText = stripMarkdownMarkers(fullQuoteText);
      const wrappedQuoteLines = pdf.splitTextToSize(cleanQuoteText, contentW - 8);
      const blockHeight = wrappedQuoteLines.length * 4.5 + 4;

      checkPageBreak(blockHeight + 5);

      // Fond gris léger
      pdf.setFillColor(248, 248, 250);
      pdf.rect(marginLeft, y - 1, contentW, blockHeight, 'F');
      // Barre gauche très fine (0.5mm)
      pdf.setFillColor(GRAY_COLOR[0], GRAY_COLOR[1], GRAY_COLOR[2]);
      pdf.rect(marginLeft, y - 1, 0.5, blockHeight, 'F');

      // Dessiner le texte avec formatage (gras/italique) en couleur grise et style italique par défaut
      y = drawFormattedText(fullQuoteText, marginLeft + 4, y + 2, contentW - 8, 10, 'italic', GRAY_COLOR);
      y += 4;
      continue;
    }

    // Liste à puces - avec support des sous-listes (indentation)
    // Détecter l'indentation dans la ligne originale
    const bulletIndentMatch = line.match(/^(\s*)([-*]) (.+)$/);
    if (bulletIndentMatch) {
      const indent = bulletIndentMatch[1].length; // Nombre d'espaces d'indentation
      const rawContent = bulletIndentMatch[3];
      const cleanedContent = cleanHtmlTags(rawContent).trim();

      if (cleanedContent && cleanedContent.length > 0) {
        // Calculer le niveau d'indentation (0 = liste principale, 1+ = sous-liste)
        const indentLevel = Math.floor(indent / 2); // 2 espaces = 1 niveau
        const indentOffset = indentLevel * 6; // 6mm par niveau d'indentation

        // Calculer la hauteur de cet item
        const itemHeight = getTextHeight(rawContent, contentW - 12 - indentOffset, 10) + 2;

        // Si c'est le premier item d'une liste (ligne précédente n'était pas une puce)
        const prevLine = i > 0 ? lines[i - 1] : '';
        const isFirstBullet = !/^\s*[-*] .+$/.test(prevLine);

        if (isFirstBullet) {
          // Calculer la hauteur des 3 premiers items de la liste
          const groupHeight = calculateGroupHeight(i, 3);
          // S'assurer qu'on peut afficher au moins les premiers items
          ensureSpace(Math.max(groupHeight, itemHeight + 20));
        } else {
          // Pour les items suivants, juste s'assurer que l'item tient
          ensureSpace(itemHeight + 4);
        }

        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);

        // Puce - différent symbole pour sous-listes
        pdf.setFont('helvetica', 'normal');
        const bulletChar = indentLevel === 0 ? '•' : '-'; // Puce pleine ou tiret pour sous-listes
        pdf.text(bulletChar, marginLeft + 2 + indentOffset, y);

        // Texte avec wrapping - toutes les lignes alignées après la puce
        y = drawSimpleText(rawContent, marginLeft + 8 + indentOffset, y, contentW - 12 - indentOffset, 10, 0, TEXT_COLOR);
        y += 3;
        continue;
      }
    }

    // Liste numérotée - avec support des sous-listes (indentation)
    const numIndentMatch = line.match(/^(\s*)(\d+)\. (.+)$/);
    if (numIndentMatch) {
      const indent = numIndentMatch[1].length; // Nombre d'espaces d'indentation
      const num = numIndentMatch[2];
      const rawContent = numIndentMatch[3];
      const cleanedContent = cleanHtmlTags(rawContent).trim();

      if (cleanedContent && cleanedContent.length > 0) {
        // Calculer le niveau d'indentation (0 = liste principale, 1+ = sous-liste)
        const indentLevel = Math.floor(indent / 2); // 2 espaces = 1 niveau
        const indentOffset = indentLevel * 6; // 6mm par niveau d'indentation

        // Calculer la hauteur de cet item
        const itemHeight = getTextHeight(rawContent, contentW - 12 - indentOffset, 10) + 3;

        // Vérifier si cet item numéroté est suivi de sous-points (puces ou autre contenu)
        // Si oui, on doit garder l'item avec ses premiers sous-points
        // On regarde au-delà des lignes vides pour trouver le vrai contenu suivant
        let nextNonEmptyLinePdf = '';
        for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
          const checkLine = lines[j].trim();
          if (checkLine) {
            nextNonEmptyLinePdf = checkLine;
            break;
          }
        }
        const isFollowedByBullets = /^\s*[-*] .+$/.test(nextNonEmptyLinePdf);
        const isFollowedByContent = nextNonEmptyLinePdf && !nextNonEmptyLinePdf.startsWith('#') && !/^\d+\. .+$/.test(nextNonEmptyLinePdf);

        if (isFollowedByBullets || isFollowedByContent) {
          // Cet item numéroté est un "titre de section" suivi de contenu
          // Calculer la hauteur du bloc (item + premiers sous-points)
          let blockHeight = itemHeight;
          for (let j = 1; j <= 4 && i + j < lines.length; j++) {
            const checkLine = lines[i + j].trim();
            if (!checkLine) {
              blockHeight += 4;
            } else if (/^\s*[-*] .+$/.test(checkLine)) {
              blockHeight += 8; // Sous-point à puce
            } else if (/^\s*\d+\. .+$/.test(checkLine)) {
              break; // Nouvel item numéroté = fin du bloc
            } else if (checkLine.startsWith('#')) {
              break; // Titre = fin du bloc
    } else {
              blockHeight += 10; // Autre contenu
              break;
            }
          }
          ensureSpace(Math.max(blockHeight, itemHeight + 35));
      } else {
          // Item numéroté normal (pas suivi de sous-points)
          const prevLine = i > 0 ? lines[i - 1] : '';
          const isFirstNum = !/^\s*\d+\. .+$/.test(prevLine);

          if (isFirstNum) {
            const groupHeight = calculateGroupHeight(i, 3);
            ensureSpace(Math.max(groupHeight, itemHeight + 20));
          } else {
            ensureSpace(itemHeight + 5);
          }
        }

        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_COLOR[0], TEXT_COLOR[1], TEXT_COLOR[2]);

        // Numéro
        pdf.setFont('helvetica', 'normal');
        pdf.text(`${num}.`, marginLeft + 1 + indentOffset, y);

        // Texte avec wrapping - toutes les lignes alignées après le numéro
        y = drawSimpleText(rawContent, marginLeft + 8 + indentOffset, y, contentW - 12 - indentOffset, 10, 0, TEXT_COLOR);
        y += 3;
        continue;
      }
    }

    // Tableau avec gestion du retour à la ligne
    // Détecter les tableaux markdown: ligne qui contient | et commence/finit par | ou contient au moins 2 |
    const isTableLine = (line: string): boolean => {
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return false;
      // Soit la ligne commence et finit par |
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) return true;
      // Soit la ligne contient au moins 2 | (pour les tableaux sans | au début/fin)
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      return pipeCount >= 2;
    };

    // Ligne de séparation du tableau (contient uniquement |, -, :, et espaces)
    const isTableSeparator = (line: string): boolean => {
      const trimmed = line.trim();
      return /^[\|\s\-:]+$/.test(trimmed) && trimmed.includes('|') && trimmed.includes('-');
    };

    if (isTableLine(trimmedLine)) {
      const tableLines: string[] = [trimmedLine];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (isTableLine(nextLine) || isTableSeparator(nextLine)) {
          i++;
          tableLines.push(nextLine);
        } else {
          break;
        }
      }

      // Parser les lignes du tableau
      const rows: string[][] = [];
      tableLines.forEach((tl, idx) => {
        // Ignorer la ligne de séparation (---|----|---)
        if (isTableSeparator(tl)) return;

        // Nettoyer et parser les cellules
        let cleanedLine = tl.trim();
        // Retirer les | de début et de fin si présents
        if (cleanedLine.startsWith('|')) cleanedLine = cleanedLine.slice(1);
        if (cleanedLine.endsWith('|')) cleanedLine = cleanedLine.slice(0, -1);

        const cells = cleanedLine.split('|').map(c => {
          let cellText = c.trim();
          // Nettoyer le HTML et le markdown
          cellText = cleanHtmlTags(cellText);
          // Nettoyer le gras et l'italique mais garder le texte
          cellText = cellText.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
          cellText = cellText.replace(/\*\*(.+?)\*\*/g, '$1');
          cellText = cellText.replace(/\*(.+?)\*/g, '$1');
          cellText = cellText.replace(/_(.+?)_/g, '$1');
          return cellText;
        });

        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          rows.push(cells);
        }
      });

      if (rows.length > 0) {
        const colCount = Math.max(...rows.map(r => r.length));
        // S'assurer que chaque ligne a le même nombre de colonnes
        rows.forEach(row => {
          while (row.length < colCount) {
            row.push('');
          }
        });

        const colW = contentW / colCount;
        const cellPadding = 2;
        const cellTextWidth = colW - (cellPadding * 2) - 1; // -1 pour éviter les débordements
        const lineHeight = 3.5;
        const minCellH = 6;

        pdf.setFontSize(8);

        // Calculer la hauteur de chaque ligne en fonction du texte wrappé
        const rowHeights: number[] = rows.map((row) => {
          let maxLines = 1;
          row.forEach((cell) => {
            if (cell) {
              const wrappedLines = pdf.splitTextToSize(cell, cellTextWidth);
              if (wrappedLines.length > maxLines) {
                maxLines = wrappedLines.length;
              }
            }
          });
          return Math.max(minCellH, maxLines * lineHeight + 3);
        });

        // Vérifier l'espace total nécessaire
        const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
        checkPageBreak(totalHeight + 10);

        rows.forEach((row, ri) => {
          const isHeader = ri === 0;
          const rowY = y;
          const rowH = rowHeights[ri];

          // Fond de la ligne
          if (isHeader) {
            pdf.setFillColor(BLUE_COLOR[0], BLUE_COLOR[1], BLUE_COLOR[2]);
          } else {
            pdf.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
          }
          pdf.rect(marginLeft, rowY, contentW, rowH, 'F');

          // Bordures des cellules
          pdf.setDrawColor(200, 200, 200);
          pdf.setLineWidth(0.1);
          pdf.rect(marginLeft, rowY, contentW, rowH, 'S');

          // Lignes verticales entre colonnes
          for (let ci = 1; ci < colCount; ci++) {
            pdf.line(marginLeft + ci * colW, rowY, marginLeft + ci * colW, rowY + rowH);
          }

          // Texte de chaque cellule avec retour à la ligne
          row.forEach((cell, ci) => {
            if (!cell) return;

            pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
            pdf.setFontSize(8);
            pdf.setTextColor(isHeader ? 255 : 40, isHeader ? 255 : 40, isHeader ? 255 : 40);

            const wrappedLines = pdf.splitTextToSize(cell, cellTextWidth);
            wrappedLines.forEach((line: string, li: number) => {
              pdf.text(line, marginLeft + ci * colW + cellPadding, rowY + 3.5 + (li * lineHeight));
            });
          });

          y += rowH;
        });
        y += 6;
      }
      continue;
    }

    // Paragraphe normal
    checkPageBreak(8);
    y = drawFormattedText(trimmedLine, marginLeft, y, contentW, 10, 'normal');
    y += 4;
  }

  // Numéros de page
  const totalPages = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`${p} / ${totalPages}`, pageW / 2, pageH - 10, { align: 'center' });
  }

  const safeName = meetingName.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s]/gi, '').replace(/\s+/g, '_').substring(0, 50);
  await savePDFWithDialog(pdf, `${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
};

// ============================================================================
// EXPORT WORD - Approche docx (avec logo dans header)
// ============================================================================

// Helper pour obtenir les dimensions d'une image depuis ArrayBuffer
const getImageDimensions = (arrayBuffer: ArrayBuffer): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    const blob = new Blob([arrayBuffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 200, height: 60 }); // Dimensions par défaut
    };
    img.src = url;
  });
};

export const exportToWord = async (
  summaryText: string,
  meetingName: string,
  _meetingDate: string,
  logoUrl?: string
): Promise<void> => {
  const content = removeCodeFence(summaryText);
  const lines = normalizeMarkdownForExport(content);

  const children: (Paragraph | Table)[] = [];
  let h1Count = 0;

  // Couleurs cohérentes avec le PDF
  const BLUE_COLOR = '1976D2';
  const TEXT_COLOR = '1E1E1E';

  // Charger le logo si disponible
  let logoImageData: ArrayBuffer | null = null;
  let logoDimensions = { width: 200, height: 60 };
  if (logoUrl) {
    try {
      const baseUrl = window.location.origin;
      const absoluteLogoUrl = logoUrl.startsWith('http')
        ? logoUrl
        : logoUrl.startsWith('/') ? `${baseUrl}${logoUrl}` : `${baseUrl}/${logoUrl}`;

      const response = await fetch(absoluteLogoUrl);
      if (response.ok) {
        logoImageData = await response.arrayBuffer();
        // Obtenir les vraies dimensions pour respecter le ratio
        logoDimensions = await getImageDimensions(logoImageData);
      }
    } catch (error) {
      logger.warn('Could not load logo:', error);
    }
  }

  // Calculer les dimensions du logo en respectant le ratio (max 180px de large, 60px de haut)
  const maxLogoWidth = 180;
  const maxLogoHeight = 60;
  let logoWidth = logoDimensions.width;
  let logoHeight = logoDimensions.height;

  if (logoWidth > maxLogoWidth) {
    const ratio = maxLogoWidth / logoWidth;
    logoWidth = maxLogoWidth;
    logoHeight = logoHeight * ratio;
  }
  if (logoHeight > maxLogoHeight) {
    const ratio = maxLogoHeight / logoHeight;
    logoHeight = maxLogoHeight;
    logoWidth = logoWidth * ratio;
  }

  // Helper pour créer des TextRuns avec formatage (gras, italique)
  const createTextRuns = (text: string, baseSize: number = 22, baseColor: string = TEXT_COLOR): TextRun[] => {
    const cleanedText = cleanForWord(text);
    const segments = parseInlineFormatting(cleanedText);
    return segments.map(seg => new TextRun({
      text: seg.text,
      bold: seg.bold,
      italics: seg.italic,
      size: baseSize,
      font: 'Calibri',
      color: baseColor,
    }));
  };

  // Pas de titre hardcodé - le H1 du markdown sera le titre principal
  // Ignorer les lignes avant le premier H1 (souvent le nom de l'échange ajouté par le backend)
  let startIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('# ')) {
      startIndex = i;
      break;
    }
  }

  for (let i = startIndex; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Ligne vide - ignorer si après un titre (pour éviter les sauts de page)
    if (!line) {
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      // Si la ligne précédente était un titre, on saute la ligne vide (l'espacement est géré par le titre)
      if (prevLine.startsWith('#')) {
        continue;
      }
      // Sinon, ajouter un espacement normal
      children.push(new Paragraph({ spacing: { after: 80 } }));
      continue;
    }

    // Ignorer les lignes qui sont juste des marqueurs de liste sans contenu réel
    // Nettoyage agressif pour détecter les listes vides (espaces insécables, zero-width, HTML)
    const wordContentAfterMarker = line
      .replace(/^[-*]\s*/, '')  // Enlever le marqueur de puce
      .replace(/^\d+\.\s*/, '') // Enlever le marqueur numéroté
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '') // Enlever espaces insécables et zero-width
      .replace(/<[^>]*>/g, '')  // Enlever les balises HTML
      .trim();

    if (/^[-*]\s*/.test(line) && !wordContentAfterMarker) {
      continue; // Liste à puce vide
    }
    if (/^\d+\.\s*/.test(line) && !wordContentAfterMarker) {
      continue; // Liste numérotée vide
    }

    // Séparateur horizontal (---, ***, ___)
    if (/^[-*_]{3,}$/.test(line)) {
      children.push(
        new Paragraph({
          border: { bottom: { color: 'CCCCCC', size: 2, style: BorderStyle.SINGLE, space: 1 } },
          spacing: { before: 120, after: 120 },
        })
      );
      continue;
    }

    // H1 (# Titre) - Titre principal en bleu avec ligne en dessous
    // Saut de page avant chaque H1 sauf le premier (comme le PDF)
    if (line.startsWith('# ')) {
      const text = cleanForWord(line.slice(2)).replace(/\*+/g, '');
      h1Count++;
      children.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 36, font: 'Calibri', color: BLUE_COLOR })],
          spacing: { before: h1Count === 1 ? 0 : 100, after: 160 },
          border: { bottom: { color: BLUE_COLOR, size: 8, style: BorderStyle.SINGLE, space: 4 } },
          pageBreakBefore: h1Count > 1,
          keepNext: true,
          keepLines: true,
          widowControl: true,
        })
      );
      continue;
    }

    // H2 (## Titre) - Sous-titre en bleu
    if (line.startsWith('## ')) {
      const text = cleanForWord(line.slice(3)).replace(/\*+/g, '');
      const prevLineH2 = i > 0 ? lines[i - 1].trim() : '';
      const afterTitleH2 = prevLineH2.startsWith('#') || !prevLineH2;
      children.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 28, font: 'Calibri', color: BLUE_COLOR })],
          spacing: { before: afterTitleH2 ? 100 : 240, after: 120 },
          keepNext: true,
          keepLines: true,
          widowControl: true,
        })
      );
      continue;
    }

    // H3 (### Titre) - Titre tertiaire en bleu
    if (line.startsWith('### ') && !line.startsWith('#### ')) {
      const text = cleanForWord(line.slice(4)).replace(/\*+/g, '');
      const prevLineH3 = i > 0 ? lines[i - 1].trim() : '';
      const afterTitleH3 = prevLineH3.startsWith('#') || !prevLineH3;
      children.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: 24, font: 'Calibri', color: BLUE_COLOR })],
          spacing: { before: afterTitleH3 ? 80 : 200, after: 100 },
          keepNext: true,
          keepLines: true,
          widowControl: true,
        })
      );
      continue;
    }

    // H4, H5, H6 - Texte en gras normal (pas de couleur spéciale, comme le PDF)
    // Utiliser une regex plus robuste pour détecter les titres H4+
    const h4Match = line.match(/^(#{4,6})\s+(.+)$/);
    if (h4Match) {
      const hashCount = h4Match[1].length;
      const titleContent = h4Match[2];
      const text = cleanForWord(titleContent).replace(/\*+/g, '');
      const prevLineH4 = i > 0 ? lines[i - 1].trim() : '';
      const afterTitleH4 = prevLineH4.startsWith('#') || !prevLineH4;

      // Taille de police selon le niveau de titre
      const fontSize = hashCount === 4 ? 22 : hashCount === 5 ? 20 : 18;

      children.push(
        new Paragraph({
          children: [new TextRun({ text, bold: true, size: fontSize, font: 'Calibri', color: TEXT_COLOR })],
          spacing: { before: afterTitleH4 ? 60 : 160, after: 80 },
          keepNext: true,
          keepLines: true,
          widowControl: true,
        })
      );
      continue;
    }

    // Citation (> texte) - regrouper les lignes consécutives
    // Détection robuste avec regex pour gérer différents encodages de >
    const quoteRegex = /^[>\u003E\u203A\u00BB\u276F›»❯]\s*/;
    const isWordQuoteLine = (ln: string): boolean => {
      const t = ln.trim();
      return quoteRegex.test(t);
    };
    const extractWordQuoteContent = (ln: string): string => {
      const t = ln.trim();
      return t.replace(quoteRegex, '').trim();
    };

    if (isWordQuoteLine(line)) {
      // Collecter toutes les lignes de citation consécutives
      const quoteLines: string[] = [];
      let quoteIdx = i;
      while (quoteIdx < lines.length) {
        const quoteLine = lines[quoteIdx].trim();
        if (isWordQuoteLine(quoteLine)) {
          const quoteContent = extractWordQuoteContent(quoteLine);
          quoteLines.push(quoteContent);
          quoteIdx++;
        } else if (quoteLine === '' && quoteIdx < lines.length - 1 && isWordQuoteLine(lines[quoteIdx + 1].trim())) {
          // Ligne vide entre deux citations - ajouter un saut de ligne
          quoteLines.push('');
          quoteIdx++;
        } else {
          break;
        }
      }

      // Vérifier si la ligne suivante est un auteur (pattern: (Nom), — Nom, - Nom)
      // même si elle ne commence pas par >
      if (quoteIdx < lines.length) {
        const nextLine = lines[quoteIdx].trim();
        const authorPattern = /^[\(\—\-–]\s*[A-ZÀ-Ü][a-zà-ü]*(?:\s+[A-ZÀ-Ü]\.?)?[\)\.]?$/;
        const authorPattern2 = /^—\s*.+$/; // Tiret cadratin suivi de texte
        if (authorPattern.test(nextLine) || authorPattern2.test(nextLine)) {
          quoteLines.push(nextLine);
          quoteIdx++;
        }
      }

      // Avancer l'index principal
      i = quoteIdx - 1;

      // Filtrer les lignes vides au début et à la fin
      while (quoteLines.length > 0 && !quoteLines[0].trim()) quoteLines.shift();
      while (quoteLines.length > 0 && !quoteLines[quoteLines.length - 1].trim()) quoteLines.pop();

      // Si aucune ligne de citation valide, passer
      if (quoteLines.length === 0 || quoteLines.every(ql => !ql.trim())) {
        continue;
      }

      // Vérifier si suivi de contenu pour garder ensemble
      let nextNonEmptyQuote = '';
      for (let j = quoteIdx; j < lines.length && j <= quoteIdx + 2; j++) {
        const checkLine = lines[j].trim();
        if (checkLine) {
          nextNonEmptyQuote = checkLine;
          break;
        }
      }
      const quoteKeepNext = Boolean(nextNonEmptyQuote && !nextNonEmptyQuote.startsWith('#'));

      // Créer un paragraphe pour chaque ligne de citation
      for (let qi = 0; qi < quoteLines.length; qi++) {
        const quoteLine = quoteLines[qi];
        if (quoteLine === '') {
          // Ligne vide dans la citation
          children.push(new Paragraph({ spacing: { after: 40 } }));
        } else {
          // Nettoyer le HTML d'abord
          const cleanedQuote = cleanHtmlTags(quoteLine).trim();

          // Vérifier que le texte n'est pas vide après nettoyage
          if (!cleanedQuote) {
            continue;
          }

          // Utiliser parseInlineFormatting pour parser le markdown (gras/italique)
          const segments = parseInlineFormatting(cleanedQuote);

          // Créer les TextRuns avec le formatage approprié
          // Base en italique, avec gras si spécifié dans le segment
          const quoteRuns = segments.map(seg => new TextRun({
            text: seg.text,
            italics: true, // Toujours italique dans une citation
            bold: seg.bold, // Gras si le segment est marqué bold
            size: 22,
            color: '555555',
            font: 'Calibri',
          }));

          // Vérifier qu'on a au moins un run avec du texte
          if (quoteRuns.length === 0 || quoteRuns.every(r => !(r as any).text)) {
            continue;
          }

          children.push(
            new Paragraph({
              children: quoteRuns,
              spacing: { before: qi === 0 ? 100 : 40, after: qi === quoteLines.length - 1 ? 100 : 40 },
              indent: { left: 400 },
              // Pas de shading pour éviter les zones grises vides
              keepLines: true,
              keepNext: qi < quoteLines.length - 1 || quoteKeepNext,
            })
          );
        }
      }
      continue;
    }

    // Item de liste à puces - avec support des sous-listes (indentation)
    const wordBulletMatch = rawLine.match(/^(\s*)([-*]) (.+)$/);
    if (wordBulletMatch) {
      const bulletIndent = wordBulletMatch[1].length;
      const itemText = wordBulletMatch[3];

      // Vérifier que le contenu n'est pas vide après nettoyage
      const cleanedItemText = cleanForWord(itemText).trim();
      if (!cleanedItemText) continue;

      const textRuns = createTextRuns(itemText);

      const indentLevel = Math.floor(bulletIndent / 2);
      const indentTwips = convertInchesToTwip(0.25) + (indentLevel * convertInchesToTwip(0.25));
      const bulletChar = indentLevel === 0 ? '•' : '-';

      // Vérifier si suivi d'autres puces ou contenu (pour garder ensemble)
      let nextNonEmptyBullet = '';
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        const checkLine = lines[j].trim();
        if (checkLine) {
          nextNonEmptyBullet = checkLine;
          break;
        }
      }
      // Garder avec le suivant si c'est une autre puce ou du contenu (pas un titre)
      const bulletKeepNext = Boolean(nextNonEmptyBullet && !nextNonEmptyBullet.startsWith('#'));

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${bulletChar}  `, size: 22, font: 'Calibri' }),
            ...textRuns,
          ],
          indent: { left: indentTwips, hanging: convertInchesToTwip(0.15) },
          spacing: { after: 80 },
          keepLines: true,
          keepNext: bulletKeepNext,
        })
      );
      continue;
    }

    // Item de liste numérotée - avec support des sous-listes (indentation)
    const wordNumMatch = rawLine.match(/^(\s*)(\d+)\. (.+)$/);
    if (wordNumMatch) {
      const indent = wordNumMatch[1].length;
      const num = wordNumMatch[2];
      const itemText = wordNumMatch[3];

      // Vérifier que le contenu n'est pas vide après nettoyage
      const cleanedItemText = cleanForWord(itemText).trim();
      if (!cleanedItemText) continue;

      const textRuns = createTextRuns(itemText);

      const indentLevel = Math.floor(indent / 2);
      const indentTwips = convertInchesToTwip(0.25) + (indentLevel * convertInchesToTwip(0.25));

      // Vérifier si cet item est suivi de sous-points (puces) ou contenu pour garder ensemble
      // On regarde au-delà des lignes vides pour trouver le vrai contenu suivant
      let nextNonEmptyLine = '';
      for (let j = i + 1; j < lines.length && j <= i + 3; j++) {
        const checkLine = lines[j].trim();
        if (checkLine) {
          nextNonEmptyLine = checkLine;
          break;
        }
      }
      const isFollowedByBulletsWord = /^\s*[-*] .+$/.test(nextNonEmptyLine);
      // Est suivi de contenu si: pas un titre (#), pas un autre item numéroté, et pas vide
      const isFollowedByContentWord = Boolean(nextNonEmptyLine && !nextNonEmptyLine.startsWith('#') && !/^\d+\. .+$/.test(nextNonEmptyLine));

      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${num}.  `, size: 22, font: 'Calibri' }),
            ...textRuns,
          ],
          indent: { left: indentTwips, hanging: convertInchesToTwip(0.15) },
          spacing: { after: 80 },
          keepLines: true,
          keepNext: isFollowedByBulletsWord || isFollowedByContentWord, // Garder avec le contenu suivant
        })
      );
      continue;
    }

    // Tableau (|col1|col2|) - Détection améliorée
    // Détecter les tableaux markdown: ligne qui contient | et commence/finit par | ou contient au moins 2 |
    const isWordTableLine = (ln: string): boolean => {
      const trimmed = ln.trim();
      if (!trimmed.includes('|')) return false;
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) return true;
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      return pipeCount >= 2;
    };

    const isWordTableSeparator = (ln: string): boolean => {
      const trimmed = ln.trim();
      return /^[\|\s\-:]+$/.test(trimmed) && trimmed.includes('|') && trimmed.includes('-');
    };

    if (isWordTableLine(line)) {
      const tableLines: string[] = [line];
      while (i + 1 < lines.length) {
        const nextLine = lines[i + 1].trim();
        if (isWordTableLine(nextLine) || isWordTableSeparator(nextLine)) {
          i++;
          tableLines.push(nextLine);
        } else {
          break;
        }
      }

      const rows: string[][] = [];
      tableLines.forEach((tl) => {
        // Ignorer la ligne de séparation
        if (isWordTableSeparator(tl)) return;

        // Nettoyer et parser les cellules
        let cleanedLine = tl.trim();
        if (cleanedLine.startsWith('|')) cleanedLine = cleanedLine.slice(1);
        if (cleanedLine.endsWith('|')) cleanedLine = cleanedLine.slice(0, -1);

        const cells = cleanedLine.split('|').map(c => {
          let cellText = c.trim();
          cellText = cleanForWord(cellText);
          // Nettoyer le gras et l'italique
          cellText = cellText.replace(/\*\*\*(.+?)\*\*\*/g, '$1');
          cellText = cellText.replace(/\*\*(.+?)\*\*/g, '$1');
          cellText = cellText.replace(/\*(.+?)\*/g, '$1');
          cellText = cellText.replace(/_(.+?)_/g, '$1');
          return cellText;
        });

        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          rows.push(cells);
        }
      });

      if (rows.length > 0) {
        // S'assurer que chaque ligne a le même nombre de colonnes
        const colCount = Math.max(...rows.map(r => r.length));
        rows.forEach(row => {
          while (row.length < colCount) {
            row.push('');
          }
        });

        const tableRows = rows.map((row, ri) => {
          const isHeader = ri === 0;
          return new TableRow({
            tableHeader: isHeader, // Répéter l'en-tête sur chaque page
            cantSplit: true, // Ne pas couper la ligne
            children: row.map(cell =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({
                      text: cell || '',
                      bold: isHeader,
                      color: isHeader ? 'FFFFFF' : '333333',
                      size: 20,
                      font: 'Calibri',
                    })],
                  }),
                ],
                shading: isHeader
                  ? { fill: '1976D2', type: ShadingType.SOLID, color: '1976D2' }
                  : ri % 2 === 0
                  ? { fill: 'F8F8F8', type: ShadingType.SOLID, color: 'F8F8F8' }
                  : undefined,
                margins: { top: 50, bottom: 50, left: 80, right: 80 },
              })
            ),
          });
        });

        children.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        children.push(new Paragraph({ spacing: { after: 80 } }));
      }
      continue;
    }

    // Texte normal (paragraphe) - avec formatage préservé
    const textRuns = createTextRuns(line);

    // Vérifier si suivi de contenu (pour garder ensemble, sauf si suivi d'un titre)
    let nextNonEmptyPara = '';
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      const checkLine = lines[j].trim();
      if (checkLine) {
        nextNonEmptyPara = checkLine;
        break;
      }
    }
    // Garder avec le suivant si ce n'est pas un titre (# ou numéroté comme "1.")
    const paraKeepNext = Boolean(nextNonEmptyPara && !nextNonEmptyPara.startsWith('#') && !/^\d+\.\s/.test(nextNonEmptyPara));

    children.push(
      new Paragraph({
        children: textRuns,
        spacing: { after: 100 },
        keepLines: true,
        widowControl: true,
        keepNext: paraKeepNext,
      })
    );
  }

  // Créer le header avec le logo si disponible
  const headerChildren: Paragraph[] = [];
  if (logoImageData) {
    headerChildren.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoImageData,
            transformation: {
              width: logoWidth,
              height: logoHeight,
            },
            type: 'png',
          }),
        ],
        alignment: AlignmentType.RIGHT,
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(logoImageData ? 1.2 : 0.8), // Plus d'espace en haut si logo
            bottom: convertInchesToTwip(0.8),
            left: convertInchesToTwip(0.8),
            right: convertInchesToTwip(0.8),
          },
        },
      },
      headers: logoImageData ? {
        default: new Header({
          children: headerChildren,
        }),
      } : undefined,
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = meetingName.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s]/gi, '').replace(/\s+/g, '_').substring(0, 50);
  await saveFileWithDialog(blob, `${safeName}_${new Date().toISOString().slice(0, 10)}.docx`, 'docx');
};

// ============================================================================
// COMPOSANT
// ============================================================================

interface SummaryExportButtonProps {
  summaryText: string | null;
  meetingId: string | null;
  meetingName: string;
  meetingDate: string;
  logoUrl?: string;
  layoutConfig?: LayoutConfig | any; // Can be old or new format
  participants?: string[];
  duration?: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const SummaryExportButton: React.FC<SummaryExportButtonProps> = ({
  summaryText,
  meetingId: _meetingId, // Kept for API compatibility, no longer used
  meetingName,
  meetingDate,
  logoUrl,
  layoutConfig,
  participants,
  duration,
  onSuccess,
  onError
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const handleExport = async (format: 'pdf' | 'word') => {
    // Prevent double-click race condition
    if (loading) return;

    if (!summaryText?.trim()) {
      onError('Le compte rendu est vide');
      return;
    }

    setLoading(format);
    setAnchorEl(null);

    try {
      // Use summaryText directly - no need for API call
      const text = removeCodeFence(summaryText);

      if (!text.trim()) {
        onError('Le compte rendu est vide');
        return;
      }

      if (format === 'pdf') {
        // Utiliser l'export avec template si un layoutConfig est fourni
        if (layoutConfig) {
          await exportToPDFWithTemplate({
            summaryText: text,
            meetingName,
            meetingDate,
            participants,
            duration,
            logoUrl,
            layoutConfig,
          });
        } else {
          await exportToPDF(text, meetingName, logoUrl);
        }
        setShowValidation(true);
        onSuccess('PDF exporté avec succès');
      } else {
        // Utiliser l'export avec template si un layoutConfig est fourni
        if (layoutConfig) {
          await exportToWordWithTemplate({
            summaryText: text,
            meetingName,
            meetingDate,
            participants,
            duration,
            logoUrl,
            layoutConfig,
          });
        } else {
          await exportToWord(text, meetingName, meetingDate, logoUrl);
        }
        setShowValidation(true);
        onSuccess('Document Word exporté avec succès');
      }
    } catch (error) {
      // Ne pas afficher d'erreur si l'utilisateur a annulé
      if ((error as Error).message === 'Sauvegarde annulée') {
        logger.debug('Export annulé par l\'utilisateur');
      } else {
        logger.error('Export error:', error);
        onError('Erreur lors de l\'export');
      }
    } finally {
      setLoading(null);
    }
  };

  if (!summaryText?.trim()) return null;

  return (
    <>
      <SaveValidation show={showValidation} onComplete={() => setShowValidation(false)} />
      <Button
        variant="outlined"
        size="small"
        onClick={(e) => { sounds.click(); setAnchorEl(e.currentTarget); }}
        startIcon={<AnimatedDownloadIcon size={16} />}
        disableElevation
          sx={{ 
          borderRadius: '10px',
          borderColor: alpha(theme.palette.divider, 0.8),
          color: 'text.secondary',
          fontWeight: 500,
          textTransform: 'none',
          px: 2,
          py: 0.75,
          transition: 'all 0.2s ease',
            '&:hover': {
            borderColor: 'primary.main',
            color: 'primary.main',
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            boxShadow: '0 2px 8px rgba(59, 130, 246, 0.15)',
            },
          }}
        >
        Exporter
      </Button>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        sx={{ 
          '& .MuiPaper-root': { 
            borderRadius: '10px',
            mt: 1,
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
          } 
        }}
      >
        <MenuItem 
          onClick={() => handleExport('pdf')}
          disabled={loading !== null}
          sx={{ 
            borderRadius: 1,
            mx: 0.5,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
          }}
        >
          <ListItemIcon>
            {loading === 'pdf' ? <CircularProgress size={20} /> : <PictureAsPdfIcon sx={{ color: '#e53935' }} />}
          </ListItemIcon>
          <ListItemText primary="Exporter en PDF" />
        </MenuItem>
        <MenuItem 
          onClick={() => handleExport('word')}
          disabled={loading !== null}
          sx={{ 
            borderRadius: 1,
            mx: 0.5,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.08) },
          }}
        >
          <ListItemIcon>
            {loading === 'word' ? <CircularProgress size={20} /> : <DescriptionIcon sx={{ color: '#1565c0' }} />}
          </ListItemIcon>
          <ListItemText primary="Exporter en Word" />
        </MenuItem>
      </Menu>
    </>
  );
};

export default SummaryExportButton;
