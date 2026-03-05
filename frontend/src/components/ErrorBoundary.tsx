/**
 * ErrorBoundary - Capture les erreurs JavaScript dans l'arbre de composants React.
 * Affiche une page d'erreur conviviale en francais au lieu d'un ecran blanc.
 *
 * Deux usages :
 *  1. Global  : enveloppe toute l'application dans main.tsx
 *  2. Par route : utilise comme errorElement dans la config du routeur
 */

import React from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { logger } from '@/utils/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Composant classe (requis pour componentDidCatch)
// ---------------------------------------------------------------------------

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('[ErrorBoundary] Erreur capturee :', error);
    logger.error('[ErrorBoundary] Info composant :', errorInfo.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message={this.state.error?.message}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Fallback UI partage (utilise par le class component ET le route error)
// ---------------------------------------------------------------------------

function ErrorFallback({
  message,
  onReload,
}: {
  message?: string;
  onReload: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        {/* Icone */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
          !
        </div>

        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Une erreur est survenue
        </h1>

        <p className="mb-6 text-sm text-gray-500">
          L'application a rencontre un probleme inattendu. Veuillez recharger la
          page. Si le probleme persiste, contactez le support.
        </p>

        {/* Detail technique (mode dev uniquement) */}
        {message && import.meta.env.DEV && (
          <pre className="mb-6 max-h-32 overflow-auto rounded-lg bg-gray-100 p-3 text-left text-xs text-gray-700">
            {message}
          </pre>
        )}

        <button
          onClick={onReload}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Recharger la page
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route-level error element (pour React Router errorElement)
// ---------------------------------------------------------------------------

export function RouteErrorBoundary() {
  const error = useRouteError();

  let message: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = `${error.status} — ${error.statusText || error.data}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  if (error instanceof Error) {
    logger.error('[RouteErrorBoundary] Erreur capturee :', error);
  }

  const handleReload = () => {
    window.location.reload();
  };

  return <ErrorFallback message={message} onReload={handleReload} />;
}

export default ErrorBoundary;
