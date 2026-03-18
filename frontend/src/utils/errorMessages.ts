/**
 * Mapping des erreurs techniques vers des messages utilisateur clairs.
 * Évite d'afficher des codes HTTP ou des messages techniques aux utilisateurs.
 */

/**
 * Convertit une erreur technique en message utilisateur compréhensible.
 */
export function toUserFriendlyMessage(error: unknown): string {
  if (error === null || error === undefined) {
    return 'Une erreur inattendue est survenue.';
  }

  const message = error instanceof Error ? error.message : String(error);
  const msgLower = message.toLowerCase();

  // Erreurs d'authentification
  if (
    msgLower.includes('401') ||
    msgLower.includes('not authenticated') ||
    msgLower.includes('unauthorized')
  ) {
    return 'Votre session a expiré. Veuillez vous reconnecter.';
  }

  if (msgLower.includes('403') || msgLower.includes('forbidden')) {
    return "Vous n'avez pas les droits pour effectuer cette action.";
  }

  // Erreurs réseau
  if (
    msgLower.includes('failed to fetch') ||
    msgLower.includes('network') ||
    msgLower.includes('network connection error') ||
    msgLower.includes('networkconnectionerror')
  ) {
    return 'Impossible de se connecter au serveur. Vérifiez votre connexion internet.';
  }

  if (msgLower.includes('offline') || msgLower.includes('navigator.online')) {
    return 'Vous êtes hors ligne. Vérifiez votre connexion internet.';
  }

  // Erreurs serveur
  if (msgLower.includes('500') || msgLower.includes('internal server error')) {
    return 'Le serveur rencontre un problème. Veuillez réessayer plus tard.';
  }

  if (msgLower.includes('502') || msgLower.includes('503') || msgLower.includes('service unavailable')) {
    return 'Le service est temporairement indisponible. Veuillez réessayer dans quelques instants.';
  }

  if (msgLower.includes('504') || msgLower.includes('gateway timeout')) {
    return 'La requête a pris trop de temps. Veuillez réessayer.';
  }

  // Erreurs de ressource
  if (msgLower.includes('404') || msgLower.includes('not found')) {
    return 'La ressource demandée est introuvable.';
  }

  if (msgLower.includes('413') || msgLower.includes('payload too large')) {
    return 'Le fichier est trop volumineux.';
  }

  // Erreurs de quota / limite
  if (msgLower.includes('quota') || msgLower.includes('limit')) {
    return 'La limite autorisée a été atteinte.';
  }

  // Messages déjà en français et compréhensibles — les garder
  if (
    message.startsWith('Pas de connexion') ||
    message.includes('sauvegardé localement') ||
    message.includes('réseau') ||
    message.includes('connexion')
  ) {
    return message;
  }

  // Fallback : message générique pour éviter d'afficher des détails techniques
  return 'Une erreur est survenue. Veuillez réessayer.';
}
