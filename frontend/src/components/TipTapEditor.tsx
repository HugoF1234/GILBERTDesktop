import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Placeholder } from '@tiptap/extension-placeholder';
import {
  Box,
  IconButton,
  Tooltip,
  Divider,
  Paper,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  alpha,
  useTheme,
} from '@mui/material';
import {
  FormatBold,
  FormatItalic,
  FormatUnderlined,
  FormatListBulleted,
  FormatListNumbered,
  TableChart,
  Link as LinkIcon,
  Highlight as HighlightIcon,
  Undo,
  Redo,
  AddBox,
  DeleteOutline,
  ViewColumn,
  TableRows,
  FormatColorText,
  FormatClear,
} from '@mui/icons-material';

// Markdown conversion utilities
import { Converter } from 'showdown';
// @ts-ignore
import TurndownService from 'turndown';
// @ts-ignore
import { tables } from 'turndown-plugin-gfm';

interface TipTapEditorProps {
  value: string; // Markdown input
  onChange: (markdown: string) => void;
  onBlur?: () => void; // Callback quand l'éditeur perd le focus (pour auto-save)
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: number;
}

// Toolbar button component with animation
const ToolbarButton: React.FC<{
  onClick: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  isActive?: boolean;
  disabled?: boolean;
  tooltip: string;
  children: React.ReactNode;
}> = ({ onClick, isActive, disabled, tooltip, children }) => {
  const theme = useTheme();

  return (
    <Tooltip title={tooltip} arrow placement="top">
      <span>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          size="small"
          sx={{
            color: isActive ? 'primary.main' : 'text.secondary',
            bgcolor: isActive ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
            borderRadius: 1,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              bgcolor: isActive
                ? alpha(theme.palette.primary.main, 0.15)
                : alpha(theme.palette.action.hover, 0.8),
              transform: 'translateY(-1px)',
            },
            '&:active': {
              transform: 'translateY(0)',
            },
            '&.Mui-disabled': {
              opacity: 0.4,
            },
          }}
        >
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  value,
  onChange,
  onBlur,
  placeholder = 'Commencez à écrire...',
  readOnly = false,
  minHeight = 400,
}) => {
  const theme = useTheme();
  const [tableMenuAnchor, setTableMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [headingMenuAnchor, setHeadingMenuAnchor] = React.useState<null | HTMLElement>(null);
  const isInternalUpdate = useRef(false);

  // Markdown to HTML converter
  const markdownToHtml = useMemo(() => {
    const converter = new Converter({
      tables: true,
      strikethrough: true,
      tasklists: true,
      simpleLineBreaks: false,
      headerLevelStart: 1,
      // Preserve raw HTML (for colored text, underlines, etc.)
      literalMidWordUnderscores: true,
    });
    // Enable raw HTML passthrough
    converter.setFlavor('github');
    return (md: string) => {
      if (!md || md.trim() === '') return '<p></p>';
      return converter.makeHtml(md);
    };
  }, []);

  // HTML to Markdown converter
  const htmlToMarkdown = useMemo(() => {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '*',
      strongDelimiter: '**',
    });

    // Remove colgroup elements (TipTap adds these)
    turndownService.addRule('colgroup', {
      filter: 'colgroup',
      replacement: () => '',
    });

    // Custom table conversion for TipTap's structure
    turndownService.addRule('tiptapTable', {
      filter: 'table',
      replacement: function(_content: string, node: HTMLElement) {
        const rows: string[][] = [];
        const headerRow: string[] = [];
        let hasHeader = false;

        // Find all rows
        const tableRows = node.querySelectorAll('tr');
        tableRows.forEach((tr, rowIndex) => {
          const cells: string[] = [];
          const tableCells = tr.querySelectorAll('th, td');

          tableCells.forEach((cell) => {
            // Get text content, stripping <p> tags
            let cellContent = cell.textContent?.trim() || '';
            // Replace newlines with spaces for table cells
            cellContent = cellContent.replace(/\n/g, ' ');
            cells.push(cellContent);

            // Check if this is a header cell
            if (cell.tagName.toLowerCase() === 'th') {
              hasHeader = true;
            }
          });

          if (cells.length > 0) {
            // First row with th elements is the header
            if (rowIndex === 0 && hasHeader) {
              headerRow.push(...cells);
            } else {
              rows.push(cells);
            }
          }
        });

        // If we only have header row, that means all content is in header
        if (headerRow.length > 0 && rows.length === 0) {
          // Move first "row" to header if it has th elements
          return buildMarkdownTable(headerRow, []);
        }

        // If no explicit header, use first row as header
        if (headerRow.length === 0 && rows.length > 0) {
          const firstRow = rows.shift()!;
          return buildMarkdownTable(firstRow, rows);
        }

        return buildMarkdownTable(headerRow, rows);
      },
    });

    // Helper function to build markdown table
    function buildMarkdownTable(header: string[], rows: string[][]): string {
      if (header.length === 0) return '';

      const colCount = Math.max(header.length, ...rows.map(r => r.length));

      // Normalize all rows to same column count
      const normalizedHeader = [...header];
      while (normalizedHeader.length < colCount) normalizedHeader.push('');

      const normalizedRows = rows.map(row => {
        const newRow = [...row];
        while (newRow.length < colCount) newRow.push('');
        return newRow;
      });

      // Build table
      let result = '\n\n';
      result += '| ' + normalizedHeader.join(' | ') + ' |\n';
      result += '| ' + normalizedHeader.map(() => '---').join(' | ') + ' |\n';
      normalizedRows.forEach(row => {
        result += '| ' + row.join(' | ') + ' |\n';
      });
      result += '\n';

      return result;
    }

    // Custom rule for underline (TipTap uses <u> tag)
    turndownService.addRule('underline', {
      filter: ['u'],
      replacement: (content: string) => `<u>${content}</u>`,
    });

    // Custom rule for highlight
    turndownService.addRule('highlight', {
      filter: ['mark'],
      replacement: (content: string) => `==${content}==`,
    });

    // Custom rule for colored text - preserve as HTML span
    turndownService.addRule('coloredText', {
      filter: (node: HTMLElement) => {
        return node.nodeName === 'SPAN' && node.style && node.style.color;
      },
      replacement: (content: string, node: HTMLElement) => {
        const color = (node as HTMLElement).style.color;
        if (color) {
          return `<span style="color: ${color}">${content}</span>`;
        }
        return content;
      },
    });

    return (html: string) => {
      if (!html || html.trim() === '' || html === '<p></p>') return '';
      return turndownService.turndown(html);
    };
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'tiptap-table',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight.configure({
        multicolor: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
        },
      }),
      TextStyle,
      Color,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: markdownToHtml(value),
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      const html = editor.getHTML();
      const markdown = htmlToMarkdown(html);
      onChange(markdown);
    },
    onBlur: () => {
      // Appeler le callback onBlur quand l'éditeur perd le focus (auto-save)
      if (onBlur) {
        onBlur();
      }
    },
  });

  // Sync external value changes - only when not internally updating
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      const currentMarkdown = htmlToMarkdown(editor.getHTML());
      // Normalize whitespace for comparison to avoid false positives
      const normalizedValue = value.replace(/\s+/g, ' ').trim();
      const normalizedCurrent = currentMarkdown.replace(/\s+/g, ' ').trim();

      if (normalizedValue !== normalizedCurrent) {
        // Save cursor position
        const { from, to } = editor.state.selection;
        const html = markdownToHtml(value);
        editor.commands.setContent(html, { emitUpdate: false });

        // Restore cursor position (clamped to valid range)
        const maxPos = editor.state.doc.content.size;
        const safeFrom = Math.min(from, maxPos);
        const safeTo = Math.min(to, maxPos);
        editor.commands.setTextSelection({ from: safeFrom, to: safeTo });
      }
    }
    isInternalUpdate.current = false;
  }, [value, editor, markdownToHtml, htmlToMarkdown]);

  // Table menu handlers
  const handleTableMenuOpen = (event?: React.MouseEvent<HTMLButtonElement>) => {
    if (event) {
      setTableMenuAnchor(event.currentTarget);
    }
  };

  const handleTableMenuClose = () => {
    setTableMenuAnchor(null);
  };

  // Heading menu handlers
  const handleHeadingMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setHeadingMenuAnchor(event.currentTarget);
  };

  const handleHeadingMenuClose = () => {
    setHeadingMenuAnchor(null);
  };

  const getCurrentHeadingLabel = () => {
    if (editor?.isActive('heading', { level: 1 })) return 'Titre 1';
    if (editor?.isActive('heading', { level: 2 })) return 'Titre 2';
    if (editor?.isActive('heading', { level: 3 })) return 'Titre 3';
    return 'Normal';
  };

  const insertTable = () => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    handleTableMenuClose();
  };

  const addColumnBefore = () => {
    editor?.chain().focus().addColumnBefore().run();
    handleTableMenuClose();
  };

  const addColumnAfter = () => {
    editor?.chain().focus().addColumnAfter().run();
    handleTableMenuClose();
  };

  const addRowBefore = () => {
    editor?.chain().focus().addRowBefore().run();
    handleTableMenuClose();
  };

  const addRowAfter = () => {
    editor?.chain().focus().addRowAfter().run();
    handleTableMenuClose();
  };

  const deleteColumn = () => {
    editor?.chain().focus().deleteColumn().run();
    handleTableMenuClose();
  };

  const deleteRow = () => {
    editor?.chain().focus().deleteRow().run();
    handleTableMenuClose();
  };

  const deleteTable = () => {
    editor?.chain().focus().deleteTable().run();
    handleTableMenuClose();
  };

  // Link handler
  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL du lien:', previousUrl);

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <Box
      sx={{
        overflow: 'hidden',
      }}
    >
      {/* Toolbar - Floating pill style */}
      {!readOnly && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 0.5,
            p: 1,
            px: 2,
            borderRadius: '50px',
            border: '1px solid',
            borderColor: alpha(theme.palette.divider, 0.5),
            mx: 2,
            my: 1.5,
            bgcolor: alpha(theme.palette.background.paper, 0.95),
            boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
            position: 'sticky',
            top: 8,
            zIndex: 10,
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Undo/Redo */}
          <ToolbarButton
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            tooltip="Annuler"
          >
            <Undo fontSize="small" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            tooltip="Rétablir"
          >
            <Redo fontSize="small" />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Heading dropdown */}
          <Tooltip title="Style de texte" arrow placement="top">
            <IconButton
              size="small"
              onClick={handleHeadingMenuOpen}
              sx={{
                borderRadius: 1,
                px: 1,
                fontSize: '0.8rem',
                fontWeight: 600,
                color: editor.isActive('heading') ? 'primary.main' : 'text.secondary',
                bgcolor: editor.isActive('heading') ? alpha(theme.palette.primary.main, 0.1) : 'transparent',
                minWidth: 70,
                '&:hover': {
                  bgcolor: alpha(theme.palette.action.hover, 0.8),
                },
              }}
            >
              {getCurrentHeadingLabel()} ▾
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={headingMenuAnchor}
            open={Boolean(headingMenuAnchor)}
            onClose={handleHeadingMenuClose}
            slotProps={{
              paper: {
                sx: { mt: 1, minWidth: 140, borderRadius: 2 },
              },
            }}
          >
            <MenuItem
              onClick={() => { editor.chain().focus().setParagraph().run(); handleHeadingMenuClose(); }}
              selected={editor.isActive('paragraph') && !editor.isActive('heading')}
            >
              Normal
            </MenuItem>
            <MenuItem
              onClick={() => { editor.chain().focus().toggleHeading({ level: 1 }).run(); handleHeadingMenuClose(); }}
              selected={editor.isActive('heading', { level: 1 })}
              sx={{ fontWeight: 700, fontSize: '1.1rem' }}
            >
              Titre 1
            </MenuItem>
            <MenuItem
              onClick={() => { editor.chain().focus().toggleHeading({ level: 2 }).run(); handleHeadingMenuClose(); }}
              selected={editor.isActive('heading', { level: 2 })}
              sx={{ fontWeight: 600, fontSize: '1rem' }}
            >
              Titre 2
            </MenuItem>
            <MenuItem
              onClick={() => { editor.chain().focus().toggleHeading({ level: 3 }).run(); handleHeadingMenuClose(); }}
              selected={editor.isActive('heading', { level: 3 })}
              sx={{ fontWeight: 600, fontSize: '0.95rem' }}
            >
              Titre 3
            </MenuItem>
          </Menu>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Text formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            tooltip="Gras (Ctrl+B)"
          >
            <FormatBold fontSize="small" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            tooltip="Italique (Ctrl+I)"
          >
            <FormatItalic fontSize="small" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            isActive={editor.isActive('underline')}
            tooltip="Souligné (Ctrl+U)"
          >
            <FormatUnderlined fontSize="small" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleHighlight().run()}
            isActive={editor.isActive('highlight')}
            tooltip="Surligner"
          >
            <HighlightIcon fontSize="small" />
          </ToolbarButton>

          {/* Text color */}
          <Tooltip title="Couleur du texte" arrow placement="top">
            <Box sx={{ position: 'relative', display: 'inline-flex' }}>
              <IconButton
                size="small"
                sx={{
                  borderRadius: 1,
                  color: 'text.secondary',
                }}
              >
                <FormatColorText fontSize="small" />
              </IconButton>
              <input
                type="color"
                onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                }}
              />
            </Box>
          </Tooltip>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Lists */}
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            tooltip="Liste à puces"
          >
            <FormatListBulleted fontSize="small" />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            tooltip="Liste numérotée"
          >
            <FormatListNumbered fontSize="small" />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Link */}
          <ToolbarButton
            onClick={setLink}
            isActive={editor.isActive('link')}
            tooltip="Lien"
          >
            <LinkIcon fontSize="small" />
          </ToolbarButton>

          {/* Table */}
          <ToolbarButton
            onClick={handleTableMenuOpen}
            isActive={editor.isActive('table')}
            tooltip="Tableau"
          >
            <TableChart fontSize="small" />
          </ToolbarButton>

          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

          {/* Clear formatting */}
          <ToolbarButton
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
            tooltip="Effacer le formatage"
          >
            <FormatClear fontSize="small" />
          </ToolbarButton>
          <Menu
            anchorEl={tableMenuAnchor}
            open={Boolean(tableMenuAnchor)}
            onClose={handleTableMenuClose}
            transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'left', vertical: 'bottom' }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  minWidth: 200,
                  borderRadius: 2,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                },
              },
            }}
          >
            {!editor.isActive('table') ? (
              <MenuItem onClick={insertTable}>
                <ListItemIcon>
                  <AddBox fontSize="small" />
                </ListItemIcon>
                <ListItemText>Insérer un tableau</ListItemText>
              </MenuItem>
            ) : (
              <>
                <MenuItem onClick={addColumnBefore}>
                  <ListItemIcon>
                    <ViewColumn fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Colonne avant</ListItemText>
                </MenuItem>
                <MenuItem onClick={addColumnAfter}>
                  <ListItemIcon>
                    <ViewColumn fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Colonne après</ListItemText>
                </MenuItem>
                <MenuItem onClick={addRowBefore}>
                  <ListItemIcon>
                    <TableRows fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Ligne avant</ListItemText>
                </MenuItem>
                <MenuItem onClick={addRowAfter}>
                  <ListItemIcon>
                    <TableRows fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Ligne après</ListItemText>
                </MenuItem>
                <Divider />
                <MenuItem onClick={deleteColumn}>
                  <ListItemIcon>
                    <DeleteOutline fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText>Supprimer colonne</ListItemText>
                </MenuItem>
                <MenuItem onClick={deleteRow}>
                  <ListItemIcon>
                    <DeleteOutline fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText>Supprimer ligne</ListItemText>
                </MenuItem>
                <MenuItem onClick={deleteTable}>
                  <ListItemIcon>
                    <DeleteOutline fontSize="small" color="error" />
                  </ListItemIcon>
                  <ListItemText>Supprimer tableau</ListItemText>
                </MenuItem>
              </>
            )}
          </Menu>
        </Paper>
      )}

      {/* Editor Content */}
      <Box
        sx={{
          '& .tiptap': {
            minHeight: minHeight,
            // No maxHeight or overflow - let parent handle scrolling
            px: 2.5,
            py: 1.5,
            outline: 'none',

            // Placeholder
            '& p.is-editor-empty:first-child::before': {
              content: 'attr(data-placeholder)',
              float: 'left',
              color: 'text.disabled',
              pointerEvents: 'none',
              height: 0,
            },

            // Typography - tight spacing between blocks
            '& > * + *': {
              marginTop: '0.15em',
            },

            // First child should not have top margin
            '& > *:first-child': {
              marginTop: '0 !important',
            },

            // Headings - very tight spacing
            '& h1': {
              fontSize: '2rem',
              fontWeight: 700,
              color: theme.palette.primary.main,
              borderBottom: `2px solid ${theme.palette.primary.main}`,
              paddingBottom: 2,
              marginBottom: 4,
              marginTop: 6,
              '&:first-child': {
                marginTop: 0,
              },
            },
            '& h2': {
              fontSize: '1.5rem',
              fontWeight: 600,
              color: theme.palette.primary.main,
              marginBottom: 2,
              marginTop: 6,
            },
            '& h3': {
              fontSize: '1.25rem',
              fontWeight: 600,
              color: theme.palette.text.primary,
              marginBottom: 2,
              marginTop: 4,
            },

            // Paragraphs - very compact
            '& p': {
              lineHeight: 1.5,
              color: theme.palette.text.primary,
              margin: 0,
              '&:empty': {
                display: 'none',
              },
            },

            // Lists - minimal indentation, aligned with text
            '& ul, & ol': {
              paddingLeft: '1.5em',
              marginLeft: 0,
              marginTop: 2,
              marginBottom: 4,
              listStylePosition: 'outside',
            },
            '& ul': {
              listStyleType: 'disc',
            },
            '& ol': {
              listStyleType: 'decimal',
            },
            '& li': {
              lineHeight: 1.55,
              marginBottom: 2,
              paddingLeft: 0,
              '& p': {
                display: 'inline',
                margin: 0,
              },
            },
            // Nested lists - small indent
            '& li > ul, & li > ol': {
              paddingLeft: '1em',
              marginTop: 2,
              marginBottom: 2,
            },
            '& li > ul': {
              listStyleType: 'circle',
            },

            // Blockquote - tight
            '& blockquote': {
              borderLeft: `4px solid ${theme.palette.primary.main}`,
              paddingLeft: 8,
              paddingTop: 4,
              paddingBottom: 4,
              marginLeft: 0,
              marginTop: 4,
              marginBottom: 4,
              backgroundColor: alpha(theme.palette.primary.main, 0.04),
              borderRadius: '0 8px 8px 0',
              '& p': {
                margin: 0,
              },
            },

            // Code
            '& code': {
              backgroundColor: alpha(theme.palette.grey[500], 0.1),
              paddingLeft: 6,
              paddingRight: 6,
              paddingTop: 2,
              paddingBottom: 2,
              borderRadius: 4,
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '0.875em',
            },
            '& pre': {
              backgroundColor: '#1e1e1e',
              color: '#d4d4d4',
              padding: 16,
              borderRadius: 8,
              overflow: 'auto',
              '& code': {
                backgroundColor: 'transparent',
                padding: 0,
                color: 'inherit',
              },
            },

            // Highlight
            '& mark': {
              backgroundColor: alpha(theme.palette.warning.main, 0.3),
              paddingLeft: 2,
              paddingRight: 2,
              borderRadius: 2,
            },

            // Links
            '& a, & .tiptap-link': {
              color: theme.palette.primary.main,
              textDecoration: 'underline',
              cursor: 'pointer',
              transition: 'color 0.15s ease',
              '&:hover': {
                color: theme.palette.primary.dark,
              },
            },

            // Tables - compact margins
            '& .tiptap-table, & table': {
              borderCollapse: 'collapse',
              width: '100%',
              marginTop: 4,
              marginBottom: 4,
              border: `1px solid ${theme.palette.divider}`,
              fontSize: '0.875rem',

              '& th, & td': {
                border: `1px solid ${theme.palette.divider}`,
                padding: '6px 10px',
                position: 'relative',
                verticalAlign: 'top',
                minWidth: 50,
                lineHeight: 1.4,

                '& > p': {
                  margin: 0,
                },
              },

              '& th': {
                backgroundColor: theme.palette.primary.main,
                color: 'white',
                fontWeight: 600,
                textAlign: 'left',
                padding: '8px 10px',
              },

              '& tr:nth-of-type(even) td': {
                backgroundColor: alpha(theme.palette.grey[500], 0.05),
              },

              // Selected cells
              '& .selectedCell': {
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  border: `2px solid ${theme.palette.primary.main}`,
                  pointerEvents: 'none',
                },
              },
            },

            // Horizontal rule - minimal spacing
            '& hr': {
              border: 'none',
              borderTop: `2px solid ${theme.palette.divider}`,
              marginTop: 4,
              marginBottom: 4,
            },
          },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Box>
  );
};

export default TipTapEditor;
