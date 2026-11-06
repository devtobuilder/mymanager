import React, { useState } from 'react';
import {
  AreaChart,
  Area,
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
  Pause,
  TrendingUp,
  Cpu,
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
  history,
  isLiveRunning,
  onToggleLive,
  onManualSync,
  isSyncing,
  runtimeSeconds,
}) => {
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | PlatformId>('all');
  const [activeMetric, setActiveMetric] = useState<'views' | 'likes' | 'comments'>('views');

  const linkedAccounts = accounts.filter((a) => a.linked);
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
      {/* Live Runtime Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
            <Activity className="h-6 w-6" />
            {isLiveRunning && (
              <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold text-white">
                Live Runtime Statistics Engine
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                <Cpu className="h-3.5 w-3.5" />
                Local LLM Browser Active
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Autonomous Playwright + Ollama DOM agent extracting real-time Views, Likes & Comments with randomized 9–11s anti-bot jitter
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Live Runtime
            </div>
            <div className="font-mono text-lg font-bold text-emerald-400">
              {formatDuration(runtimeSeconds)}
            </div>
          </div>

          <button
            onClick={onToggleLive}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
              isLiveRunning
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
          >
            {isLiveRunning ? (
              <>
                <Pause className="h-4 w-4" />
                Pause Runtime Stream
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Resume Runtime Stream
              </>
            )}
          </button>

          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'LLM Scraping...' : 'Fetch via LLM Browser Now'}
          </button>
        </div>
      </div>

      {/* Platform Filter Bar with Icons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedPlatform('all')}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition border ${
              selectedPlatform === 'all'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <span>All Linked Platforms ({linkedAccounts.length})</span>
          </button>
          {accounts.map((acc) => {
            const meta = PLATFORM_META[acc.id];
            const active = selectedPlatform === acc.id;
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedPlatform(acc.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition border ${
                  active
                    ? `${meta.bgClass} ${meta.borderClass} ${meta.textClass} shadow-md`
                    : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800/80'
                }`}
              >
                <PlatformIcon platform={acc.id} size={15} className={meta.textClass} />
                <span>{acc.name}</span>
                {!acc.linked && (
                  <span className="rounded bg-slate-800 px-1.5 py-0.2 text-[10px] text-slate-500">
                    Unlinked
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1">
          {(['views', 'likes', 'comments'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setActiveMetric(m)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                activeMetric === m
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Live Aggregate KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Live Total Views
            </span>
            <Eye className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-white tracking-tight">
            {totals.views.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Streaming live across {visibleAccounts.length} platforms</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Live Total Likes
            </span>
            <Heart className="h-5 w-5 text-rose-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-white tracking-tight">
            {totals.likes.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Real-time LLM DOM counter</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Live Total Comments
            </span>
            <MessageSquare className="h-5 w-5 text-amber-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-white tracking-tight">
            {totals.comments.toLocaleString()}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Active comment velocity</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Engagement Rate
            </span>
            <Activity className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-3 text-3xl font-extrabold text-white tracking-tight">
            {avgEngagement}%
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <span>{totals.followers.toLocaleString()} combined followers</span>
          </div>
        </div>
      </div>

      {/* Per-Platform Live Cards with Brand Icons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {accounts.map((acc) => {
          const s = stats[acc.id];
          const meta = PLATFORM_META[acc.id];
          return (
            <div
              key={acc.id}
              className={`rounded-2xl border p-4 transition bg-gradient-to-b ${meta.badgeBg} ${
                acc.linked ? meta.borderClass : 'border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
                  >
                    <PlatformIcon platform={acc.id} size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{acc.name}</div>
                    <div className="text-[11px] text-slate-400">{acc.handle}</div>
                  </div>
                </div>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    acc.linked ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-slate-600'
                  }`}
                  title={acc.linked ? 'Linked & Active' : 'Unlinked'}
                />
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5 text-indigo-400" /> Views
                  </span>
                  <span className="font-mono font-bold text-white">
                    {(s?.views || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Heart className="h-3.5 w-3.5 text-rose-400" /> Likes
                  </span>
                  <span className="font-mono font-bold text-rose-300">
                    {(s?.likes || 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-amber-400" /> Comments
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {(s?.comments || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Live Runtime Graphs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Real-Time Runtime Stream Graph */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Live Runtime Stream — {activeMetric.toUpperCase()} by Platform
              </h3>
              <p className="text-xs text-slate-400">
                Real-time telemetry captured by the local LLM browser session
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {accounts.map((a) => (
                <span
                  key={a.id}
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${PLATFORM_META[a.id].bgClass} ${PLATFORM_META[a.id].borderClass} ${PLATFORM_META[a.id].textClass}`}
                  title={a.name}
                >
                  <PlatformIcon platform={a.id} size={12} />
                </span>
              ))}
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="gradYoutube" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FF0000" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#FF0000" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradTiktok" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradInstagram" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E1306C" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#E1306C" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="timestamp" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey={
                    activeMetric === 'views'
                      ? 'tiktokViews'
                      : activeMetric === 'likes'
                      ? 'tiktokLikes'
                      : 'tiktokComments'
                  }
                  name="TikTok"
                  stroke="#2dd4bf"
                  fill="url(#gradTiktok)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey={
                    activeMetric === 'views'
                      ? 'youtubeViews'
                      : activeMetric === 'likes'
                      ? 'youtubeLikes'
                      : 'youtubeComments'
                  }
                  name="YouTube"
                  stroke="#FF0000"
                  fill="url(#gradYoutube)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey={
                    activeMetric === 'views'
                      ? 'instagramViews'
                      : activeMetric === 'likes'
                      ? 'instagramLikes'
                      : 'instagramComments'
                  }
                  name="Instagram"
                  stroke="#E1306C"
                  fill="url(#gradInstagram)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey={
                    activeMetric === 'views'
                      ? 'twitterViews'
                      : activeMetric === 'likes'
                      ? 'twitterLikes'
                      : 'twitterComments'
                  }
                  name="Twitter / X"
                  stroke="#38bdf8"
                  fillOpacity={0}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey={
                    activeMetric === 'views'
                      ? 'linkedinViews'
                      : activeMetric === 'likes'
                      ? 'linkedinLikes'
                      : 'linkedinComments'
                  }
                  name="LinkedIn"
                  stroke="#0A66C2"
                  fillOpacity={0}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cross-Platform Likes, Comments & Views Comparison Graph */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">
                Cross-Platform Likes & Comments Breakdown
              </h3>
              <p className="text-xs text-slate-400">
                Side-by-side comparison across Twitter, LinkedIn, YouTube, Instagram & TikTok
              </p>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformBarData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Bar dataKey="Likes" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Comments" fill="#f59e0b" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
