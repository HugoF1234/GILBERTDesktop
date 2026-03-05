import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { isAuthenticated, getUserProfile, verifyTokenValidity } from '../services/authService';

interface AdminRouteProps {
  children: React.ReactNode;
}

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'admin@lexiapro.fr').split(',').map((e: string) => e.trim().toLowerCase());

interface AdminCheckState {
  loading: boolean;
  isAdmin: boolean;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const location = useLocation();
  const [state, setState] = useState<AdminCheckState>({ loading: true, isAdmin: false });

  useEffect(() => {
    const checkAdmin = async (): Promise<void> => {
      // Use centralized token validation (with debounce + 30s cache)
      const isValid = await verifyTokenValidity();
      if (!isValid) {
        // verifyTokenValidity already handled logout + redirect to /auth
        setState({ loading: false, isAdmin: false });
        return;
      }

      try {
        const user = await getUserProfile();
        const isAdmin = ADMIN_EMAILS.includes(user.email?.toLowerCase());
        setState({ loading: false, isAdmin });
      } catch {
        setState({ loading: false, isAdmin: false });
      }
    };

    checkAdmin();
  }, []);

  if (state.loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated()) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (!state.isAdmin) {
    return (
      <Box p={3}>
        <Alert severity="error">
          Accès refusé. Cette page est réservée aux administrateurs.
        </Alert>
      </Box>
    );
  }

  return <>{children}</>;
};

export default AdminRoute;
