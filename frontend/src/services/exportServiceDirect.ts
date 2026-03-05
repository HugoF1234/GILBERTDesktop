import { saveAs } from 'file-saver';
import { logger } from '@/utils/logger';

/**
 * Exporte un compte rendu au format Word (.docx)
 * @param summaryText Le texte du compte rendu (format Markdown)
 * @param meetingName Le nom de la réunion
 * @param meetingDate La date de la réunion
 */
export async function exportSummaryToWord(
  summaryText: string,
  meetingName: string,
  meetingDate: string
): Promise<void> {
  logger.debug('Début de l\'exportation Word avec:', {
    summaryTextLength: summaryText.length,
    meetingName,
    meetingDate
  });

  try {
    // Créer un contenu HTML propre
    const cleanedMarkdown = stripCodeFences(summaryText);
    const cleanedText = cleanMarkdownText(cleanedMarkdown);
    
    // Utiliser un format HTML simple pour Word
    const wordContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:w="urn:schemas-microsoft-com:office:word" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <title>Compte rendu - ${meetingName}</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 21cm 29.7cm;
            margin: 2cm;
          }
          body {
            font-family: 'Calibri', sans-serif;
            font-size: 11pt;
            line-height: 1.5;
          }
          h1 { font-size: 16pt; text-align: center; color: #333; }
          h2 { font-size: 14pt; color: #444; margin-top: 12pt; }
          h3 { font-size: 12pt; color: #555; }
          p { margin-bottom: 10pt; }
          .meeting-header { text-align: center; margin-bottom: 20pt; }
          .meeting-date { text-align: center; color: #666; margin-bottom: 20pt; }
          ul, ol { margin-left: 20pt; }
          li { margin-bottom: 5pt; }
        </style>
      </head>
      <body>
        <div class="meeting-header">
          <h1>Compte rendu - ${meetingName}</h1>
          <div class="meeting-date">Date: ${meetingDate}</div>
        </div>
        <div class="content">
          ${cleanedText}
        </div>
      </body>
      </html>
    `;
    
    // Créer un blob avec le type MIME correct pour Word
    const blob = new Blob([wordContent], { 
      type: 'application/msword'
    });
    
    // Générer un nom de fichier basé sur la date de la réunion
    const dateForFilename = normalizeDateForFilename(meetingDate);
    const fileName = `Compte_rendu_${meetingName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}_${dateForFilename}.doc`;
    
    // Télécharger le fichier
    logger.debug('Téléchargement du fichier Word:', fileName);
    saveAs(blob, fileName);
    
    logger.debug('Fichier Word téléchargé avec succès');
    return Promise.resolve();
  } catch (error) {
    logger.error('Erreur lors de l\'exportation du compte rendu:', error);
    return Promise.reject(error);
  }
}

/**
 * Nettoie et convertit le texte Markdown en HTML pour Word
 * @param markdown Texte au format Markdown
 * @returns HTML compatible avec Word
 */
function cleanMarkdownText(markdown: string): string {
  // Fonction de conversion Markdown -> HTML pour Word
  let html = markdown;
  
  // Remplacer les caractères spéciaux
  const replacements = [
    { search: 'Ø=ÜA', replace: 'Réunion' },
    { search: 'Ø=Üe', replace: 'Participants' },
    { search: 'Ø=YR', replace: 'Durée estimée' },
    { search: 'Ø>Yà', replace: 'Résumé express' },
    { search: 'Ø=YÂb', replace: 'Ordre du jour' },
    { search: 'Ø=Üá', replace: 'Point 1' },
    { search: 'Ø=Ü°', replace: 'Point 2' },
    { search: 'Ø=Üd', replace: 'Point 3' },
    { search: 'Ø=Y', replace: 'Actions' },
    { search: 'Ø=Ül', replace: 'Tâche' },
    { search: '#ñb', replace: 'Point 4' },
    { search: '---', replace: ' ' }
  ];
  
  // Appliquer les remplacements
  for (const item of replacements) {
    html = html.split(item.search).join(item.replace);
  }
  
  // Titres
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  
  // Paragraphes
  html = html.replace(/^(?!<h|<ul|<ol|<li|<blockquote|<pre|<table)(.+)$/gm, '<p>$1</p>');
  
  // Listes
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Entourer les listes avec ul/ol
  html = html.replace(/(<li>.+<\/li>\n)+/g, '<ul>$&</ul>');
  
  // Gras et italique
  html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  html = html.replace(/\*(.+?)\*/g, '<i>$1</i>');
  html = html.replace(/_(.+?)_/g, '<i>$1</i>');
  
  // Liens
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  
  // Nettoyer les balises p imbriquées
  html = html.replace(/<p><h(\d)>/g, '<h$1>');
  html = html.replace(/<\/h(\d)><\/p>/g, '</h$1>');
  
  // Remplacer les sauts de ligne simples par des <br>
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

// Supprime les fences de code éventuels autour du résumé (```markdown ... ```)
function stripCodeFences(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z-]*\s*/m, '');
    cleaned = cleaned.replace(/\n?```\s*$/m, '');
  }
  return cleaned.trim();
}

// Convertit une date JJ/MM/AAAA ou ISO en AAAA-MM-JJ pour le nom de fichier
function normalizeDateForFilename(input: string): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  // Si format JJ/MM/AAAA
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const [, jj, mm, aaaa] = m;
    return `${aaaa}-${mm}-${jj}`;
  }
  // Sinon tenter de parser avec Date
  const d = new Date(input);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Fallback
  return new Date().toISOString().slice(0, 10);
}
