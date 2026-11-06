import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  Upload,
  Link2,
  Terminal,
  Sparkles,
} from 'lucide-react';
import {
  BrowserAgentLog,
  LlmConfig,
  PlatformAccount,
  PlatformId,
  PlatformStats,
  PlatformUploadStatus,
  TimeSeriesPoint,
  UploadJob,
  VideoUploadPayload,
} from './types';
import { PlatformIcon, PLATFORM_META } from './components/PlatformIcons';
import { StatisticsTab } from './components/StatisticsTab';
import { UploadVideoTab } from './components/UploadVideoTab';
import { AccountsTab } from './components/AccountsTab';

declare global {
  interface Window {
    myManagerApi?: {
      getAccounts: () => Promise<PlatformAccount[]>;
      updateAccountHandle: (platformId: PlatformId, handle: string) => Promise<PlatformAccount[]>;
      toggleAccountLink: (platformId: PlatformId, handle?: string) => Promise<PlatformAccount[]>;
      openLoginSession: (platformId: PlatformId, handle?: string) => Promise<PlatformAccount[]>;
      getInitialStats: () => Promise<Record<PlatformId, PlatformStats>>;
      pollBrowserStats: (platforms?: PlatformId[]) => Promise<Record<PlatformId, PlatformStats>>;
      selectVideoFile: () => Promise<{
        videoPath: string;
        videoFileName: string;
        videoSizeBytes: number;
      } | null>;
      replicateVideoUpload: (payload: VideoUploadPayload) => Promise<boolean>;
      getLlmConfig: () => Promise<LlmConfig>;
      updateLlmConfig: (cfg: Partial<LlmConfig>) => Promise<LlmConfig>;
      onAgentLog: (cb: (log: BrowserAgentLog) => void) => () => void;
      onUploadStatus: (cb: (status: PlatformUploadStatus) => void) => () => void;
    };
  }
}

