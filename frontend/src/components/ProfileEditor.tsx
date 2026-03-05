import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  CircularProgress,
  Avatar,
  IconButton,
  Divider,
  Paper,
  Snackbar,
  Stack,
  Card,
} from '@mui/material';
import {
  Close as CloseIcon,
  PhotoCamera as PhotoCameraIcon,
  ContentCopy as ContentCopyIcon,
  Business as BusinessIcon,
  Add as AddIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import { getUserProfile, updateUserProfile, uploadProfilePicture, ProfileData } from '../services/profileService';
import { getMyShareId } from '../services/shareService';
import { getMyOrganizations, joinOrganization, getOrganizationLogoUrl, type Organization } from '../services/organizationService';
import { useNotification } from '../contexts/NotificationContext';
import { logger } from '@/utils/logger';

interface ProfileEditorProps {
  open: boolean;
  onClose: () => void;
  onProfileUpdated?: (profile: ProfileData) => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ open, onClose, onProfileUpdated }) => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [shareId, setShareId] = useState<string>('');
  const [loadingShareId, setLoadingShareId] = useState(false);
  const [showCopiedSnackbar, setShowCopiedSnackbar] = useState(false);

  // Organizations
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [organizationCode, setOrganizationCode] = useState('');
  const [joiningOrganization, setJoiningOrganization] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showErrorPopup, showSuccessPopup } = useNotification();
  
  // Fetch profile on component mount
  useEffect(() => {
    if (open) {
      fetchProfile();
      fetchShareId();
      fetchOrganizations();
    }
  }, [open]);

  const fetchOrganizations = async () => {
    setLoadingOrganizations(true);
    try {
      const orgs = await getMyOrganizations();
      setOrganizations(orgs);
    } catch (error) {
      logger.error('Erreur lors du chargement des organisations:', error);
    } finally {
      setLoadingOrganizations(false);
    }
  };

  const handleJoinOrganization = async () => {
    if (!organizationCode.trim()) {
      showErrorPopup('Erreur', 'Veuillez entrer un code d\'organisation');
      return;
    }

    setJoiningOrganization(true);
    try {
      await joinOrganization(organizationCode.trim().toUpperCase());
      showSuccessPopup('Succès', 'Organisation rejointe avec succès');
      setJoinDialogOpen(false);
      setOrganizationCode('');
      await fetchOrganizations();
    } catch (error: any) {
      logger.error('Erreur lors de la jonction à l\'organisation:', error);
      showErrorPopup('Erreur', error.response?.data?.detail || 'Impossible de rejoindre l\'organisation');
    } finally {
      setJoiningOrganization(false);
    }
  };
  
  const fetchProfile = async () => {
    try {
      setLoading(true);
      const profileData = await getUserProfile();
      setProfile(profileData);
      setFullName(profileData.full_name || '');
      setEmail(profileData.email || '');
    } catch (error) {
      logger.error('Échec du chargement du profil:', error);
      showErrorPopup('Erreur', 'Impossible de charger les informations du profil. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const fetchShareId = async () => {
    try {
      setLoadingShareId(true);
      logger.debug('🔍 Tentative de récupération du share_id...');
      logger.debug('🔍 Utilisateur actuel:', profile?.email);
      const response = await getMyShareId();
      logger.debug('✅ Share_id récupéré:', response.share_id);
      setShareId(response.share_id);
      logger.debug('✅ State mis à jour avec shareId:', response.share_id);
    } catch (error: any) {
      logger.error('❌ Erreur lors de la récupération du share_id:', error);
      // Afficher l'erreur pour aider au débogage
      const errorMessage = error?.response?.data?.detail || error?.message || 'Erreur inconnue';
      logger.error('💥 Détails de l\'erreur:', errorMessage);
      // Pour debug : mettre un message visible
      logger.error('💥 Stack trace:', error?.stack);
    } finally {
      setLoadingShareId(false);
      logger.debug('✅ Loading terminé. ShareId final:', shareId);
    }
  };

  const handleCopyShareId = () => {
    navigator.clipboard.writeText(shareId);
    setShowCopiedSnackbar(true);
    setTimeout(() => setShowCopiedSnackbar(false), 1000);
  };
  
  const handleUpdateProfile = async () => {
    try {
      setLoading(true);
      
      // Vérifier s'il y a des modifications
      const hasChanges = fullName !== (profile?.full_name || '');
      
      if (hasChanges) {
        // Sauvegarder les modifications
        const updatedProfile = await updateUserProfile({
          full_name: fullName
        });
        
        setProfile(updatedProfile);
        
        if (onProfileUpdated) {
          onProfileUpdated(updatedProfile);
        }
      }
      
      // Fermer le dialog dans tous les cas (avec ou sans modifications)
      onClose();
      
    } catch (error) {
      logger.error('Failed to update profile:', error);
      showErrorPopup('Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleProfilePictureClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // Validation du type de fichier
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showErrorPopup('Fichier invalide', 'Veuillez sélectionner une image (JPEG, PNG, GIF ou WEBP).');
      return;
    }
    
    // Validation de la taille du fichier (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showErrorPopup('Fichier trop volumineux', 'Veuillez sélectionner une image de moins de 5 Mo.');
      return;
    }
    
    try {
      setUploadingPhoto(true);
      
      // Créer une URL temporaire pour l'image téléchargée pour un feedback immédiat
      const tempImageUrl = URL.createObjectURL(file);
      
      // Mise à jour temporaire de l'interface utilisateur pendant le chargement
      setProfile(prev => prev ? {...prev, profile_picture_url: tempImageUrl} : prev);
      
      // Appel API réel pour télécharger la photo de profil
      const updatedProfile = await uploadProfilePicture(file);
      
      // Libérer l'URL temporaire
      URL.revokeObjectURL(tempImageUrl);
      
      logger.debug('Profile updated:', updatedProfile);
      
      // Mise à jour du profil avec les données réelles du serveur
      setProfile(updatedProfile);
      // Success toast disabled to streamline UX
      
      if (onProfileUpdated) {
        onProfileUpdated(updatedProfile);
      }
    } catch (error) {
      logger.error('Échec du téléchargement de la photo de profil:', error);
      showErrorPopup('Erreur', 'Impossible de télécharger la photo de profil. Veuillez réessayer.');
    } finally {
      setUploadingPhoto(false);
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        bgcolor: 'primary.main',
        color: 'white',
        py: 2
      }}>
        Modifier mon profil
        <IconButton color="inherit" onClick={onClose} edge="end">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent 
        sx={{ 
          pt: 3, 
          pb: 2,
          maxHeight: '70vh',
          overflowY: 'auto'
        }}
      >
        {loading && !profile ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <Avatar
                  key={profile?.profile_picture_url || Date.now()}
                  src={profile?.profile_picture_url || '/img/avatar.jpg'}
                  alt="Profile"
                  sx={{
                    width: 120,
                    height: 120,
                    border: '4px solid white',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    cursor: 'pointer'
                  }}
                  onClick={handleProfilePictureClick}
                />
                {uploadingPhoto ? (
                  <CircularProgress
                    size={36}
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      bgcolor: 'white',
                      borderRadius: '50%',
                      p: 0.5
                    }}
                  />
                ) : (
                  <IconButton
                    color="primary"
                    sx={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      bgcolor: 'white',
                      '&:hover': {
                        bgcolor: 'white',
                        opacity: 0.9
                      },
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                    onClick={handleProfilePictureClick}
                  >
                    <PhotoCameraIcon />
                  </IconButton>
                )}
              </Box>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Cliquez pour changer la photo de profil
              </Typography>
            </Box>
            
            <Divider sx={{ my: 2 }} />

            {/* Section Share ID - Style sobre et discret */}
            <Box sx={{ mt: 1, mb: 2, p: 1.5, bgcolor: 'rgba(0, 0, 0, 0.02)', borderRadius: 1, border: '1px solid rgba(0, 0, 0, 0.08)' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.875rem', mb: 0.5 }}>
                ID de Partage
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontSize: '0.75rem' }}>
                Partagez cet identifiant pour recevoir des réunions
              </Typography>
              
              {loadingShareId ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : shareId ? (
                <Paper 
                  elevation={0}
                  sx={{ 
                    p: 1, 
                    bgcolor: 'rgba(0, 0, 0, 0.03)',
                    border: '1px solid',
                    borderColor: 'rgba(0, 0, 0, 0.12)',
                    borderRadius: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        fontFamily: 'monospace',
                        letterSpacing: 2,
                        fontWeight: 600,
                        color: 'text.primary',
                        textAlign: 'center',
                        fontSize: '1rem'
                      }}
                    >
                      {shareId}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={handleCopyShareId}
                    disabled={!shareId}
                    sx={{
                      bgcolor: 'rgba(0, 0, 0, 0.04)',
                      color: 'text.secondary',
                      '&:hover': {
                        bgcolor: 'rgba(0, 0, 0, 0.08)',
                      },
                      '&.Mui-disabled': {
                        bgcolor: 'rgba(0, 0, 0, 0.02)',
                        color: 'rgba(0, 0, 0, 0.26)'
                      }
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ) : (
                <Typography variant="caption" color="error" sx={{ textAlign: 'center', display: 'block', fontSize: '0.75rem' }}>
                  Impossible de charger l'ID de partage
                </Typography>
              )}
            </Box>

            <Divider sx={{ my: 3 }} />
            
            <Box sx={{ mt: 2 }}>
              <TextField
                label="Nom complet"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                fullWidth
                margin="normal"
                variant="outlined"
              />
              
              <TextField
                label="Adresse e-mail"
                value={email}
                fullWidth
                margin="normal"
                variant="outlined"
                type="email"
                InputProps={{ readOnly: true }}
                helperText="L'email est défini lors de l'inscription et ne peut pas être modifié."
              />
            </Box>

            {/* Section Organisations */}
            <Divider sx={{ my: 3 }} />
            
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BusinessIcon /> Mes organisations
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setJoinDialogOpen(true)}
                  variant="outlined"
                >
                  Rejoindre
                </Button>
              </Box>

              {loadingOrganizations ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : organizations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  Vous n'appartenez à aucune organisation
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {organizations.map((org) => (
                    <Card key={org.id} variant="outlined" sx={{ p: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {org.logo_url ? (
                          <Avatar
                            src={getOrganizationLogoUrl(org.logo_url)}
                            variant="rounded"
                            sx={{ width: 40, height: 40 }}
                          />
                        ) : (
                          <Avatar variant="rounded" sx={{ width: 40, height: 40, bgcolor: 'primary.main' }}>
                            <BusinessIcon />
                          </Avatar>
                        )}
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body1" fontWeight={600}>
                            {org.name}
                          </Typography>
                          {org.member_count !== undefined && (
                            <Typography variant="caption" color="text.secondary">
                              <PeopleIcon sx={{ fontSize: 12, verticalAlign: 'middle', mr: 0.5 }} />
                              {org.member_count} membres
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={onClose} 
          variant="outlined"
          sx={{ borderRadius: 2 }}
        >
          Annuler
        </Button>
        <Button
          onClick={handleUpdateProfile}
          variant="contained"
          disabled={loading || uploadingPhoto}
          sx={{ 
            borderRadius: 2,
            px: 3,
            bgcolor: 'primary.main',
            '&:hover': {
              bgcolor: 'primary.dark',
            }
          }}
        >
          {loading ? <CircularProgress size={24} /> : 'Enregistrer'}
        </Button>
      </DialogActions>

      {/* Snackbar compact pour confirmation de copie */}
      <Snackbar
        open={showCopiedSnackbar}
        autoHideDuration={1000}
        onClose={() => setShowCopiedSnackbar(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message="Copié"
        sx={{
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            bgcolor: '#3B82F6',
            color: 'white',
            fontWeight: 600,
            borderRadius: 2,
            px: 3,
            py: 1
          }
        }}
      />

      {/* Dialog pour rejoindre une organisation */}
      <Dialog open={joinDialogOpen} onClose={() => setJoinDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Rejoindre une organisation</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Entrez le code d'organisation que vous avez reçu
          </Typography>
          <TextField
            autoFocus
            label="Code d'organisation"
            placeholder="EX: ORG-ABC123"
            value={organizationCode}
            onChange={(e) => setOrganizationCode(e.target.value.toUpperCase())}
            fullWidth
            inputProps={{ style: { textTransform: 'uppercase' } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJoinDialogOpen(false)}>Annuler</Button>
          <Button
            variant="contained"
            onClick={handleJoinOrganization}
            disabled={joiningOrganization || !organizationCode.trim()}
          >
            {joiningOrganization ? <CircularProgress size={24} /> : 'Rejoindre'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default ProfileEditor;

