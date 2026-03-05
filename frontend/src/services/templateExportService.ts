/**
 * Service d'export PDF/Word avec support complet des templates
 * VERSION RECONSTRUITE - Export Word avec footer correct
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  ImageRun,
  convertInchesToTwip,
  BorderStyle,
  SectionType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx';
import { LayoutConfig, defaultLayoutConfig, migrateLayoutConfig } from '../types/templateLayout';
import { saveFileWithDialog, savePDFWithDialog } from './fileSaveUtils';
import { logger } from '@/utils/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ExportOptions {
  summaryText: string;
  meetingName: string;
  meetingDate: string;
  participants?: string[];
  duration?: string;
  logoUrl?: string;
  layoutConfig?: any;
}

// ============================================================================
// CACHE DU LOGO - Pour éviter les rechargements à chaque export
// ============================================================================

interface CachedLogo {
  data: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
  timestamp: number;
}

const logoCache: Map<string, CachedLogo> = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCachedLogo(url: string): CachedLogo | null {
  const cached = logoCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('[Export] ✅ Logo trouvé dans le cache');
    return cached;
  }
  if (cached) {
    logoCache.delete(url);
  }
  return null;
}

function setCachedLogo(url: string, logo: CachedLogo): void {
  logoCache.set(url, { ...logo, timestamp: Date.now() });
  logger.debug('[Export] 💾 Logo mis en cache');
}

// ============================================================================
// HELPERS
// ============================================================================

interface LoadedImage {
  data: string;
  format: 'PNG' | 'JPEG';
  width: number;
  height: number;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
}

/**
 * Charge une image depuis une URL avec cache
 */
async function loadLogo(url: string): Promise<LoadedImage | null> {
  if (!url) return null;

  // Vérifier le cache
  const cached = getCachedLogo(url);
  if (cached) {
    return {
      data: cached.data,
      format: cached.format,
      width: cached.width,
      height: cached.height,
      blob: cached.blob,
      arrayBuffer: cached.arrayBuffer,
    };
  }

  try {
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'https://gilbert-assistant.ovh';
    let fullUrl: string;

    if (url.startsWith('data:image/')) {
      // Déjà en base64
      const format = url.includes('image/png') ? 'PNG' : 'JPEG';
      const blob = await (await fetch(url)).blob();
      const arrayBuffer = await blob.arrayBuffer();
      const dims = await getImageDimensions(url);

      const result = { data: url, format: format as 'PNG' | 'JPEG', width: dims.width, height: dims.height, blob, arrayBuffer };
      setCachedLogo(url, { ...result, timestamp: Date.now() });
      return result;
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      fullUrl = url;
    } else if (url.startsWith('/')) {
      fullUrl = `${apiBase}${url}`;
    } else {
      fullUrl = `${apiBase}/${url}`;
    }

    logger.debug('[Export] Chargement logo:', fullUrl);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(fullUrl, {
      signal: controller.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('[Export] Échec chargement logo:', response.status);
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const format: 'PNG' | 'JPEG' = contentType.includes('png') ? 'PNG' : 'JPEG';
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Obtenir dimensions
    const imgUrl = URL.createObjectURL(blob);
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(imgUrl);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(imgUrl);
        resolve({ width: 200, height: 60 });
      };
      img.src = imgUrl;
    });

    // Convertir en base64 pour le cache
    const data = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });

    const result = { data, format, width: dims.width, height: dims.height, blob, arrayBuffer };
    setCachedLogo(url, { ...result, timestamp: Date.now() });

    logger.debug('[Export] Logo chargé:', dims.width, 'x', dims.height);
    return result;
  } catch (error) {
    logger.warn('[Export] Erreur chargement logo:', error);
    return null;
  }
}

function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 100, height: 50 });
    img.src = src;
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function formatDate(dateStr: string, format: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear().toString();
  const monthNames = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  switch (format) {
    case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD MMMM YYYY': return `${day} ${monthNames[date.getMonth()]} ${year}`;
    default: return `${day}/${month}/${year}`;
  }
}

function getTitleFontSize(titleSize: string, level: 1 | 2 | 3): number {
  const sizes: Record<string, Record<number, number>> = {
    small: { 1: 16, 2: 14, 3: 12 },
    medium: { 1: 20, 2: 16, 3: 14 },
    large: { 1: 24, 2: 20, 3: 16 },
  };
  return sizes[titleSize]?.[level] || sizes.medium[level];
}

function getLineHeightFactor(lineSpacing: string): number {
  switch (lineSpacing) {
    case 'single': return 1.2;
    case '1.5': return 1.5;
    case 'double': return 2.0;
    default: return 1.2;
  }
}

/**
 * Convertit le style de séparateur en BorderStyle pour docx
 */
function getSeparatorBorderStyle(style: string): BorderStyle {
  switch (style) {
    case 'double-line': return BorderStyle.DOUBLE;
    case 'dotted': return BorderStyle.DOTTED;
    case 'line':
    default: return BorderStyle.SINGLE;
  }
}

/**
 * Dessine un séparateur PDF selon le style configuré
 */
function drawPdfSeparator(
  doc: jsPDF,
  style: string,
  x1: number,
  y: number,
  x2: number
): void {
  doc.setDrawColor(180, 180, 180);

  switch (style) {
    case 'double-line':
      doc.setLineWidth(0.3);
      doc.line(x1, y, x2, y);
      doc.line(x1, y + 1.5, x2, y + 1.5);
      break;
    case 'dotted':
      doc.setLineWidth(0.5);
      // Dessiner une ligne pointillée
      const dashLength = 2;
      const gapLength = 2;
      let currentX = x1;
      while (currentX < x2) {
        const endX = Math.min(currentX + dashLength, x2);
        doc.line(currentX, y, endX, y);
        currentX = endX + gapLength;
      }
      break;
    case 'line':
    default:
      doc.setLineWidth(0.3);
      doc.line(x1, y, x2, y);
      break;
  }
}

// ============================================================================
// HELPERS POUR TABLEAUX MARKDOWN
// ============================================================================

/**
 * Détecter si une ligne est une ligne de tableau markdown
 */
function isTableLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (trimmed.startsWith('|') && trimmed.endsWith('|')) return true;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 2;
}

/**
 * Détecter si une ligne est un séparateur de tableau (---|---|---)
 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  return /^[\|\s\-:]+$/.test(trimmed) && trimmed.includes('|') && trimmed.includes('-');
}

/**
 * Nettoyer le texte d'une cellule de tableau
 */
function cleanTableCell(text: string): string {
  return text
    .trim()
    .replace(/<[^>]+>/g, '') // Enlever les balises HTML
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();
}

/**
 * Parser les lignes d'un tableau markdown
 */
