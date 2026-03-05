/**
 * RecordingsTab - Onglet des enregistrements actifs
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Mic,
  Smartphone,
  Monitor,
  Laptop,
  Clock,
  Loader2,
  User,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import sounds from '../utils/soundDesign';

interface RecordingsTabProps {
  activeRecordings: any[];
  loading: boolean;
  onRefresh: () => void;
  errorMessage?: string | null;
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

const RecordingsTab: React.FC<RecordingsTabProps> = ({
  activeRecordings,
  loading,
  onRefresh,
  errorMessage = null,
}) => {
  // Normaliser les dates ISO - ajouter 'Z' si pas de timezone pour forcer UTC
  const normalizeISODate = (dateString: string): string => {
    if (!dateString) return dateString;
    // Si la date n'a pas de 'Z' et pas de '+' (timezone), c'est UTC sans indicateur
    if (!dateString.endsWith('Z') && !dateString.includes('+')) {
      return dateString + 'Z';
    }
    return dateString;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
      const normalizedDate = normalizeISODate(dateString);
      const date = new Date(normalizedDate);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }
      return date.toLocaleString('fr-FR');
    } catch {
      return 'Date invalide';
    }
  };

  const formatDuration = (startedAt: string | null | undefined) => {
    if (!startedAt) return '0s';

    try {
      const normalizedDate = normalizeISODate(startedAt);
      const start = new Date(normalizedDate);
      if (isNaN(start.getTime())) {
        return '0s';
      }

      const now = new Date();
      const diffMs = now.getTime() - start.getTime();

      if (diffMs < 0) return '0s';

      const diffMinutes = Math.floor(diffMs / 60000);
      const diffSeconds = Math.floor((diffMs % 60000) / 1000);

      if (diffMinutes > 0) {
        return `${diffMinutes}min ${diffSeconds}s`;
      }
      return `${diffSeconds}s`;
    } catch {
      return '0s';
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    switch (deviceType) {
      case 'mobile':
      case 'ios':
      case 'android':
        return <Smartphone className="w-4 h-4" />;
      case 'desktop':
        return <Laptop className="w-4 h-4" />;
      case 'web':
        return <Monitor className="w-4 h-4" />;
      default:
        return <Mic className="w-4 h-4" />;
    }
  };

  const getDeviceBadge = (deviceType?: string) => {
    const icon = getDeviceIcon(deviceType);
    return (
      <Badge variant="outline" className="flex items-center gap-1 w-fit">
        {icon}
        {deviceType || 'unknown'}
      </Badge>
    );
  };

  const handleRefresh = () => {
    sounds.click();
    onRefresh();
  };

  // Calculer les statistiques
  const totalRecordings = activeRecordings.length;
  const webRecordings = activeRecordings.filter(r => r.device_type === 'web').length;
  const mobileRecordings = activeRecordings.filter(r => r.device_type === 'mobile' || r.device_type === 'ios' || r.device_type === 'android').length;
  const desktopRecordings = activeRecordings.filter(r => r.device_type === 'desktop').length;
  
  const avgDuration = totalRecordings > 0
    ? activeRecordings.reduce((sum, recording) => {
        if (!recording.start_time) return sum;

        try {
          const normalizedDate = normalizeISODate(recording.start_time);
          const start = new Date(normalizedDate);
          if (isNaN(start.getTime())) return sum;

          const now = new Date();
          const diffMs = now.getTime() - start.getTime();

          return sum + Math.max(0, diffMs);
        } catch {
          return sum;
        }
      }, 0) / totalRecordings / 1000 / 60
    : 0;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Actions */}
      <motion.div variants={itemVariants}>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Actualiser
        </Button>
      </motion.div>

      {/* Message d'erreur (ex: Redis indisponible après un rebuild) */}
      {errorMessage && (
        <motion.div variants={itemVariants}>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-900">Service temporairement indisponible</p>
                  <p className="text-sm text-amber-800 mt-1">{errorMessage}</p>
                  <p className="text-xs text-amber-700 mt-2">
                    Les enregistrements en cours sont stockés dans Redis. Un redémarrage du backend réinitialise cette liste ; les nouveaux enregistrements réapparaîtront après un nouvel « Actualiser ».
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Mic className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{totalRecordings}</p>
                  <p className="text-sm text-slate-500">Enregistrements actifs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Monitor className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{webRecordings}</p>
                  <p className="text-sm text-slate-500">Web</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-sky-100 rounded-lg">
                  <Laptop className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{desktopRecordings}</p>
                  <p className="text-sm text-slate-500">Desktop</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Smartphone className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{mobileRecordings}</p>
                  <p className="text-sm text-slate-500">Mobile</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">
                    {isNaN(avgDuration) ? 0 : Math.round(avgDuration)}
                  </p>
                  <p className="text-sm text-slate-500">Durée moyenne (min)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Liste des enregistrements actifs */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Enregistrements en cours</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activeRecordings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Utilisateur</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Appareil</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Titre de la réunion</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Démarré</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Durée</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Session ID</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {activeRecordings.map((recording, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                              <User className="w-4 h-4 text-slate-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {recording.user_name || 'Utilisateur inconnu'}
                              </p>
                              {recording.user_email && (
                                <p className="text-xs text-slate-500">
                                  {recording.user_email}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getDeviceBadge(recording.device_type)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-900">
                            {recording.meeting_title || 'Sans titre'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">
                            {formatDate(recording.start_time)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-slate-400" />
                            <p className="text-sm text-slate-600">
                              {formatDuration(recording.start_time)}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <code className="text-xs text-slate-600">
                            {recording.session_id?.substring(0, 12)}...
                          </code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Mic className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <p className="text-lg font-semibold text-slate-900 mb-2">
                  Aucun enregistrement en cours
                </p>
                <p className="text-sm text-slate-500">
                  Les enregistrements actifs apparaîtront ici en temps réel
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default RecordingsTab;
