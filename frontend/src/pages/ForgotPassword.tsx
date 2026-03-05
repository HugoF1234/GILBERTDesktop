import React, { useState } from 'react';
// import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  InputAdornment,
  Link
} from '@mui/material';
import {
  Email as EmailIcon,
  ArrowBack as ArrowBackIcon,
  Send as SendIcon
} from '@mui/icons-material';
import emailService from '../services/emailService';

interface ForgotPasswordProps {
  onBack?: () => void;
}

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBack }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!email) {
      setError('Veuillez saisir votre adresse email');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await emailService.forgotPassword(email);
      
      if (response.success) {
        setMessage(response.message);
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Pattern */}
      <Box sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: `
          radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
          radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 80%, rgba(120, 119, 198, 0.2) 0%, transparent 50%)
        `,
        zIndex: 0
      }} />
      
      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center'
        }}>
          <Paper elevation={24} sx={{ 
            p: 4, 
            width: '100%', 
            maxWidth: 400,
            borderRadius: 4,
            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <EmailIcon sx={{ 
              fontSize: 48, 
              color: '#3b82f6', 
              mb: 2,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              borderRadius: '50%',
              p: 1,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }} />
            <Typography component="h1" variant="h4" sx={{ 
              fontWeight: 700, 
              color: '#1e293b',
              mb: 1
            }}>
              Mot de passe oublié ?
            </Typography>
            <Typography variant="body1" sx={{ 
              color: '#64748b',
              fontSize: '0.95rem',
              lineHeight: 1.6
            }}>
              Pas de problème ! Saisissez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
            </Typography>
          </Box>

          {message && (
            <Alert severity="success" sx={{ width: '100%', mb: 2 }}>
              {message}
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              fullWidth
              id="email"
              label="Adresse email *"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  backgroundColor: '#f8fafc',
                  '& fieldset': {
                    borderColor: '#e2e8f0',
                  },
                  '&:hover fieldset': {
                    borderColor: '#cbd5e1',
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: '#3b82f6',
                  },
                },
                '& .MuiInputLabel-root': {
                  color: '#64748b',
                  '&.Mui-focused': {
                    color: '#3b82f6',
                  }
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon sx={{ color: '#94a3b8' }} />
                  </InputAdornment>
                ),
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || !email}
              sx={{
                py: 1.5,
                mb: 2,
                borderRadius: 2,
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 14px 0 rgba(59, 130, 246, 0.39)',
                textTransform: 'none',
                fontSize: '1rem',
                fontWeight: 600,
                '&:hover': {
                  background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
                  boxShadow: '0 6px 20px 0 rgba(59, 130, 246, 0.5)',
                },
                '&:disabled': {
                  background: '#e2e8f0',
                  color: '#94a3b8',
                  boxShadow: 'none'
                }
              }}
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            >
              {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Link
                component="button"
                variant="body2"
                onClick={() => onBack ? onBack() : window.location.reload()}
                sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1, 
                  mx: 'auto',
                  color: '#3b82f6',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: 500,
                  '&:hover': {
                    textDecoration: 'underline',
                    color: '#1d4ed8'
                  }
                }}
              >
                <ArrowBackIcon fontSize="small" />
                Retour à la connexion
              </Link>
            </Box>
          </Box>

          <Typography variant="body2" sx={{ 
            mt: 3, 
            textAlign: 'center',
            color: '#64748b',
            fontSize: '0.9rem'
          }}>
            Vous vous souvenez de votre mot de passe ?{' '}
            <Link
              component="button"
              variant="body2"
              onClick={() => onBack ? onBack() : window.location.reload()}
              sx={{
                color: '#3b82f6',
                textDecoration: 'none',
                fontWeight: 500,
                '&:hover': {
                  textDecoration: 'underline',
                  color: '#1d4ed8'
                }
              }}
            >
              Se connecter
            </Link>
          </Typography>
          </Paper>
        </Box>
      </Container>
    </Box>
  );
};

export default ForgotPassword;
