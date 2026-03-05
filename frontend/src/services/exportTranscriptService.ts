import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, AlignmentType, Footer, PageNumber, convertInchesToTwip } from 'docx';
import { saveFileWithDialog, savePDFWithDialog } from './fileSaveUtils';
import { logger } from '@/utils/logger';

/**
 * Interface pour les segments de transcription
 */
interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp?: string;
}

/**
 * Exporte une transcription au format Word (.docx) - VERSION OPTIMISÉE
 * Utilise la librairie docx pour un format natif et rapide
 * @param transcriptSegments Les segments de la transcription
 * @param meetingName Le nom de la réunion
 * @param meetingDate La date de la réunion
 */
export async function exportTranscriptToWord(
  transcriptSegments: TranscriptSegment[],
  meetingName: string,
  meetingDate: string
): Promise<void> {
  logger.debug('[TranscriptExport] Début export Word DOCX:', {
    segmentsCount: transcriptSegments.length,
    meetingName,
    meetingDate
  });

  const startTime = performance.now();

  try {
    // Créer les paragraphes pour le document
    const children: Paragraph[] = [];

    // Titre
    children.push(new Paragraph({
      children: [new TextRun({
        text: `Transcription - ${meetingName}`,
        bold: true,
        size: 32, // 16pt
        color: '1976D2',
        font: 'Calibri',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }));

    // Date
    children.push(new Paragraph({
      children: [new TextRun({
        text: `Date: ${meetingDate}`,
        size: 22, // 11pt
        color: '666666',
        font: 'Calibri',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));

    // Ligne de séparation
    children.push(new Paragraph({
      border: { bottom: { color: 'CCCCCC', size: 6, style: 'single' as any, space: 1 } },
      spacing: { after: 300 },
    }));

    // Segments de transcription - optimisé en batch
    for (const segment of transcriptSegments) {
      const speakerText = segment.speaker + (segment.timestamp ? ` (${segment.timestamp})` : '') + ':';

      children.push(new Paragraph({
        children: [
          new TextRun({
            text: speakerText,
            bold: true,
            size: 22, // 11pt
            color: '333333',
            font: 'Calibri',
          }),
          new TextRun({
            text: ' ' + segment.text,
            size: 22, // 11pt
            color: '444444',
            font: 'Calibri',
          }),
        ],
        spacing: { after: 200 },
      }));
    }

    // Footer avec numéros de page
    const footerParagraphs: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({ text: 'Page ', size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '888888' }),
          new TextRun({ text: ' / ', size: 18, color: '888888' }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '888888' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ];

    // Créer le document
    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(0.8),
              right: convertInchesToTwip(0.8),
              footer: convertInchesToTwip(0.5),
            },
          },
        },
        footers: { default: new Footer({ children: footerParagraphs }) },
        children,
      }],
    });

    // Générer le blob
    const blob = await Packer.toBlob(doc);

    // Générer un nom de fichier
    const fileName = `Transcription_${meetingName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`;

    const endTime = performance.now();
    logger.debug(`[TranscriptExport] Document généré en ${(endTime - startTime).toFixed(0)}ms`);

    // Sauvegarder
    await saveFileWithDialog(blob, fileName, 'docx');

    logger.debug('[TranscriptExport] ✅ Export Word terminé');
  } catch (error) {
    logger.error('[TranscriptExport] ❌ Erreur export Word:', error);
    throw error;
  }
}

/**
 * Exporte une transcription au format PDF
 * @param transcriptSegments Les segments de la transcription
 * @param meetingName Le nom de la réunion
 * @param meetingDate La date de la réunion
 */
