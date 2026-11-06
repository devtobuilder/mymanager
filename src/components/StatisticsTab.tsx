import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  Eye,
  Heart,
  MessageSquare,
  RefreshCw,
  Play,
  Square,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  PlatformAccount,
  PlatformId,
  PlatformStats,
  TimeSeriesPoint,
} from '../types';
import { PlatformIcon, PLATFORM_META } from './PlatformIcons';

interface StatisticsTabProps {
  accounts: PlatformAccount[];
  stats: Record<PlatformId, PlatformStats>;
  history: TimeSeriesPoint[];
  isLiveRunning: boolean;
  isLoadingInitial?: boolean;
  onToggleLive: () => void;
  onManualSync: () => void;
  isSyncing: boolean;
  runtimeSeconds: number;
}

function formatDuration(sec: number): string {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [hrs, mins, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export const StatisticsTab: React.FC<StatisticsTabProps> = ({
  accounts,
  stats,
  isLiveRunning,
  isLoadingInitial = false,
  onToggleLive,
  onManualSync,
  isSyncing,
  runtimeSeconds,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | PlatformId>('all');

  // Exclude Twitter / X from tracked statistics (kept for video uploads only)
  const statAccounts = accounts.filter((a) => a.id !== 'twitter');
  const linkedAccounts = statAccounts.filter((a) => a.linked);
  const visibleAccounts =
    selectedPlatform === 'all'
      ? linkedAccounts
      : linkedAccounts.filter((a) => a.id === selectedPlatform);

  const totals = visibleAccounts.reduce(
    (acc, account) => {
      const s = stats[account.id];
      if (!s) return acc;
      acc.views += s.views;
      acc.likes += s.likes;
      acc.comments += s.comments;
      acc.followers += s.followers;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, followers: 0 }
  );

  const avgEngagement =
    totals.views > 0
      ? (((totals.likes + totals.comments) / totals.views) * 100).toFixed(2)
      : '0.00';

  const platformBarData = linkedAccounts.map((acc) => {
    const s = stats[acc.id];
    return {
      name: acc.name,
      platform: acc.id,
      Views: s?.views || 0,
      Likes: s?.likes || 0,
      Comments: s?.comments || 0,
    };
  });

  return (
    <div className="space-y-6 pb-8">
      {/* Statistics Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
            <Activity className="h-5 w-5" />
            {isLiveRunning && (
              <span className="absolute -right-1 -top-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Performance Overview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically refreshes Views, Likes, Comments & Followers every 20–30 seconds when active
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isLiveRunning && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Session Time
              </div>
              <div className="font-mono text-sm font-bold text-slate-900">
                {formatDuration(runtimeSeconds)}
              </div>
            </div>
          )}

          <button
            onClick={onToggleLive}
            title={isLiveRunning ? 'Stop Live Gathering' : 'Start Live Gathering'}
            aria-label={isLiveRunning ? 'Stop Live Gathering' : 'Start Live Gathering'}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              isLiveRunning
                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {isLiveRunning ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
          </button>

          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>

      {/* Platform Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition border ${
              selectedPlatform === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span>All Trackable Platforms ({linkedAccounts.length})</span>
          </button>
          {statAccounts.map((acc) => {
            const meta = PLATFORM_META[acc.id];
            const active = selectedPlatform === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedPlatform(acc.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition border ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <PlatformIcon
                  platform={acc.id}
                  size={14}
                  className={active ? 'text-white' : meta.textClass}
                />
                <span>{acc.name}</span>
                {!acc.linked && (
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] ${
                      active
                        ? 'bg-slate-800 text-slate-300'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Unlinked
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Views
            </span>
            <Eye className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            {isLoadingInitial ? (
              <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
            ) : (
              <div className="text-3xl font-bold text-slate-900 tracking-tight">
                {totals.views.toLocaleString()}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {isLoadingInitial ? (
              <div className="h-3.5 w-36 animate-pulse rounded bg-slate-100" />
            ) : (
              <>
                <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                <span>Across {visibleAccounts.length} tracked platforms</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Likes
            </span>
            <Heart className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            {isLoadingInitial ? (
              <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
            ) : (
              <div className="text-3xl font-bold text-slate-900 tracking-tight">
                {totals.likes.toLocaleString()}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {isLoadingInitial ? (
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100" />
            ) : (
              <>
                <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                <span>Combined likes & reactions</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Comments
            </span>
            <MessageSquare className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            {isLoadingInitial ? (
              <div className="h-9 w-20 animate-pulse rounded-lg bg-slate-200" />
            ) : (
              <div className="text-3xl font-bold text-slate-900 tracking-tight">
                {totals.comments.toLocaleString()}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {isLoadingInitial ? (
              <div className="h-3.5 w-36 animate-pulse rounded bg-slate-100" />
            ) : (
              <>
                <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                <span>Combined comments & replies</span>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Engagement Rate
            </span>
            <Activity className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-3">
            {isLoadingInitial ? (
              <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-200" />
            ) : (
              <div className="text-3xl font-bold text-slate-900 tracking-tight">
                {avgEngagement}%
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            {isLoadingInitial ? (
              <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100" />
            ) : (
              <span>{totals.followers.toLocaleString()} combined followers</span>
            )}
          </div>
        </div>
      </div>

      {/* Per-Platform Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statAccounts.map((acc) => {
          const s = stats[acc.id];
          const meta = PLATFORM_META[acc.id];
          return (
            <div
              key={acc.id}
              className={`rounded-xl border bg-white p-4 shadow-sm transition ${
                acc.linked ? 'border-slate-200' : 'border-slate-200 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 ${meta.textClass}`}
                  >
                    <PlatformIcon platform={acc.id} size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{acc.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {acc.handle || 'Connected'}
                    </div>
                  </div>
                </div>
                <span
                  className={`h-2 w-2 rounded-full ${
                    acc.linked ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                  title={acc.linked ? 'Linked & Active' : 'Unlinked'}
                />
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-slate-400" /> Views
                  </span>
                  {isLoadingInitial ? (
                    <div className="h-4 w-14 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <span className="font-mono font-semibold text-slate-900">
                      {(s?.views || 0).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-slate-400" /> Likes
                  </span>
                  {isLoadingInitial ? (
                    <div className="h-4 w-12 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <span className="font-mono font-semibold text-slate-900">
                      {(s?.likes || 0).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> Comments
                  </span>
                  {isLoadingInitial ? (
                    <div className="h-4 w-10 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <span className="font-mono font-semibold text-slate-900">
                      {(s?.comments || 0).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-slate-400" /> Followers
                  </span>
                  {isLoadingInitial ? (
                    <div className="h-4 w-14 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <span className="font-mono font-semibold text-slate-900">
                      {(s?.followers || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Statistics Comparison Graphs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Views Breakdown Bar Graph */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Cross-Platform Views Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Side-by-side comparison across LinkedIn, YouTube, Instagram & TikTok
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {isLoadingInitial ? (
              <div className="flex h-full w-full items-end justify-between gap-4 px-6 pb-6 pt-4">
                <div className="h-3/5 w-1/4 animate-pulse rounded-t-lg bg-slate-200" />
                <div className="h-4/5 w-1/4 animate-pulse rounded-t-lg bg-slate-200" />
                <div className="h-2/5 w-1/4 animate-pulse rounded-t-lg bg-slate-200" />
                <div className="h-3/4 w-1/4 animate-pulse rounded-t-lg bg-slate-200" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      color: '#0f172a',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Views" fill="#0f172a" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Cross-Platform Likes & Comments Breakdown Bar Graph */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Cross-Platform Likes & Comments Breakdown
              </h3>
              <p className="text-xs text-slate-500">
                Side-by-side comparison across LinkedIn, YouTube, Instagram & TikTok
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            {isLoadingInitial ? (
              <div className="flex h-full w-full items-end justify-between gap-4 px-6 pb-6 pt-4">
                <div className="flex h-4/5 w-1/4 items-end gap-1">
                  <div className="h-full w-1/2 animate-pulse rounded-t-lg bg-slate-300" />
                  <div className="h-3/5 w-1/2 animate-pulse rounded-t-lg bg-slate-200" />
                </div>
                <div className="flex h-3/5 w-1/4 items-end gap-1">
                  <div className="h-full w-1/2 animate-pulse rounded-t-lg bg-slate-300" />
                  <div className="h-2/5 w-1/2 animate-pulse rounded-t-lg bg-slate-200" />
                </div>
                <div className="flex h-2/3 w-1/4 items-end gap-1">
                  <div className="h-full w-1/2 animate-pulse rounded-t-lg bg-slate-300" />
                  <div className="h-1/2 w-1/2 animate-pulse rounded-t-lg bg-slate-200" />
                </div>
                <div className="flex h-3/4 w-1/4 items-end gap-1">
                  <div className="h-full w-1/2 animate-pulse rounded-t-lg bg-slate-300" />
                  <div className="h-3/5 w-1/2 animate-pulse rounded-t-lg bg-slate-200" />
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={platformBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      borderColor: '#e2e8f0',
                      color: '#0f172a',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Likes" fill="#334155" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Comments" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
