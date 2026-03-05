/**
 * ServicesMonitoringTab - Onglet de monitoring des services
 * Refait avec la même DA que ProfilePage et SettingsPage (Tailwind + shadcn/ui + framer-motion)
 */

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Gauge,
  Server,
  Loader2,
} from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import sounds from '../utils/soundDesign';

interface ServiceStatus {
  service: string;
  status: 'healthy' | 'warning' | 'error';
  response_time_ms: number;
  message: string;
  timestamp: string;
}

interface ServicesMonitoringData {
  overall_status: 'healthy' | 'warning' | 'error';
  overall_score: number;
  total_check_time_ms: number;
  services: ServiceStatus[];
  summary: {
    healthy: number;
    warning: number;
    error: number;
    total: number;
  };
  timestamp: string;
}

interface ServicesMonitoringTabProps {
  servicesData: ServicesMonitoringData | null;
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

const ServicesMonitoringTab: React.FC<ServicesMonitoringTabProps> = ({
  servicesData,
  loading,
  onRefresh,
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge variant="default" className="bg-emerald-500 text-white">Sain</Badge>;
      case 'warning':
        return <Badge variant="default" className="bg-amber-500 text-white">Avertissement</Badge>;
      case 'error':
        return <Badge variant="destructive">Erreur</Badge>;
      default:
        return <Badge variant="secondary">Inconnu</Badge>;
    }
  };

  const getResponseTimeColor = (timeMs: number) => {
    if (timeMs < 100) return 'text-emerald-600';
    if (timeMs < 500) return 'text-amber-600';
    return 'text-red-600';
  };

  const formatTimestamp = (timestamp: string | null | undefined) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }
      return date.toLocaleString('fr-FR');
    } catch {
      return 'Date invalide';
    }
  };

  const handleRefresh = () => {
    sounds.click();
    onRefresh();
  };

  if (!servicesData && !loading) {
    return (
      <div className="space-y-6">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
              <p className="text-sm text-blue-900">
                Aucune donnée de monitoring disponible. Cliquez sur "Actualiser" pour vérifier l'état des services.
              </p>
            </div>
            <Button onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Actualiser
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {servicesData && (
            <p className="text-sm text-slate-500">
              Dernière mise à jour: {formatTimestamp(servicesData.timestamp)}
            </p>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* État global */}
        <motion.div variants={itemVariants} className="md:col-span-2">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5 text-blue-500" />
                État des Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              {servicesData ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(servicesData.overall_status)}
                    <p className="text-3xl font-bold text-slate-900">
                      {servicesData.overall_score}%
                    </p>
                    {getStatusBadge(servicesData.overall_status)}
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className={cn(
                        "h-2 rounded-full transition-all",
                        servicesData.overall_status === 'healthy' && "bg-emerald-500",
                        servicesData.overall_status === 'warning' && "bg-amber-500",
                        servicesData.overall_status === 'error' && "bg-red-500"
                      )}
                      style={{ width: `${servicesData.overall_score}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-500">
                    Temps de vérification: {servicesData.total_check_time_ms}ms
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Résumé */}
        <motion.div variants={itemVariants}>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Résumé</CardTitle>
            </CardHeader>
            <CardContent>
              {servicesData ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <p className="text-sm text-slate-700">
                      {servicesData.summary.healthy} services OK
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <p className="text-sm text-slate-700">
                      {servicesData.summary.warning} warnings
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600" />
                    <p className="text-sm text-slate-700">
                      {servicesData.summary.error} erreurs
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                    <Server className="w-4 h-4 text-slate-600" />
                    <p className="text-sm font-medium text-slate-900">
                      {servicesData.summary.total} services total
                    </p>
                  </div>
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

      {/* Tableau des services */}
      <motion.div variants={itemVariants}>
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Détail des Services</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500 mr-3" />
                <p className="text-sm text-slate-600">Vérification des services...</p>
              </div>
            ) : servicesData?.services.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-slate-500">Aucun service à afficher</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Service</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Statut</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Temps de réponse</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Message</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Dernière vérification</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {servicesData?.services.map((service, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(service.status)}
                            <p className="text-sm text-slate-900">{service.service}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(service.status)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Gauge className="w-4 h-4 text-slate-400" />
                            <p className={cn("text-sm font-medium", getResponseTimeColor(service.response_time_ms))}>
                              {service.response_time_ms}ms
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-600">{service.message}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-500">
                            {formatTimestamp(service.timestamp)}
                          </p>
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

export default ServicesMonitoringTab;
