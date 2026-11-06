import { contextBridge, ipcRenderer } from 'electron';
import {
  PlatformId,
  VideoUploadPayload,
  BrowserAgentLog,
  PlatformUploadStatus,
  LlmConfig,
} from './types';

contextBridge.exposeInMainWorld('myManagerApi', {
  getAccounts: () => ipcRenderer.invoke('accounts:get'),
  updateAccountHandle: (platformId: PlatformId, handle: string) =>
    ipcRenderer.invoke('accounts:update-handle', platformId, handle),
  toggleAccountLink: (platformId: PlatformId, handle?: string) =>
    ipcRenderer.invoke('accounts:toggle-link', platformId, handle),
  openLoginSession: (platformId: PlatformId, handle?: string) =>
    ipcRenderer.invoke('accounts:open-login', platformId, handle),
  getInitialStats: () => ipcRenderer.invoke('stats:get-initial'),
  pollBrowserStats: (platforms?: PlatformId[]) =>
    ipcRenderer.invoke('stats:poll-browser', platforms),
  selectVideoFile: () => ipcRenderer.invoke('video:select-file'),
  selectThumbnailFile: () => ipcRenderer.invoke('thumbnail:select-file'),
  replicateVideoUpload: (payload: VideoUploadPayload) =>
    ipcRenderer.invoke('video:upload-replicate', payload),
  getLlmConfig: () => ipcRenderer.invoke('llm:get-config'),
  updateLlmConfig: (cfg: Partial<LlmConfig>) =>
    ipcRenderer.invoke('llm:update-config', cfg),
  onAgentLog: (cb: (log: BrowserAgentLog) => void) => {
    const listener = (_event: any, log: BrowserAgentLog) => cb(log);
    ipcRenderer.on('agent:log', listener);
    return () => ipcRenderer.removeListener('agent:log', listener);
  },
  onUploadStatus: (cb: (status: PlatformUploadStatus) => void) => {
    const listener = (_event: any, status: PlatformUploadStatus) => cb(status);
    ipcRenderer.on('upload:status', listener);
    return () => ipcRenderer.removeListener('upload:status', listener);
  },
});
