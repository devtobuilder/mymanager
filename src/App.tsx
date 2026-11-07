import React, { useEffect, useState, useCallback, useRef } from 'react';
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
      selectThumbnailFile: () => Promise<{
        thumbnailPath: string;
        thumbnailFileName: string;
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
    analyticsUrl: 'https://x.com',
    linked: false,
    lastSyncedAt: null,
    sessionStatus: 'disconnected',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    handle: '',
    profileUrl: 'https://www.linkedin.com',
    uploadUrl: 'https://www.linkedin.com/sharing/compose',
    analyticsUrl: 'https://www.linkedin.com/analytics/creator/content/',
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
    analyticsUrl: 'https://studio.youtube.com/',
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
    analyticsUrl: 'https://www.instagram.com/accounts/insights',
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
    analyticsUrl: 'https://www.tiktok.com/tiktokstudio',
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
  const [hasLoadedInitialStats, setHasLoadedInitialStats] = useState(false);
  const [isLiveRunning, setIsLiveRunning] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [runtimeSeconds, setRuntimeSeconds] = useState(0);
  const [agentLogs, setAgentLogs] = useState<BrowserAgentLog[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      stage: 'browser',
      message: 'Ready to sync LinkedIn, YouTube, Instagram & TikTok.',
    },
  ]);

  const [llmConfig, setLlmConfig] = useState<LlmConfig>({
    ollamaEndpoint: 'http://127.0.0.1:11434',
    model: 'llama3.2',
    headless: true,
    livePollingIntervalSec: 25,
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

  const accountsRef = useRef<PlatformAccount[]>(accounts);
  const runtimeSecondsRef = useRef<number>(runtimeSeconds);
  const isSyncingRef = useRef<boolean>(false);

  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    runtimeSecondsRef.current = runtimeSeconds;
  }, [runtimeSeconds]);

  // Poll statistics via headless browser for linked or configured accounts (excluding Twitter/X)
  const pollStatsNow = useCallback(async (overrideAccounts?: PlatformAccount[]) => {
    if (isSyncingRef.current) return;
    const list = Array.isArray(overrideAccounts) ? overrideAccounts : accountsRef.current;
    const activeTargets = list.filter(
      (a) => a.id !== 'twitter' && (a.linked || a.handle.trim().length > 0)
    );
    if (activeTargets.length === 0) return;

    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      if (window.myManagerApi?.pollBrowserStats) {
        const updated = await window.myManagerApi.pollBrowserStats(
          activeTargets.map((a) => a.id)
        );
        setStats(updated);
        setHistory((prev) => [
          ...prev.slice(-19),
          buildTimeSeriesPoint(updated, runtimeSecondsRef.current),
        ]);
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []);

  // Load initial state from Electron IPC and trigger immediate auto-fetch on start
  useEffect(() => {
    const api = window.myManagerApi;
    if (!api) return;

    api.getInitialStats().then((res) => {
      if (res) {
        setStats(res);
        setHistory([buildTimeSeriesPoint(res, 0)]);
      }
    });
    api.getLlmConfig().then((cfg) => cfg && setLlmConfig(cfg));

    api.getAccounts().then((res) => {
      if (res) {
        accountsRef.current = res;
        setAccounts(res);
        // Automatically trigger a refresh on app startup for configured/linked accounts
        pollStatsNow(res).finally(() => {
          setHasLoadedInitialStats(true);
        });
      }
    });

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
  }, [pollStatsNow]);

  // 1-second runtime clock
  useEffect(() => {
    if (!isLiveRunning) return;
    const timer = setInterval(() => {
      setRuntimeSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isLiveRunning]);

  // Randomized 20 to 30 second (20000ms - 30000ms) anti-bot & rate-limit-safe stats polling (paused during video uploads)
  useEffect(() => {
    if (!isLiveRunning || isUploading) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextPoll = () => {
      const jitteredDelayMs = 20000 + Math.floor(Math.random() * 10001); // 20.0s to 30.0s
      timeoutId = setTimeout(async () => {
        if (cancelled || isUploading) return;
        await pollStatsNow();
        if (!cancelled && !isUploading) {
          scheduleNextPoll();
        }
      }, jitteredDelayMs);
    };

    scheduleNextPoll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isLiveRunning, isUploading, pollStatsNow]);

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
            message: 'Published',
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
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Left Sidebar Navigation */}
      <aside className="flex w-72 flex-col justify-between border-r border-slate-200 bg-white p-5">
        <div className="space-y-6">
          {/* App Brand Header */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-slate-900">
                My Manager
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                Social Media Management
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('statistics')}
              className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition ${
                activeTab === 'statistics'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>Statistics</span>
            </button>

            <button
              onClick={() => setActiveTab('upload')}
              className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition ${
                activeTab === 'upload'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Upload className="h-4 w-4" />
              <span>Upload & Replicate Video</span>
            </button>

            <button
              onClick={() => setActiveTab('accounts')}
              className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-xs font-semibold transition ${
                activeTab === 'accounts'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-4 w-4" />
              <span>Linked Social Accounts</span>
            </button>
          </nav>

          {/* Linked Platforms Quick Status List with Brand Icons */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Linked Platforms ({accounts.filter((a) => a.linked).length}/5)
            </div>
            <div className="space-y-1.5">
              {accounts.map((acc) => {
                const meta = PLATFORM_META[acc.id];
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={meta.textClass}>
                        <PlatformIcon platform={acc.id} size={15} />
                      </span>
                      <div>
                        <div className="text-xs font-medium text-slate-800">
                          {acc.name}
                        </div>
                        {acc.handle && (
                          <div className="text-[10px] text-slate-500">{acc.handle}</div>
                        )}
                      </div>
                    </div>
                    <span
                      className={`h-2 w-2 rounded-full ${
                        acc.linked ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Activity Log Mini Console */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-2">
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-slate-500" />
              Activity Log
            </span>
          </div>
          <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1 text-[11px] font-mono">
            {agentLogs.slice(0, 6).map((log) => (
              <div key={log.id} className="text-slate-600 leading-tight">
                <span className="text-slate-400">[{log.timestamp}]</span>{' '}
                {log.platform && (
                  <span className={`inline-flex items-center mr-1 ${PLATFORM_META[log.platform].textClass}`}>
                    <PlatformIcon platform={log.platform} size={10} />
                  </span>
                )}
                <span className="text-slate-700">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {activeTab === 'statistics' && 'Statistics'}
              {activeTab === 'upload' && 'Upload & Replicate Video'}
              {activeTab === 'accounts' && 'Linked Social Accounts'}
            </h2>
          </div>
        </header>

        {activeTab === 'statistics' && (
          <StatisticsTab
            accounts={accounts}
            stats={stats}
            history={history}
            isLiveRunning={isLiveRunning}
            isLoadingInitial={!hasLoadedInitialStats}
            onToggleLive={() => {
              setIsLiveRunning((prev) => {
                const next = !prev;
                if (next) {
                  setRuntimeSeconds(0);
                  pollStatsNow();
                } else {
                  setRuntimeSeconds(0);
                }
                return next;
              });
            }}
            onManualSync={() => pollStatsNow()}
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