function parseTableRows(tableLines: string[]): string[][] {
  const rows: string[][] = [];

  for (const tl of tableLines) {
    if (isTableSeparator(tl)) continue;

    let cleanedLine = tl.trim();
    if (cleanedLine.startsWith('|')) cleanedLine = cleanedLine.slice(1);
    if (cleanedLine.endsWith('|')) cleanedLine = cleanedLine.slice(0, -1);

    const cells = cleanedLine.split('|').map(cleanTableCell);
    if (cells.length > 0 && cells.some(c => c.length > 0)) {
      rows.push(cells);
    }
  }

  // S'assurer que chaque ligne a le même nombre de colonnes
  if (rows.length > 0) {
    const colCount = Math.max(...rows.map(r => r.length));
    rows.forEach(row => {
      while (row.length < colCount) row.push('');
    });
  }

  return rows;
}

// ============================================================================
// EXPORT PDF
// ============================================================================

export async function exportToPDFWithTemplate(options: ExportOptions): Promise<void> {
  const { summaryText, meetingName, meetingDate, participants, duration, logoUrl } = options;

  const config: LayoutConfig = options.layoutConfig
    ? migrateLayoutConfig(options.layoutConfig)
    : defaultLayoutConfig;

  logger.debug('[PDF Export] Début -', meetingName);

  const orientation = config.page.orientation === 'landscape' ? 'l' : 'p';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: config.page.format.toLowerCase() as 'a4' | 'letter' | 'legal',
  });

  const margins = config.page.margins;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margins.left - margins.right;

  const primaryColor = hexToRgb(config.style.primaryColor);
  const secondaryColor = hexToRgb(config.style.secondaryColor);
  const textColor = hexToRgb(config.style.textColor);

  // Charger le logo
  const logoSrc = logoUrl || config.header.logoUrl;
  const logoData = logoSrc ? await loadLogo(logoSrc) : null;
  let logoDimensions = { width: 0, height: 0 };

  if (logoData) {
    const maxLogoWidth = 60;
    const maxLogoHeight = config.header.logoMaxHeight || 20;
    const aspectRatio = logoData.width / logoData.height;

    let w = maxLogoHeight * aspectRatio;
    let h = maxLogoHeight;
    if (w > maxLogoWidth) {
      w = maxLogoWidth;
      h = maxLogoWidth / aspectRatio;
    }
    logoDimensions = { width: w, height: h };
  }

  const fontSize = config.style.fontSize;
  const lineHeight = fontSize * getLineHeightFactor(config.style.lineSpacing) * 0.4;
  const footerHeight = 20;
  const maxY = pageHeight - margins.bottom - footerHeight;

  const calculateHeaderHeight = (pageNum: number): number => {
    let height = 10;
    if (logoData && (pageNum === 1 || config.header.repeatLogoOnAllPages)) {
      height += logoDimensions.height + 5;
    }
    if (config.header.showCompanyName && config.header.companyName) height += 7;
    if (config.header.headerText) height += 6;
    if (config.header.showHeaderSeparator && config.header.headerSeparatorStyle !== 'none') height += 5;
    return height + 5;
  };

  const drawHeader = (pageNum: number) => {
    let headerY = 10;

    if (logoData && (pageNum === 1 || config.header.repeatLogoOnAllPages)) {
      let logoX = margins.left;
      if (config.header.logoPosition === 'center') logoX = (pageWidth - logoDimensions.width) / 2;
      else if (config.header.logoPosition === 'right') logoX = pageWidth - margins.right - logoDimensions.width;

      try {
        doc.addImage(logoData.data, logoData.format, logoX, headerY, logoDimensions.width, logoDimensions.height);
        headerY += logoDimensions.height + 5;
      } catch (err) {
        logger.error('[PDF Export] Erreur logo:', err);
      }
    }

    if (config.header.showCompanyName && config.header.companyName) {
      doc.setFontSize(11);
      doc.setTextColor(80, 80, 80);
      doc.setFont('helvetica', 'bold');
      doc.text(config.header.companyName, pageWidth / 2, headerY, { align: 'center' });
      headerY += 6;
    }

    if (config.header.headerText) {
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(config.header.headerText, pageWidth / 2, headerY, { align: 'center' });
      headerY += 5;
    }

    if (config.header.showHeaderSeparator && config.header.headerSeparatorStyle !== 'none') {
      headerY += 2;
      drawPdfSeparator(doc, config.header.headerSeparatorStyle, margins.left, headerY, pageWidth - margins.right);
    }
  };

  const drawFooter = (pageNum: number, totalPages: number) => {
    const footerY = pageHeight - 12;

    // Séparateur selon le style configuré
    if (config.footer.showFooterSeparator && config.footer.footerSeparatorStyle !== 'none') {
      drawPdfSeparator(doc, config.footer.footerSeparatorStyle, margins.left, footerY - 6, pageWidth - margins.right);
    }

    // Texte footer
    if (config.footer.footerText) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(config.footer.footerText, pageWidth / 2, footerY - 2, { align: 'center' });
    }

    // Contact
    if (config.footer.showContactInfo && config.footer.contactInfo) {
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(config.footer.contactInfo, pageWidth / 2, footerY + 2, { align: 'center' });
    }

    // Numéros de page
    if (config.footer.showPageNumbers) {
      const pageText = config.footer.pageNumberFormat
        .replace('{n}', pageNum.toString())
        .replace('{total}', totalPages.toString());

      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);

      const pos = config.footer.pageNumberPosition;
      let numX = pageWidth / 2;
      let numAlign: 'left' | 'center' | 'right' = 'center';

      if (pos.includes('left')) { numX = margins.left; numAlign = 'left'; }
      else if (pos.includes('right')) { numX = pageWidth - margins.right; numAlign = 'right'; }

      doc.text(pageText, numX, footerY + 5, { align: numAlign });
    }
  };

  // Contenu — pas de bloc titre (Compte rendu / Date / Durée) en PDF, comme en Word
  let y = calculateHeaderHeight(1);

  // Helper pour dessiner du texte avec markdown inline (bold/italic) et wrapping correct
  const drawMarkdownText = (text: string, startX: number, startY: number, maxWidth: number, baseSize: number, baseColor: {r: number, g: number, b: number}): number => {
    const safeMaxWidth = maxWidth - 2; // Marge de sécurité

    // Nettoyer le texte
    const cleanText = text
      .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
      .replace(/\u00A0/g, ' ');

    // Parser le markdown avec une approche par regex
    interface Segment {
      text: string;
      bold: boolean;
      italic: boolean;
    }

    const patterns = [
      { regex: /\*\*\*([^*]+)\*\*\*/g, bold: true, italic: true },
      { regex: /\*\*([^*]+)\*\*/g, bold: true, italic: false },
      { regex: /\*([^*]+)\*/g, bold: false, italic: true },
      { regex: /_([^_]+)_/g, bold: false, italic: true },
    ];

    interface Match {
      start: number;
      end: number;
      text: string;
      bold: boolean;
      italic: boolean;
    }

    const allMatches: Match[] = [];
    for (const pattern of patterns) {
      let match;
      const regex = new RegExp(pattern.regex.source, 'g');
      while ((match = regex.exec(cleanText)) !== null) {
        const overlaps = allMatches.some(m =>
          (match!.index >= m.start && match!.index < m.end) ||
          (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end)
        );
        if (!overlaps) {
          allMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[1],
            bold: pattern.bold,
            italic: pattern.italic,
          });
        }
      }
    }
    allMatches.sort((a, b) => a.start - b.start);

    // Construire les segments
    const segments: Segment[] = [];
    let pos = 0;
    for (const match of allMatches) {
      if (match.start > pos) {
        segments.push({ text: cleanText.slice(pos, match.start), bold: false, italic: false });
      }
      segments.push({ text: match.text, bold: match.bold, italic: match.italic });
      pos = match.end;
    }
    if (pos < cleanText.length) {
      segments.push({ text: cleanText.slice(pos), bold: false, italic: false });
    }
    if (segments.length === 0 && cleanText) {
      segments.push({ text: cleanText, bold: false, italic: false });
    }

    // Créer des tokens avec leur style pour un wrapping intelligent
    interface Token {
      text: string;
      bold: boolean;
      italic: boolean;
    }

    const tokens: Token[] = [];
    for (const seg of segments) {
      const words = seg.text.split(/(\s+)/);
      for (const word of words) {
        if (word) {
          tokens.push({ text: word, bold: seg.bold, italic: seg.italic });
        }
      }
    }

    // Calculer la largeur d'un token
    const getTokenWidth = (token: Token): number => {
      if (token.bold && token.italic) doc.setFont('helvetica', 'bolditalic');
      else if (token.bold) doc.setFont('helvetica', 'bold');
      else if (token.italic) doc.setFont('helvetica', 'italic');
      else doc.setFont('helvetica', 'normal');
      return doc.getTextWidth(token.text);
    };

    // Construire les lignes
    const tokenLines: Token[][] = [];
    let currentLine: Token[] = [];
    let currentLineWidth = 0;

    doc.setFontSize(baseSize);

    for (const token of tokens) {
      const tokenWidth = getTokenWidth(token);
      if (token.text.trim() === '' && currentLine.length === 0) continue;

      if (currentLineWidth + tokenWidth <= safeMaxWidth) {
        currentLine.push(token);
        currentLineWidth += tokenWidth;
      } else {
        if (currentLine.length > 0) {
          tokenLines.push(currentLine);
          currentLine = [];
          currentLineWidth = 0;
        }
        if (token.text.trim() === '') continue;

        if (tokenWidth > safeMaxWidth) {
          // Couper le mot
          let remaining = token.text;
          while (remaining.length > 0) {
            let chunk = '';
            if (token.bold) doc.setFont('helvetica', 'bold');
            else doc.setFont('helvetica', 'normal');
            for (let i = 0; i < remaining.length; i++) {
              const testChunk = chunk + remaining[i];
              if (doc.getTextWidth(testChunk) > safeMaxWidth && chunk.length > 0) break;
              chunk = testChunk;
            }
            if (chunk.length > 0) {
              tokenLines.push([{ ...token, text: chunk }]);
              remaining = remaining.substring(chunk.length);
            } else {
              tokenLines.push([{ ...token, text: remaining[0] }]);
              remaining = remaining.substring(1);
            }
          }
        } else {
          currentLine.push(token);
          currentLineWidth = tokenWidth;
        }
      }
    }
    if (currentLine.length > 0) tokenLines.push(currentLine);

    // Interligne proportionnelle à la taille de police (évite le chevauchement des titres)
    const effectiveLineHeight = baseSize * getLineHeightFactor(config.style.lineSpacing) * 0.45;

    // Dessiner les lignes
    let currentY = startY;
    for (const lineTokens of tokenLines) {
      if (currentY > maxY) {
        doc.addPage();
        currentY = calculateHeaderHeight(doc.getNumberOfPages());
      }

      let lineX = startX;
      for (const token of lineTokens) {
        if (token.bold && token.italic) doc.setFont('helvetica', 'bolditalic');
        else if (token.bold) doc.setFont('helvetica', 'bold');
        else if (token.italic) doc.setFont('helvetica', 'italic');
        else doc.setFont('helvetica', 'normal');

        doc.setTextColor(baseColor.r, baseColor.g, baseColor.b);
        doc.text(token.text, lineX, currentY);
        lineX += doc.getTextWidth(token.text);
      }
      currentY += effectiveLineHeight;
    }

    doc.setFont('helvetica', 'normal');
    return currentY;
  };

  // Markdown - PRÉTRAITEMENT: ne pas supprimer * et ** pour que drawMarkdownText puisse rendre italique/gras
  const cleanedSummaryText = summaryText
    // Supprimer les backslashes d'échappement (ex: 2\. → 2.)
    .replace(/\\([.,:;!?()[\]{}])/g, '$1')
    // IMPORTANT: Supprimer les lignes qui ne contiennent que des bullets/tirets (très large)
    .replace(/^[\s\u00A0]*[\-\*•●○◦‣⁃·▪▫►▸‐–—\u2022\u2023\u2043]+[\s\u00A0]*$/gm, '')
    // Supprimer les lignes qui ne contiennent que des espaces/nbsp
    .replace(/^[\s\u00A0]+$/gm, '')
    // Nettoyer les lignes vides multiples
    .replace(/\n{3,}/g, '\n\n')
    // Supprimer les lignes vides à la fin
    .replace(/\n+$/, '');

  // Filtrer les lignes une deuxième fois pour être sûr
  const lines = cleanedSummaryText.split('\n').filter(line => {
    const trimmed = line.trim().replace(/\u00A0/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    // Rejeter les lignes vides
    if (trimmed === '') return false;
    // Rejeter les lignes qui ne sont que des bullets ou caractères de ponctuation/liste
    // Liste très complète de caractères à rejeter seuls
    if (/^[\s\-\*•●○◦‣⁃·▪▫►▸‐–—\u2022\u2023\u2043\u25CF\u25CB\u25E6\u00B7]+$/.test(trimmed)) return false;
    return true;
  });

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const trimmed = line.trim();

    if (y > maxY) {
      doc.addPage();
      y = calculateHeaderHeight(doc.getNumberOfPages());
    }

    if (trimmed === '') { y += 4; continue; }

    // Tableau markdown
    if (isTableLine(trimmed)) {
      const tableLines: string[] = [trimmed];
      while (lineIdx + 1 < lines.length) {
        const nextLine = lines[lineIdx + 1].trim();
        if (isTableLine(nextLine) || isTableSeparator(nextLine)) {
          lineIdx++;
          tableLines.push(nextLine);
        } else {
          break;
        }
      }

      const rows = parseTableRows(tableLines);
      if (rows.length > 0) {
        const colCount = Math.max(...rows.map(r => r.length));
        const colW = contentWidth / colCount;
        const cellPadding = 2;
        const cellTextWidth = colW - (cellPadding * 2) - 1;
        const tableFontSize = 8;
        const tableLineHeight = 3.5;
        const minCellH = 6;

        doc.setFontSize(tableFontSize);

        // Calculer hauteur des lignes
        const rowHeights: number[] = rows.map((row) => {
          let maxLines = 1;
          row.forEach((cell) => {
            if (cell) {
              const wrappedLines = doc.splitTextToSize(cell, cellTextWidth);
              if (wrappedLines.length > maxLines) maxLines = wrappedLines.length;
            }
          });
          return Math.max(minCellH, maxLines * tableLineHeight + 3);
        });

        // Vérifier espace
        const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
        if (y + totalHeight + 10 > maxY) {
          doc.addPage();
          y = calculateHeaderHeight(doc.getNumberOfPages());
        }

        rows.forEach((row, ri) => {
          const isHeader = ri === 0;
          const rowY = y;
          const rowH = rowHeights[ri];

          // Fond
          if (isHeader) {
            doc.setFillColor(primaryColor.r, primaryColor.g, primaryColor.b);
          } else {
            doc.setFillColor(ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255, ri % 2 === 0 ? 248 : 255);
          }
          doc.rect(margins.left, rowY, contentWidth, rowH, 'F');

          // Bordures
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.1);
          doc.rect(margins.left, rowY, contentWidth, rowH, 'S');

          // Lignes verticales
          for (let ci = 1; ci < colCount; ci++) {
            doc.line(margins.left + ci * colW, rowY, margins.left + ci * colW, rowY + rowH);
          }

          // Texte
          row.forEach((cell, ci) => {
            if (!cell) return;
            doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
            doc.setFontSize(tableFontSize);
            doc.setTextColor(isHeader ? 255 : 40, isHeader ? 255 : 40, isHeader ? 255 : 40);
            const wrappedLines = doc.splitTextToSize(cell, cellTextWidth);
            wrappedLines.forEach((ln: string, li: number) => {
              doc.text(ln, margins.left + ci * colW + cellPadding, rowY + 3.5 + (li * tableLineHeight));
            });
          });

          y += rowH;
        });
        y += 6;
      }
      continue;
    }

    // Liste numérotée
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      doc.setFontSize(fontSize);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      doc.setFont('helvetica', 'normal');
      const num = numMatch[1];
      const itemText = numMatch[2];
      doc.text(`${num}.  `, margins.left + 4, y);
      const numWidth = doc.getTextWidth(`${num}.  `);
      y = drawMarkdownText(itemText, margins.left + 4 + numWidth, y, contentWidth - 8 - numWidth, fontSize, textColor);
      y += lineHeight + 1;
      continue;
    }

    // Séparateur horizontal (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      y += 4;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.3);
      doc.line(margins.left, y, pageWidth - margins.right, y);
      y += 5;
      continue;
    }

    // Citation (> ou > texte) - regrouper les lignes consécutives (supporter "> " et ">" seul)
    const blockquoteMatch = trimmed.match(/^>\s*(.*)$/);
    if (blockquoteMatch) {
      const quoteTextLines: string[] = [];
      let quoteIdx = lineIdx;
      while (quoteIdx < lines.length) {
        const quoteLine = lines[quoteIdx].trim();
        const qMatch = quoteLine.match(/^>\s*(.*)$/);
        if (qMatch) {
          quoteTextLines.push(qMatch[1]);
          quoteIdx++;
        } else if (quoteLine === '' && quoteIdx < lines.length - 1 && lines[quoteIdx + 1].trim().match(/^>\s/)) {
          quoteTextLines.push('');
          quoteIdx++;
        } else {
          break;
        }
      }
      lineIdx = quoteIdx - 1;

      const cleanedQuoteLines = quoteTextLines
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const paddingTop = 3;
      const paddingBottom = 3;
      const quoteLineHeight = fontSize * 0.4;
      const lineSpacingExtra = 1.5;
      const textOffsetY = fontSize * 0.35;
      // Estimation hauteur pour une ligne (marge 15 % pour gras/italique) + chevauchement pour éviter les interstices
      const getQuoteLineHeight = (quoteLine: string): number => {
        const plain = quoteLine.replace(/\*\*\*([^*]+)\*\*\*/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        const wrapped = doc.splitTextToSize(plain, contentWidth - 12);
        return Math.ceil(wrapped.length * quoteLineHeight * 1.15) + lineSpacingExtra + 0.5;
      };

      let quoteY = y;
      if (quoteY + paddingTop > maxY) {
        doc.addPage();
        quoteY = calculateHeaderHeight(doc.getNumberOfPages());
      }
      let rectTop = quoteY;
      quoteY += paddingTop + textOffsetY;
      doc.setFontSize(fontSize);
      doc.setTextColor(80, 80, 80);

      let needPaddingAbove = true;
      for (let qi = 0; qi < cleanedQuoteLines.length; qi++) {
        if (quoteY > maxY) {
          doc.addPage();
          quoteY = calculateHeaderHeight(doc.getNumberOfPages());
          rectTop = quoteY;
          quoteY += paddingTop + textOffsetY;
          needPaddingAbove = true;
        }
        const quoteLine = cleanedQuoteLines[qi];
        let lineRectH = getQuoteLineHeight(quoteLine);
        if (needPaddingAbove) {
          lineRectH += paddingTop + textOffsetY;
          needPaddingAbove = false;
        }
        doc.setFillColor(248, 248, 250);
        doc.rect(margins.left, rectTop, contentWidth, lineRectH, 'F');
        doc.setFillColor(100, 100, 100);
        doc.rect(margins.left, rectTop, 1.5, lineRectH, 'F');
        quoteY = drawMarkdownText(quoteLine, margins.left + 6, quoteY, contentWidth - 12, fontSize, { r: 80, g: 80, b: 80 });
        quoteY += lineSpacingExtra;
        rectTop += lineRectH;
      }

      doc.setFont('helvetica', 'normal');
      y = quoteY + paddingBottom - lineSpacingExtra + 10;
      continue;
    }

    // H4, H5, H6 — garder le markdown pour drawMarkdownText
    const h4Match = trimmed.match(/^(#{4,6})\s+(.+)$/);
    if (h4Match) {
      const hLevel = h4Match[1].length;
      const hText = h4Match[2];
      const hSize = hLevel === 4 ? 11 : hLevel === 5 ? 10 : 9;
      y += 2;
      y = drawMarkdownText(hText, margins.left, y, contentWidth, hSize, textColor);
      y += 3;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      y += 2;
      const titleSize = getTitleFontSize(config.style.titleSize, 3);
      y = drawMarkdownText(trimmed.substring(4), margins.left, y, contentWidth, titleSize, textColor);
      y += 4;
    } else if (trimmed.startsWith('## ')) {
      y += 2;
      const titleSize = getTitleFontSize(config.style.titleSize, 2);
      y = drawMarkdownText(trimmed.substring(3), margins.left, y, contentWidth, titleSize, secondaryColor);
      y += 5;
    } else if (trimmed.startsWith('# ')) {
      y += 3;
      const titleSize = getTitleFontSize(config.style.titleSize, 1);
      y = drawMarkdownText(trimmed.substring(2), margins.left, y, contentWidth, titleSize, primaryColor);
      y += 6;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      // Vérifier que le contenu après le bullet n'est pas vide
      const bulletStartLen = trimmed.startsWith('• ') ? 2 : 2;
      const bulletContent = trimmed.substring(bulletStartLen).trim().replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '');
      if (!bulletContent) {
        // Ignorer les lignes de bullet vides
        continue;
      }
      doc.setFontSize(fontSize);
      doc.setTextColor(textColor.r, textColor.g, textColor.b);
      // Dessiner le bullet puis le texte avec markdown
      doc.setFont('helvetica', 'normal');
      doc.text('•  ', margins.left + 4, y);
      const bulletWidth = doc.getTextWidth('•  ');
      y = drawMarkdownText(trimmed.substring(bulletStartLen), margins.left + 4 + bulletWidth, y, contentWidth - 8 - bulletWidth, fontSize, textColor);
      y += lineHeight + 1;
    } else {
      // Ignorer les lignes qui ne sont que des bullets orphelins ou vides
      const cleanedLine = trimmed.replace(/[\u00A0\u200B\u200C\u200D\uFEFF\s]/g, '');
      // Liste étendue de caractères bullet à ignorer
      const bulletChars = ['•', '●', '○', '◦', '‣', '⁃', '·', '▪', '▫', '►', '▸', '‐', '–', '—', '-', '*'];
      if (cleanedLine === '' || bulletChars.includes(cleanedLine) || /^[\-\*•●○◦‣⁃·▪▫►▸]+$/.test(cleanedLine)) {
        continue;
      }
      // Paragraphe normal avec parsing markdown
      doc.setFontSize(fontSize);
      y = drawMarkdownText(trimmed, margins.left, y, contentWidth, fontSize, textColor);
      y += lineHeight + 2;
    }
  }

  // Dessiner headers et footers sur toutes les pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawHeader(i);
    drawFooter(i, totalPages);
  }

  doc.setProperties({
    title: `Compte rendu - ${meetingName}`,
    author: config.content.pdfAuthor || 'Gilbert Assistant',
    subject: config.content.pdfSubject || 'Compte rendu de réunion',
    creator: 'Gilbert Assistant',
  });

  const fileName = `Compte_rendu_${meetingName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
  await savePDFWithDialog(doc, fileName);
  logger.debug('[PDF Export] ✅ Terminé');
}

// ============================================================================
// EXPORT WORD - VERSION RECONSTRUITE
// ============================================================================

export async function exportToWordWithTemplate(options: ExportOptions): Promise<void> {
  const { summaryText, meetingName, meetingDate, participants, duration, logoUrl } = options;

  const config: LayoutConfig = options.layoutConfig
    ? migrateLayoutConfig(options.layoutConfig)
    : defaultLayoutConfig;

  logger.debug('[Word Export] ========================================');
  logger.debug('[Word Export] Début export -', meetingName);
  logger.debug('[Word Export] Logo URL:', logoUrl || config.header.logoUrl || 'AUCUN');
  logger.debug('[Word Export] Footer text:', config.footer.footerText || 'AUCUN');
  logger.debug('[Word Export] Show page numbers:', config.footer.showPageNumbers);
  logger.debug('[Word Export] ========================================');

  const startTime = performance.now();

  // ===== CHARGER LE LOGO =====
  const logoSrc = logoUrl || config.header.logoUrl;
  const logoData = logoSrc ? await loadLogo(logoSrc) : null;

  let logoWidth = 0;
  let logoHeight = 0;

  if (logoData) {
    const maxW = 150; // pixels
    const maxH = 50;  // pixels
    const aspectRatio = logoData.width / logoData.height;

    logoWidth = Math.min(maxW, logoData.width);
    logoHeight = logoWidth / aspectRatio;

    if (logoHeight > maxH) {
      logoHeight = maxH;
      logoWidth = logoHeight * aspectRatio;
    }

    logger.debug('[Word Export] Logo dimensions finales:', Math.round(logoWidth), 'x', Math.round(logoHeight), 'px');
  }

  // ===== CRÉER LE HEADER =====
  const headerChildren: Paragraph[] = [];

  if (logoData && logoData.arrayBuffer) {
    let alignment = AlignmentType.LEFT;
    if (config.header.logoPosition === 'center') alignment = AlignmentType.CENTER;
    else if (config.header.logoPosition === 'right') alignment = AlignmentType.RIGHT;

    headerChildren.push(new Paragraph({
      children: [
        new ImageRun({
          data: logoData.arrayBuffer,
          transformation: { width: Math.round(logoWidth), height: Math.round(logoHeight) },
          type: logoData.format.toLowerCase() as 'png' | 'jpg',
        }),
      ],
      alignment,
      spacing: { after: 100 },
    }));
  }

  if (config.header.showCompanyName && config.header.companyName) {
    headerChildren.push(new Paragraph({
      children: [new TextRun({ text: config.header.companyName, bold: true, size: 22 })],
      alignment: AlignmentType.CENTER,
    }));
  }

  if (config.header.headerText) {
    headerChildren.push(new Paragraph({
      children: [new TextRun({ text: config.header.headerText, size: 18, color: '666666' })],
      alignment: AlignmentType.CENTER,
    }));
  }

  // Séparateur header selon le style configuré
  if (config.header.showHeaderSeparator && config.header.headerSeparatorStyle !== 'none') {
    headerChildren.push(new Paragraph({
      border: {
        bottom: {
          color: 'CCCCCC',
          size: config.header.headerSeparatorStyle === 'double-line' ? 12 : 6,
          style: getSeparatorBorderStyle(config.header.headerSeparatorStyle),
          space: 1,
        },
      },
      spacing: { after: 100 },
      children: [],
    }));
  }

  // ===== CRÉER LE FOOTER =====
  // Le footer doit être créé avec des paragraphes simples pour être bien reconnu par Word
  const footerParagraphs: Paragraph[] = [];

  // Séparateur footer selon le style configuré
  if (config.footer.showFooterSeparator && config.footer.footerSeparatorStyle !== 'none') {
    footerParagraphs.push(new Paragraph({
      border: {
        top: {
          color: 'CCCCCC',
          size: config.footer.footerSeparatorStyle === 'double-line' ? 12 : 6,
          style: getSeparatorBorderStyle(config.footer.footerSeparatorStyle),
          space: 1,
        },
      },
      spacing: { after: 100 },
      children: [],
    }));
  }

  // Texte personnalisé du footer (ex: "Gilbert Made")
  if (config.footer.footerText) {
    logger.debug('[Word Export] Ajout texte footer:', config.footer.footerText);
    footerParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
      children: [
        new TextRun({
          text: config.footer.footerText,
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
      ],
    }));
  }

  // Informations de contact
  if (config.footer.showContactInfo && config.footer.contactInfo) {
    footerParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 50 },
      children: [
        new TextRun({
          text: config.footer.contactInfo,
          size: 16,
          color: '888888',
          font: 'Calibri',
        }),
      ],
    }));
  }

  // Numéros de page
  const showPageNumbers = config.footer.showPageNumbers !== false;
  if (showPageNumbers) {
    let pageAlignment = AlignmentType.CENTER;
    const pos = config.footer.pageNumberPosition || 'bottom-center';
    if (pos.includes('left')) pageAlignment = AlignmentType.LEFT;
    else if (pos.includes('right')) pageAlignment = AlignmentType.RIGHT;

    logger.debug('[Word Export] Ajout numéros de page, position:', pos);
    footerParagraphs.push(new Paragraph({
      alignment: pageAlignment,
      children: [
        new TextRun({
          text: 'Page ',
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          children: [PageNumber.CURRENT],
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          text: ' / ',
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          children: [PageNumber.TOTAL_PAGES],
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
      ],
    }));
  }

  // Si aucun contenu footer, ajouter les numéros de page par défaut
  if (footerParagraphs.length === 0) {
    footerParagraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'Page ',
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          children: [PageNumber.CURRENT],
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          text: ' / ',
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
        new TextRun({
          children: [PageNumber.TOTAL_PAGES],
          size: 18,
          color: '666666',
          font: 'Calibri',
        }),
      ],
    }));
  }

  logger.debug('[Word Export] Footer créé avec', footerParagraphs.length, 'paragraphes');

  // ===== CRÉER LE CONTENU =====
  const contentParagraphs: (Paragraph | Table)[] = [];

  // Obtenir la police configurée (avec fallback)
  const getFontFamily = (): string => {
    const font = config.style.fontFamily || 'Calibri';
    // Mapper les noms de police si nécessaire
    const fontMap: Record<string, string> = {
      'Helvetica': 'Arial',  // Helvetica n'est pas disponible dans Word, utiliser Arial
      'Times New Roman': 'Times New Roman',
      'Arial': 'Arial',
      'Calibri': 'Calibri',
      'Georgia': 'Georgia',
      'Verdana': 'Verdana',
    };
    return fontMap[font] || 'Calibri';
  };

  // Obtenir l'espacement de ligne en twips
  const getLineSpacing = (): number => {
    switch (config.style.lineSpacing) {
      case 'single': return 240;   // 1.0
      case '1.5': return 360;      // 1.5
      case 'double': return 480;   // 2.0
      default: return 240;
    }
  };

  const fontFamily = getFontFamily();
  const lineSpacingValue = getLineSpacing();

  logger.debug('[Word Export] Font family:', fontFamily);
  logger.debug('[Word Export] Line spacing:', config.style.lineSpacing, '→', lineSpacingValue);

  // Helper pour créer un TextRun simple
  const createTextRun = (text: string, opts: { bold?: boolean; italic?: boolean; color?: string; size?: number } = {}): TextRun => {
    return new TextRun({
      text,
      bold: opts.bold,
      italics: opts.italic,
      color: opts.color?.replace('#', ''),
      size: opts.size ? opts.size * 2 : undefined, // docx utilise des demi-points
      font: fontFamily,
    });
  };

  // Helper pour parser le markdown inline (*** ** * _) et créer des TextRuns stylés
  const parseMarkdownToTextRuns = (text: string, baseColor: string, baseSize: number): TextRun[] => {
    const runs: TextRun[] = [];
    const colorHex = baseColor.replace('#', '');

    const findNextOpen = (s: string): { i: number; len: number; type: 'boldItalic' | 'bold' | 'italic' } | null => {
      const i3 = s.indexOf('***');
      const i2 = s.indexOf('**');
      const iStar = s.indexOf('*');
      const iUnd = s.indexOf('_');
      const i1 = (iStar >= 0 && s[iStar + 1] !== '*') ? iStar : -1;
      const candidates: { i: number; len: number; type: 'boldItalic' | 'bold' | 'italic' }[] = [];
      if (i3 >= 0) candidates.push({ i: i3, len: 3, type: 'boldItalic' });
      if (i2 >= 0) candidates.push({ i: i2, len: 2, type: 'bold' });
      if (i1 >= 0) candidates.push({ i: i1, len: 1, type: 'italic' });
      if (iUnd >= 0) candidates.push({ i: iUnd, len: 1, type: 'italic' });
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => a.i - b.i);
      return candidates[0];
    };

    const findClose = (s: string, open: { len: number }, openChar: string): number => {
      if (open.len === 3) return s.indexOf('***');
      if (open.len === 2) return s.indexOf('**');
      if (openChar === '*') {
        let p = 0;
        while (true) {
          const idx = s.indexOf('*', p);
          if (idx === -1) return -1;
          if (s[idx + 1] !== '*') return idx;
          p = idx + 1;
        }
      }
      return s.indexOf(openChar);
    };

    let remaining = text;
    while (remaining.length > 0) {
      const open = findNextOpen(remaining);
      if (open === null) {
        if (remaining) runs.push(createTextRun(remaining, { color: colorHex, size: baseSize }));
        break;
      }
      if (open.i > 0) {
        runs.push(createTextRun(remaining.substring(0, open.i), { color: colorHex, size: baseSize }));
      }
      const afterStart = remaining.substring(open.i + open.len);
      const openChar = remaining[open.i];
      const closeIdx = findClose(afterStart, open, openChar);
      if (closeIdx === -1) {
        runs.push(createTextRun(remaining.substring(open.i), { color: colorHex, size: baseSize }));
        break;
      }
      const inner = afterStart.substring(0, closeIdx);
      if (inner) {
        if (open.type === 'boldItalic') runs.push(createTextRun(inner, { bold: true, italic: true, color: colorHex, size: baseSize }));
        else if (open.type === 'bold') runs.push(createTextRun(inner, { bold: true, color: colorHex, size: baseSize }));
        else runs.push(createTextRun(inner, { italic: true, color: colorHex, size: baseSize }));
      }
      remaining = afterStart.substring(closeIdx + open.len);
    }

    if (runs.length === 0) runs.push(createTextRun(text, { color: colorHex, size: baseSize }));
    return runs;
  };

  // PRÉTRAITEMENT: Nettoyer le texte avant export Word
  // NOTE: On garde les marqueurs ** pour que parseMarkdownToTextRuns puisse les interpréter comme gras
  const cleanedWordText = summaryText
    // Supprimer les backslashes d'échappement (ex: 2\. → 2.)
    .replace(/\\([.,:;!?()[\]{}])/g, '$1')
    // IMPORTANT: Supprimer les lignes qui ne contiennent que des bullets/tirets (très large)
    .replace(/^[\s\u00A0]*[•●○◦‣⁃·▪▫►▸‐–—\u2022\u2023\u2043]+[\s\u00A0]*$/gm, '')
    // Supprimer les lignes qui ne contiennent que des espaces/nbsp
    .replace(/^[\s\u00A0]+$/gm, '')
    // Nettoyer les lignes vides multiples
    .replace(/\n{3,}/g, '\n\n')
    // Supprimer les lignes vides à la fin
    .replace(/\n+$/, '');

  // Filtrer les lignes une deuxième fois pour être sûr
  const allLines = cleanedWordText.split('\n').filter(line => {
    const trimmed = line.trim().replace(/\u00A0/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    // Rejeter les lignes vides
    if (trimmed === '') return false;
    // Rejeter les lignes qui ne sont que des bullets ou caractères de ponctuation/liste
    if (/^[\s\-\*•●○◦‣⁃·▪▫►▸‐–—\u2022\u2023\u2043\u25CF\u25CB\u25E6\u00B7]+$/.test(trimmed)) return false;
    return true;
  });
  for (let lineIdx = 0; lineIdx < allLines.length; lineIdx++) {
    const line = allLines[lineIdx];
    const trimmed = line.trim();

    if (trimmed === '') {
      contentParagraphs.push(new Paragraph({ spacing: { after: 120, line: lineSpacingValue } }));
      continue;
    }

    // Tableau markdown
    if (isTableLine(trimmed)) {
      const tableLines: string[] = [trimmed];
      while (lineIdx + 1 < allLines.length) {
        const nextLine = allLines[lineIdx + 1].trim();
        if (isTableLine(nextLine) || isTableSeparator(nextLine)) {
          lineIdx++;
          tableLines.push(nextLine);
        } else {
          break;
        }
      }

      const rows = parseTableRows(tableLines);
      if (rows.length > 0) {
        const colCount = Math.max(...rows.map(r => r.length));
        const primaryColorHex = config.style.primaryColor.replace('#', '');

        const tableRows = rows.map((row, ri) => {
          const isHeader = ri === 0;
          return new TableRow({
            tableHeader: isHeader,
            cantSplit: true,
            children: row.map(cell =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new TextRun({
                      text: cell || '',
                      bold: isHeader,
                      color: isHeader ? 'FFFFFF' : '333333',
                      size: 20,
                      font: fontFamily,
                    })],
                  }),
                ],
                shading: isHeader
                  ? { fill: primaryColorHex, type: ShadingType.SOLID, color: primaryColorHex }
                  : ri % 2 === 0
                  ? { fill: 'F8F8F8', type: ShadingType.SOLID, color: 'F8F8F8' }
                  : undefined,
                margins: { top: 50, bottom: 50, left: 80, right: 80 },
              })
            ),
          });
        });

        contentParagraphs.push(
          new Table({
            rows: tableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          })
        );
        contentParagraphs.push(new Paragraph({ spacing: { after: 80 } }));
      }
      continue;
    }

    // Séparateur horizontal (---, ***, ___)
    if (/^[-*_]{3,}$/.test(trimmed)) {
      contentParagraphs.push(
        new Paragraph({
          border: { bottom: { color: 'CCCCCC', size: 6, style: BorderStyle.SINGLE, space: 1 } },
          spacing: { before: 120, after: 120 },
          children: [],
        })
      );
      continue;
    }

    // Citation (> texte) - regrouper les lignes consécutives ; accepter "> " ou ">"
    const quoteLineMatch = trimmed.match(/^>\s*(.*)$/);
    if (quoteLineMatch) {
      const quoteTextLines: string[] = [];
      let quoteIdx = lineIdx;
      while (quoteIdx < allLines.length) {
        const qTrimmed = allLines[quoteIdx].trim();
        const qMatch = qTrimmed.match(/^>\s*(.*)$/);
        if (qMatch) {
          const quoteContent = qMatch[1].trim();
          if (quoteContent) quoteTextLines.push(quoteContent);
          quoteIdx++;
        } else if (qTrimmed === '' && quoteIdx < allLines.length - 1 && allLines[quoteIdx + 1].trim().match(/^>\s/)) {
          quoteIdx++;
        } else {
          break;
        }
      }
      lineIdx = quoteIdx - 1;

      // Garder le markdown inline pour parseMarkdownToTextRuns (italique/gras dans la citation)
      if (quoteTextLines.length > 0) {
        for (let qi = 0; qi < quoteTextLines.length; qi++) {
          const segment = quoteTextLines[qi];
          const quoteRuns = parseMarkdownToTextRuns(segment, '555555', config.style.fontSize);
          for (const r of quoteRuns) {
            (r as TextRun).italics = (r as TextRun).italics ?? true;
          }
          contentParagraphs.push(
            new Paragraph({
              children: quoteRuns,
              spacing: {
                before: qi === 0 ? 160 : 60,
                after: qi === quoteTextLines.length - 1 ? 200 : 60,
                line: lineSpacingValue
              },
              indent: { left: 400 },
              shading: { fill: 'F8F8FA', type: ShadingType.SOLID, color: 'F8F8FA' },
              border: {
                left: {
                  color: '666666',
                  size: 24,
                  style: BorderStyle.SINGLE,
                  space: 10,
                }
              },
            })
          );
        }
      }
      continue;
    }

    // H4, H5, H6
    const h4Match = trimmed.match(/^(#{4,6})\s+(.+)$/);
    if (h4Match) {
      const hashCount = h4Match[1].length;
      const titleContent = h4Match[2]
        .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/_([^_]+)_/g, '$1');
      const fontSize = hashCount === 4 ? 22 : hashCount === 5 ? 20 : 18;

      contentParagraphs.push(new Paragraph({
        children: [new TextRun({
          text: titleContent,
          bold: true,
          size: fontSize,
          font: fontFamily,
          color: config.style.textColor.replace('#', ''),
        })],
        spacing: { before: 160, after: 80, line: lineSpacingValue },
      }));
      continue;
    }

    // Liste numérotée
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      const num = numMatch[1];
      const itemText = numMatch[2];
      const numRuns = parseMarkdownToTextRuns(itemText, config.style.textColor, config.style.fontSize);
      numRuns.unshift(createTextRun(`${num}.  `, { color: config.style.textColor, size: config.style.fontSize }));

      contentParagraphs.push(new Paragraph({
        children: numRuns,
        indent: { left: 720 },
        spacing: { after: 80, line: lineSpacingValue },
      }));
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const titleText = trimmed.substring(4);
      contentParagraphs.push(new Paragraph({
        children: parseMarkdownToTextRuns(titleText, config.style.textColor, getTitleFontSize(config.style.titleSize, 3)),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100, line: lineSpacingValue },
      }));
    } else if (trimmed.startsWith('## ')) {
      const titleText = trimmed.substring(3);
      contentParagraphs.push(new Paragraph({
        children: parseMarkdownToTextRuns(titleText, config.style.secondaryColor, getTitleFontSize(config.style.titleSize, 2)),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 140, line: lineSpacingValue },
      }));
    } else if (trimmed.startsWith('# ')) {
      const titleText = trimmed.substring(2);
      contentParagraphs.push(new Paragraph({
        children: parseMarkdownToTextRuns(titleText, config.style.primaryColor, getTitleFontSize(config.style.titleSize, 1)),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 320, after: 160, line: lineSpacingValue },
      }));
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      const bulletStartLen = trimmed.startsWith('• ') ? 2 : 2;
      const bulletText = trimmed.substring(bulletStartLen);
      // Vérifier que le contenu après le bullet n'est pas vide
      const cleanBulletText = bulletText.trim().replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, '');
      if (!cleanBulletText) {
        // Ignorer les lignes de bullet vides
        continue;
      }
      const bulletRuns = parseMarkdownToTextRuns(bulletText, config.style.textColor, config.style.fontSize);
      // Ajouter le bullet point au début
      bulletRuns.unshift(createTextRun('•  ', { color: config.style.textColor, size: config.style.fontSize }));

      contentParagraphs.push(new Paragraph({
        children: bulletRuns,
        indent: { left: 720 },
        spacing: { after: 80, line: lineSpacingValue },
      }));
    } else {
      // Ignorer les lignes qui ne sont que des bullets orphelins ou vides
      const cleanedLine = trimmed.replace(/[\u00A0\u200B\u200C\u200D\uFEFF\s]/g, '');
      // Liste étendue de caractères bullet à ignorer
      const bulletChars = ['•', '●', '○', '◦', '‣', '⁃', '·', '▪', '▫', '►', '▸', '‐', '–', '—', '-', '*'];
      if (cleanedLine === '' || bulletChars.includes(cleanedLine) || /^[\-\*•●○◦‣⁃·▪▫►▸]+$/.test(cleanedLine)) {
        continue;
      }
      // Paragraphe normal avec parsing markdown
      contentParagraphs.push(new Paragraph({
        children: parseMarkdownToTextRuns(trimmed, config.style.textColor, config.style.fontSize),
        spacing: { after: 120, line: lineSpacingValue },
      }));
    }
  }

  // ===== CRÉER LE DOCUMENT =====
  logger.debug('[Word Export] ===== CRÉATION DOCUMENT =====');
  logger.debug('[Word Export] Header paragraphs:', headerChildren.length);
  logger.debug('[Word Export] Footer paragraphs:', footerParagraphs.length);
  logger.debug('[Word Export] Content paragraphs:', contentParagraphs.length);

  // Créer le Header
  const documentHeader = new Header({ children: headerChildren });

  // Créer le Footer avec tous les types pour s'assurer qu'il apparaît sur toutes les pages
  const documentFooter = new Footer({ children: footerParagraphs });

  logger.debug('[Word Export] Header créé:', documentHeader ? 'OK' : 'ERREUR');
  logger.debug('[Word Export] Footer créé:', documentFooter ? 'OK' : 'ERREUR');
  logger.debug('[Word Export] Footer paragraphs détail:', footerParagraphs.map(p => 'Paragraph'));

  // Convertir mm en twips (1 mm = 56.7 twips)
  const mmToTwip = (mm: number) => Math.round(mm * 56.7);

  // Taille de page selon le format configuré
  const getPageSize = () => {
    const format = config.page.format || 'A4';
    const isLandscape = config.page.orientation === 'landscape';

    // Dimensions en twips (1 inch = 1440 twips)
    const sizes: Record<string, { width: number; height: number }> = {
      'A4': { width: 11906, height: 16838 },      // 210mm x 297mm
      'Letter': { width: 12240, height: 15840 },  // 8.5" x 11"
      'Legal': { width: 12240, height: 20160 },   // 8.5" x 14"
    };

    const size = sizes[format] || sizes['A4'];
    return isLandscape
      ? { width: size.height, height: size.width }
      : size;
  };

  const pageSize = getPageSize();

  logger.debug('[Word Export] Page format:', config.page.format, 'orientation:', config.page.orientation);
  logger.debug('[Word Export] Margins:', config.page.margins);

  try {
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: pageSize,
            margin: {
              top: mmToTwip(config.page.margins.top),
              bottom: mmToTwip(config.page.margins.bottom + 10), // +10mm pour le footer
              left: mmToTwip(config.page.margins.left),
              right: mmToTwip(config.page.margins.right),
              header: mmToTwip(10), // 10mm pour le header
              footer: mmToTwip(10), // 10mm pour le footer
            },
          },
        },
        headers: {
          default: documentHeader,
          first: documentHeader,
          even: documentHeader,
        },
        footers: {
          default: documentFooter,
          first: documentFooter,
          even: documentFooter,
        },
        children: contentParagraphs,
      }],
    });

    const blob = await Packer.toBlob(doc);
    const endTime = performance.now();

    logger.debug('[Word Export] Document généré en', Math.round(endTime - startTime), 'ms');
    logger.debug('[Word Export] Taille:', Math.round(blob.size / 1024), 'KB');

    const fileName = `Compte_rendu_${meetingName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;
    await saveFileWithDialog(blob, fileName, 'docx');

    logger.debug('[Word Export] ✅ Export terminé avec succès');
  } catch (error) {
    logger.error('[Word Export] ❌ Erreur:', error);
    throw error;
  }
}
