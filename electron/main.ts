import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { LocalLlmBrowserAgent } from './browserAgent';
import {
  PlatformAccount,
  PlatformId,
  PlatformStats,
  VideoUploadPayload,
  LlmConfig,
} from './types';

let mainWindow: BrowserWindow | null = null;
let browserAgent: LocalLlmBrowserAgent | null = null;

const initialAccounts: PlatformAccount[] = [
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

const statsStore: Record<PlatformId, PlatformStats> = {
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

let accountsStore: PlatformAccount[] = [...initialAccounts];
let stateFilePath = '';

function loadPersistedAccounts() {
  try {
    if (stateFilePath && fs.existsSync(stateFilePath)) {
      const raw = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      if (Array.isArray(raw.accounts)) {
        accountsStore = initialAccounts.map((def) => {
          const saved = raw.accounts.find((a: PlatformAccount) => a.id === def.id);
          return saved ? { ...def, handle: saved.handle || '', linked: !!saved.linked, sessionStatus: saved.linked ? 'connected' : 'disconnected', lastSyncedAt: saved.lastSyncedAt || null } : def;
        });
      }
    }
  } catch {
    // ignore corrupt state file
  }
}

function savePersistedAccounts() {
  try {
    if (!stateFilePath) return;
    fs.writeFileSync(
      stateFilePath,
      JSON.stringify({ accounts: accountsStore }, null, 2),
      'utf-8'
    );
  } catch {
    // ignore write error
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 740,
    title: 'My Manager — Social Media Management App',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  stateFilePath = path.join(app.getPath('userData'), 'mymanager-accounts.json');
  loadPersistedAccounts();

  browserAgent = new LocalLlmBrowserAgent(app.getPath('userData'), (log) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:log', log);
    }
  });

  ipcMain.handle('accounts:get', async () => accountsStore);

  ipcMain.handle(
    'accounts:update-handle',
    async (_event, platformId: PlatformId, handle: string) => {
      accountsStore = accountsStore.map((acc) =>
        acc.id === platformId ? { ...acc, handle } : acc
      );
      savePersistedAccounts();
      return accountsStore;
    }
  );

  ipcMain.handle(
    'accounts:toggle-link',
    async (_event, platformId: PlatformId, handle?: string) => {
      accountsStore = accountsStore.map((acc) => {
        if (acc.id !== platformId) return acc;
        const nextLinked = !acc.linked;
        if (!nextLinked) {
          statsStore[platformId] = {
            platform: platformId,
            likes: 0,
            comments: 0,
            views: 0,
            followers: 0,
            engagementRate: 0,
            updatedAt: new Date().toISOString(),
          };
        }
        return {
          ...acc,
          linked: nextLinked,
          handle: handle !== undefined ? handle : acc.handle,
          lastSyncedAt: nextLinked ? new Date().toISOString() : null,
          sessionStatus: nextLinked ? 'connected' : 'disconnected',
        };
      });
      savePersistedAccounts();
      return accountsStore;
    }
  );

  ipcMain.handle('accounts:open-login', async (_event, platformId: PlatformId, handle?: string) => {
    const account = accountsStore.find((a) => a.id === platformId);
    if (!account || !browserAgent) return accountsStore;
    const updatedAccount = handle !== undefined ? { ...account, handle } : account;
    await browserAgent.openLoginSession(updatedAccount);
    accountsStore = accountsStore.map((a) =>
      a.id === platformId
        ? {
            ...a,
            handle: handle !== undefined ? handle : a.handle,
            linked: true,
            sessionStatus: 'connected',
            lastSyncedAt: new Date().toISOString(),
          }
        : a
    );
    savePersistedAccounts();
    return accountsStore;
  });

  ipcMain.handle('stats:get-initial', async () => statsStore);

  let pollInFlight: Promise<Record<PlatformId, PlatformStats>> | null = null;

  ipcMain.handle('stats:poll-browser', async (_event, platforms?: PlatformId[]) => {
    if (!browserAgent) return statsStore;
    if (pollInFlight) {
      return await pollInFlight;
    }

    pollInFlight = (async () => {
      try {
        // Twitter / X is excluded from stats tracking (kept for uploads only)
        const statEligible = accountsStore.filter((a) => a.id !== 'twitter');
        const linkedTargets = statEligible.filter(
          (a) => a.linked && (!platforms || platforms.includes(a.id))
        );
        const targets =
          linkedTargets.length > 0
            ? linkedTargets
            : statEligible.filter(
                (a) =>
                  a.handle.trim().length > 0 &&
                  (!platforms || platforms.includes(a.id))
              );

        for (const acc of targets) {
          statsStore[acc.id] = await browserAgent!.scrapePlatformStats(
            acc,
            statsStore[acc.id]
          );
        }
        return statsStore;
      } finally {
        await browserAgent?.closeContextIfHeadless();
        pollInFlight = null;
      }
    })();

    return await pollInFlight;
  });

  ipcMain.handle('video:select-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Video to Replicate Across Linked Platforms',
      filters: [
        { name: 'Videos', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const stat = fs.statSync(filePath);
    return {
      videoPath: filePath,
      videoFileName: path.basename(filePath),
      videoSizeBytes: stat.size,
    };
  });

  ipcMain.handle('thumbnail:select-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Video Thumbnail / Cover Image',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    return {
      thumbnailPath: filePath,
      thumbnailFileName: path.basename(filePath),
    };
  });

  ipcMain.handle('video:upload-replicate', async (_event, payload: VideoUploadPayload) => {
    if (!browserAgent) return false;
    await browserAgent.replicateVideoUpload(payload, accountsStore, (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('upload:status', status);
      }
    });
    return true;
  });

  ipcMain.handle('llm:get-config', async () => browserAgent?.getConfig());
  ipcMain.handle('llm:update-config', async (_event, cfg: Partial<LlmConfig>) => {
    browserAgent?.updateConfig(cfg);
    return browserAgent?.getConfig();
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  await browserAgent?.closeContext();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