export async function exportTranscriptToPDF(
  transcriptSegments: TranscriptSegment[],
  meetingName: string,
  meetingDate: string
): Promise<void> {
  logger.debug('Début de l\'exportation de la transcription au format PDF:', {
    segmentsCount: transcriptSegments.length,
    meetingName,
    meetingDate
  });

  try {
    // Créer un nouveau document PDF
    const doc = new jsPDF();
    
    // Ajouter un titre
    doc.setFontSize(18);
    doc.setTextColor(33, 33, 33);
    doc.text('Transcription', doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });
    
    // Ajouter le nom de la réunion
    doc.setFontSize(14);
    doc.text(meetingName, doc.internal.pageSize.getWidth() / 2, 30, { align: 'center' });
    
    // Ajouter la date
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Date: ${meetingDate}`, doc.internal.pageSize.getWidth() / 2, 40, { align: 'center' });
    
    // Ajouter le contenu de la transcription
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    
    let yPosition = 60;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const textWidth = pageWidth - 2 * margin;
    
    transcriptSegments.forEach(segment => {
      // Ajouter le nom du locuteur
      doc.setFont(undefined, 'bold');
      let speakerText = segment.speaker;
      if (segment.timestamp) {
        speakerText += ` (${segment.timestamp})`;
      }
      speakerText += ':';
      
      // Vérifier si on a besoin d'une nouvelle page
      if (yPosition > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.text(speakerText, margin, yPosition);
      yPosition += 7;
      
      // Ajouter le texte du locuteur
      doc.setFont(undefined, 'normal');
      
      // Diviser le texte en lignes pour qu'il rentre dans la page
      const textLines = doc.splitTextToSize(segment.text, textWidth);
      
      // Vérifier si on a besoin d'une nouvelle page
      if (yPosition + textLines.length * 7 > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.text(textLines, margin, yPosition);
      yPosition += textLines.length * 7 + 10; // Ajouter un espace après chaque segment
    });
    
    // Générer un nom de fichier
    const fileName = `Transcription_${meetingName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    
    // Sauvegarder avec la boîte de dialogue "Enregistrer sous"
    logger.debug('Ouverture de la boîte de dialogue pour:', fileName);
    await savePDFWithDialog(doc, fileName);
    
    return Promise.resolve();
  } catch (error) {
    if ((error as Error).message === 'Sauvegarde annulée') {
      logger.debug('Export annulé par l\'utilisateur');
      return;
    }
    logger.error('Erreur lors de l\'exportation de la transcription en PDF:', error);
    return Promise.reject(error);
  }
}

/**
 * Exporte une transcription au format Markdown
 * @param transcriptSegments Les segments de la transcription
 * @param meetingName Le nom de la réunion
 * @param meetingDate La date de la réunion
 */
export async function exportTranscriptToMarkdown(
  transcriptSegments: TranscriptSegment[],
  meetingName: string,
  meetingDate: string
): Promise<void> {
  logger.debug('Début de l\'exportation de la transcription au format Markdown:', {
    segmentsCount: transcriptSegments.length,
    meetingName,
    meetingDate
  });

  try {
    // Créer le contenu Markdown
    let markdownContent = `# Transcription - ${meetingName}\n\n`;
    markdownContent += `Date: ${meetingDate}\n\n`;
    markdownContent += `---\n\n`;
    
    // Ajouter chaque segment de transcription
    transcriptSegments.forEach(segment => {
      const timestamp = segment.timestamp ? ` (${segment.timestamp})` : '';
      markdownContent += `**${segment.speaker}${timestamp}:** ${segment.text}\n\n`;
    });
    
    // Créer un blob pour le téléchargement
    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    
    // Générer un nom de fichier
    const fileName = `Transcription_${meetingName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.md`;
    
    // Sauvegarder avec la boîte de dialogue "Enregistrer sous"
    logger.debug('Ouverture de la boîte de dialogue pour:', fileName);
    await saveFileWithDialog(blob, fileName, 'markdown');
    
    return Promise.resolve();
  } catch (error) {
    if ((error as Error).message === 'Sauvegarde annulée') {
      logger.debug('Export annulé par l\'utilisateur');
      return;
    }
    logger.error('Erreur lors de l\'exportation de la transcription en Markdown:', error);
    return Promise.reject(error);
  }
}
