/**
 * ActivityTab - Onglet d'activité récente
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  RotateCcw,
  XCircle,
  Trash2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import sounds from '../utils/soundDesign';
import apiClient from '../services/apiClient';

interface ActivityTabProps {
  queueHistory: any[];
  loading: boolean;
  onRefresh: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100, damping: 12 } },
};

const ActivityTab: React.FC<ActivityTabProps> = ({
  queueHistory,
  loading,
  onRefresh,
}) => {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryMessage, setRetryMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }
      return date.toLocaleString('fr-FR');
    } catch {
      return 'Date invalide';
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds == null || seconds === undefined) return 'N/A';
    const sec = Number(seconds);
    if (isNaN(sec) || sec < 0) return 'N/A';
    const minutes = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    if (minutes > 0) return `${minutes}min`;
    return secs > 0 ? `${secs}s` : '0min';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-emerald-500 text-white">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Terminé
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="default" className="bg-amber-500 text-white">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            En cours
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            En attente
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erreur
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="bg-red-600">
            <XCircle className="w-3 h-3 mr-1" />
            Échoué
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleRefresh = () => {
    sounds.click();
    onRefresh();
  };

  const handleRetry = async (meetingId: string) => {
    sounds.click();
    setRetryingId(meetingId);
    setRetryMessage(null);
    try {
      const response = await apiClient.post<{ message: string }>(`/admin/transcriptions/${meetingId}/retry`);
      setRetryMessage({ type: 'success', text: response.message || 'Transcription relancée' });
      sounds.success();
      // Rafraîchir immédiatement pour afficher "En attente"
      onRefresh();
      // Puis rafraîchir après 3s et 6s pour voir processing/completed
      setTimeout(() => onRefresh(), 3000);
      setTimeout(() => onRefresh(), 6000);
      setTimeout(() => {
        setRetryMessage(null);
      }, 2000);
    } catch (error: any) {
      const msg = typeof error?.detail === 'string' ? error.detail : error?.detail?.msg || error?.message || 'Erreur lors du retry';
      setRetryMessage({ type: 'error', text: msg });
      sounds.error();
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAll = async () => {
    sounds.click();
    setRetryingAll(true);
    setRetryMessage(null);
    try {
      const response = await apiClient.post<{ message: string; retried: number }>('/admin/transcriptions/retry-all');
      setRetryMessage({
        type: 'success',
        text: response.message || `${response.retried} transcription(s) relancée(s)`
      });
      sounds.success();
      onRefresh();
      setTimeout(() => onRefresh(), 3000);
      setTimeout(() => onRefresh(), 6000);
      setTimeout(() => setRetryMessage(null), 2000);
    } catch (error: any) {
      const msg = typeof error?.detail === 'string' ? error.detail : error?.detail?.msg || error?.message || 'Erreur lors du retry en masse';
      setRetryMessage({ type: 'error', text: msg });
      sounds.error();
    } finally {
      setRetryingAll(false);
    }
  };

  const handleCleanupAudio = async () => {
    if (!window.confirm('Nettoyage RGPD : suppression des audios des réunions non complétées après 72 h, et mise à jour de l’affichage pour les réunions dont le fichier est déjà absent (colonne « Audio » → « Supprimé »). Continuer ?')) return;
    sounds.click();
    setCleanupLoading(true);
    setCleanupMessage(null);
    try {
      const response = await apiClient.post<{ message: string; deleted_count?: number; sync_count?: number }>('/admin/audio/cleanup-now');
      setCleanupMessage({
        type: 'success',
        text: response.message || 'Nettoyage audio effectué.'
      });
      sounds.success();
      onRefresh();
      setTimeout(() => onRefresh(), 800);
      setTimeout(() => setCleanupMessage(null), 5000);
    } catch (error: any) {
      const msg = typeof error?.detail === 'string' ? error.detail : error?.detail?.msg || error?.message || 'Erreur lors du nettoyage audio';
      setCleanupMessage({ type: 'error', text: msg });
      sounds.error();
    } finally {
      setCleanupLoading(false);
    }
  };

  /** Relancer : erreur/échec, ou en attente, ou en cours depuis trop longtemps (>10 min) */
  const canRetry = (transcription: { transcript_status: string; created_at?: string | null }) => {
    const status = transcription.transcript_status;
    if (['error', 'failed'].includes(status)) return true;
    if (status === 'pending') return true;
    if (status === 'processing' && transcription.created_at) {
      try {
        const created = new Date(transcription.created_at).getTime();
        const tenMinAgo = Date.now() - 10 * 60 * 1000;
        return created < tenMinAgo;
      } catch {
        return false;
      }
    }
    return false;
  };

  const completedCount = queueHistory.filter(t => t.transcript_status === 'completed').length;
  const failedCount = queueHistory.filter(t => ['error', 'failed'].includes(t.transcript_status)).length;
  const pendingCount = queueHistory.filter(t => ['pending', 'processing'].includes(t.transcript_status)).length;
  const retryableCount = queueHistory.filter(t => canRetry(t)).length;
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Polling automatique quand des transcriptions sont en attente ou en cours
  useEffect(() => {
    if (pendingCount > 0 && !loading) {
      pollIntervalRef.current = setInterval(() => onRefreshRef.current(), 5000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [pendingCount, loading]);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Actions */}
      <motion.div variants={itemVariants} className="flex flex-wrap gap-3 items-center">
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Actualiser
        </Button>

        {retryableCount > 0 && (
          <Button
            variant="destructive"
            onClick={handleRetryAll}
            disabled={retryingAll || loading}
          >
            {retryingAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4 mr-2" />
            )}
            Relancer tout ({retryableCount})
          </Button>
        )}

        <Button
          variant="outline"
          onClick={handleCleanupAudio}
          disabled={cleanupLoading || loading}
          className="text-slate-600 border-slate-300"
          title="Supprimer les fichiers audio des réunions non complétées après 72 h (RGPD)"
        >
          {cleanupLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2" />
          )}
          Supprimer les audios (RGPD)
        </Button>

        {cleanupMessage && (
          <Badge
            variant={cleanupMessage.type === 'success' ? 'default' : 'destructive'}
            className={cn(
              "px-3 py-1",
              cleanupMessage.type === 'success' && "bg-emerald-500"
            )}
          >
            {cleanupMessage.type === 'success' ? (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            ) : (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {cleanupMessage.text}
          </Badge>
        )}

        {retryMessage && (
          <Badge
            variant={retryMessage.type === 'success' ? 'default' : 'destructive'}
            className={cn(
              "ml-2 px-3 py-1",
              retryMessage.type === 'success' && "bg-emerald-500"
            )}
          >
            {retryMessage.type === 'success' ? (
              <CheckCircle2 className="w-3 h-3 mr-1" />
            ) : (
              <AlertCircle className="w-3 h-3 mr-1" />
            )}
            {retryMessage.text}
          </Badge>
        )}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Statistiques générales */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-blue-500" />
                Activité récente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-900 mb-1">
                {queueHistory.length}
              </p>
              <p className="text-sm text-slate-500">
                Transcriptions récentes
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Statut des transcriptions */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Terminées
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-emerald-600 mb-1">
                {completedCount}
              </p>
              <p className="text-sm text-slate-500">
                sur {queueHistory.length} total
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Transcriptions en erreur */}
        <motion.div variants={itemVariants}>
          <Card className={cn("border-slate-200", failedCount > 0 && "border-red-300 bg-red-50/50")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className={cn("w-5 h-5", failedCount > 0 ? "text-red-500" : "text-slate-400")} />
                En erreur
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn("text-3xl font-bold mb-1", failedCount > 0 ? "text-red-600" : "text-slate-400")}>
                {failedCount}
              </p>
              <p className="text-sm text-slate-500">
                {failedCount > 0 ? "À relancer" : "Aucune erreur"}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Historique des transcriptions */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Historique des transcriptions récentes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queueHistory.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-sm text-slate-500">Aucune transcription récente</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Réunion</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Utilisateur</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Statut Transcription</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Statut Résumé</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Audio</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Durée</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Créé le</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {queueHistory.map((transcription, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-900">{transcription.title || 'Sans titre'}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm text-slate-900">
                              {transcription.user_name || transcription.user_email || 'Utilisateur inconnu'}
                            </p>
                            {transcription.user_email && transcription.user_name && (
                              <p className="text-xs text-slate-500">
                                {transcription.user_email}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(transcription.transcript_status)}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(transcription.summary_status || 'N/A')}
                        </td>
                        <td className="px-4 py-3">
                          {transcription.audio_deleted_at ? (
                            <Badge variant="secondary" className="text-xs font-normal">
                              Supprimé
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs font-normal text-slate-600">
                              Présent
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">
                            {formatDuration(transcription.duration_seconds ?? transcription.audio_duration)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">
                            {formatDate(transcription.created_at)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {canRetry(transcription) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetry(transcription.id)}
                              disabled={retryingId === transcription.id || retryingAll}
                              className="text-xs"
                            >
                              {retryingId === transcription.id ? (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <RotateCcw className="w-3 h-3 mr-1" />
                              )}
                              Retry
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default ActivityTab;
