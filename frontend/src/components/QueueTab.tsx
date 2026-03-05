/**
 * QueueTab - Onglet de gestion de la file d'attente
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Trash2,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import sounds from '../utils/soundDesign';

interface QueueTabProps {
  queueStatus: any;
  systemHealth: any;
  loading: boolean;
  onRefresh: () => void;
  onClearQueue: () => void;
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

const QueueTab: React.FC<QueueTabProps> = ({
  queueStatus,
  systemHealth,
  loading,
  onRefresh,
  onClearQueue,
}) => {
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

  const getHealthBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-emerald-500 text-white">Sain</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-amber-500 text-white">Avertissement</Badge>;
      case 'critical':
        return <Badge variant="destructive">Critique</Badge>;
      default:
        return <Badge variant="secondary">Inconnu</Badge>;
    }
  };

  const handleRefresh = () => {
    sounds.click();
    onRefresh();
  };

  const handleClearQueue = () => {
    sounds.click();
    onClearQueue();
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Actions */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Actualiser
          </Button>
          {queueStatus?.size > 0 && (
            <Button
              variant="destructive"
              onClick={handleClearQueue}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Vider la queue
            </Button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* État de santé du système */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                État de santé
              </CardTitle>
            </CardHeader>
            <CardContent>
              {systemHealth ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {getHealthBadge(systemHealth.health?.status)}
                    <p className="text-3xl font-bold text-slate-900">
                      {systemHealth.health?.score || 0}%
                    </p>
                  </div>
                  {systemHealth.health?.issues && systemHealth.health.issues.length > 0 && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-amber-900 mb-2">Problèmes détectés :</p>
                      <ul className="text-sm text-amber-700 list-disc list-inside space-y-1">
                        {systemHealth.health.issues.map((issue: string, index: number) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Statistiques de la queue */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-500" />
                File d'attente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {queueStatus ? (
                <div className="space-y-2">
                  <p className="text-3xl font-bold text-slate-900">
                    {queueStatus.size || 0}
                  </p>
                  <p className="text-sm text-slate-500">
                    Tâches en attente
                  </p>
                  {queueStatus.oldest_task && (
                    <p className="text-xs text-slate-500 mt-2">
                      Plus ancienne : {formatDate(queueStatus.oldest_task)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Détails de la queue */}
      {queueStatus?.queue_files && queueStatus.queue_files.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Fichiers dans la queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Réunion ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Utilisateur</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Fichier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Créé le</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {queueStatus.queue_files.map((file: any, index: number) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <code className="text-xs text-slate-600">
                            {file.meeting_id?.substring(0, 8)}...
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-slate-600">
                            {file.user_id?.substring(0, 8)}...
                          </code>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-900">{file.file_name}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">
                            {file.created_at ? formatDate(file.created_at) : 'N/A'}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Message si queue vide */}
      {queueStatus?.size === 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-slate-900 mb-2">
                  Aucune tâche en attente
                </p>
                <p className="text-sm text-slate-500">
                  La file d'attente est vide. Toutes les transcriptions sont traitées.
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
};

export default QueueTab;