const DEFAULT_ACCOUNTS: PlatformAccount[] = [
  {
    id: 'twitter',
    name: 'Twitter / X',
    handle: '',
    profileUrl: 'https://x.com',
    uploadUrl: 'https://x.com/compose/post',
    analyticsUrl: 'https://analytics.x.com',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    handle: '',
    profileUrl: 'https://www.linkedin.com',
    uploadUrl: 'https://www.linkedin.com/feed/',
    analyticsUrl: 'https://www.linkedin.com/analytics/',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    handle: '',
    profileUrl: 'https://www.youtube.com',
    uploadUrl: 'https://studio.youtube.com',
    analyticsUrl: 'https://studio.youtube.com/channel/analytics',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    handle: '',
    profileUrl: 'https://www.instagram.com',
    uploadUrl: 'https://www.instagram.com',
    analyticsUrl: 'https://www.instagram.com/accounts/insights/',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    handle: '',
    profileUrl: 'https://www.tiktok.com',
    uploadUrl: 'https://www.tiktok.com/tiktokstudio/upload',
    analyticsUrl: 'https://www.tiktok.com/tiktokstudio/analytics',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
];

const DEFAULT_STATS: Record<PlatformId, PlatformStats> = {
  twitter: {
    platform: 'twitter',
    likes: 0,
    comments: 0,
    views: 0,
    followers: 0,
    engagementRate: 0,
    updatedAt: new Date().toISOString(),
  },
  linkedin: {
    platform: 'linkedin',
    likes: 0,
    comments: 0,
    views: 0,
    followers: 0,
    engagementRate: 0,
    updatedAt: new Date().toISOString(),
  },
  youtube: {
    platform: 'youtube',
    likes: 0,
    comments: 0,
    views: 0,
    followers: 0,
    engagementRate: 0,
    updatedAt: new Date().toISOString(),
  },
  instagram: {
    platform: 'instagram',
    likes: 0,
    comments: 0,
    views: 0,
    followers: 0,
    engagementRate: 0,
    updatedAt: new Date().toISOString(),
  },
  tiktok: {
    platform: 'tiktok',
    likes: 0,
    comments: 0,
    views: 0,
    followers: 0,
    engagementRate: 0,
    updatedAt: new Date().toISOString(),
  },
};

function buildTimeSeriesPoint(
  statsMap: Record<PlatformId, PlatformStats>,
  elapsedSeconds: number
): TimeSeriesPoint {
  const totalLikes = Object.values(statsMap).reduce((s, x) => s + x.likes, 0);
  const totalComments = Object.values(statsMap).reduce((s, x) => s + x.comments, 0);
  const totalViews = Object.values(statsMap).reduce((s, x) => s + x.views, 0);
  return {
    timestamp: new Date().toLocaleTimeString([], { hour12: false }),
    elapsedSeconds,
    totalLikes,
    totalComments,
    totalViews,
    twitterViews: statsMap.twitter.views,
    linkedinViews: statsMap.linkedin.views,
    youtubeViews: statsMap.youtube.views,
    instagramViews: statsMap.instagram.views,
    tiktokViews: statsMap.tiktok.views,
    twitterLikes: statsMap.twitter.likes,
    linkedinLikes: statsMap.linkedin.likes,
    youtubeLikes: statsMap.youtube.likes,
    instagramLikes: statsMap.instagram.likes,
    tiktokLikes: statsMap.tiktok.likes,
    twitterComments: statsMap.twitter.comments,
    linkedinComments: statsMap.linkedin.comments,
    youtubeComments: statsMap.youtube.comments,
    instagramComments: statsMap.instagram.comments,
    tiktokComments: statsMap.tiktok.comments,
  };
}

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'statistics' | 'upload' | 'accounts'>('statistics');
  const [accounts, setAccounts] = useState<PlatformAccount[]>(DEFAULT_ACCOUNTS);
  const [stats, setStats] = useState<Record<PlatformId, PlatformStats>>(DEFAULT_STATS);
  const [history, setHistory] = useState<TimeSeriesPoint[]>(() => [
    buildTimeSeriesPoint(DEFAULT_STATS, 0),
  ]);
  const [isLiveRunning, setIsLiveRunning] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [runtimeSeconds, setRuntimeSeconds] = useState(0);
  const [agentLogs, setAgentLogs] = useState<BrowserAgentLog[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      stage: 'browser',
      message:
        'Initialized Local LLM (Ollama) + Playwright Persistent Browser Engine for Twitter/X, LinkedIn, YouTube, Instagram & TikTok.',
    },
  ]);

  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    ollamaEndpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    headless: true,
    livePollingIntervalSec: 10,
  });

  const [activeStatuses, setActiveStatuses] = useState<
    Record<PlatformId, PlatformUploadStatus>
  >({
    twitter: { platform: 'twitter', status: 'queued', progress: 0, message: 'Ready' },
    linkedin: { platform: 'linkedin', status: 'queued', progress: 0, message: 'Ready' },
    youtube: { platform: 'youtube', status: 'queued', progress: 0, message: 'Ready' },
    instagram: { platform: 'instagram', status: 'queued', progress: 0, message: 'Ready' },
    tiktok: { platform: 'tiktok', status: 'queued', progress: 0, message: 'Ready' },
  });
  const [uploadHistory, setUploadHistory] = useState<UploadJob[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Load initial state from Electron IPC if available
  useEffect(() => {
    const api = window.myManagerApi;
    if (!api) return;

    api.getAccounts().then((res) => res && setAccounts(res));
    api.getInitialStats().then((res) => {
      if (res) {
        setStats(res);
        setHistory([buildTimeSeriesPoint(res, 0)]);
      }
    });
    api.getLlmConfig().then((cfg) => cfg && setLlmConfig(cfg));

    const offLog = api.onAgentLog((log) => {
      setAgentLogs((prev) => [log, ...prev.slice(0, 39)]);
    });

    const offUpload = api.onUploadStatus((st) => {
      setActiveStatuses((prev) => ({ ...prev, [st.platform]: st }));
    });

    return () => {
      offLog();
      offUpload();
    };
  }, []);

  // Poll statistics via local LLM browser for linked or configured accounts
  const pollStatsNow = useCallback(async () => {
    const activeTargets = accounts.filter((a) => a.linked || a.handle.trim().length > 0);
    if (activeTargets.length === 0) return;

    setIsSyncing(true);
    try {
      if (window.myManagerApi?.pollBrowserStats) {
        const updated = await window.myManagerApi.pollBrowserStats(
          activeTargets.map((a) => a.id)
        );
        setStats(updated);
        setHistory((prev) => [...prev.slice(-19), buildTimeSeriesPoint(updated, runtimeSeconds)]);
      }
    } finally {
      setIsSyncing(false);
    }
  }, [accounts, runtimeSeconds]);

  // 1-second runtime clock
  useEffect(() => {
    if (!isLiveRunning) return;
    const timer = setInterval(() => {
      setRuntimeSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveRunning]);

  // Randomized 9 to 11 second (9000ms - 11000ms) anti-bot & rate-limit-safe stats polling
  useEffect(() => {
    if (!isLiveRunning) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextPoll = () => {
      const jitteredDelayMs = 9000 + Math.floor(Math.random() * 2001); // 9.0s to 11.0s
      timeoutId = setTimeout(async () => {
        if (cancelled) return;
        await pollStatsNow();
        if (!cancelled) {
          scheduleNextPoll();
        }
      }, jitteredDelayMs);
    };

    scheduleNextPoll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isLiveRunning, pollStatsNow]);

  const handleUpdateHandle = async (platformId: PlatformId, handle: string) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === platformId ? { ...a, handle } : a))
    );
    if (window.myManagerApi?.updateAccountHandle) {
      await window.myManagerApi.updateAccountHandle(platformId, handle);
    }
  };

  const handleToggleLink = async (platformId: PlatformId, handle?: string) => {
    if (window.myManagerApi?.toggleAccountLink) {
      const updated = await window.myManagerApi.toggleAccountLink(platformId, handle);
      setAccounts(updated);
    } else {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === platformId
            ? { ...a, linked: !a.linked, handle: handle ?? a.handle }
            : a
        )
      );
    }
  };

  const handleOpenLoginSession = async (platformId: PlatformId, handle?: string) => {
    if (window.myManagerApi?.openLoginSession) {
      const updated = await window.myManagerApi.openLoginSession(platformId, handle);
      if (updated) setAccounts(updated);
    }
  };

  const handleStartUpload = async (payload: VideoUploadPayload) => {
    setIsUploading(true);
    try {
      if (window.myManagerApi?.replicateVideoUpload) {
        await window.myManagerApi.replicateVideoUpload(payload);
      } else {
        // Browser preview fallback animation
        for (const pid of payload.platforms) {
          setActiveStatuses((prev) => ({
            ...prev,
            [pid]: {
              platform: pid,
              status: 'completed',
              progress: 100,
              message: `Published "${payload.title}"`,
            },
          }));
        }
      }

      const newJob: UploadJob = {
        jobId: `job-${Date.now()}`,
        title: payload.title,
        description: payload.description,
        videoFileName: payload.videoFileName,
        createdAt: new Date().toLocaleTimeString(),
        results: payload.platforms.reduce((acc, pid) => {
          acc[pid] = {
            platform: pid,
            status: 'completed',
            progress: 100,
            message: 'Published via Local LLM Browser',
          };
          return acc;
        }, {} as Record<PlatformId, PlatformUploadStatus>),
      };
      setUploadHistory((prev) => [newJob, ...prev]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpdateLlmConfig = async (cfg: Partial<LlmConfig>) => {
    if (window.myManagerApi?.updateLlmConfig) {
      const next = await window.myManagerApi.updateLlmConfig(cfg);
      if (next) setLlmConfig(next);
    } else {
      setLlmConfig((prev) => ({ ...prev, ...cfg }));
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Left Sidebar Navigation */}
      <aside className="flex w-72 flex-col justify-between border-r border-slate-800/90 bg-slate-900/75 p-5">
        <div className="space-y-6">
          {/* App Brand Header */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold tracking-tight text-white">
                My Manager
              </h1>
              <p className="text-[11px] font-medium text-indigo-400">
                Local LLM Social Command Center
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('statistics')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition ${
                activeTab === 'statistics'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Live Statistics & Graphs</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition ${
                activeTab === 'upload'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload & Replicate Video</span>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-xs font-bold transition ${
                activeTab === 'accounts'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              <Link2 className="h-4 w-4" />
              <span>Linked Social Accounts</span>
            </button>
          </nav>

          {/* Linked Platforms Quick Status List with Brand Icons */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Linked Platforms ({accounts.filter((a) => a.linked).length}/5)
            </div>
            <div className="space-y-1.5">
              {accounts.map((acc) => {
                const meta = PLATFORM_META[acc.id];
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={meta.textClass}>
                        <PlatformIcon platform={acc.id} size={16} />
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-slate-200">
                          {acc.name}
                        </div>
                        <div className="text-[10px] text-slate-500">{acc.handle}</div>
                      </div>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        acc.linked ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Live Local LLM Browser Telemetry Mini Console */}
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-indigo-400" />
              LLM Browser Agent Feed
            </span>
            <span className="text-[10px] text-emerald-400">{llmConfig.model}</span>
          </div>
          <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-[11px] font-mono">
            {agentLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="text-slate-400 leading-tight">
                <span className="text-slate-600">[{log.timestamp}]</span>{' '}
                {log.platform && (
                  <span className={`inline-flex items-center mr-1 ${PLATFORM_META[log.platform].textClass}`}>
                    <PlatformIcon platform={log.platform} size={10} />
                  </span>
                )}
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        {/* Top Bar with All 5 Social Media Icons */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <h2 className="text-2xl font-extrabold text-white">
              {activeTab === 'statistics' && 'Live Runtime Statistics & Telemetry Graphs'}
              {activeTab === 'upload' && 'Cross-Platform Video Upload & Replication'}
              {activeTab === 'accounts' && 'Social Media Account Linking & LLM Browser Config'}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {accounts.map((acc) => {
              const meta = PLATFORM_META[acc.id];
              return (
                <button
                  key={acc.id}
                  onClick={() => setActiveTab('accounts')}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    acc.linked
                      ? `${meta.bgClass} ${meta.borderClass} ${meta.textClass}`
                      : 'border-slate-800 bg-slate-900 text-slate-500'
                  }`}
                  title={`${acc.name} (${acc.linked ? 'Linked' : 'Unlinked'})`}
                >
                  <PlatformIcon platform={acc.id} size={14} />
                  <span className="hidden xl:inline">{acc.name}</span>
                </button>
              );
            })}
          </div>
        </header>

        {activeTab === 'statistics' && (
          <StatisticsTab
            accounts={accounts}
            stats={stats}
            history={history}
            isLiveRunning={isLiveRunning}
            onToggleLive={() => setIsLiveRunning((v) => !v)}
            onManualSync={pollStatsNow}
            isSyncing={isSyncing}
            runtimeSeconds={runtimeSeconds}
          />
        )}

        {activeTab === 'upload' && (
          <UploadVideoTab
            accounts={accounts}
            onStartUpload={handleStartUpload}
            activeStatuses={activeStatuses}
            uploadHistory={uploadHistory}
            isUploading={isUploading}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsTab
            accounts={accounts}
            onUpdateHandle={handleUpdateHandle}
            onToggleLink={handleToggleLink}
            onOpenLoginSession={handleOpenLoginSession}
            llmConfig={llmConfig}
            onUpdateLlmConfig={handleUpdateLlmConfig}
          />
        )}
      </main>
    </div>
  );
};
export default App;
