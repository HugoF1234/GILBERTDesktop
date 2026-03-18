/**
 * Service de vérification des mises à jour Gilbert Desktop (Tauri)
 * Vérifie au démarrage si une nouvelle version est disponible.
 */

import { checkUpdate, installUpdate, onUpdaterEvent } from '@tauri-apps/api/updater';
import { relaunch } from '@tauri-apps/api/process';
import { logger } from '@/utils/logger';

const isTauriEnv =
  typeof (window as any).__TAURI_IPC__ !== 'undefined' ||
  typeof (window as any).__TAURI__ !== 'undefined' ||
  typeof (window as any).__TAURI_METADATA__ !== 'undefined';

/**
 * Vérifie si une mise à jour est disponible et la propose à l'utilisateur.
 * Utilise le dialog natif Tauri (configuré dans tauri.conf.json) si dialog: true.
 * Sinon, gère manuellement via l'API.
 */
export async function checkForUpdates(): Promise<void> {
  if (!isTauriEnv) return;

  try {
    const { shouldUpdate, manifest } = await checkUpdate();

    if (shouldUpdate && manifest) {
      logger.info(`[Updater] Nouvelle version disponible : ${manifest.version}`);
      // Avec dialog: true dans tauri.conf.json, Tauri affiche automatiquement
      // le dialog de mise à jour. On n'a pas besoin d'appeler installUpdate ici
      // car le dialog le fait. Mais si dialog: false, il faudrait le faire manuellement.
      // Pour l'instant, on laisse le dialog gérer.
    }
  } catch (error) {
    // Erreur non bloquante (réseau, pas de mise à jour, etc.)
    logger.debug('[Updater] Vérification mise à jour:', error);
  }
}

/**
 * Installe la mise à jour et relance l'app (pour usage custom si dialog: false).
 */
export async function installAndRelaunch(): Promise<void> {
  if (!isTauriEnv) return;

  try {
    await installUpdate();
    await relaunch();
  } catch (error) {
    logger.error('[Updater] Erreur installation:', error);
    throw error;
  }
}

/**
 * Écoute les événements de l'updater (pour debug ou UI custom).
 */
export function listenUpdaterEvents(): () => void {
  if (!isTauriEnv) return () => {};

  const unlistenPromise = onUpdaterEvent(({ event, data }) => {
    logger.debug('[Updater] Event:', event, data);
  });

  return () => {
    unlistenPromise.then((fn) => fn()).catch(() => {});
  };
}
