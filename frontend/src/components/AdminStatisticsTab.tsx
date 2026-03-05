/**
 * AdminStatisticsTab - Onglet des statistiques avancées pour l'admin
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Users,
  TrendingUp,
  Clock,
  Calendar,
  FileText,
  Mic2,
  Building2,
  GraduationCap,
  Briefcase,
  User,
  Video,
  Megaphone,
  Search,
  Newspaper,
  MessageCircle,
  Zap,
  RefreshCw,
  Loader2,
  ClipboardCheck,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import apiClient from '../services/apiClient';
import { logger } from '@/utils/logger';

interface AdvancedStats {
  onboarding: {
    completed: number;
    total_users: number;
    completion_rate: number;
    usage_distribution: Record<string, number>;
    status_distribution: Record<string, number>;
    source_distribution: Record<string, number>;
  };
  registrations: {
    by_day: Array<{ date: string; count: number }>;
  };
  meetings: {
    today: { count: number; total_duration: number; avg_duration: number };
    week: { count: number; total_duration: number; avg_duration: number };
    month: { count: number; total_duration: number; avg_duration: number };
    by_day: Array<{ date: string; count: number; total_duration: number }>;
  };
  transcriptions: { completed: number; pending: number };
  summaries: { completed: number; pending: number };
  top_users: Array<{
    id: string;
    email: string;
    full_name: string;
    meeting_count: number;
    total_duration: number;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const USAGE_LABELS: Record<string, string> = {
  meetings: 'Réunions pro',
  courses: 'Cours/Conférences',
  interviews: 'Interviews',
  notes: 'Notes perso',
  other: 'Autre',
};

const STATUS_LABELS: Record<string, string> = {
  student: 'Étudiant',
  employee: 'Salarié',
  freelance: 'Indépendant',
  company: 'Entreprise',
};

const SOURCE_LABELS: Record<string, string> = {
  social: 'Réseaux sociaux',
  wordofmouth: 'Bouche à oreille',
  search: 'Google',
  press: 'Presse',
  other: 'Autre',
};

const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ''}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 12 } },
};

const AdminStatisticsTab: React.FC = () => {
  const [stats, setStats] = useState<AdvancedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<AdvancedStats>('/admin/statistics/advanced');
      setStats(data);
    } catch (err) {
      logger.error('Error loading advanced stats:', err);
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-red-500">{error}</p>
        <Button onClick={loadStats} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Réessayer
        </Button>
      </div>
    );
  }

  // Préparer les données pour les graphiques
  const usageData = Object.entries(stats.onboarding.usage_distribution).map(([key, value]) => ({
    name: USAGE_LABELS[key] || key,
    value,
  }));

  const statusData = Object.entries(stats.onboarding.status_distribution).map(([key, value]) => ({
    name: STATUS_LABELS[key] || key,
    value,
  }));

  const sourceData = Object.entries(stats.onboarding.source_distribution).map(([key, value]) => ({
    name: SOURCE_LABELS[key] || key,
    value,
  }));

  return (
    <div className="space-y-6">
      {/* Header avec bouton refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Statistiques avancées</h2>
        <Button onClick={loadStats} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
          Actualiser
        </Button>
      </div>

      {/* Stats rapides - Réunions par période */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Aujourd'hui</p>
                <p className="text-3xl font-bold text-slate-900">{stats.meetings.today.count}</p>
                <p className="text-xs text-slate-400">réunions</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Durée moy.</p>
                <p className="text-lg font-semibold text-blue-600">
                  {formatDuration(stats.meetings.today.avg_duration)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Cette semaine</p>
                <p className="text-3xl font-bold text-slate-900">{stats.meetings.week.count}</p>
                <p className="text-xs text-slate-400">réunions</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Durée moy.</p>
                <p className="text-lg font-semibold text-emerald-600">
                  {formatDuration(stats.meetings.week.avg_duration)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Ce mois</p>
                <p className="text-3xl font-bold text-slate-900">{stats.meetings.month.count}</p>
                <p className="text-xs text-slate-400">réunions</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">Durée moy.</p>
                <p className="text-lg font-semibold text-purple-600">
                  {formatDuration(stats.meetings.month.avg_duration)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Graphiques d'évolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Évolution des inscriptions */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-5 h-5 text-blue-500" />
              Inscriptions (30 derniers jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={stats.registrations.by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  labelFormatter={(label) => `Date: ${formatDate(label as string)}`}
                  formatter={(value: number) => [`${value} inscriptions`, 'Inscriptions']}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Évolution des réunions */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              Réunions (30 derniers jours)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.meetings.by_day}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tickFormatter={formatDate} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  labelFormatter={(label) => `Date: ${formatDate(label as string)}`}
                  formatter={(value: number, name: string) => [
                    name === 'count' ? `${value} réunions` : formatDuration(value),
                    name === 'count' ? 'Réunions' : 'Durée totale'
                  ]}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Statistiques du questionnaire d'onboarding */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="w-5 h-5 text-purple-500" />
            Questionnaire d'onboarding
            <Badge className="ml-2 bg-purple-100 text-purple-700">
              {stats.onboarding.completion_rate}% complété
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Répartition par usage */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Usage principal</h4>
              {usageData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={usageData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {usageData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">Aucune donnée</p>
              )}
            </div>

            {/* Répartition par statut */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Statut</h4>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">Aucune donnée</p>
              )}
            </div>

            {/* Répartition par source */}
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-3">Source de découverte</h4>
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {sourceData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      iconSize={10}
                      wrapperStyle={{ fontSize: '11px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">Aucune donnée</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats transcriptions/synthèses + Top utilisateurs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transcriptions et synthèses */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-5 h-5 text-amber-500" />
              Transcriptions & Synthèses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 rounded-xl">
                <p className="text-sm text-blue-600 font-medium">Transcriptions</p>
                <p className="text-2xl font-bold text-blue-700">{stats.transcriptions.completed}</p>
                <p className="text-xs text-blue-500">complétées</p>
                {stats.transcriptions.pending > 0 && (
                  <Badge className="mt-2 bg-blue-100 text-blue-600">
                    {stats.transcriptions.pending} en cours
                  </Badge>
                )}
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl">
                <p className="text-sm text-emerald-600 font-medium">Synthèses</p>
                <p className="text-2xl font-bold text-emerald-700">{stats.summaries.completed}</p>
                <p className="text-xs text-emerald-500">complétées</p>
                {stats.summaries.pending > 0 && (
                  <Badge className="mt-2 bg-emerald-100 text-emerald-600">
                    {stats.summaries.pending} en cours
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top utilisateurs */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="w-5 h-5 text-rose-500" />
              Top 10 utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {stats.top_users.map((user, index) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                      index === 0 && "bg-amber-100 text-amber-700",
                      index === 1 && "bg-slate-200 text-slate-700",
                      index === 2 && "bg-orange-100 text-orange-700",
                      index > 2 && "bg-slate-100 text-slate-500"
                    )}>
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900 truncate max-w-[150px]">
                        {user.full_name || user.email.split('@')[0]}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[150px]">{user.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{user.meeting_count}</p>
                    <p className="text-xs text-slate-400">{formatDuration(user.total_duration)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminStatisticsTab;
