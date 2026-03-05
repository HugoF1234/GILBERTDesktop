/**
 * Utilitaires pour sauvegarder des fichiers avec la boîte de dialogue "Enregistrer sous"
 * Utilise Tauri si disponible, sinon File System Access API, sinon fallback sur téléchargement classique
 */

import { saveAs } from 'file-saver';
import { logger } from '@/utils/logger';

// Types pour le File System Access API
interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
}

// Étendre Window pour le File System Access API et Tauri
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    __TAURI__?: {
      dialog: {
        save: (options?: {
          defaultPath?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
        }) => Promise<string | null>;
      };
      fs: {
        writeBinaryFile: (path: string, contents: Uint8Array) => Promise<void>;
      };
    };
  }
}

/**
 * Vérifie si on est dans un environnement Tauri
 */
export function isTauriEnvironment(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

/**
 * Vérifie si le File System Access API est disponible
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showSaveFilePicker' in window;
}

/**
 * Types de fichiers supportés
 */
export const FILE_TYPES = {
  pdf: {
    description: 'Document PDF',
    accept: { 'application/pdf': ['.pdf'] },
  },
  docx: {
    description: 'Document Word',
    accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
  },
  doc: {
    description: 'Document Word (ancien format)',
    accept: { 'application/msword': ['.doc'] },
  },
  markdown: {
    description: 'Document Markdown',
    accept: { 'text/markdown': ['.md'] },
  },
  txt: {
    description: 'Fichier texte',
    accept: { 'text/plain': ['.txt'] },
  },
};

/**
 * Convertit un Blob en Uint8Array
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Filtres de fichiers pour Tauri
 */
const TAURI_FILTERS = {
  pdf: [{ name: 'Document PDF', extensions: ['pdf'] }],
  docx: [{ name: 'Document Word', extensions: ['docx'] }],
  doc: [{ name: 'Document Word (ancien)', extensions: ['doc'] }],
  markdown: [{ name: 'Document Markdown', extensions: ['md'] }],
  txt: [{ name: 'Fichier texte', extensions: ['txt'] }],
};

/**
 * Sauvegarde un fichier avec la boîte de dialogue "Enregistrer sous"
 * @param blob Le blob à sauvegarder
 * @param suggestedName Le nom de fichier suggéré
 * @param fileType Le type de fichier (pour les filtres de la boîte de dialogue)
 * @returns Promise qui se résout quand le fichier est sauvegardé
 */
export async function saveFileWithDialog(
  blob: Blob,
  suggestedName: string,
  fileType: keyof typeof FILE_TYPES
): Promise<void> {
  // Priorité 1: Utiliser Tauri si disponible (via window.__TAURI__ pour éviter les erreurs de build web)
  if (isTauriEnvironment() && window.__TAURI__) {
    try {
      logger.debug('[FileSave] Environnement Tauri détecté, utilisation des APIs natives');

      // Utiliser window.__TAURI__ directement pour éviter les erreurs de build Vite/Rollup
      const tauri = window.__TAURI__;

      // Ouvrir la boîte de dialogue de sauvegarde
      const filePath = await tauri.dialog.save({
        defaultPath: suggestedName,
        filters: TAURI_FILTERS[fileType] || TAURI_FILTERS.txt,
      });

      if (!filePath) {
        logger.debug('[FileSave] Sauvegarde annulée par l\'utilisateur');
        throw new Error('Sauvegarde annulée');
      }

      // Convertir le blob en Uint8Array
      const data = await blobToUint8Array(blob);

      // Écrire le fichier
      await tauri.fs.writeBinaryFile(filePath, data);

      logger.debug('[FileSave] Fichier sauvegardé avec Tauri:', filePath);
      return;
    } catch (error) {
      if ((error as Error).message === 'Sauvegarde annulée') {
        throw error;
      }
      logger.warn('[FileSave] Erreur Tauri, tentative avec File System Access API:', error);
    }
  }

  // Priorité 2: Utiliser le File System Access API
  if (isFileSystemAccessSupported() && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [FILE_TYPES[fileType]],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();

      logger.debug('[FileSave] Fichier sauvegardé avec File System Access API:', suggestedName);
      return;
    } catch (error) {
      // L'utilisateur a annulé ou une erreur s'est produite
      if ((error as Error).name === 'AbortError') {
        logger.debug('[FileSave] Sauvegarde annulée par l\'utilisateur');
        throw new Error('Sauvegarde annulée');
      }
      logger.warn('[FileSave] Erreur File System Access API, fallback sur téléchargement classique:', error);
    }
  }

  // Fallback: téléchargement classique
  logger.debug('[FileSave] Utilisation du téléchargement classique pour:', suggestedName);
  saveAs(blob, suggestedName);
}

/**
 * Sauvegarde un PDF généré par jsPDF avec la boîte de dialogue "Enregistrer sous"
 * @param pdfDoc Le document jsPDF ou tout objet avec méthode output
 * @param suggestedName Le nom de fichier suggéré
 */
export async function savePDFWithDialog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc: any, // Accept jsPDF instance - typing is complex
  suggestedName: string
): Promise<void> {
  // Convertir le PDF en blob
  const pdfBlob = new Blob([pdfDoc.output('arraybuffer')], { type: 'application/pdf' });

  await saveFileWithDialog(pdfBlob, suggestedName, 'pdf');
}
