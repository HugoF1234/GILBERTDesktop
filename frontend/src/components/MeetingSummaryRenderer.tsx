import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Box,
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Divider
} from '@mui/material';

interface MeetingSummaryRendererProps {
  summaryText: string | null;
  isLoading?: boolean;
}

const MeetingSummaryRenderer: React.FC<MeetingSummaryRendererProps> = ({ summaryText, isLoading = false }) => {
  if (isLoading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" p={2}>
        <CircularProgress />
        <Typography variant="body1" sx={{ mt: 2 }}>
          Le résumé est en cours de génération...
        </Typography>
      </Box>
    );
  }

  if (!summaryText) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" p={2}>
        <Typography variant="body1" textAlign="center">
          Aucun résumé n'est disponible pour cette réunion.
        </Typography>
      </Box>
    );
  }

  // Composants personnalisés pour le rendu Markdown avec Material-UI
  const markdownComponents = {
    // Titres
    h1: ({ children, ...props }: any) => (
      <Typography 
        variant="h4" 
        component="h1" 
        fontWeight="bold" 
        color="primary.main"
        sx={{ mt: 3, mb: 2, borderBottom: '2px solid', borderColor: 'primary.main', pb: 1 }}
        {...props}
      >
        {children}
      </Typography>
    ),
    h2: ({ children, ...props }: any) => (
      <Typography 
        variant="h5" 
        component="h2" 
        fontWeight="600" 
        color="primary.main"
        sx={{ mt: 3, mb: 1.5 }}
        {...props}
      >
        {children}
      </Typography>
    ),
    h3: ({ children, ...props }: any) => (
      <Typography 
        variant="h6" 
        component="h3" 
        fontWeight="600"
        sx={{ mt: 2.5, mb: 1 }}
        {...props}
      >
        {children}
      </Typography>
    ),
    h4: ({ children, ...props }: any) => (
      <Typography 
        variant="subtitle1" 
        component="h4" 
        fontWeight="600"
        sx={{ mt: 2, mb: 1 }}
        {...props}
      >
        {children}
      </Typography>
    ),
    h5: ({ children, ...props }: any) => (
      <Typography 
        variant="subtitle2" 
        component="h5" 
        fontWeight="600"
        sx={{ mt: 1.5, mb: 0.5 }}
        {...props}
      >
        {children}
      </Typography>
    ),
    h6: ({ children, ...props }: any) => (
      <Typography 
        variant="body1" 
        component="h6" 
        fontWeight="600"
        sx={{ mt: 1, mb: 0.5 }}
        {...props}
      >
        {children}
      </Typography>
    ),

    // Paragraphes
    p: ({ children, ...props }: any) => (
      <Typography 
        variant="body1" 
        component="p"
        sx={{ mb: 1.5, lineHeight: 1.7 }}
        {...props}
      >
        {children}
      </Typography>
    ),

    // Listes
    ul: ({ children, ...props }: any) => (
      <Box 
        component="ul" 
        sx={{ pl: 3, mb: 2, '& li': { mb: 0.5 } }}
        {...props}
      >
        {children}
      </Box>
    ),
    ol: ({ children, ...props }: any) => (
      <Box 
        component="ol" 
        sx={{ pl: 3, mb: 2, '& li': { mb: 0.5 } }}
        {...props}
      >
        {children}
      </Box>
    ),
    li: ({ children, ...props }: any) => (
      <Typography 
        component="li" 
        variant="body1"
        sx={{ lineHeight: 1.6 }}
        {...props}
      >
        {children}
      </Typography>
    ),

    // Tableaux - rendu avec Material-UI
    table: ({ children, ...props }: any) => (
      <TableContainer component={Paper} sx={{ mb: 3, mt: 2 }}>
        <Table size="small" {...props}>
          {children}
        </Table>
      </TableContainer>
    ),
    thead: ({ children, ...props }: any) => (
      <TableHead sx={{ backgroundColor: 'primary.main' }} {...props}>
        {children}
      </TableHead>
    ),
    tbody: ({ children, ...props }: any) => (
      <TableBody {...props}>
        {children}
      </TableBody>
    ),
    tr: ({ children, ...props }: any) => (
      <TableRow 
        sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}
        {...props}
      >
        {children}
      </TableRow>
    ),
    th: ({ children, ...props }: any) => (
      <TableCell 
        sx={{ 
          fontWeight: 'bold', 
          color: 'white',
          backgroundColor: 'primary.main',
          whiteSpace: 'nowrap'
        }}
        {...props}
      >
        {children}
      </TableCell>
    ),
    td: ({ children, ...props }: any) => (
      <TableCell 
        sx={{ 
          py: 1.5,
          verticalAlign: 'top'
        }}
        {...props}
      >
        {children}
      </TableCell>
    ),

    // Séparateurs
    hr: () => (
      <Divider sx={{ my: 3 }} />
    ),

    // Gras et italique
    strong: ({ children, ...props }: any) => (
      <Box component="strong" sx={{ fontWeight: 'bold' }} {...props}>
        {children}
      </Box>
    ),
    em: ({ children, ...props }: any) => (
      <Box component="em" sx={{ fontStyle: 'italic' }} {...props}>
        {children}
      </Box>
    ),

    // Citations
    blockquote: ({ children, ...props }: any) => (
      <Paper 
        elevation={0}
        sx={{ 
          borderLeft: '4px solid',
          borderColor: 'primary.main',
          pl: 2,
          py: 1,
          my: 2,
          backgroundColor: 'grey.50'
        }}
        {...props}
      >
        {children}
      </Paper>
    ),

    // Code inline
    code: ({ inline, children, ...props }: any) => {
      if (inline) {
        return (
          <Box 
            component="code" 
            sx={{ 
              backgroundColor: 'grey.100',
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
              fontFamily: 'monospace',
              fontSize: '0.9em'
            }}
            {...props}
          >
            {children}
          </Box>
        );
      }
      return (
        <Paper 
          elevation={0}
          sx={{ 
            p: 2, 
            my: 2,
            backgroundColor: 'grey.100',
            overflow: 'auto'
          }}
        >
          <Box 
            component="code" 
            sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
            {...props}
          >
            {children}
          </Box>
        </Paper>
      );
    },

    // Liens
    a: ({ href, children, ...props }: any) => (
      <Box 
        component="a" 
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ 
          color: 'primary.main',
          textDecoration: 'underline',
          '&:hover': { color: 'primary.dark' }
        }}
        {...props}
      >
        {children}
      </Box>
    ),
  };

  return (
    <Box sx={{ p: 2 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {summaryText}
      </ReactMarkdown>
    </Box>
  );
};

export default MeetingSummaryRenderer;
