import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  Radio,
  CircularProgress,
  Typography,
  Box,
  Divider
} from '@mui/material';
import { Client, getClients } from '../services/clientService';
import { logger } from '@/utils/logger';

interface TemplateSelectorModalProps {
  open: boolean;
  onClose: () => void;
  onTemplateSelect: (clientId: string | null, templateType?: 'formation' | 'default' | null) => void;
  meetingId: string;
}

const TemplateSelectorModal: React.FC<TemplateSelectorModalProps> = ({
  open,
  onClose,
  onTemplateSelect,
  meetingId
}) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplateType, setSelectedTemplateType] = useState<'formation' | 'default' | null>('default');

  // Charger la liste des clients au montage du composant
  useEffect(() => {
    if (open) {
      loadClients();
      // Préselectionner le type de template depuis la préférence locale si disponible
      try {
        const pref = localStorage.getItem('default_template_type');
        if (pref === 'formation' || pref === 'default') {
          setSelectedTemplateType(pref as 'formation' | 'default');
        }
      } catch {}
    }
  }, [open]);

  const loadClients = async () => {
    try {
      setLoading(true);
      setError(null);
      const clientsList = await getClients();
      setClients(clientsList);
    } catch (err) {
      logger.error('Erreur lors du chargement des clients:', err);
      setError('Impossible de charger la liste des clients. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelect = (clientId: string | null) => {
    logger.debug(`Selected client template: ${clientId || 'default template'}`);
    setSelectedClientId(clientId);
  };

  const handleConfirm = () => {
    logger.debug(`Confirming template selection for meeting ${meetingId}: ${selectedClientId || 'default template'} / ${selectedTemplateType}`);
    onTemplateSelect(selectedClientId, selectedTemplateType || undefined);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sélectionner un template pour le résumé</DialogTitle>
      
      <DialogContent>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" p={3}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Typography color="error" align="center" p={2}>
            {error}
          </Typography>
        ) : (
          <>
            <Typography variant="body1" gutterBottom>
              Choisissez le template à utiliser pour générer le résumé de votre réunion.
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Templates intégrés</Typography>
              <List>
                <ListItem disablePadding>
                  <ListItemButton onClick={() => setSelectedTemplateType('default')}>
                    <Radio 
                      checked={selectedTemplateType === 'default'} 
                      onChange={() => setSelectedTemplateType('default')}
                    />
                    <ListItemText 
                      primary="Par défaut" 
                      secondary="Format standard actuel"
                    />
                  </ListItemButton>
                </ListItem>
                <ListItem disablePadding>
                  <ListItemButton onClick={() => setSelectedTemplateType('formation')}>
                    <Radio 
                      checked={selectedTemplateType === 'formation'} 
                      onChange={() => setSelectedTemplateType('formation')}
                    />
                    <ListItemText 
                      primary="Formation" 
                      secondary="Adapté aux sessions de formation"
                    />
                  </ListItemButton>
                </ListItem>
              </List>
            </Box>
            
            <List>
              <ListItem disablePadding>
                <ListItemButton onClick={() => handleClientSelect(null)}>
                  <Radio 
                    checked={selectedClientId === null} 
                    onChange={() => handleClientSelect(null)}
                  />
                  <ListItemText 
                    primary="Template par défaut" 
                    secondary="Utilise le format standard pour tous les résumés"
                  />
                </ListItemButton>
              </ListItem>
              
              <Divider component="li" />
              
              {clients.map((client) => (
                <ListItem key={client.id} disablePadding>
                  <ListItemButton onClick={() => handleClientSelect(client.id)}>
                    <Radio 
                      checked={selectedClientId === client.id} 
                      onChange={() => handleClientSelect(client.id)}
                    />
                    <ListItemText 
                      primary={client.name} 
                      secondary={`Template personnalisé pour ${client.name}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Annuler
        </Button>
        <Button 
          onClick={handleConfirm} 
          color="primary" 
          variant="contained"
          disabled={loading}
        >
          Générer le résumé
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateSelectorModal;
