/**
 * NotFound - Page 404 affichee lorsqu'aucune route ne correspond a l'URL.
 * Design coherent avec le ErrorBoundary existant.
 */

import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg text-center">
        {/* Icone */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-3xl font-bold text-blue-600">
          ?
        </div>

        <h1 className="mb-2 text-xl font-semibold text-gray-900">
          Page introuvable
        </h1>

        <p className="mb-6 text-sm text-gray-500">
          La page que vous recherchez n'existe pas ou a ete deplacee.
          Verifiez l'adresse ou retournez a l'accueil.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white! transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Retour a l'accueil
        </Link>
      </div>
    </div>
  );
}
