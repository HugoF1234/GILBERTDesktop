import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Fade,
  Link
} from '@mui/material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import emailService from '../services/emailService';

interface ResetPasswordProps {
  onSuccess?: () => void;
  onBack?: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onSuccess, onBack }) => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token');
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
    } else {
      setError('Token de réinitialisation manquant ou invalide');
    }
  }, [searchParams]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!token) {
      setError('Token de réinitialisation manquant');
      return;
    }

    if (newPassword.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await emailService.resetPassword(token, newPassword);
      
      if (response.success) {
        setSuccess('Mot de passe réinitialisé avec succès ! Vous pouvez maintenant vous connecter.');
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            navigate('/');
          }
        }, 2000);
      } else {
        setError(response.message || 'Erreur lors de la réinitialisation du mot de passe');
      }
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la réinitialisation du mot de passe');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <Box sx={{ 
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        p: 2
      }}>
        <Paper elevation={10} sx={{ 
          p: 4, 
          borderRadius: 3, 
          maxWidth: 400, 
          width: '100%',
          textAlign: 'center'
        }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Token de réinitialisation manquant ou invalide
          </Alert>
          <Button 
            variant="contained" 
            onClick={() => navigate('/')}
            sx={{ mt: 2 }}
          >
            Retour à l'accueil
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      p: 2
    }}>
      <Fade in timeout={1000}>
        <Paper elevation={10} sx={{ 
          p: 4, 
          borderRadius: 3, 
          maxWidth: 400, 
          width: '100%'
        }}>
          <Typography 
            variant="h4" 
            sx={{ 
              fontWeight: 700, 
              textAlign: 'center', 
              mb: 3,
              color: '#2d3748'
            }}
          >
            🔑 Nouveau mot de passe
          </Typography>

          <Typography 
            variant="body1" 
            sx={{ 
              textAlign: 'center', 
              mb: 3, 
              color: '#718096' 
            }}
          >
            Saisissez votre nouveau mot de passe
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <Box component="form" onSubmit={handleResetPassword}>
            <TextField
              fullWidth
              label="Nouveau mot de passe"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              margin="normal"
              required
              disabled={isLoading}
              helperText="Minimum 8 caractères"
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label="Confirmer le mot de passe"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              margin="normal"
              required
              disabled={isLoading}
              sx={{ mb: 3 }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={isLoading}
              sx={{ 
                py: 1.5,
                backgroundColor: '#3b82f6',
                fontSize: '0.95rem',
                fontWeight: 600,
                borderRadius: 2,
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                textTransform: 'none',
                '&:hover': {
                  backgroundColor: '#1d4ed8',
                  boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)',
                },
                mb: 2
              }}
            >
              {isLoading ? <CircularProgress size={20} color="inherit" /> : "Réinitialiser le mot de passe"}
            </Button>

            {onBack && (
              <Box sx={{ textAlign: 'center' }}>
                <Link 
                  component="button" 
                  variant="body2" 
                  onClick={onBack}
                  sx={{ 
                    color: '#3b82f6',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' }
                  }}
                >
                  ← Retour à la connexion
                </Link>
              </Box>
            )}
          </Box>
        </Paper>
      </Fade>
    </Box>
  );
};

export default ResetPassword;
