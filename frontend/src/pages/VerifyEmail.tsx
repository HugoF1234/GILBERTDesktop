import React, { useState, useEffect } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
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
  VerifiedUser as VerifiedUserIcon,
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import emailService, { EmailVerificationResponse } from '../services/emailService';
import { logger } from '@/utils/logger';

interface VerifyEmailProps {
  email?: string;
  onSuccess?: () => void;
  onBack?: () => void;
}

const VerifyEmail: React.FC<VerifyEmailProps> = ({ email: propEmail, onSuccess, onBack }) => {
  const [email, setEmail] = useState(propEmail || '');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Récupérer l'email depuis les props
  useEffect(() => {
    if (propEmail) {
      setEmail(propEmail);
    }
  }, [propEmail]);

  // Gestion du cooldown pour le renvoi de code
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleSendCode = async () => {
    if (!email) {
      setError('Veuillez saisir votre adresse email');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await emailService.sendVerificationCode(email);
      
      if (response.success) {
        setMessage('Code de vérification envoyé par email');
        setResendCooldown(60); // 60 secondes de cooldown
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email || !code) {
      setError('Veuillez saisir votre email et le code de vérification');
      return;
    }

    if (code.length !== 6) {
      setError('Le code de vérification doit contenir 6 chiffres');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response: EmailVerificationResponse = await emailService.verifyEmail(email, code);
      
      if (response.success) {
        // Si le backend renvoie un token JWT, le stocker pour connecter automatiquement l'utilisateur
        if (response.access_token) {
          localStorage.setItem('auth_token', response.access_token);
          logger.debug('Token JWT stocké après vérification d\'email');
        }
        
        setSuccess(true);
        setMessage('Email vérifié avec succès ! Vous allez être connecté automatiquement...');
        
        // Rediriger vers l'application après 2 secondes
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          }
        }, 2000);
      } else {
        setError(response.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/\D/g, ''); // Seulement les chiffres
    if (value.length <= 6) {
      setCode(value);
    }
  };

  if (success) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Paper
            elevation={3}
            sx={{
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <VerifiedUserIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography component="h1" variant="h4" gutterBottom>
              Email vérifié !
            </Typography>
            <Typography variant="body1" color="text.secondary" textAlign="center">
              Votre adresse email a été vérifiée avec succès.
              <br />
              Vous allez être redirigé vers la page de connexion...
            </Typography>
            <CircularProgress sx={{ mt: 2 }} />
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <EmailIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography component="h1" variant="h4" gutterBottom>
            Vérification d'email
          </Typography>
          <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
            Nous avons envoyé un code de vérification à 6 chiffres à votre adresse email.
            <br />
            Saisissez le code ci-dessous pour vérifier votre email.
          </Typography>

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

          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Adresse email"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailIcon />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            margin="normal"
            required
            fullWidth
            id="code"
            label="Code de vérification"
            name="code"
            value={code}
            onChange={handleCodeChange}
            disabled={loading}
            placeholder="123456"
            inputProps={{
              maxLength: 6,
              style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }
            }}
            sx={{
              '& input': {
                fontFamily: 'monospace',
                fontWeight: 'bold'
              }
            }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            onClick={handleVerifyCode}
            disabled={loading || !email || code.length !== 6}
            startIcon={loading ? <CircularProgress size={20} /> : <VerifiedUserIcon />}
          >
            {loading ? 'Vérification...' : 'Vérifier l\'email'}
          </Button>

          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Button
              variant="outlined"
              onClick={handleSendCode}
              disabled={loading || resendCooldown > 0 || !email}
              startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            >
              {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : 'Renvoyer le code'}
            </Button>

            <Button
              variant="text"
              onClick={() => onBack ? onBack() : window.location.reload()}
              startIcon={<ArrowBackIcon />}
            >
              Retour à la connexion
            </Button>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
            Vous n'avez pas reçu le code ? Vérifiez vos spams ou{' '}
            <Link
              component="button"
              variant="body2"
              onClick={handleSendCode}
              disabled={loading || resendCooldown > 0}
            >
              renvoyez-le
            </Link>
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyEmail;
