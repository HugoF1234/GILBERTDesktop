import React, { useMemo, useEffect, useRef } from 'react';
import { Box, SxProps, Theme } from '@mui/material';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Converter } from 'showdown';
// @ts-ignore - turndown peut avoir différents types d'export
import TurndownService from 'turndown';
// @ts-ignore - turndown-plugin-gfm pour les tableaux
import { tables } from 'turndown-plugin-gfm';
import { logger } from '@/utils/logger';

interface RichTextEditorProps {
  value: string; // Markdown input
  onChange: (markdown: string) => void;
  placeholder?: string;
  sx?: SxProps<Theme>;
  readOnly?: boolean;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Saisissez votre texte...',
  sx,
  readOnly = false,
}) => {
  const quillRef = useRef<ReactQuill>(null);
  const isInternalChange = useRef(false);

  // Helper pour extraire et préserver les tableaux
  const extractTables = (html: string): { htmlWithoutTables: string; tables: Array<{ placeholder: string; original: string }> } => {
    const tableRegex = /<table[\s\S]*?<\/table>/gi;
    const tables: Array<{ placeholder: string; original: string }> = [];
    let htmlWithoutTables = html;
    const matches: Array<{ index: number; match: string }> = [];
    
    let match;
    while ((match = tableRegex.exec(html)) !== null) {
      matches.push({
        index: match.index,
        match: match[0],
      });
    }

    // Remplacer de la fin vers le début pour préserver les indices
    matches.reverse().forEach((m, idx) => {
      const placeholder = `<!-- TABLE_PLACEHOLDER_${matches.length - 1 - idx} -->`;
      tables.unshift({
        placeholder,
        original: m.match,
      });
      htmlWithoutTables = htmlWithoutTables.substring(0, m.index) + placeholder + htmlWithoutTables.substring(m.index + m.match.length);
    });

    return { htmlWithoutTables, tables };
  };

  // Convertir Markdown en HTML pour l'éditeur (les styles sont gérés par CSS)
  const markdownToHtml = useMemo(() => {
    const converter = new Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      simpleLineBreaks: true,
    });
    return (md: string) => {
      if (!md || md.trim() === '') return '';
      // Les styles sont gérés par CSS, pas besoin de styles inline
      return converter.makeHtml(md);
    };
  }, []);

  // Convertir HTML en Markdown pour la sauvegarde
  const htmlToMarkdown = useMemo(() => {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
      // Préserver les tableaux en HTML pendant la conversion
      codeBlock: (node: any) => {
        if (node.nodeName === 'TABLE') {
          // Ne pas convertir les tableaux en code blocks
          return false;
        }
      },
    });
    
    // Ajouter le plugin pour les tableaux GitHub Flavored Markdown
    try {
      turndownService.use(tables);
    } catch (e) {
      logger.warn('Could not load turndown-plugin-gfm, table support may be limited');
    }
    
    return (html: string) => {
      if (!html || html.trim() === '') return '';
      
      // Extraire les tableaux pour les préserver
      const { htmlWithoutTables, tables } = extractTables(html);
      
      // Convertir le HTML sans tableaux en Markdown
      let markdown = turndownService.turndown(htmlWithoutTables);
      
      // Restaurer les tableaux en les convertissant en Markdown
      tables.forEach(({ placeholder, original }) => {
        // Convertir le tableau HTML en Markdown
        const tableMarkdown = turndownService.turndown(original);
        // Remplacer le placeholder par le Markdown du tableau
        markdown = markdown.replace(placeholder, '\n\n' + tableMarkdown + '\n\n');
      });
      
      // Nettoyer les espaces superflus
      markdown = markdown.replace(/\n{3,}/g, '\n\n');
      markdown = markdown.replace(/\|\s*\|\s*\|/g, '| | |');
      markdown = markdown.replace(/\|\s*\|/g, '| |');
      
      return markdown;
    };
  }, []);

  // État HTML interne de l'éditeur
  const [htmlValue, setHtmlValue] = React.useState(() => markdownToHtml(value));

  // Synchroniser quand la valeur externe change (mais pas lors des changements internes)
  useEffect(() => {
    if (!isInternalChange.current) {
      let newHtml = markdownToHtml(value);
      
      // Normaliser les couleurs pour que Quill les détecte correctement
      // Convertir rgb/rgba vers hex si nécessaire
      newHtml = newHtml.replace(/color:\s*rgb\(25,\s*118,\s*210\)/gi, 'color: #1976d2');
      newHtml = newHtml.replace(/color:\s*rgba\(25,\s*118,\s*210[^)]*\)/gi, 'color: #1976d2');
      // Convertir les couleurs CSS variables Material-UI vers hex
      newHtml = newHtml.replace(/color:\s*primary\.main/gi, 'color: #1976d2');
      
      setHtmlValue(newHtml);
    }
    isInternalChange.current = false;
  }, [value, markdownToHtml]);

  // Debounce pour éviter les conversions trop fréquentes
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup du timeout au démontage
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);
  
  const handleChange = (html: string) => {
    isInternalChange.current = true;
    setHtmlValue(html);
    
    // Debounce la conversion en Markdown pour éviter les calculs à chaque frappe
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    debounceTimeoutRef.current = setTimeout(() => {
      try {
        const markdown = htmlToMarkdown(html);
        onChange(markdown);
      } catch (error) {
        logger.error('Error converting HTML to Markdown:', error);
        // En cas d'erreur, ne rien faire pour éviter une boucle
      }
    }, 500); // Attendre 500ms après la dernière frappe
  };

  // Configuration de la toolbar (essentiel comme dans un client email)
  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 
            color: [
              '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
              '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff',
              '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff',
              '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24ff',
              '#444444', '#5c0000', '#663d00', '#666600', '#003700', '#002966', '#3d1466',
              // Ajouter le bleu primary du thème
              '#1976d2'
            ]
          }, { 
            background: [
              '#000000', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff',
              '#ffffff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff',
              '#bbbbbb', '#f06666', '#ffc266', '#ffff66', '#66b966', '#66a3e0', '#c285ff',
              '#888888', '#a10000', '#b26b00', '#b2b200', '#006100', '#0047b2', '#6b24ff',
              '#444444', '#5c0000', '#663d00', '#666600', '#003700', '#002966', '#3d1466',
              // Ajouter le bleu primary du thème
              '#1976d2'
            ]
          }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['link'],
          ['clean'],
        ],
      },
    }),
    []
  );

  const formats = [
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'list',
    'bullet',
    'align',
    'link',
  ];

  return (
    <Box
      sx={{
        '& .ql-container': {
          fontFamily: 'inherit',
          fontSize: '1rem',
          minHeight: '400px',
          maxHeight: '600px',
          overflowY: 'auto',
          borderBottom: '1px solid',
          borderLeft: '1px solid',
          borderRight: '1px solid',
          borderColor: 'divider',
          borderRadius: '0 0 4px 4px',
        },
        '& .ql-editor': {
          minHeight: '400px',
          padding: '16px',
          fontFamily: 'inherit',
          fontSize: '1rem',
          lineHeight: 1.6,
          '&.ql-blank::before': {
            fontStyle: 'normal',
            color: 'text.secondary',
          },
          // Styles pour les titres correspondant au rendu du résumé
          '& h1': {
            color: 'primary.main',
            fontSize: '2.125rem',
            fontWeight: 'bold',
            marginTop: '24px',
            marginBottom: '16px',
            paddingBottom: '8px',
            borderBottom: '2px solid',
            borderColor: 'primary.main',
          },
          '& h2': {
            color: 'primary.main',
            fontSize: '1.5rem',
            fontWeight: 600,
            marginTop: '24px',
            marginBottom: '12px',
          },
          '& h3': {
            color: 'text.primary',
            fontSize: '1.25rem',
            fontWeight: 600,
            marginTop: '20px',
            marginBottom: '8px',
          },
          '& h4': {
            color: 'text.primary',
            fontSize: '1rem',
            fontWeight: 600,
            marginTop: '16px',
            marginBottom: '8px',
          },
          // Paragraphes
          '& p': {
            margin: '12px 0',
            lineHeight: 1.6,
          },
          // Listes
          '& ul, & ol': {
            margin: '16px 0',
            paddingLeft: '24px',
            '& li': {
              margin: '8px 0',
            },
          },
          // Strong
          '& strong': {
            fontWeight: 'bold',
          },
          // Préserver les tableaux HTML
          '& table': {
            borderCollapse: 'collapse',
            width: '100%',
            margin: '16px 0',
            '& th, & td': {
              border: '1px solid #ddd',
              padding: '8px',
              textAlign: 'left',
            },
            '& th': {
              backgroundColor: '#f2f2f2',
              fontWeight: 'bold',
            },
          },
        },
        '& .ql-toolbar': {
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderTop: '1px solid',
          borderLeft: '1px solid',
          borderRight: '1px solid',
          borderColor: 'divider',
          borderRadius: '4px 4px 0 0',
          bgcolor: 'background.paper',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        },
        ...sx,
      }}
    >
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={htmlValue}
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={readOnly}
      />
    </Box>
  );
};

export default RichTextEditor;
